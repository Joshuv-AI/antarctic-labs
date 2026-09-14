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

  snowColor: "/assets/textures/snow/snow-color.png",
  snowNormal: "/assets/textures/snow/snow-normal.png",
  snowRoughness: "/assets/textures/snow/snow-roughness.png",
};

const isMobile = () => window.innerWidth < 760;

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function disposeMaterial(material) {
  if (!material) return;

  const materials = Array.isArray(material)
    ? material
    : [material];

  materials.forEach((mat) => {
    Object.keys(mat).forEach((key) => {
      const value = mat[key];

      if (value?.isTexture) {
        value.dispose();
      }
    });

    mat.dispose?.();
  });
}

function disposeObject(object) {
  if (!object) return;

  object.traverse((child) => {
    child.geometry?.dispose();

    if (child.material) {
      disposeMaterial(child.material);
    }
  });
}

function createGradientTexture() {
  const canvas = document.createElement("canvas");

  canvas.width = 4;
  canvas.height = 1024;

  const context = canvas.getContext("2d");

  const gradient = context.createLinearGradient(
    0,
    0,
    0,
    canvas.height,
  );

  gradient.addColorStop(0, "#02070c");
  gradient.addColorStop(0.3, "#041019");
  gradient.addColorStop(0.54, "#081b25");
  gradient.addColorStop(0.72, "#12323b");
  gradient.addColorStop(0.86, "#0a1a22");
  gradient.addColorStop(1, "#02090d");

  context.fillStyle = gradient;
  context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function createRadialTexture({
  size = 512,
  center = "rgba(220,245,255,0.9)",
  middle = "rgba(220,245,255,0.25)",
  edge = "rgba(220,245,255,0)",
} = {}) {
  const canvas = document.createElement("canvas");

  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");

  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );

  gradient.addColorStop(0, center);
  gradient.addColorStop(0.34, middle);
  gradient.addColorStop(1, edge);

  context.fillStyle = gradient;
  context.fillRect(
    0,
    0,
    size,
    size,
  );

  return new THREE.CanvasTexture(canvas);
}

function loadTexture(
  loader,
  url,
  {
    colorSpace = true,
    repeat = 1,
  } = {},
) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        if (colorSpace) {
          texture.colorSpace =
            THREE.SRGBColorSpace;
        }

        texture.wrapS =
          THREE.RepeatWrapping;

        texture.wrapT =
          THREE.RepeatWrapping;

        texture.repeat.set(
          repeat,
          repeat,
        );

        resolve(texture);
      },
      undefined,
      () => resolve(null),
    );
  });
}

function createStars(scene) {
  const count = isMobile() ? 360 : 820;

  const positions = new Float32Array(
    count * 3,
  );

  for (let i = 0; i < count; i += 1) {
    const radius =
      32 + Math.random() * 62;

    const angle =
      Math.random() * Math.PI * 2;

    positions[i * 3] =
      Math.cos(angle) * radius;

    positions[i * 3 + 1] =
      6 + Math.random() * 26;

    positions[i * 3 + 2] =
      -14 - Math.random() * 90;
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
      color: 0xdff7ff,
      size: isMobile()
        ? 0.04
        : 0.065,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
    });

  const points =
    new THREE.Points(
      geometry,
      material,
    );

  scene.add(points);

  return points;
}

function createSnow(scene) {
  const count = isMobile()
    ? 260
    : 540;

  const positions =
    new Float32Array(
      count * 3,
    );

  const velocities =
    new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] =
      (Math.random() - 0.5) * 42;

    positions[i * 3 + 1] =
      Math.random() * 23;

    positions[i * 3 + 2] =
      -4 - Math.random() * 52;

    velocities[i] =
      0.012 + Math.random() * 0.028;
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
      color: 0xeaf9ff,
      size: isMobile()
        ? 0.035
        : 0.055,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });

  const points =
    new THREE.Points(
      geometry,
      material,
    );

  points.userData.velocities =
    velocities;

  scene.add(points);

  return points;
}

