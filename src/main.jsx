import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./styles.css";
import "./shaders/threeui.css";
import NewBackgroundVideo from "./components/NewBackgroundVideo.jsx";
import { DefenseLines } from "./shaders/neuform-isolated/NeuformBatchEffects.tsx";
import { AnimatedTopDock } from "./shaders/animated-top-dock/AnimatedTopDock.tsx";
import { TypographyVortexCanvas } from "./shaders/typography-vortex/TypographyVortexCanvas.tsx";
import { site as content } from "./content/site.js";
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
              size={0.35}
              length={0.35}
              density={1.30}
              opacity={1.0}
              hue={0}
              saturation={0.0}
              brightness={1.65}
            />
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
        (matchedPattern === null && path !== "/")) && (
        <NotFound go={go} />
      )}
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
      // All three tweens live in ONE scrubbed timeline on .env-arrival:
      // the constellation's bottom edge and the iceberg's top edge
      // share a single meeting line at every scroll position, and a
      // 0% → 6% crossfade (--cfade) dissolves the constellation's
      // bottom edge into the iceberg for a natural handoff. The
      // iceberg always extends 6%-of-progress above the meeting line
      // and stays opaque behind the fade, so the page background
      // never shows through — crossfade, not a gap. Scoped to
      // .env-arrival so adding homepage sections later cannot shift
      // the timing.
      const iceberg =
        document.querySelector(".new-bg-layer");
      if (envArrival && constellation && iceberg) {
        if (reduce) {
          // Reduced motion: settle on the end state — iceberg as the
          // static backdrop, constellation parked out of view.
          gsap.set(iceberg, { y: "0vh" });
          gsap.set(constellation, { y: "-100vh", "--cfade": "0%" });
        } else {
          const arrival = gsap.timeline({
            scrollTrigger: {
              trigger: envArrival,
              start: "top top",
              end: "bottom top",
              scrub: true,
            },
          });
          arrival.fromTo(
            constellation,
            { y: "0vh" },
            { y: "-100vh", ease: "none" },
            0
          );
          arrival.fromTo(
            iceberg,
            { y: "100vh" },
            { y: "-6vh", ease: "none" },
            0
          );
          arrival.fromTo(
            constellation,
            { "--cfade": "0%" },
            { "--cfade": "6%", ease: "none" },
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
    return () => ctx.revert();
  }, []);
  return (
    <main
      ref={root}
      className="page-shell home-page"
      id="main-content"
      tabIndex={-1}
    >
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
      <Footer go={go} />
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
function Footer({ go }) {
  const sitemap = [
    ["HOME", "/"],
    ["PROJECTS", "/projects"],
    ["TOWER OF BABEL", "/tower-of-babel"],
    ["GOV CONTRACTS", "/government-contracting"],
    ["ABOUT", "/about"],
    ["CONTACT", "/contact"],
  ];
  return (
    <footer className="site-footer">
      <div className="footer-sitemap">
        <span>© {new Date().getFullYear()}{" "}ANTARCTIC LABS</span>
        <nav className="footer-nav" aria-label="Site">
          {sitemap.map(([label, path], i) => (
            <span key={path}>
              {i > 0 && (
                <span className="footer-sep" aria-hidden="true"> · </span>
              )}
              <button type="button" onClick={() => go(path)}>
                {label}
              </button>
            </span>
          ))}
        </nav>
        <span>
          <a href={`mailto:${content.email}`}>{content.email}</a>
          <span className="footer-sep" aria-hidden="true"> · </span>
          <a href="https://github.com/Joshuv-AI" target="_blank" rel="noreferrer">
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </span>
      </div>
      <button type="button"
        onClick={() =>
          window.scrollTo({
            top: 0,
            behavior: "smooth",
          })
        }
      >
        ↑ TOP
      </button>
    </footer>
  );
}
createRoot(
  document.getElementById("root")
).render(<App />);