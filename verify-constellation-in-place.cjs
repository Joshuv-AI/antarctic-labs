const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
    defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();

  // Block ALL external CDN requests to simulate the parent CSP block
  // (the production page would have the same blocks because the parent CSP has connect-src 'self')
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('antarctic-labs.com') || url.startsWith('data:') || url.startsWith('about:')) req.continue();
    else req.abort();
  });

  // Set up CDP to discover all execution contexts (including those inside sandboxed iframes)
  const cdp = await page.target().createCDPSession();
  await cdp.send('Target.setDiscoverTargets', { discover: true });

  await page.goto('https://antarctic-labs.com', { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for the particle physics to run several frames
  await new Promise(r => setTimeout(r, 6000));

  // Take a focused screenshot of the constellation iframe area
  // The constellation iframe is the first iframe (parent=polar-constellation),
  // positioned at 0,0 with full viewport dimensions
  const iframeEl = await page.$('.polar-constellation iframe');
  if (!iframeEl) {
    console.log('NO CONSTELLATION IFRAME FOUND');
    await browser.close();
    process.exit(1);
  }

  await iframeEl.screenshot({ path: '/tmp/constellation-iframe-shot.png' });
  console.log('Saved iframe screenshot to /tmp/constellation-iframe-shot.png');

  // Also save the full viewport screenshot
  await page.screenshot({ path: '/tmp/antarctic-constellation-inplace.png' });
  console.log('Saved viewport screenshot to /tmp/antarctic-constellation-inplace.png');

  // Analyze the iframe screenshot pixels
  const fs = require('fs');
  const buf = fs.readFileSync('/tmp/constellation-iframe-shot.png');
  // Simple PNG header check + size
  console.log(`iframe screenshot size: ${buf.length} bytes`);

  // Use python to analyze pixels
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
