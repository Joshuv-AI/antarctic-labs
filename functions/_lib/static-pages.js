// Server-rendered static pages for the site's main routes.
//
// Served by functions/_middleware.js to crawler and reviewer user
// agents only (the same BOT_UA gate as the entry pages in
// functions/tower-of-babel/library/[id].js); human visitors always get
// the React SPA untouched.
//
// Why this exists (2026-11-03, AdSense fix): on 2026-11-02 Google
// rejected antarctic-labs.com for AdSense with "Google-served ads on
// screens without publisher-content" and "Low value content". Every
// route served the same 11 KB app shell — a branded loading screen and
// 39 words — to any reader that does not run the app, and the ad
// review crawlers (AdsBot, Mediapartners-Google) were not on the
// entry pages' crawler list at all. These pages mirror the app pages'
// real copy (sources: src/content/site.js, operator.js, government.js,
// tower-of-babel.js, tower-api.js, faq.js, and the Privacy page in
// src/pages.jsx) so a non-JS reader sees the same substance a visitor
// gets. Keep the copy in sync when the sources change.

import { curationStreamHtml } from "./curation.js";

const SITE = "https://antarctic-labs.com";
const ADS_SCRIPT =
  '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9404729840269984" crossorigin="anonymous"></script>';

const NAV = `<header>
<nav>
<a href="/">Antarctic Labs</a> ·
<a href="/tower-of-babel">Tower of Babel</a> ·
<a href="/tower-of-babel/library">Library</a> ·
<a href="/about">About</a> ·
<a href="/contact">Contact</a> ·
<a href="/privacy">Privacy Policy</a>
</nav>
</header>`;

const FOOT = `<footer>
<p><a href="/">Antarctic Labs</a> · <a href="/tower-of-babel">Tower of Babel</a> · <a href="/tower-of-babel/library">Library</a> · <a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/government-contracting">Government Contracting</a> · <a href="/tower-of-babel/donate">Donate</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms</a> · <a href="/rights-and-sources">Rights &amp; Sources</a></p>
<p>© 2026 Antarctic Labs. All rights reserved.</p>
</footer>`;

// FAQ JSON-LD parity (2026-11-11 discoverability fix): the app's API
// page emits a FAQPage node (src/seo.js faqsForPath) and renders the
// questions visibly, but this static render historically carried no
// FAQPage node at all — and did not even carry the questions. The Q&A
// below is copied VERBATIM from src/content/tower-api.js (apiPage.faqs);
// keep the copy in sync when the source changes.
// No other static page gets an FAQ: the app has no FAQ for them either.
// (The library page's QUESTIONS section was removed 2026-11-12 on
// Joshua's order — that Q&A lives on the Privacy Policy page now — so
// the library static render carries no FAQ and no FAQPage node.)
const API_FAQS = [
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
    a: "Not for the catalog itself: no key, no account, no published rate limit on the static surface — static files on CDN-backed hosting. The keyed API v1 is separate: a free key by email at 50 requests/day, Pro at 500/day, and Commercial unlimited. Reasonable behavior still applies on the keyless surface: download the catalog once and cache it, fetch only the texts you need, and do not hammer the host with parallel thousands-wide crawls.",
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
];

function faqPageNode(faqs) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

// Google Preferred Sources deeplink (2026-11-11): the plain-link form
// only — Google's JS button form loads publisher.js sitewide and is
// deliberately not used. The feature is per-user personalization
// (readers who pick a source see it surfaced more in their own AI
// Overviews / AI Mode); the copy makes no ranking claim.
const PREFERRED_SOURCE_LINE = `<p><a href="https://www.google.com/preferences/source?q=antarctic-labs.com" target="_blank" rel="noopener">Add Antarctic Labs as a preferred source on Google</a></p>`;

// Visible FAQ block, mirroring the app API page's Questions section
// shape (h2 + h3/p pairs), generated from the same verbatim data as
// the FAQPage JSON-LD so the two can never drift apart.
function faqSection(faqs) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return (
    `<h2>Questions</h2>\n` +
    faqs.map((f) => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join("\n")
  );
}

