import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

/*
  ANTARCTIC LABS
  PolarScene
  ------------------------------------------------------------
  The physical world behind the interface.

  World stack:

  REAL SKY
      ↓
  OPTIONAL HERO MOUNTAIN / AURORA GLB
      ↓
  REAL CHALAADI DISTANCE
      ↓
  MOUNTAIN CLOUD
      ↓
  DEEP TRANSITION CLOUD
      ↓
  ATMOSPHERIC FOG
      ↓
  REAL SNOW
      ↓
  REAL ICE
      ↓
  REAL ROCK
      ↓
  DARK WATER
      ↓
  CAMERA

  The hero GLB is intentionally optional. When the future
  Aura_Borealis_.blend is converted to:

    /assets/models/mountains/single-mountain-snow.glb

  the scene will automatically attempt to load it.

  If it is not present, the scene remains fully functional.
*/

const ASSETS = {
  sky: "/assets/hdr/daysky-8k-hdr-4k.jpg",

  heroMountain: "/assets/models/mountains/single-mountain-snow.glb",

  distanceMountain: "/assets/models/mountains/chalaadi.fbx",

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

const isMobileDevice = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(max-width: 900px)").matches ||
    window.matchMedia("(pointer: coarse)").matches);

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const smoothstep = (edge0, edge1, value) => {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
};

const damp = (current, target, lambda, delta) => {
  return THREE.MathUtils.lerp(
    current,
    target,
    1 - Math.exp(-lambda * delta),
  );
};

const disposeMaterial = (material, textureSet) => {
  if (!material) return;

  const materials = Array.isArray(material) ? material : [material];

  materials.forEach((mat) => {
    if (!mat) return;

    Object.keys(mat).forEach((key) => {
      const value = mat[key];

      if (
        value &&
        value.isTexture &&
        textureSet &&
        !textureSet.has(value)
      ) {
        value.dispose();
      }
    });

    mat.dispose();
  });
};

const disposeObject = (object, textureSet = new Set()) => {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (child.material) {
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      materials.forEach((material) => {
        if (!material) return;

        Object.values(material).forEach((value) => {
          if (value && value.isTexture) {
            textureSet.add(value);
          }
        });

        disposeMaterial(material, textureSet);
      });
    }
  });
};

/* -------------------------------------------------------------------------- */
/* CLOUD SHADER                                                               */
/* -------------------------------------------------------------------------- */

const CLOUD_VERTEX = `
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  varying float vHeight;

  uniform float uTime;
  uniform float uWind;
  uniform float uScale;

  void main() {
    vUv = uv;

    vec3 transformed = position;

    float waveA =
      sin((position.x + uTime * uWind) * 0.42) *
      0.55;

    float waveB =
      sin((position.z - uTime * uWind * 0.72) * 0.31) *
      0.42;

    float waveC =
      sin((position.x + position.z + uTime * uWind * 0.38) * 0.17) *
      0.25;

    transformed.y += (waveA + waveB + waveC) * uScale;

    vec4 worldPosition =
      modelMatrix *
      vec4(transformed, 1.0);

    vWorldPosition = worldPosition.xyz;

    vHeight = transformed.y;

    gl_Position =
      projectionMatrix *
      viewMatrix *
      worldPosition;
  }
`;

const CLOUD_FRAGMENT = `
  precision highp float;

  varying vec3 vWorldPosition;
  varying vec2 vUv;
  varying float vHeight;

  uniform float uTime;
  uniform float uDensity;
  uniform float uOpacity;
  uniform float uWind;
  uniform vec3 uColor;
  uniform vec3 uLightColor;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
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

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 5; i++) {
      value += noise(p) * amplitude;
      p *= 2.03;
      amplitude *= 0.5;
    }

    return value;
  }

  void main() {
    vec2 windOffset =
      vec2(
        uTime * uWind * 0.018,
        -uTime * uWind * 0.009
      );

    vec2 p = vUv * 4.2 + windOffset;

    float broad = fbm(p * 0.65);
    float detail = fbm(p * 2.0 + 17.4);

    float cloudShape =
      smoothstep(
        0.30,
        0.72,
        broad * 0.78 + detail * 0.22
      );

    float edgeFadeX =
      smoothstep(0.0, 0.14, vUv.x) *
      smoothstep(1.0, 0.86, vUv.x);

    float edgeFadeY =
      smoothstep(0.0, 0.18, vUv.y) *
      smoothstep(1.0, 0.82, vUv.y);

    float verticalShape =
      smoothstep(0.0, 0.18, vUv.y) *
      smoothstep(1.0, 0.68, vUv.y);

    float density =
      cloudShape *
      edgeFadeX *
      edgeFadeY *
      verticalShape *
      uDensity;

    float lightNoise =
      fbm(p * 0.42 + vec2(8.0, -4.0));

    vec3 finalColor =
      mix(
        uColor,
        uLightColor,
        smoothstep(0.35, 0.9, lightNoise)
      );

    float alpha =
      density *
      uOpacity;

    if (alpha < 0.012) {
      discard;
    }

    gl_FragColor =
      vec4(finalColor, alpha);
  }
`;

