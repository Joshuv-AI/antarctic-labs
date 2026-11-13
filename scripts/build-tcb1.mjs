#!/usr/bin/env node
// TCB1 binary browse dataset builder (Tower optimization Phase 2A,
// FILTER-REVAMP-DESIGN.md §12). Produces the columnar binary dataset the
// Tower browse page streams instead of the 795 MB browse JSON:
//
//   tcb1-data/manifest.json    — commit point, written LAST
//   tcb1-data/dict.bin.br      — Brotli-q11 global dictionaries (TCD1)
//   tcb1-data/shard-NNNN.tcb.br— Brotli-q11 columnar shards (TCB1)
//   tcb1-data/curated.bin.br   — Brotli-q11 curated-collection bitsets (TCU1)
//
// Only the Brotli files are committed: the client's fetch negotiates
// Content-Encoding: br (functions/tcb1/), so the bytes on the wire ARE
// the stored bytes and the browser inflates natively. The raw forms are
// regenerated deterministically from the canonical catalog-index shards
// and verified byte-for-byte by the manifest's sha256 fields, which the
// client checks after inflation.
//
// Inputs are the SAME canonical publish sources as
// scripts/build-catalog-meta.mjs: the catalog-index shards (whose
// sha256-concat fingerprint must equal the browse manifest fingerprint
// of the publish this dataset ships beside — asserted below when a
// browse manifest is available) and public/tower-hubs-index.json (the
// curated collections' work lists, same source as the hub pages).
//
// REGENERATE IN THE SAME PUBLISH AS THE BROWSE PAGES whenever the
// catalog changes:
//   node scripts/build-tcb1.mjs [srcShardDir] [hubIndexFile] [outDir]
// Defaults: srcShardDir = the publish source dir build-catalog-meta
// uses, hubIndexFile = public/tower-hubs-index.json, outDir = tcb1-data/.
// tcb1-data/ is a DATA push (like the other catalog data products); the
// serving functions pin to the deployed commit, so the dataset and the
// code that reads it must land in the same deploy.
//
// Format specs: TCB1/TCD1 in ~/workspace/tower-perf-data/FORMAT.md
// (stage-1 reference implementation: tower-perf-data/src/). TCU1 is
// specified inline below. Dictionary codes are first-appearance order
// over the canonical record sequence; the 5 duplicate artifact_ids in
// the catalog are encoded as-is, in order (client dedupe matches the
// JSON path: first occurrence wins).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const DICT_FIELDS = ["creator", "collection", "download_status", "rights_status", "format"];
const SECTIONS = [
  "id_offsets", "id_blob", "title_offsets", "title_blob", "creator_codes",
  "year_i32", "year_str_rows", "year_str_offsets", "year_str_blob",
  "collection_codes", "download_codes", "rights_codes", "format_codes",
];
const INT32_NULL_YEAR = -2147483648;
const SHARD_SIZE = 20000;

const sha256hex = (buf) => createHash("sha256").update(buf).digest("hex");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir =
  process.argv[2] || join(os.homedir(), "workspace/tower-expansion/pushstate/base2/index-shards");
const hubFile = process.argv[3] || join(root, "public", "tower-hubs-index.json");
const outDir = process.argv[4] || join(root, "tcb1-data");
const stageDir = join(outDir, ".raw-stage");

const shardFiles = [];
for (let i = 0; ; i++) {
  const name = `catalog-index-${String(i).padStart(2, "0")}.json`;
  if (!existsSync(join(srcDir, name))) break;
  shardFiles.push(name);
}
if (!shardFiles.length) { console.error("no catalog-index shards in", srcDir); process.exit(1); }

// ---------- pass 1: fingerprint + dictionaries + stats ---------------------
const srcHash = createHash("sha256");
const dictMaps = { creator: new Map(), collection: new Map(), download_status: new Map(), rights_status: new Map(), format: new Map() };
const NULLABLE = { creator: true, collection: false, download_status: false, rights_status: false, format: false };
let total = 0;
const stats = { nullCreator: 0, nullYear: 0, stringYear: 0, numberYear: 0 };
let titleBytesTotal = 0, titleLenMax = 0;
for (const name of shardFiles) {
  const raw = readFileSync(join(srcDir, name), "utf8");
  srcHash.update(raw);
  for (const r of JSON.parse(raw)) {
    total++;
    for (const f of DICT_FIELDS) {
      const v = r[f];
      if (v === null) { if (f === "creator") stats.nullCreator++; continue; }
      if (!dictMaps[f].has(v)) dictMaps[f].set(v, dictMaps[f].size);
    }
    const tl = Buffer.byteLength(r.title, "utf8");
    titleBytesTotal += tl;
    if (tl > titleLenMax) titleLenMax = tl;
    if (r.year === null) stats.nullYear++;
    else if (typeof r.year === "string") stats.stringYear++;
    else {
      stats.numberYear++;
      if (!Number.isInteger(r.year) || r.year === INT32_NULL_YEAR)
        throw new Error(`unrepresentable numeric year: ${r.year}`);
    }
  }
  console.log(`pass1 ${name}: cumulative ${total}`);
}
const fingerprint = srcHash.digest("hex");
for (const f of ["collection", "download_status", "rights_status", "format"])
  if (dictMaps[f].size > 256) throw new Error(`${f} has ${dictMaps[f].size} distinct values — exceeds u8 code capacity`);
