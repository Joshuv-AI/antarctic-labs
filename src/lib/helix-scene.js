// Helix scene — the Tower of Babel page's full-page background: a 3D
// helix of book-cover TUBES in black space, after Evgeniy Afonin's
// "Forbidden Library" reel. Two spirals at once:
//   Spiral A (coil path): a fat tube winds around a vertical axis.
//   Spiral B (tube surface): covers tile AROUND the tube's circular
//     cross-section, so each band reads as a rope of books.
// Bands are the top-level collections, one contiguous segment of the
// coil each with bare-wire gaps between, panel counts mapped from the
// REAL collection sizes by sqrt compression.
//
// SHIP 2 (2026-11-12, plan Amendments H–M): the scene is now bound to
// page state and re-framed to the reel's proportions:
//  - Framing: camera FARTHER OUT and LOWER, coil STRETCHED — pitch
//    7.4 against a 0.85 tube radius, so bands read as thin ribbons
//    separated by wide black gaps with the barbed wire plainly
//    visible between turns (~15 turns in frame).
//  - Opening: the camera starts TOP-DOWN over the bore (the reel's
//    opening, and the page's loading state) and tilts into the side
//    framing only when the page's boot completes — the animation
//    clock starts at boot-end, never before (Amendment M). Before
//    boot, at most a motionless top-down still renders.
//  - Idle drift: the idle camera breathes (slow distance / elevation
//    oscillation) instead of sitting on a turntable.
//  - Depth falloff: distant coils dim into the black in the panel
//    shader; lines/dust take scene fog.
//  - Labels RIDE THE COIL: each band label anchors to a fixed angle
//    on its band and rotates with the structure, fading as its anchor
//    sweeps to the far side. Big collections get large labels, small
//    ones tiny tags; when two large labels collide on the front
//    sweep, the larger collection wins and the smaller fades.
//  - Navigation binding (one damped rig, latest-wins, retarget
//    mid-flight — never queued keyframes, never a snap):
//      focus(groups)  — camera flies to frame the bands, they
//        brighten, the rest dim (per-group weights in an instanced
//        attribute, ramped by a single damped uniform).
//      lift(items)    — up to 50 result works rise OUT of the coil on
//        thread lines into a tiered pyramid above the stack (the
//        reel's ending); camera eases to frame the display.
//      idle           — everything damps back to the idle framing.
//  - Wire carries barb ticks; grey stitch threads slightly raised.
//
// Rendering economy: ONE InstancedMesh for all panels + one baked
// atlas (4096² WebP); lift tiles are a small pooled mesh set with a
// dynamic typeset canvas atlas (the results grid's own covers are
// typeset plates — the tiles speak the same language). ~30 fps cap,
// DPR ladder (steps deferred while scrolling), sustained-low-fps
// park, full disposal. Loaded ONLY via dynamic import() from
// components/HelixCanvas.jsx, kicked off at mount (Amendment M: the
// scene and atlas load DURING the page boot; motion waits for it).

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
// Label anchor positions along each band (fraction of its theta
// span), staggered at build time so the big labels rarely sweep the
// front together (Amendment L collision rule).
const ANCHOR_FRAC = [0.34, 0.66, 0.48, 0.78, 0.26, 0.58, 0.84, 0.40, 0.62, 0.50];
const LARGE_LABEL_MIN = 30000; // count at/above which a band gets the
                               // large label treatment (else tiny tag)
