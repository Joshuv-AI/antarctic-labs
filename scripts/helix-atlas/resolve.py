#!/usr/bin/env python3
"""Resolve full records for the sample (from entry-records buckets),
apply tower-covers.js's deterministic cover rules, download real covers.
Output: sample-resolved.json + covers/<artifact_id>.img (validated images).
Mirrors coverCandidates() in src/lib/tower-covers.js:
  1. YouTube thumb (source_url v= or podcast- id)
  2. Gutenberg cover (ebook number from source_url / source)
  3. Internet Archive image (identifier from source_url)
"""
import json, os, re, subprocess
from PIL import Image

RUN = os.path.dirname(os.path.abspath(__file__))
WT = os.environ.get("WT", os.path.expanduser("~/workspace/antarctic-labs-work/work-truerep"))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

def fnv_key(aid):
    h = 0x811C9DC5
    for ch in aid:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    n = h % 46656
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    s = ""
    x = n
    if x == 0:
        s = "0"
    while x:
        s = digits[x % 36] + s
        x //= 36
    return s.rjust(3, "0")

def candidates(rec):
    urls = []
    aid = rec.get("artifact_id") or ""
    su = rec.get("source_url") or ""
    vid = None
    m = re.search(r"[?&]v=([\w-]{11})", su)
    if m:
        vid = m.group(1)
    elif aid.startswith("podcast-"):
        pm = re.match(r"^podcast-[a-z0-9]+-(.+)$", aid)
        if pm and len(pm.group(1)) >= 10:
            vid = pm.group(1)
    if vid:
        urls.append("https://i.ytimg.com/vi/" + vid + "/hqdefault.jpg")
    pg = None
    gm = re.search(r"gutenberg\.org/(?:cache/epub|ebooks|files)/(\d+)", su) or \
        re.search(r"project gutenberg #(\d+)", rec.get("source") or "", re.I)
    if gm:
        pg = gm.group(1)
    if pg:
        urls.append("https://www.gutenberg.org/cache/epub/" + pg + "/pg" + pg + ".cover.medium.jpg")
    im = re.search(r"archive\.org/(?:details|download|stream)/([\w.-]+)", su)
    if im:
        urls.append("https://archive.org/services/img/" + im.group(1))
    return urls

def main():
    sample = json.load(open(os.path.join(RUN, "sample-raw.json")))
    buckets = {}
    need = sorted({fnv_key(s["artifact_id"]) for s in sample})
    missing = 0
    for b in need:
        p = os.path.join(WT, "public/entry-records", b + ".json")
        if not os.path.exists(p):
            missing += 1
            continue
        data = json.load(open(p))
        if isinstance(data, dict):
            recs = list(data.values())
        elif isinstance(data, list):
            recs = data
        else:
            recs = []
        for r in recs:
            buckets[r.get("artifact_id")] = r
    print("buckets needed:", len(need), "missing:", missing)
    os.makedirs(os.path.join(RUN, "covers"), exist_ok=True)
    out = []
    stats = {}
    for s in sample:
        rec = buckets.get(s["artifact_id"])
        entry = dict(s)
        entry["full_record_found"] = rec is not None
        cands = candidates(rec) if rec else []
        entry["cover_candidates"] = cands
        got = None
        for url in cands:
            dest = os.path.join(RUN, "covers", s["artifact_id"] + ".img")
            if not os.path.exists(dest):
                subprocess.run(["curl", "-sL", "--max-time", "12", "--max-filesize", "3000000",
                                "-A", UA, "-o", dest, url], capture_output=True)
            if os.path.exists(dest):
                try:
                    im = Image.open(dest)
                    im.verify()
                    im = Image.open(dest)
                    if im.width >= 100 and im.height >= 100:
                        got = url
                    else:
                        os.remove(dest)
                except Exception:
                    if os.path.exists(dest):
                        os.remove(dest)
            if got:
                break
        entry["cover_url"] = got
        entry["kind"] = "cover" if got else "plate"
        key = (s["collection"], entry["kind"])
        stats[key] = stats.get(key, 0) + 1
        out.append(entry)
    json.dump(out, open(os.path.join(RUN, "sample-resolved.json"), "w"), indent=1)
    for k in sorted(stats):
        print(k, stats[k])
    print("resolved:", len(out), "covers:", sum(1 for e in out if e["kind"] == "cover"))

if __name__ == "__main__":
    main()
