const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-first-run'],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('antarctic-labs.com') || url.startsWith('data:') || url.startsWith('about:')) req.continue();
    else req.abort();
  });

  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  await page.goto('https://antarctic-labs.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  // Constellation → cloud overlap zone (progress 0.30 — both fully active)
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.30);
  });
  await new Promise(r => setTimeout(r, 2500));

  const audit = await page.evaluate(() => {
    const constLayer = document.querySelector('.polar-constellation');
    const constIframe = document.querySelector('.polar-constellation iframe');
    const cloudLayer = document.querySelector('.polar-cloud');
    const cloudIframe = document.querySelector('.polar-cloud iframe');
    function full(el) {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        opacity: cs.opacity,
        filter: cs.filter,
        webkitFilter: cs.webkitFilter,
        transform: cs.transform,
        webkitTransform: cs.webkitTransform,
        position: cs.position,
        zIndex: cs.zIndex,
        isolation: cs.isolation,
        mixBlendMode: cs.mixBlendMode,
        backdropFilter: cs.backdropFilter,
        webkitBackdropFilter: cs.webkitBackdropFilter,
        contain: cs.contain,
        willChange: cs.willChange,
        backgroundColor: cs.backgroundColor,
      };
    }
    return {
      constellationLayer: full(constLayer),
      constellationIframe: full(constIframe),
      cloudLayer: full(cloudLayer),
      cloudIframe: full(cloudIframe),
    };
  });

  console.log(JSON.stringify(audit, null, 2));

  await page.screenshot({ path: '/tmp/mobile-overlap-zone.png' });
  console.log('saved /tmp/mobile-overlap-zone.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
