// Draft copy for the Tower of Babel agent-resource surface.
// Page: /tower-of-babel/library  (libraryFaqs)
// Page: /tower-of-babel/api      (apiPage)
// All facts verified 2026-10-01. No invented numbers, no MCP/API claims.

export const libraryFaqs = [
  {
    q: "Where can I read classic books online for free?",
    a: "The Tower of Babel library catalogues 3,448 texts, including 913 books, and every work with available text opens as a full, clean text you can read in the browser. There is no sign-up, no paywall, and no app to install. The collection skews toward public domain classics, foundational documents, and historical texts. Many records are metadata-only; the access button appears only where the text file exists.",
  },
  {
    q: "Is the Tower of Babel a good Project Gutenberg alternative?",
    a: "It serves the same purpose with a different scope. Project Gutenberg is the largest archive of public domain ebooks. The Tower of Babel is smaller but also carries material Gutenberg does not: 1,412 declassified documents and 1,091 podcast transcripts alongside the book collection. If a classic is in the catalog, you can read the full text directly.",
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
    a: "3,448 catalogued texts: 913 books, 1,412 declassified documents, 1,091 podcast transcripts, 22 documents, 9 reference works, and 1 paper. The books cover classic literature, philosophy, sacred texts, and foundational political documents. The declassified section holds government documents released to the public. Transcripts cover long-form podcast conversations.",
  },
  {
    q: "Can I download the books, or only read them in the browser?",
    a: "Works with available text can be opened and read in full in the browser. Availability varies per record: the site only shows an access button when the text file is present. There is no bulk download for the whole catalog; the machine-readable catalog file is the way to work with the collection at scale.",
  },
  {
    q: "Can AI agents use the Tower of Babel as a reference source?",
    a: "Yes. The catalog is published as a single machine-readable JSON file with a documented schema, and texts are served as plain .txt files at predictable URLs where the text exists. The /tower-of-babel/api page documents the fetch pattern, the record fields, licensing, and the limits of what is available.",
  },
];

