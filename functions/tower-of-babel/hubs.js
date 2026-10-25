// Deleted hub index — real HTTP 404, by design.
//
// The Phase 2 hub pages (/tower-of-babel/hubs and everything under it)
// were deleted in commit c561b29 and replaced by the Collections filter
// on the main Tower page. The user ordered NO redirects and true
// deletion. This function exists because Cloudflare Pages serves the
// SPA shell (dist/index.html, 200) for every unmatched path on this
// site — including pure nonsense paths — so deleting the old function
// files alone left the dead URLs answering 200. Pages Functions routes
// are evaluated before static serving, so a function on the exact
// deleted path intercepts the request before the shell can be served.
// Do NOT call context.next() here: that would fall through to the shell
// and restore the 200. Do NOT redirect: the body is a plain not-found
// page with no link and no Location header.
// Cache-Control: no-store, so a future reuse of this path can never be
// shadowed by a cached 404.
export async function onRequest() {
  return new Response(
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="robots" content="noindex" />\n<title>404 Not Found</title>\n</head>\n<body>\n<h1>Not found</h1>\n<p>This page no longer exists.</p>\n</body>\n</html>\n`,
    {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    }
  );
}
