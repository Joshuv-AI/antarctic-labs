#!/usr/bin/env python3
"""Deterministic per-collection sample from the compact catalog index.
Sorted artifact_ids per collection, fixed stride, seeded start offset.
Output: sample-raw.json [{artifact_id,title,creator,year,collection}]
and buckets.txt (entry-records bucket filenames needed for full records).
"""
import json, glob, hashlib, sys, os
WT = os.environ.get("WT", os.path.expanduser("~/workspace/antarctic-labs-work/work-truerep"))
RUN = os.path.dirname(os.path.abspath(__file__))

CELLS = {"LAW": 64, "PAPERS": 64, "BOOKS": 40, "REFERENCE": 28,
         "DECLASSIFIED": 24, "PODCASTS": 20, "DOCUMENTS": 16}

def fnv_key(aid):
    h = 0x811C9DC5
    for ch in aid:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    n = h % 46656
    # base36 pad 3
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    s = ""
    x = n
    if x == 0: s = "0"
    while x:
        s = digits[x % 36] + s
        x //= 36
    return s.rjust(3, "0")

def main():
    by_coll = {}
    files = sorted(glob.glob(os.path.join(RUN, "index-shards/catalog-index-*.json")))
    assert len(files) == 10, files
    total = 0
    for f in files:
        data = json.load(open(f))
        recs = data if isinstance(data, list) else data.get("records", [])
        for r in recs:
            total += 1
            c = r.get("collection") or ""
            if c in CELLS:
                by_coll.setdefault(c, []).append(
                    (r["artifact_id"], r.get("title") or "", r.get("creator") or "", r.get("year") or ""))
        del data, recs
    print("index records:", total)
    sample = []
    for coll, k in CELLS.items():
        recs = sorted(by_coll.get(coll, []), key=lambda t: t[0])
        n = len(recs)
        seed = int(hashlib.md5(("truerep-" + coll).encode()).hexdigest()[:8], 16)
        start = seed % max(1, n // max(1, k))
        stride = n / k
        picked = []
        seen = set()
        for i in range(k):
            idx = int(start + i * stride) % n
            while idx in seen:  # stride rounding collision guard
                idx = (idx + 1) % n
            seen.add(idx)
            picked.append(recs[idx])
        print(f"{coll}: population {n}, sampled {len(picked)}")
        for t in picked:
            sample.append({
                "artifact_id": t[0],
                "title": t[1],
                "creator": t[2],
                "year": t[3],
                "collection": coll,
            })
    json.dump(sample, open(os.path.join(RUN, "sample-raw.json"), "w"), indent=1)
    buckets = sorted({fnv_key(s["artifact_id"]) for s in sample})
    open(os.path.join(RUN, "buckets.txt"), "w").write("\n".join(buckets) + "\n")
    print("sample total:", len(sample), "unique buckets:", len(buckets))

if __name__ == "__main__":
    main()
