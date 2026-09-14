import { useEffect, useRef } from "react";
import * as THREE from "three";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function seededRandom(seed) {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createMountainLayer({
  count,
  depth,
  width,
  baseY,
  height,
  color,
  seed,
  opacity = 1,
  jaggedness = 1,
}) {
  const random = seededRandom(seed);
  const group = new THREE.Group();

  for (let i = 0; i < count; i += 1) {
    const mountainWidth = lerp(width * 0.65, width * 1.45, random());
    const mountainHeight =
      height * lerp(0.65, 1.25, random()) * jaggedness;

    const geometry = new THREE.ConeGeometry(
      mountainWidth,
      mountainHeight,
      Math.floor(lerp(5, 9, random())),
      1,
    );

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity > 0.75,
      flatShading: true,
    });

    const mountain = new THREE.Mesh(geometry, material);

    mountain.position.set(
      (random() - 0.5) * width * 2.4,
      baseY + mountainHeight * 0.5,
      -depth + (random() - 0.5) * 18,
    );

    mountain.rotation.y = random() * Math.PI;
    mountain.rotation.z = (random() - 0.5) * 0.08;

    group.add(mountain);

    // Snow cap.
    if (random() > 0.2) {
      const capHeight = mountainHeight * lerp(0.08, 0.18, random());
      const capGeometry = new THREE.ConeGeometry(
        mountainWidth * lerp(0.2, 0.42, random()),
        capHeight,
        5,
        1,
      );

      const capMaterial = new THREE.MeshBasicMaterial({
        color: 0xe8f2f2,
        transparent: opacity < 1,
        opacity: opacity * 0.72,
        depthWrite: false,
        flatShading: true,
      });

      const cap = new THREE.Mesh(capGeometry, capMaterial);

      cap.position.copy(mountain.position);
      cap.position.y += mountainHeight * 0.46;
      cap.rotation.y = mountain.rotation.y;

      group.add(cap);
    }
  }

  return group;
}

function createStarField(count, radius, seed = 42) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;

    const theta = random() * Math.PI * 2;
    const phi = Math.acos(lerp(0.05, 0.85, random()));

    positions[i3] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[i3 + 1] = Math.cos(phi) * radius * 0.75;
    positions[i3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;

    sizes[i] = lerp(0.35, 1.6, random());
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "aSize",
    new THREE.BufferAttribute(sizes, 1),
  );

  const material = new THREE.PointsMaterial({
    color: 0xdceef2,
    size: 0.65,
    transparent: true,
    opacity: 0.72,
    sizeAttenuation: true,
    depthWrite: false,
  });

  return new THREE.Points(geometry, material);
}

function createSnowField(count, width, depth, seed = 17) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;

    positions[i3] = (random() - 0.5) * width;
    positions[i3 + 1] = lerp(-1, 30, random());
    positions[i3 + 2] = -random() * depth;
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );

  const material = new THREE.PointsMaterial({
    color: 0xe9f6f7,
    size: 0.045,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    sizeAttenuation: true,
  });

  return new THREE.Points(geometry, material);
}

function createIceberg(seed = 91) {
  const random = seededRandom(seed);
  const group = new THREE.Group();

  const baseGeometry = new THREE.IcosahedronGeometry(1, 1);

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fbec2,
    roughness: 0.3,
    metalness: 0.04,
    flatShading: true,
  });

  const count = 10;

  for (let i = 0; i < count; i += 1) {
    const iceberg = new THREE.Mesh(
      baseGeometry.clone(),
      baseMaterial.clone(),
    );

    const scale = lerp(0.8, 2.8, random());

    iceberg.scale.set(
      scale * lerp(0.65, 1.35, random()),
      scale * lerp(0.8, 1.9, random()),
      scale * lerp(0.65, 1.2, random()),
    );

    iceberg.position.set(
      (random() - 0.5) * 38,
      -0.15 + random() * 0.35,
      -lerp(2, 18, random()),
    );

    iceberg.rotation.set(
      random() * 0.25,
      random() * Math.PI,
      random() * 0.2,
    );

    group.add(iceberg);

    if (random() > 0.3) {
      const snowGeometry = new THREE.IcosahedronGeometry(1, 1);

      const snow = new THREE.Mesh(
        snowGeometry,
        new THREE.MeshStandardMaterial({
          color: 0xe9f5f5,
          roughness: 0.7,
          metalness: 0,
          flatShading: true,
          transparent: true,
          opacity: 0.82,
        }),
      );

      snow.scale.copy(iceberg.scale);
      snow.scale.multiplyScalar(0.52);

      snow.position.copy(iceberg.position);
      snow.position.y += iceberg.scale.y * 0.58;

      snow.rotation.copy(iceberg.rotation);

      group.add(snow);
    }
  }

  return group;
}

