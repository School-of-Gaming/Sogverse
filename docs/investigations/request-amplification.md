# Request amplification

The platform serves roughly **fifteen server requests for every page a person actually
views**, and almost all of the excess is Next.js link prefetching that — on this app's
architecture — cannot deliver anything a click can use. This document names the system
that produces that ratio, ties together the findings in `docs/architecture/performance.md` that each
saw one face of it, and frames the remedy decision. It ends with a recommendation, but
the decision is the owner's and is deliberately not being rushed: nothing here is urgent,
because nothing here is currently failing.

**Status: decision open.** Written 2026-08-25, triggered by a Vercel billing alert that
turned out to be the symptom, not the subject. One narrow cut has shipped (the four
footer legal links no longer prefetch — commit `8bf965de` on `dev`); everything else is
proposed only.

**How to read this doc.** Like F7 in `docs/architecture/performance.md`, every claim is tagged.
*Measured* means someone ran the query and the date and instrument are given — the
production numbers below were pulled 2026-08-25 against the `sogverse` Vercel project
(`vercel metrics`/`vercel usage`, production environment), independently re-run to
confirm an earlier same-day session's pull; the code-mechanism claims were verified by
reading the installed `next@16.2.12` source, not its documentation. *Arithmetic* means
computed from measured inputs with the assumptions stated. *Inferred* means an
explanation that fits the evidence but was not directly observed — each inferred claim
comes with the probe that would settle it.

## The system, named

No single line of code chose a 15:1 ratio. It is the product of five choices, each
defensible on its own, that compound:

1. **Every route is dynamically rendered.** The root layout reads the session
   (`getUserWithProfile()`) and cookies on every request, and the proxy stamps a
   per-request CSP nonce. Any one of these makes the whole tree dynamic; the app has all
   of them. Consequence: nothing is served from the CDN — every page view is a function
   invocation behind a proxy run. This is F2's territory, F2 is open, and the choices
   have real reasons (auth-aware chrome everywhere, nonce-based CSP, cookie-resolved
   locale).

2. **The proxy runs on effectively every request** — token refresh, role routing, PIN
   gate, CSP. Also chosen deliberately (it is the single token-refresh point and the
   security boundary), also open-ended in what it multiplies: whatever the request count
   is, the proxy count matches it.

3. **`<Link>` prefetch is on by default, site-wide.** 48 files import `next/link`; until
   2026-08-25 not one passed `prefetch={false}`. Every link that enters the viewport
   fires a background request — on every page, for every visitor, whether or not anyone
   will ever click it.

4. **The app has no `loading.tsx` anywhere and no PPR/`cacheComponents`.** Measured: zero
   `loading.tsx` files under `src/app` today, and none has *ever* existed in the
   repository's history (`git log --all --diff-filter=A` over `src/app/**/loading.tsx`
   returns nothing). `next.config.ts` enables neither PPR nor `cacheComponents`.

5. **On exactly that shape, Next.js short-circuits every prefetch to an empty answer.**
   Verified in the installed `next@16.2.12` source
   (`dist/server/app-render/walk-tree-with-flight-router-state.js`): when PPR is
   disabled and the target tree contains no `loading` component, a prefetch request
   returns **only the router state** — Next's own comment says these responses "do not
   contain any render data (neither segment data nor the head)". No page component
   renders, no layout runs, nothing arrives that a later click could paint from. The
   click pays the full dynamic request either way.

Choices 1+2 make every request expensive relative to a CDN hit; choices 3+4+5 multiply
the request count by ~15 while guaranteeing the multiplier buys nothing. That
conjunction — **an amplifier wired to a blank** — is the finding. It has been true for
the app's entire life: because no `loading.tsx` ever existed, prefetch responses have
been empty since day one, including on 2026-05-28 when F1 traced 24–53 prefetches per
dashboard load, and on 2026-05-31 when the prefetch fan-out helped saturate GoTrue's
connection pool. The dozens of GoTrue round trips per page load that the incident's
mechanism section calls "the multiplier" were purchasing nothing then, too.

## Measured: the amplification

