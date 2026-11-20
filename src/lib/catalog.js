// Tower of Babel — lazy artifact catalog.
//
// Three-tier loading:
// - `catalog-bootstrap.json` (first 20,000 records) loads INSTANTLY.
//   The list renders immediately, no spinner.
// - The full index (all records, compact projection) loads as versioned
//   chunks via /catalog-index2/ (Stage 2), parsed in a Web Worker and
//   published progressively; /catalog-index.json remains as the legacy
//   fallback. Search/filter upgrade as chunks arrive.
// - `catalog.json` (full records) loads ON DEMAND for detail pages.
//
// This keeps the page paint fast even on a slow connection: the shell and
// first rows appear from the bootstrap while the full index streams in
// behind them.
//
// Failure semantics: every tier fetches with an abort timeout and one
// automatic retry — 30s for the small tiers, 240s for index transfers
// (see INDEX_FETCH_TIMEOUT_MS below). A failed fetch leaves the module cache untouched (pending
// is reset, cache stays null), so re-calling the loader is always a fresh
// attempt — fetch failures are not cached anywhere. Callers surface an
// error UI with an in-place retry; the one-shot page-reload path for a
// poisoned deploy lives in main.jsx (SHELL-owned).
import {
  CatalogIdIndex,
  textEncoder,
  utf8ByteLength,
} from "./catalog-core.js";

// Re-exported for pages.jsx, whose phase-0 derivation builds its
// own CatalogIdIndex over the published catalog view.
export { CatalogIdIndex };

let bootstrapCache = null;
let indexCache = null;
let fullCache = null;
let bootstrapPending = null;
let indexPending = null;
let fullPending = null;
// Listeners for when the full index arrives (to upgrade the UI).
const indexReadyListeners = new Set();

const FETCH_TIMEOUT_MS = 30000;
// Index transfers (manifest, chunks, legacy monolith) move ~20 MB per
// file: the 30 s cap silently killed the load on phone connections,
// where a chunk routinely needs 40-60 s — the library then sat on the
// 20,000-record bootstrap forever with no error shown (Joshua's
// report, 2026-10-30). 240 s only fails a transfer that truly stalls.
// Small fetches (bootstrap, full records) keep the 30 s cap.
const INDEX_FETCH_TIMEOUT_MS = 240000;

function fetchJsonOnce(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { signal: ctrl.signal })
    .then((r) => {
      if (!r.ok) throw new Error(`fetch failed: ${url} ${r.status}`);
      return r.json();
    })
    .finally(() => clearTimeout(timer));
}

function loadWithRetry(url, getPending, setPending, getCache, setCache, onReady) {
  if (getCache()) return Promise.resolve(getCache());
  if (!getPending()) {
    setPending(
      fetchJsonOnce(url)
        .catch(() => fetchJsonOnce(url))
        .then(
          (data) => {
            setCache(data);
            setPending(null);
            if (onReady) onReady(data);
            return data;
          },
          (err) => {
            setPending(null);
            throw err;
          }
        )
    );
  }
  return getPending();
}

// Bootstrap: first 20,000 records, loads instantly.
//
// Retry discipline (2026-11-18, library load-failure fix): the generic
// loadWithRetry fires its one retry IMMEDIATELY, so both attempts land
// inside the same transient — the same edge reset window, the same
// stalled connection — and a one-second hiccup on the 5.3 MB bootstrap
// transfer took the whole library to its error screen (Joshua's
// recording: ~20% of refreshes). The bootstrap is the page's front
// door, so it gets spaced attempts instead: an immediate first try,
// then retries after 600 ms and 1.8 s (three attempts total, each
// still bounded by the 30 s abort). A transient that clears inside
// ~2.5 s — the class a manual refresh was silently absorbing — now
// heals inside the load, before any error state exists. Failures are
// still never cached: after the final attempt the pending slot clears
// and a later call starts fresh.
const BOOTSTRAP_RETRY_DELAYS_MS = [600, 1800];
export function loadBootstrap() {
  if (bootstrapCache) return Promise.resolve(bootstrapCache);
  if (!bootstrapPending) {
    const attempt = (n) =>
      fetchJsonOnce("/catalog-bootstrap.json").catch((err) => {
        if (n >= BOOTSTRAP_RETRY_DELAYS_MS.length) throw err;
        return new Promise((resolve) =>
          setTimeout(resolve, BOOTSTRAP_RETRY_DELAYS_MS[n])
        ).then(() => attempt(n + 1));
      });
    bootstrapPending = attempt(0).then(
      (data) => {
        bootstrapCache = data;
        bootstrapPending = null;
        return data;
      },
      (err) => {
        bootstrapPending = null;
        throw err;
      }
    );
  }
  return bootstrapPending;
}

// Full index: every record (compact projection). Stage 2 (2026-10-23):
// the index loads as versioned chunks (see functions/catalog-index2/),
// fetched and JSON-parsed in a Web Worker, and is PUBLISHED PROGRESSIVELY
// — listeners receive (records, complete) as each contiguous chunk run
// lands, with complete=true on the final chunk. If the v2 path is
// unavailable (manifest unreachable or malformed, or the worker fails
// before any chunk lands), the loader falls back to the legacy
// single-file /catalog-index.json fetch.
let indexComplete = false;
// Set ONLY by the legacy full-index publishers (publishLegacyIndex
// below). Scope mode's stand-down guard keys off this flag — never
// off indexComplete: publishIndex latches indexComplete for ANY
// complete publish, including scope mode's own init publish, so
// the old guard read scope mode's first publish as a legacy
// takeover and swallowed every scope publish for the rest of the
// session (the store grew; the published view never did — the
// 2026-11-20 "selected scope reads empty" failure).
let legacyPublishActive = false;

function publishIndex(data, complete) {
  indexCache = data;
  if (complete) indexComplete = true;
  indexReadyListeners.forEach((cb) => {
    try { cb(data, complete); } catch {}
  });
}

function publishLegacyIndex(data, complete) {
  legacyPublishActive = true;
  publishIndex(data, complete);
}

function fetchJsonWithRetry(url) {
  return fetchJsonOnce(url, INDEX_FETCH_TIMEOUT_MS).catch(() =>
    fetchJsonOnce(url, INDEX_FETCH_TIMEOUT_MS)
  );
}

function loadLegacyIndex() {
  return fetchJsonWithRetry("/catalog-index.json").then((data) => {
    publishLegacyIndex(data, true);
    return data;
  });
}

// Stream chunks through the worker. Resolves true if the worker failed
// (unavailable, crashed, or a chunk failed twice inside it), false when
// every chunk was delivered.
function streamChunksViaWorker(version, chunks, onChunk) {
  return new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(new URL("./index-worker.js", import.meta.url), {
        type: "module",
      });
    } catch {
      resolve(true);
      return;
    }
    let settled = false;
    const finish = (failed) => {
      if (settled) return;
      settled = true;
      try { worker.terminate(); } catch {}
      resolve(failed);
    };
    worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === "chunk") onChunk(m.index, m.records);
      else if (m.type === "done") finish(false);
      else if (m.type === "error") finish(true);
    };
    worker.onerror = () => finish(true);
    try {
      worker.postMessage({ version, chunks });
    } catch {
      finish(true);
    }
  });
}

async function loadIndexV2() {
  let manifest;
  try {
    manifest = await fetchJsonWithRetry("/catalog-index2/manifest.json");
  } catch {
    return loadLegacyIndex();
  }
  const version = manifest && manifest.v;
  const chunks = manifest && manifest.chunks;
  if (!version || !Number.isInteger(chunks) || chunks < 1) {
    return loadLegacyIndex();
  }
  // Chunks arrive in any order; only the contiguous prefix is published,
  // so subscribers always see a valid catalog-order prefix.
  const parts = new Array(chunks).fill(null);
  let published = 0;
  let acc = [];
  // Publish coalescing (stability, 2026-10-28): partial publishes are
  // throttled to one per 2.5s (the final, complete publish always fires
  // immediately). Every publish swaps the artifacts array identity, which
  // restarts the page's catalog derivations and re-renders — at ten
  // chunks that churn (aborted builds + garbage) stacked on top of the
  // parsed catalog and pushed mobile tabs over their memory budget.
  let lastPubAt = 0;
  let pubTimer = null;
  const publishNow = (complete) => {
    lastPubAt = Date.now();
    publishLegacyIndex(acc, complete);
  };
  const publishContiguous = () => {
    let grew = false;
    while (published < chunks && parts[published]) {
      acc = acc.concat(parts[published]);
      parts[published] = undefined;
      published++;
      grew = true;
    }
    if (!grew) return;
    if (published === chunks) {
      if (pubTimer) { clearTimeout(pubTimer); pubTimer = null; }
      publishNow(true);
      return;
    }
    const wait = 2500 - (Date.now() - lastPubAt);
    if (lastPubAt === 0 || wait <= 0) {
      publishNow(false);
      return;
    }
    if (!pubTimer) {
      pubTimer = setTimeout(() => {
        pubTimer = null;
        lastPubAt = Date.now();
        publishLegacyIndex(acc, published === chunks);
      }, wait);
    }
  };
  const workerFailed = await streamChunksViaWorker(version, chunks, (i, records) => {
    parts[i] = records;
    publishContiguous();
  });
  // The worker delivered nothing and failed — prefer the legacy monolith
  // (one edge-cached stream) over ten main-thread chunk parses.
  if (workerFailed && published === 0) return loadLegacyIndex();
  // Fill any gaps on the main thread (worker died midway).
  for (let i = 0; i < chunks; i++) {
    if (i >= published && !parts[i]) {
      parts[i] = await fetchJsonWithRetry(
        `/catalog-index2/${version}/${i}.json`
      );
      publishContiguous();
    }
  }
  if (!indexComplete) publishLegacyIndex(acc, true);
  return acc;
}

export function loadCatalog() {
  if (indexComplete && indexCache) return Promise.resolve(indexCache);
  if (!indexPending) {
    indexPending = loadIndexV2().then(
      (data) => {
        indexPending = null;
        return data;
      },
      (err) => {
        indexPending = null;
        throw err;
      }
    );
  }
  return indexPending;
}

// Deferred index loading (Stage 1 ungating, 2026-10-23): the full index
// is heavy — a multi-MB download, a main-thread JSON.parse, and a full
// derivation pass — so the Tower page no longer starts it automatically
// at load. The bootstrap paints the page completely; the index starts
// only on visitor intent (search focus/typing, any browse control,
// scrolling toward the results) via requestCatalogIndex(), or on the
// idle schedule armed by scheduleCatalogIndex(). loadCatalog() itself
// is unchanged and idempotent, so requesting is always safe.
let indexIdleTimer = null;
export function requestCatalogIndex() {
  if (indexIdleTimer) {
    clearTimeout(indexIdleTimer);
    indexIdleTimer = null;
  }
  return loadCatalog().catch(() => {});
}
export function scheduleCatalogIndex(delayMs = 12000) {
  if (indexCache || indexPending || indexIdleTimer) return;
  indexIdleTimer = setTimeout(() => {
    indexIdleTimer = null;
    loadCatalog().catch(() => {});
  }, delayMs);
}
// True only while the index fetch is actually in flight (the deferred
// state before any request is NOT "loading" — the status line in the
// library UI keys off this so it never claims a load that isn't running).
export function isIndexInFlight() {
  return indexPending !== null;
}

// Server browse streaming (2026-11-09, Joshua's server-backed call): in
// server mode the client index is NOT downloaded to the device at all —
// at 2.56M records the compact index is ~880 MB and jetsam-kills phone
// tabs no matter how its loading is scheduled. Instead the catalog
// streams in from /api/catalog-search browse pages (server-side,
// cursor-paged, catalog order) and is appended to the same progressive
// prefix cache the index publishes used, so every consumer — the list,
// the shelves, the filters, the header counter — upgrades exactly as it
// did when index chunks landed. The header counter counts what has
// actually arrived; nothing about the total is borrowed or implied.
// The bootstrap is a verified exact prefix of the browse order, so
// streaming starts at cursor = resident length and continues in order.
// Publishes are coalesced to one per 2.5s (same stability rule as the
// chunk loader: every publish restarts the page's derivations). The
// automatic stream runs until the FULL catalog is resident — it used
// to stop at a 150,000-record cap (a memory level a phone holds
// comfortably), but Joshua's 2026-11-10 call was explicit: stopping
// early reads as "not loading everything" when there are 2.5M
// entries, so the stream now continues to exhaustion. If it stops
// early on a failure, Load more resumes it to the end of the catalog
// (resumeCatalogBrowse). If the endpoint fails,
// the stream stops quietly and keeps what arrived — the bootstrap and
// server search still serve the page, and the client index is never
// pulled as a browse fallback (that fallback was the crash).
//
// Pipelined fetch (2026-11-10, load-speed fix): the sequential loop
// above cost one round trip plus a 300 ms tick per 500 records,
// which read as "the library loads very slowly" even though the
// counter climbed honestly. The browse
// endpoint's paging is pure offset arithmetic (next_cursor is always
// cursor + page length; see functions/_lib/catalog-search.js), so
// page cursors are computable in advance: the streamer now keeps
// BROWSE_PIPELINE page requests in flight at the run's page size
// each and appends pages strictly in cursor order (dedupe by
// id still guards any divergence). Failure, visibility and
// publish semantics are unchanged: a page that fails twice stops the
// stream with everything before it kept, publishes stay coalesced to
// one per 2.5s, and a hidden tab launches and appends nothing.
//
// Static pages (2026-11-10 load-speed pack, steps 1-2): the function
// path above cost ~1.7 s of server time before the first byte of
// EVERY page — the metadata generator now also bakes the identical
// ordinal sequence into static 20,000-record pages (browse/ in the
// metadata products), and the streamer pulls those through the
// immutable /browse-pages/<fingerprint>/ proxy instead: ~128 edge-
// served requests for the whole catalog. Discovery is one small
// /api/browse-manifest read per page load. Any static-page failure
// falls back to assembling that page from the function endpoint at
// BROWSE_API_PAGE per subrequest, and a fingerprint whose manifest
// predates the pack (no browse layout) runs function-only at
// BROWSE_API_PAGE — in both cases behaviour is exactly the pre-pack
// stream, never worse. Search and filtered browsing still use the
// function; only this plain browse stream reads static pages.
const BROWSE_API_PAGE = 2000;
const BROWSE_PIPELINE = 8;
// Live pipeline width: the memory ladder's rung 2 narrows it (see
// the byte ledger below); a fresh stream restores the full width.
let browsePipelineWidth = BROWSE_PIPELINE;
// Publish cadence for the browse stream (2026-11-11 smoothness).
// Was 2500 ms (2026-10-28): back then every publish restarted the
// full derivation and stacked half-built structures into jetsam
// peaks. Partial publishes now run the incremental phase 0 only, so
// the cadence exists just to keep derives from chasing every page —
// 1000 ms keeps increments visibly frequent (~1 s) without returning
// to per-page derives. The client-index path keeps its own 2500 ms.
const BROWSE_PUBLISH_MS = 2000;
// Pages transposed per browseAppend task (the base prefix counts as
// one). Arrivals used to be transposed in unbounded bursts — while
// the main thread was busy, up to 8 pipeline pages buffered and then
// transposed in a single multi-second task, whose oversized derive
// tail made the NEXT burst bigger (counter jumps of +160k, stalls of
// 3–28 s in the timing harness). A burst cap plus a 0 ms continuation
// keeps each task small and the counter moving.
const APPEND_BURST_PAGES = 2;
let browseState = null;

