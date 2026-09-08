# Admin-run club switch: move a seat and its subscription in one action

## Problem

Parents change their minds about a consumer club and want their child in a different one
without losing the month they have paid for. Switching is deliberately not a parent-facing
feature — it is a side effect of a parent changing their mind, and a "Switch club" button
would make it one — so the parent emails support and an admin does it by hand: edit the
subscription in the Stripe dashboard, then edit the participation row in the database.
Two systems, money in one of them, no lock, and no record beyond the admin's memory.

The hand-done version also tends to repeat the old platform's migration shortcut: leave
the Stripe subscription on its old price and merely repoint the seat. That produces a
subscription whose Stripe product and price name a club the child no longer attends, at
a price that may not be that club's — exactly the subscription/product mismatch the
platform is trying to eliminate over time.

## Scale

Every request is a support ticket plus two hand edits by an admin, in the money system.
Exact volume was not pulled while deciding; the cost per instance (a manual Stripe edit
that can mis-bill a family) is what makes this worth building, not the count.

## The decision

**One admin action on the groups panel moves a subscribed participant's seat to another
consumer club and swaps their existing Stripe subscription onto that club's canonical
price, with Stripe's own prorations settling the price difference on the next invoice.**
No credit balance, no second Checkout, no cancellation; the family keeps its
subscription, its customer, its card and its billing date.

- **The Stripe half is a plan change, not a cancel.** Update the subscription's single
  item to the target club's cached subscription price (the same price the shop sells,
  minted through the existing get-or-create price cache) with `proration_behavior:
  create_prorations`. Stripe credits unused time at the old price and debits remaining
  time at the new price on the same invoice, so a price difference is handled by the
  mechanism built for it. The item then points at the target club's Stripe product, so
  the subscription's name is right too. Metadata and description are rewritten in the
  same call. Nothing is charged at the moment of the switch; the delta rides on the
  next monthly invoice, which is the simplest sentence to tell a parent.
- **The database half is one admin RPC** that moves the participation row to the target
  product under both product locks. The row is updated, not deleted and recreated, so
  the subscription row's foreign key and the payment marker travel with it. Placement
  follows the one shared rule every new seat follows (a no-charge product with exactly
  one group places automatically; anything else lands unassigned), which for a paid
  target means unassigned.
- **Money moves once, ever.** The commit checks every database refusal with plain reads
  *before* the Stripe call, so the database step can fail only on a genuine outage. If
  it does, nothing is undone in Stripe: the route answers with an error that names the
  state, logs it, and the same commit is safe to press again — re-running sets the
  subscription item to the price it already holds, which prorates nothing, then re-runs
  the database step.
- **Subscribed seats only.** A seat with no live subscription is not this tool's
  business: an admin already moves one with the panel's remove zone and a
  comp-enrolment on the other club.
- **Admins are trusted, so gates are warnings — except the money gates.** The target's
  cap, age range, region lock and not-started state are flags on the picker, in the same
  posture the panel takes when an admin promotes over capacity. Two refusals stay hard,
  answered as "sort this out in Stripe first" the way the live-subscription refusal on
  remove is: the subscription's latest invoice is not `paid` with a positive amount, and
  the target club's price cannot be minted in the subscription's currency. The second
  is real today: products are priced in EUR only, so a subscription Stripe created in a
  presented local currency under Adaptive Pricing has no target price to move to and
  cannot be switched by this tool.
- **The admin sees the two prices, not a Stripe preview.** The dialog states what the
  family pays today — the subscription item's actual amount, read from Stripe, since a
  subscriber keeps their original amount when an admin later raises a club's price —
  beside the target's cached canonical price, and that the difference for the rest of
  the period prorates onto the next invoice. Stripe's invoice preview was cut from v1
  as the plan's largest piece for the least decision value; the admin can read the
  invoice in Stripe afterwards.

## Rejected alternatives, with the reason

- **A parent-facing "Switch club" action.** Owner's ruling: switching is not a feature;
  it is what a parent needs when they change their mind. A parent surface would also
  reopen every abuse vector below, because the actor could trigger money movement at
  will. Support is the rate limit and the admin is the judgment.
