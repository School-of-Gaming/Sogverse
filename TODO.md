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

- [ ] `SUPABASE_ACCESS_TOKEN` - Personal access token from [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
- [ ] `SUPABASE_STAGING_PROJECT_REF` = `dbcozhkmfsczwgduizkg`
- [ ] `SUPABASE_PROD_PROJECT_REF` = (your prod project ref)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` = `https://dbcozhkmfsczwgduizkg.supabase.co` (staging, for CI builds)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` = staging anon key (for CI builds)

## Git Branches

- [x] Push `main` branch (production)
- [ ] Create and push `dev` branch (staging):
  ```bash
  git checkout -b dev
  git push -u origin dev
  ```

## Post-Deployment Verification

- [ ] Verify staging deployment works on Vercel preview URL
- [ ] Verify production deployment works on Vercel production URL
- [ ] Test user registration flow
- [ ] Test login flow (email and gamer username)
- [ ] Verify RLS policies are working (users can only see their own data)
