#!/usr/bin/env python3
"""Fetch canonical source PDFs for plate entries (arXiv / FR / PLAW / GAO)."""
import json, os, re, subprocess, sys, time

A2 = os.path.dirname(os.path.abspath(__file__))
PDFS = os.path.join(A2, "pdfs")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0"

def curl(url, out, timeout=90):
    if os.path.exists(out) and os.path.getsize(out) > 3000:
        return True
    for attempt in range(3):
        r = subprocess.run(["curl", "-sL", "--max-time", str(timeout), "-A", UA,
                            url, "-o", out + ".tmp"], capture_output=True)
        if os.path.exists(out + ".tmp") and os.path.getsize(out + ".tmp") > 3000:
            with open(out + ".tmp", "rb") as f:
                magic = f.read(5)
            if magic.startswith(b"%PDF"):
                os.rename(out + ".tmp", out)
                return True
        time.sleep(2)
    if os.path.exists(out + ".tmp"):
        os.remove(out + ".tmp")
    return False

def main():
    plates = json.load(open(os.path.join(A2, "plates.json")))
    log = open(os.path.join(A2, "pdf-fetch.log"), "a")
    def note(msg):
        print(msg, flush=True); log.write(msg + "\n"); log.flush()
    for e in plates:
        aid = e["artifact_id"]
        out = os.path.join(PDFS, aid + ".pdf")
        if os.path.exists(out):
            continue
        ok, how = False, ""
        if aid.startswith("arxiv-"):
            num = aid[len("arxiv-"):]
            arxiv_id = num[:4] + "." + num[5:]
            ok = curl(f"https://arxiv.org/pdf/{arxiv_id}", out)
            how = f"arxiv {arxiv_id}"
        elif aid.startswith("uslaw-fr-"):
            docnum = aid[len("uslaw-fr-"):]
            api = f"https://www.federalregister.gov/api/v1/documents/{docnum}.json?fields%5B%5D=pdf_url"
            r = subprocess.run(["curl", "-s", "--max-time", "30", api], capture_output=True, text=True)
            try:
                pdf_url = json.loads(r.stdout).get("pdf_url")
            except Exception:
                pdf_url = None
            if pdf_url:
                ok = curl(pdf_url, out)
                how = f"FR api {docnum} -> {pdf_url}"
            else:
                how = f"FR api {docnum} -> no pdf_url ({r.stdout[:80]})"
        elif aid.startswith("plaw-"):
            m = re.match(r"plaw-(\d+)-(\d+)-", aid)
            if m:
                pkg = f"PLAW-{m.group(1)}publ{m.group(2)}"
                ok = curl(f"https://www.govinfo.gov/content/pkg/{pkg}/pdf/{pkg}.pdf", out)
                how = f"govinfo {pkg}"
        elif aid.startswith("gao-gaoreports-"):
            gid = aid[len("gao-gaoreports-"):]
            for pat in (f"https://www.gao.gov/assets/{gid}.pdf",
                        f"https://www.gao.gov/assets/720/{gid}.pdf"):
                if curl(pat, out):
                    ok, how = True, f"gao {pat}"
                    break
            how = how or f"gao {gid} no pattern hit"
        else:
            continue
        note(f"{'OK ' if ok else 'MISS'} {aid} [{how}]")
    note("done")

if __name__ == "__main__":
    main()
