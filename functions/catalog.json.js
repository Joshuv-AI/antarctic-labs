// Serves /catalog.json — the full Tower of Babel catalog, sharded because a
// single public/catalog.json hit GitHub's 100 MiB per-file hard limit.
// Shards live at public/catalog-shards/catalog-00.json … catalog-NN.json in
// the repo (JSON arrays, concatenated in shard order = catalog order). This
// function fetches the shards in parallel from raw content, merges them into
// one JSON array, and serves it with the same short edge-cache TTL as before
// so new pushes show up within minutes. A missing shard is skipped — a
// partial catalog beats a 500.
//
// NOTE: the live shard count comes from public/catalog-shards/count.json,
// rewritten by the publish pipeline in the same commit as the shards
// (reshard auto-sizes N since 2026-10-30). SHARD_COUNT below is only the
// fallback when that fetch fails; a missing shard is skipped either way,
// so an overshooting count costs a few 404 fetches, never correctness.
// (Fallback 72 since 2026-10-30; was the exact count 35 before.)

const SHARD_COUNT = 72;
const COUNT_URL =
  "https://raw.githubusercontent.com/Joshuv-AI/antarctic-labs/main/public/catalog-shards/count.json";

async function liveShardCount() {
  try {
    const r = await fetch(COUNT_URL, {
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (!r.ok) return SHARD_COUNT;
    const data = await r.json();
    const n = data && data.catalog_shards;
    return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : SHARD_COUNT;
  } catch {
    return SHARD_COUNT;
  }
}
const shardUrl = (i) =>
  `https://raw.githubusercontent.com/Joshuv-AI/antarctic-labs/main/public/catalog-shards/catalog-${String(
    i
  ).padStart(2, "0")}.json`;

function stripBrackets(text) {
  const t = text.trim();
  if (t.length >= 2 && t[0] === "[" && t[t.length - 1] === "]") {
    return t.slice(1, -1).trim();
  }
  return t;
}

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  if (context.request.method === "GET") {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const shardCount = await liveShardCount();
  const settled = await Promise.all(
    Array.from({ length: shardCount }, (_, i) =>
      fetch(shardUrl(i), { cf: { cacheTtl: 300, cacheEverything: true } })
        .then((r) => (r.ok ? r : null))
        .catch(() => null)
    )
  );
  const shards = settled.filter(Boolean);
  if (shards.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  // Stream the merge: "[" + each shard's inner array text joined by "," + "]".
  // Only one shard's text is held in memory at a time, so this stays far
  // under the worker memory limit even as the catalog grows.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  (async () => {
    try {
      await writer.write(enc.encode("["));
      let first = true;
      for (const r of shards) {
        const inner = stripBrackets(await r.text());
        if (!inner) continue;
        if (!first) await writer.write(enc.encode(","));
        first = false;
        await writer.write(enc.encode(inner));
      }
      await writer.write(enc.encode("]"));
      await writer.close();
    } catch (err) {
      await writer.abort(err).catch(() => {});
    }
  })();

  const res = new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
  if (context.request.method === "GET") {
    context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  }
  return res;
}
