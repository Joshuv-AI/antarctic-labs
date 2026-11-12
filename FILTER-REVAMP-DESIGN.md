# Tower of Babel — Filter Section Revamp: Research + Design Note

Written 2026-11-11 (EST), before implementation, per Joshua's order: full
100% redo of the library filter section — look AND function — industry-grade
underneath, simple on the surface. Builds on the 2026-10-27 periodic-table /
faceted-filter study (`~/workspace/research_notes/periodic-table-faceted-filter-research-20261028-0219/`)
plus a fresh first-hand research leg (below).

## 1. What the current filter section actually is (audit of the code)

- One collapsible panel above the results holding TWO different two-level
  systems with identical chip styling, so category vs subcategory is
  genuinely ambiguous:
  1. "COLLECTIONS · subject" — curated sets from the hub index (Sacred
     traditions / Authors / Declassified programmes / Course primary
     sources), group tabs → collection subchips with counts.
  2. "FORMAT · form" — actually the catalog `collection` lanes (Papers,
     Law, Books, …) → subcategory subchips with counts. The axis is
     misnamed: the lanes are not formats (the catalog's real `format`
     field is uniformly TXT — see §3).
- Subcategory rows carry a `↳` glyph (`.tower-subchip::before`) — Joshua
  explicitly wants it gone.
- The category cells are tall grid cards (min-height 58px) — the "bulky"
  footprint he flagged.
- Taxonomy (`src/lib/tower-taxonomy.js`) predates the November expansion:
  no LAW lane at all (49.9% of the library has NO subcategory and renders
  with the raw code "LAW" as its label), REFERENCE has no subcategories,
  and PAPERS' "Physics, Math & Computing" is really just arXiv.
- State is single-select per axis (`bucketFilter` = "" | lane | "LANE:sub";
  `collKey` for one curated collection). Filter application is a linear
  counting scan over the resident catalog order in a memo — at 2.56M
  records that scan, plus the results re-render it triggers, is the
  option-selection delay Joshua feels. Server search
  (`/api/catalog-search`) accepts q/collection/bucket/format/cursor only.

## 2. Research leg — first-hand findings

### banned-books.org (live site, read 2026-11-11)
- Four flat browse axes — country, author, book, reason — plus ranked
  lists; no deep hierarchy anywhere.
- Every landing carries a stat strip (books / countries / ban records):
  counts as orientation and trust, stated before any list.
- Each facet value gets a definition page: a one-line definition, the
  counts, a ranked list, and an FAQ that states the methodology and the
  ranking rule (e.g. Top-100 ranked by geographic spread, with the
  tiebreaker and the bias it guards against, explained in plain words).
