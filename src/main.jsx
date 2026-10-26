import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { createRoot } from "react-dom/client";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./styles.css";
import "./shaders/threeui.css";
import NewBackgroundVideo from "./components/NewBackgroundVideo.jsx";
import StarfieldCanvas from "./components/StarfieldCanvas.jsx";
import { initAnalytics, trackPageview } from "./lib/analytics.js";
// Silent recovery on chunk-load failure (2026-10-14, hardened 2026-10-17).
// Deploys ship new hashed chunk filenames; a cached index.html (or an
// interrupted fetch) can reference a chunk that no longer exists, which
// otherwise renders a blank page or the error panel.
//
// Two layers of defense:
//  1. Transient failures (the common case after the device slept or a tab
//     was restored — the radio is still reconnecting) are retried twice
//     with a short backoff. A reload for a blip the retry would have
//     absorbed is what used to surface the error panel.
//  2. On persistent failure we reload exactly once: the fresh index.html
//     carries the current chunk graph, so the retry succeeds.
//
// The reload marker is time-bounded (10 min): a marker left behind by a
// killed tab that never completed its reload must not suppress a fresh
// silent reload days later — that stale-marker case is what made the
// error panel appear "sometimes" on tab restore. An in-memory fallback
// covers environments where sessionStorage throws (private mode). The
// marker is never cleared on success: with several lazy chunks in flight,
// a succeeding chunk would wipe the marker of a concurrently failing one
// and re-arm its reload, looping forever.
const CHUNK_RELOAD_KEY = "al-chunk-reload-v1";
const CHUNK_RELOAD_TTL_MS = 10 * 60 * 1000;
let chunkReloadedAtMemory = 0;
function chunkReloadedAt() {
  let fromStorage = 0;
  try {
    const raw = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    const t = raw ? parseInt(raw, 10) : 0;
    fromStorage = Number.isFinite(t) ? t : 0;
  } catch (e) {}
  return Math.max(fromStorage, chunkReloadedAtMemory);
}
function markChunkReloaded() {
  const now = Date.now();
  chunkReloadedAtMemory = now;
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch (e) {}
}
function clearChunkReloadFlag() {
  chunkReloadedAtMemory = 0;
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch (e) {}
}
function chunkReloadFresh() {
  const t = chunkReloadedAt();
  return t > 0 && Date.now() - t < CHUNK_RELOAD_TTL_MS;
}
// Wrap a dynamic import(): on failure retry twice with backoff, then do
// the single silent reload, otherwise rethrow for the error boundary.
// NOTE: success deliberately does NOT clear the reload marker. Clearing it
// on every successful chunk load re-armed the reload for a concurrently
// failing chunk (its decision ran after the clear) and produced a reload
// loop. The marker is time-bounded (10 min), which is the only expiry it
// needs; a later failure inside the window surfaces the error panel, whose
// TRY AGAIN still offers a full reload.
function importWithChunkRetry(importer, attempt = 0) {
  return importer().then(
    (mod) => mod,
    (err) => {
      if (attempt < 2) {
        return new Promise((resolve) =>
          setTimeout(resolve, 350 * (attempt + 1))
        ).then(() => importWithChunkRetry(importer, attempt + 1));
      }
      if (!chunkReloadFresh()) {
        markChunkReloaded();
        window.location.reload();
        // The reload is in flight: return a never-settling promise so this
        // render never commits a broken state and the user never sees an
        // error flash before the fresh page arrives.
        return new Promise(() => {});
      }
      throw err;
    }
  );
}
// A page must never render blank: if a route chunk fails to load (after the
// one-shot reload above) or a page throws during render, swap in a minimal
// recovery panel with a retry instead of a white screen. The boundary is
// keyed per path in App, so a failed route can't poison the next
// navigation — every navigation gets a fresh boundary.
class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch() {
    // Deliberately quiet: the fallback panel is the user-facing signal.
  }
  handleRetry = () => {
    // A render crash can leave poisoned module state behind (a half-
    // evaluated chunk, a rejected cached promise) that an in-place retry
    // would just hit again — and a stale cached index.html can keep
    // pointing at purged chunks. A full reload is the reliable recovery.
    // Clear the reload marker first so the fresh boot keeps its silent
    // reload if a chunk fetch fails again.
    clearChunkReloadFlag();
    window.location.reload();
  };
  render() {
    if (this.state.error) {
      return <RouteErrorFallback onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
// Shield for decorative WebGL layers (hero shaders, the orbital sphere,
// the typography vortex). If one throws while mounting or rendering — a
// GPU or context failure on a single device is enough — the shield swaps
// in nothing and the page itself renders normally. A visual effect must
// never be able to surface the route error panel. (2026-10-21: the
// homepage alone was hitting the panel; its three.js layer is the one
// most pages never mount.)
class WebGLShield extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch() {}
  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}
// Minimal recovery panel. Only ever renders after a genuine failure — it
// reuses the existing 404 page's classes so it reads as part of the site,
// not as a browser error.
function RouteErrorFallback({ onRetry }) {
  return (
    <main
      className="page-shell inner-page"
      id="main-content"
      tabIndex={-1}
    >
      <section className="inner-hero section">
        <div className="section-index">
          ANTARCTIC LABS
        </div>
        <h1>
          THIS PAGE
          <br />
          <em>DIDN'T LOAD.</em>
        </h1>
        <p className="body-copy">
          Something interrupted this page
          before it finished loading.
        </p>
        <button
          type="button"
          className="text-link"
          onClick={onRetry}
        >
          TRY AGAIN
          <span aria-hidden="true">
            ↗
          </span>
        </button>
      </section>
    </main>
  );
}
// Perf (2026-10-01): route-specific WebGL components are lazy-loaded.
// three.js (~600KB) was shipping to all 15 routes but only renders on
// /government-contracting. TypographyVortexCanvas only on Tower routes.
// Lazy-loading drops the main bundle ~60%.
// (2026-10-14): wrapped in importWithChunkRetry — a stale cached chunk
// reference reloads once, silently, instead of blanking the page.
// (2026-10-22): the homepage constellation is no longer the lazy
// DefenseLines iframe — its canvas stopped painting in production and
// the opening sky rendered empty. It is now the self-contained
// StarfieldCanvas (imported with the shell components below): one
// canvas, no iframe, no CDN, no chunk that can fail silently.
import { AnimatedTopDock } from "./shaders/animated-top-dock/AnimatedTopDock.tsx";
const TypographyVortexCanvas = lazy(() =>
  importWithChunkRetry(() =>
    import("./shaders/typography-vortex/TypographyVortexCanvas.tsx")
  ).then((m) => ({ default: m.TypographyVortexCanvas }))
    // A decorative shader that fails to load or evaluate must never take
    // the page down with it: substitute an empty component instead of
    // throwing into the route error boundary. (2026-10-21)
    .catch(() => ({ default: () => null }))
);
const OrbitalSphereBackground = lazy(() =>
  importWithChunkRetry(() =>
    import("./shaders/orbital-sphere/OrbitalSphereBackground.tsx")
  ).then((m) => ({ default: m.OrbitalSphereBackground }))
    // A decorative shader that fails to load or evaluate must never take
    // the page down with it: substitute an empty component instead of
    // throwing into the route error boundary. (2026-10-21)
    .catch(() => ({ default: () => null }))
);
import { site as content } from "./content/site.js";
import { matchRoute, legacyRedirect } from "./content/routes.js";
import { applyMeta } from "./seo.js";
// Lazy Tower catalog (see ./lib/catalog.js): prefetched on Tower navigation
// so the chunk usually arrives before the route needs it.
import { loadBootstrap, isCatalogPending } from "./lib/catalog.js";
// Route-level code-splitting (2026-10-14): every destination page lives in
// ./pages.jsx, which also pulls the 256KB tower-files manifest, the deep
// search libs, and the reader UI. Importing it eagerly put all of that in
// the initial bundle for every visitor. Each page is now a lazy() slice of
// ONE shared chunk: it downloads on first navigation (or first FAQ render
// on the homepage) and is cached for the rest of the session. The in-app
// PageCurtain beat covers the fetch; the RouteErrorBoundary covers a failed
// fetch with a retry instead of a blank screen.
const importPagesChunk = () => importWithChunkRetry(() => import("./pages.jsx"));
// One shared promise for the pages chunk: every lazy route slice awaits the
// same import, so a failure produces exactly one recovery decision (one
// silent reload) instead of one per mounted route. Rejections are never
// cached — a failed chain must not poison later callers; the next caller
// starts a fresh attempt (which, with a fresh reload marker, throws to the
// error boundary instead of reloading in a loop).
let pagesChunkPromise = null;
const sharedPagesChunk = () => {
  if (!pagesChunkPromise) {
    pagesChunkPromise = importPagesChunk();
    pagesChunkPromise.catch(() => {
      pagesChunkPromise = null;
    });
  }
  return pagesChunkPromise;
};
const lazyPage = (name) =>
  lazy(() =>
    sharedPagesChunk().then((m) => ({ default: m[name] }))
  );
const TowerOfBabel = lazyPage("TowerOfBabel");
const LibraryArtifact = lazyPage("LibraryArtifact");
const SuggestEntry = lazyPage("SuggestEntry");
const CommissionsDesk = lazyPage("CommissionsDesk");
const DonatePage = lazyPage("DonatePage");
const Government = lazyPage("Government");
const About = lazyPage("About");
const PrivacyPage = lazyPage("PrivacyPage");
const ServiceDetail = lazyPage("ServiceDetail");
const TowerApiPage = lazyPage("TowerApiPage");
// FaqBlock stays available from the shared lazy pages chunk for the
// pages that still render one; the homepage no longer renders an FAQ.
const FaqBlock = lazyPage("FaqBlock");
gsap.registerPlugin(ScrollTrigger);
// iOS Safari perf (2026-10-01, researched): the address bar showing/hiding
// resizes the viewport, which triggers ScrollTrigger.refresh() and stalls
// scroll momentum. Ignore mobile resize events — the layout doesn't depend
// on the exact viewport height.
ScrollTrigger.config({ ignoreMobileResize: true });
// Take scroll behavior fully under app control. With the default "auto"
// restoration, browsers (notably iOS Safari) can reinstate a stale scroll
// position around pushState/popstate, which is what landed some page
// navigations mid-page instead of at the top. "manual" disables that, so
// the app's own page-change scroll below is the only thing that moves the
// viewport. Runs at module load, before the browser's load-time restoration.
if (typeof history !== "undefined" && "scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}
// Scroll to the top instantly. The site's CSS sets
// `html { scroll-behavior: smooth }`, so a bare window.scrollTo(0, 0)
// becomes an animated scroll — and a DOM swap mid-animation can stall or
// cancel it, which is what occasionally left new pages sitting mid-page.
// Forcing "auto" for this one call makes the jump synchronous.
function scrollToTopInstant() {
  const root = document.documentElement;
  const prev = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  const se = document.scrollingElement;
  if (se) {
    se.scrollTop = 0;
  } else {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }
  root.style.scrollBehavior = prev;
}
function pathLabel(path) {
  if (path === "/") return "ANTARCTIC LABS";
  return path.replace("/", "").replaceAll("-", " ").toUpperCase();
}
// Map the current route to the animated dock's active item id.
function dockActiveId(path) {
  if (path === "/") return "home";
  if (path === "/tower-of-babel" || path.startsWith("/tower-of-babel/"))
    return "tower";
  if (path === "/government-contracting") return "gov";
  if (path === "/about") return "about";
  // Service pages: a sentinel no dock item matches, so nothing highlights.
  if (path.startsWith("/services/")) return "services";
  return undefined;
}
function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [transitioning, setTransitioning] = useState(false);
  // Tower of Babel in-app boot loader: shown when the library is entered
  // via client-side navigation (the index.html overlay only covers the
  // initial page load). Dismissed when the library reports it has painted.
  const [towerBoot, setTowerBoot] = useState(false);
  const [towerBootLeaving, setTowerBootLeaving] = useState(false);
  const towerBootStarted = useRef(0);
  const towerBootTimers = useRef([]);
  const clearTowerBootTimers = () => {
    towerBootTimers.current.forEach(clearTimeout);
    towerBootTimers.current = [];
  };
  const dismissTowerBoot = useCallback(() => {
    clearTowerBootTimers();
    setTowerBootLeaving(true);
    const t = setTimeout(() => {
      setTowerBoot(false);
      setTowerBootLeaving(false);
    }, 650);
    towerBootTimers.current.push(t);
  }, []);
  const handleTowerReady = useCallback(() => {
    // Keep the loader up for at least ~1.1s so the animation reads.
    const elapsed = Date.now() - towerBootStarted.current;
    const wait = Math.max(0, 1100 - elapsed);
    const t = setTimeout(dismissTowerBoot, wait);
    towerBootTimers.current.push(t);
  }, [dismissTowerBoot]);
  // Raise the Tower boot loader with its hard failsafe. The failsafe is
  // catalog-aware: if the catalog chunk is still downloading at 4s, it
  // re-arms once (8s absolute cap) instead of dismissing to a blank page.
  // Either way the overlay can never trap the user.
  const raiseTowerBoot = useCallback(() => {
    clearTowerBootTimers();
    setTowerBootLeaving(false);
    setTowerBoot(true);
    towerBootStarted.current = Date.now();
    // Prefetch the bootstrap chunk now (43KB, instant) — the route awaits
    // the same cached promise, so this head start is usually the whole fetch.
    // The full index is NOT started here anymore (Stage 1 ungating,
    // 2026-10-23): it begins on visitor intent or the idle schedule —
    // see requestCatalogIndex/scheduleCatalogIndex in lib/catalog.js.
    loadBootstrap().catch(() => {});
    const t = setTimeout(() => {
      if (isCatalogPending()) {
        const t2 = setTimeout(dismissTowerBoot, 4000);
        towerBootTimers.current.push(t2);
      } else {
        dismissTowerBoot();
      }
    }, 4000);
    towerBootTimers.current.push(t);
  }, [dismissTowerBoot]);
  // Antarctic Labs branded loader for dock navigation: the same mark +
  // hairline ceremony as the homepage entrance ritual, raised on demand
  // when the dock goes to a non-Tower section. Tower of Babel keeps its
  // own unique animation.
  const [brandBoot, setBrandBoot] = useState(false);
  const [brandBootLeaving, setBrandBootLeaving] = useState(false);
  const brandBootTimers = useRef([]);
  const clearBrandBootTimers = () => {
    brandBootTimers.current.forEach(clearTimeout);
    brandBootTimers.current = [];
  };
  const dismissBrandBoot = useCallback(() => {
    clearBrandBootTimers();
    setBrandBootLeaving(true);
    const t = setTimeout(() => {
      setBrandBoot(false);
      setBrandBootLeaving(false);
    }, 450);
    brandBootTimers.current.push(t);
  }, []);
  const raiseBrandBoot = useCallback(() => {
    clearBrandBootTimers();
    setBrandBootLeaving(false);
    setBrandBoot(true);
    // Let the mark + hairline animation read, then fade. Hard failsafe
    // so the overlay can never trap the user.
    brandBootTimers.current.push(setTimeout(dismissBrandBoot, 1450));
    brandBootTimers.current.push(setTimeout(dismissBrandBoot, 4000));
  }, [dismissBrandBoot]);
  useEffect(() => {
    const raw = window.location.pathname;
    const target = legacyRedirect(raw);
    if (target && target !== raw) {
      window.history.replaceState({}, "", target);
      setPath(target);
    }
  }, []);
  useEffect(() => {
    const onPop = () => {
      const raw = window.location.pathname;
      const target =
        legacyRedirect(raw) ||
        (matchRoute(raw) ? raw : "/404");
      if (target !== raw) {
        window.history.replaceState({}, "", target);
      }
      setPath(target);
      dismissTowerBoot();
      dismissBrandBoot();
      scrollToTopInstant();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [dismissTowerBoot, dismissBrandBoot]);
  // Cold load directly onto a Tower destination: the index.html overlay
  // covers the bundle download, but the catalog chunk still has to load
  // after React mounts. Raise the branded loader so the fetch never plays
  // out on a blank page — it dismisses via onReady (or the failsafe) just
  // like in-app navigation. The landing page is light enough to skip this;
  // its own prefetch warms the chunk for ENTER THE LIBRARY.
  useEffect(() => {
    const p = window.location.pathname;
    const isTowerDest =
      p === "/tower-of-babel/library" ||
      p === "/tower-of-babel/donate" ||
      (p.startsWith("/tower-of-babel/library/") &&
        p !== "/tower-of-babel/library/suggest");
    if (isTowerDest) raiseTowerBoot();
    // Mount only: this is the cold-load path; in-app navigation goes
    // through go().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    applyMeta(path);
  }, [path]);
  // Analytics: start the lazy loader once, then one anonymous pageview per
  // route. trackPageview queues until posthog-js arrives, so early routes
  // are not lost; if the library never loads, nothing here can throw.
  useEffect(() => {
    initAnalytics();
  }, []);
  useEffect(() => {
    trackPageview(path);
  }, [path]);
  // Every page starts at the top. This runs after React commits the new
  // page's DOM (effects fire post-commit), then waits two animation frames
  // so layout is settled before scrolling. The previous approach scrolled
  // inside go() before the new DOM existed, which let the browser keep a
  // stale mid-page offset on some navigations. Covers every route, since
  // all pages render through `path`.
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        // Instant, not smooth: the path effect is the guarantee that every
        // page lands at the top, and it must not be an interruptible
        // animation.
        scrollToTopInstant();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [path]);
  const go = (to) => {
    if (to === path || transitioning) return;
    const canonical = legacyRedirect(to) || to;
    if (to === path || canonical === path) return;
    // Warm the lazy pages chunk the moment navigation is committed: the
    // 520ms/150ms curtain beat below becomes fetch head-start, so the
    // chunk usually arrives before the new route renders. Best-effort
    // only (raw import, no retry) — a failure here is handled by the
    // render path's chunk-retry logic when the route actually mounts.
    // Fires only on real navigation intent, never speculatively, so no
    // bandwidth is wasted.
    import("./pages.jsx").catch(() => {});
    // Entering the Tower of Babel (landing, library, donate, or any entry
    // page) from inside the app: raise the Tower loader so the transition
    // gets the same branded beat as the initial page load and the ENTER THE
    // LIBRARY button. The suggest-an-entry form is excluded: it is a
    // lightweight form, not a destination, and it never reports ready — so
    // the boot overlay would sit on it until the 4s failsafe. It uses the
    // standard fast swap instead. Donate reports ready on mount, so it is
    // safe to include.
    const enteringTower =
      (canonical === "/tower-of-babel" ||
        canonical === "/tower-of-babel/library" ||
        canonical === "/tower-of-babel/donate" ||
        (canonical.startsWith("/tower-of-babel/library/") &&
          canonical !== "/tower-of-babel/library/suggest")) &&
      path !== canonical;
    if (enteringTower) {
      dismissBrandBoot();
      raiseTowerBoot();
    } else {
      dismissTowerBoot();
    }
    setTransitioning(true);
    // Tower routes get a shorter swap delay: the Tower boot overlay is
    // already covering the screen, so the full 520ms curtain beat is pure
    // added latency before the new page even starts mounting. Other routes
    // keep the standard delay for their curtain choreography.
    const swapDelay = enteringTower ? 150 : 520;
    window.setTimeout(() => {
      window.history.pushState({}, "", canonical);
      setPath(canonical);
      scrollToTopInstant();
      window.setTimeout(() => {
        setTransitioning(false);
      }, 80);
    }, swapDelay);
  };
  // Dock navigation: every section except Tower of Babel gets the
  // Antarctic Labs branded loader; Tower keeps its own unique animation.
  const goDock = (to) => {
    const canonical = legacyRedirect(to) || to;
    if (canonical === path || to === path) return;
    const isTower =
      canonical === "/tower-of-babel" ||
      canonical === "/tower-of-babel/library" ||
      canonical === "/tower-of-babel/donate" ||
      canonical.startsWith("/tower-of-babel/library/");
    if (!isTower) raiseBrandBoot();
    go(to);
  };
  const match = matchRoute(path);
  const pageParams =
    match && typeof match === "object"
      ? match.params
      : {};
  const matchedPattern =
    match && typeof match === "object"
      ? match.pattern
      : match;
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {/* Animated top dock (ThreeUI modern variant) — the site's command
          bar, carrying the four in-scope routes. Exact configured motion:
          proximity 122, spring 0.19, damping 0.70, widthGrowth 17,
          heightGrowth 16, drop 3.5, lockTrack (as the authored modern
          wiring requires). Replaces the old MENU button + overlay. */}
      <div className="top-dock-mount">
        <AnimatedTopDock
          variant="modern"
          proximity={104}
          spring={0.19}
          damping={0.70}
          widthGrowth={10}
          heightGrowth={9}
          drop={3.5}
          activeId={dockActiveId(path)}
          onNavigate={(item) => goDock(item.path)}
        />
      </div>
      <PageCurtain
        active={transitioning}
        label={pathLabel(path)}
      />
      {towerBoot && <TowerBoot leaving={towerBootLeaving} />}
      {brandBoot && <BrandLoader leaving={brandBootLeaving} />}
      {/* Route content + its background layers: one error boundary (fresh
          per path, so a failed route can't poison the next navigation) and
          one Suspense boundary for the lazy page chunk. A failed chunk or a
          render crash swaps in the recovery panel — never a blank screen.
          The Suspense fallback is null: in-app navigation is already
          covered by the PageCurtain beat, and on cold load the dock and
          shell paint first. */}
      <RouteErrorBoundary key={path}>
      <Suspense fallback={null}>
        {path === "/" && (
          <>
            {/* Background layers are direct children of the App root so they
                escape the .page-shell z-index:5 stacking context that would
                otherwise paint the editorial content on top of them. */}
            <div className="constellation-layer">
              <StarfieldCanvas />
            </div>
            {/* Brand greeting: monumental center lockup over the opening
                starfield (Montfort-style). Fades and lifts away on the
                arrival timeline; aria-hidden because the dock already
                carries the brand name. */}
            <div
              className="brand-greeting"
              aria-hidden="true"
            >
              <svg
                className="greeting-mark"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M7 15.5 12 8l5 7.5"
                  stroke="#eef4f7"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx="12"
                  cy="16.4"
                  r="1.15"
                  fill="#8f7bff"
                />
              </svg>
              <span className="greeting-rule" />
              <span className="greeting-word">
                ANTARCTIC LABS
              </span>
              <span className="greeting-rule" />
            </div>
            <NewBackgroundVideo />
            <Home go={go} />
          </>
        )}
        {path === "/tower-of-babel" && (
          <TowerOfBabel go={go} onReady={handleTowerReady} />
        )}
        {/* The library lives on the main Tower page now — the /library path
            renders the same combined page. */}
        {path === "/tower-of-babel/library" && (
          <TowerOfBabel go={go} onReady={handleTowerReady} />
        )}
        {matchedPattern === "/tower-of-babel/library/:id" && (
          <LibraryArtifact
            go={go}
            params={pageParams}
            onReady={handleTowerReady}
          />
        )}
        {path === "/tower-of-babel/library/suggest" && (
          <SuggestEntry go={go} />
        )}
        {path === "/tower-of-babel/library/research" && (
          <CommissionsDesk go={go} />
        )}
        {path === "/tower-of-babel/donate" && (
          <DonatePage go={go} onReady={handleTowerReady} />
        )}
        {path === "/tower-of-babel/api" && (
          <TowerApiPage go={go} />
        )}
        {path.startsWith("/services/") && (
          <ServiceDetail go={go} path={path} />
        )}
        {/* Typography vortex environment — the agent-resources and
            suggest pages only. The Tower landing/library page itself no
            longer carries it (2026-10-21 revamp): the page is a paper
            library surface now, and the canvas's init cost was part of
            that page's load time. Exact ThreeUI source, configured usage
            (mode="light", speed 0.85, ringGrowth 1.30, opacity 0.81,
            dissolveRadius 1.50, particleAmount 1.00, suctionDuration
            1100) with a site phrase. Fixed behind the page content;
            pointer interactivity is parked because the page sits above. */}
        {(path === "/tower-of-babel/api" ||
          path === "/tower-of-babel/library/suggest") && (
          <div className="tower-vortex-layer" aria-hidden="true">
            <Suspense fallback={null}>
              <WebGLShield>
              <TypographyVortexCanvas
                key="vortex-light"
                mode="light"
                phrase="TOWER OF BABEL / ANTARCTIC LABS / "
                speed={0.85}
                ringGrowth={1.30}
                opacity={0.81}
                dissolveRadius={1.50}
                particleAmount={1.00}
                suctionDuration={1100}
              />
              </WebGLShield>
            </Suspense>
          </div>
        )}
        {/* Government Contracting only: the StructureFlow orbital-sphere
            environment, configured to Joshua's thresholds (speed 2.90,
            particleSize 0.031, particleOpacity 1.00, orbitOpacity 0.27,
            hue -63, scale 0.83, haloOpacity 0.00). Fixed behind the page
            content; decorative only. */}
        {path === "/government-contracting" && (
          <div className="gov-orbital-layer" aria-hidden="true">
            <Suspense fallback={null}>
              <WebGLShield>
              <OrbitalSphereBackground
                speed={2.90}
                particleSize={0.031}
                particleOpacity={1.00}
                orbitOpacity={0.27}
                hue={-63}
                scale={0.83}
                haloOpacity={0.00}
              />
              </WebGLShield>
            </Suspense>
          </div>
        )}
        {/* Services / About share the homepage's resting
            environment: the iceberg video parked at its final position,
            with no scroll choreography (that belongs to the homepage). */}
        {(path.startsWith("/services/") ||
          path === "/about") && <NewBackgroundVideo rest />}
        {path === "/government-contracting" && (
          <Government go={go} />
        )}
        {path === "/about" && (
          <About go={go} />
        )}
        {path === "/privacy" && (
          <PrivacyPage go={go} />
        )}
        {(path === "/404" ||
          (matchedPattern === null &&
            path !== "/")) && <NotFound go={go} />}
      </Suspense>
      </RouteErrorBoundary>
      {/* Minimal site footer (2026-10-25): a single quiet Privacy link, so
          the privacy policy is one click from every page — required for
          AdSense review. No CTA, no redirect block, no dock change. */}
      <footer className="site-footer">
        <span>ANTARCTIC LABS</span>
        <a
          href="/privacy"
          onClick={(e) => { e.preventDefault(); go("/privacy"); }}
        >
          Privacy Policy
        </a>
      </footer>
    </>
  );
}
function PageCurtain({ active, label }) {
  return (
    <div
      className={`page-curtain ${
        active ? "is-active" : ""
      }`}
      aria-hidden="true"
    >
      <div className="curtain-glow" />
      <span>{label}</span>
    </div>
  );
}
// Tower of Babel boot loader for in-app navigation into the library.
// Same visual language as the initial-load overlay in index.html.
function TowerBoot({ leaving }) {
  const word = "Tower of Babel";
  return (
    <div
      className={`tower-boot${leaving ? " is-leaving" : ""}`}
      aria-hidden="true"
    >
      <div className="tb-boot-inner">
        <div className="tb-boot-brand">ANTARCTIC LABS</div>
        <div className="tb-boot-title">
          {word.split("").map((ch, i) =>
            ch === " " ? (
              <span className="tb-l tb-sp" key={i}>
                &nbsp;
              </span>
            ) : (
              <span className="tb-l" key={i}>
                <span
                  style={{
                    animationDelay: `${
                      0.08 + i * 0.045
                    }s`,
                  }}
                >
                  {ch}
                </span>
              </span>
            )
          )}
        </div>
        <div className="tb-boot-rule" />
        <div className="tb-boot-sub">
          ENTERING THE LIBRARY
        </div>
      </div>
    </div>
  );
}
function useReveal(scope) {
  useEffect(() => {
    if (!scope.current) return;
    const reduce =
      window.matchMedia &&
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    if (reduce) {
      gsap.set(
        scope.current.querySelectorAll(".reveal"),
        {
          opacity: 1,
          y: 0,
        }
      );
      return;
    }
    const ctx = gsap.context(() => {
      gsap.utils
        .toArray(".reveal")
        .forEach((el) => {
          gsap.fromTo(
            el,
            {
              y: 55,
              opacity: 0,
            },
            {
              y: 0,
              opacity: 1,
              duration: 1,
              ease: "power3.out",
              scrollTrigger: {
                trigger: el,
                start: "top 88%",
                once: true,
              },
            }
          );
        });
    }, scope);
    return () => ctx.revert();
  }, [scope]);
}
// ============================================================================
// MANIFESTO FILL
// ============================================================================
//
// Montfort-style reading-progress fill: the manifesto's display copy fills
// in character by character, scrubbed to scroll position — dim ghosts that
// resolve into full text as the visitor reads down. Purely additive: the
// existing .reveal entrance on the section is untouched, and with
// prefers-reduced-motion the text renders normally with no split at all.
function useManifestoFill(scope) {
  useEffect(() => {
    if (!scope.current) return;
    const reduce =
      window.matchMedia &&
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    if (reduce) return;
    const el =
      scope.current.querySelector(
        ".manifesto .display-copy"
      );
    if (!el) return;
    const text = el.textContent;
    if (!text || !text.trim()) return;

    // Split into words (kept intact so wrapping never breaks mid-word)
    // of per-character spans. The paragraph keeps an aria-label so
    // screen readers hear the sentence once, not a spray of letters.
    el.setAttribute("aria-label", text.trim());
    const frag = document.createDocumentFragment();
    const chars = [];
    text.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        frag.appendChild(
          document.createTextNode(" ")
        );
        return;
      }
      const word = document.createElement("span");
      word.className = "mf-word";
      word.setAttribute("aria-hidden", "true");
      [...part].forEach((ch) => {
        const c = document.createElement("span");
        c.className = "mf-char";
        c.textContent = ch;
        word.appendChild(c);
        chars.push(c);
      });
      frag.appendChild(word);
    });
    el.textContent = "";
    el.appendChild(frag);

    const total = chars.length;
    // Perf: opacity is a pure function of the head position, so only the
    // characters near the moving boundary can change between frames. Track
    // the last head and rewrite just the overlapped window instead of all
    // ~230 spans on every scrub update — identical visuals, ~50x fewer
    // style writes per frame while scrolling.
    let lastHead = -1;
    const applyFill = (p) => {
      const head = p * total;
      if (lastHead < 0) {
        for (let i = 0; i < total; i++) {
          chars[i].style.opacity = "0.130";
        }
        lastHead = head;
        return;
      }
      const lo = Math.max(0, Math.floor(Math.min(lastHead, head)) - 2);
      const hi = Math.min(total - 1, Math.ceil(Math.max(lastHead, head)) + 2);
      for (let i = lo; i <= hi; i++) {
        const local = Math.min(
          1,
          Math.max(0, head - i) / 2
        );
        chars[i].style.opacity = (
          0.13 +
          0.87 * local
        ).toFixed(3);
      }
      lastHead = head;
    };
    applyFill(0);

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: "top 82%",
        end: "top 32%",
        scrub: 0.6,
        onUpdate: (self) =>
          applyFill(self.progress),
      });
    }, scope);
    return () => {
      ctx.revert();
      el.textContent = text;
      el.removeAttribute("aria-label");
    };
  }, [scope]);
}
// ============================================================================
// HOME STATS BAND
// ============================================================================
//
// Montfort-style animated counters that count up once when
// the band scrolls into view. With prefers-reduced-motion the final
// numbers render immediately — no animation, no observer needed.
function useCountUp(value, started) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!started) return;
    const reduce =
      window.matchMedia &&
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 1400;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, started]);
  return display;
}
function HomeStat({ value, label, started }) {
  const display = useCountUp(value, started);
  return (
    <div className="home-stat">
      <b>{display}</b>
      <span>{label}</span>
    </div>
  );
}
function HomeStats() {
  const ref = useRef(null);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce =
      window.matchMedia &&
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    if (reduce) {
      setStarted(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Static figures for the firm as it stands: one owned data center
  // (in formation in the Philippines), two countries, zero clients.
  // The firm takes no client work. (2026-10-22: the old "3 PARTNERS"
  // figure came out with the partner details — the stats describe
  // what the firm does, not who is in it.)
  const stats = [
    [1, "DATA CENTER"],
    [2, "COUNTRIES"],
    [0, "CLIENTS"],
  ];
  return (
    <section
      ref={ref}
      className="home-stats section reveal"
      aria-label="Antarctic Labs in numbers"
    >
      {stats.map(([value, label]) => (
        <HomeStat
          key={label}
          value={value}
          label={label}
          started={started}
        />
      ))}
    </section>
  );
}
// ============================================================================
// ENTRANCE RITUAL
// ============================================================================
//
// A brief branded loader on the homepage: the mark resolves, a hairline
// fills, then it fades and unmounts. Purely visual ceremony — it never
// intercepts pointer input and never touches the scroll-driven arrival
// choreography underneath. Shown once per tab session; skipped entirely
// for prefers-reduced-motion.
// Branded loader visual: the ANTARCTIC LABS mark resolving with a
// hairline fill — the same ceremony as the homepage first load. Used by
// the entrance ritual and on demand for dock navigation.
function BrandLoader({ leaving }) {
  return (
    <div
      className={`entrance-ritual ${
        leaving ? "is-out" : ""
      }`}
      aria-hidden="true"
    >
      <div className="ritual-inner">
        <span className="ritual-brand">
          ANTARCTIC LABS
        </span>
        <span className="ritual-line">
          <i />
        </span>
      </div>
    </div>
  );
}
function EntranceRitual() {
  const [phase, setPhase] = useState("in");
  useEffect(() => {
    let seen = false;
    try {
      seen =
        !!window.sessionStorage.getItem(
          "al-ritual-done"
        );
    } catch (e) {}
    const reduce =
      window.matchMedia &&
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    if (seen || reduce) {
      setPhase("gone");
      return;
    }
    try {
      window.sessionStorage.setItem(
        "al-ritual-done",
        "1"
      );
    } catch (e) {}
    const t1 = setTimeout(
      () => setPhase("out"),
      950
    );
    const t2 = setTimeout(
      () => setPhase("gone"),
      1450
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  if (phase === "gone") return null;
  return <BrandLoader leaving={phase === "out"} />;
}
// ============================================================================
// HOME
// ============================================================================
//
// Cinematic arrival:
//
//   initial viewport
//   └── environment + restrained arrival cue
//
//   first scroll
//   └── visitor moves deeper into the field
//
//   continued scroll
//   └── editorial hero copy enters
//
//   end of hero
//   └── normal homepage content begins
//
// No additional translucent page layer is introduced here.
// ============================================================================
function Home({ go }) {
  const root = useRef(null);
  useReveal(root);
  useManifestoFill(root);
  useEffect(() => {
    if (!root.current) return;
    const reduce =
      window.matchMedia &&
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    if (reduce) return;
    const ctx = gsap.context(() => {
      const hero = root.current.querySelector(".hero");
      const heroCopy =
        root.current.querySelector(".hero-copy");
      const heroOrb =
        root.current.querySelector(".hero-orb");
      const envArrival =
        root.current.querySelector(".env-arrival");
      const constellation =
        document.querySelector(".constellation-layer");
      if (!hero || !heroCopy) return;

      // The top dock is always visible, including on first load — it is
      // the primary navigation and should be discoverable immediately.

      // Stage 3: the environmental arrival. Two full-viewport layers,
      // one after the other in a fixed order: the constellation
      // (transparent starfield canvas) exits upward (y=0 to y=-100vh)
      // while the video rises from below (y=100vh to y=0, full-viewport).
      // The timeline animates transform + opacity ONLY (compositor
      // work). The old per-frame --cfade mask tween is gone: animating
      // mask-image every scroll frame forced a full-layer repaint and
      // stuttered the first half of the page. The meeting-line feather
      // is a STATIC 18% mask (rasterized once, zero per-frame cost),
      // and the crossfade itself is an opacity dissolve on both layers
      // (2026-10-01, retuned 2026-10-08 for the brighter aurora asset):
      // the starfield fades 1→0 as it exits while the video dissolves
      // 0→1 as it rises, so the two backgrounds melt into each other
      // through the scroll instead of meeting at a hard sliding edge. At rest there is no mask animation and the
      // opacities sit at their fromTo endpoints: pure starfield at
      // scroll 0, pure iceberg at the end — pixel-identical to before
      // at both ends. Scoped to .env-arrival so adding homepage
      // sections later cannot shift the timing.
      const iceberg =
        document.querySelector(".new-bg-layer");
      if (envArrival && constellation && iceberg) {
        {
          const arrival = gsap.timeline({
            scrollTrigger: {
              trigger: envArrival,
              start: "top top",
              end: "bottom top",
              // iOS Safari perf (2026-10-01, researched): scrub as a number
              // (0.6s catch-up) instead of `true` smooths chunky iOS scroll
              // deltas; fastScrollEnd prevents mid-state glitches on fast
              // flings. Both are transform-only — no visual change.
              scrub: 0.6,
              fastScrollEnd: true,
              // Perf (2026-10-01): the arrival-live mask toggle is removed.
              // Toggling a mask class at scroll start forced iOS Safari to
              // re-rasterize the WebGL constellation layer, causing a hitch
              // every time the user scrolled from the top. The timeline now
              // animates transform-only with no mask changes mid-scroll.
            },
          });
          arrival.fromTo(
            constellation,
            // Crossfade (2026-10-01): the starfield dissolves (opacity 1→0)
            // as it slides away while the iceberg rises beneath it — the
            // two backgrounds blend into each other through the transition
            // instead of meeting at a hard sliding edge. Opacity is
            // compositor-cheap like transform: no repaint, no stutter.
            // The static 18% bottom mask stays as-is (rasterized once).
            { y: "0vh", opacity: 1 },
            { y: "-100vh", opacity: 0, ease: "none" },
            0
          );
          arrival.fromTo(
            iceberg,
            // The rise: full-timeline slide from below the fold to a
            // full-viewport rest (y=0). (Opacity is a separate, faster
            // tween below.)
            { y: "100vh" },
            { y: "0vh", ease: "none" },
            0
          );
          arrival.fromTo(
            iceberg,
            // True crossfade (2026-10-08, retuned for the brighter aurora
            // asset): the video dissolves in FAST (first ~55% of the
            // scroll) while the starfield melts away SLOWLY over the full
            // timeline. The second half of the scroll is pure dissolve —
            // dark starfield fading over the already-placed aurora — so
            // the handoff reads as a melt, not a sliding edge. The old
            // 0.55 opacity floor was tuned for the dark iceberg clip; with
            // the vivid aurora it read as a pop-in.
            // Transform + opacity only: compositor-cheap, no repaint.
            { opacity: 0 },
            { opacity: 1, ease: "none", duration: 0.55 },
            0
          );
          // (2026-09-30) The constellation's --cfade mask tween was
          // removed. Animating mask-image per scroll frame forced a
          // full-viewport repaint every frame — the top-of-page stutter.
          // The 7% seam feather is now the static .arrival-live mask.
          // The brand greeting dissolves and lifts away early in the
          // arrival so the handoff stays clean — it never lingers over
          // the iceberg.
          const greeting =
            document.querySelector(".brand-greeting");
          if (greeting) {
            arrival.fromTo(
              greeting,
              { opacity: 1, y: "0vh" },
              {
                opacity: 0,
                y: "-10vh",
                ease: "none",
                duration: 0.2,
              },
              0
            );
          }
        }
      }
      // The top dock stays visible throughout; no reveal gating.

      gsap.fromTo(
        heroCopy,
        {
          y: 70,
          opacity: 0,
        },
        {
          y: 0,
          opacity: 1,
          ease: "power3.out",
          // Pushed the start from "top 88%" to "top 55%" so the hero
          // copy only begins entering after the constellation has
          // nearly finished receding (env-arrival is 200vh; the hero
          // starts at 200vh; "top 55%" of the viewport means the
          // hero-copy's top must rise to roughly the upper third of
          // the viewport before the fade begins).
          scrollTrigger: {
            trigger: heroCopy,
            start: "top 55%",
            end: "top 25%",
            scrub: 0.65,
          },
        }
      );
      if (heroOrb) {
        gsap.to(heroOrb, {
          y: 110,
          rotation: 14,
          ease: "none",
          scrollTrigger: {
            trigger: hero,
            start: "top top",
            end: "bottom top",
            // Scrub as a number (0.6s catch-up) instead of `true`: same
            // endpoints, but smooths chunky scroll deltas on iOS Safari —
            // the same treatment the arrival timeline above already gets.
            // Transform-only; no visual change.
            scrub: 0.6,
          },
        });
      }
    }, root);
    return () => {
      ctx.revert();
    };
  }, []);
  return (
    <main
      ref={root}
      className="page-shell home-page"
      id="main-content"
      tabIndex={-1}
    >
      <EntranceRitual />
      {/* .env-arrival is a visual-only scroll runway at the top of the
          homepage. The constellation layer physically translates upward
          as the user scrolls through this section (driven by the GSAP
          ScrollTrigger in Home's useEffect, scoped to this element).
          No editorial copy lives inside this section. */}
      <section className="env-arrival" aria-hidden="true" />
      <section id="home" className="hero section">
        <div
          className="hero-orb"
          aria-hidden="true"
        />
        <div className="hero-copy">
          <h1>
            {content.hero.title.map((line, idx) => (
              <span key={line}>
                {idx > 0 ? " " : null}
                <span className="hero-line-wrap">
                  <span className="hero-line">
                    {line}
                  </span>
                </span>
              </span>
            ))}
          </h1>
          <div className="hero-bottom">
            <p>{content.hero.sub}</p>
          </div>
        </div>
      </section>
      <section id="manifesto" className="manifesto section reveal">
        <div className="manifesto-text">
          <p className="display-copy">
            {content.hero.body}
          </p>
          <p className="body-copy method-line">
            {content.hero.method}
          </p>
        </div>
      </section>
      <HomeStats />
      <section id="territory" className="territory section reveal">
        <div className="territory-list">
          {content.territory.map(([title, desc, link]) => (
            link ? (
              <a
                className="cap-row territory-row territory-link"
                key={title}
                href={link}
                onClick={(e) => {
                  e.preventDefault();
                  go(link);
                }}
              >
                <h3>{title} <span className="t-arrow" aria-hidden="true">↗</span></h3>
                <p>{desc}</p>
              </a>
            ) : (
              <div
                className="cap-row territory-row"
                key={title}
              >
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            )
          ))}
        </div>
      </section>
      <section id="firm" className="copy-block section reveal">
        <span className="section-index">THE FIRM</span>
        <div>
          <p className="display-copy">
            Small, private, and deliberate.
          </p>
          <p className="body-copy">
            The work is proprietary trading, the infrastructure it runs on, and the research and systems behind both. Algorithms are developed in-house and run on machines the firm owns and operates. Strategy research, execution, monitoring, and risk controls are kept separate, so a problem in one is visible in the others.
          </p>
          <p className="body-copy">
            Where things stand: the Philippine company is being registered, the office is selected, and the hardware build runs in phases. Trading starts on paper, then with limited capital.
          </p>
          <p className="body-copy">
            We are not hiring and we do not take clients.
          </p>
        </div>
      </section>
    </main>
  );
}
function NotFound({ go }) {
  return (
    <main
      className="page-shell inner-page"
      id="main-content"
      tabIndex={-1}
    >
      <section className="inner-hero section">
        <div className="section-index">
          404
        </div>
        <h1>
          LOST IN
          <br />
          <em>THE ICE.</em>
        </h1>
        <button type="button"
          className="text-link"
          onClick={() => go("/")}
        >
          RETURN HOME
          <span aria-hidden="true">
            ↗
          </span>
        </button>
      </section>
    </main>
  );
}
createRoot(
  document.getElementById("root")
).render(<App />);
// Dismiss the Tower of Babel boot loader (if shown) once the first frame
// has painted. The loader has its own hard failsafe, so this is best-effort.
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    if (typeof window.__dismissTowerBoot === "function")
      window.__dismissTowerBoot();
  })
);