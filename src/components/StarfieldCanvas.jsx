// StarfieldCanvas — the homepage's opening constellation: a field of
// twinkling stars, a few bright nodes linked by faint constellation
// lines, and periodic shooting stars streaking across the top of the
// page. It fills the .constellation-layer on the home route; the Home
// scroll timeline translates/fades that layer away as the visitor
// scrolls, exactly as it did for the effect this replaces.
//
// Why this exists (2026-10-22): the previous effect was a srcdoc
// iframe (DefenseLines) whose canvas no longer painted anything
// visible in production or in local headless QA — the layer was on the
// page but the sky was empty. This replacement is deliberately
// self-contained: one canvas, no iframe, no external assets, no CDN
// scripts, nothing for the CSP to block, and no lazy chunk to fail.
// It respects prefers-reduced-motion (one static frame, no loop),
// pauses while off-screen or while the tab is hidden, caps the
// devicePixelRatio for mobile GPUs, and cleans up fully on unmount.
import { useEffect, useRef } from "react";

export default function StarfieldCanvas() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let stars = [];
    let nodes = [];
    let meteors = [];
    let raf = 0;
    let running = false;
    let visible = true;
    let last = 0;
    let nextMeteor = 1200 + Math.random() * 2500;

    const rand = (min, max) => min + Math.random() * (max - min);

    // The sky is generated ONCE (buildField) and only ever RESCALED
    // afterwards (layout). The previous version regenerated every
    // star/node position with Math.random() on each debounced resize —
    // on mobile Safari, scrolling shows/hides the URL bar, which fires
    // resize, which re-randomized the whole sky 150ms later: the stars
    // visibly jumped/repositioned mid-scroll. Now a resize — URL-bar
    // band changes included — only re-sizes the canvas bitmap and
    // scales the existing field proportionally, so every star keeps
    // its relative position, radius, and twinkle phase forever.
    let fieldBuilt = false;

    function layout() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const nw = Math.max(1, Math.floor(rect.width));
      const nh = Math.max(1, Math.floor(rect.height));
      if (fieldBuilt && w > 0 && h > 0 && (nw !== w || nh !== h)) {
        const sx = nw / w;
        const sy = nh / h;
        for (const s of stars) {
          s.x *= sx;
          s.y *= sy;
        }
        for (const n of nodes) {
          n.x *= sx;
          n.y *= sy;
        }
      }
      w = nw;
      h = nh;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function buildField() {
      const starCount = Math.min(240, Math.max(90, Math.floor((w * h) / 8500)));
      stars = Array.from({ length: starCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: rand(0.4, 1.5),
        a: rand(0.25, 0.95),
        phase: Math.random() * Math.PI * 2,
        speed: rand(0.4, 1.3),
      }));

      // Constellation nodes: a sparse set of brighter stars that drift
      // very slowly and link to near neighbours with faint lines.
      // They spread over nearly the full height (0.95) so the field
      // reads as filling the viewport down to where the aurora takes
      // over, matching the layer's full-height mask in styles.css.
      const nodeCount = w < 700 ? 14 : 24;
      nodes = Array.from({ length: nodeCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h * 0.95,
        r: rand(1.1, 2.0),
        vx: rand(-4, 4),
        vy: rand(-2.5, 2.5),
        phase: Math.random() * Math.PI * 2,
      }));
      meteors = [];
      fieldBuilt = true;
    }

    function drawStars(t) {
      for (const s of stars) {
        const tw = reduce ? 1 : 0.72 + 0.28 * Math.sin(s.phase + t * 0.001 * s.speed);
        ctx.globalAlpha = Math.max(0.05, s.a * tw);
        ctx.fillStyle = "#dfeef5";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawConstellation(t) {
      const linkDist = Math.min(170, w * 0.16);
      ctx.lineWidth = 0.6;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < linkDist) {
            ctx.strokeStyle = `rgba(150, 200, 220, ${0.13 * (1 - d / linkDist)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        const tw = reduce ? 1 : 0.8 + 0.2 * Math.sin(n.phase + t * 0.0009);
        ctx.globalAlpha = 0.9 * tw;
        ctx.fillStyle = "#eef7fb";
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function spawnMeteor(now) {
      const fromLeft = Math.random() < 0.5;
      const speed = rand(520, 820);
      const angle = rand(0.42, 0.62); // radians below horizontal
      meteors.push({
        x: fromLeft ? rand(-40, w * 0.45) : rand(w * 0.55, w + 40),
        y: rand(0, h * 0.38),
        vx: (fromLeft ? 1 : -1) * Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: rand(90, 170),
        born: now,
        life: rand(750, 1150),
      });
    }

    function drawMeteors(now, dt) {
      meteors = meteors.filter((m) => now - m.born < m.life);
      for (const m of meteors) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const age = (now - m.born) / m.life;
        const fade = age < 0.15 ? age / 0.15 : 1 - (age - 0.15) / 0.85;
        const vlen = Math.hypot(m.vx, m.vy) || 1;
        const tx = m.x - (m.vx / vlen) * m.len;
        const ty = m.y - (m.vy / vlen) * m.len;
        const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
        grad.addColorStop(0, `rgba(255, 255, 255, ${0.95 * fade})`);
        grad.addColorStop(0.25, `rgba(190, 225, 245, ${0.55 * fade})`);
        grad.addColorStop(1, "rgba(190, 225, 245, 0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.globalAlpha = 0.9 * fade;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(m.x, m.y, 1.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;
      ctx.clearRect(0, 0, w, h);
      drawStars(now);
      // Drift the constellation nodes slowly, bouncing off the edges.
      for (const n of nodes) {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
        n.x = Math.max(0, Math.min(w, n.x));
        n.y = Math.max(0, Math.min(h, n.y));
      }
      drawConstellation(now);
      if (now >= nextMeteor) {
        // Cadence (2026-10-23, Joshua: "a few more shooting stars —
        // not that many more, just a few more"): a spawn every
        // ~1.3–3.4s instead of ~2.2–5.6s, plus an occasional companion
        // meteor (~30% chance) born a few hundred ms earlier so pairs
        // streak slightly staggered rather than in lockstep. Hard cap
        // of 3 concurrent meteors keeps the sky calm.
        if (meteors.length < 3) {
          spawnMeteor(now);
          if (meteors.length < 3 && Math.random() < 0.3) {
            spawnMeteor(now - rand(150, 450));
          }
        }
        nextMeteor = now + rand(1300, 3400);
      }
      drawMeteors(now, dt);
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduce) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    layout();
    buildField();
    if (reduce) {
      // One static frame: stars + constellation, no meteors, no loop.
      ctx.clearRect(0, 0, w, h);
      drawStars(0);
      drawConstellation(0);
    } else {
      start();
    }

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        // Rescale only — never regenerate (see layout/buildField).
        // Small height-only deltas are the mobile URL-bar band; the
        // proportional rescale absorbs them without any star moving
        // relative to the field.
        layout();
        if (reduce) {
          ctx.clearRect(0, 0, w, h);
          drawStars(0);
          drawConstellation(0);
        }
      }, 150);
    };
    window.addEventListener("resize", onResize);

    // Pause while the layer is off-screen (it exits upward on scroll)
    // or the tab is hidden — the effect costs nothing when unseen.
    let io = null;
    if ("IntersectionObserver" in window && !reduce) {
      io = new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible && !document.hidden) start();
        else stop();
      });
      io.observe(canvas);
    }
    const onVis = () => {
      if (document.hidden) stop();
      else if (visible) start();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      if (io) io.disconnect();
      window.clearTimeout(resizeTimer);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
