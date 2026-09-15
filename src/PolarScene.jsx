// PolarScene.jsx
// Antarctic Labs — unified polar environment.
//
// Architecture: each layer is a sandboxed iframe (srcDoc) owned by its own
// React wrapper. The constellation layer uses the ConstellationField wrapper
// from src/shaders/neuform-isolated/. The water layer is implemented inline
// below (WaterLayer) so Vite's tree-shaker can't drop the water source HTML
// string — the previous ElementsBackground wrapper was being silently
// tree-shaken because its default import sat in a chain Vite's static
// analyzer couldn't fully trace. Inlining the water component keeps the
// ?raw import directly referenced from the JSX render path.
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

import { useEffect, useMemo, useRef, useState } from "react";
import ConstellationField from "./shaders/neuform-isolated/NeuformBatchEffects";

// ============================================================================
// Water source — imported directly here so it can't be tree-shaken
// ============================================================================
import waterSourceHtml from "./shaders/elements/sources/elemental-marks.html?raw";

// Locked water threshold values (handoff §4 + user-confirmed):
//   speed: 0.95
//   size (mark size): 0.65
//   particleAmount (particles): 0.18
//   hue: -1, saturation: 1.32, brightness: 1.78
const WATER_THRESHOLDS = {
  speed: 0.95,
  size: 0.65,
  particleAmount: 0.18,
  hue: -1,
  saturation: 1.32,
  brightness: 1.78,
  opacity: 1.0,
};

// ----------------------------------------------------------------------------
// Detail patches — upgrades the canonical water source HTML for production.
// Mirrors the DETAIL_PATCHES table from the original ElementsBackground.tsx but
// inlined here so we don't depend on the wrapper that was tree-shaken.
// ----------------------------------------------------------------------------
const WATER_DETAIL_PATCHES = [
  ["const SDF_SIZE = 512;\nconst SDF_SPREAD = 128;", "const SDF_SIZE = 768;\nconst SDF_SPREAD = 192;"],
  ["const DPR = Math.min(window.devicePixelRatio || 1, 1.75);", "const DPR = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2.25);"],
  ["sim: false, zoom: 1.16, shift: [0, -0.04],", "sim: false, zoom: 1.16, shift: [0, -0.11],"],
  [
    "  float inside = smoothstep(0.005, -0.005, d);\n  vec3 body = vec3(0.055, 0.06, 0.10) + big * vec3(0.55, 0.58, 0.85);\n  col = mix(col, body, inside);\n  float rim = exp(-abs(d) / 0.012) * 0.5;",
    "  float inside = smoothstep(0.0025, -0.0025, d);\n  vec3 body = vec3(0.055, 0.06, 0.10) + big * vec3(0.55, 0.58, 0.85);\n  col = mix(col, body, inside);\n  float rim = exp(-abs(d) / 0.0075) * 0.56;"
  ],
];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function buildWaterSource(html, size, particleAmount) {
  const zoom = 1.56 / clamp(size, 0.65, 1.5);
  const particleCount = Math.max(0, Math.round(160 * clamp(particleAmount, 0, 2)));
  const focusStyles = `<style data-elements-focus>
html, body, main { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #060708; }
header, .hint, .info, .kanji { display: none !important; }
main { display: block; }
.panel { display: none; }
.panel[data-fx="water"] {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  opacity: 1;
  transform: none;
  animation: none;
}
.panel[data-fx="water"] canvas { width: 100%; height: 100%; }
</style>`;
  const controls = `<script data-elements-controls>
(function () {
  var nativeNow = performance.now.bind(performance);
  var last = nativeNow();
  var virtual = last;
  var state = { speed: 1, paused: false };
  window.__ELEMENTS_PAUSED = false;
  performance.now = function () {
    var real = nativeNow();
    if (!state.paused) virtual += (real - last) * state.speed;
    last = real;
    return virtual;
  };
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'elements-controls') return;
    var next = event.data.controls || {};
    if (Number.isFinite(next.speed)) state.speed = Math.max(0, Math.min(3, next.speed));
    state.paused = Boolean(next.paused);
    window.__ELEMENTS_PAUSED = state.paused;
  });
})();
</script>`;

  let source = html;
  for (const [original, enhanced] of WATER_DETAIL_PATCHES) {
    source = source.replace(original, enhanced);
  }
  return source
    .replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/gi, "")
    .replace(/<link[^>]+fonts\.gstatic\.com[^>]*>/gi, "")
    .replace("</head>", `${focusStyles}${controls}</head>`)
    .replace("count: 160", `count: ${particleCount}`)
    .replace("zoom: 1.06", `zoom: ${zoom.toFixed(4)}`)
    .replace(
      "for (const p of panels) p.draw(t);",
      "if (!window.__ELEMENTS_PAUSED) for (const p of panels) p.draw(t);"
    );
}

