import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import PolarScene from "./PolarScene";
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
    "Antarctic Labs builds useful digital systems for difficult problems — AI, automation, software, and experimental interfaces.",
};

const PROJECTS = [
  {
    number: "01",
    slug: "project-01",
    category: "AI / AUTOMATION",
    type: "FIELD SYSTEM",
    year: "2026",
    title: "AI OPERATIONS SYSTEM",
    signal: "ORCHESTRATION / INTELLIGENCE",

    description:
      "An operational system designed to turn messy information, repeated decisions, and manual workflows into a coordinated machine.",

    brief:
      "Design an AI-driven operating layer capable of receiving information, reasoning through it, coordinating tools, and producing useful outputs without turning the workflow into a black box.",

    terrain:
      "The terrain is fragmented: multiple sources, changing inputs, human judgment, repetitive work, and no single reliable path from signal to action.",

    system:
      "A modular agent architecture combines structured intake, reasoning, tool execution, verification, state, and human checkpoints.",

    build:
      "The system is designed around clear handoffs rather than magic. Each stage has a purpose, a boundary, and a recoverable failure state.",

    result:
      "A reusable operational pattern for turning complex workflows into dependable systems that can be observed, corrected, and extended.",

    stack:
      "AI / AGENTS / AUTOMATION / APIs / BROWSER SYSTEMS / DATA",
  },

  {
    number: "02",
    slug: "project-02",
    category: "SOFTWARE / EXPERIENCE",
    type: "FIELD EXPERIMENT",
    year: "2026",
    title: "DIGITAL TERRITORY",
    signal: "INTERFACE / ENVIRONMENT",

    description:
      "A spatial digital experience where interface, environment, motion, and information operate as one continuous system.",

    brief:
      "Build a digital environment that feels less like a collection of pages and more like a place — while remaining fast, legible, responsive, and useful.",

    terrain:
      "The terrain is the browser itself: constrained screens, changing input, motion, loading conditions, and the tension between spectacle and clarity.",

    system:
      "A WebGL environment becomes the physical layer while typography, navigation, content, and interaction form the human layer above it.",

    build:
      "Scroll becomes movement through the environment. Information appears as field notes, systems, expeditions, and signals rather than generic marketing blocks.",

    result:
      "A distinctive interface language built around atmosphere, hierarchy, and movement without sacrificing the underlying web experience.",

    stack:
      "REACT / THREE.JS / GSAP / WEBGL / INTERACTION / RESPONSIVE SYSTEMS",
  },
];

const CAPABILITIES = [
  {
    number: "01",
    title: "AI SYSTEMS",
    description:
      "Agents, reasoning pipelines, tool use, structured workflows, and systems designed to turn intelligence into useful action.",
  },
  {
    number: "02",
    title: "AUTOMATION",
    description:
      "Browser automation, APIs, data movement, orchestration, and repeatable processes that remove unnecessary manual work.",
  },
  {
    number: "03",
    title: "SOFTWARE",
    description:
      "Web applications, interfaces, integrations, internal tools, and dependable software built around the actual problem.",
  },
  {
    number: "04",
    title: "EXPERIMENTAL",
    description:
      "Unusual interfaces, spatial web experiences, visual systems, and technical experiments where the medium is part of the solution.",
  },
];

const ROUTES = {
  "/": {
    title: "Antarctic Labs — Digital Systems & AI",
    description: SITE.description,
  },

  "/project-01": {
    title: "AI Operations System — Antarctic Labs",
    description: PROJECTS[0].description,
  },

  "/project-02": {
    title: "Digital Territory — Antarctic Labs",
    description: PROJECTS[1].description,
  },

  "/about": {
    title: "About — Antarctic Labs",
    description:
      "Antarctic Labs is an independent digital studio building AI systems, automation, software, and experimental web experiences.",
  },
};

function normalizePath(pathname) {
  if (!pathname) {
    return "/";
  }

  const clean = pathname
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");

  return clean || "/";
}

function getRoute() {
  return normalizePath(
    window.location.pathname
  );
}

function navigate(path) {
  const target = normalizePath(path);

  if (getRoute() !== target) {
    window.history.pushState(
      {},
      "",
      target
    );
  }

  window.dispatchEvent(
    new PopStateEvent("popstate")
  );
}

