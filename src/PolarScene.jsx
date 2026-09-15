// PolarScene.jsx
// Antarctic Labs — unified polar environment.
//
// Constellation wrapper is inlined here (same pattern as WaterLayer) to
// bypass Vite tree-shaking that drops the wrapper module entirely when only
// one named export is consumed. Cloud placeholder is a structural slot;
// water layer uses the inline WaterLayer component.

import { useEffect, useMemo, useRef, useState } from "react";
import particleNetworkSource from "./shaders/neuform-isolated/sources/particle-network.html?raw";
import { ElementsBackground as ElementsCollection } from "./shaders/elements/ElementsBackground";

// ============================================================================
// ConstellationField — inlined minimal wrapper for the constellation effect.
// ============================================================================
function buildConstellationSource(html, size, length, density) {
  const focusStyles = `<style data-threeui-focus>
html, body { width: 100% !important; height: 100% !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #05070d !important; }
body { position: relative !important; }
body > * { visibility: hidden !important; }
body[data-threeui-ready] > [data-threeui-role] { visibility: visible !important; }
[data-threeui-residual] { display: none !important; }
[data-threeui-role="background"] { position: fixed !important; inset: 0 !important; width: 100% !important; height: 100% !important; max-width: none !important; max-height: none !important; z-index: 0 !important; opacity: 1 !important; pointer-events: none !important; }
</style>`;
  const controlsJson = JSON.stringify({
    mode: "dark",
    speed: 1.94,
    size,
    length,
    density,
    opacity: 1,
  }).replace(/</g, "\\u003c");
  const focusJson = JSON.stringify([
    { selector: "#particle-canvas", role: "background" },
  ]).replace(/</g, "\\u003c");
  const controlScript = `<script data-threeui-controls>
(function () {
  var controls = ${controlsJson};
  window.__SF_CONTROLS = controls;
  var origin = performance.now();
  var virtual = 0;
  var last = origin;
  var performanceNow = performance.now.bind(performance);
  performance.now = function () {
    var real = performanceNow();
    virtual += (real - last) * (controls.speed || 1);
    last = real;
    return origin + virtual;
  };
  var raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (callback) {
    return raf(function () { callback(performance.now()); });
  };
  function applyVisual() {
    var opacity = controls.opacity == null ? 1 : controls.opacity;
    Array.prototype.forEach.call(document.querySelectorAll('[data-threeui-role]'), function (e) { e.style.opacity = String(opacity); });
  }
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'threeui-controls') return;
    var next = event.data.controls || {};
    Object.keys(next).forEach(function (key) { controls[key] = next[key]; });
    applyVisual();
  });
  window.__SF_APPLY_CONTROLS = applyVisual;
})();
</script>`;
  const focusScript = `<script data-threeui-focus>
(function () {
  var isolated = false;
  function isolate() {
    if (isolated) return;
    var specs = ${focusJson};
    var roots = [];
    specs.forEach(function (spec) {
      var element = document.querySelector(spec.selector);
      if (!element) return;
      element.setAttribute('data-threeui-role', spec.role);
      if (!roots.some(function (root) { return root.contains(element); })) roots.push(element);
    });
    if (!roots.length) return;
    isolated = true;
    roots.forEach(function (root) { document.body.appendChild(root); });
    Array.from(document.body.children).forEach(function (element) {
      if (roots.indexOf(element) !== -1) return;
      element.setAttribute('data-threeui-residual', '');
      element.setAttribute('aria-hidden', 'true');
      if ('inert' in element) element.inert = true;
    });
    document.body.setAttribute('data-threeui-ready', '');
    if (window.__SF_APPLY_CONTROLS) window.__SF_APPLY_CONTROLS();
    requestAnimationFrame(function () { window.dispatchEvent(new Event('resize')); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(isolate, 100); }, { once: true });
  else setTimeout(isolate, 100);
  window.addEventListener('load', isolate, { once: true });
})();
</script>`;
  let patched = html;
  patched = patched
    .replace("const particleCount = 200;", `const particleCount = ${Math.max(40, Math.round(200 * density))};`)
    .replace("this.length = Math.random() * 2 + 0.5;", `this.length = (Math.random() * 2 + 0.5) * ${length};`)
    .replace("this.z -= this.speed;", "this.z -= this.speed * ((window.__SF_CONTROLS && window.__SF_CONTROLS.speed) || 1);")
    .replace("const fov = 300;", `const fov = ${Math.round(300 / Math.max(0.4, size))};`);
  return patched
    .replace(/<head([^>]*)>/i, `<head$1>${controlScript}${focusStyles}`)
    .replace(/<\/body>/i, `${focusScript}</body>`);
}

