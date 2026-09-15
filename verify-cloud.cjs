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

  // Capture errors only (no warnings)
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto('https://antarctic-labs.com', { waitUntil: 'networkidle2', timeout: 30000 });

  // Get iframe count + cloud iframe state
  const iframes = await page.evaluate(() => {
    const layers = document.querySelectorAll('.polar-layer');
    return Array.from(layers).map((l) => {
      const iframe = l.querySelector('iframe');
      return {
        parentClass: l.className,
        opacity: getComputedStyle(l).opacity,
        iframeExists: !!iframe,
        srcDocLen: iframe ? (iframe.srcdoc || '').length : 0,
      };
    });
  });
  console.log('polar layers:', JSON.stringify(iframes, null, 2));

  // Scroll to ~70% so the cloud layer is fully visible (per PolarScene narrative: 0.20–0.95)
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.70);
  });
  await new Promise(r => setTimeout(r, 4000));

  // Screenshot the cloud iframe (z-index 2, mid layer)
  const cloudIframe = await page.$('.polar-cloud iframe');
  if (cloudIframe) {
    await cloudIframe.screenshot({ path: '/tmp/cloud-iframe-shot.png' });
    console.log('Saved cloud iframe screenshot to /tmp/cloud-iframe-shot.png');
  }

  // Full viewport screenshot
  await page.screenshot({ path: '/tmp/live-cloud-viewport.png' });
  console.log('Saved viewport screenshot to /tmp/live-cloud-viewport.png');

  console.log('\n=== errors ===');
  if (errors.length === 0) console.log('  (none)');
  else errors.slice(0, 5).forEach((e, i) => console.log(`  [${i}] ${e.slice(0, 200)}`));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
