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

  // Hide all OTHER polar layers + parent editorial UI so we can isolate the cloud
  await page.evaluate(() => {
    document.querySelectorAll('.polar-layer').forEach((l) => {
      if (!l.classList.contains('polar-cloud')) l.style.display = 'none';
    });
    // Hide parent page editorial chrome so it doesn't compete with the cloud screenshot
    document.querySelectorAll('.site-header, .hero-copy, main > section, .page-shell > section, header').forEach((el) => {
      el.style.visibility = 'hidden';
    });
  });

  // Scroll positions: 0.40, 0.55, 0.70 (rising into and through cloud zone)
  for (const progress of [0.40, 0.55, 0.70]) {
    await page.evaluate((p) => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, max * p);
    }, progress);
    await new Promise(r => setTimeout(r, 3500));

    const cloudIframe = await page.$('.polar-cloud iframe');
    if (cloudIframe) {
      const outPath = `/tmp/cloud-only-${Math.round(progress * 100)}.png`;
      await cloudIframe.screenshot({ path: outPath });
      console.log(`saved ${outPath}`);
    }
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
