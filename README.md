# Mosslight

Mosslight is a Growtopia-inspired, single-player 2D sandbox game about exploring, digging, and growing a world of your own. It pairs original pixel-art visuals with a cozy world that saves your progress in the browser.

## Highlights

- Explore a procedurally generated world with caves, resources, and breakable terrain.
- Dig, collect, craft your loadout, and place blocks, seeds, and decorations.
- Grow and harvest plants, earn gems, and unlock tools and movement upgrades in the shop.
- Learn the game through a guided tutorial, responsive sign prompts, and sound feedback.
- Save, export, and restore world progress locally—no account or server required.

## Tech

- **TypeScript** — game systems and UI
- **Phaser 4** — 2D game rendering and interaction
- **Vite** — development server and production builds
- **Vitest & Playwright** — unit and browser testing
- **pnpm** — package management

## Run locally

Requires Node.js 22.12+ and pnpm 10+.

```sh
pnpm install
pnpm dev
```

## Build and test

```sh
pnpm build
pnpm test
pnpm test:browser
```

The production build is a static site and can be hosted on any static web host. Game progress is stored in the browser.
