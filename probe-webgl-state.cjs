const puppeteer = require('puppeteer-core');
const fs = require('fs');

const cloudSrc = fs.readFileSync('/tmp/cloud-with-markers.html', 'utf-8');

const focusStyles = `<style data-threeui-focus>
html, body { width: 100% !important; height: 100% !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #071010 !important; }
body { position: relative !important; }
nav, main, header, aside, footer { display: none !important; }
#c {
  display: block !important;
  visibility: visible !important;
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: 0 !important;
  pointer-events: none !important;
}
body > * { visibility: hidden !important; }
body[data-threeui-ready] > [data-threeui-role] { visibility: visible !important; }
[data-threeui-residual] { display: none !important; }
[data-threeui-role="background"] { position: fixed !important; inset: 0 !important; width: 100% !important; height: 100% !important; max-width: none !important; max-height: none !important; z-index: 0 !important; opacity: 1 !important; pointer-events: none !important; }
</style>`;
const focusJson = JSON.stringify([{ selector: '#c', role: 'background' }]).replace(/</g, '\\u003c');
const controlScript = `<script data-threeui-controls>
(function () {
  var noopTimeline = { to: function() { return noopTimeline; }, from: function() { return noopTimeline; }, fromTo: function() { return noopTimeline; }, set: function() { return noopTimeline; }, stagger: function() { return noopTimeline; }, killTweensOf: function() {}, kill: function() {} };
  var noopPlugin = function() {};
  noopPlugin.refresh = function() {};
  var noopGsapFn = function() { return noopTimeline; };
  noopGsapFn.to = function() { return noopTimeline; };
  noopGsapFn.from = function() { return noopTimeline; };
  noopGsapFn.fromTo = function() { return noopTimeline; };
  noopGsapFn.set = function() { return noopTimeline; };
  noopGsapFn.registerPlugin = function() {};
  noopGsapFn.timeline = function() { return noopTimeline; };
  noopGsapFn.context = noopGsapFn;
  if (typeof window.gsap === 'undefined') window.gsap = noopGsapFn;
  if (typeof window.ScrollTrigger === 'undefined') window.ScrollTrigger = noopPlugin;
  window.__SF_CONTROLS = { mode: 'dark', speed: 1, opacity: 1 };
})();
</script>`;
const focusScript = `<script data-threeui-focus>
(function () {
  var isolated = false;
  function isolate() {
    if (isolated) return;
    var specs = ${focusJson};
    var roots = [];
    specs.forEach(function (spec) {
      var element = document.querySelector(spec.selector);
      if (!element) return;
      element.setAttribute('data-threeui-role', spec.role);
      if (!roots.some(function (root) { return root.contains(element); })) roots.push(element);
    });
    if (!roots.length) return;
    isolated = true;
    roots.forEach(function (root) { document.body.appendChild(root); });
    Array.from(document.body.children).forEach(function (element) {
      if (roots.indexOf(element) !== -1) return;
      element.setAttribute('data-threeui-residual', '');
    });
    document.body.setAttribute('data-threeui-ready', '');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(isolate, 100); }, { once: true });
  } else {
    setTimeout(isolate, 100);
  }
  window.addEventListener('load', isolate, { once: true });
})();
</script>`;

// Probe: capture WebGL state at key moments
const probe = `<script data-cloud-probe>
(function() {
  window.__probeEvents = [];
  function record(stage, data) {
    window.__probeEvents.push({ stage: stage, data: data, t: performance.now() });
  }
  window.addEventListener('error', function(e) {
    record('window.error', { message: e.message, lineno: e.lineno, stack: (e.error && e.error.stack || '').slice(0, 400) });
  });
  ['log','warn','error','info','debug'].forEach(function(level) {
    var orig = console[level].bind(console);
    console[level] = function() {
      record('console.' + level, { args: Array.prototype.slice.call(arguments).map(function(a) { try { return String(a); } catch (e) { return '?'; } }).slice(0, 3) });
      return orig.apply(console, arguments);
    };
  });

  // Track canvas attribute changes via MutationObserver
  var c = document.getElementById('c');
  if (c) {
    record('canvas-initial', { width: c.width, height: c.height, dpr: window.devicePixelRatio, iw: window.innerWidth, ih: window.innerHeight });
    new MutationObserver(function() {
      record('canvas-mutated', { width: c.width, height: c.height, styleW: c.style.width, styleH: c.style.height, attrDisplay: getComputedStyle(c).display });
    }).observe(c, { attributes: true, attributeFilter: ['width', 'height', 'style'] });
  }

  // Capture WebGL context state at intervals
  function captureGL(label) {
    var canvas = document.getElementById('c');
    if (!canvas) { record('no-canvas-' + label, {}); return; }
    // Don't create a new context; check if one exists by reading from the canvas
    record('canvas-state-' + label, {
      width: canvas.width, height: canvas.height,
      rect: (function() { var r = canvas.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
      display: getComputedStyle(canvas).display,
      visibility: getComputedStyle(canvas).visibility,
    });
  }
  setTimeout(function() { captureGL('200ms'); }, 200);
  setTimeout(function() { captureGL('500ms'); }, 500);
  setTimeout(function() { captureGL('1s'); }, 1000);
  setTimeout(function() { captureGL('3s'); }, 3000);
  setTimeout(function() { captureGL('5s'); }, 5000);

  record('probe-injected', { readyState: document.readyState });
})();
</script>`;

let patched = cloudSrc;
patched = patched.replace(/<head([^>]*)>/, `<head$1>${probe}${controlScript}${focusStyles}`);
patched = patched.replace(/<body([^>]*)>/, `<body$1>${focusScript}`);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-first-run'],
    defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('about:')) req.continue();
    else req.abort();
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[page-error] ${msg.text().slice(0, 200)}`);
  });

  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(patched);
  await page.goto(dataUrl, { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 7000));

  // Read final canvas pixel data via WebGL readPixels
  const pixelData = await page.evaluate(() => {
    var c = document.getElementById('c');
    if (!c) return { error: 'no canvas' };
    var gl = c.getContext('webgl', { preserveDrawingBuffer: true }) || c.getContext('experimental-webgl', { preserveDrawingBuffer: true });
    if (!gl) return { error: 'no gl context (try create new)', width: c.width, height: c.height };
    try {
      var pixels = new Uint8Array(4 * 100);
      // Sample 25 points across the canvas
      var samples = [];
      for (var py = 0; py < 5; py++) {
        for (var px = 0; px < 5; px++) {
          var x = Math.round((px + 0.5) * c.width / 5);
          var y = Math.round((py + 0.5) * c.height / 5);
          var buf = new Uint8Array(4);
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          samples.push({ x: x, y: y, r: buf[0], g: buf[1], b: buf[2], a: buf[3] });
        }
      }
      return { width: c.width, height: c.height, samples: samples };
    } catch (e) {
      return { error: 'readPixels: ' + e.message };
    }
  });

  console.log('\n=== Final pixel sample ===');
  console.log(JSON.stringify(pixelData, null, 2));

  const events = await page.evaluate(() => window.__probeEvents || []);
  console.log('\n=== Probe events (' + events.length + ') ===');
  events.forEach((e) => {
    console.log(`[${e.t.toFixed(0)}ms] ${e.stage}: ${JSON.stringify(e.data).slice(0, 300)}`);
  });

  await page.screenshot({ path: '/tmp/cloud-state-screenshot.png' });
  console.log('saved /tmp/cloud-state-screenshot.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
