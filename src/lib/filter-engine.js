// Browse filter engine (2026-11-11 perf/stability fix).
//
// Why this exists: the browse filter used to run synchronously inside
// the results memo on every render, walking the whole sort order and
// — for a curated collection — materializing every record through
// the column-store Proxy (allocate a record wrapper, decode its id
// to a string, hash it into a Set) just to test membership. At
// 2.56M records that is a multi-second main-thread task per click,
// repeated per stream publish, with no cancellation: rapid tapping
// stacked the tasks, tore the UI between half-computed states, and
// the allocation churn jetsam-killed phone tabs (Joshua's recording,
// 2026-11-11 22:37 — see FILTER-REVAMP-DESIGN.md §10).
//
// This engine computes a filter selection ONCE per (selection, sort
// order, catalog length) into a committed result — the full match
// list as a Uint32Array in display order, plus its count — reading
// only typed arrays:
//   - bucket membership from per-record bucket CODES (a dictionary
//     encoding of derivation phase 0's bucketKeys, built once per
//     catalog version and extended incrementally over stream
//     prefixes exactly like phase 0 itself),
//   - era from phase 0's eraCodes,
//   - curated-collection membership from a BITSET over catalog
//     indices, built once per (collection, catalog length) from
//     phase 0's id index (~26k lookups worst case, replacing
//     2.56M string-hash probes per click).
// No record is materialized, no id decoded, no string hashed inside
// the scan. The scan runs in short slices with a generation token:
// a newer selection (or a newer catalog prefix) supersedes the
// running job at the next slice boundary, and a superseded job never
// commits — so the UI renders exactly one committed filter state at
// a time, atomically.

// ------------------------------------------------------------------
// Bucket codes: dictionary-encode the bucketKeys string array.
// Canonical bucket-key strings repeat massively (a few hundred
// distinct values over millions of records), so the encoding pass is
// a Map lookup per record on a pointer-equal string — built once,
// then extended over the tail when the catalog grows (the incoming
// array is prefix-stable by phase 0's construction; the extension
// verifies the boundary element before trusting it).
export function createBucketCodeTable() {
  return {
    keys: [], // code -> bucket key string
    dict: new Map(), // bucket key string -> code
    codes: null, // Uint16Array over catalog indices
    len: 0, // records encoded so far
    lastKey: null, // bucketKeys[len-1] at encode time (prefix check)
  };
}

export function extendBucketCodes(table, bucketKeys) {
  const n = bucketKeys ? bucketKeys.length : 0;
  if (table.codes && table.len <= n && table.len > 0) {
    if (bucketKeys[table.len - 1] !== table.lastKey) {
      // Not the prefix we encoded — start over.
      table.len = 0;
      table.lastKey = null;
    }
  }
  if (!table.codes || table.codes.length < n) {
    const cap = Math.max(n, table.codes ? table.codes.length * 2 : 1024);
    const next = new Uint16Array(cap);
    if (table.codes) next.set(table.codes.subarray(0, table.len));
    table.codes = next;
  }
  const { dict, keys, codes } = table;
  let i = table.len;
  for (; i < n; i++) {
    const k = bucketKeys[i];
    let c = dict.get(k);
    if (c === undefined) {
      c = keys.length;
      keys.push(k);
      dict.set(k, c);
    }
    codes[i] = c;
  }
  table.len = n;
  table.lastKey = n ? bucketKeys[n - 1] : null;
  return table;
}

// Mask over bucket codes for one bucketFilter value: "" (all) -> null;
// a lane ("PAPERS") -> every code whose key is the lane or one of its
// subcategories; a subcategory ("PAPERS:bio") -> its exact code.
export function bucketMaskFor(table, bucketFilter) {
  if (!bucketFilter) return null;
  const mask = new Uint8Array(table.keys.length);
  if (bucketFilter.indexOf(":") > 0) {
    const c = table.dict.get(bucketFilter);
    if (c !== undefined) mask[c] = 1;
    return mask;
  }
  const lanePrefix = bucketFilter + ":";
  for (let c = 0; c < table.keys.length; c++) {
    const k = table.keys[c];
    if (k === bucketFilter || k.indexOf(lanePrefix) === 0) mask[c] = 1;
  }
  return mask;
}

// ---------------------------------------------------------------
// Curated-collection membership bitset: resolve the collection's id
// Set to catalog indices once, via the phase-0 id index. Returns a
// Uint8Array over catalog indices (1 = in the collection). Records
// the index cannot resolve (not yet resident) are simply absent —
// the same answer the old per-record Set probe gave.
export function buildMembershipBitset(idIndex, collSet, length) {
  const bits = new Uint8Array(length);
  if (!idIndex || !collSet) return bits;
  for (const id of collSet) {
    const ix = idIndex.get(id);
    if (ix !== undefined && ix < length) bits[ix] = 1;
  }
  return bits;
}

// ---------------------------------------------------------------
// The scan itself. Chunked: works in slices of at most sliceMs,
// yielding to a macrotask between them, and checks isCurrent() at
// every slice boundary — a superseded job abandons silently and
// never calls onCommit. onCommit receives the exact-size match
// array (catalog indices in display order) and its length.
//
// Membership comes in two shapes: `member` (a Uint8Array over
// catalog indices, built per (collection, length) from an id Set)
// and `memberBits` (a Uint32Array of PACKED bits over catalog
// indices — the precomputed TCU1 bitsets of design §12, length-
// independent, no per-length rebuild). At most one is passed.
//
// onSettle (design §12) fires exactly once when the job ENDS, for
// any reason — commit, abandon at a slice boundary, or cancel —
// after onCommit in the commit case. The caller's latest-only
// scheduler drains its pending selection from it, so a queued tap
// is never lost and never needs the running job cancelled.
export function startFilterScan(opts) {
  const {
    order,
    bucketCodes,
    bucketMask,
    eraCodes,
    eraCode,
    member,
    memberBits,
    isCurrent,
    onCommit,
    onSettle,
  } = opts;
  const sliceMs = opts.sliceMs || 7;
  const total = order ? order.length : 0;
  let pos = 0;
  let n = 0;
  let cap = 32768;
  let out = new Uint32Array(Math.min(cap, Math.max(total, 1)));
  let timer = null;
  let dead = false;
  let settled = false;

  const settle = () => {
    if (settled) return;
    settled = true;
    if (onSettle) {
      try { onSettle(); } catch { /* a listener must never break the engine */ }
    }
  };

  const step = () => {
    if (dead || !isCurrent()) { settle(); return; }
    const t0 = performance.now();
    while (pos < total) {
      const i = order[pos++];
      if (bucketMask && !bucketMask[bucketCodes[i]]) continue;
      if (eraCode && (!eraCodes || eraCodes[i] !== eraCode)) continue;
      if (member && !member[i]) continue;
      if (memberBits && !(memberBits[i >> 5] & (1 << (i & 31)))) continue;
      if (n === out.length) {
        const grown = new Uint32Array(out.length * 2);
        grown.set(out);
        out = grown;
      }
      out[n++] = i;
      if ((pos & 8191) === 0 && performance.now() - t0 >= sliceMs) break;
    }
    if (pos < total) {
      timer = setTimeout(step, 0);
      return;
    }
    if (!isCurrent()) { settle(); return; }
    onCommit(n === out.length ? out : out.slice(0, n), n);
    settle();
  };
  timer = setTimeout(step, 0);
  return {
    cancel() {
      dead = true;
      if (timer) clearTimeout(timer);
      settle();
    },
  };
}
