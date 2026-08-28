# Slack Integration — purchase notifications

**Purchase notifications to the internal staff channel** are live, and **no Sogverse code
runs in the path**: a Stripe Dashboard Workflow reads Checkout Session metadata and the
Stripe app for Slack posts the message. Sogverse's only contribution is writing the
metadata when it creates the session. Everything you might change is in the Stripe
Dashboard, not in this repo — do not build an app-side helper to get these notifications.
(Sogverse sending a Slack message *itself* is a separate, unbuilt idea: see
`../investigations/slack-sending-from-sogverse.md`.)

## Shape of the mechanism

- A **Stripe Dashboard Workflow** triggers on a Stripe event, optionally retrieves related
  Stripe objects, and posts a templated message through the first-party **Stripe Workflows
  for Slack** app.
- Stripe owns the message. There is no route, no bot token, and no Slack secret anywhere in
  Sogverse for this path.
- **Sogverse's half of the contract is metadata on the Checkout Session** — everything the
  message says that Stripe does not already know comes from there.

## One-time setup

1. Install **Stripe Workflows for Slack** from the Stripe App Marketplace.
2. Connect the Slack workspace in the app's settings.
3. `/invite @Stripe` into the target channel — the app only lists channels it is a member
   of, so the workflow's Slack action cannot see the channel until this is done. The action
   then picks it from a dropdown.

**The workflow that posts to the staff channel is live-mode only.** A test-mode copy pointed
at the same channel would post every staging and local development checkout to it.

To iterate on a workflow, build a test-mode or sandbox copy pointed at a **scratch channel**,
and repoint to the staff channel only once the message reads correctly. Two ways to feed it:

- `stripe trigger checkout.session.completed` with `--add
  checkout_session:metadata[key]=value` for each key — fast, no deploy, and the right loop for
  wording and for settling the unverified mechanics below. A synthetic fixture does not fill
  `customer_details`, so name and email render empty here.
- A real test-mode checkout against a running build — slower, and the only test that proves the
  metadata keys the code actually writes match the names the template reads.

Account limit: 50 workflows in total, all of which may be active. Workflows have drafts,
versioning, and per-run observability in the Dashboard — a failed run is diagnosable there.

## Why there is no raw Stripe → Slack webhook

- Stripe delivers raw event JSON; a Slack **incoming webhook** accepts only a
  `{"text": …}` / Block Kit body and rejects anything else. Pointing a Stripe webhook
  endpoint at a `hooks.slack.com` URL therefore cannot produce a readable message — nothing
  sits in between to reshape the payload.
- Formatting requires something that owns the payload: a Stripe Workflow (no code) or one of
  our own routes (code). We chose the workflow.
- **An incoming-webhook URL is a bearer secret** — anyone holding it can post to the
  channel. Never commit one, and never paste one into a doc, a test, or a comment.

## Trigger

- **Use `checkout.session.completed`.** It covers both subscription purchases (clubs) and
  one-off purchases (camps, events). Be precise about what it means, though: it fires when
  *Checkout* completes, **not** when payment settles. The two coincide for a card, but the
  checkout route pins no payment methods, so which ones Checkout offers is a Dashboard
  setting — enable an asynchronous method (SEPA Direct Debit, Klarna, Bacs) and a completed
  session arrives with `payment_status: "unpaid"`, confirmed minutes or days later by a
  different event.
- **Do not use `customer.subscription.created` even so.** The point above weakens the case
  for session completion without overturning it: subscription creation is no better on
  settlement, and it is worse on a count session completion has no trouble with at all —
  one-off purchases create no subscription, so they would never appear. Session completion
  is the only trigger that sees every purchase; the settlement gap is closed by the
  condition below, not by choosing a different event.
- **Condition the trigger on two things: that the purchase is ours, and that it settled.**
  - `metadata.productId` is present. The Stripe account also carries subscriptions from a
    legacy billing migration, hand-created subscriptions, and an older storefront; an
    account-level trigger fires for all of them. That metadata key is what marks a purchase
    as ours.
  - `payment_status` is `paid` — **or** the session is in `subscription` mode and its
    `payment_status` is `no_payment_required`. This mirrors the rule our own purchase
    webhook applies before it creates a participation, and the two have to agree. The
    widening is per *mode*, not per reason: a club whose first charge is deferred to its
    start date and a full-discount promotion code both legitimately collect nothing today
    while creating a live subscription that bills later, whereas a one-off purchase that
    collected nothing has bought nothing.

  This matters because **the channel should announce exactly what the database did.**
  Without the payment condition the workflow announces purchases that produced no
  participation — an asynchronous payment still unpaid, or a zero-collecting one-off
  session — and staff have no way to tell those messages from real signups.

