// Phase B catalog search — server-side search + browse over the
// precomputed metadata products in R2 (bucket tower-search-index,
// prefix meta/<fingerprint>/), built by scripts/build-catalog-meta.mjs.
// The client never downloads the catalog: this function fetches only
// the posting buckets a query touches, scores candidates, and hydrates
// one page of 25 from the record blocks.
//
// Ranking v1: field-weighted presence scoring with a Robertson IDF
// from posting lengths — title exact x8, creator exact x5, title stem
// x4, creator stem x2.5. Facet filters (collection / bucket / format /
// rights / era) intersect via the per-kind facet postings.
//
// Dormant-safe: until the first generator run publishes products,
// meta/latest.json 404s and callers get a clean 503.
import { foldText, tokenizeWithOffsets, stem, shardFor } from "../../src/lib/search-text.js";
import { normText, queryTokens, pinsForQuery, correctionCandidates } from "../../src/lib/search-rank.js";

const DEFAULT_BASE = "https://search-index.antarctic-labs.com";
const undelta = (d) => {
  const out = new Array(d.length);
  let cur = 0;
  for (let i = 0; i < d.length; i++) { cur += d[i]; out[i] = cur; }
  return out;
};
const FIELD_WEIGHTS = [
  ["title", "exact", 8],
  ["creator", "exact", 5],
  ["title", "stem", 4],
  ["creator", "stem", 2.5],
];

// Per-isolate caches, keyed by base root: the fingerprint pointer is
// re-read at most once a minute; product files are immutable per
// fingerprint, cached for the isolate's life.
const pointers = new Map(); // root -> { fp, at }
const fileCache = new Map(); // `${base}/${path}` -> Promise<json|null>

async function resolveBase(env) {
  const root = (env && env.CATALOG_META_BASE) || DEFAULT_BASE;
  const now = Date.now();
  const hit = pointers.get(root);
  if (hit && now - hit.at < 60_000) return { root, fp: hit.fp };
  const res = await fetch(`${root}/meta/latest.json`);
  if (!res.ok) return { root, fp: null };
  const body = await res.json().catch(() => null);
  const fp = body && typeof body.fingerprint === "string" ? body.fingerprint : null;
  if (fp) pointers.set(root, { fp, at: now });
  return { root, fp };
}

