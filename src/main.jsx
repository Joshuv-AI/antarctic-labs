import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./styles.css";

import PolarScene from "./PolarScene";

import { site as content } from "./content/site.js";
import { routes } from "./content/routes.js";
import { matchRoute } from "./content/routes.js";
import { applyMeta } from "./seo.js";
import {
  TheLab,
  Systems,
  Expeditions,
  ExpeditionDetail,
  History,
  TowerOfBabel,
  TowerLibrary,
  LibraryArtifact,
  Government,
  TheOperator,
  FieldInterests,
  Transmission,
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
    const onPop = () => {
      const next = matchRoute(window.location.pathname) ? window.location.pathname : "/404";
      setPath(next);
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
    setMenuOpen(false);
    setTransitioning(true);
    window.setTimeout(() => {
      window.history.pushState({}, "", to);
      setPath(to);
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
      {path === "/about" && <About go={go} />}
      {path === "/the-lab" && <TheLab go={go} />}
      {path === "/systems" && <Systems go={go} />}
      {path === "/expeditions" && <Expeditions go={go} />}
      {matchedPattern === "/expeditions/:id" && <ExpeditionDetail go={go} params={pageParams} />}
      {path === "/history" && <History go={go} />}
      {path === "/tower-of-babel" && <TowerOfBabel go={go} />}
      {path === "/tower-of-babel/library" && <TowerLibrary go={go} />}
      {matchedPattern === "/tower-of-babel/library/:id" && <LibraryArtifact go={go} params={pageParams} />}
      {path === "/government" && <Government go={go} />}
      {path === "/operator" && <TheOperator go={go} />}
      {path === "/field-interests" && <FieldInterests go={go} />}
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
            <div className="hero-actions">
              <button className="text-link" onClick={() => go(content.hero.cta.to)}>{content.hero.cta.label} <span>↗</span></button>
              <span className="scroll-cue">SCROLL TO EXPLORE <b>↓</b></span>
            </div>
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
        <div className="section-head reveal"><div className="section-index">03 / EXPEDITIONS</div><span>SELECTED WORK</span></div>
        <div className="project-stack">
          <button className="text-link" onClick={() => go("/expeditions")}>ENTER EXPEDITIONS <span>↗</span></button>
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

      <section className="statement section reveal">
        <div className="statement-orbit" />
        <div>
          <span className="section-index">05 / NEXT</span>
          <h2>MAKE THE<br/><em>IMPOSSIBLE</em><br/>FEEL INEVITABLE.</h2>
          <button className="text-link" onClick={() => go("/operator")}>ABOUT THE OPERATOR <span>↗</span></button>
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
      <span className="section-index">06 / CONTACT</span>
      <h2>HAVE A PROBLEM<br/>WORTH SOLVING?</h2>
      <a href={`mailto:${content.email}`} className="contact-button"><span>{content.email}</span><b>↗</b></a>
    </section>
  );
}

function About({ go }) {
  return (
    <main className="page-shell inner-page">
      <section className="inner-hero section">
        <div className="section-index">ABOUT / ANTARCTIC LABS</div>
        <h1>CURIOUS<br/><em>BY DEFAULT.</em></h1>
        <p>A small independent studio exploring the intersection of AI, automation, software, and digital experience.</p>
      </section>
      <section className="about-grid section reveal">
        <div className="about-panel"><span className="section-index">THE IDEA</span><p className="display-copy">Build things that are useful enough to keep and interesting enough to remember.</p></div>
        <div className="about-panel"><span className="section-index">CURRENTLY EXPLORING</span><ul><li>Agentic systems</li><li>Browser automation</li><li>AI-powered operations</li><li>Interactive web</li><li>New software primitives</li></ul></div>
      </section>
      <section className="contact-cta section"><span className="section-index">LET'S BUILD</span><h2>START WITH<br/>A HARD<br/><em>PROBLEM.</em></h2><a href={`mailto:${content.email}`} className="contact-button"><span>{content.email}</span><b>↗</b></a></section>
      <Footer />
    </main>
  );
}

function NotFound({ go }) {
  return <main className="page-shell inner-page"><section className="inner-hero section"><div className="section-index">404</div><h1>LOST IN<br/><em>THE ICE.</em></h1><button className="text-link" onClick={() => go("/")}>RETURN HOME <span>↗</span></button></section></main>;
}

function Menu({ open, close, go }) {
  return (
    <div className={`menu-overlay ${open ? "is-open" : ""}`}>
      <div className="menu-top"><span>ANTARCTIC LABS / NAVIGATION</span><button onClick={close}>CLOSE <b>×</b></button></div>
      <nav>
        <button onClick={() => go("/")}>01 <span>ARRIVAL</span><i>THE FIELD</i></button>
        <button onClick={() => go("/the-lab")}>02 <span>THE LAB</span><i>FIELD STATION</i></button>
        <button onClick={() => go("/systems")}>03 <span>SYSTEMS</span><i>OPERATING</i></button>
        <button onClick={() => go("/expeditions")}>04 <span>EXPEDITIONS</span><i>SELECTED WORK</i></button>
        <button onClick={() => go("/history")}>05 <span>HISTORY</span><i>TIMELINE</i></button>
        <button onClick={() => go("/tower-of-babel")}>06 <span>TOWER OF BABEL</span><i>LIBRARY</i></button>
        <button onClick={() => go("/government")}>07 <span>GOVERNMENT</span><i>PUBLIC SECTOR</i></button>
        <button onClick={() => go("/operator")}>08 <span>THE OPERATOR</span><i>JOSHUA ALMODOVAR</i></button>
        <button onClick={() => go("/field-interests")}>09 <span>FIELD INTERESTS</span><i>RESEARCH</i></button>
        <button onClick={() => go("/transmission")}>10 <span>TRANSMISSION</span><i>CONTACT</i></button>
        <button onClick={() => go("/about")}>11 <span>ABOUT</span><i>THE STUDIO</i></button>
      </nav>
      <div className="menu-bottom"><a href={`mailto:${content.email}`}>{content.email}</a><span>FLORIDA / WORLDWIDE</span></div>
    </div>
  );
}

function Footer() {
  return <footer className="site-footer"><span>© {new Date().getFullYear()} ANTARCTIC LABS</span><span>BUILT FOR THE UNKNOWN</span><button onClick={() => window.scrollTo({top: 0, behavior: "smooth"})}>↑ TOP</button></footer>;
}

createRoot(document.getElementById("root")).render(<App />);
