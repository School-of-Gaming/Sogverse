# Deferred billing for future-start consumer clubs

## Problem

Consumer clubs cannot be created with a future start date. The admin product form
pins a consumer club's start date to "today" (a deliberate UI lock in
`src/components/admin/products/form-locks.ts`), because the billing would be wrong
without it: a subscription created through Stripe Checkout starts billing
immediately, so a parent buying a club that starts in three weeks would pay for
three weeks of nothing.

The consequence is operational: clubs that launch on a known future date (a new
term, a new group) cannot be listed for signup ahead of that date, even though the
signup machinery (registration gates, seat caps, waitlist) handles a pending
product fine.

## Scale

Every consumer club — the recurring-revenue core of the catalogue. Today the lock
forces "create the product on launch day", which blocks any pre-launch signup
period. Seat counts per club are small (typically ≤ 12).

## The decision

Re-enable the start-date field for consumer clubs, and defer the first charge
using **`subscription_data.billing_cycle_anchor` + `proration_behavior: "none"`**
on the Checkout Session (decided 2026-08-12, after empirically probing the
alternatives in Stripe test mode — see Rejected alternatives):

- At checkout, when the club's start instant is in the future, set
  `subscription_data.billing_cycle_anchor` to it and
  `subscription_data.proration_behavior` to `"none"`. The parent pays **€0 at
  checkout** (card still collected — Checkout's `payment_method_collection`
  defaults to `always`; do not change it), no trial vocabulary appears anywhere,
  the subscription is `active` immediately, and the first full invoice fires at
  the anchor. Monthly billing then recurs on the anchor's day.
- The **start instant is midnight, product-local, on `start_date`** — the
  product's `timezone` column (fixed to `Europe/Helsinki` by the admin form)
  applied to the bare date with a single `fromZonedTime` call from `date-fns-tz`.
  First-session slot time was considered and rejected: the charge lands the same
  calendar day either way, and midnight needs no schedule lookup.
- **The anchor is clamped**: Stripe rejects an anchor later than the buyer's
  "next natural billing date" (~one month out), so the anchor is
  `min(startInstant, now + 28 days − 1 hour)` in epoch seconds. A parent buying
  more than ~4 weeks before start is therefore **charged before the club
  starts** (first charge ~4 weeks after purchase). This is an explicitly
  accepted product decision, chosen over gating signups to the final month —
  early commitment is worth more than perfectly aligned billing. Because of the
  clamp, Stripe can never reject the parameter and no per-purchase error path
  exists.
- **All date handling is deliberately arithmetic-free**: one `fromZonedTime`
  library call (the only zone-aware step), then pure epoch-seconds `min` and
  addition. No calendar stepping, no `setDate`, no DST exposure — Stripe
  compares instants, not wall clocks. The 28-day constant is always within
  Stripe's limit (worst case: buying Jan 31, next natural billing date Feb 28 =
  exactly 28 days; the boundary itself was probe-verified as accepted, and the
  hour is clock-skew margin).
- If the start instant is **now or past** (stale date, launch-day club), omit
  both parameters — today's charge-immediately behaviour, unchanged.

**Explicitly out of scope, recorded in `TODO.md` (do not build here):**

- Syncing existing subscriptions when an admin later edits a product's start
  date. For v1 that correction is **manual in the Stripe dashboard**. This plan
  adds an admin-form hint and a code comment saying so (see Steps), nothing
  more.
- Threshold-start clubs. The start-mode lock stays on; only date-start clubs
  exist.

## Rejected alternatives

- **`subscription_data.trial_end`.** Would allow buying up to 2 years ahead with
  the first charge exactly on the start date — but Stripe's hosted page frames
  it as a free trial ("X days free", trial reminder emails), which reads
  wrongly for "your club starts later", and it cannot defer for buyers within
  48 hours of start (Stripe hard-rejects `trial_end` < 48h out). The anchor has
  **no minimum** (probe-verified: +1 hour accepted) so it also covers
  last-minute buyers. Chosen against despite its longer horizon.
- **Anchor + gating signups to the final month** (auto-set
  `registration_opens_at` to start − 28 days). Keeps billing perfectly aligned
  with delivery but turns away a month of willing buyers. Rejected: capturing
  early signups matters more.