export async function catalogSearch(env, { q = "", filters = {}, cursor = 0, pageSize = 25 } = {}) {
  const { root, fp } = await resolveBase(env);
  if (!fp) return { notBuilt: true };
  const base = `${root}/meta/${fp}`;
  const get = (path) => {
    const key = `${base}/${path}`;
    if (!fileCache.has(key)) {
      fileCache.set(key, fetch(key).then((r) => (r.ok ? r.json() : null)));
    }
    return fileCache.get(key);
  };
  const manifest = await get("manifest.json");
  if (!manifest) return { notBuilt: true };
  const N = manifest.total;

  const facetIds = async (kind, key) => {
    const f = await get(`facets/${kind}.json`);
    const d = f && f[key];
    return d ? undelta(d) : [];
  };
  const applyFilters = async (set) => {
    let out = set;
    for (const [kind, key] of Object.entries(filters)) {
      if (!key) continue;
      const posting = new Set(await facetIds(kind, key));
      out = out ? new Set([...out].filter((id) => posting.has(id))) : posting;
    }
    return out ?? new Set();
  };
  const hydrate = async (ids) => {
    const byBlock = new Map();
    ids.forEach((id, i) => {
      const b = Math.floor(id / 1000);
      if (!byBlock.has(b)) byBlock.set(b, []);
      byBlock.get(b).push([id, i]);
    });
    const out = new Array(ids.length);
    await Promise.all([...byBlock.entries()].map(async ([b, entries]) => {
      const block = await get(`records/records-${String(b).padStart(5, "0")}.json`);
      for (const [id, i] of entries) out[i] = block ? block[id % 1000] : null;
    }));
    return out;
  };
  const page = async (ranked, total) => {
    const pageIds = ranked.slice(cursor, cursor + pageSize);
    return {
      total,
      results: await hydrate(pageIds),
      next_cursor: cursor + pageIds.length < total ? cursor + pageIds.length : null,
      fingerprint: fp,
    };
  };

  let correctedQuery = null;
  if (q.trim()) {
    const rawTokens = [...new Set(tokenizeWithOffsets(foldText(q)).map((x) => x.t))];
    const scores = new Map();
    // Score one token into an isolated map; also returns its exact
    // document frequency (title+creator exact posting lengths), the
    // signal the typo gate uses.
    const scoreTokenIsolated = async (tok) => {
      const local = new Map();
      let exactDf = 0;
      const stemmed = stem(tok);
      for (const [field, mode, w] of FIELD_WEIGHTS) {
        const term = mode === "stem" ? stemmed : tok;
        const bucket = await get(`postings/${field}-${mode}/bkt-${String(shardFor(term)).padStart(3, "0")}.json`);
        const d = bucket && bucket[term];
        if (!d) continue;
        const ids = undelta(d);
        if (mode === "exact") exactDf += ids.length;
        const idf = Math.log(1 + (N - ids.length + 0.5) / (ids.length + 0.5));
        for (const id of ids) local.set(id, (local.get(id) || 0) + w * idf);
      }
      return { local, exactDf };
    };
    // Did-you-mean (Workstream D's contract, server form): a token
    // whose exact df is 0 — or a rare exact term (df <= 3) with a
    // correction candidate at >= 25x its df — is a typo signature
    // ("bibl" df 2 vs "bible" df 500; "darwn" df 1 vs "darwin" 171).
    // Candidates pass D's first-letter + Damerau gates. The response
    // reports corrected_query; nothing is silently rewritten. The
    // vocabulary file is fetched only for tokens that trip the gate.
    const tokens = [];
    for (const tok of rawTokens) {
      const first = await scoreTokenIsolated(tok);
      let effective = tok;
      let chosen = first;
      if (first.exactDf <= 3) {
        const c = /^[a-z0-9]$/.test(tok[0]) ? tok[0] : "_";
        const vocabObj = await get(`vocab/${c}.json`);
        if (vocabObj) {
          const vocab = new Map(Object.entries(vocabObj));
          // Among gate-passing candidates, context decides: the one
          // whose results overlap the other query tokens' results wins
          // ("charles darwn" -> darwin, not dawn — both are one edit
          // away, but only darwin co-occurs with charles). No context
          // yet (first token): candidate order stands (distance, df).
          let best = null;
          for (const candTerm of correctionCandidates(tok, vocab, 3)) {
            const candDf = vocabObj[candTerm] || 0;
            if (!(first.exactDf === 0 || candDf >= 25 * Math.max(first.exactDf, 1))) continue;
            const scored = await scoreTokenIsolated(candTerm);
            let overlap = 0;
            for (const id of scored.local.keys()) if (scores.has(id)) overlap++;
            if (!best || overlap > best.overlap) best = { term: candTerm, scored, overlap };
          }
          if (best) { effective = best.term; chosen = best.scored; }
        }
      }
      tokens.push(effective);
      for (const [id, s] of chosen.local) scores.set(id, (scores.get(id) || 0) + s);
    }
    if (tokens.some((t, i) => t !== rawTokens[i])) correctedQuery = tokens.join(" ");
    const cand = await applyFilters(new Set(scores.keys()));
    let ranked = [...cand].sort((a, b) => (scores.get(b) - scores.get(a)) || (a - b));
    // Canon pins (Workstream D's curated table, same module the client
    // ranker uses): pinned works lead the results in pin order. With
    // facet filters active, pins may only lead from inside the filtered
    // set — never override the user's filter. Pins are evaluated
    // against the EFFECTIVE query (post-correction).
    const effectiveQ = correctedQuery ?? q;
    const pinIds = pinsForQuery(normText(effectiveQ), queryTokens(normText(effectiveQ)));
    if (pinIds && pinIds.length) {
      const pinIdx = [];
      for (const aid of pinIds) {
        const bucket = await get(`idmap/bkt-${String(shardFor(aid)).padStart(3, "0")}.json`);
        const idx = bucket?.[aid];
        if (typeof idx === "number") pinIdx.push(idx);
      }
      if (pinIdx.length) {
        const hasFilters = Object.values(filters).some(Boolean);
        const lead = hasFilters ? pinIdx.filter((id) => cand.has(id)) : pinIdx;
        const pinSet = new Set(lead);
        ranked = [...lead, ...ranked.filter((id) => !pinSet.has(id))];
      }
    }
    const out = await page(ranked, ranked.length);
    if (correctedQuery) out.corrected_query = correctedQuery;
    return out;
  }

  if (Object.values(filters).some(Boolean)) {
    const set = await applyFilters(null);
    const ranked = [...set].sort((a, b) => a - b);
    return page(ranked, ranked.length);
  }
  const pageIds = [];
  for (let id = cursor; id < Math.min(cursor + pageSize, N); id++) pageIds.push(id);
  return {
    total: N,
    results: await hydrate(pageIds),
    next_cursor: cursor + pageIds.length < N ? cursor + pageIds.length : null,
    fingerprint: fp,
  };
}
