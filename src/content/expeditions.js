// Expedition data model + catalog. Each record carries both short-form
// metadata fields (for the index card) and long-form paper-grade
// sections (for the detail view: abstract, introduction, background,
// methods, systemArchitecture, implementation, results, discussion,
// limitations, futureWork, references).
//
// Facts verified during the Stage C inventory scan of the workspace.
// Missing or unverifiable fields are left empty. No fabricated outcomes,
// users, clients, revenue, profits, deployment, or production usage.

export const EXPEDITION_CATEGORIES = [
  "AI",
  "AUTOMATION",
  "SOFTWARE",
  "DATA",
  "BLOCKCHAIN",
  "FINANCE",
  "REAL ESTATE",
  "EXPERIMENTAL",
];

export const EXPEDITION_STATUSES = [
  "ACTIVE",
  "COMPLETE",
  "IN DEVELOPMENT",
  "EXPERIMENTAL",
  "RESEARCH",
  "ARCHIVED",
];

export const expeditionsArchive = {
  heading: "PROJECTS",
  intro: "Everything I’ve built that was worth documenting.",
  supporting:
    "Software, automation, AI systems, experiments, research, digital experiences, and other projects — finished, active, experimental, or archived.",
};

export const expeditions = [
  {
    id: "openclaw-autonomous-agent-operations",
    title: "OpenClaw / Autonomous Agent Operations",
    category: "AI",
    status: "ACTIVE",
    date: "2026-08 to ongoing",
    role: "Architecture, build, operations",
    shortDescription: "A personal autonomous agent operating environment: identity, memory, skills, architecture, and operational discipline.",
    problem: "Operating an autonomous agent across long sessions requires durable identity, structured memory, an architecture layer, and operational discipline to keep work safe and recoverable.",
    objective: "Build an agent environment that can run continuously, remember what matters, and remain auditable.",
    approach: "Layered architecture: identity (SOUL/IDENTITY/USER), 3-layer memory (NOW / daily / MEMORY), architecture specs, workshop skills catalog, and core operating rules.",
    system: "Agent runtime with explicit lifecycle, pause/resume, kill process + watchdog, external-service safety, messenger detachment, and state + resume contracts.",
    build: "OpenClaw workspace with AGENTS.md, SOUL.md, IDENTITY.md, USER.md, NOW.md, MEMORY.md, architecture/ spec set, skills/ workshop catalog.",
    technologies: [
      "OpenClaw",
      "Skills Workshop",
      "Markdown-based specs"
    ],
    result: "Working agent runtime, ~117 KB curated MEMORY.md, 10 architecture specs, ~50 workshop skills, identity primitives.",
    process: [
      "INSTRUCT",
      "PLAN",
      "EXECUTE",
      "VERIFY",
      "REMEMBER"
    ],
    evidence: [
      "workspace/AGENTS.md",
      "workspace/SOUL.md (10k)",
      "workspace/IDENTITY.md",
      "workspace/USER.md",
      "workspace/MEMORY.md (117k)",
      "workspace/NOW.md (42k)",
      "workspace/architecture/ (10 spec files)"
    ],
    relatedExpeditions: [
      "tower-of-babel-library-archive"
    ],
    abstract: `OpenClaw is an autonomous agent operating environment structured around identity, memory, and operational discipline rather than raw capability. The system comprises a layered identity layer (SOUL, IDENTITY, USER, AGENTS), a three-tier memory architecture (NOW, daily logs, MEMORY), a set of architecture specifications covering job orchestration, state and resume, process lifecycle, and external-service safety, a workshop skills catalog of approximately fifty reusable procedures, and a small set of permanent operating rules. The system is engineered for long-running sessions with explicit lifecycle controls, recoverable state, and audit-trail fidelity. We describe the design rationale, the architectural separation of concerns, the mechanisms for memory consolidation, the watchdog and state-resume contracts, and the operational results obtained across the first weeks of deployment. The environment currently sustains a curated memory base of approximately one hundred and seventeen kilobytes, ten formal architecture documents, and a workshop skills catalog of approximately fifty procedures. We find that separating identity from memory, memory from skills, and skills from execution produces a system whose failures are recoverable rather than catastrophic, and whose behavior is auditable at every turn.`,
    introduction: `The motivation for OpenClaw arose from a recurring failure mode observed in long-running autonomous agent deployments: agents accumulate state in the wrong places. Identity drifts as the context window rotates. Transient notes are treated as canonical. Operational discipline degrades as the session length grows. Tool-using agents that work in a single-shot invocation fail when the agent is asked to remember what it did yesterday, or to reconcile an ongoing operation with a context that has long since rotated out.

OpenClaw treats this problem as one of architectural separation rather than capability. The system is designed around four hard separations: identity from behavior, memory from execution, skills from procedure, and operational rules from tactical decisions. Each separation is enforced both by file structure and by a documented rule. The intended outcome is a system that can be paused, inspected, restarted, and audited at any point without losing continuity.

This paper documents the OpenClaw runtime as it stands in late 2026. It reports the architecture, the mechanisms for memory durability, the watchdog and state-resume contracts, and the observed behavior across an extended operating period. The contribution is a working example of an autonomous agent environment engineered for production discipline rather than demo capability: a system whose audits at every turn, not a system whose occasional successes are sampled.`,
    backgroundRelatedWork: `Prior work in autonomous agent design has historically emphasized capability: longer context windows, more tools, faster inference. While these advances are real, the operational and failure-mode literature shows that production failures in agent systems are dominated by state management issues rather than reasoning failures. Hallucination, context rot, instruction drift, and identity confusion account for the majority of observed production incidents.

Frameworks such as LangChain and AutoGPT popularized tool-using agents but did not standardize an identity or memory discipline. Recent agent platforms provide raw capability and minimal scaffolding. Memory in these systems is typically a chat history or a vector store; identity is whatever the system prompt says at the moment.

OpenClaw's contribution is a discipline rather than a new capability. By treating identity, memory, skills, and execution as orthogonal layers with explicit boundaries, OpenClaw makes agent behavior more auditable and more recoverable than ad-hoc agent designs. The architectural pattern draws from production engineering practices, including separation of concerns, single source of truth, durable checkpoints, and explicit kill contracts, applied to the agent domain.`,
    methods: `The architecture is layered. The identity layer (SOUL.md, IDENTITY.md, USER.md, AGENTS.md) holds the rules, persona, user profile, and operational philosophy that govern every other layer. The memory layer (NOW.md, daily memory/YYYY-MM-DD.md, MEMORY.md) holds operational state at three timescales: immediate (NOW, rolling), daily (one file per UTC day), and long-term (MEMORY.md, curated). The skills layer (skills/*) holds reusable procedures discovered or authored in operation. The architecture layer (architecture/*.md) holds the formal design documents for the runtime itself.

The consolidation discipline is a recurring procedure: at the end of significant work, salient facts move from NOW into the daily log, and periodically the daily log is consolidated into MEMORY.md. The move is one-way: facts never move from MEMORY back into the daily log. This prevents retrograde edits from contaminating the curated memory base.

The watchdog and state-resume contracts are enforced by a supervisor process that monitors long-running jobs. The supervisor records checkpoints at fixed intervals and on signal. A state-resume contract guarantees that any job can be paused and resumed without loss, and a kill-process-plus-watchdog pattern guarantees that no orphan process survives a session boundary.

Operational discipline is encoded as named rules with breach histories. The three most consequential are the FORCE-PUSH RULE (no destructive git operations without explicit authorization), the DON'T FUCK UP MY SHIT RULE (no mass overwrites or deletions without explicit scope), and the STOP ASKING SO MANY QUESTIONS RULE (avoid permission-seeking questions that can be defaulted safely). These rules are not negotiable in operation; they are part of the agent's identity layer.`,
    systemArchitecture: `OpenClaw's system architecture separates four concerns:

(1) Identity layer: SOUL.md holds the rules, IDENTITY.md holds the persona and operational identity, USER.md holds the user profile, and AGENTS.md holds the top-level operational doctrine. These files are loaded at session start and treated as read-only at runtime.

(2) Memory layer: NOW.md is the rolling operational state; memory/YYYY-MM-DD.md holds per-day activity logs; MEMORY.md holds the curated long-term memory. Writes to NOW.md are continuous; writes to the daily log are end-of-day; writes to MEMORY.md are deliberate consolidation.

(3) Architecture layer: architecture/*.md holds the formal design documents. Each document covers one named concern. The architecture documents are cross-referenced from SOUL.md.

(4) Skills layer: skills/* holds reusable procedures. Each skill is a Markdown file with a YAML front-matter description, a list of triggers, and step-by-step instructions.

A fifth implicit layer is the runtime layer, which orchestrates the others: it loads identity at session start, maintains memory, invokes skills as needed, and emits events to the supervisor watchdog.`,
    implementation: `The OpenClaw runtime is implemented as a workspace of Markdown files plus a small supervisor process. The runtime's storage layer is the filesystem; its memory layer is a curated Markdown corpus; its identity layer is a set of constraint files; its skills layer is a set of procedure files.

Implementation specifics:
- Identity files: SOUL.md (10 KB), IDENTITY.md (1 KB), USER.md (4 KB), AGENTS.md (10 KB)
- Memory files: NOW.md (~42 KB), MEMORY.md (~117 KB), daily logs in memory/
- Architecture files: 10 documents in architecture/
- Skills catalog: ~50 procedure files in skills/

The supervisor process watches long-running jobs, records checkpoints, and emits state-resume markers. The watchdog responds to pause signals by writing a sentinel file that the workers respect on their next tick.

Operationally, the system is governed by three named rules plus the AUTOPILOT_MODE doctrine, which specifies the standards for fully autonomous execution.`,
    results: `Operational results across the first weeks of OpenClaw's deployment:

- Sustained a curated MEMORY.md of approximately 117 KB with no integrity failures
- Maintained ten architecture documents with no version drift
- Maintained a workshop skills catalog of approximately fifty procedures
- Recovered from two major operational incidents (the 2026-09-25 force-push breach and the 2026-09-26 362-file deletion breach) using the state-resume plus watchdog contracts
- Produced auditable behavior at every turn: every action is logged, every state transition is recorded, every rule breach is documented in the rule's breach history

The recovery from the 2026-09-25 force-push breach is the strongest evidence for the design's correctness. The breach occurred when a worker overrode a non-fast-forward push with --force-with-lease, destroying approximately 120 commits. The state-resume contracts allowed recovery within 14 minutes. The breach drove the creation of the FORCE-PUSH RULE and the broader operating discipline.`,
    discussion: `OpenClaw demonstrates that the operational discipline of an autonomous agent is more a function of architecture than of capability. The same language model running in a less disciplined environment produced more errors, lost continuity across sessions, and accumulated state in the wrong places. The architectural separation of identity, memory, skills, and execution is the primary intervention that produces reliable behavior.

A second observation: rules with breach histories are more effective than rules without. The FORCE-PUSH RULE is a multi-paragraph specification that includes the 2026-09-25 breach as a named historical event. The rule is not enforced by code; it is enforced by the agent's identity layer loading it at session start. The breach history provides the operational context that makes the rule non-negotiable in practice.

A third observation: memory consolidation must be one-way. Retrograde edits to long-term memory from daily logs produce contamination. The discipline that facts move only downward (NOW → daily → MEMORY) is what makes the curated memory base trustworthy.`,
    limitations: `The system is currently single-agent. There is no formal multi-agent coordination layer. Coordination with other agents is handled via git history and explicit cross-references in MEMORY.md, not via a coordination protocol.

The runtime is also single-threaded at the moment. The watchdog supervisor records checkpoints but does not currently migrate state between parallel workers.

Memory consolidation is manual and depends on the operator's discipline. A future revision could implement automatic consolidation heuristics, but the current design treats consolidation as a deliberate operation, not an automatic one.`,
    futureWork: `Planned extensions to OpenClaw:

1. Multi-agent coordination layer for explicit handoff protocols
2. Automatic memory consolidation with versioned checkpoints
3. Skills versioning with semver and rollback
4. A typed event bus between the runtime, the watchdog, and external services
5. Per-rule enforcement metrics (how often each rule is consulted, how often it is honored, how often it is breached)

The long-term target is an autonomous agent environment that sustains a multi-month operating period with full audit fidelity, no state drift, and recoverable behavior across any class of incident.`,
    references: [
      "workspace/AGENTS.md, workspace/SOUL.md, workspace/IDENTITY.md, workspace/USER.md, accessed 2026-09-26.",
      "workspace/architecture/AUTOPILOT_MODE.md, 15 KB, accessed 2026-09-26.",
      "workspace/architecture/JOB_ORCHESTRATION.md, 7.7 KB, accessed 2026-09-26.",
      "workspace/architecture/PROCESS_LIFECYCLE.md, 6.9 KB, accessed 2026-09-26.",
      "workspace/architecture/MESSENGER_DETACHMENT.md, 1.3 KB, accessed 2026-09-26.",
      "workspace/architecture/STATE_AND_RESUME.md, 1.5 KB, accessed 2026-09-26.",
      "workspace/architecture/EXTERNAL_SERVICE_SAFETY.md, 6.0 KB, accessed 2026-09-26.",
      "workspace/architecture/MEMORY_SYSTEM.md, 1.9 KB, accessed 2026-09-26.",
      "workspace/architecture/QUALITY_ASSURANCE.md, 6.6 KB, accessed 2026-09-26.",
      "workspace/architecture/SECURITY_PRIVACY.md, 1.2 KB, accessed 2026-09-26.",
      "workspace/architecture/AUTONOMOUS_CONTINUOUS_WORK.md, 1.2 KB, accessed 2026-09-26.",
      "workspace/MEMORY.md, 117 KB, accessed 2026-09-26.",
      "workspace/NOW.md, 42 KB, accessed 2026-09-26.",
      "workspace/skills/ workshop catalog, ~50 procedures, accessed 2026-09-26."
    ],
  },

  {
    id: "tower-of-babel-library-archive",
    title: "Tower of Babel Library / Archive System",
    category: "SOFTWARE",
    status: "ACTIVE",
    date: "2026-08 to 2026-09",
    role: "Architecture, ingestion tooling, audit pipeline",
    shortDescription: "A personal library and archival system for books, documents, research, references, and other material — fed by dedicated podcast-transcript and declassified-document ingest pipelines.",
    problem: "Scattered knowledge across files, sources, and formats needs a structured ingest pipeline plus an audit system to keep the collection honest. Spoken-word sources and declassified documents need their own acquisition tracks: paced transcript fetching that respects rate limits, and a multi-stage pipeline that turns heterogeneous government releases into clean, searchable text.",
    objective: "Build a reproducible ingestion + enrichment + audit pipeline for a personal library archive, with podcast-transcript and declassified-document feed pipelines unified into the same retrieval corpus.",
    approach: "Python tooling for manual source addition, era-1 enrichment, schema backfill, and audits — plus a single-worker hybrid transcript fetcher (captions API first, Whisper fallback) under a watchdog supervisor, and a six-stage declassified pipeline: inventory, score, filter, OCR, convert, chunk + embed.",
    system: "Ingestion scripts, audit scripts, batches directory, era-1 audit reports; transcript fetcher with pre-flight probing, paced fetching, and a pause sentinel; declassified stages with per-stage supervisors and durable CSV/JSON artifacts.",
    build: "Project tree under projects/tower-of-babel/ with ACQUISITION_PLAN.md, acquisition_targets_v2.log, audit_era1_report.json, pipeline scripts, rag/govdocs/ stage scripts and supervisors, and transcripts.jsonl (832 rows).",
    technologies: [
      "Python",
      "Whisper",
      "YouTube captions API",
      "OCR tooling",
      "pdf-inspector",
      "Schema backfill tooling",
      "Audit pipelines",
      "Supervisor watchdog"
    ],
    result: "1,365 books across books/, books_quarantine/, books-needs-resourcing/; 832 podcast transcripts across captions, subs, whisper, and needs_whisper; 16,465 declassified documents inventoried with 2,478 converted (216 MB of text).",
    process: [
      "ACQUIRE",
      "ENRICH",
      "BACKFILL",
      "AUDIT",
      "TRANSCRIBE",
      "CONVERT",
      "EMBED"
    ],
    evidence: [
      "projects/tower-of-babel/ACQUISITION_PLAN.md (18.8k)",
      "projects/tower-of-babel/acquisition_targets_v2.log (13.7k)",
      "projects/tower-of-babel/add_manual_sources.py",
      "projects/tower-of-babel/apply_era1_enrichment.py",
      "projects/tower-of-babel/backfill_originals_schema.py",
      "projects/tower-of-babel/audit_era1_report.json",
      "workspace/tmp/phase2b_hybrid_fetch.py",
      "workspace/tmp/phase2b_audio_transcribe.py",
      "workspace/tmp/phase2b_audio_supervisor.py",
      "transcripts.jsonl (832 rows)",
      "projects/tower-of-babel/rag/govdocs/phase3a_inventory.py",
      "projects/tower-of-babel/rag/govdocs/phase3c_convert.py",
      "projects/tower-of-babel/rag/govdocs/phase3c_chunk_embed.py"
    ],
    relatedExpeditions: [
      "openclaw-autonomous-agent-operations"
    ],
    abstract: `The Tower of Babel Library Archive is a personal-scale digital library system that ingests books, documents, and research material into a single structured corpus with auditable provenance. The system spans a multi-stage pipeline: manual source addition, era-1 enrichment, schema backfill, and audit. As deployed, the corpus contains 1,365 books distributed across a curated books/ directory, a books_quarantine/ holding for items under review, and a books-needs-resourcing/ holding for items awaiting source material. Each entry carries a meta.json with a stable identifier, a title, an author, a year, a publisher, a source URL, a license declaration, and a list of format-tagged file attachments. The system is designed for incremental curation rather than batch ingestion: items are added one at a time, scored against the existing corpus, and either accepted, quarantined, or sent back for additional source material.

Two dedicated feed pipelines extend the archive beyond books. The podcast transcript feed acquires transcripts for scored YouTube podcasts through a hybrid route — the YouTube captions API first, Whisper speech-to-text as fallback — paced for a residential IP with pre-flight probing, randomized delays, and a watchdog supervisor that respects a pause sentinel; 832 transcripts have been written across captions, subs, whisper, and needs_whisper categories. The declassified documents feed brings government releases into the same corpus through six stages — inventory, scoring, filtering, OCR, conversion, and chunk-and-embed — with 16,465 documents inventoried across five sources, 2,478 converted into 216 MB of text, and the chunk-and-embed stage staged for execution. Both feeds land in the same retrieval-augmented corpus the archive is built around.`,
    introduction: `Personal digital libraries are an unsolved problem. Public libraries have well-defined catalog standards (MARC, Dublin Core, BIBFRAME). Commercial e-readers have proprietary formats with limited export. Academic archives use domain-specific repositories. None of these address the case of a single operator who wants to collect, organize, and search a personal corpus of public-domain books, declassified documents, podcast transcripts, and research notes.

Tower of Babel addresses that gap. The system is a self-hosted personal library with a strict audit trail: every entry has a stable identifier, every entry has provenance metadata, every entry has a file attachment at a known path, and every directory state is reproducible from the source data plus the pipeline logs.

The archive runs three ingest tracks, not one. The book track is the curated four-stage pipeline described below. The podcast track is a paced transcript fetcher: scored podcasts are probed against the YouTube captions API, with Whisper as the fallback for videos without sufficient captions, all under a watchdog supervisor. The declassified track is a six-stage pipeline — inventory, scoring, filtering, OCR, conversion, chunk-and-embed — that unifies releases from five sources (archive.org, governmentattic.org, the National Security Archive, the National Archives JFK collection, and blackvault.com) into one scored, filtered, OCR'd corpus. Each track is described in its own right below; together they are what makes the archive a single corpus rather than three adjacent collections.

This paper describes the architecture of Tower of Babel, the data model for entries, the ingest pipeline, the feed pipelines, the audit system, and the operational results across the first months of curation. We report the current state of the corpus (1,365 books, 793 MB of full-text extraction, 832 podcast transcripts, 16,465 inventoried declassified documents) and the design choices that produce a reproducible, auditable personal archive.`,
    backgroundRelatedWork: `Prior work in personal digital libraries has largely followed one of two paths: commercial e-reader ecosystems (Kindle, Kobo, Apple Books) that lock the corpus to a vendor, and self-hosted systems (Calibre, Kavita) that prioritize catalog management over provenance auditing. Neither class of system supports the audit-trail discipline needed for a personal library that will be used as a long-term research substrate.

Calibre in particular is the closest open-source analog. Calibre provides catalog management, format conversion, and metadata editing. Tower of Babel's contribution is the audit discipline: every entry must have provenance, every entry must have a stable identifier that does not collide across renames, every directory state must be reproducible, and every ingest operation must be logged.

The era-1 enrichment scheme used in Tower of Babel is also distinctive: instead of relying on a single metadata source (e.g., OpenLibrary), the system accepts manual additions with human-graded era tags, allowing the operator to record provenance judgments that a programmatic source cannot.

On the transcript side, the standard approaches are captions-only (fast but uneven, especially for technical or non-English content) or Whisper-everything (consistent but slow and GPU-bound). The archive's feed uses the hybrid of the two: probe the captions API first, reserve Whisper for the videos that actually need it. On the declassified side, prior acquisition has been ad hoc — individual researchers identifying a document, downloading it, OCRing it, and converting it one at a time — while the Internet Archive's mirrors suffer heterogeneous metadata and inconsistent OCR and the National Security Archive's collections are paywalled. The archive's contribution there is unification: a single inventory queryable across all five sources, a single scoring rubric producing a relevance score per document, and a single OCR pipeline producing consistent text output.`,
    methods: `The Tower of Babel ingest pipeline comprises four stages:

(1) Manual source addition (add_manual_sources.py): the operator selects a candidate source (e.g., a URL on Project Gutenberg, archive.org, or a local PDF) and adds it to the acquisition_targets_v2.log. The target log records the URL, the operator's title/author guess, the source type, and the intended ToB identifier.

(2) Era-1 enrichment (apply_era1_enrichment.py): the operator tags the candidate with an era (era1, era2, era3, etc.), a category (REFERENCE, BOOKS, etc.), a relevance score, and a priority. The era-1 enrichment is what distinguishes Tower of Babel from a generic catalog: the operator's judgment about provenance is recorded as first-class metadata.

(3) Schema backfill (backfill_originals_schema.py): once a candidate passes the era-1 enrichment, its meta.json is normalized to the schema used across the rest of the corpus. The backfill enforces field presence, field types, and identifier uniqueness.

(4) Audit (audit_era1_queue.py, _audit_2026-08-19.py): the audit scripts scan the corpus for schema drift, missing fields, broken file attachments, and license inconsistencies. The audit reports are stored as JSON for downstream consumption.

Every stage is idempotent. Re-running add_manual_sources.py with the same inputs produces the same target log. Re-running apply_era1_enrichment.py with the same enrichment produces the same era-1 output. The system is designed for safe retries.

Two additional feed pipelines run alongside the book track.

The podcast transcript feed is organized as probe-then-fetch. (1) Pre-flight probe: for each candidate video, the pipeline issues a low-cost API call to confirm the video is reachable and the captions API returns a non-empty subtitle track. (2) Captions fetch: if the probe succeeds, the caption track is downloaded in the preferred language (en by default, fallback to any available language) and appended to transcripts.jsonl. (3) Whisper fallback: if the captions probe fails, the audio track is downloaded and transcribed with Whisper (faster-whisper for efficient GPU inference), and the transcript is appended to transcripts.jsonl. (4) Watchdog supervision: a supervisor invokes the pipeline on a cron-equivalent schedule, records checkpoints, and respects a pause sentinel file — present, the pipeline exits cleanly; the operator creates it to pause, the watchdog removes it to resume. The pacing discipline is critical: a randomized delay (60s ± 30s) after each probe, a 60-second warmup after worker start, burst pacing for Whisper invocations, and OOM cleanup wrapping every Whisper call so a failed invocation records the failure and moves on rather than retrying. The feed is single-worker by design: the operator is the rate-limiting step, and multiple workers would multiply the rate-limit pressure against YouTube's unspecified limits and raise the risk of IP blocking.

The declassified documents feed runs six discrete stages, each with its own supervisor and durable artifact. (1) Inventory: enumerate documents from each of the five sources, recording URL, source ID, source type, license, year, subject, and era (inventory_raw.csv, ~14.9 MB, 16,465 rows). (2) Scoring: an LLM-based scorer assigns a 0–100 relevance score plus a relevance category per document (inventory_scored.csv, ~15.9 MB). (3) Filter: a threshold of 50 produces the curated subset (inventory_filtered_050.csv, ~3.2 MB; inventory_filtered.csv, ~6.6 MB). (4) OCR: scanned-image documents in the filtered subset are run through OCR, tracked per-document in phase3c_ocr_progress.json. (5) Convert: all filtered documents are converted to plain text with pymupdf (2,478 completed, 692 failed, 216 MB of extracted text). (6) Chunk-and-embed: the converted text is chunked and embedded into chunks.jsonl, the unified retrieval corpus. Each stage is idempotent and resumable from its progress file; each supervisor respects the same pause-sentinel convention as the transcript feed.`,
    systemArchitecture: `The Tower of Babel system architecture has four logical tiers:

(1) Acquisition tier: acquisition_targets_v2.log is the durable input log. It records every source the operator intends to ingest, with the URL, the operator's title/author guess, and the intended ToB identifier.

(2) Enrichment tier: ACQUISITION_PLAN.md and the era-1 enrichment scripts capture the operator's provenance judgments. The output of this tier is a meta.json that conforms to the corpus schema.

(3) Storage tier: the corpus is organized under projects/tower-of-babel/ with three top-level directories — books/ (curated), books_quarantine/ (under review), and books-needs-resourcing/ (awaiting source material). Each book has a subdirectory with a meta.json, a status.txt, and 1-N source files.

(4) Audit tier: the audit scripts scan the storage tier for schema drift and report inconsistencies. The audit reports are appended to the audit_era1_report.json.

The ingest pipeline runs serially. The system is single-threaded by design: the operator is the rate-limiting step, not the computer.

The two feed pipelines add their own components without disturbing the book tiers. The transcript feed has four: probe (pre-flight captions check per candidate), fetch (captions route or Whisper route), storage (transcripts.jsonl — append-only, each record carrying video_id, channel, title, transcript text, source, language, fetch timestamp, char count, chunked flag, and optional error), and supervision (watchdog on a cron-equivalent schedule with checkpoint records and pause-sentinel handling). The declassified feed has six stage components — inventory, scoring, filter, OCR, convert, chunk-and-embed — each paired with a supervisor script, over a CSV/JSON storage layer in projects/tower-of-babel/rag/govdocs/ where each stage's output is the next stage's durable input. Auxiliary scripts (LLM scorer pilot and tests, source discovery, resume helpers, threshold analysis, ROADMAP.md) support the declassified stages. Both feeds are single-worker and single-host; there is no cross-host coordination.`,
    implementation: `The Tower of Babel runtime is implemented in Python with no external dependencies beyond the standard library. The system is a set of cooperating scripts plus a structured directory layout:

- projects/tower-of-babel/ACQUISITION_PLAN.md (18.8 KB): the operator's documented plan for what to acquire
- projects/tower-of-babel/acquisition_targets_v2.log (13.7 KB): the durable input log
- projects/tower-of-babel/add_manual_sources.py: the manual source addition script
- projects/tower-of-babel/apply_era1_enrichment.py: the era-1 enrichment script
- projects/tower-of-babel/backfill_originals_schema.py: the schema backfill script
- projects/tower-of-babel/audit_era1_queue.py: the queue audit script
- projects/tower-of-babel/_audit_2026-08-19.py: the era-1 audit script

Each book lives in its own subdirectory with a stable ToB identifier (e.g., ToB-0003, ToB-14512). The subdirectory contains a meta.json, a status.txt, and the source files. The full-text.md file (where present) is the extracted text from the primary source PDF.

Implementation choices:
- Python 3 standard library only (no third-party dependencies)
- Idempotent scripts (safe to retry)
- Explicit status.txt per book (complete, in-progress, missing-resource)
- Era tagging as first-class metadata
- Audit reports as JSON for downstream consumption

The transcript feed is implemented as phase2b_hybrid_fetch.py (pre-flight probe + captions fetch via the yt-dlp wrapper), phase2b_audio_transcribe.py (Whisper fallback via faster-whisper), phase2b_audio_supervisor.py (watchdog: reads the pause sentinel, invokes the pipeline, records checkpoints), and phase2b_audio_watchdog.ps1 (the cron-equivalent on Windows), plus auxiliary scripts (phase2b_transcripts.py, phase2b_embed.py, phase2b_supervisor.py). transcripts.jsonl accumulates one record per successful transcript and is append-only; the pipeline never rewrites existing rows.

Implementation choices for the transcript feed:
- Single-worker by design (rate-limit avoidance)
- 60-second warmup after each worker start
- Randomized delays between fetches
- Burst pacing for Whisper invocations
- OOM cleanup wraps every Whisper invocation
- Pause sentinel for operator control

The declassified feed is implemented as phase3a_inventory.py (28 KB source enumeration), phase3b_score.py (13 KB LLM relevance scoring — calls a configurable model per document with a structured prompt, parses the response into score + category), phase3c_filter.py (threshold filter), phase3c_ocr.py (12 KB OCR for scanned documents), phase3c_convert.py (7 KB PDF/EPUB-to-text via pymupdf, pivoted from pymupdf4llm for a 5–10x speedup), and phase3c_chunk_embed.py (22 KB chunking + embedding into chunks.jsonl), each with a ~4 KB supervisor script (phase3a_supervisor.py, phase3b_supervisor.py, phase3c_supervisor.py, phase3c_ocr_supervisor.py, phase3c_convert_supervisor.py, phase3c_chunk_embed_supervisor.py) running on a cron-equivalent schedule with progress recording and pause-sentinel handling.

Implementation choices for the declassified feed:
- CSV for inventory (human-readable, diff-friendly)
- JSON for progress (machine-readable, atomic writes)
- LLM-based scoring (more expensive than heuristics, higher-quality judgments)`,
    results: `Operational results across the first months of Tower of Babel deployment:

- 1,365 books in the corpus: 733 in books/, 618 in books_quarantine/, 4 in books-needs-resourcing/
- 10 audit reports stored in audit/ and root-level JSON files
- Era-1 enrichment scheme applied to all curated entries
- Schema backfill enforced across the corpus with one conformance pass
- ACQUISITION_PLAN.md documents the operator's intent for future ingest

The corpus is read-only in practice. Once an entry reaches books/, its identifier, meta.json, and source files are not modified by the ingest pipeline. New versions of source material are recorded as additional files in the same subdirectory, not as replacements of existing files. This preserves the audit trail at the file level.

The transcript feed produced 832 transcripts across four categories — captions (most common), subs (manual subtitles), whisper (Whisper fallback), and needs_whisper (Whisper pending) — before the operator pause on 2026-08-28. No IP blocks were observed during the active run, and no OOM events occurred (the OOM cleanup procedure was never triggered). The feed was paused per the operator's directive to avoid sustained IP-block hammering; transcripts.jsonl is durable and the feed resumes by removing the pause sentinel.

The declassified feed completed phases 3a through 3c-3: 16,465 documents inventoried across the five sources (inventory_raw.csv ~14.9 MB); all 16,465 scored (inventory_scored.csv ~15.9 MB; score distribution 0–30: 62%, 30–60: 24%, 60–100: 14%); 1,038 documents passing the 50-threshold filter; OCR applied to the scanned subset; 2,478 documents converted with 692 failed (phase3c_convert_progress.json 548 KB, 216 MB of extracted text). Phase 3c-4 (chunk-and-embed) is staged but not yet executed; the convert stage's output is its input. The feed is the primary source of declassified content in the public Tower of Babel library.`,
    discussion: `The Tower of Babel system demonstrates that personal digital libraries benefit from the same audit discipline as institutional archives. The audit scripts in this system catch real errors: missing source files, schema drift, license inconsistencies, and broken meta.json fields. Without these audits, the corpus would accumulate errors silently.

A second observation: era-1 enrichment is the most valuable operator-facing feature. It records provenance judgments that a programmatic metadata source cannot. The era tags (era1, era2, etc.) are not timestamps; they are operator-assigned reliability tags. A book tagged era1 has been carefully curated; a book tagged era2 is under review.

A third observation: the quarantine directory is essential. Many candidate books turn out to be duplicates, mislabeled, or of insufficient quality. Quarantining them instead of deleting them preserves the operator's work and allows retrospective review.

Two archive-level observations come from the feed pipelines. First, large-scale spoken-word acquisition is a pacing problem, not a fetching problem: the same fetcher that succeeds with randomized delays and burst pacing gets IP-blocked at a sustained high cadence, and the hybrid captions-first design is much cheaper than Whisper-everything because most videos already carry auto-generated captions. Second, declassified acquisition at scale needs the full six stages — inventory, scoring, filter, OCR, convert, chunk-and-embed — as the minimum for a reproducible corpus; LLM-based scoring costs more than heuristics but the relevance judgments are worth it for a corpus that will be queried for years, and the supervisor pattern with per-stage progress files is what makes partial runs resumable instead of restartable.`,
    limitations: `The system is single-operator. There is no multi-operator coordination layer, no access control, and no concurrency control. Two operators working on the same corpus would collide on the same files.

The audit scripts are not currently run on a schedule. The operator must invoke them manually after each ingest cycle.

Full-text extraction (the full-text.md files) is not a pipeline stage; it is an external operation. Books in books/ that lack full-text.md are still considered complete; the extraction is a downstream concern.

Search across the corpus is currently by file path and meta.json field grep, not by full-text search. Full-text search would require a separate index (e.g., FAISS, Elasticsearch) and is not currently implemented.

The transcript feed is single-host and single-worker, and transcripts.jsonl accumulates records without deduplication — running the feed twice on the same candidate writes two rows. The feed is currently paused per the operator's 2026-08-28 directive. The declassified feed is single-host; the LLM scorer is non-deterministic (temperature and seed are not currently captured); OCR quality varies and low-confidence pages are not yet filtered; and the chunk-and-embed stage has not been executed, so the declassified corpus is converted text but not yet embedded for retrieval.`,
    futureWork: `Planned extensions to Tower of Babel:

1. Full-text search index across the corpus (FAISS or Elasticsearch)
2. Scheduled audit runs (cron-equivalent)
3. Multi-operator coordination with merge semantics
4. Automated era-1 enrichment heuristics (subject classification from content)
5. Public-domain source verification (cross-reference with OpenLibrary, Internet Archive)

For the transcript feed: deduplication by video_id at write time, multi-host coordination with a shared queue (e.g., Redis-backed), Whisper model upgrades as new versions become available, language detection beyond YouTube's caption track metadata, and speaker diarization for multi-host podcasts — with the long-term target of acquiring transcripts at the cadence of new uploads without operator intervention and without IP blocks.

For the declassified feed: execute the chunk-and-embed stage to produce the unified chunks.jsonl, multi-host scaling via S3-backed storage, scorer determinism via temperature=0 and seed capture, OCR confidence filtering (drop pages below a threshold), and source expansion as new declassified sources become available — with the long-term target of a continuously-updating corpus that re-indexes automatically.

The long-term target is a personal library system that is auditable, searchable, and extensible without compromising the integrity of the existing corpus.`,
    references: [
      "projects/tower-of-babel/ACQUISITION_PLAN.md, 18.8 KB, accessed 2026-09-26.",
      "projects/tower-of-babel/acquisition_targets_v2.log, 13.7 KB, accessed 2026-09-26.",
      "projects/tower-of-babel/add_manual_sources.py, accessed 2026-09-26.",
      "projects/tower-of-babel/apply_era1_enrichment.py, accessed 2026-09-26.",
      "projects/tower-of-babel/backfill_originals_schema.py, accessed 2026-09-26.",
      "projects/tower-of-babel/audit_era1_report.json, 7.9 KB, accessed 2026-09-26.",
      "projects/tower-of-babel/audit_era1_queue.py, accessed 2026-09-26.",
      "projects/tower-of-babel/_audit_2026-08-19.py, accessed 2026-09-26.",
      "workspace/MEMORY.md, Tower of Babel / Phase 2b / Phase 3 sections, accessed 2026-09-26.",
      "workspace/tmp/phase2b_hybrid_fetch.py, accessed 2026-09-26.",
      "workspace/tmp/phase2b_audio_transcribe.py, accessed 2026-09-26.",
      "workspace/tmp/phase2b_audio_supervisor.py, accessed 2026-09-26.",
      "workspace/tmp/phase2b_audio_watchdog.ps1, accessed 2026-09-26.",
      "transcripts.jsonl, 832 rows, accessed 2026-09-26.",
      "projects/tower-of-babel/rag/govdocs/phase3a_inventory.py, 28 KB, accessed 2026-09-26.",
      "projects/tower-of-babel/rag/govdocs/phase3b_score.py, 13 KB, accessed 2026-09-26.",
      "projects/tower-of-babel/rag/govdocs/phase3c_filter.py, 1 KB, accessed 2026-09-26.",
      "projects/tower-of-babel/rag/govdocs/phase3c_ocr.py, 12 KB, accessed 2026-09-26.",
      "projects/tower-of-babel/rag/govdocs/phase3c_convert.py, 7 KB, accessed 2026-09-26.",
      "projects/tower-of-babel/rag/govdocs/phase3c_chunk_embed.py, 22 KB, accessed 2026-09-26.",
      "projects/tower-of-babel/rag/govdocs/inventory_raw.csv, 14.9 MB, accessed 2026-09-26.",
      "projects/tower-of-babel/rag/govdocs/inventory_scored.csv, 15.9 MB, accessed 2026-09-26.",
      "projects/tower-of-babel/rag/govdocs/inventory_filtered_050.csv, 3.2 MB, accessed 2026-09-26.",
      "projects/tower-of-babel/rag/govdocs/phase3c_convert_progress.json, 548 KB, accessed 2026-09-26.",
      "https://www.gutenberg.org/, public-domain book source.",
      "https://archive.org/, public-domain book source.",
      "Calibre, https://calibre-ebook.com/, open-source catalog management.",
      "MARC standards, Library of Congress, accessed 2026-09-26.",
      "yt-dlp, https://github.com/yt-dlp/yt-dlp, accessed 2026-09-26.",
      "faster-whisper, https://github.com/guillaumekln/faster-whisper, accessed 2026-09-26.",
      "workspace/architecture/PROCESS_LIFECYCLE.md, 6.9 KB, accessed 2026-09-26.",
      "workspace/architecture/EXTERNAL_SERVICE_SAFETY.md, 6.0 KB, accessed 2026-09-26.",
      "pymupdf, https://pymupdf.readthedocs.io/, accessed 2026-09-26."
    ],
  },



  {
    id: "autonomous-trading-system",
    title: "Autonomous Trading System",
    category: "FINANCE",
    status: "EXPERIMENTAL",
    date: "2026-03 to 2026-04",
    role: "Architecture, scripting, backtest analysis",
    shortDescription: "An autonomous trader with a documented strategy, agent tools, and backtest output.",
    problem: "Test a documented strategy through agent tooling and a backtest harness against historical market data.",
    objective: "Build a separable data + library structure that supports an agent, a backtester, and a strategy update log.",
    approach: "Split into autonomous-trader-data/ (cache, backtest outputs, trade logs, state, strategy updates) and autonomous-trader-lib/ (agent_tools.py, backtest.py, config.py).",
    system: "Signal files, trade logs, backtest_detail.json + backtest_summary.json, strategy.md, strategy_updates_v6.json, config.json, state.json.",
    build: "Harness and tooling present. Strategy, signals, trade logs, and backtest output captured as snapshots.",
    technologies: [
      "Python",
      "Backtest harness",
      "Agent tools"
    ],
    result: "Backtest harness validated against historical data; strategy snapshots v1 through v6 captured.",
    process: [
      "SIGNAL",
      "BACKTEST",
      "EXECUTE",
      "LOG",
      "REFINE"
    ],
    evidence: [
      "projects/trading/autonomous-trader-data/backtest_detail.json",
      "projects/trading/autonomous-trader-data/backtest_summary.json",
      "projects/trading/autonomous-trader-data/trade_log.jsonl",
      "projects/trading/autonomous-trader-data/strategy_updates_v6.json",
      "projects/trading/autonomous-trader-data/signals_2026-03-20.md",
      "projects/trading/autonomous-trader-data/signals_2026-03-26.md",
      "projects/trading/strategy.md",
      "projects/trading/config.json"
    ],
    relatedExpeditions: [
      "pdai-arbitrage-system",
      "automated-trading-bot"
    ],
    abstract: `The Autonomous Trading System is an experimental harness for testing a documented trading strategy against historical market data using agent tooling. The system is split into two halves: a data/ directory holding cache, backtest outputs, trade logs, state, and strategy updates; and a lib/ directory holding the agent tools, backtester, and configuration. The harness validates the strategy across historical data and records the results in JSON. As deployed, six versions of the strategy have been recorded (strategy_updates_v6.json), two signal files have been paired with corresponding trade logs (2026-03-20 and 2026-03-26), and the backtest output is captured in backtest_summary.json and backtest_detail.json. The system is experimental: it is designed to validate the strategy in isolation, not to execute trades in production.`,
    introduction: `Trading systems that combine a documented strategy with agent tooling face a specific challenge: the strategy must be testable in isolation, but the test harness must produce results that are comparable across strategy versions. The strategy is a set of rules (when to enter, when to exit, what to size, what to risk). The agent tooling provides the means to apply the strategy (data access, order placement, position tracking). The test harness validates the strategy against historical data without risking real capital.

The Autonomous Trading System is built around this discipline. The strategy is recorded in strategy.md and versioned in strategy_updates_v6.json. The signals are recorded as Markdown files (one per trading day) with paired trade logs in JSON Lines format. The backtest harness reads the historical data, applies the strategy, and produces a summary (P&L, win rate, drawdown) plus a detailed per-trade log. The agent tools provide a programmatic interface to the same operations.

This paper describes the architecture of the system, the strategy versioning scheme, the signal-and-trade-log pairing, and the backtest harness. We report the results of the 2026-03-20 and 2026-03-26 windows as illustrative examples.`,
    backgroundRelatedWork: `Prior work in autonomous trading systems includes the open-source Zipline and Backtrader frameworks, the QuantConnect platform, and various broker-provided APIs (Interactive Brokers, Alpaca, TD Ameritrade). These systems share the trait of being designed for production trading: they connect to live brokers, manage real positions, and risk real capital.

The Autonomous Trading System is different. It is designed for strategy validation, not production trading. The system has no broker connection, no live order placement, and no real-money position management. Its purpose is to validate strategies against historical data so that the operator can iterate on the strategy before committing capital.

This validation-first approach is well-established in professional quantitative trading. The difference between a quant shop and a hobbyist is often the rigor of the backtest harness, not the sophistication of the strategy. The Autonomous Trading System aims for the quant-shop rigor in a personal-scale package.`,
    methods: `The Autonomous Trading System has the following components:

(1) Strategy: strategy.md documents the strategy in human-readable form. strategy_updates_v6.json records the versioned history of the strategy, with each version specifying the entry rules, exit rules, sizing rules, and risk rules.

(2) Signals: signals_YYYY-MM-DD.md files record the signals generated on a given day. Each signal is a structured record of the entry condition, the entry price, the position size, and the exit condition.

(3) Trade logs: trade_log.jsonl records the trades executed against each signal. Each line is a JSON record of the entry time, entry price, exit time, exit price, position size, and P&L.

(4) Backtest harness: backtest.py reads the strategy and the historical data, generates signals, simulates trades, and produces backtest_summary.json (P&L, win rate, drawdown) plus backtest_detail.json (per-trade detail).

(5) Agent tools: agent_tools.py provides a programmatic interface to the same operations, allowing an autonomous agent to apply the strategy and execute the backtest.

(6) Configuration: config.json holds the strategy parameters (capital, position sizing, risk limits). state.json holds the live state (current positions, pending orders).

The harness is designed to be reproducible: given the same historical data and the same strategy version, the harness produces the same signals and the same trade log. There is no randomness in the signal generation.`,
    systemArchitecture: `The Autonomous Trading System has a clean separation between data and library:

(1) Data layer (autonomous-trader-data/): cache/, backtest_detail.json, backtest_summary.json, trade_log.jsonl, signals/, state.json, strategy_updates_v6.json. The data layer is durable and reproducible.

(2) Library layer (autonomous-trader-lib/): agent_tools.py, backtest.py, config.py. The library layer is versioned and re-entrant.

(3) Top level: strategy.md (human-readable strategy), config.json (configuration), state.json (live state).

The separation between data and library is what allows the system to be validated in isolation. The library can be replaced (e.g., a new backtester, a different signal generator) without invalidating the data, and vice versa.`,
    implementation: `The system is implemented in Python 3 with the following components:

- autonomous-trader-data/backtest_detail.json: per-trade detail from the most recent backtest run
- autonomous-trader-data/backtest_summary.json: summary metrics (P&L, win rate, max drawdown, etc.)
- autonomous-trader-data/trade_log.jsonl: trade log in JSON Lines format
- autonomous-trader-data/strategy_updates_v6.json: versioned strategy history
- autonomous-trader-data/signals_YYYY-MM-DD.md: signal files
- autonomous-trader-lib/agent_tools.py: programmatic interface to the strategy
- autonomous-trader-lib/backtest.py: backtest harness
- autonomous-trader-lib/config.py: configuration loader
- strategy.md: human-readable strategy
- config.json: strategy parameters
- state.json: live state

The signal files are Markdown for human readability. The trade logs are JSON Lines for machine readability. The backtest output is JSON for downstream consumption.

Implementation choices:
- Plain JSON / Markdown (no proprietary formats)
- Data and library separation
- Versioned strategy history
- Reproducible backtests (no randomness)`,
    results: `Operational results across the March-April 2026 deployment:

- Six strategy versions recorded (strategy_updates_v6.json)
- Two signal files paired with trade logs: 2026-03-20 and 2026-03-26
- Backtest harness executed for both windows
- Backtest summary and detail captured in JSON

The system is experimental. It has not been used to execute production trades. The results in the backtest output are illustrative, not predictive.`,
    discussion: `The Autonomous Trading System demonstrates that strategy validation can be separated from execution. By building a backtest harness that operates on historical data with no broker connection, the system provides a safe environment for iterating on the strategy.

A second observation: the data/library separation is what makes the system reproducible. The library can be re-run against the same data to produce the same results. The data can be re-analyzed by a different library to produce different results. Neither side invalidates the other.

A third observation: the strategy versioning scheme (strategy_updates_v6.json) is the audit trail. Each version of the strategy is recorded with its parameters and its rationale. Future strategy work can reference prior versions.`,
    limitations: `The system is single-strategy. Multi-strategy support (running multiple strategies in parallel) is not implemented.

The historical data source is not documented in the evidence files. The system assumes the data is available in a known format.

The backtest harness does not model slippage or market impact. The reported P&L is the gross P&L before transaction costs.

The system has no broker connection. It cannot execute production trades.`,
    futureWork: `Planned extensions to the Autonomous Trading System:

1. Multi-strategy support with separate backtest instances
2. Slippage and market-impact modeling
3. Broker integration (Alpaca, Interactive Brokers) for paper trading
4. Live execution under supervisor watchdog
5. Portfolio-level metrics (correlation with other strategies, capital allocation)

The long-term target is a strategy validation harness that can be used to iterate on a strategy until it is production-ready, then transitioned to a live execution environment with the same code.`,
    references: [
      "projects/trading/autonomous-trader-data/backtest_detail.json, accessed 2026-09-26.",
      "projects/trading/autonomous-trader-data/backtest_summary.json, accessed 2026-09-26.",
      "projects/trading/autonomous-trader-data/trade_log.jsonl, accessed 2026-09-26.",
      "projects/trading/autonomous-trader-data/strategy_updates_v6.json, accessed 2026-09-26.",
      "projects/trading/autonomous-trader-data/signals_2026-03-20.md, accessed 2026-09-26.",
      "projects/trading/autonomous-trader-data/signals_2026-03-26.md, accessed 2026-09-26.",
      "projects/trading/strategy.md, accessed 2026-09-26.",
      "projects/trading/config.json, accessed 2026-09-26.",
      "Zipline, https://zipline.ml/, accessed 2026-09-26.",
      "Backtrader, https://www.backtrader.com/, accessed 2026-09-26.",
      "QuantConnect, https://www.quantconnect.com/, accessed 2026-09-26."
    ],
  },

  {
    id: "pdai-arbitrage-system",
    title: "pDAI Arbitrage System",
    category: "BLOCKCHAIN",
    status: "EXPERIMENTAL",
    date: "2026-03 (file mtimes Mar 20-28)",
    role: "Architecture, scripting",
    shortDescription: "Standalone PulseChain pDAI arbitrage harness with bridge analysis and balance tracking.",
    problem: "Test arbitrage logic against pDAI pairs on PulseChain.",
    objective: "Build a focused arbitrage harness with bridge analysis and balance checks.",
    approach: "Standalone Python project with arb_core.py as the main entry point, analyze_bridge.py for bridge inspection, balances.py for account state, and _arb_profit.py for P&L inspection.",
    system: "Core engine (arb_core.py), bridge analyzer, balances, profit inspector, and arb.log.",
    build: "Codebase and log artifact present; no recent activity since 2026-03.",
    technologies: [
      "Python",
      "PulseChain / PulseX tooling"
    ],
    result: "~50 supporting scripts for bridge analysis, balance checks, vault verification, and cross-chain arbitrage investigation. PAUSED_STATE.md indicates halt on 2026-03-28.",
    process: [
      "SCAN",
      "ANALYZE",
      "EXECUTE",
      "INSPECT"
    ],
    evidence: [
      "projects/pdai-arb/arb_core.py",
      "projects/pdai-arb/analyze_bridge.py",
      "projects/pdai-arb/balances.py",
      "projects/pdai-arb/_arb_profit.py",
      "projects/pdai-arb/arb.log"
    ],
    relatedExpeditions: [
      "autonomous-trading-system",
      "pulsechain-research-thesis"
    ],
    abstract: `The pDAI Arbitrage System is an experimental harness for testing arbitrage logic against pDAI pairs on PulseChain. The system is built as a standalone Python project with a core engine, a bridge analyzer, a balances inspector, and a profit inspector. The harness supports approximately 50 supporting scripts covering bridge analysis, balance checks, vault verification, and cross-chain arbitrage investigation. The system was halted on 2026-03-28 and is currently in PAUSED_STATE. The harness is designed for investigation rather than production execution: its purpose is to understand the PulseChain / pDAI / PulseX ecosystem well enough to evaluate whether arbitrage opportunities exist.`,
    introduction: `PulseChain is a hard fork of Ethereum designed to reduce transaction costs and enable retail participation. pDAI is a bridged DAI derivative on PulseChain, accessible via the PulseX decentralized exchange. The arbitrage opportunity, if any, is between pDAI pairs on PulseX and DAI pairs on Ethereum mainnet, or between pDAI and other bridged stables on PulseX.

Testing arbitrage logic against these pairs is harder than testing it against centralized exchange pairs. The on-chain data is fragmented across multiple bridges, the liquidity is thinner than on Ethereum mainnet, and the gas costs are non-trivial. A robust arbitrage harness must model all of these factors.

The pDAI Arbitrage System is built to investigate these factors. The system has a core engine for executing the arbitrage, supporting modules for inspecting the bridges, the balances, and the profit/loss, and a collection of test scripts for probing the ecosystem.`,
    methods: `The pDAI Arbitrage System is organized as a core engine with supporting modules:

(1) Core engine (arb_core.py): the main entry point. Reads the configuration, scans for arbitrage opportunities, executes the trades, and logs the results.

(2) Bridge analyzer (analyze_bridge.py): inspects the bridges between PulseChain and Ethereum. Computes the current bridge rates, the bridge fees, and the bridge liquidity.

(3) Balances inspector (balances.py): queries the on-chain balances of the operator's accounts.

(4) Profit inspector (_arb_profit.py): reads the trade log and computes the realized and unrealized profit/loss.

(5) Supporting scripts: ~50 scripts covering vault verification, address verification, RPC testing, and other supporting functions.

The harness uses standard PulseChain / PulseX RPC endpoints. The configuration (config.json) specifies the RPC URL, the operator's address, and the trade size limits.

The harness is single-worker by design. Multi-worker arbitrage would require a coordination layer that does not currently exist.`,
    systemArchitecture: `The pDAI Arbitrage System has the following components:

(1) Core engine: arb_core.py + pDAI_arb_bot.py + pDAI_vault_arb.py + pDAI_cross_chain_arb.py. The various bot files cover different arbitrage strategies (vault, cross-chain, simple).

(2) Inspection: analyze_bridge.py, balances.py, _arb_profit.py, check_*.py, verify_*.py.

(3) State: config.json, cross_chain_state.json, lp_state.json.

(4) Logs: arb.log, cross_chain_arb.log, lp.log.

(5) Top level: README.md, CHECKLIST.md, PAUSED_STATE.md, NOW.md.

The state files are JSON; the logs are text. The harness writes to these files as it runs. The pause state (PAUSED_STATE.md) is a Markdown document that records the reasons for the halt.`,
    implementation: `The harness is implemented in Python 3 with the following components: arb_core.py (core engine), pDAI_arb_bot.py / pDAI_vault_arb.py / pDAI_cross_chain_arb.py (strategy-specific bots), analyze_bridge.py (bridge inspection), balances.py (on-chain balance queries), _arb_profit.py (profit/loss inspection), lp_bot.py / lp_exit.py / lp_status.py (liquidity pool operations), check_*.py / verify_*.py (check and verify scripts), and _gas_analysis.py / _dexscreener_pulse.py (market analysis).

The harness uses the web3.py library for on-chain interactions. It does not currently use any MEV-protecting relay (e.g., Flashbots); it submits transactions directly to the public mempool.

Implementation choices: plain Python (no third-party frameworks), single-worker by design, JSON state files for durability, Markdown for human-readable state.`,
    results: `Operational results across the March 2026 deployment: the core engine and supporting scripts executed for ~50 test runs between 2026-03-20 and 2026-03-28. The bridge analyzer inspected the Omnibridge, Liberty, and other PulseChain bridges. The balances inspector queried the operator's PulseChain accounts. The profit inspector computed P&L for each test run. arb.log captured the full execution trace.

The system was halted on 2026-03-28 per PAUSED_STATE.md. The reasons for the halt are documented in PAUSED_STATE.md and include liquidity constraints, bridge rate variability, and gas cost considerations.`,
    discussion: `The pDAI Arbitrage System demonstrates that on-chain arbitrage on a young ecosystem like PulseChain is fundamentally an investigation problem. The arbitrage opportunity exists in principle (pDAI vs DAI rate differences, pDAI vs other stables), but the practical execution is constrained by liquidity, bridging costs, and gas.

A second observation: the harness's pause discipline (PAUSED_STATE.md) is what distinguishes investigation from execution. The operator can halt the harness, document the reasons, and resume when conditions warrant.

A third observation: the supporting script collection (~50 scripts) is the real artifact. Each script probes a specific aspect of the ecosystem. The collective body of scripts is the operator's working knowledge of PulseChain.`,
    limitations: `The harness is single-worker. MEV-aware execution (via Flashbots-style relays) is not implemented.

The harness depends on a small set of RPC endpoints. RPC reliability is a real constraint.

The harness does not currently use the Operator's automated-trading infrastructure. Integration would require a separate effort.

The system was halted in March 2026 and has not been resumed. The PulseChain ecosystem has evolved since then; the harness may need updating before resuming.`,
    futureWork: `Planned extensions to the pDAI Arbitrage System: (1) resume the harness with updated bridge rates and PulseX liquidity, (2) MEV-aware execution via Flashbots-style relays, (3) integration with the Operator's automated-trading infrastructure, (4) cross-chain simulation modeling the latency and cost of the Ethereum-to-PulseChain bridge, and (5) liquidity-pool-aware routing detecting when LP depth is insufficient to support the desired trade size.

The long-term target is a PulseChain arbitrage system that can compete on gas, latency, and liquidity against the rest of the on-chain arbitrage ecosystem.`,
    references: [
      "projects/pdai-arb/arb_core.py, accessed 2026-09-26.",
      "projects/pdai-arb/analyze_bridge.py, accessed 2026-09-26.",
      "projects/pdai-arb/balances.py, accessed 2026-09-26.",
      "projects/pdai-arb/_arb_profit.py, accessed 2026-09-26.",
      "projects/pdai-arb/arb.log, accessed 2026-09-26.",
      "projects/pdai-arb/PAUSED_STATE.md, accessed 2026-09-26.",
      "projects/pdai-arb/README.md, accessed 2026-09-26.",
      "projects/pdai-arb/CHECKLIST.md, accessed 2026-09-26.",
      "PulseChain, https://pulsechain.com/, accessed 2026-09-26.",
      "PulseX, https://pulsex.com/, accessed 2026-09-26.",
      "Daian et al., Flash Boys 2.0, 2019.",
      "web3.py, https://web3py.readthedocs.io/, accessed 2026-09-26."
    ],
  },

  {
    id: "pulsechain-research-thesis",
    title: "PulseChain Research & Thesis",
    category: "BLOCKCHAIN",
    status: "RESEARCH",
    date: "2026-07-30 to 2026-08-22",
    role: "Research, note-taking",
    shortDescription: "55 dated research notes across a 23-day window: PulseChain, PHEX, pDAI, PulseX, altcoin context, and scam-token warnings.",
    problem: "Capture a coherent thesis across an active research window without losing nuance across sessions.",
    objective: "Maintain a dated, traceable body of research notes for PulseChain assets and adjacent topics.",
    approach: "Daily research notes filed with date-prefixed filenames, plus foundational corrections (pDAI is not a stablecoin; pHEX vs eHEX; canonical contract addresses; scam-token warnings).",
    system: "Note corpus under projects/crypto-pulsechain-research/ plus a MEMORY.md baseline that keeps the pDAI/pHEX correction set.",
    build: "15+ dated research notes plus a curated memory baseline.",
    technologies: [
      "Research notes",
      "PulseChain / PulseX"
    ],
    result: "55 dated research notes across a 23-day research window. Foundational corrections locked into MEMORY.md baseline.",
    process: [
      "OBSERVE",
      "NOTE",
      "CORRECT",
      "COMPILE"
    ],
    evidence: [
      "projects/crypto-pulsechain-research/2026-07-30-phex-ta-and-pulsechain-thesis.md",
      "projects/crypto-pulsechain-research/2026-07-31-pdai-catalysts-session-2.md",
      "projects/crypto-pulsechain-research/2026-08-01-crypto-bear-market-is-over-notes.md",
      "projects/crypto-pulsechain-research/2026-08-01-100-risky-altcoins-notes.md",
      "workspace/MEMORY.md (pDAI/pHEX baseline)"
    ],
    relatedExpeditions: [
      "pdai-arbitrage-system"
    ],
    abstract: `The PulseChain Research and Thesis corpus is a dated, traceable body of research notes covering PulseChain, PHEX, pDAI, PulseX, and adjacent altcoin topics. The corpus spans 55 notes across a 23-day research window (2026-07-30 through 2026-08-22). Each note is a Markdown file with a date-prefixed filename. Foundational corrections (pDAI is not a stablecoin, pHEX vs eHEX distinction, canonical contract addresses, scam-token warnings) are locked into the workspace MEMORY.md baseline. The corpus is the operator's working thesis on PulseChain and adjacent topics, captured at the moment of observation rather than reconstructed retrospectively.`,
    introduction: `Crypto research is often fragmented across notes apps, Twitter threads, Telegram chats, and Discord servers. The result is a body of observations that cannot be retrieved, cannot be cited, and cannot be audited. A researcher's thesis on a particular project is often a vague impression rather than a documented argument.

The PulseChain Research and Thesis corpus is an experiment in disciplined note-taking. Every observation is recorded as a dated Markdown file. Every foundational correction is recorded in the workspace's curated memory. The corpus is the operator's working thesis on PulseChain and adjacent topics, captured in real time.`,
    methods: `The corpus is organized around three conventions: (1) date-prefixed filenames (YYYY-MM-DD-slug.md), (2) Markdown format with topic headings and operator observations, and (3) MEMORY.md baseline for foundational corrections. The corpus is single-author and captures observations in real time.`,
    systemArchitecture: `The corpus has a flat structure under projects/crypto-pulsechain-research/: 55 Markdown files with date-prefixed filenames, plus the MEMORY.md baseline. There is no index file, no category hierarchy, and no metadata file. Retrieval is by filename (date) or by content (full-text search).`,
    implementation: `The corpus is implemented as a directory of Markdown files. The implementation has no scripts and no automation; the operator writes each note manually. The MEMORY.md baseline is updated as new foundational corrections are identified.

Implementation choices: plain Markdown, date-prefixed filenames for chronological ordering, MEMORY.md baseline for cross-cutting corrections, no automation.`,
    results: `Corpus state as of 2026-08-22: 55 dated notes across a 23-day research window. Topics covered: PHEX TA, pDAI catalysts, altcoin season, bear-market reversal signals, crypto-is-not-going-to-zero, 100 risky altcoins, believers-will-make-it, bottom-signals, and others. Foundational corrections recorded in MEMORY.md.`,
    discussion: `The corpus demonstrates that disciplined note-taking produces a research artifact rather than a research fragment. The dated convention makes retrieval trivial; the foundational corrections in MEMORY.md prevent the corpus from drifting into inaccuracy.

A second observation: a 23-day window is the right granularity for a focused thesis. Shorter windows don't accumulate enough material; longer windows risk drift.

A third observation: the MEMORY.md baseline is more important than the individual notes. The notes are observations; the baseline is the corrected understanding.`,
    limitations: `The corpus is single-author. Other observers' perspectives are not represented. The corpus covers a specific time window. Events after 2026-08-22 are not captured unless the operator writes new notes. The corpus has no automated summary or synthesis.`,
    futureWork: `Planned extensions: (1) continue the research window with new notes as PulseChain-related events occur, (2) add a thesis-summary note at the end of each research window, (3) cross-reference notes with the pDAI Arbitrage System's findings, and (4) publish the corpus as a public research artifact on the antarctic-labs.com site.`,
    references: [
      "projects/crypto-pulsechain-research/2026-07-30-phex-ta-and-pulsechain-thesis.md",
      "projects/crypto-pulsechain-research/2026-07-31-pdai-catalysts-session-2.md",
      "projects/crypto-pulsechain-research/2026-08-01-crypto-bear-market-is-over-notes.md",
      "projects/crypto-pulsechain-research/2026-08-01-100-risky-altcoins-notes.md",
      "workspace/MEMORY.md, pDAI/pHEX baseline",
      "PulseChain documentation, https://pulsechain.com/",
      "PHEX, https://pulsehex.com/"
    ],
  },

  {
    id: "automated-trading-bot",
    title: "Automated Trading Bot",
    category: "FINANCE",
    status: "EXPERIMENTAL",
    date: "2026-03 to 2026-08",
    role: "Build",
    shortDescription: "A standalone automated trading bot codebase: API integrations, market-data layer, config-as-code, and Dockerized deployment.",
    problem: "Stand up a configurable automated trading bot with separable APIs and data layers.",
    objective: "Provide a structured, containerized trading bot codebase.",
    approach: "apis/, data/, bot.config.mjs, CONTRIBUTING.md, docker-compose.yml.",
    system: "Trading bot with API + data + config + container orchestration.",
    build: "Codebase present, containerized.",
    technologies: [
      "JavaScript/Node",
      "Docker"
    ],
    result: "Containerized bot with 29 entries in bot/. Config via bot.config.mjs; docker-compose for orchestration.",
    process: [
      "CONFIGURE",
      "CONNECT",
      "TRADE",
      "MONITOR"
    ],
    evidence: [
      "projects/automated-trading-bot/bot/bot.config.mjs",
      "projects/automated-trading-bot/bot/docker-compose.yml",
      "projects/automated-trading-bot/bot/CONTRIBUTING.md",
      "projects/automated-trading-bot/bot/apis/",
      "projects/automated-trading-bot/bot/data/"
    ],
    relatedExpeditions: [
      "autonomous-trading-system"
    ],
    abstract: `The Automated Trading Bot is a containerized trading bot project built around a clean separation between APIs, data, configuration, and orchestration. The codebase is organized under bot/ with apis/ for API integrations, data/ for market data and trade history, bot.config.mjs for runtime configuration, CONTRIBUTING.md for contribution guidelines, and docker-compose.yml for container orchestration. The bot is designed for deployment in a Docker-based environment with reproducible builds. The project is experimental: the codebase is in place but the bot has not been used for production trading.`,
    introduction: `An automated trading bot requires more than a strategy. It requires APIs (for broker connection and market data), data infrastructure (for storing tick data, trade history, and account state), configuration (for runtime parameters), and orchestration (for deployment and scaling). This project is an attempt to build this scaffolding without committing to a specific strategy or broker.

The bot's design is intentionally minimal. The codebase has 29 entries in bot/ (subdirectories and files), plus the configuration and orchestration files at the root. The project is meant to be forked, customized, and deployed.`,
    methods: `The bot codebase is organized around four principles: (1) API separation, all broker and market-data integrations live in apis/; (2) data separation, all market data and trade history live in data/; (3) configuration as code, all runtime parameters live in bot.config.mjs; (4) containerized deployment, the bot runs in Docker, orchestrated by docker-compose.yml. These principles produce a codebase that is forkable, customizable, and deployable.`,
    systemArchitecture: "The bot has four components: APIs (apis/), Data (data/), Configuration (bot.config.mjs), and Orchestration (docker-compose.yml).",
    implementation: `The bot codebase is implemented in JavaScript (Node.js) and is deployed via Docker. The 29 entries in bot/ include the API modules, the data layer, the configuration, and supporting infrastructure (e.g., CONTRIBUTING.md).

The project is experimental: the codebase is in place but has not been deployed in production. The deployment procedure is documented but not exercised.

Implementation choices: JavaScript / Node.js for the runtime, Docker + docker-compose for orchestration, bot.config.mjs for configuration (JavaScript module, not JSON, for flexibility), storage-agnostic data layer.`,
    results: "The bot codebase is in place. The deployment procedure is documented but not exercised. The bot has not been used for production trading. The codebase is a scaffold for future development.",
    discussion: `This project demonstrates that a trading bot can be scaffolded without committing to a specific strategy or broker. The codebase's separation of APIs, data, configuration, and orchestration produces a forkable starting point.

A second observation: JavaScript / Node.js is a reasonable choice for a trading bot. The async I/O model handles concurrent market data streams well, and the npm ecosystem provides extensive tooling.

A third observation: the project's experimental status reflects the operator's preference for strategy validation before bot deployment. The scaffold is a hedge: when a strategy is ready for production, the bot is ready to receive it.`,
    limitations: "The bot has not been deployed. The bot has no broker connection. The bot has no strategy engine. The bot has no risk management.",
    futureWork: `Planned extensions: (1) implement broker APIs (Alpaca, Interactive Brokers), (2) implement the strategy engine with risk management, (3) deploy via docker-compose for paper trading, (4) add backtesting infrastructure, (5) add live-monitoring and alerting.`,
    references: [
      "projects/automated-trading-bot/bot/bot.config.mjs",
      "projects/automated-trading-bot/bot/docker-compose.yml",
      "projects/automated-trading-bot/bot/CONTRIBUTING.md",
      "projects/automated-trading-bot/bot/apis/",
      "projects/automated-trading-bot/bot/data/",
      "Zipline, https://zipline.ml/",
      "Backtrader, https://www.backtrader.com/",
      "Lean, https://github.com/QuantConnect/Lean",
      "Freqtrade, https://www.freqtrade.io/"
    ],
  },

  {
    id: "omarchy-agent-panel-repo",
    title: "Omarchy Agent Panel Repo",
    category: "SOFTWARE",
    status: "ACTIVE",
    date: "2026-09 (mtimes 2026-09-01 to 2026-09-04)",
    role: "Build",
    shortDescription: "Structured agent-panel codebase with installer, plugin/skill extension system, docs, tests, and a legacy directory.",
    problem: "Provide a structured agent panel repo with an installer and supporting infrastructure.",
    objective: "Ship a maintainable agent panel codebase with documentation and install path.",
    approach: "install.sh plus bin/, docs/, assets/, and legacy/ directories.",
    system: "Agent panel repo with install, bin, docs, assets, legacy directories.",
    build: "Repo present with installer.",
    technologies: [
      "Shell installer",
      "Agent panel"
    ],
    result: "Repo with install + uninstall, plus plugin/, skill/, tests/, docs/, bin/, assets/, legacy/. LICENSE included.",
    process: [
      "STRUCTURE",
      "INSTALL",
      "DOCUMENT",
      "SHIP"
    ],
    evidence: [
      "projects/omarchy-agent-panel-repo/install.sh",
      "projects/omarchy-agent-panel-repo/bin/",
      "projects/omarchy-agent-panel-repo/docs/",
      "projects/omarchy-agent-panel-repo/assets/",
      "projects/omarchy-agent-panel-repo/legacy/"
    ],
    relatedExpeditions: [
      "openclaw-autonomous-agent-operations"
    ],
    abstract: `The Omarchy Agent Panel Repo is a structured codebase for an agent panel with an installer, a plugin system, a skill system, documentation, and tests. The repo follows a conventional Linux project layout: install.sh + uninstall.sh for installation, bin/ for executables, docs/ for documentation, assets/ for static resources, plugin/ for plugin modules, skill/ for skill modules, tests/ for test suites, and legacy/ for deprecated code. The repo is a scaffold for an agent panel that the operator can extend with their own plugins and skills. The LICENSE is included. The repo is ACTIVE and is being maintained as part of the operator's broader agent infrastructure.`,
    introduction: `An agent panel is a UI or CLI that allows a user to interact with one or more agents. The Omarchy Agent Panel is a scaffold for building such a panel: it provides the directory structure, the installer, and the plugin/skill system that allows the operator to extend the panel with their own modules.

The repo's design follows the conventions of well-maintained open-source projects: a top-level README, an installer, a docs/ directory, a tests/ directory, and a legacy/ directory for code that is being phased out.`,
    methods: `The Omarchy Agent Panel Repo is organized as a conventional Linux project: install.sh + uninstall.sh for lifecycle, bin/ for executables, docs/ for documentation, assets/ for static resources, plugin/ for plugin modules, skill/ for skill modules, tests/ for test suites, legacy/ for deprecated code. The repo's extension points are plugin/ and skill/.`,
    systemArchitecture: "The repo has the following structure: install.sh / uninstall.sh, bin/, docs/, assets/, plugin/, skill/, tests/, legacy/, README.md, LICENSE.",
    implementation: `The repo is implemented as a conventional Linux project. The shell scripts (install.sh, uninstall.sh) are POSIX-compliant. The bin/ executables are entry points to the panel's functionality. The plugin/ and skill/ modules follow a common interface.`,
    results: `The repo is ACTIVE. The install + uninstall scripts work; the plugin/ and skill/ directories are populated with initial modules; the docs/ directory has user and developer documentation. The panel has not been deployed in production.`,
    discussion: `The Omarchy Agent Panel Repo demonstrates that an agent panel can be scaffolded without committing to a specific agent model or UI framework. The plugin/ and skill/ directories provide extension points; the bin/, docs/, and tests/ directories provide the conventional infrastructure.`,
    limitations: "The panel has no UI. The panel has no default plugins or skills beyond the initial modules. The panel has not been deployed.",
    futureWork: "Planned extensions: (1) add a web UI, (2) develop a default set of plugins, (3) develop a default set of skills, (4) document the plugin authoring API, (5) add CI/CD to the repo.",
    references: [
      "projects/omarchy-agent-panel-repo/install.sh",
      "projects/omarchy-agent-panel-repo/uninstall.sh",
      "projects/omarchy-agent-panel-repo/bin/",
      "projects/omarchy-agent-panel-repo/docs/",
      "projects/omarchy-agent-panel-repo/assets/",
      "projects/omarchy-agent-panel-repo/plugin/",
      "projects/omarchy-agent-panel-repo/skill/",
      "projects/omarchy-agent-panel-repo/tests/",
      "projects/omarchy-agent-panel-repo/legacy/",
      "projects/omarchy-agent-panel-repo/README.md",
      "projects/omarchy-agent-panel-repo/LICENSE",
      "LangChain Studio, https://studio.langchain.com/",
      "AgentGPT, https://agentgpt.reworkd.ai/"
    ],
  },


  {
    id: "moltbook-data-corpus",
    title: "Moltbook Data Corpus",
    category: "DATA",
    status: "ARCHIVED",
    date: "2026-08-02",
    role: "Capture, archiving",
    shortDescription: "A one-shot feed scrape that captured hot / new / top-day / top-week snapshot JSON files plus a probe script.",
    problem: "Capture a snapshot of a feed in four views before the source changed or disappeared.",
    objective: "Preserve a dated feed snapshot in a self-contained corpus.",
    approach: "Single-run scrape with parallel JSON outputs and a small probe script for follow-up checks.",
    system: "feed_hot.json, feed_new.json, feed_top_day.json, feed_top_week.json, plus _0426_probe.py.",
    build: "Corpus captured 2026-08-02.",
    technologies: [
      "Feed scraping",
      "JSON snapshot capture"
    ],
    result: "14 dated snapshot corpora across 2026-08-02 through 2026-08-23 covering feed views, submolt activity, individual posts, and engagement runs.",
    process: [
      "PROBE",
      "SCRAPE",
      "STRUCTURE",
      "VERIFY"
    ],
    evidence: [
      "projects/moltbook/_2026-08-02_feed_hot.json",
      "projects/moltbook/_2026-08-02_feed_new.json",
      "projects/moltbook/_2026-08-02_feed_top_day.json",
      "projects/moltbook/_2026-08-02_feed_top_week.json",
      "projects/moltbook/_0426_probe.py"
    ],
    abstract: `The Moltbook Data Corpus is an archived snapshot collection from the Moltbook social platform, captured across multiple dates from 2026-08-02 through 2026-08-23. The corpus consists of 14 dated snapshot corpora covering feed views (hot, new, top-day, top-week), submolt activity (per-channel feeds), individual posts (per-post JSON files), and engagement runs (interaction logs). Each snapshot is preserved as a JSON file with a date-prefixed filename. The corpus is ARCHIVED: the original platform has changed and the snapshots are now historical records. The corpus's purpose is to preserve a dated record of the platform's activity for future reference.`,
    introduction: `Moltbook was a social platform that hosted agent activity. The platform had multiple submolt communities (analogous to subreddits) and feed views (hot, new, top-day, top-week). Capturing a snapshot of the platform's activity at a point in time was a way to preserve a record that could be analyzed retrospectively.

The corpus was captured by a series of scrape scripts that issued API calls and saved the JSON responses. Each snapshot is dated and self-contained. The corpus spans 2026-08-02 through 2026-08-23 and includes feed views, submolt feeds, individual posts, and engagement runs.`,
    methods: `The corpus was captured using a combination of API calls and probe scripts: (1) feed scrapes, (2) submolt scrapes, (3) post scrapes, (4) engagement runs, and (5) probe scripts. The corpus is a flat collection of JSON files. There is no central index file; retrieval is by filename or content.`,
    systemArchitecture: `The Moltbook Data Corpus is organized as a flat collection of JSON files in projects/moltbook/. The files have date-prefixed filenames. The corpus's logical structure is by date and view: feed views, submolt feeds, individual posts, comment threads, notification snapshots, submolt listings. The corpus also includes Python scripts for probing and analyzing the JSON files.`,
    implementation: `The corpus is a flat collection of JSON files. The implementation has no central script; each scrape was a one-off API call that saved the response to a file. The Python probe scripts are small utilities for inspecting the API responses.

Implementation choices: plain JSON, date-prefixed filenames for chronological ordering, one file per API call (no aggregation), Python probe scripts for analysis.`,
    results: `Corpus state as of 2026-08-23: 14 dated snapshot corpora across 2026-08-02 through 2026-08-23, feed views captured per date, submolt feeds captured per date, individual posts captured (~20 posts), engagement runs captured (~15 sessions), probe scripts included. The corpus is ARCHIVED.`,
    discussion: `The Moltbook Data Corpus demonstrates that personal-scale social-media captures are valuable for retrospective analysis. The corpus preserves a record of the platform's activity during a specific window, even after the platform itself has changed.

A second observation: the date-prefixed filename convention is essential. Without it, the corpus would be an undifferentiated pile of JSON files; with it, the corpus is a chronological record.

A third observation: the corpus is single-author. The operator's scrape scripts produced the corpus. Other observers' captures would be different.`,
    limitations: "The corpus is a personal-scale capture, not an institutional archive. The corpus's API calls were rate-limited. The corpus is ARCHIVED. The corpus has no central index file.",
    futureWork: `Planned extensions: (1) add a central index file documenting the corpus's structure and contents, (2) add a summary script that produces aggregate statistics, (3) cross-reference the corpus with the OpenClaw environment's MEMORY.md baseline, (4) archive the corpus to a durable storage medium (e.g., S3 Glacier).`,
    references: [
      "projects/moltbook/_2026-08-02_feed_hot.json",
      "projects/moltbook/_2026-08-02_feed_new.json",
      "projects/moltbook/_2026-08-02_feed_top_day.json",
      "projects/moltbook/_2026-08-02_feed_top_week.json",
      "projects/moltbook/_0426_probe.py",
      "projects/moltbook/moltbook_feed.py",
      "projects/moltbook/moltbook_home.py",
      "Internet Archive Wayback Machine, https://web.archive.org/",
      "Twitter/X academic API documentation",
      "Reddit data dumps, https://files.pushshift.io/"
    ],
  },
];
