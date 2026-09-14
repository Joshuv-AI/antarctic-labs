import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const ASSETS = {
  mountain: "/assets/models/mountains/chalaadi.fbx",
  sky: "/assets/hdr/daysky-8k-hdr-4k.jpg",

  iceColor: "/assets/textures/ice/ice-color.png",
  iceNormal: "/assets/textures/ice/ice-normal.jpg",
  iceRoughness: "/assets/textures/ice/ice-roughness.png",

  snowColor: "/assets/textures/snow/snow-color.png",
  snowNormal: "/assets/textures/snow/snow-normal.png",
  snowRoughness: "/assets/textures/snow/snow-roughness.png",

  rockColor: "/assets/textures/rock/rock-color.png",
  rockNormal: "/assets/textures/rock/rock-normal.png",
  rockRoughness: "/assets/textures/rock/rock-roughness.png",
};

const MOBILE_BREAKPOINT = 760;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function makeCanvasTexture(draw) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;

  const context = canvas.getContext("2d");

  if (!context) return null;

  draw(context, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}

function createRadialTexture() {
  return makeCanvasTexture((ctx, width, height) => {
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      width / 2,
    );

    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.18, "rgba(255,255,255,.92)");
    gradient.addColorStop(0.48, "rgba(210,235,255,.42)");
    gradient.addColorStop(0.72, "rgba(140,190,220,.10)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
}

function createMoonTexture() {
  return makeCanvasTexture((ctx, width, height) => {
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      width * 0.05,
      width / 2,
      height / 2,
      width * 0.5,
    );

    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.45, "rgba(232,245,255,.98)");
    gradient.addColorStop(0.75, "rgba(188,220,240,.35)");
    gradient.addColorStop(1, "rgba(100,160,200,0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
}

function createMountainMaterial(color, opacity = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.94,
    metalness: 0.02,
    transparent: opacity < 1,
    opacity,
    flatShading: false,
  });
}

function createMountainLayer({
  width,
  height,
  depth,
  color,
  opacity,
  segments = 18,
  seed = 0,
}) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const indices = [];

  const points = [];

  for (let index = 0; index <= segments; index += 1) {
    const x = (index / segments - 0.5) * width;

    const waveA = Math.sin(index * 0.92 + seed) * 0.12;
    const waveB = Math.sin(index * 0.41 + seed * 1.7) * 0.22;
    const waveC = Math.sin(index * 1.73 + seed * 0.3) * 0.07;

    const normalized =
      0.36 +
      Math.abs(waveA) +
      Math.abs(waveB) * 0.65 +
      Math.abs(waveC);

    points.push({
      x,
      y: normalized * height,
    });
  }

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];

    positions.push(point.x, point.y, -depth * 0.45);
    positions.push(point.x, 0, -depth * 0.45);

    positions.push(point.x, point.y, depth * 0.45);
    positions.push(point.x, 0, depth * 0.45);
  }

  for (let index = 0; index < segments; index += 1) {
    const a = index * 4;
    const b = (index + 1) * 4;

    indices.push(
      a,
      b,
      a + 1,

      b,
      b + 1,
      a + 1,

      a + 2,
      a + 3,
      b + 2,

      b + 2,
      a + 3,
      b + 3,

      a,
      a + 2,
      b,

      b,
      a + 2,
      b + 2,

      a + 1,
      b + 1,
      a + 3,

      b + 1,
      b + 3,
      a + 3,
    );
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );

  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = createMountainMaterial(color, opacity);
  const mesh = new THREE.Mesh(geometry, material);

  mesh.castShadow = false;
  mesh.receiveShadow = false;

  return mesh;
}

function createSnowParticles(count, spread, height) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const offsets = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const i = index * 3;

    positions[i] = (Math.random() - 0.5) * spread;
    positions[i + 1] = Math.random() * height;
    positions[i + 2] = (Math.random() - 0.5) * spread;

    speeds[index] = 0.15 + Math.random() * 0.45;
    offsets[index] = Math.random() * Math.PI * 2;
  }

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );

  geometry.userData.speeds = speeds;
  geometry.userData.offsets = offsets;
  geometry.userData.basePositions = positions.slice();

  const material = new THREE.PointsMaterial({
    color: 0xe8f5ff,
    size: 0.055,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);

  return points;
}

