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

import { metaFor, matchRoute } from "./content/routes.js";
import { site } from "./content/site.js";
import { operator } from "./content/operator.js";
import { expeditions } from "./content/expeditions.js";
// Entry JSON-LD uses the cached catalog when available (see
// ./lib/catalog.js); falls back to a generic entry node until it arrives.
import { getCachedArtifacts } from "./lib/catalog.js";

const TAG_DEFS = [
  { attr: "name", key: "description", selector: "meta[name='description']", field: "description" },
  { attr: "property", key: "og:title", selector: "meta[property='og:title']", field: "title" },
  { attr: "property", key: "og:description", selector: "meta[property='og:description']", field: "description" },
  { attr: "name", key: "twitter:title", selector: "meta[name='twitter:title']", field: "title" },
  { attr: "name", key: "twitter:description", selector: "meta[name='twitter:description']", field: "description" },
];

export function applyMeta(path) {
  const meta = metaFor(path);

  // <title>
  if (document.title !== meta.title) {
    document.title = meta.title;
  }

  // Named / property meta tags. Title tags take meta.title, description
  // tags take meta.description.
  for (const def of TAG_DEFS) {
    let el = document.head.querySelector(def.selector);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(def.attr, def.key);
      document.head.appendChild(el);
    }
    const want = meta[def.field];
    if (el.getAttribute("content") !== want) {
      el.setAttribute("content", want);
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
  if (path === "/") return homeJsonLd(canonicalHref);
  if (path === "/about") return personJsonLd(canonicalHref);
  if (path === "/tower-of-babel/library") {
    return breadcrumbJsonLd([
      { name: "HOME", url: SITE_URL + "/" },
      { name: "TOWER OF BABEL", url: SITE_URL + "/tower-of-babel" },
      { name: "LIBRARY", url: canonicalHref },
    ]);
  }
  if (path === "/tower-of-babel/library/suggest") {
    return breadcrumbJsonLd([
      { name: "HOME", url: SITE_URL + "/" },
      { name: "TOWER OF BABEL", url: SITE_URL + "/tower-of-babel" },
      { name: "LIBRARY", url: SITE_URL + "/tower-of-babel/library" },
      { name: "SUGGEST", url: canonicalHref },
    ]);
  }
  const match = matchRoute(path);
  // matchRoute returns a string for literal matches and
  // { pattern, params } for dynamic ones.
  if (match && typeof match === "object") {
    if (match.pattern === "/projects/:id") {
      const exp = expeditions.find((e) => e.id === match.params.id);
      const crumb = breadcrumbJsonLd([
        { name: "HOME", url: SITE_URL + "/" },
        { name: "PROJECTS", url: SITE_URL + "/projects" },
        // W6 fix (2026-10-01): guard against null/undefined titles. A malformed
        // record would throw inside useEffect and unmount the entire React tree.
        { name: exp ? String(exp.title ?? "PROJECT").toUpperCase() : "PROJECT", url: canonicalHref },
      ]);
      if (!exp) return crumb;
      // Project detail pages emit a CreativeWork node so Google
      // understands each page as a distinct portfolio piece.
      const work = {
        "@type": "CreativeWork",
        name: exp.title,
        url: canonicalHref,
        author: { "@id": SITE_URL + "/#organization" },
      };
      if (exp.shortDescription) work.description = exp.shortDescription;
      return { "@context": "https://schema.org", "@graph": [crumb, work] };
    }
    if (match.pattern === "/tower-of-babel/library/:id") {
      const artifacts = getCachedArtifacts();
      const art = artifacts
        ? artifacts.find((a) => a.artifact_id === match.params.id)
        : null;
      const crumb = breadcrumbJsonLd([
        { name: "HOME", url: SITE_URL + "/" },
        { name: "TOWER OF BABEL", url: SITE_URL + "/tower-of-babel" },
        { name: "LIBRARY", url: SITE_URL + "/tower-of-babel/library" },
        { name: art ? String(art.title ?? "ENTRY").toUpperCase() : "ENTRY", url: canonicalHref },
      ]);
      if (!art) return crumb;
      // Library entries emit a Book node — the structured-data
      // counterpart of the free-library keyword targeting, and
      // eligible for book rich results.
      const book = {
        "@type": "Book",
        name: art.title,
        url: canonicalHref,
      };
      if (art.creator) book.author = { "@type": "Person", name: art.creator };
      if (art.year) book.datePublished = String(art.year);
      if (art.description) book.description = art.description;
      return { "@context": "https://schema.org", "@graph": [crumb, book] };
    }
  }
  return null;
}

function homeJsonLd(url) {
  // Homepage emits an @graph: the Organization, the WebSite, and a
  // ProfessionalService node describing the freelance services offered.
  // The service node is the structured-data counterpart of the
  // hire-intent keyword targeting (freelance AI developer, n8n expert…).
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationJsonLd(url),
      {
        "@type": "WebSite",
        "@id": SITE_URL + "/#website",
        url: SITE_URL + "/",
        name: ORG_NAME,
        publisher: { "@id": SITE_URL + "/#organization" },
      },
      {
        "@type": "ProfessionalService",
        "@id": SITE_URL + "/#service",
        name: "Antarctic Labs — Freelance AI Automation & Web Development",
        url: SITE_URL + "/",
        provider: { "@id": SITE_URL + "/#organization" },
        areaServed: "Worldwide",
        description: site.description,
        serviceType: [
          "AI automation",
          "n8n workflow automation",
          "AI agent development",
          "Web development",
          "Web scraping & data extraction",
          "Lead generation",
          "API & systems integration",
        ],
      },
    ],
  };
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
    knowsAbout: ["AI automation", "Web scraping & data", "Lead-generation systems", "Web development"],
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
