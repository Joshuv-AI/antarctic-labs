const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-first-run'],
    defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('antarctic-labs.com') || url.startsWith('data:') || url.startsWith('about:')) req.continue();
    else req.abort();
  });

  await page.goto('https://antarctic-labs.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  // At top of page, take screenshot
  await page.screenshot({ path: '/tmp/stars-top.png' });

  // Sample pixels from the constellation iframe via screenshot pixel inspection
  const starsCheck = await page.evaluate(async () => {
    // Get the constellation iframe (now z-index 3, on top)
    const iframe = document.querySelector('.polar-constellation iframe');
    if (!iframe) return { error: 'no constellation iframe' };

    // Read the iframe document's body bg (should be transparent)
    const bodyBg = iframe.contentDocument ? getComputedStyle(iframe.contentDocument.body).backgroundColor : 'inaccessible';

    // The constellation particles draw onto a <canvas> inside the iframe
    // We can't access contentDocument directly due to sandbox, but we can
    // ask the iframe to report via postMessage. Instead, just confirm the
    // layer ordering and visibility by checking computed opacity chain.
    const layer = document.querySelector('.polar-constellation');
    const cloudLayer = document.querySelector('.polar-cloud');
    const waterLayer = document.querySelector('.polar-water');

    return {
      constellation: {
        layerZ: getComputedStyle(layer).zIndex,
        layerOpacity: getComputedStyle(layer).opacity,
        iframeZ: getComputedStyle(iframe).zIndex,
        iframeRect: (() => { const r = iframe.getBoundingClientRect(); return { w: r.width, h: r.height }; })(),
      },
      cloud: {
        layerZ: getComputedStyle(cloudLayer).zIndex,
        layerOpacity: getComputedStyle(cloudLayer).opacity,
      },
      water: {
        layerZ: getComputedStyle(waterLayer).zIndex,
        layerOpacity: getComputedStyle(waterLayer).opacity,
      },
      iframeBodyBg: bodyBg,
    };
  });

  console.log('=== Live state at scroll top ===');
  console.log(JSON.stringify(starsCheck, null, 2));

  // Scroll through the transition
  for (const p of [0.0, 0.15, 0.30, 0.50, 0.70, 0.85]) {
    await page.evaluate((progress) => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, max * progress);
    }, p);
    await new Promise(r => setTimeout(r, 3000));
    const state = await page.evaluate(() => {
      const c = document.querySelector('.polar-constellation');
      const cl = document.querySelector('.polar-cloud');
      const w = document.querySelector('.polar-water');
      return {
        constellation: getComputedStyle(c).opacity,
        cloud: getComputedStyle(cl).opacity,
        water: getComputedStyle(w).opacity,
      };
    });
    console.log(`\n[progress=${p}]`);
    console.log(`  constellation opacity: ${state.constellation}`);
    console.log(`  cloud opacity:         ${state.cloud}`);
    console.log(`  water opacity:         ${state.water}`);
    await page.screenshot({ path: `/tmp/stars-p${Math.round(p * 100)}.png` });
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
