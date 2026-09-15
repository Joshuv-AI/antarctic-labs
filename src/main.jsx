import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./styles.css";

import PolarScene from "./PolarScene";

gsap.registerPlugin(ScrollTrigger);

const content = {
  brand: "ANTARCTIC LABS",
  email: "hello@antarcticlabs.com",
  hero: {
    eyebrow: "INDEPENDENT DIGITAL STUDIO",
    title: ["BUILD", "WHAT'S", "NEXT."],
    sub: "AI systems, automation, software, and digital experiences built with intent."
  },
  projects: [
    {
      number: "01",
      title: "Project One",
      type: "AI / AUTOMATION",
      description: "A flagship case-study slot for a serious system build. The visual architecture is ready; the real project will replace this content.",
      status: "COMING ONLINE"
    },
    {
      number: "02",
      title: "Project Two",
      type: "SOFTWARE / EXPERIENCE",
      description: "A second major project slot reserved for a deeper build, presented as an immersive case study.",
      status: "IN DEVELOPMENT"
    }
  ],
  capabilities: [
    ["01", "AI SYSTEMS", "Agents, intelligent workflows, APIs, orchestration."],
    ["02", "AUTOMATION", "Browser automation, data pipelines, operational systems."],
    ["03", "SOFTWARE", "Web applications, interfaces, internal tools, integrations."],
    ["04", "EXPERIMENTAL", "Interactive experiences, creative technology, prototypes."]
  ]
};

const routes = ["/", "/project-01", "/project-02", "/about"];

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
      setPath(routes.includes(window.location.pathname) ? window.location.pathname : "/404");
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

  return (
    <>
      {path === "/" && <PolarScene />}
      <SiteHeader onMenu={() => setMenuOpen(true)} go={go} />
      <PageCurtain active={transitioning} label={pathLabel(path)} />
      {path === "/" && <Home go={go} />}
      {path === "/project-01" && <ProjectPage index={0} go={go} />}
      {path === "/project-02" && <ProjectPage index={1} go={go} />}
      {path === "/about" && <About go={go} />}
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
            <span className="scroll-cue">SCROLL TO EXPLORE <b>↓</b></span>
          </div>
        </div>
      </section>

      <section className="manifesto section reveal">
        <div className="section-index">02 / SIGNAL</div>
        <div className="manifesto-text">
          <p className="display-copy">We build <em>useful</em> technology with the atmosphere of a world that has not been discovered yet.</p>
          <p className="body-copy">Antarctic Labs is an independent digital studio focused on systems, automation, AI, and experimental web experiences.</p>
        </div>
      </section>

      <section className="projects section">
        <div className="section-head reveal"><div className="section-index">03 / SELECTED WORK</div><span>CASE STUDIES</span></div>
        <div className="project-stack">
          {content.projects.map((p, i) => <ProjectCard key={p.number} p={p} index={i} onClick={() => go(`/project-0${i + 1}`)} />)}
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
          <button className="text-link" onClick={() => go("/about")}>ABOUT ANTARCTIC LABS <span>↗</span></button>
        </div>
      </section>

      <ContactCTA />
      <Footer />
    </main>
  );
}

function ProjectCard({ p, index, onClick }) {
  const card = useRef(null);
  const onMove = (e) => {
    const r = card.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    card.current.style.setProperty("--mx", `${x * 2}%`);
    card.current.style.setProperty("--my", `${y * 2}%`);
    card.current.style.setProperty("--rx", `${-y * 2}deg`);
    card.current.style.setProperty("--ry", `${x * 2}deg`);
  };
  const onLeave = () => {
    card.current.style.setProperty("--mx", "0%");
    card.current.style.setProperty("--my", "0%");
    card.current.style.setProperty("--rx", "0deg");
    card.current.style.setProperty("--ry", "0deg");
  };

  return (
    <button className="project-card reveal" ref={card} onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick}>
      <div className={`project-art art-${index + 1}`}>
        <div className="art-sheen" />
        <div className="art-aurora" />
        <div className="art-glow" />
        <div className="art-mountain back" />
        <div className="art-mountain front" />
        <span className="art-code">AL / {p.number}</span>
        <span className="art-location">ICE FIELD 78° S</span>
        <span className="art-enter">OPEN CASE STUDY ↗</span>
      </div>
      <div className="project-meta"><span className="project-num">{p.number}</span><div><small>{p.type}</small><h3>{p.title}</h3></div><span className="project-arrow">↗</span></div>
    </button>
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

function ProjectPage({ index, go }) {
  const p = content.projects[index];
  return (
    <main className="page-shell inner-page">
      <section className="inner-hero section">
        <div className="section-index">PROJECT {p.number}</div>
        <h1>{p.title}</h1>
        <p>{p.description}</p>
      </section>
      <section className="project-feature section">
        <div className={`project-art large art-${index + 1}`}><div className="art-sheen"/><div className="art-aurora"/><div className="art-mountain back"/><div className="art-mountain front"/><span className="art-code">ANTARCTIC / {p.number}</span></div>
      </section>
      <section className="detail-grid section">
        <div><span className="section-index">STATUS</span><strong>{p.status}</strong></div>
        <div><span className="section-index">TYPE</span><strong>{p.type}</strong></div>
        <div><span className="section-index">ROLE</span><strong>DESIGN / SYSTEMS / BUILD</strong></div>
      </section>
      <section className="copy-block section">
        <span className="section-index">CASE STUDY PLACEHOLDER</span>
        <p className="display-copy">Problem. Approach. System. Implementation. Outcome. Proof. This architecture is ready for the real project.</p>
      </section>
      <div className="page-next"><button className="text-link" onClick={() => go(index === 0 ? "/project-02" : "/about")}>{index === 0 ? "NEXT PROJECT" : "ABOUT"} <span>↗</span></button></div>
      <Footer />
    </main>
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
        <button onClick={() => go("/")}>01 <span>HOME</span><i>THE FIELD</i></button>
        <button onClick={() => go("/project-01")}>02 <span>PROJECT 01</span><i>SELECTED WORK</i></button>
        <button onClick={() => go("/project-02")}>03 <span>PROJECT 02</span><i>SELECTED WORK</i></button>
        <button onClick={() => go("/about")}>04 <span>ABOUT</span><i>THE STUDIO</i></button>
      </nav>
      <div className="menu-bottom"><a href={`mailto:${content.email}`}>{content.email}</a><span>FLORIDA / WORLDWIDE</span></div>
    </div>
  );
}

function Footer() {
  return <footer className="site-footer"><span>© {new Date().getFullYear()} ANTARCTIC LABS</span><span>BUILT FOR THE UNKNOWN</span><button onClick={() => window.scrollTo({top: 0, behavior: "smooth"})}>↑ TOP</button></footer>;
}

import { useRef } from "react";

createRoot(document.getElementById("root")).render(<App />);