console.log(`total=${total} fingerprint=${fingerprint}`);

// The fingerprint gate: when the browse meta for this publish exists,
// the TCB1 source fingerprint MUST equal the browse fingerprint, or the
// dataset describes a different catalog than the pages beside it.
const metaManifest = join(srcDir, "..", "meta-out", "manifest.json");
if (existsSync(metaManifest)) {
  const mm = JSON.parse(readFileSync(metaManifest, "utf8"));
  if (mm.fingerprint && mm.fingerprint !== fingerprint)
    throw new Error(`fingerprint mismatch: tcb1 ${fingerprint} vs browse ${mm.fingerprint}`);
  console.log("fingerprint matches browse manifest");
}

// ---------- dictionary file --------------------------------------------------
function buildDict() {
  const parts = [];
  const head = Buffer.alloc(8);
  head.write("TCD1", 0, "latin1"); head.writeUInt16LE(1, 4); head.writeUInt16LE(DICT_FIELDS.length, 6);
  parts.push(head);
  let pos = 8;
  const meta = {};
  for (const f of DICT_FIELDS) {
    const entries = [...dictMaps[f].keys()];
    const offsets = new Uint32Array(entries.length + 1);
    const blobs = entries.map((e, i) => { const b = Buffer.from(e, "utf8"); offsets[i + 1] = offsets[i] + b.length; return b; });
    const nh = Buffer.alloc(1 + f.length + 1 + 4);
    let p = 0;
    nh.writeUInt8(f.length, p); p += 1;
    nh.write(f, p, "utf8"); p += f.length;
    nh.writeUInt8(NULLABLE[f] ? 1 : 0, p); p += 1;
    nh.writeUInt32LE(entries.length, p);
    parts.push(nh); pos += nh.length;
    const pad = (8 - (pos % 8)) % 8;
    if (pad) { parts.push(Buffer.alloc(pad)); pos += pad; }
    parts.push(Buffer.from(offsets.buffer), Buffer.concat(blobs));
    pos += offsets.buffer.byteLength + offsets[entries.length];
    meta[f] = { entries: entries.length, nullable: NULLABLE[f], blob_bytes: offsets[entries.length] };
  }
  return { buf: Buffer.concat(parts), meta };
}
const dict = buildDict();

// ---------- pass 2: encode shards (raw, into the staging dir) ----------------
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });
writeFileSync(join(stageDir, "dict.bin"), dict.buf);
console.log(`dict.bin ${dict.buf.length} bytes`);

