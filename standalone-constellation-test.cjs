const puppeteer = require('puppeteer-core');
const https = require('https');
const fs = require('fs');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
  const bundle = await fetch('https://antarctic-labs.com/assets/index-BLjFRrrA.js');
  console.log('bundle size:', bundle.length);

  // Extract constellation iframe srcDoc from the served bundle.
  // Find the constellation wrapper's controlScript, then look back for the
  // "<!DOCTYPE html>" of the constellation iframe, forward to "</html>".
  const ctrlIdx = bundle.indexOf('window.__SF_CONTROLS = controls;');
  console.log('controlScript at offset:', ctrlIdx);

  // Look BACKWARD for the most recent <!DOCTYPE before the constellation wrapper
  const docIdx = bundle.lastIndexOf('<!DOCTYPE', ctrlIdx);
  console.log('constellation <!DOCTYPE> at offset:', docIdx);

  // Look forward for the matching </html> AFTER the wrapper injection
  const htmlEnd = bundle.indexOf('</html>', docIdx) + 7;
  console.log('constellation </html> at offset:', htmlEnd);

  const srcDoc = bundle.slice(docIdx, htmlEnd);
  console.log('constellation iframe srcDoc size:', srcDoc.length);

  // Save it for inspection
  fs.writeFileSync('/tmp/constellation-served-srcdoc.html', srcDoc);

  // Now load it in a headless Chromium with the parent CSP applied
  // We'll block ALL external requests to simulate the parent's `connect-src 'self'`
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
    defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();

  // Block all external network — simulates the parent CSP block
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    // Allow data URLs and same-origin (none expected), block everything else
    if (url.startsWith('data:') || url.startsWith('about:')) {
      req.continue();
    } else {
      req.abort();
    }
  });

  // Capture console
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  // Load the constellation srcDoc as a standalone page
  console.log('\n=== Loading constellation srcDoc standalone (all CDNs blocked) ===');
  await page.setContent(srcDoc, { waitUntil: 'load', timeout: 15000 });

  // Give the particle physics time to run several frames
  await new Promise(r => setTimeout(r, 4000));

  // Check the canvas state
  const state = await page.evaluate(() => {
    const c = document.getElementById('particle-canvas');
    if (!c) return { error: 'no canvas' };
    const rect = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    const ctx = c.getContext('2d');
    let pixels = null;
    let brightPixels = 0;
    let totalSampled = 0;
    try {
      if (ctx && c.width > 0 && c.height > 0) {
        // Sample 200 pixels in a grid
        const samples = [];
        for (let y = 20; y < c.height; y += Math.max(20, Math.floor(c.height / 10))) {
          for (let x = 20; x < c.width; x += Math.max(20, Math.floor(c.width / 10))) {
            const d = ctx.getImageData(x, y, 1, 1).data;
            totalSampled++;
            if (d[0] > 20 || d[1] > 20 || d[2] > 20) brightPixels++;
            if (samples.length < 5) samples.push([x, y, d[0], d[1], d[2], d[3]]);
          }
        }
        pixels = samples;
      }
    } catch (e) { pixels = 'err: ' + e.message; }

    // Also check if a global particles array exists and has length > 0
    const bodyHTML = document.body.innerHTML.slice(0, 500);
    const scriptCount = document.querySelectorAll('script').length;
    return {
      canvasWidth: c.width,
      canvasHeight: c.height,
      offsetWidth: c.offsetWidth,
      offsetHeight: c.offsetHeight,
      styleWidth: c.style.width,
      styleHeight: c.style.height,
      computedWidth: cs.width,
      computedHeight: cs.height,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      classList: c.className,
      pixelSamples: pixels,
      totalSampled,
      brightPixels,
      brightRatio: totalSampled > 0 ? (brightPixels / totalSampled * 100).toFixed(1) + '%' : 'n/a',
      bodyClass: document.body.className,
      scriptCount,
      windowInnerWidth: window.innerWidth,
      windowInnerHeight: window.innerHeight,
      threeuiReady: document.body.getAttribute('data-threeui-ready'),
      bgColor: cs.backgroundColor,
      gsapLoaded: typeof gsap,
    };
  });

  console.log('\n=== Canvas state (after 4 seconds of frames) ===');
  console.log(JSON.stringify(state, null, 2));

  console.log('\n=== Console logs ===');
  if (logs.length === 0) console.log('  (none)');
  else logs.forEach((l, i) => console.log(`  [${i}] ${l.slice(0, 300)}`));

  // Screenshot
  await page.screenshot({ path: '/tmp/standalone-constellation.png' });
  console.log('\nScreenshot saved to /tmp/standalone-constellation.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
