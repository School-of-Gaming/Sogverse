# Sogverse Deployment TODO

## Supabase Setup

- [ ] Create production Supabase project (`sogverse-prod`)
- [ ] Run database migrations on production:
  ```bash
  npx supabase link --project-ref $SUPABASE_PROJECT_REF
  npx supabase db push
  ```
- [ ] Push auth config to production (syncs `otp_expiry`, `enable_confirmations`, etc. from `config.toml`):
  ```bash
  supabase config push
  ```

## Vercel Setup

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

## Pre-Production Database Cleanup

Before deploying to production, squash migrations again into a clean set for the prod DB:

- [ ] **Production squash:** Repeat the staging squash process (48 → 10 domain-organized files, verified via CI DB tests + `pg_dump` schema diff) for the final production release.

### Migration Squash Process

This was tested during the staging squash and worked well:

1. **Create branch** (`squash-migrations` or similar)
2. **Delete all migration files** from `supabase/migrations/`
3. **Write new squashed files** — manually synthesize from the originals, writing only the final state of each object. Don't use `pg_dump` (it can't capture `cron.schedule()`, `ALTER PUBLICATION`, `REPLICA IDENTITY FULL`, or inline comments)
4. **Preserve non-obvious comments** — keep comments that explain "why" (e.g., RLS recursion workaround, row locking rationale). Drop obvious ones.
5. **Push branch and let CI run** — `supabase start` in CI applies migrations to a fresh local Postgres and runs all DB tests. Fix failures and iterate.
6. **Schema diff for extra confidence** — dump the remote schema with `pg_dump --schema-only --schema=public --no-owner`, dump the local CI schema the same way (upload as CI artifact), and diff them. Expected differences: column ordering, comment text, policy/constraint names.
7. **Update remote tracking table** via psql:
   ```sql
   BEGIN;
   DELETE FROM supabase_migrations.schema_migrations;
   INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
     ('00001', '00001_extensions_and_helpers'),
     ('00002', '00002_profiles'), ...;
   COMMIT;
   ```
   **Critical:** The `version` column must be ONLY the numeric prefix (e.g., `00001`), not the full filename stem. The CLI extracts just the numeric prefix from local filenames for matching. The `name` column can hold the full stem for readability.
   This does NOT touch the actual schema — only updates which versions the CLI considers "applied".
8. **Regenerate types** from remote: `supabase gen types typescript --project-id $REF 2>/dev/null > src/types/database.types.ts`

**Key pitfalls from staging squash:**
- Supabase local Docker bootstraps default ALL grants on public tables — need explicit `REVOKE ALL` before restrictive `GRANT` (e.g., `parent_gamer`)
- Function overloads: only write the final signature
- `products.is_visible` should be `DEFAULT false NOT NULL`, `products.timezone` should have no default (force explicit)
- `cron.schedule()` is DML — will execute on `supabase db reset` and register the job (this is correct)
- Migration tracking `version` must be numeric prefix only (`00001`), not full stem (`00001_extensions_and_helpers`) — the CLI can't match otherwise

**Important:** Only squash BEFORE production has real users. After launch, keep all migrations for the audit trail.

## Post-Deployment Verification

- [ ] Verify staging deployment works on Vercel preview URL
- [ ] Verify production deployment works on Vercel production URL
- [ ] Test user registration flow
- [ ] Test login flow (email and gamer username)
- [ ] Verify RLS policies are working (users can only see their own data)

## Cleanup

- [ ] Remove `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` from `.github/workflows/ci.yml` after June 2, 2026 (Node.js 24 becomes the default runner)

## Future Improvements

### Add Open Graph Metadata & SEO Assets

