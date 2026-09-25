/*
 * NewBackgroundVideo.jsx
 *
 * Full-bleed background video fixed behind the constellation layer
 * and the homepage editorial content. The video is static — it never
 * translates. During the environmental arrival the constellation
 * slides upward over it and dissolves at its soft bottom edge to
 * reveal the iceberg beneath (a reveal, not a meeting line), so the
 * two environments blend with no seam or gap.
 *
 * Sits at z-index 4 (below the constellation at z-index 5, below the
 * page-shell at z-index 6). The Home effect parks it at y=0 on mount;
 * the CSS pre-positions it below the viewport to avoid a one-frame
 * flash before that effect runs.
 */
import { useEffect, useRef } from "react";

export default function NewBackgroundVideo() {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);

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

