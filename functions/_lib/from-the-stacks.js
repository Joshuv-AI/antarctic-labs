// From the Stacks — the Tower of Babel's return-visit surface
// (2026-11-23, traffic program, Return-Visit Option A, approved by
// Joshua 2026-11-23): a daily featured text and the RSS/Atom feeds
// that carry it.
//
// Routes served from this module:
//   /text-of-the-day  — functions/text-of-the-day.js (server-rendered
//                       for every visitor, following the demand-pages
//                       pattern: same shell, same typography, same
//                       nav/footer furniture, edge-cached)
//   /feed.xml         — functions/feed.xml.js  (RSS 2.0)
//   /atom.xml         — functions/atom.xml.js  (Atom 1.0)
//
// The rotation is deterministic: the featured work for a UTC date is
// STACKS[dayIndex mod STACKS.length], where dayIndex counts whole UTC
// days since the epoch. The same work shows all day, on the page and
// in the feeds, with no state and no randomness — any past or future
// day's pick can be recomputed by anyone, which is what makes the
// feed items' dates honest.
//
// The Tower expansion is PAUSED, so this is a rotation of existing
// holdings, not a new-additions feed — the copy says so. Every entry
// in STACKS is a real catalog record: the pool was assembled from the
// demand-pages module's verified works (functions/_lib/demand-pages.js)
// plus hand-picked records, and EVERY id was verified against the live
// catalog API (/api/v1/works/<id>) on 2026-11-23, with title, creator,
// year and collection taken from the record itself. Blurbs are the
// demand pages' editorial notes or an excerpt of the record's own
// published description.

import { SITE, escapeHtml, escapeXml, entryUrl } from "./tower-catalog.js";

export const TEXT_OF_THE_DAY_PATH = "/text-of-the-day";
export const RSS_PATH = "/feed.xml";
export const ATOM_PATH = "/atom.xml";
export const FEED_TITLE = "Tower of Babel — From the Stacks";
export const FEED_DESCRIPTION =
  "One notable work from the Tower of Babel free library, featured every day: classic books, founding documents, landmark papers, declassified records and reference works — each free to read in full.";

const ADS_SCRIPT =
  '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9404729840269984" crossorigin="anonymous"></script>';

const NAV = `<header>
<nav>
<a href="/">Antarctic Labs</a> ·
<a href="/tower-of-babel">Tower of Babel</a> ·
<a href="/tower-of-babel/library">Library</a> ·
<a href="/about">About</a> ·
<a href="/contact">Contact</a> ·
<a href="/privacy">Privacy Policy</a>
</nav>
</header>`;

const FOOT = `<footer>
<p><a href="/">Antarctic Labs</a> · <a href="/tower-of-babel">Tower of Babel</a> · <a href="/tower-of-babel/library">Library</a> · <a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/government-contracting">Government Contracting</a> · <a href="/tower-of-babel/donate">Donate</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms</a> · <a href="/rights-and-sources">Rights &amp; Sources</a></p>
<p>Contact: <a href="mailto:hello@antarctic-labs.com">hello@antarctic-labs.com</a></p>
<p><a href="https://www.google.com/preferences/source?q=antarctic-labs.com" target="_blank" rel="noopener">Add Antarctic Labs as a preferred source on Google</a></p>
<p>© 2026 Antarctic Labs. All rights reserved.</p>
</footer>`;

