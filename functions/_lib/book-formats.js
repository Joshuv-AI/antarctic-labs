// Book format generators for the Tower of Babel download endpoint
// (functions/api/download.js) — INVENTORY 60.
//
// Builds Project Gutenberg's established download set from an entry's
// hosted plain text, on request, entirely from the text bytes:
//   EPUB 3 (.epub), Kindle (.mobi, PalmDOC/MOBI container),
//   HTML (.html), and the plain text itself (served unchanged by the
//   caller, not here). Gutenberg generates its EPUB/Kindle files from
//   the book's text the same way; our texts carry no images, so the
//   "with/without images" variants Gutenberg lists collapse to one
//   file per format.
//
// Everything here works on bytes in bounded segments (~128 KB of
// source text at a time, split only at paragraph boundaries) so the
// library's largest texts (~28 MB dictionaries) never exist as one
// giant JS string: peak extra memory stays a small multiple of the
// input buffer instead of the 3-4x a naive decode-everything pass
// would take inside a 128 MB Worker isolate.
//
// Paragraph model (shared by HTML, EPUB and MOBI): a paragraph is a
// run of non-blank lines; lines inside a paragraph are joined with a
// space (standard reflow, the way Gutenberg's own EPUBs treat the
// hard-wrapped plain text). Nothing is added to the text: no chapter
// titles are invented — long works are split into size-based parts
// labeled "Part N", which is all the source supports.

const te = new TextEncoder();
const td = new TextDecoder("utf-8");

