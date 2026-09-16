const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      // Mobile emulation flags
      '--use-mobile-user-agent',
    ],
    defaultViewport: {
      width: 390, height: 844,  // iPhone 14 Pro logical viewport
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('antarctic-labs.com') || url.startsWith('data:') || url.startsWith('about:')) req.continue();
    else req.abort();
  });

  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  page.emulateTimezone('America/New_York');

  await page.goto('https://antarctic-labs.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  // Take initial screenshot at top (mobile)
  await page.screenshot({ path: '/tmp/mobile-top.png' });
  console.log('saved /tmp/mobile-top.png  (mobile @ top, progress=0)');

  // === Test 1: FAST DOWN SCROLL (fling inertia) ===
  console.log('\n=== Test 1: FAST DOWN SCROLL ===');
  // Simulate a fast downward fling: many small scrollTo calls over a short period
  // with a big delta each time, mimicking touch-event-driven inertia scroll
  const max = await page.evaluate(() => Math.max(1, document.documentElement.scrollHeight - window.innerHeight));
  await page.evaluate(async (maxScroll) => {
    // Burst 30 scroll events over ~300ms (simulates ~100Hz scroll events during fling)
    for (let i = 0; i < 30; i++) {
      window.scrollTo(0, maxScroll * (i / 29));
      await new Promise(r => setTimeout(r, 10));
    }
  }, max);
  // Let any pending transitions settle
  await new Promise(r => setTimeout(r, 800));
  const downState = await page.evaluate(() => ({
    constellation: getComputedStyle(document.querySelector('.polar-constellation')).opacity,
    cloud: getComputedStyle(document.querySelector('.polar-cloud')).opacity,
    water: getComputedStyle(document.querySelector('.polar-water')).opacity,
    scrollY: window.scrollY,
  }));
  console.log('  after fast DOWN:', downState);
  await page.screenshot({ path: '/tmp/mobile-after-fast-down.png' });
  console.log('  saved /tmp/mobile-after-fast-down.png');

  // === Test 2: FAST UP SCROLL ===
  console.log('\n=== Test 2: FAST UP SCROLL ===');
  await page.evaluate(async (maxScroll) => {
    for (let i = 30; i >= 0; i--) {
      window.scrollTo(0, maxScroll * (i / 30));
      await new Promise(r => setTimeout(r, 10));
    }
  }, max);
  await new Promise(r => setTimeout(r, 800));
  const upState = await page.evaluate(() => ({
    constellation: getComputedStyle(document.querySelector('.polar-constellation')).opacity,
    cloud: getComputedStyle(document.querySelector('.polar-cloud')).opacity,
    water: getComputedStyle(document.querySelector('.polar-water')).opacity,
    scrollY: window.scrollY,
  }));
  console.log('  after fast UP:', upState);
  await page.screenshot({ path: '/tmp/mobile-after-fast-up.png' });
  console.log('  saved /tmp/mobile-after-fast-up.png');

  // === Test 3: SLOW SCROLL DOWN ===
  console.log('\n=== Test 3: SLOW SCROLL DOWN ===');
  await page.evaluate(async (maxScroll) => {
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      window.scrollTo(0, maxScroll * (i / steps));
      await new Promise(r => setTimeout(r, 80));  // ~80ms between steps = 12.5Hz scroll
    }
  }, max);
  await new Promise(r => setTimeout(r, 600));
  const slowDownState = await page.evaluate(() => ({
    constellation: getComputedStyle(document.querySelector('.polar-constellation')).opacity,
    cloud: getComputedStyle(document.querySelector('.polar-cloud')).opacity,
    water: getComputedStyle(document.querySelector('.polar-water')).opacity,
  }));
  console.log('  after slow DOWN:', slowDownState);

  // === Test 4: SLOW SCROLL UP ===
  console.log('\n=== Test 4: SLOW SCROLL UP ===');
  await page.evaluate(async (maxScroll) => {
    const steps = 60;
    for (let i = steps; i >= 0; i--) {
      window.scrollTo(0, maxScroll * (i / steps));
      await new Promise(r => setTimeout(r, 80));
    }
  }, max);
  await new Promise(r => setTimeout(r, 600));
  const slowUpState = await page.evaluate(() => ({
    constellation: getComputedStyle(document.querySelector('.polar-constellation')).opacity,
    cloud: getComputedStyle(document.querySelector('.polar-cloud')).opacity,
    water: getComputedStyle(document.querySelector('.polar-water')).opacity,
  }));
  console.log('  after slow UP:', slowUpState);
  await page.screenshot({ path: '/tmp/mobile-back-to-top.png' });
  console.log('  saved /tmp/mobile-back-to-top.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
