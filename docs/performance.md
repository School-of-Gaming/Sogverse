# Performance

Running log of performance findings, planned improvements, and shipped changes. Cross-cutting only — subsystem-specific perf work lives in that subsystem's architecture doc.

Findings (`F`) describe what we've observed and the root cause. Improvements (`I`) are proposals; they move to "Completed improvements" once shipped, with a pointer to the PR that delivered them.

**Standing goal: a Claude-rated A+ verdict.** Each Speed Insights snapshot (see Real-user data) gets a letter-grade verdict with its reasoning recorded next to it, graded fresh from the numbers by whoever (or whatever) does the pull — the open findings are the path from the current grade to A+.

## Current infrastructure (as of 2026-08-20)

The hardware every finding below runs on. Update this section when a tier changes.

- **Supabase org (School of Gaming): Pro plan.** Prod `sogverse` runs **Small** compute (2 GB RAM, 2 shared ARM cores); staging `sogverse-staging` runs **Micro** (1 GB). Compute is billed hourly and a resize restarts the instance (~1–2 min). On a paid org, Nano is billed at the Micro price, so never park a project on Nano here — the resize to Micro is free performance.
- Both projects ran free-plan Nano (428 MB) until 2026-08-20. That box could not hold the platform stack resident: chronic swap thrash (~4 TB lifetime) depleted the disk IO burst budget and caused the Aug 19–20 all-services health flap, while the app workload itself measured healthy (64 MB database, 100% cache hit, ~63 s of query time/day). Upgraded four days ahead of the 2026-08-24 Helsinki municipal registration opening (~43 clubs × 15 seats at one instant).
- **Brevo: paid subscription, 5,000 emails/month** (upgraded 2026-08-20 from the free 300/day tier). Over-cap sends are **rejected by Brevo, not queued** — the send wrapper logs and swallows the failure, so a cap overrun means silently undelivered mail.
- **Backups: Pro daily physical backups on prod, 7-day retention — verified active 2026-08-20** (nightly ~02:00 UTC, listed via the Management API `database/backups` endpoint). Restore is dashboard-only and **all-or-nothing**: the whole database, project down during. PITR is deliberately off ($100/mo add-on, overkill at current scale), and Storage-API objects (product images) are **not** covered. A DIY encrypted `pg_dump` job (selective restore, downloadable offsite copy) was considered and declined once Pro landed; if ever revisited, a dump must include the `auth` schema alongside `public` — losing auth rows is the same disaster as losing profiles.

Every protected request — page load, API call, and every RSC prefetch — verifies the caller's identity at three layers:

1. **`src/proxy.ts`** (`proxy.ts:136`) — `supabase.auth.getClaims()` verifies the JWT **locally** against the project's published ES256 JWKS (no GoTrue round-trip). The `getSession()` it calls internally still refreshes a near-expiry token and rotates the cookie, so the proxy stays the single token-refresh point. Then queries `profiles.role` for role-based routing.
2. **`src/app/layout.tsx`** (root, `layout.tsx:56`) and **`src/app/(dashboard)/layout.tsx`** — each calls `getUserWithProfile()` (a local `getClaims()` + a `profiles` query). The two now share **one** query per render via React `cache()` (I2 step 1).
3. API routes add one more local `getClaims()` + profile query via `requireRole` (`src/lib/auth.ts`).

Identity verification is **local crypto** at every layer (~0.7ms each), so repeating it per layer no longer costs network round-trips — the F1 waterfall is gone (see Completed improvements). The residual cost is the **`profiles.role` lookup**: the two layouts now share one fetch per render (`cache()`, I2 step 1), leaving one lookup **per request-context** — the proxy, the render, and each `requireRole` call. Quantified as **F3**; removing the rest is the authorization model + **I2** below.

RSC prefetch runs on Next's default (`prefetch={true}`; the `prefetch={false}` workarounds were reverted). It's now a net positive — prefetches warm caches before clicks, and each one's auth is a local verify, so even a ~37-prefetch fan-out completes without saturation.

## Real-user data (Speed Insights)

