// Entry download endpoint — INVENTORY 60.
//
//   GET /api/download?file=<hosted .txt name>&format=epub|kindle|html|txt
//       &title=<entry title>&creator=<entry creator>&id=<artifact_id>
//
// Generates Project Gutenberg's established format set from the
// entry's hosted plain text, on request: EPUB 3 for e-readers, Kindle
// (MOBI) for Kindle, HTML for a browser, and Plain Text UTF-8 — which
// is the hosted file itself, served byte-identical. Generation is
// server-side so a phone never has to hold a 28 MB text plus its
// converted copy in browser memory; the generators work on bounded
// byte segments (see _lib/book-formats.js).
//
// The text is fetched through this site's own /tower-of-babel/<file>
// surface, so the bytes converted are exactly the bytes the reader
// shows (same bucket/flat resolution, same edge cache). A file that
// does not resolve to a real hosted text is a 404 here too — the
// endpoint never fabricates a book for an entry that has none.
//
// Generated files are edge-cached under their full request URL:
// the first request for a format pays the conversion, later ones are
// served from the cache. Failures are plain-text errors with no
// attachment header — never a partial file dressed as success.

import { buildEpub, buildMobi, buildHtml, seedFor } from "../_lib/book-formats.js";

const FORMATS = {
  epub: { ext: "epub", type: "application/epub+zip" },
  kindle: { ext: "mobi", type: "application/x-mobipocket-ebook" },
  html: { ext: "html", type: "text/html; charset=utf-8" },
  txt: { ext: "txt", type: "text/plain; charset=utf-8" },
};

function fail(status, message) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

// Same traversal guard as functions/tower-of-babel/[file].js: hosted
// names are a flat directory of generated slugs (accented letters are
// legitimate); anything that could climb out is rejected outright.
function validFileName(file) {
  return (
    typeof file === "string" &&
    file.length > 4 &&
    file.length <= 220 &&
    file.endsWith(".txt") &&
    !file.includes("/") &&
    !file.includes("\\") &&
    !file.includes("..")
  );
}

function cleanMeta(v) {
  if (typeof v !== "string") return "";
  // Metadata is embedded into XML/HTML/EXTH: strip control characters
  // and cap the length; escaping happens at the embed sites.
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 300);
}

function disposition(base, ext) {
  const ascii = base.replace(/[^\x20-\x7e]/g, "-").replace(/["\\]/g, "") || "tower-of-babel";
  let out = 'attachment; filename="' + ascii + "." + ext + '"';
  // RFC 5987 form so accented slugs (e.g. "cinquième") survive intact.
  out += "; filename*=UTF-8''" + encodeURIComponent(base + "." + ext);
  return out;
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return fail(405, "Method not allowed");
  }
  const url = new URL(request.url);
  const file = url.searchParams.get("file") || "";
  const format = (url.searchParams.get("format") || "").toLowerCase();
  const fmt = FORMATS[format];
  if (!fmt) return fail(400, "Unknown format. Use epub, kindle, html or txt.");
  if (!validFileName(file)) return fail(400, "Invalid file name.");

  const id = cleanMeta(url.searchParams.get("id"));
  const title = cleanMeta(url.searchParams.get("title")) || file.replace(/\.txt$/, "");
  const creator = cleanMeta(url.searchParams.get("creator"));
  const base = (id || file.replace(/\.txt$/, "")).slice(0, 120);

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  if (cache && request.method === "GET") {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  // Fetch the hosted text through the site's own text surface.
  let textRes;
  try {
    textRes = await fetch(url.origin + "/tower-of-babel/" + encodeURIComponent(file));
  } catch {
    return fail(502, "The text could not be fetched.");
  }
  if (!textRes.ok) return fail(404, "That entry has no hosted text to download.");
  const ctype = (textRes.headers.get("content-type") || "").toLowerCase();
  const textBytes = new Uint8Array(await textRes.arrayBuffer());
  // HTML-shell rejection, same guard as the reader: a .txt answered
  // with the SPA shell is not a book.
  if (ctype.includes("text/html")) return fail(404, "That entry has no hosted text to download.");
  {
    let s = 0;
    while (s < textBytes.length && s < 64 && (textBytes[s] === 0x20 || textBytes[s] === 0x09 || textBytes[s] === 0x0a || textBytes[s] === 0x0d)) s++;
    const head = new TextDecoder().decode(textBytes.subarray(s, s + 16)).toLowerCase();
    if (head.startsWith("<!doctype") || head.startsWith("<html")) {
      return fail(404, "That entry has no hosted text to download.");
    }
  }
  if (textBytes.length === 0) return fail(404, "That entry has no hosted text to download.");

  let body;
  try {
    if (format === "txt") {
      body = textBytes; // the hosted file itself, byte-identical
    } else if (format === "html") {
      body = buildHtml({ title, creator, textBytes });
    } else if (format === "epub") {
      const identifier = id
        ? url.origin + "/tower-of-babel/library/" + id
        : url.origin + "/tower-of-babel/" + file;
      body = buildEpub({ title, creator, identifier, textBytes, now: new Date() });
    } else {
      body = buildMobi({ title, creator, uidSeed: seedFor(id || file), textBytes });
    }
  } catch {
    return fail(500, "That format could not be prepared. The plain text download always works.");
  }

  const response = new Response(body, {
    headers: {
      "content-type": fmt.type,
      "content-disposition": disposition(base, fmt.ext),
      "content-length": String(body.length),
      "cache-control": "public, max-age=86400",
    },
  });
  if (cache && request.method === "GET") {
    context.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}
