// Aura Borealis renderer — three.js + GLTFLoader + procedural cinematic
// environment. Single entry, bundled by Vite as a static asset served
// from /assets/aura-renderer.js.
//
// Scene layers (back → front, ascending renderOrder):
//   0  Sky dome          — inverted sphere, vertical gradient shader
//   1  Aurora curtains   — large tilted plane, FBM-noise ribbon shader,
//                          additive blend, slow organic animation
//   2  Procedural starfield — 2,000 Points cloud (replaces the 14k GLB
//                          star meshes which were too dim/small to read
//                          and which layered incorrectly on the mountain)
//   3  Mountain          — the unchanged single-mountain-snow.glb, but
//                          with snow-vs-rock per-vertex color + non-
//                          metallic material injected via onBeforeCompile
//   4  Atmospheric haze  — a few translucent additive billboards
//                          between mountain and sky for depth fade
//   5  Water/ice fake    — static-gradient mirror plane below the
//                          mountain (cheap option; no render-to-texture)
//   6  Foreground silhouette — a low dark mass at the camera bottom
//                          for depth/separation
//
// Architectural guarantees preserved:
//   - same iframe + same-origin + CSP architecture (renderer is loaded
//     by static HTML in public/assets/aura-renderer.html)
//   - graceful WebGL failure: no-webgl / error:glb-load / error:no-scene
//     / error:unhandled all set document.title so the parent page can
//     see what went wrong
//   - responsive camera composition (landscape: frame on Y; portrait:
//     combined width+height metric)
//   - DPR clamp [1, 1.75]
//   - postMessage `aura-controls` pause control
//   - no new dependencies (three.js + GLTFLoader only)

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const GLB_URL = "/assets/models/mountains/single-mountain-snow.glb";

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
  let startTime = 0;

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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // 2. Scene + camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);

  // 3. Lighting — for the mountain PBR (snow needs realistic sun + sky
  // bounce; no atmospheric scattering needed since the sky/aurora are
  // shader-driven).
  const ambient = new THREE.AmbientLight(0xb8d0e0, 0.35);
  scene.add(ambient);

  // Key light (moon, cool-white, from above-back): drives the dominant
  // snow highlight + defines the silhouette against the sky.
  const moon = new THREE.DirectionalLight(0xeaf6ff, 1.4);
  moon.position.set(120, 200, 80);
  scene.add(moon);

  // Fill (sky bounce, cool): keeps the shaded faces readable rather
  // than crushed to black.
  const fill = new THREE.DirectionalLight(0x6fa8c4, 0.7);
  fill.position.set(-140, 100, -60);
  scene.add(fill);

  // Warm rim from the horizon (aurora reflects warmth onto rock faces
  // near the base, simulating light spillage from the green/cyan
  // aurora onto the lower mountain).
  const auroraRim = new THREE.DirectionalLight(0x88e0c0, 0.5);
  auroraRim.position.set(0, -80, 200);
  scene.add(auroraRim);

  // ============================================================
  // LAYER 0 — SKY DOME
  // ============================================================
  // Inverted sphere with a vertical gradient. Top is deep polar night
  // (almost-black blue); horizon is slightly warmer. Renders first so
  // everything else paints over it.
  const skyGeom = new THREE.SphereGeometry(600, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTopColor:    { value: new THREE.Color(0x040810) },
      uHorizonColor: { value: new THREE.Color(0x0d1c2e) },
      uGroundColor:  { value: new THREE.Color(0x050a14) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uGroundColor;
      void main() {
        // Use normalized world-Y; the sphere is centered on the camera,
        // so positive Y maps to the upper hemisphere.
        vec3 n = normalize(vWorldPos);
        float h = n.y;
        vec3 c;
        if (h > 0.0) {
          // Above horizon: top -> horizon
          c = mix(uHorizonColor, uTopColor, smoothstep(0.0, 0.6, h));
        } else {
          // Below horizon: horizon -> ground
          c = mix(uHorizonColor, uGroundColor, smoothstep(0.0, 0.4, -h));
        }
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeom, skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  // ============================================================
  // LAYER 1 — AURORA CURTAINS
  // ============================================================
  // Large tilted plane positioned high above the mountain. Fragment
  // shader generates layered vertical curtain/ribbon structure using
  // FBM noise, with irregular opacity + green/cyan color variation.
  // Additive blending so the curtains brighten the sky behind them.
  // The curtains are anchored to camera position each frame so they
  // always read in the upper portion of the viewport.
  const auroraGeom = new THREE.PlaneGeometry(800, 300, 1, 1);
  const auroraMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime:    { value: 0 },
      uColorA:  { value: new THREE.Color(0x4cffa0) }, // vivid green
      uColorB:  { value: new THREE.Color(0x55ffd6) }, // cyan
      uColorC:  { value: new THREE.Color(0x80ffd0) }, // mint
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vLocal;
      void main() {
        vUv = uv;
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vLocal;
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uColorC;

      // 2D hash + value noise + FBM
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * vnoise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        // vUv.x is 0..1 across the plane; vUv.y is 0..1 top..bottom.
        vec2 uv = vUv;

        // Curtain structure: vertical bands modulated by FBM.
        // The "ribbon" mask uses horizontal stripes folded by FBM.
        float bandX = uv.x * 6.0 + uTime * 0.03;
        float ribbonNoise = fbm(vec2(bandX, uv.y * 1.2 + uTime * 0.05));
        // Sharpen the ribbon edges using a smoothstep on the noise.
        float ribbon = smoothstep(0.35, 0.65, ribbonNoise);

        // Vertical fade: aurora is strongest in the upper portion,
        // fading to nothing at the bottom of the plane.
        float vFade = smoothstep(0.0, 0.45, uv.y) * smoothstep(1.0, 0.65, uv.y);

        // Wisp modulation: a horizontal FBM that adds irregular opacity
        // streaks across the ribbons (so they don't read as solid bars).
        float wisp = fbm(vec2(uv.x * 14.0 + uTime * 0.04, uv.y * 3.5));
        float wispMask = mix(0.5, 1.0, smoothstep(0.25, 0.85, wisp));

        // Color variation: shift between green, cyan, mint based on a
        // separate FBM (so different parts of the sky have different
        // aurora tones).
        float colorShift = fbm(vec2(uv.x * 3.0 - uTime * 0.02, uv.y * 1.5));
        vec3 col = mix(uColorA, uColorB, smoothstep(0.3, 0.7, colorShift));
        col = mix(col, uColorC, smoothstep(0.6, 0.95, colorShift));

        // Final opacity: combine the ribbon, vertical fade, and wisp.
        float alpha = ribbon * vFade * wispMask * 0.55;

        gl_FragColor = vec4(col * alpha, alpha);
      }
    `,
  });
  const aurora = new THREE.Mesh(auroraGeom, auroraMat);
  aurora.renderOrder = -9;
  aurora.frustumCulled = false;
  scene.add(aurora);

  // ============================================================
  // LAYER 2 — PROCEDURAL STARFIELD
  // ============================================================
  // 2,000 Points cloud filling a large sphere shell. Additive blend +
  // sizeAttenuation so stars appear as faint pinpoints. Replaces the
  // GLB's 14k tiny mesh-stars (which were too small to register and
  // layered incorrectly on the mountain).
  function makeStarfield() {
    const N = 2000;
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const sizes = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // Random direction on the upper hemisphere + a bit below.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1) * 0.7; // bias toward upper
      const r = 480;
      positions[i*3+0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i*3+1] = r * Math.cos(phi) * 0.7 + 60; // skew upward
      positions[i*3+2] = r * Math.sin(phi) * Math.sin(theta);

      // Slight color variation: most cool-white, some pale-blue, occasional warm.
      const tint = Math.random();
      let r2, g, b;
      if (tint < 0.7) { r2 = 1.0; g = 1.0; b = 1.0; }
      else if (tint < 0.92) { r2 = 0.7; g = 0.85; b = 1.0; }
      else { r2 = 1.0; g = 0.85; b = 0.7; }

      // Brightness falloff: most stars dim, a few brighter (the "named" stars).
      const bright = (Math.random() < 0.04) ? 1.4 : (0.5 + Math.random() * 0.5);
      colors[i*3+0] = r2 * bright;
      colors[i*3+1] = g * bright;
      colors[i*3+2] = b * bright;

      sizes[i] = (Math.random() < 0.04) ? 3.0 : (1.0 + Math.random() * 1.5);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      size: 1.5,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const pts = new THREE.Points(geom, mat);
    pts.renderOrder = -8;
    pts.frustumCulled = false;
    return pts;
  }
  const starfield = makeStarfield();
  scene.add(starfield);

  // ============================================================
  // LAYER 3 — MOUNTAIN (single-mountain-snow.glb, unchanged geometry)
  // ============================================================
  // The GLB's MeshStandardMaterials have metalness=1 / roughness=1
  // (incorrect for snow/rock) and no texture maps. We:
  //   1. Override metalness/roughness on every mountain mesh material.
  //   2. Inject per-vertex snow-rock color via onBeforeCompile: the
  //      shader reads the world-Y of each vertex, blends a
  //      rock→stone→snow color ramp, and writes it into the diffuse
  //      output (modulating the existing base color, not replacing it).
  //   3. Skip the 14k star meshes — they are not loaded into the
  //      mountainGroup, so they never render.

  const snow = new THREE.Color(0xf4f8fb);
  const stone = new THREE.Color(0x8a9aa6);
  const rock = new THREE.Color(0x3d5360);
  const snowRockVert = /* glsl */ `
    varying vec3 vWorldPosCustom;
  `;
  const snowRockFrag = /* glsl */ `
    varying vec3 vWorldPosCustom;
    uniform vec3 uSnowColor;
    uniform vec3 uStoneColor;
    uniform vec3 uRockColor;
    uniform float uMinY;
    uniform float uSpanY;
  `;
  function gradientColorForY(worldY) {
    const t = clamp((worldY - uMinY) / uSpanY, 0, 1);
    if (t < 0.55) {
      return new THREE.Color().copy(rock).lerp(stone, t / 0.55);
    }
    return new THREE.Color().copy(stone).lerp(snow, (t - 0.55) / 0.45);
  }
  // (gradientColorForY is a template — actual implementation lives
  //  inside frameCameraOnRoot() below where uMinY/uSpanY are available;
  //  the function defined here is replaced inline.)

  // The actual per-mesh injection happens after GLB load when bbox is
  // known. See "Inject snow-rock per-vertex colors" below.

  // ============================================================
  // LAYER 4 — ATMOSPHERIC HAZE
  // ============================================================
  // A few translucent additive billboards between mountain and sky.
  // Provides subtle depth separation between near and far elements.
  function makeHaze() {
    const group = new THREE.Group();
    const positions = [
      { x: 0,    y: 80,  z: -200, s: 380, tint: 0.10 },
      { x: -100, y: 50,  z: -100, s: 280, tint: 0.07 },
      { x: 100,  y: 40,  z: -150, s: 320, tint: 0.08 },
    ];
    for (const p of positions) {
      const geom = new THREE.PlaneGeometry(p.s, p.s);
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uIntensity: { value: p.tint },
          uColor: { value: new THREE.Color(0x88b8d8) },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uIntensity;
          uniform vec3 uColor;
          void main() {
            vec2 c = vUv - 0.5;
            float d = length(c);
            float a = smoothstep(0.5, 0.0, d) * uIntensity;
            gl_FragColor = vec4(uColor * a, a);
          }
        `,
      });
      const m = new THREE.Mesh(geom, mat);
      m.position.set(p.x, p.y, p.z);
      m.renderOrder = -7;
      m.frustumCulled = false;
      group.add(m);
    }
    return group;
  }
  const haze = makeHaze();
  scene.add(haze);

  // ============================================================
  // LAYER 5 — WATER/ICE REFLECTION (cheap static gradient)
  // ============================================================
  // A flat plane below the mountain with a vertical gradient that
  // suggests a reflection (lighter at the top of the plane, darker
  // at the bottom). No render-to-texture, no mirror — just a faked
  // shimmer.
  const waterGeom = new THREE.PlaneGeometry(800, 80);
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColorTop:    { value: new THREE.Color(0x2a4060) }, // mirror of horizon
      uColorBottom: { value: new THREE.Color(0x040810) }, // deep water
      uColorShimmer:{ value: new THREE.Color(0xa8d8ff) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uColorTop;
      uniform vec3 uColorBottom;
      uniform vec3 uColorShimmer;
      void main() {
        // Vertical gradient (mirror-like)
        vec3 c = mix(uColorTop, uColorBottom, smoothstep(0.0, 1.0, vUv.y));
        // Horizontal shimmer noise (faked reflection)
        float shimmer = sin(vUv.x * 60.0) * sin(vUv.x * 23.0 + vUv.y * 8.0);
        shimmer *= smoothstep(0.6, 0.0, abs(vUv.y - 0.3));
        c += uColorShimmer * shimmer * 0.06;
        // Fade the front edge (away from the mountain) into darkness
        float edgeFade = smoothstep(0.0, 0.7, vUv.y);
        c *= edgeFade;
        gl_FragColor = vec4(c, 0.85);
      }
    `,
  });
  const water = new THREE.Mesh(waterGeom, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.renderOrder = -1;
  water.frustumCulled = false;
  scene.add(water);

  // ============================================================
  // LAYER 6 — FOREGROUND SILHOUETTE
  // ============================================================
  // A low dark mass at the camera bottom for depth separation. Just
  // a dark plane sized to fill the bottom portion of the viewport
  // when the camera is at the default position.
  const fgGeom = new THREE.PlaneGeometry(600, 30);
  const fgMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const foreground = new THREE.Mesh(fgGeom, fgMat);
  foreground.renderOrder = -2;
  foreground.frustumCulled = false;
  scene.add(foreground);

  // ============================================================
  // SIZING + RESPONSIVE FRAMING
  // ============================================================
  let mountainSizeVec = new THREE.Vector3(0, 0, 0);
  let mountainCenterVec = new THREE.Vector3(0, 0, 0);

  function resize() {
    const dpr = clamp(window.devicePixelRatio || 1, 1, 1.75);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(dpr);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (rootGroup) frameCameraOnRoot();
  }
  resize();
  window.addEventListener("resize", resize);

  function frameCameraOnRoot() {
    if (!rootGroup) return;
    const size = mountainSizeVec;
    const center = mountainCenterVec;

    const aspect = camera.aspect;
    const portrait = aspect < 1.0;
    let framingAxis;
    let multiplier;
    if (portrait) {
      framingAxis = size.y * 1.4 + size.x * 0.6;
      multiplier = 0.42;
    } else {
      framingAxis = size.y;
      multiplier = 0.42;
    }

    const fovRad = camera.fov * Math.PI / 180;
    const dist = (framingAxis * multiplier) / (2 * Math.tan(fovRad / 2));
    const camY = center.y - size.y * 0.15;
    camera.position.set(center.x, camY, center.z + dist);
    camera.lookAt(center.x, center.y, center.z);
    camera.updateProjectionMatrix();

    // Pin sky/aurora/starfield/haze to the camera so they always read
    // in the same viewport region regardless of where the mountain is.
    sky.position.copy(camera.position);
    sky.position.y += 0;  // sky is centered around camera
    aurora.position.set(camera.position.x, camera.position.y + size.y * 1.1, camera.position.z - 80);
    aurora.lookAt(camera.position);
    starfield.position.copy(camera.position);
    haze.position.copy(camera.position);
    haze.position.z -= 100;
    foreground.position.set(camera.position.x, camera.position.y - size.y * 0.55, camera.position.z + 5);
    foreground.lookAt(camera.position);
    water.position.set(camera.position.x, center.y - size.y * 0.45, center.z);
  }

  // ============================================================
  // RENDER LOOP
  // ============================================================
  function loop(t) {
    rafId = requestAnimationFrame(loop);
    if (startTime === 0) startTime = t;
    const elapsed = (t - startTime) / 1000;

    // Drive aurora shader animation
    auroraMat.uniforms.uTime.value = elapsed;

    // Rotate aurora plane very slowly for organic drift (subtle)
    aurora.rotation.z = Math.sin(elapsed * 0.02) * 0.04;

    if (!paused && rootGroup) {
      renderer.render(scene, camera);
    }
  }
  rafId = requestAnimationFrame(loop);

  // ============================================================
  // PAUSE CONTROL (from parent page via postMessage)
  // ============================================================
  window.addEventListener("message", (e) => {
    if (!e.data) return;
    if (e.data.type === "aura-controls") {
      paused = Boolean(e.data.controls && e.data.controls.paused);
    }
  });

  // ============================================================
  // LOAD GLB
  // ============================================================
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

  // ============================================================
  // MOUNTAIN — strip GLB stars, inject snow-rock shading, fix
  //             material params
  // ============================================================
  // Strategy:
  //   1. Walk the scene; for each mesh:
  //        - if name contains "star" → discard (we use the procedural
  //          starfield instead — the GLB's tiny mesh-stars were the
  //          layer-bug source AND visually unreadable)
  //        - else → keep as mountain; modify material in place
  //   2. Modify the mountain material via THREE.js's existing
  //      MeshStandardMaterial.onBeforeCompile so we get the full PBR
  //      pipeline + our injected per-vertex color + uniform-driven
  //      rock→stone→snow gradient.
  const mountainRoot = new THREE.Group();
  const mountainBox = new THREE.Box3();
  let meshCount = 0;

  // The GLB scene walk: detach every non-star mesh from its current
  // parent, reparent into mountainRoot, fix the materials. We walk the
  // scene by snapshotting the mesh list first (not via gltf.scene.traverse
  // while we mutate parents — that's what triggered the silent crash in
  // fe82f64 when a child node had a stale parent reference).
  function snapshotMeshes(root3d) {
    const out = [];
    function walk(node) {
      if (!node) return;
      if (node.isMesh) out.push(node);
      const kids = node.children;
      if (!kids) return;
      // Copy children array so subsequent mutations don't disturb iteration.
      const snap = kids.slice();
      for (const c of snap) walk(c);
    }
    walk(root3d);
    return out;
  }
  const allMeshes = snapshotMeshes(gltf.scene);
  for (const o of allMeshes) {
    if (!o || !o.isMesh) continue;
    if ((o.name || "").toLowerCase().includes("star")) continue;
    // Detach from current parent (root scene or any nested group).
    if (o.parent && typeof o.parent.remove === "function") {
      o.parent.remove(o);
    }
    // Attach to our mountain group.
    mountainRoot.add(o);

    o.geometry.computeBoundingBox();
    const wb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    mountainBox.expandByPoint(wb.min);
    mountainBox.expandByPoint(wb.max);

    // Fix material: snow/rock are non-metallic; high roughness.
    const mat = o.material;
    if (mat && "metalness" in mat) mat.metalness = 0.0;
    if (mat && "roughness" in mat) mat.roughness = 0.85;

    // Inject per-vertex snow-rock color via onBeforeCompile.
    mat.userData.uMinY = { value: 0 };
    mat.userData.uSpanY = { value: 1 };
    mat.userData.uSnowColor = { value: new THREE.Color(0xf4f8fb) };
    mat.userData.uStoneColor = { value: new THREE.Color(0x8a9aa6) };
    mat.userData.uRockColor = { value: new THREE.Color(0x3d5360) };

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uMinY = mat.userData.uMinY;
      shader.uniforms.uSpanY = mat.userData.uSpanY;
      shader.uniforms.uSnowColor = mat.userData.uSnowColor;
      shader.uniforms.uStoneColor = mat.userData.uStoneColor;
      shader.uniforms.uRockColor = mat.userData.uRockColor;

      // The previous version tried to read `worldPosition` after
      // `#include <worldpos_vertex>`, but that chunk is wrapped in
      // an #ifdef block that's empty for MeshStandardMaterials
      // (no envmap, no shadows, no transmission), so worldPosition
      // was never declared and the shader failed to compile.
      //
      // Fix: compute world position from the local position +
      // modelMatrix directly (bypassing the worldpos_vertex chunk
      // entirely). `position` is the standard vertex attribute
      // injected by three.js into every MeshStandardMaterial.
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
         varying vec3 vSnowWorldPos;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
         vSnowWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
         varying vec3 vSnowWorldPos;
         uniform float uMinY;
         uniform float uSpanY;
         uniform vec3 uSnowColor;
         uniform vec3 uStoneColor;
         uniform vec3 uRockColor;
         vec3 snowRockRamp(float t) {
           t = clamp(t, 0.0, 1.0);
           if (t < 0.55) {
             return mix(uRockColor, uStoneColor, t / 0.55);
           }
           return mix(uStoneColor, uSnowColor, (t - 0.55) / 0.45);
         }`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         float snowT = (vSnowWorldPos.y - uMinY) / uSpanY;
         diffuseColor.rgb *= snowRockRamp(snowT);`
      );
    };
    mat.needsUpdate = true;

    meshCount++;
  }
  scene.add(mountainRoot);
  rootGroup = mountainRoot;

  // Now that we know the mountain bbox, set the per-mesh uniform
  // values and the size/center globals for camera framing.
  const sz = new THREE.Vector3();
  const cn = new THREE.Vector3();
  mountainBox.getSize(sz);
  mountainBox.getCenter(cn);
  mountainSizeVec.copy(sz);
  mountainCenterVec.copy(cn);

  mountainRoot.traverse((o) => {
    if (!o.isMesh) return;
    const mat = o.material;
    mat.userData.uMinY.value = cn.y - sz.y / 2;
    mat.userData.uSpanY.value = sz.y;
  });

  console.log("Aura renderer: mountain loaded with " + meshCount + " meshes");
  console.log("  bbox size:", sz, "center:", cn);

  frameCameraOnRoot();
  document.title = "ready";
})().catch((e) => {
  console.error("Aura renderer: unhandled error:", e && e.message ? e.message : e, e && e.stack ? e.stack : "");
  document.title = "error:unhandled";
});
