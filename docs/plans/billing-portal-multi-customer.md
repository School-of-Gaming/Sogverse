# Billing portal: route per subscription, and handle parents with several Stripe customers

## Problem

`customer_profiles.stripe_customer_id` holds **one** Stripe customer per parent, and the billing
portal route resolves the customer from the **parent's user id**. Chargebee created a separate
customer record per enrolment, so parents migrated from it own **several** Stripe customers — one
per child/club. Only the bound one is reachable; the rest are invisible in the portal.

**This is not a billing bug.** The Stripe webhook finds subscription rows by
`stripe_subscription_id`, never by customer, so renewals, dunning, cancellation and seat teardown
all work correctly on the unbound customers. Money arrives and seats free up. What's broken is
**self-service management**.

The harmful case is the payment-problem badge. It is rendered per participation, but it opens the
*parent-level* customer's portal. For a parent with several customers it therefore announces a
payment problem on one child's club and then opens a page where that subscription **isn't listed** —
they update a card that wasn't failing, the real subscription keeps failing, and it ends in
involuntary cancellation.

## Scale

- **12 families** in live Stripe have more than one customer holding a live subscription (worst
  case: four customers, four subscriptions, one parent).
- **0 Sogverse parents are affected today** — every parent currently has exactly one adopted
  subscription. The first real cases appear as club migrations continue: a parent with a
  Sogverse-native subscription *and* a migrated one holds them on two different customers.
- Each migrated customer holds **exactly one** subscription (an artifact of Chargebee's
  customer-per-enrolment model), so for affected parents "the customer page" and "the page for
  that subscription" are the same page.

## Decision

**Single button is the standard case. Multiple buttons are the migrated edge case.**

The overwhelming majority of parents have one Stripe customer and keep today's single
"Manage billing" button, unchanged. Parents with several customers get **one button per Stripe
customer**, plus a short line of UI explaining why there is more than one and which children each
covers.

Enumerate a parent's customers as the distinct `stripe_customer_id` values across their
`family_subscriptions` rows, together with the value on their customer profile. One distinct value
→ render exactly today's single button. More than one → render one button per customer.

## Rejected alternatives — do not rebuild these

- **Consolidating the customers in Stripe (cancel each stranded subscription and recreate it on
  the bound customer).** Stripe cannot move a subscription between customers — the customer field
  is not updatable, and there is no customer-merge feature — so this means cancel-and-recreate on
  live subscriptions. That changes billing anchors, risks double-charging or gifting free months
  unless each new subscription's trial end is aligned to the old period end, loses the Chargebee
  metadata used to reconcile against the old platform, and must be repeated every time another club
  migration surfaces more legacy customers. Rejected: high risk to live revenue to fix a
  self-service gap.
- **One Stripe page showing all of a parent's customers.** Impossible — a portal session is created
  for exactly one customer.
- **Linking each row to a per-subscription page.** The portal has no per-subscription landing page;
  its deep links are task flows only. Invoice history, payment methods and customer details exist
  solely on the customer page, so flow-only links would remove the parent's access to receipts.
  Those things are also genuinely customer-level — one card and one invoice stream can back several
  subscriptions — so a per-subscription split would misrepresent the data.
- **Listing every subscription as its own button for all parents.** For the common case of several
  subscriptions on one customer, every button would open the same page, which reads as broken.
- **Designing away the multi-button confusion.** Accepted as-is. The affected population shrinks as
  legacy subscriptions churn onto Sogverse checkout, and the enumeration is data-driven, so the
  extra buttons stop rendering on their own once a family is down to one customer. Not worth more
  design investment.

## Steps

1. **Badge routing (do this first — it stands alone and fixes the harmful case).** Have the
   payment-problem badge tell the portal route which participation it is for. The route resolves
   that participation's `family_subscriptions.stripe_customer_id` and opens *that* customer's
   portal. With no participation supplied, behaviour is exactly as today, so parents who have never
   purchased still get a lazily-provisioned customer.
   - **Authorize the lookup**: confirm the participation belongs to the calling parent before using
     its customer id. Accepting a caller-supplied id without that check is an IDOR hole that would
     open another family's billing portal.
   - Land them directly on the card form using the portal's payment-method-update flow — the badge
     already knows the intent is "this card failed".
2. **Enumerate customers for the billing card.** Return the parent's distinct Stripe customer ids
   with, for each, the children/clubs whose subscriptions sit under it.
3. **Render.** One customer → today's single button, unchanged. More than one → a button per
   customer, each labelled with the children it covers, above them a short explanation that the
   family's subscriptions are split across more than one billing account for historical reasons.
4. **Translate** every new string into `en`, `fi`, `sv` and `tlh`. No emoji in message files — use
   a `lucide-react` icon beside the text if a glyph is needed.
5. **Demo it** on `/admin/ui-components`: the single-button case and the multi-customer case, both
   driven by fixtures.

## Acceptance criteria

- A parent with one Stripe customer sees a UI identical to today's.
- A parent with several sees one button per customer, each labelled, with an explanation.
- Clicking the payment-problem badge opens the portal for **the customer that owns the failing
  subscription**, on the card-update form.
- Requesting the portal for a participation belonging to another family is rejected.
- A parent with no subscriptions still gets a working portal.

## Constraints that shaped this

- A Stripe billing portal session is scoped to exactly one customer.
- A subscription cannot be moved between Stripe customers, and customers cannot be merged.
- Portal deep links are task flows (payment-method update, subscription cancel), not pages.
  Plan switching is deliberately disabled in our portal configuration and must stay disabled.
- Enumeration only sees customers whose subscriptions have been **adopted** into
  `family_subscriptions`. A legacy subscription that was never adopted stays invisible until its
  child is enrolled — acceptable, because it only matters once they are, but do not expect this UI
  to surface unknown subscriptions.
- **When splitting a bundled multi-club subscription, put the resulting subscriptions on the same
  Stripe customer.** Otherwise a split needlessly pushes a parent into the multi-customer case.
