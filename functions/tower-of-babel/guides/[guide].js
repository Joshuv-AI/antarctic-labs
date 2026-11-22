// GET /tower-of-babel/guides/<slug> — one study guide: an original
// overview plus the guide's texts, held in full, annotated and in
// reading order (2026-11-21 demand-pages Wave 1). Server-rendered for
// every visitor; unknown slugs get a real 404.
import { renderGuidePage, serveDemandPage } from "../../_lib/demand-pages.js";

export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const slug = context.params && context.params.guide ? String(context.params.guide) : "";
  return serveDemandPage(context, () => renderGuidePage(slug));
}
