// GET /text-of-the-day — the Tower of Babel's daily featured work
// (2026-11-23, Return-Visit Option A). Server-rendered for every
// visitor; ?date=YYYY-MM-DD shows that day's pick. Rendering and the
// deterministic rotation live in _lib/from-the-stacks.js.
import { serveTextOfTheDay } from "./_lib/from-the-stacks.js";

export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  return serveTextOfTheDay(context);
}
