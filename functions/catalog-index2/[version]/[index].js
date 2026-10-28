// Serves one Stage 2 index chunk: /catalog-index2/<version>/<i>.json
//
// The version segment is a cache-buster only (its value is not checked):
// the body is catalog index shard <i> from main, proxied through the edge
// cache and returned with immutable caching — a versioned URL's content
// never changes, so browsers may keep it for a year. New data produces a
// new version (see ../manifest.json.js) and therefore new URLs; the old
// ones simply stop being referenced.
//
// SHARD_COUNT must match the number of catalog-index shards in the repo.
// Keep in sync with functions/catalog-index.json.js and
// functions/catalog-index2/manifest.json.js.

const SHARD_COUNT = 25;
const RAW =
  "https://raw.githubusercontent.com/Joshuv-AI/antarctic-labs/main/public/catalog-index-shards";

export async function onRequest(context) {
  const seg = String(context.params.index || "").replace(/\.json$/, "");
  const i = Number(seg);
  if (!Number.isInteger(i) || i < 0 || i >= SHARD_COUNT) {
    return new Response("Not found", { status: 404 });
  }
  const url = `${RAW}/catalog-index-${String(i).padStart(2, "0")}.json`;
  let r;
  try {
    r = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!r.ok) return new Response("Not found", { status: 404 });
  return new Response(r.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
