#!/usr/bin/env node
// build-member-cubes.mjs — regenerate the member-axis facet cubes in
// public/tower-tallies.json:
//
//   cubeMemberEra:    { "<member key>": { "<era id>": n, ... }, ... }
//   cubeMemberBucket: { "<member key>": { "<bucket key>": n, ... }, ... }
//
// for every member-axis selection the filter panel offers — the 325
// TCU1 entries (curated collections, Books shelves, Papers fields /
// subfields / types). These are the published distributions the panel
// resolvers read when a member selection is active (board line 137,
// 2026-11-21): counts are navigation data — exact published numbers,
// present from the first second, never derived from loaded records.
//
// Method — the same inputs and derivations the client itself uses, so
// the cubes cannot drift from the panel's own math:
//   - membership: tcb1-data/curated.bin.br (the TCU1 bitsets the page
//     loads; catalog order, LSB-first per byte — see src/lib/tcb1.js)
//   - era + bucket per catalog position: towerEraCode / towerBucketKey
//     from src/lib/tower-taxonomy.js over public/catalog-index-shards
//     (the TCB1 source shards)
//
// Assertions (any failure aborts before anything is written):
//   - shard sha256-concat fingerprint == tcb1-data/manifest.json's
//   - record total == manifest total_records
//   - every entry's popcount == its TCU1 header count == manifest count
//   - the shards' global era totals == the tallies file's existing
//     eras + era_unknown (the cubes must describe the same catalog
//     the file already describes)
//   - per entry: era cells + era-unknown == count; bucket cells sum
//     == count
//
// Cubes enumerate nonzero cells only, like cubeCollectionEra and
// cubeBucketEra: a missing cell is a true zero.
//
// Usage: node scripts/build-member-cubes.mjs
//   [--shards <dir>] [--curated <file.br>] [--manifest <file>]
//   [--tallies <file>]   (defaults are repo-relative)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TOWER_ERAS, towerEraCode, towerBucketKey } from "../src/lib/tower-taxonomy.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const shardsDir = opt("--shards", join(root, "public/catalog-index-shards"));
const curatedFile = opt("--curated", join(root, "tcb1-data/curated.bin.br"));
const manifestFile = opt("--manifest", join(root, "tcb1-data/manifest.json"));
const talliesFile = opt("--tallies", join(root, "public/tower-tallies.json"));

const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
const tallies = JSON.parse(readFileSync(talliesFile, "utf8"));

// ---- pass 1: per-position era + bucket codes from the shards -------
const shardNames = readdirSync(shardsDir)
  .filter((n) => /^catalog-index-\d+\.json$/.test(n))
  .sort();
if (!shardNames.length) throw new Error(`no catalog-index shards in ${shardsDir}`);
const hash = createHash("sha256");
const eraCodes = [];
const bucketDict = new Map();
const bucketCodes = [];
let total = 0;
for (const name of shardNames) {
  const raw = readFileSync(join(shardsDir, name));
  hash.update(raw);
  const records = JSON.parse(raw.toString("utf8"));
  for (const r of records) {
    eraCodes.push(towerEraCode(r.year));
    const bk = towerBucketKey(r) || "";
    let code = bucketDict.get(bk);
    if (code === undefined) {
      code = bucketDict.size;
      bucketDict.set(bk, code);
    }
    bucketCodes.push(code);
  }
  total += records.length;
  console.log(`${name}: cumulative ${total}`);
}
const fingerprint = hash.digest("hex");
if (fingerprint !== manifest.source.fingerprint_sha256_concat)
  throw new Error(
    `shard fingerprint ${fingerprint} != manifest ${manifest.source.fingerprint_sha256_concat}`
  );
if (total !== manifest.total_records)
  throw new Error(`total ${total} != manifest ${manifest.total_records}`);
const eraU8 = Uint8Array.from(eraCodes);
const bucketU16 = Uint16Array.from(bucketCodes);
const bucketKeysArr = [...bucketDict.keys()];

