// Helix scene — the Tower of Babel landing's dark hero band background:
// a wide, nearly flat spiral disc of book-cover rings in black space —
// thin separated coil bands of tiny covers, dark gaps with a fine red
// wire strand running in them, sparse satellite clusters on strands
// past the rim, and a calm black center behind the hero title.
// Reel-match build (2026-11-12, bench: helix-bench RESULTS.md "REEL-
// MATCH PASS" — Joshua rejected the earlier conical dome; this layout
// is the one whose bench screenshots match the reel's poster frame).
//
// Rendering economy (plan section 5 — "looks expensive, costs almost
// nothing"): ONE InstancedMesh for all ~13,000 panels, ONE baked
// texture atlas (/helix-atlas.webp), the whole structure rotating as a
// single group. Three draw calls total: panels, wire, dust.
//
// Production lifecycle: idle state only (state binding is Phase 3/4),
// ~30 fps cap, DPR cap, sustained-low-fps auto-degrade to a frozen
// frame, full disposal. This module is loaded ONLY via dynamic
// import() from components/HelixCanvas.jsx, deferred until after
// first paint + the Tower boot overlay — three.js and this scene
// never ride the page's initial chunks and never compete with the
// catalog stream's startup.

import * as THREE from "three";

const ATLAS_COLS = 16;
const ATLAS_ROWS = 16;

// ------------------------------------------------------------------ groups
// name + relative weight (illustrative shares of the real catalog)
const GROUPS = [
  { name: "PAPERS", weight: 44 },
  { name: "LAW", weight: 49 },
  { name: "DECLASSIFIED", weight: 7 },
  { name: "RELIGION", weight: 8 },
  { name: "HISTORY", weight: 6 },
  { name: "LITERATURE", weight: 6 },
  { name: "SCIENCE", weight: 5 },
  { name: "PHILOSOPHY", weight: 4 },
  { name: "PODCASTS", weight: 4 },
  { name: "FOLKLORE", weight: 3 },
];

// ------------------------------------------------------------------ rng
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ spiral disc
// Archimedean spiral in the horizontal plane with a gentle dome. Each
// turn is one thin band; successive turns are separated by a black gap
// (PITCH - band width) where the wire strand runs. The inner radius
// leaves the poster's calm center — about a third of the disc radius —
// empty behind the hero title.
const R0 = 9.5;
const PITCH = 0.95;
const TURNS = 21;
const THETA_MAX = TURNS * Math.PI * 2;
const R_MAX = R0 + PITCH * TURNS;
const DOME_H = 3.0;

function radiusAt(theta) { return R0 + (PITCH / (Math.PI * 2)) * theta; }
function domeY(r) { const s = Math.min(1, r / R_MAX); return DOME_H * (1 - s * s); }
function spiralPoint(theta) {
  const r = radiusAt(theta);
  return new THREE.Vector3(Math.cos(theta) * r, domeY(r), Math.sin(theta) * r);
}
// Surface frame at theta: T = along-spiral tangent, N = surface normal
// (up, tilted by the dome slope), Y = across the band (in-surface).
// Panels lie flat on this frame, faces up.
function spiralFrame(theta) {
  const C = spiralPoint(theta);
  const C2 = spiralPoint(theta + 0.01);
  const T = C2.sub(C).normalize();
  const radial = new THREE.Vector3(C.x, 0, C.z).normalize();
  const slope = (domeY(radiusAt(theta) + 0.05) - domeY(radiusAt(theta))) / 0.05;
  const N = new THREE.Vector3(-slope * radial.x, 1, -slope * radial.z).normalize();
  const Y = new THREE.Vector3().crossVectors(N, T).normalize();
  const T2 = new THREE.Vector3().crossVectors(Y, N).normalize();
  return { C, T: T2, Y, N };
}

// arc-length table over theta
const ARC_SAMPLES = 6000;
const arcTable = [{ theta: 0, cum: 0 }];
{
  let prev = spiralPoint(0), cum = 0;
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    const theta = (i / ARC_SAMPLES) * THETA_MAX;
    const p = spiralPoint(theta);
    cum += p.distanceTo(prev);
    arcTable.push({ theta, cum });
    prev = p;
  }
}
const TOTAL_ARC = arcTable[ARC_SAMPLES].cum;
function thetaAtArc(s) {
  let lo = 0, hi = ARC_SAMPLES;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arcTable[mid].cum < s) lo = mid + 1; else hi = mid;
  }
  const b = arcTable[Math.max(1, lo)], a = arcTable[Math.max(1, lo) - 1];
  const f = (s - a.cum) / Math.max(1e-6, b.cum - a.cum);
  return a.theta + (b.theta - a.theta) * f;
}

