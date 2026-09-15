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

  // Capture errors only
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto('https://antarctic-labs.com', { waitUntil: 'networkidle2', timeout: 30000 });

  // Scroll to cloud zone (~0.70 progress)
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.70);
  });
  await new Promise(r => setTimeout(r, 5000));

  // Get all three polar layers and their iframe states
  const layers = await page.evaluate(() => {
    const result = [];
    document.querySelectorAll('.polar-layer').forEach((l) => {
      const cs = getComputedStyle(l);
      const iframe = l.querySelector('iframe');
      result.push({
        parentClass: l.className,
        opacity: cs.opacity,
        display: cs.display,
        zIndex: cs.zIndex,
        position: cs.position,
        rect: (function() {
          const r = l.getBoundingClientRect();
          return { w: r.width, h: r.height };
        })(),
        iframeExists: !!iframe,
        iframeSrcDocLen: iframe ? (iframe.srcdoc || '').length : 0,
        iframeSize: iframe ? {
          w: iframe.getBoundingClientRect().width,
          h: iframe.getBoundingClientRect().height,
        } : null,
      });
    });
    return result;
  });
  console.log('Polar layers (at scroll ~0.7):');
  console.log(JSON.stringify(layers, null, 2));

  // Screenshot the cloud iframe (the second layer in the layers list, or .polar-cloud specifically)
  const cloudIframe = await page.$('.polar-cloud iframe');
  if (cloudIframe) {
    await cloudIframe.screenshot({ path: '/tmp/cloud-zone-iframe.png' });
    console.log('Saved cloud iframe screenshot to /tmp/cloud-zone-iframe.png');
  }

  // Full viewport
  await page.screenshot({ path: '/tmp/cloud-zone-viewport.png' });
  console.log('Saved viewport screenshot to /tmp/cloud-zone-viewport.png');

  console.log('\n=== Errors ===');
  if (errors.length === 0) console.log('  (none)');
  else errors.slice(0, 10).forEach((e, i) => console.log(`  [${i}] ${e.slice(0, 250)}`));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
