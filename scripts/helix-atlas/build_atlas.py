#!/usr/bin/env python3
"""Bake the true-representation helix atlas (4096x4096, 16x16 cells of 256px).
Each cell depicts a REAL catalog entry from its band's collection:
the entry's real cover image where one exists, else a typeset plate of
the entry's real title + creator in the existing atlas's plate design.
Band cell ranges (row-major): LAW 0-63, PAPERS 64-127, BOOKS 128-167,
REFERENCE 168-195, DECLASSIFIED 196-219, PODCASTS 220-239, DOCUMENTS 240-255.
Output: helix-atlas.webp + helix-atlas-manifest.json
"""
import json, os, hashlib, math
from PIL import Image, ImageDraw, ImageFont, ImageOps

RUN = os.path.dirname(os.path.abspath(__file__))
WT = os.environ.get("WT", os.path.expanduser("~/workspace/antarctic-labs-work/work-truerep"))
CELL = 256
BAND_CELLS = [("LAW", 64), ("PAPERS", 64), ("BOOKS", 40), ("REFERENCE", 28),
              ("DECLASSIFIED", 24), ("PODCASTS", 20), ("DOCUMENTS", 16)]

FONT_CANDIDATES_BOLD = [
    "/usr/share/fonts/truetype/noto/NotoSerif-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
]
FONT_CANDIDATES_REG = [
    "/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
]
def pick(cands):
    for c in cands:
        if os.path.exists(c):
            return c
    raise SystemExit("no font found in " + str(cands))
F_BOLD = pick(FONT_CANDIDATES_BOLD)
F_REG = pick(FONT_CANDIDATES_REG)

def font(path, size):
    return ImageFont.truetype(path, size)

def palette_from_existing():
    """Dominant (median) color of each cell of the CURRENT atlas ->
    the established muted palette pool for new plates."""
    src = Image.open(os.path.join(WT, "public/helix-atlas.webp")).convert("RGB")
    pal = []
    for r in range(16):
        for c in range(16):
            cell = src.crop((c * CELL, r * CELL, (c + 1) * CELL, (r + 1) * CELL))
            small = cell.resize((24, 24))
            px = list(small.getdata())
            # median per channel ~ dominant plate color (borders are a minority)
            med = tuple(sorted(ch[i] for ch in px)[len(px) // 2] for i in range(3))
            pal.append(med)
    return pal

def ink_for(bg):
    lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]
    return (38, 32, 22) if lum > 110 else (238, 230, 212)

def wrap(draw, text, fnt, maxw, maxlines):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=fnt) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
            if len(lines) == maxlines:
                break
    if cur and len(lines) < maxlines:
        lines.append(cur)
    return lines