// Per-band color temperature (Amendment K stretch): subtle RGB
// multipliers echoing the reel's per-band palette variety.
const BAND_TINTS = [
  [1.03, 1.05, 1.12], // LAW — cool slate
  [1.10, 1.04, 0.92], // PAPERS — warm paper
  [1.10, 0.98, 0.82], // RELIGION — amber
  [1.08, 0.94, 0.90], // DECLASSIFIED — red-grey
  [1.08, 1.00, 0.86], // HISTORY — sepia
  [0.94, 1.04, 1.02], // LITERATURE — teal-grey
  [0.92, 1.02, 1.10], // SCIENCE — pale cyan
  [1.02, 0.96, 1.10], // PHILOSOPHY — violet-grey
  [1.10, 0.94, 0.96], // PODCASTS — coral-grey
  [0.96, 1.08, 0.94], // FOLKLORE — green-grey
];
// Tile plate colors by catalog lane (lift display).
const LANE_PLATE = {
  LAW: "#3d4a5c", PAPERS: "#6b5b3e", DECLASSIFIED: "#5c3d3d",
  BOOKS: "#4a5d43", REFERENCE: "#555048", DOCUMENTS: "#4c4a55",
  PODCASTS: "#66455a",
};

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
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ tube helix
// Centerline: circle of radius R around the vertical axis, descending
// PITCH per turn. Panels sit on the tube surface (radius TUBE_R) at
// ROWS angular steps around the cross-section. SHIP 2 proportions:
// PITCH 7.4 vs tube diameter 1.7 — the groove between turns is ~5.7
// units of black with the wire in it, against the ship-1 build's 1.4.
const R = 34;
const PITCH = 7.4;
const TUBE_R = 0.85;
const ROWS = 6;
const RISE = PITCH / (Math.PI * 2);
const DS = Math.hypot(R, RISE);
const PANEL_W = 0.78;
const PANEL_H = 0.80;
const STEP = 0.84;
const DTHETA = STEP / DS;
const GAP_DTHETA = Math.PI * 2 * 0.65; // bare-wire advance between bands

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
//   frozen   — render one still frame (top-down), never run the loop
//   onError  — called if the WebGL context cannot be created at all
//   labelsEl — hero-confined overlay the scene fills with band labels
//   getAvoidRects — () => [{x, y, w, h}] in DOCUMENT coords: hero
//              content blocks a large label must not sit under
// Returns a controller { start, stop, renderStill, dispose,
// isDegraded, setSettled, setDisplay } or null when the renderer
// could not be created. setDisplay(state) accepts:
//   { kind: "idle" }
//   { kind: "focus", groups: [bandIndex, ...] }
//   { kind: "lift", items: [{ title, creator, year, collection }] }
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

  // ---- sizing + DPR ladder (ship-1 behavior kept: steps deferred
  // while a scroll is in progress — see the tick loop)
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
  scene.fog = new THREE.FogExp2(0x000000, 0.0048); // lines/dust depth cue
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);

  // ---- camera rig (Amendments I/L/M): ONE rig, target state only.
  // cur damps toward the mode's target every rendered frame, so a
  // new target retargets mid-flight — never a queue, never a snap.
  const CAM_AZ = 0.69; // fixed azimuth (the bench framing's direction)
  let idleDist = 100;
  const rigCur = { dist: 115, elev: 1.02, tgtY: 8 }; // starts POSTER
  let mode = "idle";            // "idle" | "focus" | "display"
  let focusGroups = [];
  let focusY = 0;
  let focusDistMul = 0.5;
  let displayY = Y_TOP + 12;
  let booted = false;           // boot gate (Amendment M)
  let bootAt = 0;               // performance.now() when boot completed
  const createdAt = performance.now();

  function modeTarget(t) {
    if (!booted) return { dist: idleDist * 1.15, elev: 1.02, tgtY: 8 };
    if (mode === "focus") return { dist: idleDist * focusDistMul, elev: 0.12, tgtY: focusY };
    if (mode === "display") return { dist: idleDist * 0.82, elev: 0.30, tgtY: displayY };
    // Idle drift (Amendment K): slow breathing around the idle frame.
    return {
      dist: idleDist * (1 + 0.035 * Math.sin(t * 0.021)),
      elev: 0.155 + 0.045 * Math.sin(t * 0.016 + 1.7),
      tgtY: 1.5 * Math.sin(t * 0.013),
    };
  }
  function applyRig(dt) {
    const tgt = modeTarget(sceneTime);
    // The opening leg damps slower (reel's first-seconds feel); after
    // it, flights settle in ~2-3 s.
    const tau = booted && performance.now() - bootAt < 6000 ? 2.1 : 0.95;
    const k = 1 - Math.exp(-dt / tau);
    rigCur.dist += (tgt.dist - rigCur.dist) * k;
    rigCur.elev += (tgt.elev - rigCur.elev) * k;
    rigCur.tgtY += (tgt.tgtY - rigCur.tgtY) * k;
    // Scroll scrub (Amendment O): across the hero span the camera is
    // scrubbed from the top-down POSTER framing into the rig's state
    // as the user scrolls toward the search/filters region — fully
    // reversible; returning to the top restores the poster. Uses the
    // cached scroll position only (no layout reads).
    const span = Math.max(1, labelH || viewH);
    const p = clamp01(lastScrollY / span);
    const w = p * p * (3 - 2 * p);
    // Poster framing: steeper on portrait (a tall stack seen at the
    // landscape angle funnels into a cone; more elevation reads as
    // the reference's composed disc of rings).
    const posterElev = viewW / Math.max(1, viewH) < 0.85 ? 1.28 : 1.04;
    const posterDist = idleDist * 1.18;
    const posterY = 20;
    const elev = posterElev + (rigCur.elev - posterElev) * w;
    const dist = posterDist + (rigCur.dist - posterDist) * w;
    const tgtY = posterY + (rigCur.tgtY - posterY) * w;
    const ce = Math.cos(elev);
    camera.position.set(
      Math.sin(CAM_AZ) * ce * dist,
      tgtY + Math.sin(elev) * dist,
      Math.cos(CAM_AZ) * ce * dist
    );
    camera.lookAt(0, tgtY, 0);
  }

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

    // Placement order: reversed list puts PODCASTS/FOLKLORE at the
    // top of the stack and LAW at the bottom.
    const order = [...BANDS].reverse();
    order.forEach((g, gi) => {
      g.thetaStart = theta;
      let count = 0;
      for (let s = 0; s < g.stations; s++) {
        const th = theta + s * DTHETA;
        const { C, T, e1, e2 } = frameAt(th);
        const brick = (s % 2) * 0.5;
        const taper = Math.min(1, (s + 1) / 5, (g.stations - s) / 5);
        const tScale = 0.25 + 0.75 * taper;
        for (let j = 0; j < ROWS; j++) {
          const phi = ((j + brick) / ROWS) * Math.PI * 2;
          const n = e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2, Math.sin(phi));
          const Y = new THREE.Vector3().crossVectors(n, T);
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
      // Label anchor: a point on the tube surface at the band's
      // staggered anchor angle (structure space; rotates with it).
      const aTheta = g.thetaStart + ANCHOR_FRAC[g.index] * (g.thetaEnd - g.thetaStart);
      const af = frameAt(aTheta);
      g.anchorLocal = af.C.clone().addScaledVector(af.e1, TUBE_R + 1.05);
      g.anchorY = af.C.y;
      if (gi < order.length - 1) {
        gapRanges.push([theta, theta + GAP_DTHETA]);
        theta += GAP_DTHETA;
      }
    });
    // Every library panel sits on the tube, inside the spiral
    // (Joshua 2026-11-12: no satellites, nothing floating outside).
  }
  const panelCount = placements.length;

  // ---- instanced mesh
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
  const focusW = new Float32Array(panelCount).fill(1); // per-instance
  // focus weight (1.3 focused / 0.22 dimmed), rewritten on focus
  // change only; the damped uFocusAmt ramps the transition.
  const groupFirst = new Map();
  const groupLast = new Map();
  placements.forEach((p, i) => {
    if (!groupFirst.has(p.group)) groupFirst.set(p.group, i);
    groupLast.set(p.group, i);
  });
  const uniforms = {
    uMap: { value: null },
    uTime: { value: 0 },
    uFocusAmt: { value: 0 },
    uTints: { value: BAND_TINTS.map((t) => new THREE.Vector3(t[0], t[1], t[2])) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: [
      "attribute vec2 aCell;",
      "attribute float aGroup;",
      "attribute float aPhase;",
      "attribute float aFocusW;",
      "uniform float uTime;",
      "uniform float uFocusAmt;",
      "uniform vec3 uTints[10];",
      "varying vec2 vUv;",
      "varying float vBright;",
      "varying vec3 vTint;",
      "void main() {",
      "  vUv = (aCell + uv) / " + ATLAS_COLS.toFixed(1) + ";",
      "  vTint = uTints[int(aGroup + 0.5)];",
      "  vec4 wp = instanceMatrix * vec4(position, 1.0);",
      "  vec4 mv = modelViewMatrix * wp;",
      "  float bright = mix(1.0, aFocusW, uFocusAmt);",
      "  float shimmer = 0.94 + 0.06 * sin(uTime * 0.6 + aPhase * 17.0);",
      // Depth falloff (Amendment K): near coils carry the brightness,
      // distant coils sink into the black.
      "  float dist = -mv.z;",
      "  float depth = mix(1.10, 0.40, smoothstep(52.0, 150.0, dist));",
      "  vBright = bright * shimmer * depth;",
      "  gl_Position = projectionMatrix * mv;",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform sampler2D uMap;",
      "varying vec2 vUv;",
      "varying float vBright;",
      "varying vec3 vTint;",
      "void main() {",
      "  vec3 col = texture2D(uMap, vUv).rgb;",
      "  col *= mix(vec3(1.0), vTint, 0.45);",
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
    cells[i * 2 + 1] = ATLAS_ROWS - 1 - p.cell[1];
    groupsAttr[i] = p.group;
    phases[i] = p.phase;
  });
  geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 2));
  geo.setAttribute("aGroup", new THREE.InstancedBufferAttribute(groupsAttr, 1));
  geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
  const focusAttr = new THREE.InstancedBufferAttribute(focusW, 1);
  focusAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aFocusW", focusAttr);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;

  function setFocusWeights(groups) {
    const set = new Set(groups || []);
    placements.forEach((p, i) => {
      focusW[i] = set.has(p.group) ? 1.32 : 0.20;
    });
    focusAttr.needsUpdate = true;
  }

  let disposed = false;
  let degraded = false;
  let running = false;
  let atlasTexture = null;
  new THREE.TextureLoader().load(
    atlasUrl,
    (tex) => {
      if (disposed) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      atlasTexture = tex;
      uniforms.uMap.value = tex;
      structure.add(mesh);
      stillDirty = true;
      if (frozen || degraded || !running) renderStill();
      else if (running) renderFrame(performance.now());
    },
    undefined,
    () => {
      if (frozen) renderStill();
    }
  );

  // ---- wire + threads: two red strands spiralling around the tube
  // along the whole coil WITH BARB TICKS (the reel's barbed wire),
  // bare strands through the inter-band gaps, and faint grey stitch
  // threads across the structure. All of it follows the coil.
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
        // Barb ticks: short diagonal spikes crossing the strand,
        // every ~2.4 arc units — plainly visible in the wide gaps.
        if (s % 8 === 0 && s > 0) {
          const { T, e1 } = frameAt(th);
          const b1 = P.clone().addScaledVector(e1, 0.62).addScaledVector(T, -0.42);
          const b2 = P.clone().addScaledVector(e1, -0.62).addScaledVector(T, 0.42);
          pushR(b1, b2);
          const b3 = P.clone().addScaledVector(e1, 0.62).addScaledVector(T, 0.42);
          const b4 = P.clone().addScaledVector(e1, -0.62).addScaledVector(T, -0.42);
          pushR(b3, b4);
        }
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
    {
      const rndW = mulberry32(31337);
      const posOf = (i) => {
        const el = placements[i].matrix.elements;
        return new THREE.Vector3(el[12], el[13], el[14]);
      };
      for (let k = 0; k < 170; k++) {
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
        new THREE.LineBasicMaterial({ color, transparent: true, opacity, fog: true })
      );
      l.frustumCulled = false;
      structure.add(l);
      return l;
    };
    mkLines(red, 0xa8492f, 0.6);
    mkLines(grey, 0x9aa0a8, 0.13); // raised from 0.07 (Amendment K)
  }

  // ---- dust: faint star-like atmosphere only
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
      new THREE.PointsMaterial({ color: 0x93a3b8, size: 0.09, transparent: true, opacity: 0.11, depthWrite: false, fog: true })
    );
    dust.frustumCulled = false;
    structure.add(dust);
  }

  // ---- lift display (Amendments I/J): the reel's ending — result
  // works pulled OUT of the coil into a tiered pyramid above the
  // stack, tethered by thread lines to the coil below. Tiles are a
  // pooled set of planes textured from a dynamic typeset canvas
  // atlas (the results grid's covers are typeset plates; the tiles
  // speak the same language). Every tile damps from its coil anchor
  // to its pyramid slot and back — same latest-wins rig rules as the
  // camera: setDisplay only changes targets.
  const LIFT_MAX = 50;
  const liftGroup = new THREE.Group();
  liftGroup.visible = false;
  scene.add(liftGroup);
  const liftCanvas = document.createElement("canvas");
  liftCanvas.width = 2048;
  liftCanvas.height = 2048;
  const liftCtx = liftCanvas.getContext("2d");
  const liftTex = new THREE.CanvasTexture(liftCanvas);
  liftTex.colorSpace = THREE.SRGBColorSpace;
  liftTex.anisotropy = 4;
  const TILE_CELL = 256; // 8 x 8 grid on the canvas
  const tiles = [];
  {
    const tileGeo = new THREE.PlaneGeometry(1, 1.38);
    for (let i = 0; i < LIFT_MAX; i++) {
      const uvMat = new THREE.MeshBasicMaterial({
        map: liftTex,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      // Per-tile UV window into the shared canvas atlas.
      const g = tileGeo.clone();
      const uv = g.attributes.uv;
      const cx = (i % 8) * TILE_CELL;
      const cy = Math.floor(i / 8) * TILE_CELL;
      for (let k = 0; k < uv.count; k++) {
        uv.setXY(
          k,
          (cx + uv.getX(k) * TILE_CELL) / 2048,
          1 - (cy + (1 - uv.getY(k)) * TILE_CELL) / 2048
        );
      }
      const meshTile = new THREE.Mesh(g, uvMat);
      meshTile.visible = false;
      meshTile.frustumCulled = false;
      liftGroup.add(meshTile);
      tiles.push({
        mesh: meshTile,
        cur: new THREE.Vector3(),
        slot: new THREE.Vector3(),
        anchorTheta: 0,
        size: 3,
        active: false,
        seeded: false,
      });
    }
  }
  const threadPos = new Float32Array(LIFT_MAX * 2 * 3);
  const threadGeo = new THREE.BufferGeometry();
  threadGeo.setAttribute("position", new THREE.BufferAttribute(threadPos, 3).setUsage(THREE.DynamicDrawUsage));
  const threads = new THREE.LineSegments(
    threadGeo,
    new THREE.LineBasicMaterial({ color: 0xb9bec6, transparent: true, opacity: 0.4, fog: false })
  );
  threads.frustumCulled = false;
  threads.visible = false;
  scene.add(threads);

  let liftAmt = 0;      // damped 0..1
  let liftTarget = 0;
  let liftCount = 0;
  let liftSig = "";

  function drawTileCell(i, item) {
    const x0 = (i % 8) * TILE_CELL;
    const y0 = Math.floor(i / 8) * TILE_CELL;
    const plate = LANE_PLATE[item.collection] || "#4a4a44";
    liftCtx.save();
    liftCtx.beginPath();
    liftCtx.rect(x0, y0, TILE_CELL, TILE_CELL);
    liftCtx.clip();
    liftCtx.fillStyle = "#0a0a09";
    liftCtx.fillRect(x0, y0, TILE_CELL, TILE_CELL);
    // plate (book-proportioned, centered in the square cell)
    const pw = 168, ph = 232, px = x0 + (TILE_CELL - pw) / 2, py = y0 + (TILE_CELL - ph) / 2;
    liftCtx.fillStyle = plate;
    liftCtx.fillRect(px, py, pw, ph);
    liftCtx.strokeStyle = "rgba(255,255,255,0.35)";
    liftCtx.lineWidth = 2;
    liftCtx.strokeRect(px + 5, py + 5, pw - 10, ph - 10);
    liftCtx.fillStyle = "rgba(244,240,230,0.96)";
    liftCtx.textAlign = "center";
    // title, wrapped
    const title = String(item.title || "Untitled");
    liftCtx.font = "600 19px Georgia, 'Times New Roman', serif";
    const words = title.split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (liftCtx.measureText(test).width > pw - 24 && line) {
        lines.push(line);
        line = w;
        if (lines.length >= 5) break;
      } else line = test;
    }
    if (line && lines.length < 6) lines.push(line);
    lines.slice(0, 6).forEach((ln, li) => {
      liftCtx.fillText(ln, x0 + TILE_CELL / 2, py + 40 + li * 24);
    });
    // creator at the plate foot
    liftCtx.font = "11px Georgia, serif";
    liftCtx.fillStyle = "rgba(244,240,230,0.75)";
    const creator = String(item.creator || "").toUpperCase().slice(0, 34);
    if (creator) liftCtx.fillText(creator, x0 + TILE_CELL / 2, py + ph - 18);
    liftCtx.restore();
  }

  function layoutLift(items) {
    const n = Math.min(items.length, LIFT_MAX);
    // Pyramid rows, capacities 2,3,4,... from the top.
    const counts = [];
    let rem = n;
    let cap = 2;
    while (rem > 0) {
      const c = Math.min(cap, rem);
      counts.push(c);
      rem -= c;
      cap++;
    }
    const rows = counts.length;
    const maxRow = Math.max(...counts);
    const tileW = Math.min(4.4, 36 / maxRow);
    const tileH = tileW * 1.38;
    const rowGap = tileH + 0.6;
    const baseY = Y_TOP + 7;
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const c = counts[r];
      const y = baseY + (rows - 1 - r) * rowGap;
      for (let k = 0; k < c; k++) {
        const t = tiles[idx];
        const x = (k - (c - 1) / 2) * (tileW + 0.4);
        t.slot.set(x, y, -0.018 * x * x);
        t.size = tileW;
        t.anchorTheta = (idx / Math.max(1, n)) * totalTheta * 0.32 + 0.15;
        t.active = true;
        idx++;
      }
    }
    liftCount = n;
    displayY = baseY + ((rows - 1) * rowGap) / 2 + 2;
    for (let i = n; i < LIFT_MAX; i++) tiles[i].active = false;
  }

  // ---- floating labels (HTML overlay, reel style) — RIDE THE COIL
  // (Amendment L): each band's label anchors to a fixed angle on its
  // band (structure space) and is projected every frame; opacity
  // follows the anchor's facing — full strength on the near sweep,
  // fading out as it rotates onto the far side. Big collections get
  // large labels, small ones tiny tags. Positions are converted into
  // the hero layer's DOCUMENT space (ship-1 fix: the layer scrolls
  // with the hero; its cached document offset is scroll-invariant,
  // and the render loop does no layout reads).
  const bandLabels = [];
  if (labelsEl) {
    BANDS.forEach((g) => {
      const el = document.createElement("div");
      el.style.opacity = "0";
      const large = g.count >= LARGE_LABEL_MIN;
      el.className = "tower-helix-band-label" + (large ? "" : " tower-helix-taglabel");
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
        group: g.index,
        count: g.count,
        large,
        anchorLocal: g.anchorLocal,
        anchorY: g.anchorY,
        basePx: large
          ? 15 + 37 * (g.sqrt / BANDS[0].sqrt)
          : 8 + 5 * (g.sqrt / BANDS[0].sqrt),
        w: 0,
        h: 0,
        op: 0,
        sx: 0,
        sy: 0,
      });
    });
  }

  let labelDocX = 0;
  let labelDocY = 0;
  let labelW = 0;
  let labelH = 0;
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _scr = { x: 0, y: 0, behind: false };
  function projectToScreen(v3, out) {
    _v3.copy(v3).project(camera);
    out.x = (_v3.x * 0.5 + 0.5) * viewW;
    out.y = (-_v3.y * 0.5 + 0.5) * viewH;
    out.behind = _v3.z > 1;
    return out;
  }
  function updateLabels() {
    if (!labelsEl) return;
    const offX = -labelDocX;
    const offY = -labelDocY;
    const W = labelW || viewW;
    const H = labelH || viewH;
    const focusAmt = focusAmtCur;
    // Pass 1: project anchors, compute facing opacity.
    for (const L of bandLabels) {
      const world = structure.localToWorld(_v1.copy(L.anchorLocal));
      const axisW = structure.localToWorld(_v2.set(0, L.anchorY, 0));
      // facing: radial direction (axis -> anchor) vs view direction
      const rx = world.x - axisW.x;
      const rz = world.z - axisW.z;
      const rl = Math.hypot(rx, rz) || 1;
      const vx = camera.position.x - world.x;
      const vy = camera.position.y - world.y;
      const vz = camera.position.z - world.z;
      const vl = Math.hypot(vx, vy, vz) || 1;
      const facing = (rx / rl) * (vx / vl) + (rz / rl) * (vz / vl);
      let op = smoothstep(-0.30, 0.30, facing);
      const s = projectToScreen(world, _scr);
      L.sx = s.x + offX;
      L.sy = s.y + offY;
      if (s.behind || L.sx < -80 || L.sx > W + 80 || L.sy < -60 || L.sy > H + 60) op = 0;
      if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
      // Hero text avoidance: a label whose center sits under the
      // title/total block hides (converted to layer coords).
      if (op > 0 && avoidRects.length) {
        for (const a of avoidRects) {
          const ax = a.x - labelDocX, ay = a.y - labelDocY;
          if (L.sx > ax - 4 && L.sx < ax + a.w + 4 && L.sy > ay - 4 && L.sy < ay + a.h + 4) {
            op = 0;
            break;
          }
        }
      }
      // Focus: the focused bands' labels hold, others dim.
      if (focusAmt > 0.01) {
        const isF = focusGroups.indexOf(L.group) !== -1;
        op *= isF ? 1 : 1 - 0.68 * focusAmt;
      }
      L.op = op;
    }
    // Pass 2: large-label collisions — when two large labels overlap
    // substantially on the front sweep, the larger collection wins
    // and the smaller fades (Amendment L; no jitter, transform-only).
    const larges = bandLabels.filter((l) => l.large && l.op > 0.35);
    for (let i = 0; i < larges.length; i++) {
      for (let j = i + 1; j < larges.length; j++) {
        const a = larges[i], b = larges[j];
        const iw = Math.min(a.sx + a.w / 2, b.sx + b.w / 2) - Math.max(a.sx - a.w / 2, b.sx - b.w / 2);
        const ih = Math.min(a.sy + a.h / 2, b.sy + b.h / 2) - Math.max(a.sy - a.h / 2, b.sy + b.h / 2);
        if (iw > 0 && ih > 0 && iw * ih > 0.20 * Math.min(a.w * a.h, b.w * b.h)) {
          if (a.count >= b.count) b.op *= 0.10;
          else a.op *= 0.10;
        }
      }
    }
    // Pass 3: write transforms + opacity.
    for (const L of bandLabels) {
      L.el.style.opacity = String(0.96 * L.op);
      if (L.op > 0.01) {
        L.el.style.transform =
          "translate3d(" + L.sx.toFixed(1) + "px," + L.sy.toFixed(1) + "px,0) translate(-50%,-135%)";
      }
    }
  }

  // ---- lift animation (per frame, damped, allocation-free)
  let focusAmtCur = 0;
  let focusAmtTgt = 0;
  const _aw = new THREE.Vector3();
  const _tw = new THREE.Vector3();
  function updateLift(dt) {
    const k = 1 - Math.exp(-dt / 0.85);
    liftAmt += (liftTarget - liftAmt) * k;
    if (liftAmt < 0.005 && liftTarget === 0) liftAmt = 0;
    const show = liftAmt > 0.02;
    liftGroup.visible = show;
    threads.visible = show && liftCount > 0;
    if (!show) {
      for (const t of tiles) {
        t.mesh.visible = false;
        if (liftTarget === 0) t.seeded = false;
      }
      return;
    }
    liftGroup.rotation.y = Math.atan2(camera.position.x, camera.position.z);
    let ti = 0;
    for (const t of tiles) {
      if (!t.active) { t.mesh.visible = false; continue; }
      const awW = surfacePoint(t.anchorTheta, 1.15, _aw);
      structure.localToWorld(awW);
      const awG = liftGroup.worldToLocal(_tw.copy(awW));
      if (!t.seeded) { t.cur.copy(awG); t.seeded = true; }
      const tgt = mode === "display" && liftTarget === 1 ? t.slot : awG;
      t.cur.lerp(tgt, k);
      t.mesh.position.copy(t.cur);
      const s = t.size * (0.45 + 0.55 * liftAmt);
      t.mesh.scale.set(s, s, 1);
      t.mesh.material.opacity = liftAmt;
      t.mesh.visible = true;
      // Thread: tile (world) -> its coil anchor (world).
      const twW = liftGroup.localToWorld(_tw.copy(t.cur));
      threadPos[ti * 6] = twW.x;
      threadPos[ti * 6 + 1] = twW.y - t.size * 0.6;
      threadPos[ti * 6 + 2] = twW.z;
      threadPos[ti * 6 + 3] = awW.x;
      threadPos[ti * 6 + 4] = awW.y;
      threadPos[ti * 6 + 5] = awW.z;
      ti++;
    }
    threadGeo.setDrawRange(0, ti * 2);
    threadGeo.attributes.position.needsUpdate = true;
    threads.material.opacity = 0.4 * liftAmt;
  }

  // ---- sizing
  let layoutDone = false;
  function layout() {
    const { w, h } = containerSize();
    viewW = w;
    viewH = h;
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 58 : 42;
    idleDist =
      camera.aspect < 0.62 ? 124 :
      camera.aspect < 0.85 ? 112 :
      camera.aspect < 1.2 ? 102 : 96;
    if (!layoutDone) {
      layoutDone = true;
      rigCur.dist = idleDist * 1.15;
      rigCur.elev = 1.02;
      rigCur.tgtY = 8;
    }
    camera.updateProjectionMatrix();
    applyDpr();
    const labelScale = Math.min(1, Math.max(0.45, viewW / 1400));
    for (const L of bandLabels) {
      L.el.style.fontSize = Math.round(L.basePx * labelScale) + "px";
      L.w = 0;
    }
    if (labelsEl) {
      const lr = labelsEl.getBoundingClientRect();
      labelDocX = lr.left + window.scrollX;
      labelDocY = lr.top + window.scrollY;
      labelW = labelsEl.clientWidth || 0;
      labelH = labelsEl.clientHeight || 0;
    }
    if (getAvoidRects) {
      try {
        avoidRects = getAvoidRects() || [];
      } catch (e) {
        avoidRects = [];
      }
    }
  }
  layout();

  // ---- loop: boot gate + ~30 fps cap + DPR ladder + low-fps park
  const FRAME_MS = 1000 / 30;
  let raf = 0;
  let sceneTime = 2.2;
  let lastRender = 0;
  let loopStart = 0;
  let fpsWindowStart = 0;
  let fpsWindowFrames = 0;
  let lowDprWindows = 0;
  let stillDirty = true;
  let lastScrollAt = -1e9;
  let lastScrollY = 0;
  try { lastScrollY = window.scrollY || 0; } catch (e) {}

  function renderFrame(now) {
    const dt = lastRender ? Math.min(0.1, (now - lastRender) / 1000) : 0.016;
    if (booted) sceneTime += dt;
    uniforms.uTime.value = sceneTime;
    structure.rotation.y = sceneTime * 0.045;
    structure.position.y = Math.sin(sceneTime * 0.07) * 0.9;
    applyRig(Math.max(dt, 0.001));
    const fk = 1 - Math.exp(-Math.max(dt, 0.001) / 0.9);
    focusAmtCur += (focusAmtTgt - focusAmtCur) * fk;
    uniforms.uFocusAmt.value = focusAmtCur;
    updateLift(Math.max(dt, 0.001));
    renderer.render(scene, camera);
    updateLabels();
    lastRender = now;
  }

  function tick(now) {
    if (!running || disposed) return;
    raf = requestAnimationFrame(tick);
    if (!booted) {
      // Boot gate (Amendment M): no motion before the page's boot
      // completes — at most the motionless top-down still, repainted
      // only when something actually changed. Failsafe: if the boot
      // signal never arrives, start anyway after 9 s (the page's own
      // loader has a failsafe too; the background must not sit dead).
      if (now - createdAt > 9000) setSettled();
      if (stillDirty) {
        renderStill();
        stillDirty = false;
      }
      return;
    }
    if (lastRender && now - lastRender < FRAME_MS - 1) return;
    renderFrame(now);
    if (!fpsWindowStart) { fpsWindowStart = now; loopStart = now; }
    fpsWindowFrames++;
    const winMs = now - fpsWindowStart;
    if (winMs >= 4000) {
      if (getAvoidRects) {
        try {
          avoidRects = getAvoidRects() || avoidRects;
        } catch (e) { /* keep previous */ }
      }
      const fps = (fpsWindowFrames * 1000) / winMs;
      if (now - loopStart > 6000) {
        if (fps < 12) {
          degraded = true;
          running = false;
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
          return;
        }
        // DPR ladder: never step mid-scroll (ship-1 fix).
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
    uniforms.uTime.value = sceneTime;
    structure.rotation.y = sceneTime * 0.045;
    structure.position.y = Math.sin(sceneTime * 0.07) * 0.9;
    applyRig(10); // snap to target (poster framing incl. scroll scrub)
    focusAmtCur = focusAmtTgt;
    uniforms.uFocusAmt.value = focusAmtCur;
    liftAmt = liftTarget;
    updateLift(10);
    renderer.render(scene, camera);
    updateLabels();
  }

  function setSettled() {
    if (booted) return;
    booted = true;
    bootAt = performance.now();
    stillDirty = true;
    if (!frozen && !degraded && !running) start();
  }

  function setDisplay(state) {
    if (!state || disposed) return;
    if (state.kind === "focus" && Array.isArray(state.groups) && state.groups.length) {
      mode = "focus";
      focusGroups = state.groups.slice();
      setFocusWeights(focusGroups);
      const ys = focusGroups.map((i) => BANDS[i].yMid);
      focusY = ys.reduce((a, b) => a + b, 0) / ys.length;
      const span = Math.max(...ys) - Math.min(...ys);
      focusDistMul = Math.min(0.85, Math.max(0.42, 0.40 + span / 110));
      focusAmtTgt = 1;
      liftTarget = 0;
    } else if (state.kind === "lift" && Array.isArray(state.items)) {
      const items = state.items.slice(0, LIFT_MAX);
      const sig = items.map((i) => (i.title || "") + "|" + (i.creator || "")).join("§");
      if (sig !== liftSig) {
        liftSig = sig;
        liftCtx.clearRect(0, 0, 2048, 2048);
        items.forEach((item, i) => drawTileCell(i, item));
        liftTex.needsUpdate = true;
        layoutLift(items);
        for (const t of tiles) t.seeded = false;
      }
      mode = "display";
      liftTarget = 1;
      focusAmtTgt = 0;
    } else {
      mode = "idle";
      focusGroups = [];
      focusAmtTgt = 0;
      liftTarget = 0;
    }
    if (frozen || degraded || !running) {
      stillDirty = true;
      renderStill();
    }
  }

  // Scroll marker (passive, cached values only — no layout reads):
  // feeds the DPR ladder's mid-scroll guard AND the Amendment O
  // scroll scrub (applyRig reads lastScrollY).
  let stillQueued = false;
  const onScrollMark = () => {
    lastScrollAt = performance.now();
    try { lastScrollY = window.scrollY || 0; } catch (e) {}
    if (frozen || degraded || !running) {
      if (!stillQueued) {
        stillQueued = true;
        requestAnimationFrame(() => {
          stillQueued = false;
          renderStill();
        });
      }
    }
  };
  window.addEventListener("scroll", onScrollMark, { passive: true });

  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (disposed) return;
      layout();
      if (frozen || degraded || !running) renderStill();
      else stillDirty = true;
    }, 150);
  };
  window.addEventListener("resize", onResize);

  if (frozen) renderStill();

  return {
    start,
    stop,
    renderStill,
    isDegraded: () => degraded,
    setSettled,
    setDisplay,
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
      liftTex.dispose();
      try { renderer.dispose(); } catch (e) {}
      try { renderer.forceContextLoss(); } catch (e) {}
    },
  };
}