function createAuroraRibbon({
  width = 32,
  segments = 90,
  amplitude = 2.2,
  height = 18,
  depth = -22,
  phase = 0,
  color = 0x6fded0,
  opacity = 0.2,
}) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(segments * 2 * 3);
  const colors = new Float32Array(segments * 2 * 3);

  const baseColor = new THREE.Color(color);
  const secondary = new THREE.Color(0x739cff);

  for (let i = 0; i < segments; i += 1) {
    const t = i / (segments - 1);
    const x = (t - 0.5) * width;

    const wave =
      Math.sin(t * Math.PI * 2.8 + phase) * amplitude +
      Math.sin(t * Math.PI * 6.1 + phase * 1.7) *
        amplitude *
        0.32;

    const lowerY =
      height +
      wave +
      Math.sin(t * Math.PI * 1.4 + phase) * 1.2;

    const upperY = lowerY + 1.9;

    const i6 = i * 6;

    positions[i6] = x;
    positions[i6 + 1] = lowerY;
    positions[i6 + 2] = depth;

    positions[i6 + 3] = x;
    positions[i6 + 4] = upperY;
    positions[i6 + 5] = depth - 0.15;

    const mix = 0.35 + 0.65 * Math.sin(t * Math.PI);

    const lowerColor = baseColor.clone().lerp(secondary, mix * 0.42);
    const upperColor = baseColor.clone().lerp(secondary, (1 - mix) * 0.52);

    colors[i6] = lowerColor.r;
    colors[i6 + 1] = lowerColor.g;
    colors[i6 + 2] = lowerColor.b;

    colors[i6 + 3] = upperColor.r;
    colors[i6 + 4] = upperColor.g;
    colors[i6 + 5] = upperColor.b;
  }

  const indices = [];

  for (let i = 0; i < segments - 1; i += 1) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;

    indices.push(a, c, b);
    indices.push(b, c, d);
  }

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(colors, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Mesh(geometry, material);
}

function createWater({
  width = 90,
  depth = 70,
  segmentsX = 80,
  segmentsZ = 60,
}) {
  const geometry = new THREE.PlaneGeometry(
    width,
    depth,
    segmentsX,
    segmentsZ,
  );

  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);

    const wave =
      Math.sin(x * 0.12 + z * 0.08) * 0.07 +
      Math.sin(x * 0.035 - z * 0.16) * 0.09 +
      Math.sin(x * 0.21 + z * 0.025) * 0.025;

    positions.setY(i, wave);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x07151c,
    roughness: 0.18,
    metalness: 0.42,
    clearcoat: 0.75,
    clearcoatRoughness: 0.18,
    transparent: true,
    opacity: 0.96,
  });

  const water = new THREE.Mesh(geometry, material);
  water.position.y = -1.05;

  return water;
}

function createIceShelf() {
  const group = new THREE.Group();

  const shelfGeometry = new THREE.BoxGeometry(70, 2.4, 18, 10, 2, 8);

  const shelfMaterial = new THREE.MeshStandardMaterial({
    color: 0xc3d9dc,
    roughness: 0.62,
    metalness: 0,
    flatShading: true,
  });

  const shelf = new THREE.Mesh(shelfGeometry, shelfMaterial);
  shelf.position.set(0, 0.15, -19);

  group.add(shelf);

  const crackMaterial = new THREE.MeshBasicMaterial({
    color: 0x557b82,
    transparent: true,
    opacity: 0.55,
  });

  for (let i = 0; i < 13; i += 1) {
    const crack = new THREE.Mesh(
      new THREE.BoxGeometry(
        lerp(0.03, 0.11, Math.random()),
        0.04,
        lerp(1.5, 5, Math.random()),
      ),
      crackMaterial,
    );

    crack.position.set(
      (Math.random() - 0.5) * 58,
      1.37,
      -19 + (Math.random() - 0.5) * 12,
    );

    crack.rotation.y = (Math.random() - 0.5) * 0.8;

    group.add(crack);
  }

  return group;
}

