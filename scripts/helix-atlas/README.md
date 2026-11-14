# Helix atlas — true-representation bake (2026-11-13)

`public/helix-atlas.webp` (4096×4096, 16×16 cells of 256px) is baked
from REAL catalog entries — one entry per cell, from the cell's own
collection. Provenance for every cell (artifact_id, title, creator,
cover-vs-plate, source) lives in `scripts/helix-atlas-manifest.json`.

Cell pools by band (row-major cell index):
LAW 0–63 · PAPERS 64–127 · BOOKS 128–167 · REFERENCE 168–195 ·
DECLASSIFIED 196–219 · PODCASTS 220–239 · DOCUMENTS 240–255.
`src/lib/helix-scene.js` (BAND_DEFS) holds the same ranges and only
ever draws a band's panels from its own pool.

Pipeline (run in order; `WT` env points at a site worktree — the
scripts were run from the truerep run dir against the compact
catalog index shards + entry-records buckets of that worktree):

1. `sample.py` — deterministic per-collection sample from the
   compact catalog index (sorted artifact_ids, fixed stride):
   LAW 64, PAPERS 64, BOOKS 40, REFERENCE 28, DECLASSIFIED 24,
   PODCASTS 20, DOCUMENTS 16 → `sample-raw.json`, `buckets.txt`.
2. `resolve.py` — resolves each sampled entry's full record from the
   entry-records bucket files and applies the library's own cover
   rules (the `coverCandidates()` chain in `src/lib/tower-covers.js`:
   YouTube thumbs for podcasts, Gutenberg covers, Internet Archive
   images), downloading the real covers → `sample-resolved.json`,
   `covers/<artifact_id>.img`. Entries with no deterministic cover
   get a typeset plate of their real title + creator (the library's
   own fallback idiom) in the bake step.
3. `build_atlas.py` — bakes the atlas + manifest. Plate colors are
   sampled from the previous atlas's palette so the artwork family
   is unchanged; portrait covers are top-anchored (their title band
   survives the square cell).

Result of the 2026-11-13 bake: 256 cells — 64 real covers
(BOOKS 38/40, PODCASTS 20/20, DECLASSIFIED 6/24) and 192 typeset
plates of real entries (LAW / PAPERS / REFERENCE / DOCUMENTS have
no deterministic covers anywhere in the library's own system).
