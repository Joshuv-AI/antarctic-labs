// Tower of Babel — personal library and archival project. Tower of
// Babel is a major independent destination, NOT another Expedition.
//
// The artifact catalog (data model + entries) lives in ./library-catalog.js.
// This file holds only the marketing copy that renders on /tower-of-babel
// and /tower-of-babel/library.

export { artifacts, TOWER_COLLECTIONS, TOWER_RIGHTS, TOWER_DOWNLOAD_STATUS } from "./library-catalog.js";

export const towerOfBabel = {
  heading: "A LIBRARY AGAINST FORGETTING.",
  intro: [
    "Tower of Babel is a personal library and archival project — thousands of books, documents, transcripts, and texts gathered into one organized, searchable collection.",
    "It exists because important information disappears. It gets suppressed, dismissed, deleted, or quietly rewritten. This library is one person's attempt to keep that from happening: a personal, unchangeable copy of the texts that matter most — open to everyone.",
  ],
  origin: [
    "It started with a reaction. I read that Anthropic was scanning books and destroying them afterward, and something about that didn't sit right with me. If the people building the future of knowledge are comfortable destroying books, then somebody ought to be preserving them.",
    "At first I was only thinking about old texts — books, manuscripts, the important stuff. But the more I worked on it, the more the idea grew. I asked myself what was most important to preserve, and the answer was religion: the sacred texts and religious material of every culture and every tradition. No favoritism, no picking sides — all of it. I wanted my own personal version that nobody could change, rewrite, or take away.",
    "Then the idea grew again. I started thinking about everything else that gets lost — the things people are told not to take seriously. Secret societies, religious movements, fairy tales passed down through generations, stories people swear happened to them, phenomena that get brushed off and forgotten. A lot of it is taboo. Say you think aliens might be real and watch the room change. But dismissed doesn't mean untrue — and I kept seeing connections between these things. Religion, secret societies, folklore, the unexplained: threads that seem to lead toward something bigger.",
    "And there's another kind of text worth saving: the long conversations. There are podcasts out there — hours long — with experts, researchers, and people with real-world experiences, full of information you can't find anywhere else. I watch them, I learn from them, and I wanted a way to keep them. To always be able to go back, reference them, and add them to this growing body of knowledge.",
    "That's what Tower of Babel became: not just old books, but a living archive of everything worth preserving — growing over time, in every direction that matters.",
  ],
  collection: [
    "The library spans a wide range of fields: sacred and religious texts from every tradition, philosophy, history, science, law, and literature — alongside the harder-to-categorize material: declassified government documents, investigations into secret societies, accounts of the unexplained, folklore and mythology, and full transcripts of long-form podcasts.",
    "Every entry is verified — title, creator, edition, translation, and content checked against the source — and converted to clean, searchable text. Copyright is the only reason a work ever ships without its full text.",
  ],
  name: [
    "I named it after the Tower of Babel — the old story of a place where the works of the world were gathered together, where knowledge was meant to be open and shared.",
    "That is the idea here: a single library collecting the most important texts from every corner — every culture, every tradition, every field — so the information is truly open. For the people. For everyone. No suppression, no hiding.",
    "The deeper purpose is connection. When thousands of texts sit side by side in one searchable place, patterns emerge. A story in one tradition echoes a declassified document in another; a folktale rhymes with a witness account. Anyone can read, anyone can research, anyone can start pulling those threads — and maybe unravel a greater story than any single book could tell. Something like the Akashic records: the whole of human knowledge, unlocked, open to everyone.",
  ],
  access: [
    "Where redistribution is permitted, the full text of each work can be read and downloaded directly from the archive.",
    "Where redistribution is restricted, Tower of Babel preserves the complete metadata and points back to the appropriate source. Nothing is hidden about what the library holds — only the files that can't legally be shared are withheld.",
  ],
  rebuild: {
    heading: "REBUILD",
    body: [
      "The long-term goal is for the structure of Tower of Babel to be reproducible.",
      "A complete library should not depend on one person's computer, one hard drive, or one website. Where the underlying material can legally be shared, the archive should make it possible for others to reconstruct the same collection from its published structure and manifests. Knowledge this important shouldn't have a single point of failure.",
    ],
  },
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
