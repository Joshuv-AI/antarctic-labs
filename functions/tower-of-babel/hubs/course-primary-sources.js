// GET /tower-of-babel/hubs/course-primary-sources — one hub of canonical
// foundational documents for classroom use. The list is a curated subset
// of the catalog's own canon pins (src/lib/search-rank.js CANON), grouped
// in functions/_lib/tower-hubs.js (COURSE_GROUPS) and resolved against
// the live catalog at request time; ids that no longer resolve are
// dropped. Single page (the whole list is ~50 works — no pagination).

import {
  HUBS_BASE,
  getHubIndex,
  hubPageShell,
  serveHubPage,
  dataUnavailable,
  escapeHtml,
} from "../../_lib/tower-hubs.js";

export async function onRequestGet(context) {
  let idx;
  try {
    idx = await getHubIndex();
  } catch (err) {
    return dataUnavailable();
  }
  const { groups, courseCount } = idx.course;
  const path = `${HUBS_BASE}/course-primary-sources`;

  const groupHtml = groups
    .map(
      (g) => `<h2>${escapeHtml(g.label)}</h2>
<ul>
${g.items
  .map(
    (r) =>
      `<li><a href="/tower-of-babel/library/${r.id}">${escapeHtml(r.title)}</a>${
        r.creator ? ` — ${escapeHtml(r.creator)}` : ""
      }${r.year ? ` (${escapeHtml(r.year)})` : ""}</li>`
  )
  .join("\n")}
</ul>`
    )
    .join("\n");

  let position = 0;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `https://antarctic-labs.com${path}#page`,
        url: `https://antarctic-labs.com${path}`,
        name: "Course primary sources | Tower of Babel",
        description:
          "Founding documents and landmark primary sources for the classroom, drawn from the Tower of Babel catalog's canon pins.",
        isPartOf: { "@type": "WebSite", name: "Antarctic Labs", url: "https://antarctic-labs.com" },
        mainEntity: { "@id": `https://antarctic-labs.com${path}#list` },
      },
      {
        "@type": "ItemList",
        "@id": `https://antarctic-labs.com${path}#list`,
        name: "Course primary sources",
        numberOfItems: courseCount,
        itemListElement: groups.flatMap((g) =>
          g.items.map((r) => ({
            "@type": "ListItem",
            position: ++position,
            name: r.title,
            url: `https://antarctic-labs.com/tower-of-babel/library/${r.id}`,
          }))
        ),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://antarctic-labs.com/" },
          { "@type": "ListItem", position: 2, name: "Tower of Babel", item: "https://antarctic-labs.com/tower-of-babel" },
          { "@type": "ListItem", position: 3, name: "Collections & hubs", item: `https://antarctic-labs.com${HUBS_BASE}` },
          { "@type": "ListItem", position: 4, name: "Course primary sources", item: `https://antarctic-labs.com${path}` },
        ],
      },
    ],
  };

  const body = `
<p>These ${courseCount.toLocaleString("en-US")} works are the primary sources a course keeps coming back to: founding documents, the landmark sacred and wisdom texts, and the books that anchor literature, philosophy, and science syllabi. The list is drawn from the catalog's own canon pins — the works the library's search ranks as canonical for their subjects — and every entry links to its entry page, where the full text can be read and cited where text is present. Assign a work by linking its entry page: predictable URLs, no published rate limit, no account needed.</p>
${groupHtml}
<p>Looking for more? Browse <a href="${HUBS_BASE}">all hub collections</a> or search the full catalog in the <a href="/tower-of-babel/library">library</a>.</p>`;

  const html = hubPageShell({
    title: "Course primary sources | Tower of Babel",
    description: `${courseCount.toLocaleString("en-US")} founding documents and landmark primary sources for the classroom — free to read and cite in the Tower of Babel library.`,
    path,
    h1: "Course primary sources",
    breadcrumb: [
      { name: "Tower of Babel", path: "/tower-of-babel" },
      { name: "Collections & hubs", path: HUBS_BASE },
      { name: "Course primary sources", path },
    ],
    jsonLd,
    body,
  });
  return serveHubPage(context, html);
}
