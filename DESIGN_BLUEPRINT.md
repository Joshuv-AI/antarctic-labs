# Antarctic Labs — Design Blueprint & Reference Research

## Reference model

Primary visual/interaction reference: https://mont-fort.com/

The objective is **not** to reproduce Montfort. It is to understand the interaction grammar that makes the site feel premium, then translate that grammar into an original Antarctic Labs identity.

### What the live reference confirms

The current Montfort site uses a very restrained persistent UI and a content structure underneath the immersive layer. Its visible navigation exposes the group and four divisions, plus Contact, ESG, Privacy and Terms. The homepage presents a "Swipe down / Scroll down to discover" cue and then unfolds the company story through large statements and numbered sections. citeturn0view0

Its subpages preserve the same global navigation and interaction language while changing the information architecture for each division. The Who We Are page uses numbered narrative sections for values, team, and driving forces; the Trading page uses a large lead statement followed by categorized content; the Maritime page uses numbered investment/service sections. citeturn1view0turn1view1turn1view3

The studio that produced the experience, Immersive Garden, describes the Montfort build as a WebGL site with smooth transitions, elegant details, and playful micro-interactions. citeturn2search0

External discussion also highlights the site's smooth-scroll storytelling, cinematic full-screen visuals, parallax/depth, interactive transitions, and scroll-triggered UI. It also surfaces real weaknesses worth learning from: heavy loading, interaction responsiveness, accessibility gaps, sound being potentially intrusive, menu-toggle edge cases, and parallax that can cause discomfort for some users. Those criticisms are treated as QA requirements for Antarctic Labs rather than things to copy. citeturn2search1turn2search3

## Antarctic Labs translation

### Visual world

The Antarctic Labs visual vocabulary is:

- polar night
- snow
- glaciers
- monumental mountains
- ice shelves
- frozen water
- mist
- blue/grey/white materials
- restrained cyan
- subtle green/blue aurora
- star field
- cold atmospheric haze
- high contrast typography
- near-black negative space

The environment should feel **quiet, enormous and cold**, not like a generic "AI neon" website.

### Experience

The user should feel as though the site is a place being explored.

The hierarchy is:

1. Atmosphere
2. Typography
3. Narrative
4. Interaction
5. Detail

Never reverse that hierarchy.

## Navigation model

Closed header:

`ANTARCTIC LABS` — `MENU`

Opening the menu becomes a full-screen spatial transition rather than a dropdown.

Menu entries:

- 01 HOME
- 02 PROJECT 01
- 03 PROJECT 02
- 04 ABOUT

Secondary labels can appear on hover to explain the destination without cluttering the closed state.

The transition layer is a full-screen polar/ice-colored curtain. This gives route changes a deliberate beginning and ending rather than an abrupt browser swap.

## Home narrative

### 01 / FIELD
Full-screen cinematic hero.

### 02 / SIGNAL
Large positioning statement.

### 03 / SELECTED WORK
Large visual project entries with:
- depth
- hover parallax
- environmental artwork
- project metadata
- subtle "open case study" affordance

### 04 / CAPABILITIES
Large numbered rows.

### 05 / NEXT
Large manifesto statement.

### 06 / CONTACT
Large, extremely simple contact CTA.

This follows the reference's principle of turning business information into a guided visual narrative rather than dumping information into cards. The live Montfort homepage similarly moves from an introductory statement into divisions, global connectivity, sustainability/governance, equality and CSR as a guided sequence. citeturn0view0

## WebGL strategy

The current implementation uses Three.js as an environmental layer, not as a replacement for HTML content.

Scene components:

- low-poly iceberg
- distant mountain ridge
- snow caps
- dark polar water plane
- sparse stars
- layered aurora curves
- atmospheric fog
- restrained lighting
- pointer-driven camera/world drift
- slow autonomous movement

### Why

This gives Antarctic Labs a recognizable visual signature without requiring large video files or external stock imagery for the core atmosphere.

### Future enhancement path

If the eventual visual QA shows that the procedural scene is not cinematic enough, the next upgrade should be:

1. custom high-quality glacier/iceberg geometry
2. baked or procedural material detail
3. stronger volumetric/fog treatment
4. animated aurora shader
5. subtle water/reflection layer
6. carefully optimized environment textures

Do not jump directly to a giant 3D asset pack. Complexity should be earned by the visual result.

## Project-card strategy

Project cards are not conventional portfolio thumbnails.

They should behave like miniature environments.

Interaction stack:

- mouse-position parallax
- perspective tilt
- moving atmospheric light
- mountain depth layers
- aurora haze
- sheen pass
- metadata
- explicit hover affordance

On mobile, the interaction collapses into touch-friendly motion and remains readable without hover.

## Typography system

Primary display:
- large, tightly tracked grotesk/sans
- very large scale
- short lines
- strong contrast
- restrained use of italic/color emphasis

Secondary:
- small monospaced labels
- route indexes
- metadata
- technical annotations

The visual trick is not a special font. It is **scale + spacing + hierarchy**.

## Motion system

GSAP + ScrollTrigger controls:
- hero entrance
- section reveals
- scroll-linked depth
- atmospheric movement
- project interactions

The application now explicitly registers `ScrollTrigger`; it should never rely on an unregistered plugin.

Route transitions use a dedicated full-screen curtain so navigation feels spatial.

### Motion rules

- animate transforms and opacity where possible
- avoid layout-thrashing animation
- no perpetual high-frequency animation for its own sake
- reduce effects on mobile where needed
- support `prefers-reduced-motion`
- never block navigation waiting for an elaborate animation
- keep the visual system coherent across every route

## Performance rules

Montfort is a visual benchmark, but public discussion has also flagged performance and interaction weight. citeturn2search1

Antarctic Labs therefore uses a stricter rule:

**The site must look expensive without requiring an expensive page load.**

Rules:
- cap WebGL pixel ratio
- keep geometry intentionally low/moderate
- avoid giant background videos in V1
- lazy-load future project media
- prefer compressed AVIF/WebP imagery when images are introduced
- avoid unnecessary libraries
- keep content HTML/CSS accessible
- test mobile GPU behavior
- provide reduced-motion behavior
- keep interactive effects secondary to content

## Accessibility

The visual reference is not the accessibility benchmark.

Antarctic Labs should improve on it.

Required:
- semantic headings
- keyboard navigation
- visible focus states
- usable menu controls
- descriptive labels
- no essential information conveyed only through animation
- reduced-motion support
- readable contrast
- links/buttons that remain understandable without hover

## Originality boundary

Allowed:
- visual principles
- spatial storytelling
- cinematic pacing
- minimal navigation
- WebGL atmosphere
- scroll narrative
- interaction concepts

Not allowed:
- Montfort assets
- Montfort source code
- Montfort text
- Montfort logo
- exact branded graphics
- copied page content
- copied proprietary 3D assets

Antarctic Labs needs to look like the **same caliber of work**, not the same website.

## Current implementation status

Implemented:
- React/Vite foundation
- Three.js atmospheric environment
- iceberg + mountain ridge + snow treatment
- aurora layer
- star field
- GSAP + ScrollTrigger
- hero choreography
- scroll reveal system
- route curtain
- full-screen navigation
- hover project environments
- project pages
- About
- contact
- responsive mobile rules
- reduced-motion rules
- maintainable content object
- GitHub/Cloudflare-ready build structure

Next visual QA, once a browser/runtime is available:
- desktop 1440/1728/1920
- laptop 1366
- tablet
- iPhone-sized viewport
- touch behavior
- GPU/frame-rate behavior
- route transition edge cases
- menu open/close edge cases
- keyboard navigation
- reduced motion
- Lighthouse/performance
- real project imagery

## Quality bar

The final site should make a potential client think:

> "This person can actually build."

It should feel:
- premium
- cinematic
- intelligent
- controlled
- cold
- memorable
- technically credible
- easy to navigate
- intentionally designed

The website itself is part of the portfolio.
