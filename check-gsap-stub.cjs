const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-first-run'],
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
  await new Promise(r => setTimeout(r, 3000));

  const srcdocInfo = await page.evaluate(() => {
    const iframe = document.querySelector('.polar-cloud iframe');
    if (!iframe) return { error: 'no cloud iframe' };
    const sd = iframe.srcdoc || '';
    return {
      length: sd.length,
      hasNoopGsap: sd.includes('noopGsapFn'),
      hasWindowGsapDefine: sd.includes("typeof window.gsap === 'undefined'") || sd.includes('typeof window.gsap'),
      hasControlScript: sd.includes('__SF_CONTROLS'),
      hasFocusScript: sd.includes('function isolate'),
      // Find the exact place where gsap stub is in the doc
      gsapStubIdx: sd.indexOf('noopGsapFn'),
      firstGSAPRef: sd.indexOf('gsap.registerPlugin'),
      // After the GSAP stub, find the source's first gsap.registerPlugin call
      snippet: sd.slice(0, 800),
    };
  });

  console.log(JSON.stringify(srcdocInfo, null, 2));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