- Coverage honesty is printed on the lists themselves ("coverage is
  uneven and skewed toward countries with systematic reporting") — gaps
  are shown, never papered over.
- Book pages compress the record to one line — "1 country · 1 recorded
  ban · 1 still active" — with reason tags; detail expands from there.
- Doorways are ranked lists with honest one-line descriptions ("Most-read
  book pages in the last 7 days"), each a "View top 50 →" link.

### Open Library search (live, read 2026-11-11)
- Facet panel titled "Zoom In — Focus your results using these filters":
  groups Language / Author / Subjects / First published / Publisher /
  People / Places / Times. Groups lazy-load their values (with counts)
  without blocking the results; the result count ("1–20 of 726,898")
  and sort sit above the list, always visible.

### PubMed search (live, read 2026-11-11)
- Left filter rail led by "Results by year": the year facet is a
  distribution (a count per year, rendered as a timeline), not a bucket
  list — the shape of the data is visible before you choose.
- Governed vocabulary (MeSH) does the subject work; filters restate as
  removable query terms; the total result count is always on screen.

### From the October study (still binding)
- Counts are aggregations with multi-select semantics (Europeana/Solr):
  a facet's counts are computed against all OTHER facets' selections.
- Budget: median filter interaction ~100ms, p99 < 1s (NN/g; HathiTrust's
  Solr median is 90ms at >5M volumes).
- Ration the vocabulary: ~5–6 values visible per facet + "show more"
  (VuFind production), general facets before specific, selected filters
  as removable pills + Clear All, designed recovery from zero results.
- Two independent axes crossed beat one tree; position should imply
  metadata; empty slots typed and visible, never silently hidden;
  chunk to ≤ ~4–7 per level; stability of familiar labels over purity.
- Subcategory presentation in best-in-class UIs is typographic, not
  iconic: second-level rows are indented under their parent, set in a
  smaller size and lighter weight, with the count right-aligned in a
  muted tone; the parent row itself carries the expand/collapse state.
  No decorative glyphs do the hierarchy work (NN/g: predictable labels
  matter more when values sit behind an accordion).

## 3. Data audit — what the real catalog can support (2,557,923 entries)

Source: the live catalog index (all 10 chunks, version 40d21123360fe84e,
fetched 2026-11-11) + `public/tower-hubs-index.json` (2026-11-10
snapshot, totals identical). Every entry carries exactly 8 fields:
artifact_id, title, creator, year, collection, download_status,
rights_status, format.

- Collections (exact): LAW 1,277,197 (49.9%) · PAPERS 1,130,210 (44.2%) ·
  BOOKS 81,631 · REFERENCE 41,137 · DECLASSIFIED 26,294 · PODCASTS 1,091 ·
  DOCUMENTS 363.
- `format` is uniformly TXT → NO format axis (a one-value facet is a
  fake category).
- `rights_status` is dominated by CC_BY / PUBLIC_DOMAIN / CC0 / CC_BY_SA
  (+ EXTERNAL_SOURCE = the podcasts) → no rights axis in the UI (it is a
  legal facet, not a reader doorway; inventing reader-facing slices here
  would mislead).
- `year` is present on the overwhelming majority (missing on a small
  residue) and spans antiquity to 2026 → an ERA axis is real: century /
  period buckets with real counts, ordered chronologically (position =
  time, per the periodic-table lesson). PubMed's distribution-first
  year facet is the model; buckets keep it to one tap.
- There is NO language, country, or subject field in the projection →
  no such axes may be shown. (This is exactly where the future
  censorship axis — banned-where / banned-why / still-banned — plugs in
  when its data layer ships: the model below reserves it a slot.)
- Subcategory raw material is the artifact_id prefix (source lane),
  deterministic and already the classifier's basis. The taxonomy tables
  in §4 are built from the full per-collection prefix audit; coverage is
  reported per collection, and "Other" is kept small and honest.

## 4. The new taxonomy (full-catalog coverage)

Method: all 10 live catalog-index chunks (2,557,923 records) counted
directly (collections, id prefixes, years), then the site's own
classifier run over every record for exact bucket coverage, before and
after. A parity harness enforces the invariant the server search
depends on: **no record that already had a subcategory may change it**
(the R2 facet products were built with the current taxonomy and rebuild
only on the publish cycle). New subcategories are added only where
records previously had none (LAW, REFERENCE); searches under those new
subcategories route to the client pipeline — the same treatment curated
collections already get — until the next meta rebuild, so counts and
results can never disagree.

### LAW — 1,277,197 (49.9%) — was: NO subcategories, label was raw "LAW"

Three federal sources, cleanly separable by id — 100% named, 0% Other:

| Subcategory | Records | Share |
|---|---|---|
| Federal Register | 1,008,664 | 79.0% |
| Code of Federal Regulations | 217,658 | 17.0% |
| U.S. Code | 50,875 | 4.0% |

(Deeper CFR-title / FR-year splits exist in the ids but are not
surfaced: three clear doorways beat thirty cryptic ones; era carries
the time dimension.)

### PAPERS — 1,130,210 (44.2%) — keys kept, one label corrected

| Subcategory | Records | Share |
|---|---|---|
| Biomedicine & Life Sciences (Europe PMC + PubMed Central) | 576,300 | 51.0% |
| arXiv preprints — all fields | 526,227 | 46.6% |
| PLOS journals | 19,473 | 1.7% |
| Energy research (Dept. of Energy) | 4,306 | 0.4% |
| Space & aeronautics (NASA) | 1,320 | 0.1% |
| Other papers | 2,584 | 0.2% |

99.8% named. arXiv ids carry no subject, so a subject split would be
fabricated; the honest axis is source/programme. The old arXiv label
"Physics, Math & Computing" was wrong for a general preprint archive
and is corrected; keys unchanged (server parity).

### REFERENCE — 41,137 — was: NO subcategories

| Subcategory | Records | Share |
|---|---|---|
| Encyclopædia Britannica (1911) | 16,578 | 40.3% |
| Jewish Encyclopedia | 12,943 | 31.5% |
| Catholic Encyclopedia | 11,541 | 28.1% |
| Dictionaries & other reference | 75 | 0.2% |

99.8% named. Readers look these works up by name; the subcategories
are the works.

### BOOKS — 81,631 — stated honestly

Verified sacred-text and philosophy prefix sets classify 1,082 records
exactly; the rest sit in the lane's main body, "Literature & Classics".
November-wave book ids are title slugs — the id space does not encode
subject, and guessing subjects from titles at filter time would be
fabrication. Subject doorways for books live where they are curated
and true: the Curated collections axis (world scripture traditions,
Stoicism, course lists) and Browse the stacks.

### DECLASSIFIED — 26,294 · PODCASTS — 1,091 · DOCUMENTS — 363 (unchanged, verified)

Declassified: Congress & Public Laws 33.3% · CIA 26.5% · State Dept.
22.2% · United Nations 12.2% · NSA 1.4% · FBI 0.5% · Other releases
3.9% (96.1% named). Podcasts: 100% named by show. Documents: Founding
84.0% · Trials 6.9% · Patents 2.2% · Other 6.9% (25 records).

### Era — from the year field (97.3% of records carry one)

Before 1500: 293 · 1500s: 246 · 1600s: 481 · 1700s: 545 · 1800s: 7,411 ·
1900–1945: 54,638 · 1946–1989: 6,286 · 1990–2009: 542,487 · 2010s:
340,031 · 2020s: 1,537,157 · date unknown: 68,346 (2.7% — not a chip;
visible by subtraction from the counts).

### Residual "Other" contents — named, not silent

Every "Other" bucket in the shipped taxonomy, with its actual contents
(counted record by record from the audit baseline):

- **PAPERS:other — 2,584 (0.2%).** A pure long tail: the largest
  single source family in it has 3 records (dawson-woodward,
  bideford-witches, osborn-hesperopithecus); everything else is 1–2
  records. No real subcategory is hiding in it.
- **DECLASSIFIED:other — 1,014 (3.9%).** govdocs-archive 996 (98% of
  it: the Internet Archive's mixed-agency US government documents
  collection — mixed by nature, so "Other Releases" is the honest
  label), pentagon-papers 3, and a handful of single records.
- **DOCUMENTS:other — 25 (6.9% of a 363-record lane).** All
  singletons (hendershot-1928, airship-wave, phantom-airships, …).
- **REFERENCE:other — 75 (0.2%).** The classic dictionaries:
  Appletons' Cyclopaedia, Smith's and Hastings' Bible dictionaries,
  ISBE 1915, Encyclopaedia Biblica, Littré, Johnson, Webster,
  Chambers, Kitto, Roget — labeled "Dictionaries & Other Reference".
- **LAW:other — 0 records.** The catch-all exists so a future lane
  can never fall out of the taxonomy; with a zero count it is not
  rendered.
- **PODCASTS:other — 0 records** (the one PowerfulJRE upload folds
  into Joe Rogan, its own show).
- **BOOKS has no "Other" bucket** — its general body is the named
  category "Literature & Classics" (see above).

### Axes deliberately NOT built

Format (uniformly TXT — a one-value facet is a fake category) · Rights
(real — Public Domain 56.0%, CC BY 43.7%, CC0, CC BY-SA — but a legal
facet, not a reader doorway; stays in the API) · Language / country /
subject (no such fields exist — not shown, not faked).

## 5. The new filter model

State (unchanged contracts, one addition):
- `bucketFilter`: "" | lane | "LANE:sub" — as today.
- `collKey` / `collGroup`: one curated collection — as today.
- `eraFilter` (NEW): "" | era id. Single-select, composes with both
  axes above (AND semantics), exactly like the bucket filter.
- Sort and view mode: unchanged, stay in the toolbar.

Axes in the panel, general → specific (NN/g order):
1. **Collections** (the catalog lanes — renamed from the misleading
   "FORMAT"): category rows; the active category expands its
   subcategory rows inline beneath it.
2. **Curated collections** (traditions / authors / programmes / course
   sets): group tabs, then the group's collections as subcategory-style
   rows. Authors (50) get show-more (top 10 + "Show all").
3. **Era**: one row of chronological period chips with counts,
   including an honest "Date unknown" is NOT offered as a chip (unknown
   is not an era; those records simply don't match an era selection —
   and the counts make the residue visible by subtraction).
4. **Censorship** (future): reserved slot in the axis registry — the
   axis list is data-driven (`FILTER_AXES`), so the censorship axis
  registers as one more axis with no layout redesign. Not rendered
   until its data exists. No ban data is fabricated in this job.

Selection-latency fix (the old browse path re-scanned all 2.56M
records in catalog order on EVERY filter change, just to recount):
- Counts for every option are computed in derivation phase 0 (the
  existing sliced loop gains era counters via a new `__columnYearAt`
  column hook — no record materialization, no new pass over the
  catalog, no new resident arrays beyond one Uint8Array of era codes
  plus small count maps). Phase 0 also precomputes bucket×era
  intersection counts, so any bucket+era combination's result count is
  known in O(1).
- In the browse path (no query, no curated collection), the result
  count now comes from those precomputed counts instead of the scan,
  and the scan early-exits once the visible window's ranks are
  materialized — a filter change costs a shallow prefix walk instead
  of a full-catalog recount.
- The filter panel itself stops causing layout work per tap: rows are
  fixed-height, expansion is inline (no panel reflow surprises), and
  the anchor-restore scroll dance is retired with the old panel.
- Cross-facet contextual counts (Solr-style) are deliberately NOT
  faked: at 2.56M resident records the honest, fast equivalent is
  global counts on options + the exact live result count in the
  results heading, which already updates per selection.

## 6. Look & feel (Joshua's requirements, verbatim-driven)

- **Low profile.** Collapsed, the whole section is a slim bar (~44px):
  "Filters" + the active-selection summary + Clear. Expanded, axes are
  compact rows — label column + wrapping chips at 30px — not tall
  cards. The panel is a hairline-bordered, transparent sheet, not a
  raised block.
- **Apple-like palette, native to the page.** The library page is a
  warm dark surface (#161510) with warm off-white ink (#ede7d7) and
  muted warm gray (#b7b09d). The new panel uses ONLY those tones:
  hairline rgba(245,242,236,.14) borders, translucent white washes at
  4–6% for hover, and ONE accent — the site's own cyan (#2aa5c4) —
  reserved for the active state and focus rings. No amber chevrons,
  no contrasting blocks, no new hues.
- **No glyphs.** The `↳` subcategory marker is removed. Hierarchy is
  carried by structure: subcategories indent under their category,
  set one size smaller and one weight lighter, counts right-aligned
  in muted mono. Category labels are full-strength; subcategory
  labels are visibly second-level by type alone.
- **Obvious category vs subcategory.** Categories are rows (label +
  total count + chevron-free expand state shown by the open sublist);
  subcategories are the indented sublist. The two levels never share
  a visual style.
- All new CSS is scoped under `.tower-filters2` — no shared chip rule
  is touched, so nothing outside this section can regress.

## 7. Browse the stacks (doorways)

- Cards keep their cover collage + label, and now always carry the
  real count from first paint (seeded static totals, then the live
  derivation — never a partial-catalog number presented as final).
- Each shelf panel's doorway is explicit: "See all N works ›" with
  the live count in the button, applying that stack's bucket filter
  and scrolling to the filtered results (existing `browseTo`). While
  a sub-bucket count is still settling it reads "See all ›" — an
  unsettled number is never printed.
- The LAW stack's real sub-doorways (Federal Register / CFR / U.S.
  Code) live in the filter panel's Collections axis, one tap from the
  shelf's filtered results; the LAW shelf's own groups keep drilling
  by code title, as before.

## 8. Performance & safety gates

- No change to the load path: no new fetches at page open, no second
  index, no unbounded caches. Era derivation rides phase 0's existing
  sliced loop (+1 Uint8Array ≈ 2.6MB at full catalog).
- Era composes through the same client-pipeline boundary as hub
  filters in server mode (`serverActive` excludes era selections; the
  deferred search layer builds on first need) — the server API is
  untouched.
- Full `npm run build` locally before push; scoped CSS verified on the
  landing + library pages, desktop and mobile widths, zero JS errors.
