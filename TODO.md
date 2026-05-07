# Sogverse TODO

## Cleanup

- [ ] Remove `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` from `.github/workflows/ci.yml` after June 2, 2026 (Node.js 24 becomes the default runner)
- [ ] Add CHECK constraints to `profiles.locale` (`IN ('en', 'fi', 'sv', 'tlh')`) and `profiles.currency` (`IN ('EUR', 'SEK', 'USD', 'GBP')`) — both are plain text columns with app-level validation only
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
- [ ] **Find the real cause of the `<html>` 2x-viewport overflow and drop the `overflow-hidden` workaround.** `src/app/layout.tsx` sets `<html className="dark overflow-hidden">` and routes scroll into the root `<main className="h-screen overflow-auto">`. The Playwright investigation in `docs/layout-scroll-architecture.md` (March 2026) measured `<html>.scrollHeight = 1440` (2x viewport) while `<body>.scrollHeight = 720` (correct), and concluded "browsers propagate nested scrollable content to the viewport." That conclusion isn't quite right — per CSS spec, overflow propagation only flows from `<body>` to viewport, not from arbitrary nested elements. Body fits in 720, so something else is making `<html>` twice as tall. The current fix masks the symptom (no second scrollbar appears) without diagnosing the cause, and forces every scroll-aware feature to special-case our non-standard scroll container.

  **Collateral damage already accumulating:**
  - `window.scrollY` is permanently 0; document-level scroll listeners silently never fire.
  - The home page section pill (`src/components/home/section-pill.tsx`) had to listen for scroll on `<main>` instead of `window` — a documented workaround for the workaround. Every future scroll feature (reading progress, scroll-to-top, ScrollTrigger/GSAP, scroll-restoration) will hit the same wall.
  - Hash-anchor navigation, browser scroll-restoration, and many third-party scroll libraries assume document scroll and silently misbehave. Concrete instance: `src/app/(dashboard)/admin/ui-components/page.tsx` adds linkable section anchors (e.g. `#products-v2-detail-page`); native hash navigation can't find them because `<html>` is overflow-hidden, so the page paints at the top and an `useEffect` has to re-scroll post-hydration — visible "see top, then jump" flash on every deep-link load. Once this TODO is resolved, that effect can be deleted and native hash navigation will Just Work.
  - Playwright's click actionability check uses `elementFromPoint` at the target's coordinates, and the non-standard scroll container shifts the CSS stacking context so sibling sections later in the DOM register as intercepting pointer events on the home page. The home click tests in `tests/e2e/home.spec.ts` (`should navigate to register page`, `should navigate to clubs page`) work around this with `.dispatchEvent("click")`. We tried retiring this workaround once already in `7167af2` (Mar 12, 2026) on the assumption that removing `flex flex-col` from `<main>` would also fix the Playwright issue — it didn't, and CI re-broke after `3f6351d` (Apr 29, 2026) added more sibling sections (`SectionPill`, `YtySection`, `AboutSection`) to the home page, which gave `elementFromPoint` more wrong things to land on. Real users are unaffected because browser click dispatch doesn't perform this check. Once this TODO is resolved, those two tests can go back to `.click()`.
  - The stated motivations (header `backdrop-blur` and dashboard sidebar pinning) don't actually require the inner-scroll setup. `position: fixed` header overlaps content regardless of scroll container; sidebar pinning is `position: sticky; top: 4rem` in a normal-flow page.

  **How I'd approach a real fix:** start by isolating which element contributes the phantom 720px. Likely candidates to bisect: the `Providers` wrapper (and its nested context providers), `<MouseflowConsent />`, `<SpeedInsights />`, the next-intl provider, or font CSS injecting a placeholder. Strip them one-by-one with `<html>` `overflow: visible` and watch when the second scrollbar appears. The 720px-exact figure suggests a specific element (or `min-h-screen` somewhere) is duplicating viewport height — not subpixel rounding. Once identified, constrain that element and remove `overflow-hidden`. Switch dashboard sidebar to `position: sticky` and let `<main>` use natural document flow with `pt-16`. Verify the home hero collapse bug (the doc's "Why `<main>` must NOT be `flex flex-col`" section) doesn't return — that's a separate flex/min-height-0 issue that was conflated with this one.

  **Risk:** non-trivial. Touches the root layout, dashboard layout, and any scroll-aware code. Worth a focused branch with side-by-side Playwright measurement of every page type before/after.

