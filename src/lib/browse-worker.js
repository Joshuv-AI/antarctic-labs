// Browse-stream worker (2026-11-11 phone load fix): fetches, parses,
// transposes and dedupes the browse stream OFF the main thread.
//
// Why: on Joshua's iPhone the main-thread pipeline (fetch -> JSON.parse
// -> column transpose -> dedupe index, per 20,000-record page) ran in
// multi-second bursts that froze the counter for 14 s at a time and
// tore the page while scrolling — the compositor starved behind the
// stream's own long tasks. In this worker the same work costs the UI
// thread nothing; the main thread only commits the finished chunks
// (dictionary remap + bulk column writes, a few ms per page).
//
// Protocol — main posts:
//   { type: "begin", fp, pageSize, total, apiPage }  start the stream
//   { type: "pause" }                                stop launching fetches
//   { type: "resume" }                               resume launching
//   { type: "reset", cursor }                        resume-after-failure:
//     drop transposed pages at/after the append frontier, reset the
//     dedupe session to it, and restart the pipeline there
// Worker posts back:
//   { type: "base", total, nextCursor, payload }     the bootstrap,
//     transposed as chunk zero (fetched by the worker itself — a
//     cache-hit read of the same immutable file the page loaded)
//   { type: "page", cursor, rawCount, total, nextCursor, payload }
//   { type: "failed", cursor }   a page failed twice (the main thread
//     stops the stream at its frontier, keeping the prefix — the
//     stream's long-standing failure semantics)
//   { type: "error" }            fatal (bootstrap unreadable, worker
//     broken): the main thread takes the stream over itself
//
// Fetch + failure semantics mirror the main-thread pipeline exactly:
// one static-page attempt (when a fingerprint exists) with the
// function-endpoint assembly as its fallback, two attempts per page,
// a 30 s per-fetch deadline, eight pages in flight, pages transposed
// strictly in cursor order.
import { createTransposeSession } from "./catalog-core.js";

const FETCH_TIMEOUT_MS = 30000;
const PIPELINE = 8;

let cfg = null;
let session = null;
let started = false;
let paused = false;
let failedAt = null;
let exhausted = false;
let baseLen = 0;
let baseBody = null;
let baseReady = false;
let fetchCursor = 0;
let transposeCursor = 0;
let inflight = 0;
const rawBuffer = new Map(); // cursor -> raw page body awaiting its turn

function post(msg, transfer) {
  try {
    self.postMessage(msg, transfer || []);
  } catch {
    // The main thread is gone (or the payload was malformed): nothing
    // useful can be said — the main side's fallback covers silence
    // only via its own error paths, so stay quiet.
  }
}

function payloadTransfer(payload) {
  if (!payload) return [];
  const bufs = [
    payload.idBytes.buffer,
    payload.idOff.buffer,
    payload.titleBytes.buffer,
    payload.titleOff.buffer,
  ];
  for (const key of Object.keys(payload.codes || {})) {
    bufs.push(payload.codes[key].buffer);
  }
  return bufs;
}

function fetchJsonOnce(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { signal: ctrl.signal })
    .then((r) => {
      if (!r.ok) throw new Error(`fetch failed: ${url} ${r.status}`);
      return r.json();
    })
    .finally(() => clearTimeout(timer));
}

// One page attempt: the static page when this run has a fingerprint,
// else (and on any static failure) the function endpoint, assembled
// from apiPage-sized subrequests — byte-identical to the main-thread
// browseFetchPageOnce it mirrors.
async function fetchPageOnce(cursor) {
  if (cfg.fp) {
    try {
      const idx = Math.floor(cursor / cfg.pageSize);
      const body = await fetchJsonOnce(
        `/browse-pages/${cfg.fp}/page-${String(idx).padStart(4, "0")}.json`
      );
      if (body && Array.isArray(body.results)) return body;
    } catch {
      // fall through to the function assembly
    }
  }
  try {
    const subs = [];
    for (let c = cursor; c < cursor + cfg.pageSize; c += cfg.apiPage) {
      subs.push(c);
    }
    const bodies = await Promise.all(
      subs.map((c) =>
        fetchJsonOnce(
          `/api/catalog-search?cursor=${c}&pagesize=${cfg.apiPage}`
        ).catch(() => null)
      )
    );
    if (bodies.some((b) => !b || !Array.isArray(b.results))) return null;
    const results = [];
    for (const b of bodies) for (const r of b.results) results.push(r);
    const last = bodies[bodies.length - 1];
    return { total: last.total, results, next_cursor: last.next_cursor };
  } catch {
    return null;
  }
}

