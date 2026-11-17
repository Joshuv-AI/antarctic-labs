# Tower kernels — Rust/WebAssembly counting + allocation ports

Rust ports of the Tower of Babel library's counting/derivation
engine and helix reshape-allocation math (Tower Rust/WASM phase,
2026-11-16; INVENTORY line 66), compiled to WebAssembly and driven
from `src/lib/tower-kernels.js`:

- the faceted-count derivation in `src/pages.jsx`
  (`facetCountSteps`: bitset AND/popcount, bucket-mask and
  era-mask word builders, the era and lane/subcategory tallies);
- the result scan in `src/lib/filter-engine.js`
  (`startFilterScan`'s predicate walk over the display order);
- the reshape allocation math in `src/lib/helix-scene.js`
  (`allocateStations` / `allocateStationsArr` /
  `allocateStationsGroup`).

Exact parity is the hard requirement, and it is verified, not
sampled: the phase harness compares the kernels against the
production JS AND an independent reimplementation over the real
2,557,923-record catalog derivation (era 1990–2009 = 542,487;
Law × 1990–2009 = 520,002; Law × pre-1994 eras = true zeros), all
61 Books shelves and six curated groups' allocations, 1,400+
randomized allocation arrays, and element-for-element scan
outputs in identity and shuffled orders. Allocations run the
identical f64 expression trees as the JS; bitset kernels mirror
JS typed-array indexing element-for-element (including the
byte-per-record member operand the hub-Set fallback produces).
Where JS semantics would throw (an out-of-range era code in a
tally), the kernel reports a divergence code and the wrapper
falls back to the JS slice, which reproduces the throw — a
kernel can never silently change an outcome.

Every JS implementation is RETAINED as the fallback: the wrapper
resolves to null on any load/instantiate failure and every call
site then runs the JS path exactly as before the port (proven in
the harness by forcing corrupt bytes and a throwing source, and
in the browser by aborting the .wasm request).

Memory discipline: inputs cross into a per-call arena (reset on
every call) or into job-scoped staging slots (facet jobs slots
0–7, scan jobs slots 8–15; a job's staged arrays are snapshots of
that job's own inputs, replaced by the next job of the same
kind — both engines are latest-only, one job in flight per
kind). Linear memory is bounded by the largest job's staged set
(≈11–12 MB at the 2.56M-record scale) and flat across repeated
jobs; nothing accumulates per interaction.

## Files

- `src/lib.rs` — the kernels + the raw FFI surface (`tk_*`
  exports; the ABI is documented in the file header).
- `../tower-kernels.wasm` — the compiled artifact, **committed**:
  the Cloudflare Pages build has no Rust toolchain, so (like
  `tcb1-decoder.wasm`) the binary ships in the repo and vite
  serves it as a static asset. Deterministic: rebuild with
  `build.sh` and the bytes reproduce from this source.
- `build.sh` — rebuilds `../tower-kernels.wasm` (rustup +
  wasm32-unknown-unknown; in the agent VM the toolchain lives
  under `~/workspace/toolchains/rust`).
- `Cargo.toml` — cdylib crate, no dependencies.
