// Browser-side client for the Tower of Babel deep (full-text) search.
//
// The index is built at deploy time by scripts/build-search-index.mjs and
// served as static JSON: /search-index/manifest.json + sharded term postings.
// Snippets are cut from the actual TXT files at query time, so the index
// itself stays small (no positions stored) and can never disagree with a file.
//
// Everything here degrades gracefully: if the index is missing or a fetch
// fails, callers get { state: "unavailable" } and the title search is
// unaffected.

import {
  parseQuery,
  shardFor,
  tokenizeWithOffsets,
  stem,
  SHARD_COUNT,
} from "./search-text.js";

let manifestPromise = null;
const shardCache = new Map(); // "buildId/idx" -> Promise<postings>
// file -> Promise<{text, tokens, stems}>; analysis cached so phrase checks
// and snippet extraction never re-tokenize the same text twice.
const textCache = new Map();
const MAX_CACHED_TEXTS = 16;
// Shared stem cache across texts: common English words stem once, ever.
// Bounded with FIFO eviction so it can't grow without limit.
const stemCache = new Map();
const MAX_STEM_CACHE = 200000;
function stemCached(w) {
  let s = stemCache.get(w);
  if (s === undefined) {
    s = stem(w);
    if (stemCache.size >= MAX_STEM_CACHE) {
      stemCache.delete(stemCache.keys().next().value);
    }
    stemCache.set(w, s);
  }
  return s;
}

export function parseDeepQuery(raw) {
  return parseQuery(raw);
}

export async function getManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch("/search-index/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => (m && Array.isArray(m.docs) && m.docs.length ? m : null))
      .catch(() => null);
  }
  return manifestPromise;
}

