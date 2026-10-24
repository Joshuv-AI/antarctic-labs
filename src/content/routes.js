// Centralized route registry. Each route declares the destinations it
// owns (literal + dynamic patterns) and the SEO metadata that should
// be applied when that route is active. The App's render layer
// consumes this list to decide which page shell to mount.
//
// Per the Stage A spec, no new routing library is introduced — the
// existing pushState + popstate pattern in main.jsx is preserved and
// extended.
//
// Canonical site IA:
// HOME, TOWER OF BABEL, GOVERNMENT, ABOUT.
//
// Old routes remain as backward-compatibility aliases where useful.
// Retired 2026-10-23: the Contact page was deleted outright, and
// every alias that redirected into it was removed with it.
import { site } from "./site.js";
// The artifact catalog is lazy (see ../../lib/catalog.js) — route metadata
// must stay synchronous, so entry pages use the cached array when available
// and fall back to generic Tower meta until the catalog arrives (the entry
// component re-applies meta once it loads).
import { getCachedArtifacts } from "../lib/catalog.js";
const DEFAULT_DESCRIPTION = site.description;
const SITE_NAME = site.brand;
// Per-page SEO: every canonical route carries keyword-targeted metadata
// aimed at the obvious simple searches for its sector. Service pages
// (home, about) target hire-intent freelance searches
// — client acquisition is the site's main goal. Tower of Babel pages
// target free-library/archive searches for authority and traffic.
// Titles stay near ~60 chars, descriptions near ~155, keyword up front.
export const routeMeta = {
  "/": {
    title: `Proprietary Trading & Computing | ${SITE_NAME}`,
    description:
      "Antarctic Labs is a proprietary trading and computing firm building its own data center in the Philippines. Our capital, our hardware, our systems. Not for hire.",
  },
  "/services/ai-automation": {
    title: `AI Automation Services for Small Business | Antarctic Labs`,
    description:
      "AI automation services for small business: n8n workflows, AI agents, and data pipelines built by a freelance developer. Free quote within 24 hours.",
  },
  "/services/n8n-workflows": {
    title: `n8n Workflow Automation Developer | Antarctic Labs`,
    description:
      "Hire an n8n developer: custom n8n workflow automation, API integrations, AI steps, debugging, and self-hosted setup. Free quote within 24 hours.",
  },
  "/services/ai-agents": {
    title: `AI Agent Development for Business | Antarctic Labs`,
    description:
      "Custom AI agent development: support agents, RAG knowledge bases, and workflow agents built by a freelance developer. Free quote within 24 hours.",
  },
  "/services/web-development": {
    title: `Freelance Web Developer for Hire | Antarctic Labs`,
    description:
      "Freelance web developer: fast custom websites, landing pages, redesigns, and web apps. Direct communication, fixed quotes. Free quote within 24 hours.",
  },
  "/services/web-scraping": {
    title: `Web Scraping Services | Data Extraction | Antarctic Labs`,
    description:
      "Web scraping services: clean structured data from public websites, delivered in Excel or CSV. Anti-bot handling, scheduled runs. Free quote in 24 hours.",
  },
  "/services/lead-generation": {
    title: `Lead Generation Automation Systems | Antarctic Labs`,
    description:
      "Lead generation automation: systems that source, enrich, and qualify B2B prospects on autopilot. Built by a freelance developer. Free quote in 24 hours.",
  },
  "/tower-of-babel": {
    title: `Free Online Library | Tower of Babel`,
    description:
      "A free, searchable online library: more than 375,000 books, sacred texts, declassified documents, papers, and transcripts preserved in clean, readable text.",
  },
  "/tower-of-babel/library": {
    title: `Free Classic Books Online | Tower of Babel Library`,
    description:
      "Read free classic books online: search more than 375,000 books, documents, and texts in the Tower of Babel's free library catalog. No sign-up.",
  },
  "/tower-of-babel/api": {
    title: `Free Books API for AI Agents | Tower of Babel`,
    description:
      "Free books API for AI agents: machine-readable catalog of more than 375,000 works (books, sacred texts, declassified documents, papers, transcripts) with plain-text .txt downloads where text is present. No key, no sign-up.",
  },
  "/tower-of-babel/library/suggest": {
    title: `Suggest a Book for the Free Online Library | Tower of Babel`,
    description:
      "Suggest a book, document, or text for the Tower of Babel free online library. Every suggestion is reviewed; accepted works are preserved in clean text.",
  },
  "/government-contracting": {
    title: `Small Business Government Contracting | ${SITE_NAME}`,
    description:
      "Antarctic Labs is developing toward public-sector work: AI analyst workflows, data systems, and automation for primes — pilots, SBIR/STTR, and teaming.",
  },
  "/about": {
    title: `The Firm | ${SITE_NAME}`,
    description:
      "About Antarctic Labs: a proprietary trading and computing firm. Operations in the United States, infrastructure in the Philippines. No client work.",
  },
};
// Old routes kept for SEO/canonicalization purposes only.
//
// The other historical routes remain unchanged.
// Retired 2026-10-21: the Projects pages were
// deleted outright, and every alias that redirected into them
// was removed with them.
export const routeMetaLegacy = {
  "/systems": {
    title: `Systems — ${SITE_NAME}`,
    description: DEFAULT_DESCRIPTION,
    redirect: "/",
  },
  "/government": {
    title: `Government Contracting — ${SITE_NAME}`,
    description: `Government contracting and public sector information. ${DEFAULT_DESCRIPTION}`,
    redirect: "/government-contracting",
  },
  "/history": {
    title: `About — ${SITE_NAME}`,
    description: DEFAULT_DESCRIPTION,
    redirect: "/about",
  },
  "/operator": {
    title: `About — ${SITE_NAME}`,
    description: DEFAULT_DESCRIPTION,
    redirect: "/about",
  },
  "/field-interests": {
    title: `About — ${SITE_NAME}`,
    description: DEFAULT_DESCRIPTION,
    redirect: "/about",
  },
};
// The full list of literal + dynamic patterns that the App should
// recognize.
//
export const routes = [
  "/",
  "/services/ai-automation",
  "/services/n8n-workflows",
  "/services/ai-agents",
  "/services/web-development",
  "/services/web-scraping",
  "/services/lead-generation",
  "/tower-of-babel",
  "/tower-of-babel/api",
  "/tower-of-babel/library",
  // Literal suggest route must precede the dynamic :id pattern so
  // matchRoute resolves it as its own page, not an artifact id.
  "/tower-of-babel/library/suggest",
  "/tower-of-babel/library/:id",
  "/government-contracting",
  "/about",
  // Legacy patterns preserved for backward compatibility.
  "/systems",
  "/history",
  "/operator",
  "/field-interests",
];
// Map any legacy path to its canonical redirect target.
export function legacyRedirect(path) {
  if (path in routeMetaLegacy) {
    return routeMetaLegacy[path].redirect;
  }
  // Retired 2026-10-18: the full-text reader was merged into the entry
  // page, so /tower-of-babel/library/:id/text now lands on the entry
  // itself (which renders the full text below the catalog record).
  // Matches exactly one path segment between /library/ and /text.
  {
    const m = path.match(/^\/tower-of-babel\/library\/([^/]+)\/text$/);
    if (m) return `/tower-of-babel/library/${m[1]}`;
  }
  return null;
}
// Match a runtime path to a route pattern.
// Supports a single :id segment per route.
export function matchRoute(path) {
  for (const pattern of routes) {
    if (!pattern.includes(":")) {
      if (pattern === path) return pattern;
      continue;
    }
    const patternParts = pattern.split("/");
    const pathParts = path.split("/");
    if (patternParts.length !== pathParts.length) {
      continue;
    }
    let matched = true;
    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
      const pp = patternParts[i];
      const cp = pathParts[i];
      if (pp.startsWith(":")) {
        params[pp.slice(1)] = decodeURIComponent(cp);
      } else if (pp !== cp) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return {
        pattern,
        params,
      };
    }
  }
  return null;
}
// Resolve the SEO metadata for a runtime path.
//
// Falls back to a generic Antarctic Labs title.
// Legacy metadata is retained so an old URL can still be understood
// before the runtime redirect completes.
export function metaFor(path) {
  if (routeMeta[path]) {
    return routeMeta[path];
  }
  if (routeMetaLegacy[path]) {
    return routeMetaLegacy[path];
  }
  const match = matchRoute(path);
  // matchRoute returns a string for literal matches and
  // { pattern, params } for dynamic ones — compare against
  // match.pattern, not match itself.
  if (match && typeof match === "object") {
    if (match.pattern === "/tower-of-babel/library/:id") {
      const artifacts = getCachedArtifacts();
      const art = artifacts
        ? artifacts.find((a) => a.artifact_id === match.params.id)
        : null;
      if (art) {
        const suffix = " — free in the Tower of Babel online library.";
        const maxBlurb = 160 - suffix.length;
        let blurb = art.description || "Preserved in clean, searchable text.";
        if (blurb.length > maxBlurb) blurb = blurb.slice(0, maxBlurb - 3).trimEnd() + "...";
        return {
          title: `${art.title} — Read Free | Tower of Babel`,
          description: blurb + suffix,
        };
      }
      return {
        title: `Library Entry | Tower of Babel`,
        description: DEFAULT_DESCRIPTION,
      };
    }
  }
  return {
    title: `${SITE_NAME} — Digital Systems & AI`,
    description: DEFAULT_DESCRIPTION,
  };
}