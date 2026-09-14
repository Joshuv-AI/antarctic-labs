import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const ASSETS = {
  mountain: "/assets/models/mountains/chalaadi.fbx",
  sky: "/assets/hdr/daysky-8k-hdr-4k.jpg",
  iceColor: "/assets/textures/ice/ice-color.png",
  iceNormal: "/assets/textures/ice/ice-normal.jpg",
  iceRoughness: "/assets/textures/ice/ice-roughness.png",
  rockColor: "/assets/textures/rock/rock-color.png",
  rockNormal: "/assets/textures/rock/rock-normal.png",
  rockRoughness: "/assets/textures/rock/rock-roughness.png",
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const lerp = (a, b, t) => a + (b - a) * t;

const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const disposeMaterial = (material, disposedMaterials) => {
  if (!material || disposedMaterials.has(material)) return;

  disposedMaterials.add(material);

  const textureKeys = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "alphaMap",
    "emissiveMap",
    "bumpMap",
    "displacementMap",
    "envMap",
  ];

  for (const key of textureKeys) {
    const texture = material[key];

    if (texture && texture.isTexture) {
      texture.dispose();
    }
  }

  material.dispose();
};

const disposeObject = (object, disposedMaterials) => {
  if (!object) return;

  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) =>
          disposeMaterial(material, disposedMaterials),
        );
      } else {
        disposeMaterial(child.material, disposedMaterials);
      }
    }
  });
};

const createGradientTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;

  const context = canvas.getContext("2d");

  if (!context) return null;

  const gradient = context.createLinearGradient(0, 0, 0, 256);

  gradient.addColorStop(0, "#07121b");
  gradient.addColorStop(0.32, "#0b1d29");
  gradient.addColorStop(0.62, "#173342");
  gradient.addColorStop(1, "#071018");

  context.fillStyle = gradient;
  context.fillRect(0, 0, 2, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
};

const createStars = (count, radius, spread, seed = 1) => {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  let state = seed;

  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  for (let i = 0; i < count; i += 1) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(lerp(-0.15, 0.72, random()));

    const distance = radius + random() * spread;

    positions[i * 3] =
      Math.sin(phi) * Math.cos(theta) * distance;

    positions[i * 3 + 1] =
      Math.cos(phi) * distance;

    positions[i * 3 + 2] =
      Math.sin(phi) * Math.sin(theta) * distance;

    sizes[i] = lerp(0.45, 1.8, random());
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );

  geometry.setAttribute(
    "size",
    new THREE.BufferAttribute(sizes, 1),
  );

  const material = new THREE.PointsMaterial({
    color: 0xddebf0,
    size: 0.9,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
};

const createAuroraRibbon = ({
  radius,
  height,
  width,
  segments,
  color,
  opacity,
  phase,
}) => {
  const positions = new Float32Array((segments + 1) * 3);

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const angle = lerp(-1.15, 1.15, t);

    const wave =
      Math.sin(t * Math.PI * 3.2 + phase) * 1.5 +
      Math.sin(t * Math.PI * 7.0 + phase * 0.7) * 0.55;

    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;

    positions[i * 3] = x;
    positions[i * 3 + 1] =
      height +
      wave +
      Math.sin(t * Math.PI) * 1.5;
    positions[i * 3 + 2] = z;
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );

  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  return new THREE.Line(geometry, material);
};

const createIceberg = ({
  textures,
  mobile,
  ownedMaterials,
}) => {
  const geometry = new THREE.IcosahedronGeometry(
    mobile ? 5.4 : 6.8,
    mobile ? 2 : 3,
  );

  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);

    const distortion =
      Math.sin(x * 1.7) * 0.22 +
      Math.cos(z * 1.35) * 0.18 +
      Math.sin((x + z) * 1.1) * 0.14;

    position.setX(i, x + distortion * 0.45);
    position.setY(i, y * (1.05 + distortion * 0.06));
    position.setZ(i, z + distortion * 0.38);
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xb9d9e3,
    roughness: 0.28,
    metalness: 0.02,
    transmission: mobile ? 0.05 : 0.12,
    thickness: 1.2,
    transparent: true,
    opacity: 0.93,
    envMapIntensity: 0.8,
    normalMap: textures.iceNormal || null,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });

  ownedMaterials.add(material);

  const iceberg = new THREE.Mesh(geometry, material);

  iceberg.position.set(7.8, -5.9, -9.5);
  iceberg.rotation.set(-0.18, -0.48, 0.12);

  return iceberg;
};

