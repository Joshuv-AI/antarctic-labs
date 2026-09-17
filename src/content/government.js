// Government / Public Sector destination. Architecture-only at this
// stage: no fabricated capabilities, registrations, NAICS codes,
// contract vehicles, or credentials. Final content will be provided
// by the lead engineer.

export const government = {
  brand: "ANTARCTIC LABS",
  // All fields below are intentionally empty. They establish the
  // shape of the data so future content can be added without changing
  // the architecture.
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
