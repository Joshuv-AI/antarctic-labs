// Aura Borealis renderer — three.js + GLTFLoader, bundled by Vite as a single
// static JS file served from /assets/aura-renderer.js.
//
// Replaces the previous hand-rolled WebGL renderer that had silent crashes
// (unverified shader compile, manual buffer decoding, fragile scene-graph
// traversal). three.js is already in package.json (^0.180.0) and is used
// elsewhere in the site (NeuformBatchEffects.tsx for the constellation).
//
// The renderer:
//   1. Creates a transparent WebGL2 canvas (or WebGL1 fallback)
//   2. Fetches /assets/models/mountains/single-mountain-snow.glb
//   3. Loads it via GLTFLoader
//   4. Centers + scales the asset to fit a 40° FOV at a comfortable distance
//   5. Renders one frame per requestAnimationFrame, gated by a `paused` flag
//      from postMessage ("aura-controls")
//   6. Reports errors via console.error + document.title so the parent page
//      (and our diagnostic) can see them
//
// On any error during GLB load or scene build the renderer:
//   - logs to console.error
//   - sets document.title to a status string ("ready" / "no-webgl" / "error")
//   - leaves the canvas transparent so the rest of the polar scene stays
//     intact (constellation + fog still paint behind it)
//
// This file is bundled by Vite as a single static asset. The HTML wrapper
// (`public/assets/aura-renderer.html`) just loads it via a `<script>` tag.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const GLB_URL = "/assets/models/mountains/single-mountain-snow.glb";

// Asset bbox from prior offline inspection of the Aura_Borealis_.glb:
//   min (-94.02, -7.79, -164.46), max (94.55, 112.38, 88.22)
//   size (188.57 x 120.17 x 252.67), center (0.26, 52.29, -38.12)
// We compute the actual bbox from the loaded GLTF, but keep this as a fallback.
const FALLBACK_BBOX_CENTER = new THREE.Vector3(0.26, 52.29, -38.12);
const FALLBACK_BBOX_SIZE = new THREE.Vector3(188.57, 120.17, 252.67);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

