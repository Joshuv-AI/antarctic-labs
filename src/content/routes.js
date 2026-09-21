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
const DEFAULT_DESCRIPTION = site.description;
const SITE_NAME = site.brand;
export const routeMeta = {
  "/": {
    title: `${SITE_NAME} — Digital Systems & AI`,
    description: DEFAULT_DESCRIPTION,
  },
  "/projects": {
    title: `Projects — ${SITE_NAME}`,
    description: `Selected projects, case studies, and expeditions. The Lab content (method, why Antarctic) is now included here. ${DEFAULT_DESCRIPTION}`,
  },
  "/tower-of-babel": {
    title: `Tower of Babel — ${SITE_NAME}`,
    description: `Personal library and artifact catalog. ${DEFAULT_DESCRIPTION}`,
  },
  "/tower-of-babel/library": {
    title: `Library — Tower of Babel — ${SITE_NAME}`,
    description: `Personal library catalog. ${DEFAULT_DESCRIPTION}`,
  },
  "/government-contracting": {
    title: `Government Contracting — ${SITE_NAME}`,
    description: `Government contracting and public sector information. ${DEFAULT_DESCRIPTION}`,
  },
  "/about": {
    title: `About — ${SITE_NAME}`,
    description: `About Antarctic Labs and Joshua Almodovar. ${DEFAULT_DESCRIPTION}`,
  },
  "/contact": {
    title: `Contact — ${SITE_NAME}`,
    description: `Contact Antarctic Labs. ${DEFAULT_DESCRIPTION}`,
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
  if (match) {
    if (match === "/projects/:id") {
      return {
        title: `Project — ${SITE_NAME}`,
        description: DEFAULT_DESCRIPTION,
      };
    }
    if (match === "/tower-of-babel/library/:id") {
      return {
        title: `Artifact — Tower of Babel — ${SITE_NAME}`,
        description: DEFAULT_DESCRIPTION,
      };
    }
  }
  return {
    title: `${SITE_NAME} — Digital Systems & AI`,
    description: DEFAULT_DESCRIPTION,
  };
}