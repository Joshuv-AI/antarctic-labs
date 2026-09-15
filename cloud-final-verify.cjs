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

  await page.goto('https://antarctic-labs.com', { waitUntil: 'networkidle2', timeout: 30000 });

  // Force the cloud layer to be fully opaque and force-scroll to its peak
  await page.evaluate(() => {
    const cloud = document.querySelector('.polar-cloud');
    if (cloud) cloud.style.opacity = '1';
    document.querySelectorAll('.polar-layer:not(.polar-cloud)').forEach((l) => { l.style.opacity = '0'; });
  });

  // Wait for WebGL to draw
  await new Promise(r => setTimeout(r, 5000));

  // Take a screenshot of the entire viewport
  await page.screenshot({ path: '/tmp/cloud-final-viewport.png' });

  // Also take a screenshot of just the cloud iframe
  const cloudIframe = await page.$('.polar-cloud iframe');
  if (cloudIframe) {
    await cloudIframe.screenshot({ path: '/tmp/cloud-final-iframe.png' });
  }

  console.log('saved /tmp/cloud-final-viewport.png');
  console.log('saved /tmp/cloud-final-iframe.png');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
