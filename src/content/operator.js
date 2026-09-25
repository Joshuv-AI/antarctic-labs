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

  index: "07 / ABOUT",
  heading: "AN INDEPENDENT LAB FOR USEFUL TECHNOLOGY.",

  positioning:
    "Antarctic Labs is an independent technology laboratory operated by Joshua Almodovar — designing and building AI systems, automation, and software for people who need things that work.",

  whoWeAre: {
    title: "WHO WE ARE",
    paragraphs: [
      "The lab began as a personal practice: a place to collect experiments, investigations, and working systems across AI, automation, software, data, and blockchain. It has grown into something more deliberate — a studio that takes on real problems and turns them into systems that hold up under real conditions.",
      "Everything here is built, not theorized. If a system can't survive contact with real data, real users, and real constraints, it doesn't ship.",
    ],
  },

  mission: {
    title: "OUR MISSION",
    statement: "Turn unknowns into working systems.",
    paragraphs: [
      "Most worthwhile problems start as unknowns — a process nobody has mapped, data nobody has tamed, a workflow held together by manual effort. The mission is to take those unknowns seriously: understand them, rebuild them, and automate what should never have been manual in the first place.",
      "Useful machines for unknown territory isn't a slogan. It's the job description.",
    ],
  },

  whatWeDo: {
    title: "WHAT WE DO",
    items: [
      {
        title: "AI AUTOMATION",
        desc: "Intelligent workflows, agents, and integrations that take repetitive work off your team's plate.",
      },
      {
        title: "WEB SCRAPING & DATA",
        desc: "Reliable extraction, cleaning, and pipelines that turn scattered web data into structured, usable datasets.",
      },
      {
        title: "LEAD-GENERATION SYSTEMS",
        desc: "Automated prospecting and list-building systems that keep your pipeline fed around the clock.",
      },
      {
        title: "WEB DEVELOPMENT",
        desc: "Fast, modern websites and web applications — designed, built, and shipped.",
      },
    ],
  },

  principles: {
    title: "HOW WE WORK",
    items: [
      {
        title: "UNDERSTAND FIRST",
        text: "No building before the problem is mapped. The fastest way to waste effort is automating the wrong thing.",
      },
      {
        title: "BUILT TO BE USED",
        text: "Every system is designed for production — real data, real users, real constraints. Demos don't count.",
      },
      {
        title: "ITERATE IN THE OPEN",
        text: "Ship early, test against reality, improve. Working software beats perfect plans.",
      },
    ],
  },

  team: {
    title: "THE TEAM",
    headline: "A team of one — by design.",
    paragraphs: [
      "Antarctic Labs is operated by Joshua Almodovar. No account managers, no handoffs, no juniors learning on your project — the person you talk to is the person who builds it.",
      "Joshua's path into technology wasn't a straight line. He spent years in customer service, retail, restaurant operations, management, and training — environments where getting things right meant understanding people, processes, constraints, and what happens when something breaks.",
      "That instinct moved toward software: systems that process information, automate work, connect tools, and operate without someone manually pushing every button. Today that work centers on AI, automation, data, and software — the intersection where the highest-leverage problems live.",
    ],
    facts: [
      ["OPERATOR", "JOSHUA ALMODOVAR"],
      ["BASED", "SANFORD, FLORIDA / WORLDWIDE"],
      ["FOCUS", "AI · AUTOMATION · DATA · SOFTWARE"],
      ["CONTACT", "HELLO@ANTARCTICLABS.COM"],
    ],
  },

  cta: {
    heading: "HAVE SOMETHING WORTH BUILDING?",
    label: "START A CONVERSATION",
  },
};
