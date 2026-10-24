// GET /tower-of-babel/hubs — index of all Phase 2 hub pages.
//
// Server-rendered for every user agent (these are content pages, not the
// SPA): traditions, top authors, declassified programmes, and the course
// primary-sources hub, each with its catalog-derived work count. Counts
// come from functions/_lib/tower-hubs.js (see its header for the rules).
// On catalog failure the function answers 503 + Retry-After (the SPA has
// no hubs route to fall back to, and a soft-404 shell would be worse).

import {
  HUBS_BASE,
  TRADITION_DEFS,
  PROGRAMME_DEFS,
  getHubIndex,
  hubPageShell,
  serveHubPage,
} from "../_lib/tower-hubs.js";

export async function onRequestGet(context) {
  let idx;
  try {
    idx = await getHubIndex();
  } catch (err) {
    return new Response("The hub index is temporarily unavailable.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "300" },
    });
  }

  const url = `${HUBS_BASE}`;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  const traditionItems = TRADITION_DEFS.map((d) => {
    const count = (idx.traditions.get(d.id) || []).length;
    return { name: `${d.label} — sacred texts and key works`, url: `${HUBS_BASE}/traditions/${d.id}`, count, blurb: d.blurb };
  });
  const authorItems = idx.topAuthors.map((a) => ({
    name: `${a.name} — works in the Tower of Babel`,
    url: `${HUBS_BASE}/authors/${a.slug}`,
    count: a.count,
  }));
  const programmeItems = PROGRAMME_DEFS.map((d) => ({
    name: `${d.label} — declassified documents`,
    url: `${HUBS_BASE}/declassified/${d.id}`,
    count: (idx.programmes.get(d.id) || []).length,
    blurb: d.blurb,
  }));

  const card = (item) =>
    `<li><a href="${item.url}">${esc(item.name.split(" — ")[0])}</a> — ${item.count.toLocaleString("en-US")} works${
      item.blurb ? `<br>${esc(item.blurb)}` : ""
    }</li>`;

  const body = `
<p>The Tower of Babel catalog holds ${idx.total.toLocaleString("en-US")} records. These hub pages group the catalog into browsable collections — sacred texts by tradition, the most-collected authors, declassified documents by programme, and a course list of primary sources. Every work listed links to its entry page, where the full text can be read where text is present.</p>
<h2>Sacred texts by tradition</h2>
<ul>
${traditionItems.map(card).join("\n")}
</ul>
<h2>Authors &amp; creators</h2>
<p>The 50 creators with the most works in the catalog:</p>
<ul>
${authorItems.map(card).join("\n")}
</ul>
<h2>Declassified by programme</h2>
<ul>
${programmeItems.map(card).join("\n")}
</ul>
<h2>For the classroom</h2>
<ul>
<li><a href="${HUBS_BASE}/course-primary-sources">Course primary sources</a> — ${idx.course.courseCount.toLocaleString("en-US")} works. Founding documents and landmark texts, drawn from the catalog's own canon pins, ready to assign and cite.</li>
</ul>
<p>Hub membership is derived from the catalog by fixed, documented rules — see each hub page for its rule. The full catalog can also be browsed in the <a href="/tower-of-babel/library">library</a> or read as machine-readable data on the <a href="/tower-of-babel/api">API page</a>.</p>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `https://antarctic-labs.com${url}#page`,
        url: `https://antarctic-labs.com${url}`,
        name: "Collections & hubs — Tower of Babel",
        description:
          "Hub pages for the Tower of Babel library: sacred texts by tradition, top authors, declassified documents by programme, and course primary sources.",
        isPartOf: { "@type": "WebSite", name: "Antarctic Labs", url: "https://antarctic-labs.com" },
      },
      {
        "@type": "ItemList",
        name: "Tower of Babel hubs",
        numberOfItems: traditionItems.length + authorItems.length + programmeItems.length + 1,
        itemListElement: [...traditionItems, ...authorItems, ...programmeItems,
          { name: "Course primary sources", url: `${HUBS_BASE}/course-primary-sources`, count: idx.course.courseCount },
        ].map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: item.name,
          url: `https://antarctic-labs.com${item.url}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://antarctic-labs.com/" },
          { "@type": "ListItem", position: 2, name: "Tower of Babel", item: "https://antarctic-labs.com/tower-of-babel" },
          { "@type": "ListItem", position: 3, name: "Collections & hubs", item: `https://antarctic-labs.com${url}` },
        ],
      },
    ],
  };

  const html = hubPageShell({
    title: "Collections & hubs | Tower of Babel",
    description:
      "Browse the Tower of Babel library by collection: sacred texts by tradition, top authors, declassified documents by programme, and course primary sources.",
    path: url,
    h1: "Collections & hubs",
    breadcrumb: [
      { name: "Tower of Babel", path: "/tower-of-babel" },
      { name: "Collections & hubs", path: url },
    ],
    jsonLd,
    body,
  });
  return serveHubPage(context, html);
}
