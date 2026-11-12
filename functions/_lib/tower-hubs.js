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
//   title pattern, artifact-id pattern, or creator pattern matches.
//   Records in other collections are never auto-classified (REFERENCE is
//   an encyclopedia lane, not a sacred-text shelf). Records that match
//   no tradition join the sacred-shelf remainder (sacred-wisdom-
//   remainder) when the browse taxonomy counts them as sacred texts or
//   their title/tags carry a religious signal — a labeled remainder,
//   never dressed as a tradition. (Completeness pass 2026-11-11: rules
//   re-audited over the full 2,557,923-record catalog; six traditions
//   added — Sikhism, Baháʼí, Gnosticism & Hermeticism, Norse &
//   Germanic, Celtic, Esoteric & Occult — and every existing rule
//   widened against the records it was missing; dead curated pins
//   repaired or dropped.)
// - Authors: creators counted over the whole catalog. "", "Unknown" and
//   "Anonymous" are excluded (catalog placeholders, not authors). Rank:
//   count desc, then decoded name asc. Top 50 get hubs. Slugs: entity-
//   decoded, diacritic-stripped, lowercased, non-alnum runs -> "-";
//   collisions take -2, -3, ... in rank order.
// - Declassified programmes: artifact-id prefix rules mirroring the
//   site's own taxonomy (src/lib/tower-taxonomy.js DECLASSIFIED subs):
//   cia- -> CIA; frus- -> Dept. of State (FRUS); gao- | plaw- -> Congress
//   (GAO reports + public laws); un- -> United Nations; govdocs-nsarchive
//   | nsa- -> National Security Archive; fbi-vault -> FBI Vault;
//   pentagon-papers- -> Pentagon Papers. Prefixes are tested over ALL
//   records (a handful of programme records sit in other lanes).
//   DECLASSIFIED records matching no programme form the "other"
//   catch-all collection ("Other Declassified Releases") — a labeled
//   remainder, not a programme.
// - Study shelves (AUDIENCE_DEFS): rule-based cross-cuts computed in the
//   same walk — Primary Sources (every DOCUMENTS + DECLASSIFIED
//   record), Philosophy, Epics Myths & Sagas, and Classics of Science
//   (BOOKS-lane tag/title/id/creator rules). They live only in the hub
//   index JSON (the `audiences` key) for the in-page filter; they have
//   no hub pages.
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
export const CATALOG_SNAPSHOT_DATE = "2026-11-10";

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
    id: "sikhism", label: "Sikhism",
    blurb: "Sikh scripture and scholarship in the Tower: Macauliffe's The Sikh Religion and works on the Guru Granth Sahib, Guru Nanak, and the Khalsa, with catalog-matched Sikh works.",
    tags: T(["sikhism", "sikh"]),
    titleRe: /\bsikh|guru granth|adi granth|guru nanak|khalsa|gurdwara/,
    idRe: /sikh/,
    curated: ["macauliffe-sikh-religion-vol1-1909"],
  },
  {
    id: "bahai", label: "Baháʼí",
    blurb: "Baháʼí texts in the Tower: ʻAbdu'l-Bahá's Some Answered Questions and works on Baháʼu'lláh, the Kitáb-i-Aqdas and Kitáb-i-Íqán, and the Bábí movement, with catalog-matched works on the Baháʼí faith.",
    tags: T(["bahai", "baha'i", "bahaism", "babi"]),
    titleRe: /baha'?i|bahaullah|baha'u'llah|abdul-baha|kitab-i-aqdas|kitab-i-iqan|\bbabi\b|babism/,
    idRe: /bahai|baha-i/,
    curated: ["abdul-baha-some-answered-questions-1908"],
  },
  {
    id: "gnosticism", label: "Gnosticism & Hermeticism",
    blurb: "Gnostic and Hermetic texts in the Tower: the Nag Hammadi writings, the Pistis Sophia, and the Corpus Hermeticum, with catalog-matched works on Gnosticism, Hermeticism, Manichaeism, and the Mandaeans.",
    tags: T(["gnosticism", "gnostic", "hermeticism", "hermetica", "manichaeism", "mandaean"]),
    titleRe: /gnostic|nag hammadi|hermetic|hermes trismegistus|corpus hermeticum|pistis sophia|emerald tablet|apocryphon|hypostasis|demiurge|manichaean|manichaeism|mandaean|(?<!infancy )gospel of (thomas|philip|mary|judas|truth)/,
    idRe: /^(pistis-sophia|corpus-hermeticum|emerald-tablet)/,
    curated: ["tob-0176", "tob-0115"],
  },
  {
    id: "norse-germanic", label: "Norse & Germanic",
    blurb: "Norse and Germanic myth in the Tower: the Poetic and Prose Eddas, the Nibelungenlied, and Beowulf, with catalog-matched works on the Eddas, the Icelandic sagas and chronicles, and Germanic legend.",
    tags: T(["norse", "norse mythology", "edda", "germanic mythology", "scandinavian mythology"]),
    titleRe: /\beddas?\b|nibelung|beowulf|valhalla|ragnarok|asgard|\bnorse\b|\bviking|odin\b|heimskringla|\bnjal\b|volsunga|germanic (myth|legend|hero)|anglo-saxon|saxon chronicle|\bsaxo\b|icelandic|\bvinland\b|wineland/,
    idRe: /^(poetic-edda|prose-edda|nibelungenlied)|nibelung|norse-mythology/,
    curated: ["tob-0167", "tob-0168"],
  },
  {
    id: "celtic", label: "Celtic",
    blurb: "Celtic myth and legend in the Tower: the Mabinogion, the Arthurian romances of Chrétien de Troyes, and the Taliesin poems, with catalog-matched works on Celtic and Arthurian tradition.",
    tags: T(["celtic", "celtic mythology", "druid", "arthurian"]),
    titleRe: /\bceltic\b|\bcelts?\b|druid|mabinogion|arthurian|king arthur|holy grail|cu chulain|cuchulain|tuatha|chretien|erec et|yvain|cliges|perceval|gawain|tristan|taliesin|ossian/,
    idRe: /^(mabinogion|chretien-)/,
    curated: ["tob-0170"],
  },
  {
    id: "esoteric", label: "Esoteric & Occult",
    blurb: "Esoteric and occult works in the Tower: the grimoires, Éliphas Lévi, and the literature of alchemy, astrology, Theosophy, Rosicrucianism, and ceremonial magic, with catalog-matched works across the Western esoteric tradition.",
    tags: T(["occult", "occultism", "theosophy", "alchemy", "astrology", "rosicrucian", "freemasonry", "witchcraft", "tarot", "spiritualism"]),
    titleRe: /occult|theosoph|alchem|astrolog(?!onom)|grimoire|grimorium|rosicrucian|freemason|masonic|\bmagick\b|witchcraft|tarot|spiritualism|golden dawn|crowley|blavatsky|eliphas levi|key of solomon|clavicle of solomon|heptameron|book of the law|mesmeris|black magic|white magic|scottish rite|demonolog|daemonolog|secret doctrine/,
    idRe: /^(grimorium|grand-grimoire|petit-albert|heptameron|theurgia|almadel|clavicle)/,
    curated: [],
  },
  {
    id: "buddhism", label: "Buddhism",
    blurb: "Buddhist texts in the Tower: the Dhammapada, the Pali Nikayas in Sujato's translations, the Jatakas, and the Tibetan Book of the Dead, with catalog-matched works across Theravada, Mahayana, and Tibetan traditions.",
    tags: T(["buddhism", "buddhist", "pali canon", "nikaya", "sutta", "theravada", "mahayana", "zen", "tibetan buddhism"]),
    titleRe: /tibetan book of the dead|\bbuddha\b|buddhist|buddhism|dhammapada|tripitaka|\bsutta\b|nikaya|jataka|bodhisattva|\bnirvana\b|pali canon|lamaism|(?<!kama )(?<!grihya[- ])(?<!yoga )sutra|mahayana|theravada|\bzen\b|lankavatara/,
    idRe: /^(anguttara-|samyutta-|majjhima-|khuddakapatha-|itivuttaka-|theragatha-|therigatha-|udana-|jataka-|dhammapada)/,
    curated: ["tob-4314", "majjhima-nikaya-sujato", "samyutta-nikaya-sujato", "jataka-cowell-vol-1", "tibetan-book-of-dead-evans-wentz-1927"],
  },
  {
    id: "hinduism", label: "Hinduism",
    blurb: "Hindu scripture in the Tower: the Bhagavad Gita, Griffith's Rig Veda, the Upanishads, the Ramayana, and Wilson's Vishnu Purana, with catalog-matched Vedic, epic, and Puranic works.",
    tags: T(["hinduism", "hindu", "vedas", "veda", "upanishads", "vedic"]),
    titleRe: /\bveda(s|ic)?\b|upanishad|bhagavad|ramayana|mahabharata|purana|\bhindu(s|ism)?\b| rig ?veda|kama sutra|\byoga\b|vivekananda|grihya/,
    idRe: /^(upanishads-|vishnu-purana|rig-veda)/,
    curated: ["judge-bhagavad-gita-1890", "rig-veda-griffith-1896", "tob-0191", "tob-13328", "vishnu-purana-wilson-1840"],
  },
  {
    id: "taoism-china", label: "Taoism & Chinese Classics",
    blurb: "Taoist and classical Chinese texts in the Tower: the Tao Te Ching, the Analects of Confucius, Legge's I Ching, Chuang Tzu, and the Art of War, with catalog-matched works on Taoism and Confucian thought.",
    tags: T(["taoism", "taoist", "confucianism", "confucian", "chinese philosophy"]),
    titleRe: /\btao(ism|ist|ists)?\b|lao ?tzu|laozi|chuang ?tzu|zhuangzi|confucius|confucian|analects of|i ching|book of changes|art of war|sun tzu|mencius|lieh ?tzu|liezi|xunzi|mo ?tzu|han fei|chinese classic/,
    idRe: /^(giles-taoist|i-ching-|art-of-war|tao-te-ching)/,
    curated: ["tob-0005", "tob-10415", "i-ching-legge-1882", "art-of-war-giles-1910"],
  },
  {
    id: "islam", label: "Islam",
    blurb: "Islamic texts in the Tower: Pickthall's Meaning of the Glorious Koran, Al-Ghazali's Mishkat Al-Anwar and Confessions, with catalog-matched works on the Quran, Hadith, and Sufism.",
    tags: T(["islam", "islamic", "quran", "koran", "muslim", "sufism", "sufi"]),
    titleRe: /\bquran\b|\bkoran\b|qur'an|\bislam\b|islamic|\bmuslim|mohammed|muhammad|ghaz+ali|hadith|\bsufi|kashf|moslem|mohammedan|\brumi\b|\bjabir\b|\bgeber\b/,
    idRe: /^pickthall-/,
    curated: ["pickthall-meaning-glorious-koran-1930", "tob-10501", "ghazali-mishkat-anwar-gairdner-1924", "tob-10039"],
  },
  {
    id: "judaism", label: "Judaism",
    blurb: "Jewish scripture and scholarship in the Tower: the JPS 1917 Tanakh, the Talmud, the Targums, and the Zohar, with catalog-matched works on Torah, Mishnah, Midrash, and Kabbalah.",
    tags: T(["judaism", "jewish", "talmud", "torah", "kabbalah", "hebrew bible", "mishnah"]),
    titleRe: /talmud|torah|tanakh|mishnah|zohar|kabbalah|kabala|\bjewish\b|judaism|hebrew bible|midrash|targum|\bhebraic\b|josephus/,
    idRe: /^(tanakh-|polano-talmud|babylonian-talmud|danby-mishnah|targums-)/,
    curated: ["tob-0006", "tob-10816", "targums-etheridge-vol-1", "zohar-de-pauly-french-vol-1-1906"],
  },
  {
    id: "egypt-mesopotamia", label: "Egypt & Mesopotamia",
    blurb: "Ancient Egyptian and Mesopotamian texts in the Tower: the Egyptian Book of the Dead, the Epic of Gilgamesh, and Enuma Elish, with catalog-matched works on Egypt, Babylon, Assyria, and Sumer.",
    tags: T(["egypt", "egyptian", "egyptology", "mesopotamia", "assyriology", "babylonian", "sumerian"]),
    titleRe: /egyptian book of the dead|\begypt|pharaoh|hieroglyph|gilgamesh|babylon|assyria|mesopotamia|sumerian|akkadian|enuma|book of the dead|cuneiform|pyramid texts|coffin texts/,
    idRe: /^enuma-elish/,
    curated: ["tob-4053", "tob-10088", "enuma-elish-king-1902"],
  },
  {
    id: "indigenous-folk", label: "Indigenous & Folk Traditions",
    blurb: "Indigenous and folk tradition texts in the Tower: the Popol Vuh, the Chilam Balam of Chumayel, and Kirby's Kalevala, with catalog-matched works on Maya, Aztec, Inca, Native American, and folk traditions worldwide.",
    tags: T(["folklore", "folk tales", "fairy tales", "mythology", "native american"]),
    titleRe: /popol vuh|chilam balam|kalevala|\bmaya\b|mayan|\baztec\b|\binca\b|peruvian|navajo|apache|\bsioux\b|dakota|ojibwa|algonquin|iroquois|maori|hawaiian|polynesian|\bfinnish (epic|folk|myth)|estonian folk|slavonic folk|folk tales|fairy tales|folklore|yoruba|\bifa\b|orisha|ashanti|african (myth|folk|legend)|slavic|bylina|baba yaga|russian folk/,
    idRe: null,
    curated: ["tob-4274-d1", "roys-chilam-balam-chumayel-1933", "kalevala-vol-1-kirby-1907"],
  },
  {
    id: "greek-roman", label: "Greek & Roman",
    blurb: "Greek and Roman classics in the Tower: Butler's Iliad and Odyssey, Plato's Republic, Marcus Aurelius, and Epictetus, with catalog-matched works of classical philosophy, history, and literature.",
    tags: T(["stoicism", "stoic", "greek philosophy", "roman philosophy", "classics"]),
    titleRe: /\bhomer\b|iliad|odyssey|\bplato\b|aristotle|socrates|marcus aurelius|epictetus|\bseneca\b|\bstoic|cicero|\bvirgil\b|\bovid\b|aeneid|plutarch|xenophon|thucydides|herodotus|euripides|sophocles|aeschylus|aristophanes|lucretius|plotinus|greek philosophy|greek mythology|roman philosophy|tacitus|\blivy\b|pausanias|strabo|proclus|porphyry|iamblichus|neoplaton/,
    idRe: /^(homer-|marcus-aurelius|epictetus-|cicero-)/,
    curated: ["homer-iliad-butler", "homer-odyssey-butler", "the-republic", "marcus-aurelius-meditations-long", "epictetus-discourses-enchiridion-matheson"],
  },
  {
    id: "christianity", label: "Christianity",
    blurb: "Christian texts in the Tower: the King James Bible, Augustine's Confessions, The Imitation of Christ, Bunyan's Pilgrim's Progress, and the Ante-Nicene Fathers, with catalog-matched works of scripture, patristics, and theology.",
    tags: T(["patristics", "church fathers", "nicene and post-nicene fathers", "ante-nicene fathers", "bible", "biblical", "christian", "christianity", "catholic", "theology", "new testament", "old testament", "jesus", "gospel"]),
    titleRe: /\bbible\b|biblical|\bjesus\b|\bchrist\b|christian|gospel|new testament|old testament|catholic|church fathers|apostle|epistles?\b|psalms?\b|doctrine of|sermons?\b|\bquaker|society of friends|christian science|mary baker eddy|science and health|unitarian|methodist|\bwesley\b|aquinas|summa theologica|dante|divine comedy|smalcald|lutheran|augsburg confession|george fox|ante-nicene|post-nicene|nicene|apostolic fathers/,
    creatorRe: /\(kjv\)|^saint\b|^st\.\s/i,
    idRe: null,
    curated: ["holy-bible-king-james-version", "tob-3002", "bunyan-pilgrims-progress-1678", "ante-nicene-fathers-vol-2"],
  },
  {
    // The remainder is not a tradition: it is every BOOKS record the
    // rules above leave unclaimed that the catalog itself shelves as a
    // sacred text or that carries a religious signal (see
    // remainderApplies). It carries no rules of its own — traditionOf
    // never returns it — and it is labeled as a remainder everywhere it
    // appears.
    id: "sacred-wisdom-remainder", label: "More Sacred & Wisdom Texts",
    blurb: "Sacred and wisdom writing in the Tower that no single tradition claims: comparative religion, mysticism, mythology, and devotional works from across traditions — the remainder of the sacred shelf, gathered in one place.",
    tags: T([]),
    titleRe: null,
    idRe: null,
    curated: [],
    remainder: true,
  },
];

