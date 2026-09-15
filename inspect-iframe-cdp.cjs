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

  // Get the frame tree
  const frameTree = await cdp.send('Page.getFrameTree');

  function walkFrames(node, depth) {
    const indent = '  '.repeat(depth);
    console.log(`${indent}frame id=${node.frame.id} url=${node.frame.url.slice(0, 100)}`);
    if (node.childFrames) node.childFrames.forEach(c => walkFrames(c, depth + 1));
  }
  walkFrames(frameTree, 0);

  // The constellation iframe should be a child frame (srcDoc iframes are about:blank frames)
  const childFrames = frameTree.childFrames || [];
  console.log(`\nFound ${childFrames.length} child frames`);

  for (const cf of childFrames) {
    console.log(`\n=== Inspecting child frame ${cf.frame.id} ===`);
    // Get a debugger session for this frame's target
    try {
      const target = await cdp.send('Target.getTargetForFrame', { frameId: cf.frame.id });
      const frameSession = await cdp.connection.createSession(target.targetId);
      await frameSession.send('Runtime.enable');

      const result = await frameSession.send('Runtime.evaluate', {
        expression: `
          JSON.stringify({
            title: document.title,
            bodyExists: !!document.body,
            bodyClass: document.body ? document.body.className : null,
            canvas: (function() {
              const c = document.getElementById('particle-canvas');
              if (!c) return null;
              const rect = c.getBoundingClientRect();
              let pixelSample = null;
              try {
                const ctx = c.getContext('2d');
                if (ctx) {
                  // Sample several pixels across the canvas
                  const samples = [];
                  for (const [x, y] of [[50, 50], [200, 100], [500, 400], [800, 600], [1000, 300]]) {
                    const d = ctx.getImageData(x, y, 1, 1).data;
                    samples.push([x, y, d[0], d[1], d[2], d[3]]);
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
                classList: c.className,
                computedWidth: getComputedStyle(c).width,
                computedHeight: getComputedStyle(c).height,
                pixelSample,
              };
            })(),
            windowInnerWidth: window.innerWidth,
            windowInnerHeight: window.innerHeight,
            gsap: typeof gsap,
            ScrollTrigger: typeof ScrollTrigger,
            threeuiReady: document.body.getAttribute('data-threeui-ready'),
            threeuiRoleCanvases: document.querySelectorAll('[data-threeui-role="background"]').length,
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
