import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import PolarScene from "./scenes/PolarScene";
import "./styles.css";

gsap.registerPlugin(ScrollTrigger);

const SITE = {
  brand: "ANTARCTIC LABS",
  email: "hello@antarctic-labs.com",
};

const ROUTES = ["/", "/project-01", "/project-02", "/about"];

const PROJECTS = [
  {
    number: "01",
    title: "Project One",
    type: "AI / AUTOMATION",
    description:
      "A flagship case-study slot for a serious system build. The visual architecture is ready; the real project will replace this content.",
    status: "COMING ONLINE",
  },
  {
    number: "02",
    title: "Project Two",
    type: "SOFTWARE / EXPERIENCE",
    description:
      "A second major project slot reserved for a deeper build, presented as an immersive case study.",
    status: "IN DEVELOPMENT",
  },
];

const CAPABILITIES = [
  [
    "01",
    "AI SYSTEMS",
    "Agents, intelligent workflows, APIs, orchestration.",
  ],
  [
    "02",
    "AUTOMATION",
    "Browser automation, data pipelines, operational systems.",
  ],
  [
    "03",
    "SOFTWARE",
    "Web applications, interfaces, internal tools, integrations.",
  ],
  [
    "04",
    "EXPERIMENTAL",
    "Interactive experiences, creative technology, prototypes.",
  ],
];

function isKnownRoute(path) {
  return ROUTES.includes(path);
}

function normalizePath(pathname) {
  if (!pathname || pathname === "/") {
    return "/";
  }

  const clean = pathname.replace(/\/+$/, "");

  return isKnownRoute(clean) ? clean : "/404";
}