// ============================================================================
// WaterLayer — inline water component (replaces ElementsBackground wrapper)
// ============================================================================
function WaterLayer({ opacity, paused }) {
  const iframeRef = useRef(null);
  const [hostVisible, setHostVisible] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);

  const source = useMemo(
    () =>
      buildWaterSource(
        waterSourceHtml,
        WATER_THRESHOLDS.size,
        WATER_THRESHOLDS.particleAmount
      ),
    []
  );

  // Post speed + paused controls to the iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        type: "elements-controls",
        controls: { speed: WATER_THRESHOLDS.speed, paused },
      },
      "*"
    );
  }, [paused, source]);

  // Pause when the iframe scrolls out of the viewport
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setHostVisible(entry?.isIntersecting ?? true)
    );
    observer.observe(iframe);
    return () => observer.disconnect();
  }, []);

  // Pause when the tab goes to background
  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setDocumentVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const actuallyPaused = paused || !hostVisible || !documentVisible;

  return (
    <div
      className="polar-water-layer"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        background: "#060708",
      }}
    >
      <iframe
        ref={iframeRef}
        title="Water element background"
        srcDoc={source}
        sandbox="allow-scripts"
        onLoad={() => {
          // Repost on iframe load so the inner rAF + speed patch start fresh
          const iframe = iframeRef.current;
          if (!iframe || !iframe.contentWindow) return;
          iframe.contentWindow.postMessage(
            {
              type: "elements-controls",
              controls: { speed: WATER_THRESHOLDS.speed, paused: actuallyPaused },
            },
            "*"
          );
        }}
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: "absolute",
          inset: 0,
          display: "block",
          width: "100%",
          height: "100%",
          border: 0,
          background: "#060708",
          opacity: clamp(opacity, 0.05, 1),
          filter: `hue-rotate(${clamp(WATER_THRESHOLDS.hue, -180, 180)}deg) saturate(${clamp(WATER_THRESHOLDS.saturation, 0, 2)}) brightness(${clamp(WATER_THRESHOLDS.brightness, 0.35, 1.8)})`,
        }}
      />
    </div>
  );
}

// ============================================================================
// CloudField — provisional placeholder
// ============================================================================
// The cloud source bundle hasn't arrived yet. This is a structural placeholder
// that occupies the correct z-layer (between constellation and water), receives
// scroll-state opacity updates the same way the others do, and has no fake
// visual content. When the cloud source arrives, swap this component's body
// for the real <PortalFieldCollection variant="cloud-field" /> import.
//
// Until then: dark transparent div, opacity-gated by scroll. The narrative
// reads as "descent into thick darkness" because of the constellation fading
// and the page background darkening; the placeholder just reserves the slot.
function CloudField({ opacity, paused }) {
  useEffect(() => {
    // No iframe, no postMessage — placeholder has no inner window to control.
    // Reserved for the real cloud source to drop into when it arrives.
  }, [opacity, paused]);
  return (
    <div
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
  const constellationOpacity =
    smoothstep(0.0, 0.05, 1 - progress) *
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
        <WaterLayer opacity={1.0} paused={paused} />
      </div>
    </div>
  );
}

// GLSL-style smoothstep for opacity curves.
function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
