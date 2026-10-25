// Deleted hubs sitemap — real HTTP 404, by design.
//
// This filename previously served /sitemap-hubs.xml (the Phase 2 hub
// urlset). It is intentionally recreated as a 404 function, not
// restored: the hub pages are gone, the sitemap-index no longer lists
// this sitemap, and the user ordered no redirects. Pages routing maps
// functions/sitemap-hubs.xml.js to /sitemap-hubs.xml, so this function
// intercepts that path before the SPA shell can be served for it.
// Plain-text body (a crawler asking for a sitemap must not receive
// something parseable as XML); no Location header; no-store.
export async function onRequest() {
  return new Response("Not found.\n", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
