# Let a parent give up a no-charge seat

## Problem

A parent has no way to end an active seat unless it is billed by a Stripe subscription.
A paid consumer club is cancelled through the billing card, which opens Stripe's hosted
portal; the subscription-deleted webhook then removes the seat. Every other active seat —
a municipality club registration, a free club, a free camp or event, a seat an admin
comped onto a paid product — has no parent-facing exit at all. The only thing that ends
one is an admin dragging the participant onto the groups panel's remove zone, and the
admin removal RPC's own comment says so: a free club has no parent-facing cancel, so
admin removal is its only exit.

The schools page already promises the feature. Its waitlist note tells parents that if
their child stops attending they should cancel the registration so the place can be
offered to the next gamer. Today that sentence describes nothing a parent can do, so a
capped municipality club whose family drifted away keeps a seat occupied that a
waitlisted family is waiting for.

## Scale

Every municipality registration is affected (the type is `external_contract` throughout),
plus every free product of any type and every comped seat. Municipality clubs are the
type where a cap is mandatory and a waitlist is common, so it is also the type where a
stranded seat costs another family a place. Exact counts were not pulled while deciding;
if priority is in question, count active participations that match the gate below
before building.

## The decision

**A parent may give up any active seat that no money ever touched, from their own
enrollment card, immediately and with a hard delete — the same ending every other
cancellation already has.**

- **The gate is the seat's money, not the product's type or billing mode.** A seat is
  the parent's to give back when its participation has **no payment marker**
  (`stripe_checkout_session_id` is null) **and no `family_subscriptions` row of any
  status**. The marker is stamped on every seat bought through Checkout since the
  create-on-confirmation flow; the subscription row covers the paid seats from before
  it, which were bound to their Stripe subscriptions by hand and carry no session id.
  Together the pair means "money never touched this seat", which is the owner's
  invariant: there are no paid seats the gate cannot see. Gating on the participation
  rather than the product handles the grandfathering the products doc accepts — a club
  flipped from paid to free keeps its subscriptions, a free enrollee on a club flipped
  to paid stays unbilled — and covers comped seats on paid products with no special
  case.
- **A seat money touched keeps the paths it has.** A live subscription keeps pointing at
  the billing portal. A seat with a payment marker or a dead subscription row and no
  live one (a paid camp or event, a club whose subscription died in dunning, a legacy
  paid seat) gets no control; the legal page states the camp refund schedule, a refund
  is a manual credit note in Stripe, and no in-app state may promise one. Those seats
  stay admin's to remove, as today.
- **Immediate, and a hard delete.** A no-charge seat has no paid window to run out, and
  freeing the seat now is the point. Only `family_subscriptions` references
  `participations`, so attendance marks, session reports and chat history survive on
  the staff side; the family loses the product page, the group placement, the voice
  room and the chat roster at once — mid-term or mid-session included, because the
  parent confirmed exactly that — which is what a paid cancellation already does once
  its period ends.
- **The link shows on a running seat and on one awaiting placement; not on an ended
  run.** An ended card is inert history and the seat completes on its own; a seat still
  waiting for a gedu match is a real seat the parent may give back.
- **The affordance lives on the enrollment card's billing arm**, so it renders for both
  adult audiences (a parent looking at a child's seat, and a parent holding their own
  seat on an adult-admitting product) and never on the child's own dashboard, in the
  same slot the leave-waitlist link uses, behind a confirm dialog. Not on the family
  product page: that page's own doc says nothing on it is a control, and the card owns
  billing.
- **Nobody is notified.** Owner's ruling: an admin sees the freed seat on the product
  page they are already on, or on their dashboard when it needs attention; a mail for
  this would be a new kind of thing. The route writes the structured log line the admin
  removal route writes, for hosted log aggregation.

## Rejected alternatives, with the reason

- **Gate on `billing_mode` (the no-charge set) instead of the seat.** Wrong in both
  grandfathered directions: it would offer the control on a subscribed seat of a club
  flipped to free (deleting the row would orphan a billing subscription — the exact
  hazard the admin refusals exist for) and hide it from a free enrollee on a club
  flipped to paid.
- **Gate on `product_type`.** The products doc forbids branching on it, and it says
  nothing about whether this seat was paid for.
