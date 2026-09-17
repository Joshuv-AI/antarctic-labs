const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-first-run'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);

  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('antarctic-labs.com') || url.startsWith('data:') || url.startsWith('about:')) req.continue();
    else req.abort();
  });

  await page.goto('https://antarctic-labs.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  console.log('=== Desktop screenshots ===');
  // 1. Home top
  await page.screenshot({ path: '/tmp/polish-desktop-home-top.png' });
  console.log('  /tmp/polish-desktop-home-top.png');

  // 2. Home middle (signal)
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.30);
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: '/tmp/polish-desktop-home-signal.png' });
  console.log('  /tmp/polish-desktop-home-signal.png');

  // 3. Home capabilities / statement
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.55);
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: '/tmp/polish-desktop-home-caps.png' });
  console.log('  /tmp/polish-desktop-home-caps.png');

  // 4. Home statement / CTA
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.85);
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: '/tmp/polish-desktop-home-cta.png' });
  console.log('  /tmp/polish-desktop-home-cta.png');

  // 5. Open menu + screenshot
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 500));
  await page.click('.menu-button').catch(() => {});
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: '/tmp/polish-desktop-menu-open.png' });
  console.log('  /tmp/polish-desktop-menu-open.png');

  // 6. Close menu, then visit each destination
  await page.click('.menu-overlay button').catch(() => {});
  await new Promise(r => setTimeout(r, 500));

  const destinations = [
    '/the-lab', '/systems', '/expeditions', '/history',
    '/tower-of-babel', '/tower-of-babel/library', '/government',
    '/operator', '/field-interests', '/transmission'
  ];
  for (const path of destinations) {
    await page.goto('https://antarctic-labs.com' + path, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));
    const slug = path.replaceAll('/', '_').replace(/^_|_$/g, '') || 'home';
    await page.screenshot({ path: `/tmp/polish-desktop${path === '/' ? '_home' : path.replaceAll('/','_')}.png` });
    console.log(`  /tmp/polish-desktop${path === '/' ? '_home' : path.replaceAll('/','_')}.png`);
  }

  // 7. Open an Expedition detail
  await page.goto('https://antarctic-labs.com/expeditions', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  await page.click('.expedition-card').catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: '/tmp/polish-desktop-expedition-detail.png' });
  console.log('  /tmp/polish-desktop-expedition-detail.png');

  if (errors.length) {
    console.log('\n=== console errors ===');
    errors.forEach(e => console.log('  ' + e.slice(0, 200)));
  } else {
    console.log('\n=== no console errors ===');
  }

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
