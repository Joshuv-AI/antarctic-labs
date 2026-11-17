// Copy for the Tower of Babel agent-resource surface.
// Page: /tower-of-babel/api      (apiPage)
// Scale figures verified 2026-11-10 (2,557,923 entries live 2026-11-10;
// copy states the exact catalog total — refresh these figures in the
// same pass as any catalog publish that changes the total).
// Guardrails: never claim every record has full text, or an uptime
// SLA. The daily limits stated here MUST match the enforced ladder in
// functions/_lib/api-auth.js (PLAN_LIMITS: free 50, pro 500,
// commercial COMMERCIAL_DAILY_LIMIT = 5,000) — if that table ever
// changes, this copy changes in the same push. An MCP server is live
// at /mcp (keyless, read-only); v1 keyed search is live.

// Stripe customer-portal login link for API subscribers (portal
// configuration bpc_1UUyO1CfFceH9gk0LqPa0tDU, login page enabled
// 2026-10-26). While empty the API page shows the receipt-based
// billing copy instead of a Manage Billing button.
export const PORTAL_URL = "https://billing.stripe.com/p/login/14A14m9pBfOA2VI7UG4gg00";

export const apiPage = {
  h1: "Free books API for AI agents",
  intro:
    "A free books API that gives AI agents machine-readable access to 2,557,923 public " +
    "works — books, the sacred texts of every tradition, declassified documents, scientific " +
    "papers, reference works, and transcripts. A JSON catalog and predictable " +
    "text URLs: no key, no sign-up. Fetch the catalog, filter the records, pull the full " +
    "text where present, confirmed with a plain HTTP request.",
  definition:
    "The Tower of Babel API is a static, keyless data surface: a JSON catalog of every " +
    "holding plus plain-text downloads at predictable URLs. Download " +
    "the catalog once, filter it locally by title, collection, creator, or rights " +
    "status, then fetch only the texts you need. Full text where " +
    "present, not just metadata — that is what separates it from metadata-only book " +
    "APIs. A keyed API (v1, below) adds server-side search alongside it.",
  sections: [
    {
      title: "What you get",
      body:
        "Two things. First, the catalog: a complete JSON record for every holding — title, " +
        "creator, year, collection, description, source, rights status, license, and the " +
        "download URL where text is present — merged at /catalog.json, in shards " +
        "under /catalog-shards/, with a lightweight index at " +
        "/catalog-index.json for fast listing. Second, the texts: clean UTF-8 .txt " +
        "files at predictable URLs under /tower-of-babel/. No key, " +
        "no account, no usage tier to watch on this surface. No uptime SLA is " +
        "offered; it is free infrastructure, maintained as a public resource.",
    },
    {
      title: "Catalog record schema",
      body:
        "Every record carries the same fields. artifact_id is the identifier, used in the " +
        "text URL and in the work's library page at /tower-of-babel/library/<artifact_id>. " +
        "title, creator, and year identify the work; collection names its part of the library " +
        "— books, sacred texts, declassified documents, papers, reference, " +
        "documents, or podcasts. description is a short summary; source and source_url name " +
        "and link the origin when one exists. rights_status and " +
        "license state the usage rights per record; most readable works are public domain. " +
        "download_url follows the pattern /tower-of-babel/<artifact_id>.txt; " +
        "format is TXT and file_size reports the text size. One caution: download_status is " +
        "not perfectly current, so treat download_url as a candidate and confirm with an " +
        "HTTP request — a 200 response means the text is there.",
    },
    {
      title: "How an agent uses it",
      body:
        "Three steps. One: GET https://antarctic-labs.com/catalog.json " +
        "(or the shards under /catalog-shards/) and parse the records. Two: filter locally — " +
        "by title substring, collection, creator, year range, or rights_status; the static " +
        "surface has no server-side search. Three: GET the download_url for each selected " +
        "record and read the plain text. For retrieval-augmented generation, ingest " +
        "the catalog once, index the texts you need, and re-fetch on a schedule " +
        "to pick up new holdings — the library grows daily. A URL that returns 200 keeps " +
        "returning the same text, so cached texts stay valid; handle non-200 responses " +
        "gracefully rather than assuming every work has a file.",
    },
    {
      title: "Corpus composition",
      body:
        "The catalog holds 2,557,923 works. Books: the public domain canon — classic " +
        "literature, philosophy, and foundational political documents, in clean text. " +
        "The sacred collection: the scriptures of every religion and tradition, without " +
        "favoritism. Declassified: government documents released into the public record. " +
        "Papers and reference: the research literature at scale. Podcasts: long-form " +
        "conversation transcripts, useful as spoken-language corpora. The mix is " +
        "the point: most free book APIs serve fiction and poetry metadata; this corpus adds " +
        "primary sources, the world's sacred texts, and a large research " +
        "literature — full text, one schema, one base URL.",
    },
    {
      title: "Licensing and limits",
      body:
        "Rights are per record, not per site. Each catalog entry carries rights_status and " +
        "license fields; the readable collection centers on public domain works and documents " +
        "released to the public. Read those two fields on every record you use rather than " +
        "assuming uniform rights. The static catalog surface needs no API key and has " +
        "no published rate limit. Alongside it, a keyed API (v1, below) offers " +
        "server-side search, full-text delivery, and bulk snapshots at published daily " +
        "limits — the key is free at the first tier and the static surface stays keyless " +
        "either way. The catalog grows as holdings are added, so re-fetch it periodically " +
        "instead of treating a local copy as permanent. No uptime SLA is offered.",
    },
    {
      title: "Harvest with OAI-PMH",
      body:
        "Libraries and harvesters can take the catalog through the OAI-PMH 2.0 endpoint at " +
        "https://antarctic-labs.com/oai, with the standard verbs: Identify, " +
        "ListMetadataFormats, ListSets, ListIdentifiers, ListRecords, and GetRecord, and " +
        "metadata in oai_dc (Dublin Core). Sets are the catalog's collections (setSpec is the " +
        "lowercase collection name, e.g. \"books\"), and identifiers take the form " +
        "oai:antarctic-labs.com:<artifact_id>. Descriptions are deliberately not exposed in " +
        "the OAI records while the library-wide description rewrite is in progress; the " +
        "entry pages carry the current text. Records carry a single repository snapshot " +
        "datestamp rather than per-entry dates, so re-harvest ListRecords in full rather " +
        "than rely on incremental harvesting.",
    },
    {
      title: "API v1 — keys, search, and full text",
      body:
        "API v1 is the keyed companion to the static surface above, at " +
        "https://antarctic-labs.com/api/v1: server-side search, full-text delivery, and bulk " +
        "snapshot packages at published daily limits, with a commercial-use licence on the " +
        "paid tiers. The texts stay free on this site either way; a key buys the maintained " +
        "pipe, the throughput, and someone standing behind it, never access. Authenticate " +
        "with a Bearer key " +
        "(Authorization: Bearer twr_live_…); keys are delivered by email, shown only there, " +
        "and stored only as a hash. Endpoints: GET /api/v1/search?q= — one " +
        "endpoint, two modes. Keyless, it is the free agent search: cursor " +
        "pagination over the catalog, in catalog order. With a key the same call " +
        "counts against the key's daily quota, returns ranked results, and accepts " +
        "&mode=fulltext, which answers from the deep-search index once that index is live " +
        "and says so until then. A presented-but-invalid key is an " +
        "error (401, or 403 if revoked) — never a silent fallback to keyless. " +
        "GET /api/v1/text?id= (paid plans: a redirect to the " +
        "work's .txt, where text is present), GET /api/v1/bulk (snapshot package list), and " +
        "GET /api/v1/usage (your key's plan and today's count). Daily limits: free key 50 " +
        "requests/day, Pro 500, Commercial 5,000. Every keyed response carries X-RateLimit-Limit, " +
        "X-RateLimit-Remaining, and X-RateLimit-Reset headers; going over the daily limit " +
        "returns 429 with the reset time. Keyed errors are JSON: { ok: false, error }; the " +
        "keyless search keeps its own error shape, { error: { code, message } }. No uptime SLA is offered on " +
        "any tier. Versioning: v1 is stable — breaking changes ship as a new version, never " +
        "as a silent change to v1, and limit changes are announced on this page and by email " +
        "to key holders before they take effect. Limits are never tightened silently.",
    },
  ],
  faqs: [
    {
      q: "Is there a free API for Project Gutenberg texts?",
      a: "Project Gutenberg itself has no official API; that gap is why third-party services like Gutendex exist, and Gutendex serves metadata only. The Tower of Babel takes the other approach: a free, keyless catalog over 2,557,923 works — Gutenberg-sourced public domain works included — serving the full text of each work whose text is present as a plain .txt file, not just metadata. Confirm with a request before assuming text exists.",
    },
    {
      q: "How can my AI agent access public domain books?",
      a: "Download https://antarctic-labs.com/catalog.json, filter the records by title, collection, creator, or rights_status, then GET the download_url of each work you want. The texts are plain UTF-8 .txt at predictable URLs shaped like /tower-of-babel/<artifact_id>.txt. No key, no sign-up, no published rate limit. Confirm each URL returns 200 before treating the text as present — download_status is not perfectly current, so the HTTP response is the reliable signal. Index what you need, and re-fetch the catalog on a schedule for new holdings.",
    },
    {
      q: "Does the API return full text or just metadata?",
      a: "Full text, where present. The catalog record is metadata; the download_url on a record with a live text file points to the complete work as a plain text file — the deliberate difference from metadata-only book APIs, which tell you a book exists but make you find the text elsewhere. Availability varies per record, so confirm with the HTTP response.",
    },
    {
      q: "Do I need an API key? Are there rate limits?",
      a: "Not for the catalog itself: no key, no account, no published rate limit on the static surface — static files on CDN-backed hosting. The keyed API v1 is separate: a free key by email at 50 requests/day, Pro at 500/day, and Commercial at 5,000/day. Reasonable behavior still applies on the keyless surface: download the catalog once and cache it, fetch only the texts you need, and do not hammer the host with parallel thousands-wide crawls.",
    },
    {
      q: "Can I use these texts commercially, including for training data?",
      a: "It depends on the record. Each catalog entry carries rights_status and license fields; most readable works are public domain, which permits commercial use and training. Read those two fields on every record you use. The site makes no blanket grant beyond what each record's stated rights allow, and it offers no legal advice on edge cases.",
    },
    {
      q: "Is there a search endpoint or an MCP server?",
      a: "Both. Search is API v1's GET /api/v1/search: keyless cursor pagination over the catalog, or — with a free or paid key — ranked results that count against the key's daily limit. An MCP server is live at https://antarctic-labs.com/mcp with four read-only tools (search_works, get_work, list_collection, list_group) over the same catalog, no key required. The keyless pattern — download catalog.json once, filter and search it locally — remains the primary surface.",
    },
    {
      q: "How fresh is the catalog? How do I stay current?",
      a: "The catalog grows daily as new holdings are added. There is no changelog feed; re-fetch catalog.json on a schedule (weekly is reasonable) and diff artifact_id values against your local copy. Artifact IDs are not reused, so a text URL that returned 200 keeps returning the same text, and new records appear as additions.",
    },
  ],
  metaTitle: "Free Books API for AI Agents | Tower of Babel",
  metaDescription:
    "Free books API: machine-readable catalog of 2,557,923 public works (books, sacred texts, declassified documents, papers, transcripts) with full-text .txt downloads. No key, no sign-up.",
  updated: "November 2026",
  tiers: [
    {
      id: "keyless",
      name: "Keyless catalog",
      price: "Free",
      limit: "No published limit",
      blurb:
        "The static surface documented above: the full catalog JSON, shards, and predictable .txt URLs. No key, no sign-up — the discovery layer, and it stays open.",
    },
    {
      id: "free",
      name: "Free key",
      price: "Free",
      limit: "50 requests/day",
      blurb:
        "A key by email for API v1: catalog search and metadata for your own projects. Non-commercial use. The key is shown only in the email that delivers it.",
    },
    {
      id: "pro",
      name: "Pro",
      priceMonthly: "$19/mo",
      priceAnnual: "$190/yr",
      limit: "500 requests/day",
      blurb:
        "API v1 with full-text delivery and a commercial-use licence for a single project — the maintained pipe, not the scrape.",
    },
    {
      id: "commercial",
      name: "Commercial",
      priceMonthly: "$149/mo",
      priceAnnual: "$1,490/yr",
      limit: "5,000 requests/day",
      blurb:
        "Everything in Pro at commercial scale: bulk snapshot packages and a licence covering multiple projects.",
    },
  ],
  keyForm: {
    heading: "GET A FREE KEY",
    body:
      "Enter your email and a free key is sent to it — shown only in that email, stored here only as a hash. Asking for a new key revokes the previous free key for that address.",
    button: "EMAIL ME A KEY",
    pending:
      "API keys are being switched on — for now, leave your email through the library's suggest form and a key will be issued by hand when the system opens.",
    sent:
      "Your key is on its way to that address — it is shown only in that email, so keep it somewhere safe.",
  },
  billingNote:
    "Billing is managed through Stripe — the receipt for any payment includes a manage-billing link.",
  refundNote:
    "Refunds: cancel within 7 days of a charge and that charge is refunded in full — email us from the address on the subscription and we will process it; the API key stays active until the end of the paid period unless you ask us to revoke it sooner.",
  subscribePending:
    "Paid plans are being switched on. When subscriptions open, the subscribe buttons will appear here — no checkout is ever offered before the key system behind it is live.",
};
