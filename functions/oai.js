// OAI-PMH 2.0 endpoint for the Tower of Babel catalog.
// Base URL: https://antarctic-labs.com/oai
//
// 2026-10-25 REWRITE (lane A2, discovery-100) — shard-paging alternative
// to lane A's precomputed-snapshot design. Lane A is correct but its
// oai-data snapshot (~216 MB per snapshot in the repo) is blocked for
// now: the repo's Pages clone step already failed once at 36 minutes,
// and adding 216 MB per snapshot would make clone failures worse.
// This file adds NO repo data at all: it serves ListRecords and
// ListIdentifiers straight from the existing catalog shards, one shard
// per request, with per-shard resumption tokens.
//
// 2026-11-16 EXTENSION (Step 5, CORE/OpenAIRE build — building only;
// registration is a separate decision): a second metadata format,
// oai_openaire (OpenAIRE Guidelines for Literature Repositories v4:
// DataCite kernel-4 + COAR vocabularies + oaire fields), joins oai_dc.
// oai_openaire records carry the aggregator provenance <about> block
// OpenAIRE requires of aggregators (originDescription built from each
// record's own source_url). Sets stay the catalog's collections, so an
// OpenAIRE registration can scope to set=papers (the aggregator shape)
// while the other collections remain exposable later with no rework.
//
// RIGHTS POLICY (2026-11-16 rights spot-audit; see the Step 5 ship
// report): the catalog's rights_status vocabulary is exactly
// PUBLIC_DOMAIN, CC_BY, CC0, EXTERNAL_SOURCE. The first three are
// rights-clear for redistribution and their records link their hosted
// full text (oai_dc dc:identifier + oai_openaire <file>). EXTERNAL_SOURCE
// — every PODCASTS record, license "YouTube Standard License", rights
// held by the original publishers — is NOT cleared: those records are
// served metadata-only (entry-page identifier, no full-text link) and
// oai_openaire marks them COAR restricted access with no license
// condition. The policy fails CLOSED: any future rights_status outside
// the cleared set is treated as not cleared.
//
// PER-SHARD TOKENS (v4): {v:4, i: shardIndex, o: offsetWithinShard,
// s: set|null, k: "records"|"identifiers", m: metadataPrefix,
// f: from|null, u: until|null, c: checksum}. The offset is WITHIN the
// current shard's filtered list (the full shard for the unfiltered
// list, the set-filtered list for a set list) — never a global offset,
// because a global offset cannot be honored without walking every
// earlier shard to count matches. Pages advance within a shard, then
// to the next shard. Page size is 100, as the old code used, so one
// shard yields many pages and sparse sets still progress. v4 adds the
// metadata prefix to the token: resumptionToken is an exclusive
// argument, so the format of a paged ListRecords must travel inside
// the token or follow-up pages could not render the requested format.
//
// PARTIAL PAGES (the key spec point): when a shard yields fewer than
// 100 matching records, the response returns that PARTIAL page together
// with a token to the next shard, instead of parsing a second shard in
// the same request to fill the page. This is spec-legal: OAI-PMH 2.0
// puts list size at the repository's discretion — a repository may
// return any number of records per response as long as an incomplete
// list carries a resumptionToken, and harvesters MUST follow the token
// rather than assume a page is complete. Returning a partial page with
// a token is the mechanism the spec provides for exactly this case.
// The same rule covers a shard with zero set matches: an empty page
// with a token to the next shard (the harvester advances; the cost is
// one cheap request per empty shard, bounded by the shard count).
// No list request ever parses more than ONE catalog shard. If any case
// below forced a second shard parse, that would be a design failure —
// none does; the only multi-parse path in this file is GetRecord's
// pre-existing manifest + single-shard path, which the crawler entry
// pages already prove daily.
//
// completeListSize and cursor are OMITTED from resumptionTokens, on
// purpose. Both are optional attributes in the spec, and neither can
// be computed honestly without a full catalog walk: the total for a
// set list is the sum of that set's matches across all shards, and
// a global cursor needs the same sum for every earlier shard. Emitting
// a guessed total would be worse than omitting an optional attribute;
// harvesters that need the end of the list use the empty token, which
// this implementation always emits at the true end.
//
// DATESTAMP POLICY (same as lane A): the catalog carries no per-entry
// dates, so every record's datestamp is the repository snapshot date
// (SNAPSHOT_DATE below, bumped in the same push as any catalog-shards
// refresh — see the push note at the bottom of this file). from/until
// are therefore evaluated against that single date, per shard, with
// no walk: a window excluding the snapshot date matches nothing
// (noRecordsMatch); any other window matches every record in the
// shard. Date filters are NEVER silently ignored: they are checked on
// the initial request and carried in the token and re-checked on
// every token page.
//
// Tokens v1 (old code, {o, s}), v2 (lane A, global offset) and v3
// (2026-10-25 shard paging, no format field) are rejected with
// badResumptionToken: their offsets/formats mean something different
// here, so honoring one would skip or repeat records or render the
// wrong format. Per the spec, a harvester receiving
// badResumptionToken restarts its harvest, which is the correct
// recovery. Tokens carry a checksum (FNV-1a over the canonical
// payload) so corrupted or hand-edited tokens are rejected instead
// of honored; this is tamper-EVIDENCE, not a signature — the code is
// in the repo, so no secret embedded here could stay secret, and
// none is claimed.
//
// Identify, ListSets, ListMetadataFormats, and GetRecord keep lane A's
// behavior, except Identify/GetRecord take their datestamp from the
// SNAPSHOT_DATE constant instead of lane A's meta.json (which does
// not exist in this design). Identify therefore never fetches
// anything and cannot fail on a data fetch, as before.
//
// Verbs: Identify, ListMetadataFormats, ListSets, ListIdentifiers,
// ListRecords, GetRecord. Metadata formats: oai_dc and oai_openaire.
// Identifiers: oai:antarctic-labs.com:<artifact_id>. Sets: the
// catalog's collections (setSpec = lowercase collection name, e.g.
// "books"; "papers" is the OpenAIRE aggregator registration set).
//
// Errors follow the spec: badVerb, badArgument, idDoesNotExist,
// cannotDisseminateFormat, badResumptionToken, noRecordsMatch.
// Descriptions are NOT exposed in oai_dc (same reason as lane A: the
// catalog's legacy description field is being rewritten library-wide;
// entry pages carry the current description). oai_openaire DOES carry
// dc:description from the record's own field, because the OpenAIRE
// profile rates Description mandatory-if-applicable and the field is
// populated library-wide; the same rewrite caveat applies to it.
// Rights status IS exposed in both formats, mapped per format: oai_dc
// gets a readable rights statement, oai_openaire gets the COAR access
// rights URI + license condition per the rights policy above.

