// Apply per-route SEO metadata to the document. Called by the App on
// every navigation. Mutates <title>, <meta name="description">, the
// canonical link, Open Graph tags, Twitter card tags, and (for routes
// that benefit) a JSON-LD <script> element. Leaves any tag that
// already has the desired value alone to minimize churn.
//
// This is a small, dependency-free helper — the spec says do not
// overbuild SEO infrastructure. The same metadata is also set
// statically in index.html so that the first paint and any
// crawler that doesn't run JavaScript still see canonical metadata.

import { metaFor } from "./content/routes.js";
import { site } from "./content/site.js";
import { operator } from "./content/operator.js";

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

  // og:type — per-route. Static index.html only declares "website"
  // for the homepage, so we update this in JS for the routes that
  // benefit from a more specific value (article for detail pages,
  // profile for /about).
  const isProjectDetail = path.startsWith("/projects/") && path.length > "/projects/".length;
  const isArtifactDetail = path.startsWith("/tower-of-babel/library/") && path.length > "/tower-of-babel/library/".length;
  const ogType = isProjectDetail || isArtifactDetail
    ? "article"
    : path === "/about"
    ? "profile"
    : "website";
  let ogTypeEl = document.head.querySelector("meta[property='og:type']");
  if (!ogTypeEl) {
    ogTypeEl = document.createElement("meta");
    ogTypeEl.setAttribute("property", "og:type");
    document.head.appendChild(ogTypeEl);
  }
  if (ogTypeEl.getAttribute("content") !== ogType) {
    ogTypeEl.setAttribute("content", ogType);
  }

  // JSON-LD structured data. Replaces any prior route-scoped script
  // tag we manage (id `seo-jsonld-route`) so navigation does not
  // accumulate stale schemas.
  upsertJsonLd(buildJsonLdForPath(path, canonicalHref));
}

// ----- JSON-LD helpers -----------------------------------------------------

const SITE_URL = site.url;
const ORG_NAME = site.brand;

// Build a Schema.org JSON-LD object appropriate for the current path.
// Only routes that benefit from structured data emit one; other
// routes clear the route-scoped script tag entirely.
function buildJsonLdForPath(path, canonicalHref) {
  if (path === "/") return organizationJsonLd(canonicalHref);
  if (path === "/about") return personJsonLd(canonicalHref);
  // Detail pages emit a BreadcrumbList to help crawlers understand
  // parent → child navigation.
  if (path.startsWith("/projects/") && path.length > "/projects/".length) {
    return breadcrumbJsonLd([
      { name: "HOME", url: SITE_URL + "/" },
      { name: "PROJECTS", url: SITE_URL + "/projects" },
      { name: "PROJECT", url: canonicalHref },
    ]);
  }
  if (path === "/tower-of-babel/library" ||
      (path.startsWith("/tower-of-babel/library/") && path.length > "/tower-of-babel/library/".length)) {
    return breadcrumbJsonLd([
      { name: "HOME", url: SITE_URL + "/" },
      { name: "TOWER OF BABEL", url: SITE_URL + "/tower-of-babel" },
      { name: "LIBRARY", url: SITE_URL + "/tower-of-babel/library" },
    ]);
  }
  return null;
}

function organizationJsonLd(url) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": SITE_URL + "/#organization",
    name: ORG_NAME,
    url: SITE_URL,
    logo: SITE_URL + "/favicon.svg",
    description: site.description,
    email: site.email,
    foundingLocation: {
      "@type": "Place",
      name: site.location,
    },
  };
}

function personJsonLd(url) {
  // Person schema for the operator profile on /about. Only fields
  // already present in src/content/operator.js + site.js are emitted.
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": SITE_URL + "/about#person",
    name: operator.name,
    url: url,
    worksFor: { "@id": SITE_URL + "/#organization" },
    jobTitle: "Founder",
    description: operator.positioning,
    knowsAbout: operator.whatWeDo.items.map((item) => item.title),
    homeLocation: {
      "@type": "Place",
      name: operator.location,
    },
    email: operator.email,
  };
}

function breadcrumbJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

function upsertJsonLd(data) {
  const id = "seo-jsonld-route";
  let script = document.head.querySelector(`script#${id}`);
  if (!data) {
    // No schema for this route — remove any stale one.
    if (script && script.parentNode) script.parentNode.removeChild(script);
    return;
  }
  if (!script) {
    script = document.createElement("script");
    script.id = id;
    script.setAttribute("type", "application/ld+json");
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}
