// Tower of Babel — exploration API: passage hybrid search (Phase 1).
//
// Hybrid retrieval over ONE collection (DECLASSIFIED): dense passage
// vectors (bge-m3, Vectorize index tower-passages-v1, bound as
// TOWER_PASSAGES) fused with the lexical BM25 leg of the R2
// deep-search index (Workstream B: manifest + 256 term shards at
// search-index.antarctic-labs.com) via Reciprocal Rank Fusion
// (k = 60), then a cross-encoder rerank (@cf/baai/bge-reranker-base)
// of the fused top 50. Every result cites an exact passage:
// work_id + char offsets into the work's canonical text, with the
// snippet sliced from that text at those offsets.
//
//   GET  /api/v1/passages?q=<query>&limit=10
//   POST /api/v1/passages  {"q": "...", "limit": 10}
//
// Paid plans only (pro / commercial), like similar.js and text.js.
// Quota (1 unit) is charged ONLY after results are computed
// successfully (the keyed-search convention): 400/401/403/503/502
// never cost the caller quota.
//
// Graceful degradation, by design and mirroring the keyed fulltext
// search: if the R2 BM25 index is unavailable (still building, a
// shard fetch fails, the manifest is empty) the answer is the dense
// leg alone plus a `note` field — never an error. If the reranker
// is unavailable the fused RRF order is returned, also with a note.
//
// BINDINGS (coordinator: scripts/phase1_bind.py adds both, using the
// bind_vectors.py merge discipline):
//   TOWER_PASSAGES  Vectorize -> tower-passages-v1
//   AI              Workers AI (query embedding + rerank)
// Without TOWER_PASSAGES this endpoint answers 503; without AI it
// falls back to the Workers AI REST API when the env carries
// CF_API_TOKEN (or CLOUDFLARE_API_TOKEN / WORKERS_AI_TOKEN) plus
// CF_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID), and otherwise answers
// 503. Both 503s are pre-quota.

import {
  json,
  authenticate,
  consumeQuota,
  usageStats,
  rateHeaders,
} from "../../_lib/api-auth.js";
import {
  shardFor,
  parseTerms,
  bm25Term,
  chunkText,
  bestPassageForTerms,
  rrfFuse,
} from "../../_lib/passages-text.js";

const SITE = "https://antarctic-labs.com";
const R2_BASE = "https://search-index.antarctic-labs.com";
const COLLECTION = "DECLASSIFIED";
const EMBED_MODEL = "@cf/baai/bge-m3";
const RERANK_MODEL = "@cf/baai/bge-reranker-base";
const MAX_QUERY_LENGTH = 200;
const MAX_LIMIT = 50;
const DENSE_TOPK = 50;
const BM25_TOP_WORKS = 50;
const BM25_ONLY_WORKS = 10; // works expanded to passages BM25-side
const RERANK_MAX = 50;
const MAX_TEXT_FETCHES = 30; // distinct work texts per request
const SNIPPET_MAX = 400;
const RERANK_TEXT_MAX = 3000;

function clampLimit(raw, fallback) {
  const n = parseInt(raw, 10);
  return Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(n) ? n : fallback));
}

async function errWithStats(env, key, data, status) {
  const stats = await usageStats(env, key);
  return json(data, status, rateHeaders(stats));
}

// --- Workers AI access -------------------------------------------------
// Preferred: the AI binding (env.AI.run). Fallback: the REST API
// with an env-carried token, so the endpoint works the day either
// path is configured. Returns the model result object, or null when
// no AI path is configured at all; throws on an upstream failure so
// the caller can decide (embed failure = 502, rerank failure =
// degrade to RRF order).
function aiConfigured(env) {
  if (env.AI && typeof env.AI.run === "function") return true;
  const token = env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN || env.WORKERS_AI_TOKEN;
  const acct = env.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID;
  return !!(token && acct);
}

async function aiRun(env, model, payload) {
  if (env.AI && typeof env.AI.run === "function") {
    return env.AI.run(model, payload);
  }
  const token = env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN || env.WORKERS_AI_TOKEN;
  const acct = env.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !acct) return null;
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) throw new Error(`workers ai rest ${res.status}`);
  const body = await res.json();
  return body && body.result !== undefined ? body.result : body;
}