// ---------------------------------------------------------------------
// Columnar resident catalog (2026-11-10 speed pack, step 6).
//
// The object catalog measured ~0.9 GB parsed at full scale — 2.56M
// small objects, each pinning its own id/title strings with full JS
// string-object overhead, plus a 2.56M-entry dedupe Set in this
// streamer and a 2.56M-entry Map in the page derivation. That is the
// iOS jetsam wall behind the phone crash loop. The browse stream now
// transposes every page into columns on arrival and discards the
// parsed objects:
//   - artifact_id / title text lives as UTF-8 BYTES in per-batch
//     chunks (byte arrays + Uint32 offset tables). Byte storage costs
//     the information content of the text (~1 byte/char for the
//     mostly-Latin-1 catalog) instead of a JS string object per
//     record (~2 bytes/char for non-Latin-1 titles, plus header).
//   - creator and year are dictionary-coded (Uint32 codes into a
//     distinct-value table that stores the RAW values, types intact);
//     collection / format / rights_status / download_status are
//     dictionary-coded as Uint8.
//   - id dedupe (the old `seen` Set of every id string) is an
//     open-addressing hash table over Uint32 slots (~33 MB at full
//     scale instead of ~150 MB+), dropped when the stream completes.
// Consumers never see the columns: publishes hand out a catalog VIEW
// (see createCatalogView) — an array-like whose numeric reads
// materialize a lightweight record (prototype getters over the
// columns) and whose map/find/findIndex/filter/forEach/slice and
// iterator behave exactly like the plain array they replace. Sorting,
// filtering, shelves and search all consume records the same way;
// only the resident bytes change. The client-index path
// (loadIndexV2) still publishes plain arrays, untouched.

const textDecoder = new TextDecoder();

function makeCol(ctor) {
  return { a: new ctor(32768), n: 0 };
}
function colPush(col, v) {
  if (col.n === col.a.length) {
    const na = new col.a.constructor(col.a.length * 2);
    na.set(col.a);
    col.a = na;
  }
  col.a[col.n++] = v;
}
function dictCode(store, mapKey, dictKey, v) {
  const map = store[mapKey];
  let code = map.get(v);
  if (code === undefined) {
    code = store[dictKey].length;
    map.set(v, code);
    store[dictKey].push(v);
  }
  return code;
}

export function createColumnStore(expectedTotal = 0) {
  const store = {
    count: 0,
    // Stream total when known (browse manifest): pre-sizes the id
    // index so it never rehashes mid-stream. 0 = unknown.
    expectedTotal: expectedTotal || 0,
    chunks: [], // {start, idBytes, idOff, titleBytes, titleOff}
    chunkIdx: makeCol(Uint16Array),
    // Catalog ordinal per resident record (2026-11-20 selection-driven
    // loading): in stream mode residents are the catalog prefix, so
    // ordinal == resident index; in scope mode residents are an
    // arbitrary subset and every catalog-index space consumer
    // (curated bitsets, facet tallies) translates through this column.
    ordCode: makeCol(Uint32Array),
    creatorCode: makeCol(Uint32Array),
    yearCode: makeCol(Uint32Array),
    collCode: makeCol(Uint8Array),
    fmtCode: makeCol(Uint8Array),
    rightsCode: makeCol(Uint8Array),
    dlCode: makeCol(Uint8Array),
    creatorDict: [],
    creatorMap: new Map(),
    yearDict: [],
    yearMap: new Map(),
    collDict: [],
    collMap: new Map(),
    fmtDict: [],
    fmtMap: new Map(),
    rightsDict: [],
    rightsMap: new Map(),
    dlDict: [],
    dlMap: new Map(),
    idIndex: null, // CatalogIdIndex, built on first append, dropped at completion
    idAt(i) {
      const c = this.chunks[this.chunkIdx.a[i]];
      const local = i - c.start;
      return textDecoder.decode(
        c.idBytes.subarray(c.idOff[local], c.idOff[local + 1])
      );
    },
    // The id's stored UTF-8 bytes as [buffer, start, end] — the
    // byte-mode probe accessor for CatalogIdIndex (no decode).
    idBytesAt(i) {
      const c = this.chunks[this.chunkIdx.a[i]];
      const local = i - c.start;
      return [c.idBytes, c.idOff[local], c.idOff[local + 1]];
    },
    // The id's taxonomy prefix — the leading [a-z0-9]+(-[a-z0-9]+)?
    // run, exactly the match idPrefix() in tower-taxonomy.js would
    // take from the decoded id — computed on the raw bytes: every
    // byte >= 0x80 belongs to a multibyte character, which the
    // ASCII-only character class rejects just the same, so the walk
    // stops identically. Lets the phase-0 bucket loop classify a
    // record without decoding its whole id (2026-11-11 smoothness).
    idPrefixAt(i) {
      const b = this.idBytesAt(i);
      const buf = b[0];
      const end = b[2];
      let p = b[1];
      const isPre = (x) =>
        (x >= 0x30 && x <= 0x39) || (x >= 0x61 && x <= 0x7a);
      while (p < end && isPre(buf[p])) p++;
      if (p > b[1] && p < end && buf[p] === 0x2d) {
        let q = p + 1;
        while (q < end && isPre(buf[q])) q++;
        if (q > p + 1) p = q; // dash counts only with a segment after it
      }
      let out = "";
      for (let k = b[1]; k < p; k++) out += String.fromCharCode(buf[k]);
      return out;
    },
    collAt(i) {
      return this.collDict[this.collCode.a[i]];
    },
    yearAt(i) {
      return this.yearDict[this.yearCode.a[i]];
    },
    titleAt(i) {
      const c = this.chunks[this.chunkIdx.a[i]];
      const local = i - c.start;
      return textDecoder.decode(
        c.titleBytes.subarray(c.titleOff[local], c.titleOff[local + 1])
      );
    },
  };
  return store;
}

function ensureStoreIndex(store) {
  if (store.idIndex) return store.idIndex;
  // Byte mode: probes compare the stored id bytes directly, so the
  // keyAt decoder is never on a hot path (it stays only as the
  // _key fallback the class requires a function for — byte mode never
  // calls it). Backfill inserts from stored bytes too (syncToBytes
  // semantics over the residents already present).
  const ix = new CatalogIdIndex(
    (i) => store.idAt(i),
    store.expectedTotal || store.count,
    (i) => store.idBytesAt(i)
  );
  ix.syncToBytes(store.count);
  store.idIndex = ix;
  return ix;
}

// Transpose one batch of records (plain objects, or records read back
// through a catalog view) into the columns as a single chunk. The
// dedupe contract is the old streamer's: first occurrence of an
// artifact_id wins, records without an id are skipped.
export function appendRecordsToStore(store, records, ordinals) {
  const total = records ? records.length : 0;
  if (!total) return;
  const index = ensureStoreIndex(store);
  const seenLocal = new Set();
  const accepted = [];
  const acceptedOrd = [];
  for (let j = 0; j < total; j++) {
    const r = records[j];
    if (!r || !r.artifact_id) continue;
    const id = r.artifact_id;
    if (seenLocal.has(id)) continue;
    if (index.get(id) !== undefined) continue;
    seenLocal.add(id);
    accepted.push(r);
    // Ordinal resolution order: the explicit parallel array, the
    // record's own _idx (server-paged / hydrated records carry it),
    // else the resident position — correct for the catalog-prefix
    // appends every legacy caller makes (bootstrap base, streams).
    const o = ordinals ? ordinals[j] : undefined;
    acceptedOrd.push(
      typeof o === "number"
        ? o
        : typeof r._idx === "number"
          ? r._idx
          : store.count + accepted.length - 1
    );
  }
  if (!accepted.length) return;
  const n = accepted.length;
  const start = store.count;
  const idOff = new Uint32Array(n + 1);
  const titleOff = new Uint32Array(n + 1);
  const idStrs = new Array(n);
  const titleStrs = new Array(n);
  let idLen = 0;
  let titleLen = 0;
  for (let j = 0; j < n; j++) {
    const r = accepted[j];
    const idStr = String(r.artifact_id);
    const titleStr = r.title == null ? "" : String(r.title);
    idStrs[j] = idStr;
    titleStrs[j] = titleStr;
    idOff[j + 1] = (idLen += utf8ByteLength(idStr));
    titleOff[j + 1] = (titleLen += utf8ByteLength(titleStr));
  }
  // Exact-sized buffers filled in a single encodeInto pass (the
  // length walk above guarantees `written` fills each slot exactly;
  // byte-identical to the old encode()+copy path).
  const idBytes = new Uint8Array(idLen);
  const titleBytes = new Uint8Array(titleLen);
  for (let j = 0; j < n; j++) {
    textEncoder.encodeInto(idStrs[j], idBytes.subarray(idOff[j]));
    textEncoder.encodeInto(titleStrs[j], titleBytes.subarray(titleOff[j]));
  }
  const chunkIndex = store.chunks.length;
  store.chunks.push({ start, idBytes, idOff, titleBytes, titleOff });
  // Byte ledger (design §12): text + offset tables + per-record
  // columns (Uint16 chunk index; Uint32 creator/year; 4 × Uint8).
  storeBytes(store).chunks +=
    idBytes.byteLength + idOff.byteLength +
    titleBytes.byteLength + titleOff.byteLength + n * 18;
  for (let j = 0; j < n; j++) {
    const r = accepted[j];
    colPush(store.chunkIdx, chunkIndex);
    colPush(store.ordCode, acceptedOrd[j]);
    colPush(store.creatorCode, dictCode(store, "creatorMap", "creatorDict", r.creator));
    colPush(store.yearCode, dictCode(store, "yearMap", "yearDict", r.year));
    colPush(store.collCode, dictCode(store, "collMap", "collDict", r.collection));
    colPush(store.fmtCode, dictCode(store, "fmtMap", "fmtDict", r.format));
    colPush(store.rightsCode, dictCode(store, "rightsMap", "rightsDict", r.rights_status));
    colPush(store.dlCode, dictCode(store, "dlMap", "dlDict", r.download_status));
  }
  store.count += n;
  // Index the new residents only now that their ids are readable
  // through the store (byte-mode probe verification reads the stored
  // bytes from the chunk pushed above).
  for (let j = 0; j < n; j++) index.add(start + j, accepted[j].artifact_id);
  index.builtLen = store.count;
}

// A record materialized from the columns: a two-field object whose
// field reads are prototype getters, so a consumer that only reads
// .collection never pays for the title decode, and nothing per-record
// is retained beyond the columns themselves.
class ColumnRecord {
  constructor(store, i) {
    this._s = store;
    this._i = i;
  }
  get artifact_id() {
    return this._s.idAt(this._i);
  }
  get title() {
    return this._s.titleAt(this._i);
  }
  get creator() {
    return this._s.creatorDict[this._s.creatorCode.a[this._i]];
  }
  get year() {
    return this._s.yearDict[this._s.yearCode.a[this._i]];
  }
  get collection() {
    return this._s.collDict[this._s.collCode.a[this._i]];
  }
  get format() {
    return this._s.fmtDict[this._s.fmtCode.a[this._i]];
  }
  get rights_status() {
    return this._s.rightsDict[this._s.rightsCode.a[this._i]];
  }
  get download_status() {
    return this._s.dlDict[this._s.dlCode.a[this._i]];
  }
}

