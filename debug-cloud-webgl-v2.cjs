// debug-cloud-webgl-v2.cjs
// Standalone loader: take the cloud srcDoc from the live bundle, manually
// prepend the wrapper's controlScript + focusStyles + focusScript (the runtime
// injections), and load the resulting HTML in a real browser. Then report:
//   - canvas attributes (width, height, rect)
//   - WebGL context state via patched compileShader/linkProgram
//   - frame count from requestAnimationFrame
//   - any gl.getError() returns
//   - visible body content

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
  // Fetch the cloud srcDoc from the live bundle (raw source, no wrapper)
  const bundle = await fetchText('https://antarctic-labs.com/assets/index-B7VrpVbc.js');
  const docIdx = bundle.lastIndexOf('<!DOCTYPE');
  const htmlEnd = bundle.indexOf('</html>', docIdx) + 7;
  const cloudSrc = bundle.slice(docIdx, htmlEnd);
  console.log(`Cloud srcDoc: ${cloudSrc.length} chars`);

  // Build the wrapper injections manually (same logic as the React wrapper)
  const focusStyles = `<style data-threeui-focus>
html, body { width: 100% !important; height: 100% !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #071010 !important; }
body { position: relative !important; }
nav, main, header, aside, footer, [id="reveal-text"], #scroll-dot { display: none !important; }
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
(function(){ window.__SF_CONTROLS = { mode: 'dark', speed: 1, opacity: 1 }; })();
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
    if (!roots.length) {
      window.__CLOUD_ISOLATE_FAILED = true;
      return;
    }
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

  // Patch getContext BEFORE the source's inline script runs, so we capture
  // every context request and any compile/link/draw errors.
  const webglProbe = `<script data-cloud-debug>
(function() {
  window.__cloudDebug = { events: [] };
  function record(stage, data) {
    window.__cloudDebug.events.push({ stage: stage, data: data, t: performance.now() });
    if (window.parent !== window) {
      try { window.parent.postMessage({ type: 'cloud-debug', stage: stage, data: data }, '*'); } catch (e) {}
    }
  }
  record('init', { url: location.href.slice(0, 80), iframe: window.parent !== window });
  var origGC = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    if (type === 'webgl' || type === 'experimental-webgl') {
      var ctx = origGC.call(this, type, attrs);
      record('getContext', { type: type, attrs: attrs, succeeded: !!ctx });
      if (ctx) {
        var ocs = ctx.compileShader.bind(ctx);
        ctx.compileShader = function(shader) {
          ocs(shader);
          var ok = ctx.getShaderParameter(shader, ctx.COMPILE_STATUS);
          record('compileShader', {
            type: ctx.getShaderParameter(shader, ctx.SHADER_TYPE) === ctx.VERTEX_SHADER ? 'vertex' : 'fragment',
            ok: ok,
            log: ok ? null : ctx.getShaderInfoLog(shader),
          });
        };
        var olp = ctx.linkProgram.bind(ctx);
        ctx.linkProgram = function(prog) {
          olp(prog);
          var ok = ctx.getProgramParameter(prog, ctx.LINK_STATUS);
          record('linkProgram', { ok: ok, log: ok ? null : ctx.getProgramInfoLog(prog) });
        };
        var oda = ctx.drawArrays.bind(ctx);
        var drawCount = 0;
        ctx.drawArrays = function() {
          drawCount++;
          if (drawCount <= 5 || drawCount % 60 === 0) {
            record('drawArrays', { count: drawCount });
          }
          return oda.apply(this, arguments);
        };
      }
      return ctx;
    }
    return origGC.call(this, type, attrs);
  };
  // Track canvas dimensions over time
  function reportCanvas(label) {
    var c = document.getElementById('c');
    if (!c) { record('noCanvas-' + label, {}); return; }
    var r = c.getBoundingClientRect();
    record('canvas-' + label, {
      attrW: c.width, attrH: c.height,
      rectW: Math.round(r.width), rectH: Math.round(r.height),
      display: getComputedStyle(c).display,
      visibility: getComputedStyle(c).visibility,
    });
  }
  setTimeout(function() { reportCanvas('200ms'); }, 200);
  setTimeout(function() { reportCanvas('1s'); }, 1000);
  setTimeout(function() { reportCanvas('3s'); }, 3000);
  setTimeout(function() { reportCanvas('5s'); }, 5000);
  // Frame counter
  var fc = 0;
  function tick() {
    fc++;
    if (fc <= 3 || fc % 60 === 0) record('raf', { frame: fc });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
</script>`;

  // Inject: probe first (head), then focusStyles (head), then controlScript (head), then webglProbe (body start)
  let patched = cloudSrc;
  patched = patched.replace(/<head([^>]*)>/, `<head$1>${controlScript}${focusStyles}${webglProbe}`);
  patched = patched.replace(/<body([^>]*)>/, `<body$1>${focusScript}`);

  fs.writeFileSync('/tmp/cloud-standalone-patched.html', patched);
  console.log(`Patched standalone: ${patched.length} chars`);

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

  // Capture cloud-debug postMessage events from any iframes
  page.on('console', (msg) => {
    if (msg.text().includes('cloud-debug')) {
      console.log(`[console] ${msg.text().slice(0, 200)}`);
    }
  });

  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(patched);
  await page.goto(dataUrl, { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 7000));

  // Read the debug events captured inside the page
  const debug = await page.evaluate(() => window.__cloudDebug);
  console.log('\n=== Cloud debug events ===');
  console.log(JSON.stringify(debug, null, 2));

  await page.screenshot({ path: '/tmp/cloud-standalone-loaded.png' });
  console.log('saved /tmp/cloud-standalone-loaded.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
