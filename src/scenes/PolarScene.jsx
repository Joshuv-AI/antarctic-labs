import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const ASSETS = {
  sky: "/assets/hdr/daysky-8k-hdr-4k.jpg",
  mountain: "/assets/models/mountains/chalaadi.fbx",

  iceColor: "/assets/textures/ice/ice-color.png",
  iceNormal: "/assets/textures/ice/ice-normal.jpg",
  iceRoughness: "/assets/textures/ice/ice-roughness.png",

  iceAccent: "/assets/textures/ice/ice-004-color.png",

  snowColor: "/assets/textures/snow/snow-color.png",
  snowRoughness: "/assets/textures/snow/snow-roughness.png",

  rockColor: "/assets/textures/rock/rock-color.png",
  rockNormal: "/assets/textures/rock/rock-normal.png",
  rockRoughness: "/assets/textures/rock/rock-roughness.png",
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function disposeMaterial(material) {
  if (!material) return;

  for (const key of Object.keys(material)) {
    const value = material[key];

    if (value && value.isTexture) {
      value.dispose();
    }
  }

  material.dispose();
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(disposeMaterial);
      } else {
        disposeMaterial(child.material);
      }
    }
  });
}

function loadTexture(
  loader,
  url,
  {
    colorSpace = THREE.NoColorSpace,
    repeat = true,
    anisotropy = 4,
  } = {}
) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = colorSpace;
        texture.anisotropy = anisotropy;

        if (repeat) {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
        }

        resolve(texture);
      },
      undefined,
      reject
    );
  });
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  draw(context, width, height);

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}

function createStarTexture() {
  return canvasTexture(256, 256, (ctx, width, height) => {
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      width / 2
    );

    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.08, "rgba(235,250,255,.95)");
    gradient.addColorStop(0.24, "rgba(180,225,240,.35)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
}

function createAuroraTexture() {
  return canvasTexture(1600, 700, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);

    const glow = ctx.createLinearGradient(0, 0, width, 0);

    glow.addColorStop(0, "rgba(50,220,205,0)");
    glow.addColorStop(0.2, "rgba(60,220,205,.08)");
    glow.addColorStop(0.38, "rgba(110,240,220,.22)");
    glow.addColorStop(0.52, "rgba(80,205,240,.18)");
    glow.addColorStop(0.7, "rgba(100,225,210,.10)");
    glow.addColorStop(1, "rgba(50,220,205,0)");

    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    for (let layer = 0; layer < 10; layer += 1) {
      const baseY = height * (0.18 + layer * 0.065);

      ctx.beginPath();

      for (let x = -20; x <= width + 20; x += 12) {
        const wave =
          Math.sin(x * 0.0052 + layer * 0.82) * 28 +
          Math.sin(x * 0.011 + layer * 0.37) * 13 +
          Math.sin(x * 0.0021 + layer) * 22;

        const y = baseY + wave;

        if (x === -20) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      for (let x = width + 20; x >= -20; x -= 12) {
        const wave =
          Math.sin(x * 0.0052 + layer * 0.82) * 28 +
          Math.sin(x * 0.011 + layer * 0.37) * 13 +
          Math.sin(x * 0.0021 + layer) * 22;

        ctx.lineTo(x, baseY + wave + 95);
      }

      ctx.closePath();

      ctx.fillStyle = `rgba(
        ${72 + layer * 2},
        ${215 + layer * 2},
        ${205 + layer * 3},
        ${0.018 + layer * 0.004}
      )`;

      ctx.fill();
    }
  });
}

function createAtmosphereTexture() {
  return canvasTexture(1600, 700, (ctx, width, height) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);

    gradient.addColorStop(0, "rgba(190,235,245,0)");
    gradient.addColorStop(0.32, "rgba(170,225,238,.025)");
    gradient.addColorStop(0.62, "rgba(150,210,228,.10)");
    gradient.addColorStop(0.82, "rgba(170,225,238,.18)");
    gradient.addColorStop(1, "rgba(210,240,245,.32)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(
      width / 2,
      height * 0.82,
      0,
      width / 2,
      height * 0.82,
      width * 0.62
    );

    glow.addColorStop(0, "rgba(200,235,245,.20)");
    glow.addColorStop(0.35, "rgba(150,210,228,.08)");
    glow.addColorStop(1, "rgba(100,160,190,0)");

    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  });
}

