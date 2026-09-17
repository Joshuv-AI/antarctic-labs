// Expedition data model + catalog. Adding a new Expedition means
// adding a new record here. Existing real project information may be
// preserved; unfinalized information remains empty until the lead
// engineer provides it.

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
 * Optional: date, role, shortDescription, problem, objective, approach,
 * system, build, technologies, result, evidence, links, media,
 * relatedExpeditions.
 */
export const expeditions = [
  // Catalog is intentionally empty until finalized records are provided.
  // The lead engineer will populate this list. The data model above
  // defines the shape; placeholders below preserve the structure.
];

export const expeditionsArchive = {
  heading: "EXPEDITIONS",
  intro: "Everything I’ve built that was worth documenting.",
  supporting:
    "Software, automation, AI systems, experiments, research, digital experiences, and other projects — finished, active, experimental, or archived.",
};