function useRoute() {
  const [route, setRoute] =
    useState(getRoute);

  useEffect(() => {
    const handlePopState = () => {
      setRoute(getRoute());
    };

    window.addEventListener(
      "popstate",
      handlePopState
    );

    return () => {
      window.removeEventListener(
        "popstate",
        handlePopState
      );
    };
  }, []);

  return route;
}

function useDocumentMeta(route) {
  useEffect(() => {
    const meta =
      ROUTES[route] || ROUTES["/"];

    document.title = meta.title;

    const description =
      document.querySelector(
        'meta[name="description"]'
      );

    if (description) {
      description.setAttribute(
        "content",
        meta.description
      );
    }

    const canonical =
      document.querySelector(
        'link[rel="canonical"]'
      );

    if (canonical) {
      canonical.setAttribute(
        "href",
        `https://antarctic-labs.com${
          route === "/" ? "/" : route
        }`
      );
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });

    requestAnimationFrame(() => {
      ScrollTrigger.refresh();
    });
  }, [route]);
}

function usePageMotion(route) {
  useLayoutEffect(() => {
    const context = gsap.context(() => {
      const entranceTargets =
        gsap.utils.toArray(
          "[data-page-enter]"
        );

      gsap.fromTo(
        entranceTargets,
        {
          opacity: 0,
          y: 18,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.85,
          stagger: 0.055,
          ease: "power3.out",
          delay: 0.05,
          clearProps:
            "opacity,transform",
        }
      );

      const revealTargets =
        gsap.utils.toArray(
          "[data-reveal]"
        );

      revealTargets.forEach(
        (element) => {
          gsap.fromTo(
            element,
            {
              opacity: 0,
              y: 28,
            },
            {
              opacity: 1,
              y: 0,
              duration: 0.9,
              ease: "power3.out",
              scrollTrigger: {
                trigger: element,
                start: "top 86%",
                once: true,
              },
            }
          );
        }
      );

      const parallaxTargets =
        gsap.utils.toArray(
          "[data-parallax]"
        );

      parallaxTargets.forEach(
        (element) => {
          const amount =
            Number(
              element.dataset.parallax
            ) || 20;

          gsap.to(element, {
            y: amount,
            ease: "none",
            scrollTrigger: {
              trigger: element,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          });
        }
      );
    });

    return () => {
      context.revert();
    };
  }, [route]);
}

/* ============================================================
   HEADER
   ============================================================ */

function Brand({ onNavigate }) {
  return (
    <button
      className="brand"
      type="button"
      onClick={() => onNavigate("/")}
      aria-label="Antarctic Labs home"
    >
      <span className="brand-mark">
        AL
      </span>

      <span className="brand-name">
        ANTARCTIC LABS
      </span>
    </button>
  );
}

function MenuTrigger({
  open,
  onClick,
}) {
  return (
    <button
      className={`menu-trigger ${
        open ? "is-open" : ""
      }`}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls="site-menu"
      aria-label={
        open
          ? "Close navigation"
          : "Open navigation"
      }
    >
      <span className="menu-trigger-lines">
        <span />
        <span />
      </span>
    </button>
  );
}

function Header({
  menuOpen,
  onMenu,
  onNavigate,
}) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Brand
          onNavigate={onNavigate}
        />

        <div className="header-right">
          <div className="header-meta">
            <span className="header-meta-item">
              <span className="header-meta-dot" />

              <span>
                AVAILABLE FOR SELECT BUILDS
              </span>
            </span>

            <span className="header-meta-item">
              {SITE.location}
            </span>
          </div>

          <MenuTrigger
            open={menuOpen}
            onClick={onMenu}
          />
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   MENU
   ============================================================ */

function Menu({
  open,
  onClose,
  onNavigate,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown =
      (event) => {
        if (event.key === "Escape") {
          onClose();
        }
      };

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [open, onClose]);

  useLayoutEffect(() => {
    const element =
      menuRef.current;

    if (!element) {
      return undefined;
    }

    const links =
      element.querySelectorAll(
        ".menu-link"
      );

    const context =
      gsap.context(() => {
        if (open) {
          gsap.set(element, {
            autoAlpha: 1,
          });

          gsap.fromTo(
            links,
            {
              opacity: 0,
              y: 18,
            },
            {
              opacity: 1,
              y: 0,
              duration: 0.55,
              stagger: 0.055,
              delay: 0.06,
              ease: "power3.out",
            }
          );
        } else {
          gsap.to(element, {
            autoAlpha: 0,
            duration: 0.25,
            ease: "power2.in",
          });
        }
      }, element);

    return () => {
      context.revert();
    };
  }, [open]);

  const handleNavigate =
    (path) => {
      onClose();
      onNavigate(path);
    };

  return (
    <aside
      ref={menuRef}
      id="site-menu"
      className="site-menu"
      aria-hidden={!open}
    >
      <div className="menu-inner">
        <div className="menu-top">
          <span className="menu-index">
            NAVIGATION
          </span>

          <span className="menu-status">
            {SITE.version}
          </span>
        </div>

        <nav
          className="menu-nav"
          aria-label="Primary navigation"
        >
          <button
            className="menu-link"
            type="button"
            onClick={() =>
              handleNavigate("/")
            }
            tabIndex={open ? 0 : -1}
          >
            <span className="menu-link-index">
              00
            </span>

            <span className="menu-link-text">
              HOME
            </span>
          </button>

          <button
            className="menu-link"
            type="button"
            onClick={() =>
              handleNavigate(
                "/project-01"
              )
            }
            tabIndex={open ? 0 : -1}
          >
            <span className="menu-link-index">
              01
            </span>

            <span className="menu-link-text">
              AI OPERATIONS
            </span>
          </button>

          <button
            className="menu-link"
            type="button"
            onClick={() =>
              handleNavigate(
                "/project-02"
              )
            }
            tabIndex={open ? 0 : -1}
          >
            <span className="menu-link-index">
              02
            </span>

            <span className="menu-link-text">
              DIGITAL TERRITORY
            </span>
          </button>

          <button
            className="menu-link"
            type="button"
            onClick={() =>
              handleNavigate(
                "/about"
              )
            }
            tabIndex={open ? 0 : -1}
          >
            <span className="menu-link-index">
              03
            </span>

            <span className="menu-link-text">
              ABOUT
            </span>
          </button>
        </nav>

        <div className="menu-bottom">
          <div className="menu-contact">
            <span className="menu-contact-label">
              CONTACT
            </span>

            <a
              href={`mailto:${SITE.email}`}
              className="menu-contact-link"
            >
              {SITE.email}
            </a>
          </div>

          <span className="menu-footer">
            {SITE.location}
            <br />
            {SITE.version}
          </span>
        </div>
      </div>
    </aside>
  );
}

/* ============================================================
   SHARED
   ============================================================ */

function SectionKicker({
  number,
  children,
}) {
  return (
    <p className="section-kicker">
      <span>{number}</span>
      <span>{children}</span>
    </p>
  );
}

/* ============================================================
   HOME — HERO
   ============================================================ */

function Hero() {
  return (
    <section
      className="hero"
      data-page-enter
    >
      <div className="hero-inner">
        <div className="hero-copy">
          <p className="eyebrow hero-kicker">
            {SITE.version}
          </p>

          <h1 className="hero-title">
            <span className="hero-title-line">
              BUILD THE
            </span>

            <span className="hero-title-line hero-title-accent">
              SYSTEM.
            </span>
          </h1>

          <p className="hero-description">
            {SITE.description}
          </p>
        </div>

        <div
          className="hero-side"
          data-reveal
        >
          <div className="hero-side-grid">
            <div className="hero-side-item">
              <div className="hero-side-label">
                TERRAIN
              </div>

              <div className="hero-side-value">
                AI / AUTOMATION /
                SOFTWARE
              </div>
            </div>

            <div className="hero-side-item">
              <div className="hero-side-label">
                MODE
              </div>

              <div className="hero-side-value">
                SYSTEMS /
                EXPERIENCES
              </div>
            </div>

            <div className="hero-side-item">
              <div className="hero-side-label">
                STATUS
              </div>

              <div className="hero-side-value">
                SELECT BUILDS
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="hero-scroll">
        <span className="hero-scroll-line" />
        <span>DESCEND</span>
      </div>
    </section>
  );
}

/* ============================================================
   HOME — MANIFESTO
   ============================================================ */

function Manifesto() {
  return (
    <section className="manifesto">
      <div
        className="manifesto-inner"
        data-reveal
      >
        <p className="eyebrow manifesto-label">
          FIELD NOTE / 001
        </p>

        <h2 className="manifesto-title">
          <span>
            USEFUL MACHINES
          </span>

          <span className="soft">
            FOR UNKNOWN
          </span>

          <span>
            TERRITORY.
          </span>
        </h2>

        <p className="manifesto-copy">
          The interesting problems are rarely
          clean. They arrive as fragments,
          constraints, manual work, unclear
          requirements, and systems that were
          never designed to work together.
          Antarctic Labs turns that terrain
          into something operational.
        </p>
      </div>
    </section>
  );
}

/* ============================================================
   HOME — SYSTEMS
   ============================================================ */

function SystemsSection() {
  return (
    <section className="systems-section">
      <div className="systems-header">
        <SectionKicker number="01">
          SYSTEMS
        </SectionKicker>

        <h2
          className="systems-title"
          data-reveal
        >
          Four ways into difficult problems.
        </h2>
      </div>

      <div className="systems-grid">
        {CAPABILITIES.map(
          (capability) => (
            <article
              className="system-card"
              key={capability.number}
              data-reveal
            >
              <div className="system-number">
                {capability.number}
              </div>

              <h3 className="system-name">
                {capability.title}
              </h3>

              <p className="system-description">
                {capability.description}
              </p>

              <div className="system-footer">
                ANTARCTIC LABS / SYSTEM
              </div>
            </article>
          )
        )}
      </div>
    </section>
  );
}

/* ============================================================
   HOME — FEATURED EXPEDITION
   ============================================================ */

function ExpeditionCard({
  project,
  onNavigate,
}) {
  return (
    <div className="expedition-feature">
      <article
        className="expedition-feature-card"
        data-reveal
      >
        <div className="expedition-feature-top">
          <span className="expedition-feature-code">
            EXPEDITION / {project.number}
          </span>

          <span className="expedition-feature-status">
            {project.type}
          </span>
        </div>

        <h2 className="expedition-feature-title">
          <span>
            {project.title
              .split(" ")
              .slice(0, 2)
              .join(" ")}
          </span>

          <span>
            {project.title
              .split(" ")
              .slice(2)
              .join(" ")}
          </span>
        </h2>

        <div className="expedition-feature-bottom">
          <p className="expedition-feature-copy">
            {project.description}
          </p>

          <button
            className="expedition-feature-link"
            type="button"
            onClick={() =>
              onNavigate(
                `/${project.slug}`
              )
            }
          >
            Enter expedition
            <span>→</span>
          </button>
        </div>
      </article>
    </div>
  );
}

/* ============================================================
   HOME — EXPEDITIONS
   ============================================================ */

function Expeditions({
  onNavigate,
}) {
  return (
    <section className="expeditions">
      <div className="expeditions-header">
        <div>
          <SectionKicker number="02">
            EXPEDITIONS
          </SectionKicker>

          <h2 className="expeditions-title">
            Work built for the terrain.
          </h2>
        </div>

        <p className="expeditions-meta">
          SELECTED SYSTEMS
          <br />
          FIELD RECORD / 2026
        </p>
      </div>

      <div className="expedition-list">
        {PROJECTS.map(
          (project) => (
            <article
              className="expedition-card"
              key={project.slug}
              data-reveal
            >
              <div className="expedition-index">
                {project.number}
              </div>

              <div className="expedition-main">
                <div className="expedition-category">
                  {project.category}
                </div>

                <h3 className="expedition-name">
                  {project.title}
                </h3>

                <p className="expedition-description">
                  {project.description}
                </p>
              </div>

              <div className="expedition-side">
                <span className="expedition-year">
                  {project.year}
                </span>

                <button
                  className="expedition-arrow"
                  type="button"
                  onClick={() =>
                    onNavigate(
                      `/${project.slug}`
                    )
                  }
                >
                  View
                  <span className="expedition-arrow-symbol">
                    →
                  </span>
                </button>
              </div>
            </article>
          )
        )}
      </div>
    </section>
  );
}

/* ============================================================
   HOME — STATEMENT
   ============================================================ */

function Statement() {
  return (
    <section className="statement">
      <div
        className="statement-inner"
        data-reveal
      >
        <p className="eyebrow">
          FIELD NOTE / 002
        </p>

        <h2 className="statement-title">
          <span>
            LESS NOISE.
          </span>

          <span className="muted">
            MORE SIGNAL.
          </span>

          <span>
            BETTER SYSTEMS.
          </span>
        </h2>

        <p className="statement-copy">
          Technology is useful when it
          changes what can actually be done.
          Everything else is decoration.
        </p>
      </div>
    </section>
  );
}

/* ============================================================
   HOME — CONTACT
   ============================================================ */

function Contact() {
  return (
    <section className="contact">
      <div className="contact-inner">
        <div
          className="contact-grid"
          data-reveal
        >
          <div>
            <SectionKicker number="03">
              HORIZON
            </SectionKicker>

            <h2 className="contact-title">
              Have a difficult problem?
            </h2>

            <p className="contact-description">
              Bring the problem, the constraint,
              or the unfinished idea. The first
              step is understanding the terrain.
            </p>

            <a
              className="contact-link"
              href={`mailto:${SITE.email}`}
            >
              Start a conversation
              <span>→</span>
            </a>
          </div>

          <div className="contact-details">
            <div className="contact-detail">
              <div className="contact-detail-label">
                EMAIL
              </div>

              <div className="contact-detail-value">
                {SITE.email}
              </div>
            </div>

            <div className="contact-detail">
              <div className="contact-detail-label">
                LOCATION
              </div>

              <div className="contact-detail-value">
                {SITE.location}
              </div>
            </div>

            <div className="contact-detail">
              <div className="contact-detail-label">
                AVAILABILITY
              </div>

              <div className="contact-detail-value">
                {SITE.availability}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   FOOTER
   ============================================================ */

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-left">
        <span>
          © {new Date().getFullYear()}{" "}
          {SITE.brand}
        </span>

        <span className="footer-dot" />

        <span>
          {SITE.version}
        </span>
      </div>

      <div className="footer-right">
        <span>
          AI / AUTOMATION / SOFTWARE
        </span>

        <span>
          {SITE.location}
        </span>
      </div>
    </footer>
  );
}

/* ============================================================
   HOME PAGE
   ============================================================ */

function HomePage({
  onNavigate,
}) {
  return (
    <main className="page">
      <Hero />

      <Manifesto />

      <SystemsSection />

      <ExpeditionCard
        project={PROJECTS[0]}
        onNavigate={onNavigate}
      />

      <Expeditions
        onNavigate={onNavigate}
      />

      <Statement />

      <Contact />

      <Footer />
    </main>
  );
}

/* ============================================================
   PROJECT PAGE
   ============================================================ */

function ProjectHero({
  project,
}) {
  return (
    <section className="project-hero">
      <div className="project-hero-inner">
        <div className="project-hero-top">
          <span className="project-hero-index">
            EXPEDITION / {project.number}
          </span>

          <span className="project-hero-year">
            {project.year} /{" "}
            {project.type}
          </span>
        </div>

        <h1
          className="project-hero-title"
          data-page-enter
        >
          {project.title}
        </h1>

        <p
          className="project-hero-description"
          data-reveal
        >
          {project.description}
        </p>
      </div>
    </section>
  );
}

function ProjectFieldBlock({
  label,
  title,
  copy,
}) {
  return (
    <section
      className="project-field"
      data-reveal
    >
      <div className="project-field-inner">
        <div className="project-field-grid">
          <div className="project-field-label">
            {label}
          </div>

          <div>
            <h2 className="project-field-title">
              {title}
            </h2>

            <p className="project-field-copy">
              {copy}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProjectPage({
  project,
}) {
  return (
    <main className="project-page">
      <ProjectHero
        project={project}
      />

      <ProjectFieldBlock
        label="01 / BRIEF"
        title="The problem."
        copy={project.brief}
      />

      <ProjectFieldBlock
        label="02 / TERRAIN"
        title="The environment."
        copy={project.terrain}
      />

      <ProjectFieldBlock
        label="03 / SYSTEM"
        title="The architecture."
        copy={project.system}
      />

      <ProjectFieldBlock
        label="04 / BUILD"
        title="The construction."
        copy={project.build}
      />

      <ProjectFieldBlock
        label="05 / RESULT"
        title="The outcome."
        copy={project.result}
      />

      <section className="project-field">
        <div className="project-field-inner">
          <div className="project-field-grid">
            <div className="project-field-label">
              STACK
            </div>

            <div>
              <h2 className="project-field-title">
                Tools selected for the terrain.
              </h2>

              <div className="project-field-list">
                {project.stack
                  .split(" / ")
                  .map(
                    (item, index) => (
                      <div
                        className="project-field-list-item"
                        key={item}
                      >
                        <div className="project-field-list-label">
                          {String(
                            index + 1
                          ).padStart(
                            2,
                            "0"
                          )}
                        </div>

                        <div className="project-field-list-value">
                          {item}
                        </div>
                      </div>
                    )
                  )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

/* ============================================================
   ABOUT
   ============================================================ */

function AboutPage() {
  return (
    <main className="about-page">
      <section className="about-hero">
        <div className="about-inner">
          <p className="eyebrow">
            ANTARCTIC LABS / ABOUT
          </p>

          <h1
            className="about-title"
            data-page-enter
          >
            <span>
              BUILDING
            </span>

            <span className="muted">
              USEFUL
            </span>

            <span>
              MACHINES.
            </span>
          </h1>
        </div>
      </section>

      <section className="about-inner">
        <div
          className="about-grid"
          data-reveal
        >
          <div className="about-copy">
            <p>
              Antarctic Labs is an
              independent digital studio
              focused on difficult technical
              problems.
            </p>

            <p>
              The work sits at the intersection
              of AI, automation, software,
              interfaces, and experimental
              digital environments.
            </p>

            <p>
              The goal is not to add technology
              for its own sake. It is to build
              systems that make something
              meaningfully easier, faster,
              clearer, or possible.
            </p>
          </div>

          <div className="about-details">
            <div className="about-detail">
              <div className="about-detail-label">
                FOCUS
              </div>

              <div className="about-detail-value">
                AI / AUTOMATION /
                SOFTWARE /
                EXPERIENCES
              </div>
            </div>

            <div className="about-detail">
              <div className="about-detail-label">
                APPROACH
              </div>

              <div className="about-detail-value">
                UNDERSTAND →
                ARCHITECT →
                BUILD →
                VERIFY
              </div>
            </div>

            <div className="about-detail">
              <div className="about-detail-label">
                OPERATING MODEL
              </div>

              <div className="about-detail-value">
                INDEPENDENT /
                REMOTE /
                SELECT BUILDS
              </div>
            </div>

            <div className="about-detail">
              <div className="about-detail-label">
                SIGNAL
              </div>

              <div className="about-detail-value">
                LESS NOISE.
                MORE SIGNAL.
              </div>
            </div>
          </div>
        </div>
      </section>

      <Contact />

      <Footer />
    </main>
  );
}

/* ============================================================
   NOT FOUND
   ============================================================ */

function NotFound({
  onNavigate,
}) {
  return (
    <main className="not-found">
      <div className="not-found-inner">
        <div className="not-found-code">
          FIELD ERROR / 404
        </div>

        <h1 className="not-found-title">
          TERRITORY UNKNOWN.
        </h1>

        <p className="not-found-copy">
          The requested route does not exist.
          Return to the known field.
        </p>

        <button
          className="not-found-link"
          type="button"
          onClick={() =>
            onNavigate("/")
          }
        >
          Return to base
        </button>
      </div>
    </main>
  );
}

/* ============================================================
   APP
   ============================================================ */

function App() {
  const route = useRoute();

  const [
    menuOpen,
    setMenuOpen,
  ] = useState(false);

  useDocumentMeta(route);

  usePageMotion(route);

  useEffect(() => {
    document.body.style.overflow =
      menuOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow =
        "";
    };
  }, [menuOpen]);

  useEffect(() => {
    const handleKeyDown =
      (event) => {
        if (
          event.key === "Escape"
        ) {
          setMenuOpen(false);
        }
      };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, []);

  const handleNavigate =
    (path) => {
      setMenuOpen(false);
      navigate(path);
    };

  let content;

  if (route === "/") {
    content = (
      <HomePage
        onNavigate={
          handleNavigate
        }
      />
    );
  } else if (
    route === "/project-01"
  ) {
    content = (
      <ProjectPage
        project={PROJECTS[0]}
      />
    );
  } else if (
    route === "/project-02"
  ) {
    content = (
      <ProjectPage
        project={PROJECTS[1]}
      />
    );
  } else if (route === "/about") {
    content = <AboutPage />;
  } else {
    content = (
      <NotFound
        onNavigate={
          handleNavigate
        }
      />
    );
  }

  return (
    <div className="app">
      <PolarScene />

      <Header
        menuOpen={menuOpen}
        onMenu={() =>
          setMenuOpen(
            (current) => !current
          )
        }
        onNavigate={
          handleNavigate
        }
      />

      <Menu
        open={menuOpen}
        onClose={() =>
          setMenuOpen(false)
        }
        onNavigate={
          handleNavigate
        }
      />

      {content}
    </div>
  );
}

createRoot(
  document.getElementById("root")
).render(
  <App />
);