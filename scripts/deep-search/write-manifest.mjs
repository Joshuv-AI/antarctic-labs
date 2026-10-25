#!/usr/bin/env node
// Write the deep-search manifest from chunk metas (Actions runner variant of
// the manifest step in merge-index.mjs). Key order matches the stock
// indexer: {buildId, builtAt, texts, terms, shards, docs}.
// docs[i].file is the catalog download_url, exactly as the client expects
// (the client fetches the snippet text from that site URL at query time).
// Usage: node write-manifest.mjs --tmp <dir> --out <dir>
//   --build-id <12-hex> --terms <total-distinct-terms>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SHARD_COUNT } from "./build-tree/src/lib/search-text.js";
function parseArgs() {
  const a = {};
  for (let i = 2; i < process.argv.length; i += 2) a[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  return a;
}
const args = parseArgs();
const TMP = args.tmp, OUT = args.out, BUILD_ID = args["build-id"];
const TERMS = parseInt(args.terms, 10);
if (!TMP || !OUT || !/^[0-9a-f]{12}$/.test(BUILD_ID || "") || Number.isNaN(TERMS)) {
  console.error("usage: write-manifest.mjs --tmp <dir> --out <dir> --build-id <12-hex> --terms <n>");
  process.exit(2);
}
if (SHARD_COUNT !== 256) { console.error("SHARD_COUNT is " + SHARD_COUNT + ", expected 256"); process.exit(1); }
const { chunks } = JSON.parse(readFileSync(join(TMP, "bases.json"), "utf8"));
const docs = [];
for (const c of chunks) {
  const metas = readFileSync(join(TMP, c.dir, "metas.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  for (const line of metas) {
    const meta = JSON.parse(line);
    if (meta) docs.push(meta);
  }
}
if (!docs.length) { console.error("no docs assembled"); process.exit(1); }
const manifest = {
  buildId: BUILD_ID,
  builtAt: new Date().toISOString(),
  texts: docs.length,
  terms: TERMS,
  shards: SHARD_COUNT,
  docs,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest));
console.log(JSON.stringify({ buildId: BUILD_ID, texts: docs.length, terms: TERMS, shards: SHARD_COUNT }));
