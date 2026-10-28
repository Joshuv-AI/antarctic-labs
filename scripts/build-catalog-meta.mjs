#!/usr/bin/env node
// Phase B generator (v0 scaffold) — builds the server-side catalog data
// products from compact catalog-index shards:
//   1. metadata postings: title/creator, dual exact + folded-stemmed,
//      bucketed by the shared djb2 shardFor() into 256 term buckets
//   2. facet postings + counts: collection, bucket (COLLECTION:sub),
//      format, rights, era band
//   3. record blocks: compact records re-blocked 1,000 per file, in id order
// Manifest is written LAST — it is the commit point (design: phaseB-design.md).
//
// Token pipeline is the site's own: foldText() + tokenizeWithOffsets() +
// stem() from src/lib/search-text.js, imported from the git-cache clone so
// index side and query side can never drift.
//
// Usage: node build-catalog-meta.mjs <srcShardDir> <outDir> [shardCount]
// Smoke runs may use a stale local snapshot; production runs in GitHub
// Actions against the publish-time catalog and uploads to R2 under
// meta/<fingerprint>/.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const { foldText, tokenizeWithOffsets, stem, shardFor } = await import(
  new URL("../src/lib/search-text.js", import.meta.url).href
);
const { towerBucketKey } = await import(
  new URL("../src/lib/tower-taxonomy.js", import.meta.url).href
);

const [srcDir, outDir, shardCountArg] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error("usage: build-catalog-meta.mjs <srcShardDir> <outDir> [shardCount]");
  process.exit(2);
}

const BLOCK = 1000;
const delta = (ids) => {
  const out = [];
  let prev = 0;
  for (const id of ids) { out.push(id - prev); prev = id; }
  return out;
};
const eraBand = (y) => {
  if (typeof y !== "number" || !Number.isFinite(y)) return "unknown";
  if (y < 1800) return "pre-1800";
  if (y < 1900) return "1800s";
  if (y < 1950) return "1900-1949";
  if (y < 2000) return "1950-1999";
  return "2000+";
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// discover shards
const shardFiles = [];
for (let i = 0; ; i++) {
  const name = `catalog-index-${String(i).padStart(2, "0")}.json`;
  try { readFileSync(`${srcDir}/${name}`, "utf8"); shardFiles.push(name); } catch { break; }
  if (shardCountArg && shardFiles.length >= Number(shardCountArg)) break;
}
if (!shardFiles.length) { console.error("no catalog-index shards found in", srcDir); process.exit(1); }

const hash = createHash("sha256");
const facets = { collection: new Map(), bucket: new Map(), format: new Map(), rights: new Map(), era: new Map() };
const facetAdd = (kind, key, id) => {
  if (!key) return;
  const m = facets[kind];
  if (!m.has(key)) m.set(key, []);
  m.get(key).push(id);
};
// postings: field -> mode -> bucket -> Map(term -> ids)
const postings = {};
for (const field of ["title", "creator"]) {
  postings[field] = { exact: new Map(), stem: new Map() };
}
const postAdd = (field, mode, term, id) => {
  const b = shardFor(term);
  const buckets = postings[field][mode];
  if (!buckets.has(b)) buckets.set(b, new Map());
  const m = buckets.get(b);
  if (!m.has(term)) m.set(term, []);
  const arr = m.get(term);
  if (arr[arr.length - 1] !== id) arr.push(id);
};

let total = 0;
let block = [];
let blockIdx = 0;
const flushBlock = () => {
  if (!block.length) return;
  writeFileSync(`${outDir}/records-${String(blockIdx).padStart(5, "0")}.json`, JSON.stringify(block));
  block = []; blockIdx++;
};
mkdirSync(`${outDir}/records`, { recursive: true });

for (const name of shardFiles) {
  const raw = readFileSync(`${srcDir}/${name}`, "utf8");
  hash.update(raw);
  const records = JSON.parse(raw);
  for (const r of records) {
    const id = total++;
    facetAdd("collection", r.collection, id);
    facetAdd("bucket", towerBucketKey(r), id);
    facetAdd("format", r.format, id);
    facetAdd("rights", r.rights_status, id);
    facetAdd("era", eraBand(r.year), id);
    for (const [field, text] of [["title", r.title], ["creator", r.creator]]) {
      if (!text) continue;
      for (const { t } of tokenizeWithOffsets(foldText(text))) {
        postAdd(field, "exact", t, id);
        postAdd(field, "stem", stem(t), id);
      }
    }
    block.push(r);
    if (block.length >= BLOCK) { writeFileSync(`${outDir}/records/records-${String(blockIdx).padStart(5, "0")}.json`, JSON.stringify(block)); block = []; blockIdx++; }
  }
  console.log(`${name}: cumulative ${total}`);
}
if (block.length) { writeFileSync(`${outDir}/records/records-${String(blockIdx).padStart(5, "0")}.json`, JSON.stringify(block)); blockIdx++; }

// facets (split per kind, so a cold isolate fetches only the kinds a
// request actually filters by) + counts
const counts = { total, collection: {}, bucket: {}, format: {}, rights: {}, era: {} };
mkdirSync(`${outDir}/facets`, { recursive: true });
for (const [kind, m] of Object.entries(facets)) {
  const facetOut = {};
  for (const [key, ids] of [...m.entries()].sort((a, b) => b[1].length - a[1].length)) {
    counts[kind][key] = ids.length;
    facetOut[key] = delta(ids);
  }
  writeFileSync(`${outDir}/facets/${kind}.json`, JSON.stringify(facetOut));
}
writeFileSync(`${outDir}/counts.json`, JSON.stringify(counts, null, 1));

// postings buckets
let termTotal = 0;
for (const [field, modes] of Object.entries(postings)) {
  for (const [mode, buckets] of Object.entries(modes)) {
    const dir = `${outDir}/postings/${field}-${mode}`;
    mkdirSync(dir, { recursive: true });
    for (const [b, m] of buckets) {
      const obj = {};
      for (const [term, ids] of m) { obj[term] = delta(ids); termTotal++; }
      writeFileSync(`${dir}/bkt-${String(b).padStart(3, "0")}.json`, JSON.stringify(obj));
    }
  }
}

// manifest LAST (commit point)
const fingerprint = hash.digest("hex");
const manifest = {
  version: 0,
  fingerprint,
  source_shards: shardFiles,
  total,
  record_blocks: blockIdx,
  block_size: BLOCK,
  distinct_terms: termTotal,
  files: { counts: "counts.json", facets: "facets/<kind>.json", records: "records/records-NNNNN.json", postings: "postings/<field>-<exact|stem>/bkt-NNN.json" },
  generated_at: new Date().toISOString(),
};
writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log(`DONE total=${total} blocks=${blockIdx} distinct_terms=${termTotal} fingerprint=${fingerprint.slice(0, 12)}`);
