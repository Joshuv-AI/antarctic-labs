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

  // 2. Scene + camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);

  // 3. Lighting — matches the polar palette
  const ambient = new THREE.AmbientLight(0xeaf6ff, 0.55);
  scene.add(ambient);
  const dir1 = new THREE.DirectionalLight(0xeaf6ff, 1.0);
  dir1.position.set(120, 200, 80);
  scene.add(dir1);
  const dir2 = new THREE.DirectionalLight(0x86b9c8, 0.45);
  dir2.position.set(-100, 80, -80);
  scene.add(dir2);

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

    // Choose which axis to frame against based on viewport aspect.
    // - Landscape / square viewports: the mountain's Y (height) is the
    //   limiting axis; frame on Y so the silhouette fills the viewport.
    // - Narrow portrait: the mountain's X (width) becomes the limiting
    //   axis; frame on X so the silhouette fills the narrow viewport.
    const aspect = camera.aspect;
    const portrait = aspect < 1.0;
    const framingAxis = portrait ? Math.max(size.x, size.z) : size.y;
    const multiplier = 0.55;

    const fovRad = camera.fov * Math.PI / 180;
    const dist = (framingAxis * multiplier) / (2 * Math.tan(fovRad / 2));

    camera.position.set(center.x, center.y, center.z + dist);
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

  // Frame the camera on the actual mountain geometry (not the whole scene,
  // which is dominated by scattered stars spread across the full bbox).
  frameCameraOnRoot();

  console.log("Aura renderer: scene loaded");
  document.title = "ready";
})().catch((e) => {
  console.error("Aura renderer: unhandled error:", e && e.message ? e.message : e, e && e.stack ? e.stack : "");
  document.title = "error:unhandled";
});