import {
  SITE,
  getShardCount,
  getRecordById,
  getShardRecords,
  escapeXml,
  textFileUrl,
} from "./_lib/tower-catalog.js";

const BASE = `${SITE}/oai`;
const PAGE = 100; // modest, as the old code used; one shard yields many pages
// Shard-fetch budget for the list verbs (2026-11-19 fix). A list page
// reads one whole catalog shard: ~18.8 MB fetched from
// raw.githubusercontent and JSON.parsed inside fetchBounded's abort
// window. The shared 3 s bound was calibrated for the small JSON of
// the interactive crawler paths; on a cold or evicted edge cache the
// shard fetch+parse exceeds it intermittently, the fetch aborts, and
// the list verb reported that transient failure as noRecordsMatch —
// a false "no data" that gets repositories rejected (or harvested as
// empty) by CORE/BASE/OpenAlex validators. List verbs are batch
// harvester traffic, where a slow page is normal; give the fetch a
// budget sized to the payload. The interactive paths keep their 3 s
// bound unchanged (the timeout is threaded per-call in
// tower-catalog.js and defaults to the historical value).
const OAI_SHARD_TIMEOUT_MS = 25000;
// Snapshot date: the date of the catalog-shards snapshot this code
// reads. Bump it in the SAME push as any catalog-shards refresh (the
// same cadence lane A's meta.json and tower-hubs.js's
// CATALOG_SNAPSHOT_DATE already follow). Every record's datestamp is
// this date; from/until are evaluated against it.
const SNAPSHOT_DATE = "2026-11-16";
const COLLECTIONS = ["PAPERS", "DECLASSIFIED", "LAW", "BOOKS", "REFERENCE", "DOCUMENTS", "PODCASTS"];
const COLLECTION_LABELS = {
  PAPERS: "Papers",
  DECLASSIFIED: "Declassified documents",
  LAW: "US law",
  BOOKS: "Books",
  REFERENCE: "Reference",
  DOCUMENTS: "Documents",
  PODCASTS: "Podcast transcripts",
};

