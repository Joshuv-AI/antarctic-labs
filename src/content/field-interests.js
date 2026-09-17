// Field Interests — interest map, not a credentials/expertise page.
// Each area describes a territory Antarctic Labs is actively
// interested in exploring. Descriptions are grounded in the site's
// philosophy and link to verified Expedition work where applicable.
// No mastery / certification / client / revenue / scale claims.

export const fieldInterests = {
  heading: "TERRITORY WORTH EXPLORING.",

  intro: [
    "These are areas of curiosity, experimentation, and active investigation — not a fixed list of specializations.",
    "Some of them already hold real projects. Some are questions without an answer yet. All of them are territories I think are worth understanding.",
  ],

  // Each area is a short description grounded in the Antarctic Labs
  // philosophy. relatedExpeditions reference verified Expedition ids
  // in src/content/expeditions.js where applicable. Empty array = no
  // current Expedition match; the area still renders.
  areas: [
    {
      id: "artificial-intelligence",
      title: "ARTIFICIAL INTELLIGENCE",
      summary:
        "Language models, agents, orchestration, and machine-assisted operations. Investigating how AI fits into real systems without becoming the system.",
      relatedExpeditions: ["openclaw-autonomous-agent-operations"],
    },
    {
      id: "autonomous-systems",
      title: "AUTONOMOUS SYSTEMS",
      summary:
        "Agents, watchdogs, schedulers, and operational loops. The architecture of long-running software that needs to keep going without someone pushing every button.",
      relatedExpeditions: ["openclaw-autonomous-agent-operations"],
    },
    {
      id: "software",
      title: "SOFTWARE",
      summary:
        "Websites, applications, interfaces, internal tools, integrations, and supporting infrastructure. Building things that hold up over time.",
      relatedExpeditions: ["antarctic-labs-site", "tower-of-babel-library-archive"],
    },
    {
      id: "automation",
      title: "AUTOMATION",
      summary:
        "Browser automation, APIs, webhooks, workflows, data pipelines. Turning repetitive processes into systems that keep moving.",
      relatedExpeditions: [],
    },
    {
      id: "blockchain",
      title: "BLOCKCHAIN",
      summary:
        "Smart contracts, DeFi systems, on-chain experimentation. Software built around decentralized networks where it makes sense.",
      relatedExpeditions: ["pdai-arbitrage-system", "pulsechain-research-thesis"],
    },
    {
      id: "finance",
      title: "FINANCE",
      summary:
        "Strategy, signals, paper trading, and backtest harnesses. Exploring markets as a study in systems, decisions, and asymmetric information.",
      relatedExpeditions: ["autonomous-trading-system", "crucix-trading-platform"],
    },
    {
      id: "data-and-research",
      title: "DATA & RESEARCH",
      summary:
        "Scraping, extraction, cleaning, structuring, and turning scattered information into something searchable and reusable.",
      relatedExpeditions: [
        "phase-2b-podcast-transcript-pipeline",
        "phase-3-declassified-documents-pipeline",
        "moltbook-data-corpus",
      ],
    },
    {
      id: "digital-experiences",
      title: "DIGITAL EXPERIENCES",
      summary:
        "Interactive interfaces, immersive web, prototypes, and unusual ways to put information in front of someone.",
      relatedExpeditions: ["antarctic-labs-site"],
    },
    {
      id: "history-and-archives",
      title: "HISTORY & ARCHIVES",
      summary:
        "Books, documents, papers, archives, and references. Preserving and organizing material so it can be explored again later.",
      relatedExpeditions: ["tower-of-babel-library-archive"],
    },
    {
      id: "experimental-technology",
      title: "EXPERIMENTAL TECHNOLOGY",
      summary:
        "Emerging tools, unusual interfaces, and ideas that don’t fit neatly into another category.",
      relatedExpeditions: [],
    },
  ],

  closing: "Some interests become projects. Some remain questions. Both belong here.",
};
