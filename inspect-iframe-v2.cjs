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
  await cdp.send('Page.enable');

  await page.goto('https://antarctic-labs.com', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  // CDP Page.getFrameTree returns { frameTree: { frame, childFrames } }
  const response = await cdp.send('Page.getFrameTree');
  const tree = response.frameTree;

  function walkFrames(node, depth) {
    const indent = '  '.repeat(depth);
    console.log(`${indent}frame id=${node.id} url=${(node.url || '').slice(0, 100)}`);
    if (node.childFrames) node.childFrames.forEach(c => walkFrames(c, depth + 1));
  }
  walkFrames(tree, 0);

  const childFrames = tree.childFrames || [];
  console.log(`\nFound ${childFrames.length} child frames`);

  for (const cf of childFrames) {
    console.log(`\n=== Inspecting child frame id=${cf.id} url=${cf.url} ===`);
    try {
      const target = await cdp.send('Target.getTargetForFrame', { frameId: cf.id });
      const frameSession = await cdp.connection.createSession(target.targetId);
      await frameSession.send('Runtime.enable');

      const result = await frameSession.send('Runtime.evaluate', {
        expression: `
          JSON.stringify({
            title: document.title,
            bodyExists: !!document.body,
            bodyClass: document.body ? document.body.className : null,
            windowInnerWidth: window.innerWidth,
            windowInnerHeight: window.innerHeight,
           gsap: typeof gsap,
            ScrollTrigger: typeof ScrollTrigger,
            threeuiReady: document.body ? document.body.getAttribute('data-threeui-ready') : null,
            canvas: (function() {
              const c = document.getElementById('particle-canvas');
              if (!c) return null;
              const rect = c.getBoundingClientRect();
              const cs = getComputedStyle(c);
              let pixelSample = null;
              try {
                const ctx = c.getContext('2d');
                if (ctx) {
                  const samples = [];
                  for (const [x, y] of [[10, 10], [200, 200], [500, 400], [800, 600]]) {
                    if (x < c.width && y < c.height) {
                      const d = ctx.getImageData(x, y, 1, 1).data;
                      samples.push([x, y, d[0], d[1], d[2], d[3]]);
                    }
                  }
                  pixelSample = samples;
                }
              } catch (e) { pixelSample = 'error: ' + e.message; }
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
                pixelSample,
              };
            })(),
          })
        `,
        returnByValue: true,
      });

      console.log(JSON.stringify(JSON.parse(result.result.value), null, 2));
      await frameSession.detach();
    } catch (e) {
      console.log(`  error: ${e.message}`);
    }
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
