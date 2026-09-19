import * as THREE from “three”;
import { GLTFLoader } from “three/examples/jsm/loaders/GLTFLoader.js”;

const canvas = document.getElementById(“c”);

const renderer = new THREE.WebGLRenderer({
canvas,
antialias: true,
alpha: true,
premultipliedAlpha: false,
powerPreference: “high-performance”,
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
38,
window.innerWidth / window.innerHeight,
0.1,
5000,
);

scene.add(camera);

const clock = new THREE.Clock();

let animationFrame = 0;
let paused = false;
let destroyed = false;

const mountainRoot = new THREE.Group();
scene.add(mountainRoot);

/* ––––––––––––––––––––––––––––––––––––– /
/ Helpers                                                                    /
/ ––––––––––––––––––––––––––––––––––––– */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function smoothstep(edge0, edge1, value) {
const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
return t * t * (3 - 2 * t);
}

function resize() {
if (destroyed) return;

const width = Math.max(1, window.innerWidth);
const height = Math.max(1, window.innerHeight);

camera.aspect = width / height;
camera.updateProjectionMatrix();

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(width, height, false);
}

function snapshotMeshes(root) {
const meshes = [];

root.traverse((object) => {
if (object && object.isMesh) {
meshes.push(object);
}
});

return meshes;
}

function disposeObject(root) {
root.traverse((object) => {
if (object.geometry) {
object.geometry.dispose();
}

if (object.material) {
  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];
  materials.forEach((material) => {
    if (!material) return;
    Object.keys(material).forEach((key) => {
      const value = material[key];
      if (value && value.isTexture) {
        value.dispose();
      }
    });
    material.dispose();
  });
}

});
}

/* ––––––––––––––––––––––––––––––––––––– /
/ Sky dome                                                                   /
/ ––––––––––––––––––––––––––––––––––––– */

const skyGeometry = new THREE.SphereGeometry(700, 32, 18);

const skyMaterial = new THREE.ShaderMaterial({
side: THREE.BackSide,
depthWrite: false,
depthTest: false,
uniforms: {
uTop: { value: new THREE.Color(0x03070f) },
uUpperHorizon: { value: new THREE.Color(0x0b1929) },
uLowerHorizon: { value: new THREE.Color(0x101e2b) },
uGround: { value: new THREE.Color(0x040910) },
},
vertexShader: `
varying vec3 vWorldDirection;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}

, fragmentShader: 
varying vec3 vWorldDirection;

uniform vec3 uTop;
uniform vec3 uUpperHorizon;
uniform vec3 uLowerHorizon;
uniform vec3 uGround;
void main() {
  float h = clamp(vWorldDirection.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 color;
  if (h > 0.58) {
    color = mix(uUpperHorizon, uTop, smoothstep(0.58, 1.0, h));
  } else if (h > 0.38) {
    color = mix(uLowerHorizon, uUpperHorizon, smoothstep(0.38, 0.58, h));
  } else {
    color = mix(uGround, uLowerHorizon, smoothstep(0.0, 0.38, h));
  }
  gl_FragColor = vec4(color, 1.0);
}

`,
});

const sky = new THREE.Mesh(skyGeometry, skyMaterial);
sky.renderOrder = -100;
scene.add(sky);

/* ––––––––––––––––––––––––––––––––––––– /
/ Aurora curtains                                                            /
/ ––––––––––––––––––––––––––––––––––––– */

const auroraGeometry = new THREE.PlaneGeometry(
900,
360,
40,
20,
);

