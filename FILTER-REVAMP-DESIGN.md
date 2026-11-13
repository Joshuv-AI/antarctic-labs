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

## 9. Curated-collections follow-up (2026-11-11 evening — Joshua's orders 21:01 + 21:04 EST)

Joshua confirmed the revamp live and ordered three things: (1) remove
the Authors group from the Curated axis entirely; (2) complete the
remaining curated groups — rule-based over the full catalog, no
partial collections, residual gaps explicit and honestly labeled;
(3) add a small number of audience-keyed collections. Plus the
hierarchy rule: Collections is the surface axis; Curated is the
DEEPER layer beneath it, in presentation as well as order.

### 9.1 Method

Same audit method as §4, extended: all 168 full-record catalog shards
at HEAD (2,557,923 records, verified against count.json) were walked
locally with candidate rules; every rule change was verified against
captured/missed samples before being ported into
functions/_lib/tower-hubs.js. The regenerated hub index is the ground
truth below — audit predictions matched it exactly for programmes
(26,298), course (9/38/23), and Primary Sources (26,657); tradition
deltas of ±1–29 trace to named rule fixes made after the last audit
pass (the Ante-/Post-Nicene Fathers patterns, the Anglo-Saxon /
Icelandic saga patterns, Josephus) and are noted per line.

### 9.2 Removed: the Authors group

The group was not just broad, it was broken: the hub index caps each
author's stored work list at 500, so the group's 50 authors displayed
25,000 listed works against 888,150 true works by those authors —
the chip counts and the filter results could never agree. The SPA
group, its descriptors, and its mapping are deleted. Authors stay
reachable through search; the topAuthors data remains in the hub
index for the server-side author hub pages and the API, untouched.

### 9.3 Sacred traditions — before / after (hub-listed works)

| Tradition | Before | After | Note |
|---|---|---|---|
| Jainism | 6 | 6 | already complete — rules capture everything the signals find |
| Shinto | 6 | 6 | already complete |
| Zoroastrianism | 25 | 25 | already complete |
| Latter-day Saint | 92 | 92 | already complete |
| Sikhism | — | 16 | NEW — captures all 16 signal records exactly |
| Baháʼí | — | 6 | NEW — of 8 signal records: 1 comparative work sits in Christianity, 1 below honest pattern reach |
| Gnosticism & Hermeticism | — | 87 | NEW — Nag Hammadi, Hermetica, Mandaean, Manichaean |
| Norse & Germanic | — | 109 | NEW — Eddas, sagas, Anglo-Saxon chronicles |
| Celtic | — | 180 | NEW — Mabinogion, Arthurian, Taliesin |
| Esoteric & Occult | — | 646 | NEW — grimoires, alchemy, Theosophy, ceremonial magic |
| Buddhism | 108 | 126 | sutra patterns (with Hindu-sutra guards), Mahayana/Theravada/Zen terms |
| Hinduism | 115 | 138 | yoga, Kama Sutra, Grihya Sutras, Vivekananda |
| Taoism & Chinese Classics | 32 | 39 | the other Chinese classics (Mencius, Liezi, Xunzi, Mozi, Han Fei) |
| Islam | 108 | 118 | Ghazālī spellings, Kashf al-Mahjub, Rumi, Jabir/Geber, period terms |
| Judaism | 154 | 157 | Josephus, Hebraic |
| Egypt & Mesopotamia | 380 | 374 | net −6: Hermetic works moved to Gnosticism, their proper home |
| Indigenous & Folk Traditions | 416 | 408 | net −8: Norse/Celtic works moved to their own new traditions |
| Greek & Roman | 335 | 368 | Tacitus, Livy, Pausanias, Strabo, the Neoplatonists, Cicero ids |
| Christianity | 1,637 | 1,799 | Quaker, Christian Science, Methodism/Wesley, Unitarian, Aquinas, Dante, Lutheran confessions, the Nicene Fathers sets, and the (KJV) creator pattern (bare Bible books — Job, Joshua, Hosea — previously matched nothing) |
| More Sacred & Wisdom Texts | — | 1,233 | NEW — the labeled remainder (see 9.6) |
| **Total listed** | **3,414** | **5,933** | named traditions alone: 4,700 |

