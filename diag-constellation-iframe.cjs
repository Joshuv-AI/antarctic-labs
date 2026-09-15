const https = require('https');
const { JSDOM, VirtualConsole } = require('jsdom');

async function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== Fetch LIVE bundle and extract constellation srcDoc ===');
  const bundle = await fetch('https://antarctic-labs.com/assets/index-C-KZA8bN.js');
  const liveHtml = await fetch('https://antarctic-labs.com');
  console.log('  bundle: ' + bundle.length + ' bytes');

  const errors = [];
  const vc = new VirtualConsole();
  vc.on('error', (e) => errors.push(String(e && e.stack || e && e.message || e)));
  vc.on('warn', (m) => errors.push('WARN: ' + String(m)));
  vc.on('jsdomError', (e) => errors.push('JSDOM: ' + String(e && e.stack || e && e.message || e)));

  const dom = new JSDOM(liveHtml, {
    url: 'https://antarctic-labs.com/',
    pretendToBeVisual: true,
    virtualConsole: vc,
    runScripts: 'outside-only',
  });

  const win = dom.window;
  function polyfill() {
    if (!win.matchMedia || typeof win.matchMedia !== 'function') {
      Object.defineProperty(win, 'matchMedia', {
        value: (q) => ({ matches: false, media: q, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, onchange: null, dispatchEvent: () => false }),
        writable: true, configurable: true,
      });
    }
    if (typeof win.IntersectionObserver !== 'function') {
      win.IntersectionObserver = class { constructor(){} observe(){} unobserve(){} disconnect(){} takeRecords(){return [];} };
    }
    if (typeof win.ResizeObserver !== 'function') {
      win.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
    }
    if (typeof win.MutationObserver !== 'function') {
      win.MutationObserver = class { constructor(){} observe(){} disconnect(){} takeRecords(){return [];} };
    }
  }
  polyfill();

  // Execute the bundle
  try {
    const fn = new win.Function('document', 'window', 'self', '"use strict";\n' + bundle);
    fn(win.document, win, win);
    console.log('  bundle exec: SUCCESS');
  } catch (e) {
    console.log('  bundle exec: THROW: ' + (e && e.message || String(e)));
    return;
  }

  try { win.document.dispatchEvent(new win.Event('DOMContentLoaded')); } catch (e) {}
  const rafCbs = [];
  win.requestAnimationFrame = (cb) => { rafCbs.push(cb); return rafCbs.length; };
  for (let i = 0; i < 8; i++) {
    setTimeout(() => {
      const pending = [...rafCbs];
      rafCbs.length = 0;
      pending.forEach(cb => { try { cb(Date.now()); } catch (e) {} });
    }, 40 * (i + 1));
  }

  setTimeout(async () => {
    const iframes = win.document.querySelectorAll('iframe');
    console.log('  iframes rendered: ' + iframes.length);

    if (iframes.length < 2) {
      console.log('  ERROR: Not enough iframes!');
      process.exit(1);
    }

    const constellationIframe = iframes[0];
    const srcDoc = constellationIframe.srcdoc || '';
    console.log('  constellation iframe srcDoc.length: ' + srcDoc.length);
    console.log('');
    console.log('=== Inspecting constellation iframe srcDoc ===');
    console.log('  contains <canvas id="particle-canvas">: ' + srcDoc.includes('<canvas id="particle-canvas">'));
    console.log('  contains const particleCount = 200: ' + srcDoc.includes('const particleCount = 200'));
    console.log('  contains function resize(): ' + srcDoc.includes('function resize()'));
    console.log('  contains class Particle: ' + srcDoc.includes('class Particle'));
    console.log('  contains function init(): ' + srcDoc.includes('function init()'));
    console.log('  contains function animate(): ' + srcDoc.includes('function animate()'));
    console.log('  contains pauseBtn: ' + srcDoc.includes('pauseBtn'));

    console.log('');
    console.log('=== Now load the constellation srcDoc as an actual document and run it ===');

    const iframeErrors = [];
    const iframeVc = new VirtualConsole();
    iframeVc.on('error', (e) => iframeErrors.push(String(e && e.stack || e && e.message || e)));
    iframeVc.on('warn', (m) => iframeErrors.push('WARN: ' + String(m)));
    iframeVc.on('jsdomError', (e) => iframeErrors.push('JSDOM: ' + String(e && e.stack || e && e.message || e)));

    try {
      const iframeDom = new JSDOM(srcDoc, {
        url: 'about:blank',
        pretendToBeVisual: true,
        virtualConsole: iframeVc,
        runScripts: 'dangerously',
        resources: 'usable',
      });

      const iframeWin = iframeDom.window;
      iframeWin.matchMedia = iframeWin.matchMedia || ((q) => ({ matches: false, media: q, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, onchange: null, dispatchEvent: () => false }));

      // Wait for the iframe's scripts to run
      await new Promise(r => setTimeout(r, 1500));

      console.log('');
      console.log('=== CONSTELLATION IFRAME CONTENT (after scripts ran) ===');
      const iframeBody = iframeWin.document.body;
      console.log('  body.children: ' + (iframeBody && iframeBody.children && iframeBody.children.length));

      const canvas = iframeWin.document.getElementById('particle-canvas');
      if (canvas) {
        console.log('  particle-canvas found');
        console.log('    canvas.width: ' + canvas.width);
        console.log('    canvas.height: ' + canvas.height);
        console.log('    canvas.style.width: ' + canvas.style.width);
        console.log('    canvas.style.height: ' + canvas.style.height);
        console.log('    canvas.style.display: ' + canvas.style.display);
        console.log('    canvas.style.zIndex: ' + (canvas.style.zIndex || '(not set)'));
        console.log('    canvas.style.opacity: ' + (canvas.style.opacity || '(not set)'));
        console.log('    canvas.class: "' + canvas.className + '"');
        console.log('    canvas computed display: ' + iframeWin.getComputedStyle(canvas).display);
        console.log('    canvas computed visibility: ' + iframeWin.getComputedStyle(canvas).visibility);
        console.log('    canvas rect: ' + JSON.stringify(canvas.getBoundingClientRect()));

        try {
          const ctx = canvas.getContext('2d');
          console.log('    2d context: ' + (ctx ? 'available' : 'NULL (canvas failed)'));
          if (ctx) {
            console.log('    canvas size in pixels: ' + canvas.width + 'x' + canvas.height);
          }
        } catch (e) {
          console.log('    2d context error: ' + e.message);
        }
      } else {
        console.log('  particle-canvas NOT FOUND in iframe content');
      }

      const scripts = iframeWin.document.querySelectorAll('script');
      console.log('  script tags: ' + scripts.length);
      scripts.forEach((s, i) => {
        const src = s.getAttribute('src');
        if (src) {
          console.log('    [' + i + '] external: ' + src.slice(0, 80));
        } else {
          console.log('    [' + i + '] inline: ' + (s.textContent || '').length + ' chars');
        }
      });

      const hero = iframeWin.document.querySelector('h1');
      console.log('  h1 element text: ' + (hero ? '"' + hero.textContent.slice(0, 100) + '"' : '(not found)'));

      const pauseBtn = iframeWin.document.getElementById('pauseBtn');
      console.log('  pauseBtn: ' + (pauseBtn ? 'found' : 'not found'));

      console.log('');
      console.log('=== IFRAME ERRORS ===');
      if (iframeErrors.length === 0) console.log('  (none)');
      else iframeErrors.slice(0, 10).forEach((e, i) => console.log('  [' + i + '] ' + e.slice(0, 500)));

      iframeDom.window.close();
    } catch (e) {
      console.log('  ERROR loading iframe content: ' + e.message);
    }

    console.log('');
    console.log('=== PARENT ERRORS ===');
    if (errors.length === 0) console.log('  (none)');
    else errors.slice(0, 8).forEach((e, i) => console.log('  [' + i + '] ' + e.slice(0, 400)));

    dom.window.close();
    process.exit(0);
  }, 1500);
}

main().catch(e => { console.log('FATAL:', e.message); process.exit(1); });