(async function main() {
  let paused = false;
  let rafId = 0;
  let renderer = null;
  let scene = null;
  let camera = null;
  let rootGroup = null;

  // 1. WebGL context
  const canvas = document.getElementById("c");
  if (!canvas) {
    console.error("Aura renderer: no <canvas id=\"c\"> in DOM");
    document.title = "error:no-canvas";
    return;
  }

  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
  } catch (e) {
    console.error("Aura renderer: WebGLRenderer creation failed:", e.message);
    document.title = "no-webgl";
    return;
  }

  if (!renderer || !renderer.getContext()) {
    console.error("Aura renderer: WebGL context not available");
    document.title = "no-webgl";
    return;
  }

  renderer.setClearColor(0x000000, 0); // transparent
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Tone mapping + exposure: restore the GLB's PBR material detail (snow
  // shading, rock variation, normal map response). Without this the
  // mountain reads as a flat gray silhouette — PBR materials need a
  // tone-mapped pipeline to show their albedo/specular response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  // 2. Scene + camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);

  // 3. Lighting — brighter, more directional. Tuned so the mountain's
  // PBR snow material reads with highlight/shadow separation, and the
  // rock sections show warm-cool color variation.
  const ambient = new THREE.AmbientLight(0xdfeef5, 0.45);
  scene.add(ambient);

  // Key light (sun, warm): strong directional from above-right, casts the
  // dominant highlight on the snow.
  const dir1 = new THREE.DirectionalLight(0xfff4e0, 1.6);
  dir1.position.set(160, 240, 120);
  scene.add(dir1);

  // Fill light (sky bounce, cool): softer counter-light to keep the
  // shaded faces readable rather than crushed to black.
  const dir2 = new THREE.DirectionalLight(0x6fa8c4, 0.85);
  dir2.position.set(-140, 100, -60);
  scene.add(dir2);

  // Rim light (back): very subtle back-light to separate the silhouette
  // from the dark polar background.
  const dir3 = new THREE.DirectionalLight(0xeaf6ff, 0.4);
  dir3.position.set(40, 60, -200);
  scene.add(dir3);

  // 4. Sizing
  function resize() {
    const dpr = clamp(window.devicePixelRatio || 1, 1, 1.75);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(dpr);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    // Re-frame once aspect changes (camera position depends on FOV + bbox + aspect)
    if (rootGroup) frameCameraOnRoot();
  }
  resize();
  window.addEventListener("resize", resize);

  // 8b. Frame the camera on the mountain (not the whole scene bbox, which
  // is dominated by scattered stars spread across the full X/Z extent).
  //
  // The GLB's "Landscape" + "Plane" + "Rock_*" meshes form an actual
  // mountain ~182 x 72 x 253 units (Y is the short axis). The renderer's
  // previous framing used max(sceneSize) = 252 (Z axis), which put the
  // camera at ~416 units — making the mountain appear ~24% of viewport
  // height (distant, small).
  //
  // New framing: choose the right axis based on viewport aspect, then
  // use a 0.55x multiplier so the mountain fills ~80% of the viewport
  // along the chosen axis. Look at the mountain's vertical center so
  // the silhouette rises in the frame.
  function frameCameraOnRoot() {
    if (!rootGroup) return;

    // Recompute mountain bbox (excluding the scattered 14k stars).
    const mountainBox = new THREE.Box3();
    rootGroup.traverse((o) => {
      if (!o.isMesh) return;
      if ((o.name || "").toLowerCase().includes("star")) return;
      o.geometry.computeBoundingBox();
      const wb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      mountainBox.expandByPoint(wb.min);
      mountainBox.expandByPoint(wb.max);
    });
    if (mountainBox.isEmpty()) return;

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    mountainBox.getSize(size);
    mountainBox.getCenter(center);

    // Framing axis based on viewport aspect.
    // - Landscape (aspect >= 1.0): frame on mountain height (Y axis).
    //   The mountain fills the viewport vertically; the wide X extent
    //   naturally extends beyond the viewport edges (tasteful crop).
    // - Portrait (aspect < 1.0): frame on a combined width+height metric
    //   so the mountain is visible BOTH in height AND width on a narrow
    //   viewport. Old behavior (max(width, depth) alone) pushed the
    //   mountain almost entirely off-screen on portrait.
    const aspect = camera.aspect;
    const portrait = aspect < 1.0;
    let framingAxis;
    let multiplier;
    if (portrait) {
      // Combined metric: a weighted blend of height and width so the
      // mountain reads at a reasonable size in both dimensions on
      // portrait viewports (e.g. iPhone ~0.46 aspect).
      framingAxis = size.y * 1.4 + size.x * 0.6;
      multiplier = 0.42;
    } else {
      framingAxis = size.y;
      multiplier = 0.42;
    }

    const fovRad = camera.fov * Math.PI / 180;
    const dist = (framingAxis * multiplier) / (2 * Math.tan(fovRad / 2));

    // Place camera at the mountain's vertical center (slightly below
    // it for a more dramatic low-angle hero view) and look straight at
    // the center. No lookAt lift — the mountain's full height should
    // span the viewport naturally.
    const camY = center.y - size.y * 0.15;

    camera.position.set(center.x, camY, center.z + dist);
    camera.lookAt(center.x, center.y, center.z);
    camera.updateProjectionMatrix();
  }

  // 5. Render loop
  function loop() {
    rafId = requestAnimationFrame(loop);
    if (!paused && rootGroup) {
      renderer.render(scene, camera);
    }
  }
  rafId = requestAnimationFrame(loop);

  // 6. Pause control from parent page
  window.addEventListener("message", (e) => {
    if (!e.data) return;
    if (e.data.type === "aura-controls") {
      paused = Boolean(e.data.controls && e.data.controls.paused);
    }
  });

  // 7. Load GLB
  console.log("Aura renderer: fetching GLB from", GLB_URL);
  let gltf;
  try {
    const loader = new GLTFLoader();
    gltf = await loader.loadAsync(GLB_URL);
  } catch (e) {
    console.error("Aura renderer: GLB load failed:", e.message || e);
    document.title = "error:glb-load";
    return;
  }

  if (!gltf || !gltf.scene) {
    console.error("Aura renderer: GLB has no scene");
    document.title = "error:no-scene";
    return;
  }

  // 8. Center + scale the model to fit the camera frustum
  rootGroup = gltf.scene;
  scene.add(rootGroup);

  // 8b. Star layering fix: the 14k scattered stars in the GLB are
  // rendered AT the same depth as the mountain (same scene, no
  // depthTest discrimination), so they paint on top of the mountain
  // surface and read as "snowflakes pasted on the rock". Move them
  // onto a dedicated render layer that renders BEFORE the mountain
  // and uses additive blending with depthWrite disabled — this makes
  // them read as atmospheric/background pinpoints that the mountain
  // occludes (when in front of a star, the mountain wins, not the star).
  // The GLB materials/meshes are preserved — we only change their
  // render-order properties, not their geometry or textures.
  const mountainGroup = new THREE.Group();
  const starsGroup = new THREE.Group();
  starsGroup.renderOrder = -1;
  rootGroup.traverse((o) => {
    if (!o.isMesh) return;
    const isStar = (o.name || "").toLowerCase().includes("star");
    const target = isStar ? starsGroup : mountainGroup;
    // Reparent: detach from current parent, attach to dedicated group.
    if (o.parent) o.parent.remove(o);
    target.add(o);
    if (isStar) {
      // Stars: disable depth WRITE so the mountain (drawn after) can
      // occlude them; keep depth TEST so they still occlude each other
      // back-to-front via draw order. Switch to additive blending so
      // they brighten the background rather than painting solid dots.
      // Also boost brightness via emissive so the tiny 0.04–0.21-unit
      // star meshes actually register at the camera distance used.
      o.material = o.material.clone(); // avoid mutating shared GLB materials
      o.material.depthWrite = false;
      o.material.transparent = true;
      o.material.blending = THREE.AdditiveBlending;
      o.material.opacity = 1.0;
      o.material.color = new THREE.Color(0xb8d4f0); // pale cool starlight
      // Boost emissive if the material supports it; otherwise fall back
      // to the base color which additive blending will brighten.
      if ("emissive" in o.material) {
        o.material.emissive = new THREE.Color(0x6fa8d0);
        o.material.emissiveIntensity = 1.4;
      }
      // Scale each star mesh up so it's actually visible at the camera
      // distance (~90 units). Original 0.04–0.21-unit stars become
      // 0.4–2.1-unit stars — still tiny pinpoints but now readable.
      o.scale.multiplyScalar(8);
      o.renderOrder = -1;
    }
  });
  scene.add(starsGroup);
  scene.add(mountainGroup);
  rootGroup = mountainGroup; // re-target framing to the mountain only

  // 8c. Procedural snow-vs-rock gradient on mountain meshes.
  //
  // The GLB's "Plane_*" mountain meshes use a single flat color
  // material — they don't carry PBR textures. To restore the visual
  // depth Josh expects (snowy peak → rocky base → dark foreground)
  // without replacing the asset, we override the material color per
  // mesh based on the mesh's vertical position in world space:
  //   - High Y (peak): pale snow white
  //   - Mid Y (slope): cool stone grey
  //   - Low Y (foreground/base): deep blue-grey rock
  //
  // This is a procedural color injection only — the GLB geometry,
  // meshes, names, and bounding boxes are preserved. The material is
  // cloned before mutation to avoid touching the original GLB material.
  const mountainBboxForGradient = new THREE.Box3().setFromObject(mountainGroup);
  const gMinY = mountainBboxForGradient.min.y;
  const gMaxY = mountainBboxForGradient.max.y;
  const gSpanY = Math.max(1, gMaxY - gMinY);
  const snow = new THREE.Color(0xf4f8fb);
  const stone = new THREE.Color(0x8a9aa6);
  const rock = new THREE.Color(0x3d5360);
  const _tmpColor = new THREE.Color();
  function gradientColorForY(worldY) {
    const t = Math.max(0, Math.min(1, (worldY - gMinY) / gSpanY));
    // Two-stop gradient: 0..0.55 rock→stone, 0.55..1 stone→snow
    if (t < 0.55) {
      return _tmpColor.copy(rock).lerp(stone, t / 0.55);
    }
    return _tmpColor.copy(stone).lerp(snow, (t - 0.55) / 0.45);
  }
  mountainGroup.traverse((o) => {
    if (!o.isMesh) return;
    if ((o.name || "").toLowerCase().includes("rock")) {
      // Rocks stay slightly cooler than the slope color so they read
      // as distinct dark accents on the snow surface.
      o.material = o.material.clone();
      o.material.color = new THREE.Color(0x4a5860);
    } else {
      // Sample the mesh's vertical center to pick a gradient stop.
      o.geometry.computeBoundingBox();
      const lb = o.geometry.boundingBox.clone();
      const wb = lb.applyMatrix4(o.matrixWorld);
      const cy = (wb.min.y + wb.max.y) / 2;
      o.material = o.material.clone();
      o.material.color = gradientColorForY(cy);
    }
    // Slight roughness bump to keep the gradient matte (snow/rock
    // aren't shiny).
    if ("roughness" in o.material) o.material.roughness = 0.9;
    if ("metalness" in o.material) o.material.metalness = 0.0;
  });

  // Frame the camera on the actual mountain geometry (not the whole scene,
  // which is dominated by scattered stars spread across the full bbox).
  frameCameraOnRoot();

  console.log("Aura renderer: scene loaded");
  document.title = "ready";
})().catch((e) => {
  console.error("Aura renderer: unhandled error:", e && e.message ? e.message : e, e && e.stack ? e.stack : "");
  document.title = "error:unhandled";
});
