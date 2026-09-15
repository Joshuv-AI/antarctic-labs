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

  // Capture console + CSP errors
  const cspErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') cspErrors.push(msg.text());
  });
  page.on('pageerror', (e) => cspErrors.push('pageerror: ' + e.message));

  await page.goto('https://antarctic-labs.com', { waitUntil: 'networkidle2', timeout: 30000 });

  // Give particle physics plenty of time
  await new Promise(r => setTimeout(r, 8000));

  // Screenshot the constellation iframe
  const constellationIframe = await page.$('.polar-constellation iframe');
  if (constellationIframe) {
    await constellationIframe.screenshot({ path: '/tmp/constellation-after-csp-fix.png' });
    console.log('Saved iframe screenshot to /tmp/constellation-after-csp-fix.png');
  }

  await page.screenshot({ path: '/tmp/antarctic-after-csp-fix.png' });
  console.log('Saved viewport screenshot to /tmp/antarctic-after-csp-fix.png');

  console.log('\n=== CSP / console errors (' + cspErrors.length + ' entries) ===');
  cspErrors.forEach((e, i) => console.log(`  [${i}] ${e.slice(0, 300)}`));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
