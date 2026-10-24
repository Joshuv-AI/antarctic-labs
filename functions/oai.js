// OAI-PMH 2.0 endpoint for the Tower of Babel catalog.
// Base URL: https://antarctic-labs.com/oai
//
// Verbs: Identify, ListMetadataFormats, ListSets, ListIdentifiers,
// ListRecords, GetRecord. Metadata format: oai_dc only. Identifiers:
// oai:antarctic-labs.com:<artifact_id>. Sets: the catalog's collections
// (setSpec = lowercase collection name, e.g. "books").
//
// DATESTAMP POLICY (also stated in Identify): the catalog carries no
// per-entry dates, so every record's datestamp is the repository
// snapshot date — CATALOG_SNAPSHOT_DATE in functions/_lib/tower-hubs.js,
// the date this endpoint's catalog snapshot was taken. from/until are
// evaluated against that single date; harvesters should re-harvest
// ListRecords in full rather than rely on incremental harvesting.
//
// Errors follow the spec: badVerb, badArgument, idDoesNotExist,
// cannotDisseminateFormat, badResumptionToken, noRecordsMatch.
// Descriptions are deliberately NOT exposed in oai_dc: the catalog's
// legacy description field is being rewritten library-wide (the entry
// pages carry the current description), and shipping stale text to
// harvesters would propagate it. Rights status IS exposed (dc:rights)
// from each record's own rights_status field.

import {
  SITE,
  SHARD_COUNT,
  getRecordById,
  getShardRecords,
  escapeXml,
  textFileUrl,
} from "./_lib/tower-catalog.js";
import { CATALOG_SNAPSHOT_DATE } from "./_lib/tower-hubs.js";

const BASE = `${SITE}/oai`;
const PAGE = 100;
const COLLECTIONS = ["PAPERS", "DECLASSIFIED", "BOOKS", "REFERENCE", "DOCUMENTS", "PODCASTS"];
const COLLECTION_LABELS = {
  PAPERS: "Papers",
  DECLASSIFIED: "Declassified documents",
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

// --- resumption tokens: base64url(JSON {o: offset, s: setSpec|null}) ---
// Payload is ASCII-only JSON, so btoa/atob suffice (no Buffer dependency —
// Pages Functions do not guarantee Node globals without nodejs_compat).
function encodeToken(state) {
  return btoa(JSON.stringify(state)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeToken(token) {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const obj = JSON.parse(atob(b64));
    if (typeof obj.o !== "number" || obj.o < 0) return null;
    return { o: Math.floor(obj.o), s: obj.s || null };
  } catch (e) {
    return null;
  }
}

function datePart(v) {
  if (!v) return null;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function headerXml(record) {
  return [
    `    <header>`,
    `      <identifier>oai:antarctic-labs.com:${xml(record.artifact_id)}</identifier>`,
    `      <datestamp>${CATALOG_SNAPSHOT_DATE}</datestamp>`,
    `      <setSpec>${xml(String(record.collection || "").toLowerCase())}</setSpec>`,
    `    </header>`,
  ].join("\n");
}

function recordXml(record) {
  const entryUrl = `${SITE}/tower-of-babel/library/${record.artifact_id}`;
  const ids = [`      <dc:identifier>${xml(entryUrl)}</dc:identifier>`];
  const txt = textFileUrl(record);
  if (txt) ids.push(`      <dc:identifier>${xml(txt)}</dc:identifier>`);
  const lines = [
    `    <record>`,
    headerXml(record),
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

async function listResponse(params, verbAttrs, withMetadata) {
  const tokenRaw = params.get("resumptionToken");
  let offset = 0;
  let setSpec = null;
  if (tokenRaw) {
    // resumptionToken is exclusive: no other arguments allowed.
    if ([...params.keys()].some((k) => k !== "verb" && k !== "resumptionToken"))
      return errorResponse("badArgument", "resumptionToken must be the only argument besides verb.", verbAttrs);
    const state = decodeToken(tokenRaw);
    if (!state) return errorResponse("badResumptionToken", "The resumptionToken is invalid or expired.", verbAttrs);
    offset = state.o;
    setSpec = state.s;
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
    const from = datePart(params.get("from"));
    const until = datePart(params.get("until"));
    if ((params.get("from") && !from) || (params.get("until") && !until))
      return errorResponse("badArgument", "from/until must be YYYY-MM-DD dates.", verbAttrs);
    // Every record shares the snapshot datestamp: a window that excludes
    // it matches nothing; any other window matches everything.
    if ((from && from > CATALOG_SNAPSHOT_DATE) || (until && until < CATALOG_SNAPSHOT_DATE))
      return errorResponse("noRecordsMatch", "No records fall in the requested datestamp window (all records carry the repository snapshot datestamp).", verbAttrs);
  }

  // Stream the shards in catalog order (shard concatenation order),
  // counting matches and keeping only the requested window — the full
  // filtered list is never materialized, so memory stays at one shard.
  let total = 0;
  const slice = [];
  try {
    for (let s = 0; s < SHARD_COUNT; s++) {
      const records = await getShardRecords(s);
      if (!records) throw new Error("catalog shard unavailable");
      for (const r of records) {
        if (!r || !r.artifact_id) continue;
        if (setSpec && String(r.collection || "").toLowerCase() !== setSpec) continue;
        if (total >= offset && slice.length < PAGE) slice.push(r);
        total++;
      }
    }
  } catch (err) {
    return errorResponse("noRecordsMatch", "The catalog is temporarily unavailable.", verbAttrs);
  }
  if (!total)
    return errorResponse("noRecordsMatch", "No records match the request.", verbAttrs);
  if (offset >= total)
    return errorResponse("badResumptionToken", "The resumptionToken points past the end of the list.", verbAttrs);

  const nextOffset = offset + slice.length;
  const done = nextOffset >= total;
  const tokenOut = done
    ? `<resumptionToken completeListSize="${total}" cursor="${offset}"></resumptionToken>`
    : `<resumptionToken expirationDate="${new Date(Date.now() + 24 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, "Z")}" completeListSize="${total}" cursor="${offset}">${encodeToken({ o: nextOffset, s: setSpec })}</resumptionToken>`;

  const tag = withMetadata ? "ListRecords" : "ListIdentifiers";
  const inner = [
    `  <${tag}>`,
    ...slice.map((r) => (withMetadata ? recordXml(r) : headerXml(r))),
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
        `    <earliestDatestamp>${CATALOG_SNAPSHOT_DATE}</earliestDatestamp>`,
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
        `      <datestampPolicy xmlns="http://antarctic-labs.com/oai/datestamp-policy">All records share one datestamp — the repository snapshot date (${CATALOG_SNAPSHOT_DATE}) — because the catalog carries no per-entry dates. The catalog grows daily; re-harvest ListRecords in full rather than relying on incremental from/until harvesting.</datestampPolicy>`,
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
      const inner = [`  <GetRecord>`, recordXml(found.record), `  </GetRecord>`].join("\n");
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
