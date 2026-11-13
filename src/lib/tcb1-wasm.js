// TCB1 WebAssembly decoder — JS wrapper (Tower optimization,
// 2026-11-13 Rust port of the session in tcb1.js).
//
// Loads the compiled decoder (src/lib/tcb1-decoder.wasm, Rust source
// in src/lib/tcb1-wasm/) and exposes a session adapter with the same
// contract createTcb1Session fulfills for the browse worker, sourced
// from raw shard bytes instead of a parsed shard:
//
//   const ws = await createWasmTcb1Session(dictBytes, totalRecords);
//   ws.transposeBytes(shardBytes, pageCursor, shardIndex) -> payload
//   ws.resetTo(serverCursor)
//   ws.stats() -> { retainedBytes, indexBytes }
//   ws.count
//   ws.dispose()
//
// The payload shape is identical to the JS session's — same typed
// arrays, same `fresh` lists with the same value types (string /
// number / null): fresh strings cross the boundary as raw UTF-8
// bytes and are decoded HERE with the same TextDecoder
// (ignoreBOM: true) tcb1.js uses, so U+FEFF retention and U+FFFD
// normalization are the platform's own.
//
// Every failure mode returns null (factory) or throws (transpose):
// the worker treats both exactly like the JS decoder failing, and
// falls back to it. WebAssembly unavailable, a missing asset, a
// corrupt dictionary — all land on the JS path.
import { TRANSPOSE_COLUMNS } from "./catalog-core.js";
import wasmUrl from "./tcb1-decoder.wasm?url";

const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true });

// Output selectors, mirroring the OUT_* constants in the Rust source.
const OUT = {
  idBytes: 0, idOff: 1, titleBytes: 2, titleOff: 3,
  creator: 4, year: 5, coll: 6, fmt: 7, rights: 8, dl: 9,
  freshBlob: 10, freshDesc: 11,
};

// Test seam: node-side parity harnesses inject the .wasm bytes here
// (they cannot fetch the vite asset URL). Production never calls
// this; the default source fetches the emitted asset.
let wasmSource = null;
export function setTcb1WasmSource(fn) {
  wasmSource = fn;
}

async function defaultSource() {
  const res = await fetch(wasmUrl);
  if (!res.ok) throw new Error(`tcb1 wasm fetch ${res.status}`);
  return res;
}

let exportsPromise = null;
function loadExports() {
  if (exportsPromise) return exportsPromise;
  exportsPromise = (async () => {
    try {
      if (typeof WebAssembly === "undefined") return null;
      if (wasmSource) {
        const bytes = await wasmSource();
        const { instance } = await WebAssembly.instantiate(bytes, {});
        return instance.exports;
      }
      const res = await defaultSource();
      try {
        const { instance } = await WebAssembly.instantiateStreaming(res, {});
        return instance.exports;
      } catch {
        const buf = await (await defaultSource()).arrayBuffer();
        const { instance } = await WebAssembly.instantiate(buf, {});
        return instance.exports;
      }
    } catch {
      return null;
    }
  })();
  return exportsPromise;
}

// Copy one output array out of linear memory. memory.buffer is read
// AFTER the producing call — a call may grow memory, detaching the
// previous buffer.
function copyOut(ex, which, Ctor) {
  const ptr = ex.tw_out_ptr(which);
  const len = ex.tw_out_len(which);
  const view = new Ctor(ex.memory.buffer, ptr, len / Ctor.BYTES_PER_ELEMENT);
  return view.slice();
}

function writeInput(ex, bytes) {
  const ptr = ex.tw_alloc(bytes.byteLength);
  new Uint8Array(ex.memory.buffer, ptr, bytes.byteLength).set(bytes);
}

export async function createWasmTcb1Session(dictBytes, expectedCount = 0) {
  const ex = await loadExports();
  if (!ex) return null;
  try {
    writeInput(ex, dictBytes);
    if (ex.tw_dict_load(dictBytes.byteLength) !== 0) return null;
    if (ex.tw_session_new(expectedCount >>> 0) !== 0) return null;
  } catch {
    return null;
  }

  const session = {
    // Transpose one raw shard. Throws on any decoder error (the
    // worker maps that to the same failure stage as a JS decode
    // error) and on a shard-index mismatch, mirroring the check the
    // worker performs on the JS path.
    transposeBytes(bytes, pageCursor, expectIndex) {
      writeInput(ex, bytes);
      const rc = ex.tw_transpose(bytes.byteLength, pageCursor | 0);
      if (rc !== 0) throw new Error(`tcb1 wasm: transpose failed (${rc})`);
      if (ex.tw_out_shard_index() !== expectIndex) {
        throw new Error("shard index");
      }
      const freshBlob = copyOut(ex, OUT.freshBlob, Uint8Array);
      const desc = copyOut(ex, OUT.freshDesc, Uint32Array);
      const fresh = {};
      let p = 0;
      for (const [key] of TRANSPOSE_COLUMNS) {
        const cnt = desc[p++];
        const arr = new Array(cnt);
        for (let k = 0; k < cnt; k++) {
          const tag = desc[p];
          const a = desc[p + 1];
          const b = desc[p + 2];
          p += 3;
          arr[k] =
            tag === 0
              ? null
              : tag === 2
                ? a | 0
                : textDecoder.decode(freshBlob.subarray(a, a + b));
        }
        fresh[key] = arr;
      }
      return {
        n: ex.tw_out_n(),
        idBytes: copyOut(ex, OUT.idBytes, Uint8Array),
        idOff: copyOut(ex, OUT.idOff, Uint32Array),
        titleBytes: copyOut(ex, OUT.titleBytes, Uint8Array),
        titleOff: copyOut(ex, OUT.titleOff, Uint32Array),
        codes: {
          creator: copyOut(ex, OUT.creator, Uint32Array),
          year: copyOut(ex, OUT.year, Uint32Array),
          coll: copyOut(ex, OUT.coll, Uint8Array),
          fmt: copyOut(ex, OUT.fmt, Uint8Array),
          rights: copyOut(ex, OUT.rights, Uint8Array),
          dl: copyOut(ex, OUT.dl, Uint8Array),
        },
        fresh,
      };
    },
    resetTo(serverCursor) {
      ex.tw_reset_to(serverCursor | 0);
    },
    stats() {
      return {
        retainedBytes: ex.tw_stats_retained(),
        indexBytes: ex.tw_stats_index_bytes(),
      };
    },
    dispose() {
      try {
        ex.tw_session_free();
      } catch {
        // A dead module needs no cleanup; the fallback covers it.
      }
    },
    get count() {
      return ex.tw_count();
    },
  };
  return session;
}

// Byte-exact payload comparison for the worker's shard-0 runtime
// cross-check: every typed array byte-identical, every `fresh` value
// identical under Object.is (so number/string/null types and the
// string values themselves must all agree).
export function tcb1PayloadsEqual(a, b) {
  if (!a || !b || a.n !== b.n) return false;
  const bytesOf = (arr) =>
    new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  const arrays = [
    "idBytes", "idOff", "titleBytes", "titleOff",
  ];
  for (const key of arrays) {
    const x = bytesOf(a[key]);
    const y = bytesOf(b[key]);
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  }
  for (const key of Object.keys(a.codes)) {
    const x = bytesOf(a.codes[key]);
    const y = bytesOf(b.codes[key]);
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  }
  for (const [key] of TRANSPOSE_COLUMNS) {
    const x = a.fresh[key];
    const y = b.fresh[key];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) {
      if (!Object.is(x[i], y[i])) return false;
    }
  }
  return true;
}
