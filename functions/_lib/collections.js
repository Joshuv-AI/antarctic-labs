// Crawlable collection landing pages for the Tower of Babel
// (2026-11-11 discoverability fix).
//
// One server-rendered page per catalog collection under
// /tower-of-babel/collections/<slug>, plus an index at
// /tower-of-babel/collections. These are doorways with substance, built
// only from real data: the live per-collection counts come from the
// published tower-hubs-index.json, and every entry link is a real
// catalog record sampled from the catalog itself (the bootstrap prefix
// first, then a bounded walk over catalog shards), rotating daily by a
// deterministic seed so the link set changes without any publish step.
//
// Why this exists: until now the catalog's collections existed only as a
// filter inside the client-side library app. A crawler walking the site
// could reach individual entries only through the sitemap files — the
// Tower landing's static render listed the collections as plain text
// with no links at all. These pages give crawlers (and readers without
// JavaScript) a walkable path: landing -> collections -> entries.
//
// This is a NEW path, deliberately not /tower-of-babel/hubs: the old
// hub pages were deleted 2026-10-24 by user order with hard-404
// interceptors left in their place, and they stay deleted.
//
// Copy guardrails (standing): counts are the catalog's real counts as
// of the hub index's snapshot date, stated as such; text availability
// is always "where text is present"; no uptime or rate-limit claims.

import {
  SITE,
  fetchJsonCached,
  hubsIndexUrl,
  getBootstrapRecords,
  getShardRecords,
  getShardCount,
  escapeHtml,
  entryPath,
} from "./tower-catalog.js";

export const COLLECTIONS_BASE = "/tower-of-babel/collections";

export const COLLECTIONS = [
  {
    slug: "papers",
    key: "PAPERS",
    name: "Papers",
    blurb:
      "Research papers and preprints from open scholarly sources — arXiv, PubMed Central, PLOS and other open journals — spanning mathematics, physics, computer science, medicine, biology and more. Each paper has its own catalog record, and the full text is served as a plain text file where text is present.",
  },
  {
    slug: "law",
    key: "LAW",
    name: "Law",
    blurb:
      "United States law and public legal records: the United States Code, the Federal Register, and historic legal texts preserved alongside them. Each record carries its text where text is present.",
  },
  {
    slug: "books",
    key: "BOOKS",
    name: "Books",
    blurb:
      "Public-domain books: classic literature, philosophy, history and foundational documents, together with the sacred texts of the world's traditions — the library's Sacred Texts shelf is drawn from this collection. Read in the browser, or download the plain text where text is present.",
  },
  {
    slug: "reference",
    key: "REFERENCE",
    name: "Reference",
    blurb:
      "Dictionaries, encyclopedias and lexicons kept for lookup: Johnson's Dictionary of the English Language (1755), the Hastings Dictionary of the Bible, the Liddell–Scott Greek lexicon, gazetteers and encyclopedic works.",
  },
  {
    slug: "declassified",
    key: "DECLASSIFIED",
    name: "Declassified",
    blurb:
      "Government documents released into the public record: CIA releases, the Foreign Relations of the United States (FRUS) series, FBI files and National Security Archive publications.",
  },
  {
    slug: "documents",
    key: "DOCUMENTS",
    name: "Documents",
    blurb:
      "Founding and historic documents — the Declaration of Independence, the Constitution of the United States and other primary documents — preserved as catalog records with their texts.",
  },
  {
    slug: "podcasts",
    key: "PODCASTS",
    name: "Podcasts",
    blurb:
      "Podcast episodes preserved in the library as catalog records, each with a predictable text URL where a transcript is present.",
  },
];

export function collectionBySlug(slug) {
  return COLLECTIONS.find((c) => c.slug === slug) || null;
}

const fmt = (n) => Number(n || 0).toLocaleString("en-US");

// --- Data ---------------------------------------------------------------

// { total, collections: {KEY: count}, snapshotDate } from the published
// hub index — the same figures the site's own surfaces state.
async function getCounts() {
  const d = await fetchJsonCached(hubsIndexUrl, 3600);
  if (!d || !d.collections) return null;
  return {
    total: d.total || 0,
    collections: d.collections,
    snapshotDate: d.snapshotDate || null,
  };
}

// Deterministic daily seed: the sampled link sets rotate once a day
// (UTC) with no publish step and no randomness, so a page is stable
// within its edge-cache lifetime and fresh across days.
function daySeed() {
  return Math.floor(Date.now() / 86400000);
}
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

