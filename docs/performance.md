# Performance

Running log of performance findings, planned improvements, and shipped changes. Cross-cutting only — subsystem-specific perf work lives in that subsystem's architecture doc.

Findings (`F`) describe what we've observed and the root cause. Improvements (`I`) are proposals; they move to "Completed improvements" once shipped, with a pointer to the PR that delivered them.

## Per-request server stack

Every request — page load, API call, **and every RSC prefetch** — traverses this chain:

1. **`src/proxy.ts`** runs (matched paths in `proxy.ts:232-242`). Calls `supabase.auth.getUser()` at `proxy.ts:119` — HTTP round-trip to Supabase's GoTrue to verify the JWT. Then queries `profiles.role` (`proxy.ts:144` or `:190`) for role-based routing decisions.
2. **`src/app/layout.tsx`** (root) calls `getUserWithProfile()` at `layout.tsx:55` — a second `getUser()` and `profiles.select("*")`.
3. **`src/app/(dashboard)/layout.tsx`** (or matching route-group layout) calls `getUserWithProfile()` at `(dashboard)/layout.tsx:10` — a third `getUser()` and third profile query.
4. Page server component renders.

Result: **3× `getUser()` to GoTrue + 3× `profiles` queries per protected dashboard request**, all to answer the same questions ("who is the caller, what's their role"). Costs from staging (eu-north-1, dev → public internet, measured 2026-05-27 per TODO.md §"Dedupe the `getUser()` + profile fetch"): `getUser()` ≈ 84ms p50 / 91ms mean; profile query ≈ 12ms p50 (warm session). In-region (Vercel → Supabase same region) the per-call cost drops to ~10-30ms but the multiplier remains.

RSC prefetch amplifies the cost. Next.js's default `<Link prefetch={true}>` fires one full SSR render per nav item. For an admin landing on a dashboard route the chrome alone (sidebar 13 items + header 4 items = 17 links) would prefetch 17 routes; each pays the full waterfall. Vercel function concurrency and Supabase auth rate limits saturate; prefetches queue behind one another.

## Active findings

### F1 — Per-request auth waterfall (observed 2026-05-28)

Browser perf trace on `/admin/users` in production:

- Page's own React Query fetches: fast (`useUsers` 689ms, `useParentGamerLinks` 774ms — the page's actual work)
- 24 RSC prefetches in parallel: median 1129ms, max 3902ms, 16 over 1s
- Slowest prefetches: `/settings` (3902ms), `/` (3796ms), `/admin` (3616ms), `/register` (3604ms) — all mostly chrome, no heavy data

Root cause: every prefetched route pays the full auth waterfall (`getUser()` × 3, `profiles` × 3), fanning out 24× in parallel. Each `/settings` render does ~6 round-trips to Supabase to serve a page with no real work.

**Symptomatic patches already in the tree** — these reduce prefetch fanout but do not address per-request cost:

- `src/components/layout/sidebar.tsx:131` — `prefetch={false}` on admin sidebar nav (13 items)
- `src/components/admin/user-row.tsx:35`, `:71` — `prefetch={false}` on user row links
- `src/components/gedu/GroupCard.tsx:124`, `:155` — `prefetch={false}` on gedu group card links
- `src/components/gedu/UpcomingGroupSessionCard.tsx:52` — `prefetch={false}` on upcoming session card
- `src/components/parent/NextSessionCard.tsx:160` — `prefetch={false}` on parent next-session card

`src/components/layout/header.tsx` still has 4 unguarded `<Link>` components (logo line 148, nav links line 161, settings gear line 178, avatar line 192) and is the live source of the prefetch flood in current perf logs. Hold off patching it — the architectural fix in I1 makes per-prefetch cost cheap enough that `prefetch={true}` is no longer harmful, and reverting the patches lets prefetch do the job it's designed to do (warm caches before clicks).

### F2 — Public marketing pages aren't edge-cacheable

Tracked in TODO.md §"Make the public marketing pages edge-cacheable — they're paying the dynamic-rendering tax for nothing." Short version: `src/app/layout.tsx:55-62` calls `getUserWithProfile()`, `headers()`, `getLocale()`, `cookies()` — any one marks the whole subtree dynamic, so every public-page visit goes through a serverless function (~400-700ms TTFB) instead of being served from the edge CDN. The locale cookie is the load-bearing dynamic input; auth/CSP-nonce/timezone reads are needs of the `(dashboard)` group leaked into the root layout.