export const STACKS =
[
 {
  "id": "austen-pride-and-prejudice-1813",
  "title": "Pride and Prejudice",
  "creator": "Jane Austen",
  "year": 1813,
  "collection": "BOOKS",
  "blurb": "Elizabeth Bennet and Mr Darcy: the most famous courtship in English fiction, and the novel to start with."
 },
 {
  "id": "austen-sense-and-sensibility-1811",
  "title": "Sense and Sensibility",
  "creator": "Jane Austen",
  "year": 1811,
  "collection": "BOOKS",
  "blurb": "Two sisters, two temperaments, one hard lesson in love and money. Her first published novel."
 },
 {
  "id": "austen-emma-1815",
  "title": "Emma",
  "creator": "Jane Austen",
  "year": 1815,
  "collection": "BOOKS",
  "blurb": "The matchmaker who cannot read anyone, least of all herself. Austen's most perfectly engineered plot."
 },
 {
  "id": "austen-persuasion-1817",
  "title": "Persuasion",
  "creator": "Jane Austen",
  "year": 1817,
  "collection": "BOOKS",
  "blurb": "A second chance at first love, eight years on. Her last and most tender novel."
 },
 {
  "id": "austen-mansfield-park-1814",
  "title": "Mansfield Park",
  "creator": "Jane Austen",
  "year": 1814,
  "collection": "BOOKS",
  "blurb": "Her most serious novel: a quiet heroine, a great house, and the money beneath it."
 },
 {
  "id": "austen-northanger-abbey-1817",
  "title": "Northanger Abbey",
  "creator": "Jane Austen",
  "year": 1817,
  "collection": "BOOKS",
  "blurb": "A girl raised on Gothic novels meets the real world. Austen's funniest book."
 },
 {
  "id": "dickens-great-expectations-1861",
  "title": "Great Expectations",
  "creator": "Charles Dickens",
  "year": 1861,
  "collection": "BOOKS",
  "blurb": "Pip, Miss Havisham and the convict on the marshes: his most perfectly plotted novel."
 },
 {
  "id": "dickens-christmas-carol-1843",
  "title": "A Christmas Carol",
  "creator": "Charles Dickens",
  "year": 1843,
  "collection": "BOOKS",
  "blurb": "Scrooge's haunted night. The Christmas story that fixed the modern Christmas."
 },
 {
  "id": "dickens-tale-of-two-cities-1859",
  "title": "A Tale of Two Cities",
  "creator": "Charles Dickens",
  "year": 1859,
  "collection": "BOOKS",
  "blurb": "London and Paris in the French Revolution — his bestselling novel in his lifetime."
 },
 {
  "id": "dickens-oliver-twist-1838",
  "title": "Oliver Twist",
  "creator": "Charles Dickens",
  "year": 1838,
  "collection": "BOOKS",
  "blurb": "The workhouse boy who asked for more: the novel that attacked the New Poor Law."
 },
 {
  "id": "dickens-david-copperfield-1850",
  "title": "David Copperfield",
  "creator": "Charles Dickens",
  "year": 1850,
  "collection": "BOOKS",
  "blurb": "His most autobiographical novel, and his own favourite of his children."
 },
 {
  "id": "twain-huckleberry-finn-1884",
  "title": "Adventures of Huckleberry Finn",
  "creator": "Mark Twain",
  "year": 1884,
  "collection": "BOOKS",
  "blurb": "Huck and Jim on the raft: the great American novel, and the place to start."
 },
 {
  "id": "twain-tom-sawyer-1876",
  "title": "The Adventures of Tom Sawyer",
  "creator": "Mark Twain",
  "year": 1876,
  "collection": "BOOKS",
  "blurb": "The boyhood idyll — whitewashed fences, caves and a murder in the graveyard."
 },
 {
  "id": "us-constitution-bill-of-rights",
  "title": "The Constitution of the United States and the Bill of Rights",
  "creator": "United States Constitutional Convention / United States Congress",
  "year": 1787,
  "collection": "DOCUMENTS",
  "blurb": "The frame of 1787 with its first ten amendments — read it whole, at a sitting."
 },
 {
  "id": "us-amendment-13",
  "title": "Thirteenth Amendment to the US Constitution",
  "creator": "US Congress",
  "year": 1865,
  "collection": "DOCUMENTS",
  "blurb": "Abolishes slavery and involuntary servitude, closing the question the war had opened."
 },
 {
  "id": "us-amendment-14",
  "title": "Fourteenth Amendment to the US Constitution",
  "creator": "US Congress",
  "year": 1868,
  "collection": "DOCUMENTS",
  "blurb": "Citizenship, due process and equal protection — the hinge of the modern Constitution."
 },
 {
  "id": "us-amendment-15",
  "title": "Fifteenth Amendment to the US Constitution",
  "creator": "US Congress",
  "year": 1870,
  "collection": "DOCUMENTS",
  "blurb": "The vote shall not be denied on account of race, colour or previous servitude."
 },
 {
  "id": "us-amendment-19",
  "title": "Nineteenth Amendment to the US Constitution",
  "creator": "US Congress",
  "year": 1920,
  "collection": "DOCUMENTS",
  "blurb": "Women's suffrage, after a seventy-year campaign from Seneca Falls."
 },
 {
  "id": "federalist-papers",
  "title": "The Federalist Papers",
  "creator": "Alexander Hamilton, James Madison, John Jay",
  "year": 1787,
  "collection": "DOCUMENTS",
  "blurb": "Hamilton, Madison and Jay as Publius: the case for the Constitution, essay by essay."
 },
 {
  "id": "anti-federalist-papers-brutus",
  "title": "The Anti-Federalist Papers: The Brutus Essays",
  "creator": "Brutus (attributed to Robert Yates)",
  "year": 1787,
  "collection": "DOCUMENTS",
  "blurb": "The case against — the essays that lost the vote and won the Bill of Rights."
 },
 {
  "id": "story-commentaries-constitution-1833-vol1",
  "title": "Commentaries on the Constitution of the United States, Vol. I",
  "creator": "Joseph Story",
  "year": 1833,
  "collection": "BOOKS",
  "blurb": "Justice Joseph Story's great treatise: the Constitution explained by the founding's heirs."
 },
 {
  "id": "story-commentaries-constitution-1833-vol2",
  "title": "Commentaries on the Constitution of the United States, Vol. II",
  "creator": "Joseph Story",
  "year": 1833,
  "collection": "BOOKS",
  "blurb": "The second volume: the legislature, the executive and the powers of the Union."
 },
 {
  "id": "story-commentaries-constitution-1833-vol3",
  "title": "Commentaries on the Constitution of the United States, Vol. III",
  "creator": "Joseph Story",
  "year": 1833,
  "collection": "BOOKS",
  "blurb": "The third volume: the judiciary, the states, and amendments."
 },
 {
  "id": "beard-economic-interpretation-1913",
  "title": "An Economic Interpretation of the Constitution of the United States",
  "creator": "Charles A. Beard",
  "year": 1913,
  "collection": "BOOKS",
  "blurb": "The famous challenge: the Constitution read as an economic document."
 },
 {
  "id": "common-sense-thomas-paine",
  "title": "Common Sense",
  "creator": "Thomas Paine",
  "year": 1776,
  "collection": "PAPERS",
  "blurb": "Paine's pamphlet: the case for independence, in plain words, that outsold everything."
 },
 {
  "id": "us-declaration-of-independence",
  "title": "The Declaration of Independence of the United States of America",
  "creator": "Continental Congress",
  "year": 1776,
  "collection": "DOCUMENTS",
  "blurb": "The announcement and the argument: preamble, grievances and the signers' pledge."
 },
 {
  "id": "articles-of-confederation-1777",
  "title": "Articles of Confederation and Perpetual Union",
  "creator": "Continental Congress",
  "year": 1777,
  "collection": "DOCUMENTS",
  "blurb": "The first frame of union — and the lesson in what it could not do."
 },
 {
  "id": "northwest-ordinance-1787",
  "title": "Northwest Ordinance",
  "creator": "Congress of the Confederation",
  "year": 1787,
  "collection": "DOCUMENTS",
  "blurb": "How the territories would become states, with slavery barred from them."
 },
 {
  "id": "washington-farewell-address-1796",
  "title": "George Washington's Farewell Address",
  "creator": "George Washington",
  "year": 1796,
  "collection": "DOCUMENTS",
  "blurb": "The first president's warnings: parties, factions and foreign entanglements."
 },
 {
  "id": "seneca-falls-declaration-1848",
  "title": "Declaration of Sentiments",
  "creator": "Elizabeth Cady Stanton et al.",
  "year": 1848,
  "collection": "DOCUMENTS",
  "blurb": "Seneca Falls restates the Declaration for women: 'all men and women are created equal.'"
 },
 {
  "id": "douglass-fourth-of-july-1852",
  "title": "What to the Slave Is the Fourth of July?",
  "creator": "Frederick Douglass",
  "year": 1852,
  "collection": "DOCUMENTS",
  "blurb": "Douglass's great oration: the founding's promise quoted back to it."
 },
 {
  "id": "gettysburg-address",
  "title": "The Gettysburg Address",
  "creator": "Abraham Lincoln",
  "year": 1863,
  "collection": "DOCUMENTS",
  "blurb": "Lincoln re-founds the nation on the Declaration's proposition, in 272 words."
 },
 {
  "id": "paine-rights-of-man",
  "title": "Rights of Man",
  "creator": "Thomas Paine",
  "year": 1791,
  "collection": "BOOKS",
  "blurb": "Paine's answer to Burke: the founding's principles defended for the French Revolution."
 },
 {
  "id": "britannica-1911-bee",
  "title": "Bee (1911 Encyclopaedia Britannica article)",
  "creator": "Encyclopaedia Britannica",
  "year": 1911,
  "collection": "REFERENCE",
  "blurb": "The article “Bee” from the 1911 Encyclopaedia Britannica (Volume 3) is a full survey of the bee family and of bee-keeping, written by George Herbert Carpenter and William Broughton Carr. It covers the whole bee family, not only the hive bee: how bees are built, how they feed, and how they raise…"
 },
 {
  "id": "einstein-relativity-lawson-1920",
  "title": "Relativity: The Special and General Theory",
  "creator": "Albert Einstein (Robert W. Lawson, trans.)",
  "year": 1920,
  "collection": "BOOKS",
  "blurb": "Albert Einstein wrote Relativity himself to explain his theories to general readers. Robert W. Lawson's English translation appeared in 1920. The book covers both the special theory and the general theory in plain stages. Einstein uses trains, clocks, and falling lifts as his teaching tools.…"
 },
 {
  "id": "principle-of-relativity-1923",
  "title": "The Principle of Relativity: A Collection of Original Memoirs",
  "creator": "H. A. Lorentz, A. Einstein, H. Minkowski, H. Weyl (W. Perrett and G. B. Jeffery, trans.)",
  "year": 1923,
  "collection": "BOOKS",
  "blurb": "Methuen issued The Principle of Relativity in 1923, in W. Perrett and G. B. Jeffery's translation. Inside stand the primary papers of relativity by its makers. H. A. Lorentz and Albert Einstein represent the theory's first steps. H. Minkowski contributes Space and Time, his famed address on the new…"
 },
 {
  "id": "russell-abc-relativity-1925",
  "title": "The ABC of Relativity",
  "creator": "Bertrand Russell",
  "year": 1925,
  "collection": "BOOKS",
  "blurb": "The ABC of Relativity, published in 1925, is Russell's popular account of Einstein's special and general relativity. Einstein had remade physics, and the public needed a guide who could write clearly. Russell, a philosopher of mathematics, took the task. He explains why events called simultaneous…"
 },
 {
  "id": "govdocs-nsarchive-Briefing_Book_chile_The_Pinochet_Dictatorship_Declassified_Confessions_of_a",
  "title": "The Pinochet Dictatorship Declassified: Confessions of a DINA Hit Man",
  "creator": "National Security Archive",
  "year": null,
  "collection": "DECLASSIFIED",
  "blurb": "Michael Townley was an American operative who worked for DINA, the secret police of Chile's Pinochet dictatorship. His papers and confessions form the core of this briefing book, number 847, published in November 2023. Peter Kornbluh and John Dinges edited it for the fiftieth anniversary of DINA's…"
 },
 {
  "id": "britannica-1911-volcano",
  "title": "Volcano (1911 Encyclopaedia Britannica article)",
  "creator": "Encyclopaedia Britannica",
  "year": 1911,
  "collection": "REFERENCE",
  "blurb": "Volcano is an opening in the crust of the earth through which heated matter rises. A 1911 Britannica entry notes that the flow most often builds a cone shaped hill. A hollow crater crowns that hill in the common picture men hold of it. The hill is not the core of the process, the entry is careful…"
 }
];