function getShard(manifest, idx) {
  const key = `${manifest.buildId}/${idx}`;
  if (!shardCache.has(key)) {
    shardCache.set(
      key,
      fetch(`/search-index/${manifest.buildId}/terms/${idx}.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}))
    );
  }
  return shardCache.get(key);
}

async function getAnalyzed(file) {
  if (!textCache.has(file)) {
    if (textCache.size >= MAX_CACHED_TEXTS) {
      textCache.delete(textCache.keys().next().value);
    }
    textCache.set(
      file,
      (async () => {
        const text = await fetch(file)
          .then((r) => (r.ok ? r.text() : ""))
          .catch(() => "");
        if (!text) return { text: "", tokens: [], stems: [] };
        const tokens = tokenizeWithOffsets(text);
        const stems = tokens.map((t) => stemCached(t.t));
        return { text, tokens, stems };
      })()
    );
  }
  return textCache.get(file);
}

// Count adjacent occurrences of a stem sequence in a stemmed token stream.
// Returns [{start, end}] token-index ranges.
function findPhraseMatches(stems, phrase) {
  const out = [];
  const n = phrase.length;
  if (n === 0 || stems.length < n) return out;
  for (let i = 0; i <= stems.length - n; i++) {
    let ok = true;
    for (let j = 0; j < n; j++) {
      if (stems[i + j] !== phrase[j]) { ok = false; break; }
    }
    if (ok) out.push({ start: i, end: i + n - 1 });
  }
  return out;
}

// Deep search. Union semantics: a work matches if it contains any query term
// or any quoted phrase; ranked by total mention count, descending.
export async function searchDeep(rawQuery, { maxWorks = 60 } = {}) {
  const q = parseQuery(rawQuery);
  if (q.unsearchable) return { state: "empty" };
  const manifest = await getManifest();
  if (!manifest) return { state: "unavailable" };

  const shards = manifest.shards || SHARD_COUNT;
  const termStems = [...new Set(q.terms)];
  const phraseStemSets = q.phrases.map((p) => [...new Set(p.indexable)]);
  const allStems = [...new Set([...termStems, ...phraseStemSets.flat()])];

  const idxs = [...new Set(allStems.map((s) => shardFor(s, shards)))];
  const loaded = await Promise.all(idxs.map((i) => getShard(manifest, i)));
  const byIdx = new Map(idxs.map((idx, k) => [idx, loaded[k]]));
  const postingsOf = (s) => byIdx.get(shardFor(s, shards))[s] || [];

  // Term scores: docIdx -> { hits, terms }
  const scores = new Map();
  for (const s of termStems) {
    for (const [docIdx, count] of postingsOf(s)) {
      let e = scores.get(docIdx);
      if (!e) { e = { hits: 0, terms: 0 }; scores.set(docIdx, e); }
      e.hits += count;
      e.terms += 1;
    }
  }

  // Phrase matches: verify against the real text (top candidates only).
  for (const p of q.phrases) {
    // Candidates must contain every indexable stem of the phrase.
    let candidates = null;
    for (const s of phraseStemSets[q.phrases.indexOf(p)]) {
      const docs = new Set(postingsOf(s).map(([d]) => d));
      candidates = candidates === null ? docs : new Set([...candidates].filter((d) => docs.has(d)));
      if (candidates.size === 0) break;
    }
    if (!candidates || candidates.size === 0) continue;
    const ordered = [...candidates]
      .map((d) => [d, (scores.get(d) || { hits: 0 }).hits])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([d]) => d);
    const analyzed = await Promise.all(
      ordered.map((d) => getAnalyzed(manifest.docs[d].file))
    );
    ordered.forEach((docIdx, k) => {
      const { tokens, stems } = analyzed[k];
      if (tokens.length === 0) return;
      const matches = findPhraseMatches(stems, p.full);
      if (matches.length === 0) return;
      let e = scores.get(docIdx);
      if (!e) { e = { hits: 0, terms: 0 }; scores.set(docIdx, e); }
      e.hits += matches.length;
      e.terms += 1;
    });
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1].hits - a[1].hits);
  const works = ranked.slice(0, maxWorks).map(([docIdx, s]) => ({
    doc: manifest.docs[docIdx],
    hits: s.hits,
  }));
  return {
    state: "ready",
    works,
    totalWorks: ranked.length,
    truncated: ranked.length > maxWorks,
    texts: manifest.texts,
    query: q,
  };
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

// Cut highlighted preview windows around every query hit in a work's text.
// Returns { snippets: [{ html }], total } — snippets capped for sanity.
export async function getSnippets(doc, q, { initial = 6, hardCap = 120 } = {}) {
  const { text, tokens, stems } = await getAnalyzed(doc.file);
  if (tokens.length === 0) return { snippets: [], total: 0 };

  const wanted = new Set(q.terms);
  const ranges = []; // {start, end} token-index ranges of matches
  const seenAt = new Set();
  for (let i = 0; i < tokens.length; i++) {
    if (wanted.has(stems[i]) && !seenAt.has(i)) {
      seenAt.add(i);
      ranges.push({ start: i, end: i });
    }
  }
  for (const p of q.phrases) {
    for (const r of findPhraseMatches(stems, p.full)) {
      for (let i = r.start; i <= r.end; i++) seenAt.add(i);
      ranges.push(r);
    }
  }
  if (ranges.length === 0) return { snippets: [], total: 0 };

  // Merge overlapping/adjacent ranges, then widen into windows of context.
  ranges.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  const WINDOW = 24; // tokens of context on each side (~2 lines)
  const windows = [];
  for (const r of merged) {
    const w = {
      start: Math.max(0, r.start - WINDOW),
      end: Math.min(tokens.length - 1, r.end + WINDOW),
    };
    const last = windows[windows.length - 1];
    if (last && w.start <= last.end + 1) last.end = Math.max(last.end, w.end);
    else windows.push(w);
  }

  const total = windows.length;
  const shown = windows.slice(0, hardCap);
  const snippets = shown.map((w) => {
    const charStart = tokens[w.start].start;
    const charEnd = tokens[w.end].end;
    // Collect match sub-ranges inside this window (char offsets).
    const marks = [];
    for (const r of merged) {
      if (r.end < w.start || r.start > w.end) continue;
      const a = Math.max(r.start, w.start);
      const b = Math.min(r.end, w.end);
      marks.push([tokens[a].start, tokens[b].end]);
    }
    marks.sort((a, b) => a[0] - b[0]);
    let html = "";
    let pos = charStart;
    for (const [a, b] of marks) {
      html += esc(text.slice(pos, a));
      html += `<mark>${esc(text.slice(a, b))}</mark>`;
      pos = b;
    }
    html += esc(text.slice(pos, charEnd));
    const prefix = w.start > 0 ? "… " : "";
    const suffix = w.end < tokens.length - 1 ? " …" : "";
    return { html: prefix + html + suffix };
  });

  return { snippets, total, initial };
}
