// GET /tower-of-babel/hubs/authors/<slug> — works by one of the catalog's
// top 50 creators. Slug rule and ranking are documented in
// functions/_lib/tower-hubs.js (count desc, decoded name asc; slug =
// entity-decoded, diacritic-stripped, hyphenated; collisions -2, -3...).
// Slugs outside the top 50 return a real 404. Paginated 200/page.

import {
  HUBS_BASE,
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
  const slug = context.params.slug;
  let idx;
  try {
    idx = await getHubIndex();
  } catch (err) {
    return dataUnavailable();
  }
  const author = idx.authorBySlug.get(slug);
  if (!author) return notFound("author");

  const works = idx.authorWorks.get(author.name) || [];
  // Most-collected collections for this creator, for the intro line.
  const colCounts = new Map();
  for (const r of works) colCounts.set(r.collection, (colCounts.get(r.collection) || 0) + 1);
  const topCols = [...colCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  const path = `${HUBS_BASE}/authors/${slug}`;
  const { pageItems, page, totalPages, total, capped } = paginate(works, context.request);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `https://antarctic-labs.com${path}#page`,
        url: `https://antarctic-labs.com${path}`,
        name: `${author.name} — works | Tower of Babel`,
        description: `${total.toLocaleString("en-US")} works by ${author.name} in the Tower of Babel library.`,
        isPartOf: { "@type": "WebSite", name: "Antarctic Labs", url: "https://antarctic-labs.com" },
        mainEntity: { "@id": `https://antarctic-labs.com${path}#list` },
        about: { "@type": "Person", name: author.name },
      },
      {
        "@type": "ItemList",
        "@id": `https://antarctic-labs.com${path}#list`,
        name: `Works by ${author.name}`,
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
          { "@type": "ListItem", position: 4, name: author.name, item: `https://antarctic-labs.com${path}` },
        ],
      },
    ],
  };

  const colLine = topCols
    .map(([c, n]) => `${n.toLocaleString("en-US")} in ${c.charAt(0) + c.slice(1).toLowerCase()}`)
    .join(", ");

  const body = `
<p>The Tower of Babel holds ${total.toLocaleString("en-US")} works credited to <strong>${author.name}</strong>${colLine ? ` (${colLine})` : ""} — among the 50 most-collected creators in the catalog. Each link below opens the work's entry page; where text is present, the full text is readable there. Lists are paginated 200 works per page${capped ? ` and capped at 10,000 works` : ""}, sorted by title.</p>
<h2>Works by ${author.name}</h2>
${renderWorkList(pageItems)}
${renderPagination(path, page, totalPages)}
<p>Creator names are the catalog's own attribution strings. More collections: <a href="${HUBS_BASE}">all hubs</a>.</p>`;

  const html = hubPageShell({
    title: `${author.name} — works | Tower of Babel`,
    description: `${total.toLocaleString("en-US")} works by ${author.name} in the Tower of Babel library — free to read, with predictable URLs for every entry.`,
    path,
    h1: author.name,
    breadcrumb: [
      { name: "Tower of Babel", path: "/tower-of-babel" },
      { name: "Collections & hubs", path: HUBS_BASE },
      { name: author.name, path },
    ],
    jsonLd,
    body,
  });
  return serveHubPage(context, html);
}
