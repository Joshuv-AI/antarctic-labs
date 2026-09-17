// Minimal page shells for the Stage A destinations. Each destination
// renders an architecture-only placeholder: section index, destination
// title, and a brief description of what will live here once the
// lead engineer provides finalized content.
//
// Visual language is intentionally restrained — the existing
// .site-header, .page-shell, and .section classes from styles.css are
// reused so the destination pages already share the home-page visual
// grammar.

import { site } from "./content/site.js";
import { expeditions } from "./content/expeditions.js";
import { systems } from "./content/systems.js";
import { history } from "./content/history.js";
import { operator } from "./content/operator.js";
import { artifacts } from "./content/tower-of-babel.js";
import { government } from "./content/government.js";
import { matchRoute } from "./content/routes.js";

function PageShell({ index, title, children, footer = true }) {
  return (
    <main className="page-shell inner-page">
      <section className="inner-hero section">
        <div className="section-index">{index}</div>
        <h1>{title}</h1>
      </section>
      {children}
      {footer && (
        <section className="copy-block section">
          <p className="body-copy">{children ? null : "Content pending — architecture in place."}</p>
        </section>
      )}
    </main>
  );
}

export function TheLab({ go }) {
  return (
    <PageShell index="01 / THE LAB" title={<>THE <em>LAB.</em></>}>
      <section className="copy-block section">
        <span className="section-index">WHAT LIVES HERE</span>
        <p className="display-copy">The laboratory. A field station for systems, software, and the unknown.</p>
        <p className="body-copy">Final content will be provided by the lead engineer.</p>
        <button className="text-link" onClick={() => go("/")}>RETURN TO ARRIVAL <span>↗</span></button>
      </section>
    </PageShell>
  );
}

export function Systems({ go }) {
  return (
    <PageShell index="02 / SYSTEMS" title={<>SYSTEMS</>}>
      <section className="copy-block section">
        <span className="section-index">CATALOG</span>
        <ul className="body-copy">
          {systems.map((s) => (
            <li key={s.id}>{s.title || s.id}</li>
          ))}
        </ul>
        <button className="text-link" onClick={() => go("/")}>RETURN TO ARRIVAL <span>↗</span></button>
      </section>
    </PageShell>
  );
}

export function Expeditions({ go }) {
  return (
    <PageShell index="03 / EXPEDITIONS" title={<>EXPEDITIONS</>}>
      <section className="copy-block section">
        <span className="section-index">CATALOG</span>
        <ul className="body-copy">
          {expeditions.map((e) => (
            <li key={e.id}>
              <button className="text-link" onClick={() => go(`/expeditions/${e.id}`)}>{e.title || e.id} <span>↗</span></button>
            </li>
          ))}
        </ul>
        <button className="text-link" onClick={() => go("/")}>RETURN TO ARRIVAL <span>↗</span></button>
      </section>
    </PageShell>
  );
}

export function ExpeditionDetail({ go, params }) {
  const expedition = expeditions.find((e) => e.id === params.id);
  return (
    <PageShell index={`EXPEDITION / ${params.id}`} title={expedition ? expedition.title : params.id}>
      <section className="copy-block section">
        <span className="section-index">STATUS</span>
        <p className="body-copy">{expedition ? expedition.status : "UNKNOWN"}</p>
        <span className="section-index">CATEGORY</span>
        <p className="body-copy">{expedition ? expedition.category : "UNKNOWN"}</p>
        <span className="section-index">FINAL CONTENT</span>
        <p className="body-copy">Final expedition content will be provided by the lead engineer.</p>
        <button className="text-link" onClick={() => go("/expeditions")}>ALL EXPEDITIONS <span>↗</span></button>
      </section>
    </PageShell>
  );
}

export function History({ go }) {
  return (
    <PageShell index="04 / HISTORY" title={<>HISTORY</>}>
      <section className="copy-block section">
        <span className="section-index">TIMELINE</span>
        <ul className="body-copy">
          {history.map((h) => (
            <li key={h.id}>{h.title || h.id}</li>
          ))}
        </ul>
        <button className="text-link" onClick={() => go("/")}>RETURN TO ARRIVAL <span>↗</span></button>
      </section>
    </PageShell>
  );
}