// --- Rotation ---------------------------------------------------------------

const DAY_MS = 24 * 3600 * 1000;

export function dayIndexFor(date) {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS
  );
}

export function dateForDayIndex(dayIndex) {
  return new Date(dayIndex * DAY_MS);
}

export function isoForDayIndex(dayIndex) {
  return dateForDayIndex(dayIndex).toISOString().slice(0, 10);
}

// Parse a strict YYYY-MM-DD into a day index, or null when malformed
// or not a real calendar date.
export function dayIndexForIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const idx = Math.floor(Date.UTC(y, mo - 1, d) / DAY_MS);
  return isoForDayIndex(idx) === iso ? idx : null;
}

export function pickForDayIndex(dayIndex) {
  const n = STACKS.length;
  return STACKS[((dayIndex % n) + n) % n];
}

function longDate(dayIndex) {
  return dateForDayIndex(dayIndex).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function byline(w) {
  const parts = [];
  if (w.creator) parts.push(w.creator);
  if (w.year) parts.push(String(w.year));
  if (w.collection) parts.push(w.collection.charAt(0) + w.collection.slice(1).toLowerCase());
  return parts.join(" · ");
}

// --- Feeds ------------------------------------------------------------------

// The last `count` days of picks, newest first — today's pick leads.
export function feedItems(count = 30) {
  const today = dayIndexFor(new Date());
  const items = [];
  for (let i = 0; i < count; i++) {
    const dayIndex = today - i;
    items.push({ dayIndex, iso: isoForDayIndex(dayIndex), work: pickForDayIndex(dayIndex) });
  }
  return items;
}

function featureUrl(iso) {
  return `${SITE}${TEXT_OF_THE_DAY_PATH}?date=${iso}`;
}

export function renderRssFeed() {
  const items = feedItems(30)
    .map(({ dayIndex, iso, work }) => {
      const link = featureUrl(iso);
      const desc = [byline(work), work.blurb].filter(Boolean).join(" — ");
      return (
        `  <item>\n` +
        `    <title>${escapeXml(work.title)}</title>\n` +
        `    <link>${escapeXml(link)}</link>\n` +
        `    <guid isPermaLink="true">${escapeXml(link)}</guid>\n` +
        `    <pubDate>${dateForDayIndex(dayIndex).toUTCString()}</pubDate>\n` +
        (work.collection ? `    <category>${escapeXml(work.collection)}</category>\n` : "") +
        `    <description>${escapeXml(desc)}</description>\n` +
        `  </item>`
      );
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `<channel>\n` +
    `  <title>${escapeXml(FEED_TITLE)}</title>\n` +
    `  <link>${SITE}${TEXT_OF_THE_DAY_PATH}</link>\n` +
    `  <atom:link href="${SITE}${RSS_PATH}" rel="self" type="application/rss+xml" />\n` +
    `  <description>${escapeXml(FEED_DESCRIPTION)}</description>\n` +
    `  <language>en</language>\n` +
    `  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n` +
    `${items}\n` +
    `</channel>\n</rss>\n`
  );
}

export function renderAtomFeed() {
  const items = feedItems(30)
    .map(({ dayIndex, iso, work }) => {
      const link = featureUrl(iso);
      const summary = [byline(work), work.blurb].filter(Boolean).join(" — ");
      return (
        `  <entry>\n` +
        `    <title>${escapeXml(work.title)}</title>\n` +
        `    <link rel="alternate" href="${escapeXml(link)}" />\n` +
        `    <link rel="related" href="${escapeXml(entryUrl(work.id))}" />\n` +
        `    <id>${escapeXml(link)}</id>\n` +
        `    <published>${iso}T00:00:00Z</published>\n` +
        `    <updated>${iso}T00:00:00Z</updated>\n` +
        (work.creator ? `    <author><name>${escapeXml(work.creator)}</name></author>\n` : "") +
        (work.collection ? `    <category term="${escapeXml(work.collection)}" />\n` : "") +
        `    <summary>${escapeXml(summary)}</summary>\n` +
        `  </entry>`
      );
    })
    .join("\n");
  const todayIso = isoForDayIndex(dayIndexFor(new Date()));
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<feed xmlns="http://www.w3.org/2005/Atom">\n` +
    `  <title>${escapeXml(FEED_TITLE)}</title>\n` +
    `  <link rel="alternate" href="${SITE}${TEXT_OF_THE_DAY_PATH}" />\n` +
    `  <link rel="self" href="${SITE}${ATOM_PATH}" />\n` +
    `  <id>${SITE}${ATOM_PATH}</id>\n` +
    `  <updated>${todayIso}T00:00:00Z</updated>\n` +
    `  <subtitle>${escapeXml(FEED_DESCRIPTION)}</subtitle>\n` +
    `${items}\n` +
    `</feed>\n`
  );
}

export async function serveFeed(context, kind) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const body = kind === "atom" ? renderAtomFeed() : renderRssFeed();
  const res = new Response(body, {
    status: 200,
    headers: {
      "Content-Type":
        kind === "atom"
          ? "application/atom+xml; charset=utf-8"
          : "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
  context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
}

// --- Text of the Day page -----------------------------------------------------

function shell({ path, title, description, jsonLd, body }) {
  const canonical = SITE + path;
  const desc = String(description || "").slice(0, 160);
  const ld = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${canonical}" />
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(FEED_TITLE)}" href="${RSS_PATH}" />
<link rel="alternate" type="application/atom+xml" title="${escapeHtml(FEED_TITLE)}" href="${ATOM_PATH}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:url" content="${canonical}" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<script type="application/ld+json">
${ld}
</script>
${ADS_SCRIPT}
<style>
body { font-family: Georgia, "Times New Roman", serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; line-height: 1.65; color: #191919; }
h1 { line-height: 1.15; } h2 { margin-top: 2rem; }
nav a, footer a { color: #0f5d75; }
</style>
</head>
<body>
${NAV}
<main>
${body}
</main>
${FOOT}
</body>
</html>
`;
}

// Render the page for one day index. `today` is the current day index,
// used to suppress the "next day" link and the "today" framing.
export function renderTextOfTheDayPage(dayIndex, today) {
  const work = pickForDayIndex(dayIndex);
  const iso = isoForDayIndex(dayIndex);
  const isToday = dayIndex === today;
  const entry = entryUrl(work.id);
  const line = byline(work);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: `Text of the Day — ${longDate(dayIndex)}`,
        url: SITE + TEXT_OF_THE_DAY_PATH,
        mainEntity: {
          "@type": "CreativeWork",
          name: work.title,
          ...(work.creator ? { author: { "@type": "Person", name: work.creator } } : {}),
          ...(work.year ? { datePublished: String(work.year) } : {}),
          url: entry,
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Antarctic Labs", item: SITE + "/" },
          { "@type": "ListItem", position: 2, name: "Tower of Babel", item: SITE + "/tower-of-babel" },
          { "@type": "ListItem", position: 3, name: "Text of the Day", item: SITE + TEXT_OF_THE_DAY_PATH },
        ],
      },
    ],
  };
  const prevIso = isoForDayIndex(dayIndex - 1);
  const nextIso = isoForDayIndex(dayIndex + 1);
  const dayNav =
    `<p>` +
    `<a href="${TEXT_OF_THE_DAY_PATH}?date=${prevIso}">← ${longDate(dayIndex - 1)}</a>` +
    (isToday ? "" : ` · <a href="${TEXT_OF_THE_DAY_PATH}">Today</a>`) +
    (dayIndex < today
      ? ` · <a href="${TEXT_OF_THE_DAY_PATH}?date=${nextIso}">${longDate(dayIndex + 1)} →</a>`
      : "") +
    `</p>`;
  const body = `<h1>Text of the Day</h1>
<p>${isToday ? "Today, " : "On "}${longDate(dayIndex)}, from the stacks of the Tower of Babel:</p>
<h2><a href="${entry}">${escapeHtml(work.title)}</a></h2>
${line ? `<p>${escapeHtml(line)}</p>\n` : ""}<p>${escapeHtml(work.blurb)}</p>
<p><a href="${entry}">Read it free in the library →</a></p>
<h2>From the Stacks</h2>
<p>Every day this page features one work from the library's shelves — a classic book, a founding document, a landmark paper, a declassified record, a reference article — chosen in a fixed rotation through a shelf of ${STACKS.length} notable works, the same for every visitor, all day. It is a rotation of what the library already holds, not a list of new additions.</p>
<p>Follow it in a feed reader: <a href="${RSS_PATH}">RSS</a> · <a href="${ATOM_PATH}">Atom</a>. Or browse the whole library: <a href="/tower-of-babel/library">2,557,924 works, free to read</a>.</p>
${dayNav}`;
  return shell({
    path: TEXT_OF_THE_DAY_PATH,
    title: isToday
      ? `Text of the Day — ${work.title} | Tower of Babel`
      : `Text of the Day, ${longDate(dayIndex)} — ${work.title} | Tower of Babel`,
    description: `${work.title}${work.creator ? ` by ${work.creator}` : ""} — the Tower of Babel's featured text for ${longDate(dayIndex)}. Read it free, and follow the daily From the Stacks feed.`,
    jsonLd,
    body,
  });
}

// Serve the page with an edge lifetime that ends at the next UTC
// midnight, so the rotation turns over on the day boundary everywhere.
export async function serveTextOfTheDay(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const now = new Date();
  const today = dayIndexFor(now);
  const url = new URL(context.request.url);
  let dayIndex = today;
  const requested = url.searchParams.get("date");
  if (requested) {
    const parsed = dayIndexForIso(requested);
    if (parsed !== null && parsed <= today) dayIndex = parsed;
  }
  const html = renderTextOfTheDayPage(dayIndex, today);
  const secondsToMidnight = Math.max(
    60,
    Math.floor(((today + 1) * DAY_MS - now.getTime()) / 1000)
  );
  const res = new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": `public, max-age=${Math.min(secondsToMidnight, 86400)}`,
    },
  });
  context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
}