const align8 = (n) => (n + 7) & ~7;
function encodeShard(recs, shardIndex) {
  const n = recs.length;
  const idOff = new Uint32Array(n + 1), titleOff = new Uint32Array(n + 1);
  const idBlobs = [], titleBlobs = [];
  const creatorCodes = new Uint32Array(n);
  const years = new Int32Array(n).fill(INT32_NULL_YEAR);
  const ysRows = [], ysOff = [0], ysBlobs = [];
  const codes = { collection: new Uint8Array(n), download_status: new Uint8Array(n), rights_status: new Uint8Array(n), format: new Uint8Array(n) };
  recs.forEach((r, i) => {
    const ib = Buffer.from(r.artifact_id, "utf8"); idBlobs.push(ib); idOff[i + 1] = idOff[i] + ib.length;
    const tb = Buffer.from(r.title, "utf8"); titleBlobs.push(tb); titleOff[i + 1] = titleOff[i] + tb.length;
    creatorCodes[i] = r.creator === null ? 0 : dictMaps.creator.get(r.creator) + 1;
    if (typeof r.year === "number") years[i] = r.year;
    else if (typeof r.year === "string") { const b = Buffer.from(r.year, "utf8"); ysRows.push(i); ysBlobs.push(b); ysOff.push(ysOff[ysOff.length - 1] + b.length); }
    codes.collection[i] = dictMaps.collection.get(r.collection);
    codes.download_status[i] = dictMaps.download_status.get(r.download_status);
    codes.rights_status[i] = dictMaps.rights_status.get(r.rights_status);
    codes.format[i] = dictMaps.format.get(r.format);
  });
  const sectionBufs = {
    id_offsets: Buffer.from(idOff.buffer), id_blob: Buffer.concat(idBlobs),
    title_offsets: Buffer.from(titleOff.buffer), title_blob: Buffer.concat(titleBlobs),
    creator_codes: Buffer.from(creatorCodes.buffer), year_i32: Buffer.from(years.buffer),
    year_str_rows: Buffer.from(new Uint32Array(ysRows).buffer),
    year_str_offsets: Buffer.from(new Uint32Array(ysOff).buffer),
    year_str_blob: Buffer.concat(ysBlobs),
    collection_codes: Buffer.from(codes.collection.buffer), download_codes: Buffer.from(codes.download_status.buffer),
    rights_codes: Buffer.from(codes.rights_status.buffer), format_codes: Buffer.from(codes.format.buffer),
  };
  const headerLen = align8(16 + SECTIONS.length * 8);
  let cursor = headerLen;
  const dir = [];
  for (const name of SECTIONS) { dir.push({ name, offset: cursor, length: sectionBufs[name].length }); cursor = align8(cursor + sectionBufs[name].length); }
  const body = Buffer.alloc(cursor);
  body.write("TCB1", 0, "latin1"); body.writeUInt16LE(1, 4); body.writeUInt16LE(0, 6);
  body.writeUInt32LE(n, 8); body.writeUInt32LE(shardIndex, 12);
  dir.forEach((d, i) => { body.writeUInt32LE(d.offset, 16 + i * 8); body.writeUInt32LE(d.length, 20 + i * 8); body.set(sectionBufs[d.name], d.offset); });
  return Buffer.concat([body, Buffer.from(sha256hex(body), "hex")]);
}

const shardMeta = [];
let bucket = [], shardIndex = 0, seen = 0;
const flush = () => {
  if (!bucket.length) return;
  const buf = encodeShard(bucket, shardIndex);
  const fname = `shard-${String(shardIndex).padStart(4, "0")}.tcb`;
  writeFileSync(join(stageDir, fname), buf);
  shardMeta.push({ index: shardIndex, file: fname, records: bucket.length, bytes: buf.length, sha256: sha256hex(buf), brotli_bytes: null });
  bucket = []; shardIndex++;
};
for (const name of shardFiles) {
  for (const r of JSON.parse(readFileSync(join(srcDir, name), "utf8"))) {
    bucket.push(r); seen++;
    if (bucket.length === SHARD_SIZE) flush();
  }
}
flush();
if (seen !== total) throw new Error(`pass divergence: pass1 ${total} vs pass2 ${seen}`);
console.log(`encoded ${shardMeta.length} shards`);

