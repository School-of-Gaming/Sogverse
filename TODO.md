# Sogverse TODO

## Cleanup

- [ ] **Tear out the v1 groups UI now that its voice surface is a no-op.** When the v1 voice room system (table + RPCs + token branch) was deleted, the Join buttons and lounge cards on the admin/gedu/customer v1 groups surface were left in place but neutered (rendered disabled, no click handler). The pages are still navigable and still display group/lounge metadata via `useMyGroups` + `useGroupsWithVoice`, but a user clicking "Join" gets nothing. Cleanup: delete `src/app/(dashboard)/admin/groups/`, `src/app/(dashboard)/gedu/groups/`, `src/app/(dashboard)/parent/gamers/page.tsx` and `src/app/(dashboard)/parent/groups/[id]/page.tsx` along with their content components (`AdminGroupsPageContent`, `GeduGroupsPageContent`, `AdminGroupDetailContent`, `GeduGroupDetailContent`, `CustomerGroupDetailContent`), the shared `GroupsListContent`/`GroupDetailContent`/`LoungeCard`/`GroupCard` UI primitives, the `useGroupsWithVoice` hook, and the `useMyGroups` query — plus their tests and translation keys (`groups.adminLounge*`, `groups.geduLounge*`, `groups.allGroups*`, `groups.yourGroups*`). Also drop `voiceIsOpen`/`voiceNextSessionStart` plumbing from `GroupCard` and remove the `lounges` prop from `GroupsListContent` (currently empty arrays from both call sites). Coordinates with the existing "Delete orphaned parent/gamer sub-routes" item below — these are the same routes.
- [ ] **`GroupDetailContent.tsx:190` hides age display when gamer has no gender.** With migration `00055` (gender nullable) and the Add Gamer v1 flow making gender optional, the `gamer.dateOfBirth && gamer.gender` check now silently drops the entire age/gender detail row for v1 gamers — both pieces of info disappear, not just gender. Fix is straightforward (split into independent conditional spans, render the wrapper if either is present) but the file is slated for deprecation, so noted here rather than patched. While doing it, also retype `GroupGamer.gender` in `groups.service.ts:10` from `string` to `string | null` so future consumers get a compile-time signal about the null case.
- [ ] **Delete `SwitchToGamerDialog` once the family selector fully replaces it.** `src/components/customer/SwitchToGamerDialog.tsx` is the older confirmation-modal path for parent→gamer switching, used by `parent/gamers/page.tsx` and `CustomerGroupDetailContent.tsx`. The new `FamilyProfileSelector` (on `/parent#my-family` and `/gamer#my-family`) does the same switch in one click against the same `/api/auth/switch-account` endpoint. Two paths to the same intent risks divergence (e.g. if a parent-PIN gate is added for gamer→parent, it's easy to add it in one path and forget the other). Kill the dialog after deciding what should replace its in-context entry points (or just inline a one-tile selector in those spots), and prune the related `theme-audit-findings.md` follow-up about promoting its `info`-coloured button to a Button variant.
- [ ] **Delete orphaned parent/gamer sub-routes left behind by the unified-navbar single-page-scroll redesign.** When the parent and gamer dashboards moved to the in-page section-pill UX (My Family / [Yty] / Feedback / Settings on `/parent` and `/gamer`), the sidebar and the dashboard quick-action cards that linked to these routes were removed. The routes themselves still resolve, but no in-app navigation points at them anymore — they're reachable only by typing the URL or following an external/email link. Replace each one (or its functionality) inside the new dashboard sections, then delete:
  - `src/app/(dashboard)/parent/gamers/page.tsx` and `src/app/(dashboard)/parent/gamers/[id]/page.tsx` — to be replaced by real content inside the parent's `#my-family` section.
  - `src/app/(dashboard)/parent/groups/[id]/page.tsx` — parent group-detail view; entry point gone.
  - `src/app/(dashboard)/gamer/groups/page.tsx` and `src/app/(dashboard)/gamer/groups/[id]/page.tsx` — to be replaced by content inside the gamer's `#my-family` (or a new groups section). The voice chat at `src/app/(dashboard)/gamer/voice/[id]/page.tsx` is currently entered via the groups → group-detail chain, so do NOT delete `voice/[id]` until a new path into a live session exists.
  - `customer` and `gamer` entries in `navItemsByRole` in `src/components/layout/sidebar.tsx` — dead config now that the sidebar no longer renders for those roles. Safe to delete after the routes above are gone.
  - Sidebar-only translation keys that exclusively serve those entries (`sidebar.myGamers`, `sidebar.home`, `sidebar.myGroups` in en/fi/sv/tlh) once the config above is dropped.
- [ ] **(Time-sensitive) Restore an in-app entry point to `/gamer/groups` (and through it, voice chat at `/gamer/voice/[id]`) before deleting either route.** The single-page-scroll redesign hides the sidebar for gamers, and the "My Groups" card on the gamer dashboard was removed when sections moved to in-page scroll. Result: a gamer can no longer reach a live voice session through the UI — only by direct URL or external/email link. Either drop a temporary link/card inside `#my-family` pointing at `/gamer/groups`, or fold groups content into a new `#groups` section before the route deletion above happens.
- [ ] **Add hash-anchor deep-link support to the section pills** (both `src/components/layout/dashboard-section-pill.tsx` and `src/components/home/section-pill.tsx` have the same gap):
  - **Inbound:** the pill does not honour `location.hash` on initial load — landing on `/parent#feedback` (or `/?#yty`) from an external link won't auto-scroll to the section.
  - **Outbound:** the click handlers call `e.preventDefault()` and never push the hash, so the URL stays at `/parent` regardless of which pill is active. Even within the page, the hash never reflects the user's position.
  - Fix: add `history.replaceState(null, "", "#${id}")` to each click handler, and on mount read `location.hash` and `scrollIntoView` to it. Apply to both pills.
- [ ] **`NextSessionCard` shows a "Live" Join button that does nothing for in-person products and unassigned participations.** `src/lib/upcoming-sessions.ts:63-66` collapses `voiceHref` to `"#"` when `!product.isRemote || !row.groupId` (the latter is a v2 unassigned participation, redesign §4.10), but `voiceIsOpen` is still flipped to true purely on the window math at line 109. Result: the gamer dashboard renders `<Link href="#">` and the parent dashboard's `onJoinClick` no-ops via `if (session.voiceHref === "#") return;` — a button that looks indistinguishable from a working live join. Fix is small: fold the destination into `voiceIsOpen` (`liveWindow && voiceHref !== "#"`) so these rows render in their locked state, or hide the button when `voiceHref === "#"`. Only matters for the two cases above; remote+assigned rows are fine.
- [ ] **Parent Sessions section drops the Join CTA for the second of two simultaneously-live sessions.** `src/components/parent/SessionsSection.tsx` promotes only the soonest session to `NextSessionCard` (full live/locked CTA + countdown + reports); every other session renders as an info-only `UpcomingSessionCard`. When two of a parent's kids have sessions whose buffer windows overlap, the second live one shows up without a way to join from the dashboard. Acceptable for now because (a) the schedule overlap is rare in practice and (b) the voice room button is currently unwired anyway (`voiceHref="#"` from `src/lib/upcoming-sessions.ts`, no-op on click). Revisit once `voiceHref` is wired (watch-mode vs. switch-to-gamer). Options considered: promote every live session to `NextSessionCard`, mirroring `useGroupsWithVoice`'s live-first sort; or keep a singular `NextSessionCard` and let `UpcomingSessionCard` grow a small Join button when live.
- [ ] **Sub-routes under `/parent/*` and `/gamer/*` have no back-affordance now that the sidebar is gone.** Reaching `/parent/gamers/[id]`, `/gamer/groups/[id]`, `/gamer/voice/[id]`, etc. leaves the user with only the header avatar to return to the dashboard root — no breadcrumb, no back link. Acceptable transient state because these routes are slated for deletion (see first item), but if any of them outlive the cleanup, add an in-page back link.
- [ ] Remove `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` from `.github/workflows/ci.yml` after June 2, 2026 (Node.js 24 becomes the default runner)
- [ ] Add CHECK constraints to `profiles.locale` (`IN ('en', 'fi', 'sv', 'tlh')`) and `profiles.currency` (`IN ('EUR', 'SEK', 'USD', 'GBP')`) — both are plain text columns with app-level validation only
- [ ] **Enforce required `last_name` on the parent register API and `profiles.last_name` column.** `RegisterForm` now marks last name `required` (UX-only), but `supabase.auth.signUp` accepts any `options.data` payload and the `profiles.last_name` column is nullable — a scripted/API caller can still create a parent account with no last name. Tighten the server side to match: add a NOT NULL + length check on `profiles.last_name` (after backfilling any existing nulls — check whether the trigger that creates the profile row from `auth.users.raw_user_meta_data` needs adjusting too), and validate the field in whatever server-side path handles parent signup.
- [ ] **Make `/api/gamers/create` atomic via an RPC, with auth-user cleanup on failure.** Today the route in `src/app/api/gamers/create/route.ts` runs four separate admin-client calls in sequence — `auth.admin.createUser` → `profiles.update` (promote to `gamer`) → `gamer_profiles.insert` (and optional `minecraft_accounts.insert`) → `parent_gamer.insert` — with no transaction. Any failure after step 1 leaves debris: a half-promoted `gamer` profile with no parent link, or a customer-role profile stuck with a `@gamer.sogverse.internal` email. Confirmed in prod on 2026-05-17 — good-faith API fuzzing left 3 orphan `gamer` profiles + 2 stuck-customer profiles by hitting the endpoint directly with weird-Unicode payloads (cuneiform `first_name`) that bypassed the UI-side validators. Fix shape: move steps 2–4 into a single `create_gamer` `SECURITY DEFINER` RPC running in one transaction, and on RPC failure have the route call `auth.admin.deleteUser(gamerId)` to roll back step 1. Step 1 can't fold into the RPC — `auth.admin.createUser` is an HTTP call to gotrue, not SQL — so the narrow remaining gap is a process death between createUser and the RPC, a much smaller window than today's four-step exposure. Clean up the existing 5 debris records (3 orphan gamers + 2 stuck customer-role profiles with synthetic gamer emails) in the same PR.
- [ ] **Eliminate the extra reload on first-device-login for locale-dependent SSR.** `LocaleProvider` currently reconciles a stale `locale` cookie with `profile.locale` on mount and calls `router.refresh()`, which produces a visible second render on the first page after signing in on a new device. The underlying issue: next-intl's `getRequestConfig` runs before auth is available and can only read cookies/headers, so a client-side reconciliation step is the only option. This is a canary — any future pre-render preference (timezone, theme-critical CSS, feature flags, anything that needs to be baked into SSR output) will hit the same pattern where "cookie is a cache of profile state" and new devices always miss the cache. Two architectural fixes worth considering: (a) write preference cookies server-side during the auth callback so SSR sees them on the very next request (cheap per login, no per-render cost), or (b) thread the authenticated user through `getRequestConfig` so it can read the profile directly (per-request DB cost but no divergence possible). (a) is the better default.
- [ ] **Split invite and password-reset OTP expiry.** `supabase/config.toml` `auth.email.otp_expiry` is set to 259200 (72 hours) so gedu invite links stay valid over a weekend. The setting is global across *all* email OTPs, so password reset links also live for 72h — longer than ideal for a credential-reset flow. Fix: move gedu invites to a custom flow (server-side invite table with its own TTL, admin-generated one-shot token, exchanged for a Supabase session on click) and drop the config.toml value back to 3600. Relates to `src/app/api/admin/create-gedu/route.ts` and `src/components/auth/setup-account-form.tsx`.
- [ ] **Move email auth links to a scanner-resistant token_hash flow.** Our gedu invite and password-reset emails currently embed Supabase's `/auth/v1/verify?token=...` URL directly (from `generateLink().properties.action_link`). That URL is a bare HTTP GET that Gmail/Outlook/enterprise SafeLinks/Proofpoint etc. **prefetch**, consuming the single-use OTP before the real user clicks. Symptom: user clicks the email, lands on `/setup-account#error=otp_expired`, sees "Unauthorized" or an empty form. Observed once in the 2026-04-14 Finnish gedu batch (Viljamaria — Gmail scanner at IP `172.253.15.237` clicked 40s after send). Roughly 1 in 13 today; will get worse on Outlook/M365 recipients. Fix: switch to the token_hash pattern — `generateLink` also returns `properties.hashed_token`; embed our own domain (e.g. `https://sogverse.sog.gg/accept-invite?token_hash={hash}&type=invite`) and have that page call `supabase.auth.verifyOtp({ token_hash, type })` from client JS on mount. Scanners don't execute JS, so the hash survives. Apply to `gedu-invite.ts`, `password-reset.ts`, and whatever other `generateLink` usages exist. Monitor first; revisit if it bites more users.
- [ ] **Work through `docs/theme-audit-findings.md`.** The codebase-wide theme audit in PR #14 catalogued soft findings that weren't auto-fixed — intentional exceptions, shadcn primitive patterns, and style judgment calls. Most are "leave alone, just flagged for visibility," but a few are genuine TODOs worth revisiting (e.g. promoting the `info`-coloured button in `SwitchToGamerDialog` to a Button variant, theming the voice avatar speaking glow if we ever want it to follow the palette). Review the doc, file follow-ups for any item you want to act on, and prune items as decisions are made.
- [ ] **Remove Mouseflow integration after Beta ends.** This is a temporary session-recording / consent-banner setup added to learn how users interact with the site. To remove it cleanly:
  1. Delete `src/components/layout/mouseflow-consent.tsx`
  2. Remove the `MouseflowConsent` export from `src/components/layout/index.ts`
  3. Remove the `MouseflowConsent` import and `<MouseflowConsent />` render from `src/app/layout.tsx`
  4. Remove `https://*.mouseflow.com` (and its comment) from the `connect-src` line in `src/proxy.ts`
  5. Remove the `"mouseflow"` namespace from `messages/en.json`, `messages/fi.json`, and `messages/sv.json`
  6. Delete all recorded sessions in the Mouseflow dashboard and close/downgrade the Mouseflow account
  7. Sanity check: `git grep -i mouseflow` should return nothing
- [ ] **Retire `public.is_admin()` in favour of inline `get_user_role() = 'admin'`.** Both functions exist today (`supabase/migrations/00002_profiles.sql`) and are behaviourally identical — `is_admin()` is a thin wrapper. Current usage is already skewed toward the inline form (~55 uses of `get_user_role() = 'admin'` vs. ~8 of `is_admin()`). Standardising on the inline comparison reads consistently with customer/gedu/gamer role checks (which must use `get_user_role()` since there's no per-role wrapper) and eliminates a redundant primitive. Mechanical change: replace `is_admin()` call sites, drop the function, run `tests/db/access-control.test.ts`. Low-value cleanup — do when someone's already in the RLS files.
- [ ] **Consider moving role into JWT claims to eliminate the per-query DB lookup in RLS.** Today every policy call to `get_user_role()` runs `SELECT role FROM profiles WHERE id = auth.uid()` — `STABLE` so it's cached per query, but still one extra lookup on first eval. Modern Supabase pattern: a custom access-token hook writes `role` into `app_metadata` at token mint time, and RLS reads `(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` with zero DB cost. Bigger win than the `is_admin()` cleanup but also a bigger change (hook + migration of every policy). Independent from the cleanup above — do one, both, or neither.
- [ ] **Dedupe the `getUser()` + profile fetch between `src/proxy.ts` and `src/lib/auth.ts:requireRole`.** Every protected API request pays auth verification twice — proxy calls `supabase.auth.getUser()` + `profiles.select('role')` at `src/proxy.ts:108`/`:171`, then `requireRole` immediately repeats both at `src/lib/auth.ts:32`/`:38`. The proxy's result is request-scoped truth, so the second pair is pure waste. Measured against staging (eu-north-1, from a dev machine over public internet, 2026-05-27): GoTrue `/auth/v1/user` ~84ms p50 / 91ms mean, pooler `SELECT 1` from a warm session ~12ms p50 — so the duplicate cost is ~96ms per protected API call from outside the region. In-region production (Vercel → Supabase same region) shrinks that to roughly ~25–45ms — modest per call, but meaningful on dashboard pages that fan out 5–10 parallel API calls. **Shape:** have the proxy set `x-user-id` / `x-user-role` on the forwarded request after verifying, and `requireRole` reads from headers instead of re-verifying. **Load-bearing security detail:** the proxy MUST unconditionally delete any incoming `x-user-id` / `x-user-role` header before setting its own (or leave them deleted on unauthenticated paths) — otherwise a client-supplied forgery could leak through to a route handler. If the "every path must strip" discipline feels fragile, swap to a signed payload (HMAC `{userId, role, expires}` with a server-only secret, verify in `requireRole`) — ~30 extra lines, removes the trust-the-proxy coupling. Stacks with the JWT app_metadata move above: claims kill the profile lookup (~12ms), dedup kills the redundant `getUser` HTTP call (~84ms) — two independent wins that compose. Also worth checking server components / RSC layouts that call `getUser` again on top of proxy + `requireRole`; the same header trick applies.
- [ ] **Turn on `@typescript-eslint/no-unsafe-type-assertion`.** Catches the `as unknown as X` launder pattern (the second hop is unsafe because `unknown` isn't a subset of `X`). When trialed on this branch it flagged 127 errors across 35 files — only one was the laundering pattern; the rest were legit "narrow string/number after a runtime check" call sites (locale narrowing, role narrowing, DOM `as Node` after `contains`, mock-object casts in tests, etc.). Each needs either a type-guard helper or an `// eslint-disable-next-line ... -- runtime-validated, narrowed from string` escape hatch with a description (per the `eslint-comments/require-description` rule). Type info is already enabled in `eslint.config.mjs` so flipping the rule on is one line; the work is the cleanup. Do as a focused branch — most hits are a 5-min refactor each, but reviewing 100+ in one PR is its own friction.
- [ ] **Decide whether to add a styled `Checkbox` primitive to `src/components/ui/`.** Today every checkbox is a raw `<input type="checkbox">` (admin product form sections, `holiday-calendar-option`, `location-tree`, `spoken-language-checkboxes`, the v2 signup-panel rules row). That's consistent with itself and works fine, but it leaves checkbox styling out of the design system that drives every other primitive (Button, Badge, Input). If/when we want a custom check mark, focus ring matching `--ring`, or indeterminate state we'd want one. Two paths: (a) wrap a styled `<input type="checkbox">` with `peer` + `appearance-none` Tailwind tricks — no new dep, easy; (b) pull `@radix-ui/react-checkbox` to match the shadcn pattern of other primitives. Don't do either until there's a concrete design ask — adding a primitive speculatively just creates churn when every consumer migrates.
- [ ] **Split subsystem-specific rules out of root `CLAUDE.md` into nested CLAUDE.md files.** Root CLAUDE.md is ~9k tokens and loaded on every turn. Claude Code lazily loads `CLAUDE.md` from any ancestor directory of a file being read/edited, so subsystem rules can live next to the code they govern — they cost zero tokens until that subtree is touched, and become *more* prominent (loaded alongside the code) when it is. Candidates, in rough ROI order:

  - **`src/services/voice/CLAUDE.md`** — "Realtime hooks must only invalidate queries — never make Supabase data queries in callbacks." Plus pointers to `docs/voice-chat-architecture.md` and `docs/chrome-webrtc-volume-bug.md`.
  - **`src/services/groups/CLAUDE.md`** — "All group/enrollment mutations must go through the `commit_group_changes` RPC." Plus pointer to `docs/groups-architecture.md`.
  - **`supabase/migrations/CLAUDE.md`** — function/table access control rules (REVOKE EXECUTE default, RLS required on new tables, INSERT/UPDATE policies must authorize both actor and target, `SELECT ... FOR UPDATE` for financial reads) and the RPC nullability fix pattern (`Omit` + intersection in `src/types/index.ts`). These only matter when authoring migrations.
  - **`tests/db/CLAUDE.md`** — the DB Test Conventions table (helpers, `TEST_IDS`, `TEST_CREDENTIALS`, `SEED` constants).
  - **`tests/integration/CLAUDE.md`** — the Integration Test Conventions code example (`vi.mock` shape, `requireRole` mock pattern).
  - **`supabase/CLAUDE.md`** (borderline) — the 5-step migration workflow (write SQL → push → regen types → check `index.ts` aliases → commit together). Currently at root because it's procedural and useful to know; could move since it only fires when actually running a migration.

  **Stays at root** (genuinely cross-cutting): RBAC overview, auth/CSP rules, Layout & Scrolling, Loading & Disabled State, Date/Time, Locale vs Spoken Language, Styling/colors, Lint discipline, tech-stack overview, Service Layer Pattern (it's a navigation aid for new contributors more than a rule).

  **Why this matters beyond token cost:** the bigger win is *relevance routing* — when I'm working on tokens code, the token rules load alongside the file and are the first thing I see; when I'm not, they're not in my way. Today every rule is mixed together at root and competes for attention. Estimated drop in always-on context: ~1.5–2k tokens.

  **How to verify after splitting:** open a file in each target subtree, check that `/context` shows the nested CLAUDE.md as loaded and the root file is correspondingly leaner. Confirm a sample rule (e.g., the `commit_group_changes` RPC rule) no longer appears in a fresh-session context dump until a `src/services/groups/*` file is touched.

### Convert v2 admin writes to SECURITY DEFINER RPCs

See `docs/db-access-patterns.md` for the full architectural rationale. Short version: routes that currently use `createAdminClient` (service-role) to write to sensitive tables (`participations_v2`, `payments_v2`, `refunds_v2`, family subscriptions, etc.) hold full database privileges for the duration of the request. The correct shape is a SECURITY DEFINER RPC called via the user-bound client from `requireRole` — three layers of defense (route role check + RPC role check + grant lockdown) instead of one, and the trust boundary becomes the RPC body rather than "everything the service-role connection could do."

**Current state is not vulnerable.** Every route gates with `requireRole` correctly, the service-role key is server-only, and grants + RLS are configured to match what each route does. This is defense-in-depth hardening, not bug remediation — worth doing as a single coordinated sweep when there's time, but no fire.

**Worked example:** `POST /api/admin/products-v2/[id]/participations` — see `docs/db-access-patterns.md` § "Worked example" for the current shape and the target shape side-by-side. That route currently uses Model A (service-role) because that was the established pattern when it was written; the target is Model D (RPC + grant lockdown + user-bound client).

**Triage of `createAdminClient` callers** (32 total — `git grep -l createAdminClient src/`):

*Legitimate — keep as service-role:*
- `src/app/api/auth/switch-account/route.ts`, `src/app/api/auth/forgot-password/route.ts`, `src/app/api/admin/create-gedu/route.ts`, `src/app/api/gamers/create/route.ts`, `src/app/api/gamers/[id]/route.ts` — all use `auth.admin.*` (Supabase's Auth Admin API requires service-role).
- `src/app/api/admin/products-v2/[id]/update/route.ts`, `src/app/api/admin/products-v2/create/route.ts`, `src/app/api/admin/create-product/route.ts`, `src/app/api/admin/update-product/route.ts` — storage uploads to `product-images` bucket.
- `src/app/api/webhooks/stripe/products/route.ts`, `src/app/api/webhooks/whatsapp/route.ts`, `src/app/api/minecraft/join-check/route.ts` — no user session (webhook / external secret-key auth).

*Candidates for conversion (writes sensitive data — RPC + grant lockdown):*
- [ ] `src/app/api/admin/products-v2/[id]/participations/route.ts` — admin comp-enroll. This PR. **Use as the worked example.**
- [ ] `src/app/api/participations/waitlist/route.ts` — customer joins waitlist.
- [ ] `src/app/api/checkout/products/create/route.ts` — customer initiates checkout (verify whether seat-count / cross-user reads genuinely need service-role first).

*Candidates for conversion (writes normal tables — user-bound client + RLS is enough, no RPC needed):*
- [ ] `src/app/api/admin/products/[id]/groups/apply/route.ts` — v1 admin groups.
- [ ] `src/app/api/admin/locations/create/route.ts`, `src/app/api/admin/locations/[id]/route.ts` — admin locations CRUD.
- [ ] `src/app/api/admin/create-game/route.ts` — admin games write.
- [ ] `src/app/api/user/locale/route.ts`, `src/app/api/user/currency/route.ts` — user updates own profile column.
- [ ] `src/app/api/minecraft/account/route.ts` — gamer/gedu own minecraft account.
- [ ] `src/app/api/admin/whatsapp/send/route.ts` — admin DB write + external API call.

*Needs investigation — may legitimately need service-role for cross-user reads:*
- [ ] `src/app/api/feedback/route.ts` — reads other users' profiles via `parent_gamer`.
- [ ] `src/app/api/family/list/route.ts` — customer reads sibling/parent data.
- [ ] `src/app/api/voice/token/route.ts` — gedu/gamer minting tokens for rooms.

**Per-route verification checklist** before flipping any of the candidates:
1. The route does *no* storage writes and *no* `auth.admin.*` calls.
2. For sensitive-table writes: an RPC exists (or is written) that encodes the route's business rules + internal role check.
3. For normal-table writes: RLS on every touched table grants the caller's role the operation, AND the policy authorizes both the actor and the target (see CLAUDE.md "RLS INSERT/UPDATE policies must authorize both the actor AND the target").
4. No cross-user/cross-tenant reads beyond what the caller's RLS view permits.
5. Integration test exists or is added — at minimum: unauthenticated, wrong-role, missing/bad input, happy path.
6. For new RPCs: added to the allowlist in `tests/db/access-control.test.ts`.

**Sequencing:** Don't convert piecemeal. Pick a batch (e.g. the four "normal table" routes first — they're mechanical), do them in one PR, then tackle the sensitive-table set in a separate PR once a couple of RPCs are in place and the pattern is settled.

### Make `tests/db/access-control.test.ts` a real security gate

The RPC allowlist tests catch "did someone forget to `REVOKE EXECUTE`?" — a real but narrow failure mode. The original incident they were meant to prevent was "admin-only RPC ended up callable by anyone for two weeks," and the current shape doesn't catch the underlying class: an RPC granted to `authenticated` whose body forgets to check the caller's role. The allowlist asks "did you mean to GRANT this?" but doesn't verify the body enforces the intended access. Today every admin-write RPC (`create_product_v2`, `update_product_v2`, `commit_group_changes*`, `get_product_groups*_with_details`) sits on the authenticated allowlist with a body-level `get_user_role() <> 'admin'` guard — the allowlist doesn't distinguish "anyone authenticated can do this" from "anyone authenticated can call this but only admins succeed."

The right shape is a role × RPC matrix:

- Annotate each entry in `AUTHENTICATED_ALLOWLIST` with the role(s) the body actually permits — `admin`, `customer`, `gedu`, or `any-authenticated`.
- For each `(role, rpc)` pair where the role is *not* in the entry's permitted set, sign in as that role and call the RPC; assert it raises 42501 (or the documented forbidden code).
- `any-authenticated` covers self-scoping helpers (`is_admin`, `get_user_role`, `get_my_*`, `get_visible_products`) where every authenticated caller getting a response is the intent.

This directly catches the original incident: an RPC tagged `admin` but missing its body guard fails the test when a customer/gedu/gamer session reaches it and *doesn't* get 42501.

**Cost:** most RPCs take typed parameters, so the test needs dummy args that pass parameter validation but get rejected at the role check. A small per-RPC `forbiddenCallArgs` map handles this. `createAuthenticatedClient(email, password)` in `tests/db/helpers.ts` already covers role-switching.

**Worth bundling into the same PR if scope allows:**
- IDOR check on direct table writes: as user A, attempt UPDATE/DELETE on a row owned by user B via the user-bound client. RLS is supposed to block this but only the "actor" half of each policy is mechanically verified today (per CLAUDE.md "RLS INSERT/UPDATE policies must authorize both the actor AND the target").
- Column-grant audit: explicit deny list for sensitive columns (`profiles.role`, `customer_profiles.token_balance`, …) — no UPDATE grant should reach them.

Keep the existing grant-level allowlist tests until the matrix lands — they do catch grant misconfigs, just not body misconfigs. Either fold them into the matrix or retire them once the behavioral test covers the same ground.

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

### Optimize Product Images via `next/image`

Product images currently render with `unoptimized` everywhere, so the original bucket file is served at every viewport. If the catalogue grows or pages get heavier, switching to the Next image optimizer would give us automatic WebP/AVIF conversion, viewport-appropriate resizing, and CDN caching. The cost is a bit of complexity per call site (`sizes` attribute) and a one-line `images.remotePatterns` entry in `next.config.ts`.

- [ ] Add the Supabase Storage host to `next.config.ts` `images.remotePatterns`
- [ ] Drop `unoptimized` from product image `<Image>` components and add a `sizes` prop matching each layout
- [ ] Skipped during the PR 2 self-hosted images migration to keep the change minimal

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

### Refactor SpatialVoiceRoom screen-share animation off render-time ref I/O

`src/components/voice/SpatialVoiceRoom.tsx` uses a `staleSharerRef` to keep showing the previous screen sharer during the exit animation after `screenSharerSessionId` flips to `null`. The current implementation mutates the ref during render (line ~44), reads it during render in JSX (line ~113), and uses `setState` inside the synchronizing `useEffect` (line ~50). All three are flagged by `eslint-plugin-react-hooks@7` (the React-Compiler-aware rules `react-hooks/refs` and `react-hooks/set-state-in-effect`) — currently suppressed with inline `eslint-disable-next-line` comments pointing here.

These are real anti-patterns, not false positives. They happened to work but will become hostile under the React Compiler / future React 19+ behavior, which can re-render or skip renders in ways that break ref-during-render invariants.

- [ ] Replace the render-time ref mutation with derived state: track the "last known sharer id" in `useState`, updated inside the existing `useEffect` (or a small dedicated one) when `screenSharerSessionId` becomes truthy
- [ ] Remove `staleSharerRef` entirely; `<ScreenShareDisplay sharerSessionIdOverride={...}>` reads from the new state
- [ ] Reconsider the `setScreenShareMounted(true)` + double `requestAnimationFrame` pattern — likely cleaner as a CSS-driven mount/unmount via `data-` attribute or as an effect that sets visibility on the next paint without nested rAFs
- [ ] Once the suppressions are removed, delete the three `eslint-disable-next-line` comments referencing this TODO

**Why this is shelved for now:** the file works in production and the lint failures only appeared after we bumped `eslint-config-next` 16.1.6 → 16.2.4, which transitively pulled in `eslint-plugin-react-hooks@7`. Suppressing unblocked CI without rewriting working animation logic mid-other-work.

### Audit setState-in-effect violations from eslint-plugin-react-hooks@7

Three additional files trip the new `react-hooks/set-state-in-effect` rule with the same "set state once on mount" shape (currently suppressed inline pointing here):

- `src/app/(dashboard)/admin/ui-components/page.tsx` — `useEffect(() => setMounted(true), [])` for the canonical post-hydration flag. `SessionsSectionDemo` has already been migrated to `useNow()` (which gives the same SSR/client clock alignment without the mount-flag dance); `GroupCardDemo` is the remaining holdout in this file and can take the same treatment.
- `src/components/auth/reset-password-form.tsx` — parses `window.location.hash` once on mount, calls `setSessionReady(true)` if no hash present
- `src/components/auth/setup-account-form.tsx` — same hash-parse pattern

The rule's preferred patterns: derive from props/`useMemo`, use `useSyncExternalStore` for SSR-safe mount detection, or move the one-shot logic into an initializer / event handler. None of these rewrites are urgent — the current code works and the rule's concern (cascading renders) is mild for one-shot mount setup — but they should be revisited when touching these files.

- [ ] Replace `useEffect(() => setMounted(true), [])` with `useSyncExternalStore` or an SSR-safe equivalent in `ui-components/page.tsx`
- [ ] Move `window.location.hash` parsing in the auth forms out of `useEffect` (e.g., into a `useState` initializer guarded by `typeof window`, or a top-level helper called from an event handler)
- [ ] Once each is rewritten, drop its `eslint-disable-next-line` comment

### Adopt `useTimezone()` + `useNow()` across the app

The dashboard Sessions cards (`NextSessionCard`, `UpcomingSessionCard`) are the reference implementation for the new pattern that lets a date/time render correctly during SSR — no hydration-mismatch dodge via null states, no "skeleton until post-mount" gating.

**The pattern:**

- `useTimezone()` (from `@/providers`) returns the viewer's IANA zone, resolved from the `timezone` cookie server-side and reconciled with `Intl.DateTimeFormat().resolvedOptions().timeZone` after mount. Cookie-only, environmental (no profile column) — see `src/providers/timezone-provider.tsx`.
- `getServerTimezone()` (from `@/lib/timezone.server`) is the server-side equivalent: same cookie, same fallback. Use it in any Server Component or server helper that needs the viewer's zone — SSR and the first client render then read the same value through different accessors.
- `useNow()` returns a `Date` seeded from the server's request-time wall clock and ticked client-side every 30s. SSR HTML and the first client render match because both consume the same prop — see `src/providers/now-provider.tsx`.
- Date/time formatting: pass `timeZone` into `formatDate` / `formatTime` (both helpers in `src/lib/utils.ts` accept it via their options/third arg) so the rendered string uses the viewer's zone instead of the runtime default.
- Age computation: `computeAge(dob, timeZone)` requires the zone — there's no default. Client callers pass `useTimezone()`, server callers pass `await getServerTimezone()`.
- Server prefetch: pages that need first-paint data should fetch in the server component and pass it as `initialData` into the consuming React Query hook (see `useMyUpcomingSessions`). The cache seeds without a `<HydrationBoundary>` and mutation-driven invalidation keeps working unchanged.

**Why migrate other call sites:** today every `formatDate` / `formatTime` call without an explicit `timeZone` falls back to the runtime default — usually UTC on the server vs. the user's local zone in the browser. That's a latent hydration-mismatch hazard. Components dodge it by gating the date string behind a null state (the old `NextSessionCard` countdown) or by being client-only. The new pattern lets them render correctly on the server.

- [ ] Grep `src/` for `formatDate(` / `formatTime(` and migrate each call site so it passes `timeZone` (from `useTimezone()` in client components, `await getServerTimezone()` in server components).
- [ ] For components that compute "is this live right now?" / "starts in N minutes" with a per-component `useState + setInterval`, swap to `useNow()`.
- [ ] Once the bulk of UI surfaces consume `useTimezone()`, flip `NextIntlClientProvider`'s `timeZone` prop in `src/providers/index.tsx` from `DEFAULT_TIMEZONE` to the live value so `useFormatter().dateTime()` follows the same source of truth (today it still hardcodes `Europe/Helsinki`; the comment in the file flags this).
- [ ] Consider pages that would benefit from the server-prefetch + `initialData` pattern (`MyGamersGrid`, billing, anything else where the section currently shows a client-side React Query skeleton on load) and adopt page-by-page. Drop the per-page skeleton at the same time so the win is visible.
- [ ] Once `formatDate` / `formatTime` migration is done, consider an ESLint rule (or `tsc` overload trick) banning calls that omit `timeZone`, so the pattern can't regress.

### Enable next-intl typed messages + locale-parity test

We have no compile-time safety on translation keys today. A dead-key audit during the products-v2 browse review deleted `admin.productsV2.hints.{free,paid}Detail` because the heuristic missed that `billing-section.tsx:76` references them via `t(\`hints.${mode}Detail\`)`. The bug only surfaced as a runtime `IntlError: MISSING_MESSAGE` in the browser — no test, lint, or type-check caught it.

Two layers worth setting up together:

**1. next-intl typed messages augmentation.** Add a `global.d.ts` (or `next-intl.d.ts`) declaring the `IntlMessages` interface from the canonical `en.json` shape. Once in place, every `t('foo.bar')` and every well-typed dynamic template (`t(\`hints.${mode}Detail\`)` where `mode` is a literal union, not `string`) is checked against the actual bundle. The exact `freeDetail`/`paidDetail` deletion above would have failed `tsc --noEmit` and gone red in CI before merge.

Caveats to be honest about:
  - Only catches dynamic templates when the variable is typed as a literal union. If someone widens to `string`, the check silently degrades. Worth pairing with a lint rule that disallows raw `string` template parts in `t(\`...\`)` calls.
  - Only the canonical bundle (en.json) is type-checked. Drift between en/fi/sv/tlh is not caught — see (2).

**2. Locale-parity unit test.** Small Vitest test (`tests/unit/i18n/locale-parity.test.ts` or similar) that:
  - Loads all four bundles
  - Flattens each to its set of leaf key paths
  - Asserts every non-en bundle's key set equals en's
  - Fails CI if any locale is missing a key (or has an extra one)

Catches the case where en.json gets a new key but a translation file is forgotten — common when adding features.

- [ ] Set up next-intl typed messages augmentation (one-liner global.d.ts referencing en.json)
- [ ] Verify `npm run type-check` flags a deliberately-mistyped key in a sandbox before committing
- [ ] Add `tests/unit/i18n/locale-parity.test.ts` comparing flat key sets across all four bundles
- [ ] Optionally: lint rule rejecting `t(\`...${someVar}...\`)` where `someVar` is `string` rather than a literal union

### Multi-Parent Gamer Linking

Currently the only way to link a parent to a gamer is when the parent creates the gamer via `POST /api/gamers/create`. To support a second parent linking to an existing gamer:

- [ ] Choose an authorization mechanism (invite code, existing parent approval, or admin-only)
- [ ] Create a server-side API route (e.g., `POST /api/gamers/link`) that validates authorization before inserting into `parent_gamer` using the admin client
- [ ] Add UI for the chosen flow (e.g., "Share invite code" button for existing parent, "Enter code" form for second parent)
