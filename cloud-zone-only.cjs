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

  // Scroll to cloud peak (progress ≈ 0.70)
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.70);
  });
  await new Promise(r => setTimeout(r, 5000));

  // Hide all polar layers EXCEPT the cloud, so we see the cloud iframe raw
  await page.evaluate(() => {
    document.querySelectorAll('.polar-layer').forEach((l) => {
      if (!l.classList.contains('polar-cloud')) {
        l.style.display = 'none';
      }
    });
    // Also hide the parent page's editorial UI for clean inspection
    document.querySelectorAll('.site-header, .hero-copy, .editorial, main > section, .page-shell > section').forEach((el) => {
      el.style.visibility = 'hidden';
    });
  });
  await new Promise(r => setTimeout(r, 2000));

  // Capture JUST the cloud iframe's content (sandbox blocks contentDocument access,
  // but iframe screenshot captures what's actually rendered inside)
  const cloudIframe = await page.$('.polar-cloud iframe');
  if (cloudIframe) {
    await cloudIframe.screenshot({ path: '/tmp/cloud-only-iframe.png' });
    console.log('saved /tmp/cloud-only-iframe.png');
  }

  await page.screenshot({ path: '/tmp/cloud-only-viewport.png' });
  console.log('saved /tmp/cloud-only-viewport.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
