const puppeteer = require('puppeteer-core');

(async () => {
  // NO --disable-gpu — this matters for WebGL
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      // Note: removed --disable-gpu so WebGL can initialize
    ],
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

  // Hide all OTHER polar layers + parent editorial UI to isolate cloud
  await page.evaluate(() => {
    document.querySelectorAll('.polar-layer').forEach((l) => {
      if (!l.classList.contains('polar-cloud')) l.style.display = 'none';
    });
    document.querySelectorAll('.site-header, .hero-copy, main > section, .page-shell > section, header, footer').forEach((el) => {
      el.style.visibility = 'hidden';
    });
  });

  // Scroll to cloud peak
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.55);
  });
  await new Promise(r => setTimeout(r, 8000));  // give WebGL time to draw

  const cloudIframe = await page.$('.polar-cloud iframe');
  if (cloudIframe) {
    await cloudIframe.screenshot({ path: '/tmp/cloud-real-gpu.png' });
    console.log('saved /tmp/cloud-real-gpu.png');
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
