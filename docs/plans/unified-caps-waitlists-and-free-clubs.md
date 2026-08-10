# Unified seat caps, waitlists, and free billing across all product types

Unlock the admin form's seat-count and waitlist controls for every product type, and
the free/paid billing choice for consumer clubs — the features currently locked to
municipality clubs (caps/waitlist) and events (free). The unlock rests on one policy
decision that makes the hard technical problems disappear: **a seat cap is a hard cap
on no-charge products and a soft cap on paid ones**, and the messy payment cases that
remain (an unpaid family promoted off a waitlist, a subscribed family demoted onto
one) are handled with **explanatory UI dialogs under the admin-trust model**, not new
payment flows.

## Problem

The admin product form pins seat count and waitlist off for consumer clubs, camps and
events (a `form-locks.ts` lock, muni-only unlock), and consumer clubs cannot be free
(`product-type-config.ts` pins their billing to paid, so the free/paid chooser never
renders). The business wants all three available for every type.

History that shaped this plan: the old pre-payment seat hold (`reserving` rows) was
removed by migration `00139_drop_seat_reservations.sql` — paid participations are
created by the Stripe webhook when money arrives, and the pre-Checkout call only
validates. Free-*event* caps were then unlocked once and re-locked because the shop
browse card could not express fullness. Both of those historical blockers are
re-decided here (see The decision, items 1 and 7).

## Scale

Current customer volume is low (hundreds of profiles). That number is load-bearing:
the soft-cap policy accepts overselling a paid product by however many parents sit in
concurrent Stripe Checkout sessions (~30-minute lifetime) on a nearly-full product —
at today's volume that is realistically 1–2 seats, resolved by an admin who can see
the overfill. **This is a volume-dependent assumption, not a mechanism guarantee.**
If a genuinely hot product launch ever becomes a thing, revisit before relying on it.

## The decision

