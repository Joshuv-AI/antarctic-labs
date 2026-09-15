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
    // Find the focusStyles CSS block
    const m = sd.match(/<style data-threeui-focus>([\s\S]*?)<\/style>/);
    return {
      length: sd.length,
      focusStylesLength: m ? m[1].length : 0,
      focusStylesContent: m ? m[1] : '(no match)',
    };
  });

  console.log(JSON.stringify(cloudSrcdoc, null, 2));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