- **Cancel immediately with a prorated credit to the customer balance, then let the
  parent buy the new club from the shop.** Considered in detail and turned down. It only
  works when four things hold and each fails silently: the credit lands on the Stripe
  customer that owned the old subscription while checkout always uses the profile's
  customer, so migrated multi-customer families strand the credit; Stripe does not
  apply the balance to invoices created by Checkout Sessions with `invoice_creation`
  enabled, so it never reaches a camp or event; the balance is per currency; and
  unspent credit is a liability with no expiry. It also opens two arbitrage holes: our
  subscriptions are classic billing mode (API version predates the flexible default),
  which credits unused time at the current price even when that time was never paid
  for — a club with a deferred first charge yields weeks of free credit — and a
  once-only promotion code is consumed after the first invoice, so a proration credit
  is computed at the undiscounted price. The plan-change shape nets credit and debit on
  one invoice, so the same facts cost at most the price difference.
- **Stripe's Customer Portal plan switcher.** It can list prices and prorate, but it
  cannot run our seat gate; we would learn of a switch from the webhook after the fact
  and could find the target full or age-inappropriate. Its price list is one global
  list, while clubs are per age and language. Plan switching stays disabled in the
  portal configuration, as the billing doc already requires.
- **Repoint the seat and leave the subscription on its old price** (the migration
  shortcut). Wrong price, wrong name, and it manufactures the mismatch class this
  platform is retiring. The price swap is that repoint done properly, and every switch
  run through this tool moves one legacy subscription onto a canonical price.
- **Delete-and-recreate the participation.** Would sever the subscription row's foreign
  key (unique, cascading) and drop the payment marker, and would need the seat
  re-inserted under the same unique index. An update under the locks is the smaller
  change.
- **A compensating Stripe call when the database step fails.** The first draft undid
  the price change with a second update. That is the one place money would move twice,
  the two prorations net to about zero rather than exactly zero, and the compensation
  itself would need its own idempotency. Pre-flight plus retry-forward moves money once.
- **Settle the delta immediately (`always_invoice`).** A negative delta would then
  create the credit balance the whole design avoids; `create_prorations` keeps it on
  the next invoice of the same subscription.
- **An ownership check on the Stripe customer as a third hard refusal.** The
  subscription is reached through the participation row, which already carries both
  our customer id and the Stripe customer written at checkout, so it answers nothing.
- **Moving free and comped seats through the same action.** Nobody asked; two drags
  already do it.

## Steps

1. **Migration: `admin_move_participation(p_participation_id uuid, p_target_product_id
   uuid, p_stripe_price_id text) RETURNS jsonb`.** SECURITY DEFINER, `assert_admin()`
   first. Lock both product rows in a fixed order (by id) to rule out a deadlock between
   two admins switching in opposite directions. Require the participation to be
   `active` with a live subscription row; require the target to be a distinct product
   with `billing_mode = 'paid'` that is subscription-shaped by the same shared predicate
   the checkout route uses (not a `product_type` comparison). Do not enforce the cap,
   the audience or the target's required consents (admin override, matching promotion;
   see the owner decision on consents below). **The whole write is:** `product_id` to
   the target, `group_id` and `group_joined_at` cleared and then resolved by the shared
   placement rule, `signed_up_at` and the payment marker untouched, and the subscription
   row's `stripe_price_id` set — nothing else on that row changes, its currency
   included. Nothing group-scoped travels: attendance marks, creations and feed history
   belong to the old group and stay there, exactly as after an admin demote-and-promote.
   Refusals raise distinct errcodes in the pattern the remove and demote RPCs use, so
   the route can map them. The existing unique index
   per (product, participant) covers `active`, `waitlisted` **and `completed`** rows,
   so a child who once completed the target club collides on it; the commit route
   pre-flights that collision (and every other refusal this RPC raises) with plain
   reads before the Stripe call, so the index firing is a race the route already
   checked for, never the first line of defence after money moved. Return the ids the
   route logs. Grant to `authenticated`; classify in the spine as role-gated. Push,
   regenerate types.
   *As built:* the shared predicate had no SQL half, so `00245` adds
   `public.is_subscription_shaped(product_type, billing_mode)` — granted to nobody,
   like `is_no_charge` — and the TypeScript twin moved from the groups panel's rule
   file to `src/lib/constants/billing.ts` beside `isNoChargeBillingMode`, re-exported
   from the panel so existing importers are untouched. `group_joined_at` is not
   written at all: the trigger stamps it from `group_id`, and the table comment
   forbids writing it by hand.
