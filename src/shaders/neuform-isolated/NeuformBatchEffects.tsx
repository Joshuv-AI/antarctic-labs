import { useEffect, useMemo, useRef, type CSSProperties } from "react";

import particleNetworkSource from "./sources/particle-network.html?raw";

// ============================================================================
// NeuformBatchEffects.tsx — Antarctic Labs production wrapper.
//
// ORIGINAL FILE bundled ~18 different effect source files (constellation-field,
// particle-drift, flux-vortex, portal-field, flow-field, amber-halftone, etc.)
// for an effect-browsing demo UI. We use ONE effect — particle-network — as the
// upper polar atmosphere of the antarctic-labs main page.
//
// This file is a focused, single-variant production wrapper for that effect.
// It preserves the original's iframe + srcDoc + sandbox architecture and the
// time-dilation speed control, but drops the demo's mode-toggle, demo UI,
// multiple variant dispatch, and 17 unused HTML sources.
//
// Cloud and water sources are mounted separately in PolarScene.jsx; they don't
// share this wrapper because their shaders need different setups.
// ============================================================================

type FocusRole = "background" | "ui";
type NeuformMode = "dark" | "light";

type FocusTarget = {
  selector: string;
  role: FocusRole;
  width?: string;
};

type BakeKnobs = {
  size: number;
  length: number;
  density: number;
  mode: NeuformMode;
};

type EffectDefinition = {
  title: string;
  source: string;
  background: string | ((mode: NeuformMode) => string);
  targets: readonly FocusTarget[];
  patch?: (source: string, knobs: BakeKnobs) => string;
};

export type NeuformBatchEffectProps = {
  variant?: string;
  mode?: NeuformMode;
  speed?: number;
  size?: number;
  length?: number;
  density?: number;
  opacity?: number;
  hue?: number;
  saturation?: number;
  brightness?: number;
  paused?: boolean;
  className?: string;
  style?: CSSProperties;
};

const NEUFORM_DEFAULTS = {
  mode: "dark" as NeuformMode,
  speed: 1,
  size: 1,
  length: 1,
  density: 1,
  opacity: 1,
  hue: 0,
  saturation: 1,
  brightness: 1,
};

const LIGHT_PAPER = "#eef1f6";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function scaleCount(base: number, density: number, minimum = 1) {
  return Math.max(minimum, Math.round(base * density));
}

const EFFECT_PARTICLE_NETWORK: EffectDefinition = {
  title: "Particle Network",
  source: particleNetworkSource,
  background: (mode) => (mode === "light" ? LIGHT_PAPER : "#05070d"),
  targets: [{ selector: "#particle-canvas", role: "background" }],
  patch(source, { size, length, density, mode }) {
    let next = source
      .replace(
        "const particleCount = 200;",
        `const particleCount = ${scaleCount(200, density, 40)};`
      )
      .replace(
        "this.length = Math.random() * 2 + 0.5;",
        `this.length = (Math.random() * 2 + 0.5) * ${length};`
      )
      .replace(
        "this.z -= this.speed;",
        "this.z -= this.speed * ((window.__SF_CONTROLS && window.__SF_CONTROLS.speed) || 1);"
      )
      .replace(
        "const fov = 300;",
        `const fov = ${Math.round(300 / Math.max(0.4, size))};`
      );
    if (mode === "light") {
      next = next
        .replace(
          "ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';",
          "ctx.fillStyle = 'rgba(238, 241, 246, 0.55)';"
        )
        .replace(
          "const hue = Math.random() > 0.5 ? '200, 220, 255' : '106, 157, 237';",
          "const hue = Math.random() > 0.5 ? '36, 48, 68' : '37, 99, 235';"
        );
    }
    return next;
  },
};

