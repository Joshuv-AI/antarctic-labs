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

  // Capture all postMessage from child frames
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[parent ${msg.type()}] ${msg.text().slice(0, 200)}`);
    }
  });

  await page.goto('https://antarctic-labs.com', { waitUntil: 'networkidle2', timeout: 30000 });

  // Listen for messages from iframes for 8 seconds
  const messages = [];
  await page.exposeFunction('recordCloudMsg', (msg) => {
    messages.push(msg);
  });

  await page.evaluate(() => {
    window.addEventListener('message', (e) => {
      if (e.data && e.data.fromCloudIframe) {
        window.recordCloudMsg({ from: 'cloud-iframe', data: e.data });
      }
    });
  });

  // Wait a long time for the cloud iframe's focusScript to run
  await new Promise(r => setTimeout(r, 8000));

  console.log('cloud-iframe messages:', messages);

  // Read the cloud iframe's DOM directly via the parent (sandbox blocks this,
  // but try anyway — if it fails, we know sandbox is the reason)
  const result = await page.evaluate(() => {
    const cloudIframe = document.querySelector('.polar-cloud iframe');
    if (!cloudIframe) return { error: 'no cloud iframe' };
    try {
      const doc = cloudIframe.contentDocument;
      if (!doc) return { error: 'no contentDocument (sandbox block)' };
      return {
        bodyChildren: Array.from(doc.body.children).map(c => ({
          tag: c.tagName,
          class: (c.className || '').slice(0, 50),
          residual: c.hasAttribute('data-threeui-residual'),
          role: c.getAttribute('data-threeui-role'),
          display: getComputedStyle(c).display,
        })),
      };
    } catch (e) {
      return { error: 'sandbox blocks: ' + e.message };
    }
  });

  console.log('\n=== cloud iframe DOM (from parent) ===');
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
