const puppeteer = require('puppeteer-core');
const fs = require('fs');

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

  const cdp = await page.target().createCDPSession();
  await cdp.send('Target.setDiscoverTargets', { discover: true });

  // Capture console + errors
  page.on('console', (msg) => console.log(`[parent ${msg.type()}] ${msg.text().slice(0, 200)}`));
  page.on('pageerror', (e) => console.log(`[parent pageerror] ${e.message}`));

  await page.goto('https://antarctic-labs.com', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 6000));

  // Get all CDP targets — find iframe execution contexts
  const { targetInfos } = await cdp.send('Target.getTargets');
  const iframeTargets = targetInfos.filter(t => t.type === 'iframe');
  console.log(`\nFound ${iframeTargets.length} iframe targets`);

  for (const t of iframeTargets) {
    console.log(`\n=== iframe targetId=${t.targetId} url=${t.url} ===`);
    try {
      const session = await cdp.connection.createSession(t.targetId);
      await session.send('Runtime.enable');

      // Listen for this iframe's console
      session.on('Runtime.consoleAPICalled', (e) => {
        console.log(`  [iframe ${e.type}] ${e.args.map(a => a.value || a.description || '?').join(' ').slice(0, 200)}`);
      });
      session.on('Runtime.exceptionThrown', (e) => {
        console.log(`  [iframe EXCEPTION] ${e.exceptionDetails?.text || e.exceptionDetails?.exception?.description || 'unknown'}`);
      });

      // Inspect the iframe's runtime state
      const result = await session.send('Runtime.evaluate', {
        expression: `
          JSON.stringify({
            title: document.title,
            threeuiReady: document.body ? document.body.getAttribute('data-threeui-ready') : null,
            threeuiControls: typeof window.__SF_CONTROLS,
            threeuiApplyControls: typeof window.__SF_APPLY_CONTROLS,
            canvasExists: !!document.getElementById('particle-canvas'),
            canvasRect: (function() {
              const c = document.getElementById('particle-canvas');
              if (!c) return null;
              const r = c.getBoundingClientRect();
              return { w: r.width, h: r.height, x: r.x, y: r.y };
            })(),
            canvasSize: (function() {
              const c = document.getElementById('particle-canvas');
              if (!c) return null;
              return { attrW: c.width, attrH: c.height, styleW: c.style.width, styleH: c.style.height };
            })(),
            gsap: typeof window.gsap,
            pausedBtn: !!document.getElementById('pauseBtn'),
            isPaused: typeof isPaused !== 'undefined' ? isPaused : '(not defined)',
            particlesCount: typeof particles !== 'undefined' ? particles.length : '(not defined)',
            windowInner: window.innerWidth + 'x' + window.innerHeight,
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
