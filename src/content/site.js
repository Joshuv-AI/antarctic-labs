// Global site identity — single source of truth for brand,
// operator, philosophy, and footer. Updating any field here updates the
// header, menu, footer, and SEO metadata across the site.

import { siteFaqs } from "./faq.js";

export const site = {
  brand: "ANTARCTIC LABS",
  operator: "JOSHUA",
  philosophy: "OUR SYSTEMS. OUR INFRASTRUCTURE. OUR WORK.",
  description:
    "The Tower of Babel is a free online library of 2,557,924 works — books, papers, law, reference works, and declassified documents, kept in full text. Everything is free to read, with no account and no sign-up.",
  location: "SANFORD, FLORIDA / WORLDWIDE",
  footer: "BUILT FOR THE UNKNOWN.",
  email: "hello@antarctic-labs.com",
  url: "https://antarctic-labs.com",

  // Home / arrival copy. (2026-11-24 homepage explanation revamp,
  // Joshua-approved copy: the homepage explains the library — hero
  // definition sentence with "free — no account" folded in, manifesto
  // as mission + journey signpost. The territory/capabilities block
  // that used to render below the library section was removed whole
  // the same day, all four rows.)
  hero: {
    eyebrow: "A FREE ONLINE LIBRARY",
    title: ["A FREE LIBRARY", "OF THE TEXTS", "THAT MATTER"],
    sub: "The Tower of Babel is a free online library holding the world's important books, papers, laws, and documents — kept safe in full text and open to anyone, anywhere, to read free, with no account and no sign-up.",
    body: "Much of the world's most useful writing is fragile — printed once, stored in one place, easy to lose. This library holds it in one place, open to anyone: the papers, the laws, the books that shaped their fields. A working library, not a leisure one: professionals, students preparing to join them, researchers, journalists, and anyone, anywhere, who needs a text they can trust. If the originals are ever lost, what is kept here remains.",
    method: "What this page is, what is inside, and who keeps it — then the door to the library, at the end.",
  },

  // Firm FAQ — kept in sync with the firm's current positioning
  // (proprietary trading and computing; no client work).
  faqs: siteFaqs,
};
