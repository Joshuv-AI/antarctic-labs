// Helix scene — the Tower of Babel landing's dark hero band background:
// a 3D helix of book-cover TUBES in black space. Two spirals at once:
//   Spiral A (coil path): a fat tube winds around a vertical axis,
//     descending like a coiled hose / spring.
//   Spiral B (tube surface): covers tile AROUND the tube's circular
//     cross-section — top, front and underside all carry covers — so
//     each band reads as a rope of books with real round thickness.
// Bands are the real top-level collections, one contiguous segment of
// the coil each with bare-wire gaps between, panel counts mapped from
// the REAL collection sizes by sqrt compression (LAW and PAPERS use
// the true live totals). EVERY collection lives inside the spiral —
// the smallest (FOLKLORE) is a short partial-turn band segment at the
// top of the stack (Joshua 2026-11-12: no library pieces may float
// outside the spiral; the earlier wire-cluster satellites read as
// random debris on his phone and were removed). Floating HTML labels
// in the reel's style (big thin caps name, true count beneath) ride
// beside their bands.
// Tube rebuild (2026-11-12, bench: helix-bench RESULTS.md "TUBE
// REBUILD" — Joshua's morning verdict on the shipped flat disc: the
// reel is tubes, not rings in a plane; plan Amendment C).
//
// Rendering economy: ONE InstancedMesh for all 15,006 panels, ONE
// baked texture atlas (/helix-atlas.webp, 4096² WebP), the whole
// structure rotating as a single group. Four draw calls total:
// panels, red wire, grey threads, dust.
//
// Sharpness (Joshua 2026-11-12): the 4096² atlas is sampled with the
// GPU's max anisotropy + full mip chain, and render resolution runs a
// DPR ladder — min(devicePixelRatio, 2.0) by default, stepping down
// 2.0 → 1.5 → 1.25 → 1.0 under sustained low fps (never up).
//
// Production lifecycle (unchanged from the Phase 2 ship): idle state
// only (state binding is a later phase), ~30 fps cap, sustained-low-
// fps auto-degrade to a frozen frame, full disposal. This module is
// loaded ONLY via dynamic import() from components/HelixCanvas.jsx,
// deferred until after first paint + the Tower boot overlay — three.js
// and this scene never ride the page's initial chunks and never
// compete with the catalog stream's startup.

import * as THREE from "three";

const ATLAS_COLS = 16;
const ATLAS_ROWS = 16;

// ------------------------------------------------------------------ collections
// Real live totals (2026-11-12). The small-collection split of the
// remaining ~150,516 is illustrative; LAW / PAPERS are the true counts.
const BANDS = [
  { name: "LAW", count: 1277197 },
  { name: "PAPERS", count: 1130210 },
  { name: "RELIGION", count: 38000 },
  { name: "DECLASSIFIED", count: 34000 },
  { name: "HISTORY", count: 22000 },
  { name: "LITERATURE", count: 19000 },
  { name: "SCIENCE", count: 15000 },
  { name: "PHILOSOPHY", count: 9500 },
  { name: "PODCASTS", count: 8000 },
  { name: "FOLKLORE", count: 5016 },
];
const BAND_PANEL_TARGET = 15006; // all panels live in band segments

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
const fmt = (n) => n.toLocaleString("en-US");

// ------------------------------------------------------------------ tube helix
// Centerline: circle of radius R around the vertical axis, descending
// PITCH per turn. Panels sit on the tube surface (radius TUBE_R) at
// ROWS angular steps around the cross-section.
const R = 34;                    // centerline radius — the reel's
                                 // proportion (R/tube ~17:1): the big
                                 // bands are 3–4-turn rings and the
                                 // camera sits in the near arc's
                                 // neighborhood, so ropes CROSS the
                                 // frame and far arcs layer behind
                                 // across the bore
const PITCH = 3.4;               // descent per turn
const TUBE_R = 1.0;              // tube radius (0.29 × PITCH — fatter
                                 // merged the turns into a solid braid;
                                 // the reel keeps a clear black groove
                                 // between turns, so the groove wins)
