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
} from "./lib/search-rank.js";
import { site } from "./content/site.js";
import { operator } from "./content/operator.js";
import { towerOfBabel } from "./content/tower-of-babel.js";
// The artifact catalog is lazy (see ./lib/catalog.js): it is ~2.6MB of
// source and used to ride in the main bundle, stalling every cold load.
// Components that need it use useArtifacts() below.
import {
  loadCatalog,
  loadBootstrap,
  getCachedArtifacts,
  getFullArtifact,
  getDescription,
  getCover,
  onIndexReady,
  isIndexLoading,
  warmShardManifest,
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
import { services } from "./content/services.js";
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

      {/* The full library, poured directly below the landing content. */}
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
    // Load bootstrap first (instant), then full index in background.
    if (!state.artifacts && !state.error) {
      loadBootstrap().then(
        (a) => {
          if (live) setState((s) => ({ ...s, artifacts: a, error: false }));
          // Start full index load in background after bootstrap paints.
          loadCatalog().catch(() => {});
        },
        () => {
          if (live) setState({ artifacts: null, error: true, fullIndexReady: false });
        }
      );
    } else if (state.artifacts && !state.fullIndexReady) {
      // Bootstrap is showing; upgrade to full index when it arrives.
      const unsub = onIndexReady((full) => {
        if (live) setState((s) => ({ ...s, artifacts: full, fullIndexReady: true }));
      });
      // Also trigger the load if not already in flight.
      loadCatalog().catch(() => {});
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
  const secMasks = new Uint32Array(n);
  const volFlags = new Uint8Array(n);
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
      secMasks[i] = secondaryMaskFor(T);
      volFlags[i] = /\b(vol|volume|part) \d+/.test(T) ? 1 : 0;
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  return { haystacks, normTitles, normCreators, normColls, secMasks, volFlags };
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
      secMasks: null,
      volFlags: null,
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
      )}
    </div>
  );
}

