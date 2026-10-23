// Cloudflare Pages Function — form intake for antarctic-labs.com.
//
//   POST /api/suggest  -> { type, title, format, seriesDetails, creator,
//                           year, source, notes, website? }
//
// Validates the payload, drops bot submissions via the `website` honeypot
// field, applies a light per-IP rate limit, and forwards the submission to
// the lab inbox through Resend. Requires the RESEND_API_KEY secret to be
// set on the Pages project; without it the function answers 503 and the
// form shows its normal error state.

// Destination inbox. hello@antarctic-labs.com has no MX records (Email
// Routing isn't enabled), so form mail goes straight to the Gmail inbox
// instead of bouncing. Override with the FORMS_TO Pages env var anytime.
const DEFAULT_TO = "joshuaalmodovar@gmail.com";
const FROM = "Antarctic Labs <noreply@antarctic-labs.com>";
const MAX_LEN = 8000;

// Light per-isolate rate limit: max 8 submissions per IP per 10 minutes.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 2000) hits.clear();
  return arr.length > 8;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const str = (v) => (typeof v === "string" ? v.trim().slice(0, MAX_LEN) : "");

async function sendEmail(env, { to, replyTo, subject, text }) {
  const key = env.RESEND_API_KEY;
  if (!key) return { ok: false, notConfigured: true };
  let res;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        text,
      }),
    });
  } catch (e) {
    return { ok: false, error: "email provider unreachable" };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `resend ${res.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

function buildSuggestEmail(d) {
  const row = (k, v) => (v ? `${k}: ${v}` : null);
  const lines = [
    row("Type", d.type),
    row("Title", d.title),
    row("Format", d.format),
    row("Series / edition details", d.seriesDetails),
    row("Author / creator", d.creator),
    row("Date published", d.year),
    row("Source", d.source),
    "",
    d.notes ? `Notes:\n${d.notes}` : null,
  ].filter((l) => l !== null);
  return {
    replyTo: null,
    subject: `[Library Suggestion] ${d.title}`,
    text: lines.join("\n"),
  };
}

export async function onRequestPost({ request, env, params }) {
  const kind = params.form;
  if (kind !== "suggest") {
    return json({ ok: false, error: "unknown form" }, 404);
  }

  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";
  if (rateLimited(ip)) {
    return json({ ok: false, error: "too many requests" }, 429);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }
  if (!data || typeof data !== "object") {
    return json({ ok: false, error: "invalid payload" }, 400);
  }

  // Honeypot: bots fill it, humans never see it. Swallow silently.
  if (str(data.website).length > 0) return json({ ok: true });

  const d = {
    type: str(data.type),
    title: str(data.title),
    format: str(data.format),
    seriesDetails: str(data.seriesDetails),
    creator: str(data.creator),
    year: str(data.year),
    source: str(data.source),
    notes: str(data.notes),
  };
  if (!d.type || !d.title || !d.format) {
    return json({ ok: false, error: "missing or invalid fields" }, 400);
  }
  const email = buildSuggestEmail(d);

  const sent = await sendEmail(env, {
    to: env.FORMS_TO || DEFAULT_TO,
    ...email,
  });
  if (!sent.ok) {
    if (sent.notConfigured) {
      return json({ ok: false, error: "email service not configured" }, 503);
    }
    return json({ ok: false, error: "send failed" }, 502);
  }
  return json({ ok: true });
}

// Method-specific handlers take precedence in Pages Functions, so this
// only runs for non-POST requests.
export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
