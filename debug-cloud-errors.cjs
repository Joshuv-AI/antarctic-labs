// debug-cloud-errors.cjs
// Patch the cloud iframe's <head> to inject:
//   1. window.onerror capture
//   2. unhandledrejection capture
//   3. patch getContext to record WebGL calls
//   4. record all console.* calls
// Load the patched HTML in a real browser and report everything.

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

  // The probe must be injected in <head> BEFORE the source's <script> tag runs
  const probe = `<script data-cloud-probe>
(function() {
  window.__probeEvents = [];
  function record(stage, data) {
    window.__probeEvents.push({ stage: stage, data: data, t: performance.now() });
    if (window.parent !== window) {
      try { window.parent.postMessage({ type: 'cloud-probe', stage: stage, data: data }, '*'); } catch (e) {}
    }
  }
  // Capture uncaught errors
  window.addEventListener('error', function(e) {
    record('window.error', { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, stack: (e.error && e.error.stack || '').slice(0, 600) });
  });
  window.addEventListener('unhandledrejection', function(e) {
    record('unhandledrejection', { reason: String(e.reason).slice(0, 400) });
  });
  // Capture console calls
  ['log','warn','error','info','debug'].forEach(function(level) {
    var orig = console[level].bind(console);
    console[level] = function() {
      record('console.' + level, { args: Array.prototype.slice.call(arguments).map(function(a) {
        try { return String(a); } catch (e) { return '?'; }
      }).slice(0, 5) });
      return orig.apply(console, arguments);
    };
  });
  // Patch getContext BEFORE source's script runs
  var origGC = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    if (type === 'webgl' || type === 'experimental-webgl') {
      var ctx = origGC.call(this, type, attrs);
      record('getContext', { type: type, attrs: attrs, succeeded: !!ctx });
      return ctx;
    }
    return origGC.call(this, type, attrs);
  };
  record('probe-injected', {});
})();
</script>`;

  // Patch the cloud srcDoc: inject probe right after <head>
  let patched = cloudSrc.replace(/<head([^>]*)>/, `<head$1>${probe}`);
  fs.writeFileSync('/tmp/cloud-with-probe.html', patched);
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

  // Capture console events from the page (we're loading as top-level here,
  // so the probe's postMessage goes to window itself; we'll read __probeEvents)
  page.on('console', (msg) => {
    if (msg.text().includes('cloud-probe')) return;
    if (msg.type() === 'error') console.log(`[page-error] ${msg.text().slice(0, 300)}`);
  });

  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(patched);
  await page.goto(dataUrl, { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 7000));

  const events = await page.evaluate(() => window.__probeEvents || []);
  console.log('\n=== Probe events ===');
  events.forEach((e) => {
    console.log(`[${e.t.toFixed(0)}ms] ${e.stage}: ${JSON.stringify(e.data).slice(0, 300)}`);
  });

  await page.screenshot({ path: '/tmp/cloud-with-probe.png' });
  console.log('saved /tmp/cloud-with-probe.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
