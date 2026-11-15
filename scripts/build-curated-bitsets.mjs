#!/usr/bin/env node
// build-curated-bitsets.mjs — rebuild ONLY the TCU1 curated bitsets
// (tcb1-data/curated.bin.br + the manifest's curated section) for the
// 2026-11-15 collections package, without touching the TCB1 shards or
// dictionary (the catalog did not change; the taxonomy did).
//
// Membership sources (all verified against the design packages'
// reproduction gates before this script runs — see the run record):
//   tradition:*   carried over verbatim from the current curated.bin
//                 (hub-derived, unchanged by this package)
//   law:* med:*   members-students.json — record positions in the
//                 audit snapshot from curated-students-20261114's
//                 rules_final.py, run verbatim (bake_students.py).
//                 The design's two optional curated pins are NOT
//                 applied: they would break the exact design counts
//                 (follow-on, logged in the run record).
//   (Papers paperfield/papersub/papertype entries are HELD: the
//   papers-subcategories design's membership needs enrichment data
//   the catalog does not carry and ships no counts/members file, so
//   no reproduction gate can be satisfied this run.)
//   eng:*         members-engineering.json — record positions from
//                 curated-engineering-20261114's rules_v3.py/engine3.py
//   conspiracy:*  members-conspiracy-ship.json — record positions from
//                 curated-conspiracy-20261115's rules_final.py, with
//                 the design's documented UFO acronym remedy applied
//   audience:*    Mathematics and Sciences — artifact-id lists from
//                 curated-math-sciences-20261114 members-final.json
//                 (+ natural_history_ids.json)
//   bookshelf:*   Books expansion — artifact-id lists from
//                 books-subcategories-20261115 members-final.json
//
// Positions are audit-snapshot positions; they are mapped to TCB1
// catalog indices through artifact ids (audit shards -> id ->
// catalog-index shards), so the result does not depend on the two
// snapshots sharing a record order. Id-list membership marks every
// record carrying the id (the same semantics build-tcb1.mjs's
// buildCurated has always used; the 5 known duplicate BOOKS ids are
// attributed in the gate report).
//
// Every entry's popcount is asserted against expected-counts.json
// ({ "<key>": <count> }) in the members dir; a mismatch aborts the
// build — wrong counts never ship. Zero-count entries are legal
// (marker shelves, Joshua's standing rule).
//
// Usage: node scripts/build-curated-bitsets.mjs [membersDir] [repoRoot]
//   membersDir default: ~/workspace/antarctic-labs-work/work-collections-run
//   repoRoot   default: the repo containing this script
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { brotliCompressSync, brotliDecompressSync, constants as ZC } from "node:zlib";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LAW_COLLECTIONS,
  MED_COLLECTIONS,
  ENG_COLLECTIONS,
  CONSPIRACY_COLLECTIONS,
  MATHSCI_SHELVES,
  BOOKS_SHELVES,
} from "../src/lib/tower-collections-data.js";

const membersDir =
  process.argv[2] ||
  join(homedir(), "workspace/antarctic-labs-work/work-collections-run");
const repoRoot = process.argv[3] || join(dirname(fileURLToPath(import.meta.url)), "..");
const RN = join(homedir(), "workspace/research_notes");
const AUDIT_DIR = join(homedir(), "workspace/antarctic-labs-work/audit-curated/shards");
const INDEX_DIR = join(homedir(), "workspace/tower-expansion/pushstate/base2/index-shards");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const slug = (name) =>
  name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- id <-> position maps -------------------------------------
// The member bakes recorded positions iterating the audit shards in
// LEXICOGRAPHIC filename order (Python sorted(glob)): catalog-00,
// catalog-01, …, catalog-10, catalog-100, catalog-101, … — NOT numeric
// order. This script must read them in the same order or every
// position points at the wrong record (a permutation the popcount
// gate alone cannot detect — counts survive permutation; only the
// dup-id shelves betrayed it, +1 on five law shelves, 2026-11-15).
console.log("loading audit id sequence…");
const auditIds = [];
{
  const files = readdirSync(AUDIT_DIR)
    .filter((f) => /^catalog-\d+\.json$/.test(f))
    .sort();
  if (files.length !== 168) throw new Error(`audit shards: ${files.length}`);
  for (const f of files) {
    const recs = readJson(join(AUDIT_DIR, f));
    for (const r of recs) auditIds.push(r.artifact_id);
  }
}
console.log(`audit records: ${auditIds.length}`);
console.log("loading TCB1 (catalog-index) id sequence…");
const idToPositions = new Map();
{
  let pos = 0;
  for (let s = 0; s < 10; s++) {
    const recs = readJson(join(INDEX_DIR, `catalog-index-${String(s).padStart(2, "0")}.json`));
    for (const r of recs) {
      if (!idToPositions.has(r.artifact_id)) idToPositions.set(r.artifact_id, []);
      idToPositions.get(r.artifact_id).push(pos);
      pos++;
    }
  }
  console.log(`tcb1 records: ${pos}`);
}
const TOTAL = idToPositionsSize();
function idToPositionsSize() {
  let n = 0;
  for (const v of idToPositions.values()) n += v.length;
  return n;
}
if (TOTAL !== 2557923) throw new Error(`unexpected catalog total ${TOTAL}`);

const positionsFromAuditPositions = (positions) => {
  const out = [];
  for (const p of positions) {
    const id = auditIds[p];
    const hits = idToPositions.get(id);
    if (!hits) throw new Error(`audit position ${p} id ${id} not in TCB1 catalog`);
    for (const h of hits) out.push(h);
  }
  return out;
};
const positionsFromIds = (ids) => {
  const out = [];
  for (const id of ids) {
    const hits = idToPositions.get(id);
    if (!hits) throw new Error(`member id ${id} not in TCB1 catalog`);
    for (const h of hits) out.push(h);
  }
  return out;
};