export const apiPage = {
  h1: "Free books API for AI agents",
  intro:
    "A free books API that gives AI agents machine-readable access to 3,448 public texts: " +
    "913 books, 1,412 declassified documents, and 1,091 podcast transcripts. One catalog file, " +
    "predictable text URLs, no key, no sign-up. Fetch the catalog, filter the records, pull the " +
    "full text of whichever works have downloadable text available. Many records are " +
    "metadata-only; availability is confirmed with a plain HTTP request.",
  definition:
    "The Tower of Babel API is a static, keyless data surface: a single JSON catalog of every " +
    "holding plus direct plain-text downloads at predictable URLs. It is not a query service. " +
    "There is no search endpoint, no authentication, and no published rate limit. An agent downloads the " +
    "catalog once, filters it locally by title, collection, creator, or rights status, then fetches " +
    "only the texts it needs. The full text is served where present, not just metadata, which is what separates " +
    "it from metadata-only book APIs.",
  sections: [
    {
      title: "What you get",
      body:
        "Two things. First, catalog.json: one 2.36 MB JSON array with a record for all 3,448 " +
        "catalogued texts, including title, creator, year, collection, description, source, " +
        "rights status, license, and the download URL where text is present. Second, the texts " +
        "themselves: clean UTF-8 .txt files served from predictable URLs under /tower-of-babel/. " +
        "Together they form a complete static API. Download the catalog, filter it, fetch texts. " +
        "No key to request, no account to create, no usage tier to watch. No uptime SLA is " +
        "offered; it is free infrastructure, maintained as a public resource.",
    },
    {
      title: "Catalog record schema",
      body:
        "Every record in catalog.json carries the same fields. artifact_id is the " +
        "identifier, used in the text URL. title, creator, and year identify the work. collection " +
        "is one of BOOKS, DECLASSIFIED, PODCASTS, DOCUMENTS, REFERENCE, or PAPERS. description " +
        "is a short summary. source names where the text came from, and source_url links to the " +
        "origin when one exists. rights_status and license state the usage rights per record; " +
        "most readable works are public domain. download_status is AVAILABLE or unavailable, and " +
        "download_url gives the text path, following the pattern " +
        "/tower-of-babel/<artifact_id>.txt. format is TXT and file_size reports the text size. " +
        "Important: download_status is not perfectly current. Some records marked AVAILABLE do " +
        "not yet have a text file, so agents must treat download_url as a candidate and confirm " +
        "with an HTTP request: a 200 response means the text is there, anything else means the " +
        "record is metadata-only for now. The site itself only renders access buttons for " +
        "records whose files exist, so a 200 on download_url is the reliable signal.",
    },
    {
      title: "How an agent uses it",
      body:
        "The fetch pattern is three steps. One: GET https://antarctic-labs.com/catalog.json and " +
        "parse the array. Two: filter locally. Find works by title substring, collection, creator, " +
        "year range, or rights_status. There is no server-side search, so filtering happens in the " +
        "agent's own code after one download. Three: GET the download_url for each selected record " +
        "and read the plain text. For retrieval-augmented generation, the practical setup is to " +
        "ingest the catalog once, embed or index the texts the agent needs, and re-fetch " +
        "catalog.json on a schedule to pick up new holdings. Because text URLs are addressed " +
        "by artifact_id, a URL that returns 200 keeps returning the same text, so cached texts " +
        "stay valid. Text availability varies per record, so agents should handle non-200 " +
        "responses gracefully rather than assuming every catalogued work has a downloadable file.",
    },
    {
      title: "Corpus composition",
      body:
        "The catalog holds 3,448 texts across six collections. BOOKS (913) covers classic " +
        "literature, philosophy, sacred texts, and foundational political documents: the public " +
        "domain canon, preserved as clean text. DECLASSIFIED (1,412) is the largest section: " +
        "government documents released into the public record. PODCASTS (1,091) holds long-form " +
        "conversation transcripts, useful as contemporary spoken-language corpora. DOCUMENTS (22), " +
        "REFERENCE (9), and PAPERS (1) round out the set. The mix is the point: most free book " +
        "APIs serve fiction and poetry metadata. This corpus adds primary-source government " +
        "documents and thousands of hours of transcribed conversation, in full text, in one " +
        "schema, at one base URL.",
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
      a: "Project Gutenberg itself has no official API; that gap is why third-party services like Gutendex exist, and Gutendex serves metadata only. The Tower of Babel takes the other approach: a free, keyless catalog over 3,448 texts that includes Gutenberg-sourced public domain works and serves the full text of each work whose text is present as a plain .txt file, not just metadata. Where a work's text is present, one GET returns the entire book. Many records are metadata-only, so confirm with a request before assuming text exists.",
    },
    {
      q: "How can my AI agent access public domain books?",
      a: "Download https://antarctic-labs.com/catalog.json, filter the 3,448 records by title, collection, creator, or rights_status, then GET the download_url of each work you want. The texts are plain UTF-8 .txt at predictable URLs shaped like /tower-of-babel/<artifact_id>.txt. No key, no sign-up, no published rate limit. Confirm each URL returns 200 before treating the text as present — download_status is not perfectly current, so the HTTP response is the reliable signal. Index the texts you need for retrieval, and re-fetch the catalog on a schedule to pick up new holdings.",
    },
    {
      q: "Does the API return full text or just metadata?",
      a: "Full text, where present. The catalog record is metadata; the download_url on a record with a live text file points to the complete work as a plain text file. This is the deliberate difference from metadata-only book APIs, which tell you a book exists but make you find the text elsewhere. Availability varies per record: many records are metadata-only, so confirm with the HTTP response before treating a text as present.",
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
      a: "The catalog is a snapshot that grows as new holdings are added. There is no versioning scheme or changelog feed; the practical approach is to re-fetch catalog.json on a schedule (weekly is reasonable) and diff artifact_id values against your local copy. Artifact IDs are not reused for different works, so a text URL that returned 200 keeps returning the same text, and new records appear as additions.",
    },
  ],
  metaTitle: "Free Books API for AI Agents | Tower of Babel",
  metaDescription:
    "Free books API: machine-readable catalog of 3,448 public texts (books, declassified documents, transcripts) with full-text .txt downloads. No key, no sign-up.",
  updated: "October 2026",
};
