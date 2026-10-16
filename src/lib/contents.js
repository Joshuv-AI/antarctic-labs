// Section extraction for the Tower of Babel View Text reader's Contents panel
// (Apple Books-style). ESM, zero DOM/browser dependencies: importable by
// Node 18+ and bundled by Vite. Deterministic — the same text always yields
// identical sections.
//
// Detection tiers (in order):
//   1. The text's own table of contents: dense runs of ToC-like lines near
//      the head are parsed into entry keys; each entry's first occurrence
//      (the ToC line itself) is skipped so sections land on the body
//      occurrence, never the ToC.
//   2. Explicit standalone headings: chapter/part/section/book/canto/surah/
//      article/act/scene/verse/psalm/appendix/… followed by a number (digits,
//      roman numerals, number words, single letters), the bare keyword alone,
//      or keyword + colon; ordinal phrases ("First Article"); markdown #
//      headers; § markers; scripture book headers ("Book 01 Genesis") and,
//      in single-book scriptures only, chapter starts ("01:001:001");
//      dotted numbered headings ("1. Introduction", "2.1 Methods") that are
//      not wrapped paragraph lines; numbered ALL-CAPS standalone lines;
//      standalone roman numerals.
//   3. Repeated structural delimiters (* * *, long rules) splitting the text.
//   4. Fallback: equal character ranges with honest "Part N of M" labels.
//
// Performance: two linear scans (a bounded head scan for the ToC, then one
// body pass). Lines are streamed via indexOf — no line array is ever built.
// Per-line work is dispatched on the first character: at most a couple of
// anchored regex tests on short strings. All regexes are precompiled,
// non-global (no lastIndex state), and free of nested quantifiers. Keyword
// matching uses first-word Set lookup, not large alternations. Section
// count is capped.

const MAX_SECTIONS = 2000; // sanity bound: a dictionary must not yield 50k rows
const TINY_CHARS = 4000; // below this: exactly one section (the title)
const MAX_LINE = 90; // heading lines are short; longer lines are body
const MAX_LABEL = 80;
const TOC_SCAN_LINES = 3000; // a ToC lives at the head of the text
const MIN_GAP = 60; // min chars between consecutive sections

