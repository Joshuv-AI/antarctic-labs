#!/usr/bin/env python3
"""Atlas-2 bake: same 256-cell layout and band pools as the phase-2 atlas.
Cover cells are reused untouched; every former plate cell is replaced by
its atlas2 cover-grade cell (PDF first page or first-page render of the
entry's own text). Output: helix-atlas2.webp + helix-atlas-manifest2.json
"""
import json, os, sys
from PIL import Image, ImageOps

A2 = os.path.dirname(os.path.abspath(__file__))
RUN = os.path.dirname(A2)
CELL = 256
BAND_CELLS = [("LAW", 64), ("PAPERS", 64), ("BOOKS", 40), ("REFERENCE", 28),
              ("DECLASSIFIED", 24), ("PODCASTS", 20), ("DOCUMENTS", 16)]
QUALITY = int(os.environ.get("Q", "72"))
SOFT = int(os.environ.get("SOFT", "0"))  # if >0: downscale-upscale non-cover cells to this effective res (byte control; panels display far below 256px)

def cover_cell(entry):
    p = os.path.join(RUN, "covers", entry["artifact_id"] + ".img")
    im = Image.open(p).convert("RGB")
    w, h = im.size
    a = w / max(1, h)
    if a >= 1.0:
        return ImageOps.fit(im, (CELL, CELL), Image.LANCZOS)
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
    cells2 = {m["artifact_id"]: m for m in json.load(open(os.path.join(A2, "cells-manifest.json")))}
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
                kind, source = "cover", e.get("cover_url") or ""
            else:
                m = cells2.get(e["artifact_id"])
                assert m, ("missing atlas2 cell", e["artifact_id"])
                cell_im = Image.open(os.path.join(A2, "cells", e["artifact_id"] + ".png")).convert("RGB")
                if SOFT:
                    cell_im = cell_im.resize((SOFT, SOFT), Image.LANCZOS).resize((CELL, CELL), Image.LANCZOS)
                kind, source = m["kind"], m["source"]
            atlas.paste(cell_im, (col * CELL, row * CELL))
            manifest.append({
                "cell": idx, "col": col, "row": row, "band": band,
                "artifact_id": e["artifact_id"], "title": e.get("title") or "",
                "creator": e.get("creator") or "", "kind": kind, "source": source,
            })
            idx += 1
    assert idx == 256, idx
    out = os.path.join(A2, "helix-atlas2.webp")
    atlas.save(out, "WEBP", quality=QUALITY, method=6)
    json.dump({"cells": manifest,
               "note": "Cell = one real catalog entry from the band's collection. kind=cover: the entry's real cover image (YouTube/Gutenberg/IA per tower-covers.js rules). kind=pdf-first-page: page 1 of the entry's canonical source PDF (arXiv / govinfo Federal Register / govinfo Public Law). kind=text-first-page: a first-page render typeset from the entry's own hosted full text in its document family's page idiom (every word is the entry's own)."},
              open(os.path.join(A2, "helix-atlas-manifest2.json"), "w"), indent=1)
    print("atlas2 bytes:", os.path.getsize(out), "quality", QUALITY)
    from collections import Counter
    print(Counter((m["band"], m["kind"]) for m in manifest))

if __name__ == "__main__":
    main()
