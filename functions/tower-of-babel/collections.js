// GET /tower-of-babel/collections — the collections index: one
// crawlable doorway per Tower of Babel collection, with live counts.
// Server-rendered for every visitor (same pattern as the Phase 1 entry
// pages); see functions/_lib/collections.js for the data + rendering.
import { renderCollectionsIndex, serveCollectionPage } from "../_lib/collections.js";

export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  return serveCollectionPage(context, renderCollectionsIndex);
}
