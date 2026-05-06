# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start dev server
npm run dev:stripe       # Start dev server + Stripe webhook listener
npm run build            # Production build
npm run lint             # ESLint
npm run type-check       # TypeScript check (tsc --noEmit)
npm run test             # Vitest unit tests
npm run test:ui          # Vitest with UI
npm run test:db          # Vitest DB tests (requires local Supabase)
npm run test:db:ui       # Vitest DB tests with UI
npm run test:e2e         # Playwright E2E tests
npm run test:e2e:ui      # Playwright with UI
npm run db:reset         # Reset local Supabase (wipe + re-migrate + re-seed)
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

Proxy (`src/proxy.ts`) refreshes Supabase auth sessions, enforces role-based routing, and sets a per-request nonce-based Content Security Policy (Next.js 16 uses `proxy.ts` instead of `middleware.ts`). RLS policies protect data at the database level.

### Key Conventions
- App routes are grouped: `(auth)`, `(dashboard)`, `(public)`, plus `api/`
- Components are organized by role: `components/[role]/`, shared UI in `components/ui/`
- Supabase clients: `lib/supabase/` — `client.ts` (browser), `server.ts` (RSC), `admin.ts` (privileged)
- Auto-generated types in `types/database.types.ts`, convenience aliases in `types/index.ts`

### Service Layer Pattern
Each feature in `src/services/` follows a two-file pattern:
- `*.service.ts` — Class that takes a `SupabaseClient<Database>` in the constructor. Read methods use the injected client (`.from()` queries, `.rpc()` calls). Write methods that need server-side secrets (Stripe, Daily.co, admin client) use `fetch()` to call API routes instead — the injected client is unused by those methods, and this is intentional.
- `*.queries.ts` — React Query hooks. Each hook calls `getClient()`, instantiates the service, and returns `useQuery`/`useMutation`. Exports a `*Keys` factory object for cache key hierarchy (e.g., `groupKeys.all`, `groupKeys.byProduct(id)`).

**Rule: Mutations must invalidate related queries in `onSuccess`.** Use the key hierarchy so invalidating a parent key (e.g., `groupKeys.all`) cascades to children.

### Supabase Clients
- `createBrowserClient()` - Browser-side, singleton pattern. Used for data queries and auth operations (sign in, sign up, sign out).
- `createServerComponentClient()` - Server components (RSC)
- `createAdminClient()` - Service role key for privileged operations

### Auth Architecture
Proxy (`src/proxy.ts`) refreshes tokens server-side on every request and enforces role-based routing. The browser client also auto-refreshes tokens — standard `@supabase/ssr` dual-refresh model.

**Rule: After any auth state change (sign-in, sign-out, account switch), the browser must do a full-page navigation — `window.location.href`, a form POST that the server answers with a redirect, or any other nav that unloads the document. `router.push()` is not enough.** The browser Supabase client keeps its session in an in-memory singleton seeded from cookies at construction time. Cookies changed by a server response (the `/api/auth/signout` route, OAuth callback, `/api/auth/switch-to-gamer`, password reset completion) don't fire `onAuthStateChange`, so the singleton stays stale until the document reloads. A soft navigation leaves the stale singleton in place and the UI keeps thinking the user is signed in (or signed in as the wrong person).

The canonical sign-out shape is an HTML `<form method="post" action="/api/auth/signout">` — the route calls `supabase.auth.signOut()` server-side and returns a 303, the browser follows it as a full-page GET. No client-side fetch, no React state transition on the outgoing page, no intermediate "sidebar gone but still on dashboard" frame.

**Rule: Never make Supabase data queries inside `onAuthStateChange` callbacks.** Only do synchronous React state updates in the callback.

### Content Security Policy (CSP)

CSP is generated per-request in `src/proxy.ts` with a unique nonce (`crypto.randomUUID()`). In production, `script-src` uses `'nonce-{random}' 'strict-dynamic'` — only scripts tagged by Next.js's SSR pipeline execute. In development, it falls back to `'unsafe-inline' 'unsafe-eval'` for HMR compatibility. Static security headers (X-Frame-Options, HSTS, etc.) remain in `next.config.ts`.