async function fetchPage(cursor) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const body = await fetchPageOnce(cursor);
    if (body) return body;
  }
  return null;
}

// Transpose everything that is ready, strictly in cursor order: the
// bootstrap first (it is the store's base), then pages as their raw
// bodies land. Nothing transposes past a failed page — the caller
// keeps only the prefix, so later work would be discarded anyway.
function tryTranspose() {
  if (!baseReady) return;
  if (baseBody) {
    const payload = session.transpose(baseBody, -1);
    baseBody = null;
    post(
      { type: "base", total: null, nextCursor: baseLen, payload },
      payloadTransfer(payload)
    );
  }
  while (rawBuffer.has(transposeCursor)) {
    if (failedAt != null && transposeCursor >= failedAt) return;
    const body = rawBuffer.get(transposeCursor);
    rawBuffer.delete(transposeCursor);
    const cursor = transposeCursor;
    const payload = session.transpose(body.results, cursor);
    post(
      {
        type: "page",
        cursor,
        rawCount: body.results.length,
        total: typeof body.total === "number" ? body.total : null,
        nextCursor: body.next_cursor != null ? body.next_cursor : null,
        payload,
      },
      payloadTransfer(payload)
    );
    transposeCursor =
      body.next_cursor != null
        ? body.next_cursor
        : typeof body.total === "number"
          ? body.total
          : cursor + body.results.length;
    if (body.next_cursor == null || body.results.length === 0) {
      exhausted = true;
    }
  }
}

function pump() {
  if (!started || paused || exhausted || failedAt != null) return;
  while (inflight < PIPELINE) {
    if (cfg.total != null && fetchCursor >= cfg.total) return;
    const cursor = fetchCursor;
    fetchCursor += cfg.pageSize;
    inflight++;
    fetchPage(cursor).then((body) => {
      inflight--;
      if (body == null) {
        if (failedAt == null || cursor < failedAt) {
          failedAt = cursor;
          post({ type: "failed", cursor });
        }
      } else {
        rawBuffer.set(cursor, body);
      }
      tryTranspose();
      pump();
    });
  }
}

async function begin(msg) {
  cfg = {
    fp: msg.fp || null,
    pageSize: msg.pageSize || 2000,
    total: typeof msg.total === "number" ? msg.total : null,
    apiPage: msg.apiPage || 2000,
  };
  session = createTransposeSession(cfg.total || 0);
  started = true;
  // The page pipeline launches IMMEDIATELY at the cursor the main
  // thread names (the resident prefix's length — it gated this start
  // on its own bootstrap read): the first page fetch must never wait
  // on the worker's bootstrap fetch. The base TRANSPOSE still
  // precedes every page transpose inside tryTranspose; only the
  // fetches race ahead.
  fetchCursor = msg.startCursor || 0;
  transposeCursor = fetchCursor;
  pump();
  let boot = null;
  for (let attempt = 0; attempt < 2 && !boot; attempt++) {
    try {
      boot = await fetchJsonOnce("/catalog-bootstrap.json");
    } catch {
      boot = null;
    }
  }
  // The bootstrap the worker read must be the prefix the main thread
  // counted on — a length mismatch means the two sides read different
  // deploys, and the only safe answer is the main-thread pipeline.
  if (!Array.isArray(boot) || boot.length !== (msg.startCursor || 0)) {
    post({ type: "error", stage: "base" });
    return;
  }
  baseBody = boot;
  baseLen = boot.length;
  baseReady = true;
  tryTranspose();
}

self.onmessage = (e) => {
  const m = e.data || {};
  try {
    if (m.type === "begin") {
      if (started) return;
      begin(m).catch(() => post({ type: "error", stage: "begin" }));
    } else if (m.type === "pause") {
      paused = true;
    } else if (m.type === "resume") {
      paused = false;
      pump();
    } else if (m.type === "reset") {
      // Resume after a failure stop: the main thread dropped every
      // buffered page at/after its append frontier, so the session
      // drops its matching transposed chunks (and rebuilds its
      // dedupe index over the committed prefix) before the pipeline
      // restarts at the frontier.
      if (!session) return;
      session.resetTo(m.cursor);
      rawBuffer.clear();
      failedAt = null;
      exhausted = false;
      paused = false;
      fetchCursor = m.cursor;
      transposeCursor = m.cursor;
      pump();
    }
  } catch {
    post({ type: "error", stage: "message" });
  }
};
