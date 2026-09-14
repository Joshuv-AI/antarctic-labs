import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./styles.css";

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
      <IceScene />
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

function IceScene() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x071018, 0.045);

    const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
    camera.position.set(0, 1.5, 9);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const world = new THREE.Group();
    scene.add(world);

    const iceMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xaed2df,
      roughness: 0.15,
      metalness: 0.03,
      transmission: 0.22,
      thickness: 1.2,
      transparent: true,
      opacity: 0.58
    });

    const iceberg = new THREE.Mesh(new THREE.IcosahedronGeometry(2.55, 2), iceMaterial);
    iceberg.scale.set(1.15, 1.05, 0.82);
    iceberg.position.set(1.65, 0.55, -0.7);
    iceberg.rotation.set(-0.22, 0.45, 0.08);
    world.add(iceberg);

    const icebergWire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.58, 2),
      new THREE.MeshBasicMaterial({ color: 0xe7f5f8, transparent: true, opacity: 0.12, wireframe: true })
    );
    icebergWire.scale.copy(iceberg.scale);
    icebergWire.position.copy(iceberg.position);
    icebergWire.rotation.copy(iceberg.rotation);
    world.add(icebergWire);

    const mountainMaterial = new THREE.MeshStandardMaterial({
      color: 0xb9d5de,
      roughness: 0.92,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity: 0.72
    });

    const ridge = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const h = 1.6 + (i % 4) * 0.42;
      const m = new THREE.Mesh(new THREE.ConeGeometry(1.2 + (i % 3) * 0.25, h, 6), mountainMaterial);
      m.position.set(-5.6 + i * 1.55, -2.15 + h * 0.22, -2.5 - (i % 3) * 0.8);
      m.rotation.y = i * 0.65;
      m.scale.x = 1.2 + (i % 2) * 0.25;
      ridge.add(m);

      const snow = new THREE.Mesh(
        new THREE.ConeGeometry(0.72 + (i % 3) * 0.15, h * 0.45, 6),
        new THREE.MeshBasicMaterial({ color: 0xeaf5f8, transparent: true, opacity: 0.48 })
      );
      snow.position.copy(m.position);
      snow.position.y += h * 0.34;
      snow.scale.set(0.75, 0.85, 0.75);
      snow.rotation.y = m.rotation.y + 0.2;
      ridge.add(snow);
    }
    world.add(ridge);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 24, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x07151d, transparent: true, opacity: 0.72 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -2.35;
    water.position.z = -1;
    world.add(water);

    const starGeometry = new THREE.BufferGeometry();
    const starCount = 650;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 25;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 13;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 18 - 2;
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ color: 0xdceff4, size: 0.016, transparent: true, opacity: 0.55 })
    );
    scene.add(stars);

    const aurora = new THREE.Group();
    const auroraMaterials = [
      new THREE.LineBasicMaterial({ color: 0x6aa9bb, transparent: true, opacity: 0.18 }),
      new THREE.LineBasicMaterial({ color: 0x9ec7bc, transparent: true, opacity: 0.12 }),
      new THREE.LineBasicMaterial({ color: 0x9eacd0, transparent: true, opacity: 0.09 })
    ];

    for (let j = 0; j < 3; j++) {
      const points = [];
      for (let i = 0; i < 90; i++) {
        const x = -11 + i * 0.25;
        const y = 3.2 + j * 0.48 + Math.sin(i * 0.11 + j) * 0.55 + Math.sin(i * 0.035) * 0.45;
        const z = -5 + Math.sin(i * 0.07 + j) * 1.2;
        points.push(new THREE.Vector3(x, y, z));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), auroraMaterials[j]);
      aurora.add(line);
    }
    scene.add(aurora);

    scene.add(new THREE.HemisphereLight(0xb8d7e2, 0x061018, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-5, 6, 8);
    scene.add(key);
    const rim = new THREE.PointLight(0x4c9bb5, 16, 18);
    rim.position.set(4, 0, 3);
    scene.add(rim);

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e) => {
      pointer.tx = (e.clientX / innerWidth - 0.5) * 0.9;
      pointer.ty = (e.clientY / innerHeight - 0.5) * 0.45;
    };
    window.addEventListener("pointermove", onMove);

    const clock = new THREE.Clock();
    let raf;
    const tick = () => {
      const t = clock.getElapsedTime();
      pointer.x += (pointer.tx - pointer.x) * 0.025;
      pointer.y += (pointer.ty - pointer.y) * 0.025;

      iceberg.rotation.y += 0.0008;
      iceberg.rotation.x = -0.22 + Math.sin(t * 0.22) * 0.025;
      iceberg.position.y = 0.55 + Math.sin(t * 0.38) * 0.08;

      icebergWire.rotation.copy(iceberg.rotation);
      icebergWire.position.copy(iceberg.position);
      ridge.position.x = Math.sin(t * 0.08) * 0.05;
      stars.rotation.y = t * 0.004;
      aurora.position.x = Math.sin(t * 0.12) * 0.12;
      aurora.rotation.z = Math.sin(t * 0.08) * 0.015;

      world.rotation.y += ((pointer.x * 0.075) - world.rotation.y) * 0.018;
      world.rotation.x += ((pointer.y * 0.035) - world.rotation.x) * 0.018;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const resize = () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    };
    addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("pointermove", onMove);
      removeEventListener("resize", resize);
      renderer.dispose();
      starGeometry.dispose();
      stars.material.dispose();
      iceberg.geometry.dispose();
      icebergWire.geometry.dispose();
      water.geometry.dispose();
      iceMaterial.dispose();
      mountainMaterial.dispose();
      ridge.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material && obj.material !== mountainMaterial) obj.material.dispose();
      });
      aurora.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
      auroraMaterials.forEach((m) => m.dispose());
    };
  }, []);

  return <canvas ref={ref} className="ice-canvas" aria-hidden="true" />;
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

createRoot(document.getElementById("root")).render(<App />);
