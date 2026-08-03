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
unpinned endpoint. On newer versions, two fields the webhook reads move or disappear
(the invoice's subscription id moves under `parent.subscription_details`; the charge's
`refunds` list is no longer embedded in event payloads at all), and the old code's
guards turned "field missing" into a silent early return with a 200 — so renewals and
refunds would simply stop being recorded, with no error anywhere and Stripe never
retrying.

Separately, the same route wrote Stripe's subscription status strings through verbatim
into a column whose CHECK constraint accepts only
`active | past_due | cancelled | incomplete | canceling`, and swallowed the write
error. Stripe's `trialing`, `unpaid`, `paused`, `incomplete_expired` — and even plain
`canceled` (Stripe's one-l spelling vs. our two-l column value) — all violated the
CHECK and silently no-opped.

## Scale

Every paying customer. The failure mode is not an outage but silent ledger drift:
`family_subscriptions` rows stop tracking reality, refunds go unrecorded, and a
churned child could keep an active seat indefinitely. Migrated subscriptions carry
real trials, so the `trialing` variant of the status bug is reachable today.

## The decision

1. **Make the webhook code tolerant of both payload shapes** (old and new locations
   for each moved field), fix the status mapping with an explicit whitelist that
   throws on unknown values, stop swallowing the status write's error, and pin the
   SDK constructor's `apiVersion` for outbound calls. — **Done**, on branch
   `fix/stripe-webhook-hardening` (single commit on top of `dev`), together with test
   fixtures exercising both shapes and the correction to
   `docs/stripe-participations-review-followups.md`.
2. **Recreate the webhook endpoint pinned to the same version the SDK is pinned to**
   (`2025-02-24.acacia` — authoritatively, whatever apiVersion literal
   `src/lib/stripe/client.ts` pins at cutover time; the two must match). Endpoint
   versions are create-time-only, so pinning means creating a new endpoint and
   retiring the old one, which rotates the signing secret.
3. **Cut over by switching the signing secret**, with a brief two-endpoint overlap.
   No quiet window is required or attempted: Stripe fires events on its own schedule
   (renewals, dunning), so a guaranteed-quiet window does not exist — and the route
   is replay-safe by design (event-id dedup guards before payment writes, UNIQUE
   constraints on `stripe_event_id`/`stripe_refund_id`, deletion handler treats a
   missing row as an already-processed replay), so a duplicated delivery during the
   overlap is harmless.

### Status-mapping decision embedded in the branch

`paused` → `past_due`. We never pause subscriptions ourselves, so `paused` can only
arrive from a manual Dashboard action; `past_due` keeps the seat and is the status the
parent-facing payment-problem surfaces key on, so a paused sub is visible to someone
rather than silent. Cost: that parent sees "payment problem" wording for something an
admin did deliberately. Accepted; revisit only if we ever start pausing
intentionally. (Also mapped: `trialing` → `active`, `unpaid` → `cancelled`,
`incomplete_expired` → `cancelled`, `canceled` → `cancelled`; anything unmapped
throws so the route 500s and Stripe retries — a loud failure instead of the old
silent one.)

## Rejected alternatives

- **Pin the existing endpoint in place.** Impossible — verified: the endpoint-update
  API rejects `api_version` (`parameter_unknown`); it is create-time-only.
- **Pin the SDK constructor as the webhook fix.** Does not work — the constructor's
  `apiVersion` governs outbound API calls only; webhook payload shape is decided by
  the endpoint's pinned version (or the account default while unpinned). The two move
  independently. (An earlier doc claimed otherwise; the branch corrects it.)
- **Flip the account default version first.** Breaks renewals and refund recording in
  prod instantly and silently while the old code is live. The account flip is now the
  *last, optional* step, made cosmetic by the endpoint pin.
- **Wait for a quiet window with no events.** Not a real thing — renewal invoices and
  subscription lifecycle events fire on Stripe's clock regardless of site traffic.
  The route's idempotency makes the window unnecessary anyway.
- **Write the handlers new-shape-only.** Rejected: the both-shapes code costs almost
  nothing, keeps a rollback to the old endpoint safe, and Stripe delivers *replayed*
  historical events in the payload shape they were created with — old-shape events
  exist forever, so the fallbacks retain permanent value. Do not strip them later.

## Steps

Each stage must fully complete before the next starts.

### Stage 1 — land the code

1. Review the branch `fix/stripe-webhook-hardening` (includes the `paused` mapping
   above) and merge it to `dev`. Push — CI runs the DB tests that cannot run
   locally.
2. Release to **production** through the normal release flow (`/pr-dev-to-main`).
   The cutover below must not begin until the tolerant code is what production is
   actually running — verify the deploy landed.

### Stage 2 — cutover (live mode, ~15 minutes, any time after Stage 1)

Prerequisite for CLI use: the restricted live key needs the **Webhook Endpoints:
Write** permission, and the CLI device key expires every 90 days — re-auth if stale.
The Dashboard's Workbench "add destination" flow also allows choosing an API version
at creation and works equally well.

3. In Stripe (live mode), note the old endpoint's exact enabled-event list, then
   create the **new** endpoint: same URL
   (`https://sogverse.sog.gg/api/webhooks/stripe/products`), `api_version` set to the
   value pinned in `src/lib/stripe/client.ts`, and the same event list. The five
   events the route handles: `checkout.session.completed`, `invoice.paid`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `charge.refunded` — but mirror the old endpoint's list exactly if it differs.
   From this moment both endpoints receive every event; the new one's deliveries
   fail signature verification (expected — Stripe queues retries).
4. Update `STRIPE_PRODUCTS_WEBHOOK_SECRET` in Vercel (Production, sensitive) to the
   new endpoint's signing secret. Never paste secrets in the Vercel UI — pipe via
   stdin with `tr -d '\n\r'`. Redeploy so the running app picks it up. **This deploy
   is the cutover instant**: the new endpoint's deliveries (including its queued
   retries) start succeeding; the old endpoint's start failing and retrying.
