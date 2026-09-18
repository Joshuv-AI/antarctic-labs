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
  Systems,
  History,
  TowerOfBabel,
  TowerLibrary,
  LibraryArtifact,
  Government,
  FieldInterests,
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

  // Legacy-route redirect handling (Stage F — IA consolidation).
  // Old paths (/systems, /expeditions, /history, /operator, /field-interests)
  // are mapped to their canonical equivalents so historical bookmarks,
  // links, and crawls continue to resolve. The first-paint redirect
  // happens in App's body before the first paint; popstate handles
  // browser back/forward; the go() helper handles in-app clicks.
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
      const target = legacyRedirect(raw) || (matchRoute(raw) ? raw : "/404");
      if (target !== raw) {
        window.history.replaceState({}, "", target);
      }
      setPath(target);
      setMenuOpen(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  // Apply per-route SEO metadata on every navigation.
  useEffect(() => {
    applyMeta(path);
  }, [path]);

  const go = (to) => {
    if (to === path || transitioning) return;
    // Translate legacy URLs (e.g. /operator, /expeditions, /systems)
    // to their canonical equivalents on click. Keeps the visible URL
    // canonical from the user's first interaction.
    const canonical = legacyRedirect(to) || to;
    if (to === path || canonical === path) return;
    setMenuOpen(false);
    setTransitioning(true);
    window.setTimeout(() => {
      window.history.pushState({}, "", canonical);
      setPath(canonical);
      window.scrollTo(0, 0);
      window.setTimeout(() => setTransitioning(false), 80);
    }, 520);
  };

  const match = matchRoute(path);
  const pageParams = match && typeof match === "object" ? match.params : {};
  const matchedPattern = match && typeof match === "object" ? match.pattern : null;

  return (
    <>
      {path === "/" && <PolarScene />}
      <SiteHeader onMenu={() => setMenuOpen(true)} go={go} />
      <PageCurtain active={transitioning} label={pathLabel(path)} />
      {path === "/" && <Home go={go} />}
      {path === "/the-lab" && <TheLab go={go} />}
      {path === "/projects" && <Projects go={go} />}
      {matchedPattern === "/projects/:id" && <ProjectDetail go={go} params={pageParams} />}
      {path === "/tower-of-babel" && <TowerOfBabel go={go} />}
      {path === "/tower-of-babel/library" && <TowerLibrary go={go} />}
      {matchedPattern === "/tower-of-babel/library/:id" && <LibraryArtifact go={go} params={pageParams} />}
      {path === "/government" && <Government go={go} />}
      {path === "/about" && <About go={go} />}
      {path === "/transmission" && <Transmission go={go} />}
      {path === "/404" && <NotFound go={go} />}
      <Menu open={menuOpen} close={() => setMenuOpen(false)} go={go} />
    </>
  );
}

function SiteHeader({ onMenu, go }) {
  return (
    <header className="site-header">
      <button className="brand" onClick={() => go("/")}>
        <span className="brand-mark">△</span>
        <span>{content.brand}</span>
      </button>
      <div className="header-right">
        <span className="availability"><i /> AVAILABLE FOR SELECT PROJECTS</span>
        <button className="menu-button" onClick={onMenu} aria-label="Open navigation">
          <span>MENU</span><span className="menu-lines"><b/><b/></span>
        </button>
      </div>
    </header>
  );
}

function PageCurtain({ active, label }) {
  return (
    <div className={`page-curtain ${active ? "is-active" : ""}`} aria-hidden="true">
      <div className="curtain-glow" />
      <span>{label}</span>
    </div>
  );
}

function useReveal(scope) {
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray(".reveal").forEach((el) => {
        gsap.fromTo(el, { y: 55, opacity: 0 }, {
          y: 0, opacity: 1, duration: 1, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true }
        });
      });
    }, scope);
    return () => ctx.revert();
  }, [scope]);
}

