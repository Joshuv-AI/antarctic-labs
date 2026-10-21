// Tower of Babel — curated shelves for the landing page (revamp 2026-10-21).
//
// Every id below was verified present in the catalog when this file was
// written. Components resolve ids against the live catalog and silently
// drop any that no longer resolve, so a shelf degrades gracefully if the
// catalog changes underneath it — it never renders a dead card.
//
// Presentation only: buckets reference the existing two-level filter
// ("BOOKS", "BOOKS:sacred", …); no filter behavior lives here.

// "Browse the stacks" cards, in display order. `covers` = the fanned
// collage on the card face; `rail` = the shelf panel's notable works.
export const STACKS = [
  {
    bucket: "BOOKS",
    label: "Books",
    blurb: "Literature, classics, philosophy",
    covers: [
      "holy-bible-king-james-version",
      "homer-iliad-butler",
      "austen-pride-and-prejudice-1813",
    ],
    rail: [
      "homer-iliad-butler",
      "homer-odyssey-butler",
      "dante-divine-comedy-cary-1814",
      "shakespeare-hamlet-1603",
      "austen-pride-and-prejudice-1813",
      "melville-moby-dick-1851",
      "frankenstein-1818",
      "bronte-jane-eyre-1847",
      "bunyan-pilgrims-progress-1678",
      "virgil-aeneid-dryden-1697",
    ],
  },
  {
    bucket: "BOOKS:sacred",
    label: "Sacred Texts",
    blurb: "The canons of every tradition",
    covers: [
      "pickthall-meaning-glorious-koran-1930",
      "tob-0004",
      "tob-0005",
    ],
    rail: [
      "holy-bible-king-james-version",
      "pickthall-meaning-glorious-koran-1930",
      "tob-0004",
      "tob-0005",
      "tob-10233",
      "tob-0006",
      "tob-0214",
      "tob-10088",
      "i-ching-legge-1882",
      "rig-veda-griffith-1896",
    ],
  },
  {
    bucket: "PAPERS",
    label: "Papers",
    blurb: "Research across the sciences",
    covers: ["plos-pone-0011126", "pmc-7095448", "pmc-4290824"],
    rail: [
      "plos-pone-0011126",
      "pmc-7095448",
      "pmc-4290824",
      "plos-pone-0004169",
    ],
  },
  {
    bucket: "DECLASSIFIED",
    label: "Declassified",
    blurb: "Released government records",
    covers: [
      "govdocs-archive_org-mkultra-the-hidden-record-14pt-complete-",
      "pentagon-papers-vol-2",
      "frus-1964-68v01-d258",
    ],
    rail: [
      "govdocs-archive_org-mkultra-the-hidden-record-14pt-complete-",
      "pentagon-papers-vol-2",
      "pentagon-papers-vol-3",
      "frus-1964-68v01-d258",
      "frus-1964-68v01-d265",
    ],
  },
  {
    bucket: "DOCUMENTS",
    label: "Documents",
    blurb: "Founding texts, laws, treaties",
    covers: [
      "us-declaration-of-independence",
      "us-constitution-bill-of-rights",
      "magna-carta-1215",
    ],
    rail: [
      "us-declaration-of-independence",
      "us-constitution-bill-of-rights",
      "magna-carta-1215",
      "federalist-papers",
      "gettysburg-address",
      "emancipation-proclamation-1863",
      "udhr-1948",
      "english-bill-of-rights-1689",
    ],
  },
  {
    bucket: "REFERENCE",
    label: "Reference",
    blurb: "Encyclopedias and reference works",
    covers: ["tob-10544-d1", "tob-10811-d1", "tob-13749-d1"],
    rail: ["tob-10544-d1", "tob-10811-d1", "tob-13749-d1", "bible-genesis-kjv"],
  },
  {
    bucket: "PODCASTS",
    label: "Podcasts",
    blurb: "Long conversations, transcribed",
    covers: [
      "podcast-joerogan-vtxyvD58eDg",
      "podcast-dannyjones--FQghS0GRhU",
      "podcast-tuckercarlson-0jwHNHCUROo",
    ],
    rail: [
      "podcast-joerogan-vtxyvD58eDg",
      "podcast-joerogan-wo6K0Bav3K0",
      "podcast-dannyjones--FQghS0GRhU",
      "podcast-dannyjones--T38tBm54vs",
      "podcast-tuckercarlson-0jwHNHCUROo",
      "podcast-tuckercarlson-2VXbY4V7LCk",
    ],
  },
];

