const puppeteer = require('puppeteer-core');
const https = require('https');
const fs = require('fs');

// Fetch the cloud iframe's raw srcDoc from the live bundle
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
  const bundle = await fetch('https://antarctic-labs.com/assets/index-DJ3mxmtQ.js');

  // Find the cloud iframe (DOCTYPE with 'Strata')
  const docIdx = bundle.lastIndexOf('<!DOCTYPE');
  const htmlEnd = bundle.indexOf('</html>', docIdx) + 7;
  let cloudSrc = bundle.slice(docIdx, htmlEnd);
  console.log(`raw cloud srcDoc from bundle: ${cloudSrc.length} chars`);

  // The wrapper injects scripts at React render time. The literal in the
  // bundle is just the raw source. So if I want to see what the iframe
  // actually renders, I need to load the live page and inspect the iframe.

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

  // Scroll to cloud zone
  await page.evaluate(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, max * 0.70);
  });
  await new Promise(r => setTimeout(r, 4000));

  // Use CDP to attach to the cloud iframe's frame and evaluate JS
  // Sandbox blocks contentDocument access, so we need to use frame.session
  const client = await page.target().createCDPSession();
  await client.send('Target.setDiscoverTargets', { discover: true });

  const { targetInfos } = await client.send('Target.getTargets');
  const iframeTargets = targetInfos.filter(t => t.type === 'iframe');
  console.log(`Found ${iframeTargets.length} iframe CDP targets`);

  for (const t of iframeTargets) {
    try {
      const session = await client.connection.createSession(t.targetId);
      await session.send('Runtime.enable');

      // Listen for console events from inside the iframe
      session.on('Runtime.consoleAPICalled', (e) => {
        console.log(`  [iframe ${e.type}] ${e.args.map(a => a.value || a.description || '?').join(' ').slice(0, 250)}`);
      });
      session.on('Runtime.exceptionThrown', (e) => {
        console.log(`  [iframe EXCEPTION] ${e.exceptionDetails?.text || e.exceptionDetails?.exception?.description || 'unknown'}`);
      });

      // Get iframe state
      const result = await session.send('Runtime.evaluate', {
        expression: `
          JSON.stringify({
            title: document.title,
            threeuiReady: document.body ? document.body.getAttribute('data-threeui-ready') : null,
            sfControlsType: typeof window.__SF_CONTROLS,
            sfApplyControlsType: typeof window.__SF_APPLY_CONTROLS,
            // Is the canvas marked as role?
            canvasRole: (function() {
              const c = document.getElementById('c');
              return c ? c.getAttribute('data-threeui-role') : 'no canvas';
            })(),
            // Is anything marked as residual?
            residualCount: document.querySelectorAll('[data-threeui-residual]').length,
            visibleCount: document.body ? document.body.children.length : -1,
            // What CSS rules are applying to body > * ?
            bodyStarVisibility: (function() {
              if (!document.body || !document.body.children.length) return 'no children';
              const child = document.body.children[0];
              const cs = getComputedStyle(child);
              return cs.visibility + ' / ' + cs.display;
            })(),
            // Where is the canvas in the DOM?
            canvasParent: (function() {
              const c = document.getElementById('c');
              if (!c) return 'no canvas';
              return c.parentElement.tagName + '.' + c.parentElement.className;
            })(),
            // List top-level body children
            bodyChildren: Array.from(document.body.children).map(c => ({
              tag: c.tagName,
              class: c.className.slice(0, 50),
              role: c.getAttribute('data-threeui-role') || '(none)',
              residual: c.hasAttribute('data-threeui-residual'),
              display: getComputedStyle(c).display,
              visibility: getComputedStyle(c).visibility,
            })),
          })
        `,
        returnByValue: true,
      });

      console.log(`\n=== iframe (targetId=${t.targetId}) ===`);
      console.log(JSON.stringify(JSON.parse(result.result.value), null, 2));
      await session.detach();
    } catch (e) {
      console.log(`  error attaching to target ${t.targetId}: ${e.message}`);
    }
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
