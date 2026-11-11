// Site-wide request middleware (2026-11-03, AdSense fix).
//
// Three jobs, all fail-open: any error falls through to the normal
// pipeline (context.next()), so this file can never take the site down.
//
// 1. Crawler renderings of the main routes. The SPA shell is a loading
//    screen to any reader that does not run the app, which is exactly
//    what Google's ad review cited ("ads on screens without
//    publisher-content", "low value content"). For known crawler /
//    reviewer user agents (the BOT_UA gate in _lib/tower-catalog.js,
//    which now includes AdsBot and Mediapartners-Google), the main
//    routes answer with the server-rendered pages in
//    _lib/static-pages.js. Humans always get the SPA.
//
// 2. Legacy routes redirect at the server (301) to their canonical
//    targets — the same map the SPA applies client-side
//    (src/content/routes.js routeMetaLegacy).
//
// 3. Unknown extensionless paths get a real 404 (content-bearing, no
//    ad code) instead of the SPA shell at 200. Only paths that match
//    no route, no function surface, and no file extension reach it;
//    every known surface is passed through first.

import { isCrawler } from "./_lib/tower-catalog.js";
import { staticPageFor, notFoundPage } from "./_lib/static-pages.js";

const LEGACY_REDIRECTS = {
  "/systems": "/",
  "/government": "/government-contracting",
  "/history": "/about",
  "/operator": "/about",
  "/field-interests": "/about",
};

// Function / data surfaces that must always pass through untouched.
const PASS_PREFIXES = [
  "/api/",
  "/tower-of-babel/",
  "/catalog",
  "/sitemap",
  "/search-index",
  "/work-locate",
  "/assets/",
];

const PASS_EXACT = new Set([
  "/oai",
  "/mcp",
  // Google Search Console verification file: Pages 308-redirects the
  // .html form to this extensionless path, which must reach the asset —
  // without the exemption the 404 rule below answers instead and file
  // verification fails (found 2026-11-10).
  "/googled4282c0396493fc7",
  "/robots.txt",
  "/ads.txt",
  "/llms.txt",
  "/favicon.svg",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/BingSiteAuth.xml",
  "/tower-hubs-index.json",
  "/tower-reader-bg.jpg",
  "/tower-reader-bg-landscape.jpg",
  "/tower-reader-bg-portrait.jpg",
]);

export async function onRequest(context) {
  try {
    const { request } = context;
    const url = new URL(request.url);
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

    // 2. Legacy redirects (all user agents, GET/HEAD only).
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      LEGACY_REDIRECTS[path]
    ) {
      return Response.redirect(url.origin + LEGACY_REDIRECTS[path], 301);
    }

    // Hyphen-form sitemap URLs (a common guess) redirect to the real
    // slash-form entry sitemaps instead of falling through to the SPA
    // shell at 200 (found 2026-11-10).
    const smHyphen = path.match(/^\/sitemap-entries-(\d+)\.xml$/);
    if (
      smHyphen &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      return Response.redirect(
        url.origin + "/sitemap-entries/" + smHyphen[1] + ".xml",
        301
      );
    }

    // 1. Crawler renderings of the main routes.
    const html = staticPageFor(path);
    if (html) {
      if (isCrawler(request)) {
        return new Response(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      }
      return context.next();
    }

    // 3. Real 404 for unknown extensionless paths.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return context.next();
    }
    if (path.includes(".")) return context.next();
    if (PASS_EXACT.has(path)) return context.next();
    if (PASS_PREFIXES.some((p) => path.startsWith(p))) {
      return context.next();
    }
    return new Response(notFoundPage(path), {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return context.next();
  }
}
