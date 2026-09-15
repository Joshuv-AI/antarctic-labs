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

Three.js Scene

The primary scene lives in:

src/PolarScene.jsx

The scene is intentionally built as a real environment rather than a collection of flat background effects.

World stack

REAL SKY
   ↓
OPTIONAL HERO MOUNTAIN / AURORA
   ↓
REAL CHALAADI DISTANCE
   ↓
MOUNTAIN CLOUD
   ↓
DEEP TRANSITION CLOUD
   ↓
ATMOSPHERIC FOG
   ↓
REAL SNOW
   ↓
REAL ICE
   ↓
REAL ROCK
   ↓
DARK WATER
   ↓
CAMERA

The cloud and mist system is procedural.

It does not depend on an external cloud video or cloud asset.

⸻

Hero Mountain / Aurora Asset

The intended hero mountain and aurora source is:

Aura_Borealis_.blend

The .blend file is a source/master asset and is not intended to be loaded directly by the browser.

The intended runtime workflow is:

Aura_Borealis_.blend
        ↓
Inspect / clean in Blender
        ↓
Optimize
        ↓
Export GLB
        ↓
single-mountain-snow.glb
        ↓
public/assets/models/mountains/
        ↓
GitHub
        ↓
Cloudflare Pages
        ↓
Three.js

The runtime scene already contains an optional slot for:

/assets/models/mountains/single-mountain-snow.glb

The scene must continue functioning if this file is temporarily unavailable.

The future GLB should ideally remain below Cloudflare Pages’ individual asset-size limits.

⸻

Current 3D Assets

Runtime assets live under:

public/assets/

The project currently uses:

assets/
├── hdr/
│   └── daysky-8k-hdr-4k.jpg
│
├── models/
│   └── mountains/
│       └── chalaadi.fbx
│
├── ice/
│   ├── ice-color.png
│   ├── ice-displacement.png
│   ├── ice-normal.jpg
│   └── ice-roughness.png
│
├── snow/
│   ├── snow-003-color.png
│   ├── snow-005-color.png
│   ├── snow-ao.png
│   ├── snow-color.png
│   ├── snow-displacement.png
│   ├── snow-normal.png
│   └── snow-roughness.png
│
└── rock/
    ├── rock-026-color.png
    ├── rock-ao.png
    ├── rock-color.png
    ├── rock-displacement.png
    ├── rock-normal.png
    └── rock-roughness.png

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
├── PolarScene.jsx
└── styles.css

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

PolarScene.jsx

Physical environment.

Responsible for:

* Three.js renderer
* camera
* lighting
* sky
* terrain
* models
* PBR materials
* clouds
* atmosphere
* stars
* aurora
* world movement
* scroll-driven environmental movement

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

Current application routes:

/
├── /project-01
├── /project-02
└── /about

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