All production, UTC, pulled 2026-08-25. The month window is Aug 1 00:00 – Aug 25 00:00.

| What | Value |
|---|---|
| Function invocations, Aug 1–25 | 480,235 |
| Proxy (middleware) invocations, Aug 1–25 | 490,797 |
| Web Analytics pageviews, Aug 1–25 | 32,580 |
| **Invocations per pageview** | **14.7 : 1** |
| Aug 24 (Helsinki opening day) alone | 254,986 invocations / 16,744 pageviews = 15.2 : 1 |
| Share of the period's invocations on Aug 24 | 53% |
| Share of Aug 24 in the two hours 08:00–10:00 | 140,837 = 55.2% |
| Peak minute (09:00) | 9,066 invocations, 9,236 proxy runs |

Context for the ratio's denominator: pageviews undercount real page loads (ad blockers
drop the analytics beacon) and the numerator includes API routes and crawlers, so 14.7:1
is not "14.7 prefetches per view" — decomposing it exactly is the first probe below. But
two clean isolates show the prefetch share is dominant:

- **The footer legal links.** Four links (`/privacy`, `/terms-and-conditions`,
  `/anti-bullying-and-discipline`, `/attributions`) sit in the footer of every page, so
  the default viewport prefetch fired all four on roughly every visit. Aug 1–25:
  **60,069 invocations across the four — 12.5% of all production invocations —
  against ~50 real visits** (`/privacy`: 15,267 invocations, 10 pageviews). During the
  opening's highest-stakes half hour (08:45–09:15 on Aug 24), `/privacy` alone absorbed
  3,583 invocations; the four together were ~35,700 that day, ~14% of opening-day
  invocations, prefetching legal pages for families racing to claim club seats.
  This is the cut already shipped.
- **The club-detail route on opening day.** `/schools/[municipalityName]/[id]` drew
  **77,021 invocations against 3,616 pageviews (21:1)** on Aug 24 — the municipality
  listing renders one card-link per club, Helsinki lists ~43 clubs, and every family
  scrolling the list fired a prefetch per card entering the viewport. The same shape
  shows on signed-in chrome: `/parent/unlock` 12,320 invocations / 1,419 views,
  `/select-profile` 12,083 / 834, `/settings` 9,338 / few.

**Inferred (probe below): prefetch is most of the amplification** — plausibly 60–85% of
all invocations. The bounded evidence is the two isolates above plus F1's measured 24–53
prefetches per dashboard navigation. Nothing measured contradicts it; nothing measured
yet pins it.

Traffic scale, for planning: August is the annual peak (owner-confirmed), 32,580
pageviews against July's 2,843 — a ~12× step, real growth plus the opening, not a leak.

## The load-bearing claim, challenged

The claim everything else rests on: *a prefetch here delivers nothing, so disabling it
costs nothing.* Attempts to break it:

- **"It seeds the client router cache."** No — the response contains no segment data and
  no head (the source comment quoted above). The client learns the route tree shape
  only; on click it issues the full dynamic RSC request exactly as it would with no
  prefetch. F1's own benchmark is consistent: prefetches completing at median 93ms while
  every real navigation still paid its full render.
- **"It warms the lambda."** The strongest salvage of `docs/architecture/performance.md`'s "prefetches
  warm caches before clicks" — and it fails on timing plus deployment shape. This is a
  single-bundle deployment: the first request to *any* route warms the function every
  route shares (established in the F6 method notes). The document request that painted
  the page already warmed it, so a click moments later finds it warm with or without
  prefetches. In the one scenario where warmth has lapsed (user idles on a page past the
  recycle window, then clicks), the viewport prefetch fired at page load and is exactly
  as stale as the page. Only hover-time prefetch could warm just-in-time, and
  `prefetch={false}` disables hover as well (the installed typings are explicit;
  `unstable_dynamicOnHover` exists but is unstable) — so the app never had a
  just-in-time warming path to lose. *Reasoned, not measured*; the click-latency A/B
  below is the falsifier.
- **"It warms the database."** No component renders, so no page query runs. The only
  server work is the proxy: a local JWT verify, and a `profiles.role` lookup for
  non-PIN-verified sessions (next section). A prefetch warms at most one already-hot
  Postgres row.