function createStars(count, mobile) {
  const geometry = new THREE.BufferGeometry();

  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const radius = 62 + Math.random() * 55;

    const theta = Math.random() * Math.PI * 2;

    const phi =
      Math.random() * Math.PI * (mobile ? 0.30 : 0.38);

    const x = Math.cos(theta) * Math.sin(phi) * radius;

    const y =
      Math.cos(phi) * radius +
      4 +
      Math.random() * 6;

    const z =
      Math.sin(theta) * Math.sin(phi) * radius -
      24;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    sizes[i] =
      0.35 +
      Math.random() *
        (mobile ? 0.42 : 0.85);
  }

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );

  geometry.setAttribute(
    "aSize",
    new THREE.BufferAttribute(sizes, 1)
  );

  const material = new THREE.PointsMaterial({
    color: new THREE.Color("#dff4fa"),
    size: mobile ? 0.11 : 0.145,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: createStarTexture(),
  });

  return new THREE.Points(geometry, material);
}

function createAurora() {
  const group = new THREE.Group();

  const texture = createAuroraTexture();

  const layers = [
    {
      width: 94,
      height: 30,
      y: 22,
      z: -70,
      opacity: 0.32,
      rotation: -0.035,
      scaleX: 1,
    },
    {
      width: 82,
      height: 26,
      y: 26,
      z: -64,
      opacity: 0.23,
      rotation: 0.028,
      scaleX: 1.12,
    },
    {
      width: 70,
      height: 22,
      y: 30,
      z: -59,
      opacity: 0.16,
      rotation: -0.045,
      scaleX: 1.24,
    },
  ];

  layers.forEach((layer, index) => {
    const geometry = new THREE.PlaneGeometry(
      layer.width,
      layer.height
    );

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: layer.opacity,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(
      geometry,
      material
    );

    mesh.position.set(
      0,
      layer.y,
      layer.z
    );

    mesh.rotation.z = layer.rotation;

    mesh.scale.x = layer.scaleX;

    mesh.userData.auroraIndex = index;

    group.add(mesh);
  });

  return group;
}

function createDistantRidge() {
  const group = new THREE.Group();

  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#6c8996"),
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });

  const profiles = [
    {
      x: -34,
      z: -47,
      scale: 1.4,
      height: 13,
    },
    {
      x: -19,
      z: -50,
      scale: 1.15,
      height: 10,
    },
    {
      x: -4,
      z: -48,
      scale: 1.3,
      height: 14,
    },
    {
      x: 12,
      z: -51,
      scale: 1.1,
      height: 11,
    },
    {
      x: 27,
      z: -48,
      scale: 1.4,
      height: 15,
    },
    {
      x: 43,
      z: -46,
      scale: 1.1,
      height: 12,
    },
  ];

  profiles.forEach((peak, index) => {
    const geometry = new THREE.ConeGeometry(
      7.5 * peak.scale,
      peak.height,
      5
    );

    const mesh = new THREE.Mesh(
      geometry,
      material.clone()
    );

    mesh.position.set(
      peak.x,
      -0.4 + index * 0.03,
      peak.z
    );

    mesh.rotation.y =
      Math.random() * Math.PI;

    mesh.scale.z = 0.65;

    group.add(mesh);
  });

  return group;
}

function createSecondaryRidge() {
  const group = new THREE.Group();

  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#94aeb8"),
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });

  const peaks = [
    [-38, -38, 9],
    [-26, -41, 12],
    [-13, -39, 7],
    [0, -42, 11],
    [15, -40, 8],
    [28, -42, 12],
    [40, -38, 8],
  ];

  peaks.forEach(([x, z, height]) => {
    const geometry = new THREE.ConeGeometry(
      6.5,
      height,
      5
    );

    const mesh = new THREE.Mesh(
      geometry,
      material.clone()
    );

    mesh.position.set(
      x,
      -1.2,
      z
    );

    mesh.scale.z = 0.6;

    group.add(mesh);
  });

  return group;
}