// ---- keyword sets (first-word dispatch — no large regex alternations) ----
const HEADWORDS = new Set(
  'chapter part section book canto surah surat article act scene verse psalm epistle appendix prologue epilogue preface foreword afterword introduction conclusion glossary index bibliography contents content volume tome question parable treatise discourse sermon homily oration satire eclogue elegy ode hymn fable tale essay letter fragment stanza'.split(
    ' '
  )
);
const ORDINAL_WORDS = new Set(
  'first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth last final'.split(
    ' '
  )
);
const ORDINAL_NOUNS = new Set(
  'article chapter part section book question theorem lemma proposition commandment'.split(' ')
);
const ORDINAL_FULL_RE =
  /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|last|final)\s+(article|chapter|part|section|book|question|theorem|lemma|proposition|commandment)\b(\s*[:–—\-\(\[]|\s+\d|\s+[ivxlc]+\b|\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b|\s*$)/i;

// ---- precompiled patterns (all anchored, no /g/, no nested quantifiers) ----
const MD_RE = /^#{1,4}\s+(?=[A-Za-z0-9])\S/;
const SECSYM_RE = /^§+\s*\d{1,4}($|\s*[:.\-–—]|\s+[A-Z0-9"'(])/;
const BOOKHDR_RE = /^book\s+\d{1,3}\s+[a-z]/i;
const VERSE3_RE = /^(\d{1,3}):(\d{1,3}):001\b/; // BB:CCC:001 — verse 1 of chapter CCC
const PSALM_RE = /^(\d{1,3}):001\b(?!:\d)/; // two-group form; not a prefix of BB:CCC:VVV
const NUMSEC_RE = /^(\d{1,3}(?:\.\d{1,3}){0,3})(\.?)\s+[A-Z0-9"'(\[]/;
const ROMAN_RE = /^(?=[MDCLXVI])M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const TOCNUM_RE = /^([0-9]{1,4}|[IVXLC]{1,8}|[A-Z])[\).\:\-–—]\s+\S/;
const TOCDOTS_RE = /^.{2,60}?\.{3,}\s*\d{1,4}\s*$/; // title ...... 42
const DELIM_RE = /^\s*(?:(\*\s*){3,}|[-–—]{4,}|_{4,}|={4,}|·{4,}|•{3,})\s*$/;

function scanLines(text, cb) {
  const n = text.length;
  let s = 0;
  let idx = 0;
  while (s < n) {
    let e = text.indexOf('\n', s);
    if (e < 0) e = n;
    if (cb(s, e, idx) === false) return;
    s = e + 1;
    idx++;
  }
}

function trimLine(text, s, e) {
  if (e > s && text.charCodeAt(e - 1) === 13) e--; // trailing \r
  let a = s;
  while (a < e) {
    const c = text.charCodeAt(a);
    if (c !== 32 && c !== 9) break;
    a++;
  }
  let b = e;
  while (b > a) {
    const c = text.charCodeAt(b - 1);
    if (c !== 32 && c !== 9) break;
    b--;
  }
  return a < b ? text.slice(a, b) : '';
}

function cleanLabel(s) {
  if (typeof s !== 'string') return '';
  let t = s.replace(/\s+/g, ' ').trim();
  if (t.length > MAX_LABEL) t = t.slice(0, MAX_LABEL).trimEnd();
  return t;
}

// Lowercase first word (letters only). Cheap manual scan — no regex.
function firstWordLower(t) {
  let w = '';
  for (let i = 0; i < t.length && i < 24; i++) {
    const c = t.charCodeAt(i);
    if (c >= 65 && c <= 90) w += String.fromCharCode(c + 32);
    else if (c >= 97 && c <= 122) w += t[i];
    else break;
  }
  return w;
}

// Lowercase second word, given the first word's length.
function secondWordLower(t, wlen) {
  let i = wlen;
  while (i < t.length && (t.charCodeAt(i) === 32 || t.charCodeAt(i) === 9)) i++;
  let w = '';
  for (let j = i; j < t.length && j < i + 24; j++) {
    const c = t.charCodeAt(j);
    if (c >= 65 && c <= 90) w += String.fromCharCode(c + 32);
    else if (c >= 97 && c <= 122) w += t[j];
    else break;
  }
  return w;
}

// Strict headword check: the keyword must be followed by a number-ish with a
// clean follower, be the whole line, or be followed by a colon — otherwise a
// body sentence starting with "question," / "part of…" would false-positive.
// Returns rank 0 or -1.
function headwordRank(t, w) {
  const rest = t.slice(w.length);
  if (/^\s*$/.test(rest)) return 0; // bare keyword: "Introduction"
  const sep = /^[\s.\-:–—)]+/.exec(rest);
  if (!sep) return -1;
  const after = rest.slice(sep[0].length);
  // Digits or UPPERCASE roman: "Chapter 1", "PART IV", "Section 2."
  // Trailing title must start uppercase (or end here): kills
  // "Book I., ch. 28). In the Hebrew" and "part I made a change".
  let m = /^(\d{1,4}|[IVXLCDM]{1,8})\b/.exec(after);
  if (m) {
    const r2 = after.slice(m[0].length);
    return /^[\s.\):–—-]*($|[A-Z0-9"'(§])/.test(r2) ? 0 : -1;
  }
  // Lowercase roman only when nothing follows: "chapter ii",
  // never "psalm cxxxiii., an eloquent description".
  m = /^[ivxlcdm]{1,8}\b/.exec(after);
  if (m) {
    const r2 = after.slice(m[0].length);
    return /^[\s.\):–—-]*$/.test(r2) ? 0 : -1;
  }
  // Number words need a clean follower too: "Chapter One", never
  // "Article fifty-five relates to the reception".
  m =
    /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|first|last|final)\b/i.exec(
      after
    );
  if (m) {
    let r2 = after.slice(m[0].length);
    // Consume hyphenated compound: "fifty-five".
    const m2 = /^-(one|two|three|four|five|six|seven|eight|nine)\b/i.exec(r2);
    if (m2) r2 = r2.slice(m2[0].length);
    if (/^\s*$/.test(r2) || /^\s*[:–—\-.]\s*\S/.test(r2) || /^\s+[A-Z0-9"'(]/.test(r2))
      return 0;
    return -1;
  }
  // Single uppercase letter + punctuation/end only: "Appendix A", "Book B:".
  // (Not "letter A, delta. It is also…" — body text.)
  m = /^[A-Z]\b/.exec(after);
  if (m) {
    const r2 = after.slice(m[0].length);
    return /^[\s.\):–—-]*$/.test(r2) ? 0 : -1;
  }
  // Keyword + colon/dash + Title: "Chapter: The End", "Part – The Journey".
  // Content must start uppercase ASCII (kills "part — that is, the great
  // mass…" definition lines and "Article : ‘ History" OCR junk).
  if (/^\s*[:–—-]\s*[A-Z0-9"'(]/.test(rest)) return 0;
  return -1;
}

// Cheap normalized key for ToC-entry matching (both sides use the same).
function cheapKey(line) {
  return line.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Manual ALL-CAPS heading check: 3–60 chars, starts uppercase, every char in
// the allowed set, ≥3 letters, no rule runs (3+ '-' or 4+ '.'). Replaces
// three regexes on the hottest path (dialogue headers etc.).
function isAllCapsHeading(t) {
  const n = t.length;
  if (n < 3 || n > 60) return false;
  if (t.charCodeAt(0) < 65 || t.charCodeAt(0) > 90) return false;
  let letters = 0;
  let words = 0;
  let inWord = false;
  let dash = 0;
  let dot = 0;
  for (let i = 0; i < n; i++) {
    const c = t.charCodeAt(i);
    if (c >= 65 && c <= 90) {
      letters++;
      if (!inWord) {
        inWord = true;
        words++;
      }
      dash = 0;
      dot = 0;
    } else if (
      (c >= 48 && c <= 57) ||
      c === 32 ||
      c === 9 ||
      c === 44 ||
      c === 39 ||
      c === 59 ||
      c === 58 ||
      c === 38 ||
      c === 40 ||
      c === 41 ||
      c === 46 ||
      c === 47 ||
      c === 33 ||
      c === 63 ||
      c === 34
    ) {
      if (c === 46) {
        if (++dot >= 4) return false;
      } else dot = 0;
      dash = 0;
      if (c === 32 || c === 9) inWord = false;
    } else if (c === 45 || c === 8211 || c === 8212) {
      if (++dash >= 3) return false;
      dot = 0;
    } else {
      return false;
    }
  }
  return letters >= 3 && words >= 2;
}

function isRomanChars(t) {
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (
      c !== 77 &&
      c !== 68 &&
      c !== 67 &&
      c !== 76 &&
      c !== 88 &&
      c !== 86 &&
      c !== 73
    )
      return false;
  }
  return t.length > 0 && t.length <= 8;
}

// Lowercase first alphanumeric token. Cheap manual scan — no regex.
function firstTokenLower(s) {
  let t = '';
  for (let i = 0; i < s.length && i < 24; i++) {
    const c = s.charCodeAt(i);
    if (c >= 65 && c <= 90) t += String.fromCharCode(c + 32);
    else if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) t += s[i];
    else if (t) break;
  }
  return t;
}

// Allocation-free prefilter for cheapKey: djb2 over lowercase alphanumerics
// only (separators ignored — collisions resolved by exact cheapKey verify).
function keyHash(line) {
  let h = 5381;
  for (let i = 0; i < line.length; i++) {
    let c = line.charCodeAt(i);
    if (c >= 65 && c <= 90) c += 32;
    if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) h = (((h << 5) + h) ^ c) >>> 0;
  }
  return h;
}

// ---- range-based variants: operate on text[a..b] without slicing ----
// The hot body pass never materializes line strings except for rare
// promising lines; these do the per-line triage on raw offsets.
function firstWordLowerRange(text, a, b) {
  let w = '';
  const m = Math.min(b, a + 24);
  for (let i = a; i < m; i++) {
    const c = text.charCodeAt(i);
    if (c >= 65 && c <= 90) w += String.fromCharCode(c + 32);
    else if (c >= 97 && c <= 122) w += text[i];
    else break;
  }
  return w;
}

function firstTokenLowerRange(text, a, b) {
  let t = '';
  const m = Math.min(b, a + 24);
  for (let i = a; i < m; i++) {
    const c = text.charCodeAt(i);
    if (c >= 65 && c <= 90) t += String.fromCharCode(c + 32);
    else if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) t += text[i];
    else if (t) break;
  }
  return t;
}

function keyHashRange(text, a, b) {
  let h = 5381;
  for (let i = a; i < b; i++) {
    let c = text.charCodeAt(i);
    if (c >= 65 && c <= 90) c += 32;
    if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) h = (((h << 5) + h) ^ c) >>> 0;
  }
  return h;
}

function isAllCapsHeadingRange(text, a, b) {
  const n = b - a;
  if (n < 3 || n > 60) return false;
  if (text.charCodeAt(a) < 65 || text.charCodeAt(a) > 90) return false;
  let letters = 0;
  let words = 0;
  let inWord = false;
  let dash = 0;
  let dot = 0;
  for (let i = a; i < b; i++) {
    const c = text.charCodeAt(i);
    if (c >= 65 && c <= 90) {
      letters++;
      if (!inWord) {
        inWord = true;
        words++;
      }
      dash = 0;
      dot = 0;
    } else if (
      (c >= 48 && c <= 57) ||
      c === 32 ||
      c === 9 ||
      c === 44 ||
      c === 39 ||
      c === 59 ||
      c === 58 ||
      c === 38 ||
      c === 40 ||
      c === 41 ||
      c === 46 ||
      c === 47 ||
      c === 33 ||
      c === 63 ||
      c === 34
    ) {
      if (c === 46) {
        if (++dot >= 4) return false;
      } else dot = 0;
      dash = 0;
      if (c === 32 || c === 9) inWord = false;
    } else if (c === 45 || c === 8211 || c === 8212) {
      if (++dash >= 3) return false;
      dot = 0;
    } else {
      return false;
    }
  }
  // Single-word ALL-CAPS lines are dialogue headers ("HAMLET"), not sections.
  return letters >= 3 && words >= 2;
}

function isRomanCharsRange(text, a, b) {
  const n = b - a;
  if (n === 0 || n > 8) return false;
  for (let i = a; i < b; i++) {
    const c = text.charCodeAt(i);
    if (
      c !== 77 &&
      c !== 68 &&
      c !== 67 &&
      c !== 76 &&
      c !== 88 &&
      c !== 86 &&
      c !== 73
    )
      return false;
  }
  return true;
}

// ToC-likeness of a trimmed short line: 0 no, 1 weak (all-caps/roman),
// 2 structured (numbered entries, dotted leaders, keyword headings…).
function tocKind(line) {
  const c = line.charCodeAt(0);
  if (c === 35) return MD_RE.test(line) ? 2 : 0;
  if (c === 167) return SECSYM_RE.test(line) ? 2 : 0;
  if (c >= 48 && c <= 57)
    return TOCNUM_RE.test(line) || NUMSEC_RE.test(line) ? 2 : 0;
  if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
    const w = firstWordLower(line);
    if (HEADWORDS.has(w)) return headwordRank(line, w) >= 0 ? 2 : 0;
    if (ORDINAL_WORDS.has(w) && ORDINAL_NOUNS.has(secondWordLower(line, w.length))) return 2;
    if (w === 'book' && BOOKHDR_RE.test(line)) return 2;
    if (TOCDOTS_RE.test(line)) return 2;
    if (c >= 65 && c <= 90 && isAllCapsHeading(line)) return 1;
    return 0;
  }
  if (c === 34 || c === 39 || c === 40 || c === 91)
    return line.length > 1 ? tocKind(line.slice(1)) : 0; // leading "'([
  return false;
}

