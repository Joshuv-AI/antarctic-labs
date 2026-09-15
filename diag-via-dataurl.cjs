const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
  const srcDoc = fs.readFileSync('/tmp/constellation-iframe.html', 'utf-8');
  console.log('iframe srcDoc size:', srcDoc.length);

  // Encode the HTML as a data URL
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(srcDoc);

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
    defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('about:')) req.continue();
    else req.abort();
  });

  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  await page.goto(dataUrl, { waitUntil: 'load', timeout: 15000 });
  await new Promise(r => setTimeout(r, 5000));

  const state = await page.evaluate(() => {
    const c = document.getElementById('particle-canvas');
    if (!c) {
      return {
        error: 'no canvas',
        bodyHTML: document.body ? document.body.innerHTML.length : -1,
        bodyChildCount: document.body ? document.body.children.length : -1,
        bodyFirstChild: document.body && document.body.children[0] ? document.body.children[0].tagName : '(none)',
        allTags: document.body ? Array.from(document.body.querySelectorAll('*')).map(e => e.tagName).slice(0, 10) : [],
      };
    }
    const rect = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    let pixelSamples = [];
    let brightPixels = 0;
    let totalSampled = 0;
    try {
      const ctx = c.getContext('2d');
      if (ctx && c.width > 0 && c.height > 0) {
        for (let y = 10; y < c.height; y += 40) {
          for (let x = 10; x < c.width; x += 40) {
            const d = ctx.getImageData(x, y, 1, 1).data;
            totalSampled++;
            if (d[0] > 15 || d[1] > 15 || d[2] > 15) {
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
      rect: { w: rect.width, h: rect.height },
      pixelSamples,
      totalSampled,
      brightPixels,
      brightRatio: totalSampled > 0 ? (brightPixels / totalSampled * 100).toFixed(1) + '%' : 'n/a',
    };
  });

  console.log('\n=== Canvas state ===');
  console.log(JSON.stringify(state, null, 2));

  console.log('\n=== Console logs (' + logs.length + ' entries) ===');
  logs.forEach((l, i) => console.log(`  [${i}] ${l.slice(0, 300)}`));

  await page.screenshot({ path: '/tmp/constellation-dataurl.png' });
  console.log('\nScreenshot saved to /tmp/constellation-dataurl.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
