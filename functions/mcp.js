// Tower of Babel MCP server — Streamable HTTP, stateless.
// Placement on push: functions/mcp.js  (route: POST /mcp)
//
// DEPLOY CHOICE, STATED PLAINLY: this IS a spec-shaped MCP server
// (JSON-RPC 2.0, protocol version 2025-03-26, Streamable HTTP
// transport), and it CAN deploy as a single Cloudflare Pages Function
// because it is stateless: no session id, no SSE stream, no server-side
// conversation state. Each POST is one complete JSON-RPC request (or
// batch) and returns one JSON response. The Streamable HTTP spec
// allows a server to answer with a plain JSON response when the
// client accepts application/json, and Claude/ChatGPT MCP clients do.
// What this is NOT: it has no OAuth, no resources, no prompts, no
// sampling, no elicitation, and no stateful multi-turn session
// support. Those are listed as gaps in REPORT.md, not silently
// claimed. If a future client requires SSE streams or OAuth, this
// file needs a real server (e.g. a Worker with Durable Objects for
// sessions), which is a different deployment, not a Pages Function.
//
// Tools: search_works, get_work, list_collection, list_group — the
// same read-only data and the same CPU bounds as the REST API
// (see _lib/tower-api.js). Tool calls never leak internal URLs,
// paths, or upstream errors: failures become a generic tool error
// with isError: true.
import {
  API_VERSION,
  COLLECTIONS,
  searchWorks,
  listCollection,
  getHubsIndex,
  groupWorks,
  getWork,
  decodeCursor,
} from "./_lib/tower-api.js";

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_NAME = "tower-of-babel";
const MAX_LIMIT = 50;

const TOOLS = [
  {
    name: "search_works",
    title: "Search works",
    annotations: {
      // Read-only, idempotent, no side effects. openWorldHint is
      // true because the server fetches the site's own published
      // catalog shards over the network to answer (first-party
      // public data only — it never writes or contacts third
      // parties on a caller's behalf).
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    description:
      "Search the Tower of Babel public-domain library by title or creator. Results are in catalog order, not relevance-ranked; follow next_cursor until it is null to cover more of the catalog. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text, matched as words against title and/or creator." },
        field: { type: "string", enum: ["title", "author", "any"], default: "any" },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        cursor: { type: "string", description: "Opaque continuation cursor from a previous call." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_work",
    title: "Get work",
    annotations: {
      // Read-only, idempotent, no side effects. openWorldHint is
      // true because the server fetches the site's own published
      // catalog shards over the network to answer (first-party
      // public data only — it never writes or contacts third
      // parties on a caller's behalf).
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    description:
      "Get one work's metadata by its id (artifact id, e.g. us-declaration-of-independence). Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The work's artifact id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_collection",
    title: "List collection",
    annotations: {
      // Read-only, idempotent, no side effects. openWorldHint is
      // true because the server fetches the site's own published
      // catalog shards over the network to answer (first-party
      // public data only — it never writes or contacts third
      // parties on a caller's behalf).
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    description:
      "List works in one collection (PAPERS, DECLASSIFIED, BOOKS, REFERENCE, DOCUMENTS, PODCASTS) in catalog order. Follow next_cursor until null. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string", enum: COLLECTIONS },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        cursor: { type: "string", description: "Opaque continuation cursor from a previous call." },
      },
      required: ["collection"],
      additionalProperties: false,
    },
  },
  {
    name: "list_group",
    title: "List group",
    annotations: {
      // Read-only, idempotent, no side effects. openWorldHint is
      // true because the server fetches the site's own published
      // catalog shards over the network to answer (first-party
      // public data only — it never writes or contacts third
      // parties on a caller's behalf).
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    description:
      "List works in a precomputed group: a sacred tradition, a declassified programme, a top author, or a course group. Use the collections endpoint (or the library's group lists) for valid keys. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        group: { type: "string", enum: ["traditions", "programmes", "authors", "course"] },
        key: { type: "string", description: "Tradition/programme key, author slug, or course-group slug." },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
      required: ["group", "key"],
      additionalProperties: false,
    },
  },
];

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id === undefined ? null : id, error: { code, message } };
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id: id === undefined ? null : id, result };
}

function toolText(id, payload) {
  return rpcResult(id, {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  });
}

function toolError(id, message) {
  return rpcResult(id, {
    content: [{ type: "text", text: message }],
    isError: true,
  });
}

function validLimit(v, fallback) {
  if (v === undefined) return fallback;
  if (!Number.isInteger(v) || v < 1 || v > MAX_LIMIT) return null;
  return v;
}

