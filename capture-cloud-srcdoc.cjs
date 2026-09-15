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

  // Intercept setAttribute / srcDoc writes to capture the runtime-generated cloud srcDoc
  await page.evaluateOnNewDocument(() => {
    window.__capturedSrcDocs = [];
    const origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      if (name === 'srcdoc' && this.tagName === 'IFRAME') {
        try {
          window.__capturedSrcDocs.push({ value: String(value).slice(0, 200), length: String(value).length, parent: this.parentElement?.className });
        } catch (e) {}
      }
      return origSetAttribute.call(this, name, value);
    };
  });

  await page.goto('https://antarctic-labs.com', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  const captured = await page.evaluate(() => window.__capturedSrcDocs);
  console.log(`Captured ${captured.length} srcDoc writes:`);
  captured.forEach((c, i) => {
    console.log(`\n[${i}] parent=${c.parent} length=${c.length}`);
    console.log(`  first 200 chars: ${c.value}`);
  });

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
