const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
  const srcDoc = fs.readFileSync('/tmp/constellation-iframe.html', 'utf-8');
  console.log('iframe srcDoc size:', srcDoc.length);

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
    defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();

  // Block all external CDN requests (simulates parent CSP block)
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('about:')) req.continue();
    else req.abort();
  });

  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  await page.setContent(srcDoc, { waitUntil: 'load', timeout: 15000 });

  // Give particle physics time to run multiple frames
  await new Promise(r => setTimeout(r, 5000));

  const state = await page.evaluate(() => {
    const c = document.getElementById('particle-canvas');
    if (!c) return { error: 'no canvas' };
    const rect = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    const ctx = c.getContext('2d');
    let pixelSamples = [];
    let brightPixels = 0;
    let totalSampled = 0;
    try {
      if (ctx && c.width > 0 && c.height > 0) {
        for (let y = 20; y < c.height; y += 40) {
          for (let x = 20; x < c.width; x += 40) {
            const d = ctx.getImageData(x, y, 1, 1).data;
            totalSampled++;
            if (d[0] > 20 || d[1] > 20 || d[2] > 20) {
              brightPixels++;
              if (pixelSamples.length < 5) pixelSamples.push([x, y, d[0], d[1], d[2], d[3]]);
            }
          }
        }
      }
    } catch (e) { return { error: 'pixel sample failed: ' + e.message }; }

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
      display: cs.display,
      visibility: cs.visibility,
      pixelSamples,
      totalSampled,
      brightPixels,
      brightRatio: totalSampled > 0 ? (brightPixels / totalSampled * 100).toFixed(1) + '%' : 'n/a',
      bodyClass: document.body.className,
      threeuiReady: document.body.getAttribute('data-threeui-ready'),
      windowInnerWidth: window.innerWidth,
      windowInnerHeight: window.innerHeight,
      roleEls: document.querySelectorAll('[data-threeui-role]').length,
      residualEls: document.querySelectorAll('[data-threeui-residual]').length,
    };
  });

  console.log('\n=== Canvas state after 5 seconds ===');
  console.log(JSON.stringify(state, null, 2));

  console.log('\n=== Console logs ===');
  if (logs.length === 0) console.log('  (none)');
  else logs.forEach((l, i) => console.log(`  [${i}] ${l.slice(0, 300)}`));

  await page.screenshot({ path: '/tmp/constellation-standalone.png' });
  console.log('\nScreenshot saved to /tmp/constellation-standalone.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
