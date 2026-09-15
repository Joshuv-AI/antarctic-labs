import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const ASSETS = {
  sky: "/assets/hdr/daysky-8k-hdr-4k.jpg",

  // Reserved production slot for Aura_Borealis_.blend.
  // The optimized GLB will eventually be exported here.
  heroMountain:
    "/assets/models/mountains/single-mountain-snow.glb",

  secondaryMountain:
    "/assets/models/mountains/chalaadi.fbx",

  ice: {
    color: "/assets/textures/ice/ice-color.png",
    normal: "/assets/textures/ice/ice-normal.jpg",
    roughness: "/assets/textures/ice/ice-roughness.png",
    displacement:
      "/assets/textures/ice/ice-displacement.png",
  },

  snow: {
    color: "/assets/textures/snow/snow-color.png",
    normal: "/assets/textures/snow/snow-normal.png",
    roughness: "/assets/textures/snow/snow-roughness.png",
  },

  rock: {
    color: "/assets/textures/rock/rock-color.png",
    normal: "/assets/textures/rock/rock-normal.png",
    roughness: "/assets/textures/rock/rock-roughness.png",
  },
};

const MOBILE_BREAKPOINT = 760;

function getIsMobile() {
  return (
    typeof window !== "undefined" &&
    window.innerWidth <= MOBILE_BREAKPOINT
  );
}

function getReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches
  );
}

function configureColorTexture(texture) {
  if (!texture) return;

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
}

function configureDataTexture(texture) {
  if (!texture) return;

  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
}

function createNoiseTexture(size = 96) {
  const data = new Uint8Array(size * size);

  for (let i = 0; i < data.length; i += 1) {
    const x = i % size;
    const y = Math.floor(i / size);

    const value =
      128 +
      Math.sin(x * 0.13) * 28 +
      Math.sin(y * 0.071) * 24 +
      Math.sin((x + y) * 0.031) * 18 +
      (Math.random() - 0.5) * 28;

    data[i] = Math.max(
      0,
      Math.min(255, value)
    );
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RedFormat
  );

  texture.colorSpace =
    THREE.NoColorSpace;
  texture.wrapS =
    THREE.RepeatWrapping;
  texture.wrapT =
    THREE.RepeatWrapping;
  texture.needsUpdate = true;

  return texture;
}

function createStars(
  count,
  radius,
  spread,
  mobile
) {
  const actualCount = mobile
    ? Math.floor(count * 0.34)
    : count;

  const positions =
    new Float32Array(
      actualCount * 3
    );

  for (
    let i = 0;
    i < actualCount;
    i += 1
  ) {
    const angle =
      Math.random() *
      Math.PI *
      2;

    const distance =
      radius +
      Math.random() * spread;

    positions[i * 3] =
      Math.cos(angle) *
      distance;

    positions[i * 3 + 1] =
      32 +
      Math.random() * 125;

    positions[i * 3 + 2] =
      Math.sin(angle) *
      distance;
  }

  const geometry =
    new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      positions,
      3
    )
  );

  const material =
    new THREE.PointsMaterial({
      color: 0xdceef3,
      size: mobile ? 0.18 : 0.24,
      sizeAttenuation: true,
      transparent: true,
      opacity: mobile ? 0.28 : 0.42,
      depthWrite: false,
    });

  return new THREE.Points(
    geometry,
    material
  );
}

function createWater() {
  const geometry =
    new THREE.PlaneGeometry(
      1800,
      1800,
      28,
      28
    );

  geometry.rotateX(
    -Math.PI / 2
  );

  geometry.translate(
    0,
    -17,
    -360
  );

  const material =
    new THREE.MeshStandardMaterial({
      color: 0x071218,
      roughness: 0.27,
      metalness: 0.2,
      transparent: true,
      opacity: 0.9,
    });

  return new THREE.Mesh(
    geometry,
    material
  );
}

