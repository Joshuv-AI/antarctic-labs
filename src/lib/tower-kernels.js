// Tower kernels — Rust/WebAssembly ports of the counting /
// derivation engine and the helix reshape-allocation math (Tower
// Rust/WASM phase, 2026-11-16; INVENTORY line 66).
//
// Rust source: src/lib/tower-kernels/ (build.sh rebuilds the
// committed src/lib/tower-kernels.wasm). The ports reproduce the JS
// observable behavior exactly — allocations run the identical f64
// expression trees, bitset kernels mirror JS typed-array indexing
// element-for-element — and every JS implementation is RETAINED as
// the fallback: this module resolves to null on any failure
// (WebAssembly unavailable, asset missing, instantiate error,
// kernel fault), and every call site then runs the JS path exactly
// as it did before the port. Individual kernel calls also fail
// soft: a null/false return means "use the JS implementation for
// this operation", never an exception.
//
// Memory discipline: inputs cross into a per-call arena (reset on
// every call) or into job-scoped staging slots (facet jobs use
// slots 0–7, scan jobs slots 8–15; a job's staged arrays are
// snapshots of that job's own inputs). Nothing is retained between
// jobs but the slots' capacity — linear memory is bounded by the
// largest job's staged set and reused thereafter; the parity /
// benchmark harness in the WASM phase report measures the ceiling.
import wasmUrl from "./tower-kernels.wasm?url";

// Test seam: node-side parity harnesses inject the .wasm bytes here
// (they cannot fetch the vite asset URL). Production never calls
// this; the default source fetches the emitted asset.
let wasmSource = null;
export function setTowerKernelsSource(fn) {
  wasmSource = fn;
}

async function defaultSource() {
  const res = await fetch(wasmUrl);
  if (!res.ok) throw new Error(`tower-kernels wasm fetch ${res.status}`);
  return res;
}

let exportsPromise = null;
let exportsSync = null;
function loadExports() {
  if (exportsPromise) return exportsPromise;
  exportsPromise = (async () => {
    try {
      if (typeof WebAssembly === "undefined") return null;
      let instance;
      if (wasmSource) {
        const bytes = await wasmSource();
        ({ instance } = await WebAssembly.instantiate(bytes, {}));
      } else {
        const res = await defaultSource();
        try {
          ({ instance } = await WebAssembly.instantiateStreaming(res, {}));
        } catch {
          const buf = await (await defaultSource()).arrayBuffer();
          ({ instance } = await WebAssembly.instantiate(buf, {}));
        }
      }
      const ex = instance.exports;
      if (typeof ex.tk_version !== "function" || ex.tk_version() !== 1) {
        return null;
      }
      exportsSync = ex;
      return ex;
    } catch {
      return null;
    }
  })();
  return exportsPromise;
}

export function warmTowerKernels() {
  return loadExports();
}

// Eager load in browser contexts: the module is imported by the
// library page and the helix scene, so the (46 KB) artifact is
// ready long before the catalog finishes streaming. Node harnesses
// set the source seam and call warmTowerKernels() explicitly.
if (typeof window !== "undefined") loadExports();

export function getTowerKernels() {
  return exportsSync ? kernelsApi : null;
}

// ----------------------------------------------------------------
// Marshalling helpers. After any wasm call that can grow memory,
// views are rebuilt from the CURRENT memory.buffer.

function elemOf(arr) {
  if (arr instanceof Uint32Array || arr instanceof Int32Array) return 4;
  if (arr instanceof Uint16Array || arr instanceof Int16Array) return 2;
  return 1;
}