// ---------- curated bitsets (TCU1) -------------------------------------------
// Layout: magic "TCU1", version u16 = 1, entry_count u32, total u32,
// then per entry (in src/lib/tower-collections.js buildCollections
// order — traditions, programmes, course, audiences):
//   key_len u8, key utf8, label_len u8, label utf8, count u32
//   (POPCOUNT — actual catalog memberships), bitset bytes
//   ceil(total/8), bit i = catalog index i (bit 0 = LSB of byte 0).
// Counts are popcounts, not hub list lengths: where a hub id names a
// duplicated artifact_id, the filter returns every matching record, so
// the popcount is the number the filter itself produces (the panel and
// the results then agree by construction).
function buildCurated() {
  const hub = JSON.parse(readFileSync(hubFile, "utf8"));
  if (hub.total !== total)
    throw new Error(`hub total ${hub.total} != catalog total ${total} — regenerate the hub index first`);
  const colls = [];
  const push = (key, label, works) => colls.push({ key, label, ids: works.map((w) => w.id) });
  for (const [id, works] of Object.entries(hub.traditions || {})) push(`tradition:${id}`, id, works);
  for (const [id, works] of Object.entries(hub.programmes || {})) push(`programme:${id}`, id, works);
  (hub.course?.groups || []).forEach((g, i) => push(`course:${i}`, g.label, g.items));
  for (const [id, works] of Object.entries(hub.audiences || {})) push(`audience:${id}`, id, works);
  const idToColls = new Map();
  colls.forEach((c, ci) => {
    for (const id of c.ids) {
      if (!idToColls.has(id)) idToColls.set(id, []);
      idToColls.get(id).push(ci);
    }
  });
  const bitsetBytes = Math.ceil(total / 8);
  const bits = colls.map(() => new Uint8Array(bitsetBytes));
  const td = new TextDecoder("utf-8", { ignoreBOM: true });
  let base = 0;
  for (const sm of shardMeta) {
    const buf = readFileSync(join(stageDir, sm.file));
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const secOff = (i) => dv.getUint32(16 + i * 8, true);
    const idOff = new Uint32Array(buf.buffer, buf.byteOffset + secOff(0), sm.records + 1);
    const blobOff = secOff(1);
    for (let i = 0; i < sm.records; i++) {
      const id = td.decode(buf.subarray(blobOff + idOff[i], blobOff + idOff[i + 1]));
      const hit = idToColls.get(id);
      if (!hit) continue;
      const gi = base + i;
      for (const ci of hit) bits[ci][gi >> 3] |= 1 << (gi & 7);
    }
    base += sm.records;
  }
  const parts = [];
  const head = Buffer.alloc(16);
  head.write("TCU1", 0, "latin1"); head.writeUInt16LE(1, 4);
  head.writeUInt32LE(colls.length, 8); head.writeUInt32LE(total, 12);
  parts.push(head);
  const meta = [];
  colls.forEach((c, ci) => {
    let pop = 0;
    for (let gi = 0; gi < total; gi++) if (bits[ci][gi >> 3] & (1 << (gi & 7))) pop++;
    if (pop === 0) throw new Error(`curated ${c.key}: empty bitset`);
    const kb = Buffer.from(c.key, "utf8");
    const lb = Buffer.from(c.label, "utf8");
    const eh = Buffer.alloc(1 + kb.length + 1 + lb.length + 4);
    let p = 0;
    eh.writeUInt8(kb.length, p); p += 1; kb.copy(eh, p); p += kb.length;
    eh.writeUInt8(lb.length, p); p += 1; lb.copy(eh, p); p += lb.length;
    eh.writeUInt32LE(pop, p);
    parts.push(eh, Buffer.from(bits[ci].buffer));
    meta.push({ key: c.key, count: pop, hub_list_length: c.ids.length });
    console.log(`curated ${c.key}: ${pop} members (hub list ${c.ids.length})`);
  });
  return { buf: Buffer.concat(parts), meta };
}
const curated = buildCurated();
writeFileSync(join(stageDir, "curated.bin"), curated.buf);
console.log(`curated.bin ${curated.buf.length} bytes, ${curated.meta.length} collections`);

// ---------- Brotli (q11) into the output dir ---------------------------------
const brOpts = { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } };
mkdirSync(outDir, { recursive: true });
let brotliTotal = 0;
const compressOne = (rawName, brName) => {
  const raw = readFileSync(join(stageDir, rawName));
  const br = brotliCompressSync(raw, brOpts);
  writeFileSync(join(outDir, brName), br);
  brotliTotal += br.length;
  console.log(`${brName}: ${raw.length} -> ${br.length}`);
  return br.length;
};
dict.brotli_bytes = compressOne("dict.bin", "dict.bin.br");
for (const sm of shardMeta) sm.brotli_bytes = compressOne(sm.file, `${sm.file}.br`);
const curatedBr = compressOne("curated.bin", "curated.bin.br");

// ---------- manifest LAST (commit point) -------------------------------------
const manifest = {
  format: "TCB1",
  version: 1,
  generator: "scripts/build-tcb1.mjs",
  generated_at: new Date().toISOString(),
  source: {
    kind: "catalog-index shards (canonical publish source of the browse pages)",
    dir_pattern: "catalog-index-NN.json",
    shards: shardFiles,
    fingerprint_sha256_concat: fingerprint,
  },
  total_records: total,
  shard_size: SHARD_SIZE,
  shard_count: shardMeta.length,
  completion_bitmap_bytes: Math.ceil(shardMeta.length / 8),
  dictionaries: {
    file: "dict.bin", bytes: dict.buf.length, sha256: sha256hex(dict.buf), brotli_bytes: dict.brotli_bytes,
    fields: dict.meta,
  },
  curated: {
    file: "curated.bin", bytes: curated.buf.length, sha256: sha256hex(curated.buf), brotli_bytes: curatedBr,
    collections: curated.meta,
  },
  field_stats: { ...stats, title_bytes_total: titleBytesTotal, title_len_max: titleLenMax },
  shards: shardMeta,
  compression: "brotli-q11",
  totals: {
    raw_bytes: dict.buf.length + curated.buf.length + shardMeta.reduce((a, s) => a + s.bytes, 0),
    brotli_bytes: brotliTotal,
  },
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
rmSync(stageDir, { recursive: true, force: true });
console.log(`DONE ${outDir}: shards=${shardMeta.length} raw=${manifest.totals.raw_bytes} brotli=${manifest.totals.brotli_bytes}`);
