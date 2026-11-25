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

// Footer self-link rule (Joshua 2026-11-20): the footer never links to
// the page you are already on. On the four trust pages the static footer
// omits the current page's own trust link and keeps the other three;
// every other page keeps the full FOOT above, unchanged. (The 404 page
// uses FOOT directly: its path is never one of the four.)
const TRUST_PATHS = ["/contact", "/privacy", "/terms", "/rights-and-sources"];
const TRUST_LABELS = {
  "/contact": "Contact",
  "/privacy": "Privacy Policy",
  "/terms": "Terms",
  "/rights-and-sources": "Rights &amp; Sources",
};
function footFor(path) {
  if (!TRUST_PATHS.includes(path)) return FOOT;
  const anchor = `<a href="${path}">${TRUST_LABELS[path]}</a>`;
  return FOOT.replace(` · ${anchor}`, "").replace(`${anchor} · `, "");
}

// FAQ JSON-LD parity (2026-11-11 discoverability fix): the app's API
// page emits a FAQPage node (src/seo.js faqsForPath) and renders the
// questions visibly, but this static render historically carried no
// FAQPage node at all — and did not even carry the questions. The Q&A
// below is copied VERBATIM from src/content/tower-api.js (apiPage.faqs);
// keep the copy in sync when the source changes.
// (The library page's QUESTIONS section was removed 2026-11-12 on
// Joshua's order — that Q&A lives on the Privacy Policy page now — so
// the library static render carries no FAQ and no FAQPage node.)
// Homepage FAQ added 2026-11-24 (homepage explanation revamp): the
// app homepage renders the 57-question reader FAQ (homeFaqs in
// src/content/faq.js) and emits its FAQPage node, so this static
// homepage carries HOME_FAQS below, copied verbatim from the same
// source — keep in sync.
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