const CANONICAL_INDEX = /^(0|[1-9]\d*)$/;
// The published face of the column store: an array-like snapshot with
// the length the store had at publish time (publishes replace the
// view identity, exactly as the old array-slice publishes did, so
// identity-keyed derivations downstream behave unchanged).
export function createCatalogView(store, length) {
  const recAt = (i) => new ColumnRecord(store, i);
  const view = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "length") return length;
        if (prop === Symbol.iterator) {
          return function* () {
            for (let i = 0; i < length; i++) yield recAt(i);
          };
        }
        if (typeof prop === "string" && CANONICAL_INDEX.test(prop)) {
          const i = Number(prop);
          return i < length ? recAt(i) : undefined;
        }
        switch (prop) {
          case "__columnBytesAt":
            // Internal hook for pages.jsx's phase-0 id index: run a
            // byte-mode CatalogIdIndex over this view's store, so its
            // probes compare stored id bytes instead of decoding an
            // id per probe step (2026-11-11 smoothness profile).
            return (i) => store.idBytesAt(i);
          case "__columnCollectionAt":
            // Internal hook for pages.jsx's phase-0 count loops: the
            // record's collection string from the dictionary, so
            // counting a record never materializes it.
            return (i) => store.collAt(i);
          case "__columnYearAt":
            // Internal hook for pages.jsx's phase-0 era loop: the
            // record's year from the dictionary, so era counting a
            // record never materializes it (filter revamp 2026-11-11).
            return (i) => store.yearAt(i);
          case "__columnIdPrefixAt":
            // Internal hook for pages.jsx's phase-0 bucket loop: the
            // record's taxonomy id prefix from its stored bytes, so
            // classifying a record never decodes its whole id.
            return (i) => store.idPrefixAt(i);
          case "__columnOrdinalAt":
            // Internal hook for pages.jsx's bitset translation
            // (2026-11-20 selection-driven loading): the record's
            // catalog ordinal, so catalog-index bitsets (curated
            // membership) can be re-based onto the resident set,
            // whose positions no longer equal catalog positions
            // once scopes load out of order.
            return (i) => store.ordCode.a[i];
          case "map":
            return (cb, thisArg) => {
              const out = new Array(length);
              for (let i = 0; i < length; i++) out[i] = cb.call(thisArg, recAt(i), i, view);
              return out;
            };
          case "forEach":
            return (cb, thisArg) => {
              for (let i = 0; i < length; i++) cb.call(thisArg, recAt(i), i, view);
            };
          case "find":
            return (cb, thisArg) => {
              for (let i = 0; i < length; i++) {
                const r = recAt(i);
                if (cb.call(thisArg, r, i, view)) return r;
              }
              return undefined;
            };
          case "findIndex":
            return (cb, thisArg) => {
              for (let i = 0; i < length; i++) {
                if (cb.call(thisArg, recAt(i), i, view)) return i;
              }
              return -1;
            };
          case "filter":
            return (cb, thisArg) => {
              const out = [];
              for (let i = 0; i < length; i++) {
                const r = recAt(i);
                if (cb.call(thisArg, r, i, view)) out.push(r);
              }
              return out;
            };
          case "slice":
            return (start = 0, end = length) => {
              const s = start < 0 ? Math.max(length + start, 0) : Math.min(start, length);
              const e = end < 0 ? Math.max(length + end, 0) : Math.min(end, length);
              const out = [];
              for (let i = s; i < e; i++) out.push(recAt(i));
              return out;
            };
          default:
            return undefined;
        }
      },
      has(_t, prop) {
        if (prop === "length") return true;
        if (typeof prop === "string" && CANONICAL_INDEX.test(prop)) {
          return Number(prop) < length;
        }
        return false;
      },
    }
  );
  return view;
}
let browseMetaPromise = null;

function browseMetaShape(m) {
  if (
    m && typeof m.total === "number" && typeof m.fingerprint === "string" &&
    Number.isFinite(m.browse_page_size) && Number.isFinite(m.browse_pages)
  ) {
    return { fp: m.fingerprint, total: m.total, pageSize: m.browse_page_size, orders: !!m.orders };
  }
  return null;
}

// Discovery robustness (2026-11-12, audit F2): /api/browse-manifest
// 504'd on ~33% of sampled requests on Nov 12 (census Tail A), and the
// old single-attempt read cached its null for the whole session — one
// bad first minute silently degraded the entire load to slow
// function-mode paging, with no way to recover short of a reload.
// Now: bounded retries with backoff inside one discovery round, and
// only a SUCCESSFUL discovery is cached for the session. A failed or
// function-only (null) round clears the cached promise, so the next
// intent trigger (scroll, filter tap, Load more) re-runs discovery
// instead of inheriting the failure. A well-formed response settles
// the round immediately (null = function-only mode is a real answer,
// not an error worth retrying). Per-attempt timeout is shorter than
// the generic 30 s: the manifest is a small function response, and a
// hung attempt should re-roll onto a fresh isolate quickly.
const BROWSE_META_TIMEOUT_MS = 12000;
const BROWSE_META_ATTEMPTS = 3;
const BROWSE_META_BACKOFF_MS = [700, 1600];

async function discoverBrowseMeta() {
  // Boot-prefetch handoff: the inline boot script in index.html
  // already fetched and parsed this manifest before the bundle
  // parsed (to prefetch the first browse pages). Reuse its result —
  // discovery is then done at mount, with no second network read.
  const boot =
    typeof window !== "undefined" ? window.__browseManifest : null;
  const fromBoot = browseMetaShape(boot);
  if (fromBoot) return fromBoot;
  let lastErr = null;
  for (let attempt = 0; attempt < BROWSE_META_ATTEMPTS; attempt++) {
    try {
      const m = await fetchJsonOnce("/api/browse-manifest", BROWSE_META_TIMEOUT_MS);
      return browseMetaShape(m);
    } catch (e) {
      lastErr = e;
      if (attempt < BROWSE_META_ATTEMPTS - 1) {
        await new Promise((r) =>
          setTimeout(r, BROWSE_META_BACKOFF_MS[attempt] || 1600)
        );
      }
    }
  }
  throw lastErr || new Error("browse manifest discovery failed");
}

// Discovery read: {fp, total, pageSize} when the current metadata
// build carries baked browse pages, else null (function-only mode).
// Never rejects.
function browseMeta() {
  if (!browseMetaPromise) {
    browseMetaPromise = discoverBrowseMeta().then(
      (meta) => {
        // Only success is session-sticky (see above): a null round
        // (function-only answer, or a malformed body) may be re-run
        // by the next startCatalogBrowse() call.
        if (!meta) browseMetaPromise = null;
        return meta;
      },
      () => {
        browseMetaPromise = null;
        return null;
      }
    );
  }
  return browseMetaPromise;
}

// TCB1 binary dataset discovery (Phase 2A, design §12): the catalog
// also publishes as a columnar binary dataset (scripts/build-tcb1.mjs)
// whose manifest names the browse fingerprint it was generated from.
// The binary stream engages only when that fingerprint, the record
// total and the shard size all match the browse manifest exactly —
// the dataset then provably describes the same catalog in the same
// order — and any doubt (no manifest, mismatch) leaves the JSON
// stream exactly as it was. Discovery mirrors browseMeta's
// discipline (boot-prefetch handoff first, bounded retries, only
// success is session-sticky) and is awaited at stream start on the
// same terms as browseMeta (see startCatalogBrowse for why a short
// race was removed).
let tcb1MetaPromise = null;

function tcb1MetaShape(m) {
  if (
    m && m.format === "TCB1" && m.version === 1 &&
    typeof m.total_records === "number" &&
    Number.isFinite(m.shard_size) && Number.isFinite(m.shard_count) &&
    Array.isArray(m.shards) && m.shards.length === m.shard_count &&
    m.dictionaries && typeof m.dictionaries.sha256 === "string" &&
    m.source && typeof m.source.fingerprint_sha256_concat === "string"
  ) {
    return m;
  }
  return null;
}

async function discoverTcb1Meta() {
  const boot = typeof window !== "undefined" ? window.__tcb1Manifest : null;
  const fromBoot = tcb1MetaShape(boot);
  if (fromBoot) return fromBoot;
  for (let attempt = 0; attempt < BROWSE_META_ATTEMPTS; attempt++) {
    try {
      const m = await fetchJsonOnce("/api/tcb1-manifest", BROWSE_META_TIMEOUT_MS);
      return tcb1MetaShape(m);
    } catch {
      if (attempt < BROWSE_META_ATTEMPTS - 1) {
        await new Promise((r) =>
          setTimeout(r, BROWSE_META_BACKOFF_MS[attempt] || 1600)
        );
      }
    }
  }
  return null;
}

// Discovery read for the TCB1 manifest; never rejects. Only a
// successful (well-formed) discovery is cached for the session.
export function tcb1Meta() {
  if (!tcb1MetaPromise) {
    tcb1MetaPromise = discoverTcb1Meta().then(
      (m) => {
        if (!m) tcb1MetaPromise = null;
        return m;
      },
      () => {
        tcb1MetaPromise = null;
        return null;
      }
    );
  }
  return tcb1MetaPromise;
}

// The engagement gate: the binary dataset must describe THIS browse
// build — same source fingerprint, same total, same page size (the
// shard grid must land exactly on the browse cursor grid).
function tcb1ForBrowse(tcb1, meta) {
  if (!tcb1 || !meta) return null;
  if (tcb1.source.fingerprint_sha256_concat !== meta.fp) return null;
  if (tcb1.total_records !== meta.total) return null;
  if (tcb1.shard_size !== meta.pageSize) return null;
  return tcb1;
}

// ---------------------------------------------------------------------
// Byte ledger + degradation ladder (Phase 2A, design §12; research
// §5.5 pattern 1/6): Safari exposes no memory gauge, so the loader
// accounts its own bytes deterministically — column chunks and
// dictionary growth are counted where they are allocated (per store,
// so a fallback re-base self-corrects), the dedupe index and the
// sort orders are read live, and sibling planes (the curated
// bitsets) register through noteExternalBytes. Two latched rungs,
// checked on the publish cadence: rung 1 sheds the 51 MB sort-order
// buffer (status returns to "pending" — derivations wait for the
// refetch; it must NEVER read as "failed", which is the signal that
// triggers the on-device order build the phone cannot survive);
// rung 2 narrows the fetch pipelines. Residency itself is never
// shed and no record cap exists (Joshua's 2026-11-10 uncap order).
const LEDGER_RUNG1_BYTES = 560 * 1048576;
const LEDGER_RUNG2_BYTES = 640 * 1048576;
let ledgerRung = 0;
const ledgerExternal = new Map();

export function noteExternalBytes(tag, bytes) {
  if (bytes > 0) ledgerExternal.set(tag, bytes);
  else ledgerExternal.delete(tag);
}

function storeBytes(store) {
  if (!store.__bytes) store.__bytes = { chunks: 0, dicts: 0, dictLens: null };
  return store.__bytes;
}

// Dictionary growth is sampled (at publish cadence) rather than
// counted per insert: only entries added since the last sample are
// walked, so the cost is proportional to growth, never to size.
function accountDictGrowth(store) {
  const b = storeBytes(store);
  const prev = b.dictLens || {};
  const next = {};
  for (const dictKey of ["creatorDict", "yearDict", "collDict", "fmtDict", "rightsDict", "dlDict"]) {
    const dict = store[dictKey];
    const from = prev[dictKey] || 0;
    for (let i = from; i < dict.length; i++) {
      const v = dict[i];
      b.dicts += typeof v === "string" ? utf8ByteLength(v) + 16 : 8;
    }
    next[dictKey] = dict.length;
  }
  b.dictLens = next;
}

export function getCatalogMemoryLedger() {
  const st = browseState;
  const sb = st && st.store ? storeBytes(st.store) : { chunks: 0, dicts: 0 };
  const parts = {
    columns: sb.chunks,
    dictionaries: sb.dicts,
    idIndex: st && st.store && st.store.idIndex ? st.store.idIndex.table.byteLength : 0,
    orders: browseOrdersBytes,
    external: 0,
  };
  for (const v of ledgerExternal.values()) parts.external += v;
  return {
    total: parts.columns + parts.dictionaries + parts.idIndex + parts.orders + parts.external,
    parts,
    rung: ledgerRung,
  };
}

function checkMemoryPressure() {
  const st = browseState;
  if (st && st.store) accountDictGrowth(st.store);
  const led = getCatalogMemoryLedger();
  if (typeof window !== "undefined") window.__towerLedger = led;
  if (ledgerRung === 0 && led.total >= LEDGER_RUNG1_BYTES) {
    ledgerRung = 1;
    shedBrowseOrders();
  } else if (ledgerRung === 1 && led.total >= LEDGER_RUNG2_BYTES) {
    ledgerRung = 2;
    browsePipelineWidth = 3;
    if (st && st.tcb1 && st.worker) {
      try { st.worker.postMessage({ type: "window", size: 1 }); } catch {}
    }
  }
}

