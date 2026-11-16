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
//
// ENCODING (2026-11-15 panel fix, round 4): the body must leave this
// function as the stored .br bytes under a single "br" label. Three
// production-verified rounds established what the defect is NOT:
// round 1 (identity Accept-Encoding on the subrequest), round 2 (an
// upstream cache-bust, exonerating every cache layer on
// guaranteed-cold paths), round 3 (no cf cache options on the
// subrequest + "no-transform" on the response) — the body still left
// double-encoded every time, and round 3's diagnostics proved the
// subrequest delivers the .br bytes identity (X-Tcb1-Upstream-
// Encoding: none). The extra layer is the Workers platform itself:
// a Response built from a fetched body stream is treated as decoded
// content, and when it declares a Content-Encoding the platform
// encodes it once more to make the label true. The documented
// countermeasure is the Response constructor's encodeBody option:
// "manual" declares the body already encoded, so the platform passes
// it through untouched. That is the round-4 fix, below. The Cache
// API scheme rotates to "enc5": every earlier scheme holds
// double-encoded bodies and must never be served again.
const REPO = "Joshuv-AI/antarctic-labs";
const FILE_RE = /^(dict\.bin|curated\.bin|shard-\d{4}\.tcb)$/;
const FP_RE = /^[0-9a-f]{64}$/;

function repoFileUrl(env, file) {
  const sha = (env && env.CF_PAGES_COMMIT_SHA) || "main";
  // The "?enc=3" query keeps the subrequest URL distinct from every
  // URL the pre-fix code fetched: the origin ignores it; any cache
  // key along the path does not.
  return `https://raw.githubusercontent.com/${REPO}/${sha}/tcb1-data/${file}.br?enc=3`;
}

export async function onRequest(context) {
  const { params, env, request } = context;
  const fp = params.fingerprint;
  const file = params.file;
  if (!FP_RE.test(fp || "") || !FILE_RE.test(file || "")) {
    return new Response("Not found", { status: 404 });
  }

  // A caller may version a file whose content changed without a new
  // dataset fingerprint — the curated bitsets, whose membership is a
  // taxonomy, not catalog data (2026-11-15 collections package). The
  // client passes ?v=<the file's manifest sha256>; the version joins
  // the cache key so the immutable edge copy can never serve the
  // previous taxonomy under the new manifest. Only a hex version is
  // honored, and only into the key — the upstream file is unchanged.
  const reqUrl = new URL(request.url);
  const v = reqUrl.searchParams.get("v");
  const versioned = v && /^[0-9a-f]{16,64}$/.test(v) ? `?v=${v}` : "";
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(`/tcb1-enc5/${fp}/${file}${versioned}`, request.url).toString(),
    { method: "GET" }
  );
  if (request.method === "GET") {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  let upstream;
  try {
    upstream = await fetch(repoFileUrl(env, file), {
      // Identity, per the ENCODING note above: the stored .br bytes
      // must arrive raw so the one Content-Encoding: br label on the
      // response is the only encoding layer. No cf cache options
      // (round 3): the cacheEverything path is part of the encoding
      // path under investigation and the origin's own short-lived
      // cache headers are enough — this function's Cache API below
      // provides the long-lived edge copy.
      headers: { "Accept-Encoding": "identity" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("Not found", { status: 404 });
  }

  const res = new Response(upstream.body, {
    // encodeBody "manual" (round 4, see ENCODING note): the body is
    // already brotli-encoded exactly once — the platform must not
    // encode it again on the way out.
    encodeBody: "manual",
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "br",
      // no-transform (round 3): the body is already encoded exactly
      // once; no downstream layer may encode it again.
      "Cache-Control": "public, max-age=31536000, immutable, no-transform",
      "X-Content-Type-Options": "nosniff",
      // Diagnostics (round 3): what the upstream subrequest actually
      // delivered to this function, observable from outside.
      "X-Tcb1-Upstream-Encoding": upstream.headers.get("content-encoding") || "none",
      "X-Tcb1-Upstream-Type": upstream.headers.get("content-type") || "none",
    },
  });
  if (request.method === "GET") {
    context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  }
  return res;
}
