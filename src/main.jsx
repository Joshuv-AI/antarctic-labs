import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./styles.css";
import PolarScene from "./PolarScene";
import { site as content } from "./content/site.js";
import { routes, matchRoute, legacyRedirect } from "./content/routes.js";
import { applyMeta } from "./seo.js";
import {
  TheLab,
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
function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);
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
      setMenuOpen(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, []);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);
  useEffect(() => {
    applyMeta(path);
  }, [path]);
  const go = (to) => {
    if (to === path || transitioning) return;
    const canonical = legacyRedirect(to) || to;
    if (to === path || canonical === path) return;
    setMenuOpen(false);
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
      : null;
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {path === "/" && <PolarScene />}
      <SiteHeader
        onMenu={() => setMenuOpen(true)}
        go={go}
        menuOpen={menuOpen}
      />
      <PageCurtain
        active={transitioning}
        label={pathLabel(path)}
      />
      {path === "/" && <Home go={go} />}
      {path === "/the-lab" && <TheLab go={go} />}
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
      {path === "/government" && (
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
      <Menu
        open={menuOpen}
        close={() => setMenuOpen(false)}
        go={go}
        path={path}
      />
    </>
  );
}
function SiteHeader({ onMenu, go, menuOpen }) {
  return (
    <header className="site-header">
      <button type="button"
        className="brand"
        onClick={() => go("/")}
        aria-label={`${content.brand} — home`}
      >
        <span
          className="brand-mark"
          aria-hidden="true"
        >
          △
        </span>
        <span>{content.brand}</span>
      </button>
      <div className="header-right">
        <span className="availability">
          <i aria-hidden="true" />
          AVAILABLE FOR SELECT PROJECTS
        </span>
        <button type="button"
          className="menu-button"
          onClick={onMenu}
          aria-label={
            menuOpen
              ? "Close navigation"
              : "Open navigation"
          }
          aria-expanded={menuOpen}
          aria-controls="primary-menu"
        >
          <span>MENU</span>
          <span
            className="menu-lines"
            aria-hidden="true"
          >
            <b />
            <b />
          </span>
        </button>
      </div>
    </header>
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
// The environment itself remains fixed behind the page through PolarScene.
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
      if (!hero || !heroCopy) return;
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
          scrollTrigger: {
            trigger: heroCopy,
            start: "top 88%",
            end: "top 52%",
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
          <div className="hero-kicker">
            <span>01</span>
            {content.hero.eyebrow}
          </div>
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
        <div className="section-index">
          02 / SIGNAL
        </div>
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
      <section id="projects" className="projects section">
        <div className="section-head reveal">
          <div className="section-index">
            03 / PROJECTS
          </div>
          <span>SELECTED WORK</span>
        </div>
        <div className="project-stack">
          <a
            className="text-link"
            href="/projects"
            onClick={(e) => { e.preventDefault(); go("/projects"); }}
          >
            ENTER PROJECTS
            <span>↗</span>
          </a>
        </div>
      </section>
      <section id="capabilities" className="capabilities section reveal">
        <div className="section-index">
          04 / CAPABILITIES
        </div>
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
        <div className="section-index">
          05 / TERRITORY
        </div>
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
      <section id="statement" className="statement section reveal">
        <div className="statement-orbit" />
        <div>
          <span className="section-index">
            06 / NEXT
          </span>
          <h2>
            MAKE THE
            <br />
            <em>IMPOSSIBLE</em>
            <br />
            FEEL INEVITABLE.
          </h2>
          <a
            className="text-link"
            href="/about"
            onClick={(e) => { e.preventDefault(); go("/about"); }}
          >
            ABOUT THE LAB
            <span>↗</span>
          </a>
        </div>
      </section>
      <ContactCTA />
      <Footer />
    </main>
  );
}
function ContactCTA() {
  return (
    <section id="contact" className="contact-cta section reveal">
      <span className="section-index">
        07 / CONTACT
      </span>
      <h2>
        HAVE A PROBLEM
        <br />
        WORTH SOLVING?
      </h2>
      <a
        href={`mailto:${content.email}`}
        className="contact-button"
      >
        <span>{content.email}</span>
        <b>↗</b>
      </a>
    </section>
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
function Menu({
  open,
  close,
  go,
  path,
}) {
  const overlayRef = React.useRef(null);
  const firstItemRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab") {
        const focusables =
          overlayRef.current
            ? overlayRef.current.querySelectorAll(
                'button, a[href], [tabindex]:not([tabindex="-1"])'
              )
            : [];
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last =
          focusables[
            focusables.length - 1
          ];
        if (
          e.shiftKey &&
          document.activeElement === first
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          document.activeElement === last
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener(
      "keydown",
      onKey
    );
    const t = setTimeout(() => {
      if (firstItemRef.current) {
        firstItemRef.current.focus();
      }
    }, 60);
    return () => {
      document.removeEventListener(
        "keydown",
        onKey
      );
      clearTimeout(t);
    };
  }, [open, close]);
  const item = (
    href,
    idx,
    label,
    sub,
    ref
  ) => (
    <button type="button"
      ref={ref}
      onClick={() => go(href)}
      aria-current={
        path === href
          ? "page"
          : undefined
      }
    >
      <span>{idx}</span>
      <span>{label}</span>
      <i aria-hidden="true">
        {sub}
      </i>
    </button>
  );
  return (
    <div
      ref={overlayRef}
      id="primary-menu"
      className={`menu-overlay ${
        open ? "is-open" : ""
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Site navigation"
    >
      <div className="menu-top">
        <span>
          ANTARCTIC LABS / NAVIGATION
        </span>
        <button type="button"
          onClick={close}
          aria-label="Close navigation menu"
        >
          CLOSE
          <b aria-hidden="true">
            ×
          </b>
        </button>
      </div>
      <nav>
        {item(
          "/",
          "01",
          "HOME",
          "THE FIELD",
          firstItemRef
        )}
        {item(
          "/the-lab",
          "02",
          "THE LAB",
          "FIELD STATION"
        )}
        {item(
          "/projects",
          "03",
          "PROJECTS",
          "SELECTED WORK"
        )}
        {item(
          "/tower-of-babel",
          "04",
          "TOWER OF BABEL",
          "LIBRARY"
        )}
        {item(
          "/government",
          "05",
          "GOVERNMENT",
          "PUBLIC SECTOR"
        )}
        {item(
          "/about",
          "06",
          "ABOUT",
          "JOSHUA ALMODOVAR"
        )}
        {item(
          "/contact",
          "07",
          "CONTACT",
          "GET IN TOUCH"
        )}
      </nav>
      <div className="menu-bottom">
        <a
          href={`mailto:${content.email}`}
        >
          {content.email}
        </a>
        <span>
          FLORIDA / WORLDWIDE
        </span>
      </div>
    </div>
  );
}
function Footer() {
  return (
    <footer className="site-footer">
      <span>
        © {new Date().getFullYear()}{" "}
        ANTARCTIC LABS
      </span>
      <span>
        BUILT FOR THE UNKNOWN
      </span>
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