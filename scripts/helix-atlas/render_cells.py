#!/usr/bin/env python3
"""Atlas-2 cell builder: give every plate entry a cover-grade tile that is
the entry's own face:
  - pdf-first-page: page 1 of the canonical source PDF (arXiv / govinfo FR /
    govinfo PLAW / GAO), rendered with pdftoppm.
  - text-first-page: a first-page render typeset from the entry's OWN hosted
    full text + catalog metadata, in the document family's real page idiom
    (Federal Register masthead, CFR/USC page, journal article page,
    encyclopedia page, FRUS book page, UN document, treaty/constitution
    title page, book title page). Every word on the page is the entry's own.
Output: cells/<artifact_id>.png (256x256) + cells-manifest.json
"""
import hashlib, json, os, re, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageEnhance

A2 = os.path.dirname(os.path.abspath(__file__))
RUN = os.path.dirname(A2)
SS = 512            # supersample canvas
CELL = 256
SERIF = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"
SERIF_B = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"
SERIF_I = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"
SERIF_BI = "/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf"
SANS = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
SANS_B = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf"

def F(path, size):
    return ImageFont.truetype(path, size)

def h_int(s, mod):
    return int(hashlib.md5(s.encode()).hexdigest()[:8], 16) % mod

PAPERS_TINT = [(247, 244, 235), (245, 243, 238), (248, 246, 240), (244, 242, 233),
               (246, 243, 231), (243, 240, 228)]
INK = (32, 30, 26)

def paper(aid):
    bg = PAPERS_TINT[h_int(aid, len(PAPERS_TINT))]
    im = Image.new("RGB", (SS, SS), bg)
    d = ImageDraw.Draw(im, "RGBA")
    # page edge: faint double frame like a bound page
    edge = tuple(max(0, v - 26) for v in bg)
    d.rectangle([5, 5, SS - 6, SS - 6], outline=edge + (110,), width=2)
    return im, bg

def wrap(d, text, fnt, maxw):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=fnt) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines

def fit_lines(d, text, path, start, floor, maxw, maxlines):
    size = start
    while size > floor:
        f = F(path, size)
        lines = wrap(d, text, f, maxw)
        if len(lines) <= maxlines:
            return f, lines, size
        size -= 2
    f = F(path, floor)
    lines = wrap(d, text, f, maxw)[:maxlines]
    if lines:
        lines[-1] = lines[-1].rstrip(" .,;:") + "…"
    return f, lines, floor

def centered(d, cx, y, text, fnt, fill=INK):
    w = d.textlength(text, font=fnt)
    d.text((cx - w / 2, y), text, font=fnt, fill=fill)
    return y + fnt.size

def rule(d, x0, x1, y, fill=INK, wdt=2):
    d.line([x0, y, x1, y], fill=fill, width=wdt)

def body_flow(d, paras, x, y, width, fnt, leading, ymax, first_indent=0):
    """Flow paragraphs of real text until ymax; returns when full."""
    for pi, para in enumerate(paras):
        if y > ymax:
            return
        lines = wrap(d, para, fnt, width - (first_indent if pi == 0 else 0))
        for li, ln in enumerate(lines):
            if y > ymax:
                return
            xx = x + (first_indent if pi == 0 and li == 0 else 0)
            d.text((xx, y), ln, font=fnt, fill=INK)
            y += leading
        y += int(leading * 0.55)

def fade_bottom(im, bg, height=110):
    grad = Image.new("L", (1, height))
    for i in range(height):
        grad.putpixel((0, i), int(255 * (i / height) ** 1.6))
    grad = grad.resize((SS, height))
    solid = Image.new("RGB", (SS, height), bg)
    im.paste(solid, (0, SS - height), grad)

# ---------------- text parsing ----------------

HDR_KEYS = ("Citation:", "Creator:", "Year:", "Source-URL:", "Context:")

