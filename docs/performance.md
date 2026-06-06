# Performance

Running log of performance findings, planned improvements, and shipped changes. Cross-cutting only — subsystem-specific perf work lives in that subsystem's architecture doc.

Findings (`F`) describe what we've observed and the root cause. Improvements (`I`) are proposals; they move to "Completed improvements" once shipped, with a pointer to the PR that delivered them.

## Per-request server stack

Every protected request — page load, API call, and every RSC prefetch — verifies the caller's identity at three layers:

1. **`src/proxy.ts`** (`proxy.ts:122`) — `supabase.auth.getClaims()` verifies the JWT **locally** against the project's published ES256 JWKS (no GoTrue round-trip). The `getSession()` it calls internally still refreshes a near-expiry token and rotates the cookie, so the proxy stays the single token-refresh point. Then queries `profiles.role` for role-based routing.
2. **`src/app/layout.tsx`** (root, `layout.tsx:55`) and **`src/app/(dashboard)/layout.tsx`** — each calls `getUserWithProfile()`, which does another local `getClaims()` + a `profiles` query.
3. API routes add one more local `getClaims()` + profile query via `requireRole` (`src/lib/auth.ts`).

Identity verification is **local crypto** at every layer (~0.7ms each), so repeating it per layer no longer costs network round-trips — the F1 waterfall is gone (see Completed improvements). The residual per-render cost is the **`profiles.role` query repeated at each layer** (~12ms warm) — quantified as **F3** and addressed by the authorization model + **I2** below.

RSC prefetch runs on Next's default (`prefetch={true}`; the `prefetch={false}` workarounds were reverted). It's now a net positive — prefetches warm caches before clicks, and each one's auth is a local verify, so even a ~37-prefetch fan-out completes without saturation.

## Incidents

### 2026-05-31 — GoTrue auth pool saturation (~17:05–17:55 UTC, signed-in outage)

**One line.** Supabase Auth (GoTrue) saturated its fixed 10-connection DB pool under auth load and stopped responding, 504-ing all signed-in access for ~50 min until a full project restart. Postgres itself was healthy the whole time.

