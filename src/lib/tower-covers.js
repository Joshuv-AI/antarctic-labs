// Tower of Babel — cover resolution (landing revamp 2026-10-21).
//
// Joshua's rule: a REAL cover wherever one exists; a generated typographic
// tile only as the fallback. Resolution is deterministic from the record
// itself — no API calls, no per-card lookups:
//
//   1. Podcasts  → the episode's YouTube thumbnail (the video id is in
//      source_url and embedded in the artifact_id itself).
//   2. Books from Project Gutenberg → Gutenberg's own cover image for
//      that ebook number (id parsed from source_url / source).
//   3. Records linked to an Internet Archive item → the item's IA image
//      (identifier parsed from an archive.org/details/ source_url).
//
// Components walk the returned list with <img onError> and land on the
// generated tile when the list is exhausted or empty — a card never
// shows a broken image.

export function coverCandidates(a) {
  const urls = [];
  if (!a) return urls;
  const id = a.artifact_id || "";
  const su = a.source_url || "";

  // 1 — YouTube thumbnail for podcast episodes.
  let vid = null;
  const vm = /[?&]v=([\w-]{11})/.exec(su);
  if (vm) vid = vm[1];
  else if (id.startsWith("podcast-")) {
    const pm = /^podcast-[a-z0-9]+-(.+)$/.exec(id);
    if (pm && pm[1].length >= 10) vid = pm[1];
  }
  if (vid) urls.push(`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`);

  // 2 — Project Gutenberg cover for the ebook number.
  let pg = null;
  const gm =
    /gutenberg\.org\/(?:cache\/epub|ebooks|files)\/(\d+)/.exec(su) ||
    /project gutenberg #(\d+)/i.exec(a.source || "");
  if (gm) pg = gm[1];
  if (pg)
    urls.push(
      `https://www.gutenberg.org/cache/epub/${pg}/pg${pg}.cover.medium.jpg`
    );

  // 3 — Internet Archive item image (details, download and stream URLs
  // all carry the identifier in the same path position).
  const im = /archive\.org\/(?:details|download|stream)\/([\w.-]+)/.exec(su);
  if (im) urls.push(`https://archive.org/services/img/${im[1]}`);

  return urls;
}

// Tone (fallback-tile palette family) for a record: podcasts carry their
// own thumbnails, so tones key off the collection lane. Sacred books get
// the BOOKS tone; tradition-specific tiles live in the traditions grid,
// which passes its own tone.
export function coverTone(a) {
  switch ((a && a.collection) || "") {
    case "PAPERS":
      return "papers";
    case "DECLASSIFIED":
      return "declassified";
    case "REFERENCE":
      return "reference";
    case "DOCUMENTS":
      return "documents";
    case "PODCASTS":
      return "podcasts";
    default:
      return "books";
  }
}

// --- Open Library lookup (2026-10-21 cover-gap fix) -----------------------
// The compact catalog index the list page renders from carries no
// source_url, so the deterministic chain above can't fire for most
// records even when a real cover exists. For BOOKS with no deterministic
// candidate, fall back to an Open Library search — accepted only on a
// strict title match (plus surname agreement when both sides name an
// author), so a wrong book's cover never lands on a record. Results are
// cached in localStorage (negatives for 14 days); lookups run through a
// small queue so a grid page never fires fifty requests at once.

const OL_CACHE_KEY = "tower-ol-covers-v1";
const OL_NEG_TTL = 14 * 24 * 3600 * 1000;
const olSession = new Map(); // artifact_id -> Promise<string|null>
let olActive = 0;
const olQueue = [];

