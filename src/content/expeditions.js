// Expedition data model + catalog. Each record is built only from
// facts verified during the Stage C inventory scan of the workspace.
// Missing or unverifiable fields are left empty. No fabricated
// outcomes, users, clients, revenue, profits, deployment, or
// production usage.

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
  // 1. OpenClaw / Autonomous Agent Operations
  {
    id: "openclaw-autonomous-agent-operations",
    title: "OpenClaw / Autonomous Agent Operations",
    category: "AI",
    status: "ACTIVE",
    date: "2026-08 → ongoing",
    role: "Architecture, build, operations",
    shortDescription:
      "A personal autonomous agent operating environment: identity, memory, skills, architecture, and operational discipline.",
    problem:
      "Operating an autonomous agent across long sessions requires durable identity, structured memory, an architecture layer, and operational discipline to keep work safe and recoverable.",
    objective:
      "Build an agent environment that can run continuously, remember what matters, and remain auditable.",
    approach:
      "Layered architecture: identity (SOUL/IDENTITY/USER), 3-layer memory (NOW / daily / MEMORY), architecture specs (AUTOPILOT_MODE, JOB_ORCHESTRATION, PROCESS_LIFECYCLE, etc.), workshop skills catalog, and core operating rules.",
    system:
      "Agent runtime with explicit lifecycle, pause/resume, kill process + watchdog, external-service safety, messenger detachment, and state + resume contracts.",
    build:
      "OpenClaw workspace with AGENTS.md, SOUL.md, IDENTITY.md, USER.md, NOW.md, MEMORY.md, architecture/ spec set, skills/ workshop catalog.",
    technologies: ["OpenClaw", "Skills Workshop", "Markdown-based specs"],
    result: "",
    evidence: [
      "workspace/AGENTS.md",
      "workspace/SOUL.md (10k)",
      "workspace/IDENTITY.md",
      "workspace/USER.md",
      "workspace/MEMORY.md (117k)",
      "workspace/NOW.md (42k)",
      "workspace/architecture/ (10 spec files)",
    ],
    links: [],
    media: [],
    relatedExpeditions: [
      "tower-of-babel-library-archive",
      "phase-2b-podcast-transcript-pipeline",
      "phase-3-declassified-documents-pipeline",
    ],
  },

  // 2. Tower of Babel Library / Archive System
  {
    id: "tower-of-babel-library-archive",
    title: "Tower of Babel Library / Archive System",
    category: "SOFTWARE",
    status: "ACTIVE",
    date: "2026-08 → 2026-09",
    role: "Architecture, ingestion tooling, audit pipeline",
    shortDescription:
      "A personal library and archival system for books, documents, research, references, and other material — collected, scored, and structured into one searchable corpus.",
    problem:
      "Scattered knowledge across files, sources, and formats needs a structured ingest pipeline plus an audit system to keep the collection honest.",
    objective:
      "Build a reproducible ingestion + enrichment + audit pipeline for a personal library archive.",
    approach:
      "Python tooling for manual source addition, era-1 enrichment, schema backfill, and audits. Documented acquisition plan and target log.",
    system:
      "Ingestion scripts (add_manual_sources.py, apply_era1_enrichment.py, backfill_originals_schema.py), audit scripts (audit_era1_queue.py, _audit_2026-08-19.py), batches directory, era-1 audit reports.",
    build:
      "Project tree under projects/tower-of-babel/ with ACQUISITION_PLAN.md, acquisition_targets_v2.log, audit_era1_report.json, and pipeline scripts.",
    technologies: ["Python", "Schema backfill tooling", "Audit pipelines"],
    result: "",
    evidence: [
      "projects/tower-of-babel/ACQUISITION_PLAN.md (18.8k)",
      "projects/tower-of-babel/acquisition_targets_v2.log (13.7k)",
      "projects/tower-of-babel/add_manual_sources.py",
      "projects/tower-of-babel/apply_era1_enrichment.py",
      "projects/tower-of-babel/backfill_originals_schema.py",
      "projects/tower-of-babel/audit_era1_report.json",
    ],
    links: [],
    media: [],
    relatedExpeditions: [
      "openclaw-autonomous-agent-operations",
      "phase-2b-podcast-transcript-pipeline",
      "phase-3-declassified-documents-pipeline",
    ],
  },

  // 3. Phase 2b Podcast Transcript Pipeline
  {
    id: "phase-2b-podcast-transcript-pipeline",
    title: "Phase 2b Podcast Transcript Pipeline",
    category: "DATA",
    status: "IN DEVELOPMENT",
    date: "2026-08 (development paused per Josh's directive 2026-08-28)",
    role: "Architecture, scripting, watchdog supervision",
    shortDescription:
      "Pipeline that fetches YouTube captions and Whisper transcripts for scored podcasts and embeds them into the Tower of Babel RAG.",
    problem:
      "Acquire transcripts for 4,072 scored podcasts at a cadence that respects YouTube's unspecified rate limits and avoids IP blocking.",
    objective:
      "Build a residential-IP-paced fetch pipeline with pre-flight probing, Whisper fallback, and supervisor watchdog.",
    approach:
      "Single-worker hybrid fetcher with pre-flight probe, 60s warmup, shuffled order. Whisper fallback with burst pacing and OOM cleanup. Supervisor watchdog that respects a pause sentinel.",
    system:
      "phase2b_hybrid_fetch.py (captions), phase2b_audio_transcribe.py (Whisper), phase2b_audio_supervisor.py (watchdog), phase2b_audio_watchdog.ps1 (cron equivalent).",
    build:
      "Pipeline scripts in tmp/ plus supervisor cron jobs (paused). transcripts.jsonl accumulates 832 rows across captions + subs + whisper + needs_whisper.",
    technologies: ["Python", "Whisper", "YouTube captions API", "Supervisor watchdog"],
    result:
      "832 transcripts written across four categories. Pipeline paused per Josh's directive to avoid IP-block hammering.",
    evidence: [
      "workspace/MEMORY.md (Phase2b section)",
      "workspace/tmp/phase2b_hybrid_fetch.py",
      "workspace/tmp/phase2b_audio_transcribe.py",
      "workspace/tmp/phase2b_audio_supervisor.py",
      "workspace/tmp/phase2b_audio_watchdog.ps1",
      "transcripts.jsonl (832 rows)",
    ],
    links: [],
    media: [],
    relatedExpeditions: [
      "tower-of-babel-library-archive",
      "openclaw-autonomous-agent-operations",
    ],
  },

  // 4. Phase 3 Declassified Documents Pipeline
  {
    id: "phase-3-declassified-documents-pipeline",
    title: "Phase 3 Declassified Documents Pipeline",
    category: "DATA",
    status: "IN DEVELOPMENT",
    date: "2026-08 (Phase 3a/b/c complete; 3c-4 chunk+embed not yet started)",
    role: "Architecture, scripting",
    shortDescription:
      "Acquire, score, OCR, convert, and embed government declassified documents (e.g., CIA) into the Tower of Babel RAG.",
    problem:
      "Government declassified documents exist in many formats and qualities; useful ingestion needs inventory, scoring, filtering, OCR, conversion, and chunk + embed.",
    objective:
      "Build a multi-stage pipeline that brings 16,465 inventoried documents from 5 sources into a single usable archive.",
    approach:
      "Six discrete phases — inventory, score, filter, OCR, convert, chunk + embed. Approved PDF tool: pdf-inspector (MIT, free).",
    system:
      "phase3a_inventory.py, phase3b_score.py, phase3c_filter.py, phase3c_ocr.py, phase3c_convert.py, phase3c_chunk_embed.py, plus supervisors.",
    build:
      "Inventory complete (16,465 docs from 5 sources). Scoring, filtering, OCR, and conversion complete. Chunk + embed phase not yet started.",
    technologies: ["Python", "OCR tooling", "pdf-inspector", "Chunk + embed pipeline"],
    result: "16,465 docs inventoried and scored; pipeline ready for the chunk + embed phase on Josh's signal.",
    evidence: [
      "workspace/MEMORY.md (Phase 3 section)",
      "projects/tower-of-babel/rag/govdocs/phase3a_inventory.py",
      "projects/tower-of-babel/rag/govdocs/phase3b_score.py",
      "projects/tower-of-babel/rag/govdocs/phase3c_filter.py",
      "projects/tower-of-babel/rag/govdocs/phase3c_ocr.py",
      "projects/tower-of-babel/rag/govdocs/phase3c_convert.py",
      "projects/tower-of-babel/rag/govdocs/phase3c_chunk_embed.py",
    ],
    links: [],
    media: [],
    relatedExpeditions: [
      "tower-of-babel-library-archive",
      "openclaw-autonomous-agent-operations",
    ],
  },

  // 5. Autonomous Trading System
  {
    id: "autonomous-trading-system",
    title: "Autonomous Trading System",
    category: "FINANCE",
    status: "EXPERIMENTAL",
    date: "2026-03 → 2026-04",
    role: "Architecture, scripting, backtest analysis",
    shortDescription:
      "An autonomous trader with a documented strategy, agent tools, and backtest output.",
    problem:
      "Test a documented strategy through agent tooling and a backtest harness against historical market data.",
    objective:
      "Build a separable data + library structure that supports an agent, a backtester, and a strategy update log.",
    approach:
      "Split into autonomous-trader-data/ (cache, backtest outputs, trade logs, state, strategy updates) and autonomous-trader-lib/ (agent_tools.py, backtest.py, config.py).",
    system:
      "Signal files (signals_2026-03-20.md, signals_2026-03-26.md), trade logs, backtest_detail.json + backtest_summary.json, strategy.md, strategy_updates_v6.json, config.json, state.json.",
    build:
      "Harness and tooling present. Strategy, signals, trade logs, and backtest output captured as snapshots.",
    technologies: ["Python", "Backtest harness", "Agent tools"],
    result: "",
    evidence: [
      "projects/trading/autonomous-trader-data/backtest_detail.json",
      "projects/trading/autonomous-trader-data/backtest_summary.json",
      "projects/trading/autonomous-trader-data/trade_log.jsonl",
      "projects/trading/autonomous-trader-data/strategy_updates_v6.json",
      "projects/trading/autonomous-trader-data/signals_2026-03-20.md",
      "projects/trading/autonomous-trader-data/signals_2026-03-26.md",
      "projects/trading/strategy.md",
      "projects/trading/config.json",
    ],
    links: [],
    media: [],
    relatedExpeditions: ["pdai-arbitrage-system", "crucix-trading-platform"],
  },

  // 6. pDAI Arbitrage System
  {
    id: "pdai-arbitrage-system",
    title: "pDAI Arbitrage System",
    category: "BLOCKCHAIN",
    status: "EXPERIMENTAL",
    date: "2026-03 (file mtimes Mar 20–28)",
    role: "Architecture, scripting",
    shortDescription:
      "Standalone PulseChain pDAI arbitrage harness with bridge analysis and balance tracking.",
    problem:
      "Test arbitrage logic against pDAI pairs on PulseChain.",
    objective:
      "Build a focused arbitrage harness with bridge analysis and balance checks.",
    approach:
      "Standalone Python project with arb_core.py as the main entry point, analyze_bridge.py for bridge inspection, balances.py for account state, and _arb_profit.py for P&L inspection.",
    system:
      "Core engine (arb_core.py), bridge analyzer, balances, profit inspector, and arb.log.",
    build:
      "Codebase and log artifact present; no recent activity since 2026-03.",
    technologies: ["Python", "PulseChain / PulseX tooling"],
    result: "",
    evidence: [
      "projects/pdai-arb/arb_core.py",
      "projects/pdai-arb/analyze_bridge.py",
      "projects/pdai-arb/balances.py",
      "projects/pdai-arb/_arb_profit.py",
      "projects/pdai-arb/arb.log",
    ],
    links: [],
    media: [],
    relatedExpeditions: ["autonomous-trading-system", "pulsechain-research-thesis"],
  },

  // 7. PulseChain Research & Thesis
  {
    id: "pulsechain-research-thesis",
    title: "PulseChain Research & Thesis",
    category: "BLOCKCHAIN",
    status: "RESEARCH",
    date: "2026-07-30 → 2026-08-22",
    role: "Research, note-taking",
    shortDescription:
      "Dated research notes on PulseChain, PHEX, pDAI, PulseX, altcoin context, and scam-token warnings.",
    problem:
      "Capture a coherent thesis across an active research window without losing nuance across sessions.",
    objective:
      "Maintain a dated, traceable body of research notes for PulseChain assets and adjacent topics.",
    approach:
      "Daily research notes filed with date-prefixed filenames, plus foundational corrections (pDAI is not a stablecoin; pHEX vs eHEX; canonical contract addresses; scam-token warnings).",
    system:
      "Note corpus under projects/crypto-pulsechain-research/ plus a MEMORY.md baseline that keeps the pDAI/pHEX correction set.",
    build:
      "15+ dated research notes plus a curated memory baseline.",
    technologies: ["Research notes", "PulseChain / PulseX"],
    result: "",
    evidence: [
      "projects/crypto-pulsechain-research/2026-07-30-phex-ta-and-pulsechain-thesis.md",
      "projects/crypto-pulsechain-research/2026-07-31-pdai-catalysts-session-2.md",
      "projects/crypto-pulsechain-research/2026-08-01-crypto-bear-market-is-over-notes.md",
      "projects/crypto-pulsechain-research/2026-08-01-100-risky-altcoins-notes.md",
      "workspace/MEMORY.md (pDAI/pHEX baseline)",
    ],
    links: [],
    media: [],
    relatedExpeditions: ["pdai-arbitrage-system"],
  },

  // 8. Crucix Trading Platform
  {
    id: "crucix-trading-platform",
    title: "Crucix Trading Platform",
    category: "FINANCE",
    status: "EXPERIMENTAL",
    date: "2026-03 → 2026-08",
    role: "Build",
    shortDescription:
      "A standalone trading platform project with APIs, data, configuration, and Dockerized setup.",
    problem:
      "Stand up a configurable trading platform with separable APIs and data layers.",
    objective:
      "Provide a structured, containerized trading platform codebase.",
    approach:
      "apis/, data/, crucix.config.mjs, CONTRIBUTING.md, docker-compose.yml.",
    system: "Trading platform with API + data + config + container orchestration.",
    build: "Codebase present, containerized.",
    technologies: ["JavaScript/Node", "Docker"],
    result: "",
    evidence: [
      "projects/crucix/crucix/crucix.config.mjs",
      "projects/crucix/crucix/docker-compose.yml",
      "projects/crucix/crucix/CONTRIBUTING.md",
      "projects/crucix/crucix/apis/",
      "projects/crucix/crucix/data/",
    ],
    links: [],
    media: [],
    relatedExpeditions: ["autonomous-trading-system"],
  },

  // 9. Omarchy Agent Panel Repo
  {
    id: "omarchy-agent-panel-repo",
    title: "Omarchy Agent Panel Repo",
    category: "SOFTWARE",
    status: "ACTIVE",
    date: "2026-09 (mtimes 2026-09-01 → 2026-09-04)",
    role: "Build",
    shortDescription:
      "Repo for an agent panel with installer, bin/, docs/, assets/, and a legacy directory.",
    problem: "Provide a structured agent panel repo with an installer and supporting infrastructure.",
    objective: "Ship a maintainable agent panel codebase with documentation and install path.",
    approach: "install.sh plus bin/, docs/, assets/, and legacy/ directories.",
    system: "Agent panel repo with install, bin, docs, assets, legacy directories.",
    build: "Repo present with installer.",
    technologies: ["Shell installer", "Agent panel"],
    result: "",
    evidence: [
      "projects/omarchy-agent-panel-repo/install.sh",
      "projects/omarchy-agent-panel-repo/bin/",
      "projects/omarchy-agent-panel-repo/docs/",
      "projects/omarchy-agent-panel-repo/assets/",
      "projects/omarchy-agent-panel-repo/legacy/",
    ],
    links: [],
    media: [],
    relatedExpeditions: ["openclaw-autonomous-agent-operations"],
  },

  // 10. Antarctic Labs Site
  {
    id: "antarctic-labs-site",
    title: "Antarctic Labs Site",
    category: "SOFTWARE",
    status: "ACTIVE",
    date: "2026-09",
    role: "Architecture, build, deployment",
    shortDescription:
      "Personal digital headquarters site deployed at https://antarctic-labs.com with a layered polar visual environment, content architecture, and route registry.",
    problem:
      "Stand up a unified, expandable site that holds identity, systems, expeditions, history, operator, library, and government destinations behind one continuous visual environment.",
    objective:
      "Ship a production site with a centralized content layer, a per-route registry, per-route SEO, and a preserved visual environment.",
    approach:
      "React + Vite + Three.js visual environment (DefenseLines → atmospheric veil → strata-cloud → water). Centralized content under src/content/. Manual pushState + popstate routing preserved. Per-route SEO helper.",
    system:
      "src/content/* modules, src/pages.jsx destination shells, src/seo.js per-route metadata applier, src/PolarScene.jsx visual environment.",
    build:
      "Production site deployed via Cloudflare Pages. Stage A content + route architecture and Stage B finalized content landed today.",
    technologies: ["React 19", "Vite 7", "Three.js 0.180", "GSAP 3.13", "Cloudflare Pages"],
    result: "",
    evidence: [
      "projects/antarctic-labs/src/main.jsx",
      "projects/antarctic-labs/src/PolarScene.jsx",
      "projects/antarctic-labs/src/pages.jsx",
      "projects/antarctic-labs/src/content/*.js",
      "projects/antarctic-labs/src/seo.js",
      "https://antarctic-labs.com",
      "workspace/MEMORY.md visual-environment commits (11dfe26, 3d1841d, 0df401d, ed109a2, 0d5ae8c)",
    ],
    links: [
      { label: "https://antarctic-labs.com", href: "https://antarctic-labs.com" },
    ],
    media: [],
    relatedExpeditions: ["openclaw-autonomous-agent-operations"],
  },

  // 11. Moltbook Data Corpus
  {
    id: "moltbook-data-corpus",
    title: "Moltbook Data Corpus",
    category: "DATA",
    status: "ARCHIVED",
    date: "2026-08-02",
    role: "Capture, archiving",
    shortDescription:
      "A one-shot feed scrape that captured hot / new / top-day / top-week snapshot JSON files plus a probe script.",
    problem:
      "Capture a snapshot of a feed in four views before the source changed or disappeared.",
    objective:
      "Preserve a dated feed snapshot in a self-contained corpus.",
    approach:
      "Single-run scrape with parallel JSON outputs and a small probe script for follow-up checks.",
    system:
      "feed_hot.json, feed_new.json, feed_top_day.json, feed_top_week.json, plus _0426_probe.py.",
    build: "Corpus captured 2026-08-02.",
    technologies: ["Feed scraping", "JSON snapshot capture"],
    result: "",
    evidence: [
      "projects/moltbook/_2026-08-02_feed_hot.json",
      "projects/moltbook/_2026-08-02_feed_new.json",
      "projects/moltbook/_2026-08-02_feed_top_day.json",
      "projects/moltbook/_2026-08-02_feed_top_week.json",
      "projects/moltbook/_0426_probe.py",
    ],
    links: [],
    media: [],
    relatedExpeditions: [],
  },
];
