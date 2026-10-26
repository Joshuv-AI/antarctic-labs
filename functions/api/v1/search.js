// Cloudflare Pages Function — Tower API v1: catalog + full-text search.
//
//   GET /api/v1/search?q=<terms>&limit=<1..100>&mode=fulltext
//
// Default mode searches the catalog (title + creator substring,
// case-insensitive; title matches rank before creator matches, then
// title A–Z) using the same shard access as the entry pages
// (functions/_lib/tower-catalog.js). Records are the catalog's own
// fields; download_url is the catalog's path on antarctic-labs.com.
//
// mode=fulltext additionally consults the deep-search index manifest
// (https://antarctic-labs.com/search-index/manifest.json). While that
// index is not live, the answer is the catalog result set plus a note
// saying so — never an error — so clients written against v1 keep
// working the day the index lands.
//
// Auth: Bearer key (any plan). Consumes one unit of daily quota.

import {
  json,
  authenticate,
  consumeQuota,
  usageStats,
  rateHeaders,
} from "../../_lib/api-auth.js";
import { getShardRecords, SHARD_COUNT, getRecordById } from "../../_lib/tower-catalog.js";
import { shardFor, stem } from "../../_lib/search-text-lite.js";

const SITE = "https://antarctic-labs.com";

function recordOut(r) {
  return {
    artifact_id: r.artifact_id,
    title: r.title,
    creator: r.creator || "",
    year: r.year ?? null,
    collection: r.collection,
    rights_status: r.rights_status,
    download_url: r.download_url || null,
  };
}

async function catalogSearch(q, limit) {
  const ql = q.toLowerCase();
  const found = [];
  for (let i = 0; i < SHARD_COUNT; i++) {
    const records = await getShardRecords(i).catch(() => null);
    if (!records) continue;
    for (const r of records) {
      if (!r || !r.title) continue;
      const t = r.title.toLowerCase();
      const c = (r.creator || "").toLowerCase();
      if (t.includes(ql)) found.push({ r, score: 0 });
      else if (c.includes(ql)) found.push({ r, score: 1 });
    }
    if (found.length >= 1000) break;
  }
  found.sort(
    (a, b) =>
      a.score - b.score ||
      String(a.r.title).localeCompare(String(b.r.title))
  );
  return {
    total: found.length,
    results: found.slice(0, limit).map((f) => recordOut(f.r)),
  };
}

async function fulltextSearch(q, limit) {
  let manifest = null;
  try {
    const res = await fetch(`${SITE}/search-index/manifest.json`);
    if (res.ok) manifest = await res.json();
  } catch {
    manifest = null;
  }
  if (
    !manifest ||
    !Array.isArray(manifest.docs) ||
    manifest.docs.length === 0 ||
    !manifest.buildId
  ) {
    return null; // index not live
  }
  const shards = manifest.shards || 64;
  const terms = [
    ...new Set(
      (q.toLowerCase().match(/[a-z0-9]+/g) || [])
        .filter((t) => t.length >= 2)
        .map((t) => stem(t))
    ),
  ];
  if (terms.length === 0) return { total: 0, results: [] };
  const shardIdxs = [...new Set(terms.map((s) => shardFor(s, shards)))];
  const scores = new Map();
  await Promise.all(
    shardIdxs.map(async (idx) => {
      try {
        const res = await fetch(
          `${SITE}/search-index/${manifest.buildId}/terms/${idx}.json`
        );
        if (!res.ok) return;
        const postings = await res.json();
        for (const s of terms) {
          if (shardFor(s, shards) !== idx) continue;
          for (const [docIdx, count] of postings[s] || []) {
            scores.set(docIdx, (scores.get(docIdx) || 0) + count);
          }
        }
      } catch {
        /* a missing shard simply contributes nothing */
      }
    })
  );
  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  const results = [];
  for (const [docIdx, hits] of ranked) {
    const doc = manifest.docs[docIdx];
    if (!doc) continue;
    let rights_status = null;
    let download_url = doc.file || null;
    const rec = await getRecordById(doc.id).catch(() => null);
    if (rec && rec.state === "ok") {
      rights_status = rec.record.rights_status;
      download_url = rec.record.download_url || download_url;
    }
    results.push({
      artifact_id: doc.id,
      title: doc.title,
      creator: doc.creator || "",
      year: doc.year ?? null,
      collection: doc.collection,
      rights_status,
      download_url,
      hits,
    });
  }
  return { total: scores.size, results };
}

export async function onRequestGet({ request, env }) {
  const a = await authenticate(request, env);
  if (a.response) return a.response;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) {
    const stats = await usageStats(env, a.key);
    return json({ ok: false, error: "q is required" }, 400, rateHeaders(stats));
  }
  let limit = Number(url.searchParams.get("limit") || 20);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  limit = Math.min(100, Math.floor(limit));
  const mode = url.searchParams.get("mode") || "";

  const quota = await consumeQuota(env, a.key);
  if (!quota.ok) {
    return json(
      { ok: false, error: "daily limit exceeded", limit: quota.stats.limit, reset: quota.stats.reset },
      429,
      rateHeaders(quota.stats)
    );
  }
  const headers = rateHeaders(quota.stats);

  if (mode === "fulltext") {
    const ft = await fulltextSearch(q, limit).catch(() => null);
    if (ft) {
      return json({ ok: true, mode: "fulltext", count: ft.total, results: ft.results }, 200, headers);
    }
    const cat = await catalogSearch(q, limit);
    return json(
      {
        ok: true,
        mode: "catalog",
        count: cat.total,
        results: cat.results,
        note: "full-text search activates when the deep-search index is live; returning catalog matches",
      },
      200,
      headers
    );
  }

  const cat = await catalogSearch(q, limit);
  return json(
    { ok: true, mode: "catalog", count: cat.total, results: cat.results },
    200,
    headers
  );
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
