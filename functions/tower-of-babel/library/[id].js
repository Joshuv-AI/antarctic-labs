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
import { ID_ALIASES } from "../../_lib/id-aliases.js";
import { relatedLinksHtml } from "../../_lib/demand-pages.js";

const CACHE_TTL_SECONDS = 7 * 24 * 3600;

// Truncate at a word boundary (the pre-2026-11-21 code sliced at a fixed
// offset, cutting descriptions mid-word — VERIFY-REPORT §2/§8).
function truncateBlurb(blurb, max) {
  if (blurb.length <= max) return blurb;
  const cut = blurb.slice(0, max - 3);
  const at = cut.lastIndexOf(" ");
  return (at > 40 ? cut.slice(0, at) : cut).trimEnd() + "...";
}

function metaDescriptionFor(record, description, hasOverride = false) {
  // Mirrors metaFor() in src/content/routes.js for the entry route.
  const suffix = " — free in the Tower of Babel online library.";
  const maxBlurb = 160 - suffix.length;
  // Federal Register entries get a templated meta (below) instead of
  // their record description, which is register body text. An editorial
  // description override, when one exists, always wins.
  const blurb =
    !hasOverride && isFederalRegister(record)
      ? federalRegisterBlurb(record)
      : description || "Preserved in clean, searchable text.";
  return truncateBlurb(blurb, maxBlurb) + suffix;
}

// Federal Register entries (LAW): the record description is the register
// text itself — a one-line generated head followed by the document body
// with its page markers and rule lines — so as a meta description it
// reads as raw register text cut off mid-string (VERIFY-REPORT §4,
// uslaw-fr-2023-24990). This class gets a templated meta built from the
// record's own fields instead: document type, publication date (read
// from the record description's generated head, falling back to the
// record year), the entry title, and the publishing agency.
function isFederalRegister(record) {
  return (
    !!record &&
    (record.source === "Federal Register" ||
      /^uslaw-fr-/.test(String(record.artifact_id || "")))
  );
}

function federalRegisterBlurb(record) {
  const m = String(record.description || "").match(
    /published in the Federal Register on (\d{4}-\d{2}-\d{2})/
  );
  const when = m ? m[1] : record.year ? String(record.year) : "";
  const agency = cleanCreator(record.creator);
  let s = "Federal Register document";
  if (when) s += ` published ${when}`;
  s += `: ${record.title}`;
  if (agency) s += ` (${agency})`;
  return s + ".";
}

// --- Creator hygiene (2026-11-21, growth program) -----------------------
// Catalog creator strings are harvested source metadata: author lists
// arrive as one comma-joined string, and harvesting preserved credential
// fragments as if they were authors — the sampled record for
// arxiv-2511-11026 carries "Adel Bechihi, Member, IEEE, Aristotelis
// Kapnopoulos" (VERIFY-REPORT §4). The render layer drops segments that
// are purely a credential or honorific; names themselves are never
// altered, added to, or reordered, separators are preserved, and the
// catalog data itself is untouched.
const CREDENTIAL_SEGMENT =
  /^(member|senior member|fellow|life member|life fellow|student member|ieee|acm|siam|aaas|ph\.?d\.?|m\.?d\.?|d\.?sc\.?|sc\.?d\.?|dr\.?|prof\.?)$/i;

function cleanCreator(raw) {
  if (Array.isArray(raw)) {
    const parts = raw.map((v) => cleanCreator(v)).filter(Boolean);
    return parts.length ? parts.join(", ") : raw.join(", ");
  }
  if (raw === undefined || raw === null || raw === "") return raw;
  const s = String(raw);
  const parts = s.split(/(\s*[,;]\s*)/);
  let out = "";
  for (let i = 0; i < parts.length; i += 2) {
    const seg = (parts[i] || "").trim();
    if (seg && CREDENTIAL_SEGMENT.test(seg)) continue;
    out += parts[i] + (parts[i + 1] || "");
  }
  out = out.replace(/^[\s,;]+/, "").replace(/[\s,;]+$/, "").trim();
  return out || s;
}

// One citation_author value per author for PAPERS records: Scholar's
// inclusion guidelines ask for one tag per author, and the PAPERS
// catalog stores arXiv-style "First Last, First Last" lists (verified
// against the arXiv API in the verification lane), so the cleaned string
// splits on its own list separators. Other collections keep a single tag
// carrying the cleaned creator string — agency and editor lists there
// are not reliably one person per segment, and a wrong split is worse
// than one combined tag.
function scholarAuthors(record) {
  const cleaned = cleanCreator(record.creator);
  if (!cleaned) return [];
  if (record.collection !== "PAPERS") return [cleaned];
  return String(cleaned)
    .split(/\s*;\s*|\s*,\s*/)
    .map((seg) => seg.replace(/^and\s+/i, "").trim())
    .filter(
      (seg) =>
        seg && !/^et\.?\s?al\.?$/i.test(seg) && !CREDENTIAL_SEGMENT.test(seg)
    );
}

