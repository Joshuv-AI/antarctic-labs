// debug-cloud-errors-v2.cjs
// Run the cloud iframe with the wrapper's full injections (controlScript with
// the gsap stub + focusStyles + focusScript) plus a debug probe. This mirrors
// the LIVE production runtime exactly. The probe captures:
//   - window.onerror (with stack)
//   - unhandledrejection
//   - patched getContext
//   - ALL console calls (log/warn/error)

const puppeteer = require('puppeteer-core');
const https = require('https');
const fs = require('fs');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
  // Fetch the live cloud srcDoc from the latest bundle
  const bundle = await fetchText('https://antarctic-labs.com/assets/index-B7VrpVbc.js');
  const docIdx = bundle.lastIndexOf('<!DOCTYPE');
  const htmlEnd = bundle.indexOf('</html>', docIdx) + 7;
  const cloudSrc = bundle.slice(docIdx, htmlEnd);
  console.log(`Cloud srcDoc: ${cloudSrc.length} chars`);

  // Use the EXACT wrapper injections from PolarScene.jsx
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
  // Same no-op GSAP stub as the live wrapper
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
  // Debug probe — captures errors, console, and getContext
  const probe = `<script data-cloud-probe>
(function() {
  window.__probeEvents = [];
  function record(stage, data) {
    window.__probeEvents.push({ stage: stage, data: data, t: performance.now() });
  }
  window.addEventListener('error', function(e) {
    record('window.error', { message: e.message, lineno: e.lineno, colno: e.colno, stack: (e.error && e.error.stack || '').slice(0, 600) });
  });
  window.addEventListener('unhandledrejection', function(e) {
    record('unhandledrejection', { reason: String(e.reason).slice(0, 400) });
  });
  ['log','warn','error','info','debug'].forEach(function(level) {
    var orig = console[level].bind(console);
    console[level] = function() {
      record('console.' + level, { args: Array.prototype.slice.call(arguments).map(function(a) { try { return String(a); } catch (e) { return '?'; } }).slice(0, 3) });
      return orig.apply(console, arguments);
    };
  });
  var origGC = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    if (type === 'webgl' || type === 'experimental-webgl') {
      var ctx = origGC.call(this, type, attrs);
      record('getContext', { type: type, succeeded: !!ctx });
      return ctx;
    }
    return origGC.call(this, type, attrs);
  };
  record('probe-injected', { readyState: document.readyState });
  // Mark DOMContentLoaded too
  document.addEventListener('DOMContentLoaded', function() {
    record('DOMContentLoaded', {});
  });
  window.addEventListener('load', function() {
    record('window.load', {});
  });
})();
</script>`;

  // Apply all injections in the same order as the live wrapper:
  //   <head> gets probe + focusStyles + controlScript
  //   <body> prepend gets focusScript
  let patched = cloudSrc;
  patched = patched.replace(/<head([^>]*)>/, `<head$1>${probe}${controlScript}${focusStyles}`);
  patched = patched.replace(/<body([^>]*)>/, `<body$1>${focusScript}`);

  fs.writeFileSync('/tmp/cloud-with-full-injections.html', patched);
  console.log(`Patched: ${patched.length} chars`);

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

  const events = await page.evaluate(() => window.__probeEvents || []);
  console.log('\n=== Probe events (' + events.length + ') ===');
  events.forEach((e) => {
    console.log(`[${e.t.toFixed(0)}ms] ${e.stage}: ${JSON.stringify(e.data).slice(0, 350)}`);
  });

  await page.screenshot({ path: '/tmp/cloud-with-full-injections.png' });
  console.log('saved /tmp/cloud-with-full-injections.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