const createIceShelf = ({
  textures,
  mobile,
  ownedMaterials,
}) => {
  const geometry = new THREE.CylinderGeometry(
    mobile ? 8 : 11,
    mobile ? 10 : 14,
    3.2,
    mobile ? 24 : 32,
    3,
  );

  const material = new THREE.MeshStandardMaterial({
    color: 0x9fc4d0,
    roughness: 0.72,
    metalness: 0,
    map: textures.iceColor || null,
    normalMap: textures.iceNormal || null,
    roughnessMap: textures.iceRoughness || null,
    normalScale: new THREE.Vector2(0.65, 0.65),
  });

  ownedMaterials.add(material);

  const shelf = new THREE.Mesh(geometry, material);

  shelf.position.set(0, -8.9, -13);
  shelf.scale.set(1.35, 0.42, 1.25);

  return shelf;
};

const createWater = ({ mobile, ownedMaterials }) => {
  const geometry = new THREE.PlaneGeometry(
    mobile ? 80 : 110,
    mobile ? 80 : 110,
    mobile ? 24 : 42,
    mobile ? 24 : 42,
  );

  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getY(i);

    position.setZ(
      i,
      Math.sin(x * 0.075) * 0.18 +
        Math.cos(z * 0.09) * 0.14,
    );
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x07151e,
    roughness: 0.42,
    metalness: 0.28,
    transparent: true,
    opacity: 0.9,
  });

  ownedMaterials.add(material);

  const water = new THREE.Mesh(geometry, material);

  water.rotation.x = -Math.PI / 2;
  water.position.y = -7.2;
  water.position.z = -8;

  return water;
};

const applyMountainMaterials = ({
  root,
  textures,
  mobile,
  ownedMaterials,
}) => {
  root.traverse((child) => {
    if (!child.isMesh) return;

    child.castShadow = false;
    child.receiveShadow = false;

    const sourceMaterial = Array.isArray(child.material)
      ? child.material[0]
      : child.material;

    const sourceColor =
      sourceMaterial?.color?.clone() ||
      new THREE.Color(0x6f8790);

    const material = new THREE.MeshStandardMaterial({
      color: sourceColor.multiplyScalar(0.72),
      map: textures.rockColor || null,
      normalMap: textures.rockNormal || null,
      roughnessMap: textures.rockRoughness || null,
      roughness: 0.84,
      metalness: 0.02,
      flatShading: false,
    });

    material.normalScale.set(
      mobile ? 0.38 : 0.55,
      mobile ? 0.38 : 0.55,
    );

    ownedMaterials.add(material);

    child.material = material;
  });
};

const loadTexture = (
  loader,
  url,
  colorSpace = null,
) =>
  new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        if (colorSpace) {
          texture.colorSpace = colorSpace;
        }

        texture.anisotropy = 1;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });

const loadOptionalTexture = (
  loader,
  url,
  colorSpace = null,
) =>
  loadTexture(loader, url, colorSpace).catch(() => null);

