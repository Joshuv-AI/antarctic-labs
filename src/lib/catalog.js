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
export function loadBootstrap() {
  return loadWithRetry(
    "/catalog-bootstrap.json",
    () => bootstrapPending,
    (p) => { bootstrapPending = p; },
    () => bootstrapCache,
    (d) => { bootstrapCache = d; }
  );
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

function publishIndex(data, complete) {
  indexCache = data;
  if (complete) indexComplete = true;
  indexReadyListeners.forEach((cb) => {
    try { cb(data, complete); } catch {}
  });
}

function fetchJsonWithRetry(url) {
  return fetchJsonOnce(url, INDEX_FETCH_TIMEOUT_MS).catch(() =>
    fetchJsonOnce(url, INDEX_FETCH_TIMEOUT_MS)
  );
}

function loadLegacyIndex() {
  return fetchJsonWithRetry("/catalog-index.json").then((data) => {
    publishIndex(data, true);
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
    publishIndex(acc, complete);
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
        publishIndex(acc, published === chunks);
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
  if (!indexComplete) publishIndex(acc, true);
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
export function appendRecordsToStore(store, records) {
  const total = records ? records.length : 0;
  if (!total) return;
  const index = ensureStoreIndex(store);
  const seenLocal = new Set();
  const accepted = [];
  for (let j = 0; j < total; j++) {
    const r = records[j];
    if (!r || !r.artifact_id) continue;
    const id = r.artifact_id;
    if (seenLocal.has(id)) continue;
    if (index.get(id) !== undefined) continue;
    seenLocal.add(id);
    accepted.push(r);
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
  for (let j = 0; j < n; j++) {
    const r = accepted[j];
    colPush(store.chunkIdx, chunkIndex);
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
          case "__columnIdPrefixAt":
            // Internal hook for pages.jsx's phase-0 bucket loop: the
            // record's taxonomy id prefix from its stored bytes, so
            // classifying a record never decodes its whole id.
            return (i) => store.idPrefixAt(i);
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

// One discovery read per page load: {fp, total, pageSize} when the
// current metadata build carries baked browse pages, else null
// (function-only mode). Never rejects.
function browseMeta() {
  if (!browseMetaPromise) {
    browseMetaPromise = fetchJsonOnce("/api/browse-manifest")
      .then((m) => {
        if (
          m && typeof m.total === "number" && typeof m.fingerprint === "string" &&
          Number.isFinite(m.browse_page_size) && Number.isFinite(m.browse_pages)
        ) {
          return { fp: m.fingerprint, total: m.total, pageSize: m.browse_page_size, orders: !!m.orders };
        }
        return null;
      })
      .catch(() => null);
  }
  return browseMetaPromise;
}

// Baked sort orders (2026-11-10 completion-spike fix): the metadata
// generator bakes the five sort permutations into orders.bin beside
// the browse pages (see scripts/build-catalog-meta.mjs). The streamer
// fetches the file in parallel with the page stream — 51 MB of binary
// against the catalog's ~675 MB of pages, so it lands long before the
// stream completes — and the library derivation attaches the views
// instead of building the orders on-device at completion (the build
// was a sustained ~1.24 GB heap plateau that killed phone tabs
// seconds after the load finished). Any failure (older fingerprint
// without the file, size mismatch, network) settles as "failed" and
// the derivation falls back to the on-device build, unchanged.
let browseOrders = null; // {fp, total, order}
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
    })
    .catch(() => {
      clearTimeout(timer);
      browseOrders = null;
      browseOrdersStatus = "failed";
      settleBrowseOrders();
    });
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
      rm[base + k] = dictCode(store, mapKey, dictKey, fresh[k]);
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
  store.count += n;
}

function browsePublishNow(complete) {
  const st = browseState;
  if (!st || !st.store) return;
  st.lastPubAt = Date.now();
  // Publish a view snapshot: the page's derivations key off identity,
  // and the columns keep growing between publishes — the view pins
  // the length it was published with, like the old array slice did.
  publishIndex(createCatalogView(st.store, st.store.count), complete);
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
// main-thread pipeline, unchanged). The worker fetches the bootstrap
// itself (a second, cache-hit read of the same immutable file the
// page already loaded for first paint), transposes it as the store's
// base, then pipelines the browse pages — its first page fetch fires
// the moment it starts, never waiting on the base transpose the way
// the old begin() pre-transpose blocked browseLaunch.
function browseWorkerBegin(st, meta) {
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
    });
  } catch {
    browseWorkerFallback(st);
  }
  return true;
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
  if (st.visCleanup) { st.visCleanup(); st.visCleanup = null; }
  if (st.worker) {
    try { st.worker.terminate(); } catch {}
    st.worker = null;
  }
  st.buffer.clear();
  st.inflight = 0;
  st.failedAt = null;
  if (!st.store || (st.store.count === 0 && !st.baseDone)) {
    st.store = null;
    st.baseDone = false;
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
    if (browseState === st && !st.stopped) browseLaunch(st);
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
    const exhausted = body.next_cursor == null || rawLen === 0;
    if (exhausted) {
      // Everything the server has is now resident: that IS the full
      // catalog for this page, so the final publish may say complete.
      browseStop(st, st.total != null && st.store.count >= st.total);
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
  while (st.inflight < BROWSE_PIPELINE) {
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

// Start (or restart a stopped) automatic browse stream. Idempotent;
// a no-op while the client index owns the cache (non-server mode or
// the search-failure fallback), so the two loaders never fight.
let browseBeginPending = false;
export function startCatalogBrowse() {
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
    browseMeta().then((meta) => {
      browseBeginPending = false;
      if (indexComplete || indexPending) return;
      if (browseState && !browseState.stopped) return;
      const base = indexCache || bootstrapCache;
      if (browseState && browseState.worker) {
        // A superseded stream's worker never outlives its state.
        if (browseState.visCleanup) browseState.visCleanup();
        try { browseState.worker.terminate(); } catch {}
      }
      browseState = {
        store: null, // column store, lazily based on the resident prefix
        workerMode: false, // browse worker owns fetch+parse+transpose
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
      };
      // Baked sort orders ride in parallel with the stream (above).
      if (meta && meta.orders) loadBrowseOrders(meta.fp, meta.total);
      else {
        browseOrdersStatus = "absent";
        browseOrders = null;
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
        workerStarted = browseWorkerBegin(browseState, meta);
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

// True while the browse stream is actively bringing the catalog in
// (the library status line keys off this alongside isIndexInFlight).
export function isBrowseStreaming() {
  return !!(browseState && !browseState.stopped);
}

// The browse stream's known catalog total (from the manifest), or 0
// when no stream has read it. pages.jsx uses it to pre-size the
// phase-0 id index to its final size in one allocation instead of
// rehashing at every doubling (2026-11-11 smoothness).
export function getBrowseTotalHint() {
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
    Promise.resolve().then(() => cb(indexCache, indexComplete));
    if (indexComplete) return () => {};
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
