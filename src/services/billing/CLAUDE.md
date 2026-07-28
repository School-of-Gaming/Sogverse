# Billing portal

Everything a parent does with money after checkout — payment methods, invoices,
cancelling a subscription — happens on Stripe's hosted Customer Portal. We only
create the session and hand back its URL. `src/services/billing` owns the one
question that makes that non-trivial: **which Stripe customer is this session
for?**

## A parent can own several Stripe customers

The old platform created a customer record **per enrolment**, so parents whose
clubs were migrated from it hold one Stripe customer per child/club rather than
one per family. A portal session is scoped to exactly one customer, so "the
parent's portal" is not a well-defined thing for them.

This is **not** a billing bug. The Stripe webhook finds subscription rows by
subscription id, never by customer, so renewals, dunning, cancellation and seat
teardown all work on the unbound customers. Money arrives and seats free up.
What breaks without deliberate routing is **self-service management** — and the
sharp edge is the payment-problem badge, which is rendered per participation:
routed by parent it announces a failure on one child's club and then opens a
page where that subscription isn't listed, so the parent updates a card that
wasn't failing and the real one runs to involuntary cancellation.

**Rule: The set of a parent's Stripe customers is the distinct
`stripe_customer_id` values across their `family_subscriptions` rows, plus the
one on their customer profile.** The profile's customer comes first and can
carry no subscriptions — it still holds their saved cards and invoice history.
The set is data-driven, so the extra buttons stop rendering on their own once a
family is back down to one customer.

Enumeration only sees customers whose subscriptions have been **adopted** into
`family_subscriptions`. A legacy subscription that was never adopted stays
invisible until its child is enrolled. Don't expect this to surface unknown
subscriptions.

## Routing a portal session

The portal route takes an optional target and authorizes it:

- **A participation** — "the subscription behind this club, for this child".
  Sent by the payment-problem badge, which knows the enrolment but nothing about
  Stripe. Resolves to that subscription's customer, and lands the parent
  directly on the payment-method-update flow (the badge only renders for a
  failing card, so the intent is already known).
- **A Stripe customer** — sent by the billing card when it renders one button
  per customer.
- **Nothing** — the parent's own customer, get-or-created so someone who has
  never purchased still reaches a working portal.

**Rule: Both named targets are caller-supplied and must be proved to belong to
the caller before a session is created.** A portal session for another family's
customer is a full billing-data leak. The ownership reads go through the
caller's own RLS-scoped client (never the service-role admin client), so
Postgres is the access gate and the explicit `customer_id` filters are the
second layer.

**Rule: A refused target is refused, never silently downgraded to the caller's
own customer.** Falling back would reintroduce exactly the wrong-page confusion
this routing exists to remove.

## UI shape

One customer → today's single unlabelled "Manage billing" button, unchanged.
More than one → a button per customer, each labelled with the children/clubs it
covers, under a short line explaining the split.

**Rule: The account list is resolved server-side in the dashboard's Server
Component, not fetched from the client.** The count decides how many buttons
render; resolving it after paint would turn one rendered button into three under
the parent's cursor. See the root `CLAUDE.md` layout rule.

## Do not rebuild these

- **Consolidating the customers in Stripe.** Stripe cannot move a subscription
  between customers (the field is not updatable) and has no customer-merge, so
  this means cancel-and-recreate on live subscriptions: changed billing anchors,
  risk of double-charging or gifting free months, loss of the metadata used to
  reconcile against the old platform, and a repeat every time another migration
  surfaces more legacy customers. High risk to live revenue to fix a
  self-service gap.
- **One Stripe page showing all of a parent's customers.** Impossible — a portal
  session is created for exactly one customer.
- **Linking each subscription to a per-subscription page.** The portal has no
  such page; its deep links are task flows only. Invoice history, payment
  methods and customer details live solely on the customer page — and are
  genuinely customer-level, since one card and one invoice stream can back
  several subscriptions.
- **A button per subscription for everyone.** For the common case of several
  subscriptions on one customer, every button would open the same page.

## Related constraints

- **The portal's card update does reach the subscription. Verified — don't
  re-derive it.** Stripe charges a subscription's own default payment method
  whenever it has one, and nearly all of ours do (checkout sets it, not just the
  migration), so "the portal only updates the customer" would mean a parent
  fixing a failing card changes nothing. It doesn't work that way: the portal
  sets the new card as the customer's default **and clears the subscription's
  override**, so the subscription falls through the precedence chain to the
  customer default — which is the card the parent just entered. Confirmed in
  test mode against the worst-case shape (subscription carrying an explicit
  payment method, customer carrying none). Stripe's portal documentation does
  not state this, which is why it is written down here.
- Plan switching is deliberately disabled in our portal configuration and must
  stay disabled — we use our own configuration, not Stripe's dashboard default,
  so the portal never offers tiers we don't sell.
- **When splitting a bundled multi-club subscription, put the resulting
  subscriptions on the same Stripe customer.** Otherwise the split needlessly
  pushes a parent into the multi-customer case.
