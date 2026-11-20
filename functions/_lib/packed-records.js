// Packed record pages (2026-11-20 counts-speed fix, data-packaging
// pass): an opt-in response shape for /api/catalog-search and
// /api/catalog-hydrate that strips the two structural taxes of the
// classic per-record-object shape, measured on a live 2,000-record
// Reference page (549,590 bytes = 274.8 bytes/record):
//   1. Field names repeat on every record — the nine keys cost
//      ~102 bytes/record, ~37% of the page, before any data.
//   2. Low-cardinality string fields repeat their values on every
//      record: on a collection-scoped page, collection /
//      rights_status / download_status / format are each constant
//      across all 2,000 records yet spelled out 2,000 times.
// The packed shape hoists the field names into one `fields` array,
// dictionary-encodes those four fields into a page-level `dict`,
// and ships records as positional `rows`. Everything else about
// the response (total, next_cursor, fingerprint) is untouched, and
// callers that do not ask for the packed shape get the classic
// shape byte-for-byte — the packed shape exists only where the
// scope loader asks for it and decodes it (src/lib/catalog.js
// scopeFetchJson). The decompressed size is what a phone pays:
// the edge already gzips the wire bytes (23.6 B/record), but
// JSON.parse cost, string interning, and record-object memory all
// scale with the raw text, which the packed shape roughly halves.

export const PACK_DICT_FIELDS = [
  "collection",
  "rights_status",
  "download_status",
  "format",
];

// results: array of flat record objects (string/number/null
// values). Returns { pack, fields, dict, rows } to merge into the
// response body in place of `results`.
export function packResults(results) {
  const fields = [];
  const seen = new Set();
  for (const r of results) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        fields.push(k);
      }
    }
  }
  const dict = {};
  const dictIndex = {};
  for (const f of PACK_DICT_FIELDS) {
    if (!seen.has(f)) continue;
    dict[f] = [];
    dictIndex[f] = new Map();
  }
  const rows = new Array(results.length);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const row = new Array(fields.length);
    for (let j = 0; j < fields.length; j++) {
      const f = fields[j];
      let v = r[f];
      if (v === undefined) v = null;
      const dm = dictIndex[f];
      if (dm && typeof v === "string") {
        let idx = dm.get(v);
        if (idx === undefined) {
          idx = dict[f].length;
          dict[f].push(v);
          dm.set(v, idx);
        }
        row[j] = idx;
      } else {
        row[j] = v;
      }
    }
    rows[i] = row;
  }
  return { pack: 1, fields, dict, rows };
}
