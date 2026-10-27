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
    "Tower of Babel is a library and archival project from Antarctic Labs — more than 375,000 books, documents, transcripts, and texts in one organized, searchable collection. Individual resources appear here once finalized.",
  ],
  project: [
    "Tower of Babel began as one person's reaction to a headline: Anthropic was scanning books and destroying them afterward. If the organizations building the future of knowledge are comfortable destroying books, someone should be preserving them. It started with old texts, then the sacred texts of every culture and tradition — no favoritism, no picking sides — preserved as unchangeable copies nobody could rewrite or take away.",
    "From there it grew toward everything else that gets lost — suppressed, deleted, quietly rewritten: secret societies, folklore passed down through generations, firsthand accounts of the unexplained, phenomena brushed off and forgotten. The long conversations joined too — hours-long podcasts with experts and researchers, kept searchable instead of vanishing into a feed. What began as one preservation effort became a living archive of everything worth keeping: sacred and religious texts from every tradition, philosophy, history, science, law, and literature, declassified government documents, the unexplained, folklore and mythology, and full podcast transcripts — every entry verified against its source and preserved independently as clean, searchable text.",
    "Named for the old story of the gathering place where the works of the world were meant to be open and shared — no suppression, no hiding. And with hundreds of thousands of texts side by side, a deeper purpose emerges: patterns surface. A story in one tradition echoes a declassified document in another; a folktale rhymes with a witness account. Anyone can read, anyone can research — and maybe unravel a greater story than any single book could tell. Something like the Akashic records: the whole of human knowledge, unlocked.",
  ],
  // About the catalog — rendered inside the ABOUT THE PROJECT dropdown,
  // condensed from the old bottom-of-page section.
  catalogNote:
    "The catalog holds more than 375,000 texts and keeps growing daily: books, declassified documents, podcast transcripts, reference works, and papers — for readers who want full texts without accounts or paywalls, and for researchers and AI agents who need clean, citable source material. Classic literature, philosophy, sacred texts, and foundational political documents sit alongside government records and long-form conversation transcripts. Every record carries its own rights status, and the entire catalog is published as machine-readable files so the collection can be searched, filtered, and retrieved programmatically.",
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
  // Collections — removed 2026-10-24: the old server-rendered hub pages
  // (/tower-of-babel/hubs) were deleted. Collections now live only as a
  // filter inside the library browse section (src/lib/tower-collections.js),
  // fed by public/tower-hubs-index.json. No hub link belongs here.
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
  // Commissions Desk — /tower-of-babel/library/research (2026-10-26).
  // ONE service: commission work from the library — a sourced research
  // brief, a curated collection of texts, or both. No product menu and
  // no price list: assessment + written fixed quote are free, work
  // starts on a 50% deposit. Copy and form fields live here so the page
  // stays data-driven, like the suggest page.
  desk: {
    sectionIndex: "COMMISSIONS DESK",
    heading: "COMMISSIONS DESK",
    intro:
      "Commission work from the library itself. Tell us the question or the project — we search, verify, assemble, and write inside the Tower's collection. You get the finished result.",
    what: [
      "Two deliverables, alone or together. A research brief: a written answer to a defined question, every claim traced to its primary source, passages cited. A curated collection: a rights-checked set of texts on your subject — plain-text files with a metadata manifest and checksums. Work ranges from tracing a quote to its earliest source, comparing editions or translations, or assembling the primary sources behind an episode, to building a corpus on a tradition or theme for a book, course, podcast, or AI project. Many clients take both: the collection, plus the brief on what is in it and what was left out.",
      "One honest note: everything here is already free, and the catalog is machine-readable — with time and tools, you could do this yourself. A commission buys time, judgment, and a name behind the result: sources verified, rights checked, exclusions documented, corrections issued if we're wrong.",
    ],
    stepsHeading: "HOW IT WORKS",
    steps: [
      {
        title: "1 — SEND THE INTAKE FORM",
        body: "Describe the project below: question or subject, works that belong, deadline.",
      },
      {
        title: "2 — FREE ASSESSMENT + WRITTEN QUOTE",
        body: "We reply within 1 business day with a fixed written quote — scope, deliverables, price, turnaround — valid 14 days. Always free.",
      },
      {
        title: "3 — ACCEPT + 50% DEPOSIT",
        body: "We send a Stripe payment link for the 50% deposit. Work starts when it lands.",
      },
      {
        title: "4 — DELIVERY + BALANCE",
        body: "The finished brief and/or collection, one round of factual corrections included. Balance invoiced on delivery.",
      },
    ],
    pricingHeading: "PRICING",
    pricing: [
      "No price list — no two commissions are the same size. Guideposts: $150 minimum, most $300–$2,500, large builds quoted individually. The quote is fixed: the price you accept is the price you pay.",
    ],
    termsHeading: "TERMS",
    terms: [
      "The fee buys a documented search, including a negative result — if the library lacks what a question needs, the brief says so and shows the sources consulted. No refunds once work has begun.",
      "If we decline a commission, there is no charge — and if a deposit was taken, it is refunded in full.",
      "One revision round, for factual corrections. New scope is quoted before extra work begins.",
      "For your own use — research, writing, teaching, production — not coursework submission.",
      "Private by default: we publish nothing about your commission without permission.",
      "Collections: the licence covers our compilation (selection, cleaning, provenance), not the texts — public domain or openly licensed, as each record states. Use internally and commercially, including AI training; never redistribute the raw collection or re-host it. Perpetual. On reclassification we send an updated manifest and deletions list.",
    ],
    sampleHeading: "A SAMPLE, BEFORE YOU ASK",
    sampleIntro:
      "Two proofs, made the way real commissions are made: a sample brief (a famous attribution checked against the library's own texts) and a free sample collection — 100 short public-domain documents with a full checksum manifest, built by the paid pipeline.",
    sampleCollection: {
      label: "DOWNLOAD THE SAMPLE COLLECTION (ZIP)",
      href: "/commissions/sample-collection.zip",
      manifestLabel: "SAMPLE MANIFEST (JSON)",
      manifestHref: "/commissions/sample-manifest.json",
      note: "100 works · collection: DOCUMENTS · rights: PUBLIC_DOMAIN · texts + metadata + manifest with SHA-256 checksums.",
    },
    sampleReport: {
      sectionIndex: "SAMPLE RESEARCH BRIEF",
      title: "Did Marie Antoinette say “Let them eat cake”?",
      question:
        "The commission: verify the attribution of “Let them eat cake” to Marie Antoinette, against the earliest source in this library.",
      verdict:
        "Verdict: No. The saying was in print decades before Antoinette could have said it, credited to an unnamed “great princess.” In Rousseau's Confessions (written in the 1760s, published in 1782) it reads, in this library's English text: \"Then let them eat pastry!\" The episode belongs to Rousseau's youth, in the early 1730s — over twenty years before Antoinette was born.",
      evidence: [
        {
          claim: "The saying is in Rousseau's Confessions, in the library's own text.",
          finding:
            "Book VI (this library's complete English edition): \"At length I recollected the thoughtless saying of a great princess, who, on being informed that the country people had no bread, replied, \\\"Then let them eat pastry!\\\"\" The French word is brioche — enriched bread, not “cake”; “cake” is the later Antoinette version.",
          sourceLabel: "The Confessions of Jean-Jacques Rousseau — read the entry",
          sourcePath: "/tower-of-babel/library/rousseau-confessions-1903",
        },
        {
          claim: "Rousseau does not name Marie Antoinette — or anyone.",
          finding:
            "The speaker is only “a great princess.” No queen is named in the episode, and “let them eat cake” never appears in the Confessions text (full text searched).",
          sourceLabel: "Same entry, full text",
          sourcePath: "/tower-of-babel/library/rousseau-confessions-1903",
        },
        {
          claim: "The timeline excludes Antoinette.",
          finding:
            "Rousseau sets the episode in his youth (Book VI: 1730–31) and wrote it in the 1760s. Antoinette was born in 1755, reached France in 1770. The first printed link to her that scholarship commonly cites: 1843, fifty years after her death.",
          sourceLabel: "Confessions, Book VI (same entry)",
          sourcePath: "/tower-of-babel/library/rousseau-confessions-1903",
        },
      ],
      consulted:
        "Sources consulted: the library's complete Confessions text (searched for “brioche”, “pastry”, “eat cake” — only the pastry passage is present) and the work's catalog record. The chronology (publication dates, Antoinette's birth and arrival, the 1843 attribution) is standard reference material, flagged as such in the brief.",
      changeMind:
        "What would change the verdict: a source from Antoinette's lifetime (before 1793) naming her as the speaker. None is in the holdings consulted; earliest attributions are posthumous, unsourced.",
    },
    formHeading: "START A COMMISSION",
    submitLabel: "REQUEST A FREE QUOTE",
    sendAnother: "SEND ANOTHER REQUEST",
    backToLibrary: "BACK TO THE LIBRARY",
    success: {
      heading: "REQUEST RECEIVED.",
      body:
        "Thanks — your request is with the desk. We reply within 1 business day with an assessment and a written fixed quote. Asking costs nothing.",
    },
    submitError:
      "Something went wrong sending your request. Please try again.",
    fields: [
      {
        id: "desk-name",
        name: "name",
        label: "YOUR NAME",
        type: "text",
        required: true,
        autoComplete: "name",
        placeholder: "Your name",
      },
      {
        id: "desk-email",
        name: "email",
        label: "EMAIL",
        type: "text",
        required: true,
        autoComplete: "email",
        placeholder: "you@example.com — the quote comes back here",
      },
      {
        id: "desk-deliverable",
        name: "deliverable",
        label: "WHAT DO YOU NEED?",
        type: "select",
        required: true,
        selectPlaceholder: "Select one",
        options: [
          { value: "brief", label: "A research brief (answers + sources)" },
          { value: "collection", label: "A curated collection of texts" },
          { value: "both", label: "Both — a collection and a brief" },
          { value: "not-sure", label: "Not sure yet — advise me" },
        ],
      },
      {
        id: "desk-description",
        name: "description",
        label: "THE PROJECT",
        type: "textarea",
        required: true,
        rows: 5,
        placeholder:
          "The question to answer, or the collection to build — subject, scope, what the result is for.",
      },
      {
        id: "desk-subject",
        name: "subject",
        label: "WORKS OR SUBJECT, IF KNOWN",
        type: "text",
        required: false,
        autoComplete: "off",
        placeholder: "Titles, authors, artifact ids — optional",
      },
      {
        id: "desk-deadline",
        name: "deadline",
        label: "DEADLINE",
        type: "text",
        required: false,
        autoComplete: "off",
        placeholder: "e.g. End of November — optional",
      },
      {
        id: "desk-budget",
        name: "budget",
        label: "BUDGET RANGE",
        type: "select",
        required: false,
        selectPlaceholder: "Optional",
        options: [
          { value: "150-300", label: "$150 – $300" },
          { value: "300-800", label: "$300 – $800" },
          { value: "800-2500", label: "$800 – $2,500" },
          { value: "2500-plus", label: "$2,500+" },
          { value: "unsure", label: "Not sure — quote will guide me" },
        ],
      },
    ],
  },
  // Support / donate — the /tower-of-babel/donate page. Modeled on the
  // Internet Archive / Open Library patron page: letter left, three-step
  // panel right. HONESTY RULE: Antarctic Labs is NOT a registered charity,
  // so the letter must never claim tax-deductibility (unlike IA's page).
  // Crypto wallets supplied by Joshua 2026-10-24 (format-checked: BTC
  // 34-char P2SH, ETH 42-char hex). Never put a placeholder address here.
  support: {
    eyebrow:
      "The Tower is free to read, forever. It stays that way because readers who can afford to help, do.",
    letter: {
      title: "A Message From the Team Behind the Tower of Babel",
      greeting: "Dear Tower of Babel Patron,",
      paragraphs: [
        "As a project of Antarctic Labs — an independent library dedicated to preserving the written record of humankind — the Tower of Babel is working to make the essential texts of every culture, religion, and era available to everyone, everywhere, free. The library already holds more than 390,000 works — books, sacred texts, declassified documents, papers, and transcripts — and it grows every day on the road to 500,000.",
        "Our goal is simple to say and enormous to do: every published work that matters, within everyone's reach. Achieving it will take servers, storage, bandwidth, and years of steady preservation work — and, most importantly, readers like you.",
        "The Tower is free to read, and reader support is what keeps it that way.",
        "If you enjoy wandering our virtual stacks, please consider supporting the Tower today. A little goes a long way — most readers never give, so every contribution, one-time or monthly, carries real weight.",
      ],
      signoff: "Thank you for reading with us.",
      signature: { name: "Joshua Almodovar", role: "Founder, Antarctic Labs" },
      fineprint:
        "You will receive an email receipt from our payment processor for your records. One honest note: Antarctic Labs is an independent project, not a registered charity, so contributions are not tax-deductible. Every dollar goes directly to the servers, storage, and preservation work that keep the library online and growing.",
    },
    amounts: [5, 10, 25, 50, 100, 500, 1000],
    crypto: [
      {
        symbol: "BTC",
        name: "Bitcoin",
        address: "33fQp6EVPpcamqeBYgmgLyQwfgokfacCno",
      },
      {
        symbol: "ETH",
        name: "Ethereum",
        address: "0x74Fb7F08a971c291C0736eE3608767d36Fd76559",
      },
    ],
  },
};
