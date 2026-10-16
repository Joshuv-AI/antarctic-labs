// Holds the heavy library payloads out of the Vite build (and puts them back
// afterwards) so the Cloudflare Pages deployment stays within platform
// limits: 20,000 files per site and 25 MiB per file.
//
// public/tower-of-babel/ (115k+ TXT files), public/catalog.json (~62 MiB) and
// public/catalog-index.json (~27 MiB) all exceed those limits as static
// files, so they cannot ship in dist/. They stay in the git repo and are
// served at request time by Pages Functions instead:
//
//   /tower-of-babel/<file>.txt  -> functions/tower-of-babel/[file].js
//   /catalog.json               -> functions/catalog.json.js
//   /catalog-index.json         -> functions/catalog-index.json.js
//
// The deep-search index (public/search-index/, 2.5 GiB at 121k texts:
// manifest.json plus 256 term shards per buildId) likewise cannot ship in
// dist/. The whole directory is held out and served by functions:
//
//   /search-index/manifest.json             -> functions/search-index/manifest.json.js
//   /search-index/<buildId>/terms/<n>.json  -> functions/search-index/[buildId]/terms/[shard].js
//
// (Both functions pin to the DEPLOYED commit (CF_PAGES_COMMIT_SHA) so the
// manifest's buildId always matches the term shards shipped in the same
// deploy.)
//
// Usage: node scripts/stage-deploy.mjs out|in
// Wired as npm hooks: `out` at the end of prebuild, `in` as postbuild.
// Renames within the same filesystem are instant, even for 115k files.
// Idempotent and safe when an item is absent (sparse checkouts, CI).

import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOLD = join(ROOT, ".deploy-payload");
const ITEMS = ["tower-of-babel", "catalog.json", "catalog-index.json", "search-index"];

const mode = process.argv[2];
if (mode !== "out" && mode !== "in") {
  console.error("usage: node scripts/stage-deploy.mjs out|in");
  process.exit(1);
}

mkdirSync(HOLD, { recursive: true });
for (const name of ITEMS) {
  const pub = join(ROOT, "public", name);
  const held = join(HOLD, name);
  if (mode === "out" && existsSync(pub) && !existsSync(held)) {
    mkdirSync(dirname(held), { recursive: true });
    renameSync(pub, held);
    console.log(`[stage-deploy] held public/${name} out of the build`);
  } else if (mode === "in" && existsSync(held) && !existsSync(pub)) {
    mkdirSync(dirname(pub), { recursive: true });
    renameSync(held, pub);
    console.log(`[stage-deploy] restored public/${name}`);
  }
}
