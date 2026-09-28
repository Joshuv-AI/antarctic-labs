// Global site identity — single source of truth for brand, contact,
// operator, philosophy, and footer. Updating any field here updates the
// header, menu, footer, contact CTA, and SEO metadata across the site.

export const site = {
  brand: "ANTARCTIC LABS",
  operator: "JOSHUA ALMODOVAR",
  philosophy: "USEFUL MACHINES FOR UNKNOWN TERRITORY.",
  description:
    "Web design, AI automation, data systems, and trading and blockchain tooling — an independent technology laboratory building things that work.",
  location: "SANFORD, FLORIDA / WORLDWIDE",
  footer: "BUILT FOR THE UNKNOWN.",
  email: "hello@antarcticlabs.com",
  url: "https://antarctic-labs.com",

  // Home / arrival copy.
  hero: {
    eyebrow: "INDEPENDENT TECHNOLOGY LABORATORY",
    title: ["USEFUL MACHINES", "FOR UNKNOWN", "TERRITORY."],
    sub: "Web design, AI automation, data systems, and trading and blockchain tooling — designed and built by one person you can talk to directly.",
    cta: { label: "WORK WITH ME", to: "/contact" },
    signal: "Different territory. Same instinct.",
    body: "Antarctic Labs is an independent technology laboratory — a place where real problems become working systems. Websites, automation, AI agents, data pipelines, trading harnesses, on-chain experiments: everything here is built, tested, and documented. Not theorized.",
    method: "Learn → Experiment → Build → Test → Iterate.",
  },

  // Territory list rendered on the homepage below the stats —
  // the full map of what the lab can do for clients.
  territory: [
    [
      "AI AGENTS & AUTOMATION",
      "AI workflows and agents that take repetitive work off your team's plate.",
    ],
    [
      "WEB DESIGN & DEVELOPMENT",
      "Fast, modern websites and web applications — designed, built, and shipped.",
    ],
    [
      "BUSINESS AUTOMATION",
      "n8n, Make, and Zapier workflows that connect your tools and run the boring parts.",
    ],
    [
      "WEB SCRAPING & DATA",
      "Reliable extraction, cleaning, and pipelines that turn scattered web data into structured datasets.",
    ],
    [
      "LEAD GENERATION SYSTEMS",
      "Automated prospecting and list-building that keep your sales pipeline fed around the clock.",
    ],
    [
      "API & SYSTEMS INTEGRATION",
      "Your tools connected as one system — CRMs, chat, docs, webhooks, custom APIs.",
    ],
    [
      "TRADING SYSTEMS",
      "Backtested strategy harnesses and automated trade workflows — built and tested, honestly labeled.",
    ],
    [
      "BLOCKCHAIN",
      "Smart contracts, DeFi tooling, and on-chain experimentation.",
    ],
    [
      "PROTOTYPES & EXPERIMENTS",
      "Interactive interfaces, unusual tools, and ideas worth building to learn from.",
    ],
  ],
};