function TowerLibrarySection({ go, onReady }) {
  // Warm the shard manifest in the background for entry pages — deferred
  // well past first paint (2026-10-21 load fix): the manifest fetch
  // competed with the catalog on the critical path, and nothing on THIS
  // page needs it. Entry pages fetch it on demand if they arrive first.
  useEffect(() => {
    const t = setTimeout(() => {
      warmShardManifest();
    }, 6000);
    return () => clearTimeout(t);
  }, []);
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
  const [query, setQuery] = useState("");
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
  // The input stays bound to the raw query so typing never waits on work;
  // the expensive filter/sort and the deep index search run on the deferred
  // value at background priority, which removes the keystroke lag.
  const deferredQuery = useDeferredValue(query);
  // The catalog list itself updates on a debounced copy of the query, not on
  // the deferred value directly: at normal typing speed the deferred value
  // still catches up between keystrokes, which would re-reconcile thousands
  // of rows mid-burst. Debouncing collapses a burst into ~1 list update, so
  // the input never competes with row reconciliation. The deep full-text
  // search above keeps its own 450ms debounce on the deferred value.
  const [listQuery, setListQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setListQuery(deferredQuery.trim().toLowerCase()), 280);
    return () => clearTimeout(t);
  }, [deferredQuery]);
  // Whether the top "entries matching" list is expanded past its 2-row
  // cap (see LibraryResults). Collapses again whenever the query changes.
  const [matchesExpanded, setMatchesExpanded] = useState(false);
  useEffect(() => {
    setMatchesExpanded(false);
    // Reset pagination to first 50 when filters change.
    setRowBudget(TOWER_ROWS_PER_PAGE);
  }, [listQuery, bucketFilter, sortId]);
  // Deep full-text search: same query, second mode. Debounced; searches the
  // full contents of every staged text via the build-time index. Title
  // results above are untouched by this.
  const [deep, setDeep] = useState({ state: "idle" });
  useEffect(() => {
    const raw = deferredQuery.trim();
    if (raw.length < 2) {
      setDeep({ state: "idle" });
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setDeep((d) => ({ ...d, state: "loading" }));
      const res = await searchDeep(raw);
      if (!cancelled) setDeep(res);
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [deferredQuery]);
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
  const { rankMap, matchCount, rankedIndices } = useMemo(() => {
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
        if (!passesBucket(i)) continue;
        count++;
        if (map.size < rowBudget) map.set(artifacts[i].artifact_id, count);
      }
      return { rankMap: map, matchCount: count, rankedIndices: null };
    }
    // Searching (2026-10-20 relevance overhaul, lib/search-rank.js):
    // token-AND matching over the normalized haystacks, field-weighted
    // scoring, and curated canon pins first — so the work a searcher
    // means leads, not whatever sorts first alphabetically. The sort
    // dropdown governs browsing only; while a query is active the best
    // answer leads.
    const tokens = queryTokens(qNorm);
    // Rarest first: longer tokens are usually the most selective, so
    // checking them first rejects most records on the first includes().
    const scanTokens =
      tokens.length > 1
        ? tokens.slice().sort((a, b) => b.length - a.length)
        : tokens;
    const qMask = querySecondaryMask(qNorm);
    const scored = [];
    // Bound by the haystacks length, not artifacts.length: during the
    // bootstrap->full catalog upgrade the two can briefly disagree, and
    // the derived arrays are the internally consistent ones.
    const N = Math.min(artifacts.length, towerData.haystacks.length);
    const NT = towerData.normTitles;
    for (let i = 0; i < N; i++) {
      if (!passesBucket(i)) continue;
      const hay = towerData.haystacks[i];
      let ok = true;
      for (const t of scanTokens) {
        if (!hay.includes(t)) { ok = false; break; }
      }
      if (!ok) continue;
      scored.push({
        i,
        s: scoreArtifactPre(
          NT[i],
          towerData.normCreators[i],
          towerData.normColls[i],
          towerData.secMasks[i],
          towerData.volFlags[i],
          qNorm,
          tokens,
          qMask
        ),
      });
    }
    scored.sort(
      (x, y) =>
        y.s - x.s || (NT[x.i] < NT[y.i] ? -1 : NT[x.i] > NT[y.i] ? 1 : 0)
    );
    const seen = new Set();
    const ordered = [];
    const pins = pinsForQuery(qNorm, tokens);
    if (pins) {
      for (const id of pins) {
        const ix = towerData.idIndex.get(id);
        if (ix !== undefined && !seen.has(ix) && passesBucket(ix)) {
          seen.add(ix);
          ordered.push(ix);
        }
      }
    }
    for (const { i } of scored) {
      if (!seen.has(i)) {
        seen.add(i);
        ordered.push(i);
      }
    }
    // Only the first page of ranks is materialized (the only rows that
    // can mount); the count is the full ordered length.
    const cap = Math.min(ordered.length, rowBudget);
    for (let k = 0; k < cap; k++) map.set(artifacts[ordered[k]].artifact_id, k + 1);
    return { rankMap: map, matchCount: ordered.length, rankedIndices: ordered };
  }, [q, bucketFilter, sortId, towerOrder, artifacts, towerData, rowBudget]);
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
              <input
                type="search"
                className="tower-search tower-search-hero"
                placeholder="Search titles, creators, tags… — or words inside the texts"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search the library catalog and the full text of every work"
              />
              {!fullIndexReady && (
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
            {!q && !bucketFilter && (
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
              <aside className="tower-facets" aria-label="Refine results">
                <div className="tower-facets-title">Zoom in</div>
                <button
                  type="button"
                  className={`tower-facet${bucketFilter === "" ? " is-active" : ""}`}
                  onClick={() => setBucketFilter("")}
                >
                  All collections <span>{artifacts.length.toLocaleString()}</span>
                </button>
                {towerData.collections.map((c) => {
                  const laneActive =
                    bucketFilter === c || bucketFilter.indexOf(c + ":") === 0;
                  return (
                    <Fragment key={c}>
                      <button
                        type="button"
                        className={`tower-facet${laneActive ? " is-active" : ""}`}
                        onClick={() =>
                          setBucketFilter(bucketFilter === c ? "" : c)
                        }
                        aria-pressed={laneActive}
                      >
                        {TOWER_TOP_LABELS[c] || c}{" "}
                        <span>{(towerData.counts[c] || 0).toLocaleString()}</span>
                      </button>
                      {laneActive &&
                        (TOWER_SUBS[c] || []).map((s) => {
                          const key = `${c}:${s.id}`;
                          const n = towerData.subCounts[key] || 0;
                          if (!n) return null;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              className={`tower-facet tower-facet-sub${bucketFilter === key ? " is-active" : ""}`}
                              onClick={() =>
                                setBucketFilter(bucketFilter === key ? c : key)
                              }
                              aria-pressed={bucketFilter === key}
                            >
                              {s.label} <span>{n.toLocaleString()}</span>
                            </button>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </aside>
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
            <div className="tower-chips" role="group" aria-label="Filter by collection">
              <button
                type="button"
                className={`tower-chip${bucketFilter === "" ? " is-active" : ""}`}
                onClick={() => setBucketFilter("")}
              >
                All <span>{artifacts.length}</span>
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
              deep={deep}
              q={q}
              go={go}
              matchesExpanded={matchesExpanded}
              onToggleMatches={() => setMatchesExpanded((v) => !v)}
              viewMode={viewMode}
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

// ----- Tower of Babel / library results -------------------------------------
// The result count, index rows, and deep-search mentions, isolated behind
// React.memo so keystrokes in the search box never touch the thousands of
// catalog rows. TowerLibrary re-renders on every keystroke (the input is
// bound to the raw query); every prop here derives from the *debounced*
// list query, filter, sort, or row budget, which only change once typing
// pauses — so typing stays at input speed while the list updates right
// after.
//
// Only matching rows are mounted (derived from rowBudget + rankMap via
// useMemo); each row is memoized on (artifact, rank). A filter update
// therefore mounts exactly the visible slice instead of keeping thousands
// of rows in the DOM — the mounted-row churn was the 500ms+ hitch mid-typing.
const LibraryResults = memo(function LibraryResults({
  artifacts,
  towerOrder,
  rankMap,
  rankedIndices,
  matchCount,
  rowBudget,
  onLoadMore,
  deep,
  q,
  go,
  matchesExpanded,
  onToggleMatches,
  viewMode,
}) {
  // Render only the matching rows instead of keeping all 3,448 mounted and
  // flipping `hidden`: a filter update then reconciles dozens of rows
  // instead of thousands, and the DOM stays small so style recalc and
  // paint stay cheap. (The previous hidden-flip approach kept input fast
  // but made every filter/sort update walk all 3,448 rows.)
  const visibleIndices = useMemo(() => {
    // Searching: mount the top `rowBudget` by relevance rank — walking
    // the sort order here would mount an alphabetical slice and the
    // best answers (ranked first by the search memo) might never mount.
    if (rankedIndices) return rankedIndices.slice(0, rowBudget);
    const out = [];
    // Walk the full sort order, collecting the first `rowBudget` MATCHING
    // items — not just the first `rowBudget` in sort order (which breaks
    // pagination when a collection filter is active).
    for (let k = 0; k < towerOrder.length && out.length < rowBudget; k++) {
      const i = towerOrder[k];
      if (rankMap.has(artifacts[i].artifact_id)) out.push(i);
    }
    return out;
  }, [artifacts, towerOrder, rankMap, rankedIndices, rowBudget]);
  // While searching, the top "entries matching" list is capped at 2 rows
  // with a show-more expander — so the "Mentions in texts" section stays
  // visible on screen instead of being buried under dozens of title hits.
  // The cap lifts (all title matches show) only when the deep search has
  // nothing to show: it came back empty, is unavailable, or never runs
  // (query under 2 chars). While it is idle/loading we keep the cap, so
  // the list never jumps between capped and full as results stream in.
  const SEARCH_TOP_N = 2;
  const deepHasNothing =
    deep.state === "empty" ||
    deep.state === "unavailable" ||
    (deep.state === "ready" && (!deep.works || deep.works.length === 0));
  const searching = !!q && q.trim().length >= 2;
  const showExpander = searching && !deepHasNothing && matchCount > SEARCH_TOP_N;
  const shownIndices =
    searching && !deepHasNothing && !matchesExpanded
      ? visibleIndices.slice(0, SEARCH_TOP_N)
      : visibleIndices;
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
          {shownIndices.map((i) => {
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
          {shownIndices.map((i) => {
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
      {showExpander && (
        <button
          type="button"
          className="tower-show-more"
          aria-expanded={matchesExpanded}
          onClick={onToggleMatches}
        >
          {matchesExpanded
            ? "Show fewer"
            : `Show all ${matchCount} matching entries`}
        </button>
      )}
      {/* Pagination: 50 per page, "Load more" for the next 50. */}
      {!searching && matchCount > rowBudget && (
        <button
          type="button"
          className="tower-load-more"
          onClick={onLoadMore}
        >
          Load more — showing {Math.min(rowBudget, matchCount)} of {matchCount}
        </button>
      )}
      <DeepMentions deep={deep} go={go} />
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

// ----- Tower of Babel / deep full-text search --------------------------------
// "Mentions in texts": every work where the query appears in the full text,
// ranked by mention count, with expandable preview passages cut from the real
// file. Snippets load lazily per work so a search never downloads the corpus.
function DeepMentionRow({ work, rank, go, parsedQuery }) {
  const [open, setOpen] = useState(false);
  const [snips, setSnips] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const doc = work.doc;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !snips) getSnippets(doc, parsedQuery).then(setSnips);
  };
  const shown = snips
    ? showAll
      ? snips.snippets
      : snips.snippets.slice(0, snips.initial)
    : [];
  return (
    <div className="tower-mention">
      <button
        type="button"
        className="tower-row"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`${doc.title}, ${work.hits} mentions. ${open ? "Collapse" : "Expand"} passages.`}
      >
        <span className="tower-row-index">{String(rank).padStart(2, "0")}</span>
        <span className="tower-row-main">
          <span className="tower-row-title">{doc.title}</span>
          {(doc.creator || doc.year) && (
            <span className="tower-row-creator">
              {doc.creator}
              {doc.creator && doc.year ? " · " : ""}
              {doc.year || ""}
            </span>
          )}
        </span>
        <span className="tower-row-tags">
          <span className="tower-tag">{doc.collection}</span>
          <span className="tower-tag tower-tag-hits">
            {work.hits} {work.hits === 1 ? "mention" : "mentions"}
          </span>
        </span>
        <span className="tower-row-arrow" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="tower-snippets">
          {!snips && <p className="tower-snippets-status">Finding passages…</p>}
          {snips && snips.snippets.length === 0 && (
            <p className="tower-snippets-status">No passages found in this text.</p>
          )}
          {shown.map((s, i) => (
            <button
              key={i}
              type="button"
              className="tower-snippet"
              onClick={() => go(`/tower-of-babel/library/${doc.id}`)}
              dangerouslySetInnerHTML={{ __html: s.html }}
              aria-label={`Open ${doc.title}`}
            />
          ))}
          {snips && !showAll && snips.total > snips.initial && (
            <button
              type="button"
              className="text-link tower-snippets-more"
              onClick={() => setShowAll(true)}
            >
              Show all {snips.total} passages
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DeepMentions({ deep, go }) {
  if (deep.state === "idle" || deep.state === "unavailable") return null;
  const works = deep.works || [];
  return (
    <div className="tower-mentions">
      <div className="tower-mentions-head">
        <div className="section-index">Mentions in texts</div>
        {deep.state === "ready" && deep.totalWorks > 0 && (
          <p className="tower-mentions-sub">
            {deep.totalWorks} {deep.totalWorks === 1 ? "work" : "works"} ·{" "}
            {deep.texts.toLocaleString()} texts searched
          </p>
        )}
      </div>
      {deep.state === "loading" && works.length === 0 && (
        <p className="tower-mentions-status">Searching inside the texts…</p>
      )}
      {deep.state === "empty" && (
        <p className="tower-mentions-status">
          That word appears just about everywhere — try something more specific.
        </p>
      )}
      {(deep.state === "ready" || (deep.state === "loading" && works.length > 0)) && (
        <>
          {deep.state === "ready" && works.length === 0 ? (
            <p className="tower-mentions-status">No mentions found in any text.</p>
          ) : (
            <div className="tower-rows">
              {works.map((w, i) => (
                <DeepMentionRow
                  key={w.doc.id}
                  work={w}
                  rank={i + 1}
                  go={go}
                  parsedQuery={deep.query}
                />
              ))}
            </div>
          )}
          {deep.state === "ready" && deep.truncated && (
            <p className="tower-mentions-status">
              Showing the top {works.length} of {deep.totalWorks} — refine your
              search to narrow it.
            </p>
          )}
        </>
      )}
    </div>
  );
}
export function LibraryArtifact({ go, params, onReady }) {
  const [artifacts, catalogError, , retryArtifacts] = useArtifacts();
  // Warm the tower-files manifest chunk while the entry paints, so the
  // inline full-text section usually has it cached (see getTowerFiles above).
  // Fire-and-forget: it never blocks rendering and never changes the UI.
  useEffect(() => {
    getTowerFiles();
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
  // Analytics: the full text actually loaded and is on screen — the
  // strongest reading-intent signal the library produces.
  useEffect(() => {
    if (!text || trackedReaderOpens.has(artifactId)) return;
    trackedReaderOpens.add(artifactId);
    track("reader_opened", {
      artifact_id: artifactId,
      collection: artifact.collection,
      chars: text.length,
    });
  }, [text, artifactId]);
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
    setWin({ start: 0, end: 1 });
    chunkElsRef.current = [];
    chunkHeightsRef.current = {};
    heightsModeRef.current = null;
    setActiveMark(null);
    setShareHls([]);
    if (!canRead) return;
    // Check LRU cache first — instant on back/forward navigation.
    const cached = getCachedText(url);
    if (cached !== undefined) {
      setText(cached);
      return () => { live = false; };
    }
    fetch(url, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((t) => {
        if (live) {
          setCachedText(url, t);
          setText(t);
        }
      })
      .catch((e) => {
        if (live && e.name !== "AbortError") setTextError(true);
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
    if (!text || !shareLanding || shareLanding.done || chunkStarts.length === 0)
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
  }, [text, win, chunkStarts]);

  const stats = useMemo(() => {
    if (!text) return null;
    const words = countWords(text);
    return {
      words,
      minutes: Math.max(1, Math.round(words / 200)),
    };
  }, [text]);

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
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
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

      <section className="copy-block section reveal">
        <span className="section-index">{operator.mission.title}</span>
        <div>
          <p className="display-copy">
            <em>{operator.mission.statement}</em>
          </p>
          {operator.mission.paragraphs.map((p, i) => (
            <p className="body-copy" key={i}>{p}</p>
          ))}
        </div>
      </section>

      <section className="section reveal">
        <div className="section-index">{operator.beliefs.title}</div>
        <div className="beliefs-list">
          {operator.beliefs.items.map((b) => (
            <div className="belief-row" key={b.title}>
              <div>
                <h3>{b.title}</h3>
                <span className="belief-since">{b.since}</span>
              </div>
              <p className="body-copy">{b.text}</p>
            </div>
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

// ----- Services -----------------------------------------------------------------
// One component serves all six service detail pages. Content comes from
// src/content/services.js (slug, h1, intro, definition, included, process,
// comparison, pricing, use cases, FAQs). Rendered with the site's existing
// inner-page primitives — no new visual language.
export function ServiceDetail({ go, path }) {
  const slug = String(path || "").replace("/services/", "").split("/")[0];
  const svc = services.find((s) => s.slug === slug);
  if (!svc) {
    return (
      <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
        <section className="inner-hero section">
          <div className="section-index">404</div>
          <h1>SERVICE NOT FOUND.</h1>
          <p className="display-copy">
            That service page does not exist — but the work does.
          </p>
          <button type="button" className="text-link" onClick={() => go("/")}>
            BACK TO THE HOMEPAGE <span aria-hidden="true">↗</span>
          </button>
        </section>
      </main>
    );
  }
  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">{svc.kicker}</div>
        <h1>{svc.h1}</h1>
        <p className="display-copy">{svc.intro}</p>
      </section>

      <section className="copy-block section reveal">
        <div className="section-index">WHAT IT IS</div>
        <div>
          <p className="body-copy">{svc.definition}</p>
        </div>
      </section>

      <section className="section reveal">
        <div className="section-index">WHAT'S INCLUDED</div>
        <div className="capability-list">
          {svc.included.map((item, i) => (
            <div className="cap-row" key={item.title}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section reveal">
        <div className="section-index">HOW IT WORKS</div>
        <div className="capability-list">
          {svc.process.map((step) => (
            <div className="cap-row" key={step.num}>
              <span>{step.num}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section reveal">
        <div className="section-index">COMPARISON</div>
        <h2 className="svc-h2">{svc.comparison.title}</h2>
        <div className="svc-table-wrap">
          <table className="svc-table">
            <thead>
              <tr>
                {svc.comparison.headers.map((h, i) => (
                  <th key={i} scope="col">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {svc.comparison.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) =>
                    j === 0 ? (
                      <th key={j} scope="row">{cell}</th>
                    ) : (
                      <td key={j}>{cell}</td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="copy-block section reveal">
        <div className="section-index">PRICING</div>
        <div>
          <h2 className="svc-h2">{svc.pricing.title}</h2>
          <p className="body-copy">{svc.pricing.body}</p>
          <p className="body-copy svc-note">{svc.pricing.note}</p>
        </div>
      </section>

      <section className="section reveal">
        <div className="section-index">USE CASES</div>
        <div className="capability-list">
          {svc.useCases.map((u, i) => (
            <div className="cap-row" key={u.title}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <h3>{u.title}</h3>
              <p>{u.text}</p>
            </div>
          ))}
        </div>
      </section>

      <FaqBlock index="QUESTIONS" faqs={svc.faqs} />

      <section className="section">
        <p className="svc-updated">Updated {svc.updated}.</p>
      </section>
    </main>
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
  return (
    <main className="page-shell inner-page tower-light" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">FOR AI AGENTS</div>
        <h1>{api.h1}</h1>
        <p className="display-copy">{api.intro}</p>
      </section>

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
