// Deleted hub subpaths — real HTTP 404, by design.
//
// Catch-all for every path under /tower-of-babel/hubs/ (traditions,
// authors, declassified programmes, course-primary-sources, and any
// other depth), paired with functions/tower-of-babel/hubs.js for the
// bare index path. Same rules as that file: no context.next(), no
// redirect, no link in the body, no-store so a future reuse of any of
// these paths can never be shadowed by a cached 404.
// Pages file-based routing: [[path]].js matches all segments below
// /tower-of-babel/hubs/ at any depth. It cannot match anything outside
// that branch, so /tower-of-babel, /tower-of-babel/library/*, /oai,
// and every other route are untouched.
export async function onRequest() {
  return new Response(
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="robots" content="noindex" />\n<title>404 Not Found</title>\n</head>\n<body>\n<h1>Not found</h1>\n<p>This page no longer exists.</p>\n</body>\n</html>\n`,
    {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    }
  );
}