function bytesOf(arr) {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

// Copy a typed array into the per-call arena; returns its pointer.
function arenaWrite(ex, arr) {
  const bytes = bytesOf(arr);
  const ptr = ex.tk_alloc(bytes.byteLength);
  new Uint8Array(ex.memory.buffer, ptr, bytes.byteLength).set(bytes);
  return ptr;
}

function arenaWriteBytes(ex, bytes) {
  const ptr = ex.tk_alloc(bytes.byteLength);
  new Uint8Array(ex.memory.buffer, ptr, bytes.byteLength).set(bytes);
  return ptr;
}

function copyOut(ex, Ctor) {
  const ptr = ex.tk_out_ptr();
  const len = ex.tk_out_len();
  const view = new Ctor(
    ex.memory.buffer,
    ptr,
    len / Ctor.BYTES_PER_ELEMENT
  );
  return view.slice();
}

// An operand for a kernel: either a staged descriptor
// {ptr, elem, len} or a live typed array (copied into the arena).
function operand(ex, op) {
  if (op && typeof op.ptr === "number") return op;
  if (op && typeof op.length === "number") {
    return { ptr: arenaWrite(ex, op), elem: elemOf(op), len: op.length };
  }
  return null;
}

// ----------------------------------------------------------------
// Job staging contexts. A context snapshots a job's large inputs
// into staging slots once, so chunked kernel calls over slices of
// the same job don't re-copy megabytes per slice. Facet contexts
// own slots 0–7, scan contexts slots 8–15 (the two job kinds run
// concurrently; slots never alias across kinds). Beginning a new
// context of a kind replaces the old one's slot assignments — the
// previous job of that kind is always finished or cancelled first
// (both engines are latest-only, one job in flight per kind).

function makeCtx(ex, slotBase) {
  const staged = new Map();
  let next = 0;
  return {
    stage(arr) {
      let s = staged.get(arr);
      if (s) return s;
      if (next >= 8) return null;
      const bytes = bytesOf(arr);
      const ptr = ex.tk_stage(slotBase + next++, bytes.byteLength);
      new Uint8Array(ex.memory.buffer, ptr, bytes.byteLength).set(bytes);
      s = { ptr, elem: elemOf(arr), len: arr.length };
      staged.set(arr, s);
      return s;
    },
  };
}

// ----------------------------------------------------------------
// The kernels API. Every method fails soft (null / false).

function allocCommon(ex, fn, counts, consts, extra) {
  try {
    const norm = Float64Array.from(counts, (v) => v || 0);
    ex.tk_reset();
    const ptr = arenaWrite(ex, norm);
    const rc = fn(
      ptr,
      norm.length,
      consts.target,
      consts.minStations,
      consts.rows,
      ...(extra || [])
    );
    if (rc !== 0) return null;
    return copyOut(ex, Float64Array);
  } catch {
    return null;
  }
}

const kernelsApi = {
  memoryBytes() {
    const ex = exportsSync;
    return ex ? ex.memory.buffer.byteLength : 0;
  },

  // helix-scene.js allocations. `counts` is an array-like of the
  // per-coil (or per-band, in BAND_DEFS order) counts; the result
  // is a Float64Array of station counts in the same order.
  allocBands(counts, consts) {
    const ex = exportsSync;
    if (!ex) return null;
    return allocCommon(ex, ex.tk_alloc_bands.bind(ex), counts, consts);
  },
  allocArr(counts, consts) {
    const ex = exportsSync;
    if (!ex) return null;
    return allocCommon(ex, ex.tk_alloc_arr.bind(ex), counts, consts);
  },
  allocGroup(counts, consts) {
    const ex = exportsSync;
    if (!ex) return null;
    return allocCommon(ex, ex.tk_alloc_group.bind(ex), counts, consts, [
      consts.literalMax,
    ]);
  },

  // facetCountSteps kernels (standalone forms; the facet context
  // below offers staged variants for the job's repeated operands).
  andPop(a, b, wLimit) {
    const ex = exportsSync;
    if (!ex) return null;
    try {
      ex.tk_reset();
      const oa = operand(ex, a);
      const ob = operand(ex, b);
      if (!oa || !ob) return null;
      const n = ex.tk_and_pop(oa.ptr, oa.elem, oa.len, ob.ptr, ob.elem, ob.len, wLimit);
      return n < 0 ? null : Number(n);
    } catch {
      return null;
    }
  },

  andWords(a, b, wWords) {
    const ex = exportsSync;
    if (!ex) return null;
    try {
      ex.tk_reset();
      const oa = operand(ex, a);
      const ob = operand(ex, b);
      if (!oa || !ob) return null;
      const rc = ex.tk_and_words(oa.ptr, oa.elem, oa.len, ob.ptr, ob.elem, ob.len, wWords);
      if (rc !== 0) return null;
      return copyOut(ex, Uint32Array);
    } catch {
      return null;
    }
  },

  buildEraWords(eraCodes, code) {
    const ex = exportsSync;
    if (!ex) return null;
    try {
      ex.tk_reset();
      const ptr = arenaWrite(ex, eraCodes);
      const rc = ex.tk_build_era_words(ptr, eraCodes.length, code);
      if (rc !== 0) return null;
      return copyOut(ex, Uint32Array);
    } catch {
      return null;
    }
  },

  buildMaskWords(codes, mask) {
    const ex = exportsSync;
    if (!ex) return null;
    try {
      ex.tk_reset();
      const cp = arenaWrite(ex, codes);
      const mp = arenaWrite(ex, mask);
      const rc = ex.tk_build_mask_words(cp, codes.length, mp, mask.length);
      if (rc !== 0) return null;
      return copyOut(ex, Uint32Array);
    } catch {
      return null;
    }
  },

  // ---- facet job context (slots 0–7) ----
  beginFacet() {
    const ex = exportsSync;
    if (!ex) return null;
    const ctx = makeCtx(ex, 0);
    ctx.andPop = (a, b, wLimit) => {
      try {
        ex.tk_reset();
        const oa = operand(ex, a);
        const ob = operand(ex, b);
        if (!oa || !ob) return null;
        const n = ex.tk_and_pop(oa.ptr, oa.elem, oa.len, ob.ptr, ob.elem, ob.len, wLimit);
        return n < 0 ? null : Number(n);
      } catch {
        return null;
      }
    };
    ctx.buildEraWords = (eraOp, code) => {
      try {
        ex.tk_reset();
        const oe = operand(ex, eraOp);
        if (!oe) return null;
        const rc = ex.tk_build_era_words(oe.ptr, oe.len, code);
        if (rc !== 0) return null;
        return copyOut(ex, Uint32Array);
      } catch {
        return null;
      }
    };
    ctx.buildMaskWords = (codesOp, mask, n) => {
      try {
        ex.tk_reset();
        const oc = operand(ex, codesOp);
        if (!oc) return null;
        const mp = arenaWrite(ex, mask);
        // n is the logical record count: the staged codes array
        // may carry spare capacity past it, and the JS loop it
        // replaces reads exactly the first n codes.
        const rc = ex.tk_build_mask_words(oc.ptr, n | 0, mp, mask.length);
        if (rc !== 0) return null;
        return copyOut(ex, Uint32Array);
      } catch {
        return null;
      }
    };
    // Chunked tallies: counts is a JS Uint32Array accumulated
    // across slices (era: numEras entries; bucket: one per bucket
    // code). Returns false on any divergence — the caller redoes
    // that slice with the JS loop and the counts stay exact.
    ctx.eraTally = (withinOp, eraOp, wFrom, wTo, counts) => {
      try {
        ex.tk_reset();
        const ow = operand(ex, withinOp);
        const oe = operand(ex, eraOp);
        if (!ow || !oe) return false;
        const cp = arenaWrite(ex, counts);
        const rc = ex.tk_era_tally(
          ow.ptr, ow.elem, ow.len,
          oe.ptr, oe.len,
          wFrom, wTo, counts.length, cp
        );
        if (rc !== 0) return false;
        const back = new Uint32Array(ex.memory.buffer, cp, counts.length);
        counts.set(back);
        return true;
      } catch {
        return false;
      }
    };
    ctx.bucketTally = (withinOp, codesOp, wFrom, wTo, counts, codesLen) => {
      try {
        ex.tk_reset();
        const ow = operand(ex, withinOp);
        const oc = operand(ex, codesOp);
        if (!ow || !oc) return false;
        const cp = arenaWrite(ex, counts);
        // codesLen is the logical record count (the staged codes
        // array may carry spare capacity): a set bit at or past
        // it is a divergence the kernel reports, and the JS slice
        // then reproduces the original behavior exactly.
        const rc = ex.tk_bucket_tally(
          ow.ptr, ow.elem, ow.len,
          oc.ptr, codesLen | 0,
          wFrom, wTo, cp, counts.length
        );
        if (rc !== 0) return false;
        const back = new Uint32Array(ex.memory.buffer, cp, counts.length);
        counts.set(back);
        return true;
      } catch {
        return false;
      }
    };
    return ctx;
  },

  // ---- scan job context (slots 8–15) ----
  // Stages the scan's indexed arrays once (the selection's own
  // catalog snapshot); scanRange then walks position ranges of
  // the display order, writing matches into the caller's output.
  beginScan(sel) {
    const ex = exportsSync;
    if (!ex) return null;
    const ctx = makeCtx(ex, 8);
    const codes = sel.bucketCodes ? ctx.stage(sel.bucketCodes) : null;
    const mask = sel.bucketMask ? ctx.stage(sel.bucketMask) : null;
    const era = sel.eraCodes ? ctx.stage(sel.eraCodes) : null;
    const member = sel.member ? ctx.stage(sel.member) : null;
    const mbits = sel.memberBits ? ctx.stage(sel.memberBits) : null;
    if (
      (sel.bucketCodes && !codes) ||
      (sel.bucketMask && !mask) ||
      (sel.eraCodes && !era) ||
      (sel.member && !member) ||
      (sel.memberBits && !mbits)
    ) {
      return null;
    }
    const eraCode = sel.eraCode || 0;
    ctx.scanRange = (order, posFrom, maxPos, out, outOff) => {
      try {
        ex.tk_reset();
        // Only the position chunk crosses (the kernel indexes it
        // chunk-relative); the big indexed arrays stay staged.
        const chunk = order.subarray(posFrom, posFrom + maxPos);
        const op = arenaWrite(ex, chunk);
        const outPtr = ex.tk_alloc(maxPos * 4);
        const rc = ex.tk_scan_range(
          op, chunk.length, posFrom, maxPos,
          codes ? codes.ptr : 0, codes ? codes.len : 0,
          mask ? mask.ptr : 0, mask ? mask.len : 0,
          era ? era.ptr : 0, era ? era.len : 0,
          eraCode,
          member ? member.ptr : 0, member ? member.len : 0,
          mbits ? mbits.ptr : 0, mbits ? mbits.len : 0,
          outPtr, maxPos
        );
        if (rc !== 0) return null;
        const meta = copyOut(ex, Uint32Array);
        const consumed = meta[0];
        const written = meta[1];
        if (written > 0) {
          const got = new Uint32Array(ex.memory.buffer, outPtr, written);
          out.set(got, outOff);
        }
        return { consumed, written };
      } catch {
        return null;
      }
    };
    return ctx;
  },
};
