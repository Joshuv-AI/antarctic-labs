// About — Antarctic Labs. Identity fields are populated from the
// global site identity; the narrative fields below drive the About page:
// who we are, what we do, principles, and the profiles.
// Privacy rule (Joshua, 2026-10-22): partner details are context for
// the firm, not site copy. The profiles at the bottom of this file are
// the ONLY place a partner is named or described; every other section
// talks about what the firm does, never who does it.

import { site } from "./site.js";

export const operator = {
  name: site.operator,
  brand: site.brand,
  philosophy: site.philosophy,
  location: site.location,
  email: site.email,

  index: "ABOUT",
  heading: "THE FIRM.",

  positioning:
    "Antarctic Labs is a proprietary trading and computing firm. We trade our own capital on infrastructure we own. We do not build for clients, and we do not sell services.",

  whoWeAre: {
    title: "WHO WE ARE",
    paragraphs: [
      "Antarctic Labs is a proprietary trading and computing firm. It began as a freelance technology studio; that chapter is closed. The firm now does one thing: it trades its own capital on infrastructure it owns and operates, built around one idea — own the hardware, own the systems, and let the results decide what grows.",
      "The work has three parts. Trading systems are developed and run in-house. The hardware is owned: a base in the Philippines — a commercial office and a small data center — is being established around machines the firm owns and operates. And the position is measured, not assumed: the Philippines connects directly toward Hong Kong, and every route is chosen by benchmarking the real endpoints, not by reading maps.",
    ],
  },

  team: {
    title: "THE PARTNERS",
    // Profiles (2026-10-22): the single panel of partner paragraphs is
    // replaced by individual profile cards — Joshua and Andrew only.
    // This is the only place on the site where a partner is named or
    // described; keep every other section about the work, not the people.
    profiles: [
      {
        name: "JOSHUA",
        role: "FOUNDER, OPERATIONS, LOGISTICS & ACCOUNTING",
        text: "Founder running Antarctic Labs day to day: the Philippines venture — entity, office, and owned data-center build — and the Tower of Babel library, 392,852 works live toward 500,000. He owns the direction, the business, and the delivery: logistics, operations, and accounting, judged by what proves real when it is run.",
        highlights: [
          "Founder, Antarctic Labs — proprietary trading and computing on infrastructure the firm owns and operates",
          "Leads the Philippines venture: business authorization and registration, commercial office, and the small owned data-center build",
          "Directs the Tower of Babel preservation library: 392,852 works live toward 500,000, across religions, cultures, and histories",
          "Builds automation and data systems: AI workflows, web scraping and data extraction, APIs and webhooks, data cleaning, and B2B lead generation",
          "Previously founded and ran a freelance technology studio — frontend and WordPress work, n8n automation, and lead-research projects",
        ],
      },
      {
        name: "ANDREW",
        role: "PARTNER, ENGINEERING & SYSTEMS",
        text: "At Antarctic Labs, Andrew leads engineering: the trading algorithms developed in-house, the server build, and the systems the firm runs on. His work is why the firm trades on infrastructure it owns and operates, tested on paper and with limited capital before anything scales.",
        highlights: [
          "Senior AI Accelerator Tools Development Engineer at Microsoft, and GPU Kernel Development Engineer — AI accelerator and low-level systems work",
          "10+ years in engineering across avionics, blockchain, logistics, defense programs, security research, and AAA games",
          "Lead Engineer at OMEGA.xyz, building decentralized lending protocols focused on yield optimization for institutional investors",
          "Senior Software Engineer at Thales on mission-critical aircraft hardware, and Senior Backend Engineer at FYX Gaming on a blockchain gaming platform handling over 4 million UTXO transactions a day",
          "Projects include Madden NFL 15 and 16, VBS3 training courseware, and the KC-46A Pegasus",
        ],
      },
    ],
    facts: [
      ["STRUCTURE", "PRIVATE PARTNERSHIP"],
      ["BASES", "UNITED STATES · PHILIPPINES"],
      ["CLIENT WORK", "NONE"],
      ["STATUS", "IN FORMATION, PHILIPPINES"],
    ],
  },

};
