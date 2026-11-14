// HelixCanvas — mounts the Tower page's helix background scene
// (src/lib/helix-scene.js) as a FIXED FULL-PAGE backdrop: the canvas
// layer is position:fixed behind every section of the TowerOfBabel
// page, while the band labels stay confined to the hero region
// (their layer is absolutely positioned inside the hero section and
// scrolls away with it). Decorative only: pointer-events none (CSS),
// aria-hidden, and every failure mode resolves to "no canvas" — the
// black page remains and the content is untouched. This page has a
// crash history; the background must never be able to take it down.
//
// Safety wiring (mirrors the site's established patterns):
//  - HelixShield: an error boundary with the same semantics as
//    main.jsx's WebGLShield (a failed decorative layer renders
//    nothing, never the route error panel). main.jsx's shield is not
//    exported and pages.jsx cannot import main.jsx (module cycle), so
//    the shield is replicated here deliberately.
//  - The scene module (and three.js with it) loads via dynamic
//    import() with retry. SHIP 2 (Amendment M): the import starts at
//    mount — the scene and atlas load DURING the page's boot — but
//    the scene's animation stays gated on the boot completing
//    (setSettled, called by the library section when it reports
//    ready); before that, at most a motionless top-down still shows.
//  - Navigation binding: the owning page passes an apiRef; this
//    component registers { setDisplay, setSettled } into it as soon
//    as it mounts (calls queue their latest state until the scene
//    exists, then apply). Binding is state-only — the scene's damped
//    rig does all motion; no per-frame React state anywhere.
//  - Frozen frame instead of a loop for prefers-reduced-motion and
//    weak-device heuristics; the scene itself auto-degrades to the
//    frozen frame on sustained low fps.
//  - Rendering pauses while the tab is hidden; route changes unmount
//    the component, which disposes the scene.
//  - Kill switch: ?bg=0 disables the canvas entirely.
import { Component, useEffect, useRef, useState } from "react";

class HelixShield extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch() {}
  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

function bgDisabled() {
  try {
    return new URLSearchParams(window.location.search).get("bg") === "0";
  } catch (e) {
    return false;
  }
}
function prefersReducedMotion() {
  try {
    return !!(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch (e) {
    return false;
  }
}
function weakDevice() {
  try {
    const mem = navigator.deviceMemory;
    const cores = navigator.hardwareConcurrency;
    if (typeof mem === "number" && mem > 0 && mem <= 2) return true;
    if (typeof cores === "number" && cores > 0 && cores <= 2) return true;
  } catch (e) {}
  return false;
}

// Dynamic import with the site's retry shape (two attempts, backoff),
// resolved quietly: a decorative chunk that will not load simply means
// no background — never a reload, never an error surface.
async function loadHelixSceneModule() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await import("../lib/helix-scene.js");
    } catch (e) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }
  return null;
}

// True band counts for the scene (true representation, 2026-11-13):
// the scene's bands are the seven real collections, and their counts
// come from /tower-hubs-index.json — the exact file the page's
// filter chips read — so the background and the panel can never
// disagree. Bounded wait (2.5 s): on any failure the scene falls
// back to its built-in seed of the same true totals.
const HELIX_COLLECTIONS = ["LAW", "PAPERS", "BOOKS", "REFERENCE", "DECLASSIFIED", "PODCASTS", "DOCUMENTS"];
async function fetchHubCounts() {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 2500);
    let j = null;
    try {
      const r = await fetch("/tower-hubs-index.json", { signal: ctl.signal });
      if (r && r.ok) j = await r.json();
    } finally {
      clearTimeout(to);
    }
    const cols = j && j.collections;
    if (!cols) return null;
    const out = {};
    for (const n of HELIX_COLLECTIONS) {
      const v = cols[n];
      if (typeof v !== "number" || !(v > 0)) return null;
      out[n] = v;
    }
    return out;
  } catch (e) {
    return null;
  }
}

function HelixLayer({ apiRef }) {
  const ref = useRef(null);
  const labelsRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let disposed = false;
    let scene = null;
    const frozen = prefersReducedMotion() || weakDevice();

    // Binding bridge: registered into the owner's apiRef immediately,
    // before the scene module even loads. Calls record their latest
    // state and apply it the moment the scene exists (latest-wins —
    // exactly the scene rig's own semantics).
    let pendingDisplay = null;
    let pendingSettled = false;
    const bridge = {
      setDisplay: (state) => {
        pendingDisplay = state;
        if (scene) scene.setDisplay(state);
      },
      setSettled: () => {
        pendingSettled = true;
        if (scene) scene.setSettled();
      },
    };
    if (apiRef) apiRef.current = bridge;

    const sync = () => {
      if (!scene) return;
      if (!document.hidden) scene.start();
      else scene.stop();
    };
    const onVis = () => sync();

    const init = async () => {
      // The hub-seed fetch runs in parallel with the scene module
      // load; both are awaited (the fetch is timeout-bounded) so
      // the scene is created once, with true counts when available.
      const countsP = fetchHubCounts();
      const mod = await loadHelixSceneModule();
      if (disposed) return;
      if (!mod) {
        setFailed(true);
        return;
      }
      const counts = await countsP;
      if (disposed) return;
      try {
        scene = mod.createHelixScene(canvas, {
          frozen,
          counts: counts || undefined,
          labelsEl: labelsRef.current,
          // The hero's own text blocks (title + total line), in
          // DOCUMENT coordinates (scroll-invariant): large band labels
          // hide rather than sit under them.
          getAvoidRects: () => {
            try {
              const section = canvas.closest("section");
              if (!section) return [];
              return [...section.querySelectorAll(":scope > h1, :scope > p")].map((el) => {
                const r = el.getBoundingClientRect();
                return {
                  x: r.left + window.scrollX,
                  y: r.top + window.scrollY,
                  w: r.width,
                  h: r.height,
                };
              });
            } catch (e) {
              return [];
            }
          },
          onError: () => {
            if (!disposed) setFailed(true);
          },
        });
      } catch (e) {
        scene = null;
      }
      if (disposed) {
        if (scene) scene.dispose();
        return;
      }
      if (!scene) {
        setFailed(true);
        return;
      }
      if (pendingDisplay) scene.setDisplay(pendingDisplay);
      if (pendingSettled) scene.setSettled();
      if (!frozen) {
        document.addEventListener("visibilitychange", onVis);
        sync();
      }
    };

    // Amendment M: no deferral — the scene + atlas load during the
    // page's boot. Motion stays gated inside the scene until
    // setSettled (the boot-complete signal).
    init();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVis);
      if (apiRef && apiRef.current === bridge) apiRef.current = null;
      if (scene) scene.dispose();
    };
  }, [apiRef]);

  if (failed) return null;
  return (
    <>
      {/* Fixed full-page canvas layer (CSS: position fixed, behind
          all page content). */}
      <div className="tower-helix-layer" aria-hidden="true">
        <canvas
          ref={ref}
          className="tower-helix-canvas"
          aria-hidden="true"
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      </div>
      {/* Band labels (reel style) — a HERO composition: this layer is
          absolutely positioned inside the hero section, so the labels
          scroll away with the hero. The scene fills and positions
          them (they ride their coil anchors); decorative only. */}
      <div ref={labelsRef} className="tower-helix-labels" aria-hidden="true" />
    </>
  );
}

export default function HelixCanvas({ apiRef }) {
  const [off] = useState(bgDisabled);
  if (off) return null;
  return (
    <HelixShield>
      <HelixLayer apiRef={apiRef} />
    </HelixShield>
  );
}
