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

### I3 — Guard against `getUser` regression, then convert the survivors

`supabase.auth.getUser()` (HTTP round-trip to GoTrue) still works and is the Supabase-docs default, so a future server-side caller can silently reintroduce the F1 waterfall — `tsc` and tests won't catch it. The `getClaims` fix has no structural protection yet. None of this is urgent (the survivors below aren't the fan-out multiplier), but the guard is the piece that keeps the fix from eroding.

**Guard (the high-value half — do this first).** Add a `no-restricted-syntax` ESLint rule flagging `…auth.getUser()` with a message pointing at `getClaims` + this doc, plus a `**Rule:**` in CLAUDE.md ("verify identity server-side with `getClaims`, never `getUser`"). One scoping decision: (a) **blanket** ban + a documented `// eslint-disable-next-line … -- reason` on each legitimate exception — makes every `getUser` a conscious choice, fits the repo's "describe every disable" culture; or (b) **scope to server paths** (proxy, route handlers, layouts, `lib/auth`), excluding `src/services/**` and client components — cleaner conceptually, harder to express in ESLint. (a) is simpler and recommended.

**Survivors to triage** (find with `git grep "auth.getUser(" src/` — 11 calls across 7 files as of this writing):
- *Migrate to `getClaims`* — `api/user/locale`, `api/user/currency`: trivial, they only need the user id; update their test mocks.
- *Migrate or disable, with care* — the service layer (`participations` ×4, `minecraft`, `products-v2`). These are **security-sensitive write paths** (enrollment/payments); `getUser` gives server-confirmed identity, `getClaims` trusts the signed JWT until expiry (the same trade-off already accepted on the hot path — RLS still enforces). Convert with a per-call glance that each only reads `.id`, and update the service tests.
- *Disable with reason* — OAuth `api/auth/callback/route.ts`: wants server confirmation of a freshly-exchanged session.
- *Leave / exclude* — client components (`auth-provider`, `setup-account-form`): browser-side, not the waterfall; `getUser` is fine (and marginally stricter) there.

## Completed improvements

### Local JWT verification via `getClaims` — fixes F1 (branch `perf/auth-getclaims`, 2026-05-29)

**What.** Swapped `supabase.auth.getUser()` (HTTP round-trip to GoTrue) for `supabase.auth.getClaims()` (local ES256 verification against the project's JWKS) in the proxy (`src/proxy.ts`), the RSC layout path (`getUserWithProfile` + `getUser` in `src/lib/supabase/server.ts`), and `requireRole` (`src/lib/auth.ts`). Reverted the `prefetch={false}` workarounds (`sidebar.tsx`, `user-row.tsx`, `GroupCard.tsx`, `UpcomingGroupSessionCard.tsx`, `JoinVoiceButton.tsx`) now that per-prefetch auth is cheap.

**Why (was F1).** Every protected request and every parallel RSC prefetch paid 3× `getUser()` to GoTrue, fanning out and saturating GoTrue / Vercel concurrency. A browser trace on `/admin/users` (2026-05-28) showed 24 prefetches at median 1129ms / max 3902ms, 16 over 1s — serving mostly-chrome pages with no real work. Both Supabase projects (`sogverse`, `sogverse-staging`) use asymmetric ES256 signing keys, so the JWT verifies locally with zero round-trips; `getClaims()`'s internal `getSession()` preserves token refresh, so the proxy stays the single refresh point.

**Likely cause of the worst stalls (best guess, not confirmed).** Loads were occasionally 2s+ and rarely ~25s. Best-fit explanation given the evidence: the prefetch flood crossed GoTrue's **auth rate limit**, and the resulting `429` → backoff/retry → re-queue cascade (compounding with Vercel function-concurrency limits) produced a *nonlinear cliff* — tolerable below the threshold, catastrophic above it — which matches the intermittent 2s-vs-25s pattern far better than any constant per-request cost. Alternatives considered and set aside: external APIs (Daily/Stripe/Brevo are action-only — never on the render/load path, verified) and Supabase connection-pool exhaustion (`supabase-js` talks HTTP/PostgREST, so creating client instances ≠ opening DB connections). Local `getClaims` removes every load-path GoTrue call, so loads can no longer trip the auth limit. **Not confirmed against the historical incidents** — to verify, look for `429`s in Supabase → Logs → Auth clustered around a slow window, or a Vercel trace on a ~25s load showing a *page* route parked in auth round-trips.

**Chose this over I1 (the proposed signed `x-auth-context` header).** Local `getClaims` reaches the same "verify once, cheaply" outcome with no new HMAC secret, no header-forgery footgun (the "every path must strip" discipline), and no propagation plumbing — every layer verifies the real signed JWT it already holds. The HMAC-header design is only needed on symmetric-key / network-verify projects; asymmetric keys make it moot.

**Trade-off (accepted).** Local verification skips GoTrue's server-side identity check, so a *GoTrue-level* ban (`auth.users.banned_until`) is no longer enforced mid-session — a banned user's current access token keeps working until it expires (≤ token TTL; they can't mint a new one once the refresh token is revoked). This is bounded and acceptable because the two cases that matter in practice are still caught immediately: **role changes** and **account deletion** both go through the fresh `profiles` re-query every layer already does (a deleted profile row bounces to `/login`). We don't use GoTrue native bans, so the residual window is theoretical today; if we ever add a "suspend instantly" requirement, that specific path keeps `getUser()`.

**Before / after.**

- Per call (micro-benchmark, staging): `getUser` **28ms p50 → `getClaims` 0.7ms** (~40×; the GoTrue round-trip removed).
- In-region live A/B (preview vs staging dashboard load): TTFB **312→216ms** admin / **538→344ms** parent; per-prefetch floor **~70→30ms**.
- Full prefetch flood on `/admin/users` (real-browser, prefetch restored): **24 prefetches @ median 1129ms / max 3902ms / 16 over 1s → 37 prefetches @ median 93ms / max 352ms / 0 over 1s** — ~12× faster under *more* load. ("Before" = F1's recorded 2026-05-28 trace.)

**Tested.** `requireRole` unit test (getClaims contract: 401/500/403/happy); proxy integration test (getClaims mocks incl. refresh-cookie preservation); full unit+integration suite (948 passing); manual sign-in/reload/gate smoke test (localhost → staging); the real-browser A/B above.

**What's left (all deliberately deferred).** No regression guard yet, and `getUser()` survives in non-hot-path spots (client components, OAuth callback, `user/locale`/`user/currency`, service layer) — the guard + the per-call triage are written up as **I3**. The residual per-layer `profiles.role` lookup is **I2**. Neither blocks anything; the F1 fix stands on its own.