## What a Stripe event payload can and cannot tell you

This is the part most likely to be re-learned the hard way.

- **Event payloads carry ids, not names, and never expand references.** A Checkout Session
  gives you `cus_…` and (for subscriptions) `sub_…` — no customer name, no product name.
- **`line_items` is absent from a Checkout Session payload.** There is consequently no
  Stripe product id anywhere in the event and no way to build a Stripe product link
  directly from it. A workflow can reach one indirectly by retrieving the subscription
  (clubs) or the invoice (one-off purchases) and reading the price's product.
- **`customer_details.name` and `customer_details.email` *are* on the session** — Checkout
  collects them for Stripe Tax — so a customer name and email need no retrieve step.
- Anything a message says must therefore be one of three things: a field on the trigger
  object, something reachable via a `Retrieve a …` workflow step, or a value written into
  metadata at creation time.

## The metadata contract

The Checkout Session's metadata is the interface between Sogverse and the workflow. Some
keys are load-bearing for our own code — the products webhook and the paid-confirmation page
read `purchaseShape`, `customerId`, `participantId`, `productId` and `currency` by name.

These five exist **only** for the Slack workflow and have **no reader in this repo, by
design**:

| Key | Contents |
|---|---|
| `productName` | The product's name, resolved at the **default locale** |
| `productType` | The raw enum — `consumer_club`, `municipality_club`, `camp`, `event`. A template wanting prose must map it. Can also gate trigger conditions |
| `adminProductUrl` | Complete absolute URL to the product in the admin dashboard |
| `adminUserUrl` | Complete absolute URL to the purchasing customer in the admin dashboard |
| `shopProductUrl` | Complete absolute URL to the product's public shop page |

**`productName` is at the default locale, never the buyer's** — the staff channel needs one
stable heading per product, and the buyer's locale would file the same club under different
names depending on who bought it. (The customer-facing subscription `description` is the
opposite case and stays in the buyer's locale.)

**Sogverse hands Stripe the finished link, not the ingredients.** A workflow message
template substitutes variables but cannot map a value onto a URL shape, so sending a product
*type* would mean re-implementing our admin-URL mapping by hand in the Dashboard, outside
the repo, where nothing can check it. The routing helper that maps a product type to its
admin URL is an exhaustive switch — a new product type fails to compile until the mapping is
extended — and preserving that tripwire is the whole reason the URL is built here.

**Absolute URLs in metadata derive their origin from `getOrigin(request)`,** never from the
raw `Host` header — the same rule that governs emailed links. Staff click these links, so a
spoofed origin is a phishing vector aimed at our own team.

**Accepted trade: these URLs freeze at purchase time.** Restructuring admin routes later
leaves the code correct while links in already-posted messages go stale. Acceptable because
such a message is read within minutes of the purchase.

## Message template mechanics

- Slack mrkdwn is supported: `*bold*`, `_italic_`, `~strike~`, inline and fenced code, block
  quotes, `:emoji:`, and lists. Line breaks are preserved.
- Hyperlinks are `<url|display text>`. Mentions use Slack ids, not display names.
- **`Include dashboard link` gives exactly one native Stripe deep link**, keyed to a single
  object id. Any further Stripe links must be written into the template by hand.

Two mechanics are **unverified** — confirm them in a sandbox before relying on either:

- whether a variable interpolates *inside* a URL string;
- the exact variable path the Dashboard's picker uses for metadata keys.

## Operational cautions

- **The channel is not a complete signup feed — only paid Stripe checkouts appear.** A free
  product, a municipality (externally-contracted) club and a waitlist join all confirm their
  registration without a Checkout Session ever being created, so no Stripe event exists for
  the workflow to trigger on and none of them can ever post. Staff watching the channel
  would otherwise read silence as "nobody signed up".
- **A duplicate payment posts an ordinary-looking success message.** When a family completes
  two checkouts for the same seat, our webhook cancels the duplicate subscription and
  records it for a manual refund — but the workflow triggers on session completion and posts
  a normal purchase message for it. Staff see two indistinguishable messages for one
  product.
- **The amount is what that session collected, not the product's price.** A club whose first
  charge is deferred to its start date collects nothing today, and a full-discount promotion
  code does the same — both render as a zero amount. A partial promotion or a proration
  shows a reduced figure rather than the list price.

## Metadata visibility

- **Metadata is never shown to customers** — absent from Checkout, receipts, invoices and
  the billing portal. It *is* visible to anyone with Stripe Dashboard access, and now to
  everyone in the Slack channel.
- The customer-visible sibling field is the object's `description`, which parents do read in
  the hosted billing portal.
- Put nothing sensitive in either.
