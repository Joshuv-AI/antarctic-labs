#!/bin/bash
# fetch hosted texts for plate entries; skip existing
cd ~/workspace/antarctic-labs-work/truerep-run/atlas2
python3 -c "
import json
plates = json.load(open('plates.json'))
for e in plates: print(e['artifact_id'])
" > ids.txt
fetch_one() {
  id="$1"
  out="texts/$id.txt"
  [ -s "$out" ] && return 0
  for i in 1 2 3; do
    curl -s --max-time 40 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0" \
      "https://antarctic-labs.com/tower-of-babel/$id.txt" -o "$out.tmp" && \
      grep -q "Tower of Babel" "$out.tmp" 2>/dev/null; \
    if [ -s "$out.tmp" ] && ! head -c 200 "$out.tmp" | grep -qi "<!doctype\|<html"; then
      mv "$out.tmp" "$out"; return 0
    fi
    sleep 2
  done
  echo "FAIL $id" >> fetch-failures.log
  rm -f "$out.tmp"
}
export -f fetch_one
xargs -a ids.txt -P 4 -I{} bash -c 'fetch_one "$@"' _ {}
echo "texts fetched: $(ls texts/ | wc -l) / $(wc -l < ids.txt)"
