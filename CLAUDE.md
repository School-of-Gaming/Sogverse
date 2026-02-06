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

Proxy (`src/proxy.ts`) refreshes Supabase auth sessions and enforces role-based routing (Next.js 16 uses `proxy.ts` instead of `middleware.ts`). RLS policies protect data at the database level.

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
- `createBrowserClient()` - Browser-side, singleton pattern. **Data queries only — never use for auth operations.**
- `createServerComponentClient()` - Server components (RSC)
- `createAdminClient()` - Service role key for privileged operations

### Auth Architecture
The proxy (`src/proxy.ts`) owns session management: it refreshes tokens server-side on every request and enforces role-based routing. The browser Supabase client has auto-refresh disabled (`stopAutoRefresh()`) to avoid competing with the proxy for token rotation.

**Rule: Never use the browser Supabase client for auth operations** (sign in, sign out, token refresh, password reset). Always use server-side API routes (`src/app/api/auth/`). The browser client's GoTrueClient has an internal lock queue that can deadlock and block all subsequent requests. See `docs/supabase-auth-lock-fix.md` for full context.

**Rule: After any auth state change (sign-in, sign-out), navigate with `window.location.href`, not `router.push()`**. The root layout passes `initialUser`/`initialProfile` to AuthProvider via server-side `getUserWithProfile()`. React's `useState` ignores new initial values after mount, so client-side navigation won't update auth state. Full page navigation forces the root layout to re-run and hydrate correctly.

**Rule: Never make Supabase data queries inside `onAuthStateChange` callbacks.** The callback can fire from `_recoverAndRefresh()` which holds the GoTrueClient's internal lock. A data query would call `getSession()` → `_acquireLock()` → deadlock. Only do synchronous React state updates in the callback.

### Styling
- Use `cn()` utility from `lib/utils.ts` for conditional classes
- Brand colors: primary yellow `#FAA901`, secondary purple `#8F00E2`
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

### Remote Database Migrations

This project uses a remote Supabase instance (not local Docker). To push migrations:

1. **Link the project** (first time only):
   ```bash
   npx supabase link --project-ref $SUPABASE_PROJECT_REF
   # Get the project ref from SUPABASE_PROJECT_REF in .env.local
   # Enter the database password from SUPABASE_DB_PASSWORD in .env.local when prompted
   ```

2. **Push migrations**:
   ```bash
   npx supabase db push
   # Enter password when prompted, then confirm with Y
   ```

The database password is stored in `.env.local` as `SUPABASE_DB_PASSWORD`.