// ------------------------------------------------------------------ panel field
const PANEL_W = 0.46;              // along the band (tangent)
const PANEL_H = 0.26;              // across the band (radial)
const ROW_OFFS = [-0.21, 0, 0.21]; // 3 rows per band -> band width ~0.68
const STATION_STEP = 0.56;         // along-band spacing (beads nearly touching)
const GROUP_GAP_ARC = 0.3;         // hairline seam between collections

// Create the scene on `canvas`. opts:
//   atlasUrl — the baked atlas asset (default "/helix-atlas.webp")
//   frozen   — render one still frame, never run the loop
//   onError  — called if the WebGL context cannot be created at all
// Returns a controller { start, stop, renderStill, dispose, isDegraded }
// or null when the renderer could not be created.
export function createHelixScene(canvas, opts = {}) {
  const atlasUrl = opts.atlasUrl || "/helix-atlas.webp";
  const frozen = !!opts.frozen;
  const onError = typeof opts.onError === "function" ? opts.onError : () => {};

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      // No antialiasing on small screens (plan section 5); desktop-class
      // viewports keep it — the scene is three draw calls either way.
      antialias: window.innerWidth >= 820,
      alpha: false,
      powerPreference: "low-power",
      stencil: false,
    });
  } catch (e) {
    onError(e);
    return null;
  }
  if (!renderer || !renderer.getContext()) {
    onError(new Error("webgl-context-unavailable"));
    return null;
  }

  // DPR cap: 1.5 desktop-class, 1.0 on small screens (plan section 5).
  const dprCap = window.innerWidth < 700 ? 1.0 : 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  // Idle framing (the bench's rings state): high oblique, ~61 deg down,
  // so the rings read as ellipses with the spiral sweep and the calm
  // center sits behind the hero title zone.
  const CAM_POS = new THREE.Vector3(0, 46, 25);
  const CAM_TGT = new THREE.Vector3(0, 0.4, 0);
  camera.position.copy(CAM_POS);

  const structure = new THREE.Group();
  scene.add(structure);

  // ---- group arc ranges by weight
  const totalWeight = GROUPS.reduce((s, g) => s + g.weight, 0);
  const groupRanges = [];
  {
    let acc = 0;
    GROUPS.forEach((g, gi) => {
      const a0 = (acc / totalWeight) * TOTAL_ARC;
      acc += g.weight;
      const a1 = (acc / totalWeight) * TOTAL_ARC;
      groupRanges.push({ name: g.name, weight: g.weight, index: gi, arc0: a0, arc1: a1 });
    });
  }

  // ---- placements (baked instance matrices; runs once at init)
  const placements = [];
  const satellitePaths = [];
  {
    const rnd = mulberry32(987123);
    const m = new THREE.Matrix4();
    const qj = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (const g of groupRanges) {
      const a0 = g.arc0 + GROUP_GAP_ARC / 2;
      const a1 = g.arc1 - GROUP_GAP_ARC / 2;
      const stations = Math.max(2, Math.floor((a1 - a0) / STATION_STEP));
      for (let s = 0; s < stations; s++) {
        const arc = a0 + ((s + 0.5) / stations) * (a1 - a0);
        const theta = thetaAtArc(arc);
        const { C, T, Y, N } = spiralFrame(theta);
        // Rim dissolve: the reel's outer rings break up into the wire
        // instead of ending in a clean circle.
        const rr = C.length();
        const dissolve = rr > R_MAX - 2.0 ? 0.15 + 0.50 * ((rr - (R_MAX - 2.0)) / 2.0) : 0;
        for (const ro of ROW_OFFS) {
          if (dissolve > 0 && rnd() < dissolve) continue;
          const pos = C.clone()
            .addScaledVector(Y, ro + (rnd() - 0.5) * 0.03)
            .addScaledVector(N, 0.012)
            .addScaledVector(T, (rnd() - 0.5) * 0.05);
          e.set((rnd() - 0.5) * 0.10, (rnd() - 0.5) * 0.14, (rnd() - 0.5) * 0.06);
          qj.setFromEuler(e);
          const basis = new THREE.Matrix4().makeBasis(T, Y, N)
            .multiply(new THREE.Matrix4().makeRotationFromQuaternion(qj));
          m.copy(basis).setPosition(pos);
          placements.push({
            matrix: m.clone(),
            cell: [(rnd() * ATLAS_COLS) | 0, (rnd() * ATLAS_ROWS) | 0],
            group: g.index,
            phase: rnd(),
          });
        }
      }
    }
    // satellite clusters on strands beyond the rim
    const SAT_STRANDS = 11;
    for (let j = 0; j < SAT_STRANDS; j++) {
      const ang = (j / SAT_STRANDS) * Math.PI * 2 + rnd() * 0.35;
      const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      const drift = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang)).multiplyScalar((rnd() - 0.5) * 0.35);
      const clusters = 2 + ((rnd() * 3) | 0);
      const path = [dir.clone().multiplyScalar(R_MAX + 0.1).add(new THREE.Vector3(0, domeY(R_MAX) + 0.015, 0))];
      for (let cix = 0; cix < clusters; cix++) {
        const dist = R_MAX + 2.2 + cix * (2.4 + rnd() * 2.0) + rnd() * 0.6;
        const center = dir.clone().multiplyScalar(dist)
          .addScaledVector(drift, (dist - R_MAX) * 1.4)
          .add(new THREE.Vector3(0, domeY(R_MAX) + 0.02 - cix * 0.05, 0));
        path.push(center.clone().add(new THREE.Vector3(0, 0.015, 0)));
        const n = 4 + ((rnd() * 8) | 0);
        for (let k = 0; k < n; k++) {
          const pos = center.clone().add(new THREE.Vector3(
            (rnd() - 0.5) * 1.1, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 1.1
          ));
          e.set((rnd() - 0.5) * 0.15, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.15);
          qj.setFromEuler(e);
          m.makeRotationFromQuaternion(qj).setPosition(pos);
          placements.push({
            matrix: m.clone(),
            cell: [(rnd() * ATLAS_COLS) | 0, (rnd() * ATLAS_ROWS) | 0],
            group: j % GROUPS.length,
            phase: rnd(),
          });
        }
      }
      satellitePaths.push(path);
    }
  }
  const panelCount = placements.length;

  // ---- instanced mesh (added once the atlas arrives)
  const geo = new THREE.PlaneGeometry(PANEL_W, PANEL_H, 1, 1);
  const cells = new Float32Array(panelCount * 2);
  const groupsAttr = new Float32Array(panelCount);
  const phases = new Float32Array(panelCount);
  const uniforms = {
    uMap: { value: null },
    uTime: { value: 0 },
    uFocusGroup: { value: -1 },
    uFocusAmt: { value: 0 }, // Phase 2 ships idle only; focus lands in Phase 3
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide, // backs read as dim aged paper, never black wedges
    vertexShader: [
      "attribute vec2 aCell;",
      "attribute float aGroup;",
      "attribute float aPhase;",
      "uniform float uTime;",
      "uniform float uFocusGroup;",
      "uniform float uFocusAmt;",
      "varying vec2 vUv;",
      "varying float vBright;",
      "void main() {",
      "  vUv = (aCell + uv) / " + ATLAS_COLS.toFixed(1) + ";",
      "  vec4 wp = instanceMatrix * vec4(position, 1.0);",
      "  vec4 mv = modelViewMatrix * wp;",
      "  float isFocus = 1.0 - step(0.5, abs(aGroup - uFocusGroup));",
      "  float focusMul = mix(0.20, 1.28, isFocus);",
      "  float bright = mix(1.0, focusMul, uFocusAmt);",
      "  float shimmer = 0.94 + 0.06 * sin(uTime * 0.6 + aPhase * 17.0);",
      "  float depth = clamp(1.18 - (-mv.z) * 0.004, 0.68, 1.0);",
      "  vBright = bright * shimmer * depth;",
      "  gl_Position = projectionMatrix * mv;",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform sampler2D uMap;",
      "varying vec2 vUv;",
      "varying float vBright;",
      "void main() {",
      "  vec3 col = texture2D(uMap, vUv).rgb;",
      // reel palette: beads average to warm cream — saturation pulled
      // a notch toward warm luminance, overall lift for the poster's
      // bright read against black
      "  float clum = dot(col, vec3(0.3333));",
      "  col = mix(col, vec3(clum) * vec3(1.05, 1.00, 0.90), 0.10) * 1.10;",
      "  if (!gl_FrontFacing) {",
      "    float lum = dot(col, vec3(0.3333));",
      "    col = mix(vec3(lum) * vec3(0.92, 0.84, 0.70), col, 0.30) * 0.45;",
      "  }",
      "  gl_FragColor = vec4(col * vBright, 1.0);",
      "  #include <colorspace_fragment>",
      "}",
    ].join("\n"),
  });
  const mesh = new THREE.InstancedMesh(geo, mat, panelCount);
  placements.forEach((p, i) => {
    mesh.setMatrixAt(i, p.matrix);
    cells[i * 2] = p.cell[0];
    cells[i * 2 + 1] = ATLAS_ROWS - 1 - p.cell[1]; // canvas row 0 is top; texture flipY
    groupsAttr[i] = p.group;
    phases[i] = p.phase;
  });
  geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 2));
  geo.setAttribute("aGroup", new THREE.InstancedBufferAttribute(groupsAttr, 1));
  geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;

  let atlasTexture = null;
  new THREE.TextureLoader().load(
    atlasUrl,
    (tex) => {
      if (disposed) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      atlasTexture = tex;
      uniforms.uMap.value = tex;
      structure.add(mesh);
      if (frozen) renderStill();
      else if (running) renderFrame(performance.now());
    },
    undefined,
    () => {
      // Atlas failed: wire + dust still render — the band stays a
      // subtle dark texture instead of erroring. Never surfaces.
      if (frozen) renderStill();
    }
  );

  // ---- wire: the reel's red strands — a twisted double strand in
  // every ring gap with barb ticks, a rim circle, and the strands
  // carrying the satellite clusters.
  {
    const pts = [];
    const push = (a, b) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (const off of [-0.085, 0.085]) {
      let prev = null;
      const steps = 2600;
      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * THETA_MAX;
        const r = radiusAt(theta) + PITCH / 2 + off;
        const P = new THREE.Vector3(Math.cos(theta) * r, domeY(r) + 0.015, Math.sin(theta) * r);
        if (prev) push(prev, P);
        prev = P;
      }
    }
    // barb ticks: short diagonal crosses over the gap strand, ~every
    // 2.3 units of arc, spiking slightly past the band edges
    {
      const steps = 1500;
      let acc = 0;
      let prevTheta = 0;
      for (let s = 1; s <= steps; s++) {
        const theta = (s / steps) * THETA_MAX;
        acc += spiralPoint(theta).distanceTo(spiralPoint(prevTheta));
        prevTheta = theta;
        if (acc >= 2.3) {
          acc = 0;
          const r = radiusAt(theta) + PITCH / 2;
          const C = new THREE.Vector3(Math.cos(theta) * r, domeY(r) + 0.02, Math.sin(theta) * r);
          const radial = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
          const tang = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
          push(
            C.clone().addScaledVector(radial, -0.44).addScaledVector(tang, -0.16),
            C.clone().addScaledVector(radial, 0.44).addScaledVector(tang, 0.16)
          );
        }
      }
    }
    // rim circle
    {
      let prev = null;
      const steps = 220;
      const r = R_MAX + 0.62;
      for (let s = 0; s <= steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const P = new THREE.Vector3(Math.cos(a) * r, domeY(R_MAX) + 0.015, Math.sin(a) * r);
        if (prev) push(prev, P);
        prev = P;
      }
    }
    // satellite strands through their cluster anchors
    for (const path of satellitePaths) {
      for (let s = 1; s < path.length; s++) push(path[s - 1], path[s]);
      const last = path[path.length - 1], prevP = path[path.length - 2];
      push(last, last.clone().add(last.clone().sub(prevP).multiplyScalar(0.5)));
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(
      lg,
      new THREE.LineBasicMaterial({ color: 0xa8492f, transparent: true, opacity: 0.8 })
    );
    lines.frustumCulled = false;
    structure.add(lines);
  }

  // ---- dust: a faint particle field for depth
  {
    const N = 450;
    const dp = new Float32Array(N * 3);
    const rnd = mulberry32(777);
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 2.0 + Math.pow(rnd(), 0.7) * 34;
      dp[i * 3] = Math.cos(a) * r;
      dp[i * 3 + 1] = (rnd() - 0.5) * 9;
      dp[i * 3 + 2] = Math.sin(a) * r;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    const dust = new THREE.Points(
      dg,
      new THREE.PointsMaterial({ color: 0x93a3b8, size: 0.09, transparent: true, opacity: 0.22, depthWrite: false })
    );
    dust.frustumCulled = false;
    structure.add(dust);
  }

  // ---- sizing
  function layout() {
    const w = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight);
    camera.aspect = w / h;
    // Narrow (portrait) viewports get a wider lens so the disc's
    // center and inner rings still compose behind the title instead
    // of cropping to a wall of covers.
    camera.fov = camera.aspect < 1 ? 58 : 42;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  layout();

  // ---- loop: ~30 fps cap + sustained-low-fps auto-degrade
  const FRAME_MS = 1000 / 30;
  let raf = 0;
  let running = false;
  let disposed = false;
  let degraded = false;
  let sceneTime = 2.2; // start at a settled, pleasing rotation
  let lastRender = 0;
  let loopStart = 0;
  let fpsWindowStart = 0;
  let fpsWindowFrames = 0;

  function renderFrame(now) {
    // Scene time advances by wall time since the last RENDERED frame,
    // so the ~30 fps cap slows the frame rate, never the motion speed.
    const dt = lastRender ? Math.min(0.1, (now - lastRender) / 1000) : 0.016;
    sceneTime += dt;
    uniforms.uTime.value = sceneTime;
    structure.rotation.y = sceneTime * 0.05;
    structure.position.y = Math.sin(sceneTime * 0.09) * 0.12;
    camera.lookAt(CAM_TGT);
    renderer.render(scene, camera);
    lastRender = now;
  }

  function tick(now) {
    if (!running || disposed) return;
    raf = requestAnimationFrame(tick);
    if (lastRender && now - lastRender < FRAME_MS - 1) return;
    renderFrame(now);
    // Auto-degrade (plan section 5): after a grace period, if the
    // sustained rate is under ~12 fps the device is telling us it
    // cannot carry the loop — park on the current frame. The still
    // image remains; the page keeps its CPU.
    if (!fpsWindowStart) { fpsWindowStart = now; loopStart = now; }
    fpsWindowFrames++;
    const winMs = now - fpsWindowStart;
    if (winMs >= 4000) {
      const fps = (fpsWindowFrames * 1000) / winMs;
      if (now - loopStart > 6000 && fps < 12) {
        degraded = true;
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      fpsWindowStart = now;
      fpsWindowFrames = 0;
    }
  }

  function start() {
    if (frozen || disposed || degraded || running) return;
    running = true;
    lastRender = 0;
    fpsWindowStart = 0;
    fpsWindowFrames = 0;
    loopStart = 0;
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function renderStill() {
    if (disposed) return;
    // One frame at the settled rotation — the frozen fallback's image.
    uniforms.uTime.value = sceneTime;
    structure.rotation.y = sceneTime * 0.05;
    structure.position.y = Math.sin(sceneTime * 0.09) * 0.12;
    camera.lookAt(CAM_TGT);
    renderer.render(scene, camera);
  }

  // Debounced resize: re-layout only (positions are baked; nothing is
  // regenerated), and repaint the still if we are parked.
  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (disposed) return;
      layout();
      if (frozen || degraded || !running) renderStill();
    }, 150);
  };
  window.addEventListener("resize", onResize);

  if (frozen) {
    // Wire/dust paint immediately; the panel mesh joins on atlas load
    // (its callback re-renders the still).
    renderStill();
  }

  return {
    start,
    stop,
    renderStill,
    isDegraded: () => degraded,
    dispose() {
      disposed = true;
      stop();
      window.removeEventListener("resize", onResize);
      window.clearTimeout(resizeTimer);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((mm) => mm.dispose());
        }
      });
      if (atlasTexture) atlasTexture.dispose();
      try { renderer.dispose(); } catch (e) {}
      try { renderer.forceContextLoss(); } catch (e) {}
    },
  };
}
