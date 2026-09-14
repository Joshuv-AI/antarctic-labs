# Antarctic Labs
Cloudflare Pages production build configuration verified.
A cinematic React + Vite portfolio/studio site built around the Antarctic Labs visual direction, with a polar WebGL environment and Montfort-inspired interaction grammar.

## Stack

- React
- Vite
- Three.js for the atmospheric WebGL layer
- GSAP for motion
- Plain CSS for the design system
- Cloudflare Pages for deployment
- GitHub as the source repository

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Production build

```bash
npm run build
npm run preview
```

## Content editing

Most temporary copy is in:

`src/main.jsx`

The `content` object near the top is intentionally simple so the placeholder project titles, descriptions, email, capabilities, and hero copy can be replaced later.

## Routes

- `/` — Home
- `/project-01` — Project 01 placeholder
- `/project-02` — Project 02 placeholder
- `/about` — About

The project routes exist now but can be kept out of the main public navigation/home until the projects are ready.

## GitHub + Cloudflare

The intended production model is:

GitHub repository → Cloudflare build → `antarcticlabs.com`

GitHub stores the source code. Cloudflare serves the website.

For a Vite/React Cloudflare Pages deployment:

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`

After Cloudflare is connected to the GitHub repository, pushes to the production branch trigger deployments automatically.

## Design note

This project uses Montfort as a reference for interaction language, not as a source-code or asset template. The Antarctic Labs implementation is an original system with its own brand, copy, visuals, and content architecture.


## Reference research

`DESIGN_BLUEPRINT.md` documents the current research into Montfort's information architecture, navigation, immersive interaction language, performance/accessibility lessons, and the original Antarctic Labs translation.

The implementation deliberately does not use Montfort's assets, source code, copy, or branding.