// --- metadata formats ---
const FORMATS = {
  oai_dc: {
    schema: "http://www.openarchives.org/OAI/2.0/oai_dc.xsd",
    namespace: "http://www.openarchives.org/OAI/2.0/oai_dc/",
  },
  oai_openaire: {
    schema: "https://www.openaire.eu/schema/repo-lit/4.0/openaire.xsd",
    namespace: "http://namespace.openaire.eu/schema/oaire/",
  },
};
const isFormat = (p) => Object.prototype.hasOwnProperty.call(FORMATS, p);

// --- rights policy (see the header note) ---
const RIGHTS_CLEARED = new Set(["PUBLIC_DOMAIN", "CC_BY", "CC0"]);
const rightsCleared = (record) => RIGHTS_CLEARED.has(record && record.rights_status);
const COAR_OPEN_ACCESS = "http://purl.org/coar/access_right/c_abf2";
const COAR_RESTRICTED_ACCESS = "http://purl.org/coar/access_right/c_16ec";
// Readable rights statement for oai_dc (the record's own license
// string when it carries one, else a label derived from the status).
function rightsLabel(record) {
  const lic = record && typeof record.license === "string" ? record.license.trim() : "";
  if (lic) return lic;
  switch (record && record.rights_status) {
    case "PUBLIC_DOMAIN": return "Public Domain";
    case "CC_BY": return "CC BY 4.0";
    case "CC0": return "CC0 1.0 Universal";
    case "EXTERNAL_SOURCE": return "External source — rights held by the original publisher";
    default: return String((record && record.rights_status) || "");
  }
}
// oai_openaire licenseCondition per cleared status (null when the
// status carries no licence we can name — never invent one).
function licenseCondition(record) {
  switch (record && record.rights_status) {
    case "PUBLIC_DOMAIN":
      return { uri: "https://creativecommons.org/publicdomain/mark/1.0/", label: "Public Domain Mark 1.0" };
    case "CC_BY":
      return { uri: "http://creativecommons.org/licenses/by/4.0/", label: "Creative Commons Attribution 4.0 International" };
    case "CC0":
      return { uri: "https://creativecommons.org/publicdomain/zero/1.0/", label: "CC0 1.0 Universal" };
    default:
      return null;
  }
}
// COAR resource type per collection (uri, label, resourceTypeGeneral).
// PAPERS splits on the record's source: arXiv records are preprints,
// the rest are research articles. Mappings for collections outside
// OpenAIRE's research scope exist so the format never breaks on them;
// registration scoping (set=papers) is what governs exposure.
function resourceType(record) {
  switch (record && record.collection) {
    case "PAPERS":
      return record.source === "arXiv"
        ? { uri: "http://purl.org/coar/resource_type/c_816b", label: "preprint", general: "literature" }
        : { uri: "http://purl.org/coar/resource_type/c_2df8fbb1", label: "research article", general: "literature" };
    case "BOOKS":
    case "REFERENCE":
      return { uri: "http://purl.org/coar/resource_type/c_2f33", label: "book", general: "literature" };
    case "DECLASSIFIED":
      return { uri: "http://purl.org/coar/resource_type/c_93fc", label: "report", general: "literature" };
    case "LAW":
    case "DOCUMENTS":
    case "PODCASTS":
      return { uri: "http://purl.org/coar/resource_type/c_18cf", label: "text", general: "literature" };
    default:
      return { uri: "http://purl.org/coar/resource_type/c_1843", label: "other", general: "other research product" };
  }
}
// Publication year as a YYYY string, or null when the record's year
// carries no usable 4-digit year (OpenAIRE date is then omitted —
// never fabricated).
function yearOf(record) {
  const y = record && record.year;
  if (y == null) return null;
  const m = String(y).trim().match(/^(\d{4})(?:\D|$)/);
  return m ? m[1] : null;
}

