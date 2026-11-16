// Tower of Babel — Collections browser data (SPA side).
//
// The Collections browser is a FILTER on the main Tower page's existing
// entry list, not a set of pages. Curated membership ships as TCU1
// bitsets inside the TCB1 dataset (tcb1-data/curated.bin, baked by
// scripts/build-curated-bitsets.mjs from the design packages' verified
// member lists); the hub index JSON remains the fallback for the one
// group it can still express (Sacred traditions) when no bitsets are
// available.
//
// Taxonomy (2026-11-15 collections package): the Curated axis carries
// six groups — Sacred traditions (unchanged), For Law Students,
// For Med Students, Engineering, Conspiracy, and Mathematics and
// Sciences (which replaces the old four-shelf "Study shelves" group
// under the same internal "audiences" id, per its design). The Books
// lane's subcategories are the 61-shelf Books expansion, delivered as
// `bookshelf:` bitsets and rendered in the Collections axis' sub slot
// (multi-match shelves cannot be a prefix partition). The Papers
// lane's subcategories are the subject-enrichment taxonomy (12 fields,
// 70 subfields, 10 publication types), delivered as `paperfield:` /
// `papersub:` / `papertype:` bitsets and rendered in the same sub
// slot (shipped 2026-11-16; see buildCollectionsFromBitsets). Removed and
// never returning: the "Declassified programmes" curated group (its
// subcategories merged into the Declassified lane's own subcategory
// list — see tower-taxonomy.js) and "Course primary sources" (entries
// stay in their home collections). Empty shelves ship as markers with
// honest zero counts (Joshua's standing rule) — never padded.
//
// Labels and blurbs for the new groups live in
// tower-collections-data.js, generated from the design packages so the
// panel's text is the designs' own. Tradition blurbs below are copied
// verbatim from functions/_lib/tower-hubs.js (the server hub
// definitions) so the in-page browser says exactly what the old hub
// pages said. This module must NOT import server function code — the
// SPA bundle cannot run Pages Function modules, and the blurbs are
// content, not logic.
//
// Loading is lazy and failure-tolerant: loadHubsIndex() fetches the
// JSON once per session and resolves null on any failure, in which
// case the Tower page hides the Collections UI and keeps the existing
// category browse — never an error panel.

// Group order is the panel's depth order inside the Curated axis:
// Sacred traditions first (the editorial shelf), then the student and
// subject collections, with Mathematics and Sciences last (the deepest
// cut, where Study shelves sat). The Authors group was removed
// 2026-11-11 (way too broad as a browse axis; authors stay reachable
// through search, and the hub index still carries topAuthors for the
// server-side author hub pages and the API).
export const COLLECTION_GROUPS = [
  { id: "traditions", label: "Sacred traditions" },
  { id: "law", label: "For Law Students" },
  { id: "med", label: "For Med Students" },
  { id: "eng", label: "Engineering" },
  { id: "conspiracy", label: "Conspiracy" },
  { id: "audiences", label: "Mathematics and Sciences" },
];

import {
  LAW_COLLECTIONS,
  MED_COLLECTIONS,
  ENG_COLLECTIONS,
  CONSPIRACY_COLLECTIONS,
  MATHSCI_SHELVES,
  BOOKS_SHELVES,
  PAPER_FIELDS,
  PAPER_TYPES,
} from "./tower-collections-data.js";

// id -> {label, blurb} lookup for one taxonomy table.
function tableLookup(table) {
  const m = new Map();
  for (const e of table) m.set(e.id, e);
  return m;
}
const LAW_LOOKUP = tableLookup(LAW_COLLECTIONS);
const MED_LOOKUP = tableLookup(MED_COLLECTIONS);
const ENG_LOOKUP = tableLookup(ENG_COLLECTIONS);
const CONSPIRACY_LOOKUP = tableLookup(CONSPIRACY_COLLECTIONS);
const MATHSCI_LOOKUP = tableLookup(MATHSCI_SHELVES);
const BOOKS_LOOKUP = tableLookup(BOOKS_SHELVES);