- **Production corroborates the emptiness:** Aug 24's average function duration was
  **12ms** (week average 46ms) — a day where three quarters of invocations were
  prefetch-shaped is a day where the average invocation computes almost nothing.

Verdict: the claim holds. On today's architecture the default prefetch layer is pure
cost. **This voids the stated justification for F1's revert of `prefetch={false}`**
("now a net positive — prefetches warm caches before clicks"), while leaving F1's actual
work — local `getClaims()` verification — fully intact and correct. F1 changed what each
prefetch *costs*; it never changed what a prefetch *delivers*, which was and is nothing.
The revert made each page load fire dozens of cheap empty requests instead of zero.

## Where the amplifier lands — and where it does not

The 2026-05-31 incident makes "15:1 fan-out on the auth path" sound like live incident
risk. Post-F1, the coupling is much narrower than it reads, and being precise about it
changes the remedy ranking:

- **A prefetch no longer touches GoTrue at all.** Auth is a local ES256 verify; GoTrue
  sees only logins, signups, and token refreshes (refresh happens once per expiry
  window, not per request). The incident's specific channel is closed.
- **A prefetch touches Postgres only via the proxy's role lookup, and often not even
  then.** The proxy resolves `profiles.role` per request for a sessioned caller — unless
  the caller holds a valid parent-PIN cookie, which proves `customer` by a local HMAC
  check with no query (verified in `src/proxy.ts`). The opening-day cohort is
  overwhelmingly PIN-unlocked parents, i.e. the cohort that skips the query. Who pays
  it: gamers, gedus, admins, and locked/fresh customer sessions.
- **Upper bound on the residual (arithmetic).** Peak minute: 9,236 proxy runs ≈ 154/s.
  If *every* run paid the ~12ms role lookup (F3's warm figure — mostly PostgREST/network
  latency, not Postgres CPU), that is ~1.9 connection-seconds per second: about two of
  Postgres's 60 connections occupied, and well under a tenth of a core of actual query
  CPU, plus PostgREST worker overhead on the shared VM. The PIN carve-out means the real
  figure is lower. Next to what F7/F8 measured at the same instant — bcrypt driving
  load1 to 10.90 on 2 cores — this is second-order. **Not measured as a share of box
  CPU; the pg_stat_statements probe below would settle it.**

So the honest statement is: **the amplifier no longer lands meaningfully on the
documented incident path.** Its real costs today are (i) Vercel-side — invocations,
Fluid CPU, and an observability event billed per junk request; (ii) risk surface — the
opening's peak minute was ~9,000 invocations of which the great majority served no one,
and every future rate limit, firewall rule, or concurrency ceiling meets that inflated
number first; and (iii) **analytical pollution** — 60k requests to unread legal pages
sat in every traffic query this investigation ran, and will sit in every future one.

**The F8 tension, assessed: real but second-order.** F8's planning rule says
pre-register families; a pre-registered cohort arrives signed in and fires the signed-in
prefetch fan-out in the opening minute, so the rule does trade GoTrue load for request
volume. But the two sides land on different machines: the registrations land on the
2-core Supabase VM (the thing that saturates), while the pre-registered cohort's
prefetches land on Vercel and — being PIN-verified customers — mostly skip the one query
that touches the shared box. The levers pull in opposite directions on the *request
count*, not materially on the *incident path*. F8's rule survives unamended; it deserves
one sentence noting the fan-out is Vercel-side (proposed edit below). If remedy (a)
ships, the tension disappears entirely.

## Remedies

**Recommendation: (a) — make `prefetch={false}` the app-wide default, through one shared
link component, now.** Then re-measure, and let (c) — PPR/static shells — remain the
architectural end-state that F2 and the locale-prefix plan are already walking toward,
at which point the wrapper's default flips back for the routes that gain real shells.
The two compose; (a) costs one line to undo when (c) lands.

The case, quantified where possible:

