// Section extraction for the Tower of Babel View Text reader's Contents panel
// (Apple Books-style). ESM, zero DOM/browser dependencies: importable by
// Node 18+ and bundled by Vite. Deterministic — the same text always yields
// identical sections.
//
// Detection tiers (in order):
//   1. The text's own table of contents: dense runs of ToC-like lines near
//      the head are parsed into entry keys; an entry's occurrence INSIDE
//      the ToC's char span (front matter only — the anchor must start in
//      the first 12% of the text) is skipped so sections land on the body
//      occurrence, never the ToC. Bare-name entries ("Ezra") map to their
//      body headings via a heading-form guard.
//   2. Explicit standalone headings: chapter/part/section/book/canto/surah/
//      article/act/scene/verse/psalm/appendix/… followed by a number (digits,
//      roman numerals, number words, single letters), the bare keyword alone,
//      or keyword + colon; ordinal phrases ("First Article", "Third Book of
//      Nephi"); "The <division> of …" titles ("The Book of Joshua", "The
//      Gospel According to…") in caps/title-case/isolated form; markdown #
//      headers; § markers; scripture book headers ("Book 01 Genesis") and,
//      in single-book scriptures only, chapter starts ("01:001:001");
//      dotted numbered headings ("1. Introduction", "2.1 Methods") that are
//      not wrapped paragraph lines; numbered ALL-CAPS standalone lines;
//      standalone roman numerals (kept only in consecutive sequence).
//   2b. Printed-matter cleanup: dense candidate runs whose labels mostly
//      reappear later are printed ToCs (head or mid-text) and drop out;
//      front-zone list copies (repeating labels) drop out; weak labels
//      recurring 3+ times across the text are speakers/running heads.
//      Selection keeps weak (ALL-CAPS) structure unless strong headings
//      dominate; a picked set huddled in the first 5% is front matter,
//      not navigation, and yields to the fallback.
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
const MIN_GAP = 20; // min chars between consecutive sections (stacked title + subtitle headings sit ~one line apart)

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
// "The <X> of …" division titles: scripture books and classic divisions whose
// heading starts with "The" ("The Book of Joshua", "The Gospel According to
// Saint Matthew", "The Acts of the Apostles", "The Words of Mormon"). The old
// first-word dispatch was blind to all of them — the KJV fell back to equal
// parts and the Book of Mormon's real books lost to front-matter noise.
const THE_SECOND_RANK0 = new Set(
  'book words acts gospel epistle revelation history life'.split(' ')
);
const THE_THIRD_NOUN = new Set('book part section chapter article'.split(' '));

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

// Lowercase nth word (0-based) of a short line, letters only.
function nthWordLower(t, n) {
  let word = 0;
  let i = 0;
  const len = t.length;
  while (i < len) {
    while (i < len && (t.charCodeAt(i) === 32 || t.charCodeAt(i) === 9)) i++;
    let w = '';
    while (i < len) {
      const c = t.charCodeAt(i);
      if (c >= 65 && c <= 90) w += String.fromCharCode(c + 32);
      else if (c >= 97 && c <= 122) w += t[i];
      else break;
      i++;
    }
    if (word === n) return w;
    word++;
    while (i < len && t.charCodeAt(i) !== 32 && t.charCodeAt(i) !== 9) i++;
  }
  return '';
}

// "The …" division headings (see THE_SECOND_RANK0): rank 0 or -1.
//   "The Book of Joshua" / "The Words of Mormon" / "The Gospel According to…"
//   "The First Book of Moses: Called Genesis" (ordinal + division noun)
// Anything else starting with "The" ("The Project Gutenberg eBook of…",
// running prose) is not a heading.
function theHeadingRank(t) {
  const w2 = nthWordLower(t, 1);
  if (THE_SECOND_RANK0.has(w2)) return 0;
  if (ORDINAL_WORDS.has(w2) && THE_THIRD_NOUN.has(nthWordLower(t, 2))) return 0;
  return -1;
}

function isAllCapsLine(t) {
  let letters = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c >= 97 && c <= 122) return false;
    if (c >= 65 && c <= 90) letters++;
  }
  return letters >= 3;
}