5. Watch Workbench: the new endpoint returns 200s (the queued retries from step 3
   flushing through count). Then **disable — do not delete — the old endpoint.**
   Disabled-not-deleted is the rollback lever.

**Rollback at any point in Stage 2:** re-enable the old endpoint, restore the old
secret in Vercel, redeploy. The tolerant code runs correctly against either endpoint,
which is what makes rollback safe; events that failed during the wobble are retried
by Stripe for ~3 days and can be resent manually from Workbench.

### Stage 3 — cleanup (unhurried, order within the stage is free)

6. After the first successful **renewal** processes through the new endpoint (check a
   `subscription_invoice` payment row appears and the family sub's period-end
   advances), delete the disabled old endpoint.
7. Audit the leftover pre-Sogverse endpoints on the account (Chargebee, WooCommerce,
   Klaviyo). Confirm each is dead (delivery history empty / target domains defunct)
   and delete them.
8. Optionally upgrade the account default API version via Workbench (preview +
   72-hour rollback). With the endpoint and SDK both pinned this is cosmetic for
   Sogverse — do it only after step 7 so no forgotten endpoint changes shape.
9. Delete this plan file.

## Acceptance criteria

- New endpoint live, pinned to the SDK's version, returning 200s on real traffic —
  including at least one renewal invoice and (when one next occurs) one refund,
  each visible as a correct row in our DB.
- Old endpoint deleted; `STRIPE_PRODUCTS_WEBHOOK_SECRET` holds the new secret;
  exactly one products webhook endpoint remains on the account.
- No `[stripe/products webhook]` errors in Vercel logs attributable to the cutover.
- Legacy endpoints removed; plan file deleted.

## Constraints discovered while deciding

- Endpoint `api_version` is **create-time-only**; the update API rejects it. The
  Dashboard shows a resolved version for unpinned endpoints, which reads like a pin
  but is not one.
- Webhook payload shape follows the **endpoint/account** version; the SDK
  constructor's `apiVersion` affects outbound calls only.
- Stripe never auto-expands nested objects in event payloads on any version
  (`charge.refunds` present in 2019 payloads is legacy behaviour) — hence the
  fetch-on-absence fallback rather than a shape read.
- Replayed/resent events are delivered in the shape of the version they were
  **created** under, so old-shape events remain deliverable forever — the
  both-shapes fallbacks in the route are permanent, not transitional.
- The app verifies exactly one signing secret at a time, so the env-var switch is
  atomic and the two-endpoint overlap produces at most duplicate deliveries, which
  the route's idempotency absorbs (a duplicated event is a wasted query, not a
  double record).
- Stripe retries failed webhook deliveries for ~3 days and supports manual resend
  from Workbench — the safety net under every step above.
- The SDK types describe payload shapes for the *types'* version, not the wire
  version actually delivered — they can claim fields that are absent at runtime (and
  vice versa). The branch's tests pin behaviour with explicit fixtures for both
  shapes precisely because the compiler cannot.