Vercel Speed Insights collects Core Web Vitals (TTFB/FCP/LCP/INP/CLS plus a Real Experience Score) from real production visitors. There is **no official read API** (the documented Speed Insights API is intake-only) — `npm run perf:insights` (`scripts/speed-insights.mjs`) pulls the data through the internal endpoint the dashboard itself uses and prints overview percentiles plus per-route breakdowns with sample sizes. It authenticates with the local Vercel CLI login (any `school-of-gaming` team member's token works; `VERCEL_TOKEN` overrides). A Claude session cannot execute it itself — the permission classifier blocks access to the CLI token file — so ask the user to run it (`! npm run perf:insights`). If it starts 404ing, the internal API moved: re-capture the request URL from the dashboard's network tab and update the script's paths.

How to read the numbers:

- **p75 is the warm steady state** — what most visits get. **p90–p99 is the cold-start / heavy tail**, and the good/improvable/poor distribution says how many real pageviews land in it. This is the honest resolution of "cold starts pollute the test, warm caches make it too easy": the two conditions are separated by percentile, both are real, and the distribution gives their mix. Don't chase one synthetic number that blends them.
- **Sample sizes are thin** (~300 DAU): most routes collect under 100 datapoints per month, so route-level p75s are directional only. Before/after regression testing stays with the controlled benchmark protocol (benchmark log under the F1 completed entry); Speed Insights is the ambient monitor — watch the overall p75 and the poor-bucket share over time.
- **On a thin enough route, p75 *is* the cold number, and the bullet above stops applying.** The warm/cold-by-percentile split assumes visits arrive close enough together that something stays warm between them. Below roughly one visit per cache lifetime that assumption inverts: nothing the route touches is ever resident, so there is no warm population to occupy p75 and the percentile split no longer separates two conditions, because only one of them happens. `/schools/[municipalityName]/[id]` at ~1 visit/day measured ~1100ms cold against a ~170ms warm steady state — the warm figure is what a developer clicking twice sees and what almost no real visitor ever gets. (Those are pre-fix numbers, kept because the *gap* between them is the lesson; that route's cold cost was mostly one read, since removed — see the F6 entry under Completed.) **Read a route's `n` before reading its p75 as steady state**; under ~100/30d, treat it as the cold number.

### Snapshot log

Append-only, like the benchmark log. Format: `date · window · scope → headline numbers`, with the reading that matters.

- **2026-08-13 · last 30 days · production, both devices** — datapoints: TTFB 1888 desktop / 588 mobile (desktop ≈ 3× mobile traffic; `/gamer` is the top route at n=643).

  | p75 / p90 / p95 / p99 | Desktop | Mobile |
  |---|---|---|
  | TTFB | 397 / 1307 / 1968 / 5016 ms | 431 / 1137 / 1793 / 4299 ms |
  | FCP | 1859 / 2964 / 3908 / 8364 ms | 1792 / 2920 / 3816 / 6204 ms |
  | LCP | 2076 / 3372 / 4552 / 11624 ms | 2228 / 3325 / 4309 / 6304 ms |
  | INP | 48 / 104 / 248 / 1504 ms | 104 / 160 / 328 / 2368 ms |
  | CLS | 0.002 / 0.016 / 0.12 / 0.38 | 0 / 0.04 / 0.09 / 0.36 |

  Reading: warm TTFB ~400ms with ~6% of pageviews in the poor (>1.8s) bucket — the cold/heavy tail is real but bounded. CLS is excellent (94–97% good, p75 ≈ 0): the layout-shift rules visibly hold in production. Route hotspots → F5; public-page numbers → F2.

  **Verdict: B+.** Interaction quality is excellent (INP p75 48ms desktop, CLS near-perfect — the app *feels* fast once loaded) and the core family loop has good TTFB at real sample sizes. What holds the grade down: first paint is mediocre with no headroom (FCP 74–75% good, p75 sitting on the 1.8s threshold; LCP scrapes under 2.5s), and the worst experiences cluster on *entry* surfaces — `/schools` poor, the ~6% cold tail, the voice-room entry LCP — i.e. slowest exactly where first impressions form, while committed users get the fast path. Path to A+: F2 first (converts the worst numbers on the most impression-sensitive surface into edge-CDN hits), then the F5 hotspots, with Server-Timing instrumentation before diagnosing them so "slow" becomes "why".

  > **Annotation (2026-08-17): the `/schools` half of this verdict is pre-fix.** It was graded before F6 was diagnosed, so it reads the worst entry-surface number as F2's dynamic-render tax; the probe since attributed ~75% of that route's cold path to a whole-country municipality read, now removed (see Completed). The verdict itself stands as written — it is a point-in-time grade of a point-in-time pull, and the next pull gets its own. What changes is the path to A+: the biggest single `/schools` number is addressed, and the *rest* of that route, plus every other public page, is still F2.

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
2. But `src/app/layout.tsx:52-69` (root layout) calls `getUserWithProfile()`, `getLocale()`, `cookies()`, and `headers()` (the last reads the proxy-set referral-attribution header). Any one marks the whole subtree dynamic — Next can't pre-render output that depends on the request.
3. So Vercel routes every visit through a serverless function: proxy + token refresh + Supabase auth round-trip + render + stream. ~400–700ms before first byte; the edge CDN never serves it from cache.
4. The load-bearing dynamic read for *public* pages is `getLocale()` — the locale cookie tells next-intl which translation to emit, so the same URL returns different bodies per request, which Vercel won't cache. The auth call, CSP nonce, and timezone cookie are `(dashboard)` needs leaked into the root layout.

**Architectural fix — locale-in-URL:** `/fi`, `/en`, `/sv` each get a statically pre-rendered home page; bare `/` does an edge redirect on `Accept-Language`. Detailed in the i18n CLAUDE.md (`src/i18n/`), which frames it as SEO/sharing — add the perf bullet when picked up: TTFB ~400–700ms → ~50ms globally, an edge CDN file.

**What blocks a plain `export const dynamic = 'force-static'`:** even with locale solved you must (a) move `getUserWithProfile()` out of root layout into `(dashboard)/layout.tsx`, (b) skip CSP-nonce generation in `src/proxy.ts` for public paths (the per-request nonce makes every response unique HTML), (c) scope the timezone cookie read similarly, and (d) decide where the referral-attribution header read lives — it has to stay above every page, and it is a request header, so it cannot simply move to `(dashboard)`. None hard individually — the work is untangling five concerns currently mixed in the root layout.

**Sequencing:**
- *Small first win, no architecture change:* split layouts so `(public)/layout.tsx` doesn't call `getUserWithProfile()` — saves a Supabase round-trip (~50–150ms) per marketing hit without making anything static-eligible. Reversible.
- *Full win:* execute locale-in-URL *and* scope auth/nonce/timezone to the dashboard layout in one PR. Home goes static, TTFB ~50ms globally, SEO/sharing land as a side effect. Beats the canonical F2 baseline (`download=660ms` on `/` warm — see the benchmark log).

**RUM corroboration (2026-08-13 Speed Insights pull).** Home TTFB p75 627ms desktop / 331ms mobile — the dynamic-render tax measured on real visitors, matching the 660ms synthetic benchmark. `/schools` is the worst public route: TTFB p75 **1886ms, rated POOR** (n=33) — a low-traffic cold-entry page (families arriving from a school's message) pays a cold lambda on top of the dynamic render. Strongest real-user evidence yet for the full F2 fix.

> **Pre-fix number — most of that 1886ms was F6, not F2.** The `/schools` figure was pulled while all three `/schools` routes ran a whole-country municipality read; the controlled probe four days later attributed ~75% of the cold path to that read, which the F6 work (see Completed) removed. Expect this route's number to fall toward the lambda-init + dynamic-render floor rather than to zero — **the dynamic-render tax F2 is about is untouched**, and this bullet's home-page numbers are unaffected by that work and remain the clean F2 evidence. The historical figures stay as recorded; re-pull before reading them as current.

**Related — F2b, the first-device-login reload.** `LocaleProvider` reconciles a stale `locale` cookie against `profile.locale` on mount and calls `router.refresh()`, producing a visible second render on the first page after signing in on a new device. Root cause: next-intl's `getRequestConfig` runs before auth and can only read cookies/headers, so client-side reconciliation is the only option — "cookie as a cache of profile state," and new devices always miss the cache. This is a canary: any future pre-render preference (timezone, theme-critical CSS, feature flags) hits the same pattern. The locale-in-URL move (F2 full win) makes it **moot** (no cookie-as-cache dance when locale is in the path); until then, two narrower fixes — (a) write preference cookies server-side during the auth callback so SSR sees them next request (cheap per login, no per-render cost — the better default), or (b) thread the authenticated user through `getRequestConfig` to read the profile directly (per-request DB cost, no divergence). If the full win ships, F2b retires with it.

### F3 — Per-request role lookup is fanned out across request-contexts

On one protected dashboard navigation, `SELECT role FROM profiles` runs in several places: the proxy (`src/proxy.ts`), the layout render (`getUserWithProfile`, `src/app/layout.tsx` + `(dashboard)/layout.tsx`), each `requireRole` API call (`src/lib/auth.ts:41`), plus RLS's `get_user_role()` (`STABLE`, so cached to one call per statement). ~12ms warm each.

The **same-render duplication is fixed** (I2 step 1, `9d6d429`): the two layouts now share one fetch via `cache()`, so a render does one lookup, not two. What remains is one lookup **per request-context** — proxy, render, each API route — which `cache()` can't dedupe (separate requests) and which only step 2 (advisory JWT role) removes. The cost lands on Postgres (which has headroom and was *not* the 2026-05-31 bottleneck), so this is efficiency/hygiene, not incident-relevant.

### F4 — Server-prefetched data does NOT double-fetch on mount (non-issue)

An earlier version of this note claimed every hook pairing server-prefetched `initialData` with a client `useQuery` (`useVisibleProductsByTypes`, `useParticipationCounts`, `useSpokenLanguages`, plus `useFamily`, `useMyUpcomingSessionRows`, the assignments/pin hooks) inherits an app default of `staleTime: 0` and so refetches immediately on mount. **That was wrong.** The global default in `src/providers/query-provider.tsx:16` is `staleTime: 60 * 1000` (1 minute) — and has been since the initial commit — and no hook overrides it (it's the only `staleTime` in the codebase). React Query treats server-seeded `initialData` as fresh on mount, so within that minute there is **no** immediate refetch; the feared double-fetch doesn't happen.

What does happen, by design: after a minute the data is stale, so a background refetch can fire on a later remount/window-focus. That's the intended freshness behavior (seat counts especially), invisible to the user, and not waste. No action needed.

### F5 — Route hotspots from real-user data (2026-08-13 pull; causes not yet investigated)

The first Speed Insights pull (see Real-user data) surfaced four routes worth a look. Numbers are 30-day p75s from production RUM; none has a confirmed root cause yet — a bullet graduates to its own finding when investigated.

- **`/admin` TTFB 1307ms (improvable, n=95).** The admin dashboard does heavy server work per load. Cause uninvestigated.
- **`/parent/unlock` TTFB 920ms desktop / 1065ms mobile — and the top mobile route by traffic (n=98).** The PIN unlock page is the most user-visible slow TTFB in the family flow.
- **`/voice/group/[id]` LCP 4552ms desktop (POOR, n=81) — but INP excellent (72ms, n=403).** The room feels fine once loaded; the entry paint is the problem. Hypothesis: the video/participant tile arrives late and is the LCP element.
- **`/shop/[id]` LCP ~3.2s on both devices (improvable).** Hypothesis: the product hero image (sizing/priority).

  > **Annotation (2026-08-18): the hypothesized fix ships with `feat/next-image-product-banner`.** Product images now render through the Vercel image optimizer — the detail hero is preloaded (`priority`) and arrives as a right-sized WebP (~100–250 kB) instead of the stored 2–4 MB PNG original, and browse-card images are right-sized per viewport the same way. **After the next release, re-pull Speed Insights and read `/shop/[id]` LCP against this pull's ~3.2s p75** (and `/shop`'s LCP alongside it). Two reading cautions: mind the thin-route rule above, and expect a brief first-encounter tail while the optimizer's per-(image, width) cache fills — WebP-only over AVIF was priced on exactly that tail (`next.config.ts` records the reasoning and the traffic threshold at which AVIF flips back on). The branch's actual motivation was Supabase Cached Egress, which Speed Insights cannot see — read that meter on the Supabase dashboard (Organization → Usage) in the same pass.

## Recommended improvements

**Priority: low — no fire.** The 2026-05-31 incident is mitigated (the GoTrue per-request path is cleaned up; see Completed). Nothing here blocks anything. Step 1 below (`cache()`) is a do-anytime hygiene cleanup and is **done**; step 2 (advisory JWT role) is deferred until a trace shows the residual per-request-context lookups actually cost something — given Postgres' headroom, that bar may never be met. Pick this up when you're already in the auth/RLS files, not as dedicated work.

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

1. **`React.cache()` the per-render profile fetch** (`getUserWithProfile`, `src/lib/supabase/server.ts`) — **done** (`9d6d429` on `dev`). Collapses the root + `(dashboard)` layout queries to one per render. Honest impact is **small**: one `profiles` query (~≤12ms warm, often less if the two overlapped) per render, on Postgres — which has ample headroom and was *not* the 2026-05-31 bottleneck (GoTrue was), so this buys no incident protection. Justified as **hygiene** (fetching the same row twice in one render is just wrong), not as a perf lever. The dedup is **verified by construction** — the call sites (root `layout.tsx` + `(dashboard)/layout.tsx`, both calling `getUserWithProfile`; `+1` on `voice/group/[id]`) — not by a benchmark, since the saving is below timing noise and wouldn't change any decision. Zero new attack surface, a few lines. Only dedupes within one render; the proxy and `requireRole` are separate requests and keep their own lookups — so a **no-op on public/auth pages and API routes**. Step 2's real gate is a separate trace of those *residual* proxy/`requireRole` lookups, if/when it's reconsidered — not this change.
2. **Read advisory role from the JWT** at the app layers (proxy routing, layout chrome) — a custom access-token hook writes `role` into `app_metadata`; those queries drop to ~0ms. Only worth it if a trace *after* step 1 still shows the residual lookups mattering.
3. **Keep RLS and admin-client routes live** — `get_user_role()` unchanged (already cheap, must stay live); admin-client (`createAdminClient`) routes keep a live `profiles` role check (rare, privileged — the real boundary).

**Security guardrails if step 2 ships:**
- Role lives **only** in `app_metadata` (server/hook-written), never `user_metadata` — the latter is user-writable via `supabase.auth.updateUser` (`setup-account-form.tsx`, `reset-password-form.tsx`), so a role read from there is instant self-promotion to admin.
- The access-token hook is private (`REVOKE EXECUTE` from `authenticated`/`anon`/`public`, grant only `supabase_auth_admin` — CLAUDE.md "private by default"), reads the live `profiles` row, and **fails closed** (missing profile → lowest privilege, never `admin`).
- `profiles.role` stays the single source of truth; the JWT claim is a derived cache.

**Explicitly rejected: RLS reading role from the JWT.** It reopens the revocation hole — a stolen or stale admin token is DB-honored with zero liveness check until expiry — to optimize `get_user_role()`, already the cheapest site in the stack. It also pulls against the incident's mitigation #3 (a *longer* token TTL to cut GoTrue load widens exactly this stale-token window).

**Not a guard against the 2026-05-31 incident** — it relieves Postgres (the `profiles` query); that incident was GoTrue connection-pool saturation, Postgres healthy throughout (18/60 connections).

**Related cleanup:** retiring `is_admin()` for inline `get_user_role() = 'admin'` touches the same RLS files — do it alongside this if either is picked up.

## Completed improvements

### `/schools` reads bounded by clubs, not by Finland — closes F6 (branch `feat/schools-fetch-bounded-by-clubs`, 2026-08-17)

**All headline numbers are now measured.** Warm TTFB and payloads came from a same-day
two-deployment staging A/B; the cold path was measured the same day on a **private**
staging deployment after a genuine 27-minute idle, control-first — the control's 2.2 s of
cold init is the proof the run was clean. Production re-measurement after the next
release is a cheap confirmation, no longer load-bearing. Everything under *Why* was
measured before the change.

**What shipped.** Four changes across the three public `/schools` routes:

1. **The data flow reversed on both listing routes — clubs first, geography second.** Both already read the clubs; they now derive the geography from what those clubs point at, resolving each club's location *up to its nearest municipality* through the shared resolver (never an id comparison, which keeps only the online half and silently drops every in-person club). `/schools/[municipalityName]` needs **no locations read at all** — the product embed carries the municipality's id, name and name alternates, which is the display name, the canonical slug and every alternate slug. `/schools` still needs the region, which only the ancestor chain carries, so it reads exactly the club-bearing municipality ids through the keyed read (chunked under the response cap, bounded by construction) and narrows to Finnish municipality rows in memory.
2. **The detail route's read is gone entirely.** `/schools/[municipalityName]/[id]` ran the whole-country read to produce one string; the back link's municipality name now comes from the product row the page already fetches. The link keeps the name — an earlier attempt replaced it with a generic label on the mistaken belief that keeping the name required keeping the read, and was reverted rather than shipped.
3. **Hybrid search on `/schools` — a union, not a cascade.** Only the club-bearing municipalities ship to the browser and are searched in memory, instantly. Every debounced query of two or more characters *also* asks the existing cached, indexed location-search route (scoped to Finland and to the municipality level, by the database); its hits are deduped against what the local arm actually rendered for this query and appended below. The union shape replaced a fire-only-on-zero-local-matches cascade, which was verified against the real data to hide whole municipalities: 32 Finnish municipality names sit inside another's (Lahti inside Vesilahti/Kontiolahti/Ruokolahti, Pori inside Raasepori, …), so a parent in clubless Lahti typing their whole town would have seen only the "-lahti" towns — and *which* pairs were live would shift silently as clubs open and close.
4. **The shared browse select narrowed** (beyond the finding, owner-approved while in here). The visible-products browse read went from select-everything to an explicit column list — eight `products` columns dropped (including three internal fee columns previously shipped to anonymous `/shop` visitors), translations narrowed to locale/name/short description, prices to currency/cents. Roughly 40% of every browse row was columns nothing rendered, twice over, since the rows ship again in the RSC payload. `/schools` additionally takes a dedicated select of its own: the embedded location chain plus only the columns visibility filtering needs. `/schools/[municipalityName]` keeps the full rows — they seed the client's React Query cache.

**Why (was F6).** `/schools` and `/schools/[municipalityName]` both read every Finnish municipality — 308 rows, each carrying a 3-level ancestor embed — then slugified and collator-sorted the whole list, on every request. `/schools` additionally serialised all 308 entries into the RSC payload, so they shipped to every visitor's browser.

Measured 2026-08-17 against production, first request after a 25-minute idle with nothing warmed before it:

| `/schools` cold TTFB | 1170 ms |
|---|---|
| warm TTFB | ~185 ms |
| server fetch | 238,285 bytes |
| client RSC payload | ~60 KB (estimated from row count) |

Of the 1170 ms: ~40 ms network, ~107 ms lambda init, ~145 ms warm server work, **~878 ms (75%) the municipality read against cold caches.** The 238,285 bytes are the municipality read alone (~774 bytes × 308 rows accounts for it); the clubs read on top of it was never measured.

**The read was not merely expensive, it was bounded by the wrong variable** — which corrects an earlier version of this finding that claimed both routes genuinely needed the whole country. Two facts, both verified in the code, made it unnecessary:

- `/schools` filtered its entries to club-bearing ones *before* rendering its default view. The only consumer of the other ~290 was the client-side search box.
- `/schools/[municipalityName]` 404s for a real municipality with no clubs, by an explicit guard, exactly as it does for a nonsense slug. So the set of slugs that can produce a page is precisely the club-bearing ones, and resolving against all of Finland to then discard every clubless hit is O(M) work for an O(C) answer.

**The product detail route had the same fault, one route further down.** `/schools/[municipalityName]/[id]` ran the identical whole-country read to produce **one string** — the municipality's display name, for the back link's label. Measured cold: **1102 ms**, against ~295 ms for `/shop/[id]`, the same page without that read. The name was never worth fetching: the product row the page already requests client-side embeds its location with `name` and `name_i18n`, so the label was derivable for free from data already in flight — and could not have painted any earlier anyway, since the back link lives in a body that waits for that same product query.

**Urgency was traffic, not depth.** `/schools` is the product's main landing page and is expected to become the highest-traffic page on the site within a month, driven by a marketing push; today it sees roughly one visit per day. Speed Insights could neither justify nor verify the fix — at that traffic it reports nothing useful, and by the time it reports anything the affected visitors have already had the bad experience. This is the case the "read `n` before reading p75" note above is about, seen from the other side: a route can also be *too new* to measure. The cold path is also what a traffic ramp actually gets — many concurrent cold invocations each pulling 238 KB against a cold database, and this log records two prior incidents where per-request work that was fine at low volume crossed a nonlinear knee under concurrency.

**Rejected alternatives (each turned down *after* measurement — do not rebuild them).**

- **Cross-request caching of the built entry list**, which this finding originally recommended. It amortises the server fetch but cannot touch the per-visitor client payload, the larger problem on a landing page, and its staleness window interacts badly with the layout-stability rule (cached HTML showing a just-unpublished club that a client refetch then removes is a shift on data's own schedule). Revisit only if a burst test shows the *remaining* server work is a problem.
- **A generated, indexed `slug` column on locations.** The O(M) slug→row scan disappears with the reversal rather than needing an index, and the column is harder than it looks: a slug must invert from the canonical name *and* every alternate, per locale, so it is an array column or side table plus a per-locale collision invariant.
- **Trimming the ancestor embed, or fetching the ~19 regions separately.** Measured: one embed level saves 31% of the payload, dropping it and reading regions separately 61%, also dropping unread columns 82%. All real, all irrelevant — they optimise a query that should no longer run.
- **Fully server-side search** (every keystroke hits the route). The first recommendation, made while the page was believed to be low-traffic; on a landing page whose primary interaction is "find my town", making every keystroke networked is a real downgrade. The union hybrid still sends one debounced, CDN-cached request per query but differs where it matters: the successful path renders locally and instantly, and the network is additive.
- **Static generation / ISR.** The root layout reads the session on every request, so these routes are dynamic whatever the page does. That is F2's territory and stays open.

**Accepted behaviour changes** (all decided by the owner, none a regression to "fix" by restoring a whole-country read):

- The keyed read never filters retired rows — a stored pick must keep resolving — so a club anchored to a *retired* municipality now appears on `/schools` and at its own URL, where it used to be hidden. The club is real and already visible in `/shop`; hiding it means a family cannot find a club they may be enrolled in.
- `/schools/[municipalityName]` can no longer check the country (the product embed carries none), so a club anchored to a non-Finnish municipality would render at its own URL while staying absent from `/schools`. Reachable today only through legacy rows the DB trigger still permits — the picker only offers Finnish municipalities.
- With the detail route's read gone, an unknown municipality slug no longer 404s there: it renders the product with a back link to a listing that will itself 404. The route is `noindex` and the slug never gated the product.

**Before / after.**

| | before (measured 2026-08-17) | after (measured 2026-08-17, staging) |
|---|---|---|
| `/schools` cold TTFB | 1170 ms | **391 ms** (projection was 350–450) |
| `/schools` warm TTFB | ~185 ms | **~190 ms** staging steady state (180 ms in the A/B) |
| server fetch per request | 238,285 bytes | ~5 KB (bounded by construction; not separately metered) |
| client RSC payload | ~60 KB | page bytes −65 KB measured; the entry list is now tens of rows |
| `/schools/[municipalityName]/[id]` cold TTFB | 1102 ms | not separately probed — the route now *is* its control's shape (`/shop/[id]`, zero page reads) |

The projections are inference by analogy with `/shop/[id]` — the same "no heavy fetch" shape, measured at ~295 ms cold and ~100 ms warm — not measurements of this branch. The ~5 KB server-fetch figure depends on the narrowed `/schools` club read; without it the club rows dominate and the target is unreachable. **A floor of roughly 300 ms cold is expected and acceptable**, because ~107–195 ms of it is Vercel lambda init these routes cannot avoid without going static (F2).

**Measured — same-day staging A/B (2026-08-17).** Both codebases as fresh Vercel preview
deployments of the same project against the same staging database — old (`dev`) and this
branch — probed control-first:

| | old code | new code |
|---|---|---|
| `/shop/[id]` control, cold lambda | 1.22 s | 1.01 s |
| `/schools` warm TTFB | 0.38–0.80 s | **0.18 s** |
| `/schools` page bytes | 262,458 | **197,304** (−65 KB) |
| `/shop` listing page bytes | 388,827 | **340,107** (−49 KB — the narrowed browse select) |

The controls confirm equal cold-start baselines (preview-infra lambdas are heavier than
prod's, which is why both controls sit near a second). The warm gap is the reversal
itself — same infra, same data, ~2–4×, and the old code's warm numbers were visibly
noisier. The cold `/schools` reading was not obtainable this way: the old code's first
hit came in *below its own control*, meaning the control had already warmed the shared
function bundle and earlier warm passes had warmed the staging database — see the method
note below.

**Verification — the cold probe, run 2026-08-17.** Staging traffic cannot be controlled,
so the probe ran against a **private deployment**: the staging alias was moved to a fresh
redeploy of the same build (live browsing hits that), leaving the previous deployment
reachable only by its unique URL; it idled 27 minutes (long enough for Vercel to recycle
any previously warm functions), then control-first: `/shop/[id]` **2214 ms** (cold init +
baseline — the proof of a clean run), `/schools` **391 ms**, `/shop` **386 ms** (the
listing's first cold-ish reading), warm repeats 341 → 191 ms. The telling shape: before,
`/schools` cost its control *plus* ~875 ms of municipality work; now it lands *under* its
own control and ~200 ms above warm steady state. Caveat: the staging database is shared
and was being browsed during the idle, so its caches were not fully cold — the new code's
small DB-cold sensitivity is the design goal, and the number landing on-projection
supports it. Re-run the same probe on production after the next release as confirmation.
A burst test — many concurrent cold requests, to check the launch knee — deliberately
loads production and must be agreed with the owner first.

**The method is the reusable part.** The question that mattered was whether the cold cost was lambda init — which no application change can fix — or work the app was doing. Warm requests cannot answer it, and neither can a slow route measured alone. What answered it was a **near-identical sibling route as a control**: `/shop/[id]` renders the same component with the same client-side fetches and differs only by the lookup, so its cold TTFB *is* lambda init plus baseline, and everything above that is attributable work. Ordering the probe to hit the control first, after a genuine idle, is what keeps the reading clean. Where such a sibling exists this beats instrumentation for a first cut; where one does not, Server-Timing is still the way in.

A second method lesson, from the A/B: **a fresh deployment is not a cold system.**
Redeploying resets the lambdas but neither the database's caches nor the pooler, and on a
single-bundle Next.js deployment the first request to *any* route warms the function every
route shares — so a redeploy A/B can measure cold init and warm steady state, never the
cold data path. Only genuine idle produces that.

**The counter-intuitive part, recorded because it will recur.** The initial hypothesis — reasonable, and wrong — was that a route at ~1 visit/day is dominated by cold starts and therefore beyond the reach of application work. Init turned out to be ~9–18% of it. The routes were cold in a different sense: not the machine, but everything the request touched (unresident Postgres pages, un-JITed per-row work). That distinction decides the whole remedy, because a cold machine is fixed only by a warmer or by removing the lambda, while cold work is ordinary engineering. **Do not infer the layer from the symptom** — both present as "slow first hit, fast second".

**Not attributed:** how the 878 ms divided between cold Postgres pages, `JSON.parse` of 238 KB in a cold V8, and the slugify-plus-collator work. The reversal removes most of all three, so the split was not chased.

**Tested.** Unit coverage for the entry building and slug resolution was reshaped rather than dropped — `/schools` feeds keyed rows-with-chains while the municipality route works from embedded location nodes, two input shapes through one slug-derivation rule; a select-shape regression test pins the negative property the compiler cannot (the browse select must not silently widen again); and the whole-country read's deletion took its unit tests, its column-discipline registry entry and its DB coverage with it, with one guarantee deliberately preserved — a new DB test seeds its own >1000 rows and walks them, keeping the only proof anywhere that PostgREST truncates the way the paged walk assumes. Behaviour was verified case by case on the listing routes (club-bearing slug renders, clubless municipality 404s, nonsense slug 404s, Swedish alternate slug renders) and on the detail route's back link, in a non-default locale as well.

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