2. **Check route.** An admin route under
   `/api/admin/products/[id]/participations/[participationId]/` that takes the target
   product id and returns what the dialog shows and whether commit is allowed: the
   subscription item's current amount and the target's authored monthly price in the
   subscription's currency, the hard refusals (latest invoice not `paid` with a positive
   amount, and the subscription carrying exactly one item, both from one Stripe read of
   the subscription with its latest invoice expanded; no authored price row for the
   target in the subscription row's `currency`, from `product_prices`) and the RPC's
   own refusals pre-flighted with plain reads (participation not active or not
   subscribed, target not a paid subscription-shaped product, a row for this
   participant already on the target in any status the unique index covers). **The
   check mints nothing:** browsing targets must not create Stripe objects, so it reads
   the authored price row and leaves the get-or-create mint to the commit. No tax
   handling is needed on the swap: both ends are consumer clubs, the cache stamps the
   club tax category on the Stripe product it mints, and automatic tax is already on
   the subscription. HTTP shape (a GET with a query parameter or a POST) is the
   implementer's call; both register in the posture registry.
   *As built:* a `GET …/switch?target=`. With no live subscription there is no
   currency to price the target in, so the catalogue is read at the platform
   currency for display only and the `no_target_price_in_currency` refusal is
   withheld — a refusal derived from a guessed currency would be noise beside
   `no_live_subscription`.
3. **Commit route.** Same path family, POST. Sequence: re-run every check from step 2,
   the Stripe read included; mint the target price through the get-or-create cache;
   update the Stripe subscription (item to the target price, `create_prorations`,
   metadata and description rewritten) with an idempotency key derived from the
   participation id, the target product id and a client-supplied request id, so a retry
   after a timeout does not prorate twice; then call the RPC. The request id is minted
   once per dialog open and reused for every press in that dialog, so a retry after a
   failure replays the same Stripe request; the no-op-item safety is the second line,
   for a retry from a fresh dialog. If the RPC fails, answer
   500 with a message that says the subscription is already on the new price and the
   commit should be retried, and log at error with both ids. A repeated commit sets the
   item to the price it already has (Stripe prorates nothing for a no-op item change)
   and re-runs the RPC. Write a structured log line in the shape of the comp-enrolment
   route's (admin id, participation, source and target product, subscription id).
   Register both routes in the posture registry with their tests.
   *As built:* the metadata rewrite is exactly the keys that name a product —
   `productId`/`product_id`, `productName`, `productType`, `adminProductUrl`,
   `shopProductUrl`, `spoken_language_code` and the two delivery dates (sent as
   `""` where absent, Stripe's spelling for a removal, since a metadata update
   merges); the description is rebuilt as `{target club} — {who holds the seat}`
   in the payer's locale, the two halves checkout composed it from. Once the RPC
   has succeeded, and before the 200, the commit sends the family the same
   purchase confirmation a paid club signup sends — for the target club, on the
   unchanged participation id, so its calendar invitation updates the entry they
   already hold.
4. **Webhook.** In the subscription-updated handler, also store the subscription's
   current item price id on the row (the checkout-completed handler already does at
   creation). Three lines; no reconciliation logic. Our own commit fires this event
   and the webhook writes the same id the RPC wrote; last writer wins and both agree.
5. **Groups panel UI.** A control on an **active, subscribed** participant's chip
   (never a waitlist chip; how it is revealed — hover, focus, a small menu — is the
   implementer's call, since the chip is a drag handle today) opens a dialog. The
   picker lists every paid, subscription-shaped product in `pending` or `running`
   status on the platform, from the admin product list read the admin products page
   already makes, not filtered by language or region — the admin knows the family — with
   each row carrying its warnings inline (full, age range excludes this child, region
   lock, required consents the family has not accepted, not started — a not-started
   target bills prorated from today). Below it, the two prices and the one-sentence
   proration statement, filled from the check route inside a container that already has
   its final size; a `DialogFooter` whose confirm is present from open and enabled once
   the check answers without a hard refusal. Inline `committing` flag. On success
   invalidate the groups key root, which cascades to both products' snapshots. Copy in all five locales — admin strings live in the message files like
   every other UI string.
   *As built:* the dialog is opened by a **drop, not a chip control** — owner's
   ruling that nothing sits on a draggable chip — so the header's drop zone reads
   the chip it is offered and says "Switch club" for an active subscribed seat and
   "Remove gamer" for every other one, and the removal drop rule resolves to the
   switch for exactly that seat (a waitlisted subscribed row keeps the refusal).
   Three of the five picker warnings ship — age range, region lock and
   not-started. **Full** and **required consents the family has not accepted** were
   dropped: the admin product list read carries `seat_count` but no taken count, and
   carries no `product_required_consents` embed at all, so neither is derivable from
   the two documents already on screen and both would have cost a per-picker server
   read. Owner's call whether either is worth a widened product query later.
6. **Tests.** DB: the RPC in the spine; a non-admin refused; a move between two paid
   clubs (row moved, group resolved by the shared rule, price id set); a seat with no
   live subscription refused; a duplicate seat on the target failing on the index; two
   admins moving in opposite directions completing without deadlock. Integration: both
   routes registered and tested with the Stripe client mocked, including a commit whose
   RPC fails and a repeated commit with the same request id. Unit: the picker's warning
   derivation.
7. **Docs.** Add the switch rule to the products doc's subscription section (one
   subscription per participant and club still holds — the subscription follows the
   seat); note in `docs/runbooks/stripe.md` that club switches are done from the groups
   panel, never by hand, and that refunds remain in Stripe; tell the CFO that club
   invoices will now occasionally carry proration lines.