// Books shelf descriptors WITHOUT membership (labels/blurbs/wings in
// display order) — the panel renders the Books sub slot from the TCU1
// descriptors when they exist; this table is its text source and the
// ordering authority when counts are attached.
export function booksShelfTable() {
  return BOOKS_SHELVES;
}

export const TRADITION_BLURBS = {
  jainism:
    "Jain scripture and scholarship in the Tower: the Kalpa Sutra and Uttaradhyayana Sutra in Jacobi's Sacred Books of the East translations, alongside catalog-matched Jain works.",
  shinto:
    "The foundational records of Shinto in the Tower: Chamberlain's Kojiki and Aston's Nihongi — the two chronicles on which the tradition's mythology rests — plus catalog-matched works on Shinto.",
  zoroastrianism:
    "The Zend Avesta in the Tower — the scripture of Zoroastrianism in the Sacred Books of the East translations — with catalog-matched works on the Avesta, Zoroaster, and the tradition.",
  lds: "Latter-day Saint scripture in the Tower: the Book of Mormon, the 1835 Doctrine and Covenants, and the Pearl of Great Price, with catalog-matched works on the movement and its texts.",
  buddhism:
    "Buddhist texts in the Tower: the Dhammapada, the Pali Nikayas in Sujato's translations, the Jatakas, and the Tibetan Book of the Dead, with catalog-matched works across Theravada, Mahayana, and Tibetan traditions.",
  hinduism:
    "Hindu scripture in the Tower: the Bhagavad Gita, Griffith's Rig Veda, the Upanishads, the Ramayana, and Wilson's Vishnu Purana, with catalog-matched Vedic, epic, and Puranic works.",
  "taoism-china":
    "Taoist and classical Chinese texts in the Tower: the Tao Te Ching, the Analects of Confucius, Legge's I Ching, Chuang Tzu, and the Art of War, with catalog-matched works on Taoism and Confucian thought.",
  islam:
    "Islamic texts in the Tower: Pickthall's Meaning of the Glorious Koran, Al-Ghazali's Mishkat Al-Anwar and Confessions, with catalog-matched works on the Quran, Hadith, and Sufism.",
  judaism:
    "Jewish scripture and scholarship in the Tower: the JPS 1917 Tanakh, the Talmud, the Targums, and the Zohar, with catalog-matched works on Torah, Mishnah, Midrash, and Kabbalah.",
  "egypt-mesopotamia":
    "Ancient Egyptian and Mesopotamian texts in the Tower: the Egyptian Book of the Dead, the Epic of Gilgamesh, and Enuma Elish, with catalog-matched works on Egypt, Babylon, Assyria, and Sumer.",
  "indigenous-folk":
    "Indigenous and folk tradition texts in the Tower: the Popol Vuh, the Chilam Balam of Chumayel, and Kirby's Kalevala, with catalog-matched works on Maya, Aztec, Inca, Native American, and folk traditions worldwide.",
  "greek-roman":
    "Greek and Roman classics in the Tower: Butler's Iliad and Odyssey, Plato's Republic, Marcus Aurelius, and Epictetus, with catalog-matched works of classical philosophy, history, and literature.",
  christianity:
    "Christian texts in the Tower: the King James Bible, Augustine's Confessions, The Imitation of Christ, Bunyan's Pilgrim's Progress, and the Ante-Nicene Fathers, with catalog-matched works of scripture, patristics, and theology.",
  sikhism:
    "Sikh scripture and scholarship in the Tower: Macauliffe's The Sikh Religion and works on the Guru Granth Sahib, Guru Nanak, and the Khalsa, with catalog-matched Sikh works.",
  bahai:
    "Baháʼí texts in the Tower: ʻAbdu'l-Bahá's Some Answered Questions and works on Baháʼu'lláh, the Kitáb-i-Aqdas and Kitáb-i-Íqán, and the Bábí movement, with catalog-matched works on the Baháʼí faith.",
  gnosticism:
    "Gnostic and Hermetic texts in the Tower: the Nag Hammadi writings, the Pistis Sophia, and the Corpus Hermeticum, with catalog-matched works on Gnosticism, Hermeticism, Manichaeism, and the Mandaeans.",
  "norse-germanic":
    "Norse and Germanic myth in the Tower: the Poetic and Prose Eddas, the Nibelungenlied, and Beowulf, with catalog-matched works on the Eddas, the Icelandic sagas and chronicles, and Germanic legend.",
  celtic:
    "Celtic myth and legend in the Tower: the Mabinogion, the Arthurian romances of Chrétien de Troyes, and the Taliesin poems, with catalog-matched works on Celtic and Arthurian tradition.",
  esoteric:
    "Esoteric and occult works in the Tower: the grimoires, Éliphas Lévi, and the literature of alchemy, astrology, Theosophy, Rosicrucianism, and ceremonial magic, with catalog-matched works across the Western esoteric tradition.",
  "sacred-wisdom-remainder":
    "Sacred and wisdom writing in the Tower that no single tradition claims: comparative religion, mysticism, mythology, and devotional works from across traditions — the remainder of the sacred shelf, gathered in one place.",
};

