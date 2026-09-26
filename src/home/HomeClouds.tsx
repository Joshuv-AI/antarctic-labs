/*
 * HomeClouds.tsx — the homepage cloud stratum (Variant A, approved).
 *
 * Vanta.js CLOUDS (MIT licensed): a GPU raymarched-noise cloud shader,
 * no image or video assets. It sits between the constellation and the
 * iceberg as the middle environment of the homepage arrival — rolling
 * in as the stars thin out, owning the viewport briefly, then parting
 * to reveal the iceberg below.
 *
 * Design decisions for the Antarctic Labs night environment:
 * - Palette graded to the site's night field: near-black blue sky, dark
 *   slate clouds with cold moonlit rims — never daylight white.
 * - All pointer/gyro controls disabled: this is a background, not a toy.
 * - The effect only exists while the scroll timeline's cloud phase is
 *   active (`active` prop): created on entry, destroyed on exit, so no
 *   GPU is burned while the layer is invisible. Never mounts under
 *   prefers-reduced-motion (the timeline that drives `active` is
 *   skipped there).
 * - The host fills `.cloud-layer-inner` (oversized by the stylesheet)
 *   so the timeline's drift/scale never reveals an edge.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
// @ts-ignore — vanta ships untyped ES source; the factory is
// `(opts) => Effect` with a `.destroy()` method on the instance.
import CLOUDS from "vanta/src/vanta.clouds.js";

export type HomeCloudsProps = {
  /** True while the scroll timeline is inside the cloud phase. */
  active: boolean;
};

export default function HomeClouds({ active }: HomeCloudsProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const effectRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (active && !effectRef.current) {
      try {
        effectRef.current = CLOUDS({
          el: host,
          THREE,
          // Night-storm grade: dark slate cloud tops over a near-black
          // blue sky, cold moonlight rims — volumetric, not haze.
          backgroundColor: 0x020408,
          skyColor: 0x030509,
          cloudColor: 0x5a6c82,
          cloudShadowColor: 0x222c3e,
          // Cold moonlight instead of the default warm sun.
          sunColor: 0x9fc0e4,
          sunGlareColor: 0x8fb0dd,
          sunlightColor: 0xbcd4f2,
          sunElevation: -0.55,
          // Slow, heavy drift — storm mass, not cotton candy.
          speed: 0.55,
          scale: 1.6,
          scaleMobile: 4.5,
          // A background must never react to the pointer.
          mouseControls: false,
          touchControls: false,
          gyroControls: false,
        });
      } catch (err) {
        // If WebGL is unavailable the layer simply stays empty; the
        // arrival still works (stars -> iceberg) with no errors thrown.
        effectRef.current = null;
      }
    }

    if (!active && effectRef.current) {
      try {
        effectRef.current.destroy();
      } catch (err) {
        /* already gone */
      }
      effectRef.current = null;
      // Vanta removes its own canvas on destroy; make sure the host is
      // clean in case a partial init left children behind.
      host.innerHTML = "";
    }

    return () => {
      if (effectRef.current) {
        try {
          effectRef.current.destroy();
        } catch (err) {
          /* already gone */
        }
        effectRef.current = null;
      }
    };
  }, [active]);

  return <div ref={hostRef} aria-hidden="true" />;
}
