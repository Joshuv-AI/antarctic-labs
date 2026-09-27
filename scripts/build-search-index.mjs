// Builds the Tower of Babel deep-search (full-text) index.
//
// Runs as `npm run prebuild` (and on Cloudflare Pages before `vite build`).
// Reads every staged /tower-of-babel/*.txt, stems + counts terms per document,
// and writes sharded term postings plus a manifest under public/search-index/.
//
// Design notes:
// - Term -> [[docIdx, count]] postings only. NO positions are stored: snippets
//   are cut from the actual TXT at query time, so the index stays small and
//   can never disagree with the file about where a hit is.
// - Sharded by hash(stem) % 64 so a query only downloads the 1-3 small shards
//   its terms live in, instead of one giant index.
// - NEVER fails the build: any error writes a minimal manifest and exits 0.
//   Deep search then reports "unavailable"; the site itself is unaffected.
//
// The generated files are build artifacts (gitignored) — they are NOT pushed
// to the repo; Cloudflare regenerates them on every deploy.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { artifacts } from "../src/content/library-catalog.js";
import { analyze, shardFor, SHARD_COUNT } from "../src/lib/search-text.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "search-index");

function failSafe(reason) {
  console.warn(`[search-index] FAILED (${reason}); writing empty manifest so the build continues.`);
  try {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      join(OUT, "manifest.json"),
      JSON.stringify({ buildId: "unavailable", builtAt: new Date().toISOString(), texts: 0, terms: 0, shards: SHARD_COUNT, docs: [], error: reason })
    );
  } catch { /* last resort: ignore */ }
}

function main() {
  const buildId =
    (process.env.CF_PAGES_COMMIT_SHA || "").slice(0, 12) ||
    `local-${Date.now().toString(36)}`;
  const t0 = Date.now();

  const docs = [];
  const postings = new Map(); // stem -> flat [docIdx, count, docIdx, count, ...]
  const stemCache = new Map(); // shared across docs: common words stem once
  let skipped = 0;
  let totalBytes = 0;

  for (const a of artifacts) {
    const url = a.download_url || "";
    if (!url.startsWith("/tower-of-babel/") || !url.endsWith(".txt")) continue;
    let text;
    try {
      text = readFileSync(join(ROOT, "public", url), "utf8");
    } catch {
      skipped++;
      continue;
    }
    totalBytes += text.length;
    const counts = analyze(text, stemCache);
    const docIdx = docs.length;
    docs.push({
      id: a.artifact_id,
      title: a.title,
      creator: a.creator || "",
      year: a.year || null,
      collection: a.collection,
      file: url,
      words: [...counts.values()].reduce((s, c) => s + c, 0),
    });
    for (const [stem, count] of counts) {
      let arr = postings.get(stem);
      if (!arr) { arr = []; postings.set(stem, arr); }
      arr.push(docIdx, count);
    }
  }

  // Shard by hash so query-time fetches stay small.
  const shards = Array.from({ length: SHARD_COUNT }, () => ({}));
  for (const [stem, flat] of postings) {
    const obj = shards[shardFor(stem, SHARD_COUNT)];
    const pairs = [];
    for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
    obj[stem] = pairs;
  }

  const dir = join(OUT, buildId, "terms");
  // Wipe previous local builds so stale buildId dirs don't accumulate.
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < SHARD_COUNT; i++) {
    writeFileSync(join(dir, `${i}.json`), JSON.stringify(shards[i]));
  }
  const manifest = {
    buildId,
    builtAt: new Date().toISOString(),
    texts: docs.length,
    terms: postings.size,
    shards: SHARD_COUNT,
    docs,
  };
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest));

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[search-index] indexed ${docs.length} texts (${(totalBytes / 1048576).toFixed(1)} MB), ` +
    `${postings.size.toLocaleString()} terms, ${SHARD_COUNT} shards in ${secs}s` +
    (skipped ? ` (${skipped} referenced files missing, skipped)` : "")
  );
}

try {
  main();
} catch (err) {
  failSafe(String((err && err.message) || err));
}
