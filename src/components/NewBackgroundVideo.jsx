/*
 * NewBackgroundVideo.jsx
 *
 * Full-bleed background video that sits underneath the constellation layer
 * and the homepage editorial content. The video is ALWAYS fully opaque;
 * no scroll-driven opacity logic. The constellation layer (mounted by the
 * App root) physically translates upward during the environmental arrival
 * phase, revealing the video underneath.
 *
 * Sits at z-index 4 (below the constellation at z-index 5, below the
 * page-shell at z-index 6).
 */
import { useEffect, useRef } from "react";

export default function NewBackgroundVideo() {
  const videoRef = useRef(null);

  // Kick the video into motion as soon as the component mounts. Muted +
  // autoplay + playsinline keep it inline-playable on iOS Safari + Chrome
  // mobile autoplay policies. If autoplay is blocked until user
  // interaction, the first frame of the .mov (loaded via preload="auto")
  // still holds the composition.
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
    <div className="new-bg-layer" aria-hidden="true">
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
