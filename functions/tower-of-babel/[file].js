// Serves /tower-of-babel/<file>.txt — the Tower of Babel hosted texts.
//
// The TXT files live in the Joshuv-AI/antarctic-labs-texts repo under
// public/tower-of-babel/ (moved out of the main repo on 2026-10-16: 115k+ files
// made the main repo 8 GiB and pushed Cloudflare Pages builds past the
// 20-minute limit). This function proxies them from that repo's raw
// content, with edge caching so GitHub is only hit on the first request
// for each text.

const ORIGIN =
  "https://raw.githubusercontent.com/Joshuv-AI/antarctic-labs-texts/main/public/tower-of-babel/";

// Texts added from 2026-11 live in hash buckets <first char>/<sha1[:2]>/
// because the flat directory's git tree object passed GitHub's 50 MiB
// non-blob object size limit. Try the bucket path first, then flat.
async function bucketPrefix(file) {
  const digest = await crypto.subtle.digest(
    "SHA-1", new TextEncoder().encode(file));
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return file[0] + "/" + hex.slice(0, 2) + "/";
}

export async function onRequest(context) {
  let file = context.params.file || "";
  try {
    file = decodeURIComponent(file);
  } catch {
    /* keep the raw param */
  }
  // Only *.txt names belong to this function. Any other single-segment
  // path under /tower-of-babel/ is an app route (e.g. /tower-of-babel/library)
  // — fall through to the normal Pages asset handling so the SPA shell
  // serves instead of a hard 404.
  if (!file.endsWith(".txt")) {
    return context.next();
  }
  // Flat directory of generated names only — reject traversal outright.
  // (Names are mostly ASCII slugs, but a few legitimately contain accented
  // letters, e.g. sima-qian-...-tome-cinquième.txt — allow any name that
  // cannot traverse out of the flat directory.)
  if (file.includes("/") || file.includes("\\") || file.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  if (context.request.method === "GET") {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const fetchOpts = { cf: { cacheTtl: 86400, cacheEverything: true } };
  let upstream = await fetch(
    ORIGIN + (await bucketPrefix(file)) + encodeURIComponent(file),
    fetchOpts);
  if (!upstream.ok) {
    upstream = await fetch(ORIGIN + encodeURIComponent(file), fetchOpts);
  }
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