function createHorizonGlow() {
  const geometry = new THREE.PlaneGeometry(70, 18);

  const material = new THREE.MeshBasicMaterial({
    color: 0x5a9ea4,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const glow = new THREE.Mesh(geometry, material);

  glow.position.set(0, 2.6, -30);

  return glow;
}

function createMoon() {
  const group = new THREE.Group();

  const geometry = new THREE.CircleGeometry(2.8, 64);

  const material = new THREE.MeshBasicMaterial({
    color: 0xe9f4ef,
    transparent: true,
    opacity: 0.95,
  });

  const moon = new THREE.Mesh(geometry, material);

  group.add(moon);

  const haloGeometry = new THREE.CircleGeometry(5.4, 64);

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xa7d6d3,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const halo = new THREE.Mesh(haloGeometry, haloMaterial);

  halo.position.z = 0.12;

  group.add(halo);

  group.position.set(13, 13, -34);

  return group;
}

function createFogCurtain() {
  const geometry = new THREE.PlaneGeometry(75, 25);

  const material = new THREE.MeshBasicMaterial({
    color: 0x496e73,
    transparent: true,
    opacity: 0.025,
    depthWrite: false,
  });

  const curtain = new THREE.Mesh(geometry, material);

  curtain.position.set(0, 4, -13);

  return curtain;
}

export default function PolarScene() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) return undefined;

    const isMobile =
      window.matchMedia("(max-width: 760px)").matches;

    const reducedMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();

    scene.background = new THREE.Color(0x050c12);

    scene.fog = new THREE.FogExp2(
      new THREE.Color(0x071219),
      isMobile ? 0.014 : 0.011,
    );

    const camera = new THREE.PerspectiveCamera(
      isMobile ? 58 : 52,
      1,
      0.1,
      160,
    );

    camera.position.set(0, 4.2, 10);
    camera.rotation.order = "YXZ";

    const renderer = new THREE.WebGLRenderer({
      antialias: !isMobile,
      alpha: false,
      powerPreference: "high-performance",
      precision: isMobile ? "mediump" : "highp",
    });

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 1.8),
    );

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    mount.appendChild(renderer.domElement);

    const environment = new THREE.Group();
    scene.add(environment);

    /*
     * WORLD
     */

    const stars = createStarField(
      isMobile ? 700 : 1450,
      80,
      42,
    );

    environment.add(stars);

    const farMountains = createMountainLayer({
      count: isMobile ? 13 : 20,
      depth: 47,
      width: 65,
      baseY: -0.4,
      height: 13,
      color: 0x101f27,
      seed: 11,
      opacity: 0.8,
      jaggedness: 0.92,
    });

    environment.add(farMountains);

    const middleMountains = createMountainLayer({
      count: isMobile ? 10 : 16,
      depth: 35,
      width: 52,
      baseY: -0.55,
      height: 18,
      color: 0x0a171e,
      seed: 27,
      opacity: 0.96,
      jaggedness: 1.05,
    });

    environment.add(middleMountains);

    const nearMountains = createMountainLayer({
      count: isMobile ? 7 : 11,
      depth: 23,
      width: 43,
      baseY: -0.7,
      height: 23,
      color: 0x071218,
      seed: 64,
      opacity: 1,
      jaggedness: 1.18,
    });

    environment.add(nearMountains);

    const moon = createMoon();
    environment.add(moon);

    const horizonGlow = createHorizonGlow();
    environment.add(horizonGlow);

    const auroraGroup = new THREE.Group();

    const auroraOne = createAuroraRibbon({
      width: 48,
      amplitude: 2.7,
      height: 17,
      depth: -28,
      phase: 0.4,
      color: 0x62d7c5,
      opacity: 0.19,
    });

    const auroraTwo = createAuroraRibbon({
      width: 56,
      amplitude: 2.1,
      height: 20,
      depth: -31,
      phase: 2.2,
      color: 0x6f91e8,
      opacity: 0.12,
    });

    const auroraThree = createAuroraRibbon({
      width: 42,
      amplitude: 1.7,
      height: 14.5,
      depth: -26,
      phase: 4.1,
      color: 0x4fc9a9,
      opacity: 0.095,
    });

    auroraGroup.add(
      auroraOne,
      auroraTwo,
      auroraThree,
    );

    environment.add(auroraGroup);

    const water = createWater({
      width: 90,
      depth: 75,
      segmentsX: isMobile ? 45 : 80,
      segmentsZ: isMobile ? 35 : 60,
    });

    environment.add(water);

    const shelf = createIceShelf();
    environment.add(shelf);

    const icebergs = createIceberg();
    environment.add(icebergs);

    const snow = createSnowField(
      isMobile ? 700 : 1450,
      65,
      58,
      17,
    );

    environment.add(snow);

    const fogCurtain = createFogCurtain();
    environment.add(fogCurtain);

    /*
     * LIGHTING
     */

    const ambient = new THREE.HemisphereLight(
      0x7fa4aa,
      0x02060a,
      0.72,
    );

    scene.add(ambient);

    const moonLight = new THREE.DirectionalLight(
      0xb9d9d8,
      1.75,
    );

    moonLight.position.set(12, 18, -24);

    scene.add(moonLight);

    const coldFill = new THREE.DirectionalLight(
      0x426c9c,
      0.45,
    );

    coldFill.position.set(-20, 8, 14);

    scene.add(coldFill);

    /*
     * ATMOSPHERE
     */

    const worldColor = new THREE.Color(0x07131b);
    const horizonColor = new THREE.Color(0x17343a);
    const originalBackground = new THREE.Color(0x050c12);

    /*
     * INTERACTION
     */

    let scrollTarget = 0;
    let scrollCurrent = 0;

    let pointerTargetX = 0;
    let pointerTargetY = 0;

    let pointerCurrentX = 0;
    let pointerCurrentY = 0;

    let frame = 0;
    let disposed = false;
    let visible = true;

    const onScroll = () => {
      const maxScroll =
        document.documentElement.scrollHeight -
        window.innerHeight;

      scrollTarget =
        maxScroll > 0
          ? clamp(window.scrollY / maxScroll, 0, 1)
          : 0;
    };

    const onPointerMove = (event) => {
      if (isMobile) return;

      pointerTargetX =
        (event.clientX / window.innerWidth - 0.5) * 2;

      pointerTargetY =
        (event.clientY / window.innerHeight - 0.5) * 2;
    };

    const onVisibilityChange = () => {
      visible = !document.hidden;
    };

    const onResize = () => {
      const width = mount.clientWidth || window.innerWidth;
      const height =
        mount.clientHeight || window.innerHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height, false);
    };

    const onContextLost = (event) => {
      event.preventDefault();
    };

    const onContextRestored = () => {
      onResize();
    };

    window.addEventListener("scroll", onScroll, {
      passive: true,
    });

    window.addEventListener("pointermove", onPointerMove, {
      passive: true,
    });

    document.addEventListener(
      "visibilitychange",
      onVisibilityChange,
    );

    window.addEventListener("resize", onResize);

    renderer.domElement.addEventListener(
      "webglcontextlost",
      onContextLost,
      false,
    );

    renderer.domElement.addEventListener(
      "webglcontextrestored",
      onContextRestored,
      false,
    );

    onResize();
    onScroll();

    /*
     * ANIMATION
     */

    const clock = new THREE.Clock();

    const animate = () => {
      if (disposed) return;

      frame = requestAnimationFrame(animate);

      if (!visible) return;

      const elapsed = clock.getElapsedTime();

      const motionStrength = reducedMotion ? 0.12 : 1;

      scrollCurrent = THREE.MathUtils.damp(
        scrollCurrent,
        scrollTarget,
        3.2,
        1 / 60,
      );

      pointerCurrentX = THREE.MathUtils.damp(
        pointerCurrentX,
        pointerTargetX,
        4,
        1 / 60,
      );

      pointerCurrentY = THREE.MathUtils.damp(
        pointerCurrentY,
        pointerTargetY,
        4,
        1 / 60,
      );

      /*
       * The scene doesn't simply rotate.
       * The camera actually travels through the landscape.
       */

      const travel = scrollCurrent;

      const cameraZ = lerp(10, -18, travel);

      const cameraY =
        lerp(
          4.2,
          5.8,
          smoothstep(0, 1, travel),
        ) +
        Math.sin(elapsed * 0.16) *
          0.08 *
          motionStrength;

      const cameraX =
        pointerCurrentX * 1.1 +
        Math.sin(travel * Math.PI * 1.6) * 1.4;

      camera.position.x = THREE.MathUtils.damp(
        camera.position.x,
        cameraX,
        3.4,
        1 / 60,
      );

      camera.position.y = THREE.MathUtils.damp(
        camera.position.y,
        cameraY,
        3.4,
        1 / 60,
      );

      camera.position.z = THREE.MathUtils.damp(
        camera.position.z,
        cameraZ,
        3.4,
        1 / 60,
      );

      /*
       * Camera pitch changes as the visitor descends.
       */

      const pitch =
        lerp(-0.035, 0.085, travel) +
        pointerCurrentY * 0.018;

      const yaw =
        pointerCurrentX * 0.018 +
        Math.sin(elapsed * 0.11) *
          0.003 *
          motionStrength;

      camera.rotation.x = pitch;
      camera.rotation.y = yaw;

      /*
       * Layered parallax.
       */

      farMountains.position.x =
        pointerCurrentX * 0.35 +
        Math.sin(elapsed * 0.04) * 0.08;

      farMountains.position.y =
        Math.sin(elapsed * 0.045) * 0.025;

      middleMountains.position.x =
        pointerCurrentX * 0.65;

      middleMountains.position.y =
        Math.sin(elapsed * 0.05) * 0.035;

      nearMountains.position.x =
        pointerCurrentX * 1.05;

      /*
       * Aurora moves independently from the mountains.
       */

      auroraGroup.position.x =
        Math.sin(elapsed * 0.075) * 1.7 +
        pointerCurrentX * 0.8;

      auroraGroup.position.y =
        Math.sin(elapsed * 0.11) * 0.45;

      auroraGroup.rotation.z =
        Math.sin(elapsed * 0.06) *
        0.012;

      auroraOne.material.opacity =
        0.17 +
        Math.sin(elapsed * 0.21) * 0.025;

      auroraTwo.material.opacity =
        0.105 +
        Math.sin(elapsed * 0.16 + 1.5) * 0.02;

      auroraThree.material.opacity =
        0.085 +
        Math.sin(elapsed * 0.25 + 2.2) * 0.02;

      /*
       * Moon slowly slides relative to the camera.
       */

      moon.position.x =
        13 +
        pointerCurrentX * 0.8;

      moon.position.y =
        13 +
        Math.sin(elapsed * 0.04) * 0.08;

      /*
       * Foreground ice reacts subtly to movement.
       */

      icebergs.position.x =
        pointerCurrentX * 0.55;

      icebergs.rotation.y =
        Math.sin(elapsed * 0.035) *
        0.012;

      /*
       * Water breathes.
       */

      water.rotation.z =
        Math.sin(elapsed * 0.08) *
        0.0015;

      water.position.x =
        Math.sin(elapsed * 0.055) *
        0.035;

      /*
       * Snow drifts across the camera path.
       */

      snow.rotation.y =
        elapsed * 0.006 * motionStrength;

      snow.position.x =
        Math.sin(elapsed * 0.09) *
        0.65;

      snow.position.y =
        Math.sin(elapsed * 0.12) *
        0.12;

      /*
       * Environmental color shifts as the visitor travels.
       */

      const horizonMix =
        smoothstep(0.08, 0.82, travel);

      scene.background.copy(
        originalBackground,
      );

      scene.background.lerp(
        worldColor,
        horizonMix * 0.35,
      );

      horizonGlow.material.opacity =
        0.08 +
        horizonMix * 0.085 +
        Math.sin(elapsed * 0.17) * 0.008;

      fogCurtain.material.opacity =
        0.018 +
        horizonMix * 0.018;

      /*
       * Slight exposure evolution.
       */

      renderer.toneMappingExposure =
        1.04 +
        horizonMix * 0.09;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      disposed = true;

      cancelAnimationFrame(frame);

      window.removeEventListener("scroll", onScroll);
      window.removeEventListener(
        "pointermove",
        onPointerMove,
      );
      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange,
      );
      window.removeEventListener("resize", onResize);

      renderer.domElement.removeEventListener(
        "webglcontextlost",
        onContextLost,
      );

      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        onContextRestored,
      );

      scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose();
        }

        if (object.material) {
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];

          materials.forEach((material) => {
            if (material.map) material.map.dispose();
            if (material.normalMap) {
              material.normalMap.dispose();
            }
            if (material.roughnessMap) {
              material.roughnessMap.dispose();
            }
            if (material.metalnessMap) {
              material.metalnessMap.dispose();
            }

            material.dispose();
          });
        }
      });

      renderer.dispose();

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    />
  );
}