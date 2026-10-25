#!/usr/bin/env node
// Merge ONE term shard from gzipped chunk temps (Actions runner variant of
// merge-index.mjs). Reading one shard at a time lets the driver upload and
// delete each finished shard immediately, so a standard runner never holds
// the full final index on disk at once.
// Inputs: chunk temps <tmp>/chunk-NNN/<shard>-w0.jsonl.gz (gzipped by the
// driver after verify-chunk passes), plus bases.json from compute-bases.mjs.
// Output: <out>/<buildId>/terms/<shard>.json (plain JSON, client contract).
// Usage: node merge-shard.mjs --tmp <dir> --out <dir> --build-id <12-hex>
//   --shard <n> --bases <bases.json>
// Prints: {"shard":n,"terms":t,"postings":p}
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
function parseArgs() {
  const a = {};
  for (let i = 2; i < process.argv.length; i += 2) a[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  return a;
}
const args = parseArgs();
const TMP = args.tmp, OUT = args.out, BUILD_ID = args["build-id"];
const SHARD = parseInt(args.shard, 10), BASES = args.bases;
if (!TMP || !OUT || !/^[0-9a-f]{12}$/.test(BUILD_ID || "") || Number.isNaN(SHARD) || SHARD < 0 || SHARD > 255 || !BASES) {
  console.error("usage: merge-shard.mjs --tmp <dir> --out <dir> --build-id <12-hex> --shard <0..255> --bases <file>");
  process.exit(2);
}
const { chunks } = JSON.parse(readFileSync(BASES, "utf8"));
const obj = Object.create(null);
let postings = 0;
for (const c of chunks) {
  const path = join(TMP, c.dir, SHARD + "-w0.jsonl.gz");
  if (!existsSync(path)) continue;
  const raw = gunzipSync(readFileSync(path)).toString("utf8");
  if (!raw) continue;
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const [stem, docIdx, count] = JSON.parse(line);
    let arr = obj[stem];
    if (!arr) { arr = []; obj[stem] = arr; }
    arr.push([docIdx + c.base, count]);
    postings++;
  }
}
const dir = join(OUT, BUILD_ID, "terms");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, SHARD + ".json"), JSON.stringify(obj));
console.log(JSON.stringify({ shard: SHARD, terms: Object.keys(obj).length, postings }));