## Acceptance criteria

- From the groups panel an admin can move a subscribed child from club A to club B: the
  seat is on B, the Stripe subscription's item is B's canonical price, B's name shows on
  the subscription, and the next invoice carries a credit line for A and a debit line
  for B.
- A subscription whose latest invoice is open or past due is refused with a message that
  says to resolve it in Stripe first; nothing is written to either system.
- A subscription in a currency the price cache cannot mint is refused, and the message
  says why.
- Killing the process between the Stripe update and the RPC leaves a logged error and a
  commit that succeeds when pressed again, without a second proration.
- A repeated commit with the same request id does not prorate twice.
- Lint, type-check and unit tests clean; DB and integration suites green in CI.

## Owner decisions, marked

- **Whether a not-started target is allowed at all.** The plan allows it with a warning
  (the admin knows why the family is moving early); the alternative is a hard refusal.
- **Required consents the family never accepted.** A product can require consent
  documents at enrolment; a switch writes the seat without that step. The plan treats
  a missing required consent as a picker warning like the cap, on the admins-are-
  trusted rule. The alternative is a hard refusal, since consent is a legal gate
  rather than a capacity one.

## Follow-ups (cut from v1; die with this plan unless the owner names one)

- A Stripe invoice preview in the dialog, so the admin sees the proration to the cent
  before committing.
- Switching a subscription that has not yet had its first charge (deferred billing
  anchor). Nothing has been paid, so the family loses nothing by cancelling in the
  portal and buying the other club; the paid-invoice gate refuses these.
- Moving a seat between camps or events. Those are single payments with a refund
  schedule; a move there is a refund question, which stays with support and Stripe.
- Letting the admin settle the proration immediately rather than on the next invoice.
- A webhook check that the subscription's item price belongs to the seat's product.

## Constraints discovered while deciding

- Stripe computes prorations at the subscription's *discounted* price, but a once-only
  coupon is removed from the subscription after its first invoice, so a later proration
  sees no discount. Under the plan-change shape the credit and debit net on one
  invoice, bounding the effect to the price difference.
- Classic billing mode credits unused time at the current price whether or not it was
  paid. This is why the latest-invoice-paid gate is hard and why deferred-first-charge
  subscriptions are excluded.
- A Stripe subscription cannot be moved between customers, and migrated families can
  hold several customers. The switch keeps the subscription where it is, so the
  multi-customer shape never enters.
- One `family_subscriptions` row per participation, referencing it by a unique,
  cascading foreign key; the row carries `stripe_price_id`, `currency` and
  `stripe_customer_id`. The currency check on that table and on the price cache admits
  EUR, GBP and USD.
- The price cache is one row per product and currency, minted lazily on first sale and
  reused; it is the only source of a club's canonical price. Products are authored in
  EUR only, so the cache can mint only EUR prices; a subscription Stripe created in a
  presented local currency under Adaptive Pricing has no target price, and the check
  route's currency refusal says so plainly rather than surfacing a null from the cache.
- Stripe idempotency keys dedupe only byte-identical requests and expire after about a
  day, so a key protects a retry of the same commit, not a different Stripe call made
  later. A no-op item update (same price) creates no proration, which is what makes
  retry-forward safe without a key.
- The subscription-updated webhook today writes status and period end only; the
  checkout-completed handler is what records the price id.
- The groups panel's move decisions are pure functions over one snapshot that already
  carry "has live subscription" per participation; the new action's warnings belong
  beside them.
- Automatic placement is one shared predicate (no-charge product with exactly one
  group) applied by both instant-active writers; a paid seat lands unassigned on every
  path.
