// The library's curation stream for the server-rendered pages:
// dated, real curation and maintenance events, newest first.
// Mirror of src/content/curation.js — keep the two in sync.
//
// Every entry states something that actually happened on that date.
// Counts are the counts the project recorded when the work landed.

export const CURATION_STREAM = [
  {
    date: "2026-11-16",
    title: "Papers, classified by field",
    body: "The Papers collection — 1,130,210 papers — is now organised into 12 fields, 70 subfields and 10 publication types, so a reader can browse neuroscience or number theory instead of one undifferentiated pile. 97.5% of papers carry a primary field classification.",
    link: "/tower-of-babel/collections/papers",
    linkLabel: "Browse Papers",
  },
  {
    date: "2026-11-16",
    title: "Scholarly feed opened",
    body: "The catalog is now harvestable through a standard OAI-PMH endpoint (Dublin Core and OpenAIRE formats, one set per collection), so libraries and archives can ingest the Tower's records the way they ingest any other scholarly feed.",
    link: "/tower-of-babel/api",
    linkLabel: "How the feed works",
  },
  {
    date: "2026-11-15",
    title: "New curated collections",
    body: "Five reading collections built by hand from the catalog: For Law Students (875,510 works), For Med Students (410,421), Engineering (230,426), Mathematics and Sciences (252,706) and a Conspiracy shelf (941) — each with its own shelves, sized by their true entry counts.",
    link: "/tower-of-babel/library",
    linkLabel: "See the collections",
  },
  {
    date: "2026-11-14",
    title: "Legibility comb-through completed",
    body: "Every text in the library was checked the way a reader meets it. About 99.5% verified clean; roughly 875 reader-facing repairs landed — broken files fixed, mislabelled works corrected, unobtainable works removed outright rather than left as placeholders.",
    link: "/tower-of-babel/library",
    linkLabel: "Read the library",
  },
  {
    date: "2026-11-10",
    title: "2,557,923 works preserved",
    body: "The library reached its present size: 2,557,923 works across seven collections — Law 1,277,197 · Papers 1,130,210 · Books 81,631 · Reference 41,137 · Declassified 26,294 · Podcasts 1,091 · Documents 363 — each one hosted as clean, searchable text, free to read.",
    link: "/tower-of-babel",
    linkLabel: "Enter the Tower",
  },
];

// Rendered HTML block for the static pages (functions/_lib/static-pages.js
// and _lib/collections.js share this exact markup).
export function curationStreamHtml(escapeHtml) {
  const esc = escapeHtml;
  const items = CURATION_STREAM.map(
    (e) => `<article>
<h3>${esc(e.title)} — ${esc(e.date)}</h3>
<p>${esc(e.body)}</p>
<p><a href="${esc(e.link)}">${esc(e.linkLabel)}</a></p>
</article>`
  ).join("\n");
  return `<h2>Recently curated</h2>
<p>The library is maintained in the open: new collections, classification passes and repair programs land as dated entries in this stream.</p>
${items}`;
}
