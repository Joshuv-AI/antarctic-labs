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
  await new Promise(r => setTimeout(r, 5000));

  // === At top of page: constellation should be visible ===
  await page.screenshot({ path: '/tmp/defense-top.png' });
  console.log('saved /tmp/defense-top.png  (top, constellation should be visible)');

  const topState = await page.evaluate(() => {
    const constLayer = document.querySelector('.polar-constellation');
    const cloudLayer = document.querySelector('.polar-cloud');
    const waterLayer = document.querySelector('.polar-water');
    return {
      constellation: { opacity: getComputedStyle(constLayer).opacity, zIndex: getComputedStyle(constLayer).zIndex },
      cloud:        { opacity: getComputedStyle(cloudLayer).opacity, zIndex: getComputedStyle(cloudLayer).zIndex },
      water:        { opacity: getComputedStyle(waterLayer).opacity, zIndex: getComputedStyle(waterLayer).zIndex },
      iframeCount: document.querySelectorAll('iframe').length,
    };
  });
  console.log('=== Top state ===');
  console.log(JSON.stringify(topState, null, 2));

  // === Scroll progress 0.20: constellation should still be visible, cloud should be visible ===
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.20);
  });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '/tmp/defense-p20.png' });
  console.log('saved /tmp/defense-p20.png');

  // === Scroll progress 0.55: constellation fading out, cloud dominant ===
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.55);
  });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '/tmp/defense-p55.png' });
  console.log('saved /tmp/defense-p55.png');

  // === Scroll progress 0.85: water dominant ===
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.85);
  });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '/tmp/defense-p85.png' });
  console.log('saved /tmp/defense-p85.png');

  if (errors.length) {
    console.log('\n=== Console / page errors observed ===');
    errors.forEach((e) => console.log('  ' + e));
  } else {
    console.log('\n=== No console / page errors ===');
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
