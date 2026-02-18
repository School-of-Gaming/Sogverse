# Sogverse Deployment TODO

## Supabase Setup

- [ ] Create production Supabase project (`sogverse-prod`)
- [ ] Run database migrations on production:
  ```bash
  npx supabase link --project-ref $SUPABASE_PROJECT_REF
  npx supabase db push
  ```

## Vercel Setup

- [x] Import repo and link Vercel project
- [ ] Connect Git repository (requires public repo or Pro plan)
- [ ] Configure environment variables:

  **Production (main branch):**
  | Variable | Value |
  |----------|-------|
  | `NEXT_PUBLIC_SUPABASE_URL` | prod Supabase URL |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key |
  | `SUPABASE_SERVICE_ROLE_KEY` | prod service role key |

  **Preview (dev branch):**
  | Variable | Value |
  |----------|-------|
  | `NEXT_PUBLIC_SUPABASE_URL` | staging Supabase URL |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key |
  | `SUPABASE_SERVICE_ROLE_KEY` | staging service role key |

## GitHub Secrets (for CI/CD)

Go to: Repository → Settings → Secrets and variables → Actions

- [ ] `SUPABASE_PROD_PROJECT_REF` = (your prod project ref)

## Git Branches

- [x] Push `main` and `dev` branches

## Pre-Production Database Cleanup

Before deploying to production, squash all development migrations into a clean initial schema:

- [ ] Consolidate migrations into single `00001_initial_schema.sql`:
  ```bash
  # 1. Delete all files in supabase/migrations/
  # 2. Create clean 00001_initial_schema.sql with final schema
  # 3. Reset staging database to verify it works:
  #    - Clear migration history in Supabase Dashboard (SQL Editor):
  #      DELETE FROM supabase_migrations.schema_migrations;
  #    - Push fresh: npx supabase db push
  # 4. Commit the consolidated migration
  ```

**Why:** During development, we accumulate fix/repair migrations (00005, 00006, 00007, etc.). These clutter the history and make it hard to understand the final schema. Squashing gives production a clean starting point.

**Important:** Only do this BEFORE production has real users. After launch, you must keep all migrations for the audit trail.

## Post-Deployment Verification

- [ ] Verify staging deployment works on Vercel preview URL
- [ ] Verify production deployment works on Vercel production URL
- [ ] Test user registration flow
- [ ] Test login flow (email and gamer username)
- [ ] Verify RLS policies are working (users can only see their own data)

## Future Improvements

### E2E Tests with Local Supabase

Current E2E tests only cover unauthenticated flows (page renders, redirects). Authenticated tests (admin-only pages, role-based routing, CRUD operations) need real Supabase Auth + Postgres but shouldn't depend on the remote instance.

**Approach:** Run `supabase start` in CI to spin up a local Supabase stack (Postgres, Auth, Storage) in Docker. Existing migration files are applied automatically, giving an identical schema. Test accounts are created via `supabase/seed.sql`.

Setup tasks:
- [ ] Add `supabase/seed.sql` with test accounts (admin, customer, gedu, gamer) using known passwords
- [ ] Add `.env.test.local` with local Supabase URL/keys (`supabase start` prints these)
- [ ] Create Playwright auth setup project that logs in via the UI and saves `storageState` per role
- [ ] Update `playwright.config.ts` with auth setup project and role-specific test projects
- [ ] Add GitHub Actions step: `supabase start` → `npm run dev` (with test env) → `npx playwright test`

Test cases to add:
- [ ] Admin can view `/admin/products` (sees "Products" heading)
- [ ] Non-admin roles (customer, gedu, gamer) are redirected away from `/admin/*` to their own dashboard
- [ ] Admin can create a product via the add form
- [ ] Admin can edit an existing product
- [ ] Real auth flows (register, login, logout)
- [ ] Customer adding a gamer
- [ ] Core purchase flow

**Why:** RLS policies and role-based routing are complex enough that testing against a real DB catches integration bugs that mocked tests miss. Local Supabase keeps tests fast, deterministic, and free from network flakiness — and Docker is available by default in GitHub Actions runners.

### Brevo Domain Verification (Email Deliverability)

Brevo SMTP is configured in Supabase for transactional emails (signup, password reset). The `sog.gg` domain still needs to be authenticated to:
- Remove "via sendinblue.com" from sender info
- Improve deliverability (avoid spam folder)

Steps:
- [ ] In Brevo: go to **Senders & IP** > **Domains** > **Add domain** (`sog.gg`)
- [ ] Add the DNS TXT records Brevo provides (Brevo code + DKIM) to `sog.gg` DNS
- [ ] Verify in Brevo by clicking **Check Configuration**
- [ ] Rotate the Brevo SMTP key (current one was shared in plaintext) and update it in Supabase dashboard under **Authentication > SMTP Settings**