def parse_text(aid):
    p = os.path.join(A2, "texts", aid + ".txt")
    raw = open(p, encoding="utf-8", errors="replace").read()
    lines = raw.split("\n")
    hdr = {}
    body_start = 0
    # catalog header occupies the first lines when Citation:/Creator: present
    head = "\n".join(lines[:8])
    if "Citation:" in head or "Source-URL:" in head:
        for i, ln in enumerate(lines[:10]):
            for k in HDR_KEYS:
                if ln.startswith(k):
                    hdr[k[:-1]] = ln[len(k):].strip()
            body_start = i + 1
        while body_start < len(lines) and not lines[body_start].strip():
            body_start += 1
    body = "\n".join(lines[body_start:])
    return hdr, body

DROP_LINE = re.compile(r"^\s*(\[Pages? [^\]]*\]|\[FR Doc[^\]]*\]|From the Federal Register Online.*|-{10,}|={10,}|\s*)$")

def paragraphs(body, skip_markers=()):
    out = []
    for chunk in re.split(r"\n\s*\n", body):
        c = " ".join(ln.strip() for ln in chunk.split("\n") if not DROP_LINE.match(ln))
        c = re.sub(r"\s+", " ", c).strip()
        if len(c) < 2:
            continue
        if any(m in c[:60] for m in skip_markers):
            continue
        out.append(c)
    return out

def clean_title(e):
    t = (e.get("title") or "Untitled").strip()
    return t

# ---------------- family renderers ----------------

def r_fr(e, hdr, body):
    aid = e["artifact_id"]
    im, bg = paper(aid); d = ImageDraw.Draw(im)
    cx = SS // 2; M = 40; W = SS - 2 * M
    y = 30
    f = F(SERIF_B, 25)
    centered(d, cx, y, "FEDERAL REGISTER", f); y += 40
    rule(d, M, SS - M, y, wdt=3); y += 6
    rule(d, M, SS - M, y, wdt=1); y += 16
    paras = paragraphs(body)
    # the document's own heading block: dept / agency caps lines lead the text
    head_lines = []
    for p in paras[:2]:
        head_lines.append(p)
    title = clean_title(e)
    creator = (e.get("creator") or "").replace(";", " · ")
    if creator:
        f2 = F(SERIF_B, 17)
        _, lns, _ = fit_lines(d, creator.upper(), SERIF_B, 17, 12, W, 2)
        for ln in lns:
            centered(d, cx, y, ln, f2); y += 22
        y += 8
    tf, tlines, _ = fit_lines(d, title, SERIF_B, 30, 17, W, 3)
    for ln in tlines:
        centered(d, cx, y, ln, tf); y += int(tf.size * 1.18)
    y += 6
    rule(d, cx - 30, cx + 30, y, wdt=2); y += 14
    body_flow(d, paras, M, y, W, F(SERIF, 16), 21, SS - 60)
    fade_bottom(im, bg)
    return im

def r_code(e, hdr, body, code_name):
    aid = e["artifact_id"]
    im, bg = paper(aid); d = ImageDraw.Draw(im)
    cx = SS // 2; M = 40; W = SS - 2 * M
    y = 30
    centered(d, cx, y, code_name, F(SERIF_B, 19)); y += 30
    rule(d, M, SS - M, y, wdt=2); y += 18
    title = clean_title(e)
    tf, tlines, _ = fit_lines(d, title, SERIF_B, 32, 18, W, 3)
    for ln in tlines:
        centered(d, cx, y, ln, tf); y += int(tf.size * 1.2)
    y += 8
    creator = (e.get("creator") or "").strip()
    if creator:
        _, lns, _ = fit_lines(d, creator, SERIF_I, 16, 12, W, 2)
        for ln in lns:
            centered(d, cx, y, ln, F(SERIF_I, 16)); y += 20
        y += 6
    rule(d, cx - 30, cx + 30, y, wdt=2); y += 14
    body_flow(d, paragraphs(body), M, y, W, F(SERIF, 16), 21, SS - 60)
    fade_bottom(im, bg)
    return im

