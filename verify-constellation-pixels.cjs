const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
    defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();

  // Block all external CDN requests (simulating the parent CSP block)
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('antarctic-labs.com') || url.startsWith('data:')) {
      req.continue();
    } else {
      req.abort();
    }
  });

  await page.goto('https://antarctic-labs.com', { waitUntil: 'networkidle2', timeout: 30000 });

  // Give the particle physics time to run multiple frames
  await new Promise(r => setTimeout(r, 5000));

  // Take a screenshot of the constellation iframe
  const constellationFrame = page.frames().find(f => f.url() === 'about:blank' && f.parentFrame());
  // Walk all frames to find the constellation iframe
  const frameInfo = await page.evaluate(() => {
    const frames = document.querySelectorAll('iframe');
    return Array.from(frames).map(f => {
      const r = f.getBoundingClientRect();
      return { index: Array.from(document.querySelectorAll('iframe')).indexOf(f), parent: f.parentElement?.className, srcDocLen: (f.srcdoc || '').length, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
    });
  });
  console.log('iframes:', JSON.stringify(frameInfo, null, 2));

  // Try to get canvas pixel data by navigating the iframe via page.evaluate
  // (works in puppeteer if we wait long enough for the iframe to load)
  const canvasData = await page.evaluate(async () => {
    const frames = document.querySelectorAll('iframe');
    const constellationIframe = frames[0];
    if (!constellationIframe) return { error: 'no iframe' };

    // We can't access contentDocument due to sandbox without allow-same-origin
    // So let me just verify the iframe has the expected content via getBoundingClientRect
    const r = constellationIframe.getBoundingClientRect();
    return {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      srcDocLen: (constellationIframe.srcdoc || '').length,
      opacity: getComputedStyle(constellationIframe).opacity,
      display: getComputedStyle(constellationIframe).display,
      visibility: getComputedStyle(constellationIframe).visibility,
      parent: constellationIframe.parentElement?.className,
    };
  });
  console.log('constellation iframe state:', JSON.stringify(canvasData, null, 2));

  // Take a screenshot to visually verify
  await page.screenshot({ path: '/tmp/antarctic-labs-constellation.png', fullPage: false });
  console.log('\nScreenshot saved to /tmp/antarctic-labs-constellation.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