// Bounded head scan: find the text's table of contents as merged dense runs
// of ToC-like lines. The anchor run needs ≥8 entries with ≥3 structured ones
// (numbered entries, dotted leaders, keyword headings) so a title page can't
// false-positive; subsequent runs within 100 lines are merged in (ToCs are
// often interrupted by page-break junk). Returns { set, hashes } — normalized
// entry keys — or null. There is no region exclusion: accept() skips each
// entry's first occurrence (the ToC line itself) so taps land on the body.
function findToc(text) {
  const N = 3000;
  const tl = []; // tocLike lines only: {s,e,kind,line,idx}
  scanLines(text, (s, e, idx) => {
    if (idx >= N) return false;
    if (e - s > 0 && e - s <= 120) {
      const line = trimLine(text, s, e);
      if (line) {
        const kind = tocKind(line) || 0;
        if (kind) tl.push({ s, e, kind, line, idx });
      }
    }
  });
  // Runs: consecutive entries with ≤2 non-tocLike lines between them.
  const runs = [];
  let cur = null;
  for (const t of tl) {
    if (cur && t.idx - cur.lastIdx <= 3) {
      cur.items.push(t);
      cur.lastIdx = t.idx;
      if (t.kind === 2) cur.struct++;
    } else {
      if (cur) runs.push(cur);
      cur = { items: [t], firstIdx: t.idx, lastIdx: t.idx, struct: t.kind === 2 ? 1 : 0 };
    }
  }
  if (cur) runs.push(cur);
  const ai = runs.findIndex((r) => r.items.length >= 8 && r.struct >= 3);
  if (ai === -1) return null;
  let endIdx = runs[ai].lastIdx;
  let ei = ai;
  for (let i = ai + 1; i < runs.length; i++) {
    if (runs[i].firstIdx - endIdx <= 100) {
      endIdx = runs[i].lastIdx;
      ei = i;
    } else break;
  }
  const set = new Set();
  const hashes = new Set();
  const toks = new Set();
  for (let i = ai; i <= ei; i++) {
    for (const t of runs[i].items) {
      // Exact normalized keys only — stripped variants ("joshua" from
      // "Book 06 Joshua") false-positive on running headers.
      const k1 = cheapKey(t.line);
      if (k1.length >= 4) {
        set.add(k1);
        hashes.add(keyHash(t.line));
        const ft = firstTokenLower(k1);
        if (ft) toks.add(ft);
      }
    }
    if (set.size >= 6000) break;
  }
  return { set, hashes, toks };
}

