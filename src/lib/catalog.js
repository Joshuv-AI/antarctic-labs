// Tower of Babel — lazy artifact catalog.
//
// The catalog (3,448 records, ~2.6MB of source) used to be statically
// imported, which put ~80% of the main bundle's bytes on the critical path
// of EVERY page load: the bundle had to download and parse before React
// could mount, so a slow connection left the boot loader sitting for many
// seconds (the "sometimes stuck at the loading animation"). Now the catalog
// is code-split out via dynamic import and fetched only when a Tower route
// actually needs it. The initial bundle stays lean; the branded Tower loader
// covers the fetch; and the app shell's loader failsafe accounts for a
// still-pending fetch before giving up.
//
// NOTE: a failed dynamic import() is cached by the browser's module map —
// retrying import() in place can NEVER succeed (verified: the second call
// rejects without a network request). So there is exactly one attempt per
// page load. On failure the caller shows an error state whose RETRY button
// reloads the page, which gives a fresh module map and a fresh attempt.
//
// The catalog is static at runtime, so the loaded array is cached in module
// state and shared by every consumer.
let artifactsCache = null;
let pending = null;

export function loadCatalog() {
  if (artifactsCache) return Promise.resolve(artifactsCache);
  if (!pending) {
    pending = import("../content/library-catalog.js").then(
      (m) => {
        artifactsCache = m.artifacts;
        return artifactsCache;
      },
      (err) => {
        // Clear so a later call surfaces the (cached) rejection instead of
        // hanging on a settled promise; the user-facing retry is a page
        // reload (see note above).
        pending = null;
        throw err;
      }
    );
  }
  return pending;
}

// True while a catalog fetch is in flight. The Tower loader failsafe
// consults this so a slow chunk download gets more time instead of
// dismissing to a blank page.
export function isCatalogPending() {
  return pending !== null;
}

// The loaded array, or null if it hasn't resolved yet. Synchronous metadata
// (route titles, JSON-LD) uses this with a generic fallback and re-applies
// once the catalog arrives.
export function getCachedArtifacts() {
  return artifactsCache;
}
