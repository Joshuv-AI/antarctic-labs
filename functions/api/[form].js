// Cloudflare Pages Function — form intake for antarctic-labs.com.
//
//   POST /api/suggest  -> { type, title, format, seriesDetails, creator,
//                           year, source, notes, website? }
//   POST /api/donate   -> { frequency, amount_cents, cover_fees, website? }
//                         creates a Stripe Checkout Session (see below).
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

// ----- Donations: Stripe Checkout session (POST /api/donate) --------------
// The Tower donate page posts { frequency, amount_cents, cover_fees,
// donor_name, donor_email, payment_method } and this creates a Stripe
// Checkout Session with a server-built price, so the amount a donor is
// charged is always computed here — never trusted from the client
// beyond the chosen base amount (validated to a sane range).
// PAYMENT ROUTING (this is the contract the page promises):
// - card / apple_pay / google_pay -> payment_method_types ['card'].
//   Stripe's hosted page then offers the card form, and surfaces the
//   Apple Pay / Google Pay button on a supporting device when the
//   wallet is enabled in the Stripe Dashboard. Checkout cannot be
//   deep-linked straight into a wallet — the wallet renders on
//   Stripe's page, not ours — so the tile records the donor's intent
//   (metadata preferred_method) and the session stays card-family.
// - paypal, one-time -> payment_method_types ['paypal']: the hosted
//   page opens PayPal-only. PayPal must be enabled in the Dashboard;
//   if it isn't, Stripe rejects the session and we answer 502.
// - paypal, monthly -> REFUSED (400). Stripe recurring PayPal is
//   Europe-only; a US account cannot run it. The page blocks this
//   first, but the server enforces it too.
// Requires STRIPE_SECRET_KEY (secret key from Joshua's own Stripe
// account) as a Pages secret; without it the answer is 503 and the
// page shows its not-live notice. Standard Stripe US pricing is
// assumed for the cover-fees gross-up: 2.9% + 30¢.
const DONATE_FEE_RATE = 0.029;
const DONATE_FEE_FIXED_CENTS = 30;
const donateGrossUp = (cents) =>
  Math.ceil((cents + DONATE_FEE_FIXED_CENTS) / (1 - DONATE_FEE_RATE));

async function createDonateCheckout(env, { frequency, baseCents, coverFees, donorName, donorEmail, method, origin }) {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, notConfigured: true };
  const total = coverFees ? donateGrossUp(baseCents) : baseCents;
  const monthly = frequency === "monthly";
  if (method === "paypal" && monthly) return { ok: false, blocked: true };
  const p = new URLSearchParams();
  p.set("mode", monthly ? "subscription" : "payment");
  // Route the session to the method the donor actually tapped.
  if (method === "paypal") p.set("payment_method_types[0]", "paypal");
  else p.set("payment_method_types[0]", "card");
  p.set("metadata[preferred_method]", method || "card");
  // Prefill Checkout with the donor's email; the name rides on metadata
  // (Stripe receipts + the dashboard show who each gift came from).
  if (donorEmail) p.set("customer_email", donorEmail);
  if (donorName) p.set("metadata[donor_name]", donorName);
  if (!monthly) p.set("submit_type", "donate");
  p.set("success_url", `${origin}/tower-of-babel/donate?thanks=1`);
  p.set("cancel_url", `${origin}/tower-of-babel/donate?canceled=1`);
  p.set("line_items[0][quantity]", "1");
  p.set("line_items[0][price_data][currency]", "usd");
  p.set("line_items[0][price_data][unit_amount]", String(total));
  p.set(
    "line_items[0][price_data][product_data][name]",
    monthly
      ? "Tower of Babel Library — monthly support"
      : "Tower of Babel Library — one-time support"
  );
  if (monthly) p.set("line_items[0][price_data][recurring][interval]", "month");
  p.set("metadata[source]", "tower-donate");
  p.set("metadata[frequency]", frequency);
  p.set("metadata[base_amount_cents]", String(baseCents));
  p.set("metadata[cover_fees]", coverFees ? "yes" : "no");
  if (monthly) {
    p.set("subscription_data[metadata][source]", "tower-donate");
    if (donorName) p.set("subscription_data[metadata][donor_name]", donorName);
  }
  let res;
  try {
    res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: p.toString(),
    });
  } catch {
    return { ok: false };
  }
  if (!res.ok) return { ok: false };
  const data = await res.json().catch(() => null);
  if (!data || typeof data.url !== "string" || !data.url) return { ok: false };
  return { ok: true, url: data.url };
}

export async function onRequestPost({ request, env, params }) {
  const kind = params.form;
  if (kind !== "suggest" && kind !== "donate") {
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

  if (kind === "donate") {
    const frequency = str(data.frequency);
    const baseCents = Number(data.amount_cents);
    const coverFees = data.cover_fees === true;
    const donorName = str(data.donor_name).trim().slice(0, 200);
    const donorEmail = str(data.donor_email).trim().slice(0, 254);
    const methodRaw = str(data.payment_method);
    const method = ["card", "apple_pay", "google_pay", "paypal"].includes(methodRaw)
      ? methodRaw
      : "card";
    if (
      (frequency !== "once" && frequency !== "monthly") ||
      !Number.isInteger(baseCents) ||
      baseCents < 100 ||
      baseCents > 2500000
    ) {
      return json({ ok: false, error: "invalid amount" }, 400);
    }
    if (method === "paypal" && frequency === "monthly") {
      return json({ ok: false, error: "paypal does not support monthly donations" }, 400);
    }
    if (!donorName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail)) {
      return json({ ok: false, error: "invalid donor info" }, 400);
    }
    let origin = "https://antarctic-labs.com";
    try {
      origin = new URL(request.url).origin;
    } catch {
      /* keep the production origin */
    }
    const session = await createDonateCheckout(env, {
      frequency,
      baseCents,
      coverFees,
      donorName,
      donorEmail,
      method,
      origin,
    });
    if (!session.ok) {
      if (session.notConfigured) {
        return json({ ok: false, error: "payments not configured" }, 503);
      }
      if (session.blocked) {
        return json({ ok: false, error: "paypal does not support monthly donations" }, 400);
      }
      return json({ ok: false, error: "checkout failed" }, 502);
    }
    return json({ ok: true, url: session.url });
  }

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
