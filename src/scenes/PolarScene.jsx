import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const ASSETS = {
  sky: "/assets/hdr/daysky-8k-hdr-4k.jpg",

  hero:
    "/assets/models/mountains/single-mountain-snow.glb",

  distance:
    "/assets/models/mountains/chalaadi.fbx",

  ice: {
    color: "/assets/ice/ice-color.png",
    normal: "/assets/ice/ice-normal.jpg",
    roughness: "/assets/ice/ice-roughness.png",
    displacement: "/assets/ice/ice-displacement.png",
  },

  snow: {
    color: "/assets/snow/snow-color.png",
    normal: "/assets/snow/snow-normal.png",
    roughness: "/assets/snow/snow-roughness.png",
    ao: "/assets/snow/snow-ao.png",
  },

  rock: {
    color: "/assets/rock/rock-color.png",
    normal: "/assets/rock/rock-normal.png",
    roughness: "/assets/rock/rock-roughness.png",
    ao: "/assets/rock/rock-ao.png",
  },
};

const MOBILE_QUERY =
  "(max-width: 800px), (pointer: coarse)";

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01(
    (value - edge0) / (edge1 - edge0)
  );

  return t * t * (3 - 2 * t);
}

function damp(current, target, lambda, delta) {
  return THREE.MathUtils.damp(
    current,
    target,
    lambda,
    delta
  );
}

function disposeMaterial(material, textures) {
  if (!material) {
    return;
  }

  const materials = Array.isArray(material)
    ? material
    : [material];

  materials.forEach((entry) => {
    if (!entry) {
      return;
    }

    Object.keys(entry).forEach((key) => {
      const value = entry[key];

      if (
        value &&
        value.isTexture
      ) {
        textures.add(value);
      }
    });

    entry.dispose();
  });
}

function disposeObject(object, textures) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (child.material) {
      disposeMaterial(
        child.material,
        textures
      );
    }
  });
}

function setTextureRepeat(
  texture,
  repeatX,
  repeatY = repeatX
) {
  texture.wrapS =
    THREE.RepeatWrapping;
  texture.wrapT =
    THREE.RepeatWrapping;

  texture.repeat.set(
    repeatX,
    repeatY
  );
}

function createNoiseTexture() {
  const size = 128;
  const canvas =
    document.createElement("canvas");

  canvas.width = size;
  canvas.height = size;

  const context =
    canvas.getContext("2d");

  const imageData =
    context.createImageData(
      size,
      size
    );

  for (
    let index = 0;
    index < imageData.data.length;
    index += 4
  ) {
    const value =
      Math.floor(
        Math.random() * 256
      );

    imageData.data[index] =
      value;

    imageData.data[index + 1] =
      value;

    imageData.data[index + 2] =
      value;

    imageData.data[index + 3] =
      255;
  }

  context.putImageData(
    imageData,
    0,
    0
  );

  const texture =
    new THREE.CanvasTexture(
      canvas
    );

  texture.wrapS =
    THREE.RepeatWrapping;

  texture.wrapT =
    THREE.RepeatWrapping;

  texture.minFilter =
    THREE.LinearFilter;

  texture.magFilter =
    THREE.LinearFilter;

  return texture;
}