function traditionOf(record) {
  const tags = tagList(record).map((t) => String(t).toLowerCase().trim());
  const title = String(record.title || "").toLowerCase();
  const id = record.artifact_id;
  const creator = decodeEntities(record.creator || "");
  for (const def of TRADITION_DEFS) {
    if (def.remainder) continue;
    if (tags.some((t) => def.tags.has(t))) return def.id;
    if (def.titleRe && def.titleRe.test(title)) return def.id;
    if (def.idRe && def.idRe.test(id)) return def.id;
    if (def.creatorRe && def.creatorRe.test(creator)) return def.id;
  }
  return null;
}

// ---------------------------------------------------------------------
// The sacred-shelf remainder: BOOKS records no tradition claims that
// the catalog itself shelves as sacred texts, or whose title/tags carry
// a religious signal. The prefix test is copied from the browse
// taxonomy (src/lib/tower-taxonomy.js — BOOKS "sacred" subcategory;
// copy-don't-import, per the module-boundary rule) so the remainder
// holds exactly what the Collections axis calls sacred, minus what the
// traditions claim.

const REMAINDER_SIGNAL = /bible|biblical|scripture|sacred|theolog|religio|mystic|prayer|sermon|gospel|psalm|hymn|ritual|doctrine|prophet|apostl|worship|liturgy|catechism|devotion|spiritual|pilgrim|monastic/;
const REMAINDER_SACRED_PREFIXES = new Set(
  "alexander-of,alphonsus-uniformity,ambrose-of,andrewes-devotions,anguttara-nikaya,aphrahat-the,aristides-the,asterius-the,athanasius-against,athanasius-de,athanasius-defence,athanasius-festal,athanasius-four,athanasius-history,athanasius-on,athanasius-personal,athanasius-synodal,athanasius-the,athanasius-to,athanasius-tomus,athenagoras-the,attar-bird,augustine-of,basil-the,clement-of,clementine-literature,constantine-the,cyprian-the,cyprian-treatises,cyril-of,dionysius-of,enuma-elish,ephraim-the,eusebius-the,gennadius-of,ghazali-mishkat,giles-taoist,gregory-of,gregory-thaumaturgus,gregory-the,hilary-of,hippolytus-against,hippolytus-on,hippolytus-refutation,hippolytus-the,ignatius-of,itivuttaka-sujato,jataka-cowell,jerome-against,jerome-jerome,jerome-lives,jerome-prefaces,jerome-the,jerome-to,john-cassian,john-chrysostom,john-of,julius-africanus,justin-martyr,kalpa-sutra,khuddakapatha-sujato,lactantius-a,lactantius-fragments,lactantius-of,lactantius-on,lactantius-the,leo-the,lockyer-stonehenge,majjhima-nikaya,malchion-epistles,methodius-from,methodius-oration,novatian-on,origen-epistle,origen-origen,pamphilus-an,phileas-fragments,phileas-the,pickthall-meaning,pierius-a,polano-talmud,ptolemy-tetrabiblos,rapaport-tales,rufinus-of,ruysbroeck-adornment,samyutta-nikaya,socrates-scholasticus,sozomen-the,stukeley-stonehenge,sulpitius-severus,suso-eternal,suso-life,tanakh-jps,tatian-the,tauler-following,tauler-inner,tertullian-a,tertullian-ad,tertullian-against,tertullian-an,tertullian-appendix,tertullian-de,tertullian-of,tertullian-on,tertullian-scorpiace,tertullian-the,tertullian-to,the-didache,the-epistle,theodoret-letters,theodoret-the,theognostus-from,theonas-the,theophilus-of,theragatha-sujato,therigatha-sujato,udana-sujato,upanishads-muller,uttaradhyayana-jacobi,various-early,victorinus-commentary,vincent-of,vishnu-purana,way-of".split(",")
);
const REMAINDER_SACRED_IA = new Set(
  "jesuit-relations,nicene-post,ante-nicene,thomson-bible,saint-simon,psalms-of,saint-martin,churchward-lost,gospel-philip,gospel-truth,aquarian-gospel,shaku-sermons,tauler-sermons,baxter-saints,westcott-gospel,loisy-gospel,geneva-bible,coverdale-bible,bishops-bible,holy-bible,satow-jesuit,bernard-sermons".split(",")
);

