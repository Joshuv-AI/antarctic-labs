const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
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

  // Load the already-patched standalone HTML (with markers + wrapper injections)
  const html = fs.readFileSync('/tmp/cloud-markers-final.html', 'utf-8');
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  await page.goto(dataUrl, { waitUntil: 'load', timeout: 30000 });

  // Give WebGL time to draw multiple frames
  await new Promise(r => setTimeout(r, 5000));

  // Screenshot the canvas directly
  const canvas = await page.$('#c');
  if (canvas) {
    await canvas.screenshot({ path: '/tmp/cloud-standalone-canvas.png' });
    console.log('saved /tmp/cloud-standalone-canvas.png');
  }

  // Also full-viewport screenshot
  await page.screenshot({ path: '/tmp/cloud-standalone-viewport.png' });
  console.log('saved /tmp/cloud-standalone-viewport.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
