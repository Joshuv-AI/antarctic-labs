/*
 * NewBackgroundVideo.jsx
 *
 * Full-bleed background video that fades in as the visitor scrolls past
 * the constellation-on-top hero section. The video plays continuously,
 * anchored to the lower-center (iceberg + reflection visible, aurora
 * crown at the top half). Sits at z-index 0 below the constellation
 * (z-index 1) and below the page content (z-index 2+).
 *
 * Computes its own scroll progress directly from window.scrollY to avoid
 * coupling to the homepage component's internal ref state.
 */
import { useEffect, useRef } from "react";

export default function NewBackgroundVideo() {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);

  function smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  useEffect(() => {
    let raf = 0;
    let lastWrittenOpacity = -1;
    const wrap = wrapRef.current;
    if (!wrap) return;

    const update = () => {
      raf = 0;
      const docH = document.documentElement.scrollHeight;
      const winH = window.innerHeight;
      const max = Math.max(1, docH - winH);
      const p = Math.max(0, Math.min(1, window.scrollY / max));
      // New bg fades in 0.05 → 0.35 of scroll progress.
      const next = smoothstep(0.05, 0.35, p);
      // Only touch the DOM when the opacity actually changes by more than 0.5%.
      if (Math.abs(lastWrittenOpacity - next) > 0.005) {
        wrap.style.opacity = String(next);
        lastWrittenOpacity = next;
      }
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Kick the video into motion as soon as the component mounts. Muted +
  // autoplay + playsinline keep it inline-playable on iOS Safari + Chrome
  // mobile autoplay policies. If autoplay is blocked until user
  // interaction, the poster frame (none here, but the first frame of the
  // .mov loads via preload) still holds the composition.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const playPromise = v.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(() => {
        // Autoplay blocked until user interaction; first frame holds.
      });
    }
  }, []);

  return (
    <div
      ref={wrapRef}
      className="new-bg-layer"
      aria-hidden="true"
      style={{ opacity: 0 }}
    >
      <video
        ref={videoRef}
        className="new-bg-video"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      >
        <source
          src="/assets/new-bg/new-background.mov"
          type="video/quicktime"
        />
        <source
          src="/assets/new-bg/new-background.mov"
          type="video/mp4"
        />
      </video>
    </div>
  );
}