// Comparison key for a title: lowercase, parenthetical/bracketed edition
// notes dropped, subtitle after a colon or semicolon dropped, punctuation
// stripped, leading article dropped, and volume/part designations removed
// ("Kalevala, Volume I (of 2)" and "Kalevala" must key alike).
export function titleKey(t) {
  let s = (t || "").toLowerCase();
  s = s.replace(/\[[^\]]*\]|\([^)]*\)/g, " ");
  s = s.split(":")[0].split(";")[0].split(" — ")[0].split(" -- ")[0];
  s = s.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^(the|a|an) /, "");
  s = s
    .replace(/\b(volume|vol|part|book|of|no|number)\b/g, " ")
    .replace(/\b(\d+|i{1,3}|iv|v|vi{1,3}|ix|x)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

function nameTokens(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

// Would this Open Library doc's cover honestly belong to our record?
export function olMatch(ourTitle, ourCreator, doc) {
  if (!doc || !doc.cover_i) return false;
  const ours = titleKey(ourTitle);
  const theirs = titleKey(doc.title || "");
  if (!ours || !theirs) return false;
  const titleOk =
    ours === theirs ||
    (ours.length >= 8 &&
      theirs.length >= 8 &&
      (ours.includes(theirs) || theirs.includes(ours)) &&
      Math.min(ours.length, theirs.length) /
        Math.max(ours.length, theirs.length) >=
        0.75);
  if (!titleOk) return false;
  const ourNames = nameTokens(ourCreator);
  const docNames = (doc.author_name || []).flatMap(nameTokens);
  if (ourNames.length && docNames.length) {
    // Any substantial name-token overlap (surname in either name order,
    // "Surname, First" or "First Surname") — a same-title book by a
    // different author must not pass.
    if (!ourNames.some((n) => docNames.includes(n))) return false;
  }
  return true;
}

async function olFetch(a) {
  // Query with a SHORT, clean title: edition parentheticals dropped,
  // subtitle cut, volume tail after a comma dropped when long. Open
  // Library's title search underperforms on long literal titles — and
  // the strict matcher, not the query, is what guards correctness.
  let t = (a.title || "")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .split(":")[0]
    .split(";")[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (t.length > 60 && t.includes(",")) t = t.split(",")[0].trim();
  // Author as a single surname token ("Surname, First" and "First
  // Surname" both reduce to the surname; parenthetical roles dropped).
  const creatorClean = (a.creator || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let author = "";
  if (creatorClean.includes(","))
    author = creatorClean.split(",")[0].trim();
  else {
    const parts = creatorClean.split(" ");
    author = parts[parts.length - 1] || "";
  }
  if (/unknown|various|anonymous/i.test(creatorClean)) author = "";
  const attempt = async (withAuthor) => {
    const qs = new URLSearchParams({
      title: t,
      limit: "5",
      fields: "cover_i,title,author_name",
    });
    if (withAuthor && author.length > 2) qs.set("author", author);
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(`https://openlibrary.org/search.json?${qs}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      const data = await res.json();
      for (const doc of data.docs || []) {
        if (olMatch(a.title, a.creator, doc))
          return `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(to);
    }
  };
  // Author-constrained first; if that finds nothing the matcher accepts,
  // retry title-only (the matcher still enforces author agreement
  // whenever both sides actually name one).
  return (await attempt(true)) || attempt(false);
}

function olPump() {
  while (olActive < 4 && olQueue.length) {
    const { a, resolve } = olQueue.shift();
    olActive++;
    olFetch(a).then((u) => {
      try {
        const raw = window.localStorage.getItem(OL_CACHE_KEY);
        const cache = raw ? JSON.parse(raw) : {};
        cache[a.artifact_id] = { u, t: Date.now() };
        const keys = Object.keys(cache);
        if (keys.length > 600)
          for (const k of keys.slice(0, keys.length - 600)) delete cache[k];
        window.localStorage.setItem(OL_CACHE_KEY, JSON.stringify(cache));
      } catch {
        /* private mode — session cache still applies */
      }
      olActive--;
      resolve(u);
      olPump();
    });
  }
}

// Resolve a real cover URL for a BOOKS record with no deterministic
// candidate, or null. Session- and localStorage-cached.
export function lookupOpenLibraryCover(a) {
  if (!a || a.collection !== "BOOKS") return Promise.resolve(null);
  const id = a.artifact_id;
  if (olSession.has(id)) return olSession.get(id);
  try {
    const raw = window.localStorage.getItem(OL_CACHE_KEY);
    if (raw) {
      const hit = JSON.parse(raw)[id];
      if (hit && (hit.u || Date.now() - hit.t < OL_NEG_TTL)) {
        const p = Promise.resolve(hit.u || null);
        olSession.set(id, p);
        return p;
      }
    }
  } catch {
    /* fall through to a live lookup */
  }
  const p = new Promise((resolve) => {
    olQueue.push({ a, resolve });
    olPump();
  });
  olSession.set(id, p);
  return p;
}
