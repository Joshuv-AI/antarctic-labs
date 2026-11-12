// Server-rendered Tower of Babel entry pages for crawlers.
//
// Route: /tower-of-babel/library/<artifact_id>
//
// Human visitors get the React SPA exactly as before: for any user agent
// that is not a known search/AI crawler this function immediately returns
// context.next(), so the browser path gains nothing but one cheap regex
// test against the user-agent header.
//
// Crawlers (Googlebot, Bingbot, OAI-SearchBot, PerplexityBot,
// Claude-SearchBot, CCBot, Meta-WebIndexer, … — see _lib/tower-catalog.js)
// receive a complete static HTML record: answer-first summary, the
// bibliographic metadata table, the entry description, a Book JSON-LD node
// mirroring src/seo.js, Google Scholar citation_* meta tags built from the
// record's own fields, and a direct link to the plain-text file where the
// record carries one. Most AI crawlers never execute JavaScript, so
// without this the 375k+ entries are invisible to them.
//
// Copy guardrails (standing): catalog metadata can be stale and
// download_status is NOT reliable — this page only states what the record
// itself carries, links the text file at its predictable URL "where text
// is present", and never claims every record has full text, stable URLs,
// no throttling, or any uptime.
//
// Responses are cached in the edge cache for 7 days per entry; the first
// crawler to ask pays the catalog lookup, everyone after gets the cached
// page. Unknown ids (verified absent from the shard manifest) get a real
// 404; any data failure falls back to the SPA rather than erroring.

import {
  SITE,
  escapeHtml,
  getDescriptionOverride,
  getRecordById,
  isCrawler,
  textFileUrl,
  entryUrl,
} from "../../_lib/tower-catalog.js";

const CACHE_TTL_SECONDS = 7 * 24 * 3600;

function metaDescriptionFor(record, description) {
  // Mirrors metaFor() in src/content/routes.js for the entry route.
  const suffix = " — free in the Tower of Babel online library.";
  const maxBlurb = 160 - suffix.length;
  let blurb = description || "Preserved in clean, searchable text.";
  if (blurb.length > maxBlurb) {
    blurb = blurb.slice(0, maxBlurb - 3).trimEnd() + "...";
  }
  return blurb + suffix;
}

function bookJsonLd(record, description, canonical) {
  // Mirrors the Book + BreadcrumbList graph src/seo.js builds client-side,
  // extended only with fields the record itself carries.
  const crumb = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "HOME", item: SITE + "/" },
      {
        "@type": "ListItem",
        position: 2,
        name: "TOWER OF BABEL",
        item: SITE + "/tower-of-babel",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "LIBRARY",
        item: SITE + "/tower-of-babel/library",
      },
      {
        "@type": "ListItem",
        position: 4,
        name: String(record.title ?? "ENTRY").toUpperCase(),
        item: canonical,
      },
    ],
  };
  const book = {
    "@type": "Book",
    "@id": canonical + "#book",
    name: record.title,
    url: canonical,
  };
  if (record.creator) {
    book.author = { "@type": "Person", name: record.creator };
  }
  if (record.year) book.datePublished = String(record.year);
  if (description) book.description = description;
  if (record.language) book.inLanguage = String(record.language);
  if (record.version) book.bookEdition = String(record.version);
  const txt = textFileUrl(record);
  if (txt) {
    book.potentialAction = {
      "@type": "ReadAction",
      target: txt,
    };
  }
  return { "@context": "https://schema.org", "@graph": [crumb, book] };
}

// Google Scholar (Highwire Press) citation meta tags. Scholar's ingestion
// parser reads citation_* tags, not the Book JSON-LD below; without them
// the PAPERS collection is invisible to Scholar's preferred ingestion
// path (2026-11-11 discoverability audit, gap 2). Every value comes from
// the record's own metadata — a tag is omitted when the record carries
// no such field, and nothing is derived or invented:
// - citation_title: the record title.
// - citation_author: the record's creator field as-is. The catalog stores
//   creators as one string (often several names comma-joined); it is
//   emitted once, unsplit — author lists are never fabricated. Only a
//   creator that is genuinely an array yields one tag per element.
// - citation_publication_date: Scholar format — "YYYY" for a year-only
//   record, "YYYY/MM/DD" when the record carries a full date. Emitted
//   only when a plausible 4-digit year can be read from the record.
// - citation_pdf_url: the record's full-text URL (textFileUrl) where the
//   record carries one. The tag name is Scholar's; our full text is a
//   .txt file, which is the correct ingestion pointer regardless.
// - Journal/volume/issue/page/DOI/ISSN tags only when the record
//   genuinely carries those fields (none do in the current catalog
//   schema; the mapping exists so a future field lands without a
//   template change).
function scholarDate(record) {
  const candidates = [
    record.date,
    record.publication_date,
    record.published_date,
    record.year,
  ];
  for (const raw of candidates) {
    if (raw === undefined || raw === null || raw === "") continue;
    const s = String(raw).trim();
    const full = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (full) {
      return `${full[1]}/${full[2].padStart(2, "0")}/${full[3].padStart(
        2,
        "0"
      )}`;
    }
    const yearOnly = s.match(/^(\d{4})/);
    if (yearOnly) {
      const y = Number(yearOnly[1]);
      if (y >= 1000 && y <= 2100) return yearOnly[1];
    }
  }
  return null;
}