Dead curated pins found and repaired: five pins pointed at records
that no longer exist — tob-0004 (Bhagavad Gita), tob-10233
(Dhammapada), tob-10337 (Egyptian Book of the Dead) were replaced by
the live editions of the same works (judge-bhagavad-gita-1890,
tob-4314, tob-4053); tob-10229 and tob-10071 could not be identified
with any live work and were dropped.

### 9.4 Declassified programmes — completed

Before: 25,280 of 26,298 programme records were listed; 1,014
DECLASSIFIED records (the govdocs archive + famous one-off releases)
sat in NO collection, and 4 programme-prefix records in other lanes
were missed by the lane-gated walk. After: prefixes are tested over
all records, the Pentagon Papers (3) are their own collection, and
the unclaimed DECLASSIFIED records form a labeled catch-all, "Other
Declassified Releases" (1,011). CIA 6,978→6,980 · State 5,826 ·
Congress 8,754 · United Nations 3,206→3,207 · National Security
Archive 377→378 · FBI 139 · Pentagon Papers 3 · Other 1,011.
**Total: 26,298 of 26,298 — the group is complete by construction.**

### 9.5 Course primary sources — completed against the canon

Membership unit = the catalog's own CANON entries (60). Founding
documents was already complete (9/9) and is unchanged. Sacred &
wisdom landmarks went 5 → 38: every canon sacred entry whose work
exists in the catalog is now represented, including the two whose
pinned ids were dead while the works live under other ids
(Dhammapada → tob-4314; Diamond Sutra → tob-4230). Landmark works
went 21 → 23: its fallback mechanism already covered 15 of the 17
unpinned canon entries (verified by simulating the build); the two
genuinely missing works — Dryden's Aeneid and Shakespeare's complete
works — were added. One deliberate exclusion: the canon "jesus"
entry also resolves to a Catholic Encyclopedia article (REFERENCE
lane) — a reference article is not a course primary source, so the
course does not absorb it.

### 9.6 The remainder, honestly

"More Sacred & Wisdom Texts" (1,233 works) is a labeled remainder,
not a tradition: every BOOKS record no named tradition claims that
the site's own taxonomy shelves as a sacred text, plus records whose
title/tags carry a devotional signal (mysticism, comparative
religion, sermons, devotion). Sampled: the core is genuinely
religious (Underhill, Ruysbroeck, Kabir, James's Varieties of
Religious Experience); a thin tail is taxonomy quirk — the source
shelves every tob-* record as "sacred", including Tesla's writings
and Freud's Interpretation of Dreams. The blurb says what it is.
Residuals left in NO tradition, by design: 22 early-modern "philo"
wonder-books (EEBO bestiaries and natural histories — Topsell,
Jonston, Swan) that no tradition honestly claims, reachable through
the BOOKS subcategory. Scope boundaries: the REFERENCE religion
encyclopedias (Jewish Encyclopedia 12,943 articles, Catholic
Encyclopedia 11,541, Britannica 16,578) stay out of the traditions —
article-level encyclopedias, already first-class REFERENCE
subcategories; 41 of 1,091 podcast episodes carry religious signals
but are audio listings, not texts, and stay out.

### 9.7 New audience collections (Study shelves)

Each addition had to pass (a) real catalog mass, (b) a named
audience/use case, (c) not already served by the existing axes.

| Collection | Works | Audience | Why the axes don't serve it |
|---|---|---|---|
| Primary Sources | 26,657 | historians, journalists, students | the union of DOCUMENTS + DECLASSIFIED; the Collections axis is single-select, so the cross-lane shelf cannot be expressed |
| Philosophy | 1,573 | students, general readers | the BOOKS "philo" subcategory is a 41-record EEBO prefix set; the catalog's real philosophy — Plato to Russell, as subject tags, titles, and complete authorial shelves — had no home |
| Epics, Myths & Sagas | 226 | students, general readers | the epics are scattered across six traditions and several BOOKS subcategories; no existing filter gathers them |
| Classics of Science | 349 | engineers, researchers, students | the science classics sit inside BOOKS literature with no subcategory; PAPERS is modern research, not Darwin/Huxley/Lyell |

