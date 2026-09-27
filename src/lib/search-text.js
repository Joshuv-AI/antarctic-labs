// Shared text-search primitives for the Tower of Babel deep (full-text) search.
// Used by BOTH scripts/build-search-index.mjs (Node, build time) and
// src/lib/deep-search.js (browser, query time). No dependencies — keep it that
// way so the two sides can never drift apart.

export const SHARD_COUNT = 64;

// djb2 — must be identical everywhere; decides which term shard a stem lives in.
export function shardFor(stem, shards = SHARD_COUNT) {
  let h = 5381;
  for (let i = 0; i < stem.length; i++) h = ((h << 5) + h + stem[i].charCodeAt(0)) >>> 0;
  return h % shards;
}

// Lowercase alphanumeric tokens, length >= 2. Same tokenization must be used
// when indexing and when extracting snippets, or offsets won't line up.
const TOKEN_RE = /[a-z0-9]+/g;
export function tokenize(text) {
  const out = [];
  const lower = text.toLowerCase();
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(lower)) !== null) {
    if (m[0].length >= 2) out.push(m[0]);
  }
  return out;
}

// Same as tokenize, but keeps char offsets so snippets can be cut + highlighted.
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

// --- Porter stemmer (standard algorithm, compact implementation) ---
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
  // Step 1a
  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies")) w = w.slice(0, -2);
  else if (w.endsWith("ss")) { /* keep */ }
  else if (w.endsWith("s")) w = w.slice(0, -1);
  // Step 1b
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
  // Step 1c
  if (w.endsWith("y") && hasVowel(w.slice(0, -1))) w = w.slice(0, -1) + "i";
  // Step 2
  for (const [suf, rep] of Object.entries(STEP2)) {
    if (w.endsWith(suf) && measure(w.slice(0, -suf.length)) > 0) { w = w.slice(0, -suf.length) + rep; break; }
  }
  // Step 3
  for (const [suf, rep] of Object.entries(STEP3)) {
    if (w.endsWith(suf) && measure(w.slice(0, -suf.length)) > 0) { w = w.slice(0, -suf.length) + rep; break; }
  }
  // Step 4
  for (const suf of STEP4) {
    if (w.endsWith(suf) && measure(w.slice(0, -suf.length)) > 1) { w = w.slice(0, -suf.length); break; }
  }
  // Step 5a
  if (w.endsWith("e")) {
    const s = w.slice(0, -1);
    const m = measure(s);
    if (m > 1 || (m === 1 && !endsCvc(s))) w = s;
  }
  // Step 5b
  if (measure(w) > 1 && endsDoubleConsonant(w) && w.endsWith("l")) w = w.slice(0, -1);
  return w;
}

// Common English words: excluded from the index and from unquoted query terms.
// They are still honored inside "quoted phrases".
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

// Parse a raw query into stemmed terms + quoted phrases.
// Returns { terms: string[] (stems, stopwords removed),
//           phrases: { full: string[] (stems, stopwords kept),
//                      indexable: string[] (stems, stopwords removed) }[],
//           droppedStopwords: boolean }
export function parseQuery(raw) {
  const phrases = [];
  const phraseRe = /"([^"]+)"/g;
  let m;
  let rest = raw;
  const seen = [];
  while ((m = phraseRe.exec(raw)) !== null) {
    seen.push(m[0]);
    const toks = tokenize(m[1]);
    if (toks.length === 0) continue;
    const full = toks.map(stem);
    const indexable = full.filter((s) => !STOPWORDS.has(s));
    phrases.push({ full, indexable });
  }
  for (const s of seen) rest = rest.replace(s, " ");
  let droppedStopwords = false;
  const terms = [];
  for (const t of tokenize(rest)) {
    const s = stem(t);
    if (STOPWORDS.has(s)) { droppedStopwords = true; continue; }
    terms.push(s);
  }
  const phraseHadStopwords = phrases.some((p) => p.full.length !== p.indexable.length);
  return {
    terms,
    phrases: phrases.filter((p) => p.indexable.length > 0),
    unsearchable: terms.length === 0 && phrases.length === 0,
    droppedStopwords: droppedStopwords || phraseHadStopwords,
  };
}

// Count stem occurrences in a text. Returns Map(stem -> count).
// Pass a shared `cache` Map across many texts to avoid re-stemming the same
// word form repeatedly (the common words dominate; this is ~10x faster).
export function analyze(text, cache) {
  const counts = new Map();
  const c = cache || new Map();
  for (const t of tokenize(text)) {
    let s = c.get(t);
    if (s === undefined) {
      s = stem(t);
      c.set(t, s);
    }
    if (STOPWORDS.has(s)) continue;
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  return counts;
}
