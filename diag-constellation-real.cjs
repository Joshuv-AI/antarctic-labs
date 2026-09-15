// Real-browser diagnostic for the constellation iframe.
// Loads https://antarctic-labs.com in headless Chromium via CDP, then
// inspects:
//   - console output (errors + logs) for both the parent page and the iframe
//   - network requests (which CDNs succeed, which fail)
//   - the iframe's actual canvas dimensions (getBoundingClientRect)
//   - the iframe's contentWindow (does gsap exist? does ScrollTrigger?)
//   - whether the inline particle init threw

const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
    ],
    defaultViewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();

  // Capture console from the parent page
  const parentConsole = [];
  page.on('console', (msg) => {
    parentConsole.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    parentConsole.push(`[pageerror] ${err.message}`);
  });

  // Capture network requests
  const networkLog = [];
  page.on('request', (req) => {
    networkLog.push({ url: req.url(), method: req.method(), type: req.resourceType(), status: null });
  });
  page.on('response', (res) => {
    const url = res.request().url();
    const entry = networkLog.find((n) => n.url === url && n.status === null);
    if (entry) entry.status = res.status();
  });
  page.on('requestfailed', (req) => {
    const entry = networkLog.find((n) => n.url === req.url() && n.status === null);
    if (entry) entry.status = 'FAILED: ' + (req.failure()?.errorText || '');
  });

  // Capture console events from iframes via CDP
  const cdp = await page.target().createCDPSession();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  const allConsole = [];
  cdp.on('Runtime.consoleAPICalled', (event) => {
    const args = event.args.map((a) => {
      if (a.value !== undefined) return JSON.stringify(a.value).slice(0, 300);
      if (a.description) return a.description.slice(0, 300);
      return a.type || '?';
    });
    allConsole.push({ ctx: event.executionContextId, type: event.type, args });
  });
  cdp.on('Runtime.exceptionThrown', (event) => {
    allConsole.push({ ctx: 'EXC', type: 'exception', args: [event.exceptionDetails?.text || event.exceptionDetails?.exception?.description || 'unknown'] });
  });

  console.log('=== Loading https://antarctic-labs.com in headless Chromium ===');
  await page.goto('https://antarctic-labs.com', {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });
  await new Promise((r) => setTimeout(r, 4000));

  // DOM inspection
  const inspection = await page.evaluate(() => {
    const out = {};
    const iframes = document.querySelectorAll('iframe');
    out.iframeCount = iframes.length;
    out.iframes = [];
    iframes.forEach((ifr, i) => {
      const rect = ifr.getBoundingClientRect();
      const computed = window.getComputedStyle(ifr);
      out.iframes.push({
        index: i,
        class: ifr.className || '',
        parentClass: ifr.parentElement?.className || '',
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        computed: { position: computed.position, width: computed.width, height: computed.height, opacity: computed.opacity, visibility: computed.visibility, display: computed.display, zIndex: computed.zIndex },
        inlineStyle: ifr.getAttribute('style') || '',
        srcDocLength: (ifr.srcdoc || '').length,
      });
    });
    out.polarLayers = ['polar-scene', 'polar-constellation', 'polar-cloud', 'polar-water'].map((sel) => {
      const el = document.querySelector('.' + sel);
      if (!el) return { sel, exists: false };
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return { sel, exists: true, position: cs.position, display: cs.display, zIndex: cs.zIndex, opacity: cs.opacity, rect: { w: rect.width, h: rect.height } };
    });
    return out;
  });

  // Cross-frame inspection: the constellation iframe's inner content
  const innerInspection = await page.evaluate(() => {
    const constellationIframe = document.querySelector('.polar-constellation iframe');
    if (!constellationIframe) return { error: 'no constellation iframe' };
    try {
      const innerDoc = constellationIframe.contentDocument;
      const innerWin = constellationIframe.contentWindow;
      if (!innerDoc || !innerWin) return { error: 'iframe content inaccessible' };

      const out = {
        bodyExists: !!innerDoc.body,
        bodyChildren: innerDoc.body ? innerDoc.body.children.length : -1,
        bodyHTML: innerDoc.body ? innerDoc.body.innerHTML.slice(0, 600) : '(empty)',
        headChildren: innerDoc.head ? innerDoc.head.children.length : -1,
        gsap: typeof innerWin.gsap,
        ScrollTrigger: typeof innerWin.ScrollTrigger,
        __SF_CONTROLS: typeof innerWin.__SF_CONTROLS !== 'undefined' ? JSON.stringify(innerWin.__SF_CONTROLS) : '(not set)',
        pauseBtn: !!innerDoc.getElementById('pauseBtn'),
        splitTextTarget: (() => {
          const p = innerDoc.getElementById('split-text-target');
          if (!p) return null;
          return { exists: true, innerText: p.innerText ? p.innerText.slice(0, 200) : '(empty)' };
        })(),
        particleCanvas: (() => {
          const c = innerDoc.getElementById('particle-canvas');
          if (!c) return null;
          const rect = c.getBoundingClientRect();
          let pixel;
          try {
            const ctx = c.getContext('2d');
            pixel = ctx ? Array.from(ctx.getImageData(50, 50, 1, 1).data) : null;
          } catch (e) { pixel = 'error: ' + e.message; }
          return { width: c.width, height: c.height, styleWidth: c.style.width, styleHeight: c.style.height, rect: { w: rect.width, h: rect.height }, pixel };
        })(),
        scripts: (() => {
          return Array.from(innerDoc.querySelectorAll('script')).map((s) => ({
            src: s.getAttribute('src') ? s.getAttribute('src').slice(0, 100) : null,
            inlineLen: s.textContent ? s.textContent.length : 0,
          }));
        })(),
        styles: (() => {
          return Array.from(innerDoc.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.getAttribute('href'));
        })(),
      };
      return out;
    } catch (e) {
      return { error: e.message, stack: e.stack };
    }
  });

  console.log('\n=== PARENT PAGE DOM ===');
  console.log(JSON.stringify(inspection, null, 2));

  console.log('\n=== CONSTELLATION IFRAME INNER CONTENT ===');
  console.log(JSON.stringify(innerInspection, null, 2));

  console.log('\n=== NETWORK REQUESTS ===');
  networkLog.forEach((n, i) => {
    console.log(`  [${i}] ${n.method} ${n.status || 'pending'} ${n.type} ${n.url.slice(0, 120)}`);
  });

  console.log('\n=== ALL CONSOLE EVENTS (parent + iframes) ===');
  allConsole.forEach((e, i) => {
    console.log(`  [${i}] [ctx=${e.ctx}] [${e.type}] ${e.args.join(' ').slice(0, 500)}`);
  });

  console.log('\n=== FRAMES ===');
  const { frameTree } = await cdp.send('Page.getFrameTree');
  function walkFrame(node, depth) {
    const indent = '    ' + '  '.repeat(depth);
    console.log(`${indent}frame: ${(node.frame.url || '(no url)').slice(0, 100)}  id=${node.frame.id}`);
    if (node.childFrames) node.childFrames.forEach((c) => walkFrame(c, depth + 1));
  }
  walkFrame(frameTree.frame, 0);

  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
