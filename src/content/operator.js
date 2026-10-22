// About — Antarctic Labs. Identity fields are populated from the
// global site identity; the narrative fields below drive the About page:
// who we are, our mission, what we do, principles, and the partners.

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
      "Antarctic Labs began as a freelance technology studio. That chapter is closed. The firm is now a partnership of three, built around one idea: own the hardware, own the systems, and let the results decide what grows.",
      "One partner is on the ground in the Philippines, where the firm is establishing its base: a commercial office and a small data center built around hardware we own and operate. The position matters. The Philippines connects directly toward Hong Kong, and every route is chosen by measurement, not by maps.",
    ],
  },

  mission: {
    title: "OUR MISSION",
    statement: "Turn owned infrastructure into durable profit.",
    paragraphs: [
      "The trading comes first. Algorithms developed by the partners run on our own machines, tested on paper and with limited capital before anything scales. The capital is the partners' own, so protecting it is part of the strategy, not a footnote.",
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
        text: "The firm runs on the partners' own money. No single result justifies risking the base that makes the next result possible.",
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
    headline: "Three partners.",
    paragraphs: [
      "Joshua runs the firm day to day: logistics, business operations, accounting, and overall oversight. Direction is set jointly, with Joshua and Andrew holding the strongest voices.",
      "Andrew leads engineering: the trading algorithms, the server build, and the systems the firm runs on. He also funds the firm.",
      "Jay is based in the Philippines and runs the ground operation: the location, the hardware sourcing, and the company's registration and compliance there.",
    ],
    facts: [
      ["STRUCTURE", "PARTNERSHIP OF THREE"],
      ["BASES", "UNITED STATES · PHILIPPINES"],
      ["CLIENT WORK", "NONE"],
      ["STATUS", "IN FORMATION, PHILIPPINES"],
    ],
  },

};
