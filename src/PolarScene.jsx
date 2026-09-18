// PolarScene.jsx
// Antarctic Labs — unified polar environment.
//
// Three layers compose the home background, all rendered into sandboxed
// iframes so their GPU/CPU cycles stay isolated from the main page:
//   1. polar-fog            CSS radial gradients (z=3, smoothstep-driven)
//   2. polar-constellation  DefenseLines particle rain (z=4, top)
//   3. polar-aura           Aura Borealis GLB mountain (z=2, replaces
//                           the former Strata cloud + Elemental water
//                           pair; no third shader iframe is needed).
//
// Constellation wrapper is inlined here to bypass Vite tree-shaking
// that drops the wrapper module entirely when only one named export
// is consumed. AuraBorealisField follows the same iframe-sandbox
// pattern so its WebGL renderer runs in its own context.

import { useEffect, useMemo, useRef, useState } from "react";
import { DefenseLines as ConstellationFieldNew } from "./shaders/neuform-isolated/NeuformBatchEffects";


// ============================================================================
// AuraBorealisField — iframe-sandboxed WebGL renderer for the Aura Borealis
// polar mountain GLB. Replaces the former Cloud (strata-cloud) and Water
// (elemental-marks) layers with a single 3D asset.
//
// The iframe keeps the GLB's WebGL context separate from the main page so
// the parent DOM and React reconciliation never block on GLB parsing.
// On load the iframe frames a camera on the asset's bounding box, scales
// it to fit a 40° FOV, and renders one frame per requestAnimationFrame
// tick. The `paused` prop is forwarded to the iframe via postMessage so
// the parent page can halt the render loop when the tab is hidden.
//
// On any error during GLB load or scene build the iframe renders nothing
// (transparent canvas) so the rest of the polar scene stays intact —
// satisfies the HANDOFF rule "Do not make the optional hero GLB a hard
// runtime dependency".
// ============================================================================

