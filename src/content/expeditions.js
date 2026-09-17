// Expedition data model + catalog. Adding a new Expedition should mean
// adding a new record here. The lead engineer will provide finalized
// Expedition records later; this file ships with empty placeholders
// so the architecture is in place.

export const EXPEDITION_CATEGORIES = [
  "AI",
  "AUTOMATION",
  "SOFTWARE",
  "DATA",
  "BLOCKCHAIN",
  "FINANCE",
  "REAL ESTATE",
  "EXPERIMENTAL",
];

export const EXPEDITION_STATUSES = [
  "ACTIVE",
  "COMPLETE",
  "IN DEVELOPMENT",
  "EXPERIMENTAL",
  "RESEARCH",
  "ARCHIVED",
];

/**
 * Expedition record.
 *
 * Required: id, title, category, status.
 * Optional (left blank until the lead engineer finalizes): date, role,
 * shortDescription, problem, objective, approach, system, build,
 * technologies, result, evidence, links, media, relatedExpeditions.
 */
export const expeditions = [
  {
    id: "placeholder-01",
    title: "Placeholder Expedition",
    category: "EXPERIMENTAL",
    status: "RESEARCH",
    date: "",
    role: "",
    shortDescription: "",
    problem: "",
    objective: "",
    approach: "",
    system: "",
    build: "",
    technologies: [],
    result: "",
    evidence: [],
    links: [],
    media: [],
    relatedExpeditions: [],
  },
];
