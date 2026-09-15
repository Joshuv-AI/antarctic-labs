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
function loadTexture(loader, url, colorSpace = THREE.NoColorSpace) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = colorSpace;
        texture.anisotropy = 4;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}
function createCanvasTexture(draw) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  draw(context, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
function createStarTexture() {
  return createCanvasTexture((ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      width / 2
    );
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.12, "rgba(220,245,255,0.75)");
    gradient.addColorStop(0.35, "rgba(180,220,240,0.18)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
}
function createAuroraTexture() {
  return createCanvasTexture((ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "rgba(90,220,210,0)");
    gradient.addColorStop(0.22, "rgba(90,220,210,0.12)");
    gradient.addColorStop(0.4, "rgba(120,235,220,0.2)");
    gradient.addColorStop(0.56, "rgba(100,205,235,0.16)");
    gradient.addColorStop(0.78, "rgba(90,220,210,0.08)");
    gradient.addColorStop(1, "rgba(90,220,210,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 9; i += 1) {
      const y = height * (0.18 + i * 0.085);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= width; x += 24) {
        const wave =
          Math.sin(x * 0.007 + i * 0.85) * 18 +
          Math.sin(x * 0.014 + i * 0.42) * 8;
        ctx.lineTo(x, y + wave);
      }
      ctx.lineTo(width, y + 90);
      ctx.lineTo(0, y + 90);
      ctx.closePath();
      ctx.fillStyle = `rgba(90, 215, 205, ${0.025 + i * 0.004})`;
      ctx.fill();
    }
  });
}
function createMountainMaterial(textures, mobile) {
  return new THREE.MeshStandardMaterial({
    map: textures.iceColor,
    normalMap: mobile ? null : textures.iceNormal,
    roughnessMap: textures.iceRoughness,
    roughness: 0.78,
    metalness: 0.02,
    color: new THREE.Color("#dcebf0"),
    envMapIntensity: 0.42,
    flatShading: false,
  });
}
function createTerrainMaterial(textures, mobile) {
  return new THREE.MeshStandardMaterial({
    map: textures.snowColor,
    roughnessMap: textures.snowRoughness,
    normalMap: mobile ? null : textures.rockNormal,
    roughness: 0.9,
    metalness: 0,
    color: new THREE.Color("#edf4f5"),
    envMapIntensity: 0.25,
  });
}
function createIceShelf(textures, mobile) {
  const geometry = new THREE.PlaneGeometry(70, 120, mobile ? 32 : 64, mobile ? 32 : 64);
  const material = new THREE.MeshStandardMaterial({
    map: textures.iceColor,
    normalMap: mobile ? null : textures.iceNormal,
    roughnessMap: textures.iceRoughness,
    color: new THREE.Color("#d9edf2"),
    roughness: 0.68,
    metalness: 0.01,
    envMapIntensity: 0.5,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, -5.1, -24);
  mesh.scale.set(1.7, 1, 1.2);
  return mesh;
}
function createSnowBanks(textures, mobile) {
  const group = new THREE.Group();
  const material = createTerrainMaterial(textures, mobile);
  const formations = [
    {
      scale: [13, 2.2, 8],
      position: [-17, -3.8, 3],
      rotation: 0.08,
    },
    {
      scale: [18, 2.6, 9],
      position: [18, -3.7, 7],
      rotation: -0.1,
    },
    {
      scale: [24, 3.1, 12],
      position: [0, -4.2, 19],
      rotation: 0,
    },
  ];
  formations.forEach((formation, index) => {
    const geometry = new THREE.SphereGeometry(
      1,
      mobile ? 24 : 36,
      mobile ? 14 : 22
    );
    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.scale.set(...formation.scale);
    mesh.position.set(...formation.position);
    mesh.rotation.z = formation.rotation;
    mesh.userData.baseY = mesh.position.y;
    mesh.userData.index = index;
    group.add(mesh);
  });
  return group;
}
function createStars(count, mobile) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const radius = 42 + Math.random() * 55;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.43;
    const x = Math.cos(theta) * Math.sin(phi) * radius;
    const y = Math.cos(phi) * radius + 6;
    const z = Math.sin(theta) * Math.sin(phi) * radius - 18;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    sizes[i] = 0.4 + Math.random() * (mobile ? 0.55 : 0.9);
  }
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.PointsMaterial({
    color: new THREE.Color("#d8edf5"),
    size: mobile ? 0.12 : 0.16,
    transparent: true,
    opacity: 0.7,
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
      width: 78,
      height: 22,
      y: 19,
      z: -48,
      rotation: -0.03,
      opacity: 0.3,
      scaleX: 1,
    },
    {
      width: 66,
      height: 18,
      y: 23,
      z: -53,
      rotation: 0.025,
      opacity: 0.2,
      scaleX: 1.12,
    },
    {
      width: 52,
      height: 15,
      y: 27,
      z: -57,
      rotation: -0.045,
      opacity: 0.16,
      scaleX: 1.25,
    },
  ];
  layers.forEach((layer) => {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: layer.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const geometry = new THREE.PlaneGeometry(layer.width, layer.height);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, layer.y, layer.z);
    mesh.rotation.z = layer.rotation;
    mesh.scale.x = layer.scaleX;
    mesh.userData.baseX = mesh.position.x;
    mesh.userData.baseY = mesh.position.y;
    group.add(mesh);
  });
  return group;
}
function createHorizonGlow() {
  const geometry = new THREE.PlaneGeometry(100, 30);
  const texture = createCanvasTexture((ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createRadialGradient(
      width / 2,
      height * 0.7,
      0,
      width / 2,
      height * 0.7,
      width * 0.58
    );
    gradient.addColorStop(0, "rgba(160,225,235,0.18)");
    gradient.addColorStop(0.35, "rgba(110,195,220,0.08)");
    gradient.addColorStop(1, "rgba(70,120,160,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 3, -34);
  return mesh;
}
function normalizeMountain(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const targetHeight = 28;
  const scale = targetHeight / Math.max(size.y, 0.001);
  model.scale.setScalar(scale);
  const scaledBox = new THREE.Box3().setFromObject(model);
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
  const scaledSize = scaledBox.getSize(new THREE.Vector3());
  model.position.x -= scaledCenter.x;
  model.position.z -= scaledCenter.z;
  model.position.y -= scaledBox.min.y;
  if (scaledSize.x > 80) {
    const horizontalScale = 80 / scaledSize.x;
    model.scale.multiplyScalar(horizontalScale);
  }
  if (scaledSize.z > 80) {
    const depthScale = 80 / scaledSize.z;
    model.scale.multiplyScalar(depthScale);
  }
  return model;
}
function styleMountain(model, textures, mobile) {
  const material = createMountainMaterial(textures, mobile);
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = false;
    child.receiveShadow = true;
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(disposeMaterial);
      } else {
        disposeMaterial(child.material);
      }
    }
    child.material = material.clone();
  });
  return model;
}
export default function PolarScene() {
  const mountRef = useRef(null);
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let destroyed = false;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const mobile =
      window.matchMedia("(max-width: 768px)").matches ||
      window.matchMedia("(pointer: coarse)").matches;
    const lowPower =
      mobile ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#061019");
    const camera = new THREE.PerspectiveCamera(
      mobile ? 48 : 43,
      window.innerWidth / window.innerHeight,
      0.1,
      220
    );
    camera.position.set(0, 7.4, 25);
    camera.lookAt(0, 7, -17);
    const renderer = new THREE.WebGLRenderer({
      antialias: !mobile,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, mobile ? 1.35 : 1.8)
    );
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = mobile ? 0.88 : 0.98;
    renderer.shadowMap.enabled = false;
    mount.appendChild(renderer.domElement);
    const clock = new THREE.Clock();
    const textureLoader = new THREE.TextureLoader();
    const fbxLoader = new FBXLoader();
    const ambient = new THREE.HemisphereLight(
      new THREE.Color("#c9e8f0"),
      new THREE.Color("#071019"),
      1.25
    );
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(
      new THREE.Color("#dcefff"),
      2.1
    );
    keyLight.position.set(-18, 28, 12);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(
      new THREE.Color("#72d7d2"),
      0.75
    );
    rimLight.position.set(26, 14, -24);
    scene.add(rimLight);
    const fillLight = new THREE.PointLight(
      new THREE.Color("#86bde0"),
      8,
      70
    );
    fillLight.position.set(0, 8, -28);
    scene.add(fillLight);
    const world = new THREE.Group();
    scene.add(world);
    const stars = createStars(mobile ? 850 : 1500, mobile);
    world.add(stars);
    const aurora = createAurora();
    world.add(aurora);
    const horizonGlow = createHorizonGlow();
    world.add(horizonGlow);
    let mountain = null;
    let iceShelf = null;
    let snowBanks = null;
    let textures = null;
    let scrollProgress = 0;
    let targetScrollProgress = 0;
    let pointerX = 0;
    let pointerY = 0;
    let targetPointerX = 0;
    let targetPointerY = 0;
    const loadSceneAssets = async () => {
      try {
        const [
          iceColor,
          iceNormal,
          iceRoughness,
          snowColor,
          snowRoughness,
          rockColor,
          rockNormal,
          rockRoughness,
        ] = await Promise.all([
          loadTexture(textureLoader, ASSETS.iceColor, THREE.SRGBColorSpace),
          loadTexture(textureLoader, ASSETS.iceNormal),
          loadTexture(
            textureLoader,
            ASSETS.iceRoughness,
            THREE.NoColorSpace
          ),
          loadTexture(textureLoader, ASSETS.snowColor, THREE.SRGBColorSpace),
          loadTexture(
            textureLoader,
            ASSETS.snowRoughness,
            THREE.NoColorSpace
          ),
          loadTexture(textureLoader, ASSETS.rockColor, THREE.SRGBColorSpace),
          loadTexture(textureLoader, ASSETS.rockNormal),
          loadTexture(
            textureLoader,
            ASSETS.rockRoughness,
            THREE.NoColorSpace
          ),
        ]);
        if (destroyed) {
          [
            iceColor,
            iceNormal,
            iceRoughness,
            snowColor,
            snowRoughness,
            rockColor,
            rockNormal,
            rockRoughness,
          ].forEach((texture) => texture.dispose());
          return;
        }
        textures = {
          iceColor,
          iceNormal,
          iceRoughness,
          snowColor,
          snowRoughness,
          rockColor,
          rockNormal,
          rockRoughness,
        };
        iceShelf = createIceShelf(textures, mobile);
        world.add(iceShelf);
        snowBanks = createSnowBanks(textures, mobile);
        world.add(snowBanks);
        fbxLoader.load(
          ASSETS.mountain,
          (loadedModel) => {
            if (destroyed) {
              disposeObject(loadedModel);
              return;
            }
            mountain = normalizeMountain(loadedModel);
            mountain = styleMountain(mountain, textures, mobile);
            mountain.position.set(0, -4.65, -15);
            mountain.rotation.y = Math.PI;
            mountain.scale.multiplyScalar(mobile ? 0.92 : 1.04);
            world.add(mountain);
          },
          undefined,
          (error) => {
            console.error("Antarctic Labs mountain asset failed to load.", error);
          }
        );
      } catch (error) {
        console.error("Antarctic Labs scene assets failed to load.", error);
      }
    };
    loadSceneAssets();
    const onPointerMove = (event) => {
      if (mobile) return;
      targetPointerX =
        (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
      targetPointerY =
        (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
    };
    const onScroll = () => {
      const scrollHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      targetScrollProgress =
        scrollHeight > 0 ? clamp(window.scrollY / scrollHeight, 0, 1) : 0;
    };
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.fov = mobile ? 48 : 43;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, mobile ? 1.35 : 1.8)
      );
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    const onContextLost = (event) => {
      event.preventDefault();
    };
    const onContextRestored = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    renderer.domElement.addEventListener(
      "webglcontextlost",
      onContextLost,
      false
    );
    renderer.domElement.addEventListener(
      "webglcontextrestored",
      onContextRestored,
      false
    );
    onScroll();
    let animationFrame;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      if (!prefersReducedMotion) {
        scrollProgress +=
          (targetScrollProgress - scrollProgress) * (mobile ? 0.055 : 0.035);
        pointerX += (targetPointerX - pointerX) * 0.025;
        pointerY += (targetPointerY - pointerY) * 0.025;
      } else {
        scrollProgress = 0;
        pointerX = 0;
        pointerY = 0;
      }
      const sceneTravel = scrollProgress * 15;
      camera.position.x =
        pointerX * (mobile ? 0.08 : 0.55);
      camera.position.y =
        7.4 -
        sceneTravel * 0.14 +
        pointerY * (mobile ? 0.05 : 0.28);
      camera.position.z =
        25 -
        sceneTravel * 0.8;
      const lookTarget = new THREE.Vector3(
        pointerX * 0.45,
        6.7 - sceneTravel * 0.08,
        -17 - sceneTravel * 0.45
      );
      camera.lookAt(lookTarget);
      if (mountain) {
        mountain.position.x =
          pointerX * -0.22;
        mountain.position.y =
          -4.65 -
          scrollProgress * 2.2;
        mountain.rotation.y =
          Math.PI +
          pointerX * 0.018;
        mountain.rotation.x =
          Math.sin(elapsed * 0.12) * 0.002;
      }
      if (iceShelf) {
        iceShelf.position.y =
          -5.1 -
          scrollProgress * 0.55;
        iceShelf.rotation.z =
          pointerX * 0.004;
      }
      if (snowBanks) {
        snowBanks.children.forEach((bank, index) => {
          const baseY = bank.userData.baseY;
          bank.position.y =
            baseY -
            scrollProgress * (0.25 + index * 0.12);
          bank.position.x +=
            Math.sin(elapsed * 0.08 + index) * 0.0007;
        });
      }
      aurora.children.forEach((layer, index) => {
        layer.position.x =
          Math.sin(elapsed * (0.055 + index * 0.012)) *
          (0.8 + index * 0.3);
        layer.position.y =
          Math.sin(elapsed * 0.035 + index) * 0.22;
        layer.material.opacity =
          (0.22 - index * 0.035) *
          (1 - scrollProgress * 0.35);
      });
      stars.rotation.y =
        elapsed * 0.004 +
        scrollProgress * 0.03;
      stars.rotation.x =
        Math.sin(elapsed * 0.006) * 0.015;
      horizonGlow.material.opacity =
        0.72 -
        scrollProgress * 0.28;
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      destroyed = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        onContextLost
      );
      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        onContextRestored
      );
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      disposeObject(world);
      scene.traverse((object) => {
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(disposeMaterial);
          } else {
            disposeMaterial(object.material);
          }
        }
        if (object.geometry) {
          object.geometry.dispose();
        }
      });
      renderer.dispose();
      textures = null;
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
        overflow: "hidden",
        pointerEvents: "none",
      }}
    />
  );
}