// Very long titles (the sampled worst case is 158 chars) push the
// rendered <title> to ~185 chars with the template suffix, truncating
// mid-word on every surface that shows it (VERIFY-REPORT §4/§8). Cap the
// title text at a word boundary for the <title> and the H1; the full
// title stays on the page — the intro paragraph and the Book JSON-LD
// both carry it uncapped. When a title is capped, the " — Read Free"
// suffix is dropped (it was invisible past truncation anyway); the
// brand suffix stays.
const TITLE_TEXT_CAP = 120;

function cappedTitle(title) {
  const t = String(title ?? "");
  if (t.length <= TITLE_TEXT_CAP) return { text: t, capped: false };
  const cut = t.slice(0, TITLE_TEXT_CAP - 1);
  const at = cut.lastIndexOf(" ");
  return {
    text: (at > 40 ? cut.slice(0, at) : cut).trimEnd() + "…",
    capped: true,
  };
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
    book.author = { "@type": "Person", name: cleanCreator(record.creator) };
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
// - citation_author: one tag per author for PAPERS records (Scholar's
//   inclusion guidelines ask for one tag per author; the 2026-11-21
//   verification lane flagged the previous single comma-joined tag as a
//   spec deviation). The catalog stores creators as one comma-joined
//   string; for PAPERS those lists are arXiv-style "First Last" names,
//   so the cleaned string (see cleanCreator/scholarAuthors) splits on
//   its own list separators — names are never fabricated, only
//   separated. Other collections emit one tag with the cleaned creator
//   string; a genuinely array-valued creator yields one tag per element.
// - citation_publication_date: Scholar format — "YYYY" for a year-only
//   record, "YYYY/MM/DD" when the record carries a full date. Emitted
//   only when a plausible 4-digit year can be read from the record.
// - citation_pdf_url: NOT emitted (removed 2026-11-21). Scholar's
//   guidelines define this tag as the URL of the paper's PDF; the site
//   serves epub/kindle/html/txt downloads (functions/api/download.js)
//   and has no PDF rendition, so the previous value — the .txt full-text
//   URL — mislabeled the format it pointed at. The tag returns if a
//   real PDF rendition ships; until then the full text stays linked
//   from the page body and the Book JSON-LD ReadAction.
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

function scholarMetaTags(record) {
  const tags = [];
  const add = (name, value) => {
    if (value === undefined || value === null || value === "") return;
    tags.push(
      `<meta name="${name}" content="${escapeHtml(String(value))}" />`
    );
  };
  add("citation_title", record.title);
  for (const a of scholarAuthors(record)) add("citation_author", a);
  add("citation_publication_date", scholarDate(record));
  add("citation_journal_title", record.journal_title ?? record.journal);
  add("citation_volume", record.volume);
  add("citation_issue", record.issue);
  add("citation_firstpage", record.firstpage ?? record.first_page);
  add("citation_lastpage", record.lastpage ?? record.last_page);
  add("citation_doi", record.doi);
  add("citation_issn", record.issn);
  return tags.length ? tags.join("\n") + "\n" : "";
}

// The opening of the work's full text, embedded in the initial HTML
// (2026-11-18, AdSense plan item 1: the review-visible render must
// contain the content, not a link to it). Bounded hard: a Range
// request for the first ~40 KB straight from the texts repo (the same
// origin functions/tower-of-babel/[file].js proxies), trimmed to
// ~1,200 words. Fail-open — any error, non-200/206, or empty body
// renders the page exactly as before, with the text link only. The
// full text itself is never pulled into the isolate (the 2026-11-15
// memory diagnosis is the standing warning against that).
const TEXTS_ORIGIN =
  "https://raw.githubusercontent.com/Joshuv-AI/antarctic-labs-texts/main/public/tower-of-babel/";

async function bucketPrefix(file) {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(file)
  );
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return file[0] + "/" + hex.slice(0, 2) + "/";
}

async function fetchTextOpening(record) {
  const txt = textFileUrl(record);
  if (!txt) return null;
  const file = decodeURIComponent(txt.split("/").pop() || "");
  if (!file || file.includes("/") || file.includes("..")) return null;
  const range = { headers: { Range: "bytes=0-40959" } };
  try {
    let res = await fetch(TEXTS_ORIGIN + (await bucketPrefix(file)) + file, range);
    if (!res.ok && res.status !== 206) {
      res = await fetch(TEXTS_ORIGIN + file, range);
    }
    if (!res.ok && res.status !== 206) return null;
    let text = await res.text();
    if (!text || !text.trim()) return null;
    text = text.replace(/^﻿/, "").replace(/\s+$/, "");
    // Trim to the last complete line inside the byte budget, then to
    // the word cap, so the excerpt never ends mid-word.
    const lastNl = text.lastIndexOf("\n");
    if (lastNl > 2000) text = text.slice(0, lastNl);
    const words = text.split(/\s+/);
    if (words.length > 1200) text = words.slice(0, 1200).join(" ");
    return text;
  } catch {
    return null;
  }
}

