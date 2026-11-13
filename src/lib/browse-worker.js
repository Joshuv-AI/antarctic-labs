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
//   { type: "begin", fp, pageSize, total, apiPage, startCursor,
//     bootstrap? }  start the stream. `bootstrap` is the resident
//     prefix's records, handed over by the main thread (2026-11-12,
//     audit F2) so the base transpose never waits on a redundant
//     5.3 MB re-fetch of /catalog-bootstrap.json queued behind the
//     page pipeline; when it is absent (or its length disagrees with
//     startCursor) the worker falls back to its own read, unchanged.
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
import {
  parseTcb1Dict,
  parseTcb1Shard,
  createTcb1Session,
} from "./tcb1.js";

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

// This worker's retained footprint, reported with every payload so
// the main thread's byte ledger can account for the memory the
// stream pins OFF the main thread (2026-11-13 load-state fix: the
// ledger previously counted only the main-thread store, so the
// degradation ladder never saw the worker's share of the jetsam
// wall). JSON pipeline: the transpose session's own accounting.
function sessionWorkerBytes() {
  if (!session || typeof session.stats !== "function") return 0;
  const s = session.stats();
  return s.retainedBytes + s.indexBytes + (s.dictBytes || 0);
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
      { type: "base", total: null, nextCursor: baseLen, payload, workerBytes: sessionWorkerBytes() },
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
        workerBytes: sessionWorkerBytes(),
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
  // Handoff first (audit F2): the main thread's bootstrap IS the
  // prefix the start cursor names — same file, already parsed. The
  // length check is the same one the fetch path applies below; a
  // mismatch discards the handoff and falls through to the read.
  let boot = null;
  if (
    Array.isArray(msg.bootstrap) &&
    msg.bootstrap.length === (msg.startCursor || 0)
  ) {
    boot = msg.bootstrap;
  }
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

// ---------------------------------------------------------------------
// TCB1 binary pipeline (Phase 2A, design §12): the same stream over
// the columnar binary dataset instead of the JSON pages. Chosen by
// the main thread at begin time (it validates the TCB1 manifest
// against the browse manifest first); every failure mode lands on
// the JSON path's exact semantics — a shard that fails twice posts
// "failed" (stream stops at the frontier, prefix kept), a fatal
// dataset problem (bad dictionary, checksum mismatch on the
// dictionary, unreadable manifest data) posts "error" (the main
// thread takes the stream over with the JSON pipeline).
//
// Flow control is ack-based (research §5.5): the worker never holds
// more than `windowSize` unacknowledged chunks — it does not pull
// the next shard's bytes until the main thread's commit of an
// earlier chunk acks. Shard bytes persist in Cache Storage keyed by
// the dataset fingerprint, with a completion bitmap written after
// every shard, so a repeat visit reads everything from disk and an
// interrupted load resumes where it stopped; a changed fingerprint
// invalidates the whole cache cleanly. All cache access is
// best-effort (Safari evicts script-written storage freely): any
// cache failure silently degrades to network-only.
const TCB1_CACHE = "tcb1-v1";
let tcb = null;

function tcbKey(fp, name) {
  return `${self.location.origin}/tcb1/${fp}/${name}`;
}

async function tcbCacheOpen() {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(TCB1_CACHE);
  } catch {
    return null;
  }
}

async function tcbCacheRead(cache, key) {
  if (!cache) return null;
  try {
    const r = await cache.match(key);
    if (!r) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function tcbCacheWrite(cache, key, bytes) {
  if (!cache) return;
  try {
    await cache.put(
      key,
      new Response(bytes, {
        headers: { "Content-Type": "application/octet-stream" },
      })
    );
  } catch {
    // Quota or eviction: the stream continues network-only.
  }
}

function hexOf(buf) {
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    out += buf[i].toString(16).padStart(2, "0");
  }
  return out;
}

async function sha256Ok(bytes, wantHex) {
  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return hexOf(new Uint8Array(digest)) === wantHex;
  } catch {
    return false;
  }
}

// Streaming fetch of one dataset file into an exact-size buffer.
// Uses response.body.getReader() — never for-await over the body,
// which Safari does not support (research §1). The fixed expected
// length comes from the manifest, so a truncated or oversized body
// is a failed attempt, not a corrupt shard.
async function tcbFetchBytes(url, expectedBytes, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`tcb1 fetch ${res.status}`);
    if (!res.body || !res.body.getReader) {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength !== expectedBytes) throw new Error("tcb1 size");
      return buf;
    }
    const reader = res.body.getReader();
    const out = new Uint8Array(expectedBytes);
    let filled = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (filled + value.byteLength > expectedBytes) {
        throw new Error("tcb1 overflow");
      }
      out.set(value, filled);
      filled += value.byteLength;
    }
    if (filled !== expectedBytes) throw new Error("tcb1 truncated");
    return out;
  } finally {
    clearTimeout(timer);
  }
}