- [ ] **Turn on `@typescript-eslint/no-unsafe-type-assertion`.** Catches the `as unknown as X` launder pattern (the second hop is unsafe because `unknown` isn't a subset of `X`). When trialed on this branch it flagged 127 errors across 35 files — only one was the laundering pattern; the rest were legit "narrow string/number after a runtime check" call sites (locale narrowing, role narrowing, DOM `as Node` after `contains`, mock-object casts in tests, etc.). Each needs either a type-guard helper or an `// eslint-disable-next-line ... -- runtime-validated, narrowed from string` escape hatch with a description (per the `eslint-comments/require-description` rule). Type info is already enabled in `eslint.config.mjs` so flipping the rule on is one line; the work is the cleanup. Do as a focused branch — most hits are a 5-min refactor each, but reviewing 100+ in one PR is its own friction.
- [ ] **Decide whether to add a styled `Checkbox` primitive to `src/components/ui/`.** Today every checkbox is a raw `<input type="checkbox">` (admin product form sections, `holiday-calendar-option`, `location-tree`, `spoken-language-checkboxes`, the v2 signup-panel rules row). That's consistent with itself and works fine, but it leaves checkbox styling out of the design system that drives every other primitive (Button, Badge, Input). If/when we want a custom check mark, focus ring matching `--ring`, or indeterminate state we'd want one. Two paths: (a) wrap a styled `<input type="checkbox">` with `peer` + `appearance-none` Tailwind tricks — no new dep, easy; (b) pull `@radix-ui/react-checkbox` to match the shadcn pattern of other primitives. Don't do either until there's a concrete design ask — adding a primitive speculatively just creates churn when every consumer migrates.
- [ ] **Close the `asChild` lie in `Button`.** `src/components/ui/button.tsx` declares `asChild?: boolean` on `ButtonProps` but the component doesn't implement Radix's `Slot` pattern — it just spreads props onto a raw `<button>`, so `asChild` leaks to the DOM as an unknown attribute. Symptom: React console warning "React does not recognize the `asChild` prop on a DOM element" anywhere someone wrote `<Button asChild><Link>…</Link></Button>` thinking it worked. The codebase's actual working idiom is the reverse: `<Link><Button>…</Button></Link>`. Two ways to close the gap: (a) **drop `asChild` from the interface entirely** — simplest, nothing uses it intentionally, and the `Link`-wraps-`Button` idiom is valid HTML and works everywhere today; (b) add `@radix-ui/react-slot` (not currently in the dep tree) and wire up the canonical shadcn pattern so `<Button asChild><Link>…</Link></Button>` renders a single `<a>` styled as a button. (a) is the right default. Do (b) only if we start wanting Link-styled-as-Button in enough call sites that the wrapping idiom becomes noisy.
- [ ] **Split subsystem-specific rules out of root `CLAUDE.md` into nested CLAUDE.md files.** Root CLAUDE.md is ~9k tokens and loaded on every turn. Claude Code lazily loads `CLAUDE.md` from any ancestor directory of a file being read/edited, so subsystem rules can live next to the code they govern — they cost zero tokens until that subtree is touched, and become *more* prominent (loaded alongside the code) when it is. Candidates, in rough ROI order:

  - **`src/services/tokens/CLAUDE.md`** — the five Sorg Token rules (`adjust_token_balance` RPC, packages-defined-in-Stripe-not-code, webhook as sole fulfillment path, customers-only purchase, `proration_behavior: "none"` on tier switch). Plus the `docs/sorg-token-architecture.md` and `docs/stripe-testing.md` pointers.
  - **`src/services/voice/CLAUDE.md`** — "Realtime hooks must only invalidate queries — never make Supabase data queries in callbacks." Plus pointers to `docs/voice-chat-architecture.md` and `docs/chrome-webrtc-volume-bug.md`.
  - **`src/services/groups/CLAUDE.md`** — "All group/enrollment mutations must go through the `commit_group_changes` RPC." Plus pointer to `docs/groups-architecture.md`.
  - **`supabase/migrations/CLAUDE.md`** — function/table access control rules (REVOKE EXECUTE default, RLS required on new tables, INSERT/UPDATE policies must authorize both actor and target, `SELECT ... FOR UPDATE` for financial reads) and the RPC nullability fix pattern (`Omit` + intersection in `src/types/index.ts`). These only matter when authoring migrations.
  - **`tests/db/CLAUDE.md`** — the DB Test Conventions table (helpers, `TEST_IDS`, `TEST_CREDENTIALS`, `SEED` constants).
  - **`tests/integration/CLAUDE.md`** — the Integration Test Conventions code example (`vi.mock` shape, `requireRole` mock pattern).
  - **`supabase/CLAUDE.md`** (borderline) — the 5-step migration workflow (write SQL → push → regen types → check `index.ts` aliases → commit together). Currently at root because it's procedural and useful to know; could move since it only fires when actually running a migration.

  **Stays at root** (genuinely cross-cutting): RBAC overview, auth/CSP rules, Layout & Scrolling, Loading & Disabled State, Date/Time, Locale vs Spoken Language, Styling/colors, Lint discipline, tech-stack overview, Service Layer Pattern (it's a navigation aid for new contributors more than a rule).

  **Why this matters beyond token cost:** the bigger win is *relevance routing* — when I'm working on tokens code, the token rules load alongside the file and are the first thing I see; when I'm not, they're not in my way. Today every rule is mixed together at root and competes for attention. Estimated drop in always-on context: ~1.5–2k tokens.

  **How to verify after splitting:** open a file in each target subtree, check that `/context` shows the nested CLAUDE.md as loaded and the root file is correspondingly leaner. Confirm a sample rule (e.g., the `adjust_token_balance` RPC rule) no longer appears in a fresh-session context dump until a `src/services/tokens/*` file is touched.

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

- `src/app/(dashboard)/admin/ui-components/page.tsx` — `useEffect(() => setMounted(true), [])` for the canonical post-hydration flag
- `src/components/auth/reset-password-form.tsx` — parses `window.location.hash` once on mount, calls `setSessionReady(true)` if no hash present
- `src/components/auth/setup-account-form.tsx` — same hash-parse pattern

The rule's preferred patterns: derive from props/`useMemo`, use `useSyncExternalStore` for SSR-safe mount detection, or move the one-shot logic into an initializer / event handler. None of these rewrites are urgent — the current code works and the rule's concern (cascading renders) is mild for one-shot mount setup — but they should be revisited when touching these files.

- [ ] Replace `useEffect(() => setMounted(true), [])` with `useSyncExternalStore` or an SSR-safe equivalent in `ui-components/page.tsx`
- [ ] Move `window.location.hash` parsing in the auth forms out of `useEffect` (e.g., into a `useState` initializer guarded by `typeof window`, or a top-level helper called from an event handler)
- [ ] Once each is rewritten, drop its `eslint-disable-next-line` comment

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
