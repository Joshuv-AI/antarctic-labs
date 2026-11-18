// Entry-open flight (2026-11-16, INVENTORY 37; design locked by Joshua
// 2026-11-14 ~22:35–22:45, confirmed 2026-11-15): the shared-element
// transition that replaces the "Tower of Babel" title loader when a
// library result is opened. The clicked cover survives a dissolve of
// the browse UI, lifts from its exact rendered rect, glides to center
// over the helix, and the reader opens with its text already loaded —
// the animation IS the loading screen.
//
// Motion revamp (2026-11-17, INVENTORY 104; Joshua's spec, refined
// across three corrections in one call): the glide to center is only
// the first beat. The cover does NOT stop and hold at center — it is
// pushed inward (a slight recede toward the spiral's background) and
// keeps RISING continuously through the center of the coil, no pause
// anywhere, up past the height where small-selection covers float and
// out of the frame, while the helix backdrop sinks below (the camera
// pans up with the cover). The reader opens as the cover rises out.
// The old breathe-at-center hold is gone: while the preload runs, the
// rise itself is the never-frozen frame. The gate minimum/cap are
// retuned to the longer motion, and the handoff is now driven by the
// navigated flag below — the overlay starts leaving the moment
// navigation fires and is gone on a hard timer, so the cover can
// never linger over the already-painted reader (the desktop linger
// defect this revamp also fixes).
//
// This module is the rendezvous between the two chunks that never
// import each other:
//   - pages.jsx starts a flight at click time (cover rect + cloned
//     cover markup + target route) and owns the navigation timing
//     (preload gate, minimum, hard cap, cancel hook).
//   - main.jsx (the app shell) renders the overlay above the route
//     swap and suppresses the Tower boot loader + page curtain for
//     the flight's own navigation.
// One flight at a time; starting one while another is live is a no-op
// the caller guards against.

export const ENTRY_FLIGHT_MIN_MS = 1500; // glide + the rise is under way
export const ENTRY_FLIGHT_CAP_MS = 2400; // never hold the reader hostage
export const ENTRY_FLIGHT_GLIDE_MS = 640;
export const ENTRY_FLIGHT_RISE_MS = 2100; // continuous rise, interrupted by the gate
export const ENTRY_FLIGHT_EXIT_MS = 520; // hard bound: overlay gone this long after navigation

let flight = null;
const subs = new Set();

function notify() {
  subs.forEach((fn) => {
    try {
      fn(flight);
    } catch {
      /* a broken subscriber must never break navigation */
    }
  });
}

export function getEntryFlight() {
  return flight;
}

export function subscribeEntryFlight(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

// f: { to, toPath, html, cls, rect:{left,top,width,height}, dx, dy,
//      scale, reduced, cancel?: () => void }
export function beginEntryFlight(f) {
  flight = { ...f, startedAt: performance.now(), navigated: false };
  notify();
  return flight;
}

// The flight whose navigation is headed for `canonical` (the exact
// target string go() was called with, query included), else null.
export function entryFlightFor(canonical) {
  if (!flight) return null;
  return flight.to === canonical ? flight : null;
}

export function markEntryFlightNavigated() {
  if (!flight) return;
  // Replace, don't mutate: the overlay holds the flight as React
  // state, and a mutated-but-identical object reference bails out of
  // the re-render — the exit would then wait on route-state
  // propagation instead of starting at navigation time. With a fresh
  // object the overlay re-renders immediately, the exit's CSS
  // transition (compositor-driven) starts NOW, and the hard exit
  // timer is armed before the route swap. This is the anti-linger
  // mechanism (INVENTORY 104): the exit clock runs from the
  // navigation itself.
  flight = { ...flight, navigated: true };
  notify();
}

// Normal completion (overlay finished its handoff fade).
export function endEntryFlight() {
  if (!flight) return;
  flight = null;
  notify();
}

// Abandoned flight (navigation elsewhere, popstate, dock tap): the
// owner's cancel hook clears its timers, aborts the preload fetch and
// un-dissolves the browse page.
export function cancelEntryFlight() {
  if (!flight) return;
  const f = flight;
  flight = null;
  notify();
  if (typeof f.cancel === "function") {
    try {
      f.cancel();
    } catch {
      /* owner cleanup is best-effort; the flight is already gone */
    }
  }
}
