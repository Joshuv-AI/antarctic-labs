// Tower of Babel — personal library and archival project. Tower of
// Babel is a major independent destination, NOT another Expedition. The
// data model distinguishes downloadable, metadata-only, externally
// sourced, and restricted material. Catalog entries will be provided by
// the lead engineer; the data model is empty per the Stage B rule "Do
// NOT create fake downloadable files or claim a library is currently
// available."

export const TOWER_COLLECTIONS = [
  "BOOKS",
  "DOCUMENTS",
  "PAPERS",
  "ARCHIVES",
  "REFERENCE",
  "MEDIA",
  "OTHER",
];

export const TOWER_RIGHTS = [
  "OWNED",
  "PUBLIC_DOMAIN",
  "EXTERNAL_SOURCE",
  "RESTRICTED",
];

export const TOWER_DOWNLOAD_STATUS = [
  "AVAILABLE",
  "METADATA_ONLY",
  "EXTERNAL_LINK",
  "RESTRICTED",
];

/**
 * Artifact record.
 *
 * Required: artifact_id, title, collection.
 * Optional: creator, year, description, category, subcategory, format,
 * file_size, source, source_url, rights_status, license, download_status,
 * download_url, checksum, version, tags.
 */
export const artifacts = [];

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
  // Library landing — separate destination at /tower-of-babel/library.
  library: {
    heading: "THE LIBRARY",
    intro:
      "The catalog of collected books, documents, research, references, and other material. Individual resources appear here once finalized.",
    note: "Catalog entries are not yet available. The data model is in place; the lead engineer will populate the archive.",
  },
};
