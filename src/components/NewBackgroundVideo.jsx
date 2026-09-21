/*
 * NewBackgroundVideo.jsx
 *
 * Full-bleed background video that fades in as the visitor scrolls past
 * the constellation-on-top hero section. The video plays continuously,
 * anchored to the lower-center (iceberg + reflection visible, aurora
 * crown at the top half). Sits at z-index 0 below the constellation
 * (z-index 1) and below the page content (z-index 2+).
 *
 * Driven by the same scroll-progress signal main.jsx already exports
 * (scrollY / maxScroll), so the crossfade stays in lock-step with the
 * constellation fade-out. Falls back gracefully if the page is rendered
 * without the scroll provider (component just sits at full opacity).
 */
import { useEffect, useRef, useState } from "react";

export default function NewBackgroundVideo({ progressRef }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const [opacity, setOpacity] = useState(0);

  // Crossfade math matches the prototype — same smoothstep envelope.
  // Constellation fades out 0.02 → 0.30; new-bg fades in 0.05 → 0.35.
  function smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const p = progressRef?.current ?? 0;
      const next = smoothstep(0.05, 0.35, p);
      setOpacity((prev) => (Math.abs(prev - next) > 0.005 ? next : prev));
    };
    // Read scroll position directly so we don't need a React state
    // update per frame — paint only when the value crosses 0.5%.
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [progressRef]);

  // Kick the video into motion as soon as the component mounts. The
  // muted + autoplay + playsinline attributes keep it inline-playable
  // on iOS Safari and Chrome mobile policies.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {
      // Autoplay can be blocked until the user interacts; the muted
      // + playsinline attributes keep this rare. If it ever happens,
      // the poster frame still holds the composition.
    });
  }, []);

  return (
    <div
      ref={wrapRef}
      className="new-bg-layer"
      aria-hidden="true"
      style={{ opacity }}
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
