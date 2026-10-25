#!/usr/bin/env node
// Build one chunk's inputs for the chunked driver.
// Usage: node build-chunk-catalog.mjs --catalog <dir> --chunk <n>
//   --chunk-size <n, default 10000> --max-entries <n, 0=all>
//   --out-catalog <dir> --out-fetch <file>
// Writes:
//   <out-catalog>/catalog-0.json — exactly the chunk's catalog entries, in
//     original order, verbatim (so stream-index.mjs sees one chunk's worth
//     of entries and emits chunk-000 for THIS chunk only).
//   <out-fetch> — one line per indexable text: "<filename>\t<download_url>"
//     (only /tower-of-babel/*.txt, REF_RE excluded — stream-index skips REF
//     without reading the file, so fetching them is pure waste).
// Prints a JSON summary to stdout: {entries, fetchable, ref, other}.
// WHY NOT run stream-index on the full catalog per chunk: it iterates ALL
// chunks and writes DONE for every chunk it touches — with only one
// chunk's texts present it would poison every other chunk's DONE marker
// with all-skipped metas. Per-chunk catalog isolation is the whole trick.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function parseArgs() {
  const a = {};
  for (let i = 2; i < process.argv.length;) {
    const k = process.argv[i].replace(/^--/, "");
    const v = process.argv[i + 1];
    // Valueless flags (e.g. --count) must not swallow the next token.
    if (v === undefined || v.startsWith("--")) { a[k] = true; i += 1; }
    else { a[k] = v; i += 2; }
  }
  return a;
}
const args = parseArgs();
const CATALOG_DIR = args.catalog, CHUNK = parseInt(args.chunk, 10);
const CHUNK_SIZE = parseInt(args["chunk-size"] || "10000", 10);
const MAX_ENTRIES = parseInt(args["max-entries"] || "0", 10);
const OUT_CATALOG = args["out-catalog"], OUT_FETCH = args["out-fetch"];
if (!CATALOG_DIR || (args.count ? false : (Number.isNaN(CHUNK) || !OUT_CATALOG || !OUT_FETCH))) {
  console.error("usage: build-chunk-catalog.mjs --catalog <dir> --chunk <n> [--chunk-size n] [--max-entries n] --out-catalog <dir> --out-fetch <file>");
  process.exit(2);
}
const REF_RE = /dictionary|lexicon|concordance|thesaurus|glossary/i;
const artifacts = [];
if (args.count) {
  // --count mode: print total catalog entries only (driver uses it for chunk math).
  for (const f of readdirSync(CATALOG_DIR).filter((x) => /^catalog-\d+\.json$/.test(x)).sort()) {
    const parsed = JSON.parse(readFileSync(join(CATALOG_DIR, f), "utf8"));
    const entries = Array.isArray(parsed) ? parsed : parsed.artifacts || parsed.items || [];
    artifacts.push(...entries);
  }
  console.log(JSON.stringify({ totalCatalog: artifacts.length }));
  process.exit(0);
}
for (const f of readdirSync(CATALOG_DIR).filter((x) => /^catalog-\d+\.json$/.test(x)).sort()) {
  const parsed = JSON.parse(readFileSync(join(CATALOG_DIR, f), "utf8"));
  const entries = Array.isArray(parsed) ? parsed : parsed.artifacts || parsed.items || [];
  for (const e of entries) artifacts.push(e);
}
let slice = artifacts.slice(CHUNK * CHUNK_SIZE, (CHUNK + 1) * CHUNK_SIZE);
if (MAX_ENTRIES > 0) slice = slice.slice(0, MAX_ENTRIES);
let fetchable = 0, ref = 0, other = 0;
const fetchLines = [];
for (const e of slice) {
  const url = e.download_url || "";
  if (!url.startsWith("/tower-of-babel/") || !url.endsWith(".txt")) { other++; continue; }
  if (REF_RE.test(url)) { ref++; continue; }
  fetchable++;
  fetchLines.push(url.split("/").pop() + "\t" + url);
}
mkdirSync(OUT_CATALOG, { recursive: true });
writeFileSync(join(OUT_CATALOG, "catalog-0.json"), JSON.stringify(slice));
writeFileSync(OUT_FETCH, fetchLines.length ? fetchLines.join("\n") + "\n" : "");
console.log(JSON.stringify({ totalCatalog: artifacts.length, entries: slice.length, fetchable, ref, other }));
