// Stage 2 index chunk loader (2026-10-23): fetches and JSON-parses the
// versioned catalog-index chunks OFF the main thread, so the multi-MB
// parse that used to freeze the Tower page never touches the UI thread.
//
// Protocol — main posts once: { version, chunks }
// Worker posts back:
//   { type: "chunk", index, records }  for each chunk, as it completes
//   { type: "done" }                   when every chunk was posted
//   { type: "error", message }         when a chunk failed twice (fatal:
//                                      the main thread takes over the
//                                      remaining chunks / falls back)
// Each chunk fetch gets one retry, mirroring the main-thread loaders'
// failure semantics. Concurrency window: 4.
// Per-chunk deadline. Chunks are ~20 MB each: the original 30 s cap
// silently killed the whole index load on phone connections, where a
// chunk routinely needs 40-60 s (four chunks share the link) — the
// library then sat on the 20,000-record bootstrap forever with no
// error shown (Joshua's report, 2026-10-30). 240 s only fails a chunk
// that has truly stalled.
const FETCH_TIMEOUT_MS = 240000;
let started = false;

self.onmessage = (e) => {
  if (started) return;
  started = true;
  run(e.data || {}).catch((err) => {
    self.postMessage({ type: "error", message: String(err) });
  });
};

async function fetchChunk(version, i) {
  const url = `/catalog-index2/${version}/${i}.json`;
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`fetch failed: ${url} ${r.status}`);
      return await r.json();
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

async function run({ version, chunks }) {
  if (!version || !Number.isInteger(chunks) || chunks < 1) {
    self.postMessage({ type: "error", message: "bad chunk job" });
    return;
  }
  let next = 0;
  const lanes = Array.from(
    { length: Math.min(4, chunks) },
    async () => {
      while (next < chunks) {
        const i = next++;
        const records = await fetchChunk(version, i);
        self.postMessage({ type: "chunk", index: i, records });
      }
    }
  );
  await Promise.all(lanes);
  self.postMessage({ type: "done" });
}
