/*
 * NewBackgroundVideo.jsx
 *
 * The iceberg environment: the second full-viewport layer of the
 * homepage arrival. It starts parked one viewport below the screen
 * and a single GSAP scroll timeline (built in src/main.jsx) drives it up
 * to y=0 while the constellation exits upward above it. The two
 * layers are pixel-synced in that timeline so the iceberg's top edge
 * meets the constellation's bottom edge at one meeting line, with a
 * 6% crossfade dissolving the starfield into the ice — sequential,
 * never stacked, with no gap. Afterwards the video stays fixed as the backdrop the editorial content scrolls
 * over (it sits at z-index 4, below the page-shell at z-index 6).
 *
 * The optional `rest` prop parks the layer at its final homepage position
 * (translateY(0), full-viewport) with no scroll choreography: used on
 * inner pages that share the homepage's resting environment.
 */
import { useEffect, useRef } from "react";

export default function NewBackgroundVideo({ rest = false }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const v = videoRef.current;
    const wrap = wrapRef.current;
    if (!v || !wrap) return;
    let cancelled = false;
    // Set the muted state imperatively: React does not render the muted
    // *attribute* on <video>, and the autoplay policy (especially iOS
    // Safari) keys off the muted IDL state. Belt and suspenders alongside
    // the muted JSX prop.
    v.muted = true;
    v.defaultMuted = true;
    // W2/W3 fix (2026-10-01): bound the retry loop. If the video 404s or
    // fails repeatedly, stop retrying after MAX_ATTEMPTS instead of churning
    // 404s forever. Also don't call v.load() when a load is already in
    // flight — per spec it aborts the in-progress fetch, which can prevent
    // the video from ever loading on slow connections.
    let attempts = 0;
    const MAX_ATTEMPTS = 8;
    let loadInFlight = false;
    const onError = () => {
      attempts = MAX_ATTEMPTS; // Give up; the CSS fallback covers the visual
      window.clearInterval(watchdog);
    };
    const tryPlay = () => {
      if (cancelled || !v.paused) return;
      if (attempts >= MAX_ATTEMPTS) return;
      attempts += 1;
      // iOS Safari will not autoplay a video that starts off-screen
      // (the iceberg begins a full viewport below the fold), so the
      // single play() at mount may never take effect — leaving the
      // native play button visible when the layer scrolls into view.
      // Retry whenever the layer approaches/enters the viewport and
      // as soon as data can play.
      if (v.readyState === 0 && !loadInFlight) {
        loadInFlight = true;
        v.load();
      }
      const playPromise = v.play();
      if (playPromise && playPromise.catch) playPromise.catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") tryPlay();
    };
    // iOS sometimes pauses a background video when it suspends the tab
    // or reclaims resources; resume it — nothing in the site ever pauses
    // this video on purpose.
    let pauseTimer = 0;
    const onPause = () => {
      if (cancelled) return;
      window.clearTimeout(pauseTimer);
      pauseTimer = window.setTimeout(tryPlay, 800);
    };
    v.addEventListener("canplay", tryPlay);
    v.addEventListener("loadeddata", tryPlay);
    v.addEventListener("loadeddata", () => {
      loadInFlight = false;
    });
    v.addEventListener("pause", onPause);
    document.addEventListener("visibilitychange", onVisibility);
    // W2: listen for errors to stop the retry loop on 404/failure
    v.addEventListener("error", onError);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) tryPlay();
      },
      { rootMargin: "200px 0px", threshold: 0.01 }
    );
    io.observe(wrap);
    // Safety net: close every autoplay race (slow cellular, suspended
    // tab, play() called before the muted state applied). Cheap —
    // a single property check every 2s — and it stops the moment the
    // video is playing.
    const watchdog = window.setInterval(() => {
      if (
        !cancelled &&
        v.paused &&
        document.visibilityState === "visible"
      ) {
        tryPlay();
      }
    }, 2000);
    tryPlay();
    return () => {
      cancelled = true;
      v.removeEventListener("canplay", tryPlay);
      v.removeEventListener("loadeddata", tryPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("error", onError);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(watchdog);
      window.clearTimeout(pauseTimer);
      io.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={"new-bg-layer" + (rest ? " new-bg-layer--rest" : "")}
      aria-hidden="true"
    >
      <video
        ref={videoRef}
        className="new-bg-video"
        loop
        muted
        playsInline
        disablePictureInPicture
        preload="auto"
      >
        {/* Portrait cut (2026-10-08): phones get a purpose-framed 1080x1920
            crop from the 4K master instead of a hard landscape crop —
            aurora up top, snowfields below. The browser picks the first
            source whose media query matches. */}
        <source
          src="/assets/new-bg/new-background-portrait.mp4"
          type="video/mp4"
          media="(max-width: 820px)"
        />
        <source
          src="/assets/new-bg/new-background.mp4"
          type="video/mp4"
        />
      </video>
      {/* Feather overlay: softens the video's leading edge during the
          homepage arrival so the crossfade melts instead of meeting at a
          hard line. Rides with the layer; static gradient, zero repaint. */}
      <div className="new-bg-feather" aria-hidden="true" />
    </div>
  );
}