function createStarField(count, radius, verticalSpread) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const i = index * 3;

    const angle = Math.random() * Math.PI * 2;
    const distance = radius * (0.35 + Math.random() * 0.65);

    positions[i] = Math.cos(angle) * distance;
    positions[i + 1] =
      verticalSpread * (0.15 + Math.random() * 0.85);
    positions[i + 2] =
      -radius * (0.25 + Math.random() * 0.75);
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );

  const material = new THREE.PointsMaterial({
    color: 0xddeeff,
    size: 0.025,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });

  return new THREE.Points(geometry, material);
}

function createAuroraBand({
  width,
  height,
  depth,
  color,
  opacity,
  phase,
  thickness,
}) {
  const group = new THREE.Group();

  const curve = new THREE.CatmullRomCurve3(
    Array.from({ length: 12 }, (_, index) => {
      const t = index / 11;

      return new THREE.Vector3(
        (t - 0.5) * width,
        height +
          Math.sin(t * Math.PI * 3 + phase) * 0.45 +
          Math.sin(t * Math.PI * 7 + phase * 0.7) * 0.18,
        -depth +
          Math.cos(t * Math.PI * 2 + phase) * 0.65,
      );
    }),
  );

  const geometry = new THREE.TubeGeometry(
    curve,
    72,
    thickness,
    8,
    false,
  );

  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  return group;
}

function createIceberg({
  x,
  y,
  z,
  scale,
  rotation = 0,
  color = 0xcde8f5,
}) {
  const group = new THREE.Group();

  const geometry = new THREE.ConeGeometry(
    1,
    2,
    6,
    1,
    false,
  );

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0,
    transparent: true,
    opacity: 0.92,
  });

  const mesh = new THREE.Mesh(geometry, material);

  mesh.scale.set(
    scale,
    scale * (1.2 + Math.random() * 0.8),
    scale * (0.65 + Math.random() * 0.55),
  );

  mesh.rotation.y = rotation;
  mesh.rotation.z = (Math.random() - 0.5) * 0.15;

  group.add(mesh);

  group.position.set(x, y, z);

  return group;
}

function createWater(width, depth) {
  const geometry = new THREE.PlaneGeometry(
    width,
    depth,
    64,
    64,
  );

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x07141d,
    roughness: 0.22,
    metalness: 0.45,
    transparent: true,
    opacity: 0.94,
    clearcoat: 0.75,
    clearcoatRoughness: 0.18,
  });

  const water = new THREE.Mesh(geometry, material);

  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.55;

  const positions = geometry.attributes.position;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getY(index);

    const wave =
      Math.sin(x * 0.045) * 0.035 +
      Math.sin(z * 0.065) * 0.025 +
      Math.sin((x + z) * 0.018) * 0.045;

    positions.setZ(index, wave);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  return water;
}

function createMistPlane(width, height, z, opacity) {
  const texture = createRadialTexture();

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xb9d7e8,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const geometry = new THREE.PlaneGeometry(width, height);

  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(0, height * 0.45, z);

  return mesh;
}

function createMoon() {
  const group = new THREE.Group();

  const texture = createMoonTexture();

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const sprite = new THREE.Sprite(material);

  sprite.scale.set(4.8, 4.8, 1);
  sprite.position.set(8.5, 7.2, -22);

  group.add(sprite);

  return group;
}