function createIceFloor(
  textures,
  mobile
) {
  const geometry =
    new THREE.PlaneGeometry(
      920,
      1280,
      mobile ? 60 : 115,
      mobile ? 60 : 115
    );

  geometry.rotateX(
    -Math.PI / 2
  );

  geometry.translate(
    0,
    -10.5,
    -105
  );

  const material =
    new THREE.MeshStandardMaterial({
      map:
        textures.color || null,
      normalMap:
        textures.normal || null,
      roughnessMap:
        textures.roughness || null,
      displacementMap:
        mobile
          ? null
          : textures.displacement ||
            null,

      color: 0xddebf0,
      roughness: 0.7,
      metalness: 0.025,

      displacementScale: mobile
        ? 0
        : 1.25,

      displacementBias: mobile
        ? 0
        : -0.18,
    });

  const mesh =
    new THREE.Mesh(
      geometry,
      material
    );

  mesh.receiveShadow = true;

  return mesh;
}

function createSnowField(
  textures,
  mobile
) {
  const geometry =
    new THREE.PlaneGeometry(
      640,
      680,
      mobile ? 32 : 64,
      mobile ? 32 : 64
    );

  geometry.rotateX(
    -Math.PI / 2
  );

  geometry.translate(
    0,
    -8.65,
    -215
  );

  const material =
    new THREE.MeshStandardMaterial({
      map:
        textures.color || null,
      normalMap:
        textures.normal || null,
      roughnessMap:
        textures.roughness || null,

      color: 0xe5eff2,
      roughness: 0.77,
      metalness: 0.012,

      transparent: true,
      opacity: 0.83,
    });

  return new THREE.Mesh(
    geometry,
    material
  );
}

function createRockShelf(
  textures
) {
  const geometry =
    new THREE.BoxGeometry(
      320,
      30,
      190,
      12,
      4,
      12
    );

  geometry.translate(
    0,
    -17,
    -420
  );

  const material =
    new THREE.MeshStandardMaterial({
      map:
        textures.color || null,
      normalMap:
        textures.normal || null,
      roughnessMap:
        textures.roughness || null,

      color: 0x59656d,
      roughness: 0.88,
      metalness: 0.02,
    });

  return new THREE.Mesh(
    geometry,
    material
  );
}

function createCloudVolume({
  width,
  height,
  depth,
  opacity,
  color,
  speed,
  mobile,
}) {
  const geometry =
    new THREE.SphereGeometry(
      1,
      mobile ? 14 : 22,
      mobile ? 9 : 14
    );

  geometry.scale(
    width,
    height,
    depth
  );

  const noise =
    createNoiseTexture(
      mobile ? 64 : 96
    );

  const material =
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: {
          value: 0,
        },

        uOpacity: {
          value: opacity,
        },

        uColor: {
          value:
            new THREE.Color(color),
        },

        uNoise: {
          value: noise,
        },

        uSpeed: {
          value: speed,
        },
      },

      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vNormal;

        void main() {
          vec4 worldPosition =
            modelMatrix *
            vec4(position, 1.0);

          vWorldPosition =
            worldPosition.xyz;

          vNormal =
            normalize(
              mat3(modelMatrix) *
              normal
            );

          gl_Position =
            projectionMatrix *
            viewMatrix *
            worldPosition;
        }
      `,

      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uColor;
        uniform sampler2D uNoise;
        uniform float uSpeed;

        varying vec3 vWorldPosition;
        varying vec3 vNormal;

        float hash(vec3 p) {
          p =
            fract(
              p * 0.3183099 +
              0.1
            );

          p *= 17.0;

          return fract(
            p.x *
            p.y *
            p.z *
            (p.x + p.y + p.z)
          );
        }

        float noise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);

          f =
            f *
            f *
            (3.0 - 2.0 * f);

          float n000 =
            hash(i);

          float n100 =
            hash(
              i +
              vec3(
                1.0,
                0.0,
                0.0
              )
            );

          float n010 =
            hash(
              i +
              vec3(
                0.0,
                1.0,
                0.0
              )
            );

          float n110 =
            hash(
              i +
              vec3(
                1.0,
                1.0,
                0.0
              )
            );

          float n001 =
            hash(
              i +
              vec3(
                0.0,
                0.0,
                1.0
              )
            );

          float n101 =
            hash(
              i +
              vec3(
                1.0,
                0.0,
                1.0
              )
            );

          float n011 =
            hash(
              i +
              vec3(
                0.0,
                1.0,
                1.0
              )
            );

          float n111 =
            hash(
              i +
              vec3(
                1.0,
                1.0,
                1.0
              )
            );

          float x00 =
            mix(
              n000,
              n100,
              f.x
            );

          float x10 =
            mix(
              n010,
              n110,
              f.x
            );

          float x01 =
            mix(
              n001,
              n101,
              f.x
            );

          float x11 =
            mix(
              n011,
              n111,
              f.x
            );

          float y0 =
            mix(
              x00,
              x10,
              f.y
            );

          float y1 =
            mix(
              x01,
              x11,
              f.y
            );

          return mix(
            y0,
            y1,
            f.z
          );
        }

        void main() {
          vec3 p =
            vWorldPosition *
            0.0105;

          p.x +=
            uTime *
            uSpeed *
            0.02;

          p.z +=
            sin(
              uTime *
              0.08
            ) *
            0.05;

          float largeNoise =
            noise3(p);

          float detailNoise =
            noise3(
              p * 2.25
            );

          float densityNoise =
            largeNoise * 0.7 +
            detailNoise * 0.3;

          float vertical =
            smoothstep(
              -0.85,
              0.38,
              vNormal.y
            );

          float edge =
            pow(
              max(
                0.0,
                1.0 -
                abs(
                  dot(
                    normalize(
                      vNormal
                    ),
                    vec3(
                      0.0,
                      1.0,
                      0.0
                    )
                  )
                )
              ),
              0.72
            );

          float density =
            smoothstep(
              0.41,
              0.75,
              densityNoise
            );

          float alpha =
            density *
            (0.32 + edge * 0.68) *
            vertical *
            uOpacity;

          if (
            alpha < 0.012
          ) {
            discard;
          }

          gl_FragColor =
            vec4(
              uColor,
              alpha
            );
        }
      `,

      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

  const mesh =
    new THREE.Mesh(
      geometry,
      material
    );

  mesh.frustumCulled = false;

  return mesh;
}

