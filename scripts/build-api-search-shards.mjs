#!/usr/bin/env node
// Build public/api-search-shards/search-NN.json from
// public/catalog-index-shards/catalog-index-NN.json.
//
// The API search handler (functions/_lib/tower-api.js) scans these shards.
// Each record is an array:
//   [artifact_id, title, creator, year, collection, title_folded, creator_folded]
// where title_folded / creator_folded are normText() of the raw values —
// the exact normText the handler applies to the query — computed ONCE here
// so a search request never re-normalizes the catalog per record. (That
// per-record normalize, on top of parsing a ~17-20 MB object shard per cold
// isolate, is what pushed /api/v1/search over the Worker resource limit:
// 2026-10-24 hub 1102s, 2026-10-27 search 1102s.)
//
// PIPELINE RULE: run this in the SAME push as any change to
// public/catalog-index-shards (catalog add/remove/edit). The handler reads
// these files from the main branch at request time, so a catalog push
// without regenerated search shards leaves the API searching stale data.
//
// Usage (from the site root): node scripts/build-api-search-shards.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

function normText(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const SRC = "public/catalog-index-shards";
const DST = "public/api-search-shards";
const COUNT = 10;

mkdirSync(DST, { recursive: true });
let total = 0;
for (let i = 0; i < COUNT; i++) {
  const nn = String(i).padStart(2, "0");
  const records = JSON.parse(
    readFileSync(`${SRC}/catalog-index-${nn}.json`, "utf8"),
  );
  const out = records.map((r) => [
    r.artifact_id ?? null,
    r.title ?? null,
    r.creator ?? null,
    r.year ?? null,
    r.collection ?? null,
    normText(r.title),
    normText(r.creator),
  ]);
  const body = JSON.stringify(out);
  writeFileSync(`${DST}/search-${nn}.json`, body);
  total += records.length;
  console.log(`search-${nn}.json: ${records.length} records, ${body.length} bytes`);
}
console.log(`total: ${total} records`);
