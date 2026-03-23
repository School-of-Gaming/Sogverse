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

### Replace Intl.DateTimeFormat Timezone Hacking with `date-fns-tz`

Internal timezone math uses `Intl.DateTimeFormat("en-US", { timeZone })` + `formatToParts` as a workaround to convert between timezones — formatting a date to a locale string, then parsing the numbers back out. This works but is fragile and confusing. The `"en-US"` locale is pinned solely to guarantee Arabic numerals. The shared `wallClockToUtc()` in `utils.ts` consolidates this logic (used by both `formatScheduleLocal()` and `enrollment.ts`).

`date-fns-tz` provides clean APIs (`fromZonedTime`, `toZonedTime`) that do timezone conversion directly without the format-then-parse roundtrip. This would:
- Replace `wallClockToUtc()` with a one-liner
- Eliminate `getWallClockPart()` and `getWallClockDayOfWeek()` helpers in `enrollment.ts` entirely
- Remove all internal `"en-US"` usages, leaving only browser-locale display formatting

**Affected files:** `src/lib/utils.ts` (wallClockToUtc), `src/lib/enrollment.ts` (getWallClockPart, getWallClockDayOfWeek)

**Why:** Cleaner code, less surface area for bugs (like the `"HH:MM:SS"` parsing issue), and a standard approach used across the industry. The current code works correctly but is unnecessarily complex.

### Parent-Managed Gamer Profile Fields (DOB, Gender)

Customers (parents) will set `date_of_birth` and `gender` on their linked gamers. When implemented, add a "Parents can update linked gamer profiles" UPDATE policy on `gamer_profiles` using `is_parent_of(user_id)` and consider restricting the current "Gamers can update own gamer_profile" policy. Age should be derived from `date_of_birth`, never stored directly.

### Multi-Parent Gamer Linking

The IDOR fix (Security Report Finding #2) removed client-side INSERT access to `parent_gamer`. Currently the only way to link a parent to a gamer is when the parent creates the gamer via `POST /api/gamers/create`.

To support a second parent linking to an existing gamer:

- [ ] Choose an authorization mechanism (invite code, existing parent approval, or admin-only)
- [ ] Create a server-side API route (e.g., `POST /api/gamers/link`) that validates authorization before inserting into `parent_gamer` using the admin client
- [ ] Add UI for the chosen flow (e.g., "Share invite code" button for existing parent, "Enter code" form for second parent)

**Why:** The previous client-side INSERT policy only checked `parent_id = auth.uid()`, allowing any customer to link to any gamer. The fix correctly removed this, but a secure server-side path is needed if multiple parents per gamer is a requirement.