const AURA_GLB_URL = "/assets/models/mountains/single-mountain-snow.glb";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function buildAuraSource(glbUrl) {
  const urlJson = JSON.stringify(glbUrl);
  const srcdoc = `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
canvas{display:block;width:100%;height:100%}
</style></head>
<body>
<canvas id="c"></canvas>
<script>
(function () {
  var canvas = document.getElementById("c");
  var gl = canvas.getContext("webgl2", { antialias: true, alpha: true })
        || canvas.getContext("webgl",  { antialias: true, alpha: true });
  if (!gl) { document.title = "no-webgl"; return; }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    var w = Math.max(1, Math.floor(window.innerWidth * dpr));
    var h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }
  resize();
  window.addEventListener("resize", resize);

  var VERT = "#version 300 es\\nin vec3 a_position;in vec3 a_normal;uniform mat4 u_proj;uniform mat4 u_view;uniform mat4 u_model;uniform mat3 u_normalMatrix;out vec3 v_normal;out vec3 v_worldPos;void main(){v_normal=normalize((u_normalMatrix*a_normal).xyz);vec4 wp=u_model*vec4(a_position,1.0);v_worldPos=wp.xyz;gl_Position=u_proj*u_view*wp;}";
  var FRAG = "#version 300 es\\nprecision highp float;in vec3 v_normal;in vec3 v_worldPos;uniform vec3 u_lightDir;uniform vec3 u_baseColor;uniform float u_opacity;out vec4 outColor;void main(){vec3 N=normalize(v_normal);float diffuse=max(dot(N,normalize(u_lightDir)),0.0);float ambient=0.55;float l=ambient+(1.0-ambient)*diffuse;vec3 color=u_baseColor*l;outColor=vec4(color,u_opacity);}";

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("Shader compile failed", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }
  function link() {
    var isGLSL3 = gl.getParameter(gl.VERSION).indexOf("WebGL 2") >= 0;
    var fs = isGLSL3 ? FRAG : "precision mediump float;\\n" + FRAG.replace(/^#version 300 es\\n/, "");
    var p = gl.createProgram();
    var vs = compile(gl.VERTEX_SHADER, isGLSL3 ? VERT : VERT.replace(/^#version 300 es\\n/, ""));
    var fsObj = compile(gl.FRAGMENT_SHADER, fs);
    if (!vs || !fsObj) { document.title = "shader-fail"; return null; }
    gl.attachShader(p, vs); gl.attachShader(p, fsObj);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error("Program link failed", gl.getProgramInfoLog(p));
      gl.deleteProgram(p);
      return null;
    }
    return p;
  }
  var prog = link();
  if (!prog) return;

  var aPos = gl.getAttribLocation(prog, "a_position");
  var aNorm = gl.getAttribLocation(prog, "a_normal");
  var uProj = gl.getUniformLocation(prog, "u_proj");
  var uView = gl.getUniformLocation(prog, "u_view");
  var uModel = gl.getUniformLocation(prog, "u_model");
  var uNormal = gl.getUniformLocation(prog, "u_normalMatrix");
  var uLight = gl.getUniformLocation(prog, "u_lightDir");
  var uBase = gl.getUniformLocation(prog, "u_baseColor");
  var uOpacity = gl.getUniformLocation(prog, "u_opacity");

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  function parseGLB(buffer) {
    var dv = new DataView(buffer);
    var magic = dv.getUint32(0, true);
    if (magic !== 0x46546C67) throw new Error("Not a GLB");
    var length = dv.getUint32(8, true);
    var off = 12;
    var json = null, bin = null;
    while (off < length) {
      var chunkLen = dv.getUint32(off, true); off += 4;
      var chunkType = dv.getUint32(off, true); off += 4;
      var data = new Uint8Array(buffer, off, chunkLen); off += chunkLen;
      if (chunkType === 0x4E4F534A) json = JSON.parse(new TextDecoder("utf-8").decode(data));
      else if (chunkType === 0x004E4942) bin = data;
    }
    return { json: json, bin: bin };
  }

  function mat4InverseTransposeUpper3(m) {
    var a = m[0], b = m[1], c = m[2];
    var d = m[4], e = m[5], f = m[6];
    var g = m[8], h = m[9], i = m[10];
    var A = e*i - f*h, B = f*g - d*i, C = d*h - e*g;
    var det = a*A + b*B + c*C;
    if (Math.abs(det) < 1e-12) return new Float32Array([1,0,0,0,1,0,0,0,1]);
    var invDet = 1.0 / det;
    var r = new Float32Array(9);
    r[0] = A*invDet;                r[1] = B*invDet;                r[2] = C*invDet;
    r[3] = (c*h - b*i)*invDet;       r[4] = (a*i - c*g)*invDet;       r[5] = (b*g - a*h)*invDet;
    r[6] = (b*f - c*e)*invDet;       r[7] = (c*d - a*f)*invDet;       r[8] = (a*e - b*d)*invDet;
    return r;
  }

  function ident4() { var m = new Float32Array(16); m[0]=m[5]=m[10]=m[15]=1; return m; }
  function translate4(x, y, z) { var m = ident4(); m[12]=x; m[13]=y; m[14]=z; return m; }
  function scale4(sx, sy, sz) { var m = ident4(); m[0]=sx; m[5]=sy; m[10]=sz; return m; }
  function perspective4(fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    var m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f;
    m[10] = (far + near) * nf; m[11] = -1;
    m[14] = 2 * far * near * nf;
    return m;
  }
  function lookAt4(eyeX, eyeY, eyeZ, ctrX, ctrY, ctrZ, upX, upY, upZ) {
    var zx = eyeX - ctrX, zy = eyeY - ctrY, zz = eyeZ - ctrZ;
    var zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    var xx = upY * zz - upZ * zy;
    var xy = upZ * zx - upX * zz;
    var xz = upX * zy - upY * zx;
    var xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy;
    var yy = zz * xx - zx * xz;
    var yz = zx * xy - zy * xx;
    var m = new Float32Array(16);
    m[0]=xx; m[1]=yx; m[2]=zx; m[3]=0;
    m[4]=xy; m[5]=yy; m[6]=zy; m[7]=0;
    m[8]=xz; m[9]=yz; m[10]=zz; m[11]=0;
    m[12]=-(xx*eyeX+xy*eyeY+xz*eyeZ);
    m[13]=-(yx*eyeX+yy*eyeY+yz*eyeZ);
    m[14]=-(zx*eyeX+zy*eyeY+zz*eyeZ);
    m[15]=1;
    return m;
  }
  function mul4(a, b) {
    var o = new Float32Array(16);
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) {
        o[j*4+i] = a[i]*b[j*4] + a[i+4]*b[j*4+1] + a[i+8]*b[j*4+2] + a[i+12]*b[j*4+3];
      }
    }
    return o;
  }
  function composeNodeTRS(translation, rotation, scale) {
    var m = ident4();
    if (translation) m = mul4(m, translate4(translation[0], translation[1], translation[2]));
    if (rotation) {
      var qx = rotation[0], qy = rotation[1], qz = rotation[2], qw = rotation[3];
      var x2 = qx+qx, y2 = qy+qy, z2 = qz+qz;
      var xx = qx*x2, xy = qx*y2, xz = qx*z2;
      var yy = qy*y2, yz = qy*z2, zz = qz*z2;
      var wx = qw*x2, wy = qw*y2, wz = qw*z2;
      var rm = new Float32Array(16);
      rm[0]=1-(yy+zz); rm[1]=xy+wz;     rm[2]=xz-wy;     rm[3]=0;
      rm[4]=xy-wz;     rm[5]=1-(xx+zz); rm[6]=yz+wx;     rm[7]=0;
      rm[8]=xz+wy;     rm[9]=yz-wx;     rm[10]=1-(xx+yy);rm[11]=0;
      rm[12]=0; rm[13]=0; rm[14]=0; rm[15]=1;
      m = mul4(m, rm);
    }
    if (scale) m = mul4(m, scale4(scale[0], scale[1], scale[2]));
    return m;
  }

  var paused = false;
  var rafId = 0;
  var startTime = 0;
  var meshDrawables = [];
  var lightDir = [-0.6, 0.8, 0.45];

  window.addEventListener("message", function (e) {
    if (!e.data) return;
    if (e.data.type === "aura-controls") {
      paused = Boolean(e.data.controls && e.data.controls.paused);
    }
  });

  var proj = new Float32Array(16);
  var view = new Float32Array(16);

  function drawScene() {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(prog);
    gl.uniformMatrix4fv(uProj, false, proj);
    gl.uniformMatrix4fv(uView, false, view);
    gl.uniform3f(uLight, lightDir[0], lightDir[1], lightDir[2]);
    gl.uniform1f(uOpacity, 1.0);

    for (var i = 0; i < meshDrawables.length; i++) {
      var d = meshDrawables[i];
      gl.uniformMatrix4fv(uModel, false, d.model);
      gl.uniformMatrix3fv(uNormal, false, d.normalMatrix);
      gl.uniform3f(uBase, d.color[0], d.color[1], d.color[2]);

      gl.bindBuffer(gl.ARRAY_BUFFER, d.vbo);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
      if (aNorm >= 0 && d.hasNormals) {
        gl.enableVertexAttribArray(aNorm);
        gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 24, 12);
      } else {
        gl.disableVertexAttribArray(aNorm);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, d.ibo);
      gl.drawElements(gl.TRIANGLES, d.indexCount, d.indexType, 0);
    }
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    if (!paused) drawScene();
  }

  function buildDrawables(gltf) {
    var draws = [];
    var bin = gltf.bin;

    function accessorData(accIndex) {
      var acc = gltf.json.accessors[accIndex];
      var bv = gltf.json.bufferViews[acc.bufferView];
      var byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
      var compSize = ({5126:4,5123:2,5125:4,5122:2,5121:1})[acc.componentType] || 0;
      var typeCount = ({SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16})[acc.type] || 0;
      var stride = bv.byteStride || (compSize * typeCount);
      return { dv: new DataView(bin.buffer, bin.byteOffset, bin.byteLength), byteOffset: byteOffset, count: acc.count, stride: stride, compType: acc.componentType };
    }

    function buildMesh(meshIndex, worldMatrix) {
      var mesh = gltf.json.meshes[meshIndex];
      if (!mesh || !mesh.primitives || !mesh.primitives.length) return null;
      var prim = mesh.primitives[0];
      if (!prim.attributes || prim.attributes.POSITION == null) return null;
      var posAcc = accessorData(prim.attributes.POSITION);
      var normAcc = prim.attributes.NORMAL != null ? accessorData(prim.attributes.NORMAL) : null;
      var idxAcc = prim.indices != null ? accessorData(prim.indices) : null;
      if (!idxAcc) return null;

      var vCount = posAcc.count;
      var interleaved = new Float32Array(vCount * 6);
      for (var i = 0; i < vCount; i++) {
        var pOff = posAcc.byteOffset + i * posAcc.stride;
        interleaved[i*6+0] = posAcc.dv.getFloat32(pOff + 0, true);
        interleaved[i*6+1] = posAcc.dv.getFloat32(pOff + 4, true);
        interleaved[i*6+2] = posAcc.dv.getFloat32(pOff + 8, true);
        if (normAcc) {
          var nOff = normAcc.byteOffset + i * normAcc.stride;
          interleaved[i*6+3] = normAcc.dv.getFloat32(nOff + 0, true);
          interleaved[i*6+4] = normAcc.dv.getFloat32(nOff + 4, true);
          interleaved[i*6+5] = normAcc.dv.getFloat32(nOff + 8, true);
        } else {
          interleaved[i*6+3] = 0; interleaved[i*6+4] = 1; interleaved[i*6+5] = 0;
        }
      }

      var vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);

      var idxType = idxAcc.compType === 5123 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;
      var idxData;
      if (idxAcc.compType === 5123) {
        idxData = new Uint16Array(idxAcc.count);
        for (var j = 0; j < idxAcc.count; j++) idxData[j] = idxAcc.dv.getUint16(idxAcc.byteOffset + j * idxAcc.stride, true);
      } else {
        idxData = new Uint32Array(idxAcc.count);
        for (var j = 0; j < idxAcc.count; j++) idxData[j] = idxAcc.dv.getUint32(idxAcc.byteOffset + j * idxAcc.stride, true);
      }
      var ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxData, gl.STATIC_DRAW);

      var meshName = (mesh.name || "");
      var isStar = meshIndex === 17 || meshName.indexOf("Star") >= 0;
      var isRock = meshName.indexOf("Rock") >= 0;
      var h = (meshIndex * 0.137) % 1;
      var base = 0.50 + 0.20 * Math.abs(Math.sin(h * 6.28));
      var tint = 0.05 * Math.abs(Math.sin(h * 6.28 + 2.0));
      var r, g, b;
      if (isStar) { r = 0.85; g = 0.92; b = 1.00; }
      else if (isRock) { r = 0.45 + tint; g = 0.50 + tint; b = 0.58; }
      else { r = 0.40 + tint; g = 0.46 + tint; b = 0.55 + tint; }

      return {
        vbo: vbo, ibo: ibo,
        stride: 24,
        hasNormals: !!normAcc,
        indexCount: idxAcc.count,
        indexType: idxType,
        model: worldMatrix,
        normalMatrix: mat4InverseTransposeUpper3(worldMatrix),
        color: [r, g, b],
      };
    }

    function walk(nodeIndex, parentMatrix) {
      var node = gltf.json.nodes[nodeIndex];
      if (!node) return;
      var local;
      if (node.matrix) local = new Float32Array(node.matrix);
      else local = composeNodeTRS(node.translation, node.rotation, node.scale);
      var world = parentMatrix ? mul4(parentMatrix, local) : local;
      if (node.mesh != null) {
        var draw = buildMesh(node.mesh, world);
        if (draw) draws.push(draw);
      }
      if (node.children) {
        for (var k = 0; k < node.children.length; k++) walk(node.children[k], world);
      }
    }

    var scene = gltf.json.scenes ? gltf.json.scenes[gltf.json.scene || 0] : null;
    if (scene && scene.nodes) {
      for (var s = 0; s < scene.nodes.length; s++) walk(scene.nodes[s], ident4());
    }
    return draws;
  }

  // The GLB's scene-level bbox (from prior offline inspection):
  //   min (-94.02, -7.79, -164.46), max (94.55, 112.38, 88.22)
  //   size (188.57 x 120.17 x 252.67), center (0.26, 52.29, -38.12)
  var SCENE_BBOX = {
    min: [-94.02, -7.79, -164.46],
    max: [94.55, 112.38, 88.22],
    size: [188.57, 120.17, 252.67],
    center: [0.26, 52.29, -38.12],
  };

  function setupCamera() {
    var aspect = window.innerWidth / window.innerHeight;
    var fov = 40 * Math.PI / 180;
    var halfFovTan = Math.tan(fov / 2);
    var halfH = SCENE_BBOX.size[1] / 2;
    var halfW = SCENE_BBOX.size[0] / 2;
    var halfD = SCENE_BBOX.size[2] / 2;
    var dist = Math.max(halfH, halfW / aspect, halfD) / halfFovTan;
    dist *= 1.35;
    var eye = [SCENE_BBOX.center[0], SCENE_BBOX.center[1], SCENE_BBOX.center[2] + dist];
    view = lookAt4(eye[0], eye[1], eye[2], SCENE_BBOX.center[0], SCENE_BBOX.center[1], SCENE_BBOX.center[2], 0, 1, 0);
    proj = perspective4(fov, aspect, 0.1, dist * 4);
  }

  fetch(${urlJson}).then(function (r) {
    if (!r.ok) throw new Error("GLB fetch failed: " + r.status);
    return r.arrayBuffer();
  }).then(function (buf) {
    var parsed = parseGLB(buf);
    var gltf = parsed.json;
    if (!gltf.scenes || !gltf.scenes.length) throw new Error("GLB has no scenes");
    meshDrawables = buildDrawables(gltf);
    if (!meshDrawables.length) throw new Error("No drawable meshes in GLB");
    startTime = performance.now();
    setupCamera();
    document.title = "ready";
    rafId = requestAnimationFrame(loop);
  }).catch(function (err) {
    console.error("Aura loader error:", err && err.message ? err.message : err);
    document.title = "error";
  });
})();
</script>
</body></html>`;
  return srcdoc;
}