function createMoon(scene) {
  const group =
    new THREE.Group();

  group.position.set(
    4.8,
    8.3,
    -47,
  );

  const glowTexture =
    createRadialTexture({
      size: 512,
      center:
        "rgba(225,246,255,0.82)",
      middle:
        "rgba(205,239,250,0.24)",
      edge:
        "rgba(205,239,250,0)",
    });

  const glow =
    new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        depthWrite: false,
        blending:
          THREE.AdditiveBlending,
      }),
    );

  glow.scale.set(
    8,
    8,
    1,
  );

  group.add(glow);

  const moon =
    new THREE.Mesh(
      new THREE.SphereGeometry(
        1.3,
        32,
        32,
      ),
      new THREE.MeshBasicMaterial({
        color: 0xd9e9ed,
      }),
    );

  group.add(moon);

  scene.add(group);

  return group;
}

function createMountainLayer(
  scene,
  {
    z,
    width,
    height,
    color,
    opacity,
    count = 10,
  },
) {
  const group =
    new THREE.Group();

  for (
    let i = 0;
    i < count;
    i += 1
  ) {
    const mountainWidth =
      width *
      (0.14 + Math.random() * 0.2);

    const mountainHeight =
      height *
      (0.4 + Math.random() * 0.65);

    const geometry =
      new THREE.ConeGeometry(
        mountainWidth,
        mountainHeight,
        6,
        1,
      );

    const material =
      new THREE.MeshStandardMaterial({
        color,
        roughness: 1,
        metalness: 0,
        transparent:
          opacity < 1,
        opacity,
        flatShading: true,
      });

    const mesh =
      new THREE.Mesh(
        geometry,
        material,
      );

    mesh.position.set(
      (i / (count - 1) - 0.5) *
        width +
        (Math.random() - 0.5) * 4,

      mountainHeight * 0.5 -
        0.8,

      z +
        (Math.random() - 0.5) * 4,
    );

    mesh.rotation.z =
      (Math.random() - 0.5) *
      0.06;

    group.add(mesh);
  }

  scene.add(group);

  return group;
}

function createAurora(scene) {
  const group =
    new THREE.Group();

  group.position.z = -29;

  const colors = [
    0x61ffd5,
    0x7ee7ff,
    0x8bffb4,
    0x63b9ff,
  ];

  for (
    let i = 0;
    i < 7;
    i += 1
  ) {
    const points = [];

    for (
      let j = 0;
      j <= 16;
      j += 1
    ) {
      const x =
        -20 +
        (j / 16) * 40;

      const y =
        5.2 +
        i * 0.5 +
        Math.sin(
          j * 0.72 +
            i * 1.17,
        ) *
          (0.72 + i * 0.07);

      const z =
        Math.cos(
          j * 0.44 + i,
        ) * 1.3;

      points.push(
        new THREE.Vector3(
          x,
          y,
          z,
        ),
      );
    }

    const curve =
      new THREE.CatmullRomCurve3(
        points,
      );

    const geometry =
      new THREE.TubeGeometry(
        curve,
        72,
        0.07 + i * 0.018,
        5,
        false,
      );

    const material =
      new THREE.MeshBasicMaterial({
        color:
          colors[
            i % colors.length
          ],
        transparent: true,
        opacity:
          0.15 - i * 0.012,
        blending:
          THREE.AdditiveBlending,
        depthWrite: false,
      });

    group.add(
      new THREE.Mesh(
        geometry,
        material,
      ),
    );
  }

  scene.add(group);

  return group;
}

