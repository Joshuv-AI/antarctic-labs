#!/usr/bin/env node
// Verify one freshly indexed chunk BEFORE its corpus texts may be deleted.
// Usage: node verify-chunk.mjs --chunk-dir <chunk-000 dir> --entries <n>
//   --fetchable <n> --legit-missing <n>
// Checks (all must pass, else exit 1 with the failing check on stderr):
//   1. DONE marker exists and parses (docs, skipped, skippedRef, bytes).
//   2. metas.jsonl has exactly <entries> lines.
//   3. non-null metas == DONE docs; null metas == entries - docs.
//   4. docs == fetchable - legit-missing (every fetched, non-404 text must
//      have produced a doc; REF and non-txt entries never reach fetchable).
//   5. At least one shard temp file exists when docs > 0 (postings written).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
function parseArgs() {
  const a = {};
  for (let i = 2; i < process.argv.length; i += 2) a[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  return a;
}
const args = parseArgs();
const DIR = args["chunk-dir"];
const ENTRIES = parseInt(args.entries, 10), FETCHABLE = parseInt(args.fetchable, 10);
const LEGIT = parseInt(args["legit-missing"] || "0", 10);
function fail(m) { console.error("VERIFY FAIL: " + m); process.exit(1); }
if (!existsSync(join(DIR, "DONE"))) fail("no DONE marker");
const done = readFileSync(join(DIR, "DONE"), "utf8");
const m = done.match(/docs=(\d+) skipped=(\d+) skippedRef=(\d+) bytes=(\d+)/);
if (!m) fail("DONE marker unparsable: " + done.trim());
const docs = +m[1], skipped = +m[2], skippedRef = +m[3];
const metas = readFileSync(join(DIR, "metas.jsonl"), "utf8").trim().split("\n").filter(Boolean);
if (metas.length !== ENTRIES) fail(`metas lines ${metas.length} != entries ${ENTRIES}`);
let nonNull = 0;
for (const line of metas) if (JSON.parse(line)) nonNull++;
if (nonNull !== docs) fail(`non-null metas ${nonNull} != DONE docs ${docs}`);
if (docs + skipped + skippedRef > ENTRIES) fail(`docs+skipped+skippedRef ${docs + skipped + skippedRef} > entries ${ENTRIES}`);
const expectedDocs = FETCHABLE - LEGIT;
if (docs !== expectedDocs) fail(`docs ${docs} != fetchable-legitMissing ${expectedDocs} (fetchable=${FETCHABLE}, legitMissing=${LEGIT})`);
if (docs > 0) {
  const shards = readdirSync(DIR).filter((f) => /^\d+-w0\.jsonl$/.test(f));
  if (!shards.length) fail("docs > 0 but no shard temp files");
}
console.log(`VERIFY OK: docs=${docs} skipped=${skipped} skippedRef=${skippedRef} metas=${metas.length} expectedDocs=${expectedDocs}`);
