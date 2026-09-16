const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-first-run'],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('antarctic-labs.com') || url.startsWith('data:') || url.startsWith('about:')) req.continue();
    else req.abort();
  });

  // Collect constellation-fps messages from any iframe
  const fpsSamples = [];
  await page.exposeFunction('__reportFps', (data) => fpsSamples.push(data));

  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

  await page.goto('https://antarctic-labs.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  // Install a global message listener that forwards constellation-fps postMessages
  await page.evaluate(() => {
    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'constellation-fps') {
        // Tag with current scroll progress
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress = Math.min(1, Math.max(0, window.scrollY / max));
        window.__reportFps({ ...e.data, progress: Math.round(progress * 100) / 100 });
      }
    });
  });

  console.log('=== Capture iframe FPS at 3 positions (top, mid, bottom) ===');

  // Zone 1: progress 0.0 (constellation full, cloud full)
  console.log('\n--- Zone 1: progress 0.0 (top, constellation full) ---');
  fpsSamples.length = 0;
  await new Promise(r => setTimeout(r, 3500));
  const z1 = fpsSamples.slice();
  z1.forEach((s) => console.log(`  p=${s.progress}  frames=${s.frames}  avg=${s.avg_ms.toFixed(1)}ms  p95=${s.p95_ms.toFixed(1)}ms  max=${s.max_ms.toFixed(1)}ms`));

  // Zone 2: progress 0.30 (constellation fading, cloud full)
  console.log('\n--- Zone 2: progress 0.30 (constellation fading) ---');
  fpsSamples.length = 0;
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.30);
  });
  await new Promise(r => setTimeout(r, 3500));
  const z2 = fpsSamples.slice();
  z2.forEach((s) => console.log(`  p=${s.progress}  frames=${s.frames}  avg=${s.avg_ms.toFixed(1)}ms  p95=${s.p95_ms.toFixed(1)}ms  max=${s.max_ms.toFixed(1)}ms`));

  // Zone 3: progress 0.70 (cloud only, no constellation)
  console.log('\n--- Zone 3: progress 0.70 (cloud only, constellation=0) ---');
  fpsSamples.length = 0;
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.70);
  });
  await new Promise(r => setTimeout(r, 3500));
  const z3 = fpsSamples.slice();
  z3.forEach((s) => console.log(`  p=${s.progress}  frames=${s.frames}  avg=${s.avg_ms.toFixed(1)}ms  p95=${s.p95_ms.toFixed(1)}ms  max=${s.max_ms.toFixed(1)}ms`));

  console.log('\n=== Summary ===');
  const summarize = (samples, label) => {
    if (!samples.length) { console.log(`  ${label}: NO SAMPLES`); return; }
    const allAvg = samples.map(s => s.avg_ms);
    const allMax = samples.map(s => s.max_ms);
    allAvg.sort((a, b) => a - b);
    const avgOfAvgs = allAvg.reduce((a, b) => a + b, 0) / allAvg.length;
    const maxOverall = Math.max(...allMax);
    console.log(`  ${label}: avg-of-avgs=${avgOfAvgs.toFixed(1)}ms (${(1000/avgOfAvgs).toFixed(1)} fps)  worst-frame=${maxOverall.toFixed(1)}ms (${(1000/maxOverall).toFixed(1)} fps)`);
  };
  summarize(z1, 'Zone 1: constellation full');
  summarize(z2, 'Zone 2: constellation fading');
  summarize(z3, 'Zone 3: cloud only        ');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