function createMist(scene) {
  const group =
    new THREE.Group();

  const texture =
    createRadialTexture({
      size: 512,
      center:
        "rgba(195,232,238,0.38)",
      middle:
        "rgba(195,232,238,0.11)",
      edge:
        "rgba(195,232,238,0)",
    });

  const layers = [
    {
      x: -10,
      y: 1.5,
      z: -10,
      width: 18,
      height: 6,
    },
    {
      x: 9,
      y: 0.8,
      z: -18,
      width: 22,
      height: 7,
    },
    {
      x: -2,
      y: 2.8,
      z: -30,
      width: 30,
      height: 10,
    },
  ];

  layers.forEach(
    (
      layer,
      index,
    ) => {
      const sprite =
        new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity:
              0.085 +
              index * 0.025,
            depthWrite: false,
          }),
        );

      sprite.position.set(
        layer.x,
        layer.y,
        layer.z,
      );

      sprite.scale.set(
        layer.width,
        layer.height,
        1,
      );

      sprite.userData.baseX =
        layer.x;

      sprite.userData.baseY =
        layer.y;

      sprite.userData.index =
        index;

      group.add(sprite);
    },
  );

  scene.add(group);

  return group;
}

function createWater(scene) {
  const geometry =
    new THREE.PlaneGeometry(
      58,
      68,
      isMobile() ? 24 : 48,
      isMobile() ? 28 : 58,
    );

  geometry.rotateX(
    -Math.PI / 2,
  );

  const positions =
    geometry.attributes.position;

  for (
    let i = 0;
    i < positions.count;
    i += 1
  ) {
    const x =
      positions.getX(i);

    const z =
      positions.getZ(i);

    positions.setY(
      i,
      Math.sin(
        x * 0.24 +
          z * 0.12,
      ) *
        0.035 +
        Math.sin(z * 0.43) *
          0.025,
    );
  }

  geometry.computeVertexNormals();

  const material =
    new THREE.MeshStandardMaterial({
      color: 0x07151c,
      roughness: 0.16,
      metalness: 0.58,
    });

  const water =
    new THREE.Mesh(
      geometry,
      material,
    );

  water.position.set(
    0,
    -2.35,
    -17,
  );

  scene.add(water);

  return water;
}

function createIceShelf(
  scene,
  textures,
) {
  const group =
    new THREE.Group();

  group.position.set(
    0,
    -1.5,
    -13,
  );

  const material =
    new THREE.MeshStandardMaterial({
      color: 0xb9dce2,
      roughness: 0.72,
      metalness: 0.04,
      map: textures.color || null,
      normalMap:
        textures.normal || null,
      roughnessMap:
        textures.roughness || null,
    });

  const geometry =
    new THREE.BoxGeometry(
      42,
      1.7,
      10,
      24,
      3,
      16,
    );

  const positions =
    geometry.attributes.position;

  for (
    let i = 0;
    i < positions.count;
    i += 1
  ) {
    const x =
      positions.getX(i);

    const z =
      positions.getZ(i);

    const y =
      positions.getY(i);

    if (y > 0.1) {
      positions.setY(
        i,
        y +
          Math.sin(x * 0.25) *
            0.16 +
          Math.cos(z * 0.5) *
            0.1,
      );
    }
  }

  geometry.computeVertexNormals();

  const shelf =
    new THREE.Mesh(
      geometry,
      material,
    );

  shelf.receiveShadow = true;

  group.add(shelf);

  for (
    let i = 0;
    i < 12;
    i += 1
  ) {
    const width =
      1.2 +
      Math.random() * 2.8;

    const height =
      1.8 +
      Math.random() * 3.8;

    const block =
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          width,
          width * 1.25,
          height,
          6,
        ),
        material,
      );

    block.position.set(
      -19 +
        Math.random() * 38,
      height / 2 - 0.3,
      -4 +
        Math.random() * 7,
    );

    block.rotation.y =
      Math.random() *
      Math.PI;

    group.add(block);
  }

  scene.add(group);

  return group;
}

