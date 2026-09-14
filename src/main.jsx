import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import PolarScene from "./scenes/PolarScene";
import "./styles.css";

gsap.registerPlugin(ScrollTrigger);

/* -------------------------------------------------------------------------- */
/* SITE CONFIGURATION                                                         */
/* -------------------------------------------------------------------------- */

const SITE = {
  brand: "ANTARCTIC LABS",
  shortBrand: "AL",
  email: "hello@antarctic-labs.com",
  location: "INDEPENDENT / REMOTE",
  availability: "AVAILABLE FOR SELECT BUILDS",
  version: "FIELD SYSTEM / 01",
};

const ROUTES = [
  "/",
  "/project-01",
  "/project-02",
  "/about",
];

/*
 * These are intentionally structured as data rather than scattered through
 * the components. Real projects can replace the current field notes without
 * changing the page architecture.
 */
const PROJECTS = [
  {
    number: "01",
    slug: "/project-01",
    title: "AI OPERATIONS SYSTEM",
    shortTitle: "AI Operations",
    type: "AI / AUTOMATION",
    status: "FIELD NOTE / BUILD",
    year: "2026",
    description:
      "An intelligent operational layer designed to turn repetitive digital work into a coordinated system of agents, tools, and human checkpoints.",
    summary:
      "Research the terrain. Design the system. Automate the repeatable. Keep the human where judgment matters.",
    tags: [
      "AGENTS",
      "AUTOMATION",
      "ORCHESTRATION",
      "OPERATIONS",
    ],
    sections: [
      {
        label: "THE BRIEF",
        title: "FROM TASKS TO SYSTEMS.",
        body:
          "The interesting problem is rarely a single automation. It is the chain around it: inputs, decisions, tools, verification, exceptions, and handoff.",
      },
      {
        label: "THE TERRAIN",
        title: "MAP THE WORK BEFORE AUTOMATING IT.",
        body:
          "Good automation begins with understanding what actually happens. The system has to know where information comes from, what can change, what requires judgment, and what must never happen without permission.",
      },
      {
        label: "THE SYSTEM",
        title: "AGENTS WITH BOUNDARIES.",
        body:
          "The architecture separates discovery, execution, verification, and delivery so each part can be tested without turning the whole system into a black box.",
      },
    ],
  },
  {
    number: "02",
    slug: "/project-02",
    title: "DIGITAL TERRITORY",
    shortTitle: "Digital Territory",
    type: "SOFTWARE / EXPERIENCE",
    status: "FIELD NOTE / EXPERIMENT",
    year: "2026",
    description:
      "An interactive digital environment exploring how interface, motion, information, and physical metaphor can become one coherent experience.",
    summary:
      "A website does not have to behave like a stack of pages. It can behave like a place.",
    tags: [
      "INTERACTION",
      "WEBGL",
      "INTERFACE",
      "EXPERIMENTAL",
    ],
    sections: [
      {
        label: "THE BRIEF",
        title: "MAKE THE INTERFACE FEEL LIKE A PLACE.",
        body:
          "The objective is not decoration. The environment should help establish context, hierarchy, rhythm, and memory while the interface remains useful.",
      },
      {
        label: "THE TERRAIN",
        title: "SPACE BECOMES INFORMATION.",
        body:
          "Movement, depth, scale, atmosphere, and typography can communicate relationships that would otherwise require another layer of interface chrome.",
      },
      {
        label: "THE SYSTEM",
        title: "MOTION WITH A JOB TO DO.",
        body:
          "Animation is treated as navigation and emphasis rather than spectacle. Every transition should either orient, reveal, connect, or reward exploration.",
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* CAPABILITIES                                                               */
/* -------------------------------------------------------------------------- */

const CAPABILITIES = [
  {
    number: "01",
    title: "AI SYSTEMS",
    short:
      "Agents, intelligent workflows, APIs, orchestration.",
    detail:
      "AI systems designed around useful outcomes rather than novelty: agents, tool use, structured workflows, context, verification, and controlled execution.",
  },
  {
    number: "02",
    title: "AUTOMATION",
    short:
      "Browser automation, data pipelines, operational systems.",
    detail:
      "Automation that connects the messy parts of real work: browsers, APIs, documents, data, notifications, handoffs, and repeatable operations.",
  },
  {
    number: "03",
    title: "SOFTWARE",
    short:
      "Web applications, interfaces, internal tools, integrations.",
    detail:
      "Purpose-built software that turns a defined process into a usable product, from interface architecture through integrations and deployment.",
  },
  {
    number: "04",
    title: "EXPERIMENTAL",
    short:
      "Interactive experiences, creative technology, prototypes.",
    detail:
      "Interactive systems where technology itself becomes part of the experience: spatial interfaces, generative environments, prototypes, and unusual digital products.",
  },
];

/* -------------------------------------------------------------------------- */
/* ROUTING                                                                    */
/* -------------------------------------------------------------------------- */

function normalizePath(pathname) {
  if (!pathname || pathname === "/") {
    return "/";
  }

  const clean = pathname.replace(/\/+$/, "");

  return ROUTES.includes(clean) ? clean : "/404";
}

function pathLabel(path) {
  if (path === "/") {
    return "ANTARCTIC LABS";
  }

  if (path === "/404") {
    return "404 / TERRITORY NOT FOUND";
  }

  const project = PROJECTS.find(
    (item) => item.slug === path,
  );

  if (project) {
    return `${project.number} / ${project.shortTitle}`;
  }

  if (path === "/about") {
    return "ABOUT / THE STUDIO";
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

  const navigate = (destination) => {
    const next = normalizePath(destination);

    if (next === path) {
      return;
    }

    window.history.pushState({}, "", next);
    setPath(next);
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  };

  useEffect(() => {
    const handlePopState = () => {
      setPath(
        normalizePath(window.location.pathname),
      );

      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto",
      });
    };

    window.addEventListener(
      "popstate",
      handlePopState,
    );

    return () => {
      window.removeEventListener(
        "popstate",
        handlePopState,
      );
    };
  }, []);

  return {
    path,
    navigate,
  };
}

/* -------------------------------------------------------------------------- */
/* APP                                                                         */
/* -------------------------------------------------------------------------- */

function App() {
  const { path, navigate } = useRoute();

  const [menuOpen, setMenuOpen] = useState(false);
  const [transitioning, setTransitioning] =
    useState(false);

  const transitionTimer = useRef(null);

  useEffect(() => {
    document.body.style.overflow = menuOpen
      ? "hidden"
      : "";

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
  }, []);

  useEffect(() => {
    return () => {
      if (transitionTimer.current) {
        window.clearTimeout(
          transitionTimer.current,
        );
      }
    };
  }, []);

  const go = (destination) => {
    const next = normalizePath(destination);

    if (
      next === path ||
      transitioning
    ) {
      return;
    }

    setMenuOpen(false);
    setTransitioning(true);

    transitionTimer.current =
      window.setTimeout(() => {
        navigate(next);

        transitionTimer.current =
          window.setTimeout(() => {
            setTransitioning(false);
          }, 160);
      }, 460);
  };

  return (
    <>
      <PolarScene />

      <SiteHeader
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
          <ProjectPage
            project={PROJECTS[0]}
            go={go}
          />
        )}

        {path === "/project-02" && (
          <ProjectPage
            project={PROJECTS[1]}
            go={go}
          />
        )}

        {path === "/about" && (
          <About go={go} />
        )}

        {path === "/404" && (
          <NotFound go={go} />
        )}
      </main>

      <Menu
        open={menuOpen}
        close={() => setMenuOpen(false)}
        go={go}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* HEADER                                                                      */
/* -------------------------------------------------------------------------- */

function SiteHeader({ onMenu, go }) {
  return (
    <header className="site-header">
      <button
        className="brand"
        type="button"
        onClick={() => go("/")}
        aria-label="Antarctic Labs home"
      >
        <span
          className="brand-mark"
          aria-hidden="true"
        >
          +
        </span>

        <span>{SITE.brand}</span>
      </button>

      <div className="header-right">
        <span className="availability">
          <i aria-hidden="true" />
          {SITE.availability}
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

/* -------------------------------------------------------------------------- */
/* PAGE TRANSITION                                                             */
/* -------------------------------------------------------------------------- */

function PageCurtain({ active, label }) {
  return (
    <div
      className={`page-curtain${
        active ? " is-active" : ""
      }`}
      aria-hidden="true"
    >
      <div className="curtain-glow" />

      <span>{label}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* HOME                                                                        */
/* -------------------------------------------------------------------------- */

function Home({ go }) {
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return undefined;
    }

    const reduceMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

    if (reduceMotion) {
      return undefined;
    }

    const context = gsap.context(() => {
      const heroLines =
        gsap.utils.toArray(
          ".hero-line",
        );

      gsap.fromTo(
        heroLines,
        {
          yPercent: 115,
          opacity: 0,
        },
        {
          yPercent: 0,
          opacity: 1,
          duration: 1.2,
          stagger: 0.075,
          ease: "power4.out",
          delay: 0.1,
        },
      );

      gsap.fromTo(
        ".hero-kicker, .hero-bottom",
        {
          y: 20,
          opacity: 0,
        },
        {
          y: 0,
          opacity: 1,
          duration: 0.9,
          stagger: 0.08,
          ease: "power3.out",
          delay: 0.48,
        },
      );

      gsap.utils
        .toArray(".reveal-up")
        .forEach((element) => {
          gsap.fromTo(
            element,
            {
              y: 38,
              opacity: 0,
            },
            {
              y: 0,
              opacity: 1,
              duration: 0.9,
              ease: "power3.out",
              scrollTrigger: {
                trigger: element,
                start: "top 84%",
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
      {/* ------------------------------------------------------------------ */}
      {/* ARRIVAL                                                            */}
      {/* ------------------------------------------------------------------ */}

      <section className="section hero">
        <div
          className="hero-orb"
          aria-hidden="true"
        />

        <div className="hero-copy">
          <div className="hero-kicker">
            <span>
              {SITE.location}
            </span>

            <span>
              {SITE.version}
            </span>
          </div>

          <h1>
            <span className="hero-line-wrap">
              <span className="hero-line">
                BUILD
              </span>
            </span>

            <span className="hero-line-wrap">
              <span className="hero-line">
                THE
              </span>
            </span>

            <span className="hero-line-wrap">
              <span className="hero-line">
                SYSTEM
                <span
                  style={{
                    color:
                      "var(--cyan)",
                  }}
                >
                  .
                </span>
              </span>
            </span>
          </h1>

          <div className="hero-bottom">
            <p>
              Intelligent systems,
              automation, software,
              and digital experiences
              built for the terrain ahead.
            </p>

            <div className="scroll-cue">
              <span>
                DESCEND TO EXPLORE
              </span>

              <b aria-hidden="true">
                ↓
              </b>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* POINT OF VIEW                                                      */}
      {/* ------------------------------------------------------------------ */}

      <section className="section manifesto">
        <div className="section-index reveal-up">
          01 / POINT OF VIEW
        </div>

        <div className="manifesto-text reveal-up">
          <p className="display-copy">
            We build{" "}
            <em>
              useful machines
            </em>{" "}
            for territory that
            doesn&apos;t exist yet.
          </p>

          <p className="body-copy">
            Antarctic Labs is an
            independent digital
            studio focused on the
            space between difficult
            problems and working
            systems.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* SYSTEMS                                                             */}
      {/* ------------------------------------------------------------------ */}

      <section className="section capabilities">
        <div className="section-index reveal-up">
          02 / SYSTEMS
        </div>

        <div className="capability-list">
          {CAPABILITIES.map(
            (capability) => (
              <div
                className="cap-row reveal-up"
                key={capability.number}
              >
                <span>
                  {capability.number}
                </span>

                <h3>
                  {capability.title}
                </h3>

                <p>
                  {capability.short}
                </p>

                <i aria-hidden="true">
                  ↗
                </i>
              </div>
            ),
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* EXPEDITIONS                                                         */}
      {/* ------------------------------------------------------------------ */}

      <section className="section projects">
        <div className="section-head reveal-up">
          <span>
            SELECTED EXPEDITIONS
          </span>

          <span>
            {String(
              PROJECTS.length,
            ).padStart(2, "0")}{" "}
            RECORDS
          </span>
        </div>

        <div className="project-stack">
          {PROJECTS.map(
            (project, index) => (
              <ProjectCard
                key={project.number}
                project={project}
                index={index}
                onOpen={() =>
                  go(project.slug)
                }
              />
            ),
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* PHILOSOPHY                                                          */}
      {/* ------------------------------------------------------------------ */}

      <section className="section statement">
        <div
          className="statement-orbit"
          aria-hidden="true"
        />

        <div>
          <div className="section-index reveal-up">
            03 / THE NEXT TERRITORY
          </div>

          <h2 className="reveal-up">
            USEFUL
            <br />
            <em>
              MACHINES.
            </em>
          </h2>

          <p className="statement-copy reveal-up">
            Technology is only
            interesting when it
            changes what becomes
            possible.
          </p>

          <button
            className="text-link reveal-up"
            type="button"
            onClick={() =>
              go("/about")
            }
          >
            ENTER THE STUDIO
            <span aria-hidden="true">
              →
            </span>
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* CONTACT                                                             */}
      {/* ------------------------------------------------------------------ */}

      <section className="section contact-cta">
        <div className="section-index">
          START A BUILD
        </div>

        <h2>
          LET&apos;S
          <br />
          <em>
            MAKE IT.
          </em>
        </h2>

        <a
          className="contact-button"
          href={`mailto:${SITE.email}`}
        >
          <span>
            {SITE.email}
          </span>

          <b aria-hidden="true">
            ↗
          </b>
        </a>
      </section>

      <SiteFooter go={go} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PROJECT CARD                                                               */
/* -------------------------------------------------------------------------- */

function ProjectCard({
  project,
  index,
  onOpen,
}) {
  const cardRef = useRef(null);

  const handlePointerMove = (
    event,
  ) => {
    const element =
      cardRef.current;

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

    if (
      window.matchMedia(
        "(pointer: coarse)",
      ).matches
    ) {
      return;
    }

    const rect =
      element.getBoundingClientRect();

    const x =
      (event.clientX -
        rect.left) /
        rect.width -
      0.5;

    const y =
      (event.clientY -
        rect.top) /
        rect.height -
      0.5;

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
    const element =
      cardRef.current;

    if (!element) {
      return;
    }

    element.style.setProperty(
      "--rx",
      "0deg",
    );

    element.style.setProperty(
      "--ry",
      "0deg",
    );

    element.style.setProperty(
      "--mx",
      "0px",
    );

    element.style.setProperty(
      "--my",
      "0px",
    );
  };

  return (
    <button
      ref={cardRef}
      type="button"
      className="project-card reveal-up"
      onClick={onOpen}
      onPointerMove={
        handlePointerMove
      }
      onPointerLeave={
        resetPointer
      }
      aria-label={`Open ${project.title}`}
    >
      <div
        className={`project-art ${
          index === 1
            ? "art-2"
            : ""
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
          {SITE.brand} /{" "}
          {project.status}
        </span>

        <span className="art-enter">
          OPEN FIELD RECORD →
        </span>
      </div>

      <div className="project-meta">
        <span className="project-num">
          {project.number}
        </span>

        <div>
          <small>
            {project.type}
          </small>

          <h3>
            {project.title}
          </h3>
        </div>

        <span className="project-arrow">
          ↗
        </span>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* PROJECT PAGE                                                               */
/* -------------------------------------------------------------------------- */

function ProjectPage({
  project,
  go,
}) {
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    const root =
      rootRef.current;

    if (!root) {
      return undefined;
    }

    const reduceMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

    if (reduceMotion) {
      return undefined;
    }

    const context = gsap.context(
      () => {
        gsap.fromTo(
          ".project-hero-line",
          {
            yPercent: 105,
            opacity: 0,
          },
          {
            yPercent: 0,
            opacity: 1,
            duration: 1.1,
            stagger: 0.08,
            ease: "power4.out",
          },
        );

        gsap.utils
          .toArray(".reveal-up")
          .forEach(
            (element) => {
              gsap.fromTo(
                element,
                {
                  y: 35,
                  opacity: 0,
                },
                {
                  y: 0,
                  opacity: 1,
                  duration: 0.8,
                  ease: "power3.out",
                  scrollTrigger: {
                    trigger: element,
                    start: "top 84%",
                    once: true,
                  },
                },
              );
            },
          );
      },
      root,
    );

    return () => {
      context.revert();
    };
  }, [project]);

  return (
    <div
      ref={rootRef}
      className="project-page"
    >
      <section className="section project-hero">
        <div className="section-index">
          FIELD RECORD /{" "}
          {project.number}
        </div>

        <div className="project-hero-copy">
          <div className="project-kicker">
            <span>
              {project.type}
            </span>

            <span>
              {project.year}
            </span>
          </div>

          <h1>
            <span className="hero-line-wrap">
              <span className="project-hero-line">
                {project.title.split(
                  " ",
                )[0]}
              </span>
            </span>

            <span className="hero-line-wrap">
              <span className="project-hero-line">
                {project.title
                  .split(" ")
                  .slice(1)
                  .join(" ")}
                <span
                  style={{
                    color:
                      "var(--cyan)",
                  }}
                >
                  .
                </span>
              </span>
            </span>
          </h1>

          <p className="project-lead">
            {project.description}
          </p>
        </div>

        <div className="project-hero-meta">
          <span>
            {project.status}
          </span>

          <span>
            SCROLL TO DESCEND ↓
          </span>
        </div>
      </section>

      <section className="section project-summary">
        <div className="section-index reveal-up">
          THE SIGNAL
        </div>

        <div className="project-summary-content">
          <p className="display-copy reveal-up">
            {project.summary}
          </p>

          <div className="project-tags reveal-up">
            {project.tags.map(
              (tag) => (
                <span key={tag}>
                  {tag}
                </span>
              ),
            )}
          </div>
        </div>
      </section>

      {project.sections.map(
        (section, index) => (
          <section
            className={`section project-detail project-detail-${index + 1}`}
            key={section.label}
          >
            <div className="section-index reveal-up">
              {String(
                index + 1,
              ).padStart(2, "0")}{" "}
              / {section.label}
            </div>

            <div className="project-detail-grid">
              <h2 className="reveal-up">
                {section.title}
              </h2>

              <p className="body-copy reveal-up">
                {section.body}
              </p>
            </div>
          </section>
        ),
      )}

      <section className="section project-next">
        <div className="section-index">
          NEXT RECORD
        </div>

        <button
          className="next-project-button"
          type="button"
          onClick={() => {
            const next =
              project.number === "01"
                ? PROJECTS[1]
                : PROJECTS[0];

            go(next.slug);
          }}
        >
          <span>
            {project.number ===
            "01"
              ? PROJECTS[1].number
              : PROJECTS[0].number}
          </span>

          <strong>
            {project.number ===
            "01"
              ? PROJECTS[1].shortTitle
              : PROJECTS[0].shortTitle}
          </strong>

          <b aria-hidden="true">
            →
          </b>
        </button>
      </section>

      <section className="section contact-cta">
        <div className="section-index">
          START A BUILD
        </div>

        <h2>
          BUILD
          <br />
          <em>
            SOMETHING
            <br />
            USEFUL.
          </em>
        </h2>

        <a
          className="contact-button"
          href={`mailto:${SITE.email}`}
        >
          <span>
            {SITE.email}
          </span>

          <b aria-hidden="true">
            ↗
          </b>
        </a>
      </section>

      <SiteFooter go={go} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ABOUT                                                                      */
/* -------------------------------------------------------------------------- */

function About({ go }) {
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    const root =
      rootRef.current;

    if (!root) {
      return undefined;
    }

    const reduceMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

    if (reduceMotion) {
      return undefined;
    }

    const context = gsap.context(
      () => {
        gsap.fromTo(
          ".about-title-line",
          {
            yPercent: 105,
            opacity: 0,
          },
          {
            yPercent: 0,
            opacity: 1,
            duration: 1.05,
            stagger: 0.08,
            ease: "power4.out",
          },
        );

        gsap.utils
          .toArray(".reveal-up")
          .forEach(
            (element) => {
              gsap.fromTo(
                element,
                {
                  y: 35,
                  opacity: 0,
                },
                {
                  y: 0,
                  opacity: 1,
                  duration: 0.8,
                  ease: "power3.out",
                  scrollTrigger: {
                    trigger: element,
                    start: "top 84%",
                    once: true,
                  },
                },
              );
            },
          );
      },
      root,
    );

    return () => {
      context.revert();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="about-page"
    >
      <section className="section about-hero">
        <div className="section-index">
          ABOUT / {SITE.brand}
        </div>

        <h1>
          <span className="hero-line-wrap">
            <span className="about-title-line">
              BUILDING
            </span>
          </span>

          <span className="hero-line-wrap">
            <span className="about-title-line">
              BEYOND
            </span>
          </span>

          <span className="hero-line-wrap">
            <span className="about-title-line">
              THE MAP
              <span
                style={{
                  color:
                    "var(--cyan)",
                }}
              >
                .
              </span>
            </span>
          </span>
        </h1>
      </section>

      <section className="section about-statement">
        <div className="section-index reveal-up">
          THE STUDIO
        </div>

        <div className="about-statement-grid">
          <p className="display-copy reveal-up">
            Antarctic Labs is a
            small, independent
            studio for building
            ambitious digital
            systems.
          </p>

          <div className="about-copy">
            <p className="body-copy reveal-up">
              We work across AI,
              automation, software,
              and experimental
              interfaces.
            </p>

            <p className="body-copy reveal-up">
              The common thread
              is simple: start with
              the problem, understand
              the terrain, then build
              the smallest system
              capable of changing it.
            </p>
          </div>
        </div>
      </section>

      <section className="section about-principles">
        <div className="section-index reveal-up">
          HOW WE BUILD
        </div>

        <div className="principle-list">
          <div className="principle reveal-up">
            <span>01</span>
            <h2>
              UNDERSTAND
            </h2>
            <p>
              Before automation,
              understand the actual
              work.
            </p>
          </div>

          <div className="principle reveal-up">
            <span>02</span>
            <h2>
              SIMPLIFY
            </h2>
            <p>
              Remove unnecessary
              complexity before adding
              technology.
            </p>
          </div>

          <div className="principle reveal-up">
            <span>03</span>
            <h2>
              BUILD
            </h2>
            <p>
              Turn the model into a
              reliable working system.
            </p>
          </div>

          <div className="principle reveal-up">
            <span>04</span>
            <h2>
              VERIFY
            </h2>
            <p>
              A system is not finished
              because it runs. It is
              finished when it works.
            </p>
          </div>
        </div>
      </section>

      <section className="section about-capabilities">
        <div className="section-index">
          CURRENT TERRITORY
        </div>

        <div className="capability-list">
          {CAPABILITIES.map(
            (capability) => (
              <div
                className="cap-row reveal-up"
                key={capability.number}
              >
                <span>
                  {capability.number}
                </span>

                <h3>
                  {capability.title}
                </h3>

                <p>
                  {capability.detail}
                </p>

                <i aria-hidden="true">
                  ↗
                </i>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="section about-contact">
        <div className="section-index">
          OPEN CHANNEL
        </div>

        <h2>
          HAVE A
          <br />
          <em>
            TERRAIN?
          </em>
        </h2>

        <a
          className="contact-button"
          href={`mailto:${SITE.email}`}
        >
          <span>
            {SITE.email}
          </span>

          <b aria-hidden="true">
            ↗
          </b>
        </a>
      </section>

      <SiteFooter go={go} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MENU                                                                       */
/* -------------------------------------------------------------------------- */

function Menu({
  open,
  close,
  go,
}) {
  if (!open) {
    return null;
  }

  return (
    <aside
      className="menu-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation"
    >
      <div className="menu-panel-top">
        <span>
          {SITE.brand}
        </span>

        <button
          type="button"
          className="menu-close"
          onClick={close}
          aria-label="Close navigation"
        >
          CLOSE
          <span aria-hidden="true">
            ×
          </span>
        </button>
      </div>

      <nav className="menu-nav">
        <button
          type="button"
          onClick={() => go("/")}
        >
          <span>00</span>
          <strong>HOME</strong>
          <i aria-hidden="true">
            →
          </i>
        </button>

        <button
          type="button"
          onClick={() =>
            go("/project-01")
          }
        >
          <span>01</span>
          <strong>
            AI OPERATIONS
          </strong>
          <i aria-hidden="true">
            →
          </i>
        </button>

        <button
          type="button"
          onClick={() =>
            go("/project-02")
          }
        >
          <span>02</span>
          <strong>
            DIGITAL TERRITORY
          </strong>
          <i aria-hidden="true">
            →
          </i>
        </button>

        <button
          type="button"
          onClick={() =>
            go("/about")
          }
        >
          <span>03</span>
          <strong>ABOUT</strong>
          <i aria-hidden="true">
            →
          </i>
        </button>
      </nav>

      <div className="menu-panel-bottom">
        <span>
          {SITE.location}
        </span>

        <a
          href={`mailto:${SITE.email}`}
        >
          {SITE.email}
        </a>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* FOOTER                                                                     */
/* -------------------------------------------------------------------------- */

function SiteFooter({ go }) {
  return (
    <footer className="site-footer">
      <div>
        <span>
          {SITE.brand}
        </span>

        <span>
          {SITE.version}
        </span>
      </div>

      <div>
        <button
          type="button"
          onClick={() => go("/")}
        >
          BACK TO TOP ↑
        </button>

        <span>
          © {new Date().getFullYear()}
        </span>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */
/* 404                                                                        */
/* -------------------------------------------------------------------------- */

function NotFound({ go }) {
  return (
    <div className="not-found">
      <div className="section-index">
        404 / UNMAPPED TERRITORY
      </div>

      <h1>
        NOTHING
        <br />
        <em>
          HERE.
        </em>
      </h1>

      <p>
        The route you requested
        does not exist.
      </p>

      <button
        className="text-link"
        type="button"
        onClick={() => go("/")}
      >
        RETURN TO BASE
        <span aria-hidden="true">
          →
        </span>
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MOUNT                                                                      */
/* -------------------------------------------------------------------------- */

createRoot(
  document.getElementById("root"),
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);