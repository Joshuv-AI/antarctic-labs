// Global site identity — single source of truth for brand,
// operator, philosophy, and footer. Updating any field here updates the
// header, menu, footer, and SEO metadata across the site.

import { siteFaqs } from "./faq.js";

export const site = {
  brand: "ANTARCTIC LABS",
  operator: "JOSHUA",
  philosophy: "OUR SYSTEMS. OUR INFRASTRUCTURE. OUR WORK.",
  description:
    "Antarctic Labs is an independent laboratory for AI and computing, home of the Tower of Babel — a free library of 2,557,923 works preserved in clean, searchable text.",
  location: "SANFORD, FLORIDA / WORLDWIDE",
  footer: "BUILT FOR THE UNKNOWN.",
  email: "hello@antarctic-labs.com",
  url: "https://antarctic-labs.com",

  // Home / arrival copy.
  hero: {
    eyebrow: "AN INDEPENDENT LABORATORY",
    title: ["WE SOLVE", "HARD", "PROBLEMS."],
    sub: "An independent laboratory for AI and computing — judged by the work it puts into the world.",
    body: "We build AI and computing systems and point them at hard problems — in any field where they appear, and we stay with them until they are solved.",
    method: "Our systems. Our infrastructure. Our work.",
  },

  // Capability list rendered on the homepage below the featured
  // project — what the lab does, as background. No services, no
  // client links. (2026-11-11 revamp: the homepage leads with the
  // lab and the Tower of Babel; trading is background experience,
  // one capability among several.)
  territory: [
    [
      "APPLIED AI SYSTEMS",
      "We build AI systems that do real work — research, analysis, and automation — and point them at hard problems in any field where they give the lab an opening.",
    ],
    [
      "DATA AT SCALE",
      "Pipelines that collect, clean, and structure information by the million documents, turning scattered and fragile material into archives and datasets that hold up.",
    ],
    [
      "OWNED INFRASTRUCTURE",
      "Everything runs on hardware we own and operate — including a small data center of our own in the Philippines, with power, cooling, and backup designed in from the start.",
    ],
    [
      "TRADING SYSTEMS & CRYPTO",
      "Algorithmic trading systems developed and run in-house — background work, one capability among several.",
    ],
  ],

  // Firm FAQ — kept in sync with the firm's current positioning
  // (proprietary trading and computing; no client work).
  faqs: siteFaqs,
};
