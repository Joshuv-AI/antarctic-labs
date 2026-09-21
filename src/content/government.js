// Government Contracting destination. Architecture-only at this
// stage: no fabricated capabilities, registrations, NAICS codes,
// contract vehicles, or credentials. Stage E copy is applied to the
// public-facing fields. Per Stage E rules: do NOT claim government
// contracts, clients, past performance, certifications, registrations,
// security clearances, procurement status, contract vehicles,
// set-aside status, government revenue, or agency relationships.
//
// Route: /government-contracting. Display label: GOV CONTRACTS.

export const government = {
  brand: "ANTARCTIC LABS",
  heading: "SYSTEMS FOR REAL-WORLD OPERATIONS.",
  intro:
    "Antarctic Labs is developing toward public-sector and government technology work, with a focus on practical systems, automation, data, software, and emerging technology.",

  capabilities: [
    "AI & INTELLIGENCE",
    "AUTOMATION",
    "SOFTWARE",
    "DATA SYSTEMS",
    "INTEGRATION",
    "TECHNICAL RESEARCH",
  ],

  supporting:
    "Technology should solve an operational problem, not simply demonstrate that technology exists.",

  // RELEVANT WORK: Expedition ids whose technical capabilities map to
  // public-sector applicability. Source-of-truth is the verified
  // Expedition records in src/content/expeditions.js. We do NOT label
  // any Expedition as government work — only link it as applicable.
  // IDs were selected by category match against the capability list:
  //   AI            → openclaw-autonomous-agent-operations
  //   DATA          → phase-2b-podcast-transcript-pipeline
  //   DATA          → phase-3-declassified-documents-pipeline
  //   DATA          → tower-of-babel-library-archive
  //   SOFTWARE      → antarctic-labs-site
  relevantWork: [
    "openclaw-autonomous-agent-operations",
    "phase-3-declassified-documents-pipeline",
    "phase-2b-podcast-transcript-pipeline",
    "tower-of-babel-library-archive",
    "antarctic-labs-site",
  ],

  // FUTURE CAPABILITIES STATEMENT — architecture-only. The statement
  // itself will be a downloadable PDF when finalized. Until then we
  // show an inactive future-state. NO fake download link.
  capabilitiesStatement: {
    status: "FUTURE",
    heading: "CAPABILITIES STATEMENT",
    body:
      "A printable capabilities statement will be published here when finalized. Until then, this section remains in a future state.",
    note:
      "No public capabilities statement is currently available. This section is reserved for the verified, finalized document.",
  },

  // PROCUREMENT INFORMATION — architecture for future verified info.
  // Every field is empty by design. Only filled when verified.
  procurement: {
    heading: "PROCUREMENT INFORMATION",
    body:
      "The procurement block below is reserved for verified business and registration information. Empty fields are intentionally blank.",
    fields: {
      legalBusinessName:      "",
      businessStructure:      "",
      registrations:          "",
      applicableIdentifiers:  "",
      certifications:         "",
      naicsCodes:             "",
      pscCodes:               "",
      contractVehicles:       "",
      purchasingInformation:  "",
      pointOfContact:         "",
    },
    note:
      "Procurement information will appear here once verified. Until then, this section is intentionally blank — nothing is implied.",
  },

  // Stage A fields preserved; remain empty until the lead engineer
  // finalizes procurement/business/registration/NAICS/PSC/contract
  // vehicle content.
  capabilitiesStatementText: "",
  business: {
    registration: "",
    ein: "",
    address: "",
  },
  registrations: [],
  certifications: [],
  naicsCodes: [],
  pscCodes: [],
  contractVehicles: [],
};
