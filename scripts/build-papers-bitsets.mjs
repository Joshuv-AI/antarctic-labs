#!/usr/bin/env node
// build-papers-bitsets.mjs — add the Papers subject-map entries to
// the TCU1 curated bitsets (tcb1-data/curated.bin.br + the manifest's
// curated section) for the 2026-11-16 Papers subcategory ship,
// without touching the TCB1 shards or dictionary (the catalog did
// not change; the Papers taxonomy arrived).
//
// This is the ship step for the 2026-11-14 papers-subcategories
// design, un-held by Joshua 2026-11-15 once the subject-enrichment
// pipeline (work-papers-enrich-run) produced verified membership.
// It mirrors scripts/build-curated-bitsets.mjs's discipline:
//   * every pre-existing entry is carried over VERBATIM (bits and
//     popcount), and its count is asserted against the current
//     manifest — the production dataset — before anything is
//     written. A drop anywhere aborts the build. (The 2026-11-16
//     catalog batch's silent curated gutting, 233 -> 20 collections,
//     is the failure this gate exists to make impossible here.)
//   * every new entry's popcount is asserted against the
//     enrichment's counts-final.json before anything is written.
//
// New entries (92): paperfield:<field> x12, papersub:<field>:<sub>
// x70, papertype:<type> x10. Membership is the enrichment's MEMBER
// bitsets (primary + cross-lists): counts overlap by design
// (Joshua's crossover waiver) and do not sum to the Papers total.
// The unclassified residue (28,372) is never a shelf — no "Other"
// entry exists. classics-of-science is an honest empty marker: the
// enrichment measured it at zero, so it ships with an all-zero
// bitset and count 0, per Joshua's empty-shelves-stay rule.
//
// Translation: the enrichment bitsets index the Papers population
// (artifacts/papers-index.jsonl: idx <-> artifact_id). Bits are
// re-based onto TCB1 catalog positions through the id sequence
// decoded from the dataset's OWN shards in this repo (each shard's
// raw sha256 asserted against the manifest before its ids are
// trusted — the sequence is production's by construction, not a
// staging dir's). This matters: the pushstate catalog-index shards
// build-curated-bitsets.mjs reads are stale at exactly the five
// 2026-11-16 duplicate-id renames (verified element-by-element
// during this ship; all five are BOOKS, but positions are positions)
// — decoding the shipped shards removes that class of error.
// Type membership has no enrichment bitset files; it is taken
// from staged/assignments.jsonl (per-paper types), with popcounts
// asserted against counts-final.json the same way.
//
// Usage: node scripts/build-papers-bitsets.mjs [enrichDir] [repoRoot]
//   enrichDir default: ~/workspace/antarctic-labs-work/work-papers-enrich-run
//   repoRoot  default: the repo containing this script
//   (repoRoot must have the full tcb1-data/ directory checked out —
//   the position source is the dataset's own shards.)
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { brotliCompressSync, brotliDecompressSync, constants as ZC } from "node:zlib";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

import { PAPER_FIELDS, PAPER_TYPES } from "../src/lib/tower-collections-data.js";

const enrichDir =
  process.argv[2] ||
  join(homedir(), "workspace/antarctic-labs-work/work-papers-enrich-run");
const repoRoot = process.argv[3] || join(dirname(fileURLToPath(import.meta.url)), "..");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const sha256hex = (buf) => createHash("sha256").update(buf).digest("hex");

// ---------- enrichment inputs -----------------------------------------
const counts = readJson(join(enrichDir, "artifacts/counts-final.json"));
const enrichManifest = readJson(join(enrichDir, "artifacts/manifest.json"));
{
  // The design identity: field primaries + residue == Papers total.
  let primaries = 0;
  for (const f of PAPER_FIELDS) primaries += counts[f.id].count;
  if (primaries !== enrichManifest.classified_primary)
    throw new Error(`primary sum ${primaries} != manifest classified ${enrichManifest.classified_primary}`);
  if (primaries + enrichManifest.residue !== enrichManifest.total_papers)
    throw new Error("primaries + residue != total papers");
  console.log(
    `enrichment identity ok: ${primaries} primary-classified + ${enrichManifest.residue} residue = ${enrichManifest.total_papers}`
  );
}

