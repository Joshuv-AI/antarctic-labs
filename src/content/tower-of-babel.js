// Tower of Babel — personal library and archival project. Tower of
// Babel is a major independent destination, NOT another Expedition.
//
// The artifact catalog (data model + entries) lives in ./library-catalog.js.
// This file holds only the marketing copy that renders on /tower-of-babel
// and /tower-of-babel/library.

export { artifacts, TOWER_COLLECTIONS, TOWER_RIGHTS, TOWER_DOWNLOAD_STATUS } from "./library-catalog.js";

export const towerOfBabel = {
  heading: "A LIBRARY BUILT TO BE EXPLORED.",
  intro: [
    "Tower of Babel is a personal library and archival project — a growing collection of books, documents, research, references, and other material gathered into one organized system.",
    "The goal isn’t simply to collect information. It’s to make the collection structured, understandable, searchable, and potentially reproducible.",
  ],
  origin: [
    "The library began as a personal effort to bring scattered information into one place.",
    "Over time, the collection became something larger: an attempt to organize useful knowledge into a structure that can be explored, preserved, and shared.",
  ],
  access: [
    "Where redistribution is permitted, individual resources can be accessed directly from the archive.",
    "Where redistribution is restricted, Tower of Babel preserves the metadata and points back to the appropriate source.",
  ],
  rebuild: {
    heading: "REBUILD",
    body: [
      "The long-term goal is for the structure of Tower of Babel to be reproducible.",
      "A complete library should not depend on one person’s computer, one hard drive, or one website. Where the underlying material can legally be shared, the archive should make it possible for others to reconstruct the same collection from its published structure and manifests.",
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