function ConstellationField({ paused }) {
  const iframeRef = useRef(null);
  const source = useMemo(
    () => buildConstellationSource(particleNetworkSource, 2.5, 0.35, 2.412),
    []
  );
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        type: "threeui-controls",
        controls: { mode: "dark", speed: 1.94, size: 2.5, length: 0.35, density: 2.412, opacity: 1, paused },
      },
      "*"
    );
  }, [paused, source]);
  return (
    <iframe
      ref={iframeRef}
      title="Constellation Field"
      srcDoc={source}
      sandbox="allow-scripts"
      onLoad={() => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) return;
        iframe.contentWindow.postMessage(
          {
            type: "threeui-controls",
            controls: { mode: "dark", speed: 1.94, size: 2.5, length: 0.35, density: 2.412, opacity: 1, paused },
          },
          "*"
        );
      }}
      aria-hidden="true"
      tabIndex={-1}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        border: 0,
        background: "transparent",
        filter: "hue-rotate(-31deg) saturate(1.52) brightness(1.65)",
      }}
    />
  );
}

// ============================================================================
// WaterLayer — inline water component (same proven pattern)
// ============================================================================
import waterSourceHtml from "./shaders/elements/sources/elemental-marks.html?raw";

const WATER_THRESHOLDS = {
  speed: 0.95,
  size: 0.65,
  particleAmount: 0.18,
  hue: -1,
  saturation: 1.32,
  brightness: 1.78,
  opacity: 1.0,
};

const WATER_DETAIL_PATCHES = [
  ["const SDF_SIZE = 512;\nconst SDF_SPREAD = 128;", "const SDF_SIZE = 768;\nconst SDF_SPREAD = 192;"],
  ["const DPR = Math.min(window.devicePixelRatio || 1, 1.75);", "const DPR = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2.25);"],
  ["sim: false, zoom: 1.16, shift: [0, -0.04],", "sim: false, zoom: 1.16, shift: [0, -0.11],"],
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
  position: absolute; inset: 0; display: block; width: 100%; height: 100%;
  border: 0; opacity: 1; transform: none; animation: none;
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
    .replace("for (const p of panels) p.draw(t);", "if (!window.__ELEMENTS_PAUSED) for (const p of panels) p.draw(t);");
}

function WaterLayer({ opacity, paused }) {
  const iframeRef = useRef(null);
  const [hostVisible, setHostVisible] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);
  const source = useMemo(
    () => buildWaterSource(waterSourceHtml, WATER_THRESHOLDS.size, WATER_THRESHOLDS.particleAmount),
    []
  );
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      { type: "elements-controls", controls: { speed: WATER_THRESHOLDS.speed, paused } },
      "*"
    );
  }, [paused, source]);
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setHostVisible(entry?.isIntersecting ?? true));
    observer.observe(iframe);
    return () => observer.disconnect();
  }, []);
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
        position: "absolute", inset: 0, width: "100%", height: "100%",
        background: "#060708",
      }}
    >
      <iframe
        ref={iframeRef}
        title="Water element background"
        srcDoc={source}
        sandbox="allow-scripts"
        onLoad={() => {
          const iframe = iframeRef.current;
          if (!iframe || !iframe.contentWindow) return;
          iframe.contentWindow.postMessage(
            { type: "elements-controls", controls: { speed: WATER_THRESHOLDS.speed, paused: actuallyPaused } },
            "*"
          );
        }}
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: "absolute", inset: 0, display: "block", width: "100%", height: "100%",
          border: 0, background: "#060708",
          opacity: clamp(opacity, 0.05, 1),
          filter: `hue-rotate(${clamp(WATER_THRESHOLDS.hue, -180, 180)}deg) saturate(${clamp(WATER_THRESHOLDS.saturation, 0, 2)}) brightness(${clamp(WATER_THRESHOLDS.brightness, 0.35, 1.8)})`,
        }}
      />
    </div>
  );
}