function createForegroundIce(
  scene,
  textures,
) {
  const group =
    new THREE.Group();

  group.position.z = -2;

  const material =
    new THREE.MeshStandardMaterial({
      color: 0xc9edf1,
      roughness: 0.52,
      metalness: 0.02,
      map: textures.color || null,
      normalMap:
        textures.normal || null,
      roughnessMap:
        textures.roughness || null,
    });

  const count = isMobile()
    ? 11
    : 18;

  for (
    let i = 0;
    i < count;
    i += 1
  ) {
    const width =
      0.45 +
      Math.random() * 1.4;

    const height =
      1.2 +
      Math.random() * 5.2;

    const mesh =
      new THREE.Mesh(
        new THREE.ConeGeometry(
          width,
          height,
          6,
        ),
        material,
      );

    mesh.position.set(
      (Math.random() - 0.5) *
        31,

      height / 2 - 1.2,

      -Math.random() * 10,
    );

    mesh.rotation.set(
      (Math.random() - 0.5) *
        0.14,

      Math.random() *
        Math.PI,

      (Math.random() - 0.5) *
        0.12,
    );

    group.add(mesh);
  }

  scene.add(group);

  return group;
}

function createHorizonGlow(scene) {
  const texture =
    createRadialTexture({
      size: 512,
      center:
        "rgba(101,224,230,0.22)",
      middle:
        "rgba(81,190,204,0.08)",
      edge:
        "rgba(81,190,204,0)",
    });

  const sprite =
    new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        blending:
          THREE.AdditiveBlending,
      }),
    );

  sprite.position.set(
    0,
    0.5,
    -32,
  );

  sprite.scale.set(
    32,
    11,
    1,
  );

  scene.add(sprite);

  return sprite;
}

