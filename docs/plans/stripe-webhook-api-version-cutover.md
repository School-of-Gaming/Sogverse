# Stripe webhook API-version cutover

Move the products webhook off the ancient account-default API version and onto an
endpoint pinned to the modern version the SDK is pinned to, so a Stripe Dashboard
upgrade can never silently change our webhook payload shapes again. The code half is
already done on a branch; this plan is the landing sequence, the Stripe-side cutover,
and the cleanup tail. **The order of the steps is the point — several of them are
unsafe if reordered.**

## Problem

The Stripe account's default API version is `2019-12-03` (inherited from the
pre-Sogverse School-of-Gaming account). Our products webhook endpoint
(`we_1TeEjWCD5Q5ECgrc3639dg2C`, `https://sogverse.sog.gg/api/webhooks/stripe/products`)
has **no pinned version of its own** — the API reports `api_version: null`, meaning it
tracks the account default, whatever it becomes. The Dashboard *displays*
"2019-12-03" for it, but that is the resolved value, not a stored setting.

Stripe's Workbench actively prompts anyone with Dashboard access to upgrade the
account version. Accepting that prompt instantly changes the payload shape of every
unpinned endpoint. On newer versions a field the webhook reads moves — the invoice's
subscription id goes under `parent.subscription_details` — and the old code's guards
turned "field missing" into a silent early return with a 200, so renewals would simply
stop being recorded, with no error anywhere and Stripe never retrying.

