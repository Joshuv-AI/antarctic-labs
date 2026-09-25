// Destination page shells for the unified Antarctic Labs routes.
// Each shell renders copy from the corresponding src/content/*.js
// module and reuses the existing CSS grammar (.page-shell,
// .inner-hero, .section, .section-index, .copy-block, .display-copy,
// .body-copy, .text-link, .cap-row, .contact-cta, .contact-button).
//
// Visual language is intentionally not redesigned here — these shells
// use the same classes the existing Home page already uses, so the
// destinations already share the home-page visual grammar.
import { useState } from "react";
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
        <div className="section-index">03 / PROJECTS</div>
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
  const sections = [
    { label: "ORIGIN", value: expedition.problem },
    { label: "OBJECTIVE", value: expedition.objective },
    { label: "APPROACH", value: expedition.approach },
    { label: "SYSTEM", value: expedition.system },
    { label: "BUILD", value: expedition.build },
    { label: "RESULT", value: expedition.result },
  ];
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
      {sections.filter((s) => s.value).map((s) => (
        <section className="copy-block section" key={s.label}>
          <span className="section-index">{s.label}</span>
          <p className="body-copy">{s.value}</p>
        </section>
      ))}
      {expedition.process && expedition.process.length > 0 && (
        <section className="copy-block section">
          <span className="section-index">HOW IT WORKS</span>
          <ol className="process-strip">
            {expedition.process.map((step, i) => (
              <li key={step}>
                <span className="process-step-index">{String(i + 1).padStart(2, "0")}</span>
                <span className="process-step-label">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {expedition.technologies && expedition.technologies.length > 0 && (
        <section className="copy-block section">
          <span className="section-index">TECHNOLOGIES</span>
          <p className="body-copy">{expedition.technologies.join(" · ")}</p>
        </section>
      )}
      {expedition.evidence && expedition.evidence.length > 0 && (
        <section className="copy-block section">
          <span className="section-index">EVIDENCE</span>
          <ul className="body-copy evidence-list">
            {expedition.evidence.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {expedition.links && expedition.links.length > 0 && (
        <section className="copy-block section">
          <span className="section-index">LINKS</span>
          <ul className="body-copy">
            {expedition.links.map((l, i) => (
              <li key={i}>
                <a className="text-link" href={l.href}>
                  {l.label || l.href} <span>↗</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {expedition.relatedExpeditions && expedition.relatedExpeditions.length > 0 && (
        <section className="copy-block section">
          <span className="section-index">RELATED</span>
          <ul className="body-copy">
            {expedition.relatedExpeditions.map((rid) => {
              const rel = expeditions.find((e) => e.id === rid);
              return (
                <li key={rid}>
                  <button className="text-link" onClick={() => go(`/projects/${rid}`)}>
                    {rel ? rel.title : rid} <span>↗</span>
                  </button>
                </li>
              );
            })}
          </ul>
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
      <section className="inner-hero section">
        <div className="section-index">05 / TOWER OF BABEL</div>
        <h1>{towerOfBabel.heading}</h1>
        {towerOfBabel.intro.map((p, i) => (
          <p className={i === 0 ? "display-copy" : "body-copy"} key={i}>{p}</p>
        ))}
      </section>
      <section className="copy-block section reveal">
        <div className="section-index">ORIGIN</div>
        {towerOfBabel.origin.map((p, i) => (
          <p className="body-copy" key={i}>{p}</p>
        ))}
      </section>
      <section className="copy-block section reveal">
        <div className="section-index">ACCESS</div>
        {towerOfBabel.access.map((p, i) => (
          <p className="body-copy" key={i}>{p}</p>
        ))}
      </section>
      <section className="copy-block section reveal">
        <div className="section-index">{towerOfBabel.rebuild.heading}</div>
        {towerOfBabel.rebuild.body.map((p, i) => (
          <p className="body-copy" key={i}>{p}</p>
        ))}
      </section>
      <section className="copy-block section">
        <button className="text-link" onClick={() => go("/tower-of-babel/library")}>
          ENTER THE LIBRARY <span>↗</span>
        </button>
      </section>
    </main>
  );
}
export function TowerLibrary({ go }) {
  const grouped = artifacts.reduce((acc, a) => {
    const key = a.collection || "OTHER";
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});
  return (
    <main className="page-shell inner-page tower-light" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">05.A / LIBRARY</div>
        <h1>{towerOfBabel.library.heading}</h1>
        <p className="display-copy">{towerOfBabel.library.intro}</p>
      </section>
      <section className="copy-block section reveal">
        <div className="section-index">CATALOG</div>
        {artifacts.length === 0 ? (
          <>
            <h2 className="library-empty-heading">{towerOfBabel.library.empty.heading}</h2>
            <p className="body-copy">{towerOfBabel.library.empty.body}</p>
          </>
        ) : (
          <div className="library-catalog">
            {Object.entries(grouped).map(([collection, items]) => (
              <div className="library-collection" key={collection}>
                <h3 className="library-collection-heading">{collection}</h3>
                <div className="artifact-list">
                  {items.map((a) => (
                    <button
                      key={a.artifact_id}
                      className="artifact-card reveal"
                      onClick={() => go(`/tower-of-babel/library/${a.artifact_id}`)}
                    >
                      <div className="artifact-card-meta">
                        <span className="artifact-card-collection">{a.collection}</span>
                        <span className="artifact-card-rights">{a.rights_status || "—"}</span>
                      </div>
                      <h4 className="artifact-card-title">{a.title}</h4>
                      {a.creator && (
                        <p className="artifact-card-creator">
                          {a.creator}{a.year ? ` · ${a.year}` : ""}
                        </p>
                      )}
                      {a.description && (
                        <p className="artifact-card-summary">{a.description}</p>
                      )}
                      <span className="artifact-card-arrow">↗</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="copy-block section">
        <button className="text-link" onClick={() => go("/tower-of-babel")}>
          BACK TO TOWER OF BABEL <span>↗</span>
        </button>
      </section>
    </main>
  );
}
export function LibraryArtifact({ go, params }) {
  const artifact = artifacts.find((a) => a.artifact_id === params.id);
  if (!artifact) {
    return (
      <main className="page-shell inner-page tower-light" id="main-content" tabIndex={-1}>
        <section className="inner-hero section">
          <div className="section-index">ARTIFACT / {params.id}</div>
          <h1>UNKNOWN ARTIFACT</h1>
        </section>
        <section className="copy-block section">
          <p className="body-copy">No artifact record exists for this id.</p>
          <button className="text-link" onClick={() => go("/tower-of-babel/library")}>
            BACK TO LIBRARY <span>↗</span>
          </button>
        </section>
      </main>
    );
  }
  const meta = [
    artifact.collection && { label: "COLLECTION", value: artifact.collection },
    artifact.category && { label: "CATEGORY", value: artifact.category },
    artifact.subcategory && { label: "SUBCATEGORY", value: artifact.subcategory },
    artifact.creator && { label: "CREATOR", value: artifact.creator },
    artifact.year && { label: "YEAR", value: artifact.year },
    artifact.format && { label: "FORMAT", value: artifact.format },
    artifact.file_size && { label: "FILE SIZE", value: artifact.file_size },
    artifact.version && { label: "VERSION", value: artifact.version },
    artifact.checksum && { label: "CHECKSUM", value: artifact.checksum },
    artifact.license && { label: "LICENSE", value: artifact.license },
    artifact.rights_status && { label: "RIGHTS", value: artifact.rights_status },
    artifact.download_status && { label: "ACCESS STATUS", value: artifact.download_status },
  ].filter(Boolean);
  const canDownload =
    artifact.download_status === "AVAILABLE" &&
    typeof artifact.download_url === "string" &&
    artifact.download_url.length > 0;
  return (
    <main className="page-shell inner-page tower-light" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">ARTIFACT / {artifact.artifact_id}</div>
        <h1>{artifact.title}</h1>
        {artifact.creator && (
          <p className="display-copy">
            {artifact.creator}{artifact.year ? ` · ${artifact.year}` : ""}
          </p>
        )}
      </section>
      {artifact.description && (
        <section className="copy-block section reveal">
          <span className="section-index">DESCRIPTION</span>
          <p className="body-copy">{artifact.description}</p>
        </section>
      )}
      {meta.length > 0 && (
        <section className="detail-grid section">
          {meta.map((m) => (
            <div key={m.label}>
              <span className="section-index">{m.label}</span>
              <strong>{m.value}</strong>
            </div>
          ))}
        </section>
      )}
      {artifact.source && (
        <section className="copy-block section">
          <span className="section-index">SOURCE</span>
          <p className="body-copy">{artifact.source}</p>
        </section>
      )}
      {artifact.source_url && (
        <section className="copy-block section">
          <span className="section-index">SOURCE LINK</span>
          <p className="body-copy">
            <a
              className="text-link"
              href={artifact.source_url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {artifact.source_url} <span>↗</span>
            </a>
          </p>
        </section>
      )}
      {canDownload && (
        <section className="copy-block section">
          <span className="section-index">DOWNLOAD</span>
          <p className="body-copy">
            <a
              className="text-link download-link"
              href={artifact.download_url}
              rel="noopener noreferrer"
              target="_blank"
            >
              ACCESS RESOURCE <span>↗</span>
            </a>
          </p>
        </section>
      )}
      {artifact.tags && artifact.tags.length > 0 && (
        <section className="copy-block section">
          <span className="section-index">TAGS</span>
          <p className="body-copy">{artifact.tags.join(" · ")}</p>
        </section>
      )}
      <div className="page-next">
        <button className="text-link" onClick={() => go("/tower-of-babel/library")}>
          BACK TO LIBRARY <span>↗</span>
        </button>
      </div>
    </main>
  );
}
// ----- Government ----------------------------------------------------------
export function Government({ go }) {
  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
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