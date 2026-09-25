/*
 * NewBackgroundVideo.jsx
 *
 * The iceberg environment: the second full-viewport layer of the
 * homepage arrival. It starts parked one viewport below the screen
 * and a single GSAP scroll timeline (built in Home.jsx) drives it up
 * to y=0 while the constellation exits upward above it. The two
 * layers are pixel-synced in that timeline so the iceberg's top edge
 * meets the constellation's bottom edge at one clean meeting line —
 * sequential, never layered or blended, with no gap. Afterwards the
 * video stays fixed as the backdrop the editorial content scrolls
 * over (it sits at z-index 4, below the page-shell at z-index 6).
 */
import { useEffect, useRef } from "react";

export default function NewBackgroundVideo() {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const v = videoRef.current;
    const wrap = wrapRef.current;
    if (!v || !wrap) return;
    let cancelled = false;
    const tryPlay = () => {
      if (cancelled || !v.paused) return;
      // iOS Safari will not autoplay a video that starts off-screen
      // (the iceberg begins a full viewport below the fold), so the
      // single play() at mount may never take effect — leaving the
      // native play button visible when the layer scrolls into view.
      // Retry whenever the layer approaches/enters the viewport and
      // as soon as data can play.
      if (v.readyState === 0) v.load();
      const playPromise = v.play();
      if (playPromise && playPromise.catch) playPromise.catch(() => {});
    };
    v.addEventListener("canplay", tryPlay);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) tryPlay();
      },
      { rootMargin: "200px 0px", threshold: 0.01 }
    );
    io.observe(wrap);
    tryPlay();
    return () => {
      cancelled = true;
      v.removeEventListener("canplay", tryPlay);
      io.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="new-bg-layer"
      aria-hidden="true"
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

