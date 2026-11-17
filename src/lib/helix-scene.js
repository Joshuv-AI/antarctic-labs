// Helix scene — the Tower of Babel page's full-page background: a 3D
// helix of book-cover TUBES in black space, after Evgeniy Afonin's
// "Forbidden Library" reel. Two spirals at once:
//   Spiral A (coil path): a fat tube winds around a vertical axis.
//   Spiral B (tube surface): covers tile AROUND the tube's circular
//     cross-section, so each band reads as a rope of books.
// Bands are the seven real collections, one contiguous segment of
// the coil each with bare-wire gaps between, panel counts mapped
// LINEARLY from the real collection sizes (true representation,
// 2026-11-13: 1 panel ≈ 170 works against a 15,006-panel budget,
// with a disclosed 72-panel minimum segment for the two
// micro-collections). Counts arrive from /tower-hubs-index.json —
// the same file the filter chips read — via opts.counts, with the
// built-in seed below as the fallback; tiles are textured from
// atlases baked out of real catalog entries (provenance in
// scripts/helix-starter-manifest.json +
// scripts/helix-segments-manifest.json), so a panel always shows
// material from its own collection.
//
// ATLAS-SCALE (2026-11-14): the single 4096² atlas is replaced by
// PAGED atlases — one mesh per page, all sharing the tier shader:
//   starter page (2048², 256 cells = today's pools) + a 1024²
//     grain page paint the FIRST frame (≤0.70 MB wire together);
//   eight segment pages (2048², 2,048 further distinct real cells)
//     load only after the catalog stream settles, nearest-first,
//     at most 3 GPU-resident, and swap in only at legal moments —
//     when every panel they would re-skin is in the FAR tier (or
//     off-frustum), or bundled into a user-caused commit under the
//     reshape dissolve — so a page arrival is never a visible pop;
//   a live page (1024² canvas) mirrors the current selection's top
//     results as typeset title pages on the dominant band's lit
//     segment (mirroring v1: zero wire, typeset from data already
//     on the page).
// Distance tiers in the shader: NEAR panels sample their page at
// full detail, MID panels the same page (or the starter when their
// segment has not arrived), FAR panels cross-fade to the grain
// page — a per-band impression texture — below ~7 device px, where
// no individual cover is legible anyway. Assignment is DECK-DEALT
// per (page, band) pool: a seeded shuffle dealt in placement
// order, reshuffled on exhaustion with a boundary guard, so no
// cell repeats within a pool's deal. A per-instance phase drives
// paper-tone jitter (±10% brightness + a warm tint wobble), so
// even the grain impression never reads as one flat stamp.
// All page bitmaps decode via createImageBitmap WITH
// { imageOrientation: "flipY" } — without it the tiles sample
// upside-down (the pre-atlas-scale build had that defect; the
// gate proved the flipY bitmap byte-exact against CanvasTexture).
// Segment pages prefer KTX2 (ETC1S → ASTC/BC7 GPU-compressed,
// ~5.6 MiB GPU per page against 21.3 MiB RGBA) when the loader +
// transcoder are available, and fall back to the WebP page on any
// failure; the starter and grain stay WebP so first paint never
// waits on the transcoder.
//
// SHIP 2 (2026-11-12, plan Amendments H–M): the scene is bound to
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
//    (2026-11-14 reel-fidelity: labels sit BESIDE their coil —
//    centered on the anchor and nudged radially outward on screen —
//    never floating above it; verified in top-down and side
//    renders against the reel frames.)
//  - Navigation binding (one damped rig, latest-wins, retarget
//    mid-flight — never queued keyframes, never a snap):
//      focus(groups)  — camera flies to frame the bands, they
//        brighten, the rest dim (per-group weights in an instanced
//        attribute, ramped by a single damped uniform). The flight
//        mirrors the reel's move: top-down → tilt to side → push
//        INTO the section until the band fills the frame's middle.
//      lift(items)    — up to 50 result works rise OUT of the coil on
//        thread lines into a tiered pyramid above the stack (the
//        reel's ending); camera eases to frame the display.
//      idle           — everything damps back to the idle framing.
//  - Wire carries barb ticks; grey stitch threads slightly raised.
//
// Rendering economy: one InstancedMesh PER PAGE (≤10 total) sharing
// the tier shader; lift tiles are a small pooled mesh set with a
// dynamic typeset canvas atlas (the results grid's own covers are
// typeset plates — the tiles speak the same language). ~30 fps cap,
// DPR ladder (steps deferred while scrolling or in transit; steps
// back UP after sustained full-rate windows), sustained-low-fps
// park, webglcontextlost recovery, full disposal. Loaded ONLY via
// dynamic import() from components/HelixCanvas.jsx, kicked off at
// mount (Amendment M: the scene and starter page load DURING the
// page boot; motion waits for it).

import * as THREE from "three";
import { getTowerKernels } from "./tower-kernels.js";

// ------------------------------------------------------------------ pages
// Page ids: 0 = starter, 1..8 = segment pages 0..7, 9 = live page.
const PAGE_STARTER = 0;
const PAGE_LIVE = 9;
const PAGE_DIV = 16; // 2048² pages: 16×16 grid of 128px cells
const LIVE_DIV = 8;  // live page: 8×8 grid of 128px cells on 1024²
const MAX_RESIDENT_SEGMENTS = 3;
// Starter cell pools per band (the 16×16 starter grid) — identical
// to the pre-atlas-scale atlas pools.
const BAND_DEFS = [
  { name: "LAW", cells: [0, 64] },
  { name: "PAPERS", cells: [64, 128] },
  { name: "BOOKS", cells: [128, 168] },
  { name: "REFERENCE", cells: [168, 196] },
  { name: "DECLASSIFIED", cells: [196, 220] },
  { name: "PODCASTS", cells: [220, 240] },
  { name: "DOCUMENTS", cells: [240, 256] },
];
// Segment pools: SEG_POOLS[s] maps band index → [cellStart, cellEnd)
// within segment page s (cells numbered row-major over the page's
// 16×16 grid). Extracted from the bake's segments-manifest.json —
// the gate-verified layout. A panel whose (segment, band) pool is
// absent keeps its starter cell permanently.
const SEG_POOLS = [
  { 0: [0, 256] },
  { 0: [0, 256] },
  { 0: [0, 256] },
  { 0: [0, 240], 1: [240, 256] },
  { 1: [0, 256] },
  { 1: [0, 256] },
  { 1: [0, 256] },
  { 1: [0, 115], 2: [115, 177], 3: [177, 207], 4: [207, 224], 5: [224, 240], 6: [240, 256] },
];
const SEED_COUNTS = {
  LAW: 1277197, PAPERS: 1130210, BOOKS: 81631, REFERENCE: 41137,
  DECLASSIFIED: 26294, PODCASTS: 1091, DOCUMENTS: 363,
};
const BAND_PANEL_TARGET = 15006; // all panels live in band segments
const MIN_STATIONS = 12; // 72 panels — the minimum-segment floor
const GROUP_LITERAL_MAX = 100; // truth-allocated coils (curated
                               // groups + Books shelves) at/below
                               // this many entries render literally
                               // (coil-count truth, 2026-11-16)

// Label anchor positions along each band (fraction of its theta
// span), staggered at build time so the big labels rarely sweep the
// front together (Amendment L collision rule).
const ANCHOR_FRAC = [0.34, 0.66, 0.48, 0.78, 0.26, 0.58, 0.84];
const LARGE_LABEL_MIN = 30000; // count at/above which a band gets the
                               // large label treatment (else tiny tag)
// Per-band color temperature (Amendment K stretch): subtle RGB
// multipliers echoing the reel's per-band palette variety, in
// canonical band order.
const BAND_TINTS = [
  [1.03, 1.05, 1.12], // LAW — cool slate
  [1.10, 1.04, 0.92], // PAPERS — warm paper
  [1.08, 1.00, 0.86], // BOOKS — sepia
  [0.92, 1.02, 1.10], // REFERENCE — pale cyan
  [1.08, 0.94, 0.90], // DECLASSIFIED — red-grey
  [1.10, 0.94, 0.96], // PODCASTS — coral-grey
  [1.02, 0.96, 1.10], // DOCUMENTS — violet-grey
];
// Tile plate colors by catalog lane (lift display + live mirror page).
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
// CPU-side cell encoding for the shader: the bake numbers cells
// row-major from the image TOP; textures upload flipped (flipY), so
// the shader's row is counted from the bottom. aCell carries the
// pre-flipped index: col + (div-1-row)*div.
function encCell(cell, div) {
  const row = (cell / div) | 0;
  const col = cell - row * div;
  return col + (div - 1 - row) * div;
}
function rangeArr(a, b) {
  const out = new Array(b - a);
  for (let i = a; i < b; i++) out[i - a] = i;
  return out;
}

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

