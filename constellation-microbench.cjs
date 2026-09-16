// Micro-benchmark: run the exact constellation animate() function body at 390x844
// with DPR=2 (capped), for 482 particles. Measure per-frame work time.

const fs = require('fs');
const html = fs.readFileSync('src/shaders/neuform-isolated/sources/particle-network.html', 'utf-8');

// Extract animate() function from the source. We'll instrument it.
const animateMatch = html.match(/function animate\(\)\s*\{[\s\S]*?\n\s*\}/);
if (!animateMatch) { console.error('animate() not found in source'); process.exit(1); }

// Build a minimal canvas+ctx mock that counts operations
const WIDTH = 390, HEIGHT = 844, DPR = 2;
const CSS_W = WIDTH, CSS_H = HEIGHT;
const canvas = {
  width: Math.floor(WIDTH * DPR),
  height: Math.floor(HEIGHT * DPR),
  style: {},
  getContext() { return ctx; },
};
const ctx = {
  _fillRectCount: 0,
  _beginPathCount: 0,
  _strokeCount: 0,
  _setTransformCount: 0,
  setTransform() { this._setTransformCount++; },
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  lineCap: '',
  lineJoin: '',
  fillRect() { this._fillRectCount++; },
  beginPath() { this._beginPathCount++; },
  moveTo() {},
  lineTo() {},
  stroke() { this._strokeCount++; },
};

// Build the full constellation loop. We'll inline the animate() function.
const Particle = function () {
  this.x = (Math.random() - 0.5) * 1000;
  this.y = (Math.random() - 0.5) * 1000;
  this.z = Math.random() * 1000;
  this.speed = (Math.random() * 2 + 1);
  this.color = `rgb(200, 220, 255)`;
  this.length = Math.random() * 2 + 0.5;
};
Particle.prototype.reset = function () {
  const angle = Math.random() * Math.PI * 2;
  const radius = 200 + Math.random() * 800;
  this.x = Math.cos(angle) * radius;
  this.y = (Math.sin(angle) * radius) - 150;
  this.z = 1000;
};
Particle.prototype.update = function () {
  this.z -= this.speed;
  if (this.z <= 0) this.reset();
};
Particle.prototype.draw = function () {
  const fov = 300;
  const originX = CSS_W / 2, originY = CSS_H / 2;
  const scale = fov / this.z;
  const px = originX + this.x * scale;
  const py = originY + this.y * scale;
  const prevZ = this.z + this.speed * this.length;
  const prevScale = fov / prevZ;
  const prevPx = originX + this.x * prevScale;
  const prevPy = originY + this.y * prevScale;
  let opacity = 1 - (this.z / 1000);
  if (this.z < 100) opacity = this.z / 100;
  if (opacity < 0) opacity = 0;
  ctx.beginPath();
  ctx.moveTo(prevPx, prevPy);
  ctx.lineTo(px, py);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
};

// Run N frames, time each frame
const PARTICLES = 482;
const particles = Array.from({length: PARTICLES}, () => new Particle());

console.log(`Particles: ${PARTICLES}`);
console.log(`Canvas (CSS): ${CSS_W}x${CSS_H}`);
console.log(`Canvas (backing): ${canvas.width}x${canvas.height}`);
console.log(`DPR: ${DPR}`);
console.log('');

const TRIAL_FRAMES = 50;
const frameTimes = [];
const trialStart = process.hrtime.bigint();

// Run TRIAL_FRAMES frames. For each: 1 fillRect + 482 particles (each does beginPath + stroke)
for (let f = 0; f < TRIAL_FRAMES; f++) {
  const t0 = process.hrtime.bigint();
  // The full animate() body
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, CSS_W, CSS_H);  // full-canvas fade
  for (let i = 0; i < PARTICLES; i++) {
    particles[i].update();
    particles[i].draw();
  }
  const t1 = process.hrtime.bigint();
  frameTimes.push(Number(t1 - t0) / 1e6);  // ms
}

const trialEnd = process.hrtime.bigint();
const totalMs = Number(trialEnd - trialStart) / 1e6;

const sorted = frameTimes.slice().sort((a, b) => a - b);
const sum = frameTimes.reduce((a, b) => a + b, 0);
console.log(`=== Constellation render loop benchmark (${TRIAL_FRAMES} frames) ===`);
console.log(`  avg per-frame work: ${(sum / TRIAL_FRAMES).toFixed(3)} ms`);
console.log(`  median:             ${sorted[Math.floor(TRIAL_FRAMES / 2)].toFixed(3)} ms`);
console.log(`  p95:                ${sorted[Math.floor(TRIAL_FRAMES * 0.95)].toFixed(3)} ms`);
console.log(`  max:                ${sorted[TRIAL_FRAMES - 1].toFixed(3)} ms`);
console.log(`  total:              ${totalMs.toFixed(2)} ms`);
console.log('');
console.log(`=== Operation counts (per frame) ===`);
console.log(`  fillRect:           ${ctx._fillRectCount / TRIAL_FRAMES}  (1 expected)`);
console.log(`  beginPath:          ${ctx._beginPathCount / TRIAL_FRAMES}  (${PARTICLES} expected)`);
console.log(`  stroke:             ${ctx._strokeCount / TRIAL_FRAMES}  (${PARTICLES} expected)`);

// Test what happens at lower particle counts
console.log('');
console.log('=== Comparison: particle counts ===');
for (const n of [200, 300, 482]) {
  // Use a subset of the existing particles
  const start = process.hrtime.bigint();
  for (let f = 0; f < 20; f++) {
    ctx.fillRect(0, 0, CSS_W, CSS_H);
    for (let i = 0; i < n; i++) {
      particles[i].update();
      particles[i].draw();
    }
  }
  const end = process.hrtime.bigint();
  const avgFrame = Number(end - start) / 1e6 / 20;
  console.log(`  ${n} particles: ${avgFrame.toFixed(3)} ms/frame`);
}
