const puppeteer = require('puppeteer-core');

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
    if (url.includes('antarctic-labs.com') || url.startsWith('data:') || url.startsWith('about:')) req.continue();
    else req.abort();
  });

  await page.goto('https://antarctic-labs.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  for (const p of [0.0, 0.40, 0.70]) {
    await page.evaluate((progress) => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, max * progress);
    }, p);
    await new Promise(r => setTimeout(r, 2000));

    const info = await page.evaluate(() => {
      const layer = document.querySelector('.polar-cloud');
      const iframe = document.querySelector('.polar-cloud iframe');
      return {
        layerInlineStyle: layer ? layer.getAttribute('style') : null,
        layerComputedOpacity: layer ? getComputedStyle(layer).opacity : null,
        iframeInlineStyle: iframe ? iframe.getAttribute('style') : null,
        iframeComputedOpacity: iframe ? getComputedStyle(iframe).opacity : null,
      };
    });
    console.log(`\n[progress=${p}]`);
    console.log(JSON.stringify(info, null, 2));
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
