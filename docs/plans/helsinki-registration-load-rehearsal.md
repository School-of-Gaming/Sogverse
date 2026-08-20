# Helsinki registration load rehearsal (staging)

**Deadline: complete before Monday 2026-08-24 09:00 UTC** — ideally by Saturday, so a bad
result leaves time to react.

## Problem

~43 Helsinki municipality clubs open registration simultaneously at 2026-08-24 09:00 UTC
(12:00 Helsinki), 15 seats each (~645 seats). Expected: several hundred families converge
in a 5–10 minute window — new parent signups, gamer creation, seat claims, waitlist
overflow, shop page loads. This is the platform's largest-ever traffic moment, in front of
a municipality partner.

Prod compute was upgraded 2026-08-20 (free-plan Nano → Pro, Small / 2 GB) specifically for
this. Static analysis says the flow holds: the seat-claim RPC (`create_participation`)
serializes per club on a product-row `FOR UPDATE` lock (no overbooking possible), all
event-path queries were measured at 0.1–1.2 ms post-upgrade, and the box has ~1.3 GB free
RAM with zero swap. What's missing is one empirical confirmation of the *full HTTP flow at
event-like rates*. That's this plan.

## Scale

~650–800 families, ~2 requests-heavy flows each (parent signup + gamer + claim), peak
arrival concentrated in the first ~2 minutes. Modeled peak: ~5 signups/sec, 150–300 total
req/s against Supabase (GoTrue + PostgREST).

## The decision

Rehearse on **staging**, temporarily resized to **Small** — the same compute tier as prod —
then resize back to Micro. Staging is test data by design; prod stays clean. Compute is
hourly-billed, so an hour of Small on staging costs ~2 cents.

- Resize via Management API (token `SUPABASE_ACCESS_TOKEN` in `.env.local`; staging ref =
  `SUPABASE_PROJECT_REF`, the plain staging keys):
  `PATCH https://api.supabase.com/v1/projects/{ref}/billing/addons` with
  `{"addon_type":"compute_instance","addon_variant":"ci_small"}` — and **back to
  `ci_micro` when done** (the step most easily forgotten; it's real money if left). Each
  resize restarts the instance (~1–2 min); poll `GET /v1/projects/{ref}` until
  `ACTIVE_HEALTHY`.

## Steps

1. **Fixtures on staging** — ~4 `municipality_club` products: `billing_mode
   'external_contract'`, `seat_count 15`, `waitlist_enabled true`, `registration_opens_at`
   in the past, status/visibility such that they accept signups (the RPC requires effective
   status pending/running). Create via admin RPCs or direct SQL as the `postgres` role over
   psql (staging connection: pooler host/port and password from the plain `SUPABASE_*`
   keys in `.env.local`). Implementer's choice of mechanism.
2. **Target app deployment** — the script must exercise the real API routes, which are
   role-gated via `@supabase/ssr` cookies. Preferred target: a Vercel preview deployment of
   `dev`, *after verifying* its `NEXT_PUBLIC_SUPABASE_URL` points at staging. Fallback if
   previews don't point at staging: a local production build (`npm run build && npm start`)
   with staging env — that drops the Vercel layer, which is acceptable: Vercel autoscales
   and the system under test is Supabase.
3. **Burst script** — ~150 simulated families, ramping to ~5 signups/sec peak, each doing:
   parent signup (`POST /api/auth/register`) → establish a session (sign in against staging
   GoTrue with `@supabase/supabase-js`, encode the session into the `sb-*` cookie format
   the SSR client reads) → create gamer → `POST /api/checkout/products/create` with the
   `external` purchase shape → on `{"status":"full"}`, join the waitlist via
   `POST /api/participations/waitlist`. Deliberately pile ≥40 families onto one product so
   the seat lock and waitlist path see real contention. Add a background of anon product
   GETs (~30 req/s) to simulate shop browsing. Tool choice free (plain Node, k6, whatever).
4. **Measure** — per step: p50/p95/p99 latency and error counts. Before/after: staging node
   gauges from `GET /v1/projects/{ref}/analytics/endpoints/metrics` (`MemAvailable`,
   `pswpin/pswpout`, `load1`); statement-timeout errors in postgrest logs.
5. **Verify correctness under contention** — the contended product ends with **exactly 15
   `active` participations**, the remainder `waitlisted` with strictly ordered
   `waitlisted_at`, no duplicates.
6. **Teardown** — staging back to `ci_micro`. Burst accounts/rows may stay (it's staging)
   but deleting them is tidier; implementer's call.

## Acceptance criteria

- Zero unexpected 5xx/timeouts (the deliberate `full` responses don't count).
- Signup→claim flow p95 under ~2 s at peak rate.
- No swap activity on staging during the burst (`pswpin`/`pswpout` unchanged).
- Seat-count and waitlist-order invariants hold on the contended product.
- Staging is back on Micro.

**If criteria fail**: do not improvise fixes on prod. Take the numbers to the owner — the
pre-discussed escalation is bumping prod to Large for the event week (~$13, dedicated
cores), but that spend is the owner's call.

## Rejected alternatives

- **Rehearse on prod with disposable data** — rejected by the owner: junk in prod, and
  cleanup of auth users + participations is riskier than the information gained.
- **Skip the rehearsal** — post-upgrade measurements make failure unlikely, but the
  municipality stakes justify ~an hour of work and cents of compute; the owner chose to do
  it.
- **Rehearse at Micro and extrapolate** — pointless when matching prod's tier costs cents.

## Constraints discovered while deciding

- On a paid org, Nano is billed at Micro's price — hence staging already sits on Micro;
  the rehearsal resize is Small and the restore target is `ci_micro`, not Nano.
- `create_participation` re-checks `registration_opens_at > now()` and effective status
  inside the RPC, so fixtures must genuinely be open for signup — a future open time can't
  be faked around from the client.
- Registration confirmations send via Brevo inside `after()` — the burst will consume
  ~150+ real Brevo sends from the shared 5,000/month quota. Acceptable; don't scale the
  rehearsal an order of magnitude without checking that budget.
- Statement timeouts on staging are the same 3 s (anon/authenticated) as prod, so a
  starved box shows up as hard 500s, not slow responses — that's the signal that failed
  the old Nano, and its absence is part of the pass.
