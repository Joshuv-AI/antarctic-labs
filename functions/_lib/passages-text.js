// Text primitives for the Phase 1 passage hybrid endpoint
// (functions/api/v1/passages.js). Self-contained on purpose: the
// stemmer, shard hash and BM25 constants are copied verbatim from
// src/lib/search-text.js / functions/_lib/search-text-lite.js /
// src/lib/search-rank.js so server-side scoring matches the R2
// deep-search index exactly as it was built. Keep in sync — the
// two sides MUST NOT drift.
//
// The chunk geometry (512 tokens / 60 overlap, [a-z0-9]+ tokens of
// length >= 2, offsets into the ORIGINAL text) mirrors
// scripts/chunker.py, which produced the passage vectors: a chunk
// rebuilt here from a fetched text has the same char_start/char_end
// the index stored for it.

export const R2_SHARD_COUNT = 256;
export const CHUNK_TOKENS = 512;
export const CHUNK_OVERLAP = 60;

// djb2 — identical to src/lib/search-text.js.
export function shardFor(stem, shards = R2_SHARD_COUNT) {
  let h = 5381;
  for (let i = 0; i < stem.length; i++) h = ((h << 5) + h + stem[i].charCodeAt(0)) >>> 0;
  return h % shards;
}

const STEP2 = {
  ational: "ate", tional: "tion", enci: "ence", anci: "ance", izer: "ize",
  bli: "ble", alli: "al", entli: "ent", eli: "e", ousli: "ous",
  ization: "ize", ation: "ate", ator: "ate", alism: "al", iveness: "ive",
  fulness: "ful", ousness: "ous", aliti: "al", iviti: "ive", biliti: "ble",
  logi: "log",
};
const STEP3 = {
  icate: "ic", ative: "", alize: "al", iciti: "ic", ical: "ic",
  ful: "", ness: "",
};
const STEP4 = [
  "al", "ance", "ence", "er", "ic", "able", "ible", "ant", "ement",
  "ment", "ent", "ou", "ism", "ate", "iti", "ous", "ive", "ize",
];
function isConsonant(w, i) {
  const c = w[i];
  if ("aeiou".includes(c)) return false;
  if (c === "y") return i === 0 ? true : !isConsonant(w, i - 1);
  return true;
}
function measure(w) {
  let n = 0, i = 0;
  while (i < w.length) {
    while (i < w.length && isConsonant(w, i)) i++;
    let sawVowel = false;
    while (i < w.length && !isConsonant(w, i)) { i++; sawVowel = true; }
    if (sawVowel) n++;
  }
  return n;
}
function hasVowel(w) {
  for (let i = 0; i < w.length; i++) if (!isConsonant(w, i)) return true;
  return false;
}
function endsDoubleConsonant(w) {
  if (w.length < 2) return false;
  const a = w[w.length - 1], b = w[w.length - 2];
  return a === b && isConsonant(w, w.length - 1) && !"lsz".includes(a);
}
function endsCvc(w) {
  if (w.length < 3) return false;
  const i = w.length - 1;
  return (
    isConsonant(w, i) && !isConsonant(w, i - 1) && isConsonant(w, i - 2) &&
    !"wxy".includes(w[i])
  );
}
export function stem(word) {
  let w = word.toLowerCase();
  if (w.length < 3) return w;
  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies")) w = w.slice(0, -2);
  else if (w.endsWith("ss")) { /* keep */ }
  else if (w.endsWith("s")) w = w.slice(0, -1);
  let flag = false;
  if (w.endsWith("eed")) {
    if (measure(w.slice(0, -3)) > 0) w = w.slice(0, -1);
  } else if (w.endsWith("ed") && hasVowel(w.slice(0, -2))) {
    w = w.slice(0, -2); flag = true;
  } else if (w.endsWith("ing") && hasVowel(w.slice(0, -3))) {
    w = w.slice(0, -3); flag = true;
  }
  if (flag) {
    if (w.endsWith("at") || w.endsWith("bl") || w.endsWith("iz")) w += "e";
    else if (endsDoubleConsonant(w)) w = w.slice(0, -1);
    else if (measure(w) === 1 && endsCvc(w)) w += "e";
  }
  if (w.endsWith("y") && hasVowel(w.slice(0, -1))) w = w.slice(0, -1) + "i";
  for (const [suf, rep] of Object.entries(STEP2)) {
    if (w.endsWith(suf) && measure(w.slice(0, -suf.length)) > 0) { w = w.slice(0, -suf.length) + rep; break; }
  }
  for (const [suf, rep] of Object.entries(STEP3)) {
    if (w.endsWith(suf) && measure(w.slice(0, -suf.length)) > 0) { w = w.slice(0, -suf.length) + rep; break; }
  }
  for (const suf of STEP4) {
    if (w.endsWith(suf) && measure(w.slice(0, -suf.length)) > 1) { w = w.slice(0, -suf.length); break; }
  }
  if (w.endsWith("e")) {
    const s = w.slice(0, -1);
    const m = measure(s);
    if (m > 1 || (m === 1 && !endsCvc(s))) w = s;
  }
  if (measure(w) > 1 && endsDoubleConsonant(w) && w.endsWith("l")) w = w.slice(0, -1);
  return w;
}

