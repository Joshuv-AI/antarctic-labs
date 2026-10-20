// Builds the Tower of Babel deep-search (full-text) index.
//
// Runs as `npm run prebuild` (and on Cloudflare Pages before `vite build`).
// Reads every staged /tower-of-babel/*.txt, stems + counts terms per document,
// and writes sharded term postings plus a manifest under public/search-index/.
//
// Reads the catalog from the sharded JSON files at public/catalog-shards/
// (catalog-00.json, catalog-01.json, …), concatenating them in shard order.
// This replaced the old `import { artifacts } from "../src/content/library-catalog.js"`:
// that file is 103MB — over GitHub's 100MB per-file limit — so it is frozen
// and can never carry new entries. The shards are the catalog source of truth.
// Only the fields the indexer needs are projected to keep memory flat; the
// rest of the pipeline is unchanged from the library-catalog.js era.
// - Term -> [[docIdx, count]] postings only. NO positions are stored: snippets
//   are cut from the actual TXT at query time, so the index stays small and
//   can never disagree with the file about where a hit is.
// - Sharded by hash(stem) % 64 so a query only downloads the 1-3 small shards
//   its terms live in, instead of one giant index.
// - NEVER fails the build: any error writes a minimal manifest and exits 0.
//   Deep search then reports "unavailable"; the site itself is unaffected.
//
// PARALLEL PASS 1 (2026-10-20): at ~250k texts the sequential build exceeded
// Cloudflare Pages' 20-minute build limit, so pass 1 (read + stem every text)
// now runs across worker threads (scripts/build-search-index-worker.mjs) over
// contiguous catalog slices, with buffered per-shard temp writes. The merge
// (pass 2) remaps worker-local doc indices to global ones in slice order, so
// the output is byte-identical to the sequential build (verified by hashing
// every shard from both paths on the same corpus). Any parallel failure falls
// back to the sequential path; SEARCH_INDEX_WORKERS=1 forces sequential.
//
// The generated files are build artifacts (gitignored) — they are NOT pushed
// to the repo; Cloudflare regenerates them on every deploy.

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { analyze, shardFor, SHARD_COUNT } from "../src/lib/search-text.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "search-index");

// Reference works like dictionaries/lexicons/concordances are lookup tools,
// not readable texts: indexing every headword would bloat the index 10x and
// pollute search results (every common word matches the dictionary). They
// stay in the library (browsable, viewable, downloadable) but are excluded
// from the full-text index.
const REF_RE = /dictionary|lexicon|concordance|thesaurus|glossary/i;

