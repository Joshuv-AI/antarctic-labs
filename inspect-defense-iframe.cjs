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

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('antarctic-labs.com') || url.startsWith('data:') || url.startsWith('about:')) req.continue();
    else req.abort();
  });

  await page.goto('https://antarctic-labs.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  // The constellation iframe is sandbox="allow-scripts" — can't access its contentWindow
  // from page.evaluate. But I CAN inspect the iframe element's own state + the wrapper's
  // applied styles from outside.
  const audit = await page.evaluate(() => {
    const iframe = document.querySelector('.polar-constellation iframe');
    if (!iframe) return { error: 'no constellation iframe' };

    const cs = getComputedStyle(iframe);
    const r = iframe.getBoundingClientRect();

    // Sample pixel data from the iframe's actual rendered area via the wrapper's
    // parent page's screenshot pixel API: we'll get the bounding rect and inspect
    // what's behind it via the iframe's visible styles only.
    return {
      srcDocLen: (iframe.srcdoc || '').length,
      hasBgCanvas: (iframe.srcdoc || '').includes('id="bg-canvas"'),
      hasRedBackground: (iframe.srcdoc || '').includes('#120303'),
      hasParticlePatch: (iframe.srcdoc || '').includes('const particleCount = 200;'),
      hasControlScript: (iframe.srcdoc || '').includes('window.__SF_CONTROLS'),
      iframeDisplay: cs.display,
      iframeVisibility: cs.visibility,
      iframeOpacity: cs.opacity,
      iframeFilter: cs.filter,
      iframeRect: { w: r.width, h: r.height, x: r.left, y: r.top },
      iframeBackground: cs.backgroundColor,
    };
  });
  console.log('=== Constellation iframe state ===');
  console.log(JSON.stringify(audit, null, 2));

  // Wait longer to see if particles build up
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: '/tmp/defense-after-9s.png' });
  console.log('saved /tmp/defense-after-9s.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
