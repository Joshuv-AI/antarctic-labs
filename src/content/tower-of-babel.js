// Tower of Babel — personal library and archival project. Tower of
// Babel is a major independent destination, NOT another Expedition.
//
// The artifact catalog (data model + entries) lives in ./library-catalog.js.
// This file holds only the marketing copy that renders on /tower-of-babel
// and /tower-of-babel/library.
//
// NOTE: this module must NOT import ./library-catalog.js. The catalog is
// lazy-loaded via ../lib/catalog.js (dynamic import); a static import here
// would drag all 3,448 records back into the main bundle.

import { towerFaqs } from "./faq.js";
import { libraryFaqs, libraryIntroExtra, apiPage } from "./tower-api.js";

export const towerOfBabel = {
  heading: "TOWER OF BABEL",
  intro: [
    "Tower of Babel is a library and archival project from Antarctic Labs — thousands of books, documents, transcripts, and texts in one organized, searchable collection.",
    "Important information disappears: suppressed, dismissed, deleted, quietly rewritten. This is an unchangeable copy of the texts that matter most — preserved independently, open to everyone.",
  ],
  origin: [
    "It began with a reaction: the news that Anthropic was scanning books and destroying them afterward. If the organizations building the future of knowledge are comfortable destroying books, someone should be preserving them. It started with old texts, then the sacred texts of every culture and tradition — no favoritism, no picking sides — an unchangeable copy nobody could rewrite or take away.",
    "From there it grew toward everything else that gets lost: secret societies, folklore passed down through generations, firsthand accounts of the unexplained, phenomena brushed off and forgotten. Dismissed doesn't mean untrue — and across these fields the same threads keep appearing, pointing toward something bigger. The long conversations joined too: hours-long podcasts with experts and researchers, kept searchable instead of vanishing into a feed. What began as one person's preservation effort became a living archive of everything worth keeping.",
  ],
  collection: [
    "Sacred and religious texts from every tradition, philosophy, history, science, law, and literature — plus the harder-to-categorize material: declassified government documents, secret societies, the unexplained, folklore and mythology, and full podcast transcripts. Every entry is verified against its source and converted to clean, searchable text. Copyright is the only reason a work ever ships without its full text.",
  ],
  name: [
    "Named for the old story of a place where the works of the world were gathered together — knowledge meant to be open and shared. One library collecting the most important texts from every culture, tradition, and field. No suppression, no hiding.",
    "The deeper purpose is connection: with thousands of texts side by side, patterns emerge — a story in one tradition echoes a declassified document in another; a folktale rhymes with a witness account. Anyone can read, anyone can research — and maybe unravel a greater story than any single book could tell. Something like the Akashic records: the whole of human knowledge, unlocked.",
  ],
  // Library landing — separate destination at /tower-of-babel/library.
  library: {
    heading: "THE LIBRARY",
    intro:
      "The catalog of collected books, documents, research, references, and other material. Individual resources appear here once finalized.",
    empty: {
      heading: "THE ARCHIVE IS BEING PREPARED.",
      body:
        "Tower of Babel is being structured before the catalog opens. Once entries are finalized, they will appear here with their rights status, source links, and (where redistribution is permitted) direct access.",
    },
    // Catalog scope, in the library's own words — rendered on /tower-of-babel/library.
    scopeNote: libraryIntroExtra,
    // Library FAQ — rendered on /tower-of-babel/library, FAQPage JSON-LD.
    faqs: libraryFaqs,
  },
  // Tower landing FAQ — rendered on /tower-of-babel, FAQPage JSON-LD.
  // Targets "free online library" discovery.
  faqs: towerFaqs,
  // Agent-resource FAQ — emitted as FAQPage JSON-LD on /tower-of-babel/api.
  agentFaqs: apiPage.faqs,
  // Full agent-resource page content for /tower-of-babel/api.
  apiPage: apiPage,
  // Suggest an entry — separate destination at
  // /tower-of-babel/library/suggest. Front-end form only; no backend
  // integration yet. Copy and field definitions live here so the form
  // is data-driven rather than hardcoded in JSX.
  suggest: {
    sectionIndex: "SUGGEST AN ENTRY",
    heading: "SUGGEST AN ENTRY",
    intro:
      "Know something that belongs in the Tower? Send it our way — a title and a type are all it takes. Every suggestion gets reviewed for the catalog.",
    submitLabel: "SUBMIT SUGGESTION",
    suggestAnother: "SUGGEST ANOTHER",
    backToLibrary: "BACK TO THE LIBRARY",
    success: {
      heading: "SUGGESTION RECEIVED.",
      body:
        "Thanks — it's in the review pile. If it fits the Tower, it'll join the catalog.",
    },
    submitError:
      "Something went wrong sending your suggestion. Please try again.",
    fields: [
      {
        id: "suggest-type",
        name: "type",
        label: "TYPE OF MEDIA",
        type: "select",
        required: true,
        selectPlaceholder: "Select a type",
        options: [
          { value: "BOOKS", label: "Books" },
          { value: "DECLASSIFIED", label: "Declassified" },
          { value: "DOCUMENTS", label: "Documents" },
          { value: "PAPERS", label: "Papers" },
          { value: "PODCASTS", label: "Podcasts" },
          { value: "REFERENCE", label: "Reference" },
        ],
      },
      {
        id: "suggest-title",
        name: "title",
        label: "TITLE",
        type: "text",
        required: true,
        autoComplete: "off",
        placeholder: "The title of the work",
      },
      {
        id: "suggest-format",
        name: "format",
        label: "SERIES OR EDITIONS?",
        type: "select",
        required: true,
        selectPlaceholder: "Select one",
        options: [
          { value: "single", label: "Single standalone work" },
          { value: "series", label: "Part of a series" },
          { value: "editions", label: "Has multiple editions" },
        ],
      },
      {
        id: "suggest-series-details",
        name: "seriesDetails",
        label: "SERIES / EDITION DETAILS",
        type: "text",
        required: false,
        autoComplete: "off",
        placeholder: "e.g. Volume 2 of the Foundation series — optional",
      },
      {
        id: "suggest-creator",
        name: "creator",
        label: "AUTHOR OR CREATOR",
        type: "text",
        required: false,
        autoComplete: "off",
        placeholder: "Who made it — if known",
      },
      {
        id: "suggest-year",
        name: "year",
        label: "DATE PUBLISHED",
        type: "text",
        required: false,
        autoComplete: "off",
        placeholder: "e.g. 1925 — if known",
      },
      {
        id: "suggest-source",
        name: "source",
        label: "WHERE TO FIND IT",
        type: "text",
        required: false,
        autoComplete: "off",
        placeholder: "A link or source — optional",
      },
      {
        id: "suggest-notes",
        name: "notes",
        label: "ANYTHING ELSE",
        type: "textarea",
        required: false,
        rows: 4,
        placeholder: "Why this belongs in the Tower, context, etc. — optional",
      },
    ],
  },
};
