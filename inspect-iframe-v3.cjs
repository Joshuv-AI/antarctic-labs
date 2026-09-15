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
    if (url.includes('antarctic-labs.com') || url.startsWith('data:')) req.continue();
    else req.abort();
  });

  const cdp = await page.target().createCDPSession();
  await cdp.send('Target.setDiscoverTargets', { discover: true });

  await page.goto('https://antarctic-labs.com', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  // Enumerate all targets to find iframe execution contexts
  const { targetInfos } = await cdp.send('Target.getTargets');
  console.log('=== All CDP targets ===');
  const iframeTargets = [];
  for (const t of targetInfos) {
    if (t.type === 'iframe') {
      iframeTargets.push(t);
      console.log(`  iframe targetId=${t.targetId}  url=${t.url}`);
    }
  }
  console.log(`Found ${iframeTargets.length} iframe targets`);

  for (const t of iframeTargets) {
    console.log(`\n=== Inspecting iframe targetId=${t.targetId} ===`);
    try {
      const session = await cdp.connection.createSession(t.targetId);
      await session.send('Runtime.enable');

      const result = await session.send('Runtime.evaluate', {
        expression: `
          JSON.stringify({
            title: document.title,
            windowInnerWidth: window.innerWidth,
            windowInnerHeight: window.innerHeight,
            canvas: (function() {
              const c = document.getElementById('particle-canvas');
              if (!c) return null;
              const rect = c.getBoundingClientRect();
              const cs = getComputedStyle(c);
              let pixels = null;
              try {
                const ctx = c.getContext('2d');
                if (ctx && c.width > 0 && c.height > 0) {
                  const samples = [];
                  for (const [x, y] of [[10, 10], [200, 200], [500, 400], [800, 600]]) {
                    if (x < c.width && y < c.height) {
                      const d = ctx.getImageData(x, y, 1, 1).data;
                      samples.push([x, y, d[0], d[1], d[2], d[3]]);
                    }
                  }
                  pixels = samples;
                }
              } catch (e) { pixels = 'err: ' + e.message; }
              return {
                canvasWidth: c.width,
                canvasHeight: c.height,
                styleWidth: c.style.width,
                styleHeight: c.style.height,
                offsetWidth: c.offsetWidth,
                offsetHeight: c.offsetHeight,
                rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
                computedWidth: cs.width,
                computedHeight: cs.height,
                classList: c.className,
                pixels,
              };
            })(),
          })
        `,
        returnByValue: true,
      });

      console.log(JSON.stringify(JSON.parse(result.result.value), null, 2));
      await session.detach();
    } catch (e) {
      console.log(`  error: ${e.message}`);
    }
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