Separately, the same route wrote Stripe's subscription status strings through verbatim
into a column whose CHECK constraint accepts only
`active | past_due | cancelled | incomplete | canceling`, and swallowed the write
error. Stripe's `trialing`, `unpaid`, `paused`, `incomplete_expired` — and even plain
`canceled` (Stripe's one-l spelling vs. our two-l column value) — all violated the
CHECK and silently no-opped.

## Scale

Every paying customer. The failure mode is not an outage but silent ledger drift:
`family_subscriptions` rows stop tracking reality and a churned child could keep an
active seat indefinitely. Migrated subscriptions carry real trials, so the `trialing`
variant of the status bug is reachable today.

## The decision

1. **Make the webhook code tolerant of both payload shapes** (both locations for the
   moved field), fix the status mapping with an explicit whitelist, stop swallowing the
   status write's error, make an unmapped status loud, and pin the SDK constructor's
   `apiVersion` for outbound calls. — **Done**; see Stage 1 for the precondition this
   creates and how to verify it, together with test fixtures exercising both shapes of
   the moved field and the correction to
   `docs/stripe-participations-review-followups.md`.
2. **Recreate the webhook endpoint pinned to the same version the SDK is pinned to**
   (`2025-02-24.acacia` — authoritatively, whatever apiVersion literal
   `src/lib/stripe/client.ts` pins at cutover time; the two must match). Endpoint
   versions are create-time-only, so pinning means creating a new endpoint and
   retiring the old one, which rotates the signing secret.
3. **Cut over by switching the signing secret**, with a brief two-endpoint overlap.
   No quiet window is required or attempted: Stripe fires events on its own schedule
   (renewals, dunning), so a guaranteed-quiet window does not exist — and the route
   is replay-safe by design (event-id dedup guards before payment writes, a UNIQUE
   constraint on `payments.stripe_event_id`, deletion handler treats a missing row as
   an already-processed replay), so a duplicated delivery during the overlap is
   harmless.
4. **The refunds ledger is gone, and `charge.refunded` is no longer handled.** The
   `refunds` table was write-only — the webhook wrote it and nothing ever read it back
   — so the table, the handler and the fetch path described in earlier revisions of
   this plan were all removed (2026-08-04). Stripe is the system of record for refunds,
   retains them indefinitely, and every column of the old ledger was copied from a
   Stripe object, so it is fully backfillable if a reader is ever built. Nothing in the
   cutover depends on a refund any more; do not go looking for the refund path, and do
   not reinstate it as part of this plan.

### Status-mapping decision embedded in the branch

`paused` → `past_due`. We never pause subscriptions ourselves, so `paused` can only
arrive from a manual Dashboard action; `past_due` keeps the seat and is the status the
parent-facing payment-problem surfaces key on, so a paused sub is visible to someone
rather than silent. Cost: that parent sees "payment problem" wording for something an
admin did deliberately. Accepted; revisit only if we ever start pausing
intentionally. (Also mapped: `trialing` → `active`, `unpaid` → `cancelled`,
`incomplete_expired` → `cancelled`, `canceled` → `cancelled`. A subscription set to
lapse at period end is `canceling` — from `trialing` as well as from `active`, because
Stripe leaves a cancelling sub at `trialing` for the rest of its trial; not from
`past_due`, where the payment problem is the more urgent thing to surface.)

An unmapped status is loud, but **not identically loud on both write paths**, and the
difference is deliberate: the status-update path throws (a 500 leaves the row untouched
and Stripe retries), while the checkout path logs and stores `incomplete`. On the
checkout path a throw would land mid-sequence — the Stripe subscription is already live
and the payment row not yet written — so a retry that keeps failing would leave a live
subscription with no `family_subscriptions` row at all, which is worse than a row
carrying a conservative status for a human to correct.

## Rejected alternatives

- **Pin the existing endpoint in place.** Impossible — verified: the endpoint-update
  API rejects `api_version` (`parameter_unknown`); it is create-time-only.
- **Pin the SDK constructor as the webhook fix.** Does not work — the constructor's
  `apiVersion` governs outbound API calls only; webhook payload shape is decided by
  the endpoint's pinned version (or the account default while unpinned). The two move
  independently. (An earlier doc claimed otherwise; the branch corrects it.)
- **Flip the account default version first.** Breaks renewal recording in prod
  instantly and silently while the old code is live. The account flip is now the
  *last, optional* step, made cosmetic by the endpoint pin.
- **Wait for a quiet window with no events.** Not a real thing — renewal invoices and
  subscription lifecycle events fire on Stripe's clock regardless of site traffic.
  The route's idempotency makes the window unnecessary anyway.
- **Write the handlers new-shape-only.** Rejected: the both-shapes code costs almost
  nothing, keeps a rollback to the old endpoint safe, and Stripe delivers *replayed*
  historical events in the payload shape they were created with — old-shape events
  exist forever, so the fallback retains permanent value. Do not strip it later.

## Steps

Each stage must fully complete before the next starts.

The account has **one products endpoint per Stripe mode**: a test-mode endpoint
pointing at the staging deployment, and a live-mode endpoint pointing at production.
Both share the unpinned condition, so the swap happens **twice** — test mode first,
as a zero-stakes rehearsal that is also a real fix, then live mode.

### Stage 1 — the tolerant code is live where you are about to cut over (prerequisite)

This stage is a **verifiable precondition**, not a task list — check it and move on if
it already holds. It gates each swap separately: **staging** (deploys from `dev`) must
run the tolerant code before Stage 2, and **production** (released through the normal
`/pr-dev-to-main` flow) before Stage 3. What has to be true of the deployed route,
regardless of how it got there:

- the invoice handler reads the subscription id from **both** its placements;
- the subscription status written to `family_subscriptions` is translated through
  an explicit whitelist, the write's error is checked, and an unmapped status is
  loud (a throw on the update path, a logged degrade on the checkout path);
- the SDK is instantiated with an explicit `apiVersion`.

Verify the **deploy** actually landed — not that the PR merged. The cutover changes
what Stripe sends, so the code that receives it has to be the tolerant version in
the target environment first.

### Stage 2 — rehearsal: swap the test-mode endpoint (staging) — DONE 2026-08-04

**This stage is complete; the steps below are kept as the record of what was done.**
The new pinned test-mode endpoint is `we_1U0cUCCD5Q5ECgrcpTkY9xnU` — live, verified
returning 200s on driven test events, and pointing at the staging deployment. The old
unpinned test-mode endpoint `we_1TTLtcCD5Q5ECgrcNRT1EcKe` is **disabled, not deleted**
(step 8 in Stage 4 deletes it). Nothing surprising surfaced, so Stage 3 is unblocked.
Start reading at Stage 3.

One detail to expect and not be alarmed by: the new test-mode endpoint was created
before the refunds ledger was dropped, so it still subscribes to `charge.refunded`. That
is harmless — the route answers 200 for it like any unhandled type — and its event list
can be trimmed whenever convenient. The **live** endpoint in Stage 3 is created without
it from the start.

1. In Stripe **test mode**, note the old endpoint's exact enabled-event list and
   URL, then create the new test-mode endpoint: same staging URL, `api_version` set
   to the value pinned in `src/lib/stripe/client.ts`, same event list.
2. Update `STRIPE_PRODUCTS_WEBHOOK_SECRET` for the staging environment in Vercel to
   the new endpoint's signing secret (never paste secrets in the Vercel UI — pipe
   via stdin with `tr -d '\n\r'`), and redeploy staging.
3. Drive test events through the handled types (Workbench's "send test event", or
   `stripe trigger` from the CLI — both fire test-mode events) and confirm the new
   endpoint returns 200s. Then **disable** the old test-mode endpoint.
4. **Any surprise here blocks Stage 3.** The rehearsal exists to surface it while
   the stakes are zero — diagnose and fix before touching live mode.

### Stage 3 — production cutover (live mode, ~15 minutes, after the prod release)

Prerequisite for CLI use: the restricted live key needs the **Webhook Endpoints:
Write** permission, and the CLI device key expires every 90 days — re-auth if stale.
The Dashboard's Workbench "add destination" flow also allows choosing an API version
at creation and works equally well.

