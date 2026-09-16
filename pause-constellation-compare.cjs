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

  const fpsSamples = [];
  await page.exposeFunction('__reportFps', (data) => fpsSamples.push(data));

  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

  await page.goto('https://antarctic-labs.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  // Forward constellation-fps postMessages
  await page.evaluate(() => {
    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'constellation-fps') {
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress = Math.min(1, Math.max(0, window.scrollY / max));
        window.__reportFps({ ...e.data, progress: Math.round(progress * 100) / 100 });
      }
    });
  });

  function summarize(label) {
    if (!fpsSamples.length) { console.log(`  ${label}: NO SAMPLES`); return; }
    const allAvg = fpsSamples.map(s => s.avg_ms);
    const allMax = fpsSamples.map(s => s.max_ms);
    allAvg.sort((a, b) => a - b);
    const avgOfAvgs = allAvg.reduce((a, b) => a + b, 0) / allAvg.length;
    const maxOverall = Math.max(...allMax);
    console.log(`  ${label}: avg=${avgOfAvgs.toFixed(1)}ms (${(1000/avgOfAvgs).toFixed(1)} fps)  worst=${maxOverall.toFixed(1)}ms (${(1000/maxOverall).toFixed(1)} fps)`);
  }

  // === Phase A: UNPAUSED baseline (zone 1: top of page) ===
  console.log('\n=== Phase A: UNPAUSED constellation at progress=0 (top) ===');
  fpsSamples.length = 0;
  await new Promise(r => setTimeout(r, 5000));
  summarize('A unpaused');

  // === Phase B: PAUSE constellation, capture at same position ===
  console.log('\n=== Phase B: PAUSE constellation, progress=0 ===');
  fpsSamples.length = 0;
  await page.evaluate(() => {
    // Send paused:true to ALL iframes — constellation's wrapper accepts it; cloud's wrapper ignores controls.paused (it has its own pause prop). WaterLayer uses elements-controls.
    document.querySelectorAll('iframe').forEach((iframe) => {
      try {
        iframe.contentWindow.postMessage({
          type: 'threeui-controls',
          controls: { mode: 'dark', speed: 1.94, size: 2.5, length: 0.35, density: 2.412, opacity: 1, paused: true },
        }, '*');
      } catch (e) {}
    });
  });
  await new Promise(r => setTimeout(r, 5000));
  summarize('B paused');

  // === Phase C: UNPAUSE, fast DOWN scroll, compare ===
  console.log('\n=== Phase C: UNPAUSE, fast DOWN through constellation zone ===');
  fpsSamples.length = 0;
  await page.evaluate(() => {
    document.querySelectorAll('iframe').forEach((iframe) => {
      try {
        iframe.contentWindow.postMessage({
          type: 'threeui-controls',
          controls: { paused: false },
        }, '*');
      } catch (e) {}
    });
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(async () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    for (let i = 0; i < 20; i++) {
      window.scrollTo(0, max * (i / 20));
      await new Promise(r => setTimeout(r, 15));
    }
  });
  await new Promise(r => setTimeout(r, 2000));
  summarize('C unpaused fast DOWN');

  // === Phase D: PAUSE constellation, fast DOWN through same zone ===
  console.log('\n=== Phase D: PAUSE constellation, fast DOWN through same zone ===');
  fpsSamples.length = 0;
  await page.evaluate(() => {
    document.querySelectorAll('iframe').forEach((iframe) => {
      try {
        iframe.contentWindow.postMessage({
          type: 'threeui-controls',
          controls: { paused: true },
        }, '*');
      } catch (e) {}
    });
    window.scrollTo(0, 0);
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(async () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    for (let i = 0; i < 20; i++) {
      window.scrollTo(0, max * (i / 20));
      await new Promise(r => setTimeout(r, 15));
    }
  });
  await new Promise(r => setTimeout(r, 2000));
  summarize('D paused fast DOWN');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