function configureImportedObject(
  object,
  environmentIntensity
) {
  object.traverse(
    (child) => {
      if (!child.isMesh) {
        return;
      }

      child.castShadow = false;
      child.receiveShadow = true;

      const materials =
        Array.isArray(
          child.material
        )
          ? child.material
          : [child.material];

      materials.forEach(
        (material) => {
          if (!material) {
            return;
          }

          if (material.map) {
            material.map.colorSpace =
              THREE.SRGBColorSpace;
          }

          if (
            material.emissiveMap
          ) {
            material.emissiveMap.colorSpace =
              THREE.SRGBColorSpace;
          }

          if (
            material.normalMap
          ) {
            material.normalMap.colorSpace =
              THREE.NoColorSpace;
          }

          if (
            material.roughnessMap
          ) {
            material.roughnessMap.colorSpace =
              THREE.NoColorSpace;
          }

          if (
            material.metalnessMap
          ) {
            material.metalnessMap.colorSpace =
              THREE.NoColorSpace;
          }

          if (material.aoMap) {
            material.aoMap.colorSpace =
              THREE.NoColorSpace;
          }

          if (
            material.displacementMap
          ) {
            material.displacementMap.colorSpace =
              THREE.NoColorSpace;
          }

          if (
            material.envMapIntensity !==
            undefined
          ) {
            material.envMapIntensity =
              environmentIntensity;
          }
        }
      );
    }
  );
}

function fitObjectToHeight(
  object,
  targetHeight
) {
  const box =
    new THREE.Box3().setFromObject(
      object
    );

  const size =
    new THREE.Vector3();

  box.getSize(size);

  if (
    !Number.isFinite(size.y) ||
    size.y <= 0
  ) {
    return;
  }

  const scale =
    targetHeight / size.y;

  object.scale.multiplyScalar(
    scale
  );
}

function disposeMaterial(
  material,
  disposedTextures
) {
  if (!material) {
    return;
  }

  const textureKeys = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "displacementMap",
    "emissiveMap",
    "alphaMap",
    "bumpMap",
    "specularMap",
    "envMap",
  ];

  textureKeys.forEach(
    (key) => {
      const texture =
        material[key];

      if (
        texture &&
        !disposedTextures.has(
          texture.uuid
        )
      ) {
        texture.dispose();

        disposedTextures.add(
          texture.uuid
        );
      }
    }
  );

  material.dispose();
}

