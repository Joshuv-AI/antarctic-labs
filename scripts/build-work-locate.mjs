#!/usr/bin/env node
// Build public/work-locate/<bucket>.json from
// public/catalog-shard-manifest.json.
//
// The manifest is one flat { artifact_id: shardIndex } object — ~16 MB /
// 556k entries at the current catalog size. tower-catalog.js's
// getRecordById used to fetch and parse the WHOLE manifest (and hold the
// parsed map in the isolate) to answer a single lookup; that parse is one
// of the multi-MB request-path costs behind the 2026-10-27 /api/v1 1102s.
// This script splits the manifest into per-bucket files keyed by the
// same descShardKey() the description sidecar uses (last 2 chars of the
// id, sanitized), so a lookup fetches ~tens of KB. EVERY possible bucket
// file is written (empty object when unused) so a lookup for an unknown
// id reads an empty bucket and reports "missing" instead of a 404-driven
// "error".
//
// PIPELINE RULE: rerun in the same push as any catalog-shard-manifest
// change (i.e. every catalog batch). Usage (site root):
//   node scripts/build-work-locate.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// Identical to descShardKey in functions/_lib/tower-catalog.js.
function bucketKey(artifactId) {
  const s = String(artifactId || "")
    .toLowerCase()
    .slice(-2)
    .replace(/[^a-z0-9]/g, "_");
  return (s + "__").slice(0, 2);
}

const manifest = JSON.parse(
  readFileSync("public/catalog-shard-manifest.json", "utf8"),
);

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789_";
const buckets = new Map();
for (const a of ALPHABET) {
  for (const b of ALPHABET) buckets.set(a + b, {});
}
let n = 0;
for (const [id, shard] of Object.entries(manifest)) {
  buckets.get(bucketKey(id))[id] = shard;
  n++;
}

mkdirSync("public/work-locate", { recursive: true });
let files = 0;
let bytes = 0;
for (const [key, obj] of buckets) {
  const body = JSON.stringify(obj);
  writeFileSync(`public/work-locate/${key}.json`, body);
  files++;
  bytes += body.length;
}
console.log(`work-locate: ${n} ids -> ${files} bucket files, ${bytes} bytes total`);
