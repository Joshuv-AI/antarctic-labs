// Destination page shells for the unified Antarctic Labs routes.
// Each shell renders copy from the corresponding src/content/*.js
// module and reuses the existing CSS grammar (.page-shell,
// .inner-hero, .section, .section-index, .copy-block, .display-copy,
// .body-copy, .text-link, .cap-row).
//
// Visual language is intentionally not redesigned here — these shells
// use the same classes the existing Home page already uses, so the
// destinations already share the home-page visual grammar.
import { useState, useEffect, useLayoutEffect, useMemo, useDeferredValue, useRef, useCallback, memo, Fragment } from "react";
import { searchDeep, getSnippets } from "./lib/deep-search.js";
import {
  beginEntryFlight,
  getEntryFlight,
  markEntryFlightNavigated,
  ENTRY_FLIGHT_MIN_MS,
  ENTRY_FLIGHT_CAP_MS,
} from "./lib/entry-flight.js";
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
import { privacyFaqs } from "./content/faq.js";
// The artifact catalog is lazy (see ./lib/catalog.js): it is ~2.6MB of
// source and used to ride in the main bundle, stalling every cold load.
// Components that need it use useArtifacts() below.
import {
  loadBootstrap,
  requestCatalogIndex,
  startCatalogBrowse,
  resumeCatalogBrowse,
  isBrowseComplete,
  isBrowseStreaming,
  getBrowseStallAgeMs,
  restartStalledBrowse,
  getCachedArtifacts,
  getFullArtifact,
  getDescription,
  getCover,
  onIndexReady,
  isIndexLoading,
  getBrowseOrders,
  browseOrdersPending,
  onBrowseOrdersSettled,
  ensureBrowseOrders,
  getBrowseTotalHint,
  isCatalogPending,
  CatalogIdIndex,
  tcb1Meta,
  noteExternalBytes,
  initScopeMode,
  isScopeMode,
  ensureFacetScope,
  ensureIndicesScope,
  ensureBrowseRows,
  getScopeStatus,
  onScopeChange,
  getScopeSnapshot,
  bumpScopePriority,
  ordinalsFromBitset,
} from "./lib/catalog.js";
// Two-level browse taxonomy for the library filter (revamp 2026-10-17):
// top-level lanes + subcategories derived from the artifact_id prefix.
// Pure module, no dependencies — see ./lib/tower-taxonomy.js.
import {
  TOWER_TOP_LABELS,
  TOWER_SUBS,
  TOWER_ERAS,
  TOWER_CLIENT_ONLY_SUB_LANES,
  towerBucketKey,
  towerBucketKeyForParts,
  towerEraCode,
  towerEraLabel,
  towerSubLabel,
  TOWER_CLIENT_ONLY_SUB_KEYS,
} from "./lib/tower-taxonomy.js";
// Collections browser (2026-10-24): the old hub pages were deleted and
// folded into a filter on this section's entry list. The hub index JSON
// is fetched lazily (see below) — never in the initial page load.
import {
  COLLECTION_GROUPS,
  loadHubsIndex,
  buildCollections,
  loadCuratedBitsets,
} from "./lib/tower-collections.js";
// Browse filter engine (2026-11-11 perf fix, FILTER-REVAMP-DESIGN.md
// §10): chunked, latest-wins filter computation over typed arrays —
// replaces the per-render full-catalog walks in the rank memo below.
import {
  createBucketCodeTable,
  extendBucketCodes,
  bucketMaskFor,
  buildMembershipBitset,
  startFilterScan,
  createBitsetRebaser,
  rebaseBitset,
} from "./lib/filter-engine.js";
import { getTowerKernels } from "./lib/tower-kernels.js";
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
} from "./lib/tower-shelves.js";
// The build-time manifest of hosted tower texts (2.4MB at current scale)
// is NOT statically imported: it would ride inside the lazy pages chunk and
// make every page pay for it. It loads as its own chunk, on demand, only on
// Server-search mode flag (Phase B): ?server=0 opts out (persisted to
// localStorage) and restores the full client pipeline; ?server=1 clears
// the opt-out. Shared by the library section and the entry pages, which
// must agree on which pipeline owns the catalog. Reading it applies the
// URL param's persistence side effects, exactly as the original inline
// initializer did.
function towerServerMode() {
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get("server") === "0") {
      localStorage.setItem("tower-server-search", "0");
      return false;
    }
    if (p.get("server") === "1") {
      localStorage.removeItem("tower-server-search");
      return true;
    }
    return localStorage.getItem("tower-server-search") !== "0";
  } catch {
    return true;
  }
}

// Hub seed (2026-11-11 phone load fix): the header counts need only
// two fields from tower-hubs-index.json — `total` and the
// per-collection counts — and the file opens with exactly those. The
// full document is ~14 MB of hub data (wanted works, traditions,
// author hubs); fetching and JSON-parsing all of it on a phone whose
// main thread is already saturated by the catalog stream delayed the
// seed past the point where the stacks had shown partial counts
// (Joshua's video: "Law: 0 works" for ~11 s). Read the response
// stream only until the collections object closes, parse just that
// prefix, and cancel the rest; any failure falls back to the full
// parse, so the seed is exactly the file's own truth either way.
function extractHubSeed(text) {
  const ci = text.indexOf('"collections"');
  if (ci < 0) return null;
  const open = text.indexOf("{", ci);
  if (open < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return null;
  let collections;
  try {
    collections = JSON.parse(text.slice(open, end + 1));
  } catch {
    return null;
  }
  if (!collections || typeof collections !== "object") return null;
  for (const k of Object.keys(collections)) {
    if (typeof collections[k] !== "number") return null;
  }
  const tm = /"total"\s*:\s*(\d+)/.exec(text.slice(0, ci));
  return { total: tm ? Number(tm[1]) : null, collections };
}

async function fetchHubSeed() {
  const res = await fetch("/tower-hubs-index.json");
  if (!res.ok) return null;
  const fromDoc = (b) =>
    b && typeof b === "object"
      ? {
          total: typeof b.total === "number" ? b.total : null,
          collections:
            b.collections && typeof b.collections === "object"
              ? b.collections
              : null,
        }
      : null;
  if (res.body && typeof res.body.getReader === "function") {
    const fallback = res.clone();
    try {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let text = "";
      for (let n = 0; n < 128 && text.length < 1048576; n++) {
        const { done, value } = await reader.read();
        if (value) text += dec.decode(value, { stream: !done });
        const seed = extractHubSeed(text);
        if (seed) {
          try { reader.cancel(); } catch {}
          try { fallback.body.cancel(); } catch {}
          return seed;
        }
        if (done) break;
      }
    } catch {
      // fall through to the full parse
    }
    return fromDoc(await fallback.json().catch(() => null));
  }
  return fromDoc(await res.json().catch(() => null));
}

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
import BookReader from "./components/BookReader.jsx";
import { createPortal } from "react-dom";
// The Tower landing's dark hero band background (helix of covers,
// Phase 2 2026-11-12). Self-contained and failure-proof: lazy scene,
// shielded, ?bg=0 kill switch — see components/HelixCanvas.jsx.
import HelixCanvas from "./components/HelixCanvas.jsx";
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
// Entry-open preload (2026-11-16, INVENTORY 37): at result-click time,
// while the cover flight is on screen, fetch the entry's text and land
// the COMPLETE text in the reader's LRU cache — when the reader mounts
// it paints the whole text at once (its cache check runs before its
// fetch effect) instead of streaming in behind a spinner. Mirrors
// LibraryFullText's URL derivation (the record's own download_url,
// else the pure id-derived local path for AVAILABLE entries) and its
// HTML-shell rejection (a .txt answered with the SPA shell is an
// error, never the book). Any failure resolves false; the flight's
// gate then falls back to its cap and the reader fetches for itself,
// exactly as it did before the flight existed.
function preloadEntryText(a, signal) {
  if (!a) return Promise.resolve(false);
  const url =
    a.download_url ||
    (a.download_status === "AVAILABLE" && a.artifact_id
      ? `/tower-of-babel/${a.artifact_id}.txt`
      : undefined);
  if (!url) return Promise.resolve(false);
  if (getCachedText(url) !== undefined) return Promise.resolve(true);
  return fetch(url, { signal })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ctype = (r.headers.get("content-type") || "").toLowerCase();
      if (ctype.includes("text/html"))
        throw new Error("unexpected HTML response");
      const t = await r.text();
      const head = t.replace(/^\s+/, "").slice(0, 16).toLowerCase();
      if (head.startsWith("<!doctype") || head.startsWith("<html"))
        throw new Error("unexpected HTML response");
      setCachedText(url, t);
      return true;
    })
    .catch(() => false);
}
// ----- Tower of Babel ------------------------------------------------------
export function TowerOfBabel({ go, onReady }) {
  // The combined Tower page: landing content + full library section below.
  // The library section manages its own catalog loading and reports ready
  // via onReady once the first 50 rows paint.
  // Helix navigation binding (Ship 2, 2026-11-12): one ref carries the
  // scene bridge ({ setDisplay, setSettled }) from HelixCanvas to the
  // library section, whose search/filter state drives the background.
  const helixApiRef = useRef(null);
  return (
    <main className="page-shell inner-page tower-light tower-combined" id="main-content" tabIndex={-1}>
      <section className="inner-hero section tower-landing-hero tower-helix-band">
        {/* Helix background (2026-11-12): a fixed full-page backdrop
            for the whole Tower page (Joshua's full-page extension) —
            HelixCanvas renders the fixed canvas layer plus the
            hero-confined labels layer; then a soft shade for hero
            text contrast, then the content itself. The library below
            scrolls over the same black space. */}
        <HelixCanvas apiRef={helixApiRef} />
        <div className="tower-helix-shade" aria-hidden="true" />
        {/* Center block (Amendments O/P): the title sits centered in
            the bore of the top-down poster frame, with the library
            total beneath it — mirroring the reel's overhead frame.
            The intro paragraph that used to sit under the title was
            removed 2026-11-12 (Joshua): the title + total carry the
            hero now. The total string matches the stats panel's
            verified live count. */}
        <h1>{towerOfBabel.heading}</h1>
        <p className="tower-helix-total">2,557,923 texts</p>
      </section>

      {/* About the project — removed 2026-11-11 (Joshua): the project
          story now lives on the homepage as the featured-project
          section; the landing goes straight from the intro to the
          library. The towerOfBabel.project / catalogNote copy is
          retired with it. */}

      {/* The full library, poured directly below the landing content.
          Collections live inside the library browse section below as a
          filter on the same entry list — there is no separate hub page. */}
      <TowerLibrarySection go={go} onReady={onReady} helixApiRef={helixApiRef} />
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
// Differential fix (2026-11-12, audit F4): the watchdog used to fire
// at 15 s even while the bootstrap fetch was verifiably still in
// flight — on a contended cellular link (boot prefetch + bundle +
// fonts + the 5.3 MB bootstrap sharing one pipe) the fetch routinely
// needs longer, so healthy first loads were being forced into the
// error state and only a reload (warm caches) populated the page.
// While isCatalogPending() reports the fetch in flight, the watchdog
// re-checks on a short cadence instead of forcing the error; the
// fetch's own 30 s abort + retry still bounds the total wait.
const CATALOG_WATCHDOG_MS = 15000;
const CATALOG_WATCHDOG_RECHECK_MS = 3000;
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
    } else if (state.artifacts && (!state.fullIndexReady || isScopeMode())) {
      // Bootstrap is showing; upgrade as the index arrives (whenever an
      // intent trigger or the idle schedule starts it). Stage 2 publishes
      // progressively: artifacts grows chunk by chunk, and fullIndexReady
      // flips only on the final (complete) publish. Scope mode
      // (2026-11-20) keeps the subscription for the component's life:
      // its settled (complete) publishes are per-scope-load, and later
      // scope appends must keep reaching the section after any of them.
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
    let t = null;
    let cancelled = false;
    const arm = (delay) => {
      t = setTimeout(() => {
        if (cancelled) return;
        // A bootstrap fetch verifiably in flight outranks the
        // watchdog (audit F4): re-check shortly rather than forcing
        // the error UI over a load that is still arriving.
        if (isCatalogPending()) {
          arm(CATALOG_WATCHDOG_RECHECK_MS);
          return;
        }
        setWatchdogError(true);
      }, delay);
    };
    arm(CATALOG_WATCHDOG_MS);
    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
    };
  }, [state.artifacts, state.error, retrySeq]);
  // Automatic recovery (2026-11-13 load-window fix; self-heal gating
  // 2026-11-18): a bootstrap fetch that fails transiently (a 504
  // burst, a stalled connection) used to leave the manual-retry error
  // screen as the only way back — a session that hit it sat on that
  // screen (or, before the watchdog, on the skeleton branch) until
  // the visitor happened to reload. Retry on a bounded backoff while
  // the error state persists; a success clears the error through the
  // normal path.
  //
  // 2026-11-18: the 2026-11-13 retry existed but the error SCREEN
  // rendered the instant the first attempt failed — Joshua's
  // recording shows the error page up within ~2 s of a refresh on a
  // healthy 5G connection, with the recovery still pending behind
  // it, so in practice the visitor's own refresh was the recovery.
  // The hook now separates the failure SIGNAL from the failure UI:
  // `error` (returned below) stays false while automatic recovery is
  // still in budget, so the section holds its loading branch — the
  // page shell at final geometry — and the catalog simply arrives
  // late. The error UI surfaces only when the whole budget is spent
  // (five retries over ~54 s plus their fetch time), i.e. a genuine
  // persistent failure. A manual retry resets the budget.
  const AUTO_RETRY_DELAYS_MS = [1500, 3500, 7000, 14000, 28000];
  const autoRetryRef = useRef(0);
  const [recoveryExhausted, setRecoveryExhausted] = useState(false);
  useEffect(() => {
    if (state.artifacts) {
      autoRetryRef.current = 0;
      setRecoveryExhausted(false);
      return;
    }
    if (!state.error && !watchdogError) return;
    if (autoRetryRef.current >= AUTO_RETRY_DELAYS_MS.length) {
      setRecoveryExhausted(true);
      return;
    }
    const t = setTimeout(() => {
      autoRetryRef.current += 1;
      retry();
    }, AUTO_RETRY_DELAYS_MS[autoRetryRef.current]);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.error, watchdogError, state.artifacts, retrySeq]);
  // A connection that comes back on its own (radio handover, tunnel,
  // captive portal release) fires `online` — spend a retry on it
  // immediately instead of waiting out the backoff.
  useEffect(() => {
    if (!state.error && !watchdogError) return;
    if (state.artifacts || recoveryExhausted) return;
    const onOnline = () => {
      autoRetryRef.current += 1;
      retry();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.error, watchdogError, state.artifacts, recoveryExhausted]);
  const retry = () => {
    setWatchdogError(false);
    // A late success may have populated the module cache since the failure.
    setState((s) => ({ ...s, artifacts: getCachedArtifacts(), error: false }));
    setRetrySeq((n) => n + 1);
  };
  const retryManual = () => {
    autoRetryRef.current = 0;
    setRecoveryExhausted(false);
    retry();
  };
  return [
    state.artifacts,
    (state.error || watchdogError) && recoveryExhausted,
    state.fullIndexReady,
    retryManual,
  ];
}

// Shared catalog-failed UI: the loader failsafe guarantees the overlay
// dismisses, so a failed fetch must never leave a blank page. Plain,
// on-brand, with a manual retry. The retry re-runs the fetch in place —
// fetch failures are not cached anywhere, so this is a full fresh attempt
// without a page reload (a late-arriving response resolves it instantly).
// Since 2026-11-18 this renders ONLY after the automatic recovery
// budget is spent (see useArtifacts): a transient failure heals behind
// the loading branch and never reaches this screen. The copy no longer
// blames the visitor's connection — the failures that land here after
// ~a minute of retries are at least as likely to be ours.
function TowerCatalogError({ onRetry }) {
  return (
    <main className="page-shell inner-page tower-light" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <h1>THE LIBRARY</h1>
        <p className="body-copy">
          The catalog couldn't be loaded. Try again.
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
// Phase-0 incremental cache (2026-11-10 load-speed pack, step 3):
// the browse stream publishes a growing prefix of one catalog order
// every ~2.5 s, and deriveTowerData's phase 0 (collection counts,
// bucket keys, id index) used to rescan the whole resident array on
// every publish — quadratic total work across a full load (~150M
// record visits at 2.5M records). When the incoming array provably
// extends the cached one (same length-1 boundary record, checked
// below), phase 0 now only processes the new tail. Both progressive
// publishers (the server browse stream and the client-index chunk
// loader) emit growing prefixes of the same catalog order, so the
// extension case is the norm while loading; anything else falls back
// to the full build. The id index Map is shared and only ever gains
// entries, which its consumers (read-only lookups) tolerate.
let phase0Cache = null; // { len, lastId, forArray, counts, subCounts, bucketKeys, eraCodes, eraCounts, bucketEraCounts, idIndex }
// Canonical bucket-key strings for phase 0 (see deriveTowerData).
const bucketKeyCanon = new Map();
function canonBucketKey(bk) {
  const hit = bucketKeyCanon.get(bk);
  if (hit !== undefined) return hit;
  bucketKeyCanon.set(bk, bk);
  return bk;
}

// Memory discipline (stability, 2026-10-28 — Joshua's phone crash video):
// the catalog's derived search data roughly doubles the parsed catalog's
// footprint, and on iOS that total crosses the tab's jetsam limit — the
// page loads fully, then the system kills it and it reloads, in a loop.
// Devices with a hard memory ceiling (iPhones/iPads, low deviceMemory)
// skip the did-you-mean vocabulary entirely (it is read only by the typo
// stage, which already guards on null); everywhere else the vocabulary
// is capped so its size is bounded no matter how large the catalog gets.
const LOW_MEMORY_ENV = (() => {
  try {
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/.test(ua)) return true;
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
    if (navigator.deviceMemory && navigator.deviceMemory <= 4) return true;
  } catch {}
  return false;
})();
const VOCAB_CAP = 500000;

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
  // The did-you-mean vocabulary is NOT built here anymore (2026-10-29
  // load-speed fix): profiling the real 600k catalog showed the vocab
  // pass was ~69% of this function's CPU (87s -> 27s on the bench VM
  // without it), yet its only consumer is typo correction on
  // near-zero-result queries. It is built afterwards from the stored
  // norm arrays by buildVocab (deriveTowerData phase 3) and published
  // when ready; until then towerData.vocab is null, which the search
  // pipeline already treats as "no corrections" (the same state
  // low-memory devices run in permanently).
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
      secMasks[i] = secondaryMaskFor(T);
      volFlags[i] = /\b(vol|volume|part) \d+/.test(T) ? 1 : 0;
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  return { haystacks, normTitles, normCreators, normColls, normDescs, secMasks, volFlags, vocab: null };
}

// Phase 2 as a standalone step (extracted 2026-11-10): the four sort
// orders go through the same chunked merge sort, so none of them is a
// single blocking task (the creator sort used to be one synchronous
// Array.sort over the whole catalog). Their memory is modest (typed
// index arrays), unlike phase 1's string arrays — which is why the
// deferred-search path below can build orders at stream completion
// while postponing the search data itself.
async function buildSortOrders(artifacts, isCancelled) {
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
  return {
    "title-asc": titleOrder,
    "title-desc": titleOrder.slice().reverse(),
    "creator-asc": creatorOrder,
    "year-desc": yearDesc,
    "year-asc": yearAsc,
  };
}