function createCloudLayer({
  width,
  depth,
  height,
  y,
  opacity,
  density,
  color,
  lightColor,
  wind,
  scale,
}) {
  const geometry = new THREE.PlaneGeometry(
    width,
    depth,
    32,
    32,
  );

  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDensity: { value: density },
      uOpacity: { value: opacity },
      uWind: { value: wind },
      uScale: { value: scale },
      uColor: {
        value: new THREE.Color(color),
      },
      uLightColor: {
        value: new THREE.Color(lightColor),
      },
    },

    vertexShader: CLOUD_VERTEX,
    fragmentShader: CLOUD_FRAGMENT,

    transparent: true,
    depthWrite: false,
    depthTest: true,

    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });

  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.y = y;
  mesh.position.z = -height;

  return mesh;
}

/* -------------------------------------------------------------------------- */
/* POLAR SCENE                                                                */
/* -------------------------------------------------------------------------- */

export default function PolarScene() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) return undefined;

    let disposed = false;
    let animationFrame = 0;

    const mobile = isMobileDevice();

    /* ---------------------------------------------------------------------- */
    /* RENDERER                                                               */
    /* ---------------------------------------------------------------------- */

    const renderer = new THREE.WebGLRenderer({
      antialias: !mobile,
      alpha: true,
      powerPreference: "high-performance",
      logarithmicDepthBuffer: false,
    });

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        mobile ? 1.35 : 1.8,
      ),
    );

    renderer.setSize(
      window.innerWidth,
      window.innerHeight,
      false,
    );

    renderer.outputColorSpace = THREE.SRGBColorSpace;

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = mobile ? 0.86 : 0.94;

    renderer.shadowMap.enabled = !mobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.domElement.setAttribute(
      "aria-hidden",
      "true",
    );

    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.pointerEvents = "none";

    host.appendChild(renderer.domElement);

    /* ---------------------------------------------------------------------- */
    /* SCENE                                                                  */
    /* ---------------------------------------------------------------------- */

    const scene = new THREE.Scene();

    scene.background = new THREE.Color("#071018");

    scene.fog = new THREE.FogExp2(
      new THREE.Color("#9db7c5"),
      mobile ? 0.00082 : 0.00067,
    );

    /* ---------------------------------------------------------------------- */
    /* CAMERA                                                                 */
    /* ---------------------------------------------------------------------- */

    const camera = new THREE.PerspectiveCamera(
      mobile ? 46 : 42,
      window.innerWidth / window.innerHeight,
      0.1,
      18000,
    );

    camera.position.set(
      0,
      mobile ? 8 : 7,
      mobile ? 42 : 38,
    );

    camera.rotation.order = "YXZ";

    /* ---------------------------------------------------------------------- */
    /* LIGHTING                                                               */
    /* ---------------------------------------------------------------------- */

    const hemisphereLight = new THREE.HemisphereLight(
      new THREE.Color("#dbeaf0"),
      new THREE.Color("#071018"),
      mobile ? 1.15 : 1.35,
    );

    scene.add(hemisphereLight);

    const keyLight = new THREE.DirectionalLight(
      new THREE.Color("#e7f5ff"),
      mobile ? 1.15 : 1.45,
    );

    keyLight.position.set(
      -900,
      1300,
      900,
    );

    keyLight.castShadow = !mobile;

    if (!mobile) {
      keyLight.shadow.mapSize.set(
        1024,
        1024,
      );

      keyLight.shadow.camera.near = 50;
      keyLight.shadow.camera.far = 4000;

      keyLight.shadow.camera.left = -1800;
      keyLight.shadow.camera.right = 1800;
      keyLight.shadow.camera.top = 1800;
      keyLight.shadow.camera.bottom = -1800;
    }

    scene.add(keyLight);

    const coldFill = new THREE.DirectionalLight(
      new THREE.Color("#8ebbd1"),
      mobile ? 0.42 : 0.55,
    );

    coldFill.position.set(
      1000,
      420,
      -1400,
    );

    scene.add(coldFill);

    /* ---------------------------------------------------------------------- */
    /* TEXTURES                                                               */
    /* ---------------------------------------------------------------------- */

    const textureLoader = new THREE.TextureLoader();
    const loadingTextures = new Set();

    const loadTexture = (url) =>
      new Promise((resolve) => {
        textureLoader.load(
          url,
          (texture) => {
            if (disposed) {
              texture.dispose();
              resolve(null);
              return;
            }

            texture.colorSpace = THREE.NoColorSpace;

            loadingTextures.add(texture);

            resolve(texture);
          },
          undefined,
          () => {
            resolve(null);
          },
        );
      });

    const loadColorTexture = (url) =>
      new Promise((resolve) => {
        textureLoader.load(
          url,
          (texture) => {
            if (disposed) {
              texture.dispose();
              resolve(null);
              return;
            }

            texture.colorSpace =
              THREE.SRGBColorSpace;

            loadingTextures.add(texture);

            resolve(texture);
          },
          undefined,
          () => {
            resolve(null);
          },
        );
      });

    /* ---------------------------------------------------------------------- */
    /* SKY                                                                    */
    /* ---------------------------------------------------------------------- */

    let skyMesh = null;
    let environmentMap = null;

    const loadSky = async () => {
      try {
        const texture = await loadColorTexture(
          ASSETS.sky,
        );

        if (!texture || disposed) return;

        texture.mapping =
          THREE.EquirectangularReflectionMapping;

        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;

        /*
          The supplied sky is an LDR tonemapped JPEG.
          It works both as a visible background and as an
          approximate environment source.
        */

        scene.background = texture;

        const pmrem = new THREE.PMREMGenerator(
          renderer,
        );

        pmrem.compileEquirectangularShader();

        environmentMap =
          pmrem.fromEquirectangular(texture)
            .texture;

        scene.environment = environmentMap;

        pmrem.dispose();
      } catch {
        // Keep the dark polar fallback background.
      }
    };

    loadSky();

    /* ---------------------------------------------------------------------- */
    /* WORLD GROUPS                                                           */
    /* ---------------------------------------------------------------------- */

    const world = new THREE.Group();
    world.name = "AntarcticWorld";

    const heroGroup = new THREE.Group();
    heroGroup.name = "HeroMountain";

    const distanceGroup = new THREE.Group();
    distanceGroup.name = "DistanceMountain";

    const terrainGroup = new THREE.Group();
    terrainGroup.name = "Terrain";

    const cloudGroup = new THREE.Group();
    cloudGroup.name = "CloudSystem";

    const atmosphereGroup = new THREE.Group();
    atmosphereGroup.name = "Atmosphere";

    world.add(
      heroGroup,
      distanceGroup,
      terrainGroup,
      cloudGroup,
      atmosphereGroup,
    );

    scene.add(world);

    /* ---------------------------------------------------------------------- */
    /* HERO MOUNTAIN / AURORA GLB                                             */
    /* ---------------------------------------------------------------------- */

    const gltfLoader = new GLTFLoader();

    const loadHeroMountain = () => {
      gltfLoader.load(
        ASSETS.heroMountain,
        (gltf) => {
          if (disposed) {
            disposeObject(gltf.scene);
            return;
          }

          const model = gltf.scene;

          model.name = "HeroMountainOptional";

          /*
            The exact transform is intentionally conservative.
            The exported GLB should preserve its own modeling
            scale and hierarchy. We normalize only the broad
            footprint so the asset behaves consistently.
          */

          const box = new THREE.Box3().setFromObject(
            model,
          );

          const size = box.getSize(
            new THREE.Vector3(),
          );

          if (size.y > 0) {
            const desiredHeight = mobile
              ? 115
              : 150;

            const scale =
              desiredHeight / size.y;

            model.scale.multiplyScalar(scale);
          }

          const normalizedBox =
            new THREE.Box3().setFromObject(model);

          const center =
            normalizedBox.getCenter(
              new THREE.Vector3(),
            );

          model.position.x -= center.x;
          model.position.z -= center.z;

          model.position.y -=
            normalizedBox.min.y;

          model.position.y += mobile
            ? -2
            : 0;

          model.position.z = -115;

          model.traverse((child) => {
            if (!child.isMesh) return;

            child.frustumCulled = true;

            if (child.material) {
              const materials =
                Array.isArray(child.material)
                  ? child.material
                  : [child.material];

              materials.forEach((material) => {
                material.envMapIntensity =
                  0.75;

                material.needsUpdate = true;
              });
            }

            if (!mobile) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          heroGroup.add(model);
        },
        undefined,
        () => {
          /*
            Expected during the current build because the
            Aura_Borealis_.blend source has not yet been
            converted into the runtime GLB.

            This is intentionally a silent optional asset.
          */
        },
      );
    };

    loadHeroMountain();

    /* ---------------------------------------------------------------------- */
    /* DISTANCE MOUNTAIN                                                      */
    /* ---------------------------------------------------------------------- */

    const fbxLoader = new FBXLoader();

    fbxLoader.load(
      ASSETS.distanceMountain,
      (model) => {
        if (disposed) {
          disposeObject(model);
          return;
        }

        model.name = "ChalaadiDistance";

        const box = new THREE.Box3().setFromObject(
          model,
        );

        const size = box.getSize(
          new THREE.Vector3(),
        );

        if (size.y > 0) {
          const targetHeight = mobile
            ? 125
            : 165;

          const scale =
            targetHeight / size.y;

          model.scale.multiplyScalar(scale);
        }

        const normalizedBox =
          new THREE.Box3().setFromObject(model);

        const center =
          normalizedBox.getCenter(
            new THREE.Vector3(),
          );

        model.position.x -= center.x;
        model.position.z -= center.z;

        model.position.y -=
          normalizedBox.min.y;

        model.position.z = -275;

        model.traverse((child) => {
          if (!child.isMesh) return;

          child.frustumCulled = true;

          if (child.material) {
            const materials =
              Array.isArray(child.material)
                ? child.material
                : [child.material];

            materials.forEach((material) => {
              material.color.multiplyScalar(
                0.82,
              );

              material.roughness =
                Math.max(
                  material.roughness ?? 0.8,
                  0.72,
                );

              material.envMapIntensity =
                0.5;

              material.needsUpdate = true;
            });
          }
        });

        distanceGroup.add(model);
      },
      undefined,
      () => {
        // Distance mountain is allowed to fail gracefully.
      },
    );

    /* ---------------------------------------------------------------------- */
    /* ICE TERRAIN                                                            */
    /* ---------------------------------------------------------------------- */

    const createIceTerrain = async () => {
      const [
        color,
        normal,
        roughness,
        displacement,
      ] = await Promise.all([
        loadColorTexture(ASSETS.ice.color),
        loadTexture(ASSETS.ice.normal),
        loadTexture(ASSETS.ice.roughness),
        loadTexture(ASSETS.ice.displacement),
      ]);

      if (disposed) return;

      const geometry =
        new THREE.PlaneGeometry(
          mobile ? 900 : 1150,
          mobile ? 1600 : 1900,
          mobile ? 100 : 150,
          mobile ? 150 : 190,
        );

      geometry.rotateX(-Math.PI / 2);

      if (displacement) {
        const position =
          geometry.attributes.position;

        const displacementScale =
          mobile ? 0.85 : 1.25;

        for (
          let i = 0;
          i < position.count;
          i += 1
        ) {
          const x = position.getX(i);
          const z = position.getZ(i);

          const broad =
            Math.sin(x * 0.013) *
            Math.cos(z * 0.009);

          const fine =
            Math.sin(x * 0.046 + z * 0.027) *
            0.28;

          position.setY(
            i,
            (broad * 0.75 + fine) *
              displacementScale,
          );
        }

        position.needsUpdate = true;
        geometry.computeVertexNormals();
      }

      const material =
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#b9d3df"),

          map: color || null,

          normalMap: normal || null,

          roughnessMap: roughness || null,

          roughness: 0.74,

          metalness: 0.025,

          envMapIntensity: 0.72,

          displacementMap: null,

          displacementScale: 0,

          side: THREE.DoubleSide,
        });

      const mesh = new THREE.Mesh(
        geometry,
        material,
      );

      mesh.name = "RealIceTerrain";

      mesh.position.y = -2;
      mesh.position.z = -130;

      mesh.receiveShadow = !mobile;
      mesh.castShadow = false;

      terrainGroup.add(mesh);
    };

    createIceTerrain();

    /* ---------------------------------------------------------------------- */
    /* SNOW PATCH                                                             */
    /* ---------------------------------------------------------------------- */

    const createSnowField = async () => {
      const [
        color,
        normal,
        roughness,
        ao,
      ] = await Promise.all([
        loadColorTexture(ASSETS.snow.color),
        loadTexture(ASSETS.snow.normal),
        loadTexture(ASSETS.snow.roughness),
        loadTexture(ASSETS.snow.ao),
      ]);

      if (disposed) return;

      const geometry =
        new THREE.PlaneGeometry(
          mobile ? 600 : 760,
          mobile ? 920 : 1150,
          mobile ? 70 : 100,
          mobile ? 90 : 125,
        );

      geometry.rotateX(-Math.PI / 2);

      const material =
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#dbeaf0"),

          map: color || null,

          normalMap: normal || null,

          roughnessMap: roughness || null,

          aoMap: ao || null,

          roughness: 0.88,

          metalness: 0,

          envMapIntensity: 0.45,

          side: THREE.DoubleSide,
        });

      const mesh = new THREE.Mesh(
        geometry,
        material,
      );

      mesh.name = "RealSnowField";

      mesh.position.y = 0.35;
      mesh.position.z = -112;

      mesh.rotation.y = 0.08;

      mesh.receiveShadow = !mobile;

      terrainGroup.add(mesh);
    };

    createSnowField();

    /* ---------------------------------------------------------------------- */
    /* ROCK OUTCROP                                                           */
    /* ---------------------------------------------------------------------- */

    const createRockOutcrop = async () => {
      const [
        color,
        normal,
        roughness,
        ao,
      ] = await Promise.all([
        loadColorTexture(ASSETS.rock.color),
        loadTexture(ASSETS.rock.normal),
        loadTexture(ASSETS.rock.roughness),
        loadTexture(ASSETS.rock.ao),
      ]);

      if (disposed) return;

      const geometry =
        new THREE.DodecahedronGeometry(
          mobile ? 19 : 24,
          2,
        );

      const material =
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#34434b"),

          map: color || null,

          normalMap: normal || null,

          roughnessMap: roughness || null,

          aoMap: ao || null,

          roughness: 0.92,

          metalness: 0.02,

          envMapIntensity: 0.34,
        });

      const rockA = new THREE.Mesh(
        geometry,
        material,
      );

      rockA.name = "RealRockOutcrop";

      rockA.position.set(
        mobile ? -46 : -72,
        5,
        -28,
      );

      rockA.scale.set(
        1.7,
        0.9,
        1.15,
      );

      rockA.rotation.set(
        0.15,
        -0.48,
        0.08,
      );

      rockA.castShadow = !mobile;
      rockA.receiveShadow = !mobile;

      terrainGroup.add(rockA);

      const rockB =
        new THREE.Mesh(
          geometry.clone(),
          material.clone(),
        );

      rockB.position.set(
        mobile ? 48 : 92,
        3,
        -58,
      );

      rockB.scale.set(
        1.2,
        0.7,
        1.5,
      );

      rockB.rotation.set(
        -0.08,
        0.8,
        0.12,
      );

      rockB.castShadow = !mobile;
      rockB.receiveShadow = !mobile;

      terrainGroup.add(rockB);
    };

    createRockOutcrop();

    /* ---------------------------------------------------------------------- */
    /* DARK WATER / HORIZON                                                    */
    /* ---------------------------------------------------------------------- */

    const waterGeometry =
      new THREE.PlaneGeometry(
        mobile ? 900 : 1200,
        mobile ? 900 : 1200,
        40,
        40,
      );

    waterGeometry.rotateX(-Math.PI / 2);

    const waterMaterial =
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#08141b"),
        roughness: 0.32,
        metalness: 0.12,
        envMapIntensity: 0.6,
        transparent: true,
        opacity: 0.88,
      });

    const water =
      new THREE.Mesh(
        waterGeometry,
        waterMaterial,
      );

    water.name = "DarkPolarWater";

    water.position.y = -6.8;
    water.position.z = -390;

    terrainGroup.add(water);

    /* ---------------------------------------------------------------------- */
    /* CLOUD SYSTEM                                                           */
    /* ---------------------------------------------------------------------- */

    const mountainCloud = createCloudLayer({
      width: mobile ? 680 : 920,
      depth: mobile ? 820 : 1080,
      height: 0,
      y: 27,
      opacity: mobile ? 0.31 : 0.34,
      density: mobile ? 0.92 : 0.86,
      color: "#b8c9d0",
      lightColor: "#eaf5f6",
      wind: 0.78,
      scale: mobile ? 1.5 : 1.8,
    });

    mountainCloud.position.z = -125;

    mountainCloud.renderOrder = 3;

    cloudGroup.add(mountainCloud);

    const transitionCloud = createCloudLayer({
      width: mobile ? 920 : 1250,
      depth: mobile ? 1050 : 1450,
      height: 0,
      y: 7,
      opacity: mobile ? 0.54 : 0.58,
      density: mobile ? 1.0 : 0.94,
      color: "#81959e",
      lightColor: "#d9e8eb",
      wind: 0.54,
      scale: mobile ? 2.4 : 2.8,
    });

    transitionCloud.position.z = -330;

    transitionCloud.renderOrder = 4;

    cloudGroup.add(transitionCloud);

    const foregroundMist = createCloudLayer({
      width: mobile ? 700 : 980,
      depth: mobile ? 650 : 880,
      height: 0,
      y: 2,
      opacity: mobile ? 0.2 : 0.23,
      density: mobile ? 0.66 : 0.6,
      color: "#6f858e",
      lightColor: "#d0e0e4",
      wind: 1.08,
      scale: mobile ? 1.15 : 1.35,
    });

    foregroundMist.position.z = -45;

    foregroundMist.renderOrder = 5;

    cloudGroup.add(foregroundMist);

    const cloudLayers = [
      mountainCloud,
      transitionCloud,
      foregroundMist,
    ];

    /* ---------------------------------------------------------------------- */
    /* POLAR AURORA BACKDROP                                                   */
    /* ---------------------------------------------------------------------- */

    /*
      This is deliberately restrained.

      The final hero aurora belongs to the optional real GLB
      from Aura_Borealis_.blend. This procedural layer only
      prevents the current build from feeling visually empty
      while that asset is unavailable.

      It is not a fake mountain and it does not replace the
      future hero asset.
    */

    const auroraGeometry =
      new THREE.PlaneGeometry(
        mobile ? 500 : 720,
        mobile ? 260 : 360,
        mobile ? 20 : 28,
        mobile ? 14 : 20,
      );

    const auroraMaterial =
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: {
            value: 0,
          },

          uOpacity: {
            value: mobile ? 0.075 : 0.095,
          },

          uColorA: {
            value: new THREE.Color(
              "#66d8d1",
            ),
          },

          uColorB: {
            value: new THREE.Color(
              "#6388dd",
            ),
          },
        },

        vertexShader: `
          varying vec2 vUv;

          uniform float uTime;

          void main() {
            vUv = uv;

            vec3 p = position;

            float wave =
              sin(
                p.x * 0.024 +
                uTime * 0.15
              ) *
              12.0;

            wave +=
              sin(
                p.x * 0.057 -
                uTime * 0.09
              ) *
              5.0;

            p.y +=
              wave *
              smoothstep(
                0.0,
                1.0,
                uv.y
              );

            vec4 world =
              modelMatrix *
              vec4(p, 1.0);

            gl_Position =
              projectionMatrix *
              viewMatrix *
              world;
          }
        `,

        fragmentShader: `
          varying vec2 vUv;

          uniform float uOpacity;
          uniform vec3 uColorA;
          uniform vec3 uColorB;

          void main() {
            float edge =
              smoothstep(
                0.0,
                0.22,
                vUv.y
              ) *
              smoothstep(
                1.0,
                0.55,
                vUv.y
              );

            float bands =
              sin(
                vUv.x * 18.0 +
                vUv.y * 5.0
              ) *
              0.5 +
              0.5;

            vec3 color =
              mix(
                uColorA,
                uColorB,
                bands
              );

            float alpha =
              edge *
              uOpacity;

            gl_FragColor =
              vec4(color, alpha);
          }
        `,

        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

    const aurora =
      new THREE.Mesh(
        auroraGeometry,
        auroraMaterial,
      );

    aurora.name =
      "TemporaryAuroraAtmosphere";

    aurora.position.set(
      0,
      mobile ? 105 : 125,
      -510,
    );

    aurora.rotation.x = -0.08;

    atmosphereGroup.add(aurora);

    /* ---------------------------------------------------------------------- */
    /* STARS                                                                   */
    /* ---------------------------------------------------------------------- */

    const starCount = mobile ? 380 : 850;

    const starPositions =
      new Float32Array(
        starCount * 3,
      );

    for (
      let i = 0;
      i < starCount;
      i += 1
    ) {
      const radius =
        850 +
        Math.random() * 700;

      const angle =
        Math.random() *
        Math.PI *
        2;

      const height =
        180 +
        Math.random() *
        500;

      starPositions[i * 3] =
        Math.cos(angle) * radius;

      starPositions[i * 3 + 1] =
        height;

      starPositions[i * 3 + 2] =
        Math.sin(angle) * radius -
        600;
    }

    const starGeometry =
      new THREE.BufferGeometry();

    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        starPositions,
        3,
      ),
    );

    const starMaterial =
      new THREE.PointsMaterial({
        color: new THREE.Color(
          "#d9edf4",
        ),
        size: mobile ? 0.9 : 1.15,
        sizeAttenuation: true,
        transparent: true,
        opacity: mobile ? 0.34 : 0.46,
        depthWrite: false,
      });

    const stars =
      new THREE.Points(
        starGeometry,
        starMaterial,
      );

    stars.name = "PolarStars";

    atmosphereGroup.add(stars);

    /* ---------------------------------------------------------------------- */
    /* SCROLL / WORLD TIMELINE                                                 */
    /* ---------------------------------------------------------------------- */

    const scrollState = {
      current: 0,
      target: 0,
    };

    const updateScrollTarget = () => {
      const maxScroll =
        Math.max(
          document.documentElement
            .scrollHeight -
            window.innerHeight,
          1,
        );

      scrollState.target =
        clamp01(
          window.scrollY / maxScroll,
        );
    };

    updateScrollTarget();

    window.addEventListener(
      "scroll",
      updateScrollTarget,
      {
        passive: true,
      },
    );

    /* ---------------------------------------------------------------------- */
    /* MOUSE / POINTER                                                         */
    /* ---------------------------------------------------------------------- */

    const pointer = {
      currentX: 0,
      currentY: 0,
      targetX: 0,
      targetY: 0,
    };

    const onPointerMove = (event) => {
      if (mobile) return;

      pointer.targetX =
        (event.clientX /
          window.innerWidth -
          0.5) *
        2;

      pointer.targetY =
        (event.clientY /
          window.innerHeight -
          0.5) *
        2;
    };

    window.addEventListener(
      "pointermove",
      onPointerMove,
      {
        passive: true,
      },
    );

    /* ---------------------------------------------------------------------- */
    /* RESIZE                                                                  */
    /* ---------------------------------------------------------------------- */

    const onResize = () => {
      if (disposed) return;

      const width =
        window.innerWidth;

      const height =
        window.innerHeight;

      camera.aspect =
        width / height;

      camera.updateProjectionMatrix();

      renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio || 1,
          mobile ? 1.35 : 1.8,
        ),
      );

      renderer.setSize(
        width,
        height,
        false,
      );

      updateScrollTarget();
    };

    window.addEventListener(
      "resize",
      onResize,
    );

    /* ---------------------------------------------------------------------- */
    /* ANIMATION                                                               */
    /* ---------------------------------------------------------------------- */

    const clock = new THREE.Clock();

    const animate = () => {
      if (disposed) return;

      animationFrame =
        requestAnimationFrame(
          animate,
        );

      const delta =
        Math.min(
          clock.getDelta(),
          0.05,
        );

      const elapsed =
        clock.elapsedTime;

      scrollState.current =
        damp(
          scrollState.current,
          scrollState.target,
          4.2,
          delta,
        );

      pointer.currentX =
        damp(
          pointer.currentX,
          pointer.targetX,
          3.0,
          delta,
        );

      pointer.currentY =
        damp(
          pointer.currentY,
          pointer.targetY,
          3.0,
          delta,
        );

      const progress =
        scrollState.current;

      /* -------------------------------------------------------------------- */
      /* WORLD PHASES                                                         */
      /* -------------------------------------------------------------------- */

      const arrival =
        smoothstep(
          0.0,
          0.18,
          progress,
        );

      const descent =
        smoothstep(
          0.12,
          0.46,
          progress,
        );

      const cloudEntry =
        smoothstep(
          0.31,
          0.51,
          progress,
        );

      const cloudExit =
        smoothstep(
          0.48,
          0.68,
          progress,
        );

      const systemsPhase =
        smoothstep(
          0.52,
          0.76,
          progress,
        );

      const horizon =
        smoothstep(
          0.74,
          1.0,
          progress,
        );

      /* -------------------------------------------------------------------- */
      /* CAMERA                                                               */
      /* -------------------------------------------------------------------- */

      const cameraTargetX =
        pointer.currentX *
        (mobile ? 0.55 : 1.45);

      const cameraTargetY =
        (mobile ? 5.8 : 6.8) -
        descent * 9.5 +
        horizon * 4.0;

      const cameraTargetZ =
        (mobile ? 43 : 39) -
        descent * 24 -
        cloudEntry * 22 +
        cloudExit * 28 +
        horizon * 18;

      camera.position.x =
        damp(
          camera.position.x,
          cameraTargetX,
          2.5,
          delta,
        );

      camera.position.y =
        damp(
          camera.position.y,
          cameraTargetY +
            pointer.currentY *
              (mobile ? -0.7 : -1.2),
          2.7,
          delta,
        );

      camera.position.z =
        damp(
          camera.position.z,
          cameraTargetZ,
          2.7,
          delta,
        );

      const lookX =
        pointer.currentX *
        (mobile ? 0.5 : 1.0);

      const lookY =
        13 -
        descent * 4.0 +
        horizon * 7.0;

      const lookZ =
        -95 -
        cloudEntry * 70 +
        cloudExit * 65;

      const lookTarget =
        new THREE.Vector3(
          lookX,
          lookY,
          lookZ,
        );

      const lookQuaternion =
        new THREE.Quaternion();

      const lookMatrix =
        new THREE.Matrix4();

      lookMatrix.lookAt(
        camera.position,
        lookTarget,
        camera.up,
      );

      lookQuaternion.setFromRotationMatrix(
        lookMatrix,
      );

      camera.quaternion.slerp(
        lookQuaternion,
        1 -
          Math.exp(
            -3.1 * delta,
          ),
      );

      /* -------------------------------------------------------------------- */
      /* HERO MOUNTAIN                                                         */
      /* -------------------------------------------------------------------- */

      heroGroup.position.x =
        Math.sin(elapsed * 0.035) *
        0.9;

      heroGroup.position.y =
        horizon * 1.8;

      heroGroup.rotation.y =
        Math.sin(elapsed * 0.025) *
        0.008;

      heroGroup.visible = true;

      /* -------------------------------------------------------------------- */
      /* DISTANCE MOUNTAIN                                                     */
      /* -------------------------------------------------------------------- */

      distanceGroup.position.x =
        Math.sin(
          elapsed * 0.018,
        ) *
        2.2;

      distanceGroup.position.y =
        descent * -4.5 +
        horizon * 3.0;

      distanceGroup.rotation.y =
        pointer.currentX *
        0.018;

      /* -------------------------------------------------------------------- */
      /* CLOUD MOTION                                                          */
      /* -------------------------------------------------------------------- */

      cloudLayers.forEach(
        (cloud, index) => {
          const material =
            cloud.material;

          if (
            !material ||
            !material.uniforms
          ) {
            return;
          }

          material.uniforms.uTime.value =
            elapsed;

          const depthFactor =
            index === 0
              ? 0.8
              : index === 1
                ? 1.15
                : 1.45;

          material.uniforms.uWind.value =
            depthFactor;

          const phaseOpacity =
            index === 0
              ? 0.22 + cloudEntry * 0.35
              : index === 1
                ? 0.18 +
                  cloudEntry * 0.88 -
                  cloudExit * 0.82
                : 0.16 +
                  cloudEntry * 0.32 -
                  cloudExit * 0.28;

          material.uniforms.uOpacity.value =
            Math.max(
              0.045,
              phaseOpacity,
            );

          cloud.position.x =
            Math.sin(
              elapsed *
                (0.011 +
                  index * 0.004),
            ) *
            (index === 1
              ? 16
              : 9);

          cloud.position.z =
            cloud.position.z +
            0;

          cloud.rotation.z =
            Math.sin(
              elapsed * 0.013 +
                index,
            ) *
            0.004;
        },
      );

      /* -------------------------------------------------------------------- */
      /* ATMOSPHERIC FOG                                                       */
      /* -------------------------------------------------------------------- */

      const fogColor =
        new THREE.Color();

      fogColor.setHSL(
        0.55,
        0.16,
        THREE.MathUtils.lerp(
          0.47,
          0.64,
          horizon,
        ),
      );

      scene.fog.color.copy(
        fogColor,
      );

      const baseFog =
        mobile
          ? 0.00082
          : 0.00067;

      const cloudFog =
        cloudEntry *
        0.00072;

      const exitReduction =
        cloudExit *
        0.00044;

      scene.fog.density =
        Math.max(
          0.00028,
          baseFog +
            cloudFog -
            exitReduction,
        );

      /* -------------------------------------------------------------------- */
      /* TERRAIN MOTION                                                        */
      /* -------------------------------------------------------------------- */

      terrainGroup.position.z =
        descent * -15 +
        horizon * 18;

      terrainGroup.position.x =
        pointer.currentX * 2.5;

      terrainGroup.rotation.y =
        pointer.currentX *
        0.008;

      /* -------------------------------------------------------------------- */
      /* WATER                                                                  */
      /* -------------------------------------------------------------------- */

      water.material.opacity =
        0.72 +
        horizon * 0.16;

      water.position.y =
        -6.8 +
        Math.sin(
          elapsed * 0.22,
        ) *
        0.08;

      /* -------------------------------------------------------------------- */
      /* AURORA                                                                 */
      /* -------------------------------------------------------------------- */

      if (
        auroraMaterial.uniforms
      ) {
        auroraMaterial.uniforms.uTime.value =
          elapsed;

        auroraMaterial.uniforms.uOpacity.value =
          (mobile ? 0.045 : 0.06) +
          arrival *
            (mobile
              ? 0.025
              : 0.04) +
          horizon *
            (mobile
              ? 0.02
              : 0.035);
      }

      aurora.position.x =
        pointer.currentX *
        14;

      aurora.position.y =
        105 +
        Math.sin(
          elapsed * 0.03,
        ) *
        2;

      /* -------------------------------------------------------------------- */
      /* STARS                                                                  */
      /* -------------------------------------------------------------------- */

      stars.rotation.y =
        elapsed * 0.004;

      stars.material.opacity =
        (mobile ? 0.25 : 0.36) +
        horizon *
          (mobile ? 0.12 : 0.18);

      /* -------------------------------------------------------------------- */
      /* LIGHTING                                                               */
      /* -------------------------------------------------------------------- */

      keyLight.intensity =
        (mobile ? 1.0 : 1.22) +
        arrival * 0.16 +
        horizon * 0.18;

      coldFill.intensity =
        (mobile ? 0.32 : 0.42) +
        cloudEntry * 0.08;

      hemisphereLight.intensity =
        (mobile ? 1.02 : 1.18) +
        horizon * 0.15;

      /* -------------------------------------------------------------------- */
      /* RENDER                                                                 */
      /* -------------------------------------------------------------------- */

      renderer.render(
        scene,
        camera,
      );
    };

    animate();

    /* ---------------------------------------------------------------------- */
    /* CLEANUP                                                                 */
    /* ---------------------------------------------------------------------- */

    return () => {
      disposed = true;

      cancelAnimationFrame(
        animationFrame,
      );

      window.removeEventListener(
        "scroll",
        updateScrollTarget,
      );

      window.removeEventListener(
        "pointermove",
        onPointerMove,
      );

      window.removeEventListener(
        "resize",
        onResize,
      );

      cloudLayers.forEach(
        (cloud) => {
          if (cloud.geometry) {
            cloud.geometry.dispose();
          }

          if (cloud.material) {
            cloud.material.dispose();
          }
        },
      );

      if (auroraGeometry) {
        auroraGeometry.dispose();
      }

      if (auroraMaterial) {
        auroraMaterial.dispose();
      }

      if (starGeometry) {
        starGeometry.dispose();
      }

      if (starMaterial) {
        starMaterial.dispose();
      }

      disposeObject(
        world,
        loadingTextures,
      );

      loadingTextures.forEach(
        (texture) => {
          texture.dispose();
        },
      );

      if (environmentMap) {
        environmentMap.dispose();
      }

      scene.environment = null;
      scene.background = null;

      renderer.dispose();
      renderer.forceContextLoss();

      if (
        renderer.domElement &&
        renderer.domElement.parentNode ===
          host
      ) {
        host.removeChild(
          renderer.domElement,
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