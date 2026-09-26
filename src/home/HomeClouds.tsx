/*
 * HomeClouds.tsx — the homepage cloud stratum (Variant C, approved).
 *
 * Real storm-cloud photography as the middle environment of the
 * homepage arrival: it rolls in as the stars thin out, owns the
 * viewport briefly, then parts to reveal the iceberg below.
 *
 * The photograph is a Pexels free-stock image (commercial use allowed,
 * no attribution required) of dark storm clouds — "Dark, heavy storm
 * clouds creating dramatic evening sky scenery" — chosen for a palette
 * that already sits near the site's night field, graded in-CSS the
 * rest of the way. 240 KB, zero runtime cost: no canvas, no video, no
 * animation loop.
 *
 * Design decisions:
 * - The life comes from the scroll timeline itself: the scaffold
 *   drives a slow scale push on `.cloud-layer-inner` plus the y-drift,
 *   so the still photograph feels like a slow aerial pass.
 * - A second, larger, darker copy of the same photograph drifts
 *   beneath at a fraction of the front layer's rate (parallax): the
 *   timeline counter-drifts it (see `data-cloud-parallax`, consumed in
 *   main.jsx) so the flat image gains genuine depth. The back layer is
 *   dimmed and blurred slightly so it reads as atmosphere, not
 *   duplication.
 * - Night grade: brightness down, saturation muted, contrast up, plus
 *   a vignette to melt the edges into the dark page.
 * - The `active` prop is accepted for interface stability (main.jsx
 *   passes it); stills need no playback gating.
 * - Never mounts under prefers-reduced-motion (the timeline that
 *   drives the mount is skipped there; the layer is display:none).
 */
import { useRef } from "react";

const SRC = "/assets/clouds/photo-19187094.jpg";

const GRADE_FILTER =
  "brightness(0.62) contrast(1.14) saturate(0.68) hue-rotate(-4deg)";

export type HomeCloudsProps = {
  /** True while the scroll timeline is inside the cloud phase. */
  active: boolean;
};

export default function HomeClouds({ active }: HomeCloudsProps) {
  const backRef = useRef<HTMLDivElement>(null);
  void active;

  return (
    <>
      {/* Back parallax stratum: same photograph, larger, darker, slower.
          The scroll timeline counter-drifts this layer at a fraction of
          the front layer's motion (data-cloud-parallax="0.45"). */}
      <div
        ref={backRef}
        aria-hidden="true"
        data-cloud-parallax="0.45"
        style={{
          position: "absolute",
          inset: "-18%",
          backgroundImage: `url(${SRC})`,
          backgroundSize: "cover",
          backgroundPosition: "50% 60%",
          filter: `${GRADE_FILTER} brightness(0.55) blur(2px)`,
          opacity: 0.85,
        }}
      />
      {/* Front stratum: the full-detail photograph. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "-8%",
          backgroundImage: `url(${SRC})`,
          backgroundSize: "cover",
          backgroundPosition: "50% 45%",
          filter: GRADE_FILTER,
        }}
      />
      {/* Vignette: melts the photograph into the dark page at the edges. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(120% 90% at 50% 45%, transparent 52%, rgba(2,6,12,0.6) 100%)",
        }}
      />
    </>
  );
}
