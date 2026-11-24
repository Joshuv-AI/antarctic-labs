// GET /atom.xml — Atom 1.0 twin of /feed.xml, "From the Stacks",
// the Tower of Babel's daily featured work (2026-11-23, Return-Visit
// Option A). Same items, generated from the same rotation in
// _lib/from-the-stacks.js.
import { serveFeed } from "./_lib/from-the-stacks.js";

export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  return serveFeed(context, "atom");
}
