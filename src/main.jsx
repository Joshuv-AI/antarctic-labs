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
    shortTitle: "OPERATIONS",
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
    shortTitle: "TERRITORY",
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

const ROUTE_META = {
  "/": {
    title:
      "Antarctic Labs — Digital Systems & AI",
    description:
      SITE.description,
  },

  "/project-01": {
    title:
      "AI Operations System — Antarctic Labs",
    description:
      PROJECTS[0].description,
  },

  "/project-02": {
    title:
      "Digital Territory — Antarctic Labs",
    description:
      PROJECTS[1].description,
  },

  "/about": {
    title:
      "About — Antarctic Labs",
    description:
      "Antarctic Labs is an independent digital studio building AI systems, automation, software, and experimental web experiences.",
  },
};

function normalizePath(pathname) {
  if (!pathname) {
    return "/";
  }

  const clean =
    pathname
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
  const target =
    normalizePath(path);

  if (
    normalizePath(
      window.location.pathname
    ) !== target
  ) {
    window.history.pushState(
      {},
      "",
      target
    );
  }

  window.dispatchEvent(
    new PopStateEvent(
      "popstate"
    )
  );
}

function useRoute() {
  const [route, setRoute] =
    useState(getRoute);

  useEffect(() => {
    const handlePopState =
      () => setRoute(getRoute());

    window.addEventListener(
      "popstate",
      handlePopState
    );

    return () =>
      window.removeEventListener(
        "popstate",
        handlePopState
      );
  }, []);

  return route;
}

