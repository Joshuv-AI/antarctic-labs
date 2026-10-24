// GET /tower-of-babel/hubs/declassified/<programme> — declassified
// documents grouped by publishing programme. Groupings are artifact-id
// prefix rules mirroring the site's own taxonomy (see
// functions/_lib/tower-hubs.js): cia- / frus- / gao-|plaw- / un- /
// govdocs-nsarchive|nsa- / fbi-vault. The taxonomy's residual "other"
// bucket has no hub (it is a mixed remainder, not a programme).
// Listed in catalog order. Paginated 200/page, capped at 10,000 works.

import {
  HUBS_BASE,
  PROGRAMME_DEFS,
  getHubIndex,
  paginate,
  renderWorkList,
  renderPagination,
  hubPageShell,
  serveHubPage,
  notFound,
  dataUnavailable,
} from "../../../_lib/tower-hubs.js";

export async function onRequestGet(context) {
  const programme = context.params.programme;
  const def = PROGRAMME_DEFS.find((d) => d.id === programme);
  if (!def) return notFound("programme");

  let idx;
  try {
    idx = await getHubIndex();
  } catch (err) {
    return dataUnavailable();
  }
  const works = idx.programmes.get(def.id) || [];
  const path = `${HUBS_BASE}/declassified/${def.id}`;
  const { pageItems, page, totalPages, total, capped } = paginate(works, context.request);

  const shortName = def.label.split(" — ")[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `https://antarctic-labs.com${path}#page`,
        url: `https://antarctic-labs.com${path}`,
        name: `${def.label} — declassified | Tower of Babel`,
        description: def.blurb,
        isPartOf: { "@type": "WebSite", name: "Antarctic Labs", url: "https://antarctic-labs.com" },
        mainEntity: { "@id": `https://antarctic-labs.com${path}#list` },
      },
      {
        "@type": "ItemList",
        "@id": `https://antarctic-labs.com${path}#list`,
        name: `${def.label} documents in the Tower of Babel`,
        numberOfItems: total,
        itemListElement: pageItems.map((r, i) => ({
          "@type": "ListItem",
          position: (page - 1) * 200 + i + 1,
          name: r.title,
          url: `https://antarctic-labs.com/tower-of-babel/library/${r.id}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://antarctic-labs.com/" },
          { "@type": "ListItem", position: 2, name: "Tower of Babel", item: "https://antarctic-labs.com/tower-of-babel" },
          { "@type": "ListItem", position: 3, name: "Collections & hubs", item: `https://antarctic-labs.com${HUBS_BASE}` },
          { "@type": "ListItem", position: 4, name: shortName, item: `https://antarctic-labs.com${path}` },
        ],
      },
    ],
  };

  const body = `
<p>${def.blurb}</p>
<p>This hub lists ${total.toLocaleString("en-US")} documents in catalog order. Each link opens the document's entry page; where text is present, the full text is readable there. Lists are paginated 200 documents per page${capped ? ` and capped at 10,000 documents` : ""}.</p>
<h2>Documents</h2>
${renderWorkList(pageItems)}
${renderPagination(path, page, totalPages)}
<h2>How this list is built</h2>
<p>Programme membership follows the site's own declassified taxonomy: records are grouped by the source prefix of their catalog identifier. Declassified records outside these programmes sit in the catalog's general declassified collection and are reachable from the <a href="/tower-of-babel/library">library</a>. More collections: <a href="${HUBS_BASE}">all hubs</a>.</p>`;

  const html = hubPageShell({
    title: `${def.label} — declassified documents | Tower of Babel`,
    description: `${def.blurb} ${total.toLocaleString("en-US")} documents, free to read in the Tower of Babel library.`,
    path,
    h1: def.label,
    breadcrumb: [
      { name: "Tower of Babel", path: "/tower-of-babel" },
      { name: "Collections & hubs", path: HUBS_BASE },
      { name: shortName, path },
    ],
    jsonLd,
    body,
  });
  return serveHubPage(context, html);
}
