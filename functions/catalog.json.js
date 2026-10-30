// Serves /catalog.json — the full Tower of Babel catalog, sharded because a
// single public/catalog.json hit GitHub's 100 MiB per-file hard limit.
// Shards live at public/catalog-shards/catalog-00.json … catalog-NN.json in
// the repo (JSON arrays, concatenated in shard order = catalog order). This
// function fetches the shards in parallel from raw content, merges them into
// one JSON array, and serves it with the same short edge-cache TTL as before
// so new pushes show up within minutes. A missing shard is skipped — a
// partial catalog beats a 500.
//
// NOTE: SHARD_COUNT must match the number of shard files in the repo. If a
// future batch adds another shard, bump this constant in the same commit.
// (35 since the 2026-10-30 re-shard; was 25.)

const SHARD_COUNT = 35;
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

  const settled = await Promise.all(
    Array.from({ length: SHARD_COUNT }, (_, i) =>
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