function useDocumentMeta(route) {
  useEffect(() => {
    const meta =
      ROUTE_META[route] ||
      ROUTE_META["/"];

    document.title =
      meta.title;

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
          route === "/"
            ? "/"
            : route
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

function usePageEntrance(route) {
  const previousRoute =
    useRef(route);

  useLayoutEffect(() => {
    const changed =
      previousRoute.current !==
      route;

    previousRoute.current =
      route;

    const ctx =
      gsap.context(() => {
        const targets =
          gsap.utils.toArray(
            "[data-page-enter]"
          );

        gsap.set(
          targets,
          {
            opacity: 0,
            y: changed ? 18 : 0,
          }
        );

        gsap.to(
          targets,
          {
            opacity: 1,
            y: 0,
            duration: 0.85,
            stagger: 0.055,
            ease: "power3.out",
            delay: 0.06,
            clearProps:
              "transform,opacity",
          }
        );
      });

    return () =>
      ctx.revert();
  }, [route]);
}

function useScrollAtmosphere() {
  useLayoutEffect(() => {
    const ctx =
      gsap.context(() => {
        gsap.utils
          .toArray(
            "[data-reveal]"
          )
          .forEach((element) => {
            gsap.fromTo(
              element,
              {
                opacity: 0,
                y: 26,
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
          });

        gsap.utils
          .toArray(
            "[data-parallax]"
          )
          .forEach((element) => {
            const amount =
              Number(
                element.dataset.parallax
              ) || 20;

            gsap.to(
              element,
              {
                y: amount,
                ease: "none",
                scrollTrigger: {
                  trigger: element,
                  start: "top bottom",
                  end: "bottom top",
                  scrub: true,
                },
              }
            );
          });
      });

    return () =>
      ctx.revert();
  }, []);
}

function Brand({
  onNavigate,
}) {
  return (
    <button
      className="brand"
      type="button"
      onClick={() =>
        onNavigate("/")
      }
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
      <span />
      <span />
      <span />
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
      <Brand
        onNavigate={onNavigate}
      />

      <div className="header-right">
        <span className="header-status">
          <span className="status-dot" />
          <span>
            ONLINE / SELECT BUILDS
          </span>
        </span>

        <MenuTrigger
          open={menuOpen}
          onClick={onMenu}
        />
      </div>
    </header>
  );
}

function Menu({
  open,
  onClose,
  onNavigate,
}) {
  const menuRef =
    useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown =
      (event) => {
        if (
          event.key === "Escape"
        ) {
          onClose();
        }
      };

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () =>
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
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

    const ctx =
      gsap.context(() => {
        if (open) {
          gsap.to(
            element,
            {
              autoAlpha: 1,
              duration: 0.35,
              ease: "power2.out",
              pointerEvents:
                "auto",
            }
          );

          gsap.fromTo(
            links,
            {
              opacity: 0,
              y: 16,
            },
            {
              opacity: 1,
              y: 0,
              duration: 0.55,
              stagger: 0.055,
              delay: 0.08,
              ease: "power3.out",
            }
          );
        } else {
          gsap.to(
            element,
            {
              autoAlpha: 0,
              duration: 0.25,
              ease: "power2.in",
              pointerEvents:
                "none",
            }
          );
        }
      }, element);

    return () =>
      ctx.revert();
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
          <span className="micro-label">
            NAVIGATION
          </span>

          <span className="micro-label">
            FIELD SYSTEM / 01
          </span>
        </div>

        <nav
          className="menu-nav"
          aria-label="Primary"
        >
          <button
            className="menu-link"
            type="button"
            onClick={() =>
              handleNavigate("/")
            }
            tabIndex={
              open ? 0 : -1
            }
          >
            <span className="menu-index">
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
            tabIndex={
              open ? 0 : -1
            }
          >
            <span className="menu-index">
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
            tabIndex={
              open ? 0 : -1
            }
          >
            <span className="menu-index">
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
            tabIndex={
              open ? 0 : -1
            }
          >
            <span className="menu-index">
              03
            </span>

            <span className="menu-link-text">
              ABOUT
            </span>
          </button>
        </nav>

        <div className="menu-bottom">
          <a
            href={`mailto:${SITE.email}`}
            className="menu-contact"
          >
            {SITE.email}
          </a>

          <span className="micro-label">
            {SITE.location}
          </span>
        </div>
      </div>
    </aside>
  );
}

function SectionKicker({
  number,
  children,
}) {
  return (
    <div className="section-kicker">
      <span className="section-number">
        {number}
      </span>

      <span className="section-kicker-line" />

      <span>
        {children}
      </span>
    </div>
  );
}

function HomeHero({
  onNavigate,
}) {
  return (
    <section
      className="hero"
      data-page-enter
    >
      <div className="hero-grid">
        <div className="hero-left">
          <p className="eyebrow">
            {SITE.version}
          </p>

          <h1 className="hero-title">
            BUILD
            <br />
            THE
            <br />
            <em>SYSTEM.</em>
          </h1>
        </div>

        <div className="hero-right">
          <p className="hero-intro">
            Useful machines for
            difficult territory.
          </p>

          <p className="hero-copy">
            Antarctic Labs designs
            and builds AI systems,
            automation, software,
            and digital experiences
            for problems that do not
            come with clean maps.
          </p>

          <button
            className="text-link"
            type="button"
            onClick={() =>
              onNavigate(
                "/project-01"
              )
            }
          >
            <span>
              ENTER THE FIELD
            </span>

            <span className="link-arrow">
              ↗
            </span>
          </button>
        </div>
      </div>

      <div className="hero-footer">
        <span>
          89° S / DIGITAL TERRITORY
        </span>

        <span className="scroll-cue">
          SCROLL TO DESCEND
          <span className="scroll-line" />
        </span>

        <span>
          {SITE.location}
        </span>
      </div>
    </section>
  );
}

function Manifesto() {
  return (
    <section
      className="manifesto section"
      data-reveal
    >
      <SectionKicker number="01">
        THE FIELD
      </SectionKicker>

      <div className="manifesto-layout">
        <h2 className="display-heading">
          THE TERRAIN
          <br />
          <span>CHANGES.</span>
        </h2>

        <div className="manifesto-copy">
          <p className="lead">
            The useful work happens
            where the map stops being
            obvious.
          </p>

          <p>
            Antarctic Labs is an
            independent digital studio
            focused on building the
            systems behind the result:
            the intelligence, the
            automation, the software,
            and the interface that makes
            the whole thing work.
          </p>

          <p>
            No unnecessary layers.
            No technology for its own
            sake. Start with the
            problem, understand the
            terrain, then build the
            machine.
          </p>
        </div>
      </div>
    </section>
  );
}

function SystemsSection() {
  return (
    <section
      className="systems section"
      data-reveal
    >
      <SectionKicker number="02">
        CAPABILITIES
      </SectionKicker>

      <div className="systems-header">
        <h2 className="display-heading">
          USEFUL
          <br />
          <span>MACHINES.</span>
        </h2>

        <p className="systems-intro">
          Four territories. One
          operating principle:
          make difficult work
          easier to execute.
        </p>
      </div>

      <div className="capability-grid">
        {CAPABILITIES.map(
          (capability) => (
            <article
              className="capability"
              key={capability.number}
            >
              <div className="capability-top">
                <span>
                  {capability.number}
                </span>

                <span>
                  FIELD
                </span>
              </div>

              <h3>
                {capability.title}
              </h3>

              <p>
                {capability.description}
              </p>

              <div className="capability-line" />
            </article>
          )
        )}
      </div>
    </section>
  );
}

function ExpeditionCard({
  project,
  onNavigate,
}) {
  return (
    <article
      className="expedition-card"
      data-reveal
    >
      <div className="expedition-visual">
        <span className="expedition-number">
          {project.number}
        </span>

        <div
          className="expedition-mark"
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
        </div>

        <span className="expedition-type">
          {project.type}
        </span>
      </div>

      <div className="expedition-content">
        <div className="expedition-meta">
          <span>
            {project.category}
          </span>

          <span>
            {project.year}
          </span>
        </div>

        <h3>
          {project.title}
        </h3>

        <p className="expedition-signal">
          {project.signal}
        </p>

        <p>
          {project.description}
        </p>

        <button
          className="text-link"
          type="button"
          onClick={() =>
            onNavigate(
              `/${project.slug}`
            )
          }
        >
          <span>
            OPEN EXPEDITION
          </span>

          <span className="link-arrow">
            ↗
          </span>
        </button>
      </div>
    </article>
  );
}

function Expeditions({
  onNavigate,
}) {
  return (
    <section
      className="expeditions section"
      data-reveal
    >
      <SectionKicker number="03">
        EXPEDITIONS
      </SectionKicker>

      <div className="expeditions-heading">
        <h2 className="display-heading">
          WORK
          <br />
          <span>IN THE FIELD.</span>
        </h2>

        <p>
          A small selection of
          systems and experiments.
          Each begins with a problem
          and ends with something
          usable.
        </p>
      </div>

      <div className="expedition-list">
        {PROJECTS.map(
          (project) => (
            <ExpeditionCard
              key={project.slug}
              project={project}
              onNavigate={onNavigate}
            />
          )
        )}
      </div>
    </section>
  );
}

function Statement() {
  return (
    <section
      className="statement section"
      data-reveal
    >
      <div className="statement-line" />

      <p className="statement-small">
        THE OBJECTIVE
      </p>

      <h2>
        TURN SIGNAL
        <br />
        <span>INTO ACTION.</span>
      </h2>

      <p className="statement-copy">
        Build the intelligence.
        Connect the systems.
        Remove the friction.
        Leave something better
        behind.
      </p>
    </section>
  );
}

function Contact({
  onNavigate,
}) {
  return (
    <section
      className="contact section"
      data-reveal
    >
      <SectionKicker number="04">
        CONTACT
      </SectionKicker>

      <div className="contact-layout">
        <div>
          <p className="contact-label">
            HAVE A PROBLEM WORTH
            BUILDING AROUND?
          </p>

          <h2 className="contact-heading">
            LET'S
            <br />
            <span>BUILD.</span>
          </h2>
        </div>

        <div className="contact-side">
          <p>
            Bring the objective,
            the constraint, or the
            strange idea. We can
            figure out the terrain
            from there.
          </p>

          <a
            className="contact-email"
            href={`mailto:${SITE.email}`}
          >
            {SITE.email}
            <span>↗</span>
          </a>

          <button
            className="text-link"
            type="button"
            onClick={() =>
              onNavigate("/about")
            }
          >
            <span>
              ABOUT THE LAB
            </span>

            <span className="link-arrow">
              ↗
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

function Footer({
  onNavigate,
}) {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <Brand
          onNavigate={onNavigate}
        />

        <span className="footer-tagline">
          USEFUL MACHINES FOR
          UNKNOWN TERRITORY.
        </span>
      </div>

      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()}{" "}
          ANTARCTIC LABS
        </span>

        <span>
          {SITE.location}
        </span>

        <a
          href={`mailto:${SITE.email}`}
        >
          {SITE.email}
        </a>
      </div>
    </footer>
  );
}

function Home({
  onNavigate,
}) {
  useScrollAtmosphere();

  return (
    <>
      <HomeHero
        onNavigate={onNavigate}
      />

      <main>
        <Manifesto />

        <SystemsSection />

        <Expeditions
          onNavigate={onNavigate}
        />

        <Statement />

        <Contact
          onNavigate={onNavigate}
        />
      </main>

      <Footer
        onNavigate={onNavigate}
      />
    </>
  );
}

function ProjectHero({
  project,
}) {
  return (
    <section
      className="project-hero section"
      data-page-enter
    >
      <div className="project-hero-meta">
        <span>
          EXPEDITION /{" "}
          {project.number}
        </span>

        <span>
          {project.category}
        </span>

        <span>
          {project.year}
        </span>
      </div>

      <h1 className="project-title">
        {project.title}
      </h1>

      <div className="project-hero-bottom">
        <span>
          {project.signal}
        </span>

        <p>
          {project.description}
        </p>
      </div>
    </section>
  );
}

function ProjectFieldBlock({
  label,
  children,
}) {
  return (
    <article
      className="project-field-block"
      data-reveal
    >
      <div className="project-field-label">
        {label}
      </div>

      <div className="project-field-copy">
        {children}
      </div>
    </article>
  );
}

function ProjectPage({
  project,
  onNavigate,
}) {
  useScrollAtmosphere();

  return (
    <>
      <main className="project-page">
        <ProjectHero
          project={project}
        />

        <section className="project-intro section">
          <SectionKicker number="01">
            FIELD NOTE
          </SectionKicker>

          <div className="project-intro-grid">
            <h2 className="display-heading">
              THE
              <br />
              <span>BRIEF.</span>
            </h2>

            <p className="project-large-copy">
              {project.brief}
            </p>
          </div>
        </section>

        <section className="project-fields section">
          <ProjectFieldBlock label="02 / TERRAIN">
            <p>
              {project.terrain}
            </p>
          </ProjectFieldBlock>

          <ProjectFieldBlock label="03 / SYSTEM">
            <p>
              {project.system}
            </p>
          </ProjectFieldBlock>

          <ProjectFieldBlock label="04 / BUILD">
            <p>
              {project.build}
            </p>
          </ProjectFieldBlock>

          <ProjectFieldBlock label="05 / RESULT">
            <p>
              {project.result}
            </p>
          </ProjectFieldBlock>
        </section>

        <section className="project-stack section">
          <SectionKicker number="06">
            SYSTEM PROFILE
          </SectionKicker>

          <div className="project-stack-layout">
            <h2 className="display-heading">
              THE
              <br />
              <span>STACK.</span>
            </h2>

            <p>
              {project.stack}
            </p>
          </div>
        </section>

        <section className="project-close section">
          <div className="project-close-line" />

          <p>
            NEXT EXPEDITION
          </p>

          <button
            className="project-next"
            type="button"
            onClick={() =>
              onNavigate(
                project.slug ===
                  "project-01"
                  ? "/project-02"
                  : "/project-01"
              )
            }
          >
            <span>
              {project.slug ===
              "project-01"
                ? PROJECTS[1].title
                : PROJECTS[0].title}
            </span>

            <span>↗</span>
          </button>
        </section>
      </main>

      <Footer
        onNavigate={onNavigate}
      />
    </>
  );
}

function About({
  onNavigate,
}) {
  useScrollAtmosphere();

  return (
    <>
      <main className="about-page">
        <section
          className="about-hero section"
          data-page-enter
        >
          <SectionKicker number="01">
            ABOUT
          </SectionKicker>

          <h1 className="about-title">
            BUILDING
            <br />
            <span>FROM THE</span>
            <br />
            TERRAIN.
          </h1>

          <p className="about-lead">
            Antarctic Labs is an
            independent digital studio
            focused on useful systems:
            AI, automation, software,
            and experimental interfaces.
          </p>
        </section>

        <section
          className="about-body section"
          data-reveal
        >
          <div className="about-column">
            <span className="micro-label">
              THE APPROACH
            </span>

            <p>
              Start with the objective.
              Understand the constraints.
              Find the shortest reliable
              path from problem to useful
              output.
            </p>
          </div>

          <div className="about-column">
            <span className="micro-label">
              THE PRINCIPLE
            </span>

            <p>
              Technology is not the
              destination. The system is
              successful when the work
              becomes easier, faster,
              clearer, or possible in the
              first place.
            </p>
          </div>
        </section>

        <section
          className="about-manifesto section"
          data-reveal
        >
          <p className="about-manifesto-label">
            FIELD PRINCIPLE / 01
          </p>

          <h2>
            MAKE THE
            <br />
            <span>COMPLEX USEFUL.</span>
          </h2>
        </section>

        <section
          className="about-contact section"
          data-reveal
        >
          <SectionKicker number="02">
            OPEN CHANNEL
          </SectionKicker>

          <a
            className="about-email"
            href={`mailto:${SITE.email}`}
          >
            {SITE.email}
            <span>↗</span>
          </a>

          <button
            className="text-link"
            type="button"
            onClick={() =>
              onNavigate("/")
            }
          >
            <span>
              RETURN TO BASE
            </span>

            <span className="link-arrow">
              ↗
            </span>
          </button>
        </section>
      </main>

      <Footer
        onNavigate={onNavigate}
      />
    </>
  );
}

function NotFound({
  onNavigate,
}) {
  return (
    <>
      <main className="not-found section">
        <SectionKicker number="404">
          UNCHARTED TERRITORY
        </SectionKicker>

        <h1 className="display-heading">
          SIGNAL
          <br />
          <span>LOST.</span>
        </h1>

        <p>
          This route does not exist.
          The terrain ahead is
          unmapped.
        </p>

        <button
          className="text-link"
          type="button"
          onClick={() =>
            onNavigate("/")
          }
        >
          <span>
            RETURN TO BASE
          </span>

          <span className="link-arrow">
            ↗
          </span>
        </button>
      </main>

      <Footer
        onNavigate={onNavigate}
      />
    </>
  );
}

function App() {
  const route =
    useRoute();

  const [menuOpen, setMenuOpen] =
    useState(false);

  useDocumentMeta(route);

  usePageEntrance(route);

  useEffect(() => {
    setMenuOpen(false);

    requestAnimationFrame(() => {
      ScrollTrigger.refresh();
    });
  }, [route]);

  const handleNavigate =
    (path) => {
      setMenuOpen(false);
      navigate(path);
    };

  const handleMenu =
    () => {
      setMenuOpen(
        (current) => !current
      );
    };

  let page;

  if (route === "/") {
    page = (
      <Home
        onNavigate={
          handleNavigate
        }
      />
    );
  } else if (
    route === "/project-01"
  ) {
    page = (
      <ProjectPage
        project={PROJECTS[0]}
        onNavigate={
          handleNavigate
        }
      />
    );
  } else if (
    route === "/project-02"
  ) {
    page = (
      <ProjectPage
        project={PROJECTS[1]}
        onNavigate={
          handleNavigate
        }
      />
    );
  } else if (
    route === "/about"
  ) {
    page = (
      <About
        onNavigate={
          handleNavigate
        }
      />
    );
  } else {
    page = (
      <NotFound
        onNavigate={
          handleNavigate
        }
      />
    );
  }

  return (
    <div className="site-shell">
      <PolarScene />

      <Header
        menuOpen={menuOpen}
        onMenu={handleMenu}
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

      <div className="site-content">
        {page}
      </div>
    </div>
  );
}

createRoot(
  document.getElementById("root")
).render(
  <App />
);