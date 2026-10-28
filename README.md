# Antarctic Labs

Production: https://antarctic-labs.com
Repository: https://github.com/Joshuv-AI/antarctic-labs

This repository is the production website for Antarctic Labs — a React/Vite
single-page app with Cloudflare Pages Functions, deployed by Cloudflare
Pages from the `main` branch.

## What the site is

The site's center of gravity is the **Tower of Babel**, a preservation
library of hosted full-text works — 600,320 entries as of 2026-10-28 —
spanning sacred texts, classics, declassified records, papers, law, and
more, every entry a real hosted text (no metadata-only placeholders).

- `/tower-of-babel` — the library landing
- `/tower-of-babel/library` — the catalog (search, browse, filters)
- `/tower-of-babel/library/research` — API access: free emailed key,
  Pro $19/mo, Commercial $149/mo (Stripe)
- `/tower-of-babel/api` — API documentation
- `/tower-of-babel/library/suggest` — suggest an entry
- `/tower-of-babel/donate` — support the library
- `/about`, `/government-contracting`, `/privacy`

The freelance-era Services, Projects, and Contact pages were removed in
October 2026 and are not coming back.

## Architecture

- **Hosting:** Cloudflare Pages — production branch `main`, build command
  `npm run build`, output directory `dist`, root directory = repo root.
  Do not switch this project to Cloudflare Workers without a deliberate
  redesign.
- **Frontend:** React + Vite (`src/main.jsx`, `src/pages.jsx`,
  `src/styles.css`, content modules in `src/content/`). Client-side
  routing, no routing framework. Decorative Three.js layers mount behind
  a WebGL shield so a GPU/shader failure can never break a page.
- **Functions:** `functions/` — the keyed Tower API (D1 `tower-api`,
  Stripe webhooks), form intake, and the catalog data endpoints.
- **Data plane:** the large catalog payloads under `public/` (catalog
  shards, catalog index, search shards, descriptions) are read by the
  Functions at request time from this repo's `main` branch on GitHub —
  they do not need to ship inside `dist/`.

## Build rules that bite

- **25 MiB per-file cap:** Cloudflare Pages rejects any file in `dist/`
  over 25 MiB at asset validation. Derived payloads that can cross the
  cap are held out of `dist/` by `scripts/stage-deploy.mjs` (they are
  served from the repo at request time instead). If builds suddenly fail
  at "Validating asset output directory", a derived payload outgrew the
  cap — hold it out, don't shrink the data.
- **Full build or it didn't happen:** `npx vite build` alone skips the
  prebuild chain (`scripts/generate-sitemap.mjs` + the search-index
  build). Always gate changes with the full `npm run build`.
- **Data-only pushes** (catalog texts, catalog/index/shard JSON, search
  data — anything the Functions read from the repo at request time) use
  the `[CF-Pages-Skip]` commit-message prefix so they don't burn a Pages
  build. Code pushes need a real build.
- **Asset size rule:** before adding a large binary, check its size,
  confirm it is required at runtime, and optimize it. Keep source/master
  files out of the production bundle.

## Data migration (in flight)

The catalog data plane is being moved to
`Joshuv-AI/antarctic-labs-texts` so Pages stops paying a full clone of
this repo's data history on every deploy. Until that migration
completes, catalog publishes land in **both** repos at the same
`public/` paths.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # production build (runs the full prebuild chain)
npm run preview  # preview the production build
# Note: vite preview cannot exercise the catalog data plane — the
# Functions-backed catalog endpoints only exist on the real deployment.
```

## Deployment

1. Commit to `main` and push to GitHub.
2. Cloudflare Pages detects the commit and runs `npm run build`.
3. Vite generates `dist/`; Cloudflare serves it.

`dist/` is a generated artifact — never build or commit it manually.
