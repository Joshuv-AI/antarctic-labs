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

  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

  await page.goto('https://antarctic-labs.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  // Install FPS observer BEFORE scrolling
  await page.evaluate(() => {
    window.__fpsStats = [];
    let last = performance.now();
    let lastFrameId = null;
    function tick(t) {
      const dt = t - last;
      last = t;
      window.__fpsStats.push({ t: Math.round(t), dt: Math.round(dt * 100) / 100 });
      lastFrameId = requestAnimationFrame(tick);
    }
    lastFrameId = requestAnimationFrame(tick);
    window.__stopFps = () => {
      cancelAnimationFrame(lastFrameId);
      const stats = window.__fpsStats;
      const dts = stats.slice(1).map(s => s.dt);
      dts.sort((a, b) => a - b);
      const sum = dts.reduce((a, b) => a + b, 0);
      return {
        frames: dts.length,
        avg_dt_ms: sum / dts.length,
        median_dt_ms: dts[Math.floor(dts.length / 2)],
        p95_dt_ms: dts[Math.floor(dts.length * 0.95)],
        p99_dt_ms: dts[Math.floor(dts.length * 0.99)],
        max_dt_ms: dts[dts.length - 1],
        fps_avg: 1000 / (sum / dts.length),
      };
    };
  });

  console.log('=== FPS profile: constellation zone (progress 0.0 → 0.30) — fast DOWN ===');
  // Reset stats
  await page.evaluate(() => { window.__fpsStats.length = 0; });
  // Fast DOWN through constellation → cloud
  await page.evaluate(async () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    for (let i = 0; i < 25; i++) {
      window.scrollTo(0, max * (i / 25) * 0.30);
      await new Promise(r => setTimeout(r, 12));
    }
  });
  await new Promise(r => setTimeout(r, 500));
  const constellationZone = await page.evaluate(() => window.__stopFps());
  console.log(JSON.stringify(constellationZone, null, 2));

  console.log('\n=== FPS profile: cloud zone (progress 0.30 → 0.62) — fast DOWN ===');
  await page.evaluate(() => {
    window.__fpsStats.length = 0;
    let last = performance.now();
    let lastFrameId = null;
    function tick(t) { const dt = t - last; last = t; window.__fpsStats.push({ t: t, dt: Math.round(dt * 100) / 100 }); lastFrameId = requestAnimationFrame(tick); }
    lastFrameId = requestAnimationFrame(tick);
    window.__stopFps = () => {
      cancelAnimationFrame(lastFrameId);
      const stats = window.__fpsStats;
      const dts = stats.slice(1).map(s => s.dt);
      dts.sort((a, b) => a - b);
      const sum = dts.reduce((a, b) => a + b, 0);
      return { frames: dts.length, avg_dt_ms: sum / dts.length, median_dt_ms: dts[Math.floor(dts.length / 2)], p95_dt_ms: dts[Math.floor(dts.length * 0.95)], p99_dt_ms: dts[Math.floor(dts.length * 0.99)], max_dt_ms: dts[dts.length - 1], fps_avg: 1000 / (sum / dts.length) };
    };
  });
  await page.evaluate(async () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    // First scroll back to 0.30
    window.scrollTo(0, max * 0.30);
    await new Promise(r => setTimeout(r, 100));
    for (let i = 0; i < 25; i++) {
      window.scrollTo(0, max * (0.30 + (i / 25) * 0.32));
      await new Promise(r => setTimeout(r, 12));
    }
  });
  await new Promise(r => setTimeout(r, 500));
  const cloudZone = await page.evaluate(() => window.__stopFps());
  console.log(JSON.stringify(cloudZone, null, 2));

  console.log('\n=== FPS profile: water zone (progress 0.62 → 1.0) — fast DOWN ===');
  await page.evaluate(() => {
    window.__fpsStats.length = 0;
    let last = performance.now();
    let lastFrameId = null;
    function tick(t) { const dt = t - last; last = t; window.__fpsStats.push({ t: t, dt: Math.round(dt * 100) / 100 }); lastFrameId = requestAnimationFrame(tick); }
    lastFrameId = requestAnimationFrame(tick);
    window.__stopFps = () => {
      cancelAnimationFrame(lastFrameId);
      const stats = window.__fpsStats;
      const dts = stats.slice(1).map(s => s.dt);
      dts.sort((a, b) => a - b);
      const sum = dts.reduce((a, b) => a + b, 0);
      return { frames: dts.length, avg_dt_ms: sum / dts.length, median_dt_ms: dts[Math.floor(dts.length / 2)], p95_dt_ms: dts[Math.floor(dts.length * 0.95)], p99_dt_ms: dts[Math.floor(dts.length * 0.99)], max_dt_ms: dts[dts.length - 1], fps_avg: 1000 / (sum / dts.length) };
    };
  });
  await page.evaluate(async () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.62);
    await new Promise(r => setTimeout(r, 100));
    for (let i = 0; i < 25; i++) {
      window.scrollTo(0, max * (0.62 + (i / 25) * 0.38));
      await new Promise(r => setTimeout(r, 12));
    }
  });
  await new Promise(r => setTimeout(r, 500));
  const waterZone = await page.evaluate(() => window.__stopFps());
  console.log(JSON.stringify(waterZone, null, 2));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
