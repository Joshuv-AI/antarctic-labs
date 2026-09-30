// Generates public/sitemap.xml from the canonical route registry and
// project catalog. Runs on every build (see package.json "prebuild")
// so lastmod never goes stale and new pages are picked up automatically.
//
// Canonical pages only — legacy redirect aliases (/systems, /expeditions,
// /transmission, …) are intentionally excluded; they 301 to canonicals.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(here, "..");
const publicDir = join(siteRoot, "public");

const { routes } = await import("../src/content/routes.js");
const { expeditions } = await import("../src/content/expeditions.js");

const SITE = "https://antarctic-labs.com";
const today = new Date().toISOString().slice(0, 10);

// Per-page priority. The contact page is the conversion page for the
// freelance business — it outranks everything except the homepage.
const PRIORITY = {
  "/": "1.0",
  "/contact": "0.9",
  "/projects": "0.9",
  "/about": "0.8",
  "/government-contracting": "0.8",
  "/tower-of-babel": "0.7",
  "/tower-of-babel/library": "0.6",
  "/tower-of-babel/library/suggest": "0.4",
};
const PROJECT_DETAIL_PRIORITY = "0.8";

const urls = [];

// Canonical literal routes (skip dynamic :id patterns and legacy aliases).
for (const pattern of routes) {
  if (pattern.includes(":")) continue;
  if (
    ["/systems", "/expeditions", "/the-lab", "/government",
     "/history", "/operator", "/field-interests", "/transmission"].includes(pattern)
  ) continue;
  urls.push({
    loc: `${SITE}${pattern === "/" ? "/" : pattern}`,
    priority: PRIORITY[pattern] ?? "0.5",
  });
}

// Project detail pages — one per expedition id.
for (const exp of expeditions) {
  if (!exp || !exp.id) continue;
  urls.push({
    loc: `${SITE}/projects/${exp.id}`,
    priority: PROJECT_DETAIL_PRIORITY,
  });
}

const body = urls
  .map(
    (u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
  )
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

writeFileSync(join(publicDir, "sitemap.xml"), xml);
console.log(`sitemap.xml written: ${urls.length} urls, lastmod ${today}`);