// Homepage FAQ (2026-11-24 homepage explanation revamp): copied
// VERBATIM from src/content/faq.js (homeFaqs) — the 57 reader
// questions the app homepage renders in its dropdown and emits as
// FAQPage JSON-LD. Keep in sync with that source.
const HOME_FAQS = [
  {
    q: "What is the Tower of Babel?",
    a: "The Tower of Babel is a free online library. It holds 2,557,924 works — books, research papers, laws, reference works, declassified government documents, and long-form conversations kept as transcripts — each one in full text that you can read, search, and download on this site. It is run by Antarctic Labs, and it exists to keep the world's important texts safe and open to anyone, anywhere.",
  },
  {
    q: "What can I do here?",
    a: "Read any work in the library right in your browser, search the full text to find the passage you need, listen to works read aloud, or download a copy to keep. You can browse by collection, by subject, and by era, follow reading collections gathered for particular readers, and see a featured work every day in Text of the Day. Everything is free, and none of it needs an account.",
  },
  {
    q: "What is Antarctic Labs, and how does it relate to the Tower?",
    a: "Antarctic Labs is the small independent lab that built the Tower of Babel and keeps it running. The library is its work: the lab gathers the texts, checks them, shelves them, and maintains this site. When you use the library, Antarctic Labs is who runs it.",
  },
  {
    q: "Is this a data broker?",
    a: "No. A data broker collects information about people and sells it. This is a library: it holds published texts — books, papers, laws, and documents that are free to share — and gives them away to readers. Nothing is sold here, and no data about readers is sold to anyone. The library is free to read because that is what it is for.",
  },
  {
    q: "Is this a real library if there are no physical books?",
    a: "There are no shelves and no building to visit — everything here is digital. What makes it a library is what it does: it collects works, checks them, organises them into collections, keeps them permanently, and lends them to anyone who asks — except here, reading a work never takes it away from anyone else, and nothing is ever due back.",
  },
  {
    q: "How is this different from Project Gutenberg?",
    a: "Project Gutenberg is a respected source for classic books, and the Tower covers much of the same public-domain ground. The difference is scope. Alongside the classics, the Tower holds the law of many countries, more than a million research papers, declassified government documents, reference works, and transcripts — 2,557,924 works in all — in one library you can search across at once.",
  },
  {
    q: "How is this different from the Internet Archive?",
    a: "The Internet Archive preserves everything — web pages, software, audio, video, and scanned books, many of them lent one reader at a time under its borrowing rules. The Tower is narrower and deeper in one direction: written works, held as clean, searchable full text you read here in full — no borrowing, no waiting, no copies checked out.",
  },
  {
    q: "Is it really free?",
    a: "Yes. Reading, searching, listening, and downloading are all free. There is no paywall, no trial period, and no premium tier for readers. The only paid plans anywhere on the site belong to the developer API, for heavy programmatic use — they are never required to read the library.",
  },
  {
    q: "Do I need an account or sign-up?",
    a: "No. There is no account to create and nothing to sign. Open a work and start reading. An email address is only ever asked for if you choose to request an API key or send a message — never to read.",
  },
  {
    q: "Is there a catch — ads, tracking, a paywall later?",
    a: "There is no catch for readers. The library is free because keeping these texts open is the point of it, not a promotion for something else. Reading will stay free, no account will be required to read, and data about readers is not sold. Paid API plans for developers are the only charges on the site, and they do not affect reading.",
  },
  {
    q: "Why is it free, and how is the library kept running?",
    a: "The texts themselves are free to share — public-domain works and openly published research — so the library's costs are the keeping of it: servers, storage, and the work of gathering and checking texts. Antarctic Labs carries those costs, and readers who can afford to help can contribute on the support page. Free is not a temporary offer; a library that charged for these texts would be working against its own purpose.",
  },
  {
    q: "Can I support the library? Is support tax-deductible?",
    a: "Yes — one-time and monthly contributions are accepted on the support page, and they go to the servers, storage, and preservation work that keep the library online. One honest note: Antarctic Labs is not a registered charity, so contributions are not tax-deductible.",
  },
  {
    q: "What is actually in the catalog, and how much is there?",
    a: "The catalog holds 2,557,924 works across seven collections: Law 1,277,197; Papers 1,130,210; Books 81,631; Reference 41,138; Declassified 26,294; Podcasts 1,091; and Documents 363. Every record names its title, creator, year, and collection, and where a work's text is present it can be read and downloaded on this site.",
  },
  {
    q: "What are the seven collections?",
    a: "Law — statutes, court decisions, and legal texts from around the world. Papers — research papers across every field of study. Books — whole books worth keeping: the classics, histories, philosophy, and foundational works. Reference — encyclopedias, dictionaries, and handbooks. Declassified — government documents once kept secret, now released. Podcasts — long-form conversations kept as written transcripts. Documents — standalone records and primary documents that belong to no single collection.",
  },
  {
    q: "What are the curated collections (For Law Students, For Med Students…)?",
    a: "Reading collections gathered by hand from across the seven collections, built for particular readers. For Law Students gathers what a law student actually reads; For Med Students does the same for medicine; others cover engineering, mathematics and the sciences, and more. They are shelves, not separate holdings — every work in them also lives in its home collection.",
  },
  {
    q: "Is there fiction and classic literature, or only study and reference material?",
    a: "Both kinds are here, but the library's weight is on useful texts. The Books collection holds classic literature, histories, and philosophy — including the classic novels — while the library as a whole is built around works people study and work from: law, research, reference. It is a working library first, not a leisure reading room.",
  },
  {
    q: "Why don't you have a modern book I am looking for?",
    a: "Because of copyright. The library holds works that are free to share — public-domain works whose copyright has expired, and works their authors or publishers have released openly. A recent book by a living author is almost never free to share, so it cannot be shelved here, however much it belongs in a library. When a work's copyright expires or it is released openly, it becomes eligible.",
  },
  {
    q: "Why is there more on some topics and languages than others?",
    a: "Because the library is built from what the world's open sources actually hold. Some fields publish openly and some do not; some countries release their law and some do not; older texts survive unevenly. The gaps in the library are mostly the gaps in what is free to share. Works are added as sources allow, and suggestions for missing works are welcome.",
  },
  {
    q: "What languages are the texts in?",
    a: "Mostly English, and far from only English. The law collection alone spans many countries, sacred texts and classics appear in their original languages and in translation, and research arrives in the languages it was published in. Texts are kept in the language they were gathered in.",
  },
  {
    q: "What time periods does the library cover?",
    a: "Centuries, in most collections: the Books, Papers, and Reference collections run from ancient texts to this year, and you can browse by era. One exception to know: the Law collection covers 1994 to today — the years for which the world's legal texts are openly published in usable form.",
  },
  {
    q: "Are the research papers peer-reviewed?",
    a: "Some are and some are not, and the library does not pretend otherwise. Papers come from open scholarly sources: journals that peer-review, and preprint servers that do not. The record for each paper names where it came from, so you can judge its standing the way you would anywhere else. The library preserves and presents research; it does not review it.",
  },
  {
    q: "What is Text of the Day?",
    a: "One work from the library, featured every day on the Text of the Day page — a way to meet something you would not have gone looking for. You can also follow it by RSS or Atom feed, so the day's pick arrives in your reader.",
  },
  {
    q: "Is anything here unique, or is it all copies from arXiv, Gutenberg, and the Internet Archive?",
    a: "Many works here also exist at their original sources — that is where openly published texts live, and gathering them is the point. What the Tower adds is the gathering itself: one library, in clean text you can search across all of it at once, organised into collections — including the law of many countries at this scale, the declassified documents, and the podcast transcripts — that exist in this combined form nowhere else. Some works are also held here in fuller or cleaner text than the scattered copies elsewhere. A copy kept in one more place is also, plainly, a work less likely to be lost.",
  },
  {
    q: "Where do the texts come from?",
    a: "From public sources where they are free to share: public-domain collections, open scholarly repositories, government releases, and openly licensed publications. Each work is gathered from the source that publishes it, checked against that source, and shelved with its rights status recorded on its record.",
  },
  {
    q: "Who runs the Tower of Babel?",
    a: "Antarctic Labs, a small independent lab. It is not part of a university, a government, or a large company. The lab built the library, gathers and checks its texts, and maintains this site — and it answers for all of it at the contact address below.",
  },
  {
    q: "How are works chosen for the library?",
    a: "By a simple test: is it a work worth keeping, and is it free to share? The library favours works of lasting use — the law, research, the foundational books of each field, reference works, primary documents — over the merely popular. Rights come first: a work that is not public domain or openly licensed is not shelved, whatever its importance.",
  },
  {
    q: "Are the texts checked against their original sources?",
    a: "Yes. Each work is compared against the source it was gathered from before it is shelved, and the library runs continuing repair programs that re-check texts the way a reader meets them — fixing broken files, correcting mislabelled works, and removing works whose text cannot be obtained rather than leaving placeholders. If you find an error that slipped through, the report route below reaches the people who fix it.",
  },
  {
    q: "Is the text here the complete, unaltered work?",
    a: "That is the standard the library keeps to: the work itself, in full — not a summary, not an excerpt, and not a link sending you somewhere else. Texts are presented as clean, readable text; the words are the author's. Where a work survives only in part, its record says so rather than dressing a fragment as the whole.",
  },
  {
    q: "How often is the catalog updated?",
    a: "Continuously. New works are shelved as they are gathered and checked, collections are re-organised as they grow, and repair passes run alongside. The homepage's New in the Library stream records the dated additions and finished improvements.",
  },
  {
    q: "How do I start reading?",
    a: "Enter the library, and either search for the work you want or browse a collection until something catches. Open any work and it reads right here, in your browser — no account, no download required, nothing to install. If you do not know where to begin, Text of the Day is one good work, chosen daily.",
  },
  {
    q: "How do I search?",
    a: "From inside the library, the search box searches the full text of the works, not just their titles — so you can search for a phrase, a name, or an idea and go straight to the works that contain it. Results can be narrowed by collection, subject, and era.",
  },
  {
    q: "How do I browse by collection, subject, or era?",
    a: "The library is organised three ways at once. Collections divide it by kind of text — law, papers, books, and the rest. Inside them, subjects and shelves divide by topic, and eras divide by time, from the ancient world to this year. Selecting any of them loads that selection; selections you have opened stay open as you keep browsing, so you can build up the corner of the library you are working in.",
  },
  {
    q: "Can I download a work, or only read it in the browser?",
    a: "Both. Where a work's text is present, you can read it in the browser reader and download the same text as a plain text file to keep. Plain text is the library's standard format: the files are small, open on any device, and will still open in fifty years.",
  },
  {
    q: "Why does a work's page show its details but no full text?",
    a: "A record can be catalogued before its text is ready to shelve. Sometimes the text is still being prepared and checked; sometimes a work is known and worth recording, but a copy free to share has not been obtained. The record shows what is known about the work either way. Where text is present, the page says so and the work can be read and downloaded; the library does not dress a record up as a book it does not hold.",
  },
  {
    q: "Can I listen to works instead of reading them?",
    a: "Yes. Works in the reader can be read aloud — open a work and use the listening control to hear it. It is the same full text, spoken, for readers who prefer to listen or who read better by ear.",
  },
  {
    q: "Does it work on my phone? Is there an app?",
    a: "It works on your phone, in the browser — the library is built phone-first, and reading, searching, and listening all work there. There is no app to install; the site is the app. Anything with a modern browser, phone, tablet, or computer, can use it.",
  },
  {
    q: "Is the library accessible if I use a screen reader or have low vision?",
    a: "The library's texts are plain text in the browser, which is the most accessible form a book can take: screen readers can read every work, browser text size and zoom apply throughout, and the read-aloud feature speaks works directly. If some part of the site blocks you, contact us — accessibility faults are faults, and they get fixed.",
  },
  {
    q: "Can I follow new picks by RSS or feed?",
    a: "Yes. Text of the Day is published as an RSS feed and an Atom feed, so each day's featured work can arrive in your feed reader. The feeds are linked from the Text of the Day page and from this site's pages.",
  },
  {
    q: "I can't find a work I'm looking for — what can I do?",
    a: "Try searching a distinctive phrase from inside the work, not just its title, and check the collection it belongs to — law, papers, and books are shelved separately. If it still is not here, it may not be free to share yet, or it may simply not have been gathered. Either way, you can suggest it on the suggestion form; suggestions are reviewed, and accepted works are shelved.",
  },
  {
    q: "A page or download isn't working — what should I do?",
    a: "Try reloading the page first — an interrupted connection is the usual cause. If it keeps failing, note the work's title or link and report it through the contact page or by email. Broken pages and downloads are treated as defects in the library, not as your problem.",
  },
  {
    q: "Is it legal to read these works for free?",
    a: "Yes. The works here are public-domain or openly licensed, which is exactly why they can be hosted and read for free. Every record carries its own rights status, so the basis on which a work is in the library is stated on the work itself.",
  },
  {
    q: "Can I use a text in my own work, teaching, or publication?",
    a: "Usually yes. Public-domain works can be quoted, taught, and republished freely, and openly licensed works can be used on the terms of their licence. Check the rights status on the work's record — it states which basis applies to that work — and credit the work as you would any source.",
  },
  {
    q: "Can I use these texts commercially?",
    a: "For public-domain works, yes — public domain means anyone may use them, commercially or otherwise. For openly licensed works, it depends on the licence recorded on the work's record; some licences allow commercial use and some do not. The library states each work's status but gives no blanket grant beyond it, and no legal advice.",
  },
  {
    q: "Can I use these texts to train an AI?",
    a: "The same rule as any other use: it follows each work's rights. Most readable works here are public domain, which permits training use; openly licensed works follow their licences. Check the rights status on each record you use. The library also offers an API and a machine-readable catalog for programmatic access, described below.",
  },
  {
    q: "How do I check the rights status of a specific work?",
    a: "Every record carries its own rights status and licence, shown on the work's page and in its catalog record. That status — public domain, or the specific open licence — is the basis on which the work is shelved and the terms on which you can reuse it. The Rights & Sources page explains how rights are cleared across the library.",
  },
  {
    q: "Do I need to credit the source? How do I cite a work from here?",
    a: "For public-domain works, credit is not legally required — but cite as you would any source, because your readers will want the trail. The reader provides citations in five styles for any work, ready to paste into your own writing. For openly licensed works, follow the attribution terms of the licence on the record.",
  },
  {
    q: "I hold the rights to a work that appears here. What can I do?",
    a: "Contact us. Write to hello@antarctic-labs.com with the work and your claim, and it will be reviewed. The library shelves only works it believes are free to share; if a work is here in error, the correction and takedown process on the Rights & Sources page applies, and errors are put right.",
  },
  {
    q: "How do I suggest a work the library should add?",
    a: "Use the Suggest an Entry form on the library pages. Tell us the work — title, author, and where it can be found, if you know. Every suggestion is reviewed; a work is shelved when it fits the library and is free to share.",
  },
  {
    q: "How do I report an error in a text or a wrong record?",
    a: "Email hello@antarctic-labs.com with the work's title or link and what is wrong — a garbled passage, a wrong date, a mislabelled record. Error reports go into the library's repair work; fixing them is part of the keeping of the library, not a favour.",
  },
  {
    q: "How do I contact Antarctic Labs?",
    a: "By email at hello@antarctic-labs.com, or through the Contact page. The same address reaches the lab for library questions, corrections, rights questions, and everything else.",
  },
  {
    q: "Can I volunteer or help?",
    a: "There is no volunteer program to join, but help lands in three ways that genuinely matter: suggest works the library is missing, report errors you find in texts, and — if you can — support the library on the support page. Reading and sharing the library helps too; a preserved work nobody can find is only half kept.",
  },
  {
    q: "Is there an API? What are the limits?",
    a: "Yes. The catalog itself is open without a key, with no published limit. The keyed API offers more: a free key allows 50 requests a day, Pro allows 500 a day, and Commercial is unlimited. Full details, keys, and documentation are on the API page. Reading the library never requires any of this.",
  },
  {
    q: "Does the API give full text or just metadata?",
    a: "Full text, where present. The catalog record is metadata — title, creator, year, collection, rights. The work itself is served separately, as the complete text. That difference is deliberate: this is a library that holds books, not an index that points at them.",
  },
  {
    q: "Is there an MCP server for AI agents?",
    a: "Yes. An MCP server is live at /mcp with four read-only tools for searching and reading the catalog, and it needs no key. Agents can also work from the downloadable catalog file and fetch each work's text directly. The API page documents both routes.",
  },
  {
    q: "Can libraries and archives harvest the catalog (OAI-PMH)?",
    a: "Yes. The catalog is exposed through a standard OAI-PMH endpoint, with one set per collection, so libraries and archives can ingest the records the way they ingest any scholarly feed. A copy of the catalog is also deposited with Zenodo, described below.",
  },
  {
    q: "Can I download the whole catalog as data?",
    a: "Yes. The full catalog is downloadable as a data file from this site. A preserved copy is deposited at Zenodo (DOI 10.5281/zenodo.24486020), and the catalog is also published as a dataset on Hugging Face. Individual works are fetched by their own text links; the catalog file carries every record.",
  },
  {
    q: "Will Common Crawl or a search engine archive the whole site?",
    a: "No — and that is normal, not a defect. Crawlers sample the web rather than archiving any site entire: Common Crawl itself says it collects a randomly selected subset, and search engines index what they choose to visit. The library publishes full sitemaps so crawlers can find everything; what each one keeps is its own sampling decision.",
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
<link rel="alternate" type="application/rss+xml" title="Tower of Babel — From the Stacks" href="/feed.xml" />
<link rel="alternate" type="application/atom+xml" title="Tower of Babel — From the Stacks" href="/atom.xml" />
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
.home-faq-static > summary { font-size: 1.3rem; font-weight: 700; cursor: pointer; padding: .5rem 0; }
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
${footFor(path)}
</body>
</html>
`;
}

const PAGES = {
  "/": {
    path: "/",
    title: "Tower of Babel — A Free Online Library | ANTARCTIC LABS",
    description:
      "The Tower of Babel is a free online library of 2,557,924 works — books, papers, law, reference works, and declassified documents, kept in full text. Everything is free to read, with no account and no sign-up.",
    faq: HOME_FAQS,
    body: `<h1>A free library of the texts that matter</h1>
<p>The Tower of Babel is a free online library holding the world's important books, papers, laws, and documents — kept safe in full text and open to anyone, anywhere, to read free, with no account and no sign-up.</p>
<p><a href="/tower-of-babel">Enter the Library</a></p>
<p>Some of the most useful writing in the world is fragile — printed once, stored in one place, easy to lose. This library exists to keep it: the papers researchers work from, the laws that govern daily life, the books that shaped their fields, held in one place where anyone can read them. It is a working library, not a reading room for leisure — built for professionals and the students preparing to join them, for researchers and journalists, and for anyone, anywhere, who needs a text they can trust. And if the originals are ever lost, what is kept here remains.</p>
<p>What this page is, what is inside, and who keeps it.</p>
<h2>The library</h2>
<p>Everything in the library is here to be used. Read any work right in your browser, search the full text to find the passage you need, listen to works read aloud, or download a copy to keep. There is nothing to pay and nothing to sign — open a work and start reading.</p>
<p>The library is organised into seven collections, so you can go straight to the kind of text you need — the law of a country, the research in a field, a reference work to settle a question. Alongside them sit reading collections gathered by hand for particular readers, starting with students.</p>
<p><strong>Law — 1,277,197.</strong> Statutes, court decisions, and legal texts from around the world, from 1994 to today.</p>
<p><strong>Papers — 1,130,210.</strong> Research papers across every field of study, from medicine and physics to economics and history.</p>
<p><strong>Books — 81,631.</strong> Whole books worth keeping: the classics, histories, philosophy, and the foundational works of each field.</p>
<p><strong>Reference — 41,138.</strong> Encyclopedias, dictionaries, and handbooks — the works you open to settle a fact.</p>
<p><strong>Declassified — 26,294.</strong> Government documents once kept secret, now released and free for anyone to read.</p>
<p><strong>Podcasts — 1,091.</strong> Long-form conversations and interviews, kept as full written transcripts you can read and search.</p>
<p><strong>Documents — 363.</strong> Standalone records and primary documents that belong to no single collection.</p>
<p><strong>Reading collections, gathered by hand</strong> — shelves built for particular readers, including For Law Students and For Med Students, drawn from across the seven collections.</p>
${curationStreamHtml(esc)}
<h2>Who runs this library</h2>
<p>Antarctic Labs built it, and keeps it. The Tower of Babel is run by Antarctic Labs, a small independent lab. The texts come from public sources where they are free to share — public-domain works and openly published research — and each one is checked against its original before it is shelved here. What you read on this site is the work itself, in full: not a summary, and not a link sending you somewhere else.</p>
<p>Many of these texts exist scattered across the internet, a piece here and a piece there. Here they are gathered into one library, in clean text you can search across all of it at once — including collections, like the law and the declassified documents, that exist in this form nowhere else. One place, open to everyone, kept up to date.</p>
<p>For developers: the library can also be searched by computer programs through a public API.</p>
<details class="home-faq-static">
<summary>Questions, answered</summary>
${faqSection(HOME_FAQS)}
</details>`,
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
<p>Information you choose to give us: if you donate, Stripe collects your email address at checkout to create a checkout session and, if enabled in Stripe, to send a receipt. If you suggest a work for the library, you provide the title, creator, source link, and any notes you choose to add. Our hosting provider may process basic technical information needed to deliver pages securely, such as IP address and browser type, in its normal server logs.</p>
<p>API keys: if you request a Tower of Babel API key, we store the email address you give and a cryptographic hash of the key in a Cloudflare database, so the API can authenticate your requests and count your daily usage. Payments for API plans are processed by Stripe. The email that delivers your key is sent through Resend.</p>
<h2>Cookies and advertising</h2>
<p>We use Google AdSense to show advertising on the Tower of Babel library pages. Third-party vendors, including Google, use cookies to serve ads based on a user's prior visits to this website or other websites. Google's use of advertising cookies enables it and its partners to serve ads to users based on their visit to this site and other sites on the internet.</p>
<p>You may opt out of personalized advertising by visiting <a href="https://adssettings.google.com">Google Ads Settings</a> and <a href="https://www.aboutads.info">aboutads.info</a>. Other third-party vendors and ad networks may also serve ads on the library pages, and many of them can be opted out of on the same aboutads.info page. How Google uses information from sites and apps that use its services is explained on <a href="https://policies.google.com/technologies/partner-sites">Google's partner-sites page</a>. You can also set your browser to refuse cookies, though some site features may work less well without them. PostHog also uses cookies and local storage to keep its anonymous visitor identifier between visits.</p>
<h2>Service providers</h2>
<p>The site runs on a small set of service providers, each processing only what its job requires. Cloudflare hosts the site and holds the API-key database. PostHog provides the anonymous analytics described above. Stripe processes donations and API-plan payments; we never receive or store your card number. Resend delivers the email that carries a new API key. Google serves the advertising described above. We do not sell personal information, and we share it with no one else except as required by law.</p>
<h2>How information is used and shared</h2>
<p>Information is used to operate the site and the library, to understand which works readers use, to process donations, and to show advertising. It is shared only as described under Service Providers above. We do not publish or display information you provide through donation or suggestion forms.</p>
<h2>Data retention</h2>
<p>Anonymous analytics are never tied to a name or an email address, and are kept only in aggregate. If you hold an API key, we keep your email address and the cryptographic hash of the key for as long as the key is active; ask us to delete them and the record is removed and the key revoked. Donation records are kept for as long as accounting and legal obligations require. A work suggestion is kept with the catalog work it concerns.</p>
<h2>Security</h2>
<p>The site is served over HTTPS. API keys are stored only as cryptographic hashes. No system is perfectly secure, but the information here to protect is deliberately small: no accounts and no passwords.</p>
<h2>Your choices</h2>
<p>You can refuse or delete cookies in your browser at any time, and opt out of personalized advertising at the links above. If we hold personal information about you — in practice, the email address attached to an API key or a donation — you may ask what it is, ask for a copy, or ask for it to be deleted, through the <a href="/contact">Contact page</a>. Anonymous analytics identifiers cannot be looked up or deleted per person, because they are not tied to anyone's identity.</p>
<h2>Children</h2>
<p>The library is a general-audience collection of books and documents. The site is not directed at children under 13, and we do not knowingly collect personal information from children.</p>
<h2>Changes and contact</h2>
<p>This policy may be updated as the site changes; the date at the top of this page will change with it. Questions about this policy can be sent through the <a href="/contact">Contact page</a>.</p>`,
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
<p>The library is free to read. No account, sign-in, or personal information is needed to read, search, listen to, or download the works whose texts are hosted here — the <a href=\"/privacy\">Privacy Policy</a> covers what that means in practice. We work to keep the site available and correct, but availability is not guaranteed and no uptime commitment is made on any part of the site, free or paid.</p>
<h2>The texts and their rights</h2>
<p>The works in the library are public-domain or openly licensed texts. Rights are stated per work in each catalog record — <a href=\"/rights-and-sources\">Rights &amp; Sources</a> explains how they are decided and recorded. Antarctic Labs claims no new copyright in the texts themselves. The catalog data, the site's own writing (descriptions, introductions, collection essays), and the site software are the lab's own work; ask before republishing them wholesale.</p>
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
<p>These terms may be updated as the site changes; the date at the top will change with them. Questions: the <a href="/contact">Contact page</a>.</p>`,
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
<p>Errors survive any process at this scale, so corrections are a standing program, not an afterthought: the whole library has been through a reader's-eye legibility comb-through, and mislabelled, broken or wrongly attributed works are repaired or removed outright when found. To report one, use the <a href="/tower-of-babel/library/suggest">suggestion form</a> or the <a href="/contact">Contact page</a>, with the work's title or link and what is wrong; verified reports are corrected in the catalog and the record updated.</p>
<h2>Takedown</h2>
<p>If you hold rights in a work the catalog lists as public domain or openly licensed, write through the <a href="/contact">Contact page</a> with the work and the basis of the claim. The work is taken down while the claim is reviewed, and removed for good if the claim holds.</p>`,
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
