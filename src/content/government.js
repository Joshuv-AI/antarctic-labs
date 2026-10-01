// Government Contracting destination.
//
// POSITIONING: This is an EMERGING capability, not an active practice.
// Antarctic Labs is building commercial systems today and deliberately
// developing toward public-sector work. This page is the landing page
// for future partners — it must read as industry-standard and serious
// while claiming NOTHING that isn't real: no government contracts,
// past performance, registrations, certifications, clearances, NAICS
// codes, contract vehicles, set-aside status, agency relationships,
// or government revenue. Every forward-looking statement is framed
// as a plan, not a credential.
//
// Route: /government-contracting. Display label: GOV CONTRACTS.

import { governmentFaqs, governmentExtra } from "./faq.js";

export const government = {
  brand: "ANTARCTIC LABS",
  statusPill: "GOVERNMENT CONTRACTING",
  heading: "WHERE WE'RE HEADING.",
  intro:
    "Antarctic Labs is an independent technology lab building operational AI, automation, and data systems for commercial clients today. Government contracting is where this practice is heading — subcontract partnerships, phased R&D programs, and competitive prototypes with defense and public-sector teams.",

  positioning: {
    title: "A TECHNICAL SPECIALIST DEVELOPING TOWARD PUBLIC SERVICE.",
    paragraphs: [
      "Primes don't need another generalist. They need small technical specialists who can prove a capability against a real operational problem — analyst workflows, data at scale, geospatial fusion, automation that removes real bottlenecks. That is what Antarctic Labs builds.",
      "This practice is emerging. The technical foundation is being laid now through commercial delivery — working systems, documented methods, demonstrated prototypes. Registrations, phased R&D programs, and prime partnerships are the next phase, pursued deliberately and stated honestly.",
    ],
  },

  capabilitiesHeading: "WHERE WE FIT TODAY",
  capabilitiesIntro:
    "Narrow technical lanes, each grounded in systems already built and operating for commercial clients — the expansions from here are prototypes, not promises.",
  capabilities: [
    {
      title: "ANALYST WORKFLOWS",
      description:
        "AI systems that work through operational problems: triage, extraction, and summarization that cut hours of manual review.",
    },
    {
      title: "DATA AT SCALE",
      description:
        "Ingestion, cleaning, and structuring that turn scattered or unstructured material into usable datasets and archives.",
    },
    {
      title: "GEOSPATIAL FUSION",
      description:
        "Live data fusion and visualization for a clear operational picture — built and running today.",
    },
    {
      title: "WORKFLOW AUTOMATION",
      description:
        "Browser automation and operational pipelines that remove repetitive work from real processes.",
    },
    {
      title: "SECURE SOFTWARE",
      description:
        "Web applications and internal tools — designed, built, tested, and documented.",
    },
    {
      title: "RAPID PROTOTYPES",
      description:
        "Small, sharply-scoped unclassified builds that prove a capability before anyone commits to more.",
    },
  ],

  engagement: {
    heading: "HOW WE'LL ENGAGE",
    intro:
      "The doors this practice is being built to walk through — pursued in order, as readiness milestones are reached.",
    pathways: [
      {
        title: "PROTOTYPE PILOTS",
        description:
          "Sharply-scoped demonstrations against a real operational problem — the fastest way to prove fit.",
      },
      {
        title: "SBIR / STTR & OTA",
        description:
          "Phased R&D topics and rapid-prototype programs built for nontraditional vendors — the designed on-ramp for an emerging practice.",
      },
      {
        title: "SUBCONTRACT TEAMING",
        description:
          "Technical execution under an experienced prime: a specialist partner for AI, automation, and data systems.",
      },
    ],
  },

  footnote:
    "Status note: Antarctic Labs does not currently hold government contracts, registrations, certifications, security clearances, or past performance as a government vendor. The technical work described on this page is real; the public-sector practice is under active development.",

  // Emerging-practice narrative — honest positioning, claims nothing unreal.
  extra: governmentExtra,

  // Gov-page FAQ — rendered on the page and emitted as FAQPage JSON-LD.
  // Targets "small business government contracting" informational discovery.
  faqs: governmentFaqs,
};
