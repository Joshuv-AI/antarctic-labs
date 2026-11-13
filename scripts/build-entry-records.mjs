#!/usr/bin/env node
// Build public/entry-records/<bucket>.json from the catalog shards.
//
// Why (2026-11-13, residual-503 fix #2 — see the round-2 diagnosis in
// ~/workspace/research_notes/error-census-20261111/census.md): an entry
// lookup that misses every cache used to download a whole ~19 MB catalog
// shard just to extract one ~1 KB record. Under crawl load those
// transfers are what the platform kills (503 / error 1102). This script
// splits the shards into small per-bucket record files so
// getRecordById (functions/_lib/tower-catalog.js) fetches ~60 KB
// instead; the shard-text path remains as the fallback, so these files
// are an accelerator, never the only copy of the truth.
//
// Bucketing: FNV-1a hash of the artifact id, mod 46656, base36 —
// 46,656 possible buckets. The diagnosis estimated last-3-chars keying
// at "~60 KB each"; measured on the real catalog that estimate fails:
// numeric-suffixed ids (arXiv/PMC/LAW) pile into digit buckets —
// last-3 gives a 4.3 MB largest bucket and a 2.35 MB record-weighted
// mean fetch, last-4 a 1.46 MB max / 230 KB weighted mean. The hash
// key is uniform by construction: measured avg 58 KB, p99 78 KB, max
// 96 KB, weighted mean fetch 59 KB (measurement script + numbers in
// the census note). The key function MUST stay byte-identical to
// entryRecordKey in functions/_lib/tower-catalog.js. Only buckets that
// occur are written (at this catalog size, all 46,656 occur). A lookup
// whose bucket file is absent (not yet generated / future publish)
// falls back to the shard path, so a missing bucket is a slowdown,
// never an error.
//
// Record shape: only the fields the getRecordById consumers actually
// read — the crawler entry render (functions/tower-of-babel/library/
// [id].js incl. its citation_* mapping), the API's publicFullRecord
// (functions/_lib/tower-api.js), OAI recordXml (functions/oai.js), and
// the search/text hydration in functions/api/v1/*. Fields are emitted
// in the fixed order below so output is byte-deterministic for a given
// catalog. A bucket record is validated at lookup time
// (record.artifact_id must equal the requested id).
//
// The directory is held out of the Pages build by
// scripts/stage-deploy.mjs (20,000-file deploy cap) and read at request
// time from raw.githubusercontent.com, like the catalog shards.
//
// FAILS LOUDLY (exit 1) when: the total record occurrences read from
// the shards differ from --expect; the unique emitted id count differs
// from the shard-manifest entry count (when --manifest is given); any
// single bucket file would exceed 5 MiB; a record lacks artifact_id.
//
// PIPELINE RULE: rerun in the same push as any catalog-shard change
// (every catalog batch), alongside scripts/build-work-locate.mjs.
// Usage (site root):
//   node scripts/build-entry-records.mjs [--src public/catalog-shards]
//     [--out public/entry-records]
//     [--manifest public/catalog-shard-manifest.json]
//     [--expect 2557923] [--source <label-for-manifest>]
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const SRC = arg("src", "public/catalog-shards");
const OUT = arg("out", "public/entry-records");
const MANIFEST_IN = arg("manifest", "public/catalog-shard-manifest.json");
const EXPECT = Number(arg("expect", "0"));
const SOURCE = arg("source", "catalog-shards");

function fail(msg) {
  console.error(`build-entry-records: FAIL: ${msg}`);
  process.exit(1);
}

// The field set, in emission order (see header). Keep in sync with the
// consumers listed there; anything else a catalog record carries
// (download_status, tags, checksum, subjects, ...) is deliberately NOT
// copied — no getRecordById consumer reads it.
const FIELDS = [
  "artifact_id",
  "title",
  "creator",
  "year",
  "date",
  "publication_date",
  "published_date",
  "collection",
  "format",
  "file_size",
  "version",
  "license",
  "rights_status",
  "source",
  "source_url",
  "language",
  "download_url",
  "description",
  "journal_title",
  "journal",
  "volume",
  "issue",
  "firstpage",
  "first_page",
  "lastpage",
  "last_page",
  "doi",
  "issn",
];

