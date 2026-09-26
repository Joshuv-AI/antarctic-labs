import React, {
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
import { DefenseLines } from "./shaders/neuform-isolated/NeuformBatchEffects.tsx";
import { AnimatedTopDock } from "./shaders/animated-top-dock/AnimatedTopDock.tsx";
import { TypographyVortexCanvas } from "./shaders/typography-vortex/TypographyVortexCanvas.tsx";
import { OrbitalSphereBackground } from "./shaders/orbital-sphere/OrbitalSphereBackground.tsx";
// The homepage cloud stratum (Vanta.js, approved variant A). Lazy-loaded
// so the Vanta chunk only downloads when the cloud phase mounts it.
const HomeClouds = lazy(() => import("./home/HomeClouds.tsx"));
import { site as content } from "./content/site.js";
import { expeditions } from "./content/expeditions.js";
import { routes, matchRoute, legacyRedirect } from "./content/routes.js";
import { applyMeta } from "./seo.js";
import {
  TowerOfBabel,
  TowerLibrary,
  LibraryArtifact,
  Government,
  Transmission,
  Projects,
  ProjectDetail,
  About,
} from "./pages.jsx";
gsap.registerPlugin(ScrollTrigger);
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
  // True while the homepage arrival timeline is inside the cloud phase.
  // Home's timeline reports it; the cloud layer mounts Vanta only then.
  const [cloudActive, setCloudActive] = useState(false);
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
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, []);
  useEffect(() => {
    applyMeta(path);
  }, [path]);
  const go = (to) => {
    if (to === path || transitioning) return;
    const canonical = legacyRedirect(to) || to;
    if (to === path || canonical === path) return;
    setTransitioning(true);
    window.setTimeout(() => {
      window.history.pushState({}, "", canonical);
      setPath(canonical);
      window.scrollTo(0, 0);
      window.setTimeout(() => {
        setTransitioning(false);
      }, 80);
    }, 520);
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
      {/* TODO: re-attach new background asset here on the homepage only. */}
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
          onNavigate={(item) => go(item.path)}
        />
      </div>
      <PageCurtain
        active={transitioning}
        label={pathLabel(path)}
      />
      {path === "/" && (
        <>
          {/* Background layers are direct children of the App root so they
              escape the .page-shell z-index:5 stacking context that would
              otherwise paint the editorial content on top of them. */}
          <div className="constellation-layer">
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
          {/* Cloud stratum: the middle environment between the
              constellation and the iceberg (Vanta.js clouds, approved).
              Mounted only while the arrival timeline is inside the cloud
              phase; the timeline fades the layer in/out around it. */}
          <div className="cloud-layer" aria-hidden="true">
            <div className="cloud-layer-inner">
              <Suspense fallback={null}>
                {cloudActive && (
                  <HomeClouds active={cloudActive} />
                )}
              </Suspense>
            </div>
          </div>
          <NewBackgroundVideo />
          <Home
            go={go}
            onCloudPhaseChange={setCloudActive}
          />
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
        <TowerOfBabel go={go} />
      )}
      {path === "/tower-of-babel/library" && (
        <TowerLibrary go={go} />
      )}
      {matchedPattern === "/tower-of-babel/library/:id" && (
        <LibraryArtifact
          go={go}
          params={pageParams}
        />
      )}
      {/* Tower of Babel family only: the typography vortex environment.
          Exact ThreeUI source, configured usage (mode="light", speed 0.85,
          ringGrowth 1.30, opacity 0.81, dissolveRadius 1.50,
          particleAmount 1.00, suctionDuration 1100) with a site phrase.
          Fixed behind the page content; pointer interactivity is parked
          because the page sits above it. */}
      {(path === "/tower-of-babel" ||
        path === "/tower-of-babel/library" ||
        matchedPattern === "/tower-of-babel/library/:id") && (
        <div className="tower-vortex-layer" aria-hidden="true">
          <TypographyVortexCanvas
            mode="light"
            phrase="TOWER OF BABEL / ANTARCTIC LABS / "
            speed={0.85}
            ringGrowth={1.30}
            opacity={0.81}
            dissolveRadius={1.50}
            particleAmount={1.00}
            suctionDuration={1100}
          />
        </div>
      )}
      {/* Government Contracting only: the StructureFlow orbital-sphere
          environment, configured to Joshua's thresholds (speed 2.90,
          particleSize 0.031, particleOpacity 1.00, orbitOpacity 0.27,
          hue -63, scale 0.83, haloOpacity 0.00). Fixed behind the page
          content; decorative only. */}
      {path === "/government-contracting" && (
        <div className="gov-orbital-layer" aria-hidden="true">
          <OrbitalSphereBackground
            speed={2.90}
            particleSize={0.031}
            particleOpacity={1.00}
            orbitOpacity={0.27}
            hue={-63}
            scale={0.83}
            haloOpacity={0.00}
          />
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
    const applyFill = (p) => {
      const head = p * total;
      for (let i = 0; i < total; i++) {
        const local = Math.min(
          1,
          Math.max(0, head - i) / 2
        );
        chars[i].style.opacity = (
          0.13 +
          0.87 * local
        ).toFixed(3);
      }
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
  return (
    <div
      className={`entrance-ritual ${
        phase === "out" ? "is-out" : ""
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
function Home({ go, onCloudPhaseChange }) {
  const root = useRef(null);
  const cloudActiveRef = useRef(false);
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
    // Reports whether the scrubbed timeline is inside the cloud phase.
    // App mounts the (lazy, GPU-heavy) Vanta clouds only then.
    const reportCloudPhase = (active) => {
      if (active !== cloudActiveRef.current) {
        cloudActiveRef.current = active;
        if (onCloudPhaseChange) onCloudPhaseChange(active);
      }
    };
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

      // Stage 3: the environmental arrival. Three full-viewport layers
      // in a fixed order: the constellation (transparent starfield
      // canvas) exits upward, the Vanta cloud stratum rolls in as the
      // middle environment — slightly overlapping both neighbors — and
      // the iceberg video rises from below. The clouds fade in as the
      // stars thin out (the constellation's bottom 7% crossfade melts
      // into them), own the viewport briefly, then part to reveal the
      // iceberg whose own top 7% dissolves in behind them; --vfade
      // settles back to 0% as the arrival completes, so the resting
      // iceberg backdrop is pixel-identical to before. Everything lives
      // in ONE scrubbed timeline on .env-arrival (still 200vh — the
      // cloud passage is prominent, not page-long). Scoped to
      // .env-arrival so adding homepage sections later cannot shift
      // the timing.
      const iceberg =
        document.querySelector(".new-bg-layer");
      const cloudLayer =
        document.querySelector(".cloud-layer");
      const cloudInner =
        document.querySelector(".cloud-layer-inner");
      if (envArrival && constellation && iceberg) {
        const arrival = gsap.timeline({
          scrollTrigger: {
            trigger: envArrival,
            start: "top top",
            end: "bottom top",
            scrub: true,
            onUpdate: (self) => {
              const p = self.progress;
              reportCloudPhase(p > 0.1 && p < 0.88);
              // Variant C parallax: the back photo stratum ([data-
              // cloud-parallax]) counter-drifts at a fraction of the
              // front layer's motion so the flat image gains depth. It
              // is driven here — not as a timeline tween — because the
              // lazy cloud component mounts after the timeline is
              // built, so a setup-time query would find nothing. The
              // outer layer travels 10vh over p 0.14->0.32; the back
              // layer gives back 5.5vh over the same span, netting
              // 4.5vh — 0.45x the front. Absent in other variants.
              const back = document.querySelector(
                "[data-cloud-parallax]"
              );
              if (back) {
                const t = Math.min(
                  Math.max((p - 0.14) / 0.18, 0),
                  1
                );
                back.style.transform = `translateY(${(t * 5.5).toFixed(3)}vh)`;
              }
            },
          },
        });
        // Constellation exits upward; its bottom edge dissolves into
        // the clouds arriving beneath it.
        arrival.fromTo(
          constellation,
          { y: "0vh" },
          { y: "-100vh", ease: "none", duration: 0.5 },
          0
        );
        arrival.fromTo(
          constellation,
          { "--cfade": "0%" },
          { "--cfade": "7%", ease: "none", duration: 0.5 },
          0
        );
        // Clouds: the middle environment. They fade in as the stars
        // thin, hold the viewport, then part — overlapping the tail of
        // the constellation above and the rise of the iceberg below.
        // Peak opacity is 0.85 (not full) so the sky keeps some depth,
        // and the layer's bottom edge is feathered (see .cloud-layer)
        // so the bank sits high and never hangs down over the
        // iceberg's aurora sky.
        if (cloudLayer) {
          arrival.fromTo(
            cloudLayer,
            { opacity: 0, y: "6vh" },
            {
              opacity: 0.85,
              y: "-4vh",
              ease: "none",
              duration: 0.18,
            },
            0.14
          );
          arrival.to(
            cloudLayer,
            { opacity: 0, ease: "none", duration: 0.22 },
            0.58
          );
        }
        if (cloudInner) {
          arrival.fromTo(
            cloudInner,
            { scale: 1.15 },
            { scale: 1.28, ease: "none", duration: 0.66 },
            0.14
          );
        }
        // Iceberg rises from below while the clouds are still clearing;
        // its top edge dissolves in behind them (two-sided melt), then
        // settles back to 0% as the arrival completes so the resting
        // backdrop is unchanged.
        arrival.fromTo(
          iceberg,
          { y: "100vh" },
          { y: "-6vh", ease: "none", duration: 0.55 },
          0.45
        );
        arrival.fromTo(
          iceberg,
          { "--vfade": "0%" },
          { "--vfade": "7%", ease: "none", duration: 0.3 },
          0.45
        );
        arrival.to(
          iceberg,
          { "--vfade": "0%", ease: "none", duration: 0.1 },
          0.75
        );
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
          // The hero copy must wait for the clouds: it only begins
          // entering once the cloud layer has parted (opacity hits 0 at
          // 0.80 of the arrival timeline) and finishes over the clear
          // iceberg. Scroll order stays: constellations -> clouds ->
          // environment -> copy. (env-arrival is 200vh; hero starts at
          // 200vh.)
          scrollTrigger: {
            trigger: heroCopy,
            start: "top 38%",
            end: "top 12%",
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
      cloudActiveRef.current = false;
      if (onCloudPhaseChange) onCloudPhaseChange(false);
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
        <div
          className="hero-arrival-marker"
          aria-hidden="true"
        >
          <span>01</span>
          <span>THE FIELD</span>
        </div>
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
            <span className="hero-scroll-cue">
              SCROLL TO EXPLORE
              <b aria-hidden="true">
                ↓
              </b>
            </span>
          </div>
        </div>
        <div
          className="hero-arrival-cue"
          aria-hidden="true"
        >
          <span>SCROLL TO ENTER</span>
          <b>↓</b>
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
      <section id="capabilities" className="capabilities section reveal">
        <div className="capability-list">
          {content.capabilities.map(
            ([n, title, desc]) => (
              <div
                className="cap-row"
                key={n}
              >
                <span>{n}</span>
                <h3>{title}</h3>
                <p>{desc}</p>
                <i aria-hidden="true">
                  +
                </i>
              </div>
            )
          )}
        </div>
      </section>
      <section id="territory" className="territory section reveal">
        <div className="territory-list">
          {[
            [
              "AI / INTELLIGENCE",
              "Language models, agents, orchestration, machine-assisted operations.",
            ],
            [
              "AUTONOMOUS SYSTEMS",
              "Long-running software that keeps going without someone pushing every button.",
            ],
            [
              "AUTOMATION",
              "Browser automation, APIs, webhooks, workflows, data pipelines.",
            ],
            [
              "SOFTWARE",
              "Web applications, interfaces, internal tools, integrations, infrastructure.",
            ],
            [
              "DATA & RESEARCH",
              "Scraping, extraction, cleaning, structuring, and turning scattered information into something usable.",
            ],
            [
              "BLOCKCHAIN",
              "Smart contracts, DeFi systems, on-chain experimentation.",
            ],
            [
              "FINANCE",
              "Strategy, signals, paper trading, backtest harnesses, markets as a study in systems.",
            ],
            [
              "DIGITAL EXPERIENCES",
              "Interactive interfaces, immersive web, prototypes, unusual ways to put information in front of someone.",
            ],
            [
              "EXPERIMENTAL TECHNOLOGY",
              "Emerging tools, unusual interfaces, ideas that don't fit neatly into another category.",
            ],
          ].map(([title, desc]) => (
            <div
              className="cap-row"
              key={title}
            >
              <h3>{title}</h3>
              <p>{desc}</p>
              <i aria-hidden="true">
                +
              </i>
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