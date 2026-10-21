// ---------------------------------------------------------------------------
// Library search relevance: normalization, token matching, field-weighted
// scoring, and a curated canon of landmark works pinned to the top.
//
// Why: plain substring search + alphabetical order buries the actual work
// a user wants ("bible" returned concordances and dictionaries first, and
// "quran" missed "Koran"/"Al-Qur'an" titles entirely on the apostrophe).
// The canon below is hand-picked from the catalog itself — for each major
// sacred / landmark work, the entry (or ordered entries) a searcher almost
// certainly means. Pins only fire on an exact alias (or same token set);
// they resolve against the loaded catalog and silently skip ids that are
// not present, so the list can never break search.
// ---------------------------------------------------------------------------

// One normalization for queries, titles, and haystacks: lowercase, drop
// apostrophes (qur'an -> quran, pilgrim's -> pilgrims), turn every other
// punctuation mark into a space, collapse whitespace.
export function normText(s) {
  return (s || "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function queryTokens(qNorm) {
  return qNorm ? qNorm.split(" ").filter(Boolean) : [];
}

const CANON = [
  // --- Sacred texts & world religions -------------------------------------
  { aliases: ["bible", "the bible", "holy bible", "the holy bible", "king james bible", "king james version", "kjv"],
    ids: ["holy-bible-king-james-version", "tob-10477", "tob-10051-d1"] },
  { aliases: ["quran", "the quran", "koran", "the koran", "al quran", "alcoran", "the koran al quran"],
    ids: ["tob-10501", "pickthall-meaning-glorious-koran-1930", "tob-4148"] },
  { aliases: ["book of mormon", "the book of mormon"],
    ids: ["tob-0214"] },
  { aliases: ["torah"],
    ids: ["tyndale-pentateuch-1530", "tob-0006"] },
  { aliases: ["pentateuch", "the pentateuch"],
    ids: ["tyndale-pentateuch-1530"] },
  { aliases: ["tanakh", "hebrew bible", "jewish bible", "the tanakh"],
    ids: ["tob-0006"] },
  { aliases: ["old testament", "the old testament"],
    ids: ["tob-0006", "holy-bible-king-james-version"] },
  { aliases: ["new testament", "the new testament"],
    ids: ["rheims-new-testament-1582", "bible-tyndale-new-testament-1526"] },
  { aliases: ["psalms", "book of psalms", "the psalms", "psalter"],
    ids: ["tanakh-jps-1917-psalms", "tob-0006"] },
  { aliases: ["talmud", "babylonian talmud", "the talmud"],
    ids: ["babylonian-talmud-rodkinson-vol-1", "barclay-talmud-1878"] },
  { aliases: ["mishnah", "mishna", "the mishnah"],
    ids: ["danby-mishnah-1933"] },
  { aliases: ["zohar", "the zohar", "sepher ha zohar"],
    ids: ["zohar-de-pauly-french-vol-1-1906"] },
  { aliases: ["kabbalah", "cabala"],
    ids: ["kabbalah-unveiled-mathers-1887", "waite-holy-kabbalah-1929"] },
  { aliases: ["book of enoch", "enoch", "1 enoch", "the book of enoch"],
    ids: ["tob-0009", "tob-10273"] },
  { aliases: ["bhagavad gita", "the bhagavad gita", "gita", "bhagavadgita"],
    ids: ["tob-0004", "tob-10418", "judge-bhagavad-gita-1890"] },
  { aliases: ["upanishads", "the upanishads"],
    ids: ["tob-13450", "tob-9104"] },
  { aliases: ["rig veda", "rigveda", "the rig veda"],
    ids: ["rig-veda-griffith-1896", "tob-9100"] },
  { aliases: ["vedas", "the vedas", "four vedas"],
    ids: ["tob-0003", "rig-veda-griffith-1896"] },
  { aliases: ["ramayana", "the ramayana"],
    ids: ["tob-13328", "dutt-ramayana-bala-kanda"] },
  { aliases: ["mahabharata", "the mahabharata"],
    ids: ["dutt-mahabharata-adi-parva"] },
  { aliases: ["dhammapada", "the dhammapada"],
    ids: ["tob-10233", "tob-13149"] },
  { aliases: ["lotus sutra"],
    ids: ["tob-10236"] },
  { aliases: ["diamond sutra"],
    ids: ["tob-10234"] },
  { aliases: ["heart sutra"],
    ids: ["heart-sutra-muller-sbe49"] },
  { aliases: ["tao te ching", "daodejing", "tao teh ching", "tao teh king"],
    ids: ["tob-0005", "tao-te-ching-legge-1891"] },
  { aliases: ["analects", "analects of confucius", "the analects", "confucian analects"],
    ids: ["tob-10415", "tob-13155"] },
  { aliases: ["i ching", "book of changes", "yi king", "the i ching"],
    ids: ["i-ching-legge-1882"] },
  { aliases: ["art of war", "the art of war"],
    ids: ["art-of-war-giles-1910"] },
  { aliases: ["tibetan book of the dead", "bardo thodol"],
    ids: ["tibetan-book-of-dead-evans-wentz-1927", "tob-12912"] },
  { aliases: ["book of the dead", "egyptian book of the dead", "the book of the dead"],
    ids: ["tob-0172", "tibetan-book-of-dead-evans-wentz-1927"] },
  { aliases: ["popol vuh", "the popol vuh"],
    ids: ["popol-vuh-spence-1908", "brasseur-popol-vuh-1861"] },
  { aliases: ["avesta", "zend avesta", "zend-avesta", "the avesta"],
    ids: ["tob-4107", "sbe-23-zend-avesta-2-1883"] },
  { aliases: ["confessions of st augustine", "augustine confessions", "st augustine confessions", "augustines confessions"],
    ids: ["augustine-confessions-watts-vol-1-1919"] },
  // --- Landmark works ------------------------------------------------------
  { aliases: ["meditations", "meditations of marcus aurelius", "marcus aurelius meditations"],
    ids: ["marcus-aurelius-meditations-long", "marcus-aurelius-meditations-casaubon-163"] },
  { aliases: ["divine comedy", "the divine comedy", "divina commedia", "dantes divine comedy"],
    ids: ["dante-divine-comedy-cary-1814", "the-divine-comedy-volume-1-hell"] },
  { aliases: ["paradise lost"],
    ids: ["milton-paradise-lost-1667", "paradise-lost"] },
  { aliases: ["pilgrims progress", "the pilgrims progress"],
    ids: ["bunyan-pilgrims-progress-1678"] },
  { aliases: ["iliad", "the iliad"],
    ids: ["homer-iliad-butler", "the-iliad", "homer-iliad-pope-1715"] },
  { aliases: ["odyssey", "the odyssey"],
    ids: ["homer-odyssey-butler", "the-odyssey-of-homer", "homer-odyssey-pope-1725"] },
  { aliases: ["aeneid", "the aeneid"],
    ids: ["virgil-aeneid-dryden-1697"] },
  { aliases: ["beowulf"],
    ids: ["beowulf", "tob-3003"] },
  { aliases: ["don quixote", "don quijote"],
    ids: ["tob-4030", "cervantes-don-quixote-shelton-1612"] },
  { aliases: ["the republic", "republic plato", "platos republic", "plato republic"],
    ids: ["the-republic", "tob-14431"] },
  { aliases: ["origin of species", "on the origin of species", "the origin of species"],
    ids: ["darwin-origin-of-species-1st-ed-1859", "tob-10200-d1"] },
  { aliases: ["wealth of nations", "the wealth of nations"],
    ids: ["smith-wealth-nations-cannan-1904", "tob-4029"] },
  { aliases: ["communist manifesto", "the communist manifesto"],
    ids: ["marx-communist-manifesto", "marx-manifesto-1848"] },
  { aliases: ["common sense"],
    ids: ["common-sense-thomas-paine", "common-sense"] },
  { aliases: ["hamlet"],
    ids: ["shakespeare-hamlet-1603", "hamlet"] },
  { aliases: ["shakespeare", "complete works of shakespeare", "shakespeare complete works", "works of shakespeare", "william shakespeare"],
    ids: ["shakespeare-complete-works-1623"] },
  { aliases: ["moby dick"],
    ids: ["melville-moby-dick-1851", "moby-dick-or-the-whale"] },
  { aliases: ["pride and prejudice"],
    ids: ["austen-pride-and-prejudice-1813"] },
  { aliases: ["canterbury tales", "the canterbury tales"],
    ids: ["chaucer-canterbury-tales-1387"] },
  { aliases: ["the prince", "machiavelli the prince", "machiavellis prince"],
    ids: ["tob-4002", "machiavelli-prince-dacres-1640"] },
  { aliases: ["federalist papers", "the federalist papers", "the federalist"],
    ids: ["federalist-papers", "the-federalist-papers"] },
  { aliases: ["constitution", "us constitution", "united states constitution", "constitution of the united states", "the constitution"],
    ids: ["us-constitution-bill-of-rights"] },
  { aliases: ["declaration of independence", "the declaration of independence"],
    ids: ["us-declaration-of-independence"] },
  { aliases: ["kalevala", "the kalevala"],
    ids: ["kalevala-the-epic-poem-of-finland-complete", "kalevala-vol-1-kirby-1907"] },
  { aliases: ["prose edda"],
    ids: ["prose-edda-brodeur-1916"] },
  { aliases: ["poetic edda", "elder edda"],
    ids: ["tob-0167"] },
  { aliases: ["edda"],
    ids: ["prose-edda-brodeur-1916", "tob-0167"] },
  { aliases: ["darwin", "charles darwin"],
    ids: ["darwin-origin-of-species-1st-ed-1859"] },
  { aliases: ["jesus", "jesus christ"],
    ids: ["holy-bible-king-james-version", "catholic-encyclopedia-1913-jesus-christ"] },
];

// alias -> ordered ids. Aliases are stored pre-normalized (same normText).
const PIN_MAP = new Map();
for (const entry of CANON) {
  for (const a of entry.aliases) PIN_MAP.set(a, entry.ids);
}

// Pinned ids for a query, or null. Fires on an exact normalized alias or
// when the query's token SET equals an alias's token set (word order and
// repeats don't matter). A query with extra words beyond an alias does
// NOT fire — the user is asking for something more specific.
export function pinsForQuery(qNorm, tokens) {
  if (!qNorm) return null;
  const direct = PIN_MAP.get(qNorm);
  if (direct) return direct;
  const set = new Set(tokens);
  if (set.size !== tokens.length && set.size === 0) return null;
  for (const [alias, ids] of PIN_MAP) {
    const at = alias.split(" ");
    if (at.length !== set.size) continue;
    let ok = true;
    for (const t of at) if (!set.has(t)) { ok = false; break; }
    if (ok) return ids;
  }
  return null;
}

// Words that mark a work as being ABOUT a text rather than the text
// itself. Demoted only when the word is not part of the query (someone
// searching "bible dictionary" wants the dictionary).
export const SECONDARY_MARKERS = [
  "commentary", "dictionary", "encyclopedia", "encyclopaedia",
  "concordance", "study guide", "companion", "handbook of",
  "introduction to", "history of", "notes on", "about the",
  "explained", "for children", "for kids", "story of the",
  "stories from", "life of", "biography",
];

function hasWordPhrase(hay, phrase) {
  return (" " + hay + " ").includes(" " + phrase + " ");
}

// --- Precomputed-field scoring (2026-10-21 speed pass) ---------------------
// scoreArtifact normalized the title, creator, and collection of every
// matching record on every query — three regex-heavy normText calls per
// record per keystroke, which dominated query time at catalog scale. The
// catalog derivation now precomputes those normalized fields once (plus a
// secondary-marker bitmask and a volume-number flag per record), and the
// search loop calls scoreArtifactPre with them. scoreArtifact delegates
// to the same core, so the two paths can never drift apart.

// Bit i of the mask = SECONDARY_MARKERS[i] appears (word-boundary) in the
// already-normalized title.
export function secondaryMaskFor(normTitle) {
  let mask = 0;
  for (let i = 0; i < SECONDARY_MARKERS.length; i++) {
    if (hasWordPhrase(normTitle, SECONDARY_MARKERS[i])) mask |= 1 << i;
  }
  return mask;
}

// Bit i = SECONDARY_MARKERS[i] appears (substring, matching the original
// semantics) in the normalized query — such markers do not demote.
export function querySecondaryMask(qNorm) {
  let mask = 0;
  for (let i = 0; i < SECONDARY_MARKERS.length; i++) {
    if (qNorm.includes(SECONDARY_MARKERS[i])) mask |= 1 << i;
  }
  return mask;
}

const VOLNUM_RE = /\b(vol|volume|part) \d+/;
const VOLQUERY_RE = /\b(vol|volume|part|book)\b/;

// Field-weighted relevance from precomputed normalized fields.
// T/C/coll: normText of title / creator / (collection + subcategory label).
// secMask: secondaryMaskFor(T). hasVolNum: VOLNUM_RE.test(T) ? 1 : 0.
// qMask: querySecondaryMask(qNorm).
export function scoreArtifactPre(T, C, coll, secMask, hasVolNum, qNorm, tokens, qMask) {
  if (!T) return 0;
  const paddedT = " " + T + " ";
  let s = 0;
  // Title identity / phrase placement.
  if (T === qNorm || T === "the " + qNorm || "the " + T === qNorm) {
    s += 1000;
  } else if (paddedT.startsWith(" " + qNorm + " ") || T.startsWith(qNorm + " ")) {
    s += 550;
  } else if (paddedT.includes(" " + qNorm + " ")) {
    s += 380;
  }
  // All query tokens present in the title (word-boundary) — the classic
  // shape of a primary text for a multi-word work name.
  let hits = 0;
  for (const t of tokens) if (paddedT.includes(" " + t + " ")) hits++;
  if (tokens.length > 0 && hits === tokens.length) s += 160;
  else if (hits > 0) s += Math.round(80 * (hits / tokens.length));
  // Creator match.
  if (C) {
    if (C === qNorm) s += 120;
    else if ((" " + C + " ").includes(" " + qNorm + " ")) s += 60;
    // Cross-field: every token covered by title + creator together
    // ("einstein relativity" -> Einstein's own relativity books).
    if (tokens.length > 1 && hits < tokens.length) {
      const paddedC = " " + C + " ";
      let covered = 0;
      for (const t of tokens) {
        if (paddedT.includes(" " + t + " ") || paddedC.includes(" " + t + " ")) covered++;
      }
      if (covered === tokens.length) s += 140;
    }
  }
  // Collection / subcategory mention.
  if (coll && (" " + coll + " ").includes(" " + qNorm + " ")) s += 40;
  // Secondary-literature demotion (markers absent from the query).
  if ((secMask & ~qMask) !== 0) s -= 160;
  // Multi-volume / partial-set demotion for bare-name queries: a bare
  // "talmud" should not land on Vol. 11. Pins cover the Vol. 1 cases.
  if (!VOLQUERY_RE.test(qNorm) && hasVolNum) s -= 70;
  // Shorter titles win ties — primary texts have terse titles.
  s += Math.max(0, 24 - Math.floor(T.length / 3));
  return s;
}

// Field-weighted relevance of one catalog record for a normalized query.
// a: the artifact; subLabel: its subcategory label ("" when none).
// Delegates to scoreArtifactPre with on-the-fly normalization — the hot
// search loop passes precomputed fields to the same core instead.
export function scoreArtifact(a, subLabel, qNorm, tokens) {
  const T = normText(a.title || "");
  if (!T) return 0;
  const C = normText(a.creator || "");
  const coll = normText((a.collection || "") + " " + (subLabel || ""));
  return scoreArtifactPre(
    T,
    C,
    coll,
    secondaryMaskFor(T),
    VOLNUM_RE.test(T) ? 1 : 0,
    qNorm,
    tokens,
    querySecondaryMask(qNorm)
  );
}