export function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function concatBytes(parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// --- paragraph segmentation over raw bytes -------------------------------
// Yields Uint8Array chunks of body HTML (<p>...</p> runs), each chunk
// covering roughly `target` source bytes. Splitting happens only at
// blank lines, and \n bytes never occur inside a UTF-8 multibyte
// sequence, so every paragraph range decodes cleanly on its own.
function* bodyHtmlChunks(bytes, target = 131072) {
  const n = bytes.length;
  let start = 0;
  // Strip a UTF-8 BOM if present.
  if (n >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  let paraStart = -1; // byte offset of the current paragraph's first line
  let chunkParas = []; // encoded <p> chunks waiting to be yielded
  let chunkBytes = 0; // source bytes covered by chunkParas

  const flushPara = (end) => {
    if (paraStart < 0) return;
    const raw = td.decode(bytes.subarray(paraStart, end));
    paraStart = -1;
    const text = raw
      .replace(/\r\n|\r|\n/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (!text) return;
    const enc = te.encode("<p>" + escapeHtml(text) + "</p>\n");
    chunkParas.push(enc);
    chunkBytes += enc.length;
  };

  let lineStart = start;
  let i = start;
  while (i <= n) {
    if (i === n || bytes[i] === 0x0a) {
      // Line is [lineStart, i) — blank if only space/tab/\r.
      let blank = true;
      for (let j = lineStart; j < i; j++) {
        const b = bytes[j];
        if (b !== 0x20 && b !== 0x09 && b !== 0x0d) { blank = false; break; }
      }
      if (blank) {
        flushPara(lineStart);
        if (chunkBytes >= target && chunkParas.length) {
          yield concatBytes(chunkParas);
          chunkParas = [];
          chunkBytes = 0;
        }
      } else if (paraStart < 0) {
        paraStart = lineStart;
      }
      lineStart = i + 1;
    }
    i++;
  }
  flushPara(n);
  if (chunkParas.length) yield concatBytes(chunkParas);
}

function titleBlock(title, creator) {
  let s = "<h1>" + escapeHtml(title) + "</h1>\n";
  if (creator) s += '<p class="byline">' + escapeHtml(creator) + "</p>\n";
  return s;
}

// --- HTML ------------------------------------------------------------------
const HTML_CSS =
  "body{font-family:Georgia,'Times New Roman',serif;max-width:42em;margin:2em auto;padding:0 1em;line-height:1.65;color:#1a1a1a}" +
  "h1{font-size:1.6em;line-height:1.25}.byline{color:#555;font-style:italic}" +
  "@media (prefers-color-scheme: dark){body{background:#14161a;color:#e8e4da}.byline{color:#9a958a}}";

export function buildHtml({ title, creator, textBytes }) {
  const parts = [
    te.encode(
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
        "<title>" + escapeHtml(title) + "</title>\n<style>" + HTML_CSS + "</style>\n</head>\n<body>\n" +
        titleBlock(title, creator)
    ),
  ];
  for (const chunk of bodyHtmlChunks(textBytes)) parts.push(chunk);
  parts.push(te.encode("</body>\n</html>\n"));
  return concatBytes(parts);
}

// --- ZIP (stored entries only) ---------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date =
    (((Math.max(1980, d.getFullYear()) - 1980) & 0x7f) << 9) |
    ((d.getMonth() + 1) << 5) |
    d.getDate();
  return { time, date };
}

// entries: [{ name, data }] — all stored uncompressed. The EPUB
// mimetype rule (first entry, stored, no extra field) is satisfied by
// construction: no entry carries an extra field.
function zipStore(entries, now) {
  const { time, date } = dosDateTime(now);
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = te.encode(e.name);
    const crc = crc32(e.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 filename flag
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, e.data.length, true);
    local.setUint32(22, e.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, e.data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, time, true);
    cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, e.data.length, true);
    cen.setUint32(24, e.data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + e.data.length;
  }
  const centralSize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return concatBytes([...parts, ...central, new Uint8Array(end.buffer)]);
}

// --- EPUB 3 ------------------------------------------------------------------
const EPUB_CSS =
  "body{font-family:Georgia,serif;line-height:1.6;margin:0 5%}" +
  "h1{font-size:1.5em;line-height:1.3}.byline{color:#555;font-style:italic}";

export function buildEpub({ title, creator, identifier, textBytes, now }) {
  // One generator chunk (~256 KB of body HTML) becomes one spine
  // part, assembled as bytes — no decode/re-encode round trip, so a
  // part costs only its own bytes of extra memory.
  const headBytes = te.encode(
    '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">\n' +
      "<head><title>" + escapeHtml(title) + "</title>" +
      '<link rel="stylesheet" type="text/css" href="style.css"/></head>\n<body>\n'
  );
  const titleBytes = te.encode(titleBlock(title, creator));
  const tailBytes = te.encode("</body>\n</html>\n");
  const partDocs = [];
  for (const chunk of bodyHtmlChunks(textBytes, 262144)) {
    partDocs.push(
      partDocs.length === 0
        ? concatBytes([headBytes, titleBytes, chunk, tailBytes])
        : concatBytes([headBytes, chunk, tailBytes])
    );
  }
  if (!partDocs.length) partDocs.push(concatBytes([headBytes, titleBytes, tailBytes]));

  const fileOf = (i) => "part-" + String(i + 1).padStart(4, "0") + ".xhtml";
  const modified = now.toISOString().replace(/\.\d+Z$/, "Z");
  const opf =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id" version="3.0">\n' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    '<dc:identifier id="pub-id">' + escapeHtml(identifier) + "</dc:identifier>\n" +
    "<dc:title>" + escapeHtml(title) + "</dc:title>\n" +
    (creator ? "<dc:creator>" + escapeHtml(creator) + "</dc:creator>\n" : "") +
    // dc:language is required by the EPUB spec; catalog records carry
    // no language field, so the package default is used — a container
    // requirement, not a claim about the work.
    "<dc:language>en</dc:language>\n" +
    '<meta property="dcterms:modified">' + modified + "</meta>\n" +
    "</metadata>\n<manifest>\n" +
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n' +
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n' +
    '<item id="css" href="style.css" media-type="text/css"/>\n' +
    partDocs.map((_, i) => '<item id="p' + (i + 1) + '" href="' + fileOf(i) + '" media-type="application/xhtml+xml"/>\n').join("") +
    "</manifest>\n" +
    '<spine toc="ncx">\n' +
    partDocs.map((_, i) => '<itemref idref="p' + (i + 1) + '"/>\n').join("") +
    "</spine>\n</package>\n";

  const navItems = partDocs
    .map((_, i) => '<li><a href="' + fileOf(i) + '">' + (partDocs.length > 1 ? "Part " + (i + 1) : escapeHtml(title)) + "</a></li>\n")
    .join("");
  const nav =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">\n' +
    "<head><title>Contents</title></head>\n<body>\n" +
    '<nav epub:type="toc"><h1>Contents</h1><ol>\n' + navItems + "</ol></nav>\n</body>\n</html>\n";

  const ncxPoints = partDocs
    .map((_, i) =>
      '<navPoint id="np' + (i + 1) + '" playOrder="' + (i + 1) + '"><navLabel><text>' +
      (partDocs.length > 1 ? "Part " + (i + 1) : escapeHtml(title)) +
      '</text></navLabel><content src="' + fileOf(i) + '"/></navPoint>\n')
    .join("");
  const ncx =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n<head>\n' +
    '<meta name="dtb:uid" content="' + escapeAttr(identifier) + '"/>\n' +
    '<meta name="dtb:depth" content="1"/>\n<meta name="dtb:totalPageCount" content="0"/>\n<meta name="dtb:maxPageNumber" content="0"/>\n</head>\n' +
    "<docTitle><text>" + escapeHtml(title) + "</text></docTitle>\n<navMap>\n" + ncxPoints + "</navMap>\n</ncx>\n";

  const container =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>\n';

  const entries = [
    { name: "mimetype", data: te.encode("application/epub+zip") },
    { name: "META-INF/container.xml", data: te.encode(container) },
    { name: "OEBPS/content.opf", data: te.encode(opf) },
    { name: "OEBPS/nav.xhtml", data: te.encode(nav) },
    { name: "OEBPS/toc.ncx", data: te.encode(ncx) },
    { name: "OEBPS/style.css", data: te.encode(EPUB_CSS) },
    ...partDocs.map((data, i) => ({ name: "OEBPS/" + fileOf(i), data })),
  ];
  return zipStore(entries, now);
}

// --- MOBI (PalmDOC / MOBI7) ---------------------------------------------------
// Uncompressed (PalmDOC compression type 1): the content stream is
// simple HTML built from the same paragraph model, sliced into
// 4096-byte records. Layout follows the MOBI header map as parsed by
// KindleUnpack (mobi6): PalmDOC header 16 bytes, MOBI header 232
// bytes, EXTH (creator 100 / updated title 503), then the full name.
export function buildMobi({ title, creator, uidSeed, textBytes }) {
  // Slice the HTML stream into 4096-byte records as it is generated —
  // the full HTML is never concatenated in memory.
  const RECORD = 4096;
  const textRecs = [];
  let carry = new Uint8Array(0);
  let htmlLen = 0;
  const feed = (buf) => {
    htmlLen += buf.length;
    const joined = carry.length ? concatBytes([carry, buf]) : buf;
    let off = 0;
    while (joined.length - off >= RECORD) {
      textRecs.push(joined.subarray(off, off + RECORD));
      off += RECORD;
    }
    carry = joined.subarray(off);
  };
  feed(
    te.encode(
      "<html>\n<head><title>" + escapeHtml(title) + "</title></head>\n<body>\n" +
        titleBlock(title, creator)
    )
  );
  for (const chunk of bodyHtmlChunks(textBytes)) feed(chunk);
  feed(te.encode("</body>\n</html>\n"));
  if (carry.length || !textRecs.length) textRecs.push(carry);
  const textRecords = textRecs.length;

  // EXTH
  const exthRecs = [];
  const pushExth = (type, str) => {
    const data = te.encode(str);
    const rec = new DataView(new ArrayBuffer(8));
    rec.setUint32(0, type);
    rec.setUint32(4, 8 + data.length);
    exthRecs.push(new Uint8Array(rec.buffer), data);
  };
  if (creator) pushExth(100, creator);
  pushExth(503, title);
  const exthBody = concatBytes(exthRecs);
  const exthHead = new DataView(new ArrayBuffer(12));
  exthHead.setUint32(4, 12 + exthBody.length); // length incl. header
  exthHead.setUint32(8, creator ? 2 : 1);
  const exthRaw = concatBytes([new Uint8Array(exthHead.buffer), exthBody]);
  // "EXTH" magic over the first 4 bytes.
  const exth = exthRaw.slice();
  exth[0] = 0x45; exth[1] = 0x58; exth[2] = 0x54; exth[3] = 0x48;
  const exthPaddedLen = (exth.length + 3) & ~3;

  const titleBytes = te.encode(title);
  const MOBI_LEN = 232;
  const titleOffset = 16 + MOBI_LEN + exthPaddedLen;

  const rec0 = new Uint8Array(titleOffset + titleBytes.length);
  const dv = new DataView(rec0.buffer);
  // PalmDOC header
  dv.setUint16(0, 1); // compression: none
  dv.setUint32(4, htmlLen);
  dv.setUint16(8, textRecords);
  dv.setUint16(10, RECORD);
  dv.setUint16(12, 0); // crypto type
  // MOBI header (offset 16)
  rec0.set(te.encode("MOBI"), 16);
  dv.setUint32(20, MOBI_LEN);
  dv.setUint32(24, 2); // type: Mobipocket book
  dv.setUint32(28, 65001); // codepage UTF-8
  dv.setUint32(32, uidSeed >>> 0);
  dv.setUint32(36, 6); // file version
  dv.setUint32(40, 0xffffffff); // orthographic index: none
  dv.setUint32(44, 0xffffffff); // inflection index: none
  dv.setUint32(80, textRecords + 1); // first non-book index (the trailer record)
  dv.setUint32(84, titleOffset);
  dv.setUint32(88, titleBytes.length);
  dv.setUint32(92, 0); // language: unspecified (records carry none)
  dv.setUint32(104, 6); // min version
  dv.setUint32(108, 0xffffffff); // first resource: none
  dv.setUint32(128, 0x40); // EXTH present flag
  dv.setUint32(164, 0xffffffff); // unknown0
  dv.setUint32(168, 0xffffffff); // DRM offset: none
  dv.setUint32(172, 0xffffffff); // DRM count
  dv.setUint16(192, 1); // first content record
  dv.setUint16(194, textRecords); // last content record
  dv.setUint32(200, 0xffffffff); // FCIS: none
  dv.setUint32(208, 0xffffffff); // FLIS: none
  dv.setUint16(242, 0); // trailing-data flags: none
  dv.setUint32(244, 0xffffffff); // NCX index: none
  rec0.set(exth, 16 + MOBI_LEN);
  rec0.set(titleBytes, titleOffset);
  // Conventional EOF trailer record after the text records.
  const records = [rec0, ...textRecs, new Uint8Array([0xe9, 0x8e, 0x0d, 0x0a])];

  // PalmDB header
  const palmName = te.encode(title.replace(/[^\x20-\x7e]/g, "?")).subarray(0, 31);
  const head = new Uint8Array(78);
  const hv = new DataView(head.buffer);
  head.set(palmName, 0);
  const palmEpoch = Math.floor(Date.now() / 1000) + 2082844800;
  hv.setUint32(36, palmEpoch); // creation
  hv.setUint32(40, palmEpoch); // modification
  head.set(te.encode("BOOK"), 60);
  head.set(te.encode("MOBI"), 64);
  hv.setUint32(68, uidSeed >>> 0);
  hv.setUint16(76, records.length);

  const parts = [head];
  let offset = 78 + records.length * 8 + 2;
  const infos = [];
  records.forEach((r, i) => {
    const info = new DataView(new ArrayBuffer(8));
    info.setUint32(0, offset);
    info.setUint32(4, i); // attributes byte 0 + unique id (3 bytes)
    infos.push(new Uint8Array(info.buffer));
    offset += r.length;
  });
  parts.push(...infos, new Uint8Array(2), ...records);
  return concatBytes(parts);
}

// djb2 — stable per-entry seed for MOBI unique ids.
export function seedFor(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}