- **Hybrid (anchor within a month, `trial_end` beyond).** Full coverage and the
  best wording per case, but two code paths and the same club's checkout
  renders differently by purchase moment. Rejected for v1; the trial branch
  could be added later without touching what this plan builds.
- **Subscription Schedules.** Checkout cannot create a schedule; it would need a
  setup-mode session plus server-side schedule creation. More moving parts for
  the same outcome.
- **Auto-syncing subs on admin start-date edits, in this change.** Deliberately
  deferred to keep v1 small; the worked-out design lives in `TODO.md`.
- **Keeping the lock (status quo).** Blocks pre-launch signup periods entirely.

## Constraints discovered while deciding

Verified facts — do not re-litigate. Items marked *probed* were confirmed
empirically against the Stripe test-mode API on 2026-08-12.

- **Anchor ceiling** (*probed*): `billing_cycle_anchor` later than the "next
  natural billing date" (same day-of-month one month after session creation,
  for our `interval: month, interval_count: 1` prices) is rejected at **session
  creation** with `The billing_cycle_anchor cannot be later than next natural
  billing date.` Exactly-equal is accepted (+31d passed on a 31-day month;
  +32d failed). Validation at creation means the 30-minute session lifetime
  cannot invalidate an already-created session.
- **Anchor floor** (*probed*): none — +1 hour is accepted. Any future instant
  works.
- **€0 sessions complete as `no_payment_required`, and two of our gates
  hard-require `"paid"`.** Per Stripe's docs, with `proration_behavior: "none"`
  the session's line-item and total amounts are 0 and `payment_status` is
  `no_payment_required`. Our Stripe products webhook's checkout-completed
  handler early-returns unless `payment_status === "paid"` — **as shipped, a
  deferred purchase would create no participation at all** — and the shop
  confirmation page's Stripe-fallback path has the same `"paid"` check. Both
  must learn to accept `no_payment_required` **for subscription-mode sessions
  only**; payment-mode (camps/events) keeps requiring `"paid"`.
- **No invoice exists until the anchor.** Unlike a trial (which generates a €0
  invoice), an anchored subscription with prorations disabled has **no invoice
  at creation** (`latest_invoice` stays null until the anchor — this is also
  the discriminator the deferred admin-sync work in `TODO.md` relies on). The
  first real charge arrives via `invoice.paid` with
  `billing_reason: "subscription_cycle"` — i.e. shaped like a month-2 renewal
  in our payments ledger, preceded by a €0 checkout payment row. Accepted:
  Stripe is the finance source of record, our rows are markers. The webhook
  handler's comment claiming first-period invoices arrive via
  `checkout.session.completed` becomes false for deferred purchases and must be
  updated in the same change.
- **The subscription is `active` from purchase**, with `current_period_end` =
  the anchor. The webhook's status mapping needs no change; the seat is held
  and sessions show, exactly as for any active sub. Locally, a
  waiting-for-anchor sub is indistinguishable from a billing one — by design.
- **Stripe limitations that don't bite but must not be tripped**: anchor is
  mutually exclusive with any trial setting (we set none); one-time prices
  can't ride a `proration_behavior: "none"` session (our club prices are
  recurring; camps/events are payment-mode sessions, untouched).
- **The first charge becomes off-session.** A card can decline weeks after
  signup. Accepted: identical to a month-2 renewal decline, handled by the
  existing dunning / `past_due` badge / `unpaid → cancelled` machinery.
- **Signups on a not-yet-started product already pass the gates.** The
  `create_participation` RPC accepts products whose effective status is
  `pending` or `running`, and sessions materialize lazily from schedule math —
  an enrolled family sees a club whose first session is on the start date. No
  access-gating changes.
- **Finance metadata is unaffected.** The checkout route already stamps
  `delivery_start`/`delivery_end` from the product's dates; a future
  `start_date` flows through unchanged.