Rejected candidates, with reasons: a founding-documents collection
(≈ the DOCUMENTS founding subcategory, 305 — one tap away already);
a world-scriptures union (= the BOOKS sacred subcategory); the
complete declassified file (= the lane itself); a philosophy &
esoteric merged shelf (= the BOOKS philo subcategory); landmark
science via canon pins (too thin — superseded by the rule-based
shelf). Surname rules are precision-checked (Alfred Russel Wallace,
not Lew or Edgar Wallace; Isaac Newton, not John Newton; Thomas
Huxley, not Aldous) — an early loose-creator draft of the science
shelf held 488 works, of which ~139 were other men's books; the
shipped shelf is the honest 349. The philosophy shelf deliberately
exceeds its title/tag signal (1,193) because it carries complete
authorial shelves (1,573). Science's broad-signal residue (~174) is
mostly "evolution" in literary, political, and theological senses —
sampled and confirmed not science.

### 9.8 Hierarchy (Joshua 2026-11-11 21:04)

The Curated axis now carries the tf2-axis--deep treatment, in the
panel's own vocabulary: the axis is indented behind a left hairline,
its label is quieter (500 weight, dimmed), and its group tabs sit in
the subcategory register (11px, 400 weight, thinner borders, 27px)
while the active state keeps the full cyan. Within the axis, the
Study shelves render last — the deepest cut. Collections and Era are
untouched; the panel, counts, pills, and clear-all behave exactly as
shipped.

### 9.9 Pipeline

All counts flow through the same phase-0 hub-index pipeline as the
rest of the panel (displayed count = list length = filter set size,
by construction). The hub index grew 11.2 MB → 16.9 MB (Primary
Sources' 26,657 records are most of it) — still under the 25 MiB
Pages per-file cap. public/api-collections.json was regenerated in
the same push, per the pipeline rule.

## 10. Filter performance & stability fix (2026-11-11 night — Joshua's screen recording, 22:37 EST)

### 10.1 The report

Joshua's recording (iPhone Safari, Low Power Mode, 10% battery):
tap through filter options quickly, changing selections while the
previous one is still applying. Symptoms, frame-checked: slow result
application; visible tearing ~7–18 s in (overlapping copies of the
panel and rows, counts flickering through partial values); the
viewport yanked to a different position mid-switch; at ~19 s a
WebKit tab kill ("This webpage was reloaded because a problem
occurred") and a from-scratch reload. Worst across the big lanes
(Papers/Law) combined with era chips and curated groups.

### 10.2 Diagnosis (code evidence; measured numbers in §10.4)

The browse filter ran synchronously inside the results `useMemo` in
pages.jsx, on the main thread, per render — and three properties of
that pass made it explode under rapid switching at full scale:

1. **Record materialization in the hot loop.** With a curated
   collection selected, the precomputed-count fast path is disabled
   (`knownCount` is null whenever `collSet` is set), so the memo
   walked the ENTIRE sort order (2,557,923 entries) on every click.
   The collection predicate itself was
   `collSet.has(artifacts[i].artifact_id)`: `artifacts` is a Proxy
   view over the column store, so each step allocated a
   `ColumnRecord`, decoded the id's UTF-8 bytes into a fresh string,
   and hashed it into the Set. The row-window walk in
   LibraryResults (`visibleIndices`) repeated the same
   Proxy+decode+hash per step. Per click: millions of short-lived
   allocations on the main thread.
2. **No latest-wins discipline.** Filter state, header count, panel
   counts and rows were recomputed by different memos/effects at
   different times (phase-0 derivation per stream publish, the rank
   memo per render, the window walk per render). During a tap storm
   — and during streaming, when a new catalog prefix publishes every
   ~2 s and restarts all of it — the screen routinely showed pieces
   of different filter states at once: that is the tearing and the
   garbled, flickering counts. Interrupted React renders discarded
   and restarted the synchronous memo work, multiplying it.
3. **Scroll anchoring fired per intermediate render.** The
   2026-10-28 anchor records the panel's viewport offset at tap time
   and corrects once, on the first layout effect that runs. With a
   storm's worth of intermediate commits (subcategory rows mounting
   when the hub data landed, result-window pitch re-measurement,
   stream publishes), later height changes landed after the anchor
   was spent — the viewport moved under the user's finger: the
   bounce.
4. **The crash is the sum.** A ~1–2 GB resident catalog (column
   store + baked orders + derivation arrays) plus per-click churn of
   millions of objects (memo Maps, decoded id strings, record
   wrappers) across a storm = GC pressure spikes on a memory-capped
   phone tab in Low Power Mode → jetsam kill. Contributing: the
   16.9 MB hub-index JSON parse on the main thread ("Loading
   collections…" in the recording) queued behind the saturated main
   thread and landed mid-storm as one more multi-second task.

### 10.3 The fix (performance/stability only — design, axes, counts
semantics and the parity invariant unchanged)

- **Filter engine (new, lib/filter-engine.js):** a filter selection
  is computed ONCE per (selection, sort order, catalog length) into
  a committed result object `{key, indices: Uint32Array, count}` —
  the full match list in display order. The scan reads only typed
  arrays: per-record bucket CODES (a Uint16 dictionary encoding of
  the existing bucketKeys, built once and then extended
  incrementally over stream prefixes, like phase 0 itself), the
  existing eraCodes, and a membership BITSET for the selected
  curated collection (built once per collection+catalog length from
  the phase-0 id index — ~26k lookups worst case, vs 2.56M
  string-hash probes per click before). No record is materialized,
  no id is decoded, no string is hashed inside the scan.
- **Chunked + latest-wins:** the scan runs in ~7 ms slices with a
  generation token. A newer selection (or a newer catalog prefix)
  supersedes the running job at the next slice boundary; a
  superseded job never commits. Header count, active summary and
  rows all render from the single committed object, so the screen
  can never show pieces of two filter states at once (the previous
  committed state stays, coherent, until the new one lands —
  keep-previous-data, atomically swapped).
- **Zero-scan fast paths:** no predicates at all commits the sort
  order itself; repeat selections hit the committed cache.
- **Row rendering:** LibraryResults takes the committed index list
  directly (browse branch) — the Proxy/decode window walk is gone;
  the rank map is built for the visible window only (≤ rowBudget id
  decodes, as before).
- **Scroll anchor, completed:** the anchor recorded at tap time now
  carries the selection the tap produces and keeps correcting on
  every render until that selection's own committed result lands
  (2.5 s safety expiry), so height changes from hub-data arrival
  and the results commit itself are corrected too, not just the
  panel's first re-render.
- The search (blended) pipeline, the server-search path, counts,
  taxonomy and membership rules are untouched; the engine feeds
  exactly the two browse branches of the results memo, with the
  same outputs (rankMap / matchCount / row window).

### 10.4 Verification (phone-class profile: Chromium, 390×844,
CPU throttled 6×, full 2,557,923-record catalog resident from the
production fingerprint data; storm = 20 taps at ~120 ms across
Collections × Era × Curated incl. Papers/Law and Primary Sources)

