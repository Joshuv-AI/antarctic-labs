// HelixCanvas — mounts the Tower page's helix background scene
// (src/lib/helix-scene.js) as a FIXED FULL-PAGE backdrop (Joshua's
// 2026-11-12 full-page extension): the canvas layer is position:fixed
// behind every section of the TowerOfBabel page, while the floating
// band labels stay confined to the hero region (their layer is
// absolutely positioned inside the hero section and scrolls away
// with it). Decorative only: pointer-events none (CSS), aria-hidden,
// and every failure mode resolves to "no canvas" — the black page
// remains and the content is untouched. This page has a crash
// history; the background must never be able to take it down.
//
// Safety wiring (mirrors the site's established patterns):
//  - HelixShield: an error boundary with the same semantics as
//    main.jsx's WebGLShield (a failed decorative layer renders
//    nothing, never the route error panel). main.jsx's shield is not
//    exported and pages.jsx cannot import main.jsx (module cycle), so
//    the shield is replicated here deliberately.
//  - The scene module (and three.js with it) loads via dynamic
//    import() with retry, deferred until after first paint + the
//    Tower boot overlay — the TypographyVortexCanvas pattern (a
//    1500 ms beat, then requestIdleCallback) — so it never competes
//    with the catalog auto-start stream.
//  - Frozen frame instead of a loop for prefers-reduced-motion and
//    weak-device heuristics; the scene itself auto-degrades to the
//    frozen frame on sustained low fps.
//  - Rendering pauses while the tab is hidden; route changes unmount
//    the component, which disposes the scene. (A fixed full-page
//    canvas has no off-screen state, so there is no Intersection-
//    Observer pause anymore.)
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

function HelixLayer() {
  const ref = useRef(null);
  const labelsRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let disposed = false;
    let scene = null;
    let timer = 0;
    let idleId = 0;
    const frozen = prefersReducedMotion() || weakDevice();

    const sync = () => {
      if (!scene) return;
      if (!document.hidden) scene.start();
      else scene.stop();
    };
    const onVis = () => sync();

    const init = async () => {
      const mod = await loadHelixSceneModule();
      if (disposed) return;
      if (!mod) {
        setFailed(true);
        return;
      }
      try {
        scene = mod.createHelixScene(canvas, {
          frozen,
          labelsEl: labelsRef.current,
          // The hero's own text blocks (title + intro), in canvas
          // coordinates: band labels hide rather than sit under them.
          getAvoidRects: () => {
            try {
              const section = canvas.closest("section");
              if (!section) return [];
              const c = canvas.getBoundingClientRect();
              return [...section.querySelectorAll(":scope > h1, :scope > p")].map((el) => {
                const r = el.getBoundingClientRect();
                return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
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
      if (!frozen) {
        document.addEventListener("visibilitychange", onVis);
        sync();
      }
    };

    // Deferred init (vortex pattern): the 1500 ms beat lets first
    // paint and the Tower boot overlay finish; the idle callback keeps
    // the scene build off the catalog stream's critical path.
    timer = window.setTimeout(() => {
      if (disposed) return;
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(
          () => {
            if (!disposed) init();
          },
          { timeout: 1200 }
        );
      } else {
        init();
      }
    }, 1500);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      if (idleId && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      document.removeEventListener("visibilitychange", onVis);
      if (scene) scene.dispose();
    };
  }, []);

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
      {/* Floating collection labels (reel style) — a HERO composition:
          this layer is absolutely positioned inside the hero section,
          so the labels scroll away with the hero. The scene fills and
          positions them; decorative only. */}
      <div ref={labelsRef} className="tower-helix-labels" aria-hidden="true" />
    </>
  );
}

export default function HelixCanvas() {
  const [off] = useState(bgDisabled);
  if (off) return null;
  return (
    <HelixShield>
      <HelixLayer />
    </HelixShield>
  );
}
