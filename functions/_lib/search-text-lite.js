// Port of the deep-search term primitives (shardFor + Porter stem) from
// src/lib/search-text.js, copied verbatim so the server-side full-text
// lookup in functions/api/v1/search.js hashes and stems exactly the way
// the index was built. Keep in sync with src/lib/search-text.js — the
// two MUST NOT drift (same warning as the build/browser pair).

export const SHARD_COUNT = 64;

// djb2 — identical to src/lib/search-text.js.
export function shardFor(stem, shards = SHARD_COUNT) {
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
