// Apply per-route SEO metadata to the document. Called by the App on
// every navigation. Mutates <title>, <meta name="description">, the
// canonical link, Open Graph tags, and Twitter card tags. Leaves any
// tag that already has the desired value alone to minimize churn.
//
// This is a small, dependency-free helper — the spec says do not
// overbuild SEO infrastructure. The same metadata is also set
// statically in index.html so that the first paint and any
// crawler that doesn't run JavaScript still see canonical metadata.

import { metaFor } from "./content/routes.js";

const TAG_DEFS = [
  { attr: "name", key: "description",       selector: "meta[name='description']" },
  { attr: "property", key: "og:title",       selector: "meta[property='og:title']" },
  { attr: "property", key: "og:description", selector: "meta[property='og:description']" },
  { attr: "name", key: "twitter:title",       selector: "meta[name='twitter:title']" },
  { attr: "name", key: "twitter:description", selector: "meta[name='twitter:description']" },
];

export function applyMeta(path) {
  const meta = metaFor(path);

  // <title>
  if (document.title !== meta.title) {
    document.title = meta.title;
  }

  // Named / property meta tags
  for (const def of TAG_DEFS) {
    let el = document.head.querySelector(def.selector);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(def.attr, def.key);
      document.head.appendChild(el);
    }
    if (el.getAttribute("content") !== meta.description) {
      el.setAttribute("content", meta.description);
    }
  }

  // Canonical link
  let canonical = document.head.querySelector("link[rel='canonical']");
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  const canonicalHref = `https://antarctic-labs.com${path === "/" ? "/" : path}`;
  if (canonical.getAttribute("href") !== canonicalHref) {
    canonical.setAttribute("href", canonicalHref);
  }

  // og:url — kept in sync with canonical
  let ogUrl = document.head.querySelector("meta[property='og:url']");
  if (!ogUrl) {
    ogUrl = document.createElement("meta");
    ogUrl.setAttribute("property", "og:url");
    document.head.appendChild(ogUrl);
  }
  if (ogUrl.getAttribute("content") !== canonicalHref) {
    ogUrl.setAttribute("content", canonicalHref);
  }
}