function scholarMetaTags(record, txt) {
  const tags = [];
  const add = (name, value) => {
    if (value === undefined || value === null || value === "") return;
    tags.push(
      `<meta name="${name}" content="${escapeHtml(String(value))}" />`
    );
  };
  add("citation_title", record.title);
  if (Array.isArray(record.creator)) {
    for (const a of record.creator) add("citation_author", a);
  } else {
    add("citation_author", record.creator);
  }
  add("citation_publication_date", scholarDate(record));
  add("citation_pdf_url", txt);
  add("citation_journal_title", record.journal_title ?? record.journal);
  add("citation_volume", record.volume);
  add("citation_issue", record.issue);
  add("citation_firstpage", record.firstpage ?? record.first_page);
  add("citation_lastpage", record.lastpage ?? record.last_page);
  add("citation_doi", record.doi);
  add("citation_issn", record.issn);
  return tags.length ? tags.join("\n") + "\n" : "";
}

function renderEntryHtml(record, description) {
  const canonical = entryUrl(record.artifact_id);
  const title = `${record.title} — Read Free | Tower of Babel`;
  const metaDesc = metaDescriptionFor(record, description);
  const txt = textFileUrl(record);
  const byline = [record.creator, record.year]
    .filter((v) => v !== undefined && v !== null && v !== "")
    .join(" · ");

  const rows = [
    ["CREATOR", record.creator],
    ["YEAR", record.year],
    ["COLLECTION", record.collection],
    ["FORMAT", record.format],
    ["FILE SIZE", record.file_size],
    ["VERSION", record.version],
    ["LICENSE", record.license],
    [
      "RIGHTS",
      record.rights_status && String(record.rights_status).replace(/_/g, " "),
    ],
    ["SOURCE", record.source],
  ].filter(([, v]) => v !== undefined && v !== null && v !== "");

  const descParas = (description || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const jsonLd = bookJsonLd(record, description, canonical);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(metaDesc)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${escapeHtml(canonical)}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(metaDesc)}" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(metaDesc)}" />
${scholarMetaTags(record, txt)}<script type="application/ld+json">${JSON.stringify(jsonLd).replace(
    /</g,
    "\\u003c"
  )}</script>
</head>
<body>
<nav aria-label="Breadcrumb">
<a href="/">Antarctic Labs</a> /
<a href="/tower-of-babel">Tower of Babel</a> /
<a href="/tower-of-babel/library">Library</a>
</nav>
<main>
<h1>${escapeHtml(record.title)}</h1>
${byline ? `<p>${escapeHtml(byline)}</p>` : ""}
<p>Read <em>${escapeHtml(record.title)}</em>${
    record.creator ? ` by ${escapeHtml(record.creator)}` : ""
  }${
    record.year ? ` (${escapeHtml(record.year)})` : ""
  } in the Tower of Babel, a free online library of public-domain works preserved in clean, searchable text. No sign-up.${
    txt
      ? ` The full text is served as a plain-text file at a predictable URL, where text is present: <a href="${escapeHtml(
          txt
        )}">${escapeHtml(txt)}</a>.`
      : ""
  }</p>
${
  descParas.length
    ? `<section>
<h2>Description</h2>
${descParas.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
</section>`
    : ""
}
<section>
<h2>Catalog record</h2>
<table>
${rows
  .map(
    ([label, value]) =>
      `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(
        value
      )}</td></tr>`
  )
  .join("\n")}
</table>
${
  record.source_url
    ? `<p>Source: <a href="${escapeHtml(
        record.source_url
      )}" rel="noopener noreferrer">${escapeHtml(record.source_url)}</a></p>`
    : ""
}
</section>
<p><a href="/tower-of-babel/library">Browse the full library</a> · <a href="/tower-of-babel">About the Tower of Babel</a></p>
</main>
</body>
</html>
`;
}

function notFoundHtml(id) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Unknown Artifact | Tower of Babel</title>
<meta name="robots" content="noindex, follow" />
<link rel="canonical" href="${SITE}/tower-of-babel/library" />
</head>
<body>
<main>
<h1>UNKNOWN ARTIFACT</h1>
<p>No artifact record exists for this id (${escapeHtml(id)}).</p>
<p><a href="/tower-of-babel/library">Back to the library</a></p>
</main>
</body>
</html>
`;
}

export async function onRequest(context) {
  const { request, params, next } = context;
  const id = params && params.id ? String(params.id) : "";
  // Literal SPA routes under library/ are not entries.
  if (!id || id === "suggest" || id === "research") return next();
  // Humans (and anything unrecognized) get the SPA, untouched — with one
  // exception (2026-11-03, AdSense fix): an id verified absent from the
  // catalog is a real 404 for everyone, not an error screen served at
  // 200. Any data failure still falls back to the SPA, never an error.
  if (!isCrawler(request)) {
    const foundHuman = await getRecordById(id);
    if (foundHuman.state === "missing") {
      return new Response(notFoundHtml(id), {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
    return next();
  }

  const canonical = entryUrl(id);
  const cache = caches.default;
  const cacheKey = new Request(canonical, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const found = await getRecordById(id);
  if (found.state === "error") {
    // Data unavailable — never error a crawler; the SPA shell is the
    // established fallback for every other failure mode on this site.
    return next();
  }
  if (found.state === "missing") {
    return new Response(notFoundHtml(id), {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const override = await getDescriptionOverride(id);
  const description = override || found.record.description || "";
  const res = new Response(renderEntryHtml(found.record, description), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
}
