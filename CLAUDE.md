# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start dev server + Stripe webhook listener
npm run dev:next         # Start dev server only (no Stripe)
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
- **Brevo** (formerly Sendinblue) for transactional email via SMTP (configured in Supabase dashboard)
- **Daily.co** for real-time voice/video chat
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

### UI Component Reference
A living style guide is available at `/admin/ui-components` (admin login required). It shows every component variant, composite patterns, and the color palette. **Reference this page before creating new UI patterns.** The source at `src/app/(dashboard)/admin/ui-components/page.tsx` serves as copy-paste examples.

### Voice Chat (Daily.co)

See `docs/voice-chat-architecture.md` for the full component map and data flow.

- **`src/lib/daily.ts`** — Server-only wrapper for the Daily.co REST API. Never import client-side.
- **`src/components/voice/VoiceRoomProvider.tsx`** — React context wrapping the Daily.co call object. Dynamically imports `@daily-co/daily-js` to avoid SSR issues. Both `VoiceRoomPanel` (gedu) and `VoiceRoomList` (gamer) wrap their inner component with `<VoiceRoomProvider>`.
- **`src/components/voice/`** — Shared voice UI components (controls, participant list, video tile, mic level). These consume `useVoiceRoom()` from the provider.
- **`src/services/voice/`** — Service class + React Query hooks following the same pattern as other services.
- **`src/hooks/use-voice-room-realtime.ts`** — Supabase Realtime subscription that invalidates voice query cache on `voice_rooms` table changes.

**Rule: Token issuance controls permissions.** Gamers get non-owner tokens (mic + camera enabled, but no moderation rights). Gedus/admins get owner tokens (mic + camera + moderation). This is enforced server-side in `POST /api/voice/token`. The `userName` field encodes `userId|role|displayName` for client-side role extraction.

**Rule: Room lifecycle is managed via API routes, not direct DB writes from the client.** `POST /api/voice/room` creates/reopens rooms (gedu/admin), `PATCH /api/voice/room` closes them (admins can close any room by passing `roomId`). Both use the admin Supabase client server-side. The `voice_rooms` table has a `UNIQUE(creator_id)` constraint — each creator gets exactly one room row that toggles between open/closed.

**Rule: The Realtime hook must only invalidate queries — never make Supabase data queries in the callback.** Same deadlock risk as `onAuthStateChange`. See the existing comment in `use-voice-room-realtime.ts`.

### Sorg Token Purchasing (Stripe)

See `docs/sorg-token-architecture.md` for the full component map, data flows, and fulfillment model.

- **`src/lib/constants/tokens.ts`** — `TOKEN_PACKAGES` array defining package IDs, token amounts, and prices. Server-side source of truth for Stripe session creation.
- **`src/components/tokens/`** — `TokenPurchaseSection` (package cards + purchase flow), `TransactionHistoryTable` (ledger display).
- **`src/services/tokens/`** — `TokensService` class + React Query hooks (`useTokenBalance`, `useTokenTransactions`, `useSubscription`, etc.).
- **`src/app/api/checkout/`** — Checkout session creation, verify-session fulfillment, subscription management.
- **`src/app/api/webhooks/stripe/route.ts`** — Handles subscription renewals (`invoice.paid`), status changes, and cancellations.

**Rule: All token balance changes must go through the `adjust_token_balance()` RPC.** This SECURITY DEFINER function atomically updates `profiles.token_balance` and inserts a `token_transactions` row, keeping the balance and ledger consistent. Never update `token_balance` directly.

**Rule: Prices are defined server-side only.** The client sends a `packageId`, never a price. The server looks up the package in `TOKEN_PACKAGES` and passes the price to Stripe. This prevents client-side price manipulation.

**Rule: `verify-session` is the primary fulfillment path for initial checkout.** It works on any deployment URL without webhook configuration. The webhook's `checkout.session.completed` handler intentionally does not credit tokens — it only syncs Stripe IDs to the profile. The webhook credits tokens only for subscription renewals (`invoice.paid`).

**Rule: Only customers can purchase tokens.** The checkout API route enforces `role === "customer"`. Admins can manually adjust any user's balance via `POST /api/admin/adjust-tokens`.

## Environment Variables

Copy `.env.local.example` to `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase public config
- `SUPABASE_SERVICE_ROLE_KEY` - For admin operations (server-only)
- `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe config
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signature verification (server-only)
- `DAILY_API_KEY` - Daily.co REST API key (server-only)
- `NEXT_PUBLIC_DAILY_DOMAIN` - Daily.co subdomain for room URLs

## Database

Migrations in `supabase/migrations/`. After schema changes, regenerate types from the **remote** project:
```bash
npx supabase gen types typescript --project-id $SUPABASE_PROJECT_REF > src/types/database.types.ts
```
The `npm run supabase:gen-types` script uses `--local` which requires Docker. For this project (remote Supabase, no local Docker), always use the command above with the project ref from `.env.local`.

**Important:** The gen-types command may append a CLI upgrade warning to the output file. Always check and remove any trailing non-TypeScript text from `src/types/database.types.ts` after generation.

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
   npx supabase db push -p "YOUR_DB_PASSWORD"
   ```
   The `-p` flag passes the database password inline, avoiding interactive prompts.
   The password is stored in `.env.local` as `SUPABASE_DB_PASSWORD`. Note: if the password contains `%`, double it to `%%` for shell escaping.

## Testing

### Directory Structure
```
tests/
├── setup.ts                       # Global Vitest setup (browser client mocks)
├── mocks/                         # Shared test data generators & helpers
│   ├── auth.ts                    #   Mock auth users/profiles
│   ├── supabase.ts                #   Mock Supabase query builders
│   └── voice.ts                   #   Mock voice room data
├── unit/                          # Pure functions, classes with injected mocks
│   ├── services/                  #   Service classes (mock injected via constructor)
│   ├── spatial/                   #   Pure spatial math functions
│   ├── voice/                     #   Pure mapping/transform logic
│   └── utils.test.ts              #   Utility functions (cn, formatCurrency, etc.)
├── integration/                   # Route handlers, proxy, auth flows
│   ├── api/                       #   API route handler tests
│   ├── auth/                      #   Auth callback/signout flow tests
│   └── proxy.test.ts              #   Proxy routing/session tests
└── e2e/                           # Playwright browser tests
    └── *.spec.ts
```

### Classification Rules

| Category | What goes here | Convention |
|---|---|---|
| **unit** | Pure functions, service classes with injected mock dependencies, mapping/transform logic | `.test.ts`, Vitest |
| **integration** | Route handlers (import real POST/PATCH/GET), proxy, auth flows — full request pipeline with mocked external deps | `.test.ts`, Vitest |
| **e2e** | Playwright browser tests against running dev server | `.spec.ts`, Playwright |

### Running Tests
```bash
npm run test             # All Vitest tests (unit + integration)
npm run test:ui          # Vitest with browser UI
npm run test:e2e         # Playwright E2E tests (requires dev server)
npm run test:e2e:ui      # Playwright with browser UI
```

### Shared Mocks
Test helpers live in `tests/mocks/` and are imported by both unit and integration tests. Add new mock factories here rather than duplicating setup across test files.

## Code Style

### Non-obvious workarounds need comments
When code exists to work around a framework bug, environment quirk, or other non-obvious reason, add a comment explaining **why** it's needed. The code should be readable on its own — if someone would look at a line and wonder "why is this here?", it needs a comment.