let hubsPromise = null;

// Fetch the precomputed hub index once per session. Resolves null on
// any failure (network, parse, wrong shape) — callers treat null as
// "no collections available" and fall back to plain category browse.
export function loadHubsIndex() {
  if (!hubsPromise) {
    hubsPromise = fetch("/tower-hubs-index.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.traditions || !d.topAuthors) return null;
        return d;
      })
      .catch(() => null);
  }
  return hubsPromise;
}

// Hub-index fallback descriptors. The hub JSON's work lists can only
// express the traditions group at this taxonomy — the student,
// engineering, conspiracy, mathematics-and-sciences and Books-shelf
// memberships exist solely as TCU1 bitsets (their lists would burst
// the hub file's size budget), so the fallback honestly degrades to
// traditions alone instead of rendering empty groups.
export function buildCollections(data) {
  if (!data) return null;
  const toSet = (works) => new Set((works || []).map((w) => w.id));
  const traditions = Object.entries(data.traditions).map(([id, works]) => ({
    key: `tradition:${id}`,
    label: TRADITION_LABELS[id] || id,
    count: works.length,
    blurb: TRADITION_BLURBS[id] || "",
    ids: toSet(works),
  }));
  return {
    total: data.total,
    groups: [{ id: "traditions", collections: traditions }],
    booksShelves: null,
    papersFields: null,
    papersTypes: null,
  };
}

// Curated bitsets (Phase 2A, design §12; audit F9): the filter's
// curated axis used to wait for the 17.7 MB hub index — 61k work
// records parsed into id Sets — before any curated tap could run.
// The TCB1 dataset carries the same memberships as precomputed
// bitsets over catalog indices (TCU1, generated by
// scripts/build-tcb1.mjs from the hub lists, and since the 2026-11-15
// collections package by scripts/build-curated-bitsets.mjs from the
// design packages' verified member lists): fetched with the dataset
// fingerprint, parsed in milliseconds, and usable from the first
// seconds of the load. `count` is the bitset popcount — the number of
// catalog records the filter itself returns — and `bits` replaces
// `ids` (the hub Set path remains the fallback when no bitsets are
// available).
//
// The fetch carries ?v=<curated sha256 from the manifest>: the tcb1
// function serves the file under an immutable one-year cache key, and
// the dataset fingerprint versions the CATALOG, not the curated
// membership — a taxonomy-only change (same catalog, new bitsets)
// must still reach returning visitors instead of their cached copy.
import { parseCuratedBitsets } from "./tcb1.js";

