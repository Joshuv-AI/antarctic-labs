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

const clamp = (value, min, max) =>
  Math.min(Math.max(value, min), max);

const lerp = (a, b, t) =>
  a + (b - a) * t;

const smoothstep = (edge0, edge1, value) => {
  const t = clamp(
    (value - edge0) / (edge1 - edge0),
    0,
    1,
  );

  return t * t * (3 - 2 * t);
};

const disposeMaterial = (
  material,
  disposedMaterials,
) => {
  if (!material || disposedMaterials.has(material)) {
    return;
  }

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

    if (texture?.isTexture) {
      texture.dispose();
    }
  }

  material.dispose();
};

const disposeObject = (
  object,
  disposedMaterials,
) => {
  if (!object) return;

  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) =>
          disposeMaterial(
            material,
            disposedMaterials,
          ),
        );
      } else {
        disposeMaterial(
          child.material,
          disposedMaterials,
        );
      }
    }
  });
};

const createGradientTexture = () => {
  const canvas = document.createElement("canvas");

  canvas.width = 4;
  canvas.height = 512;

  const context = canvas.getContext("2d");

  if (!context) return null;

  const gradient = context.createLinearGradient(
    0,
    0,
    0,
    canvas.height,
  );

  gradient.addColorStop(0, "#030a12");
  gradient.addColorStop(0.18, "#071521");
  gradient.addColorStop(0.42, "#102938");
  gradient.addColorStop(0.62, "#173847");
  gradient.addColorStop(0.8, "#0a1c27");
  gradient.addColorStop(1, "#02070b");

  context.fillStyle = gradient;
  context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const texture = new THREE.CanvasTexture(
    canvas,
  );

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
};

const createGlowTexture = () => {
  const canvas = document.createElement("canvas");

  canvas.width = 256;
  canvas.height = 256;

  const context = canvas.getContext("2d");

  if (!context) return null;

  const gradient = context.createRadialGradient(
    128,
    128,
    0,
    128,
    128,
    128,
  );

  gradient.addColorStop(
    0,
    "rgba(215,245,255,1)",
  );

  gradient.addColorStop(
    0.16,
    "rgba(170,225,235,0.8)",
  );

  gradient.addColorStop(
    0.42,
    "rgba(100,180,195,0.22)",
  );

  gradient.addColorStop(
    1,
    "rgba(80,150,170,0)",
  );

  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(
    canvas,
  );

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
};

const createStars = (
  count,
  radius,
  spread,
  seed = 1,
) => {
  const positions = new Float32Array(
    count * 3,
  );

  let state = seed;

  const random = () => {
    state =
      (state * 1664525 + 1013904223) %
      4294967296;

    return state / 4294967296;
  };

  for (let i = 0; i < count; i += 1) {
    const theta =
      random() * Math.PI * 2;

    const phi = Math.acos(
      lerp(-0.18, 0.72, random()),
    );

    const distance =
      radius + random() * spread;

    positions[i * 3] =
      Math.sin(phi) *
      Math.cos(theta) *
      distance;

    positions[i * 3 + 1] =
      Math.cos(phi) * distance;

    positions[i * 3 + 2] =
      Math.sin(phi) *
      Math.sin(theta) *
      distance;
  }

  const geometry =
    new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      positions,
      3,
    ),
  );

  const material =
    new THREE.PointsMaterial({
      color: 0xdcecf1,
      size: 0.72,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending:
        THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

  return new THREE.Points(
    geometry,
    material,
  );
};

const createSnow = (
  count,
  spread,
  height,
  depth,
  seed = 11,
) => {
  const positions = new Float32Array(
    count * 3,
  );

  let state = seed;

  const random = () => {
    state =
      (state * 1664525 + 1013904223) %
      4294967296;

    return state / 4294967296;
  };

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] =
      (random() - 0.5) * spread;

    positions[i * 3 + 1] =
      random() * height - 7;

    positions[i * 3 + 2] =
      -random() * depth;
  }

  const geometry =
    new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      positions,
      3,
    ),
  );

  const material =
    new THREE.PointsMaterial({
      color: 0xcfe7ec,
      size: 0.045,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending:
        THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

  return new THREE.Points(
    geometry,
    material,
  );
};

const createAurora = ({
  radius,
  height,
  width,
  segments,
  color,
  opacity,
  phase,
}) => {
  const positions = new Float32Array(
    (segments + 1) * 3,
  );

  for (
    let i = 0;
    i <= segments;
    i += 1
  ) {
    const t = i / segments;

    const angle = lerp(
      -1.35,
      1.35,
      t,
    );

    const wave =
      Math.sin(
        t * Math.PI * 3.0 +
          phase,
      ) *
        1.55 +
      Math.sin(
        t * Math.PI * 6.5 +
          phase * 0.8,
      ) *
        0.65;

    const x =
      Math.sin(angle) *
      radius;

    const z =
      Math.cos(angle) *
      radius;

    positions[i * 3] = x;

    positions[i * 3 + 1] =
      height +
      wave +
      Math.sin(t * Math.PI) *
        width;

    positions[i * 3 + 2] = z;
  }

  const geometry =
    new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      positions,
      3,
    ),
  );

  const material =
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending:
        THREE.AdditiveBlending,
      depthWrite: false,
    });

  return new THREE.Line(
    geometry,
    material,
  );
};