// Load catalog entries from the sharded JSON files. Shards are read in sorted
// order (catalog-00.json, catalog-01.json, …) and each shard's array in file
// order, so docIdx assignment stays deterministic across builds. Throws on
// any read/parse failure — the top-level catch turns that into the empty
// fail-safe manifest, never a build failure.
function loadArtifacts() {
  const dir = join(ROOT, "public", "catalog-shards");
  const files = readdirSync(dir)
    .filter((f) => /^catalog-\d+\.json$/.test(f))
    .sort();
  const artifacts = [];
  for (const f of files) {
    const parsed = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const entries = Array.isArray(parsed) ? parsed : parsed.artifacts || parsed.items || [];
    for (const e of entries) {
      // Project only what the indexer uses (id/url for file lookup,
      // title/creator/year/collection for the manifest docs array).
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
  return artifacts;
}

const artifacts = loadArtifacts();

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

function logSummary(texts, totalBytes, distinctTerms, secs, skipped, skippedRef) {
  console.log(
    "[search-index] indexed " + texts + " texts (" + (totalBytes / 1048576).toFixed(1) + " MB), " +
    distinctTerms.toLocaleString() + " terms, " + SHARD_COUNT + " shards in " + secs + "s" +
    (skipped ? " (" + skipped + " referenced files missing, skipped)" : "") +
    (skippedRef ? " (" + skippedRef + " reference works excluded from index)" : "")
  );
}

// ---------------------------------------------------------------------------
// Sequential build (the original algorithm, unchanged). Used for small inputs
// and as the fallback if the parallel path fails for any reason.
// ---------------------------------------------------------------------------
function mainSequential(buildId) {
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
  logSummary(docs.length, totalBytes, distinctTerms, secs, skipped, skippedRef);
}

// ---------------------------------------------------------------------------
// Parallel build. Pass 1 runs in worker threads over contiguous catalog
// slices; pass 2 merges worker temp files in slice order and remaps each
// worker's local doc indices by that worker's base offset, so the postings
// come out in the same global docIdx order the sequential build produces.
// ---------------------------------------------------------------------------
async function mainParallel(buildId, workerCount, items, skippedRef) {
  const t0 = Date.now();

  // Wipe previous builds first so stale buildId dirs don't accumulate.
  rmSync(OUT, { recursive: true, force: true });
  const tmpDir = join(OUT, ".tmp-postings");
  mkdirSync(tmpDir, { recursive: true });

  const W = Math.min(workerCount, items.length);
  const chunkSize = Math.ceil(items.length / W);
  const jobs = [];
  for (let w = 0; w < W; w++) {
    const slice = items.slice(w * chunkSize, (w + 1) * chunkSize);
    if (!slice.length) break;
    const workerId = jobs.length;
    jobs.push(new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./build-search-index-worker.mjs", import.meta.url), {
        workerData: { items: slice, tmpDir, workerId, root: ROOT },
      });
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", (code) => {
        if (code !== 0) reject(new Error("search-index worker " + workerId + " exited with code " + code));
      });
    }));
  }
  const results = await Promise.all(jobs);

  // Assemble the global docs array in catalog order and compute each worker's
  // doc-index base (number of successfully indexed docs in earlier slices).
  const docs = [];
  const bases = [];
  let skipped = 0;
  let totalBytes = 0;
  for (const r of results) {
    bases.push(docs.length);
    skipped += r.skipped;
    totalBytes += r.totalBytes;
    for (const meta of r.metas) {
      if (meta) docs.push(meta);
    }
  }

  // PASS 2 — merge one shard at a time, reading each worker's temp file in
  // worker order so first-seen stem order and posting order match sequential.
  const dir = join(OUT, buildId, "terms");
  mkdirSync(dir, { recursive: true });
  let distinctTerms = 0;
  for (let i = 0; i < SHARD_COUNT; i++) {
    const obj = Object.create(null); // null proto: stems like "push" must not hit Object.prototype
    for (let w = 0; w < results.length; w++) {
      const path = join(tmpDir, i + "-w" + w + ".jsonl");
      if (!existsSync(path)) continue;
      const raw = readFileSync(path, "utf8");
      if (!raw) continue;
      const base = bases[w];
      const lines = raw.split("\n");
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        if (!line) continue;
        const parsed = JSON.parse(line);
        const stem = parsed[0], docIdx = parsed[1] + base, count = parsed[2];
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
  logSummary(docs.length, totalBytes, distinctTerms, secs, skipped, skippedRef);
}

function resolveWorkerCount() {
  const env = parseInt(process.env.SEARCH_INDEX_WORKERS || "", 10);
  if (Number.isFinite(env) && env >= 1) return env;
  return Math.max(1, Math.min(availableParallelism(), 8));
}

async function runMain() {
  const buildId =
    (process.env.CF_PAGES_COMMIT_SHA || "").slice(0, 12) ||
    `local-${Date.now().toString(36)}`;
  const workers = resolveWorkerCount();
  if (workers > 1) {
    // Pre-filter the indexable items (same filters as the sequential pass) so
    // the parallel path is only attempted when there is real work to split.
    const items = [];
    let skippedRef = 0;
    for (const a of artifacts) {
      const url = a.download_url || "";
      if (!url.startsWith("/tower-of-babel/") || !url.endsWith(".txt")) continue;
      if (REF_RE.test(url)) { skippedRef++; continue; }
      items.push(a);
    }
    if (items.length >= 2000) {
      try {
        await mainParallel(buildId, workers, items, skippedRef);
        return;
      } catch (err) {
        console.warn(`[search-index] parallel build failed (${(err && err.message) || err}); falling back to sequential.`);
      }
    }
  }
  mainSequential(buildId);
}

try {
  await runMain();
} catch (err) {
  failSafe(String((err && err.message) || err));
}
