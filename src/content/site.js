// Global site identity — single source of truth for brand, contact,
// operator, philosophy, and footer. Updating any field here updates the
// header, menu, footer, contact CTA, and SEO metadata across the site.

export const site = {
  brand: "ANTARCTIC LABS",
  operator: "JOSHUA ALMODOVAR",
  philosophy: "USEFUL MACHINES FOR UNKNOWN TERRITORY.",
  description:
    "An independent technology laboratory exploring AI, automation, software, blockchain, data, and experimental systems.",
  location: "SANFORD, FLORIDA / WORLDWIDE",
  footer: "BUILT FOR THE UNKNOWN.",
  email: "hello@antarcticlabs.com",
  url: "https://antarctic-labs.com",

  // Home / arrival copy.
  hero: {
    eyebrow: "INDEPENDENT TECHNOLOGY LABORATORY",
    title: ["USEFUL MACHINES", "FOR UNKNOWN", "TERRITORY."],
    sub: "AI, automation, software, data, blockchain, and experimental systems — explored, built, tested, and documented.",
    cta: { label: "ENTER THE LAB", to: "/projects" },
    signal: "Different territory. Same instinct.",
    body: "I’m interested in problems that can be understood, rebuilt, automated, or pushed further. Antarctic Labs is where those experiments become working systems.",
    method: "Learn → Experiment → Build → Test → Iterate.",
  },

  // Capabilities (kept for compatibility with the existing render layer).
  capabilities: [
    ["01", "AI SYSTEMS",       "Agents, intelligent workflows, APIs, orchestration."],
    ["02", "AUTOMATION",       "Browser automation, data pipelines, operational systems."],
    ["03", "SOFTWARE",         "Web applications, interfaces, internal tools, integrations."],
    ["04", "EXPERIMENTAL",     "Interactive experiences, creative technology, prototypes."],
  ],
};