Full chain, blockers, and sequencing options live in the TODO item. Brought into this doc once it's actively being scoped.

## Recommended improvements

### I1 — Thread signed auth context from proxy to layouts and route handlers (fixes F1)

**Shape.** The proxy is the only place that verifies the JWT. It signs `{ userId, role, exp }` with a server-only HMAC secret and sets it as `x-auth-context` on the forwarded request. A new helper `getAuthContext()` in `src/lib/auth.ts` reads and HMAC-verifies the header, returning `{ userId, role }`. Layouts and route handlers consume the helper instead of calling `getUser()` again.

**Files touched.**

- `src/proxy.ts` — strip any inbound `x-auth-context` (load-bearing, see security note), set the signed header after the existing verification.
- `src/lib/auth.ts` — new `getAuthContext()` helper. Refactor `requireRole` to use it (closes the API-route half of the duplication noted in TODO.md §"Dedupe the `getUser()` + profile fetch").
- `src/lib/supabase/server.ts` — `getUserWithProfile()` becomes deletable. Replaced by `getAuthContext()` + a `React.cache()`-wrapped `getProfile(userId)` for the routes that need profile columns beyond role.
- `src/app/layout.tsx` — switch to `getAuthContext()`, or drop the auth call entirely if no consumer needs user/profile at the root level (verify by tracing where `initialUser` / `initialProfile` are actually read; Providers may seed from elsewhere).
- `src/app/(dashboard)/layout.tsx` and other route-group layouts — switch to `getAuthContext()` plus the cached profile fetch.

**Security note.** The proxy must *unconditionally* strip any inbound `x-auth-context` before setting its own — otherwise a client-supplied forgery could leak through to a handler that trusts the header. HMAC verification in `getAuthContext()` is the second line of defense; either alone is insufficient. If the "every path must strip" discipline feels fragile, sign a wider payload (include the request path or a nonce) so a captured header can't be replayed onto a different route — but that adds plumbing. The unconditional strip is the simpler, well-bounded choice.

**Impact.** Per protected dashboard render:

| | `getUser()` to GoTrue | `profiles` query |
|---|---|---|
| Today | 3 | 3 |
| After I1 | 1 (proxy) | 1 (proxy) + 0–1 (only if profile columns needed) |

Roughly **6 round-trips → 2–3 round-trips**, and the prefetch flood gets proportionally cheaper without changing any prefetch behavior. Removes the most expensive operation (`getUser()` HTTP to GoTrue, ~84ms p50 out-of-region) from every layout pass. Lets the `prefetch={false}` patches in F1 be reverted — prefetch becomes a net positive again.

**Why this over alternatives.**

- *Wrap server helpers in `React.cache()`* — highest impact-per-line but it's memoization, not architecture. Hides repeat calls within a single render scope; does nothing for API routes (different scope) and does not establish a trust boundary. Worth doing as a tactical layer *on top of* I1 for the residual profile fetch, not instead of it.
- *Locale-in-URL + static public pages* (TODO §"Make the public marketing pages edge-cacheable") — bigger absolute win for public pages (TTFB 400-700ms → 50ms globally) but scope is a quarter-long project (locale routing + edge redirect + i18n migration + auth/CSP/timezone scope-trim out of root layout). Composable with I1, not a substitute.
- *Move role into JWT custom claims* (TODO §"Consider moving role into JWT claims to eliminate the per-query DB lookup in RLS") — eliminates the `profiles.role` query everywhere (RLS + proxy) but requires a Supabase auth hook + every RLS policy migrated. Composable with I1; correctly sequenced *after* it.

**Sequencing.** I1 fully closes TODO.md §"Dedupe the `getUser()` + profile fetch" by extending the same mechanism (signed headers from proxy) from API routes to RSC layouts. Partially unblocks one of the four blockers in TODO.md §"Make the public marketing pages edge-cacheable" (the "move `getUserWithProfile()` out of root layout" piece). Does not constrain the JWT-claim or locale-in-URL moves.

**Scope.** One focused PR, ~200-400 lines. Required tests:

- Integration: proxy strips inbound `x-auth-context` on the public-route path (forgery rejection).
- Integration: `getAuthContext()` rejects a tampered signature (401).
- Integration: `getAuthContext()` rejects an expired payload (401).
- Integration: happy path — protected route reads the same `userId` / `role` the proxy verified.
- Unit: HMAC sign/verify roundtrip with the secret rotation path (if any).

## Completed improvements

_(none yet — entries will land here with a PR link and a one-line "before / after" measurement once shipped)_