function createCloudMaterial(
  noiseTexture,
  mobile
) {
  const vertexShader = `
    varying vec3 vWorldPosition;
    varying vec2 vUv;

    void main() {
      vUv = uv;

      vec4 worldPosition =
        modelMatrix * vec4(position, 1.0);

      vWorldPosition =
        worldPosition.xyz;

      gl_Position =
        projectionMatrix *
        viewMatrix *
        worldPosition;
    }
  `;

  const fragmentShader = `
    uniform sampler2D uNoise;
    uniform float uTime;
    uniform float uDensity;
    uniform float uOpacity;
    uniform float uScale;
    uniform vec3 uColor;

    varying vec3 vWorldPosition;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(
        sin(
          dot(
            p,
            vec2(
              127.1,
              311.7
            )
          )
        ) *
        43758.5453123
      );
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);

      f =
        f *
        f *
        (3.0 - 2.0 * f);

      return mix(
        mix(
          hash(i),
          hash(i + vec2(1.0, 0.0)),
          f.x
        ),
        mix(
          hash(i + vec2(0.0, 1.0)),
          hash(i + vec2(1.0, 1.0)),
          f.x
        ),
        f.y
      );
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;

      for (
        int i = 0;
        i < ${mobile ? 3 : 5};
        i++
      ) {
        value +=
          noise(p) *
          amplitude;

        p =
          p * 2.03 +
          vec2(17.3, 9.7);

        amplitude *= 0.5;
      }

      return value;
    }

    void main() {
      vec2 drift =
        vec2(
          uTime * 0.006,
          uTime * 0.002
        );

      vec2 uv =
        vUv *
        uScale +
        drift;

      float large =
        fbm(uv);

      float detail =
        fbm(
          uv * 2.7 +
          vec2(4.1, 7.3)
        );

      float cloud =
        mix(
          large,
          detail,
          0.28
        );

      cloud =
        smoothstep(
          0.42,
          0.72,
          cloud
        );

      float edge =
        smoothstep(
          0.0,
          0.18,
          vUv.x
        ) *
        smoothstep(
          1.0,
          0.82,
          vUv.x
        );

      float vertical =
        smoothstep(
          0.0,
          0.25,
          vUv.y
        ) *
        smoothstep(
          1.0,
          0.72,
          vUv.y
        );

      float alpha =
        cloud *
        edge *
        vertical *
        uDensity *
        uOpacity;

      if (alpha < 0.008) {
        discard;
      }

      float lighting =
        0.78 +
        cloud * 0.22;

      vec3 finalColor =
        uColor *
        lighting;

      gl_FragColor =
        vec4(
          finalColor,
          alpha
        );
    }
  `;

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,

    uniforms: {
      uNoise: {
        value: noiseTexture,
      },

      uTime: {
        value: 0,
      },

      uDensity: {
        value: 0.58,
      },

      uOpacity: {
        value: 0.72,
      },

      uScale: {
        value: mobile
          ? 2.8
          : 4.2,
      },

      uColor: {
        value:
          new THREE.Color(
            "#d8e9ed"
          ),
      },
    },

    transparent: true,
    depthWrite: false,
    depthTest: true,

    side:
      THREE.DoubleSide,

    blending:
      THREE.NormalBlending,
  });
}

function createCloudLayer({
  width,
  height,
  depth,
  y,
  z,
  material,
}) {
  const geometry =
    new THREE.BoxGeometry(
      width,
      height,
      depth,
      1,
      1,
      1
    );

  const mesh =
    new THREE.Mesh(
      geometry,
      material
    );

  mesh.position.set(
    0,
    y,
    z
  );

  return mesh;
}

function createTerrainMaterial(
  textures,
  {
    color,
    normal,
    roughness,
    displacement,
    scale = 1,
  }
) {
  const material =
    new THREE.MeshStandardMaterial({
      map: color || null,
      normalMap: normal || null,
      roughnessMap:
        roughness || null,

      displacementMap:
        displacement || null,

      displacementScale:
        displacement
          ? 0.035
          : 0,

      displacementBias:
        displacement
          ? -0.012
          : 0,

      roughness: 0.88,
      metalness: 0.02,

      color: "#ffffff",
    });

  if (color) {
    color.colorSpace =
      THREE.SRGBColorSpace;
  }

  if (normal) {
    normal.colorSpace =
      THREE.NoColorSpace;
  }

  if (roughness) {
    roughness.colorSpace =
      THREE.NoColorSpace;
  }

  if (displacement) {
    displacement.colorSpace =
      THREE.NoColorSpace;
  }

  [
    color,
    normal,
    roughness,
    displacement,
  ]
    .filter(Boolean)
    .forEach((texture) => {
      setTextureRepeat(
        texture,
        scale
      );

      textures.add(texture);
    });

  return material;
}