// One dataset file, cache-first: a cached copy is used only after
// its sha256 matches the manifest (a changed or corrupted cache can
// never feed the decoder); a network copy is verified the same way
// before it is stored. Two attempts, mirroring the page pipeline.
async function tcbLoadFile(t, name, meta, timeoutMs) {
  const key = tcbKey(t.fp, name);
  const cached = await tcbCacheRead(t.cache, key);
  if (cached && cached.byteLength === meta.bytes && (await sha256Ok(cached, meta.sha256))) {
    return cached;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    let bytes = null;
    try {
      bytes = await tcbFetchBytes(`/tcb1/${t.fp}/${name}`, meta.bytes, timeoutMs);
    } catch {
      bytes = null;
    }
    if (bytes && (await sha256Ok(bytes, meta.sha256))) {
      await tcbCacheWrite(t.cache, key, bytes);
      return bytes;
    }
  }
  return null;
}

async function tcbPersistBitmap(t) {
  if (!t.cache || !t.bitmapDirty) return;
  t.bitmapDirty = false;
  await tcbCacheWrite(t.cache, tcbKey(t.fp, "bitmap.bin"), t.bitmap);
}

async function beginTcb1(msg) {
  const manifest = msg.tcb1;
  const fp = msg.fp;
  const cache = await tcbCacheOpen();
  const t = {
    fp,
    manifest,
    cache,
    dict: null,
    session: null,
    bitmap: new Uint8Array(manifest.completion_bitmap_bytes || 16),
    bitmapDirty: false,
    windowSize: 2,
    unacked: 0,
    ackWaiters: [],
    gen: 0,
    failed: false,
  };
  tcb = t;
  // Fingerprint invalidation: the cache is meaningful only for the
  // dataset it was written under. A pointer entry records the
  // fingerprint the cache currently holds; a mismatch wipes the
  // whole cache before anything is read from it.
  if (cache) {
    const pointer = await tcbCacheRead(cache, tcbKey("", "__fp__"));
    const held = pointer ? new TextDecoder().decode(pointer) : null;
    if (held !== fp) {
      try {
        await caches.delete(TCB1_CACHE);
      } catch {}
      t.cache = await tcbCacheOpen();
      if (t.cache) {
        await tcbCacheWrite(
          t.cache,
          tcbKey("", "__fp__"),
          new TextEncoder().encode(fp)
        );
      }
    }
    const bm = await tcbCacheRead(t.cache, tcbKey(fp, "bitmap.bin"));
    if (bm && bm.byteLength === t.bitmap.byteLength) t.bitmap = bm;
  }
  // Shard 0's fetch starts NOW, in parallel with the dictionary
  // load below (2026-11-13 load-state fix, defect 2): the dictionary
  // gate is serial and long on a phone connection, and shard 0 used
  // to wait behind ALL of it — transfer, SHA-256, parse — before its
  // own transfer even began. Its bytes are checksum-verified inside
  // tcbLoadFile exactly like the dictionary's; runTcb1 consumes this
  // promise as its initial prefetch.
  const shard0 = tcbLoadShard(t, 0);
  const dictBytes = await tcbLoadFile(
    t,
    manifest.dictionaries.file,
    manifest.dictionaries,
    // 240s per attempt (raised from 120s, 2026-11-13 load-state
    // fix): the dictionary is 36.7 MB on the wire, which a poor
    // cellular link delivers in ~2.5 minutes; at 120s the binary
    // path timed out and fell back to the far heavier JSON stream
    // on exactly the connections it exists to serve. Shard loads
    // keep their 60s budget (they are ~0.5 MB each).
    240000
  );
  if (!dictBytes) {
    post({ type: "error", stage: "tcb1-dict" });
    return;
  }
  t.dictBytes = dictBytes.byteLength;
  try {
    t.dict = parseTcb1Dict(dictBytes);
    t.session = createTcb1Session(t.dict, manifest.total_records || 0);
  } catch {
    post({ type: "error", stage: "tcb1-dict-parse" });
    return;
  }
  runTcb1(t, 0, shard0);
}

// This worker's retained footprint in TCB1 mode, reported with every
// payload for the main thread's byte ledger: the raw dictionary
// buffer (105 MB at full scale — the single largest block the worker
// pins) plus the decode session's retained id bytes and index table.
function tcbWorkerBytes(t) {
  let n = t.dictBytes || 0;
  if (t.session && typeof t.session.stats === "function") {
    const s = t.session.stats();
    n += s.retainedBytes + s.indexBytes;
  }
  return n;
}

