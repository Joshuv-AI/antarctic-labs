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

  await page.goto('https://antarctic-labs.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  const audit = await page.evaluate(() => {
    const out = { layers: [], iframes: [], pageBg: null, bodyChildren: [] };
    document.querySelectorAll('.polar-layer').forEach((l) => {
      const cs = getComputedStyle(l);
      const r = l.getBoundingClientRect();
      out.layers.push({
        cls: l.className,
        inlineStyle: l.getAttribute('style'),
        opacity: cs.opacity,
        zIndex: cs.zIndex,
        position: cs.position,
        visibility: cs.visibility,
        display: cs.display,
        rect: { top: r.top, left: r.left, w: r.width, h: r.height },
        childCount: l.children.length,
        firstChild: l.children[0] ? l.children[0].tagName + (l.children[0].className ? '.' + l.children[0].className.split(' ').slice(0,2).join('.') : '') : null,
      });
      const iframe = l.querySelector('iframe');
      if (iframe) {
        const fcs = getComputedStyle(iframe);
        const fr = iframe.getBoundingClientRect();
        out.iframes.push({
          cls: l.className,
          iframeOpacity: fcs.opacity,
          iframeZIndex: fcs.zIndex,
          iframeSrcDocLen: (iframe.srcdoc || '').length,
          iframeRect: { top: fr.top, left: fr.left, w: fr.width, h: fr.height },
          iframeBg: fcs.background,
          iframePointerEvents: fcs.pointerEvents,
        });
      }
    });
    // Sample the parent page background
    out.pageBg = getComputedStyle(document.body).backgroundColor;
    out.bodyChildren = Array.from(document.body.children).slice(0, 5).map((c) => ({
      tag: c.tagName,
      cls: (c.className || '').slice(0, 60),
      zIndex: getComputedStyle(c).zIndex,
      position: getComputedStyle(c).position,
    }));
    return out;
  });

  console.log(JSON.stringify(audit, null, 2));

  // Take a screenshot at scroll 0 to visually confirm
  await page.screenshot({ path: '/tmp/audit-top.png' });
  console.log('saved /tmp/audit-top.png');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