// Stopwords: identical list to src/lib/search-text.js — excluded
// from the index, so excluded from query terms here too.
export const STOPWORDS = new Set(
  ("a,an,and,are,as,at,be,been,but,by,for,from,had,has,have,he,her,hers," +
   "him,his,i,if,in,into,is,it,its,me,my,nor,not,of,off,on,or,our,ours," +
   "she,so,than,that,the,their,theirs,them,then,there,these,they,this," +
   "those,to,was,we,were,what,when,where,which,while,who,whom,will,with," +
   "would,you,your,yours,all,also,any,because,between,can,could,did,do," +
   "does,doing,down,during,each,few,further,here,how,more,most,other,over," +
   "own,same,such,too,under,until,very,was,were,just,about,after,before," +
   "once,only,than,again")
    .split(",")
);

const TOKEN_RE = /[a-z0-9]+/g;

// Tokens with char offsets into the original text (same contract
// as tokenizeWithOffsets in src/lib/search-text.js).
export function tokenizeWithOffsets(text) {
  const out = [];
  const lower = text.toLowerCase();
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(lower)) !== null) {
    if (m[0].length >= 2) out.push({ t: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// Query -> deduped stemmed terms (stopwords removed), like the
// parseQuery term path. Quoted phrases are not special-cased in
// Phase 1: their tokens simply join the term set.
export function parseTerms(raw) {
  const out = [];
  const seen = new Set();
  const lower = String(raw || "").toLowerCase();
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(lower)) !== null) {
    if (m[0].length < 2) continue;
    const s = stem(m[0]);
    if (STOPWORDS.has(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

// BM25 (Lucene defaults, identical to src/lib/search-rank.js).
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;
export function bm25Idf(df, n) {
  if (!n) return 0;
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}
export function bm25Term(tf, fieldLen, avgLen, df, n) {
  if (!tf) return 0;
  const norm = BM25_K1 * (1 - BM25_B + (BM25_B * (fieldLen || 1)) / (avgLen || 1));
  return bm25Idf(df, n) * ((tf * (BM25_K1 + 1)) / (tf + norm));
}

// Rebuild the passages of one text with the chunker.py geometry.
// Returns [{ chunk_index, char_start, char_end, text }].
export function chunkText(text) {
  const toks = tokenizeWithOffsets(text);
  const step = CHUNK_TOKENS - CHUNK_OVERLAP;
  const out = [];
  for (let start = 0, idx = 0; start < toks.length; start += step, idx++) {
    const window = toks.slice(start, start + CHUNK_TOKENS);
    if (!window.length) break;
    const cs = window[0].start;
    const ce = window[window.length - 1].end;
    out.push({ chunk_index: idx, char_start: cs, char_end: ce, text: text.slice(cs, ce) });
    if (start + CHUNK_TOKENS >= toks.length) break;
  }
  return out;
}

// Score pre-chunked passages against stemmed query terms: sum of
// per-term occurrence counts of the stems in the passage. Returns
// the best passage (or null). Used to turn a BM25 work-level hit
// into a citable passage when the dense leg never surfaced it.
export function bestPassageForTerms(passages, termStems) {
  if (!passages.length || !termStems.length) return null;
  const wanted = new Set(termStems);
  let best = null;
  let bestScore = 0;
  for (const p of passages) {
    const counts = new Map();
    const lower = p.text.toLowerCase();
    let m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(lower)) !== null) {
      if (m[0].length < 2) continue;
      const s = stem(m[0]);
      if (wanted.has(s)) counts.set(s, (counts.get(s) || 0) + 1);
    }
    let score = 0;
    for (const c of counts.values()) score += c;
    // Prefer more distinct terms, then more hits.
    const key = counts.size * 1000 + score;
    if (key > bestScore) { bestScore = key; best = p; }
  }
  return bestScore > 0 ? best : null;
}

// Reciprocal Rank Fusion (k = 60, the production consensus).
// dense: [{ key, denseRank, ... }] in rank order (rank is 1-based
// position in the dense list). bm25RankByKey: Map key -> 1-based
// BM25 rank (for passages this is the rank of their WORK in the
// BM25 work list — a passage inherits its work's lexical rank).
// Extra candidates that appear in only one leg are welcome: their
// missing leg contributes 0. Returns candidates sorted by fused
// score desc, each annotated { rrf, denseRank|null, bm25Rank|null }.
export function rrfFuse(dense, bm25RankByKey, extra, k = 60) {
  const byKey = new Map();
  const add = (cand) => {
    let e = byKey.get(cand.key);
    if (!e) {
      e = { ...cand, rrf: 0, denseRank: null, bm25Rank: null };
      byKey.set(cand.key, e);
    }
    return e;
  };
  for (const c of dense || []) {
    const e = add(c);
    e.denseRank = c.denseRank;
    e.rrf += 1 / (k + c.denseRank);
    // Keep the richest copy of the candidate's fields.
    for (const [f, v] of Object.entries(c)) if (e[f] === undefined) e[f] = v;
  }
  for (const c of extra || []) {
    const e = add(c);
    for (const [f, v] of Object.entries(c)) if (e[f] === undefined) e[f] = v;
  }
  for (const e of byKey.values()) {
    const br = bm25RankByKey ? bm25RankByKey.get(e.key) : undefined;
    if (br) {
      e.bm25Rank = br;
      e.rrf += 1 / (k + br);
    }
  }
  return [...byKey.values()].sort((a, b) => b.rrf - a.rrf);
}
