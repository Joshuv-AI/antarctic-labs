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
//
// Workstream D (SPEC-5/SPEC-6): fetches take an AbortSignal plus an 8s
// timeout (a hung shard must never wedge the search bar), and works are
// ranked by BM25 — saturating term frequency, normalized by each work's
// own word count — instead of raw mention counts, which made the longest
// book win every common-term query.

import {
  parseQueryV2,
  shardFor,
  tokenizeWithOffsets,
  stem,
  SHARD_COUNT,
} from "./search-text.js";
import { bm25Term } from "./search-rank.js";

const FETCH_TIMEOUT_MS = 8000;

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

// fetch with the caller's signal composed with an 8s timeout. Whichever
// fires first aborts; AbortError propagates to the caller, which treats
// a superseded query as "no result" (never as an error state).
async function fetchTO(url, signal) {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort(signal && signal.reason);
  if (signal) {
    if (signal.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
    signal.addEventListener("abort", onAbort, { once: true });
  }
  const t = setTimeout(() => ctl.abort(new DOMException("Timeout", "TimeoutError")), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctl.signal });
  } finally {
    clearTimeout(t);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

async function getManifest(signal) {
  if (!manifestPromise) {
    manifestPromise = fetchTO("/search-index/manifest.json", signal)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => (m && Array.isArray(m.docs) && m.docs.length ? m : null))
      .catch((e) => {
        if (e && e.name === "AbortError") throw e;
        return null;
      });
    // A failed/aborted manifest fetch must not poison later searches.
    manifestPromise.catch(() => { manifestPromise = null; });
  }
  return manifestPromise;
}

function getShard(manifest, idx, signal) {
  const key = `${manifest.buildId}/${idx}`;
  if (!shardCache.has(key)) {
    const p = fetchTO(`/search-index/${manifest.buildId}/terms/${idx}.json`, signal)
      .then((r) => (r.ok ? r.json() : {}))
      .catch((e) => {
        shardCache.delete(key);
        if (e && (e.name === "AbortError" || e.name === "TimeoutError")) throw e;
        return {};
      });
    shardCache.set(key, p);
  }
  return shardCache.get(key);
}

