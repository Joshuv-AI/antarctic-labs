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

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('antarctic-labs.com') || url.startsWith('data:') || url.startsWith('about:')) req.continue();
    else req.abort();
  });

  await page.goto('https://antarctic-labs.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  // Scroll to water-dominant zone (progress 0.80)
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.80);
  });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: '/tmp/water-no-mark.png' });
  console.log('saved /tmp/water-no-mark.png  (progress=0.80, water-dominant)');

  // Also check the middle of the water transition (progress 0.70)
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.70);
  });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: '/tmp/water-transition.png' });
  console.log('saved /tmp/water-transition.png  (progress=0.70, cloud→water handoff)');

  // Verify layers
  const state = await page.evaluate(() => ({
    constellation: getComputedStyle(document.querySelector('.polar-constellation')).opacity,
    cloud:        getComputedStyle(document.querySelector('.polar-cloud')).opacity,
    water:        getComputedStyle(document.querySelector('.polar-water')).opacity,
    iframeCount:  document.querySelectorAll('iframe').length,
  }));
  console.log('=== Layer state at progress 0.70 ===');
  console.log(JSON.stringify(state, null, 2));

  // Filter out expected CSP-blocked iframe asset errors (same as cloud/constellation)
  const realErrors = errors.filter((e) => !/static\.cloudflareinsights|fonts\.googleapis|cdn\.tailwindcss|code\.iconify|cdnjs\.cloudflare|hoirqrkdgbmvpwutwuwj|fonts\.gstatic/i.test(e));
  if (realErrors.length) {
    console.log('\n=== Unexpected errors ===');
    realErrors.forEach((e) => console.log('  ' + e));
  } else {
    console.log('\n=== No unexpected errors (CSP blocks for iframe assets are expected) ===');
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
