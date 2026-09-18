// Centralized route registry. Each route declares the destinations it
// owns (literal + dynamic patterns) and the SEO metadata that should
// be applied when that route is active. The App's render layer
// consumes this list to decide which page shell to mount.
//
// Per the Stage A spec, no new routing library is introduced — the
// existing pushState + popstate pattern in main.jsx is preserved and
// extended.
//
// Stage F — IA consolidation: canonical routes are HOME, THE LAB,
// PROJECTS, TOWER OF BABEL, GOVERNMENT, ABOUT, TRANSMISSION. Old
// routes (/systems, /expeditions, /history, /operator,
// /field-interests) remain in the route list as backward-compat
// aliases that matchRoute() resolves to their canonical counterpart.

import { site } from "./site.js";

const DEFAULT_DESCRIPTION = site.description;
const SITE_NAME = site.brand;

export const routeMeta = {
  "/": {
    title: `${SITE_NAME} — Digital Systems & AI`,
    description: DEFAULT_DESCRIPTION,
  },
  "/the-lab": {
    title: `The Lab — ${SITE_NAME}`,
    description: `The laboratory. ${DEFAULT_DESCRIPTION}`,
  },
  "/projects": {
    title: `Projects — ${SITE_NAME}`,
    description: `Selected projects, case studies, and expeditions. ${DEFAULT_DESCRIPTION}`,
  },
  "/tower-of-babel": {
    title: `Tower of Babel — ${SITE_NAME}`,
    description: `Personal library and artifact catalog. ${DEFAULT_DESCRIPTION}`,
  },
  "/tower-of-babel/library": {
    title: `Library — Tower of Babel — ${SITE_NAME}`,
    description: `Personal library catalog. ${DEFAULT_DESCRIPTION}`,
  },
  "/government": {
    title: `Government — ${SITE_NAME}`,
    description: `Public sector and government information. ${DEFAULT_DESCRIPTION}`,
  },
  "/about": {
    title: `About — ${SITE_NAME}`,
    description: `About Antarctic Labs and Joshua Almodovar. ${DEFAULT_DESCRIPTION}`,
  },
  "/transmission": {
    title: `Transmission — ${SITE_NAME}`,
    description: `Outbound signal and contact. ${DEFAULT_DESCRIPTION}`,
  },
};

// Old routes kept for SEO/canonicalization purposes only. The
// runtime `matchRoute()` below maps them to their canonical target
// so that historical links continue to resolve. They are NOT used as
// route handlers in main.jsx.
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
// recognize. Used to drive the path-state branch and to gate the
// popstate handler's 404 fallback. Includes legacy patterns so old
// URLs continue to resolve to a known pattern, which the legacy
// redirect map then turns into a canonical path.
export const routes = [
  "/",
  "/the-lab",
  "/projects",
  "/projects/:id",
  "/tower-of-babel",
  "/tower-of-babel/library",
  "/tower-of-babel/library/:id",
  "/government",
  "/about",
  "/transmission",
  // Legacy patterns (preserved for backward compatibility):
  "/systems",
  "/expeditions",
  "/expeditions/:id",
  "/history",
  "/operator",
  "/field-interests",
];

// Map any legacy path to its canonical redirect target. Returns
// null if the path is already canonical. Used by main.jsx's
// popstate + initial-mount handlers to redirect old URLs.
//
// Supports literal paths AND legacy dynamic patterns
// (/expeditions/:id → /projects/:id) so that old URLs with id
// segments continue to resolve to the equivalent canonical URL.
export function legacyRedirect(path) {
  if (path in routeMetaLegacy) return routeMetaLegacy[path].redirect;
  // Legacy dynamic pattern: /expeditions/:id → /projects/:id
  if (path.startsWith("/expeditions/") && path.length > "/expeditions/".length) {
    const id = path.slice("/expeditions/".length);
    return `/projects/${id}`;
  }
  return null;
}

// Match a runtime path to a route pattern. Returns the matched
// pattern or null. Supports a single :id segment per route.
export function matchRoute(path) {
  for (const pattern of routes) {
    if (!pattern.includes(":")) {
      if (pattern === path) return pattern;
      continue;
    }
    const patternParts = pattern.split("/");
    const pathParts = path.split("/");
    if (patternParts.length !== pathParts.length) continue;
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
    if (matched) return { pattern, params };
  }
  return null;
}

// Resolve the SEO metadata for a runtime path. Falls back to a
// generic Antarctic Labs title. Honors legacy meta entries when the
// path is an old URL that still gets crawled.
export function metaFor(path) {
  if (routeMeta[path]) return routeMeta[path];
  if (routeMetaLegacy[path]) return routeMetaLegacy[path];
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