async function embedQuery(env, q) {
  const out = await aiRun(env, EMBED_MODEL, { text: [q] });
  const vec = out && out.data && out.data[0];
  if (!Array.isArray(vec) || vec.length !== 1024) {
    throw new Error("unexpected embedding shape");
  }
  return vec;
}

async function rerank(env, q, candidates) {
  const out = await aiRun(env, RERANK_MODEL, {
    query: q,
    contexts: candidates.map((c) => ({ text: c.passageText.slice(0, RERANK_TEXT_MAX) })),
  });
  const rows = (out && (out.data || out.response)) || [];
  if (!Array.isArray(rows) || !rows.length) return null;
  const scored = [];
  for (const r of rows) {
    if (typeof r.index === "number" && typeof r.score === "number" &&
        candidates[r.index]) {
      scored.push({ cand: candidates[r.index], score: r.score });
    }
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// --- Work texts ----------------------------------------------------------
// Snippets and BM25-only passages are cut from the canonical text —
// the same bytes the chunker indexed — fetched once per work per
// request (memoized in this map, capped).
function makeTextFetcher() {
  const cache = new Map();
  let fetches = 0;
  return async function getText(workId) {
    if (cache.has(workId)) return cache.get(workId);
    if (fetches >= MAX_TEXT_FETCHES) return null;
    fetches++;
    const p = (async () => {
      try {
        const res = await fetch(`${SITE}/tower-of-babel/${encodeURIComponent(workId)}.txt`);
        if (!res.ok) return null;
        return await res.text();
      } catch {
        return null;
      }
    })();
    cache.set(workId, p);
    return p;
  };
}

// --- BM25 leg (R2 deep-search index) -------------------------------------
// Returns { works: [{ work_id, rank, score }] (rank 1-based, best
// first, DECLASSIFIED only, top BM25_TOP_WORKS), manifest } or null
// when the index is unavailable — the caller then serves dense-only
// results with a note, exactly like the keyed fulltext degradation.
let manifestMemo = null; // { buildId, avgWords, N, docs } per isolate

async function bm25Leg(q) {
  const terms = parseTerms(q);
  if (!terms.length) return { works: [], empty: true };
  let manifest = null;
  try {
    const res = await fetch(`${R2_BASE}/manifest.json`, { cf: { cacheTtl: 300 } });
    if (res.ok) manifest = await res.json();
  } catch {
    manifest = null;
  }
  if (!manifest || !manifest.buildId ||
      !Array.isArray(manifest.docs) || manifest.docs.length === 0) {
    return null;
  }
  const docs = manifest.docs;
  const shards = manifest.shards || 256;
  if (!manifestMemo || manifestMemo.buildId !== manifest.buildId) {
    let total = 0;
    for (const d of docs) total += d.words || 0;
    manifestMemo = {
      buildId: manifest.buildId,
      avgWords: total / Math.max(1, docs.length) || 1,
      N: docs.length,
    };
  }
  const { avgWords, N } = manifestMemo;
  const shardIdxs = [...new Set(terms.map((s) => shardFor(s, shards)))];
  const loaded = await Promise.all(
    shardIdxs.map(async (idx) => {
      try {
        const res = await fetch(`${R2_BASE}/${manifest.buildId}/terms/${idx}.json`,
          { cf: { cacheTtl: 86400, cacheEverything: true } });
        if (!res.ok) return {};
        return await res.json();
      } catch {
        return {};
      }
    })
  );
  const byIdx = new Map(shardIdxs.map((idx, k) => [idx, loaded[k]]));
  const scores = new Map(); // docIdx -> bm25 score
  for (const s of terms) {
    const postings = (byIdx.get(shardFor(s, shards)) || {})[s] || [];
    const df = postings.length;
    if (!df) continue;
    for (const [docIdx, count] of postings) {
      const doc = docs[docIdx];
      if (!doc || doc.collection !== COLLECTION) continue;
      const cur = scores.get(docIdx) || 0;
      scores.set(docIdx, cur + bm25Term(count, doc.words || avgWords, avgWords, df, N));
    }
  }
  const works = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, BM25_TOP_WORKS)
    .map(([docIdx, score], i) => ({
      work_id: docs[docIdx].id,
      rank: i + 1,
      score,
    }));
  return { works };
}

// --- Handler ---------------------------------------------------------------
async function handle(request, env, params) {
  const a = await authenticate(request, env);
  if (a.response) return a.response;

  const q = String(params.q || "").trim();
  if (!q) {
    return errWithStats(env, a.key, { ok: false, error: "q is required" }, 400);
  }
  if (q.length > MAX_QUERY_LENGTH) {
    return errWithStats(
      env, a.key,
      { ok: false, error: `q must be at most ${MAX_QUERY_LENGTH} characters` },
      400
    );
  }
  const collection = String(params.collection || COLLECTION).trim().toUpperCase();
  if (collection !== COLLECTION) {
    return errWithStats(
      env, a.key,
      { ok: false, error: `phase 1 covers ${COLLECTION} only`, collection },
      400
    );
  }
  const limit = clampLimit(params.limit, 10);

  if (a.key.plan === "free" || !a.key.plan) {
    return errWithStats(
      env, a.key,
      { ok: false, error: "passage exploration requires a paid plan" },
      403
    );
  }
  if (!env.TOWER_PASSAGES) {
    return errWithStats(
      env, a.key,
      { ok: false, error: "passage index not configured" },
      503
    );
  }
  if (!aiConfigured(env)) {
    return errWithStats(
      env, a.key,
      { ok: false, error: "query embedding not configured" },
      503
    );
  }

  // Compute first; quota is charged only on success (below).
  const notes = [];
  let queryVec;
  try {
    queryVec = await embedQuery(env, q);
  } catch (err) {
    console.error("passage query embedding failed", err);
    return errWithStats(env, a.key, { ok: false, error: "query embedding failed" }, 502);
  }

  let denseMatches;
  try {
    const res = await env.TOWER_PASSAGES.query(queryVec, {
      topK: DENSE_TOPK,
      returnMetadata: "all",
    });
    denseMatches = res.matches || [];
  } catch (err) {
    console.error("passage vectorize query failed", err);
    return errWithStats(env, a.key, { ok: false, error: "passage lookup failed" }, 502);
  }
  const dense = denseMatches.map((m, i) => {
    const md = m.metadata || {};
    const workId = md.work_id || String(m.id).split("#")[0];
    const chunkIndex = typeof md.chunk_index === "number"
      ? md.chunk_index
      : parseInt(String(m.id).split("#")[1] || "0", 10);
    return {
      key: `${workId}#${chunkIndex}`,
      work_id: workId,
      chunk_index: chunkIndex,
      char_start: md.char_start,
      char_end: md.char_end,
      denseRank: i + 1,
      vectorScore: m.score,
    };
  }).filter((c) => typeof c.char_start === "number" && typeof c.char_end === "number");

  // BM25 leg — any failure degrades to dense-only with a note.
  let bm25 = null;
  try {
    bm25 = await bm25Leg(q);
  } catch (err) {
    console.error("passage bm25 leg failed", err);
    bm25 = null;
  }
  if (!bm25) notes.push("bm25 index unavailable — dense-only results");

  const getText = makeTextFetcher();
  const bm25RankByWork = new Map();
  const bm25RankByKey = new Map();
  const extra = [];
  if (bm25 && bm25.works.length) {
    for (const w of bm25.works) bm25RankByWork.set(w.work_id, w.rank);
    for (const c of dense) {
      const r = bm25RankByWork.get(c.work_id);
      if (r) bm25RankByKey.set(c.key, r);
    }
    // BM25-only candidates: top lexical works the dense leg never
    // surfaced get their best passage by re-chunking the real text
    // with the index geometry — a true second leg, not a reweight.
    const denseWorks = new Set(dense.map((c) => c.work_id));
    const terms = parseTerms(q);
    let expanded = 0;
    for (const w of bm25.works) {
      if (expanded >= BM25_ONLY_WORKS) break;
      if (denseWorks.has(w.work_id)) continue;
      const text = await getText(w.work_id);
      if (!text) continue;
      expanded++;
      const best = bestPassageForTerms(chunkText(text), terms);
      if (!best) continue;
      const cand = {
        key: `${w.work_id}#${best.chunk_index}`,
        work_id: w.work_id,
        chunk_index: best.chunk_index,
        char_start: best.char_start,
        char_end: best.char_end,
      };
      extra.push(cand);
      bm25RankByKey.set(cand.key, w.rank);
    }
  }

  const fused = rrfFuse(dense, bm25RankByKey, extra, 60);
  const candidates = fused.slice(0, RERANK_MAX);

  // Passage texts (for rerank contexts + snippets), one fetch per
  // distinct work; a work whose text cannot be fetched keeps its
  // fused position with an empty snippet rather than failing.
  const textsByWork = new Map();
  for (const c of candidates) {
    if (!textsByWork.has(c.work_id)) {
      textsByWork.set(c.work_id, await getText(c.work_id));
    }
    const text = textsByWork.get(c.work_id);
    c.passageText = text ? text.slice(c.char_start, c.char_end) : "";
  }

  // Rerank the fused shortlist; any failure keeps the RRF order.
  let ordered = candidates.map((c) => ({ cand: c, score: c.rrf, reranked: false }));
  if (candidates.length > 1) {
    try {
      const scored = await rerank(env, q, candidates);
      if (scored && scored.length === candidates.length) {
        ordered = scored.map((s) => ({ cand: s.cand, score: s.score, reranked: true }));
      } else if (scored) {
        notes.push("rerank partial — fused order kept for unranked passages");
        const seen = new Set(scored.map((s) => s.cand.key));
        ordered = [
          ...scored.map((s) => ({ cand: s.cand, score: s.score, reranked: true })),
          ...candidates.filter((c) => !seen.has(c.key))
            .map((c) => ({ cand: c, score: c.rrf, reranked: false })),
        ];
      } else {
        notes.push("rerank unavailable — fused order returned");
      }
    } catch (err) {
      console.error("passage rerank failed", err);
      notes.push("rerank unavailable — fused order returned");
    }
  }

  const results = ordered.slice(0, limit).map(({ cand, score, reranked }) => ({
    work_id: cand.work_id,
    chunk_index: cand.chunk_index,
    char_start: cand.char_start,
    char_end: cand.char_end,
    snippet: (cand.passageText || "").trim().slice(0, SNIPPET_MAX),
    score: Math.round(score * 10000) / 10000,
    reranked,
    dense_rank: cand.denseRank || null,
    bm25_rank: cand.bm25Rank || null,
    reader_url: `${SITE}/tower-of-babel/library/${cand.work_id}?at=${cand.char_start}`,
  }));

  const quota = await consumeQuota(env, a.key);
  if (quota.error) {
    return json({ ok: false, error: "usage counter unavailable" }, 500);
  }
  if (!quota.ok) {
    return json(
      {
        ok: false,
        error: "daily limit exceeded",
        limit: quota.stats.limit,
        reset: quota.stats.reset,
      },
      429,
      rateHeaders(quota.stats)
    );
  }
  return json(
    {
      ok: true,
      q,
      collection: COLLECTION,
      mode: bm25 ? "hybrid" : "dense-only",
      ...(notes.length ? { note: notes.join("; ") } : {}),
      count: results.length,
      results,
    },
    200,
    rateHeaders(quota.stats)
  );
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  return handle(request, env, {
    q: url.searchParams.get("q"),
    limit: url.searchParams.get("limit"),
    collection: url.searchParams.get("collection"),
  });
}

export async function onRequestPost({ request, env }) {
  const a = await authenticate(request, env);
  if (a.response) return a.response;
  let body;
  try {
    body = await request.json();
  } catch {
    const stats = await usageStats(env, a.key);
    return json({ ok: false, error: "invalid JSON body" }, 400, rateHeaders(stats));
  }
  // handle() re-authenticates (cheap D1 read) so GET and POST share
  // one code path and one ordering of the gates.
  return handle(request, env, {
    q: body.q || body.query,
    limit: body.limit,
    collection: body.collection,
  });
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
