// GET /tower-of-babel/guides — index of the Tower of Babel study
// guides (2026-11-21 demand-pages Wave 1). Server-rendered for every
// visitor; see functions/_lib/demand-pages.js for data + rendering.
import { renderGuidesIndex, serveDemandPage } from "../_lib/demand-pages.js";

export async function onRequest(context) {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  return serveDemandPage(context, renderGuidesIndex);
}
