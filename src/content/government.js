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

export const government = {
  brand: "ANTARCTIC LABS",
  index: "06 / GOVERNMENT",
  statusPill: "EMERGING CAPABILITY",
  heading: "SYSTEMS FOR REAL-WORLD OPERATIONS.",
  intro:
    "Antarctic Labs is an independent technology lab building operational systems — AI, automation, software, and data infrastructure — for commercial clients today, while deliberately developing the capability, registrations, and partnerships for public-sector work.",

  positioning: {
    title: "BUILT FOR OPERATIONS. DEVELOPING TOWARD PUBLIC SERVICE.",
    paragraphs: [
      "The systems that matter in government are the same systems that matter everywhere else: tools that handle real workloads, automation that removes real bottlenecks, and data infrastructure that turns scattered material into something usable. That is what Antarctic Labs builds.",
      "This practice is emerging. The technical foundation is being laid now through commercial delivery — working systems, documented methods, a real track record. The registrations, certifications, and partnerships that public-sector work requires are the next phase, and they are being pursued deliberately.",
      "If you are a contracting officer, a prime looking for a technical specialist, or a partner evaluating future capability — this page is the honest picture of where things stand and where they are headed.",
    ],
  },

  capabilitiesHeading: "CORE CAPABILITIES",
  capabilitiesIntro:
    "Technical capabilities under active development through commercial work — each one directly transferable to public-sector contexts.",
  capabilities: [
    {
      title: "AI & INTELLIGENCE",
      description:
        "Agent operations, LLM-powered workflows, and intelligent automation — systems that work through problems rather than just answering questions.",
    },
    {
      title: "AUTOMATION",
      description:
        "Browser automation, data pipelines, and operational workflows that remove repetitive work from real processes.",
    },
    {
      title: "SOFTWARE",
      description:
        "Web applications, internal tools, and integrations — designed, built, tested, and documented.",
    },
    {
      title: "DATA SYSTEMS",
      description:
        "Scraping, extraction, cleaning, and structuring — turning scattered or unstructured material into usable archives and datasets.",
    },
    {
      title: "INTEGRATION",
      description:
        "APIs, webhooks, and cross-system connections that make existing tools operate as one.",
    },
    {
      title: "TECHNICAL RESEARCH",
      description:
        "Emerging technology evaluated honestly — what works, what doesn't, and what it would take to deploy.",
    },
  ],

  // APPLICABLE EXPERIENCE: Expedition ids whose technical capabilities
  // transfer to public-sector contexts. Source-of-truth is the verified
  // Expedition records in src/content/expeditions.js. These are NOT
  // government work — commercial and independent projects shown as
  // evidence of transferable technical capability only.
  relevantWork: [
    "openclaw-autonomous-agent-operations",
    "phase-3-declassified-documents-pipeline",
    "phase-2b-podcast-transcript-pipeline",
    "tower-of-babel-library-archive",
    "antarctic-labs-site",
  ],
  applicableWork: {
    heading: "APPLICABLE EXPERIENCE",
    intro:
      "Commercial and independent projects demonstrating technical capabilities that transfer directly to public-sector contexts. None of this work was performed as government contracting — it is shown as evidence of what the lab can build.",
  },

  engagement: {
    heading: "HOW WE'LL WORK TOGETHER",
    intro:
      "The engagement models this practice is being built to support — available as readiness milestones are reached.",
    pathways: [
      {
        title: "PILOT ENGAGEMENTS",
        description:
          "Small, sharply-scoped prototypes that prove a capability against a real operational problem — before anyone commits to more.",
      },
      {
        title: "SUBCONTRACT PARTNERSHIPS",
        description:
          "Technical execution under an experienced prime: AI, automation, and data systems delivered as a specialist partner.",
      },
      {
        title: "DIRECT PROJECT WORK",
        description:
          "Fixed-scope builds for agencies and public-sector organizations, once registration and compliance milestones are complete.",
      },
    ],
  },

  roadmap: {
    heading: "PATH TO READINESS",
    intro:
      "An emerging practice, pursued in order. Each phase funds and informs the next.",
    phases: [
      {
        phase: "PHASE 01",
        title: "COMMERCIAL DELIVERY",
        status: "ACTIVE NOW",
        description:
          "Building and shipping operational systems for commercial clients — the technical foundation and documented track record that public-sector work will stand on.",
      },
      {
        phase: "PHASE 02",
        title: "REGISTRATION & COMPLIANCE",
        status: "NEXT",
        description:
          "Business registration, SAM.gov enrollment, NAICS alignment, and a formal capabilities statement — the administrative groundwork for eligibility.",
      },
      {
        phase: "PHASE 03",
        title: "PARTNERSHIP & PILOTS",
        status: "WHEN READY",
        description:
          "Subcontractor partnerships and pilot engagements — proving value on real public-sector problems before pursuing direct awards.",
      },
    ],
  },

  capabilitiesStatement: {
    heading: "CAPABILITIES STATEMENT",
    body: "The one-page capabilities statement — the document contracting officers actually read — will be published here once finalized.",
    note: "No formal capabilities statement exists yet. Partnership inquiries in the meantime are welcome by email.",
  },

  footnote:
    "Status note: Antarctic Labs does not currently hold government contracts, registrations, certifications, security clearances, or past performance as a government vendor. The technical work described on this page is real; the public-sector practice is under active development.",
};