- **`start_date` is a bare calendar date** (`YYYY-MM-DD`). Displayed dates use
  the date-only path (never re-anchored to a viewer's zone); converting it to
  the charge instant uses the product's zone deliberately (entity-local), the
  exception the root `CLAUDE.md` date rules carve out.

## Steps

Each step is independently verifiable; order matters only where stated.

1. **Unlock the start-date field for consumer clubs — by removing the lock,
   not by flipping it to a permanent `false`.** This feature shipping is the
   retirement condition `form-locks.ts` was written for, so **excise**
   `consumerClubStartDateToday`: delete the flag from the `FormLocks`
   interface, the disabled wiring and locked-hint rendering in the When
   section, the pinned-to-today default in `initialState`
   (`product-form-state.ts`), and the now-unreachable hint message keys across
   all locale files. A fresh consumer-club form starts with an empty start
   date and the existing `startDateRequired` validation makes the admin pick
   one. The other locks stay untouched. **Deliberately no new date
   validation**: an admin may enter a past or same-day start date, which the
   billing branch defines as charge-immediately — the same latitude camps and
   events already have, and admins are trusted (root `CLAUDE.md`).

2. **Add a small pure helper that decides the anchor.** Given a bare
   `start_date`, a product timezone, and a `now` instant, return the anchor
   `Date` (`min(product-local-midnight-of-start, now + 28d − 1h)`) when the
   start instant is in the future, else `null`. Named constants for the clamp,
   each with a comment naming the Stripe constraint it mirrors. It lives with
   the other Stripe helpers in `src/lib/stripe/` but must import nothing
   server-only (no Stripe SDK, no secrets) — the client-side signup panel
   imports it too (step 5). Its only zone-aware operation is `fromZonedTime`;
   everything else is epoch arithmetic.

3. **Set the anchor in the checkout route.** In
   `src/app/api/checkout/products/create/route.ts`, subscription branch only:
   call the helper with the product row already fetched there (`start_date`,
   `timezone`); when it returns an instant, set
   `subscription_data.billing_cycle_anchor` (unix seconds) and
   `subscription_data.proration_behavior: "none"`. Add a code comment at this
   site stating that **an admin who changes the product's start date must
   correct existing subscriptions' anchors manually in Stripe** (the sync is a
   recorded `TODO.md` follow-up), so the gap is visible where the anchor is
   born. A product with no `start_date`, or one starting now/past, behaves
   byte-for-byte as today.

4. **Accept `no_payment_required` where deferred purchases land.** In the
   Stripe products webhook's checkout-completed handler, widen the
   `payment_status` gate to accept `no_payment_required` for
   `mode: "subscription"` sessions only (payment-mode still requires
   `"paid"`). Make the shop confirmation page's Stripe-fallback gate accept
   the same pair. Without this step the feature creates zero participations —
   it is the load-bearing fix, not a nicety. Three deliberate clarifications:
   - The widening is **per-mode, not per-deferral, on purpose**: any €0
     subscription-mode completion qualifies, which also quietly fixes an
     existing silent failure — a 100%-off promotion code on an immediate-start
     club completes as `no_payment_required` today and creates no
     participation.
   - The stale comment to update — "first-period invoices come in via
     checkout.session.completed" — lives in the **`invoice.paid` handler's**
     early-return, not in the checkout-completed handler. The `invoice.paid`
     handler's *behaviour* needs no change: the deferred first charge arrives
     as `billing_reason: "subscription_cycle"` and the existing renewal path
     records it. Do not widen any gate there.
   - The €0 checkout leaves a payment row shaped `purpose:
     "subscription_invoice"`, amount 0, null invoice id — that exact shape is
     the accepted outcome (it is the idempotency marker); do not invent a new
     purpose for it.

