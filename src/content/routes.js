// Centralized route registry. Each route declares the destinations it
// owns (literal + dynamic patterns) and the SEO metadata that should
// be applied when that route is active. The App's render layer
// consumes this list to decide which page shell to mount.
//
// Per the Stage A spec, no new routing library is introduced — the
// existing pushState + popstate pattern in main.jsx is preserved and
// extended.

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
  "/systems": {
    title: `Systems — ${SITE_NAME}`,
    description: `Operating systems and infrastructure. ${DEFAULT_DESCRIPTION}`,
  },
  "/expeditions": {
    title: `Expeditions — ${SITE_NAME}`,
    description: `Selected expeditions and case studies. ${DEFAULT_DESCRIPTION}`,
  },
  "/history": {
    title: `History — ${SITE_NAME}`,
    description: `Timeline and history. ${DEFAULT_DESCRIPTION}`,
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
  "/operator": {
    title: `The Operator — ${SITE_NAME}`,
    description: `About the operator, ${site.operator}. ${DEFAULT_DESCRIPTION}`,
  },
  "/field-interests": {
    title: `Field Interests — ${SITE_NAME}`,
    description: `Areas of active interest and research. ${DEFAULT_DESCRIPTION}`,
  },
  "/transmission": {
    title: `Transmission — ${SITE_NAME}`,
    description: `Outbound signal and contact. ${DEFAULT_DESCRIPTION}`,
  },
  "/about": {
    title: `About — ${SITE_NAME}`,
    description: `About Antarctic Labs. ${DEFAULT_DESCRIPTION}`,
  },
};

// The full list of literal + dynamic patterns that the App should
// recognize. Used to drive the path-state branch and to gate the
// popstate handler's 404 fallback.
export const routes = [
  "/",
  "/the-lab",
  "/systems",
  "/expeditions",
  "/expeditions/:id",
  "/history",
  "/tower-of-babel",
  "/tower-of-babel/library",
  "/tower-of-babel/library/:id",
  "/government",
  "/operator",
  "/field-interests",
  "/transmission",
  "/about",
];

// Match a runtime path to a route pattern. Returns the matched pattern
// or null. Supports a single :id segment per route.
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
// generic Antarctic Labs title.
export function metaFor(path) {
  if (routeMeta[path]) return routeMeta[path];
  const match = matchRoute(path);
  if (match) {
    if (match === "/expeditions/:id") {
      return {
        title: `Expedition — ${SITE_NAME}`,
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
