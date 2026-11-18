// Cloudflare Pages Function — per-entry VIEWS counter (INVENTORY 110,
// DESIGN §8.7 Option B, Joshua re-asserted 2026-11-18).
//
//   POST /api/views { id } -> { ok, views }   (counts one open)
//   GET  /api/views?id=... -> { ok, views }   (read-only; never counts)
//
// The counter is a single D1 table on the API-key system's database
// (binding: TOWER_DB). It counts OPENS, archive.org-style — no accounts,
// no identity, nothing stored but the artifact id and its count.
// Counting starts at launch: there is no backfill, no estimate, and no
// reconstructed history — a work nobody has opened since launch has no
// row, and the client renders a VIEWS line only when a real stored
// number comes back (the §8.7 honesty rule).
//
// Bot filtering is server-side and deliberate (the ClaudeBot lesson: an
// unfiltered counter publishes crawler traffic as human views). A POST
// counts only when the request looks like a reader's browser on this
// site: a non-bot user agent AND an Origin/Referer on antarctic-labs.com
// (the entry page's own fetch is same-origin; scripted direct hits and
// crawlers fail one or both). Refused posts return the current stored
// count unincremented so the number stays honest either way.

import { json } from "../_lib/api-auth.js";

const BOT_UA =
  /bot|crawl|spider|headless|preview|facebookexternalhit|slack|discord|telegram|whatsapp|linkedin|twitter|python-requests|python-urllib|curl\/|wget|go-http-client|okhttp|scrapy|puppeteer|playwright|phantom|lighthouse/i;

function siteHost(request) {
  for (const name of ["origin", "referer"]) {
    const v = request.headers.get(name);
    if (!v) continue;
    try {
      return new URL(v).hostname;
    } catch {
      /* unparsable header — try the next one */
    }
  }
  return "";
}

function looksHuman(request) {
  const ua = request.headers.get("user-agent") || "";
  if (!ua || BOT_UA.test(ua)) return false;
  const host = siteHost(request);
  return host === "antarctic-labs.com" || host === "www.antarctic-labs.com";
}

function validId(id) {
  return (
    typeof id === "string" &&
    id.length >= 1 &&
    id.length <= 200 &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)
  );
}

const CREATE_SQL =
  "CREATE TABLE IF NOT EXISTS entry_views (" +
  "artifact_id TEXT PRIMARY KEY, " +
  "views INTEGER NOT NULL DEFAULT 0, " +
  "updated_at TEXT)";
const UPSERT_SQL =
  "INSERT INTO entry_views (artifact_id, views, updated_at) " +
  "VALUES (?1, 1, ?2) " +
  "ON CONFLICT(artifact_id) DO UPDATE SET views = views + 1, updated_at = ?2";
const SELECT_SQL = "SELECT views FROM entry_views WHERE artifact_id = ?1";

async function readCount(env, id) {
  const row = await env.TOWER_DB.prepare(SELECT_SQL).bind(id).first();
  return row && Number.isFinite(row.views) ? row.views : 0;
}

export async function onRequestPost({ request, env }) {
  if (!env.TOWER_DB) {
    // Dormant, like the key system without its binding: the client
    // hides the VIEWS row entirely rather than showing a fake zero.
    return json({ ok: false, error: "counter unavailable" }, 503);
  }
  let data = null;
  try {
    data = await request.json();
  } catch {
    data = null;
  }
  const id = data && typeof data.id === "string" ? data.id : "";
  if (!validId(id)) return json({ ok: false, error: "invalid id" }, 400);
  try {
    if (!looksHuman(request)) {
      // Not counted — but answer with the real stored number so a
      // filtered reader still sees the true figure.
      return json({ ok: true, views: await readCount(env, id), counted: false });
    }
    const now = new Date().toISOString();
    await env.TOWER_DB.batch([
      env.TOWER_DB.prepare(CREATE_SQL),
      env.TOWER_DB.prepare(UPSERT_SQL).bind(id, now),
    ]);
    return json({ ok: true, views: await readCount(env, id), counted: true });
  } catch (err) {
    console.error("views increment failed", err);
    return json({ ok: false, error: "counter failed" }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.TOWER_DB) {
    return json({ ok: false, error: "counter unavailable" }, 503);
  }
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!validId(id)) return json({ ok: false, error: "invalid id" }, 400);
  try {
    await env.TOWER_DB.prepare(CREATE_SQL).run();
    return json({ ok: true, views: await readCount(env, id) });
  } catch (err) {
    console.error("views read failed", err);
    return json({ ok: false, error: "counter failed" }, 500);
  }
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
