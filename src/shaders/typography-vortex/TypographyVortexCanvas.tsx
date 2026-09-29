import { useEffect, useRef } from "react";
import { createTypographyVortexRenderer } from "./typographyVortexRenderer";

export type TypographyVortexCanvasProps = {
  mode?: "dark" | "light";
  phrase?: string;
  speed?: number;
  ringGrowth?: number;
  opacity?: number;
  dissolveRadius?: number;
  particleAmount?: number;
  suctionDuration?: number;
  className?: string;
};

export const TYPOGRAPHY_VORTEX_DEFAULTS = {
  mode: "dark" as const,
  phrase: "SABLE / SYSTEMS IN MOTION / ",
  speed: 1,
  ringGrowth: 1.21,
  opacity: 1,
  dissolveRadius: 1,
  particleAmount: 1,
  suctionDuration: 920,
} as const;

export function TypographyVortexCanvas({ className = "", ...props }: TypographyVortexCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const optionsRef = useRef({ ...TYPOGRAPHY_VORTEX_DEFAULTS, ...props });
  optionsRef.current = { ...TYPOGRAPHY_VORTEX_DEFAULTS, ...props };

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    // Defer the heavy renderer creation (the ring-bitmap build can block
    // the main thread for hundreds of ms) until the Tower boot overlay has
    // played through: the overlay covers ~1.1s plus a 650ms fade, so the
    // canvas initializes after the animation is done instead of hitching
    // it. The overlay hides the delay; the canvas simply fades in a beat
    // later. requestIdleCallback is layered on top when available so the
    // build also yields to any other pending main-thread work.
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      const begin = () => {
        if (cancelled) return;
        cleanup = createTypographyVortexRenderer(host, canvas, () => optionsRef.current);
      };
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(begin, { timeout: 1200 });
      } else {
        begin();
      }
    };
    const delayId = window.setTimeout(start, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(delayId);
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={`typography-vortex-component typography-vortex-component--${optionsRef.current.mode}${className ? ` ${className}` : ""}`}
      data-mode={optionsRef.current.mode}
      data-dissolve-state="ambient"
      data-suction-state="idle"
      data-particles="0"
      data-dissolve-strength="0.00"
    >
      <canvas ref={canvasRef} aria-label="Interactive typography vortex" />
      <span className="typography-vortex-component__hint">MOVE / DISSOLVE · CLICK / SUCTION</span>
    </div>
  );
}
