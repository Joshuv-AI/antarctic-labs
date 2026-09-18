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
import { theLab } from "./content/the-lab.js";
import { systems } from "./content/systems.js";
import { expeditions, expeditionsArchive } from "./content/expeditions.js";
import { history } from "./content/history.js";
import { operator } from "./content/operator.js";
import { artifacts, towerOfBabel } from "./content/tower-of-babel.js";
import { government } from "./content/government.js";
import { fieldInterests } from "./content/field-interests.js";
import { transmission } from "./content/transmission.js";
import { matchRoute } from "./content/routes.js";

// ----- The Lab -------------------------------------------------------------

export function TheLab({ go }) {
  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">01 / THE LAB</div>
        <h1>{theLab.heading}</h1>
      </section>

      <section className="copy-block section reveal">
        {theLab.body.map((p, i) => (
          <p className={i === 0 ? "display-copy" : "body-copy"} key={i}>{p}</p>
        ))}
      </section>

      <section className="copy-block section reveal">
        <div className="section-index">{theLab.whyAntarctic.heading}</div>
        {theLab.whyAntarctic.body.map((p, i) => (
          <p className="body-copy" key={i}>{p}</p>
        ))}
      </section>

      <section className="capabilities section reveal">
        <div className="section-index">METHOD</div>
        <div className="capability-list">
          {theLab.method.steps.map(([n, title, desc]) => (
            <div className="cap-row" key={n}>
              <span>{n}</span>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="copy-block section">
        <button className="text-link" onClick={() => go("/systems")}>SEE THE SYSTEMS <span>↗</span></button>
      </section>
    </main>
  );
}

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

export function Projects({ go }) {
  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">03 / PROJECTS</div>
        <h1>{expeditionsArchive.heading}</h1>
        <p className="display-copy">{expeditionsArchive.intro}</p>
        <p className="body-copy">{expeditionsArchive.supporting}</p>
      </section>

      <section className="expeditions-grid section reveal">
        <div className="section-index">CATALOG</div>
        {expeditions.length === 0 ? (
          <p className="body-copy">The expedition catalog is being finalized. Records will appear here once the lead engineer provides them.</p>
        ) : (
          <div className="expedition-list">
            {expeditions.map((e) => (
              <button
                key={e.id}
                className="expedition-card reveal"
                onClick={() => go(`/projects/${e.id}`)}
              >
                <div className="expedition-card-meta">
                  <span className="expedition-card-status">{e.status}</span>
                  <span className="expedition-card-category">{e.category}</span>
                </div>
                <h3 className="expedition-card-title">{e.title}</h3>
                {e.shortDescription && (
                  <p className="expedition-card-summary">{e.shortDescription}</p>
                )}
                <span className="expedition-card-arrow">↗</span>
              </button>
            ))}
          </div>
        )}
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

  // Render only sections that have content. Avoids awkward blank blocks.
  const sections = [
    { label: "ORIGIN",     value: expedition.problem },
    { label: "OBJECTIVE",  value: expedition.objective },
    { label: "APPROACH",   value: expedition.approach },
    { label: "SYSTEM",     value: expedition.system },
    { label: "BUILD",      value: expedition.build },
    { label: "RESULT",     value: expedition.result },
  ];

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
        {expedition.status && (<div><span className="section-index">STATUS</span><strong>{expedition.status}</strong></div>)}
        {expedition.category && (<div><span className="section-index">CATEGORY</span><strong>{expedition.category}</strong></div>)}
        {expedition.date && (<div><span className="section-index">DATE</span><strong>{expedition.date}</strong></div>)}
        {expedition.role && (<div><span className="section-index">ROLE</span><strong>{expedition.role}</strong></div>)}
      </section>

      {sections.filter((s) => s.value).map((s) => (
        <section className="copy-block section" key={s.label}>
          <span className="section-index">{s.label}</span>
          <p className="body-copy">{s.value}</p>
        </section>
      ))}

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
              <li key={i}><a className="text-link" href={l.href}>{l.label || l.href} <span>↗</span></a></li>
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
                  <button className="text-link" onClick={() => go(`/projects/${rid}`)}>{rel ? rel.title : rid} <span>↗</span></button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="page-next">
        <button className="text-link" onClick={() => go("/projects")}>ALL PROJECTS <span>↗</span></button>
      </div>
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
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
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
        <button className="text-link" onClick={() => go("/tower-of-babel/library")}>ENTER THE LIBRARY <span>↗</span></button>
      </section>
    </main>
  );
}

export function TowerLibrary({ go }) {
  // Group artifacts by collection for a structured catalog view.
  const grouped = artifacts.reduce((acc, a) => {
    const key = a.collection || "OTHER";
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
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
                        <p className="artifact-card-creator">{a.creator}{a.year ? ` · ${a.year}` : ""}</p>
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
        <button className="text-link" onClick={() => go("/tower-of-babel")}>BACK TO TOWER OF BABEL <span>↗</span></button>
      </section>
    </main>
  );
}

export function LibraryArtifact({ go, params }) {
  const artifact = artifacts.find((a) => a.artifact_id === params.id);

  if (!artifact) {
    return (
      <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
        <section className="inner-hero section">
          <div className="section-index">ARTIFACT / {params.id}</div>
          <h1>UNKNOWN ARTIFACT</h1>
        </section>
        <section className="copy-block section">
          <p className="body-copy">No artifact record exists for this id.</p>
          <button className="text-link" onClick={() => go("/tower-of-babel/library")}>BACK TO LIBRARY <span>↗</span></button>
        </section>
      </main>
    );
  }

  // Render only artifact fields that have values. Avoids awkward blanks.
  const meta = [
    artifact.collection      && { label: "COLLECTION",     value: artifact.collection },
    artifact.category        && { label: "CATEGORY",       value: artifact.category },
    artifact.subcategory     && { label: "SUBCATEGORY",    value: artifact.subcategory },
    artifact.creator         && { label: "CREATOR",        value: artifact.creator },
    artifact.year            && { label: "YEAR",           value: artifact.year },
    artifact.format          && { label: "FORMAT",         value: artifact.format },
    artifact.file_size       && { label: "FILE SIZE",      value: artifact.file_size },
    artifact.version         && { label: "VERSION",        value: artifact.version },
    artifact.checksum        && { label: "CHECKSUM",       value: artifact.checksum },
    artifact.license         && { label: "LICENSE",        value: artifact.license },
    artifact.rights_status   && { label: "RIGHTS",         value: artifact.rights_status },
    artifact.download_status && { label: "ACCESS STATUS",  value: artifact.download_status },
  ].filter(Boolean);

  const canDownload =
    artifact.download_status === "AVAILABLE" &&
    typeof artifact.download_url === "string" &&
    artifact.download_url.length > 0;

  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">ARTIFACT / {artifact.artifact_id}</div>
        <h1>{artifact.title}</h1>
        {artifact.creator && (
          <p className="display-copy">{artifact.creator}{artifact.year ? ` · ${artifact.year}` : ""}</p>
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
            <div key={m.label}><span className="section-index">{m.label}</span><strong>{m.value}</strong></div>
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
            <a className="text-link" href={artifact.source_url} rel="noopener noreferrer" target="_blank">
              {artifact.source_url} <span>↗</span>
            </a>
          </p>
        </section>
      )}

      {/* Download button is gated on real download_status + download_url. */}
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
        <button className="text-link" onClick={() => go("/tower-of-babel/library")}>BACK TO LIBRARY <span>↗</span></button>
      </div>
    </main>
  );
}

// ----- Government ----------------------------------------------------------

export function Government({ go }) {
  // Render only procurement fields that have values — no awkward blanks.
  const procurementEntries = Object.entries(government.procurement.fields || {})
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0);

  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">06 / GOVERNMENT</div>
        <h1>{government.heading}</h1>
        <p className="display-copy">{government.intro}</p>
      </section>

      <section className="capabilities section reveal">
        <div className="section-index">CAPABILITIES</div>
        <div className="capability-list">
          {government.capabilities.map((c, i) => (
            <div className="cap-row" key={c}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <h3>{c}</h3>
              <p>{government.supporting}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="copy-block section reveal">
        <div className="section-index">RELEVANT WORK</div>
        <p className="body-copy">
          Selected Antarctic Labs Projects whose technical capabilities map to public-sector applicability. No Project is labeled as government work — only linked as applicable.
        </p>
        {government.relevantWork && government.relevantWork.length > 0 ? (
          <div className="expedition-list">
            {government.relevantWork.map((rid) => {
              const exp = expeditions.find((e) => e.id === rid);
              if (!exp) return null;
              return (
                <button
                  key={rid}
                  className="expedition-card reveal"
                  onClick={() => go(`/projects/${rid}`)}
                >
                  <div className="expedition-card-meta">
                    <span className="expedition-card-status">{exp.status}</span>
                    <span className="expedition-card-category">{exp.category}</span>
                  </div>
                  <h3 className="expedition-card-title">{exp.title}</h3>
                  {exp.shortDescription && (
                    <p className="expedition-card-summary">{exp.shortDescription}</p>
                  )}
                  <span className="expedition-card-arrow">↗</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="body-copy">Relevant-work links will appear here as applicable Project records are finalized.</p>
        )}
      </section>

      <section className="copy-block section reveal">
        <div className="section-index">{government.capabilitiesStatement.heading}</div>
        <p className="body-copy">{government.capabilitiesStatement.body}</p>
        <p className="body-copy">
          <span className="capabilities-statement-pill">FUTURE — NOT YET PUBLISHED</span>
          <span className="body-copy"> {government.capabilitiesStatement.note}</span>
        </p>
        {/* No fake download link. No fake PDF. */}
      </section>

      <section className="copy-block section reveal">
        <div className="section-index">{government.procurement.heading}</div>
        <p className="body-copy">{government.procurement.body}</p>
        {procurementEntries.length > 0 ? (
          <dl className="procurement-list">
            {procurementEntries.map(([key, value]) => (
              <div key={key} className="procurement-row">
                <dt className="procurement-key">{key}</dt>
                <dd className="procurement-value">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="body-copy">{government.procurement.note}</p>
        )}
      </section>

      <section className="copy-block section">
        <p className="body-copy">
          Antarctic Labs does not currently claim government contracts, certifications, registrations, procurement status, contract vehicles, security clearances, set-aside status, government revenue, agency relationships, or past performance. This destination is in active development.
        </p>
      </section>

      <section className="copy-block section">
        <button className="text-link" onClick={() => go("/transmission")}>MAKE CONTACT <span>↗</span></button>
      </section>
    </main>
  );
}

// ----- About (was: The Operator) -------------------------------------------

export function About({ go }) {
  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">07 / THE OPERATOR</div>
        <h1>{operator.heading}</h1>
      </section>

      <section className="copy-block section reveal">
        <span className="section-index">OPENING</span>
        <p className="display-copy">{operator.opening}</p>
      </section>

      <section className="copy-block section reveal">
        <span className="section-index">BACKGROUND</span>
        <p className="body-copy">{operator.background}</p>
      </section>

      <section className="copy-block section reveal">
        <span className="section-index">TECHNICAL SHIFT</span>
        <p className="body-copy">{operator.technicalShift}</p>
      </section>

      <section className="copy-block section reveal">
        <span className="section-index">CURRENT</span>
        <p className="body-copy">{operator.current}</p>
      </section>

      <section className="copy-block section reveal">
        <div className="section-index">{operator.pattern.title}</div>
        {operator.pattern.lines.map((line, i) => (
          <p className="body-copy" key={i}>{line}</p>
        ))}
      </section>

      <section className="copy-block section reveal">
        <div className="section-index">{operator.approach.title}</div>
        <p className="body-copy">{operator.approach.summary}</p>
      </section>

      <section className="capabilities section reveal">
        <div className="section-index">FIELD INTERESTS</div>
        <div className="capability-list">
          {operator.fieldInterests.map((interest, i) => (
            <div className="cap-row" key={interest}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <h3>{interest}</h3>
            </div>
          ))}
        </div>
      </section>

      <section className="copy-block section">
        <p className="body-copy">{operator.closing}</p>
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
        <button className="text-link" onClick={() => go("/projects")}>SEE PROJECTS <span>↗</span></button>
      </section>

      <section className="copy-block section">
        <button className="text-link" onClick={() => go("/about")}>ABOUT THE OPERATOR <span>↗</span></button>
      </section>
    </main>
  );
}

// ----- Transmission --------------------------------------------------------

export function Transmission({ go }) {
  // Controlled form state.
  const initialValues = transmission.fields.reduce((acc, f) => {
    acc[f.name] = "";
    return acc;
  }, {});
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  // Respect reduced motion: skip GSAP-driven reveal if the user has
  // requested reduced motion.
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
        // Basic email shape check.
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
    // Clear field-level error as the user edits.
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
      // Focus the first invalid field for accessibility.
      const firstInvalid = transmission.fields.find((f) => errs[f.name]);
      if (firstInvalid && typeof document !== "undefined") {
        const el = document.getElementById(firstInvalid.id);
        if (el && typeof el.focus === "function") el.focus();
      }
      return;
    }
    // No backend. Confirmation is local to this browser. We never
    // claim a server received the message.
    setSubmitted(true);
    if (typeof window !== "undefined") {
      // Move focus to the success region for screen readers.
      window.setTimeout(() => {
        const region = document.getElementById("transmission-success");
        if (region && typeof region.focus === "function") region.focus();
      }, 50);
    }
  };

  const onReset = () => {
    setValues(initialValues);
    setErrors({});
    setSubmitted(false);
  };

  return (
    <main className="page-shell inner-page" id="main-content" tabIndex={-1}>
      <section className="inner-hero section">
        <div className="section-index">{transmission.sectionIndex}</div>
        <h1>
          {transmission.heading.split("\n").map((line, i) => (
            <span key={i}>{line}<br/></span>
          ))}
        </h1>
      </section>

      <section className={"copy-block section" + (reduceMotion ? "" : " reveal")}>
        <p className="display-copy">{transmission.body}</p>
      </section>

      {!submitted && (
        <section className={"copy-block section" + (reduceMotion ? "" : " reveal")}>
          <form
            className="transmission-form"
            onSubmit={onSubmit}
            noValidate={false}
            aria-label="Transmission form"
          >
            {transmission.fields.map((f) => {
              const fieldError = errors[f.name];
              const errorId = `${f.id}-error`;
              const labelText = f.required ? `${f.label} *` : f.label;
              return (
                <div className="transmission-field" key={f.id}>
                  <label htmlFor={f.id}>
                    {labelText}
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
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
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
              <button type="submit" className="text-link" aria-label={transmission.submit.ariaLabel}>
                {transmission.submit.label} <span>↗</span>
              </button>
              <button type="button" className="text-link transmission-reset" onClick={onReset}>
                CLEAR <span>×</span>
              </button>
            </div>

            <p className="body-copy transmission-notice" role="note">
              {transmission.noBackendNotice}
            </p>
          </form>
        </section>
      )}

      {submitted && (
        <section
          id="transmission-success"
          className={"copy-block section transmission-success" + (reduceMotion ? "" : " reveal")}
          role="status"
          aria-live="polite"
          tabIndex={-1}
        >
          <span className="section-index">{transmission.success.heading}</span>
          <p className="body-copy">{transmission.success.body}</p>
          <p className="body-copy">{transmission.success.note}</p>
          <div className="transmission-actions">
            <button type="button" className="text-link" onClick={onReset}>
              SEND ANOTHER <span>↗</span>
            </button>
          </div>
        </section>
      )}

      <section className="copy-block section">
        <span className="section-index">DIRECT</span>
        <p className="body-copy">
          Or write directly:{" "}
          <a className="text-link" href={`mailto:${site.email}`}>{site.email}</a>
        </p>
      </section>
    </main>
  );
}

// Re-export matcher so main.jsx can dispatch dynamic routes.
export { matchRoute };
