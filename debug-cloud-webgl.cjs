// debug-cloud-webgl.cjs
// Real-browser diagnostic: load the live site, intercept the cloud iframe's
// HTML response at the network layer, patch the strata-cloud WebGL init to
// capture state, then write the patched HTML to a data URL and let it run.
// Reports:
//   - getContext('webgl') success
//   - shader compile/link errors
//   - render loop frame count
//   - last gl.getError()
//   - canvas.width / canvas.height attribute values

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
  // Fetch the live bundle and extract the cloud iframe srcDoc
  const bundle = await fetchText('https://antarctic-labs.com/assets/index-DMbIyNQp.js');
  // Cloud iframe = last <!DOCTYPE> in the bundle (Strata — Cloud Migration Platform)
  const docIdx = bundle.lastIndexOf('<!DOCTYPE');
  const htmlEnd = bundle.indexOf('</html>', docIdx) + 7;
  const cloudSrc = bundle.slice(docIdx, htmlEnd);
  console.log(`Cloud srcDoc from bundle: ${cloudSrc.length} chars`);

  // Build a debug-patched version of the cloud iframe
  // The source's inline script at the bottom of body does the WebGL init.
  // We can't easily inject after parse, so we patch the script source itself
  // by wrapping the init in a try/catch + reporting.
  const debugPatch = `
<script data-cloud-debug>
(function() {
  var captured = { log: [] };
  function capture(stage, data) {
    captured.log.push({ stage: stage, data: data });
    try { window.parent.postMessage({ type: 'cloud-debug', captured: captured }, '*'); } catch(e) {}
  }

  // Patch getContext so we know what context was requested and whether it succeeded
  var origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    var ctx = origGetContext.call(this, type, attrs);
    if (type === 'webgl' || type === 'experimental-webgl') {
      capture('getContext', { type: type, attrs: attrs, succeeded: !!ctx });
      if (ctx) {
        // Patch shader source so we know about compile/link errors
        var origCompileShader = ctx.compileShader.bind(ctx);
        ctx.compileShader = function(shader) {
          origCompileShader(shader);
          if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
            capture('shaderCompileError', {
              type: ctx.getShaderParameter(shader, ctx.SHADER_TYPE) === ctx.VERTEX_SHADER ? 'vertex' : 'fragment',
              log: ctx.getShaderInfoLog(shader),
              source: ctx.getShaderSource(shader).slice(0, 200),
            });
          }
        };
        var origLinkProgram = ctx.linkProgram.bind(ctx);
        ctx.linkProgram = function(program) {
          origLinkProgram(program);
          if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) {
            capture('programLinkError', {
              log: ctx.getProgramInfoLog(program),
            });
          }
        };
        var origDrawArrays = ctx.drawArrays.bind(ctx);
        ctx.drawArrays = function() {
          var err = ctx.getError();
          if (err) capture('drawArraysError', { err: err, errName: ['NO_ERROR','INVALID_ENUM','INVALID_VALUE','INVALID_OPERATION','INVALID_FRAMEBUFFER_OPERATION','OUT_OF_MEMORY','CONTEXT_LOST_WEBGL'][err] });
          return origDrawArrays.apply(this, arguments);
        };
      }
    }
    return ctx;
  };

  // Also patch canvas size reporting
  function reportCanvas() {
    var c = document.getElementById('c');
    if (!c) { capture('noCanvas', {}); return; }
    capture('canvasState', {
      width: c.width, height: c.height,
      offsetWidth: c.offsetWidth, offsetHeight: c.offsetHeight,
      rect: (function() { var r = c.getBoundingClientRect(); return { w: r.width, h: r.height }; })(),
    });
  }
  setTimeout(reportCanvas, 200);
  setTimeout(reportCanvas, 1000);
  setTimeout(reportCanvas, 3000);
})();
</script>
`;

  // Inject the debug patch right after <body>
  let patched = cloudSrc.replace(/<body([^>]*)>/, '<body$1>' + debugPatch);

  // Save patched version to disk for inspection
  fs.writeFileSync('/tmp/cloud-debug-patched.html', patched);
  console.log(`Patched cloud srcDoc: ${patched.length} chars (delta +${patched.length - cloudSrc.length})`);

  // Load in a real browser, full GPU enabled
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

  // Capture cloud-debug messages from the patched iframe
  const debugMsgs = [];
  page.on('console', (msg) => {
    if (msg.text().includes('cloud-debug')) {
      try {
        const parsed = JSON.parse(msg.text().replace(/.*cloud-debug.*?(\[.*\])/s, '$1'));
        debugMsgs.push(parsed);
      } catch (e) {}
    }
  });

  // Use a page that hosts the patched iframe as an iframe in the test page,
  // OR load the patched HTML directly. Direct load is simpler.
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(patched);
  await page.goto(dataUrl, { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  // Capture all debug messages posted to window.parent
  // Since we're loading the patched HTML as a top-level page (not via iframe),
  // the postMessage target is window.parent = window (top-level). Let me instead
  // just read window.__cloudDebug (set by the debug script).

  const result = await page.evaluate(() => {
    return {
      canvas: (function() {
        const c = document.getElementById('c');
        if (!c) return null;
        const r = c.getBoundingClientRect();
        return {
          attrWidth: c.width, attrHeight: c.height,
          offsetWidth: c.offsetWidth, offsetHeight: c.offsetHeight,
          rectW: r.width, rectH: r.height,
          display: getComputedStyle(c).display,
          visibility: getComputedStyle(c).visibility,
          position: getComputedStyle(c).position,
        };
      })(),
      // try to get the WebGL context that was already created
      glProbe: (function() {
        const c = document.getElementById('c');
        if (!c) return null;
        // Don't create a new context — read what we can
        return {
          hasUserData: !!c.__glContext,
        };
      })(),
      bodyChildren: Array.from(document.body.children).map(e => ({
        tag: e.tagName,
        class: (e.className || '').slice(0, 50),
        display: getComputedStyle(e).display,
        visibility: getComputedStyle(e).visibility,
      })),
    };
  });

  console.log('\n=== Top-level state ===');
  console.log(JSON.stringify(result, null, 2));

  // Screenshot the canvas directly via puppeteer (it's not in an iframe here)
  await page.screenshot({ path: '/tmp/cloud-debug-loaded.png' });
  console.log('saved /tmp/cloud-debug-loaded.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
