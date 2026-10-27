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
// PER-SHARD TOKENS (v3): {v:3, i: shardIndex, o: offsetWithinShard,
// s: set|null, k: "records"|"identifiers", f: from|null, u: until|null,
// c: checksum}. The offset is WITHIN the current shard's filtered list
// (the full shard for the unfiltered list, the set-filtered list for a
// set list) — never a global offset, because a global offset cannot be
// honored without walking every earlier shard to count matches. Pages
// advance within a shard, then to the next shard. Page size is 100, as
// the old code used, so one shard yields many pages and sparse sets
// still progress.
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
// one cheap request per empty shard, bounded by the 25-shard count).
// No list request ever parses more than ONE catalog shard. If any case
// below forced a second shard parse, that would be a design failure —
// none does; the only multi-parse path in this file is GetRecord's
// pre-existing manifest + single-shard path, which the crawler entry
// pages already prove daily.
//
// completeListSize and cursor are OMITTED from resumptionTokens, on
// purpose. Both are optional attributes in the spec, and neither can
// be computed honestly without a full catalog walk: the total for a
// set list is the sum of that set's matches across all 25 shards, and
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
// Tokens v1 (old code, {o, s}) and v2 (lane A, global offset) are
// rejected with badResumptionToken: their offsets mean something
// different here (global, not per-shard), so honoring one would skip
// or repeat records. Per the spec, a harvester receiving
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
// ListRecords, GetRecord. Metadata format: oai_dc only. Identifiers:
// oai:antarctic-labs.com:<artifact_id>. Sets: the catalog's collections
// (setSpec = lowercase collection name, e.g. "books").
//
// Errors follow the spec: badVerb, badArgument, idDoesNotExist,
// cannotDisseminateFormat, badResumptionToken, noRecordsMatch.
// Descriptions are deliberately NOT exposed in oai_dc (same reason as
// lane A: the catalog's legacy description field is being rewritten
// library-wide; entry pages carry the current description). Rights
// status IS exposed (dc:rights) from each record's own field.

import {
  SITE,
  SHARD_COUNT,
  getRecordById,
  getShardRecords,
  escapeXml,
  textFileUrl,
} from "./_lib/tower-catalog.js";

const BASE = `${SITE}/oai`;
const PAGE = 100; // modest, as the old code used; one shard yields many pages
// Snapshot date: the date of the catalog-shards snapshot this code
// reads. Bump it in the SAME push as any catalog-shards refresh (the
// same cadence lane A's meta.json and tower-hubs.js's
// CATALOG_SNAPSHOT_DATE already follow). Every record's datestamp is
// this date; from/until are evaluated against it.
const SNAPSHOT_DATE = "2026-10-24";
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