// Scripture pre-scan: distinct "Book NN Name" headers in the head.
function scanBookNames(text) {
  const head = text.slice(0, 300000);
  const re = /^book\s+\d{1,3}\s+([a-z][a-z'’\-\s]{1,40})/gim; // local: fresh each call
  const names = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(head)) !== null && names.length < 20) {
    const nm = m[1].split('\n')[0].replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
    const k = nm.toLowerCase();
    if (k.length >= 3 && !seen.has(k)) {
      seen.add(k);
      names.push(nm);
    }
  }
  return names;
}

// True when the next non-blank line starts with a lowercase letter — i.e.
// this "numbered heading" is a wrapped paragraph line, not a heading.
function nextLineStartsLower(text, e) {
  let s = e + 1;
  const n = text.length;
  while (s < n) {
    let le = text.indexOf('\n', s);
    if (le < 0) le = n;
    let a = s;
    while (a < le) {
      const c = text.charCodeAt(a);
      if (c !== 32 && c !== 9 && c !== 13) break;
      a++;
    }
    if (a < le) {
      const c = text.charCodeAt(a);
      return c >= 97 && c <= 122;
    }
    s = le + 1;
  }
  return false;
}

// Classify a trimmed short line (leading quotes/parens already stripped).
// Returns { rank, label, force } — rank 0 major, 1 minor, 2 weak — or null.
function classify(t, s, e, text, ctx) {
  const c = t.charCodeAt(0);
  if (c === 35) {
    // Markdown header with real content ("# ^ . -" OCR junk is rejected:
    // content must start alnum and run ≥4 chars).
    if (MD_RE.test(t)) {
      const label = t.replace(/^#{1,4}\s+/, '');
      if (label.length >= 4) return { rank: 0, label };
    }
    return null;
  }
  if (c === 167) {
    if (SECSYM_RE.test(t)) return { rank: 0, label: t };
    return null;
  }
  if (c >= 48 && c <= 57) {
    if (ctx.verseChapters) {
      const vm = VERSE3_RE.exec(t);
      if (vm)
        return {
          rank: 1,
          label: ctx.bookName + ' ' + parseInt(vm[2], 10),
          force: true, // chapter starts sit close together; never gap-drop
        };
      const pm = PSALM_RE.exec(t);
      if (pm) return { rank: 2, label: 'Psalm ' + parseInt(pm[1], 10) };
    }
    const nm = NUMSEC_RE.exec(t);
    // Require a real dotted number ("3.", "2.1") — rejects dates like "16 May 1973".
    // Reject wrapped paragraph lines ("1. The purpose of this memorandum is to").
    if (
      nm &&
      (nm[1].indexOf('.') !== -1 || nm[2] === '.') &&
      !nextLineStartsLower(text, e)
    )
      return { rank: 1, label: t, ns: true };
    return null;
  }
  const up = c >= 65 && c <= 90;
  if (up || (c >= 97 && c <= 122)) {
    const w = firstWordLower(t);
    if (HEADWORDS.has(w)) {
      const r = headwordRank(t, w);
      if (r >= 0) return { rank: 0, label: t };
      return null;
    }
    if (ORDINAL_WORDS.has(w) && ORDINAL_NOUNS.has(secondWordLower(t, w.length))) {
      // Full strict check (gated by the cheap Set hits): "First Article",
      // "Second Chapter 3" — but not "fourth part of an hin" (body text).
      if (ORDINAL_FULL_RE.test(t)) return { rank: 1, label: t };
      return null;
    }
    if (w === 'book' && BOOKHDR_RE.test(t)) return { rank: 0, label: t };
    if (up) {
      if (isAllCapsHeading(t)) return { rank: 2, label: t };
      if (isRomanChars(t) && ROMAN_RE.test(t)) return { rank: 2, label: t };
    }
    return null;
  }
  return null;
}

function prune(cands) {
  let arr = cands;
  if (arr.length > MAX_SECTIONS) {
    const noWeak = arr.filter((x) => x.rank !== 2);
    if (noWeak.length >= 2) arr = noWeak;
  }
  if (arr.length > MAX_SECTIONS) {
    const major = arr.filter((x) => x.rank === 0);
    if (major.length >= 2) arr = major;
  }
  if (arr.length > MAX_SECTIONS) return null; // caller falls back
  return arr;
}

/**
 * Extract Apple Books-style contents sections from a hosted library text.
 * @param {string} text  full UTF-8 text of the entry
 * @param {string} title entry title (first section label)
 * @returns {Array<{label:string, offset:number, percent:number}>}
 */
export function extractContents(text, title) {
  if (typeof text !== 'string') text = '';
  const n = text.length;
  const headLabel = cleanLabel(title) || 'Beginning';
  if (n < TINY_CHARS) return [{ label: headLabel, offset: 0, percent: 0 }];

  const toc = findToc(text);
  const bookNames = scanBookNames(text);
  const ctx = {
    // Verse-level chapters only make sense in a single-book scripture; in a
    // multi-book text the book headers are the sections.
    verseChapters: bookNames.length === 1,
    bookName: bookNames.length === 1 ? bookNames[0] : '',
  };

  const cands = []; // {off,label,rank} in offset order
  const delims = [];
  let lastOff = -1;
  let lastLabel = '';
  const seenTocKeys = new Set();

  const accept = (rank, off, label, force, ns) => {
    // Cheapest rejection first: proximity.
    if (!force && lastOff >= 0 && off - lastOff < MIN_GAP) return false;
    label = cleanLabel(label);
    if (!label) return false;
    // Tier-1 rule: a ToC entry's own first occurrence is the ToC line itself —
    // skip it so the section lands on the body occurrence, never the ToC.
    if (toc && toc.toks.has(firstTokenLower(label))) {
      if (toc.hashes.has(keyHash(label))) {
        const k1 = cheapKey(label);
        if (toc.set.has(k1) && !seenTocKeys.has(k1)) {
          seenTocKeys.add(k1);
          return false;
        }
      }
    }
    if (!force && lastOff >= 0 && off - lastOff < MIN_GAP) return false;
    if (label === lastLabel && lastOff >= 0 && off - lastOff < 5000) return false;
    lastOff = off;
    lastLabel = label;
    cands.push({ off, label, rank, ns: !!ns });
    return true;
  };

  // Tier 1 helper: map the text's own ToC entries to body occurrences.
  // First-token + hash prefilters (range-based, no allocation); exact
  // cheapKey verify only on hit.
  const mapToc = (s, a, b) => {
    if (!toc || b - a > 60) return;
    const ft = firstTokenLowerRange(text, a, b);
    if (!ft || !toc.toks.has(ft)) return;
    if (!toc.hashes.has(keyHashRange(text, a, b))) return;
    const line = text.slice(a, b);
    if (toc.set.has(cheapKey(line))) accept(0, s, line);
  };

  const stripQuotes = (t) => {
    let qi = 0;
    while (qi < 3) {
      const qc = t.charCodeAt(qi);
      if (qc !== 34 && qc !== 39 && qc !== 40 && qc !== 91) break;
      qi++;
    }
    return qi > 0 ? t.slice(qi).replace(/^\s+/, '') : t;
  };

  // Main body pass: inlined line loop, range-based triage — line strings are
  // materialized only for rare promising lines.
  let s = 0;
  while (s < n) {
    let e = text.indexOf('\n', s);
    if (e < 0) e = n;
    let a = s;
    let b = e;
    if (b > a && text.charCodeAt(b - 1) === 13) b--;
    while (a < b) {
      const c = text.charCodeAt(a);
      if (c !== 32 && c !== 9) break;
      a++;
    }
    while (b > a) {
      const c = text.charCodeAt(b - 1);
      if (c !== 32 && c !== 9) break;
      b--;
    }
    if (a < b) {
      const tlen = b - a;
      const c = text.charCodeAt(a);
      if (tlen > MAX_LINE) {
        if (tlen <= 400 && ctx.verseChapters && c >= 48 && c <= 57) {
          const vm = VERSE3_RE.exec(text.slice(a, Math.min(b, a + 16)));
          if (vm) accept(1, s, ctx.bookName + ' ' + parseInt(vm[2], 10), true);
        } else if (
          tlen <= 200 &&
          delims.length < 2000 &&
          (c === 42 || c === 45 || c === 95 || c === 61 || c === 183 || c === 8226)
        ) {
          if (DELIM_RE.test(text.slice(a, b))) delims.push(s);
        }
      } else if (
        c === 42 ||
        c === 45 ||
        c === 95 ||
        c === 61 ||
        c === 183 ||
        c === 8226
      ) {
        if (delims.length < 2000 && DELIM_RE.test(text.slice(a, b))) delims.push(s);
      } else if (c === 35 || c === 167 || (c >= 48 && c <= 57)) {
        const t = stripQuotes(text.slice(a, b));
        if (t) {
          const r = classify(t, s, e, text, ctx);
          if (r) accept(r.rank, s, r.label, r.force, r.ns);
          else mapToc(s, a, b);
        }
      } else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
        const w = firstWordLowerRange(text, a, b);
        if (HEADWORDS.has(w) || ORDINAL_WORDS.has(w) || w === 'book') {
          const t = stripQuotes(text.slice(a, b));
          if (t) {
            const r = classify(t, s, e, text, ctx);
            if (r) accept(r.rank, s, r.label, r.force, r.ns);
            else mapToc(s, a, b);
          }
        } else if (c >= 65 && c <= 90) {
          if (isAllCapsHeadingRange(text, a, b)) accept(2, s, text.slice(a, b));
          else if (isRomanCharsRange(text, a, b)) {
            const t = text.slice(a, b);
            if (ROMAN_RE.test(t)) accept(2, s, t);
            else mapToc(s, a, b);
          } else mapToc(s, a, b);
        } else {
          mapToc(s, a, b);
        }
      } else if (c === 34 || c === 39 || c === 40 || c === 91) {
        const t = stripQuotes(text.slice(a, b));
        if (t) {
          const r = classify(t, s, e, text, ctx);
          if (r) accept(r.rank, s, r.label, r.force, r.ns);
          else mapToc(s, a, b);
        }
      } else {
        mapToc(s, a, b);
      }
    }
    s = e + 1;
  }

  let picked = null;
  let rank0 = 0;
  let numsec = 0;
  let weakCount = 0;
  for (const x of cands) {
    if (x.rank === 0) rank0++;
    else if (x.rank === 2) weakCount++;
    if (x.ns) numsec++;
  }
  // A flood of dotted-numbered lines is a numbered list (dictionary senses,
  // memo paragraphs), not chapters — drop them all.
  let pool = numsec > 60 ? cands.filter((x) => !x.ns) : cands;
  if (rank0 >= 2) picked = prune(pool.filter((x) => x.rank !== 2));
  // Weak-only floods (>60) are noise (OCR fragments, form labels), not
  // structure — fall back instead of emitting hundreds of junk rows.
  else if (rank0 === 0 && weakCount > 60) picked = null;
  else if (pool.length >= 6) picked = prune(pool);

  if (!picked || picked.length === 0) {
    // Tier 3: repeated structural delimiters separating substantial parts.
    let dSecs = null;
    if (delims.length >= 3 && delims.length <= 400) {
      const gaps = [delims[0]];
      for (let i = 1; i < delims.length; i++) gaps.push(delims[i] - delims[i - 1]);
      gaps.push(n - delims[delims.length - 1]);
      const sorted = gaps.slice().sort((a, b) => a - b);
      if (sorted[Math.floor(sorted.length / 2)] >= 2000) {
        const total = delims.length + 1;
        dSecs = delims.map((off, i) => ({ off, label: 'Part ' + (i + 2) + ' of ' + total }));
      }
    }
    if (dSecs) {
      picked = dSecs;
    } else {
      // Tier 4: honest equal-range fallback.
      const parts = Math.max(2, Math.min(12, Math.round(n / 150000)));
      picked = [];
      for (let i = 1; i < parts; i++) {
        picked.push({ off: Math.floor((i * n) / parts), label: 'Part ' + (i + 1) + ' of ' + parts });
      }
    }
  }

  const sections = [{ label: headLabel, offset: 0, percent: 0 }];
  for (const x of picked) {
    if (x.off <= 0) continue; // first section is always the title
    sections.push({ label: x.label, offset: x.off, percent: Math.round((100 * x.off) / n) });
  }
  return sections;
}
