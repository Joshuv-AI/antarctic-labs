// Serves /tower-of-babel/<file>.txt — the Tower of Babel hosted texts.
//
// The TXT files live in the Joshuv-AI/antarctic-labs-texts repo under
// tower-of-babel/ (moved out of the main repo on 2026-10-16: 115k+ files
// made the main repo 8 GiB and pushed Cloudflare Pages builds past the
// 20-minute limit). This function proxies them from that repo's raw
// content, with edge caching so GitHub is only hit on the first request
// for each text.

const ORIGIN =
  "https://raw.githubusercontent.com/Joshuv-AI/antarctic-labs-texts/main/tower-of-babel/";

export async function onRequest(context) {
  let file = context.params.file || "";
  try {
    file = decodeURIComponent(file);
  } catch {
    /* keep the raw param */
  }
  // Flat directory of generated names only — reject anything else outright.
  // (Names are mostly ASCII slugs, but a few legitimately contain accented
  // letters, e.g. sima-qian-...-tome-cinquième.txt — allow any name that
  // cannot traverse out of the flat directory.)
  if (
    !file.endsWith(".txt") ||
    file.includes("/") ||
    file.includes("\\") ||
    file.includes("..")
  ) {
    return new Response("Not found", { status: 404 });
  }

  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  if (context.request.method === "GET") {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const upstream = await fetch(ORIGIN + encodeURIComponent(file), {
    cf: { cacheTtl: 86400, cacheEverything: true },
  });
  if (!upstream.ok) {
    return new Response("Not found", { status: 404 });
  }

  const res = new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
  if (context.request.method === "GET") {
    context.waitUntil(cache.put(cacheKey, res.clone()));
  }
  return res;
}