**Confirmed (primary evidence).**
- It was **GoTrue, not the database.** GoTrue logs: `context deadline exceeded` / `request_timeout` → 504s, with `/token` and `/user` taking 2–10s+. Postgres had 69-day uptime unbroken, 18 of 60 connections used.
- GoTrue's DB pool is a **fixed 10** (`max_open_conns:10` / `max_pool_size:10`), project-wide, shared across all auth traffic — from GoTrue's own config log line. This is the hard ceiling.
- Recovery required a **full project restart** (bounces the GoTrue + pooler containers); the "fast database reboot" did *not* fix it (Postgres uptime never reset).
- **Signed-in only** — signed-out pages worked. The proxy only does auth round-trips when a session exists.
- Prod ran a **partial auth migration**: F1 (`getClaims` hot path, PR #46) deployed ~14:19 UTC, but the I3 survivor conversion was still on `dev`, so prod was still calling `getUser` (`/user`) on the service-layer data path. See the I3 entry. *(Since resolved: I3 shipped to prod in `ebd341b` on `main` — the partial-migration state that caused this no longer exists.)*
- The proxy has **no timeout** on its Supabase auth calls, so hung requests rode to Vercel's 300s function limit → 504s, and browser + proxy retries re-fired into the wedged pool (retry storm).

**Inferred (not proven).**
- Trigger was a concurrency spike (many near-simultaneous logins). A login cluster 16:57–18:06 supports it, but the worst window has a GoTrue log gap, so peak request *rate* is unmeasured.
- Relative blame between irreducible login/refresh load, residual service-layer `getUser`, and retry amplification — all three present; which dominated isn't quantified.

**Why 10 connections is normally plenty (and what broke that).** At ~300 DAU the true auth-DB demand — logins (~0.3/s peak, ~10–30ms each) + hourly token refreshes — is a small fraction of *one* connection; a connection is held only for the brief query, then released. The pool saturates only when peak concurrent demand approaches 10 *or* connections are held longer. The per-request `getUser` pattern was the multiplier: a single page load fanned out 24–53 RSC prefetches (F1) plus service-layer reads, turning each active user into dozens of concurrent GoTrue DB ops — which, with no-timeout retries holding connections open, crossed the saturation knee.

**Mitigations (priority).**
1. **Ship the I3 survivor conversion to prod** — **DONE** (`ebd341b` on `main`). Removed the residual per-load `getUser`; the partial-migration state that caused the incident no longer exists. The direct recurrence-reducer.
2. **Confirm with Supabase support** whether the 10-connection cap is raisable without a paid compute bump.
3. **Longer access-token TTL** (Auth setting) — fewer token refreshes = less irreducible GoTrue load.
- *Compute bump* raises the hard ceiling but costs money — deferred; the load that saturated the pool is being deleted, not grown. *Proxy timeout / fail-open* was considered and rejected as a band-aid that masks the root cause rather than removing the per-request GoTrue dependency.

**Residual risk.** Login/signup/token-refresh are *irreducible* GoTrue calls. The free fixes lower probability and add headroom but can't guarantee non-recurrence against a synchronized thundering herd (e.g. a scheduled session start where many users log in within the same second) — that's the one scenario the per-request cleanup doesn't cover.

## Active findings

### F2 — Public marketing pages aren't edge-cacheable

Home and other `(public)` routes load with ~400–700ms TTFB on prod even on fast connections, because they're dynamically rendered per-request instead of served from the edge CDN. No single line is "wrong" — the chain from symptom to root cause:

1. The home page is pure static content (translated copy + icons, no DB queries) — it *should* be edge-cacheable.
2. But `src/app/layout.tsx:55-62` (root layout) calls `getUserWithProfile()`, `headers()`, `getLocale()`, and `cookies()`. Any one marks the whole subtree dynamic — Next can't pre-render output that depends on the request.
3. So Vercel routes every visit through a serverless function: proxy + token refresh + Supabase auth round-trip + render + stream. ~400–700ms before first byte; the edge CDN never serves it from cache.
4. The load-bearing dynamic read for *public* pages is `getLocale()` — the locale cookie tells next-intl which translation to emit, so the same URL returns different bodies per request, which Vercel won't cache. The auth call, CSP nonce, and timezone cookie are `(dashboard)` needs leaked into the root layout.

**Architectural fix — locale-in-URL:** `/fi`, `/en`, `/sv` each get a statically pre-rendered home page; bare `/` does an edge redirect on `Accept-Language`. Detailed in `docs/i18n-architecture.md` § "Locale-in-URL routing with translated slugs" (~L166-199; that doc frames it as SEO/sharing — add the perf bullet when picked up: TTFB ~400–700ms → ~50ms globally, an edge CDN file).

**What blocks a plain `export const dynamic = 'force-static'`:** even with locale solved you must (a) move `getUserWithProfile()` out of root layout into `(dashboard)/layout.tsx`, (b) skip CSP-nonce generation in `src/proxy.ts` for public paths (the per-request nonce makes every response unique HTML), and (c) scope the timezone cookie read similarly. None hard individually — the work is untangling four concerns currently mixed in the root layout.

**Sequencing:**
- *Small first win, no architecture change:* split layouts so `(public)/layout.tsx` doesn't call `getUserWithProfile()` — saves a Supabase round-trip (~50–150ms) per marketing hit without making anything static-eligible. Reversible.
- *Full win:* execute locale-in-URL *and* scope auth/nonce/timezone to the dashboard layout in one PR. Home goes static, TTFB ~50ms globally, SEO/sharing land as a side effect. Beats the canonical F2 baseline (`download=660ms` on `/` warm — see the benchmark log).

**Related — F2b, the first-device-login reload.** `LocaleProvider` reconciles a stale `locale` cookie against `profile.locale` on mount and calls `router.refresh()`, producing a visible second render on the first page after signing in on a new device. Root cause: next-intl's `getRequestConfig` runs before auth and can only read cookies/headers, so client-side reconciliation is the only option — "cookie as a cache of profile state," and new devices always miss the cache. This is a canary: any future pre-render preference (timezone, theme-critical CSS, feature flags) hits the same pattern. The locale-in-URL move (F2 full win) makes it **moot** (no cookie-as-cache dance when locale is in the path); until then, two narrower fixes — (a) write preference cookies server-side during the auth callback so SSR sees them next request (cheap per login, no per-render cost — the better default), or (b) thread the authenticated user through `getRequestConfig` to read the profile directly (per-request DB cost, no divergence). If the full win ships, F2b retires with it.

### F3 — Per-request role lookup is fanned out and partly redundant

On one protected dashboard navigation, `SELECT role FROM profiles` runs at the proxy (`src/proxy.ts`), the root layout (`getUserWithProfile`, `src/app/layout.tsx`), the `(dashboard)` layout (`getUserWithProfile` again — **same render**), and each `requireRole` API call (`src/lib/auth.ts:41`), plus RLS's `get_user_role()` (`STABLE`, so cached to one call per statement). ~12ms warm each. The two layouts fetching the **same row in the same render** is pure waste; it also multiplies under RSC prefetch fan-out (every prefetch re-runs the layout auth chain) — the same load shape as the 2026-05-31 incident, though here it lands on Postgres (which stayed healthy) rather than GoTrue. Identity at these layers is already free (F1); only the role query remains. Fix shape: the authorization model + I2 below.

### F4 — Server-prefetched data refetches immediately on mount (double fetch)

Every hook pairing server-prefetched `initialData` with a client `useQuery` (`useVisibleProductsByTypes`, `useParticipationCounts`, `useSpokenLanguages`, plus `useFamily`, `useMyUpcomingSessions`, the assignments/pin hooks) inherits the app default `staleTime: 0`, so data is fetched on the server for SSR and then **immediately refetched on mount** — every such query runs twice on first load. This is the established, intentional pattern (freshness — seat counts especially), so it's not a defect. But for near-static reference data (products, spoken languages) the second fetch is pure waste; a small per-hook `staleTime` would let the seeded data satisfy the first mount. Weigh globally if anyone revisits the prefetch convention — no action needed today.

## Recommended improvements

### The authorization model — where role must be live (frames F3 + I2)

Three concerns ride on the per-request `profiles` lookup and are easily conflated:

- **Authentication** (who is this) — verified locally via `getClaims` at every layer (~0.7ms; see Completed). Correctly cheap — leave it.
- **Authorization** (what role) — the residual cost (F3): queried at the proxy, both layouts, and every `requireRole`, plus RLS's `get_user_role()`.
- **Liveness / revocation** (is this session still valid *now* — not deleted, demoted, or a compromised account we must kill).

The trap: **liveness is currently an accidental side-effect of the authorization query.** A deleted/demoted user is caught only because every layer happens to re-`SELECT role FROM profiles` and notices the row changed — it was never a deliberate revocation mechanism. This is why the F1 trade-off note leans on that re-query to stay safe, and why naively "put role in the JWT everywhere" is dangerous: it optimizes the authorization query and **silently deletes the liveness mechanism riding on it.**

Separate the three by asking *where can an actual breach happen?* — only two places:

1. **RLS at the database** — the real authority for all data access; backstops any forgotten app-layer check.
2. **Routes using the admin/service-role client** (`createAdminClient()`), which *bypass* RLS — here `requireRole` is the only guard on a privileged write.

**Rule (target model): role is live authorization only at RLS and on admin-client routes; everywhere else it is advisory and may be read from the verified JWT.** Advisory role going stale only ever degrades to "wrong dashboard chrome for a few minutes while RLS denies the data underneath" — not a breach.

This matches our invariant: roles never change in normal operation (the one manual write — promote a new user to `admin` — happens *before* that account first signs in, so no live session goes stale). The only staleness that matters is the **break-glass reverse path** — killing a compromised admin or deleting an account — which must bite instantly, and is exactly what stays live at RLS + admin-client routes. Bake the immutable thing into the token for speed; keep a live check only for the emergency.

### I2 — Dedupe the role fetch; make app-layer role advisory

Supersedes the earlier "move role into JWT everywhere" framing. Ordered by value/risk:

1. **`React.cache()` the per-render profile fetch** (`getUserWithProfile`, `src/lib/supabase/server.ts`) — **done** (on `dev`). Collapses the root + `(dashboard)` layout queries to one per render. Honest impact is **small**: one `profiles` query (~≤12ms warm, often less if the two overlapped) per render, on Postgres — which has ample headroom and was *not* the 2026-05-31 bottleneck (GoTrue was), so this buys no incident protection. Justified as **hygiene** (fetching the same row twice in one render is just wrong), not as a perf lever. The dedup is **verified by construction** — the call sites (root `layout.tsx` + `(dashboard)/layout.tsx`, both calling `getUserWithProfile`; `+1` on `voice/group/[id]`) — not by a benchmark, since the saving is below timing noise and wouldn't change any decision. Zero new attack surface, a few lines. Only dedupes within one render; the proxy and `requireRole` are separate requests and keep their own lookups — so a **no-op on public/auth pages and API routes**. Step 2's real gate is a separate trace of those *residual* proxy/`requireRole` lookups, if/when it's reconsidered — not this change.
2. **Read advisory role from the JWT** at the app layers (proxy routing, layout chrome) — a custom access-token hook writes `role` into `app_metadata`; those queries drop to ~0ms. Only worth it if a trace *after* step 1 still shows the residual lookups mattering.
3. **Keep RLS and admin-client routes live** — `get_user_role()` unchanged (already cheap, must stay live); admin-client (`createAdminClient`) routes keep a live `profiles` role check (rare, privileged — the real boundary).

**Security guardrails if step 2 ships:**
- Role lives **only** in `app_metadata` (server/hook-written), never `user_metadata` — the latter is user-writable via `supabase.auth.updateUser` (`setup-account-form.tsx`, `reset-password-form.tsx`), so a role read from there is instant self-promotion to admin.
- The access-token hook is private (`REVOKE EXECUTE` from `authenticated`/`anon`/`public`, grant only `supabase_auth_admin` — CLAUDE.md "private by default"), reads the live `profiles` row, and **fails closed** (missing profile → lowest privilege, never `admin`).
- `profiles.role` stays the single source of truth; the JWT claim is a derived cache.

**Explicitly rejected: RLS reading role from the JWT.** It reopens the revocation hole — a stolen or stale admin token is DB-honored with zero liveness check until expiry — to optimize `get_user_role()`, already the cheapest site in the stack. It also pulls against the incident's mitigation #3 (a *longer* token TTL to cut GoTrue load widens exactly this stale-token window).

**Not a guard against the 2026-05-31 incident** — it relieves Postgres (the `profiles` query); that incident was GoTrue connection-pool saturation, Postgres healthy throughout (18/60 connections).

**Related cleanup:** retiring `is_admin()` for inline `get_user_role() = 'admin'` (TODO.md) touches the same RLS files — do them together if either is picked up.

## Completed improvements

### `AppSupabaseClient` — structural `getUser` guard + survivor conversion — closes I3 (branch `perf/auth-getclaims-guard`, 2026-05-31)

**What.** Removed `supabase.auth.getUser()` (a GoTrue HTTP round-trip) from every remaining call site, and made a server-side reintroduction a **compile** error rather than relying on review. Introduced `AppSupabaseClient` in `src/types/index.ts` — `SupabaseClient<Database>` with `auth.getUser` subtracted at the type level (`Omit`). The server `createClient()` (`src/lib/supabase/server.ts`) now returns it, and all ~14 service constructors take it. The full browser client (which keeps `getUser`) is still assignable to the narrower type, so `getClient()` results flow into services unchanged; the reverse isn't, which is what blocks `getUser` on the server.

**Why a type, not a lint.** A `no-restricted-syntax` ESLint rule was prototyped and rejected: it nags forever once the codebase is clean ("don't do this bad thing" long after everyone stopped). The type narrowing is self-documenting, catches the regression strictly earlier (red squiggle + `type-check`/build failure, before the line can run or merge), and adds zero runtime code. It deliberately scopes to the **server client + service layer** — the actual F1 fan-out surface. The browser client keeps `getUser` for the rare client-side case needing the live GoTrue `User`.

**Survivors converted** (the 11 calls I3 catalogued):
- `api/user/locale` → the getClaims-backed `getUser()` helper from `server.ts` (it only needs the id).
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