async function getAnalyzed(file, signal) {
  if (!textCache.has(file)) {
    if (textCache.size >= MAX_CACHED_TEXTS) {
      textCache.delete(textCache.keys().next().value);
    }
    textCache.set(
      file,
      (async () => {
        const text = await fetchTO(file, signal)
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
// or any quoted phrase; ranked by BM25 (saturating, length-normalized).
//
// Any unexpected failure (stale manifest, corrupt shard, doc index out of
// range) degrades to { state: "unavailable" } — never an unhandled rejection
// that would leave the UI stuck in "loading". An aborted/timed-out request
// is NOT a failure: it returns { state: "aborted" } so the caller can keep
// showing the previous results.
export async function searchDeep(rawQuery, { maxWorks = 250, signal = null } = {}) {
  const q = parseQueryV2(rawQuery);
  if (q.unsearchable) return { state: "empty" };
  let manifest;
  try {
    manifest = await getManifest(signal);
  } catch {
    return { state: "aborted" };
  }
  if (!manifest) return { state: "unavailable" };
  try {
    return await searchDeepInner(q, manifest, maxWorks, signal);
  } catch (e) {
    if (e && (e.name === "AbortError" || e.name === "TimeoutError")) {
      return { state: "aborted" };
    }
    return { state: "unavailable" };
  }
}

async function searchDeepInner(q, manifest, maxWorks, signal) {
  const shards = manifest.shards || SHARD_COUNT;
  const docs = manifest.docs;
  const N = docs.length;
  const avgWords =
    docs.reduce((s, d) => s + (d.words || 0), 0) / Math.max(1, N) || 1;
  // Index terms (parseQuery) + folded variants (café -> cafe) as a union:
  // either spelling in the text is a match.
  const termStems = [...new Set([...q.terms, ...q.foldedTerms])];
  const phraseStemSets = q.phrases.map((p) => [...new Set(p.indexable)]);
  const allStems = [...new Set([...termStems, ...phraseStemSets.flat()])];

  const idxs = [...new Set(allStems.map((s) => shardFor(s, shards)))];
  const loaded = await Promise.all(idxs.map((i) => getShard(manifest, i, signal)));
  const byIdx = new Map(idxs.map((idx, k) => [idx, loaded[k]]));
  const postingsOf = (s) => byIdx.get(shardFor(s, shards))[s] || [];

  // BM25 per work: docIdx -> { score, hits, terms }
  const scores = new Map();
  for (const s of termStems) {
    const postings = postingsOf(s);
    const df = postings.length;
    if (!df) continue;
    for (const [docIdx, count] of postings) {
      let e = scores.get(docIdx);
      if (!e) { e = { score: 0, hits: 0, terms: 0 }; scores.set(docIdx, e); }
      e.score += bm25Term(count, docs[docIdx].words || avgWords, avgWords, df, N);
      e.hits += count;
      e.terms += 1;
    }
  }

  // Yield once between term scoring and phrase verification: scoring walks
  // every posting list of every query term, which can be tens of thousands
  // of entries for common words — this keeps the input responsive while a
  // heavy search resolves.
  await new Promise((r) => setTimeout(r, 0));
  if (signal && signal.aborted) return { state: "aborted" };

  // Phrase matches: verify against the real text (top candidates only).
  // Quoted phrases are exact-only — no stemming of the phrase pattern
  // beyond what the index itself does, no fuzz, no relaxation.
  for (const p of q.phrases) {
    let candidates = null;
    for (const s of phraseStemSets[q.phrases.indexOf(p)]) {
      const docsWith = new Set(postingsOf(s).map(([d]) => d));
      candidates = candidates === null ? docsWith : new Set([...candidates].filter((d) => docsWith.has(d)));
      if (candidates.size === 0) break;
    }
    if (!candidates || candidates.size === 0) continue;
    const ordered = [...candidates]
      .map((d) => [d, (scores.get(d) || { score: 0 }).score])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([d]) => d);
    const analyzed = await Promise.all(
      ordered.map((d) => getAnalyzed(manifest.docs[d].file, signal))
    );
    ordered.forEach((docIdx, k) => {
      const { tokens, stems } = analyzed[k];
      if (tokens.length === 0) return;
      const matches = findPhraseMatches(stems, p.full);
      if (matches.length === 0) return;
      let e = scores.get(docIdx);
      if (!e) { e = { score: 0, hits: 0, terms: 0 }; scores.set(docIdx, e); }
      // A verified exact phrase is the strongest full-text signal there is.
      e.score += 10 + matches.length;
      e.hits += matches.length;
      e.terms += 1;
      e.phrase = true;
    });
  }

  const ranked = [...scores.entries()].sort(
    (a, b) => b[1].score - a[1].score || b[1].hits - a[1].hits
  );
  const works = ranked.slice(0, maxWorks).map(([docIdx, s]) => ({
    doc: manifest.docs[docIdx],
    hits: s.hits,
    score: s.score,
    phrase: !!s.phrase,
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
// SPEC-3: each snippet is at most 200 characters, and carries the char
// offsets the reader's ?at=<offset>&hl=<start>-<end> deep link needs.
// Returns { snippets: [{ html, charStart, charEnd, markStart, markEnd }],
//           total }.
export async function getSnippets(doc, q, { initial = 6, hardCap = 120 } = {}) {
  const { text, tokens, stems } = await getAnalyzed(doc.file, null);
  if (tokens.length === 0) return { snippets: [], total: 0 };

  const wanted = new Set([...(q.terms || []), ...(q.foldedTerms || [])]);
  const ranges = []; // {start, end} token-index ranges of matches
  const seenAt = new Set();
  for (let i = 0; i < tokens.length; i++) {
    if (wanted.has(stems[i]) && !seenAt.has(i)) {
      seenAt.add(i);
      ranges.push({ start: i, end: i });
    }
  }
  for (const p of q.phrases || []) {
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
  const MAX_CHARS = 200; // SPEC-3 snippet cap
  const snippets = shown.map((w) => {
    const winStart = tokens[w.start].start;
    const winEnd = tokens[w.end].end;
    // Collect match sub-ranges inside this window (char offsets).
    const marks = [];
    for (const r of merged) {
      if (r.end < w.start || r.start > w.end) continue;
      const a = Math.max(r.start, w.start);
      const b = Math.min(r.end, w.end);
      marks.push([tokens[a].start, tokens[b].end]);
    }
    marks.sort((a, b) => a[0] - b[0]);
    // Trim the window to <=200 chars, centred on the first match.
    let charStart = winStart;
    let charEnd = winEnd;
    if (winEnd - winStart > MAX_CHARS && marks.length) {
      charStart = Math.max(winStart, marks[0][0] - 90);
      charEnd = Math.min(winEnd, charStart + MAX_CHARS);
      if (charEnd - charStart < MAX_CHARS) {
        charStart = Math.max(winStart, charEnd - MAX_CHARS);
      }
    }
    let html = "";
    let pos = charStart;
    for (const [a, b] of marks) {
      const ma = Math.max(a, charStart), mb = Math.min(b, charEnd);
      if (mb <= ma || ma < pos) continue;
      html += esc(text.slice(pos, ma));
      html += `<mark>${esc(text.slice(ma, mb))}</mark>`;
      pos = mb;
    }
    html += esc(text.slice(pos, charEnd));
    const prefix = charStart > 0 ? "… " : "";
    const suffix = charEnd < text.length ? " …" : "";
    return {
      html: prefix + html + suffix,
      charStart,
      charEnd,
      markStart: marks.length ? marks[0][0] : charStart,
      markEnd: marks.length ? marks[0][1] : charEnd,
    };
  });

  return { snippets, total, initial };
}
