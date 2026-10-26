// Cloudflare Pages Function — Tower of Babel API subscriptions.
//
//   POST /api/subscribe -> { plan: "pro"|"commercial",
//                            billing: "monthly"|"annual" }
//
// THE MONEY GATE: unless the Pages env flag API_LIVE is exactly "1",
// this answers 503 and NO checkout can be created. A user must never be
// able to pay for an API plan before the key system (D1 + webhook) is
// live to deliver their key. API_LIVE is set last at activation, after
// the D1 binding and the Stripe webhook are verified.
//
// Sessions are built server-side with price_data (the createDonateCheckout
// pattern in [form].js): amounts are never trusted from the client.
// Metadata source=tower-api + plan rides on the session AND the
// subscription so the webhook can fulfill and later events can find the
// key row by customer.

import { json } from "../_lib/api-auth.js";

const PLANS = {
  pro: {
    monthly: 1900,
    annual: 19000,
    name: "Tower of Babel API — Pro",
  },
  commercial: {
    monthly: 14900,
    annual: 149000,
    name: "Tower of Babel API — Commercial",
  },
};

export async function onRequestPost({ request, env }) {
  if (env.API_LIVE !== "1") {
    return json({ ok: false, error: "api subscriptions are not open yet" }, 503);
  }
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    return json({ ok: false, error: "payments not configured" }, 503);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }
  const plan = typeof data?.plan === "string" ? data.plan : "";
  const billing = typeof data?.billing === "string" ? data.billing : "";
  if (!PLANS[plan] || (billing !== "monthly" && billing !== "annual")) {
    return json({ ok: false, error: "invalid plan" }, 400);
  }

  let origin = "https://antarctic-labs.com";
  try {
    origin = new URL(request.url).origin;
  } catch {
    /* keep the production origin */
  }

  const p = new URLSearchParams();
  p.set("mode", "subscription");
  p.set("line_items[0][quantity]", "1");
  p.set("line_items[0][price_data][currency]", "usd");
  p.set("line_items[0][price_data][unit_amount]", String(PLANS[plan][billing]));
  p.set("line_items[0][price_data][product_data][name]", PLANS[plan].name);
  p.set(
    "line_items[0][price_data][recurring][interval]",
    billing === "annual" ? "year" : "month"
  );
  p.set("metadata[source]", "tower-api");
  p.set("metadata[plan]", plan);
  p.set("subscription_data[metadata][source]", "tower-api");
  p.set("subscription_data[metadata][plan]", plan);
  p.set("success_url", `${origin}/tower-of-babel/api?sub=thanks`);
  p.set("cancel_url", `${origin}/tower-of-babel/api?sub=canceled`);

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
    return json({ ok: false, error: "checkout failed" }, 502);
  }
  if (!res.ok) return json({ ok: false, error: "checkout failed" }, 502);
  const session = await res.json().catch(() => null);
  if (!session || typeof session.url !== "string" || !session.url) {
    return json({ ok: false, error: "checkout failed" }, 502);
  }
  return json({ ok: true, url: session.url });
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
