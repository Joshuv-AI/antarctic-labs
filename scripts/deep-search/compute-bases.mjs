#!/usr/bin/env node
// Compute per-chunk base offsets for the Actions merge, scanning each
// chunk's metas.jsonl exactly once. Output: bases.json
// {"chunks":[{"dir":"chunk-000","base":0,"docs":1234}, ...]} in chunk order.
// A chunk's base = total non-null metas (docs) in all earlier chunks.
// Usage: node compute-bases.mjs --tmp <shared-tmp> --out <bases.json>
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
function parseArgs() {
  const a = {};
  for (let i = 2; i < process.argv.length; i += 2) a[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  return a;
}
const args = parseArgs();
const TMP = args.tmp, OUT = args.out;
if (!TMP || !OUT) { console.error("usage: compute-bases.mjs --tmp <dir> --out <file>"); process.exit(2); }
const dirs = readdirSync(TMP).filter((d) => /^chunk-\d+$/.test(d)).sort()
  .filter((d) => existsSync(join(TMP, d, "DONE")));
if (!dirs.length) { console.error("no DONE chunks in " + TMP); process.exit(1); }
const chunks = [];
let base = 0;
for (const dir of dirs) {
  const metas = readFileSync(join(TMP, dir, "metas.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  let docs = 0;
  for (const line of metas) if (JSON.parse(line)) docs++;
  chunks.push({ dir, base, docs });
  base += docs;
}
writeFileSync(OUT, JSON.stringify({ chunks }));
console.log(JSON.stringify({ chunks: chunks.length, docs: base }));