// Linear-proportional panel allocation (module-level,
// deterministic). Bands whose strict share of the panel budget
// falls below the minimum segment are floored at MIN_STATIONS and
// leave the pool; the rest re-share the remaining budget linearly
// (one pass suffices: flooring a band only raises the others'
// shares). Stations are rounded from panels, so realized panel
// counts track strict proportionality to within one station.
// Rust/WASM allocation kernels (tower-kernels.js): the three
// allocate* functions below are ported to Rust with bit-exact
// parity (the parity harness compares station-for-station against
// these JS originals, which stay as the fallback). A null kernel
// result — module not loaded, instantiate failed, any fault —
// runs the JS implementation exactly as before the port. (Placed
// after ROWS: the consts read it, and module-level const order is
// evaluation order.)
const ALLOC_KERNEL_CONSTS = {
  target: BAND_PANEL_TARGET,
  minStations: MIN_STATIONS,
  rows: ROWS,
  literalMax: GROUP_LITERAL_MAX,
};
function allocStationsAuto(counts) {
  const K = getTowerKernels();
  if (K) {
    const r = K.allocBands(
      BAND_DEFS.map((d) => counts[d.name]),
      ALLOC_KERNEL_CONSTS
    );
    if (r) {
      const out = {};
      BAND_DEFS.forEach((d, i) => {
        out[d.name] = r[i];
      });
      return out;
    }
  }
  return allocateStations(counts);
}
function allocateStations(counts) {
  const floored = new Set();
  let pool = BAND_DEFS.map((d) => d.name);
  for (;;) {
    const poolCount = pool.reduce((s, n) => s + (counts[n] || 0), 0);
    const budget = BAND_PANEL_TARGET - floored.size * MIN_STATIONS * ROWS;
    const tiny = pool.filter(
      (n) => ((counts[n] || 0) * budget) / Math.max(1, poolCount) < MIN_STATIONS * ROWS
    );
    if (!tiny.length || !pool.length) break;
    tiny.forEach((n) => floored.add(n));
    pool = pool.filter((n) => !floored.has(n));
  }
  const poolCount = pool.reduce((s, n) => s + (counts[n] || 0), 0);
  const budget = BAND_PANEL_TARGET - floored.size * MIN_STATIONS * ROWS;
  const out = {};
  for (const d of BAND_DEFS) if (floored.has(d.name)) out[d.name] = MIN_STATIONS;
  if (pool.length) {
    // Largest-remainder apportionment: floor every pool band's
    // exact station share, then hand the leftover stations to the
    // largest fractional remainders, so the pool total lands
    // exactly on the budget's station count.
    const target = Math.round(budget / ROWS);
    const raw = pool.map((n) => ({
      n,
      v: ((counts[n] || 0) * budget) / Math.max(1, poolCount) / ROWS,
    }));
    let sum = 0;
    for (const r of raw) {
      out[r.n] = Math.floor(r.v);
      sum += out[r.n];
    }
    const byRem = raw
      .slice()
      .sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)));
    let i = 0;
    while (sum < target && byRem.length) {
      out[byRem[i % byRem.length].n]++;
      sum++;
      i++;
    }
  }
  return out;
}
function buildBands(counts) {
  const stations = allocStationsAuto(counts);
  return BAND_DEFS.map((d, i) => ({
    name: d.name,
    count: counts[d.name] || 0,
    index: i,
    sqrt: Math.sqrt(counts[d.name] || 0),
    stations: stations[d.name],
    cellStart: d.cells[0],
    cellEnd: d.cells[1],
  }));
}
// The same apportionment over an arbitrary counts array (coil
// layouts, 2026-11-15 re-coiling): identical floor + largest-
// remainder rules; a zero-count coil gets zero stations (it still
// occupies its gap slot and carries its label — an honest marker).
function allocateStationsArr(counts) {
  const n = counts.length;
  const out = new Array(n).fill(0);
  const floored = new Set();
  let pool = [];
  for (let i = 0; i < n; i++) if ((counts[i] || 0) > 0) pool.push(i);
  for (;;) {
    const poolCount = pool.reduce((s, i) => s + (counts[i] || 0), 0);
    const budget = BAND_PANEL_TARGET - floored.size * MIN_STATIONS * ROWS;
    const tiny = pool.filter(
      (i) => ((counts[i] || 0) * budget) / Math.max(1, poolCount) < MIN_STATIONS * ROWS
    );
    if (!tiny.length || !pool.length) break;
    tiny.forEach((i) => floored.add(i));
    pool = pool.filter((i) => !floored.has(i));
  }
  const poolCount = pool.reduce((s, i) => s + (counts[i] || 0), 0);
  const budget = BAND_PANEL_TARGET - floored.size * MIN_STATIONS * ROWS;
  for (const i of floored) out[i] = MIN_STATIONS;
  if (pool.length) {
    const target = Math.round(budget / ROWS);
    const raw = pool.map((i) => ({
      i,
      v: ((counts[i] || 0) * budget) / Math.max(1, poolCount) / ROWS,
    }));
    let sum = 0;
    for (const r of raw) {
      out[r.i] = Math.floor(r.v);
      sum += out[r.i];
    }
    const byRem = raw
      .slice()
      .sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)));
    let k = 0;
    while (sum < target && byRem.length) {
      out[byRem[k % byRem.length].i]++;
      sum++;
      k++;
    }
  }
  return out;
}
// Truth-allocated layouts (2026-11-16, INVENTORY lines 98 + 99):
// the curated-group re-coil and the Books shelves layout. The
// generic floor in allocateStationsArr gives every coil at least
// 72 panels, so a 6-entry subcategory (or a 22-entry Books shelf)
// rendered as a full coil — the visual overstated where the
// visitor stands in the filter. These layouts follow the truth
// rules directly instead: a coil with at most GROUP_LITERAL_MAX
// entries renders LITERALLY (one panel per entry, station-rounded;
// one station is the smallest renderable segment, so 1–3 entries
// still occupy a single 6-panel station); larger coils split the
// remaining budget proportionally (largest remainder) with a
// one-station visibility minimum, so a mid-size shelf inside a
// huge layout reads as a stub — never a full coil, and never
// vanished. Zero-count coils keep zero stations (honest markers).
// The resting bands and the lane-sub layouts keep the generic
// allocation above — this function serves the group and shelf
// layouts alone.
function allocateStationsGroup(counts) {
  const n = counts.length;
  const out = new Array(n).fill(0);
  const target = BAND_PANEL_TARGET / ROWS;
  const literal = [];
  const pool = [];
  for (let i = 0; i < n; i++) {
    const c = Math.max(0, counts[i] || 0);
    if (c === 0) continue;
    if (c <= GROUP_LITERAL_MAX) literal.push(i);
    else pool.push(i);
  }
  let used = 0;
  for (const i of literal) {
    out[i] = Math.max(1, Math.round(counts[i] / ROWS));
    used += out[i];
  }
  if (!pool.length || used >= target) {
    // No large coil to absorb the panel surplus (or a pathological
    // literal overflow): the generic apportionment is the fallback.
    // Unreachable for the six curated groups and the Books shelves
    // — every one has coils far above the literal cap.
    return allocateStationsArr(counts);
  }
  // One-station minimum for every pool coil, then a largest-
  // remainder proportional split of what remains, so the layout
  // total lands exactly on the panel budget.
  let budget = target - used - pool.length;
  for (const i of pool) out[i] = 1;
  const poolCount = pool.reduce((s, i) => s + counts[i], 0);
  const raw = pool.map((i) => ({
    i,
    v: (counts[i] * budget) / Math.max(1, poolCount),
  }));
  let sum = 0;
  for (const r of raw) {
    const f = Math.floor(r.v);
    out[r.i] += f;
    sum += f;
  }
  const byRem = raw
    .slice()
    .sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)));
  let k = 0;
  while (sum < budget && byRem.length) {
    out[byRem[k % byRem.length].i]++;
    sum++;
    k++;
  }
  return out;
}
let BANDS = [];
let totalTheta = 0;
let Y_TOP = 0;
function rebuildBands(counts) {
  BANDS = buildBands(counts);
  totalTheta =
    BANDS.reduce((s, g) => s + g.stations * DTHETA, 0) + (BANDS.length - 1) * GAP_DTHETA;
  Y_TOP = (totalTheta * RISE) / 2;
}
rebuildBands(SEED_COUNTS);

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
//   starterUrl — first-paint page (default "/helix-starter.webp")
//   grainUrl   — far-tier impression page (default "/helix-grain.webp")
//   segmentUrl — (i) => url for segment page i (webp fallback path)
//   segmentKtx2Url — (i) => url for segment page i (KTX2 preferred)
//   frozen   — render one still frame (top-down), never run the loop
//   onError  — called if the WebGL context cannot be created at all
//   labelsEl — hero-confined overlay the scene fills with band labels
//   getAvoidRects — () => [{x, y, w, h}] in DOCUMENT coords: hero
//              content blocks a large label must not sit under
// Returns a controller { start, stop, renderStill, dispose,
// isDegraded, setSettled, setDisplay, debugState } or null when the
// renderer could not be created. setDisplay(state) accepts:
//   { kind: "idle" }
//   { kind: "focus", groups: [coilIndex, ...] }
//   { kind: "lift", items: [{ title, creator, year, collection }] }
//   { kind: "reshape", facets: { coilIndex: count, ... }, total,
//     name, items?: [{ title, creator, year, collection }],
//     windows?: { coilIndex: [newerCount, eraCount] } } — a
//     refined filter combination: the coil contracts to the
//     combination's exact per-coil shares and re-skins from its
//     own collections' covers (Phase 2b, applyReshape); when
//     items are present, the top results also mirror onto the
//     dominant coil's lit segment via the live page. windows, when
//     present, places a coil's lit stations at the selection era's
//     own stretch of that coil (era-position mapping, 2026-11-15).
// Any state may also carry:
//   layout: { key, coils: [{key, name, count, band}] } — when the
//     key differs from the current layout, the spiral first
//     dissolves and RE-FORMS into the given coils (hierarchical
//     re-coiling, 2026-11-15): one coil per subcategory of a
//     curated collection, sized by true counts, sampling only its
//     parent band's covers, labels exchanged with the coils. The
//     resting layout's key is "rest" (the seven collections).
//   eraHold: { coil, f0, f1 } — an era is selected: the camera
//     frames the era's stretch [f0, f1] of the given coil (from
//     its front = most recent end) and the rotation stops on it
//     until a state without eraHold arrives.
export function createHelixScene(canvas, opts = {}) {
  const starterUrl = opts.starterUrl || "/helix-starter.webp";
  const grainUrl = opts.grainUrl || "/helix-grain.webp";
  const segmentUrl = typeof opts.segmentUrl === "function"
    ? opts.segmentUrl
    : (i) => "/helix-segment-" + i + ".webp";
  const segmentKtx2Url = typeof opts.segmentKtx2Url === "function"
    ? opts.segmentKtx2Url
    : (i) => "/helix-segment-" + i + ".ktx2";
  // True counts from the hub seed (HelixCanvas fetches
  // /tower-hubs-index.json — the same file the filter chips read).
  // A malformed or partial payload is ignored wholesale: the scene
  // then runs on the built-in seed, which carries the same true
  // totals as of this build.
  if (opts.counts && typeof opts.counts === "object") {
    const c = {};
    let ok = true;
    for (const d of BAND_DEFS) {
      const v = opts.counts[d.name];
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) { ok = false; break; }
      c[d.name] = Math.round(v);
    }
    if (ok) rebuildBands(c);
  }
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
  // Focus tracking (2026-11-14): in focus mode the structure's
  // rotation damps to this angle — the one where the focused band's
  // label anchor faces the camera — and holds there, so the section
  // the visitor travelled to stays in front of them. null = no
  // tracking (free rotation).
  let focusRotTarget = null;
  // Era hold (2026-11-15, §5): while an era is selected, the camera
  // frames the era's stretch of the dominant coil and the rotation
  // damps to a stop on it. Set from display states carrying
  // eraHold {coil, f0, f1} (fractions of the coil's span measured
  // from its front = most recent end); null resumes rotation.
  let eraHold = null; // {coil, f0, f1, thetaMid, y, rotTarget}
  let displayY = Y_TOP + 12;
  let camElevCur = 1.02; // the scrub-blended camera elevation, read
                         // by the label pass (top-down blend)
  let booted = false;           // boot gate (Amendment M)
  let bootAt = 0;               // performance.now() when boot completed
  const createdAt = performance.now();

  function modeTarget(t) {
    let tgt;
    if (!booted) {
      tgt = { dist: idleDist * 1.15, elev: 1.02, tgtY: 8 };
    } else if (mode === "focus") {
      tgt = { dist: idleDist * focusDistMul, elev: 0.10, tgtY: focusY };
    } else if (mode === "display") {
      tgt = { dist: idleDist * 0.82, elev: 0.30, tgtY: displayY };
    } else {
      // Idle drift (Amendment K): slow breathing around the idle frame.
      tgt = {
        dist: idleDist * (1 + 0.035 * Math.sin(t * 0.021)),
        elev: 0.155 + 0.045 * Math.sin(t * 0.016 + 1.7),
        tgtY: 1.5 * Math.sin(t * 0.013),
      };
    }
    // Era hold: pan/zoom INTO the era's stretch of the dominant
    // coil (closer than the mode's own framing, centered on the
    // stretch's midpoint).
    if (booted && eraHold && (mode === "focus" || mode === "reshape")) {
      tgt.tgtY = eraHold.y;
      tgt.dist = Math.min(tgt.dist, idleDist * 0.62);
    }
    return tgt;
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
    camElevCur = elev;
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

  // ---- coil layouts (2026-11-15, hierarchical re-coiling) --------
  // The scene's geometry is built from a LAYOUT: a list of coils
  // {key, name, count, band, anchorFrac}. The resting layout is the
  // seven collections (band == coil); a curated collection's layout
  // is one coil per subcategory, every coil's panels drawn from its
  // PARENT BAND's pools (purity by construction — a coil can only
  // ever sample its own collection's covers). buildLayoutGeometry
  // reproduces the resting build byte-for-byte (same allocation,
  // same seeded jitter stream, same placement order), so the shipped
  // resting scene is untouched; other layouts reuse the identical
  // builder with a gap that shrinks as the coil count grows.
  // A panel's canonical segment stays a pure function of (parent
  // band, pool rank) against the FIXED resting panel starts, so the
  // baked segment pools remain valid in every layout; where a
  // (segment, band) pool does not exist the panel keeps its starter
  // cell, exactly as the resting build treats absent pools.
  const placements = []; // {matrix, group(coil), band, phase, theta}
  const gapRanges = [];  // [theta0, theta1] bare-wire gaps between coils
  let COILS = [];
  let layoutKey = "rest";
  let layoutMaxSqrt = 1;
  let segFrozen = false; // segment lifecycle pauses off the resting layout
  const coilFirst = [];
  const coilLast = [];
  const stationOf = new Int32Array(BAND_PANEL_TARGET);
  const bandRank = new Int32Array(BAND_PANEL_TARGET); // ordinal within parent band
  const segSliceRank = new Int32Array(BAND_PANEL_TARGET);
  const instSeg = new Uint8Array(BAND_PANEL_TARGET);
  const segPanels = Array.from({ length: 8 }, () => []);
  const bandSegCount = new Array(BAND_DEFS.length).fill(0);
  const slicePanels = new Map();
  const bandRankSpace = new Array(BAND_DEFS.length).fill(0);
  const REST_PANEL_START = [];
  {
    let acc = 0;
    for (const g of BANDS) { // canonical order
      REST_PANEL_START.push(acc);
      acc += g.stations * ROWS;
    }
  }
  function restingDefs() {
    return BANDS.map((g, i) => ({
      key: "band:" + g.name,
      name: g.name,
      count: g.count,
      band: i,
      anchorFrac: ANCHOR_FRAC[i],
    }));
  }
  function buildLayoutGeometry(defs, truthAlloc) {
    const counts = defs.map((d) => Math.max(0, Math.round(d.count || 0)));
    // Curated-group and Books-shelf layouts allocate by the truth
    // rules (literal small coils); every other layout keeps the
    // generic floor + largest-remainder apportionment. The WASM
    // kernels compute the identical stations when available.
    let stationsArr = null;
    const K = getTowerKernels();
    if (K) {
      stationsArr = truthAlloc
        ? K.allocGroup(counts, ALLOC_KERNEL_CONSTS)
        : K.allocArr(counts, ALLOC_KERNEL_CONSTS);
    }
    if (!stationsArr) {
      stationsArr = truthAlloc
        ? allocateStationsGroup(counts)
        : allocateStationsArr(counts);
    }
    // Panel-count invariant: the budget is exact by construction
    // (floors are pre-subtracted from it); the all-floored residue
    // is the one theoretical exception — fold it into the largest
    // coil so placements.length is ALWAYS the panel target.
    const targetStations = BAND_PANEL_TARGET / ROWS;
    const tot = stationsArr.reduce((a, b) => a + b, 0);
    if (tot !== targetStations && stationsArr.length) {
      let li = 0;
      for (let i = 1; i < stationsArr.length; i++) {
        if (stationsArr[i] > stationsArr[li]) li = i;
      }
      stationsArr[li] = Math.max(1, stationsArr[li] + (targetStations - tot));
    }
    const n = defs.length;
    const gapTheta = GAP_DTHETA * Math.min(1, 7 / Math.max(1, n));
    COILS = defs.map((d, i) => ({
      key: d.key,
      name: d.name,
      count: counts[i],
      band: Math.min(BAND_DEFS.length - 1, Math.max(0, d.band | 0)),
      index: i,
      sqrt: Math.sqrt(counts[i]),
      stations: stationsArr[i],
      anchorFrac:
        typeof d.anchorFrac === "number"
          ? d.anchorFrac
          : 0.2 + 0.6 * ((i * 0.618034) % 1),
      panels: 0,
      thetaStart: 0,
      thetaEnd: 0,
      yMid: 0,
      anchorLocal: null,
      anchorY: 0,
      anchorTheta: 0,
    }));
    layoutMaxSqrt = COILS.reduce((mx, c) => Math.max(mx, c.sqrt), 1);
    totalTheta =
      stationsArr.reduce((s, x) => s + x, 0) * DTHETA +
      Math.max(0, n - 1) * gapTheta;
    Y_TOP = (totalTheta * RISE) / 2;
    placements.length = 0;
    gapRanges.length = 0;
    const rnd = mulberry32(987123);
    const m = new THREE.Matrix4();
    const qj = new THREE.Quaternion();
    const e = new THREE.Euler();
    let theta = 0;
    // Placement order: reversed list puts the LAST def at the top
    // of the stack (resting: DOCUMENTS top, LAW bottom; a curated
    // group lists largest first, so its largest shelf lands at the
    // bottom like LAW).
    const order = COILS.slice().reverse();
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
          const nv = e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2, Math.sin(phi));
          const Y = new THREE.Vector3().crossVectors(nv, T);
          const pos = C.clone()
            .addScaledVector(nv, TUBE_R * (0.35 + 0.65 * taper))
            .addScaledVector(T, (rnd() - 0.5) * 0.04)
            .addScaledVector(Y, (rnd() - 0.5) * 0.04);
          e.set((rnd() - 0.5) * 0.07, (rnd() - 0.5) * 0.09, (rnd() - 0.5) * 0.05);
          qj.setFromEuler(e);
          const basis = new THREE.Matrix4().makeBasis(T, Y, nv)
            .multiply(new THREE.Matrix4().makeRotationFromQuaternion(qj))
            .multiply(new THREE.Matrix4().makeScale(tScale, tScale, tScale));
          m.copy(basis).setPosition(pos);
          placements.push({
            matrix: m.clone(),
            group: g.index,
            band: g.band,
            phase: rnd(),
            theta: th,
          });
          count++;
        }
      }
      g.panels = count;
      theta += g.stations * DTHETA;
      g.thetaEnd = theta;
      g.yMid = Y_TOP - RISE * ((g.thetaStart + g.thetaEnd) / 2);
      // Label anchor: a point on the tube surface at the coil's
      // staggered anchor angle (structure space; rotates with it).
      // A zero-station coil anchors on the bare wire at its slot.
      const aTheta = g.thetaStart + g.anchorFrac * (g.thetaEnd - g.thetaStart);
      const af = frameAt(aTheta);
      g.anchorLocal = af.C.clone().addScaledVector(af.e1, TUBE_R + 1.05);
      g.anchorY = af.C.y;
      g.anchorTheta = aTheta;
      if (gi < order.length - 1) {
        gapRanges.push([theta, theta + gapTheta]);
        theta += gapTheta;
      }
    });
    // Derived per-instance arrays for this layout.
    coilFirst.length = 0;
    coilLast.length = 0;
    for (let c = 0; c < n; c++) { coilFirst.push(-1); coilLast.push(-1); }
    placements.forEach((p, i) => {
      if (coilFirst[p.group] < 0) coilFirst[p.group] = i;
      coilLast[p.group] = i;
    });
    for (let i = 0; i < placements.length; i++) {
      stationOf[i] = ((i - coilFirst[placements[i].group]) / ROWS) | 0;
    }
    const seenBand = new Array(BAND_DEFS.length).fill(0);
    for (let i = 0; i < placements.length; i++) bandRank[i] = seenBand[placements[i].band]++;
    for (let b = 0; b < BAND_DEFS.length; b++) bandRankSpace[b] = seenBand[b];
    for (let s = 0; s < 8; s++) segPanels[s].length = 0;
    for (let i = 0; i < placements.length; i++) {
      const canon = REST_PANEL_START[placements[i].band] + bandRank[i];
      instSeg[i] = Math.min(7, Math.floor(canon / (BAND_PANEL_TARGET / 8)));
      segPanels[instSeg[i]].push(i);
    }
    for (let s = 0; s < 8; s++) {
      const per = new Array(BAND_DEFS.length).fill(0);
      for (const i of segPanels[s]) segSliceRank[i] = per[placements[i].band]++;
    }
    bandSegCount.fill(0);
    slicePanels.clear();
    for (let s = 0; s < 8; s++) {
      const per = new Array(BAND_DEFS.length).fill(0);
      for (const i of segPanels[s]) per[placements[i].band]++;
      for (let b = 0; b < BAND_DEFS.length; b++) {
        if (per[b] > 0) {
          bandSegCount[b]++;
          slicePanels.set(s + ":" + b, per[b]);
        }
      }
    }
    displayY = Y_TOP + 12;
  }
  buildLayoutGeometry(restingDefs());
  const panelCount = placements.length;

  // ---- paged panel machinery -------------------------------------
  // Logical per-instance state; the partition builder below is the
  // ONLY writer of mesh attributes, and it runs at commits (init,
  // page activation/eviction, reshape, focus-weight changes are
  // synced separately) — never per frame.
  let disposed = false;
  let degraded = false;
  let running = false;
  let contextLost = false;
  const instPage = new Uint8Array(panelCount);       // all starter (0)
  const instCell = new Int32Array(panelCount);       // raw cell index on instPage
  const instBaseCell = new Int32Array(panelCount);   // canonical starter cell
  const instHomeCell = new Int32Array(panelCount);   // canonical cell on the home page
  const instHomePage = new Uint8Array(panelCount);   // page instHomeCell belongs to
  const focusW = new Float32Array(panelCount).fill(1); // per-instance
  // focus weight (1.16 focused / 0.30 dimmed), rewritten on focus
  // change only; the damped uFocusAmt ramps the transition.

  // Cell assignment is a PURE FUNCTION of (page, band, rank):
  // each pool has one static order — the bake's layout order,
  // which since the era rebake (2026-11-15) is ERA ORDER within
  // the pool (year descending; a band's front is its most recent
  // material) — and an instance's cell on a page is dealt from
  // that order by rank, where rank is the instance's canonical
  // ordinal within that (page, band) set. Every assignment set in
  // the scene is rank-contiguous per (page, band) — a segment's
  // panels, a band's lit stations — so per-cell counts over any
  // full assignment set differ by at most one BY CONSTRUCTION,
  // under any interleaving of activations, reshapes, evictions
  // and mirror binds. (The stateful deck this replaced leaked
  // single cards whenever a home page moved mid-stream.) Two
  // deals share the order:
  //   cyclic — order[rank % poolSize]: a multi-segment band's
  //     segment pool covers only that segment's era range (the
  //     rebake stratified the pools), so the deal cycles inside
  //     a narrow era window and position still ages along the
  //     band, segment by segment;
  //   quantile — order[floor(rank * poolSize / rankSpace)]: the
  //     starter page (one pool spans the whole band) and
  //     single-segment bands, where a cyclic deal would wrap
  //     the full era range inside one slice; the quantile deal
  //     makes year a non-increasing step function of rank.
  // bandEpoch[band] increments on every reshape that includes
  // the band; the deal rotates by a BOUNDED slice of the pool
  // (rot below) — enough that a reshape visibly re-skins (every
  // panel's cover changes to an era-neighbouring entry), small
  // enough that the era a rank carries shifts by at most
  // rot/poolSize of the slice's era range.
  const orders = new Map();
  function orderFor(page, band) {
    const key = page + ":" + band;
    let o = orders.get(key);
    if (o) return o;
    let cellsArr = null;
    if (page === PAGE_STARTER) {
      cellsArr = rangeArr(BAND_DEFS[band].cells[0], BAND_DEFS[band].cells[1]);
    } else if (page >= 1 && page <= 8) {
      const pool = SEG_POOLS[page - 1][band];
      if (pool) cellsArr = rangeArr(pool[0], pool[1]);
    }
    if (!cellsArr) return null;
    o = cellsArr;
    orders.set(key, o);
    return o;
  }
  const bandEpoch = new Array(BANDS.length).fill(0);
  function rankOnPage(i, page) {
    return page === PAGE_STARTER ? bandRank[i] : segSliceRank[i];
  }
  function cellFor(page, band, rank) {
    const o = orderFor(page, band);
    if (!o) return -1;
    const rot = bandEpoch[band] % Math.max(1, Math.min(16, o.length >> 3));
    let idx;
    if (page !== PAGE_STARTER && bandSegCount[band] > 1) {
      idx = rank % o.length;
    } else {
      const space = page === PAGE_STARTER
        ? bandRankSpace[band]
        : slicePanels.get((page - 1) + ":" + band) || o.length;
      idx = Math.min(o.length - 1, Math.floor((rank * o.length) / Math.max(1, space)));
    }
    return o[(idx + rot) % o.length];
  }
  // Canonical starter assignment (epoch 0 on every band): every
  // instance on the starter page with its pure-function cell, homes
  // reset, focus weights neutral. Runs at init and at every layout
  // swap (a swap re-homes the whole structure; segment pages return
  // only through the resting layout's lifecycle).
  function resetInstanceCells() {
    for (let i = 0; i < panelCount; i++) {
      const c = cellFor(PAGE_STARTER, placements[i].band, bandRank[i]);
      instPage[i] = PAGE_STARTER;
      instCell[i] = c;
      instBaseCell[i] = c;
      instHomeCell[i] = c;
      instHomePage[i] = PAGE_STARTER;
      focusW[i] = 1;
    }
  }
  resetInstanceCells();

  // ---- shared uniforms + tier shader
  const uniforms = {
    uGrain: { value: null },
    uTime: { value: 0 },
    uFocusAmt: { value: 0 },
    uDim: { value: 1 },
    uDissolve: { value: 1 },
    uProjFactor: { value: 800 },
    uTints: { value: BAND_TINTS.map((t) => new THREE.Vector3(t[0], t[1], t[2])) },
  };
  const PANEL_VERT = [
    "attribute float aCell;",
    "attribute float aGroup;",
    "attribute float aPhase;",
    "attribute float aFocusW;",
    "uniform float uTime;",
    "uniform float uFocusAmt;",
    "uniform float uDim;",
    "uniform float uDissolve;",
    "uniform float uGridDiv;",
    "uniform float uProjFactor;",
    "uniform float uTexFlip;",
    "uniform vec3 uTints[" + BAND_DEFS.length + "];",
    "varying vec2 vUv;",
    "varying vec2 vGrainUv;",
    "varying float vBright;",
    "varying vec3 vTint;",
    "varying float vTierMix;",
    "void main() {",
    "  float col = mod(aCell, uGridDiv);",
    "  float row = floor(aCell / uGridDiv);",
    "  vUv = (vec2(col, row) + uv) / uGridDiv;",
    // KTX2 pages only (uTexFlip = 1): compressed uploads cannot be
    // flipped (UNPACK_FLIP_Y is ignored for them), so a transcoded
    // page's texels sit in authored top-first order while the cell
    // addressing above assumes the flipY'd bottom-first order the
    // WebP path uploads. Mirroring V restores the exact WebP
    // sampling — same cell, upright — for KTX2-backed pages.
    "  if (uTexFlip > 0.5) vUv.y = 1.0 - vUv.y;",
    // Grain cell: band b occupies grain cells [b*8, b*8+8); the
    // per-instance variant comes from the phase hash.
    "  float gCell = (7.0 - aGroup) * 8.0 + floor(fract(aPhase * 7.317) * 8.0);",
    "  vGrainUv = (vec2(mod(gCell, 8.0), floor(gCell / 8.0)) + uv) / 8.0;",
    // Paper-tone jitter: brightness + warm tint wobble per instance.
    "  float jit = 0.90 + 0.20 * fract(aPhase * 13.731);",
    "  vec3 warm = mix(vec3(1.0), vec3(1.06, 1.00, 0.92), fract(aPhase * 7.913));",
    "  vTint = uTints[int(aGroup + 0.5)] * warm;",
    "  vec4 wp = instanceMatrix * vec4(position, 1.0);",
    "  vec4 mv = modelViewMatrix * wp;",
    "  float bright = mix(1.0, aFocusW, uFocusAmt);",
    "  float shimmer = 0.94 + 0.06 * sin(uTime * 0.6 + aPhase * 17.0);",
    // Depth falloff (Amendment K): near coils carry the brightness,
    // distant coils sink into the black.
    "  float dist = -mv.z;",
    "  float depth = mix(1.10, 0.40, smoothstep(52.0, 150.0, dist));",
    "  vBright = bright * shimmer * depth * uDim * uDissolve * jit;",
    // Distance tier: panel height in device px (0.80 world units).
    "  float hPx = 0.80 * uProjFactor / max(dist, 0.001);",
    "  vTierMix = 1.0 - smoothstep(5.0, 9.0, hPx);",
    "  gl_Position = projectionMatrix * mv;",
    "}",
  ].join("\n");
  const PANEL_FRAG = [
    "uniform sampler2D uMap;",
    "uniform sampler2D uGrain;",
    "varying vec2 vUv;",
    "varying vec2 vGrainUv;",
    "varying float vBright;",
    "varying vec3 vTint;",
    "varying float vTierMix;",
    "void main() {",
    "  vec3 col = texture2D(uMap, vUv).rgb;",
    "  if (vTierMix > 0.003) {",
    "    col = mix(col, texture2D(uGrain, vGrainUv).rgb, vTierMix);",
    "  }",
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
  ].join("\n");

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
  const basePanelGeo = buildPanelGeometry();

  const pageRecs = new Map();
  function pageRec(page) {
    let rec = pageRecs.get(page);
    if (!rec) {
      rec = {
        page,
        tex: null,
        ready: false,
        mesh: null,
        geo: null,
        mat: null,
        aCell: null, aGroup: null, aPhase: null, aFocusW: null,
        list: [],
        div: page === PAGE_LIVE ? LIVE_DIV : PAGE_DIV,
        capacity:
          page === PAGE_LIVE ? LIVE_DIV * LIVE_DIV :
          page === PAGE_STARTER ? panelCount :
          segPanels[page - 1].length,
      };
      pageRecs.set(page, rec);
    }
    return rec;
  }
  function buildPageMesh(rec) {
    const geo = basePanelGeo.clone();
    const cap = Math.max(1, rec.capacity);
    rec.aCell = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    rec.aGroup = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    rec.aPhase = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    rec.aFocusW = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    for (const a of [rec.aCell, rec.aGroup, rec.aPhase, rec.aFocusW]) {
      a.setUsage(THREE.DynamicDrawUsage);
    }
    geo.setAttribute("aCell", rec.aCell);
    geo.setAttribute("aGroup", rec.aGroup);
    geo.setAttribute("aPhase", rec.aPhase);
    geo.setAttribute("aFocusW", rec.aFocusW);
    rec.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: rec.tex },
        uTexFlip: {
          value: rec.tex && rec.tex.userData && rec.tex.userData.fromKtx2 ? 1 : 0,
        },
        uGrain: uniforms.uGrain,
        uTime: uniforms.uTime,
        uFocusAmt: uniforms.uFocusAmt,
        uDim: uniforms.uDim,
        uDissolve: uniforms.uDissolve,
        uProjFactor: uniforms.uProjFactor,
        uTints: uniforms.uTints,
        uGridDiv: { value: rec.div },
      },
      side: THREE.DoubleSide,
      vertexShader: PANEL_VERT,
      fragmentShader: PANEL_FRAG,
    });
    rec.mesh = new THREE.InstancedMesh(geo, rec.mat, cap);
    rec.mesh.count = 0;
    rec.mesh.frustumCulled = false;
    rec.geo = geo;
    structure.add(rec.mesh);
  }
  // The partition: group instances by their current page and write
  // every per-mesh attribute from the logical arrays. Commit-time
  // only (a few ms at 15k instances).
  function rebuildPartition() {
    const byPage = new Map();
    for (let i = 0; i < panelCount; i++) {
      const p = instPage[i];
      let arr = byPage.get(p);
      if (!arr) { arr = []; byPage.set(p, arr); }
      arr.push(i);
    }
    for (const rec of pageRecs.values()) {
      const list = byPage.get(rec.page) || [];
      rec.list = list;
      if (!rec.mesh) continue;
      const n = Math.min(list.length, rec.capacity);
      for (let k = 0; k < n; k++) {
        const i = list[k];
        rec.mesh.setMatrixAt(k, placements[i].matrix);
        rec.aCell.array[k] = encCell(instCell[i], rec.div);
        rec.aGroup.array[k] = placements[i].band;
        rec.aPhase.array[k] = placements[i].phase;
        rec.aFocusW.array[k] = focusW[i];
      }
      rec.mesh.count = rec.ready ? n : 0;
      rec.mesh.instanceMatrix.needsUpdate = true;
      rec.aCell.needsUpdate = true;
      rec.aGroup.needsUpdate = true;
      rec.aPhase.needsUpdate = true;
      rec.aFocusW.needsUpdate = true;
    }
    stillDirty = true;
  }
  function syncFocusAttrs() {
    for (const rec of pageRecs.values()) {
      if (!rec.mesh) continue;
      const list = rec.list;
      const n = Math.min(list.length, rec.capacity);
      for (let k = 0; k < n; k++) rec.aFocusW.array[k] = focusW[list[k]];
      rec.aFocusW.needsUpdate = true;
    }
  }
  function setFocusWeights(groups) {
    const set = new Set(groups || []);
    placements.forEach((p, i) => {
      // Visual containment (2026-11-13): the focus boost is gentler
      // than the original 1.32 / 0.20 split — the lit segment still
      // reads unmistakably against its neighbours, but the near rope
      // no longer glares at full strength behind the filter panel
      // while the visitor is reading it.
      focusW[i] = set.has(p.group) ? 1.16 : 0.30;
    });
    syncFocusAttrs();
  }

  // ---- texture loading -------------------------------------------
  function prepPageTexture(tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (!tex.isCompressedTexture) {
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
    }
    return tex;
  }
  function disposeTexture(tex) {
    if (!tex) return;
    try { tex.dispose(); } catch (e) {}
    if (tex.userData && tex.userData.bitmap && tex.userData.bitmap.close) {
      try { tex.userData.bitmap.close(); } catch (e) {}
    }
  }
  // WebP page loader: fetch + createImageBitmap WITH flipY (the
  // gate-proven upright path), TextureLoader as the fallback (its
  // default flipY is also upright). Resolves null on total failure.
  function loadWebpTexture(url) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (t) => { if (!done) { done = true; resolve(t); } };
      const viaLoader = () => {
        try {
          new THREE.TextureLoader().load(
            url,
            (t) => finish(t),
            undefined,
            () => finish(null)
          );
        } catch (e) { finish(null); }
      };
      if (typeof window !== "undefined" && window.fetch && window.createImageBitmap) {
        window
          .fetch(url)
          .then((r) => {
            if (!r || !r.ok) throw new Error("page fetch failed");
            return r.blob();
          })
          .then((b) => window.createImageBitmap(b, { imageOrientation: "flipY" }))
          .then((bmp) => {
            if (disposed) {
              if (bmp && bmp.close) bmp.close();
              finish(null);
              return;
            }
            const tex = new THREE.Texture(bmp);
            tex.needsUpdate = true;
            tex.userData.bitmap = bmp;
            finish(tex);
          })
          .catch(() => {
            if (!disposed) viaLoader();
            else finish(null);
          });
      } else {
        viaLoader();
      }
    });
  }
  // KTX2 (candidate 1, Joshua 2026-11-14 18:26): GPU-compressed
  // segment pages. The loader chunk + transcoder load lazily; ANY
  // failure permanently selects the WebP path for this session.
  let ktx2Loader = null;
  let ktx2Ready = false;
  {
    import("three/examples/jsm/loaders/KTX2Loader.js")
      .then((mod) => {
        try {
          if (disposed) return;
          const l = new mod.KTX2Loader();
          l.setTranscoderPath("/basis/");
          if (typeof l.setWorkerLimit === "function") l.setWorkerLimit(2);
          l.detectSupport(renderer);
          ktx2Loader = l;
          ktx2Ready = true;
        } catch (e) {
          ktx2Ready = false;
        }
      })
      .catch(() => { ktx2Ready = false; });
  }
  async function loadSegmentTexture(s) {
    if (ktx2Ready && ktx2Loader) {
      try {
        const tex = await ktx2Loader.loadAsync(segmentKtx2Url(s));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        tex.userData.fromKtx2 = true;
        return tex;
      } catch (e) { /* fall through to the WebP page */ }
    }
    return loadWebpTexture(segmentUrl(s));
  }

  // Grain: a 1×1 neutral placeholder binds instantly (the FAR tier
  // is a soft impression; the real grain page swaps in on arrival).
  {
    const ph = new THREE.DataTexture(new Uint8Array([43, 40, 36, 255]), 1, 1);
    ph.colorSpace = THREE.SRGBColorSpace;
    ph.needsUpdate = true;
    uniforms.uGrain.value = ph;
  }
  loadWebpTexture(grainUrl).then((t) => {
    if (!t) return;
    if (disposed) { disposeTexture(t); return; }
    prepPageTexture(t);
    const old = uniforms.uGrain.value;
    uniforms.uGrain.value = t;
    if (old && old.isDataTexture) old.dispose();
    stillDirty = true;
    if (frozen || degraded || !running) renderStill();
  });
  // Starter: first paint. The starter mesh appears the moment its
  // texture lands (the wire + dust already render without it).
  loadWebpTexture(starterUrl).then((t) => {
    if (!t) {
      if (frozen) renderStill();
      return;
    }
    if (disposed) { disposeTexture(t); return; }
    prepPageTexture(t);
    const rec = pageRec(PAGE_STARTER);
    rec.tex = t;
    rec.ready = true;
    buildPageMesh(rec);
    rebuildPartition();
    if (frozen || degraded || !running) renderStill();
    else if (running) renderFrame(performance.now());
  });

  // ---- segment lifecycle ------------------------------------------
  const segState = SEG_POOLS.map(() => ({ status: "idle", tex: null, failAt: 0 }));
  let segLoading = false;
  function homePageOf(i) {
    const s = instSeg[i];
    if (segState[s].status === "active" && SEG_POOLS[s][placements[i].band]) return s + 1;
    return PAGE_STARTER;
  }
  // The instance's canonical cell on its CURRENT home page: a
  // pure function of (home page, band, rank), so a home page
  // moving under a mirrored instance can never leak a card —
  // the value is recomputed, never dealt.
  function homeCellOf(i) {
    const hp = homePageOf(i);
    instHomePage[i] = hp;
    const c = cellFor(hp, placements[i].band, rankOnPage(i, hp));
    instHomeCell[i] = c >= 0 ? c : instBaseCell[i];
    return instHomeCell[i];
  }
  const _pv = new THREE.Vector3();
  const _cv = new THREE.Vector3();
  // Sample a segment's panels: allFar = every visible sample is
  // deep in the FAR tier (panel height ≤ ~5.8 device px, tierMix
  // ≥ ~0.9) or off-frustum / behind the camera — the no-pop-in
  // activation test. meanDist ranks eviction candidates.
  function probeSegment(s) {
    const list = segPanels[s];
    const stride = Math.max(1, Math.floor(list.length / 24));
    const pf = uniforms.uProjFactor.value || 800;
    let allFar = true;
    let sum = 0;
    let n = 0;
    for (let k = 0; k < list.length; k += stride) {
      const i = list[k];
      _pv.setFromMatrixPosition(placements[i].matrix);
      structure.localToWorld(_pv);
      _cv.copy(_pv).applyMatrix4(camera.matrixWorldInverse);
      const fwd = -_cv.z;
      if (fwd > 0) { sum += fwd; n++; }
      if (fwd <= 0.1) continue;
      if (0.8 * pf / fwd <= 5.8) continue;
      _pv.project(camera);
      if (Math.abs(_pv.x) <= 1.05 && Math.abs(_pv.y) <= 1.05) allFar = false;
    }
    return { allFar, meanDist: n ? sum / n : 0 };
  }
  function activateSegment(s) {
    const st = segState[s];
    if (st.status !== "resident") return false;
    st.status = "active";
    const page = s + 1;
    const rec = pageRec(page);
    rec.ready = true;
    for (const i of segPanels[s]) {
      if (!SEG_POOLS[s][placements[i].band]) continue;
      const c = cellFor(page, placements[i].band, segSliceRank[i]);
      if (mirrorSet.has(i)) {
        // Mirrored instances keep sampling the live page; only
        // their home moves to this page (same pure-function
        // value they would get on any later home read).
        instHomeCell[i] = c;
        instHomePage[i] = page;
        continue;
      }
      instPage[i] = page;
      instCell[i] = c;
      instHomeCell[i] = c;
      instHomePage[i] = page;
    }
    rebuildPartition();
    return true;
  }
  function evictSegment(s) {
    const st = segState[s];
    if (st.status === "idle" || st.status === "loading") return;
    const page = s + 1;
    if (st.status === "active") {
      for (const i of segPanels[s]) {
        // Homes return to the starter page's current-epoch cell
        // (the pure-function value), for visible and mirrored
        // instances of this segment alike.
        const home = cellFor(PAGE_STARTER, placements[i].band, bandRank[i]);
        if (instPage[i] === page) {
          instPage[i] = PAGE_STARTER;
          instCell[i] = home;
          instHomeCell[i] = home;
          instHomePage[i] = PAGE_STARTER;
        } else if (mirrorSet.has(i) && instHomePage[i] === page) {
          instHomeCell[i] = home;
          instHomePage[i] = PAGE_STARTER;
        }
      }
    }
    st.status = "idle";
    const rec = pageRec(page);
    rec.ready = false;
    if (rec.tex) { disposeTexture(rec.tex); rec.tex = null; }
    st.tex = null;
    rebuildPartition();
  }
  function evictOverflow() {
    let guard = 0;
    const activeCount = () => segState.filter((x) => x.status === "active").length;
    while (activeCount() > MAX_RESIDENT_SEGMENTS && guard++ < 8) {
      let best = -1;
      let bestDist = -1;
      for (let s = 0; s < 8; s++) {
        if (segState[s].status !== "active") continue;
        const probe = probeSegment(s);
        if (probe.allFar && probe.meanDist > bestDist) {
          best = s;
          bestDist = probe.meanDist;
        }
      }
      if (best < 0) return; // transient overflow stands (design rule 3)
      evictSegment(best);
    }
  }
  function loadSegment(s) {
    const st = segState[s];
    st.status = "loading";
    segLoading = true;
    loadSegmentTexture(s).then((tex) => {
      segLoading = false;
      if (disposed) {
        if (tex) disposeTexture(tex);
        st.status = "idle";
        return;
      }
      if (!tex) {
        st.status = "idle";
        st.failAt = performance.now();
        return;
      }
      st.tex = tex;
      st.status = "resident";
      const rec = pageRec(s + 1);
      rec.tex = tex;
      if (!rec.mesh) buildPageMesh(rec);
      rec.mat.uniforms.uMap.value = tex;
      if (rec.mat.uniforms.uTexFlip) {
        rec.mat.uniforms.uTexFlip.value =
          tex.userData && tex.userData.fromKtx2 ? 1 : 0;
      }
      stillDirty = true;
    });
  }
  // Runs on the tick's 250 ms poll cadence (and only there): page
  // arrivals, activations and evictions are commit-class events,
  // never per-frame work.
  function segmentHousekeeping() {
    if (disposed || frozen || contextLost) return;
    // Pause-when-hidden (INVENTORY 67): no stream work — no loads,
    // activations or evictions — is initiated while the tab is
    // hidden. In-flight loads may land; nothing new starts until
    // the tab is visible again.
    if (typeof document !== "undefined" && document.hidden) return;
    // Off the resting layout the segment lifecycle is frozen: the
    // baked pools belong to the resting canonical mapping, and a
    // re-coiled structure samples the starter page (its parent
    // band's own covers) until the resting layout returns.
    if (segFrozen) return;
    // Activations at legal moments only: bundled synchronously
    // into a user-caused commit (see setDisplay), or — here, on
    // the poll — when the whole segment sits in the FAR tier.
    for (let s = 0; s < 8; s++) {
      if (segState[s].status !== "resident") continue;
      if (probeSegment(s).allFar) activateSegment(s);
    }
    evictOverflow();
    // Loads: post-settle only, one at a time, nearest-first.
    if (!booted || loadActive || segLoading) return;
    const resident = segState.filter((x) => x.status !== "idle").length;
    if (resident >= MAX_RESIDENT_SEGMENTS) {
      // Free a slot only by dropping a FAR, never-activated texture
      // (invisible by construction — no panel samples it).
      let dropped = false;
      for (let s = 0; s < 8; s++) {
        if (segState[s].status === "resident" && probeSegment(s).allFar) {
          evictSegment(s);
          dropped = true;
          break;
        }
      }
      if (!dropped) return;
    }
    const nowMs = performance.now();
    const candidates = [];
    for (let s = 0; s < 8; s++) {
      if (segState[s].status !== "idle") continue;
      if (nowMs - segState[s].failAt < 30000) continue;
      candidates.push({ s, d: probeSegment(s).meanDist });
    }
    if (!candidates.length) return;
    candidates.sort((a, b) => a.d - b.d);
    loadSegment(candidates[0].s);
  }

  // ---- live mirror page -------------------------------------------
  // Mirroring v1: the current selection's top results typeset as
  // title pages (zero wire — title/creator/year/collection are
  // already on the page) on a 1024² canvas, bound to the lit
  // stations of the dominant band nearest its selection-label
  // anchor (the era stretch when the reshape carries a window).
  const mirrorSet = new Map(); // instance -> live cell
  const liveCanvas = document.createElement("canvas");
  liveCanvas.width = 1024;
  liveCanvas.height = 1024;
  const liveCtx = liveCanvas.getContext("2d");
  const liveTex = new THREE.CanvasTexture(liveCanvas);
  liveTex.colorSpace = THREE.SRGBColorSpace;
  liveTex.anisotropy = 4;
  function drawMirrorCell(k, item) {
    const CELL = 128;
    const x0 = (k % LIVE_DIV) * CELL;
    const y0 = ((k / LIVE_DIV) | 0) * CELL;
    const plate = LANE_PLATE[item.collection] || "#4a4a44";
    liveCtx.save();
    liveCtx.beginPath();
    liveCtx.rect(x0, y0, CELL, CELL);
    liveCtx.clip();
    liveCtx.fillStyle = "#0a0a09";
    liveCtx.fillRect(x0, y0, CELL, CELL);
    const pw = 84, ph = 116, px = x0 + (CELL - pw) / 2, py = y0 + (CELL - ph) / 2;
    liveCtx.fillStyle = plate;
    liveCtx.fillRect(px, py, pw, ph);
    liveCtx.strokeStyle = "rgba(255,255,255,0.35)";
    liveCtx.lineWidth = 1;
    liveCtx.strokeRect(px + 3, py + 3, pw - 6, ph - 6);
    liveCtx.fillStyle = "rgba(244,240,230,0.96)";
    liveCtx.textAlign = "center";
    const title = String(item.title || "Untitled");
    liveCtx.font = "600 10px Georgia, 'Times New Roman', serif";
    const words = title.split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (liveCtx.measureText(test).width > pw - 12 && line) {
        lines.push(line);
        line = w;
        if (lines.length >= 6) break;
      } else line = test;
    }
    if (line && lines.length < 7) lines.push(line);
    lines.slice(0, 7).forEach((ln, li) => {
      liveCtx.fillText(ln, x0 + CELL / 2, py + 20 + li * 13);
    });
    liveCtx.font = "6.5px Georgia, serif";
    liveCtx.fillStyle = "rgba(244,240,230,0.75)";
    const creator = String(item.creator || "").toUpperCase().slice(0, 30);
    if (creator) liveCtx.fillText(creator, x0 + CELL / 2, py + ph - 14);
    if (item.year) liveCtx.fillText(String(item.year), x0 + CELL / 2, py + ph - 5);
    liveCtx.restore();
  }
  function clearMirror() {
    if (!mirrorSet.size) return;
    for (const i of mirrorSet.keys()) {
      instPage[i] = homePageOf(i);
      instCell[i] = homeCellOf(i);
    }
    mirrorSet.clear();
  }
  function bindMirror(items, domCoil, litRange, anchorFrac) {
    clearMirror();
    if (!items || !items.length) return;
    const n = Math.min(items.length, LIVE_DIV * LIVE_DIV);
    liveCtx.clearRect(0, 0, 1024, 1024);
    for (let k = 0; k < n; k++) drawMirrorCell(k, items[k]);
    liveTex.needsUpdate = true;
    const rec = pageRec(PAGE_LIVE);
    rec.tex = liveTex;
    if (!rec.mesh) buildPageMesh(rec);
    rec.ready = true;
    const coil = COILS[domCoil];
    if (!coil) return;
    const frac = anchorFrac != null
      ? anchorFrac
      : (coil.anchorFrac + 0.28) % 1;
    const aTheta = coil.thetaStart + frac * (coil.thetaEnd - coil.thetaStart);
    const first = coilFirst[domCoil];
    const p0 = (litRange ? litRange[0] : 0) * ROWS;
    const p1 = Math.min((litRange ? litRange[1] : coil.stations) * ROWS, coil.panels);
    const cands = [];
    for (let k = p0; k < p1; k++) cands.push(first + k);
    cands.sort(
      (a, b) => Math.abs(placements[a].theta - aTheta) - Math.abs(placements[b].theta - aTheta)
    );
    const take = Math.min(n, cands.length);
    for (let k = 0; k < take; k++) {
      const i = cands[k];
      mirrorSet.set(i, k);
      instPage[i] = PAGE_LIVE;
      instCell[i] = k;
    }
  }

  // ---- reshape (Phase 2b, Joshua 2026-11-13 22:26): a refined
  // filter combination re-forms the coil to the combination's own
  // shape. Three parts, all committed together or not at all:
  //   contraction — within each band, the lit stations are the
  //     combination's exact share of that band (facet count ÷
  //     band total): the band's front prefix by default, or the
  //     era's own stretch when the state carries an era window
  //     for the band (era-position mapping, 2026-11-15) —
  //     expressed through the same per-instance focus weights +
  //     damped uFocusAmt machinery as focus mode;
  //   re-skin — lit instances deal a fresh cell from their own
  //     band's pool ON THE PAGE THEY CURRENTLY SAMPLE (deck-dealt,
  //     no repeats within the deal); unlit instances return to
  //     their canonical home cells; the selection's top results
  //     mirror onto the dominant band via the live page;
  //   dissolve — uDissolve dips to ~0.22 on commit and damps back
  //     to 1 over ~700 ms, so the re-form reads as a dissolve, not
  //     a pop. A segment page activation bundled into this commit
  //     rides the same dissolve (no-pop-in rule).
  // Weights and cells are computed into scratch buffers and copied
  // over only after the whole state validates — a malformed state
  // leaves the previous scene state untouched. Per-selection work
  // only: no geometry recompute, no per-frame additions beyond one
  // scalar damp.
  let pendingReshape = null; // latest-wins stash while the stream runs
  let lastReshape = null;    // diagnostics: last committed reshape's
                             // facets / era windows / lit ranges
  let selLabel = null;       // bound in the labels block below
  let dissolveCur = 1;
  let focusAmtCur = 0;
  let focusAmtTgt = 0;
  const scratchFocus = new Float32Array(panelCount);
  function applyReshape(state) {
    const facetsIn = state.facets;
    if (!facetsIn || typeof facetsIn !== "object") return false;
    const total = state.total;
    if (typeof total !== "number" || !(total > 0)) return false;
    const facets = new Array(COILS.length).fill(0);
    let facetSum = 0;
    for (const k of Object.keys(facetsIn)) {
      const bi = Number(k);
      const v = facetsIn[k];
      if (!Number.isInteger(bi) || bi < 0 || bi >= COILS.length) return false;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return false;
      facets[bi] = v;
      facetSum += v;
    }
    if (facetSum <= 0) return false;
    // Dominant coil: largest facet (ties go to the larger
    // collection) — the selection label anchors there.
    let dom = 0;
    for (let b = 1; b < COILS.length; b++) {
      if (facets[b] > facets[dom] || (facets[b] === facets[dom] && COILS[b].count > COILS[dom].count)) dom = b;
    }
    const litStations = COILS.map((g, b) =>
      Math.round(clamp01(facets[b] / Math.max(1, g.count)) * g.stations)
    );
    // Era windows (2026-11-15): when the selection pins an era,
    // pages.jsx may add state.windows = { band: [newer, eraCount] }
    // — the era's position inside the band in record counts (how
    // many of the band's records are newer than the era, how many
    // are in it). A window is honored only when it describes the
    // facet exactly (eraCount === facets[band]) and fits the band
    // total; the band's lit stations then become the era's own
    // stretch of the coil — [newer, newer+era) in station space —
    // instead of the front-anchored prefix. Bands without a valid
    // window keep the prefix (curated sets, sub-lane picks and
    // searches, whose within-band era distribution the page does
    // not tally). Position along a band is time (front = most
    // recent), and the pools are era-ordered, so the stretch's
    // covers are the era's own material.
    const windows = new Array(COILS.length).fill(null);
    if (state.windows && typeof state.windows === "object") {
      for (const k of Object.keys(state.windows)) {
        const bi = Number(k);
        const v = state.windows[k];
        if (!Number.isInteger(bi) || bi < 0 || bi >= COILS.length) continue;
        if (!Array.isArray(v) || v.length !== 2) continue;
        const newer = v[0];
        const eraCount = v[1];
        if (typeof newer !== "number" || typeof eraCount !== "number") continue;
        if (!Number.isFinite(newer) || !Number.isFinite(eraCount)) continue;
        if (newer < 0 || eraCount < 0) continue;
        if (eraCount !== facets[bi]) continue;
        if (newer + eraCount > COILS[bi].count) continue;
        windows[bi] = [newer, eraCount];
      }
    }
    const litRange = COILS.map((g, b) => {
      if (facets[b] <= 0) return [0, 0];
      const w = windows[b];
      if (!w) return [0, litStations[b]];
      let s0 = Math.round((w[0] / Math.max(1, g.count)) * g.stations);
      let s1 = Math.round(((w[0] + w[1]) / Math.max(1, g.count)) * g.stations);
      s0 = Math.max(0, Math.min(g.stations - 1, s0));
      s1 = Math.max(s0 + 1, Math.min(g.stations, s1));
      return [s0, s1];
    });
    // Skinning: every instance of a facet-positive band gets
    // the band's NEW-epoch pure-function cell on its current
    // page, lit or not (dealing only the lit subset would leave
    // the unlit tail on the older epoch's cells — two rotations
    // mixed in one pool). Unlit instances stay dimmed; only
    // their cells change. Zero-facet bands are untouched (home
    // cells). The epoch bump happens first, so the whole band
    // rotates together.
    // Epoch bumps are per parent BAND (the pools are): every
    // facet-positive coil rotates its band's deal once.
    {
      const bumped = new Set();
      for (let b = 0; b < COILS.length; b++) {
        if (facets[b] > 0 && !bumped.has(COILS[b].band)) {
          bumped.add(COILS[b].band);
          bandEpoch[COILS[b].band]++;
        }
      }
    }
    clearMirror();
    for (let i = 0; i < panelCount; i++) {
      const g = placements[i].group;
      const band = placements[i].band;
      if (stationOf[i] >= litRange[g][0] && stationOf[i] < litRange[g][1]) {
        scratchFocus[i] = 1.16;
        instCell[i] = cellFor(instPage[i], band, rankOnPage(i, instPage[i]));
        instHomeCell[i] = instCell[i];
        instHomePage[i] = instPage[i];
      } else if (facets[g] > 0) {
        scratchFocus[i] = 0.30;
        instCell[i] = cellFor(instPage[i], band, rankOnPage(i, instPage[i]));
        instHomeCell[i] = instCell[i];
        instHomePage[i] = instPage[i];
      } else {
        scratchFocus[i] = 0.30;
        if (homePageOf(i) === instPage[i]) {
          instCell[i] = homeCellOf(i);
        } else {
          // Purity fix (INVENTORY 100): the panel's home page is
          // its segment page (that segment is active), but this
          // panel samples a different page — in a re-coiled layout
          // every panel sits on the starter page by design, and a
          // panel can also outlive its segment's active window on
          // the segment page itself. Dealing homeCellOf() here put
          // a cell index from the HOME page's pool onto the SAMPLED
          // page, so the panel rendered whatever cover sits at
          // that index in the sampled page's layout — a cover from
          // another collection's pool. Deal the home-equivalent
          // cell on the page actually sampled (the same
          // pure-function deal the lit branches above use) and sync
          // the home record to the sampled page, exactly as those
          // branches do. When home page and sampled page agree the
          // homeCellOf() path above is byte-identical to this deal.
          const c = cellFor(instPage[i], band, rankOnPage(i, instPage[i]));
          instCell[i] = c >= 0 ? c : instBaseCell[i];
          instHomeCell[i] = instCell[i];
          instHomePage[i] = instPage[i];
        }
      }
    }
    const domWindow = windows[dom]
      ? (litRange[dom][0] + litRange[dom][1]) / (2 * Math.max(1, COILS[dom].stations))
      : null;
    bindMirror(state.items, dom, litRange[dom], domWindow);
    lastReshape = {
      facets: facets.slice(),
      windows: windows.map((w) => (w ? w.slice() : null)),
      litRange: litRange.map((r) => r.slice()),
    };
    // Commit.
    focusW.set(scratchFocus);
    rebuildPartition();
    focusRotTarget = null;
    mode = "reshape";
    focusGroups = COILS.filter((g, b) => facets[b] > 0).map((g) => g.index);
    focusAmtTgt = 1;
    liftTarget = 0;
    dissolveCur = 0.22;
    if (selLabel) {
      const coil = COILS[dom];
      const frac = domWindow != null
        ? domWindow
        : (coil.anchorFrac + 0.28) % 1;
      const aTheta = coil.thetaStart + frac * (coil.thetaEnd - coil.thetaStart);
      const af = frameAt(aTheta);
      selLabel.anchorLocal = af.C.clone().addScaledVector(af.e1, TUBE_R + 1.05);
      selLabel.anchorY = af.C.y;
      selLabel.basePx = 15 + 37 * (coil.sqrt / layoutMaxSqrt);
      selLabel.nameEl.textContent = state.name || "Selection";
      selLabel.countEl.textContent = fmt(total);
      selLabel.w = 0;
      selLabel.active = true;
      const labelScale = Math.min(1, Math.max(0.45, viewW / 1400));
      selLabel.el.style.fontSize = Math.round(selLabel.basePx * labelScale) + "px";
    }
    return true;
  }

  // ---- wire + threads: two red strands spiralling around the tube
  // along the whole coil WITH BARB TICKS (the reel's barbed wire),
  // bare strands through the inter-band gaps, and faint grey stitch
  // threads across the structure. All of it follows the coil.
  // Rebuilt on every layout swap (the strands follow totalTheta,
  // the gaps and the placements of the CURRENT layout).
  function buildWireLines() {
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
    return [
      mkLines(red, 0xa8492f, 0.6),
      mkLines(grey, 0x9aa0a8, 0.13), // raised from 0.07 (Amendment K)
    ];
  }
  let wireLines = buildWireLines();

  // ---- dust: faint star-like atmosphere only
  function buildDustPoints() {
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
    return dust;
  }
  let dustPoints = buildDustPoints();

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
  // (Amendment L): each coil's label anchors to a fixed angle on its
  // coil (structure space) and is projected every frame; opacity
  // follows the anchor's facing — full strength on the near sweep,
  // fading out as it rotates onto the far side. Big collections get
  // large labels, small ones tiny tags. Positions are computed in
  // the overlay's own coordinate frame: the overlay is viewport-
  // FIXED (styles.css, 2026-11-15), so projected positions are
  // viewport coordinates at every scroll depth and the labels stay
  // tethered to their coils while the visitor works the filters —
  // the previous hero-confined layer displaced every label by the
  // scroll delta (the pooled-at-the-top defect).
  // Reel-fidelity (2026-11-14): a label is placed BESIDE its coil —
  // centered on its anchor's projection, then pushed radially
  // outward on screen (away from the axis projection) so it clears
  // the panels and sits at its own band's height. The previous
  // build floated every label ABOVE its anchor (translate -135%),
  // which read as words hovering at the top of the spiral in both
  // the side and top-down framings — the defect Joshua flagged.
  // Labels are rebuilt per LAYOUT (2026-11-15 re-coiling): the old
  // coils' labels are removed with their coils and the new coils'
  // labels are created with them.
  const coilLabels = [];
  function applyLabelFonts() {
    const labelScale = Math.min(1, Math.max(0.45, viewW / 1400));
    for (const L of coilLabels) {
      L.el.style.fontSize = Math.round(L.basePx * labelScale) + "px";
      L.w = 0;
    }
    if (selLabel) {
      selLabel.el.style.fontSize = Math.round(selLabel.basePx * labelScale) + "px";
      selLabel.w = 0;
    }
  }
  function rebuildCoilLabels() {
    for (const L of coilLabels) {
      try { L.el.remove(); } catch (e) { /* already gone */ }
    }
    coilLabels.length = 0;
    if (!labelsEl) return;
    COILS.forEach((g) => {
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
      coilLabels.push({
        el,
        group: g.index,
        count: g.count,
        large,
        anchorLocal: g.anchorLocal,
        anchorY: g.anchorY,
        basePx: large
          ? 15 + 37 * (g.sqrt / layoutMaxSqrt)
          : 8 + 5 * (g.sqrt / layoutMaxSqrt),
        w: 0,
        h: 0,
        op: 0,
        sx: 0,
        sy: 0,
        ax: 0,
        ay: 0,
      });
    });
    // The selection label keeps painting above the coil labels.
    if (selLabel) labelsEl.appendChild(selLabel.el);
    applyLabelFonts();
  }
  if (labelsEl) {
    // Selection label (Phase 2b): ONE dynamic label in the same
    // band-label styling, created once and re-bound by applyReshape
    // to the dominant band of the current refined selection —
    // carrying the selection's name + the page's exact result
    // count. Hidden unless a reshape is active.
    const el = document.createElement("div");
    el.style.opacity = "0";
    el.className = "tower-helix-band-label";
    const nameSpan = document.createElement("span");
    nameSpan.className = "tower-helix-label-name";
    const countSpan = document.createElement("span");
    countSpan.className = "tower-helix-label-count";
    el.appendChild(nameSpan);
    el.appendChild(countSpan);
    labelsEl.appendChild(el);
    selLabel = {
      el,
      nameEl: nameSpan,
      countEl: countSpan,
      anchorLocal: null,
      anchorY: 0,
      basePx: 30,
      w: 0,
      h: 0,
      op: 0,
      sx: 0,
      sy: 0,
      ax: 0,
      ay: 0,
      active: false,
    };
    rebuildCoilLabels();
  }

  let labelDocX = 0;
  let labelDocY = 0;
  let labelW = 0;
  let labelH = 0;
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _scr = { x: 0, y: 0, behind: false };
  const _asc = { x: 0, y: 0, behind: false };
  function projectToScreen(v3, out) {
    _v3.copy(v3).project(camera);
    out.x = (_v3.x * 0.5 + 0.5) * viewW;
    out.y = (-_v3.y * 0.5 + 0.5) * viewH;
    out.behind = _v3.z > 1;
    return out;
  }
  // Screen position for a label: its anchor's projection pushed
  // radially outward (away from the axis projection) so the label
  // body clears the coil silhouette and sits beside its band.
  function labelPos(L, out) {
    let dx = L.sx - L.ax;
    let dy = L.sy - L.ay;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      dx /= len;
      dy /= len;
    } else {
      dx = 1;
      dy = 0;
    }
    const push = 24 + Math.min(30, (L.w || 0) * 0.22);
    out.x = L.sx + dx * push;
    out.y = L.sy + dy * push;
    return out;
  }
  const _lp = { x: 0, y: 0 };
  // Clamp a label's layer-space position so its body never clips
  // off the layer's edge (the atlas renders showed REFERENCE and
  // DOCUMENTS cut mid-word at the screen edges).
  function clampLabelPos(L, W, H, offX, offY) {
    const hw = (L.w || 0) / 2;
    const hh = (L.h || 0) / 2;
    const x0 = -offX + hw + 6;
    const x1 = -offX + W - hw - 6;
    const y0 = -offY + hh + 6;
    const y1 = -offY + H - hh - 6;
    if (x1 > x0) _lp.x = Math.min(Math.max(_lp.x, x0), x1);
    if (y1 > y0) _lp.y = Math.min(Math.max(_lp.y, y0), y1);
  }
  function updateLabels() {
    if (!labelsEl) return;
    const offX = -labelDocX;
    const offY = -labelDocY;
    const W = labelW || viewW;
    const H = labelH || viewH;
    const focusAmt = focusAmtCur;
    // Top-down blend (2026-11-15): as the camera approaches the
    // poster's top-down framing, the facing fade relaxes — in the
    // reel's top-down frame EVERY ring carries its tag at its own
    // arc position, near side and far side alike. At side elevation
    // the facing rule governs unchanged.
    const topMix = smoothstep(0.80, 1.05, camElevCur);
    // Pass 1: project anchors, compute facing opacity.
    for (const L of coilLabels) {
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
      if (topMix > 0) op = op * (1 - topMix) + topMix * 0.97;
      const s = projectToScreen(world, _scr);
      L.sx = s.x + offX;
      L.sy = s.y + offY;
      const as = projectToScreen(axisW, _asc);
      L.ax = as.x + offX;
      L.ay = as.y + offY;
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
    const larges = coilLabels.filter((l) => l.large && l.op > 0.35);
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
    for (const L of coilLabels) {
      L.el.style.opacity = String(0.96 * L.op);
      L.px = null;
      L.py = null;
      if (L.op > 0.01) {
        labelPos(L, _lp);
        clampLabelPos(L, W, H, offX, offY);
        L.px = Math.round(_lp.x);
        L.py = Math.round(_lp.y);
        L.el.style.transform =
          "translate3d(" + _lp.x.toFixed(1) + "px," + _lp.y.toFixed(1) + "px,0) translate(-50%,-50%)";
      }
    }
    // Selection label: same facing + hero-avoidance treatment as a
    // band label, but never focus-dimmed (it is the selection's own
    // voice) and outside the large-label collision pass.
    if (selLabel) {
      let op = 0;
      if (selLabel.active && mode === "reshape" && selLabel.anchorLocal) {
        const world = structure.localToWorld(_v1.copy(selLabel.anchorLocal));
        const axisW = structure.localToWorld(_v2.set(0, selLabel.anchorY, 0));
        const rx = world.x - axisW.x;
        const rz = world.z - axisW.z;
        const rl = Math.hypot(rx, rz) || 1;
        const vx = camera.position.x - world.x;
        const vy = camera.position.y - world.y;
        const vz = camera.position.z - world.z;
        const vl = Math.hypot(vx, vy, vz) || 1;
        const facing = (rx / rl) * (vx / vl) + (rz / rl) * (vz / vl);
        op = smoothstep(-0.30, 0.30, facing);
        if (topMix > 0) op = op * (1 - topMix) + topMix * 0.97;
        const s = projectToScreen(world, _scr);
        selLabel.sx = s.x + offX;
        selLabel.sy = s.y + offY;
        const as = projectToScreen(axisW, _asc);
        selLabel.ax = as.x + offX;
        selLabel.ay = as.y + offY;
        if (s.behind || selLabel.sx < -80 || selLabel.sx > W + 80 || selLabel.sy < -60 || selLabel.sy > H + 60) op = 0;
        if (!selLabel.w) { selLabel.w = selLabel.el.offsetWidth; selLabel.h = selLabel.el.offsetHeight; }
        if (op > 0 && avoidRects.length) {
          for (const a of avoidRects) {
            const ax = a.x - labelDocX, ay = a.y - labelDocY;
            if (selLabel.sx > ax - 4 && selLabel.sx < ax + a.w + 4 && selLabel.sy > ay - 4 && selLabel.sy < ay + a.h + 4) {
              op = 0;
              break;
            }
          }
        }
      }
      selLabel.el.style.opacity = String(0.96 * op);
      selLabel.px = null;
      selLabel.py = null;
      if (op > 0.01) {
        labelPos(selLabel, _lp);
        clampLabelPos(selLabel, W, H, offX, offY);
        selLabel.px = Math.round(_lp.x);
        selLabel.py = Math.round(_lp.y);
        selLabel.el.style.transform =
          "translate3d(" + _lp.x.toFixed(1) + "px," + _lp.y.toFixed(1) + "px,0) translate(-50%,-50%)";
      }
    }
  }

  // ---- lift animation (per frame, damped, allocation-free)
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
    applyLabelFonts();
    if (labelsEl) {
      const lr = labelsEl.getBoundingClientRect();
      // The label overlay is viewport-fixed (styles.css): its local
      // frame IS the viewport frame, so no scroll term enters the
      // offset. The document-space fallback stays for any embedding
      // that keeps the layer in flow.
      const fixedLayer =
        window.getComputedStyle(labelsEl).position === "fixed";
      labelDocX = lr.left + (fixedLayer ? 0 : window.scrollX);
      labelDocY = lr.top + (fixedLayer ? 0 : window.scrollY);
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
  let goodDprWindows = 0;
  let stillDirty = true;
  let lastScrollAt = -1e9;
  let loadPollAt = 0;
  let loadActive = true; // the catalog stream starts with the page
  let lastScrollY = 0;
  // Visual containment (2026-11-13): the structure's rotation is an
  // accumulated angle, not a pure function of scene time, so its
  // rate can ease while a display state (focus/lift) is active —
  // the lit segment settles instead of sweeping the reading zone
  // again and again. uDim likewise calms the whole backdrop a step
  // while the visitor is working with a filter or search.
  let rotCur = 2.2 * 0.045; // matches the sceneTime start phase
  let dimCur = 1;
  const dimTarget = () => {
    let t = mode === "idle" ? 1 : 0.8;
    // Reading-zone calm: once the visitor has scrolled past the
    // hero into the library tools (search label + help line, the
    // status line, the result count — bare text that sits directly
    // on the scene), the backdrop eases down a step so rope
    // stretches passing behind those lines lose their punch. The
    // hero keeps the visual at full strength; the dim eases back
    // as the visitor scrolls up. This dims the BACKGROUND only —
    // no film over the content.
    if (lastScrollY > viewH * 0.55) t = Math.min(t, 0.78);
    return t;
  };
  try { lastScrollY = window.scrollY || 0; } catch (e) {}

  function renderFrame(now) {
    // Sample the scroll position as of THIS frame, not as of the
    // last scroll-event delivery: a scroll event can land after
    // the frame's rAF callback, which left the scrub camera one
    // frame stale and doubled the visible step on alternating
    // frames. The cached value still serves the frozen/degraded
    // still path, which has no rAF loop of its own.
    try { lastScrollY = window.scrollY || 0; } catch (e) {}
    const dt = lastRender ? Math.min(0.1, (now - lastRender) / 1000) : 0.016;
    if (booted) sceneTime += dt;
    uniforms.uTime.value = sceneTime;
    // Tier projection factor: drawing-buffer height over the
    // frustum height at unit distance (device px per world unit).
    const dbh = renderer.domElement.height || 1;
    uniforms.uProjFactor.value =
      dbh / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
    if (eraHold && (mode === "focus" || mode === "reshape")) {
      // Era hold: damp the rotation onto the era stretch's facing
      // angle and STOP there — the spiral hovers locked on the
      // stretch while the era is selected (2026-11-15 §5).
      const rk = 1 - Math.exp(-Math.max(dt, 0.001) / 0.9);
      rotCur += (eraHold.rotTarget - rotCur) * rk;
      if (Math.abs(eraHold.rotTarget - rotCur) < 0.0005) rotCur = eraHold.rotTarget;
    } else if (mode === "focus" && focusRotTarget != null) {
      // Focus tracking (2026-11-14): damp the rotation to the held
      // angle and stop there. Before this fix the structure kept
      // turning at 0.45x through the whole focus, so the lit section
      // swept away from the fixed camera within seconds — the flight
      // arrived, then lost the section it arrived at.
      const rk = 1 - Math.exp(-Math.max(dt, 0.001) / 0.9);
      rotCur += (focusRotTarget - rotCur) * rk;
      if (Math.abs(focusRotTarget - rotCur) < 0.0005) rotCur = focusRotTarget;
    } else {
      rotCur += Math.max(dt, 0.001) * 0.045 * (mode === "idle" ? 1 : 0.45);
    }
    // Layout-swap rotation kick: a brief spin impulse under the
    // dissolve while the spiral re-forms (the shuffle).
    if (rotBoost > 0.001 && !eraHold) {
      rotCur += rotBoost * Math.max(dt, 0.001);
      rotBoost *= Math.exp(-Math.max(dt, 0.001) / 0.7);
    }
    structure.rotation.y = rotCur;
    structure.position.y = Math.sin(sceneTime * 0.07) * 0.9;
    applyRig(Math.max(dt, 0.001));
    const fk = 1 - Math.exp(-Math.max(dt, 0.001) / 0.9);
    focusAmtCur += (focusAmtTgt - focusAmtCur) * fk;
    uniforms.uFocusAmt.value = focusAmtCur;
    dimCur += (dimTarget() - dimCur) * fk;
    uniforms.uDim.value = dimCur;
    // Dissolve recovery (Phase 2b): after a reshape commit dips
    // uDissolve, it damps back to full over ~700 ms.
    dissolveCur += (1 - dissolveCur) * (1 - Math.exp(-Math.max(dt, 0.001) / 0.22));
    if (dissolveCur > 0.995) dissolveCur = 1;
    uniforms.uDissolve.value = dissolveCur;
    // Layout swap (re-coiling): the dissolve curve is driven by the
    // swap clock and the geometry/labels exchange at its bottom —
    // one dissolve for the whole re-form, never two.
    if (layoutAnim) {
      const t = (now - layoutAnim.start) / 950;
      if (t >= 0.40 && !layoutAnim.swapped) {
        layoutAnim.swapped = true;
        if (doLayoutSwap(layoutAnim.state)) applyDisplay(layoutAnim.state);
      }
      if (t < 0.40) dissolveCur = Math.max(0.22, 1 - (t / 0.40) * 0.78);
      else dissolveCur = Math.min(1, 0.22 + ((t - 0.40) / 0.60) * 0.78);
      uniforms.uDissolve.value = dissolveCur;
      if (t >= 1) layoutAnim = null;
    }
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
    // Scroll glide (2026-11-13, Joshua's phone verdict on the
    // a430c585 package): while a scroll gesture is active the scene
    // renders on EVERY animation frame. The scroll economy that
    // shipped in a430c585 (30 fps cap, halved again during gestures
    // to ~15 fps) stepped the scroll-scrub camera against the
    // compositor's full-rate scroll: the page glided at display
    // rate while the coil advanced in ~66 ms jumps — the "small
    // steps" in his recording. The motion model is dt-based
    // throughout (rig damping, rotation rate, focus ramp), so
    // sampling it at display rate changes only the cadence, never
    // the trajectory. The 30 fps economy cap still applies when no
    // gesture is active, and focus flights outside a gesture keep
    // their established character.
    //
    // Load-window economy (2026-11-13, Joshua's 21:42 recording):
    // the full-rate gesture rendering above made the OPENING
    // seconds worse, not better — while the catalog stream is
    // saturating the main thread (worker commits, record parses,
    // derivation slices), an every-frame WebGL render competes for
    // the same thread, and its irregular frame times ARE the
    // stutter he filmed ("much smoother after a few seconds" —
    // once the load drains, the thread frees and it glides). So
    // while the library is still loading, the gesture exemption is
    // suspended and the plain 30 fps cap governs: an even 30 fps
    // reads smoother than a starved, irregular full rate, and the
    // turns it saves go to the stream's own commits — the load
    // finishes sooner, which ends the window sooner. The load
    // state is read from the library section's own DOM (the
    // skeleton loading branch before the first publish; the
    // "Currently cataloging library" note while counts are not
    // final), polled a few times a second. The moment neither is
    // present, the full-rate glide above returns unchanged.
    const scrolling = now - lastScrollAt < 180;
    if (now - loadPollAt > 250) pollCycle(now);
    if ((!scrolling || loadActive) && lastRender && now - lastRender < FRAME_MS - 1) return;
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
        // DPR ladder: never step mid-scroll (ship-1 fix), and never
        // mid-flight either (2026-11-13): a filter tap sends the
        // camera travelling and the focus ramp running for ~1–2 s;
        // a DPR step inside that window resizes the canvas under
        // the moving scene — the background resize/stutter against
        // the tap in Joshua's second recording. Holding the counter
        // at 2 makes the ladder re-evaluate at the next window,
        // once the rig has settled.
        const rigTgt = modeTarget(sceneTime);
        const inTransit =
          Math.abs(rigTgt.dist - rigCur.dist) > 0.75 ||
          Math.abs(rigTgt.tgtY - rigCur.tgtY) > 0.75 ||
          Math.abs(rigTgt.elev - rigCur.elev) > 0.02 ||
          Math.abs(focusAmtTgt - focusAmtCur) > 0.01 ||
          Math.abs(liftTarget - liftAmt) > 0.01;
        if (fps < 24 && dprTier < DPR_LADDER.length - 1) {
          lowDprWindows++;
          goodDprWindows = 0;
          if (lowDprWindows >= 2) {
            if (now - lastScrollAt < 700 || inTransit) {
              lowDprWindows = 2;
            } else {
              dprTier++;
              lowDprWindows = 0;
              applyDpr();
            }
          }
        } else if (fps >= 29 && dprTier > 0) {
          // Adaptive resolution, up-step (candidate 3): sustained
          // full-rate windows earn the sharper tier back — same
          // mid-scroll / mid-flight guards as the step-down.
          lowDprWindows = 0;
          if (now - lastScrollAt < 700 || inTransit) {
            goodDprWindows = 0;
          } else if (++goodDprWindows >= 3) {
            dprTier--;
            goodDprWindows = 0;
            applyDpr();
          }
        } else {
          lowDprWindows = 0;
          goodDprWindows = 0;
        }
      }
      fpsWindowStart = now;
      fpsWindowFrames = 0;
    }
  }

  // One poll cycle: read the page's load markers, release a stashed
  // reshape the moment the stream clears, and advance the atlas page
  // lifecycle. Runs on the render tick's 250 ms cadence while the
  // loop is alive; a 1 s fallback interval (below) drives the same
  // cycle when the loop is parked by the fps degrade while the tab
  // stays VISIBLE — because page loads/activations are state
  // progression, not rendering: without it, a device that parks
  // during the catalog load would keep starter cells forever even
  // though every legal activation moment (whole segment in the far
  // tier, or a bundled commit) is still being honored by
  // segmentHousekeeping itself. A HIDDEN tab is different
  // (INVENTORY 67, pause-when-hidden): the fallback does not run
  // there — stream work stops with the render loop and resumes on
  // the first visible cycle, with pending states intact.
  function pollCycle(now) {
    loadPollAt = now;
    try {
      loadActive = !!document.querySelector(
        ".tower-index--loading, .tf2-note--cataloging"
      );
    } catch (e) { /* keep previous */ }
    // A layout state stashed during the stream applies first (the
    // re-form establishes the coils the reshape then lights).
    if (!loadActive && pendingLayoutState) {
      const s = pendingLayoutState;
      pendingLayoutState = null;
      setDisplay(s);
    }
    // A reshape stashed during the stream applies the moment the
    // load markers clear (Phase 2b streaming safety).
    if (!loadActive && pendingReshape) {
      const s = pendingReshape;
      pendingReshape = null;
      setDisplay(s);
    }
    segmentHousekeeping();
  }
  const pollTimer = setInterval(() => {
    if (disposed) {
      clearInterval(pollTimer);
      return;
    }
    if (typeof document !== "undefined" && document.hidden) return;
    const now = performance.now();
    if (now - loadPollAt > 900) pollCycle(now);
  }, 1000);

  function start() {
    if (frozen || disposed || degraded || running || contextLost) return;
    running = true;
    lastRender = 0;
    fpsWindowStart = 0;
    fpsWindowFrames = 0;
    loopStart = 0;
    lowDprWindows = 0;
    goodDprWindows = 0;
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function renderStill() {
    if (disposed || contextLost) return;
    uniforms.uTime.value = sceneTime;
    structure.rotation.y = rotCur;
    structure.position.y = Math.sin(sceneTime * 0.07) * 0.9;
    applyRig(10); // snap to target (poster framing incl. scroll scrub)
    focusAmtCur = focusAmtTgt;
    uniforms.uFocusAmt.value = focusAmtCur;
    dimCur = dimTarget();
    uniforms.uDim.value = dimCur;
    dissolveCur = 1;
    uniforms.uDissolve.value = 1;
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

  // ---- layout switching (2026-11-15 re-coiling) ------------------
  let layoutAnim = null;        // {start, state, swapped}
  let pendingLayoutState = null; // layout state stashed mid-stream
  let rotBoost = 0;
  function computeEraHold(spec) {
    if (!spec || typeof spec !== "object") return null;
    const coil = COILS[spec.coil];
    if (!coil) return null;
    const f0 = clamp01(typeof spec.f0 === "number" ? spec.f0 : 0);
    const f1 = clamp01(typeof spec.f1 === "number" ? spec.f1 : f0);
    const thetaMid = coil.thetaStart + ((f0 + f1) / 2) * (coil.thetaEnd - coil.thetaStart);
    const af = frameAt(thetaMid);
    const anchor = af.C.clone().addScaledVector(af.e1, TUBE_R + 1.05);
    const aA = Math.atan2(anchor.z, anchor.x);
    const aC = Math.atan2(Math.cos(CAM_AZ), Math.sin(CAM_AZ));
    const base = aA - aC;
    const twoPi = Math.PI * 2;
    return {
      coil: spec.coil,
      f0,
      f1,
      thetaMid,
      y: af.C.y,
      rotTarget: base + twoPi * Math.round((rotCur - base) / twoPi),
    };
  }
  // On return to the resting layout, panels whose segment page is
  // resident-active move back onto it (their canonical home cells).
  function rehomeActiveSegments() {
    for (let s = 0; s < 8; s++) {
      if (segState[s].status !== "active") continue;
      const page = s + 1;
      for (const i of segPanels[s]) {
        if (!SEG_POOLS[s][placements[i].band]) continue;
        const c = cellFor(page, placements[i].band, segSliceRank[i]);
        if (c < 0) continue;
        instPage[i] = page;
        instCell[i] = c;
        instHomeCell[i] = c;
        instHomePage[i] = page;
      }
    }
  }
  // The exchange at the bottom of the swap dissolve: geometry,
  // wire, dust and labels rebuilt for the new layout; every
  // instance re-homed to the starter page (segment pages return
  // only on the resting layout); transient display state cleared.
  // Returns false (leaving the current layout untouched) on a
  // malformed spec.
  function doLayoutSwap(state) {
    const spec = state.layout;
    if (!spec) return false;
    // Returning to the resting layout rebuilds the scene's own
    // seven-collection defs (hub counts), not a page-supplied list.
    let defs;
    if (spec.key === "rest") {
      defs = restingDefs();
    } else {
      if (!Array.isArray(spec.coils) || !spec.coils.length) return false;
      defs = [];
      for (const c of spec.coils) {
        if (!c || typeof c.name !== "string" || typeof c.count !== "number") return false;
        defs.push({
          key: typeof c.key === "string" ? c.key : "coil:" + defs.length,
          name: c.name,
          count: c.count,
          band: typeof c.band === "number" ? c.band : 0,
          anchorFrac: typeof c.anchorFrac === "number" ? c.anchorFrac : undefined,
        });
      }
    }
    if (mirrorSet.size) clearMirror();
    // Truth allocation serves the curated-group re-coil (line 98)
    // and the Books shelves layout (line 99, Joshua's extension);
    // lane-sub layouts and the resting rebuild keep the generic
    // allocation.
    buildLayoutGeometry(defs, spec.kind === "group" || spec.kind === "shelf");
    layoutKey = spec.key;
    segFrozen = layoutKey !== "rest";
    resetInstanceCells();
    if (!segFrozen) rehomeActiveSegments();
    for (const l of wireLines) {
      structure.remove(l);
      l.geometry.dispose();
      l.material.dispose();
    }
    wireLines = buildWireLines();
    if (dustPoints) {
      structure.remove(dustPoints);
      dustPoints.geometry.dispose();
      dustPoints.material.dispose();
    }
    dustPoints = buildDustPoints();
    rebuildCoilLabels();
    focusGroups = [];
    focusRotTarget = null;
    eraHold = null;
    lastReshape = null;
    if (selLabel) selLabel.active = false;
    rebuildPartition();
    return true;
  }
  function setDisplay(state) {
    if (!state || disposed) return;
    // A state carrying a NEW layout re-forms the spiral first: the
    // dissolve dips, the geometry/labels exchange at its bottom,
    // and the carried display state applies onto the new coils in
    // the same commit. Latest-wins like every other state.
    if (
      state.layout &&
      typeof state.layout === "object" &&
      typeof state.layout.key === "string" &&
      state.layout.key !== layoutKey
    ) {
      if (layoutAnim && !layoutAnim.swapped) {
        // A swap is already mid-dissolve: retarget it (a different
        // target restarts the clock; the same target just updates
        // the state that will apply at the bottom).
        if (layoutAnim.state.layout.key !== state.layout.key) {
          layoutAnim = { start: performance.now(), state, swapped: false };
        } else {
          layoutAnim.state = state;
        }
        return;
      }
      if (running && loadActive) {
        pendingLayoutState = state;
        return;
      }
      pendingLayoutState = null;
      if (frozen || degraded || !running) {
        if (doLayoutSwap(state)) applyDisplay(state);
        stillDirty = true;
        renderStill();
        return;
      }
      layoutAnim = { start: performance.now(), state, swapped: false };
      rotBoost = 2.6;
      return;
    }
    applyDisplay(state);
  }

  function applyDisplay(state) {
    if (!state || disposed) return;
    if (state.kind === "reshape") {
      // Phase 2b streaming safety: while the catalog stream is
      // running, the state is recorded latest-wins and the tick
      // applies it the moment the load markers clear — the
      // re-organization never competes with the stream. (pages.jsx
      // also gates its own emission on the settled load.)
      if (running && loadActive) {
        pendingReshape = state;
        return;
      }
      pendingReshape = null;
      let ok = false;
      try { ok = applyReshape(state); } catch (e) { ok = false; }
      if (!ok) return; // malformed state: previous state untouched
      eraHold = state.eraHold ? computeEraHold(state.eraHold) : null;
    } else if (state.kind === "focus" && Array.isArray(state.groups) && state.groups.length) {
      pendingReshape = null;
      lastReshape = null;
      if (selLabel) selLabel.active = false;
      if (mirrorSet.size) { clearMirror(); rebuildPartition(); }
      mode = "focus";
      focusGroups = state.groups.slice();
      setFocusWeights(focusGroups);
      const ys = focusGroups.map((i) => COILS[i].yMid);
      focusY = ys.reduce((a, b) => a + b, 0) / ys.length;
      const span = Math.max(...ys) - Math.min(...ys);
      // Reel-fidelity push-in (2026-11-14, Joshua 18:05): the
      // flight ends framed ON the chosen band — the section fills
      // the frame's middle, its label large beside it, neighbours
      // above and below. This supersedes the 2026-11-13
      // containment floor (0.66): at 0.50–0.64× the band's turns
      // span the frame height on the phone profile while the near
      // rope stays ~25 units out — rope-sized, not a wall.
      focusDistMul = Math.min(0.64, Math.max(0.50, 0.48 + span / 130));
      focusAmtTgt = 1;
      liftTarget = 0;
      // Focus tracking target: the rotation angle — the equivalent
      // nearest the current angle, so the flight swings the short
      // way — at which the focused band's label anchor faces the
      // camera azimuth. The camera sits at azimuth atan2(cos, sin)
      // of CAM_AZ (its position is (sin, cos) * dist in x/z), and a
      // point at local azimuth a sits at world azimuth a - rotCur
      // under rotation.y, so the anchor faces the camera when
      // rotCur = aAnchor - aCamera (mod 2pi).
      {
        const anchor = COILS[focusGroups[0]] && COILS[focusGroups[0]].anchorLocal;
        if (anchor) {
          const aA = Math.atan2(anchor.z, anchor.x);
          const aC = Math.atan2(Math.cos(CAM_AZ), Math.sin(CAM_AZ));
          const base = aA - aC;
          const twoPi = Math.PI * 2;
          focusRotTarget = base + twoPi * Math.round((rotCur - base) / twoPi);
        } else {
          focusRotTarget = null;
        }
      }
      eraHold = state.eraHold ? computeEraHold(state.eraHold) : null;
    } else if (state.kind === "lift" && Array.isArray(state.items)) {
      pendingReshape = null;
      lastReshape = null;
      focusRotTarget = null;
      eraHold = null;
      if (selLabel) selLabel.active = false;
      if (mirrorSet.size) { clearMirror(); rebuildPartition(); }
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
      pendingReshape = null;
      lastReshape = null;
      focusRotTarget = null;
      eraHold = null;
      if (selLabel) selLabel.active = false;
      if (mirrorSet.size) { clearMirror(); rebuildPartition(); }
      mode = "idle";
      focusGroups = [];
      focusAmtTgt = 0;
      liftTarget = 0;
    }
    // Bundled activation (no-pop-in rule b): resident segment pages
    // swap in SYNCHRONOUSLY under this commit's own transition —
    // the reshape dissolve, the focus flight + weight ramp, or the
    // lift animation — never as a standalone visible pop. An idle
    // commit has no transition to ride, so it only activates
    // segments that pass the FAR test. Focus/lift commits that
    // carried an activation also dip the dissolve briefly so the
    // swap reads as part of the commit (reshape already dips).
    // Skipped off the resting layout (segment lifecycle frozen).
    if (!segFrozen) {
      let activated = false;
      for (let s = 0; s < 8; s++) {
        if (segState[s].status !== "resident") continue;
        if (state.kind === "idle" && !probeSegment(s).allFar) continue;
        if (activateSegment(s)) activated = true;
      }
      if (activated && (state.kind === "focus" || state.kind === "lift")) {
        dissolveCur = Math.min(dissolveCur, 0.5);
      }
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

  // Candidate 2 (2026-11-14): pause rendering while the tab is
  // hidden (HelixCanvas also stops/starts on visibility; both are
  // idempotent, and this handler only resumes a loop IT paused).
  let hiddenWasRunning = false;
  const onVis = () => {
    if (document.hidden) {
      hiddenWasRunning = running;
      stop();
    } else if (hiddenWasRunning) {
      hiddenWasRunning = false;
      if (!frozen && !degraded && booted) start();
    }
  };
  document.addEventListener("visibilitychange", onVis);

  // Context loss (candidate 1 companion): prevent the default
  // (which would kill the context permanently), stop the loop, and
  // on restore force every texture + buffer to re-upload, then
  // resume. The scene's logical state (assignments, decks, rig)
  // lives on the CPU and survives untouched.
  const onCtxLost = (e) => {
    try { e.preventDefault(); } catch (err) {}
    contextLost = true;
    stop();
  };
  const onCtxRestored = () => {
    contextLost = false;
    for (const rec of pageRecs.values()) {
      if (rec.tex) rec.tex.needsUpdate = true;
    }
    if (uniforms.uGrain.value) uniforms.uGrain.value.needsUpdate = true;
    liveTex.needsUpdate = true;
    liftTex.needsUpdate = true;
    scene.traverse((o) => {
      if (o.geometry && o.geometry.attributes) {
        for (const k of Object.keys(o.geometry.attributes)) {
          o.geometry.attributes[k].needsUpdate = true;
        }
      }
      if (o.isInstancedMesh && o.instanceMatrix) o.instanceMatrix.needsUpdate = true;
    });
    stillDirty = true;
    if (!frozen && !degraded && booted) start();
    else renderStill();
  };
  canvas.addEventListener("webglcontextlost", onCtxLost);
  canvas.addEventListener("webglcontextrestored", onCtxRestored);

  if (frozen) renderStill();

  const controller = {
    start,
    stop,
    renderStill,
    isDegraded: () => degraded,
    setSettled,
    setDisplay,
    // Read-only inspection for gates + the error-watch lane:
    // light state by default; full=true adds the per-instance
    // assignment arrays (page / cell / home cell / segment).
    debugState(full) {
      const out = {
        panelCount,
        booted,
        loadActive,
        mode,
        layout: layoutKey,
        coils: COILS.map((c) => ({
          key: c.key,
          name: c.name,
          count: c.count,
          band: c.band,
          stations: c.stations,
          panels: c.panels,
        })),
        eraHold: eraHold
          ? { coil: eraHold.coil, f0: eraHold.f0, f1: eraHold.f1 }
          : null,
        labels: coilLabels.map((L) => ({
          name: COILS[L.group] ? COILS[L.group].name : "",
          x: Math.round(L.sx),
          y: Math.round(L.sy),
          px: L.px != null ? L.px : null,
          py: L.py != null ? L.py : null,
          op: Math.round(L.op * 100) / 100,
          w: L.w,
          h: L.h,
        })),
        rotCur,
        mirror: mirrorSet.size,
        pages: [...pageRecs.values()].map((r) => ({
          page: r.page,
          ready: r.ready,
          count: r.mesh ? r.mesh.count : 0,
          tex: r.tex
            ? {
                format: r.tex.format,
                compressed: !!r.tex.isCompressedTexture,
                w: r.tex.image ? r.tex.image.width : null,
                h: r.tex.image ? r.tex.image.height : null,
              }
            : null,
        })),
        segments: segState.map((s) => s.status),
        reshape: lastReshape,
        decks: [...orders.entries()].map(([k, o]) => ({
          key: k,
          size: o.length,
          dealt: 0,
        })),
        bandEpoch: bandEpoch.slice(),
      };
      if (full) {
        out.assignments = {
          page: Array.from(instPage),
          cell: Array.from(instCell),
          home: Array.from(instHomeCell),
          homePage: Array.from(instHomePage),
          seg: Array.from(instSeg),
          group: placements.map((p) => p.group),
          band: placements.map((p) => p.band),
          focus: Array.from(focusW),
        };
      }
      return out;
    },
    dispose() {
      disposed = true;
      stop();
      window.removeEventListener("scroll", onScrollMark);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onCtxLost);
      canvas.removeEventListener("webglcontextrestored", onCtxRestored);
      window.clearTimeout(resizeTimer);
      if (labelsEl) labelsEl.innerHTML = "";
      if (ktx2Loader && typeof ktx2Loader.dispose === "function") {
        try { ktx2Loader.dispose(); } catch (e) {}
      }
      for (const rec of pageRecs.values()) {
        if (rec.tex && rec.tex !== liveTex) disposeTexture(rec.tex);
        rec.tex = null;
      }
      if (uniforms.uGrain.value) {
        try { uniforms.uGrain.value.dispose(); } catch (e) {}
        uniforms.uGrain.value = null;
      }
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((mm) => mm.dispose());
        }
      });
      basePanelGeo.dispose();
      liveTex.dispose();
      liftTex.dispose();
      try { renderer.dispose(); } catch (e) {}
      try { renderer.forceContextLoss(); } catch (e) {}
      try { if (window.__helixScene === controller) delete window.__helixScene; } catch (e) {}
    },
  };
  try {
    if (typeof window !== "undefined") window.__helixScene = controller;
  } catch (e) {}
  return controller;
}
