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

## Incidents

### 2026-05-31 — GoTrue auth pool saturation (~17:05–17:55 UTC, signed-in outage)

**One line.** Supabase Auth (GoTrue) saturated its fixed 10-connection DB pool under auth load and stopped responding, 504-ing all signed-in access for ~50 min until a full project restart. Postgres itself was healthy the whole time.

**Confirmed (primary evidence).**
- It was **GoTrue, not the database.** GoTrue logs: `context deadline exceeded` / `request_timeout` → 504s, with `/token` and `/user` taking 2–10s+. Postgres had 69-day uptime unbroken, 18 of 60 connections used.
- GoTrue's DB pool is a **fixed 10** (`max_open_conns:10` / `max_pool_size:10`), project-wide, shared across all auth traffic — from GoTrue's own config log line. This is the hard ceiling.
- Recovery required a **full project restart** (bounces the GoTrue + pooler containers); the "fast database reboot" did *not* fix it (Postgres uptime never reset).
- **Signed-in only** — signed-out pages worked. The proxy only does auth round-trips when a session exists.
- Prod ran a **partial auth migration**: F1 (`getClaims` hot path, PR #46) deployed ~14:19 UTC, but the I3 survivor conversion was still on `dev`, so prod was still calling `getUser` (`/user`) on the service-layer data path. See the I3 entry.
- The proxy has **no timeout** on its Supabase auth calls, so hung requests rode to Vercel's 300s function limit → 504s, and browser + proxy retries re-fired into the wedged pool (retry storm).

**Inferred (not proven).**
- Trigger was a concurrency spike (many near-simultaneous logins). A login cluster 16:57–18:06 supports it, but the worst window has a GoTrue log gap, so peak request *rate* is unmeasured.
- Relative blame between irreducible login/refresh load, residual service-layer `getUser`, and retry amplification — all three present; which dominated isn't quantified.

**Why 10 connections is normally plenty (and what broke that).** At ~300 DAU the true auth-DB demand — logins (~0.3/s peak, ~10–30ms each) + hourly token refreshes — is a small fraction of *one* connection; a connection is held only for the brief query, then released. The pool saturates only when peak concurrent demand approaches 10 *or* connections are held longer. The per-request `getUser` pattern was the multiplier: a single page load fanned out 24–53 RSC prefetches (F1) plus service-layer reads, turning each active user into dozens of concurrent GoTrue DB ops — which, with no-timeout retries holding connections open, crossed the saturation knee.

**Mitigations (priority).**
1. **Ship the I3 survivor conversion to prod** — removes the residual per-load `getUser`; no cost; already built on `dev`. The direct recurrence-reducer.
2. **Confirm with Supabase support** whether the 10-connection cap is raisable without a paid compute bump.
3. **Longer access-token TTL** (Auth setting) — fewer token refreshes = less irreducible GoTrue load.
- *Compute bump* raises the hard ceiling but costs money — deferred; the load that saturated the pool is being deleted, not grown. *Proxy timeout / fail-open* was considered and rejected as a band-aid that masks the root cause rather than removing the per-request GoTrue dependency.

**Residual risk.** Login/signup/token-refresh are *irreducible* GoTrue calls. The free fixes lower probability and add headroom but can't guarantee non-recurrence against a synchronized thundering herd (e.g. a scheduled session start where many users log in within the same second) — that's the one scenario the per-request cleanup doesn't cover.

## Active findings

### F2 — Public marketing pages aren't edge-cacheable

Tracked in TODO.md §"Make the public marketing pages edge-cacheable — they're paying the dynamic-rendering tax for nothing." Short version: `src/app/layout.tsx:55-62` calls `getUserWithProfile()`, `headers()`, `getLocale()`, `cookies()` — any one marks the whole subtree dynamic, so every public-page visit goes through a serverless function (~400-700ms TTFB) instead of being served from the edge CDN. The locale cookie is the load-bearing dynamic input; auth/CSP-nonce/timezone reads are needs of the `(dashboard)` group leaked into the root layout.

Full chain, blockers, and sequencing options live in the TODO item. Brought into this doc once it's actively being scoped.

## Recommended improvements

### I2 — Move role into JWT `app_metadata` claims (the auth-path residual)

With identity now verified locally (Completed: `getClaims`), the remaining per-render auth cost is the `profiles.role` lookup at each layer (proxy + both layouts + every `requireRole`). A custom access-token hook that writes `role` into `app_metadata` lets all of them read role off the verified JWT — and lets RLS's `get_user_role()` drop its `SELECT role FROM profiles`. Full shape + the role-staleness-until-token-refresh trade-off live in TODO.md §"Consider moving role into JWT claims". Conditional: do it when the residual profile lookup proves to matter, or when next editing the RLS policies. **Not a guard against the 2026-05-31 incident:** it relieves Postgres (the `profiles` query), but that incident was GoTrue connection-pool saturation — Postgres was healthy throughout (18/60 connections used).

## Completed improvements

### `AppSupabaseClient` — structural `getUser` guard + survivor conversion — closes I3 (branch `perf/auth-getclaims-guard`, 2026-05-31)

**What.** Removed `supabase.auth.getUser()` (a GoTrue HTTP round-trip) from every remaining call site, and made a server-side reintroduction a **compile** error rather than relying on review. Introduced `AppSupabaseClient` in `src/types/index.ts` — `SupabaseClient<Database>` with `auth.getUser` subtracted at the type level (`Omit`). The server `createClient()` (`src/lib/supabase/server.ts`) now returns it, and all ~14 service constructors take it. The full browser client (which keeps `getUser`) is still assignable to the narrower type, so `getClient()` results flow into services unchanged; the reverse isn't, which is what blocks `getUser` on the server.

**Why a type, not a lint.** A `no-restricted-syntax` ESLint rule was prototyped and rejected: it nags forever once the codebase is clean ("don't do this bad thing" long after everyone stopped). The type narrowing is self-documenting, catches the regression strictly earlier (red squiggle + `type-check`/build failure, before the line can run or merge), and adds zero runtime code. It deliberately scopes to the **server client + service layer** — the actual F1 fan-out surface. The browser client keeps `getUser` for the rare client-side case needing the live GoTrue `User`.

**Survivors converted** (the 11 calls I3 catalogued):
- `api/user/locale`, `api/user/currency` → the getClaims-backed `getUser()` helper from `server.ts` (they only need the id).
- Service layer (`participations` ×4, `minecraft`, `products`) → `getClaims()` directly. Confirmed each only reads `.id` to scope a query; RLS enforces the real authorization, so trusting the signed JWT until expiry is the same trade-off already accepted on the hot path.
- OAuth `api/auth/callback/route.ts` → `getClaims()` on the just-exchanged session (the freshly-minted token verifies locally; no need for a server round-trip to read the role).
- Client components (`auth-provider`, `setup-account-form`) → `getClaims()` for consistency, even though browser-side `getUser` is harmless. Both only used `.id`. The browser client *type* stays permissive.

**Why this was load, not just hygiene — the 2026-05-31 incident.** F1 removed `getUser` from the *auth/routing/prefetch* path (proxy + layouts + `requireRole`); the survivors above were a **second per-load surface**, dominated by the service-layer reads — `participations` fires 4× on a parent/gamer dashboard load (plus `products`, `minecraft`), on the React Query data path — so a data-heavy dashboard still round-tripped to GoTrue *per render*. Prod was running the partial migration (F1/PR #46 deployed ~14:19 UTC, this conversion not) when GoTrue's fixed **10-connection DB pool** (`max_open_conns:10`, project-wide, shared across all auth traffic) saturated under peak load ~17:05–17:55 UTC, 504-ing all signed-in traffic until a full project restart. The residual service-layer `getUser` was one contributor — alongside irreducible login/refresh load and a no-timeout proxy retry storm amplifying the wedge. Lesson: F1 cut the biggest surface but left enough per-load GoTrue load to cross the pool's saturation knee — **a multi-surface auth migration has to reach prod whole.** (The other survivors are low-frequency, so they weren't material: `auth-provider` short-circuits when the server seeds `initialUser` at `auth-provider.tsx:91`; the locale/currency routes fire only on a preference change.)

**Not covered (deliberate).** `src/proxy.ts` builds its `createServerClient` inline (it wires request/response cookie handling), so it holds the full type — but it already uses `getClaims()`, and it's one reviewed file, not a fan-out surface. No CLAUDE.md rule accompanies this: the compile error is self-enforcing on the server, and the "why" lives in the `AppSupabaseClient` doc comment — a prose "don't call `getUser`" rule would be redundant cruft for something that already won't compile.

**Tested.** Updated the `user-locale` / `user-currency` route mocks (mock the `getUser` helper) and the OAuth `callback` mock (`getClaims` instead of `getUser`). `type-check` is the load-bearing check here — it's what proves the guard compiles and nothing else regressed.

### Local JWT verification via `getClaims` — fixes F1 (branch `perf/auth-getclaims`, 2026-05-29)

**What.** Swapped `supabase.auth.getUser()` (HTTP round-trip to GoTrue) for `supabase.auth.getClaims()` (local ES256 verification against the project's JWKS) in the proxy (`src/proxy.ts`), the RSC layout path (`getUserWithProfile` + `getUser` in `src/lib/supabase/server.ts`), and `requireRole` (`src/lib/auth.ts`). Reverted the `prefetch={false}` workarounds (`sidebar.tsx`, `user-row.tsx`, `GroupCard.tsx`, `UpcomingGroupSessionCard.tsx`, `JoinVoiceButton.tsx`) now that per-prefetch auth is cheap.

**Why (was F1).** Every protected request and every parallel RSC prefetch paid 3× `getUser()` to GoTrue, fanning out and saturating GoTrue / Vercel concurrency. A browser trace on `/admin/users` (2026-05-28) showed 24 prefetches at median 1129ms / max 3902ms, 16 over 1s — serving mostly-chrome pages with no real work. Both Supabase projects (`sogverse`, `sogverse-staging`) use asymmetric ES256 signing keys, so the JWT verifies locally with zero round-trips; `getClaims()`'s internal `getSession()` preserves token refresh, so the proxy stays the single refresh point.

**Likely cause of the worst stalls (best guess, not confirmed).** Loads were occasionally 2s+ and rarely ~25s. Best-fit explanation given the evidence: the prefetch flood crossed GoTrue's **auth rate limit**, and the resulting `429` → backoff/retry → re-queue cascade (compounding with Vercel function-concurrency limits) produced a *nonlinear cliff* — tolerable below the threshold, catastrophic above it — which matches the intermittent 2s-vs-25s pattern far better than any constant per-request cost. Alternatives considered and set aside: external APIs (Daily/Stripe/Brevo are action-only — never on the render/load path, verified) and Supabase connection-pool exhaustion (`supabase-js` talks HTTP/PostgREST, so creating client instances ≠ opening DB connections). Local `getClaims` removes every load-path GoTrue call, so loads can no longer trip the auth limit. **Not confirmed against the historical incidents** — to verify, look for `429`s in Supabase → Logs → Auth clustered around a slow window, or a Vercel trace on a ~25s load showing a *page* route parked in auth round-trips. (The 2026-05-31 incident below later exhibited the same nonlinear-cliff shape — tolerable load, then a wedge — but via a *different* mechanism: GoTrue's 10-connection DB pool exhausting, not the `429` auth rate-limit. Same lesson, different choke point.)

**Chose this over I1 (the proposed signed `x-auth-context` header).** Local `getClaims` reaches the same "verify once, cheaply" outcome with no new HMAC secret, no header-forgery footgun (the "every path must strip" discipline), and no propagation plumbing — every layer verifies the real signed JWT it already holds. The HMAC-header design is only needed on symmetric-key / network-verify projects; asymmetric keys make it moot.

**Trade-off (accepted).** Local verification skips GoTrue's server-side identity check, so a *GoTrue-level* ban (`auth.users.banned_until`) is no longer enforced mid-session — a banned user's current access token keeps working until it expires (≤ token TTL; they can't mint a new one once the refresh token is revoked). This is bounded and acceptable because the two cases that matter in practice are still caught immediately: **role changes** and **account deletion** both go through the fresh `profiles` re-query every layer already does (a deleted profile row bounces to `/login`). We don't use GoTrue native bans, so the residual window is theoretical today; if we ever add a "suspend instantly" requirement, that specific path keeps `getUser()`.

**Before / after.**

- Per call (micro-benchmark, staging): `getUser` **28ms p50 → `getClaims` 0.7ms** (~40×; the GoTrue round-trip removed).
- In-region live A/B (preview vs staging dashboard load): TTFB **312→216ms** admin / **538→344ms** parent; per-prefetch floor **~70→30ms**.
- Full prefetch flood on `/admin/users` (real-browser, prefetch restored): **24 prefetches @ median 1129ms / max 3902ms / 16 over 1s → 37 prefetches @ median 93ms / max 352ms / 0 over 1s** — ~12× faster under *more* load. ("Before" = F1's recorded 2026-05-28 trace.)

**Benchmark log.** Staging (`preview` env) re-measures, append-only so drift is visible over time. Conditions matter — record cold/warm and signed-in/out, since they move the headline numbers more than the code does. Format: `route · build · conditions → key metrics`.

- **2026-05-29 · `44da16b` · `/admin/users` warm, signed-in** → LCP 524ms · TTFB 11ms · **53 prefetches @ median 96ms / max 208ms / 0 over-1s** · `useUsers` ready +180ms / `useParentGamerLinks` +141ms. Confirms the F1 fix under a *heavier* fan-out than the recorded "after" (53 vs 37 prefetches) — median held, max beat it. This is the canonical F1 regression benchmark; compare future `/admin/users` traces here.
- **2026-05-29 · `44da16b` · `/` warm, signed-in** → LCP/FCP 800ms · TTFB 11ms · download 660ms · 10 prefetches @ median 91ms / max 204ms. The `download=660ms` is the steady-state dynamic-render tax on the public home (still a serverless render, not edge-cached) — this is the clean **F2** number to beat once public pages are made edge-cacheable.
- **2026-05-29 · `44da16b` · `/` cold, signed-out (first load post-deploy)** → LCP/FCP **3.11s** · TTFB 10ms · download 2878ms. Worst-case first impression: Vercel lambda cold start + uncached assets on top of the F2 dynamic render. **Not steady state** — the warm re-measure above was 800ms. Signed-out home never exercises the auth path, so this trace is neutral on F1; don't read it as an auth regression.

**Tested.** `requireRole` unit test (getClaims contract: 401/500/403/happy); proxy integration test (getClaims mocks incl. refresh-cookie preservation); full unit+integration suite (948 passing); manual sign-in/reload/gate smoke test (localhost → staging); the real-browser A/B above.

**What's left.** The regression guard and survivor conversion (I3) shipped — see the `AppSupabaseClient` entry above; `getUser()` is now gone from the codebase except the permissive browser-client type. The residual per-layer `profiles.role` lookup is **I2** (deferred; doesn't block anything). The F1 fix stands on its own.