// "Sacred texts of the world" — grouped tile grids in the JW Library
// pattern: one group per tradition, uniform tiles, every tradition on
// equal footing. Only traditions the library actually holds appear.
// `sub` is an honest descriptor (date / form), never invented metadata.
export const TRADITIONS = [
  {
    id: "christianity",
    label: "Christianity",
    tone: "#6d4c2f",
    works: [
      { id: "holy-bible-king-james-version", label: "King James Bible", sub: "1611" },
      { id: "tob-3002", label: "Confessions of St. Augustine", sub: "c. 400" },
      { id: "tob-10071", label: "The Imitation of Christ", sub: "c. 1418" },
      { id: "bunyan-pilgrims-progress-1678", label: "The Pilgrim's Progress", sub: "1678" },
      { id: "ante-nicene-fathers-vol-2", label: "Ante-Nicene Fathers", sub: "Vol. 2" },
    ],
  },
  {
    id: "judaism",
    label: "Judaism",
    tone: "#2f4d7a",
    works: [
      { id: "tob-0006", label: "Tanakh", sub: "JPS 1917" },
      { id: "tob-10816", label: "The Talmud", sub: "Babylonian" },
      { id: "targums-etheridge-vol-1", label: "The Targums", sub: "Vol. 1" },
      { id: "zohar-de-pauly-french-vol-1-1906", label: "The Zohar", sub: "French ed." },
    ],
  },
  {
    id: "islam",
    label: "Islam",
    tone: "#1f6f50",
    works: [
      { id: "pickthall-meaning-glorious-koran-1930", label: "The Quran", sub: "Pickthall, 1930" },
      { id: "tob-10501", label: "The Quran", sub: "Translation" },
      { id: "ghazali-mishkat-anwar-gairdner-1924", label: "Mishkat al-Anwar", sub: "Al-Ghazali" },
      { id: "tob-10039", label: "Confessions of Al-Ghazali", sub: "Al-Ghazali" },
    ],
  },
  {
    id: "hinduism",
    label: "Hinduism",
    tone: "#b3541e",
    works: [
      { id: "tob-0004", label: "Bhagavad Gita", sub: "Translation" },
      { id: "rig-veda-griffith-1896", label: "The Rig Veda", sub: "Griffith, 1896" },
      { id: "tob-0191", label: "The Upanishads", sub: "Translation" },
      { id: "tob-13328", label: "The Ramayana", sub: "Valmiki" },
      { id: "vishnu-purana-wilson-1840", label: "The Vishnu Purana", sub: "Wilson, 1840" },
    ],
  },
  {
    id: "buddhism",
    label: "Buddhism",
    tone: "#7c3f58",
    works: [
      { id: "tob-10233", label: "The Dhammapada", sub: "Translation" },
      { id: "majjhima-nikaya-sujato", label: "Majjhima Nikaya", sub: "Middle Discourses" },
      { id: "samyutta-nikaya-sujato", label: "Samyutta Nikaya", sub: "Connected Discourses" },
      { id: "jataka-cowell-vol-1", label: "The Jataka Tales", sub: "Vol. 1" },
      { id: "tibetan-book-of-dead-evans-wentz-1927", label: "Tibetan Book of the Dead", sub: "1927" },
    ],
  },
  {
    id: "taoism-china",
    label: "Taoism & Chinese Classics",
    tone: "#3e6b6f",
    works: [
      { id: "tob-0005", label: "Tao Te Ching", sub: "Laozi" },
      { id: "tob-10415", label: "The Analects", sub: "Confucius" },
      { id: "i-ching-legge-1882", label: "I Ching", sub: "Legge, 1882" },
      { id: "tob-10229", label: "Chuang Tzu", sub: "Zhuangzi" },
      { id: "art-of-war-giles-1910", label: "The Art of War", sub: "Giles, 1910" },
    ],
  },
  {
    id: "jainism",
    label: "Jainism",
    tone: "#a03d2a",
    works: [
      { id: "kalpa-sutra-jacobi-1884", label: "Kalpa Sutra", sub: "Jacobi, 1884" },
      { id: "uttaradhyayana-jacobi-1895", label: "Uttaradhyayana Sutra", sub: "Jacobi, 1895" },
    ],
  },
  {
    id: "zoroastrianism",
    label: "Zoroastrianism",
    tone: "#8f4b2f",
    works: [
      { id: "tob-4107", label: "The Zend Avesta", sub: "Vendidad" },
      { id: "tob-0157", label: "The Zend Avesta", sub: "Sacred Books of the East" },
    ],
  },
  {
    id: "shinto",
    label: "Shinto",
    tone: "#a63d40",
    works: [
      { id: "kojiki-chamberlain-1882", label: "Kojiki", sub: "Chamberlain, 1882" },
      { id: "aston-nihongi-1896", label: "Nihongi", sub: "Aston, 1896" },
    ],
  },
  {
    id: "lds",
    label: "Latter-day Saints",
    tone: "#54677a",
    works: [
      { id: "tob-0214", label: "The Book of Mormon", sub: "1830" },
      { id: "smith-doctrine-covenants-1835", label: "Doctrine and Covenants", sub: "1835" },
      { id: "smith-pearl-great-price-1851", label: "The Pearl of Great Price", sub: "1851" },
    ],
  },
  {
    id: "egypt-mesopotamia",
    label: "Ancient Egypt & Mesopotamia",
    tone: "#77683a",
    works: [
      { id: "tob-10337", label: "Book of the Dead", sub: "Egyptian" },
      { id: "tob-10088", label: "Epic of Gilgamesh", sub: "Mesopotamian" },
      { id: "enuma-elish-king-1902", label: "Enuma Elish", sub: "King, 1902" },
    ],
  },
  {
    id: "indigenous-folk",
    label: "Indigenous & Folk Traditions",
    tone: "#5d6e4e",
    works: [
      { id: "tob-4274-d1", label: "Popol Vuh", sub: "K'iche' Maya" },
      { id: "roys-chilam-balam-chumayel-1933", label: "Book of Chilam Balam", sub: "Yucatec Maya" },
      { id: "kalevala-vol-1-kirby-1907", label: "The Kalevala", sub: "Finnish epic" },
    ],
  },
  {
    id: "greek-roman",
    label: "Greek & Roman Wisdom",
    tone: "#5b4a8a",
    works: [
      { id: "homer-iliad-butler", label: "The Iliad", sub: "Homer" },
      { id: "homer-odyssey-butler", label: "The Odyssey", sub: "Homer" },
      { id: "the-republic", label: "The Republic", sub: "Plato" },
      { id: "marcus-aurelius-meditations-long", label: "Meditations", sub: "Marcus Aurelius" },
      { id: "epictetus-discourses-enchiridion-matheson", label: "Discourses & Enchiridion", sub: "Epictetus" },
    ],
  },
];

