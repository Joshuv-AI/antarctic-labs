// Generates public/tower-hubs-index.json — the precomputed hub data for the
// Phase 2 hub pages (traditions, top-50 authors, declassified programmes,
// course primary sources).
//
// REGENERATE AFTER EVERY catalog-shards refresh (same discipline as the
// search index):
//   node scripts/generate-hubs-index.mjs [shardsDir] [outFile]
// Defaults: public/catalog-shards/ -> public/tower-hubs-index.json
//
// Why precomputed: the hub walk (two full passes over ~400k catalog records
// with per-record regex matching) exceeds the Cloudflare Workers CPU time
// limit when run per-request (diagnosed 2026-10-24: ExceededCpu on
// /tower-of-babel/hubs). The Pages Functions only fetch this JSON (1h edge
// cache) and never walk the catalog. This file ships with [CF-Pages-Skip]
// data pushes — the functions read it from the repo at request time, so no
// build is burned by a refresh.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHubIndexData } from "../functions/_lib/tower-hubs.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shardsDir = process.argv[2] || join(root, "public", "catalog-shards");
const outFile = process.argv[3] || join(root, "public", "tower-hubs-index.json");

const getRecords = (i) =>
  JSON.parse(
    readFileSync(join(shardsDir, `catalog-${String(i).padStart(2, "0")}.json`), "utf8")
  );

const t0 = Date.now();
const data = await buildHubIndexData(getRecords);
const json = JSON.stringify(data);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, json);
const secs = ((Date.now() - t0) / 1000).toFixed(1);
const worksListed =
  Object.values(data.traditions).reduce((a, l) => a + l.length, 0) +
  data.topAuthors.reduce((a, x) => a + x.works.length, 0) +
  Object.values(data.programmes).reduce((a, l) => a + l.length, 0) +
  data.course.courseCount;
console.log(
  `wrote ${outFile} (${(json.length / 1048576).toFixed(2)} MB) in ${secs}s — ` +
    `${data.total} records, ${worksListed} hub-listed works, ` +
    `${data.hubPaths.length} hub paths`
);
