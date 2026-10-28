// Destination page shells for the unified Antarctic Labs routes.
// Each shell renders copy from the corresponding src/content/*.js
// module and reuses the existing CSS grammar (.page-shell,
// .inner-hero, .section, .section-index, .copy-block, .display-copy,
// .body-copy, .text-link, .cap-row).
//
// Visual language is intentionally not redesigned here — these shells
// use the same classes the existing Home page already uses, so the
// destinations already share the home-page visual grammar.
import { useState, useEffect, useMemo, useDeferredValue, useRef, useCallback, memo, Fragment } from "react";
import { searchDeep, getSnippets } from "./lib/deep-search.js";
import { track } from "./lib/analytics.js";

// Analytics de-dup guards: entry components do not remount on
// entry-to-entry navigation, and effects can re-fire as fuller records
// arrive — each work view / reader open is counted once per session.
const trackedWorkViews = new Set();
const trackedReaderOpens = new Set();
import {
  normText,
  queryTokens,
  pinsForQuery,
  scoreArtifactPre,
  secondaryMaskFor,
  querySecondaryMask,
  scoreBlended,
  formatAboutCount,
  correctionCandidates,
  FIELD_WEIGHTS,
} from "./lib/search-rank.js";
import { STOPWORDS as QUERY_STOPWORDS } from "./lib/search-text.js";
import { site } from "./content/site.js";
import { operator } from "./content/operator.js";
import { towerOfBabel } from "./content/tower-of-babel.js";
import { PORTAL_URL } from "./content/tower-api.js";
// The artifact catalog is lazy (see ./lib/catalog.js): it is ~2.6MB of
// source and used to ride in the main bundle, stalling every cold load.
// Components that need it use useArtifacts() below.
import {
  loadBootstrap,
  requestCatalogIndex,
  isIndexInFlight,
  getCachedArtifacts,
  getFullArtifact,
  getDescription,
  getCover,
  onIndexReady,
  isIndexLoading,
} from "./lib/catalog.js";
// Two-level browse taxonomy for the library filter (revamp 2026-10-17):
// top-level lanes + subcategories derived from the artifact_id prefix.
// Pure module, no dependencies — see ./lib/tower-taxonomy.js.
import {
  TOWER_TOP_LABELS,
  TOWER_SUBS,
  towerBucketKey,
  towerSubLabel,
} from "./lib/tower-taxonomy.js";
// Collections browser (2026-10-24): the old hub pages were deleted and
// folded into a filter on this section's entry list. The hub index JSON
// is fetched lazily (see below) — never in the initial page load.
import {
  COLLECTION_GROUPS,
  loadHubsIndex,
  buildCollections,
} from "./lib/tower-collections.js";
import {
  coverCandidates,
  coverTone,
  lookupOpenLibraryCover,
} from "./lib/tower-covers.js";
import {
  STACKS,
  STACK_GROUPS,
  TRADITIONS,
  RAIL_ESSENTIAL,
  RAIL_RECORDS,
  STACKS_POOL,
} from "./lib/tower-shelves.js";
// The build-time manifest of hosted tower texts (2.4MB at current scale)
// is NOT statically imported: it would ride inside the lazy pages chunk and
// make every page pay for it. It loads as its own chunk, on demand, only on
// entry pages (see LibraryFullText) — preloaded while the entry paints
// so the inline full-text section usually has it cached. Module-level promise:
// one fetch per session; a failed load resolves null and callers treat
// "unknown" optimistically (the text fetch itself 404s gracefully).
let towerFilesPromise = null;
function getTowerFiles() {
  if (!towerFilesPromise) {
    towerFilesPromise = import("./lib/tower-files.js").then(
      (m) => m.TOWER_FILES,
      () => null
    );
  }
  return towerFilesPromise;
}
import ReaderAssist, { SUPPORTS_HIGHLIGHTS } from "./components/ReaderAssist.jsx";
import { applyMeta } from "./seo.js";
import { government } from "./content/government.js";
// Module-level LRU cache for entry full texts (2026-10-18): avoids re-downloading
// up to 9MB on back/forward or prev/next navigation. Cap 5 entries.
const textCache = new Map();
const TEXT_CACHE_MAX = 5;
function getCachedText(url) {
  if (!textCache.has(url)) return undefined;
  const t = textCache.get(url);
  textCache.delete(url);
  textCache.set(url, t);
  return t;
}
function setCachedText(url, text) {
  textCache.set(url, text);
  while (textCache.size > TEXT_CACHE_MAX) {
    const oldest = textCache.keys().next().value;
    textCache.delete(oldest);
  }
}
// ----- Tower of Babel ------------------------------------------------------
export function TowerOfBabel({ go, onReady }) {
  // The combined Tower page: landing content + full library section below.
  // The library section manages its own catalog loading and reports ready
  // via onReady once the first 50 rows paint.
  return (
    <main className="page-shell inner-page tower-light tower-combined" id="main-content" tabIndex={-1}>
      <section className="inner-hero section tower-landing-hero">
        <h1>{towerOfBabel.heading}</h1>
        {towerOfBabel.intro.map((p, i) => (
          <p className={i === 0 ? "display-copy" : "body-copy"} key={i}>{p}</p>
        ))}
      </section>

      {/* About the project — collapsed by default so the landing stays tight;
          the copy pops open on tap instead of sitting in the way. */}
      <section className="section tower-about-section">
        <details className="tower-about">
          <summary>
            <span className="section-index">ABOUT THE PROJECT</span>
            <span className="tower-about-chevron" aria-hidden="true">▾</span>
          </summary>
          <div className="tower-about-body">
            {towerOfBabel.project.map((p, i) => (
              <p className="body-copy" key={i}>{p}</p>
            ))}
            <div className="tower-about-subhead">ABOUT THE CATALOG</div>
            <p className="body-copy">{towerOfBabel.catalogNote}</p>
          </div>
        </details>
      </section>

      {/* The full library, poured directly below the landing content.
          Collections live inside the library browse section below as a
          filter on the same entry list — there is no separate hub page. */}
      <TowerLibrarySection go={go} onReady={onReady} />
    </main>
  );
}
// ----- Tower of Babel / Library -------------------------------------------------
const TOWER_SORTS = [
  { id: "title-asc", label: "Title A–Z" },
  { id: "title-desc", label: "Title Z–A" },
  { id: "creator-asc", label: "Creator A–Z" },
  { id: "year-desc", label: "Newest first" },
  { id: "year-asc", label: "Oldest first" },
];