const createIceberg = ({
  textures,
  mobile,
  ownedMaterials,
}) => {
  const geometry =
    new THREE.IcosahedronGeometry(
      mobile ? 5.1 : 6.7,
      mobile ? 2 : 3,
    );

  const position =
    geometry.attributes.position;

  for (
    let i = 0;
    i < position.count;
    i += 1
  ) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);

    const distortion =
      Math.sin(x * 1.7) *
        0.24 +
      Math.cos(z * 1.4) *
        0.2 +
      Math.sin(
        (x + z) * 1.05,
      ) *
        0.15;

    position.setX(
      i,
      x + distortion * 0.48,
    );

    position.setY(
      i,
      y *
        (1.06 +
          distortion * 0.07),
    );

    position.setZ(
      i,
      z + distortion * 0.4,
    );
  }

  geometry.computeVertexNormals();

  const material =
    new THREE.MeshPhysicalMaterial({
      color: 0xb9dce5,
      roughness: 0.24,
      metalness: 0.01,
      transmission: mobile
        ? 0.04
        : 0.11,
      thickness: 1.5,
      transparent: true,
      opacity: 0.94,
      envMapIntensity: 1.05,
      map:
        textures.iceColor ||
        null,
      normalMap:
        textures.iceNormal ||
        null,
      normalScale:
        new THREE.Vector2(
          0.4,
          0.4,
        ),
    });

  ownedMaterials.add(material);

  const iceberg =
    new THREE.Mesh(
      geometry,
      material,
    );

  iceberg.position.set(
    7.6,
    -5.9,
    -10.5,
  );

  iceberg.rotation.set(
    -0.16,
    -0.5,
    0.1,
  );

  return iceberg;
};

const createIceShelf = ({
  textures,
  mobile,
  ownedMaterials,
}) => {
  const geometry =
    new THREE.CylinderGeometry(
      mobile ? 8 : 11,
      mobile ? 10 : 14,
      3.4,
      mobile ? 24 : 38,
      4,
    );

  const material =
    new THREE.MeshStandardMaterial({
      color: 0x9dbfc9,
      roughness: 0.7,
      metalness: 0.01,
      map:
        textures.iceColor ||
        null,
      normalMap:
        textures.iceNormal ||
        null,
      roughnessMap:
        textures.iceRoughness ||
        null,
      normalScale:
        new THREE.Vector2(
          0.62,
          0.62,
        ),
    });

  ownedMaterials.add(material);

  const shelf =
    new THREE.Mesh(
      geometry,
      material,
    );

  shelf.position.set(
    0,
    -8.8,
    -14,
  );

  shelf.scale.set(
    1.4,
    0.42,
    1.25,
  );

  return shelf;
};