function doc({ path, title, description, body, faq }) {
  const canonical = SITE + (path === "/" ? "/" : path);
  const graph = [
    {
      "@type": "Organization",
      name: "Antarctic Labs",
      url: "https://antarctic-labs.com/",
      email: "hello@antarctic-labs.com",
    },
    {
      "@type": "WebSite",
      name: "Antarctic Labs",
      url: "https://antarctic-labs.com/",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate:
            "https://antarctic-labs.com/tower-of-babel/library?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
  ];
  if (faq) graph.push(faqPageNode(faq));
  const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(
    /</g,
    "\\u003c"
  );
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${canonical}" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<script type="application/ld+json">
${jsonLd}
</script>
${ADS_SCRIPT}
<style>
body { font-family: Georgia, "Times New Roman", serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; line-height: 1.65; color: #191919; }
h1 { line-height: 1.15; } h2 { margin-top: 2rem; }
nav a, footer a { color: #0f5d75; }
table { border-collapse: collapse; } th, td { text-align: left; padding: .3rem .8rem .3rem 0; vertical-align: top; }
</style>
</head>
<body>
${NAV}
<main>
${body}
</main>
${FOOT}
</body>
</html>
`;
}

const PAGES = {
  "/": {
    path: "/",
    title: "Tower of Babel — Free Online Library of 2,557,923 Works | ANTARCTIC LABS",
    description:
      "The Tower of Babel is a free online library of 2,557,923 works — books, sacred texts, law, papers, declassified documents and transcripts, preserved in clean, searchable text. No sign-up.",
    body: `<h1>The Tower of Babel — a free library of 2,557,923 works</h1>
<p>Every work that matters, within everyone's reach. The Tower of Babel is a free online library built and maintained by Antarctic Labs: 2,557,923 books, sacred texts, laws, scientific papers, declassified government documents, reference works and long-form conversations, each preserved as clean, searchable text and free for anyone to read. No accounts, no paywalls.</p>
<p>The library began with a conviction: the written record of humanity should be preserved, not lost — deleted, quietly rewritten, or locked away. So the lab built a library that keeps it. Every work is verified against its source before it is shelved, every record carries its own rights status and license, and a work whose text cannot be obtained is not listed at all — the catalog holds no placeholders. How rights are checked, where texts come from, and how corrections and takedowns work are set out in <a href="/rights-and-sources">Rights &amp; Sources</a>.</p>
<p>Read in the browser with a book-style reader, search the full text where present, listen to works read aloud, cite any work in five styles, or build on the collection through a public API and a standard scholarly feed — free keys for anyone, with paid tiers for heavier use.</p>
<h2>The collections</h2>
<p><strong>Law — 1,277,197 works.</strong> United States law and public legal records: the United States Code, the Federal Register, and historic legal texts preserved alongside them.</p>
<p><strong>Papers — 1,130,210 works.</strong> Research papers and preprints from open scholarly sources — arXiv, PubMed Central, PLOS and other open journals — organised into 12 fields and 70 subfields.</p>
<p><strong>Books — 81,631 works.</strong> Public-domain books: classic literature, philosophy, history and foundational documents, together with the sacred texts of the world's traditions.</p>
<p><strong>Reference — 41,137 works.</strong> Dictionaries, encyclopedias and lexicons kept for lookup, from Johnson's Dictionary (1755) to the Liddell–Scott Greek lexicon.</p>
<p><strong>Declassified — 26,294 works.</strong> Government documents released into the public record: CIA releases, the Foreign Relations of the United States series, FBI files and National Security Archive publications.</p>
<p><strong>Podcasts — 1,091 works.</strong> Long-form conversation transcripts, preserved as searchable text.</p>
<p><strong>Documents — 363 works.</strong> Founding and historic documents — the Declaration of Independence, the Constitution of the United States and other primary documents.</p>
<p><a href="/tower-of-babel">Enter the Tower</a> · <a href="/tower-of-babel/library">Browse the library</a> · <a href="/tower-of-babel/collections">All collections</a></p>
${curationStreamHtml(esc)}
<h2>The lab</h2>
<p>The Tower of Babel is a project of Antarctic Labs, an independent laboratory for AI and computing — small, private, and deliberate, judged by the work it puts into the world. Alongside the library the lab builds applied AI systems, data pipelines that structure information by the million documents, and the owned infrastructure everything runs on; it also develops and runs its own trading systems in-house. <a href="/about">About the lab</a> · <a href="/government-contracting">Government contracting</a></p>`,
  },

  "/about": {
    path: "/about",
    title: "The Firm | ANTARCTIC LABS",
    description:
      "About Antarctic Labs: a proprietary trading and computing firm. Operations in the United States, infrastructure in the Philippines. No client work.",
    body: `<h1>The Firm.</h1>
<p>Antarctic Labs is a proprietary trading and computing firm. We trade our own capital on infrastructure we own. We do not build for clients, and we do not sell services.</p>
<h2>Who we are</h2>
<p>Antarctic Labs is a proprietary trading and computing firm. It began as a freelance technology studio; that chapter is closed. The firm now does one thing: it trades its own capital on infrastructure it owns and operates, built around one idea — own the hardware, own the systems, and let the results decide what grows.</p>
<p>The work has three parts. Trading systems are developed and run in-house. The hardware is owned: a base in the Philippines — a commercial office and a small data center — is being established around machines the firm owns and operates. And the position is measured, not assumed: the Philippines connects directly toward Hong Kong, and every route is chosen by benchmarking the real endpoints, not by reading maps.</p>
<h2>The partners</h2>
<h3>Joshua — Founder, Operations, Logistics &amp; Accounting</h3>
<p>Founder running Antarctic Labs day to day: the Philippines venture — entity, office, and owned data-center build — and the Tower of Babel library, 2,557,923 works live. He owns the direction, the business, and the delivery: logistics, operations, and accounting, judged by what proves real when it is run.</p>
<h3>Andrew — Partner, Engineering &amp; Systems</h3>
<p>At Antarctic Labs, Andrew leads engineering: the trading algorithms developed in-house, the server build, and the systems the firm runs on. His work is why the firm trades on infrastructure it owns and operates, tested on paper and with limited capital before anything scales.</p>
<table>
<tr><th scope="row">Structure</th><td>Private partnership</td></tr>
<tr><th scope="row">Bases</th><td>United States · Philippines</td></tr>
<tr><th scope="row">Client work</th><td>None</td></tr>
<tr><th scope="row">Status</th><td>In formation, Philippines</td></tr>
</table>`,
  },

  "/government-contracting": {
    path: "/government-contracting",
    title: "Small Business Government Contracting | ANTARCTIC LABS",
    description:
      "Antarctic Labs is developing toward public-sector work: AI analyst workflows, data systems, and automation for primes — pilots, SBIR/STTR, and teaming.",
    body: `<h1>Where we're heading.</h1>
<p>Antarctic Labs is an independent technology lab building operational AI, automation, and data systems for commercial clients today. Government contracting is where this practice is heading — subcontract partnerships, phased R&amp;D programs, and competitive prototypes with defense and public-sector teams.</p>
<h2>A technical specialist developing toward public service.</h2>
<p>Primes don't need another generalist. They need small technical specialists who can prove a capability against a real operational problem — analyst workflows, data at scale, geospatial fusion, automation that removes real bottlenecks. That is what Antarctic Labs builds.</p>
<p>This practice is emerging. The technical foundation is being laid now through commercial delivery — working systems, documented methods, demonstrated prototypes. Registrations, phased R&amp;D programs, and prime partnerships are the next phase, pursued deliberately and stated honestly.</p>
<h2>Where we fit today</h2>
<p>Narrow technical lanes, each grounded in systems already built and operating for commercial clients — the expansions from here are prototypes, not promises.</p>
<h3>Analyst workflows</h3>
<p>AI systems that work through operational problems: triage, extraction, and summarization that cut hours of manual review.</p>
<h3>Data at scale</h3>
<p>Ingestion, cleaning, and structuring that turn scattered or unstructured material into usable datasets and archives.</p>
<h3>Geospatial fusion</h3>
<p>Live data fusion and visualization for a clear operational picture — built and running today.</p>
<h3>Workflow automation</h3>
<p>Browser automation and operational pipelines that remove repetitive work from real processes.</p>
<h3>Secure software</h3>
<p>Web applications and internal tools — designed, built, tested, and documented.</p>
<h3>Rapid prototypes</h3>
<p>Small, sharply-scoped unclassified builds that prove a capability before anyone commits to more.</p>
<h2>How we'll engage</h2>
<h3>Prototype pilots</h3>
<p>Sharply-scoped demonstrations against a real operational problem — the fastest way to prove fit.</p>
<h3>SBIR / STTR &amp; OTA</h3>
<p>Phased R&amp;D topics and rapid-prototype programs built for nontraditional vendors — the designed on-ramp for an emerging practice.</p>
<h3>Subcontract teaming</h3>
<p>Technical execution under an experienced prime: a specialist partner for AI, automation, and data systems.</p>
<p>Status note: Antarctic Labs does not currently hold government contracts, registrations, certifications, security clearances, or past performance as a government vendor. The technical work described on this page is real; the public-sector practice is under active development.</p>`,
  },
};

PAGES["/privacy"] = {
  path: "/privacy",
  title: "Privacy Policy | ANTARCTIC LABS",
  description:
    "Privacy Policy for antarctic-labs.com: what Antarctic Labs collects, how cookies and Google AdSense advertising work, and how to opt out of personalized advertising.",
  body: `<h1>Privacy Policy</h1>
<p>Last updated: November 20, 2026. Antarctic Labs operates antarctic-labs.com, including the Tower of Babel free library.</p>
<h2>Reading without an account</h2>
<p>You do not need an account, a sign-in, or any personal information to read the Tower of Babel library. The texts in the library are public-domain and openly licensed works, hosted on this site in plain text.</p>
<h2>Information we collect</h2>
<p>We collect as little as possible. Anonymous analytics: we use PostHog to count page views, library browsing, reading progress, and text downloads. PostHog is configured for anonymous visitors only — no user profiles are created, session recording is disabled, and automatic event capture is off. Only events we deliberately record are sent, tied to an anonymous visitor identifier, not to a name or email address.</p>
<p>Information you choose to give us: if you donate, Stripe collects your email address at checkout to create a checkout session and, if enabled in Stripe, to send a receipt. We do not receive or store your card number. If you suggest a work for the library, you provide the title, creator, source link, and any notes you choose to add. Our hosting provider may process basic technical information needed to deliver pages securely, such as IP address and browser type, in its normal server logs.</p>
<p>API keys: if you request a Tower of Babel API key, we store the email address you give and a cryptographic hash of the key — never the key itself — in a Cloudflare database, so the API can authenticate your requests and count your daily usage. Payments for API plans are processed by Stripe, and we do not receive or store your card number. The email that delivers your key is sent through Resend.</p>
<h2>Cookies and advertising</h2>
<p>We use Google AdSense to show advertising on the Tower of Babel library pages. No advertising is shown on the donation page. Third-party vendors, including Google, use cookies to serve ads based on a user's prior visits to this website or other websites. Google's use of advertising cookies enables it and its partners to serve ads to users based on their visit to this site and other sites on the internet.</p>
<p>You may opt out of personalized advertising by visiting <a href="https://adssettings.google.com">Google Ads Settings</a> and <a href="https://www.aboutads.info">aboutads.info</a>. Other third-party vendors and ad networks may also serve ads on the library pages, and many of them can be opted out of on the same aboutads.info page. How Google uses information from sites and apps that use its services is explained on <a href="https://policies.google.com/technologies/partner-sites">Google's partner-sites page</a>. You can also set your browser to refuse cookies, though some site features may work less well without them. PostHog also uses cookies and local storage to keep its anonymous visitor identifier between visits.</p>
<h2>Service providers</h2>
<p>The site runs on a small set of service providers, each processing only what its job requires. Cloudflare hosts the site and holds the API-key database. PostHog provides the anonymous analytics described above. Stripe processes donations and API-plan payments; we never receive or store your card number. Resend delivers the email that carries a new API key. Google serves the advertising described above. We do not sell personal information, and we share it with no one else except as required by law.</p>
<h2>How information is used and shared</h2>
<p>Information is used to operate the site and the library, to understand which works readers use, to process donations, and to show advertising. It is shared only with the service providers needed for those purposes — analytics, payment processing, and advertising — and as required by law. We do not publish or display information you provide through donation or suggestion forms.</p>
<h2>Data retention</h2>
<p>Anonymous analytics are never tied to a name or an email address, and are kept only in aggregate. If you hold an API key, we keep your email address and the cryptographic hash of the key for as long as the key is active; ask us to delete them and the record is removed and the key revoked. Donation records are kept for as long as accounting and legal obligations require. A work suggestion is kept with the catalog work it concerns.</p>
<h2>Security</h2>
<p>The site is served over HTTPS. API keys are stored only as cryptographic hashes, and card payments never touch our systems — Stripe handles them end to end. No system is perfectly secure, but the information here to protect is deliberately small: no accounts, no passwords, no card numbers.</p>
<h2>Your choices</h2>
<p>You can refuse or delete cookies in your browser at any time, and opt out of personalized advertising at the links above. If we hold personal information about you — in practice, the email address attached to an API key or a donation — you may ask what it is, ask for a copy, or ask for it to be deleted, by writing to the address below. Anonymous analytics identifiers cannot be looked up or deleted per person, because they are not tied to anyone's identity.</p>
<h2>Children</h2>
<p>The library is a general-audience collection of books and documents. The site is not directed at children under 13, and we do not knowingly collect personal information from children — reading asks for no information from anyone, of any age.</p>
<h2>Changes and contact</h2>
<p>This policy may be updated as the site changes; the date at the top of this page will change with it. Questions about this policy can be sent to <a href="mailto:hello@antarctic-labs.com">hello@antarctic-labs.com</a>, or through the suggestion form on the Tower of Babel library pages.</p>`,
};

PAGES["/contact"] = {
  path: "/contact",
  title: "Contact | ANTARCTIC LABS",
  description:
    "Contact Antarctic Labs: one email address for the lab, the Tower of Babel library, corrections and rights questions.",
  body: `<h1>Contact</h1>
<p>One address reaches the lab:</p>
<p><a href="mailto:hello@antarctic-labs.com">hello@antarctic-labs.com</a></p>
<p>For a work you would like to see in the library, the <a href="/tower-of-babel/library/suggest">suggestion form</a> is faster. For API keys and tiers, see <a href="/tower-of-babel/library/research">API access</a>. Corrections to a catalog record and rights questions are covered in <a href="/rights-and-sources">Rights &amp; Sources</a> — email the address above with the work's title or link.</p>`,
};

PAGES["/terms"] = {
  path: "/terms",
  title: "Terms of Use | ANTARCTIC LABS",
  description:
    "Terms of use for antarctic-labs.com and the Tower of Babel library: reading, the texts' rights, API keys, donations, and acceptable use.",
  body: `<h1>Terms of Use</h1>
<p>Last updated: November 20, 2026. These terms cover antarctic-labs.com, including the Tower of Babel library, operated by Antarctic Labs.</p>
<h2>Acceptance</h2>
<p>Using this site — reading, searching, listening, downloading, holding an API key, or donating — means you accept these terms and the <a href="/privacy">Privacy Policy</a>. If you do not agree with them, please do not use the site.</p>
<h2>Reading</h2>
<p>The library is free to read. You do not need an account, a sign-in, or any personal information to read, search, listen to, or download the works whose texts are hosted here. We work to keep the site available and correct, but availability is not guaranteed and no uptime commitment is made on any part of the site, free or paid.</p>
<h2>The texts and their rights</h2>
<p>The works in the library are public-domain or openly licensed texts. Rights are stated per work: every catalog record carries its own rights status and license fields, and those fields — not this page — govern what you may do with a given work. Antarctic Labs claims no new copyright in the texts themselves. The catalog data, the site's own writing (descriptions, introductions, collection essays), and the site software are the lab's own work; ask before republishing them wholesale.</p>
<h2>Your submissions</h2>
<p>The suggestion form exists so readers can propose works for the library. By sending a suggestion, you confirm that you have the right to share what you send, and you give Antarctic Labs permission to use it — the title, source, and any notes — in building and maintaining the catalog. Sending a suggestion does not oblige the lab to acquire the work.</p>
<h2>Acceptable use</h2>
<p>Use the site as a reader would. Do not disrupt the service, probe it for vulnerabilities, or misrepresent the library's contents as your own publication. Automated access is welcome through the documented surfaces — the catalog files, the API, and the OAI-PMH feed — within the limits published for each. Bulk scraping outside those surfaces, at rates that degrade the library for readers, is not.</p>
<h2>API keys</h2>
<p>API v1 keys are issued per email address under the limits published on the <a href="/tower-of-babel/library/research">API access</a> page (free 50 requests/day, Pro 500/day, Commercial unlimited). A key is for the holder's own projects; do not share or resell it. We may revoke a key that abuses the service. Paid plans are billed through Stripe; cancel within 7 days of a charge and that charge is refunded in full — the key stays active until the end of the paid period unless you ask us to revoke it sooner.</p>
<h2>Donations</h2>
<p>Donations are voluntary contributions toward the library's servers, storage and preservation work. Antarctic Labs is not a registered charity, so contributions are not tax-deductible.</p>
<h2>Third-party links</h2>
<p>Catalog records name and link to the sources their texts came from, and pages on this site may link to other outside sites. Those sites are not under our control, and we are not responsible for their content or their practices. The third parties that operate on this site itself are described in the <a href="/privacy">Privacy Policy</a>.</p>
<h2>Advertising</h2>
<p>The library pages show advertising served by Google AdSense; the donation page shows none. How advertising cookies work, and how to opt out of personalized advertising, is covered in the <a href="/privacy">Privacy Policy</a>.</p>
<h2>As-is</h2>
<p>The site and the texts are provided as they are. Texts are verified against their sources and corrected when errors are found (see <a href="/rights-and-sources">Rights &amp; Sources</a>), but no warranty is made that any given text is complete or error-free. To the extent the law allows, the lab is not liable for losses arising from use of the site.</p>
<h2>Governing law</h2>
<p>These terms are governed by the laws of the State of Florida, in the United States, where Antarctic Labs operates.</p>
<h2>Changes and contact</h2>
<p>These terms may be updated as the site changes; the date at the top will change with them. Questions: <a href="mailto:hello@antarctic-labs.com">hello@antarctic-labs.com</a>, or the <a href="/contact">Contact page</a>.</p>`,
};

PAGES["/rights-and-sources"] = {
  path: "/rights-and-sources",
  title: "Rights & Sources | ANTARCTIC LABS",
  description:
    "How the Tower of Babel library clears rights and sources its texts: public-domain and openly licensed works only, per-record rights, corrections and takedown.",
  body: `<h1>Rights &amp; Sources</h1>
<p>Last updated: November 18, 2026. This page states how the Tower of Babel library decides what it may hold, where its texts come from, and what happens when something is wrong.</p>
<h2>What the library holds</h2>
<p>Only public-domain and openly licensed works. A work whose rights cannot be established does not enter the catalog. Rights are recorded per work, not per site: every catalog record carries a rights status and a license field, shown on the work's own page, and those two fields state what a reader may do with that work. Most readable works in the library are public domain.</p>
<h2>Where the texts come from</h2>
<p>Texts are taken from the open sources that publish them for exactly this purpose, and each record names its source and links to it: Project Gutenberg and the open book collections for books and sacred texts; arXiv, PubMed Central, PLOS and other open journals for papers; the official publishers of United States law — the United States Code and the Federal Register — for the Law collection; the CIA's reading room, the Foreign Relations of the United States series, FBI releases and the National Security Archive for declassified documents; and the reference publishers whose dictionaries and encyclopedias have entered the public domain.</p>
<h2>How a work gets in</h2>
<p>Three gates, in order. First, rights: the work is public domain or openly licensed, and the basis is recorded on its record. Second, text: a clean, complete full text must be obtainable — a catalog entry is published only once its text is hosted, never as a metadata-only placeholder. Third, verification: the text is checked against its source, and the record is built from the work itself — title, creator, year, collection, and provenance.</p>
<h2>Corrections</h2>
<p>Errors survive any process at this scale, so corrections are a standing program, not an afterthought: the whole library has been through a reader's-eye legibility comb-through, and mislabelled, broken or wrongly attributed works are repaired or removed outright when found. To report one, use the <a href="/tower-of-babel/library/suggest">suggestion form</a> or email <a href="mailto:hello@antarctic-labs.com">hello@antarctic-labs.com</a> with the work's title or link and what is wrong; verified reports are corrected in the catalog and the record updated.</p>
<h2>Takedown</h2>
<p>If you hold rights in a work the catalog lists as public domain or openly licensed, write to <a href="mailto:hello@antarctic-labs.com">hello@antarctic-labs.com</a> with the work and the basis of the claim. The work is taken down while the claim is reviewed, and removed for good if the claim holds.</p>`,
};

PAGES["/tower-of-babel"] = {
  path: "/tower-of-babel",
  title: "Free Online Library | Tower of Babel",
  description:
    "A free, searchable online library: 2,557,923 books, sacred texts, declassified documents, papers, and transcripts preserved in clean, readable text.",
  body: `<h1>Tower of Babel</h1>
<p>Tower of Babel is a library and archival project from Antarctic Labs — 2,557,923 books, documents, transcripts, and texts in one organized, searchable collection. Individual resources appear here once finalized.</p>
<h2>What the library is</h2>
<p>The Tower of Babel preserves the written record of humanity and makes it free to read. Its holdings are public-domain and openly licensed works, gathered from the great open sources — Project Gutenberg, open scholarly journals, official legal publishers, and government declassification releases — verified against their sources, and preserved as clean, searchable plain text. A work enters the catalog only when its full text is in hand: the library publishes no metadata-only placeholders, and every record states its own rights status and license (see <a href="/rights-and-sources">Rights &amp; Sources</a>).</p>
<p>The library is curated, not just accumulated. Works are organised into seven collections and hundreds of hand-built reading collections and shelves; classification and repair passes run continuously, and land as dated entries in the curation stream below. Readers get a book-style reader with listening, highlights and citations in five styles; researchers get a public API and a standard OAI-PMH scholarly feed.</p>
<h2>The collections</h2>
<ul>
<li><a href="/tower-of-babel/collections/books">Books</a> — 81,631 works of classic literature, philosophy, and foundational documents</li>
<li>Sacred Texts — the scriptures and sacred writings of every tradition, shelved within <a href="/tower-of-babel/collections/books">Books</a></li>
<li><a href="/tower-of-babel/collections/papers">Papers</a> — 1,130,210 scientific and scholarly papers</li>
<li><a href="/tower-of-babel/collections/declassified">Declassified</a> — 26,294 government documents released into the public record</li>
<li><a href="/tower-of-babel/collections/law">Law</a> — 1,277,197 statutes, codes, and legal texts</li>
<li><a href="/tower-of-babel/collections/reference">Reference</a> — 41,137 encyclopedias, dictionaries, and reference works</li>
<li><a href="/tower-of-babel/collections/documents">Documents</a> — 363 foundational and historical documents</li>
<li><a href="/tower-of-babel/collections/podcasts">Podcasts</a> — 1,091 long-form conversation transcripts</li>
</ul>
<p><a href="/tower-of-babel/collections">All collections</a></p>
<p><a href="/tower-of-babel/library">Browse the library</a> · <a href="/tower-of-babel/library/suggest">Suggest an entry</a> · <a href="/tower-of-babel/api">API for agents</a> · <a href="/tower-of-babel/donate">Support the Tower</a></p>
${curationStreamHtml(esc)}
${PREFERRED_SOURCE_LINE}`,
};

PAGES["/tower-of-babel/library"] = {
  path: "/tower-of-babel/library",
  title: "Free Classic Books Online | Tower of Babel Library",
  description:
    "Read free classic books online: search 2,557,923 books, documents, and texts in the Tower of Babel's free library catalog. No sign-up.",
  body: `<h1>The Library</h1>
<p>The catalog of collected books, documents, research, references, and other material. Individual resources appear here once finalized.</p>
<p>The catalog holds 2,557,923 works and grows daily: books of classic literature, philosophy, and the sacred texts of every religion and tradition; declassified government documents released to the public; scientific papers; reference works; foundational political documents; and long-form podcast transcripts. Every work is preserved as clean, searchable plain text where the text is present, and every record carries its own rights status and license.</p>
<h2>Start reading</h2>
<ul>
<li><a href="/tower-of-babel/library/shakespeare-hamlet-1603">Hamlet — William Shakespeare</a></li>
<li><a href="/tower-of-babel/library/holy-bible-king-james-version">The Holy Bible — King James Version</a></li>
<li><a href="/tower-of-babel/library/darwin-origin-of-species-1st-ed-1859">On the Origin of Species — Charles Darwin</a></li>
</ul>
<p><a href="/tower-of-babel/library/suggest">Suggest an entry</a> · <a href="/tower-of-babel/library/research">API access and keys</a></p>`,
};

PAGES["/tower-of-babel/api"] = {
  path: "/tower-of-babel/api",
  title: "Free Books API for AI Agents | Tower of Babel",
  faq: API_FAQS,
  description:
    "Free books API for AI agents: machine-readable catalog of 2,557,923 works (books, sacred texts, declassified documents, papers, transcripts) with plain-text .txt downloads where text is present. No key, no sign-up.",
  body: `<h1>Free books API for AI agents</h1>
<p>A free books API that gives AI agents machine-readable access to 2,557,923 public works: books, the sacred texts of every tradition, declassified documents, scientific papers, reference works, and transcripts. A machine-readable catalog, predictable text URLs, no key, no sign-up. Fetch the catalog, filter the records, pull the full text of whichever works have text available, confirmed with a plain HTTP request.</p>
<p>The Tower of Babel API is a static, keyless data surface: a JSON catalog of every holding plus direct plain-text downloads at predictable URLs. It is not a query service. There is no search endpoint, no authentication, and no published rate limit. An agent downloads the catalog once, filters it locally by title, collection, creator, or rights status, then fetches only the texts it needs. The full text is served where present, not just metadata, which is what separates it from metadata-only book APIs.</p>
<h2>What you get</h2>
<p>Two things. First, the catalog: a complete JSON record for every holding — title, creator, year, collection, description, source, rights status, license, and the download URL where text is present — served merged at /catalog.json and in shards under /catalog-shards/ for incremental fetching, with a lightweight index at /catalog-index.json for fast listing. Second, the texts themselves: clean UTF-8 .txt files served from predictable URLs under /tower-of-babel/. Together they form a complete static API. Download the catalog, filter it, fetch texts. No key to request, no account to create, no usage tier to watch. No uptime SLA is offered; it is free infrastructure, maintained as a public resource.</p>
<h2>Catalog record schema</h2>
<p>Every record carries the same fields. artifact_id is the identifier, used in the text URL and in the work's library page at /tower-of-babel/library/&lt;artifact_id&gt;. title, creator, and year identify the work. collection names the part of the library it belongs to — books, sacred texts, declassified documents, papers, reference, documents, or podcasts. description is a short summary. source names where the text came from, and source_url links to the origin when one exists. rights_status and license state the usage rights per record; most readable works are public domain. download_status is AVAILABLE or unavailable, and download_url gives the text path, following the pattern /tower-of-babel/&lt;artifact_id&gt;.txt. format is TXT and file_size reports the text size. Important: download_status is not perfectly current, so agents should treat download_url as a candidate and confirm with an HTTP request: a 200 response means the text is there. The site itself only renders access buttons for records whose files exist, so a 200 on download_url is the reliable signal.</p>
<h2>How an agent uses it</h2>
<p>The fetch pattern is three steps. One: GET https://antarctic-labs.com/catalog.json (or the shards under /catalog-shards/) and parse the records. Two: filter locally. Find works by title substring, collection, creator, year range, or rights_status. There is no server-side search, so filtering happens in the agent's own code after the download. Three: GET the download_url for each selected record and read the plain text. For retrieval-augmented generation, the practical setup is to ingest the catalog once, embed or index the texts the agent needs, and re-fetch the catalog on a schedule to pick up new holdings — the library grows daily. Because text URLs are addressed by artifact_id, a URL that returns 200 keeps returning the same text, so cached texts stay valid. Agents should handle non-200 responses gracefully rather than assuming every catalogued work has a downloadable file.</p>
<h2>Corpus composition</h2>
<p>The catalog holds 2,557,923 works. The book collection covers classic literature, philosophy, and foundational political documents: the public domain canon, preserved as clean text. The sacred collection holds the scriptures and sacred writings of every religion and tradition, without favoritism. Declassified holds government documents released into the public record. Papers and reference hold scientific papers and reference works at scale, and podcasts holds long-form conversation transcripts, useful as contemporary spoken-language corpora. The mix is the point: most free book APIs serve fiction and poetry metadata. This corpus adds primary-source government documents, the world's sacred texts, and a large research literature, in full text, in one schema, at one base URL.</p>
<h2>Licensing and limits</h2>
<p>Rights are per record, not per site. Each catalog entry carries rights_status and license fields; the readable collection centers on public domain works and documents released to the public. Agents building datasets or products on the corpus should read those two fields on every record they use rather than assuming uniform rights. The static catalog surface described above needs no API key, no authentication, and has no published rate limit. Alongside it, a keyed API (v1, below) is rolling out for server-side search, full-text delivery, and bulk snapshots at published daily limits — the key is free at the first tier and the static surface stays keyless either way. The catalog is a snapshot that grows as holdings are added, so agents should re-fetch it periodically instead of treating a local copy as permanent. No uptime SLA is offered. It is free infrastructure, maintained as a public resource.</p>
<h2>Harvest with OAI-PMH</h2>
<p>Libraries and harvesters can take the catalog through the OAI-PMH 2.0 endpoint at https://antarctic-labs.com/oai — it supports the standard verbs: Identify, ListMetadataFormats, ListSets, ListIdentifiers, ListRecords, and GetRecord, with metadata in oai_dc (Dublin Core). Sets are the catalog's collections, and identifiers take the form oai:antarctic-labs.com:&lt;artifact_id&gt;.</p>
<h2>API v1 — keys, search, and full text</h2>
<p>API v1 is the keyed companion to the static surface above, at https://antarctic-labs.com/api/v1. It exists for one reason: convenience at scale — server-side search, full-text delivery, and bulk snapshot packages, at published daily limits, with a commercial-use licence on the paid tiers. The texts themselves stay free on this site either way; a key buys the maintained pipe, the throughput, and someone standing behind it, never access. Daily limits: free key 50 requests/day, Pro 500, Commercial unlimited. Keys are delivered by email and shown only there; only a hash of each key is stored. See <a href="/tower-of-babel/library/research">API access</a> for the tiers and to request a free key. No uptime SLA is offered on any tier.</p>
${faqSection(API_FAQS)}
${PREFERRED_SOURCE_LINE}`,
};

PAGES["/tower-of-babel/library/research"] = {
  path: "/tower-of-babel/library/research",
  title: "API Access | Tower of Babel",
  description:
    "Get a Tower of Babel API key: a free key by email, paid tiers above it — server-side search, full-text delivery, and bulk snapshots of the library.",
  body: `<h1>API access</h1>
<p>Get a Tower of Babel API key: a free key by email, paid tiers above it — server-side search, full-text delivery, and bulk snapshots of the library of 2,557,923 works. The texts themselves stay free on this site either way; a key buys the maintained pipe, the throughput, and someone standing behind it, never access.</p>
<h2>Tiers</h2>
<h3>Keyless catalog — Free</h3>
<p>No published limit. The static surface documented on the <a href="/tower-of-babel/api">API page</a>: the full catalog JSON, shards, and predictable .txt URLs. No key, no sign-up. Unchanged — this is the discovery layer and it stays open.</p>
<h3>Free key — Free</h3>
<p>50 requests/day. A key by email for API v1: catalog search and metadata for your own projects. Non-commercial use. The key is shown only in the email that delivers it.</p>
<p>Enter your email on this page in the app and a free key is sent to it — shown only in that email, stored here only as a hash. Asking for a new key revokes the previous free key for that address.</p>
<h3>Pro — $19/mo ($190/yr)</h3>
<p>500 requests/day. API v1 with full-text delivery and a commercial-use licence for a single project — the maintained pipe, not the scrape.</p>
<h3>Commercial — $149/mo ($1,490/yr)</h3>
<p>Unlimited requests/day. Everything in Pro at commercial scale: bulk snapshot packages and a licence covering multiple projects.</p>
<p>Billing is managed through Stripe — the receipt for any payment includes a manage-billing link. Refunds: cancel within 7 days of a charge and that charge is refunded in full — email us from the address on the subscription and we will process it; the API key stays active until the end of the paid period unless you ask us to revoke it sooner.</p>
${PREFERRED_SOURCE_LINE}`,
};

PAGES["/tower-of-babel/library/suggest"] = {
  path: "/tower-of-babel/library/suggest",
  title: "Suggest a Book for the Free Online Library | Tower of Babel",
  description:
    "Suggest a book, document, or text for the Tower of Babel free online library. Every suggestion is reviewed; accepted works are preserved in clean text.",
  body: `<h1>Suggest an entry</h1>
<p>Know something that belongs in the Tower? Send it our way — a title and a type are all it takes. Every suggestion gets reviewed for the catalog.</p>
<p>The form asks for: the type of media (books, declassified, law, documents, papers, podcasts, or reference), the title of the work, whether it is a single work, part of a series, or has multiple editions, the author or creator if known, the date published if known, where to find it, and anything else that explains why it belongs in the Tower.</p>
<p>Suggestions are reviewed against the library's rules: the work must be public domain or openly licensed, and a clean full text must be obtainable — a catalog entry is only published once its text is hosted. Accepted works are preserved in clean, searchable text and join the catalog of 2,557,923 works.</p>
<p><a href="/tower-of-babel/library">Back to the library</a></p>`,
};

PAGES["/tower-of-babel/donate"] = {
  path: "/tower-of-babel/donate",
  title: "Donate to the Free Online Library | Tower of Babel",
  description:
    "Support the Tower of Babel free online library: one-time or monthly contributions keep 2,557,923 books and texts free for everyone — no paywalls.",
  body: `<h1>A Message From the Team Behind the Tower of Babel</h1>
<p>The Tower is free to read, forever. It stays that way because readers who can afford to help, do.</p>
<p>Dear Tower of Babel Patron,</p>
<p>The Tower of Babel, a project of Antarctic Labs, preserves the written record of humankind and makes essential texts from every culture, religion, and era free to everyone, everywhere. It already holds 2,557,923 works — books, sacred texts, declassified documents, papers, and transcripts — and grows every day.</p>
<p>The goal is simple to say and enormous to do: every work that matters, within everyone's reach. It takes servers, storage, bandwidth, years of steady preservation work — and readers like you.</p>
<p>The Tower is free to read, and reader support is what keeps it that way.</p>
<p>If you enjoy wandering our virtual stacks, please consider supporting the Tower today. Most readers never give, so every one-time or monthly contribution carries real weight.</p>
<p>Thank you for reading with us.</p>
<p>Joshua Almodovar<br />Founder, Antarctic Labs</p>
<p>One-time or monthly contributions of $5, $10, $25, $50, $100, $500, $1,000, or a custom amount are accepted through Stripe; Bitcoin and Ethereum options are shown on this page in the app.</p>
<p>You'll receive an email receipt for your records. One honest note: Antarctic Labs is not a registered charity, so contributions are not tax-deductible. Every dollar goes directly to the servers, storage, and preservation work that keep the library online and growing.</p>
<p>No advertising is shown on this page.</p>`,
};

// Full HTML document for a main route, or null when the path is not a
// server-rendered main route.
export function staticPageFor(path) {
  const page = PAGES[path];
  return page ? doc(page) : null;
}

// Content-bearing 404 for paths that match nothing — a real error page
// with real navigation, never an empty screen, and no ad code.
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function notFoundPage(path) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Page Not Found | ANTARCTIC LABS</title>
<meta name="robots" content="noindex, follow" />
<style>
body { font-family: Georgia, "Times New Roman", serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; line-height: 1.65; color: #191919; }
nav a, footer a { color: #0f5d75; }
</style>
</head>
<body>
${NAV}
<main>
<h1>Page not found</h1>
<p>The page at ${SITE}${esc(path)} does not exist. It may have been moved, or the address may be mistyped.</p>
<p>From here you can go to the <a href="/">Antarctic Labs home page</a>, browse the <a href="/tower-of-babel/library">Tower of Babel library</a> of 2,557,923 free works, read <a href="/about">about the firm</a>, or email <a href="mailto:hello@antarctic-labs.com">hello@antarctic-labs.com</a> if you were expecting something here.</p>
</main>
${FOOT}
</body>
</html>
`;
}
