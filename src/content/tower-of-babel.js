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

import { libraryFaqs, apiPage } from "./tower-api.js";

export const towerOfBabel = {
  heading: "TOWER OF BABEL",
  intro: [
    "Tower of Babel is a library and archival project from Antarctic Labs — thousands of books, documents, transcripts, and texts in one organized, searchable collection.",
  ],
  project: [
    "Tower of Babel began as one person's reaction to a headline: Anthropic was scanning books and destroying them afterward. If the organizations building the future of knowledge are comfortable destroying books, someone should be preserving them. It started with old texts, then the sacred texts of every culture and tradition — no favoritism, no picking sides — preserved as unchangeable copies nobody could rewrite or take away.",
    "From there it grew toward everything else that gets lost — suppressed, deleted, quietly rewritten: secret societies, folklore passed down through generations, firsthand accounts of the unexplained, phenomena brushed off and forgotten. The long conversations joined too — hours-long podcasts with experts and researchers, kept searchable instead of vanishing into a feed. What began as one preservation effort became a living archive of everything worth keeping: sacred and religious texts from every tradition, philosophy, history, science, law, and literature, declassified government documents, the unexplained, folklore and mythology, and full podcast transcripts — every entry verified against its source and preserved independently as clean, searchable text.",
    "Named for the old story of the gathering place where the works of the world were meant to be open and shared — no suppression, no hiding. And with thousands of texts side by side, a deeper purpose emerges: patterns surface. A story in one tradition echoes a declassified document in another; a folktale rhymes with a witness account. Anyone can read, anyone can research — and maybe unravel a greater story than any single book could tell. Something like the Akashic records: the whole of human knowledge, unlocked.",
  ],
  // About the catalog — rendered inside the ABOUT THE PROJECT dropdown,
  // condensed from the old bottom-of-page section.
  catalogNote:
    "The catalog holds thousands of texts and keeps growing: books, declassified documents, podcast transcripts, reference works, and papers — for readers who want full texts without accounts or paywalls, and for researchers and AI agents who need clean, citable source material. Classic literature, philosophy, sacred texts, and foundational political documents sit alongside government records and long-form conversation transcripts. Every record carries its own rights status, and the entire catalog is published as one machine-readable file so the collection can be searched, filtered, and retrieved programmatically.",
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
    // Library FAQ — rendered on /tower-of-babel/library, FAQPage JSON-LD.
    faqs: libraryFaqs,
  },
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
