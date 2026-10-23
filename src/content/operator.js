// About — Antarctic Labs. Identity fields are populated from the
// global site identity; the narrative fields below drive the About page:
// who we are, our mission, what we do, principles, and the profiles.
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

  mission: {
    title: "OUR MISSION",
    statement: "Turn owned infrastructure into durable profit.",
    paragraphs: [
      "The trading comes first. Algorithms developed in-house run on our own machines, tested on paper and with limited capital before anything scales. The capital is the firm's own, so protecting it is part of the strategy, not a footnote.",
      "The same hardware can do more than trade. What it becomes beyond trading will be decided the same way everything here is decided: by what proves real when it is measured.",
    ],
  },

  beliefs: {
    title: "OPERATING BELIEFS",
    items: [
      {
        title: "Own the machine",
        since: "THE FOUNDATION",
        text: "Renting puts the core of the business in someone else's hands. We own the hardware our systems run on, and we operate it ourselves.",
      },
      {
        title: "Measure, do not assume",
        since: "ON EVERY ROUTE",
        text: "A fast connection is a claim until it is timed. Latency, reliability, and execution are measured against the real endpoints before money depends on them.",
      },
      {
        title: "Protect the capital",
        since: "ALWAYS",
        text: "The firm runs on its own money. No single result justifies risking the base that makes the next result possible.",
      },
      {
        title: "No pitch",
        since: "SINCE THE PIVOT",
        text: "We do not sell services and we do not perform for clients. The work is the pitch, and most of it is not public.",
      },
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
        role: "OPERATIONS, LOGISTICS & ACCOUNTING",
        text: "Runs the firm day to day: logistics, business operations, accounting, and overall oversight.",
      },
      {
        name: "ANDREW",
        role: "ENGINEERING & SYSTEMS",
        text: "Leads engineering: the trading algorithms, the server build, and the systems the firm runs on.",
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