export default function PolarScene() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return undefined;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const finePointer = window.matchMedia(
      "(pointer: fine)",
    ).matches;

    const mobile =
      window.matchMedia("(max-width: 760px)").matches ||
      !finePointer;

    const lowPower =
      mobile ||
      window.matchMedia("(max-width: 900px)").matches;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      mobile ? 43 : 39,
      1,
      0.1,
      180,
    );

    camera.position.set(
      mobile ? 0 : 0.8,
      mobile ? 1.3 : 1.8,
      mobile ? 24 : 27,
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: !lowPower,
      alpha: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        mobile ? 1.25 : 1.65,
      ),
    );

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = mobile ? 0.88 : 1.02;

    renderer.domElement.setAttribute(
      "aria-hidden",
      "true",
    );

    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    container.appendChild(renderer.domElement);

    const world = new THREE.Group();
    scene.add(world);

    const environment = new THREE.Group();
    world.add(environment);

    const foreground = new THREE.Group();
    world.add(foreground);

    const atmosphere = new THREE.Group();
    world.add(atmosphere);

    const ownedMaterials = new Set();
    const ownedTextures = new Set();
    const loadedRoots = [];

    let destroyed = false;
    let active = document.visibilityState === "visible";
    let contextLost = false;

    let scrollTarget = 0;
    let scrollCurrent = 0;

    let pointerTargetX = 0;
    let pointerTargetY = 0;

    let pointerCurrentX = 0;
    let pointerCurrentY = 0;

    const clock = new THREE.Clock();

    const gradientTexture = createGradientTexture();

    if (gradientTexture) {
      ownedTextures.add(gradientTexture);

      scene.background = gradientTexture;
    }

    scene.fog = new THREE.FogExp2(
      0x07131b,
      mobile ? 0.022 : 0.017,
    );

    const ambient = new THREE.HemisphereLight(
      0x9bc7d5,
      0x02070b,
      mobile ? 1.15 : 1.35,
    );

    scene.add(ambient);

    const moon = new THREE.DirectionalLight(
      0xd8f2ff,
      mobile ? 1.7 : 2.15,
    );

    moon.position.set(-15, 20, 8);
    scene.add(moon);

    const horizonLight = new THREE.PointLight(
      0x74b7c8,
      mobile ? 5 : 7,
      45,
      2,
    );

    horizonLight.position.set(
      -8,
      2,
      -24,
    );

    scene.add(horizonLight);

    const distantLight = new THREE.PointLight(
      0x6d9a91,
      mobile ? 1.2 : 2,
      65,
      2,
    );

    distantLight.position.set(
      16,
      10,
      -36,
    );

    scene.add(distantLight);

    const starCount = mobile ? 170 : 360;

    const stars = createStars(
      starCount,
      54,
      30,
      mobile ? 17 : 43,
    );

    stars.position.y = 3;
    atmosphere.add(stars);

    const auroraCount = mobile ? 3 : 5;

    for (let i = 0; i < auroraCount; i += 1) {
      const ribbon = createAuroraRibbon({
        radius: 23 + i * 2.6,
        height: 10 + i * 2.2,
        width: 11,
        segments: mobile ? 32 : 52,
        color:
          i % 2 === 0
            ? 0x87bcae
            : 0x719bb0,
        opacity: mobile ? 0.055 : 0.075,
        phase: i * 1.7,
      });

      ribbon.rotation.y = i * 0.42;
      atmosphere.add(ribbon);
    }

    const textureLoader = new THREE.TextureLoader();
    const fbxLoader = new FBXLoader();

    const textures = {
      iceColor: null,
      iceNormal: null,
      iceRoughness: null,
      rockColor: null,
      rockNormal: null,
      rockRoughness: null,
    };

    const setupAssets = async () => {
      try {
        const [
          iceColor,
          iceNormal,
          iceRoughness,
          rockColor,
          rockNormal,
          rockRoughness,
        ] = await Promise.all([
          loadOptionalTexture(
            textureLoader,
            ASSETS.iceColor,
            THREE.SRGBColorSpace,
          ),
          loadOptionalTexture(
            textureLoader,
            ASSETS.iceNormal,
          ),
          loadOptionalTexture(
            textureLoader,
            ASSETS.iceRoughness,
          ),
          loadOptionalTexture(
            textureLoader,
            ASSETS.rockColor,
            THREE.SRGBColorSpace,
          ),
          loadOptionalTexture(
            textureLoader,
            ASSETS.rockNormal,
          ),
          loadOptionalTexture(
            textureLoader,
            ASSETS.rockRoughness,
          ),
        ]);

        if (destroyed) {
          [
            iceColor,
            iceNormal,
            iceRoughness,
            rockColor,
            rockNormal,
            rockRoughness,
          ].forEach((texture) => texture?.dispose());

          return;
        }

        textures.iceColor = iceColor;
        textures.iceNormal = iceNormal;
        textures.iceRoughness = iceRoughness;
        textures.rockColor = rockColor;
        textures.rockNormal = rockNormal;
        textures.rockRoughness = rockRoughness;

        Object.values(textures).forEach((texture) => {
          if (texture) {
            ownedTextures.add(texture);
          }
        });

        const iceberg = createIceberg({
          textures,
          mobile,
          ownedMaterials,
        });

        foreground.add(iceberg);

        const shelf = createIceShelf({
          textures,
          mobile,
          ownedMaterials,
        });

        foreground.add(shelf);

        const water = createWater({
          mobile,
          ownedMaterials,
        });

        foreground.add(water);

        try {
          const mountain = await new Promise(
            (resolve, reject) => {
              fbxLoader.load(
                ASSETS.mountain,
                resolve,
                undefined,
                reject,
              );
            },
          );

          if (destroyed) {
            disposeObject(
              mountain,
              ownedMaterials,
            );

            return;
          }

          mountain.scale.setScalar(
            mobile ? 0.024 : 0.031,
          );

          mountain.position.set(
            mobile ? -2.5 : -5.2,
            mobile ? -6.3 : -6.7,
            -22,
          );

          mountain.rotation.y = mobile
            ? 0.35
            : 0.48;

          applyMountainMaterials({
            root: mountain,
            textures,
            mobile,
            ownedMaterials,
          });

          loadedRoots.push(mountain);
          environment.add(mountain);
        } catch {
          // The procedural environment remains usable
          // if the external mountain asset cannot load.
        }
      } catch {
        // Procedural scene remains usable even if textures fail.
      }
    };

    const resize = () => {
      if (destroyed) return;

      const width = Math.max(
        container.clientWidth,
        1,
      );

      const height = Math.max(
        container.clientHeight,
        1,
      );

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(
        width,
        height,
        false,
      );
    };

    const handleScroll = () => {
      const maxScroll =
        document.documentElement.scrollHeight -
        window.innerHeight;

      scrollTarget =
        maxScroll > 0
          ? clamp(window.scrollY / maxScroll, 0, 1)
          : 0;
    };

    const handlePointerMove = (event) => {
      if (!finePointer) return;

      pointerTargetX =
        (event.clientX / window.innerWidth - 0.5) *
        2;

      pointerTargetY =
        (event.clientY / window.innerHeight - 0.5) *
        2;
    };

    const handlePointerLeave = () => {
      pointerTargetX = 0;
      pointerTargetY = 0;
    };

    const handleVisibility = () => {
      active =
        document.visibilityState === "visible";

      if (active) {
        clock.start();
      }
    };

    const handleContextLost = (event) => {
      event.preventDefault();
      contextLost = true;
    };

    const handleContextRestored = () => {
      contextLost = false;
      resize();
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

    window.addEventListener(
      "resize",
      resize,
      { passive: true },
    );

    window.addEventListener(
      "scroll",
      handleScroll,
      { passive: true },
    );

    window.addEventListener(
      "pointermove",
      handlePointerMove,
      { passive: true },
    );

    window.addEventListener(
      "pointerleave",
      handlePointerLeave,
      { passive: true },
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibility,
    );

    resize();
    handleScroll();

    setupAssets();

    const animate = () => {
      if (destroyed) return;

      requestAnimationFrame(animate);

      if (!active || contextLost) {
        return;
      }

      const elapsed = clock.getElapsedTime();

      const motionScale =
        prefersReducedMotion ? 0.12 : 1;

      scrollCurrent = lerp(
        scrollCurrent,
        scrollTarget,
        0.035,
      );

      pointerCurrentX = lerp(
        pointerCurrentX,
        pointerTargetX,
        0.035,
      );

      pointerCurrentY = lerp(
        pointerCurrentY,
        pointerTargetY,
        0.035,
      );

      const narrative =
        smoothstep(
          0,
          1,
          scrollCurrent,
        );

      const deeper =
        smoothstep(
          0.22,
          0.78,
          scrollCurrent,
        );

      const finalHorizon =
        smoothstep(
          0.68,
          1,
          scrollCurrent,
        );

      world.rotation.y = lerp(
        world.rotation.y,
        pointerCurrentX *
          0.018 *
          motionScale,
        0.045,
      );

      world.rotation.x = lerp(
        world.rotation.x,
        pointerCurrentY *
          -0.012 *
          motionScale,
        0.045,
      );

      camera.position.x = lerp(
        camera.position.x,
        pointerCurrentX *
          (mobile ? 0.35 : 0.72),
        0.04,
      );

      camera.position.y = lerp(
        camera.position.y,
        (mobile ? 1.3 : 1.8) +
          pointerCurrentY *
            (mobile ? -0.22 : -0.4),
        0.04,
      );

      camera.position.z = lerp(
        camera.position.z,
        (mobile ? 24 : 27) -
          narrative *
            (mobile ? 2.8 : 4.2),
        0.035,
      );

      camera.rotation.x = lerp(
        camera.rotation.x,
        pointerCurrentY *
          -0.008,
        0.04,
      );

      foreground.position.y =
        Math.sin(elapsed * 0.16) *
        0.12 *
        motionScale;

      foreground.position.z =
        narrative * 2.1;

      environment.position.y =
        narrative * 1.35;

      environment.position.z =
        narrative * 3.2;

      atmosphere.position.y =
        deeper * 2.4;

      atmosphere.position.z =
        deeper * 4.8;

      atmosphere.rotation.y =
        elapsed *
        0.004 *
        motionScale;

      stars.rotation.y =
        elapsed *
        0.002 *
        motionScale;

      stars.material.opacity =
        lerp(
          0.5,
          0.8,
          finalHorizon,
        );

      horizonLight.intensity =
        lerp(
          mobile ? 4.5 : 6,
          mobile ? 7 : 10,
          deeper,
        );

      distantLight.intensity =
        lerp(
          mobile ? 1 : 1.6,
          mobile ? 2 : 3,
          finalHorizon,
        );

      for (const child of foreground.children) {
        if (
          child.isMesh &&
          child.geometry?.type ===
            "IcosahedronGeometry"
        ) {
          child.rotation.y =
            elapsed *
            0.018 *
            motionScale;

          child.rotation.x =
            Math.sin(
              elapsed * 0.17,
            ) *
            0.025 *
            motionScale;
        }
      }

      renderer.render(
        scene,
        camera,
      );
    };

    animate();

    return () => {
      destroyed = true;

      window.removeEventListener(
        "resize",
        resize,
      );

      window.removeEventListener(
        "scroll",
        handleScroll,
      );

      window.removeEventListener(
        "pointermove",
        handlePointerMove,
      );

      window.removeEventListener(
        "pointerleave",
        handlePointerLeave,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility,
      );

      renderer.domElement.removeEventListener(
        "webglcontextlost",
        handleContextLost,
      );

      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        handleContextRestored,
      );

      disposeObject(
        world,
        ownedMaterials,
      );

      for (const texture of ownedTextures) {
        texture.dispose();
      }

      ownedMaterials.clear();
      ownedTextures.clear();

      loadedRoots.length = 0;

      scene.clear();

      renderer.dispose();

      if (
        renderer.domElement.parentNode ===
        container
      ) {
        container.removeChild(
          renderer.domElement,
        );
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="polar-scene"
      aria-hidden="true"
    />
  );
}