async function callTool(name, args) {
  const a = args && typeof args === "object" ? args : {};
  if (name === "search_works") {
    const query = typeof a.query === "string" ? a.query.trim() : "";
    if (!query || query.length > 200) return { error: "query must be a non-empty string up to 200 characters" };
    const field = a.field === undefined ? "any" : a.field;
    if (!["title", "author", "any"].includes(field)) return { error: "field must be one of: title, author, any" };
    const limit = validLimit(a.limit, 20);
    if (limit === null) return { error: "limit must be an integer between 1 and 50" };
    let cursor = null;
    if (a.cursor !== undefined) {
      cursor = decodeCursor(a.cursor);
      if (!cursor) return { error: "cursor is not valid" };
    }
    const out = await searchWorks({ query, field, limit, cursor });
    if (!out || out.error) return { error: "Catalog data is temporarily unavailable" };
    return { ok: true, payload: { query, field, results: out.results, next_cursor: out.next_cursor, exhausted: out.exhausted, scanned_shards: out.scanned_shards } };
  }
  if (name === "get_work") {
    if (typeof a.id !== "string" || !a.id.trim()) return { error: "id is required" };
    const res = await getWork(a.id);
    if (res.state === "invalid" || res.state === "missing") return { error: "No work with that id" };
    if (res.state !== "ok") return { error: "Catalog data is temporarily unavailable" };
    return { ok: true, payload: { work: res.work } };
  }
  if (name === "list_collection") {
    const limit = validLimit(a.limit, 20);
    if (limit === null) return { error: "limit must be an integer between 1 and 50" };
    let cursor = null;
    if (a.cursor !== undefined) {
      cursor = decodeCursor(a.cursor);
      if (!cursor) return { error: "cursor is not valid" };
    }
    const out = await listCollection(a.collection || "", limit, cursor);
    if (!out) return { error: "Catalog data is temporarily unavailable" };
    if (out.error === "unknown_collection") return { error: "Unknown collection" };
    return { ok: true, payload: { collection: String(a.collection).toUpperCase(), results: out.results, next_cursor: out.next_cursor, exhausted: out.exhausted, scanned_shards: out.scanned_shards } };
  }
  if (name === "list_group") {
    const limit = validLimit(a.limit, 20);
    if (limit === null) return { error: "limit must be an integer between 1 and 50" };
    const offset = a.offset === undefined ? 0 : a.offset;
    if (!Number.isInteger(offset) || offset < 0) return { error: "offset must be a non-negative integer" };
    if (!["traditions", "programmes", "authors", "course"].includes(a.group)) return { error: "group must be one of: traditions, programmes, authors, course" };
    const hubs = await getHubsIndex();
    if (!hubs) return { error: "Catalog data is temporarily unavailable" };
    const out = groupWorks(hubs, a.group, a.key || "");
    if (out.error) return { error: "Unknown group key" };
    return { ok: true, payload: { group: a.group, key: String(a.key).toLowerCase(), total: out.total, offset, results: out.works.slice(offset, offset + limit) } };
  }
  return { error: `Unknown tool: ${name}` };
}

async function handleOne(msg) {
  // Notifications (no id) get no response, per JSON-RPC.
  const isNotification = msg && typeof msg === "object" && msg.id === undefined && typeof msg.method === "string" && msg.method.startsWith("notifications/");
  if (isNotification) return null;
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError(msg && msg.id !== undefined ? msg.id : null, -32600, "Invalid Request");
  }
  const id = msg.id === undefined ? null : msg.id;
  if (msg.method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: API_VERSION },
    });
  }
  if (msg.method === "ping") return rpcResult(id, {});
  if (msg.method === "tools/list") return rpcResult(id, { tools: TOOLS });
  if (msg.method === "tools/call") {
    const params = msg.params && typeof msg.params === "object" ? msg.params : {};
    if (typeof params.name !== "string") {
      return rpcError(id, -32602, "Invalid params: name is required");
    }
    const res = await callTool(params.name, params.arguments);
    if (res.error) return toolError(id, res.error);
    return toolText(id, res.payload);
  }
  return rpcError(id, -32601, "Method not found");
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === "GET") {
    // Stateless server: no SSE stream to resume. A plain 405, not a
    // fake stream, so clients fail loudly instead of hanging.
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Use POST with a JSON-RPC request" } }), {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "POST" },
    });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, "Parse error")), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const isBatch = Array.isArray(body);
  const messages = isBatch ? body : [body];
  const responses = [];
  for (const m of messages) {
    const r = await handleOne(m);
    if (r !== null) responses.push(r);
  }
  if (responses.length === 0) {
    // Batch of only notifications: no response body, per JSON-RPC.
    return new Response(null, { status: 202 });
  }
  return new Response(JSON.stringify(isBatch ? responses : responses[0]), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