// ---------- TCB1 catalog id sequence (from the shipped shards) ---------
const manifestPath = join(repoRoot, "tcb1-data/manifest.json");
const manifest = readJson(manifestPath);
const TOTAL = manifest.total_records;
console.log("decoding TCB1 shard id sequence…");
const idToPositions = new Map();
{
  const td = new TextDecoder("utf-8", { ignoreBOM: true });
  let pos = 0;
  for (const sm of manifest.shards) {
    const buf = brotliDecompressSync(readFileSync(join(repoRoot, "tcb1-data", `${sm.file}.br`)));
    if (sha256hex(buf) !== sm.sha256)
      throw new Error(`shard ${sm.file}: sha256 mismatch vs manifest — refusing to trust its ids`);
    if (buf.toString("latin1", 0, 4) !== "TCB1") throw new Error(`shard ${sm.file}: bad magic`);
    const n = buf.readUInt32LE(8);
    if (n !== sm.records) throw new Error(`shard ${sm.file}: records ${n} != manifest ${sm.records}`);
    const secOff = (i) => buf.readUInt32LE(16 + i * 8);
    const idOff = new Uint32Array(buf.buffer, buf.byteOffset + secOff(0), n + 1);
    const blobOff = secOff(1);
    for (let i = 0; i < n; i++) {
      const id = td.decode(buf.subarray(blobOff + idOff[i], blobOff + idOff[i + 1]));
      if (!idToPositions.has(id)) idToPositions.set(id, []);
      idToPositions.get(id).push(pos);
      pos++;
    }
  }
  if (pos !== TOTAL) throw new Error(`decoded total ${pos} != manifest total ${TOTAL}`);
  console.log(`tcb1 records: ${pos} (every shard sha256 verified against the manifest)`);
}

// ---------- papers population index ------------------------------------
const papersIds = []; // papers idx -> artifact_id
{
  const text = readFileSync(join(enrichDir, "artifacts/papers-index.jsonl"), "utf8");
  for (const line of text.split("\n")) {
    if (!line) continue;
    const r = JSON.parse(line);
    papersIds[r.idx] = r.artifact_id;
  }
  if (papersIds.length !== enrichManifest.total_papers)
    throw new Error(`papers index ${papersIds.length} != ${enrichManifest.total_papers}`);
  console.log(`papers population: ${papersIds.length}`);
}
// papers idx -> TCB1 positions (every paper must exist in the catalog)
const papersPositions = new Array(papersIds.length);
for (let i = 0; i < papersIds.length; i++) {
  const hits = idToPositions.get(papersIds[i]);
  if (!hits) throw new Error(`paper ${papersIds[i]} (idx ${i}) not in TCB1 catalog`);
  papersPositions[i] = hits;
}

// ---------- current curated.bin (verbatim carry-over) ------------------
function parseTcu1(buf) {
  if (buf.toString("latin1", 0, 4) !== "TCU1") throw new Error("bad TCU1 magic");
  const count = buf.readUInt32LE(8);
  const total = buf.readUInt32LE(12);
  const bitsetBytes = Math.ceil(total / 8);
  let p = 16;
  const out = [];
  for (let e = 0; e < count; e++) {
    const kl = buf.readUInt8(p); p += 1;
    const key = buf.toString("utf8", p, p + kl); p += kl;
    const ll = buf.readUInt8(p); p += 1;
    const label = buf.toString("utf8", p, p + ll); p += ll;
    const n = buf.readUInt32LE(p); p += 4;
    const bits = new Uint8Array(buf.subarray(p, p + bitsetBytes)); p += bitsetBytes;
    out.push({ key, label, count: n, bits });
  }
  return { total, entries: out };
}
const curRaw = brotliDecompressSync(readFileSync(join(repoRoot, "tcb1-data/curated.bin.br")));
const current = parseTcu1(curRaw);
if (current.total !== TOTAL) throw new Error("current curated total mismatch");
const manifestCounts = new Map(manifest.curated.collections.map((c) => [c.key, c.count]));
const kept = [];
for (const e of current.entries) {
  if (/^(paperfield|papersub|papertype):/.test(e.key)) continue; // rebuilt below
  const exp = manifestCounts.get(e.key);
  if (exp === undefined) throw new Error(`current entry ${e.key} absent from manifest — aborting`);
  if (exp !== e.count) throw new Error(`current entry ${e.key}: bin count ${e.count} != manifest ${exp} — aborting`);
  kept.push(e);
}
console.log(`carrying over ${kept.length} existing entries verbatim (all counts match the production manifest)`);