Baseline harness note: the "before" build blocked the main thread
so hard that only 2 of 20 automated taps could even land through
the driver's stability waits (the two that landed committed at
~1.7 s per application) — the "after" runs use an in-page tap
driver (real taps queue the same way), so their per-tap numbers
are conservative against the baseline, not flattered by it. The
harness serves the catalog from a disk mirror of the production
fingerprint build (the browse worker fetches its pages from the
production origin; the first harness version only mirrored the
preview origin and the stream secretly ran over the slow egress
proxy — that stall was the harness's, not the app's).

Settled counts were verified against ground truth computed
independently from the mirrored data (collection lane x era from
the record year, deduped by id): Papers 1,130,210 · Law 1,277,197 ·
era 1700s total 545 · Papers x 1700s = 10 · Law x 1700s = 0 — the
engine's committed counts match exactly. The old code's transient
"Papers x 1700s = 1,784" exceeded the era's own 545 total: one of
the garbled counts from the recording, produced by the accumulated
precomputed-count map drifting from the arrays. With the engine,
the header count is the committed scan's own count, so a count
that disagrees with the listed rows cannot be produced.

| Measure (storm window) | Before | After |
|---|---|---|
| Taps landed (of 20) | 2 (rest timed out on a blocked UI) | 16 (4 misses were rows still mounting during the one-time hub-index load; each verified clickable in isolation) |
| Time for the storm to fully settle | 62.1 s, ending broken (no results header rendered) | 49.3 s / 51.9 s (two runs), ending in the correct cleared state |
| Main-thread blocking, storm window | Multi-second stretches; 2,165 long tasks / 223.8 s across load+storm | 247-279 long tasks / 35.8-38.9 s; max single task 4,486 -> 3,821 ms |
| Filter application latency (tap -> header commit) | ~1.7-3.4 s for the 2 taps that landed | ~0.1-2 s per commit (median ~0.8 s) at the same throttle |
| Scroll while parked at 2,600 px | Yanked to 113 and left there (2,487 px) | Run 1: parked position preserved exactly (2,600). Run 2: +587 px drift during settle (browser scroll anchoring against hub-load growth + window re-measure) |
| Tab crash / error text | Failure class reproduced (UI collapse) | No crash, zero JS errors, clean final state in both runs |
| JS heap (CDP), settled -> post-storm | not captured (harness v1) | ~189-206 MB -> ~227-229 MB (+21-40 MB, inside the 60 MB budget) |
| Full-catalog load soak (same profile) | 476 s wall, completes at 2,557,918 resident | 469-625 s wall (variance = shared-box contention), completes at 2,557,918 in every run |