### Streamline CI/CD Pipeline

GitHub Actions and Vercel currently duplicate work (both do a full build), and Vercel deploys regardless of CI results. Align with best practice: let each tool do what it's good at.

- [ ] Remove the standalone `build` job from `.github/workflows/ci.yml` (Vercel handles builds)
- [ ] Remove Vercel deployment logic from CI (let Vercel's Git integration handle deploys)
- [ ] Simplify the `deploy` job to only run DB migrations + type generation on push to main
- [ ] Set up GitHub branch protection on `main` requiring CI checks (`lint-and-typecheck`, `test`, `e2e`) to pass before merging
- [ ] Verify Vercel preview deploys still work for PRs

**Why:** Currently the `build` job in CI is redundant with Vercel's build, and Vercel deploys even when CI fails. Branch protection prevents broken code from reaching production, while Vercel's preview deploys remain useful for PR review.

### Extract Shared Auth/Role-Check Helper for API Routes

All 14 API route handlers repeat the same 11-13 line boilerplate: `createClient()` → `getUser()` → query profile → check role → return 401/403. Each route also casts the profile result with hand-written inline types instead of using the generated `Profile` type from `@/types`.

- [ ] Create a shared `getAuthenticatedProfile()` helper (e.g. in `src/lib/auth.ts`) that accepts allowed roles and profile fields to select, returns a typed profile or an error response
- [ ] Replace the boilerplate in all 14 route handlers with a one-liner call to the helper

**Affected routes:** `checkout/tokens`, `checkout/subscription` (GET, cancel, resume, billing-portal), `admin/adjust-tokens`, `admin/create-gedu`, `admin/create-game`, `admin/create-product`, `admin/users/[id]/auth`, `gamers/create`, `voice/room` (POST + PATCH), `voice/token`.

**Why:** ~150 lines of pure duplication across the project. A shared helper makes adding new routes less error-prone.

### Use Generated Types in API Routes

All 14 API route handlers cast the Supabase profile query result with hand-written inline types (e.g. `profile as { role: string; stripe_customer_id: string | null } | null`) instead of using the generated `Profile` type from `@/types`. If a column is renamed or its type changes, these casts will silently become wrong.

- [ ] Replace all inline `as { role: string; ... }` casts with the generated `Database["public"]["Tables"]["profiles"]["Row"]` type (or a `Pick<>` of it)

**Affected routes:** Same 14 routes as the auth helper item above.

**Why:** Inline types drift out of sync with the schema. The generated type is always correct after `supabase:gen-types`.

### Consolidate Multiple Permissive RLS Policies

Every table has a separate `admin_full_access_*` permissive policy alongside role-specific permissive policies for the same action. PostgreSQL evaluates ALL permissive policies per query, which is suboptimal at scale. Merge overlapping policies into single combined policies with OR conditions.

Affected tables and actions (11 issues):
- [ ] `parent_gamer` — SELECT: `{admin_full_access, customers_view_own_links, gamers_view_parent_links}`
- [ ] `parent_gamer` — INSERT: `{admin_full_access, customers_create_links}`
- [ ] `parent_gamer` — DELETE: `{admin_full_access, customers_delete_own_links}`
- [ ] `profiles` — SELECT: `{admin_full_access, parents_view_linked_gamers, users_view_own_profile}`
- [ ] `profiles` — UPDATE: `{admin_full_access, users_update_own_profile}`
- [ ] `products` — SELECT: `{admin_full_access, public_view_active_products}`
- [ ] `token_transactions` — SELECT: `{admin_full_access, Users can read own transactions}`
- [ ] `voice_rooms` — SELECT: `{admin_full_access, gamer_view, gedu_manage_own, gedu_view_all}`
- [ ] `voice_rooms` — INSERT: `{admin_full_access, gedu_manage_own}`
- [ ] `voice_rooms` — UPDATE: `{admin_full_access, gedu_manage_own}`
- [ ] `voice_rooms` — DELETE: `{admin_full_access, gedu_manage_own}`

**Approach:** For each table/action, merge into a single policy using OR (e.g. `is_admin() OR id = auth.uid()`). Test thoroughly — incorrect merges can break RLS.

**When:** Before production launch or when table sizes grow large enough for this to matter.

### Clarify Service Class Pattern for Mixed Data Sources

Service classes (e.g. `TokensService`) mix two data-fetching patterns: some methods query Supabase directly via the injected client, while others use `fetch()` to call API routes (for operations that need server-side secrets like Stripe). The constructor-injected Supabase client is unused by the fetch-based methods.

- [ ] Decide on a convention: split into separate classes (e.g. `TokensReader` for Supabase queries, `TokensActions` for API calls), or document the mixed pattern as intentional
- [ ] Apply the chosen convention across all service classes

**Affected services:** `src/services/tokens/tokens.service.ts` (and any future services that need server-side API calls).

### Move Sign-In to Server-Side API Route

Login forms (`login-form.tsx`, `gamer-login-form.tsx`) currently call `supabase.auth.signInWithPassword()` on the browser client, which violates the "never use browser client for auth" rule. They work around the missing profile hydration by doing a full page navigation (`window.location.href`) after sign-in.

- [ ] Create `/api/auth/signin` API route (mirrors existing `/api/auth/signout` pattern)
- [ ] Move `signInWithPassword()` to the server-side route
- [ ] Return role/redirect path in the response so the form can navigate
- [ ] Update login forms to POST to the API route instead of using the browser client

**Why:** Consolidates all auth operations server-side, consistent with sign-out. Eliminates the browser Supabase client's GoTrueClient lock as a concern for auth flows entirely. See `docs/supabase-auth-lock-fix.md` for the lock deadlock context.

### Custom Email Verification (Non-Blocking)

Supabase's "Confirm email" setting is disabled to keep signup frictionless (users can register and pay immediately). However, this means `email_confirmed_at` on `auth.users` is auto-set to `NOW()` on signup — it's always populated and useless for tracking real verification. `supabase.auth.resend({ type: 'signup' })` also does nothing when confirmation is disabled.

**Goal:** Track which customers have actually verified their email, without blocking signup or payments. Gate certain actions behind verification later.

**Approach — custom token + SMTP email:**

1. Add `email_verified BOOLEAN DEFAULT false` column to `profiles` table
2. Add `email_verification_token TEXT` and `email_verification_expires_at TIMESTAMPTZ` columns (or encode everything in a signed JWT to avoid extra columns)
3. After signup, generate a secure token and send a verification email via SMTP (Brevo credentials already configured in Supabase — reuse the same SMTP host/port/user/password in `.env.local` with `nodemailer`)
4. Create `/api/auth/verify-email?token=xxx` route that validates the token, sets `email_verified = true` on the profile, and redirects to a success page
5. Create `/api/auth/resend-verification` route that generates a new token and sends another email
6. Update Settings page (`/settings`) to show verified/unverified status next to email, with a "Resend" button for unverified users
7. Update admin user detail page (`/admin/users/[id]`) to show verification badge (skip for gamer role — synthetic emails)
8. Gate specific features behind `email_verified` via RLS policies or service-layer checks (TBD which features)

**Scaffolding already in place:**
- `src/app/api/auth/resend-verification/route.ts` — exists but uses `supabase.auth.resend()` which doesn't work with confirmation disabled. Needs rewrite to use custom token + SMTP.
- `src/app/api/admin/users/[id]/auth/route.ts` — exists but returns `emailConfirmedAt` (useless). Needs rewrite to read `profiles.email_verified`.
- Settings page (`src/app/(dashboard)/settings/page.tsx`) — has UI for verified/unverified status next to email field, but reads `user.email_confirmed_at` (always set). Needs to read `profile.email_verified` instead.
- Admin user detail page (`src/app/(dashboard)/admin/users/[id]/page.tsx`) — has verification badge UI, but reads from the auth endpoint above. Needs to read `profile.email_verified` instead.

**Note:** Gamer accounts use synthetic emails (`{username}@gamer.sogverse.internal`) — skip verification for them entirely.

**Email sending options:**
- **Option A: SMTP + `nodemailer`** — Reuse the same Brevo SMTP credentials already configured in Supabase. Copy host/port/user/password to `.env.local`. Simple, no new accounts needed.
- **Option B: Brevo API + `@getbrevo/brevo`** — Get an API key from Brevo dashboard (SMTP & API > API Keys). Cleaner than raw SMTP, supports Brevo templates, better error handling and delivery tracking. Requires a Brevo API key in `.env.local`.

**Dependencies:**
- Brevo SMTP credentials or API key in `.env.local`
- `nodemailer` (Option A) or `@getbrevo/brevo` (Option B) package
- Database migration for new `profiles` columns

### Migrate Auth Email Templates to Brevo

Auth email templates (signup confirmation, password reset, etc.) are currently plain HTML in the Supabase dashboard. Moving them to Brevo would let non-technical team members design branded emails using Brevo's drag-and-drop visual editor with personalization variables.

- [ ] Create branded email templates in Brevo's visual editor (signup, password reset, magic link, etc.)
- [ ] Set up Supabase Auth Hooks or Edge Functions to send emails via Brevo's template API instead of Supabase's built-in templates
- [ ] Pass user data (name, email, confirmation URL) as template variables to Brevo

**Why:** Supabase's built-in templates are developer-edited HTML. Brevo's visual editor lets marketing/design team members own the email branding and content without code changes.

