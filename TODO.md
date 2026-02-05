# Sogverse Deployment TODO

## Supabase Setup

- [x] Create staging Supabase project (`sogverse-staging`)
- [x] Run database migrations on staging
- [ ] Create production Supabase project (`sogverse-prod`)
- [ ] Run database migrations on production:
  ```bash
  npx supabase link --project-ref YOUR_PROD_PROJECT_REF
  npx supabase db push
  ```

## Vercel Setup

- [ ] Import repo at [vercel.com/new](https://vercel.com/new)
- [ ] Configure environment variables:

  **Production (main branch):**
  | Variable | Value |
  |----------|-------|
  | `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR_PROD_PROJECT.supabase.co` |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key |
  | `SUPABASE_SERVICE_ROLE_KEY` | prod service role key |

  **Preview (dev branch):**
  | Variable | Value |
  |----------|-------|
  | `NEXT_PUBLIC_SUPABASE_URL` | `https://dbcozhkmfsczwgduizkg.supabase.co` |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key |
  | `SUPABASE_SERVICE_ROLE_KEY` | staging service role key |

## GitHub Secrets (for CI/CD)

Go to: Repository → Settings → Secrets and variables → Actions

- [x] `SUPABASE_ACCESS_TOKEN` - Personal access token from [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
- [x] `SUPABASE_STAGING_PROJECT_REF` = `dbcozhkmfsczwgduizkg`
- [ ] `SUPABASE_PROD_PROJECT_REF` = (your prod project ref)
- [x] `NEXT_PUBLIC_SUPABASE_URL` = staging URL (for CI builds)
- [x] `NEXT_PUBLIC_SUPABASE_ANON_KEY` = staging anon key (for CI builds)

## Git Branches

- [x] Push `main` branch (production)
- [x] Create and push `dev` branch (staging)

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