// Baked sort orders (2026-11-10 completion-spike fix): the metadata
// generator bakes the five sort permutations into orders.bin beside
// the browse pages (see scripts/build-catalog-meta.mjs). The library
// derivation attaches the views instead of building the orders
// on-device at completion (the build was a sustained ~1.24 GB heap
// plateau that killed phone tabs seconds after the load finished).
// Any failure (older fingerprint without the file, size mismatch,
// network) settles as "failed" and the derivation falls back to the
// on-device build, unchanged.
//
// Scheduling (2026-11-12, audit F3): the fetch no longer fires in
// parallel with the stream. 51 MB at default priority took a full
// share of a cellular pipe from the very first second, starving the
// browse pages that produce the visible climb — for data the UI can
// only consume once the stream stops or at a non-default sort. The
// stream's discovery now only ARMS the deferred orders (reported as
// pending, so derivations wait rather than building on-device); the
// fetch starts when the stream stops (browseStop) or when the page
// first asks for a non-default sort (ensureBrowseOrders), whichever
// comes first.
let browseOrders = null; // {fp, total, order}
let browseOrdersBytes = 0; // live buffer size for the byte ledger
let browseOrdersStatus = "absent"; // absent | pending | ready | failed
const browseOrdersSettleCbs = new Set();
function settleBrowseOrders() {
  for (const cb of [...browseOrdersSettleCbs]) {
    try { cb(); } catch { /* a listener must never break the loader */ }
  }
}
export function onBrowseOrdersSettled(cb) {
  if (browseOrdersStatus === "ready" || browseOrdersStatus === "failed") {
    const t = setTimeout(cb, 0);
    return () => clearTimeout(t);
  }
  browseOrdersSettleCbs.add(cb);
  return () => browseOrdersSettleCbs.delete(cb);
}
export function getBrowseOrders() {
  // Scope mode: the baked orders are full-catalog ordinals — invalid
  // over a resident subset. Derivations build orders on-device over
  // the resident set instead (the pre-baked path, unchanged).
  if (scopeMode) return null;
  if (browseOrdersStatus !== "ready" || !browseOrders) return null;
  if (!browseState || browseState.fp !== browseOrders.fp) return null;
  return browseOrders.order;
}
export function browseOrdersPending() {
  return browseOrdersStatus === "pending";
}
function loadBrowseOrders(fp, total) {
  if (!fp || !total) {
    browseOrdersStatus = "absent";
    browseOrders = null;
    return;
  }
  if (
    browseOrders && browseOrders.fp === fp &&
    (browseOrdersStatus === "ready" || browseOrdersStatus === "pending")
  ) {
    return;
  }
  browseOrdersStatus = "pending";
  browseOrders = null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180000);
  fetch(`/browse-pages/${fp}/orders.bin`, { signal: ctrl.signal })
    .then((r) => {
      if (!r.ok) throw new Error(`orders fetch ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => {
      clearTimeout(timer);
      if (buf.byteLength !== total * 5 * 4) throw new Error("orders size mismatch");
      browseOrdersBytes = buf.byteLength;
      const all = new Uint32Array(buf);
      browseOrders = {
        fp,
        total,
        order: {
          "title-asc": all.subarray(0, total),
          "title-desc": all.subarray(total, total * 2),
          "creator-asc": all.subarray(total * 2, total * 3),
          "year-desc": all.subarray(total * 3, total * 4),
          "year-asc": all.subarray(total * 4, total * 5),
        },
      };
      browseOrdersStatus = "ready";
      settleBrowseOrders();
      // The 51 MB landing is the ledger's biggest single step: if it
      // crosses rung 1, the ladder sheds it again (once — the rung
      // latches, so a wanted refetch that lands later stays).
      checkMemoryPressure();
    })
    .catch(() => {
      clearTimeout(timer);
      browseOrders = null;
      browseOrdersBytes = 0;
      browseOrdersStatus = "failed";
      settleBrowseOrders();
    });
}

// Deferred orders registry (audit F3 scheduling, above): armed from
// the stream's discovery result; the network fetch itself waits for
// a trigger. ARMING already reports the orders as "pending" — that
// is the derivation's long-standing contract (pending = "baked
// orders are coming; publish without them and re-run on the settle
// tick — do NOT build on-device"), and it must hold from discovery
// on, exactly as it did when the fetch fired immediately. Only the
// fetch moved; the outward state machine did not.
let browseOrdersDeferred = null; // {fp, total}
let browseOrdersFetchStarted = false;
let browseOrdersWanted = false; // a sort asked before discovery landed
function armBrowseOrders(fp, total) {
  if (!browseOrdersDeferred || browseOrdersDeferred.fp !== fp) {
    browseOrdersFetchStarted = false;
  }
  browseOrdersDeferred = { fp, total };
  if (browseOrders && browseOrders.fp === fp && browseOrdersStatus === "ready") {
    return;
  }
  browseOrdersStatus = "pending";
  if (browseOrdersWanted) ensureBrowseOrders();
}
export function ensureBrowseOrders() {
  if (scopeMode) return;
  browseOrdersWanted = true;
  if (!browseOrdersDeferred || browseOrdersFetchStarted) return;
  browseOrdersFetchStarted = true;
  loadBrowseOrders(browseOrdersDeferred.fp, browseOrdersDeferred.total);
}

// Rung 1 of the memory ladder: release the sort-order buffer. The
// status returns to "pending" — the derivations' contract for
// "baked orders are coming; wait" — and NEVER to "failed", which
// would trigger the on-device order build (audit F6). The deferred
// arm stays in place, so the next ensureBrowseOrders() (a sort tap,
// or the refetch timer below when a sort already wanted them)
// brings the orders back.
function shedBrowseOrders() {
  if (browseOrdersStatus !== "ready" || !browseOrders) return;
  browseOrders = null;
  browseOrdersBytes = 0;
  browseOrdersStatus = "pending";
  browseOrdersFetchStarted = false;
  settleBrowseOrders();
  if (browseOrdersWanted) {
    setTimeout(() => {
      if (browseOrdersStatus === "pending") ensureBrowseOrders();
    }, 15000);
  }
}

// ---------------------------------------------------------------------
// Browse worker (2026-11-11 phone load fix): the stream's fetch +
// JSON.parse + transpose + dedupe move into a Web Worker
// (browse-worker.js), because on a real phone the main-thread version
// saturated the UI thread — the counter froze for seconds at a time
// and the page tore while scrolling (Joshua's 2026-11-11 video: 19 s
// before the first page landed, ~7.3k records/s, ghosting header).
// The worker posts back transposed page payloads (catalog-core.js
// transpose sessions); the main thread only COMMITS them into the
// column store: extend the global dictionaries with the page's fresh
// values, remap the page's session-local codes through them, and bulk
// write the columns. A commit is a few ms of typed-array work per
// page — no parse, no per-record object touches. If the worker cannot
// start or dies, the stream falls back to the main-thread pipeline
// below with identical semantics (browseWorkerFallback).
const COMMIT_COLUMNS = [
  ["creator", "creatorMap", "creatorDict", "creatorCode"],
  ["year", "yearMap", "yearDict", "yearCode"],
  ["coll", "collMap", "collDict", "collCode"],
  ["fmt", "fmtMap", "fmtDict", "fmtCode"],
  ["rights", "rightsMap", "rightsDict", "rightsCode"],
  ["dl", "dlMap", "dlDict", "dlCode"],
];

export function createCodeRemap() {
  const remap = { len: {} };
  for (const [key] of COMMIT_COLUMNS) {
    remap[key] = new Uint32Array(1024);
    remap.len[key] = 0;
  }
  return remap;
}

function colEnsure(col, extra) {
  const need = col.n + extra;
  if (col.a.length >= need) return;
  let cap = col.a.length * 2;
  while (cap < need) cap *= 2;
  const na = new col.a.constructor(cap);
  na.set(col.a);
  col.a = na;
}

// Commit one worker-transposed chunk into the store. Byte-for-byte
// the same columns appendRecordsToStore would have built from the
// same records (the transpose session mirrors its dedupe and text
// passes; the parity gate in test-transpose-parity.mjs proves the
// equivalence over adversarial batches).
export function commitTransposedChunk(store, remap, payload) {
  const n = payload.n;
  const start = store.count;
  const chunkIndex = store.chunks.length;
  store.chunks.push({
    start,
    idBytes: payload.idBytes,
    idOff: payload.idOff,
    titleBytes: payload.titleBytes,
    titleOff: payload.titleOff,
  });
  // Byte ledger (design §12): chunk text + offset tables + the
  // chunk-index column (Uint16 per record); code columns below are
  // counted from the payload's own arrays.
  const sb = storeBytes(store);
  sb.chunks +=
    payload.idBytes.byteLength + payload.idOff.byteLength +
    payload.titleBytes.byteLength + payload.titleOff.byteLength + n * 2;
  for (const key of Object.keys(payload.codes || {})) {
    sb.chunks += payload.codes[key].byteLength;
  }
  if (!n) return;
  colEnsure(store.chunkIdx, n);
  for (let j = 0; j < n; j++) store.chunkIdx.a[store.chunkIdx.n + j] = chunkIndex;
  store.chunkIdx.n += n;
  for (const [key, mapKey, dictKey, colKey] of COMMIT_COLUMNS) {
    let rm = remap[key];
    const fresh = payload.fresh[key] || [];
    const base = remap.len[key];
    if (rm.length < base + fresh.length) {
      let cap = Math.max(1024, rm.length * 2);
      while (cap < base + fresh.length) cap *= 2;
      const nr = new Uint32Array(cap);
      nr.set(rm);
      rm = nr;
      remap[key] = nr;
    }
    for (let k = 0; k < fresh.length; k++) {
      // Map-free interning (2026-11-13 load-state fix, defect 3): a
      // transpose session ships each dictionary value as `fresh`
      // exactly once in its life — its session-side map guarantees
      // first-ship-only, and both sessions' dictionaries survive
      // resetTo untouched, so a value can never be re-shipped after
      // a resume either. The global code is therefore simply the
      // dictionary's next slot, identical to what dictCode would
      // return, and the store's Maps stay empty in worker mode.
      // That deletes the ~1.07M-entry creator Map (and its pinned
      // key strings' table overhead) from the main thread's peak
      // footprint. The main-thread fallback path interns through
      // dictCode + the Maps as before; browseWorkerFallback rebuilds
      // the Maps from the dictionaries before any fallback append
      // can run against a worker-built store.
      rm[base + k] = store[dictKey].length;
      store[dictKey].push(fresh[k]);
    }
    remap.len[key] = base + fresh.length;
    const col = store[colKey];
    colEnsure(col, n);
    const codes = payload.codes[key];
    const out = col.a;
    const from = col.n;
    for (let j = 0; j < n; j++) out[from + j] = rm[codes[j]];
    col.n += n;
  }
  // Ordinal column: transposed chunks arrive in catalog order (the
  // stream consumes the catalog front to back), so a committed
  // record's ordinal is its resident position at commit time.
  colEnsure(store.ordCode, n);
  for (let j = 0; j < n; j++) store.ordCode.a[store.ordCode.n + j] = start + j;
  store.ordCode.n += n;
  store.count += n;
}

function browsePublishNow(complete) {
  const st = browseState;
  if (!st || !st.store) return;
  st.lastPubAt = Date.now();
  // Stall clock: a publish that carries a moved frontier or a grown
  // store is progress; a republish of the same state is not.
  if (st.progCount !== st.store.count || st.progCursor !== st.cursor) {
    st.progCount = st.store.count;
    st.progCursor = st.cursor;
    st.progAt = st.lastPubAt;
  }
  // Publish a view snapshot: the page's derivations key off identity,
  // and the columns keep growing between publishes — the view pins
  // the length it was published with, like the old array slice did.
  publishLegacyIndex(createCatalogView(st.store, st.store.count), complete);
  // Byte-ledger pressure check on the publish cadence (design §12).
  checkMemoryPressure();
}
function browsePublish(complete) {
  const st = browseState;
  if (!st) return;
  if (complete) {
    if (st.pubTimer) { clearTimeout(st.pubTimer); st.pubTimer = null; }
    browsePublishNow(true);
    return;
  }
  const wait = BROWSE_PUBLISH_MS - (Date.now() - (st.lastPubAt || 0));
  if (!st.lastPubAt || wait <= 0) { browsePublishNow(false); return; }
  if (!st.pubTimer) {
    st.pubTimer = setTimeout(() => {
      st.pubTimer = null;
      browsePublishNow(false);
    }, wait);
  }
}

// Start the browse worker for a fresh stream state. Returns false
// when no worker could be created (the caller then runs the
// main-thread pipeline, unchanged). The bootstrap body is HANDED to
// the worker in the begin message (2026-11-12, audit F2): the main
// thread already holds it parsed — it is the resident prefix the
// start cursor names — while the worker's own re-fetch of the same
// 5.3 MB file queued behind its eight page fetches on a congested
// link and gated EVERY transpose (nothing committed until the base
// landed), which is exactly the long flat stretch at 20,000 in
// Joshua's recordings. The worker still falls back to its own read
// if no body arrives. The worker transposes the base as the store's
// base, then pipelines the browse pages — its first page fetch fires
// the moment it starts, never waiting on the base transpose the way
// the old begin() pre-transpose blocked browseLaunch.
function browseWorkerBegin(st, meta, tcb1) {
  let worker;
  try {
    worker = new Worker(new URL("./browse-worker.js", import.meta.url), {
      type: "module",
    });
  } catch {
    return false;
  }
  st.workerMode = true;
  st.worker = worker;
  st.tcb1 = !!tcb1;
  st.baseDone = false;
  st.remap = createCodeRemap();
  st.store = createColumnStore(meta ? meta.total : 0);
  const onVis = () => {
    if (browseState !== st) return;
    if (browseIsHidden()) {
      try { worker.postMessage({ type: "pause" }); } catch {}
    } else {
      try { worker.postMessage({ type: "resume" }); } catch {}
      if (!st.stopped) browseAppend(st);
    }
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVis);
  }
  st.visCleanup = () => {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVis);
    }
  };
  worker.onmessage = (e) => {
    if (browseState !== st || st.worker !== worker) return;
    const m = e.data || {};
    // Byte-ledger honesty (2026-11-13): the worker reports the
    // footprint it pins off-thread with every payload; folding it
    // into the ledger's external account is what makes the
    // degradation ladder see the stream's true total (it previously
    // counted only this thread's store and never engaged).
    if (typeof m.workerBytes === "number") {
      noteExternalBytes("browse-worker", m.workerBytes);
    }
    if (m.type === "base") {
      st.buffer.set(-1, {
        transposed: m.payload,
        total: m.total,
        next_cursor: m.nextCursor,
      });
      browseAppend(st);
    } else if (m.type === "page") {
      st.buffer.set(m.cursor, {
        transposed: m.payload,
        rawCount: m.rawCount,
        total: m.total,
        next_cursor: m.nextCursor,
      });
      browseAppend(st);
    } else if (m.type === "failed") {
      if (st.failedAt == null || m.cursor < st.failedAt) st.failedAt = m.cursor;
      browseAppend(st);
    } else if (m.type === "error") {
      browseWorkerFallback(st);
    }
  };
  worker.onerror = () => browseWorkerFallback(st);
  try {
    worker.postMessage({
      type: "begin",
      fp: meta ? meta.fp : null,
      pageSize: st.pageSize,
      total: meta ? meta.total : null,
      apiPage: BROWSE_API_PAGE,
      startCursor: st.cursor,
      // TCB1 mode (design §12): the validated binary-dataset
      // manifest. The worker decodes shard 0 as the base chunk
      // itself — no JSON bootstrap handoff is needed or used.
      tcb1: tcb1 || undefined,
      // The handoff (above): only when the cached bootstrap IS the
      // prefix the cursor names — the worker verifies the length
      // itself and falls back to its own fetch on any mismatch.
      bootstrap:
        !tcb1 && bootstrapCache && bootstrapCache.length === st.cursor
          ? bootstrapCache
          : undefined,
    });
  } catch {
    browseWorkerFallback(st);
  }
  return true;
}

// TCB1 flow control: one ack per committed chunk releases the
// worker to decode the next shard (its window is 1–2 chunks). Acks
// are posted only in TCB1 mode; the JSON pipeline is self-paced.
function browseAck(st) {
  if (!st.tcb1 || !st.worker) return;
  try { st.worker.postMessage({ type: "ack" }); } catch {}
}

// The worker failed (could not start, crashed, or its bootstrap read
// failed): hand the stream to the main-thread pipeline with the
// failure semantics the stream has always had. Committed chunks stay
// committed — the main-thread appends continue from the append
// frontier, and ensureStoreIndex backfills the dedupe index over the
// committed residents on the first append. If nothing was committed
// yet, the store re-bases on the resident prefix exactly as the
// main-thread path would have.
function browseWorkerFallback(st) {
  if (!st.workerMode) return;
  st.workerMode = false;
  st.tcb1 = false;
  if (st.visCleanup) { st.visCleanup(); st.visCleanup = null; }
  if (st.worker) {
    try { st.worker.terminate(); } catch {}
    st.worker = null;
  }
  // The worker is gone: its off-thread footprint leaves the ledger.
  noteExternalBytes("browse-worker", 0);
  st.buffer.clear();
  st.inflight = 0;
  st.failedAt = null;
  if (!st.store || (st.store.count === 0 && !st.baseDone)) {
    st.store = null;
    st.baseDone = false;
  } else {
    // The kept store was built by worker commits, which intern
    // map-free (see commitTransposedChunk): its dictionary Maps are
    // empty. The main-thread appends that follow intern through
    // dictCode + the Maps, so rebuild them from the dictionaries
    // first — one pass, on this rare path only. Dictionary values
    // are unique by construction, so the rebuild is exact.
    for (const [, mapKey, dictKey] of COMMIT_COLUMNS) {
      const dict = st.store[dictKey];
      const map = new Map();
      for (let i = 0; i < dict.length; i++) map.set(dict[i], i);
      st.store[mapKey] = map;
    }
  }
  st.fetchCursor = st.cursor;
  if (!st.stopped && browseState === st) browseLaunch(st);
}

// One page fetch with the stream's long-standing retry rule: try
// twice, then report failure (null) — the caller stops the stream and
// keeps what has arrived. A malformed body counts as a failure. One
// attempt = the static page when this run has a fingerprint, else
// (and on any static failure) the function endpoint; in static mode a
// function page is assembled from BROWSE_API_PAGE-sized subrequests
// so the returned body always spans the run's full page size and the
// cursor arithmetic never has to care which source served it.
async function browseFetchPageOnce(cursor, st) {
  if (st.fp) {
    try {
      const idx = Math.floor(cursor / st.pageSize);
      const body = await fetchJsonOnce(
        `/browse-pages/${st.fp}/page-${String(idx).padStart(4, "0")}.json`
      );
      if (body && Array.isArray(body.results)) return body;
    } catch {
      // fall through to the function assembly
    }
  }
  try {
    const subs = [];
    for (let c = cursor; c < cursor + st.pageSize; c += BROWSE_API_PAGE) subs.push(c);
    const bodies = await Promise.all(
      subs.map((c) =>
        fetchJsonOnce(`/api/catalog-search?cursor=${c}&pagesize=${BROWSE_API_PAGE}`).catch(() => null)
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

async function browseFetchPage(cursor, st) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const body = await browseFetchPageOnce(cursor, st);
    if (body) return body;
  }
  return null;
}

function browseIsHidden() {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function browseWaitAndLaunch(st) {
  if (st.timer) return;
  st.timer = setTimeout(() => {
    st.timer = null;
    if (browseState === st && !st.stopped) {
      // Worker mode owns its fetch pipeline, but APPENDS are driven
      // from this thread — and browseLaunch returns immediately in
      // worker mode, so routing the retry there dead-ends the chain:
      // a single hidden sample during an append used to strand the
      // stream (and any mid-stream selection) permanently, because
      // nothing ever called browseAppend again (2026-11-15 early-tap
      // fix; the gate's frozen 496,944 Law count). Re-drive the
      // append loop itself; while hidden it re-arms here at the same
      // cadence and self-heals the moment visibility returns.
      if (st.workerMode) browseAppend(st);
      else browseLaunch(st);
    }
  }, 1500);
}

function browseStop(st, complete) {
  st.stopped = true;
  st.onDemand = false;
  st.buffer.clear();
  if (st.timer) { clearTimeout(st.timer); st.timer = null; }
  if (st.appendTimer) { clearTimeout(st.appendTimer); st.appendTimer = null; }
  if (st.workerMode && st.worker) {
    if (complete) {
      // A completed stream never appends again: retire the worker.
      if (st.visCleanup) { st.visCleanup(); st.visCleanup = null; }
      try { st.worker.terminate(); } catch {}
      st.worker = null;
      // Its off-thread footprint leaves the ledger with it.
      noteExternalBytes("browse-worker", 0);
    } else {
      // Stopped early (a page failed): keep the worker for the
      // resume reset, but stop it fetching ahead into the void.
      try { st.worker.postMessage({ type: "pause" }); } catch {}
    }
  }
  // A completed stream never appends again: drop the dedupe hash
  // table (~33 MB at full scale). A stopped-early stream keeps it —
  // resume appends against it.
  if (complete && st.store) st.store.idIndex = null;
  // Deferred orders (audit F3): any stop — completion, exhaustion
  // with a deduped count a few records under the server total (the
  // publish's complete flag above keys off that comparison, the
  // stream's workload does not), a page failure, an on-demand pause
  // — means the stream has stopped consuming the pipe, so the 51 MB
  // orders fetch may start now. It starts BEFORE the publish below,
  // so the derivation that publish triggers sees the fetch in flight
  // under the armed "pending" state and waits on the settle callback
  // rather than building orders on-device.
  ensureBrowseOrders();
  browsePublish(!!complete);
}

// Defer the rest of a burst to a fresh task: buffered pages remain
// in st.buffer and the frontier has not moved, so re-entry continues
// exactly where this task stopped.
function browseContinueAppend(st) {
  if (st.appendTimer) return;
  st.appendTimer = setTimeout(() => {
    st.appendTimer = null;
    if (browseState === st && !st.stopped) browseAppend(st);
  }, 0);
}

// Base the column store on the resident prefix (the bootstrap, a
// verified exact prefix of the browse order), once. begin() calls
// this eagerly so the transpose overlaps the first pages' flight;
// browseAppend calls it lazily on the paths begin() skipped.
function browseEnsureStore(st) {
  if (st.store) return;
  st.store = createColumnStore(st.total || 0);
  appendRecordsToStore(st.store, indexCache || bootstrapCache || []);
  st.cursor = st.store.count;
}

// Append buffered pages that continue the resident prefix, in cursor
// order — at most APPEND_BURST_PAGES per task (see the constant).
// st.cursor is always the append frontier (the next cursor the prefix
// needs), never the fetch frontier, so a resume re-enters exactly
// where appending stopped.
function browseAppend(st) {
  let burst = 0;
  if (st.workerMode && !st.baseDone) {
    // Worker mode: the worker's bootstrap chunk is the store's base
    // and must commit before any page (its dedupe and chunk order
    // assume the prefix). It lands in the buffer under the -1 key.
    // Until it arrives there is nothing to append — pages the worker
    // already transposed wait in the buffer behind it.
    const base = st.buffer.get(-1);
    if (!base) return;
    if (browseIsHidden()) { browseWaitAndLaunch(st); return; }
    st.buffer.delete(-1);
    commitTransposedChunk(st.store, st.remap, base.transposed);
    st.baseDone = true;
    st.cursor = base.next_cursor != null ? base.next_cursor : st.store.count;
    browseAck(st);
    burst = 1;
  } else if (!st.store) {
    browseEnsureStore(st);
    burst = 1;
  }
  while (!st.stopped) {
    if (st.failedAt != null && st.cursor >= st.failedAt) {
      // The page at the frontier failed twice: stop, keeping
      // everything appended before it (the sequential semantics).
      browseStop(st, false);
      return;
    }
    const body = st.buffer.get(st.cursor);
    if (!body) return;
    if (browseIsHidden()) { browseWaitAndLaunch(st); return; }
    if (burst >= APPEND_BURST_PAGES) { browseContinueAppend(st); return; }
    burst++;
    st.buffer.delete(st.cursor);
    if (typeof body.total === "number") st.total = body.total;
    // The cursor addresses the server-side catalog order; the resident
    // prefix follows the same order. If a page would start behind the
    // resident prefix (orders diverged), trust the page's own cursor
    // arithmetic below and dedupe by id instead of double-adding.
    // Worker-mode bodies arrive pre-transposed: committing one is a
    // dictionary remap + bulk column writes, no parse or transpose.
    if (body.transposed) commitTransposedChunk(st.store, st.remap, body.transposed);
    else appendRecordsToStore(st.store, body.results);
    const rawLen = body.transposed ? body.rawCount : body.results.length;
    st.cursor = body.next_cursor != null
      ? body.next_cursor
      : (st.total != null ? st.total : st.cursor + rawLen);
    browseAck(st);
    const exhausted = body.next_cursor == null || rawLen === 0;
    if (exhausted) {
      // Everything the server has is now resident: that IS the full
      // catalog for this page, so the final publish may say complete.
      // Exhaustion is completion, unconditionally (2026-11-14 crash
      // fix): the old count comparison (resident unique >= server
      // total) can never hold on a catalog whose dedupe drops records
      // — this catalog's 5 duplicate ids leave the resident count at
      // 2,557,918 against a 2,557,923 total — so every fully-loaded
      // session stopped as "incomplete": the worker was only paused,
      // pinning its TCB1 session (~190 MB) plus the store's dedupe
      // table (~33 MB) under every post-load tap until iOS jetsam
      // killed the page (Joshua's 2026-11-14 recording). Nothing can
      // resume an exhausted stream (browseResume already no-ops on
      // an exhausted cursor), so retiring the worker here loses no
      // path. The page-failure and on-demand stops below keep
      // complete=false — resume is real there.
      browseStop(st, true);
      return;
    }
    if (st.onDemand && st.store.count >= st.stopAt) {
      browseStop(st, false);
      return;
    }
    browsePublish(false);
  }
}

// Keep up to BROWSE_PIPELINE page requests in flight, at precomputed
// cursors (valid because browse paging is pure offset arithmetic).
// Handlers from a superseded run (start/resume bumped runId) return
// without touching the counters.
function browseLaunch(st) {
  if (browseState !== st || st.stopped) return;
  // Worker mode owns its fetch pipeline; the main-thread launcher is
  // only for the fallback path (which clears workerMode first).
  if (st.workerMode) return;
  if (browseIsHidden()) { browseWaitAndLaunch(st); return; }
  while (st.inflight < browsePipelineWidth) {
    if (st.failedAt != null && st.fetchCursor >= st.failedAt) return;
    if (st.total != null && st.fetchCursor >= st.total) return;
    const cursor = st.fetchCursor;
    st.fetchCursor += st.pageSize;
    st.inflight++;
    const runId = st.runId;
    browseFetchPage(cursor, st).then((body) => {
      if (browseState !== st || st.runId !== runId) return;
      st.inflight--;
      if (st.stopped) return;
      if (body == null) {
        if (st.failedAt == null || cursor < st.failedAt) st.failedAt = cursor;
      } else {
        st.buffer.set(cursor, body);
      }
      browseAppend(st);
      browseLaunch(st);
    });
  }
}

// Start-path discovery budgets (2026-11-13 loadfix-v3): begin() used
// to await BOTH manifest discoveries for as long as their retry
// discipline could burn — three 12 s attempts plus backoffs, ~38 s
// per endpoint — before the stream existed at all. Against a
// degraded function layer (Cloudflare's own numbers for the hour of
// Joshua's 17:01 recording: ~1/3 of manifest requests 504ing) that
// left the page sitting on the bootstrap prefix for the whole
// window, and the panel presented the prefix as final. Discovery
// itself keeps its full discipline in the background — a success is
// session-sticky and a later stream start picks it up — but the
// START proceeds with whatever is known when the budget expires:
// no browse manifest yet means function mode (a supported mode with
// the same data, whose page bodies carry the total), and no TCB1
// manifest yet means the JSON page stream (the pre-2A path). The
// budgets sit far above a healthy manifest's latency — the boot
// prefetch usually has both before the bundle parses — and far
// below the retry burn they replace.
//
// The TCB1 budget is the generous one, deliberately: TCB1 is the
// difference between a ~107 MB load and a ~795 MB one, and the
// JSON stream it falls back to parses 20,000-record pages under a
// 30 s fetch timeout that a throttled phone-class CPU can exceed
// on parse time alone (measured on the phone profile: 9–37 s per
// page) — a slow-but-alive TCB1 endpoint is worth waiting for.
// Twenty seconds still halves the hung-endpoint burn, and the
// panel stays honest for every second of the wait.
const BROWSE_START_META_BUDGET_MS = 15000;
const BROWSE_START_TCB1_BUDGET_MS = 20000;

function withStartBudget(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

// ---------------------------------------------------------------------
// Selection-driven loading (2026-11-20, Joshua's directive).
//
// The library page no longer streams the whole catalog in the
// background. Boot = the bootstrap prefix (the first 20,000 records,
// the verified head of the catalog) in a column store, plus the
// navigation layer (hub counts, facet tallies, curated bitsets —
// all server- or bitset-derived, none of it record data). Selecting
// a filter scope loads THAT scope's records, completely, through
// the server, and appends them to the same store:
//
//   - collection / bucket / era scopes page /api/catalog-search
//     with the matching facet filter (era scopes use the facet
//     file's coarse bands, which contain the client era — the
//     client-side era derivation still defines the results);
//   - curated / Books-shelf / Papers-axis scopes resolve their
//     catalog-index bitset to member ordinals on the client and
//     hydrate exactly those records via /api/catalog-hydrate,
//     block-packed so each request stays inside the function's
//     subrequest budget;
//   - the unfiltered list pages the same search endpoint by cursor
//     ("browse" scope) as the visitor asks for more rows.
//
// Loaded scopes ACCUMULATE: appends dedupe by artifact_id, nothing
// is ever evicted, and deselecting a filter never unloads. Every
// appended record carries its catalog ordinal (_idx from the
// server, stored in the store's ordCode column), so the curated
// bitsets and facet tallies — which live in catalog-index space —
// stay exact over the resident subset via pages.jsx's translation.
//
// Loads are serialized through one queue (never a parallel storm),
// each page fetch carries the boot path's retry discipline, and
// views publish through the same publishIndex contract the stream
// used: complete=false while any scope is in flight, complete=true
// when the queue drains — the settled signal derivations key off.
let scopeMode = false;
let scopeStore = null;
const scopeMap = new Map(); // key -> { status, total, loaded, kind, filters, indices }
// Priority scope queue (2026-11-20 correction): the first version
// chained every scope onto one promise, so a mega-scope (LAW = 639
// pages) starved every later selection behind its full run, and a
// scope's total only became known when its first page landed —
// minutes in, if the queue ahead was long. The queue is now a
// priority list drained by one worker: enqueueing a scope for the
// CURRENT selection bumps every not-yet-started scope of that
// selection to the front, and the running scope yields between
// steps to a bumped scope (its runner re-queues itself at the
// front and resumes from its saved cursor). One SCOPE at a time
// still — but a step fetches a bounded batch of its own pages
// concurrently (SCOPE_PARALLEL) and appends them in order, so
// the serialization that protects priority and yield semantics
// lives between steps, not between pages — and the visitor's
// latest tap always loads next.
let scopeQueue = []; // [{ key, rec, runner, seq }]
let scopeSeq = 0;
let scopeWorkerRunning = false;
let scopeActive = 0; // scopes queued or running
// Scope completeness gate (2026-11-20 correction, second pass):
// at scope init the queue drains vacuously — the one-step browse
// scope completes instantly, before any CONTENT scope (facet /
// bits) has ever run. Derivations keyed on "queue empty" alone
// read that instant as "the resident set is final" and paid the
// full-derivation tail (on-device sort orders + search layer over
// proxy records — minutes under phone-class load) over the bare
// bootstrap prefix; while that one run ground on, growth could
// not cancel it and every trailing phase-0 run queued behind it,
// so landed scope pages never became results (Law sat at 0 for
// the whole session — the exact failure this lane exists to fix).
// "Complete" in scope mode therefore requires at least one
// content scope to have run to completion; until then the queue
// being empty means "nothing has loaded yet", not "settled".
let scopeContentDone = false;
let scopeTotalHint = 0;
let browseScopeCursor = 0; // unfiltered-browse ordinal frontier
let browseScopeDone = false;
let browseRowsWanted = 0;
// Scope-state subscribers (2026-11-20 correction): the filter panel
// needs scope status/total/loaded as STATE — which scopes are
// loading, each selected scope's TRUE server total (known from its
// first page, and for bitset scopes from the bitset itself before
// any fetch), and how much has landed — so it can show true totals
// with an honest loading state instead of deriving "final" counts
// from the resident prefix. Version bumps on every scope-state
// change; getScopeSnapshot() returns a plain map for React state.
const scopeListeners = new Set();
let scopeVersion = 0;
function scopeNotify() {
  scopeVersion++;
  const snap = getScopeSnapshot();
  scopeListeners.forEach((cb) => {
    try { cb(snap, scopeVersion); } catch {}
  });
}
export function onScopeChange(cb) {
  scopeListeners.add(cb);
  return () => { scopeListeners.delete(cb); };
}
export function getScopeSnapshot() {
  const out = {};
  for (const [k, r] of scopeMap) {
    out[k] = { status: r.status, total: r.total || 0, loaded: r.loaded || 0, kind: r.kind || "" };
  }
  return out;
}

export function isScopeMode() {
  return scopeMode;
}

// Enter scope mode over the bootstrap base. Idempotent; called by
// the library section once the bootstrap array is in hand (server
// mode only — the ?server=0 client pipeline never calls it).
export function initScopeMode(baseRecords) {
  if (scopeMode || indexComplete || indexPending) return;
  scopeMode = true;
  scopeStore = createColumnStore(0);
  const n = baseRecords ? baseRecords.length : 0;
  if (n) appendRecordsToStore(scopeStore, baseRecords);
  browseScopeCursor = scopeStore.count;
  scopePublish(true);
  browseMeta()
    .then((m) => {
      if (m && m.total) scopeTotalHint = m.total;
    })
    .catch(() => {});
}

function scopePublish(complete) {
  if (!scopeStore) return;
  // Stand down if the legacy client index has taken the cache (the
  // hub-fallback path for curated selections whose bitsets failed):
  // the two publishers must never interleave views. Keyed on
  // legacyPublishActive — set only by actual legacy publishes —
  // plus a legacy load in flight; NOT on indexComplete, which
  // scope mode's own complete publishes also latch (that inference
  // froze the published view at the bootstrap snapshot for entire
  // sessions while the scope store grew underneath it).
  if (legacyPublishActive || indexPending) return;
  publishIndex(createCatalogView(scopeStore, scopeStore.count), complete);
}

const SCOPE_PAGE = 5000;
// Pages in flight per scope step (2026-11-20 counts-speed fix): a
// facet scope's pages are pure offset slices of one posting list
// — every cursor is computable in advance — so a step fetches
// SCOPE_PARALLEL pages concurrently and appends them strictly in
// cursor order, publishing once per batch. The serialized
// one-page-at-a-time drain cost ~0.7–1 s per 2,000-record page:
// Reference (41,137) took 15–20 s of pure stepping and Law
// (1,277,197, 639 pages) could never finish in a session
// (Joshua's 2026-11-20 16:27 recording). The worker still runs
// ONE scope at a time — priority tiers and the yield between
// steps are unchanged, so a bumped selection still preempts
// between batches — the parallelism lives inside the step,
// bounded at SCOPE_PARALLEL pages of SCOPE_PAGE records.
const SCOPE_PARALLEL = 4;
const SCOPE_FETCH_DELAYS_MS = [600, 1800, 4000];

// Packed page decode (2026-11-20 counts-speed fix): scope fetches
// ask the catalog endpoints for the packed shape (field names
// hoisted to a `fields` array, low-cardinality string fields
// dictionary-encoded — see functions/_lib/packed-records.js) and
// rebuild the classic record objects here, so every consumer
// downstream of scopeFetchJson sees exactly the shape it always
// has. A response without the pack marker passes through
// untouched. A cell is a dictionary index only when its field has
// a dict and the cell is a number; nulls stay nulls (the packer
// also writes null for a key a record doesn't carry — consumers
// read values, never key presence).
function unpackScopeResponse(data) {
  if (
    !data ||
    data.pack !== 1 ||
    !Array.isArray(data.rows) ||
    !Array.isArray(data.fields)
  ) {
    return data;
  }
  const fields = data.fields;
  const dict = data.dict || {};
  const rows = data.rows;
  const results = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rec = {};
    for (let j = 0; j < fields.length; j++) {
      const f = fields[j];
      const cell = row[j];
      const d = dict[f];
      rec[f] = d && typeof cell === "number" ? d[cell] : cell;
    }
    results[i] = rec;
  }
  const out = { ...data, results };
  delete out.rows;
  delete out.fields;
  delete out.dict;
  delete out.pack;
  return out;
}

// One JSON fetch (GET, or POST with a JSON body) under the boot
// path's retry discipline: spaced attempts with growing backoff, a
// per-attempt abort, and no failure caching — a scope that exhausts
// its attempts is marked failed and a later ensure retries it whole.
async function scopeFetchJson(url, body) {
  let lastErr = null;
  for (let a = 0; a <= SCOPE_FETCH_DELAYS_MS.length; a++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        ...(body
          ? {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      if (!r.ok) throw new Error(`scope fetch ${r.status}: ${url}`);
      return unpackScopeResponse(await r.json());
    } catch (e) {
      lastErr = e;
      if (a < SCOPE_FETCH_DELAYS_MS.length) {
        await new Promise((res) => setTimeout(res, SCOPE_FETCH_DELAYS_MS[a]));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error(`scope fetch failed: ${url}`);
}

// Fetch one facet-scope page at an explicit cursor. The runner is
// resumable by construction (2026-11-20 correction): the cursor
// lives on the scope record, so a scope that yields to a newer
// selection — or restarts after a failure — resumes from the page
// it stopped at instead of re-offering every page (dedupe made
// the old restart-from-zero safe but not free). Pages arrive in
// the packed shape (pack=1) and are decoded by scopeFetchJson.
async function fetchFacetScopePage(rec, cursor) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(rec.filters || {})) if (v) params.set(k, v);
  params.set("cursor", String(cursor));
  params.set("pagesize", String(SCOPE_PAGE));
  params.set("pack", "1");
  const out = await scopeFetchJson(`/api/catalog-search?${params.toString()}`);
  if (!out || !Array.isArray(out.results)) {
    throw new Error("facet scope page malformed");
  }
  return out;
}

// One step of a facet scope: fetch a batch of pages concurrently,
// append strictly in cursor order (2026-11-20 counts-speed fix —
// see SCOPE_PARALLEL). A page that fails mid-batch stops the
// walk: the successful prefix stays appended, rec.cursor points
// at the failed page, and the step reports progress (not done),
// so the next step resumes exactly there — appended pages are
// never refetched and the scope never restarts at page 0. Only a
// failure of the batch's FIRST page throws (the drain's existing
// failure path: the scope is marked failed and a later ensure
// resumes it from rec.cursor).
async function stepFacetScope(rec) {
  const start = rec.cursor || 0;
  let nPages = SCOPE_PARALLEL;
  // rec.total starts at 0 meaning "unknown" (enqueueScope's
  // initial value; the first page's response sets it) — only a
  // positive total bounds the batch. A scope whose true total is
  // 0 still pages once and exhausts on the empty first page.
  if (typeof rec.total === "number" && rec.total > 0) {
    if (rec.total <= start) return true;
    nPages = Math.min(
      SCOPE_PARALLEL,
      Math.ceil((rec.total - start) / SCOPE_PAGE),
    );
  }
  const cursors = [];
  for (let k = 0; k < nPages; k++) cursors.push(start + k * SCOPE_PAGE);
  const pages = await Promise.all(
    cursors.map((cursor) =>
      fetchFacetScopePage(rec, cursor).then(
        (out) => ({ cursor, out }),
        (err) => ({ cursor, err }),
      ),
    ),
  );
  pages.sort((a, b) => a.cursor - b.cursor);
  let expected = start;
  let appended = false;
  for (const page of pages) {
    if (page.err || page.cursor !== expected) {
      if (!appended) {
        throw page.err || new Error("facet scope page gap");
      }
      break;
    }
    const out = page.out;
    if (typeof out.total === "number" && out.total !== rec.total) {
      rec.total = out.total;
    }
    appendRecordsToStore(scopeStore, out.results);
    appended = true;
    if (out.next_cursor == null || out.next_cursor <= page.cursor) {
      // A non-advancing cursor is treated as exhaustion: the scope
      // queue runs one scope at a time, so a looping scope would
      // starve every later selection.
      rec.loaded = rec.total || page.cursor + out.results.length;
      return true;
    }
    expected = out.next_cursor;
  }
  rec.cursor = expected;
  rec.loaded = expected;
  scopePublish(false);
  scopeNotify();
  return false;
}

// Hydrate packing discipline: each POST carries at most 1500
// indices spanning at most 40 record blocks — the packing is what
// keeps every invocation inside the function's subrequest budget
// while guaranteeing every requested ordinal is hydratable in
// that same invocation (no partial-page retries).
const HYDRATE_MAX_INDICES = 1500;
const HYDRATE_MAX_BLOCKS = 40;
// The hydrate window starting at i: the maximal run bounded by
// HYDRATE_MAX_INDICES indices and HYDRATE_MAX_BLOCKS distinct
// record blocks. Pure function of (indices, i) — windows are
// computable in advance, which is what lets a step fetch several
// of them concurrently and append in order.
function hydrateWindowEnd(indices, i) {
  let j = i;
  let blocks = 0;
  let lastBlock = -1;
  while (j < indices.length && j - i < HYDRATE_MAX_INDICES) {
    const b = Math.floor(indices[j] / 1000);
    if (b !== lastBlock) {
      if (blocks >= HYDRATE_MAX_BLOCKS) break;
      blocks++;
      lastBlock = b;
    }
    j++;
  }
  return j;
}

// One step of an indices (bits) scope: fetch up to SCOPE_PARALLEL
// hydrate windows concurrently, append strictly in window order,
// publish once (2026-11-20 counts-speed fix — a member selection
// like Anatomy & Physiology, 7,323 members, previously hydrated
// one ≤1,500-index window per serialized step). Failure semantics
// mirror stepFacetScope: a mid-batch failure keeps the appended
// prefix and resumes at the failed window; a first-window failure
// throws into the drain's failure path.
async function stepIndicesScope(rec) {
  const indices = rec.indices || [];
  const windows = [];
  let pos = rec.pos || 0;
  while (windows.length < SCOPE_PARALLEL && pos < indices.length) {
    const end = hydrateWindowEnd(indices, pos);
    if (end <= pos) break;
    windows.push([pos, end]);
    pos = end;
  }
  if (!windows.length) return true;
  const pages = await Promise.all(
    windows.map(([i, j]) =>
      scopeFetchJson("/api/catalog-hydrate", {
        indices: indices.slice(i, j),
        pack: 1,
      }).then(
        (out) => {
          if (!out || !Array.isArray(out.results)) {
            return { i, j, err: new Error("hydrate scope page malformed") };
          }
          return { i, j, out };
        },
        (err) => ({ i, j, err }),
      ),
    ),
  );
  let appended = false;
  for (const page of pages) {
    if (page.err) {
      if (!appended) throw page.err;
      break;
    }
    appendRecordsToStore(scopeStore, page.out.results);
    rec.loaded = page.j;
    rec.pos = page.j;
    appended = true;
  }
  if (rec.pos >= indices.length) return true;
  scopePublish(false);
  scopeNotify();
  return false;
}

// One step of the unfiltered-browse scope: one page toward the
// current row budget. The budget can grow while the scope is
// queued (Load more), so "done" is judged against the live budget
// each step; ensureBrowseRows re-enqueues when it grows.
async function stepBrowseScope(rec) {
  if (browseScopeDone || browseScopeCursor >= browseRowsWanted) return true;
  const out = await scopeFetchJson(
    `/api/catalog-search?cursor=${browseScopeCursor}&pagesize=${SCOPE_PAGE}`
  );
  if (!out || !Array.isArray(out.results)) {
    throw new Error("browse scope page malformed");
  }
  if (typeof out.total === "number") rec.total = out.total;
  appendRecordsToStore(scopeStore, out.results);
  if (out.next_cursor == null || out.next_cursor <= browseScopeCursor) {
    browseScopeDone = true;
    browseScopeCursor = rec.total || browseScopeCursor + out.results.length;
  } else {
    browseScopeCursor = out.next_cursor;
  }
  rec.loaded = browseScopeCursor;
  if (!browseScopeDone && browseScopeCursor < browseRowsWanted) {
    scopePublish(false);
    scopeNotify();
    return false;
  }
  return true;
}

// The priority worker: drains scopeQueue one step at a time. A
// queued entry whose key was bumped after it was enqueued runs
// first (stable within a bump round); a running scope re-queues
// itself at the FRONT of its own priority tier after each step,
// and yields entirely when a bumped (newer-selection) scope is
// waiting — it re-enters BEHIND the bumped tier, resumable from
// its saved cursor/pos. scopeActive counts scopes with status
// "loading" (queued or running) exactly as before, so the settled
// signal (isBrowseComplete) keeps its meaning: no selected scope
// in flight.
function scopeDrain() {
  if (scopeWorkerRunning) return;
  scopeWorkerRunning = true;
  (async () => {
    try {
      for (;;) {
        // Highest bump tier first; FIFO inside a tier.
        let best = -1;
        for (let i = 0; i < scopeQueue.length; i++) {
          if (best < 0 || scopeQueue[i].prio > scopeQueue[best].prio) best = i;
        }
        if (best < 0) break;
        const item = scopeQueue.splice(best, 1)[0];
        const rec = item.rec;
        let done = false;
        try {
          done = await item.step(rec);
        } catch {
          rec.status = "failed";
          scopeActive--;
          scopeNotify();
          scopePublish(scopeActive === 0);
          continue;
        }
        if (done) {
          rec.status = "ready";
          if (rec.kind === "facet" || rec.kind === "bits") {
            scopeContentDone = true;
          }
          scopeActive--;
          scopeNotify();
          scopePublish(scopeActive === 0);
        } else {
          // More pages: re-queue at this scope's tier front —
          // unless a bumped scope waits, in which case this scope
          // re-enters behind the bumped tier (prio of the newest
          // bump minus epsilon is expressed by tier numbers: the
          // yield drops the scope to tier 0 if it was bumped-tier).
          const bumpedWaiting = scopeQueue.some((q) => q.prio > item.prio);
          if (bumpedWaiting && item.prio > 0) item.prio = 0;
          scopeQueue.unshift(item);
        }
      }
    } finally {
      scopeWorkerRunning = false;
      if (scopeQueue.length) scopeDrain();
    }
  })();
}

function enqueueScope(key, step, opts = {}) {
  const existing = scopeMap.get(key);
  if (existing && existing.status === "loading") {
    // Already queued or running: a re-ensure with priority bumps
    // its queued entry (the running entry is re-tiered when it
    // re-queues after its current step).
    if (opts.prio) {
      for (const q of scopeQueue) if (q.key === key) q.prio = opts.prio;
      if (existing.queuedItem) existing.queuedItem.prio = opts.prio;
    }
    return existing;
  }
  if (existing && existing.status === "ready" && !opts.rerun) return existing;
  const rec = existing || {
    status: "loading", total: 0, loaded: 0, cursor: 0, pos: 0,
    kind: opts.kind || "", filters: opts.filters || null, indices: opts.indices || null,
  };
  rec.status = "loading";
  if (opts.kind) rec.kind = opts.kind;
  if (opts.filters) rec.filters = opts.filters;
  if (opts.indices) rec.indices = opts.indices;
  if (opts.totalHint && !rec.total) rec.total = opts.totalHint;
  scopeMap.set(key, rec);
  scopeActive++;
  const item = { key, rec, step, prio: opts.prio || 0, seq: scopeSeq++ };
  rec.queuedItem = item;
  scopeQueue.push(item);
  scopeNotify();
  scopeDrain();
  return rec;
}

// Priority tiers: each new selection bumps its scopes above
// everything queued for older selections. The tier is a monotone
// counter handed out by pages.jsx per selection change
// (bumpScopePriority returns the tier to pass to the ensures).
let scopePrioCounter = 0;
export function bumpScopePriority() {
  return ++scopePrioCounter;
}

// Load (or resume loading) one facet scope — a collection, a bucket,
// or an era band — keyed by the caller so repeat selections are free.
export function ensureFacetScope(key, filters, prio = 0, totalHint = 0) {
  if (!scopeMode) return null;
  return enqueueScope(key, stepFacetScope, {
    kind: "facet", filters, prio, totalHint,
  });
}

// Load one bitset scope (curated collection, Books shelf, Papers
// field/subfield/type) from its member ordinals. The scope's total
// is the bitset's member count — known before any fetch, so the
// panel can state it from the tap itself.
export function ensureIndicesScope(key, indices, prio = 0) {
  if (!scopeMode) return null;
  if (!indices || !indices.length) {
    const rec = { status: "ready", total: 0, loaded: 0, kind: "bits" };
    scopeMap.set(key, rec);
    scopeContentDone = true;
    scopeNotify();
    return rec;
  }
  return enqueueScope(key, stepIndicesScope, {
    kind: "bits", indices, totalHint: indices.length, prio,
  });
}

// Grow the unfiltered browse residency to at least n rows (the
// list's Load-more path). Pages in catalog order from the bootstrap
// frontier; already-resident scope records dedupe against it.
export function ensureBrowseRows(n, prio = 0) {
  if (!scopeMode || browseScopeDone) return;
  if (n > browseRowsWanted) browseRowsWanted = n;
  if (browseScopeCursor >= browseRowsWanted) return;
  enqueueScope("browse", stepBrowseScope, { kind: "browse", rerun: true, prio });
}

export function getScopeStatus(key) {
  const rec = scopeMap.get(key);
  return rec ? rec.status : "idle";
}

// True while ANY scope (selected or still draining) is in flight —
// the header/panel loading signal. (isBrowseComplete keeps the
// narrower settled meaning derivations key off.)
export function scopeSettled() {
  return scopeActive === 0;
}

// Keys of scopes whose last load exhausted its retries — the
// section's recovery effect re-ensures the ones its current
// selection needs.
export function getFailedScopeKeys() {
  const out = [];
  for (const [k, r] of scopeMap) if (r.status === "failed") out.push(k);
  return out;
}

export function scopeAnyLoading() {
  return scopeActive > 0;
}

// Member ordinals of a catalog-index bitset (Uint32Array of packed
// bits over catalog positions), ascending — the input an indices
// scope hydrates.
export function ordinalsFromBitset(bits) {
  const out = [];
  if (!bits) return out;
  for (let w = 0; w < bits.length; w++) {
    let word = bits[w];
    while (word) {
      const b = word & -word;
      out.push((w << 5) + (31 - Math.clz32(b)));
      word ^= b;
    }
  }
  return out;
}

// Start (or restart a stopped) automatic browse stream. Idempotent;
// a no-op while the client index owns the cache (non-server mode or
// the search-failure fallback), so the two loaders never fight.
let browseBeginPending = false;
export function startCatalogBrowse() {
  // Scope mode (2026-11-20): the automatic full-catalog stream is
  // gone — selections load their own scopes via ensureFacetScope /
  // ensureIndicesScope / ensureBrowseRows. Any legacy trigger that
  // still fires lands here and does nothing.
  if (scopeMode) return;
  if (indexComplete || indexPending) return;
  if (browseState && !browseState.stopped) return;
  const begin = () => {
    if (indexComplete || indexPending) return;
    if (browseState && !browseState.stopped) return;
    if (browseBeginPending) return;
    browseBeginPending = true;
    // The run's page size and source are fixed by the discovery read
    // before the first launch, so cursor arithmetic never changes
    // mid-run: static mode (fingerprint + baked page size) when the
    // metadata build carries browse pages, function mode otherwise.
    // TCB1 discovery runs in parallel with browse-meta discovery
    // and is awaited on the same terms: the manifest is a few KB,
    // and a fixed short race was measured (design §12, cell-profile
    // harness) to expire on throttled connections — the boot
    // prefetch's JSON pages saturate the connection pool — which
    // silently committed the page to the 795 MB JSON stream for
    // the whole load. Discovery failure still falls back to JSON.
    // Both reads are start-budgeted (see withStartBudget above):
    // the §12 race was a hard sub-second-to-seconds cutoff against
    // HEALTHY-but-throttled endpoints, while the budgets here only
    // cut in when an endpoint is effectively hung — the failure
    // mode that otherwise gates the entire stream start.
    Promise.all([
      withStartBudget(browseMeta(), BROWSE_START_META_BUDGET_MS),
      withStartBudget(tcb1Meta(), BROWSE_START_TCB1_BUDGET_MS),
    ]).then(([meta, tcb1Raw]) => {
      const tcb1 = tcb1ForBrowse(tcb1Raw, meta);
      browseBeginPending = false;
      if (indexComplete || indexPending) return;
      if (browseState && !browseState.stopped) return;
      const base = indexCache || bootstrapCache;
      if (browseState && browseState.worker) {
        // A superseded stream's worker never outlives its state.
        if (browseState.visCleanup) browseState.visCleanup();
        try { browseState.worker.terminate(); } catch {}
        noteExternalBytes("browse-worker", 0);
      }
      // A fresh stream resets the memory ladder (design §12).
      ledgerRung = 0;
      browsePipelineWidth = BROWSE_PIPELINE;
      browseState = {
        store: null, // column store, lazily based on the resident prefix
        workerMode: false, // browse worker owns fetch+parse+transpose
        tcb1: false, // worker streams the TCB1 binary dataset
        worker: null,
        baseDone: false, // worker bootstrap chunk committed
        remap: null, // worker->global dictionary code remap tables
        visCleanup: null,
        cursor: base ? base.length : 0, // append frontier
        fetchCursor: base ? base.length : 0, // next cursor to request
        buffer: new Map(), // cursor -> fetched page awaiting its turn
        inflight: 0,
        failedAt: null,
        runId: browseState ? browseState.runId + 1 : 1,
        total: meta ? meta.total : null,
        pageSize: meta ? meta.pageSize : BROWSE_API_PAGE,
        fp: meta ? meta.fp : null,
        stopped: false,
        onDemand: false,
        stopAt: 0,
        timer: null,
        pubTimer: null,
        lastPubAt: 0,
        // Stall detection (2026-11-15 early-tap fix): the last time
        // the append frontier or the resident count actually moved.
        // A stream can be neither stopped nor progressing (see
        // getBrowseStallAgeMs) — this is the signal that finds it.
        progAt: Date.now(),
        progCount: -1,
        progCursor: -1,
      };
      // Baked sort orders are DEFERRED (audit F3, above): arm what
      // discovery found; the 51 MB fetch waits for the stream to
      // stop or the first non-default sort, whichever comes first.
      if (meta && meta.orders) {
        armBrowseOrders(meta.fp, meta.total);
      } else {
        browseOrdersDeferred = null;
        browseOrdersFetchStarted = false;
        browseOrdersStatus = "absent";
        browseOrders = null;
        browseOrdersBytes = 0;
      }
      // Worker path (2026-11-11 phone fix): fetch + parse + transpose
      // run off the main thread. The worker fires its first page
      // fetch immediately and delivers the bootstrap base as a
      // transposed chunk, so nothing on the start path waits for a
      // main-thread transpose. Only the bootstrap-sized prefix takes
      // this path; a full client index (fallback mode) keeps the
      // main-thread pipeline below, which still pre-transposes the
      // prefix while the first pages are in flight (2026-11-11
      // smoothness) and bases lazily in browseAppend otherwise.
      let workerStarted = false;
      if (bootstrapCache && !indexCache) {
        workerStarted = browseWorkerBegin(browseState, meta, tcb1);
      }
      if (!workerStarted) {
        if (bootstrapCache && !indexCache) browseEnsureStore(browseState);
        browseLaunch(browseState);
      }
    });
  };
  if (indexCache || bootstrapCache) begin();
  else loadBootstrap().then(begin, () => {});
}

// Resume a stream that stopped early (on failure) and run it to the
// end of the catalog — wired to Load more in server mode.
export function resumeCatalogBrowse() {
  if (scopeMode) return;
  if (indexComplete || indexPending) return;
  if (!browseState) { startCatalogBrowse(); return; }
  const st = browseState;
  if (!st.stopped) return;
  if (st.total != null && st.cursor >= st.total) return; // exhausted
  st.stopped = false;
  st.onDemand = true;
  st.stopAt = st.total != null ? st.total : Number.POSITIVE_INFINITY;
  // Fresh run: abandon any pages still in flight or buffered from
  // the stopped run and re-enter at the append frontier.
  st.runId++;
  st.inflight = 0;
  st.failedAt = null;
  st.buffer.clear();
  st.fetchCursor = st.cursor;
  if (st.workerMode && st.worker) {
    // Worker resume: pages it transposed past the append frontier
    // were dropped with the buffer above, so its dedupe session
    // resets to the frontier (it re-accepts exactly what the store
    // is missing) and its pipeline restarts there.
    try {
      st.worker.postMessage({ type: "reset", cursor: st.cursor });
    } catch {
      browseWorkerFallback(st);
    }
    return;
  }
  browseLaunch(st);
}

// How long the live stream has gone without commit progress (the
// append frontier and the resident count both unmoved), in ms — 0
// when there is no stream, the stream is stopped (the failure-stop
// path owns that case), or the catalog is complete. A stream can be
// neither stopped nor progressing: a hidden sample during an append
// parks the worker on its ack window with buffered chunks uncommitted
// (the 2026-11-15 early-tap strand), and a worker-side pause or a
// silently dead decode loop presents the same way. Every such state
// reads "streaming" to isBrowseStreaming(), which is why the
// pages.jsx watchdog needs this second signal.
export function getBrowseStallAgeMs() {
  if (scopeMode) return 0;
  const st = browseState;
  if (!st || st.stopped || isBrowseComplete()) return 0;
  return Date.now() - (st.progAt || 0);
}

// Force a streaming-but-stalled stream through the known-good
// recovery cycle: stop it (pauses the worker, drops buffered chunks)
// and immediately resume it (the worker reset clears its pause,
// releases its ack waiters and restarts the decode loop at the
// append frontier; the main-thread pipeline relaunches). Returns
// false when there is no stalled stream to restart.
export function restartStalledBrowse() {
  if (scopeMode) return false;
  const st = browseState;
  if (!st || st.stopped || isBrowseComplete()) return false;
  browseStop(st, false);
  resumeCatalogBrowse();
  return true;
}

// True while the browse stream is actively bringing the catalog in
// (the library status line keys off this alongside isIndexInFlight).
export function isBrowseStreaming() {
  if (scopeMode) return scopeActive > 0;
  return !!(browseState && !browseState.stopped);
}

// True only when the WHOLE catalog is resident on the page: the
// client index finished, or the browse stream stopped because it
// consumed everything — its append frontier reached the manifest
// total. The frontier counts raw records (duplicates included),
// which is why completion is provable here even though the deduped
// resident count runs a few records under the raw total and can
// never prove it by comparison. Every other stopped state — a page
// failure, an on-demand pause, and above all the window before the
// stream exists at all (manifest discovery still in flight) — is
// NOT complete. Filter-panel finality keys off this (2026-11-13
// loadfix-v3): the previous test, "not streaming", flipped final
// during the discovery window and presented the 20,000-record
// bootstrap prefix's counts as the library's finals whenever the
// manifest endpoints were slow — Joshua's 17:01 phone recording.
export function isBrowseComplete() {
  // Scope mode: "complete" means no scope load is queued or
  // running AND at least one content scope has completed — the
  // resident set (bootstrap + the scopes loaded so far) is the
  // settled input derivations should treat as final for now. The
  // content requirement closes the vacuous drain at scope init
  // (see scopeContentDone above): queue-empty alone flipped this
  // true before anything had loaded and sent the first derivation
  // down its full, minutes-long tail over the bare prefix,
  // wedging every incremental publish behind it.
  if (scopeMode) return scopeActive === 0 && scopeContentDone;
  if (indexComplete) return true;
  const st = browseState;
  return !!(st && st.stopped && st.total != null && st.cursor >= st.total);
}

// The browse stream's known catalog total (from the manifest), or 0
// when no stream has read it. pages.jsx uses it to pre-size the
// phase-0 id index to its final size in one allocation instead of
// rehashing at every doubling (2026-11-11 smoothness).
export function getBrowseTotalHint() {
  if (scopeMode) return scopeTotalHint;
  return browseState && browseState.total ? browseState.total : 0;
}

// Full records for detail pages — loaded on demand.
export function loadFullCatalog() {
  return loadWithRetry(
    "/catalog.json",
    () => fullPending,
    (p) => { fullPending = p; },
    () => fullCache,
    (d) => { fullCache = d; }
  );
}

// Subscribe to index readiness. The callback receives (records,
// complete): Stage 2 publishes progressively, so it fires once per
// chunk run with complete=false and a final time with complete=true.
// Returns unsubscribe.
export function onIndexReady(cb) {
  if (indexCache) {
    // Something is already cached (partial or complete) — call
    // immediately (async to keep consistent), then keep listening for
    // further publishes unless the index is already complete.
    // Scope mode is the exception: its publishes keep arriving after
    // any settled (complete=true) publish, so listeners stay
    // registered for the life of the subscription.
    Promise.resolve().then(() => cb(indexCache, indexComplete));
    if (indexComplete && !scopeMode) return () => {};
  }
  indexReadyListeners.add(cb);
  return () => { indexReadyListeners.delete(cb); };
}

// True until the full index has completely arrived (Stage 2: a partial
// progressive cache still counts as loading).
export function isIndexLoading() {
  return !indexComplete;
}

// The best available data: full index if ready, bootstrap otherwise.
export function getCachedArtifacts() {
  return indexCache || bootstrapCache;
}

// True while a bootstrap fetch is in flight (initial page load).
export function isCatalogPending() {
  return bootstrapPending !== null;
}

// Find a full record by artifact_id, loading the full catalog on demand.
// Uses the sharded catalog (2026-10-18): a placement map gives the ID's
// shard number, then we fetch just that shard instead of the whole
// catalog.
//
// Placement buckets (2026-11-10): the placement map no longer ships as
// one file. At 2,557,918 entries the single manifest is ~66 MB, served
// only through a streaming function, and an entry lookup had to
// download all of it inside the 30 s fetch budget before it could
// locate one record. When that fetch failed or timed out, the old
// loader cached an EMPTY map for the session, so every lookup fell
// through to the legacy catalog — which predates the LAW collection —
// and live LAW entries rendered as UNKNOWN ARTIFACT. The map is now
// split into 256 bucket files (public/catalog-shard-manifest/<NNN>.json,
// ~260 KB each, ordinary static assets) keyed by the djb2 hash below;
// a lookup downloads only its own bucket, a bucket failure REJECTS
// (and is never cached), and only a cleanly loaded bucket that lacks
// the id falls back to the legacy catalog.
const PLACEMENT_BUCKETS = 256;
function placementBucketFor(artifactId) {
  // djb2 — must match src/lib/search-text.js shardFor(id, 256) and
  // ops/split_shard_manifest.py, which generates the bucket files.
  let h = 5381;
  const s = String(artifactId);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h % PLACEMENT_BUCKETS;
}
const placementCache = {};
const placementPending = {};
function loadShardBucket(b) {
  const key = `bucket-${b}`;
  if (placementCache[key]) return Promise.resolve(placementCache[key]);
  if (!placementPending[key]) {
    const url = `/catalog-shard-manifest/${String(b).padStart(3, "0")}.json`;
    const attempt = (retried) =>
      fetchJsonOnce(url, 60000).then(
        (data) => {
          placementCache[key] = data || {};
          delete placementPending[key];
          return placementCache[key];
        },
        (err) => {
          if (!retried) return attempt(true);
          delete placementPending[key];
          throw err;
        }
      );
    placementPending[key] = attempt(false);
  }
  return placementPending[key];
}
function loadShardPlacement(artifactId) {
  return loadShardBucket(placementBucketFor(artifactId)).then(
    (bucket) => bucket[artifactId]
  );
}
const shardCache = {};
const shardPending = {};
// LRU cap for shardCache (2026-10-18): browsing across shards could retain ~90MB.
const SHARD_CACHE_MAX = 3;
function touchShardCache(key) {
  const keys = Object.keys(shardCache);
  while (keys.length > SHARD_CACHE_MAX) {
    delete shardCache[keys.shift()];
  }
}
// Kept for API compatibility (the library page used to warm the
// single-file manifest, 2026-10-18). Placement buckets are per-id and
// ~260 KB, so there is nothing useful to pre-warm; entry lookups fetch
// their bucket on demand.
export function warmShardManifest() {}
function loadCatalogShard(n) {
  const key = `shard-${n}`;
  if (shardCache[key]) return Promise.resolve(shardCache[key]);
  if (shardPending[key]) return shardPending[key];
  const url = `/catalog-shards/catalog-${String(n).padStart(2, "0")}.json`;
  // Retry once on failure (mirrors loadWithRetry semantics). Shards run
  // 9-19 MB, so the fetch gets a longer budget than the 30 s default.
  const attempt = (retried) =>
    fetchJsonOnce(url, 120000).then(
      (data) => {
        const items = Array.isArray(data) ? data : data?.artifacts || data?.items || [];
        shardCache[key] = items;
        touchShardCache(key);
        delete shardPending[key];
        return items;
      },
      (err) => {
        if (!retried) return attempt(true);
        delete shardPending[key];
        throw err;
      }
    );
  shardPending[key] = attempt(false);
  return shardPending[key];
}
export function getFullArtifact(artifactId) {
  if (fullCache) {
    return Promise.resolve(fullCache.find((a) => a.artifact_id === artifactId) || null);
  }
  // Try the sharded catalog first (has all 2.56M entries). A placement
  // FETCH failure rejects out of getFullArtifact: the caller retries
  // rather than mistaking an infrastructure failure for a missing
  // entry. Only a placement that loaded cleanly and has no entry for
  // the id falls back to the legacy catalog.
  return loadShardPlacement(artifactId).then((shardNum) => {
    if (shardNum === undefined) {
      // Not in the placement map — fall back to legacy catalog.json.
      return loadFullCatalog().then(
        (full) => full.find((a) => a.artifact_id === artifactId) || null
      );
    }
    return loadCatalogShard(shardNum).then(
      (items) => items.find((a) => a.artifact_id === artifactId) || null
    );
  });
}

// Rewritten entry descriptions (2026-10-18 description revamp).
// Sidecar sharded by artifact_id prefix: /tower-descriptions/<xx>.json,
// each a {artifact_id: description} map. Loaded lazily per entry view and
// cached per shard; a failed shard fetch resolves null (callers fall back
// to the catalog record's own description).
// Shard caches are LRU-capped (2026-11-10 scroll-crash fix): the
// cover/description sidecars shard by id suffix, and a long scroll
// session touches shard after shard — uncapped, every parsed shard
// stayed resident for the life of the tab (hundreds of MB across a
// deep session) on top of the catalog itself. Evicted shards simply
// refetch on next use.
const SHARD_CACHE_CAP = 40;
function shardCacheSet(cache, key, data) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, data);
  while (cache.size > SHARD_CACHE_CAP) {
    cache.delete(cache.keys().next().value);
  }
}
const descShardCache = new Map();
const descShardPending = {};
function descShardKey(artifactId) {
  // LAST 2 chars: id prefixes concentrate (pmc-, arxiv-, tob-) but suffixes
  // distribute evenly. Must match build_sidecar.py.
  const s = String(artifactId || "").toLowerCase().slice(-2).replace(/[^a-z0-9]/g, "_");
  return (s + "__").slice(0, 2);
}
// Acquired cover images (2026-10-22 cover acquisition pipeline).
// Sidecar sharded exactly like the descriptions sidecar (LAST 2 chars of
// the artifact id): /tower-covers/<xx>.json, each a {artifact_id: url}
// map of covers verified over HTTP by the resolver — a stored URL is a
// real cover that served an image when checked. Loaded lazily per shard
// and cached; a failed shard resolves {} and callers fall back to the
// client-side derivation chain.
const coverShardCache = new Map();
const coverShardPending = {};
export function getCover(artifactId) {
  const key = descShardKey(artifactId);
  const hit = coverShardCache.get(key);
  if (hit) {
    // Refresh LRU position on use.
    coverShardCache.delete(key);
    coverShardCache.set(key, hit);
    return Promise.resolve(hit[artifactId] || null);
  }
  if (!coverShardPending[key]) {
    coverShardPending[key] = fetchJsonOnce(`/tower-covers/${key}.json`)
      .then(
        (data) => {
          shardCacheSet(coverShardCache, key, data || {});
          coverShardPending[key] = null;
          return coverShardCache.get(key);
        },
        () => {
          shardCacheSet(coverShardCache, key, {});
          coverShardPending[key] = null;
          return coverShardCache.get(key);
        }
      );
  }
  return coverShardPending[key].then((shard) => shard[artifactId] || null);
}

export function getDescription(artifactId) {
  const key = descShardKey(artifactId);
  const hit = descShardCache.get(key);
  if (hit) {
    descShardCache.delete(key);
    descShardCache.set(key, hit);
    return Promise.resolve(hit[artifactId] || null);
  }
  if (!descShardPending[key]) {
    descShardPending[key] = fetchJsonOnce(`/tower-descriptions/${key}.json`)
      .then(
        (data) => {
          shardCacheSet(descShardCache, key, data || {});
          descShardPending[key] = null;
          return descShardCache.get(key);
        },
        () => {
          shardCacheSet(descShardCache, key, {});
          descShardPending[key] = null;
          return descShardCache.get(key);
        }
      );
  }
  return descShardPending[key].then((shard) => shard[artifactId] || null);
}
