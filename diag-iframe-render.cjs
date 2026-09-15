const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');

// Load the constellation iframe content we extracted earlier
const html = fs.readFileSync('/tmp/constellation-iframe.html', 'utf-8');

const errors = [];
const consoleLogs = [];
const vc = new VirtualConsole();
vc.on('error', (e) => errors.push(String(e && e.stack || e && e.message || e)));
vc.on('warn', (m) => consoleLogs.push('WARN: ' + String(m)));
vc.on('jsdomError', (e) => errors.push('JSDOM: ' + String(e && e.stack || e && e.message || e)));

// Load the iframe content
const dom = new JSDOM(html, {
  url: 'about:blank',
  pretendToBeVisual: true,
  virtualConsole: vc,
  runScripts: 'dangerously',
  resources: 'usable',
});

const win = dom.window;

// Polyfill: JSDOM's innerText is broken for elements without layout.
// Override it on HTMLElement.prototype to return textContent as fallback.
const originalInnerText = Object.getOwnPropertyDescriptor(win.HTMLElement.prototype, 'innerText') ||
                          Object.getOwnPropertyDescriptor(win.Element.prototype, 'innerText');
if (originalInnerText) {
  Object.defineProperty(win.HTMLElement.prototype, 'innerText', {
    get: function() {
      // Try the real innerText first; if undefined, fall back to textContent
      try {
        const v = originalInnerText.get.call(this);
        if (v !== undefined && v !== null) return v;
      } catch (e) {}
      return this.textContent || '';
    },
    configurable: true,
  });
}

// Suppress CDN script failures (Tailwind, iconify, GSAP) — we just want to test particle physics
// Block external network by returning empty responses
const origFetch = win.fetch;
win.fetch = (url, opts) => {
  if (typeof url === 'string' && (url.includes('cdn.') || url.includes('googleapis'))) {
    return Promise.resolve(new win.Response(''));
  }
  return origFetch ? origFetch(url, opts) : Promise.resolve(new win.Response(''));
};

// Wait for scripts to run and the rAF loop to spin
setTimeout(() => {
  console.log('=== Constellation iframe content (with innerText polyfill) ===');

  // Find the paragraph
  const p = win.document.getElementById('split-text-target');
  console.log('  p exists:', !!p);
  if (p) {
    console.log('  p.innerText:', JSON.stringify(p.innerText));
    console.log('  p.textContent:', JSON.stringify(p.textContent));
  }

  // Find the canvas
  const canvas = win.document.getElementById('particle-canvas');
  console.log('');
  console.log('  canvas exists:', !!canvas);
  if (canvas) {
    console.log('  canvas.width:', canvas.width);
    console.log('  canvas.height:', canvas.height);
    console.log('  canvas.style.width:', canvas.style.width || '(empty)');
    console.log('  canvas.style.height:', canvas.style.height || '(empty)');
    console.log('  canvas.style.opacity:', canvas.style.opacity || '(empty)');

    // Check if resize() ran by looking at canvas dimensions
    // If resize() ran, canvas.width/height would be set from window.innerWidth/innerHeight
    console.log('  resize() ran? (window.innerWidth > 0):', win.innerWidth > 0);

    // Try to get the 2D context
    try {
      const ctx = canvas.getContext('2d');
      console.log('  2d context:', ctx ? 'AVAILABLE' : 'NULL (jsdom limitation)');
    } catch (e) {
      console.log('  2d context error:', e.message);
    }
  }

  // Find the particles array — should be populated if init() ran
  console.log('');
  console.log('=== Did init() run? ===');
  // The inline script declares `let particles = []` and pushes particles in init()
  // We can't access the variable directly from outside, but we can check
  // whether the canvas was resized (resize() called from init())
  console.log('  window.innerWidth:', win.innerWidth);
  console.log('  window.innerHeight:', win.innerHeight);
  console.log('  canvas.width (would be set by resize):', canvas && canvas.width);
  console.log('  canvas.height (would be set by resize):', canvas && canvas.height);

  // Check if the wrapper's focusScript ran
  const allElements = win.document.body.children;
  console.log('');
  console.log('=== Wrapper focus isolation ===');
  console.log('  body.children.length:', allElements.length);
  let roleCount = 0;
  let residualCount = 0;
  for (const el of allElements) {
    const role = el.getAttribute('data-threeui-role');
    const residual = el.getAttribute('data-threeui-residual');
    if (role) roleCount++;
    if (residual) residualCount++;
  }
  console.log('  elements with data-threeui-role:', roleCount);
  console.log('  elements with data-threeui-residual:', residualCount);

  // What happened with the canvas — was it moved to body root?
  if (canvas) {
    console.log('  canvas.parentElement.tagName:', canvas.parentElement && canvas.parentElement.tagName);
    console.log('  canvas has data-threeui-role:', canvas.getAttribute('data-threeui-role') || '(none)');
    console.log('  canvas has data-threeui-residual:', canvas.getAttribute('data-threeui-residual') || '(none)');
  }

  // Check pauseBtn
  const pauseBtn = win.document.getElementById('pauseBtn');
  console.log('');
  console.log('=== Controls ===');
  console.log('  pauseBtn:', !!pauseBtn);
  console.log('  pauseBtn visible:', pauseBtn ? win.getComputedStyle(pauseBtn).display : 'n/a');

  console.log('');
  console.log('=== ERRORS ===');
  if (errors.length === 0) console.log('  (none)');
  else errors.slice(0, 5).forEach((e, i) => console.log('  [' + i + '] ' + e.slice(0, 400)));

  console.log('');
  console.log('=== CONSOLE ===');
  consoleLogs.slice(0, 5).forEach((m, i) => console.log('  [' + i + '] ' + m.slice(0, 300)));

  dom.window.close();
  process.exit(0);
}, 2000);
