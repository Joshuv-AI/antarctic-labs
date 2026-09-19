// PolarScene.jsx
// Antarctic Labs — unified polar environment.
//
// Background layers:
//   1. polar-constellation — opening particle/rain field
//   2. polar-aura          — WebGL mountain + procedural polar environment
//
// The previous full-screen "polar-fog" overlay has been removed.
// The environment itself is responsible for atmosphere, depth, and
// transitions. No translucent page-sized veil is placed over the world.
//
// The Aura renderer remains isolated inside its iframe so WebGL/GLB
// failures cannot destabilize the React page.

import { useEffect, useRef, useState } from "react";
import {
  DefenseLines as ConstellationFieldNew,
} from "./shaders/neuform-isolated/NeuformBatchEffects";

const AURA_RENDERER_URL = "/assets/aura-renderer.html";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(
    1,
    Math.max(0, (x - edge0) / (edge1 - edge0))
  );

  return t * t * (3 - 2 * t);
}

// ============================================================================
// AuraBorealisField
// ============================================================================

function AuraBorealisField({ opacity, paused }) {
  const iframeRef = useRef(null);

  const sendControls = () => {
    const iframe = iframeRef.current;

    if (!iframe || !iframe.contentWindow) {
      return;
    }

    iframe.contentWindow.postMessage(
      {
        type: "aura-controls",
        controls: {
          paused: Boolean(paused),
        },
      },
      "*"
    );
  };

  useEffect(() => {
    sendControls();
  }, [paused]);

  return (
    <div
      className="polar-layer polar-aura"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
        opacity: clamp(opacity, 0.05, 1),
        transition: "opacity 160ms linear",
      }}
    >
      <iframe
        ref={iframeRef}
        title="Aura Borealis polar background"
        src={AURA_RENDERER_URL}
        onLoad={sendControls}
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: "absolute",
          inset: 0,
          display: "block",
          width: "100%",
          height: "100%",
          border: 0,
          background: "transparent",
        }}
      />
    </div>
  );
}

// ============================================================================
// PolarScene
// ============================================================================

export default function PolarScene() {
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const rafRef = useRef(null);

  useEffect(() => {
    let ticking = false;

    const compute = () => {
      const maxScroll = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight
      );

      const nextProgress = Math.min(
        1,
        Math.max(
          0,
          window.scrollY / maxScroll
        )
      );

      setProgress(nextProgress);
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) {
        return;
      }

      ticking = true;
      rafRef.current = requestAnimationFrame(compute);
    };

    const onVisibility = () => {
      setPaused(document.hidden);
    };

    compute();

    window.addEventListener(
      "scroll",
      onScroll,
      { passive: true }
    );

    document.addEventListener(
      "visibilitychange",
      onVisibility
    );

    return () => {
      window.removeEventListener(
        "scroll",
        onScroll
      );

      document.removeEventListener(
        "visibilitychange",
        onVisibility
      );

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // --------------------------------------------------------------------------
  // OPENING CONSTELLATION
  // --------------------------------------------------------------------------
  //
  // Keep the existing opening particle field behavior. It should naturally
  // yield to the mountain environment rather than requiring a fog/veil
  // transition layer.

  const constellationOpacity =
    smoothstep(
      0.0,
      0.05,
      1 - progress
    ) *
    smoothstep(
      0.42,
      0.62,
      1 - progress
    );

  // --------------------------------------------------------------------------
  // AURA
  // --------------------------------------------------------------------------
  //
  // Keep the mountain environment visible for most of the page. The gradual
  // fade near the bottom is intentional: the site should transition from
  // cinematic environment toward the lower content without putting a
  // translucent screen between the viewer and the world.

  const auraOpacity =
    1 -
    smoothstep(
      0.68,
      0.96,
      progress
    );

  return (
    <div
      className="polar-scene"
      aria-hidden="true"
    >
      {/* --------------------------------------------------------------- */}
      {/* OPENING CONSTELLATION                                            */}
      {/* --------------------------------------------------------------- */}

      <div
        className="polar-layer polar-constellation"
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 4,
          pointerEvents: "none",
          opacity: constellationOpacity,
          transition: "opacity 160ms linear",
        }}
      >
        <ConstellationFieldNew
          variant="defense-lines"
          mode="dark"
          speed={3.0}
          size={0.35}
          length={0.35}
          density={1.99}
          opacity={1.0}
          hue={1}
          saturation={0.0}
          brightness={1.65}
        />
      </div>

      {/* --------------------------------------------------------------- */}
      {/* AURA / MOUNTAIN ENVIRONMENT                                      */}
      {/* --------------------------------------------------------------- */}

      <AuraBorealisField
        opacity={auraOpacity}
        paused={paused}
      />
    </div>
  );
}