export default function PolarScene() {
  const hostRef =
    useRef(null);

  useEffect(() => {
    const host =
      hostRef.current;

    if (!host) {
      return undefined;
    }

    let destroyed = false;

    const mobile =
      window.matchMedia(
        MOBILE_QUERY
      ).matches;

    const reducedMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

    const textureSet =
      new Set();

    const scene =
      new THREE.Scene();

    scene.background =
      new THREE.Color(
        "#071018"
      );

    scene.fog =
      new THREE.FogExp2(
        "#08151c",
        mobile
          ? 0.0065
          : 0.0046
      );

    const camera =
      new THREE.PerspectiveCamera(
        mobile ? 48 : 43,
        1,
        0.1,
        500
      );

    camera.position.set(
      0,
      mobile ? 5.5 : 6.5,
      mobile ? 28 : 31
    );

    const renderer =
      new THREE.WebGLRenderer({
        antialias:
          !mobile,
        alpha: true,
        powerPreference:
          "high-performance",
      });

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio ||
          1,
        mobile ? 1.35 : 1.8
      )
    );

    renderer.setSize(
      host.clientWidth ||
        window.innerWidth,
      host.clientHeight ||
        window.innerHeight,
      false
    );

    renderer.outputColorSpace =
      THREE.SRGBColorSpace;

    renderer.toneMapping =
      THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure =
      0.92;

    renderer.shadowMap.enabled =
      !mobile;

    renderer.shadowMap.type =
      THREE.PCFSoftShadowMap;

    host.appendChild(
      renderer.domElement
    );

    const ambient =
      new THREE.HemisphereLight(
        "#d9f4ff",
        "#071017",
        mobile
          ? 1.05
          : 1.25
      );

    scene.add(ambient);

    const keyLight =
      new THREE.DirectionalLight(
        "#e9f8ff",
        mobile
          ? 1.7
          : 2.2
      );

    keyLight.position.set(
      -18,
      28,
      12
    );

    keyLight.castShadow =
      !mobile;

    if (!mobile) {
      keyLight.shadow.mapSize.set(
        1024,
        1024
      );

      keyLight.shadow.camera.near =
        1;

      keyLight.shadow.camera.far =
        100;

      keyLight.shadow.camera.left =
        -35;

      keyLight.shadow.camera.right =
        35;

      keyLight.shadow.camera.top =
        35;

      keyLight.shadow.camera.bottom =
        -35;
    }

    scene.add(keyLight);

    const rimLight =
      new THREE.DirectionalLight(
        "#7ddde4",
        0.72
      );

    rimLight.position.set(
      22,
      10,
      -24
    );

    scene.add(rimLight);

    const world =
      new THREE.Group();

    scene.add(world);

    const distanceGroup =
      new THREE.Group();

    const heroGroup =
      new THREE.Group();

    const terrainGroup =
      new THREE.Group();

    const cloudGroup =
      new THREE.Group();

    const atmosphereGroup =
      new THREE.Group();

    const starGroup =
      new THREE.Group();

    world.add(
      distanceGroup,
      heroGroup,
      terrainGroup,
      cloudGroup,
      atmosphereGroup,
      starGroup
    );

    /*
      ----------------------------------------------------------
      SKY
      ----------------------------------------------------------
    */

    const textureLoader =
      new THREE.TextureLoader();

    const gltfLoader =
      new GLTFLoader();

    const fbxLoader =
      new FBXLoader();

    let environmentMap =
      null;

    const pmrem =
      new THREE.PMREMGenerator(
        renderer
      );

    pmrem.compileEquirectangularShader();

    textureLoader.load(
      ASSETS.sky,
      (texture) => {
        if (destroyed) {
          texture.dispose();
          return;
        }

        texture.colorSpace =
          THREE.SRGBColorSpace;

        texture.mapping =
          THREE.EquirectangularReflectionMapping;

        scene.background =
          texture;

        const generated =
          pmrem.fromEquirectangular(
            texture
          );

        environmentMap =
          generated.texture;

        scene.environment =
          environmentMap;

        generated.dispose();
        pmrem.dispose();

        textureSet.add(
          texture
        );
      },
      undefined,
      () => {
        if (!destroyed) {
          scene.background =
            new THREE.Color(
              "#071018"
            );
        }
      }
    );

    /*
      ----------------------------------------------------------
      REAL TERRAIN MATERIALS
      ----------------------------------------------------------
    */

    const loadColor =
      (path) =>
        new Promise(
          (resolve) => {
            textureLoader.load(
              path,
              (texture) => {
                texture.colorSpace =
                  THREE.SRGBColorSpace;

                textureSet.add(
                  texture
                );

                resolve(texture);
              },
              undefined,
              () => resolve(null)
            );
          }
        );

    const loadData =
      (path) =>
        new Promise(
          (resolve) => {
            textureLoader.load(
              path,
              (texture) => {
                texture.colorSpace =
                  THREE.NoColorSpace;

                textureSet.add(
                  texture
                );

                resolve(texture);
              },
              undefined,
              () => resolve(null)
            );
          }
        );

    Promise.all([
      loadColor(
        ASSETS.ice.color
      ),
      loadData(
        ASSETS.ice.normal
      ),
      loadData(
        ASSETS.ice.roughness
      ),
      loadData(
        ASSETS.ice.displacement
      ),

      loadColor(
        ASSETS.snow.color
      ),
      loadData(
        ASSETS.snow.normal
      ),
      loadData(
        ASSETS.snow.roughness
      ),
      loadData(
        ASSETS.snow.ao
      ),

      loadColor(
        ASSETS.rock.color
      ),
      loadData(
        ASSETS.rock.normal
      ),
      loadData(
        ASSETS.rock.roughness
      ),
      loadData(
        ASSETS.rock.ao
      ),
    ]).then(
      ([
        iceColor,
        iceNormal,
        iceRoughness,
        iceDisplacement,

        snowColor,
        snowNormal,
        snowRoughness,
        snowAO,

        rockColor,
        rockNormal,
        rockRoughness,
        rockAO,
      ]) => {
        if (destroyed) {
          return;
        }

        /*
          ICE FIELD
        */

        const iceGeometry =
          new THREE.PlaneGeometry(
            150,
            150,
            mobile
              ? 48
              : 82,
            mobile
              ? 48
              : 82
          );

        iceGeometry.rotateX(
          -Math.PI / 2
        );

        const iceMaterial =
          createTerrainMaterial(
            textureSet,
            {
              color: iceColor,
              normal: iceNormal,
              roughness:
                iceRoughness,
              displacement:
                iceDisplacement,
              scale: 7,
            }
          );

        iceMaterial.roughness =
          0.76;

        iceMaterial.metalness =
          0.04;

        const ice =
          new THREE.Mesh(
            iceGeometry,
            iceMaterial
          );

        ice.position.y =
          -1.7;

        ice.position.z =
          -10;

        ice.receiveShadow =
          !mobile;

        terrainGroup.add(
          ice
        );

        /*
          SNOW FIELD
        */

        const snowGeometry =
          new THREE.PlaneGeometry(
            115,
            72,
            mobile
              ? 34
              : 60,
            mobile
              ? 26
              : 44
          );

        snowGeometry.rotateX(
          -Math.PI / 2
        );

        const snowMaterial =
          createTerrainMaterial(
            textureSet,
            {
              color: snowColor,
              normal: snowNormal,
              roughness:
                snowRoughness,
              scale: 5.2,
            }
          );

        snowMaterial.roughness =
          0.94;

        if (snowAO) {
          snowMaterial.aoMap =
            snowAO;
          snowMaterial.aoMapIntensity =
            0.42;
        }

        const snow =
          new THREE.Mesh(
            snowGeometry,
            snowMaterial
          );

        snow.position.set(
          0,
          -1.52,
          -17
        );

        snow.receiveShadow =
          !mobile;

        terrainGroup.add(
          snow
        );

        /*
          ROCK OUTCROPS
        */

        const rockMaterial =
          createTerrainMaterial(
            textureSet,
            {
              color: rockColor,
              normal: rockNormal,
              roughness:
                rockRoughness,
              scale: 1.8,
            }
          );

        rockMaterial.roughness =
          0.92;

        if (rockAO) {
          rockMaterial.aoMap =
            rockAO;
          rockMaterial.aoMapIntensity =
            0.55;
        }

        const rockGeometry =
          new THREE.IcosahedronGeometry(
            1,
            mobile ? 1 : 2
          );

        const rockPositions = [
          [-17, -0.35, 4, 3.6],
          [16, -0.55, 1, 4.2],
          [-10, -0.7, -13, 2.8],
          [11, -0.8, -20, 3.4],
          [-21, -0.9, -26, 4.8],
          [20, -0.85, -31, 4.5],
        ];

        rockPositions.forEach(
          ([x, y, z, scale], index) => {
            const rock =
              new THREE.Mesh(
                rockGeometry.clone(),
                rockMaterial.clone()
              );

            rock.position.set(
              x,
              y,
              z
            );

            rock.scale.set(
              scale,
              scale *
                (0.55 +
                  (index % 3) *
                    0.12),
              scale *
                (0.78 +
                  (index % 2) *
                    0.18)
            );

            rock.rotation.set(
              index * 0.31,
              index * 0.67,
              index * 0.19
            );

            rock.castShadow =
              !mobile;

            rock.receiveShadow =
              !mobile;

            terrainGroup.add(
              rock
            );
          }
        );
      }
    );

    /*
      ----------------------------------------------------------
      DISTANCE MOUNTAIN — REAL FBX
      ----------------------------------------------------------
    */

    fbxLoader.load(
      ASSETS.distance,
      (mountain) => {
        if (destroyed) {
          disposeObject(
            mountain,
            textureSet
          );

          return;
        }

        mountain.traverse(
          (child) => {
            if (!child.isMesh) {
              return;
            }

            child.castShadow =
              !mobile;

            child.receiveShadow =
              !mobile;

            if (
              child.material
            ) {
              const materials =
                Array.isArray(
                  child.material
                )
                  ? child.material
                  : [child.material];

              materials.forEach(
                (material) => {
                  material.side =
                    THREE.FrontSide;

                  material.roughness =
                    0.9;

                  material.metalness =
                    0.0;
                }
              );
            }
          }
        );

        const box =
          new THREE.Box3().setFromObject(
            mountain
          );

        const size =
          new THREE.Vector3();

        box.getSize(size);

        const maxDimension =
          Math.max(
            size.x,
            size.y,
            size.z
          );

        if (
          Number.isFinite(
            maxDimension
          ) &&
          maxDimension > 0
        ) {
          const scale =
            31 /
            maxDimension;

          mountain.scale.setScalar(
            scale
          );
        }

        const scaledBox =
          new THREE.Box3().setFromObject(
            mountain
          );

        const center =
          new THREE.Vector3();

        scaledBox.getCenter(
          center
        );

        mountain.position.x -=
          center.x;

        mountain.position.y -=
          scaledBox.min.y;

        mountain.position.y -=
          1.4;

        mountain.position.z =
          -48;

        mountain.rotation.y =
          Math.PI * 0.035;

        distanceGroup.add(
          mountain
        );
      },
      undefined,
      () => {
        // The scene intentionally
        // continues without the
        // distance mountain.
      }
    );

    /*
      ----------------------------------------------------------
      OPTIONAL HERO MOUNTAIN
      ----------------------------------------------------------

      This is deliberately optional.

      When the optimized GLB exported
      from Aura_Borealis_.blend exists at
      this path, it automatically becomes
      the foreground hero.

      Until then, the rest of the
      environment remains fully functional.
    */

    gltfLoader.load(
      ASSETS.hero,
      (gltf) => {
        if (destroyed) {
          disposeObject(
            gltf.scene,
            textureSet
          );

          return;
        }

        const hero =
          gltf.scene;

        hero.traverse(
          (child) => {
            if (!child.isMesh) {
              return;
            }

            child.castShadow =
              !mobile;

            child.receiveShadow =
              !mobile;

            if (
              child.material
            ) {
              const materials =
                Array.isArray(
                  child.material
                )
                  ? child.material
                  : [child.material];

              materials.forEach(
                (material) => {
                  material.envMapIntensity =
                    1.15;

                  material.roughness =
                    Math.min(
                      material.roughness ??
                        0.72,
                      0.86
                    );
                }
              );
            }
          }
        );

        const box =
          new THREE.Box3().setFromObject(
            hero
          );

        const size =
          new THREE.Vector3();

        box.getSize(size);

        const maxDimension =
          Math.max(
            size.x,
            size.y,
            size.z
          );

        if (
          Number.isFinite(
            maxDimension
          ) &&
          maxDimension > 0
        ) {
          const targetSize =
            mobile
              ? 23
              : 29;

          hero.scale.setScalar(
            targetSize /
              maxDimension
          );
        }

        const normalizedBox =
          new THREE.Box3().setFromObject(
            hero
          );

        const center =
          new THREE.Vector3();

        normalizedBox.getCenter(
          center
        );

        hero.position.x -=
          center.x;

        hero.position.y -=
          normalizedBox.min.y;

        hero.position.y -=
          1.15;

        hero.position.z =
          mobile ? -22 : -26;

        hero.rotation.y =
          Math.PI * 0.035;

        heroGroup.add(
          hero
        );
      },
      undefined,
      () => {
        // Optional hero asset.
        // No error state is shown to
        // the visitor.
      }
    );

    /*
      ----------------------------------------------------------
      CLOUD / MIST SYSTEM
      ----------------------------------------------------------
    */

    const cloudNoise =
      createNoiseTexture();

    textureSet.add(
      cloudNoise
    );

    const mountainCloudMaterial =
      createCloudMaterial(
        cloudNoise,
        mobile
      );

    const transitionCloudMaterial =
      createCloudMaterial(
        cloudNoise,
        mobile
      );

    const foregroundMistMaterial =
      createCloudMaterial(
        cloudNoise,
        mobile
      );

    mountainCloudMaterial
      .uniforms.uDensity.value =
      mobile
        ? 0.44
        : 0.52;

    mountainCloudMaterial
      .uniforms.uOpacity.value =
      0.74;

    mountainCloudMaterial
      .uniforms.uScale.value =
      mobile ? 3.2 : 4.5;

    transitionCloudMaterial
      .uniforms.uDensity.value =
      0.38;

    transitionCloudMaterial
      .uniforms.uOpacity.value =
      0.82;

    transitionCloudMaterial
      .uniforms.uScale.value =
      mobile ? 2.4 : 3.5;

    foregroundMistMaterial
      .uniforms.uDensity.value =
      0.23;

    foregroundMistMaterial
      .uniforms.uOpacity.value =
      0.56;

    foregroundMistMaterial
      .uniforms.uScale.value =
      mobile ? 3.6 : 5.0;

    const mountainCloud =
      createCloudLayer({
        width: 92,
        height: 15,
        depth: 42,
        y: 3.2,
        z: -34,
        material:
          mountainCloudMaterial,
      });

    const transitionCloud =
      createCloudLayer({
        width: 120,
        height: 21,
        depth: 50,
        y: 5.5,
        z: -13,
        material:
          transitionCloudMaterial,
      });

    const foregroundMist =
      createCloudLayer({
        width: 145,
        height: 16,
        depth: 36,
        y: 0.5,
        z: 10,
        material:
          foregroundMistMaterial,
      });

    cloudGroup.add(
      mountainCloud,
      transitionCloud,
      foregroundMist
    );

    /*
      ----------------------------------------------------------
      STARS
      ----------------------------------------------------------
    */

    const starCount =
      mobile ? 240 : 620;

    const starPositions =
      new Float32Array(
        starCount * 3
      );

    for (
      let index = 0;
      index < starCount;
      index += 1
    ) {
      const i = index * 3;

      starPositions[i] =
        (Math.random() - 0.5) *
        150;

      starPositions[i + 1] =
        Math.random() * 80 +
        6;

      starPositions[i + 2] =
        -Math.random() * 125 -
        18;
    }

    const starGeometry =
      new THREE.BufferGeometry();

    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        starPositions,
        3
      )
    );

    const starMaterial =
      new THREE.PointsMaterial({
        color: "#d8f5ff",
        size: mobile
          ? 0.045
          : 0.065,
        transparent: true,
        opacity: 0.54,
        depthWrite: false,
      });

    const stars =
      new THREE.Points(
        starGeometry,
        starMaterial
      );

    starGroup.add(
      stars
    );

    /*
      ----------------------------------------------------------
      DARK WATER / HORIZON
      ----------------------------------------------------------
    */

    const waterGeometry =
      new THREE.PlaneGeometry(
        140,
        62,
        mobile ? 16 : 28,
        mobile ? 12 : 20
      );

    waterGeometry.rotateX(
      -Math.PI / 2
    );

    const waterMaterial =
      new THREE.MeshPhysicalMaterial({
        color: "#10242b",
        roughness: 0.2,
        metalness: 0.12,
        transmission: 0.04,
        transparent: true,
        opacity: 0.58,
      });

    const water =
      new THREE.Mesh(
        waterGeometry,
        waterMaterial
      );

    water.position.set(
      0,
      -1.72,
      -4
    );

    water.receiveShadow =
      !mobile;

    terrainGroup.add(
      water
    );

    /*
      ----------------------------------------------------------
      ATMOSPHERIC HORIZON GLOW
      ----------------------------------------------------------
    */

    const horizonGeometry =
      new THREE.PlaneGeometry(
        170,
        48
      );

    const horizonMaterial =
      new THREE.MeshBasicMaterial({
        color: "#376b75",
        transparent: true,
        opacity: 0.055,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending:
          THREE.AdditiveBlending,
      });

    const horizon =
      new THREE.Mesh(
        horizonGeometry,
        horizonMaterial
      );

    horizon.position.set(
      0,
      9,
      -66
    );

    atmosphereGroup.add(
      horizon
    );

    /*
      ----------------------------------------------------------
      SCROLL / POINTER STATE
      ----------------------------------------------------------
    */

    let scrollTarget = 0;
    let scrollCurrent = 0;

    let pointerTargetX = 0;
    let pointerTargetY = 0;

    let pointerCurrentX = 0;
    let pointerCurrentY = 0;

    let time = 0;

    const cameraTarget =
      new THREE.Vector3();

    const lookTarget =
      new THREE.Vector3();

    const tempVector =
      new THREE.Vector3();

    const fogColor =
      new THREE.Color(
        "#08151c"
      );

    const warmFogColor =
      new THREE.Color(
        "#10252c"
      );

    const coolFogColor =
      new THREE.Color(
        "#071219"
      );

    const handleScroll =
      () => {
        const maxScroll =
          Math.max(
            1,
            document.documentElement
              .scrollHeight -
              window.innerHeight
          );

        scrollTarget =
          clamp01(
            window.scrollY /
              maxScroll
          );
      };

    const handlePointer =
      (event) => {
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

    const handleResize =
      () => {
        const width =
          host.clientWidth ||
          window.innerWidth;

        const height =
          host.clientHeight ||
          window.innerHeight;

        camera.aspect =
          width / height;

        camera.updateProjectionMatrix();

        renderer.setSize(
          width,
          height,
          false
        );

        renderer.setPixelRatio(
          Math.min(
            window.devicePixelRatio ||
              1,
            mobile ? 1.35 : 1.8
          )
        );
      };

    window.addEventListener(
      "scroll",
      handleScroll,
      {
        passive: true,
      }
    );

    window.addEventListener(
      "pointermove",
      handlePointer,
      {
        passive: true,
      }
    );

    window.addEventListener(
      "pointerleave",
      handlePointerLeave
    );

    window.addEventListener(
      "resize",
      handleResize
    );

    handleScroll();
    handleResize();

    /*
      ----------------------------------------------------------
      ANIMATION LOOP
      ----------------------------------------------------------
    */

    let animationFrame = 0;
    let previousTime =
      performance.now();

    const animate =
      (now) => {
        if (destroyed) {
          return;
        }

        animationFrame =
          requestAnimationFrame(
            animate
          );

        const delta =
          Math.min(
            0.05,
            Math.max(
              0.001,
              (now -
                previousTime) /
                1000
            )
          );

        previousTime = now;

        time += delta;

        const motionScale =
          reducedMotion
            ? 0.12
            : 1;

        scrollCurrent =
          damp(
            scrollCurrent,
            scrollTarget,
            4.5,
            delta
          );

        pointerCurrentX =
          damp(
            pointerCurrentX,
            pointerTargetX,
            4.5,
            delta
          );

        pointerCurrentY =
          damp(
            pointerCurrentY,
            pointerTargetY,
            4.5,
            delta
          );

        const p =
          scrollCurrent;

        /*
          CAMERA JOURNEY

          ARRIVAL
          ↓
          DESCENT
          ↓
          CLOUD
          ↓
          SYSTEMS
          ↓
          HORIZON
        */

        const descent =
          smoothstep(
            0.02,
            0.62,
            p
          );

        const deepJourney =
          smoothstep(
            0.28,
            1,
            p
          );

        cameraTarget.set(
          pointerCurrentX *
            1.45,
          5.8 -
            descent * 4.8 +
            pointerCurrentY *
              0.85,
          30 -
            descent * 42 -
            deepJourney * 18
        );

        camera.position.x =
          damp(
            camera.position.x,
            cameraTarget.x,
            3.2,
            delta
          );

        camera.position.y =
          damp(
            camera.position.y,
            cameraTarget.y,
            3.2,
            delta
          );

        camera.position.z =
          damp(
            camera.position.z,
            cameraTarget.z,
            3.2,
            delta
          );

        lookTarget.set(
          pointerCurrentX *
            0.55,
          2.4 -
            descent * 3.0,
          -24 -
            p * 22
        );

        camera.lookAt(
          lookTarget
        );

        /*
          REAL MOUNTAIN PARALLAX
        */

        distanceGroup.position.x =
          pointerCurrentX * -1.4;

        distanceGroup.position.y =
          Math.sin(
            time * 0.08
          ) *
          0.08 *
          motionScale;

        heroGroup.position.x =
          pointerCurrentX * -0.7;

        heroGroup.position.y =
          Math.sin(
            time * 0.12
          ) *
          0.035 *
          motionScale;

        /*
          TERRAIN TRAVEL
        */

        terrainGroup.position.z =
          -p * 13;

        terrainGroup.rotation.y =
          pointerCurrentX *
          0.006;

        /*
          CLOUD MOVEMENT
        */

        mountainCloud.position.x =
          Math.sin(
            time * 0.012
          ) *
          3;

        transitionCloud.position.x =
          Math.sin(
            time * 0.009 +
              1.7
          ) *
          5;

        foregroundMist.position.x =
          Math.sin(
            time * 0.016 +
              3
          ) *
          4;

        mountainCloudMaterial
          .uniforms.uTime.value =
          time;

        transitionCloudMaterial
          .uniforms.uTime.value =
          time * 0.82;

        foregroundMistMaterial
          .uniforms.uTime.value =
          time * 1.18;

        /*
          CLOUD DENSITY BECOMES THE
          NARRATIVE BRIDGE.

          Early:
          mountain visible.

          Middle:
          atmosphere thickens.

          Deep:
          cloud dominates.

          Late:
          atmosphere opens again.
        */

        const cloudApproach =
          smoothstep(
            0.17,
            0.46,
            p
          );

        const cloudDepth =
          smoothstep(
            0.38,
            0.7,
            p
          );

        const cloudExit =
          smoothstep(
            0.73,
            0.98,
            p
          );

        const density =
          clamp01(
            0.24 +
              cloudApproach *
                0.28 +
              cloudDepth *
                0.38 -
              cloudExit *
                0.48
          );

        mountainCloudMaterial
          .uniforms.uDensity.value =
          density * 0.95;

        transitionCloudMaterial
          .uniforms.uDensity.value =
          density *
          (0.68 +
            cloudDepth *
              0.55);

        foregroundMistMaterial
          .uniforms.uDensity.value =
          0.18 +
          cloudDepth *
            0.22;

        /*
          FOG DEPTH
        */

        const fogStrength =
          0.0046 +
          density *
            (mobile
              ? 0.0055
              : 0.0068);

        scene.fog.density =
          damp(
            scene.fog.density,
            fogStrength,
            3,
            delta
          );

        const fogMix =
          clamp01(
            cloudDepth * 0.8 +
              cloudApproach *
                0.2
          );

        fogColor.lerpColors(
          coolFogColor,
          warmFogColor,
          fogMix
        );

        scene.fog.color.copy(
          fogColor
        );

        /*
          WATER
        */

        water.material.opacity =
          0.5 +
          Math.sin(
            time * 0.18
          ) *
            0.035;

        water.position.y =
          -1.72 +
          Math.sin(
            time * 0.12
          ) *
          0.012 *
          motionScale;

        /*
          STARS
        */

        starGroup.rotation.y =
          time *
          0.002 *
          motionScale;

        starMaterial.opacity =
          0.48 +
          Math.sin(
            time * 0.18
          ) *
            0.08;

        /*
          HORIZON
        */

        horizon.material.opacity =
          0.035 +
          smoothstep(
            0.68,
            1,
            p
          ) *
            0.04;

        /*
          LIGHTING CHANGES WITH DEPTH
        */

        keyLight.intensity =
          2.2 -
          density *
            0.85;

        ambient.intensity =
          1.25 -
          density *
            0.22;

        renderer.render(
          scene,
          camera
        );
      };

    animationFrame =
      requestAnimationFrame(
        animate
      );

    /*
      ----------------------------------------------------------
      CLEANUP
      ----------------------------------------------------------
    */

    return () => {
      destroyed = true;

      cancelAnimationFrame(
        animationFrame
      );

      window.removeEventListener(
        "scroll",
        handleScroll
      );

      window.removeEventListener(
        "pointermove",
        handlePointer
      );

      window.removeEventListener(
        "pointerleave",
        handlePointerLeave
      );

      window.removeEventListener(
        "resize",
        handleResize
      );

      scene.traverse(
        (object) => {
          if (object.geometry) {
            object.geometry.dispose();
          }

          if (object.material) {
            disposeMaterial(
              object.material,
              textureSet
            );
          }
        }
      );

      textureSet.forEach(
        (texture) => {
          if (
            texture &&
            typeof texture.dispose ===
              "function"
          ) {
            texture.dispose();
          }
        }
      );

      if (environmentMap) {
        environmentMap.dispose();
      }

      renderer.dispose();

      if (
        renderer.forceContextLoss
      ) {
        renderer.forceContextLoss();
      }

      if (
        renderer.domElement.parentNode ===
        host
      ) {
        host.removeChild(
          renderer.domElement
        );
      }
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="polar-scene"
      aria-hidden="true"
    />
  );
}