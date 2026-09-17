// Operator — Joshua Almodovar. Identity fields are populated from the
// global site identity; the narrative fields below are populated from
// the Stage B copy.

import { site } from "./site.js";

export const operator = {
  name: site.operator,
  brand: site.brand,
  philosophy: site.philosophy,
  location: site.location,
  email: site.email,

  heading: "CURIOUS BY DEFAULT.",

  opening:
    "I’m Joshua Almodovar. Antarctic Labs is the place where I collect the things I’m building, investigating, and trying to understand.",

  background:
    "My path into technology wasn’t a straight line. I’ve worked in customer service, retail, restaurant operations, management, training, and other environments where getting things right meant understanding people, processes, constraints, and what happens when something breaks.",

  technicalShift:
    "Eventually that same instinct moved toward software and technology. I became interested in a different kind of leverage: systems that can process information, automate work, connect tools, and operate without someone manually pushing every button.",

  current:
    "Today I’m interested in the intersection of AI, automation, software, data, blockchain, and whatever other territory seems worth exploring.",

  pattern: {
    title: "DIFFERENT TERRITORY. SAME INSTINCT.",
    lines: [
      "I’ve never been particularly interested in staying inside one lane.",
      "A restaurant, a software system, a financial protocol, an automation workflow, and a business may look completely different on the surface. Underneath, they all contain problems to understand, processes to improve, and systems that can be rebuilt.",
      "That’s the pattern I keep coming back to.",
    ],
  },

  approach: {
    title: "THE APPROACH",
    summary:
      "Most of what I know came from building something and discovering what I didn’t know yet.",
  },

  fieldInterests: [
    "Artificial Intelligence",
    "Autonomous Systems",
    "Software",
    "Automation",
    "Blockchain",
    "Finance",
    "Data & Research",
    "Digital Experiences",
    "History & Archives",
    "Experimental Technology",
  ],

  closing:
    "Some interests become projects. Some remain questions. Both belong here.",
};
