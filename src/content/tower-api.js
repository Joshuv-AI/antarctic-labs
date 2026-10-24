// Copy for the Tower of Babel agent-resource surface.
// Page: /tower-of-babel/library  (libraryFaqs)
// Page: /tower-of-babel/api      (apiPage)
// Scale figures verified 2026-10-23 (375,605 entries live 2026-10-22;
// stated as "more than 375,000" so the copy stays true as the catalog grows).
// Guardrails: never claim every record has full text, an uptime SLA, or
// throttling terms — copy uses "where text is present", "predictable URLs",
// "no published rate limit". No MCP/server-search claims (none exist yet).

export const libraryFaqs = [
  {
    q: "Where can I read classic books online for free?",
    a: "The Tower of Babel library catalogues more than 375,000 works, and every work with available text opens as a full, clean text you can read in the browser. There is no sign-up, no paywall, and no app to install. The collection covers public domain classics, sacred texts from every tradition, foundational documents, scientific papers, and historical records. The access button appears only where the text file exists.",
  },
  {
    q: "Is the Tower of Babel a good Project Gutenberg alternative?",
    a: "It serves the same purpose with a different scope. Project Gutenberg is the largest archive of public domain ebooks. The Tower of Babel also carries material Gutenberg does not: declassified government documents, scientific papers, reference works, and long-form podcast transcripts alongside the book collection, all in one catalog with per-record rights status. If a work is in the catalog, you can read the full text directly where the text is present.",
  },
  {
    q: "Do I need to sign up or pay to use the library?",
    a: "No. Everything readable in the library is free with no account required. There are no trials, no tiers, and no checkout process. If a work shows an access button, the full text is available to read immediately.",
  },
  {
    q: "Is it legal to read these books for free?",
    a: "Yes. Each catalog record carries a rights_status and license field, and the readable collection is built around public domain works whose copyright has expired, plus documents released into the public record. The catalog tells you the rights status of each work, so you can verify it yourself.",
  },
  {
    q: "What is actually in the catalog?",
    a: "More than 375,000 works and growing daily: books of classic literature, philosophy, and the sacred texts of every religion and tradition; declassified government documents released to the public; scientific papers; reference works; foundational political documents; and long-form podcast transcripts. Every work is preserved as clean, searchable plain text where the text is present.",
  },
  {
    q: "Can I download the books, or only read them in the browser?",
    a: "Works with available text can be opened and read in full in the browser, and the underlying plain-text file can be downloaded directly. There is no bulk download for the whole catalog; the machine-readable catalog files are the way to work with the collection at scale.",
  },
  {
    q: "Can AI agents use the Tower of Babel as a reference source?",
    a: "Yes. The catalog is published as machine-readable JSON with a documented schema, and texts are served as plain .txt files at predictable URLs where the text exists. The /tower-of-babel/api page documents the fetch pattern, the record fields, licensing, and the limits of what is available.",
  },
];

