Antarctic Labs

Independent digital systems, AI, automation, software, and experimental web experiences.

Production: https://antarctic-labs.com
Repository: https://github.com/Joshuv-AI/antarctic-labs

⸻

Production Architecture

GitHub
  │
  │ main
  ▼
Cloudflare Pages
  │
  │ npm run build
  ▼
Vite
  │
  │ dist/
  ▼
antarctic-labs.com

The production site is deployed through Cloudflare Pages from the main branch.

Cloudflare Pages

* Framework: Vite / React
* Production branch: main
* Build command: npm run build
* Build output directory: dist
* Root directory: repository root
* Automatic deployments: enabled

Do not switch this project to Cloudflare Workers unless the architecture is deliberately redesigned.

⸻

Stack

* React 19
* Vite
* Three.js
* GSAP
* ScrollTrigger
* WebGL
* Custom GLSL shaders

The site intentionally avoids unnecessary frameworks and dependencies.

⸻

Visual System

Antarctic Labs is designed as a digital polar environment rather than a conventional agency template.

The visual language combines:

* Antarctic terrain
* glaciers
* snow
* ice
* mountain silhouettes
* polar night
* restrained aurora
* atmospheric fog
* cloud layers
* cinematic negative space
* technical field documentation
* minimal interface typography

The goal is:

A digital studio operating inside a polar world.

The experience should feel cold, intelligent, precise, quiet, and substantial.

⸻

Experience Architecture

The site follows one continuous narrative:

ARRIVAL
   ↓
DESCENT
   ↓
SYSTEMS
   ↓
EXPEDITIONS
   ↓
HORIZON

The physical environment and interface are intended to reinforce one another.

Physical world

Three.js provides:

* sky
* mountains
* snow
* ice
* rock
* water
* clouds
* mist
* atmospheric fog
* stars
* aurora
* camera movement
* environmental lighting

Human interface

React provides:

* navigation
* typography
* metadata
* capabilities
* project records
* project detail pages
* about page
* contact
* responsive behavior

Narrative movement

Scroll and animation connect the two layers.

The camera and environment evolve as the visitor moves through the site.

⸻

Background System

The homepage background is a layered environment composed of:

* a constellation (ThreeUI defense-lines asset, sandboxed iframe with custom Canvas2D particle network)
* an iceberg video loop (background.mov, full-bleed, autoplay, loop, muted, playsInline)
* a fixed-position env-arrival runway that drives the constellation translateY and the iceberg translateY in opposite directions across scroll

The transition is spatial: the constellation slides upward and the iceberg slides upward from below — they tile the viewport with no overlap, and a 7%/7% soft mask cross-fade softens the meeting line on browsers that support mask-image.

The runtime background lives in:

src/components/NewBackgroundVideo.jsx

⸻

Runtime Assets

Runtime assets live under:

public/assets/

The project currently uses:

assets/
├── new-bg/
│   └── new-background.mov
│
└── models/
    └── mountains/
        └── single-mountain-snow.glb

Only assets actually required by the application should remain part of the production bundle.

⸻

Important Asset Rule

Cloudflare Pages has individual asset-size limitations.

Before adding a large binary asset:

1. Check its size.
2. Determine whether it is actually required at runtime.
3. Optimize it if necessary.
4. Prefer GLB over unnecessarily large source formats.
5. Do not add large source/master files to the production runtime unless required.
6. Do not introduce an external storage dependency simply to avoid optimizing an asset.

Source assets and production assets should be treated separately.

⸻

Frontend Structure

src/
├── main.jsx
├── pages.jsx
├── styles.css
├── seo.js
├── components/
│   └── NewBackgroundVideo.jsx
├── content/
│   ├── site.js
│   ├── routes.js
│   ├── pages.jsx
│   ├── the-lab.js
│   ├── systems.js
│   ├── history.js
│   ├── operator.js
│   ├── transmission.js
│   ├── tower-of-babel.js
│   ├── government.js
│   ├── field-interests.js
│   ├── expeditions.js
├── lib/
│   └── gsap-iframe-injector.js
└── shaders/
    ├── threeui.css
    └── neuform-isolated/
        ├── NeuformBatchEffects.tsx
        └── sources/
            └── defense-lines.html