// Async access to the artifact catalog. Returns
// [artifacts, error, fullIndexReady, retry]: artifacts is null while the
// catalog chunk loads (the Tower boot loader covers the wait), error is true
// if the chunk failed to load. The loaded array is cached in the catalog
// module, so mounting a second Tower route resolves instantly.
//
// Retry is in-place: the catalog loads via fetch (see ./lib/catalog.js), so
// a failed fetch is NOT cached anywhere and simply re-running the load is a
// full fresh attempt — no page reload needed. A late-arriving response from
// the failed attempt lands in the module cache, so retry is instant then.
//
// Absolute watchdog: fetchJsonOnce aborts at 30s with one retry, but if the
// catalog still hasn't settled (loaded or failed) 15s after mount — e.g. a
// hung connection the timeout somehow missed — error is forced so the page
// behind the loader is never a dead end. The loader's own failsafe
// (main.jsx) dismisses the overlay regardless; this guarantees the section
// reaches a settled state (rows or the error UI) on its own.
const CATALOG_WATCHDOG_MS = 15000;
function useArtifacts() {
  const [retrySeq, setRetrySeq] = useState(0);
  const [state, setState] = useState(() => ({
    artifacts: getCachedArtifacts(),
    error: false,
    fullIndexReady: !isIndexLoading(),
  }));
  const [watchdogError, setWatchdogError] = useState(false);
  useEffect(() => {
    let live = true;
    // Load bootstrap first (instant). The full index is NOT started here
    // anymore (Stage 1 ungating, 2026-10-23): it starts on visitor intent
    // via requestCatalogIndex() or on the idle schedule — see
    // TowerLibrarySection's triggers and ./lib/catalog.js.
    if (!state.artifacts && !state.error) {
      loadBootstrap().then(
        (a) => {
          if (live) setState((s) => ({ ...s, artifacts: a, error: false }));
        },
        () => {
          if (live) setState({ artifacts: null, error: true, fullIndexReady: false });
        }
      );
    } else if (state.artifacts && !state.fullIndexReady) {
      // Bootstrap is showing; upgrade as the index arrives (whenever an
      // intent trigger or the idle schedule starts it). Stage 2 publishes
      // progressively: artifacts grows chunk by chunk, and fullIndexReady
      // flips only on the final (complete) publish.
      const unsub = onIndexReady((full, complete) => {
        if (live)
          setState((s) => ({
            ...s,
            artifacts: full,
            fullIndexReady: complete ? true : s.fullIndexReady,
          }));
      });
      return () => {
        live = false;
        unsub();
      };
    }
    return () => {
      live = false;
    };
  }, [state.artifacts, state.error, state.fullIndexReady, retrySeq]);
  useEffect(() => {
    if (state.artifacts || state.error) return;
    const t = setTimeout(() => setWatchdogError(true), CATALOG_WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [state.artifacts, state.error, retrySeq]);
  const retry = () => {
    setWatchdogError(false);
    // A late success may have populated the module cache since the failure.
    setState((s) => ({ ...s, artifacts: getCachedArtifacts(), error: false }));
    setRetrySeq((n) => n + 1);
  };
  return [state.artifacts, state.error || watchdogError, state.fullIndexReady, retry];
}

// Shared catalog-failed UI: the loader failsafe guarantees the overlay
// dismisses, so a failed fetch must never leave a blank page. Plain,
// on-brand, with a manual retry. The retry re-runs the fetch in place —
// fetch failures are not cached anywhere, so this is a full fresh attempt
// without a page reload (a late-arriving response resolves it instantly).
function TowerCatalogError({ onRetry }) {
  return (
    <main className="page-shell inner-page tower-light" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <h1>THE LIBRARY</h1>
        <p className="body-copy">
          The catalog couldn't be loaded. Check your connection and try again.
        </p>
        <div className="tower-landing-actions">
          <button
            className="tower-access-btn"
            onClick={onRetry}
          >
            RETRY <span aria-hidden="true">↻</span>
          </button>
        </div>
      </section>
    </main>
  );
}

// Normalized search haystack for catalog search: title, creator, year,
// description, collection, subcategory label, and tags. The subcategory
// label (e.g. "CIA", "PLOS Journals") makes the revamp's buckets findable
// by search too. Text goes through normText (lib/search-rank.js) — the
// same normalization the query gets — so "quran" finds "Qur'an" titles
// and "moby dick" finds "Moby-Dick".
function towerHaystack(a, subLabel) {
  return normText(
    [
      a.title || "",
      a.creator || "",
      a.year ? String(a.year) : "",
      a.description || "",
      a.collection || "",
      subLabel || "",
      Array.isArray(a.tags) ? a.tags.join(" ") : "",
    ].join("\n")
  );
}

// Derived catalog data, built AFTER first paint in a deferred, chunked task
// and then cached. The catalog is static at runtime, so the per-record
// search haystacks, the collection counts, and every sort order are built a
// single time instead of on every keystroke/render. The sort orders are
// index orders into `artifacts`, so haystacks[i] stays aligned. Filtering
// one of these orders yields exactly the sequence a stable sort of the
// filtered subset would produce.
//
// Why deferred + chunked: at production scale (80k+ entries) the title sort
// alone costs seconds of main-thread time. Building it synchronously in
// render froze the Tower boot animation mid-play and pushed onReady past
// the loader failsafe — the "stuck loader" reports. Now the page shell
// paints first, the derivation yields to the browser roughly every 120ms so
// the animation keeps clean frames, and the rows paint when it completes.
// (Lazy because the catalog itself is lazy — see ./lib/catalog.js. The
// cache is keyed on the array identity, so the bootstrap→full-index upgrade
// rebuilds exactly once and remounts resolve instantly.)
let towerDataCache = null;
let towerDataFor = null;

// One shared collator for every catalog sort. Intl.Collator.compare is
// measurably faster than String.localeCompare per call (notably on
// JavaScriptCore), and an explicit "en-US" locale makes the order
// deterministic instead of depending on the visitor's default locale.
// Verified on the full catalog: the produced title and creator orders are
// identical to the localeCompare orders they replaced.
const TITLE_COLLATOR = new Intl.Collator("en-US");

// Stable bottom-up merge sort over index positions into a keys array,
// yielding to the browser between row ranges. No single block ever
// exceeds ~120ms, so the boot animation never freezes. Stability matches
// Array.prototype.sort, so tie order is the catalog's own order, exactly
// as the sorts this replaced.
async function buildOrder(keys, cmp, isCancelled) {
  const n = keys.length;
  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const tmp = new Array(n);
  let lastYield = 0;
  const yieldToBrowser = () =>
    new Promise((r) => setTimeout(r, 0));
  for (let w = 1; w < n; w *= 2) {
    for (let lo = 0; lo < n; lo += 2 * w) {
      if (isCancelled()) return null;
      const mid = Math.min(lo + w, n);
      const hi = Math.min(lo + 2 * w, n);
      let i = lo, j = mid, k = lo;
      while (i < mid && j < hi) {
        tmp[k++] =
          cmp(keys[idx[i]], keys[idx[j]]) <= 0 ? idx[i++] : idx[j++];
      }
      while (i < mid) tmp[k++] = idx[i++];
      while (j < hi) tmp[k++] = idx[j++];
      for (let m = lo; m < hi; m++) idx[m] = tmp[m];
      const now = performance.now();
      if (now - lastYield > 120) {
        lastYield = now;
        await yieldToBrowser();
      }
    }
  }
  return idx;
}

// Chunked search-data build: 20k records per macrotask, so filtering data
// never blocks the thread. One pass produces everything a keystroke
// needs, all aligned with `artifacts` by index:
//   haystacks    — the normalized match text (as towerHaystack builds)
//   normTitles / normCreators / normColls — the normalized fields the
//     relevance scorer used to recompute per record per query
//   secMasks     — per-record secondary-marker bitmask for the scorer
//   volFlags     — per-record "title carries Vol./Part N" flag
async function buildSearchData(artifacts, bucketKeys, isCancelled) {
  const n = artifacts.length;
  const haystacks = new Array(n);
  const normTitles = new Array(n);
  const normCreators = new Array(n);
  const normColls = new Array(n);
  const normDescs = new Array(n);
  const secMasks = new Uint32Array(n);
  const volFlags = new Uint8Array(n);
  // Did-you-mean vocabulary (Workstream D, SPEC-6): token -> frequency over
  // the SHORT fields only (title/creator/collection). Built once here so a
  // zero-result query never pays a catalog scan to find corrections.
  const vocab = new Map();
  const vocabAdd = (field) => {
    if (!field) return;
    for (const t of field.split(" ")) {
      if (t) vocab.set(t, (vocab.get(t) || 0) + 1);
    }
  };
  for (let from = 0; from < n; from += 20000) {
    if (isCancelled()) return null;
    const end = Math.min(from + 20000, n);
    for (let i = from; i < end; i++) {
      const a = artifacts[i];
      const bk = bucketKeys[i];
      const colon = bk.indexOf(":");
      const subLabel =
        colon < 0 ? "" : towerSubLabel(a.collection, bk.slice(colon + 1));
      haystacks[i] = towerHaystack(a, subLabel);
      const T = normText(a.title || "");
      normTitles[i] = T;
      normCreators[i] = normText(a.creator || "");
      normColls[i] = normText((a.collection || "") + " " + subLabel);
      normDescs[i] = normText(a.description || "");
      vocabAdd(T);
      vocabAdd(normCreators[i]);
      vocabAdd(normColls[i]);
      secMasks[i] = secondaryMaskFor(T);
      volFlags[i] = /\b(vol|volume|part) \d+/.test(T) ? 1 : 0;
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  return { haystacks, normTitles, normCreators, normColls, normDescs, secMasks, volFlags, vocab };
}

// Full derivation for one catalog array identity, in three phases
// (2026-10-21 speed pass; phase 0 added in the load fix later that day).
// Phase 0 publishes the cheap browse data (counts, bucket keys, id index)
// the moment those loops finish — the page paints and browses off it.
// Phase 1 builds the search data and publishes it through onPhase the
// moment it is ready — the catalog is fully searchable at that point.
// Phase 2 builds the sort orders in the background and the resolved
// object carries them; sorting no longer gates searching, which it did
// when a 300k+ record derivation had to finish before the first
// keystroke could be answered. Resolves to the final towerData object,
// or null if cancelled/superseded before finishing.
async function deriveTowerData(artifacts, isCancelled, onPhase) {
  if (towerDataCache && towerDataFor === artifacts) return towerDataCache;
  const counts = {};
  for (let i = 0; i < artifacts.length; i++) {
    const key = artifacts[i].collection || "OTHER";
    counts[key] = (counts[key] || 0) + 1;
  }
  // Two-level browse taxonomy (filter revamp 2026-10-17): one bucket key per
  // record ("COLLECTION" or "COLLECTION:sub"), aligned with artifacts like
  // haystacks. Subcategory partitions are exact — the union of a lane's
  // sub-buckets is the lane itself — so the top-level filter result set is
  // identical to the old collection filter (see parity-test.mjs).
  const bucketKeys = new Array(artifacts.length);
  const subCounts = {};
  for (let i = 0; i < artifacts.length; i++) {
    const bk = towerBucketKey(artifacts[i]) || artifacts[i].collection || "OTHER";
    bucketKeys[i] = bk;
    subCounts[bk] = (subCounts[bk] || 0) + 1;
  }
  // artifact_id -> index, for resolving curated search pins (built once
  // here so a keystroke never pays for it).
  const idIndex = new Map();
  for (let i = 0; i < artifacts.length; i++) {
    idIndex.set(artifacts[i].artifact_id, i);
  }
  const collections = Object.keys(counts).sort(
    (a, b) => counts[b] - counts[a] || (a < b ? -1 : a > b ? 1 : 0)
  );
  // Phase 0 (2026-10-21 load fix): everything above is two cheap loops —
  // publish it immediately. The page paints, browses (bucket filter +
  // catalog order), renders the shelves, and the boot loader dismisses
  // off this alone; the expensive search-data build below no longer
  // gates first paint. Search activates when phase 1 lands (the results
  // memo treats a query as browsing while haystacks is null).
  if (onPhase) {
    onPhase({
      counts,
      subCounts,
      bucketKeys,
      collections,
      idIndex,
      order: null,
      haystacks: null,
      normTitles: null,
      normCreators: null,
      normColls: null,
      normDescs: null,
      secMasks: null,
      volFlags: null,
      vocab: null,
    });
  }
  const search = await buildSearchData(artifacts, bucketKeys, isCancelled);
  if (!search || isCancelled()) return null;
  const base = {
    ...search,
    idIndex,
    counts,
    subCounts,
    bucketKeys,
    collections,
    order: null,
  };
  if (onPhase) onPhase(base);
  // Phase 2: the sort orders. All four go through the same chunked merge
  // sort, so none of them is a single blocking task (the creator sort
  // used to be one synchronous Array.sort over the whole catalog).
  const byCollator = (x, y) => TITLE_COLLATOR.compare(x, y);
  const titleOrder = await buildOrder(
    artifacts.map((a) => a.title || ""),
    byCollator,
    isCancelled
  );
  if (!titleOrder || isCancelled()) return null;
  const creatorOrder = await buildOrder(
    artifacts.map((a) => a.creator || ""),
    byCollator,
    isCancelled
  );
  if (!creatorOrder || isCancelled()) return null;
  const years = artifacts.map((a) => a.year || 0);
  const yearAsc = await buildOrder(years, (x, y) => x - y, isCancelled);
  if (!yearAsc || isCancelled()) return null;
  const yearDesc = await buildOrder(years, (x, y) => y - x, isCancelled);
  if (!yearDesc || isCancelled()) return null;
  const data = {
    ...base,
    order: {
      "title-asc": titleOrder,
      "title-desc": titleOrder.slice().reverse(),
      "creator-asc": creatorOrder,
      "year-desc": yearDesc,
      "year-asc": yearAsc,
    },
  };
  towerDataCache = data;
  towerDataFor = artifacts;
  return data;
}

// Adaptive keystroke debounce (SPEC-5): 150ms on fast 4G, 200ms default,
// 400ms on slow networks or save-data — via the Network Information API,
// degrading to the 200ms default where the API does not exist.
function adaptiveDebounceMs() {
  try {
    const c = navigator.connection;
    if (!c) return 200;
    if (c.saveData) return 400;
    if (c.effectiveType === "slow-2g" || c.effectiveType === "2g") return 400;
    if (c.effectiveType === "4g") return 150;
    return 200;
  } catch {
    return 200;
  }
}

// Search results page size (SPEC-4): 25 per page, numbered pages to 10,
// then cursor-based Load more.
const SEARCH_PAGE_SIZE = 25;

// Rows per page for library pagination. The user clicks "Load more" for the
// next page — the full catalog is never mounted at once, so the DOM stays
// small and style recalc/paint stay cheap at any catalog size.
const TOWER_ROWS_PER_PAGE = 50;

// ----- Tower landing discovery zone (revamp 2026-10-21) ------------------
// Open Library pattern (browse-the-stacks cards + featured cover rails) and
// JW Library pattern (grouped tradition tile grids) over the live catalog.
// Presentation only: shelves resolve curated ids (lib/tower-shelves.js)
// against the loaded catalog and drop whatever no longer resolves, and
// every browse action drives the section's existing bucket filter.

// A record's cover: real image candidates in order (lib/tower-covers.js),
// then an Open Library lookup for books the deterministic chain can't
// reach, and the generated typographic tile last — never a broken image.
function TowerCover({ a }) {
  const candidates = useMemo(() => coverCandidates(a), [a]);
  const [step, setStep] = useState(0);
  const [olUrl, setOlUrl] = useState(null);
  const [scUrl, setScUrl] = useState(null);
  useEffect(() => {
    setStep(0);
    setOlUrl(null);
    setScUrl(null);
  }, [a]);
  useEffect(() => {
    if (!a || candidates.length > 0) return;
    let live = true;
    // Acquired-covers sidecar first (pre-verified real covers, keyed by
    // id — the only source that works for index records, which carry no
    // source_url); the live Open Library lookup remains the fallback.
    getCover(a.artifact_id).then((u) => {
      if (!live) return;
      if (u) {
        setScUrl(u);
        return;
      }
      lookupOpenLibraryCover(a).then((ol) => {
        if (live && ol) setOlUrl(ol);
      });
    });
    return () => {
      live = false;
    };
  }, [a, candidates.length]);
  if (!a) return null;
  const all = [
    ...(scUrl ? [scUrl] : []),
    ...candidates,
    ...(olUrl ? [olUrl] : []),
  ];
  if (step < all.length) {
    return (
      <img
        className="tower-cover-img"
        src={all[step]}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setStep((s) => s + 1)}
      />
    );
  }
  return (
    <span className={`tower-cover-tile tone-${coverTone(a)}`} aria-hidden="true">
      <span className="tower-cover-tile-title">{a.title}</span>
      {a.creator ? (
        <span className="tower-cover-tile-creator">{a.creator}</span>
      ) : null}
    </span>
  );
}

// One cover card (grid results + rails). `wide` = 16:9 frame for podcast
// episodes, whose covers are YouTube thumbnails.
function TowerBookCard({ a, go, wide = false }) {
  if (!a) return null;
  const entryPath = `/tower-of-babel/library/${a.artifact_id}`;
  return (
    <div className={`tower-book-card${wide ? " is-wide" : ""}`}>
      <button
        type="button"
        className="tower-book-coverbtn"
        onClick={() => go(entryPath)}
        aria-label={`Open ${a.title}`}
      >
        <span className="tower-book-cover">
          <TowerCover a={a} />
        </span>
      </button>
      <div className="tower-book-meta">
        <div className="tower-book-title">{a.title}</div>
        {a.creator || a.year ? (
          <div className="tower-book-sub">
            {a.creator}
            {a.creator && a.year ? " · " : ""}
            {a.year || ""}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="tower-read-btn"
        onClick={() => go(entryPath)}
      >
        {a.collection === "PODCASTS" ? "READ TRANSCRIPT" : "READ"}
      </button>
    </div>
  );
}

// A horizontal cover rail with a heading (Open Library pattern).
function CoverRail({ title, items, go, wide = false }) {
  const list = (items || []).filter(Boolean);
  if (list.length < 2) return null;
  return (
    <div className="tower-rail">
      <h3 className="tower-rail-title">{title}</h3>
      <div className={`tower-rail-track${wide ? " is-wide" : ""}`}>
        {list.map((a) => (
          <TowerBookCard key={a.artifact_id} a={a} go={go} wide={wide} />
        ))}
      </div>
    </div>
  );
}

// "Sacred texts of the world": grouped tile grids, one group per
// tradition, every tradition on equal footing (JW Library pattern).
function TraditionsGrid({ byId, go }) {
  const groups = TRADITIONS.map((g) => ({
    ...g,
    works: g.works.filter((w) => byId(w.id)),
  })).filter((g) => g.works.length >= 2);
  if (!groups.length) return null;
  return (
    <div className="tower-traditions">
      <div className="tower-block-head">
        <h2 className="tower-block-title">Sacred texts of the world</h2>
        <p className="tower-block-sub">
          The canons of every tradition in the library, side by side — no
          favoritism, no picking sides.
        </p>
      </div>
      {groups.map((g) => (
        <div className="trad-group" key={g.id}>
          <h3 className="trad-group-label">{g.label}</h3>
          <div className="trad-tiles">
            {g.works.map((w) => (
              <button
                key={w.id}
                type="button"
                className="trad-tile"
                style={{ background: g.tone }}
                onClick={() => go(`/tower-of-babel/library/${w.id}`)}
              >
                <span className="trad-tile-name">{w.label}</span>
                <span className="trad-tile-sub">{w.sub}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// The whole discovery zone: stacks cards + the selected stack's shelf
// panel, the traditions grid, and the featured rails. Shown only in the
// unfiltered browse state; searching or filtering hands the page to the
// results, exactly one scroll away.
// A category's own grouped showcase (2026-10-21 category panels): the
// traditions layout generalized — groups are the lane's subcategories
// (or Reference's source families), tiles are landmark seeds topped up
// from the live catalog. Groups with fewer than two works don't render.
function CategoryGroups({ stack, byId, artifacts, go }) {
  const data = STACK_GROUPS[stack.bucket.split(":")[0]];
  const fill = useMemo(() => {
    const byBucket = new Map();
    for (const a of artifacts) {
      const t = a.title || "";
      if (t.length < 10 || t.length > 120 || !t.includes(" ")) continue;
      const key = towerBucketKey(a) || a.collection;
      const arr = byBucket.get(key);
      if (!arr) byBucket.set(key, [a]);
      else if (arr.length < 10) arr.push(a);
    }
    return byBucket;
  }, [artifacts]);
  if (!data) return null;
  const used = new Set();
  const groups = [];
  for (const g of data.groups) {
    const works = [];
    const take = (a) => {
      if (!a || used.has(a.artifact_id) || works.length >= 4) return;
      used.add(a.artifact_id);
      works.push({
        a,
        label: a.title,
        sub: a.creator || (a.year ? String(a.year) : ""),
      });
    };
    for (const id of g.seeds || []) {
      const a = byId(id);
      if (a && (!g.bucket || (towerBucketKey(a) || a.collection) === g.bucket))
        take(a);
    }
    if (g.bucket) for (const a of fill.get(g.bucket) || []) take(a);
    const prefs = g.prefix ? [g.prefix] : g.prefixes || null;
    if (prefs) {
      for (const a of artifacts) {
        if (works.length >= 4) break;
        if (prefs.some((p) => a.artifact_id.startsWith(p))) take(a);
      }
    }
    if (works.length >= 2) groups.push({ g, works });
  }
  if (!groups.length) return null;
  return (
    <div className="tower-traditions">
      <div className="tower-block-head">
        <h2 className="tower-block-title">{data.title}</h2>
        {data.sub && <p className="tower-block-sub">{data.sub}</p>}
      </div>
      {groups.map(({ g, works }) => (
        <div className="trad-group" key={g.bucket || g.label}>
          <h4 className="trad-group-title">{g.label}</h4>
          <div className="trad-tiles">
            {works.map(({ a, label, sub }) => (
              <button
                key={a.artifact_id}
                type="button"
                className="trad-tile"
                style={{ background: g.tone }}
                onClick={() => go(`/tower-of-babel/library/${a.artifact_id}`)}
              >
                <span className="trad-tile-name">{label}</span>
                {sub && <span className="trad-tile-sub">{sub}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TowerDiscovery({ artifacts, towerData, go, onBrowse, onShelfChange }) {
  // Resolve curated ids against the artifacts array directly — NOT the
  // derivation's idIndex. The derivation phases in over seconds on a big
  // catalog; the shelves should be whole the moment the catalog itself
  // lands, so they key off the catalog identity alone.
  const byIdMap = useMemo(() => {
    const m = new Map();
    for (const a of artifacts) m.set(a.artifact_id, a);
    return m;
  }, [artifacts]);
  const byId = useCallback((id) => byIdMap.get(id) || null, [byIdMap]);
  // Most Popular (2026-10-23, Joshua's call — sits on top of Featured,
  // the curated rails stay below it): the real reader ranking, counted
  // from PostHog `work_viewed` events by the /tower-popular.json Pages
  // function (server-side query, edge-cached 1h; the PostHog API key
  // never reaches the browser). Deferred past first paint like the
  // other warm-up work on this page, and every failure mode is silent:
  // no key configured, endpoint down, or fewer than POPULAR_MIN_DISTINCT
  // distinct works viewed yet all leave the page exactly as it was.
  const POPULAR_MIN_DISTINCT = 8;
  const [popularIds, setPopularIds] = useState(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      fetch("/tower-popular.json")
        .then((r) => (r && r.ok ? r.json() : null))
        .then((d) => {
          if (!live || !d || !Array.isArray(d.items)) return;
          const ids = d.items
            .map((it) => it && it.artifact_id)
            .filter((id) => typeof id === "string" && id);
          if (ids.length >= POPULAR_MIN_DISTINCT) setPopularIds(ids);
        })
        .catch(() => {});
    }, 2500);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, []);
  const popularItems = popularIds ? popularIds.map(byId).filter(Boolean) : null;
  const showPopular = !!popularItems && popularItems.length >= 4;
  // The stacks are a selector (2026-10-21 category panels): nothing is
  // selected by default — the Featured rails own the page. Selecting a
  // stack swaps Featured for that category's shelf + grouped showcase;
  // selecting it again returns to Featured.
  const [shelf, setShelf] = useState(null);
  // Report selection upward: while a shelf is open the browse/results
  // section below hides, exactly like the Featured rails swap out.
  useEffect(() => {
    if (onShelfChange) onShelfChange(!!shelf);
  }, [shelf, onShelfChange]);
  useEffect(
    () => () => {
      if (onShelfChange) onShelfChange(false);
    },
    [onShelfChange],
  );
  const stack = shelf ? STACKS.find((s) => s.bucket === shelf) || null : null;
  const shelfCount = !stack
    ? 0
    : stack.bucket.indexOf(":") >= 0
      ? towerData.subCounts[stack.bucket] || 0
      : towerData.counts[stack.bucket] || 0;
  // "From the stacks" rotates a fixed slice of the pool by week —
  // curation, honestly labeled (the catalog has no usage or date data).
  const week = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  const pool = STACKS_POOL;
  const rotated = pool.map((_, k) => pool[(k + week) % pool.length]).slice(0, 8);
  return (
    <div className="tower-discovery">
      <div className="tower-block-head">
        <h2 className="tower-block-title">Browse the stacks</h2>
      </div>
      <div className="stacks-grid" role="tablist" aria-label="Browse the stacks">
        {STACKS.map((s) => {
          const count =
            s.bucket.indexOf(":") >= 0
              ? towerData.subCounts[s.bucket] || 0
              : towerData.counts[s.bucket] || 0;
          const faces = s.covers.map(byId).filter(Boolean).slice(0, 3);
          return (
            <button
              key={s.bucket}
              type="button"
              role="tab"
              aria-selected={shelf === s.bucket}
              className={`stack-card${shelf === s.bucket ? " is-active" : ""}`}
              onClick={() => setShelf(shelf === s.bucket ? null : s.bucket)}
            >
              <span className="stack-collage" aria-hidden="true">
                {faces.map((a, k) => (
                  <span className={`stack-face stack-face-${k}`} key={a.artifact_id}>
                    <TowerCover a={a} />
                  </span>
                ))}
              </span>
              <span className="stack-label">{s.label}</span>
              <span className="stack-count">
                {count.toLocaleString()} works
              </span>
            </button>
          );
        })}
      </div>
      {stack && (
        <div className="shelf-panel">
          <div className="shelf-head">
            <div>
              <h3 className="shelf-title">{stack.label}</h3>
              <p className="shelf-blurb">
                {stack.blurb} · {shelfCount.toLocaleString()} works
              </p>
            </div>
            <button
              type="button"
              className="shelf-seeall"
              onClick={() => onBrowse(stack.bucket)}
            >
              See all ›
            </button>
          </div>
          <CoverRail
            title="Notable works"
            items={stack.rail.map(byId)}
            go={go}
            wide={stack.bucket === "PODCASTS"}
          />
        </div>
      )}
      {stack && stack.bucket === "BOOKS:sacred" && (
        <TraditionsGrid byId={byId} go={go} />
      )}
      {stack && stack.bucket !== "BOOKS:sacred" && (
        <CategoryGroups stack={stack} byId={byId} artifacts={artifacts} go={go} />
      )}
      {!stack && (
        <>
          {showPopular && (
            <div className="tower-popular">
              <div className="tower-block-head">
                <h2 className="tower-block-title">Most Popular</h2>
                <p className="tower-block-sub">
                  What readers are opening most — ranked from real visits
                  over the last 30 days, updated hourly.
                </p>
              </div>
              <CoverRail title="Most viewed" items={popularItems} go={go} />
            </div>
          )}
          <div className="tower-featured">
          <div className="tower-block-head">
            <h2 className="tower-block-title">Featured</h2>
          </div>
          <CoverRail title="Essential texts" items={RAIL_ESSENTIAL.map(byId)} go={go} />
          <CoverRail
            title="Declassified & founding documents"
            items={RAIL_RECORDS.map(byId)}
            go={go}
          />
          <CoverRail
            title="Podcasts — read the conversation"
            items={(STACKS.find((s) => s.bucket === "PODCASTS") || { rail: [] }).rail.map(byId)}
            go={go}
            wide
          />
          <CoverRail title="From the stacks" items={rotated.map(byId)} go={go} />
          </div>
        </>
      )}
    </div>
  );
}

function TowerLibrarySection({ go, onReady }) {
  // Stability (2026-10-27): the +6s shard-manifest warm that used to live
  // here is REMOVED — it parsed a ~16MB manifest on every landing-page
  // visit for data this page never uses. Entry pages fetch it on demand.
  // The catalog loads asynchronously (see ./lib/catalog.js). While it is
  // null the Tower boot loader covers the screen, so rendering nothing is
  // correct — never a half-built page.
  const [artifacts, catalogError, fullIndexReady, retryArtifacts] = useArtifacts();
  // Derived data (sort orders, collection counts, chips, search haystacks)
  // builds AFTER first paint in a deferred, chunked task (see
  // deriveTowerData above) — never synchronously in render. At production
  // scale the derivation costs seconds of main-thread time; doing it in
  // render froze the boot animation mid-play and delayed onReady past the
  // loader's comfort zone.
  const [towerData, setTowerData] = useState(null);
  // If the derivation itself ever throws (corrupt record shape, memory
  // pressure), show the error UI rather than crashing the route — the
  // loader failsafe guarantees the overlay dismisses either way.
  const [deriveError, setDeriveError] = useState(false);
  const [deriveSeq, setDeriveSeq] = useState(0);
  useEffect(() => {
    if (!artifacts) {
      setTowerData(null);
      return;
    }
    let cancelled = false;
    deriveTowerData(
      artifacts,
      () => cancelled,
      (phase) => {
        // Phase 1 (search data) is live the moment it lands — the sort
        // orders still building in the background must not hold search
        // hostage.
        if (!cancelled) setTowerData(phase);
      }
    ).then(
      (data) => {
        if (cancelled) return;
        if (data) setTowerData(data);
        else setDeriveError(true);
      },
      () => {
        if (!cancelled) setDeriveError(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [artifacts, deriveSeq]);
  const retryCatalog = () => {
    setDeriveError(false);
    retryArtifacts();
    // Re-run the derivation too: the same artifacts identity would not
    // retrigger the effect on its own.
    setDeriveSeq((n) => n + 1);
  };
  const failed = catalogError || deriveError;
  // Live search + two-level browse filter + sort. Empty query/filter = show all.
  // bucketFilter is "" (all), a lane ("PAPERS"), or a subcategory
  // ("PAPERS:bio"). Click mechanics are unchanged from the old collection
  // filter: click a chip to filter, click the active chip to clear,
  // pagination resets on change, 50 rows per page with "Load more".
  // (The query state itself lives further down, with the unified-search
  // pipeline it feeds — see "ONE search".)
  const [bucketFilter, setBucketFilter] = useState("");
  const [sortId, setSortId] = useState("title-asc");
  // Results presentation (revamp 2026-10-21): cover grid by default, list
  // on request; the choice persists across visits.
  const [viewMode, setViewMode] = useState(() => {
    try {
      return window.localStorage.getItem("tower-view") === "list"
        ? "list"
        : "grid";
    } catch {
      return "grid";
    }
  });
  const pickView = (m) => {
    setViewMode(m);
    try {
      window.localStorage.setItem("tower-view", m);
    } catch {
      /* private mode — the choice just won't persist */
    }
  };
  // ONE search (Workstream D, 2026-10-27): there is no mode any more.
  // Every query searches titles/creators AND the full text of every work
  // together, and the results render as a single interleaved list ranked
  // by one blended BM25F score (see the search memo below and
  // lib/search-rank.js scoreBlended). The old Titles / Full text toggle
  // and its searchMode state are gone by product decision.
  // The query is reflected in the URL as ?q= (SPEC-1): shareable,
  // reload-safe, back-button correct. replaceState while typing,
  // pushState on submit.
  const [query, setQueryState] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("q") || "";
    } catch {
      return "";
    }
  });
  const setQuery = (v) => setQueryState(v);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        const cur = url.searchParams.get("q") || "";
        if (cur === query) return;
        if (query) url.searchParams.set("q", query);
        else url.searchParams.delete("q");
        window.history.replaceState({}, "", url);
      } catch {
        /* history unavailable — the search itself is unaffected */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);
  // Strict/undo for the relaxation ladder (SPEC-6): when a relaxed stage
  // produced the results, the banner offers "search exactly instead",
  // which pins THIS query to its strict form. Reset whenever the query
  // text changes.
  const [strictQuery, setStrictQuery] = useState("");
  // Search-results paging (SPEC-4): 25 per page, numbered pages 1–10,
  // then cursor-based Load more. Browse paging keeps its own budget.
  const [searchPage, setSearchPage] = useState(1);
  const [searchExtra, setSearchExtra] = useState(0); // extra rows past page 10
  // IME composition guard (SPEC-8): no search fires mid-composition.
  const composingRef = useRef(false);
  // Deep-search request bookkeeping (SPEC-5): sequence guard + abort +
  // LRU result cache (50 entries / 60s), keyed by the normalized query.
  const deepSeqRef = useRef(0);
  const deepAbortRef = useRef(null);
  const deepCacheRef = useRef(new Map());
  const resultsHeadingRef = useRef(null);
  const searchInputRef = useRef(null);
  const [focusResultsPending, setFocusResultsPending] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  // Collections filter (2026-10-24, replaces the deleted hub pages):
  // collGroup is a COLLECTION_GROUPS id (or "" for no group tab), and
  // collKey is the selected collection's key (or "" for none). The
  // collection's work ids come from the precomputed hub index, fetched
  // lazily — the page paints and browses normally before it lands, and
  // a failed fetch simply hides this UI (collFailed) instead of
  // erroring the browse. The collection filter intersects with the
  // existing search + category filter + sort in the rank memo below;
  // it never renders a second list.
  const [collGroup, setCollGroup] = useState("");
  const [collKey, setCollKey] = useState("");
  const [collData, setCollData] = useState(null);
  const [collLoading, setCollLoading] = useState(false);
  const [collFailed, setCollFailed] = useState(false);
  const collSectionRef = useRef(null);
  const ensureCollections = useCallback(() => {
    if (collData || collFailed || collLoading) return;
    setCollLoading(true);
    loadHubsIndex().then((d) => {
      setCollLoading(false);
      if (!d) {
        setCollFailed(true);
        return;
      }
      setCollData(buildCollections(d));
    });
  }, [collData, collFailed, collLoading]);
  // Approach trigger: start the hub-index fetch when the collections
  // block comes within ~800px of the viewport, so it is usually ready
  // before the visitor taps a group tab.
  useEffect(() => {
    const el = collSectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          ensureCollections();
          io.disconnect();
        }
      },
      { rootMargin: "800px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ensureCollections]);
  const activeCollection = useMemo(() => {
    if (!collData || !collKey) return null;
    for (const g of collData.groups) {
      const found = g.collections.find((c) => c.key === collKey);
      if (found) return found;
    }
    return null;
  }, [collData, collKey]);
  const collSet = activeCollection ? activeCollection.ids : null;
  // Unified filter revamp (2026-10-25, visual only): a Collections tap
  // mounts/unmounts the whole discovery zone above the results, which
  // used to leave the viewport stranded on stacks / Featured / FAQ.
  // After a tap, land deterministically on the Collections block itself
  // (instant, not smooth — smooth scrolling fights the height change
  // on iOS). Filter logic, counts and click-to-clear are unchanged.
  const collScrollPending = useRef(false);
  const selectCollGroup = (g) => {
    collScrollPending.current = true;
    setCollGroup(g);
    setCollKey("");
    if (g) ensureCollections();
  };
  const selectCollection = (key) => {
    collScrollPending.current = true;
    setCollKey((prev) => (prev === key ? "" : key));
  };
  useEffect(() => {
    if (!collScrollPending.current) return;
    collScrollPending.current = false;
    const el = collSectionRef.current;
    if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
  }, [collGroup, collKey]);
  // Stack-card "See all" / subcategory jumps: apply the existing bucket
  // filter, then bring the results into view (the discovery zone hands
  // the page over to the results in the filtered state).
  const browseTo = (bucket) => {
    setBucketFilter(bucket);
    requestAnimationFrame(() => {
      const el = document.getElementById("tower-results");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  // Pagination: 50 rows per page, user clicks "Load more". The full catalog
  // is never mounted at once — the DOM stays small so style recalc and
  // paint stay cheap, and the loader releases after the first 50 paint.
  const [rowBudget, setRowBudget] = useState(TOWER_ROWS_PER_PAGE);
  const [shelfActive, setShelfActive] = useState(false);
  // Stage 1 ungating (2026-10-23): the full catalog index no longer loads
  // automatically with the page. It starts when the visitor shows intent —
  // the first change to any browse control (search text, filter, sort,
  // Load more) — or from the approach/idle triggers below. The bootstrap
  // slice stays fully browsable in the meantime.
  const indexIntentSeen = useRef(false);
  useEffect(() => {
    if (!indexIntentSeen.current) {
      indexIntentSeen.current = true;
      return;
    }
    requestCatalogIndex();
  }, [query, bucketFilter, sortId, rowBudget, collKey]);
  // Automatic start (2026-10-28, Joshua's direct order): the explicit-
  // intent-only rule below left the library presenting as a 20,000-work
  // library — plain scrolling never started the index, the header count
  // sat at the bootstrap size, and on mobile the rest of the library
  // effectively never arrived. The index now starts on its own once
  // this section is on screen: the visitor's first scroll, or a short
  // delay while the tab is visible, whichever comes first. This is a
  // SINGLE one-shot trigger on the library page only, armed after the
  // bootstrap paints — not the three stacked passive loads (approach
  // trigger + 12s idle + landing manifest warm) whose combination
  // jetsam-killed mobile Safari tabs in the 2026-10-27 crash loop.
  // Chunks publish progressively, so the header count climbs visibly
  // from 20,000 to the full catalog instead of sitting on a wrong
  // number with no sign anything is loading.
  useEffect(() => {
    let done = false;
    let timer = null;
    const start = () => {
      if (done) return;
      done = true;
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
      requestCatalogIndex();
    };
    const onScroll = () => {
      if (window.scrollY > 240) start();
    };
    const armTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") start();
        else armTimer();
      }, 2500);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    armTimer();
    return () => {
      done = true;
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
    };
  }, []);
  // Stability (2026-10-27): the approach trigger and the 12s idle
  // schedule that used to live here were REMOVED. Both loaded the full
  // ~186MB catalog index without any explicit visitor intent — on mobile
  // Safari the parse + progressive re-derivation exhausted the tab's
  // memory budget and iOS jetsam-killed the page into a reload loop
  // (open the library, scroll, crash). Superseded in part by the
  // automatic start above (2026-10-28): one bounded trigger, library
  // page only. Do not re-add the approach/idle stack.
  // The input stays bound to the raw query so typing never waits on work;
  // the expensive filter/sort and the deep index search run on the deferred
  // value at background priority, which removes the keystroke lag.
  const deferredQuery = useDeferredValue(query);
  // The results update on a debounced copy of the query, not on the raw
  // input value: at normal typing speed a deferred value still catches up
  // between keystrokes, which would re-reconcile thousands of rows
  // mid-burst. Debouncing collapses a burst into ~1 list update, so the
  // input never competes with row reconciliation. The debounce is
  // adaptive (SPEC-5): 150ms on fast 4G, 200ms default, 400ms on
  // slow-2g/2g or save-data (Network Information API). No blended search
  // below 2 characters.
  const [listQuery, setListQuery] = useState("");
  useEffect(() => {
    if (composingRef.current) return;
    const t = setTimeout(
      () => setListQuery(deferredQuery.trim().toLowerCase()),
      adaptiveDebounceMs()
    );
    return () => clearTimeout(t);
  }, [deferredQuery]);
  useEffect(() => {
    // Reset paging (browse + search) whenever the query or filters change;
    // a relaxed-stage undo pin for a previous query never carries over.
    setRowBudget(TOWER_ROWS_PER_PAGE);
    setSearchPage(1);
    setSearchExtra(0);
    setStrictQuery("");
  }, [listQuery, bucketFilter, sortId, collKey]);
  // Deep full-text search: part of the SAME blended query now, not a
  // second mode. Runs on the debounced query with an AbortController +
  // sequence guard (SPEC-5): a stale response can never land over a
  // newer one, and an aborted run keeps the previous results on screen.
  // Results are LRU-cached (50 entries / 60s) keyed by normalized query.
  const [deep, setDeep] = useState({ state: "idle", forQuery: "" });
  useEffect(() => {
    const raw = listQuery;
    if (raw.length < 2) {
      setDeep({ state: "idle", forQuery: "" });
      return;
    }
    const cacheKey = normText(raw);
    const hit = deepCacheRef.current.get(cacheKey);
    if (hit && Date.now() - hit.ts < 60000) {
      deepCacheRef.current.delete(cacheKey);
      deepCacheRef.current.set(cacheKey, hit); // LRU touch
      setDeep({ ...hit.res, forQuery: raw });
      return;
    }
    const seq = ++deepSeqRef.current;
    if (deepAbortRef.current) deepAbortRef.current.abort();
    const ctl = new AbortController();
    deepAbortRef.current = ctl;
    setDeep((d) => ({ ...d, state: "loading", forQuery: raw }));
    searchDeep(raw, { signal: ctl.signal }).then((res) => {
      if (seq !== deepSeqRef.current) return; // superseded — discard
      if (res.state === "aborted") return; // keep previous results visible
      if (res.state === "ready") {
        deepCacheRef.current.set(cacheKey, { ts: Date.now(), res });
        if (deepCacheRef.current.size > 50) {
          deepCacheRef.current.delete(deepCacheRef.current.keys().next().value);
        }
      }
      setDeep({ ...res, forQuery: raw });
    });
    return () => {
      // Superseded by a newer query: abort the in-flight fetch so its
      // shards stop downloading (the sequence guard above is the
      // belt-and-braces for fetches that cannot be aborted mid-body).
      if (seq === deepSeqRef.current) ctl.abort();
    };
  }, [listQuery]);
  const q = listQuery;
  // While the sort orders are still building (phase 1 data only), browse
  // in plain catalog order — the rows and the search work immediately,
  // and the chosen sort snaps in when its order lands.
  const identityOrder = useMemo(
    () => (artifacts ? artifacts.map((_, i) => i) : []),
    [artifacts]
  );
  // Stats-strip collection count, straight from the catalog (the
  // derivation's lane list phases in later and must not gate it).
  const collectionsCount = useMemo(
    () => (artifacts ? new Set(artifacts.map((a) => a.collection)).size : 0),
    [artifacts]
  );
  const towerOrder = towerData
    ? towerData.order
      ? towerData.order[sortId] || towerData.order["title-asc"]
      : identityOrder
    : [];
  // Rank of each matching artifact in the current filter/sort (1-based), as
  // a Map from artifact_id. LibraryResults mounts only the matching rows,
  // so a filter/sort update reconciles dozens of rows instead of the whole
  // catalog — the hidden-flag approach this replaced kept input fast but
  // made every update walk everything. The memoized TowerRow re-renders
  // only when its own rank actually changes.
  // Active lane for the subcategory row: the lane part of bucketFilter.
  const activeLane = bucketFilter ? bucketFilter.split(":")[0] : "";
  const activeSubs = TOWER_SUBS[activeLane] || [];
  const { rankMap, matchCount, rankedIndices, blendedModel } = useMemo(() => {
    const map = new Map();
    if (!artifacts || !towerData)
      return { rankMap: map, matchCount: 0, rankedIndices: null };
    // Two-level filter: a lane bucket ("PAPERS") matches every record whose
    // bucket key starts with "PAPERS:" (the subcategory partition is exact,
    // so this is identical to the old collection equality check); a
    // subcategory bucket ("PAPERS:bio") matches its key exactly.
    const bf = bucketFilter;
    const bfLane = bf && bf.indexOf(":") < 0 ? bf + ":" : null;
    const passesBucket = (i) => {
      const bk = towerData.bucketKeys[i];
      return !bf || bk === bf || (bfLane && bk.indexOf(bfLane) === 0);
    };
    // Collections filter: intersect with the bucket filter above. The
    // collection's id Set comes from the hub index; a work not in the
    // set is out, whatever the search/category state says.
    const passesCollection = (i) =>
      !collSet || collSet.has(artifacts[i].artifact_id);
    const qNorm = q ? normText(q) : "";
    if (!qNorm || !towerData.haystacks) {
      // Browsing: the chosen sort order governs, as before. (Also the
      // phase-0 path: until the search data lands, a typed query browses
      // in catalog order rather than blocking on the indexing.) Only the
      // first `rowBudget` ranks are materialized into the map (they are
      // the only rows that can mount); the full match count comes from
      // a counting pass, so a filter/sort change costs a light scan
      // instead of a catalog-sized Map build.
      let count = 0;
      for (let k = 0; k < towerOrder.length; k++) {
        const i = towerOrder[k];
        if (!passesBucket(i) || !passesCollection(i)) continue;
        count++;
        if (map.size < rowBudget) map.set(artifacts[i].artifact_id, count);
      }
      return { rankMap: map, matchCount: count, rankedIndices: null, blendedModel: null };
    }
    // Searching (Workstream D, SPEC-6): ONE blended list. Catalog-field
    // matches (BM25F over title/creator/subject/description) and full-text
    // matches (BM25 from the deep index, weight x1) merge into a single
    // score per work, deduped by work, pins first. The sort dropdown
    // governs browsing only; while a query is active the best answer
    // leads. Below 2 characters the blended pipeline does not engage and
    // the query browses in catalog order (previous behavior).
    if (q.trim().length < 2) {
      let count = 0;
      for (let k = 0; k < towerOrder.length; k++) {
        const i = towerOrder[k];
        if (!passesBucket(i) || !passesCollection(i)) continue;
        count++;
        if (map.size < rowBudget) map.set(artifacts[i].artifact_id, count);
      }
      return { rankMap: map, matchCount: count, rankedIndices: null, blendedModel: null };
    }
    const tokens = queryTokens(qNorm);
    const qMask = querySecondaryMask(qNorm);
    // Quoted phrases (SPEC-6): exact phrase only — never stemmed, never
    // fuzzed, never relaxed. On the catalog side that means the phrase
    // (normText form) must appear verbatim in the haystack; unquoted
    // remainder tokens still AND alongside it.
    const quotedPhrases = [];
    {
      const re = /"([^"]+)"/g;
      let m;
      while ((m = re.exec(q)) !== null) {
        const p = normText(m[1]);
        if (p) quotedPhrases.push(p);
      }
    }
    const isQuoted = quotedPhrases.length > 0;
    const phraseTokenSet = new Set(quotedPhrases.flatMap((p) => p.split(" ")));
    const remainderTokens = tokens.filter((t) => !phraseTokenSet.has(t));
    // Bound by the haystacks length, not artifacts.length: during the
    // bootstrap->full catalog upgrade the two can briefly disagree, and
    // the derived arrays are the internally consistent ones.
    const N = Math.min(artifacts.length, towerData.haystacks.length);
    const NT = towerData.normTitles;
    // One scan: per-token document frequency (for BM25 idf) + the
    // strict AND candidate set.
    const df = new Map(tokens.map((t) => [t, 0]));
    const andSet = [];
    for (let i = 0; i < N; i++) {
      if (!passesBucket(i) || !passesCollection(i)) continue;
      const hay = towerData.haystacks[i];
      let ok = true;
      for (const t of tokens) {
        if (hay.includes(t)) df.set(t, df.get(t) + 1);
        else ok = false;
      }
      if (ok && isQuoted) {
        ok =
          quotedPhrases.every((p) => hay.includes(p)) &&
          remainderTokens.every((t) => hay.includes(t));
      }
      if (ok) andSet.push(i);
    }
    const dfOf = (t) => df.get(t) || 0;
    // Canon pins resolve FIRST: an exact-alias query is exact intent, so
    // a resolved pin suppresses the relaxation ladder entirely and the
    // pinned works lead the list (injected below even when the strict
    // AND scan did not surface them — "torah" -> the Tyndale Pentateuch,
    // whose own title never says "torah").
    const pins = pinsForQuery(qNorm, tokens);
    const pinIds = pins
      ? pins.filter((id) => {
          const ix = towerData.idIndex.get(id);
          return ix !== undefined && passesBucket(ix) && passesCollection(ix);
        })
      : [];
    // How many strict candidates match a query token as an exact TOKEN
    // in title/creator? Substring-only matches ("bibl" inside
    // "biblical") score at the floor — when fewer than 3 candidates have
    // a real field match, the typo stage is the real answer.
    let fieldMatchCount = 0;
    if (andSet.length) {
      for (const i of andSet) {
        const padded = " " + NT[i] + " " + towerData.normCreators[i] + " ";
        if (tokens.some((t) => padded.includes(" " + t + " "))) fieldMatchCount++;
      }
    }
    // --- Relaxation ladder (SPEC-6): stages run in order, stop at the
    // first with >= 3 results, and whatever produced the list is
    // LABELLED. strictQuery (the banner's undo) pins the strict form.
    const strict = strictQuery === q;
    let effTokens = tokens;
    let effQNorm = qNorm;
    let stage = null; // {kind, label, dropped:[], correctedQuery}
    let candIdx = andSet;
    if (!strict && !isQuoted && pinIds.length === 0 && (andSet.length < 3 || fieldMatchCount < 3)) {
      // Stage 2 — typo tolerance (gated by term length in
      // correctionCandidates; never on numbers or quoted terms — this
      // pipeline has no quoted terms, quotes live in the deep query).
      const vocab = towerData.vocab;
      if (vocab) {
        // Gate on the token's exact-field frequency (vocab), NOT the
        // substring df: "bibl" substring-matches 70+ haystacks but is an
        // exact title/creator token in none of them.
        const corr = tokens.map((t) =>
          (vocab.get(t) || 0) < 3 ? correctionCandidates(t, vocab, 1)[0] : null
        );
        if (corr.some(Boolean)) {
          const corrTokens = tokens.map((t, k) => corr[k] || t);
          const corrQ = corrTokens.join(" ");
          const corrSet = [];
          for (let i = 0; i < N; i++) {
            if (!passesBucket(i) || !passesCollection(i)) continue;
            const hay = towerData.haystacks[i];
            let ok = true;
            for (const t of corrTokens) if (!hay.includes(t)) { ok = false; break; }
            if (ok) corrSet.push(i);
          }
          if (corrSet.length >= 3) {
            candIdx = corrSet;
            effTokens = corrTokens;
            effQNorm = corrQ;
            stage = { kind: "typo", correctedQuery: corrQ };
            for (const t of corrTokens) {
              if (!df.has(t)) {
                let c = 0;
                for (let i = 0; i < N; i++) if (towerData.haystacks[i].includes(t)) c++;
                df.set(t, c);
              }
            }
          } else if (corrSet.length >= 1) {
            // Not enough to auto-apply — offer as did-you-mean (SPEC-6
            // stage 5: only ever shown when it returns results).
            stage = { kind: "didyoumean", correctedQuery: corrQ };
          }
        }
      }
      // Stage 3 — drop stopwords.
      if (!stage || stage.kind === "didyoumean") {
        const kept = tokens.filter((t) => !QUERY_STOPWORDS.has(t));
        if (kept.length > 0 && kept.length < tokens.length) {
          const dropSet = [];
          for (let i = 0; i < N; i++) {
            if (!passesBucket(i) || !passesCollection(i)) continue;
            const hay = towerData.haystacks[i];
            let ok = true;
            for (const t of kept) if (!hay.includes(t)) { ok = false; break; }
            if (ok) dropSet.push(i);
          }
          if (dropSet.length >= 3) {
            candIdx = dropSet;
            stage = {
              kind: "stopwords",
              dropped: tokens.filter((t) => QUERY_STOPWORDS.has(t)),
            };
            effTokens = kept;
          }
        }
      }
      // Stage 4 — least-significant terms optional: partial matches,
      // BM25F-ranked, requiring at least half the terms (rounded up).
      if ((!stage || stage.kind === "didyoumean") && tokens.length > 1 && candIdx.length < 3) {
        const need = Math.ceil(tokens.length / 2);
        const partSet = [];
        for (let i = 0; i < N; i++) {
          if (!passesBucket(i) || !passesCollection(i)) continue;
          const hay = towerData.haystacks[i];
          let hits = 0;
          for (const t of tokens) if (hay.includes(t)) hits++;
          if (hits >= need) partSet.push(i);
        }
        if (partSet.length > candIdx.length) {
          candIdx = partSet;
          stage = { kind: "optional", dropped: [] };
        }
      }
    }
    // --- Score the candidate set with BM25F field weights.
    const items = [];
    const byId = new Map();
    for (const i of candIdx) {
      const a = artifacts[i];
      const r = scoreBlended(
        {
          title: NT[i],
          creator: towerData.normCreators[i],
          subject: towerData.normColls[i],
          description: towerData.normDescs ? towerData.normDescs[i] : "",
        },
        effQNorm,
        effTokens,
        dfOf,
        N,
        towerData.secMasks[i],
        towerData.volFlags[i],
        qMask
      );
      if (r.score <= 0 && stage?.kind !== "optional") {
        // AND-matched on a peripheral field only (year/tags) — keep it,
        // BM25F simply ranks it low; a floor keeps it in the list.
        r.score = Math.max(r.score, 0.01);
      }
      const item = {
        key: a.artifact_id,
        artifact: a,
        index: i,
        score: r.score,
        meta: r,
        text: null,
        doc: null,
      };
      items.push(item);
      byId.set(a.artifact_id, item);
    }
    // --- Merge the full-text results into the same list (weight x1).
    // Exception: when the typo stage applied, the list is the CORRECTED
    // query's — merging the original query's text matches under the
    // "spelling corrected" banner would mix two different queries.
    let deepExtra = 0;
    if (
      deep && deep.forQuery === q && deep.state === "ready" && deep.works &&
      !(stage && stage.kind === "typo")
    ) {
      for (const w of deep.works) {
        const id = w.doc.id;
        const ix = towerData.idIndex.get(id);
        if (ix !== undefined && !passesBucket(ix)) continue;
        if (ix !== undefined && !passesCollection(ix)) continue;
        const textScore = FIELD_WEIGHTS.fulltext * (w.score || 0);
        const existing = byId.get(id);
        if (existing) {
          existing.score += textScore;
          existing.text = w;
          existing.doc = w.doc;
          existing.parsedQuery = deep.query;
        } else {
          const a =
            ix !== undefined
              ? artifacts[ix]
              : {
                  artifact_id: id,
                  title: w.doc.title,
                  creator: w.doc.creator || "",
                  year: w.doc.year || null,
                  collection: w.doc.collection || "",
                  format: "TXT",
                };
          const item = {
            key: id,
            artifact: a,
            index: ix !== undefined ? ix : -1,
            score: textScore,
            meta: { title: false, creator: false, subject: false, description: false },
            text: w,
            doc: w.doc,
            parsedQuery: deep.query,
          };
          items.push(item);
          byId.set(id, item);
        }
      }
      deepExtra = deep.truncated
        ? Math.max(0, (deep.totalWorks || 0) - deep.works.length)
        : 0;
    }
    items.sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      const tx = (x.index >= 0 && NT[x.index]) || normText(x.artifact.title || "");
      const ty = (y.index >= 0 && NT[y.index]) || normText(y.artifact.title || "");
      if (tx !== ty) return tx < ty ? -1 : 1;
      return x.key < y.key ? -1 : x.key > y.key ? 1 : 0;
    });
    // A spelling-corrected query claims the corrected form's canon pins
    // too ("bibl" -> "bible" -> the King James Bible leads).
    let effPinIds = pinIds;
    if (stage && stage.kind === "typo") {
      const cp = pinsForQuery(effQNorm, effTokens);
      if (cp) {
        const resolved = cp.filter((id) => {
          const ix = towerData.idIndex.get(id);
          return ix !== undefined && passesBucket(ix) && passesCollection(ix);
        });
        if (resolved.length) effPinIds = resolved;
      }
    }
    // Canon pins lead (exact alias only) — injected even when the scan
    // did not surface them, scored with the same BM25F so their relative
    // order stays honest below the pin group.
    if (effPinIds.length) {
      const pinIds = effPinIds;
      const pinItems = [];
      for (const id of pinIds) {
        let it = byId.get(id);
        if (!it) {
          const ix = towerData.idIndex.get(id);
          const a = artifacts[ix];
          const r = scoreBlended(
            {
              title: NT[ix],
              creator: towerData.normCreators[ix],
              subject: towerData.normColls[ix],
              description: towerData.normDescs ? towerData.normDescs[ix] : "",
            },
            effQNorm,
            effTokens,
            dfOf,
            N,
            towerData.secMasks[ix],
            towerData.volFlags[ix],
            qMask
          );
          it = {
            key: id,
            artifact: a,
            index: ix,
            score: Math.max(r.score, 0.01),
            meta: r,
            text: null,
            doc: null,
          };
          items.push(it);
          byId.set(id, it);
        }
        pinItems.push(it);
      }
      const pinSet = new Set(pinItems.map((it) => it.key));
      items.splice(0, items.length, ...pinItems, ...items.filter((it) => !pinSet.has(it.key)));
    }
    const total = items.length + deepExtra;
    const blendedModel = {
      items,
      total,
      stage,
      suggestion:
        stage && stage.kind === "didyoumean" ? stage.correctedQuery : null,
      appliedCorrection:
        stage && stage.kind === "typo" ? stage.correctedQuery : null,
      droppedTerms: stage && stage.dropped ? stage.dropped : [],
      deepState: deep && deep.forQuery === q ? deep.state : "idle",
      pending:
        !deep || deep.forQuery !== q || deep.state === "loading",
      query: q,
      tokens: effTokens,
    };
    const cap = Math.min(items.length, rowBudget);
    for (let k = 0; k < cap; k++) {
      if (items[k].index >= 0) map.set(items[k].key, k + 1);
    }
    return { rankMap: map, matchCount: total, rankedIndices: null, blendedModel };
  }, [q, bucketFilter, sortId, towerOrder, artifacts, towerData, rowBudget, collSet, deep, strictQuery]);
  // Report ready exactly once when the section settles: the first 50 rows
  // have painted, or the error UI is up. The double rAF waits for paint;
  // the timeout fallback covers background tabs (and any dropped frame
  // chain) where rAF never fires — the loader can never be trapped behind
  // a callback that never runs. The error path reports ready too: the
  // loader must release onto the error UI, never sit on it.
  const settled = towerData !== null || failed;
  useEffect(() => {
    if (!settled || !onReady) return;
    let fired = false;
    const fire = () => {
      if (!fired) {
        fired = true;
        onReady();
      }
    };
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(fire);
    });
    const t = setTimeout(fire, 1500);
    return () => {
      fired = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t);
    };
  }, [settled, onReady]);
  // Analytics: one search_performed per settled query (900ms debounce so
  // keystrokes don't flood it), with the result count the user saw.
  useEffect(() => {
    const qv = query.trim();
    if (qv.length < 2) return;
    const t = setTimeout(() => {
      track("search_performed", {
        query: qv,
        results: matchCount,
        bucket: bucketFilter || "all",
      });
    }, 900);
    return () => clearTimeout(t);
  }, [query, matchCount, bucketFilter]);
  // Explicit submit (SPEC-1/SPEC-8): pushState the ?q= URL, show skeleton
  // rows only for this initial submitted search (never per keystroke),
  // and move focus to the results heading once the settled results land.
  const onSearchSubmit = (e) => {
    e.preventDefault();
    try {
      const url = new URL(window.location.href);
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      window.history.pushState({}, "", url);
    } catch {
      /* non-fatal */
    }
    if (query.trim().length >= 2) {
      if (!blendedModel || blendedModel.query !== listQuery) setShowSkeleton(true);
      setFocusResultsPending(true);
    }
  };
  useEffect(() => {
    if (!focusResultsPending) return;
    if (blendedModel && !blendedModel.pending) {
      setFocusResultsPending(false);
      setShowSkeleton(false);
      if (resultsHeadingRef.current) {
        resultsHeadingRef.current.focus({ preventScroll: false });
      }
    }
  }, [focusResultsPending, blendedModel]);
  useEffect(() => {
    if (showSkeleton && blendedModel && !blendedModel.pending) setShowSkeleton(false);
  }, [showSkeleton, blendedModel]);
  // Esc in the field (SPEC-8), in stages: first Esc clears the query,
  // a second Esc (already empty) leaves the field.
  const onSearchKeyDown = (e) => {
    if (e.key !== "Escape") return;
    if (query) {
      e.preventDefault();
      setQuery("");
    } else if (searchInputRef.current) {
      searchInputRef.current.blur();
    }
  };
  // Catalog failed even after the automatic retry: show the error state,
  // never a blank page. While the catalog loads, render the page shell —
  // the Tower boot loader covers the first seconds, but its failsafe can
  // lift before a slow connection delivers the catalog, and the shell
  // guarantees the user never stares at a void in that gap.
  if (failed) return <TowerCatalogError onRetry={retryCatalog} />;
  if (!artifacts || !towerData) return (
    <>
      <section className="tower-index section">
        <div className="section-index">CATALOG</div>
        <p className="tower-empty-results" aria-live="polite">
          Loading the catalog…
        </p>
      </section>
    </>
  );
  return (
    <>
      <section className="tower-index section">
        <div className="section-index">CATALOG</div>
        <div className="tower-suggest-actions">
          <button
            type="button"
            className="tower-access-btn"
            onClick={() => go("/tower-of-babel/library/suggest")}
          >
            SUGGEST AN ENTRY <span aria-hidden="true">↗</span>
          </button>
          <button
            type="button"
            className="tower-access-btn tower-donate-btn"
            onClick={() => go("/tower-of-babel/donate")}
          >
            DONATE <span aria-hidden="true">♥</span>
          </button>
          <button
            type="button"
            className="tower-access-btn"
            onClick={() => go("/tower-of-babel/library/research")}
          >
            API ACCESS <span aria-hidden="true">↗</span>
          </button>
        </div>
        {artifacts.length === 0 ? (
          <div className="tower-index-empty">
            <h2>{towerOfBabel.library.empty.heading}</h2>
            <p>{towerOfBabel.library.empty.body}</p>
          </div>
        ) : (
          <>
            <div className="tower-stats" aria-label="The library at a glance">
              <span>
                <strong>{artifacts.length.toLocaleString()}</strong> works
              </span>
              <span>
                <strong>{collectionsCount}</strong> collections
              </span>
              <span>
                <strong>{TRADITIONS.length}</strong> sacred traditions
              </span>
              <span>No accounts, no paywalls</span>
            </div>
            <div className="tower-controls">
              {/* ONE search bar (Workstream D, SPEC-1): a real search
                  landmark + form, one input, one submit. There is no
                  mode switcher — every query always searches titles,
                  authors and the full text together. */}
              <search>
                <form
                  role="search"
                  className="tower-search-form"
                  onSubmit={onSearchSubmit}
                >
                  <label className="tower-search-label" htmlFor="tower-search-input">
                    Search the library
                  </label>
                  <div className="tower-search-row">
                    <input
                      id="tower-search-input"
                      ref={searchInputRef}
                      type="search"
                      name="q"
                      className="tower-search tower-search-hero"
                      placeholder="Search titles, creators, tags… — or words inside the texts"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onFocus={() => requestCatalogIndex()}
                      onKeyDown={onSearchKeyDown}
                      onCompositionStart={() => { composingRef.current = true; }}
                      onCompositionEnd={(e) => {
                        composingRef.current = false;
                        setQuery(e.target.value);
                      }}
                      enterKeyHint="search"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck="true"
                      autoFocus={
                        typeof window !== "undefined" &&
                        !!window.matchMedia &&
                        window.matchMedia("(pointer: fine)").matches
                      }
                      aria-label="Search the library catalog and the full text of every work"
                    />
                    {query && (
                      <button
                        type="button"
                        className="tower-search-clear"
                        aria-label="Clear search"
                        onClick={() => {
                          setQuery("");
                          if (searchInputRef.current) searchInputRef.current.focus();
                        }}
                      >
                        ×
                      </button>
                    )}
                    <button type="submit" className="tower-search-submit">
                      Search
                    </button>
                  </div>
                  <p className="tower-search-help">
                    Searches titles, authors and the full text of every work.
                  </p>
                </form>
              </search>
              {!fullIndexReady && isIndexInFlight() && (
                <p className="tower-index-status" aria-live="polite">
                  Loading full catalog…
                </p>
              )}
              {fullIndexReady && towerData && !towerData.haystacks && (
                <p className="tower-index-status" aria-live="polite">
                  Indexing the catalog for search…
                </p>
              )}
            </div>
            {!q && !bucketFilter && !collKey && (
              <TowerDiscovery
                artifacts={artifacts}
                towerData={towerData}
                go={go}
                onBrowse={browseTo}
                onShelfChange={setShelfActive}
              />
            )}
            <div
              className="tower-browse-layout"
              id="tower-results"
              style={shelfActive ? { display: "none" } : undefined}
            >
              {/* Unified filter revamp (2026-10-25, visual only): the desktop
                  "Zoom in" sidebar is retired. Format lanes now render once,
                  as the chip row below, on every platform — same order,
                  same styles, same counts as mobile. No filter logic
                  changed; the sidebar was a second rendering of the
                  same bucketFilter state. */}
              <div className="tower-results-col">
                <div className="tower-toolbar">
                  <label className="tower-sort">
                    <span>Sort</span>
                    <select
                      value={sortId}
                      onChange={(e) => setSortId(e.target.value)}
                      aria-label="Sort entries"
                    >
                      {TOWER_SORTS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="tower-view-toggle" role="group" aria-label="Result view">
                    <button
                      type="button"
                      className={viewMode === "grid" ? " is-active" : ""}
                      aria-pressed={viewMode === "grid"}
                      onClick={() => pickView("grid")}
                    >
                      Grid
                    </button>
                    <button
                      type="button"
                      className={viewMode === "list" ? " is-active" : ""}
                      aria-pressed={viewMode === "list"}
                      onClick={() => pickView("list")}
                    >
                      List
                    </button>
                  </div>
                </div>
            {/* Collections browser (2026-10-24, unified 2026-10-25):
                the deleted hub pages, folded into this section as a
                filter on the same entry list. Group tabs, then — in
                the old subchip style, indented with a ↳ and a group
                label — the collections in the chosen group; a
                collection filters the list below (intersected with
                search + category + sort), it never renders a second
                list. Same markup and order on desktop and mobile.
                On a hub-index fetch failure this block hides and
                category browse carries on — no error panel. */}
            {!collFailed && (
              <div ref={collSectionRef} className="tower-collections">
                <div className="section-index">COLLECTIONS</div>
                <div
                  className="tower-chips"
                  role="group"
                  aria-label="Browse by collection group"
                >
                  <button
                    type="button"
                    className={`tower-chip${collGroup === "" ? " is-active" : ""}`}
                    onClick={() => selectCollGroup("")}
                    aria-pressed={collGroup === ""}
                  >
                    All collections
                  </button>
                  {COLLECTION_GROUPS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className={`tower-chip${collGroup === g.id ? " is-active" : ""}`}
                      onClick={() => selectCollGroup(g.id)}
                      aria-pressed={collGroup === g.id}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                {collLoading && (
                  <p className="tower-index-status" aria-live="polite">
                    Loading collections…
                  </p>
                )}
                {collData && collGroup && (
                  <div
                    className="tower-subchips"
                    role="group"
                    aria-label={`Collections in ${COLLECTION_GROUPS.find((g) => g.id === collGroup)?.label || collGroup}`}
                  >
                    <span className="tower-coll-sub-label" aria-hidden="true">
                      IN {COLLECTION_GROUPS.find((g) => g.id === collGroup)?.label?.toUpperCase() || collGroup}
                    </span>
                    {(collData.groups.find((g) => g.id === collGroup)?.collections || []).map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        className={`tower-subchip${collKey === c.key ? " is-active" : ""}`}
                        onClick={() => selectCollection(c.key)}
                        aria-pressed={collKey === c.key}
                      >
                        {c.label} <span>{c.count.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                )}
                {activeCollection && (
                  <p className="tower-index-status">
                    {activeCollection.blurb}{" "}
                    <span>{activeCollection.count.toLocaleString()} works</span>
                  </p>
                )}
              </div>
            )}
            <div className="section-index">ZOOM IN</div>
            <div className="tower-chips" role="group" aria-label="Filter by format">
              <button
                type="button"
                className={`tower-chip${bucketFilter === "" ? " is-active" : ""}`}
                onClick={() => setBucketFilter("")}
              >
                All entries <span>{artifacts.length}</span>
              </button>
              {towerData.collections.map((c) => {
                const laneActive =
                  bucketFilter === c || bucketFilter.indexOf(c + ":") === 0;
                const isOpenLane = laneActive && c === activeLane && activeSubs.length > 0;
                return (
                  <Fragment key={c}>
                    <button
                      type="button"
                      className={`tower-chip${laneActive ? " is-active" : ""}`}
                      onClick={() =>
                        setBucketFilter(bucketFilter === c ? "" : c)
                      }
                      aria-pressed={laneActive}
                      aria-expanded={isOpenLane}
                    >
                      {TOWER_TOP_LABELS[c] || c} <span>{towerData.counts[c]}</span>
                    </button>
                    {isOpenLane && (
                      <div
                        className="tower-subchips"
                        role="group"
                        aria-label={`Filter ${TOWER_TOP_LABELS[activeLane] || activeLane} by subcategory`}
                      >
                        {activeSubs.map((s) => {
                          const key = `${activeLane}:${s.id}`;
                          const count = towerData.subCounts[key] || 0;
                          if (count === 0) return null;
                          const subActive = bucketFilter === key;
                          return (
                            <button
                              type="button"
                              key={s.id}
                              className={`tower-subchip${subActive ? " is-active" : ""}`}
                              onClick={() =>
                                setBucketFilter(subActive ? activeLane : key)
                              }
                              aria-pressed={subActive}
                            >
                              {s.label} <span>{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
            <LibraryResults
              artifacts={artifacts}
              towerOrder={towerOrder}
              rankMap={rankMap}
              rankedIndices={rankedIndices}
              matchCount={matchCount}
              rowBudget={rowBudget}
              onLoadMore={() => setRowBudget((b) => b + TOWER_ROWS_PER_PAGE)}
              blendedModel={blendedModel}
              searchPage={searchPage}
              searchExtra={searchExtra}
              onSearchPage={(p) => {
                setSearchPage(p);
                setSearchExtra(0);
              }}
              onSearchLoadMore={() => setSearchExtra((x) => x + SEARCH_PAGE_SIZE)}
              onUndoRelax={() => setStrictQuery(listQuery)}
              onUseSuggestion={(s) => setQuery(s)}
              onClearQuery={() => setQuery("")}
              showSkeleton={showSkeleton}
              headingRef={resultsHeadingRef}
              q={q}
              rawQuery={query}
              go={go}
              viewMode={viewMode}
              searching={!!q && q.trim().length >= 2}
            />
              </div>
            </div>
          </>
        )}
      </section>
      <FaqBlock index="QUESTIONS" faqs={towerOfBabel.library.faqs} />
    </>
  );
}

// ----- Tower of Babel / suggest an entry ------------------------------------
// Suggestion intake form. Submissions POST to the /api/suggest Pages
// Function, which forwards them to the lab inbox via Resend.
// Payload shape: { type, title, format, seriesDetails, creator, year,
// source, notes, website } (all strings; website is the honeypot).
async function submitSuggestion(payload) {
  const res = await fetch("/api/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || "send failed");
  return data;
}

export function SuggestEntry({ go }) {
  const s = towerOfBabel.suggest;
  const fields = s.fields;
  const initialValues = fields.reduce((acc, f) => {
    acc[f.name] = "";
    return acc;
  }, {});
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  // W10 fix (2026-10-01): prevent double-submit. Without this, rapid
  // double-clicks fire duplicate POST /api/suggest requests.
  const [sending, setSending] = useState(false);
  // Honeypot: invisible to humans, bots fill it. The API drops those silently.
  const [honeypot, setHoneypot] = useState("");
  const validate = (next) => {
    const errs = {};
    fields.forEach((f) => {
      const v = (next[f.name] || "").trim();
      if (f.required && v.length === 0) {
        errs[f.name] = "Required.";
      }
    });
    return errs;
  };
  const onChange = (name) => (e) => {
    const next = { ...values, [name]: e.target.value };
    setValues(next);
    if (errors[name]) {
      const errs = { ...errors };
      delete errs[name];
      setErrors(errs);
    }
    if (submitError) setSubmitError("");
  };
  const onSubmit = async (e) => {
    e.preventDefault();
    // W10: ignore if already sending (double-click protection)
    if (sending) return;
    const errs = validate(values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const firstInvalid = fields.find((f) => errs[f.name]);
      if (firstInvalid && typeof document !== "undefined") {
        const el = document.getElementById(firstInvalid.id);
        if (el && typeof el.focus === "function") {
          el.focus();
        }
      }
      return;
    }
    setSending(true);
    track("suggestion_submitted", {});
    try {
      await submitSuggestion({ ...values, website: honeypot });
    } catch (err) {
      setSubmitError(s.submitError);
      setSending(false);
      return;
    }
    setSending(false);
    setSubmitted(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        const region = document.getElementById("suggest-success");
        if (region && typeof region.focus === "function") {
          region.focus();
        }
      }, 50);
    }
  };
  const onReset = () => {
    setValues(initialValues);
    setErrors({});
    setSubmitError("");
    setSubmitted(false);
    setHoneypot("");
  };
  return (
    <main className="page-shell inner-page tower-light" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">{s.sectionIndex}</div>
        <h1>{s.heading}</h1>
        <p className="display-copy">{s.intro}</p>
      </section>
      <section className="section suggest-section">
        <div className="suggest-wrap">
          {!submitted ? (
            <form
              className="suggest-form"
              onSubmit={onSubmit}
              noValidate={false}
              aria-label="Suggest a library entry"
            >
              {fields.map((f) => {
                const fieldError = errors[f.name];
                const errorId = `${f.id}-error`;
                return (
                  <div className="suggest-field" key={f.id}>
                    <label htmlFor={f.id}>
                      {f.label}
                      {f.required && <span className="req" aria-hidden="true"> *</span>}
                    </label>
                    {f.type === "select" ? (
                      <select
                        id={f.id}
                        name={f.name}
                        required={f.required}
                        value={values[f.name]}
                        onChange={onChange(f.name)}
                        aria-required={f.required || undefined}
                        aria-invalid={fieldError ? "true" : undefined}
                        aria-describedby={fieldError ? errorId : undefined}
                      >
                        <option value="" disabled>{f.selectPlaceholder || "Select"}</option>
                        {f.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea
                        id={f.id}
                        name={f.name}
                        required={f.required}
                        rows={f.rows || 4}
                        value={values[f.name]}
                        onChange={onChange(f.name)}
                        placeholder={f.placeholder}
                        aria-required={f.required || undefined}
                        aria-invalid={fieldError ? "true" : undefined}
                        aria-describedby={fieldError ? errorId : undefined}
                      />
                    ) : (
                      <input
                        id={f.id}
                        name={f.name}
                        type={f.type}
                        required={f.required}
                        value={values[f.name]}
                        onChange={onChange(f.name)}
                        autoComplete={f.autoComplete}
                        placeholder={f.placeholder}
                        aria-required={f.required || undefined}
                        aria-invalid={fieldError ? "true" : undefined}
                        aria-describedby={fieldError ? errorId : undefined}
                      />
                    )}
                    {fieldError && (
                      <p className="suggest-error" id={errorId} role="alert">
                        {fieldError}
                      </p>
                    )}
                  </div>
                );
              })}
              {submitError && (
                <p className="suggest-error" role="alert">
                  {submitError}
                </p>
              )}
              {/* Honeypot: positioned off-screen, never visible to humans. */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "auto", width: "1px", height: "1px", overflow: "hidden" }}>
                <label htmlFor="suggest-website">Website</label>
                <input
                  id="suggest-website"
                  name="website"
                  type="text"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>
              <div className="suggest-actions">
                <button
                  type="submit"
                  className="tower-access-btn suggest-submit"
                  disabled={sending}
                >
                  {sending ? "SENDING…" : s.submitLabel}{" "}
                  <span aria-hidden="true">↗</span>
                </button>
              </div>
            </form>
          ) : (
            <div
              className="suggest-success"
              id="suggest-success"
              tabIndex={-1}
              aria-live="polite"
            >
              <div className="section-index">RECEIVED</div>
              <h2>{s.success.heading}</h2>
              <p className="body-copy">{s.success.body}</p>
              <div className="suggest-success-actions">
                <button
                  type="button"
                  className="tower-access-btn suggest-submit"
                  onClick={onReset}
                >
                  {s.suggestAnother}
                </button>
                <button
                  type="button"
                  className="suggest-ghost-btn"
                  onClick={() => go("/tower-of-babel/library")}
                >
                  {s.backToLibrary}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

// ----- Tower API access -------------------------------------------
// The API acquisition experience — live status, plans +
// subscribe, and the free-key form. Since 2026-10-27 this block
// IS the /tower-of-babel/library/research page (the Commissions
// Desk that used to share the page was removed on Joshua's
// order). The long-form documentation stays on
// /tower-of-babel/api; that page is NOT changed by this block.
// Gating: the free-key form renders ONLY when /api/status
// reports keys_configured; subscribe buttons render ONLY when
// it reports subscriptions_open.
export function TowerApiAccess({ go }) {
  const api = towerOfBabel.apiPage;
  // Live gate for paid plans: subscribe buttons render ONLY when the
  // status endpoint says subscriptions are open (API_LIVE=1 server-side).
  // Until then the block shows the not-open-yet notice — no dead buttons,
  // and no checkout a key could not be delivered for.
  const [apiStatus, setApiStatus] = useState(null);
  useEffect(() => {
    let live = true;
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => {
        if (live) setApiStatus(d && typeof d === "object" ? d : {});
      })
      .catch(() => {
        if (live) setApiStatus({});
      });
    return () => {
      live = false;
    };
  }, []);
  const subscriptionsOpen = !!(apiStatus && apiStatus.subscriptions_open);
  // The free-key form renders ONLY when the status endpoint confirms
  // the key system is configured — until then the block shows the
  // switched-on-soon notice instead of a form that can only 503.
  const keysConfigured = !!(apiStatus && apiStatus.keys_configured);
  const webhookConfigured = !!(apiStatus && apiStatus.webhook_configured);

  const [billing, setBilling] = useState("monthly");
  const [planSel, setPlanSel] = useState("pro");
  const [subscribing, setSubscribing] = useState("");
  const [subError, setSubError] = useState("");
  const subscribe = async (plan) => {
    if (subscribing) return;
    setSubscribing(plan);
    setSubError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, billing }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setSubError(api.subscribePending);
        setSubscribing("");
        return;
      }
      if (!res.ok || !data.url) throw new Error("checkout failed");
      window.location.href = data.url;
    } catch {
      setSubError("Checkout could not be started — please try again.");
      setSubscribing("");
    }
  };

  // Free key mint: POST /api/keys. The key itself is delivered by email
  // only and never appears in the response or on this page. A 503 means
  // the key system is not switched on yet — show the graceful notice.
  const [keyEmail, setKeyEmail] = useState("");
  const [keyHoneypot, setKeyHoneypot] = useState("");
  const [keySending, setKeySending] = useState(false);
  const [keyState, setKeyState] = useState("idle"); // idle | sent | pending | error
  const onKeySubmit = async (e) => {
    e.preventDefault();
    if (keySending) return;
    setKeySending(true);
    setKeyState("idle");
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: keyEmail, website: keyHoneypot }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setKeyState("pending");
      } else if (res.ok && data.ok) {
        setKeyState("sent");
      } else {
        setKeyState("error");
      }
    } catch {
      setKeyState("error");
    }
    setKeySending(false);
  };

  const paidTiers = api.tiers.filter((t) => t.priceMonthly);
  const selTier = paidTiers.find((t) => t.id === planSel) || paidTiers[0];
  return (
    <section className="section desk-section desk-api" aria-label="Tower API access">
      <div className="suggest-wrap">
        <div className="section-index">TOWER API — PROGRAMMATIC ACCESS</div>
        <p className="body-copy desk-copy">
          Prefer a machine to do the fetching? API v1 gives programs
          server-side search, full-text delivery, and bulk snapshots of
          this same library — a free key by email, paid tiers above it.
          The texts themselves stay free to read here either way; a key
          buys the maintained pipe, the throughput, and someone standing
          behind it.
        </p>
        <ul className="desk-api-status" aria-label="Live API status">
          {apiStatus === null ? (
            <li>Live status — checking…</li>
          ) : (
            <>
              <li>Keys — {keysConfigured ? "available" : "not yet open"}</li>
              <li>
                Subscriptions — {subscriptionsOpen ? "open" : "not yet open"}
              </li>
              <li>
                Webhook — {webhookConfigured ? "configured" : "not configured"}
              </li>
            </>
          )}
        </ul>
        <div className="section-index desk-block-title">API PLANS</div>
        <div className="capability-list desk-api-tiers">
          {api.tiers.map((t, i) => (
            <div className="cap-row" key={t.id}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <h3>{t.name}</h3>
              <p>
                {(t.price ||
                  (billing === "annual" ? t.priceAnnual : t.priceMonthly)) +
                  " · " +
                  t.limit +
                  ". " +
                  t.blurb}
              </p>
            </div>
          ))}
        </div>
        {subscriptionsOpen ? (
          <>
            <div className="api-toggle" role="group" aria-label="Billing period">
              <button
                type="button"
                className={billing === "monthly" ? "is-on" : ""}
                aria-pressed={billing === "monthly"}
                onClick={() => setBilling("monthly")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={billing === "annual" ? "is-on" : ""}
                aria-pressed={billing === "annual"}
                onClick={() => setBilling("annual")}
              >
                Annual — two months free
              </button>
            </div>
            <div className="api-plans" role="group" aria-label="Choose a plan">
              {paidTiers.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={planSel === t.id ? "is-on" : ""}
                  aria-pressed={planSel === t.id}
                  onClick={() => setPlanSel(t.id)}
                >
                  <span className="api-plan-name">{t.name}</span>
                  <span className="api-plan-price">
                    {billing === "annual" ? t.priceAnnual : t.priceMonthly}
                  </span>
                  <span className="api-plan-limit">{t.limit}</span>
                </button>
              ))}
            </div>
            <div className="desk-sample-actions">
              <button
                type="button"
                className="tower-access-btn api-cta"
                disabled={!!subscribing}
                onClick={() => subscribe(planSel)}
              >
                {subscribing
                  ? "OPENING CHECKOUT…"
                  : `SUBSCRIBE — ${selTier.name.toUpperCase()} ${
                      billing === "annual"
                        ? selTier.priceAnnual
                        : selTier.priceMonthly
                    }`}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
            {subError && (
              <p className="suggest-error" role="alert">
                {subError}
              </p>
            )}
          </>
        ) : (
          <p className="body-copy desk-copy">{api.subscribePending}</p>
        )}
        <div className="desk-sample-actions">
          {PORTAL_URL ? (
            <a className="api-quiet" href={PORTAL_URL}>
              MANAGE BILLING <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <p className="body-copy">{api.billingNote}</p>
          )}
        </div>
        <p className="body-copy desk-copy">{api.refundNote}</p>
        <div className="section-index desk-block-title">{api.keyForm.heading}</div>
        <p className="body-copy desk-copy">{api.keyForm.body}</p>
        {!keysConfigured ? (
          <p className="body-copy" role="status">
            {api.keyForm.pending}
          </p>
        ) : keyState === "sent" ? (
          <p className="body-copy" role="status">
            {api.keyForm.sent}
          </p>
        ) : (
          <form
            className="suggest-form"
            onSubmit={onKeySubmit}
            aria-label="Get a free API key"
          >
            <div className="suggest-field">
              <label htmlFor="api-key-email">
                Email{" "}
                <span className="req" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id="api-key-email"
                name="email"
                type="email"
                required
                value={keyEmail}
                onChange={(e) => setKeyEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.org"
              />
            </div>
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-9999px",
                top: "auto",
                width: "1px",
                height: "1px",
                overflow: "hidden",
              }}
            >
              <label htmlFor="api-key-website">Website</label>
              <input
                id="api-key-website"
                name="website"
                type="text"
                value={keyHoneypot}
                onChange={(e) => setKeyHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>
            {keyState === "pending" && (
              <p className="body-copy" role="status">
                {api.keyForm.pending}
              </p>
            )}
            {keyState === "error" && (
              <p className="suggest-error" role="alert">
                Something went wrong sending your key — please try again.
              </p>
            )}
            <div className="suggest-actions">
              <button
                type="submit"
                className="tower-access-btn api-cta suggest-submit"
                disabled={keySending}
              >
                {keySending ? "SENDING…" : api.keyForm.button}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          </form>
        )}
        <div className="desk-sample-actions">
          <button
            type="button"
            className="api-quiet"
            onClick={() => go("/tower-of-babel/api")}
          >
            READ THE FULL API DOCUMENTATION{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
        <p className="desk-note">
          Endpoints, request limits, versioning, licensing, and the keyless
          catalog surface — everything a person or an agent needs to use
          the API is documented on the API page.
        </p>
      </div>
    </section>
  );
}

// ----- Tower of Babel / API access page ------------------------------
// /tower-of-babel/library/research — the API block as a full page.
// (The tower-desk class stays on <main>: the stylesheet scopes the
// API block's rules under it — renaming the scope is a separate,
// purely cosmetic change.)
export function TowerApiAccessPage({ go }) {
  return (
    <main className="page-shell inner-page tower-light tower-desk" id="main-content" tabIndex={-1}>
      <TowerApiAccess go={go} />
    </main>
  );
}

// ----- Tower of Babel / donate ----------------------------------------------
// Patron page modeled on the Internet Archive / Open Library donate page:
// letter left, three-step panel right. Donors pick the real payment method
// inside Stripe Checkout; the tiles here are just a preview. Amounts and
// the letter live in towerOfBabel.support so copy stays data-driven.
const DONATE_FEE_RATE = 0.029;
const DONATE_FEE_FIXED_CENTS = 30;
const donateGrossUp = (cents) =>
  Math.ceil((cents + DONATE_FEE_FIXED_CENTS) / (1 - DONATE_FEE_RATE));
const donateFmt = (cents) => `$${(cents / 100).toFixed(2)}`;

// Payment-brand marks for the donate panel, drawn as small inline SVGs so
// the method tiles read like a real checkout screen (white badges, brand
// colors) instead of plain text bubbles. These are nominative marks: they
// name the methods Stripe's checkout page offers when enabled.
function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="#000">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.702" />
    </svg>
  );
}
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29H1.29a12 12 0 0 0 0 8.58l3.98-3z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}
function MastercardMark() {
  return (
    <svg viewBox="0 0 36 22" width="30" height="18" aria-hidden="true">
      <circle cx="13" cy="11" r="10" fill="#EB001B" />
      <circle cx="23" cy="11" r="10" fill="#F79E1B" fillOpacity="0.85" />
    </svg>
  );
}
function AmexMark() {
  return (
    <svg viewBox="0 0 34 20" width="30" height="18" aria-hidden="true">
      <rect width="34" height="20" rx="3" fill="#2E77BC" />
      <text x="17" y="14" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">AMEX</text>
    </svg>
  );
}
function DiscoverMark() {
  return (
    <svg viewBox="0 0 52 20" width="44" height="17" aria-hidden="true">
      <circle cx="10" cy="10" r="8" fill="#F48120" />
      <text x="21" y="14" fontSize="8.5" fontWeight="800" fill="#20242b" fontFamily="Arial, sans-serif">DISCOVER</text>
    </svg>
  );
}
function JcbMark() {
  return (
    <svg viewBox="0 0 30 20" width="27" height="18" aria-hidden="true">
      <rect width="30" height="20" rx="3" fill="#0B4EA2" />
      <rect x="10" width="10" height="20" fill="#CC122E" />
      <rect x="20" width="10" height="20" fill="#0E8A3E" />
      <text x="15" y="14.5" textAnchor="middle" fontSize="8" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">JCB</text>
    </svg>
  );
}
function BtcIcon({ size = 34 }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="#F7931A" />
      <text x="20" y="28.5" textAnchor="middle" fontSize="22" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">₿</text>
    </svg>
  );
}
function EthIcon({ size = 34 }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <polygon points="20,3 31,20 20,25 9,20" fill="#627EEA" />
      <polygon points="20,37 31,22 20,27 9,22" fill="#3C5ACD" />
    </svg>
  );
}
function CoinIcon({ symbol, size }) {
  if (symbol === "BTC") return <BtcIcon size={size} />;
  if (symbol === "ETH") return <EthIcon size={size} />;
  return null;
}

export function DonatePage({ onReady }) {
  // Report ready on mount so the Tower boot loader (same ceremony as the
  // library pages) dismisses on its normal beat instead of the failsafe.
  useEffect(() => {
    if (onReady) onReady();
  }, [onReady]);
  const support = towerOfBabel.support || {};
  const letter = support.letter || {};
  const amounts = support.amounts || [5, 10, 25, 50, 100, 500, 1000];
  const crypto = support.crypto || [];
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const [frequency, setFrequency] = useState("monthly");
  const [preset, setPreset] = useState(5);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [coverFees, setCoverFees] = useState(false);
  // Step 3 removed 2026-10-25: Stripe Checkout collects the donor's email
  // (and cardholder/wallet name) on its own hosted page, and sends the
  // receipt from there when the Dashboard receipt toggle is on — asking
  // for name + email on this page first was a redundant step.
  // The chosen method below is a real selection, not decoration: it is
  // posted to /api/donate and recorded on the session (metadata
  // preferred_method). PayPal was removed 2026-10-24 — it is not
  // offered for this Stripe account — so the tiles are card-family
  // only: card, Apple Pay, Google Pay.
  const [method, setMethod] = useState("card");
  const [busy, setBusy] = useState(false);
  const [notLive, setNotLive] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const monthly = frequency === "monthly";
  const parsedCustom = Math.round(parseFloat(customValue || "0") * 100);
  const baseCents = customMode
    ? Number.isFinite(parsedCustom) && parsedCustom > 0
      ? parsedCustom
      : 0
    : preset * 100;
  const totalCents = coverFees && baseCents > 0 ? donateGrossUp(baseCents) : baseCents;
  const feeCents = totalCents - baseCents;

  async function submit() {
    if (busy || baseCents < 100) {
      if (baseCents < 100) setError("Enter an amount of $1 or more.");
      return;
    }
    setBusy(true);
    setError("");
    setNotLive(false);
    try {
      const res = await fetch("/api/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frequency,
          amount_cents: baseCents,
          cover_fees: coverFees,
          payment_method: method,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 503) {
        setNotLive(true);
      } else if (data && data.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError("Checkout could not be started. Please try again.");
      }
    } catch {
      setError("Checkout could not be started. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function copyAddress(address, symbol) {
    const done = () => setCopied(symbol);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(address).then(done).catch(done);
    } else {
      done();
    }
  }

  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
      <section className="donate-section">
        {support.eyebrow ? (
          <p className="donate-eyebrow">{support.eyebrow}</p>
        ) : null}
        {params.get("thanks") === "1" ? (
          <div className="donate-thanks" role="status">
            Thank you — your support keeps the Tower free for everyone.
          </div>
        ) : null}
        {params.get("canceled") === "1" ? (
          <div className="donate-canceled" role="status">
            Your donation was canceled — nothing was charged. You can try
            again whenever you like.
          </div>
        ) : null}
        <div className="donate-layout reveal">
          <div className="donate-letter">
            {letter.title ? (
              <h2 className="donate-letter-title">{letter.title}</h2>
            ) : null}
            {letter.greeting ? <p>{letter.greeting}</p> : null}
            {(letter.paragraphs || []).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {letter.signoff ? <p>{letter.signoff}</p> : null}
            {letter.signature ? (
              <p className="donate-sign">
                <strong>{letter.signature.name}</strong>
                <br />
                <em>{letter.signature.role}</em>
              </p>
            ) : null}
            {letter.fineprint ? (
              <p className="donate-fineprint">{letter.fineprint}</p>
            ) : null}
          </div>
          <aside className="donate-panel">
            <div className="donate-step">
              <span className="donate-step-n">1</span>
              <h3>Choose a frequency</h3>
              <div className="donate-toggle">
                <button
                  type="button"
                  className={frequency === "once" ? "is-on" : ""}
                  aria-pressed={frequency === "once"}
                  onClick={() => setFrequency("once")}
                >
                  One time
                </button>
                <button
                  type="button"
                  className={frequency === "monthly" ? "is-on" : ""}
                  aria-pressed={frequency === "monthly"}
                  onClick={() => setFrequency("monthly")}
                >
                  Monthly
                </button>
              </div>
            </div>
            <div className="donate-step">
              <span className="donate-step-n">2</span>
              <h3>Choose an amount (USD)</h3>
              <div className="donate-amounts">
                {amounts.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={!customMode && preset === a ? "is-on" : ""}
                    aria-pressed={!customMode && preset === a}
                    onClick={() => {
                      setCustomMode(false);
                      setPreset(a);
                    }}
                  >
                    ${a.toLocaleString()}
                  </button>
                ))}
                <div className="donate-custom">
                  <span>Custom: $</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    inputMode="decimal"
                    value={customValue}
                    placeholder="Other"
                    aria-label="Custom amount in dollars"
                    onFocus={() => setCustomMode(true)}
                    onChange={(e) => {
                      setCustomMode(true);
                      setCustomValue(e.target.value);
                    }}
                  />
                </div>
              </div>
              <label className="donate-cover">
                <input
                  type="checkbox"
                  checked={coverFees}
                  onChange={(e) => setCoverFees(e.target.checked)}
                />
                {baseCents > 0 && feeCents > 0
                  ? ` I'll generously add ${donateFmt(feeCents)} to cover fees.`
                  : " I'll generously add a little extra to cover fees."}
              </label>
            </div>
            <p className="donate-total">
              Total: {donateFmt(totalCents)}
              {monthly ? " / month" : ""}
            </p>
            <div className="donate-step">
              <span className="donate-step-n">3</span>
              <h3>Choose a payment method</h3>
              <div className="donate-methods">
                <div className="donate-pay-row">
                  <button
                    type="button"
                    className={`donate-pay-tile${method === "apple_pay" ? " is-on" : ""}`}
                    aria-label="Apple Pay"
                    aria-pressed={method === "apple_pay"}
                    onClick={() => setMethod("apple_pay")}
                  >
                    <AppleMark />
                    <span className="donate-pay-word">Pay</span>
                  </button>
                  <button
                    type="button"
                    className={`donate-pay-tile${method === "google_pay" ? " is-on" : ""}`}
                    aria-label="Google Pay"
                    aria-pressed={method === "google_pay"}
                    onClick={() => setMethod("google_pay")}
                  >
                    <GoogleMark />
                    <span className="donate-pay-word donate-pay-word-g">Pay</span>
                  </button>
                </div>
                <button
                  type="button"
                  className={`donate-card-tile${method === "card" ? " is-on" : ""}`}
                  aria-label="Credit Card"
                  aria-pressed={method === "card"}
                  onClick={() => setMethod("card")}
                >
                  <span className="donate-card-label">Credit Card</span>
                  <span className="donate-card-marks" aria-label="Visa, Mastercard, American Express, Discover, JCB, UnionPay">
                    <span className="donate-visa">VISA</span>
                    <MastercardMark />
                    <AmexMark />
                    <DiscoverMark />
                    <JcbMark />
                    <span className="donate-unionpay">UnionPay</span>
                  </span>
                </button>
              </div>
              <p className="donate-methods-note">
                {method === "apple_pay" || method === "google_pay"
                  ? "Your gift opens on Stripe's secure checkout page, where the wallet button appears on a supported device — we never see or store your card number."
                  : "You complete payment on Stripe's secure checkout page — we never see or store your card number."}
              </p>
            </div>
            <button
              type="button"
              className="donate-go"
              disabled={busy || baseCents < 100}
              onClick={submit}
            >
              {busy ? "Working…" : "DONATE"}
            </button>
            <p className="donate-methods-note">
              Stripe collects your email at checkout and sends your receipt from there.
            </p>
            <p className="donate-go-lock">
              <svg
                className="donate-lock"
                viewBox="0 0 24 24"
                width="13"
                height="13"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="4" y="10" width="16" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              Your payment will be securely processed
              <br />
              Secure checkout by Stripe
            </p>
            {notLive ? (
              <p className="donate-notlive" role="status">
                Donations are being switched on — card payments will be
                available here shortly. Thank you for your patience.
              </p>
            ) : null}
            {error ? (
              <p className="donate-error" role="status">
                {error}
              </p>
            ) : null}
            {crypto.length > 0 ? (
              <div className="donate-other">
                <div className="donate-or">OR</div>
                <div className="donate-crypto-box">
              <h3 className="donate-other-title">Donate cryptocurrency</h3>
              <div className="donate-crypto-icons" aria-hidden="true">
                {crypto.map((c) => (
                  <CoinIcon key={c.symbol} symbol={c.symbol} size={34} />
                ))}
              </div>
              <p className="donate-crypto-intro">
                Prefer crypto? Send to one of these wallets — every
                contribution goes to the same servers, storage, and
                preservation work.
              </p>
              {crypto.map((c) => (
                <div className="donate-crypto-row" key={c.symbol}>
                  <div className="donate-crypto-head">
                    <span className="donate-crypto-name">
                      <CoinIcon symbol={c.symbol} size={20} />
                      {c.symbol} — {c.name}
                    </span>
                    <button
                      type="button"
                      className="donate-copy-btn"
                      onClick={() => copyAddress(c.address, c.symbol)}
                    >
                      {copied === c.symbol ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="donate-crypto-addr">{c.address}</div>
                </div>
              ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </main>
  );
}

// ----- Tower of Babel / library results -------------------------------------
// Browse mode renders the catalog in the chosen sort order, as before.
// Search mode (Workstream D) renders ONE interleaved, relevance-ranked
// list from the blended model: catalog-field matches and full-text
// matches merged by a single BM25F score, deduped by work, each row
// badged with WHY it matched and — for text matches — 1–2 highlighted
// snippets that deep-link to the passage in the reader. There is no
// separate "Mentions in texts" section any more.

// Wrap query-token matches in <mark> inside a display string. Matching is
// done on the normText fold of each word, so "café" highlights for "cafe".
function highlightText(text, tokens) {
  if (!text || !tokens || tokens.length === 0) return text;
  const set = new Set(tokens);
  const parts = text.split(/([A-Za-z0-9À-ÖØ-öø-ÿ'’-]+)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1 && set.has(normText(part))) {
      return <mark key={i}>{part}</mark>;
    }
    return part;
  });
}

// Passage snippets for one text-matched work. Loads the real text lazily
// (auto for the first rows, on demand for the rest) and shows at most 2
// passages, each ≤200 chars, each linking into the reader at the exact
// passage (?at=<offset>&hl=<start>-<end> — the reader's share-link scheme).
function SnippetBlock({ item, go, auto }) {
  const [snips, setSnips] = useState(null);
  const [wanted, setWanted] = useState(auto);
  useEffect(() => {
    if (auto) setWanted(true);
  }, [auto]);
  useEffect(() => {
    if (!wanted || snips || !item.doc || !item.parsedQuery) return;
    let live = true;
    getSnippets(item.doc, item.parsedQuery, { initial: 2 }).then((r) => {
      if (live) setSnips(r);
    });
    return () => {
      live = false;
    };
  }, [wanted, snips, item]);
  if (!item.text) return null;
  if (!wanted) {
    return (
      <button
        type="button"
        className="text-link tower-snippets-more"
        onClick={() => setWanted(true)}
      >
        Show passages
      </button>
    );
  }
  if (!snips) {
    return <p className="tower-snippets-status">Finding passages…</p>;
  }
  if (!snips.snippets.length) return null;
  const shown = snips.snippets.slice(0, 2);
  return (
    <div className="tower-snippets tower-snippets-inline">
      {shown.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="tower-snippet-sep" aria-hidden="true">…</span>}
          <button
            type="button"
            className="tower-snippet"
            onClick={() =>
              go(
                `/tower-of-babel/library/${item.key}?at=${s.markStart}&hl=${s.markStart}-${s.markEnd}`
              )
            }
            dangerouslySetInnerHTML={{ __html: s.html }}
            aria-label={`Read this passage in ${item.artifact.title}`}
          />
        </Fragment>
      ))}
    </div>
  );
}

// One row of the unified search list.
const UnifiedRow = memo(function UnifiedRow({ item, rank, go, tokens, autoSnippets }) {
  const a = item.artifact;
  const entryPath = `/tower-of-babel/library/${item.key}`;
  const badges = [];
  if (item.meta.title) badges.push("Title match");
  else if (item.meta.creator) badges.push("Author match");
  else if (item.meta.subject) badges.push("Subject match");
  else if (item.meta.description) badges.push("Description match");
  if (item.text) badges.push("Matched in the text");
  if (badges.length === 0) badges.push("Matched in the text");
  return (
    <div className="tower-row tower-unified-row">
      <span className="tower-row-index">{String(rank).padStart(2, "0")}</span>
      <span className="tower-row-cover" aria-hidden="true">
        <TowerCover a={a} />
      </span>
      <span className="tower-row-main">
        <button
          type="button"
          className="tower-row-title-btn"
          onClick={() => go(entryPath)}
        >
          <span className="tower-row-title">{highlightText(a.title, tokens)}</span>
        </button>
        {(a.creator || a.year) && (
          <span className="tower-row-creator">
            {highlightText(a.creator || "", tokens)}
            {a.creator && a.year ? " · " : ""}
            {a.year || ""}
          </span>
        )}
        <span className="tower-match-badges">
          {badges.map((b) => (
            <span key={b} className="tower-tag tower-tag-badge">{b}</span>
          ))}
          {item.text && (
            <span className="tower-tag tower-tag-hits">
              {item.text.hits} {item.text.hits === 1 ? "mention" : "mentions"}
            </span>
          )}
        </span>
        {item.text ? (
          <SnippetBlock item={item} go={go} auto={autoSnippets} />
        ) : a.description ? (
          <span className="tower-row-desc">{a.description}</span>
        ) : null}
      </span>
      <span className="tower-row-tags">
        <span className="tower-tag">{a.collection}</span>
        {a.format && <span className="tower-tag">{a.format}</span>}
      </span>
      <button
        type="button"
        className="tower-row-arrow-btn"
        onClick={() => go(entryPath)}
        aria-label={`Open ${a.title}`}
      >
        <span className="tower-row-arrow" aria-hidden="true">↗</span>
      </button>
    </div>
  );
});

const LibraryResults = memo(function LibraryResults({
  artifacts,
  towerOrder,
  rankMap,
  rankedIndices,
  matchCount,
  rowBudget,
  onLoadMore,
  blendedModel,
  searchPage,
  searchExtra,
  onSearchPage,
  onSearchLoadMore,
  onUndoRelax,
  onUseSuggestion,
  onClearQuery,
  showSkeleton,
  headingRef,
  q,
  rawQuery,
  go,
  viewMode,
  searching,
}) {
  // Browse-mode visible slice. Computed unconditionally (hooks order must
  // never depend on the mode) and only used by the browse branch below.
  const visibleIndices = useMemo(() => {
    if (rankedIndices) return rankedIndices.slice(0, rowBudget);
    const out = [];
    for (let k = 0; k < towerOrder.length && out.length < rowBudget; k++) {
      const i = towerOrder[k];
      if (rankMap.has(artifacts[i].artifact_id)) out.push(i);
    }
    return out;
  }, [artifacts, towerOrder, rankMap, rankedIndices, rowBudget]);
  // ------------------------- Search mode --------------------------------
  if (searching && blendedModel) {
    const model = blendedModel;
    const items = model.items;
    const pageCount = Math.max(1, Math.min(10, Math.ceil(items.length / SEARCH_PAGE_SIZE)));
    const visibleCount =
      searchPage >= 10
        ? 10 * SEARCH_PAGE_SIZE + searchExtra
        : searchPage * SEARCH_PAGE_SIZE;
    // Cursor for Load more (SPEC-4): the last visible result's
    // (score, work-id) — the array order is exactly that cursor order.
    const visible = items.slice(0, visibleCount);
    const pending = model.pending;
    return (
      <section aria-labelledby="tower-results-heading">
        <h2
          id="tower-results-heading"
          className="tower-results-heading"
          tabIndex={-1}
          ref={headingRef}
        >
          Results
        </h2>
        <div
          className={pending ? "tower-results-pending" : undefined}
          aria-busy={pending || undefined}
        >
          <p className="tower-result-count" role="status" aria-live="polite">
            {pending && items.length === 0
              ? `Searching for “${rawQuery}”…`
              : items.length > 0
                ? `About ${formatAboutCount(model.total)} ${model.total === 1 ? "work" : "works"} for “${rawQuery}”`
                : ""}
          </p>
          {model.deepState === "unavailable" && (
            <p className="tower-mentions-status">
              Full-text search is unavailable right now — the search index
              is being rebuilt. Title and author results still work.
            </p>
          )}
          {model.appliedCorrection && (
            <p className="tower-relax-banner">
              Showing results for “{model.appliedCorrection}” — spelling
              corrected.{" "}
              <button type="button" className="text-link" onClick={onUndoRelax}>
                Search “{rawQuery}” exactly instead
              </button>
            </p>
          )}
          {model.stage && model.stage.kind === "stopwords" && (
            <p className="tower-relax-banner">
              Some very common words were ignored (
              {model.droppedTerms.join(", ")}).{" "}
              <button type="button" className="text-link" onClick={onUndoRelax}>
                Search with all words instead
              </button>
            </p>
          )}
          {model.stage && model.stage.kind === "optional" && (
            <p className="tower-relax-banner">
              No works match all of “{rawQuery}” — showing works matching
              most of your words.{" "}
              <button type="button" className="text-link" onClick={onUndoRelax}>
                Search for all words only
              </button>
            </p>
          )}
          {!model.appliedCorrection && model.suggestion && items.length > 0 && (
            <p className="tower-relax-banner">
              Did you mean{" "}
              <button
                type="button"
                className="text-link"
                onClick={() => onUseSuggestion(model.suggestion)}
              >
                {model.suggestion}
              </button>
              ?
            </p>
          )}
          {showSkeleton && pending && items.length === 0 && (
            <div className="tower-rows" aria-hidden="true">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="tower-skel-row" />
              ))}
            </div>
          )}
          {items.length > 0 && (
            <div className="tower-rows">
              {visible.map((item, k) => (
                <UnifiedRow
                  key={item.key}
                  item={item}
                  rank={k + 1}
                  go={go}
                  tokens={model.tokens}
                  autoSnippets={k < 10}
                />
              ))}
            </div>
          )}
          {items.length === 0 && !pending && (
            <div className="tower-zero">
              <p className="tower-empty-results">
                No works found for “{rawQuery}”.
              </p>
              {model.suggestion && (
                <p>
                  Did you mean{" "}
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => onUseSuggestion(model.suggestion)}
                  >
                    {model.suggestion}
                  </button>
                  ?
                </p>
              )}
              <p>
                Check the spelling, try fewer or more general words, or
                remove quotation marks to search for the words separately.
              </p>
              <p>
                <button type="button" className="text-link" onClick={onClearQuery}>
                  Clear the search and browse the whole library
                </button>
              </p>
            </div>
          )}
          {items.length > SEARCH_PAGE_SIZE && (
            <nav className="tower-pager" aria-label="Search result pages">
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={p === searchPage && searchExtra === 0 ? "is-active" : ""}
                  aria-current={p === searchPage && searchExtra === 0 ? "page" : undefined}
                  onClick={() => onSearchPage(p)}
                >
                  {p}
                </button>
              ))}
              {(pageCount >= 10 || visibleCount < items.length) &&
                visibleCount < items.length && (
                  <button
                    type="button"
                    className="tower-pager-more"
                    onClick={() => {
                      if (searchPage < 10) onSearchPage(10);
                      onSearchLoadMore();
                    }}
                  >
                    Load more — showing {Math.min(visibleCount, items.length)} of{" "}
                    {formatAboutCount(model.total)}
                  </button>
                )}
            </nav>
          )}
        </div>
      </section>
    );
  }
  // ------------------------- Browse mode --------------------------------
  return (
    <>
      <p className="tower-result-count" aria-live="polite">
        {matchCount} of {artifacts.length}{" "}
        {artifacts.length === 1 ? "entry" : "entries"}
        {q ? ` matching “${q}”` : ""}
      </p>
      {matchCount === 0 && (
        <p className="tower-empty-results">
          No entries match. Clear the search or choose a different collection.
        </p>
      )}
      {viewMode === "grid" ? (
        <div className="tower-grid">
          {visibleIndices.map((i) => {
            const a = artifacts[i];
            return (
              <TowerBookCard
                key={a.artifact_id}
                a={a}
                go={go}
                wide={a.collection === "PODCASTS"}
              />
            );
          })}
        </div>
      ) : (
        <div className="tower-rows">
          {visibleIndices.map((i) => {
            const a = artifacts[i];
            return (
              <TowerRow
                key={a.artifact_id}
                a={a}
                index={rankMap.get(a.artifact_id)}
                go={go}
              />
            );
          })}
        </div>
      )}
      {!searching && matchCount > rowBudget && (
        <button
          type="button"
          className="tower-load-more"
          onClick={onLoadMore}
        >
          Load more — showing {Math.min(rowBudget, matchCount)} of {matchCount}
        </button>
      )}
    </>
  );
});

// One catalog row. Memoized: the artifact object is a stable module-level
// reference and `go` is stable across keystrokes, so a row re-renders only
// when its own rank actually changes. Only matching rows are mounted (see
// LibraryResults), so there is no per-row visibility flag.
const TowerRow = memo(function TowerRow({ a, index, go }) {
  return (
    <button
      className="tower-row reveal"
      onClick={() => go(`/tower-of-babel/library/${a.artifact_id}`)}
    >
      <span className="tower-row-index">
        {index === undefined ? null : String(index).padStart(2, "0")}
      </span>
      <span className="tower-row-cover" aria-hidden="true">
        <TowerCover a={a} />
      </span>
      <span className="tower-row-main">
        <span className="tower-row-title">{a.title}</span>
        {(a.creator || a.year) && (
          <span className="tower-row-creator">
            {a.creator}
            {a.creator && a.year ? " · " : ""}
            {a.year || ""}
          </span>
        )}
        {a.description ? (
          <span className="tower-row-desc">{a.description}</span>
        ) : null}
      </span>
      <span className="tower-row-tags">
        <span className="tower-tag">{a.collection}</span>
        {a.rights_status && (
          <span className="tower-tag tower-tag-rights">
            {a.rights_status.replace(/_/g, " ")}
          </span>
        )}
        {a.format && <span className="tower-tag">{a.format}</span>}
      </span>
      <span className="tower-row-arrow" aria-hidden="true">
        ↗
      </span>
    </button>
  );
});
export function LibraryArtifact({ go, params, onReady }) {
  const [artifacts, catalogError, , retryArtifacts] = useArtifacts();
  // Warm the tower-files manifest chunk while the entry paints, so the
  // inline full-text section usually has it cached (see getTowerFiles above).
  // Fire-and-forget: it never blocks rendering and never changes the UI.
  useEffect(() => {
    getTowerFiles();
    // Entry pages keep the pre-ungating behavior: arriving at an entry IS
    // the intent, so the full index starts here for neighbor/related data.
    requestCatalogIndex();
  }, [params.id]);
  // Analytics: reader scroll-depth milestones (25/50/75/100%), once each
  // per work per session. Passive listener, no layout reads beyond the
  // standard scroll metrics, removed on navigation.
  useEffect(() => {
    const seen = new Set();
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return;
      const pct = Math.min(100, Math.round((el.scrollTop / max) * 100));
      for (const m of [25, 50, 75, 100]) {
        if (pct >= m && !seen.has(m)) {
          seen.add(m);
          track("reader_progress", { artifact_id: params.id, percent: m });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [params.id]);
  // Full record loads on demand (the index has list fields only).
  const [fullArtifact, setFullArtifact] = useState(null);
  const [fullSettled, setFullSettled] = useState(false);
  useEffect(() => {
    let live = true;
    setFullArtifact(null);
    setFullSettled(false);
    getFullArtifact(params.id).then(
      (a) => { if (live) { setFullArtifact(a); setFullSettled(true); } },
      () => { if (live) { setFullArtifact(null); setFullSettled(true); } }
    );
    return () => { live = false; };
  }, [params.id]);
  // Analytics: one work_viewed per work per session, fired when any
  // usable record for the entry is in hand.
  useEffect(() => {
    if (trackedWorkViews.has(params.id)) return;
    const rec =
      fullArtifact ||
      (artifacts && artifacts.find((a) => a.artifact_id === params.id));
    if (!rec) return;
    trackedWorkViews.add(params.id);
    track("work_viewed", {
      artifact_id: rec.artifact_id,
      title: rec.title,
      collection: rec.collection,
      creator: rec.creator,
      year: rec.year,
    });
  }, [params.id, fullArtifact, artifacts]);
  // Rewritten description from the sidecar (2026-10-18 revamp); falls back
  // to the catalog record's own description while loading or on failure.
  const [descOverride, setDescOverride] = useState(null);
  useEffect(() => {
    let live = true;
    setDescOverride(null);
    getDescription(params.id).then(
      (d) => { if (live) setDescOverride(d); },
      () => { if (live) setDescOverride(null); }
    );
    return () => { live = false; };
  }, [params.id]);
  // The entry's <title> / meta / JSON-LD need the catalog too: the app
  // shell applies generic Tower meta on navigation, so re-apply once the
  // record is available. Keyed on the entry id too: entry-to-entry
  // navigation does not remount this component, and the shell's generic
  // meta would otherwise go stale.
  useEffect(() => {
    if (artifacts) applyMeta(window.location.pathname);
  }, [artifacts, params.id]);
  // Tell the app shell the entry has painted so it can dismiss the
  // Tower boot loader shown during in-app navigation here. Keyed on the
  // entry id so entry-to-entry (prev/next) navigation re-fires it even
  // though the component itself does not remount. Gated on the catalog:
  // no ready signal before there is something to paint.
  useEffect(() => {
    if (!onReady || !artifacts) return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        onReady();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [onReady, params.id, artifacts]);
  if (catalogError) return <TowerCatalogError onRetry={retryArtifacts} />;
  if (!artifacts) return null;
  const index = artifacts.findIndex((a) => a.artifact_id === params.id);
  const indexRecord = artifacts[index];
  // Prefer the full record (has description, download_url, etc.); fall back
  // to the index record for basic fields while the full catalog loads.
  const artifact = fullArtifact || indexRecord;
  // While the full record is still in flight and the index has no entry
  // either, render nothing rather than a false UNKNOWN ARTIFACT — after
  // an iOS crash-reload that state latched on screen for a record that
  // exists (2026-10-21). UNKNOWN is only for a settled miss.
  if (!artifact && !fullSettled) return null;
  if (!artifact) {
    return (
      <main className="page-shell inner-page tower-light" id="main-content" tabIndex={-1}>
        <section className="inner-hero section">
          <div className="section-index">ARTIFACT / {params.id}</div>
          <h1>UNKNOWN ARTIFACT</h1>
        </section>
        <section className="tower-entry-record section">
          <p className="body-copy">No artifact record exists for this id.</p>
          <button className="text-link" onClick={() => go("/tower-of-babel/library")}>
            BACK TO LIBRARY <span>↗</span>
          </button>
        </section>
      </main>
    );
  }
  const prev = artifacts[(index - 1 + artifacts.length) % artifacts.length];
  const next = artifacts[(index + 1) % artifacts.length];
  const record = [
    ["COLLECTION", artifact.collection],
    ["CREATOR", artifact.creator],
    ["YEAR", artifact.year],
    ["FORMAT", artifact.format],
    ["FILE SIZE", artifact.file_size],
    ["VERSION", artifact.version],
    ["LICENSE", artifact.license],
    ["RIGHTS", artifact.rights_status && artifact.rights_status.replace(/_/g, " ")],
    ["CHECKSUM", artifact.checksum],
  ].filter(([, v]) => v !== undefined && v !== null && v !== "");
  const status = artifact.download_status;
  return (
    <main className="page-shell inner-page tower-light tower-entry" id="main-content" tabIndex={-1}>
      <section className="tower-entry-hero section">
        <div className="section-index">LIBRARY / {artifact.collection}</div>
        <h1>{artifact.title}</h1>
        {(artifact.creator || artifact.year) && (
          <p className="tower-entry-byline">
            {artifact.creator}
            {artifact.creator && artifact.year ? " · " : ""}
            {artifact.year || ""}
          </p>
        )}
        {(descOverride || artifact.description) && (
          <details className="tower-desc">
            <summary>
              <span className="section-index">DESCRIPTION</span>
              <span className="tower-about-chevron" aria-hidden="true">▾</span>
            </summary>
            <div className="tower-desc-body">
              {(descOverride || artifact.description)
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p, i) => (
                  <p className="tower-entry-lede" key={i}>{p}</p>
                ))}
            </div>
          </details>
        )}
        <div className="tower-entry-actions">
          {artifact.source_url && (
            <a
              className="tower-source-btn"
              href={artifact.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              VIEW SOURCE <span aria-hidden="true">↗</span>
            </a>
          )}
          {status === "METADATA_ONLY" && (
            <p className="tower-access-note">
              Metadata only — no file distribution for this entry.
            </p>
          )}
          {status === "RESTRICTED" && (
            <p className="tower-access-note">
              Restricted — not available for distribution.
            </p>
          )}
        </div>
      </section>
      <section className="tower-entry-record section">
        <div className="section-index">CATALOG RECORD</div>
        <dl className="tower-record">
          {record.map(([label, value]) => (
            <div key={label} className="tower-record-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {artifact.tags && artifact.tags.length > 0 && (
          <ul className="tower-tag-list" aria-label="Tags">
            {artifact.tags.map((t) => (
              <li key={t} className="tower-tag">
                {t}
              </li>
            ))}
          </ul>
        )}
      </section>
      <LibraryFullText artifact={artifact} />
      {artifacts.length > 1 ? (
        <nav className="tower-entry-nav" aria-label="Browse entries">
          <button
            type="button"
            className="tower-entry-nav-btn"
            onClick={() => go(`/tower-of-babel/library/${prev.artifact_id}`)}
          >
            <span aria-hidden="true">←</span> Previous
          </button>
          <button type="button" className="tower-entry-nav-btn" onClick={() => go("/tower-of-babel/library")}>
            All Entries
          </button>
          <button
            type="button"
            className="tower-entry-nav-btn"
            onClick={() => go(`/tower-of-babel/library/${next.artifact_id}`)}
          >
            Next <span aria-hidden="true">→</span>
          </button>
        </nav>
      ) : (
        <div className="page-next">
          <button className="text-link" onClick={() => go("/tower-of-babel/library")}>
            BACK TO LIBRARY <span>↗</span>
          </button>
        </div>
      )}
    </main>
  );
}
// ----- Library full-text reader ---------------------------------------------
// In-library reading view: displays OUR hosted text for an entry instead of
// linking out to the source. Merged into the entry page (see LibraryFullText
// below) — one page, no extra click. Entries whose text isn't available
// (metadata-only backlog, restricted) get a clean empty state, and the text
// appears automatically once it lands.
const READER_CHUNK_CHARS = 60000;

// Split the text on line boundaries so rendered chunks never break mid-line.
// Cursor-based (no t.split("\n")): the full split materializes a ~150k-entry
// lines array on the biggest texts and the per-line `cur +=` rope rebuilds a
// 60k-char string thousands of times. Byte-identical output, flat memory.
function chunkReaderText(t) {
  const chunks = [];
  let curLines = [];
  let curLen = 0;
  let start = 0;
  while (start <= t.length) {
    let end = t.indexOf("\n", start);
    if (end === -1) end = t.length;
    const line = t.slice(start, end);
    if (curLen > 0 && curLen + line.length + 1 > READER_CHUNK_CHARS) {
      chunks.push(curLines.join("\n") + "\n");
      curLines = [];
      curLen = 0;
    }
    curLines.push(line);
    curLen += line.length + 1;
    start = end + 1;
  }
  if (curLines.length > 0) chunks.push(curLines.join("\n") + "\n");
  return chunks;
}

// Word count without materializing a million-string array: the old
// text.trim().split(/\s+).length copied the whole text (trim) and built a
// ~1.5M-element array on the biggest entries. A single \S+ scan yields the
// same count, including the old quirk that whitespace-only text counts as
// one word.
function countWords(t) {
  const re = /\S+/g;
  let n = 0;
  let m;
  while ((m = re.exec(t)) !== null) n += 1;
  return n === 0 ? 1 : n;
}

// ----- Library full text (combined entry page) -------------------------------
// 2026-10-18: the standalone reader route was merged into the entry page.
// This renders the full-text section below the catalog record: download,
// stats, chunked text body, and the ReaderAssist orb (unchanged).
function LibraryFullText({ artifact }) {
  const artifactId = artifact.artifact_id;
  const status = artifact.download_status;
  const url = artifact.download_url;
  // Text background mode: cycles transparent -> light -> dark (2026-10-18).
  // Only affects the .tower-fulltext section below the divider.
  const [textMode, setTextMode] = useState("transparent");
  const cycleTextMode = () => {
    setTextMode((m) => (m === "transparent" ? "light" : m === "light" ? "dark" : "transparent"));
  };
  // Same C1 guard as the old reader: local /tower-of-babel/*.txt files are
  // verified against the build-time manifest so the text never 404s.
  // External links are always attempted (and degrade gracefully on CORS).
  // The manifest loads as its own chunk (see getTowerFiles above), so the
  // check is async: while it loads, local files are treated optimistically
  // as present (the text fetch below 404s gracefully if one is actually
  // missing). No visual difference on the success path.
  const [towerFiles, setTowerFiles] = useState(null);
  useEffect(() => {
    let live = true;
    getTowerFiles().then((s) => {
      if (live) setTowerFiles(s);
    });
    return () => { live = false; };
  }, [artifactId]);
  const isLocalTowerFile =
    typeof url === "string" && url.startsWith("/tower-of-babel/");
  const localFileExists =
    !isLocalTowerFile ||
    !towerFiles ||
    towerFiles.has(url.split("/").pop().replace(/\.txt$/, ""));
  const canRead =
    !!artifact &&
    (status === "AVAILABLE" || status === "EXTERNAL_LINK") &&
    typeof url === "string" &&
    url.length > 0 &&
    localFileExists;

  const [text, setText] = useState(null);
  const [textError, setTextError] = useState(false);
  // Streaming state (2026-10-25): large texts render progressively —
  // the first chunk paints once ~60k chars arrive instead of waiting
  // for the whole file. textDone is false while the stream is in
  // flight; share-link landing, word stats, and reader analytics all
  // wait for it so they never act on a partial prefix.
  const [textDone, setTextDone] = useState(true);
  // Analytics: the full text actually loaded and is on screen — the
  // strongest reading-intent signal the library produces.
  useEffect(() => {
    if (!text || !textDone || trackedReaderOpens.has(artifactId)) return;
    trackedReaderOpens.add(artifactId);
    track("reader_opened", {
      artifact_id: artifactId,
      collection: artifact.collection,
      chars: text.length,
    });
  }, [text, textDone, artifactId]);
  // Windowed chunk rendering (2026-10-21): only chunks in [win.start,
  // win.end) are mounted. Rendering used to be a prefix (0..shown), so a
  // Search/Contents jump to the end of a 1.4 MB book mounted the WHOLE
  // text at once — iOS killed the tab for memory, which readers saw as a
  // crash to "UNKNOWN ARTIFACT" and a doubled page on the way back. Far
  // jumps now re-anchor a small window around the target instead; the
  // skipped prefix becomes a spacer of estimated height.
  const [win, setWin] = useState({ start: 0, end: 1 });
  const winStart = win.start;
  const winEnd = win.end;
  // The window SLIDES (2026-10-21, second fix): the first windowing pass
  // re-anchored far jumps but let the window grow as a prefix forever —
  // contiguous jumps and plain forward reading extended the end while the
  // start stayed at 0, so a few Contents jumps into a big book mounted
  // ~19 chunks (~1.1M chars) and iOS killed the tab on the third jump.
  // The mounted window is now capped; advancing the end past the cap
  // advances the start with it. Dropped chunks leave their MEASURED
  // heights in chunkHeightsRef, so the prefix spacer stays exact and
  // sliding moves nothing on screen.
  const READER_MAX_WINDOW = 8;
  const chunkHeightsRef = useRef({});
  const heightsModeRef = useRef(null);
  // Shared-link landing (?at=<char offset>[&hl=<start>-<end>[,<start>-<end>...]]):
  // a "Share from Current Place" link jumps the reader to the sharer's scroll
  // position and, when present, highlights the shared passages in Apple Books
  // yellow. Parsed once per entry mount — a share link is always a fresh page
  // load, so stale params must never re-trigger on in-app navigation.
  const [shareLanding] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const atRaw = q.get("at");
      if (atRaw === null || !/^\d{1,9}$/.test(atRaw)) return null;
      const at = parseInt(atRaw, 10);
      let hls = [];
      const hlRaw = q.get("hl");
      if (hlRaw) {
        for (const part of hlRaw.split(",")) {
          if (!/^\d{1,9}-\d{1,9}$/.test(part)) continue;
          const [a, b] = part.split("-").map((n) => parseInt(n, 10));
          if (b > a) hls.push({ start: a, end: Math.min(b, a + 20000) });
          if (hls.length >= 20) break; // sanity cap
        }
      }
      return { at, hls, done: false };
    } catch {
      return null;
    }
  });
  const [shareHls, setShareHls] = useState([]); // [{start, end}] global offsets
  // The orb must never sit on top of the Tower boot loader: wait until the
  // boot overlay is fully dismissed before mounting it. Re-arms on every
  // entry navigation (the boot raises on each in-app tower visit).
  const [bootGone, setBootGone] = useState(false);
  useEffect(() => {
    if (!document.querySelector(".tower-boot")) {
      setBootGone(true);
      return;
    }
    setBootGone(false);
    const mo = new MutationObserver(() => {
      if (!document.querySelector(".tower-boot")) {
        setBootGone(true);
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [url]);
  // ReaderAssist plumbing: element refs per chunk (for match scrolling) and
  // the fallback <mark> position when the CSS Highlight API is unavailable.
  const chunkElsRef = useRef([]);
  const [activeMark, setActiveMark] = useState(null);
  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    setText(null);
    setTextError(false);
    setTextDone(false);
    setWin({ start: 0, end: 1 });
    chunkElsRef.current = [];
    chunkHeightsRef.current = {};
    heightsModeRef.current = null;
    setActiveMark(null);
    setShareHls([]);
    if (!canRead) {
      setTextDone(true);
      return;
    }
    // Check LRU cache first — instant on back/forward navigation.
    const cached = getCachedText(url);
    if (cached !== undefined) {
      setText(cached);
      setTextDone(true);
      return () => { live = false; };
    }
    // Stream the text and paint progressively: the first ~60k chars
    // (one reader chunk) render as soon as they arrive, then the text
    // grows at doubling thresholds until the stream ends. Previously
    // the reader waited for r.text() — the whole file, up to ~9MB —
    // before painting anything, which is the delay on large entries.
    // Only the COMPLETE text enters the LRU cache; partial prefixes
    // are render-only. Chunking is line-based and prefix-stable, so
    // the only thing a later publish can change is the tail line of
    // the last mounted chunk.
    fetch(url, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (!r.body || typeof r.body.getReader !== "function") {
          const t = await r.text();
          if (live) {
            setCachedText(url, t);
            setText(t);
            setTextDone(true);
          }
          return;
        }
        const reader = r.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let acc = "";
        let nextPublish = 60000;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            acc += decoder.decode(value, { stream: true });
            if (live && acc.length >= nextPublish) {
              setText(acc);
              nextPublish = Math.max(nextPublish * 2, acc.length + 500000);
            }
          }
          acc += decoder.decode();
          if (live) {
            setCachedText(url, acc);
            setText(acc);
            setTextDone(true);
          }
        } catch (e) {
          if (live && e.name !== "AbortError") setTextError(true);
          if (live) setTextDone(true);
        }
      })
      .catch((e) => {
        if (live && e.name !== "AbortError") setTextError(true);
        if (live) setTextDone(true);
      });
    return () => { live = false; ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, canRead]);

  const chunks = useMemo(() => (text ? chunkReaderText(text) : []), [text]);
  // Cumulative character offsets per chunk — maps global match offsets to
  // rendered chunks for the ReaderAssist find panel.
  const chunkStarts = useMemo(() => {
    const starts = new Array(chunks.length);
    let off = 0;
    for (let i = 0; i < chunks.length; i++) {
      starts[i] = off;
      off += chunks[i].length;
    }
    return starts;
  }, [chunks]);
  const sentinelRef = useRef(null);
  // Long texts (the largest is ~9MB) render in chunks inside the window;
  // more load at the window's end as the reader scrolls, so the first
  // paint stays fast on phones and the mounted DOM stays bounded.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || win.end >= chunks.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setWin((w) => {
            const end = Math.min(w.end + 2, chunks.length);
            return { start: Math.max(w.start, end - READER_MAX_WINDOW), end };
          });
        }
      },
      { rootMargin: "1200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [win.end, chunks.length]);

  // Bring a chunk into the mounted window (ReaderAssist panels call this
  // before scrolling to a match/section). Nearby targets just extend the
  // window contiguously; a FAR target re-anchors a small window around it
  // — never the whole prefix (that full-book mount is what crashed iOS).
  const ensureChunk = useCallback(
    (ci) => {
      setWin((w) => {
        if (ci >= w.start && ci < w.end) return w;
        if (ci >= w.end && ci - w.end <= 8) {
          const end = ci + 1;
          return { start: Math.max(w.start, end - READER_MAX_WINDOW), end };
        }
        if (ci < w.start && w.start - ci <= 8) {
          const start = ci;
          return { start, end: Math.min(w.end, start + READER_MAX_WINDOW) };
        }
        return {
          start: Math.max(0, ci - 1),
          end: Math.min(chunks.length, ci + 3),
        };
      });
    },
    [chunks.length]
  );

  const chunkIndexOf = (off) => {
    let lo = 0;
    let hi = chunkStarts.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (chunkStarts[mid] <= off) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  };

  // Shared-link landing: once the text is in, force-render the chunks
  // covering the jump target (and the highlight, when present), then scroll
  // the exact offset into view with an instant jump — this is a link landing,
  // not an in-page navigation. The highlight paints after the scroll's rAF
  // so the Range rect is measured against the unmarked text node.
  useEffect(() => {
    if (!text || !textDone || !shareLanding || shareLanding.done || chunkStarts.length === 0)
      return;
    const tlen = text.length;
    const at = Math.min(shareLanding.at, Math.max(0, tlen - 1));
    const hlEnd =
      shareLanding.hls.length > 0
        ? Math.min(shareLanding.hls[shareLanding.hls.length - 1].end, tlen)
        : at;
    const need = Math.max(
      chunkIndexOf(at),
      chunkIndexOf(Math.max(0, hlEnd - 1))
    );
    if (need < win.start || need >= win.end) {
      ensureChunk(need);
      return; // effect re-runs once the chunks render
    }
    shareLanding.done = true;
    const ci = chunkIndexOf(at);
    const el = chunkElsRef.current[ci];
    if (!el) return;
    const headroom = window.innerHeight * 0.12;
    requestAnimationFrame(() => {
      let top = null;
      const tn = el.firstChild;
      if (tn && tn.nodeType === 3) {
        try {
          const s = Math.min(Math.max(0, at - chunkStarts[ci]), tn.length);
          const r = new Range();
          r.setStart(tn, s);
          r.setEnd(tn, s);
          top = r.getBoundingClientRect().top + window.scrollY - headroom;
        } catch {
          top = null;
        }
      }
      if (top === null || Number.isNaN(top)) {
        const rect = el.getBoundingClientRect();
        top = rect.top + window.scrollY - headroom;
      }
      window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
      if (shareLanding.hls.length > 0) {
        setShareHls(
          shareLanding.hls.map((h) => ({
            start: Math.min(h.start, tlen - 1),
            end: Math.min(h.end, tlen),
          }))
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, textDone, win, chunkStarts]);

  const stats = useMemo(() => {
    if (!text || !textDone) return null;
    const words = countWords(text);
    return {
      words,
      minutes: Math.max(1, Math.round(words / 200)),
    };
  }, [text, textDone]);

  // Chunk body renderer: the search fallback <mark> takes precedence; the
  // shared-passage highlight (Apple Books yellow) paints wherever the ?hl=
  // range intersects the chunk.
  const renderChunk = (c, i) => {
    if (activeMark && activeMark.chunkIndex === i && !SUPPORTS_HIGHLIGHTS) {
      return (
        <>
          {c.slice(0, activeMark.start)}
          <mark className="ra-mark">
            {c.slice(activeMark.start, activeMark.end)}
          </mark>
          {c.slice(activeMark.end)}
        </>
      );
    }
    if (shareHls.length > 0 && chunkStarts.length > 0) {
      const gStart = chunkStarts[i];
      // Collect all ranges that intersect this chunk, converted to chunk-local.
      const local = [];
      for (const h of shareHls) {
        const s = h.start - gStart;
        const e = h.end - gStart;
        if (s < c.length && e > 0) {
          local.push({ s: Math.max(0, s), e: Math.min(c.length, e) });
        }
      }
      if (local.length > 0) {
        // Sort and merge overlapping ranges.
        local.sort((a, b) => a.s - b.s);
        const merged = [local[0]];
        for (let k = 1; k < local.length; k++) {
          const last = merged[merged.length - 1];
          if (local[k].s <= last.e) {
            last.e = Math.max(last.e, local[k].e);
          } else {
            merged.push(local[k]);
          }
        }
        // Build fragments with <mark> for each range.
        const parts = [];
        let pos = 0;
        merged.forEach((r, k) => {
          if (r.s > pos) parts.push(c.slice(pos, r.s));
          parts.push(
            <mark key={k} className="ra-share-mark">
              {c.slice(r.s, r.e)}
            </mark>
          );
          pos = r.e;
        });
        if (pos < c.length) parts.push(c.slice(pos));
        return <>{parts}</>;
      }
    }
    return c;
  };

  // Memoized chunk elements (2026-10-20): a text-mode toggle (or any other
  // small state change in this component) must not re-run the chunk map —
  // recreating every chunk <p> and churning its inline ref made the mode
  // switch feel delayed on long texts. Rebuilds only when the inputs
  // renderChunk actually reads change.
  const chunkEls = useMemo(
    () => {
      const out = [];
      for (let i = win.start; i < win.end; i++) {
        out.push(
          <p
            key={i}
            ref={(el) => {
              chunkElsRef.current[i] = el;
            }}
            className="tower-reader-chunk"
          >
            {renderChunk(chunks[i], i)}
          </p>
        );
      }
      return out;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chunks, win, activeMark, shareHls, chunkStarts]
  );

  // Spacer calibration: the skipped prefix's height is estimated from the
  // mounted chunks' measured px-per-char (sampled, so no layout thrash).
  // Only scroll positions ABOVE the window depend on it — everything at
  // and below the window is measured from real elements.
  const pxPerCharRef = useRef(0.45);
  useEffect(() => {
    if (heightsModeRef.current !== textMode) {
      chunkHeightsRef.current = {};
      heightsModeRef.current = textMode;
    }
    let h = 0;
    let chars = 0;
    const sample = [];
    for (let i = win.start; i < win.end && sample.length < 3; i++)
      sample.push(i);
    for (let i = win.end - 1; i >= win.start && sample.length < 6; i--)
      if (!sample.includes(i)) sample.push(i);
    for (let i = win.start; i < win.end; i++) {
      const el = chunkElsRef.current[i];
      if (el && chunks[i]) {
        if (el.offsetHeight > 0)
          chunkHeightsRef.current[i] = el.offsetHeight;
        if (sample.includes(i)) {
          h += el.offsetHeight;
          chars += chunks[i].length;
        }
      }
    }
    if (chars > 400 && h > 0) pxPerCharRef.current = h / chars;
  }, [win, chunks, textMode]);
  const spacerPx = (() => {
    if (win.start <= 0) return 0;
    let px = 0;
    for (let i = 0; i < win.start; i++) {
      const measured = chunkHeightsRef.current[i];
      px +=
        measured != null
          ? measured
          : Math.round((chunks[i] ? chunks[i].length : 0) * pxPerCharRef.current);
    }
    return px;
  })();
  const textBoxRef = useRef(null);
  const backToBeginning = () => {
    setWin({ start: 0, end: Math.min(3, chunks.length) });
    requestAnimationFrame(() => {
      const box = textBoxRef.current;
      if (box) {
        const y = box.getBoundingClientRect().top + window.scrollY - 8;
        window.scrollTo({ top: Math.max(0, y), behavior: "auto" });
      }
    });
  };

  return (
    <section className="tower-fulltext section" aria-label="Full text" data-textmode={textMode}>
      <div className="section-index">FULL TEXT</div>
      <div className="tower-reader-meta">
        {isLocalTowerFile && localFileExists && (
          <a className="tower-reader-download" href={url} download>
            DOWNLOAD .TXT
          </a>
        )}
        {stats && (
          <span className="tower-reader-stats">
            {stats.words.toLocaleString()} WORDS · ~{stats.minutes} MIN READ
          </span>
        )}
        <button
          type="button"
          className="tower-textmode-btn"
          onClick={cycleTextMode}
          aria-label={`Text background: ${textMode}. Activate to switch mode.`}
          title="Switch text background mode"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3v18" />
          </svg>
          <span className="tower-textmode-name">{textMode}</span>
        </button>
      </div>
      {text === null && !textError && canRead && (
        <p className="tower-reader-status">Loading full text…</p>
      )}
      {text !== null && !textDone && !textError && (
        <p className="tower-reader-status">Loading more of this text…</p>
      )}
      {textError && (
        <div className="tower-reader-empty">
          <p className="body-copy">
            The full text couldn&rsquo;t be loaded right now. You can still
            open the file directly:
          </p>
          <a
            className="tower-source-btn"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            OPEN FILE <span aria-hidden="true">↗</span>
          </a>
        </div>
      )}
      {!canRead && (
        <div className="tower-reader-empty">
          <p className="body-copy">
            {status === "RESTRICTED"
              ? "This entry is restricted — its text isn't available for distribution."
              : "The full text for this entry is still being prepared. Check back soon — it appears here automatically once it lands."}
          </p>
        </div>
      )}
      {text !== null && (
        <div className="tower-reader-text" role="document" aria-label={`Full text of ${artifact.title}`} ref={textBoxRef}>
          {win.start > 0 && (
            <>
              <div className="tower-reader-jumpbar">
                <span>Jumped ahead — the earlier text isn&rsquo;t loaded.</span>
                <button type="button" onClick={backToBeginning}>
                  BACK TO THE BEGINNING
                </button>
              </div>
              <div
                className="tower-reader-spacer"
                style={{ height: spacerPx }}
                aria-hidden="true"
              />
            </>
          )}
          {chunkEls}
          {win.end < chunks.length && (
            <div className="tower-reader-more">
              <div ref={sentinelRef} className="tower-reader-sentinel" aria-hidden="true" />
              <button
                type="button"
                className="tower-source-btn"
                onClick={() =>
                  setWin((w) => {
                    const end = Math.min(w.end + READER_MAX_WINDOW, chunks.length);
                    return {
                      start: Math.max(w.start, end - READER_MAX_WINDOW),
                      end,
                    };
                  })
                }
              >
                LOAD MORE TEXT
              </button>
            </div>
          )}
        </div>
      )}
      {text !== null && bootGone && (
        <ReaderAssist
          text={text}
          title={artifact.title}
          chunkStarts={chunkStarts}
          shownChunks={win.end}
          winStart={win.start}
          ensureChunk={ensureChunk}
          chunkElsRef={chunkElsRef}
          onActiveMark={setActiveMark}
        />
      )}
    </section>
  );
}
// ----- Government ----------------------------------------------------------
export function Government({ go }) {
  return (
    <main className="page-shell inner-page gov-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <span className="gov-status-pill">{government.statusPill}</span>
        <h1>{government.heading}</h1>
        <p className="display-copy">{government.intro}</p>
        <div className="gov-hero-actions">
          <a
            className="gov-access-btn"
            href="http://35.231.117.228/"
            target="_blank"
            rel="noopener noreferrer"
          >
            ENTER THE SYSTEM <span aria-hidden="true">↗</span>
          </a>
          <span className="gov-access-note">
            Live operational intelligence system
          </span>
        </div>
      </section>

      <section className="copy-block section reveal">
        <div className="section-index">POSITIONING</div>
        <div>
          <h2 className="gov-h2">{government.positioning.title}</h2>
          {government.positioning.paragraphs.map((para, i) => (
            <p className="body-copy" key={i}>{para}</p>
          ))}
        </div>
      </section>

      <section className="capabilities section reveal">
        <div className="section-index">{government.capabilitiesHeading}</div>
        <div>
          <p className="body-copy gov-section-intro">{government.capabilitiesIntro}</p>
          <div className="capability-list">
            {government.capabilities.map((c, i) => (
              <div className="cap-row gov-cap-row" key={c.title}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <h3>{c.title}</h3>
                <p>{c.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="copy-block section reveal">
        <div className="section-index">{government.engagement.heading}</div>
        <div>
          <p className="body-copy gov-section-intro">{government.engagement.intro}</p>
          <div className="gov-pathways">
          {government.engagement.pathways.map((pw, i) => (
            <div className="gov-pathway" key={pw.title}>
              <span className="gov-pathway-index">{String(i + 1).padStart(2, "0")}</span>
              <h3>{pw.title}</h3>
              <p>{pw.description}</p>
            </div>
          ))}
        </div>
        </div>
      </section>

      <section className="copy-block section reveal">
        <div className="section-index">THE PATH IN</div>
        <div>
          <p className="body-copy">{government.extra}</p>
        </div>
      </section>

      <FaqBlock index="QUESTIONS" faqs={government.faqs} />

      <section className="copy-block section">
        <p className="gov-footnote">{government.footnote}</p>
      </section>
    </main>
  );
}
// ----- About ---------------------------------------------------------------
export function About({ go }) {
  return (
    <main className="page-shell inner-page about-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">{operator.index}</div>
        <h1>{operator.heading}</h1>
        <p className="display-copy">{operator.positioning}</p>
      </section>

      <section className="copy-block section reveal">
        <span className="section-index">{operator.whoWeAre.title}</span>
        <div>
          {operator.whoWeAre.paragraphs.map((p, i) => (
            <p className="body-copy" key={i}>{p}</p>
          ))}
        </div>
      </section>

      <section className="section reveal profiles-section">
        <div className="section-index">{operator.team.title}</div>
        <div className="about-grid profiles-grid">
          {operator.team.profiles.map((p, i) => (
            <div className="about-panel profile-panel" key={p.name}>
              <span className="profile-index">
                PROFILE {String(i + 1).padStart(2, "0")}
              </span>
              <p className="display-copy">{p.name}</p>
              <span className="profile-role">{p.role}</span>
              <p className="body-copy profile-text">{p.text}</p>
              {p.highlights && (
                <ul className="profile-highlights">
                  {p.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}

            </div>
          ))}
        </div>
        <div className="about-panel profile-facts-panel">
          <ul className="about-facts">
            {operator.team.facts.map(([k, v]) => (
              <li key={k}>
                <span>{k}</span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
// ----- Privacy Policy -------------------------------------------------------
// AdSense-ready privacy page (2026-10-25): states, in plain language, what
// the site collects, that third-party vendors including Google use cookies
// to serve ads, and how to opt out of personalized advertising. Deliberately
// makes no permanent "never" pledge about advertising or data use — the
// site's advertising and data practices are described as they are now.
export function PrivacyPage({ go }) {
  return (
    <main className="page-shell inner-page about-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">PRIVACY</div>
        <h1>Privacy Policy</h1>
        <p className="display-copy">Last updated: October 26, 2026. Antarctic Labs operates antarctic-labs.com, including the Tower of Babel free library.</p>
      </section>

      <section className="copy-block section reveal">
        <span className="section-index">READING WITHOUT AN ACCOUNT</span>
        <div>
          <p className="body-copy">You do not need an account, a sign-in, or any personal information to read the Tower of Babel library. The texts in the library are public-domain and openly licensed works, hosted on this site in plain text.</p>
        </div>
      </section>

      <section className="copy-block section reveal">
        <span className="section-index">INFORMATION WE COLLECT</span>
        <div>
          <p className="body-copy">We collect as little as possible. Anonymous analytics: we use PostHog to count page views, library browsing, reading progress, and text downloads. PostHog is configured for anonymous visitors only — no user profiles are created, session recording is disabled, and automatic event capture is off. Only events we deliberately record are sent, tied to an anonymous visitor identifier, not to a name or email address.</p>
          <p className="body-copy">Information you choose to give us: if you donate, Stripe collects your email address at checkout to create a checkout session and, if enabled in Stripe, to send a receipt. We do not receive or store your card number. If you suggest a work for the library, you provide the title, creator, source link, and any notes you choose to add. Our hosting provider may process basic technical information needed to deliver pages securely, such as IP address and browser type, in its normal server logs.</p>
          <p className="body-copy">API keys: if you request a Tower of Babel API key, we store the email address you give and a cryptographic hash of the key — never the key itself — in a Cloudflare database, so the API can authenticate your requests and count your daily usage. Payments for API plans are processed by Stripe, and we do not receive or store your card number. The email that delivers your key is sent through Resend.</p>
        </div>
      </section>

      <section className="copy-block section reveal">
        <span className="section-index">COOKIES AND ADVERTISING</span>
        <div>
          <p className="body-copy">We use Google AdSense to show advertising on the Tower of Babel library pages. No advertising is shown on the donation page. Third-party vendors, including Google, use cookies to serve ads based on a user&apos;s prior visits to this website or other websites. Google&apos;s use of advertising cookies enables it and its partners to serve ads to users based on their visit to this site and other sites on the internet.</p>
          <p className="body-copy">You may opt out of personalized advertising by visiting <a href="https://adssettings.google.com/" target="_blank" rel="noreferrer">Google Ads Settings</a> and <a href="https://optout.aboutads.info/" target="_blank" rel="noreferrer">aboutads.info</a>. You can also set your browser to refuse cookies, though some site features may work less well without them. PostHog also uses cookies and local storage to keep its anonymous visitor identifier between visits.</p>
        </div>
      </section>

      <section className="copy-block section reveal">
        <span className="section-index">HOW INFORMATION IS USED AND SHARED</span>
        <div>
          <p className="body-copy">Information is used to operate the site and the library, to understand which works readers use, to process donations, and to show advertising. It is shared only with the service providers needed for those purposes — analytics, payment processing, and advertising — and as required by law. We do not publish or display information you provide through donation or suggestion forms.</p>
        </div>
      </section>

      <section className="copy-block section reveal">
        <span className="section-index">CHANGES AND CONTACT</span>
        <div>
          <p className="body-copy">This policy may be updated as the site changes; the date at the top of this page will change with it. Questions about this policy can be sent to hello@antarctic-labs.com, or through the suggestion form on the Tower of Babel library pages.</p>
          <p className="body-copy"><a href="#" onClick={(e) => { e.preventDefault(); go("/about"); }}>About Antarctic Labs</a> · <a href="#" onClick={(e) => { e.preventDefault(); go("/tower-of-babel"); }}>Tower of Babel</a></p>
        </div>
      </section>
    </main>
  );
}
// ----- Shared: FAQ block -----------------------------------------------------
// Native <details>/<summary> — zero JS, fully crawler-visible (the Q&A text
// is in the HTML, which is what search + AI engines index), keyboard
// accessible, and styled in the site's index-row language. Rendered by any
// page that carries an `faqs` array in its content object. The same Q&A
// feeds the FAQPage JSON-LD in seo.js.
export function FaqBlock({ index = "QUESTIONS", faqs = [], id }) {
  if (!faqs || faqs.length === 0) return null;
  const group = id || `faq-${String(index).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className="section reveal faq-section" aria-label={index}>
      <div className="section-index">{index}</div>
      <div className="faq-list">
        {faqs.map((f, i) => (
          <details className="faq-row" key={i} name={group}>
            <summary>
              <span className="faq-num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <span className="faq-q">{f.q}</span>
              <span className="faq-plus" aria-hidden="true">+</span>
            </summary>
            <div className="faq-answer">
              {(Array.isArray(f.a) ? f.a : [f.a]).map((p, j) => (
                <p className="body-copy" key={j}>{p}</p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

// ----- Tower of Babel / Agent API -------------------------------------------------
// Machine-readable documentation for AI agents: the static catalog surface,
// record schema, fetch pattern, corpus composition, licensing, and limits.
// Rendered with the Tower's light inner-page language. The fetch example is
// static JSX — the page documents a static file surface, not a live API.
const API_FETCH_EXAMPLE = `const catalog = await (await fetch("https://antarctic-labs.com/catalog.json")).json();
const books = catalog.filter(
  (r) => r.collection === "BOOKS" && r.download_status === "AVAILABLE"
);
for (const b of books.slice(0, 5)) {
  const res = await fetch(b.download_url);
  if (res.ok) {
    const text = await res.text(); // index it
  }
  // non-200: the record is metadata-only for now — skip it
}`;

export function TowerApiPage({ go }) {
  const api = towerOfBabel.apiPage;
  const subParam =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("sub") || ""
      : "";
  // Live gate for paid plans: subscribe buttons render ONLY when the
  // status endpoint says subscriptions are open (API_LIVE=1 server-side).
  // Until then the page shows the not-open-yet notice — no dead buttons,
  // and no checkout a key could not be delivered for.
  const [apiStatus, setApiStatus] = useState(null);
  useEffect(() => {
    let live = true;
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => {
        if (live) setApiStatus(d && typeof d === "object" ? d : {});
      })
      .catch(() => {
        if (live) setApiStatus({});
      });
    return () => {
      live = false;
    };
  }, []);
  const subscriptionsOpen = !!(apiStatus && apiStatus.subscriptions_open);
  // The free-key form renders ONLY when the status endpoint confirms
  // the key system is configured — until then the section shows the
  // switched-on-soon notice instead of a form that can only 503.
  const keysConfigured = !!(apiStatus && apiStatus.keys_configured);

  const [billing, setBilling] = useState("monthly");
  const [planSel, setPlanSel] = useState("pro");
  const [subscribing, setSubscribing] = useState("");
  const [subError, setSubError] = useState("");
  const subscribe = async (plan) => {
    if (subscribing) return;
    setSubscribing(plan);
    setSubError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, billing }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setSubError(api.subscribePending);
        setSubscribing("");
        return;
      }
      if (!res.ok || !data.url) throw new Error("checkout failed");
      window.location.href = data.url;
    } catch {
      setSubError("Checkout could not be started — please try again.");
      setSubscribing("");
    }
  };

  // Free key mint: POST /api/keys. The key itself is delivered by email
  // only and never appears in the response or on this page. A 503 means
  // the key system is not switched on yet — show the graceful notice.
  const [keyEmail, setKeyEmail] = useState("");
  const [keyHoneypot, setKeyHoneypot] = useState("");
  const [keySending, setKeySending] = useState(false);
  const [keyState, setKeyState] = useState("idle"); // idle | sent | pending | error
  const onKeySubmit = async (e) => {
    e.preventDefault();
    if (keySending) return;
    setKeySending(true);
    setKeyState("idle");
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: keyEmail, website: keyHoneypot }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setKeyState("pending");
      } else if (res.ok && data.ok) {
        setKeyState("sent");
      } else {
        setKeyState("error");
      }
    } catch {
      setKeyState("error");
    }
    setKeySending(false);
  };

  const paidTiers = api.tiers.filter((t) => t.priceMonthly);
  const selTier = paidTiers.find((t) => t.id === planSel) || paidTiers[0];
  return (
    <main className="page-shell inner-page tower-light" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">FOR AI AGENTS</div>
        <h1>{api.h1}</h1>
        <p className="display-copy">{api.intro}</p>
      </section>

      {subParam === "thanks" && (
        <section className="section reveal">
          <div className="suggest-wrap">
            <p className="body-copy" role="status">
              Subscription received — thank you. Your API key is on its way to
              the email address you used at checkout; it is shown only in that
              email, so keep it somewhere safe.
            </p>
          </div>
        </section>
      )}
      {subParam === "canceled" && (
        <section className="section reveal">
          <div className="suggest-wrap">
            <p className="body-copy" role="status">
              Checkout was canceled — nothing was charged. You can subscribe
              whenever you are ready.
            </p>
          </div>
        </section>
      )}

      <section className="copy-block section reveal">
        <div className="section-index">THE SHAPE OF IT</div>
        <div>
          <p className="body-copy">{api.definition}</p>
        </div>
      </section>

      {api.sections.map((s) => (
        <section className="copy-block section reveal" key={s.title}>
          <div className="section-index">{s.title.toUpperCase()}</div>
          <div>
            <p className="body-copy">{s.body}</p>
            {s.title === "How an agent uses it" && (
              <pre className="code-block">
                <code>{API_FETCH_EXAMPLE}</code>
              </pre>
            )}
          </div>
        </section>
      ))}

      <section className="section reveal">
        <div className="section-index">API PLANS</div>
        <div className="capability-list">
          {api.tiers.map((t, i) => (
            <div className="cap-row" key={t.id}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <h3>{t.name}</h3>
              <p>
                {(t.price ||
                  (billing === "annual" ? t.priceAnnual : t.priceMonthly)) +
                  " · " +
                  t.limit +
                  ". " +
                  t.blurb}
              </p>
            </div>
          ))}
        </div>
        {subscriptionsOpen ? (
          <div className="suggest-wrap api-buy">
            <div className="api-toggle" role="group" aria-label="Billing period">
              <button
                type="button"
                className={billing === "monthly" ? "is-on" : ""}
                aria-pressed={billing === "monthly"}
                onClick={() => setBilling("monthly")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={billing === "annual" ? "is-on" : ""}
                aria-pressed={billing === "annual"}
                onClick={() => setBilling("annual")}
              >
                Annual — two months free
              </button>
            </div>
            <div className="api-plans" role="group" aria-label="Choose a plan">
              {paidTiers.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={planSel === t.id ? "is-on" : ""}
                  aria-pressed={planSel === t.id}
                  onClick={() => setPlanSel(t.id)}
                >
                  <span className="api-plan-name">{t.name}</span>
                  <span className="api-plan-price">
                    {billing === "annual" ? t.priceAnnual : t.priceMonthly}
                  </span>
                  <span className="api-plan-limit">{t.limit}</span>
                </button>
              ))}
            </div>
            <div className="desk-sample-actions">
              <button
                type="button"
                className="tower-access-btn api-cta"
                disabled={!!subscribing}
                onClick={() => subscribe(planSel)}
              >
                {subscribing
                  ? "OPENING CHECKOUT…"
                  : `SUBSCRIBE — ${selTier.name.toUpperCase()} ${
                      billing === "annual"
                        ? selTier.priceAnnual
                        : selTier.priceMonthly
                    }`}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
            {subError && (
              <p className="suggest-error" role="alert">
                {subError}
              </p>
            )}
          </div>
        ) : (
          <div className="suggest-wrap">
            <p className="body-copy">{api.subscribePending}</p>
          </div>
        )}
        <div className="suggest-wrap">
          {PORTAL_URL ? (
            <a className="api-quiet" href={PORTAL_URL}>
              MANAGE BILLING <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <p className="body-copy">{api.billingNote}</p>
          )}
          <p className="body-copy">{api.refundNote}</p>
        </div>
      </section>

      <section className="section suggest-section">
        <div className="suggest-wrap">
          <div className="section-index">{api.keyForm.heading}</div>
          <p className="body-copy">{api.keyForm.body}</p>
          {!keysConfigured ? (
            <p className="body-copy" role="status">
              {api.keyForm.pending}
            </p>
          ) : keyState === "sent" ? (
            <p className="body-copy" role="status">
              {api.keyForm.sent}
            </p>
          ) : (
            <form
              className="suggest-form"
              onSubmit={onKeySubmit}
              aria-label="Get a free API key"
            >
              <div className="suggest-field">
                <label htmlFor="api-key-email">
                  Email{" "}
                  <span className="req" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="api-key-email"
                  name="email"
                  type="email"
                  required
                  value={keyEmail}
                  onChange={(e) => setKeyEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.org"
                />
              </div>
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "-9999px",
                  top: "auto",
                  width: "1px",
                  height: "1px",
                  overflow: "hidden",
                }}
              >
                <label htmlFor="api-key-website">Website</label>
                <input
                  id="api-key-website"
                  name="website"
                  type="text"
                  value={keyHoneypot}
                  onChange={(e) => setKeyHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>
              {keyState === "pending" && (
                <p className="body-copy" role="status">
                  {api.keyForm.pending}
                </p>
              )}
              {keyState === "error" && (
                <p className="suggest-error" role="alert">
                  Something went wrong sending your key — please try again.
                </p>
              )}
              <div className="suggest-actions">
                <button
                  type="submit"
                  className="tower-access-btn api-cta suggest-submit"
                  disabled={keySending}
                >
                  {keySending ? "SENDING…" : api.keyForm.button}{" "}
                  <span aria-hidden="true">↗</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      <FaqBlock index="QUESTIONS" faqs={api.faqs} />

      <section className="section">
        <button type="button" className="text-link" onClick={() => go("/tower-of-babel/library")}>
          ENTER THE LIBRARY <span aria-hidden="true">↗</span>
        </button>
        <p className="svc-updated">Updated {api.updated}.</p>
      </section>
    </main>
  );
}