// The decode loop: strictly in shard order (the session's dedupe and
// dictionary state are sequential), one shard of fetch-ahead (the
// next shard's bytes download while this one decodes), and the ack
// window bounding how far ahead of the main thread's commits the
// worker may run. Shard 0 posts as the base chunk, exactly like the
// JSON bootstrap.
async function runTcb1(t, fromShard, initialPrefetch) {
  const gen = ++t.gen;
  const manifest = t.manifest;
  const pageSize = manifest.shard_size;
  const shardCount = manifest.shard_count;
  let shardIdx = fromShard;
  let prefetched =
    initialPrefetch ||
    (shardIdx < shardCount ? tcbLoadShard(t, shardIdx) : Promise.resolve(null));
  while (shardIdx < shardCount) {
    if (t.gen !== gen || t.failed) return;
    while (paused && t.gen === gen) {
      await new Promise((r) => setTimeout(r, 150));
    }
    if (t.gen !== gen) return;
    const bytes = await prefetched;
    if (t.gen !== gen) return; // superseded by a reset while fetching
    const isLast = shardIdx === shardCount - 1;
    prefetched = isLast ? Promise.resolve(null) : tcbLoadShard(t, shardIdx + 1);
    if (bytes == null) {
      t.failed = true;
      if (shardIdx === 0) {
        // The base chunk failing is the bootstrap failing: the JSON
        // path answers that with "error" (main-thread takeover),
        // never with a frontier stop.
        post({ type: "error", stage: "tcb1-shard0" });
      } else {
        post({ type: "failed", cursor: shardIdx * pageSize });
      }
      return;
    }
    let payload;
    try {
      const shard = parseTcb1Shard(bytes);
      if (shard.shardIndex !== shardIdx) throw new Error("shard index");
      payload = t.session.transposeShard(shard, shardIdx === 0 ? -1 : shardIdx * pageSize);
    } catch {
      t.failed = true;
      post({ type: "error", stage: "tcb1-decode" });
      return;
    }
    const meta = manifest.shards[shardIdx];
    if (shardIdx === 0) {
      post(
        { type: "base", total: null, nextCursor: meta.records, payload, workerBytes: tcbWorkerBytes(t) },
        payloadTransfer(payload)
      );
    } else {
      post(
        {
          type: "page",
          cursor: shardIdx * pageSize,
          rawCount: meta.records,
          total: manifest.total_records,
          nextCursor: isLast ? null : (shardIdx + 1) * pageSize,
          payload,
          workerBytes: tcbWorkerBytes(t),
        },
        payloadTransfer(payload)
      );
    }
    if ((t.bitmap[shardIdx >> 3] & (1 << (shardIdx & 7))) === 0) {
      t.bitmap[shardIdx >> 3] |= 1 << (shardIdx & 7);
      t.bitmapDirty = true;
    }
    await tcbPersistBitmap(t);
    t.unacked++;
    if (t.unacked >= t.windowSize) {
      await new Promise((resolve) => t.ackWaiters.push(resolve));
    }
    shardIdx++;
  }
}

function tcbLoadShard(t, idx) {
  const meta = t.manifest.shards[idx];
  return tcbLoadFile(t, meta.file, meta, 60000);
}

function tcbAck() {
  if (!tcb) return;
  if (tcb.unacked > 0) tcb.unacked--;
  const waiters = tcb.ackWaiters;
  tcb.ackWaiters = [];
  for (const resolve of waiters) resolve();
}

self.onmessage = (e) => {
  const m = e.data || {};
  try {
    if (m.type === "begin") {
      if (started) return;
      started = true;
      if (m.tcb1) {
        beginTcb1(m).catch(() => post({ type: "error", stage: "tcb1" }));
      } else {
        begin(m).catch(() => post({ type: "error", stage: "begin" }));
      }
    } else if (m.type === "ack") {
      tcbAck();
    } else if (m.type === "window") {
      if (tcb && (m.size === 1 || m.size === 2)) tcb.windowSize = m.size;
    } else if (m.type === "pause") {
      paused = true;
    } else if (m.type === "resume") {
      paused = false;
      if (!tcb) pump();
    } else if (m.type === "reset" && tcb) {
      // TCB1 resume: the main thread dropped every buffered chunk
      // at/after its append frontier — the session drops its
      // matching transposed shards and the loop restarts there.
      // Cached shard bytes stay valid (the bitmap is untouched);
      // only the decode re-runs. The frontier is always a shard
      // boundary in this pipeline.
      const t = tcb;
      t.session.resetTo(m.cursor);
      t.failed = false;
      t.unacked = 0;
      const waiters = t.ackWaiters;
      t.ackWaiters = [];
      for (const resolve of waiters) resolve();
      paused = false;
      runTcb1(t, Math.floor(m.cursor / t.manifest.shard_size));
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