Link previews on WhatsApp, Discord, Slack, Facebook, LinkedIn, and Twitter/X are driven by Open Graph (OG) tags. Currently no OG tags are set, so shared links show only the page title and URL — no preview image or styled card. Use [opengraph.xyz](https://opengraph.xyz) to test how previews render.

**Open Graph metadata (root layout):**
- [ ] Add `openGraph` to the root layout metadata — `og:title`, `og:description`, `og:image`, `og:url`, `og:site_name`
- [ ] Add `twitter` card metadata — `twitter:card` (`summary_large_image`), `twitter:title`, `twitter:description`, `twitter:image`
- [ ] Create an OG image (1200x630px) — branded banner with logo, "School of Gaming" tagline, yellow/purple brand colors. Place as `src/app/opengraph-image.png` (Next.js serves it automatically) or in `public/`

**Per-page OG overrides (public & auth pages):**

All 17 pages already export a `description` in their `metadata`, but none set `openGraph`. Pages that are shareable via link should override `openGraph` so previews show page-specific titles, descriptions, and (optionally) images instead of the root layout defaults.

Priority pages (public-facing, most likely to be shared):
- [ ] `/about` — "Learn about Sogverse and our mission to make learning fun"
- [ ] `/sorg` — "Learn about Sorg, the virtual currency of the Sogverse..."
- [ ] `/login` — "Sign in to your Sogverse account"
- [ ] `/register` — "Create your Sogverse parent account"

Lower priority (auth/dashboard pages — less likely to be shared, but descriptions exist):
- `/forgot-password`, `/reset-password` — auth flows
- `/admin`, `/customer`, `/gamer`, `/gedu` — dashboard homepages
- `/{role}/groups`, `/{role}/groups/[id]`, `/{role}/voice/[id]` — groups & voice subpages (admin, gedu, gamer)

**SEO static assets:**
- [ ] `robots.txt` — block crawlers from authenticated routes (`/admin`, `/customer`, `/gamer`, `/gedu`). Use `src/app/robots.ts` for App Router convention.
- [ ] `sitemap.xml` — index public pages for search engines. Use `src/app/sitemap.ts` for App Router convention.

**Already in place:** Favicon (`src/app/icon.svg`), apple touch icon (`src/app/apple-icon.png`), and per-page `description` metadata on all 17 pages.

**When:** Before production launch or when public-facing pages need SEO visibility.

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

### Production Domain & Deployment

- [ ] Deploy to production on Vercel (push to `main` or trigger production build)
- [ ] Add `sogverse.sog.gg` domain in Vercel (production environment)
- [ ] Add `CNAME` record in Nordname: `sogverse` → `cname.vercel-dns.com.`
- [ ] Create Stripe **live mode** webhook endpoint pointing to `https://sogverse.sog.gg/api/webhooks/stripe`
- [ ] Add the live mode `STRIPE_WEBHOOK_SECRET` to Vercel production environment

### Consolidate Multiple Permissive RLS Policies

Every table has a separate `admin_full_access_*` permissive policy alongside role-specific permissive policies for the same action. PostgreSQL evaluates ALL permissive policies per query, which is suboptimal at scale. Merge overlapping policies into single combined policies with OR conditions.

Affected tables and actions (8 issues):
- [ ] `parent_gamer` — SELECT: `{admin_full_access, customers_view_own_links, gamers_view_parent_links}`
- [ ] `parent_gamer` — INSERT: `{admin_full_access, customers_create_links}`
- [ ] `parent_gamer` — DELETE: `{admin_full_access, customers_delete_own_links}`
- [ ] `profiles` — SELECT: `{admin_full_access, parents_view_linked_gamers, users_view_own_profile}`
- [ ] `profiles` — UPDATE: `{admin_full_access, users_update_own_profile}`
- [ ] `products` — SELECT: `{admin_full_access, public_view_active_products}`
- [ ] `token_transactions` — SELECT: `{admin_full_access, Users can read own transactions}`
- [ ] `voice_rooms` — SELECT: `{admin_full_access, gedu_view_voice_rooms, gamer_view_enrolled_voice_rooms}`

**Approach:** For each table/action, merge into a single policy using OR (e.g. `is_admin() OR id = auth.uid()`). Test thoroughly — incorrect merges can break RLS.

**When:** Before production launch or when table sizes grow large enough for this to matter.

### Replace Intl.DateTimeFormat Timezone Hacking with `date-fns-tz`

Internal timezone math uses `Intl.DateTimeFormat("en-US", { timeZone })` + `formatToParts` as a workaround to convert between timezones — formatting a date to a locale string, then parsing the numbers back out. This works but is fragile and confusing. The `"en-US"` locale is pinned solely to guarantee Arabic numerals. The shared `wallClockToUtc()` in `utils.ts` consolidates this logic (used by both `formatScheduleLocal()` and `enrollment.ts`).

`date-fns-tz` provides clean APIs (`fromZonedTime`, `toZonedTime`) that do timezone conversion directly without the format-then-parse roundtrip. This would:
- Replace `wallClockToUtc()` with a one-liner
- Eliminate `getWallClockPart()` and `getWallClockDayOfWeek()` helpers in `enrollment.ts` entirely
- Remove all internal `"en-US"` usages, leaving only browser-locale display formatting

**Affected files:** `src/lib/utils.ts` (wallClockToUtc), `src/lib/enrollment.ts` (getWallClockPart, getWallClockDayOfWeek)

**Why:** Cleaner code, less surface area for bugs (like the `"HH:MM:SS"` parsing issue), and a standard approach used across the industry. The current code works correctly but is unnecessarily complex.

### Clarify Service Class Pattern for Mixed Data Sources

Service classes (e.g. `TokensService`) mix two data-fetching patterns: some methods query Supabase directly via the injected client, while others use `fetch()` to call API routes (for operations that need server-side secrets like Stripe). The constructor-injected Supabase client is unused by the fetch-based methods.

- [ ] Decide on a convention: split into separate classes (e.g. `TokensReader` for Supabase queries, `TokensActions` for API calls), or document the mixed pattern as intentional
- [ ] Apply the chosen convention across all service classes

**Affected services:** `src/services/tokens/tokens.service.ts` (and any future services that need server-side API calls).

### Custom Email Verification (Non-Blocking)

Supabase's "Confirm email" setting is disabled to keep signup frictionless (users can register and pay immediately). However, this means `email_confirmed_at` on `auth.users` is auto-set to `NOW()` on signup — it's always populated and useless for tracking real verification. `supabase.auth.resend({ type: 'signup' })` also does nothing when confirmation is disabled.

**Goal:** Track which customers have actually verified their email, without blocking signup or payments. Gate certain actions behind verification later.

**Why not Supabase's built-in confirmation?** Supabase's `enable_confirmations` is binary — either it blocks sign-in until the email is verified, or it auto-confirms and never sends a verification email. There is no "send verification but allow unverified sign-in" option ([GitHub Issue #5113](https://github.com/supabase/supabase/issues/5113)). `config.toml` must stay at `enable_confirmations = false` across staging and production (pushed via `supabase config push`).

**Approach — custom token + Brevo API:**

1. Add `email_verified BOOLEAN DEFAULT false` column to `profiles` table
2. Add `email_verification_token TEXT` and `email_verification_expires_at TIMESTAMPTZ` columns (or encode everything in a signed JWT to avoid extra columns)
3. After signup, generate a secure token and send a verification email via SMTP (Brevo credentials already configured in Supabase — reuse the same SMTP host/port/user/password in `.env.local` with `nodemailer`)
4. Create `/api/auth/verify-email?token=xxx` route that validates the token, sets `email_verified = true` on the profile, and redirects to a success page
5. Create `/api/auth/resend-verification` route that generates a new token and sends another email
6. Update Settings page (`/settings`) to show verified/unverified status next to email, with a "Resend" button for unverified users
7. Update admin user detail page (`/admin/users/[id]`) to show verification badge (skip for gamer role — synthetic emails)
8. Gate specific features behind `email_verified` via RLS policies or service-layer checks (TBD which features)

**UI removed (was non-functional):** The verification UI and its backing API routes were removed because `email_confirmed_at` is always set (useless) and `supabase.auth.resend()` is a no-op with confirmation disabled. When implementing this feature, re-add:
- Settings page (`src/app/(dashboard)/settings/page.tsx`) — verified/unverified badge next to email field, with "Resend verification" button for unverified users. Read `profile.email_verified` instead of `user.email_confirmed_at`.
- Admin user detail page (`src/app/(dashboard)/admin/users/[id]/page.tsx`) — verification badge next to email in user summary card. Read `profile.email_verified` directly (no separate API call needed).
- `src/app/api/auth/resend-verification/route.ts` — recreate using custom token + Brevo instead of `supabase.auth.resend()`.
- `src/app/api/admin/users/[id]/auth/route.ts` — recreate to return `profile.email_verified` if needed (or just query profiles directly from the admin page).

**Note:** Gamer accounts use synthetic emails (`{username}@gamer.sogverse.internal`) — skip verification for them entirely.

**Email sending:** Use the Brevo API wrapper (`src/lib/brevo.ts`) already set up with `BREVO_API_KEY` and verified sender `sogverse@sog.gg`.

**Dependencies:**
- Database migration for new `profiles` columns

### Parent-Managed Gamer Profile Fields (DOB, Gender)

Customers (parents) will set `date_of_birth` and `gender` on their linked gamers. When implemented, add a "Parents can update linked gamer profiles" UPDATE policy on `gamer_profiles` using `is_parent_of(user_id)` and consider restricting the current "Gamers can update own gamer_profile" policy. Age should be derived from `date_of_birth`, never stored directly.

### Multi-Parent Gamer Linking

The IDOR fix (Security Report Finding #2) removed client-side INSERT access to `parent_gamer`. Currently the only way to link a parent to a gamer is when the parent creates the gamer via `POST /api/gamers/create`.

To support a second parent linking to an existing gamer:

- [ ] Choose an authorization mechanism (invite code, existing parent approval, or admin-only)
- [ ] Create a server-side API route (e.g., `POST /api/gamers/link`) that validates authorization before inserting into `parent_gamer` using the admin client
- [ ] Add UI for the chosen flow (e.g., "Share invite code" button for existing parent, "Enter code" form for second parent)

**Why:** The previous client-side INSERT policy only checked `parent_id = auth.uid()`, allowing any customer to link to any gamer. The fix correctly removed this, but a secure server-side path is needed if multiple parents per gamer is a requirement.

### Use Identicon Avatars in Email Templates

The identicon generator (`src/lib/identicon.ts`) creates unique SVG avatars from user IDs. These could be embedded in email templates to make them more personal and visually recognizable — e.g., showing a gamer's identicon next to their name in enrollment/unenrollment emails, or in group change notifications.

- [ ] Investigate rendering identicons as inline SVG or data URIs for email client compatibility
- [ ] Add identicon next to gamer names in enrollment confirmation emails
- [ ] Add identicon next to gamer names in group change notification emails

**Caveat:** Email client SVG support is inconsistent (Gmail strips `<svg>` tags). May need to render identicons as PNG via a server-side route (e.g., `GET /api/identicon/[id].png`) and reference via `<img>` tag, or use inline `data:image/svg+xml` URIs.

### Migrate Auth Email Templates to Brevo Visual Editor

Auth email templates (signup confirmation, password reset, etc.) are currently plain HTML in the Supabase dashboard. Moving them to Brevo would let non-technical team members design branded emails using Brevo's drag-and-drop visual editor with personalization variables.

- [ ] Create branded email templates in Brevo's visual editor (signup, magic link, etc. — password reset already code-owned)
- [ ] Set up Supabase Auth Hooks or Edge Functions to send emails via Brevo's template API instead of Supabase's built-in templates
- [ ] Pass user data (name, email, confirmation URL) as template variables to Brevo

**Why:** Supabase's built-in templates are developer-edited HTML. Brevo's visual editor lets marketing/design team members own the email branding and content without code changes.

