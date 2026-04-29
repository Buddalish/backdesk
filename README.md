# Backdesk

A workspace for your data. Pages of blocks, collections, connections.

## Stack

- Next.js 15 (App Router) + shadcn/ui + Plate.js (added in Plan 3)
- Supabase (Auth + Postgres + Storage)
- Turborepo + pnpm workspaces

## Local development

Prerequisites: Node 20+, pnpm 9+, Docker, Supabase CLI.

```bash
pnpm install
supabase start
pnpm db:types
cp .env.example apps/web/.env.local   # then edit with values from `supabase status`
pnpm dev
```

Visit http://localhost:3000.

## Scripts

- `pnpm dev` — run the app in dev
- `pnpm build` / `pnpm start`
- `pnpm test` — unit tests
- `pnpm test:e2e` — Playwright e2e (requires local Supabase running)
- `pnpm db:migrate` — apply migrations to local Supabase
- `pnpm db:types` — regenerate Supabase TypeScript types

## Project layout

See `docs/superpowers/specs/2026-04-28-backdesk-v1-design.md` for the full design.
Plans live in `docs/superpowers/plans/`.