const xml = (s) => escapeXml(s == null ? "" : String(s));
const nowUtc = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

function envelope(requestAttrs, inner) {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd">`,
    `  <responseDate>${nowUtc()}</responseDate>`,
    `  <request${requestAttrs}>${BASE}</request>`,
    inner,
    `</OAI-PMH>`,
    ``,
  ].join("\n");
}

function errorResponse(code, message, requestAttrs = "") {
  return new Response(
    envelope(requestAttrs, `  <error code="${code}">${xml(message)}</error>`),
    { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

function okResponse(body) {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Transient upstream failure (the catalog shard could not be read).
// The OAI-PMH implementation guidelines' flow-control answer is an
// HTTP 503 with Retry-After: harvesters retry later. What this must
// NEVER be is a 200 carrying noRecordsMatch or idDoesNotExist — those
// assert facts about the data ("nothing matches", "no such record")
// that a fetch failure does not establish, and a harvester acting on
// them treats real records as absent.
function unavailableResponse(requestAttrs = "") {
  return new Response(
    envelope(
      requestAttrs,
      `  <error code="serviceUnavailable">The catalog is temporarily unavailable; please retry.</error>`
    ),
    {
      status: 503,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "300",
      },
    }
  );
}

// --- resumption tokens v4 (per-shard, format-aware) ---
// Canonical payload string for the checksum: fields in fixed order,
// nulls as empty strings. FNV-1a 32-bit, hex.
function checksumFor(st) {
  const s = ["v4", st.i, st.o, st.s || "", st.k, st.m || "", st.f || "", st.u || ""].join("|");
  let h = 0x811c9dc5;
  for (let j = 0; j < s.length; j++) {
    h ^= s.charCodeAt(j);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
function encodeToken(state) {
  const st = { v: 4, i: state.i, o: state.o, s: state.s || null, k: state.k, m: state.m || "oai_dc", f: state.f || null, u: state.u || null };
  st.c = checksumFor(st);
  return btoa(JSON.stringify(st)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeToken(token, shardCount) {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const obj = JSON.parse(atob(b64));
    if (obj.v !== 4) return null;
    if (!Number.isInteger(obj.i) || obj.i < 0 || obj.i >= shardCount) return null;
    if (!Number.isInteger(obj.o) || obj.o < 0) return null;
    if (obj.s !== null && (typeof obj.s !== "string" || !COLLECTIONS.some((c) => c.toLowerCase() === obj.s))) return null;
    if (obj.k !== "records" && obj.k !== "identifiers") return null;
    if (!isFormat(obj.m)) return null;
    if (obj.f !== null && (typeof obj.f !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(obj.f))) return null;
    if (obj.u !== null && (typeof obj.u !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(obj.u))) return null;
    if (obj.c !== checksumFor(obj)) return null;
    return { i: obj.i, o: obj.o, s: obj.s, k: obj.k, m: obj.m, f: obj.f, u: obj.u };
  } catch (e) {
    return null;
  }
}

function datePart(v) {
  if (!v) return null;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function headerXml(record, snapshotDate) {
  return [
    `    <header>`,
    `      <identifier>oai:antarctic-labs.com:${xml(record.artifact_id)}</identifier>`,
    `      <datestamp>${snapshotDate}</datestamp>`,
    `      <setSpec>${xml(String(record.collection || "").toLowerCase())}</setSpec>`,
    `    </header>`,
  ].join("\n");
}

function dcRecordXml(record, snapshotDate) {
  const entryUrl = `${SITE}/tower-of-babel/library/${record.artifact_id}`;
  const cleared = rightsCleared(record);
  const txt = cleared ? textFileUrl(record) : null;
  // CORE's harvesting guidelines: the FIRST dc:identifier is the
  // direct full-text URL, the landing page follows. Records whose
  // rights are not cleared carry the landing page only (metadata-only
  // per the rights policy).
  const ids = [];
  if (txt) ids.push(`      <dc:identifier>${xml(txt)}</dc:identifier>`);
  ids.push(`      <dc:identifier>${xml(entryUrl)}</dc:identifier>`);
  const lines = [
    `    <record>`,
    headerXml(record, snapshotDate),
    `    <metadata>`,
    `      <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/ http://www.openarchives.org/OAI/2.0/oai_dc.xsd">`,
    `      <dc:title>${xml(record.title || record.artifact_id)}</dc:title>`,
  ];
  if (record.creator) lines.push(`      <dc:creator>${xml(record.creator)}</dc:creator>`);
  if (record.year != null && String(record.year).trim() !== "")
    lines.push(`      <dc:date>${xml(record.year)}</dc:date>`);
  lines.push(...ids);
  if (record.format) lines.push(`      <dc:type>${xml(record.format)}</dc:type>`);
  if (record.collection)
    lines.push(`      <dc:relation>Tower of Babel collection: ${xml(record.collection)}</dc:relation>`);
  if (record.source_url && /^https?:\/\//i.test(record.source_url))
    lines.push(`      <dc:source>${xml(record.source_url)}</dc:source>`);
  const rights = rightsLabel(record);
  if (rights) lines.push(`      <dc:rights>${xml(rights)}</dc:rights>`);
  lines.push(`      </oai_dc:dc>`, `    </metadata>`, `    </record>`);
  return lines.join("\n");
}

// OpenAIRE v4 (oai_openaire) rendering of one record, following the
// element order of the guidelines' own sample record. Fields the
// catalog cannot supply honestly are omitted, never invented: no
// dc:language (the catalog carries no language data), no dc:publisher
// (the catalog's source is a repository, not a publisher), no funding
// (none exists), no subjects (the catalog's tags are pipeline
// artifacts, not subject headings).
function openaireRecordXml(record, snapshotDate) {
  const entryUrl = `${SITE}/tower-of-babel/library/${record.artifact_id}`;
  const cleared = rightsCleared(record);
  const txt = cleared ? textFileUrl(record) : null;
  const accessUri = cleared ? COAR_OPEN_ACCESS : COAR_RESTRICTED_ACCESS;
  const accessLabel = cleared ? "open access" : "restricted access";
  const rt = resourceType(record);
  const year = yearOf(record);
  const lines = [
    `    <record>`,
    headerXml(record, snapshotDate),
    `    <metadata>`,
    `      <resource xmlns="http://namespace.openaire.eu/schema/oaire/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:datacite="http://datacite.org/schema/kernel-4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://namespace.openaire.eu/schema/oaire/ https://www.openaire.eu/schema/repo-lit/4.0/openaire.xsd">`,
  ];
  if (record.creator && String(record.creator).trim() !== "") {
    lines.push(
      `        <datacite:creators>`,
      `          <datacite:creator>`,
      `            <datacite:creatorName>${xml(record.creator)}</datacite:creatorName>`,
      `          </datacite:creator>`,
      `        </datacite:creators>`
    );
  }
  lines.push(
    `        <datacite:titles>`,
    `          <datacite:title>${xml(record.title || record.artifact_id)}</datacite:title>`,
    `        </datacite:titles>`
  );
  if (year) {
    lines.push(
      `        <datacite:dates>`,
      `          <datacite:date dateType="Issued">${year}</datacite:date>`,
      `        </datacite:dates>`
    );
  }
  const desc = typeof record.description === "string" ? record.description.trim() : "";
  if (desc && desc.length <= 8000) lines.push(`        <dc:description>${xml(desc)}</dc:description>`);
  lines.push(
    `        <resourceType resourceTypeGeneral="${rt.general}" uri="${rt.uri}">${rt.label}</resourceType>`,
    `        <datacite:identifier identifierType="URL">${xml(entryUrl)}</datacite:identifier>`
  );
  if (record.source_url && /^https?:\/\//i.test(record.source_url))
    lines.push(`        <dc:source>${xml(record.source_url)}</dc:source>`);
  lines.push(`        <datacite:rights rightsURI="${accessUri}">${accessLabel}</datacite:rights>`);
  const lic = cleared ? licenseCondition(record) : null;
  if (lic) lines.push(`        <licenseCondition uri="${lic.uri}">${lic.label}</licenseCondition>`);
  if (txt)
    lines.push(`        <file accessRightsURI="${accessUri}" mimeType="text/plain" objectType="fulltext">${xml(txt)}</file>`);
  lines.push(`      </resource>`, `    </metadata>`);
  // Aggregator provenance (OpenAIRE Guidelines v4, aggregator path):
  // where this record's metadata originally came from. altered="true"
  // is the honest value — the catalog normalizes and cleans harvested
  // metadata (titles, rights vocabulary) rather than republishing it
  // byte-for-byte.
  if (record.source_url && /^https?:\/\//i.test(record.source_url)) {
    let origin = "";
    try { origin = new URL(record.source_url).origin; } catch (e) { origin = ""; }
    if (origin) {
      lines.push(
        `    <about>`,
        `      <provenance xmlns="http://www.openarchives.org/OAI/2.0/provenance" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/provenance http://www.openarchives.org/OAI/2.0/provenance.xsd">`,
        `        <originDescription harvestDate="${snapshotDate}T00:00:00Z" altered="true">`,
        `          <baseURL>${xml(origin)}</baseURL>`,
        `          <identifier>${xml(record.source_url)}</identifier>`,
        `          <datestamp>${snapshotDate}</datestamp>`,
        `          <metadataNamespace>http://www.openarchives.org/OAI/2.0/oai_dc/</metadataNamespace>`,
        `        </originDescription>`,
        `      </provenance>`,
        `    </about>`
      );
    }
  }
  lines.push(`    </record>`);
  return lines.join("\n");
}

function recordXml(record, snapshotDate, format) {
  return format === "oai_openaire"
    ? openaireRecordXml(record, snapshotDate)
    : dcRecordXml(record, snapshotDate);
}

// Window check shared by initial and token pages: all records carry
// SNAPSHOT_DATE, so a window excluding it matches nothing.
function windowExcludes(from, until) {
  return (from && from > SNAPSHOT_DATE) || (until && until < SNAPSHOT_DATE);
}

async function listResponse(params, verbAttrs, withMetadata) {
  const kind = withMetadata ? "records" : "identifiers";
  const tag = withMetadata ? "ListRecords" : "ListIdentifiers";
  const shardCount = await getShardCount();

  const tokenRaw = params.get("resumptionToken");
  let shardIdx = 0;
  let offset = 0;
  let setSpec = null;
  let format = "oai_dc";
  let from = null;
  let until = null;
  if (tokenRaw) {
    // resumptionToken is exclusive: no other arguments allowed.
    if ([...params.keys()].some((k) => k !== "verb" && k !== "resumptionToken"))
      return errorResponse("badArgument", "resumptionToken must be the only argument besides verb.", verbAttrs);
    const state = decodeToken(tokenRaw, shardCount);
    if (!state || state.k !== kind) {
      return errorResponse(
        "badResumptionToken",
        "The resumptionToken is invalid or expired. Tokens issued before the 2026-11-16 format-aware OAI rebuild cannot be honored; restart the harvest.",
        verbAttrs
      );
    }
    shardIdx = state.i;
    offset = state.o;
    setSpec = state.s;
    format = state.m;
    from = state.f;
    until = state.u;
    // A token naming an unknown set can only be forged (decodeToken
    // already rejects those), but stay defensive: never honor one.
    if (setSpec && !COLLECTIONS.some((c) => c.toLowerCase() === setSpec)) {
      return errorResponse("badResumptionToken", "The resumptionToken names an unknown set.", verbAttrs);
    }
  } else {
    const prefix = params.get("metadataPrefix");
    if (withMetadata || prefix !== null) {
      if (!prefix) return errorResponse("badArgument", "metadataPrefix is required.", verbAttrs);
      if (!isFormat(prefix))
        return errorResponse("cannotDisseminateFormat", "Only the oai_dc and oai_openaire metadata formats are available.", verbAttrs);
      format = prefix;
    }
    const setParam = params.get("set");
    if (setParam) {
      setSpec = setParam.toLowerCase();
      if (!COLLECTIONS.some((c) => c.toLowerCase() === setSpec))
        return errorResponse("noRecordsMatch", "The set argument names no set in this repository.", verbAttrs);
    }
    from = datePart(params.get("from"));
    until = datePart(params.get("until"));
    if ((params.get("from") && !from) || (params.get("until") && !until))
      return errorResponse("badArgument", "from/until must be YYYY-MM-DD dates.", verbAttrs);
  }
  if (windowExcludes(from, until)) {
    return errorResponse("noRecordsMatch", "No records fall in the requested datestamp window (all records carry the repository snapshot datestamp).", verbAttrs);
  }

  // THE budget rule: exactly ONE shard fetch per list request. The
  // shard's records are filtered in memory (references only); the
  // filtered list is never re-fetched and no second shard is parsed,
  // even if this page comes back partial or empty.
  const records = await getShardRecords(shardIdx, OAI_SHARD_TIMEOUT_MS);
  if (!records) {
    return unavailableResponse(verbAttrs);
  }
  const filtered = setSpec
    ? records.filter((r) => r && String(r.collection || "").toLowerCase() === setSpec)
    : records;
  const lastShard = shardIdx >= shardCount - 1;

  // Catalog-shrink grace: a token offset past this shard's filtered
  // end (shards regenerated between pages) advances to the next shard
  // instead of erroring or stalling; on the last shard it ends cleanly.
  let page;
  let tokenOut;
  if (offset > filtered.length) {
    page = [];
    tokenOut = lastShard ? `<resumptionToken></resumptionToken>` : `<resumptionToken>${encodeToken({ i: shardIdx + 1, o: 0, s: setSpec, k: kind, m: format, f: from, u: until })}</resumptionToken>`;
  } else {
    page = filtered.slice(offset, offset + PAGE);
    const remaining = filtered.length - (offset + page.length);
    if (remaining > 0) {
      tokenOut = `<resumptionToken>${encodeToken({ i: shardIdx, o: offset + page.length, s: setSpec, k: kind, m: format, f: from, u: until })}</resumptionToken>`;
    } else if (!lastShard) {
      // Shard exhausted (page may be partial or empty): token to the
      // next shard. Partial/empty pages with a token are spec-legal;
      // the harvester follows the token. No second shard is parsed
      // here to fill the page.
      tokenOut = `<resumptionToken>${encodeToken({ i: shardIdx + 1, o: 0, s: setSpec, k: kind, m: format, f: from, u: until })}</resumptionToken>`;
    } else {
      tokenOut = `<resumptionToken></resumptionToken>`;
    }
  }

  const inner = [
    `  <${tag}>`,
    ...page.map((r) => (withMetadata ? recordXml(r, SNAPSHOT_DATE, format) : headerXml(r, SNAPSHOT_DATE))),
    `    ${tokenOut}`,
    `  </${tag}>`,
  ].join("\n");
  return okResponse(envelope(verbAttrs, inner));
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const params = url.searchParams;
  if (context.request.method !== "GET" && context.request.method !== "POST") {
    return errorResponse("badVerb", "Only GET and POST are supported.");
  }
  let verb = params.get("verb");
  if (context.request.method === "POST") {
    try {
      const form = await context.request.clone().formData();
      if (!verb) verb = form.get("verb");
      for (const [k, v] of form.entries()) if (!params.has(k)) params.set(k, v);
    } catch (e) {
      /* GET params only */
    }
  }
  const verbAttr = verb ? ` verb="${xml(verb)}"` : "";

  switch (verb) {
    case "Identify": {
      const inner = [
        `  <Identify>`,
        `    <repositoryName>Tower of Babel — Antarctic Labs</repositoryName>`,
        `    <baseURL>${BASE}</baseURL>`,
        `    <protocolVersion>2.0</protocolVersion>`,
        `    <adminEmail>hello@antarctic-labs.com</adminEmail>`,
        `    <earliestDatestamp>${SNAPSHOT_DATE}</earliestDatestamp>`,
        `    <deletedRecord>no</deletedRecord>`,
        `    <granularity>YYYY-MM-DD</granularity>`,
        `    <description>`,
        `      <oai-identifier xmlns="http://www.openarchives.org/OAI/2.0/oai-identifier" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai-identifier http://www.openarchives.org/OAI/2.0/oai-identifier.xsd">`,
        `        <scheme>oai</scheme>`,
        `        <repositoryIdentifier>antarctic-labs.com</repositoryIdentifier>`,
        `        <delimiter>:</delimiter>`,
        `        <sampleIdentifier>oai:antarctic-labs.com:holy-bible-king-james-version</sampleIdentifier>`,
        `      </oai-identifier>`,
        `    </description>`,
        `    <description>`,
        `      <datestampPolicy xmlns="http://antarctic-labs.com/oai/datestamp-policy">All records share one datestamp — the repository snapshot date (${SNAPSHOT_DATE}) — because the catalog carries no per-entry dates. The catalog grows daily; re-harvest ListRecords in full rather than relying on incremental from/until harvesting.</datestampPolicy>`,
        `    </description>`,
        `  </Identify>`,
      ].join("\n");
      return okResponse(envelope(verbAttr, inner));
    }
    case "ListMetadataFormats": {
      const idParam = params.get("identifier");
      if (idParam) {
        const m = idParam.match(/^oai:antarctic-labs\.com:(.+)$/);
        const found = m ? await getRecordById(m[1]) : { state: "missing" };
        if (!m || found.state === "missing")
          return errorResponse("idDoesNotExist", "The identifier does not resolve to a record in this repository.", verbAttr);
        if (found.state === "error")
          return unavailableResponse(verbAttr);
      }
      const lines = [`  <ListMetadataFormats>`];
      for (const [prefix, f] of Object.entries(FORMATS)) {
        lines.push(
          `    <metadataFormat>`,
          `      <metadataPrefix>${prefix}</metadataPrefix>`,
          `      <schema>${f.schema}</schema>`,
          `      <metadataNamespace>${f.namespace}</metadataNamespace>`,
          `    </metadataFormat>`
        );
      }
      lines.push(`  </ListMetadataFormats>`);
      return okResponse(envelope(verbAttr, lines.join("\n")));
    }
    case "ListSets": {
      const lines = [`  <ListSets>`];
      for (const c of COLLECTIONS) {
        lines.push(
          `    <set>`,
          `      <setSpec>${c.toLowerCase()}</setSpec>`,
          `      <setName>Tower of Babel — ${xml(COLLECTION_LABELS[c])}</setName>`,
          `    </set>`
        );
      }
      lines.push(`  </ListSets>`);
      return okResponse(envelope(verbAttr, lines.join("\n")));
    }
    case "GetRecord": {
      const idParam = params.get("identifier");
      const prefix = params.get("metadataPrefix");
      if (!idParam || !prefix)
        return errorResponse("badArgument", "GetRecord requires identifier and metadataPrefix.", verbAttr);
      if (!isFormat(prefix))
        return errorResponse("cannotDisseminateFormat", "Only the oai_dc and oai_openaire metadata formats are available.", verbAttr);
      const m = idParam.match(/^oai:antarctic-labs\.com:(.+)$/);
      if (!m) return errorResponse("idDoesNotExist", "The identifier is not in this repository's namespace.", verbAttr);
      const found = await getRecordById(m[1]);
      if (found.state === "missing")
        return errorResponse("idDoesNotExist", "No record exists for that identifier.", verbAttr);
      if (found.state === "error")
        return unavailableResponse(verbAttr);
      const inner = [`  <GetRecord>`, recordXml(found.record, SNAPSHOT_DATE, prefix), `  </GetRecord>`].join("\n");
      return okResponse(envelope(verbAttr, inner));
    }
    case "ListRecords":
      return listResponse(params, verbAttr, true);
    case "ListIdentifiers":
      return listResponse(params, verbAttr, false);
    case null:
    case "":
    case undefined:
      return errorResponse("badVerb", "The verb argument is missing.");
    default:
      return errorResponse("badVerb", `The verb "${verb}" is not supported.`, verbAttr);
  }
}

// PUSH NOTE (parent): this file reads the live catalog shards directly,
// so no data generation step is needed — but two things must travel
// with any catalog-shards refresh, in the same push:
// 1. SNAPSHOT_DATE above must be bumped to the refresh date (it is
//    the datestamp every record carries, and the from/until window
//    reference). A stale date does not break paging, but it makes
//    from/until windows and Identify's earliestDatestamp wrong.
// 2. Nothing else: shard counts come from getShardCount() in
//    functions/_lib/tower-catalog.js, which reads the live count from
//    catalog-shards/count.json (auto-sized by reshard since 2026-10-30).
