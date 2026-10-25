#!/usr/bin/env node
// Deep-search repair lane — streaming PASS 1 for the full-text index.
//
// Same algorithm + output format as scripts/build-search-index.mjs (parallel
// pass 1) but reads text blobs straight from a git object store via
// `git cat-file --batch` instead of materializing ~13 GB of .txt files on
// disk (the VM cannot hold objects + extracted corpus + temp postings +
// final shards at once). Tokenization/stemming are the shared
// src/lib/search-text.js functions, so postings are identical to the stock
// indexer for the same inputs — verified byte-for-byte on a sample (see
// validate-index.mjs --sample).
//
// Inputs:
//   --catalog <dir>   catalog shards (catalog-*.json, sorted) — same layout
//                     the stock indexer reads from public/catalog-shards/
//   --git-dir <dir>   git object store holding the corpus (texts repo)
//   --tree <sha>      tree/commit whose public/tower-of-babel/ blobs are read
//   --corpus-dir <dir> ALTERNATIVE to --git-dir/--tree: read texts straight
//                     from a directory of .txt files (e.g. raw-fetched corpus).
//                     Missing file -> skipped, same as a missing blob.
//   --tmp <dir>       temp output dir (chunked, resumable)
//   --chunk-size <n>  catalog entries per chunk (default 10000)
//
// Temp layout per chunk: <tmp>/chunk-NNN/<shard>-w0.jsonl (lines of
// [stem, localDocIdx, count], local to the CHUNK's successful docs),
// <tmp>/chunk-NNN/metas.jsonl (one JSON line per catalog entry in the
// chunk: doc meta or null), <tmp>/chunk-NNN/DONE (written last).
// A chunk with a DONE marker is skipped on restart — resume is chunk-granular.
// Progress: <tmp>/progress.log (appended per chunk + every 1000 docs).
//
// Filters mirror the stock indexer exactly: only download_url starting with
// /tower-of-babel/ and ending .txt; REF_RE (dictionary|lexicon|concordance|
// thesaurus|glossary, case-insensitive) excluded and counted as skippedRef;
// a catalog filename with no blob in the tree counts as skipped.