function AuraBorealisField({ opacity, paused }) {
  const iframeRef = useRef(null);
  const source = useMemo(() => buildAuraSource(AURA_GLB_URL), []);
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      { type: "aura-controls", controls: { paused: Boolean(paused) } },
      "*"
    );
  }, [paused, source]);
  return (
    <div
      className="polar-layer polar-aura"
      aria-hidden="true"
      style={{
        position: "fixed", inset: 0, zIndex: 2, pointerEvents: "none",
        opacity: clamp(opacity, 0.05, 1),
        transition: "opacity 160ms linear",
      }}
    >
      <iframe
        ref={iframeRef}
        title="Aura Borealis polar background"
        srcDoc={source}
        onLoad={() => {
          const iframe = iframeRef.current;
          if (!iframe || !iframe.contentWindow) return;
          iframe.contentWindow.postMessage(
            { type: "aura-controls", controls: { paused: Boolean(paused) } },
            "*"
          );
        }}
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: "absolute", inset: 0, display: "block",
          width: "100%", height: "100%", border: 0,
          background: "transparent",
        }}
      />
    </div>
  );
}

// ============================================================================
// PolarScene — orchestrator
// ============================================================================
export default function PolarScene() {
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const rafRef = useRef(null);

  useEffect(() => {
    let ticking = false;
    const compute = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const p = Math.min(1, Math.max(0, window.scrollY / max));
      setProgress(p);
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        rafRef.current = requestAnimationFrame(compute);
      }
    };
    const onVisibility = () => setPaused(document.hidden);
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const constellationOpacity =
    smoothstep(0.0, 0.05, 1 - progress) *
    smoothstep(0.42, 0.62, 1 - progress);
  // Aura layer: visible across most of the page, fades out near the very bottom.
  const auraOpacity = 1 - smoothstep(0.55, 0.95, progress);
  // Atmospheric veil — peaks during constellation→aura handoff so the
  // DefenseLines rain and the mountain read as one continuous polar world.
  const fogOpacity =
    smoothstep(0.40, 0.55, progress) *
    (1 - smoothstep(0.78, 0.88, progress));

  return (
    <div className="polar-scene" aria-hidden="true">
      <div
        className="polar-layer polar-fog"
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 3,
          pointerEvents: "none",
          opacity: fogOpacity,
          transition: "opacity 160ms linear",
          background: [
            "radial-gradient(60% 50% at 20% 35%, rgba(180, 210, 235, 0.55) 0%, rgba(180, 210, 235, 0) 60%)",
            "radial-gradient(55% 45% at 78% 50%, rgba(150, 185, 220, 0.50) 0%, rgba(150, 185, 220, 0) 65%)",
            "radial-gradient(70% 55% at 50% 75%, rgba(120, 160, 205, 0.45) 0%, rgba(120, 160, 205, 0) 70%)",
            "radial-gradient(80% 60% at 35% 20%, rgba(200, 220, 240, 0.40) 0%, rgba(200, 220, 240, 0) 65%)",
          ].join(", "),
          filter: "blur(40px)",
          mixBlendMode: "screen",
          willChange: "opacity",
        }}
      />
      <div
        className="polar-layer polar-constellation"
        aria-hidden="true"
        style={{
          position: "fixed", inset: 0, zIndex: 4, pointerEvents: "none",
          opacity: constellationOpacity, transition: "opacity 160ms linear",
        }}
      >
        <ConstellationFieldNew
          variant="defense-lines"
          mode="dark"
          speed={3.00}
          size={0.35}
          length={0.35}
          density={1.99}
          opacity={1.00}
          hue={1}
          saturation={0.00}
          brightness={1.65}
        />
      </div>
      <AuraBorealisField opacity={auraOpacity} paused={paused} />
    </div>
  );
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
