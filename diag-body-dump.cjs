const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
  const srcDoc = fs.readFileSync('/tmp/constellation-iframe.html', 'utf-8');

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
    if (url.startsWith('data:') || url.startsWith('about:')) req.continue();
    else req.abort();
  });

  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (req) => logs.push(`[reqfail] ${req.url().slice(0, 100)}: ${req.failure()?.errorText}`));

  // Inject error handlers BEFORE loading the page
  await page.evaluateOnNewDocument(() => {
    window.addEventListener('error', (e) => {
      console.error('[window.error]', e.message, 'at', e.filename, ':', e.lineno);
    });
    window.addEventListener('unhandledrejection', (e) => {
      console.error('[unhandledrejection]', e.reason);
    });
  });

  await page.setContent(srcDoc, { waitUntil: 'load', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));

  const state = await page.evaluate(() => {
    return {
      title: document.title,
      bodyHTML: document.body ? document.body.innerHTML.length : -1,
      bodyHTMLHead: document.body ? document.body.innerHTML.slice(0, 800) : '(no body)',
      bodyChildCount: document.body ? document.body.children.length : -1,
      bodyChildTags: document.body ? Array.from(document.body.children).map(c => c.tagName) : [],
      allCanvasIds: Array.from(document.querySelectorAll('canvas')).map(c => c.id || '(no id)'),
      allCanvasParents: Array.from(document.querySelectorAll('canvas')).map(c => c.parentElement?.tagName || '(no parent)'),
      splitTextExists: !!document.getElementById('split-text-target'),
      pauseBtnExists: !!document.getElementById('pauseBtn'),
      canvasExists: !!document.getElementById('particle-canvas'),
      windowInnerWidth: window.innerWidth,
      windowInnerHeight: window.innerHeight,
    };
  });

  console.log('=== DOM state ===');
  console.log(JSON.stringify(state, null, 2));

  console.log('\n=== All console output ===');
  if (logs.length === 0) console.log('  (none)');
  else logs.forEach((l, i) => console.log(`  [${i}] ${l.slice(0, 400)}`));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