function normalizeMountain(model) {
  const originalBox = new THREE.Box3()
    .setFromObject(model);

  const originalSize =
    originalBox.getSize(
      new THREE.Vector3()
    );

  const targetHeight = 25;

  const scale =
    targetHeight /
    Math.max(originalSize.y, 0.001);

  model.scale.setScalar(scale);

  const box = new THREE.Box3()
    .setFromObject(model);

  const center =
    box.getCenter(
      new THREE.Vector3()
    );

  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  return model;
}

function preserveOrStyleMountain(model, textures, mobile) {
  model.traverse((child) => {
    if (!child.isMesh) return;

    child.castShadow = false;
    child.receiveShadow = true;

    /*
     * Keep the original FBX material whenever possible.
     *
     * This is intentional:
     * the previous scene replaced the mountain material
     * wholesale with an ice texture, which can make a good
     * model look like a generic textured blob.
     */

    if (!child.material) {
      child.material =
        new THREE.MeshStandardMaterial({
          map: textures.iceColor,
          normalMap: mobile
            ? null
            : textures.iceNormal,
          roughnessMap:
            textures.iceRoughness,
          roughness: 0.82,
          metalness: 0,
          color: new THREE.Color(
            "#dcebf0"
          ),
          envMapIntensity: 0.55,
        });
    } else {
      const materials = Array.isArray(
        child.material
      )
        ? child.material
        : [child.material];

      materials.forEach((material) => {
        if (!material) return;

        material.roughness =
          material.roughness ??
          0.82;

        material.metalness =
          material.metalness ??
          0;

        if (
          material.color &&
          material.color.r === 1 &&
          material.color.g === 1 &&
          material.color.b === 1
        ) {
          material.color.set(
            "#dcebf0"
          );
        }

        if (
          material.isMeshStandardMaterial ||
          material.isMeshPhysicalMaterial
        ) {
          material.envMapIntensity =
            0.5;
        }
      });
    }
  });

  return model;
}

function createIceShelf(
  textures,
  mobile
) {
  const geometry =
    new THREE.PlaneGeometry(
      105,
      92,
      mobile ? 28 : 56,
      mobile ? 28 : 56
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

    const edge =
      Math.max(
        0,
        Math.abs(x) - 34
      ) / 18;

    const roughness =
      Math.sin(x * 0.22) * 0.18 +
      Math.sin(z * 0.16) * 0.12;

    const y =
      roughness -
      edge * edge * 0.9;

    position.setZ(i, y);
  }

  geometry.computeVertexNormals();

  const material =
    new THREE.MeshStandardMaterial({
      map: textures.iceColor,
      normalMap: mobile
        ? null
        : textures.iceNormal,
      roughnessMap:
        textures.iceRoughness,
      color: new THREE.Color(
        "#d9edf1"
      ),
      roughness: 0.76,
      metalness: 0.015,
      envMapIntensity: 0.42,
    });

  const mesh =
    new THREE.Mesh(
      geometry,
      material
    );

  mesh.rotation.x =
    -Math.PI / 2;

  mesh.position.set(
    0,
    -4.5,
    -18
  );

  return mesh;
}