// Did-you-mean vocabulary (Workstream D, SPEC-6): token -> frequency over
// the SHORT fields only (title/creator/collection), built from the norm
// arrays buildSearchData already computed — no re-normalization. Deferred
// out of the search-ready path (see buildSearchData): at 600k works the
// map work was ~69% of phase-1 CPU. Chunked with the same yield cadence
// as the other builders. Insertion order matches the old inline build
// exactly (title, creator, collection per record), so the VOCAB_CAP cut
// keeps the identical token set — verified equivalent on the full
// catalog (500,000 entries, zero mismatches). Skipped on low-memory
// devices, as before.
async function buildVocab(normTitles, normCreators, normColls, isCancelled) {
  if (LOW_MEMORY_ENV) return null;
  const vocab = new Map();
  const vocabAdd = (field) => {
    if (!field) return;
    for (const t of field.split(" ")) {
      if (!t) continue;
      const c = vocab.get(t);
      if (c !== undefined) vocab.set(t, c + 1);
      else if (vocab.size < VOCAB_CAP) vocab.set(t, 1);
    }
  };
  const n = normTitles.length;
  for (let from = 0; from < n; from += 20000) {
    if (isCancelled()) return null;
    const end = Math.min(from + 20000, n);
    for (let i = from; i < end; i++) {
      vocabAdd(normTitles[i]);
      vocabAdd(normCreators[i]);
      vocabAdd(normColls[i]);
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  return vocab;
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
// keystroke could be answered. A detached phase 3 then builds the
// did-you-mean vocabulary in the background (2026-10-29: it was ~69% of
// phase-1 CPU) and publishes it through onPhase when ready. Resolves to
// the final towerData object (vocab may still be null on it), or null
// if cancelled/superseded before finishing.
async function deriveTowerData(artifacts, isCancelled, onPhase, opts = {}) {
  // A cached object for this exact array is final — unless it is a
  // deferred-search object (below) and this call wants the search
  // layer built onto it (the upgrade path).
  if (towerDataCache && towerDataFor === artifacts) {
    const cached = towerDataCache;
    if (cached.haystacks || opts.browseOnly) return cached;
    if (opts.deferSearch) {
      if (cached.order) return cached;
      // Deferred object still waiting on its sort orders: attach the
      // baked orders when they have landed; keep waiting while they
      // are in flight; otherwise fall through and build them locally
      // in the deferred branch below (older catalog / failed fetch).
      const baked = getBrowseOrders();
      if (baked) {
        const data = { ...cached, order: baked };
        towerDataCache = data;
        return data;
      }
      if (browseOrdersPending()) return cached;
    }
  }
  // Phase 0, incremental when the array extends the cached prefix
  // (see phase0Cache above): the count maps are copied (small), the
  // bucket-key array is copied and extended, the id index is shared
  // and gains only the tail's entries; the loops below then run over
  // [phase0From, artifacts.length) instead of the whole array.
  const prev0 = phase0Cache;
  const extendsPrev =
    prev0 && prev0.len > 0 && artifacts.length > prev0.len &&
    artifacts[prev0.len - 1] &&
    artifacts[prev0.len - 1].artifact_id === prev0.lastId;
  // Same-array fast path (RC-2b, 2026-11-14): an option-only restart
  // (baked orders settling, trailing coverage bump) re-derives over
  // the identical array object this cache was built from. Phase 0 is
  // deterministic for that array, so reuse the cached maps wholesale
  // (phase0From lands at the array's end; the passes below no-op)
  // instead of paying a full recompute + CatalogIdIndex rebuild over
  // an unchanged catalog. Any new array identity misses and takes
  // the existing paths unchanged.
  const sameArray0 =
    !!prev0 && prev0.forArray === artifacts && prev0.len === artifacts.length;
  const reusePrev = extendsPrev || sameArray0;
  const counts = reusePrev ? { ...prev0.counts } : {};
  const subCounts = reusePrev ? { ...prev0.subCounts } : {};
  const bucketKeys = reusePrev ? prev0.bucketKeys.slice() : new Array(artifacts.length);
  bucketKeys.length = artifacts.length;
  // Era axis (filter revamp 2026-11-11): one era code per record
  // (Uint8Array, ~2.6 MB at full catalog — bounded, typed, no strings),
  // era totals, and bucket×era intersection counts, all computed in
  // the same sliced phase-0 pass below. The intersections are what let
  // the results memo answer any bucket+era result count in O(1)
  // instead of re-scanning the catalog on every filter change (the
  // old selection delay). Lane-level intersections are accumulated
  // alongside sub-level ones so a lane filter + era also resolves.
  const eraCounts = reusePrev ? { ...prev0.eraCounts } : {};
  const bucketEraCounts = reusePrev ? { ...prev0.bucketEraCounts } : {};
  let eraCodes;
  if (reusePrev && prev0.eraCodes) {
    eraCodes = new Uint8Array(artifacts.length);
    eraCodes.set(prev0.eraCodes);
  } else {
    eraCodes = new Uint8Array(artifacts.length);
  }
  // Id index (2026-11-10 columnar pass): an open-addressing hash table
  // over Uint32 slots (~33 MB at full catalog) replaces the 2.56M-entry
  // Map (~150-250 MB with its key table) — same .get(id) contract for
  // every consumer (shelves, pins, deep-merge), same last-wins
  // duplicate semantics, extended incrementally over the growing
  // prefix exactly like the Map fill it replaces.
  // Byte mode when the artifacts are the columnar catalog view: the
  // index's probes compare the stored id bytes instead of decoding an
  // id per probe step (the 2026-11-11 smoothness profile put
  // decode-per-probe at ~46% of the stream's main-thread time). Plain
  // arrays (the client-index fallback) keep string mode. Sized from
  // the browse stream's known total when there is one, so the table
  // reaches its final size in one allocation and never rehashes
  // mid-stream; the fallback sizing still bounds growth to a few
  // doublings from the current prefix.
  const columnBytesAt =
    !extendsPrev &&
    artifacts &&
    typeof artifacts.__columnBytesAt === "function"
      ? artifacts.__columnBytesAt
      : null;
  let idIndex = reusePrev
    ? prev0.idIndex
    : new CatalogIdIndex(
        null,
        getBrowseTotalHint() || artifacts.length * 4,
        columnBytesAt
      );
  // Mode upgrade (2026-11-11 phone load fix): the phase-0 cache is
  // seeded by the bootstrap-era derivation, whose artifacts are a
  // plain array — so the inherited id index is in STRING mode and
  // every tail sync decodes each record's id (and every consumer
  // probe decodes per step). When the resident artifacts are the
  // columnar view, swap in a byte-mode index over the same store:
  // the sliced sync below rebuilds it from the stored id bytes
  // (builtLen restarts at 0) with no decodes, and all later tail
  // syncs and probes stay on the byte path. One swap per stream,
  // at the first streamed publish, when the prefix is still small.
  if (
    extendsPrev &&
    !idIndex._byteMode &&
    artifacts &&
    typeof artifacts.__columnBytesAt === "function"
  ) {
    idIndex = new CatalogIdIndex(
      null,
      getBrowseTotalHint() || artifacts.length * 4,
      artifacts.__columnBytesAt
    );
  }
  const phase0From = sameArray0 ? artifacts.length : extendsPrev ? prev0.len : 0;
  // Two-level browse taxonomy (filter revamp 2026-10-17): one bucket key per
  // record ("COLLECTION" or "COLLECTION:sub"), aligned with artifacts like
  // haystacks. Subcategory partitions are exact — the union of a lane's
  // sub-buckets is the lane itself — so the top-level filter result set is
  // identical to the old collection filter (see parity-test.mjs).
  // Columnar fast paths: classify from the id prefix read off the
  // stored bytes (the view's hook) instead of decoding every tail
  // record's id for towerBucketKey's prefix regex — same rule table
  // (towerBucketKeyForParts delegates to it), same fallback chain —
  // and read the collection straight from the store's dictionary via
  // the view's __columnCollectionAt hook, so a tail record is never
  // materialized just to count and classify it.
  const idPrefixAt =
    artifacts && typeof artifacts.__columnIdPrefixAt === "function"
      ? artifacts.__columnIdPrefixAt
      : null;
  const collAt =
    artifacts && typeof artifacts.__columnCollectionAt === "function"
      ? artifacts.__columnCollectionAt
      : null;
  const yearAt =
    artifacts && typeof artifacts.__columnYearAt === "function"
      ? artifacts.__columnYearAt
      : null;
  // Time-sliced (2026-11-11 phone load fix): this tail pass used to
  // run synchronously to completion on every publish — at phone speed
  // a >50 ms main-thread task per publish, stacked on the stream's own
  // appends, and a direct contributor to the scroll tearing in
  // Joshua's video. The pass now works in ~6 ms slices with a
  // macrotask yield between them (cancellation checked per slice);
  // counts, subCounts and bucketKeys come out identical, just spread
  // across frames. Bucket keys repeat massively (a few hundred
  // distinct values over millions of records) — canonical instances
  // keep the array at pointer width instead of pinning a separate
  // string per record.
  const PHASE0_SLICE_MS = 6;
  let pi = phase0From;
  while (pi < artifacts.length) {
    const t0 = performance.now();
    for (; pi < artifacts.length; pi++) {
      const col = (collAt ? collAt(pi) : artifacts[pi].collection) || "OTHER";
      counts[col] = (counts[col] || 0) + 1;
      const bk = canonBucketKey(
        (idPrefixAt
          ? towerBucketKeyForParts(col, idPrefixAt(pi))
          : towerBucketKey(artifacts[pi])) || col
      );
      bucketKeys[pi] = bk;
      subCounts[bk] = (subCounts[bk] || 0) + 1;
      const ec = towerEraCode(yearAt ? yearAt(pi) : artifacts[pi].year);
      eraCodes[pi] = ec;
      if (ec) {
        const eid = TOWER_ERAS[ec - 1].id;
        eraCounts[eid] = (eraCounts[eid] || 0) + 1;
        const bek = bk + "|" + eid;
        bucketEraCounts[bek] = (bucketEraCounts[bek] || 0) + 1;
        const ci = bk.indexOf(":");
        if (ci > 0) {
          const lek = bk.slice(0, ci) + "|" + eid;
          bucketEraCounts[lek] = (bucketEraCounts[lek] || 0) + 1;
        }
      }
      if ((pi & 1023) === 1023 && performance.now() - t0 >= PHASE0_SLICE_MS) {
        pi++;
        break;
      }
    }
    if (pi < artifacts.length) {
      if (isCancelled()) return null;
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  // artifact_id -> index, for resolving curated search pins (built once
  // here so a keystroke never pays for it). syncSmart extends the table
  // over [builtLen, artifacts.length) — the same tail the phase-0
  // pass above processes on an extension — from stored bytes in byte
  // mode (no record materializes), by id string otherwise. Sliced
  // like the pass above: at most 8192 new entries per task.
  while (idIndex.builtLen < artifacts.length) {
    idIndex.syncSmart(artifacts, 8192);
    if (idIndex.builtLen < artifacts.length) {
      if (isCancelled()) return null;
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (artifacts.length) {
    phase0Cache = {
      len: artifacts.length,
      lastId: artifacts[artifacts.length - 1].artifact_id,
      forArray: artifacts,
      counts,
      subCounts,
      bucketKeys,
      eraCodes,
      eraCounts,
      bucketEraCounts,
      idIndex,
    };
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
  const phase0 = {
    counts,
    subCounts,
    bucketKeys,
    eraCodes,
    eraCounts,
    bucketEraCounts,
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
  };
  if (onPhase) onPhase(phase0);
  if (opts.browseOnly) {
    // Partial (progressive) publish: phase 0 is all a partial array gets.
    // The expensive phases (search data, sort orders) run exactly once,
    // on the complete array — restarting them per chunk publish churned
    // memory (aborted half-built structures + garbage peaks) and was a
    // direct contributor to the mobile crash-reload loop (2026-10-28).
    return phase0;
  }
  // Deferred search layer (2026-11-10 mobile crash fix): in server
  // mode the local search data (phase 1 — five full-length string
  // arrays) is only ever used by hub filters and the strict path;
  // plain queries are answered by the server. Building it the moment
  // the browse stream completed stacked the load's largest memory
  // spike on top of the peak resident set and jetsam-killed phone
  // tabs right at the finish — measured at full scale in desktop
  // Chrome: ~2.05 GB heap when the counter completed, a ~2.67 GB
  // peak during the indexing phase, ~2.0 GB steady afterwards.
  // Server mode therefore attaches the publish-time baked sort
  // orders at completion (or publishes without them while they are
  // still downloading — building them on-device was the completion
  // spike measured in the stub isolation run); phase 1 and the
  // vocabulary build later, on the first hub-filter/strict need,
  // through the upgrade path below. Client mode (and the
  // search-failure fallback, which flips server mode off) never
  // defers — the layer is its search.
  const cachedFull = towerDataCache && towerDataFor === artifacts ? towerDataCache : null;
  if (opts.deferSearch && (!cachedFull || !cachedFull.order)) {
    // Sort orders (2026-11-10 completion-spike fix): baked at publish
    // time and fetched in parallel with the stream — attach them.
    // While they are still in flight, publish phase 0 with no order
    // (the list browses in catalog order; the orders-ready tick
    // re-runs this derivation and the sort snaps in). Only a catalog
    // whose metadata predates the baked orders, or a failed orders
    // fetch, builds them on-device as before.
    const baked = getBrowseOrders();
    if (baked) {
      const data = { ...(cachedFull || phase0), order: baked };
      towerDataCache = data;
      towerDataFor = artifacts;
      return data;
    }
    if (browseOrdersPending()) {
      const data = { ...(cachedFull || phase0), order: null };
      towerDataCache = data;
      towerDataFor = artifacts;
      return data;
    }
    const order = await buildSortOrders(artifacts, isCancelled);
    if (!order || isCancelled()) return null;
    const data = { ...(cachedFull || phase0), order };
    towerDataCache = data;
    towerDataFor = artifacts;
    return data;
  }
  const search = await buildSearchData(artifacts, bucketKeys, isCancelled);
  if (!search || isCancelled()) return null;
  // Upgrade path: a deferred object cached for this same array
  // already carries phase 0 and the sort orders — reuse them (its id
  // index in particular must not be rebuilt alongside the old one).
  const up = cachedFull && !cachedFull.haystacks ? cachedFull : null;
  const base = {
    ...search,
    idIndex: up ? up.idIndex : idIndex,
    counts: up ? up.counts : counts,
    subCounts: up ? up.subCounts : subCounts,
    bucketKeys: up ? up.bucketKeys : bucketKeys,
    eraCodes: up ? up.eraCodes : eraCodes,
    eraCounts: up ? up.eraCounts : eraCounts,
    bucketEraCounts: up ? up.bucketEraCounts : bucketEraCounts,
    collections: up ? up.collections : collections,
    order: up ? up.order : null,
  };
  if (onPhase) onPhase(base);
  if (!base.order) {
    // Baked orders serve the upgrade path too when they are on hand.
    base.order = getBrowseOrders();
  }
  if (!base.order) {
    const order = await buildSortOrders(artifacts, isCancelled);
    if (!order || isCancelled()) return null;
    base.order = order;
  }
  const data = { ...base };
  towerDataCache = data;
  towerDataFor = artifacts;
  // Phase 3 (detached background): the did-you-mean vocabulary, built
  // from phase 1's norm arrays and published through onPhase when it
  // lands. Deliberately NOT awaited — the returned object (sort orders
  // included) must reach the page without waiting on it. Until it lands,
  // typo correction is simply off, the same state low-memory devices
  // run in. The cache is upgraded in place so later derivations for
  // this catalog pick the vocab up.
  buildVocab(data.normTitles, data.normCreators, data.normColls, isCancelled).then(
    (vocab) => {
      if (!vocab || isCancelled()) return;
      const withVocab = { ...data, vocab };
      if (towerDataFor === artifacts) towerDataCache = withVocab;
      if (onPhase) onPhase(withVocab);
    },
    () => {}
  );
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
// While the catalog streams in, committed browse results rebuild at
// most once per this cadence for a length-only change (design §11.4).
const STREAM_RESCAN_MS = 2000;

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
function TowerBookCard({ a, go, wide = false, onOpen }) {
  if (!a) return null;
  const entryPath = `/tower-of-babel/library/${a.artifact_id}`;
  // Entry-open flight (2026-11-16): when the library section supplies
  // onOpen, the click starts the cover flight instead of navigating
  // bare; everywhere else (retained discovery rails) go() is unchanged.
  const open = onOpen
    ? (e) => onOpen(a, entryPath, e)
    : () => go(entryPath);
  return (
    <div className={`tower-book-card${wide ? " is-wide" : ""}`}>
      <button
        type="button"
        className="tower-book-coverbtn"
        onClick={open}
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
        onClick={open}
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
                style={{ "--tone": g.tone }}
                onClick={() => go(`/tower-of-babel/library/${w.id}`)}
              >
                <span className="trad-tile-name">{w.label}</span>
                <span className="trad-tile-sub">{w.sub}</span>
                <span className="trad-tile-cta" aria-hidden="true">Read ›</span>
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
      if (!a || used.has(a.artifact_id) || works.length >= 10) return;
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
        if (works.length >= 10) break;
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
                style={{ "--tone": g.tone }}
                onClick={() => go(`/tower-of-babel/library/${a.artifact_id}`)}
              >
                <span className="trad-tile-name">{label}</span>
                {sub && <span className="trad-tile-sub">{sub}</span>}
                <span className="trad-tile-cta" aria-hidden="true">Read ›</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const EMPTY_FACES = [null, null, null];
// One "Browse the stacks" card (2026-11-11 presentation-stability
// fix). Memoized: the collage re-renders only when a face slot locks
// (the faces array identity changes) — the catalog publishes that
// stream past during the load never touch the covers again. The three
// face slots always render, locked or not: an unresolved slot is the
// bare .stack-face spine (fixed geometry), so the card's box can
// never change size as covers arrive. A sub-bucket count of null is
// the held state (derivation not final): a steady dash, same line
// box, no ticking numbers.
const StackCard = memo(function StackCard({ stackDef, faces, count, active, onSelect }) {
  const isSub = stackDef.bucket.indexOf(":") >= 0;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`stack-card${active ? " is-active" : ""}`}
      onClick={() => onSelect(stackDef.bucket)}
    >
      <span className="stack-collage" aria-hidden="true">
        {[0, 1, 2].map((k) => (
          <span className={`stack-face stack-face-${k}`} key={k}>
            {faces[k] ? <TowerCover a={faces[k]} /> : null}
          </span>
        ))}
      </span>
      <span className="stack-label">{stackDef.label}</span>
      <span className="stack-count">
        {isSub && count == null
          ? "— works"
          : `${(count || 0).toLocaleString()} works`}
      </span>
    </button>
  );
});

function TowerDiscovery({ artifacts, towerData, countsFinal, go, onBrowse, onShelfChange }) {
  // Resolve curated ids through the derivation's phase-0 id index
  // (published with the first partial, so shelves are whole the
  // moment the catalog itself lands — the earlier objection was to
  // waiting on phases 1-2, not phase 0). A local id->record Map is
  // built only until the first derivation lands.
  // Resolve through the derivation's id index when it exists: phase 0
  // publishes it with the first partial, so shelves lose nothing —
  // while a second id->record Map here duplicated ~200 MB at full
  // catalog AND was rebuilt from scratch on every progressive publish
  // (a steady source of garbage peaks during the stream). The local
  // map remains only as the brief pre-derivation fallback.
  const byIdMap = useMemo(() => {
    if (towerData && towerData.idIndex) return null;
    const m = new Map();
    for (const a of artifacts) m.set(a.artifact_id, a);
    return m;
  }, [artifacts, towerData]);
  const byId = useCallback(
    (id) => {
      if (byIdMap) return byIdMap.get(id) || null;
      const ix = towerData.idIndex.get(id);
      return ix !== undefined ? artifacts[ix] || null : null;
    },
    [byIdMap, towerData, artifacts]
  );
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
  // Locked collage slots (2026-11-11 presentation-stability fix): each
  // stack card has exactly three face slots, bound POSITIONALLY to the
  // stack's curated cover ids. A slot renders a neutral placeholder
  // spine until its own record resolves, then locks to that record
  // forever — later publishes never re-pick, re-position, or replace
  // it. The old render (covers.map(byId).filter(Boolean).slice(0, 3))
  // compacted whichever subset had resolved so far into slots 0..n,
  // so every publish visibly swapped faces and sides on the cards
  // (Joshua's 18:28 phone video). Slots fill from the phase-0 id
  // index / artifact map as records arrive; the state update is a
  // no-op unless a new slot actually locks, so publishes that resolve
  // nothing new don't re-render the grid at all.
  const [lockedFaces, setLockedFaces] = useState({});
  useEffect(() => {
    setLockedFaces((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of STACKS) {
        const cur = next[s.bucket] ? next[s.bucket].slice() : [null, null, null];
        let dirty = false;
        for (let k = 0; k < 3; k++) {
          if (!cur[k]) {
            const rec = byId(s.covers[k]);
            if (rec) {
              cur[k] = rec;
              dirty = true;
            }
          }
        }
        if (dirty) {
          next[s.bucket] = cur;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [byId]);
  // The stacks are a selector (2026-10-21 category panels): nothing is
  // selected by default — the Featured rails own the page. Selecting a
  // stack swaps Featured for that category's shelf + grouped showcase;
  // selecting it again returns to Featured.
  const [shelf, setShelf] = useState(null);
  // Stable identity so the memoized stack cards don't re-render on
  // unrelated publishes (see StackCard above).
  const onSelectStack = useCallback(
    (bucket) => setShelf((cur) => (cur === bucket ? null : bucket)),
    []
  );
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
  // Sub-bucket counts (only BOOKS:sacred) have no static total: the
  // derivation feeds them and they tick upward all load long
  // (986 → 1,042 in Joshua's 18:28 video). Hold the number until the
  // derivation is final over the full catalog; null renders a steady
  // dash in the panel header. Top-level counts come from the seeded
  // discoveryData and are steady already.
  const shelfCount = !stack
    ? 0
    : stack.bucket.indexOf(":") >= 0
      ? countsFinal
        ? towerData.subCounts[stack.bucket] || 0
        : null
      : towerData.counts[stack.bucket] || 0;
  return (
    <div className="tower-discovery">
      <div className="tower-block-head">
        <h2 className="tower-block-title">Browse the stacks</h2>
      </div>
      <div className="stacks-grid" role="tablist" aria-label="Browse the stacks">
        {STACKS.map((s) => {
          const isSub = s.bucket.indexOf(":") >= 0;
          const count = isSub
            ? countsFinal
              ? towerData.subCounts[s.bucket] || 0
              : null
            : towerData.counts[s.bucket] || 0;
          return (
            <StackCard
              key={s.bucket}
              stackDef={s}
              faces={lockedFaces[s.bucket] || EMPTY_FACES}
              count={count}
              active={shelf === s.bucket}
              onSelect={onSelectStack}
            />
          );
        })}
      </div>
      {stack && (
        <div className="shelf-panel">
          <div className="shelf-head">
            <div>
              <h3 className="shelf-title">{stack.label}</h3>
              <p className="shelf-blurb">
                {stack.blurb}
                {shelfCount == null
                  ? ""
                  : ` · ${shelfCount.toLocaleString()} works`}
              </p>
            </div>
            <button
              type="button"
              className="shelf-seeall"
              onClick={() => onBrowse(stack.bucket)}
            >
              {shelfCount == null
                ? "See all ›"
                : `See all ${shelfCount.toLocaleString()} works ›`}
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
            title="Podcasts — read the conversation"
            items={(STACKS.find((s) => s.bucket === "PODCASTS") || { rail: [] }).rail.map(byId)}
            go={go}
            wide
          />
          </div>
        </>
      )}
    </div>
  );
}

// Minimal slot-scroll adjustment (2026-11-16 curated-vanish fix):
// after a within-list selection change in one of the filter panel's
// fixed-height subcategory slots, move the slot's scrollTop by the
// smallest amount that leaves the active row fully inside the
// visible window. A row already in view moves nothing; with no
// active row (a deselect) the scroll position is left exactly as
// the visitor left it.
function keepSlotRowInView(slot) {
  if (!slot || typeof slot.querySelector !== "function") return;
  const row = slot.querySelector(".tf2-sub.is-active");
  if (!row) return;
  const slotRect = slot.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  if (rowRect.top < slotRect.top) {
    slot.scrollTop -= slotRect.top - rowRect.top;
  } else if (rowRect.bottom > slotRect.bottom) {
    slot.scrollTop += rowRect.bottom - slotRect.bottom;
  }
}

// Dynamic facet tallies as a chunked job (2026-11-16 curated-vanish
// fix). This is the exact computation the synchronous facetCounts
// useMemo used to run on the render path — every axis counting
// within the selection formed by the OTHER axes, from the same
// per-record data the results list and the spiral read — restructured
// as a generator that yields whenever its ~7ms slice budget (the
// filter engine's slice size) runs out, so no single task on the
// tap's critical path exceeds a few milliseconds. The driver below
// runs the steps off-render and commits the finished tallies
// atomically; until a commit lands, the panel keeps showing the
// previous committed tallies, exactly as the browse engine keeps
// showing the previous committed results while a rescan runs.
function* facetCountSteps(input) {
  const {
    towerData,
    artifacts,
    bucketFilter,
    eraFilter,
    memberBitsSel,
    collBitsSel,
    shelfBits,
    paperBits,
    paperTypeBits,
    collSet,
    collData,
    collGroup,
  } = input;
  let sliceStart = performance.now();
  const over = () => performance.now() - sliceStart >= 7;
  const resetClock = () => {
    sliceStart = performance.now();
  };
  const collMemberBits =
    collBitsSel ||
    (collSet && towerData.idIndex
      ? buildMembershipBitset(
          towerData.idIndex,
          collSet,
          towerData.bucketKeys.length
        )
      : null);
  const member = memberBitsSel || collMemberBits;
  if (!bucketFilter && !eraFilter && !member) return null;
  const bucketKeys = towerData.bucketKeys;
  const eraCodes = towerData.eraCodes;
  const N = bucketKeys.length;
  const W = Math.ceil(N / 32);
  // Rust/WASM kernels (tower-kernels.js): when the module loaded,
  // the bitset algebra below runs in WASM with exact parity (the
  // parity harness compares every tally against this JS). Every
  // kernel call fails soft to the JS implementation beside it, so
  // a missing or failed module changes nothing observable. The
  // job's two big indexed arrays are staged once; the bucket-code
  // table is the browse engine's own (extended over the resident
  // keys exactly as the scan path extends it).
  const K = getTowerKernels();
  const fctx = K ? K.beginFacet() : null;
  const bucketCodeTable = input.bucketCodeTable || null;
  let stagedEra = null;
  let stagedCodes = null;
  if (fctx) {
    stagedEra = fctx.stage(eraCodes);
    if (bucketCodeTable) {
      extendBucketCodes(bucketCodeTable, bucketKeys);
      stagedCodes = fctx.stage(bucketCodeTable.codes);
    }
  }
  const pop32 = (x) => {
    x -= (x >> 1) & 0x55555555;
    x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
    x = (x + (x >> 4)) & 0x0f0f0f0f;
    return (x * 0x01010101) >> 24;
  };
  const andPopJS = (a, b) => {
    let n = 0;
    const lim = Math.min(a.length, b.length, W);
    for (let w = 0; w < lim; w++) n += pop32(a[w] & b[w]);
    return n;
  };
  const andPop = (a, b) => {
    if (fctx) {
      const r = fctx.andPop(a, b, W);
      if (r !== null) return r;
    }
    return andPopJS(a, b);
  };
  const andWordsJS = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    const out = new Uint32Array(W);
    const lim = Math.min(a.length, b.length, W);
    for (let w = 0; w < lim; w++) out[w] = a[w] & b[w];
    return out;
  };
  const andWords = (a, b) => {
    // The null shortcuts are semantic, not just fast paths: they
    // return the OTHER operand itself, and the tally loops below
    // read it through its own element size (the hub-Set fallback
    // member is a byte-per-record array). The kernel preserves
    // exactly that; it is only called with both operands present.
    if (!a) return b;
    if (!b) return a;
    if (K) {
      const r = K.andWords(a, b, W);
      if (r) return r;
    }
    return andWordsJS(a, b);
  };
  // Bucket mask from the few distinct bucket keys the filter can
  // match (exact key, or the lane prefix for a lane selection).
  let bucketWords = null;
  if (bucketFilter) {
    const laneOnly = bucketFilter.indexOf(":") < 0;
    const match = new Set();
    for (const k of Object.keys(towerData.subCounts || {})) {
      if (k === bucketFilter || (laneOnly && k.indexOf(bucketFilter + ":") === 0))
        match.add(k);
    }
    if (!laneOnly) match.add(bucketFilter);
    let builtWords = null;
    if (fctx && stagedCodes) {
      const mask = new Uint8Array(bucketCodeTable.keys.length);
      for (const k of match) {
        const c = bucketCodeTable.dict.get(k);
        if (c !== undefined) mask[c] = 1;
      }
      builtWords = fctx.buildMaskWords(stagedCodes, mask, N);
    }
    if (builtWords) {
      bucketWords = builtWords;
    } else {
      bucketWords = new Uint32Array(W);
      for (let i = 0; i < N; i++) {
        if (match.has(bucketKeys[i])) bucketWords[i >> 5] |= 1 << (i & 31);
        if ((i & 65535) === 65535 && over()) {
          yield;
          resetClock();
        }
      }
    }
  }
  let eraWords = null;
  if (eraFilter) {
    const code = TOWER_ERAS.findIndex((e) => e.id === eraFilter) + 1;
    let builtWords = null;
    if (fctx && stagedEra) builtWords = fctx.buildEraWords(stagedEra, code);
    if (builtWords) {
      eraWords = builtWords;
    } else {
      eraWords = new Uint32Array(W);
      for (let i = 0; i < N; i++) {
        if (eraCodes[i] === code) eraWords[i >> 5] |= 1 << (i & 31);
        if ((i & 65535) === 65535 && over()) {
          yield;
          resetClock();
        }
      }
    }
  }
  const bec = towerData.bucketEraCounts || {};
  // --- era counts within bucket ∧ member -------------------------
  const eraMap = {};
  {
    const within = andWords(bucketWords, member);
    if (!within) {
      for (const e of TOWER_ERAS)
        eraMap[e.id] = bucketFilter
          ? bec[bucketFilter + "|" + e.id] || 0
          : towerData.eraCounts[e.id] || 0;
    } else {
      for (const e of TOWER_ERAS) eraMap[e.id] = 0;
      // Chunked exactly like the JS loop's yield cadence (4096
      // words): each chunk runs in the kernel when it can, else
      // in JS below — a kernel chunk accumulates into eraArr and
      // is merged at the end, a JS chunk writes eraMap directly,
      // so a mid-section fallback stays exact.
      const eraArr = new Uint32Array(TOWER_ERAS.length);
      const withinStaged = fctx ? fctx.stage(within) : null;
      for (let w0 = 0; w0 < W; w0 += 4096) {
        const w1 = Math.min(W, w0 + 4096);
        let ok = false;
        if (fctx && withinStaged && stagedEra) {
          ok = fctx.eraTally(withinStaged, stagedEra, w0, w1, eraArr);
        }
        if (!ok) {
          for (let w = w0; w < w1; w++) {
            let word = within[w];
            while (word) {
              const b = word & -word;
              const i = (w << 5) + (31 - Math.clz32(b));
              const ec = eraCodes[i];
              if (ec) eraMap[TOWER_ERAS[ec - 1].id]++;
              word ^= b;
            }
          }
        }
        if (w1 < W && over()) {
          yield;
          resetClock();
        }
      }
      for (let e = 0; e < TOWER_ERAS.length; e++) {
        if (eraArr[e]) eraMap[TOWER_ERAS[e].id] += eraArr[e];
      }
    }
  }
  // --- lane + subcategory counts within era ∧ member -------------
  const laneMap = {};
  const subMap = {};
  if (!member) {
    for (const k of Object.keys(towerData.subCounts || {})) {
      const n = eraFilter
        ? bec[k + "|" + eraFilter] || 0
        : towerData.subCounts[k] || 0;
      subMap[k] = n;
      const lane = k.split(":")[0];
      laneMap[lane] = (laneMap[lane] || 0) + n;
    }
    if (!eraFilter) {
      for (const c of Object.keys(towerData.counts || {}))
        if (laneMap[c] === undefined) laneMap[c] = towerData.counts[c] || 0;
    }
  } else {
    const within = andWords(eraWords, member);
    // Same chunked pattern as the era tally: kernel chunks count
    // bucket CODES into codeCounts (merged through the code table
    // at the end); JS chunks write the maps directly.
    const codeCounts = new Uint32Array(
      stagedCodes ? bucketCodeTable.keys.length : 0
    );
    const withinStaged = fctx ? fctx.stage(within) : null;
    for (let w0 = 0; w0 < W; w0 += 4096) {
      const w1 = Math.min(W, w0 + 4096);
      let ok = false;
      if (fctx && withinStaged && stagedCodes) {
        ok = fctx.bucketTally(
          withinStaged,
          stagedCodes,
          w0,
          w1,
          codeCounts,
          N
        );
      }
      if (!ok) {
        for (let w = w0; w < w1; w++) {
          let word = within[w];
          while (word) {
            const b = word & -word;
            const i = (w << 5) + (31 - Math.clz32(b));
            const bk = bucketKeys[i];
            subMap[bk] = (subMap[bk] || 0) + 1;
            const lane = bk.split(":")[0];
            laneMap[lane] = (laneMap[lane] || 0) + 1;
            word ^= b;
          }
        }
      }
      if (w1 < W && over()) {
        yield;
        resetClock();
      }
    }
    for (let c = 0; c < codeCounts.length; c++) {
      if (!codeCounts[c]) continue;
      const bk = bucketCodeTable.keys[c];
      subMap[bk] = (subMap[bk] || 0) + codeCounts[c];
      const lane = bk.split(":")[0];
      laneMap[lane] = (laneMap[lane] || 0) + codeCounts[c];
    }
  }
  // --- curated rows within bucket ∧ era ∧ shelf ------------------
  const curatedMap = {};
  if (collData) {
    const group = collData.groups.find((g) => g.id === collGroup);
    if (group) {
      const other = andWords(andWords(bucketWords, eraWords), shelfBits);
      for (const c of group.collections) {
        if (c.bits) {
          curatedMap[c.key] = other ? andPop(c.bits, other) : c.count;
        } else if (c.ids) {
          // Hub-Set fallback descriptors: count set members
          // inside the other axes via the id index.
          if (!other) {
            curatedMap[c.key] = c.count;
          } else {
            let n = 0;
            for (let w = 0; w < W; w++) {
              let word = other[w];
              while (word) {
                const b = word & -word;
                const i = (w << 5) + (31 - Math.clz32(b));
                if (c.ids.has(artifacts[i].artifact_id)) n++;
                word ^= b;
              }
              if ((w & 4095) === 4095 && over()) {
                yield;
                resetClock();
              }
            }
            curatedMap[c.key] = n;
          }
        } else {
          curatedMap[c.key] = c.count;
        }
        if (over()) {
          yield;
          resetClock();
        }
      }
    }
  }
  // --- Books shelves within bucket ∧ era ∧ curated ---------------
  const shelfMap = {};
  if (
    collData &&
    collData.booksShelves &&
    collData.booksShelves.length &&
    (bucketFilter.split(":")[0] === "BOOKS" || input.shelfKey)
  ) {
    const other = andWords(andWords(bucketWords, eraWords), collMemberBits);
    for (const s of collData.booksShelves) {
      shelfMap[s.key] = other ? andPop(s.bits, other) : s.count;
      if (over()) {
        yield;
        resetClock();
      }
    }
  }
  // --- Papers fields/subfields/types within the other axes -------
  // Field and subfield rows count within bucket ∧ era ∧ curated ∧
  // shelf ∧ type (the paper axis itself excluded, the type axis
  // included); type rows count within the same set with the field
  // selection included and the type axis excluded — the same
  // other-axes rule every axis above follows.
  const paperMap = {};
  const paperTypeMap = {};
  if (
    collData &&
    collData.papersFields &&
    collData.papersFields.length &&
    (bucketFilter.split(":")[0] === "PAPERS" || input.paperKey || input.paperTypeKey)
  ) {
    const paperOther = andWords(
      andWords(bucketWords, eraWords),
      andWords(collMemberBits, shelfBits)
    );
    const fieldBase = andWords(paperOther, paperTypeBits);
    for (const f of collData.papersFields) {
      paperMap[f.key] = f.bits
        ? fieldBase
          ? andPop(f.bits, fieldBase)
          : f.count
        : f.count;
      for (const s of f.subs) {
        paperMap[s.key] = s.bits
          ? fieldBase
            ? andPop(s.bits, fieldBase)
            : s.count
          : s.count;
      }
      if (over()) {
        yield;
        resetClock();
      }
    }
    const typeBase = andWords(paperOther, paperBits);
    for (const t of collData.papersTypes || []) {
      paperTypeMap[t.key] = t.bits
        ? typeBase
          ? andPop(t.bits, typeBase)
          : t.count
        : t.count;
      if (over()) {
        yield;
        resetClock();
      }
    }
  }
  return { eraMap, laneMap, subMap, curatedMap, shelfMap, paperMap, paperTypeMap };
}

// Facet job driver: steps the generator on macrotasks until it
// returns, then commits through onCommit. Latest-wins is the
// caller's job (cancel the previous job when inputs change); a
// cancelled job never commits. A throwing tally commits nothing —
// the previous committed counts stay standing rather than the
// panel going down with the computation.
function startFacetJob(input, onCommit) {
  const gen = facetCountSteps(input);
  let timer = null;
  let cancelled = false;
  const job = {
    cancel() {
      cancelled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
  const step = () => {
    timer = null;
    if (cancelled) return;
    let r;
    try {
      r = gen.next();
    } catch (err) {
      return;
    }
    if (r.done) {
      onCommit(r.value);
      return;
    }
    timer = setTimeout(step, 0);
  };
  timer = setTimeout(step, 0);
  return job;
}

// Era load scopes (2026-11-20, selection-driven loading): the
// server facet file's era bands are the generator's coarse bands
// (scripts/build-catalog-meta.mjs eraBand: pre-1800 / 1800s /
// 1900-1949 / 1950-1999 / 2000+), while the panel's eras are finer.
// Each client era loads the band(s) that CONTAIN it; the loaded
// records are a superset of the era, and the era's exact membership
// is still defined by the client-side era derivation over the
// resident records (eraCodes), exactly as before — the band is a
// load scope, never a result definition.
const ERA_LOAD_BANDS = {
  "before-1500": ["pre-1800"],
  "1500s": ["pre-1800"],
  "1600s": ["pre-1800"],
  "1700s": ["pre-1800"],
  "1800s": ["1800s"],
  "1900-1945": ["1900-1949"],
  "1946-1989": ["1900-1949", "1950-1999"],
  "1990-2009": ["1950-1999", "2000+"],
  "2010s": ["2000+"],
  "2020s": ["2000+"],
};

// Published tallies (2026-11-20 correction — Joshua's rule: counts
// are navigation data, always exact, never load-dependent). Two
// published sources, both fetched with the navigation layer:
//   - /tower-tallies.json: the static tallies file baked from the
//     catalog's own metadata products (total, collections, buckets,
//     FINE eras, and the bucket×era / collection×era cubes), guarded
//     at generation time against the server's counts file.
//   - /api/catalog-counts: the server's facet tallies (global, or
//     faceted within the current facet-axis selection), computed
//     from the facet postings — the source for counts inside a
//     collection/era selection while its records are still loading.
// Neither is derived from resident records; resident-derived tallies
// (facetCounts) are only ever shown in scope mode once every scope
// the current selection needs has fully landed, at which point they
// are exact for that selection (see facetCountsShown below).
let talliesPromise = null;
function loadTallies() {
  if (!talliesPromise) {
    talliesPromise = fetch("/tower-tallies.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return talliesPromise;
}
async function fetchServerTallies(params) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`/api/catalog-counts${qs ? `?${qs}` : ""}`);
  if (!r.ok) return null;
  return r.json();
}

function TowerLibrarySection({ go, onReady, helixApiRef }) {
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
  // Derivation completion for the CURRENT artifacts (2026-11-11
  // presentation-stability fix): flips false whenever a derivation
  // run starts and true only when that run resolves over the array
  // as it now stands. Combined with fullIndexReady it marks the one
  // moment the derivation's counts describe the WHOLE catalog —
  // until then the header/stacks must read the hubs seed (or hold),
  // never a partial derivation count: Joshua's 18:28 phone video
  // caught "6 collections" flipping to 7 mid-load because a partial
  // derivation (DOCUMENTS' 363 records arrive last) won the header.
  const [deriveFinal, setDeriveFinal] = useState(false);
  // Filter-panel finality (2026-11-13 load-state fix): true once a
  // derivation phase 0 has landed over the full catalog — the point
  // at which counts / era counts / subcategory counts are final.
  // Distinct from deriveFinal (the whole derivation promise), which
  // can lag phase 0 by the full phase 1–3 build.
  const [countsReady, setCountsReady] = useState(false);
  // Load-window honesty (2026-11-13): if the skeleton loading branch
  // is still the whole section after 12 s, the branch says so in
  // plain words — a stalled session must not sit on anonymous slabs
  // with no indication anything is wrong or still coming.
  const [slowLoad, setSlowLoad] = useState(false);
  useEffect(() => {
    if (artifacts && towerData) {
      setSlowLoad(false);
      return;
    }
    const t = setTimeout(() => setSlowLoad(true), 12000);
    return () => clearTimeout(t);
  }, [artifacts, towerData]);
  // Stream self-recovery (2026-11-13): the browse stream can
  // failure-stop mid-load (a burst of failed page fetches on a
  // throttled connection) with the catalog half-arrived and the
  // counting note up indefinitely — the visitor's only recovery was
  // a reload. While the page is visible, a stopped-but-incomplete
  // stream resumes itself on a bounded backoff; a stream that is
  // moving resets the budget. (2026-11-15: the tick also force-
  // cycles a stream that is streaming but has stopped progressing —
  // the early-tap strand, which never presents as stopped at all.)
  useEffect(() => {
    if (!artifacts || countsReady) return;
    let attempts = 0;
    let timer = null;
    const delays = [10000, 20000, 40000, 60000, 60000, 60000];
    const tick = () => {
      if (
        document.visibilityState === "visible" &&
        !isBrowseComplete() &&
        !isBrowseStreaming()
      ) {
        if (attempts < delays.length) {
          resumeCatalogBrowse();
          attempts += 1;
        }
      } else if (isBrowseStreaming()) {
        attempts = 0;
        // Streaming but stalled (2026-11-15 early-tap fix): the
        // stream can sit neither stopped nor progressing — a hidden
        // sample during an append parks the worker on its ack
        // window, a worker-side pause or dead decode loop presents
        // identically — and the stopped-stream resume above can
        // never see it. While visible, a stream with no commit
        // progress for 45 s is force-cycled through stop + resume,
        // which restarts both pipelines from the append frontier.
        if (
          document.visibilityState === "visible" &&
          getBrowseStallAgeMs() > 45000
        ) {
          restartStalledBrowse();
        }
      }
      timer = setTimeout(tick, delays[Math.min(attempts, delays.length - 1)]);
    };
    timer = setTimeout(tick, delays[0]);
    return () => clearTimeout(timer);
  }, [artifacts, countsReady]);
  // Deferred-search trigger (2026-11-10 crash fix): flips true the
  // first time a hub filter or strict query needs the local search
  // layer in server mode; the derivation then upgrades in place.
  const [needSearchData, setNeedSearchData] = useState(false);
  // Baked sort orders settle asynchronously (they download in
  // parallel with the browse stream); the tick re-runs the derivation
  // so a deferred object that published before they landed picks
  // them up the moment they do.
  const [ordersTick, setOrdersTick] = useState(0);
  useEffect(
    () => onBrowseOrdersSettled(() => setOrdersTick((t) => t + 1)),
    []
  );
  // Derivation scheduling (2026-11-13 arrival fix): latest-only,
  // the same discipline as the filter engine (design §12). The old
  // effect cancelled the running derivation on EVERY stream publish
  // and restarted it over the longer prefix. A cancelled run
  // discards its unfinished phase-0 tail work — the phase-0 cache
  // advances only when a run completes both phase-0 loops — so the
  // moment one publish's tail work outgrew the publish interval
  // (measured: ~2.0M resident records on a throttled profile; the
  // very first publish under heavier contention), every later run
  // faced a strictly larger tail and was cancelled in turn. The
  // derived browse data (bucket keys, era codes, id index) froze
  // mid-stream while the catalog kept arriving, and filtered views
  // counted over the frozen prefix — an early Law selection sat on
  // the starter pack's table, which contains no Law at all. A
  // started run is therefore never cancelled for catalog growth:
  // it publishes its phases for its own input (a valid,
  // prefix-consistent state) and, when it settles, a trailing run
  // starts over the newest array if the catalog moved on. Cancel +
  // restart still applies to what it is for: option changes (the
  // browseOnly / deferSearch flips, the orders tick, a manual
  // retry through deriveSeq) and unmount.
  const deriveRunRef = useRef(null);
  const latestArtifactsRef = useRef(null);
  latestArtifactsRef.current = artifacts;
  // Derivation generation: bumped every time a new run starts (and
  // when the catalog goes away). A run's detached phase-3 vocabulary
  // build outlives the run itself — under the old cancel-on-publish
  // scheduling it was aborted by cancellation, but a settled run is
  // never cancelled, so without this guard a fast stream stacks
  // several full-catalog vocabulary builds on top of the trailing
  // run's phases until the main thread wedges (the stream stalls on
  // append backpressure and the panel starves). The generation check
  // makes supersession itself abort the detached build at its next
  // slice boundary.
  const deriveGenRef = useRef(0);
  // Monotonic publication guard: towerData never regresses to a
  // shorter derivation than one already published — a superseded
  // run's late phase deliveries (its detached vocabulary build in
  // particular) must not overwrite a newer state.
  const derivePublishedRef = useRef(0);
  // The artifacts array identity counts finality was earned on
  // (RC-2a, 2026-11-14): an option-only restart over the SAME array
  // (baked orders settling, trailing coverage bump) must not un-final
  // the panel for its recompute's duration; a restart over any other
  // array (every streaming publish) still resets as before.
  const countsFinalInputRef = useRef(null);
  useEffect(() => {
    if (!artifacts) {
      const run = deriveRunRef.current;
      if (run) run.cancelled = true;
      deriveRunRef.current = null;
      deriveGenRef.current += 1;
      derivePublishedRef.current = 0;
      setTowerData(null);
      setDeriveFinal(false);
      setCountsReady(false);
      countsFinalInputRef.current = null;
      return;
    }
    const restartKey = `${deriveSeq}|${fullIndexReady}|${needSearchData}|${ordersTick}`;
    const live = deriveRunRef.current;
    if (live && !live.settled && live.restartKey === restartKey) {
      // Catalog growth only (the running run's options are
      // unchanged): leave it its input — its settle handler starts
      // the trailing run over the newest array. Finality flags are
      // not reset here: they belong to the run that publishes over
      // the latest array, and during the stream they are false
      // either way.
      return;
    }
    if (live) live.cancelled = true;
    setDeriveFinal(false);
    if (countsFinalInputRef.current !== artifacts) setCountsReady(false);
    deriveGenRef.current += 1;
    const run = {
      input: artifacts,
      restartKey,
      cancelled: false,
      settled: false,
      gen: deriveGenRef.current,
    };
    deriveRunRef.current = run;
    const publish = (obj) => {
      if (!obj) return;
      const k = obj.bucketKeys ? obj.bucketKeys.length : 0;
      if (k < derivePublishedRef.current) return;
      derivePublishedRef.current = k;
      setTowerData(obj);
    };
    const settleRun = () => {
      run.settled = true;
      if (deriveRunRef.current === run) deriveRunRef.current = null;
      if (
        !run.cancelled &&
        latestArtifactsRef.current &&
        latestArtifactsRef.current !== run.input
      ) {
        setDeriveSeq((n) => n + 1);
      }
    };
    deriveTowerData(
      artifacts,
      () => run.cancelled || run.gen !== deriveGenRef.current,
      (phase) => {
        // Phase 1 (search data) is live the moment it lands — the sort
        // orders still building in the background must not hold search
        // hostage.
        if (run.cancelled || run.gen !== deriveGenRef.current) return;
        publish(phase);
        // The phase callback's first delivery is phase 0 —
        // counts, era counts and subcategory counts computed over
        // this run's input. Those counts are final only when the
        // input is the whole catalog, which isBrowseComplete()
        // attests (stream consumed the manifest total, or the
        // client index finished). The panel keys its final state
        // off this, not the derivation promise, whose phases 1–3
        // lag phase 0 (2026-11-13 load-state fix).
        //
        // The trigger used to be "!isBrowseStreaming()" — the
        // stream's stopped state — which is also true BEFORE the
        // stream exists: while manifest discovery was still in
        // flight (a degraded manifest endpoint can burn ~38 s of
        // retries there), the first derivation over the bootstrap
        // prefix flipped the panel "final" and presented prefix
        // counts as the library's own — seed bypassed, note
        // suppressed, era/subcategory numbers shown, Law missing
        // (Joshua's 17:01 recording, 2026-11-13 loadfix-v3).
        // (fullIndexReady cannot be the trigger either — it keys
        // off the publish's complete flag, which the deduped
        // resident count never satisfies when the raw total counts
        // duplicate ids, so it never flips at all.)
        //
        // Latest-only scheduling adds the input check: a run the
        // stream has already moved past publishes its prefix state
        // above, but its counts are NOT final — only the run whose
        // input is still the newest array may flip finality (the
        // guarantee cancellation timing used to provide).
        if (run.input === latestArtifactsRef.current && isBrowseComplete()) {
          countsFinalInputRef.current = run.input;
          setCountsReady(true);
        }
      },
      {
        // Scope mode (2026-11-20 correction): while any scope is in
        // flight, derivations run phase-0-only. fullIndexReady flips
        // true at scope init (the init publish is "complete"), so
        // without this every page publish restarted a FULL
        // derivation — on-device sort orders over the whole resident
        // set — and the current array's phase-0 data (the engine's
        // and tallies' input) only surfaced after the PREVIOUS
        // array's orders finished: landed pages did not become
        // results or counts for many seconds while pages kept
        // arriving (Joshua's recording: 8,000 Law records resident,
        // results still "0 / No entries match"). Phase 0 is
        // incremental over appends, so per-page phase-0 publishes
        // are cheap; the full derivation (orders + deferred search
        // layer) runs once the queue drains, exactly as the
        // streaming path's completion derivation did.
        browseOnly:
          !fullIndexReady || (isScopeMode() && !isBrowseComplete()),
        // Server mode defers the local search layer until a hub
        // filter or strict query actually needs it (see
        // deriveTowerData's crash-fix note and the trigger effect
        // below). towerServerMode() is read fresh here on purpose:
        // a server-search failure flips it off, and the fallback's
        // derivation must then build the layer immediately.
        deferSearch: towerServerMode() && !needSearchData,
      }
    ).then(
      (data) => {
        if (!run.cancelled) {
          if (data) {
            // Only the run over the newest array completes the
            // derivation; a superseded run's phases already
            // published its prefix state, and its trailing run
            // (settleRun, below) brings the final flags.
            if (run.input === latestArtifactsRef.current) {
              publish(data);
              setDeriveFinal(true);
              if (isBrowseComplete()) {
                countsFinalInputRef.current = run.input;
                setCountsReady(true);
              }
            }
            // A superseded run resolving empty is not an error —
            // its trailing run owns the outcome.
          } else if (run.input === latestArtifactsRef.current)
            setDeriveError(true);
        }
        settleRun();
      },
      () => {
        if (!run.cancelled && run.input === latestArtifactsRef.current)
          setDeriveError(true);
        settleRun();
      }
    );
  }, [artifacts, deriveSeq, fullIndexReady, needSearchData, ordersTick]);
  // Unmount is the one unconditional cancellation (growth no longer
  // cancels, so it cannot ride the scheduling effect's cleanup).
  useEffect(() => {
    return () => {
      const run = deriveRunRef.current;
      if (run) run.cancelled = true;
    };
  }, []);
  // Derivation self-heal (2026-11-18): a derivation run that throws
  // (a worker hiccup, a transient memory spike under load) used to
  // land the visitor on the same error screen as a failed catalog
  // fetch, with no automatic way back. Give it the same discipline
  // as the fetch: bounded retries behind the loading branch, error
  // UI only once the budget is spent. A deterministic derivation
  // fault still surfaces — after three honest re-runs, not one.
  const DERIVE_RETRY_DELAYS_MS = [2000, 5000, 10000];
  const deriveRetryRef = useRef(0);
  const [deriveExhausted, setDeriveExhausted] = useState(false);
  useEffect(() => {
    if (!deriveError) return;
    if (deriveRetryRef.current >= DERIVE_RETRY_DELAYS_MS.length) {
      setDeriveExhausted(true);
      return;
    }
    const t = setTimeout(() => {
      deriveRetryRef.current += 1;
      setDeriveError(false);
      setDeriveSeq((n) => n + 1);
    }, DERIVE_RETRY_DELAYS_MS[deriveRetryRef.current]);
    return () => clearTimeout(t);
  }, [deriveError]);
  useEffect(() => {
    if (towerData) {
      deriveRetryRef.current = 0;
      setDeriveExhausted(false);
    }
  }, [towerData]);
  const failed = catalogError || (deriveError && deriveExhausted);
  const retryCatalog = () => {
    deriveRetryRef.current = 0;
    setDeriveExhausted(false);
    setDeriveError(false);
    retryArtifacts();
    // Re-run the derivation too: the same artifacts identity would not
    // retrigger the effect on its own.
    setDeriveSeq((n) => n + 1);
    // Scope mode (2026-11-20): also re-ensure the current selection's
    // scopes — a scope that exhausted its own retries is the other
    // way this screen's retry gets exercised now.
    setScopeRetrySeq((n) => n + 1);
  };
  // True catalog total from the browse manifest (design §11.3): the
  // results header uses a truthful total as its denominator instead
  // of letting the resident prefix pose as the whole library. The
  // header receives worksTotal FIRST (hub seed → this hint): this
  // hint alone was still 0 through Joshua's whole 18:31 recording —
  // it waits on the browse manifest, the slowest discovery fetch —
  // while the seed total was already on screen in the stats strip,
  // so the header read "20,000 of 20,000 entries" (the starter pack
  // posing as the library) for the entire clip.
  const catalogTotalHint = getBrowseTotalHint() || 0;
  // Live search + two-level browse filter + sort. Empty query/filter = show all.
  // bucketFilter is "" (all), a lane ("PAPERS"), or a subcategory
  // ("PAPERS:bio"). Click mechanics are unchanged from the old collection
  // filter: click a chip to filter, click the active chip to clear,
  // pagination resets on change, 50 rows per page with "Load more".
  // (The query state itself lives further down, with the unified-search
  // pipeline it feeds — see "ONE search".)
  const [bucketFilter, setBucketFilter] = useState("");
  // Era axis (filter revamp 2026-11-11): "" | TOWER_ERAS id. Composes
  // with the bucket and curated-collection filters (AND), and — like a
  // hub filter — it is answered by the client pipeline in server mode:
  // the server search API has no era parameter.
  const [eraFilter, setEraFilter] = useState("");
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
  // Entry-open transition (2026-11-16, INVENTORY 37; design locked by
  // Joshua 2026-11-14 ~22:35–22:45, confirmed 2026-11-15): opening a
  // result no longer raises the "Tower of Babel" title loader. The
  // clicked cover survives a dissolve of the browse UI, lifts from its
  // exact rendered rect and glides to center over the helix while the
  // entry's text preloads into the reader cache; navigation fires when
  // the motion has read AND the preload has settled — hard-capped, so
  // the reader opens already loaded and never waits on a frozen frame.
  // Motion revamp (2026-11-17, INVENTORY 104): past center the cover
  // keeps rising continuously through the coil's center and out of
  // the frame (the shell's overlay + the .entry-flying backdrop pan
  // carry that), so the gate minimum now lands mid-rise — the rise,
  // not a hold, is the waiting state. The flight state lives in
  // lib/entry-flight.js; the app shell renders the overlay and
  // suppresses the boot loader + page curtain for this navigation.
  // Any failure to measure a cover falls back to the plain go() the
  // result used before.
  const openEntry = useCallback(
    (a, to, ev) => {
      if (!a || getEntryFlight()) {
        go(to);
        return;
      }
      const btn = ev && ev.currentTarget;
      const scope =
        btn && btn.closest
          ? btn.closest(".tower-book-card, .tower-row")
          : null;
      const coverEl = scope
        ? scope.querySelector(".tower-book-cover, .tower-row-cover")
        : null;
      if (!coverEl) {
        go(to);
        return;
      }
      const rect = coverEl.getBoundingClientRect();
      if (!(rect.width > 4 && rect.height > 4)) {
        go(to);
        return;
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const wide = rect.width > rect.height * 1.25;
      let targetW = wide
        ? Math.min(vw * 0.82, 460)
        : Math.min(vw * 0.52, 248);
      targetW = Math.max(targetW, rect.width);
      let scale = targetW / rect.width;
      if (scale > 3.4) scale = 3.4;
      // The centered cover must also fit the viewport height.
      if (rect.height * scale > vh * 0.62) scale *= (vh * 0.62) / (rect.height * scale);
      const dx = vw / 2 - (rect.left + rect.width / 2);
      const dy = vh * 0.46 - (rect.top + rect.height / 2);
      // Beat 2 (2026-11-20, Joshua's correction): after the
      // page-center presentation, the cover zips INTO THE COIL —
      // the overall spiral's own center, from the scene's live
      // layout geometry — and rises from there. cdx/cdy are the
      // extra translate from the beat-1 center to the coil center;
      // zero when the scene cannot answer (flight falls back to
      // the pre-correction single-center rise).
      let cdx = 0;
      let cdy = 0;
      try {
        const cc =
          helixApiRef && helixApiRef.current && helixApiRef.current.coilCenter
            ? helixApiRef.current.coilCenter()
            : null;
        if (cc && isFinite(cc.x) && isFinite(cc.y)) {
          cdx = cc.x - vw / 2;
          cdy = cc.y - vh * 0.46;
        }
      } catch (e) {
        /* the coil center is an enhancement, never a blocker */
      }
      const reduced = !!(
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
      const flight = beginEntryFlight({
        to,
        toPath: to.split("?")[0],
        html: coverEl.innerHTML,
        cls: coverEl.className,
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        dx,
        dy,
        cdx,
        cdy,
        scale,
        reduced,
      });
      // FLIP etiquette: the original cover hides instantly — the clone
      // IS the cover now — while everything around it dissolves.
      coverEl.style.visibility = "hidden";
      const main = btn.closest("main.tower-combined");
      if (main) main.classList.add("entry-flying");
      const ctrl = new AbortController();
      const t0 = performance.now();
      const minMs = reduced ? 140 : ENTRY_FLIGHT_MIN_MS;
      const capMs = reduced ? 900 : ENTRY_FLIGHT_CAP_MS;
      let settled = false;
      let navigated = false;
      let minTimer = 0;
      let capTimer = 0;
      const cleanup = () => {
        clearTimeout(minTimer);
        clearTimeout(capTimer);
      };
      const navigate = () => {
        if (navigated) return;
        navigated = true;
        cleanup();
        markEntryFlightNavigated();
        go(to);
      };
      const maybe = () => {
        if (settled && performance.now() - t0 >= minMs) navigate();
      };
      minTimer = setTimeout(maybe, minMs);
      capTimer = setTimeout(navigate, capMs);
      preloadEntryText(a, ctrl.signal).then(() => {
        settled = true;
        maybe();
      });
      flight.cancel = () => {
        cleanup();
        try {
          ctrl.abort();
        } catch {
          /* already aborted */
        }
        coverEl.style.visibility = "";
        if (main) main.classList.remove("entry-flying");
      };
    },
    [go]
  );
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
  // lazily — the page paints and browses normally before it lands. A
  // failed fetch never hides this UI (2026-11-15 fix: hiding it was
  // the filmed panel collapse); the axis stays rendered with an
  // honest loading / couldn't-load state instead of erroring the
  // browse. The collection filter intersects with the
  // existing search + category filter + sort in the rank memo below;
  // it never renders a second list.
  const [collGroup, setCollGroup] = useState("");
  const [collKey, setCollKey] = useState("");
  // Books shelf selection (2026-11-15 collections package): the Books
  // lane's subcategories are 61 multi-match shelves delivered as TCU1
  // bitsets (collData.booksShelves), not a prefix partition, so the
  // selection is its own state — a "bookshelf:<id>" key or "". It
  // intersects with every other axis exactly like a curated selection
  // (the two bitsets AND into memberBitsSel below).
  const [shelfKey, setShelfKey] = useState("");
  // Papers field/subfield/type selection (2026-11-15 collections
  // package): the Papers lane's subcategories are the design's
  // two-level subject map (12 fields, ~60 subfields) plus a type
  // axis, all delivered as TCU1 bitsets (collData.papersFields /
  // papersTypes), so — like the Books shelves — the selection is its
  // own state: paperKey is "paperfield:<id>" or
  // "papersub:<field>:<sub>", paperTypeKey is "papertype:<id>".
  // Both bitsets AND into memberBitsSel alongside the curated and
  // Books-shelf bitsets.
  const [paperKey, setPaperKey] = useState("");
  const [paperTypeKey, setPaperTypeKey] = useState("");
  // Curated-collection lists render in FULL inside the fixed-height
  // slot, which scrolls internally (2026-11-13, Joshua): the old
  // top-10 collapse behind a "Show all" row is removed — the slot
  // already scrolls, so the button was a second, redundant way to
  // reach the same rows. No show-all/show-more control exists
  // anywhere in the filter box now.
  const [collData, setCollData] = useState(null);
  const [collLoading, setCollLoading] = useState(false);
  // Which source produced collData: the TCU1 bitsets are the full
  // taxonomy; the hub index fallback can only express traditions. A
  // late hub resolution must never clobber bitset data with the
  // smaller fallback (the two loads race at first paint).
  const collSourceRef = useRef("");
  const collSectionRef = useRef(null);
  const collSubsRef = useRef(null);
  const laneSubsRef = useRef(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const filterPanelRef = useRef(null);
  // Curated-bitset load state (2026-11-15 panel fix): tracked
  // separately from the hub load so the panel can tell the truth
  // about each source. "failed" is a resting state, not a dead end —
  // the next ensureCollections call starts a fresh attempt cycle
  // (loadCuratedBitsets no longer caches a failure either).
  const [collBitsState, setCollBitsState] = useState("idle");
  const collBitsStateRef = useRef("idle");
  const startBitsetsLoad = useCallback(() => {
    const st = collBitsStateRef.current;
    if (st === "loading" || st === "ready") return;
    collBitsStateRef.current = "loading";
    setCollBitsState("loading");
    tcb1Meta()
      .then((m) => {
        const fp = m && m.source && m.source.fingerprint_sha256_concat;
        if (!fp) return null;
        const version =
          m.curated && m.curated.sha256 ? m.curated.sha256 : null;
        return loadCuratedBitsets(fp, version);
      })
      .then((data) => {
        if (!data) {
          collBitsStateRef.current = "failed";
          setCollBitsState("failed");
          return;
        }
        let bytes = 0;
        for (const g of data.groups) {
          for (const c of g.collections) {
            if (c.bits) bytes += c.bits.byteLength;
          }
        }
        for (const s of data.booksShelves || []) {
          if (s.bits) bytes += s.bits.byteLength;
        }
        for (const f of data.papersFields || []) {
          if (f.bits) bytes += f.bits.byteLength;
          for (const s of f.subs || []) {
            if (s.bits) bytes += s.bits.byteLength;
          }
        }
        for (const t of data.papersTypes || []) {
          if (t.bits) bytes += t.bits.byteLength;
        }
        noteExternalBytes("curated-bitsets", bytes);
        collSourceRef.current = "bitsets";
        collBitsStateRef.current = "ready";
        setCollBitsState("ready");
        setCollData(data);
      })
      .catch(() => {
        collBitsStateRef.current = "failed";
        setCollBitsState("failed");
      });
  }, []);
  const ensureCollections = useCallback(() => {
    // The bitsets are the primary source for EVERY group (the hub
    // index can only express traditions): any approach or group tap
    // starts them, and restarts them after a failure. Before the
    // 2026-11-15 fix this function started only the hub load, so a
    // bitset failure at page open left the tapped group waiting on a
    // 17.7 MB fallback that could never contain it — and when that
    // fallback landed, its traditions-only data made the other
    // groups' chips vanish from the panel.
    startBitsetsLoad();
    if (collData || collLoading) return;
    setCollLoading(true);
    loadHubsIndex().then((d) => {
      setCollLoading(false);
      // A hub failure needs no state of its own: collData simply
      // stays unset, the bitset load state carries the panel's
      // loading / couldn't-load truth, and the axis renders either
      // way (2026-11-15 fix — the old collFailed flag hid it).
      if (!d) return;
      if (collSourceRef.current === "bitsets") return;
      collSourceRef.current = "hub";
      setCollData(buildCollections(d));
    });
  }, [collData, collLoading, startBitsetsLoad]);
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
  const activeShelf = useMemo(() => {
    if (!collData || !shelfKey || !collData.booksShelves) return null;
    return collData.booksShelves.find((s) => s.key === shelfKey) || null;
  }, [collData, shelfKey]);
  // Papers selection descriptors (same collections package): the
  // field a paperKey names (directly or through one of its
  // subfields), the subfield when one is picked, and the combined
  // selection descriptor the pills/summary/bits read.
  const activePaperField = useMemo(() => {
    if (!collData || !paperKey || !collData.papersFields) return null;
    const fid = paperKey.split(":")[1];
    return collData.papersFields.find((f) => f.id === fid) || null;
  }, [collData, paperKey]);
  const activePaperSub = useMemo(() => {
    if (!activePaperField || !paperKey.startsWith("papersub:")) return null;
    const sid = paperKey.split(":")[2];
    return activePaperField.subs.find((s) => s.id === sid) || null;
  }, [activePaperField, paperKey]);
  const activePaperSel = activePaperSub || activePaperField;
  const activePaperType = useMemo(() => {
    if (!collData || !paperTypeKey || !collData.papersTypes) return null;
    return collData.papersTypes.find((t) => t.key === paperTypeKey) || null;
  }, [collData, paperTypeKey]);
  // Panel truth-telling (2026-11-15 fix): what the selected curated
  // group can actually render right now, and whether the panel is
  // still waiting on a load. The chips and the subs slot derive from
  // these — never from collData's group list alone — so a fallback
  // dataset can no longer make groups vanish, and a group whose data
  // failed to load says so plainly instead of rendering an empty
  // slot (the four symptoms in Joshua's 2026-11-15 recording).
  const collGroupCollections = useMemo(() => {
    if (!collData || !collGroup) return [];
    const g = collData.groups.find((x) => x.id === collGroup);
    return g ? g.collections : [];
  }, [collData, collGroup]);
  const collAnyLoading = collLoading || collBitsState === "loading";
  const collGroupUnavailable =
    !!collGroup &&
    collGroupCollections.length === 0 &&
    !collAnyLoading &&
    collBitsState === "failed";
  // The active collection's blurb renders INSIDE the fixed-height
  // subs slot (see the curated axis markup) so selecting a shelf
  // never resizes the panel. Slot scroll discipline (2026-11-16
  // curated-vanish fix, replacing the 2026-11-15 ghost-fix rule):
  // the old rule scrolled the slot back to its top on EVERY
  // selection change — with 16–45 rows in a 220px slot that yanked
  // the visible window to the blurb + first rows on any deep-row
  // tap, scrolling the tapped row and its neighbours out of view
  // so the other collections appeared to vanish (Joshua's
  // 2026-11-16 phone report; nothing was ever removed from the
  // DOM). Now the slot resets to its top only when the LIST itself
  // changes — a different curated group, or the other lane's slot.
  // A selection change inside the same list preserves scrollTop
  // and adjusts it the minimum amount that keeps the active row
  // inside the visible window (the blurb mounting or unmounting
  // above the rows shifts them by its height; the adjustment
  // absorbs exactly that). The ghost protection the reset used to
  // provide lives in the blurb element itself: it is keyed by the
  // selection (see the markup), so a stale description can never
  // co-render with the incoming rows at any scroll position.
  // Layout effects, not passive ones: the adjustment must land
  // BEFORE the browser paints the new selection.
  const collSlotGroupRef = useRef(null);
  useLayoutEffect(() => {
    const prevGroup = collSlotGroupRef.current;
    collSlotGroupRef.current = collGroup;
    const el = collSubsRef.current;
    if (!el) return;
    if (prevGroup !== collGroup) {
      el.scrollTop = 0;
      return;
    }
    keepSlotRowInView(el);
  }, [collKey, collGroup]);
  const laneSlotLaneRef = useRef(null);
  useLayoutEffect(() => {
    const lane = bucketFilter ? bucketFilter.split(":")[0] : "";
    const prevLane = laneSlotLaneRef.current;
    laneSlotLaneRef.current = lane;
    const el = laneSubsRef.current;
    if (!el) return;
    if (prevLane !== lane) {
      el.scrollTop = 0;
      return;
    }
    keepSlotRowInView(el);
  }, [shelfKey, paperKey, bucketFilter]);
  const collSet = activeCollection ? activeCollection.ids : null;
  // Curated bitsets (Phase 2A, design §12): when the collection's
  // descriptor came from the TCU1 bitsets, membership is the packed
  // bitset instead of an id Set — the filter engine tests bits
  // directly, no per-length rebuild, usable from the first seconds
  // of the load.
  const collBitsSel =
    activeCollection && activeCollection.bits ? activeCollection.bits : null;
  const shelfBits =
    activeShelf && activeShelf.bits ? activeShelf.bits : null;
  const paperBits =
    activePaperSel && activePaperSel.bits ? activePaperSel.bits : null;
  const paperTypeBits =
    activePaperType && activePaperType.bits ? activePaperType.bits : null;
  // Selection-driven loading (2026-11-20): in scope mode the
  // resident set is an arbitrary subset of the catalog, so the TCU1
  // bitsets — packed over CATALOG positions — are re-based onto
  // resident positions through the records' catalog ordinals
  // before the engine or the tallies test them. The re-base is
  // incremental over the append-only resident set (filter-engine).
  // Outside scope mode residency is the catalog prefix, positions
  // coincide, and the bitsets pass through untouched.
  const scopeModeOn = isScopeMode();
  const rebaserRef = useRef(null);
  if (!rebaserRef.current) rebaserRef.current = createBitsetRebaser();
  const ordinalAt = (i) =>
    artifacts && artifacts.__columnOrdinalAt
      ? artifacts.__columnOrdinalAt(i)
      : i;
  const rebase = (bits) =>
    scopeModeOn && bits && artifacts
      ? rebaseBitset(rebaserRef.current, bits, ordinalAt, artifacts.length)
      : bits;
  const collBitsSelT = rebase(collBitsSel);
  const shelfBitsT = rebase(shelfBits);
  const paperBitsT = rebase(paperBits);
  const paperTypeBitsT = rebase(paperTypeBits);
  // The single membership bitset the engine and the rank memo test:
  // a curated selection, a Books shelf selection, a Papers
  // field/subfield selection and a Papers type selection AND
  // together (resident-space bitsets of identical length in scope
  // mode; catalog-index bitsets outside it, where the spaces agree).
  const memberBitsSel = useMemo(() => {
    const sets = [collBitsSelT, shelfBitsT, paperBitsT, paperTypeBitsT].filter(
      Boolean
    );
    if (!sets.length) return null;
    if (sets.length === 1) return sets[0];
    const out = new Uint32Array(sets[0].length);
    out.set(sets[0]);
    for (let s = 1; s < sets.length; s++)
      for (let i = 0; i < out.length; i++) out[i] &= sets[s][i];
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collBitsSelT, shelfBitsT, paperBitsT, paperTypeBitsT, artifacts]);
  // The facet tally reads collData's bitsets directly (per-row
  // counts within the other axes), so in scope mode it receives a
  // translated copy: same descriptors, bits re-based. Only the
  // bitsets the tally can reach are translated — the open curated
  // group's collections, the Books shelves when the Books lane is
  // in play, the Papers axes when the Papers lane is in play (the
  // tally's own gates, mirrored).
  const collDataT = useMemo(() => {
    if (!scopeModeOn || !collData || !artifacts) return collData;
    const rb = (c) => (c && c.bits ? { ...c, bits: rebase(c.bits) } : c);
    const out = {
      ...collData,
      groups: collData.groups.map((g) =>
        g.id === collGroup ? { ...g, collections: g.collections.map(rb) } : g
      ),
    };
    if (
      collData.booksShelves &&
      (bucketFilter.split(":")[0] === "BOOKS" || shelfKey)
    ) {
      out.booksShelves = collData.booksShelves.map(rb);
    }
    if (
      collData.papersFields &&
      (bucketFilter.split(":")[0] === "PAPERS" || paperKey || paperTypeKey)
    ) {
      out.papersFields = collData.papersFields.map((f) => ({
        ...rb(f),
        subs: (f.subs || []).map(rb),
      }));
      out.papersTypes = (collData.papersTypes || []).map(rb);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scopeModeOn,
    collData,
    collGroup,
    bucketFilter,
    shelfKey,
    paperKey,
    paperTypeKey,
    artifacts,
  ]);
  // Prime the curated axis from the bitsets at mount (design §12):
  // they ride the TCB1 dataset (a few MB on the wire, parsed in
  // milliseconds) instead of the 17.7 MB hub index, so the axis is
  // ready early. When they land they become the panel's data; the
  // hub fetch remains the fallback for when no dataset exists. The
  // load itself lives in startBitsetsLoad (above) so a group tap can
  // restart it after a failure — the prime is just its first caller.
  useEffect(() => {
    startBitsetsLoad();
  }, [startBitsetsLoad]);
  // Committed browse-filter result (filter engine, FILTER-REVAMP-
  // DESIGN.md §10): the exact match list (catalog indices in display
  // order) plus its count for ONE selection, produced by the chunked
  // engine effect near the rank memo. The rank memo and the results
  // list render only committed results — while a newer selection's
  // job is still running, the previous commit stays on screen whole,
  // so the header count and the rows always describe the same list.
  const [browseResult, setBrowseResult] = useState(null);
  const browseResultRef = useRef(null);
  // Streaming rebuild throttle (design §11.4): while the catalog is
  // still arriving, a length-only change (same selection, longer
  // resident prefix) re-runs the engine at most once per
  // STREAM_RESCAN_MS on a trailing timer instead of once per chunk;
  // the kick state re-enters the effect when the timer fires.
  const [streamKick, setStreamKick] = useState(0);
  const browseFx = useRef(null);
  if (browseFx.current === null) {
    browseFx.current = {
      gen: 0,
      job: null,
      // Latest-only input (design §12): while a scan runs, newer
      // selections land here (one slot — a newer tap replaces the
      // pending one) and drain from the job's onSettle.
      pendingSel: null,
      codes: createBucketCodeTable(),
      memberFor: null,
      memberLen: 0,
      member: null,
      lastScanAt: 0,
      throttleTimer: null,
    };
  }
  // The scan launcher, re-assigned every render so its closures are
  // never stale; the engine's onSettle drains through it too.
  const filterLaunchRef = useRef(null);
  // Subcategories added by the 2026-11-11 revamp (LAW, REFERENCE) are
  // not in the server facet products yet, so — like a hub filter — a
  // search under one runs on the client pipeline (see
  // TOWER_CLIENT_ONLY_SUB_LANES in tower-taxonomy.js).
  const bucketClientOnly =
    (bucketFilter.indexOf(":") > 0 &&
      TOWER_CLIENT_ONLY_SUB_LANES.indexOf(bucketFilter.split(":")[0]) !== -1) ||
    TOWER_CLIENT_ONLY_SUB_KEYS.indexOf(bucketFilter) !== -1;
  // Any filter state the client pipeline owns in server mode.
  const clientFiltersActive =
    !!collSet || !!memberBitsSel || !!eraFilter || bucketClientOnly;
  // Filter scroll stability (2026-10-28 revamp): the 2026-10-25 approach
  // scrolled the Collections block into view after every tap. On mobile
  // that read as a bounce — the tap target jumped away mid-interaction,
  // worst when a subchip row mounted under the visitor's finger. Filter
  // taps now never scroll the page. A handler records the scroll position
  // and the filter panel's viewport offset; the layout effect restores
  // that same offset after the re-render, so rows mounting or unmounting
  // inside the panel never move what the visitor is looking at. Filter
  // logic, counts and click-to-clear are unchanged.
  const filterAnchor = useRef(null);
  // The anchor now also carries the selection the tap PRODUCES
  // (filter perf fix, design §10): the layout effect corrects the
  // panel offset after the tap so rows mounting or unmounting
  // inside the panel never move what the visitor is looking at.
  // Corrections are BOUNDED (2026-11-16 curated-vanish fix): the
  // anchor retires ~600ms after the tap, or once the panel's top
  // has held stable across two consecutive renders, or when the
  // tap's own selection commits — whichever comes first — and a
  // deliberate scroll gesture retires it at once. The old rule
  // corrected on every render until the engine commit landed,
  // which mid-stream could take seconds: the page kept being
  // pulled back to the panel while the visitor was trying to
  // interact with it (the neighbour-row mis-taps and the
  // "deselect doesn't take" feel in Joshua's 2026-11-16 report).
  // A deselect-to-empty never anchors at all: its commit is the
  // engine's zero-predicate fast path, so there is no settle
  // window to absorb.
  const noteFilterAnchor = useCallback((sel) => {
    if (typeof window === "undefined") return;
    const prev = filterAnchor.current;
    if (prev && prev.release) prev.release();
    filterAnchor.current = null;
    if (
      sel &&
      !sel.bucketFilter &&
      !sel.eraFilter &&
      !sel.collKey &&
      !sel.shelfKey &&
      !sel.paperKey &&
      !sel.paperTypeKey
    ) {
      return;
    }
    const el = filterPanelRef.current;
    const anchor = {
      y: window.scrollY || 0,
      top: el ? el.getBoundingClientRect().top : null,
      sel: sel || null,
      at: Date.now(),
      prevTop: null,
      stable: 0,
      release: null,
    };
    // A deliberate scroll gesture retires the anchor immediately —
    // it exists to absorb the tap's own aftermath, never to fight
    // the visitor for the viewport.
    const retire = () => {
      if (filterAnchor.current === anchor) filterAnchor.current = null;
      anchor.release();
    };
    anchor.release = () => {
      window.removeEventListener("wheel", retire);
      window.removeEventListener("touchmove", retire);
    };
    window.addEventListener("wheel", retire, { passive: true });
    window.addEventListener("touchmove", retire, { passive: true });
    filterAnchor.current = anchor;
  }, []);
  useLayoutEffect(() => {
    const anchor = filterAnchor.current;
    if (!anchor) return;
    const retire = () => {
      if (anchor.release) anchor.release();
      if (filterAnchor.current === anchor) filterAnchor.current = null;
    };
    // Bounded corrections (2026-11-16 curated-vanish fix): past
    // ~600ms the anchor never corrects again — the tap's own
    // aftermath is over by then, and anything still settling
    // belongs to the visitor, not the anchor.
    if (Date.now() - anchor.at > 600) {
      retire();
      return;
    }
    const el = filterPanelRef.current;
    let stable = false;
    if (el && anchor.top !== null && typeof window !== "undefined") {
      const nowTop = el.getBoundingClientRect().top;
      const delta = nowTop - anchor.top;
      if (delta) window.scrollTo(0, Math.max(0, window.scrollY + delta));
      // Stability exit: the panel's top holding the same position
      // across two consecutive renders means the tap's layout
      // shifts have landed; further corrections could only fight
      // the visitor.
      if (anchor.prevTop !== null && Math.abs(nowTop - anchor.prevTop) < 0.5) {
        anchor.stable += 1;
      } else {
        anchor.stable = 0;
      }
      anchor.prevTop = nowTop;
      stable = anchor.stable >= 1;
    }
    const committed =
      anchor.sel &&
      browseResult &&
      browseResult.sel.bucketFilter === anchor.sel.bucketFilter &&
      browseResult.sel.eraFilter === anchor.sel.eraFilter &&
      browseResult.sel.collKey === anchor.sel.collKey &&
      browseResult.sel.shelfKey === anchor.sel.shelfKey &&
      browseResult.sel.paperKey === anchor.sel.paperKey &&
      browseResult.sel.paperTypeKey === anchor.sel.paperTypeKey;
    if (committed || stable) retire();
  }, [collGroup, collKey, shelfKey, paperKey, paperTypeKey, bucketFilter, filtersOpen, eraFilter, browseResult]);
  const selectCollGroup = (g) => {
    noteFilterAnchor({ bucketFilter, eraFilter, collKey: "", shelfKey, paperKey, paperTypeKey });
    setCollGroup(g);
    setCollKey("");
    if (g) ensureCollections();
  };
  const selectCollection = (key) => {
    noteFilterAnchor({
      bucketFilter,
      eraFilter,
      collKey: collKey === key ? "" : key,
      shelfKey,
      paperKey,
      paperTypeKey,
    });
    setCollKey((prev) => (prev === key ? "" : key));
  };
  const selectShelf = (key) => {
    const next = shelfKey === key ? "" : key;
    // A Books shelf lives inside the Books lane: selecting one brings
    // the lane with it (the shelf rows render under the Books chip),
    // and the lane chip then truthfully shows where the filter sits.
    const lane =
      next && bucketFilter.split(":")[0] !== "BOOKS" ? "BOOKS" : bucketFilter;
    noteFilterAnchor({ bucketFilter: lane, eraFilter, collKey, shelfKey: next, paperKey, paperTypeKey });
    if (lane !== bucketFilter) setBucketFilter(lane);
    setShelfKey(next);
  };
  const selectPaper = (key) => {
    const next = paperKey === key ? "" : key;
    // A Papers field/subfield lives inside the Papers lane, exactly
    // like a Books shelf inside Books: selecting one brings the lane
    // with it.
    const lane =
      next && bucketFilter.split(":")[0] !== "PAPERS"
        ? "PAPERS"
        : bucketFilter;
    noteFilterAnchor({
      bucketFilter: lane,
      eraFilter,
      collKey,
      shelfKey,
      paperKey: next,
      paperTypeKey,
    });
    if (lane !== bucketFilter) setBucketFilter(lane);
    setPaperKey(next);
  };
  const selectPaperType = (key) => {
    const next = paperTypeKey === key ? "" : key;
    const lane =
      next && bucketFilter.split(":")[0] !== "PAPERS"
        ? "PAPERS"
        : bucketFilter;
    noteFilterAnchor({
      bucketFilter: lane,
      eraFilter,
      collKey,
      shelfKey,
      paperKey,
      paperTypeKey: next,
    });
    if (lane !== bucketFilter) setBucketFilter(lane);
    setPaperTypeKey(next);
  };
  const selectLane = (key) => {
    // Leaving the Books lane retires any Books shelf selection with
    // it — the shelf is a Books subcategory, and carrying it into
    // another lane would intersect to a silent empty set. The same
    // holds for the Papers field/subfield/type selections.
    const dropShelf = shelfKey && key.split(":")[0] !== "BOOKS";
    const dropPaper = (paperKey || paperTypeKey) && key.split(":")[0] !== "PAPERS";
    noteFilterAnchor({
      bucketFilter: key,
      eraFilter,
      collKey,
      shelfKey: dropShelf ? "" : shelfKey,
      paperKey: dropPaper ? "" : paperKey,
      paperTypeKey: dropPaper ? "" : paperTypeKey,
    });
    if (dropShelf) setShelfKey("");
    if (dropPaper) {
      setPaperKey("");
      setPaperTypeKey("");
    }
    setBucketFilter(key);
  };
  const selectEra = (id) => {
    noteFilterAnchor({
      bucketFilter,
      eraFilter: eraFilter === id ? "" : id,
      collKey,
      shelfKey,
      paperKey,
      paperTypeKey,
    });
    setEraFilter((prev) => (prev === id ? "" : id));
  };
  const clearFilters = () => {
    noteFilterAnchor({ bucketFilter: "", eraFilter: "", collKey: "", shelfKey: "", paperKey: "", paperTypeKey: "" });
    setCollGroup("");
    setCollKey("");
    setShelfKey("");
    setPaperKey("");
    setPaperTypeKey("");
    setBucketFilter("");
    setEraFilter("");
  };
  // Stack-card "See all" / subcategory jumps: apply the existing bucket
  // filter, then bring the results into view (the discovery zone hands
  // the page over to the results in the filtered state).
  const browseTo = (bucket) => {
    if (shelfKey && bucket.split(":")[0] !== "BOOKS") setShelfKey("");
    if ((paperKey || paperTypeKey) && bucket.split(":")[0] !== "PAPERS") {
      setPaperKey("");
      setPaperTypeKey("");
    }
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
  // Bumped by the catalog error UI's retry in server mode: re-runs
  // the selection-scope effect so the current selection's scopes
  // re-ensure immediately (2026-11-20).
  const [scopeRetrySeq, setScopeRetrySeq] = useState(0);
  // (The shelfActive state went with the discovery zone — removed
  // 2026-11-12, Ship 2 minimal page: no stacks/featured/shelves.)
  // Cutover (2026-10-29): opening a stack shelf is browse intent — the
  // shelf's groups and tiles are built from the full catalog, so the
  // index starts when a shelf opens (in server mode it no longer
  // auto-starts). Idempotent; a no-op once the index is in or loading.
  // Server mode (2026-11-09): a shelf NEVER starts the client index —
  // that ~880 MB download on a shelf tap is what jetsam-killed phone
  // tabs. Shelves resolve their curated ids against the resident
  // catalog, which the automatic browse stream keeps growing, so a
  // shelf fills in as the catalog arrives instead of demanding it all.
  // (The shelf-open catalog-index effect went with the discovery
  // zone too — shelves no longer exist on this page.)
  // Stage 1 ungating (2026-10-23): the full catalog index no longer loads
  // automatically with the page. It starts when the visitor shows intent —
  // the first change to any browse control (search text, filter, sort,
  // Load more) — or from the approach/idle triggers below. The bootstrap
  // slice stays fully browsable in the meantime.
  const indexIntentSeen = useRef(false);
  const prevIntentDeps = useRef(null);
  useEffect(() => {
    const prev = prevIntentDeps.current;
    prevIntentDeps.current = { query, bucketFilter, sortId, rowBudget, collKey, shelfKey, paperKey, paperTypeKey, eraFilter };
    if (!indexIntentSeen.current) {
      indexIntentSeen.current = true;
      return;
    }
    // Cutover (2026-10-29): with server search the default, a query-only
    // change is answered by /api/catalog-search and must not pull the
    // ~193MB client index. The index still loads on browse-control
    // changes, and for hub filters (collSet) and the strict path — the
    // boundaries serverActive observes. serverFlag is read inside the
    // callback only (post-render), never in the deps array.
    const queryOnly =
      prev &&
      prev.query !== query &&
      prev.bucketFilter === bucketFilter &&
      prev.sortId === sortId &&
      prev.rowBudget === rowBudget &&
      prev.collKey === collKey &&
      prev.shelfKey === shelfKey &&
      prev.paperKey === paperKey &&
      prev.paperTypeKey === paperTypeKey &&
      prev.eraFilter === eraFilter;
    if (queryOnly && serverFlag && !clientFiltersActive && strictQuery !== query)
      return;
    // Server mode (2026-11-09): every other browse control is answered
    // by the server too — queries by server search, lanes/filters/sorts
    // over the resident catalog — so none of them may pull the client
    // index (the phone crash). A Load more past the resident set grows
    // the browse scope on demand (the selection-scope effect below
    // owns rowBudget now). The client pipeline still owns hub filters
    // (collSet) and the strict path, exactly the boundaries
    // serverActive observes.
    if (serverFlag && !clientFiltersActive && strictQuery !== query) {
      return;
    }
    requestCatalogIndex();
  }, [query, bucketFilter, sortId, rowBudget, collKey, shelfKey, paperKey, paperTypeKey, eraFilter]);
  // Automatic start (2026-10-28, Joshua's direct order): the explicit-
  // intent-only rule below left the library presenting as a 20,000-work
  // library — plain scrolling never started the index, the header count
  // sat at the bootstrap size, and on mobile the rest of the library
  // effectively never arrived. The index now starts on its own once
  // this section is on screen: the visitor's first scroll, or a short
  // delay while the tab is visible, whichever comes first. This is a
  // SINGLE one-shot trigger, armed after the bootstrap paints — not
  // the three stacked passive loads (approach trigger + 12s idle +
  // landing manifest warm) whose combination jetsam-killed mobile
  // Safari tabs in the 2026-10-27 crash loop. Scope: the library
  // page, and — since 2026-11-11, Joshua's explicit reversal of the
  // one-day landing-lazy gate — the combined Tower landing too,
  // which auto-starts at open on these same triggers.
  // Chunks publish progressively, so the header count climbs visibly
  // from 20,000 to the full catalog instead of sitting on a wrong
  // number with no sign anything is loading.
  useEffect(() => {
    // Server mode (2026-11-20, Joshua's selection-driven directive —
    // supersedes the 2026-10-28 / 2026-11-11 auto-load orders): the
    // catalog does NOT auto-load at all. Boot carries the bootstrap
    // prefix and the navigation layer only; each filter selection
    // loads its own scope (the selection-scope effect below), and
    // loaded scopes accumulate. The full-catalog stream behind the
    // old triggers was the weight that stalled the boot fetch into
    // "The catalog couldn't be loaded" and jetsam-killed phone tabs
    // when visitors tapped filters mid-stream (his 2026-11-19
    // recordings). ?server=0 restores the client behavior below
    // unchanged.
    if (serverFlag) {
      return;
    }
    let done = false;
    let timer = null;
    const start = () => {
      if (done) return;
      done = true;
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
      requestCatalogIndex();
    };
    // Same contract as the server branch above (2026-11-11): on
    // the combined landing the client index also starts at open on
    // the same one-shot triggers — the landing-lazy route gate is
    // gone from both branches.
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
  // page and (2026-11-11) the Tower landing. Do not re-add the
  // approach/idle stack.
  // Selection-driven loading (2026-11-20, Joshua's directive): the
  // boot hands the bootstrap array to the scope store, and every
  // active filter selection ensures its own scope is loaded —
  // collection/bucket/era selections page the matching server facet,
  // curated/shelf/Papers selections hydrate their bitset's member
  // ordinals, and the unfiltered list grows by browse pages as its
  // row budget grows. Scopes accumulate in the store (catalog.js);
  // deselecting never unloads. A scope whose load exhausted its
  // retries is re-ensured on a bounded backoff while it belongs to
  // the current selection, and the error UI's retry bumps
  // scopeRetrySeq to re-run this effect immediately.
  const scopeLoadersRef = useRef(new Map());
  const scopeOrdCacheRef = useRef(new Map());
  const scopeRetryRef = useRef(new Map());
  // Scope state as React state (2026-11-20 correction): the panel
  // and the results header read scope status/totals from here —
  // which scopes the current selection needs, each one's true total
  // and landed count — instead of inferring "final" counts from the
  // resident prefix. Updated by catalog.js's scope notifications.
  const [scopeSnap, setScopeSnap] = useState(() => getScopeSnapshot());
  const [selScopeKeys, setSelScopeKeys] = useState([]);
  useEffect(() => onScopeChange((snap) => setScopeSnap(snap)), []);
  // Published tallies state (see loadTallies above): the static
  // file loads once with the navigation layer; the server tallies
  // refetch when the facet-axis selection changes (collection /
  // bucket / era), keyed by that selection's signature.
  const [staticTallies, setStaticTallies] = useState(null);
  useEffect(() => {
    let live = true;
    loadTallies().then((t) => {
      if (live && t) setStaticTallies(t);
    });
    return () => {
      live = false;
    };
  }, []);
  const [serverTallies, setServerTallies] = useState(null);
  useEffect(() => {
    if (!serverFlag) return;
    const params = {};
    if (bucketFilter) {
      if (bucketFilter.includes(":")) params.bucket = bucketFilter;
      else params.collection = bucketFilter;
    }
    if (eraFilter) {
      const bands = ERA_LOAD_BANDS[eraFilter] || [];
      if (bands.length === 1) params.era = bands[0];
    }
    let live = true;
    fetchServerTallies(params)
      .then((t) => {
        if (live && t) setServerTallies({ sig: JSON.stringify(params), data: t });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // serverFlag read inside the callback only (TDZ convention).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketFilter, eraFilter]);
  useEffect(() => {
    if (!serverFlag) return;
    if (artifacts && Array.isArray(artifacts)) initScopeMode(artifacts);
    if (!isScopeMode()) return;
    // Priority (2026-11-20 correction): every selection change
    // takes a new tier and its scopes enqueue at that tier, so the
    // visitor's current selection loads ahead of anything queued
    // for an older one (the queue yields between steps).
    const prio = bumpScopePriority();
    const loaders = new Map();
    if (bucketFilter) {
      const key = bucketFilter.includes(":")
        ? `facet:bucket:${bucketFilter}`
        : `facet:collection:${bucketFilter}`;
      const filters = bucketFilter.includes(":")
        ? { bucket: bucketFilter }
        : { collection: bucketFilter };
      // Published total as the scope's totalHint (2026-11-20
      // counts-speed fix): the parallel stepper bounds its first
      // batch by the known total instead of speculatively paging
      // past the end of small scopes (Documents: 363 records, one
      // page). Absent the tallies file the hint is 0 = unknown and
      // the first page's response teaches the total, as before.
      const hint = bucketFilter.includes(":")
        ? staticTallies?.buckets?.[bucketFilter]
        : staticTallies?.collections?.[bucketFilter];
      loaders.set(key, () => ensureFacetScope(key, filters, prio, hint || 0));
    }
    if (eraFilter) {
      for (const band of ERA_LOAD_BANDS[eraFilter] || []) {
        const key = `facet:era:${band}`;
        loaders.set(key, () => ensureFacetScope(key, { era: band }, prio));
      }
    }
    const bitsScope = (desc) => {
      if (!desc || !desc.bits || !desc.key) return;
      const key = `bits:${desc.key}`;
      loaders.set(key, () => {
        let ords = scopeOrdCacheRef.current.get(desc.bits);
        if (!ords) {
          ords = ordinalsFromBitset(desc.bits);
          scopeOrdCacheRef.current.set(desc.bits, ords);
        }
        ensureIndicesScope(key, ords, prio);
      });
    };
    bitsScope(activeCollection);
    bitsScope(activeShelf);
    bitsScope(activePaperSel);
    bitsScope(activePaperType);
    if (
      !bucketFilter &&
      !eraFilter &&
      !collKey &&
      !shelfKey &&
      !paperKey &&
      !paperTypeKey &&
      !query
    ) {
      loaders.set("browse", () => ensureBrowseRows(rowBudget, prio));
    }
    scopeLoadersRef.current = loaders;
    setSelScopeKeys([...loaders.keys()]);
    for (const fn of loaders.values()) fn();
    const failed = [...loaders.keys()].filter(
      (k) => getScopeStatus(k) === "failed"
    );
    if (!failed.length) return;
    const attempts = Math.max(
      ...failed.map((k) => scopeRetryRef.current.get(k) || 0)
    );
    if (attempts >= 5) return;
    const delay = [5000, 10000, 20000, 40000, 60000][
      Math.min(attempts, 4)
    ];
    const t = setTimeout(() => {
      for (const k of failed) {
        scopeRetryRef.current.set(k, (scopeRetryRef.current.get(k) || 0) + 1);
        const fn = scopeLoadersRef.current.get(k);
        if (fn) fn();
      }
    }, delay);
    return () => clearTimeout(t);
    // serverFlag is read inside the callback only (post-render),
    // never in the deps array: it is declared further down the
    // component, so naming it here would evaluate the binding
    // before initialization (the same convention the intent effect
    // above follows).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    artifacts,
    bucketFilter,
    eraFilter,
    collKey,
    shelfKey,
    paperKey,
    paperTypeKey,
    activeCollection,
    activeShelf,
    activePaperSel,
    activePaperType,
    rowBudget,
    query,
    scopeRetrySeq,
  ]);
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
  }, [listQuery, bucketFilter, sortId, collKey, shelfKey, paperKey, paperTypeKey, eraFilter]);
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
  const identityCacheRef = useRef([]);
  const identityOrder = useMemo(() => {
    // Identity order is prefix-stable: extend the cached array to
    // the new length instead of rebuilding it per publish (the old
    // Array.from ran a 2.5M-callback pass on every stream publish).
    const len = artifacts ? artifacts.length : 0;
    const cache = identityCacheRef.current;
    for (let k = cache.length; k < len; k++) cache.push(k);
    return cache.length === len ? cache : cache.slice(0, len);
  }, [artifacts]);
  // Hub-seeded catalog counts (state declared here, populated by the
  // hubs-index effect below): the stats strip and the stacks read
  // these, so they show the library's real totals from first paint.
  const [serverCounts, setServerCounts] = useState(null);
  const [serverTotal, setServerTotal] = useState(null);
  // Stats-strip collection count (2026-11-11 presentation-stability
  // fix): the ONLY truthful values are the hubs seed's count (the
  // library's real seven, static truth) and the derivation's count
  // once the derivation has completed over the FULL catalog
  // (fullIndexReady && deriveFinal). A partial derivation count never
  // displays: the previous logic fell back to the derivation (or a
  // bootstrap Set scan) whenever the seed hadn't landed or the moment
  // fullIndexReady flipped — both read the resident prefix, which
  // lacks DOCUMENTS until the stream's tail, so the header showed 6
  // and flipped to 7 mid-load in Joshua's 18:28 phone video. Before
  // the seed lands the value holds at the last truthful one shown,
  // or null (the strip renders a steady dash) if none has.
  const truthfulCollRef = useRef(null);
  const collectionsCount = useMemo(() => {
    let v = null;
    if (fullIndexReady && deriveFinal && towerData)
      v = towerData.collections.length;
    else if (serverCounts) v = Object.keys(serverCounts).length;
    if (v != null) truthfulCollRef.current = v;
    return v != null ? v : truthfulCollRef.current;
  }, [artifacts, towerData, serverCounts, fullIndexReady, deriveFinal]);
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
  const activeBucketLabel = bucketFilter
    ? bucketFilter.indexOf(":") > -1
      ? towerSubLabel(activeLane, bucketFilter.split(":")[1]) ||
        TOWER_TOP_LABELS[activeLane] ||
        activeLane
      : TOWER_TOP_LABELS[activeLane] || activeLane
    : "";
  const activeFilterSummary =
    [
      activeCollection ? activeCollection.label : "",
      activeShelf && bucketFilter.split(":")[0] === "BOOKS"
        ? activeShelf.label
        : activePaperSel && bucketFilter.split(":")[0] === "PAPERS"
          ? activePaperSel.label
          : activeBucketLabel,
      activePaperType && bucketFilter.split(":")[0] === "PAPERS"
        ? activePaperType.label
        : "",
      eraFilter ? towerEraLabel(eraFilter) : "",
    ]
      .filter(Boolean)
      .join(" · ") || "All entries";
  // Dynamic facet counts (2026-11-15 collections package): every
  // axis of the filter panel counts WITHIN the selection formed by
  // the OTHER axes — era chips within bucket ∧ curated ∧ shelf, lane
  // and subcategory counts within era ∧ curated ∧ shelf, curated
  // rows within bucket ∧ era ∧ shelf, Books shelves within bucket ∧
  // era ∧ curated — all tallied from the same per-record data the
  // results list and the spiral read (phase 0's bucketKeys/eraCodes
  // and the TCU1 bitsets), so panel, results and scene can never
  // disagree about a combination. Null when no cross-axis selection
  // is active (the panel then uses the global sources, as before) or
  // while the derivation is not final (prefix counts are never
  // dressed as finals — the panel shows no numbers in that state).
  //
  // The tally itself runs OFF the render path (2026-11-16
  // curated-vanish fix): it used to be a synchronous useMemo whose
  // bitset walks landed on every selection tap — and re-ran on
  // post-completion derivation publishes — freezing the panel for
  // the length of the walk exactly when the visitor was tapping.
  // It now runs as the chunked job in facetCountSteps (above),
  // latest-wins like the browse engine: the effect below (re)starts
  // it when the tally's inputs change, and the finished counts
  // commit atomically into state. Until a commit lands the panel
  // keeps showing the previous committed tallies — the same
  // committed pattern the results list follows. One case deserves
  // a note: the curated axis's own counts provably do not depend on
  // the curated member (they are computed within bucket ∧ era ∧
  // shelf), so a curated-only tap cannot invalidate the numbers
  // the curated rows are already showing while the job re-runs.
  const [facetCounts, setFacetCounts] = useState(null);
  const facetJobRef = useRef(null);
  const facetCommitRef = useRef(null);
  useEffect(() => {
    // countsReady, not its countsFinal alias: the alias is declared
    // further down the component (TDZ — referencing it here crashed
    // the page on first render, 2026-11-15).
    if (
      !countsReady ||
      !towerData ||
      !towerData.bucketKeys ||
      !towerData.eraCodes ||
      (!bucketFilter &&
        !eraFilter &&
        !memberBitsSel &&
        !collBitsSelT &&
        !collSet)
    ) {
      if (facetJobRef.current) {
        facetJobRef.current.cancel();
        facetJobRef.current = null;
      }
      setFacetCounts(null);
      return;
    }
    const input = {
      towerData,
      artifacts,
      bucketCodeTable: browseFx.current ? browseFx.current.codes : null,
      bucketFilter,
      eraFilter,
      memberBitsSel,
      collBitsSel: collBitsSelT,
      shelfBits: shelfBitsT,
      paperBits: paperBitsT,
      paperTypeBits: paperTypeBitsT,
      collSet,
      collData: collDataT,
      collGroup,
      shelfKey,
      paperKey,
      paperTypeKey,
    };
    const job = startFacetJob(input, (result) => {
      if (facetJobRef.current === job) {
        facetJobRef.current = null;
        // Commit provenance (2026-11-20 correction): which resident
        // length + selection these tallies describe. In scope mode
        // the panel shows them only while that provenance matches
        // the current artifacts/selection AND the selection's
        // scopes have fully landed (facetCountsShown, below).
        facetCommitRef.current = {
          len: (artifacts || []).length,
          sel: [bucketFilter, eraFilter, collKey, shelfKey, paperKey, paperTypeKey].join("|"),
        };
        setFacetCounts(result);
      }
    });
    facetJobRef.current = job;
    return () => {
      job.cancel();
      if (facetJobRef.current === job) facetJobRef.current = null;
    };
  }, [
    countsReady,
    towerData,
    artifacts,
    bucketFilter,
    eraFilter,
    memberBitsSel,
    collBitsSelT,
    shelfBitsT,
    paperBitsT,
    paperTypeBitsT,
    collSet,
    collDataT,
    collGroup,
    shelfKey,
    paperKey,
    paperTypeKey,
  ]);
  // ---- Scope-mode truthfulness (2026-11-20 correction) ----------
  // In scope mode the resident set is the bootstrap prefix plus the
  // scopes loaded so far — a PARTIAL set by design. Three things
  // the first scope build got wrong, all from treating that partial
  // set as final (Joshua's 2026-11-20 phone recording):
  //   1. isBrowseComplete() flips true whenever the scope queue
  //      drains — including at boot over the 20,000-record prefix —
  //      so countsReady/countsFinal dressed prefix counts as the
  //      library's finals (Law 0, era counts of the prefix).
  //   2. The resident facet tallies therefore committed over the
  //      prefix the moment any selection was tapped, collapsing
  //      every panel count to prefix numbers.
  //   3. The results header divided by the resident length, so a
  //      selection read "… OF 20000 ENTRIES" no matter its size.
  // The fixes: resident tallies (facetCounts) are shown in scope
  // mode ONLY when every scope the current selection needs has
  // fully landed and the tally's commit provenance matches the
  // current resident set + selection (facetCountsShown); until
  // then the panel reads published tallies (static file + server
  // facet tallies) and descriptor counts, which are exact from
  // boot. The header divides by the selection's true total (the
  // tightest published/server/scope bound), never the prefix.
  const selScopeList = selScopeKeys.map((k) => ({
    key: k,
    ...(scopeSnap[k] || { status: "idle", total: 0, loaded: 0 }),
  }));
  const selScopesLoading = selScopeList.some(
    (s) => s.status === "loading" || s.status === "idle"
  );
  const selScopesReady =
    selScopeKeys.length > 0 && selScopeList.every((s) => s.status === "ready");
  // Header-bound settle gate (2026-11-20 counts-speed fix): the
  // results header swaps its denominator to the resident match
  // count once the selection's scopes are ready (LibraryResults),
  // but the filter scan producing that count commits
  // asynchronously and lags the final publish — so the
  // denominator transiently DROPPED to the lagging count at the
  // tail of a load (Law 1,277,197 -> 1,260,000 in the verification
  // harness; Joshua's 16:27 recording: 41,137 -> 40,037). The swap
  // is truthful only once the committed scan covers the current
  // resident set AND the current selection; until then the
  // published bound stands. (Same commit-coverage discipline as
  // facetCountsShown below.)
  const scopeScanSettled =
    !!browseResult &&
    !!browseResult.sel &&
    browseResult.sel.len === (artifacts || []).length &&
    browseResult.sel.keysLen ===
      (towerData && towerData.bucketKeys ? towerData.bucketKeys.length : 0) &&
    browseResult.sel.bucketFilter === bucketFilter &&
    browseResult.sel.eraFilter === eraFilter &&
    browseResult.sel.collKey === collKey &&
    browseResult.sel.shelfKey === shelfKey &&
    browseResult.sel.paperKey === paperKey &&
    browseResult.sel.paperTypeKey === paperTypeKey &&
    browseResult.sel.collSet === collSet &&
    browseResult.sel.collBits === memberBitsSel;
  const selSigNow = [bucketFilter, eraFilter, collKey, shelfKey, paperKey, paperTypeKey].join("|");
  const facetCountsShown =
    facetCounts &&
    (!scopeModeOn ||
      (selScopesReady &&
        facetCommitRef.current &&
        facetCommitRef.current.len === (artifacts || []).length &&
        facetCommitRef.current.sel === selSigNow))
      ? facetCounts
      : null;
  const serverTalliesCurrent =
    serverTallies &&
    serverTallies.sig ===
      JSON.stringify(
        bucketFilter
          ? eraFilter && (ERA_LOAD_BANDS[eraFilter] || []).length === 1
            ? bucketFilter.includes(":")
              ? { bucket: bucketFilter, era: ERA_LOAD_BANDS[eraFilter][0] }
              : { collection: bucketFilter, era: ERA_LOAD_BANDS[eraFilter][0] }
            : bucketFilter.includes(":")
              ? { bucket: bucketFilter }
              : { collection: bucketFilter }
          : eraFilter && (ERA_LOAD_BANDS[eraFilter] || []).length === 1
            ? { era: ERA_LOAD_BANDS[eraFilter][0] }
            : {}
      )
      ? serverTallies.data
      : null;
  // The selection's true total as a header bound: the tightest
  // exact-or-upper published number available — the server tallies'
  // faceted total for a facet-axis selection, the static file's
  // fine-era total for an era selection, each selected bitset
  // scope's member count, each facet scope's server total. When
  // every scope is ready the resident match count IS the total and
  // the header uses it directly (see LibraryResults props below).
  const selTotalBound = (() => {
    if (!scopeModeOn) return 0;
    let bound = 0;
    const consider = (n) => {
      if (n && n > 0) bound = bound ? Math.min(bound, n) : n;
    };
    if ((bucketFilter || eraFilter) && serverTalliesCurrent) {
      consider(serverTalliesCurrent.total);
    }
    if (eraFilter && staticTallies && staticTallies.eras) {
      consider(staticTallies.eras[eraFilter]);
    }
    for (const s of selScopeList) {
      if (s.key.startsWith("bits:")) consider(s.total);
      else if (s.key.startsWith("facet:") && !eraFilter) consider(s.total);
    }
    if (!bucketFilter && !eraFilter && !collKey && !shelfKey && !paperKey && !paperTypeKey) {
      consider(worksTotalHintSafe());
    }
    return bound;
  })();
  function worksTotalHintSafe() {
    return serverTotal != null ? serverTotal : getBrowseTotalHint() || 0;
  }
  // Browse filter engine job (2026-11-11, design §10): computes the
  // committed match list for the current selection ONCE per
  // (selection, sort order, catalog length) — chunked into ~7ms
  // slices off typed arrays, latest-wins via the generation counter:
  // a newer selection (or a longer resident prefix) cancels the
  // running job at its next slice boundary and a superseded job never
  // commits. This replaces the memo's per-render full-catalog walks,
  // whose cost per click at 2.56M records — with a curated collection
  // active, a Proxy record materialization + id decode + Set hash per
  // record — froze the main thread for seconds per tap and, stacked
  // across rapid taps, tore the UI and jetsam-killed phone tabs.
  // The scan launcher (design §12): runs ONE selection's scan to a
  // commit. Re-assigned every render (fresh closures); the engine's
  // onSettle drains the pending latest selection through it.
  filterLaunchRef.current = (sel) => {
    const fx = browseFx.current;
    const gen = ++fx.gen;
    const commit = (indices, count) => {
      if (fx.gen !== gen) return;
      const res = { sel, indices, count };
      browseResultRef.current = res;
      setBrowseResult(res);
    };
    // Zero-predicate fast path: the whole resident order, in order —
    // committed as-is, no scan at all.
    if (!sel.bucketFilter && !sel.eraFilter && !sel.collSet && !sel.collBits) {
      commit(sel.order, sel.order.length);
      return;
    }
    const mask = bucketMaskFor(fx.codes, sel.bucketFilter);
    let member = null;
    if (sel.collSet) {
      if (
        fx.memberFor !== sel.collSet ||
        fx.memberLen !== sel.len ||
        !fx.member
      ) {
        fx.member = buildMembershipBitset(sel.idIndex, sel.collSet, sel.len);
        fx.memberFor = sel.collSet;
        fx.memberLen = sel.len;
      }
      member = fx.member;
    }
    const eraCodeWanted = sel.eraFilter
      ? TOWER_ERAS.findIndex((e) => e.id === sel.eraFilter) + 1
      : 0;
    fx.job = startFilterScan({
      order: sel.order,
      bucketCodes: fx.codes.codes,
      bucketMask: mask,
      eraCodes: sel.eraCodes,
      eraCode: eraCodeWanted,
      member,
      memberBits: sel.collBits || null,
      kernels: getTowerKernels(),
      isCurrent: () => fx.gen === gen,
      onCommit: (indices, count) => commit(indices, count),
      onSettle: () => {
        fx.job = null;
        const p = fx.pendingSel;
        fx.pendingSel = null;
        if (!p) return;
        // A pending selection identical to what just committed
        // (the visitor tapped back to the running selection) needs
        // no second scan.
        const cur = browseResultRef.current;
        if (
          cur &&
          cur.sel.bucketFilter === p.bucketFilter &&
          cur.sel.eraFilter === p.eraFilter &&
          cur.sel.collKey === p.collKey &&
          cur.sel.shelfKey === p.shelfKey &&
          cur.sel.paperKey === p.paperKey &&
          cur.sel.paperTypeKey === p.paperTypeKey &&
          cur.sel.collSet === p.collSet &&
          cur.sel.collBits === p.collBits &&
          cur.sel.order === p.order &&
          cur.sel.len === p.len &&
          cur.sel.keysLen === p.keysLen
        ) {
          return;
        }
        filterLaunchRef.current(p);
      },
    });
  };
  // Unmount-only teardown for the filter machinery (design §12):
  // dependency changes must NOT cancel a running scan (the
  // latest-only queue replaces the old cancel-and-restart), so the
  // cancel lives here, in an effect that runs its cleanup once.
  useEffect(() => {
    return () => {
      const fx = browseFx.current;
      if (!fx) return;
      if (fx.job) {
        fx.job.cancel();
        fx.job = null;
      }
      if (fx.throttleTimer) {
        clearTimeout(fx.throttleTimer);
        fx.throttleTimer = null;
      }
      fx.pendingSel = null;
    };
  }, []);
  useEffect(() => {
    if (!towerData || !artifacts || !towerOrder) return undefined;
    // While a real query is being answered by the blended search
    // pipeline the browse list is not rendered — don't spend the
    // cycles. (A 0-1 character query still browses in catalog order;
    // the memo's short-query branch reads this same committed result.)
    if (query && query.trim().length >= 2 && towerData.haystacks)
      return undefined;
    const fx = browseFx.current;
    const sel = {
      bucketFilter,
      eraFilter,
      collKey,
      shelfKey,
      paperKey,
      paperTypeKey,
      collSet,
      collBits: memberBitsSel,
      order: towerOrder,
      len: artifacts.length,
      // Derivation coverage (2026-11-13 arrival fix): the scan reads
      // bucket membership from the code table built over
      // towerData.bucketKeys, whose length is the derivation's
      // coverage of the resident catalog. While the derivation lags
      // the stream (its runs are latest-only now, but a heavy prefix
      // still trails the newest publish), two selections can share
      // every field above yet scan different data — so coverage is
      // part of the selection's identity wherever "already current"
      // is decided (the no-op return below, the settle drain). A
      // committed result computed over a shorter bucketKeys is NOT
      // the latest intent once a longer derivation lands, even when
      // the resident length and the selection are unchanged — that
      // exact case stranded an early Law selection on its starter-
      // pack zero (or a frozen prefix count) past load completion,
      // because the completion derivation changed nothing the old
      // checks compared.
      keysLen: towerData.bucketKeys ? towerData.bucketKeys.length : 0,
      bucketKeys: towerData.bucketKeys,
      eraCodes: towerData.eraCodes,
      idIndex: towerData.idIndex,
    };
    const cur = browseResultRef.current;
    const sameSel =
      cur &&
      cur.sel.bucketFilter === sel.bucketFilter &&
      cur.sel.eraFilter === sel.eraFilter &&
      cur.sel.collKey === sel.collKey &&
      cur.sel.shelfKey === sel.shelfKey &&
      cur.sel.paperKey === sel.paperKey &&
      cur.sel.paperTypeKey === sel.paperTypeKey &&
      cur.sel.collSet === sel.collSet &&
      cur.sel.collBits === sel.collBits &&
      cur.sel.order === sel.order;
    if (sameSel && cur.sel.len === sel.len && cur.sel.keysLen === sel.keysLen) {
      // The committed result already IS the latest intent — same
      // selection, same resident length, same derivation coverage.
      fx.pendingSel = null;
      return undefined;
    }
    // Streaming throttle (§11.4): the selection is unchanged and only
    // the resident prefix grew, and the catalog is still arriving —
    // don't restart the scan for every chunk. The committed result
    // stays on screen; a trailing timer re-enters the effect once
    // the cadence window has elapsed. Selection changes and the
    // final publish (fullIndexReady) always scan immediately.
    if (sameSel && !fullIndexReady) {
      const now = Date.now();
      const since = now - fx.lastScanAt;
      if (fx.lastScanAt && since < STREAM_RESCAN_MS) {
        // Latest-only: the growth re-scan becomes the pending
        // intent (a running job drains it on settle); the trailing
        // timer covers the idle case, as before.
        fx.pendingSel = sel;
        if (!fx.throttleTimer) {
          fx.throttleTimer = setTimeout(() => {
            fx.throttleTimer = null;
            setStreamKick((k) => k + 1);
          }, STREAM_RESCAN_MS - since);
        }
        return undefined;
      }
    }
    if (fx.throttleTimer) {
      clearTimeout(fx.throttleTimer);
      fx.throttleTimer = null;
    }
    fx.lastScanAt = Date.now();
    // Bucket codes extend over just the newly resident tail on EVERY
    // catalog version — including unfiltered ones — so the one full
    // encoding pass is spread across the stream's publishes instead
    // of landing as a single task on the visitor's first filtered
    // tap (measured in the storm harness, design §10.4).
    extendBucketCodes(fx.codes, towerData.bucketKeys);
    // Latest-only input (design §12): a running scan is NEVER
    // cancelled for a newer tap. The latest selection takes the
    // single pending slot (a still-newer tap replaces it) and the
    // running job's onSettle launches it — at most one scan in
    // flight and one pending, so filter transients stay bounded
    // no matter how fast taps arrive, and the final selection
    // always lands.
    if (fx.job) {
      fx.pendingSel = sel;
      return undefined;
    }
    // Launching immediately (RC-1, 2026-11-14): any pending snapshot
    // predates this selection (stored by an earlier render, possibly
    // mid-stream). Drop it so it cannot drain over this scan when it
    // settles and overwrite the result with a stale selection.
    fx.pendingSel = null;
    filterLaunchRef.current(sel);
    return undefined;
  }, [towerData, artifacts, towerOrder, bucketFilter, eraFilter, collSet, memberBitsSel, collKey, shelfKey, paperKey, paperTypeKey, query, fullIndexReady, streamKick]);
  const { rankMap, matchCount, rankedIndices, blendedModel, browseIndices } = useMemo(() => {
    const map = new Map();
    if (!artifacts || !towerData)
      return { rankMap: map, matchCount: 0, rankedIndices: null, browseIndices: null };
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
      collSet
        ? collSet.has(artifacts[i].artifact_id)
        : memberBitsSel
          ? (memberBitsSel[i >> 5] & (1 << (i & 31))) !== 0
          : true;
    // Era filter (2026-11-11): era codes were precomputed per record
    // in derivation phase 0, so this is one typed-array read. A record
    // with no usable year (code 0) matches no era selection.
    const eraCodeWanted = eraFilter
      ? TOWER_ERAS.findIndex((e) => e.id === eraFilter) + 1
      : 0;
    const passesEra = (i) =>
      !eraCodeWanted ||
      !towerData.eraCodes ||
      towerData.eraCodes[i] === eraCodeWanted;
    const qNorm = q ? normText(q) : "";
    if (!qNorm || !towerData.haystacks) {
      // Browsing: the chosen sort order governs, as before. (Also the
      // phase-0 path: until the search data lands, a typed query browses
      // in catalog order rather than blocking on the indexing.) Only the
      // first `rowBudget` ranks are materialized into the map (they are
      // the only rows that can mount).
      // Browse results (filter perf fix 2026-11-11, design §10): the
      // match list + count are the filter engine's last COMMITTED
      // result — this memo only windows the committed list into
      // ranks, it never scans the catalog for browsing. While the
      // engine's job for the current selection is still running, the
      // previous commit renders whole: header count and rows always
      // describe the same list (the parity invariant), and nothing
      // half-computed ever paints (the tearing in the recording).
      const committed = browseResultRef.current;
      if (committed) {
        const idx = committed.indices;
        const lim = Math.min(idx.length, rowBudget);
        for (let k = 0; k < lim; k++)
          map.set(artifacts[idx[k]].artifact_id, k + 1);
        return {
          rankMap: map,
          matchCount: committed.count,
          rankedIndices: null,
          blendedModel: null,
          browseIndices: idx,
        };
      }
      // Before the first commit exists (the first paint after the
      // data lands, one effect cycle), fall back to the precomputed
      // counts + a window-only walk — the old fast path, unchanged.
      // Fast count (filter revamp 2026-11-11): with no hub filter in
      // play, the exact match count is already known from phase 0's
      // precomputed counts — bucket totals, era totals, and bucket×era
      // intersections — so the loop only walks far enough to fill the
      // visible window and early-exits. (During streaming the
      // precomputed counts cover the same resident prefix the scan
      // would, so the semantics are unchanged.)
      const knownCount =
        !collSet && !memberBitsSel && towerData.eraCounts
          ? eraFilter
            ? bucketFilter
              ? towerData.bucketEraCounts[bucketFilter + "|" + eraFilter] || 0
              : towerData.eraCounts[eraFilter] || 0
            : bucketFilter
              ? bucketFilter.indexOf(":") > -1
                ? towerData.subCounts[bucketFilter] || 0
                : towerData.counts[bucketFilter] || 0
              : towerOrder.length
          : null;
      let count = 0;
      for (let k = 0; k < towerOrder.length; k++) {
        const i = towerOrder[k];
        if (!passesBucket(i) || !passesCollection(i) || !passesEra(i)) continue;
        count++;
        if (map.size < rowBudget) map.set(artifacts[i].artifact_id, count);
        else if (knownCount !== null) break;
      }
      return {
        rankMap: map,
        matchCount: knownCount !== null ? knownCount : count,
        rankedIndices: null,
        blendedModel: null,
        browseIndices: null,
      };
    }
    // Searching (Workstream D, SPEC-6): ONE blended list. Catalog-field
    // matches (BM25F over title/creator/subject/description) and full-text
    // matches (BM25 from the deep index, weight x1) merge into a single
    // score per work, deduped by work, pins first. The sort dropdown
    // governs browsing only; while a query is active the best answer
    // leads. Below 2 characters the blended pipeline does not engage and
    // the query browses in catalog order (previous behavior).
    if (q.trim().length < 2) {
      // Same committed browse result as the no-query branch (design
      // §10); the legacy full walk below remains only as the
      // pre-first-commit fallback.
      const committed = browseResultRef.current;
      if (committed) {
        const idx = committed.indices;
        const lim = Math.min(idx.length, rowBudget);
        for (let k = 0; k < lim; k++)
          map.set(artifacts[idx[k]].artifact_id, k + 1);
        return {
          rankMap: map,
          matchCount: committed.count,
          rankedIndices: null,
          blendedModel: null,
          browseIndices: idx,
        };
      }
      let count = 0;
      for (let k = 0; k < towerOrder.length; k++) {
        const i = towerOrder[k];
        if (!passesBucket(i) || !passesCollection(i) || !passesEra(i)) continue;
        count++;
        if (map.size < rowBudget) map.set(artifacts[i].artifact_id, count);
      }
      return { rankMap: map, matchCount: count, rankedIndices: null, blendedModel: null, browseIndices: null };
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
      if (!passesBucket(i) || !passesCollection(i) || !passesEra(i)) continue;
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
            if (!passesBucket(i) || !passesCollection(i) || !passesEra(i)) continue;
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
            if (!passesBucket(i) || !passesCollection(i) || !passesEra(i)) continue;
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
          if (!passesBucket(i) || !passesCollection(i) || !passesEra(i)) continue;
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
        if (ix !== undefined && !passesEra(ix)) continue;
        if (
          ix === undefined &&
          eraCodeWanted &&
          towerEraCode(w.doc.year) !== eraCodeWanted
        )
          continue;
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
    return { rankMap: map, matchCount: total, rankedIndices: null, blendedModel, browseIndices: null };
  }, [q, bucketFilter, eraFilter, sortId, towerOrder, artifacts, towerData, rowBudget, collSet, memberBitsSel, deep, strictQuery, browseResult]);
  // ---- Phase B: server-side catalog search (CUTOVER, 2026-10-29) -------
  // Server search is the DEFAULT: the SEARCH path routes to
  // /api/catalog-search and adapts its pages into the blendedModel shape
  // LibraryResults already renders, so the results UI is untouched.
  // ?server=0 opts out (persisted to localStorage) and restores the full
  // client pipeline; ?server=1 clears the opt-out. Boundaries (unchanged
  // from the flag phase): a hub collection filter (collSet) has no server
  // equivalent and keeps the client pipeline, as does the strict/undo
  // path (strictQuery === q). Browse mode (2026-11-09): the catalog
  // streams in automatically as server browse pages (startCatalogBrowse)
  // — the client index is never downloaded in server mode; if a server
  // SEARCH fetch fails, the client model takes over and the index loads
  // then. The header count is always the actually-loaded count; stack
  // counts come from the hubs index (fetched below) until the full
  // catalog is resident.
  const [serverFlag] = useState(() => towerServerMode());
  const [serverModel, setServerModel] = useState(null);
  const serverSeqRef = useRef(0);
  const serverAbortRef = useRef(null);
  const serverCursorRef = useRef(null);
  const serverBusyRef = useRef(false);
  const serverActive =
    serverFlag &&
    !!q &&
    q.trim().length >= 2 &&
    !clientFiltersActive &&
    strictQuery !== q;
  // Deferred-search trigger: the two paths the client pipeline owns
  // in server mode — a hub filter (collSet) and the strict path
  // (strictQuery === q) — are exactly the ones that need the local
  // search layer. The first time either engages, ask the derivation
  // to build it (it upgrades the deferred object in place; the
  // "Indexing…" status shows while it builds). Plain queries never
  // set this: the server answers them.
  //
  // 2026-11-14 crash fix: filter state ALONE no longer triggers the
  // build. Nothing reads the search layer without a query — the
  // browse path serves filter selections from the scan (bucketKeys /
  // eraCodes), and the results memo only touches haystacks when a
  // query is present — so a bare era/curated/sub-lane tap paid the
  // full phase-1 build (five full-length string arrays; measured on
  // the phone profile at +219 MB persistent heap and a ~6 s main-
  // thread task) for a layer it never used: the same jetsam family
  // as the filter-tap crashes. The build now starts when a query
  // actually engages the client pipeline (typed under a client-owned
  // filter, or the strict path); until it lands, such a query
  // browses in catalog order — the derivation's long-standing
  // phase-0 contract.
  useEffect(() => {
    if (needSearchData || !serverFlag) return;
    const queryNeedsClient =
      !!q && q.trim().length >= 2 && clientFiltersActive;
    if (queryNeedsClient || (strictQuery && strictQuery === q))
      setNeedSearchData(true);
  }, [needSearchData, serverFlag, clientFiltersActive, strictQuery, q]);
  // Catalog total + per-collection counts from the hubs index (a
  // derived file the publish lane regenerates), so counts are truthful
  // in server mode before — or without — the client index arriving.
  // Seeded from the file's HEAD (fetchHubSeed): the full document is
  // ~14 MB of hub data, and waiting on its download + parse behind
  // the browse stream is exactly why the stacks showed partial counts
  // for the first stretch of Joshua's 2026-11-11 phone video.
  useEffect(() => {
    if (!serverFlag || serverTotal != null) return;
    let live = true;
    fetchHubSeed()
      .then((seed) => {
        if (!live || !seed) return;
        if (typeof seed.total === "number") setServerTotal(seed.total);
        if (seed.collections) setServerCounts(seed.collections);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [serverFlag, serverTotal]);
  // Resident count: what has actually loaded onto the page — the
  // bootstrap first, then the catalog as it streams in (server browse
  // pages in server mode, index chunks in client mode). This is the
  // FILTER PANEL's working number: its chips partition the resident
  // set, so "All entries" must be this count for the panel's
  // arithmetic to agree — and the status line beside it carries the
  // honest progress ("N of 2,557,923") while the stream runs.
  const displayCount = artifacts ? artifacts.length : 0;
  // Stats-strip works number (2026-11-12, audit F8): the strip states
  // library FACTS — like its collections count beside it and the
  // hero's total above — so its works number is the library's true
  // total, never the resident prefix (which read "20,000 works" in
  // Joshua's first recording and "159,995 works" in his second, both
  // presented as the size of the library). Sources, in order: the hub
  // seed's total (on-device within ~1 s of mount), the browse
  // manifest's total once discovery has run, and the resident length
  // once the full index is in (where resident == total). Before any
  // source lands, the strip holds the last truthful value it showed,
  // or the same steady dash the collections number uses — it never
  // invents a number and never counts the prefix as the library.
  const truthfulWorksRef = useRef(null);
  const worksTotal = useMemo(() => {
    let v = null;
    if (serverTotal != null) v = serverTotal;
    else {
      const hint = getBrowseTotalHint();
      if (hint) v = hint;
      else if (fullIndexReady && artifacts) v = artifacts.length;
    }
    if (v != null) truthfulWorksRef.current = v;
    return v != null ? v : truthfulWorksRef.current;
  }, [serverTotal, artifacts, fullIndexReady]);
  // Deferred sort orders (2026-11-12, audit F3): the 51 MB orders
  // fetch no longer rides in parallel with the browse stream — the
  // loader starts it at stream completion. A non-default sort is the
  // other sanctioned trigger: the user just asked for exactly the
  // data it carries, so it starts now, even mid-stream.
  useEffect(() => {
    if (sortId !== "title-asc") ensureBrowseOrders();
  }, [sortId]);
  // Stack counts in server mode: hubs counts override the derivation's
  // partial collection counts while the catalog streams. The override
  // used to drop the moment the derivation completed — but the two
  // systems are NOT the same numbers: the hub file counts catalog
  // RECORDS (2,557,923; Books 81,631) while the resident derivation
  // counts UNIQUE ids (2,557,918; Books 81,626 — dedupe drops this
  // catalog's 5 duplicate ids), so dropping the overlay flipped every
  // chip at the completion boundary (Joshua's 2026-11-14 recording:
  // All 2,557,923 -> 2,557,918, Books 81,631 -> 81,626 in one session).
  // Single-truth rule (2026-11-14): the chips state the catalog's
  // published counts in EVERY state, so the overlay now persists
  // after completion too. Resident-exact numbers still govern where
  // they are the truth of the thing shown: selection headers and
  // result counts come from the scan, subcategory counts from
  // towerData.subCounts — neither is overlaid.
  const countsFinal = countsReady;
  // Panel count resolvers (2026-11-20 correction): every number
  // the filter panel shows comes from the FIRST source in its
  // chain that is truthful for the current selection — resident
  // tallies only once the selection's scopes are fully resident
  // (facetCountsShown), then published tallies (server facet
  // tallies within the selection; the static tallies file's global
  // + cube counts), then — outside scope mode only — the resident
  // derivation exactly as before. A resolver returns null when no
  // truthful source exists yet, and the panel shows no number
  // rather than a partial one (the 2026-11-13 rule, restored for
  // scope mode: prefix counts are never dressed as finals).
  // Facet-axes-only selections (2026-11-20 counts-speed fix) take
  // a published-tallies path AHEAD of the resident tallies in all
  // three resolvers below: when the selection touches only the
  // lane / bucket / era axes, the static tallies file and its
  // cubes state every axis's faceted counts exactly, so the panel
  // shows the same numbers during a selection's load as after it
  // — resident tallies can only describe what has landed, which
  // for an unloaded lane is the bootstrap prefix, not the truth.
  // Single member-axis selections (curated / shelf / Papers) take
  // the same kind of published path via the member cubes
  // (2026-11-21, line 137 — see singleMemberKey below).
  const facetSelActive = !!(bucketFilter || eraFilter);
  const memberSelActive = !!(collKey || shelfKey || paperKey || paperTypeKey || collSet);
  // Single member-axis selection (2026-11-21, line 137): exactly
  // one member axis (curated / shelf / Papers field / type) is
  // active and no lane/bucket selection rides along — the state
  // the published member cubes (cubeMemberEra / cubeMemberBucket
  // in the tallies file) describe exactly, so the resolvers below
  // take a published path for it just as facet-axes-only selections
  // do. Combined member states (two member axes at once, or a
  // member axis plus a bucket) keep the resident-tally path: no
  // published product states those intersections, and a blank
  // beats a wrong number.
  const memberKeysActive = [collKey, shelfKey, paperKey, paperTypeKey].filter(Boolean);
  const singleMemberKey =
    memberKeysActive.length === 1 && !bucketFilter ? memberKeysActive[0] : "";
  const panelCountsFinal = scopeModeOn
    ? !selScopesLoading || !!staticTallies || !!serverTalliesCurrent
    : countsFinal;
  const laneCountFor = (c) => {
    if (scopeModeOn && !memberSelActive) {
      // Facet axes only (lane / bucket / era selected, no member
      // axis): published truth in EVERY state — during load and
      // after load identically, never resident-derived. The lane
      // axis is one group with its buckets, so its counts ignore
      // the lane/bucket selection itself (2026-11-14 faceted
      // rule): the global published totals, or — when an era is
      // also selected — the era column of the published
      // collection x era cube. The resident tallies this path
      // replaces read the bootstrap prefix for every lane whose
      // scope never loaded (Papers 1,784 after a Reference load —
      // Joshua's 2026-11-20 16:27 recording), and the branch it
      // bypasses below mistook a bare lane key ("REFERENCE") for
      // a bucket key, zeroing every other lane and leaving the
      // selected chip numberless for the whole load.
      if (eraFilter) {
        if (staticTallies && staticTallies.cubeCollectionEra) {
          return staticTallies.cubeCollectionEra[c]?.[eraFilter] ?? 0;
        }
        if (!bucketFilter && serverTalliesCurrent) {
          return serverTalliesCurrent.collection[c] ?? 0;
        }
        return null;
      }
      if (staticTallies && staticTallies.collections) {
        return staticTallies.collections[c] ?? null;
      }
      return serverCounts ? serverCounts[c] ?? null : null;
    }
    // Member selection (2026-11-21, line 137): the selected
    // collection's lane distribution is the lane sums of its
    // published member x bucket cube row — exact in every state.
    // (The scope-mode fallback below this chain reads the GLOBAL
    // published lane totals whenever no era is selected, member
    // selection or not, so without this path a curated selection
    // left every lane chip at its whole-library number.) With an
    // era also selected the distribution is a three-way
    // intersection no published product states; that state keeps
    // the resident path.
    if (
      singleMemberKey &&
      !eraFilter &&
      staticTallies &&
      staticTallies.cubeMemberBucket
    ) {
      const row = staticTallies.cubeMemberBucket[singleMemberKey];
      if (!row) return 0;
      let n = 0;
      for (const k of Object.keys(row)) {
        if (k.startsWith(c + ":")) n += row[k];
      }
      return n;
    }
    if (facetCountsShown) return facetCountsShown.laneMap[c] || 0;
    if (scopeModeOn) {
      if (eraFilter && !bucketFilter && serverTalliesCurrent) {
        return serverTalliesCurrent.collection[c] ?? 0;
      }
      if (!eraFilter) {
        if (bucketFilter && staticTallies && staticTallies.buckets) {
          // A bucket lives inside exactly one collection: within a
          // bucket selection, that collection's lane count is the
          // bucket's own total and every other lane is truly 0.
          return c === bucketFilter.split(":")[0]
            ? staticTallies.buckets[bucketFilter] ?? null
            : 0;
        }
        if (staticTallies && staticTallies.collections) {
          return staticTallies.collections[c] ?? null;
        }
        return serverCounts ? serverCounts[c] ?? null : null;
      }
      return null;
    }
    return (discoveryData || towerData).counts[c] || 0;
  };
  const subCountFor = (key) => {
    if (scopeModeOn && !memberSelActive) {
      // Facet axes only: published truth in every state (see
      // laneCountFor). A bucket belongs to exactly one lane, so
      // its published total IS its within-lane count; with an era
      // also selected, the bucket x era cube states the exact
      // within-era count (the server facet tallies condition only
      // on the coarse facet bands, never the fine client eras).
      if (eraFilter) {
        if (staticTallies && staticTallies.cubeBucketEra) {
          return staticTallies.cubeBucketEra[key]?.[eraFilter] ?? 0;
        }
        if (serverTalliesCurrent) {
          return serverTalliesCurrent.bucket[key] ?? 0;
        }
        return null;
      }
      // The published buckets map enumerates every nonzero bucket:
      // a taxonomy bucket missing from it is a TRUE zero, shown as
      // 0 like every other true zero (era chips included) — never
      // a silently blank row ("Other Law", Joshua's 2026-11-20
      // 16:39 recording). The same holds for the server facet
      // map, which is complete for its selection.
      if (staticTallies && staticTallies.buckets) {
        return staticTallies.buckets[key] ?? 0;
      }
      if (facetSelActive && serverTalliesCurrent) {
        return serverTalliesCurrent.bucket[key] ?? 0;
      }
      return null;
    }
    // Member selection (2026-11-21, line 137): the published
    // member x bucket cube states the bucket's count within the
    // selected collection exactly; a bucket missing from the
    // member's row is a true zero within it. With an era also
    // selected the count is a three-way intersection no published
    // product states; that state keeps the resident path.
    if (
      singleMemberKey &&
      !eraFilter &&
      staticTallies &&
      staticTallies.cubeMemberBucket
    ) {
      return staticTallies.cubeMemberBucket[singleMemberKey]?.[key] ?? 0;
    }
    if (facetCountsShown) return facetCountsShown.subMap[key] || 0;
    if (scopeModeOn) {
      if (facetSelActive && serverTalliesCurrent) {
        return serverTalliesCurrent.bucket[key] ?? 0;
      }
      if (!facetSelActive && staticTallies && staticTallies.buckets) {
        return staticTallies.buckets[key] ?? 0;
      }
      return null;
    }
    return towerData.subCounts[key] || 0;
  };
  const eraCountFor = (e) => {
    if (scopeModeOn && !memberSelActive) {
      // Facet axes only: published truth in every state (see
      // laneCountFor). The era axis ignores its own selection:
      // within a lane/bucket selection the published cubes state
      // the era distribution exactly (nonzero cells only — a
      // missing cell is a true zero); with no lane/bucket
      // selection the global fine-era tallies hold, whether or
      // not an era is selected. The branch this replaces keyed
      // the bucket cube on a bare lane key ("REFERENCE"), which
      // is not a bucket key — every era read 0 for the whole
      // load (Joshua's 2026-11-20 16:27 recording).
      if (!staticTallies) return null;
      if (bucketFilter) {
        const cube = bucketFilter.includes(":")
          ? staticTallies.cubeBucketEra
          : staticTallies.cubeCollectionEra;
        return cube ? cube[bucketFilter]?.[e.id] ?? 0 : null;
      }
      return staticTallies.eras ? staticTallies.eras[e.id] ?? null : null;
    }
    // Member selection (2026-11-21, line 137): the published
    // member x era cube states the selected collection's own era
    // distribution exactly, in every state — the era axis ignores
    // its own selection, so the cube row holds whether or not an
    // era is also selected. Before this path existed, a curated
    // selection left the era chips numberless during the load AND
    // at settle (a fully resident 6-work collection included):
    // the resident tallies were the only member source and are
    // gated on the selection's scopes, and the scope-mode
    // fallbacks below have no member branch for eras at all.
    if (singleMemberKey && staticTallies && staticTallies.cubeMemberEra) {
      return staticTallies.cubeMemberEra[singleMemberKey]?.[e.id] ?? 0;
    }
    if (facetCountsShown) return facetCountsShown.eraMap[e.id] || 0;
    if (scopeModeOn) {
      if (!facetSelActive && !memberSelActive && staticTallies && staticTallies.eras) {
        return staticTallies.eras[e.id] ?? null;
      }
      if (
        bucketFilter &&
        !eraFilter &&
        !memberSelActive &&
        staticTallies &&
        staticTallies.cubeBucketEra
      ) {
        // The cubes enumerate nonzero cells only: a missing cell
        // is a true zero (e.g. LAW x 1800s), not an unknown.
        return staticTallies.cubeBucketEra[bucketFilter]?.[e.id] ?? 0;
      }
      // (Removed 2026-11-21, line 137: a branch here keyed the
      // COLLECTION x era cube on collKey — unreachable, since
      // collKey makes memberSelActive true and the branch required
      // it false; and wrong besides, since the collection cube has
      // no curated keys. The member x era cube path above is its
      // working successor.)
      if (e.id === "1800s" && facetSelActive && serverTalliesCurrent) {
        return serverTalliesCurrent.era["1800s"] ?? null;
      }
      return null;
    }
    return countsFinal
      ? towerData.eraCounts
        ? towerData.eraCounts[e.id] || 0
        : 0
      : null;
  };
  const discoveryData = useMemo(() => {
    if (!towerData || !serverCounts) return towerData;
    const counts = { ...towerData.counts, ...serverCounts };
    return {
      ...towerData,
      counts,
      // The chip LIST comes from the merged counts too (2026-11-13
      // load-state fix): the derivation's own key list only names
      // collections the resident prefix has reached, which silently
      // dropped LAW — half the library — from the panel for the
      // whole load. The hubs seed names every collection from the
      // first second, in the same count order the derivation uses.
      collections: Object.keys(counts).sort(
        (a, b) => counts[b] - counts[a] || (a < b ? -1 : a > b ? 1 : 0)
      ),
    };
  }, [towerData, serverCounts]);
  // "All entries" chip number (2026-11-13 load-state fix): the chip
  // states the library's true total (hub seed / browse manifest — the
  // same truthful source as the stats strip above it), never the
  // resident prefix count, which read as "the library has 20,000
  // entries" beside a header stating 2,557,923. It states that total
  // in EVERY state (2026-11-14 single-truth fix): the resident count
  // is NOT the exact catalog count — dedupe leaves it 5 under the
  // total on this catalog — so the old "return to the resident count
  // once final" rule flipped the chip 2,557,923 -> 2,557,918 at the
  // completion boundary. The resident count remains the fallback only
  // for the brief window before any total source has landed.
  const allEntriesCount = worksTotal == null ? displayCount : worksTotal;
  // Zero-resident selection (2026-11-13 statusfix): a lane or
  // subcategory tap whose committed scan found ZERO resident matches
  // while the catalog is still arriving is not an empty result — it
  // is a part of the library that has not streamed in yet. The
  // starter pack holds no LAW records at all (Law arrives late in
  // browse order), so a Law tap in the first stretch of a load read
  // "0 of 20,000 entries / No entries match — choose a different
  // collection" beside a chip stating Law's 1,277,197 works
  // (Joshua's 18:31 recording; the same zero appears on a direct Law
  // tap seconds into the clip, before any subcategory is touched —
  // the selection state itself is atomic lane[:sub], so nothing
  // leaks across a lane switch; the trap is the resident prefix).
  // While counting is not final, a bucket-only selection (no era,
  // curated or query composition) whose library count is known
  // positive — the seed/derivation count for a lane, the taxonomy
  // itself for a subcategory — renders the awaiting state instead,
  // and the engine's per-publish rescan replaces it with the real
  // entries the moment they arrive. Once counts are final a zero is
  // a true zero and the plain empty message returns.
  const awaitingArrival = (() => {
    if (matchCount !== 0 || !towerData) return false;
    if (q && q.trim().length >= 2) return false;
    // Scope mode (2026-11-20 correction): a selection whose scopes
    // are still loading and whose true total is known positive is
    // ARRIVING, not empty — whatever axes compose it. The first
    // scope build never entered this state for Law because
    // countsFinal (its gate below) flips true in scope mode the
    // moment the queue drains at boot, so the tap read "No entries
    // match" over a 1,277,197-work collection.
    if (scopeModeOn) {
      return selScopesLoading && selTotalBound > 0;
    }
    if (!bucketFilter || eraFilter || collSet || memberBitsSel) return false;
    if (countsFinal) return false;
    if (bucketFilter.indexOf(":") > -1) {
      const lane = bucketFilter.split(":")[0];
      return (TOWER_SUBS[lane] || []).some(
        (s) => `${lane}:${s.id}` === bucketFilter
      );
    }
    return (((discoveryData || towerData).counts || {})[bucketFilter] || 0) > 0;
  })();
  const adaptServerItem = (r, tokens) => {
    const nt = normText(r.title || "");
    const nc = normText(r.creator || "");
    const meta = { title: false, creator: false, subject: false, description: false };
    if (tokens.some((t) => nt.includes(t))) meta.title = true;
    else if (tokens.some((t) => nc.includes(t))) meta.creator = true;
    else meta.subject = true;
    return { key: r.artifact_id, artifact: r, index: -1, score: 0, meta, text: null, doc: null };
  };
  const fetchServerPage = async (cursor, ctl) => {
    const params = new URLSearchParams();
    params.set("q", q);
    if (bucketFilter) {
      if (bucketFilter.includes(":")) params.set("bucket", bucketFilter);
      else params.set("collection", bucketFilter);
    }
    if (cursor) params.set("cursor", String(cursor));
    const res = await fetch(`/api/catalog-search?${params.toString()}`, {
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`catalog-search ${res.status}`);
    return res.json();
  };
  useEffect(() => {
    if (!serverActive) return;
    const seq = ++serverSeqRef.current;
    if (serverAbortRef.current) serverAbortRef.current.abort();
    const ctl = new AbortController();
    serverAbortRef.current = ctl;
    serverBusyRef.current = true;
    const tokens = queryTokens(normText(q));
    setServerModel((prev) =>
      prev && prev.query === q
        ? { ...prev, pending: true }
        : {
            items: [],
            total: 0,
            stage: null,
            suggestion: null,
            appliedCorrection: null,
            droppedTerms: [],
            deepState: "ready",
            pending: true,
            query: q,
            tokens,
            hasMore: false,
          }
    );
    (async () => {
      try {
        let cursor = 0;
        let first = true;
        let loaded = 0;
        while (true) {
          const body = await fetchServerPage(cursor, ctl);
          if (seq !== serverSeqRef.current) return;
          const items = (body.results || [])
            .filter(Boolean)
            .map((r) => adaptServerItem(r, tokens));
          loaded += items.length;
          serverCursorRef.current = body.next_cursor;
          if (first) {
            first = false;
            setServerModel({
              items,
              total: body.total || 0,
              stage: null,
              suggestion: null,
              appliedCorrection:
                body.corrected_query && body.corrected_query !== q
                  ? body.corrected_query
                  : null,
              droppedTerms: [],
              deepState: "ready",
              pending: false,
              query: q,
              tokens,
              hasMore: body.next_cursor != null,
            });
          } else {
            setServerModel((prev) => {
              if (!prev || prev.query !== q) return prev;
              const seen = new Set(prev.items.map((it) => it.key));
              const fresh = items.filter((it) => !seen.has(it.key));
              return {
                ...prev,
                items: [...prev.items, ...fresh],
                hasMore: body.next_cursor != null,
              };
            });
          }
          // Prefetch up to 250 results (the pager's 10 pages) so page
          // jumps behave exactly like the client model's; Load more
          // fetches further pages on demand beyond that.
          if (body.next_cursor == null || loaded >= 250) break;
          cursor = body.next_cursor;
        }
      } catch (err) {
        if (seq !== serverSeqRef.current || (err && err.name === "AbortError"))
          return;
        setServerModel(null); // graceful fallback to the client model
        // Cutover: the fallback model needs the full index behind it,
        // not just the bootstrap — start it now (idempotent).
        requestCatalogIndex();
      } finally {
        if (seq === serverSeqRef.current) serverBusyRef.current = false;
      }
    })();
    return () => {
      if (seq === serverSeqRef.current) ctl.abort();
    };
  }, [serverActive, q, bucketFilter]);
  const serverLoadMore = () => {
    if (
      !serverActive ||
      serverBusyRef.current ||
      serverCursorRef.current == null
    )
      return;
    const seq = serverSeqRef.current;
    const ctl = serverAbortRef.current;
    if (!ctl) return;
    serverBusyRef.current = true;
    const tokens = queryTokens(normText(q));
    (async () => {
      try {
        let cursor = serverCursorRef.current;
        let loaded = 0;
        while (cursor != null && loaded < 250) {
          const body = await fetchServerPage(cursor, ctl);
          if (seq !== serverSeqRef.current) return;
          const items = (body.results || [])
            .filter(Boolean)
            .map((r) => adaptServerItem(r, tokens));
          loaded += items.length;
          serverCursorRef.current = body.next_cursor;
          cursor = body.next_cursor;
          setServerModel((prev) => {
            if (!prev || prev.query !== q) return prev;
            const seen = new Set(prev.items.map((it) => it.key));
            const fresh = items.filter((it) => !seen.has(it.key));
            return {
              ...prev,
              items: [...prev.items, ...fresh],
              hasMore: body.next_cursor != null,
            };
          });
        }
      } catch {
        // Keep what is loaded; the button can retry.
      } finally {
        if (seq === serverSeqRef.current) serverBusyRef.current = false;
      }
    })();
  };
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
        // Helix boot gate (Amendment M): the background's animation
        // clock starts exactly when the page's boot completes — the
        // same moment onReady dismisses the loader.
        try {
          if (helixApiRef && helixApiRef.current) helixApiRef.current.setSettled();
        } catch (e) { /* decorative layer — never block ready */ }
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
  // Helix navigation binding (Ship 2, Amendments H/I/J): the page's
  // search + filter state drives the background scene. Rules, applied
  // to the CURRENT combined state whenever a committed model changes:
  //  - nothing active → idle.
  //  - results ≤ 50 (and > 0) → the matching works lift into the
  //    center display above the helix (tiles carry those works).
  //  - results > 50, plain single-collection selection → camera
  //    flight to the collection's band with in-place highlight
  //    (HELIX_LANE_BANDS); a cross-collection set implicates its
  //    dominant lane the same way.
  //  - results > 50, REFINED combination (collection × era,
  //    curated, era-only, search) → reshape (Phase 2b, 2026-11-13):
  //    the coil contracts to the combination's exact per-collection
  //    shares and re-skins from its own collections, with a
  //    selection label carrying this page's exact result count.
  //    Reshape is emitted ONLY once the catalog load has settled —
  //    keyed to countsFinal, the panel's own finality signal (the
  //    same one that dismisses the "Currently cataloging" note the
  //    scene polls) — and exact facet counts are available; before
  //    that the focus/idle rules above apply unchanged, and the
  //    scene additionally stashes a reshape until its load markers
  //    clear. (fullIndexReady && deriveFinal is NOT the settled
  //    signal: fullIndexReady keys off a complete flag the deduped
  //    resident count never satisfies with duplicate ids in the
  //    catalog, and deriveFinal waits on the search vocabulary
  //    build, which lags the catalog itself by minutes.)
  // Lane → scene-band mapping: the scene's bands ARE the seven real
  // collections (true representation, 2026-11-13), one band per
  // lane, in canonical order: LAW 0, PAPERS 1, BOOKS 2, REFERENCE 3,
  // DECLASSIFIED 4, PODCASTS 5, DOCUMENTS 6.
  const helixSigRef = useRef("");
  const helixParentBandRef = useRef(null); // {src, map: key -> bandIdx}
  useEffect(() => {
    const api = helixApiRef && helixApiRef.current;
    if (!api || typeof api.setDisplay !== "function") return;
    const HELIX_LANE_BANDS = {
      LAW: [0],
      PAPERS: [1],
      BOOKS: [2],
      REFERENCE: [3],
      DECLASSIFIED: [4],
      PODCASTS: [5],
      DOCUMENTS: [6],
    };
    const HELIX_BAND_OF = {
      LAW: 0, PAPERS: 1, BOOKS: 2, REFERENCE: 3,
      DECLASSIFIED: 4, PODCASTS: 5, DOCUMENTS: 6,
    };
    const HELIX_BAND_NAME = [
      "LAW", "PAPERS", "BOOKS", "REFERENCE", "DECLASSIFIED", "PODCASTS", "DOCUMENTS",
    ];
    const searching = !!(q && q.trim().length >= 2);
    const anyFilter = !!(bucketFilter || collKey || shelfKey || paperKey || paperTypeKey || eraFilter);
    // ---- scene layout (2026-11-15, hierarchical re-coiling) -----
    // The spiral's coil structure is COMPUTED from the selection:
    // a curated group tab re-forms the spiral into one coil per
    // subcategory of that group; a Books shelf pick re-forms it
    // into the 61 shelves; a lane subcategory pick re-forms it into
    // that lane's subcategories; anything else is the resting
    // seven-collection layout. Each coil's parent band — the pool
    // its covers may come from — is the dominant catalog lane among
    // the subcategory's own members, sampled from its bitset (so a
    // coil can never show another collection's material).
    const parentBandOf = (groupId, c) => {
      const DEF = { traditions: 2, law: 0, med: 1, eng: 1, conspiracy: 4, audiences: 1 };
      if (!c || !c.bits || !towerData || !towerData.bucketKeys) {
        return DEF[groupId] !== undefined ? DEF[groupId] : 2;
      }
      let cache = helixParentBandRef.current;
      if (!cache || cache.src !== collData) {
        cache = { src: collData, map: new Map() };
        helixParentBandRef.current = cache;
      }
      if (cache.map.has(c.key)) return cache.map.get(c.key);
      const bk = towerData.bucketKeys;
      const tally = [0, 0, 0, 0, 0, 0, 0];
      let seen = 0;
      const bits = c.bits;
      for (let w = 0; w < bits.length && seen < 240; w++) {
        let word = bits[w];
        while (word) {
          const b = word & -word;
          const i = (w << 5) + (31 - Math.clz32(b));
          const bi = HELIX_BAND_OF[(bk[i] || "").split(":")[0]];
          if (bi !== undefined) {
            tally[bi]++;
            seen++;
          }
          word ^= b;
          if (seen >= 240) break;
        }
      }
      let best = -1;
      let bestN = 0;
      tally.forEach((n, bi) => {
        if (n > bestN) {
          bestN = n;
          best = bi;
        }
      });
      const band = best >= 0 ? best : DEF[groupId] !== undefined ? DEF[groupId] : 2;
      cache.map.set(c.key, band);
      return band;
    };
    let layout = null;
    if (collGroup) {
      if (!collData) return; // group data still loading — hold the scene
      const group = collData.groups.find((g) => g.id === collGroup);
      if (group && group.collections.length) {
        layout = {
          key: "g:" + collGroup,
          kind: "group",
          groupLabel: group.label,
          coils: group.collections.map((c) => ({
            key: c.key,
            name: c.label,
            count: c.count,
            band: parentBandOf(collGroup, c),
          })),
          picked: collKey
            ? group.collections.findIndex((c) => c.key === collKey)
            : -1,
        };
      }
    }
    if (!layout && shelfKey) {
      if (!collData) return; // shelf data still loading — hold
      if (collData.booksShelves && collData.booksShelves.length) {
        layout = {
          key: "shelves",
          kind: "shelf",
          groupLabel: "Books",
          coils: collData.booksShelves.map((s) => ({
            key: s.key,
            name: s.label,
            count: s.count,
            band: 2,
          })),
          picked: collData.booksShelves.findIndex((s) => s.key === shelfKey),
        };
      }
    }
    // Papers axes (2026-11-20 fix, Joshua's phone recording —
    // gap G-1): a field, a field's sub-shelf, or a publication
    // type is a subcategory-level selection and re-forms like
    // every other one — one coil per field (or per sub-shelf of
    // the picked field, or per type), sizes from the collections
    // package's own published counts (the same numbers the panel
    // rows show), the tapped one picked so the generic picked
    // branch below reshapes one-hot and flies the camera onto it.
    // Before this branch existed these taps fell through to the
    // resting-layout focus and the background never re-formed.
    if (!layout && paperKey && collData && collData.papersFields) {
      const parts = paperKey.split(":");
      const field = collData.papersFields.find((f) => f.id === parts[1]);
      if (parts[0] === "papersub" && field && field.subs && field.subs.length) {
        layout = {
          key: "papersub:" + field.id,
          kind: "papersub",
          groupLabel: field.label,
          coils: field.subs.map((s) => ({
            key: s.key,
            name: s.label,
            count: s.count,
            band: 1,
          })),
          picked: field.subs.findIndex((s) => s.key === paperKey),
        };
      } else if (parts[0] === "paperfield" && field) {
        layout = {
          key: "paperfields",
          kind: "paperfield",
          groupLabel: "Papers",
          coils: collData.papersFields.map((f) => ({
            key: f.key,
            name: f.label,
            count: f.count,
            band: 1,
          })),
          picked: collData.papersFields.findIndex((f) => f.key === paperKey),
        };
      }
    }
    if (!layout && paperTypeKey && collData && collData.papersTypes) {
      layout = {
        key: "papertypes",
        kind: "papertype",
        groupLabel: "Papers",
        coils: collData.papersTypes.map((t) => ({
          key: t.key,
          name: t.label,
          count: t.count,
          band: 1,
        })),
        picked: collData.papersTypes.findIndex((t) => t.key === paperTypeKey),
      };
    }
    if (
      !layout &&
      bucketFilter &&
      bucketFilter.indexOf(":") > -1 &&
      towerData &&
      towerData.subCounts
    ) {
      const lane = bucketFilter.split(":")[0];
      const subs = TOWER_SUBS[lane];
      if (subs && subs.length && HELIX_BAND_OF[lane] !== undefined) {
        layout = {
          key: "sub:" + lane,
          kind: "sub",
          groupLabel: TOWER_TOP_LABELS[lane] || lane,
          coils: subs.map((s) => ({
            key: lane + ":" + s.id,
            name: s.label,
            // Coil sizes are the PUBLISHED tallies when the tallies
            // file has landed (true from the first second, stable
            // fingerprint — one re-form per tap); the resident
            // subCounts remain the fallback before it lands.
            count:
              staticTallies && staticTallies.buckets &&
              typeof staticTallies.buckets[lane + ":" + s.id] === "number"
                ? staticTallies.buckets[lane + ":" + s.id]
                : towerData.subCounts[lane + ":" + s.id] || 0,
            band: HELIX_BAND_OF[lane],
          })),
          picked: subs.findIndex((s) => lane + ":" + s.id === bucketFilter),
        };
      }
    }
    const layoutArg = layout
      ? {
          // The band + counts fingerprint rides the key: if a coil's
          // parent band is refined when the full derivation lands
          // (early emissions can precede the bucket keys the sampler
          // reads), or a lane-sub layout was first sized from
          // resident prefix counts before the published tallies
          // landed, the key changes and the scene re-forms with the
          // corrected coils instead of keeping the fallback. The
          // scene applies a layout swap the moment it arrives (a
          // swap is selection truth, never held for a stream).
          key:
            layout.key +
            "#" +
            layout.coils.map((c) => c.band).join("") +
            "#" +
            layout.coils.reduce((s, c, i) => (s + c.count * (i + 7)) % 1000000007, 0),
          // The layout kind rides along so the scene can allocate
          // curated-group, Books-shelf and lane-sub coils by the
          // truth rules (literal small subcategories / shelves,
          // 2026-11-16 groups + shelves, 2026-11-17 lane-sub).
          kind: layout.kind,
          coils: layout.coils,
        }
      : { key: "rest" };
    // Era hold (§5): the era's stretch of a coil, as fractions of
    // the coil measured from its front (most recent) end, from the
    // phase-0 bucketEraCounts of the coil's parent bucket — the
    // same tallies the era windows use.
    const eraHoldFor = (coilIdx, parentKey, parentTotal) => {
      if (!eraFilter || !towerData || !towerData.bucketEraCounts || !parentTotal) {
        return null;
      }
      const eraIdx = TOWER_ERAS.findIndex((e) => e.id === eraFilter);
      if (eraIdx < 0) return null;
      const bec = towerData.bucketEraCounts;
      const era = bec[parentKey + "|" + eraFilter] || 0;
      if (!era) return null;
      let newer = 0;
      for (let j = eraIdx + 1; j < TOWER_ERAS.length; j++) {
        newer += bec[parentKey + "|" + TOWER_ERAS[j].id] || 0;
      }
      return {
        coil: coilIdx,
        f0: newer / parentTotal,
        f1: (newer + era) / parentTotal,
      };
    };
    let state = null;
    let liftSrcArtifacts = null;
    if (!searching && !anyFilter && !layout) {
      state = { kind: "idle" };
    } else {
      let count = -1;
      let topArtifacts = null;
      let sampleArtifacts = null;
      let facetSource = null;
      if (searching) {
        const m = serverActive && serverModel ? serverModel : blendedModel;
        if (m && !m.pending && m.query === q && Array.isArray(m.items)) {
          count = typeof m.total === "number" ? m.total : m.items.length;
          topArtifacts = m.items.slice(0, 50).map((it) => it.artifact).filter(Boolean);
          sampleArtifacts = m.items.slice(0, 200).map((it) => it.artifact).filter(Boolean);
          // Exact facet tallies need the FULL match set: the blended
          // (client) model holds it when its total is its items (no
          // deep-search extra outstanding); the server model's items
          // are only the pages loaded so far, so server search keeps
          // the dominant-lane fallback below.
          if (!(serverActive && serverModel) && count === m.items.length) {
            facetSource = { items: m.items };
          }
        }
      } else if (browseResult && artifacts) {
        // Correspondence gate (2026-11-14): a committed browse
        // result belongs to the selection that produced it
        // (browseResult.sel — the same fields the filter anchor
        // matches on). While the scan for the CURRENT selection is
        // still running, the previous selection's result must not
        // drive the scene: without this check the effect emitted a
        // reshape tallied from the superseded result wearing the
        // new selection's name and the old count (measured on a
        // slow device: an era tap bound a "reshape" of the full
        // 2,557,918-entry set under the era's name). On a mismatch
        // the count stays unknown and the previous scene state
        // holds until the matching result commits.
        const bs = browseResult.sel;
        if (
          bs &&
          bs.bucketFilter === bucketFilter &&
          bs.eraFilter === eraFilter &&
          bs.collKey === collKey &&
          bs.shelfKey === shelfKey &&
          bs.paperKey === paperKey &&
          bs.paperTypeKey === paperTypeKey
        ) {
          count = browseResult.count;
          // Array.from is load-bearing: browseResult.indices is a
          // Uint32Array, and TypedArray.prototype.map coerces mapped
          // values back to numbers — the artifact objects became 0s
          // and both lists filtered to empty (the same trap the
          // results window documents). With plain arrays the sample
          // tally below and the scene's result mirroring receive the
          // real records.
          topArtifacts = Array.from(browseResult.indices.slice(0, 50), (ix) =>
            artifacts[ix],
          ).filter(Boolean);
          sampleArtifacts = Array.from(
            browseResult.indices.slice(0, 200),
            (ix) => artifacts[ix],
          ).filter(Boolean);
          facetSource = { indices: browseResult.indices };
        }
      }
      if (count === 0) {
        state = { kind: "idle" };
      } else if (count > 0 && count <= 50 && topArtifacts) {
        liftSrcArtifacts = topArtifacts;
        state = {
          kind: "lift",
          items: topArtifacts.map((a) => ({
            title: a.title || "",
            creator: a.creator || "",
            year: a.year || null,
            collection: a.collection || "",
            // The work's own cover, resolved exactly as the result
            // cards resolve it (INVENTORY 107): the deterministic
            // candidate rides along synchronously; the enrichment
            // pass below applies the full card precedence (acquired
            // sidecar first, then candidates, then Open Library).
            cover: coverCandidates(a)[0] || null,
          })),
        };
      } else if (count > 50) {
        // ---- layout states (re-coiling) --------------------------
        // When a layout is active, the display is computed over
        // the layout's coils (below); the resting-layout logic that
        // follows is skipped and its result overridden. layoutState
        // stays null while the per-coil facets are not final — the
        // previous scene state holds, exactly like an uncommitted
        // browse.
        let layoutState = undefined;
        if (layout) {
          layoutState = null;
          const mirrorItems = () =>
            (sampleArtifacts || topArtifacts || []).slice(0, 64).map((a) => ({
              title: a.title || "",
              creator: a.creator || "",
              year: a.year || null,
              collection: a.collection || "",
              // The work's own real cover when the library's cover
              // rules resolve one deterministically (2026-11-20,
              // Books covers fix): the scene's mirror draws it into
              // the cell as the book's cover, falling back to the
              // typeset plate when there is none or it cannot load.
              // Same candidate the result cards try first.
              cover: coverCandidates(a)[0] || null,
            }));
          const layoutName = () => {
            const summary =
              activeFilterSummary && activeFilterSummary !== "All entries"
                ? activeFilterSummary
                : "";
            if (layout.kind === "group") {
              return summary
                ? layout.groupLabel + " · " + summary
                : layout.groupLabel;
            }
            return summary || layout.groupLabel;
          };
          if (searching) {
            // Search exception: travel to the picked coil, else
            // neutral within the layout — never faked facets.
            layoutState =
              layout.picked >= 0
                ? { kind: "focus", groups: [layout.picked] }
                : { kind: "idle" };
          } else if (layout.picked >= 0) {
            // A picked subcategory / shelf / lane-sub: the result
            // set lives entirely in that coil — one-hot facets with
            // the committed count. focusCoil (2026-11-20, Joshua)
            // also flies the camera onto that coil and ends framed
            // on it — the scene applies its focus flight treatment
            // to the marked coil while the one-hot lighting stands.
            // The marker is what distinguishes a picked subcategory
            // from a combination that merely lands in one coil.
            const facets = {};
            facets[layout.picked] = count;
            layoutState = {
              kind: "reshape",
              facets,
              total: count,
              name: layoutName(),
              items: mirrorItems(),
              focusCoil: layout.picked,
            };
            if (eraFilter) {
              let eh = null;
              if (layout.kind === "sub") {
                const key = layout.coils[layout.picked].key;
                eh = eraHoldFor(
                  layout.picked,
                  key,
                  towerData && towerData.subCounts ? towerData.subCounts[key] : 0
                );
              } else {
                const laneName = HELIX_BAND_NAME[layout.coils[layout.picked].band];
                eh = eraHoldFor(
                  layout.picked,
                  laneName,
                  towerData && towerData.counts ? towerData.counts[laneName] : 0
                );
              }
              if (eh) layoutState.eraHold = eh;
            }
          } else if (layout.kind === "group" && !anyFilter) {
            // The pure curated click: a structural re-form — every
            // subcategory coil lit at its true count, nothing else
            // filtered.
            const facets = {};
            let total = 0;
            layout.coils.forEach((c, i) => {
              if (c.count > 0) {
                facets[i] = c.count;
                total += c.count;
              }
            });
            layoutState =
              total > 0
                ? {
                    kind: "reshape",
                    facets,
                    total,
                    name: layout.groupLabel,
                    items: [],
                  }
                : { kind: "idle" };
          } else if (layout.kind === "group" && facetCountsShown && facetCountsShown.curatedMap) {
            // Combinations: each coil's share of the selection
            // formed by the OTHER axes — the panel's own dynamic
            // facet counts, so panel, results and scene cannot
            // disagree about a combination.
            const facets = {};
            let total = 0;
            layout.coils.forEach((c, i) => {
              const v = facetCountsShown.curatedMap[c.key] || 0;
              if (v > 0) {
                facets[i] = v;
                total += v;
              }
            });
            if (total > 0) {
              layoutState = {
                kind: "reshape",
                facets,
                total,
                name: layoutName(),
                items: mirrorItems(),
              };
              if (eraFilter) {
                let dom = -1;
                let best = -1;
                for (const k of Object.keys(facets)) {
                  if (facets[k] > best) {
                    best = facets[k];
                    dom = Number(k);
                  }
                }
                if (dom >= 0) {
                  const laneName = HELIX_BAND_NAME[layout.coils[dom].band];
                  const eh = eraHoldFor(
                    dom,
                    laneName,
                    towerData && towerData.counts ? towerData.counts[laneName] : 0
                  );
                  if (eh) layoutState.eraHold = eh;
                }
              }
            } else {
              // The combination has no presence inside this group:
              // the coils stand neutral (the panel shows the zeros).
              layoutState = { kind: "idle" };
            }
          }
        }
        let groups = null;
        const lane = bucketFilter ? bucketFilter.split(":")[0] : "";
        if (lane && HELIX_LANE_BANDS[lane]) {
          groups = HELIX_LANE_BANDS[lane];
        } else if (sampleArtifacts && sampleArtifacts.length) {
          const tally = {};
          let bestLane = "";
          let bestN = 0;
          for (const a of sampleArtifacts) {
            const c = (a && a.collection) || "";
            if (!c) continue;
            const n = (tally[c] = (tally[c] || 0) + 1);
            if (n > bestN) {
              bestN = n;
              bestLane = c;
            }
          }
          if (bestLane && HELIX_LANE_BANDS[bestLane]) groups = HELIX_LANE_BANDS[bestLane];
        }
        // RESHAPE (Phase 2b): a refined combination — anything
        // beyond a plain single-collection selection — re-forms the
        // coil to the combination's exact per-collection shares.
        // Emitted only once the catalog load has settled and exact
        // facets are in hand; otherwise the focus/idle state above
        // stands, exactly as the scene behaved before reshape.
        const refined =
          searching || !!collKey || !!shelfKey || !!paperKey || !!paperTypeKey || !!eraFilter || (bucketFilter && bucketFilter.indexOf(":") > -1);
        let reshapeState = null;
        if (!layout && refined && countsFinal && facetSource) {
          let facets = null;
          if (
            eraFilter && !lane && !collKey && !shelfKey && !paperKey && !paperTypeKey && !searching &&
            facetSource.indices && towerData && towerData.bucketEraCounts
          ) {
            // Era-only refinement (2026-11-14 crash fix): phase 0
            // already tallied every record into bucketEraCounts keyed
            // "LANE|era", so the facets are seven lookups — exact by
            // construction (every record's bucket lane is one of the
            // seven collections). The generic tally below instead
            // materialized a record facade for EVERY match through
            // the column-store Proxy (542,487 for 1990–2009) in one
            // synchronous task on the tap. Self-validating: the
            // lookups are used only when they sum to the committed
            // scan count; any drift falls through to the tally.
            const bec = towerData.bucketEraCounts;
            const f = {};
            let sum = 0;
            for (const ln of Object.keys(HELIX_BAND_OF)) {
              const c = bec[ln + "|" + eraFilter] || 0;
              if (c > 0) { f[HELIX_BAND_OF[ln]] = c; sum += c; }
            }
            if (sum > 0 && sum === count) facets = f;
          }
          if (!facets && facetSource.indices && lane && HELIX_BAND_OF[lane] !== undefined) {
            // Single-lane refinement (lane × era / sub / curated):
            // every match is in the lane by construction, so the
            // facets are exact with no tally pass at all.
            facets = {};
            facets[HELIX_BAND_OF[lane]] = count;
          } else if (!facets) {
            // Exact tally over the full match set (2026-11-14: the
            // former 300k cap is removed — it silently demoted broad
            // refined selections, e.g. a big era spanning several
            // collections, to the dominant-lane focus, but Joshua's
            // standing direction is that EVERY refined combination
            // gets the reshuffle; the tally is one pass over the
            // already-materialized match set, once per settled
            // selection change).
            const tally = [0, 0, 0, 0, 0, 0, 0];
            let n = 0;
            if (facetSource.indices) {
              const idx = facetSource.indices;
              n = idx.length;
              for (let k = 0; k < n; k++) {
                const a = artifacts[idx[k]];
                const bi = a ? HELIX_BAND_OF[a.collection] : undefined;
                if (bi !== undefined) tally[bi]++;
              }
            } else if (facetSource.items) {
              const items = facetSource.items;
              n = items.length;
              for (let k = 0; k < n; k++) {
                const a = items[k] && items[k].artifact;
                const bi = a ? HELIX_BAND_OF[a.collection] : undefined;
                if (bi !== undefined) tally[bi]++;
              }
            }
            if (n > 0) {
              const f = {};
              tally.forEach((v, bi) => {
                if (v > 0) f[bi] = v;
              });
              if (Object.keys(f).length) facets = f;
            }
          }
          if (facets) {
            // Era windows (era-position mapping, 2026-11-15): when
            // the selection pins an era and its facets are the
            // plain era-only or plain-lane x era tallies, each
            // facet band also gets the era's position inside the
            // band — [records of the band NEWER than the era,
            // records IN the era] from the same phase-0
            // bucketEraCounts — so the scene lights the era's own
            // stretch of the coil (position along a band is time,
            // front = most recent) instead of the band's front.
            // A band's window is emitted only when its tally
            // equals the facet it describes; curated sets, sub-lane
            // picks and searches — whose within-band era
            // distribution is not tallied here — keep the
            // front-anchored reshape.
            let windows = null;
            if (
              eraFilter && !searching && !collKey && !shelfKey && !paperKey && !paperTypeKey &&
              (!bucketFilter || bucketFilter === lane) &&
              towerData && towerData.bucketEraCounts
            ) {
              const eraIdx = TOWER_ERAS.findIndex((e) => e.id === eraFilter);
              if (eraIdx >= 0) {
                const bec = towerData.bucketEraCounts;
                const w = {};
                let okW = true;
                for (const ln of Object.keys(HELIX_BAND_OF)) {
                  const bi = HELIX_BAND_OF[ln];
                  const c = facets[bi] || 0;
                  if (!c) continue;
                  if ((bec[ln + "|" + eraFilter] || 0) !== c) { okW = false; break; }
                  let newer = 0;
                  for (let j = eraIdx + 1; j < TOWER_ERAS.length; j++) {
                    newer += bec[ln + "|" + TOWER_ERAS[j].id] || 0;
                  }
                  w[bi] = [newer, c];
                }
                if (okW && Object.keys(w).length) windows = w;
              }
            }
            const summary =
              activeFilterSummary && activeFilterSummary !== "All entries"
                ? activeFilterSummary
                : "";
            const name = searching
              ? "“" + q.trim() + "”" + (summary ? " · " + summary : "")
              : summary || "Selection";
            reshapeState = {
              kind: "reshape",
              facets,
              total: count,
              name,
              ...(windows ? { windows } : {}),
              // Mirroring v1 (atlas-scale): the selection's top
              // results ride along so the scene can typeset them
              // onto the dominant band's lit segment (live page).
              items: (sampleArtifacts || topArtifacts || [])
                .slice(0, 64)
                .map((a) => ({
                  title: a.title || "",
                  creator: a.creator || "",
                  year: a.year || null,
                  collection: a.collection || "",
                })),
            };
          }
        }
        state = reshapeState || (groups ? { kind: "focus", groups } : { kind: "idle" });
        // Era hold (resting layout): any era selection also gets
        // the camera treatment — the dominant band's era stretch,
        // rotation stopped — on top of the era windows' lighting.
        if (!layout && eraFilter && state && (state.kind === "reshape" || state.kind === "focus")) {
          const domB =
            state.kind === "reshape"
              ? Number(
                  Object.keys(state.facets).sort(
                    (a, b) => state.facets[b] - state.facets[a]
                  )[0]
                )
              : state.groups[0];
          const laneName = HELIX_BAND_NAME[domB];
          const eh = laneName
            ? eraHoldFor(
                domB,
                laneName,
                towerData && towerData.counts ? towerData.counts[laneName] : 0
              )
            : null;
          if (eh) state.eraHold = eh;
        }
        if (layout) state = layoutState;
      }
      // count still unknown (model pending / browse not committed):
      // hold the previous scene state — the scene's latest-wins rig
      // retargets when the committed state lands.
    }
    if (!state) return;
    state.layout = layoutArg;
    const sig =
      state.kind +
      "|" +
      layoutArg.key +
      "|" +
      (state.groups ? state.groups.join(",") : "") +
      "|" +
      (state.items ? state.items.map((i) => i.title).join("§") : "") +
      "|" +
      (state.eraHold
        ? "eh" + state.eraHold.coil + "@" + state.eraHold.f0.toFixed(3) + "-" + state.eraHold.f1.toFixed(3)
        : "") +
      "|" +
      (typeof state.focusCoil === "number" ? "fc" + state.focusCoil : "") +
      "|" +
      (state.kind === "reshape"
        ? state.name +
          "#" +
          state.total +
          "#" +
          Object.keys(state.facets)
            .sort()
            .map((k) => k + ":" + state.facets[k])
            .join(",") +
          (state.windows
            ? "#w" +
              Object.keys(state.windows)
                .sort()
                .map((k) => k + "@" + state.windows[k][0])
                .join(",")
            : "")
        : "");
    if (sig === helixSigRef.current) return;
    helixSigRef.current = sig;
    try {
      api.setDisplay(state);
    } catch (e) { /* decorative layer — never disturb the page */ }
    // Lift cover enrichment (INVENTORY 107): the lift emitted above
    // already carries each work's deterministic cover candidate; the
    // result cards resolve covers sidecar-first (getCover), then
    // candidates, then Open Library for books. Resolve the same
    // chain for the same records and re-emit, so a lifted tile shows
    // exactly the cover its result card shows. Latest-wins: if the
    // selection moved on while resolving (the page sig changed),
    // the result is dropped.
    if (state.kind === "lift" && liftSrcArtifacts && liftSrcArtifacts.length) {
      const mySig = sig;
      const srcItems = liftSrcArtifacts.slice(0, 50);
      Promise.all(
        srcItems.map(async (a) => {
          try {
            const side = await getCover(a.artifact_id);
            if (side) return side;
          } catch (e) { /* sidecar is best-effort — fall through */ }
          const cands = coverCandidates(a);
          if (cands.length) return cands[0];
          if (a.collection === "BOOKS") {
            try {
              return await lookupOpenLibraryCover(a);
            } catch (e) {
              return null;
            }
          }
          return null;
        })
      )
        .then((covers) => {
          if (helixSigRef.current !== mySig) return;
          let changed = false;
          const items = state.items.map((it, i2) => {
            if (covers[i2] && covers[i2] !== it.cover) {
              changed = true;
              return { ...it, cover: covers[i2] };
            }
            return it;
          });
          if (!changed) return;
          try {
            api.setDisplay({ ...state, items });
          } catch (e) { /* decorative layer — never disturb the page */ }
        })
        .catch(() => { /* decorative layer — never disturb the page */ });
    }
  }, [q, bucketFilter, collKey, collGroup, shelfKey, paperKey, paperTypeKey, eraFilter, serverActive, serverModel, blendedModel, browseResult, artifacts, helixApiRef, countsFinal, activeFilterSummary, collData, facetCountsShown, staticTallies]);
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
  // Loading branch (2026-11-12, audit F10): this used to render
  // "CATALOG" + one line and nothing else, so for the whole initial
  // load the section collapsed and the footer floated up directly
  // under the hero — the page read as broken precisely during its
  // longest wait (frame f08 of Joshua's recording). The branch now
  // renders the section's real chrome at its final geometry — the
  // action buttons, the stats strip (with F8's truthful total), a
  // disabled search shell, the status slot, and skeleton rows in the
  // search skeleton's existing vocabulary — inside a min-height
  // section, so the page holds its shape and content pours into
  // place when the first publish lands. No new visual language.
  if (!artifacts || !towerData) return (
    <>
      <section className="tower-index tower-index--loading section">
        <div className="section-index">CATALOG</div>
        <div className="tower-suggest-actions">
          <button
            type="button"
            className="tower-access-btn"
            onClick={() => go("/tower-of-babel/library/research")}
          >
            API ACCESS
          </button>
          <button
            type="button"
            className="tower-access-btn"
            onClick={() => go("/tower-of-babel/library/suggest")}
          >
            SUGGEST AN ENTRY
          </button>
          <button
            type="button"
            className="tower-access-btn tower-donate-btn"
            onClick={() => go("/tower-of-babel/donate")}
          >
            DONATE <span aria-hidden="true">♥</span>
          </button>
        </div>
        <div className="tower-controls">
          <search>
            <form
              role="search"
              className="tower-search-form"
              onSubmit={(e) => e.preventDefault()}
            >
              <label className="tower-search-label">
                Search the library
              </label>
              <div className="tower-search-row">
                <input
                  type="search"
                  name="q"
                  className="tower-search tower-search-hero"
                  placeholder="Advanced Search"
                  disabled
                />
                <button type="submit" className="tower-search-submit" disabled>
                  Search
                </button>
              </div>
            </form>
          </search>
        </div>
        {slowLoad && (
          <p className="tower-loading-note">
            Still loading — the catalog is large, and this connection
            is taking a while. Entries appear here on their own as
            soon as the first part of the library arrives.
          </p>
        )}
        <div className="tower-rows" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="tower-skel-row" />
          ))}
        </div>
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
            onClick={() => go("/tower-of-babel/library/research")}
          >
            API ACCESS
          </button>
          <button
            type="button"
            className="tower-access-btn"
            onClick={() => go("/tower-of-babel/library/suggest")}
          >
            SUGGEST AN ENTRY
          </button>
          <button
            type="button"
            className="tower-access-btn tower-donate-btn"
            onClick={() => go("/tower-of-babel/donate")}
          >
            DONATE <span aria-hidden="true">♥</span>
          </button>
        </div>
        {artifacts.length === 0 ? (
          <div className="tower-index-empty">
            <h2>{towerOfBabel.library.empty.heading}</h2>
            <p>{towerOfBabel.library.empty.body}</p>
          </div>
        ) : (
          <>
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
                      placeholder="Advanced Search"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        // Typing gives the results the screen: the
                        // filter panel collapses by default while a
                        // search is being typed (the chevron reopens
                        // it). (Joshua, 2026-10-28.)
                        if (e.target.value) setFiltersOpen(false);
                      }}
                      onFocus={() => {
                        // Search focus is explicit intent on every
                        // route. Server mode (2026-11-20): queries are
                        // answered by server search and selections load
                        // their own scopes — focus starts nothing.
                        // Client mode still pulls the client index.
                        if (!serverFlag) requestCatalogIndex();
                      }}
                      onKeyDown={onSearchKeyDown}
                      onCompositionStart={() => { composingRef.current = true; }}
                      onCompositionEnd={(e) => {
                        composingRef.current = false;
                        setQuery(e.target.value);
                        if (e.target.value) setFiltersOpen(false);
                      }}
                      enterKeyHint="search"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck="true"
                      autoFocus={
                        typeof window !== "undefined" &&
                        !!window.matchMedia &&
                        window.matchMedia("(pointer: fine)").matches &&
                        // No autofocus on the combined landing: it
                        // would yank the page down to the search box
                        // on desktop the moment the landing opens.
                        // (The stream no longer needs the focus
                        // handler to start it — since 2026-11-11 the
                        // landing auto-starts at open anyway.) The
                        // standalone library keeps autofocus.
                        window.location.pathname !== "/tower-of-babel"
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
                </form>
              </search>
              {/* No fine print under the search bar (Joshua's order,
                  2026-11-13): the "Searches titles, authors…" help
                  line and the "Loading full catalog…" status line
                  that lived here are REMOVED, with no replacement —
                  the page reads as loaded because it is usable, and
                  the load state that matters lives in the filter
                  panel's counting note and the results header.
                  Removed stays removed: do not re-add a status or
                  help line in this slot. */}
            </div>
            {/* MINIMAL PAGE (Ship 2, Joshua 2026-11-12): the discovery
                zone — Browse-the-stacks cards, the Featured rails and
                every curated cover-row shelf — is REMOVED. The page is
                hero, CATALOG actions, stats, search, sort + view
                toggle, filters, results, footer. The TowerDiscovery
                component below is retained in the file for reference
                but is no longer rendered anywhere. */}
            <div
              className="tower-browse-layout"
              id="tower-results"
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
            <div ref={filterPanelRef} className="tower-filters2">
              <div className="tf2-head">
                <button
                  type="button"
                  className="tf2-toggle"
                  aria-expanded={filtersOpen}
                  aria-controls="tower-filter-body"
                  onClick={() => setFiltersOpen((open) => !open)}
                >
                  <span className="tf2-title">Filters</span>
                  <span className="tf2-summary">{activeFilterSummary}</span>
                  <span className="tf2-chevron" aria-hidden="true">
                    {filtersOpen ? "−" : "+"}
                  </span>
                </button>
                {(collKey || shelfKey || paperKey || paperTypeKey || bucketFilter || eraFilter) && (
                  <button
                    type="button"
                    className="tf2-clear"
                    onClick={clearFilters}
                  >
                    Clear all
                  </button>
                )}
              </div>
              {(collKey || shelfKey || paperKey || paperTypeKey || bucketFilter || eraFilter) && (
                <div className="tf2-pills" aria-label="Active filters">
                  {activeCollection && (
                    <button
                      type="button"
                      className="tf2-pill"
                      onClick={() => selectCollection(collKey)}
                    >
                      {activeCollection.label}
                      <span aria-hidden="true"> ×</span>
                    </button>
                  )}
                  {activeShelf && (
                    <button
                      type="button"
                      className="tf2-pill"
                      onClick={() => selectShelf(shelfKey)}
                    >
                      {activeShelf.label}
                      <span aria-hidden="true"> ×</span>
                    </button>
                  )}
                  {activePaperSel && (
                    <button
                      type="button"
                      className="tf2-pill"
                      onClick={() => selectPaper(paperKey)}
                    >
                      {activePaperSel.label}
                      <span aria-hidden="true"> ×</span>
                    </button>
                  )}
                  {activePaperType && (
                    <button
                      type="button"
                      className="tf2-pill"
                      onClick={() => selectPaperType(paperTypeKey)}
                    >
                      {activePaperType.label}
                      <span aria-hidden="true"> ×</span>
                    </button>
                  )}
                  {bucketFilter && (
                    <button
                      type="button"
                      className="tf2-pill"
                      onClick={() => selectLane("")}
                    >
                      {activeBucketLabel}
                      <span aria-hidden="true"> ×</span>
                    </button>
                  )}
                  {eraFilter && (
                    <button
                      type="button"
                      className="tf2-pill"
                      onClick={() => selectEra(eraFilter)}
                    >
                      {towerEraLabel(eraFilter)}
                      <span aria-hidden="true"> ×</span>
                    </button>
                  )}
                </div>
              )}
              {filtersOpen && (
                <div className="tf2-body" id="tower-filter-body">
                  {/* Provisional-state marker (2026-11-13 load-state
                      fix; wording replaced 2026-11-13 evening on
                      Joshua's order): while the catalog streams, the
                      collection chips carry the library's true totals
                      (hub seed) and the axes whose counts only exist
                      once the derivation is final — era, subcategories
                      — show no numbers at all rather than prefix counts
                      dressed as finals. The panel marks that state with
                      a single line — a small spinner + "Currently
                      cataloging library" — in place of the multi-line
                      explanation it used to carry; Joshua found the
                      long note clutter and asked for one quick line.
                      Visibility is exactly the old note's: shown only
                      while the counts are not final, gone the moment
                      they are. */}
                  {!panelCountsFinal && (
                    <p
                      className="tf2-note tf2-note--cataloging"
                      aria-live="polite"
                    >
                      <span className="tf2-spin" aria-hidden="true" />
                      Currently cataloging library
                    </p>
                  )}
                  {/* Axis 1 — Collections: the catalog lanes (filter
                      revamp 2026-11-11; this axis replaces the retired
                      "FORMAT" chip row — the lanes were never formats).
                      Category chips carry the lane total; the active
                      lane's subcategories open beneath the chip row as
                      quiet full-width rows: indented, one size smaller,
                      one weight lighter, counts right-aligned. Hierarchy
                      by type and spacing — no glyphs anywhere. */}
                  <div className="tf2-axis">
                    <div className="tf2-axis-label" id="tf2-axis-collections">
                      Collections
                    </div>
                    <div className="tf2-axis-main">
                      <div
                        className="tf2-chips"
                        role="group"
                        aria-labelledby="tf2-axis-collections"
                      >
                        <button
                          type="button"
                          className={`tf2-chip${bucketFilter === "" ? " is-active" : ""}`}
                          onClick={() => selectLane("")}
                          aria-pressed={bucketFilter === ""}
                        >
                          All entries
                          {(countsFinal || worksTotal != null) && (
                            <span className="tf2-count">
                              {allEntriesCount.toLocaleString()}
                            </span>
                          )}
                        </button>
                        {(discoveryData || towerData).collections.map((c) => {
                          const laneActive =
                            bucketFilter === c ||
                            bucketFilter.indexOf(c + ":") === 0;
                          return (
                            <button
                              key={c}
                              type="button"
                              className={`tf2-chip${laneActive ? " is-active" : ""}`}
                              onClick={() =>
                                selectLane(bucketFilter === c ? "" : c)
                              }
                              aria-pressed={laneActive}
                            >
                              {TOWER_TOP_LABELS[c] || c}
                              {(countsFinal || serverCounts || laneCountFor(c) != null) &&
                                laneCountFor(c) != null && (
                                <span className="tf2-count">
                                  {laneCountFor(c).toLocaleString()}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {activeLane === "BOOKS" &&
                      collData &&
                      collData.booksShelves &&
                      collData.booksShelves.length > 0 ? (
                        <div
                          ref={laneSubsRef}
                          className="tf2-subs"
                          role="group"
                          aria-label="Books shelves"
                        >
                          {/* Books shelves (2026-11-15 collections
                              package): 61 multi-match shelves from
                              the Books expansion design replace the
                              three provenance buckets. The active
                              shelf's blurb leads the slot, keyed by
                              the selection so it swaps atomically
                              (the ghost fix — see the curated axis).
                              Every shelf renders, markers included:
                              a zero here is an honest count within
                              the current cross-selection, never a
                              reason to vanish a designed shelf. */}
                          {activeShelf && (
                            <p
                              key={activeShelf.key}
                              className="tf2-note"
                            >
                              {activeShelf.blurb}{" "}
                              <span>
                                {activeShelf.count.toLocaleString()} works
                              </span>
                            </p>
                          )}
                          {collData.booksShelves.map((s, idx) => {
                            const count = facetCountsShown
                              ? facetCountsShown.shelfMap[s.key] || 0
                              : s.count;
                            const shelfActive = shelfKey === s.key;
                            const wingHead =
                              s.wing &&
                              (idx === 0 ||
                                collData.booksShelves[idx - 1].wing !== s.wing);
                            return (
                              <Fragment key={s.key}>
                                {wingHead && (
                                  <div className="tf2-wing" aria-hidden="true">
                                    {s.wing}
                                  </div>
                                )}
                                <button
                                  type="button"
                                  className={`tf2-sub${shelfActive ? " is-active" : ""}`}
                                  onClick={() => selectShelf(s.key)}
                                  aria-pressed={shelfActive}
                                >
                                  <span className="tf2-sub-label">{s.label}</span>
                                  <span className="tf2-count">
                                    {count.toLocaleString()}
                                  </span>
                                </button>
                              </Fragment>
                            );
                          })}
                        </div>
                      ) : activeLane === "PAPERS" &&
                        collData &&
                        collData.papersFields &&
                        collData.papersFields.length > 0 ? (
                        <div
                          ref={laneSubsRef}
                          className="tf2-subs"
                          role="group"
                          aria-label="Papers fields"
                        >
                          {/* Papers subject map (2026-11-15
                              collections package): the design's
                              two-level field/subfield taxonomy
                              replaces the source labels the lane used
                              to wear as subcategories. Selecting a
                              field filters to it and expands its
                              subfields beneath it; the type rows at
                              the foot slice the same selection by
                              publication type. The active field's
                              blurb leads the slot, keyed by the
                              selection so it swaps atomically (the
                              ghost fix, as on the other axes). */}
                          {activePaperField && (
                            <p key={paperKey} className="tf2-note">
                              {activePaperField.blurb}{" "}
                              <span>
                                {(
                                  activePaperSel || activePaperField
                                ).count.toLocaleString()}{" "}
                                works
                              </span>
                            </p>
                          )}
                          {collData.papersFields.map((f) => {
                            const fcount =
                              facetCountsShown && facetCountsShown.paperMap
                                ? facetCountsShown.paperMap[f.key] || 0
                                : f.count;
                            const expanded =
                              activePaperField && activePaperField.id === f.id;
                            const fieldActive = paperKey === f.key;
                            return (
                              <Fragment key={f.key}>
                                <button
                                  type="button"
                                  className={`tf2-sub${fieldActive ? " is-active" : ""}`}
                                  onClick={() => selectPaper(f.key)}
                                  aria-pressed={fieldActive}
                                >
                                  <span className="tf2-sub-label">{f.label}</span>
                                  <span className="tf2-count">
                                    {fcount.toLocaleString()}
                                  </span>
                                </button>
                                {expanded &&
                                  f.subs.map((s) => {
                                    const scount =
                                      facetCountsShown && facetCountsShown.paperMap
                                        ? facetCountsShown.paperMap[s.key] || 0
                                        : s.count;
                                    const subActive = paperKey === s.key;
                                    return (
                                      <button
                                        type="button"
                                        key={s.key}
                                        className={`tf2-sub tf2-sub--deep${subActive ? " is-active" : ""}`}
                                        onClick={() => selectPaper(s.key)}
                                        aria-pressed={subActive}
                                      >
                                        <span className="tf2-sub-label">
                                          {s.label}
                                        </span>
                                        <span className="tf2-count">
                                          {scount.toLocaleString()}
                                        </span>
                                      </button>
                                    );
                                  })}
                              </Fragment>
                            );
                          })}
                          {collData.papersTypes &&
                            collData.papersTypes.length > 0 && (
                              <>
                                <div className="tf2-wing" aria-hidden="true">
                                  Paper types
                                </div>
                                {collData.papersTypes.map((t) => {
                                  const tcount =
                                    facetCountsShown && facetCountsShown.paperTypeMap
                                      ? facetCountsShown.paperTypeMap[t.key] || 0
                                      : t.count;
                                  const typeActive = paperTypeKey === t.key;
                                  return (
                                    <button
                                      type="button"
                                      key={t.key}
                                      className={`tf2-sub${typeActive ? " is-active" : ""}`}
                                      onClick={() => selectPaperType(t.key)}
                                      aria-pressed={typeActive}
                                    >
                                      <span className="tf2-sub-label">
                                        {t.label}
                                      </span>
                                      <span className="tf2-count">
                                        {tcount.toLocaleString()}
                                      </span>
                                    </button>
                                  );
                                })}
                              </>
                            )}
                        </div>
                      ) : (
                        activeLane &&
                        activeSubs.length > 0 && (
                          <div
                            className="tf2-subs"
                            role="group"
                            aria-label={`${TOWER_TOP_LABELS[activeLane] || activeLane} subcategories`}
                          >
                            {/* Static prefix subcategories (the
                                taxonomy partition in tower-taxonomy.js).
                                This branch is the fallback for BOOKS
                                and PAPERS as well (2026-11-15 fix):
                                the shelves branch above needs the
                                curated bitsets and the Papers two-level
                                branch needs collData.papersFields —
                                which the bitset build returns empty
                                (the subject-map redo is held) — so
                                excluding the two lanes here left Books
                                with no slot at all when bitsets were
                                unavailable and Papers with none ever,
                                orphaning its intact prefix subs (bio /
                                cs / plos / energy / space / other).
                                The bitset branches keep precedence
                                whenever their data exists. */}
                            {activeSubs.map((s) => {
                              const key = `${activeLane}:${s.id}`;
                              // Count from the truthful-source
                              // resolver (2026-11-20 correction):
                              // published tallies from boot, server
                              // tallies within a facet selection,
                              // resident tallies only once the
                              // selection's scopes are fully in.
                              // Null = no truthful number yet; the
                              // row shows without one.
                              const count = subCountFor(key);
                              // While streaming, a zero here only means
                              // "not arrived yet" — hiding the row would
                              // silently vanish real subcategories
                              // (2026-11-13 load-state fix). Rows show
                              // without counts until the derivation is
                              // final; the zero-hide applies only to
                              // final counts, as before. With facet
                              // counts active the rows stay: a zero is
                              // the truthful count within the current
                              // cross-selection.
                              if (
                                count === 0 &&
                                !facetCountsShown &&
                                !scopeModeOn &&
                                countsFinal
                              )
                                return null;
                              const subActive = bucketFilter === key;
                              return (
                                <button
                                  type="button"
                                  key={s.id}
                                  className={`tf2-sub${subActive ? " is-active" : ""}`}
                                  onClick={() =>
                                    selectLane(subActive ? activeLane : key)
                                  }
                                  aria-pressed={subActive}
                                >
                                  <span className="tf2-sub-label">{s.label}</span>
                                  {count != null && (
                                    <span className="tf2-count">
                                      {count.toLocaleString()}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                  {/* Axis 2 — Curated collections (2026-10-24, restyled
                      2026-11-11): the deleted hub pages, folded into
                      this section as a filter on the same entry list.
                      Group chips, then the group's collections as
                      subcategory rows in the same visual language as
                      Axis 1. A collection filters the list below
                      (intersected with search + lane + era + sort); it
                      never renders a second list. This axis ALWAYS
                      renders (2026-11-15 fix): it used to hide on a
                      hub-index failure, and the group chips used to be
                      filtered by whichever dataset had landed — a
                      traditions-only fallback landing made the other
                      five groups vanish mid-session, the collapse in
                      Joshua's 2026-11-15 recording. The chips are the
                      static group table, unconditionally; a group
                      whose data has not loaded shows an honest
                      loading / couldn't-load state in its slot. */}
                    <div ref={collSectionRef} className="tf2-axis tf2-axis--deep">
                      <div className="tf2-axis-label" id="tf2-axis-curated">
                        Curated collections
                      </div>
                      <div className="tf2-axis-main">
                        <div
                          className="tf2-chips"
                          role="group"
                          aria-labelledby="tf2-axis-curated"
                        >
                          <button
                            type="button"
                            className={`tf2-chip${collGroup === "" ? " is-active" : ""}`}
                            onClick={() => selectCollGroup("")}
                            aria-pressed={collGroup === ""}
                          >
                            All collections
                          </button>
                          {COLLECTION_GROUPS.map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              className={`tf2-chip${collGroup === g.id ? " is-active" : ""}`}
                              onClick={() => selectCollGroup(g.id)}
                              aria-pressed={collGroup === g.id}
                            >
                              {g.label}
                            </button>
                          ))}
                        </div>
                        {collAnyLoading &&
                          collGroupCollections.length === 0 && (
                            <p className="tf2-note" aria-live="polite">
                              Loading collections…
                            </p>
                          )}
                        {collGroup && (
                          <div
                            ref={collSubsRef}
                            className="tf2-subs"
                            role="group"
                            aria-label={`Collections in ${COLLECTION_GROUPS.find((g) => g.id === collGroup)?.label || collGroup}`}
                          >
                            {/* The active shelf's blurb lives INSIDE
                                the fixed-height slot (first child), not
                                below it: below the slot it mounted and
                                unmounted with every selection and its
                                height varied per blurb, resizing the
                                panel by ~131px on each curated tap —
                                the last panel resize left after the
                                fixed slot. Same text, same visibility
                                (the slot scrolls back to its top on a
                                selection change); the panel frame now
                                never moves on a curated selection. */}
                            {activeCollection && (
                              <p
                                key={activeCollection.key}
                                className="tf2-note"
                              >
                                {activeCollection.blurb}{" "}
                                <span>
                                  {activeCollection.count.toLocaleString()}{" "}
                                  works
                                </span>
                              </p>
                            )}
                            {collGroupCollections.map((c) => (
                                <button
                                  key={c.key}
                                  type="button"
                                  className={`tf2-sub${collKey === c.key ? " is-active" : ""}`}
                                  onClick={() => selectCollection(c.key)}
                                  aria-pressed={collKey === c.key}
                                >
                                  <span className="tf2-sub-label">
                                    {c.label}
                                  </span>
                                  <span className="tf2-count">
                                    {(facetCountsShown
                                      ? facetCountsShown.curatedMap[c.key] || 0
                                      : c.count
                                    ).toLocaleString()}
                                  </span>
                                </button>
                              ))}
                            {/* Honest failure state (2026-11-15 fix):
                                the group's data failed to load and
                                no load is in flight — say so plainly
                                and offer the retry in place, instead
                                of the old behavior (an empty slot, or
                                the group chip vanishing outright). */}
                            {collGroupUnavailable && (
                              <button
                                type="button"
                                className="tf2-sub"
                                onClick={() => ensureCollections()}
                              >
                                <span className="tf2-sub-label">
                                  These collections couldn’t load — tap to
                                  try again
                                </span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  {/* Axis 3 — Era (2026-11-11): chronological period
                      chips with counts from phase 0's era derivation.
                      Position along the row is time. Records with no
                      usable year match no era selection; there is no
                      "unknown" chip — the residue is visible by
                      subtraction from the counts. */}
                  <div className="tf2-axis">
                    <div className="tf2-axis-label" id="tf2-axis-era">
                      Era
                    </div>
                    <div className="tf2-axis-main">
                      <div
                        className="tf2-chips"
                        role="group"
                        aria-labelledby="tf2-axis-era"
                      >
                        {TOWER_ERAS.map((e) => {
                          // Truthful-source resolver (2026-11-20
                          // correction): published fine-era tallies
                          // from boot, the bucket×era cube within a
                          // collection selection, resident tallies
                          // once the selection's scopes are fully
                          // in; null = no truthful number yet, and
                          // the chip carries none rather than a
                          // prefix count (2026-11-13 rule).
                          const count = eraCountFor(e);
                          const on = eraFilter === e.id;
                          return (
                            <button
                              key={e.id}
                              type="button"
                              className={`tf2-chip${on ? " is-active" : ""}`}
                              onClick={() => selectEra(e.id)}
                              aria-pressed={on}
                            >
                              {e.label}
                              {count != null && (
                                <span className="tf2-count">
                                  {count.toLocaleString()}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <LibraryResults
              artifacts={artifacts}
              towerOrder={towerOrder}
              rankMap={rankMap}
              rankedIndices={rankedIndices}
              browseIndices={browseIndices}
              matchCount={matchCount}
              rowBudget={rowBudget}
              onLoadMore={() => setRowBudget((b) => b + TOWER_ROWS_PER_PAGE)}
              blendedModel={serverActive && serverModel ? serverModel : blendedModel}
              searchPage={searchPage}
              searchExtra={searchExtra}
              onSearchPage={(p) => {
                setSearchPage(p);
                setSearchExtra(0);
              }}
              onSearchLoadMore={() => {
                setSearchExtra((x) => x + SEARCH_PAGE_SIZE);
                serverLoadMore();
              }}
              onUndoRelax={() => setStrictQuery(listQuery)}
              onUseSuggestion={(s) => setQuery(s)}
              onClearQuery={() => setQuery("")}
              showSkeleton={showSkeleton}
              headingRef={resultsHeadingRef}
              provisional={!fullIndexReady}
              totalHint={worksTotal || catalogTotalHint}
              scopeTotal={scopeModeOn ? selTotalBound : 0}
              scopeLoading={scopeModeOn && selScopesLoading}
              scopeReady={scopeModeOn && selScopesReady && scopeScanSettled}
              scopeFiltered={
                !!(
                  bucketFilter ||
                  eraFilter ||
                  collKey ||
                  shelfKey ||
                  paperKey ||
                  paperTypeKey
                )
              }
              awaitingArrival={awaitingArrival}
              awaitingLabel={
                bucketFilter
                  ? activeBucketLabel
                  : activeFilterSummary !== "All entries"
                    ? activeFilterSummary
                    : activeBucketLabel
              }
              q={q}
              rawQuery={query}
              go={go}
              onOpen={openEntry}
              viewMode={viewMode}
              searching={!!q && q.trim().length >= 2}
            />
              </div>
            </div>
          </>
        )}
      </section>
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

export function SuggestEntry({ go, onReady }) {
  const s = towerOfBabel.suggest;
  const fields = s.fields;
  // /api/suggest requires type, title AND format. The slim form only asks
  // type + title up front, so format starts at "single" (a standalone
  // work) and can be changed inside the optional details below — the
  // submission contract is unchanged.
  const initialValues = fields.reduce((acc, f) => {
    acc[f.name] = f.name === "format" ? "single" : "";
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
  // Report ready on mount so the Tower boot loader (the standard Tower
  // loading ceremony) dismisses on its normal beat instead of sitting
  // until the failsafe — the same contract DonatePage uses.
  useEffect(() => {
    if (onReady) onReady();
  }, [onReady]);
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
  const renderField = (f) => {
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
  };
  return (
    <main className="page-shell inner-page tower-suggest tower-lib" id="main-content" tabIndex={-1}>
      <section className="tlib-hero">
        <div className="section-index">{s.sectionIndex}</div>
        <h1 className="tlib-title">{s.heading}</h1>
        <p className="tlib-lede">{s.intro}</p>
      </section>
      <section className="tlib-panel tlib-form-panel">
        <div className="suggest-wrap">
          {!submitted ? (
            <form
              className="suggest-form"
              onSubmit={onSubmit}
              noValidate={false}
              aria-label="Suggest a library entry"
            >
              {fields.slice(0, 2).map(renderField)}
              <details className="suggest-details">
                <summary>
                  <span className="section-index">ADD DETAILS</span>
                  <span className="suggest-details-note">OPTIONAL</span>
                  <span className="tower-about-chevron" aria-hidden="true">▾</span>
                </summary>
                <div className="suggest-details-body">
                  {fields.slice(2).map(renderField)}
                </div>
              </details>
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
    <section className="tlib" aria-label="Tower API access">
      <div className="tlib-hero">
        <div className="section-index">TOWER OF BABEL — PROGRAMMATIC ACCESS</div>
        <h1 className="tlib-title">API access</h1>
        <p className="tlib-lede">
          Prefer a machine to do the fetching? API v1 gives programs
          server-side search, full-text delivery, and bulk snapshots of
          this same library — a free key by email, paid tiers above it.
          The texts themselves stay free to read here either way; a key
          buys the maintained pipe, the throughput, and someone standing
          behind it.
        </p>
        <ul className="tlib-chips" aria-label="Live API status">
          {apiStatus === null ? (
            <li className="tower-chip">Live status — checking…</li>
          ) : (
            <>
              <li className="tower-chip">
                Keys — {keysConfigured ? "available" : "not yet open"}
              </li>
              <li className="tower-chip">
                Subscriptions — {subscriptionsOpen ? "open" : "not yet open"}
              </li>
              <li className="tower-chip">
                Webhook — {webhookConfigured ? "configured" : "not configured"}
              </li>
            </>
          )}
        </ul>
      </div>

      <div className="tlib-panel">
        <div className="tlib-panel-head">
          <span className="section-index">API PLANS</span>
          {subscriptionsOpen && (
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
          )}
        </div>
        <div className="tlib-tiers">
          {api.tiers.map((t) => {
            const paid = !!t.priceMonthly;
            const price =
              t.price || (billing === "annual" ? t.priceAnnual : t.priceMonthly);
            const selectable =
              (paid && subscriptionsOpen) || t.id === "free";
            const isOn = selectable && planSel === t.id;
            const inner = (
              <>
                <span className="tlib-tier-top">
                  <span className="tlib-tier-name">{t.name}</span>
                  {isOn && <span className="tlib-tier-tag">Selected</span>}
                </span>
                <span className="tlib-tier-price">{price}</span>
                <span className="tlib-tier-limit">{t.limit}</span>
                <span className="tlib-tier-blurb">{t.blurb}</span>
              </>
            );
            return selectable ? (
              <button
                type="button"
                key={t.id}
                className={`tlib-tier tlib-tier-btn${isOn ? " is-on" : ""}`}
                aria-pressed={isOn}
                onClick={() => setPlanSel(t.id)}
              >
                {inner}
              </button>
            ) : (
              <div className="tlib-tier" key={t.id}>
                {inner}
              </div>
            );
          })}
        </div>
        {planSel === "free" ? (
          <div className="tlib-keyform">
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
        ) : subscriptionsOpen ? (
          <>
            <div className="tlib-actions">
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
          <p className="body-copy">{api.subscribePending}</p>
        )}
        <div className="tlib-actions">
          {PORTAL_URL ? (
            <a className="api-quiet" href={PORTAL_URL}>
              MANAGE BILLING <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <p className="body-copy">{api.billingNote}</p>
          )}
        </div>
        <p className="tlib-note">{api.refundNote}</p>
      </div>

      <div className="tlib-actions">
        <button
          type="button"
          className="api-quiet"
          onClick={() => go("/tower-of-babel/api")}
        >
          READ THE FULL API DOCUMENTATION{" "}
          <span aria-hidden="true">↗</span>
        </button>
      </div>
      <p className="tlib-note">
        Endpoints, request limits, versioning, licensing, and the keyless
        catalog surface — everything a person or an agent needs to use
        the API is documented on the API page.
      </p>
    </section>
  );
}


// ----- Tower of Babel / API access page ------------------------------
// /tower-of-babel/library/research — the API block as a full page.
// (The tower-desk class stays on <main>: the stylesheet scopes the
// API block's rules under it — renaming the scope is a separate,
// purely cosmetic change.)
export function TowerApiAccessPage({ go, onReady }) {
  // Report ready on mount so the Tower boot loader dismisses on its
  // normal beat instead of the failsafe — the same contract DonatePage
  // and SuggestEntry use. This page is the one Tower destination that
  // never reported: the boot's animation finished and then sat frozen
  // over the painted page until the 4 s failsafe removed it
  // (INVENTORY 64, diagnosed 2026-11-17).
  useEffect(() => {
    if (onReady) onReady();
  }, [onReady]);
  return (
    <main className="page-shell inner-page tower-light tower-desk tower-lib" id="main-content" tabIndex={-1}>
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
// The load is shared with the row headline (INVENTORY 41): one fetch of
// the entry's text feeds both the headline preview and this block.
function usePassageSnippets(item, wanted) {
  const [snips, setSnips] = useState(null);
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
  return snips;
}

function SnippetBlock({ item, go, onOpen, snips, wanted, onWant, skipFirst }) {
  if (!item.text) return null;
  if (!wanted) {
    return (
      <button
        type="button"
        className="text-link tower-snippets-more"
        onClick={onWant}
      >
        Show passages
      </button>
    );
  }
  if (!snips) {
    return <p className="tower-snippets-status">Finding passages…</p>;
  }
  if (!snips.snippets.length) return null;
  // When the headline already carries the first passage (a body-text
  // match under INVENTORY 41), the block offers the NEXT passages so
  // the same text never appears twice in one row.
  const shown = skipFirst
    ? snips.snippets.slice(1, 3)
    : snips.snippets.slice(0, 2);
  if (!shown.length) return null;
  return (
    <div className="tower-snippets tower-snippets-inline">
      {shown.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="tower-snippet-sep" aria-hidden="true">…</span>}
          <button
            type="button"
            className="tower-snippet"
            onClick={(e) => {
              // Passage opens ride the same cover flight; the ?at=&hl=
              // target rides along verbatim so the share-landing logic
              // in the reader applies exactly as a bare go() did.
              const to = `/tower-of-babel/library/${item.key}?at=${s.markStart}&hl=${s.markStart}-${s.markEnd}`;
              if (onOpen) onOpen(item.artifact, to, e);
              else go(to);
            }}
            dangerouslySetInnerHTML={{ __html: s.html }}
            aria-label={`Read this passage in ${item.artifact.title}`}
          />
        </Fragment>
      ))}
    </div>
  );
}

// One row of the unified search list.
const UnifiedRow = memo(function UnifiedRow({ item, rank, go, tokens, autoSnippets, onOpen }) {
  const a = item.artifact;
  const entryPath = `/tower-of-babel/library/${item.key}`;
  // Passage loading, shared between the headline and the block below:
  // auto for the first rows, on demand ("Show passages") for the rest —
  // the same lazy policy the snippet block has always had.
  const [passagesWanted, setPassagesWanted] = useState(autoSnippets);
  useEffect(() => {
    if (autoSnippets) setPassagesWanted(true);
  }, [autoSnippets]);
  const snips = usePassageSnippets(item, passagesWanted);
  // INVENTORY 41 (Joshua's match-type rule): a BODY-TEXT match headlines
  // the row with a preview of the matched passage INSTEAD of the title;
  // a TITLE match keeps the title — and when both match, the title wins.
  // The preview is the first passage cut from the entry's own text by
  // getSnippets (never assembled from anything else); until it loads —
  // or if the text yields no passage — the title stands, unchanged.
  const bodyOnly = !!item.text && !(item.meta && item.meta.title);
  const preview =
    bodyOnly && snips && snips.snippets.length ? snips.snippets[0] : null;
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
        {preview ? (
          <button
            type="button"
            className="tower-row-title-btn"
            onClick={(e) => {
              // The headline IS the passage here, so it rides the same
              // passage deep link the snippet buttons use.
              const to = `${entryPath}?at=${preview.markStart}&hl=${preview.markStart}-${preview.markEnd}`;
              if (onOpen) onOpen(a, to, e);
              else go(to);
            }}
            aria-label={`Read this passage in ${a.title}`}
          >
            <span
              className="tower-row-title tower-row-preview"
              dangerouslySetInnerHTML={{ __html: preview.html }}
            />
          </button>
        ) : (
          <button
            type="button"
            className="tower-row-title-btn"
            onClick={(e) => (onOpen ? onOpen(a, entryPath, e) : go(entryPath))}
          >
            <span className="tower-row-title">{highlightText(a.title, tokens)}</span>
          </button>
        )}
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
          <SnippetBlock
            item={item}
            go={go}
            onOpen={onOpen}
            snips={snips}
            wanted={passagesWanted}
            onWant={() => setPassagesWanted(true)}
            skipFirst={!!preview}
          />
        ) : a.description ? (
          <span className="tower-row-desc">{a.description}</span>
        ) : null}
      </span>
      <span className="tower-row-tags">
        <span className="tower-tag">{a.collection}</span>
        {a.format && <span className="tower-tag">{a.format}</span>}
      </span>
    </div>
  );
});

const LibraryResults = memo(function LibraryResults({
  artifacts,
  towerOrder,
  rankMap,
  rankedIndices,
  browseIndices,
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
  provisional,
  totalHint,
  scopeTotal,
  scopeLoading,
  scopeReady,
  scopeFiltered,
  awaitingArrival,
  awaitingLabel,
  q,
  rawQuery,
  go,
  onOpen,
  viewMode,
  searching,
}) {
  // Browse-mode visible slice. Computed unconditionally (hooks order must
  // never depend on the mode) and only used by the browse branch below.
  const visibleIndices = useMemo(() => {
    // Committed browse result (filter engine, design §10): the match
    // list IS the window source — slice it directly. This replaces a
    // second full-order walk here (rankMap membership per record,
    // with a Proxy id decode per probed record) that repeated the
    // rank memo's scan cost on every browse render.
    // Array.from is load-bearing (design §11.1): browseIndices is a
    // Uint32Array (the engine commits typed-array slices, and the
    // baked sort orders are typed subarrays), and
    // TypedArray.prototype.map coerces every mapped value to a
    // number — the card elements became 0s and the window rendered
    // as a text node of raw zeros with no cards at all. The slice
    // is at most rowBudget long, so the conversion is trivial.
    if (browseIndices) return Array.from(browseIndices.slice(0, rowBudget));
    if (rankedIndices) return Array.from(rankedIndices.slice(0, rowBudget));
    const out = [];
    for (let k = 0; k < towerOrder.length && out.length < rowBudget; k++) {
      const i = towerOrder[k];
      if (rankMap.has(artifacts[i].artifact_id)) out.push(i);
    }
    return out;
  }, [artifacts, towerOrder, rankMap, rankedIndices, browseIndices, rowBudget]);
  // --------------------- Browse windowing (2026-11-10) -------------------
  // The load-more model used to keep EVERY loaded card mounted: DOM
  // nodes, decoded cover bitmaps and compositor layers grew linearly
  // with scroll depth (~500 DOM nodes and ~9,500 px of document per
  // 50 cards in the full-scale harness), and on phones the tab was
  // jetsam-killed mid-scroll once the resident catalog (~0.9 GB) plus
  // that growth crossed the ceiling — Joshua's "loads fully, crashes
  // when I start scrolling" report. The browse branch now mounts only
  // a window of cards around the viewport; spacers preserve the full
  // scroll height. Item pitch is measured from the real DOM and
  // refined after every render, and any measurement failure falls
  // back to mounting everything, exactly as before.
  const WIN_SIZE = 240;
  const WIN_OVER = 80;
  const wrapRef = useRef(null);
  const [winStart, setWinStart] = useState(0);
  const [pitch, setPitch] = useState(0);
  const browseCount = visibleIndices.length;
  const countRef = useRef(browseCount);
  countRef.current = browseCount;
  const pitchRef = useRef(0);
  pitchRef.current = pitch;
  const winStartRef = useRef(0);
  winStartRef.current = winStart;
  // A new query or a view switch restarts the window at the top.
  useEffect(() => {
    setWinStart(0);
    setPitch(0);
  }, [q, viewMode]);
  const windowed = pitch > 0 && browseCount > WIN_SIZE;
  const winEffStart = windowed
    ? Math.max(0, Math.min(winStart, browseCount - WIN_SIZE))
    : 0;
  const winSlice = windowed
    ? visibleIndices.slice(winEffStart, winEffStart + WIN_SIZE)
    : visibleIndices;
  const topSpacer = windowed ? winEffStart * pitch : 0;
  const bottomSpacer = windowed
    ? (browseCount - winEffStart - winSlice.length) * pitch
    : 0;
  // Measure/refine the per-item pitch from the mounted slice.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const content = wrap.firstElementChild;
    if (!content) return;
    let spacerPx = 0;
    let items = 0;
    for (const child of content.children) {
      if (child.classList && child.classList.contains("tower-win-spacer")) {
        spacerPx += child.offsetHeight;
      } else {
        items++;
      }
    }
    if (!items) return;
    const p = (content.offsetHeight - spacerPx) / items;
    if (p > 4 && (pitchRef.current === 0 || Math.abs(p - pitchRef.current) / pitchRef.current > 0.02)) {
      setPitch(p);
    }
  });
  // Follow the viewport: shift the window when the scroll position
  // leaves the mounted slice's neighborhood.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const wrap = wrapRef.current;
      const p = pitchRef.current;
      const count = countRef.current;
      if (!wrap || !p || count <= WIN_SIZE) return;
      const top = wrap.getBoundingClientRect().top + window.scrollY;
      const center = window.scrollY + window.innerHeight * 0.5;
      const idx = Math.floor((center - top) / p);
      const want = Math.max(0, Math.min(count - WIN_SIZE, idx - WIN_OVER));
      if (Math.abs(want - winStartRef.current) > WIN_OVER / 2) {
        setWinStart(want);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  // Load-more while stationary at the bottom: re-center the window so
  // the freshly loaded chunk mounts without waiting for a scroll.
  useEffect(() => {
    const wrap = wrapRef.current;
    const p = pitchRef.current;
    if (!wrap || !p || browseCount <= WIN_SIZE) return;
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    const center = window.scrollY + window.innerHeight * 0.5;
    const idx = Math.floor((center - top) / p);
    const want = Math.max(0, Math.min(browseCount - WIN_SIZE, idx - WIN_OVER));
    if (Math.abs(want - winStartRef.current) > WIN_OVER / 2) {
      setWinStart(want);
    }
  }, [browseCount]);
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
                  onOpen={onOpen}
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
              {(visibleCount < items.length || model.hasMore) && (
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
        {matchCount} of{" "}
        {/* Scope mode (2026-11-20 correction): the denominator is
            the SELECTION's true total — from the server tallies /
            published tallies / scope totals — never the resident
            prefix length, which read "… OF 20000 ENTRIES" for every
            selection in Joshua's recording no matter its size. Once
            the selection's scopes are fully resident the match
            count IS the total. Outside scope mode the denominator
            keeps its previous truthful-total rule. */}
        {scopeTotal > 0
          ? scopeReady && scopeFiltered
            ? matchCount
            : scopeTotal
          : provisional && totalHint > artifacts.length
            ? totalHint
            : artifacts.length}{" "}
        {artifacts.length === 1 ? "entry" : "entries"}
        {scopeLoading ? " — loading…" : ""}
        {/* "matching" is claimed only when a real search for this
            exact query produced the list being counted (the blended
            model carries its query) — never for a typed-but-not-yet-
            searched query riding the browse list (2026-11-15 header
            truth fix). */}
        {q && blendedModel && blendedModel.query === q
          ? ` matching “${q}”`
          : ""}
      </p>
      {matchCount === 0 && (
        <p className="tower-empty-results">
          {awaitingArrival
            ? `No ${awaitingLabel} entries have loaded yet — this part of the catalog is still arriving${
                scopeTotal > 0
                  ? ` (0 of ${scopeTotal.toLocaleString("en-US")} in this selection)`
                  : totalHint > artifacts.length
                    ? ` (${artifacts.length.toLocaleString(
                        "en-US"
                      )} of ${totalHint.toLocaleString("en-US")} loaded so far)`
                    : ""
              }. Entries appear here on their own as the load continues.`
            : "No entries match. Clear the search or choose a different collection."}
        </p>
      )}
      <div ref={wrapRef}>
        {viewMode === "grid" ? (
          <div className="tower-grid">
            {windowed && topSpacer > 0 && (
              <div
                className="tower-win-spacer"
                aria-hidden="true"
                style={{ height: topSpacer, gridColumn: "1 / -1" }}
              />
            )}
            {winSlice.map((i) => {
              const a = artifacts[i];
              return (
                <TowerBookCard
                  key={a.artifact_id}
                  a={a}
                  go={go}
                  onOpen={onOpen}
                  wide={a.collection === "PODCASTS"}
                />
              );
            })}
            {windowed && bottomSpacer > 0 && (
              <div
                className="tower-win-spacer"
                aria-hidden="true"
                style={{ height: bottomSpacer, gridColumn: "1 / -1" }}
              />
            )}
          </div>
        ) : (
          <div className="tower-rows">
            {windowed && topSpacer > 0 && (
              <div
                className="tower-win-spacer"
                aria-hidden="true"
                style={{ height: topSpacer }}
              />
            )}
            {winSlice.map((i) => {
              const a = artifacts[i];
              return (
                <TowerRow
                  key={a.artifact_id}
                  a={a}
                  index={rankMap.get(a.artifact_id)}
                  go={go}
                  onOpen={onOpen}
                />
              );
            })}
            {windowed && bottomSpacer > 0 && (
              <div
                className="tower-win-spacer"
                aria-hidden="true"
                style={{ height: bottomSpacer }}
              />
            )}
          </div>
        )}
      </div>
      {!searching && matchCount > rowBudget && (
        <button
          type="button"
          className="tower-load-more"
          onClick={onLoadMore}
        >
          Load more — showing {browseCount} of {matchCount}
        </button>
      )}
    </>
  );
});

// One catalog row. Memoized: the artifact object is a stable module-level
// reference and `go` is stable across keystrokes, so a row re-renders only
// when its own rank actually changes. Only matching rows are mounted (see
// LibraryResults), so there is no per-row visibility flag.
const TowerRow = memo(function TowerRow({ a, index, go, onOpen }) {
  const entryPath = `/tower-of-babel/library/${a.artifact_id}`;
  return (
    <button
      className="tower-row reveal"
      onClick={(e) => (onOpen ? onOpen(a, entryPath, e) : go(entryPath))}
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
    </button>
  );
});

// ----- Entry header essentials (2026-10-30, Joshua's pick) -------------------
// Cover plate, share row, citation block and the relocated download card for
// the entry page's top section. Everything derives from fields the catalog
// record already carries — no invented metadata.

function towerEntryUrl(artifact) {
  return `https://antarctic-labs.com/tower-of-babel/library/${artifact.artifact_id}`;
}

// file_size is a raw byte count on some records ("180377") and already
// formatted on others ("25 KB") — normalize for display.
function towerFileSize(v) {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) return s;
  const n = Number(s);
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

// A Project Gutenberg number, when the record carries one: numeric-prefix
// artifact ids ("3694-every-man-in-his-humour") or a gutenberg.org source
// URL. Gutenberg serves a cover image for most of those numbers; where one
// exists it replaces the typographic plate.
function towerPgNumber(artifact) {
  const m = /^(\d{2,7})[-_]/.exec(artifact.artifact_id || "");
  if (m) return m[1];
  const urls = [artifact.source_url, artifact.download_url]
    .filter(Boolean)
    .join(" ");
  const g = /gutenberg\.org\/(?:ebooks|files|cache\/epub)\/(\d{2,7})/.exec(urls);
  return g ? g[1] : null;
}

function EntryCover({ artifact }) {
  const pg = towerPgNumber(artifact);
  // The full record (which carries source_url) lands after first paint —
  // track only the failure, never gate mounting on the initial pg value.
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div className="tower-cover">
      <div className="tower-cover-plate" aria-hidden="true">
        <span className="tower-cover-coll">{artifact.collection}</span>
        <span className="tower-cover-title">{artifact.title}</span>
        <span className="tower-cover-rule" />
        {artifact.creator ? (
          <span className="tower-cover-creator">{artifact.creator}</span>
        ) : null}
        <span className="tower-cover-brand">TOWER OF BABEL</span>
      </div>
      {pg && !imgFailed ? (
        <img
          className="tower-cover-img"
          src={`https://www.gutenberg.org/cache/epub/${pg}/pg${pg}.cover.medium.jpg`}
          alt={`Cover of ${artifact.title}`}
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      ) : null}
    </div>
  );
}

const SHARE_ICON_PATHS = {
  Mastodon: "M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z",
  Twitter: "M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z",
  Facebook: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  Bluesky: "M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z",
};

// Share row (Joshua 2026-10-30): sits directly under the byline, above the
// description — Email first, then the same services Gutenberg shows
// (Mastodon, Twitter, Facebook, Bluesky) plus Print.
function EntryShare({ artifact }) {
  const url = towerEntryUrl(artifact);
  const text = `${artifact.title}${artifact.creator ? ` by ${artifact.creator}` : ""} — Tower of Babel, Antarctic Labs`;
  const e = encodeURIComponent;
  const links = [
    ["Email", `mailto:?subject=${e(artifact.title)}&body=${e(text + "\n" + url)}`, "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"],
    ["Mastodon", `https://mastodon.social/share?text=${e(text + " " + url)}`, SHARE_ICON_PATHS.Mastodon],
    ["Twitter", `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}`, SHARE_ICON_PATHS.Twitter],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`, SHARE_ICON_PATHS.Facebook],
    ["Bluesky", `https://bsky.app/intent/compose?text=${e(text + " " + url)}`, SHARE_ICON_PATHS.Bluesky],
  ];
  return (
    <div className="tower-share" aria-label="Share this work">
      {links.map(([name, href, d]) => (
        <a
          key={name}
          className="tower-share-btn"
          href={href}
          target={name === "Email" ? undefined : "_blank"}
          rel="noopener noreferrer"
          aria-label={`Share via ${name}`}
          title={`Share via ${name}`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d={d} />
          </svg>
        </a>
      ))}
      <button
        type="button"
        className="tower-share-btn"
        onClick={() => window.print()}
        aria-label="Print this page"
        title="Print"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z" />
        </svg>
      </button>
    </div>
  );
}

function CiteRow({ label, text, parts }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the text is on screen to copy by hand */
    }
  };
  return (
    <div className="tower-cite-row">
      <span className="tower-cite-label">{label}</span>
      <span className="tower-cite-text">
        {parts
          ? parts.map((p, i) =>
              p.em ? <em key={i}>{p.t}</em> : <span key={i}>{p.t}</span>
            )
          : text}
      </span>
      <button type="button" className="tower-cite-copy" onClick={copy}>
        {copied ? "COPIED" : "COPY"}
      </button>
    </div>
  );
}

// Bluebook short form, derived mechanically from the artifact id — the id
// literally encodes the citation (uslaw-usc-t2-s1513 = 2 U.S.C. § 1513).
function bluebookCite(artifact) {
  const id = artifact.artifact_id || "";
  let m = /^uslaw-usc-t(\d+)-s(\d+)(?:-(\d+))?/.exec(id);
  if (m) return `${m[1]} U.S.C. § ${m[2]}${m[3] ? `(${m[3]})` : ""}`;
  m = /^uslaw-cfr-t(\d+)-s(.+)$/.exec(id);
  if (m) return `${m[1]} C.F.R. § ${m[2].replace(/-/g, ".")}`;
  m = /^plaw-(\d+)-(\d+)-(\d{4})/.exec(id);
  if (m) return `Pub. L. No. ${m[1]}-${m[2]}`;
  return null;
}

// Citation helpers (INVENTORY 55, 2026-11-17): every element of a citation
// traces to a field the catalog record itself carries — creator, title, the
// year as cataloged, and a publisher ONLY on a record that carries one. The
// catalog schema carries no publisher field today (field census of the live
// shards, 2026-11-17: 159,338 records, no publisher key anywhere), so the
// publisher segment simply never renders on live data; nothing is invented
// to fill the gap, and nothing is parsed out of free-text fields to fake
// one. A record with no creator starts its citation with the title (the
// styles' no-author form) instead of borrowing the container's name.
const ACCESS_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const ACCESS_MONTHS_BB = [
  "Jan.", "Feb.", "Mar.", "Apr.", "May", "June",
  "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec.",
];
function accessedDates() {
  const d = new Date();
  const day = d.getDate();
  const yr = d.getFullYear();
  const mo = d.getMonth();
  return {
    long: `${ACCESS_MONTHS[mo]} ${day}, ${yr}`,
    bb: `${ACCESS_MONTHS_BB[mo]} ${day}, ${yr}`,
    iso: `${yr}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}
function citeStr(v) {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

// Visible source line (INVENTORY 56, 2026-11-17): names the provenance the
// record itself carries — its `source` string, linked to its `source_url`
// when it has one. A record with no source string but a source URL shows
// the URL's host (derived from the record's own URL, nothing invented); a
// record with neither renders no line rather than a fabricated one.
function EntrySourceLine({ artifact }) {
  const label0 = citeStr(artifact.source);
  let label = label0;
  if (!label && artifact.source_url) {
    try {
      label = new URL(artifact.source_url).hostname.replace(/^www\./, "") || null;
    } catch {
      label = null;
    }
  }
  if (!label) return null;
  return (
    <p className="tower-entry-source">
      <span className="tower-entry-source-label">SOURCE</span>{" "}
      {artifact.source_url ? (
        <a href={artifact.source_url} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ) : (
        <span>{label}</span>
      )}
    </p>
  );
}

function EntryCite({ artifact }) {
  const url = towerEntryUrl(artifact);
  const creator = citeStr(artifact.creator);
  const yearCarried = citeStr(artifact.year);
  const year = yearCarried || "n.d.";
  const publisher = citeStr(artifact.publisher);
  const title = artifact.title;
  const book = artifact.collection === "BOOKS";
  const acc = accessedDates();
  const bibKey = `tower-${(artifact.artifact_id || "work").replace(/[^a-zA-Z0-9-]/g, "")}`;
  const head = creator ? `${creator}. ` : "";
  // The edition segment (original publisher + the year the record carries)
  // renders only when the record carries a publisher; otherwise the year
  // rides with the container segment, as before.
  const ed = publisher ? `${publisher}, ${year}` : null;
  // "n.d." carries its own final period — never double it.
  const yearDot = year === "n.d." ? "n.d." : `${year}.`;
  const rows = [];
  const push = (label, parts) =>
    rows.push({ label, parts, text: parts.map((p) => p.t).join("") });
  // CHICAGO — book titles as books (italic, unquoted); other works quoted.
  if (book) {
    push("CHICAGO", [
      { t: head },
      { t: title, em: true },
      { t: `. ${ed ? `${ed}. ` : ""}Tower of Babel, Antarctic Labs${ed ? ". " : `, ${yearDot} `}${url}. Accessed ${acc.long}.` },
    ]);
  } else {
    push("CHICAGO", [
      { t: `${head}"${title}." Tower of Babel, Antarctic Labs, ${yearDot} ${url}. Accessed ${acc.long}.` },
    ]);
  }
  // MLA
  if (book) {
    push("MLA", [
      { t: head },
      { t: title, em: true },
      { t: `. ${ed ? `${ed}. ` : ""}Tower of Babel, Antarctic Labs${ed ? "" : `, ${year}`}, ${url}. Accessed ${acc.long}.` },
    ]);
  } else {
    push("MLA", [
      { t: `${head}"${title}." Tower of Babel, Antarctic Labs, ${year}, ${url}. Accessed ${acc.long}.` },
    ]);
  }
  // APA — retrieval statement carries the accessed date (these are online
  // texts whose served form can change); no period after the URL.
  const apaPost = `. ${publisher || "Antarctic Labs"}. Retrieved ${acc.long}, from ${url}`;
  if (book) {
    push("APA", [
      { t: creator ? `${creator}. (${year}). ` : "" },
      { t: title, em: true },
      { t: creator ? apaPost : `. (${year})${apaPost}` },
    ]);
  } else {
    push("APA", [
      { t: creator ? `${creator}. (${year}). ${title}${apaPost}` : `${title}. (${year})${apaPost}` },
    ]);
  }
  // BLUEBOOK (LAW only, mechanically derived from the id — see bluebookCite)
  const bb = artifact.collection === "LAW" ? bluebookCite(artifact) : null;
  if (bb) {
    push("BLUEBOOK", [
      { t: `${bb}, Tower of Babel, Antarctic Labs, ${url} (last visited ${acc.bb}).` },
    ]);
  }
  // BIBTEX — @book for books; author/year/publisher fields appear only when
  // the record carries them.
  const bibFields = [];
  if (creator) bibFields.push(`author = {${creator}}`);
  bibFields.push(`title = {${title}}`);
  if (yearCarried) bibFields.push(`year = {${yearCarried}}`);
  if (publisher) bibFields.push(`publisher = {${publisher}}`);
  bibFields.push(
    `url = {${url}}`,
    `urldate = {${acc.iso}}`,
    `note = {Tower of Babel, Antarctic Labs}`
  );
  push("BIBTEX", [
    { t: `@${book ? "book" : "misc"}{${bibKey}, ${bibFields.join(", ")}}` },
  ]);
  return (
    <details className="tower-desc tower-cite">
      <summary>
        <span className="section-index">CITE THIS WORK</span>
        <span className="tower-about-chevron" aria-hidden="true">▾</span>
      </summary>
      <div className="tower-cite-body">
        {rows.map((r) => (
          <CiteRow key={r.label} label={r.label} text={r.text} parts={r.parts} />
        ))}
      </div>
    </details>
  );
}

// Download formats (2026-11-17, INVENTORY 60): the download card is a
// dropdown of Project Gutenberg's established format set — EPUB,
// Kindle, HTML, and Plain Text UTF-8 — generated from the entry's
// hosted TXT on request by /api/download (server-side, so a phone
// never holds a huge text and its conversion in browser memory at
// once). Plain Text is the hosted file itself, linked directly as
// before. The generated formats ride a fetch so a failure surfaces as
// an inline error in the card, never as a broken file or a navigation
// away from the entry. Entries whose download_url is not a hosted
// local text keep the original single plain-text link, unchanged.
const GENERATED_FORMATS = [
  { key: "epub", label: "EPUB — E-READERS" },
  { key: "kindle", label: "KINDLE — MOBI" },
  { key: "html", label: "HTML — WEB BROWSER" },
];
function EntryDownloads({ artifact }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const url = typeof artifact.download_url === "string" ? artifact.download_url : "";
  const file = url.split("/").pop() || "";
  const isLocalText = url.startsWith("/tower-of-babel/") && file.endsWith(".txt");
  const size = towerFileSize(artifact.file_size);
  const generate = async (format) => {
    if (busy) return;
    setBusy(format);
    setError("");
    try {
      const qs = new URLSearchParams({
        file,
        format,
        id: artifact.artifact_id || "",
        title: artifact.title || "",
        creator: artifact.creator || "",
      });
      const res = await fetch(`/api/download?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      const fallback = `${artifact.artifact_id || "tower-of-babel"}.${format === "kindle" ? "mobi" : format}`;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = m ? m[1] : fallback;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    } catch {
      setError("That format couldn't be prepared just now. The plain text download always works.");
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="tower-download-card">
      <span className="tower-download-label">DOWNLOAD FOR FREE</span>
      <span className="tower-download-note">
        For your e-reader or reading app — the complete full text.
      </span>
      {isLocalText ? (
        <>
          <button
            type="button"
            className="tower-download-btn"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="tower-download-fmt">CHOOSE A FORMAT</span>
            <span className="tower-download-arrow" aria-hidden="true">{open ? "▴" : "▾"}</span>
          </button>
          {open && (
            <div className="tower-download-menu">
              <a className="tower-download-opt" href={artifact.download_url} download>
                <span className="tower-download-fmt">TXT — PLAIN TEXT UTF-8</span>
                {size ? <span className="tower-download-size">{size}</span> : null}
                <span className="tower-download-arrow" aria-hidden="true">↓</span>
              </a>
              {GENERATED_FORMATS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="tower-download-opt"
                  disabled={!!busy}
                  onClick={() => generate(f.key)}
                >
                  <span className="tower-download-fmt">
                    {busy === f.key ? "PREPARING…" : f.label}
                  </span>
                  <span className="tower-download-arrow" aria-hidden="true">↓</span>
                </button>
              ))}
            </div>
          )}
          {error && (
            <p className="tower-download-error" role="alert">{error}</p>
          )}
        </>
      ) : (
        <a className="tower-download-btn" href={artifact.download_url} download>
          <span className="tower-download-fmt">TXT — PLAIN TEXT</span>
          {size ? <span className="tower-download-size">{size}</span> : null}
          <span className="tower-download-arrow" aria-hidden="true">↓</span>
        </a>
      )}
    </div>
  );
}

// Render-safety normalization (2026-11-10): a full record whose fields
// hold shapes the entry render does not expect — an object where a
// string belongs, a string where the tag list belongs — throws inside
// React and lands the reader on the route error panel ("THIS PAGE
// DIDN'T LOAD"), which is what Joshua hit on seemingly random entries:
// the bad shapes cluster in particular source families. Coerce once,
// at the one place every entry consumer (record table, cover, share,
// cite, full text) reads from: scalar fields keep string/number
// values and drop anything else; the description keeps strings only;
// tags keep arrays only. A dropped field simply renders as absent —
// the same as a record that never carried it.
const ARTIFACT_SCALAR_FIELDS = [
  "title", "creator", "collection", "year", "format", "file_size",
  "version", "license", "checksum", "rights_status", "source", "publisher",
  "source_url", "download_url", "download_status",
];
function normalizeArtifact(rec) {
  if (!rec || typeof rec !== "object") return rec;
  let out = rec;
  const fix = (fn) => {
    if (out === rec) out = { ...rec };
    fn(out);
  };
  for (const f of ARTIFACT_SCALAR_FIELDS) {
    const v = rec[f];
    if (v !== undefined && v !== null && typeof v !== "string" && typeof v !== "number") {
      fix((o) => { delete o[f]; });
    }
  }
  if (rec.description !== undefined && rec.description !== null && typeof rec.description !== "string") {
    fix((o) => { delete o.description; });
  }
  if (rec.tags !== undefined && rec.tags !== null && !Array.isArray(rec.tags)) {
    fix((o) => { delete o.tags; });
  }
  return out;
}

// Reader depth milestones (25/50/75/100), once each per work per
// session. Shared by the scroll reader (window-scroll driven) and the
// book view (anchor-offset driven, DESIGN §5.4) so the two can never
// double-fire for the same work.
const readerProgressSeen = new Map();
function fireReaderProgress(id, frac) {
  let seen = readerProgressSeen.get(id);
  if (!seen) {
    seen = new Set();
    readerProgressSeen.set(id, seen);
  }
  const pct = Math.round(frac * 100);
  for (const m of [25, 50, 75, 100]) {
    if (pct >= m && !seen.has(m)) {
      seen.add(m);
      track("reader_progress", { artifact_id: id, percent: m });
    }
  }
}

// The catalog pop-up (INVENTORY 102, DESIGN §8): the entry's whole
// above-the-text block as a floating profile over the book. Opens on
// every entry landing in book view; ✕ / Escape / surround click close
// it; focus lands on the ✕ and Tab stays inside while it is open.
function EntryPopup({ open, onClose, title, children }) {
  const boxRef = useRef(null);
  const closeBtnRef = useRef(null);
  useEffect(() => {
    if (open && closeBtnRef.current) {
      try {
        closeBtnRef.current.focus({ preventScroll: true });
      } catch {
        closeBtnRef.current.focus();
      }
    }
  }, [open ]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const trapTab = (e) => {
    if (e.key !== "Tab") return;
    const box = boxRef.current;
    if (!box) return;
    const focusables = box.querySelectorAll(
      'a[href], button:not([disabled]), summary, input, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return createPortal(
    <div
      className="bv-popup-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bv-popup"
        role="dialog"
        aria-label={title ? `About ${title}` : "Entry details"}
        ref={boxRef}
        onKeyDown={trapTab}
      >
        <button
          type="button"
          className="bv-popup-close"
          ref={closeBtnRef}
          onClick={onClose}
          aria-label="Close entry details"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
        <div className="bv-popup-scroll">{children}</div>
      </div>
    </div>,
    document.body
  );
}

// FULL RECORD (DESIGN §8.9): the entry's catalog record under its own
// names, in the design's fixed order — a row renders only when this
// entry's record carries a non-empty value. WORDS / READ TIME are
// the two derivable rows, shown only with a complete text (stats) and
// labeled computed. No PAGES row, ever: our page counts are typeset
// per device.
// INVENTORY 121 (Joshua 2026-11-18): this block renders only inside
// the entry-info pop-up, where the Catalog Record above it used to
// repeat most of these rows. The split is now exclusive: FORMAT,
// FILE SIZE, LICENSE and RIGHTS live in the Catalog Record alone,
// and TAGS shows once, as the chips under the Catalog Record — none
// of them appear here. Everything else (identity, provenance,
// access, version, checksum, links, computed stats) lives here
// alone. No field is shown twice; no field is dropped entirely.
function FullRecordBlock({ artifact, stats }) {
  const entryUrl = towerEntryUrl(artifact);
  const rows = [
    ["IDENTIFIER", artifact.artifact_id],
    ["TITLE", artifact.title],
    ["CREATOR", artifact.creator],
    ["YEAR", artifact.year],
    ["COLLECTION", artifact.collection],
    ["SOURCE", artifact.source],
    ["SOURCE URL", artifact.source_url, artifact.source_url],
    ["ACCESS", artifact.download_status],
    ["VERSION", artifact.version],
    ["CHECKSUM", artifact.checksum],
    ["DOWNLOAD", artifact.download_url, artifact.download_url],
    ["ENTRY URL", entryUrl, entryUrl],
  ].filter(([, v]) => v !== undefined && v !== null && v !== "");
  return (
    <details className="bv-fullrecord">
      <summary>
        <span className="section-index">FULL RECORD</span>
        <span className="tower-about-chevron" aria-hidden="true">▾</span>
      </summary>
      <dl className="tower-record">
        {rows.map(([label, value, href]) => (
          <div key={label} className="tower-record-row">
            <dt>{label}</dt>
            <dd>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {value}
                </a>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
        {stats && (
          <div className="tower-record-row">
            <dt>WORDS</dt>
            <dd>{stats.words.toLocaleString()} (computed)</dd>
          </div>
        )}
        {stats && (
          <div className="tower-record-row">
            <dt>READ TIME</dt>
            <dd>~{stats.minutes} MIN (computed)</dd>
          </div>
        )}
      </dl>
    </details>
  );
}

export function LibraryArtifact({ go, params, onReady }) {
  const [artifacts, catalogError, , retryArtifacts] = useArtifacts();
  useEffect(() => {
    // Entry pages (2026-11-10): arriving at an entry no longer starts
    // the full client index, and the tower-files manifest is no longer
    // warmed here. The index at 2.56M records is an ~880 MB download —
    // starting it on every entry is what jetsam-killed phone tabs
    // (Joshua's report: clicking any entry crashes the page and it
    // won't stay up). In server mode the catalog streams in as server
    // browse pages instead, so prev/next neighbors resolve
    // progressively exactly as they did while index chunks landed.
    // The manifest loads lazily inside LibraryFullText, deferred until
    // after the text has started (its existence check is optimistic
    // while it is out). Client mode (?server=0) keeps the old
    // behavior — that pipeline is the one the visitor opted into.
    // Server mode no longer starts the browse stream here (2026-11-10,
    // later): it starts once this entry's full record has settled
    // (see the effect below), so the placement bucket, the catalog
    // shard, and the text fetch own the connection during the seconds
    // that decide whether the text appears at all. The stream's jobs
    // on an entry page — the fallback index record and prev/next
    // neighbors — lose nothing by starting a few seconds later.
    if (!towerServerMode()) requestCatalogIndex();
  }, [params.id]);
  // Analytics: reader scroll-depth milestones (25/50/75/100%), once each
  // per work per session. Passive listener, no layout reads beyond the
  // standard scroll metrics, removed on navigation. The book view
  // reports the same milestones from its anchor offset through
  // fireReaderProgress (shared seen-set — no double-firing).
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return;
      fireReaderProgress(params.id, el.scrollTop / max);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [params.id]);
  // Book view (INVENTORY 101/102): the reading-view preference (§12.4 —
  // book is the format; the scroll reader stays as a setting), the
  // catalog pop-up's state (§8.4: opens on every entry landing, ~150ms
  // after the book is visible), and the lifted text stats (the FULL
  // RECORD block's derivable rows + the Dock readout consume them).
  const [readerView, setReaderView] = useState(() => {
    try {
      return window.localStorage.getItem("tob-reader-view-v1") === "scroll"
        ? "scroll"
        : "book";
    } catch {
      return "book";
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("tob-reader-view-v1", readerView);
    } catch {
      /* ignore */
    }
  }, [readerView]);
  const [popupOpen, setPopupOpen] = useState(false);
  const [bookVisible, setBookVisible] = useState(false);
  const [readerStats, setReaderStats] = useState(null);
  useEffect(() => {
    setPopupOpen(false);
    setBookVisible(false);
    setReaderStats(null);
  }, [params.id]);
  useEffect(() => {
    if (readerView !== "book" || !bookVisible) return undefined;
    const t = window.setTimeout(() => setPopupOpen(true), 150);
    return () => window.clearTimeout(t);
  }, [readerView, bookVisible, params.id]);
  const handleBookProgress = useCallback(
    (frac) => fireReaderProgress(params.id, frac),
    [params.id]
  );
  const closePopup = useCallback(() => {
    setPopupOpen(false);
    // Focus returns to the book stage (§8.5).
    const stage = document.querySelector(".bv-root");
    if (stage) {
      try {
        stage.focus({ preventScroll: true });
      } catch {
        /* noop */
      }
    }
  }, []);
  // Full record loads on demand (the index has list fields only).
  const [fullArtifact, setFullArtifact] = useState(null);
  const [fullSettled, setFullSettled] = useState(false);
  useEffect(() => {
    let live = true;
    setFullArtifact(null);
    setFullSettled(false);
    const attempt = (isRetry) => {
      getFullArtifact(params.id).then(
        (a) => { if (live) { setFullArtifact(a); setFullSettled(true); } },
        () => {
          if (!live) return;
          // A FAILED lookup (network, a slow shard) is not a missing
          // entry: retry once before settling, so a transient failure
          // never renders as UNKNOWN ARTIFACT. Only a lookup that
          // resolves without the record — or fails twice — settles.
          // (2026-11-10: the LAW entries rendered UNKNOWN whenever the
          // old 66 MB placement fetch lost its race.)
          if (!isRetry) setTimeout(() => { if (live) attempt(true); }, 1500);
          else { setFullArtifact(null); setFullSettled(true); }
        }
      );
    };
    attempt(false);
    return () => { live = false; };
  }, [params.id]);
  // Deferred browse stream (2026-11-10): starts when the full record
  // settles — see the mount effect above for why.
  useEffect(() => {
    if (fullSettled && towerServerMode()) startCatalogBrowse();
  }, [params.id, fullSettled]);
  // VIEWS counter (INVENTORY 110, DESIGN §8.7 Option B): the stored
  // count for this entry, or null while unknown — the record's VIEWS
  // row renders only from a real number the server returns.
  const [viewCount, setViewCount] = useState(null);
  useEffect(() => {
    setViewCount(null);
  }, [params.id]);
  // Same-session revisit: the open was already counted (below), so
  // just read the stored number back.
  useEffect(() => {
    if (!trackedWorkViews.has(params.id)) return undefined;
    let live = true;
    fetch(`/api/views?id=${encodeURIComponent(params.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d && Number.isFinite(d.views)) setViewCount(d.views);
      })
      .catch(() => { /* no counter reachable — no row */ });
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
    // The VIEWS increment rides the same once-per-session-per-work
    // open. Fire-and-forget: the entry never waits on it, and the row
    // appears only when the real stored count returns.
    fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rec.artifact_id }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Number.isFinite(d.views)) setViewCount(d.views);
      })
      .catch(() => { /* counter unreachable — no row, never an error */ });
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
  const artifact = normalizeArtifact(fullArtifact || indexRecord);
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
  // VIEWS (INVENTORY 110): only ever the real stored number, only
  // once it has come back — no placeholder, no dressed-up zero.
  if (viewCount !== null) {
    record.splice(1, 0, ["VIEWS", viewCount.toLocaleString("en-US")]);
  }
  const status = artifact.download_status;
  // The description override comes from a sidecar file; only a string
  // may reach the paragraph split below (see normalizeArtifact).
  const descText =
    typeof descOverride === "string" && descOverride
      ? descOverride
      : artifact.description;
  const bookMode = readerView === "book";
  // INVENTORY 121 (Joshua 2026-11-18): inside the pop-up, the Catalog
  // Record and the Full Record repeated each other's fields. The
  // Catalog Record now carries only the at-a-glance fields a reader
  // checks first — views, format, file size, license, rights — and
  // every other field lives in the Full Record alone (see
  // FullRecordBlock, which drops the four it used to repeat plus its
  // tags row: the tag chips under the Catalog Record are the one tags
  // display). No field appears in both, and none is lost. Scroll
  // view has no Full Record, so its Catalog Record keeps the
  // complete set, unchanged.
  const catalogRows = bookMode
    ? record.filter(([label]) =>
        ["VIEWS", "FORMAT", "FILE SIZE", "LICENSE", "RIGHTS"].includes(label)
      )
    : record;
  const heroSection = (
      <section className="tower-entry-hero section">
        <div className="tower-entry-head">
          <div className="tower-entry-head-main">
            <div className="section-index">LIBRARY / {artifact.collection}</div>
            <h1>{artifact.title}</h1>
            {(artifact.creator || artifact.year) && (
              <p className="tower-entry-byline">
                {artifact.creator}
                {artifact.creator && artifact.year ? " · " : ""}
                {artifact.year || ""}
              </p>
            )}
            <EntrySourceLine artifact={artifact} />
          </div>
          <EntryCover artifact={artifact} />
        </div>
        {!bookMode && <EntryShare artifact={artifact} />}
        {/* AdSense plan item 2 (2026-11-18): a revamp INTRODUCTION
            (descOverride present) renders un-collapsed, as an open
            section — the core set's introductions are the entry's
            editorial content and must not sit behind a click. Plain
            catalog descriptions keep the collapsed details exactly as
            before. Same paragraphs, same tower-entry-lede styling. */}
        {descText && (typeof descOverride === "string" && descOverride ? (
          <section className="tower-desc tower-desc-open">
            <span className="section-index">INTRODUCTION</span>
            <div className="tower-desc-body">
              {descText
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p, i) => (
                  <p className="tower-entry-lede" key={i}>{p}</p>
                ))}
            </div>
          </section>
        ) : (
          <details className="tower-desc">
            <summary>
              <span className="section-index">DESCRIPTION</span>
              <span className="tower-about-chevron" aria-hidden="true">▾</span>
            </summary>
            <div className="tower-desc-body">
              {descText
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p, i) => (
                  <p className="tower-entry-lede" key={i}>{p}</p>
                ))}
            </div>
          </details>
        ))}
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
  );
  const recordSection = (
      <section className="tower-entry-record section">
        <div className="section-index">CATALOG RECORD</div>
        <dl className="tower-record">
          {catalogRows.map(([label, value]) => (
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
        {/* INVENTORY 138 (Joshua 2026-11-21): the Full Record
            dropdown lives HERE, directly under the Catalog Record
            rows, so the record and its full expansion read as one
            unit — it used to render in its own section after the
            Download box and Cite row, stranded at the bottom of the
            pop-up. Book mode only: scroll view has no Full Record.
            Contents and behavior unchanged; only the position moved,
            so the pop-up order is now Catalog Record → Full Record →
            Download → Cite. */}
        {bookMode && (
          <FullRecordBlock artifact={artifact} stats={readerStats} />
        )}
        {status === "AVAILABLE" && artifact.download_url && (
          <EntryDownloads artifact={artifact} />
        )}
        <EntryCite artifact={artifact} />
      </section>
  );
  const entryNav = artifacts.length > 1 ? (
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
      );
  return (
    <main className="page-shell inner-page tower-light tower-entry" id="main-content" tabIndex={-1}>
      {bookMode ? (
        <EntryPopup open={popupOpen} onClose={closePopup} title={artifact.title}>
          {heroSection}
          {recordSection}
          <div className="bv-popup-footer">
            <button type="button" className="tower-source-btn" onClick={() => window.print()}>
              PRINT
            </button>
            <button
              type="button"
              className="tower-source-btn"
              onClick={() => {
                setReaderView("scroll");
                setPopupOpen(false);
              }}
            >
              SCROLL VIEW
            </button>
          </div>
        </EntryPopup>
      ) : (
        <>
          {heroSection}
          {recordSection}
        </>
      )}
      <LibraryFullText
        artifact={artifact}
        readerView={readerView}
        popupOpen={popupOpen}
        onToggleView={() => setReaderView(bookMode ? "scroll" : "book")}
        onInfo={() => setPopupOpen(true)}
        onExit={() => go("/tower-of-babel/library")}
        onProgress={handleBookProgress}
        onStats={setReaderStats}
        onBookVisible={() => setBookVisible(true)}
      />
      {!bookMode && entryNav}
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
function LibraryFullText({
  artifact,
  readerView = "book",
  // INVENTORY 119: forwarded to BookReader → the orb, which hides
  // while the entry-info pop-up is open.
  popupOpen = false,
  onToggleView,
  onInfo,
  onExit,
  onProgress,
  onStats,
  onBookVisible,
}) {
  const artifactId = artifact.artifact_id;
  const status = artifact.download_status;
  const recordUrl = artifact.download_url;
  // Derived text URL (2026-11-10, Joshua's report: a random PAPERS
  // entry sat on "still being prepared" forever on his phone). The
  // compact record the entry page paints from carries download_status
  // but no download_url; the URL used to arrive only with the full
  // record, which sits inside a 9–19 MB catalog shard — on a phone
  // that fetch IS the wait, and when it loses to its abort budget the
  // text never starts at all. For local AVAILABLE entries the URL is
  // a pure function of the id (verified against ~68k full records
  // across four shards: every AVAILABLE record's download_url is
  // /tower-of-babel/<id>.txt, except families whose files carry a
  // title-suffixed name, e.g. podcast-*). Those exceptions are safe:
  // the existence check below rejects a derived name the manifest
  // doesn't hold, and a derived fetch that 404s is swallowed by the
  // fetch effect — the full record's real URL takes over when it
  // lands. The record's own URL, when present, always wins.
  const url =
    recordUrl ||
    (status === "AVAILABLE" && artifactId
      ? `/tower-of-babel/${artifactId}.txt`
      : undefined);
  const urlIsDerived = !recordUrl && !!url;
  // Text background mode: cycles transparent -> light -> dark (2026-10-18).
  // Only affects the .tower-fulltext section below the divider.
  // Book view (DESIGN §9): the reader's last mode is remembered across
  // entries; the factory default is Paper ("light") in book view — a
  // book that opens as paper reads as a book — while a first-ever
  // scroll view keeps today's transparent default.
  const [textMode, setTextMode] = useState(() => {
    try {
      const saved = window.localStorage.getItem("tob-reader-theme-v1");
      if (saved === "transparent" || saved === "light" || saved === "dark")
        return saved;
    } catch {
      /* ignore */
    }
    return readerView === "book" ? "light" : "transparent";
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("tob-reader-theme-v1", textMode);
    } catch {
      /* ignore */
    }
  }, [textMode]);
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
    // Deferred (2026-11-10): the manifest is ~52 MB of chunks that
    // parse into a 2.5M-entry Set. Loading it the moment an entry
    // opens made the text fetch compete with that parse for CPU and
    // memory — part of why entries felt slow and fragile on phones.
    // The existence check below is optimistic while the manifest is
    // out (local files are treated as present; a truly missing file
    // 404s into the same fallback), so the manifest now lands a few
    // seconds after the text has started instead of before it.
    const t = setTimeout(() => {
      getTowerFiles().then((s) => {
        if (live) setTowerFiles(s);
      });
    }, 3000);
    return () => { live = false; clearTimeout(t); };
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
    // Check the LRU cache BEFORE the canRead gate (2026-11-10, later):
    // a completed load is proof the file exists. The files manifest
    // lands a few seconds after the text starts and can disagree —
    // the library-wide audit found 154 entries (all arXiv 2602-*)
    // whose texts serve fine but which the manifest never picked up;
    // without this ordering, the manifest's late negative verdict
    // would wipe a text that had already loaded cleanly.
    const cached = getCachedText(url);
    if (cached !== undefined) {
      setText(cached);
      setTextDone(true);
      return () => { live = false; };
    }
    if (!canRead) {
      setTextDone(true);
      return;
    }
    // Stream the text and paint progressively: the first ~12k chars
    // render as soon as they arrive (lowered from 60k on 2026-11-10 —
    // most texts are smaller than 60k, so the old threshold made the
    // reader wait for the whole file before painting anything), then
    // the text grows at doubling thresholds until the stream ends.
    // Only the COMPLETE text enters the LRU cache; partial prefixes
    // are render-only. Chunking is line-based and prefix-stable, so
    // the only thing a later publish can change is the tail line of
    // the last mounted chunk.
    // A failed DERIVED attempt (URL derived from the id) is not an
    // error state when nothing has painted yet: the full record is
    // already loading and carries the real URL, whose arrival re-runs
    // this effect. Stay on "Loading full text…" until then instead of
    // flashing "couldn't be loaded" for an address nobody promised.
    const failFetch = (e, anyPainted) => {
      if (!live || (e && e.name === "AbortError")) return;
      if (!(urlIsDerived && !anyPainted)) setTextError(true);
      setTextDone(true);
    };
    let painted = false;
    fetch(url, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        // Reader hardening (2026-11-14): a .txt answered with the SPA
        // shell (HTTP 200, text/html — the Nov 12-13 platform
        // incident) is an error, never the book. Reject on the
        // Content-Type up front, and sniff the body below in case a
        // shell ever arrives mislabeled.
        const ctype = (r.headers.get("content-type") || "").toLowerCase();
        if (ctype.includes("text/html")) throw new Error("unexpected HTML response");
        if (!r.body || typeof r.body.getReader !== "function") {
          const t = await r.text();
          const sniffFb = t.replace(/^\s+/, "").slice(0, 16).toLowerCase();
          if (sniffFb.startsWith("<!doctype") || sniffFb.startsWith("<html"))
            throw new Error("unexpected HTML response");
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
        let nextPublish = 12000;
        let sniffed = false;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            acc += decoder.decode(value, { stream: true });
            if (!sniffed && acc.length >= 64) {
              sniffed = true;
              const head = acc.replace(/^\s+/, "").slice(0, 16).toLowerCase();
              if (head.startsWith("<!doctype") || head.startsWith("<html"))
                throw new Error("unexpected HTML response");
            }
            if (live && acc.length >= nextPublish) {
              painted = true;
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
          failFetch(e, painted);
        }
      })
      .catch((e) => {
        failFetch(e, painted);
      });
    return () => { live = false; ctrl.abort(); };
    // urlIsDerived is a dep on purpose: when the full record lands
    // carrying the same URL string as a real (non-derived) URL, the
    // effect re-runs — a cache hit in the success case, and in the
    // rare missing-file case the retry surfaces the proper error
    // state instead of sitting on "Loading…" forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, canRead, urlIsDerived]);

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
    if (readerView === "book") return; // BookReader lands share links by page
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

  // Lift the complete-text stats to the entry page (FULL RECORD
  // derivable rows) — null until the text is complete, per §8.9 gating.
  useEffect(() => {
    if (onStats) onStats(stats);
  }, [stats, onStats]);

  // Book view: tell the entry page the book surface is on screen (any
  // of: first text prefix, the no-text colophon, the error colophon) so
  // the catalog pop-up can open over it (§8.2). Once per entry.
  const bookVisibleFiredRef = useRef(null);
  useEffect(() => {
    if (readerView !== "book" || !onBookVisible) return;
    if (bookVisibleFiredRef.current === artifactId) return;
    if (text !== null || !canRead || textError) {
      bookVisibleFiredRef.current = artifactId;
      onBookVisible();
    }
  }, [readerView, text, canRead, textError, artifactId, onBookVisible]);

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

  if (readerView === "book") {
    return (
      <section className="tower-fulltext section bv-mode" aria-label="Full text" data-textmode={textMode}>
        {textError && (
          <div className="bv-colophon-wrap">
            <div className="bv-colophon">
              <p>
                The full text couldn&rsquo;t be loaded right now. You can
                still open the file directly:
              </p>
              <a className="tower-source-btn" href={url} target="_blank" rel="noopener noreferrer">
                OPEN FILE <span aria-hidden="true">↗</span>
              </a>
            </div>
            <button type="button" className="bv-colophon-info" onClick={onInfo}>
              ⓘ Entry info
            </button>
          </div>
        )}
        {!textError && !canRead && (
          <div className="bv-colophon-wrap">
            <div className="bv-colophon">
              <p>
                {status === "RESTRICTED"
                  ? "This entry is restricted — its text isn't available for distribution."
                  : "The full text for this entry is still being prepared. Check back soon — it appears here automatically once it lands."}
              </p>
            </div>
            <button type="button" className="bv-colophon-info" onClick={onInfo}>
              ⓘ Entry info
            </button>
          </div>
        )}
        {!textError && canRead && text === null && (
          <div className="bv-stage-shell">
            <p className="bv-stage-status">Loading full text…</p>
          </div>
        )}
        {text !== null && (
          <>
            <BookReader
              text={text}
              textDone={textDone}
              title={artifact.title}
              shareLanding={shareLanding}
              theme={textMode}
              onCycleTheme={cycleTextMode}
              onInfo={onInfo}
              popupOpen={popupOpen}
              onExit={onExit}
              onProgress={onProgress}
              stats={stats}
              bootGone={bootGone}
            />
            {/* Print renders the full text as a continuous flow (§10.8):
                screen-hidden, print-only. */}
            <div className="bv-print-text" aria-hidden="true">
              {text}
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="tower-fulltext section" aria-label="Full text" data-textmode={textMode}>
      <div className="section-index">FULL TEXT</div>
      <div className="tower-reader-meta">
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
        <button
          type="button"
          className="tower-textmode-btn bv-view-toggle"
          onClick={onToggleView}
          aria-label="Switch to book view"
          title="Read as a book"
        >
          <span className="tower-textmode-name">BOOK VIEW</span>
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
    <main className="page-shell inner-page about-page trust-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">PRIVACY</div>
        <h1>Privacy Policy</h1>
        <p className="trust-lede">Last updated: November 20, 2026. Antarctic Labs operates antarctic-labs.com, including the Tower of Babel free library.</p>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">READING WITHOUT AN ACCOUNT</span>
        <div>
          <p className="body-copy">You do not need an account, a sign-in, or any personal information to read the Tower of Babel library. The texts in the library are public-domain and openly licensed works, hosted on this site in plain text.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">INFORMATION WE COLLECT</span>
        <div>
          <p className="body-copy">We collect as little as possible. Anonymous analytics: we use PostHog to count page views, library browsing, reading progress, and text downloads. PostHog is configured for anonymous visitors only — no user profiles are created, session recording is disabled, and automatic event capture is off. Only events we deliberately record are sent, tied to an anonymous visitor identifier, not to a name or email address.</p>
          <p className="body-copy">Information you choose to give us: if you donate, Stripe collects your email address at checkout to create a checkout session and, if enabled in Stripe, to send a receipt. If you suggest a work for the library, you provide the title, creator, source link, and any notes you choose to add. Our hosting provider may process basic technical information needed to deliver pages securely, such as IP address and browser type, in its normal server logs.</p>
          <p className="body-copy">API keys: if you request a Tower of Babel API key, we store the email address you give and a cryptographic hash of the key in a Cloudflare database, so the API can authenticate your requests and count your daily usage. Payments for API plans are processed by Stripe. The email that delivers your key is sent through Resend.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">COOKIES AND ADVERTISING</span>
        <div>
          <p className="body-copy">We use Google AdSense to show advertising on the Tower of Babel library pages. Third-party vendors, including Google, use cookies to serve ads based on a user&apos;s prior visits to this website or other websites. Google&apos;s use of advertising cookies enables it and its partners to serve ads to users based on their visit to this site and other sites on the internet.</p>
          <p className="body-copy">You may opt out of personalized advertising by visiting <a href="https://adssettings.google.com/" target="_blank" rel="noreferrer">Google Ads Settings</a> and <a href="https://optout.aboutads.info/" target="_blank" rel="noreferrer">aboutads.info</a>. Other third-party vendors and ad networks may also serve ads on the library pages, and many of them can be opted out of on the same aboutads.info page. How Google uses information from sites and apps that use its services is explained on <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noreferrer">Google&apos;s partner-sites page</a>. You can also set your browser to refuse cookies, though some site features may work less well without them. PostHog also uses cookies and local storage to keep its anonymous visitor identifier between visits.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">SERVICE PROVIDERS</span>
        <div>
          <p className="body-copy">The site runs on a small set of service providers, each processing only what its job requires. Cloudflare hosts the site and holds the API-key database. PostHog provides the anonymous analytics described above. Stripe processes donations and API-plan payments; we never receive or store your card number. Resend delivers the email that carries a new API key. Google serves the advertising described above. We do not sell personal information, and we share it with no one else except as required by law.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">HOW INFORMATION IS USED AND SHARED</span>
        <div>
          <p className="body-copy">Information is used to operate the site and the library, to understand which works readers use, to process donations, and to show advertising. It is shared only as described under Service Providers above. We do not publish or display information you provide through donation or suggestion forms.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">DATA RETENTION</span>
        <div>
          <p className="body-copy">Anonymous analytics are never tied to a name or an email address, and are kept only in aggregate. If you hold an API key, we keep your email address and the cryptographic hash of the key for as long as the key is active; ask us to delete them and the record is removed and the key revoked. Donation records are kept for as long as accounting and legal obligations require. A work suggestion is kept with the catalog work it concerns.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">SECURITY</span>
        <div>
          <p className="body-copy">The site is served over HTTPS. API keys are stored only as cryptographic hashes. No system is perfectly secure, but the information here to protect is deliberately small: no accounts and no passwords.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">YOUR CHOICES</span>
        <div>
          <p className="body-copy">You can refuse or delete cookies in your browser at any time, and opt out of personalized advertising at the links above. If we hold personal information about you — in practice, the email address attached to an API key or a donation — you may ask what it is, ask for a copy, or ask for it to be deleted, through the <a href="#" onClick={(e) => { e.preventDefault(); go("/contact"); }}>Contact page</a>. Anonymous analytics identifiers cannot be looked up or deleted per person, because they are not tied to anyone&apos;s identity.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">CHILDREN</span>
        <div>
          <p className="body-copy">The library is a general-audience collection of books and documents. The site is not directed at children under 13, and we do not knowingly collect personal information from children.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">CHANGES AND CONTACT</span>
        <div>
          <p className="body-copy">This policy may be updated as the site changes; the date at the top of this page will change with it. Questions about this policy can be sent through the <a href="#" onClick={(e) => { e.preventDefault(); go("/contact"); }}>Contact page</a>.</p>
          <p className="body-copy"><a href="#" onClick={(e) => { e.preventDefault(); go("/about"); }}>About Antarctic Labs</a> · <a href="#" onClick={(e) => { e.preventDefault(); go("/tower-of-babel"); }}>Tower of Babel</a></p>
        </div>
      </section>

      <FaqBlock index="QUESTIONS" faqs={privacyFaqs} />
    </main>
  );
}
// ----- Contact (revived 2026-11-18, INVENTORY 77/97) -------------------------
// Joshua's spec: VERY minimal and simplified, low emphasis, NOT a
// freelancing reach-out page — one address, two pointers, nothing
// else. Background: the main homepage's Aurora (NewBackgroundVideo
// rest) is mounted by the App render branch in main.jsx, the same as
// About. Copy mirrors the server-rendered /contact in
// functions/_lib/static-pages.js — keep the two in sync.
export function ContactPage({ go }) {
  return (
    <main className="page-shell inner-page about-page contact-page trust-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">CONTACT</div>
        <h1>Contact</h1>
        <p className="trust-lede">One address reaches the lab.</p>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">EMAIL</span>
        <div>
          <p className="body-copy"><a className="contact-email" href="mailto:hello@antarctic-labs.com">hello@antarctic-labs.com</a></p>
          <p className="body-copy">For a work you would like to see in the library, the <a href="#" onClick={(e) => { e.preventDefault(); go("/tower-of-babel/library/suggest"); }}>suggestion form</a> is faster. For API keys and tiers, see <a href="#" onClick={(e) => { e.preventDefault(); go("/tower-of-babel/library/research"); }}>API access</a>. Corrections to a catalog record and rights questions are covered in <a href="#" onClick={(e) => { e.preventDefault(); go("/rights-and-sources"); }}>Rights &amp; Sources</a> — email the address above with the work&apos;s title or link.</p>
        </div>
      </section>
    </main>
  );
}
// ----- Terms of Use (2026-11-18, AdSense trust layer) ------------------------
// Copy mirrors the server-rendered /terms in
// functions/_lib/static-pages.js — keep the two in sync.
export function TermsPage({ go }) {
  return (
    <main className="page-shell inner-page about-page trust-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">TERMS</div>
        <h1>Terms of Use</h1>
        <p className="trust-lede">Last updated: November 20, 2026. These terms cover antarctic-labs.com, including the Tower of Babel library, operated by Antarctic Labs.</p>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">ACCEPTANCE</span>
        <div>
          <p className="body-copy">Using this site — reading, searching, listening, downloading, holding an API key, or donating — means you accept these terms and the <a href="#" onClick={(e) => { e.preventDefault(); go("/privacy"); }}>Privacy Policy</a>. If you do not agree with them, please do not use the site.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">READING</span>
        <div>
          <p className="body-copy">The library is free to read. No account, sign-in, or personal information is needed to read, search, listen to, or download the works whose texts are hosted here — the <a href="#" onClick={(e) => { e.preventDefault(); go("/privacy"); }}>Privacy Policy</a> covers what that means in practice. We work to keep the site available and correct, but availability is not guaranteed and no uptime commitment is made on any part of the site, free or paid.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">THE TEXTS AND THEIR RIGHTS</span>
        <div>
          <p className="body-copy">The works in the library are public-domain or openly licensed texts. Rights are stated per work in each catalog record — <a href="#" onClick={(e) => { e.preventDefault(); go("/rights-and-sources"); }}>Rights &amp; Sources</a> explains how they are decided and recorded. Antarctic Labs claims no new copyright in the texts themselves. The catalog data, the site&apos;s own writing (descriptions, introductions, collection essays), and the site software are the lab&apos;s own work; ask before republishing them wholesale.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">YOUR SUBMISSIONS</span>
        <div>
          <p className="body-copy">The suggestion form exists so readers can propose works for the library. By sending a suggestion, you confirm that you have the right to share what you send, and you give Antarctic Labs permission to use it — the title, source, and any notes — in building and maintaining the catalog. Sending a suggestion does not oblige the lab to acquire the work.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">ACCEPTABLE USE</span>
        <div>
          <p className="body-copy">Use the site as a reader would. Do not disrupt the service, probe it for vulnerabilities, or misrepresent the library&apos;s contents as your own publication. Automated access is welcome through the documented surfaces — the catalog files, the API, and the OAI-PMH feed — within the limits published for each. Bulk scraping outside those surfaces, at rates that degrade the library for readers, is not.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">API KEYS</span>
        <div>
          <p className="body-copy">API v1 keys are issued per email address under the limits published on the <a href="#" onClick={(e) => { e.preventDefault(); go("/tower-of-babel/library/research"); }}>API access</a> page (free 50 requests/day, Pro 500/day, Commercial unlimited). A key is for the holder&apos;s own projects; do not share or resell it. We may revoke a key that abuses the service. Paid plans are billed through Stripe; cancel within 7 days of a charge and that charge is refunded in full — the key stays active until the end of the paid period unless you ask us to revoke it sooner.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">DONATIONS</span>
        <div>
          <p className="body-copy">Donations are voluntary contributions toward the library&apos;s servers, storage and preservation work. Antarctic Labs is not a registered charity, so contributions are not tax-deductible.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">THIRD-PARTY LINKS</span>
        <div>
          <p className="body-copy">Catalog records name and link to the sources their texts came from, and pages on this site may link to other outside sites. Those sites are not under our control, and we are not responsible for their content or their practices. The third parties that operate on this site itself are described in the <a href="#" onClick={(e) => { e.preventDefault(); go("/privacy"); }}>Privacy Policy</a>.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">ADVERTISING</span>
        <div>
          <p className="body-copy">The library pages show advertising served by Google AdSense; the donation page shows none. How advertising cookies work, and how to opt out of personalized advertising, is covered in the <a href="#" onClick={(e) => { e.preventDefault(); go("/privacy"); }}>Privacy Policy</a>.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">AS-IS</span>
        <div>
          <p className="body-copy">The site and the texts are provided as they are. Texts are verified against their sources and corrected when errors are found (see <a href="#" onClick={(e) => { e.preventDefault(); go("/rights-and-sources"); }}>Rights &amp; Sources</a>), but no warranty is made that any given text is complete or error-free. To the extent the law allows, the lab is not liable for losses arising from use of the site.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">GOVERNING LAW</span>
        <div>
          <p className="body-copy">These terms are governed by the laws of the State of Florida, in the United States, where Antarctic Labs operates.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">CHANGES AND CONTACT</span>
        <div>
          <p className="body-copy">These terms may be updated as the site changes; the date at the top will change with them. Questions: the <a href="#" onClick={(e) => { e.preventDefault(); go("/contact"); }}>Contact page</a>.</p>
        </div>
      </section>
    </main>
  );
}
// ----- Rights & Sources (2026-11-18, AdSense trust layer) --------------------
// Copy mirrors the server-rendered /rights-and-sources in
// functions/_lib/static-pages.js — keep the two in sync.
export function RightsPage({ go }) {
  return (
    <main className="page-shell inner-page about-page trust-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">RIGHTS &amp; SOURCES</div>
        <h1>Rights &amp; Sources</h1>
        <p className="trust-lede">Last updated: November 18, 2026. How the Tower of Babel library decides what it may hold, where its texts come from, and what happens when something is wrong.</p>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">WHAT THE LIBRARY HOLDS</span>
        <div>
          <p className="body-copy">Only public-domain and openly licensed works. A work whose rights cannot be established does not enter the catalog. Rights are recorded per work, not per site: every catalog record carries a rights status and a license field, shown on the work&apos;s own page, and those two fields state what a reader may do with that work. Most readable works in the library are public domain.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">WHERE THE TEXTS COME FROM</span>
        <div>
          <p className="body-copy">Texts are taken from the open sources that publish them for exactly this purpose, and each record names its source and links to it: Project Gutenberg and the open book collections for books and sacred texts; arXiv, PubMed Central, PLOS and other open journals for papers; the official publishers of United States law — the United States Code and the Federal Register — for the Law collection; the CIA&apos;s reading room, the Foreign Relations of the United States series, FBI releases and the National Security Archive for declassified documents; and the reference publishers whose dictionaries and encyclopedias have entered the public domain.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">HOW A WORK GETS IN</span>
        <div>
          <p className="body-copy">Three gates, in order. First, rights: the work is public domain or openly licensed, and the basis is recorded on its record. Second, text: a clean, complete full text must be obtainable — a catalog entry is published only once its text is hosted, never as a metadata-only placeholder. Third, verification: the text is checked against its source, and the record is built from the work itself — title, creator, year, collection, and provenance.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">CORRECTIONS</span>
        <div>
          <p className="body-copy">Errors survive any process at this scale, so corrections are a standing program, not an afterthought: the whole library has been through a reader&apos;s-eye legibility comb-through, and mislabelled, broken or wrongly attributed works are repaired or removed outright when found. To report one, use the <a href="#" onClick={(e) => { e.preventDefault(); go("/tower-of-babel/library/suggest"); }}>suggestion form</a> or the <a href="#" onClick={(e) => { e.preventDefault(); go("/contact"); }}>Contact page</a>, with the work&apos;s title or link and what is wrong; verified reports are corrected in the catalog and the record updated.</p>
        </div>
      </section>

      <section className="trust-block section reveal">
        <span className="section-index">TAKEDOWN</span>
        <div>
          <p className="body-copy">If you hold rights in a work the catalog lists as public domain or openly licensed, write through the <a href="#" onClick={(e) => { e.preventDefault(); go("/contact"); }}>Contact page</a> with the work and the basis of the claim. The work is taken down while the claim is reviewed, and removed for good if the claim holds.</p>
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
    <main className="page-shell inner-page tower-light tower-api tower-lib" id="main-content" tabIndex={-1}>
      <section className="tlib-hero">
        <div className="section-index">FOR AI AGENTS</div>
        <h1 className="tlib-title">{api.h1}</h1>
        <p className="tlib-lede">{api.intro}</p>
        <ul className="tlib-chips" aria-label="Live API status">
          {apiStatus === null ? (
            <li className="tower-chip">Live status — checking…</li>
          ) : (
            <>
              <li className="tower-chip">
                Keys — {keysConfigured ? "available" : "not yet open"}
              </li>
              <li className="tower-chip">
                Subscriptions — {subscriptionsOpen ? "open" : "not yet open"}
              </li>
              <li className="tower-chip">
                Webhook —{" "}
                {apiStatus.webhook_configured ? "configured" : "not configured"}
              </li>
            </>
          )}
        </ul>
      </section>

      {subParam === "thanks" && (
        <div className="tlib-panel">
          <p className="body-copy" role="status">
            Subscription received — thank you. Your API key is on its way to
            the email address you used at checkout; it is shown only in that
            email, so keep it somewhere safe.
          </p>
        </div>
      )}
      {subParam === "canceled" && (
        <div className="tlib-panel">
          <p className="body-copy" role="status">
            Checkout was canceled — nothing was charged. You can subscribe
            whenever you are ready.
          </p>
        </div>
      )}

      <section className="tlib-panel">
        <div className="tlib-panel-head">
          <span className="section-index">THE SHAPE OF IT</span>
        </div>
        <p className="body-copy">{api.definition}</p>
      </section>

      {api.sections.map((s) => (
        <section className="tlib-panel" key={s.title}>
          <div className="tlib-panel-head">
            <span className="section-index">{s.title.toUpperCase()}</span>
          </div>
          <p className="body-copy">{s.body}</p>
          {s.title === "How an agent uses it" && (
            <pre className="code-block">
              <code>{API_FETCH_EXAMPLE}</code>
            </pre>
          )}
        </section>
      ))}

      <section className="tlib-panel">
        <div className="tlib-panel-head">
          <span className="section-index">API PLANS</span>
          {subscriptionsOpen && (
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
          )}
        </div>
        <div className="tlib-tiers">
          {api.tiers.map((t) => {
            const paid = !!t.priceMonthly;
            const price =
              t.price || (billing === "annual" ? t.priceAnnual : t.priceMonthly);
            const selectable =
              (paid && subscriptionsOpen) || t.id === "free";
            const isOn = selectable && planSel === t.id;
            const inner = (
              <>
                <span className="tlib-tier-top">
                  <span className="tlib-tier-name">{t.name}</span>
                  {isOn && <span className="tlib-tier-tag">Selected</span>}
                </span>
                <span className="tlib-tier-price">{price}</span>
                <span className="tlib-tier-limit">{t.limit}</span>
                <span className="tlib-tier-blurb">{t.blurb}</span>
              </>
            );
            return selectable ? (
              <button
                type="button"
                key={t.id}
                className={`tlib-tier tlib-tier-btn${isOn ? " is-on" : ""}`}
                aria-pressed={isOn}
                onClick={() => setPlanSel(t.id)}
              >
                {inner}
              </button>
            ) : (
              <div className="tlib-tier" key={t.id}>
                {inner}
              </div>
            );
          })}
        </div>
        {planSel === "free" ? (
          <div className="tlib-keyform">
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
        ) : subscriptionsOpen ? (
          <>
            <div className="tlib-actions">
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
          <p className="body-copy">{api.subscribePending}</p>
        )}
        <div className="tlib-actions">
          {PORTAL_URL ? (
            <a className="api-quiet" href={PORTAL_URL}>
              MANAGE BILLING <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <p className="body-copy">{api.billingNote}</p>
          )}
        </div>
        <p className="tlib-note">{api.refundNote}</p>
      </section>

      <div className="tlib-panel tlib-faq-panel">
        <FaqBlock index="QUESTIONS" faqs={api.faqs} />
      </div>

      <div className="tlib-actions">
        <button
          type="button"
          className="api-quiet"
          onClick={() => go("/tower-of-babel/library")}
        >
          ENTER THE LIBRARY <span aria-hidden="true">↗</span>
        </button>
      </div>
      <p className="tlib-note">Updated {api.updated}.</p>
    </main>
  );
}
