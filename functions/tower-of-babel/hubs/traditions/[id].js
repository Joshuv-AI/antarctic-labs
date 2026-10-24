// GET /tower-of-babel/hubs/traditions/<id> — one hub per tradition from
// the site's TRADITIONS data (src/lib/tower-shelves.js). Membership: the
// tradition's editorial key works first, then BOOKS records matched by
// the documented rule in functions/_lib/tower-hubs.js (first-match wins,
// traditions checked most-distinctive first). Paginated 200/page.

import {
  HUBS_BASE,
  TRADITION_DEFS,
  getHubIndex,
  getTraditionList,
  paginate,
  renderWorkList,
  renderPagination,
  hubPageShell,
  serveHubPage,
  notFound,
  dataUnavailable,
} from "../../../_lib/tower-hubs.js";

export async function onRequestGet(context) {
  const id = context.params.id;
  const def = TRADITION_DEFS.find((d) => d.id === id);
  if (!def) return notFound("tradition");

  let idx;
  try {
    idx = await getHubIndex();
  } catch (err) {
    return dataUnavailable();
  }
  const works = getTraditionList(idx, id);
  const path = `${HUBS_BASE}/traditions/${id}`;
  const { pageItems, page, totalPages, total, capped } = paginate(works, context.request);

  const curatedTitles = def.curated
    .map((cid) => idx.wanted.get(cid))
    .filter(Boolean)
    .map((r) => r.title)
    .slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `https://antarctic-labs.com${path}#page`,
        url: `https://antarctic-labs.com${path}`,
        name: `${def.label} — sacred texts | Tower of Babel`,
        description: def.blurb,
        isPartOf: { "@type": "WebSite", name: "Antarctic Labs", url: "https://antarctic-labs.com" },
        mainEntity: { "@id": `https://antarctic-labs.com${path}#list` },
      },
      {
        "@type": "ItemList",
        "@id": `https://antarctic-labs.com${path}#list`,
        name: `${def.label} works in the Tower of Babel`,
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
          { "@type": "ListItem", position: 4, name: def.label, item: `https://antarctic-labs.com${path}` },
        ],
      },
    ],
  };

  const body = `
<p>${def.blurb}</p>
<p>This hub lists ${total.toLocaleString("en-US")} works. Start with the tradition's key works — ${
    curatedTitles.length ? curatedTitles.join("; ") : "listed first"
  } — or browse the full list below. Each link opens the work's entry page; where text is present, the full text is readable there. Lists are paginated 200 works per page${capped ? ` and capped at 10,000 works` : ""}.</p>
<h2>Works</h2>
${renderWorkList(pageItems)}
${renderPagination(path, page, totalPages)}
<h2>How this list is built</h2>
<p>Membership is deterministic. The tradition's key works (the site's own TRADITIONS shelf) are listed first. Remaining works are BOOKS records whose catalog tags, title, or identifier match this tradition's fixed pattern; each work joins the first tradition it matches, checked most-distinctive first so nothing is double-counted. Some sacred-shelf books carry too little catalog data to place and appear in no tradition hub — the <a href="/tower-of-babel/library">library search</a> covers the whole catalog. More collections: <a href="${HUBS_BASE}">all hubs</a>.</p>`;

  const html = hubPageShell({
    title: `${def.label} — sacred texts | Tower of Babel`,
    description: `${def.blurb} ${total.toLocaleString("en-US")} works, free to read in the Tower of Babel library.`,
    path,
    h1: `${def.label} — sacred texts & key works`,
    breadcrumb: [
      { name: "Tower of Babel", path: "/tower-of-babel" },
      { name: "Collections & hubs", path: HUBS_BASE },
      { name: def.label, path },
    ],
    jsonLd,
    body,
  });
  return serveHubPage(context, html);
}
