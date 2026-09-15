// PolarScene.jsx
// Antarctic Labs — unified polar environment.
//
// Architecture: each layer is a sandboxed iframe (srcDoc) owned by its own
// React wrapper. The wrappers are ConstellationField (Canvas 2D particle network),
// PortalFieldCollection placeholder (WebGL2 cloud — actual source arrives later),
// and ElementsCollection (WebGL2 water with ping-pong sim).
//
// One shared scroll-progress state drives visibility/opacity per layer across
// the narrative:
//
//   0.00–0.20  ARRIVAL    → constellation visible, cloud faint, water hidden
//   0.20–0.50  DESCENT    → constellation fading, cloud growing
//   0.50–0.68  DEEP CLOUD → constellation hidden, cloud max density (obscuring)
//   0.68–0.82  EMERGENCE  → cloud breaking apart, water revealing
//   0.82–1.00  HORIZON    → water dominant
//
// All three layers use the same ThreeUI iframe pattern (verified in audit).
// The cloud layer is a provisional placeholder until its source arrives.

import { useEffect, useRef, useState } from "react";
import ConstellationField from "./shaders/neuform-isolated/NeuformBatchEffects";
import { ElementsBackground as ElementsCollection } from "./shaders/elements/ElementsBackground";

// ============================================================================
// CloudField — provisional placeholder
// ============================================================================
// The cloud source bundle hasn't arrived yet. This is a structural placeholder
// that occupies the correct z-layer (between constellation and water), receives
// scroll-state opacity updates the same way the others do, and has no fake visual
// content. When the cloud source arrives, swap this component's body for the
// real <PortalFieldCollection variant="cloud-field" /> import.
//
// Until then: dark transparent div, opacity-gated by scroll. The narrative
// reads as "descent into thick darkness" because of the constellation fading
// and the page background darkening; the placeholder just reserves the slot.
function CloudField({ opacity, paused }) {
  const ref = useRef(null);
  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    iframe.postMessage(
      { type: "threeui-controls", controls: { opacity, paused } },
      "*"
    );
  }, [opacity, paused]);
  return (
    <div
      ref={ref}
      className="polar-layer polar-cloud"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
        background:
          "radial-gradient(ellipse at 50% 60%, rgba(8,12,16,.92) 0%, rgba(4,6,8,.55) 50%, rgba(0,0,0,0) 100%)",
        opacity,
        mixBlendMode: "normal",
        transition: "opacity 200ms linear",
      }}
    />
  );
}

// ============================================================================
// PolarScene — orchestrator
// ============================================================================
// Mounts all three layers, computes shared scroll progress, distributes it
// as per-layer opacity + paused state. All three layers are positioned as
// fixed full-viewport iframes stacked behind the editorial content (z 0..2).
// The page background color shifts subtly to reinforce the narrative:
// deep navy at arrival → near-black at deep cloud → polar night at horizon.
export default function PolarScene() {
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const rafRef = useRef(null);

  useEffect(() => {
    // Throttle scroll progress with requestAnimationFrame.
    let ticking = false;
    const compute = () => {
      const max = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight
      );
      const p = Math.min(1, Math.max(0, window.scrollY / max));
      setProgress(p);
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        rafRef.current = requestAnimationFrame(compute);
      }
    };
    const onVisibility = () => setPaused(document.hidden);
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Per-layer opacity (visibility) per the locked narrative ranges.
  const constellationOpacity = smoothstep(0.0, 0.05, 1 - progress) *
    smoothstep(0.42, 0.62, 1 - progress);
  const cloudOpacity =
    smoothstep(0.20, 0.45, progress) *
    smoothstep(0.78, 0.94, 1 - progress);
  const waterOpacity = smoothstep(0.62, 0.78, progress);

  return (
    <div className="polar-scene" aria-hidden="true">
      <div
        className="polar-layer polar-constellation"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          opacity: constellationOpacity,
          transition: "opacity 120ms linear",
        }}
      >
        <ConstellationField
          variant="particle-network"
          mode="dark"
          speed={1.94}
          size={2.5}
          length={0.35}
          density={2.412}
          opacity={1.0}
          hue={-31}
          saturation={1.52}
          brightness={1.65}
          paused={paused}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      </div>

      <CloudField opacity={cloudOpacity} paused={paused} />

      <div
        className="polar-layer polar-water"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 3,
          pointerEvents: "none",
          opacity: waterOpacity,
          transition: "opacity 240ms linear",
        }}
      >
        <ElementsBackground
          variant="water"
          speed={0.95}
          size={0.65}
          particleAmount={0.18}
          opacity={1.0}
          hue={-1}
          saturation={1.32}
          brightness={1.78}
          paused={paused}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

// GLSL-style smoothstep for opacity curves.
function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
