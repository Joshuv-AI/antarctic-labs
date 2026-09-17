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

  const fogInfo = await page.evaluate(() => {
    const fog = document.querySelector('.polar-fog');
    if (!fog) return { error: 'no fog layer' };
    const cs = getComputedStyle(fog);
    const r = fog.getBoundingClientRect();
    return {
      opacity: cs.opacity,
      filter: cs.filter,
      mixBlendMode: cs.mixBlendMode,
      zIndex: cs.zIndex,
      background: cs.background.slice(0, 200),
      willChange: cs.willChange,
      transition: cs.transition,
      rect: { w: r.width, h: r.height },
    };
  });
  console.log('=== Fog layer state at scroll top ===');
  console.log(JSON.stringify(fogInfo, null, 2));

  console.log('\n=== Fog opacity at multiple scroll positions ===');
  for (const p of [0.0, 0.20, 0.40, 0.50, 0.58, 0.70, 0.85, 0.95]) {
    await page.evaluate((progress) => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, max * progress);
    }, p);
    await new Promise(r => setTimeout(r, 2500));
    const state = await page.evaluate(() => ({
      fog: getComputedStyle(document.querySelector('.polar-fog')).opacity,
      constellation: getComputedStyle(document.querySelector('.polar-constellation')).opacity,
      cloud: getComputedStyle(document.querySelector('.polar-cloud')).opacity,
      water: getComputedStyle(document.querySelector('.polar-water')).opacity,
    }));
    console.log(`  p=${p.toFixed(2)}: fog=${state.fog}  constellation=${state.constellation}  cloud=${state.cloud}  water=${state.water}`);
    await page.screenshot({ path: `/tmp/fog-p${Math.round(p * 100)}.png` });
  }

  // Real-error filter (CSP blocks for iframe assets are expected)
  const realErrors = errors.filter((e) =>
    !/static\.cloudflareinsights|fonts\.googleapis|cdn\.tailwindcss|code\.iconify|cdnjs\.cloudflare|hoirqrkdgbmvpwutwuwj|fonts\.gstatic|gsap is not defined/i.test(e)
  );
  if (realErrors.length) {
    console.log('\n=== Unexpected errors ===');
    realErrors.forEach((e) => console.log('  ' + e));
  } else {
    console.log('\n=== No unexpected errors ===');
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
