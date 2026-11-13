// Serves /tcb1/<fingerprint>/<file> — the TCB1 binary browse
// dataset files (Phase 2A, FILTER-REVAMP-DESIGN.md §12): the global
// dictionary (dict.bin), the curated bitsets (curated.bin) and the
// 128 columnar shards (shard-NNNN.tcb).
//
// The dataset lives in the repo at tcb1-data/ as Brotli-q11 files
// (<file>.br) — never as static assets (dict.bin is 105 MB raw /
// 36.7 MB compressed, over every Pages asset limit; the directory is
// outside public/, so it never enters dist/ at all). This function
// streams the compressed bytes from the repo at the DEPLOYED commit
// and labels them Content-Encoding: br, so the client's fetch
// inflates natively and the worker reads the raw TCB1 bytes — the
// stored bytes ARE the wire bytes. Responses are fingerprinted and
// immutable: the fingerprint segment versions the URL, and the
// Cache API copy at each colo makes repeat reads edge-local.
//
// The client verifies every file against the manifest's sha256
// after inflation, so a wrong or truncated body can never reach
// the decoder.
const REPO = "Joshuv-AI/antarctic-labs";
const FILE_RE = /^(dict\.bin|curated\.bin|shard-\d{4}\.tcb)$/;
const FP_RE = /^[0-9a-f]{64}$/;

function repoFileUrl(env, file) {
  const sha = (env && env.CF_PAGES_COMMIT_SHA) || "main";
  return `https://raw.githubusercontent.com/${REPO}/${sha}/tcb1-data/${file}.br`;
}

export async function onRequest(context) {
  const { params, env, request } = context;
  const fp = params.fingerprint;
  const file = params.file;
  if (!FP_RE.test(fp || "") || !FILE_RE.test(file || "")) {
    return new Response("Not found", { status: 404 });
  }

  const cache = caches.default;
  const cacheKey = new Request(
    new URL(`/tcb1/${fp}/${file}`, request.url).toString(),
    { method: "GET" }
  );
  if (request.method === "GET") {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  let upstream;
  try {
    upstream = await fetch(repoFileUrl(env, file), {
      cf: { cacheTtl: 31536000, cacheEverything: true },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("Not found", { status: 404 });
  }

  const res = new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "br",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
  if (request.method === "GET") {
    context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  }
  return res;
}