- **Benefit.** If prefetch is 60–85% of invocations (inferred above), (a) cuts the ratio
  from ~15:1 to roughly 3–6:1 — hundreds of thousands of requests a month, and the
  opening-day peak minute from ~9,000 invocations toward ~1,500–3,500. Measured floor
  even if the inference is badly wrong: the two isolates alone (legal links + one
  listing route on one day) account for >130k requests in the period.
- **Cost.** Nothing user-visible, *if the load-bearing claim holds* — clicks already pay
  the full dynamic request, so navigation latency is predicted unchanged. That
  prediction is falsifiable and should be checked (probe 3 below) rather than trusted.
- **Reversibility.** One shared component, one default. The locale-prefix plan
  (`docs/plans/locale-prefix-routing.md`) already swaps every `next/link` import for a
  wrapped `Link` exported from one navigation module — this remedy either rides that
  wrapper when it lands or creates the thin wrapper first and lets the locale work
  absorb it. Either order, the end state is one file that owns the default and 48 call
  sites that don't repeat it.
- **Why now rather than with the next architecture step:** the default is simply wrong
  for this architecture, and it actively misleads — it polluted this investigation's
  data, it inflates every capacity number F8-style planning reads, and the standing
  `docs/architecture/performance.md` claim built on it steers future sessions toward keeping it.

**Ranked alternatives, and why each is not the recommendation** (per the house
convention: rejected for reasons a future session can dispute, so it doesn't rebuild
them):

1. **(c) PPR / `cacheComponents` — right destination, wrong first step.** It is the only
   remedy that makes prefetch *deliver* something: static shells, CDN-cacheable, even
   under a dynamic layout — the amplifier becomes cheap and useful instead of merely
   absent. But its prerequisite chain is exactly F2's untangling (auth out of the root
   layout, the per-request CSP nonce rethought for static shells, locale out of the
   cookie — the locale-prefix plan explicitly scopes static rendering *out* and names
   the nonce as the remaining blocker). Sequencing it first means months of the current
   waste while the big project runs. Sequencing (a) first costs the big project nothing:
   when shells become real, flip the wrapper default for those routes. **Rejected as the
   first step, endorsed as the end-state.**
2. **(d) Cheapen each request (advisory JWT role, I2 step 2) — deferred, bar not met.**
   It removes the proxy's role lookup, whose measured upper bound at the worst minute of
   the year was ~2 connections' occupancy and negligible CPU, further reduced by the PIN
   carve-out. `docs/architecture/performance.md` already gates this on a trace showing the residual
   lookups matter; these numbers are that trace's first half and they argue the bar is
   *not* met — and after (a), the request count that multiplies the lookup drops several
   fold, moving the bar further away. Pick it up per the existing guidance: when already
   in the auth/RLS files, not as dedicated work.
