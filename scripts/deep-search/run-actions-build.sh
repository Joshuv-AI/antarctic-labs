#!/bin/bash
# GitHub Actions build for the Tower of Babel deep-search index (R2 route).
#
# Adapted from the proven VM chunked driver (deep-search-fix/chunked-driver.sh)
# with three runner-specific changes, all marked below:
#  (a) No seed cache and no VM paths: work lives under $WORK, catalog comes
#      from the sparse checkout, texts come straight from raw.githubusercontent
#      (the runner has direct internet; no VM egress proxy is involved).
#  (b) 8 parallel fetch streams (runner bandwidth, not the saturated proxy).
#  (c) Gzipped chunk temps + per-shard merge/upload/delete: a standard
#      runner (~14 GiB free) cannot hold ~21 GiB of chunk temps plus the
#      ~8 GiB final index at once, so each finished shard is uploaded to R2
#      and deleted locally immediately; the runner never holds the full
#      final index on disk.
#  (d) Verified chunk outputs are checkpointed to R2 as they complete.
#      Final shards cannot be computed until compute-bases has seen every
#      chunk, so a six-hour timeout otherwise discards all indexing work.
#      A later dispatch for the same texts HEAD + catalog fingerprint
#      restores and hash-verifies checkpointed chunks, then reuses the
#      existing DONE skip. The manifest is uploaded last for each chunk.
#  (e) 2026-10-29 parallel + pinned operation (workflow v2): TEXTS_HEAD may
#      be pinned by the caller (the workflow's pin job resolves it once);
#      texts are then fetched from that exact commit, never from the
#      moving main branch, so a mid-build texts push cannot drift the
#      corpus or orphan checkpoints. MODE=chunks runs only this leg's
#      stride of chunks (CHUNK_OFFSET/CHUNK_STRIDE) and exits after
#      checkpointing; MODE=finish restores every chunk checkpoint (dying
#      loudly on any missing chunk) and runs the merge + manifest
#      publish; MODE=all (default) keeps the original single-job flow.
#
# Load-bearing invariants carried over unchanged:
#  I1. Per-chunk catalog isolation: stream-index.mjs writes DONE for every
#      catalog entry it is given, so each chunk is indexed ONLY from a
#      catalog dir containing that chunk's entries (build-chunk-catalog.mjs).
#  I2. Texts are deleted ONLY after stream-index exit 0 AND verify-chunk
#      passes AND the chunk output is renamed into shared index-tmp.
#  I3. Fetch failure is not silently indexed as "missing": non-404 leftovers
#      abort the chunk; >5% legit-missing (404) aborts (snapshot drift).
#
# Required env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (repo secrets),
# R2_BUCKET (default tower-search-index). Required tools: node, curl, gzip,
# git (ls-remote only), wrangler (via npx, pinned below).
# Outputs: R2 keys manifest.json, <buildId>/terms/<0..255>.json,
# build-log-<buildId>.json. Prints a JSON summary on stdout at the end.
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="${WORK:-$PWD/.search-build}"
CATALOG="${CATALOG_DIR:-$PWD/public/catalog-shards}"
BUCKET="${R2_BUCKET:-tower-search-index}"
# BASE is defined after TEXTS_HEAD is resolved below: texts are fetched
# from the pinned commit, never from the moving main branch.
CHUNK_SIZE=10000
MODE="${MODE:-all}"
case "$MODE" in all|chunks|finish) ;; *) echo "MODE must be all|chunks|finish" >&2; exit 1;; esac
CHUNK_OFFSET="${CHUNK_OFFSET:-0}"
CHUNK_STRIDE="${CHUNK_STRIDE:-1}"
WRANGLER="${WRANGLER:-npx -y wrangler@4.152.0}"
mkdir -p "$WORK"
LOG="$WORK/build.log"
SHARED_TMP="$WORK/index-tmp"
OUT="$WORK/search-index-data"
mkdir -p "$SHARED_TMP" "$OUT"
log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$LOG"; }
free_gb_int() { df -k "$WORK" | tail -1 | awk '{print int($4/1048576)}'; }
die() { log "FATAL: $*"; exit 1; }