Residuals, honestly stated: (1) the storm's largest remaining
blocks are one-time loads landing mid-storm — the 16.9 MB hub-index
fetch + parse + collection build (~4 s at this throttle) that the
first curated tap can trigger, and the baked sort-orders landing —
not filter computation; on a real visit the approach trigger
usually completes the hub load before the first tap. (2) Scroll
position is far better protected than before but not perfectly
pinned in the harness when the hub load lands mid-storm; the
results window's own re-measure and the browser's scroll anchoring
also move the numeric position while keeping content stable.
(3) One intermediate stale-count commit from the pre-first-commit
fallback (the accumulated precomputed counts) can still flash
before the engine's first commit for a selection lands; it
self-corrects to the scanned truth in ~1.5 s and cannot persist.

### 10.5 Gate

Joshua's phone retest of the exact repro (rapid tapping across
lanes/eras/curated groups, Low Power Mode included) is the final
gate, per the standing rule.

## 11. Loading-state fix (2026-11-12 — Joshua's screenshot, 12:07 EST)

Joshua's screenshot, taken seconds after opening the Tower page on his
phone: Era = 1500s selected, header "208 OF 20000 ENTRIES", a long row
of faint "0000…" glyphs overflowing the right edge of the results
region, no result cards anywhere, and a Load More button claiming
"SHOWING 50 OF 208". His note: the revamp "feels much better… but it
still feels like the results are loading slow." Diagnosis first,
reproduced in the harness (bootstrap-only residency held at exactly
20,000 records, Era=1500s applied, stream then released) before any
code changed.

### 11.1 The zeros row — a type bug, not a loading placeholder

The engine (§10) commits its match list as a `Uint32Array`
(`out.slice(0, n)` in filter-engine.js; the baked sort orders are
`Uint32Array` subarrays too, so the zero-predicate fast path commits
one as well). `LibraryResults` computed its window as
`browseIndices.slice(0, rowBudget)` — still a `Uint32Array` — and
rendered it with `.map(...)`. `TypedArray.prototype.map` coerces
every callback return value to a number: each React element the
callback built was converted to `0`. React then rendered the
resulting typed array as one text node of 50 zeros inside
`.tower-grid` (rowBudget = 50 — measured live in the harness:
`.tower-grid` with 0 element children and textContent of exactly 50
"0" characters; identical in list view via `.tower-rows`). The
browse window has therefore rendered NO cards at all in any
engine-committed state since e7fa2d41 — at 20k resident and still at
1.24M resident in the harness. It throws no JS error, which is why
the §10 gates (header counts, error counts) never saw it. A second
victim: the pitch-measurement layout effect counts element children
of the results container, found none, and never enabled windowing.

Fix: the window memo converts the slice with `Array.from(...)`
(the slice is ≤ rowBudget entries — the conversion is trivially
cheap and covers every producer, present and future).

### 11.2 The button's claim was arithmetic, never a measurement

"showing {Math.min(rowBudget, matchCount)}" is computed from the
budget and the committed count, not from what rendered — so it
claimed 50 while 0 were on screen. Fix: the label now reads the
actually-rendered window size (`visibleIndices.length`), so the
claim can never exceed the rendered list again.

### 11.3 Prefix counts presented as final