5. **Parent-facing copy: say when the first charge happens.** On the public
   shop product detail page's signup panel
   (`src/components/public/products/`) and on the paid confirmation page, show
   "first charge on {date}" (or equivalent) whenever billing is deferred. The
   date shown must be the **anchor** date — for an early buyer the clamp makes
   it earlier than the club's start date, and showing the start date there
   would be a lie about money.
   - **Signup panel (pre-purchase):** derive from the shared helper at render
     time. Drift of minutes between render and checkout is immaterial; a
     clamped date can slip a day if the tab sits overnight — accepted, the
     authoritative figure is on Stripe's page and the confirmation.
   - **Confirmation page — the deferral signal and its source, per arrival
     path.** On the row-first (RLS) path, the discriminator is the €0
     subscription payment row (`purpose: "subscription_invoice"`,
     amount 0); the date comes from the family's subscription row's
     `current_period_end`, which for a deferred purchase *is* the anchor. Do
     not use `current_period_end` alone as the signal — an immediately-charged
     sub also has a future period end (its renewal), and labelling a renewal
     "first charge" is the same lie about money. On the Stripe-fallback path,
     the discriminator is the session's
     `payment_status === "no_payment_required"` and the date comes from the
     session's subscription. (A 100%-off-once coupon on an immediate club also
     trips the €0 signal; the line it produces — first charge at period end —
     is still true for that buyer.)
   - **The signal needs a temporal guard, because the €0 row is permanent but
     the deferral is not.** After the anchor fires, `current_period_end`
     advances to the *next* renewal, and a parent revisiting their
     confirmation link (which they do) would read "first charge on {next
     renewal date}" — false. On the row-first path, render the line only
     while no positive-amount `subscription_invoice` payment row exists for
     the same participation; once the first real charge lands, the line
     disappears. The Stripe-fallback path needs no guard: it only serves the
     fresh-purchase window before the webhook's rows exist, after which
     revisits resolve row-first.
   - The line renders only where the payer's rows are readable — the
     `payments` SELECT policy is customer-only, so a gamer viewing a
     confirmation never sees it. That is the intended outcome, not an
     accident: billing copy is for the payer.
   - **Projecting the date:** when the anchor equals the start date
     (unclamped), render the bare `start_date` via the date-only path,
     matching the start date shown elsewhere on the page. A **clamped** anchor
     (and the confirmation's stored `current_period_end`) is a true instant
     with no natural calendar date: project it to the **viewer's timezone**
     (`useTimezone()` / the server equivalent) before formatting — that is the
     date the charge will appear on their statement.
   - New strings go into every locale file in `messages/` (en, fi, fr, sv,
     tlh — Klingon may be playful, the others must be accurate). Exact
     wording/placement is implementer's judgment; the requirement is that a
     parent who will see €0 due today on Stripe's page was told why before
     clicking, and the confirmation restates the real first-charge date.
   - Extend the existing preview-scene fixtures for the product detail and
     purchase-confirmation scenes with a future-start-club scenario (the
     confirmation fixture fakes the €0-payment-row signal above) so the new
     line is reviewable from fixtures (scenes mock the whole page).

6. **Admin-form hint about editing the date later.** On the consumer-club
   start-date field, add a hint that changing the date after signups exist does
   **not** move existing subscriptions' first-charge date — that correction is
   manual in Stripe for now. This is the surface where the person who can trip
   the gap will see it. Translated like any admin string.

7. **Tests.**
   - Unit tests for the helper: near-future date → anchor at Helsinki midnight
     of the start date; far-future date → clamped to now + 28d − 1h;
     today/past/null → null; a DST-transition start date sanity check (the
     `fromZonedTime` conversion, not hand-rolled arithmetic).
   - Integration coverage for the checkout route: a consumer-club subscription
     with a future `start_date` creates the session with
     `billing_cycle_anchor` + `proration_behavior: "none"` set as expected
     (both the exact-start and clamped cases); an absent/past date creates it
     with neither.
   - Integration coverage for the webhook gate: a subscription-mode
     checkout-completed event with `no_payment_required` is processed; a
     payment-mode event with `no_payment_required` is still ignored.
   - Follow the existing conventions in `tests/integration/` — the route and
     webhook already have posture-registry entries; extend their existing test
     files rather than adding new route classifications.
   - No DB tests: no schema, RPC, or grant changes.

8. **`TODO.md` is already in its end state** — the follow-ups section
   ("Deferred billing for future-start clubs — the follow-ups") was rewritten
   when this plan was authored. Verify it still matches reality; don't hunt
   for a "built scope" section to remove.

## Acceptance criteria

- An admin can create a consumer club starting on a chosen future date; the
  form no longer pins the date to today, and the field carries the
  "editing later won't move existing subs" hint.
- Buying that club with a start date within ~4 weeks: Stripe Checkout shows €0
  due today, the created subscription is `active` with `billing_cycle_anchor`
  at product-local midnight of the start date, no trial vocabulary appears,
  the participation is created by the webhook, and the club appears on the
  family dashboard.
- Buying a club starting further out (e.g. 8 weeks): identical, except the
  anchor (and every surface's stated first-charge date) is ~4 weeks out — the
  clamp, honestly displayed.
- Buying a club starting today/past: byte-for-byte today's behaviour —
  immediate charge, no anchor.
- The signup panel and confirmation state the real first-charge date, in every
  locale; the preview scenes have a future-start scenario.
- `npm run lint`, `npm run type-check`, and `npm run test` pass; CI (including
  the integration route-registry completeness checks) is green.
