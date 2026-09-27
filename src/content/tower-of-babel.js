// Tower of Babel — personal library and archival project. Tower of
// Babel is a major independent destination, NOT another Expedition.
//
// The artifact catalog (data model + entries) lives in ./library-catalog.js.
// This file holds only the marketing copy that renders on /tower-of-babel
// and /tower-of-babel/library.

export { artifacts, TOWER_COLLECTIONS, TOWER_RIGHTS, TOWER_DOWNLOAD_STATUS } from "./library-catalog.js";

export const towerOfBabel = {
  heading: "TOWER OF BABEL",
  intro: [
    "Tower of Babel is a library and archival project from Antarctic Labs — thousands of books, documents, transcripts, and texts in one organized, searchable collection.",
    "It exists because important information disappears: suppressed, dismissed, deleted, quietly rewritten. This is an attempt to stop that — an unchangeable copy of the texts that matter most, preserved independently and open to everyone.",
  ],
  origin: [
    "It began with a reaction: the news that Anthropic was scanning books and destroying them afterward. If the organizations building the future of knowledge are comfortable destroying books, then someone should be preserving them.",
    "It started with old texts — the important works. Then came the question of what mattered most, and the answer was religion: the sacred texts of every culture and every tradition. No favoritism, no picking sides — a personal, unchangeable copy of the world's most important texts, one nobody could rewrite or take away.",
    "From there the archive grew toward everything else that gets lost: secret societies, folklore passed down through generations, firsthand accounts of the unexplained, phenomena brushed off and forgotten. Dismissed doesn't mean untrue — and across these fields the same threads keep appearing, pointing toward something bigger. The long conversations joined too: hours-long podcasts with experts and researchers, kept searchable instead of vanishing into a feed.",
    "What began as one person's preservation effort became something larger: a living archive of everything worth keeping, growing in every direction that matters.",
  ],
  collection: [
    "The library spans sacred and religious texts from every tradition, philosophy, history, science, law, and literature — alongside the harder-to-categorize material: declassified government documents, secret societies, the unexplained, folklore and mythology, and full podcast transcripts.",
    "Every entry is verified — title, creator, edition, translation, and content checked against the source — and converted to clean, searchable text. Copyright is the only reason a work ever ships without its full text.",
  ],
  name: [
    "It takes its name from the Tower of Babel — the old story of a place where the works of the world were gathered together, where knowledge was meant to be open and shared.",
    "That is the idea here: one library collecting the most important texts from every corner — every culture, every tradition, every field — so the information is truly open. No suppression, no hiding.",
    "The deeper purpose is connection. When thousands of texts sit side by side, patterns emerge: a story in one tradition echoes a declassified document in another; a folktale rhymes with a witness account. Anyone can read, anyone can research — and maybe unravel a greater story than any single book could tell. Something like the Akashic records: the whole of human knowledge, unlocked, open to everyone.",
  ],
  access: [
    "Where redistribution is permitted, the full text of each work can be read and downloaded directly from the archive.",
    "Where it is restricted, the library preserves the complete metadata and points back to the source. Nothing is hidden about what it holds — only the files that can't legally be shared are withheld.",
  ],
  // Library landing — separate destination at /tower-of-babel/library.
  library: {
    heading: "THE LIBRARY",
    intro:
      "The catalog of collected books, documents, research, references, and other material. Individual resources appear here once finalized.",
    empty: {
      heading: "THE ARCHIVE IS BEING PREPARED.",
      body:
        "Tower of Babel is being structured before the catalog opens. Once entries are finalized, they will appear here with their rights status, source links, and (where redistribution is permitted) direct access.",
    },
  },
};
