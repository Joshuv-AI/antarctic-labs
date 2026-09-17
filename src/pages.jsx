// Destination page shells for the unified Antarctic Labs routes.
// Each shell renders copy from the corresponding src/content/*.js
// module and reuses the existing CSS grammar (.page-shell,
// .inner-hero, .section, .section-index, .copy-block, .display-copy,
// .body-copy, .text-link, .cap-row, .contact-cta, .contact-button).
//
// Visual language is intentionally not redesigned here — these shells
// use the same classes the existing Home page already uses, so the
// destinations already share the home-page visual grammar.

import { site } from "./content/site.js";
import { theLab } from "./content/the-lab.js";
import { systems } from "./content/systems.js";
import { expeditions, expeditionsArchive } from "./content/expeditions.js";
import { history } from "./content/history.js";
import { operator } from "./content/operator.js";
import { artifacts, towerOfBabel } from "./content/tower-of-babel.js";
import { government } from "./content/government.js";
import { matchRoute } from "./content/routes.js";

// ----- The Lab -------------------------------------------------------------

export function TheLab({ go }) {
  return (
    <main className="page-shell inner-page">
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
              <i>+</i>
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
    <main className="page-shell inner-page">
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
              <i>+</i>
            </div>
          ))}
        </div>
      </section>

      <section className="copy-block section">
        <button className="text-link" onClick={() => go("/expeditions")}>SEE EXPEDITIONS <span>↗</span></button>
      </section>
    </main>
  );
}

// ----- Expeditions archive + detail ---------------------------------------