function Home({ go }) {
  const root = useRef(null);
  useReveal(root);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
      tl.from(".hero-kicker", { y: 24, opacity: 0, duration: 0.8, delay: 0.12 })
        .from(".hero-line", { yPercent: 110, duration: 1.05, stagger: 0.08 }, "-=0.45")
        .from(".hero-bottom", { y: 24, opacity: 0, duration: 0.8 }, "-=0.5");
      gsap.to(".hero-orb", { y: 70, rotation: 12, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
      gsap.to(".hero-copy", { y: -70, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <main ref={root} className="page-shell">
      <section className="hero section">
        <div className="hero-orb" aria-hidden="true" />
        <div className="hero-copy">
          <div className="hero-kicker"><span>01</span>{content.hero.eyebrow}</div>
          <h1>
            {content.hero.title.map((line) => <span className="hero-line-wrap" key={line}><span className="hero-line">{line}</span></span>)}
          </h1>
          <div className="hero-bottom">
            <p>{content.hero.sub}</p>
            <button className="hero-cta" onClick={() => go(content.hero.cta.to)}>
              {content.hero.cta.label} <span aria-hidden="true">↗</span>
            </button>
            <span className="hero-scroll-cue">SCROLL TO EXPLORE <b aria-hidden="true">↓</b></span>
          </div>
        </div>
      </section>

      <section className="manifesto section reveal">
        <div className="section-index">02 / SIGNAL</div>
        <div className="manifesto-text">
          <p className="signal-line">{content.hero.signal}</p>
          <p className="display-copy">{content.hero.body}</p>
          <p className="body-copy method-line">{content.hero.method}</p>
        </div>
      </section>

      <section className="projects section">
        <div className="section-head reveal"><div className="section-index">03 / PROJECTS</div><span>SELECTED WORK</span></div>
        <div className="project-stack">
          <button className="text-link" onClick={() => go("/projects")}>ENTER PROJECTS <span>↗</span></button>
        </div>
      </section>

      <section className="capabilities section reveal">
        <div className="section-index">04 / CAPABILITIES</div>
        <div className="capability-list">
          {content.capabilities.map(([n, title, desc]) => (
            <div className="cap-row" key={n}><span>{n}</span><h3>{title}</h3><p>{desc}</p><i>+</i></div>
          ))}
        </div>
      </section>

      <section className="territory section reveal">
        <div className="section-index">05 / TERRITORY</div>
        <div className="territory-list">
          {[
            ["AI / INTELLIGENCE",      "Language models, agents, orchestration, machine-assisted operations."],
            ["AUTONOMOUS SYSTEMS",     "Long-running software that keeps going without someone pushing every button."],
            ["AUTOMATION",             "Browser automation, APIs, webhooks, workflows, data pipelines."],
            ["SOFTWARE",               "Web applications, interfaces, internal tools, integrations, infrastructure."],
            ["DATA & RESEARCH",        "Scraping, extraction, cleaning, structuring, and turning scattered information into something usable."],
            ["BLOCKCHAIN",             "Smart contracts, DeFi systems, on-chain experimentation."],
            ["FINANCE",                "Strategy, signals, paper trading, backtest harnesses, markets as a study in systems."],
            ["DIGITAL EXPERIENCES",    "Interactive interfaces, immersive web, prototypes, unusual ways to put information in front of someone."],
            ["EXPERIMENTAL TECHNOLOGY","Emerging tools, unusual interfaces, ideas that don't fit neatly into another category."],
          ].map(([title, desc]) => (
            <div className="cap-row" key={title}>
              <h3>{title}</h3>
              <p>{desc}</p>
              <i>+</i>
            </div>
          ))}
        </div>
      </section>

      <section className="statement section reveal">
        <div className="statement-orbit" />
        <div>
          <span className="section-index">06 / NEXT</span>
          <h2>MAKE THE<br/><em>IMPOSSIBLE</em><br/>FEEL INEVITABLE.</h2>
          <button className="text-link" onClick={() => go("/about")}>ABOUT THE LAB <span>↗</span></button>
        </div>
      </section>

      <ContactCTA />
      <Footer />
    </main>
  );
}

function ContactCTA() {
  return (
    <section className="contact-cta section reveal">
      <span className="section-index">07 / CONTACT</span>
      <h2>HAVE A PROBLEM<br/>WORTH SOLVING?</h2>
      <a href={`mailto:${content.email}`} className="contact-button"><span>{content.email}</span><b>↗</b></a>
    </section>
  );
}

// Local short About def removed (Stage F — IA consolidation):
// The canonical /about route now uses the imported About component
// from ./pages.jsx, which renders the substantive Operator profile
// (preserving Joshua Almodovar's personal/background material).
// This file no longer needs a placeholder About component.

function NotFound({ go }) {
  return <main className="page-shell inner-page"><section className="inner-hero section"><div className="section-index">404</div><h1>LOST IN<br/><em>THE ICE.</em></h1><button className="text-link" onClick={() => go("/")}>RETURN HOME <span>↗</span></button></section></main>;
}

function Menu({ open, close, go }) {
  return (
    <div className={`menu-overlay ${open ? "is-open" : ""}`}>
      <div className="menu-top"><span>ANTARCTIC LABS / NAVIGATION</span><button onClick={close}>CLOSE <b>×</b></button></div>
      <nav>
        <button onClick={() => go("/")}><span>01</span><span>HOME</span><i>THE FIELD</i></button>
        <button onClick={() => go("/the-lab")}><span>02</span><span>THE LAB</span><i>FIELD STATION</i></button>
        <button onClick={() => go("/projects")}><span>03</span><span>PROJECTS</span><i>SELECTED WORK</i></button>
        <button onClick={() => go("/tower-of-babel")}><span>04</span><span>TOWER OF BABEL</span><i>LIBRARY</i></button>
        <button onClick={() => go("/government")}><span>05</span><span>GOVERNMENT</span><i>PUBLIC SECTOR</i></button>
        <button onClick={() => go("/about")}><span>06</span><span>ABOUT</span><i>JOSHUA ALMODOVAR</i></button>
        <button onClick={() => go("/transmission")}><span>07</span><span>TRANSMISSION</span><i>CONTACT</i></button>
      </nav>
      <div className="menu-bottom"><a href={`mailto:${content.email}`}>{content.email}</a><span>FLORIDA / WORLDWIDE</span></div>
    </div>
  );
}

function Footer() {
  return <footer className="site-footer"><span>© {new Date().getFullYear()} ANTARCTIC LABS</span><span>BUILT FOR THE UNKNOWN</span><button onClick={() => window.scrollTo({top: 0, behavior: "smooth"})}>↑ TOP</button></footer>;
}

createRoot(document.getElementById("root")).render(<App />);