main.jsx

Application/interface layer.

Responsible for:

* routing
* page structure
* navigation
* project records
* capabilities
* contact
* metadata
* UI animation
* GSAP scroll-trigger orchestration for the background arrival transition

pages.jsx

Page components.

Renders the homepage and all inner pages from the content modules.

styles.css

Interface and responsive visual system.

Responsible for:

* typography
* layout
* navigation
* page composition
* project presentation
* responsive behavior
* accessibility states
* reduced-motion behavior
* WebGL layer positioning

⸻

Routes

Current application routes are defined in:

src/content/routes.js

That file is the source of truth for the site's IA, route metadata, and backward-compatibility aliases. Do not duplicate the route list elsewhere.

The project uses client-side routing without introducing a routing framework.

Cloudflare Pages should continue serving the application entry point for client-side routes.

⸻

Performance Principles

The experience is deliberately ambitious, but performance matters.

Desktop

Use:

* higher renderer pixel ratio
* larger geometry
* more cloud detail
* more stars
* full shadow support
* richer atmospheric depth

Mobile

Use:

* reduced pixel ratio
* reduced geometry
* fewer stars
* lighter cloud complexity
* restrained shadows
* shorter render workload

Mobile is not a fallback version.

It should remain visually complete and intentional.

⸻

Accessibility

The interface should maintain:

* semantic HTML
* keyboard-accessible navigation
* visible focus states
* readable contrast
* reduced-motion support
* appropriate ARIA labeling
* nonessential WebGL content marked as decorative

The WebGL scene should never be required to understand or navigate the site.

⸻

Security

Production headers are defined in:

public/_headers

The current policy intentionally restricts:

* scripts
* frames
* objects
* forms
* camera
* microphone
* geolocation
* arbitrary external connections

Google Fonts are explicitly permitted.

Three.js assets are served from the site’s own origin.

Do not loosen the Content Security Policy simply to make an unnecessary external dependency work.

⸻

SEO

The project includes:

index.html
public/robots.txt
public/sitemap.xml
public/favicon.svg

The canonical domain is:

https://antarctic-labs.com/

The sitemap currently exposes the primary application routes.

⸻

Development

Install dependencies:

npm install

Run the development server:

npm run dev

Create a production build:

npm run build

Preview the production build locally:

npm run preview

⸻

Deployment

Normal production deployment:

1. Make changes
2. Commit to main
3. Push to GitHub
4. Cloudflare Pages detects the commit
5. npm run build
6. Vite generates dist/
7. Cloudflare serves dist/

Do not manually build dist/ for normal deployment.

dist/ is a generated production artifact.

⸻

Design Principles

01 — Build the system

The site should communicate capability through the quality of the system itself.

02 — Do not over-explain

The visual environment should create curiosity.

The interface provides enough information to understand what Antarctic Labs does without turning the site into a wall of marketing copy.

03 — Real assets over fake complexity

When a real mountain, texture, environment, or material exists, use it.

Procedural effects should support the physical world rather than replace it.

04 — Motion has a purpose

Animation should communicate:

* arrival
* depth
* descent
* transition
* atmosphere
* progression

Avoid animation that exists only because WebGL can do it.

05 — Preserve negative space

The interface should never compete unnecessarily with the environment.

06 — Mobile is first-class

The experience must remain impressive on a phone.

07 — Reliability beats novelty

Do not introduce infrastructure, dependencies, or services that do not materially improve the product.

⸻

Current State

The project is intended to be a production-quality personal studio portfolio.

The visual direction is intentionally ambitious:

Antarctic environment
        +
Technical interface
        +
Case-study storytelling
        +
Atmospheric motion
        =
Antarctic Labs

The site should feel like a place rather than a template.

⸻

Future Expansion

Potential future additions include:

* optimized hero mountain GLB
* real aurora geometry/materials from the Blender source
* additional expedition case studies
* deeper project detail
* richer project media
* additional environmental transitions
* stronger interaction between project content and the 3D environment

Future additions should preserve the core philosophy:

USEFUL MACHINES FOR UNKNOWN TERRITORY.