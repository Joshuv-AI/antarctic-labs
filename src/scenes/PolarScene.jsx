import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const ASSETS = {
  sky: "/assets/hdr/daysky-8k-hdr-4k.jpg",

  distanceMountain:
    "/assets/models/mountains/chalaadi.fbx",

  heroMountain:
    "/assets/models/mountains/single-mountain-snow.glb",

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

const COLORS = {
  sky: 0x07151e,
  deep: 0x03090d,
  ice: 0x9ec9d8,
  snow: 0xe8f3f5,
  rock: 0x26343a,
  water: 0x031017,
  cyan: 0x73d7d0,
  auroraBlue: 0x76b9ca,
  auroraGreen: 0x8bd3c7,
};

function prefersReducedMotion() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
}

function loadTexture(loader, url, colorSpace = false) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;

        if (colorSpace) {
          texture.colorSpace = THREE.SRGBColorSpace;
        }

        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

function loadFBX(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      resolve,
      undefined,
      reject,
    );
  });
}

function loadGLTF(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      resolve,
      undefined,
      reject,
    );
  });
}

function disposeMaterial(material) {
  if (!material) {
    return;
  }

  material.dispose?.();
}

function disposeObject(root) {
  if (!root) {
    return;
  }

  root.traverse((object) => {
    object.geometry?.dispose?.();

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    materials.forEach((material) => {
      disposeMaterial(material);
    });
  });
}

function configureModel(root, {
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
} = {}) {
  root.scale.setScalar(scale);
  root.position.set(
    position[0],
    position[1],
    position[2],
  );
  root.rotation.set(
    rotation[0],
    rotation[1],
    rotation[2],
  );

  root.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    object.castShadow = false;
    object.receiveShadow = true;

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    materials.forEach((material) => {
      if (!material) {
        return;
      }

      if (
        material.isMeshStandardMaterial ||
        material.isMeshPhysicalMaterial
      ) {
        material.envMapIntensity = 0.7;
        material.roughness = Math.max(
          material.roughness ?? 0.7,
          0.42,
        );
      }
    });
  });

  return root;
}

function applyPbr(
  root,
  {
    color,
    normal,
    roughness,
    colorMultiplier = 1,
    roughnessMultiplier = 1,
  },
) {
  root.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    materials.forEach((material) => {
      if (
        !material?.isMeshStandardMaterial &&
        !material?.isMeshPhysicalMaterial
      ) {
        return;
      }

      if (color) {
        material.map = color;
        material.color.setScalar(colorMultiplier);
      }

      if (normal) {
        material.normalMap = normal;
        material.normalScale.set(0.55, 0.55);
      }

      if (roughness) {
        material.roughnessMap = roughness;
        material.roughness = roughnessMultiplier;
      }

      material.needsUpdate = true;
    });
  });
}

