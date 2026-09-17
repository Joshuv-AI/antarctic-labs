// Government / Public Sector destination. Architecture-only at this
// stage: no fabricated capabilities, registrations, NAICS codes,
// contract vehicles, or credentials. The data model below defines the
// shape so future content can be added without changing the
// architecture. Stage B copy is applied to the public-facing fields.

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

  // Stage A fields preserved; remain empty until the lead engineer
  // finalizes procurement/business/registration/NAICS/PSC/contract
  // vehicle content.
  capabilitiesStatement: "",
  procurement: {
    purchasingInfo: "",
    pointOfContact: "",
  },
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
