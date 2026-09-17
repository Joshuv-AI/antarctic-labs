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
  // Preserve the existing contact email as the single source of truth.
  email: "hello@antarcticlabs.com",
  url: "https://antarctic-labs.com",

  // Hero copy (homepage arrival) — preserved from the prior implementation.
  hero: {
    eyebrow: "INDEPENDENT DIGITAL STUDIO",
    title: ["BUILD", "WHAT'S", "NEXT."],
    sub: "AI systems, automation, software, and digital experiences built with intent.",
  },

  // Site-wide capabilities (homepage section). Kept for compatibility
  // with the existing render layer.
  capabilities: [
    ["01", "AI SYSTEMS",       "Agents, intelligent workflows, APIs, orchestration."],
    ["02", "AUTOMATION",       "Browser automation, data pipelines, operational systems."],
    ["03", "SOFTWARE",         "Web applications, interfaces, internal tools, integrations."],
    ["04", "EXPERIMENTAL",     "Interactive experiences, creative technology, prototypes."],
  ],
};
