// PolarScene.jsx
// Antarctic Labs — unified polar environment.
//
// Three layers compose the home background, all rendered into sandboxed
// iframes so their GPU/CPU cycles stay isolated from the main page:
//   1. polar-fog            CSS radial gradients (z=3, smoothstep-driven)
//   2. polar-constellation  DefenseLines particle rain (z=4, top)
//   3. polar-aura           Aura Borealis GLB mountain (z=2, replaces
//                           the former Strata cloud + Elemental water
//                           pair; no third shader iframe is needed).
//
// Constellation wrapper is inlined here to bypass Vite tree-shaking
// that drops the wrapper module entirely when only one named export
// is consumed. AuraBorealisField follows the same iframe-sandbox
// pattern so its WebGL renderer runs in its own context.

import { useEffect, useMemo, useRef, useState } from "react";
import { DefenseLines as ConstellationFieldNew } from "./shaders/neuform-isolated/NeuformBatchEffects";


// ============================================================================
// AuraBorealisField — iframe-sandboxed WebGL renderer for the Aura Borealis
// polar mountain GLB. Replaces the former Cloud (strata-cloud) and Water
// (elemental-marks) layers with a single 3D asset.
//
// The iframe keeps the GLB's WebGL context separate from the main page so
// the parent DOM and React reconciliation never block on GLB parsing.
// On load the iframe frames a camera on the asset's bounding box, scales
// it to fit a 40° FOV, and renders one frame per requestAnimationFrame
// tick. The `paused` prop is forwarded to the iframe via postMessage so
// the parent page can halt the render loop when the tab is hidden.
//
// On any error during GLB load or scene build the iframe renders nothing
// (transparent canvas) so the rest of the polar scene stays intact —
// satisfies the HANDOFF rule "Do not make the optional hero GLB a hard
// runtime dependency".
// ============================================================================

const AURA_RENDERER_URL = "/assets/aura-renderer.html";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}


function AuraBorealisField({ opacity, paused }) {
  const iframeRef = useRef(null);
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      { type: "aura-controls", controls: { paused: Boolean(paused) } },
      "*"
    );
  }, [paused]);
  return (
    <div
      className="polar-layer polar-aura"
      aria-hidden="true"
      style={{
        position: "fixed", inset: 0, zIndex: 2, pointerEvents: "none",
        opacity: clamp(opacity, 0.05, 1),
        transition: "opacity 160ms linear",
      }}
    >
      <iframe
        ref={iframeRef}
        title="Aura Borealis polar background"
        src={AURA_RENDERER_URL}
        onLoad={() => {
          const iframe = iframeRef.current;
          if (!iframe || !iframe.contentWindow) return;
          iframe.contentWindow.postMessage(
            { type: "aura-controls", controls: { paused: Boolean(paused) } },
            "*"
          );
        }}
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: "absolute", inset: 0, display: "block",
          width: "100%", height: "100%", border: 0,
          background: "transparent",
        }}
      />
    </div>
  );
}

// ============================================================================
// PolarScene — orchestrator
// ============================================================================
export default function PolarScene() {
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const rafRef = useRef(null);

  useEffect(() => {
    let ticking = false;
    const compute = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
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

  const constellationOpacity =
    smoothstep(0.0, 0.05, 1 - progress) *
    smoothstep(0.42, 0.62, 1 - progress);
  // Aura layer: visible across most of the page, fades out near the very bottom.
  const auraOpacity = 1 - smoothstep(0.55, 0.95, progress);
  // Atmospheric veil — peaks during constellation→aura handoff so the
  // DefenseLines rain and the mountain read as one continuous polar world.
  const fogOpacity =
    smoothstep(0.40, 0.55, progress) *
    (1 - smoothstep(0.78, 0.88, progress));

  return (
    <div className="polar-scene" aria-hidden="true">
      <div
        className="polar-layer polar-fog"
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 3,
          pointerEvents: "none",
          opacity: fogOpacity,
          transition: "opacity 160ms linear",
          background: [
            "radial-gradient(60% 50% at 20% 35%, rgba(180, 210, 235, 0.55) 0%, rgba(180, 210, 235, 0) 60%)",
            "radial-gradient(55% 45% at 78% 50%, rgba(150, 185, 220, 0.50) 0%, rgba(150, 185, 220, 0) 65%)",
            "radial-gradient(70% 55% at 50% 75%, rgba(120, 160, 205, 0.45) 0%, rgba(120, 160, 205, 0) 70%)",
            "radial-gradient(80% 60% at 35% 20%, rgba(200, 220, 240, 0.40) 0%, rgba(200, 220, 240, 0) 65%)",
          ].join(", "),
          filter: "blur(40px)",
          mixBlendMode: "screen",
          willChange: "opacity",
        }}
      />
      <div
        className="polar-layer polar-constellation"
        aria-hidden="true"
        style={{
          position: "fixed", inset: 0, zIndex: 4, pointerEvents: "none",
          opacity: constellationOpacity, transition: "opacity 160ms linear",
        }}
      >
        <ConstellationFieldNew
          variant="defense-lines"
          mode="dark"
          speed={3.00}
          size={0.35}
          length={0.35}
          density={1.99}
          opacity={1.00}
          hue={1}
          saturation={0.00}
          brightness={1.65}
        />
      </div>
      <AuraBorealisField opacity={auraOpacity} paused={paused} />
    </div>
  );
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