let curatedPromise = null;

// One load attempt. Any failure — network, HTTP status, or a parse
// throw on bytes that are not the TCU1 payload (the 2026-11-15
// double-brotli serving defect delivered the .br file itself, which
// fails the magic check) — resolves null; the retry policy lives in
// loadCuratedBitsets below.
//
// The URL carries &enc=4 alongside ?v=<curated sha256>: the marker
// names the serving function's fixed encoding scheme, so edge copies
// stored under the pre-fix URL (double-encoded, immutable one-year
// TTL) are unreachable even where they linger.
async function fetchCuratedBitsets(fp, version) {
  const url = `/tcb1/${fp}/curated.bin${version ? `?v=${version}&enc=4` : "?enc=4"}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const parsed = parseCuratedBitsets(new Uint8Array(buf));
    return buildCollectionsFromBitsets(parsed);
  } catch {
    return null;
  }
}

const CURATED_RETRY_DELAYS_MS = [1500, 4000];

// Loads the curated bitsets with bounded retries. A success is
// cached for the session (the data is immutable per fingerprint +
// version). A FAILURE IS NEVER CACHED: the 2026-11-15 defect had the
// rejected promise pinned in this module forever, so one bad response
// at page open disabled the curated axis for the whole session with
// no recovery path. On final failure the in-flight promise is
// dropped, so the next caller (e.g. the next group tap) starts a
// fresh attempt cycle.
export function loadCuratedBitsets(fp, version) {
  if (!fp) return Promise.resolve(null);
  if (!curatedPromise) {
    curatedPromise = (async () => {
      for (let attempt = 0; ; attempt++) {
        const data = await fetchCuratedBitsets(fp, version);
        if (data) return data;
        if (attempt >= CURATED_RETRY_DELAYS_MS.length) {
          curatedPromise = null;
          return null;
        }
        await new Promise((res) =>
          setTimeout(res, CURATED_RETRY_DELAYS_MS[attempt])
        );
      }
    })();
  }
  return curatedPromise;
}

// Kind prefix in a TCU1 key -> panel group + text table. "audience"
// is the Mathematics and Sciences group (its design keeps the
// internal id); "bookshelf" is not a curated group at all — those
// descriptors feed the Books lane's subcategory slot.
const KIND_GROUPS = [
  { kind: "tradition", group: "traditions", lookup: null },
  { kind: "law", group: "law", lookup: LAW_LOOKUP },
  { kind: "med", group: "med", lookup: MED_LOOKUP },
  { kind: "eng", group: "eng", lookup: ENG_LOOKUP },
  { kind: "conspiracy", group: "conspiracy", lookup: CONSPIRACY_LOOKUP },
  { kind: "audience", group: "audiences", lookup: MATHSCI_LOOKUP },
];

export function buildCollectionsFromBitsets(parsed) {
  if (!parsed || !parsed.collections) return null;
  const byGroup = new Map();
  const booksShelves = [];
  const paperFieldBits = new Map(); // field id -> TCU1 entry
  const paperSubBits = new Map(); // "field:sub" -> TCU1 entry
  const paperTypeBits = new Map(); // type id -> TCU1 entry
  const pushTo = (groupId, desc) => {
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId).push(desc);
  };
  for (const c of parsed.collections) {
    const cut = c.key.indexOf(":");
    const kind = cut > 0 ? c.key.slice(0, cut) : c.key;
    const rest = cut > 0 ? c.key.slice(cut + 1) : "";
    if (kind === "paperfield") {
      paperFieldBits.set(rest, c);
      continue;
    }
    if (kind === "papersub") {
      paperSubBits.set(rest, c);
      continue;
    }
    if (kind === "papertype") {
      paperTypeBits.set(rest, c);
      continue;
    }
    if (kind === "bookshelf") {
      const t = BOOKS_LOOKUP.get(rest);
      booksShelves.push({
        key: c.key,
        id: rest,
        label: (t && t.label) || rest,
        blurb: (t && t.blurb) || "",
        wing: (t && t.wing) || "",
        count: c.count,
        ids: null,
        bits: c.bits,
      });
      continue;
    }
    const kg = KIND_GROUPS.find((k) => k.kind === kind);
    if (!kg) continue;
    if (kind === "tradition") {
      pushTo(kg.group, {
        key: c.key,
        label: TRADITION_LABELS[rest] || rest,
        count: c.count,
        blurb: TRADITION_BLURBS[rest] || "",
        ids: null,
        bits: c.bits,
      });
    } else {
      const t = kg.lookup.get(rest);
      pushTo(kg.group, {
        key: c.key,
        label: (t && t.label) || c.label || rest,
        count: c.count,
        blurb: (t && t.blurb) || "",
        ids: null,
        bits: c.bits,
      });
    }
  }
  const groups = [];
  for (const g of COLLECTION_GROUPS) {
    const collections = byGroup.get(g.id);
    if (collections && collections.length) groups.push({ id: g.id, collections });
  }
  // Papers subject map (shipped 2026-11-16): the papers-subcategories
  // design's field/subfield taxonomy plus the publication-type axis,
  // classified by the subject-enrichment pipeline (arXiv categories,
  // Europe PMC MeSH/keywords/journal layers) and baked as TCU1
  // paperfield:/papersub:/papertype: bitsets by
  // scripts/build-papers-bitsets.mjs. The tables in
  // tower-collections-data.js are the text and ordering authority;
  // the bitsets carry membership (primary + cross-lists — counts
  // overlap by design and do not sum to the Papers total). A field
  // whose bitset is absent simply does not render; the lane falls
  // back to its source-prefix subcategories only when NO papers
  // entries exist at all (the hub fallback path returns null here).
  const papersFields = [];
  for (const f of PAPER_FIELDS) {
    const fc = paperFieldBits.get(f.id);
    if (!fc) continue;
    const subs = [];
    for (const s of f.subs) {
      const sc = paperSubBits.get(`${f.id}:${s.id}`);
      if (!sc) continue;
      subs.push({
        key: sc.key,
        id: s.id,
        label: s.label,
        count: sc.count,
        ids: null,
        bits: sc.bits,
      });
    }
    papersFields.push({
      key: fc.key,
      id: f.id,
      label: f.label,
      blurb: f.blurb || "",
      count: fc.count,
      ids: null,
      bits: fc.bits,
      subs,
    });
  }
  const papersTypes = [];
  for (const t of PAPER_TYPES) {
    const tc = paperTypeBits.get(t.id);
    if (!tc) continue;
    papersTypes.push({
      key: tc.key,
      id: t.id,
      label: t.label,
      count: tc.count,
      ids: null,
      bits: tc.bits,
    });
  }
  return { total: parsed.total, groups, booksShelves, papersFields, papersTypes };
}

// Labels for traditions (the hub index carries work lists, not
// labels, for this group).
export const TRADITION_LABELS = {
  jainism: "Jainism",
  shinto: "Shinto",
  zoroastrianism: "Zoroastrianism",
  lds: "Latter-day Saint",
  sikhism: "Sikhism",
  bahai: "Baháʼí",
  gnosticism: "Gnosticism & Hermeticism",
  "norse-germanic": "Norse & Germanic",
  celtic: "Celtic",
  esoteric: "Esoteric & Occult",
  buddhism: "Buddhism",
  hinduism: "Hinduism",
  "taoism-china": "Taoism & Chinese Classics",
  islam: "Islam",
  judaism: "Judaism",
  "egypt-mesopotamia": "Egypt & Mesopotamia",
  "indigenous-folk": "Indigenous & Folk Traditions",
  "greek-roman": "Greek & Roman",
  christianity: "Christianity",
  "sacred-wisdom-remainder": "More Sacred & Wisdom Texts",
};