// Featured rails (Open Library pattern). "From the stacks" rotates a
// fixed slice of this pool by week — curation, honestly labeled, since
// the catalog carries no view counts and no date-added field.
export const RAIL_ESSENTIAL = [
  "holy-bible-king-james-version",
  "pickthall-meaning-glorious-koran-1930",
  "tob-0004",
  "tob-0005",
  "homer-iliad-butler",
  "the-republic",
  "marcus-aurelius-meditations-long",
  "dante-divine-comedy-cary-1814",
  "shakespeare-hamlet-1603",
  "art-of-war-giles-1910",
  "tob-10088",
  "us-constitution-bill-of-rights",
  "magna-carta-1215",
  "tob-0214",
];

export const RAIL_RECORDS = [
  "govdocs-archive_org-mkultra-the-hidden-record-14pt-complete-",
  "pentagon-papers-vol-2",
  "us-declaration-of-independence",
  "us-constitution-bill-of-rights",
  "gettysburg-address",
  "emancipation-proclamation-1863",
  "udhr-1948",
  "frus-1964-68v01-d258",
];

export const STACKS_POOL = [
  "tob-10233",
  "i-ching-legge-1882",
  "frankenstein-1818",
  "tob-10816",
  "federalist-papers",
  "melville-moby-dick-1851",
  "tob-4107",
  "kojiki-chamberlain-1882",
  "pentagon-papers-vol-3",
  "austen-pride-and-prejudice-1813",
  "tob-13328",
  "epictetus-discourses-enchiridion-matheson",
  "english-bill-of-rights-1689",
  "bronte-jane-eyre-1847",
  "tibetan-book-of-dead-evans-wentz-1927",
  "virgil-aeneid-dryden-1697",
  "kalpa-sutra-jacobi-1884",
  "tob-4274-d1",
];
