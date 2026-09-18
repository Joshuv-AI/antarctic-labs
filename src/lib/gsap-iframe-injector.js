// Shared helper: strip blocked CDN GSAP/ScrollTrigger <script> tags from
// an iframe HTML source and provide a noop GSAP stub inline so the
// iframe's own scripts that reference `gsap` / `ScrollTrigger` don't throw
// ReferenceError and skip the downstream WebGL init.
//
// The PolarScene / Neuform shader iframes ship <script src="...cdnjs...">
// tags that the production CSP (script-src 'self' 'unsafe-inline') blocks.
// Before this helper existed, those CDN script tags failed to load and the
// iframe's first gsap.registerPlugin(...) call threw ReferenceError, which
// skipped the WebGL init that followed.
//
// Per the visual-safety directive: inspection of all three shader sources
// (defense-lines.html, particle-network.html, strata-cloud.html) confirms
// that GSAP is used ONLY by hidden demo/document UI elements (text word
// reveals, hero badge, scroll indicator) — NOT by the canvas/WebGL init
// code. The PolarScene wrapper already hides the demo UI via injected CSS
// (nav, main, header, aside, footer { display: none !important; } in
// buildCloudSource). Replacing the CDN scripts with a noop stub is the
// minimum-disruption fix: the WebGL canvas still initializes, the demo UI
// animations become inert no-ops (invisible because the UI is already
// hidden), and there are no thrown errors to skip the canvas init.

const CDN_SCRIPT_REGEX =
  /<script\s+src=["']https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/gsap\/[^"']+["']\s*>\s*<\/script>/gi;

const NOOP_GSAP_STUB = `
<script>
(function () {
  /* noop GSAP stub. The shader sources use gsap.registerPlugin(ScrollTrigger)
     and gsap.to(...) for their hidden demo/document UI animations. GSAP
     would normally be loaded from a CDN <script src="...cdnjs..."> tag in
     each source's <head>, which the production CSP blocks. The shader
     HTMLs also use ESM-style module-script blocks for Three.js,
     which fail to parse as classic scripts in this CSP context.

     We replace the CDN load with this noop stub so:
       1. gsap.registerPlugin(...) calls become no-ops (don't throw)
       2. gsap.to(...) / gsap.from(...) calls return chainable no-op timelines
       3. The WebGL canvas init downstream of the gsap calls still runs
       4. The demo UI animations are silently skipped (the PolarScene
          wrapper already hides them via display:none CSS) */
  var noopTimeline = {
    to: function () { return noopTimeline; },
    from: function () { return noopTimeline; },
    fromTo: function () { return noopTimeline; },
    set: function () { return noopTimeline; },
    stagger: function () { return noopTimeline; },
    killTweensOf: function () {},
    kill: function () {},
  };
  var noopGsapFn = function () { return noopTimeline; };
  noopGsapFn.to = noopGsapFn.from = noopGsapFn.fromTo = noopGsapFn.set = function () { return noopTimeline; };
  noopGsapFn.registerPlugin = function () {};
  noopGsapFn.timeline = function () { return noopTimeline; };
  noopGsapFn.context = noopGsapFn;
  window.gsap = noopGsapFn;
  window.ScrollTrigger = function () {};
})();
</script>
`.trim();

/**
 * Strip blocked CDN GSAP/ScrollTrigger <script> tags from a shader HTML
 * string and prepend a noop gsap stub inline so the iframe's own scripts
 * that reference `gsap` / `ScrollTrigger` don't throw ReferenceError and
 * skip the downstream WebGL init.
 *
 * Preserves all other content (CSS, canvas init scripts, demo UI) byte-for-byte.
 *
 * @param {string} html Raw HTML imported via `?raw` from a shader source file
 * @returns {string} HTML safe to assign to an iframe srcDoc
 */
export function injectBundledGsap(html) {
  const stripped = html.replace(CDN_SCRIPT_REGEX, "");
  return NOOP_GSAP_STUB + stripped;
}
