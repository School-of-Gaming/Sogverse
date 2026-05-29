# Performance

Running log of performance findings, planned improvements, and shipped changes. Cross-cutting only — subsystem-specific perf work lives in that subsystem's architecture doc.

Findings (`F`) describe what we've observed and the root cause. Improvements (`I`) are proposals; they move to "Completed improvements" once shipped, with a pointer to the PR that delivered them.

## Per-request server stack

Every protected request — page load, API call, and every RSC prefetch — verifies the caller's identity at three layers:

1. **`src/proxy.ts`** (`proxy.ts:122`) — `supabase.auth.getClaims()` verifies the JWT **locally** against the project's published ES256 JWKS (no GoTrue round-trip). The `getSession()` it calls internally still refreshes a near-expiry token and rotates the cookie, so the proxy stays the single token-refresh point. Then queries `profiles.role` for role-based routing.
2. **`src/app/layout.tsx`** (root, `layout.tsx:55`) and **`src/app/(dashboard)/layout.tsx`** — each calls `getUserWithProfile()`, which does another local `getClaims()` + a `profiles` query.
3. API routes add one more local `getClaims()` + profile query via `requireRole` (`src/lib/auth.ts`).

Identity verification is **local crypto** at every layer (~0.7ms each), so repeating it per layer no longer costs network round-trips — the F1 waterfall is gone (see Completed improvements). The residual per-render cost is the **`profiles.role` query repeated at each layer** (~12ms warm); eliminating that is the role-in-JWT move (I2 / TODO.md §"Consider moving role into JWT claims").

RSC prefetch runs on Next's default (`prefetch={true}`; the `prefetch={false}` workarounds were reverted). It's now a net positive — prefetches warm caches before clicks, and each one's auth is a local verify, so even a ~37-prefetch fan-out completes without saturation.

## Active findings

### F2 — Public marketing pages aren't edge-cacheable

Tracked in TODO.md §"Make the public marketing pages edge-cacheable — they're paying the dynamic-rendering tax for nothing." Short version: `src/app/layout.tsx:55-62` calls `getUserWithProfile()`, `headers()`, `getLocale()`, `cookies()` — any one marks the whole subtree dynamic, so every public-page visit goes through a serverless function (~400-700ms TTFB) instead of being served from the edge CDN. The locale cookie is the load-bearing dynamic input; auth/CSP-nonce/timezone reads are needs of the `(dashboard)` group leaked into the root layout.

Full chain, blockers, and sequencing options live in the TODO item. Brought into this doc once it's actively being scoped.

## Recommended improvements

### I2 — Move role into JWT `app_metadata` claims (the auth-path residual)

With identity now verified locally (Completed: `getClaims`), the remaining per-render auth cost is the `profiles.role` lookup at each layer (proxy + both layouts + every `requireRole`). A custom access-token hook that writes `role` into `app_metadata` lets all of them read role off the verified JWT — and lets RLS's `get_user_role()` drop its `SELECT role FROM profiles`. Full shape + the role-staleness-until-token-refresh trade-off live in TODO.md §"Consider moving role into JWT claims". Conditional: do it when the residual profile lookup proves to matter, or when next editing the RLS policies.

## Completed improvements

### Local JWT verification via `getClaims` — fixes F1 (branch `perf/auth-getclaims`, 2026-05-29)

**What.** Swapped `supabase.auth.getUser()` (HTTP round-trip to GoTrue) for `supabase.auth.getClaims()` (local ES256 verification against the project's JWKS) in the proxy (`src/proxy.ts`), the RSC layout path (`getUserWithProfile` + `getUser` in `src/lib/supabase/server.ts`), and `requireRole` (`src/lib/auth.ts`). Reverted the `prefetch={false}` workarounds (`sidebar.tsx`, `user-row.tsx`, `GroupCard.tsx`, `UpcomingGroupSessionCard.tsx`, `JoinVoiceButton.tsx`) now that per-prefetch auth is cheap.

**Why (was F1).** Every protected request and every parallel RSC prefetch paid 3× `getUser()` to GoTrue, fanning out and saturating GoTrue / Vercel concurrency. A browser trace on `/admin/users` (2026-05-28) showed 24 prefetches at median 1129ms / max 3902ms, 16 over 1s — serving mostly-chrome pages with no real work. Both Supabase projects (`sogverse`, `sogverse-staging`) use asymmetric ES256 signing keys, so the JWT verifies locally with zero round-trips; `getClaims()`'s internal `getSession()` preserves token refresh, so the proxy stays the single refresh point.

**Chose this over I1 (the proposed signed `x-auth-context` header).** Local `getClaims` reaches the same "verify once, cheaply" outcome with no new HMAC secret, no header-forgery footgun (the "every path must strip" discipline), and no propagation plumbing — every layer verifies the real signed JWT it already holds. The HMAC-header design is only needed on symmetric-key / network-verify projects; asymmetric keys make it moot.

**Before / after.**

- Per call (micro-benchmark, staging): `getUser` **28ms p50 → `getClaims` 0.7ms** (~40×; the GoTrue round-trip removed).
- In-region live A/B (preview vs staging dashboard load): TTFB **312→216ms** admin / **538→344ms** parent; per-prefetch floor **~70→30ms**.
- Full prefetch flood on `/admin/users` (real-browser, prefetch restored): **24 prefetches @ median 1129ms / max 3902ms / 16 over 1s → 37 prefetches @ median 93ms / max 352ms / 0 over 1s** — ~12× faster under *more* load. ("Before" = F1's recorded 2026-05-28 trace.)

**Tested.** `requireRole` unit test (getClaims contract: 401/500/403/happy); proxy integration test (getClaims mocks incl. refresh-cookie preservation); full unit+integration suite (948 passing); manual sign-in/reload/gate smoke test (localhost → staging); the real-browser A/B above.

**What's left.**

- **Regression guard (not yet done).** `supabase.auth.getUser()` still works and is the Supabase-docs default, so a future server-side caller can silently reintroduce the waterfall. Plan: a `no-restricted-syntax` lint rule banning server-side `getUser()` + a `**Rule:**` in CLAUDE.md.
- **`getUser()` survivors (intentional, out of scope here):** client components (`auth-provider`, `setup-account-form`), the OAuth callback, the `user/locale` + `user/currency` routes, and the service layer (`participations`, `minecraft`, `products-v2`). None are the fan-out multiplier; migrate/triage them alongside the lint rule.
- **I2 (role-in-JWT)** removes the residual `profiles.role` lookup.