5. In Stripe (live mode), note the old endpoint's exact enabled-event list, then
   create the **new** endpoint: same URL
   (`https://sogverse.sog.gg/api/webhooks/stripe/products`), `api_version` set to the
   value pinned in `src/lib/stripe/client.ts`, and **exactly the four events the route
   handles**: `checkout.session.completed`, `invoice.paid`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Create it
   **without `charge.refunded`** — the handler and its ledger are gone (see decision 4),
   so subscribing to it would only pay for deliveries the route answers 200 and
   discards. Note that this means the new endpoints deliberately **no longer mirror the
   old endpoints' event lists**: the old ones carry `charge.refunded` and the new ones
   must not. That is the one intended divergence — mirror the old list for anything
   else that differs. From this moment both endpoints receive their events; the new
   one's deliveries fail signature verification (expected — Stripe queues retries).
6. Update `STRIPE_PRODUCTS_WEBHOOK_SECRET` in Vercel (Production, sensitive) to the
   new endpoint's signing secret — same stdin rule as above. Redeploy so the running
   app picks it up. **This deploy is the cutover instant**: the new endpoint's
   deliveries (including its queued retries) start succeeding; the old endpoint's
   start failing and retrying.
7. Watch Workbench: the new endpoint returns 200s (the queued retries from step 5
   flushing through count). Then **disable — do not delete — the old endpoint.**
   Disabled-not-deleted is the rollback lever.

**Rollback at any point in Stage 2 or 3:** re-enable the old endpoint, restore the
old secret in the matching Vercel environment, redeploy. The tolerant code runs
correctly against either endpoint, which is what makes rollback safe; events that
failed during the wobble are retried by Stripe for ~3 days and can be resent manually
from Workbench.

#### What the payloads look like *after* the cutover — expect this, don't "fix" it

Pinned at `2025-02-24.acacia`, the one remaining tolerant read lands on the *earlier*
side of its fallback, which is easy to misread as the other branch being dead code:

- **Invoices still arrive with the subscription id at the top level** (`subscription`).
  That field only moves under `parent.subscription_details` in `2025-03-31.basil`, one
  version later. So the `parent` branch stays **dormant at this pin — and that is
  correct, not dead code.** It is what makes a later pin bump a no-op, and Stripe
  delivers *replayed* historical events in the shape they were created under, so both
  branches have permanent value. Do not delete it for being uncovered in production
  logs.

The consequence for acceptance: the `parent` branch gives no signal at all after the
cutover, so a renewal processing correctly is the observation to wait for.

### Stage 4 — cleanup (unhurried, order within the stage is free)

8. After the first successful **renewal** processes through the new live endpoint
   (check a `subscription_invoice` payment row appears and the family sub's
   period-end advances), delete the disabled old endpoints — both modes.
9. Audit the leftover pre-Sogverse endpoints on the account (Chargebee, WooCommerce,
   Klaviyo). Confirm each is dead (delivery history empty / target domains defunct)
   and delete them.
10. Optionally upgrade the account default API version via Workbench (preview +
    72-hour rollback). With the endpoints and SDK all pinned this is cosmetic for
    Sogverse — do it only after step 9 so no forgotten endpoint changes shape.
11. Delete this plan file.

## Acceptance criteria

- New endpoint live, pinned to the SDK's version, returning 200s on real traffic —
  including at least one renewal invoice, visible as a correct `subscription_invoice`
  payment row with the family sub's period-end advanced.
- Old endpoints deleted; `STRIPE_PRODUCTS_WEBHOOK_SECRET` holds the matching new
  secret in each Vercel environment; exactly one products webhook endpoint remains
  **per mode** (test → staging, live → production), each pinned.
- No `[stripe/products webhook]` errors in Vercel logs attributable to the cutover.
- Legacy endpoints removed; plan file deleted.

## Constraints discovered while deciding

- Endpoint `api_version` is **create-time-only**; the update API rejects it. The
  Dashboard shows a resolved version for unpinned endpoints, which reads like a pin
  but is not one.
- Webhook payload shape follows the **endpoint/account** version; the SDK
  constructor's `apiVersion` affects outbound calls only.
- Stripe never auto-expands nested objects in event payloads on any version. A list
  field embedded in a 2019-era payload is legacy behaviour, not something to rely on:
  any handler that needs a nested collection has to fetch it, not read it off the
  event.
- Replayed/resent events are delivered in the shape of the version they were
  **created** under, so old-shape events remain deliverable forever — the
  both-shapes fallback in the route is permanent, not transitional.
- The app verifies exactly one signing secret at a time, so the env-var switch is
  atomic and the two-endpoint overlap produces at most duplicate deliveries, which
  the route's idempotency absorbs (a duplicated event is a wasted query, not a
  double record).
- Stripe retries failed webhook deliveries for ~3 days and supports manual resend
  from Workbench — the safety net under every step above.
- The SDK types describe payload shapes for the *types'* version, not the wire
  version actually delivered — they can claim fields that are absent at runtime (and
  vice versa). The tests pin behaviour with explicit fixtures for both shapes of the
  moved field precisely because the compiler cannot.
