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
// SHARD LAYOUT (changed 2026-11-16): the output is split by BYTE BUDGET,
// not mirrored 1:1 from the source shards. The shards are read at request
// time from the git repo (raw.githubusercontent.com), never shipped in
// the Pages dist (held out by scripts/stage-deploy.mjs), so the binding
// per-file limit is GitHub's 100 MB push limit. The old 1:1 layout crossed
// it as the catalog grew (search-05.json = 110.46 MB at 2,557,923 entries)
// and the regen workflow's push was rejected (GH001), leaving API search
// on a stale 556,707-entry snapshot. With a byte budget, per-file size is
// capped no matter how large the catalog grows — growth only adds shards.
// The shard count is written to public/api-search-shards/manifest.json;
// the handler resolves the count from that manifest at request time, so
// future regenerations need no code change.
//
// PIPELINE RULE: run this in the SAME push as any change to
// public/catalog-index-shards (catalog add/remove/edit). The handler reads
// these files from the main branch at request time, so a catalog push
// without regenerated search shards leaves the API searching stale data.
//
// Usage (from the site root): node scripts/build-api-search-shards.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";

function normText(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const SRC = "public/catalog-index-shards";
const DST = "public/api-search-shards";
// SHARD BUDGET — the binding limit is NOT GitHub's 100 MB push cap.
// The handler JSON-parses a whole shard per cold isolate, and the
// Workers isolate memory limit makes that parse the real constraint:
// the ~17-20 MB shards of the original layout were already the cost
// driver behind the 2026-10-24/27 search 1102s, the 27.8 MB shard of
// the 556k snapshot produced intermittent 1102s under no particular
// load (2026-11-11), and the first byte-budget regeneration at 40 MiB
// (2026-11-16) platform-killed /api/v1/search outright (plain-text
// 502s) while the serving handler parsed the new 42 MB shards. 16 MiB
// keeps the parse at the original design norm; per-file size is then
// capped at ~16% of the GitHub limit no matter how the catalog grows —
// growth only adds shards, and the count travels in manifest.json.
const SHARD_BUDGET_BYTES = 16 * 1024 * 1024;

const srcFiles = readdirSync(SRC)
  .filter((f) => /^catalog-index-\d+\.json$/.test(f))
  .sort();
if (srcFiles.length === 0) {
  console.error(`no catalog-index shards found in ${SRC}`);
  process.exit(1);
}

mkdirSync(DST, { recursive: true });
// Drop outputs from any previous layout so a shrinking shard count can
// never leave stale shards behind for the handler to walk into.
for (const f of readdirSync(DST)) {
  if (/^search-\d+\.json$/.test(f) || f === "manifest.json") {
    rmSync(`${DST}/${f}`);
  }
}

let total = 0;
let shardIdx = 0;
let buf = [];
// Running byte estimate of "[" + buf.join(",") + "]": starts at 2 for
// the brackets and adds one comma byte per record — an overestimate by
// at most one byte per shard, i.e. the budget check is conservative.
let bufBytes = 2;
function flush() {
  if (buf.length === 0) return;
  const body = "[" + buf.join(",") + "]";
  const nn = String(shardIdx).padStart(2, "0");
  writeFileSync(`${DST}/search-${nn}.json`, body);
  console.log(`search-${nn}.json: ${buf.length} records, ${Buffer.byteLength(body)} bytes`);
  shardIdx += 1;
  buf = [];
  bufBytes = 2;
}

for (const f of srcFiles) {
  const records = JSON.parse(readFileSync(`${SRC}/${f}`, "utf8"));
  for (const r of records) {
    const enc = JSON.stringify([
      r.artifact_id ?? null,
      r.title ?? null,
      r.creator ?? null,
      r.year ?? null,
      r.collection ?? null,
      normText(r.title),
      normText(r.creator),
    ]);
    const b = Buffer.byteLength(enc) + 1;
    if (buf.length > 0 && bufBytes + b > SHARD_BUDGET_BYTES) flush();
    buf.push(enc);
    bufBytes += b;
    total += 1;
  }
}
flush();

writeFileSync(
  `${DST}/manifest.json`,
  JSON.stringify(
    {
      shards: shardIdx,
      total,
      budget_bytes: SHARD_BUDGET_BYTES,
      source: "catalog-index-shards",
    },
    null,
    2,
  ) + "\n",
);
console.log(`total: ${total} records in ${shardIdx} shards`);