function createForegroundIce(
  textures,
  mobile
) {
  const group =
    new THREE.Group();

  const formations = [
    {
      x: -18,
      y: -3.4,
      z: 5,
      sx: 10,
      sy: 2.7,
      sz: 7,
      rot: -0.12,
    },
    {
      x: -8,
      y: -3.8,
      z: 12,
      sx: 8,
      sy: 3.2,
      sz: 6,
      rot: 0.08,
    },
    {
      x: 11,
      y: -3.55,
      z: 8,
      sx: 12,
      sy: 3.0,
      sz: 7,
      rot: -0.04,
    },
    {
      x: 22,
      y: -3.3,
      z: 2,
      sx: 9,
      sy: 2.6,
      sz: 6,
      rot: 0.11,
    },
    {
      x: 3,
      y: -4,
      z: 17,
      sx: 17,
      sy: 3.4,
      sz: 9,
      rot: 0,
    },
  ];

  formations.forEach(
    (formation, index) => {
      const geometry =
        new THREE.IcosahedronGeometry(
          1,
          mobile ? 1 : 2
        );

      const material =
        new THREE.MeshStandardMaterial(
          {
            map:
              index % 2 === 0
                ? textures.iceAccent
                : textures.iceColor,
            normalMap:
              mobile
                ? null
                : textures.iceNormal,
            roughnessMap:
              textures.iceRoughness,
            color: new THREE.Color(
              index % 2 === 0
                ? "#c9e4eb"
                : "#dceef2"
            ),
            roughness: 0.7,
            metalness: 0.015,
            envMapIntensity: 0.5,
          }
        );

      const mesh =
        new THREE.Mesh(
          geometry,
          material
        );

      mesh.scale.set(
        formation.sx,
        formation.sy,
        formation.sz
      );

      mesh.position.set(
        formation.x,
        formation.y,
        formation.z
      );

      mesh.rotation.set(
        0.05,
        index * 0.55,
        formation.rot
      );

      mesh.userData.baseY =
        formation.y;

      mesh.userData.index =
        index;

      group.add(mesh);
    }
  );

  return group;
}

function createWater() {
  const geometry =
    new THREE.PlaneGeometry(
      140,
      120,
      40,
      40
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

    const wave =
      Math.sin(x * 0.18) *
        0.055 +
      Math.sin(z * 0.13) *
        0.04 +
      Math.sin(
        (x + z) * 0.09
      ) *
        0.035;

    position.setZ(
      i,
      wave
    );
  }

  geometry.computeVertexNormals();

  const material =
    new THREE.MeshStandardMaterial(
      {
        color:
          new THREE.Color(
            "#07151d"
          ),
        roughness: 0.28,
        metalness: 0.58,
        transparent: true,
        opacity: 0.93,
        envMapIntensity: 0.5,
      }
    );

  const mesh =
    new THREE.Mesh(
      geometry,
      material
    );

  mesh.rotation.x =
    -Math.PI / 2;

  mesh.position.set(
    0,
    -5.45,
    18
  );

  return mesh;
}

function createAtmosphereLayer() {
  const geometry =
    new THREE.PlaneGeometry(
      125,
      62
    );

  const texture =
    createAtmosphereTexture();

  const material =
    new THREE.MeshBasicMaterial(
      {
        map: texture,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        depthTest: false,
        blending:
          THREE.NormalBlending,
        side:
          THREE.DoubleSide,
      }
    );

  const mesh =
    new THREE.Mesh(
      geometry,
      material
    );

  mesh.position.set(
    0,
    5,
    -34
  );

  return mesh;
}

function createHorizonGlow() {
  const texture =
    canvasTexture(
      1200,
      500,
      (ctx, width, height) => {
        const gradient =
          ctx.createRadialGradient(
            width / 2,
            height * 0.72,
            0,
            width / 2,
            height * 0.72,
            width * 0.62
          );

        gradient.addColorStop(
          0,
          "rgba(180,230,240,.17)"
        );

        gradient.addColorStop(
          0.35,
          "rgba(110,190,215,.08)"
        );

        gradient.addColorStop(
          1,
          "rgba(60,120,160,0)"
        );

        ctx.fillStyle =
          gradient;

        ctx.fillRect(
          0,
          0,
          width,
          height
        );
      }
    );

  const geometry =
    new THREE.PlaneGeometry(
      110,
      40
    );

  const material =
    new THREE.MeshBasicMaterial(
      {
        map: texture,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending:
          THREE.AdditiveBlending,
      }
    );

  const mesh =
    new THREE.Mesh(
      geometry,
      material
    );

  mesh.position.set(
    0,
    1,
    -31
  );

  return mesh;
}

