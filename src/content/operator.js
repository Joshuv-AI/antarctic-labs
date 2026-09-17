// Operator — Joshua Almodovar. Identity fields are populated from the
// global site identity; the page-specific narrative will be provided
// by the lead engineer.

import { site } from "./site.js";

export const operator = {
  name: site.operator,
  brand: site.brand,
  philosophy: site.philosophy,
  location: site.location,
  email: site.email,
  // Final narrative and bio fields will be provided by the lead engineer.
  bio: "",
  currentlyExploring: [],
  bioSections: [],
};
