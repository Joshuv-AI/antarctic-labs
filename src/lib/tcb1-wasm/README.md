# TCB1 WebAssembly decoder

Rust port of the TCB1 browse-dataset transpose session
(`src/lib/tcb1.js`: `parseTcb1Dict` + `createTcb1Session`), compiled
to WebAssembly and driven from `src/lib/tcb1-wasm.js` behind the exact
payload contract the JavaScript session fulfills. Joshua ordered the
port on 2026-11-13 for processing speed and lower transient memory
during the phone catalog stream; the download bytes are unchanged
(same TCB1 dataset), and the JS decoder remains in place as the
automatic fallback — the worker cross-checks the two decoders on
shard 0 of every stream and abandons the WASM session on any
mismatch.

Byte parity is the hard requirement and is structural, not sampled:

- dedupe, the id index (FNV-1a, capacity and growth policy), the
  session-local dictionary numbering (creator counter interning,
  per-field translation tables, year interning by value with
  number/string/null kept distinct), the `fresh` lists and the
  reset contract all mirror the JS session operation for operation;
- string values cross the boundary as raw UTF-8 bytes and are
  decoded by the JS wrapper with the same `TextDecoder`
  (`ignoreBOM: true`) the JS decoder uses, so U+FEFF retention and
  U+FFFD normalization are the platform's own.

## Files

- `src/lib.rs` — the decoder + the raw FFI surface (`tw_*` exports;
  the ABI is documented in the file header).
- `../tcb1-decoder.wasm` — the compiled artifact, **committed**:
  the Pages build has no Rust toolchain. Rebuild with `./build.sh`
  (rustup + `wasm32-unknown-unknown` target) after any source change
  and commit the refreshed `.wasm` with it.
- `../tcb1-wasm.js` — the JS wrapper: module loading, the session
  adapter the browse worker consumes, and the payload-equality
  helper used by the worker's shard-0 cross-check.

No external crates: the crate is std-only, so a rebuild needs no
registry access.