// ============================================================================
// CloudField — inline ThreeUI CloudField wrapper for the strata-cloud effect.
// Same proven pattern as the constellation wrapper: inline so Vite's static
// analyzer cannot tree-shake the source HTML out of the bundle.
// ============================================================================
import cloudSourceHtml from "./shaders/neuform-isolated/sources/strata-cloud.html?raw";

function buildCloudSource(html) {
  const focusStyles = `<style data-threeui-focus>
html, body { width: 100% !important; height: 100% !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #071010 !important; }
body { position: relative !important; }
/* hide the strata-cloud source's demo UI by selector so the demo cannot leak through */
nav, main, header, aside, footer {
  display: none !important;
}
/* Force the cloud canvas to fill the viewport regardless of isolate() state.
   The source's Tailwind classes (fixed, inset-0, w-full, h-full) do not apply
   because Tailwind CDN is blocked by CSP, so we set full-viewport sizing
   here in the wrapper's focusStyles. */
#c {
  display: block !important;
  visibility: visible !important;
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: 0 !important;
  pointer-events: none !important;
}
body > * { visibility: hidden !important; }
body[data-threeui-ready] > [data-threeui-role] { visibility: visible !important; }
[data-threeui-residual] { display: none !important; }
[data-threeui-role="background"] { position: fixed !important; inset: 0 !important; width: 100% !important; height: 100% !important; max-width: none !important; max-height: none !important; z-index: 0 !important; opacity: 1 !important; pointer-events: none !important; }
</style>`;
  const controlsJson = JSON.stringify({
    mode: "dark", speed: 1, size: 1, length: 1, density: 1,
    strokeWidth: 1, opacity: 1, hue: 0, saturation: 1, brightness: 1,
  }).replace(/</g, "\\u003c");
  const focusJson = JSON.stringify([
    { selector: "#c", role: "background" },
  ]).replace(/</g, "\\u003c");
  const controlScript = `<script data-threeui-controls>
(function () {
  /* no-op GSAP stub. The strata-cloud source's inline <script> uses
     gsap.registerPlugin(ScrollTrigger) and gsap.to(...) for the demo
     overlay's word-reveal animation. GSAP is loaded from a CDN script
     tag in the source's <head>, which the parent page's CSP blocks.
     Without gsap, the first gsap.registerPlugin(...) call throws
     ReferenceError and the rest of the inline script (including the
     WebGL init at line 225) never runs, leaving the canvas blank.
     This stub makes every gsap.* and ScrollTrigger.* call a no-op
     so the script proceeds past the demo-overlay setup and reaches
     canvas.getContext('webgl'). */
  var noopTimeline = { to: function() { return noopTimeline; }, from: function() { return noopTimeline; }, fromTo: function() { return noopTimeline; }, set: function() { return noopTimeline; }, stagger: function() { return noopTimeline; }, killTweensOf: function() {}, kill: function() {} };
  var noopPlugin = function() {};
  noopPlugin.refresh = function() {};
  var noopGsapFn = function() { return noopTimeline; };
  noopGsapFn.to = function() { return noopTimeline; };
  noopGsapFn.from = function() { return noopTimeline; };
  noopGsapFn.fromTo = function() { return noopTimeline; };
  noopGsapFn.set = function() { return noopTimeline; };
  noopGsapFn.registerPlugin = function() {};
  noopGsapFn.timeline = function() { return noopTimeline; };
  noopGsapFn.context = noopGsapFn;
  if (typeof window.gsap === 'undefined') window.gsap = noopGsapFn;
  if (typeof window.ScrollTrigger === 'undefined') window.ScrollTrigger = noopPlugin;

  var controls = ${controlsJson};
  window.__SF_CONTROLS = controls;
  var origin = performance.now();
  var virtual = 0;
  var last = origin;
  var performanceNow = performance.now.bind(performance);
  performance.now = function () {
    var real = performanceNow();
    virtual += (real - last) * (controls.speed || 1);
    last = real;
    return origin + virtual;
  };
  var raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (callback) {
    return raf(function () { callback(performance.now()); });
  };
  function applyVisual() {
    var opacity = controls.opacity == null ? 1 : controls.opacity;
    Array.prototype.forEach.call(document.querySelectorAll('[data-threeui-role]'), function (e) { e.style.opacity = String(opacity); });
  }
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'threeui-controls') return;
    var next = event.data.controls || {};
    Object.keys(next).forEach(function (key) { controls[key] = next[key]; });
    applyVisual();
  });
  window.__SF_APPLY_CONTROLS = applyVisual;
})();
</script>`;
  const focusScript = `<script data-threeui-focus>
(function () {
  var isolated = false;
  function isolate() {
    if (isolated) return;
    var specs = ${focusJson};
    var roots = [];
    specs.forEach(function (spec) {
      var element = document.querySelector(spec.selector);
      if (!element) return;
      element.setAttribute('data-threeui-role', spec.role);
      if (!roots.some(function (root) { return root.contains(element); })) roots.push(element);
    });
    if (!roots.length) return;
    isolated = true;
    roots.forEach(function (root) { document.body.appendChild(root); });
    Array.from(document.body.children).forEach(function (element) {
      if (roots.indexOf(element) !== -1) return;
      element.setAttribute('data-threeui-residual', '');
      element.setAttribute('aria-hidden', 'true');
      if ('inert' in element) element.inert = true;
    });
    document.body.setAttribute('data-threeui-ready', '');
    if (window.__SF_APPLY_CONTROLS) window.__SF_APPLY_CONTROLS();
    requestAnimationFrame(function () { window.dispatchEvent(new Event('resize')); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(isolate, 100); }, { once: true });
  else setTimeout(isolate, 100);
  window.addEventListener('load', isolate, { once: true });
})();
</script>`;
  return html
    .replace(/<head([^>]*)>/i, `<head$1>${controlScript}${focusStyles}`)
    .replace(/<\/body>/i, `${focusScript}</body>`);
}

