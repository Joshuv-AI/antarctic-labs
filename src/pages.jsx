// Destination page shells for the unified Antarctic Labs routes.
// Each shell renders copy from the corresponding src/content/*.js
// module and reuses the existing CSS grammar (.page-shell,
// .inner-hero, .section, .section-index, .copy-block, .display-copy,
// .body-copy, .text-link, .cap-row, .contact-cta, .contact-button).
//
// Visual language is intentionally not redesigned here — these shells
// use the same classes the existing Home page already uses, so the
// destinations already share the home-page visual grammar.
import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { searchDeep, getSnippets } from "./lib/deep-search.js";
import { site } from "./content/site.js";
import { systems } from "./content/systems.js";
import { expeditions, expeditionsArchive } from "./content/expeditions.js";
import { history } from "./content/history.js";
import { operator } from "./content/operator.js";
import { artifacts, towerOfBabel } from "./content/tower-of-babel.js";
import { government } from "./content/government.js";
import { fieldInterests } from "./content/field-interests.js";
import { transmission } from "./content/transmission.js";
import { matchRoute } from "./content/routes.js";
// ----- Systems -------------------------------------------------------------
export function Systems({ go }) {
  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">02 / SYSTEMS</div>
        <h1>SYSTEMS</h1>
        <p className="body-copy">{systems.intro}</p>
      </section>
      <section className="capabilities section reveal">
        <div className="section-index">CATALOG</div>
        <div className="capability-list">
          {systems.groups.map((g, i) => (
            <div className="cap-row" key={g.id}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <h3>{g.title}</h3>
              <p>{g.summary}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="copy-block section">
        <button className="text-link" onClick={() => go("/projects")}>SEE PROJECTS <span>↗</span></button>
      </section>
    </main>
  );
}
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
  const references = (expedition.references || []).filter(Boolean);
  const related = (expedition.relatedExpeditions || [])
    .map((id) => expeditions.find((e) => e.id === id))
    .filter(Boolean);
  const links = (expedition.links || []).filter((l) => l && l.href);
  const hasPaper = paperSections.length > 0 || references.length > 0;
  const hasRecord =
    caseFile.length > 0 ||
    hasPaper ||
    (expedition.process && expedition.process.length > 0) ||
    (expedition.technologies && expedition.technologies.length > 0) ||
    (expedition.evidence && expedition.evidence.length > 0) ||
    related.length > 0 ||
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
          {expedition.evidence && expedition.evidence.length > 0 && (
            <div className="paper-section" key="evidence">
              <span className="section-index">EVIDENCE</span>
              <ul className="body-copy evidence-list">
                {expedition.evidence.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {references.length > 0 && (
            <div className="paper-section" key="references">
              <span className="section-index">REFERENCES</span>
              <ol className="references-list">
                {references.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </div>
          )}
          {related.length > 0 && (
            <div className="paper-section" key="related">
              <span className="section-index">RELATED PROJECTS</span>
              <div className="related-links">
                {related.map((r) => (
                  <button key={r.id} type="button" className="text-link" onClick={() => go(`/projects/${r.id}`)}>
                    {r.title} <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
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
        <button className="text-link" onClick={() => go(`/projects/${prevRecord.id}`)}>
          <span aria-hidden="true">←</span> PREV&nbsp;&nbsp;{prevRecord.title}
        </button>
        <button className="text-link" onClick={() => go("/projects")}>ALL PROJECTS</button>
        <button className="text-link" onClick={() => go(`/projects/${nextRecord.id}`)}>
          NEXT&nbsp;&nbsp;{nextRecord.title} <span aria-hidden="true">→</span>
        </button>
      </nav>
    </main>
  );
}
// ----- History -------------------------------------------------------------
export function History({ go }) {
  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">04 / HISTORY</div>
        <h1>{history.heading}</h1>
        <p className="body-copy">{history.intro}</p>
      </section>
      <section className="capabilities section reveal">
        <div className="section-index">BUCKETS</div>
        <div className="capability-list">
          {history.buckets.map((b, i) => (
            <div className="cap-row" key={b.id}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <h3>{b.title}</h3>
              <p>{b.summary}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
// ----- Tower of Babel ------------------------------------------------------
export function TowerOfBabel({ go }) {
  return (
    <main className="page-shell inner-page tower-light" id="main-content" tabIndex={-1}>
      <section className="inner-hero section tower-landing-hero">
        <h1>{towerOfBabel.heading}</h1>
        {towerOfBabel.intro.map((p, i) => (
          <p className={i === 0 ? "display-copy" : "body-copy"} key={i}>{p}</p>
        ))}
        <div className="tower-landing-actions">
          <button className="tower-access-btn" onClick={() => go("/tower-of-babel/library")}>
            ENTER THE LIBRARY <span aria-hidden="true">↗</span>
          </button>
          <span className="tower-landing-count">
            {artifacts.length} {artifacts.length === 1 ? "entry" : "entries"} indexed
          </span>
        </div>
      </section>

      <section className="tower-landing-block section">
        <div className="section-index">ORIGIN</div>
        {towerOfBabel.origin.map((p, i) => (
          <p className="body-copy" key={i}>{p}</p>
        ))}
      </section>
      <section className="tower-landing-block section">
        <div className="section-index">WHAT IT HOLDS</div>
        {towerOfBabel.collection.map((p, i) => (
          <p className="body-copy" key={i}>{p}</p>
        ))}
      </section>
      <section className="tower-landing-block section">
        <div className="section-index">THE NAME</div>
        {towerOfBabel.name.map((p, i) => (
          <p className="body-copy" key={i}>{p}</p>
        ))}
      </section>
      <section className="tower-landing-block section">
        <div className="section-index">ACCESS</div>
        {towerOfBabel.access.map((p, i) => (
          <p className="body-copy" key={i}>{p}</p>
        ))}
      </section>
      <section className="tower-landing-block section">
        <div className="section-index">{towerOfBabel.rebuild.heading}</div>
        {towerOfBabel.rebuild.body.map((p, i) => (
          <p className="body-copy" key={i}>{p}</p>
        ))}
      </section>
    </main>
  );
}
// ----- Tower of Babel / Library -------------------------------------------------
const TOWER_SORTS = [
  { id: "title-asc", label: "Title A–Z" },
  { id: "year-desc", label: "Newest first" },
  { id: "year-asc", label: "Oldest first" },
];

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

// Precomputed once at module load: the catalog is static at runtime, so the
// per-record search haystacks and the collection counts are built a single
// time instead of on every keystroke/render.
const TOWER_HAYSTACKS = artifacts.map(towerHaystack);
const TOWER_COUNTS = artifacts.reduce((acc, a) => {
  const key = a.collection || "OTHER";
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const TOWER_COLLECTIONS = Object.keys(TOWER_COUNTS).sort();

export function TowerLibrary({ go, onReady }) {
  // Live search + collection filter + sort. Empty query/filter = show all.
  const [query, setQuery] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [sortId, setSortId] = useState("title-asc");
  // Tell the app shell the library has painted so it can dismiss the
  // Tower boot loader shown during in-app navigation here.
  useEffect(() => {
    if (!onReady) return;
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
  }, [onReady]);
  // The input stays bound to the raw query so typing never waits on work;
  // the expensive filter/sort and the deep index search run on the deferred
  // value at background priority, which removes the keystroke lag.
  const deferredQuery = useDeferredValue(query);
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
  const q = deferredQuery.trim().toLowerCase();
  const visible = useMemo(() => {
    const out = [];
    for (let i = 0; i < artifacts.length; i++) {
      const a = artifacts[i];
      if (collectionFilter && (a.collection || "OTHER") !== collectionFilter)
        continue;
      if (q && !TOWER_HAYSTACKS[i].includes(q)) continue;
      out.push(a);
    }
    out.sort((a, b) => {
      if (sortId === "year-desc") return (b.year || 0) - (a.year || 0);
      if (sortId === "year-asc") return (a.year || 0) - (b.year || 0);
      return (a.title || "").localeCompare(b.title || "");
    });
    return out;
  }, [q, collectionFilter, sortId]);
  return (
    <main className="page-shell inner-page tower-light" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">LIBRARY</div>
        <h1>{towerOfBabel.library.heading}</h1>
        <p className="display-copy">{towerOfBabel.library.intro}</p>
      </section>
      <section className="tower-index section">
        <div className="section-index">CATALOG</div>
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
              {TOWER_COLLECTIONS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`tower-chip${collectionFilter === c ? " is-active" : ""}`}
                  onClick={() => setCollectionFilter(collectionFilter === c ? "" : c)}
                  aria-pressed={collectionFilter === c}
                >
                  {c} <span>{TOWER_COUNTS[c]}</span>
                </button>
              ))}
            </div>
            <p className="tower-result-count" aria-live="polite">
              {visible.length} of {artifacts.length}{" "}
              {artifacts.length === 1 ? "entry" : "entries"}
              {q ? ` matching “${deferredQuery.trim()}”` : ""}
            </p>
            {visible.length === 0 ? (
              <p className="tower-empty-results">
                No entries match. Clear the search or choose a different collection.
              </p>
            ) : (
              <div className="tower-rows">
                {visible.map((a, i) => (
                  <button
                    key={a.artifact_id}
                    className="tower-row reveal"
                    onClick={() => go(`/tower-of-babel/library/${a.artifact_id}`)}
                  >
                    <span className="tower-row-index">
                      {String(i + 1).padStart(2, "0")}
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
                ))}
              </div>
            )}
            <DeepMentions deep={deep} go={go} />
          </>
        )}
      </section>
    </main>
  );
}

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
export function LibraryArtifact({ go, params }) {
  const index = artifacts.findIndex((a) => a.artifact_id === params.id);
  const artifact = artifacts[index];
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
    ["ACCESS", artifact.download_status && artifact.download_status.replace(/_/g, " ")],
    ["CHECKSUM", artifact.checksum],
    ["SOURCE", artifact.source],
  ].filter(([, v]) => v !== undefined && v !== null && v !== "");
  const status = artifact.download_status;
  const canAccess =
    (status === "AVAILABLE" || status === "EXTERNAL_LINK") &&
    typeof artifact.download_url === "string" &&
    artifact.download_url.length > 0;
  const accessLabel =
    status === "EXTERNAL_LINK" ? "OPEN EXTERNAL SOURCE" : "ACCESS RESOURCE";
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
          {canAccess && (
            <a
              className="tower-access-btn"
              href={artifact.download_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {accessLabel} <span aria-hidden="true">↗</span>
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
          {artifact.source_url && (
            <a
              className="text-link"
              href={artifact.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              VIEW SOURCE <span>↗</span>
            </a>
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
      {artifacts.length > 1 ? (
        <nav className="record-nav tower-entry-nav" aria-label="Browse entries">
          <button
            className="text-link tower-nav-btn"
            onClick={() => go(`/tower-of-babel/library/${prev.artifact_id}`)}
          >
            <span aria-hidden="true">←</span> {prev.title}
          </button>
          <button className="text-link" onClick={() => go("/tower-of-babel/library")}>
            ALL ENTRIES
          </button>
          <button
            className="text-link tower-nav-btn"
            onClick={() => go(`/tower-of-babel/library/${next.artifact_id}`)}
          >
            {next.title} <span aria-hidden="true">→</span>
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
// ----- Government ----------------------------------------------------------
export function Government({ go }) {
  return (
    <main className="page-shell inner-page gov-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">{government.index}</div>
        <span className="gov-status-pill">{government.statusPill}</span>
        <h1>{government.heading}</h1>
        <p className="display-copy">{government.intro}</p>
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
        <div className="section-index">{government.applicableWork.heading}</div>
        <div>
          <p className="body-copy gov-section-intro">{government.applicableWork.intro}</p>
          <div className="project-grid">
          {government.relevantWork.map((rid) => {
            const e = expeditions.find((x) => x.id === rid);
            if (!e) return null;
            return (
              <button
                key={rid}
                className="project-card"
                onClick={() => go(`/projects/${e.id}`)}
                aria-label={`${e.title} — open case study`}
              >
                <div className="project-card-top">
                  <span
                    className="project-card-status"
                    style={{ "--tone": PROJECT_STATUS_TONE[e.status] || "#9ca3af" }}
                  >
                    <i aria-hidden="true" />
                    {e.status}
                  </span>
                </div>
                <h3 className="project-card-title">{e.title}</h3>
                {e.shortDescription && (
                  <p className="project-card-summary">{e.shortDescription}</p>
                )}
                <div className="project-card-foot">
                  <div className="project-card-meta">
                    <span>{e.category}</span>
                    {projectShortDate(e.date) && <span>{projectShortDate(e.date)}</span>}
                  </div>
                </div>
                <span className="project-card-arrow" aria-hidden="true">↗</span>
              </button>
            );
          })}
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
        <div className="section-index">{government.roadmap.heading}</div>
        <div>
          <p className="body-copy gov-section-intro">{government.roadmap.intro}</p>
          <div className="gov-roadmap">
          {government.roadmap.phases.map((ph) => (
            <div className="gov-phase" key={ph.phase}>
              <div className="gov-phase-head">
                <span className="gov-phase-index">{ph.phase}</span>
                <span className="gov-phase-status">{ph.status}</span>
              </div>
              <h3>{ph.title}</h3>
              <p>{ph.description}</p>
            </div>
          ))}
        </div>
        </div>
      </section>

      <section className="copy-block section reveal">
        <div className="section-index">{government.capabilitiesStatement.heading}</div>
        <div className="gov-doc-card">
          <p className="body-copy">{government.capabilitiesStatement.body}</p>
          <p className="body-copy gov-doc-note">{government.capabilitiesStatement.note}</p>
          <a className="gov-doc-link" href={`mailto:${site.email}`}>hello@antarcticlabs.com ↗</a>
        </div>
      </section>

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

      <section className="capabilities section reveal">
        <div className="section-index">{operator.whatWeDo.title}</div>
        <div className="capability-list">
          {operator.whatWeDo.items.map((item, i) => (
            <div className="cap-row" key={item.title}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
              <i aria-hidden="true">↗</i>
            </div>
          ))}
        </div>
      </section>

      <section className="section reveal">
        <div className="section-index">{operator.principles.title}</div>
        <div className="detail-grid">
          {operator.principles.items.map((item) => (
            <div key={item.title}>
              <strong>{item.title}</strong>
              <p className="about-principle-text">{item.text}</p>
            </div>
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

      <section className="about-grid section reveal">
        <div className="about-panel">
          <div className="section-index">{operator.team.title}</div>
          <p className="display-copy">{operator.team.headline}</p>
          {operator.team.paragraphs.map((p, i) => (
            <p className="body-copy" key={i}>{p}</p>
          ))}
        </div>
        <div className="about-panel">
          <div className="section-index">OPERATOR FILE</div>
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
// ----- Field Interests -----------------------------------------------------
export function FieldInterests({ go }) {
  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">08 / FIELD INTERESTS</div>
        <h1>{fieldInterests.heading}</h1>
        {fieldInterests.intro.map((p, i) => (
          <p className={i === 0 ? "display-copy" : "body-copy"} key={i}>{p}</p>
        ))}
      </section>
      <section className="expeditions-grid section reveal">
        <div className="section-index">AREAS OF ACTIVE INTEREST</div>
        <div className="expedition-list">
          {fieldInterests.areas.map((area) => {
            const related = (area.relatedExpeditions || [])
              .map((rid) => expeditions.find((e) => e.id === rid))
              .filter(Boolean);
            return (
              <article className="expedition-card field-interest-card reveal" key={area.id}>
                <div className="expedition-card-meta">
                  <span className="expedition-card-category">{area.title}</span>
                </div>
                <h3 className="expedition-card-title">{area.title}</h3>
                <p className="expedition-card-summary">{area.summary}</p>
                {related.length > 0 && (
                  <div className="field-interest-related">
                    <span className="section-index">RELATED PROJECTS</span>
                    <ul className="body-copy">
                      {related.map((exp) => (
                        <li key={exp.id}>
                          <button
                            className="text-link"
                            onClick={() => go(`/projects/${exp.id}`)}
                          >
                            {exp.title} <span>↗</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <section className="copy-block section">
        <span className="section-index">CLOSING</span>
        <p className="body-copy">{fieldInterests.closing}</p>
      </section>
      <section className="copy-block section">
        <button className="text-link" onClick={() => go("/projects")}>
          SEE PROJECTS <span>↗</span>
        </button>
      </section>
      <section className="copy-block section">
        <button className="text-link" onClick={() => go("/about")}>
          ABOUT THE OPERATOR <span>↗</span>
        </button>
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
  };
  const onSubmit = (e) => {
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

      <section className={"section contact-grid" + (reduceMotion ? "" : " reveal")}>
        <div className="contact-form-col">
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
              <div className="transmission-actions">
                <button
                  type="submit"
                  className="contact-submit"
                  aria-label={transmission.submit.ariaLabel}
                >
                  {transmission.submit.label} <span aria-hidden="true">↗</span>
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
              <div className="transmission-actions">
                <button type="button" className="text-link" onClick={onReset}>
                  SEND ANOTHER <span aria-hidden="true">↗</span>
                </button>
              </div>
            </div>
          )}
        </div>
        <aside className="contact-direct-col" aria-label="Direct contact">
          <div className="section-index">DIRECT</div>
          <a className="contact-email" href={`mailto:${site.email}`}>
            {site.email}
          </a>
          <dl className="contact-facts">
            {transmission.direct.facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            {transmission.direct.elsewhere && transmission.direct.elsewhere.length > 0 && (
              <div>
                <dt>ELSEWHERE</dt>
                <dd>
                  {transmission.direct.elsewhere.map((l, i) => (
                    <span key={l.href}>
                      {i > 0 && " · "}
                      <a className="contact-elsewhere-link" href={l.href} target="_blank" rel="noreferrer">
                        {l.label} <span aria-hidden="true">↗</span>
                      </a>
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
          <p className="body-copy">{transmission.direct.note}</p>
        </aside>
      </section>
    </main>
  );
}
// Re-export matcher so main.jsx can dispatch dynamic routes.
export { matchRoute };