export function Expeditions({ go }) {
  return (
    <main className="page-shell inner-page">
      <section className="inner-hero section">
        <div className="section-index">03 / EXPEDITIONS</div>
        <h1>{expeditionsArchive.heading}</h1>
        <p className="display-copy">{expeditionsArchive.intro}</p>
        <p className="body-copy">{expeditionsArchive.supporting}</p>
      </section>

      <section className="copy-block section">
        <div className="section-index">CATALOG</div>
        {expeditions.length === 0 ? (
          <p className="body-copy">The expedition catalog is being finalized. Records will appear here once the lead engineer provides them.</p>
        ) : (
          <ul className="body-copy">
            {expeditions.map((e) => (
              <li key={e.id}>
                <button className="text-link" onClick={() => go(`/expeditions/${e.id}`)}>{e.title || e.id} <span>↗</span></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export function ExpeditionDetail({ go, params }) {
  const expedition = expeditions.find((e) => e.id === params.id);
  return (
    <main className="page-shell inner-page">
      <section className="inner-hero section">
        <div className="section-index">EXPEDITION / {params.id}</div>
        <h1>{expedition ? expedition.title : params.id}</h1>
      </section>

      {expedition ? (
        <>
          <section className="detail-grid section">
            <div><span className="section-index">STATUS</span><strong>{expedition.status || "—"}</strong></div>
            <div><span className="section-index">CATEGORY</span><strong>{expedition.category || "—"}</strong></div>
            <div><span className="section-index">DATE</span><strong>{expedition.date || "—"}</strong></div>
            <div><span className="section-index">ROLE</span><strong>{expedition.role || "—"}</strong></div>
          </section>

          {expedition.shortDescription && (
            <section className="copy-block section">
              <span className="section-index">SUMMARY</span>
              <p className="display-copy">{expedition.shortDescription}</p>
            </section>
          )}
          {expedition.problem && (
            <section className="copy-block section">
              <span className="section-index">PROBLEM</span>
              <p className="body-copy">{expedition.problem}</p>
            </section>
          )}
          {expedition.approach && (
            <section className="copy-block section">
              <span className="section-index">APPROACH</span>
              <p className="body-copy">{expedition.approach}</p>
            </section>
          )}
          {expedition.system && (
            <section className="copy-block section">
              <span className="section-index">SYSTEM</span>
              <p className="body-copy">{expedition.system}</p>
            </section>
          )}
          {expedition.build && (
            <section className="copy-block section">
              <span className="section-index">BUILD</span>
              <p className="body-copy">{expedition.build}</p>
            </section>
          )}
          {expedition.technologies && expedition.technologies.length > 0 && (
            <section className="copy-block section">
              <span className="section-index">TECHNOLOGIES</span>
              <p className="body-copy">{expedition.technologies.join(" · ")}</p>
            </section>
          )}
          {expedition.result && (
            <section className="copy-block section">
              <span className="section-index">RESULT</span>
              <p className="body-copy">{expedition.result}</p>
            </section>
          )}
        </>
      ) : (
        <section className="copy-block section">
          <p className="body-copy">This expedition is being finalized. The full record will appear here once the lead engineer provides it.</p>
        </section>
      )}

      <div className="page-next">
        <button className="text-link" onClick={() => go("/expeditions")}>ALL EXPEDITIONS <span>↗</span></button>
      </div>
    </main>
  );
}

// ----- History -------------------------------------------------------------

export function History({ go }) {
  return (
    <main className="page-shell inner-page">
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
              <i>+</i>
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
    <main className="page-shell inner-page">
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

      <section className="copy-block section">
        <button className="text-link" onClick={() => go("/tower-of-babel/library")}>ENTER THE LIBRARY <span>↗</span></button>
      </section>
    </main>
  );
}

export function TowerLibrary({ go }) {
  return (
    <main className="page-shell inner-page">
      <section className="inner-hero section">
        <div className="section-index">05.A / LIBRARY</div>
        <h1>{towerOfBabel.library.heading}</h1>
        <p className="body-copy">{towerOfBabel.library.intro}</p>
        <p className="body-copy">{towerOfBabel.library.note}</p>
      </section>

      <section className="copy-block section">
        <div className="section-index">CATALOG</div>
        {artifacts.length === 0 ? (
          <p className="body-copy">Catalog entries are not yet available. The data model is in place; the lead engineer will populate the archive.</p>
        ) : (
          <ul className="body-copy">
            {artifacts.map((a) => (
              <li key={a.artifact_id}>
                <button className="text-link" onClick={() => go(`/tower-of-babel/library/${a.artifact_id}`)}>{a.title || a.artifact_id} <span>↗</span></button>
              </li>
            ))}
          </ul>
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
  return (
    <main className="page-shell inner-page">
      <section className="inner-hero section">
        <div className="section-index">ARTIFACT / {params.id}</div>
        <h1>{artifact ? artifact.title : params.id}</h1>
      </section>

      {artifact ? (
        <section className="detail-grid section">
          <div><span className="section-index">COLLECTION</span><strong>{artifact.collection || "—"}</strong></div>
          <div><span className="section-index">RIGHTS</span><strong>{artifact.rights_status || "—"}</strong></div>
          <div><span className="section-index">DOWNLOAD</span><strong>{artifact.download_status || "—"}</strong></div>
          <div><span className="section-index">YEAR</span><strong>{artifact.year || "—"}</strong></div>
        </section>
      ) : (
        <section className="copy-block section">
          <p className="body-copy">This artifact is being finalized. The full record will appear here once the lead engineer provides it.</p>
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
  return (
    <main className="page-shell inner-page">
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
              <i>+</i>
            </div>
          ))}
        </div>
      </section>

      <section className="copy-block section">
        <p className="body-copy">
          Antarctic Labs does not currently claim contracts, certifications, registrations, procurement status, government clients, or past performance. This destination is in active development.
        </p>
      </section>

      <section className="copy-block section">
        <button className="text-link" onClick={() => go("/transmission")}>MAKE CONTACT <span>↗</span></button>
      </section>
    </main>
  );
}

// ----- The Operator --------------------------------------------------------

export function TheOperator({ go }) {
  return (
    <main className="page-shell inner-page">
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
              <i>+</i>
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
    <main className="page-shell inner-page">
      <section className="inner-hero section">
        <div className="section-index">08 / FIELD INTERESTS</div>
        <h1>FIELD INTERESTS</h1>
      </section>

      <section className="capabilities section reveal">
        <div className="section-index">AREAS OF ACTIVE INTEREST</div>
        <div className="capability-list">
          {operator.fieldInterests.map((interest, i) => (
            <div className="cap-row" key={interest}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <h3>{interest}</h3>
              <i>+</i>
            </div>
          ))}
        </div>
      </section>

      <section className="copy-block section">
        <p className="body-copy">{operator.closing}</p>
      </section>

      <section className="copy-block section">
        <button className="text-link" onClick={() => go("/operator")}>ABOUT THE OPERATOR <span>↗</span></button>
      </section>
    </main>
  );
}

// ----- Transmission --------------------------------------------------------

export function Transmission({ go }) {
  return (
    <main className="page-shell inner-page">
      <section className="inner-hero section">
        <div className="section-index">09 / TRANSMISSION</div>
        <h1>HAVE A PROBLEM<br/>WORTH SOLVING?</h1>
      </section>

      <section className="copy-block section reveal">
        <p className="display-copy">Have an idea, need a system built, want to collaborate, or simply found something interesting? Send a transmission.</p>
      </section>

      <section className="copy-block section reveal">
        <form
          className="transmission-form"
          onSubmit={(e) => {
            e.preventDefault();
            // Stage B: there is no real backend integration. Keep the
            // front-end functional but clearly do not pretend messages
            // are transmitted.
            const root = e.currentTarget.parentElement;
            if (root) {
              root.dataset.status = "received";
            }
            e.currentTarget.reset();
          }}
        >
          <label><span>NAME *</span><input name="name" required type="text" autoComplete="name" /></label>
          <label><span>COMPANY / PROJECT</span><input name="company" type="text" autoComplete="organization" /></label>
          <label><span>EMAIL *</span><input name="email" required type="email" autoComplete="email" /></label>
          <label><span>WHAT IS THIS ABOUT? *</span>
            <select name="subject" required defaultValue="">
              <option value="" disabled>Select a subject</option>
              <option value="project">PROJECT</option>
              <option value="collaboration">COLLABORATION</option>
              <option value="tower-of-babel">TOWER OF BABEL</option>
              <option value="government">GOVERNMENT / PUBLIC SECTOR</option>
              <option value="general">GENERAL</option>
            </select>
          </label>
          <label><span>MESSAGE *</span><textarea name="message" required rows={6} /></label>
          <label><span>WEBSITE</span><input name="website" type="text" /></label>
          <button type="submit" className="text-link">SEND TRANSMISSION <span>↗</span></button>
          <p className="body-copy" data-form-note>
            Front-end form only — messages are not yet transmitted. This will be wired to a real integration in a later stage.
          </p>
        </form>
      </section>

      <section className="copy-block section" data-form-confirmation hidden>
        <span className="section-index">TRANSMISSION RECEIVED.</span>
        <p className="body-copy">I’ll review your message and respond directly.</p>
      </section>

      <section className="copy-block section">
        <p className="body-copy">Or write directly: <a className="text-link" href={`mailto:${site.email}`}>{site.email}</a></p>
      </section>
    </main>
  );
}

// Re-export matcher so main.jsx can dispatch dynamic routes.
export { matchRoute };