Every number in the screenshot is a count of the resident prefix
(verified against the mirror's bootstrap file: 1500s = 208 exactly;
DECLASSIFIED 10,572 / BOOKS 6,302 / PAPERS 1,784 / PODCASTS 1,091 /
DOCUMENTS 176 / REFERENCE 75; LAW absent because no LAW record is
in the first 20,000). The only streaming disclosure was the plain
"Loading full catalog…" line — no progress, no total — while the
results header used the prefix length as its denominator. The true
total (2,557,923) is known client-side from first paint via the
browse manifest (`getBrowseTotalHint()`), it just was not shown.
Fix: the status line now carries progress ("Loading full catalog…
20,000 of 2,557,923") in the same slot and vocabulary, and while
streaming the results header's denominator is the true total
instead of the prefix length. All provisional markers vanish at
completion; post-load counts are byte-identical to before (parity
invariant unchanged).

### 11.4 Churn during streaming

The engine effect depends on `artifacts`, so every stream publish
(~127 chunks) cancelled the running scan and restarted it from
position 0 over the grown prefix, then committed → rank memo +
results + panel re-render. Measured in the harness churn window
(6× CPU throttle, stream released from 20k): 24 committed-result
rebuilds while ~61 chunks landed, the header count climbing
208 → 246 step by step, 377 long tasks (max ~1.5 s) sharing the
main thread with derivation and the stream transposes. On the
phone this is the "results feel slow, numbers keep moving"
sensation. Fix: while the catalog is still streaming, a
length-only change (same selection, longer prefix) re-scans at
most once per 2 s on a trailing timer; the last committed result
stays on screen between rebuilds. Selection changes and the final
(full-residency) publish always scan immediately — per-tap
behavior after full load is unchanged.

### 11.5 Verification

Harness scenario (this section's repro, after the fix): no
zero/garbage text node in the results region at 20k or after;
rendered card count equals the button's "showing" count; the
provisional line is present while streaming and absent after;
final post-load counts match ground truth exactly (total
2,557,923; LAW 1,277,197). The §10 storm test passes unchanged.
Full `npm run build` + desktop/mobile regression, zero JS errors.
Joshua's phone remains the final gate.
## 12. Phase 2A — the data/input plane (2026-11-12 night, Joshua's optimization program)

Implements the audit's F1/F2/F6/F9 fixes and research §§1/5: the browse
page now loads the catalog as a columnar binary dataset (TCB1) instead
of the 795 MB browse JSON, with device caching + resume, latest-only
filter input under a byte-ledger memory budget, and precomputed
curated-collection bitsets. The JSON pipeline remains in place,
untouched, as the fallback for every failure mode.

### 12.1 The dataset and its publishing pattern

- `scripts/build-tcb1.mjs` (repo pipeline) generates the dataset from
  the canonical catalog-index shards + `public/tower-hubs-index.json`:
  128 shards × 20,000 records (last 17,923), a TCD1 dictionary file,
  and TCU1 curated bitsets, Brotli-q11 into repo-root `tcb1-data/`.
  Regeneration is byte-identical to the stage-1 proof dataset (every
  shard + dictionary sha256 matches; manifest fingerprint =
  the browse manifest fingerprint `7e389387…`).
- Wire size: **107,356,479 B total** (shards 70.6 MB, dictionary
  36.7 MB, curated 10,430 B) vs the browse JSON's ~251 MB gzip wire /
  795 MB raw. Decoded columns: 426 MB.
- Serving follows the repo's established large-file pattern (the
  search-index-data precedent): `tcb1-data/` never enters `dist/`
  (no Pages 25 MiB exposure); `functions/api/tcb1-manifest.js` serves
  the manifest and `functions/tcb1/[fingerprint]/[file].js` streams
  each `.br` file from `raw.githubusercontent.com` at the deployed
  commit with `Content-Encoding: br`, immutable cache headers and
  Cache API edge caching. Files are addressed by the dataset
  fingerprint; a catalog publish that changes the fingerprint
  orphans the old URLs cleanly.
- Curated bitsets (audit F9): one packed bitset per curated
  collection over catalog index space — 11,192,162 B raw for all 35
  collections, 10,430 B on the wire. Counts are popcounts over the
  catalog, i.e. the number the filter itself returns. One known,
  intended divergence from the hub file: `tradition:christianity`
  counts **1,800** (the hub list names 1,799 ids; one artifact_id is
  duplicated in the catalog and both records match). The panel now
  shows the true filtered count instead of the list length.

### 12.2 The loader

- The existing browse worker runs the TCB1 branch when discovery
  validates the dataset against the browse manifest (source
  fingerprint, total, shard size must all match exactly — the shard
  grid then provably lands on the browse cursor grid). Any doubt or
  failure leaves the JSON stream exactly as it was: a shard-0/dict
  failure posts `error` (main-thread JSON takeover, committed chunks
  kept); a later shard failure posts `failed{cursor}` (the JSON
  path's frontier-stop semantics).
- Streaming reads use `fetch` + `response.body.getReader()` (never
  for-await over the body — Safari), into exact-size buffers from the
  manifest; every file is sha256-verified on BOTH the cache read and
  the network read before it may feed the decoder. String decoders
  use `ignoreBOM: true` (264 records carry a genuine leading U+FEFF;
  stage 1 proved this is load-bearing). The transpose emits the exact
  payload shape the JSON transpose emits — the column store, filter
  engine, sort orders and §10/§11 invariants are unchanged by
  construction (node gate: both sessions driven over the full catalog
  produce byte-identical stores, count 2,557,918 after the 5 known
  duplicate-id drops).
- Flow control is ack-based: the main thread acks each committed
  chunk; the worker holds at most a 2-shard window (1 decode + 1
  fetch-ahead). No shard is pulled before the window allows.
- Device caching + resume: decoded-verbatim files persist in Cache
  Storage (`tcb1-v1`) keyed by fingerprint, with a completion bitmap
  persisted after every shard and a `__fp__` pointer entry — a
  changed fingerprint wipes the cache before anything is read.
  Measured: killed at 419,995 resident (21 shards), a reopened page
  issued exactly 105 requests (the 104 uncached shards + manifest)
  and completed with exact counts. A warm repeat visit issues **1**
  TCB1 request (the manifest) — everything else is served from Cache
  Storage. No persistence is promised in the UI (Safari eviction);
  the honest progress line is the only copy.

### 12.3 Residency decision — flat columns (measured)

Stage 1's open flag: decoded columns are 426 MB (titles 243 MB,
creator dictionary ~110 MB) against research's ≲400 MB whole-page
peak target, with title/dictionary compression-at-rest as the
preferred direction. Measured in the harness (6× CPU throttle) at
full residency, the flat design the JSON path already uses lands at:

- byte ledger (deterministic self-accounting): **502 MB** total —
  columns 330 MB, dictionaries 113 MB, sort orders 49 MB, external
  (curated bitsets) 11 MB;
- CDP JS heap: **190–280 MB** across runs (189.8 MB warm-settled,
  192.4 MB after the storm, 280.2 MB cold pre-GC sample), vs the
  JSON path's 241.9 MB in the same harness and 195.9 MB in §11's.

The store is byte-identical to the JSON path's by construction, so
its heap class is the same — inside the target with headroom.
**Decision: flat columns, no compression-at-rest.** Compressing the
title blob at rest would break the identical-columnar-state
invariant (every title read becomes an inflate-or-cache decision),
add a second cache to evict and invalidate, and buy memory the
budget does not need. The transients TCB1 actually removes are the
JSON path's real cost: the 795 MB of raw text in flight, the parsed
object forms, and the per-page transpose garbage.

### 12.4 Latest-only input + the byte ledger ladder

- The browse effect never cancels a running scan. It stores the
  newest selection in a single pending slot (a still-newer tap
  replaces it); the engine's `onSettle` (fires exactly once per job:
  commit, abandon, or cancel) drains it, skipping a drain identical
  to the just-committed result. At most one scan in flight + one
  pending, generation-tagged — filter transients stay bounded no
  matter how fast taps arrive (§5 pattern). The §11.4 streaming
  throttle is preserved inside the same model.
