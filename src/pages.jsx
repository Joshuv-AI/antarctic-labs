// Destination page shells for the unified Antarctic Labs routes.
// Each shell renders copy from the corresponding src/content/*.js
// module and reuses the existing CSS grammar (.page-shell,
// .inner-hero, .section, .section-index, .copy-block, .display-copy,
// .body-copy, .text-link, .cap-row).
//
// Visual language is intentionally not redesigned here — these shells
// use the same classes the existing Home page already uses, so the
// destinations already share the home-page visual grammar.
import { useState, useEffect, useMemo, useDeferredValue, useRef, memo } from "react";
import { searchDeep, getSnippets } from "./lib/deep-search.js";
import { site } from "./content/site.js";
import { expeditions, expeditionsArchive } from "./content/expeditions.js";
import { projectsIntro } from "./content/faq.js";
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
  onIndexReady,
  isIndexLoading,
} from "./lib/catalog.js";
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
import { transmission } from "./content/transmission.js";
import { services } from "./content/services.js";
// ----- Projects archive + detail (was: Expeditions) -------------------------
const PROJECT_STATUS_TONE = {
  ACTIVE: "#4ade80",
  COMPLETE: "#4ade80",
  "IN DEVELOPMENT": "#fbbf24",
  EXPERIMENTAL: "#c084fc",
  RESEARCH: "#60a5fa",
  ARCHIVED: "#9ca3af",
};
// Dates sometimes carry a parenthetical working note; the card shows the
// compact range and the detail page keeps the full value.
function projectShortDate(date) {
  return (date || "").split("(")[0].trim();
}
// Paper-grade fields are written as template literals with blank lines
// between paragraphs. Split them into clean <p> blocks so they don't
// collapse into one wall of text. Single-paragraph values pass through.
function paperParas(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
export function Projects({ go }) {
  const [filter, setFilter] = useState("ALL");
  const categories = [];
  expeditions.forEach((e) => {
    if (!categories.includes(e.category)) categories.push(e.category);
  });
  const countFor = (c) =>
    c === "ALL"
      ? expeditions.length
      : expeditions.filter((e) => e.category === c).length;
  const visible =
    filter === "ALL"
      ? expeditions
      : expeditions.filter((e) => e.category === filter);
  const activeCount = expeditions.filter(
    (e) => e.status === "ACTIVE"
  ).length;
  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">PROJECTS</div>
        <h1>{expeditionsArchive.heading}</h1>
        <p className="display-copy">{expeditionsArchive.intro}</p>
        <p className="body-copy">{expeditionsArchive.supporting}</p>
        <p className="body-copy">{projectsIntro}</p>
        <div className="project-stats">
          <div className="project-stat">
            <b>{expeditions.length}</b>
            <span>PROJECTS</span>
          </div>
          <div className="project-stat">
            <b>{activeCount}</b>
            <span>ACTIVE</span>
          </div>
          <div className="project-stat">
            <b>{categories.length}</b>
            <span>DISCIPLINES</span>
          </div>
        </div>
      </section>
      <section className="project-index section reveal">
        <div className="section-index">INDEX</div>
        <div
          className="project-filters"
          role="tablist"
          aria-label="Filter projects by discipline"
        >
          {["ALL", ...categories].map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={filter === c}
              className={
                "project-filter" + (filter === c ? " is-active" : "")
              }
              onClick={() => setFilter(c)}
            >
              {c}
              <span>{countFor(c)}</span>
            </button>
          ))}
        </div>
        <div className="project-grid">
          {visible.map((e) => (
            <button
              key={e.id}
              type="button"
              className="project-card"
              onClick={() => go(`/projects/${e.id}`)}
              aria-label={`${e.title} — open case study`}
            >
              <div className="project-card-top">
                <span className="project-card-index">
                  {String(expeditions.indexOf(e) + 1).padStart(2, "0")}
                </span>
                <span
                  className="project-card-status"
                  style={{
                    "--tone":
                      PROJECT_STATUS_TONE[e.status] || "#9ca3af",
                  }}
                >
                  <i aria-hidden="true" />
                  {e.status}
                </span>
              </div>
              <h3 className="project-card-title">{e.title}</h3>
              {e.shortDescription && (
                <p className="project-card-summary">
                  {e.shortDescription}
                </p>
              )}
              <div className="project-card-foot">
                <div className="project-card-meta">
                  <span>{e.category}</span>
                  {projectShortDate(e.date) && (
                    <span>{projectShortDate(e.date)}</span>
                  )}
                </div>
                {e.technologies && e.technologies.length > 0 && (
                  <div className="project-card-tags">
                    {e.technologies.slice(0, 3).map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <span className="project-card-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
export function ProjectDetail({ go, params }) {
  const expedition = expeditions.find((e) => e.id === params.id);
  if (!expedition) {
    return (
      <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
        <section className="inner-hero section">
          <div className="section-index">EXPEDITION / {params.id}</div>
          <h1>UNKNOWN EXPEDITION</h1>
        </section>
        <section className="copy-block section">
          <p className="body-copy">No expedition record exists for this id.</p>
          <button className="text-link" onClick={() => go("/projects")}>ALL PROJECTS <span>↗</span></button>
        </section>
      </main>
    );
  }
  const caseFile = [
    { label: "ORIGIN", value: expedition.problem },
    { label: "OBJECTIVE", value: expedition.objective },
    { label: "APPROACH", value: expedition.approach },
    { label: "SYSTEM", value: expedition.system },
    { label: "BUILD", value: expedition.build },
    { label: "RESULT", value: expedition.result },
  ].filter((s) => s.value);
  const paperSections = [
    { label: "ABSTRACT", value: expedition.abstract },
    { label: "INTRODUCTION", value: expedition.introduction },
    { label: "BACKGROUND & RELATED WORK", value: expedition.backgroundRelatedWork },
    { label: "METHODS", value: expedition.methods },
    { label: "SYSTEM ARCHITECTURE", value: expedition.systemArchitecture },
    { label: "IMPLEMENTATION", value: expedition.implementation },
    { label: "RESULTS", value: expedition.results },
    { label: "DISCUSSION", value: expedition.discussion },
    { label: "LIMITATIONS", value: expedition.limitations },
    { label: "FUTURE WORK", value: expedition.futureWork },
  ].filter((s) => s.value);
  const links = (expedition.links || []).filter((l) => l && l.href);
  const hasPaper = paperSections.length > 0;
  const hasRecord =
    caseFile.length > 0 ||
    hasPaper ||
    (expedition.process && expedition.process.length > 0) ||
    (expedition.technologies && expedition.technologies.length > 0) ||
    links.length > 0;
  const recordIndex = expeditions.findIndex((e) => e.id === expedition.id);
  const prevRecord = expeditions[(recordIndex - 1 + expeditions.length) % expeditions.length];
  const nextRecord = expeditions[(recordIndex + 1) % expeditions.length];
  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">EXPEDITION / {expedition.id}</div>
        <h1>{expedition.title}</h1>
        {expedition.shortDescription && (
          <p className="display-copy">{expedition.shortDescription}</p>
        )}
      </section>
      <section className="detail-grid section">
        {expedition.status && (
          <div>
            <span className="section-index">STATUS</span>
            <strong>{expedition.status}</strong>
          </div>
        )}
        {expedition.category && (
          <div>
            <span className="section-index">CATEGORY</span>
            <strong>{expedition.category}</strong>
          </div>
        )}
        {expedition.date && (
          <div>
            <span className="section-index">DATE</span>
            <strong>{expedition.date}</strong>
          </div>
        )}
        {expedition.role && (
          <div>
            <span className="section-index">ROLE</span>
            <strong>{expedition.role}</strong>
          </div>
        )}
      </section>
      {hasRecord && (
        <section className="section paper-record">
          {caseFile.map((s) => (
            <div className="paper-section" key={s.label}>
              <span className="section-index">{s.label}</span>
              {paperParas(s.value).map((p, i) => (
                <p className="body-copy" key={i}>{p}</p>
              ))}
            </div>
          ))}
          {hasPaper && (
            <div className="paper-section paper-divider" key="paper-head">
              <span className="section-index">PAPER-GRADE DETAIL</span>
              <p className="body-copy paper-lead">
                The sections below present a scientific-paper-style expansion of
                this project, drawn directly from the operator&apos;s working
                notes and the verified file inventory.
              </p>
            </div>
          )}
          {paperSections.map((s) => (
            <div className="paper-section" key={s.label}>
              <span className="section-index">{s.label}</span>
              {paperParas(s.value).map((p, i) => (
                <p className="body-copy paper-prose" key={i}>{p}</p>
              ))}
            </div>
          ))}
          {expedition.process && expedition.process.length > 0 && (
            <div className="paper-section" key="process">
              <span className="section-index">HOW IT WORKS</span>
              <ol className="process-strip">
                {expedition.process.map((step, i) => (
                  <li key={step}>
                    <span className="process-step-index">{String(i + 1).padStart(2, "0")}</span>
                    <span className="process-step-label">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {expedition.technologies && expedition.technologies.length > 0 && (
            <div className="paper-section" key="technologies">
              <span className="section-index">TECHNOLOGIES</span>
              <p className="body-copy">{expedition.technologies.join(" \u00b7 ")}</p>
            </div>
          )}
          {links.length > 0 && (
            <div className="paper-section" key="links">
              <span className="section-index">LINKS</span>
              <div className="related-links">
                {links.map((l) => (
                  <a key={l.href} className="text-link" href={l.href} target="_blank" rel="noreferrer">
                    {l.label || l.href} <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      <nav className="record-nav" aria-label="Project records">
        <button type="button" className="record-nav-pill" onClick={() => go(`/projects/${prevRecord.id}`)} aria-label="Previous project">
          <span aria-hidden="true">←</span> Previous
        </button>
        <button type="button" className="record-nav-pill" onClick={() => go("/projects")} aria-label="All projects">
          All Projects
        </button>
        <button type="button" className="record-nav-pill" onClick={() => go(`/projects/${nextRecord.id}`)} aria-label="Next project">
          Next <span aria-hidden="true">→</span>
        </button>
      </nav>
    </main>
  );
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

// Case-insensitive haystack for catalog search: title, creator, year,
// description, collection, and tags.
function towerHaystack(a) {
  return [
    a.title || "",
    a.creator || "",
    a.year ? String(a.year) : "",
    a.description || "",
    a.collection || "",
    Array.isArray(a.tags) ? a.tags.join(" ") : "",
  ]
    .join("\n")
    .toLowerCase();
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

// Stable bottom-up merge sort over index positions, yielding to the browser
// between row ranges. The comparator is identical to the old
// Array.prototype.sort with localeCompare (verified byte-identical order on
// the full catalog, including tie order), so the row sequence is unchanged —
// only the scheduling differs: no single block ever exceeds ~120ms, so the
// boot animation never freezes.
async function buildTitleOrder(artifacts, isCancelled) {
  const n = artifacts.length;
  const keys = new Array(n);
  for (let i = 0; i < n; i++) keys[i] = artifacts[i].title || "";
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
          keys[idx[i]].localeCompare(keys[idx[j]]) <= 0 ? idx[i++] : idx[j++];
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

// Chunked haystack build: 20k records per macrotask, so filtering data
// never blocks the thread either. Output is identical to the old
// artifacts.map(towerHaystack).
async function buildHaystacks(artifacts, isCancelled) {
  const out = new Array(artifacts.length);
  for (let from = 0; from < artifacts.length; from += 20000) {
    if (isCancelled()) return null;
    const end = Math.min(from + 20000, artifacts.length);
    for (let i = from; i < end; i++) out[i] = towerHaystack(artifacts[i]);
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

// Full derivation for one catalog array identity. Resolves to the towerData
// object, or null if cancelled/superseded before finishing.
async function deriveTowerData(artifacts, isCancelled) {
  if (towerDataCache && towerDataFor === artifacts) return towerDataCache;
  const counts = {};
  for (let i = 0; i < artifacts.length; i++) {
    const key = artifacts[i].collection || "OTHER";
    counts[key] = (counts[key] || 0) + 1;
  }
  const titleOrder = await buildTitleOrder(artifacts, isCancelled);
  if (!titleOrder || isCancelled()) return null;
  const haystacks = await buildHaystacks(artifacts, isCancelled);
  if (!haystacks || isCancelled()) return null;
  const data = {
    haystacks,
    counts,
    collections: Object.keys(counts).sort(),
    order: {
      "title-asc": titleOrder,
      "year-desc": artifacts
        .map((_, i) => i)
        .sort((p, q) => (artifacts[q].year || 0) - (artifacts[p].year || 0)),
      "year-asc": artifacts
        .map((_, i) => i)
        .sort((p, q) => (artifacts[p].year || 0) - (artifacts[q].year || 0)),
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

function TowerLibrarySection({ go, onReady }) {
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
    deriveTowerData(artifacts, () => cancelled).then(
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
  // Live search + collection filter + sort. Empty query/filter = show all.
  const [query, setQuery] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [sortId, setSortId] = useState("title-asc");
  // Pagination: 50 rows per page, user clicks "Load more". The full catalog
  // is never mounted at once — the DOM stays small so style recalc and
  // paint stay cheap, and the loader releases after the first 50 paint.
  const [rowBudget, setRowBudget] = useState(TOWER_ROWS_PER_PAGE);
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
  }, [listQuery, collectionFilter, sortId]);
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
  const towerOrder = towerData
    ? towerData.order[sortId] || towerData.order["title-asc"]
    : [];
  // Rank of each matching artifact in the current filter/sort (1-based), as
  // a Map from artifact_id. LibraryResults mounts only the matching rows,
  // so a filter/sort update reconciles dozens of rows instead of the whole
  // catalog — the hidden-flag approach this replaced kept input fast but
  // made every update walk everything. The memoized TowerRow re-renders
  // only when its own rank actually changes.
  const { rankMap, matchCount } = useMemo(() => {
    const map = new Map();
    if (!artifacts || !towerData) return { rankMap: map, matchCount: 0 };
    for (let k = 0; k < towerOrder.length; k++) {
      const i = towerOrder[k];
      const a = artifacts[i];
      if (collectionFilter && (a.collection || "OTHER") !== collectionFilter)
        continue;
      if (q && !towerData.haystacks[i].includes(q)) continue;
      map.set(a.artifact_id, map.size + 1);
    }
    return { rankMap: map, matchCount: map.size };
  }, [q, collectionFilter, sortId, towerOrder, artifacts, towerData]);
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
            <div className="tower-controls">
              <input
                type="search"
                className="tower-search"
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
            </div>
            <div className="tower-chips" role="group" aria-label="Filter by collection">
              <button
                type="button"
                className={`tower-chip${collectionFilter === "" ? " is-active" : ""}`}
                onClick={() => setCollectionFilter("")}
              >
                All <span>{artifacts.length}</span>
              </button>
              {towerData.collections.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`tower-chip${collectionFilter === c ? " is-active" : ""}`}
                  onClick={() => setCollectionFilter(collectionFilter === c ? "" : c)}
                  aria-pressed={collectionFilter === c}
                >
                  {c} <span>{towerData.counts[c]}</span>
                </button>
              ))}
            </div>
            <LibraryResults
              artifacts={artifacts}
              towerOrder={towerOrder}
              rankMap={rankMap}
              matchCount={matchCount}
              rowBudget={rowBudget}
              onLoadMore={() => setRowBudget((b) => b + TOWER_ROWS_PER_PAGE)}
              deep={deep}
              q={q}
              go={go}
              matchesExpanded={matchesExpanded}
              onToggleMatches={() => setMatchesExpanded((v) => !v)}
            />
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
  matchCount,
  rowBudget,
  onLoadMore,
  deep,
  q,
  go,
  matchesExpanded,
  onToggleMatches,
}) {
  // Render only the matching rows instead of keeping all 3,448 mounted and
  // flipping `hidden`: a filter update then reconciles dozens of rows
  // instead of thousands, and the DOM stays small so style recalc and
  // paint stay cheap. (The previous hidden-flip approach kept input fast
  // but made every filter/sort update walk all 3,448 rows.)
  const visibleIndices = useMemo(() => {
    const out = [];
    // Walk the full sort order, collecting the first `rowBudget` MATCHING
    // items — not just the first `rowBudget` in sort order (which breaks
    // pagination when a collection filter is active).
    for (let k = 0; k < towerOrder.length && out.length < rowBudget; k++) {
      const i = towerOrder[k];
      if (rankMap.has(artifacts[i].artifact_id)) out.push(i);
    }
    return out;
  }, [artifacts, towerOrder, rankMap, rowBudget]);
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
      <span className="tower-row-main">
        <span className="tower-row-title">{a.title}</span>
        {(a.creator || a.year) && (
          <span className="tower-row-creator">
            {a.creator}
            {a.creator && a.year ? " · " : ""}
            {a.year || ""}
          </span>
        )}
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
  // Full record loads on demand (the index has list fields only).
  const [fullArtifact, setFullArtifact] = useState(null);
  useEffect(() => {
    let live = true;
    setFullArtifact(null);
    getFullArtifact(params.id).then(
      (a) => { if (live) setFullArtifact(a); },
      () => { if (live) setFullArtifact(null); }
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
        {artifact.description && (
          <p className="tower-entry-lede">{artifact.description}</p>
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
  const [shownChunks, setShownChunks] = useState(1);
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
    setText(null);
    setTextError(false);
    setShownChunks(1);
    chunkElsRef.current = [];
    setActiveMark(null);
    if (!canRead) return;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((t) => { if (live) setText(t); })
      .catch(() => { if (live) setTextError(true); });
    return () => { live = false; };
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
  // Long texts (the largest is ~9MB) render in chunks; more load as the
  // reader scrolls, so the first paint stays fast on phones.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || shownChunks >= chunks.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShownChunks((n) => Math.min(n + 2, chunks.length));
        }
      },
      { rootMargin: "1200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shownChunks, chunks.length]);

  const stats = useMemo(() => {
    if (!text) return null;
    const words = countWords(text);
    return {
      words,
      minutes: Math.max(1, Math.round(words / 200)),
    };
  }, [text]);

  return (
    <section className="tower-fulltext section" aria-label="Full text">
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
      </div>
      {text === null && !textError && canRead && (
        <p className="tower-reader-status">Preparing the full text…</p>
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
        <div className="tower-reader-text" role="document" aria-label={`Full text of ${artifact.title}`}>
          {chunks.slice(0, shownChunks).map((c, i) => (
            <p
              key={i}
              ref={(el) => { chunkElsRef.current[i] = el; }}
              className="tower-reader-chunk"
            >
              {activeMark && activeMark.chunkIndex === i && !SUPPORTS_HIGHLIGHTS ? (
                <>
                  {c.slice(0, activeMark.start)}
                  <mark className="ra-mark">
                    {c.slice(activeMark.start, activeMark.end)}
                  </mark>
                  {c.slice(activeMark.end)}
                </>
              ) : (
                c
              )}
            </p>
          ))}
          {shownChunks < chunks.length && (
            <div className="tower-reader-more">
              <div ref={sentinelRef} className="tower-reader-sentinel" aria-hidden="true" />
              <button
                type="button"
                className="tower-source-btn"
                onClick={() => setShownChunks(chunks.length)}
              >
                LOAD FULL TEXT
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
          shownChunks={shownChunks}
          ensureChunk={(i) => setShownChunks((n) => Math.max(n, i + 1))}
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

      <section className="about-grid about-grid-single section reveal">
        <div className="about-panel">
          <div className="section-index">{operator.team.title}</div>
          <p className="display-copy">{operator.team.headline}</p>
          {operator.team.paragraphs.map((p, i) => (
            <p className="body-copy" key={i}>{p}</p>
          ))}
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
// ----- Transmission --------------------------------------------------------
export function Transmission({ go }) {
  const initialValues = transmission.fields.reduce((acc, f) => {
    acc[f.name] = "";
    return acc;
  }, {});
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // Honeypot: invisible to humans, bots fill it. The API drops those silently.
  const [honeypot, setHoneypot] = useState("");
  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const validate = (next) => {
    const errs = {};
    transmission.fields.forEach((f) => {
      const v = (next[f.name] || "").trim();
      if (f.required && v.length === 0) {
        errs[f.name] = "Required.";
      } else if (f.type === "email" && v.length > 0) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
          errs[f.name] = "Enter a valid email address.";
        }
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
    const errs = validate(values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const firstInvalid = transmission.fields.find((f) => errs[f.name]);
      if (firstInvalid && typeof document !== "undefined") {
        const el = document.getElementById(firstInvalid.id);
        if (el && typeof el.focus === "function") {
          el.focus();
        }
      }
      return;
    }
    setSending(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, website: honeypot }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "send failed");
    } catch (err) {
      setSending(false);
      setSubmitError(
        "Something went wrong sending your message. Please try again, or email hello@antarctic-labs.com directly."
      );
      return;
    }
    setSending(false);
    setSubmitted(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        const region = document.getElementById("transmission-success");
        if (region && typeof region.focus === "function") {
          region.focus();
        }
      }, 50);
    }
  };
  const onReset = () => {
    setValues(initialValues);
    setErrors({});
    setSubmitted(false);
    setSending(false);
    setSubmitError("");
    setHoneypot("");
  };
  return (
    <main className="page-shell inner-page contact-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">{transmission.sectionIndex}</div>
        <h1>
          {transmission.heading.split("\n").map((line, i) => (
            <span key={i}>
              {line}
              <br />
            </span>
          ))}
        </h1>
        <p className="display-copy contact-lede">{transmission.body}</p>
      </section>

      <section className={"section contact-form-wrap" + (reduceMotion ? "" : " reveal")}>
          <div className="section-index">SEND A MESSAGE</div>
          {!submitted ? (
            <form
              className="transmission-form"
              onSubmit={onSubmit}
              noValidate={false}
              aria-label="Contact form"
            >
              {transmission.fields.map((f) => {
                const fieldError = errors[f.name];
                const errorId = `${f.id}-error`;
                return (
                  <div className="transmission-field" key={f.id}>
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
                        <option value="" disabled>Select a subject</option>
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
                        rows={f.rows || 6}
                        value={values[f.name]}
                        onChange={onChange(f.name)}
                        autoComplete={f.autoComplete}
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
                      <p id={errorId} className="transmission-error" role="alert">
                        {fieldError}
                      </p>
                    )}
                  </div>
                );
              })}
              {/* Honeypot: positioned off-screen, never visible to humans. */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "auto", width: "1px", height: "1px", overflow: "hidden" }}>
                <label htmlFor="transmission-website">Website</label>
                <input
                  id="transmission-website"
                  name="website"
                  type="text"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>
              {submitError && (
                <p className="transmission-error" role="alert">
                  {submitError}
                </p>
              )}
              <div className="transmission-actions">
                <button
                  type="submit"
                  className="contact-submit"
                  aria-label={transmission.submit.ariaLabel}
                  disabled={sending}
                >
                  {sending ? "SENDING…" : transmission.submit.label}{" "}
                  <span aria-hidden="true">↗</span>
                </button>
                <button
                  type="button"
                  className="text-link transmission-reset"
                  onClick={onReset}
                >
                  CLEAR <span aria-hidden="true">×</span>
                </button>
              </div>
              <p className="transmission-notice" role="note">
                {transmission.noBackendNotice}
              </p>
            </form>
          ) : (
            <div
              id="transmission-success"
              className="transmission-success"
              role="status"
              aria-live="polite"
              tabIndex={-1}
            >
              <span className="section-index">{transmission.success.heading}</span>
              <p className="body-copy">{transmission.success.body}</p>
              <p className="body-copy">{transmission.success.note}</p>
              {transmission.booking.url && (
                <p className="contact-alt-path">
                  {transmission.success.bookingPrompt}{" "}
                  <a href={transmission.booking.url} target="_blank" rel="noreferrer">
                    {transmission.booking.label} <span aria-hidden="true">↗</span>
                  </a>
                </p>
              )}
              <div className="transmission-actions">
                <button type="button" className="text-link" onClick={onReset}>
                  SEND ANOTHER <span aria-hidden="true">↗</span>
                </button>
              </div>
            </div>
          )}
      </section>
      <section className="contact-next" aria-label="What happens next">
          <div className="section-index">{transmission.next.sectionIndex}</div>
          <ol className="contact-next-steps">
            {transmission.next.steps.map((s) => (
              <li key={s.num}>
                <span className="step-num">{s.num}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
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
          <button type="button" className="text-link" onClick={() => go("/contact")}>
            GET A FREE QUOTE <span aria-hidden="true">↗</span>
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
        <button type="button" className="text-link" onClick={() => go("/contact")}>
          GET A FREE QUOTE <span aria-hidden="true">↗</span>
        </button>
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
