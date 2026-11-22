// GET /tower-of-babel/authors/<slug> — one author page: original short
// biography + the author's works held in full in the library, each
// linked to its entry page (2026-11-21 demand-pages Wave 1).
// Server-rendered for every visitor; unknown slugs get a real 404.
import { renderAuthorPage, serveDemandPage } from "../../_lib/demand-pages.js";

export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const slug = context.params && context.params.author ? String(context.params.author) : "";
  return serveDemandPage(context, () => renderAuthorPage(slug));
}
