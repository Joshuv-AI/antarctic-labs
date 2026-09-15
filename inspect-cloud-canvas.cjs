const puppeteer = require('puppeteer-core');

(async () => {
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
    if (url.includes('antarctic-labs.com') || url.startsWith('data:') || url.startsWith('about:')) req.continue();
    else req.abort();
  });

  await page.goto('https://antarctic-labs.com', { waitUntil: 'networkidle2', timeout: 30000 });

  // Scroll to cloud zone
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.70);
  });
  await new Promise(r => setTimeout(r, 5000));

  // Get all frames including nested iframes
  const frames = page.frames();
  console.log(`Total frames: ${frames.length}`);
  frames.forEach((f, i) => {
    console.log(`  [${i}] url=${f.url().slice(0, 80)}  parent=${f.parentFrame() ? f.parentFrame().url().slice(0, 50) : 'none'}`);
  });

  // For each iframe frame, evaluate JS to check canvas state
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.url() === 'about:blank' && f.parentFrame()) {
      try {
        const result = await f.evaluate(() => {
          const c = document.getElementById('c');
          if (!c) return { hasCanvas: false, bodyChildren: Array.from(document.body.children).map(e => e.tagName + '.' + e.className.slice(0, 30)) };
          const rect = c.getBoundingClientRect();
          const cs = getComputedStyle(c);
          const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
          let pixels = null;
          if (gl) {
            try {
              const buf = new Uint8Array(4);
              gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
              pixels = Array.from(buf);
            } catch (e) { pixels = 'readPixels err: ' + e.message; }
          }
          return {
            hasCanvas: true,
            canvasWidth: c.width,
            canvasHeight: c.height,
            rect: { w: rect.width, h: rect.height },
            computedDisplay: cs.display,
            computedPosition: cs.position,
            computedOpacity: cs.opacity,
            computedWidth: cs.width,
            computedHeight: cs.height,
            hasWebGL: !!gl,
            centerPixel: pixels,
            bodyChildren: Array.from(document.body.children).map(e => e.tagName + '.' + e.className.slice(0, 30)),
          };
        });
        console.log(`\n=== Frame ${i} ===`);
        console.log(JSON.stringify(result, null, 2));
      } catch (e) {
        console.log(`\n=== Frame ${i} ===\n  error: ${e.message.slice(0, 200)}`);
      }
    }
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
