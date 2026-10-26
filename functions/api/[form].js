// Cloudflare Pages Function — form intake for antarctic-labs.com.
//
//   POST /api/suggest  -> { type, title, format, seriesDetails, creator,
//                           year, source, notes, website? }
//   POST /api/donate   -> { frequency, amount_cents, cover_fees, website? }
//                         creates a Stripe Checkout Session (see below).
//   POST /api/commission -> { name, email, deliverable, description,
//                           subject, deadline, budget, website? }
//                         Commissions Desk intake, emailed like suggest.
//   POST /api/commission-session -> OPERATOR ONLY (x-operator-key header
//                         must equal the OPERATOR_KEY secret): creates a
//                         Stripe Checkout Session for a commission deposit.
//                         Never linked from the public site.
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

function buildCommissionEmail(d) {
  const row = (k, v) => (v ? `${k}: ${v}` : null);
  const lines = [
    row("Name", d.name),
    row("Email", d.email),
    row("Deliverable", d.deliverable),
    row("Works / subject", d.subject),
    row("Deadline", d.deadline),
    row("Budget range", d.budget),
    "",
    d.description ? `Project:\n${d.description}` : null,
  ].filter((l) => l !== null);
  return {
    replyTo: d.email || null,
    subject: `[Commission] ${d.name}`,
    text: lines.join("\n"),
  };
}

// ----- Donations: Stripe Checkout session (POST /api/donate) --------------
// The Tower donate page posts { frequency, amount_cents, cover_fees,
// payment_method } and this creates a Stripe
// NOTE (2026-10-25): donor name/email are NO LONGER collected on the
// page or required here. Stripe Checkout collects the donor's email
// (and cardholder/wallet name) on its hosted page; if an older client
// still sends donor_name/donor_email they are accepted and used only
// as a Checkout prefill / metadata, never as a requirement.
// Checkout Session with a server-built price, so the amount a donor is
// charged is always computed here — never trusted from the client
// beyond the chosen base amount (validated to a sane range).
// PAYMENT ROUTING (2026-10-24, corrected after a live outage):
// The page's tiles record the donor's chosen method in metadata
// (preferred_method) and the session uses Stripe's automatic payment
// methods — the donor picks the exact method on Stripe's hosted page,
// where wallets surface on supporting devices when enabled in the
// Dashboard. DO NOT re-add explicit payment_method_types: on
// 2026-10-24 the ['card']/['paypal'] sessions that verified fine at
// 11:58 EDT started returning Stripe rejections (our 502) the moment
// payment_method_types[0] was added, for card AND PayPal alike.
// The exact Stripe error is visible only in Dashboard -> Developers
// -> Logs; check there before ever reintroducing the parameter.
// PAYPAL REMOVED 2026-10-24 (Joshua's call): PayPal is not offered
// as an enableable method on this Stripe account, so the tile is
// gone and "paypal" is no longer an accepted method value — any
// stray paypal value falls through to the card default. The offered
// methods are card, Apple Pay, and Google Pay (wallets surface on
// Stripe's page on supporting devices when enabled in the Dashboard).
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
  const p = new URLSearchParams();
  p.set("mode", monthly ? "subscription" : "payment");
  // Method intent is recorded, not forced: explicit
  // payment_method_types broke live session creation on 2026-10-24
  // (see header). Stripe's automatic methods decide what the hosted
  // page offers; the donor picks there.
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

// ----- Commissions Desk: operator deposit checkout -------------------------
// POST /api/commission-session — issued by the operator after a quote is
// accepted, never linked from the public site. Guarded by the OPERATOR_KEY
// secret (x-operator-key header); without the secret set, the endpoint is
// dormant (503), same pattern as the Stripe/Resend keys above. The amount
// is server-built into the session exactly like donations: the client
// supplies only the agreed deposit amount + order reference.
async function createCommissionCheckout(env, { amountCents, orderRef, customerEmail, description, origin }) {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, notConfigured: true };
  const p = new URLSearchParams();
  p.set("mode", "payment");
  if (customerEmail) p.set("customer_email", customerEmail);
  p.set("success_url", `${origin}/tower-of-babel/library/research?deposit=paid`);
  p.set("cancel_url", `${origin}/tower-of-babel/library/research?deposit=canceled`);
  p.set("line_items[0][quantity]", "1");
  p.set("line_items[0][price_data][currency]", "usd");
  p.set("line_items[0][price_data][unit_amount]", String(amountCents));
  p.set(
    "line_items[0][price_data][product_data][name]",
    description || `Tower of Babel Commissions Desk — deposit (${orderRef})`
  );
  p.set("metadata[source]", "tower-commission");
  p.set("metadata[order_ref]", orderRef);
  p.set("metadata[kind]", "deposit");
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
  if (
    kind !== "suggest" &&
    kind !== "donate" &&
    kind !== "commission" &&
    kind !== "commission-session"
  ) {
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

  // Operator-only deposit checkout: no honeypot, no public path to it.
  // Dormant (503) until OPERATOR_KEY is set as a Pages secret.
  if (kind === "commission-session") {
    const operatorKey = env.OPERATOR_KEY;
    if (!operatorKey) {
      return json({ ok: false, error: "operator checkout not configured" }, 503);
    }
    if (request.headers.get("x-operator-key") !== operatorKey) {
      return json({ ok: false, error: "forbidden" }, 403);
    }
    const amountCents = Number(data.amount_cents);
    const orderRef = str(data.order_ref).slice(0, 100);
    const customerEmail = str(data.customer_email).slice(0, 254);
    const description = str(data.description).slice(0, 300);
    if (
      !Number.isInteger(amountCents) ||
      amountCents < 15000 ||
      amountCents > 2500000 ||
      !orderRef ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
    ) {
      return json({ ok: false, error: "invalid session request" }, 400);
    }
    let origin = "https://antarctic-labs.com";
    try {
      origin = new URL(request.url).origin;
    } catch {
      /* keep the production origin */
    }
    const session = await createCommissionCheckout(env, {
      amountCents,
      orderRef,
      customerEmail,
      description,
      origin,
    });
    if (!session.ok) {
      if (session.notConfigured) {
        return json({ ok: false, error: "payments not configured" }, 503);
      }
      return json({ ok: false, error: "checkout failed" }, 502);
    }
    return json({ ok: true, url: session.url });
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
    const method = ["card", "apple_pay", "google_pay"].includes(methodRaw)
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
    if (donorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail)) {
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
      return json({ ok: false, error: "checkout failed" }, 502);
    }
    return json({ ok: true, url: session.url });
  }

  if (kind === "commission") {
    const d = {
      name: str(data.name),
      email: str(data.email),
      deliverable: str(data.deliverable),
      description: str(data.description),
      subject: str(data.subject),
      deadline: str(data.deadline),
      budget: str(data.budget),
    };
    if (
      !d.name ||
      !d.deliverable ||
      !d.description ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)
    ) {
      return json({ ok: false, error: "missing or invalid fields" }, 400);
    }
    const email = buildCommissionEmail(d);
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