function buildFocusedDocument(
  definition: EffectDefinition,
  knobs: BakeKnobs & { speed: number; opacity: number }
) {
  const mode = knobs.mode;
  const background =
    typeof definition.background === "function"
      ? definition.background(mode)
      : definition.background;
  const targetJson = JSON.stringify(definition.targets).replace(/</g, "\\u003c");
  const controlsJson = JSON.stringify({
    mode,
    speed: knobs.speed,
    size: knobs.size,
    length: knobs.length,
    density: knobs.density,
    opacity: knobs.opacity,
  }).replace(/</g, "\\u003c");

  const patchedSource = definition.patch
    ? definition.patch(definition.source, {
        size: knobs.size,
        length: knobs.length,
        density: knobs.density,
        mode,
      })
    : definition.source;

  const focusStyle = `<style data-threeui-focus>
html, body { width: 100% !important; height: 100% !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: ${background} !important; }
body { position: relative !important; }
body > * { visibility: hidden !important; }
body[data-threeui-ready] > [data-threeui-role] { visibility: visible !important; }
[data-threeui-residual] { display: none !important; }
[data-threeui-role="background"] { position: fixed !important; inset: 0 !important; width: 100% !important; height: 100% !important; max-width: none !important; max-height: none !important; z-index: 0 !important; opacity: 1 !important; pointer-events: none !important; }
</style>`;

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
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-threeui-role]'),
      function (element) { element.style.opacity = String(opacity); }
    );
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
    var specs = ${targetJson};
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(isolate, 100); }, { once: true });
  } else {
    setTimeout(isolate, 100);
  }
  window.addEventListener('load', isolate, { once: true });
})();
</script>`;

  return patchedSource
    .replace(/<head([^>]*)>/i, `<head$1>${controlScript}${focusStyle}`)
    .replace(/<\/body>/i, `${focusScript}</body>`);
}

export default function ConstellationField({
  variant = "particle-network",
  mode = NEUFORM_DEFAULTS.mode,
  speed = NEUFORM_DEFAULTS.speed,
  size = NEUFORM_DEFAULTS.size,
  length = NEUFORM_DEFAULTS.length,
  density = NEUFORM_DEFAULTS.density,
  opacity = NEUFORM_DEFAULTS.opacity,
  hue = NEUFORM_DEFAULTS.hue,
  saturation = NEUFORM_DEFAULTS.saturation,
  brightness = NEUFORM_DEFAULTS.brightness,
  paused = false,
  className,
  style,
}: NeuformBatchEffectProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const safeMode: NeuformMode = mode === "light" ? "light" : "dark";
  const safeSpeed = clamp(speed, 0, 3);
  const safeSize = clamp(size, 0.05, 200);
  const safeLength = clamp(length, 0.35, 2.5);
  const safeDensity = clamp(density, 0.25, 2.5);
  const safeOpacity = clamp(opacity, 0.05, 1);
  const safeHue = clamp(hue, -180, 180);
  const safeSaturation = clamp(saturation, 0, 2);
  const safeBrightness = clamp(brightness, 0.35, 1.65);

  const source = useMemo(
    () =>
      buildFocusedDocument(EFFECT_PARTICLE_NETWORK, {
        mode: safeMode,
        speed: NEUFORM_DEFAULTS.speed, // baked; live updates via postMessage
        size: safeSize,
        length: safeLength,
        density: safeDensity,
        opacity: NEUFORM_DEFAULTS.opacity,
      }),
    [safeMode, safeDensity, safeLength, safeSize]
  );

  useEffect(() => {
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    frame.postMessage(
      {
        type: "threeui-controls",
        controls: {
          mode: safeMode,
          speed: safeSpeed,
          size: safeSize,
          length: safeLength,
          density: safeDensity,
          opacity: safeOpacity,
          paused,
        },
      },
      "*"
    );
  }, [safeMode, safeSpeed, safeSize, safeLength, safeDensity, safeOpacity, paused, source]);

  const filter =
    safeHue === 0 && safeSaturation === 1 && safeBrightness === 1
      ? undefined
      : `hue-rotate(${safeHue}deg) saturate(${safeSaturation}) brightness(${safeBrightness})`;

  return (
    <iframe
      ref={iframeRef}
      className={className}
      title={EFFECT_PARTICLE_NETWORK.title}
      srcDoc={source}
      sandbox="allow-scripts"
      loading="eager"
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        border: 0,
        background: "transparent",
        filter,
        ...style,
      }}
    />
  );
}
