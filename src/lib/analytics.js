// PostHog analytics — granular, anonymous-only event tracking.
//
// Design rules (Joshua's standing site rules):
// - Zero impact on first paint: posthog-js is a dynamic import, loaded on
//   idle after the app has mounted. If it fails to load, the site works
//   exactly as before — every call here is fire-and-forget and guarded.
// - No visual change, no banners, no consent popups.
// - Anonymous only: person_profiles "never" — no user profiles are created,
//   which also keeps us out of PostHog's per-profile charges. Visitors are
//   counted by PostHog's anonymous distinct id only.
// - Session recording is disabled (heavy DOM capture on a text reader, and
//   reading behavior is already covered by reader_progress events).
// - Autocapture is off: every event is one we deliberately named, so the
//   data stays clean enough to query.

const POSTHOG_KEY = "phc_tYbvQEzuX3R47bZHNDKM8Ak5V95Vune9ybuE39EHQLRH";
const POSTHOG_HOST = "https://us.i.posthog.com";

let phPromise = null;
let ph = null;
const queue = [];

const AI_REFERRERS = [
  ["chatgpt.com", "chatgpt"],
  ["chat.openai.com", "chatgpt"],
  ["perplexity.ai", "perplexity"],
  ["claude.ai", "claude"],
  ["gemini.google.com", "gemini"],
  ["copilot.microsoft.com", "copilot"],
  ["meta.ai", "meta_ai"],
  ["you.com", "you"],
  ["duckduckgo.com", "duckduckgo"], // carries a DuckAssist AI surface
];

function aiReferrer() {
  try {
    const ref = document.referrer || "";
    if (!ref) return null;
    const host = new URL(ref).hostname.toLowerCase();
    for (const [needle, name] of AI_REFERRERS) {
      if (host === needle || host.endsWith("." + needle)) return name;
    }
  } catch {
    /* referrer not parseable — treat as unknown */
  }
  return null;
}

function load() {
  if (phPromise) return phPromise;
  phPromise = import("posthog-js")
    .then((mod) => {
      const posthog = mod.default;
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        person_profiles: "never",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: true,
        disable_session_recording: true,
        disable_surveys: true,
        respect_dnt: false,
        persistence: "localStorage+cookie",
      });
      const ai = aiReferrer();
      posthog.register({
        // "none" rather than null: PostHog drops null super-properties,
        // and an explicit value keeps AI-referral filtering clean.
        ai_referrer: ai || "none",
        is_ai_referred: Boolean(ai),
      });
      // Plain-text downloads: one delegated listener catches every
      // <a href="...txt"> click anywhere in the app, so download intent is
      // tracked without touching each link's component.
      document.addEventListener("click", (e) => {
        const a = e.target && e.target.closest ? e.target.closest("a") : null;
        if (!a) return;
        const href = a.getAttribute("href") || "";
        if (/\.txt($|\?)/.test(href)) {
          try {
            ph.capture("text_downloaded", { href });
          } catch {
            /* ignore */
          }
        }
      });
      ph = posthog;
      for (const [event, props] of queue.splice(0)) {
        try {
          ph.capture(event, props);
        } catch {
          /* never let analytics throw into the app */
        }
      }
      return ph;
    })
    .catch(() => null);
  return phPromise;
}

// Start loading on idle (or after a short delay on browsers without
// requestIdleCallback). Called once from the app shell.
export function initAnalytics() {
  if (typeof window === "undefined") return;
  installErrorCapture();
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => load(), { timeout: 3000 });
  } else {
    window.setTimeout(() => load(), 1500);
  }
}

export function track(event, props = {}) {
  if (ph) {
    try {
      ph.capture(event, props);
    } catch {
      /* ignore */
    }
    return;
  }
  queue.push([event, props]);
  load();
}

export function trackPageview(path) {
  track("$pageview", { $current_url: path, path });
}

// --- Client error capture (2026-11-15, error-watch QUEUED-2) -------------
// Until now no client-side exception was observable anywhere: PostHog held
// pageviews and custom events only, so a browser crash class could exist
// invisibly. These hooks forward window errors and unhandled promise
// rejections as `client_error` events through the same queue as every
// other event (an error before the idle load is queued and flushed when
// PostHog arrives; track() also starts the load, so the first error pulls
// the library in instead of waiting for idle). Deliberately bounded: at
// most 10 events per page load, identical message+stack deduped — a
// runaway error loop must never become an event storm. Resource-load
// errors (img/script/link) carry no message and are skipped: they are not
// exceptions. Nothing here changes any user-visible behavior.

const CLIENT_ERROR_CAP = 10;
let clientErrorsSent = 0;
const clientErrorsSeen = new Set();
let errorCaptureInstalled = false;

function buildTag() {
  try {
    const el = document.querySelector('script[src*="/assets/"]');
    const src = el && el.getAttribute("src");
    return src ? src.split("/").pop() : null;
  } catch {
    return null;
  }
}

function reportClientError(kind, message, stack) {
  try {
    const msg = String(message || "unknown error").slice(0, 300);
    const stk = stack ? String(stack).slice(0, 2000) : "";
    const key = `${kind}:${msg}:${stk.slice(0, 120)}`;
    if (clientErrorsSeen.has(key) || clientErrorsSent >= CLIENT_ERROR_CAP) {
      return;
    }
    clientErrorsSeen.add(key);
    clientErrorsSent += 1;
    track("client_error", {
      kind,
      message: msg,
      stack: stk,
      path: window.location.pathname,
      url: window.location.href,
      build: buildTag(),
    });
  } catch {
    /* the reporter itself must never throw into the app */
  }
}

function installErrorCapture() {
  if (errorCaptureInstalled) return;
  errorCaptureInstalled = true;
  window.addEventListener("error", (e) => {
    if (!e || (!e.message && !e.error)) return; // resource-load error
    reportClientError("error", e.message, e.error && e.error.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e && e.reason;
    reportClientError(
      "unhandledrejection",
      (r && r.message) || String(r),
      r && r.stack
    );
  });
}
