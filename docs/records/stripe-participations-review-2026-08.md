# Stripe Participations — Review Follow-ups (2026-08)

**Frozen record of the static code review of the Stripe participations work** — the
findings deliberately deferred so the PR could ship, and what became of each. Written
2026-08-04; every item's status below was re-verified against the code on **2026-08-28**,
when this doc was triaged into a record. The still-open items were handed to the owner
for `TODO.md` adoption at that triage; nothing in this file is a work queue.

The lasting value here is the *lessons* — several bugs whose shape will recur (payload
fields that move between Stripe API versions, fetch-on-absence reading live state, two
queries counting the same thing differently). Read it for those; check `TODO.md` for
what is actually still owed.

---

## Schema lock-in

### `family_subscriptions.status` is `TEXT CHECK`, not an enum — open, tracked elsewhere

Inconsistent with every other status-shaped column in its migration; loses type safety
on `WHERE status IN (...)` queries. Cheap while rows are sparse, expensive after.

**Triage 2026-08-28: still TEXT CHECK.** The open question's canonical home is now
`docs/investigations/enum-candidates.md`, which carries this candidate with the
evidence; the constraint to remember when it is done: the webhook already treats the
five-value set (`active`, `past_due`, `canceling`, `incomplete`, `cancelled` — one `l`
spelling differs from Stripe's own) as a closed vocabulary and translates every Stripe
status into it before writing, so the enum must be exactly those five values and the
webhook's translation table has to agree; changing one without the other is a rejected
write.

---

## Correctness / reliability

### ~~Realtime rollup `reserving_count` and `count_seats_taken` disagree~~ (resolved)

The rollup counted a pre-payment hold only while its deadline was in the future; the
capacity RPC counted every hold regardless. The browse page showed "seats available"
while checkout answered "full", permanently, with no way for a parent to tell why.

**Resolved** by removing the pre-payment hold entirely: a paid participation is created
when Stripe confirms payment, so the only thing that holds a seat is an active row, and
both the rollup and the gate count exactly that. Left here because the shape of the bug
— two queries each individually correct, counting the same thing differently — is the
one to watch for if a seat hold is ever reintroduced.

### ~~Webhook payloads read from one API version's field placement~~ (resolved)

Two fields the products webhook depended on have moved between Stripe API versions, and
each was read from exactly one of its two homes:

- **The invoice's subscription id.** Top-level `subscription` up to and including API
  `2025-02-24.acacia`; `parent.subscription_details.subscription` from `2025-03-31.basil`
  on, where the top-level field is gone. Read from the top level only, so on a
  basil-or-later version every renewal `invoice.paid` became an early return and renewals
  stopped being recorded.
- **The charge's refund list.** Stripe stopped auto-expanding `refunds` on the Charge
  object in API `2022-11-15`, and a webhook event object is never expanded regardless —
  so from that version on the field is simply absent. Read as "no refunds to record", so
  refunds stopped being recorded.

Both were the same shape of failure and the worst kind: no error, a 200 back to Stripe,
and rows quietly missing.

Note that the two did **not** move together, which is why neither could be described as
simply "the old shape" or "the new shape". At the version outbound calls are pinned to,
an invoice arrives in the *earlier* of its two shapes while a charge arrives in the
*later* of its two. Name each case for where the field sits, not for an era.

**Resolved for the invoice** by reading both placements — newer location first, falling
back to the older. The integration suite exercises `invoice.paid` in **both** shapes,
with each fixture carrying the field in exactly one place, so a handler that reads only
one location fails.

**Resolved for the charge by deleting the feature.** The only reader of the refund list
was a handler that wrote a local `refunds` ledger, and that ledger was write-only:
nothing in the application ever read a row back out of it. Table and handler were both
dropped (2026-08-04), and `charge.refunded` is now answered 200 as an unhandled event
type like any other. Stripe is the system of record for refunds, retains them
indefinitely, and every column of the old ledger was copied from a Stripe object, so the
data is fully backfillable if a reader is ever built. **Do not treat the bullet above as
an open instruction — there is no refund path to fix, and reinstating one is a product
decision, not a bug fix.**

**A trap that lived inside the deleted fix, worth keeping as a rule: a value fetched to
stand in for a missing event field is *live state*, not the snapshot the event
described.** The refund fetch read the charge's current refund list, so two refunds
landing close together made both deliveries see both refunds — and "take the newest"
then recorded the second twice (the duplicate silently refused by a UNIQUE constraint)
and the first never, understating the refunded total with no error anywhere. The fix was
to select the newest entry **not already recorded**, which also made a replay a no-op
for free. Any future fetch-on-absence fallback for a list-shaped field needs the same
treatment; a single-item fetch is the bug.

**The correction worth keeping:** the original write-up proposed pinning `apiVersion` on
the SDK constructor as the fix. It is not one. **The constructor's `apiVersion` governs
outbound calls only — the shape of an incoming webhook payload is decided by the API
version pinned on the webhook endpoint, or by the Stripe account default while that
endpoint is unpinned.** The two move independently, and the endpoint's version can
change without any deploy of ours, so a handler cannot assume either shape and has to
read both. Pinning the constructor is still worth doing (see below), just for a
different reason.

### Pin the outbound API version — done, and it is a separate concern

The SDK is now instantiated once, in a single shared module, with an explicit
`apiVersion`. Three things about it:

- **It protects our outbound *reads*, not our webhook handlers.** An unpinned client
  tracks the account default, so an account upgrade reshapes every response we parse —
  at the moment someone clicks a button in the Stripe dashboard, with no deploy and no
  warning.
- **The pinned literal must be the version the installed SDK's types describe.** The SDK
  ships response types for exactly one version and types the `apiVersion` option to that
  same literal, so TypeScript refuses any other value. That is deliberate and useful: an
  SDK upgrade surfaces as a compile error at the pin rather than as a runtime shape
  mismatch, and `type-check` becomes a real audit of every SDK response field we read.
- **Pinning changes response shapes at deploy time**, ahead of any webhook cutover, so
  it needs the outbound reads audited in the same change — not just the ones the
  compiler can see. Fields that merely *moved* type-check fine when read through a
  fallback and have to be eyeballed.

**The webhook *endpoint*, by contrast, was still unpinned at triage (2026-08-28)** — it
tracks the account default, with the dual-reads above as the compensating measure.
Recreating the endpoint pinned to a current version (making the payload version an
explicit, reviewable decision instead of a dashboard prompt) went to the owner as an
open item.

### A recurring-value field to keep in mind: `current_period_end`

It sits on the subscription in older API versions and on the subscription *items* in
newer ones, and the webhook reads whichever side has it (verified still true at triage).
Worth naming because it is the third instance of the same moved-field pattern and the
one most likely to catch the next reader out: unlike the two above, reading only one
side yields a `null` period end rather than a skipped row, so it degrades quietly
instead of stopping.

### `effective_status` (and siblings) marked `STABLE` but read mutable `participations` — open at triage

`STABLE` invites the planner to cache results within a statement; today the functions
are straight-line PL/pgSQL so nothing bites, but a future refactor that inlines them
into a single SQL statement could silently produce stale counts. **Triage 2026-08-28:
`effective_status` and `count_active_seats` are still `STABLE`** (`count_seats_taken` no
longer exists). Fix is one line per function: mark `VOLATILE`.

### `Stripe.products.search` cache is race-prone — open at triage

Two parents racing the first sub purchase on a product can both miss the search index
(~1s lag) and create two Stripe Products; Stripe Products with Prices can't be deleted.
**Triage 2026-08-28: still searching** (the module leans on a deterministic idempotency
key to narrow the window; no `stripe_product_id` column exists). The real fix: persist
the Stripe product id on `products` (or a sibling table) under a row lock, treat the
column as authoritative, never re-search.

### ~~`promote_from_waitlist` is read-only — caller-completes is non-atomic~~ (resolved: dropped)

The read-only stub was **deleted**, not fixed. We decided against automatic promotion;
the replacement shipped as manual, admin-driven promote/demote under the product-row
gate lock, driven by the groups-panel drag UI (see `../architecture/products.md`,
"Waitlist"). As predicted, the gate lock the other participation RPCs hold already
serializes promotion.

---

## Test gaps

### Webhook tests for the recurring-revenue hot loop — closed but one

The integration suite covers `invoice.paid` (both payload shapes, the
`subscription_create` filter, the replay dedup, `customer_id` read from the family-sub
row rather than invoice metadata), `customer.subscription.updated` (the status mapping
and both halves of the silent-write bug), and — closed since the original write-up — the
dedup-bypassed-but-idempotent replay, where the confirm RPC reports it recognised its
own earlier work.

**The rule those tests encode, for whoever adds the next one:** a payload field Stripe
has relocated between API versions gets a fixture per placement, and each fixture
carries the field in **exactly one** of them. A fixture holding both passes for a
handler that reads only whichever it happens to prefer, which is the entire failure mode
being guarded against.

**Still open at triage:** a test feeding a genuinely *unknown* event type and asserting
the 200 — the suite covers a known-but-unhandled type's default arm, but not an
arbitrary one. Easy regression catcher.

### ~~RLS IDOR test skipped for `family_subscriptions`~~ (resolved)

The file's comment used to dismiss a cross-customer test for `family_subscriptions` on
the assumption that the participation ownership chain protected it. That was wrong for
`family_subscriptions.stripe_customer_id`: it is keyed on the table's own `customer_id`
column rather than reached through participations, and it is the capability the
billing-portal route turns into a Stripe session with saved cards and invoice history.

**Resolved** — the cross-customer cases are in the participations RLS test file now,
including the lookups by `participation_id` and by `stripe_customer_id` with the
application's own `customer_id` filter deliberately removed, so the policy has to refuse
on its own.

---

## UX / a11y / quality — status at triage (2026-08-28)

- **Signup CTA spinner** — still open: the submit button disables and swaps its label
  while committing, but renders no spinner and no `aria-busy`, unlike the project's
  other forms.
- **Submit-error focus management** — still open: when the `'full'` race lands, no
  audible cue and no focus move.
- **Gamer picker radio semantics** — still open: `role="radio"` on `<button>` without
  radiogroup keyboard behaviour; native inputs with peer styling remain the cheaper fix.
- **Unmemoized `new Date()` in card derivation** — **resolved**: both surfaces read the
  shared server-seeded clock from context instead of constructing dates per render.
- **Fixture casts (`as never` per leaf)** — still as written; fixture-only, brittle to
  schema drift.
- **Query invalidation too coarse** — still open: the create-participation and
  join-waitlist mutations invalidate the whole product key hierarchy rather than the one
  product's detail.

---

## Out-of-scope items flagged in review

- **Stripe redirect URLs in security audit scope** — the 2026-03 audit didn't cover
  redirect URL validation and two real bypasses slipped through (since fixed). This is
  now standing next-audit coverage in `../architecture/security.md`.