import { spawn, execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { analyze, shardFor, SHARD_COUNT } from "./build-tree/src/lib/search-text.js";

const REF_RE = /dictionary|lexicon|concordance|thesaurus|glossary/i;
const STEM_CACHE_CAP = 200000;
const FLUSH_BYTES = 512 * 1024;

function parseArgs() {
  const a = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    a[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  }
  return a;
}
const args = parseArgs();
const CATALOG_DIR = args.catalog;
const GIT_DIR = args["git-dir"];
const TREE = args.tree;
const CORPUS_DIR = args["corpus-dir"];
const TMP = args.tmp;
const CHUNK_SIZE = parseInt(args["chunk-size"] || "10000", 10);
if (!CATALOG_DIR || !TMP || !(CORPUS_DIR || (GIT_DIR && TREE))) {
  console.error("usage: stream-index.mjs --catalog <dir> --tmp <dir> (--corpus-dir <dir> | --git-dir <dir> --tree <sha>) [--chunk-size n]");
  process.exit(2);
}
mkdirSync(TMP, { recursive: true });
const progressPath = join(TMP, "progress.log");
function log(s) {
  const line = `[${new Date().toISOString()}] ${s}`;
  console.log(line);
  appendFileSync(progressPath, line + "\n");
}

// --- catalog (same loader as the stock indexer) ---
const artifacts = [];
for (const f of readdirSync(CATALOG_DIR).filter((x) => /^catalog-\d+\.json$/.test(x)).sort()) {
  const parsed = JSON.parse(readFileSync(join(CATALOG_DIR, f), "utf8"));
  const entries = Array.isArray(parsed) ? parsed : parsed.artifacts || parsed.items || [];
  for (const e of entries) {
    artifacts.push({
      artifact_id: e.artifact_id,
      download_url: e.download_url,
      title: e.title,
      creator: e.creator,
      year: e.year,
      collection: e.collection,
    });
  }
}
log(`catalog entries: ${artifacts.length}`);

// --- filename -> blob sha map from the tree (one ls-tree pass), OR null
//     when reading from a plain corpus dir ---
let blobByFile = null;
let reader = null;
if (CORPUS_DIR) {
  log(`reading texts from corpus dir ${CORPUS_DIR}`);
} else {
  log(`loading ls-tree for ${TREE}...`);
  const lsOut = execFileSync("git", ["--git-dir", GIT_DIR, "ls-tree", TREE + ":public/tower-of-babel"], { maxBuffer: 512 * 1024 * 1024 }).toString("utf8");
  blobByFile = new Map();
  for (const line of lsOut.split("\n")) {
    if (!line) continue;
    // "<mode> blob <sha>\t<filename>"
    const tab = line.indexOf("\t");
    const sha = line.slice(0, tab).split(" ")[2];
    blobByFile.set(line.slice(tab + 1), sha);
  }
  log(`tree files: ${blobByFile.size}`);
  reader = new BatchReader(GIT_DIR);
}

// --- sequential git cat-file --batch reader (single data handler) ---
class BatchReader {
  constructor(gitDir) {
    this.child = spawn("git", ["--git-dir", gitDir, "cat-file", "--batch"], { stdio: ["pipe", "pipe", "inherit"] });
    this.buf = Buffer.alloc(0);
    this.moreWaiters = [];
    this.ended = false;
    this.child.stdout.on("data", (d) => {
      this.buf = Buffer.concat([this.buf, d]);
      const ws = this.moreWaiters.splice(0);
      for (const w of ws) w();
    });
    this.child.stdout.on("end", () => {
      this.ended = true;
      const ws = this.moreWaiters.splice(0);
      for (const w of ws) w();
    });
  }
  // Wait for the NEXT data chunk (callers already checked buf is insufficient).
  async readMore() {
    if (this.ended) throw new Error("cat-file stream ended early");
    await new Promise((resolve) => this.moreWaiters.push(resolve));
    if (this.buf.length === 0 && this.ended) throw new Error("cat-file stream ended early");
  }
  async readExactly(n) {
    while (this.buf.length < n) await this.readMore();
    const out = Buffer.from(this.buf.subarray(0, n));
    this.buf = this.buf.subarray(n);
    return out;
  }
  async readLine() {
    let idx = -1;
    while ((idx = this.buf.indexOf(0x0a)) === -1) await this.readMore();
    const line = this.buf.subarray(0, idx).toString("utf8");
    this.buf = this.buf.subarray(idx + 1);
    return line;
  }
  async getText(sha) {
    this.child.stdin.write(sha + "\n");
    const header = await this.readLine();
    const parts = header.split(" ");
    if (parts[1] === "missing") return null;
    const size = parseInt(parts[2], 10);
    const body = await this.readExactly(size);
    await this.readExactly(1); // trailing LF after each object
    return body.toString("utf8");
  }
  close() { try { this.child.stdin.end(); } catch {} }
}

// --- pass 1, chunked ---
const stemCache = new Map();
let totalSkipped = 0, totalRef = 0, totalDocs = 0, totalBytes = 0;
const t0 = Date.now();
const nChunks = Math.ceil(artifacts.length / CHUNK_SIZE);

for (let c = 0; c < nChunks; c++) {
  const chunkDir = join(TMP, "chunk-" + String(c).padStart(3, "0"));
  if (existsSync(join(chunkDir, "DONE"))) {
    // Count docs from existing metas so totals stay right on resume.
    const metas = readFileSync(join(chunkDir, "metas.jsonl"), "utf8").trim().split("\n").filter(Boolean);
    let docs = 0;
    for (const m of metas) if (JSON.parse(m)) docs++;
    totalDocs += docs;
    log(`chunk ${c}/${nChunks}: already DONE (${docs} docs) — skipped`);
    continue;
  }
  mkdirSync(chunkDir, { recursive: true });
  const slice = artifacts.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
  const buffers = new Map(); // shardIdx -> { text, bytes }
  const metas = [];
  let localCount = 0, skipped = 0, skippedRef = 0, bytes = 0;
  const flush = (si) => {
    const b = buffers.get(si);
    if (!b || !b.text) return;
    appendFileSync(join(chunkDir, si + "-w0.jsonl"), b.text);
    b.text = ""; b.bytes = 0;
  };
  for (let i = 0; i < slice.length; i++) {
    const a = slice[i];
    const url = a.download_url || "";
    if (!url.startsWith("/tower-of-babel/") || !url.endsWith(".txt")) { metas.push(null); continue; }
    if (REF_RE.test(url)) { skippedRef++; metas.push(null); continue; }
    const fname = url.split("/").pop();
    let text = null;
    if (CORPUS_DIR) {
      try { text = readFileSync(join(CORPUS_DIR, fname), "utf8"); } catch { text = null; }
    } else {
      const sha = blobByFile.get(fname);
      if (sha) {
        try { text = await reader.getText(sha); } catch (e) { text = null; }
      }
    }
    if (text === null) { skipped++; metas.push(null); continue; }
    bytes += text.length;
    const counts = analyze(text, stemCache);
    if (stemCache.size > STEM_CACHE_CAP) stemCache.clear();
    const localIdx = localCount++;
    metas.push({
      id: a.artifact_id,
      title: a.title,
      creator: a.creator || "",
      year: a.year || null,
      collection: a.collection,
      file: url,
      words: [...counts.values()].reduce((s, cc) => s + cc, 0),
    });
    for (const [stem, count] of counts) {
      const si = shardFor(stem, SHARD_COUNT);
      let b = buffers.get(si);
      if (!b) { b = { text: "", bytes: 0 }; buffers.set(si, b); }
      b.text += JSON.stringify([stem, localIdx, count]) + "\n";
      b.bytes += 40;
      if (b.bytes >= FLUSH_BYTES) flush(si);
    }
    if ((i + 1) % 1000 === 0) log(`chunk ${c}: ${i + 1}/${slice.length} entries, ${localCount} docs`);
  }
  for (const si of buffers.keys()) flush(si);
  writeFileSync(join(chunkDir, "metas.jsonl"), metas.map((m) => JSON.stringify(m)).join("\n") + "\n");
  writeFileSync(join(chunkDir, "DONE"), `docs=${localCount} skipped=${skipped} skippedRef=${skippedRef} bytes=${bytes}\n`);
  totalDocs += localCount; totalSkipped += skipped; totalRef += skippedRef; totalBytes += bytes;
  log(`chunk ${c}/${nChunks} DONE: ${localCount} docs, skipped=${skipped}, skippedRef=${skippedRef}, ${(bytes / 1048576).toFixed(1)} MB`);
}
if (reader) reader.close();
log(`PASS 1 COMPLETE: ${totalDocs} docs, skipped=${totalSkipped}, skippedRef=${totalRef}, ${(totalBytes / 1048576).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