function disposeObject(
  object,
  disposedTextures
) {
  object.traverse(
    (child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }

      if (!child.material) {
        return;
      }

      if (
        Array.isArray(
          child.material
        )
      ) {
        child.material.forEach(
          (material) =>
            disposeMaterial(
              material,
              disposedTextures
            )
        );
      } else {
        disposeMaterial(
          child.material,
          disposedTextures
        );
      }
    }
  );
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

    const mobile =
      getIsMobile();

    const reducedMotion =
      getReducedMotion();

    let destroyed = false;
    let animationFrame = 0;

    const scene =
      new THREE.Scene();

    scene.background =
      new THREE.Color(
        0x071018
      );

    scene.fog =
      new THREE.FogExp2(
        0x071018,
        mobile
          ? 0.00305
          : 0.00225
      );

    const camera =
      new THREE.PerspectiveCamera(
        mobile ? 49 : 43,
        1,
        0.1,
        2200
      );

    camera.position.set(
      0,
      mobile ? 24 : 29,
      78
    );

    camera.lookAt(
      0,
      8,
      -160
    );

    const renderer =
      new THREE.WebGLRenderer({
        antialias: !mobile,
        alpha: false,
        powerPreference:
          "high-performance",
      });

    renderer.outputColorSpace =
      THREE.SRGBColorSpace;

    renderer.toneMapping =
      THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure =
      mobile ? 0.92 : 1.0;

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio ||
          1,
        mobile ? 1.35 : 1.8
      )
    );

    renderer.domElement.setAttribute(
      "aria-hidden",
      "true"
    );

    renderer.domElement.style.display =
      "block";

    renderer.domElement.style.width =
      "100%";

    renderer.domElement.style.height =
      "100%";

    mount.appendChild(
      renderer.domElement
    );

    const ambient =
      new THREE.HemisphereLight(
        0xcfe4ec,
        0x071014,
        mobile ? 1.08 : 1.28
      );

    scene.add(ambient);

    const keyLight =
      new THREE.DirectionalLight(
        0xe9f5f8,
        mobile ? 1.15 : 1.45
      );

    keyLight.position.set(
      -180,
      260,
      150
    );

    scene.add(keyLight);

    const blueFill =
      new THREE.DirectionalLight(
        0x78c7db,
        mobile ? 0.24 : 0.36
      );

    blueFill.position.set(
      210,
      120,
      -280
    );

    scene.add(blueFill);

    const world =
      new THREE.Group();

    world.name =
      "ANTARCTIC_WORLD";

    scene.add(world);

    const atmosphere =
      new THREE.Group();

    atmosphere.name =
      "ATMOSPHERE";

    world.add(atmosphere);

    const mountains =
      new THREE.Group();

    mountains.name =
      "MOUNTAINS";

    world.add(mountains);

    const terrain =
      new THREE.Group();

    terrain.name =
      "TERRAIN";

    world.add(terrain);

    const clouds =
      new THREE.Group();

    clouds.name =
      "CLOUD_SYSTEM";

    atmosphere.add(clouds);

    const water =
      createWater();

    terrain.add(water);

    const stars =
      createStars(
        mobile ? 520 : 1200,
        220,
        560,
        mobile
      );

    atmosphere.add(stars);

    /*
      Mountain-base cloud:
      low, broad, restrained.
    */

    const baseMist =
      createCloudVolume({
        width: 330,
        height: 46,
        depth: 260,
        opacity: mobile
          ? 0.25
          : 0.34,
        color: 0xd9e7eb,
        speed: 0.65,
        mobile,
      });

    baseMist.position.set(
      0,
      13,
      -305
    );

    clouds.add(baseMist);

    /*
      Deep transition volume:
      this is the major visibility transition.
    */

    const deepCloud =
      createCloudVolume({
        width: 440,
        height: 132,
        depth: 360,
        opacity: mobile
          ? 0.39
          : 0.53,
        color: 0xd3e1e6,
        speed: 1.05,
        mobile,
      });

    deepCloud.position.set(
      0,
      21,
      -515
    );

    clouds.add(deepCloud);

    /*
      Foreground mist:
      gives the camera something to travel through
      without becoming a permanent white overlay.
    */

    const foregroundMist =
      createCloudVolume({
        width: 540,
        height: 40,
        depth: 250,
        opacity: mobile
          ? 0.16
          : 0.24,
        color: 0xc4d8df,
        speed: 0.4,
        mobile,
      });

    foregroundMist.position.set(
      0,
      -2,
      -175
    );

    clouds.add(
      foregroundMist
    );

    const textureLoader =
      new THREE.TextureLoader();

    const loadedTextures = [];

    const loadTexture =
      (url, type) =>
        new Promise(
          (resolve) => {
            textureLoader.load(
              url,
              (texture) => {
                if (
                  type ===
                  "color"
                ) {
                  configureColorTexture(
                    texture
                  );
                } else {
                  configureDataTexture(
                    texture
                  );
                }

                loadedTextures.push(
                  texture
                );

                resolve(
                  texture
                );
              },
              undefined,
              () => {
                resolve(null);
              }
            );
          }
        );

    /*
      Load the sky first because it supplies
      the visual world and environment lighting.
    */

    const loadEnvironment =
      async () => {
        const sky =
          await loadTexture(
            ASSETS.sky,
            "color"
          );

        if (
          destroyed ||
          !sky
        ) {
          return;
        }

        sky.mapping =
          THREE.EquirectangularReflectionMapping;

        scene.background =
          sky;

        const pmrem =
          new THREE.PMREMGenerator(
            renderer
          );

        pmrem.compileEquirectangularShader();

        const environment =
          pmrem.fromEquirectangular(
            sky
          ).texture;

        scene.environment =
          environment;

        pmrem.dispose();
      };

    loadEnvironment();

    /*
      Terrain textures are intentionally loaded
      separately so a missing optional map does
      not prevent the rest of the world rendering.
    */

    const loadTerrain =
      async () => {
        const iceColor =
          await loadTexture(
            ASSETS.ice.color,
            "color"
          );

        const iceNormal =
          await loadTexture(
            ASSETS.ice.normal,
            "data"
          );

        const iceRoughness =
          await loadTexture(
            ASSETS.ice.roughness,
            "data"
          );

        const iceDisplacement =
          mobile
            ? null
            : await loadTexture(
                ASSETS.ice.displacement,
                "data"
              );

        if (
          destroyed
        ) {
          return;
        }

        terrain.add(
          createIceFloor(
            {
              color: iceColor,
              normal: iceNormal,
              roughness:
                iceRoughness,
              displacement:
                iceDisplacement,
            },
            mobile
          )
        );

        const snowColor =
          await loadTexture(
            ASSETS.snow.color,
            "color"
          );

        const snowNormal =
          await loadTexture(
            ASSETS.snow.normal,
            "data"
          );

        const snowRoughness =
          await loadTexture(
            ASSETS.snow.roughness,
            "data"
          );

        if (
          !destroyed
        ) {
          terrain.add(
            createSnowField(
              {
                color:
                  snowColor,
                normal:
                  snowNormal,
                roughness:
                  snowRoughness,
              },
              mobile
            )
          );
        }

        const rockColor =
          await loadTexture(
            ASSETS.rock.color,
            "color"
          );

        const rockNormal =
          await loadTexture(
            ASSETS.rock.normal,
            "data"
          );

        const rockRoughness =
          await loadTexture(
            ASSETS.rock.roughness,
            "data"
          );

        if (
          !destroyed
        ) {
          terrain.add(
            createRockShelf(
              {
                color:
                  rockColor,
                normal:
                  rockNormal,
                roughness:
                  rockRoughness,
              }
            )
          );
        }
      };

    loadTerrain();

    /*
      Secondary mountain.
      This is the mountain we already have.
    */

    let secondaryMountain =
      null;

    const fbxLoader =
      new FBXLoader();

    fbxLoader.load(
      ASSETS.secondaryMountain,
      (object) => {
        if (destroyed) {
          disposeObject(
            object,
            new Set()
          );

          return;
        }

        secondaryMountain =
          object;

        configureImportedObject(
          object,
          mobile ? 0.72 : 0.9
        );

        fitObjectToHeight(
          object,
          mobile ? 150 : 180
        );

        object.position.set(
          0,
          -9,
          -405
        );

        object.rotation.y =
          Math.PI * 0.08;

        object.traverse(
          (child) => {
            if (
              !child.isMesh ||
              !child.material
            ) {
              return;
            }

            const materials =
              Array.isArray(
                child.material
              )
                ? child.material
                : [child.material];

            materials.forEach(
              (material) => {
                if (
                  material.color
                ) {
                  material.color.multiplyScalar(
                    0.88
                  );
                }
              }
            );
          }
        );

        mountains.add(
          object
        );
      },
      undefined,
      () => {
        /*
          Optional enhancement.
          The scene does not depend on the FBX
          successfully loading.
        */
      }
    );

    /*
      HERO MOUNTAIN

      This file does not exist yet.

      Once Aura_Borealis_.blend is converted to
      the optimized GLB at this path, the scene
      automatically picks it up.

      Nothing else in the architecture needs
      to change.
    */

    let heroMountain =
      null;

    const gltfLoader =
      new GLTFLoader();

    gltfLoader.load(
      ASSETS.heroMountain,
      (gltf) => {
        if (destroyed) {
          disposeObject(
            gltf.scene,
            new Set()
          );

          return;
        }

        heroMountain =
          gltf.scene;

        configureImportedObject(
          heroMountain,
          mobile ? 0.82 : 1.0
        );

        fitObjectToHeight(
          heroMountain,
          mobile ? 128 : 150
        );

        heroMountain.position.set(
          0,
          -4,
          -255
        );

        heroMountain.traverse(
          (child) => {
            if (
              !child.isMesh ||
              !child.material
            ) {
              return;
            }

            const materials =
              Array.isArray(
                child.material
              )
                ? child.material
                : [child.material];

            materials.forEach(
              (material) => {
                if (
                  material.emissive
                ) {
                  material.emissiveIntensity =
                    Math.min(
                      material.emissiveIntensity ||
                        1,
                      1.35
                    );
                }
              }
            );
          }
        );

        mountains.add(
          heroMountain
        );
      },
      undefined,
      () => {
        /*
          Expected until the future GLB is installed.
          No procedural fake mountain is substituted.
        */
      }
    );

    let scrollTarget = 0;
    let scrollCurrent = 0;

    const updateScroll =
      () => {
        const range =
          Math.max(
            1,
            document.documentElement
              .scrollHeight -
              window.innerHeight
          );

        scrollTarget =
          THREE.MathUtils.clamp(
            window.scrollY / range,
            0,
            1
          );
      };

    updateScroll();

    window.addEventListener(
      "scroll",
      updateScroll,
      {
        passive: true,
      }
    );

    const resize =
      () => {
        const width =
          mount.clientWidth ||
          window.innerWidth;

        const height =
          mount.clientHeight ||
          window.innerHeight;

        camera.aspect =
          width / height;

        camera.updateProjectionMatrix();

        renderer.setPixelRatio(
          Math.min(
            window.devicePixelRatio ||
              1,
            width <=
              MOBILE_BREAKPOINT
              ? 1.35
              : 1.8
          )
        );

        renderer.setSize(
          width,
          height,
          false
        );
      };

    window.addEventListener(
      "resize",
      resize,
      {
        passive: true,
      }
    );

    resize();

    const clock =
      new THREE.Clock();

    const render =
      () => {
        if (destroyed) {
          return;
        }

        const elapsed =
          clock.getElapsedTime();

        const motion =
          reducedMotion
            ? 0.12
            : 1;

        scrollCurrent +=
          (
            scrollTarget -
            scrollCurrent
          ) *
          (
            reducedMotion
              ? 0.085
              : 0.055
          );

        const t =
          scrollCurrent;

        /*
          THE ANTARCTIC JOURNEY

          0.00 — arrival
          0.25 — descent
          0.50 — atmospheric passage
          0.72 — terrain / expedition
          1.00 — horizon
        */

        const descent =
          THREE.MathUtils.smoothstep(
            t,
            0,
            0.82
          );

        const cameraY =
          THREE.MathUtils.lerp(
            mobile ? 24 : 29,
            mobile ? -2 : -4,
            descent
          );

        const cameraZ =
          THREE.MathUtils.lerp(
            78,
            -170,
            descent
          );

        const cameraX =
          Math.sin(
            elapsed *
              0.075 *
              motion
          ) *
          (
            mobile
              ? 1.1
              : 2.6
          );

        camera.position.x =
          cameraX;

        camera.position.y =
          cameraY;

        camera.position.z =
          cameraZ;

        const lookTarget =
          new THREE.Vector3(
            cameraX * 0.16,
            THREE.MathUtils.lerp(
              9,
              4,
              descent
            ),
            THREE.MathUtils.lerp(
              -165,
              -310,
              descent
            )
          );

        camera.lookAt(
          lookTarget
        );

        /*
          Hero mountain parallax.
        */

        if (
          heroMountain
        ) {
          const heroTravel =
            THREE.MathUtils.smoothstep(
              t,
              0.02,
              0.72
            );

          heroMountain.position.y =
            -4 -
            heroTravel * 7;

          heroMountain.position.x =
            Math.sin(
              elapsed *
                0.055 *
                motion
            ) * 1.5;

          heroMountain.rotation.y =
            Math.sin(
              elapsed *
                0.035 *
                motion
            ) *
            0.004;
        }

        /*
          Distant mountain movement.
        */

        if (
          secondaryMountain
        ) {
          secondaryMountain.position.z =
            -405 +
            t * 82;

          secondaryMountain.position.y =
            -9 +
            t * 4.5;

          secondaryMountain.rotation.y =
            Math.PI * 0.08 +
            Math.sin(
              elapsed *
                0.024 *
                motion
            ) *
            0.004;
        }

        /*
          Cloud volumes physically move through
          the camera's world rather than sitting
          as a screen-space overlay.
        */

        const cloudTravel =
          t * 310;

        baseMist.position.z =
          -305 +
          cloudTravel * 0.32;

        deepCloud.position.z =
          -515 +
          cloudTravel * 0.9;

        foregroundMist.position.z =
          -175 +
          cloudTravel * 0.42;

        const transition =
          THREE.MathUtils.smoothstep(
            t,
            0.2,
            0.62
          );

        const release =
          1 -
          THREE.MathUtils.smoothstep(
            t,
            0.72,
            1
          );

        const cloudIntensity =
          transition *
          (
            0.75 +
            release * 0.25
          );

        [
          baseMist,
          deepCloud,
          foregroundMist,
        ].forEach(
          (cloud) => {
            if (
              cloud.material
                ?.uniforms
            ) {
              cloud.material.uniforms.uTime.value =
                elapsed * motion;
            }
          }
        );

        baseMist.material.uniforms.uOpacity.value =
          (
            mobile
              ? 0.24
              : 0.33
          ) +
          cloudIntensity *
          (
            mobile
              ? 0.08
              : 0.12
          );

        deepCloud.material.uniforms.uOpacity.value =
          (
            mobile
              ? 0.31
              : 0.43
          ) +
          cloudIntensity *
          (
            mobile
              ? 0.22
              : 0.3
          );

        foregroundMist.material.uniforms.uOpacity.value =
          (
            mobile
              ? 0.13
              : 0.2
          ) +
          cloudIntensity *
          (
            mobile
              ? 0.07
              : 0.1
          );

        /*
          Global atmosphere follows the cloud passage.
        */

        scene.fog.density =
          THREE.MathUtils.lerp(
            mobile
              ? 0.00305
              : 0.00225,
            mobile
              ? 0.0054
              : 0.0041,
            cloudIntensity * 0.62
          );

        /*
          Very restrained world motion.
        */

        stars.rotation.y =
          elapsed *
          0.0012 *
          motion;

        world.position.x =
          Math.sin(
            elapsed *
              0.018 *
              motion
          ) *
          0.65;

        renderer.render(
          scene,
          camera
        );

        animationFrame =
          requestAnimationFrame(
            render
          );
      };

    animationFrame =
      requestAnimationFrame(
        render
      );

    return () => {
      destroyed = true;

      cancelAnimationFrame(
        animationFrame
      );

      window.removeEventListener(
        "scroll",
        updateScroll
      );

      window.removeEventListener(
        "resize",
        resize
      );

      const disposedTextures =
        new Set();

      scene.traverse(
        (object) => {
          if (object.geometry) {
            object.geometry.dispose();
          }

          if (
            object.material
          ) {
            if (
              Array.isArray(
                object.material
              )
            ) {
              object.material.forEach(
                (material) =>
                  disposeMaterial(
                    material,
                    disposedTextures
                  )
              );
            } else {
              disposeMaterial(
                object.material,
                disposedTextures
              );
            }
          }
        }
      );

      loadedTextures.forEach(
        (texture) => {
          if (
            !disposedTextures.has(
              texture.uuid
            )
          ) {
            texture.dispose();

            disposedTextures.add(
              texture.uuid
            );
          }
        }
      );

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
      className="polar-scene"
      aria-hidden="true"
    />
  );
}