**Rule: Never add inline `<script>` tags directly.** The nonce-based CSP blocks any inline script without the per-request nonce. Use Next.js `<Script>` component or ensure scripts go through the SSR pipeline. If you must add an inline script, read the nonce from the `x-nonce` request header in a server component.

### Layout & Scrolling

See `docs/layout-scroll-architecture.md` for the scroll containment model and how dashboard layouts handle overflow.

**Rule: Once a clickable or readable element is on screen, it must not move unless the user does something.** The promise is about *rendered* content — text the user is reading, buttons/links/inputs they're about to click. If something is already painted, no in-place shift may happen without a user interaction triggering it. Shifts make the UI feel janky and — worse — cause fast users to mis-click when buttons move out from under their cursor.

A skeleton with no rendered text or interactions (just animated placeholders) doesn't constrain anything — when the body renders, no element is "moving," the body simply appears for the first time. The rule kicks in *the moment* a real button/link/text is on the page; from there, no reflows around it without user input.

**Corollary: render what you safely can as early as possible.** If a piece of content doesn't depend on a network call — page chrome, hardcoded copy, headers, breadcrumbs, navigation, anything bundled with the route — render it in the loading state too. The user sees more of the page sooner, and they can start reading or clicking it before the data lands. The constraint is just that anything you render early must land in its final position: if data arriving will push it around, leave it for later (or pre-reserve its spot). The trap to avoid is "render as much as possible and figure out the layout later" — that's what produces the jank this rule exists to stop.

Layout changes on the same page *after* user interaction (clicking a button that reveals more content) are more acceptable but still not ideal — prefer an animated transition over a jump when you do need to reflow. Navigating to a new page is fine; this rule is about in-place shifts. If you're unsure how to reconcile the design with this rule, or hit a genuine edge case (e.g. a countdown timer that must update continuously — `tabular-nums` keeps digit columns from reflowing), check in with me. One reasonable escape hatch for unavoidable reflow is to place clickable elements somewhere the shifting region won't push them.

### Loading & Disabled State

**Rule: A button must not visually re-enable between the click and the action actually finishing.** A click promises one outcome; the disabled/loading state has to persist all the way through to it — across any redirect, route transition, or panel/view swap that the success path triggers. React Query's `mutation.isPending` is not enough on its own: it flips false the moment React Query dispatches the success state, but `onSuccess` runs after that and any navigation/view-swap is later still — so the button briefly re-enables and a fast user can fire the action twice.

The pattern that works: hold a local `committing` boolean, flip it true *synchronously before* `mutate()` runs, and only clear it on outcomes where the user needs to retry (a `'full'` race, a thrown error). On outcomes where the page unloads (`window.location.href = …`) or the panel swaps to a different view (a query refetch flips the visible component), leave the flag set — the unmount/swap takes care of the rest. OR `committing` into the button's `disabled` and use it (not `isPending`) for the spinner. For internal Next.js route transitions, `useTransition`'s `isPending` follows the same shape and can be ORed in alongside.

Setting the flag *inside* `onSuccess` (or via a hook that does so) is too late and does not close the gap. The flag has to be live before any render after the click.

### Date & Time Formatting

**Rule: Pick the right tool for the date/time operation, and never use UTC as a stand-in for someone's local date.**

