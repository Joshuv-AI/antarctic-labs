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

  await page.goto('https://antarctic-labs.com', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  const cloudSrcdoc = await page.evaluate(() => {
    const iframe = document.querySelector('.polar-cloud iframe');
    if (!iframe) return { error: 'no cloud iframe' };
    const sd = iframe.srcdoc || '';
    return {
      length: sd.length,
      hasStyleDataThreeuiFocus: sd.includes('data-threeui-focus'),
      hasScriptDataThreeuiControls: sd.includes('data-threeui-controls'),
      hasScriptDataThreeuiFocus: sd.includes('data-threeui-focus>'),  // avoid matching data-threeui-focus in style
      hasSfControls: sd.includes('__SF_CONTROLS'),
      hasIsolateFn: sd.includes('function isolate'),
      first500: sd.slice(0, 500),
      headInjection: (function() {
        const i = sd.indexOf('<head>');
        if (i < 0) return '(no <head>)';
        return sd.slice(i, i + 400);
      })(),
      bodyInjection: (function() {
        const i = sd.lastIndexOf('</body>');
        if (i < 0) return '(no </body>)';
        return sd.slice(Math.max(0, i - 400), i + 10);
      })(),
    };
  });

  console.log(JSON.stringify(cloudSrcdoc, null, 2));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
