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
  const bundle = await fetch('https://antarctic-labs.com/assets/index-C-KZA8bN.js');
  const liveHtml = await fetch('https://antarctic-labs.com');

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

  // Polyfill browser globals
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

  try {
    const fn = new win.Function('document', 'window', 'self', '"use strict";\n' + bundle);
    fn(win.document, win, win);
    console.log('✓ bundle exec: SUCCESS');
  } catch (e) {
    console.log('✗ bundle exec: THROW — ' + e.message);
    process.exit(1);
  }

  try { win.document.dispatchEvent(new win.Event('DOMContentLoaded')); } catch (e) {}
  const rafCbs = [];
  win.requestAnimationFrame = (cb) => { rafCbs.push(cb); return rafCbs.length; };
  for (let i = 0; i < 12; i++) {
    setTimeout(() => {
      const pending = [...rafCbs];
      rafCbs.length = 0;
      pending.forEach(cb => { try { cb(Date.now()); } catch (e) {} });
    }, 50 * (i + 1));
  }

  setTimeout(() => {
    console.log('');
    console.log('=== COMPLETE CONSTELLATION RENDER CHECK ===');

    // Scroll position: simulate being at top of page (progress = 0)
    // The constellation should be at maximum opacity at progress=0
    console.log('--- Scroll position: simulating top of page (progress=0) ---');

    const polarConstellation = win.document.querySelector('.polar-constellation');
    if (polarConstellation) {
      const cs = win.getComputedStyle(polarConstellation);
      console.log('  .polar-constellation:');
      console.log('    computed opacity:    ' + cs.opacity);
      console.log('    computed visibility: ' + cs.visibility);
      console.log('    computed display:    ' + cs.display);
      console.log('    computed position:   ' + cs.position);
      console.log('    computed z-index:    ' + cs.zIndex);
      console.log('    inline opacity:      ' + (polarConstellation.style.opacity || '(empty)'));
      console.log('    inline visibility:   ' + (polarConstellation.style.visibility || '(empty)'));
      console.log('    bounding rect:       ' + JSON.stringify(polarConstellation.getBoundingClientRect()));
    }

    console.log('');
    const constellationIframe = polarConstellation && polarConstellation.querySelector('iframe');
    if (constellationIframe) {
      const cs = win.getComputedStyle(constellationIframe);
      console.log('  constellation iframe:');
      console.log('    srcDoc.length:        ' + (constellationIframe.srcdoc || '').length);
      console.log('    computed opacity:    ' + cs.opacity);
      console.log('    computed visibility: ' + cs.visibility);
      console.log('    computed display:    ' + cs.display);
      console.log('    computed position:   ' + cs.position);
      console.log('    computed z-index:    ' + cs.zIndex);
      console.log('    bounding rect:       ' + JSON.stringify(constellationIframe.getBoundingClientRect()));
      console.log('    inline style.position: ' + (constellationIframe.style.position || '(empty)'));
      console.log('    inline style.inset:    ' + (constellationIframe.style.inset || '(empty)'));
      console.log('    inline style.opacity:  ' + (constellationIframe.style.opacity || '(empty)'));
      console.log('    inline style.filter:   ' + (constellationIframe.style.filter || '(empty)'));
    } else {
      console.log('  ✗ NO iframe inside .polar-constellation');
    }

    // Check if anything is on top of the iframe
    console.log('');
    console.log('--- Elements that might be covering the iframe ---');
    const polarScene = win.document.querySelector('.polar-scene');
    if (polarScene) {
      console.log('  .polar-scene z-index: ' + win.getComputedStyle(polarScene).zIndex);
      console.log('  .polar-scene position: ' + win.getComputedStyle(polarScene).position);
    }
    const heroCopy = win.document.querySelector('.hero-copy');
    if (heroCopy) {
      console.log('  .hero-copy z-index: ' + win.getComputedStyle(heroCopy).zIndex);
      console.log('  .hero-copy position: ' + win.getComputedStyle(heroCopy).position);
    }
    const pageShell = win.document.querySelector('.page-shell');
    if (pageShell) {
      console.log('  .page-shell z-index: ' + win.getComputedStyle(pageShell).zIndex);
      console.log('  .page-shell position: ' + win.getComputedStyle(pageShell).position);
    }

    // Also check the iframe's actual bounding rect vs viewport
    console.log('');
    console.log('--- Iframe geometry ---');
    console.log('  window.innerWidth: ' + win.innerWidth);
    console.log('  window.innerHeight: ' + win.innerHeight);
    if (constellationIframe) {
      const rect = constellationIframe.getBoundingClientRect();
      console.log('  iframe rect: ' + JSON.stringify(rect));
      console.log('  iframe visible area: ' + (rect.width * rect.height) + ' px²');
    }

    console.log('');
    console.log('=== ERRORS ===');
    if (errors.length === 0) console.log('  (none)');
    else errors.slice(0, 10).forEach((e, i) => console.log('  [' + i + '] ' + e.slice(0, 400)));

    dom.window.close();
    process.exit(0);
  }, 2000);
}

main().catch(e => { console.log('FATAL:', e.message); process.exit(1); });
