// Global site identity — single source of truth for brand, contact,
// operator, philosophy, and footer. Updating any field here updates the
// header, menu, footer, and SEO metadata across the site.

import { siteFaqs } from "./faq.js";

export const site = {
  brand: "ANTARCTIC LABS",
  operator: "JOSHUA ALMODOVAR",
  philosophy: "READY TO WORK ON YOUR PROJECT.",
  description:
    "Freelance AI automation, web development, and data systems — working solutions, built and delivered ready to use.",
  location: "SANFORD, FLORIDA / WORLDWIDE",
  footer: "BUILT FOR THE UNKNOWN.",
  email: "hello@antarctic-labs.com",
  url: "https://antarctic-labs.com",

  // Home / arrival copy.
  hero: {
    eyebrow: "INDEPENDENT TECHNOLOGY LABORATORY",
    title: ["READY TO WORK", "ON YOUR", "PROJECT."],
    sub: "AI automation, websites, and data systems — designed and built by one person you talk to directly. Send the details, get a working solution back.",
    cta: { label: "GET A FREE QUOTE", to: "/contact" },
    signal: "Have a project? Let's get it built.",
    body: "Antarctic Labs is a freelance studio for practical technology: automation that replaces manual work, websites that ship, data you can actually use. Real projects, built, tested, and delivered ready to work.",
    method: "Scope it → Build it → Ship it.",
  },

  // Territory list rendered on the homepage below the stats —
  // the full map of what the lab can do for clients.
  territory: [
    [
      "AI AGENTS & AUTOMATION",
      "AI workflows and agents that take repetitive work off your team's plate.",
      "/services/ai-agents",
    ],
    [
      "WEB DESIGN & DEVELOPMENT",
      "Fast, modern websites and web applications — designed, built, and shipped.",
      "/services/web-development",
    ],
    [
      "BUSINESS AUTOMATION",
      "n8n, Make, and Zapier systems for lead handling, notifications, data processing, and business processes.",
      "/services/n8n-workflows",
    ],
    [
      "WEB SCRAPING & DATA",
      "Clean, structured data from public sources — delivered in Excel or CSV.",
      "/services/web-scraping",
    ],
    [
      "LEAD GENERATION",
      "Targeted B2B lists with verified contacts, built to your spec.",
      "/services/lead-generation",
    ],
    [
      "DATA CLEANING & SPREADSHEETS",
      "Messy files turned into clean, usable datasets.",
    ],
    [
      "WORDPRESS & CMS",
      "Page builds, fixes, and clean setups.",
    ],
    [
      "API & SYSTEMS INTEGRATION",
      "Your tools connected as one system — CRMs, chat, docs, webhooks, custom APIs.",
      "/services/ai-automation",
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

  // Homepage FAQ — rendered at the foot of the home page and emitted as
  // FAQPage JSON-LD. Targets "AI automation developer" discovery.
  faqs: siteFaqs,
};