const createWater = ({
  mobile,
  ownedMaterials,
}) => {
  const geometry =
    new THREE.PlaneGeometry(
      mobile ? 78 : 115,
      mobile ? 78 : 115,
      mobile ? 20 : 38,
      mobile ? 20 : 38,
    );

  const position =
    geometry.attributes.position;

  for (
    let i = 0;
    i < position.count;
    i += 1
  ) {
    const x = position.getX(i);
    const z = position.getY(i);

    position.setZ(
      i,
      Math.sin(x * 0.075) *
        0.2 +
        Math.cos(z * 0.09) *
          0.14,
    );
  }

  geometry.computeVertexNormals();

  const material =
    new THREE.MeshStandardMaterial({
      color: 0x06151d,
      roughness: 0.32,
      metalness: 0.34,
      transparent: true,
      opacity: 0.9,
    });

  ownedMaterials.add(material);

  const water =
    new THREE.Mesh(
      geometry,
      material,
    );

  water.rotation.x =
    -Math.PI / 2;

  water.position.y = -7.2;
  water.position.z = -8;

  return water;
};

const createDistantRidge = ({
  mobile,
  ownedMaterials,
}) => {
  const geometry =
    new THREE.ConeGeometry(
      mobile ? 8 : 11,
      mobile ? 17 : 22,
      mobile ? 7 : 9,
    );

  const material =
    new THREE.MeshStandardMaterial({
      color: 0x203842,
      roughness: 0.98,
      metalness: 0,
      transparent: true,
      opacity: 0.72,
    });

  ownedMaterials.add(material);

  const ridge =
    new THREE.Mesh(
      geometry,
      material,
    );

  ridge.scale.set(
    2.4,
    1,
    0.72,
  );

  ridge.position.set(
    -13,
    -4.8,
    -38,
  );

  ridge.rotation.z = -0.12;

  return ridge;
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

    const sourceMaterial =
      Array.isArray(child.material)
        ? child.material[0]
        : child.material;

    const sourceColor =
      sourceMaterial?.color?.clone() ||
      new THREE.Color(0x71868d);

    const material =
      new THREE.MeshStandardMaterial({
        color:
          sourceColor.multiplyScalar(
            0.7,
          ),
        map:
          textures.rockColor ||
          null,
        normalMap:
          textures.rockNormal ||
          null,
        roughnessMap:
          textures.rockRoughness ||
          null,
        roughness: 0.86,
        metalness: 0.015,
      });

    material.normalScale.set(
      mobile ? 0.34 : 0.5,
      mobile ? 0.34 : 0.5,
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
  new Promise(
    (resolve, reject) => {
      loader.load(
        url,
        (texture) => {
          if (colorSpace) {
            texture.colorSpace =
              colorSpace;
          }

          texture.anisotropy = 1;

          resolve(texture);
        },
        undefined,
        reject,
      );
    },
  );

const loadOptionalTexture = (
  loader,
  url,
  colorSpace = null,
) =>
  loadTexture(
    loader,
    url,
    colorSpace,
  ).catch(() => null);

export default function PolarScene() {
  const containerRef =
    useRef(null);

  useEffect(() => {
    const container =
      containerRef.current;

    if (!container) {
      return undefined;
    }

    const prefersReducedMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

    const finePointer =
      window.matchMedia(
        "(pointer: fine)",
      ).matches;

    const mobile =
      window.matchMedia(
        "(max-width: 760px)",
      ).matches ||
      !finePointer;

    const lowPower =
      mobile ||
      window.matchMedia(
        "(max-width: 900px)",
      ).matches;

    const scene =
      new THREE.Scene();

    const camera =
      new THREE.PerspectiveCamera(
        mobile ? 44 : 39,
        1,
        0.1,
        180,
      );

    camera.position.set(
      mobile ? 0 : 0.7,
      mobile ? 1.1 : 1.7,
      mobile ? 24.5 : 28,
    );

    const renderer =
      new THREE.WebGLRenderer({
        antialias: !lowPower,
        alpha: true,
        powerPreference:
          "high-performance",
        preserveDrawingBuffer:
          false,
      });

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        mobile ? 1.2 : 1.55,
      ),
    );

    renderer.outputColorSpace =
      THREE.SRGBColorSpace;

    renderer.toneMapping =
      THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure =
      mobile ? 0.88 : 1.04;

    renderer.domElement.setAttribute(
      "aria-hidden",
      "true",
    );

    renderer.domElement.style.display =
      "block";

    renderer.domElement.style.width =
      "100%";

    renderer.domElement.style.height =
      "100%";

    container.appendChild(
      renderer.domElement,
    );

    const world =
      new THREE.Group();

    scene.add(world);

    const environment =
      new THREE.Group();

    world.add(environment);

    const distant =
      new THREE.Group();

    world.add(distant);

    const foreground =
      new THREE.Group();

    world.add(foreground);

    const atmosphere =
      new THREE.Group();

    world.add(atmosphere);

    const ownedMaterials =
      new Set();

    const ownedTextures =
      new Set();

    let destroyed = false;
    let active =
      document.visibilityState ===
      "visible";

    let contextLost = false;

    let scrollTarget = 0;
    let scrollCurrent = 0;

    let pointerTargetX = 0;
    let pointerTargetY = 0;

    let pointerCurrentX = 0;
    let pointerCurrentY = 0;

    const clock =
      new THREE.Clock();

    const gradientTexture =
      createGradientTexture();

    if (gradientTexture) {
      ownedTextures.add(
        gradientTexture,
      );

      scene.background =
        gradientTexture;
    }

    scene.fog =
      new THREE.FogExp2(
        0x07141c,
        mobile ? 0.024 : 0.018,
      );

    const ambient =
      new THREE.HemisphereLight(
        0xa8d0dc,
        0x02070a,
        mobile ? 1.12 : 1.32,
      );

    scene.add(ambient);

    const moon =
      new THREE.DirectionalLight(
        0xd9f1ff,
        mobile ? 1.55 : 2.1,
      );

    moon.position.set(
      -16,
      22,
      10,
    );

    scene.add(moon);

    const horizonLight =
      new THREE.PointLight(
        0x73b8c9,
        mobile ? 5 : 7,
        48,
        2,
      );

    horizonLight.position.set(
      -8,
      2,
      -26,
    );

    scene.add(
      horizonLight,
    );

    const auroraLight =
      new THREE.PointLight(
        0x75a99c,
        mobile ? 1.4 : 2.5,
        62,
        2,
      );

    auroraLight.position.set(
      13,
      11,
      -31,
    );

    scene.add(
      auroraLight,
    );

    const glowTexture =
      createGlowTexture();

    if (glowTexture) {
      ownedTextures.add(
        glowTexture,
      );

      const glowMaterial =
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: 0x8cc7d4,
          transparent: true,
          opacity: mobile
            ? 0.2
            : 0.26,
          depthWrite: false,
          blending:
            THREE.AdditiveBlending,
        });

      ownedMaterials.add(
        glowMaterial,
      );

      const glow =
        new THREE.Sprite(
          glowMaterial,
        );

      glow.scale.set(
        mobile ? 25 : 34,
        mobile ? 25 : 34,
        1,
      );

      glow.position.set(
        -9,
        3,
        -34,
      );

      atmosphere.add(glow);
    }

    const starCount =
      mobile ? 130 : 420;

    const stars =
      createStars(
        starCount,
        55,
        32,
        mobile ? 17 : 43,
      );

    stars.position.y = 5;

    atmosphere.add(stars);

    const snow =
      createSnow(
        mobile ? 150 : 340,
        mobile ? 48 : 74,
        mobile ? 22 : 30,
        mobile ? 48 : 66,
        mobile ? 31 : 71,
      );

    atmosphere.add(snow);

    const auroraCount =
      mobile ? 3 : 6;

    for (
      let i = 0;
      i < auroraCount;
      i += 1
    ) {
      const ribbon =
        createAurora({
          radius:
            22 +
            i * 2.4,
          height:
            10 +
            i * 1.7,
          width:
            1.4 +
            i * 0.1,
          segments:
            mobile ? 30 : 58,
          color:
            i % 2 === 0
              ? 0x8bbdae
              : 0x759eb1,
          opacity:
            mobile ? 0.075 : 0.095,
          phase:
            i * 1.65,
        });

      ribbon.rotation.y =
        i * 0.38;

      atmosphere.add(
        ribbon,
      );
    }

    const ridge =
      createDistantRidge({
        mobile,
        ownedMaterials,
      });

    distant.add(ridge);

    const ridgeTwo =
      createDistantRidge({
        mobile,
        ownedMaterials,
      });

    ridgeTwo.position.set(
      18,
      -6,
      -47,
    );

    ridgeTwo.scale.set(
      1.8,
      0.82,
      0.58,
    );

    distant.add(ridgeTwo);

    const textureLoader =
      new THREE.TextureLoader();

    const fbxLoader =
      new FBXLoader();

    const textures = {
      iceColor: null,
      iceNormal: null,
      iceRoughness: null,
      rockColor: null,
      rockNormal: null,
      rockRoughness: null,
    };

    const setupAssets =
      async () => {
        try {
          const [
            iceColor,
            iceNormal,
            iceRoughness,
            rockColor,
            rockNormal,
            rockRoughness,
          ] =
            await Promise.all([
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
            ].forEach(
              (texture) =>
                texture?.dispose(),
            );

            return;
          }

          textures.iceColor =
            iceColor;

          textures.iceNormal =
            iceNormal;

          textures.iceRoughness =
            iceRoughness;

          textures.rockColor =
            rockColor;

          textures.rockNormal =
            rockNormal;

          textures.rockRoughness =
            rockRoughness;

          Object.values(
            textures,
          ).forEach(
            (texture) => {
              if (texture) {
                ownedTextures.add(
                  texture,
                );
              }
            },
          );

          const iceberg =
            createIceberg({
              textures,
              mobile,
              ownedMaterials,
            });

          foreground.add(
            iceberg,
          );

          const shelf =
            createIceShelf({
              textures,
              mobile,
              ownedMaterials,
            });

          foreground.add(
            shelf,
          );

          const water =
            createWater({
              mobile,
              ownedMaterials,
            });

          foreground.add(
            water,
          );

          try {
            const mountain =
              await new Promise(
                (
                  resolve,
                  reject,
                ) => {
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
              mobile
                ? 0.024
                : 0.031,
            );

            mountain.position.set(
              mobile ? -2.2 : -5.4,
              mobile ? -6.25 : -6.7,
              -22,
            );

            mountain.rotation.y =
              mobile
                ? 0.32
                : 0.47;

            applyMountainMaterials({
              root: mountain,
              textures,
              mobile,
              ownedMaterials,
            });

            environment.add(
              mountain,
            );
          } catch {
            // Procedural ridge remains.
          }
        } catch {
          // Procedural environment remains usable.
        }
      };

    const resize = () => {
      if (destroyed) return;

      const width =
        Math.max(
          container.clientWidth,
          1,
        );

      const height =
        Math.max(
          container.clientHeight,
          1,
        );

      camera.aspect =
        width / height;

      camera.updateProjectionMatrix();

      renderer.setSize(
        width,
        height,
        false,
      );
    };

    const handleScroll = () => {
      const maxScroll =
        document.documentElement
          .scrollHeight -
        window.innerHeight;

      scrollTarget =
        maxScroll > 0
          ? clamp(
              window.scrollY /
                maxScroll,
              0,
              1,
            )
          : 0;
    };

    const handlePointerMove =
      (event) => {
        if (!finePointer) {
          return;
        }

        pointerTargetX =
          (event.clientX /
            window.innerWidth -
            0.5) *
          2;

        pointerTargetY =
          (event.clientY /
            window.innerHeight -
            0.5) *
          2;
      };

    const handlePointerLeave =
      () => {
        pointerTargetX = 0;
        pointerTargetY = 0;
      };

    const handleVisibility =
      () => {
        active =
          document.visibilityState ===
          "visible";

        if (active) {
          clock.start();
        }
      };

    const handleContextLost =
      (event) => {
        event.preventDefault();
        contextLost = true;
      };

    const handleContextRestored =
      () => {
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

    let animationFrame = 0;

    const animate = () => {
      if (destroyed) return;

      animationFrame =
        requestAnimationFrame(
          animate,
        );

      if (
        !active ||
        contextLost
      ) {
        return;
      }

      const elapsed =
        clock.getElapsedTime();

      const motionScale =
        prefersReducedMotion
          ? 0.12
          : 1;

      scrollCurrent =
        lerp(
          scrollCurrent,
          scrollTarget,
          0.038,
        );

      pointerCurrentX =
        lerp(
          pointerCurrentX,
          pointerTargetX,
          0.035,
        );

      pointerCurrentY =
        lerp(
          pointerCurrentY,
          pointerTargetY,
          0.035,
        );

      const arrival =
        smoothstep(
          0,
          0.25,
          scrollCurrent,
        );

      const deeper =
        smoothstep(
          0.18,
          0.7,
          scrollCurrent,
        );

      const horizon =
        smoothstep(
          0.62,
          1,
          scrollCurrent,
        );

      const descent =
        smoothstep(
          0,
          1,
          scrollCurrent,
        );

      world.rotation.y =
        lerp(
          world.rotation.y,
          pointerCurrentX *
            0.02 *
            motionScale,
          0.045,
        );

      world.rotation.x =
        lerp(
          world.rotation.x,
          pointerCurrentY *
            -0.014 *
            motionScale,
          0.045,
        );

      camera.position.x =
        lerp(
          camera.position.x,
          pointerCurrentX *
            (mobile
              ? 0.32
              : 0.72),
          0.04,
        );

      camera.position.y =
        lerp(
          camera.position.y,
          (mobile
            ? 1.1
            : 1.7) +
            pointerCurrentY *
              (mobile
                ? -0.2
                : -0.38),
          0.04,
        );

      camera.position.z =
        lerp(
          camera.position.z,
          (mobile
            ? 24.5
            : 28) -
            descent *
              (mobile
                ? 3.8
                : 5.8),
          0.032,
        );

      camera.rotation.x =
        lerp(
          camera.rotation.x,
          pointerCurrentY *
            -0.009,
          0.04,
        );

      environment.position.y =
        arrival * 1.1;

      environment.position.z =
        arrival * 3.8;

      environment.rotation.y =
        Math.sin(
          elapsed * 0.035,
        ) *
        0.006 *
        motionScale;

      distant.position.y =
        deeper * 0.85;

      distant.position.z =
        deeper * 4.5;

      atmosphere.position.y =
        deeper * 2.5;

      atmosphere.position.z =
        deeper * 5.5;

      atmosphere.rotation.y =
        elapsed *
        0.004 *
        motionScale;

      stars.rotation.y =
        elapsed *
        0.0022 *
        motionScale;

      snow.rotation.y =
        Math.sin(
          elapsed * 0.08,
        ) *
        0.035 *
        motionScale;

      snow.position.x =
        Math.sin(
          elapsed * 0.13,
        ) *
        0.55 *
        motionScale;

      snow.position.y =
        Math.cos(
          elapsed * 0.09,
        ) *
        0.3 *
        motionScale;

      stars.material.opacity =
        lerp(
          0.42,
          0.82,
          horizon,
        );

      horizonLight.intensity =
        lerp(
          mobile ? 4.6 : 6,
          mobile ? 8 : 11,
          deeper,
        );

      auroraLight.intensity =
        lerp(
          mobile ? 1.1 : 1.8,
          mobile ? 2 : 3.4,
          horizon,
        );

      moon.intensity =
        lerp(
          mobile ? 1.45 : 1.95,
          mobile ? 1.8 : 2.35,
          horizon,
        );

      for (
        let i = 0;
        i <
        atmosphere.children.length;
        i += 1
      ) {
        const child =
          atmosphere.children[i];

        if (
          child.isLine
        ) {
          child.material.opacity =
            lerp(
              mobile
                ? 0.055
                : 0.07,
              mobile
                ? 0.11
                : 0.15,
              horizon,
            );

          child.position.y =
            Math.sin(
              elapsed * 0.12 +
                i,
            ) *
            0.22 *
            motionScale;
        }
      }

      for (
        const child of foreground.children
      ) {
        if (
          child.isMesh &&
          child.geometry?.type ===
            "IcosahedronGeometry"
        ) {
          child.rotation.y =
            elapsed *
            0.014 *
            motionScale;

          child.rotation.x =
            Math.sin(
              elapsed * 0.15,
            ) *
            0.024 *
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

      cancelAnimationFrame(
        animationFrame,
      );

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

      for (
        const texture of ownedTextures
      ) {
        texture.dispose();
      }

      ownedMaterials.clear();
      ownedTextures.clear();

      scene.clear();

      renderer.dispose();

      if (
        renderer.domElement
          .parentNode ===
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