// The cubes must describe the same catalog the tallies file already
// describes: reconcile the shards' global era totals against it.
{
  const globalEras = {};
  let unknown = 0;
  for (let i = 0; i < total; i++) {
    const c = eraU8[i];
    if (c === 0) unknown++;
    else globalEras[TOWER_ERAS[c - 1].id] = (globalEras[TOWER_ERAS[c - 1].id] || 0) + 1;
  }
  if (
    JSON.stringify(globalEras) !== JSON.stringify(tallies.eras) ||
    unknown !== tallies.era_unknown ||
    total !== tallies.total
  )
    throw new Error("shard era totals do not reconcile with tower-tallies.json");
  console.log("global era totals reconcile with tower-tallies.json");
}

// ---- pass 2: TCU1 bitsets -> cubes ----------------------------------
const buf = brotliDecompressSync(readFileSync(curatedFile));
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
if (!(buf[0] === 0x54 && buf[1] === 0x43 && buf[2] === 0x55 && buf[3] === 0x31))
  throw new Error("tcu1: bad magic");
if (dv.getUint16(4, true) !== 1) throw new Error("tcu1: unsupported version");
const entryCount = dv.getUint32(8, true);
if (dv.getUint32(12, true) !== total) throw new Error("tcu1: total mismatch");
const bitsetBytes = Math.ceil(total / 8);
const td = new TextDecoder();
const manifestCounts = new Map(manifest.curated.collections.map((c) => [c.key, c.count]));
const cubeMemberEra = {};
const cubeMemberBucket = {};
let p = 16;
for (let e = 0; e < entryCount; e++) {
  const keyLen = dv.getUint8(p); p += 1;
  const key = td.decode(buf.subarray(p, p + keyLen)); p += keyLen;
  const labelLen = dv.getUint8(p); p += 1;
  p += labelLen; // label not needed for the cubes
  const n = dv.getUint32(p, true); p += 4;
  const raw = buf.subarray(p, p + bitsetBytes); p += bitsetBytes;
  const eras = {};
  const buckets = {};
  let pop = 0;
  let unk = 0;
  for (let byte = 0; byte < bitsetBytes; byte++) {
    let b = raw[byte];
    while (b) {
      const bit = b & -b;
      const i = (byte << 3) + (31 - Math.clz32(bit));
      b ^= bit;
      pop++;
      const ec = eraU8[i];
      if (ec === 0) unk++;
      else {
        const id = TOWER_ERAS[ec - 1].id;
        eras[id] = (eras[id] || 0) + 1;
      }
      const bk = bucketKeysArr[bucketU16[i]];
      if (bk) buckets[bk] = (buckets[bk] || 0) + 1;
    }
  }
  if (pop !== n) throw new Error(`${key}: popcount ${pop} != TCU1 header ${n}`);
  if (manifestCounts.get(key) !== n)
    throw new Error(`${key}: TCU1 header ${n} != manifest ${manifestCounts.get(key)}`);
  const eraSum = Object.values(eras).reduce((a, x) => a + x, 0);
  const bucketSum = Object.values(buckets).reduce((a, x) => a + x, 0);
  if (eraSum + unk !== n) throw new Error(`${key}: era cells + unknown != count`);
  if (bucketSum !== n) throw new Error(`${key}: bucket cells != count`);
  cubeMemberEra[key] = eras;
  cubeMemberBucket[key] = buckets;
}
console.log(`cubes built for ${entryCount} member keys`);

tallies.cubeMemberEra = cubeMemberEra;
tallies.cubeMemberBucket = cubeMemberBucket;
tallies.memberCubes = {
  generated_at: new Date().toISOString(),
  source:
    "tcb1-data/curated.bin.br bitsets x public/catalog-index-shards years/buckets (scripts/build-member-cubes.mjs)",
  keys: entryCount,
};
writeFileSync(talliesFile, JSON.stringify(tallies));
console.log(`wrote ${talliesFile}`);