3. **(b) Add `loading.tsx` boundaries — rejected outright, and the reasoning is the
   architecture's own.** It is the inverted remedy: it makes every prefetch *more*
   expensive in order to make it useful. With a loading boundary, a prefetch stops
   short-circuiting and renders the tree above the boundary — the root and dashboard
   layouts run, so `getUserWithProfile()`'s profiles query fires **per prefetch**,
   re-creating the per-request fan-out that F1 existed to kill, relocated from GoTrue to
   Postgres on the same shared box, multiplied by whatever the prefetch count is at that
   moment. It also collides with two standing house rules: the loading affordance is
   chosen per call by the author (three categories, none of which is "a route-level
   skeleton on the router's schedule"), and a route boundary swaps the whole page body
   at data-arrival time rather than on user action. The collision is not incidental —
   those rules encode why this app's loading states live below the route level, which is
   precisely the layout shape on which Next's prefetch has nothing to send. **The house
   style and default prefetch are architecturally incompatible; (b) resolves the
   incompatibility by surrendering the house style and paying more for the privilege.**

**What would change the recommendation:**

- If probe 1 shows prefetch is **under ~30% of invocations**, (a) buys little and the
  amplification is misattributed — the next suspect list is crawlers, API polling, and
  RSC navigation requests, and this doc's framing needs revision.
- If probe 3 shows clicks **got slower** with prefetch off, the load-bearing claim is
  wrong somewhere despite the source reading, and (a) reverts (one line) while the
  mechanism is re-investigated.
- If (c) lands sooner than expected — `cacheComponents` adopted, shells real — the
  wrapper default flips for static routes as part of that work, and this doc's remedy
  section is superseded by it.
- If Vercel pricing or limits change such that middleware runs (which (a) also removes
  ~10× of) or invocations are billed materially differently, the cost half of the case
  moves accordingly — but the coherence half stands regardless.

## Probes that settle the open questions

In the spirit of the cold-probe method and the sibling-route control: specific
measurements, cheap, each answering exactly one question.

1. **Prefetch share of invocations.** Prefetch requests carry the `Next-Router-Prefetch`
   header. Log one structured line in the proxy when it is present (temporary, a day or
   two), then compare counts against total proxy runs in the same window. Settles the
   60–85% inference exactly, and decomposes the 15:1 into prefetch / navigation / API /
   crawler. Run it *before* shipping (a) app-wide, so the before/after is clean.
2. **Role-lookup incidence and cost.** Same temporary proxy line records whether the
   request skipped the lookup (PIN short-circuit) or paid it; on the database side,
   `pg_stat_statements` gives the role query's call count and total exec time as a share
   of everything (the remote-inspection runbook covers access). Settles whether (d)'s
   bar is met with a number instead of an upper bound.
3. **Click-latency control for (a).** Repeat the F1 benchmark protocol (real-browser
   trace on `/admin/users`, warm, signed-in — the canonical regression benchmark) on a
   preview deployment with the wrapper default off. Prediction, stated in advance:
   click-to-render unchanged within noise, prefetch request count near zero. If
   navigation is measurably slower, the recommendation's premise fails.
4. **Post-(a) re-measure.** The same three headline queries as this doc (invocations,
   proxy runs, pageviews, month window) one month after shipping. The ratio is the
   regression gauge; append the result here.

## Cost, for completeness — it was the trigger, not the subject

August credit-consuming usage was $13.11 of the $20 monthly Pro credit (July: $1.38);
the alert fired at $15 total. The biggest lines: Speed Insights data points $4.55,
Observability Events $3.45, Fluid Active CPU $2.05 — plus Speed Insights' $10/month cash
base fee. Note what that decomposition says: the largest lines scale with *pageviews and
observability*, not invocations, so even perfect amplification removal roughly halves
the credit burn rather than zeroing it. The bill is mostly the 12× traffic year; the
amplification is the part of it that buys nothing. No limit was exceeded and none is
near.

## Proposed edits to `docs/architecture/performance.md` (not made here)

- **The prefetch paragraph above "Real-user data"** (currently: reverted
  `prefetch={false}`, "now a net positive — prefetches warm caches before clicks"):
  annotate or rewrite. The verified mechanism is that without a `loading` boundary or
  PPR a prefetch returns router state only — no render data — so there is no cache it
  can warm that survives to the click; the accurate statement is "each prefetch is now
  *cheap* (local verify), not that it is *useful*." Point here for the full reading.
- **The F1 completed entry**: a one-line annotation on the revert sentence — the revert
  removed a correct workaround on an incorrect justification; the `getClaims` work
  stands untouched.
- **F8's planning rule**: one sentence noting that a more pre-registered cohort shifts
  load from GoTrue registrations to signed-in request volume, that the volume lands
  Vercel-side (PIN-verified sessions skip the proxy's role query), and pointing here.
- **The 2026-05-31 incident's mechanism section**: optionally, one line noting the
  prefetches in the fan-out were empty-response requests for the app's entire history —
  the multiplier was buying nothing even before F1 made it cheap.

## Relationship to the rest of the record

This doc is connective tissue, not a rehash: F1 priced a prefetch, F2 explains why every
route is dynamic, F3 prices the role lookup, F7 established that the shared box's CPU
and GoTrue's pool are coupled, F8 measured what an opening does to all of it — and each
was written without the request *count* being anyone's subject. The count is this doc's
subject. When a remedy ships, its measurements belong in `docs/architecture/performance.md`'s log
like any other improvement, with this doc updated to point at them; if (c) eventually
retires the fully-dynamic architecture, this doc retires with it.