const TITLE_STOP = new Set('of the and to a an in by from or'.split(' '));
function isTitleCaseLine(t) {
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  let content = 0;
  for (const w of words) {
    const lw = w.toLowerCase().replace(/[^a-z']/g, '');
    if (!lw || TITLE_STOP.has(lw)) continue;
    content++;
    const c = w.charCodeAt(0);
    if (!(c >= 65 && c <= 90)) return false;
  }
  return content >= 2;
}

// A heading stands alone: blank line (or text edge) on both sides. Wrapped
// paragraph lines fail this — a paragraph's first line is followed by more
// paragraph lines — which is what keeps "The history of the family was…"
// (a wrapped body line) from ever counting as a "The …" heading.
function isIsolated(text, s, e) {
  let before = false;
  if (s <= 1) before = true;
  else {
    let i = s - 1;
    if (text.charCodeAt(i) === 10) i--;
    if (i < 0 || text.charCodeAt(i) === 10) before = true;
  }
  let after = false;
  const n = text.length;
  if (e >= n - 1) after = true;
  else {
    let i = e;
    if (text.charCodeAt(i) === 13) i++;
    if (text.charCodeAt(i) === 10) i++;
    if (i >= n || text.charCodeAt(i) === 10 || text.charCodeAt(i) === 13) after = true;
  }
  return before && after;
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
    if (w === 'the')
      return theHeadingRank(line) >= 0 &&
        (isAllCapsLine(line) || isTitleCaseLine(line))
        ? 2
        : 0;
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
    if (cur && t.idx - cur.lastIdx <= 6) {
      cur.items.push(t);
      cur.lastIdx = t.idx;
      if (t.kind === 2) cur.struct++;
    } else {
      if (cur) runs.push(cur);
      cur = { items: [t], firstIdx: t.idx, lastIdx: t.idx, struct: t.kind === 2 ? 1 : 0 };
    }
  }
  if (cur) runs.push(cur);
  // A table of contents is front matter: the anchor run must START in the
  // first 12% of the text. Without this, dense apparatus deep in a text
  // (a paper's methods subheads + file-size list at ~75%) can chain into
  // a false anchor whose span swallows real body headings.
  const ai = runs.findIndex(
    (r) => r.items.length >= 8 && r.struct >= 3 && r.items[0].s < text.length * 0.12
  );
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
  // Widen (2026-10-21): every short line inside the merged ToC span is an
  // entry, including ones tocKind can't rate on their own ("Ezra",
  // "Ecclesiastes", "The Proverbs") — without them those books could never
  // be mapped to their body headings.
  const spanFirst = runs[ai].firstIdx;
  const spanLast = runs[ei].lastIdx;
  scanLines(text, (s, e, idx) => {
    if (idx < spanFirst) return;
    if (idx > spanLast || set.size >= 6000) return false;
    if (e - s > 0 && e - s <= 64) {
      const line = trimLine(text, s, e);
      if (line) {
        const k1 = cheapKey(line);
        if (k1.length >= 4 && !set.has(k1)) {
          set.add(k1);
          hashes.add(keyHash(line));
          const ft = firstTokenLower(k1);
          if (ft) toks.add(ft);
        }
      }
    }
  });
  // The skip rule (accept) is position-aware: only occurrences INSIDE the
  // anchor run's char span count as "the ToC line itself". A label can
  // occur three times (title page, ToC, body) — occurrences outside the
  // span are body structure and must never be skipped. The span ends at
  // the anchor run's dense core: walking the entries, the span stops
  // before the first line-gap that dwarfs every gap before it (a body
  // heading standing two blank lines after a bare list — gaps of 1 —
  // must stay outside; a uniform abstract-style list — gaps of ~5 —
  // sets its own scale and is covered whole).
  const anchorItems = runs[ai].items;
  let spanEndItem = anchorItems[0];
  let maxGapSoFar = 0;
  for (let i2 = 1; i2 < anchorItems.length; i2++) {
    const g = anchorItems[i2].idx - anchorItems[i2 - 1].idx;
    if (maxGapSoFar > 0 && g > Math.max(2, 2 * maxGapSoFar)) break;
    if (g > maxGapSoFar) maxGapSoFar = g;
    spanEndItem = anchorItems[i2];
  }
  return {
    set,
    hashes,
    toks,
    startOff: anchorItems[0].s,
    endOff: spanEndItem.e,
  };
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
    if (w === 'the') {
      // "The …" division titles — accepted only in unmistakably heading
      // form (ALL-CAPS, Title Case, or standing alone between blanks) so
      // wrapped body lines can never qualify. A sentence-terminated line
      // ("The words of Job are ended.") needs caps or title case: standing
      // alone is not enough.
      const sentenceEnded = /[.,;:]$/.test(t);
      if (
        theHeadingRank(t) >= 0 &&
        (isAllCapsLine(t) ||
          isTitleCaseLine(t) ||
          (!sentenceEnded && isIsolated(text, s, e)))
      )
        return { rank: 0, label: t };
      // No return: ALL-CAPS "THE …" lines that aren't division titles
      // ("THE PX SUBMISSION TOOL") still reach the caps checks below.
    }
    if (HEADWORDS.has(w)) {
      const r = headwordRank(t, w);
      if (r >= 0) return { rank: 0, label: t };
      return null;
    }
    if (ORDINAL_WORDS.has(w) && ORDINAL_NOUNS.has(secondWordLower(t, w.length))) {
      // Full strict check (gated by the cheap Set hits): "First Article",
      // "Second Chapter 3" — but not "fourth part of an hin" (body text).
      if (ORDINAL_FULL_RE.test(t)) return { rank: 1, label: t };
      // "Third Book of Nephi" form: ordinal + Book + of + Name. Restricted
      // to 'book' (prose is full of "first part of…") and to heading form.
      if (
        secondWordLower(t, w.length) === 'book' &&
        /^\S+\s+book\s+of\s+[A-Z]/i.test(t) &&
        (isAllCapsLine(t) || isTitleCaseLine(t) || isIsolated(text, s, e))
      )
        return { rank: 1, label: t };
      return null;
    }
    if (w === 'book' && BOOKHDR_RE.test(t)) return { rank: 0, label: t };
    if (up) {
      if (isAllCapsHeading(t)) {
        // Ordinal-led short caps lines are real divisions in scripture and
        // the classics ("FOURTH NEPHI") — minor, not weak noise.
        if (ORDINAL_WORDS.has(w) && t.split(/\s+/).length <= 6)
          return { rank: 1, label: t };
        return { rank: 2, label: t };
      }
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

// Printed-matter purges (2026-10-21): candidates that come from the text's
// own printed apparatus — title pages, witness lists, printed tables of
// contents — rather than from body structure. Two signatures:
//  (a) Echo runs: a dense run of candidates (≥4, gaps < 500 chars — list
//      lines have no body between them) whose labels mostly REAPPEAR as
//      later candidates is a printed ToC (at the head, or mid-text like a
//      New Testament list before the Gospels); the body copies stay.
//  (b) Front clusters: in the front zone, candidates packed at list
//      density before the first candidate that is followed by a real body
//      gap are front matter (the Book of Mormon's title-page lines and
//      witness names sat at 0% as "sections" before this).
// A candidate followed by ≥1500 chars before the next one behaves like a
// body heading and is never purged by either rule.
function purgePrinted(cands, n) {
  if (cands.length < 5) return cands;
  const drop = new Set();
  const keyOf = (x) => cheapKey(x.label);
  const gapAfter = (k) =>
    (k + 1 < cands.length ? cands[k + 1].off : n) - cands[k].off;
  let i = 0;
  while (i < cands.length) {
    let j = i;
    while (j + 1 < cands.length && cands[j + 1].off - cands[j].off < 500) j++;
    const runLen = j - i + 1;
    if (runLen >= 4) {
      const later = new Set();
      for (let k = j + 1; k < cands.length; k++) later.add(keyOf(cands[k]));
      let echo = 0;
      for (let k = i; k <= j; k++) if (later.has(keyOf(cands[k]))) echo++;
      if (echo >= Math.ceil(runLen * 0.6)) {
        for (let k = i; k <= j; k++) {
          // Drop only members that are themselves list copies: their
          // label echoes later, or they sit at bare-list density. The
          // run's tail can be a body heading glued to the list (the Book
          // of Mormon heading 22 chars after the last entry, followed by
          // a chapter-summary line ~1000 chars on) — its label never
          // echoes verbatim, and it must survive.
          if (later.has(keyOf(cands[k])) || gapAfter(k) < 200) drop.add(k);
        }
      }
    }
    i = j + 1;
  }
  const zone = Math.max(6000, Math.round(n * 0.08));
  let bodyStart = -1;
  for (let k = 0; k < cands.length; k++) {
    if (cands[k].off >= zone) break;
    if (gapAfter(k) >= 1500) {
      bodyStart = k;
      break;
    }
  }
  if (bodyStart > 0) {
    // Drop only front-zone candidates whose label REPEATS later — a
    // printed list copy, whatever its rank or spacing (abstract-style
    // contents entries sit 600+ chars apart; a law's short opening
    // sections sit ~300 apart but never repeat, and must survive).
    // Non-repeating front matter (title-page lines, witness names) is
    // left to the selection stage, which drops weak candidates whenever
    // strong headings dominate.
    const labelCounts = new Map();
    for (const x of cands) {
      const k = keyOf(x);
      labelCounts.set(k, (labelCounts.get(k) || 0) + 1);
    }
    for (let k = 0; k < bodyStart; k++) {
      if (labelCounts.get(keyOf(cands[k])) >= 2 && gapAfter(k) < 1500) drop.add(k);
    }
    // Publisher/title-page blocks: when the front zone carries a crowd
    // of weak candidates (≥6 — a law's two or three opening section
    // heads don't qualify), clustered weak lines before the body start
    // are imprint and dedication junk ("PRINTED AT THE UNIVERSITY
    // PRESS BY", "MCMIV"), however the book's structure shapes up.
    let frontWeak = 0;
    for (const x of cands) if (x.off < zone && x.rank === 2) frontWeak++;
    if (frontWeak >= 6) {
      for (let k = 0; k < bodyStart; k++) {
        if (cands[k].rank !== 2) continue;
        const gapPrev = k > 0 ? cands[k].off - cands[k - 1].off : Infinity;
        if (gapAfter(k) < 500 || gapPrev < 500) drop.add(k);
      }
    }
  }
  if (drop.size === 0) return cands;
  return cands.filter((_, idx) => !drop.has(idx));
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
    // Tier-1 rule: a ToC entry's occurrence INSIDE the ToC span is the ToC
    // line itself — skip it (once per key) so the section lands on the
    // body occurrence, never the ToC. Occurrences outside the span are
    // body structure (a title can appear on the title page, in the ToC,
    // and as a body heading — only the in-span one is the list copy).
    if (toc && off >= toc.startOff && off <= toc.endOff && toc.toks.has(firstTokenLower(label))) {
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
  const mapToc = (s, e, a, b) => {
    if (!toc || b - a > 60) return;
    // A wrapped verse/prose fragment can exactly equal a bare-name ToC
    // entry ("Zechariah." inside a genealogy) — fragments carry sentence
    // punctuation; real bare-name headings don't.
    const lastC = text.charCodeAt(b - 1);
    if (lastC === 46 || lastC === 44 || lastC === 59 || lastC === 58) return;
    const ft = firstTokenLowerRange(text, a, b);
    if (!ft || !toc.toks.has(ft)) return;
    if (!toc.hashes.has(keyHashRange(text, a, b))) return;
    const line = text.slice(a, b);
    if (!toc.set.has(cheapKey(line))) return;
    // The matched line must stand in the body like a heading (caps, title
    // case, or blank-surrounded) — a wrapped prose line that merely
    // equals a set entry is not a section.
    if (!isAllCapsLine(line) && !isTitleCaseLine(line) && !isIsolated(text, s, e)) return;
    accept(0, s, line);
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
          else mapToc(s, e, a, b);
        }
      } else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
        const w = firstWordLowerRange(text, a, b);
        if (HEADWORDS.has(w) || ORDINAL_WORDS.has(w) || w === 'book' || w === 'the') {
          const t = stripQuotes(text.slice(a, b));
          if (t) {
            const r = classify(t, s, e, text, ctx);
            if (r) accept(r.rank, s, r.label, r.force, r.ns);
            else mapToc(s, e, a, b);
          }
        } else if (c >= 65 && c <= 90) {
          if (isAllCapsHeadingRange(text, a, b)) accept(2, s, text.slice(a, b));
          else if (isRomanCharsRange(text, a, b)) {
            const t = text.slice(a, b);
            if (ROMAN_RE.test(t)) accept(2, s, t);
            else mapToc(s, e, a, b);
          } else mapToc(s, e, a, b);
        } else {
          mapToc(s, e, a, b);
        }
      } else if (c === 34 || c === 39 || c === 40 || c === 91) {
        const t = stripQuotes(text.slice(a, b));
        if (t) {
          const r = classify(t, s, e, text, ctx);
          if (r) accept(r.rank, s, r.label, r.force, r.ns);
          else mapToc(s, e, a, b);
        }
      } else {
        mapToc(s, e, a, b);
      }
    }
    s = e + 1;
  }

  const kept = purgePrinted(cands, n);

  // Bare roman-numeral candidates are chapter markers only in sequence
  // (I, II, III, …): a chain of 3+ consecutive values is structure.
  // Scattered roman-valid letters in scientific texts ("C", "X", "V" —
  // symbols stranded on their own lines) are not sections.
  const ROMAN_VAL = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const romanVal = (s) => {
    let v = 0;
    for (let i = 0; i < s.length; i++) {
      const cur = ROMAN_VAL[s[i]];
      const nxt = ROMAN_VAL[s[i + 1]] || 0;
      v += cur < nxt ? -cur : cur;
    }
    return v;
  };
  const isBareRoman = (x) =>
    x.rank === 2 && /^[MDCLXVI]{1,8}$/.test(x.label) && ROMAN_RE.test(x.label);
  const romanKeep = new Set();
  {
    let chain = [];
    const flush = () => {
      if (chain.length >= 3) for (const x of chain) romanKeep.add(x);
      chain = [];
    };
    for (const x of kept) {
      if (!isBareRoman(x)) continue;
      if (chain.length && romanVal(x.label) === romanVal(chain[chain.length - 1].label) + 1)
        chain.push(x);
      else {
        flush();
        chain = [x];
      }
    }
    flush();
  }
  // Speaker / running-head rule: a weak label that recurs 3+ times across
  // a wide span is a dialogue speaker ("A LORD.", "A SOLDIER.") or a
  // running head, never a section — real section titles don't repeat
  // like that. (Single-word speakers like "HAMLET" never classify.)
  const labelSpan = new Map();
  for (const x of kept) {
    const k = cheapKey(x.label);
    const cur = labelSpan.get(k);
    if (cur) {
      cur.count++;
      cur.last = x.off;
    } else labelSpan.set(k, { count: 1, first: x.off, last: x.off });
  }
  const isRecurringWeak = (x) => {
    if (x.rank !== 2) return false;
    const s = labelSpan.get(cheapKey(x.label));
    return s && s.count >= 3 && s.last - s.first > n * 0.1;
  };

  const kept2 = kept.filter(
    (x) => !isRecurringWeak(x) && (!isBareRoman(x) || romanKeep.has(x))
  );
  let picked = null;
  let rank0 = 0;
  let numsec = 0;
  let weakCount = 0;
  let weakReal = 0; // weak with a real-word label (≥4 chars) — single-char
  // roman/symbol junk ("C", "L", "X" in a science paper) doesn't count
  // when judging whether strong headings dominate.
  for (const x of kept2) {
    if (x.rank === 0) rank0++;
    else if (x.rank === 2) {
      weakCount++;
      if (x.label.length >= 4) weakReal++;
    }
    if (x.ns) numsec++;
  }
  // A flood of dotted-numbered lines is a numbered list (dictionary senses,
  // memo paragraphs), not chapters — drop them all.
  let pool = numsec > 60 ? kept2.filter((x) => !x.ns) : kept2;
  // Drop weak candidates only when strong headings DOMINATE — in mixed
  // documents (laws, papers) the ALL-CAPS lines ARE the structure, and a
  // stray pair of keyword headings must not nuke them. Exception: a weak
  // FLOOD (>60) alongside a solid strong skeleton (≥10) is granularity
  // noise (chapter subheads, running heads) — drop it.
  if (
    rank0 >= 2 &&
    (rank0 >= weakReal || (weakReal > 60 && rank0 >= 10))
  )
    picked = prune(pool.filter((x) => x.rank !== 2));
  // Weak-only floods (>60) are noise (OCR fragments, form labels), not
  // structure — fall back instead of emitting hundreds of junk rows.
  else if (rank0 === 0 && weakCount > 60) picked = null;
  else if (pool.length >= 6) picked = prune(pool);

  // Coverage rule: a handful of "sections" huddled in the first 5% is
  // front matter that matched heading forms, not navigation (a one-tale
  // volume whose only matches are its title lines). The delimiter /
  // equal-parts fallback below serves such texts better.
  if (picked && picked.length <= 5 && picked[picked.length - 1].off < n * 0.05)
    picked = null;

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
  const headKey = cheapKey(headLabel);
  for (const x of picked) {
    if (x.off <= 0) continue; // first section is always the title
    // A title-page line repeating the entry's own title in the first 1%
    // is the title page, not a section (the same label deep in the text —
    // "THE BOOK OF MORMON" the book within the Book of Mormon — stays).
    if (x.off < n * 0.01 && cheapKey(x.label) === headKey) continue;
    sections.push({ label: x.label, offset: x.off, percent: Math.round((100 * x.off) / n) });
  }
  return sections;
}