function pathLabel(path) {
  if (path === "/") {
    return SITE.brand;
  }

  if (path === "/404") {
    return "404";
  }

  return path
    .replace(/^\//, "")
    .replaceAll("-", " ")
    .toUpperCase();
}

function useRoute() {
  const [path, setPath] = useState(() =>
    normalizePath(window.location.pathname),
  );

  const navigate = (to) => {
    const next = normalizePath(to);

    if (next === path) {
      return;
    }

    window.history.pushState({}, "", next);
    setPath(next);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  useEffect(() => {
    const handlePopState = () => {
      setPath(normalizePath(window.location.pathname));
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return {
    path,
    navigate,
  };
}

function App() {
  const { path, navigate } = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const previousPath = useRef(path);

  useEffect(() => {
    if (previousPath.current === path) {
      return;
    }

    previousPath.current = path;
  }, [path]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const go = (to) => {
    const next = normalizePath(to);

    if (next === path || transitioning) {
      return;
    }

    setMenuOpen(false);
    setTransitioning(true);

    window.setTimeout(() => {
      navigate(next);

      window.setTimeout(() => {
        setTransitioning(false);
      }, 80);
    }, 520);
  };

  return (
    <>
      <PolarScene />

      <SiteHeader
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen(true)}
        go={go}
      />

      <PageCurtain
        active={transitioning}
        label={pathLabel(path)}
      />

      <main className="page-shell">
        {path === "/" && <Home go={go} />}
        {path === "/project-01" && (
          <ProjectPage index={0} go={go} />
        )}
        {path === "/project-02" && (
          <ProjectPage index={1} go={go} />
        )}
        {path === "/about" && <About go={go} />}
        {path === "/404" && <NotFound go={go} />}
      </main>

      <Menu
        open={menuOpen}
        close={() => setMenuOpen(false)}
        go={go}
      />
    </>
  );
}

function SiteHeader({ onMenu, go }) {
  return (
    <header className="site-header">
      <button
        className="brand"
        type="button"
        onClick={() => go("/")}
        aria-label="Antarctic Labs home"
      >
        <span className="brand-mark" aria-hidden="true">
          +
        </span>
        <span>{SITE.brand}</span>
      </button>

      <div className="header-right">
        <span className="availability">
          <i aria-hidden="true" />
          AVAILABLE FOR SELECT BUILDS
        </span>

        <button
          className="menu-button"
          type="button"
          onClick={onMenu}
          aria-label="Open navigation menu"
          aria-haspopup="dialog"
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
      className={`page-curtain${active ? " is-active" : ""}`}
      aria-hidden="true"
    >
      <div className="curtain-glow" />
      <span>{label}</span>
    </div>
  );
}

function Home({ go }) {
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return undefined;
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion) {
      return undefined;
    }

    const context = gsap.context(() => {
      const heroLines = gsap.utils.toArray(".hero-line");

      gsap.fromTo(
        heroLines,
        {
          yPercent: 115,
          opacity: 0,
        },
        {
          yPercent: 0,
          opacity: 1,
          duration: 1.25,
          stagger: 0.08,
          ease: "power4.out",
          delay: 0.12,
        },
      );

      gsap.fromTo(
        ".hero-kicker, .hero-bottom",
        {
          y: 22,
          opacity: 0,
        },
        {
          y: 0,
          opacity: 1,
          duration: 0.9,
          stagger: 0.08,
          ease: "power3.out",
          delay: 0.55,
        },
      );

      gsap.utils.toArray(".reveal-up").forEach((element) => {
        gsap.fromTo(
          element,
          {
            y: 45,
            opacity: 0,
          },
          {
            y: 0,
            opacity: 1,
            duration: 0.95,
            ease: "power3.out",
            scrollTrigger: {
              trigger: element,
              start: "top 82%",
              once: true,
            },
          },
        );
      });
    }, root);

    return () => {
      context.revert();
    };
  }, []);

  return (
    <div ref={rootRef}>
      <section className="section hero">
        <div className="hero-orb" aria-hidden="true" />

        <div className="hero-copy">
          <div className="hero-kicker">
            <span>INDEPENDENT DIGITAL STUDIO</span>
            <span>01 / 04</span>
          </div>

          <h1>
            <span className="hero-line-wrap">
              <span className="hero-line">BUILD</span>
            </span>

            <span className="hero-line-wrap">
              <span className="hero-line">WHAT&apos;S</span>
            </span>

            <span className="hero-line-wrap">
              <span className="hero-line">
                NEXT<span style={{ color: "var(--cyan)" }}>.</span>
              </span>
            </span>
          </h1>

          <div className="hero-bottom">
            <p>
              AI systems, automation, software, and digital
              experiences built with intent.
            </p>

            <div className="scroll-cue">
              SCROLL TO EXPLORE
              <b aria-hidden="true">↓</b>
            </div>
          </div>
        </div>
      </section>

      <section className="section manifesto">
        <div className="section-index reveal-up">
          02 / POINT OF VIEW
        </div>

        <div className="manifesto-text reveal-up">
          <p className="display-copy">
            We build <em>useful machines</em> for territory that
            doesn&apos;t exist yet.
          </p>

          <p className="body-copy">
            Antarctic Labs is an independent digital studio focused
            on intelligent systems, automation, software, and
            experiences that turn difficult problems into working
            products.
          </p>
        </div>
      </section>

      <section className="section projects">
        <div className="section-head reveal-up">
          <span>SELECTED WORK</span>
          <span>02 PROJECTS</span>
        </div>

        <div className="project-stack">
          {PROJECTS.map((project, index) => (
            <ProjectCard
              key={project.number}
              project={project}
              index={index}
              onOpen={() => go(`/project-0${index + 1}`)}
            />
          ))}
        </div>
      </section>

      <section className="section capabilities">
        <div className="section-index reveal-up">
          03 / CAPABILITIES
        </div>

        <div className="capability-list">
          {CAPABILITIES.map(([number, title, description]) => (
            <div
              className="cap-row reveal-up"
              key={number}
            >
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
              <i aria-hidden="true">↗</i>
            </div>
          ))}
        </div>
      </section>

      <section className="section statement">
        <div className="statement-orbit" aria-hidden="true" />

        <div>
          <div className="section-index reveal-up">
            04 / NEXT TERRITORY
          </div>

          <h2 className="reveal-up">
            BUILD.
            <br />
            <em>MOVE.</em>
          </h2>

          <button
            className="text-link reveal-up"
            type="button"
            onClick={() => go("/about")}
          >
            ENTER THE STUDIO
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <section className="section contact-cta">
        <div className="section-index">
          START A BUILD
        </div>

        <h2>
          LET&apos;S
          <br />
          <em>MAKE IT.</em>
        </h2>

        <a
          className="contact-button"
          href={`mailto:${SITE.email}`}
        >
          <span>{SITE.email}</span>
          <b aria-hidden="true">↗</b>
        </a>
      </section>

      <SiteFooter go={go} />
    </div>
  );
}

function ProjectCard({ project, index, onOpen }) {
  const cardRef = useRef(null);

  const handlePointerMove = (event) => {
    const element = cardRef.current;

    if (!element) {
      return;
    }

    if (
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches
    ) {
      return;
    }

    const rect = element.getBoundingClientRect();

    const x =
      (event.clientX - rect.left) / rect.width - 0.5;

    const y =
      (event.clientY - rect.top) / rect.height - 0.5;

    element.style.setProperty(
      "--rx",
      `${y * -2.2}deg`,
    );

    element.style.setProperty(
      "--ry",
      `${x * 2.2}deg`,
    );

    element.style.setProperty(
      "--mx",
      `${x * 14}px`,
    );

    element.style.setProperty(
      "--my",
      `${y * 10}px`,
    );
  };

  const resetPointer = () => {
    const element = cardRef.current;

    if (!element) {
      return;
    }

    element.style.setProperty("--rx", "0deg");
    element.style.setProperty("--ry", "0deg");
    element.style.setProperty("--mx", "0px");
    element.style.setProperty("--my", "0px");
  };

  return (
    <button
      ref={cardRef}
      type="button"
      className="project-card reveal-up"
      onClick={onOpen}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      aria-label={`Open ${project.title}`}
    >
      <div
        className={`project-art ${
          index === 1 ? "art-2" : ""
        }`}
      >
        <div className="art-aurora" />
        <div className="art-glow" />

        <div className="art-mountain back" />
        <div className="art-mountain front" />

        <div className="art-sheen" />

        <span className="art-code">
          {project.type}
        </span>

        <span className="art-location">
          ANTARCTIC LABS / {project.status}
        </span>

        <span className="art-enter">
          OPEN CASE STUDY →
        </span>
      </div>

      <div className="project-meta">
        <span className="project-num">
          {project.number}
        </span>

        <div>
          <small>{project.type}</small>
          <h3>{project.title}</h3>
        </div>

        <span className="project-arrow">
          ↗
        </span>
      </div>
    </button>
  );
}

function ProjectPage({ index, go }) {
  const project = PROJECTS[index];

  return (
    <>
      <section className="section hero inner-hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span>{project.type}</span>
            <span>{project.number} / PROJECT</span>
          </div>

          <h1>
            <span className="hero-line-wrap">
              <span className="hero-line">
                {project.title}
              </span>
            </span>
          </h1>

          <div className="hero-bottom">
            <p>{project.description}</p>

            <div className="scroll-cue">
              CASE STUDY
              <b aria-hidden="true">↓</b>
            </div>
          </div>
        </div>
      </section>

      <section className="section manifesto">
        <div className="section-index">
          BRIEF
        </div>

        <div className="manifesto-text">
          <p className="display-copy">
            The <em>terrain</em> determines the system.
          </p>

          <p className="body-copy">
            This project page is structured to become a real
            technical case study: the problem, the terrain,
            the architecture, the build, and the measurable
            result.
          </p>
        </div>
      </section>

      <section className="section capabilities">
        <div className="section-index">
          SYSTEM
        </div>

        <div className="capability-list">
          {[
            ["01", "BRIEF", "The problem and operating constraints."],
            ["02", "TERRAIN", "The environment the system has to navigate."],
            ["03", "BUILD", "Architecture, implementation, and tooling."],
            ["04", "RESULT", "What changed once the system was deployed."],
          ].map(([number, title, description]) => (
            <div className="cap-row" key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
              <i aria-hidden="true">↗</i>
            </div>
          ))}
        </div>
      </section>

      <section className="section contact-cta">
        <div className="section-index">
          NEXT
        </div>

        <h2>
          BUILD
          <br />
          <em>ANOTHER.</em>
        </h2>

        <button
          className="contact-button"
          type="button"
          onClick={() => go("/")}
        >
          <span>BACK TO ANTARCTIC LABS</span>
          <b aria-hidden="true">↗</b>
        </button>
      </section>

      <SiteFooter go={go} />
    </>
  );
}

function About({ go }) {
  return (
    <>
      <section className="section hero inner-hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span>ANTARCTIC LABS</span>
            <span>STUDIO / 01</span>
          </div>

          <h1>
            <span className="hero-line-wrap">
              <span className="hero-line">ABOUT.</span>
            </span>
          </h1>

          <div className="hero-bottom">
            <p>
              A small independent studio building intelligent
              digital systems for people and businesses that
              need something more useful than another template.
            </p>

            <div className="scroll-cue">
              THE STUDIO
              <b aria-hidden="true">↓</b>
            </div>
          </div>
        </div>
      </section>

      <section className="section manifesto">
        <div className="section-index">
          APPROACH
        </div>

        <div className="manifesto-text">
          <p className="display-copy">
            Less <em>noise.</em>
            <br />
            Better systems.
          </p>

          <p className="body-copy">
            Antarctic Labs works across AI, automation, software,
            and experimental digital experiences. The goal is
            straightforward: understand the terrain, design the
            right system, and make the result genuinely useful.
          </p>
        </div>
      </section>

      <section className="section contact-cta">
        <div className="section-index">
          CONTACT
        </div>

        <h2>
          HAVE A
          <br />
          <em>PROBLEM?</em>
        </h2>

        <a
          className="contact-button"
          href={`mailto:${SITE.email}`}
        >
          <span>{SITE.email}</span>
          <b aria-hidden="true">↗</b>
        </a>
      </section>

      <SiteFooter go={go} />
    </>
  );
}

function NotFound({ go }) {
  return (
    <>
      <section className="section hero inner-hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span>ANTARCTIC LABS</span>
            <span>ERROR / 404</span>
          </div>

          <h1>
            <span className="hero-line-wrap">
              <span className="hero-line">LOST.</span>
            </span>
          </h1>

          <div className="hero-bottom">
            <p>
              The territory you&apos;re looking for doesn&apos;t
              exist.
            </p>

            <button
              className="text-link"
              type="button"
              onClick={() => go("/")}
            >
              RETURN HOME
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>

      <SiteFooter go={go} />
    </>
  );
}

function SiteFooter({ go }) {
  return (
    <footer className="site-footer">
      <span>© {new Date().getFullYear()} ANTARCTIC LABS</span>

      <button
        type="button"
        onClick={() => go("/about")}
      >
        ABOUT / CONTACT
      </button>

      <span>BUILT FOR UNKNOWN TERRITORY</span>
    </footer>
  );
}

function Menu({ open, close, go }) {
  const firstLinkRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = window.setTimeout(() => {
      firstLinkRef.current?.focus();
    }, 50);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="menu-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Site navigation"
    >
      <div className="menu-top">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            +
          </span>
          {SITE.brand}
        </span>

        <button
          type="button"
          className="menu-button"
          onClick={close}
          aria-label="Close navigation menu"
        >
          <span>CLOSE</span>

          <span
            className="menu-lines"
            aria-hidden="true"
          >
            <b />
            <b />
          </span>
        </button>
      </div>

      <nav className="menu-nav" aria-label="Primary">
        <button
          ref={firstLinkRef}
          type="button"
          onClick={() => go("/")}
        >
          <span>01</span>
          <strong>HOME</strong>
          <i aria-hidden="true">↗</i>
        </button>

        <button
          type="button"
          onClick={() => go("/project-01")}
        >
          <span>02</span>
          <strong>PROJECT ONE</strong>
          <i aria-hidden="true">↗</i>
        </button>

        <button
          type="button"
          onClick={() => go("/project-02")}
        >
          <span>03</span>
          <strong>PROJECT TWO</strong>
          <i aria-hidden="true">↗</i>
        </button>

        <button
          type="button"
          onClick={() => go("/about")}
        >
          <span>04</span>
          <strong>ABOUT</strong>
          <i aria-hidden="true">↗</i>
        </button>
      </nav>

      <div className="menu-bottom">
        <span>AVAILABLE FOR SELECT BUILDS</span>

        <a href={`mailto:${SITE.email}`}>
          {SITE.email}
        </a>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);