const ROWS = 6;                  // cover rows around the cross-section
const RISE = PITCH / (Math.PI * 2);   // y per radian of coil angle
const DS = Math.hypot(R, RISE);       // centerline arc per radian
const PANEL_W = 0.78;            // along the tube
const PANEL_H = 0.94;            // around the cross-section
const STEP = 0.84;               // station spacing along the tube
const DTHETA = STEP / DS;
const GAP_DTHETA = Math.PI * 2 * 0.5; // bare-wire advance between
                                 // bands: 0.5 of a turn of red strand +
                                 // stitch threads separates each band

// sqrt-compressed panel allocation (module-level, deterministic)
const sqrtSum = BANDS.reduce((s, g) => s + Math.sqrt(g.count), 0);
BANDS.forEach((g, gi) => {
  g.sqrt = Math.sqrt(g.count);
  g.index = gi;
  g.stations = Math.max(8, Math.round((BAND_PANEL_TARGET * (g.sqrt / sqrtSum)) / ROWS));
});
const totalTheta =
  BANDS.reduce((s, g) => s + g.stations * DTHETA, 0) + (BANDS.length - 1) * GAP_DTHETA;
const Y_TOP = (totalTheta * RISE) / 2;

function centerAt(theta, out) {
  return out.set(Math.cos(theta) * R, Y_TOP - RISE * theta, Math.sin(theta) * R);
}
// Frame at coil angle theta: T = centerline tangent; e1/e2 span the
// cross-section plane (e1 = axis-radial made perpendicular to T).
function frameAt(theta) {
  const C = centerAt(theta, new THREE.Vector3());
  const T = new THREE.Vector3(-R * Math.sin(theta), -RISE, R * Math.cos(theta)).normalize();
  const a = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const e1 = a.addScaledVector(T, -a.dot(T)).normalize();
  const e2 = new THREE.Vector3().crossVectors(T, e1);
  return { C, T, e1, e2 };
}
function surfacePoint(theta, phi, out) {
  const { C, e1, e2 } = frameAt(theta);
  return out
    .copy(C)
    .addScaledVector(e1, Math.cos(phi) * TUBE_R)
    .addScaledVector(e2, Math.sin(phi) * TUBE_R);
}