export function TowerOfBabel({ go }) {
  return (
    <PageShell index="05 / TOWER OF BABEL" title={<>TOWER OF <em>BABEL.</em></>}>
      <section className="copy-block section">
        <span className="section-index">DESTINATION</span>
        <p className="display-copy">A personal library, archive, and artifact catalog. Not an Expedition.</p>
        <button className="text-link" onClick={() => go("/tower-of-babel/library")}>ENTER THE LIBRARY <span>↗</span></button>
      </section>
    </PageShell>
  );
}

export function TowerLibrary({ go }) {
  return (
    <PageShell index="05.A / LIBRARY" title={<>THE <em>LIBRARY</em></>}>
      <section className="copy-block section">
        <span className="section-index">CATALOG</span>
        <ul className="body-copy">
          {artifacts.map((a) => (
            <li key={a.artifact_id}>
              <button className="text-link" onClick={() => go(`/tower-of-babel/library/${a.artifact_id}`)}>{a.title || a.artifact_id} <span>↗</span></button>
            </li>
          ))}
        </ul>
        <button className="text-link" onClick={() => go("/tower-of-babel")}>BACK TO TOWER OF BABEL <span>↗</span></button>
      </section>
    </PageShell>
  );
}

export function LibraryArtifact({ go, params }) {
  const artifact = artifacts.find((a) => a.artifact_id === params.id);
  return (
    <PageShell index={`ARTIFACT / ${params.id}`} title={artifact ? artifact.title : params.id}>
      <section className="copy-block section">
        <span className="section-index">COLLECTION</span>
        <p className="body-copy">{artifact ? artifact.collection : "UNKNOWN"}</p>
        <span className="section-index">RIGHTS</span>
        <p className="body-copy">{artifact ? artifact.rights_status : "UNKNOWN"}</p>
        <span className="section-index">DOWNLOAD</span>
        <p className="body-copy">{artifact ? artifact.download_status : "UNKNOWN"}</p>
        <button className="text-link" onClick={() => go("/tower-of-babel/library")}>BACK TO LIBRARY <span>↗</span></button>
      </section>
    </PageShell>
  );
}

export function Government({ go }) {
  return (
    <PageShell index="06 / GOVERNMENT" title={<>GOVERNMENT</>}>
      <section className="copy-block section">
        <span className="section-index">PUBLIC SECTOR</span>
        <p className="display-copy">Capabilities, registrations, and procurement information will be provided by the lead engineer.</p>
        <button className="text-link" onClick={() => go("/")}>RETURN TO ARRIVAL <span>↗</span></button>
      </section>
    </PageShell>
  );
}

export function TheOperator({ go }) {
  return (
    <PageShell index="07 / THE OPERATOR" title={<><em>{operator.name}</em></>}>
      <section className="copy-block section">
        <span className="section-index">LOCATION</span>
        <p className="body-copy">{operator.location}</p>
        <span className="section-index">PHILOSOPHY</span>
        <p className="body-copy">{operator.philosophy}</p>
        <span className="section-index">BIO</span>
        <p className="body-copy">Final bio content will be provided by the lead engineer.</p>
        <button className="text-link" onClick={() => go("/")}>RETURN TO ARRIVAL <span>↗</span></button>
      </section>
    </PageShell>
  );
}

export function FieldInterests({ go }) {
  return (
    <PageShell index="08 / FIELD INTERESTS" title={<>FIELD <em>INTERESTS</em></>}>
      <section className="copy-block section">
        <span className="section-index">AREAS OF ACTIVE INTEREST</span>
        <p className="display-copy">Field interests will be provided by the lead engineer.</p>
        <button className="text-link" onClick={() => go("/")}>RETURN TO ARRIVAL <span>↗</span></button>
      </section>
    </PageShell>
  );
}

export function Transmission({ go }) {
  return (
    <PageShell index="09 / TRANSMISSION" title={<>TRANSMISSION</>}>
      <section className="contact-cta section">
        <span className="section-index">CONTACT</span>
        <h2>START WITH<br/>A HARD<br/><em>PROBLEM.</em></h2>
        <a href={`mailto:${site.email}`} className="contact-button"><span>{site.email}</span><b>↗</b></a>
      </section>
    </PageShell>
  );
}

// Export the matcher so main.jsx can dispatch to the correct component.
export { matchRoute };