// ---------- build the papers entries ------------------------------------
const bitsetBytes = Math.ceil(TOTAL / 8);
const popcount = (bits) => {
  let n = 0;
  for (let i = 0; i < bits.length; i++) {
    let x = bits[i];
    x -= (x >> 1) & 0x55;
    x = (x & 0x33) + ((x >> 2) & 0x33);
    x = (x + (x >> 4)) & 0x0f;
    n += x;
  }
  return n;
};
const failures = [];
const newEntries = [];
const addEntry = (key, label, bits, expect, source) => {
  const pop = popcount(bits);
  if (pop !== expect) {
    failures.push(`${key}: popcount ${pop} != expected ${expect} (${source})`);
    console.error(`GATE FAIL ${key}: popcount ${pop} != expected ${expect}`);
  } else {
    console.log(`ok ${key}: ${pop}`);
  }
  newEntries.push({ key, label, count: pop, bits });
};
// Translate an enrichment member bitset (papers-population indexing)
// onto TCB1 catalog positions.
const translateBitset = (enrichId) => {
  const raw = readFileSync(join(enrichDir, `artifacts/bitsets/${enrichId}.member.bitset`));
  if (raw.length !== Math.ceil(papersIds.length / 8))
    throw new Error(`${enrichId}: bitset bytes ${raw.length} != ${Math.ceil(papersIds.length / 8)}`);
  const bits = new Uint8Array(bitsetBytes);
  for (let i = 0; i < papersIds.length; i++) {
    if (raw[i >> 3] & (1 << (i & 7))) {
      for (const p of papersPositions[i]) bits[p >> 3] |= 1 << (p & 7);
    }
  }
  return bits;
};
for (const f of PAPER_FIELDS) {
  addEntry(`paperfield:${f.id}`, f.label, translateBitset(f.id), counts[f.id].membership_count, "counts-final");
  for (const s of f.subs) {
    if (s.id === "classics-of-science") {
      // Measured zero by the completed enrichment; no bitset file
      // exists. Honest empty marker — all-zero bitset, count 0.
      if (counts[s.id] && counts[s.id].membership_count !== 0)
        throw new Error("classics-of-science unexpectedly nonzero in counts-final");
      addEntry(`papersub:${f.id}:${s.id}`, s.label, new Uint8Array(bitsetBytes), 0, "empty marker");
      continue;
    }
    addEntry(`papersub:${f.id}:${s.id}`, s.label, translateBitset(s.id), counts[s.id].membership_count, "counts-final");
  }
}
// Types: membership from the per-paper assignments (no bitset files).
{
  const typeIdx = new Map(PAPER_TYPES.map((t) => [t.id, []]));
  const rl = createInterface({
    input: createReadStream(join(enrichDir, "staged/assignments.jsonl"), "utf8"),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line) continue;
    const r = JSON.parse(line);
    for (const t of r.types || []) {
      const arr = typeIdx.get(t);
      if (arr) arr.push(r.idx);
    }
  }
  for (const t of PAPER_TYPES) {
    const bits = new Uint8Array(bitsetBytes);
    for (const i of typeIdx.get(t.id)) {
      for (const p of papersPositions[i]) bits[p >> 3] |= 1 << (p & 7);
    }
    addEntry(`papertype:${t.id}`, t.label, bits, counts[`type:${t.id}`].membership_count, "counts-final");
  }
}
if (failures.length) {
  console.error(`ABORT: ${failures.length} gate failure(s) — nothing written`);
  process.exit(1);
}

