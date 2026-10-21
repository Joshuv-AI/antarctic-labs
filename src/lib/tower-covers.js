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

  // 3 — Internet Archive item image.
  const im = /archive\.org\/details\/([\w.-]+)/.exec(su);
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