// Create the scene on `canvas`. opts:
//   atlasUrl — the baked atlas asset (default "/helix-atlas.webp")
//   frozen   — render one still frame, never run the loop
//   onError  — called if the WebGL context cannot be created at all
//   labelsEl — optional overlay element (inside the hero band) the
//              scene fills with the floating band labels; positions
//              are computed in the layer's own box (document space),
//              clamped to it, so the labels scroll with the hero
//   getAvoidRects — optional () => [{x, y, w, h}] in DOCUMENT coords:
//              hero content blocks (title/intro) a band label must
//              not sit under; refreshed on layout
// Returns a controller { start, stop, renderStill, dispose, isDegraded }
// or null when the renderer could not be created.
export function createHelixScene(canvas, opts = {}) {
  const atlasUrl = opts.atlasUrl || "/helix-atlas.webp";
  const frozen = !!opts.frozen;
  const onError = typeof opts.onError === "function" ? opts.onError : () => {};
  const labelsEl = opts.labelsEl || null;
  const getAvoidRects = typeof opts.getAvoidRects === "function" ? opts.getAvoidRects : null;
  let avoidRects = [];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      // No antialiasing on small screens (Phase 2 safety wiring);
      // desktop-class viewports keep it — four draw calls either way.
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

  // ---- sizing + DPR ladder
  // Render resolution: default tier min(devicePixelRatio, 2.0); the
  // auto-degrade ladder steps the cap 2.0 → 1.5 → 1.25 → 1.0 under
  // sustained low fps (never up). Backing store always matches the
  // canvas's CSS size × effective DPR.
  const DPR_LADDER = [2.0, 1.5, 1.25, 1.0];
  let dprTier = 0;
  let viewW = 1;
  let viewH = 1;
  function containerSize() {
    const w = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight);
    return { w, h };
  }
  function applyDpr() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_LADDER[dprTier]));
    renderer.setSize(viewW, viewH, false);
  }

  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  // Idle framing (the bench's oblique hero state): camera ~62 from the
  // axis at ~15° elevation — inside the near arc's neighborhood, so the
  // LAW and PAPERS ropes cross the frame foreground while the smaller
  // bands and far arcs layer behind/above across the bore, whose calm
  // black center sits behind the hero title zone.
  const CAM_POS = new THREE.Vector3(38, 24, 46);
  const CAM_TGT = new THREE.Vector3(0, 1, 0);
  camera.position.copy(CAM_POS);
  camera.lookAt(CAM_TGT);

  const structure = new THREE.Group();
  scene.add(structure);

  // ---- placements (baked instance matrices; runs once at init)
  const placements = []; // {matrix, cell:[c,r], group, phase}
  const gapRanges = [];  // [theta0, theta1] bare-wire gaps between bands
  {
    const rnd = mulberry32(987123);
    const m = new THREE.Matrix4();
    const qj = new THREE.Quaternion();
    const e = new THREE.Euler();
    let theta = 0;

    // Placement order: the reversed list puts PODCASTS at the top of
    // the stack and LAW at the bottom, so the low hero camera sees
    // the biggest rope fat in the foreground with smaller bands
    // receding above it — the reel side frame's composition.
    const order = [...BANDS].reverse();
    order.forEach((g, gi) => {
      g.thetaStart = theta;
      let count = 0;
      for (let s = 0; s < g.stations; s++) {
        const th = theta + s * DTHETA;
        const { C, T, e1, e2 } = frameAt(th);
        const brick = (s % 2) * 0.5; // brick offset, like the reel's tiling
        // Band-end taper: the first/last few stations shrink toward
        // the centerline so a band's end closes instead of showing an
        // open pipe mouth.
        const taper = Math.min(1, (s + 1) / 5, (g.stations - s) / 5);
        const tScale = 0.25 + 0.75 * taper;
        for (let j = 0; j < ROWS; j++) {
          const phi = ((j + brick) / ROWS) * Math.PI * 2;
          const n = e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2, Math.sin(phi));
          const Y = new THREE.Vector3().crossVectors(n, T); // around-circumference dir
          const pos = C.clone()
            .addScaledVector(n, TUBE_R * (0.35 + 0.65 * taper))
            .addScaledVector(T, (rnd() - 0.5) * 0.04)
            .addScaledVector(Y, (rnd() - 0.5) * 0.04);
          e.set((rnd() - 0.5) * 0.07, (rnd() - 0.5) * 0.09, (rnd() - 0.5) * 0.05);
          qj.setFromEuler(e);
          const basis = new THREE.Matrix4().makeBasis(T, Y, n)
            .multiply(new THREE.Matrix4().makeRotationFromQuaternion(qj))
            .multiply(new THREE.Matrix4().makeScale(tScale, tScale, tScale));
          m.copy(basis).setPosition(pos);
          placements.push({
            matrix: m.clone(),
            cell: [(rnd() * ATLAS_COLS) | 0, (rnd() * ATLAS_ROWS) | 0],
            group: g.index,
            phase: rnd(),
          });
          count++;
        }
      }
      g.panels = count;
      theta += g.stations * DTHETA;
      g.thetaEnd = theta;
      g.yMid = Y_TOP - RISE * ((g.thetaStart + g.thetaEnd) / 2);
      if (gi < order.length - 1) {
        gapRanges.push([theta, theta + GAP_DTHETA]);
        theta += GAP_DTHETA;
      }
    });

    // No satellite field (removed 2026-11-12, Joshua): FOLKLORE is
    // placed above as an ordinary band segment of the coil — every
    // library panel in the scene sits on the tube, inside the spiral.
  }
  const panelCount = placements.length;

  // ---- instanced mesh
  // Panel geometry: a plane bent around the tube cross-section so each
  // cover hugs the rope surface (bend axis = panel width / tube tangent).
  function buildPanelGeometry() {
    const geo = new THREE.PlaneGeometry(PANEL_W, PANEL_H, 1, 6);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const a = y / TUBE_R;
      p.setY(i, Math.sin(a) * TUBE_R);
      p.setZ(i, (Math.cos(a) - 1) * TUBE_R);
    }
    return geo;
  }
  const geo = buildPanelGeometry();
  const cells = new Float32Array(panelCount * 2);
  const groupsAttr = new Float32Array(panelCount);
  const phases = new Float32Array(panelCount);
  const uniforms = {
    uMap: { value: null },
    uTime: { value: 0 },
    uFocusGroup: { value: BANDS[0].index }, // LAW; amount stays 0 in
    uFocusAmt: { value: 0 },                // idle (focus is a later phase)
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
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
      "  float clum = dot(col, vec3(0.3333));",
      "  col = mix(col, vec3(clum) * vec3(1.05, 1.00, 0.90), 0.10) * 1.02;",
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

  let disposed = false;
  let atlasTexture = null;
  new THREE.TextureLoader().load(
    atlasUrl,
    (tex) => {
      if (disposed) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      // Oblique angles are where anisotropy matters: use the GPU max,
      // full mip chain, trilinear sampling.
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      atlasTexture = tex;
      uniforms.uMap.value = tex;
      structure.add(mesh);
      // If the loop already parked (degraded) or never started, the
      // frame on screen is wire-only — repaint it now the panels exist,
      // so a slow atlas decode can never strand the page on bare wire.
      if (frozen || degraded || !running) renderStill();
      else if (running) renderFrame(performance.now());
    },
    undefined,
    () => {
      // Atlas failed: wire + dust still render — the band stays a
      // subtle dark texture instead of erroring. Never surfaces.
      if (frozen) renderStill();
    }
  );

  // ---- wire + threads: two red strands spiralling around the tube
  // along the whole coil, bare strands through the inter-band gaps
  // with faint grey stitch threads, and sparse long threads across
  // the structure (the reel's web between bands). All of it follows
  // the coil — nothing floats free of the spiral.
  {
    const red = [];
    const grey = [];
    const pushR = (a, b) => red.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const pushG = (a, b) => grey.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const tmp = new THREE.Vector3();

    for (const phase of [0, Math.PI]) {
      let prev = null;
      const steps = 3600;
      for (let s = 0; s <= steps; s++) {
        const th = (s / steps) * totalTheta;
        const P = surfacePoint(th, th * 2.2 + phase, tmp).clone();
        P.add(new THREE.Vector3(P.x, 0, P.z).normalize().multiplyScalar(0.05));
        if (prev) pushR(prev, P);
        prev = P;
      }
    }
    for (const [t0, t1] of gapRanges) {
      for (const off of [-0.14, 0.14]) {
        let prev = null;
        const steps = 12;
        for (let s = 0; s <= steps; s++) {
          const th = t0 + ((t1 - t0) * s) / steps;
          const { C, e1 } = frameAt(th);
          const P = C.clone().addScaledVector(e1, off);
          if (prev) pushR(prev, P);
          prev = P;
        }
      }
      const rndG = mulberry32(4000 + ((t0 * 100) | 0));
      for (let k = 0; k < 12; k++) {
        const a = surfacePoint(t0 - 0.4 - rndG() * 1.4, rndG() * Math.PI * 2, new THREE.Vector3());
        const b = surfacePoint(t1 + 0.4 + rndG() * 1.4, rndG() * Math.PI * 2, new THREE.Vector3());
        pushG(a, b);
      }
    }
    // No free-floating field strands above the stack (removed with
    // the satellites, 2026-11-12): the only wire in the scene follows
    // the coil — the two spiral strands along the tube and the bare
    // strands through the inter-band gaps above.
    {
      const rndW = mulberry32(31337);
      const posOf = (i) => {
        const el = placements[i].matrix.elements;
        return new THREE.Vector3(el[12], el[13], el[14]);
      };
      for (let k = 0; k < 120; k++) {
        const i = (rndW() * placements.length) | 0;
        let j = (rndW() * placements.length) | 0;
        if (Math.abs(i - j) < 500) j = (j + 700) % placements.length;
        pushG(posOf(i), posOf(j));
      }
    }
    const mkLines = (arr, color, opacity) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      const l = new THREE.LineSegments(
        g,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
      );
      l.frustumCulled = false;
      structure.add(l);
      return l;
    };
    mkLines(red, 0xa8492f, 0.55);
    mkLines(grey, 0x9aa0a8, 0.07);
  }

  // ---- dust: a faint particle field for depth (atmosphere only —
  // kept very faint and star-like so it can never read as debris)
  {
    const N = 420;
    const dp = new Float32Array(N * 3);
    const rnd = mulberry32(777);
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 2.0 + Math.pow(rnd(), 0.7) * (R + 9);
      dp[i * 3] = Math.cos(a) * r;
      dp[i * 3 + 1] = (rnd() - 0.5) * (2 * Y_TOP + 16);
      dp[i * 3 + 2] = Math.sin(a) * r;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    const dust = new THREE.Points(
      dg,
      new THREE.PointsMaterial({ color: 0x93a3b8, size: 0.09, transparent: true, opacity: 0.11, depthWrite: false })
    );
    dust.frustumCulled = false;
    structure.add(dust);
  }

  // ---- floating labels (HTML overlay, reel style)
  // Big thin all-caps name, true count beneath. Each band label rides
  // its band's height at the near rim — projected from 3D every frame
  // — sitting in the black outside the silhouette, never over covers.
  // HERO CLAMPING (integration polish): positions are computed in the
  // hero layer's own box (the hero band window, shorter than the bench
  // frame) and clamped so each visible band's name + count stay fully
  // inside the band; a band whose height falls outside the window has
  // its label hidden rather than pinned to an edge it doesn't occupy.
  const bandLabels = [];
  if (labelsEl) {
    BANDS.forEach((g, i) => {
      const el = document.createElement("div");
      el.style.opacity = "0"; // until the first updateLabels positions it
      el.className = "tower-helix-band-label " + (i % 2 ? "tower-helix-lft" : "tower-helix-rgt");
      const nameSpan = document.createElement("span");
      nameSpan.className = "tower-helix-label-name";
      nameSpan.textContent = g.name;
      const countSpan = document.createElement("span");
      countSpan.className = "tower-helix-label-count";
      countSpan.textContent = fmt(g.count);
      el.appendChild(nameSpan);
      el.appendChild(countSpan);
      labelsEl.appendChild(el);
      bandLabels.push({
        el,
        yMid: g.yMid,
        side: i % 2 ? -1 : 1,
        group: g.index,
        basePx: 15 + 37 * (g.sqrt / BANDS[0].sqrt),
        w: 0,
        h: 0,
      });
    });
    // Every band — FOLKLORE included — gets the same band label;
    // the old satellite tag labels are gone with the satellites.
  }

  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _scrA = { x: 0, y: 0, behind: false };
  const _scrB = { x: 0, y: 0, behind: false };
  function projectToScreen(v3, out) {
    _v3.copy(v3).project(camera);
    out.x = (_v3.x * 0.5 + 0.5) * viewW;
    out.y = (-_v3.y * 0.5 + 0.5) * viewH;
    out.behind = _v3.z > 1;
    return out;
  }
  // Label coordinate space (FIX PASS, Joshua's scroll recording,
  // 2026-11-12): labels are placed in the hero layer's own box —
  // DOCUMENT space. Projections land in viewport coordinates (the
  // canvas is a fixed layer), so they are converted with the layer's
  // DOCUMENT offset, which is invariant under scroll and cached in
  // layout(). The shipped build converted with the layer's LIVE
  // viewport rect: the offset grew with scrollY, exactly cancelling
  // the layer's scroll movement, so the labels stayed pinned to the
  // viewport while the page scrolled under them. In document space
  // the labels belong to the hero region of the page: they track
  // their bands while the hero is in view and scroll away with it,
  // and the layer's overflow:hidden box guarantees none can show
  // below the hero. Caching the offset also keeps the render loop
  // free of layout reads (a per-frame getBoundingClientRect during
  // scroll can force synchronous layout — a stutter source).
  let labelDocX = 0;
  let labelDocY = 0;
  let labelW = 0;
  let labelH = 0;
  function updateLabels() {
    if (!labelsEl) return;
    const focusAmt = uniforms.uFocusAmt.value;
    const offX = -labelDocX;
    const offY = -labelDocY;
    const W = labelW || viewW;
    const H = labelH || viewH;
    const e = camera.matrixWorld.elements;
    let rx = e[0], rz = e[2];
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    const placedBoxes = [];
    for (const L of bandLabels) {
      const axisW = structure.localToWorld(_v2.set(0, L.yMid, 0));
      const axisScr = projectToScreen(axisW, _scrA);
      axisScr.x += offX;
      axisScr.y += offY;
      if (axisScr.behind || axisScr.y < -70 || axisScr.y > H + 70) {
        L.el.style.opacity = "0";
        continue;
      }
      const rimW = _v1.set(
        axisW.x + rx * L.side * (R + TUBE_R + 1.7),
        axisW.y,
        axisW.z + rz * L.side * (R + TUBE_R + 1.7)
      );
      const rimScr = projectToScreen(rimW, _scrB);
      rimScr.x += offX;
      rimScr.y += offY;
      if (rimScr.behind) {
        L.el.style.opacity = "0";
        continue;
      }
      if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
      // The label's box once placed at its band's height: never sit
      // under the hero's own text or on top of another label. Block
      // on a SUBSTANTIAL overlap only — content blocks are near-
      // full-width boxes whose edges carry no glyphs, so a few px of
      // edge contact is not a collision. If the band's own height is
      // blocked, nudge vertically to the nearest clear spot (labels
      // float in the black near their band, reel-style); hide only
      // when no clear spot exists inside the band window.
      let anchorX = rimScr.x;
      if (L.side > 0) anchorX = Math.min(Math.max(anchorX, 12), Math.max(12, W - L.w - 26));
      else anchorX = Math.max(Math.min(anchorX, W - 12), Math.min(W - 12, L.w + 26));
      const anchorY = Math.min(Math.max(axisScr.y, L.h / 2 + 8), Math.max(L.h / 2 + 8, H - L.h / 2 - 8));
      const boxX = L.side > 0 ? anchorX + 16 : anchorX - 16 - L.w;
      const hitsAvoid = (by) => {
        for (const a of avoidRects) {
          // avoid rects arrive in document coords; label boxes are
          // in layer coords — convert by the layer's document offset
          const ax = a.x - labelDocX;
          const ay = a.y - labelDocY;
          const iw = Math.min(boxX + L.w, ax + a.w + 2) - Math.max(boxX, ax - 2);
          const ih = Math.min(by + L.h, ay + a.h + 2) - Math.max(by, ay - 2);
          if (iw > 0 && ih > 0 && iw * ih > 0.18 * L.w * L.h) return true;
        }
        return false;
      };
      const hitsPlaced = (by) => {
        for (const p of placedBoxes) {
          const iw = Math.min(boxX + L.w, p.x + p.w) - Math.max(boxX, p.x);
          const ih = Math.min(by + L.h, p.y + p.h) - Math.max(by, p.y);
          if (iw > 6 && ih > 4) return true;
        }
        return false;
      };
      let placeY = anchorY;
      if (hitsAvoid(placeY - L.h / 2) || hitsPlaced(placeY - L.h / 2)) {
        let found = false;
        for (const dy of [30, -30, 60, -60, 90, -90, 120, -120]) {
          const ny = anchorY + dy;
          if (ny - L.h / 2 < 8 || ny + L.h / 2 > H - 8) continue;
          if (hitsAvoid(ny - L.h / 2) || hitsPlaced(ny - L.h / 2)) continue;
          placeY = ny;
          found = true;
          break;
        }
        if (!found) {
          L.el.style.opacity = "0";
          continue;
        }
      }
      placedBoxes.push({ x: boxX, y: placeY - L.h / 2, w: L.w, h: L.h });
      const isFocus = L.group === uniforms.uFocusGroup.value;
      const dim = 1 - focusAmt * (isFocus ? 0 : 0.68);
      L.el.style.opacity = String(0.96 * dim);
      // Place at the clamped anchor: the whole label block (name +
      // count) stays inside the band window; horizontally the label
      // extends inward from its rim anchor, vertically it rides its
      // band's screen height (or the nearest clear nudge).
      L.el.style.transform =
        "translate3d(" + anchorX.toFixed(1) + "px," + placeY.toFixed(1) + "px,0)" +
        (L.side > 0 ? " translate(16px,-50%)" : " translate(calc(-100% - 16px),-50%)");
    }
  }

  // ---- sizing
  function layout() {
    const { w, h } = containerSize();
    viewW = w;
    viewH = h;
    camera.aspect = w / h;
    // Narrow (portrait) viewports get a wider lens so the bore and
    // the near ropes still compose behind the title instead of
    // cropping to a wall of covers.
    camera.fov = camera.aspect < 1 ? 55 : 40;
    // Portrait frames also sit a little farther out, so more of the
    // stack's height (and its labels) fits the tall band window.
    const dist = camera.aspect < 0.75 ? 1.32 : 1.0;
    camera.position.copy(CAM_POS).multiplyScalar(dist);
    camera.lookAt(CAM_TGT);
    camera.updateProjectionMatrix();
    applyDpr();
    // Label scale follows the band width: full size on desktop,
    // shrinking toward phone widths so name + count stay inside.
    const labelScale = Math.min(1, Math.max(0.45, viewW / 1400));
    for (const L of bandLabels) {
      L.el.style.fontSize = Math.round(L.basePx * labelScale) + "px";
      L.w = 0; // re-measure after the size change
    }
    // Cache the labels layer's document offset + box (scroll-
    // invariant): per-frame label updates then need no layout reads.
    if (labelsEl) {
      const lr = labelsEl.getBoundingClientRect();
      labelDocX = lr.left + window.scrollX;
      labelDocY = lr.top + window.scrollY;
      labelW = labelsEl.clientWidth || 0;
      labelH = labelsEl.clientHeight || 0;
    }
    // Refresh the hero content blocks labels must not sit under.
    if (getAvoidRects) {
      try {
        avoidRects = getAvoidRects() || [];
      } catch (e) {
        avoidRects = [];
      }
    }
  }
  layout();

  // ---- loop: ~30 fps cap + DPR ladder + sustained-low-fps park
  const FRAME_MS = 1000 / 30;
  let raf = 0;
  let running = false;
  let degraded = false;
  let sceneTime = 2.2; // start at a settled, pleasing rotation
  let lastRender = 0;
  let loopStart = 0;
  let fpsWindowStart = 0;
  let fpsWindowFrames = 0;
  let lowDprWindows = 0;

  function renderFrame(now) {
    // Scene time advances by wall time since the last RENDERED frame,
    // so the ~30 fps cap slows the frame rate, never the motion speed.
    const dt = lastRender ? Math.min(0.1, (now - lastRender) / 1000) : 0.016;
    sceneTime += dt;
    uniforms.uTime.value = sceneTime;
    structure.rotation.y = sceneTime * 0.045;
    structure.position.y = Math.sin(sceneTime * 0.07) * 0.9;
    camera.lookAt(CAM_TGT);
    renderer.render(scene, camera);
    updateLabels();
    lastRender = now;
  }

  function tick(now) {
    if (!running || disposed) return;
    raf = requestAnimationFrame(tick);
    if (lastRender && now - lastRender < FRAME_MS - 1) return;
    renderFrame(now);
    if (!fpsWindowStart) { fpsWindowStart = now; loopStart = now; }
    fpsWindowFrames++;
    const winMs = now - fpsWindowStart;
    if (winMs >= 4000) {
      // Keep the label avoid-rects current (webfont swaps can move
      // the hero text after init).
      if (getAvoidRects) {
        try {
          avoidRects = getAvoidRects() || avoidRects;
        } catch (e) { /* keep the previous rects */ }
      }
      const fps = (fpsWindowFrames * 1000) / winMs;
      if (now - loopStart > 6000) {
        // Park (Phase 2 safety): sustained under ~12 fps means the
        // device cannot carry the loop — freeze on the current frame.
        if (fps < 12) {
          degraded = true;
          running = false;
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
          return;
        }
        // DPR ladder (tube scene sharpness spec): the render loop is
        // capped at ~30 fps, so a window under ~24 fps means frames
        // are slipping at the current resolution — after two
        // consecutive such windows (8 s sustained), step the cap down
        // one rung, never up. A step is a canvas resize + a visible
        // sharpness jump, so it never fires mid-scroll: while the
        // user is scrolling it is held (counter parked at threshold)
        // until the scroll settles — no resolution stepping or
        // resize hitches under the finger (FIX PASS 2026-11-12).
        if (fps < 24 && dprTier < DPR_LADDER.length - 1) {
          lowDprWindows++;
          if (lowDprWindows >= 2) {
            if (now - lastScrollAt < 700) {
              lowDprWindows = 2;
            } else {
              dprTier++;
              lowDprWindows = 0;
              applyDpr();
            }
          }
        } else {
          lowDprWindows = 0;
        }
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
    lowDprWindows = 0;
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
    structure.rotation.y = sceneTime * 0.045;
    structure.position.y = Math.sin(sceneTime * 0.07) * 0.9;
    camera.lookAt(CAM_TGT);
    renderer.render(scene, camera);
    updateLabels();
  }

  // Scroll activity marker (passive listener, timestamp only — no
  // layout reads, no work): the DPR ladder consults it so resolution
  // never steps mid-scroll.
  let lastScrollAt = -1e9;
  const onScrollMark = () => { lastScrollAt = performance.now(); };
  window.addEventListener("scroll", onScrollMark, { passive: true });

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
      window.removeEventListener("scroll", onScrollMark);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(resizeTimer);
      if (labelsEl) labelsEl.innerHTML = "";
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
