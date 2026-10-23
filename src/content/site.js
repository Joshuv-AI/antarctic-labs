// Global site identity — single source of truth for brand, contact,
// operator, philosophy, and footer. Updating any field here updates the
// header, menu, footer, and SEO metadata across the site.

import { siteFaqs } from "./faq.js";

export const site = {
  brand: "ANTARCTIC LABS",
  operator: "JOSHUA ALMODOVAR",
  philosophy: "OUR CAPITAL. OUR HARDWARE. OUR CODE.",
  description:
    "Freelance AI automation, web development, and data systems — working solutions, built and delivered ready to use.",
  location: "SANFORD, FLORIDA / WORLDWIDE",
  footer: "BUILT FOR THE UNKNOWN.",
  email: "hello@antarctic-labs.com",
  url: "https://antarctic-labs.com",

  // Home / arrival copy.
  hero: {
    eyebrow: "PROPRIETARY TRADING & COMPUTING",
    title: ["WE TRADE", "OUR OWN", "CAPITAL."],
    sub: "A proprietary trading and computing firm. We trade our own capital on infrastructure we own — and we are not for hire.",
    cta: { label: "CONTACT", to: "/contact" },
    signal: "Antarctic Labs is not for hire.",
    body: "Antarctic Labs is a proprietary trading and computing firm. We build our own infrastructure, run our own systems, and trade our own capital. Nothing here is a service, and nothing is built for clients.",
    method: "Our capital. Our hardware. Our code.",
  },

  // Territory list rendered on the homepage below the stats —
  // what the firm itself does. No services, no client links.
  territory: [
    [
      "PROPRIETARY TRADING",
      "Trading algorithms developed in-house, run on our own infrastructure. Strategies are tested on paper and with limited capital before they are trusted with more.",
    ],
    [
      "OWNED INFRASTRUCTURE",
      "A small data center of our own in the Philippines, built around hardware we own and operate. Power, cooling, and backup are designed in from the start.",
    ],
    [
      "NETWORK POSITION",
      "A Philippine base with a direct connection toward Hong Kong. Routes are benchmarked against the actual exchanges and endpoints we use, never assumed from a cable map.",
    ],
    [
      "RESEARCH AND SYSTEMS",
      "Strategy research, execution, monitoring, and risk controls are kept separate, so a problem in one is visible in the others.",
    ],
  ],

  // Homepage FAQ — rendered at the foot of the home page and emitted as
  // FAQPage JSON-LD. Targets "AI automation developer" discovery.
  faqs: siteFaqs,
};