export const apiPage = {
  h1: "Free books API for AI agents",
  intro:
    "A free books API that gives AI agents machine-readable access to more than 375,000 public " +
    "works: books, the sacred texts of every tradition, declassified documents, scientific " +
    "papers, reference works, and transcripts. A machine-readable catalog, predictable text " +
    "URLs, no key, no sign-up. Fetch the catalog, filter the records, pull the full text of " +
    "whichever works have text available, confirmed with a plain HTTP request.",
  definition:
    "The Tower of Babel API is a static, keyless data surface: a JSON catalog of every " +
    "holding plus direct plain-text downloads at predictable URLs. It is not a query service. " +
    "There is no search endpoint, no authentication, and no published rate limit. An agent " +
    "downloads the catalog once, filters it locally by title, collection, creator, or rights " +
    "status, then fetches only the texts it needs. The full text is served where present, not " +
    "just metadata, which is what separates it from metadata-only book APIs.",
  sections: [
    {
      title: "What you get",
      body:
        "Two things. First, the catalog: a complete JSON record for every holding — title, " +
        "creator, year, collection, description, source, rights status, license, and the " +
        "download URL where text is present — served merged at /catalog.json and in shards " +
        "under /catalog-shards/ for incremental fetching, with a lightweight index at " +
        "/catalog-index.json for fast listing. Second, the texts themselves: clean UTF-8 .txt " +
        "files served from predictable URLs under /tower-of-babel/. Together they form a " +
        "complete static API. Download the catalog, filter it, fetch texts. No key to request, " +
        "no account to create, no usage tier to watch. No uptime SLA is offered; it is free " +
        "infrastructure, maintained as a public resource.",
    },
    {
      title: "Catalog record schema",
      body:
        "Every record carries the same fields. artifact_id is the identifier, used in the " +
        "text URL and in the work's library page at /tower-of-babel/library/<artifact_id>. " +
        "title, creator, and year identify the work. collection names the part of the library " +
        "it belongs to — books, sacred texts, declassified documents, papers, reference, " +
        "documents, or podcasts. description is a short summary. source names where the text " +
        "came from, and source_url links to the origin when one exists. rights_status and " +
        "license state the usage rights per record; most readable works are public domain. " +
        "download_status is AVAILABLE or unavailable, and download_url gives the text path, " +
        "following the pattern /tower-of-babel/<artifact_id>.txt. format is TXT and file_size " +
        "reports the text size. Important: download_status is not perfectly current, so " +
        "agents should treat download_url as a candidate and confirm with an HTTP request: a " +
        "200 response means the text is there. The site itself only renders access buttons " +
        "for records whose files exist, so a 200 on download_url is the reliable signal.",
    },
    {
      title: "How an agent uses it",
      body:
        "The fetch pattern is three steps. One: GET https://antarctic-labs.com/catalog.json " +
        "(or the shards under /catalog-shards/) and parse the records. Two: filter locally. " +
        "Find works by title substring, collection, creator, year range, or rights_status. " +
        "There is no server-side search, so filtering happens in the agent's own code after " +
        "the download. Three: GET the download_url for each selected record and read the " +
        "plain text. For retrieval-augmented generation, the practical setup is to ingest " +
        "the catalog once, embed or index the texts the agent needs, and re-fetch the catalog " +
        "on a schedule to pick up new holdings — the library grows daily. Because text URLs " +
        "are addressed by artifact_id, a URL that returns 200 keeps returning the same text, " +
        "so cached texts stay valid. Agents should handle non-200 responses gracefully rather " +
        "than assuming every catalogued work has a downloadable file.",
    },
    {
      title: "Corpus composition",
      body:
        "The catalog holds more than 375,000 works. The book collection covers classic " +
        "literature, philosophy, and foundational political documents: the public domain " +
        "canon, preserved as clean text. The sacred collection holds the scriptures and " +
        "sacred writings of every religion and tradition, without favoritism. Declassified " +
        "holds government documents released into the public record. Papers and reference " +
        "hold scientific papers and reference works at scale, and podcasts holds long-form " +
        "conversation transcripts, useful as contemporary spoken-language corpora. The mix is " +
        "the point: most free book APIs serve fiction and poetry metadata. This corpus adds " +
        "primary-source government documents, the world's sacred texts, and a large research " +
        "literature, in full text, in one schema, at one base URL.",
    },
    {
      title: "Licensing and limits",
      body:
        "Rights are per record, not per site. Each catalog entry carries rights_status and " +
        "license fields; the readable collection centers on public domain works and documents " +
        "released to the public. Agents building datasets or products on the corpus should read " +
        "those two fields on every record they use rather than assuming uniform rights. There is " +
        "no API key, no authentication, and no published rate limit. There is also no query " +
        "endpoint, no full-text search API, and no MCP server at this time; filtering and search " +
        "happen client-side after downloading the catalog. The catalog is a snapshot that grows " +
        "as holdings are added, so agents should re-fetch it periodically instead of treating a " +
        "local copy as permanent. No uptime SLA is offered. It is free infrastructure, maintained " +
        "as a public resource.",
    },
  ],
  faqs: [
    {
      q: "Is there a free API for Project Gutenberg texts?",
      a: "Project Gutenberg itself has no official API; that gap is why third-party services like Gutendex exist, and Gutendex serves metadata only. The Tower of Babel takes the other approach: a free, keyless catalog over more than 375,000 works that includes Gutenberg-sourced public domain works and serves the full text of each work whose text is present as a plain .txt file, not just metadata. Where a work's text is present, one GET returns the entire book. Confirm with a request before assuming text exists.",
    },
    {
      q: "How can my AI agent access public domain books?",
      a: "Download https://antarctic-labs.com/catalog.json, filter the records by title, collection, creator, or rights_status, then GET the download_url of each work you want. The texts are plain UTF-8 .txt at predictable URLs shaped like /tower-of-babel/<artifact_id>.txt. No key, no sign-up, no published rate limit. Confirm each URL returns 200 before treating the text as present — download_status is not perfectly current, so the HTTP response is the reliable signal. Index the texts you need for retrieval, and re-fetch the catalog on a schedule to pick up new holdings.",
    },
    {
      q: "Does the API return full text or just metadata?",
      a: "Full text, where present. The catalog record is metadata; the download_url on a record with a live text file points to the complete work as a plain text file. This is the deliberate difference from metadata-only book APIs, which tell you a book exists but make you find the text elsewhere. Availability varies per record, so confirm with the HTTP response before treating a text as present.",
    },
    {
      q: "Do I need an API key? Are there rate limits?",
      a: "No key and no account. There is no published rate limit, and the surface is static files on CDN-backed hosting, which tolerates normal programmatic use well. Reasonable behavior still applies: download the catalog once and cache it, fetch only the texts you need, and do not hammer the host with parallel thousands-wide crawls.",
    },
    {
      q: "Can I use these texts commercially, including for training data?",
      a: "It depends on the record. Each catalog entry carries rights_status and license fields; most readable works are public domain, which permits commercial use and training. Read those two fields on every record you use. The site makes no blanket grant beyond what each record's stated rights allow, and it offers no legal advice on edge cases.",
    },
    {
      q: "Is there a search endpoint or an MCP server?",
      a: "Not at this time. There is no server-side search, no query API, and no MCP server. The intended pattern is to download catalog.json once, filter and search it locally, and fetch texts by URL. An MCP server is the natural next step and the demand for one is real, but no timeline is promised here. This page will be updated if one ships.",
    },
    {
      q: "How fresh is the catalog? How do I stay current?",
      a: "The catalog grows daily as new holdings are added. There is no versioning scheme or changelog feed; the practical approach is to re-fetch catalog.json on a schedule (weekly is reasonable) and diff artifact_id values against your local copy. Artifact IDs are not reused for different works, so a text URL that returned 200 keeps returning the same text, and new records appear as additions.",
    },
  ],
  metaTitle: "Free Books API for AI Agents | Tower of Babel",
  metaDescription:
    "Free books API: machine-readable catalog of 375,000+ public works (books, sacred texts, declassified documents, papers, transcripts) with full-text .txt downloads. No key, no sign-up.",
  updated: "October 2026",
};