- The byte ledger (Safari has no gauge) accounts columns,
  dictionaries, the dedupe index, orders and registered external
  planes at allocation time and is exposed as
  `window.__towerLedger`. Two latched rungs, checked on the publish
  cadence: **rung 1 at 560 MB** sheds the 51 MB sort-order buffer
  (status returns to "pending", never "failed" — a "failed" status
  would trigger the ~1.24 GB on-device sort rebuild of audit F6;
  a 15 s refetch timer re-arms if orders are still wanted);
  **rung 2 at 640 MB** narrows the fetch pipeline (8 → 3) and the
  worker ack window (2 → 1). Residency itself is never shed, and
  there is **no record cap** (Joshua's 2026-11-10 uncap order).
  Neither rung fired in any verification run (peak ledger 502 MB).

### 12.5 Two bugs the throttled harness caught (both fixed)

1. **Discovery race (found by the cell profile):** stream start
   raced TCB1 manifest discovery against a 3 s timer. On a
   throttled connection the boot prefetch's JSON pages saturate
   the connection pool, the race expires, and the page silently
   committed to the 795 MB JSON stream for the whole load — the
   exact phone scenario this phase exists to prevent. Fix:
   discovery is awaited on the same terms as `browseMeta` (same
   attempts/timeout discipline; the manifest is a few KB). A dead
   TCB1 endpoint now delays stream start no more than a dead
   browse manifest already does. Re-test: dict.bin is requested
   and the stream engages on the cell profile.
2. **Settle-window artifact (diagnosed, not a defect):** the
   fresh-profile storm/soak runs exhausted their settle-observation
   windows (300 s / 600 s) while ending in exactly correct states.
   A warm-profile probe of the identical storm settles in ≤10 s
   with long-task counts flat — the drag was the harness host
   (426 MB of Cache Storage writes flushing + swap pressure on a
   1.5-CPU box), not the scheduler. Reported here so the numbers
   are never quoted without their context.

### 12.6 Verification (6× CPU throttle harness, this build)

- **Parity:** node gate byte-identical (§12.2). In-browser, TCB1 vs
  JSON on the same build: panel chip lists **exactly equal** (all
  lane, era and group counts); taps equal — Law 1,277,197, Primary
  Sources 26,657, All entries 2,557,918 shown of 2,557,923;
  Christianity 1,800 via bitsets (panel + result). §11 assertions
  in every run: rendered cards == claimed window (50), zero
  text-nodes == 0, zero JS errors.
- **Load, fast network:** cold TCB1 — first 20k **7.5 s**, full
  residency **56.6 s** (131 requests = manifest + dict + curated +
  128 shards, nothing else). Same-harness JSON: 6.5 s / **81.7 s**.
  (§11's production-shaped JSON baseline was 256.5 s.)
- **Repeat visit:** 1 TCB1 request (manifest only); full residency
  64.6 s — on a local disk-speed network the repeat is decode-bound,
  not network-bound; the saving shows on real networks (below).
- **Cell profile (10 Mbps / 100 ms RTT, HTTP/1.1 harness,
  unminified assets — a worst case vs production's HTTP/2 CDN):**
  post-fix, the binary stream engages and the first 20k are
  resident at **78 s** (pre-fix it never engaged at all — §12.5.1).
  A full-completion time is **not quoted**: the harness host could
  not sustain the profile (the app's aggregate demand — unminified
  assets, the 24 MB boot prefetch, hub, dictionary and shards —
  shares one emulated bucket; the dictionary alone measured
  ~195 s from a page-context fetch under that contention, the
  loader's 120 s per-attempt timeout fired once and its retry
  proceeded; two attempts were also lost to runtime restarts of
  the harness VM). The network-bound comparison that does hold
  everywhere is the measured wire size: **107.4 MB vs ~251 MB
  (2.34× less)** plus the removal of the 795 MB text parse. On
  production's stack the dictionary is a ~30 s transfer at this
  rate; Joshua's phone on a real network is the deciding check,
  as with every phase of this program.
- **Resume:** §12.2 (105 requests after a 419,995 kill, exact).
- **Spam-during-stream soak (the audit's missing profile):** 143
  taps at 120 ms cadence from the first seconds of streaming
  through residency (105 landed; the rest name subchips hidden
  behind the panel's "Show all" expander at that moment) —
  residency in **73.6 s** under spam (vs 56.6 s unspammed), zero
  JS errors, **zero frame gaps over 1 s across 18,152 frames**,
  final selection exact (2,557,918 / 2,557,923).
- **§10 storm regression:** 16/20 taps landed (baseline band
  15–16/20; misses are the same expander-hidden subchips), scroll
  parked mid-results, final state exact, zero errors, heap
  192.4 MB. Settle-window caveat: §12.5(2).
- **Curated axis early:** with the bitsets primed from the TCB1
  manifest at mount, the axis answers before the hub file is
  parsed — probed live at 2.42 M of 2.56 M resident: Christianity
  tapped mid-stream settled at exactly 1,800.

### 12.7 What did not change

JSON pipeline and its worker protocol (untouched, still the
fallback); the filter engine's scan/commit model (§10) and the
§11 loading-state rules; the hub file and its other UI uses; the
helix scene (another lane). Expansion remains paused.
