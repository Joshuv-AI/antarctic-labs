import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import PolarScene from "./scenes/PolarScene";
import "./styles.css";
gsap.registerPlugin(ScrollTrigger);
const SITE = {
  brand: "ANTARCTIC LABS",
  shortBrand: "AL",
  email: "hello@antarctic-labs.com",
  location: "INDEPENDENT / REMOTE",
  availability: "AVAILABLE FOR SELECT BUILDS",
  version: "FIELD SYSTEM / 01",
  description:
    "Independent digital systems, AI, automation, software, and experimental web experiences.",
};
const PROJECTS = [
  {
    id: "01",
    slug: "project-01",
    title: "AI OPERATIONS SYSTEM",
    category: "AI / AUTOMATION",
    type: "FIELD NOTE / BUILD",
    year: "2026",
    index: "01",
    signal: "INTELLIGENCE / ORCHESTRATION",
    description:
      "A systems-oriented automation environment designed to turn fragmented operations into a coordinated machine.",
    brief:
      "The objective was not to add another interface. It was to create a reliable operating layer between information, decisions, tools, and execution.",
    terrain:
      "Messy inputs. Repetitive decisions. Multiple tools. Human attention consumed by work that should have become infrastructure.",
    system:
      "A modular orchestration layer connecting structured workflows, AI reasoning, automation, browser interaction, and persistent operational state.",
    build:
      "Architecture / AI workflows / automation / browser systems / operational tooling",
    result:
      "A clearer path from signal to action, with the system carrying more of the repetitive operational load.",
    stack:
      "AI / AUTOMATION / BROWSER SYSTEMS / APIs / WORKFLOW ORCHESTRATION",
  },
  {
    id: "02",
    slug: "project-02",
    title: "DIGITAL TERRITORY",
    category: "SOFTWARE / EXPERIENCE",
    type: "FIELD NOTE / EXPERIMENT",
    year: "2026",
    index: "02",
    signal: "INTERFACE / ENVIRONMENT",
    description:
      "An experimental digital environment exploring how software can feel like a place rather than a collection of screens.",
    brief:
      "The challenge was to build an experience with enough structure to communicate clearly without losing the sense of exploration.",
    terrain:
      "Traditional layouts. Predictable interaction patterns. A digital surface that needed to become something more spatial.",
    system:
      "A responsive visual system combining procedural environments, motion, typography, interaction, and narrative pacing.",
    build:
      "Creative development / Three.js / React / GSAP / interaction design",
    result:
      "A digital environment where the interface and the world around it operate as one system.",
    stack:
      "REACT / THREE.JS / GSAP / WEBGL / INTERACTION",
  },
];
const CAPABILITIES = [
  {
    number: "01",
    title: "AI SYSTEMS",
    text:
      "Reasoning layers, agents, knowledge workflows, and intelligent interfaces designed around actual operations.",
  },
  {
    number: "02",
    title: "AUTOMATION",
    text:
      "Connected workflows that reduce repetitive work and move information from signal to execution.",
  },
  {
    number: "03",
    title: "SOFTWARE",
    text:
      "Interfaces and applications built with a bias toward clarity, reliability, and useful complexity.",
  },
  {
    number: "04",
    title: "EXPERIMENTAL",
    text:
      "Web experiences that use motion, 3D, interaction, and unconventional systems when they serve the idea.",
  },
];
const ROUTE_META = {
  "/": {
    title: "Antarctic Labs — Digital Systems & AI",
    description: SITE.description,
  },
  "/project-01": {
    title: "AI Operations System — Antarctic Labs",
    description:
      "A field note on AI systems, automation, orchestration, and operational tooling.",
  },
  "/project-02": {
    title: "Digital Territory — Antarctic Labs",
    description:
      "An experimental digital environment combining software, interaction, motion, and WebGL.",
  },
  "/about": {
    title: "About — Antarctic Labs",
    description:
      "The position, principles, and operating philosophy behind Antarctic Labs.",
  },
};
function normalizePath(pathname) {
  if (!pathname) return "/";
  const clean = pathname
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
  return clean || "/";
}
function getRoute() {
  return normalizePath(window.location.pathname);
}
function navigate(path) {
  const normalized = normalizePath(path);
  if (normalizePath(window.location.pathname) === normalized) {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
    return;
  }
  window.history.pushState({}, "", normalized);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({
    top: 0,
    behavior: "auto",
  });
}
function useRoute() {
  const [route, setRoute] = useState(getRoute);
  useEffect(() => {
    const handlePopState = () => {
      setRoute(getRoute());
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);
  return route;
}
function useDocumentMeta(route) {
  useEffect(() => {
    const metadata =
      ROUTE_META[route] || {
        title: "Unknown Territory — Antarctic Labs",
        description:
          "This coordinate does not exist. Return to known territory.",
      };
    document.title = metadata.title;
    const description = document.querySelector(
      'meta[name="description"]',
    );
    if (description) {
      description.setAttribute(
        "content",
        metadata.description,
      );
    }
    const canonical = document.querySelector(
      'link[rel="canonical"]',
    );
    if (canonical) {
      const canonicalPath =
        route === "/" ? "/" : `${route}/`;
      canonical.setAttribute(
        "href",
        `https://antarctic-labs.com${canonicalPath}`,
      );
    }
    window.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }, [route]);
}
function usePageEntrance(dependencies = []) {
  const rootRef = useRef(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const context = gsap.context(() => {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const revealItems = root.querySelectorAll(
        "[data-reveal]",
      );
      const lines = root.querySelectorAll(
        "[data-line]",
      );
      const sectionItems = root.querySelectorAll(
        "[data-scroll-reveal]",
      );
      if (reducedMotion) {
        gsap.set(
          [
            ...revealItems,
            ...lines,
            ...sectionItems,
          ],
          {
            clearProps: "all",
            opacity: 1,
            y: 0,
            yPercent: 0,
          },
        );
        return;
      }
      if (revealItems.length) {
        gsap.fromTo(
          revealItems,
          {
            y: 34,
            opacity: 0,
          },
          {
            y: 0,
            opacity: 1,
            duration: 1.15,
            stagger: 0.055,
            ease: "power3.out",
            clearProps: "transform",
          },
        );
      }
      lines.forEach((line) => {
        gsap.fromTo(
          line,
          {
            yPercent: 105,
          },
          {
            yPercent: 0,
            duration: 1.05,
            ease: "power4.out",
            delay: 0.08,
          },
        );
      });
      sectionItems.forEach((item) => {
        gsap.fromTo(
          item,
          {
            y: 45,
            opacity: 0,
          },
          {
            y: 0,
            opacity: 1,
            duration: 1.1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: item,
              start: "top 84%",
              once: true,
            },
          },
        );
      });
    }, root);
    return () => context.revert();
  }, dependencies);
  return rootRef;
}
function useScrollAtmosphere() {
  useEffect(() => {
    let raf = 0;
    let current = 0;
    let target = 0;
    const handleScroll = () => {
      target = window.scrollY;
    };
    const update = () => {
      current += (target - current) * 0.08;
      document.documentElement.style.setProperty(
        "--scroll-progress",
        String(current),
      );
      raf = requestAnimationFrame(update);
    };
    window.addEventListener(
      "scroll",
      handleScroll,
      { passive: true },
    );
    raf = requestAnimationFrame(update);
    return () => {
      window.removeEventListener(
        "scroll",
        handleScroll,
      );
      cancelAnimationFrame(raf);
    };
  }, []);
}
function Brand({ onNavigate }) {
  return (
    <button
      type="button"
      className="brand"
      onClick={() => onNavigate("/")}
      aria-label="Antarctic Labs home"
    >
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-mark-line" />
        <span className="brand-mark-line" />
        <span className="brand-mark-line" />
      </span>
      <span className="brand-copy">
        <span>{SITE.brand}</span>
        <small>{SITE.version}</small>
      </span>
    </button>
  );
}
function MenuTrigger({ open, onClick }) {
  return (
    <button
      type="button"
      className={`menu-trigger ${
        open ? "is-open" : ""
      }`}
      onClick={onClick}
      aria-label={
        open
          ? "Close navigation"
          : "Open navigation"
      }
      aria-expanded={open}
      aria-controls="site-navigation"
    >
      <span className="menu-trigger-label">
        {open ? "CLOSE" : "MENU"}
      </span>
      <span
        className="menu-trigger-icon"
        aria-hidden="true"
      >
        <span />
        <span />
      </span>
    </button>
  );
}
function Header({
  menuOpen,
  setMenuOpen,
  onNavigate,
}) {
  return (
    <header className="site-header">
      <Brand onNavigate={onNavigate} />
      <div className="header-meta">
        <span>{SITE.location}</span>
        <span
          className="header-dot"
          aria-hidden="true"
        />
        <span>{SITE.availability}</span>
      </div>
      <MenuTrigger
        open={menuOpen}
        onClick={() =>
          setMenuOpen((value) => !value)
        }
      />
    </header>
  );
}
function Menu({
  open,
  onNavigate,
}) {
  const menuRef = useRef(null);
  useLayoutEffect(() => {
    if (!menuRef.current) return undefined;
    const context = gsap.context(() => {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const menuItems =
        menuRef.current.querySelectorAll(
          "[data-menu-item]",
        );
      if (reducedMotion) {
        gsap.set(menuRef.current, {
          autoAlpha: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        });
        gsap.set(menuItems, {
          clearProps: "all",
          opacity: open ? 1 : 0,
          y: 0,
        });
        return;
      }
      if (open) {
        gsap.to(menuRef.current, {
          autoAlpha: 1,
          pointerEvents: "auto",
          duration: 0.55,
          ease: "power3.out",
        });
        gsap.fromTo(
          menuItems,
          {
            y: 40,
            opacity: 0,
          },
          {
            y: 0,
            opacity: 1,
            duration: 0.7,
            stagger: 0.06,
            delay: 0.1,
            ease: "power3.out",
          },
        );
      } else {
        gsap.to(menuRef.current, {
          autoAlpha: 0,
          pointerEvents: "none",
          duration: 0.4,
          ease: "power2.inOut",
        });
      }
    }, menuRef);
    return () => context.revert();
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onNavigate(
          normalizePath(
            window.location.pathname,
          ),
        );
      }
    };
    window.addEventListener(
      "keydown",
      handleKeyDown,
    );
    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [open, onNavigate]);
  const handleNavigate = (path) => {
    onNavigate(path);
  };
  return (
    <aside
      id="site-navigation"
      ref={menuRef}
      className="menu-overlay"
      aria-hidden={!open}
    >
      <div className="menu-overlay-inner">
        <div className="menu-kicker">
          <span>ANTARCTIC LABS</span>
          <span>FIELD SYSTEM / 01</span>
        </div>
        <nav
          className="menu-nav"
          aria-label="Primary navigation"
        >
          <button
            type="button"
            data-menu-item
            onClick={() =>
              handleNavigate("/")
            }
          >
            <span>01</span>
            <strong>HOME</strong>
            <em>ARRIVAL</em>
          </button>
          <button
            type="button"
            data-menu-item
            onClick={() =>
              handleNavigate("/project-01")
            }
          >
            <span>02</span>
            <strong>PROJECTS</strong>
            <em>EXPEDITIONS</em>
          </button>
          <button
            type="button"
            data-menu-item
            onClick={() =>
              handleNavigate("/about")
            }
          >
            <span>03</span>
            <strong>ABOUT</strong>
            <em>POSITION</em>
          </button>
        </nav>
        <div className="menu-footer">
          <span>INDEPENDENT / REMOTE</span>
          <a
            href={`mailto:${SITE.email}`}
            data-menu-item
          >
            {SITE.email}
          </a>
        </div>
      </div>
    </aside>
  );
}
function SectionKicker({
  number,
  label,
  light = false,
}) {
  return (
    <div
      className={`section-kicker ${
        light
          ? "section-kicker-light"
          : ""
      }`}
    >
      <span>{number}</span>
      <span>{label}</span>
    </div>
  );
}
function HomeHero({ onNavigate }) {
  return (
    <section className="hero">
      <div className="hero-inner">
        <div
          className="hero-meta"
          data-reveal
        >
          <span>INDEPENDENT DIGITAL STUDIO</span>
          <span>EST. 2026</span>
        </div>
        <div className="hero-title-wrap">
          <div className="hero-title-mask">
            <h1
              className="hero-title"
              data-line
            >
              BUILD
            </h1>
          </div>
          <div className="hero-title-mask">
            <h1
              className="hero-title hero-title-offset"
              data-line
            >
              THE SYSTEM.
            </h1>
          </div>
        </div>
        <div
          className="hero-bottom"
          data-reveal
        >
          <p className="hero-intro">
            AI systems, automation, software,
            and experimental digital experiences
            for people building beyond the obvious.
          </p>
          <button
            type="button"
            className="hero-cta"
            onClick={() =>
              onNavigate("/project-01")
            }
          >
            <span>ENTER THE FIELD</span>
            <span className="arrow">↘</span>
          </button>
        </div>
        <div
          className="hero-scroll"
          data-reveal
        >
          <span>SCROLL TO DESCEND</span>
          <span
            className="hero-scroll-line"
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  );
}
function Manifesto() {
  return (
    <section className="manifesto section-dark">
      <div className="section-shell">
        <SectionKicker
          number="01"
          label="POSITION"
          light
        />
        <div className="manifesto-grid">
          <div className="manifesto-label">
            <span>FIELD NOTE</span>
            <span>WHY WE BUILD</span>
          </div>
          <h2
            className="manifesto-title"
            data-scroll-reveal
          >
            We build useful machines
            for territory that doesn't
            exist yet.
          </h2>
          <div
            className="manifesto-copy"
            data-scroll-reveal
          >
            <p>
              Antarctic Labs is an independent
              digital studio focused on turning
              difficult ideas into working systems.
            </p>
            <p>
              The work sits between intelligence,
              software, automation, and experience.
              The goal is simple: make something
              useful enough to survive contact with
              the real world.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
function SystemsSection() {
  return (
    <section className="systems section-light">
      <div className="section-shell">
        <SectionKicker
          number="02"
          label="CAPABILITIES"
        />
        <div className="section-heading-row">
          <h2 data-scroll-reveal>
            THE
            <br />
            SYSTEM.
          </h2>
          <p data-scroll-reveal>
            Four disciplines. One operating
            principle: build what makes the
            work better.
          </p>
        </div>
        <div className="capability-list">
          {CAPABILITIES.map((capability) => (
            <article
              className="capability-row"
              key={capability.number}
              data-scroll-reveal
            >
              <span className="capability-number">
                {capability.number}
              </span>
              <h3>{capability.title}</h3>
              <p>{capability.text}</p>
              <span
                className="capability-arrow"
                aria-hidden="true"
              >
                ↗
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
function ExpeditionCard({
  project,
  onNavigate,
}) {
  const cardRef = useRef(null);
  const handlePointerMove = (event) => {
    const card = cardRef.current;
    if (!card) return;
    if (
      window.matchMedia(
        "(pointer: coarse)",
      ).matches
    ) {
      return;
    }
    const rect =
      card.getBoundingClientRect();
    const x =
      (event.clientX - rect.left) /
        rect.width -
      0.5;
    const y =
      (event.clientY - rect.top) /
        rect.height -
      0.5;
    gsap.to(card, {
      rotateX: -y * 3.2,
      rotateY: x * 4,
      duration: 0.45,
      ease: "power2.out",
      overwrite: true,
    });
  };
  const handlePointerLeave = () => {
    if (!cardRef.current) return;
    gsap.to(cardRef.current, {
      rotateX: 0,
      rotateY: 0,
      duration: 0.65,
      ease: "power3.out",
    });
  };
  return (
    <article
      ref={cardRef}
      className="expedition-card"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      data-scroll-reveal
    >
      <div className="expedition-card-top">
        <span>{project.index}</span>
        <span>{project.year}</span>
      </div>
      <div className="expedition-visual">
        <div className="expedition-grid" />
        <div
          className="expedition-orbit"
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
        </div>
        <div
          className="expedition-signal"
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
        </div>
        <span className="expedition-visual-label">
          {project.signal}
        </span>
      </div>
      <div className="expedition-card-body">
        <div className="expedition-card-meta">
          <span>{project.category}</span>
          <span>{project.type}</span>
        </div>
        <h3>{project.title}</h3>
        <p>{project.description}</p>
        <button
          type="button"
          className="text-link"
          onClick={() =>
            onNavigate(
              `/${project.slug}`,
            )
          }
        >
          <span>OPEN FIELD NOTE</span>
          <span aria-hidden="true">↗</span>
        </button>
      </div>
    </article>
  );
}
function Expeditions({ onNavigate }) {
  return (
    <section className="expeditions section-light">
      <div className="section-shell">
        <SectionKicker
          number="03"
          label="SELECTED WORK"
        />
        <div className="section-heading-row">
          <h2 data-scroll-reveal>
            SELECTED
            <br />
            EXPEDITIONS.
          </h2>
          <p data-scroll-reveal>
            A small field record of systems,
            experiments, and environments.
          </p>
        </div>
        <div className="expedition-list">
          {PROJECTS.map((project) => (
            <ExpeditionCard
              key={project.id}
              project={project}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
function Statement() {
  return (
    <section className="statement section-dark">
      <div className="section-shell">
        <SectionKicker
          number="04"
          label="PRINCIPLE"
          light
        />
        <div className="statement-wrap">
          <h2 data-scroll-reveal>
            USEFUL
            <br />
            MACHINES.
          </h2>
          <div
            className="statement-bottom"
            data-scroll-reveal
          >
            <span>
              COMPLEXITY SHOULD
              <br />
              SERVE THE OUTCOME.
            </span>
            <span>
              NOT THE OTHER
              <br />
              WAY AROUND.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
function Contact() {
  return (
    <section className="contact section-light">
      <div className="section-shell">
        <SectionKicker
          number="05"
          label="CONTACT"
        />
        <div className="contact-grid">
          <div>
            <h2 data-scroll-reveal>
              HAVE A
              <br />
              TERRITORY
              <br />
              TO EXPLORE?
            </h2>
          </div>
          <div
            className="contact-side"
            data-scroll-reveal
          >
            <p>
              If the problem is interesting,
              the system can probably be built.
            </p>
            <a
              className="contact-email"
              href={`mailto:${SITE.email}`}
            >
              {SITE.email}
              <span aria-hidden="true">↗</span>
            </a>
            <div className="contact-details">
              <span>{SITE.location}</span>
              <span>{SITE.availability}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
function Footer({ onNavigate }) {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <button
          type="button"
          className="footer-brand"
          onClick={() => onNavigate("/")}
        >
          ANTARCTIC
          <br />
          LABS.
        </button>
        <div className="footer-links">
          <button
            type="button"
            onClick={() =>
              onNavigate("/project-01")
            }
          >
            PROJECTS
          </button>
          <button
            type="button"
            onClick={() =>
              onNavigate("/about")
            }
          >
            ABOUT
          </button>
          <a
            href={`mailto:${SITE.email}`}
          >
            CONTACT
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()}{" "}
          {SITE.brand}
        </span>
        <span>{SITE.version}</span>
        <span>INDEPENDENT / REMOTE</span>
      </div>
    </footer>
  );
}
function Home({ onNavigate }) {
  const rootRef = usePageEntrance([]);
  return (
    <main
      ref={rootRef}
      className="page home-page"
    >
      <HomeHero onNavigate={onNavigate} />
      <Manifesto />
      <SystemsSection />
      <Expeditions
        onNavigate={onNavigate}
      />
      <Statement />
      <Contact />
      <Footer onNavigate={onNavigate} />
    </main>
  );
}
function ProjectHero({ project }) {
  return (
    <section className="project-hero section-dark">
      <div className="section-shell">
        <div className="project-hero-meta">
          <span>{project.id}</span>
          <span>{project.year}</span>
          <span>{project.category}</span>
        </div>
        <div className="project-hero-title">
          <div className="hero-title-mask">
            <h1 data-line>
              {project.title}
            </h1>
          </div>
        </div>
        <div className="project-hero-bottom">
          <span>{project.type}</span>
          <p data-reveal>
            {project.description}
          </p>
        </div>
      </div>
    </section>
  );
}
function ProjectFieldBlock({
  label,
  title,
  text,
  index,
}) {
  return (
    <section
      className="project-field-block section-light"
      data-scroll-reveal
    >
      <div className="section-shell">
        <div className="project-field-grid">
          <div className="project-field-index">
            <span>{index}</span>
            <span>{label}</span>
          </div>
          <div className="project-field-content">
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
function ProjectPage({
  project,
  onNavigate,
}) {
  const rootRef = usePageEntrance([
    project.slug,
  ]);
  const nextProject = PROJECTS.find(
    (item) => item.slug !== project.slug,
  );
  return (
    <main
      ref={rootRef}
      className="page project-page"
    >
      <ProjectHero project={project} />
      <ProjectFieldBlock
        index="01"
        label="BRIEF"
        title="THE QUESTION"
        text={project.brief}
      />
      <ProjectFieldBlock
        index="02"
        label="TERRAIN"
        title="THE TERRAIN"
        text={project.terrain}
      />
      <ProjectFieldBlock
        index="03"
        label="SYSTEM"
        title="THE SYSTEM"
        text={project.system}
      />
      <ProjectFieldBlock
        index="04"
        label="BUILD"
        title="THE BUILD"
        text={project.build}
      />
      <ProjectFieldBlock
        index="05"
        label="RESULT"
        title="THE RESULT"
        text={project.result}
      />
      <section className="project-stack section-dark">
        <div className="section-shell">
          <SectionKicker
            number="06"
            label="STACK"
            light
          />
          <div className="project-stack-content">
            <h2 data-scroll-reveal>
              BUILT
              <br />
              TO MOVE.
            </h2>
            <p data-scroll-reveal>
              {project.stack}
            </p>
          </div>
        </div>
      </section>
      <section className="project-next section-light">
        <div className="section-shell">
          <div className="project-next-inner">
            <span>NEXT EXPEDITION</span>
            <button
              type="button"
              onClick={() =>
                onNavigate(
                  nextProject
                    ? `/${nextProject.slug}`
                    : "/",
                )
              }
            >
              <strong>
                {nextProject
                  ? nextProject.title
                  : "RETURN HOME"}
              </strong>
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
      </section>
      <Footer onNavigate={onNavigate} />
    </main>
  );
}
function About({ onNavigate }) {
  const rootRef = usePageEntrance([]);
  return (
    <main
      ref={rootRef}
      className="page about-page"
    >
      <section className="about-hero section-dark">
        <div className="section-shell">
          <div className="about-meta">
            <span>03 / POSITION</span>
            <span>{SITE.version}</span>
          </div>
          <div className="about-title">
            <div className="hero-title-mask">
              <h1 data-line>BUILDING</h1>
            </div>
            <div className="hero-title-mask">
              <h1 data-line>BEYOND</h1>
            </div>
            <div className="hero-title-mask">
              <h1 data-line>THE MAP.</h1>
            </div>
          </div>
        </div>
      </section>
      <section className="about-manifesto section-light">
        <div className="section-shell">
          <SectionKicker
            number="01"
            label="THE STUDIO"
          />
          <div className="about-grid">
            <h2 data-scroll-reveal>
              SMALL BY DESIGN.
              <br />
              SERIOUS BY DEFAULT.
            </h2>
            <div
              className="about-copy"
              data-scroll-reveal
            >
              <p>
                Antarctic Labs is an independent
                digital studio working across AI,
                automation, software, and
                experimental web experiences.
              </p>
              <p>
                The studio exists for problems
                where the obvious solution is not
                good enough.
              </p>
              <p>
                Instead of starting with a
                predefined stack, the work starts
                with the terrain: what needs to
                happen, what is getting in the way,
                and what should exist when the
                work is finished.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="about-principles section-dark">
        <div className="section-shell">
          <SectionKicker
            number="02"
            label="PRINCIPLES"
            light
          />
          <div className="principle-list">
            <div
              className="principle"
              data-scroll-reveal
            >
              <span>01</span>
              <h3>MAKE IT USEFUL.</h3>
              <p>
                Technology earns its place by
                improving the outcome.
              </p>
            </div>
            <div
              className="principle"
              data-scroll-reveal
            >
              <span>02</span>
              <h3>REMOVE THE NOISE.</h3>
              <p>
                Complexity is acceptable.
                Unnecessary complexity is not.
              </p>
            </div>
            <div
              className="principle"
              data-scroll-reveal
            >
              <span>03</span>
              <h3>BUILD FOR CONTACT.</h3>
              <p>
                Systems should survive real
                people, real constraints, and
                real use.
              </p>
            </div>
            <div
              className="principle"
              data-scroll-reveal
            >
              <span>04</span>
              <h3>LEAVE ROOM TO EXPLORE.</h3>
              <p>
                The best work often begins where
                the specification ends.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="about-contact section-light">
        <div className="section-shell">
          <div className="about-contact-inner">
            <span>AVAILABLE FOR SELECT BUILDS</span>
            <a
              href={`mailto:${SITE.email}`}
            >
              START A CONVERSATION
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </section>
      <Footer onNavigate={onNavigate} />
    </main>
  );
}
function NotFound({ onNavigate }) {
  const rootRef = usePageEntrance([]);
  return (
    <main
      ref={rootRef}
      className="page not-found-page section-dark"
    >
      <div className="section-shell">
        <SectionKicker
          number="404"
          label="UNKNOWN TERRITORY"
          light
        />
        <div className="not-found-content">
          <h1 data-scroll-reveal>
            LOST
            <br />
            IN THE
            <br />
            FIELD.
          </h1>
          <p data-scroll-reveal>
            This coordinate does not exist.
            Return to known territory.
          </p>
          <button
            type="button"
            className="text-link text-link-light"
            onClick={() =>
              onNavigate("/")
            }
          >
            <span>RETURN HOME</span>
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
      <Footer onNavigate={onNavigate} />
    </main>
  );
}
function App() {
  const route = useRoute();
  const [menuOpen, setMenuOpen] =
    useState(false);
  useScrollAtmosphere();
  useDocumentMeta(route);
  useEffect(() => {
    setMenuOpen(false);
    const refresh = window.setTimeout(() => {
      ScrollTrigger.refresh();
    }, 80);
    return () => {
      window.clearTimeout(refresh);
    };
  }, [route]);
  const handleNavigate = (path) => {
    setMenuOpen(false);
    navigate(path);
  };
  let content;
  if (route === "/") {
    content = (
      <Home
        onNavigate={handleNavigate}
      />
    );
  } else if (route === "/project-01") {
    content = (
      <ProjectPage
        project={PROJECTS[0]}
        onNavigate={handleNavigate}
      />
    );
  } else if (route === "/project-02") {
    content = (
      <ProjectPage
        project={PROJECTS[1]}
        onNavigate={handleNavigate}
      />
    );
  } else if (route === "/about") {
    content = (
      <About
        onNavigate={handleNavigate}
      />
    );
  } else {
    content = (
      <NotFound
        onNavigate={handleNavigate}
      />
    );
  }
  return (
    <>
      <PolarScene />
      <Header
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        onNavigate={handleNavigate}
      />
      <Menu
        open={menuOpen}
        onNavigate={handleNavigate}
      />
      {content}
    </>
  );
}
createRoot(
  document.getElementById("root"),
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);