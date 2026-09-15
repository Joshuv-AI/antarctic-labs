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

  for (const p of [0.0, 0.40, 0.70]) {
    await page.evaluate((progress) => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, max * progress);
    }, p);
    await new Promise(r => setTimeout(r, 4000));

    const layers = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.polar-layer')).map((l) => ({
        cls: l.className,
        opacity: getComputedStyle(l).opacity,
        rect: (() => { const r = l.getBoundingClientRect(); return { w: r.width, h: r.height }; })(),
      }));
    });
    console.log(`\n[progress=${p}] layers:`);
    layers.forEach((l) => console.log(`  ${l.cls}: opacity=${l.opacity}  rect=${l.rect.w}x${l.rect.h}`));

    await page.screenshot({ path: `/tmp/verify-p${Math.round(p * 100)}.png` });
    console.log(`  saved /tmp/verify-p${Math.round(p * 100)}.png`);
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
