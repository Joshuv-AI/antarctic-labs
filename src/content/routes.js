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
// HOME, THE LAB, PROJECTS, TOWER OF BABEL, GOVERNMENT, ABOUT, CONTACT.
//
// Old routes remain as backward-compatibility aliases where useful.
// In particular, /transmission now redirects to the canonical /contact
// route.
import { site } from "./site.js";
import { expeditions } from "./expeditions.js";
import { artifacts } from "./library-catalog.js";
const DEFAULT_DESCRIPTION = site.description;
const SITE_NAME = site.brand;
// Per-page SEO: every canonical route carries keyword-targeted metadata
// aimed at the obvious simple searches for its sector. Service pages
// (home, contact, about, projects) target hire-intent freelance searches
// — client acquisition is the site's main goal. Tower of Babel pages
// target free-library/archive searches for authority and traffic.
// Titles stay near ~60 chars, descriptions near ~155, keyword up front.
export const routeMeta = {
  "/": {
    title: `Freelance AI Automation & Web Developer | ${SITE_NAME}`,
    description:
      "Hire a freelance AI automation developer: n8n workflows, AI agents, websites, web scraping, lead generation. Scoped clearly, delivered ready to work.",
  },
  "/projects": {
    title: `AI & Automation Project Portfolio | ${SITE_NAME}`,
    description:
      "Selected freelance projects and case studies: AI agents, automation systems, web apps, and data pipelines — proof of work from Antarctic Labs.",
  },
  "/tower-of-babel": {
    title: `Tower of Babel — Free Online Library | ${SITE_NAME}`,
    description:
      "A free, searchable online library: thousands of books, sacred texts, declassified documents, and transcripts preserved in clean, readable text.",
  },
  "/tower-of-babel/library": {
    title: `Free Online Library — Search & Read Books | Tower of Babel`,
    description:
      "Search thousands of books, documents, and texts in the Tower of Babel's free online library catalog. Read in clean, searchable text.",
  },
  "/tower-of-babel/library/suggest": {
    title: `Suggest a Book for the Free Online Library | Tower of Babel`,
    description:
      "Suggest a book, document, or text for the Tower of Babel's free online library catalog.",
  },
  "/government-contracting": {
    title: `AI Systems for Government Contracting | ${SITE_NAME}`,
    description:
      "Antarctic Labs is developing toward public-sector work: AI analyst workflows, data systems, and automation for primes — pilots, SBIR/STTR, and teaming.",
  },
  "/about": {
    title: `Joshua Almodovar — Freelance AI Developer | ${SITE_NAME}`,
    description:
      "Joshua Almodovar runs Antarctic Labs, a freelance studio for AI automation, websites, and data systems. No account managers — you talk to the builder.",
  },
  "/contact": {
    title: `Hire a Freelance AI Developer — Contact | ${SITE_NAME}`,
    description:
      "Have a project? Hire Antarctic Labs for AI automation, web development, and data systems. Send the details, get a working solution back.",
  },
};
// Old routes kept for SEO/canonicalization purposes only.
//
// /transmission is now a legacy alias for /contact.
// The other historical routes remain unchanged.
export const routeMetaLegacy = {
  "/systems": {
    title: `Systems — ${SITE_NAME}`,
    description: DEFAULT_DESCRIPTION,
    redirect: "/",
  },
  "/expeditions": {
    title: `Projects — ${SITE_NAME}`,
    description: `Selected projects, case studies, and expeditions. ${DEFAULT_DESCRIPTION}`,
    redirect: "/projects",
  },
  "/the-lab": {
    title: `Projects — ${SITE_NAME}`,
    description: `Selected projects, case studies, and expeditions. ${DEFAULT_DESCRIPTION}`,
    redirect: "/projects",
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
  "/transmission": {
    title: `Contact — ${SITE_NAME}`,
    description: `Contact Antarctic Labs. ${DEFAULT_DESCRIPTION}`,
    redirect: "/contact",
  },
};
// The full list of literal + dynamic patterns that the App should
// recognize.
//
// /transmission is intentionally NOT a canonical route. It is kept
// here so the runtime can recognize the old URL before legacyRedirect()
// moves it to /contact.
export const routes = [
  "/",
  "/projects",
  "/projects/:id",
  "/tower-of-babel",
  "/tower-of-babel/library",
  // Literal suggest route must precede the dynamic :id pattern so
  // matchRoute resolves it as its own page, not an artifact id.
  "/tower-of-babel/library/suggest",
  "/tower-of-babel/library/:id",
  "/government-contracting",
  "/about",
  "/contact",
  // Legacy patterns preserved for backward compatibility.
  "/systems",
  "/expeditions",
  "/expeditions/:id",
  "/history",
  "/operator",
  "/field-interests",
  "/transmission",
];
// Map any legacy path to its canonical redirect target.
//
// Supports literal paths AND legacy dynamic patterns
// (/expeditions/:id → /projects/:id).
export function legacyRedirect(path) {
  if (path in routeMetaLegacy) {
    return routeMetaLegacy[path].redirect;
  }
  // Legacy dynamic pattern:
  // /expeditions/:id → /projects/:id
  if (
    path.startsWith("/expeditions/") &&
    path.length > "/expeditions/".length
  ) {
    const id = path.slice("/expeditions/".length);
    return `/projects/${id}`;
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
    if (match.pattern === "/projects/:id") {
      const exp = expeditions.find((e) => e.id === match.params.id);
      if (exp) {
        return {
          title: `${exp.title} | ${SITE_NAME} Projects`,
          description: exp.shortDescription
            ? `${exp.shortDescription} — a freelance build by Antarctic Labs.`
            : DEFAULT_DESCRIPTION,
        };
      }
      return {
        title: `Project | ${SITE_NAME}`,
        description: DEFAULT_DESCRIPTION,
      };
    }
    if (match.pattern === "/tower-of-babel/library/:id") {
      const art = artifacts.find((a) => a.artifact_id === match.params.id);
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