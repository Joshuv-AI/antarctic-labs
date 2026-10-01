import React, {
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
// Perf (2026-10-01): route-specific WebGL components are lazy-loaded.
// three.js (~600KB) was shipping to all 15 routes but only renders on
// /government-contracting. DefenseLines only on /, TypographyVortexCanvas
// only on Tower routes. Lazy-loading drops the main bundle ~60%.
const DefenseLines = lazy(() =>
  import("./shaders/neuform-isolated/NeuformBatchEffects.tsx").then((m) => ({
    default: m.DefenseLines,
  }))
);
import { AnimatedTopDock } from "./shaders/animated-top-dock/AnimatedTopDock.tsx";
const TypographyVortexCanvas = lazy(() =>
  import("./shaders/typography-vortex/TypographyVortexCanvas.tsx").then((m) => ({
    default: m.TypographyVortexCanvas,
  }))
);
const OrbitalSphereBackground = lazy(() =>
  import("./shaders/orbital-sphere/OrbitalSphereBackground.tsx").then((m) => ({
    default: m.OrbitalSphereBackground,
  }))
);
import { site as content } from "./content/site.js";
import { expeditions } from "./content/expeditions.js";
import { matchRoute, legacyRedirect } from "./content/routes.js";
import { applyMeta } from "./seo.js";
// Lazy Tower catalog (see ./lib/catalog.js): prefetched on Tower navigation
// so the chunk usually arrives before the route needs it.
import { loadCatalog, isCatalogPending } from "./lib/catalog.js";
import {
  TowerOfBabel,
  TowerLibrary,
  LibraryArtifact,
  SuggestEntry,
  Government,
  Transmission,
  Projects,
  ProjectDetail,
  About,
} from "./pages.jsx";
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
// Map the current route to the animated dock's active item id. Project
// detail pages highlight Projects; anything else leaves no item active.
function dockActiveId(path) {
  if (path === "/") return "home";
  if (path === "/projects" || path.startsWith("/projects/"))
    return "projects";
  if (path === "/tower-of-babel" || path.startsWith("/tower-of-babel/"))
    return "tower";
  if (path === "/government-contracting") return "gov";
  if (path === "/about") return "about";
  if (path === "/contact") return "contact";
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
    // Prefetch the catalog chunk now — the route awaits the same cached
    // promise, so this head start is usually the whole fetch.
    loadCatalog().catch(() => {});
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
    // Entering the Tower of Babel (landing, library, or any entry page) from
    // inside the app: raise the Tower loader so the transition gets the same
    // branded beat as the initial page load and the ENTER THE LIBRARY button.
    // The suggest-an-entry form is excluded: it is a lightweight form, not a
    // destination, and it never reports ready — so the boot overlay would sit
    // on it until the 4s failsafe. It uses the standard fast swap instead.
    const enteringTower =
      (canonical === "/tower-of-babel" ||
        canonical === "/tower-of-babel/library" ||
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
          proximity={122}
          spring={0.19}
          damping={0.70}
          widthGrowth={17}
          heightGrowth={16}
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
      {path === "/" && (
        <>
          {/* Background layers are direct children of the App root so they
              escape the .page-shell z-index:5 stacking context that would
              otherwise paint the editorial content on top of them. */}
          <div className="constellation-layer">
            <Suspense fallback={null}>
              <DefenseLines
                mode="dark"
                speed={1.2}
                size={1.0}
                length={0.35}
                density={1.0}
                opacity={0.05}
                hue={0}
                saturation={0.0}
                brightness={1.65}
              />
            </Suspense>
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
      {path === "/projects" && <Projects go={go} />}
      {matchedPattern === "/projects/:id" && (
        <ProjectDetail
          go={go}
          params={pageParams}
        />
      )}
      {path === "/tower-of-babel" && (
        <TowerOfBabel go={go} onReady={handleTowerReady} />
      )}
      {path === "/tower-of-babel/library" && (
        <TowerLibrary go={go} onReady={handleTowerReady} />
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
      {/* Tower of Babel family only: the typography vortex environment.
          Exact ThreeUI source, configured usage (mode="light", speed 0.85,
          ringGrowth 1.30, opacity 0.81, dissolveRadius 1.50,
          particleAmount 1.00, suctionDuration 1100) with a site phrase.
          Fixed behind the page content; pointer interactivity is parked
          because the page sits above it. */}
      {(path === "/tower-of-babel" ||
        path === "/tower-of-babel/library" ||
        path === "/tower-of-babel/library/suggest" ||
        matchedPattern === "/tower-of-babel/library/:id") && (
        <div className="tower-vortex-layer" aria-hidden="true">
          <Suspense fallback={null}>
            <TypographyVortexCanvas
              mode="light"
              phrase="TOWER OF BABEL / ANTARCTIC LABS / "
              speed={0.85}
              ringGrowth={1.30}
              opacity={0.81}
              dissolveRadius={1.50}
              particleAmount={1.00}
              suctionDuration={1100}
              // The library index is the heaviest page on the site (3,448
              // rows over a live canvas). Freeze the backdrop to one static
              // frame here: every animated frame was forcing the
              // frosted-glass rows above it to repaint their backdrop blur,
              // which is what made scrolling and typing feel heavy. The
              // option is read live, so navigating away resumes motion with
              // no remount and no blank gap.
              frozen={path === "/tower-of-babel/library"}
            />
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
            <OrbitalSphereBackground
              speed={2.90}
              particleSize={0.031}
              particleOpacity={1.00}
              orbitOpacity={0.27}
              hue={-63}
              scale={0.83}
              haloOpacity={0.00}
            />
          </Suspense>
        </div>
      )}
      {/* Projects / About / Contact share the homepage's resting
          environment: the iceberg video parked at its final position,
          with no scroll choreography (that belongs to the homepage). */}
      {(path === "/projects" ||
        matchedPattern === "/projects/:id" ||
        path === "/about" ||
        path === "/contact") && <NewBackgroundVideo rest />}
      {path === "/government-contracting" && (
        <Government go={go} />
      )}
      {path === "/about" && (
        <About go={go} />
      )}
      {path === "/contact" && (
        <Transmission go={go} />
      )}
      {(path === "/404" ||
        (matchedPattern === null &&
          path !== "/")) && <NotFound go={go} />}
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
// Montfort-style animated counters: honest, data-derived numbers
// (same source of truth as the projects page) that count up once when
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
  const categories = [];
  expeditions.forEach((e) => {
    if (!categories.includes(e.category))
      categories.push(e.category);
  });
  const stats = [
    [expeditions.length, "PROJECTS BUILT"],
    [
      expeditions.filter((e) => e.status === "ACTIVE")
        .length,
      "ACTIVE NOW",
    ],
    [categories.length, "DISCIPLINES"],
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
      // while the iceberg video rises from below (y=100vh to y=-6vh).
      // The timeline animates transform + opacity ONLY (compositor
      // work). The old per-frame --cfade mask tween is gone: animating
      // mask-image every scroll frame forced a full-layer repaint and
      // stuttered the first half of the page. The meeting-line feather
      // is a STATIC 18% mask (rasterized once, zero per-frame cost),
      // and the crossfade itself is an opacity dissolve on both layers
      // (2026-10-01): the starfield fades 1→0 as it exits while the
      // iceberg blooms 0.55→1 as it rises, so the two backgrounds melt
      // into each other through the scroll instead of meeting at a
      // hard sliding edge. At rest there is no mask animation and the
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
            // The iceberg blooms in (opacity 0.55→1) as it rises, deepening
            // the crossfade where the two layers overlap at the seam.
            { y: "100vh", opacity: 0.55 },
            { y: "-6vh", opacity: 1, ease: "none" },
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
            scrub: true,
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
            <a
              className="hero-cta"
              href={content.hero.cta.to}
              onClick={(e) => { e.preventDefault(); go(content.hero.cta.to); }}
            >
              {content.hero.cta.label}
              <span aria-hidden="true">
                ↗
              </span>
            </a>
          </div>
        </div>
      </section>
      <section id="manifesto" className="manifesto section reveal">
        <div className="manifesto-text">
          <p className="signal-line">
            {content.hero.signal}
          </p>
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
          {content.territory.map(([title, desc]) => (
            <div
              className="cap-row territory-row"
              key={title}
            >
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
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