// ---------- current curated.bin (traditions carry-over) --------------
const manifestPath = join(repoRoot, "tcb1-data/manifest.json");
const manifest = readJson(manifestPath);
const curBr = readFileSync(join(repoRoot, "tcb1-data/curated.bin.br"));
const curRaw = brotliDecompressSync(curBr);
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
    const bits = buf.subarray(p, p + bitsetBytes); p += bitsetBytes;
    out.push({ key, label, count: n, bits });
  }
  return { total, entries: out };
}
const current = parseTcu1(curRaw);
if (current.total !== TOTAL) throw new Error("current curated total mismatch");

// ---------- assemble the new entry list -------------------------------
const entries = []; // {key, label, positions?|bits?, expect}
for (const e of current.entries) {
  if (e.key.startsWith("tradition:")) {
    entries.push({ key: e.key, label: e.label, bits: new Uint8Array(e.bits), expect: e.count });
  }
}
// Students: the verbatim rule bake (design counts reproduce
// exactly; the optional pins are a logged follow-on, not applied).
const students = readJson(join(membersDir, "members-students.json"));
for (const e of LAW_COLLECTIONS) {
  entries.push({
    key: `law:${e.id}`,
    label: e.label,
    positions: positionsFromAuditPositions(students.law[e.id] || []),
  });
}
for (const e of MED_COLLECTIONS) {
  entries.push({
    key: `med:${e.id}`,
    label: e.label,
    positions: positionsFromAuditPositions(students.med[e.id] || []),
  });
}
const engMembers = readJson(join(membersDir, "members-engineering.json"));
const engBySlug = {};
for (const [name, positions] of Object.entries(engMembers)) engBySlug[slug(name)] = positions;
for (const e of ENG_COLLECTIONS) {
  entries.push({
    key: `eng:${e.id}`,
    label: e.label,
    positions: positionsFromAuditPositions(engBySlug[e.id] || []),
  });
}
const conspMembers = readJson(join(membersDir, "members-conspiracy-ship.json"));
const conspBySlug = {};
for (const [name, positions] of Object.entries(conspMembers)) conspBySlug[slug(name)] = positions;
for (const e of CONSPIRACY_COLLECTIONS) {
  entries.push({
    key: `conspiracy:${e.id}`,
    label: e.label,
    positions: positionsFromAuditPositions(conspBySlug[e.id] || []),
  });
}
const msMembers = readJson(join(RN, "curated-math-sciences-20261114/members-final.json"));
msMembers["natural-history"] = readJson(
  join(RN, "curated-math-sciences-20261114/natural_history_ids.json")
);
for (const e of MATHSCI_SHELVES) {
  entries.push({
    key: `audience:${e.id}`,
    label: e.label,
    positions: positionsFromIds(msMembers[e.id] || []),
  });
}
const bookMembers = readJson(join(RN, "books-subcategories-20261115/members-final.json"));
for (const e of BOOKS_SHELVES) {
  entries.push({
    key: `bookshelf:${e.id}`,
    label: e.label,
    positions: positionsFromIds(bookMembers[e.id] || []),
  });
}
// Papers entries: HELD — see the header comment. No paperfield /
// papersub / papertype bitsets ship in this package.

// ---------- expected counts gate --------------------------------------
const expected = readJson(join(membersDir, "expected-counts.json"));
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
const parts = [];
const head = Buffer.alloc(16);
head.write("TCU1", 0, "latin1");
head.writeUInt16LE(1, 4);
head.writeUInt32LE(entries.length, 8);
head.writeUInt32LE(TOTAL, 12);
parts.push(head);
const meta = [];
let failures = 0;
for (const e of entries) {
  let bits;
  if (e.bits) {
    bits = e.bits;
  } else {
    bits = new Uint8Array(bitsetBytes);
    for (const p of e.positions) bits[p >> 3] |= 1 << (p & 7);
  }
  const pop = popcount(bits);
  const exp = e.expect !== undefined ? e.expect : expected[e.key];
  if (exp === undefined) {
    console.error(`NO EXPECTATION for ${e.key} (popcount ${pop})`);
    failures++;
  } else if (pop !== exp) {
    console.error(`GATE FAIL ${e.key}: popcount ${pop} != expected ${exp}`);
    failures++;
  } else {
    console.log(`ok ${e.key}: ${pop}`);
  }
  const kb = Buffer.from(e.key, "utf8");
  const lb = Buffer.from(e.label || "", "utf8");
  const eh = Buffer.alloc(1 + kb.length + 1 + lb.length + 4);
  let p = 0;
  eh.writeUInt8(kb.length, p); p += 1;
  kb.copy(eh, p); p += kb.length;
  eh.writeUInt8(lb.length, p); p += 1;
  lb.copy(eh, p); p += lb.length;
  eh.writeUInt32LE(pop, p);
  parts.push(eh, Buffer.from(bits.buffer, bits.byteOffset, bits.byteLength));
  meta.push({ key: e.key, count: pop });
}
if (failures) {
  console.error(`ABORT: ${failures} gate failure(s) — nothing written`);
  process.exit(1);
}
const raw = Buffer.concat(parts);
const br = brotliCompressSync(raw, {
  params: { [ZC.BROTLI_PARAM_QUALITY]: 11 },
});
writeFileSync(join(repoRoot, "tcb1-data/curated.bin.br"), br);
manifest.curated = {
  file: "curated.bin",
  bytes: raw.length,
  sha256: createHash("sha256").update(raw).digest("hex"),
  brotli_bytes: br.length,
  collections: meta,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
console.log(
  `curated.bin ${raw.length} bytes -> ${br.length} brotli, ${entries.length} entries, manifest updated`
);