function CloudField({ opacity, paused }) {
  const iframeRef = useRef(null);
  const source = useMemo(() => buildCloudSource(cloudSourceHtml), []);
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        type: "threeui-controls",
        controls: {
          mode: "dark", speed: 1, size: 1, length: 1, density: 1,
          strokeWidth: 1, opacity: opacity == null ? 1 : opacity,
          hue: 0, saturation: 1, brightness: 1, paused,
        },
      },
      "*"
    );
  }, [paused, opacity, source]);
  return (
    <div
      className="polar-layer polar-cloud"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
        opacity,
        transition: "opacity 200ms linear",
      }}
    >
    <iframe
      ref={iframeRef}
      title="Strata cloud migration field"
      srcDoc={source}
      sandbox="allow-scripts"
      onLoad={() => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) return;
        iframe.contentWindow.postMessage(
          {
            type: "threeui-controls",
            controls: {
              mode: "dark", speed: 1, size: 1, length: 1, density: 1,
              strokeWidth: 1, opacity: opacity == null ? 1 : opacity,
              hue: 0, saturation: 1, brightness: 1, paused,
            },
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
        background: "#071010",
        opacity: clamp(opacity, 0.05, 1),
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
  const cloudOpacity =
    smoothstep(0.20, 0.45, progress) *
    smoothstep(0.78, 0.94, 1 - progress);
  const waterOpacity = smoothstep(0.62, 0.78, progress);

  return (
    <div className="polar-scene" aria-hidden="true">
      <div
        className="polar-layer polar-constellation"
        style={{
          position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none",
          opacity: constellationOpacity, transition: "opacity 120ms linear",
        }}
      >
        <ConstellationField paused={paused} />
      </div>
      <CloudField opacity={cloudOpacity} paused={paused} />
      <div
        className="polar-layer polar-water"
        style={{
          position: "fixed", inset: 0, zIndex: 3, pointerEvents: "none",
          opacity: waterOpacity, transition: "opacity 240ms linear",
        }}
      >
        <WaterLayer opacity={1.0} paused={paused} />
      </div>
    </div>
  );
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
