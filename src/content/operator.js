// About — Antarctic Labs. Identity fields are populated from the
// global site identity; the narrative fields below drive the About page:
// who we are, our mission, what we do, principles, and the team.

import { site } from "./site.js";

export const operator = {
  name: site.operator,
  brand: site.brand,
  philosophy: site.philosophy,
  location: site.location,
  email: site.email,

  index: "ABOUT",
  heading: "WHO WE ARE.",

  positioning:
    "Antarctic Labs is a freelance technology studio — AI automation, websites, and data systems, built and delivered ready to work. When you reach out, you talk directly to the team building your project — no account managers, no handoffs.",

  whoWeAre: {
    title: "WHO WE ARE",
    paragraphs: [
      "Antarctic Labs started as a personal practice: a place to experiment across AI, automation, software, data, and blockchain. It grew into something more deliberate — a one-person studio taking on real client work and turning it into systems that hold up under real conditions.",
      "The focus is practical: automation that replaces slow, manual work; websites that ship; data you can actually use. Everything here is built, not theorized — if it can't survive real data, real users, and real constraints, it doesn't ship.",
    ],
  },

  mission: {
    title: "OUR MISSION",
    statement: "Replace manual work with systems that run.",
    paragraphs: [
      "Most worthwhile problems start as unknowns — a process nobody has mapped, data nobody has tamed, a workflow held together by manual effort. The mission is to take those unknowns seriously: scope them clearly, rebuild them properly, and automate what should never have been manual in the first place.",
      "Ready to work on your project isn't a slogan. It's the job description.",
    ],
  },

  beliefs: {
    title: "OPERATING BELIEFS",
    items: [
      {
        title: "Show the work",
        since: "SINCE DAY ONE",
        text: "I don't sell roadmaps. If I say I'll build something, it's because I've built the hard parts before — or I'm already building them.",
      },
      {
        title: "Constraints are the brief",
        since: "FROM YEARS IN OPERATIONS",
        text: "Budget, time, messy data — I spent years working inside constraints in service and operations jobs. They don't scare me. They're what shape systems that survive contact with reality.",
      },
      {
        title: "Working beats flashy",
        since: "ON EVERY PROJECT",
        text: "Demos impress; working systems get used. Every build is scoped clearly and delivered clean and ready to use — not a prototype dressed up as a solution.",
      },
      {
        title: "Keep moving",
        since: "ALWAYS",
        text: "I learn by building. Most of what I know, I know because I tried it, broke it, and fixed it. Stuck isn't a state — it's a signal to try the next thing.",
      },
    ],
  },

  team: {
    title: "THE TEAM",
    headline: "Joshua Almodovar.",
    paragraphs: [
      "Antarctic Labs is operated by Joshua Almodovar. No account managers, no handoffs, no juniors learning on your project — the person you talk to is the person who builds it.",
      "Joshua's path into technology wasn't a straight line. He spent years in customer service, retail, restaurant operations, management, and training — environments where getting things right meant understanding people, processes, constraints, and what happens when something breaks.",
      "That instinct moved toward software: systems that process information, automate work, connect tools, and operate without someone manually pushing every button. Today that work is the service — AI workflow automation with n8n, Make, and Zapier; web scraping and data extraction; lead generation; and website development — scoped clearly up front, delivered clean and ready to use.",
    ],
    facts: [
      ["BASED", "SANFORD, FLORIDA / WORLDWIDE"],
      ["FOCUS", "AI AUTOMATION · DATA · WEB DEV"],
    ],
  },

};