export default function PolarScene() {
  const containerRef =
    useRef(null);

  useEffect(() => {
    const container =
      containerRef.current;

    if (!container) {
      return undefined;
    }

    let destroyed = false;
    let animationFrame = 0;
    let resizeObserver;

    const mobile = isMobile();
    const reduced =
      prefersReducedMotion();

    const scene =
      new THREE.Scene();

    const background =
      createGradientTexture();

    scene.background =
      background;

    scene.fog =
      new THREE.FogExp2(
        0x091922,
        mobile
          ? 0.021
          : 0.016,
      );

    const camera =
      new THREE.PerspectiveCamera(
        47,
        1,
        0.1,
        120,
      );

    camera.position.set(
      0,
      1.7,
      8.5,
    );

    const renderer =
      new THREE.WebGLRenderer({
        antialias: !mobile,
        alpha: true,
        powerPreference:
          "high-performance",
      });

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio ||
          1,
        mobile
          ? 1.25
          : 1.7,
      ),
    );

    renderer.setSize(
      window.innerWidth,
      window.innerHeight,
      false,
    );

    renderer.outputColorSpace =
      THREE.SRGBColorSpace;

    renderer.toneMapping =
      THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure =
      0.82;

    renderer.shadowMap.enabled =
      !mobile;

    renderer.shadowMap.type =
      THREE.PCFSoftShadowMap;

    renderer.domElement.setAttribute(
      "aria-hidden",
      "true",
    );

    renderer.domElement.style.width =
      "100%";

    renderer.domElement.style.height =
      "100%";

    container.appendChild(
      renderer.domElement,
    );

    const hemisphere =
      new THREE.HemisphereLight(
        0xbdefff,
        0x071018,
        1.15,
      );

    scene.add(hemisphere);

    const moonLight =
      new THREE.DirectionalLight(
        0xcbefff,
        2.1,
      );

    moonLight.position.set(
      6,
      13,
      -25,
    );

    moonLight.castShadow =
      !mobile;

    scene.add(moonLight);

    const horizonLight =
      new THREE.PointLight(
        0x5bd8e7,
        3.2,
        35,
        2,
      );

    horizonLight.position.set(
      0,
      1.5,
      -20,
    );

    scene.add(horizonLight);

    const stars =
      createStars(scene);

    const snow =
      createSnow(scene);

    const moon =
      createMoon(scene);

    const farMountains =
      createMountainLayer(
        scene,
        {
          z: -52,
          width: 48,
          height: 11,
          color: 0x0d242d,
          opacity: 0.95,
        },
      );

    const midMountains =
      createMountainLayer(
        scene,
        {
          z: -39,
          width: 43,
          height: 10,
          color: 0x102e38,
          opacity: 0.9,
        },
      );

    const nearMountains =
      createMountainLayer(
        scene,
        {
          z: -27,
          width: 38,
          height: 8.5,
          color: 0x163843,
          opacity: 0.82,
        },
      );

    const aurora =
      createAurora(scene);

    const mist =
      createMist(scene);

    const horizonGlow =
      createHorizonGlow(scene);

    const water =
      createWater(scene);

    let iceShelf;
    let foregroundIce;
    let mountainAsset;
    let skyPlane;

    const textureLoader =
      new THREE.TextureLoader();

    Promise.all([
      loadTexture(
        textureLoader,
        ASSETS.iceColor,
      ),
      loadTexture(
        textureLoader,
        ASSETS.iceNormal,
        {
          colorSpace: false,
        },
      ),
      loadTexture(
        textureLoader,
        ASSETS.iceRoughness,
        {
          colorSpace: false,
        },
      ),
    ]).then(
      ([
        iceColor,
        iceNormal,
        iceRoughness,
      ]) => {
        if (destroyed) {
          iceColor?.dispose();
          iceNormal?.dispose();
          iceRoughness?.dispose();
          return;
        }

        const textures = {
          color: iceColor,
          normal: iceNormal,
          roughness:
            iceRoughness,
        };

        iceShelf =
          createIceShelf(
            scene,
            textures,
          );

        foregroundIce =
          createForegroundIce(
            scene,
            textures,
          );
      },
    );

    textureLoader.load(
      ASSETS.sky,
      (skyTexture) => {
        if (destroyed) {
          skyTexture.dispose();
          return;
        }

        skyTexture.colorSpace =
          THREE.SRGBColorSpace;

        const material =
          new THREE.MeshBasicMaterial({
            map: skyTexture,
            color: 0x36525a,
            transparent: true,
            opacity: 0.085,
            depthWrite: false,
            fog: false,
          });

        skyPlane =
          new THREE.Mesh(
            new THREE.PlaneGeometry(
              82,
              41,
            ),
            material,
          );

        skyPlane.position.set(
          0,
          10,
          -72,
        );

        scene.add(skyPlane);
      },
      undefined,
      () => {},
    );

    const fbxLoader =
      new FBXLoader();

    fbxLoader.load(
      ASSETS.mountain,
      (asset) => {
        if (destroyed) {
          disposeObject(asset);
          return;
        }

        const originalBox =
          new THREE.Box3().setFromObject(
            asset,
          );

        const originalSize =
          originalBox.getSize(
            new THREE.Vector3(),
          );

        const maxDimension =
          Math.max(
            originalSize.x,
            originalSize.y,
            originalSize.z,
          ) || 1;

        asset.scale.setScalar(
          10 / maxDimension,
        );

        const normalizedBox =
          new THREE.Box3().setFromObject(
            asset,
          );

        const center =
          normalizedBox.getCenter(
            new THREE.Vector3(),
          );

        asset.position.sub(
          center,
        );

        asset.position.y +=
          1.15;

        asset.position.x =
          -1.5;

        asset.position.z =
          -22;

        asset.traverse(
          (child) => {
            if (!child.isMesh) {
              return;
            }

            child.castShadow =
              !mobile;

            child.receiveShadow =
              !mobile;

            if (!child.material) {
              return;
            }

            const materials =
              Array.isArray(
                child.material,
              )
                ? child.material
                : [child.material];

            materials.forEach(
              (material) => {
                if (material.color) {
                  material.color.lerp(
                    new THREE.Color(
                      0x9dbbc1,
                    ),
                    0.38,
                  );
                }

                if (
                  "roughness" in
                  material
                ) {
                  material.roughness =
                    Math.max(
                      material.roughness ||
                        0.8,
                      0.72,
                    );
                }
              },
            );
          },
        );

        mountainAsset =
          asset;

        scene.add(asset);
      },
      undefined,
      () => {},
    );

    const pointer = {
      x: 0,
      y: 0,
    };

    const pointerTarget = {
      x: 0,
      y: 0,
    };

    const handlePointerMove =
      (event) => {
        pointerTarget.x =
          (event.clientX /
            window.innerWidth -
            0.5) *
          2;

        pointerTarget.y =
          (event.clientY /
            window.innerHeight -
            0.5) *
          2;
      };

    window.addEventListener(
      "pointermove",
      handlePointerMove,
      {
        passive: true,
      },
    );

    let scrollTarget =
      window.scrollY;

    let scrollCurrent =
      scrollTarget;

    const handleScroll =
      () => {
        scrollTarget =
          window.scrollY;
      };

    window.addEventListener(
      "scroll",
      handleScroll,
      {
        passive: true,
      },
    );

    const resize = () => {
      const width =
        window.innerWidth;

      const height =
        window.innerHeight;

      camera.aspect =
        width / height;

      camera.updateProjectionMatrix();

      renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio ||
            1,
          isMobile()
            ? 1.25
            : 1.7,
        ),
      );

      renderer.setSize(
        width,
        height,
        false,
      );
    };

    window.addEventListener(
      "resize",
      resize,
    );

    resizeObserver =
      new ResizeObserver(
        resize,
      );

    resizeObserver.observe(
      container,
    );

    let visible = true;

    const handleVisibility =
      () => {
        visible =
          !document.hidden;
      };

    document.addEventListener(
      "visibilitychange",
      handleVisibility,
    );

    const handleContextLost =
      (event) => {
        event.preventDefault();
      };

    const handleContextRestored =
      () => {
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

    const clock =
      new THREE.Clock();

    const animate = () => {
      if (destroyed) {
        return;
      }

      animationFrame =
        requestAnimationFrame(
          animate,
        );

      if (!visible) {
        return;
      }

      const elapsed =
        clock.getElapsedTime();

      const motion =
        reduced ? 0 : 1;

      scrollCurrent +=
        (scrollTarget -
          scrollCurrent) *
        0.055;

      const maxScroll =
        Math.max(
          1,
          document.documentElement
            .scrollHeight -
            window.innerHeight,
        );

      const progress =
        Math.min(
          1,
          Math.max(
            0,
            scrollCurrent /
              maxScroll,
          ),
        );

      pointer.x +=
        (pointerTarget.x -
          pointer.x) *
        0.045;

      pointer.y +=
        (pointerTarget.y -
          pointer.y) *
        0.045;

      /*
       * CAMERA JOURNEY
       *
       * The scene is not simply a background.
       * As the page descends, the camera physically
       * moves deeper into the environment.
       */

      camera.position.z =
        8.5 -
        progress * 23;

      camera.position.y =
        1.65 +
        progress * 0.8 +
        pointer.y * -0.28;

      camera.position.x =
        pointer.x * 0.72;

      camera.rotation.y =
        pointer.x * -0.018;

      camera.rotation.x =
        pointer.y * 0.012;

      /*
       * AURORA
       */

      aurora.position.x =
        pointer.x * -0.8;

      aurora.position.y =
        Math.sin(
          elapsed * 0.12,
        ) *
        0.18 *
        motion;

      aurora.rotation.z =
        Math.sin(
          elapsed * 0.08,
        ) *
        0.018 *
        motion;

      /*
       * MOON
       */

      moon.position.x =
        4.8 +
        pointer.x * 0.7;

      moon.position.y =
        8.3 +
        pointer.y * -0.35;

      /*
       * MOUNTAIN PARALLAX
       */

      [
        farMountains,
        midMountains,
        nearMountains,
      ].forEach(
        (layer, index) => {
          layer.position.x =
            pointer.x *
            (0.15 +
              index * 0.14);

          layer.position.y =
            Math.sin(
              elapsed *
                (0.08 +
                  index * 0.02),
            ) *
            0.035 *
            motion;
        },
      );

      /*
       * MIST / CLOUD TRANSITION
       */

      mist.children.forEach(
        (sprite, index) => {
          sprite.position.x =
            sprite.userData.baseX +
            Math.sin(
              elapsed * 0.055 +
                index,
            ) *
              1.4 *
              motion +
            pointer.x *
              (index % 2
                ? -1.2
                : 1.2);

          sprite.position.y =
            sprite.userData.baseY +
            Math.sin(
              elapsed * 0.08 +
                index,
            ) *
              0.15 *
              motion;
        },
      );

      /*
       * HORIZON
       */

      horizonGlow.material.opacity =
        0.18 +
        Math.sin(
          elapsed * 0.12,
        ) *
          0.025 *
          motion;

      /*
       * EXISTING SKY ASSET
       */

      if (skyPlane) {
        skyPlane.position.x =
          pointer.x * -1.6;

        skyPlane.position.y =
          10 +
          pointer.y * -0.5;
      }

      /*
       * EXISTING MOUNTAIN ASSET
       */

      if (mountainAsset) {
        mountainAsset.position.x =
          -1.5 +
          pointer.x * 0.3;

        mountainAsset.rotation.y =
          Math.sin(
            elapsed * 0.045,
          ) *
          0.008 *
          motion;
      }

      /*
       * ICE
       */

      if (foregroundIce) {
        foregroundIce.rotation.y =
          pointer.x * 0.01;
      }

      if (iceShelf) {
        iceShelf.position.x =
          Math.sin(
            elapsed * 0.04,
          ) *
          0.08 *
          motion;
      }

      /*
       * WATER
       */

      water.position.x =
        pointer.x * -0.12;

      const waterScale =
        1 +
        Math.sin(
          elapsed * 0.2,
        ) *
          0.002 *
          motion;

      water.scale.set(
        waterScale,
        1,
        waterScale,
      );

      /*
       * STARS
       */

      stars.material.opacity =
        0.56 +
        Math.sin(
          elapsed * 0.35,
        ) *
          0.08 *
          motion;

      /*
       * SNOW
       */

      const snowPositions =
        snow.geometry.attributes
          .position.array;

      const velocities =
        snow.userData
          .velocities;

      for (
        let i = 0;
        i < velocities.length;
        i += 1
      ) {
        const index =
          i * 3;

        snowPositions[
          index + 1
        ] -=
          velocities[i] *
          motion;

        snowPositions[index] +=
          Math.sin(
            elapsed * 0.22 +
              i,
          ) *
          0.0007 *
          motion;

        if (
          snowPositions[
            index + 1
          ] < -2
        ) {
          snowPositions[
            index + 1
          ] =
            18 +
            Math.random() * 8;

          snowPositions[index] =
            (Math.random() -
              0.5) *
            42;
        }
      }

      snow.geometry.attributes.position.needsUpdate =
        true;

      renderer.render(
        scene,
        camera,
      );
    };

    resize();

    animate();

    return () => {
      destroyed = true;

      cancelAnimationFrame(
        animationFrame,
      );

      window.removeEventListener(
        "pointermove",
        handlePointerMove,
      );

      window.removeEventListener(
        "scroll",
        handleScroll,
      );

      window.removeEventListener(
        "resize",
        resize,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility,
      );

      resizeObserver?.disconnect();

      renderer.domElement.removeEventListener(
        "webglcontextlost",
        handleContextLost,
      );

      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        handleContextRestored,
      );

      disposeObject(scene);

      scene.background?.dispose?.();

      renderer.dispose();

      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
    />
  );
}