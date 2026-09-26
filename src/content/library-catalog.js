// Tower of Babel — artifact catalog (data only).
// Marketing copy + landing-page hero content lives in ./tower-of-babel.js.
//
// Schema (Artifact record):
//   Required: artifact_id, title, collection
//   Optional: creator, year, description, category, subcategory, format,
//             file_size, source, source_url, rights_status, license,
//             download_status, download_url, checksum, version, tags
//
// Collection taxonomy (TOWER_COLLECTIONS):
//   BOOKS | DOCUMENTS | PAPERS | ARCHIVES | REFERENCE | MEDIA | OTHER
//
// Rights status taxonomy (TOWER_RIGHTS):
//   OWNED | PUBLIC_DOMAIN | EXTERNAL_SOURCE | RESTRICTED
//
// Download status taxonomy (TOWER_DOWNLOAD_STATUS):
//   AVAILABLE | METADATA_ONLY | EXTERNAL_LINK | RESTRICTED
//
// File-staging convention (Cloudflare Pages serves dist/public/* directly):
//   /public/tower-of-babel/<artifact_id>.txt
//   /public/tower-of-babel/<artifact_id>.pdf  (PDFs land the same way)
//
// Adding a new entry:
//   1. Stage the source file at /public/tower-of-babel/<artifact_id>.<ext>
//      (or run scripts/stage-artifact.mjs to fetch + verify from a URL)
//   2. Append one object to the artifacts array below.
//   3. Verify locally:  npm run build   (artifacts[] appears in dist/assets/main-*.js)
//   4. Commit + push to origin/main (regular non-fast-forward merge).
//
// Conventions:
//   - artifact_id is a stable kebab-case slug; never reuse across renames.
//   - download_url is the Cloudflare-Pages-served path. For PUBLIC_DOMAIN/OWNED
//     files at /public/tower-of-babel/<id>.<ext>, use "/tower-of-babel/<id>.<ext>".
//   - For EXTERNAL_LINK items, set download_status:"EXTERNAL_LINK" and
//     download_url equal to the canonical external URL.
//   - For METADATA_ONLY items, set download_status:"METADATA_ONLY" and
//     omit download_url (or set it to the source_url as a fallback).
//   - For RESTRICTED items, set download_status:"RESTRICTED" and omit download_url.

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
 * Convenience helper — build an artifact entry with field-validation in dev.
 * Use this in scripts or while curating. The exported array below is the
 * runtime source of truth; this helper is provided for tooling.
 */
export function artifact(entry) {
  const required = ["artifact_id", "title", "collection"];
  for (const k of required) {
    if (!entry[k]) throw new Error(`artifact: missing required field "${k}"`);
  }
  if (!TOWER_COLLECTIONS.includes(entry.collection)) {
    throw new Error(`artifact: invalid collection "${entry.collection}"`);
  }
  if (entry.rights_status && !TOWER_RIGHTS.includes(entry.rights_status)) {
    throw new Error(`artifact: invalid rights_status "${entry.rights_status}"`);
  }
  if (entry.download_status && !TOWER_DOWNLOAD_STATUS.includes(entry.download_status)) {
    throw new Error(`artifact: invalid download_status "${entry.download_status}"`);
  }
  return entry;
}

export const artifacts = [
  artifact({
    artifact_id: "us-declaration-of-independence",
    title: "The Declaration of Independence of the United States of America",
    collection: "DOCUMENTS",
    creator: "Continental Congress",
    year: 1776,
    description: "The unanimous Declaration of the thirteen united States of America. Adopted by the Second Continental Congress on July 4, 1776.",
    source: "Project Gutenberg",
    source_url: "https://www.gutenberg.org/ebooks/1",
    rights_status: "PUBLIC_DOMAIN",
    license: "Public Domain",
    download_status: "AVAILABLE",
    download_url: "/tower-of-babel/us-declaration-of-independence.txt",
    format: "TXT",
    file_size: "30 KB",
    tags: ["founding", "united-states", "1776"],
  }),
  artifact({
    artifact_id: "gettysburg-address",
    title: "The Gettysburg Address",
    collection: "DOCUMENTS",
    creator: "Abraham Lincoln",
    year: 1863,
    description: "The speech delivered by President Abraham Lincoln at the dedication of the Soldiers' National Cemetery in Gettysburg, Pennsylvania, on November 19, 1863.",
    source: "Project Gutenberg",
    source_url: "https://www.gutenberg.org/ebooks/14006",
    rights_status: "PUBLIC_DOMAIN",
    license: "Public Domain",
    download_status: "AVAILABLE",
    download_url: "/tower-of-babel/gettysburg-address.txt",
    format: "TXT",
    file_size: "532 KB",
    tags: ["civil-war", "united-states", "speech"],
  }),
  artifact({
    artifact_id: "common-sense-thomas-paine",
    title: "Common Sense",
    collection: "PAPERS",
    creator: "Thomas Paine",
    year: 1776,
    description: "A 47-page pamphlet written by Thomas Paine, published on January 10, 1776, advocating independence from Great Britain for the American colonies.",
    source: "Project Gutenberg",
    source_url: "https://www.gutenberg.org/ebooks/147",
    rights_status: "PUBLIC_DOMAIN",
    license: "Public Domain",
    download_status: "AVAILABLE",
    download_url: "/tower-of-babel/common-sense-thomas-paine.txt",
    format: "TXT",
    file_size: "145 KB",
    tags: ["founding", "united-states", "1776", "pamphlet"],
  }),
  artifact({
    artifact_id: "bible-genesis-kjv",
    title: "The Bible, King James Version, Book of Genesis",
    collection: "REFERENCE",
    creator: "King James Bible translators",
    year: 1611,
    description: "The first book of the King James Bible (1611), a foundational text of English literature and Judeo-Christian tradition.",
    source: "Project Gutenberg",
    source_url: "https://www.gutenberg.org/ebooks/8001",
    rights_status: "PUBLIC_DOMAIN",
    license: "Public Domain",
    download_status: "AVAILABLE",
    download_url: "/tower-of-babel/bible-genesis-kjv.txt",
    format: "TXT",
    file_size: "261 KB",
    tags: ["religion", "literature", "reference"],
  }),
];