const ENTRY_FOOT = `<footer>
<p><a href="/">Antarctic Labs</a> · <a href="/tower-of-babel">Tower of Babel</a> · <a href="/tower-of-babel/library">Library</a> · <a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms</a> · <a href="/rights-and-sources">Rights &amp; Sources</a></p>
</footer>`;

function renderEntryHtml(record, description, opts = {}) {
  const canonical = entryUrl(record.artifact_id);
  const cap = cappedTitle(record.title);
  const title = cap.capped
    ? `${cap.text} | Tower of Babel`
    : `${record.title} — Read Free | Tower of Babel`;
  const metaDesc = metaDescriptionFor(record, description, !!opts.isIntroduction);
  const txt = textFileUrl(record);
  const creator = cleanCreator(record.creator);
  const byline = [creator, record.year]
    .filter((v) => v !== undefined && v !== null && v !== "")
    .join(" · ");

  const rows = [
    ["CREATOR", creator],
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
${scholarMetaTags(record)}<script type="application/ld+json">${JSON.stringify(jsonLd).replace(
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
<h1>${escapeHtml(cap.text)}</h1>
${byline ? `<p>${escapeHtml(byline)}</p>` : ""}
<p>Read <em>${escapeHtml(record.title)}</em>${
    creator ? ` by ${escapeHtml(creator)}` : ""
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
<h2>${opts.isIntroduction ? "Introduction" : "Description"}</h2>
${descParas.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
</section>`
    : ""
}
${relatedLinksHtml(record.artifact_id)}<section>
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
${
  opts.textOpening
    ? `<section>
<h2>Full text</h2>
<p>The opening of the work, from the library's hosted text:</p>
<pre style="white-space: pre-wrap; word-wrap: break-word; font-family: inherit;">${escapeHtml(
        opts.textOpening
      )}</pre>
<p><a href="${escapeHtml(txt)}">Read the complete text</a></p>
</section>`
    : ""
}
</main>
${ENTRY_FOOT}
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

// --- Re-keyed id aliases (2026-11-21, growth program) -------------------
// Catalog rebuilds have re-keyed entries, stranding URLs Google already
// ranked: the CIA document Google recorded as cia-rdp04t00367... was
// re-keyed to cia-crest-cia-rdp04t00367... and the old URL 404'd
// (VERIFY-REPORT §4). When an id resolves to nothing, try the confirmed
// alias table (functions/_lib/id-aliases.js, from the 2026-11-21 churn
// audit) and the systematic re-key patterns the audit found. A candidate
// is used only after getRecordById verifies the record exists under it,
// and a data error never produces a redirect — the caller falls back to
// the plain 404 exactly as before.
function aliasCandidates(id) {
  const out = [];
  if (ID_ALIASES[id]) out.push(ID_ALIASES[id]);
  // CREST re-key: CIA reading-room ids gained a "cia-crest-" prefix in
  // front of the full old id (the whole cia-rdp* class; zero non-CREST
  // cia-rdp* ids remain in the catalog).
  if (id.startsWith("cia-") && !id.startsWith("cia-crest-")) {
    out.push(`cia-crest-${id}`);
  }
  // Gutenberg pg-suffix re-key: early book slugs carried the Gutenberg
  // number as a "-pg<N>" suffix; the rebuild moved it to an "<N>-"
  // prefix (46 confirmed pairs in the churn audit).
  const pg = id.match(/^(.+)-pg(\d+)$/);
  if (pg) out.push(`${pg[2]}-${pg[1]}`);
  return [...new Set(out)].filter((c) => c !== id);
}

async function aliasRedirect(id) {
  for (const cand of aliasCandidates(id)) {
    const found = await getRecordById(cand);
    if (found.state === "error") return null;
    if (found.state === "ok") {
      return new Response(null, {
        status: 301,
        headers: {
          Location: entryUrl(cand),
          "Cache-Control": "public, max-age=86400",
        },
      });
    }
  }
  return null;
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
      const redir = await aliasRedirect(id);
      if (redir) return redir;
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
  let hit = null;
  try {
    hit = await cache.match(cacheKey);
  } catch {
    // A Cache API failure reads as a miss: the render below can still
    // serve the request, and a cache hiccup must never 500 it (the
    // matching cache.put below is already .catch()-guarded).
  }
  if (hit) return hit;

  const found = await getRecordById(id);
  if (found.state === "error") {
    // Data unavailable — never error a crawler; the SPA shell is the
    // established fallback for every other failure mode on this site.
    return next();
  }
  if (found.state === "missing") {
    const redir = await aliasRedirect(id);
    if (redir) return redir;
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
  const textOpening = await fetchTextOpening(found.record);
  const res = new Response(
    renderEntryHtml(found.record, description, {
      isIntroduction: !!override,
      textOpening,
    }),
    {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
}
