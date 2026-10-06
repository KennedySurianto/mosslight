# Mosslight

Mosslight is a Growtopia-inspired 2D sandbox game where players explore, build, and grow their own pixel-art worlds. It includes a guided solo experience and an online mode with shared worlds, friends, and account-based progress.

## Highlights

- Explore a procedurally generated world with caves, resources, and breakable terrain.
- Dig, collect, craft your loadout, and place blocks, seeds, and decorations.
- Grow and harvest plants, earn gems, and unlock tools and movement upgrades in the shop.
- Learn the game through a guided tutorial, responsive sign prompts, and sound feedback.
- Play solo with local saves, or register to visit friends and build together online.

## Tech

- **TypeScript** — game systems and UI
- **Phaser 4** — 2D game rendering and interaction
- **Vite** — development server and production builds
- **Supabase** — account auth, protected game data, Edge Functions, and Realtime rooms
- **Vitest & Playwright** — unit and browser testing
- **pnpm** — package management

## Run locally

Requires Node.js 22.12+ and pnpm 10+.

```sh
pnpm install
pnpm dev
```

Solo play works without environment variables. To enable online play, copy `.env.example` to `.env.local` and add the Supabase project URL and publishable key. Deploy the SQL migrations and the `mosslight-auth` and `mosslight-game` Edge Functions first. Keep service or secret keys out of the browser and repository.

## Build and test

```sh
pnpm build
pnpm test
pnpm test:browser
```

The production build is a static site suitable for Vercel. Online worlds live in Supabase; solo progress stays in the browser.