export default function PolarScene() {
  const mountRef =
    useRef(null);

  useEffect(() => {
    const mount =
      mountRef.current;

    if (!mount) {
      return undefined;
    }

    let destroyed = false;

    const reducedMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

    const mobile =
      window.matchMedia(
        "(max-width: 768px)"
      ).matches ||
      window.matchMedia(
        "(pointer: coarse)"
      ).matches;

    const scene =
      new THREE.Scene();

    const camera =
      new THREE.PerspectiveCamera(
        mobile ? 49 : 44,
        window.innerWidth /
          window.innerHeight,
        0.1,
        260
      );

    camera.position.set(
      0,
      6.8,
      24
    );

    camera.lookAt(
      0,
      7,
      -25
    );

    const renderer =
      new THREE.WebGLRenderer(
        {
          antialias: !mobile,
          alpha: false,
          powerPreference:
            "high-performance",
        }
      );

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        mobile ? 1.35 : 1.75
      )
    );

    renderer.setSize(
      window.innerWidth,
      window.innerHeight
    );

    renderer.outputColorSpace =
      THREE.SRGBColorSpace;

    renderer.toneMapping =
      THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure =
      mobile ? 0.92 : 1.02;

    renderer.shadowMap.enabled =
      false;

    mount.appendChild(
      renderer.domElement
    );

    const clock =
      new THREE.Clock();

    const textureLoader =
      new THREE.TextureLoader();

    const fbxLoader =
      new FBXLoader();

    const ambient =
      new THREE.HemisphereLight(
        new THREE.Color(
          "#d5edf3"
        ),
        new THREE.Color(
          "#071017"
        ),
        1.15
      );

    scene.add(ambient);

    const moonLight =
      new THREE.DirectionalLight(
        new THREE.Color(
          "#d9f1ff"
        ),
        1.65
      );

    moonLight.position.set(
      -28,
      32,
      16
    );

    scene.add(moonLight);

    const cyanFill =
      new THREE.PointLight(
        new THREE.Color(
          "#75d7d4"
        ),
        1.1,
        75
      );

    cyanFill.position.set(
      0,
      8,
      -18
    );

    scene.add(cyanFill);

    const world =
      new THREE.Group();

    scene.add(world);

    let skyTexture = null;
    let mountain = null;

    let stars = null;
    let aurora = null;
    let distantRidge = null;
    let secondaryRidge = null;
    let atmosphere = null;
    let horizonGlow = null;
    let iceShelf = null;
    let foregroundIce = null;
    let water = null;

    const pointer = {
      x: 0,
      y: 0,
    };

    const targetPointer = {
      x: 0,
      y: 0,
    };

    const onPointerMove =
      (event) => {
        targetPointer.x =
          (event.clientX /
            window.innerWidth -
            0.5) *
          2;

        targetPointer.y =
          (event.clientY /
            window.innerHeight -
            0.5) *
          2;
      };

    window.addEventListener(
      "pointermove",
      onPointerMove,
      { passive: true }
    );

    const loadEverything =
      async () => {
        try {
          const [
            loadedSky,
            iceColor,
            iceNormal,
            iceRoughness,
            iceAccent,
            snowColor,
            snowRoughness,
            rockColor,
            rockNormal,
            rockRoughness,
          ] = await Promise.all([
            loadTexture(
              textureLoader,
              ASSETS.sky,
              {
                colorSpace:
                  THREE.SRGBColorSpace,
                repeat: false,
                anisotropy: 2,
              }
            ),

            loadTexture(
              textureLoader,
              ASSETS.iceColor,
              {
                colorSpace:
                  THREE.SRGBColorSpace,
              }
            ),

            loadTexture(
              textureLoader,
              ASSETS.iceNormal
            ),

            loadTexture(
              textureLoader,
              ASSETS.iceRoughness
            ),

            loadTexture(
              textureLoader,
              ASSETS.iceAccent,
              {
                colorSpace:
                  THREE.SRGBColorSpace,
              }
            ),

            loadTexture(
              textureLoader,
              ASSETS.snowColor,
              {
                colorSpace:
                  THREE.SRGBColorSpace,
              }
            ),

            loadTexture(
              textureLoader,
              ASSETS.snowRoughness
            ),

            loadTexture(
              textureLoader,
              ASSETS.rockColor,
              {
                colorSpace:
                  THREE.SRGBColorSpace,
              }
            ),

            loadTexture(
              textureLoader,
              ASSETS.rockNormal
            ),

            loadTexture(
              textureLoader,
              ASSETS.rockRoughness
            ),
          ]);

          if (destroyed) {
            return;
          }

          skyTexture =
            loadedSky;

          /*
           * The actual sky asset is now the
           * physical background of the world.
           */
          skyTexture.mapping =
            THREE.EquirectangularReflectionMapping;

          scene.background =
            skyTexture;

          scene.environment =
            skyTexture;

          const textures = {
            iceColor,
            iceNormal,
            iceRoughness,
            iceAccent,
            snowColor,
            snowRoughness,
            rockColor,
            rockNormal,
            rockRoughness,
          };

          /*
           * ENVIRONMENT ORDER
           *
           * Far sky
           * ↓
           * stars
           * ↓
           * aurora
           * ↓
           * distant ridge
           * ↓
           * secondary ridge
           * ↓
           * hero mountain
           * ↓
           * atmospheric veil
           * ↓
           * ice shelf
           * ↓
           * foreground ice
           * ↓
           * water
           */

          stars = createStars(
            mobile ? 180 : 430,
            mobile
          );

          world.add(stars);

          aurora =
            createAurora();

          world.add(aurora);

          distantRidge =
            createDistantRidge();

          world.add(
            distantRidge
          );

          secondaryRidge =
            createSecondaryRidge();

          world.add(
            secondaryRidge
          );

          horizonGlow =
            createHorizonGlow();

          world.add(
            horizonGlow
          );

          atmosphere =
            createAtmosphereLayer();

          world.add(
            atmosphere
          );

          iceShelf =
            createIceShelf(
              textures,
              mobile
            );

          world.add(
            iceShelf
          );

          foregroundIce =
            createForegroundIce(
              textures,
              mobile
            );

          world.add(
            foregroundIce
          );

          water =
            createWater();

          world.add(water);

          /*
           * Load the real mountain model.
           */
          fbxLoader.load(
            ASSETS.mountain,
            (loadedModel) => {
              if (destroyed) {
                disposeObject(
                  loadedModel
                );
                return;
              }

              mountain =
                normalizeMountain(
                  loadedModel
                );

              mountain =
                preserveOrStyleMountain(
                  mountain,
                  textures,
                  mobile
                );

              mountain.position.set(
                0,
                -3.95,
                -27
              );

              mountain.rotation.y =
                Math.PI * 0.08;

              /*
               * Push the hero mountain
               * behind the atmospheric layer
               * but in front of the distant ridge.
               */
              world.add(mountain);
            },
            undefined,
            () => {
              /*
               * The rest of the environment
               * intentionally remains functional
               * even if the FBX fails.
               */
            }
          );
        } catch (error) {
          /*
           * Keep the procedural environment
           * alive if one optional asset fails.
           */
          console.warn(
            "Antarctic environment asset load issue:",
            error
          );
        }
      };

    loadEverything();

    const resize =
      () => {
        camera.aspect =
          window.innerWidth /
          window.innerHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(
          window.innerWidth,
          window.innerHeight
        );

        renderer.setPixelRatio(
          Math.min(
            window.devicePixelRatio,
            mobile ? 1.35 : 1.75
          )
        );
      };

    window.addEventListener(
      "resize",
      resize,
      { passive: true }
    );

    const render =
      () => {
        if (destroyed) {
          return;
        }

        const elapsed =
          clock.getElapsedTime();

        pointer.x +=
          (targetPointer.x -
            pointer.x) *
          0.035;

        pointer.y +=
          (targetPointer.y -
            pointer.y) *
          0.035;

        const drift =
          reducedMotion
            ? 0
            : elapsed;

        /*
         * CAMERA
         *
         * The camera is deliberately
         * above the water line and looking
         * through the environment.
         */
        const cameraTargetX =
          pointer.x *
          (mobile ? 0.9 : 1.55);

        const cameraTargetY =
          6.8 -
          pointer.y *
            (mobile ? 0.42 : 0.7);

        camera.position.x +=
          (cameraTargetX -
            camera.position.x) *
          0.025;

        camera.position.y +=
          (cameraTargetY -
            camera.position.y) *
          0.025;

        camera.position.z +=
          (24 -
            camera.position.z) *
          0.02;

        camera.lookAt(
          pointer.x * 1.2,
          6.4 -
            pointer.y * 0.25,
          -25
        );

        /*
         * Aurora movement.
         */
        if (aurora) {
          aurora.children.forEach(
            (layer, index) => {
              layer.position.x =
                Math.sin(
                  drift * 0.045 +
                    index * 1.4
                ) *
                2.2;

              layer.position.y =
                layer.userData
                  ?.baseY ??
                layer.position.y;

              layer.rotation.z +=
                Math.sin(
                  drift * 0.035 +
                    index
                ) *
                0.00004;
            }
          );
        }

        /*
         * Atmospheric breathing.
         */
        if (atmosphere) {
          atmosphere.material.opacity =
            0.72 +
            Math.sin(
              drift * 0.07
            ) *
              0.035;
        }

        /*
         * Foreground ice has tiny
         * environmental movement.
         */
        if (foregroundIce) {
          foregroundIce.children.forEach(
            (mesh, index) => {
              const baseY =
                mesh.userData
                  .baseY ??
                mesh.position.y;

              mesh.position.y =
                baseY +
                Math.sin(
                  drift * 0.18 +
                    index * 1.7
                ) *
                  0.025;
            }
          );
        }

        /*
         * Distant terrain gets extremely
         * subtle parallax.
         */
        if (distantRidge) {
          distantRidge.position.x +=
            (
              pointer.x * -0.45 -
              distantRidge.position.x
            ) *
            0.008;
        }

        if (secondaryRidge) {
          secondaryRidge.position.x +=
            (
              pointer.x * -0.8 -
              secondaryRidge.position.x
            ) *
            0.01;
        }

        if (stars) {
          stars.rotation.y =
            drift * 0.0015;

          stars.position.x +=
            (
              pointer.x * -0.35 -
              stars.position.x
            ) *
            0.008;

          stars.position.y +=
            (
              pointer.y * -0.12 -
              stars.position.y
            ) *
            0.008;
        }

        if (mountain) {
          mountain.rotation.y =
            Math.PI * 0.08 +
            pointer.x * 0.008;

          mountain.position.x +=
            (
              pointer.x * -0.18 -
              mountain.position.x
            ) *
            0.01;
        }

        renderer.render(
          scene,
          camera
        );

        requestAnimationFrame(
          render
        );
      };

    render();

    return () => {
      destroyed = true;

      window.removeEventListener(
        "resize",
        resize
      );

      window.removeEventListener(
        "pointermove",
        onPointerMove
      );

      if (skyTexture) {
        skyTexture.dispose();
      }

      if (stars) {
        disposeObject(stars);
      }

      if (aurora) {
        disposeObject(aurora);
      }

      if (distantRidge) {
        disposeObject(
          distantRidge
        );
      }

      if (secondaryRidge) {
        disposeObject(
          secondaryRidge
        );
      }

      if (atmosphere) {
        disposeObject(
          atmosphere
        );
      }

      if (horizonGlow) {
        disposeObject(
          horizonGlow
        );
      }

      if (iceShelf) {
        disposeObject(
          iceShelf
        );
      }

      if (foregroundIce) {
        disposeObject(
          foregroundIce
        );
      }

      if (water) {
        disposeObject(water);
      }

      if (mountain) {
        disposeObject(
          mountain
        );
      }

      renderer.dispose();

      if (
        renderer.domElement.parentNode ===
        mount
      ) {
        mount.removeChild(
          renderer.domElement
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
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    />
  );
}