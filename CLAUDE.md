# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start dev server with Turbopack
npm run build            # Production build
npm run lint             # ESLint
npm run type-check       # TypeScript check (tsc --noEmit)
npm run test             # Vitest unit tests
npm run test:ui          # Vitest with UI
npm run test:e2e         # Playwright E2E tests
npm run test:e2e:ui      # Playwright with UI
npm run supabase:gen-types  # Regenerate database types from local Supabase
```

## Architecture

### Tech Stack
- **Next.js 16** (App Router) with React 19 and TypeScript
- **Supabase** for PostgreSQL database and authentication
- **React Query** for server state management
- **Tailwind CSS 4** with class-variance-authority for component variants
- **Stripe** for payments
- **Vitest** + **Playwright** for testing

### Role-Based Access Control (RBAC)
Four user roles with separate dashboards:
- `admin` → `/admin` - System management
- `customer` → `/customer` - Parents who purchase products and manage linked gamers
- `gamer` → `/gamer` - Child accounts (use username login, synthetic email: `{username}@gamer.sogverse.internal`)
- `gedu` → `/gedu` - Game educators

Middleware (`src/middleware.ts`) enforces role-based routing. RLS policies protect data at the database level.

### Key Directory Structure
```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Login, register, forgot-password
│   ├── (dashboard)/       # Role-specific dashboards (admin, customer, gamer, gedu)
│   ├── (public)/          # Public pages
│   └── api/               # API routes
├── components/
│   ├── ui/                # Base components (button, card, input)
│   └── [role]/            # Role-specific components
├── services/              # Business logic with React Query hooks
├── lib/
│   ├── supabase/          # client.ts (browser), server.ts (RSC), admin.ts (privileged)
│   └── constants/         # Roles, routes
├── providers/             # AuthProvider, QueryProvider, ThemeProvider
└── types/
    └── database.types.ts  # Auto-generated from Supabase schema
```

### Supabase Clients
- `createBrowserClient()` - Browser-side, singleton pattern
- `createServerComponentClient()` - Server components (RSC)
- `createAdminClient()` - Service role key for privileged operations

### Styling
- Use `cn()` utility from `lib/utils.ts` for conditional classes
- Brand colors: purple `#8F00E2`, yellow `#FAA901`
- Dark mode is default (class-based via next-themes)

## Environment Variables

Copy `.env.local.example` to `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase public config
- `SUPABASE_SERVICE_ROLE_KEY` - For admin operations (server-only)
- `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe config

## Database

Migrations in `supabase/migrations/`. After schema changes:
```bash
npm run supabase:gen-types
```