1. **Seat caps become available on all four types, optional, with money-keyed
   semantics.** A cap on a no-charge signup (free product, muni registration) is a
   **hard cap**: the signup RPC validates the cap and writes the `active` row in one
   locked transaction, so it cannot be oversold. A cap on a paid signup is a **soft
   cap**: the pre-Checkout validation refuses new entrants once full, but the webhook
   confirmation deliberately does not re-check — anyone who passed the gate and
   completed Checkout gets their seat, even one over the cap. **This is exactly what
   the database already does** (`create_participation` gates every purchase shape
   above its billing branches, under the product `FOR UPDATE` lock;
   `confirm_paid_participation` never re-checks, by 00139's explicit design). The cap
   semantics need **no migration** — the policy is a re-decision of behaviour already
   shipped, plus form unlocks.

2. **Waitlists become available behind a cap on any type.** The two payment-messy
   operations get UI dialogs in the admin groups panel instead of new machinery:
   - **Promote of an unpaid family on a paid product** (dragging a waitlisted gamer
     into a group or unassigned): a dialog explains the family has not paid and must
     be contacted for payment first; the move is blocked. **The dialog's condition is
     "paid product AND the waitlisted row carries no payment marker"** (the
     participation's recorded Checkout Session id) — *not* the product's billing mode
     alone. The marker matters because demote preserves it: a camper who genuinely
     paid and was then demoted still carries their payment marker, so promoting them
     back is a plain drag, while a family who joined the queue without paying never
     has one and gets the dialog. Keying on billing alone would one-way-trap every
     demoted paid camper. The practical manual path (put in the
     dialog copy / admin's email): the seat that opened shows the product as open on
     the shop, so the family can leave the waitlist from their My SOG card and buy
     the seat through normal checkout — money arrives through the front door with
     all existing race handling. If admins hit this dialog often, that is the signal
     to build a real promotion-payment flow; until then the dialog prevents the
     accident (granting a free seat on a paid product).
   - **Demote of a subscribed family** (dragging an active member onto the
     waitlist): a dialog explains the move would strand a live Stripe subscription;
     blocked. Backed by a DB rule change (item 6).
   - Promotion on free/muni products stays the plain drag it is today. Promotion
     remains silent to the family (their card just changes state) — decided,
     acceptable.

3. **Consumer clubs become free-or-paid.** `product-type-config.ts` moves
   `consumer_club` billing from pinned-paid to the free/paid chooser events already
   have, defaulting to **paid**. A free club enrolls exactly like a free event (the
   RPC's free branch: instant `active` row, no Stripe) — the whole enrollment path
   already branches on `billing_mode`, not type, so this is a form change, not a flow
   change. Free clubs list on `/shop` under the existing Clubs filter with the
   existing free price display; no new discovery surface.

4. **Capacity defaults are keyed to the money, so "forgot to cap" cannot happen.**
   - **Municipality clubs: cap required.** The "no seat limit" option is removed for
     muni and validation refuses a blank cap. (Heal-on-write: an existing uncapped
     muni row will demand a cap on its next edit — check prod for such rows first so
     nobody is surprised.)
   - **Free products (clubs, events, future free anything): default to
     "limited seats" with an empty, required number.** The admin either types a
     number or actively selects "no seat limit" — an explicit decision, not a
     forget. Existing uncapped free events are untouched (no DB constraint, no
     forced heal).
   - **Paid products: default uncapped.** Soft caps are opt-in.
   - **Flipping billing to free mid-form forces capped mode on only if the form is
     currently uncapped** (switch to "limited seats" with the waitlist checkbox at
     its free default of on; leave any already-typed seat count untouched);
     flipping to paid leaves the capacity state entirely alone. The rule never
     blanks a value the admin typed — on the edit form, flipping a capped paid
     product to free keeps its stored cap. No other flip handling — caps and
     waitlists are legal on both sides now, so nothing needs clearing.

5. **No billing-flip guard.** An admin may flip a product's billing mode freely, even
   with participants. Consequences examined and accepted:
   - Free→paid: existing free enrollees keep their seats forever, unbilled.
     Accepted ("legacy pricing", even accidental).
   - Paid→free: existing subscribers keep being billed until they cancel.
     Accepted. The entire subscription lifecycle (portal cancel →
     `customer.subscription.deleted` → participation deleted, renewals recorded,
     dunning) is keyed to the Stripe subscription and the participation — nothing
     on those paths reads `billing_mode` — so nothing breaks or orphans. A paying
     family can self-migrate by cancelling and re-enrolling free (subject to the
     hard cap).
   - What actually protects sub integrity is item 6's per-participation rule, which
     keeps working after any flip precisely because it is keyed to the
     participation's subscription, not the product's current billing.

6. **All three type-keyed consumer-club refusals are re-keyed to what they actually
   protect.** Today three admin RPCs refuse `consumer_club` outright, and every one
   would wrongly block a *free* club:
   - **`demote_to_waitlist`** → refuse **"if moving this gamer to the waitlist would
     orphan a live Stripe subscription"** — i.e. when the participation has a live
     `family_subscriptions` row (the predicate `admin_remove_participation` already
     uses; copy it). This is the load-bearing one: a waitlisted row can be
     **deleted by the parent** via the leave affordance, which CASCADEs
     `family_subscriptions` and would orphan a still-billing sub — a parent-path
     integrity rule, which is why it stays in the database rather than becoming
     UI-only.
   - **`admin_remove_participation`** → drop the type refusal, keep its existing
     live-sub refusal. Without this, no family can ever leave a free club — there
     is no parent-facing cancel for free enrollments, so admin removal is the only
     exit, and a hard-capped free club could otherwise never free a seat.
   - **`admin_enroll_gamer`** → refuse only **subscription-shaped products**
     (`consumer_club` AND `billing_mode = 'paid'` — the one combination whose seat
     requires a subscription that admin enrollment cannot create). Comp-enrolling
     onto a free club becomes legal, exactly like the free events and camps the RPC
     already permits; the groups panel's add-gamer affordance follows the same
     predicate.
   The admin PATCH route's own consumer-club pre-check is dropped in favour of the
   RPC's answer (one predicate, one home); the route keeps its product read so the
   "product does not exist" 404 survives, and maps the demote refusal's error
   (raised with the same ERRCODE `admin_remove_participation` uses) to a clear
   message — normally unreachable, since the dialog blocks the drag first. The
   groups panel needs a per-participation has-live-sub flag in its snapshot RPC so
   the demote dialog can fire without an N+1.

7. **The shop surface carries no seat information on cards — which requires one
   removal, not zero changes.** Muni cards keep their seat bar (schools is the
   deliberate special case for known-scarce products). The browse card also has a
   dormant **"{count} seats" capacity hint for capped non-muni products** — it
   renders for no product today only because non-muni caps are locked, and the
   moment caps unlock it would print the *capacity* on every capped card (exactly
   wrong on a full one). **Remove that hint outright**, per the decision that shop
   cards carry no seat info; fullness is discovered on the details page, whose full
   panels (waitlist CTA / closed notice) already exist and are billing-agnostic.
   Known inherited behaviours, both accepted: a full-with-waitlist product's card
   looks like an open one until clicked (re-decided from the original event
   re-lock — acceptable by owner decision), and a full-without-waitlist card
   renders disabled/unclickable (existing behaviour, fine).

8. **The lost-the-last-seat race outcome is accepted as-is, because the page
   self-heals.** When a parent's signup bounces off the gate with `full`, the
   winner's seat is already written, the seat-count rollup has already updated, and
   the details page's existing Realtime subscription flips the panel to the full
   state within about a second — the parent sees "huh, it shows full now, I just
   missed it." No error UI is owed. The `full` outcome already clears the button's
   `committing` flag (verified — per the loading-state rule, `full` is a retry
   outcome), so nothing is built here; just don't regress it.

9. **Copy stays honest but minimal.** The waitlist "we'll email you" promise stays —
   admins really do handle contact manually, so the copy is true. Of the waitlist
   purchase-confirmation strings, exactly **one** is term-shaped ("keeps their place
   in line for the whole term" — the second next-step line); the heading and the
   other lines are type-neutral. Key that one line by product type: clubs *and muni
   clubs* keep the term wording (both are term products — muni already receives it
   correctly today), camps and events get their own variants ("for the camp" / "for
   the event"), all five locales. The confirmation view must be able to see the
   product type — verify it reaches that component and thread it if not. The two
   new dialogs need copy in all five locales. Per the style-guide demo rule, the
   dialogs earn no `/admin/ui-components` demo (one-off, settled copy) unless
   design iteration turns out to be wanted.

## Rejected alternatives

- **Reintroducing a pre-payment seat hold** for paid caps. The old `reserving` flow
  died of stranded rows (holds written before the Checkout Session existed, so
  nothing could expire them) and dual seat counts that disagreed; 00139's header is
  the record. A reclaimable redesign was considered and rejected as complexity the
  soft-cap policy makes unnecessary at our volume. **Do not add a hold as part of
  this work.**
- **Webhook-side cap re-check with automatic refund/demote of the loser.** Requires
  building an automated refund path the platform deliberately does not have
  (refunds are manual, in Stripe, and no state may promise one).
- **Hard mutual exclusion "paid ⇒ uncapped, free ⇒ capped."** Broke immediately on a
  real case: camps are paid, capped, no waitlist.
- **Restricting waitlists to no-charge products** (to keep promotion payment-free).
  Rejected as tech constraining a business case; the promote dialog blocks the
  accident instead and keeps product options open.
- **An RPC-level billing guard on `promote_from_waitlist`.** Deliberately not added:
  admins are trusted to act through the UI (the same trust model `form-locks.ts`
  documents), and the dialog is the guard. The architecture doc's "latent gap"
  paragraph about this must be rewritten to record it as a decided posture, not an
  outstanding hazard (see Steps).
- **A billing-flip guard (refuse flips while participations exist).** Rejected:
  flips are rare misclick fixes, grandfathering is accepted in both directions, and
  the sub machinery is flip-proof (decision 5).
- **Requiring a cap on every free product at the DB level.** Free events in prod are
  legally uncapped; the failure mode being prevented is *forgetting*, which the
  form default kills without a constraint.

## Constraints discovered while deciding

- `create_participation` seat-gates **every** purchase shape under the product
  `FOR UPDATE` lock, above its billing branches; `confirm_paid_participation`
  deliberately never re-checks (a refusal after payment is worse than one visible
  oversold seat). The soft/hard duality is emergent from this existing shape.
- `products.waitlist_enabled` defaults `true` in the DB; the form's build step
  derives `waitlist = uncapped ? false : checkbox`, healing on write. Keep that
  derivation.
- `update_product` nulls any editable column the form doesn't send — the form
  payload already carries `billing_mode`, `seat_count`, `waitlist_enabled`, so no
  new RPC plumbing, but any new field must reach the RPC in the same change.
- The subscription lifecycle (webhook handlers, portal, dunning-cancel releasing
  the seat) is keyed to the Stripe subscription / participation and never reads
  `billing_mode` — verified; this is what makes flips safe.
- `leave_my_waitlist_spot` hard-deletes the row and `family_subscriptions` is
  `ON DELETE CASCADE` — the reason the demote rule must live in the DB.
- The details page already subscribes to `product_seat_counts` over Realtime; the
  browse card does not (and doesn't need to — after the hint removal in decision 7,
  non-muni cards carry no seat info, and the muni bar reads the non-realtime counts
  it always has).
- The checkout route's shape×billing coherence checks include two *type*-keyed
  guards (single-payment vs subscription vs consumer club). They are **inert for a
  free club** — a free club's purchase shape resolves to `free` before any type
  branch — so a free club passes without touching them. **Do not "fix" them to be
  billing-keyed**; they are correct for the paid shapes as written.
- The detail panel already renders the seat bar for any capped product; only the
  browse card was muni-gated, and it stays that way.
- Overfull is a legitimate state now: anything computing seats-left must clamp at
  zero for families, and the admin groups panel should *show* the overfill
  (e.g. "22/20") rather than clamping it away.

## Steps

Each independently verifiable; DB work first so types exist for the UI work.

1. **Migration: re-key the three refusals + extend the groups snapshot.**
   Per decision 6: `demote_to_waitlist` swaps its consumer-club refusal for the
   live-sub refusal (copy `admin_remove_participation`'s predicate);
   `admin_remove_participation` drops its type refusal and keeps its live-sub one;
   `admin_enroll_gamer` narrows its refusal to `consumer_club AND billing_mode =
   'paid'`. All keep the guard-first shape the authorization spine requires.
   Extend `get_product_groups_with_details` so each participation carries a
   has-live-sub boolean — the function builds the participation object in three
   places (grouped, unassigned, waitlist); add the field to **all three** so the
   zod schema keeps one required shape (constant false on the waitlist branch,
   since a waitlisted row cannot carry a sub). Push, regen types, check
   `src/types/index.ts` aliases, update the groups contracts schema, and make sure
   a db test parses the new field.

2. **DB tests.** Demote refuses a subscribed participation on *any* type and
   succeeds on an unsubscribed free-club participation; admin removal succeeds on
   a free-club participation; admin enrollment succeeds on a free club and still
   refuses a paid club; soft-cap spec: on a full paid product,
   `confirm_paid_participation` still writes the over-cap seat and returns
   confirmed (pins the policy as executable spec); hard-cap behaviour is already
   covered. Push the branch — db tests run in CI only.

3. **Form unlocks + defaults.** In `src/components/admin/products/`: **delete** the
   `seatCount`/`waitlist` lock flags and everything that exists only to serve them
   — the disabled wiring in the billing section, the "stored capped row on a
   locked type" edit-path comment, the redundant-conjunct tripwire in the
   initial-state builder, the `formLocksFor` doc block about restoring a free/paid
   parameter, and the corresponding lock-matrix unit tests
   (`registrationTiming` stays the one muni-only unlock). Consumer club →
   free/paid chooser, default paid. Muni: the capped/uncapped radio collapses to a
   bare required seat-count field; blank cap fails validation with a **new**
   "seat count required" message key ×5 locales (the existing invalid-number key
   says the wrong sentence). Initial-state and billing-flip behaviour per
   decision 4. Update the form unit tests. Drop the admin PATCH route's
   consumer-club pre-check per decision 6 (keep the product read for its 404;
   repurpose the route's named integration tests — the "refuses a consumer club"
   test becomes the new refusal semantics, and the registry's named-test checks
   must stay satisfied). **Prerequisite before rollout:** query prod for uncapped
   muni club rows; if any exist, surface them to the owner and get caps set —
   heal-on-write will otherwise demand a number on their next edit.

4. **Groups panel.** Show the waitlist column for any waitlist-enabled product
   (drop the type exclusion). Pass `billing_mode` into the panel (it receives the
   product row's fields as props today, but not billing). Add the two dialogs —
   promote (paid product + waitlisted row without a payment marker) and demote
   (has-live-sub flag) — firing from the drag handlers; blocked drops write
   nothing. Un-hide the waitlist drop target for clubs; the add-gamer affordance
   follows decision 6's enroll predicate. Overfill display: the panel's own header
   count renders unclamped over-capacity (e.g. "22 of 20 seats — 2 over", new key
   ×5); the shared seat-availability bar keeps its clamp — it serves families and
   must never show negatives. Dialog copy ×5 locales.

5. **Shop pass.** Remove the browse card's capacity seats-hint (decision 7) and its
   message key across locales. A free club end-to-end: form → `/shop` listing
   under Clubs with the free price display → free signup → confirmation. Add an
   integration test that a free club passes the checkout route (see Constraints
   for why the type-keyed guards are inert — write the test against that reason,
   and don't re-key the guards). Verify seats-left clamps at zero on the
   family-facing panel for an overfull product. Type-key the term-shaped waitlist
   confirmation line per decision 9, threading product type to the confirmation
   view if it doesn't already receive it.

   **Update the `/admin/ui-components` product-card section to show every card
   case clearly** (the browse card is a reused component, so it earns its demo
   under the style-guide gate; extend the existing card demo or add one). States
   to cover, driven by fixtures: muni with the seat bar (seats left, low seats,
   full), non-muni paid and free, capped full-with-waitlist (clickable, generic
   CTA), full-without-waitlist (disabled card), and pre-open countdown. Fixture
   ids feeding identicon avatars follow the hardcoded-UUID rule.

6. **Docs + TODO in the same change as the code they describe.**
   `docs/products-architecture.md`: rewrite §"Seat gate & the create-on-payment
   rule" (soft-cap policy replaces "expect to reintroduce a hold"; the admin-form
   lock sentence; the promote "latent gap" paragraph becomes the decided
   UI-dialog posture, with the payment-marker condition), §Waitlist (demote rule
   is sub-keyed; waitlists on all types; the "only consumer clubs are
   subscription-billed" reasoning survives, its conclusion changes), §Admin
   surfaces ("muni clubs are the one type that unlocks anything" is no longer
   true), and the model table's Capacity row. `TODO.md`: delete the "Event seat
   caps + waitlist: re-locked" section — its items are all resolved here (card
   affordance: hint removed + details-page fullness; seats-hint bug: removed;
   copy: type-keyed; fixtures: dropped — nothing is being redesigned, and the
   demo gate doesn't apply; visible-full-error: accepted, Realtime self-heal) —
   **except** the pre-open panel-swap layout shift, which stays as its own
   muni-scoped item (registration timing remains muni-only, so the swap is
   unreachable elsewhere; it is still a real bug on muni). Also delete the
   "decide what promotion looks like" item (decided: silent) and keep the
   waitlist-email note as is. Delete this plan file when the work lands.

## Acceptance criteria

- Admin can create: a capped paid camp; a capped free club with a waitlist; a paid
  club with a soft cap; a free event still uncapped by explicit choice. The muni
  form refuses a blank cap.
- A free club is discoverable on `/shop`, enrolls without Stripe, and its full
  state (with and without waitlist) renders correctly on the details page; no
  non-muni card shows any seat information (the capacity hint is gone).
- Dragging a never-paid waitlisted gamer into a group on a paid product produces
  the contact-for-payment dialog and no write, while a demoted-after-paying camper
  promotes back with a plain drag; dragging a subscribed member onto the waitlist
  produces the orphaned-sub dialog and no write, and a direct RPC call for it is
  refused by the DB; both directions work plainly on a free club.
- An admin can remove a member from, and comp-enroll a gamer onto, a free club;
  both stay refused where a subscription is involved.
- CI green including db tests (new predicates + soft-cap spec), lint zero
  warnings, type-check clean; `schema.sql` untouched on the branch.
- The docs/TODO edits from step 6 land with the code, and the volume assumption
  behind soft caps is written into the architecture doc.
