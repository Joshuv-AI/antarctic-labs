// Tower of Babel — Collections browser data (SPA side).
//
// The Collections browser is a FILTER on the main Tower page's existing
// entry list, not a set of pages. It reads public/tower-hubs-index.json
// (the precomputed hub data, regenerated from the live catalog by
// scripts/generate-hubs-index.mjs) and turns each hub's work list into
// an id Set the list filter intersects with search + category + sort.
//
// Blurbs below are copied verbatim from functions/_lib/tower-hubs.js
// (the server hub definitions) so the in-page browser says exactly what
// the old hub pages said. This module must NOT import server function
// code — the SPA bundle cannot run Pages Function modules, and the
// blurbs are content, not logic. Course groups carry no blurb in the
// server definitions, so theirs are short label-grounded lines written
// here (no claims about specific works beyond the group label).
//
// Loading is lazy and failure-tolerant: loadHubsIndex() fetches the
// JSON once per session and resolves null on any failure, in which
// case the Tower page hides the Collections UI and keeps the existing
// category browse — never an error panel.

export const COLLECTION_GROUPS = [
  { id: "traditions", label: "Sacred traditions" },
  { id: "authors", label: "Authors" },
  { id: "programmes", label: "Declassified programmes" },
  { id: "course", label: "Course primary sources" },
];

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
};

export const PROGRAMME_BLURBS = {
  cia: "Declassified CIA records in the Tower from the CREST release: intelligence reports, estimates, and memoranda published by the Central Intelligence Agency.",
  state:
    "Foreign Relations of the United States volumes in the Tower: the State Department's official record of U.S. foreign policy decisions and diplomatic activity, from 1861 forward.",
  congress:
    "Congressional material in the Tower: Government Accountability Office reports to Congress and the public laws enacted by the United States Congress.",
  un: "United Nations records in the Tower: Security Council and General Assembly documents, resolutions, and meeting records.",
  nsarchive:
    "Declassified U.S. national security documents in the Tower published through the National Security Archive's FOIA-based releases.",
  fbi: "FBI records in the Tower released through the Bureau's Vault reading room: investigative files published under FOIA.",
};

export const COURSE_BLURBS = {
  "Founding documents":
    "Charters, constitutions, declarations, and addresses that founded nations and defined rights.",
  "Sacred & wisdom landmarks":
    "The central scriptures and wisdom texts of the world's traditions.",
  "Landmark works":
    "The books and epics that anchor the canon — philosophy, literature, and science.",
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
        if (!d || !d.traditions || !d.topAuthors || !d.programmes || !d.course)
          return null;
        return d;
      })
      .catch(() => null);
  }
  return hubsPromise;
}

// Turn the raw hub index into group/collection descriptors the Tower
// page renders. Work lists become id Sets (the entry list renders from
// the catalog, never from hub data), so the large JSON arrays can be
// released after this conversion.
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
  const authors = (data.topAuthors || []).map((a) => ({
    key: `author:${a.slug}`,
    label: a.name,
    count: a.count,
    blurb: `${a.count.toLocaleString()} works by ${a.name} in the Tower.`,
    ids: toSet(a.works),
  }));
  const programmes = Object.entries(data.programmes).map(([id, works]) => ({
    key: `programme:${id}`,
    label: PROGRAMME_LABELS[id] || id,
    count: works.length,
    blurb: PROGRAMME_BLURBS[id] || "",
    ids: toSet(works),
  }));
  const course = (data.course.groups || []).map((g, i) => ({
    key: `course:${i}`,
    label: g.label,
    count: g.items.length,
    blurb: COURSE_BLURBS[g.label] || "",
    ids: toSet(g.items),
  }));
  return {
    total: data.total,
    groups: [
      { id: "traditions", collections: traditions },
      { id: "authors", collections: authors },
      { id: "programmes", collections: programmes },
      { id: "course", collections: course },
    ],
  };
}

// Labels for traditions/programmes (the hub index carries work lists,
// not labels, for these two groups).
export const TRADITION_LABELS = {
  jainism: "Jainism",
  shinto: "Shinto",
  zoroastrianism: "Zoroastrianism",
  lds: "Latter-day Saint",
  buddhism: "Buddhism",
  hinduism: "Hinduism",
  "taoism-china": "Taoism & Chinese Classics",
  islam: "Islam",
  judaism: "Judaism",
  "egypt-mesopotamia": "Egypt & Mesopotamia",
  "indigenous-folk": "Indigenous & Folk Traditions",
  "greek-roman": "Greek & Roman",
  christianity: "Christianity",
};

export const PROGRAMME_LABELS = {
  cia: "CIA — CREST",
  state: "State — FRUS",
  congress: "Congress — GAO & Public Laws",
  un: "United Nations",
  nsarchive: "National Security Archive",
  fbi: "FBI Vault",
};
