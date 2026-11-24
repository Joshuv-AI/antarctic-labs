// GET /feed.xml — RSS 2.0 for "From the Stacks", the Tower of
// Babel's daily featured work (2026-11-23, Return-Visit Option A).
// Generated at request time from the deterministic rotation in
// _lib/from-the-stacks.js; the last 30 days of picks, newest first.
import { serveFeed } from "./_lib/from-the-stacks.js";

export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  return serveFeed(context, "rss");
}
