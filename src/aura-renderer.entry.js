// Aura Borealis renderer — three.js + GLTFLoader + procedural cinematic
// environment.
//
// Antarctic Labs
//
// Architecture:
//   - Static HTML iframe entry point.
//   - Three.js runs entirely inside the iframe.
//   - GLB geometry remains unchanged.
//   - GLB's tiny embedded star meshes are discarded.
//   - Procedural environment is layered behind/around the mountain.
//   - Decorative environment failures never prevent the mountain from
//     rendering.
//   - WebGL / GLB failures are reported through document.title.
//
// Scene layers:
//   0  Sky dome
//   1  Aurora curtains
//   2  Procedural starfield
//   3  Mountain GLB
//   4  Atmospheric haze
//   5  Water / ice suggestion
//   6  Foreground silhouette
//
// Important runtime fixes retained:
//   - GLB mesh collection uses a child-array snapshot before reparenting.
//   - Mountain shader computes world position directly from modelMatrix.
//   - No dependency changes.
//   - DPR clamped to a reasonable range.
//   - Parent page can pause rendering through postMessage.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const GLB_URL = "/assets/models/mountains/single-mountain-snow.glb";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

(async function main() {
  let paused = false;
  let rafId = 0;
  let renderer = null;
  let scene = null;
  let camera = null;
  let mountainRoot = null;
  let startTime = 0;

  const mountainSize = new THREE.Vector3();
  const mountainCenter = new THREE.Vector3();

  // --------------------------------------------------------------------------
  // CANVAS / WEBGL
  // --------------------------------------------------------------------------

  const canvas = document.getElementById("c");

  if (!canvas) {
    console.error('Aura renderer: missing canvas #c');
    document.title = "error:no-canvas";
    return;
  }

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
  } catch (error) {
    console.error(
      "Aura renderer: WebGLRenderer creation failed:",
      error?.message || error
    );
    document.title = "no-webgl";
    return;
  }

  if (!renderer || !renderer.getContext()) {
    console.error("Aura renderer: WebGL context unavailable");
    document.title = "no-webgl";
    return;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // --------------------------------------------------------------------------
  // SCENE / CAMERA
  // --------------------------------------------------------------------------

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    40,
    1,
    0.1,
    5000
  );

  // --------------------------------------------------------------------------
  // LIGHTING
  // --------------------------------------------------------------------------

  const ambient = new THREE.AmbientLight(0xb8d0e0, 0.42);
  scene.add(ambient);

  const moon = new THREE.DirectionalLight(0xeaf6ff, 1.45);
  moon.position.set(120, 200, 100);
  scene.add(moon);

  const fill = new THREE.DirectionalLight(0x6fa8c4, 0.65);
  fill.position.set(-140, 100, -80);
  scene.add(fill);

  const auroraRim = new THREE.DirectionalLight(0x88e0c0, 0.42);
  auroraRim.position.set(0, -50, 180);
  scene.add(auroraRim);

  // --------------------------------------------------------------------------
  // LAYER 0 — SKY DOME
  // --------------------------------------------------------------------------

  const skyGeometry = new THREE.SphereGeometry(700, 32, 18);

  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTopColor: {
        value: new THREE.Color(0x03070f),
      },
      uUpperHorizon: {
        value: new THREE.Color(0x0b1929),
      },
      uLowerHorizon: {
        value: new THREE.Color(0x101e2b),
      },
      uGroundColor: {
        value: new THREE.Color(0x040910),
      },
    },
    vertexShader: `
      varying vec3 vWorldPos;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;

        gl_Position =
          projectionMatrix *
          viewMatrix *
          worldPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;

      uniform vec3 uTopColor;
      uniform vec3 uUpperHorizon;
      uniform vec3 uLowerHorizon;
      uniform vec3 uGroundColor;

      void main() {
        vec3 direction = normalize(vWorldPos);
        float h = direction.y;

        vec3 color;

        if (h >= 0.0) {
          color = mix(
            uUpperHorizon,
            uTopColor,
            smoothstep(0.0, 0.72, h)
          );
        } else {
          color = mix(
            uLowerHorizon,
            uGroundColor,
            smoothstep(0.0, 0.55, -h)
          );
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const sky = new THREE.Mesh(
    skyGeometry,
    skyMaterial
  );

  sky.renderOrder = -100;
  scene.add(sky);

  // --------------------------------------------------------------------------
  // LAYER 1 — AURORA CURTAINS
  // --------------------------------------------------------------------------
  //
  // This is deliberately built as an irregular curtain rather than a single
  // opaque green rectangle.
  //
  // The geometry is subdivided so the vertices themselves can drift slightly,
  // while the fragment shader creates the internal luminous ribbon structure.
  //
  // It is positioned relative to the camera after mountain framing is known.

  const auroraGeometry = new THREE.PlaneGeometry(
    900,
    360,
    40,
    20
  );

  const auroraMaterial = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: {
        value: 0,
      },
      uColorA: {
        value: new THREE.Color(0x48f59a),
      },
      uColorB: {
        value: new THREE.Color(0x51e8d0),
      },
      uColorC: {
        value: new THREE.Color(0xa2ffd8),
      },
    },
    vertexShader: `
      uniform float uTime;

      varying vec2 vUv;

      float hash(float n) {
        return fract(sin(n) * 43758.5453123);
      }

      void main() {
        vUv = uv;

        vec3 p = position;

        float waveA =
          sin(p.x * 0.018 + uTime * 0.12) * 8.0;

        float waveB =
          sin(p.x * 0.037 - uTime * 0.075) * 4.0;

        float envelope =
          smoothstep(0.0, 1.0, uv.y);

        p.z += (waveA + waveB) * envelope;

        gl_Position =
          projectionMatrix *
          modelViewMatrix *
          vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;

      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uColorC;

      float hash(vec2 p) {
        return fract(
          sin(dot(p, vec2(127.1, 311.7))) *
          43758.5453123
        );
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);

        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));

        vec2 u = f * f * (3.0 - 2.0 * f);

        return mix(
          mix(a, b, u.x),
          mix(c, d, u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;

        for (int i = 0; i < 4; i++) {
          value += amplitude * noise(p);
          p *= 2.0;
          amplitude *= 0.5;
        }

        return value;
      }

      void main() {
        vec2 uv = vUv;

        // Large-scale curtain movement.
        float slowWave =
          sin(
            uv.x * 7.0 +
            uTime * 0.08
          );

        float warpedX =
          uv.x +
          slowWave * 0.035;

        // Broad luminous vertical curtains.
        float curtainNoise =
          fbm(
            vec2(
              warpedX * 4.2,
              uv.y * 1.8 + uTime * 0.025
            )
          );

        float curtainBands =
          smoothstep(
            0.40,
            0.70,
            curtainNoise
          );

        // Fine internal structure.
        float detail =
          fbm(
            vec2(
              warpedX * 16.0 - uTime * 0.025,
              uv.y * 4.5
            )
          );

        float wisps =
          smoothstep(
            0.34,
            0.78,
            detail
          );

        // Stronger toward the upper/middle sky, fading before the horizon.
        float verticalFade =
          smoothstep(0.02, 0.20, uv.y) *
          (1.0 - smoothstep(0.58, 0.96, uv.y));

        // Feather the left/right edges of the entire curtain.
        float horizontalFade =
          smoothstep(0.0, 0.08, uv.x) *
          (1.0 - smoothstep(0.92, 1.0, uv.x));

        // Break up the lower edge so it doesn't become a rectangle.
        float lowerNoise =
          fbm(
            vec2(
              uv.x * 7.0,
              uTime * 0.018
            )
          );

        float lowerBreak =
          smoothstep(
            0.18,
            0.65,
            lowerNoise + uv.y * 0.65
          );

        float alpha =
          curtainBands *
          wisps *
          verticalFade *
          horizontalFade *
          lowerBreak *
          0.48;

        // Slight color movement from green through cyan to pale mint.
        float colorNoise =
          fbm(
            vec2(
              uv.x * 3.2 - uTime * 0.015,
              uv.y * 1.6
            )
          );

        vec3 color =
          mix(
            uColorA,
            uColorB,
            smoothstep(0.25, 0.68, colorNoise)
          );

        color =
          mix(
            color,
            uColorC,
            smoothstep(0.68, 0.94, colorNoise)
          );

        gl_FragColor =
          vec4(
            color * alpha,
            alpha
          );
      }
    `,
  });

  const aurora = new THREE.Mesh(
    auroraGeometry,
    auroraMaterial
  );

  aurora.renderOrder = -90;
  aurora.frustumCulled = false;
  scene.add(aurora);

  // --------------------------------------------------------------------------
  // LAYER 2 — PROCEDURAL STARFIELD
  // --------------------------------------------------------------------------

  function createStarfield() {
    const count = 2000;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const theta =
        Math.random() * Math.PI * 2;

      const phi =
        Math.acos(
          2 * Math.random() - 1
        ) * 0.72;

      const radius =
        480 +
        Math.random() * 70;

      const x =
        radius *
        Math.sin(phi) *
        Math.cos(theta);

      const y =
        radius *
        Math.cos(phi) *
        0.72 +
        70;

      const z =
        radius *
        Math.sin(phi) *
        Math.sin(theta);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const tint = Math.random();

      let r;
      let g;
      let b;

      if (tint < 0.72) {
        r = 1.0;
        g = 1.0;
        b = 1.0;
      } else if (tint < 0.93) {
        r = 0.72;
        g = 0.86;
        b = 1.0;
      } else {
        r = 1.0;
        g = 0.88;
        b = 0.72;
      }

      const brightness =
        Math.random() < 0.045
          ? 1.45
          : 0.48 + Math.random() * 0.52;

      colors[i * 3] = r * brightness;
      colors[i * 3 + 1] = g * brightness;
      colors[i * 3 + 2] = b * brightness;
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

    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(
        colors,
        3
      )
    );

    const material =
      new THREE.PointsMaterial({
        size: 1.55,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });

    const points =
      new THREE.Points(
        geometry,
        material
      );

    points.renderOrder = -80;
    points.frustumCulled = false;

    return points;
  }

  const starfield =
    createStarfield();

  scene.add(starfield);

  // --------------------------------------------------------------------------
  // LAYER 4 — ATMOSPHERIC HAZE
  // --------------------------------------------------------------------------

  function createHaze() {
    const group = new THREE.Group();

    const hazeDefinitions = [
      {
        x: -120,
        y: 75,
        z: -220,
        size: 420,
        intensity: 0.075,
      },
      {
        x: 110,
        y: 55,
        z: -170,
        size: 360,
        intensity: 0.06,
      },
      {
        x: 0,
        y: 95,
        z: -260,
        size: 460,
        intensity: 0.055,
      },
    ];

    for (const definition of hazeDefinitions) {
      const geometry =
        new THREE.PlaneGeometry(
          definition.size,
          definition.size
        );

      const material =
        new THREE.ShaderMaterial({
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          side: THREE.DoubleSide,
          uniforms: {
            uIntensity: {
              value: definition.intensity,
            },
            uColor: {
              value: new THREE.Color(
                0x8ebbd3
              ),
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
            varying vec2 vUv;

            uniform float uIntensity;
            uniform vec3 uColor;

            void main() {
              vec2 center =
                vUv - 0.5;

              float distanceFromCenter =
                length(center);

              float alpha =
                smoothstep(
                  0.50,
                  0.0,
                  distanceFromCenter
                ) *
                uIntensity;

              gl_FragColor =
                vec4(
                  uColor * alpha,
                  alpha
                );
            }
          `,
        });

      const mesh =
        new THREE.Mesh(
          geometry,
          material
        );

      mesh.position.set(
        definition.x,
        definition.y,
        definition.z
      );

      mesh.renderOrder = -70;
      mesh.frustumCulled = false;

      group.add(mesh);
    }

    return group;
  }

  const haze =
    createHaze();

  scene.add(haze);

  // --------------------------------------------------------------------------
  // LAYER 5 — WATER / ICE HORIZON
  // --------------------------------------------------------------------------

  const waterGeometry =
    new THREE.PlaneGeometry(
      900,
      100
    );

  const waterMaterial =
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      uniforms: {
        uColorTop: {
          value: new THREE.Color(
            0x243b58
          ),
        },
        uColorBottom: {
          value: new THREE.Color(
            0x03070d
          ),
        },
        uShimmer: {
          value: new THREE.Color(
            0x9fcfe4
          ),
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
        varying vec2 vUv;

        uniform vec3 uColorTop;
        uniform vec3 uColorBottom;
        uniform vec3 uShimmer;

        void main() {
          float gradient =
            smoothstep(
              0.0,
              1.0,
              vUv.y
            );

          vec3 color =
            mix(
              uColorTop,
              uColorBottom,
              gradient
            );

          float wave =
            sin(vUv.x * 65.0) *
            sin(
              vUv.x * 17.0 +
              vUv.y * 9.0
            );

          float shimmerMask =
            smoothstep(
              0.72,
              0.05,
              abs(vUv.y - 0.3)
            );

          color +=
            uShimmer *
            wave *
            shimmerMask *
            0.025;

          float alpha =
            0.65 *
            smoothstep(
              0.0,
              0.75,
              vUv.y
            );

          gl_FragColor =
            vec4(
              color,
              alpha
            );
        }
      `,
    });

  const water =
    new THREE.Mesh(
      waterGeometry,
      waterMaterial
    );

  water.rotation.x =
    -Math.PI / 2;

  water.renderOrder = -10;
  water.frustumCulled = false;

  scene.add(water);

  // --------------------------------------------------------------------------
  // LAYER 6 — FOREGROUND SILHOUETTE
  // --------------------------------------------------------------------------

  const foregroundGeometry =
    new THREE.PlaneGeometry(
      800,
      35
    );

  const foregroundMaterial =
    new THREE.MeshBasicMaterial({
      color: 0x010305,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      depthTest: false,
    });

  const foreground =
    new THREE.Mesh(
      foregroundGeometry,
      foregroundMaterial
    );

  foreground.renderOrder = -5;
  foreground.frustumCulled = false;

  scene.add(foreground);

  // --------------------------------------------------------------------------
  // MOUNTAIN SHADING HELPERS
  // --------------------------------------------------------------------------

  const SNOW_COLOR =
    new THREE.Color(0xf4f8fb);

  const STONE_COLOR =
    new THREE.Color(0x8a9aa6);

  const ROCK_COLOR =
    new THREE.Color(0x3d5360);

  // --------------------------------------------------------------------------
  // RESPONSIVE CAMERA
  // --------------------------------------------------------------------------

  function positionEnvironment() {
    if (!mountainRoot) {
      return;
    }

    const size =
      mountainSize;

    const center =
      mountainCenter;

    const aspect =
      camera.aspect;

    const portrait =
      aspect < 1.0;

    /*
     * The mountain GLB is unusually deep compared with its visible height.
     *
     * The previous implementation framed landscape mode using only size.y.
     * That placed the camera physically inside the GLB on some viewport
     * dimensions.
     *
     * We instead guarantee that the camera starts outside the front of the
     * mountain while still using the mountain height as the dominant visual
     * framing measurement.
     */

    const depthClearance =
      size.z * 0.62;

    const widthClearance =
      size.x * (
        portrait
          ? 0.52
          : 0.40
      );

    const heightClearance =
      size.y * (
        portrait
          ? 1.05
          : 0.92
      );

    const verticalFov =
      THREE.MathUtils.degToRad(
        camera.fov
      );

    const horizontalFov =
      2 *
      Math.atan(
        Math.tan(verticalFov / 2) *
        Math.max(
          aspect,
          0.25
        )
      );

    const heightDistance =
      heightClearance /
      (
        2 *
        Math.tan(
          verticalFov / 2
        )
      );

    const widthDistance =
      widthClearance /
      (
        2 *
        Math.tan(
          horizontalFov / 2
        )
      );

    const distance =
      Math.max(
        depthClearance,
        heightDistance,
        widthDistance,
        55
      );

    /*
     * Shift the visual target slightly upward.
     *
     * This prevents the mountain from sitting too low while leaving enough
     * sky above it for the aurora.
     */
    const targetY =
      center.y +
      size.y * (
        portrait
          ? 0.07
          : 0.03
      );

    const cameraY =
      center.y -
      size.y * (
        portrait
          ? 0.12
          : 0.08
      );

    camera.position.set(
      center.x,
      cameraY,
      center.z + distance
    );

    camera.lookAt(
      center.x,
      targetY,
      center.z
    );

    camera.updateProjectionMatrix();

    // Environment follows camera so it remains a background world rather
    // than drifting away as the camera composition changes.

    sky.position.copy(
      camera.position
    );

    starfield.position.copy(
      camera.position
    );

    haze.position.copy(
      camera.position
    );

    haze.position.z -= 90;

    /*
     * Aurora sits well above the mountain and slightly behind it.
     * Its rotation is deliberately mild; the shader provides most of the
     * organic movement.
     */
    aurora.position.set(
      camera.position.x,
      camera.position.y +
        size.y * 1.05,
      camera.position.z - 170
    );

    aurora.rotation.set(
      -0.10,
      0.0,
      0.0
    );

    /*
     * Water sits at the mountain base. It is intentionally subtle rather
     * than pretending to be a physically accurate reflection.
     */
    water.position.set(
      camera.position.x,
      center.y -
        size.y * 0.46,
      center.z -
        size.z * 0.18
    );

    /*
     * Foreground only occupies the very bottom edge.
     */
    foreground.position.set(
      camera.position.x,
      camera.position.y -
        size.y * 0.60,
      camera.position.z + 8
    );

    foreground.lookAt(
      camera.position
    );
  }

  function resize() {
    const width =
      Math.max(
        1,
        window.innerWidth
      );

    const height =
      Math.max(
        1,
        window.innerHeight
      );

    const dpr =
      clamp(
        window.devicePixelRatio || 1,
        1,
        1.75
      );

    renderer.setPixelRatio(
      dpr
    );

    renderer.setSize(
      width,
      height,
      false
    );

    camera.aspect =
      width / height;

    camera.updateProjectionMatrix();

    positionEnvironment();
  }

  window.addEventListener(
    "resize",
    resize,
    { passive: true }
  );

  resize();

  // --------------------------------------------------------------------------
  // PAUSE CONTROL
  // --------------------------------------------------------------------------

  window.addEventListener(
    "message",
    (event) => {
      if (!event.data) {
        return;
      }

      if (
        event.data.type ===
        "aura-controls"
      ) {
        paused = Boolean(
          event.data.controls &&
          event.data.controls.paused
        );
      }
    }
  );

  // --------------------------------------------------------------------------
  // RENDER LOOP
  // --------------------------------------------------------------------------

  function renderLoop(time) {
    rafId =
      requestAnimationFrame(
        renderLoop
      );

    if (startTime === 0) {
      startTime = time;
    }

    const elapsed =
      (time - startTime) / 1000;

    auroraMaterial.uniforms.uTime.value =
      elapsed;

    /*
     * Extremely slow movement only. The shader does the actual organic
     * animation; this rotation prevents the entire curtain from feeling
     * mathematically locked without making it visibly spin.
     */
    aurora.rotation.z =
      Math.sin(
        elapsed * 0.018
      ) * 0.025;

    if (
      !paused &&
      mountainRoot
    ) {
      renderer.render(
        scene,
        camera
      );
    }
  }

  rafId =
    requestAnimationFrame(
      renderLoop
    );

  // --------------------------------------------------------------------------
  // GLB LOAD
  // --------------------------------------------------------------------------

  console.log(
    "Aura renderer: loading GLB",
    GLB_URL
  );

  let gltf;

  try {
    const loader =
      new GLTFLoader();

    gltf =
      await loader.loadAsync(
        GLB_URL
      );
  } catch (error) {
    console.error(
      "Aura renderer: GLB load failed:",
      error?.message || error
    );

    document.title =
      "error:glb-load";

    if (rafId) {
      cancelAnimationFrame(
        rafId
      );
    }

    return;
  }

  if (
    !gltf ||
    !gltf.scene
  ) {
    console.error(
      "Aura renderer: GLB contains no scene"
    );

    document.title =
      "error:no-scene";

    return;
  }

  // --------------------------------------------------------------------------
  // MOUNTAIN EXTRACTION
  // --------------------------------------------------------------------------

  /*
   * IMPORTANT:
   *
   * Do not traverse the GLB while simultaneously reparenting children.
   * The earlier renderer could invalidate traversal state this way.
   *
   * Snapshot the complete mesh list first.
   */
  function snapshotMeshes(root) {
    const meshes = [];

    function walk(node) {
      if (!node) {
        return;
      }

      if (node.isMesh) {
        meshes.push(node);
      }

      const children =
        node.children
          ? node.children.slice()
          : [];

      for (const child of children) {
        walk(child);
      }
    }

    walk(root);

    return meshes;
  }

  const allMeshes =
    snapshotMeshes(
      gltf.scene
    );

  const mountainMeshes =
    allMeshes.filter(
      (mesh) =>
        mesh &&
        mesh.isMesh &&
        !(
          mesh.name ||
          ""
        )
          .toLowerCase()
          .includes("star")
    );

  if (
    mountainMeshes.length === 0
  ) {
    console.error(
      "Aura renderer: no mountain meshes found"
    );

    document.title =
      "error:no-mountain";

    return;
  }

  mountainRoot =
    new THREE.Group();

  mountainRoot.name =
    "AntarcticMountain";

  const mountainBox =
    new THREE.Box3();

  // --------------------------------------------------------------------------
  // MOUNTAIN MATERIALS / SHADER
  // --------------------------------------------------------------------------

  let processedMeshes = 0;

  for (
    const mesh of mountainMeshes
  ) {
    try {
      /*
       * Remove from original hierarchy before adding to the dedicated
       * mountain group.
       */
      if (
        mesh.parent &&
        typeof mesh.parent.remove ===
          "function"
      ) {
        mesh.parent.remove(
          mesh
        );
      }

      mountainRoot.add(
        mesh
      );

      mesh.updateMatrixWorld(
        true
      );

      if (
        !mesh.geometry
      ) {
        continue;
      }

      mesh.geometry.computeBoundingBox();

      if (
        mesh.geometry.boundingBox
      ) {
        const worldBox =
          mesh.geometry.boundingBox
            .clone()
            .applyMatrix4(
              mesh.matrixWorld
            );

        mountainBox.expandByPoint(
          worldBox.min
        );

        mountainBox.expandByPoint(
          worldBox.max
        );
      }

      const materials =
        Array.isArray(
          mesh.material
        )
          ? mesh.material
          : [mesh.material];

      for (
        const material of materials
      ) {
        if (!material) {
          continue;
        }

        if (
          "metalness" in material
        ) {
          material.metalness =
            0.0;
        }

        if (
          "roughness" in material
        ) {
          material.roughness =
            0.86;
        }

        if (
          "envMapIntensity" in material
        ) {
          material.envMapIntensity =
            0.0;
        }

        /*
         * Each material gets its own uniform objects. This avoids accidental
         * sharing if multiple meshes happen to reference the same material.
         */
        const uniforms = {
          uMinY: {
            value: 0,
          },
          uSpanY: {
            value: 1,
          },
          uSnowColor: {
            value:
              SNOW_COLOR.clone(),
          },
          uStoneColor: {
            value:
              STONE_COLOR.clone(),
          },
          uRockColor: {
            value:
              ROCK_COLOR.clone(),
          },
        };

        material.userData =
          material.userData || {};

        material.userData.auraUniforms =
          uniforms;

        material.onBeforeCompile =
          (shader) => {
            shader.uniforms.uMinY =
              uniforms.uMinY;

            shader.uniforms.uSpanY =
              uniforms.uSpanY;

            shader.uniforms.uSnowColor =
              uniforms.uSnowColor;

            shader.uniforms.uStoneColor =
              uniforms.uStoneColor;

            shader.uniforms.uRockColor =
              uniforms.uRockColor;

            /*
             * Do NOT depend on worldpos_vertex.
             *
             * Three.js can leave that chunk effectively unavailable for this
             * material configuration. Computing world position directly from
             * modelMatrix is reliable for MeshStandardMaterial.
             */
            shader.vertexShader =
              shader.vertexShader.replace(
                "#include <common>",
                `
                  #include <common>

                  varying vec3 vAuraWorldPos;
                `
              );

            shader.vertexShader =
              shader.vertexShader.replace(
                "#include <project_vertex>",
                `
                  #include <project_vertex>

                  vAuraWorldPos =
                    (modelMatrix *
                     vec4(position, 1.0)).xyz;
                `
              );

            shader.fragmentShader =
              shader.fragmentShader.replace(
                "#include <common>",
                `
                  #include <common>

                  varying vec3 vAuraWorldPos;

                  uniform float uMinY;
                  uniform float uSpanY;

                  uniform vec3 uSnowColor;
                  uniform vec3 uStoneColor;
                  uniform vec3 uRockColor;

                  vec3 auraSnowRockRamp(
                    float value
                  ) {
                    float t =
                      clamp(
                        value,
                        0.0,
                        1.0
                      );

                    if (t < 0.52) {
                      return mix(
                        uRockColor,
                        uStoneColor,
                        t / 0.52
                      );
                    }

                    return mix(
                      uStoneColor,
                      uSnowColor,
                      (t - 0.52) / 0.48
                    );
                  }
                `
              );

            shader.fragmentShader =
              shader.fragmentShader.replace(
                "#include <color_fragment>",
                `
                  #include <color_fragment>

                  float auraSnowT =
                    (
                      vAuraWorldPos.y -
                      uMinY
                    ) /
                    max(
                      uSpanY,
                      0.001
                    );

                  diffuseColor.rgb *=
                    auraSnowRockRamp(
                      auraSnowT
                    );
                `
              );
          };

        material.needsUpdate =
          true;
      }

      processedMeshes++;
    } catch (error) {
      /*
       * One malformed decorative mesh should not destroy the complete
       * mountain. Log it and continue processing the remaining meshes.
       */
      console.warn(
        "Aura renderer: skipped problematic mountain mesh",
        mesh.name || "(unnamed)",
        error?.message || error
      );
    }
  }

  scene.add(
    mountainRoot
  );

  // --------------------------------------------------------------------------
  // MOUNTAIN BOUNDS
  // --------------------------------------------------------------------------

  mountainBox.getSize(
    mountainSize
  );

  mountainBox.getCenter(
    mountainCenter
  );

  /*
   * If a malformed/incomplete bounding box somehow results in zero dimensions,
   * fail explicitly rather than producing a blank renderer with a broken
   * camera.
   */
  if (
    mountainSize.x <= 0 ||
    mountainSize.y <= 0 ||
    mountainSize.z <= 0
  ) {
    console.error(
      "Aura renderer: invalid mountain bounds",
      mountainSize
    );

    document.title =
      "error:invalid-bounds";

    return;
  }

  // --------------------------------------------------------------------------
  // APPLY SNOW / ROCK HEIGHT RANGE
  // --------------------------------------------------------------------------

  for (
    const mesh of mountainMeshes
  ) {
    if (
      !mesh ||
      !mesh.isMesh
    ) {
      continue;
    }

    const materials =
      Array.isArray(
        mesh.material
      )
        ? mesh.material
        : [mesh.material];

    for (
      const material of materials
    ) {
      if (
        !material ||
        !material.userData ||
        !material.userData.auraUniforms
      ) {
        continue;
      }

      const uniforms =
        material.userData
          .auraUniforms;

      uniforms.uMinY.value =
        mountainCenter.y -
        mountainSize.y / 2;

      uniforms.uSpanY.value =
        mountainSize.y;
    }
  }

  // --------------------------------------------------------------------------
  // FINAL CAMERA / ENVIRONMENT POSITION
  // --------------------------------------------------------------------------

  positionEnvironment();

  console.log(
    "Aura renderer: mountain ready"
  );

  console.log(
    "Aura renderer: processed meshes:",
    processedMeshes
  );

  console.log(
    "Aura renderer: mountain bounds:",
    {
      width: mountainSize.x,
      height: mountainSize.y,
      depth: mountainSize.z,
      center: {
        x: mountainCenter.x,
        y: mountainCenter.y,
        z: mountainCenter.z,
      },
    }
  );

  /*
   * This title is intentionally useful for runtime verification from the
   * parent document. It also gives us a clean diagnostic distinction between
   * a renderer that loaded and one that failed before the mountain existed.
   */
  document.title =
    "ready";
})().catch(
  (error) => {
    console.error(
      "Aura renderer: unhandled error:",
      error?.message || error,
      error?.stack || ""
    );

    document.title =
      "error:unhandled";
  }
);