const auroraMaterial = new THREE.ShaderMaterial({
transparent: true,
depthWrite: false,
depthTest: false,
blending: THREE.AdditiveBlending,
uniforms: {
uTime: { value: 0 },
uOpacity: { value: 1 },
uColorA: { value: new THREE.Color(0x2de27b) },
uColorB: { value: new THREE.Color(0x57e6cf) },
uColorC: { value: new THREE.Color(0x8fffe0) },
},
vertexShader: `
uniform float uTime;

varying vec2 vUv;
varying float vWave;
void main() {
  vUv = uv;
  vec3 transformed = position;
  float waveA = sin(position.x * 0.018 + uTime * 0.12);
  float waveB = sin(position.x * 0.041 - uTime * 0.075);
  float waveC = sin(position.x * 0.009 + uTime * 0.045);
  transformed.z +=
    waveA * 22.0 +
    waveB * 10.0 +
    waveC * 18.0;
  transformed.x += sin(position.y * 0.014 + uTime * 0.06) * 7.0;
  vWave = waveA * 0.5 + waveB * 0.3 + waveC * 0.2;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}

, fragmentShader: 
uniform float uTime;
uniform float uOpacity;

uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
varying vec2 vUv;
varying float vWave;
void main() {
  float bandA = sin(vUv.x * 12.0 + vWave * 3.0 + uTime * 0.08);
  float bandB = sin(vUv.x * 25.0 - vWave * 4.0 - uTime * 0.045);
  float wisps = smoothstep(0.05, 0.95, bandA * 0.5 + bandB * 0.5 + 0.5);
  float verticalFade =
    smoothstep(0.0, 0.15, vUv.y) *
    (1.0 - smoothstep(0.82, 1.0, vUv.y));
  float horizontalFade =
    smoothstep(0.0, 0.10, vUv.x) *
    (1.0 - smoothstep(0.90, 1.0, vUv.x));
  float lowerBreak = smoothstep(0.06, 0.28, vUv.y);
  float colorMix = clamp(
    0.5 +
    sin(vUv.x * 7.0 + uTime * 0.035 + vWave * 2.0) * 0.5,
    0.0,
    1.0
  );
  vec3 color = mix(uColorA, uColorB, colorMix);
  color = mix(color, uColorC, smoothstep(0.65, 1.0, vUv.y));
  float alpha =
    wisps *
    verticalFade *
    horizontalFade *
    lowerBreak *
    0.48 *
    uOpacity;
  gl_FragColor = vec4(color, alpha);
}

`,
});

const auroraGroup = new THREE.Group();

const auroraBack = new THREE.Mesh(auroraGeometry, auroraMaterial);
auroraBack.position.set(0, 125, -95);
auroraBack.rotation.y = -0.10;
auroraBack.renderOrder = -60;

const auroraFrontMaterial = auroraMaterial.clone();
auroraFrontMaterial.uniforms = THREE.UniformsUtils.clone(
auroraMaterial.uniforms,
);

const auroraFront = new THREE.Mesh(
auroraGeometry.clone(),
auroraFrontMaterial,
);

auroraFront.position.set(0, 105, -52);
auroraFront.rotation.y = 0.12;
auroraFront.scale.set(0.92, 0.88, 1);
auroraFront.renderOrder = -55;

auroraGroup.add(auroraBack, auroraFront);
scene.add(auroraGroup);

/* ––––––––––––––––––––––––––––––––––––– /
/ Dedicated starfield                                                       /
/ ––––––––––––––––––––––––––––––––––––– */

const starCount = 2000;
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);

const starColorA = new THREE.Color(0xbfdff2);
const starColorB = new THREE.Color(0xffffff);
const starColorC = new THREE.Color(0x9bc8df);

for (let i = 0; i < starCount; i += 1) {
const radius = 420 + Math.random() * 260;
const theta = Math.random() * Math.PI * 2;
const phi = Math.acos(THREE.MathUtils.lerp(-0.05, 0.92, Math.random()));

const x = radius * Math.sin(phi) * Math.cos(theta);
const y = Math.abs(radius * Math.cos(phi)) + 20;
const z = radius * Math.sin(phi) * Math.sin(theta);

const index = i * 3;

starPositions[index] = x;
starPositions[index + 1] = y;
starPositions[index + 2] = z;

const mix = Math.random();

const color =
mix < 0.72
? starColorA
: mix < 0.94
? starColorB
: starColorC;

starColors[index] = color.r;
starColors[index + 1] = color.g;
starColors[index + 2] = color.b;
}

const starGeometry = new THREE.BufferGeometry();

starGeometry.setAttribute(
“position”,
new THREE.BufferAttribute(starPositions, 3),
);

starGeometry.setAttribute(
“color”,
new THREE.BufferAttribute(starColors, 3),
);

const starMaterial = new THREE.PointsMaterial({
size: 1.55,
sizeAttenuation: true,
vertexColors: true,
transparent: true,
opacity: 0.9,
depthWrite: false,
depthTest: false,
blending: THREE.AdditiveBlending,
});

const stars = new THREE.Points(starGeometry, starMaterial);
stars.renderOrder = -40;
scene.add(stars);

/* ––––––––––––––––––––––––––––––––––––– /
/ Mountain                                                                   /
/ ––––––––––––––––––––––––––––––––––––– */