def r_journal(e, hdr, body):
    aid = e["artifact_id"]
    im, bg = paper(aid); d = ImageDraw.Draw(im)
    M = 40; W = SS - 2 * M
    y = 26
    # journal line from the article's own head matter when present
    raw = open(os.path.join(A2, "texts", aid + ".txt"), encoding="utf-8", errors="replace").read()
    jline = ""
    m = re.search(r"Published in:\s*(.+)", raw) or re.search(r"Published:\s*\d{4},\s*(.+)", raw)
    if m:
        jline = m.group(1).strip()
    elif hdr.get("Context"):
        jline = hdr["Context"].split(".")[0]
    if jline:
        centered(d, SS // 2, y, jline.upper()[:64], F(SANS_B, 14)); y += 24
    rule(d, M, SS - M, y, wdt=3); y += 14
    title = clean_title(e)
    tf, tlines, _ = fit_lines(d, title, SERIF_B, 30, 17, W, 3)
    for ln in tlines:
        d.text((M, y), ln, font=tf, fill=INK); y += int(tf.size * 1.18)
    y += 4
    creator = (e.get("creator") or "").strip().rstrip(".")
    if creator:
        _, lns, _ = fit_lines(d, creator, SERIF_I, 16, 12, W, 2)
        for ln in lns:
            d.text((M, y), ln, font=F(SERIF_I, 16), fill=INK); y += 20
        y += 8
    paras = paragraphs(body)
    # abstract block: the article's own abstract, shaded like a journal page
    abs_idx = None
    for i, p in enumerate(paras):
        if p.strip().upper().startswith("ABSTRACT"):
            abs_idx = i; break
    rest = paras
    if abs_idx is not None:
        atext = re.sub(r"^ABSTRACT\s*", "", paras[abs_idx], flags=re.I)
        box_h = min(150, SS - y - 90)
        d.rectangle([M, y, SS - M, y + box_h], fill=tuple(max(0, v - 14) for v in bg))
        d.text((M + 10, y + 8), "Abstract", font=F(SERIF_B, 15), fill=INK)
        body_flow(d, [atext], M + 10, y + 30, W - 20, F(SERIF, 14), 18, y + box_h - 6)
        y += box_h + 12
        rest = paras[abs_idx + 1:]
    body_flow(d, rest, M, y, W, F(SERIF, 16), 21, SS - 60)
    fade_bottom(im, bg)
    return im

ENC_SOURCES = {
    "britannica-1911": "ENCYCLOPÆDIA BRITANNICA · 1911",
    "catholic-encyclopedia": "THE CATHOLIC ENCYCLOPEDIA · 1913",
    "jewish-encyclopedia": "THE JEWISH ENCYCLOPEDIA · 1906",
}

def r_encyclopedia(e, hdr, body):
    aid = e["artifact_id"]
    im, bg = paper(aid); d = ImageDraw.Draw(im)
    M = 36; W = SS - 2 * M
    src = next((v for k, v in ENC_SOURCES.items() if aid.startswith(k)), "ENCYCLOPEDIA")
    y = 28
    centered(d, SS // 2, y, src, F(SERIF_B, 15)); y += 26
    rule(d, M, SS - M, y, wdt=2); y += 16
    head = re.sub(r"\s*\((1911 Encyclopaedia Britannica|Catholic Encyclopedia|Jewish Encyclopedia)[^)]*\)\s*$", "", clean_title(e)).strip()
    tf, tlines, _ = fit_lines(d, head.upper(), SERIF_B, 34, 18, W, 3)
    for ln in tlines:
        d.text((M, y), ln, font=tf, fill=INK); y += int(tf.size * 1.15)
    y += 10
    paras = paragraphs(body)
    # two-column encyclopedia body with a drop initial
    colw = (W - 18) // 2
    fnt = F(SERIF, 14)
    if paras:
        first = paras[0]
        if len(first) > 1:
            d.text((M, y), first[0], font=F(SERIF_B, 44), fill=INK)
            sub = first[1:]
            lines = wrap(d, sub, fnt, colw - 40)
            yy = y + 4
            for ln in lines[:3]:
                d.text((M + 40, yy), ln, font=fnt, fill=INK); yy += 18
            rem = " ".join(lines[3:])
            allp = ([rem] if rem else []) + paras[1:]
        else:
            allp = paras
    else:
        allp = []
    # left column then right column
    col_y = [y, y]
    col_x = [M, M + colw + 18]
    col = 0
    top = y + 58 if paras else y
    col_y = [top, y]
    for p in allp:
        if col > 1:
            break
        lines = wrap(d, p, fnt, colw)
        for ln in lines:
            if col_y[col] > SS - 56:
                col += 1
                if col > 1:
                    break
            d.text((col_x[col], col_y[col]), ln, font=fnt, fill=INK)
            col_y[col] += 18
        if col <= 1:
            col_y[col] += 8
    fade_bottom(im, bg)
    return im

def r_titlepage(e, hdr, body, kicker=None, max_title_lines=4):
    aid = e["artifact_id"]
    im, bg = paper(aid); d = ImageDraw.Draw(im)
    cx = SS // 2; M = 44; W = SS - 2 * M
    y = 40
    if kicker:
        centered(d, cx, y, kicker, F(SERIF_B, 15)); y += 30
    rule(d, M, SS - M, y, wdt=1); y += 5
    rule(d, M, SS - M, y, wdt=3); y += 30
    title = clean_title(e)
    tf, tlines, _ = fit_lines(d, title, SERIF_B, 36, 19, W, max_title_lines)
    for ln in tlines:
        centered(d, cx, y, ln, tf); y += int(tf.size * 1.22)
    y += 14
    creator = (e.get("creator") or "").strip()
    meta = creator
    yr = e.get("year")
    if yr:
        meta = (meta + " · " if meta else "") + str(yr)
    if meta:
        _, lns, _ = fit_lines(d, meta, SERIF, 17, 12, W, 2)
        for ln in lns:
            centered(d, cx, y, ln, F(SERIF, 17)); y += 22
    y += 10
    rule(d, M, SS - M, y, wdt=3); y += 5
    rule(d, M, SS - M, y, wdt=1); y += 22
    body_flow(d, paragraphs(body), M, y, W, F(SERIF, 16), 21, SS - 60)
    fade_bottom(im, bg)
    return im

def r_frus(e, hdr, body):
    aid = e["artifact_id"]
    im, bg = paper(aid); d = ImageDraw.Draw(im)
    M = 42; W = SS - 2 * M; cx = SS // 2
    y = 30
    centered(d, cx, y, "FOREIGN RELATIONS OF THE UNITED STATES", F(SERIF_B, 14)); y += 26
    rule(d, M, SS - M, y, wdt=2); y += 18
    title = clean_title(e)
    tf, tlines, _ = fit_lines(d, title, SERIF_B, 24, 15, W, 4)
    for ln in tlines:
        d.text((M, y), ln, font=tf, fill=INK); y += int(tf.size * 1.2)
    y += 12
    body_flow(d, paragraphs(body), M, y, W, F(SERIF, 16), 21, SS - 60, first_indent=18)
    fade_bottom(im, bg)
    return im

def r_un(e, hdr, body):
    aid = e["artifact_id"]
    organ = "SECURITY COUNCIL" if "-sc-" in aid else "GENERAL ASSEMBLY"
    im, bg = paper(aid); d = ImageDraw.Draw(im)
    M = 42; W = SS - 2 * M; cx = SS // 2
    y = 32
    centered(d, cx, y, "UNITED NATIONS", F(SERIF_B, 24)); y += 34
    centered(d, cx, y, organ, F(SERIF, 15)); y += 28
    rule(d, M, SS - M, y, wdt=2); y += 18
    title = clean_title(e)
    tf, tlines, _ = fit_lines(d, title, SERIF_B, 27, 16, W, 3)
    for ln in tlines:
        centered(d, cx, y, ln, tf); y += int(tf.size * 1.2)
    y += 14
    body_flow(d, paragraphs(body), M, y, W, F(SERIF, 16), 21, SS - 60)
    fade_bottom(im, bg)
    return im

def r_agency(e, hdr, body):
    """GAO / FBI / misc govdoc fallback: agency letterhead page."""
    aid = e["artifact_id"]
    im, bg = paper(aid); d = ImageDraw.Draw(im)
    M = 42; W = SS - 2 * M; cx = SS // 2
    y = 30
    creator = (e.get("creator") or "").strip()
    if creator and creator.lower() != "unknown":
        _, lns, _ = fit_lines(d, creator.upper(), SANS_B, 16, 11, W, 2)
        for ln in lns:
            centered(d, cx, y, ln, F(SANS_B, 16)); y += 21
        y += 4
    rule(d, M, SS - M, y, fill=(30, 60, 120), wdt=4); y += 18
    title = clean_title(e)
    tf, tlines, _ = fit_lines(d, title, SERIF_B, 28, 16, W, 4)
    for ln in tlines:
        d.text((M, y), ln, font=tf, fill=INK); y += int(tf.size * 1.2)
    y += 12
    body_flow(d, paragraphs(body), M, y, W, F(SERIF, 16), 21, SS - 60)
    fade_bottom(im, bg)
    return im

def r_book_titlepage(e, hdr, body):
    # Gutenberg texts: drop everything up to the START marker and all
    # production-credit paragraphs; the book's own title page is in the text.
    m = re.search(r"\*\*\* START OF.*?\n", body)
    if m:
        body = body[m.end():]
    paras = paragraphs(body, skip_markers=(
        "Project Gutenberg", "Produced by", "gutenberg.org", "Transcriber",
        "Online Distributed Proofreading", "Proofreading Team"))
    e2 = dict(e)
    creator = (e.get("creator") or "").strip()
    if not creator or creator.lower() == "unknown":
        m2 = re.search(r"(?im)^\s*by\s*\n?\s*([A-Z][A-Za-z][A-Za-z .']{2,40})\s*$", body[:2500])
        if m2 and len(m2.group(1).split()) <= 4:
            e2["creator"] = m2.group(1).strip().title()
    return r_titlepage(e2, hdr, "\n\n".join(paras), max_title_lines=5)

# ---------------- PDF first page ----------------

def pdf_cell(aid):
    pdf = os.path.join(A2, "pdfs", aid + ".pdf")
    if not os.path.exists(pdf):
        return None
    outbase = os.path.join(A2, "pages", aid)
    r = subprocess.run(["pdftoppm", "-png", "-f", "1", "-l", "1",
                        "-scale-to-x", str(SS), "-scale-to-y", "-1",
                        pdf, outbase], capture_output=True)
    pngs = [f for f in os.listdir(os.path.join(A2, "pages")) if f.startswith(aid) and f.endswith(".png")]
    if not pngs:
        return None
    im = Image.open(os.path.join(A2, "pages", pngs[0])).convert("RGB")
    if im.width != SS:
        im = im.resize((SS, round(im.height * SS / im.width)), Image.LANCZOS)
    if aid.startswith("plaw-"):
        # Statutes-at-Large first page is a sparse title page (small header,
        # act title mid-page, wide margins): crop the title band tightly
        # and center it, or the tile reads as a blank page.
        band = im.crop((int(SS * 0.09), int(im.height * 0.05),
                        int(SS * 0.91), int(im.height * 0.60)))
        band = band.resize((SS, round(band.height * SS / band.width)), Image.LANCZOS)
        canvas = Image.new("RGB", (SS, SS), (252, 252, 250))
        canvas.paste(band, (0, max(0, (SS - band.height) // 2)))
        return canvas
    if im.height >= SS:
        im = im.crop((0, 0, SS, SS))
    else:
        canvas = Image.new("RGB", (SS, SS), (250, 250, 248))
        canvas.paste(im, (0, 0))
        im = canvas
    return im

# ---------------- dispatch ----------------

def family(e):
    aid, coll = e["artifact_id"], e["collection"]
    if coll == "LAW":
        if aid.startswith("uslaw-fr-"): return "fr"
        if aid.startswith("uslaw-cfr-"): return "cfr"
        return "usc"
    if coll == "PAPERS": return "journal"
    if coll == "REFERENCE": return "encyclopedia"
    if coll == "DECLASSIFIED":
        if aid.startswith("frus-"): return "frus"
        if aid.startswith("un-"): return "un"
        return "agency"
    if coll == "DOCUMENTS": return "titlepage"
    if coll == "BOOKS": return "book"
    return "agency"

RENDER = {
    "fr": r_fr, "journal": r_journal, "encyclopedia": r_encyclopedia,
    "frus": r_frus, "un": r_un, "agency": r_agency,
}

def build(e):
    aid = e["artifact_id"]
    fam = family(e)
    cell = pdf_cell(aid)
    if cell is not None:
        src = pdf_source(e)
        return cell, "pdf-first-page", src
    hdr, body = parse_text(aid)
    if fam == "cfr":
        t = re.search(r"(\d+)\s*C\.F\.R\.", clean_title(e)) or re.search(r"Title (\d+)", clean_title(e))
        im = r_code(e, hdr, body, "CODE OF FEDERAL REGULATIONS" + (f" · TITLE {t.group(1)}" if t else ""))
    elif fam == "usc":
        t = re.search(r"^(\d+) U\.S\.C\.", clean_title(e))
        im = r_code(e, hdr, body, "UNITED STATES CODE" + (f" · TITLE {t.group(1)}" if t else ""))
    elif fam == "titlepage":
        im = r_titlepage(e, hdr, body)
    elif fam == "book":
        im = r_book_titlepage(e, hdr, body)
    else:
        im = RENDER[fam](e, hdr, body)
    return im, "text-first-page", f"first-page render typeset from the entry's hosted full text ({fam} page idiom)"

def pdf_source(e):
    aid = e["artifact_id"]
    if aid.startswith("arxiv-"):
        num = aid[6:]
        return f"first page of the arXiv PDF (arXiv:{num[:4]}.{num[5:]})"
    if aid.startswith("uslaw-fr-"):
        return f"first page of the official Federal Register PDF via govinfo (doc {aid[9:]})"
    if aid.startswith("plaw-"):
        m = re.match(r"plaw-(\d+)-(\d+)-", aid)
        return f"first page of the govinfo Public Law PDF (PLAW-{m.group(1)}publ{m.group(2)})"
    if aid.startswith("gao-"):
        return "first page (cover) of the GAO report PDF (gao.gov)"
    return "first page of the source PDF"

def main():
    plates = json.load(open(os.path.join(A2, "plates.json")))
    only = sys.argv[1:] or None
    manifest = []
    for e in plates:
        aid = e["artifact_id"]
        if only and aid not in only:
            continue
        try:
            im, kind, src = build(e)
        except Exception as ex:
            print("ERROR", aid, repr(ex)); continue
        im = im.resize((CELL, CELL), Image.LANCZOS)
        im.save(os.path.join(A2, "cells", aid + ".png"))
        manifest.append({"artifact_id": aid, "collection": e["collection"],
                         "kind": kind, "source": src})
        print("cell", aid, kind)
    prev = []
    mp = os.path.join(A2, "cells-manifest.json")
    if os.path.exists(mp):
        prev = json.load(open(mp))
    have = {m["artifact_id"] for m in manifest}
    manifest = manifest + [m for m in prev if m["artifact_id"] not in have]
    json.dump(manifest, open(mp, "w"), indent=1)
    from collections import Counter
    print(Counter((m["collection"], m["kind"]) for m in manifest))

if __name__ == "__main__":
    main()
