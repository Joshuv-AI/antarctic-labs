// Tower of Babel — Phase 2 hub data layer + shared rendering.
//
// ARCHITECTURE (2026-10-24 fix): the hub data is PRECOMPUTED by
// scripts/generate-hubs-index.mjs into public/tower-hubs-index.json
// (regenerated on every catalog-shards refresh, like the search index).
// Request-time code only fetches that JSON (1h edge cache) and adapts it
// to the Maps the renderers consume — it never walks the catalog.
// The walk itself (buildHubIndexData, exported for the generator) exceeds
// the Workers CPU time limit at live scale (~400k records, two full
// passes with regex matching per record; diagnosed 2026-10-24 as
// ExceededCpu on /tower-of-babel/hubs), so it must never run per-request.
// (The OAI-PMH endpoint streams the same shards directly — it needs full
// records, one page at a time.)
//
// MEMBERSHIP RULES (deterministic; the manifest documents them too):
// - Traditions: the site's editorial key works per tradition (TRADITIONS
//   in src/lib/tower-shelves.js, ids copied into CURATED below) are always
//   included first. Further membership is derived ONLY from BOOKS records:
//   a record joins the FIRST tradition (in TRADITION_DEFS order — most
//   distinctive traditions first, Christianity last) whose tag set,
//   title pattern, or artifact-id pattern matches. Records in other
//   collections are never auto-classified (REFERENCE is an encyclopedia
//   lane, not a sacred-text shelf). Records that match nothing are in no
//   hub — the catalog carries ~600 sacred-shelf books (mostly tob-* with
//   bare titles like "Job") that no honest rule can place; hubs say so.
// - Authors: creators counted over the whole catalog. "", "Unknown" and
//   "Anonymous" are excluded (catalog placeholders, not authors). Rank:
//   count desc, then decoded name asc. Top 50 get hubs. Slugs: entity-
//   decoded, diacritic-stripped, lowercased, non-alnum runs -> "-";
//   collisions take -2, -3, ... in rank order.
// - Declassified programmes: artifact-id prefix rules mirroring the
//   site's own taxonomy (src/lib/tower-taxonomy.js DECLASSIFIED subs):
//   cia- -> CIA; frus- -> Dept. of State (FRUS); gao- | plaw- -> Congress
//   (GAO reports + public laws); un- -> United Nations; govdocs-nsarchive
//   | nsa- -> National Security Archive; fbi-vault -> FBI Vault. The
//   taxonomy's residual "other" bucket gets NO hub — it is a mixed
//   remainder, not a programme.
// - Course primary sources: the catalog's own canon pins
//   (src/lib/search-rank.js CANON) — a curated subset listed explicitly
//   in COURSE_GROUPS below, resolved against the catalog; ids that do
//   not resolve are dropped silently.
//
// Copy guardrails (site-wide): never claim every record has full text or
// stable URLs; approved phrasing is "predictable URLs", "where text is
// present", "no published rate limit".

import {
  SITE,
  getShardCount,
  getShardRecords,
  entryPath,
  textFileUrl,
  escapeHtml,
  fetchJsonCached,
  hubsIndexUrl,
} from "./tower-catalog.js";

// Re-exported for hub route modules that render their own lists.
export { escapeHtml } from "./tower-catalog.js";

export const HUBS_BASE = "/tower-of-babel/hubs";
export const PAGE_SIZE = 200;
export const MAX_PAGES = 50; // stated cap: 50 pages x 200 = 10,000 works per hub

// OAI-PMH datestamp policy: the catalog carries no per-entry dates, so
// every record shares this one repository snapshot datestamp (the date
// this endpoint's catalog snapshot was taken). The catalog grows daily;
// harvesters should re-harvest in full rather than rely on from/until.
export const CATALOG_SNAPSHOT_DATE = "2026-10-24";

// ---------------------------------------------------------------------
// Small helpers