const loader = new GLTFLoader();

function prepareMountain(gltf) {
const sourceScene = gltf.scene;

if (!sourceScene) {
document.title = “error:no-scene”;
throw new Error(“GLB loaded without a scene”);
}

const meshes = snapshotMeshes(sourceScene);

if (!meshes.length) {
document.title = “error:no-meshes”;
throw new Error(“GLB loaded without meshes”);
}

meshes.forEach((mesh) => {
mesh.castShadow = false;
mesh.receiveShadow = false;

const materials = Array.isArray(mesh.material)
  ? mesh.material
  : [mesh.material];
materials.forEach((material) => {
  if (!material) return;
  material.metalness = 0;
  material.roughness = 0.86;
  material.envMapIntensity = 0;
  material.transparent = false;
  material.opacity = 1;
});

});

/*

* The source GLB contains the mountain and a large embedded star field.
* We keep the mountain meshes but omit the source star meshes so the
* dedicated controlled starfield above remains the only star layer.
    */
    meshes.forEach((mesh) => {
    const geometry = mesh.geometry;

if (!geometry) return;
const position = geometry.attributes.position;
if (!position) return;
const bbox = new THREE.Box3().setFromBufferAttribute(position);
/*
 * Source stars are tiny point-like objects. The actual mountain meshes
 * have substantial geometry extents, so this deliberately conservative
 * test removes only the obvious star objects.
 */
const size = bbox.getSize(new THREE.Vector3());
if (
  mesh.isPoints ||
  (size.x < 2 && size.y < 2 && size.z < 2)
) {
  mesh.parent?.remove(mesh);
  return;
}
mountainRoot.add(mesh);

});

const mountainMeshes = snapshotMeshes(mountainRoot);

if (!mountainMeshes.length) {
document.title = “error:no-mountain”;
throw new Error(“No mountain meshes remained after preparation”);
}

/*

* Snow / stone / rock material treatment.
* This is intentionally restrained: the renderer should reveal the GLB,
* not wash it with a large environmental overlay.
    */
    mountainMeshes.forEach((mesh) => {
    const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];

materials.forEach((material) => {
  if (!material) return;
  material.metalness = 0;
  material.roughness = 0.86;
  material.envMapIntensity = 0;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnow = {
      value: new THREE.Color(0xf4f8fb),
    };
    shader.uniforms.uStone = {
      value: new THREE.Color(0x8a9aa6),
    };
    shader.uniforms.uRock = {
      value: new THREE.Color(0x3d5360),
    };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `
        #include <common>
        varying vec3 vAuraWorldPosition;
        varying vec3 vAuraWorldNormal;
      `,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `
        vec4 auraWorldPosition = modelMatrix * vec4(position, 1.0);
        vAuraWorldPosition = auraWorldPosition.xyz;
        vAuraWorldNormal = normalize(
          mat3(modelMatrix) * normal
        );
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `
        #include <common>
        uniform vec3 uSnow;
        uniform vec3 uStone;
        uniform vec3 uRock;
        varying vec3 vAuraWorldPosition;
        varying vec3 vAuraWorldNormal;
      `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `
        #include <color_fragment>
        float altitude = smoothstep(
          -20.0,
          65.0,
          vAuraWorldPosition.y
        );
        float upward = smoothstep(
          0.10,
          0.72,
          vAuraWorldNormal.y
        );
        float snowMask = clamp(
          altitude * 0.72 +
          upward * 0.45,
          0.0,
          1.0
        );
        vec3 mountainBase = mix(
          uRock,
          uStone,
          smoothstep(0.18, 0.48, altitude)
        );
        mountainBase = mix(
          mountainBase,
          uSnow,
          snowMask
        );
        diffuseColor.rgb *= mountainBase;
      `,
    );
  };
  material.needsUpdate = true;
});

}

const mountainBox = new THREE.Box3().setFromObject(mountainRoot);

const mountainSize = mountainBox.getSize(new THREE.Vector3());
const mountainCenter = mountainBox.getCenter(new THREE.Vector3());

const maxHorizontal =
Math.max(mountainSize.x, mountainSize.z);

const isPortrait = window.innerHeight > window.innerWidth;

/*

* Slightly tighter composition than the original whole-scene framing.
* The mountain remains the hero rather than becoming a distant object.
    */
    const frameMultiplier = isPortrait ? 0.43 : 0.35;

const verticalFov =
THREE.MathUtils.degToRad(camera.fov);

const horizontalFov =
2 *
Math.atan(
Math.tan(verticalFov / 2) * camera.aspect,
);

const effectiveFov = isPortrait
? verticalFov
: horizontalFov;

const frameDimension = isPortrait
? maxHorizontal
: mountainSize.x;

const distance =
(frameDimension * frameMultiplier) /
(2 * Math.tan(effectiveFov / 2));

const lookAt = mountainCenter.clone();

lookAt.y += isPortrait
? mountainSize.y * 0.03
: mountainSize.y * 0.06;

camera.position.set(
mountainCenter.x,
mountainCenter.y + mountainSize.y * 0.04,
mountainCenter.z + distance,
);

camera.lookAt(lookAt);

/*

* Keep the environmental layers anchored around the mountain.
    */
    auroraGroup.position.set(
    mountainCenter.x,
    mountainCenter.y - mountainSize.y * 0.05,
    mountainCenter.z,
    );

stars.position.set(
mountainCenter.x,
mountainCenter.y + mountainSize.y * 0.18,
mountainCenter.z,
);

return {
mountainBox,
mountainSize,
mountainCenter,
};
}

/* ––––––––––––––––––––––––––––––––––––– /
/ Lighting                                                                   /
/ ––––––––––––––––––––––––––––––––––––– */

const ambientLight = new THREE.AmbientLight(
0xb8d0e0,
0.42,
);

scene.add(ambientLight);

const moonLight = new THREE.DirectionalLight(
0xeaf6ff,
1.45,
);

moonLight.position.set(-120, 240, 180);
scene.add(moonLight);

const fillLight = new THREE.DirectionalLight(
0x6fa8c4,
0.65,
);

fillLight.position.set(180, 100, 80);
scene.add(fillLight);

const auroraRim = new THREE.PointLight(
0x88e0c0,
0.42,
420,
);

auroraRim.position.set(
0,
135,
-110,
);

scene.add(auroraRim);

/* ––––––––––––––––––––––––––––––––––––– /
/ Atmospheric haze                                                           /
/ ––––––––––––––––––––––––––––––––––––– */

const hazeGeometry = new THREE.PlaneGeometry(
520,
260,
);

function createHaze(intensity, position, scale) {
const material = new THREE.ShaderMaterial({
transparent: true,
depthWrite: false,
depthTest: false,
blending: THREE.AdditiveBlending,
uniforms: {
uColor: {
value: new THREE.Color(0x8ebbd3),
},
uIntensity: {
value: intensity,
},
},
vertexShader: `
varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position =
      projectionMatrix *
      modelViewMatrix *
      vec4(position, 1.0);
  }
`,
fragmentShader: `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    vec2 centered = vUv - 0.5;
    float radial = 1.0 - smoothstep(
      0.05,
      0.72,
      length(centered)
    );
    /*
     * The haze is deliberately subtle. It should provide depth at the
     * horizon without becoming a translucent page-wide veil.
     */
    float horizonMask =
      smoothstep(0.08, 0.34, vUv.y) *
      (1.0 - smoothstep(0.68, 0.96, vUv.y));
    float alpha =
      radial *
      horizonMask *
      uIntensity;
    gl_FragColor = vec4(uColor, alpha);
  }
`,

});

const mesh = new THREE.Mesh(
hazeGeometry.clone(),
material,
);

mesh.position.copy(position);
mesh.scale.set(scale, scale, 1);
mesh.renderOrder = -70;

return mesh;
}

const hazeGroup = new THREE.Group();

hazeGroup.add(
createHaze(
0.025,
new THREE.Vector3(0, -8, -55),
1.15,
),
);

hazeGroup.add(
createHaze(
0.018,
new THREE.Vector3(-120, 12, -90),
0.95,
),
);

hazeGroup.add(
createHaze(
0.015,
new THREE.Vector3(140, 18, -115),
1.05,
),
);

scene.add(hazeGroup);

/* ––––––––––––––––––––––––––––––––––––– /
/ Water / ice horizon                                                        /
/ ––––––––––––––––––––––––––––––––––––– */

const waterGeometry = new THREE.PlaneGeometry(
900,
60,
);

const waterMaterial = new THREE.ShaderMaterial({
transparent: true,
depthWrite: false,
depthTest: false,
uniforms: {
uTop: {
value: new THREE.Color(0x1c3046),
},
uBottom: {
value: new THREE.Color(0x03070d),
},
uShimmer: {
value: new THREE.Color(0x8dbbd0),
},
uTime: {
value: 0,
},
},
vertexShader: `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position =
    projectionMatrix *
    modelViewMatrix *
    vec4(position, 1.0);
}

, fragmentShader: 
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uShimmer;
uniform float uTime;

varying vec2 vUv;
void main() {
  float gradient = smoothstep(
    0.0,
    0.9,
    vUv.y
  );
  vec3 color = mix(
    uBottom,
    uTop,
    gradient
  );
  float ripple = sin(
    vUv.x * 32.0 +
    uTime * 0.18
  ) * 0.5 + 0.5;
  float shimmer = smoothstep(
    0.76,
    0.98,
    ripple
  ) * 0.07;
  color += uShimmer * shimmer;
  /*
   * Keep the reflection/frozen-horizon treatment extremely restrained.
   * It is a visual suggestion, not a second opaque surface.
   */
  float alpha =
    0.18 *
    smoothstep(0.08, 0.72, vUv.y);
  gl_FragColor = vec4(
    color,
    alpha
  );
}

`,
});

const water = new THREE.Mesh(
waterGeometry,
waterMaterial,
);

water.rotation.x = -Math.PI / 2;
water.position.set(0, -34, -6);
water.renderOrder = -10;

scene.add(water);

/* ––––––––––––––––––––––––––––––––––––– /
/ Foreground silhouette                                                      /
/ ––––––––––––––––––––––––––––––––––––– */

const foregroundGeometry = new THREE.PlaneGeometry(
800,
35,
);

const foregroundMaterial = new THREE.MeshBasicMaterial({
color: 0x010305,
transparent: true,
opacity: 0.82,
depthWrite: false,
depthTest: false,
});

const foreground = new THREE.Mesh(
foregroundGeometry,
foregroundMaterial,
);

foreground.position.set(
0,
-window.innerHeight * 0.05,
-25,
);

foreground.renderOrder = -5;

scene.add(foreground);

/* ––––––––––––––––––––––––––––––––––––– /
/ Load GLB                                                                  /
/ ––––––––––––––––––––––––––––––––––––– */

loader.load(
“/assets/models/mountains/single-mountain-snow.glb”,
(gltf) => {
if (destroyed) return;

try {
  prepareMountain(gltf);
  document.title = "ready";
} catch (error) {
  console.error("[Aura] mountain preparation failed", error);
  document.title = "error:no-scene";
}

},
undefined,
(error) => {
console.error(”[Aura] GLB load failed”, error);
document.title = “error:glb-load”;
},
);

/* ––––––––––––––––––––––––––––––––––––– /
/ Runtime controls                                                           /
/ ––––––––––––––––––––––––––––––––––––– */

window.addEventListener(“resize”, resize);

window.addEventListener(“message”, (event) => {
if (!event || !event.data) return;

if (event.data.type === “aura-pause”) {
paused = Boolean(event.data.paused);
}
});

/* ––––––––––––––––––––––––––––––––––––– /
/ Animation                                                                  /
/ ––––––––––––––––––––––––––––––––––––– */

function animate() {
if (destroyed) return;

animationFrame = requestAnimationFrame(animate);

if (paused) return;

const elapsed = clock.getElapsedTime();

auroraMaterial.uniforms.uTime.value = elapsed;

if (auroraFrontMaterial.uniforms.uTime) {
auroraFrontMaterial.uniforms.uTime.value = elapsed + 4.5;
}

waterMaterial.uniforms.uTime.value = elapsed;

/*

* Very restrained environmental movement. The mountain itself remains
* locked so the scene feels cinematic rather than like a moving wallpaper.
    */
    auroraGroup.rotation.y =
    Math.sin(elapsed * 0.018) * 0.012;

stars.rotation.y =
elapsed * 0.003;

renderer.render(scene, camera);
}

animate();

/* ––––––––––––––––––––––––––––––––––––– /
/ Cleanup                                                                    /
/ ––––––––––––––––––––––––––––––––––––– */

window.addEventListener(“beforeunload”, () => {
destroyed = true;

if (animationFrame) {
cancelAnimationFrame(animationFrame);
}

window.removeEventListener(“resize”, resize);

disposeObject(scene);

renderer.dispose();
});