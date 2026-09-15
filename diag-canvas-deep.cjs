const puppeteer = require('puppeteer-core');
const https = require('https');
const fs = require('fs');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
  const bundle = await fetch('https://antarctic-labs.com/assets/index-BLjFRrrA.js');
  const ctrlIdx = bundle.indexOf('window.__SF_CONTROLS = controls;');
  const docIdx = bundle.lastIndexOf('<!DOCTYPE', ctrlIdx);
  const htmlEnd = bundle.indexOf('</html>', docIdx) + 7;
  const srcDoc = bundle.slice(docIdx, htmlEnd);
  console.log('srcDoc size:', srcDoc.length);

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
    defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().startsWith('data:') || req.url().startsWith('about:')) req.continue();
    else req.abort();
  });

  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  await page.setContent(srcDoc, { waitUntil: 'load', timeout: 15000 });
  await new Promise(r => setTimeout(r, 5000));

  // Deep inspection of body state
  const state = await page.evaluate(() => {
    const out = {
      windowInnerWidth: window.innerWidth,
      windowInnerHeight: window.innerHeight,
      bodyClass: document.body.className,
      bodyDataset: JSON.stringify(document.body.dataset),
      threeuiReady: document.body.getAttribute('data-threeui-ready'),
      bodyChildrenCount: document.body.children.length,
      bodyChildren: Array.from(document.body.children).map(el => ({
        tag: el.tagName,
        class: el.className,
        id: el.id,
        attrs: Array.from(el.attributes).map(a => `${a.name}="${a.value.slice(0,80)}"`),
        display: getComputedStyle(el).display,
        visibility: getComputedStyle(el).visibility,
        rect: (function() { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; })(),
      })),
    };
    // Look for the canvas anywhere in the document
    const allCanvases = document.querySelectorAll('canvas');
    out.allCanvases = Array.from(allCanvases).map(c => ({
      id: c.id,
      class: c.className,
      parent: c.parentElement?.tagName + '.' + (c.parentElement?.className || '').slice(0, 50),
      width: c.width,
      height: c.height,
      offsetWidth: c.offsetWidth,
      offsetHeight: c.offsetHeight,
      rect: (function() { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })(),
      display: getComputedStyle(c).display,
      visibility: getComputedStyle(c).visibility,
    }));
    // Check all role markers
    out.roleEls = document.querySelectorAll('[data-threeui-role]').length;
    out.residualEls = document.querySelectorAll('[data-threeui-residual]').length;
    return out;
  });

  console.log('=== Body state after 5s ===');
  console.log(JSON.stringify(state, null, 2));

  console.log('\n=== Console logs ===');
  if (logs.length === 0) console.log('  (none)');
  else logs.forEach((l, i) => console.log(`  [${i}] ${l.slice(0, 300)}`));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