// FNV-1a 32-bit over the id exactly as stored, mod 46656, base36
// padded to 3 chars. MUST stay byte-identical to entryRecordKey in
// functions/_lib/tower-catalog.js (the sample verification compares
// the two implementations over real ids).
function entryRecordKey(artifactId) {
  const s = String(artifactId || "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 46656).toString(36).padStart(3, "0");
}

function trimRecord(rec) {
  const out = {};
  for (const f of FIELDS) {
    if (rec[f] !== undefined) out[f] = rec[f];
  }
  return out;
}

// --- shard list ------------------------------------------------------------
if (!existsSync(SRC)) fail(`src dir not found: ${SRC}`);
const shardFiles = readdirSync(SRC)
  .filter((f) => /^catalog-\d+\.json$/.test(f))
  .sort();
if (!shardFiles.length) fail(`no catalog-*.json shards in ${SRC}`);

// Manifest authority: loaded up front so pass 1 can check membership
// (shard id set == manifest id set is proven by membership + the
// unique-count equality check after pass 1) and pass 2 can resolve
// duplicate ids to the shard the manifest points at.
let manifest = null;
if (MANIFEST_IN && existsSync(MANIFEST_IN)) {
  manifest = JSON.parse(readFileSync(MANIFEST_IN, "utf8"));
  console.log(`manifest loaded: ${Object.keys(manifest).length} entries`);
} else {
  console.log("WARNING: no shard manifest found — cross-checks skipped");
}

// --- pass 1: stream records into per-bucket temp JSONL ----------------------
// Temp line: "<shardIdx>\t<trimmed record json>". Buffers flush at ~8 KB
// per bucket so memory stays bounded regardless of catalog size.
const TMP = join(OUT, ".tmp-buckets");
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

const buffers = new Map(); // key -> string[]
const bufferBytes = new Map(); // key -> number
function emit(key, line) {
  let arr = buffers.get(key);
  if (!arr) {
    arr = [];
    buffers.set(key, arr);
    bufferBytes.set(key, 0);
  }
  arr.push(line);
  const n = bufferBytes.get(key) + line.length + 1;
  if (n >= 8192) {
    appendFileSync(join(TMP, key + ".jsonl"), arr.join("\n") + "\n");
    buffers.set(key, []);
    bufferBytes.set(key, 0);
  } else {
    bufferBytes.set(key, n);
  }
}

const seen = new Set();
const dupIds = new Map(); // id -> [shardIdx,...] for ids seen >1 time
let occurrences = 0;

for (const file of shardFiles) {
  const shardIdx = Number(file.match(/catalog-(\d+)\.json/)[1]);
  const records = JSON.parse(readFileSync(join(SRC, file), "utf8"));
  if (!Array.isArray(records)) fail(`${file} is not a JSON array`);
  for (const rec of records) {
    if (!rec || typeof rec.artifact_id !== "string" || !rec.artifact_id) {
      fail(`${file}: record without artifact_id`);
    }
    occurrences++;
    const id = rec.artifact_id;
    if (manifest && !(id in manifest)) {
      fail(`${file}: id ${id} not present in shard manifest`);
    }
    if (seen.has(id)) {
      if (!dupIds.has(id)) dupIds.set(id, [null]);
      dupIds.get(id).push(shardIdx);
    } else {
      seen.add(id);
    }
    emit(entryRecordKey(id), `${shardIdx}\t${JSON.stringify(trimRecord(rec))}`);
  }
  console.log(`shard ${file}: cumulative occurrences ${occurrences}`);
}
for (const [key, arr] of buffers) {
  if (arr.length) appendFileSync(join(TMP, key + ".jsonl"), arr.join("\n") + "\n");
}
buffers.clear();

if (EXPECT && occurrences !== EXPECT) {
  fail(`record occurrences ${occurrences} != expected ${EXPECT}`);
}

// Unique-count cross-check (membership was verified per record above,
// so equal counts prove the emitted id set equals the manifest id set).
if (manifest) {
  const mCount = Object.keys(manifest).length;
  if (mCount !== seen.size) {
    fail(`unique ids emitted ${seen.size} != manifest entries ${mCount}`);
  }
  console.log(`manifest cross-check ok: ${mCount} unique ids`);
}

// --- pass 2: finalize each bucket -------------------------------------------
const bucketInfo = {};
let totalBytes = 0;
let largest = { key: null, bytes: 0, records: 0 };
const hashLines = [];

for (const tmpFile of readdirSync(TMP).sort()) {
  const key = tmpFile.replace(/\.jsonl$/, "");
  const lines = readFileSync(join(TMP, tmpFile), "utf8").split("\n").filter(Boolean);
  const byId = new Map();
  for (const line of lines) {
    const tab = line.indexOf("\t");
    const shardIdx = Number(line.slice(0, tab));
    const rec = JSON.parse(line.slice(tab + 1));
    const id = rec.artifact_id;
    if (!byId.has(id)) {
      byId.set(id, { shardIdx, rec });
    } else if (manifest && manifest[id] === shardIdx) {
      // Duplicate id: the shard the manifest points at is authoritative
      // (it is the shard the production lookup would have used).
      byId.set(id, { shardIdx, rec });
    }
  }
  const obj = {};
  for (const id of [...byId.keys()].sort()) obj[id] = byId.get(id).rec;
  const body = JSON.stringify(obj);
  const bytes = Buffer.byteLength(body);
  if (bytes > 5 * 1024 * 1024) {
    fail(`bucket ${key} is ${bytes} bytes — over the 5 MiB generator cap`);
  }
  writeFileSync(join(OUT, key + ".json"), body);
  const sha256 = createHash("sha256").update(body).digest("hex");
  bucketInfo[key] = { records: byId.size, bytes, sha256 };
  hashLines.push(`${key}:${sha256}`);
  totalBytes += bytes;
  if (bytes > largest.bytes) largest = { key, bytes, records: byId.size };
}
rmSync(TMP, { recursive: true, force: true });

const contentHash = createHash("sha256").update(hashLines.sort().join("\n")).digest("hex");
const manifestOut = {
  version: 1,
  source: SOURCE,
  shard_count: shardFiles.length,
  record_occurrences: occurrences,
  unique_records: seen.size,
  duplicate_ids: [...dupIds.keys()].sort(),
  bucket_count: Object.keys(bucketInfo).length,
  total_bytes: totalBytes,
  largest_bucket: largest,
  content_hash: contentHash,
  buckets: bucketInfo,
};
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifestOut, null, 1) + "\n");

console.log(
  `entry-records: ${occurrences} occurrences, ${seen.size} unique ids -> ` +
    `${manifestOut.bucket_count} bucket files, ${totalBytes} bytes total, ` +
    `largest ${largest.key}.json ${largest.bytes} bytes (${largest.records} records), ` +
    `duplicates: ${dupIds.size}`
);
