/*
 * HomeClouds.tsx — the homepage cloud stratum (Variant B, approved).
 *
 * A real storm-cloud film as the middle environment of the homepage
 * arrival: it rolls in as the stars thin out, owns the viewport
 * briefly, then parts to reveal the iceberg below.
 *
 * The footage is "Dramatic Storm Clouds Timelapse in Gray Sky" by
 * Larkkid Dung (Pexels free-stock, commercial use allowed, no
 * attribution required): 26 seconds of continuous overcast storm
 * motion with no sky openings. It is transcoded to 720p for weight
 * (2.1 MB) and graded in-CSS to the site's night field so it reads as
 * part of the same world as the constellation and the iceberg.
 *
 * Design decisions:
 * - The clip loops muted/playsInline with the same hardened autoplay
 *   pattern as the iceberg video (imperative muted state, retry on
 *   intersection/visibility, watchdog) — background video must never
 *   show a native play overlay or stall on iOS.
 * - Playback is gated on the `active` prop: the video plays only while
 *   the scroll timeline is inside the cloud phase, and pauses outside
 *   it. preload="auto" keeps the first frame ready before the fade-in.
 * - The host fills `.cloud-layer-inner` (oversized); the video itself
 *   is object-fit: cover, so the timeline's drift/scale never reveals
 *   an edge.
 * - Never mounts under prefers-reduced-motion (the timeline that
 *   drives `active` is skipped there; the layer is display:none).
 */
import { useEffect, useRef } from "react";

const SRC = "/assets/clouds/storm-clouds.mp4";

// Night grade for the footage: deep pull-down, lifted contrast for
// structure, muted saturation, so the clip sits inside the site's dark
// field instead of reading as daylight video.
const GRADE_FILTER = "brightness(0.40) contrast(1.35) saturate(0.50)";
const COOL_TINT =
  "linear-gradient(rgba(28,48,88,0.22), rgba(12,24,52,0.26))";

export type HomeCloudsProps = {
  /** True while the scroll timeline is inside the cloud phase. */
  active: boolean;
};

export default function HomeClouds({ active }: HomeCloudsProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  // Hardened background-video playback (mirrors NewBackgroundVideo):
  // muted autoplay that survives iOS suspension and slow networks.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let cancelled = false;
    v.muted = true;
    v.defaultMuted = true;
    const tryPlay = () => {
      if (cancelled || !v.paused) return;
      if (v.readyState === 0) v.load();
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && activeRef.current)
        tryPlay();
    };
    let pauseTimer = 0;
    const onPause = () => {
      if (cancelled) return;
      window.clearTimeout(pauseTimer);
      pauseTimer = window.setTimeout(() => {
        if (activeRef.current) tryPlay();
      }, 800);
    };
    v.addEventListener("canplay", tryPlay);
    v.addEventListener("loadeddata", tryPlay);
    v.addEventListener("pause", onPause);
    document.addEventListener("visibilitychange", onVisibility);
    const watchdog = window.setInterval(() => {
      if (
        !cancelled &&
        v.paused &&
        activeRef.current &&
        document.visibilityState === "visible"
      ) {
        tryPlay();
      }
    }, 2000);
    // Warm the decoder early so the first visible frame is ready.
    tryPlay();
    return () => {
      cancelled = true;
      v.removeEventListener("canplay", tryPlay);
      v.removeEventListener("loadeddata", tryPlay);
      v.removeEventListener("pause", onPause);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(watchdog);
      window.clearTimeout(pauseTimer);
    };
    // Mount-only: the active flag is handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gate playback on the cloud phase: play on entry, pause on exit.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      if (v.readyState === 0) v.load();
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    } else {
      v.pause();
    }
  }, [active]);

  return (
    <>
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        disablePictureInPicture
        preload="auto"
        aria-hidden="true"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "50% 45%",
          filter: GRADE_FILTER,
        }}
      >
        <source src={SRC} type="video/mp4" />
      </video>
      {/* Cool tint: pushes the graded grays toward the site's slate-blue
          night palette. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: COOL_TINT,
        }}
      />
      {/* Soft vignette: melts the footage into the dark page at the edges. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(2,6,12,0.55) 100%)",
        }}
      />
    </>
  );
}