// ---------- spot checks (permutation-proof) ------------------------------
// Popcounts cannot detect a position permutation; named papers can.
// The expectations come from the enrichment's own assignments (the
// measured data outranks any narrative — e.g. the library's most-read
// paper, the PLOS ONE medical-education study plos-pone-0004374, is
// MeSH-assigned to Brain > Cognition & Psychology, not Medicine).
{
  const bitAt = (entry, pos) => (entry.bits[pos >> 3] & (1 << (pos & 7))) !== 0;
  const byKey = new Map(newEntries.map((e) => [e.key, e]));
  const expect = (id, key, want) => {
    const pos = idToPositions.get(id);
    if (!pos || pos.length !== 1) throw new Error(`spot paper ${id}: position lookup failed`);
    const got = bitAt(byKey.get(key), pos[0]);
    if (got !== want)
      throw new Error(`spot check: ${id} in ${key} = ${got}, expected ${want}`);
  };
  // arXiv CS paper, primary-only membership.
  expect("arxiv-2509-24651", "paperfield:cs", true);
  expect("arxiv-2509-24651", "papersub:cs:ai-ml", true);
  expect("arxiv-2509-24651", "papertype:preprints", true);
  expect("arxiv-2509-24651", "paperfield:medicine", false);
  // EPMC paper with cross-lists: primary + both cross memberships.
  expect("europmc-pmc4302049", "paperfield:biology", true);
  expect("europmc-pmc4302049", "papersub:biology:cell-molecular", true);
  expect("europmc-pmc4302049", "papersub:biology:genetics-genomics", true);
  expect("europmc-pmc4302049", "paperfield:cs", true);
  expect("europmc-pmc4302049", "papersub:cs:info-systems", true);
  expect("europmc-pmc4302049", "papertype:journal-articles", true);
  // The most-read paper: Brain > Cognition & Psychology, not Medicine.
  expect("plos-pone-0004374", "paperfield:brain", true);
  expect("plos-pone-0004374", "papersub:brain:cognition-psychology", true);
  expect("plos-pone-0004374", "paperfield:medicine", false);
  console.log("spot checks ok: 13 named-paper bit assertions (primary, cross-list, negative)");
}

// ---------- assemble + write ------------------------------------------------
const entries = [...kept, ...newEntries];
const parts = [];
const head = Buffer.alloc(16);
head.write("TCU1", 0, "latin1");
head.writeUInt16LE(1, 4);
head.writeUInt32LE(entries.length, 8);
head.writeUInt32LE(TOTAL, 12);
parts.push(head);
const meta = [];
for (const e of entries) {
  const kb = Buffer.from(e.key, "utf8");
  const lb = Buffer.from(e.label || "", "utf8");
  if (kb.length > 255 || lb.length > 255) throw new Error(`key/label too long: ${e.key}`);
  const eh = Buffer.alloc(1 + kb.length + 1 + lb.length + 4);
  let p = 0;
  eh.writeUInt8(kb.length, p); p += 1;
  kb.copy(eh, p); p += kb.length;
  eh.writeUInt8(lb.length, p); p += 1;
  lb.copy(eh, p); p += lb.length;
  eh.writeUInt32LE(e.count, p);
  parts.push(eh, Buffer.from(e.bits.buffer, e.bits.byteOffset, e.bits.byteLength));
  meta.push({ key: e.key, count: e.count });
}
const raw = Buffer.concat(parts);
const br = brotliCompressSync(raw, { params: { [ZC.BROTLI_PARAM_QUALITY]: 11 } });
writeFileSync(join(repoRoot, "tcb1-data/curated.bin.br"), br);
if (manifest.totals) {
  manifest.totals.raw_bytes += raw.length - curRaw.length;
  manifest.totals.brotli_bytes += br.length - manifest.curated.brotli_bytes;
}
manifest.curated = {
  file: "curated.bin",
  bytes: raw.length,
  sha256: sha256hex(raw),
  brotli_bytes: br.length,
  collections: meta,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
console.log(
  `curated.bin ${curRaw.length} -> ${raw.length} bytes raw, ${br.length} brotli; entries ${current.entries.length} -> ${entries.length} (+${newEntries.length} papers); manifest updated`
);