def draw_plate(entry, bg, variant):
    im = Image.new("RGB", (CELL, CELL), bg)
    d = ImageDraw.Draw(im)
    ink = ink_for(bg)
    soft = tuple(int(v * 0.82 + 18) for v in ink) if ink[0] < 100 else tuple(int(v * 0.72) for v in ink)
    title = (entry.get("title") or "Untitled").strip()
    creator = (entry.get("creator") or "").strip()
    if len(title) > 110:
        title = title[:107].rstrip() + "..."
    if variant == "spine":
        # vertical title between two side bars (existing atlas variant)
        d.rectangle([26, 10, 30, CELL - 10], fill=soft)
        d.rectangle([CELL - 30, 10, CELL - 26, CELL - 10], fill=soft)
        size = 30
        while size > 13:
            f = font(F_BOLD, size)
            if d.textlength(title.upper(), font=f) <= CELL - 90:
                break
            size -= 2
        txt = Image.new("RGBA", (CELL - 80, 64), (0, 0, 0, 0))
        td = ImageDraw.Draw(txt)
        td.text((0, 8), title.upper(), font=font(F_BOLD, size), fill=ink + (255,))
        txt = txt.rotate(90, expand=True)
        im.paste(txt, ((CELL - txt.width) // 2, (CELL - txt.height) // 2), txt)
        return im
    # standard plate: double-rule border
    d.rectangle([13, 13, CELL - 14, CELL - 14], outline=soft, width=2)
    d.rectangle([20, 20, CELL - 21, CELL - 21], outline=soft, width=1)
    cy = 44
    if variant == "glyph":
        g = "△" if (sum(title.encode()) % 2 == 0) else "○"
        gf = font(F_REG, 26)
        w = d.textlength(g, font=gf)
        try:
            d.text(((CELL - w) / 2, cy), g, font=gf, fill=ink)
        except Exception:
            pass
        cy += 44
    # title, shrink to fit <=4 lines in the middle band
    size = 27
    lines = []
    truncated = False
    while size >= 12:
        f = font(F_BOLD, size)
        lines = wrap(d, title.upper(), f, CELL - 64, 4)
        widest = max((d.textlength(ln, font=f) for ln in lines), default=0)
        if widest <= CELL - 64 and len(lines) * (size + 7) <= 138:
            break
        size -= 2
    # if the wrap dropped words, mark the last line with an ellipsis
    shown = " ".join(lines).split()
    if len(shown) < len(title.upper().split()) and lines:
        lines[-1] = lines[-1].rstrip(".") + "..."
    f = font(F_BOLD, size)
    y = cy + max(0, (138 - len(lines) * (size + 7)) // 2)
    for ln in lines:
        w = d.textlength(ln, font=f)
        d.text(((CELL - w) / 2, y), ln, font=f, fill=ink)
        y += size + 7
    if creator:
        c = creator.upper()
        # shrink, then truncate, until the line fits inside the frame
        size = 13
        cf = font(F_REG, size)
        while size > 9 and d.textlength(c, font=cf) > CELL - 60:
            size -= 1
            cf = font(F_REG, size)
        while c and d.textlength(c, font=cf) > CELL - 60:
            c = c[:-2].rstrip() + "."
        w = d.textlength(c, font=cf)
        d.line([CELL / 2 - 16, CELL - 52, CELL / 2 + 16, CELL - 52], fill=ink, width=2)
        d.text(((CELL - w) / 2, CELL - 42), c, font=cf, fill=ink)
    return im

def cover_cell(entry):
    p = os.path.join(RUN, "covers", entry["artifact_id"] + ".img")
    im = Image.open(p).convert("RGB")
    w, h = im.size
    a = w / max(1, h)
    if a >= 1.0:
        # landscape/square (podcast thumbs, IA art): center-crop square
        return ImageOps.fit(im, (CELL, CELL), Image.LANCZOS)
    # portrait covers: scale to cell width and crop from the TOP so the
    # cover's title band survives the square cell (center-crop decapitated
    # Gutenberg covers — their title sits in the top band).
    im2 = im.resize((CELL, max(1, round(h * CELL / w))), Image.LANCZOS)
    if im2.height >= CELL:
        return im2.crop((0, 0, CELL, CELL))
    bg = im2.getpixel((2, 2))
    canvas = Image.new("RGB", (CELL, CELL), bg)
    canvas.paste(im2, ((CELL - im2.width) // 2, (CELL - im2.height) // 2))
    return canvas

def main():
    resolved = json.load(open(os.path.join(RUN, "sample-resolved.json")))
    by_coll = {}
    for e in resolved:
        by_coll.setdefault(e["collection"], []).append(e)
    pal = palette_from_existing()
    atlas = Image.new("RGB", (4096, 4096), (10, 10, 10))
    manifest = []
    idx = 0
    for band, k in BAND_CELLS:
        entries = by_coll.get(band, [])
        assert len(entries) >= k, (band, len(entries), k)
        for i in range(k):
            e = entries[i]
            col, row = idx % 16, idx // 16
            if e["kind"] == "cover":
                cell_im = cover_cell(e)
            else:
                h = int(hashlib.md5(e["artifact_id"].encode()).hexdigest()[:8], 16)
                bg = pal[h % len(pal)]
                variant = "spine" if h % 9 == 0 else ("glyph" if h % 4 == 0 else "std")
                cell_im = draw_plate(e, bg, variant)
            atlas.paste(cell_im, (col * CELL, row * CELL))
            manifest.append({
                "cell": idx, "col": col, "row": row, "band": band,
                "artifact_id": e["artifact_id"], "title": e.get("title") or "",
                "creator": e.get("creator") or "", "kind": e["kind"],
                "source": e.get("cover_url") or "typeset plate of the real entry (no deterministic cover exists)",
            })
            idx += 1
    assert idx == 256, idx
    out_webp = os.path.join(RUN, "helix-atlas.webp")
    atlas.save(out_webp, "WEBP", quality=74, method=6)
    json.dump({"cells": manifest,
               "note": "Cell = one real catalog entry from the band's collection. kind=cover: the entry's real cover image (YouTube/Gutenberg/IA per tower-covers.js rules). kind=plate: typeset plate of the entry's real title+creator (the library's own fallback idiom) — no deterministic cover exists for that entry."},
              open(os.path.join(RUN, "helix-atlas-manifest.json"), "w"), indent=1)
    print("atlas bytes:", os.path.getsize(out_webp))
    from collections import Counter
    print(Counter((m["band"], m["kind"]) for m in manifest))

if __name__ == "__main__":
    main()