- **Display formatting.** `Intl` APIs and `next-intl` formatters. Shared helpers (`formatDate`, `formatTime`, `formatCurrency*`) live in `src/lib/utils.ts`. For relative time, `useFormatter().relativeTime()` from `next-intl`. The locale always comes from `useLocale()` (client) or `getLocale()` (server).
- **Local-date strings** (calendar keys, "today" markers, anything `YYYY-MM-DD`-shaped that means *today in someone's zone*). Use `formatInTimeZone(new Date(), tz, "yyyy-MM-dd")` from `date-fns-tz`. Pick the timezone deliberately: usually the entity's zone (e.g. `product.timezone`) for entity-local rendering, or the viewer's local zone (no explicit `timeZone`) for personal data. Never both implicitly.
- **Zone-to-zone conversion.** `fromZonedTime` / `toZonedTime` from `date-fns-tz` (already a project dep — see `src/lib/utils.ts`, `effective-status.ts`).
- **Anti-pattern: never write `new Date().toISOString().slice(0, 10)`.** That's the date in UTC, not anyone's local date — for any non-UTC viewer it's off-by-one near midnight and silently wrong everywhere else without anyone noticing. If you find yourself reaching for it, you want `formatInTimeZone` with an explicit zone instead.

### Locale vs. Spoken Language

**Rule: Use *locale* for the UI translation system and *spoken language* for human languages.** They are deliberately named differently because they are distinct concepts.

- **Locale** — which translation of the web app the user sees. Owned by `src/lib/constants/locales.ts` (`SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `LocaleProvider`, `LocalePicker`), backed by `profiles.locale`. This is what next-intl's `useLocale()` returns.
- **Spoken language** — the human languages a user speaks / a club is delivered in. Owned by the `spoken_languages` reference table and `profiles.spoken_languages` array. UI lives in `src/components/ui/spoken-language-checkboxes.tsx` and `useSpokenLanguages()`.

A Finnish-speaking parent could have `locale = "fi"` (app in Finnish) and `spoken_languages = ["en"]` (wants their child placed in English clubs). Don't conflate them. See `docs/i18n-architecture.md` § "Two distinct concepts".

**Rule: User-facing strings must be translated for every locale message file in `messages/`. Never leave placeholder copy or skip a locale. Best-effort translation is expected. Klingon (`tlh`) is an easter egg — fun and quirky takes are welcome, accuracy is not the goal there.**

### Styling
- Use `cn()` utility from `lib/utils.ts` for conditional classes
- Brand colors: primary yellow `#FAA901`, secondary purple `#8F00E2`
- Dark mode is default (class-based via next-themes)

**Rule: Never use hardcoded colors or raw Tailwind color classes (e.g. `text-sky-400`, `bg-red-500`).** All colors must come from CSS custom properties defined in `src/app/globals.css` and referenced via semantic Tailwind classes (`text-primary`, `bg-destructive`, etc.). For non-CSS contexts (email templates, canvas), use the hex constants in `src/lib/constants/colors.ts`. This ensures a single source of truth for colors and brand identity.

### UI Component Reference
A living style guide is available at `/admin/ui-components` (admin login required). It shows every component variant, composite patterns, and the color palette. **Reference this page before creating new UI patterns.** The source at `src/app/(dashboard)/admin/ui-components/page.tsx` serves as copy-paste examples.

### Groups

See `docs/groups-architecture.md` for the full architecture, component map, shared component patterns, and data flow. All group/enrollment mutations must go through the `commit_group_changes` RPC — never modify `product_groups` or `group_enrollments` directly.

### Customer Enrollment

See `docs/customer-enrollment-architecture.md` for the enrollment flow, refund logic, weekly charge cron, and component map.

### Voice Chat (Daily.co)

See `docs/voice-chat-architecture.md` for the full architecture, component map, permissions, and data flow. See `docs/chrome-webrtc-volume-bug.md` for the Web Audio workaround.

**Rule: Realtime hooks must only invalidate queries — never make Supabase data queries in callbacks.** Same deadlock risk as `onAuthStateChange`.

### Sorg Token Purchasing (Stripe)

See `docs/sorg-token-architecture.md` for the full architecture, component map, data flows, and fulfillment model. See `docs/stripe-testing.md` for local Stripe CLI testing setup.

**Rule: All token balance changes must go through the `adjust_token_balance()` RPC.** Never update `token_balance` directly.

**Rule: Token packages are defined in Stripe, not in code.** Products with `tokenAmount` metadata are fetched at runtime via `getStripeProducts()` (`src/lib/stripe/products.ts`) and cached for 5 minutes. The client sends a `priceId` (validated server-side against live Stripe products), never a price amount.

**Rule: The Stripe webhook is the sole fulfillment path for all token crediting.** Both handlers use idempotency checks + UNIQUE constraint on `stripe_idempotency_key`.

**Rule: Only customers can purchase tokens.** Admins can manually adjust via `POST /api/admin/adjust-tokens`.

**Rule: Subscription tier switches use `proration_behavior: "none"`.** The new tier starts on the next billing cycle. The switch route updates both Stripe subscription metadata and `customer_profiles.subscription_tier` immediately.

### Other Docs

- `docs/products-v2-architecture.md` — Unified products_v2 system: admin form, parent browse pages, registration pill, View+adapter card split
- `docs/products-redesign.md` — Design rationale for the v2 product redesign
- `docs/email-architecture.md` — Brevo integration, email templates, notifications, deliverability/DNS, and testing UI
- `docs/i18n-architecture.md` — next-intl setup, locale resolution, translation patterns, adding languages/namespaces
- `docs/SECURITY_REPORT.md` — Past security audit findings and remediations

## Environment Variables

All env vars are in `.env.local`. Keys for Supabase, Stripe, and Daily.co — including `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` used by CLI commands below.

## Database

Development uses the **remote** Supabase instance (configured in `.env.local`). A separate local Supabase instance (Docker) is used **only** for database integration tests (`npm run test:db`) — these run automatically in CI and optionally locally. See `docs/local-supabase.md`.

Migrations in `supabase/migrations/`. Seed data for local tests in `supabase/seed.sql`. After schema changes, regenerate types from the **remote** project:
```bash
supabase gen types typescript --project-id $SUPABASE_PROJECT_REF > src/types/database.types.ts
```
The `npm run supabase:gen-types` script uses `--local` which requires Docker. For this project (remote Supabase, no local Docker), always use the command above with the project ref from `.env.local`.

**Important:** The gen-types command may append a CLI upgrade warning to the output file. Always check and remove any trailing non-TypeScript text from `src/types/database.types.ts` after generation.

**Important:** `database.types.ts` is purely auto-generated — **never** hand-edit it, even as a shortcut when the remote DB hasn't been updated yet. Always push the migration first, then regenerate. Convenience type aliases (e.g., `Profile`, `UserRole`) live in `src/types/index.ts`. After regenerating, check whether new tables or enums need aliases added to `index.ts`.

### Remote Database Migrations

1. **Link the project** (first time only):
   ```bash
   supabase link --project-ref $SUPABASE_PROJECT_REF
   # Get the project ref from SUPABASE_PROJECT_REF in .env.local
   # Enter the database password from SUPABASE_DB_PASSWORD in .env.local when prompted
   ```

2. **Push migrations**:
   ```bash
   supabase db push -p "YOUR_DB_PASSWORD"
   ```
   The `-p` flag passes the database password inline, avoiding interactive prompts.
   The password is stored in `.env.local` as `SUPABASE_DB_PASSWORD`. Note: if the password contains `%`, double it to `%%` for shell escaping.

### Migration Workflow (important)

**Rule: When a migration adds or modifies functions/tables, push it to remote and regenerate types before committing.** DB tests and type-check depend on `database.types.ts` matching the schema. Since we don't run Docker locally, types are generated from the remote project. The full workflow for a migration PR:

1. Write the migration SQL file
2. Push to remote: `supabase db push -p "PASSWORD"`
3. Regenerate types (use `2>/dev/null` to suppress CLI warnings):
   ```bash
   supabase gen types typescript --project-id $SUPABASE_PROJECT_REF 2>/dev/null > src/types/database.types.ts
   ```
4. Check `src/types/index.ts` — add convenience aliases for any new tables/enums
5. Commit migration + updated types + tests together in the PR

This avoids a chicken-and-egg problem where tests reference functions that aren't in the generated types yet.

**Rule: To understand the current schema, read `database.types.ts` and `src/types/index.ts` — not migrations.** Migrations show the history of changes, not the current state. `database.types.ts` is auto-generated from the live schema and is always authoritative. Only read migration files when you need to understand RLS policies, grants, triggers, or function implementations — things the type generator doesn't capture.

**Rule: When writing RPCs with JOINs, verify `RETURNS TABLE` column nullability matches what the SQL actually produces.** PostgreSQL doesn't enforce `NOT NULL` on `RETURNS TABLE` columns, so the type generator infers from the base type alone — it can't see whether a column comes from an INNER JOIN (never null) or LEFT JOIN (sometimes null). After pushing and regenerating types, check the generated return type in `database.types.ts`. This is the one gap in the DB-to-TypeScript type chain: the compiler trusts the function signature, not the query.

**Fix pattern:** When the generated type has wrong nullability, add a corrected alias in `src/types/index.ts` using `Omit` + intersection — never hand-edit `database.types.ts`:
```typescript
type _Generated = Database["public"]["Functions"]["my_rpc"]["Returns"][number];
export type MyType = Omit<_Generated, "nullable_col"> & { nullable_col: string | null };
```

### Function & Table Access Control

**Rule: New PostgreSQL functions must be private by default.** After creating a function, add `REVOKE EXECUTE` from `authenticated`, `anon`, and `public` unless the function is intentionally called from the browser client. If the function IS public, add it to the allowlist in `tests/db/access-control.test.ts`. Extra care with `SECURITY DEFINER` functions — they bypass RLS, so a public grant is a privilege escalation vector.

**Rule: All new tables must enable RLS.** Add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and appropriate policies.

**Rule: RLS INSERT/UPDATE policies must authorize both the actor AND the target.** Checking only `column = auth.uid()` is insufficient — also verify the user is authorized to reference the target entity (prevents IDOR).

**Rule: Use `SELECT ... FOR UPDATE` in functions that read-then-write financial data** (e.g., token balances). Without row locking, concurrent requests can cause corruption or overdrafts.

The DB test `access-control.test.ts` enforces function and RLS rules — it queries PostgreSQL catalogs and fails if any non-allowlisted function is callable or any table lacks RLS.

## Testing

Tests are in `tests/` with four subdirectories: `unit/`, `integration/`, `db/`, and `e2e/`. Shared mock factories live in `tests/mocks/` — add new mocks there rather than duplicating across files.

### Classification Rules

| Category | What goes here | Convention |
|---|---|---|
| **unit** | Pure functions, service classes with injected mock dependencies, mapping/transform logic | `.test.ts`, Vitest |
| **integration** | Route handlers (import real POST/PATCH/GET), proxy, auth flows — full request pipeline with mocked external deps | `.test.ts`, Vitest |
| **db** | RPCs, constraints, RLS policies against real local Postgres | `.test.ts`, Vitest (`vitest.config.db.mts`) |
| **e2e** | Playwright browser tests against running dev server | `.spec.ts`, Playwright |

### DB Test Conventions

DB tests run against a real local Supabase (Docker). Shared helpers and constants live in `tests/db/`:
- `helpers.ts` — `createAdminTestClient()` (service-role, bypasses RLS) and `createAuthenticatedClient(email, password)` (signs in via auth, respects RLS). Also exports idempotent seed/reset helpers: `seedEnrollment()`, `resetTokenState()`, `resetEnrollmentState()`.
- `constants.ts` — `TEST_IDS` (deterministic UUIDs matching `supabase/seed.sql`), `TEST_CREDENTIALS` (email/password per role), and `SEED` values (balances, costs, names that must match seed data).

### Integration Test Conventions

Integration tests import route handlers directly and call them with mock `Request` objects:
```typescript
vi.mock("@/lib/auth", () => ({ requireRole: (...args) => mockRequireRole(...args) }));
import { POST } from "@/app/api/path/route";
const response = await POST(createRequest({ ... }));
```
Mock `requireRole()` to return `{ user, profile, supabase }` for authenticated scenarios or a `NextResponse` error for unauthorized. Mock Supabase clients (`@/lib/supabase/admin`, `@/lib/supabase/server`) with `vi.mock()`.

## Code Style

### Lint must be clean — treat warnings as design signals

**Rule: `npm run lint` must produce zero errors and zero warnings.** Our lint config is strict on purpose. When lint flags a line, resist the urge to silence it with a one-line patch (a cast, a disable comment, a throwaway rename). Stop and ask: *why* is the linter unhappy? The flagged line is usually a symptom — the real problem is often a design issue one or two levels up (wrong type at the boundary, a function doing two things, state living in the wrong place, a missing abstraction). Fix the underlying cause so the warning goes away naturally.

**Rule: Suppressing a lint rule (`eslint-disable`, `// @ts-expect-error`, etc.) requires strong justification and an inline `--` description explaining it.** Suppression is a last resort, not a shortcut. Only suppress when you've concluded the rule genuinely does not apply to this specific case — and write *why* directly next to the disable comment in the form `// eslint-disable-next-line some-rule -- reason here`. "Lint was noisy" is not a justification. This is mechanically enforced by `@eslint-community/eslint-comments/require-description` — an undescribed disable will fail lint.

### Non-obvious workarounds need comments
When code exists to work around a framework bug, environment quirk, or other non-obvious reason, add a comment explaining **why** it's needed. The code should be readable on its own — if someone would look at a line and wonder "why is this here?", it needs a comment.
