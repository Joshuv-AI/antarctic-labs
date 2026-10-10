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

  // Wipe previous builds first so stale buildId dirs don't accumulate.
  rmSync(OUT, { recursive: true, force: true });
  const tmpDir = join(OUT, ".tmp-postings");
  mkdirSync(tmpDir, { recursive: true });

  const docs = [];
  const stemCache = new Map(); // shared across docs: common words stem once
  // Bound the cache: it grows with distinct terms (~5M+ for the full library)
  // and OOM-killed Cloudflare Pages builds once the library passed ~5k texts.
  // stem() is deterministic, so eviction cannot change the index output.
  const STEM_CACHE_CAP = 200000;
  let skipped = 0;
  let totalBytes = 0;

  // Reference works like dictionaries/lexicons/concordances are lookup tools,
  // not readable texts: indexing every headword would bloat the index 10x and
  // pollute search results (every common word matches the dictionary). They
  // stay in the library (browsable, viewable, downloadable) but are excluded
  // from the full-text index.
  const REF_RE = /dictionary|lexicon|concordance|thesaurus|glossary/i;

  // PASS 1 — stream per-doc postings to per-shard temp files so memory stays
  // flat no matter how large the library grows. Line format per shard file:
  // [stem, docIdx, count] as JSON, one per line, in docIdx order.
  let skippedRef = 0;
  for (const a of artifacts) {
    const url = a.download_url || "";
    if (!url.startsWith("/tower-of-babel/") || !url.endsWith(".txt")) continue;
    if (REF_RE.test(url)) { skippedRef++; continue; }
    let text;
    try {
      text = readFileSync(join(ROOT, "public", url), "utf8");
    } catch {
      skipped++;
      continue;
    }
    totalBytes += text.length;
    const counts = analyze(text, stemCache);
    if (stemCache.size > STEM_CACHE_CAP) stemCache.clear(); // keep memory flat
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
    const bufs = new Map(); // shardIdx -> lines for this doc
    for (const [stem, count] of counts) {
      const si = shardFor(stem, SHARD_COUNT);
      let b = bufs.get(si);
      if (!b) { b = []; bufs.set(si, b); }
      b.push(JSON.stringify([stem, docIdx, count]));
    }
    for (const [si, b] of bufs) {
      writeFileSync(join(tmpDir, si + ".jsonl"), b.join("\n") + "\n", { flag: "a" });
    }
  }

  // PASS 2 — merge one shard at a time into its final postings object.
  const dir = join(OUT, buildId, "terms");
  mkdirSync(dir, { recursive: true });
  let distinctTerms = 0;
  for (let i = 0; i < SHARD_COUNT; i++) {
    const obj = Object.create(null); // null proto: stems like "push" must not hit Object.prototype
    let raw = "";
    try {
      raw = readFileSync(join(tmpDir, i + ".jsonl"), "utf8");
    } catch {
      raw = "";
    }
    if (raw) {
      const lines = raw.split("\n");
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        if (!line) continue;
        const parsed = JSON.parse(line);
        const stem = parsed[0], docIdx = parsed[1], count = parsed[2];
        let arr = obj[stem];
        if (!arr) { arr = []; obj[stem] = arr; distinctTerms++; }
        arr.push([docIdx, count]);
      }
    }
    writeFileSync(join(dir, i + ".json"), JSON.stringify(obj));
  }
  rmSync(tmpDir, { recursive: true, force: true });

  const manifest = {
    buildId,
    builtAt: new Date().toISOString(),
    texts: docs.length,
    terms: distinctTerms,
    shards: SHARD_COUNT,
    docs,
  };
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest));

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    "[search-index] indexed " + docs.length + " texts (" + (totalBytes / 1048576).toFixed(1) + " MB), " +
    distinctTerms.toLocaleString() + " terms, " + SHARD_COUNT + " shards in " + secs + "s" +
    (skipped ? " (" + skipped + " referenced files missing, skipped)" : "") +
    (skippedRef ? " (" + skippedRef + " reference works excluded from index)" : "")
  );
}

try {
  main();
} catch (err) {
  failSafe(String((err && err.message) || err));
}
