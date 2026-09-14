import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const MODEL_URL = "/assets/models/mountains/chalaadi.fbx";
const ENVIRONMENT_URL = "/assets/hdr/daysky-8k-hdr-4k.jpg";

const ASSETS = {
  iceColor: "/assets/textures/ice/ice-color.png",
  iceNormal: "/assets/textures/ice/ice-normal.jpg",
  iceRoughness: "/assets/textures/ice/ice-roughness.png",

  rockColor: "/assets/textures/rock/rock-color.png",
  rockNormal: "/assets/textures/rock/rock-normal.png",
  rockRoughness: "/assets/textures/rock/rock-roughness.png",
};

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function loadTexture(loader, url, colorSpace = false) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
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
    loader.load(url, resolve, undefined, reject);
  });
}

function applyTexturePack(root, maps) {
  root.traverse((object) => {
    if (!object.isMesh) return;

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

      if (maps.color) {
        material.map = maps.color;
      }

      if (maps.normal) {
        material.normalMap = maps.normal;
      }

      if (maps.roughness) {
        material.roughnessMap = maps.roughness;
      }

      material.envMapIntensity = 0.7;
      material.needsUpdate = true;
    });
  });
}

function disposeMaterial(material) {
  if (!material) return;
  material.dispose?.();
}

function disposeObject(root, preservedMaterials = new Set()) {
  root?.traverse?.((object) => {
    object.geometry?.dispose?.();

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    materials.forEach((material) => {
      if (!preservedMaterials.has(material)) {
        disposeMaterial(material);
      }
    });
  });
}

