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

### E2E Tests with Real Database

Current E2E tests are smoke tests that verify pages render correctly but don't test actual Supabase interactions. Consider adding critical path tests that connect to staging:

- [ ] Add E2E tests for real auth flows (register, login, logout)
- [ ] Add E2E tests for customer adding a gamer
- [ ] Add E2E tests for core purchase flow
- [ ] Set up test user cleanup after each run

**Why:** RLS policies and role-based routing are complex enough that testing against the real DB catches integration bugs that mocked tests miss.

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

### Migrate Auth Email Templates to Brevo

Auth email templates (signup confirmation, password reset, etc.) are currently plain HTML in the Supabase dashboard. Moving them to Brevo would let non-technical team members design branded emails using Brevo's drag-and-drop visual editor with personalization variables.

- [ ] Create branded email templates in Brevo's visual editor (signup, password reset, magic link, etc.)
- [ ] Set up Supabase Auth Hooks or Edge Functions to send emails via Brevo's template API instead of Supabase's built-in templates
- [ ] Pass user data (name, email, confirmation URL) as template variables to Brevo

**Why:** Supabase's built-in templates are developer-edited HTML. Brevo's visual editor lets marketing/design team members own the email branding and content without code changes.

