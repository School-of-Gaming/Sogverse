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
proposed only. **Probe 1 was settled on 2026-09-08 without any code**: prefetch is
84–86% of function invocations, measured — see "Probe 1, settled" below. The inference
the remedy rests on is now a measurement, and it lands at the top of the inferred range. **On 2026-09-09 the owner's goals and the road to "instant" were walked through** —
see "The owner's frame" below; the decision is still open.

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

**Inferred when written, measured since (see "Probe 1, settled"): prefetch is most of
the amplification** — plausibly 60–85% of all invocations, the 2026-08-25 estimate; the
2026-09-08 measurement reads 84–86%. The bounded evidence is the two isolates above plus F1's measured 24–53
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
sat in every server-side traffic query this investigation ran, and will sit in every
future one. (Web Analytics pageviews and Speed Insights are browser beacons and are
unaffected — see "What prefetch pollutes" below.)

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

## Probe 1, settled (2026-09-08)

*Measured*, production, `vercel metrics` on CLI 59.4.0, triggered by a pair of Vercel
anomaly alerts ("Function invocations spike, 7.17× increase" and "Edge requests traffic
spike") that arrived on the Tuesday after the first full weekend of term. The alerts were
the same symptom as the August billing alert: the Monday school-day ramp measured against a
weekend trough, on a request stream that is mostly prefetch. Nothing was failing — no
error statuses, no bot share, one WAF deny in 36 hours, and one busy admin browser as the
largest single client.

The instrument the probe list did not know about: `vercel.request.count` carries an
`is_prefetch_request` dimension, and its `path_type eq 'streaming_func'` slice equals
`vercel.function_invocation.count` request for request (Monday Sep 7: 28,972 + 4,566 =
33,538 on both metrics). So the prefetch share of function invocations is a zero-code read,
and the proxy log line the probe proposed is not needed. The runbook
`docs/runbooks/vercel-analytics.md` records the read.

| Window (Helsinki days) | Prefetch invocations | Real invocations | Prefetch share | Pageviews | Invocations : pageview |
|---|---|---|---|---|---|
| Mon Sep 7 | 28,972 | 4,566 | **86.4%** | 2,570 | 13.1 : 1 |
| 7 days to Sep 8 | 184,248 | 34,069 | **84.4%** | 15,849 | 13.8 : 1 |
| Tue Aug 25 (control, pre-term) | 39,059 | 4,303 | 90.1% | — | — |
| Mon Aug 31 (control) | 37,417 | 4,718 | 88.8% | — | — |

Across all edge requests (static assets and external rewrites included) the prefetch share
is 57%; the rest of the request stream is the assets those pages load. The share has been
flat since the doc was written — the two August controls sit at 89–90% — so nothing has
regressed and nothing has improved; the footer-links cut is inside the noise of a term-time
week.

What the measurement changes:

- **The inference is confirmed at the top of its range**, which strengthens remedy (a) and
  removes the "under ~30%" escape hatch: with prefetch gone, Monday would have been ~4,600
  invocations against 2,570 pageviews, a **1.8 : 1** ratio, down from 13.1 : 1. The
  weekday-over-weekend multiple that trips Vercel's anomaly detector shrinks with it —
  the alerts are a prefetch-volume phenomenon as much as a traffic one.
- **The distribution by route is the listing-and-nav shape the doc predicted.** Top prefetch
  routes in the 36 hours to Sep 8: the club-detail route under `/schools/` (5,746,
  every card on a municipality listing), the admin municipality-club detail route (5,295,
  every row of the admin list), `/shop` and `/about` (3,700 each, header nav on every
  page), then the admin sidebar: every one of its sections — tools, UI components, UI
  previews, testing, WhatsApp — drew an identical ~350 prefetches from a single admin in
  36 hours, one per admin page render, for pages nobody opens.
- **One admin browser was 27% of all invocations in that window** (13,435 of 49,783;
  12,681 of them prefetch). Term-start admin work on the sidebar-and-list shape multiplies
  like this by construction; a second admin IP shows the same pattern at a fifth the
  volume. It is a cost observation, not a misuse one.
- **Probe 4's regression gauge has its baseline**: 13–14 invocations per pageview in term
  time, prefetch share 84–86%. Re-run the same three reads after (a) ships.

The remaining open probes are 2 (role-lookup cost) and 3 (click-latency control for (a));
neither blocks the recommendation, and probe 3 remains the one that could overturn it.

## The owner's frame, and what "instant" actually takes (2026-09-09)

Walked through with the owner on 2026-09-09, with the question turned around: not "what
does prefetch cost" but "what would make the site feel the way I want, and where does
prefetch sit in that". **Nothing below is decided or planned.** The remedy decision is
still open; this section records the reasoning a later session would otherwise redo.

**The goals the remedy is judged against.** Two, in the owner's words. (1) A click reacts
near-instantly. (2) No loading state where one can be avoided; where one cannot, only the
part that needs it loads, what is already known paints early, and the layout never
rearranges after a load. The second is already the house loading rule (three categories,
a container that keeps its final size). The two are in tension inside Next's model, and
the app has so far bought the second by paying the first: with no loading boundary, a
click leaves the old page on screen for the whole server round trip and then swaps the
new page in whole — zero loading state, zero shift, and nothing visible until the render
lands. The app also gives no click acknowledgement at all today (no pending state on any
link), so the wait reads as the click not registering.

**Next's three prefetch modes** (*measured*: the installed typings and router source).

| Value | Static target | Dynamic target |
|---|---|---|
| default (`null` / `"auto"`) | full page data | up to the nearest `loading` boundary; with none, the route tree only — this app |
| `prefetch={false}` | nothing, not even on hover | nothing, not even on hover |
| `prefetch={true}` | full page data | full page data, every query, held under the **static** cache lifetime (300s) |

The default is "everything safe to prepare early", with the safe line drawn by the author
through a loading boundary; the app draws no line, so the safe part is empty. The dynamic
cache lifetime is 0 (the installed config default) — Next 14 held prefetched dynamic pages
for 30s and rolled it back after stale-dashboard reports. `prefetch={true}` is the
behaviour a frontend developer imagines prefetch to be, and is available per link. It is
not the remedy: it fires for every visible link rather than likely ones, it renders whole
personalised pages for pages nobody opens, and it serves the result for five minutes with
no revalidation while it sits there.

**Why Next refuses dynamic prefetch by default** — three reasons, all live here. There is
no correct answer to prefetch: the page is rendered when the link scrolls into view and
clicked minutes later, and seats, the chat, the PIN gate and the session itself can all
have changed between; Next cannot tell which reads tolerate staleness, so it does not
guess. The cost lands on nobody: at the measured 85% prefetch share, full renders would
make most of the app's server work serve pages never opened. And a dynamic render runs in a
request context — session refresh, rate limits, logs — for a visit that never happened;
the 2026-05-31 outage was this shape with the dial part-way up. Static prefetch is free
precisely because none of the three apply.

**Remedy (a) is a decision, not a patch.** A patch hides a symptom and leaves the
mechanism wrong; here the mechanism is Next's own code returning an empty response, and
turning the default off makes the configuration say what is already true. There are two
coherent pairings for a fully dynamic Next app: keep default prefetch *and* add route-level
loading boundaries so it delivers layouts and a skeleton (many dashboards do; they accept a
skeleton on the router's schedule and a layout render per visible link); or keep the
loading affordance below the route *and* turn the default off, opting links back in where
prefetch can deliver (apps that care about layout stability, or that show dozens of links
per viewport). The app is in the incoherent third state — dynamic, no boundaries, prefetch
on. The framework's own trajectory points the same way: early 13 prefetched full dynamic
routes and rolled it back; 14 limited it to the boundary; 15 zeroed the dynamic lifetime;
16's cache components move the value into static shells. A shared link wrapper is one
primitive, one default, greppable call sites, opt-in per link — the correctness-by-mechanism
shape the root rules ask for. What *would* make it a patch is stopping there.

**F1 stands; only the revert was wrong.** Disabling prefetch would not have been the
quick fix for the auth incidents. Before F1 every protected request paid three network
round trips to GoTrue — a parent clicking a card, not just a prefetch — and opening-day
traffic alone, prefetch off, would have put several hundred GoTrue calls a second through
the auth rate limit. The 2026-05-31 channel was the partially migrated data path still
calling GoTrue under a registration surge, closed by finishing the migration. Local JWT
verification is the recommended pattern on asymmetric-key projects, removed a network
dependency from every layer, and its one trade (a GoTrue-level ban not enforced until token
expiry) is bounded and unused. The revert of the `prefetch={false}` workarounds rode along
on a belief — "prefetches warm caches before clicks" — that was never true; F1 made each
prefetch cheap and never made one useful.

**What prefetch pollutes, and what it does not.** Web Analytics pageviews are a browser
beacon fired on load and on client-side navigation; a prefetch never navigates, so the
pageview counts in this doc are clean, and so is Speed Insights. What it pollutes is the
server side: function invocations, edge requests, per-route counts, observability events,
logs, and therefore the anomaly detector. On contention: an empty prefetch is ~12ms of
function time plus a local-verify proxy run; Fluid compute absorbed the peak minute with no
error statuses and no visible queueing, and the constant trickle keeps instances warm if
anything. Doing nothing costs little; the case for acting is coherence, alert noise and
clean numbers, not speed.

**What makes a click instant — two halves, plus feedback.** *Feedback*: a pending state on
the link itself, within a frame, independent of everything else; most of "reacts
instantly" to a user while the render is in flight. *The data half*: warm the client cache
from the page the user is on, targeted at what this user will plausibly open (a family's
own one-to-three children, not every visible link), one small query each. The browser data
path already bypasses Vercel — the React Query hooks talk to PostgREST with the user's
token — so only the page shell forces a click through a function and the proxy. *The shell
half*: make the layouts static so Next's prefetch has something to deliver, which is F2's
untangling. After first load this design is a single-page app; on first load it beats one,
because the HTML is content. A pure SPA (Vite, a client router, React Query, Supabase
direct, a separate API host) was weighed and set aside: it is the champion of goal 1 and
the worst option for goal 2 cold — blank until the bundle runs, then a data waterfall,
public pages needing a separate prerender step — and the opening-day cohort lands cold on
a listing from a link. The F2 destination is an SPA with a prerendered first paint.

**Stale-while-revalidate meets the layout rule, and loses on variable-height content.**
Paint-from-cache-then-correct is the standard freshness mechanism and the app already runs
it (one-minute stale time, server-seeded caches). A value changing in place — a seat count,
a mark — survives the layout rule. A session report is any number of lines, so a card
gaining one moves everything below it; on that feed, paint-then-correct is a shift by
construction. The alternative is verify-then-paint — an ETag, applied at the data layer:
a **stored** version per participation, bumped by a database trigger when any contributing
row changes (a hash computed on demand costs the same query as the fetch, so the version
must be stored, not computed); one small RPC returning the versions of everything a page
reads; checked at pointer-down (which precedes the click on touch too, by less than hover
does); paint from cache on a match, block on a fresh read on a miss. Cost: one small round
trip per navigation, ~10ms from Finland; the first paint is always correct and never
changes. Not covered: a change while the reader is already on the page — that is a push
(a Realtime subscription, RLS-scoped) invalidating the key, and under the layout rule the
arrival becomes an affordance the reader acts on rather than an insertion.

**Times: never paint a guess.** The server's location is irrelevant — it renders in the
zone it is handed. The risk is a *guessed* zone, and the app takes it today: a first visit
with no timezone cookie renders in Helsinki and corrects post-mount, the exact wrong-then-
right flash the owner wants designed out. Three no-flash shapes: keep times out of the
static shell entirely (on the dashboard, times are data and data renders once from the
client cache in the browser's own zone); render only the time server-side as a streamed
hole; or render the product's zone — products carry their own timezone and schedule slots
are a weekday plus a local start time, so "Mondays at 16:00" for a Helsinki club is static
per product and identical for every reader. Converting to the reader's zone earns its cost
only for remote products and readers abroad; whether to do it is the owner's call.

**Hydration needs agreement, not a per-request read.** The root layout's per-request reads
exist to keep SSR HTML and the first client render in lockstep, and that requirement is
real. It is met two other ways: put the value in the URL (locale — the locale-prefix plan),
or defer it to after mount in a container that already has its size. Of the root layout's
reads, only the locale is needed by the About page's HTML, and only the CSP nonce has no
static-safe alternative short of a different policy:

| Read | Static-safe alternative |
|---|---|
| locale and messages | the URL segment |
| timezone cookie, initial clock | read where a time renders, or a streamed hole |
| consent cookie | mount optional scripts after hydration — they load after it anyway |
| session and profile | the header's user slot from the client cache, or a hole |
| attribution header, `Accept-Language` | client-side, after mount |
| CSP nonce | a hash-based policy for the public route group — the real blocker |

**Topology, measured 2026-09-09.** Production answers with `x-vercel-id: arn1::arn1` —
edge and function both in Stockholm — and the Supabase project is in `eu-north-1`,
Stockholm. A plain fetch of `/about` from Helsinki took **338ms**: a page of pure copy,
no data reads, over a ~10ms network hop. Proximity is hiding a ~300ms render tax, not
removing it (p75 TTFB 232ms desktop says the same). Distance adds one user-to-Stockholm
round trip per dynamic navigation — ~30–40ms from the UK or France, ~100ms from US East,
~160ms from US West — so expansion makes a mediocre number somewhat worse and changes
nothing about the plan. What distance really punishes is sequential browser-side reads
(a page firing five client queries from Seattle pays ~160ms each; parallel is fine, a
waterfall is not). For expansion, in order: shells from the edge (~20ms anywhere), data
warmed during reading time (hides any round trip, and is the mobile answer), no waterfalls,
and Supabase read replicas near the users once a cohort justifies them. One rule: the
functions stay beside the database and the CDN goes beside the user — a function region
moved toward users while the database stays in Stockholm turns every render's several
sequential Supabase hops transatlantic.

**The four pages the owner names — Home, About, Shop, My SOG.** Two audiences. Home,
About and Shop are the prospect's pages (the proxy bounces a signed-in visitor off Home);
My SOG is the customer's and personal to the byte.

| Page | Reads today | Target shape |
|---|---|---|
| Home | nothing | fully static on the CDN |
| About | nothing | fully static; the header's user slot from the client cache, blank at final size until known |
| Shop | products, prices, translations; live seat counts | static catalogue regenerated on demand from the admin product write; counts into a fixed-width slot per card |
| My SOG | participations, waitlist, family, billing | stays server-rendered and server-seeded; a click from elsewhere paints from cache; the cold path gets faster by shedding the root layout's reads |

The public three share one prerequisite in three pieces: **the locale-prefix plan**
(`docs/plans/locale-prefix-routing.md`), which removes the cookie blocker and — by its own
scope statement — leaves pages dynamic and the CSP untouched; **the root-layout
untangling** (F2's list, not in the plan); and **a public-route CSP without a per-request
nonce**, the second blocker the plan names and leaves alone. Only after all three does a
public page become static, and only then does the wrapper default flip back to prefetch on
for those routes. The proxy still runs on static paths to make the redirect decision; on
those paths it must stay an edge cookie check and never read the profile.

**Direction, as walked through — not decided, not planned.** (1) Remedy (a), through the
shared link wrapper, with probe 3 on the preview and probe 4 a month on. (2) Click
feedback: a pending state on links and navigation buttons. (3) Warm the data layer from the
dashboard for the pages one hop away. (4) The structural work: the locale-prefix plan, the
root-layout untangling, the public CSP, then partial prerendering and the wrapper default
flipped for static routes. Two decisions along the way are the owner's: whether session
times render in the product's zone or the reader's, and how a background arrival may
change the layout.

## Probes that settle the open questions

In the spirit of the cold-probe method and the sibling-route control: specific
measurements, cheap, each answering exactly one question.

1. **Prefetch share of invocations — settled 2026-09-08, see the section above.** The
   temporary proxy log line this probe originally called for is unnecessary: Vercel's
   request metric already carries the prefetch flag as a dimension, so the share is a
   one-line `vercel metrics` read, and the same read is the before/after for (a).
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

**Re-read 2026-09-08 (`vercel usage`).** August closed at $18.95 of metered usage
(everything except the $20 Pro seat and the $10 Speed Insights base), all of it absorbed
by the plan's credit — amount due was the two base fees, $20.93. September's first seven
days ran $5.53 metered, a weekday floor of roughly $1.00 a day against $0.10 on a weekend
day, which projects to about $23 for the month: a term-time month plausibly overruns the
credit by single-digit dollars. The prefetch-attributable share of the metered lines is
roughly $1.50 a week — 85% of the invocation line, about 57% of observability events
(billed per request, prefetch or not), and a thin slice of CPU, memory and origin
transfer, since an empty prefetch response is cheap to compute and to send — so remedy
(a) is worth about $5–7 in a term-time month, roughly the size of the projected overrun.
The pageview-driven lines (Speed Insights events, Web Analytics events) are the larger
term and are untouched by it. Urgency on money alone: none; the case for (a) is
coherence and alert noise, not the bill.

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