export default function PolarScene() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    let renderer;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !prefersReducedMotion(),
        powerPreference: "high-performance",
      });
    } catch {
      canvas.hidden = true;
      return undefined;
    }

    const reducedMotion = prefersReducedMotion();

    const scene = new THREE.Scene();

    scene.fog = new THREE.FogExp2(0x071018, 0.045);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    camera.position.set(0, 1.5, 9);

    const pixelRatio = reducedMotion
      ? 1
      : Math.min(window.devicePixelRatio || 1, 1.5);

    renderer.setPixelRatio(pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;

    const world = new THREE.Group();

    scene.add(world);

    const textureLoader = new THREE.TextureLoader();
    const fbxLoader = new FBXLoader();

    const loadedTextures = [];
    const loadedRoots = [];
    const ownedMaterials = [];

    let disposed = false;

    /*
     * -------------------------------------------------------------------------
     * ICEBERG
     * -------------------------------------------------------------------------
     */

    const iceMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xaed2df,
      roughness: 0.15,
      metalness: 0.03,
      transmission: reducedMotion ? 0.12 : 0.22,
      thickness: 1.2,
      transparent: true,
      opacity: 0.58,
    });

    ownedMaterials.push(iceMaterial);

    const icebergGeometry = new THREE.IcosahedronGeometry(2.55, 2);

    const iceberg = new THREE.Mesh(
      icebergGeometry,
      iceMaterial,
    );

    iceberg.scale.set(1.15, 1.05, 0.82);
    iceberg.position.set(1.65, 0.55, -0.7);
    iceberg.rotation.set(-0.22, 0.45, 0.08);

    world.add(iceberg);

    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0xe7f5f8,
      transparent: true,
      opacity: 0.12,
      wireframe: true,
    });

    ownedMaterials.push(wireMaterial);

    const icebergWire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.58, 2),
      wireMaterial,
    );

    icebergWire.scale.copy(iceberg.scale);
    icebergWire.position.copy(iceberg.position);
    icebergWire.rotation.copy(iceberg.rotation);

    world.add(icebergWire);

    /*
     * -------------------------------------------------------------------------
     * WATER
     * -------------------------------------------------------------------------
     */

    const waterMaterial = new THREE.MeshBasicMaterial({
      color: 0x07151d,
      transparent: true,
      opacity: 0.72,
    });

    ownedMaterials.push(waterMaterial);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 24),
      waterMaterial,
    );

    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -2.35, -1);

    world.add(water);

    /*
     * -------------------------------------------------------------------------
     * STARS
     * -------------------------------------------------------------------------
     */

    const starGeometry = new THREE.BufferGeometry();

    const starCount = reducedMotion ? 300 : 650;

    const positions = new Float32Array(starCount * 3);

    for (let index = 0; index < starCount; index += 1) {
      positions[index * 3] =
        (Math.random() - 0.5) * 25;

      positions[index * 3 + 1] =
        (Math.random() - 0.5) * 13;

      positions[index * 3 + 2] =
        (Math.random() - 0.5) * 18 - 2;
    }

    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );

    const starMaterial = new THREE.PointsMaterial({
      color: 0xdceff4,
      size: reducedMotion ? 0.012 : 0.016,
      transparent: true,
      opacity: 0.55,
    });

    ownedMaterials.push(starMaterial);

    const stars = new THREE.Points(
      starGeometry,
      starMaterial,
    );

    scene.add(stars);

    /*
     * -------------------------------------------------------------------------
     * AURORA
     * -------------------------------------------------------------------------
     */

    const aurora = new THREE.Group();

    const auroraMaterials = [
      new THREE.LineBasicMaterial({
        color: 0x6aa9bb,
        transparent: true,
        opacity: 0.18,
      }),

      new THREE.LineBasicMaterial({
        color: 0x9ec7bc,
        transparent: true,
        opacity: 0.12,
      }),

      new THREE.LineBasicMaterial({
        color: 0x9eacd0,
        transparent: true,
        opacity: 0.09,
      }),
    ];

    auroraMaterials.forEach((material) => {
      ownedMaterials.push(material);
    });

    const auroraLayerCount = reducedMotion ? 2 : 3;

    for (
      let layer = 0;
      layer < auroraLayerCount;
      layer += 1
    ) {
      const points = [];

      for (let index = 0; index < 90; index += 1) {
        const x = -11 + index * 0.25;

        const y =
          3.2 +
          layer * 0.48 +
          Math.sin(index * 0.11 + layer) * 0.55 +
          Math.sin(index * 0.035) * 0.45;

        const z =
          -5 +
          Math.sin(index * 0.07 + layer) * 1.2;

        points.push(
          new THREE.Vector3(x, y, z),
        );
      }

      const geometry =
        new THREE.BufferGeometry().setFromPoints(points);

      const line = new THREE.Line(
        geometry,
        auroraMaterials[layer],
      );

      aurora.add(line);
    }

    scene.add(aurora);

    /*
     * -------------------------------------------------------------------------
     * LIGHTING
     * -------------------------------------------------------------------------
     */

    const hemisphere = new THREE.HemisphereLight(
      0xb8d7e2,
      0x061018,
      1.4,
    );

    scene.add(hemisphere);

    const key = new THREE.DirectionalLight(
      0xffffff,
      2.2,
    );

    key.position.set(-5, 6, 8);

    scene.add(key);

    const rim = new THREE.PointLight(
      0x4c9bb5,
      16,
      18,
    );

    rim.position.set(4, 0, 3);

    scene.add(rim);

    /*
     * -------------------------------------------------------------------------
     * POINTER INTERACTION
     * -------------------------------------------------------------------------
     */

    const pointer = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
    };

    const onPointerMove = (event) => {
      if (reducedMotion) return;

      pointer.targetX =
        (event.clientX / window.innerWidth - 0.5) * 0.9;

      pointer.targetY =
        (event.clientY / window.innerHeight - 0.5) * 0.45;
    };

    /*
     * -------------------------------------------------------------------------
     * RESIZE
     * -------------------------------------------------------------------------
     */

    const resize = () => {
      camera.aspect =
        window.innerWidth / window.innerHeight;

      camera.updateProjectionMatrix();

      renderer.setSize(
        window.innerWidth,
        window.innerHeight,
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

    /*
     * -------------------------------------------------------------------------
     * REAL ASSET LOADING
     * -------------------------------------------------------------------------
     *
     * Important:
     *
     * The environment currently exists as a JPEG, not an HDR/EXR file.
     * Therefore it is intentionally loaded through TextureLoader rather than
     * RGBELoader. This eliminates the previous format mismatch.
     */

    const loadSceneAssets = async () => {
      try {
        const [
          iceColor,
          iceNormal,
          iceRoughness,
          rockColor,
          rockNormal,
          rockRoughness,
        ] = await Promise.all([
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
          [
            iceColor,
            iceNormal,
            iceRoughness,
            rockColor,
            rockNormal,
            rockRoughness,
          ].forEach((texture) => {
            texture.dispose();
          });

          return;
        }

        loadedTextures.push(
          iceColor,
          iceNormal,
          iceRoughness,
          rockColor,
          rockNormal,
          rockRoughness,
        );

        iceMaterial.map = iceColor;
        iceMaterial.normalMap = iceNormal;
        iceMaterial.roughnessMap = iceRoughness;
        iceMaterial.needsUpdate = true;

        /*
         * Mountain
         */

        const mountain = await loadFBX(
          fbxLoader,
          MODEL_URL,
        );

        if (disposed) {
          disposeObject(mountain);
          return;
        }

        mountain.scale.setScalar(0.022);
        mountain.position.set(-2, -3, -8);
        mountain.rotation.set(0, -0.2, 0);

        applyTexturePack(
          mountain,
          {
            color: rockColor,
            normal: rockNormal,
            roughness: rockRoughness,
          },
        );

        world.add(mountain);
        loadedRoots.push(mountain);
      } catch (error) {
        if (!disposed) {
          console.warn(
            "Antarctic Labs: optional 3D asset failed to load.",
            error,
          );
        }
      }

      /*
       * Environment
       *
       * This is currently a tonemapped JPEG.
       * It provides an equirectangular environment/reflection source,
       * but it is intentionally NOT treated as true HDR.
       */

      try {
        const environment = await loadTexture(
          textureLoader,
          ENVIRONMENT_URL,
        );

        if (disposed) {
          environment.dispose();
          return;
        }

        environment.mapping =
          THREE.EquirectangularReflectionMapping;

        scene.environment = environment;

        loadedTextures.push(environment);
      } catch (error) {
        if (!disposed) {
          console.warn(
            "Antarctic Labs: environment image failed to load.",
            error,
          );
        }
      }
    };

    loadSceneAssets();

    /*
     * -------------------------------------------------------------------------
     * RENDER LOOP
     * -------------------------------------------------------------------------
     */

    const clock = new THREE.Clock();

    let animationFrame;

    const tick = () => {
      const elapsed = clock.getElapsedTime();

      if (!reducedMotion) {
        pointer.x +=
          (pointer.targetX - pointer.x) * 0.025;

        pointer.y +=
          (pointer.targetY - pointer.y) * 0.025;

        iceberg.rotation.y += 0.0008;

        iceberg.rotation.x =
          -0.22 +
          Math.sin(elapsed * 0.22) * 0.025;

        iceberg.position.y =
          0.55 +
          Math.sin(elapsed * 0.38) * 0.08;

        stars.rotation.y =
          elapsed * 0.004;

        aurora.position.x =
          Math.sin(elapsed * 0.12) * 0.12;

        aurora.rotation.z =
          Math.sin(elapsed * 0.08) * 0.015;

        world.rotation.y +=
          (
            pointer.x * 0.075 -
            world.rotation.y
          ) * 0.018;

        world.rotation.x +=
          (
            pointer.y * 0.035 -
            world.rotation.x
          ) * 0.018;
      }

      icebergWire.rotation.copy(
        iceberg.rotation,
      );

      icebergWire.position.copy(
        iceberg.position,
      );

      renderer.render(
        scene,
        camera,
      );

      animationFrame =
        window.requestAnimationFrame(tick);
    };

    tick();

    /*
     * -------------------------------------------------------------------------
     * CLEANUP
     * -------------------------------------------------------------------------
     */

    return () => {
      disposed = true;

      window.cancelAnimationFrame(
        animationFrame,
      );

      window.removeEventListener(
        "resize",
        resize,
      );

      window.removeEventListener(
        "pointermove",
        onPointerMove,
      );

      loadedRoots.forEach((root) => {
        disposeObject(root);
      });

      disposeObject(
        world,
        new Set(ownedMaterials),
      );

      starGeometry.dispose();

      ownedMaterials.forEach(
        (material) => {
          disposeMaterial(material);
        },
      );

      loadedTextures.forEach(
        (texture) => {
          texture.dispose();
        },
      );

      scene.environment = null;

      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="ice-canvas"
      aria-hidden="true"
    />
  );
}