function remainderApplies(record) {
  const id = record.artifact_id || "";
  if (id.startsWith("tob-")) return true;
  const m = /^([a-z0-9]+(?:-[a-z0-9]+)?)/.exec(id);
  const p = m ? m[1] : "";
  if (REMAINDER_SACRED_PREFIXES.has(p) || REMAINDER_SACRED_IA.has(p)) return true;
  const hay = `${String(record.title || "").toLowerCase()} ${tagList(record).join(" ").toLowerCase()}`;
  return REMAINDER_SIGNAL.test(hay);
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
  {
    id: "pentagon", label: "Pentagon Papers",
    blurb: "The Pentagon Papers in the Tower: the United States–Vietnam Relations study — the Defense Department's secret history of decision-making in Vietnam.",
    test: (id) => id.startsWith("pentagon-papers"),
  },
  {
    // Catch-all, filled by buildHubIndexData from DECLASSIFIED records
    // no programme prefix claims. test() never matches directly.
    id: "other", label: "Other Declassified Releases",
    blurb: "Declassified records in the Tower outside the named programmes: the govdocs archive and one-off releases such as the 9/11 Commission and Warren Commission reports.",
    test: () => false,
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
    // 2026-11-11 completeness pass: the three pins whose records no
    // longer exist (tob-0004 Bhagavad Gita, tob-10233 Dhammapada,
    // tob-10337 Egyptian Book of the Dead) were replaced by the live
    // editions of the same works, and every CANON entry for this group
    // that the catalog holds was added — the group now carries the
    // catalog's whole sacred canon, not a sample of it.
    ids: [
      "holy-bible-king-james-version", "pickthall-meaning-glorious-koran-1930",
      "tob-0006", "tob-0005", "tibetan-book-of-dead-evans-wentz-1927",
      "tob-0214", "tyndale-pentateuch-1530", "rheims-new-testament-1582",
      "bible-tyndale-new-testament-1526", "babylonian-talmud-rodkinson-vol-1",
      "barclay-talmud-1878", "danby-mishnah-1933", "zohar-de-pauly-french-vol-1-1906",
      "kabbalah-unveiled-mathers-1887", "waite-holy-kabbalah-1929", "tob-0009",
      "judge-bhagavad-gita-1890", "tob-13450", "tob-9104",
      "rig-veda-griffith-1896", "tob-9100", "tob-0003", "tob-13328",
      "dutt-ramayana-bala-kanda", "dutt-mahabharata-adi-parva", "tob-10236",
      "heart-sutra-muller-sbe49", "tob-4314", "tob-4230", "tob-10415",
      "i-ching-legge-1882", "art-of-war-giles-1910", "popol-vuh-spence-1908",
      "brasseur-popol-vuh-1861", "tob-4107", "sbe-23-zend-avesta-2-1883",
      "tob-4053", "augustine-confessions-watts-vol-1-1919",
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
      // 2026-11-11: the two canon works the fallback set did not cover.
      "virgil-aeneid-dryden-1697",
      "shakespeare-complete-works-1623",
    ],
  },
];

