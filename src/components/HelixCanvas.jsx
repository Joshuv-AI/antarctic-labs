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
//
// Smoothness repair (2026-11-14): the counts object lives in the
// file's HEAD ({"snapshotDate":...,"total":N,"collections":{...}}),
// so the body is STREAMED only until the collections object closes
// and then cancelled — the same head-read the page's own hub seed
// uses (fetchHubSeed in pages.jsx). The previous implementation
// downloaded and JSON.parsed the whole ~17.7 MB document before the
// scene could be created: on a phone link that is seconds of radio
// contention against the catalog stream plus a multi-hundred-ms
// main-thread parse, all to extract seven numbers.
const HELIX_COLLECTIONS = ["LAW", "PAPERS", "BOOKS", "REFERENCE", "DECLASSIFIED", "PODCASTS", "DOCUMENTS"];
function extractHeadCollections(text) {
  const key = text.indexOf('"collections"');
  if (key < 0) return null;
  const open = text.indexOf("{", key);
  if (open < 0) return null;
  // The collections object is flat (name -> count): the first "}"
  // after its "{" that balances it is its end.
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          const cols = JSON.parse(text.slice(open, i + 1));
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
    }
  }
  return null;
}
async function fetchHubCounts() {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 2500);
    try {
      const r = await fetch("/tower-hubs-index.json", { signal: ctl.signal });
      if (!r || !r.ok || !r.body || typeof r.body.getReader !== "function") return null;
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let text = "";
      // The collections object sits within the first few hundred
      // bytes; the 256 KB scan cap is pure headroom.
      for (let n = 0; n < 64 && text.length < 262144; n++) {
        const { done, value } = await reader.read();
        if (value) text += dec.decode(value, { stream: !done });
        const out = extractHeadCollections(text);
        if (out) {
          try { reader.cancel(); } catch (e) {}
          return out;
        }
        if (done) break;
      }
      return null;
    } finally {
      clearTimeout(to);
    }
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