[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || die "CLOUDFLARE_API_TOKEN is not set"
[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || die "CLOUDFLARE_ACCOUNT_ID is not set"
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

if [ -z "${TEXTS_HEAD:-}" ]; then
  TEXTS_HEAD="$(git ls-remote https://github.com/Joshuv-AI/antarctic-labs-texts.git HEAD | awk '{print $1}')"
fi
[ -n "$TEXTS_HEAD" ] || die "could not resolve texts repo HEAD"
BUILD_ID="${TEXTS_HEAD:0:12}"
[[ "$BUILD_ID" =~ ^[0-9a-f]{12}$ ]] || die "buildId '$BUILD_ID' is not 12 lowercase hex"
BASE="https://raw.githubusercontent.com/Joshuv-AI/antarctic-labs-texts/$TEXTS_HEAD/public/tower-of-babel"
SITE_HEAD="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
CATALOG_ID="$(cd "$CATALOG" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')" \
  || die "could not fingerprint catalog shards under $CATALOG"
[[ "$CATALOG_ID" =~ ^[0-9a-f]{64}$ ]] || die "catalog fingerprint '$CATALOG_ID' is not a sha256 hex digest"
log "=== ACTIONS BUILD START: textsHead=$TEXTS_HEAD buildId=$BUILD_ID siteHead=$SITE_HEAD catalogFingerprint=$CATALOG_ID bucket=$BUCKET ==="

# ---- R2 checkpoints for verified chunk outputs ----
checkpoint_prefix() {
  printf '%s/checkpoints/%s' "$BUILD_ID" "$CATALOG_ID"
}
checkpoint_manifest_key() {
  printf '%s/chunk-%03d/checkpoint.json' "$(checkpoint_prefix)" "$1"
}
checkpoint_object_key() {
  printf '%s/chunk-%03d/%s' "$(checkpoint_prefix)" "$1" "$2"
}
r2_put_retry() {
  local key=$1 file=$2 ctype=${3:-application/octet-stream} attempt err
  err="$WORK/.r2put.err"
  for attempt in 1 2 3; do
    # --remote is REQUIRED: wrangler 4 defaults r2 object commands to the
    # LOCAL simulator when no config binding says otherwise, so without it
    # every "upload" writes to throwaway local storage (run 2, 2026-10-27:
    # chunk 0's checkpoint never reached R2 and the run aborted).
    if $WRANGLER r2 object put "$BUCKET/$key" --file "$file" --content-type "$ctype" --remote >> "$LOG" 2> "$err"; then
      return 0
    fi
    cat "$err" >> "$LOG" 2>/dev/null
    log "checkpoint upload attempt $attempt failed: $key"
    # Surface the real wrangler error in the run log — it used to be
    # swallowed into $LOG, which never leaves the runner on failure.
    tail -3 "$err" 2>/dev/null | while IFS= read -r line; do log "  wrangler: $line"; done
    sleep $((attempt * 5))
  done
  return 1
}
r2_get_once() {
  local key=$1 dest=$2
  mkdir -p "$(dirname "$dest")"
  $WRANGLER r2 object get "$BUCKET/$key" --file "$dest" --remote >> "$LOG" 2>&1
}
write_checkpoint_manifest() {
  local dir=$1 out=$2 chunk=$3
  node - "$dir" "$out" "$BUILD_ID" "$CATALOG_ID" "$chunk" <<'NODE'
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const [dir, out, buildId, catalogId, chunk] = process.argv.slice(2);
const files = [];
(function walk(cur, base = '') {
  const entries = fs.readdirSync(cur, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const ent of entries) {
    const rel = base ? `${base}/${ent.name}` : ent.name;
    const full = path.join(cur, ent.name);
    if (ent.isDirectory()) walk(full, rel);
    else if (ent.isFile()) {
      const data = fs.readFileSync(full);
      files.push({
        path: rel,
        size: data.length,
        sha256: crypto.createHash('sha256').update(data).digest('hex'),
      });
    }
  }
})(dir);
fs.writeFileSync(out, JSON.stringify({
  buildId,
  catalogId,
  chunk: Number(chunk),
  files,
}, null, 2) + '\n');
NODE
}
upload_chunk_checkpoint() {
  local chunk=$1 nnn dir manifest rel count
  nnn=$(printf "%03d" "$chunk")
  dir="$SHARED_TMP/chunk-$nnn"
  [ -f "$dir/DONE" ] || return 1
  manifest="$WORK/checkpoint-$nnn.json"
  write_checkpoint_manifest "$dir" "$manifest" "$chunk" || return 1
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    r2_put_retry "$(checkpoint_object_key "$chunk" "$rel")" "$dir/$rel" application/octet-stream || return 1
  done < <(node -e "const m=require(process.argv[1]); for (const f of m.files) console.log(f.path)" "$manifest")
  # The manifest is the commit point: it is uploaded only after every file.
  r2_put_retry "$(checkpoint_manifest_key "$chunk")" "$manifest" application/json || return 1
  count=$(node -e "console.log(require(process.argv[1]).files.length)" "$manifest")
  log "chunk $chunk ($nnn): checkpoint uploaded ($count files)"
}
restore_chunk_checkpoint() {
  local chunk=$1 nnn dir manifest tsv rel size sha dest actual_size actual_sha
  nnn=$(printf "%03d" "$chunk")
  dir="$SHARED_TMP/chunk-$nnn"
  [ -f "$dir/DONE" ] && return 0
  manifest="$WORK/restore-checkpoint-$nnn.json"
  tsv="$WORK/restore-checkpoint-$nnn.tsv"
  rm -f "$manifest" "$tsv"
  r2_get_once "$(checkpoint_manifest_key "$chunk")" "$manifest" || return 1
  if ! node - "$manifest" "$tsv" "$BUILD_ID" "$CATALOG_ID" "$chunk" <<'NODE'; then
const fs = require('fs');
const [manifest, tsv, buildId, catalogId, chunk] = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
if (m.buildId !== buildId || m.catalogId !== catalogId ||
    Number(m.chunk) !== Number(chunk) || !Array.isArray(m.files)) {
  process.exit(1);
}
const lines = m.files.map(f => `${f.path}\t${f.size}\t${f.sha256}`);
fs.writeFileSync(tsv, lines.join('\n') + (lines.length ? '\n' : ''));
NODE
    return 1
  fi
  rm -rf "$dir"
  mkdir -p "$dir"
  # Parallel download, 8 at a time (2026-10-29): the serial per-file
  # wrangler loop costs ~7 min per chunk, which puts a 61-chunk restore
  # past the 6-hour job cap. Downloads are independent; integrity is
  # enforced by the verify pass below, so a failed or partial download
  # still fails the restore exactly as before.
  local inflight=0
  while IFS=$'\t' read -r rel size sha; do
    [ -n "$rel" ] || continue
    dest="$dir/$rel"
    mkdir -p "$(dirname "$dest")"
    ( r2_get_once "$(checkpoint_object_key "$chunk" "$rel")" "$dest" ) &
    inflight=$((inflight + 1))
    if [ "$inflight" -ge 8 ]; then wait; inflight=0; fi
  done < "$tsv"
  wait
  while IFS=$'\t' read -r rel size sha; do
    [ -n "$rel" ] || continue
    dest="$dir/$rel"
    if [ ! -f "$dest" ]; then
      rm -rf "$dir"
      return 1
    fi
    actual_size=$(stat -c%s "$dest")
    actual_sha=$(sha256sum "$dest" | awk '{print $1}')
    if [ "$actual_size" != "$size" ] || [ "$actual_sha" != "$sha" ]; then
      rm -rf "$dir"
      return 1
    fi
  done < "$tsv"
  if [ ! -f "$dir/DONE" ]; then
    rm -rf "$dir"
    return 1
  fi
  log "chunk $chunk ($nnn): checkpoint restored and hash-verified"
}

# ---- fetch one chunk (8 streams, batched curl -K; globals FETCH_LEGIT/FAILED) ----
fetch_chunk() {
  local list=$1 staging=$2
  mkdir -p "$staging"
  local total pass missing
  total=$(wc -l < "$list")
  log "chunk fetch: $total listed, 0 seeded (no seed cache on runner), $total to fetch"
  for pass in $(seq 1 20); do
    missing=0
    : > "$staging/.missing-list.txt"
    while IFS=$'\t' read -r fn url; do
      [ -z "$fn" ] && continue
      [ -f "$staging/$fn" ] && continue
      printf '%s\t%s\n' "$fn" "$url" >> "$staging/.missing-list.txt"
      missing=$((missing + 1))
    done < "$list"
    if [ "$missing" -eq 0 ]; then break; fi
    awk 'NR%8==1{print > "'"$staging"'/.part-0.txt"} NR%8==2{print > "'"$staging"'/.part-1.txt"} NR%8==3{print > "'"$staging"'/.part-2.txt"} NR%8==4{print > "'"$staging"'/.part-3.txt"} NR%8==5{print > "'"$staging"'/.part-4.txt"} NR%8==6{print > "'"$staging"'/.part-5.txt"} NR%8==7{print > "'"$staging"'/.part-6.txt"} NR%8==0{print > "'"$staging"'/.part-7.txt"}' "$staging/.missing-list.txt"
    local pids=""
    for p in 0 1 2 3 4 5 6 7; do
      [ -s "$staging/.part-$p.txt" ] || continue
      local cfg="$staging/.cfg-$p" cfgpart="$staging/.cfg-$p.part" status="$staging/.status-$p"
      : > "$cfg"
      while IFS=$'\t' read -r fn url; do
        printf 'url = "%s/%s"\noutput = "%s"\n' "$BASE" "$fn" "$staging/$fn" >> "$cfg"
      done < "$staging/.part-$p.txt"
      : > "$cfgpart"
      while IFS= read -r line; do
        case "$line" in output*) line="${line%\"}.part\"";; esac
        printf '%s\n' "$line" >> "$cfgpart"
      done < "$cfg"
      curl -sS --fail --connect-timeout 60 --max-time 1800 \
        -w "CODE=%{http_code} SIZE=%{size_download} FILE=%{filename_effective}\n" \
        -K "$cfgpart" > "$status" 2>> "$LOG" &
      pids="$pids $!"
    done
    wait $pids 2>/dev/null
    for p in 0 1 2 3 4 5 6 7; do
      local status="$staging/.status-$p"
      [ -f "$status" ] || continue
      while IFS= read -r sline; do
        code="${sline%% *}"; rest="${sline#* }"
        size="${rest%% *}"; file="${rest#*FILE=}"
        [ "$code" = "CODE=200" ] || continue
        [ "$size" != "0" ] || continue
        [ -f "$file" ] && mv "$file" "${file%.part}"
      done < "$status"
      rm -f "$staging/.cfg-$p" "$staging/.cfg-$p.part" "$status" "$staging/.part-$p.txt"
    done
    while IFS=$'\t' read -r fn url; do
      [ -z "$fn" ] && continue
      rm -f "$staging/$fn.part"
    done < "$list"
    rm -f "$staging/.missing-list.txt"
    log "chunk fetch pass $pass: $missing were missing at pass start (8 streams)"
  done
  local legit=0 failed=0
  : > "$staging/.missing.txt"; : > "$staging/.failed.txt"
  for round in 1 2 3; do
    failed=0
    : > "$staging/.failed.txt"
    while IFS=$'\t' read -r fn url; do
      [ -z "$fn" ] && continue
      [ -f "$staging/$fn" ] && continue
      code=$(curl -s -o /dev/null --connect-timeout 30 --max-time 60 -w "%{http_code}" "$BASE/$fn" 2>/dev/null || echo "000")
      if [ "$code" = "404" ]; then legit=$((legit + 1)); echo "$fn" >> "$staging/.missing.txt"
      else failed=$((failed + 1)); echo "$fn (http $code)" >> "$staging/.failed.txt"; fi
    done < "$list"
    [ "$failed" -eq 0 ] && break
    log "chunk classify round $round: legit-missing=$legit failed=$failed, retrying failed once more"
    sleep 10
  done
  FETCH_LEGIT=$legit; FETCH_FAILED=$failed
  log "chunk fetch done: legit-missing(404)=$legit failed=$failed"
}

TOTAL=$(node "$SCRIPT_DIR/build-chunk-catalog.mjs" --catalog "$CATALOG" --count)
TOTAL_N=$(node -e "console.log(JSON.parse(process.argv[1]).totalCatalog)" "$TOTAL")
if ! [[ "$TOTAL_N" =~ ^[0-9]+$ ]] || [ "$TOTAL_N" -eq 0 ]; then
  die "could not determine catalog total (got '$TOTAL' from --count)"
fi
NCHUNKS=$(( (TOTAL_N + CHUNK_SIZE - 1) / CHUNK_SIZE ))
log "=== catalog=$TOTAL_N entries, chunks=$NCHUNKS, chunk-size=$CHUNK_SIZE, disk free=$(free_gb_int) GiB ==="

for c in $(seq "$CHUNK_OFFSET" "$CHUNK_STRIDE" $((NCHUNKS - 1))); do
  NNN=$(printf "%03d" $c)
  T0=$(date +%s)
  if [ ! -f "$SHARED_TMP/chunk-$NNN/DONE" ]; then
    restore_chunk_checkpoint "$c" || true
  fi
  if [ -f "$SHARED_TMP/chunk-$NNN/DONE" ]; then
    log "chunk $c ($NNN): already DONE — skipped"
    continue
  fi
  if [ "$MODE" = "finish" ]; then
    die "finish mode: chunk $c has no verified checkpoint in R2 — run the chunks jobs for this build first"
  fi
  if [ "$(free_gb_int)" -lt 4 ]; then
    die "chunk $c: disk free below 4 GiB — aborting rather than filling the runner disk"
  fi
  STAGING="$WORK/chunk-staging"; CCAT="$WORK/chunk-catalog"; CTMP="$WORK/chunk-tmp"
  rm -rf "$STAGING" "$CCAT" "$CTMP"; mkdir -p "$STAGING" "$CCAT" "$CTMP"
  SUMMARY=$(node "$SCRIPT_DIR/build-chunk-catalog.mjs" --catalog "$CATALOG" --chunk $c --chunk-size $CHUNK_SIZE --out-catalog "$CCAT" --out-fetch "$WORK/chunk-fetch.txt")
  ENTRIES=$(node -e "console.log(JSON.parse(process.argv[1]).entries)" "$SUMMARY")
  FETCHABLE=$(node -e "console.log(JSON.parse(process.argv[1]).fetchable)" "$SUMMARY")
  log "chunk $c ($NNN): $SUMMARY"
  fetch_chunk "$WORK/chunk-fetch.txt" "$STAGING"
  if [ "$FETCH_FAILED" -gt 0 ]; then
    die "chunk $c ABORT: $FETCH_FAILED failed fetches (see $STAGING/.failed.txt); NO delete, NO upload"
  fi
  LEGIT_PCT_INT=$(awk -v l=$FETCH_LEGIT -v f=$FETCHABLE 'BEGIN{print int((f>0?l*100/f:0))}')
  if [ "$LEGIT_PCT_INT" -gt 5 ]; then
    die "chunk $c ABORT: legit-missing $FETCH_LEGIT/$FETCHABLE ($LEGIT_PCT_INT% > 5% — snapshot drift suspected)"
  fi
  node "$SCRIPT_DIR/stream-index.mjs" --catalog "$CCAT" --corpus-dir "$STAGING" --tmp "$CTMP" --chunk-size $CHUNK_SIZE >> "$LOG" 2>&1 \
    || die "chunk $c ABORT: stream-index failed"
  node "$SCRIPT_DIR/verify-chunk.mjs" --chunk-dir "$CTMP/chunk-000" --entries $ENTRIES --fetchable $FETCHABLE --legit-missing $FETCH_LEGIT >> "$LOG" 2>&1 \
    || die "chunk $c ABORT: verify-chunk failed"
  # Runner-disk change (c): gzip temps now; merge-shard reads .jsonl.gz.
  gzip -f "$CTMP/chunk-000/"*-w0.jsonl
  mv "$CTMP/chunk-000" "$SHARED_TMP/chunk-$NNN"
  if ! upload_chunk_checkpoint "$c"; then
    die "chunk $c ABORT: verified chunk is preserved in the checkpoint design, but its R2 checkpoint upload failed; stopping early so a later dispatch can resume from prior checkpoints"
  fi
  STAGING_BYTES=$(du -sb "$STAGING" | cut -f1)
  rm -rf "$STAGING" "$CCAT" "$CTMP" "$WORK/chunk-fetch.txt"
  ELAPSED=$(( $(date +%s) - T0 ))
  log "chunk $c ($NNN) DONE in ${ELAPSED}s: deleted ${STAGING_BYTES} bytes of staging, shared-tmp now $(du -sb "$SHARED_TMP" | cut -f1) bytes"
done
if [ "$MODE" = "chunks" ]; then
  log "=== CHUNKS MODE COMPLETE (offset=$CHUNK_OFFSET stride=$CHUNK_STRIDE): checkpoints in R2 under $BUILD_ID ==="
  exit 0
fi
log "=== ALL CHUNKS DONE, merging per shard with upload-and-delete ==="

# Bases (one metas scan) — written into shared tmp for both merge scripts.
node "$SCRIPT_DIR/compute-bases.mjs" --tmp "$SHARED_TMP" --out "$SHARED_TMP/bases.json" >> "$LOG" 2>&1 \
  || die "compute-bases failed"
cp "$SHARED_TMP/bases.json" "$WORK/bases.json"

TOTAL_TERMS=0
LARGEST_BYTES=0
LARGEST_NAME=""
UPLOADS=0
for s in $(seq 0 255); do
  INFO=$(node "$SCRIPT_DIR/merge-shard.mjs" --tmp "$SHARED_TMP" --out "$OUT" --build-id "$BUILD_ID" --shard $s --bases "$WORK/bases.json") \
    || die "merge-shard $s failed"
  TERMS=$(node -e "console.log(JSON.parse(process.argv[1]).terms)" "$INFO")
  TOTAL_TERMS=$((TOTAL_TERMS + TERMS))
  SHARD_FILE="$OUT/$BUILD_ID/terms/$s.json"
  BYTES=$(stat -c%s "$SHARD_FILE")
  if [ "$BYTES" -gt "$LARGEST_BYTES" ]; then LARGEST_BYTES=$BYTES; LARGEST_NAME="$s.json"; fi
  $WRANGLER r2 object put "$BUCKET/$BUILD_ID/terms/$s.json" --file "$SHARD_FILE" --content-type application/json --remote >> "$LOG" 2>&1 \
    || die "R2 upload failed for shard $s"
  UPLOADS=$((UPLOADS + 1))
  rm -f "$SHARD_FILE"
  if [ $((s % 32)) -eq 0 ]; then log "shards uploaded: $((s + 1))/256, terms so far: $TOTAL_TERMS"; fi
done

node "$SCRIPT_DIR/write-manifest.mjs" --tmp "$SHARED_TMP" --out "$OUT" --build-id "$BUILD_ID" --terms $TOTAL_TERMS >> "$LOG" 2>&1 \
  || die "write-manifest failed"
MANIFEST_BYTES=$(stat -c%s "$OUT/manifest.json")
node -e "const m=require(process.argv[1]); if(!Array.isArray(m.docs)||!m.docs.length) process.exit(1); console.log('manifest OK: docs='+m.docs.length);" "$OUT/manifest.json" \
  || die "manifest validation failed (docs empty)"
$WRANGLER r2 object put "$BUCKET/manifest.json" --file "$OUT/manifest.json" --content-type application/json --remote >> "$LOG" 2>&1 \
  || die "R2 upload failed for manifest.json"
UPLOADS=$((UPLOADS + 1))

DOCS_TOTAL=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).docs.length)" "$OUT/manifest.json")
cat > "$WORK/build-log-$BUILD_ID.json" <<EOF
{"textsHead":"$TEXTS_HEAD","buildId":"$BUILD_ID","siteHead":"$SITE_HEAD","catalogTotal":$TOTAL_N,"chunks":$NCHUNKS,"docs":$DOCS_TOTAL,"terms":$TOTAL_TERMS,"shards":256,"manifestBytes":$MANIFEST_BYTES,"largestShardBytes":$LARGEST_BYTES,"largestShard":"$LARGEST_NAME","uploads":$UPLOADS,"bucket":"$BUCKET","builtAt":"$(date -u +%FT%TZ)"}
EOF
$WRANGLER r2 object put "$BUCKET/build-log-$BUILD_ID.json" --file "$WORK/build-log-$BUILD_ID.json" --content-type application/json --remote >> "$LOG" 2>&1 \
  || die "R2 upload failed for build log"
cp "$WORK/build-log-$BUILD_ID.json" ./build-log.json
log "=== BUILD COMPLETE: docs=$DOCS_TOTAL terms=$TOTAL_TERMS manifestBytes=$MANIFEST_BYTES largestShard=$LARGEST_NAME ($LARGEST_BYTES bytes) uploads=$UPLOADS ==="
cat "$WORK/build-log-$BUILD_ID.json"