// ---------------------------------------------------------------------
// Study shelves: audience-keyed cross-cuts over the same walk
// (2026-11-11). Unlike traditions these are NOT first-match — a work
// can sit on several shelves. Rules were audited over the full catalog;
// creator patterns name the canonical authors whose complete shelves
// belong (surname collisions checked: e.g. Alfred Russel Wallace, not
// Lew Wallace; Isaac Newton, not John Newton).

export const AUDIENCE_DEFS = [
  {
    // Every DOCUMENTS + DECLASSIFIED record — the cross-lane union the
    // single-select Collections axis cannot express.
    id: "primary-sources", label: "Primary Sources",
    lanes: ["DOCUMENTS", "DECLASSIFIED"],
  },
  {
    id: "philosophy", label: "Philosophy",
    tags: T(["philosophy", "metaphysics", "ethics", "logic", "epistemology", "aesthetics", "philosopher", "philosophers", "stoicism", "existentialism"]),
    titleRe: /philosoph|metaphysic|epistemolog|\bethics\b|\blogic\b|aesthetic|phenomenolog|existential|critique of (pure|practical)|zarathustra|beyond good and evil|genealogy of morals|world as will|fear and trembling|sickness unto death|tractatus|also sprach/,
    idRe: /^(kant-|nietzsche-|descartes-|spinoza-|hume-|locke-|schopenhauer-|kierkegaard-|russell-|hegel-|leibniz-|berkeley-|proclus-|plato-|aristotle-)/,
    creatorRe: /(augustine|santayana|dewey, john|john dewey|russell|voltaire|william james|john stuart mill|david hume|hume, david|whitehead|royce|emerson|herbert spencer|bayle|spinoza|schopenhauer|aristotle|plato|mctaggart|hutcheson|bosanquet|g\. e\. moore|berkeley|croce|lotze|\bkant\b|proclus|diogenes laertius|descartes|nietzsche|kierkegaard|hegel|leibniz|plotinus|marcus aurelius|epictetus|seneca|lucretius|francis bacon|hobbes|john locke|locke, john|thomas reid|joseph butler|shaftesbury|mandeville|fichte|schelling|schleiermacher|feuerbach|comte|bergson|peirce|f\. h\. bradley|t\. h\. green|caird|samuel alexander|james ward|f\. c\. s\. schiller|aquinas|philo of alexandria|nukariya|thomas taylor|diderot|rousseau|montesquieu|vico|herder|friedrich schlegel|f\. schlegel)/i,
  },
  {
    id: "epics-myths-sagas", label: "Epics, Myths & Sagas",
    titleRe: /iliad|odyssey|aeneid|mahabharata|ramayana|gilgamesh|kalevala|popol vuh|beowulf|\bedda\b|shahnameh|nibelungenlied|song of roland|chanson de roland|\bel cid\b|\bnjal\b|volsunga|volsung|divine comedy|paradise lost|orlando furioso|jerusalem delivered|faerie queene|kalevipoeg|mabinogion|epic of|book of invasions|argonautica|thebaid|pharsalia|metamorphoses/,
    idRe: /(iliad|odyssey|aeneid|mahabharata|ramayana|gilgamesh|kalevala|beowulf|edda|nibelungenlied|shahnameh|mabinogion|popol-vuh)/,
  },
  {
    id: "classics-of-science", label: "Classics of Science",
    titleRe: /origin of species|descent of man|vestiges of the natural history|principia|two chief world systems|sidereus|de revolutionibus|on the revolutions|theory of relativity|voyage of the beagle|expression of the emotions|principles of geology|natural selection|creative evolution|foundations of science|space, time and gravitation|evolution of man|history of the planetary|copernicus|galileo|\bkepler\b|\bnewton\b|einstein|\bdarwin\b/,
    idRe: /^(darwin-|newton-)/,
    creatorRe: /(darwin|thomas henry huxley|thomas h\. huxley|huxley, thomas|alfred russel wallace|wallace, alfred|haeckel|einstein|isaac newton|newton, isaac|galileo|kepler|lyell|agassiz|asa gray|tyndall|faraday|maxwell|herschel|lamarck|cuvier|linnaeus|poincaré|poincare|eddington|james jeans|kropotkin|herbert spencer)/i,
  },
];

