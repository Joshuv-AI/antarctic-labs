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
      "Commission work from the library itself. Tell us what you are trying to answer or build, and we do the work inside the Tower's own collection — the searching, verifying, assembling, and writing — and hand you the finished result.",
    what: [
      "Every commission ends in one or both of two deliverables. A sourced research brief: a written answer to a defined question, with every claim traced to its primary source in the library and the passages cited. Or a curated collection: a clean, rights-checked set of texts on your subject, delivered as plain-text files with a metadata manifest and checksums, ready to read, quote, or build on. Many projects want both — the collection, and the brief that explains what is in it, what was left out, and why.",
      "Examples, not products: verify a famous quote or attribution to its earliest source; assemble the primary sources behind a claim or an episode; compare editions or translations of one work; build a corpus on a tradition, a period, or a theme for a book, a course, a podcast, or a small AI project. If it can be done from the library's holdings, it can be commissioned here.",
      "One honest note: everything in this library is already free to read, and the catalog is machine-readable — a patient person with their own tools can do this work themselves. What a commission buys is the time, the judgment, and a name standing behind the result: sources verified, rights checked, exclusions documented, and corrections issued if we get something wrong.",
    ],
    stepsHeading: "HOW IT WORKS",
    steps: [
      {
        title: "1 — SEND THE INTAKE FORM",
        body: "Describe the project below: the question or the subject, any works you already know belong in it, and your deadline. The more specific the request, the sharper the quote.",
      },
      {
        title: "2 — FREE ASSESSMENT + WRITTEN QUOTE",
        body: "We assess the request against the library's holdings and reply within 1 business day with a written, fixed quote — scope, deliverables, price, and turnaround. The quote is valid for 14 days. Assessment and quoting are always free; there is no fee for asking.",
      },
      {
        title: "3 — ACCEPT + 50% DEPOSIT",
        body: "If you accept, we send a secure Stripe payment link for a 50% deposit. Work starts when the deposit lands — the turnaround clock runs from that moment, not from your first email.",
      },
      {
        title: "4 — DELIVERY + BALANCE",
        body: "You receive the finished brief and/or collection, with one round of factual corrections included. The balance is invoiced through Stripe on delivery.",
      },
    ],
    pricingHeading: "PRICING",
    pricing: [
      "There is no price list, because no two commissions are the same size. Guideposts: the minimum commission is $150. Most engagements land between $300 and $2,500. Large collection builds are quoted individually. Assessment and the written quote are free, and the quote is fixed — the price you accept is the price you pay.",
    ],
    termsHeading: "TERMS",
    terms: [
      "The fee buys a documented search, including a negative result: if the library does not hold what a question needs, the brief says so and shows the sources consulted. There are no refunds for unsuccessful searches once work has begun.",
      "If we decline a commission after assessment, no charge is made; if a deposit was taken and we later decline, it is refunded in full.",
      "One revision round is included, for factual corrections. New scope is quoted before any extra work begins.",
      "Commissioned work is for your own use — research, writing, teaching, production — not for coursework submission.",
      "Deliverables are private by default. We publish nothing about your commission without your permission.",
      "For collections: the licence covers our compilation — the selection, cleaning, and provenance work. The texts themselves are public domain or openly licensed, as each record states. You may use the collection internally and commercially, including AI training; you may not redistribute the raw collection or publicly re-host it. The licence is perpetual for what was delivered. If a work is ever reclassified, we send an updated manifest and a deletions list.",
    ],
    sampleHeading: "A SAMPLE, BEFORE YOU ASK",
    sampleIntro:
      "Two proofs, made the way real commissions are made. A sample research brief — a famous attribution checked against the library's own texts — and a free sample collection built by the same pipeline that builds paid ones: 100 short public-domain documents with a full checksum manifest.",
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
        "The commission: verify the attribution of the phrase “Let them eat cake” to Marie Antoinette, against the earliest source held in this library.",
      verdict:
        "Verdict: No. The saying appears in print decades before Marie Antoinette could have said it, attributed to an unnamed “great princess.” In Jean-Jacques Rousseau's Confessions — written in the 1760s and published in 1782 — the line reads, in this library's English text: \"Then let them eat pastry!\" Rousseau names no one, and the episode he is recalling belongs to his youth in the early 1730s, more than twenty years before Marie Antoinette was born.",
      evidence: [
        {
          claim: "The saying is in Rousseau's Confessions, in the library's own text.",
          finding:
            "Passage located in Book VI of The Confessions of Jean-Jacques Rousseau (this library's complete English edition): \"At length I recollected the thoughtless saying of a great princess, who, on being informed that the country people had no bread, replied, \\\"Then let them eat pastry!\\\"\" The French original's word is brioche — an enriched bread, not “cake”; the cake wording belongs to the later Antoinette version of the story.",
          sourceLabel: "The Confessions of Jean-Jacques Rousseau — read the entry",
          sourcePath: "/tower-of-babel/library/rousseau-confessions-1903",
        },
        {
          claim: "Rousseau does not name Marie Antoinette — or anyone.",
          finding:
            "The speaker in the passage is only “a great princess.” No queen is named anywhere in the episode, and the phrase “let them eat cake” never appears in the Confessions text (full text searched).",
          sourceLabel: "Same entry, full text",
          sourcePath: "/tower-of-babel/library/rousseau-confessions-1903",
        },
        {
          claim: "The timeline excludes Antoinette.",
          finding:
            "Rousseau places the episode in his youth (the Confessions' Book VI covers 1730–31) and wrote the passage in the 1760s. Marie Antoinette was born in 1755 and did not arrive in France until 1770. The first printed link between the saying and Antoinette that scholarship commonly cites dates to 1843 — fifty years after her death.",
          sourceLabel: "Confessions, Book VI (same entry)",
          sourcePath: "/tower-of-babel/library/rousseau-confessions-1903",
        },
      ],
      consulted:
        "Sources consulted: the library's complete Confessions text (searched for “brioche”, “pastry”, and “eat cake” — only the pastry passage is present); the catalog record for the work. Secondary chronology (Rousseau's writing and publication dates, Antoinette's birth and arrival in France, the 1843 attribution) is standard reference material and is flagged as such wherever the brief relies on it.",
      changeMind:
        "What would change the verdict: a source from Antoinette's lifetime (before 1793) that names her as the speaker. None is present in the holdings consulted; the earliest attributions are all posthumous and unsourced.",
    },
    formHeading: "START A COMMISSION",
    submitLabel: "REQUEST A FREE QUOTE",
    sendAnother: "SEND ANOTHER REQUEST",
    backToLibrary: "BACK TO THE LIBRARY",
    success: {
      heading: "REQUEST RECEIVED.",
      body:
        "Thanks — your commission request is with the desk. We reply within 1 business day with an assessment and a written fixed quote. Asking costs nothing.",
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
          "The question you want answered, or the collection you want built — subject, scope, and what the result is for.",
      },
      {
        id: "desk-subject",
        name: "subject",
        label: "WORKS OR SUBJECT, IF KNOWN",
        type: "text",
        required: false,
        autoComplete: "off",
        placeholder: "Titles, authors, artifact ids, or a subject line — optional",
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