function createNoiseCloud({
  color = 0xdbecef,
  opacity = 0.16,
  scale = 1,
  speed = 0.04,
}) {
  const geometry = new THREE.PlaneGeometry(
    20 * scale,
    8 * scale,
    1,
    1,
  );

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: {
        value: 0,
      },
      uOpacity: {
        value: opacity,
      },
      uColor: {
        value: new THREE.Color(color),
      },
      uSpeed: {
        value: speed,
      },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;

        vec3 transformed = position;

        float wave =
          sin(position.x * 0.32 + position.y * 0.12) *
          0.22;

        transformed.z += wave;

        gl_Position =
          projectionMatrix *
          modelViewMatrix *
          vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;

      uniform float uTime;
      uniform float uOpacity;
      uniform float uSpeed;
      uniform vec3 uColor;

      float hash(vec2 p) {
        return fract(
          sin(dot(p, vec2(127.1, 311.7))) *
          43758.5453123
        );
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);

        f = f * f * (3.0 - 2.0 * f);

        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));

        return mix(
          mix(a, b, f.x),
          mix(c, d, f.x),
          f.y
        );
      }

      void main() {
        vec2 uv = vUv;

        uv.x += uTime * uSpeed;

        float n1 = noise(uv * 2.2);
        float n2 = noise(uv * 5.0 + 4.0);
        float density = mix(n1, n2, 0.35);

        float edge = smoothstep(
          0.0,
          0.18,
          uv.y
        ) *
        smoothstep(
          1.0,
          0.68,
          uv.y
        );

        float cloud = smoothstep(
          0.34,
          0.72,
          density
        );

        float alpha =
          cloud *
          edge *
          uOpacity;

        gl_FragColor = vec4(
          uColor,
          alpha
        );
      }
    `,
  });

  return {
    mesh: new THREE.Mesh(
      geometry,
      material,
    ),
    material,
  };
}

function createAurora() {
  const group = new THREE.Group();

  const materials = [
    new THREE.MeshBasicMaterial({
      color: COLORS.auroraBlue,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),

    new THREE.MeshBasicMaterial({
      color: COLORS.auroraGreen,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),

    new THREE.MeshBasicMaterial({
      color: 0x9aaed4,
      transparent: true,
      opacity: 0.045,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  ];

  for (let layer = 0; layer < 3; layer += 1) {
    const geometry = new THREE.PlaneGeometry(
      15,
      7,
      48,
      20,
    );

    const position = geometry.attributes.position;

    for (
      let index = 0;
      index < position.count;
      index += 1
    ) {
      const x = position.getX(index);
      const y = position.getY(index);

      const wave =
        Math.sin(x * 0.55 + layer * 1.7) *
        0.55 *
        (1 - Math.abs(y) / 3.5);

      position.setZ(index, wave);
    }

    position.needsUpdate = true;
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(
      geometry,
      materials[layer],
    );

    mesh.position.set(
      layer * 0.35,
      5.3 + layer * 0.45,
      -7 - layer * 0.8,
    );

    mesh.rotation.x = -0.08;
    mesh.rotation.y =
      layer === 1 ? 0.05 : -0.025;

    group.add(mesh);
  }

  return {
    group,
    materials,
  };
}

function createStars(reducedMotion) {
  const count = reducedMotion ? 220 : 560;

  const geometry =
    new THREE.BufferGeometry();

  const positions = new Float32Array(
    count * 3,
  );

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    positions[index * 3] =
      (Math.random() - 0.5) * 34;

    positions[index * 3 + 1] =
      Math.random() * 15 - 1;

    positions[index * 3 + 2] =
      -5 -
      Math.random() * 19;
  }

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      positions,
      3,
    ),
  );

  const material =
    new THREE.PointsMaterial({
      color: 0xdceff4,
      size: reducedMotion ? 0.018 : 0.022,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });

  return {
    points: new THREE.Points(
      geometry,
      material,
    ),
    material,
  };
}

export default function PolarScene() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const reducedMotion =
      prefersReducedMotion();

    let renderer;

    try {
      renderer =
        new THREE.WebGLRenderer({
          canvas,
          alpha: false,
          antialias: !reducedMotion,
          powerPreference:
            "high-performance",
        });
    } catch {
      canvas.hidden = true;
      return undefined;
    }

    renderer.outputColorSpace =
      THREE.SRGBColorSpace;

    renderer.toneMapping =
      THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure = 0.88;

    const scene =
      new THREE.Scene();

    scene.background =
      new THREE.Color(COLORS.sky);

    scene.fog =
      new THREE.FogExp2(
        COLORS.deep,
        reducedMotion
          ? 0.032
          : 0.027,
      );

    const camera =
      new THREE.PerspectiveCamera(
        42,
        1,
        0.1,
        240,
      );

    camera.position.set(
      0,
      1.8,
      10.5,
    );

    const world =
      new THREE.Group();

    scene.add(world);

    const atmosphere =
      new THREE.Group();

    world.add(atmosphere);

    const mountainGroup =
      new THREE.Group();

    world.add(mountainGroup);

    const terrainGroup =
      new THREE.Group();

    world.add(terrainGroup);

    const cloudGroup =
      new THREE.Group();

    world.add(cloudGroup);

    const textureLoader =
      new THREE.TextureLoader();

    const fbxLoader =
      new FBXLoader();

    const gltfLoader =
      new GLTFLoader();

    const ownedTextures = [];
    const ownedMaterials = [];
    const ownedRoots = [];

    let heroMountain = null;
    let distanceMountain = null;
    let disposed = false;

    /*
     * ------------------------------------------------------------
     * LIGHT
     * ------------------------------------------------------------
     */

    const hemisphere =
      new THREE.HemisphereLight(
        0xc9e1e8,
        0x02080d,
        1.65,
      );

    scene.add(hemisphere);

    const keyLight =
      new THREE.DirectionalLight(
        0xf1fbff,
        2.35,
      );

    keyLight.position.set(
      -7,
      10,
      9,
    );

    scene.add(keyLight);

    const coldRim =
      new THREE.PointLight(
        COLORS.cyan,
        13,
        25,
      );

    coldRim.position.set(
      5,
      1,
      3,
    );

    scene.add(coldRim);

    /*
     * ------------------------------------------------------------
     * SKY
     * ------------------------------------------------------------
     *
     * The available production sky is a tonemapped JPEG.
     * It is therefore used directly as the visible background
     * rather than incorrectly treating it as an HDR/EXR.
     */

    const loadSky = async () => {
      try {
        const sky =
          await loadTexture(
            textureLoader,
            ASSETS.sky,
            true,
          );

        if (disposed) {
          sky.dispose();
          return;
        }

        sky.mapping =
          THREE.EquirectangularReflectionMapping;

        scene.background = sky;

        scene.environment = sky;

        ownedTextures.push(sky);
      } catch {
        /*
         * The solid polar background remains
         * intentionally if the sky cannot load.
         */
      }
    };

    loadSky();

    /*
     * ------------------------------------------------------------
     * AURORA
     * ------------------------------------------------------------
     */

    const aurora =
      createAurora();

    atmosphere.add(
      aurora.group,
    );

    aurora.materials.forEach(
      (material) => {
        ownedMaterials.push(
          material,
        );
      },
    );

    /*
     * ------------------------------------------------------------
     * STARS
     * ------------------------------------------------------------
     */

    const stars =
      createStars(
        reducedMotion,
      );

    scene.add(
      stars.points,
    );

    ownedMaterials.push(
      stars.material,
    );

    /*
     * ------------------------------------------------------------
     * WATER
     * ------------------------------------------------------------
     */

    const waterMaterial =
      new THREE.MeshPhysicalMaterial({
        color: COLORS.water,
        roughness: 0.18,
        metalness: 0.16,
        transparent: true,
        opacity: 0.88,
        envMapIntensity: 0.5,
      });

    ownedMaterials.push(
      waterMaterial,
    );

    const water =
      new THREE.Mesh(
        new THREE.PlaneGeometry(
          42,
          30,
        ),
        waterMaterial,
      );

    water.rotation.x =
      -Math.PI / 2;

    water.position.set(
      0,
      -2.55,
      -1,
    );

    terrainGroup.add(water);

    /*
     * ------------------------------------------------------------
     * ICE FLOOR
     * ------------------------------------------------------------
     */

    const iceGeometry =
      new THREE.PlaneGeometry(
        30,
        22,
        80,
        60,
      );

    const iceMaterial =
      new THREE.MeshPhysicalMaterial({
        color: COLORS.ice,
        roughness: 0.23,
        metalness: 0.02,
        transmission:
          reducedMotion
            ? 0.06
            : 0.13,
        thickness: 0.8,
        transparent: true,
        opacity: 0.78,
        envMapIntensity: 0.8,
      });

    ownedMaterials.push(
      iceMaterial,
    );

    const ice =
      new THREE.Mesh(
        iceGeometry,
        iceMaterial,
      );

    ice.rotation.x =
      -Math.PI / 2;

    ice.position.set(
      0,
      -2.3,
      -0.5,
    );

    terrainGroup.add(ice);

    /*
     * ------------------------------------------------------------
     * CLOUD VOLUMES
     * ------------------------------------------------------------
     */

    const cloudA =
      createNoiseCloud({
        color: 0xdcecef,
        opacity:
          reducedMotion
            ? 0.075
            : 0.115,
        scale: 1.15,
        speed: 0.018,
      });

    cloudA.mesh.position.set(
      0,
      0.2,
      -4.5,
    );

    cloudA.mesh.rotation.x =
      -0.12;

    cloudGroup.add(
      cloudA.mesh,
    );

    ownedMaterials.push(
      cloudA.material,
    );

    const cloudB =
      createNoiseCloud({
        color: 0xbcd6df,
        opacity:
          reducedMotion
            ? 0.045
            : 0.075,
        scale: 1.5,
        speed: -0.012,
      });

    cloudB.mesh.position.set(
      -2,
      1.6,
      -8,
    );

    cloudB.mesh.rotation.x =
      -0.06;

    cloudGroup.add(
      cloudB.mesh,
    );

    ownedMaterials.push(
      cloudB.material,
    );

    const cloudC =
      createNoiseCloud({
        color: 0x91abb5,
        opacity:
          reducedMotion
            ? 0.025
            : 0.045,
        scale: 1.9,
        speed: 0.009,
      });

    cloudC.mesh.position.set(
      2,
      3.1,
      -13,
    );

    cloudC.mesh.rotation.x =
      -0.03;

    cloudGroup.add(
      cloudC.mesh,
    );

    ownedMaterials.push(
      cloudC.material,
    );

    /*
     * ------------------------------------------------------------
     * REAL MOUNTAIN
     * ------------------------------------------------------------
     *
     * The hero GLB is optional.
     *
     * If the optimized GLB from Aura_Borealis_.blend exists,
     * it becomes the primary foreground mountain.
     *
     * If it does not exist, the real Chalaadi FBX becomes the
     * visual fallback and the application continues normally.
     */

    const loadHeroMountain =
      async () => {
        try {
          const gltf =
            await loadGLTF(
              gltfLoader,
              ASSETS.heroMountain,
            );

          if (disposed) {
            disposeObject(
              gltf.scene,
            );
            return;
          }

          heroMountain =
            configureModel(
              gltf.scene,
              {
                scale: 1.9,
                position: [
                  0,
                  -2.15,
                  -6.2,
                ],
                rotation: [
                  0,
                  Math.PI * 0.035,
                  0,
                ],
              },
            );

          heroMountain.name =
            "Antarctic Hero Mountain";

          mountainGroup.add(
            heroMountain,
          );

          ownedRoots.push(
            heroMountain,
          );
        } catch {
          /*
           * The hero asset is deliberately optional.
           * The distance mountain below becomes the fallback.
           */
        }
      };

    const loadDistanceMountain =
      async () => {
        try {
          const model =
            await loadFBX(
              fbxLoader,
              ASSETS.distanceMountain,
            );

          if (disposed) {
            disposeObject(
              model,
            );
            return;
          }

          distanceMountain =
            configureModel(
              model,
              {
                scale: 0.018,
                position: [
                  0,
                  -1.65,
                  -15,
                ],
                rotation: [
                  0,
                  Math.PI,
                  0,
                ],
              },
            );

          distanceMountain.name =
            "Chalaadi Distance Mountain";

          mountainGroup.add(
            distanceMountain,
          );

          ownedRoots.push(
            distanceMountain,
          );

          const maps =
            await Promise.all([
              loadTexture(
                textureLoader,
                ASSETS.snowColor,
                true,
              ),
              loadTexture(
                textureLoader,
                ASSETS.snowNormal,
              ),
              loadTexture(
                textureLoader,
                ASSETS.snowRoughness,
              ),
            ]);

          if (disposed) {
            maps.forEach(
              (texture) =>
                texture.dispose(),
            );

            return;
          }

          maps.forEach(
            (texture) =>
              ownedTextures.push(
                texture,
              ),
          );

          applyPbr(
            distanceMountain,
            {
              color: maps[0],
              normal: maps[1],
              roughness: maps[2],
              colorMultiplier: 1.05,
              roughnessMultiplier: 0.78,
            },
          );
        } catch {
          /*
           * Keep the procedural atmospheric terrain
           * if the model cannot be loaded.
           */
        }
      };

    loadHeroMountain();
    loadDistanceMountain();

    /*
     * ------------------------------------------------------------
     * REAL PBR TERRAIN ACCENTS
     * ------------------------------------------------------------
     */

    const loadTerrainTextures =
      async () => {
        try {
          const maps =
            await Promise.all([
              loadTexture(
                textureLoader,
                ASSETS.iceColor,
                true,
              ),
              loadTexture(
                textureLoader,
                ASSETS.iceNormal,
              ),
              loadTexture(
                textureLoader,
                ASSETS.iceRoughness,
              ),
              loadTexture(
                textureLoader,
                ASSETS.rockColor,
                true,
              ),
              loadTexture(
                textureLoader,
                ASSETS.rockNormal,
              ),
              loadTexture(
                textureLoader,
                ASSETS.rockRoughness,
              ),
            ]);

          if (disposed) {
            maps.forEach(
              (texture) =>
                texture.dispose(),
            );

            return;
          }

          maps.forEach(
            (texture) =>
              ownedTextures.push(
                texture,
              ),
          );

          /*
           * Ice surface.
           */

          iceMaterial.map =
            maps[0];

          iceMaterial.normalMap =
            maps[1];

          iceMaterial.roughnessMap =
            maps[2];

          iceMaterial.normalScale.set(
            0.28,
            0.28,
          );

          iceMaterial.needsUpdate =
            true;

          /*
           * Rock shoreline.
           */

          const rockMaterial =
            new THREE.MeshStandardMaterial({
              color: COLORS.rock,
              roughness: 0.88,
              metalness: 0.01,
              envMapIntensity: 0.28,
              map: maps[3],
              normalMap: maps[4],
              roughnessMap: maps[5],
            });

          rockMaterial.normalScale.set(
            0.32,
            0.32,
          );

          ownedMaterials.push(
            rockMaterial,
          );

          const rockGeometry =
            new THREE.CylinderGeometry(
              4.2,
              5.4,
              1.1,
              48,
              3,
            );

          const rock =
            new THREE.Mesh(
              rockGeometry,
              rockMaterial,
            );

          rock.position.set(
            0,
            -2.62,
            -2.8,
          );

          rock.scale.set(
            1.55,
            0.55,
            0.8,
          );

          terrainGroup.add(
            rock,
          );
        } catch {
          /*
           * Terrain remains usable even if texture
           * downloads fail.
           */
        }
      };

    loadTerrainTextures();

    /*
     * ------------------------------------------------------------
     * POINTER / SCROLL STATE
     * ------------------------------------------------------------
     */

    const pointer = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
    };

    const scroll = {
      current: 0,
      target: 0,
    };

    const onPointerMove =
      (event) => {
        if (reducedMotion) {
          return;
        }

        pointer.targetX =
          (event.clientX /
            window.innerWidth -
            0.5) *
          0.7;

        pointer.targetY =
          (event.clientY /
            window.innerHeight -
            0.5) *
          0.35;
      };

    const onScroll = () => {
      const documentHeight =
        Math.max(
          document.body.scrollHeight -
            window.innerHeight,
          1,
        );

      scroll.target =
        window.scrollY /
        documentHeight;
    };

    /*
     * ------------------------------------------------------------
     * RESIZE
     * ------------------------------------------------------------
     */

    const resize = () => {
      const width =
        window.innerWidth;

      const height =
        window.innerHeight;

      camera.aspect =
        width / height;

      camera.updateProjectionMatrix();

      const maxPixelRatio =
        width < 768
          ? 1.15
          : 1.5;

      renderer.setPixelRatio(
        reducedMotion
          ? 1
          : Math.min(
              window.devicePixelRatio ||
                1,
              maxPixelRatio,
            ),
      );

      renderer.setSize(
        width,
        height,
        false,
      );
    };

    resize();

    window.addEventListener(
      "resize",
      resize,
    );

    window.addEventListener(
      "pointermove",
      onPointerMove,
      { passive: true },
    );

    window.addEventListener(
      "scroll",
      onScroll,
      { passive: true },
    );

    onScroll();

    /*
     * ------------------------------------------------------------
     * ANIMATION
     * ------------------------------------------------------------
     */

    const clock =
      new THREE.Clock();

    let frameId = 0;

    const render = () => {
      if (disposed) {
        return;
      }

      const elapsed =
        clock.getElapsedTime();

      /*
       * Smooth input.
       */

      pointer.x +=
        (pointer.targetX -
          pointer.x) *
        0.045;

      pointer.y +=
        (pointer.targetY -
          pointer.y) *
        0.045;

      scroll.current +=
        (scroll.target -
          scroll.current) *
        0.045;

      /*
       * Environment movement.
       */

      const movement =
        reducedMotion
          ? 0
          : elapsed;

      aurora.group.position.x =
        Math.sin(
          movement * 0.045,
        ) * 0.45;

      aurora.group.position.y =
        Math.sin(
          movement * 0.032,
        ) * 0.12;

      aurora.group.rotation.z =
        Math.sin(
          movement * 0.025,
        ) * 0.008;

      /*
       * Cloud movement.
       */

      cloudA.material.uniforms.uTime.value =
        elapsed;

      cloudB.material.uniforms.uTime.value =
        elapsed * 0.72;

      cloudC.material.uniforms.uTime.value =
        elapsed * 0.48;

      /*
       * Stars.
       */

      if (!reducedMotion) {
        stars.points.rotation.y =
          elapsed * 0.0018;

        stars.points.rotation.x =
          Math.sin(
            elapsed * 0.014,
          ) * 0.006;
      }

      /*
       * Camera.
       *
       * Scroll creates the major narrative movement.
       * Pointer movement is deliberately subtle.
       */

      const descent =
        scroll.current;

      const cameraX =
        pointer.x * 0.34;

      const cameraY =
        1.8 -
        descent * 1.05 +
        pointer.y * 0.12;

      const cameraZ =
        10.5 -
        descent * 5.6;

      camera.position.x +=
        (cameraX -
          camera.position.x) *
        0.035;

      camera.position.y +=
        (cameraY -
          camera.position.y) *
        0.035;

      camera.position.z +=
        (cameraZ -
          camera.position.z) *
        0.035;

      camera.rotation.x +=
        (
          -0.035 -
          descent * 0.035 -
          camera.rotation.x
        ) * 0.025;

      camera.rotation.y +=
        (
          pointer.x * 0.018 -
          camera.rotation.y
        ) * 0.025;

      /*
       * Mountain parallax.
       */

      if (heroMountain) {
        heroMountain.position.x =
          Math.sin(
            elapsed * 0.018,
          ) *
            0.05 +
          pointer.x * 0.16;

        heroMountain.position.y =
          -2.15 -
          descent * 0.45;

        heroMountain.rotation.y =
          Math.PI * 0.035 +
          pointer.x * 0.025;
      }

      if (distanceMountain) {
        distanceMountain.position.x =
          pointer.x * 0.28;

        distanceMountain.position.y =
          -1.65 -
          descent * 0.28;

        distanceMountain.position.z =
          -15 -
          descent * 2.5;
      }

      /*
       * Terrain descent.
       */

      ice.position.y =
        -2.3 -
        descent * 0.22;

      water.position.y =
        -2.55 -
        descent * 0.2;

      /*
       * Clouds become more present during the
       * middle of the journey, then retreat.
       */

      const cloudPhase =
        Math.sin(
          descent * Math.PI,
        );

      cloudA.mesh.position.z =
        -4.5 -
        descent * 2.4;

      cloudA.material.uniforms.uOpacity.value =
        (reducedMotion
          ? 0.075
          : 0.115) +
        cloudPhase * 0.09;

      cloudB.mesh.position.z =
        -8 -
        descent * 4.2;

      cloudB.material.uniforms.uOpacity.value =
        (reducedMotion
          ? 0.045
          : 0.075) +
        cloudPhase * 0.08;

      cloudC.mesh.position.z =
        -13 -
        descent * 5.5;

      cloudC.material.uniforms.uOpacity.value =
        (reducedMotion
          ? 0.025
          : 0.045) +
        cloudPhase * 0.055;

      /*
       * Atmospheric transition.
       */

      scene.fog.density =
        (
          reducedMotion
            ? 0.032
            : 0.027
        ) +
        cloudPhase * 0.016;

      /*
       * Render.
       */

      renderer.render(
        scene,
        camera,
      );

      frameId =
        window.requestAnimationFrame(
          render,
        );
    };

    render();

    /*
     * ------------------------------------------------------------
     * CLEANUP
     * ------------------------------------------------------------
     */

    return () => {
      disposed = true;

      window.cancelAnimationFrame(
        frameId,
      );

      window.removeEventListener(
        "resize",
        resize,
      );

      window.removeEventListener(
        "pointermove",
        onPointerMove,
      );

      window.removeEventListener(
        "scroll",
        onScroll,
      );

      ownedRoots.forEach(
        (root) => {
          disposeObject(root);
        },
      );

      scene.traverse(
        (object) => {
          if (
            object.isMesh ||
            object.isLine ||
            object.isPoints
          ) {
            object.geometry?.dispose?.();
          }
        },
      );

      ownedMaterials.forEach(
        (material) => {
          disposeMaterial(
            material,
          );
        },
      );

      ownedTextures.forEach(
        (texture) => {
          texture.dispose();
        },
      );

      renderer.dispose();
      renderer.forceContextLoss?.();
    };
  }, []);

  return (
    <div
      className="polar-scene"
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
      />
    </div>
  );
}