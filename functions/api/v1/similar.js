// Tower of Babel — exploration API: similar works (Phase 0).
//
// Semantic neighbours from one bge-m3 embedding per work, built from
// a short surrogate (title + creator + year + description; derived
// release v1). Served from the Vectorize index bound as TOWER_VECTORS.
//
//   GET  /api/v1/similar?id=<workId>&limit=10
//   POST /api/v1/similar  {"positive": [ids], "negative": [ids], "topK": 10}
//
// Paid plans only (pro / commercial) — the free tier is catalog search
// and metadata; the same works stay free to read on the site itself.
// Quota (1 unit) is charged only after the request is validated and
// the work is confirmed present in the index, so 400/403/404 never
// cost the caller quota (the text.js / keyed-search convention).
// Keyless callers get the standard 401 from the shared auth gate —
// these are new routes; no existing keyless behaviour changes.

import {
  json,
  authenticate,
  consumeQuota,
  usageStats,
  rateHeaders,
} from "../../_lib/api-auth.js";

const RELEASE = "v1";
const MAX_LIMIT = 50;

function clampLimit(raw, fallback) {
  const n = parseInt(raw, 10);
  return Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(n) ? n : fallback));
}

async function errWithStats(env, key, data, status) {
  const stats = await usageStats(env, key);
  return json(data, status, rateHeaders(stats));
}

function shape(matches, exclude) {
  const out = [];
  for (const m of matches || []) {
    if (exclude.has(m.id)) continue;
    const md = m.metadata || {};
    out.push({
      id: m.id,
      score: Math.round(m.score * 10000) / 10000,
      title: md.title || "",
      creator: md.creator || "",
      year: md.year || "",
      collection: md.collection || "",
      reader_url: `https://antarctic-labs.com/tower-of-babel/library/${m.id}`,
    });
  }
  return out;
}

async function charge(env, key) {
  const quota = await consumeQuota(env, key);
  if (quota.error) {
    return { response: json({ ok: false, error: "usage counter unavailable" }, 500) };
  }
  if (!quota.ok) {
    return {
      response: json(
        {
          ok: false,
          error: "daily limit exceeded",
          limit: quota.stats.limit,
          reset: quota.stats.reset,
        },
        429,
        rateHeaders(quota.stats)
      ),
    };
  }
  return { stats: quota.stats };
}

// Shared pre-flight: plan + binding gates (no quota consumed here).
async function preflight(env, key) {
  if (key.plan === "free" || !key.plan) {
    return {
      response: await errWithStats(
        env,
        key,
        { ok: false, error: "similar-works exploration requires a paid plan" },
        403
      ),
    };
  }
  if (!env.TOWER_VECTORS) {
    return {
      response: await errWithStats(
        env,
        key,
        { ok: false, error: "exploration index not configured" },
        503
      ),
    };
  }
  return {};
}

export async function onRequestGet({ request, env }) {
  const a = await authenticate(request, env);
  if (a.response) return a.response;

  const url = new URL(request.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id) {
    return errWithStats(env, a.key, { ok: false, error: "id is required" }, 400);
  }
  const limit = clampLimit(url.searchParams.get("limit"), 10);

  const pf = await preflight(env, a.key);
  if (pf.response) return pf.response;

  let found;
  try {
    found = await env.TOWER_VECTORS.getByIds([id]);
  } catch (err) {
    console.error("vectorize getByIds failed", err);
    return errWithStats(env, a.key, { ok: false, error: "exploration lookup failed" }, 500);
  }
  if (!found || !found.length || !found[0].values) {
    return errWithStats(
      env,
      a.key,
      { ok: false, error: "work not found in exploration index", id },
      404
    );
  }

  const q = await charge(env, a.key);
  if (q.response) return q.response;

  const res = await env.TOWER_VECTORS.query(found[0].values, {
    topK: Math.min(MAX_LIMIT, limit + 1),
    returnMetadata: "all",
  });
  const matches = shape(res.matches, new Set([id])).slice(0, limit);
  return json(
    { ok: true, id, derived_release: RELEASE, matches },
    200,
    rateHeaders(q.stats)
  );
}

export async function onRequestPost({ request, env }) {
  const a = await authenticate(request, env);
  if (a.response) return a.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return errWithStats(env, a.key, { ok: false, error: "invalid JSON body" }, 400);
  }
  const positive = Array.isArray(body.positive) ? body.positive.slice(0, 20) : [];
  const negative = Array.isArray(body.negative) ? body.negative.slice(0, 20) : [];
  if (!positive.length) {
    return errWithStats(
      env,
      a.key,
      { ok: false, error: "positive must be a non-empty array of work ids" },
      400
    );
  }
  const topK = clampLimit(body.topK, 10);

  const pf = await preflight(env, a.key);
  if (pf.response) return pf.response;

  const ids = [...positive, ...negative];
  let vecs;
  try {
    vecs = await env.TOWER_VECTORS.getByIds(ids);
  } catch (err) {
    console.error("vectorize getByIds failed", err);
    return errWithStats(env, a.key, { ok: false, error: "exploration lookup failed" }, 500);
  }
  const byId = new Map((vecs || []).map((v) => [v.id, v.values]));
  const missing = ids.filter((i) => !byId.has(i));
  if (missing.length) {
    return errWithStats(
      env,
      a.key,
      { ok: false, error: "works not found in exploration index", missing },
      404
    );
  }

  const dims = byId.get(positive[0]).length;
  const acc = new Float64Array(dims);
  for (const pid of positive) {
    const v = byId.get(pid);
    for (let i = 0; i < dims; i++) acc[i] += v[i] / positive.length;
  }
  for (const nid of negative) {
    const v = byId.get(nid);
    for (let i = 0; i < dims; i++) acc[i] -= v[i] / negative.length;
  }
  let norm = 0;
  for (let i = 0; i < dims; i++) norm += acc[i] * acc[i];
  norm = Math.sqrt(norm);
  if (!norm) {
    return errWithStats(
      env,
      a.key,
      { ok: false, error: "positive and negative sets cancel out" },
      400
    );
  }
  const query = Array.from(acc, (x) => x / norm);

  const q = await charge(env, a.key);
  if (q.response) return q.response;

  const res = await env.TOWER_VECTORS.query(query, {
    topK: Math.min(MAX_LIMIT, topK + ids.length),
    returnMetadata: "all",
  });
  const matches = shape(res.matches, new Set(ids)).slice(0, topK);
  return json(
    { ok: true, positive, negative, derived_release: RELEASE, matches },
    200,
    rateHeaders(q.stats)
  );
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
