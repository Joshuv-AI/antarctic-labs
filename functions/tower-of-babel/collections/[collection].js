// GET /tower-of-babel/collections/<slug> — one crawlable landing page
// per Tower of Babel collection (papers, law, books, reference,
// declassified, documents, podcasts): the collection's real live count,
// a short factual description, and a daily-rotating sample of real
// entry links. See functions/_lib/collections.js.
import {
  collectionBySlug,
  renderCollectionPage,
  serveCollectionPage,
} from "../../_lib/collections.js";
import { notFoundPage } from "../../_lib/static-pages.js";

export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const meta = collectionBySlug(context.params.collection);
  if (!meta) {
    return new Response(notFoundPage(new URL(context.request.url).pathname), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return serveCollectionPage(context, () => renderCollectionPage(meta));
}