// BOOKS-lane shelf matches for one record (all matching shelves —
// cross-cuts, not first-match). Primary Sources is lane-driven and
// handled by the walk itself.
function audienceMatches(record) {
  const tags = tagList(record).map((t) => String(t).toLowerCase().trim());
  const title = String(record.title || "").toLowerCase();
  const id = record.artifact_id;
  const creator = decodeEntities(record.creator || "");
  const out = [];
  for (const def of AUDIENCE_DEFS) {
    if (def.lanes) continue;
    if (def.tags && tags.some((t) => def.tags.has(t))) { out.push(def.id); continue; }
    if (def.titleRe && def.titleRe.test(title)) { out.push(def.id); continue; }
    if (def.idRe && def.idRe.test(id)) { out.push(def.id); continue; }
    if (def.creatorRe && def.creatorRe.test(creator)) { out.push(def.id); continue; }
  }
  return out;
}

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
  const audienceLists = new Map(AUDIENCE_DEFS.map((d) => [d.id, []]));

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
        const tid = traditionOf(r) || (remainderApplies(r) ? "sacred-wisdom-remainder" : null);
        if (tid) {
          const slot = traditionSlots.get(tid);
          if (!slot.seen.has(r.artifact_id)) {
            slot.seen.add(r.artifact_id);
            slot.derived.push(lr);
          }
        }
        for (const aid of audienceMatches(r)) audienceLists.get(aid).push(lr);
        for (const fb of courseFallbacks) {
          if (fallbackWinners.has(fb.key)) continue;
          if (!fb.re.test(lr.title)) continue;
          if (fb.creator && !lr.creator.toLowerCase().includes(fb.creator)) continue;
          fallbackWinners.set(fb.key, lr);
        }
      }
      {
        // Programme prefixes are tested over ALL records (a handful of
        // programme records sit in other lanes); DECLASSIFIED records
        // no prefix claims fall into the "other" catch-all.
        let pid = null;
        for (const def of PROGRAMME_DEFS) {
          if (def.id !== "other" && def.test(r.artifact_id)) { pid = def.id; break; }
        }
        if (pid) programmes.get(pid).push(lr);
        else if (r.collection === "DECLASSIFIED") programmes.get("other").push(lr);
        if (r.collection === "DOCUMENTS" || r.collection === "DECLASSIFIED") {
          audienceLists.get("primary-sources").push(lr);
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

  // Storage cap (2026-11-03): the generated JSON is also a deployed
  // Pages asset with a 25 MiB per-file cap, and mega-authors (55k works
  // for the largest) pushed the 1.18M-catalog regeneration to 75 MiB.
  // Each author's stored work list is capped at 500 (title order); the
  // author's `count` field keeps the true total, and API consumers get
  // { works: sample, total: count }. Traditions/programmes lists are
  // orders of magnitude smaller and stay complete.
  for (const [name, list] of authorWorks) {
    if (list.length > 500) authorWorks.set(name, list.slice(0, 500));
  }

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
    audiences: Object.fromEntries(
      [...audienceLists].map(([id, list]) => [id, list.sort(byTitle)])
    ),
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