- **Gate on "no *live* subscription and no marker" (the panel's own pair).** Considered
  first; it lets a legacy paid seat whose subscription died in dunning through, because
  such a row has neither. Counting a subscription row of any status closes that with
  one term and no backfill.
- **Soft-end the seat (a status, an end date) instead of deleting.** Nothing else in
  the lifecycle soft-ends; the webhook path and admin removal both hard-delete, and a
  second ending shape would fork every roster and counter for a seat nobody paid for.
- **Offer it for paid camps and events too, with the refund done by support later.** An
  in-app action that deletes a paid seat while the refund is a manual credit note days
  later either promises a refund it cannot make or looks like taking the money. The
  legal page already routes camp cancellations to support; keep it there.
- **Put the control on the family product page.** Rejected by that page's own rule
  (nothing on it is a control) and by consistency: the card is where billing and the
  waitlist leave already live.
- **A staff mail when a leave frees a capped seat.** Owner's ruling above.

## Steps

1. **Migration: `leave_my_participation(p_participation_id uuid) RETURNS jsonb`.**
   SECURITY DEFINER, empty search path, modelled line for line on the leave-waitlist
   RPC: read the row filtered by `customer_id = auth.uid()` (a foreign row answers
   `not_found`, identically to a missing one); take the product row lock; re-read under
   the lock; answer `not_found` unless status is `active`; answer `refused` when a
   payment marker or any `family_subscriptions` row exists; otherwise delegate to
   `cancel_participation` with reason `parent_left` and answer `left`. **Every outcome
   is a returned kind, never a raise**, exactly as the model RPC does, so no status code
   leaks whether a row exists; the delegate's `noop` maps to `not_found`, and its
   Stripe subscription id is dropped here and never reaches a parent. Grant EXECUTE to
   `authenticated` only. Comment the function. Push, regenerate types.
2. **Contracts, service, mutation.** Body and response schemas beside the waitlist
   ones — the wire response is `{ kind: "left" | "not_found" | "refused" }`; a service
   method that calls the route; a mutation hook invalidating the participation and
   product key roots, as the leave-waitlist hook does.
3. **Route.** Under `/api/participations/`, the same verb, posture and body handling as
   the leave-waitlist route (path is the implementer's call); no error mapping is
   needed because refusals are kinds; write the structured log line on `left`.
   Register it in the integration suite's route posture registry with its test.
4. **Surface the gate to the card.** The card needs two facts per seat, and both come
   from reads the parent dashboard already makes. **The payment marker** is a column on
   the parent's own `participations` rows, selected under RLS; add it to that select.
   **Whether a subscription row exists** comes from the dashboard's per-participation
   subscription-state RPC, which today returns only `past_due` and `canceling` rows on
   purpose (a deliberately money-free read, shared with the gamer audience, feeding the
   two badges). Widen it to return every row regardless of status, with the status on
   it; existing consumers already filter by status, so the widening is additive. Its
   result still reaches the gamer's dashboard, where nothing may render from it — the
   no-billing-signal rule is unchanged, the gamer-side read stays as it is, and it
   keeps `current_period_end` on every row. The waitlist read is a separate,
   deliberately state-free shape and is left alone. The enrollment rollup derives **one
   boolean** from the pair (the seat is no-charge) and that single flag is what the
   summary carries to the card, so a raw money pair never rides on a child's summary.
   The card decides from that flag alone, never from product type or billing mode.
5. **Card and dialog.** A quiet link on an active, no-charge seat's card in the
   leave-waitlist link's slot, one string for every product type. Unlike a waitlisted
   card, an active card is a stretched link to the product page, so the new link takes
   the same stacking lift the Join button uses and the footer row renders for it.
   Whether it generalises the existing leave-waitlist link component, which message
   namespace it takes and whether the shell reuses its in-flight set are the
   implementer's calls. The parent dashboard preview scene already mocks the whole
   page; add a no-charge seat to its existing scenario rather than creating one. A `ConfirmDialog`
   naming the child and the product on the parent's copy and speaking in the second
   person on the self copy, exactly as the waitlist copy already splits, whose body
   states the mechanism: the place is released now, it may be offered to the next
   family in line, and the club's page and history stop showing on My SOG. Inline
   `committing` flag per the loading rule; the card dims while in flight as the waitlist
   leave does. Copy in all five locales.
6. **Tests.** DB: classify the RPC in the authorization spine as self-scoping with a
   scope test; cases for a foreign row (`not_found`), a waitlisted row, a live
   subscription (refused), a cancelled subscription row with no marker (refused — the
   legacy shape), a payment marker (refused), and the happy path on a free product, a
   municipality product and a comped seat on a paid product (row gone, seat count down).
   Integration: the route's registry entry and test. Unit: the card renders the link
   only for the no-charge flag, on both adult audiences (the gamer arm has no billing
   props by type, so no test is needed for it).
7. **Docs.** Rewrite the products doc's "club cancellation is portal-only" bullet to
   state both exits; rewrite the admin removal RPC's comment, which says a free club has
   no parent-facing cancel; add the rule to the products doc that a parent-initiated
   exit is gated on the seat's money, stating the pair. Nothing on the schools page
   changes: its promise becomes true.

## Acceptance criteria

- A parent of a child on a municipality club, a free event and a comped seat can give
  each up from My SOG; the row is gone, the seat count drops, the card disappears.
- The same parent sees no such control on a subscribed club (the billing card still
  opens the portal), on a paid camp, or on a legacy paid seat with a dead subscription.
- A parent cannot delete another family's seat by id: the RPC answers `not_found`.
- A seat with any subscription row cannot be deleted through this RPC even by a
  hand-crafted call.
- `npm run lint`, `type-check`, `test` clean; DB and integration suites green in CI,
  including the spine and registry completeness checks.

## Follow-ups (cut from v1; die with this plan unless the owner names one)

- A "need to cancel? contact us" line under a paid camp's or event's card, so every
  card answers how to leave.
- A municipality-specific sentence in the FAQ's cancellation answer, which today covers
  clubs and camps only.
- A per-product-type verb on the link (register / enroll / sign up / join), if one
  string reads wrongly somewhere.

## Constraints discovered while deciding

- `cancel_participation` is service-role only and hard-deletes; it is reached today
  from the subscription-deleted webhook and from admin removal. The new RPC is a third
  caller, not a new ending.
- Only `family_subscriptions` has a foreign key to `participations` (cascade). Session
  records key on the participant, not the seat, so staff history survives a delete.
- The payment marker's column comment states it is null for rows predating the
  create-on-confirmation flow; those seats carry a subscription row instead, which is
  why the gate has two terms.
- The leave-waitlist RPC is the pattern: parent-authorized on `customer_id =
  auth.uid()`, product lock, re-read under the lock, hard delete, foreign rows answered
  as `not_found`. The testing round in August 2026 singled out its confirm dialog as
  clear, so the same dialog shape is used.
- The per-participation subscription-state RPC is shared with the gamer audience and
  returns only the two badge statuses today; widening it is additive but the gamer's
  card must keep ignoring it.
- The enrollment card has three audiences: parent-of-child, self (an adult holding
  their own seat) and gamer. Billing affordances ride the arm the first two share.
- There is no audit table; admin routes write structured log lines for hosted log
  aggregation, and this route does the same.