const SAMPLE_WANT = 48;
const SAMPLE_MAX_SHARD_FETCHES = 8;

// A deterministic daily sample of REAL records from one collection.
// Sources, in order: the catalog bootstrap (the catalog's first 20,000
// records — it alone covers six of the seven collections with hundreds
// to thousands of records each), then a bounded walk over catalog
// shards. LAW has no records in the bootstrap prefix, so its walk
// starts in the catalog's tail shards, where the US-law harvest landed
// (verified 2026-11-11: the last shard is entirely uslaw-* records and
// the tail region is law-dense). Every returned record comes straight
// from the catalog, so every link resolves to a real entry page.
export async function sampleCollectionEntries(meta, seed) {
  const seen = new Map();
  const add = (r) => {
    if (r && r.artifact_id && r.collection === meta.key && !seen.has(r.artifact_id)) {
      seen.set(r.artifact_id, {
        id: r.artifact_id,
        title: r.title || r.artifact_id,
        creator: r.creator || "",
        year: r.year || "",
      });
    }
  };

  const boot = await getBootstrapRecords();
  if (boot) for (const r of boot) add(r);

  if (seen.size < SAMPLE_WANT) {
    const count = await getShardCount();
    if (count > 1) {
      const isLaw = meta.key === "LAW";
      const start = isLaw
        ? count - 1 - (seed % Math.min(32, count))
        : (hashStr(meta.key) + seed) % count;
      for (let k = 0; k < SAMPLE_MAX_SHARD_FETCHES && seen.size < SAMPLE_WANT; k++) {
        const idx = isLaw ? start - k : (start + k) % count;
        if (idx < 0) break;
        const records = await getShardRecords(idx);
        if (records) for (const r of records) add(r);
      }
    }
  }

  const all = [...seen.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!all.length) return [];
  const off = seed % all.length;
  const picked = [];
  for (let i = 0; i < Math.min(SAMPLE_WANT, all.length); i++) {
    picked.push(all[(off + i) % all.length]);
  }
  picked.sort((a, b) =>
    String(a.title).localeCompare(String(b.title), "en", { sensitivity: "base" })
  );
  return picked;
}

// --- Rendering ------------------------------------------------------------
// Shell mirrors functions/_lib/static-pages.js (the site's other
// server-rendered content pages): same typography, same nav/footer
// furniture, same AdSense loader, canonical on the apex domain.

const ADS_SCRIPT =
  '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9404729840269984" crossorigin="anonymous"></script>';

const NAV = `<header>
<nav>
<a href="/">Antarctic Labs</a> ·
<a href="/tower-of-babel">Tower of Babel</a> ·
<a href="/tower-of-babel/library">Library</a> ·
<a href="/about">About</a> ·
<a href="/privacy">Privacy Policy</a>
</nav>
</header>`;

const FOOT = `<footer>
<p><a href="/">Antarctic Labs</a> · <a href="/tower-of-babel">Tower of Babel</a> · <a href="/tower-of-babel/library">Library</a> · <a href="/about">About</a> · <a href="/government-contracting">Government Contracting</a> · <a href="/tower-of-babel/donate">Donate</a> · <a href="/privacy">Privacy Policy</a></p>
<p>Contact: <a href="mailto:hello@antarctic-labs.com">hello@antarctic-labs.com</a></p>
<p><a href="https://www.google.com/preferences/source?q=antarctic-labs.com" target="_blank" rel="noopener">Add Antarctic Labs as a preferred source on Google</a></p>
<p>© 2026 Antarctic Labs. All rights reserved.</p>
</footer>`;

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

function breadcrumbJsonLd(crumbs) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: SITE + c.path,
    })),
  };
}

function otherCollectionsNav(currentSlug) {
  const items = COLLECTIONS.filter((c) => c.slug !== currentSlug)
    .map((c) => `<li><a href="${COLLECTIONS_BASE}/${c.slug}">${escapeHtml(c.name)}</a></li>`)
    .join("\n");
  return `<h2>Other collections</h2>
<ul>
${items}
</ul>
<p><a href="${COLLECTIONS_BASE}">All collections</a> · <a href="/tower-of-babel/library">Browse the full library</a></p>`;
}

