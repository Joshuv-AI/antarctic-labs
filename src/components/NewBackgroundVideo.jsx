/*
 * NewBackgroundVideo.jsx
 *
 * Full-bleed background video that sits underneath the constellation
 * layer and the homepage editorial content. The video is ALWAYS fully
 * opaque (no scroll-driven opacity). During the environmental arrival
 * phase it starts positioned one viewport below the screen and slides
 * upward in parallel with the constellation sliding upward — the two
 * layers occupy opposite vertical positions at every moment so they
 * never visually overlap (one ending, the other beginning).
 *
 * Sits at z-index 4 (below the constellation at z-index 5, below the
 * page-shell at z-index 6). Initial transform: translateY(100vh).
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

