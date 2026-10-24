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
        ai_referrer: ai,
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