export async function renderCollectionPage(meta) {
  const counts = await getCounts();
  if (!counts) return null;
  const seed = daySeed();
  const entries = await sampleCollectionEntries(meta, seed);
  const count = counts.collections[meta.key] || 0;
  const path = `${COLLECTIONS_BASE}/${meta.slug}`;
  const snapshotNote = counts.snapshotDate
    ? `Counted ${counts.snapshotDate}; the catalog grows as new holdings are added.`
    : "The catalog grows as new holdings are added.";

  const list = entries.length
    ? `<ul>\n${entries
        .map(
          (r) =>
            `<li><a href="${entryPath(r.id)}">${escapeHtml(r.title)}</a>${
              r.creator ? ` — ${escapeHtml(r.creator)}` : ""
            }${r.year ? ` (${escapeHtml(r.year)})` : ""}</li>`
        )
        .join("\n")}\n</ul>`
    : "<p>No works are listed for this collection yet.</p>";

  const body = `<h1>${escapeHtml(meta.name)}</h1>
<p>${escapeHtml(meta.blurb)}</p>
<p>This collection holds ${fmt(count)} of the library's ${fmt(counts.total)} catalog records. ${snapshotNote}</p>
<h2>Works in this collection</h2>
<p>A selection of real works from the ${escapeHtml(meta.name)} collection — the selection rotates daily. Every link opens that work's own catalog page; the full collection is searchable in the <a href="/tower-of-babel/library">library</a>.</p>
${list}
${otherCollectionsNav(meta.slug)}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: `${meta.name} | Tower of Babel`,
        url: SITE + path,
        description: meta.blurb,
        isPartOf: { "@type": "WebSite", name: "Antarctic Labs", url: SITE + "/" },
      },
      breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Tower of Babel", path: "/tower-of-babel" },
        { name: "Collections", path: COLLECTIONS_BASE },
        { name: meta.name, path },
      ]),
      {
        "@type": "ItemList",
        name: `Works in the ${meta.name} collection`,
        numberOfItems: entries.length,
        itemListElement: entries.map((r, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: SITE + entryPath(r.id),
          name: r.title,
        })),
      },
    ],
  };

  return shell({
    path,
    title: `${meta.name} | Tower of Babel`,
    description: `${meta.name} in the Tower of Babel library: ${fmt(count)} works. ${meta.blurb}`,
    jsonLd,
    body,
  });
}

export async function renderCollectionsIndex() {
  const counts = await getCounts();
  if (!counts) return null;
  const path = COLLECTIONS_BASE;
  const cards = COLLECTIONS.map((c) => {
    const n = counts.collections[c.key] || 0;
    return `<h2><a href="${path}/${c.slug}">${escapeHtml(c.name)}</a></h2>
<p>${fmt(n)} works. ${escapeHtml(c.blurb)}</p>`;
  }).join("\n");
  const snapshotNote = counts.snapshotDate
    ? `Counts as of ${counts.snapshotDate}; the catalog grows as new holdings are added.`
    : "The catalog grows as new holdings are added.";

  const body = `<h1>Collections</h1>
<p>The Tower of Babel is organised into seven collections, holding ${fmt(counts.total)} catalog records between them. ${snapshotNote} Each collection page below lists real works from that collection, and every work links to its own catalog page.</p>
${cards}
<p><a href="/tower-of-babel/library">Browse the full library</a> · <a href="/tower-of-babel">Tower of Babel</a></p>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "Collections | Tower of Babel",
        url: SITE + path,
        isPartOf: { "@type": "WebSite", name: "Antarctic Labs", url: SITE + "/" },
      },
      breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Tower of Babel", path: "/tower-of-babel" },
        { name: "Collections", path },
      ]),
      {
        "@type": "ItemList",
        name: "Tower of Babel collections",
        numberOfItems: COLLECTIONS.length,
        itemListElement: COLLECTIONS.map((c, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: SITE + path + "/" + c.slug,
          name: c.name,
        })),
      },
    ],
  };

  return shell({
    path,
    title: "Collections | Tower of Babel",
    description: `The seven collections of the Tower of Babel library — ${fmt(counts.total)} works, free to read: papers, law, books, reference, declassified documents, documents and podcasts.`,
    jsonLd,
    body,
  });
}

// Edge-cache + return a rendered collection page (same pattern as the
// Phase 1 entry pages and the retired hub pages): check the cache
// first, render on a miss, cache the render for a day — the lifetime
// that matches the daily sample rotation.
export async function serveCollectionPage(context, render) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const html = await render();
  if (!html) {
    return new Response("Collection data is temporarily unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "300" },
    });
  }
  const res = new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
  context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
}