export function decodeEntities(s) {
  let out = String(s || "");
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  out = out.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
  out = out.replace(
    /&([a-zA-Z]+?)(grave|acute|circ|tilde|uml|ring|cedil|slash);/g,
    (_, base) => base
  );
  const named = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    aelig: "ae", oelig: "oe", szlig: "ss", eth: "d", thorn: "th",
    rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', mdash: "-", ndash: "-",
    hellip: "...", copy: "(c)", reg: "(r)", trade: "(tm)",
  };
  out = out.replace(/&([a-z]+);/g, (m, name) => (name in named ? named[name] : m));
  return out;
}

export function slugifyAuthor(name) {
  let s = decodeEntities(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  s = s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "unknown";
}

function tagList(record) {
  if (Array.isArray(record.tags)) return record.tags;
  if (typeof record.tags === "string") return record.tags.split(",");
  return [];
}

const light = (r) => ({
  id: r.artifact_id,
  title: String(r.title || r.artifact_id),
  creator: decodeEntities(r.creator || ""),
  year: r.year == null ? "" : String(r.year),
  collection: r.collection || "",
});

// ---------------------------------------------------------------------
// Tradition definitions (precedence order = array order).

const T = (set) => new Set(set);

export const TRADITION_DEFS = [
  {
    id: "jainism", label: "Jainism",
    blurb: "Jain scripture and scholarship in the Tower: the Kalpa Sutra and Uttaradhyayana Sutra in Jacobi's Sacred Books of the East translations, alongside catalog-matched Jain works.",
    tags: T(["jainism", "jain", "jaina"]),
    titleRe: /\bjain(a|ism|ist)?\b|kalpa s[uu]tra|uttaradhyayana|tattvartha/,
    idRe: /jain/,
    curated: ["kalpa-sutra-jacobi-1884", "uttaradhyayana-jacobi-1895"],
  },
  {
    id: "shinto", label: "Shinto",
    blurb: "The foundational records of Shinto in the Tower: Chamberlain's Kojiki and Aston's Nihongi — the two chronicles on which the tradition's mythology rests — plus catalog-matched works on Shinto.",
    tags: T(["shinto", "shintoism"]),
    titleRe: /\bshinto\b|kojiki|nihongi/,
    idRe: /^(kojiki-|aston-nihongi)/,
    curated: ["kojiki-chamberlain-1882", "aston-nihongi-1896"],
  },
  {
    id: "zoroastrianism", label: "Zoroastrianism",
    blurb: "The Zend Avesta in the Tower — the scripture of Zoroastrianism in the Sacred Books of the East translations — with catalog-matched works on the Avesta, Zoroaster, and the tradition.",
    tags: T(["zoroastrianism", "zoroastrian", "avesta", "zoroaster"]),
    titleRe: /avesta|zoroast|ahura mazda|vendidad|\byasna\b|zend/,
    idRe: /avesta|zend/,
    curated: ["tob-4107", "tob-0157"],
  },
  {
    id: "lds", label: "Latter-day Saint",
    blurb: "Latter-day Saint scripture in the Tower: the Book of Mormon, the 1835 Doctrine and Covenants, and the Pearl of Great Price, with catalog-matched works on the movement and its texts.",
    tags: T(["mormonism", "mormon", "latter-day saints", "lds"]),
    titleRe: /\bmormon|latter-day|book of mormon|doctrine and covenants|pearl of great price/,
    idRe: null,
    curated: ["tob-0214", "smith-doctrine-covenants-1835", "smith-pearl-great-price-1851"],
  },
  {
    id: "buddhism", label: "Buddhism",
    blurb: "Buddhist texts in the Tower: the Dhammapada, the Pali Nikayas in Sujato's translations, the Jatakas, and the Tibetan Book of the Dead, with catalog-matched works across Theravada, Mahayana, and Tibetan traditions.",
    tags: T(["buddhism", "buddhist", "pali canon", "nikaya", "sutta", "theravada", "mahayana", "zen", "tibetan buddhism"]),
    titleRe: /tibetan book of the dead|\bbuddha\b|buddhist|buddhism|dhammapada|tripitaka|\bsutta\b|nikaya|jataka|bodhisattva|\bnirvana\b|pali canon|lamaism/,
    idRe: /^(anguttara-|samyutta-|majjhima-|khuddakapatha-|itivuttaka-|theragatha-|therigatha-|udana-|jataka-|dhammapada)/,
    curated: ["tob-10233", "majjhima-nikaya-sujato", "samyutta-nikaya-sujato", "jataka-cowell-vol-1", "tibetan-book-of-dead-evans-wentz-1927"],
  },
  {
    id: "hinduism", label: "Hinduism",
    blurb: "Hindu scripture in the Tower: the Bhagavad Gita, Griffith's Rig Veda, the Upanishads, the Ramayana, and Wilson's Vishnu Purana, with catalog-matched Vedic, epic, and Puranic works.",
    tags: T(["hinduism", "hindu", "vedas", "veda", "upanishads", "vedic"]),
    titleRe: /\bveda(s|ic)?\b|upanishad|bhagavad|ramayana|mahabharata|purana|\bhindu(s|ism)?\b| rig ?veda/,
    idRe: /^(upanishads-|vishnu-purana|rig-veda)/,
    curated: ["tob-0004", "rig-veda-griffith-1896", "tob-0191", "tob-13328", "vishnu-purana-wilson-1840"],
  },
  {
    id: "taoism-china", label: "Taoism & Chinese Classics",
    blurb: "Taoist and classical Chinese texts in the Tower: the Tao Te Ching, the Analects of Confucius, Legge's I Ching, Chuang Tzu, and the Art of War, with catalog-matched works on Taoism and Confucian thought.",
    tags: T(["taoism", "taoist", "confucianism", "confucian", "chinese philosophy"]),
    titleRe: /\btao(ism|ist|ists)?\b|lao ?tzu|laozi|chuang ?tzu|zhuangzi|confucius|confucian|analects of|i ching|book of changes|art of war|sun tzu/,
    idRe: /^(giles-taoist|i-ching-|art-of-war|tao-te-ching)/,
    curated: ["tob-0005", "tob-10415", "i-ching-legge-1882", "tob-10229", "art-of-war-giles-1910"],
  },
  {
    id: "islam", label: "Islam",
    blurb: "Islamic texts in the Tower: Pickthall's Meaning of the Glorious Koran, Al-Ghazali's Mishkat Al-Anwar and Confessions, with catalog-matched works on the Quran, Hadith, and Sufism.",
    tags: T(["islam", "islamic", "quran", "koran", "muslim", "sufism", "sufi"]),
    titleRe: /\bquran\b|\bkoran\b|qur'an|\bislam\b|islamic|\bmuslim|mohammed|muhammad|ghazali|hadith|\bsufi/,
    idRe: /^pickthall-/,
    curated: ["pickthall-meaning-glorious-koran-1930", "tob-10501", "ghazali-mishkat-anwar-gairdner-1924", "tob-10039"],
  },
  {
    id: "judaism", label: "Judaism",
    blurb: "Jewish scripture and scholarship in the Tower: the JPS 1917 Tanakh, the Talmud, the Targums, and the Zohar, with catalog-matched works on Torah, Mishnah, Midrash, and Kabbalah.",
    tags: T(["judaism", "jewish", "talmud", "torah", "kabbalah", "hebrew bible", "mishnah"]),
    titleRe: /talmud|torah|tanakh|mishnah|zohar|kabbalah|kabala|\bjewish\b|judaism|hebrew bible|midrash|targum/,
    idRe: /^(tanakh-|polano-talmud|babylonian-talmud|danby-mishnah|targums-)/,
    curated: ["tob-0006", "tob-10816", "targums-etheridge-vol-1", "zohar-de-pauly-french-vol-1-1906"],
  },
  {
    id: "egypt-mesopotamia", label: "Egypt & Mesopotamia",
    blurb: "Ancient Egyptian and Mesopotamian texts in the Tower: the Egyptian Book of the Dead, the Epic of Gilgamesh, and Enuma Elish, with catalog-matched works on Egypt, Babylon, Assyria, and Sumer.",
    tags: T(["egypt", "egyptian", "egyptology", "mesopotamia", "assyriology", "babylonian", "sumerian"]),
    titleRe: /egyptian book of the dead|\begypt|pharaoh|hieroglyph|gilgamesh|babylon|assyria|mesopotamia|sumerian|akkadian|enuma|book of the dead/,
    idRe: /^enuma-elish/,
    curated: ["tob-10337", "tob-10088", "enuma-elish-king-1902"],
  },
  {
    id: "indigenous-folk", label: "Indigenous & Folk Traditions",
    blurb: "Indigenous and folk tradition texts in the Tower: the Popol Vuh, the Chilam Balam of Chumayel, and Kirby's Kalevala, with catalog-matched works on Maya, Aztec, Inca, Native American, and folk traditions worldwide.",
    tags: T(["folklore", "folk tales", "fairy tales", "mythology", "native american"]),
    titleRe: /popol vuh|chilam balam|kalevala|\bmaya\b|mayan|\baztec\b|\binca\b|peruvian|navajo|apache|\bsioux\b|dakota|ojibwa|algonquin|iroquois|maori|hawaiian|polynesian|\bfinnish (epic|folk|myth)|estonian folk|slavonic folk|folk tales|fairy tales|folklore/,
    idRe: null,
    curated: ["tob-4274-d1", "roys-chilam-balam-chumayel-1933", "kalevala-vol-1-kirby-1907"],
  },
  {
    id: "greek-roman", label: "Greek & Roman",
    blurb: "Greek and Roman classics in the Tower: Butler's Iliad and Odyssey, Plato's Republic, Marcus Aurelius, and Epictetus, with catalog-matched works of classical philosophy, history, and literature.",
    tags: T(["stoicism", "stoic", "greek philosophy", "roman philosophy", "classics"]),
    titleRe: /\bhomer\b|iliad|odyssey|\bplato\b|aristotle|socrates|marcus aurelius|epictetus|\bseneca\b|\bstoic|cicero|\bvirgil\b|\bovid\b|aeneid|plutarch|xenophon|thucydides|herodotus|euripides|sophocles|aeschylus|aristophanes|lucretius|plotinus|greek philosophy|greek mythology|roman philosophy/,
    idRe: /^(homer-|marcus-aurelius|epictetus-)/,
    curated: ["homer-iliad-butler", "homer-odyssey-butler", "the-republic", "marcus-aurelius-meditations-long", "epictetus-discourses-enchiridion-matheson"],
  },
  {
    id: "christianity", label: "Christianity",
    blurb: "Christian texts in the Tower: the King James Bible, Augustine's Confessions, The Imitation of Christ, Bunyan's Pilgrim's Progress, and the Ante-Nicene Fathers, with catalog-matched works of scripture, patristics, and theology.",
    tags: T(["patristics", "church fathers", "nicene and post-nicene fathers", "ante-nicene fathers", "bible", "biblical", "christian", "christianity", "catholic", "theology", "new testament", "old testament", "jesus", "gospel"]),
    titleRe: /\bbible\b|biblical|\bjesus\b|\bchrist\b|christian|gospel|new testament|old testament|catholic|church fathers|apostle|epistles?\b|psalms?\b|doctrine of|sermons?\b/,
    idRe: null,
    curated: ["holy-bible-king-james-version", "tob-3002", "tob-10071", "bunyan-pilgrims-progress-1678", "ante-nicene-fathers-vol-2"],
  },
];

function traditionOf(record) {
  const tags = tagList(record).map((t) => String(t).toLowerCase().trim());
  const title = String(record.title || "").toLowerCase();
  const id = record.artifact_id;
  for (const def of TRADITION_DEFS) {
    if (tags.some((t) => def.tags.has(t))) return def.id;
    if (def.titleRe && def.titleRe.test(title)) return def.id;
    if (def.idRe && def.idRe.test(id)) return def.id;
  }
  return null;
}

// ---------------------------------------------------------------------
// Declassified programme definitions (prefix rules; see header).

export const PROGRAMME_DEFS = [
  {
    id: "cia", label: "Central Intelligence Agency — CREST",
    blurb: "Declassified CIA records in the Tower from the CREST release: intelligence reports, estimates, and memoranda published by the Central Intelligence Agency.",
    test: (id) => id.startsWith("cia-"),
  },
  {
    id: "state", label: "U.S. Department of State — FRUS",
    blurb: "Foreign Relations of the United States volumes in the Tower: the State Department's official record of U.S. foreign policy decisions and diplomatic activity, from 1861 forward.",
    test: (id) => id.startsWith("frus-"),
  },
  {
    id: "congress", label: "U.S. Congress — GAO Reports & Public Laws",
    blurb: "Congressional material in the Tower: Government Accountability Office reports to Congress and the public laws enacted by the United States Congress.",
    test: (id) => id.startsWith("gao-") || id.startsWith("plaw-"),
  },
  {
    id: "un", label: "United Nations",
    blurb: "United Nations records in the Tower: Security Council and General Assembly documents, resolutions, and meeting records.",
    test: (id) => id.startsWith("un-"),
  },
  {
    id: "nsarchive", label: "National Security Archive",
    blurb: "Declassified U.S. national security documents in the Tower published through the National Security Archive's FOIA-based releases.",
    test: (id) => id.startsWith("govdocs-nsarchive") || id.startsWith("nsa-"),
  },
  {
    id: "fbi", label: "FBI Vault",
    blurb: "FBI records in the Tower released through the Bureau's Vault reading room: investigative files published under FOIA.",
    test: (id) => id.startsWith("fbi-vault"),
  },
];

// ---------------------------------------------------------------------
// Course primary sources: a curated subset of the catalog's own canon
// pins (src/lib/search-rank.js CANON), grouped for classroom use.

export const COURSE_GROUPS = [
  {
    label: "Founding documents",
    ids: [
      "us-declaration-of-independence", "us-constitution-bill-of-rights",
      "magna-carta-1215", "federalist-papers", "common-sense-thomas-paine",
      "gettysburg-address", "emancipation-proclamation-1863",
      "english-bill-of-rights-1689", "udhr-1948",
    ],
  },
  {
    label: "Sacred & wisdom landmarks",
    ids: [
      "holy-bible-king-james-version", "pickthall-meaning-glorious-koran-1930",
      "tob-0006", "tob-0004", "tob-0005", "tob-10233",
      "tibetan-book-of-dead-evans-wentz-1927", "tob-10337",
    ],
  },
  {
    label: "Landmark works",
    // Object items carry a title/creator fallback (see resolveCourseItem):
    // the pin id is tried first; if the catalog now holds the work under
    // a different id, the first matching BOOKS record in catalog order
    // is used instead.
    ids: [
      "marcus-aurelius-meditations-long", "homer-iliad-butler",
      "homer-odyssey-butler", "the-republic",
      "milton-paradise-lost-1667", "bunyan-pilgrims-progress-1678",
      "kalevala-vol-1-kirby-1907",
      { id: "dante-alighieri-divine-comedy-cary", title: "divine comedy", creator: "dante" },
      { id: "beowulf-lesslie-hall-1892", title: "^beowulf" },
      { id: "cervantes-don-quixote-ormsby", title: "don quixote", creator: "cervantes" },
      { id: "darwin-origin-of-species-6th-edition", title: "origin of species", creator: "darwin" },
      { id: "smith-wealth-of-nations-1776", title: "wealth of nations", creator: "smith" },
      { id: "marx-engels-communist-manifesto-1888", title: "communist manifesto" },
      { id: "shakespeare-hamlet", title: "^hamlet", creator: "shakespeare" },
      { id: "melville-moby-dick", title: "moby[- ]dick", creator: "melville" },
      { id: "austen-pride-and-prejudice", title: "pride and prejudice", creator: "austen" },
      { id: "dickens-tale-of-two-cities", title: "tale of two cities", creator: "dickens" },
      { id: "chaucer-canterbury-tales", title: "canterbury tales", creator: "chaucer" },
      { id: "machiavelli-the-prince", title: "^the prince", creator: "machiavelli" },
      { id: "poetic-edda-bellows-1936", title: "poetic edda" },
      { id: "prose-edda-sturluson-brodeur-1916", title: "prose edda" },
    ],
  },
];

// ---------------------------------------------------------------------
// The index build. One counting/collecting walk over the shards plus a
// second walk for the top-50 authors' works; every hub reads from the
// result. Only light records ({id, title, creator, year, collection})
// for hub-listed works are retained — the full id space is never
// materialized, so memory stays bounded at catalog scale.

const AUTHOR_EXCLUDE = new Set(["", "unknown", "anonymous"]);
const INDEX_TTL_MS = 3600 * 1000;
let indexMemo = null; // { at, promise }

const byTitle = (a, b) =>
  a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || (a.id < b.id ? -1 : 1);

// Full catalog walk. Exported for scripts/generate-hubs-index.mjs —
// NEVER call this per-request (CPU limit). getRecords defaults to the
// live shard fetcher; the generator injects a local-file reader.
export async function buildHubIndexData(getRecords = getShardRecords) {
  const shardCount = await getShardCount();
  const total = { n: 0 };
  const collections = new Map();
  const creatorCounts = new Map();

  // Ids that must resolve after the walk: tradition key works + course
  // pins. Everything else is counted or collected by rule during the
  // walk, so no full id->record map is ever held — memory stays bounded
  // at catalog scale (the OAI endpoint likewise streams shards itself
  // instead of reading a materialized record list).
  const wantedIds = new Set();
  for (const def of TRADITION_DEFS) for (const id of def.curated) wantedIds.add(id);
  const courseFallbacks = []; // { key, re, creator }
  COURSE_GROUPS.forEach((g, gi) =>
    g.ids.forEach((item, ii) => {
      if (typeof item === "string") wantedIds.add(item);
      else {
        wantedIds.add(item.id);
        if (item.title)
          courseFallbacks.push({
            key: `${gi}:${ii}`,
            re: new RegExp(item.title, "i"),
            creator: (item.creator || "").toLowerCase(),
          });
      }
    })
  );
  const wanted = new Map();
  const fallbackWinners = new Map();

  // Tradition slots; seen-sets pre-seeded with the curated ids so a key
  // work is never double-listed as a derived match in its own hub.
  const traditionSlots = new Map();
  for (const def of TRADITION_DEFS) {
    traditionSlots.set(def.id, { seen: new Set(def.curated), derived: [] });
  }
  const programmes = new Map(PROGRAMME_DEFS.map((d) => [d.id, []]));

  for (let s = 0; s < shardCount; s++) {
    const records = await getRecords(s);
    if (!records) throw new Error("catalog shard unavailable");
    for (const r of records) {
      if (!r || !r.artifact_id) continue;
      total.n++;
      const lr = light(r);
      collections.set(lr.collection, (collections.get(lr.collection) || 0) + 1);
      if (wantedIds.has(r.artifact_id)) wanted.set(r.artifact_id, lr);
      const name = decodeEntities(r.creator || "").trim();
      if (!AUTHOR_EXCLUDE.has(name.toLowerCase())) {
        creatorCounts.set(name, (creatorCounts.get(name) || 0) + 1);
      }
      if (r.collection === "BOOKS") {
        const tid = traditionOf(r);
        if (tid) {
          const slot = traditionSlots.get(tid);
          if (!slot.seen.has(r.artifact_id)) {
            slot.seen.add(r.artifact_id);
            slot.derived.push(lr);
          }
        }
        for (const fb of courseFallbacks) {
          if (fallbackWinners.has(fb.key)) continue;
          if (!fb.re.test(lr.title)) continue;
          if (fb.creator && !lr.creator.toLowerCase().includes(fb.creator)) continue;
          fallbackWinners.set(fb.key, lr);
        }
      }
      if (r.collection === "DECLASSIFIED") {
        for (const def of PROGRAMME_DEFS) {
          if (def.test(r.artifact_id)) {
            programmes.get(def.id).push(lr);
            break;
          }
        }
      }
    }
  }

  // Authors: rank + slug assignment (deterministic; see header), then a
  // second shard walk collecting works ONLY for the top 50 creators —
  // every other creator's records are counted and discarded in pass 1.
  const ranked = [...creatorCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const topAuthors = ranked.slice(0, 50);
  const usedSlugs = new Map();
  for (const a of topAuthors) {
    let slug = slugifyAuthor(a.name);
    if (usedSlugs.has(slug)) {
      let n = 2;
      while (usedSlugs.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }
    usedSlugs.set(slug, a.name);
    a.slug = slug;
  }
  const authorBySlug = new Map(topAuthors.map((a) => [a.slug, a]));
  const topNames = new Set(topAuthors.map((a) => a.name));
  const authorWorks = new Map(topAuthors.map((a) => [a.name, []]));
  for (let s = 0; s < shardCount; s++) {
    const records = await getRecords(s);
    if (!records) continue;
    for (const r of records) {
      if (!r || !r.artifact_id) continue;
      const name = decodeEntities(r.creator || "").trim();
      if (topNames.has(name)) authorWorks.get(name).push(light(r));
    }
  }
  for (const list of authorWorks.values()) list.sort(byTitle);

  // Traditions: curated key works first (resolved via the wanted map),
  // then derived matches in title order.
  const traditionLists = new Map();
  for (const def of TRADITION_DEFS) {
    const slot = traditionSlots.get(def.id);
    const curated = def.curated.map((id) => wanted.get(id)).filter(Boolean);
    slot.derived.sort(byTitle);
    traditionLists.set(def.id, [...curated, ...slot.derived]);
  }

  // Course hub: exact pins resolve via the wanted map; object items
  // fall back to the first matching BOOKS record captured during the
  // walk (catalog order) — the canon pins were written against an
  // earlier catalog generation and several works now live under dated
  // ids (e.g. dante-divine-comedy-cary-1814). Deterministic either way.
  const courseGroups = COURSE_GROUPS.map((g, gi) => ({
    label: g.label,
    items: g.ids
      .map((item, ii) => {
        if (typeof item === "string") return wanted.get(item) || null;
        return wanted.get(item.id) || fallbackWinners.get(`${gi}:${ii}`) || null;
      })
      .filter(Boolean),
  })).filter((g) => g.items.length);
  const courseCount = courseGroups.reduce((a, g) => a + g.items.length, 0);

  const hubPaths = [
    ...TRADITION_DEFS.map((d) => `${HUBS_BASE}/traditions/${d.id}`),
    ...topAuthors.map((a) => `${HUBS_BASE}/authors/${a.slug}`),
    ...PROGRAMME_DEFS.map((d) => `${HUBS_BASE}/declassified/${d.id}`),
    `${HUBS_BASE}/course-primary-sources`,
  ];

  // Plain JSON-serializable hub data (written by the generator to
  // public/tower-hubs-index.json; read back per-request by buildIndex).
  return {
    snapshotDate: CATALOG_SNAPSHOT_DATE,
    total: total.n,
    collections: Object.fromEntries(collections),
    wanted: Object.fromEntries(wanted),
    traditions: Object.fromEntries(traditionLists),
    topAuthors: topAuthors.map((a) => ({
      name: a.name,
      slug: a.slug,
      count: a.count,
      works: authorWorks.get(a.name),
    })),
    programmes: Object.fromEntries(programmes),
    course: { groups: courseGroups, courseCount },
    hubPaths,
  };
}

// Request-time path: fetch the precomputed hub index (edge-cached 1h)
// and adapt it to the Map shapes the renderers consume. No catalog walk.
async function buildIndex() {
  const d = await fetchJsonCached(hubsIndexUrl, 3600);
  if (!d || !d.traditions || !d.topAuthors) throw new Error("hub index unavailable");
  return {
    total: d.total,
    collections: new Map(Object.entries(d.collections || {})),
    wanted: new Map(Object.entries(d.wanted || {})),
    topAuthors: d.topAuthors,
    authorBySlug: new Map(d.topAuthors.map((a) => [a.slug, a])),
    authorWorks: new Map(d.topAuthors.map((a) => [a.name, a.works || []])),
    traditions: new Map(Object.entries(d.traditions)),
    programmes: new Map(Object.entries(d.programmes || {})),
    course: d.course || { groups: [], courseCount: 0 },
    hubPaths: d.hubPaths || [],
  };
}

export function getHubIndex() {
  const now = Date.now();
  if (indexMemo && now - indexMemo.at < INDEX_TTL_MS) return indexMemo.promise;
  const promise = buildIndex();
  indexMemo = { at: now, promise };
  promise.catch(() => {
    if (indexMemo && indexMemo.promise === promise) indexMemo = null;
  });
  return promise;
}

export function getTraditionList(idx, traditionId) {
  return idx.traditions.get(traditionId) || [];
}

// ---------------------------------------------------------------------
// Shared rendering. Plain semantic HTML like the Phase 1 entry pages
// (no inline CSS); meta mirrors src/seo.js conventions (canonical on
// the apex domain, og:url = canonical, 160-char description cap).

export function paginate(items, request) {
  const url = new URL(request.url);
  let page = parseInt(url.searchParams.get("page") || "1", 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  const totalPages = Math.max(1, Math.min(MAX_PAGES, Math.ceil(items.length / PAGE_SIZE)));
  if (page > totalPages) page = totalPages;
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { pageItems, page, totalPages, total: items.length, capped: items.length > PAGE_SIZE * MAX_PAGES };
}

export function renderWorkList(items) {
  if (!items.length) return "<p>No works are listed for this hub yet.</p>";
  const rows = items.map(
    (r) =>
      `<li><a href="${entryPath(r.id)}">${escapeHtml(r.title)}</a>${
        r.creator ? ` — ${escapeHtml(r.creator)}` : ""
      }${r.year ? ` (${escapeHtml(r.year)})` : ""}</li>`
  );
  return `<ul>\n${rows.join("\n")}\n</ul>`;
}

export function renderPagination(path, page, totalPages) {
  if (totalPages <= 1) return "";
  const prev = page > 1 ? `<a href="${path}?page=${page - 1}">← Previous</a> ` : "";
  const next = page < totalPages ? ` <a href="${path}?page=${page + 1}">Next →</a>` : "";
  return `<nav aria-label="Pagination"><p>${prev}Page ${page} of ${totalPages}${next}</p></nav>`;
}

export function hubPageShell({ title, description, path, h1, breadcrumb, jsonLd, body }) {
  const canonical = SITE + path;
  const desc = String(description || "").slice(0, 160);
  const crumbs = breadcrumb
    .map((c) => `<a href="${c.path}">${escapeHtml(c.name)}</a>`)
    .join(" / ");
  const ld = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Antarctic Labs">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<script type="application/ld+json">${ld}</script>
</head>
<body>
<header>
<nav aria-label="Breadcrumb"><a href="/">HOME</a> / ${crumbs}</nav>
<h1>${escapeHtml(h1)}</h1>
</header>
<main>
${body}
</main>
<footer>
<p>Tower of Babel is a free public-domain library from <a href="/">Antarctic Labs</a>. Browse the <a href="/tower-of-babel/library">full library</a> or the <a href="${HUBS_BASE}">hub index</a>. Machine-readable access: <a href="/tower-of-babel/api">API page</a>, <a href="/oai?verb=Identify">OAI-PMH endpoint</a>, <a href="/sitemap-index.xml">sitemaps</a>.</p>
</footer>
</body>
</html>`;
}

// Edge-cache + return a rendered hub page (same pattern as Phase 1).
export async function serveHubPage(context, html) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const res = new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
  context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
}

export function notFound(kind) {
  return new Response(`No ${kind} hub exists at this URL. See ${SITE}${HUBS_BASE} for all hubs.`, {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function dataUnavailable() {
  return new Response("Hub data is temporarily unavailable.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "300" },
  });
}
