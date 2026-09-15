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
  vc.on('jsdomError', (e) => errors.push('JSDOM: ' + String(e && e.stack || e && e.message || e)));

  const dom = new JSDOM(liveHtml, {
    url: 'https://antarctic-labs.com/',
    pretendToBeVisual: true,
    virtualConsole: vc,
    runScripts: 'outside-only',
  });

  const win = dom.window;

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
  } catch (e) {
    console.log('THROW:', e.message);
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
    console.log('=== IFRAME AND PARENT CHAIN INLINE STYLES ===');
    const polarScene = win.document.querySelector('.polar-scene');
    const constellation = win.document.querySelector('.polar-constellation');
    const iframe = constellation && constellation.querySelector('iframe');

    function dumpStyles(el, name) {
      if (!el) {
        console.log(`  ${name}: NOT FOUND`);
        return;
      }
      console.log(`  ${name}:`);
      console.log(`    inline style attribute: "${el.getAttribute('style') || '(empty)'}"`);
      const cs = win.getComputedStyle(el);
      console.log(`    computed: ${JSON.stringify({
        position: cs.position,
        top: cs.top,
        bottom: cs.bottom,
        left: cs.left,
        right: cs.right,
        width: cs.width,
        height: cs.height,
        opacity: cs.opacity,
        visibility: cs.visibility,
        display: cs.display,
        zIndex: cs.zIndex,
      })}`);
    }

    dumpStyles(polarScene, '.polar-scene');
    dumpStyles(constellation, '.polar-constellation');
    dumpStyles(iframe, 'constellation iframe');

    console.log('');
    console.log('=== Where is the constellation iframe mounted in the DOM? ===');
    if (iframe) {
      let el = iframe;
      const path = [];
      while (el && el.tagName !== 'HTML') {
        path.push(el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''));
        el = el.parentElement;
      }
      console.log('  DOM path: ' + path.reverse().join(' > '));
    }

    console.log('');
    console.log('=== Why is the bounding rect 0x0? Check containing block chain ===');
    if (iframe) {
      let el = iframe;
      while (el && el.tagName !== 'HTML') {
        const cs = win.getComputedStyle(el);
        console.log(`  ${el.tagName}.${el.className.split(' ')[0]}: position=${cs.position} ${cs.width}×${cs.height}`);
        if (cs.position === 'static' || cs.position === 'relative') {
          // children with position:absolute would use this as containing block
        }
        if (el.tagName === 'BODY') break;
        el = el.parentElement;
      }
    }

    dom.window.close();
    process.exit(0);
  }, 2000);
}

main().catch(e => { console.log('FATAL:', e.message); process.exit(1); });
