// Tower of Babel — personal artifact/catalog library. Tower of Babel is
// a major independent destination, NOT another Expedition. The data
// model distinguishes downloadable, metadata-only, externally sourced,
// and restricted material. Catalog entries will be provided by the
// lead engineer; this file ships with an empty architecture.

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
export const artifacts = [
  {
    artifact_id: "placeholder-artifact-01",
    title: "Placeholder Artifact",
    creator: "",
    year: "",
    description: "",
    category: "",
    subcategory: "",
    format: "",
    file_size: "",
    source: "",
    source_url: "",
    rights_status: "OWNED",
    license: "",
    download_status: "METADATA_ONLY",
    download_url: "",
    checksum: "",
    version: "",
    collection: "REFERENCE",
    tags: [],
  },
];