function createHorizonGlow() {
  const texture = createRadialTexture();

  const material = new THREE.SpriteMaterial({
    map: texture,
    color: 0x8ecde0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const sprite = new THREE.Sprite(material);

  sprite.scale.set(18, 7, 1);
  sprite.position.set(1.5, 0.7, -15);

  return sprite;
}

export default function PolarScene() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) return undefined;

    let disposed = false;
    let frameId = 0;
    let resizeObserver;

    const scene = new THREE.Scene();

    scene.background = new THREE.Color(0x061018);

    scene.fog = new THREE.FogExp2(
      0x07141c,
      0.027,
    );

    const camera = new THREE.PerspectiveCamera(
      42,
      1,
      0.1,
      160,
    );

    camera.position.set(0, 2.2, 10);
    camera.rotation.order = "YXZ";

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        window.innerWidth <= MOBILE_BREAKPOINT ? 1.25 : 1.8,
      ),
    );

    renderer.setSize(
      mount.clientWidth || window.innerWidth,
      mount.clientHeight || window.innerHeight,
      false,
    );

    renderer.outputColorSpace = THREE.SRGBColorSpace;

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;

    renderer.shadowMap.enabled = false;

    mount.appendChild(renderer.domElement);

    const clock = new THREE.Clock();

    const world = new THREE.Group();
    const environment = new THREE.Group();
    const foreground = new THREE.Group();
    const atmosphere = new THREE.Group();
    const auroraGroup = new THREE.Group();

    scene.add(world);

    world.add(environment);
    world.add(foreground);
    world.add(atmosphere);
    world.add(auroraGroup);

    const ambientLight = new THREE.HemisphereLight(
      0xa7d7ed,
      0x03070a,
      1.35,
    );

    scene.add(ambientLight);

    const moonLight = new THREE.DirectionalLight(
      0xb9e4ff,
      2.15,
    );

    moonLight.position.set(
      8,
      12,
      -18,
    );

    scene.add(moonLight);

    const horizonLight = new THREE.PointLight(
      0x4ba8bd,
      3.4,
      35,
    );

    horizonLight.position.set(
      2,
      0.5,
      -12,
    );

    scene.add(horizonLight);

    /*
     * SKY / BACKDROP
     */

    const skyTextureLoader = new THREE.TextureLoader();

    skyTextureLoader.load(
      ASSETS.sky,
      (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }

        texture.colorSpace = THREE.SRGBColorSpace;

        const skyMaterial = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.BackSide,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
        });

        const skyGeometry = new THREE.SphereGeometry(
          72,
          48,
          32,
        );

        const sky = new THREE.Mesh(
          skyGeometry,
          skyMaterial,
        );

        environment.add(sky);
      },
      undefined,
      () => {
        // The procedural environment remains fully functional
        // if the optional sky asset cannot be loaded.
      },
    );

    /*
     * STARS
     */

    const isMobile =
      window.innerWidth <= MOBILE_BREAKPOINT;

    const stars = createStarField(
      isMobile ? 480 : 1050,
      58,
      28,
    );

    stars.position.y = -1;

    environment.add(stars);

    /*
     * DISTANT MOUNTAIN SYSTEM
     *
     * Multiple layers deliberately create atmospheric depth.
     */

    const distantMountain = createMountainLayer({
      width: 58,
      height: 9.5,
      depth: 5,
      color: 0x142b37,
      opacity: 0.72,
      segments: 28,
      seed: 0.8,
    });

    distantMountain.position.set(
      0,
      -1.15,
      -20,
    );

    environment.add(distantMountain);

    const middleMountain = createMountainLayer({
      width: 52,
      height: 8.8,
      depth: 5.5,
      color: 0x10242f,
      opacity: 0.9,
      segments: 25,
      seed: 3.4,
    });

    middleMountain.position.set(
      -2,
      -1.2,
      -15.5,
    );

    environment.add(middleMountain);

    const nearMountain = createMountainLayer({
      width: 47,
      height: 7.8,
      depth: 6,
      color: 0x0b1b25,
      opacity: 0.98,
      segments: 23,
      seed: 6.7,
    });

    nearMountain.position.set(
      3,
      -1.3,
      -11,
    );

    environment.add(nearMountain);

    /*
     * EXISTING MOUNTAIN ASSET
     *
     * This remains an enhancement rather than a hard dependency.
     */

    const mountainLoader = new FBXLoader();

    mountainLoader.load(
      ASSETS.mountain,
      (model) => {
        if (disposed) return;

        model.traverse((child) => {
          if (!child.isMesh) return;

          child.castShadow = false;
          child.receiveShadow = false;

          if (child.material) {
            child.material = Array.isArray(child.material)
              ? child.material.map((material) => {
                  material.transparent = true;
                  material.opacity = 0.86;
                  material.roughness = 0.96;
                  material.metalness = 0;
                  return material;
                })
              : (() => {
                  child.material.transparent = true;
                  child.material.opacity = 0.86;
                  child.material.roughness = 0.96;
                  child.material.metalness = 0;
                  return child.material;
                })();
          }
        });

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());

        const largestDimension = Math.max(
          size.x,
          size.y,
          size.z,
        );

        if (largestDimension > 0) {
          const targetSize = 24;
          const scale = targetSize / largestDimension;

          model.scale.setScalar(scale);
        }

        const centeredBox =
          new THREE.Box3().setFromObject(model);

        const center =
          centeredBox.getCenter(new THREE.Vector3());

        model.position.sub(center);

        model.position.set(
          -7,
          -0.85,
          -10.5,
        );

        model.rotation.y = -0.28;

        environment.add(model);
      },
      undefined,
      () => {
        // Procedural mountains remain if the FBX cannot load.
      },
    );

    /*
     * MOON + HORIZON
     */

    const moon = createMoon();

    environment.add(moon);

    const horizonGlow = createHorizonGlow();

    atmosphere.add(horizonGlow);

    /*
     * AURORA
     *
     * Three dimensional ribbons rather than a flat screen effect.
     */

    const auroraOne = createAuroraBand({
      width: 34,
      height: 8.4,
      depth: 19,
      color: 0x61d6c8,
      opacity: 0.14,
      phase: 0.3,
      thickness: 0.15,
    });

    const auroraTwo = createAuroraBand({
      width: 31,
      height: 9.2,
      depth: 17,
      color: 0x6e9dff,
      opacity: 0.105,
      phase: 2.4,
      thickness: 0.12,
    });

    const auroraThree = createAuroraBand({
      width: 28,
      height: 10,
      depth: 15,
      color: 0x8be5bd,
      opacity: 0.08,
      phase: 4.2,
      thickness: 0.1,
    });

    auroraGroup.add(
      auroraOne,
      auroraTwo,
      auroraThree,
    );

    /*
     * WATER
     */

    const water = createWater(58, 50);

    foreground.add(water);

    /*
     * ICE FORMATIONS
     */

    const icePositions = [
      [-15, -0.25, -4.5, 2.8, 0.25],
      [-10.5, -0.35, -5.5, 1.7, 1.2],
      [13, -0.2, -5.2, 2.3, -0.5],
      [16, -0.4, -3.8, 1.4, 0.8],
      [-19, -0.55, -1.8, 1.2, 0.4],
      [20, -0.55, -1.5, 1.5, -0.4],
    ];

    for (const [
      x,
      y,
      z,
      scale,
      rotation,
    ] of icePositions) {
      foreground.add(
        createIceberg({
          x,
          y,
          z,
          scale,
          rotation,
        }),
      );
    }

    /*
     * FOREGROUND ICE SHELF
     */

    const shelfGeometry = new THREE.BoxGeometry(
      42,
      1.3,
      5,
      16,
      4,
      12,
    );

    const shelfPositions =
      shelfGeometry.attributes.position;

    for (
      let index = 0;
      index < shelfPositions.count;
      index += 1
    ) {
      const x = shelfPositions.getX(index);
      const y = shelfPositions.getY(index);
      const z = shelfPositions.getZ(index);

      if (y > 0) {
        shelfPositions.setY(
          index,
          y +
            Math.sin(x * 0.55) * 0.07 +
            Math.sin(z * 0.8) * 0.045,
        );
      }
    }

    shelfPositions.needsUpdate = true;
    shelfGeometry.computeVertexNormals();

    const shelfMaterial =
      new THREE.MeshStandardMaterial({
        color: 0xb9d6e1,
        roughness: 0.86,
        metalness: 0.02,
      });

    const shelf = new THREE.Mesh(
      shelfGeometry,
      shelfMaterial,
    );

    shelf.position.set(
      0,
      -1.55,
      -0.8,
    );

    foreground.add(shelf);

    /*
     * SNOW
     */

    const snow = createSnowParticles(
      isMobile ? 850 : 1750,
      45,
      22,
    );

    snow.position.y = -2;

    atmosphere.add(snow);

    /*
     * MIST / CLOUD TRANSITION PLANES
     *
     * These are intentionally soft and sparse. They help create
     * depth and hide hard visual boundaries during scroll movement.
     */

    const mistBack = createMistPlane(
      40,
      13,
      -13,
      0.055,
    );

    const mistMiddle = createMistPlane(
      34,
      9,
      -7,
      0.075,
    );

    const mistFront = createMistPlane(
      27,
      7,
      -3,
      0.045,
    );

    atmosphere.add(
      mistBack,
      mistMiddle,
      mistFront,
    );

    /*
     * INTERNAL STATE
     */

    const pointer = {
      currentX: 0,
      currentY: 0,
      targetX: 0,
      targetY: 0,
    };

    let scrollTarget = 0;
    let scrollCurrent = 0;
    let lastScrollY = window.scrollY;

    const handlePointerMove = (event) => {
      pointer.targetX =
        (event.clientX / window.innerWidth - 0.5) * 2;

      pointer.targetY =
        (event.clientY / window.innerHeight - 0.5) * 2;
    };

    const handleScroll = () => {
      scrollTarget = window.scrollY;
    };

    const handleVisibility = () => {
      if (document.hidden) {
        clock.stop();
      } else {
        clock.start();
      }
    };

    const handleResize = () => {
      if (disposed) return;

      const width =
        mount.clientWidth || window.innerWidth;

      const height =
        mount.clientHeight || window.innerHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio || 1,
          window.innerWidth <= MOBILE_BREAKPOINT
            ? 1.25
            : 1.8,
        ),
      );

      renderer.setSize(
        width,
        height,
        false,
      );
    };

    window.addEventListener(
      "pointermove",
      handlePointerMove,
      { passive: true },
    );

    window.addEventListener(
      "scroll",
      handleScroll,
      { passive: true },
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibility,
    );

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(
        handleResize,
      );

      resizeObserver.observe(mount);
    } else {
      window.addEventListener(
        "resize",
        handleResize,
      );
    }

    handleResize();

    /*
     * ANIMATION
     */

    const animate = () => {
      if (disposed) return;

      frameId = requestAnimationFrame(animate);

      const elapsed = clock.getElapsedTime();

      const deltaScroll =
        scrollTarget - lastScrollY;

      lastScrollY += deltaScroll * 0.08;

      scrollCurrent +=
        (scrollTarget - scrollCurrent) * 0.035;

      pointer.currentX +=
        (pointer.targetX - pointer.currentX) * 0.035;

      pointer.currentY +=
        (pointer.targetY - pointer.currentY) * 0.035;

      const normalizedScroll =
        clamp(scrollCurrent / 2400, 0, 1);

      /*
       * CAMERA TRAVEL
       */

      const cameraTravel =
        normalizedScroll * 6.2;

      camera.position.z =
        10 -
        cameraTravel;

      camera.position.y =
        2.2 -
        normalizedScroll * 0.7;

      camera.position.x =
        pointer.currentX * 0.75 +
        Math.sin(elapsed * 0.09) * 0.1;

      camera.rotation.y =
        pointer.currentX * -0.045;

      camera.rotation.x =
        pointer.currentY * -0.025 +
        normalizedScroll * 0.018;

      /*
       * WORLD PARALLAX
       */

      distantMountain.position.x =
        pointer.currentX * 0.2;

      middleMountain.position.x =
        -2 +
        pointer.currentX * 0.42;

      nearMountain.position.x =
        3 +
        pointer.currentX * 0.72;

      stars.position.x =
        pointer.currentX * 0.1;

      auroraGroup.position.x =
        pointer.currentX * 0.65;

      auroraGroup.position.y =
        Math.sin(elapsed * 0.075) * 0.08;

      /*
       * AURORA MOTION
       */

      auroraOne.rotation.z =
        Math.sin(elapsed * 0.12) * 0.012;

      auroraTwo.rotation.z =
        Math.sin(elapsed * 0.1 + 1.8) * -0.014;

      auroraThree.rotation.z =
        Math.sin(elapsed * 0.08 + 3.1) * 0.01;

      /*
       * SNOW MOTION
       */

      const snowPositions =
        snow.geometry.attributes.position;

      const speeds =
        snow.geometry.userData.speeds;

      const offsets =
        snow.geometry.userData.offsets;

      const basePositions =
        snow.geometry.userData.basePositions;

      for (
        let index = 0;
        index < speeds.length;
        index += 1
      ) {
        const i = index * 3;

        let y =
          basePositions[i + 1] -
          ((elapsed * speeds[index] * 0.7) % 24);

        if (y < 0) {
          y += 24;
        }

        snowPositions.array[i] =
          basePositions[i] +
          Math.sin(
            elapsed * 0.22 +
            offsets[index],
          ) *
            0.18;

        snowPositions.array[i + 1] = y;

        snowPositions.array[i + 2] =
          basePositions[i + 2] +
          Math.cos(
            elapsed * 0.18 +
            offsets[index],
          ) *
            0.12;
      }

      snowPositions.needsUpdate = true;

      /*
       * WATER MOVEMENT
       */

      const waterPositions =
        water.geometry.attributes.position;

      for (
        let index = 0;
        index < waterPositions.count;
        index += 1
      ) {
        const x = waterPositions.getX(index);
        const y = waterPositions.getY(index);

        const wave =
          Math.sin(
            x * 0.045 +
              elapsed * 0.14,
          ) *
            0.035 +
          Math.sin(
            y * 0.065 -
              elapsed * 0.1,
          ) *
            0.025 +
          Math.sin(
            (x + y) * 0.018 +
              elapsed * 0.08,
          ) *
            0.045;

        waterPositions.setZ(
          index,
          wave,
        );
      }

      waterPositions.needsUpdate = true;

      /*
       * MIST DRIFT
       */

      mistBack.position.x =
        Math.sin(elapsed * 0.045) * 2 +
        pointer.currentX * 0.6;

      mistMiddle.position.x =
        Math.sin(elapsed * 0.065 + 2) * 1.5 +
        pointer.currentX * 0.9;

      mistFront.position.x =
        Math.sin(elapsed * 0.09 + 4) * 0.8 +
        pointer.currentX * 1.1;

      mistBack.material.opacity =
        0.045 +
        Math.sin(elapsed * 0.12) * 0.012;

      mistMiddle.material.opacity =
        0.06 +
        Math.sin(elapsed * 0.1 + 1.5) * 0.016;

      /*
       * HORIZON ATMOSPHERE
       */

      horizonGlow.material.opacity =
        0.19 +
        Math.sin(elapsed * 0.12) * 0.035;

      horizonLight.intensity =
        3.1 +
        Math.sin(elapsed * 0.17) * 0.25;

      /*
       * MOON PARALLAX
       */

      moon.position.x =
        pointer.currentX * 0.35;

      moon.position.y =
        pointer.currentY * 0.12;

      /*
       * SLIGHT ENVIRONMENTAL CAMERA SWAY
       */

      world.rotation.y =
        Math.sin(elapsed * 0.035) * 0.004;

      world.rotation.x =
        Math.sin(elapsed * 0.028) * 0.002;

      /*
       * RENDER
       */

      renderer.render(
        scene,
        camera,
      );
    };

    animate();

    /*
     * WEBGL CONTEXT RECOVERY
     */

    const handleContextLost = (event) => {
      event.preventDefault();
    };

    const handleContextRestored = () => {
      handleResize();
    };

    renderer.domElement.addEventListener(
      "webglcontextlost",
      handleContextLost,
      false,
    );

    renderer.domElement.addEventListener(
      "webglcontextrestored",
      handleContextRestored,
      false,
    );

    /*
     * CLEANUP
     */

    return () => {
      disposed = true;

      cancelAnimationFrame(frameId);

      window.removeEventListener(
        "pointermove",
        handlePointerMove,
      );

      window.removeEventListener(
        "scroll",
        handleScroll,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility,
      );

      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener(
          "resize",
          handleResize,
        );
      }

      renderer.domElement.removeEventListener(
        "webglcontextlost",
        handleContextLost,
      );

      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        handleContextRestored,
      );

      scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose();
        }

        if (object.material) {
          const materials = Array.isArray(
            object.material,
          )
            ? object.material
            : [object.material];

          materials.forEach((material) => {
            if (material.map) {
              material.map.dispose();
            }

            if (material.normalMap) {
              material.normalMap.dispose();
            }

            if (material.roughnessMap) {
              material.roughnessMap.dispose();
            }

            if (material.alphaMap) {
              material.alphaMap.dispose();
            }

            material.dispose();
          });
        }
      });

      renderer.dispose();

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(
          renderer.domElement,
        );
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 0,
      }}
    />
  );
}