// --- resumption tokens v3 (per-shard) ---
// Canonical payload string for the checksum: fields in fixed order,
// nulls as empty strings. FNV-1a 32-bit, hex.
function checksumFor(st) {
  const s = ["v3", st.i, st.o, st.s || "", st.k, st.f || "", st.u || ""].join("|");
  let h = 0x811c9dc5;
  for (let j = 0; j < s.length; j++) {
    h ^= s.charCodeAt(j);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
function encodeToken(state) {
  const st = { v: 3, i: state.i, o: state.o, s: state.s || null, k: state.k, f: state.f || null, u: state.u || null };
  st.c = checksumFor(st);
  return btoa(JSON.stringify(st)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeToken(token) {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const obj = JSON.parse(atob(b64));
    if (obj.v !== 3) return null;
    if (!Number.isInteger(obj.i) || obj.i < 0 || obj.i >= SHARD_COUNT) return null;
    if (!Number.isInteger(obj.o) || obj.o < 0) return null;
    if (obj.s !== null && (typeof obj.s !== "string" || !COLLECTIONS.some((c) => c.toLowerCase() === obj.s))) return null;
    if (obj.k !== "records" && obj.k !== "identifiers") return null;
    if (obj.f !== null && (typeof obj.f !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(obj.f))) return null;
    if (obj.u !== null && (typeof obj.u !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(obj.u))) return null;
    if (obj.c !== checksumFor(obj)) return null;
    return { i: obj.i, o: obj.o, s: obj.s, k: obj.k, f: obj.f, u: obj.u };
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

function recordXml(record, snapshotDate) {
  const entryUrl = `${SITE}/tower-of-babel/library/${record.artifact_id}`;
  const ids = [`      <dc:identifier>${xml(entryUrl)}</dc:identifier>`];
  const txt = textFileUrl(record);
  if (txt) ids.push(`      <dc:identifier>${xml(txt)}</dc:identifier>`);
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
  if (record.rights_status) lines.push(`      <dc:rights>${xml(record.rights_status)}</dc:rights>`);
  lines.push(`      </oai_dc:dc>`, `    </metadata>`, `    </record>`);
  return lines.join("\n");
}

// Window check shared by initial and token pages: all records carry
// SNAPSHOT_DATE, so a window excluding it matches nothing.
function windowExcludes(from, until) {
  return (from && from > SNAPSHOT_DATE) || (until && until < SNAPSHOT_DATE);
}

async function listResponse(params, verbAttrs, withMetadata) {
  const kind = withMetadata ? "records" : "identifiers";
  const tag = withMetadata ? "ListRecords" : "ListIdentifiers";

  const tokenRaw = params.get("resumptionToken");
  let shardIdx = 0;
  let offset = 0;
  let setSpec = null;
  let from = null;
  let until = null;
  if (tokenRaw) {
    // resumptionToken is exclusive: no other arguments allowed.
    if ([...params.keys()].some((k) => k !== "verb" && k !== "resumptionToken"))
      return errorResponse("badArgument", "resumptionToken must be the only argument besides verb.", verbAttrs);
    const state = decodeToken(tokenRaw);
    if (!state || state.k !== kind) {
      return errorResponse(
        "badResumptionToken",
        "The resumptionToken is invalid or expired. Tokens issued before the 2026-10-25 shard-paging OAI rebuild cannot be honored; restart the harvest.",
        verbAttrs
      );
    }
    shardIdx = state.i;
    offset = state.o;
    setSpec = state.s;
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
      if (prefix !== "oai_dc")
        return errorResponse("cannotDisseminateFormat", "Only the oai_dc metadata format is available.", verbAttrs);
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
  const records = await getShardRecords(shardIdx);
  if (!records) {
    return errorResponse("noRecordsMatch", "The catalog is temporarily unavailable.", verbAttrs);
  }
  const filtered = setSpec
    ? records.filter((r) => r && String(r.collection || "").toLowerCase() === setSpec)
    : records;
  const lastShard = shardIdx >= SHARD_COUNT - 1;

  // Catalog-shrink grace: a token offset past this shard's filtered
  // end (shards regenerated between pages) advances to the next shard
  // instead of erroring or stalling; on the last shard it ends cleanly.
  let page;
  let tokenOut;
  if (offset > filtered.length) {
    page = [];
    tokenOut = lastShard ? `<resumptionToken></resumptionToken>` : `<resumptionToken>${encodeToken({ i: shardIdx + 1, o: 0, s: setSpec, k: kind, f: from, u: until })}</resumptionToken>`;
  } else {
    page = filtered.slice(offset, offset + PAGE);
    const remaining = filtered.length - (offset + page.length);
    if (remaining > 0) {
      tokenOut = `<resumptionToken>${encodeToken({ i: shardIdx, o: offset + page.length, s: setSpec, k: kind, f: from, u: until })}</resumptionToken>`;
    } else if (!lastShard) {
      // Shard exhausted (page may be partial or empty): token to the
      // next shard. Partial/empty pages with a token are spec-legal;
      // the harvester follows the token. No second shard is parsed
      // here to fill the page.
      tokenOut = `<resumptionToken>${encodeToken({ i: shardIdx + 1, o: 0, s: setSpec, k: kind, f: from, u: until })}</resumptionToken>`;
    } else {
      tokenOut = `<resumptionToken></resumptionToken>`;
    }
  }

  const inner = [
    `  <${tag}>`,
    ...page.map((r) => (withMetadata ? recordXml(r, SNAPSHOT_DATE) : headerXml(r, SNAPSHOT_DATE))),
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
          return errorResponse("idDoesNotExist", "The catalog is temporarily unavailable.", verbAttr);
      }
      const inner = [
        `  <ListMetadataFormats>`,
        `    <metadataFormat>`,
        `      <metadataPrefix>oai_dc</metadataPrefix>`,
        `      <schema>http://www.openarchives.org/OAI/2.0/oai_dc.xsd</schema>`,
        `      <metadataNamespace>http://www.openarchives.org/OAI/2.0/oai_dc/</metadataNamespace>`,
        `    </metadataFormat>`,
        `  </ListMetadataFormats>`,
      ].join("\n");
      return okResponse(envelope(verbAttr, inner));
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
      if (prefix !== "oai_dc")
        return errorResponse("cannotDisseminateFormat", "Only the oai_dc metadata format is available.", verbAttr);
      const m = idParam.match(/^oai:antarctic-labs\.com:(.+)$/);
      if (!m) return errorResponse("idDoesNotExist", "The identifier is not in this repository's namespace.", verbAttr);
      const found = await getRecordById(m[1]);
      if (found.state === "missing")
        return errorResponse("idDoesNotExist", "No record exists for that identifier.", verbAttr);
      if (found.state === "error")
        return errorResponse("idDoesNotExist", "The catalog is temporarily unavailable.", verbAttr);
      const inner = [`  <GetRecord>`, recordXml(found.record, SNAPSHOT_DATE), `  </GetRecord>`].join("\n");
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
// 2. Nothing else: shard counts come from SHARD_COUNT in
//    functions/_lib/tower-catalog.js, which the existing push rule
//    already bumps in both places when shards are re-sharded.
