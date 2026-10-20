// Worker for scripts/build-search-index.mjs (parallel pass 1).
//
// Processes a contiguous slice of catalog items: reads each text, stems and
// counts its terms, and streams postings to per-shard temp files using LOCAL
// doc indices (0-based within this worker's successful docs). The main thread
// remaps local -> global doc indices during the merge pass, so the final
// index is byte-identical to the sequential build.
//
// Temp files: .tmp-postings/<shard>-w<workerId>.jsonl, lines of
// [stem, localDocIdx, count] JSON — same format the sequential pass writes.
// Writes are buffered per shard and flushed in ~512KB chunks: the sequential
// version's per-doc open/append/close per shard cost millions of syscalls.
import { readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { workerData, parentPort } from "node:worker_threads";
import { analyze, shardFor, SHARD_COUNT } from "../src/lib/search-text.js";

const { items, tmpDir, workerId, root } = workerData;
const FLUSH_BYTES = 512 * 1024;
const STEM_CACHE_CAP = 200000; // same bound as the sequential pass

function run() {
  const stemCache = new Map();
  const buffers = new Map(); // shardIdx -> { text, bytes }
  const metas = []; // per input item: doc metadata, or null when skipped
  let skipped = 0;
  let totalBytes = 0;
  let localCount = 0;

  function flush(si) {
    const b = buffers.get(si);
    if (!b || !b.text) return;
    appendFileSync(join(tmpDir, si + "-w" + workerId + ".jsonl"), b.text);
    b.text = "";
    b.bytes = 0;
  }

  for (const a of items) {
    const url = a.download_url || "";
    let text;
    try {
      text = readFileSync(join(root, "public", url), "utf8");
    } catch {
      skipped++;
      metas.push(null);
      continue;
    }
    totalBytes += text.length;
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
      words: [...counts.values()].reduce((s, c) => s + c, 0),
    });
    const bufs = new Map(); // shardIdx -> lines for this doc
    for (const [stem, count] of counts) {
      const si = shardFor(stem, SHARD_COUNT);
      let b = bufs.get(si);
      if (!b) { b = []; bufs.set(si, b); }
      b.push(JSON.stringify([stem, localIdx, count]));
    }
    for (const [si, b] of bufs) {
      let buf = buffers.get(si);
      if (!buf) { buf = { text: "", bytes: 0 }; buffers.set(si, buf); }
      const chunk = b.join("\n") + "\n";
      buf.text += chunk;
      buf.bytes += chunk.length;
      if (buf.bytes >= FLUSH_BYTES) flush(si);
    }
  }
  for (const si of buffers.keys()) flush(si);

  parentPort.postMessage({ metas, skipped, totalBytes });
}

run();
