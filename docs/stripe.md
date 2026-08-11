# Stripe

Manual test cards for local/staging checkout, the failed-payment account setting the seat model depends on, the refund and VAT-audit procedures finance runs against the live account, plus the products-webhook deployment runbook across environments.

## The failed-payment end-action must stay "cancel the subscription"

Dashboard → Settings → Billing → Subscriptions and emails → failed-payment retries. When Stripe exhausts its dunning retries, the end-of-dunning action must remain **cancel the subscription** — not "mark the subscription as unpaid".

Releasing a club seat is driven entirely by `customer.subscription.deleted`; that event is the only thing that cancels a participation. Choose "mark as unpaid" (or pause a subscription instead of cancelling it) and Stripe never fires it, so a child who has stopped paying keeps an active seat indefinitely. The failure is silent from both ends: the stored subscription status also stops updating, because the status column's CHECK rejects Stripe's `unpaid`/`paused` values and the webhook does not surface that rejected write.

Verified against the live account 2026-07-27: no subscriptions sit in `unpaid`, and dunning-exhausted subs carry cancellation reason `payment_failed`.

## Refund via a credit note against the invoice, never a raw refund

There is no refund flow in Sogverse and none is planned — an admin refunds in the Stripe dashboard. **Open the invoice for the purchase and issue a credit note against it.** Do not press refund on the charge or the payment intent.

A Stripe refund reverses money and describes nothing about it: the refund object carries no tax fields and no discount fields at all. So a raw refund leaves the VAT inside that money permanently over-remitted, and a promotion code that reduced the sale unaccounted for. That is the state 2026's refunds are in: roughly €1,575 reversed across the year with no VAT reversal recorded anywhere, and no invoice behind the one-off sales among them to credit after the fact. A credit note carries the tax breakdown and the discount lines, so it reverses both, and it is the object a VAT return can be built from. It needs an invoice to credit against, which is why one-off checkouts now create one (see the webhook section below).

Refunds are the one money movement not recorded in our own tables — Stripe is the system of record for them, and no in-app state may promise a refund.

## The monthly VAT audit

Every sale now goes through a Stripe product we own, and each of those carries an explicit tax category, so the rate Stripe charged is *computed from* a field finance can see rather than declared beside it. (Sales predating that change went through throwaway products Stripe auto-created per checkout, which is why a camp could be billed at the standard rate — audit periods before the deploy knowing that.) What remains is small:

- **Monthly, export the period's sales and group by product.** Check the rate column: every camp at Finland's reduced rate (13.5% today), everything else at the standard rate (25.5% today). One row out of line is the whole check — there is nothing else to reconcile.
- **A 0% row is not a defect.** The live account holds exactly one tax registration: Finland, standard, no One-Stop-Shop. UK customers are therefore charged nothing, and EU customers outside Finland are charged Finnish VAT rather than a destination rate. A UK sale at 0% is correct, and treating it as an error is the commonest way to misread this export.
- **Before a product goes on sale, read its tax category off the Stripe product.** It is a visible field there, so a camp not carrying the reduced-rate category is catchable at the catalogue rather than a month later in the export — which is the only failure this check still has to look for. Expect the reduced-rate category's Stripe label to read oddly against a children's camp: the CFO's ruling names the category, not its label, and the mapping module under `src/lib/stripe/` is where that ruling is recorded.

**There is deliberately no in-app discrepancy checker**, and building one is not a follow-up. "The rate disagrees with what we intended" stopped being possible once the tax category sits on the product; the only remaining failure is "a new product never got a category", which the pre-sale check above catches, and a checker would additionally cry wolf on every legitimate 0% UK sale.

## The Stripe product backfill script

`scripts/` carries the Stripe product backfill: a re-runnable one-shot that walks the Stripe products we own — identified by a `product_id` key in their metadata — and writes the name, tax category and metadata the Sogverse catalogue says they should have. It has a report-only mode; run that to confirm no product carrying that metadata key is missing a tax category, which is the assumption the audit above rests on. Run it separately against test and live, and note the live key on a developer machine may be restricted and need product read and write access granted first.

Two things decide when it runs:

- **The first live run happens *before* the code deploy, not after.** Club products that carry no tax category become explicit in one pass, rather than self-healing one price change at a time. It does nothing for camps — a camp has no Stripe product to backfill, because its product is created by the checkout code at first purchase — so do not treat the backfill as protecting the camp path.
- **It is the standing answer to club drift.** A consumer club revisits its Stripe product only on its first sale and on a price change, so a club renamed, retimed or moved to another spoken language can carry stale values on Stripe indefinitely. Re-run the backfill whenever club catalogue data has moved. The tax category is the one field that cannot silently drift, because nothing changes it after creation.

Throwaway per-checkout products that Stripe minted for past camp sales carry no `product_id` metadata and are left alone: those sales are closed and their invoices already record the tax that was applied.

## Test Mode Card Details

- **Card number:** `4242 4242 4242 4242`
- **Expiry:** Any future date (e.g. `12/26`)
- **CVC:** Any 3 digits (e.g. `123`)

## Other Test Cards

| Scenario | Card Number |
|---|---|
| Successful payment | `4242 4242 4242 4242` |
| Requires authentication (3D Secure) | `4000 0025 0000 3155` |
| Declined | `4000 0000 0000 0002` |
| Insufficient funds | `4000 0000 0000 9995` |

See [Stripe testing docs](https://docs.stripe.com/testing) for the full list.

## Products webhook deployment across environments

Three Vercel environments → three webhook endpoints. Stripe distinguishes test vs live mode; Vercel distinguishes preview / production. The two axes intersect like this:

| Vercel target | Vercel URL | Stripe mode | Webhook scope |
|---|---|---|---|
| Preview (feature branch) | `sogverse-git-<branch>-kyle-sogs-projects.vercel.app` | test | one endpoint per long-lived branch |
| Preview (`dev` branch → staging) | `sogverse-git-dev-kyle-sogs-projects.vercel.app` | test | one endpoint that sticks for staging |
| Production (`main`) | the production custom domain | **live** | one endpoint, separate signing secret |

The Vercel CLI defaults to no branch scope (env var applies to *all* preview deployments). The Stripe CLI defaults to **test** mode (must pass `--live` for production). Both defaults are intentional here — don't override them without a reason.

The path is always `/api/webhooks/stripe/products`. The events are always:

```
checkout.session.completed
checkout.session.expired
invoice.paid
customer.subscription.updated
customer.subscription.deleted
```

(`charge.refunded` was deliberately removed from the lists and commands here when the
write-only refunds ledger was dropped — the route answers it 200 unhandled, so
subscribing to it only produces noise.)

**One-off checkouts now create invoices, and this event list is unchanged by that — say no to the reflex to extend it.** Single-payment sessions (camps, paid events) enable invoice creation so that a refund can be issued as a credit note. Nothing in Sogverse reads an invoice or credit-note lifecycle, so no invoice-creation or `credit_note.*` event belongs on any of the endpoints below; subscribing speculatively only produces the same 200-unhandled noise `charge.refunded` did. `invoice.paid` stays on the list for subscriptions, and its handler returns early on an invoice with no subscription — so a one-off invoice writes no second payment row.

Stripe creates the checkout invoice **asynchronously**, so the session's invoice reference can still be null when `checkout.session.completed` arrives, and the local payment row's invoice id then stays null. That is accepted, not a gap to close with a backfill webhook: Stripe is the finance source of record for invoices, and finance reads Stripe rather than our tables.

### Two traps in the commands below

- **Live-mode writes (create/delete) need `--confirm`.** Without it the CLI aborts silently in a non-interactive shell — no error, no endpoint, exit 0.
- `webhook_endpoints create` returns the `whsec_…` **only in the creation response**. It cannot be retrieved afterwards; if it's lost, delete the endpoint and recreate it.

Local CLI auth (device key provisioning, live-mode grants) is per-machine setup, not repo procedure — it isn't documented here.

### Environment variable names

- `STRIPE_PRODUCTS_WEBHOOK_SECRET` is the signing secret the products webhook verifies against. It is **not** `STRIPE_WEBHOOK_SECRET` — that's a dead name from the retired Sorg-era webhook, and a stale copy of it was once found lingering in prod.
- `STRIPE_SECRET_KEY` is used everywhere else.
- There is **no publishable key in use.** Checkout and the billing portal redirect to server-created session URLs, so no client-side Stripe.js loads and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is not read anywhere. Don't reintroduce it without a client-side Stripe need.

**1. Preview (feature branch on PR open).** Repeat this if a future feature branch needs its own webhook.

```bash
# Test-mode webhook pointing at the branch preview URL
stripe webhook_endpoints create \
  --url "https://sogverse-git-<branch>-kyle-sogs-projects.vercel.app/api/webhooks/stripe/products" \
  --description "products webhook (preview)" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=checkout.session.expired" \
  -d "enabled_events[]=invoice.paid" \
  -d "enabled_events[]=customer.subscription.updated" \
  -d "enabled_events[]=customer.subscription.deleted"

# Capture the whsec_... from the response, then:
printf '%s' 'whsec_...' | vercel env add STRIPE_PRODUCTS_WEBHOOK_SECRET preview --sensitive

# Trigger a redeploy of the preview so the env var lands (empty commit or dashboard "Redeploy")
```

**2. Staging (when this PR merges to `dev`).** The `dev` branch's preview URL is stable but a different host than the feature-branch preview, so the existing webhook needs to be re-pointed (or a fresh one created and the old one deleted). Re-pointing is simpler — the signing secret stays the same and Vercel needs no change.

```bash
# Re-aim the existing test-mode endpoint at the staging URL
stripe webhook_endpoints update we_<id-from-step-1> \
  -d "url=https://sogverse-git-dev-kyle-sogs-projects.vercel.app/api/webhooks/stripe/products"
```

If the feature-branch preview also still needs to work (e.g. another PR is open against `dev` and we want both to fire), create a second endpoint instead of updating, and add the new secret to Vercel preview *scoped to that branch*: `vercel env add STRIPE_PRODUCTS_WEBHOOK_SECRET preview <git-branch> --sensitive`. Branch-scoped overrides take precedence over the unscoped preview value.

After the merge, smoke-test against staging: club sub purchase, single-payment camp purchase, waitlist join, refund.

**3. Production (cut from `dev` to `main`).** Brand new live-mode endpoint, brand new signing secret in Vercel's `production` env. Do **not** reuse the test-mode secret in production.

```bash
# Live-mode webhook against the production domain
stripe webhook_endpoints create --live \
  --url "https://<prod-domain>/api/webhooks/stripe/products" \
  --description "products webhook (production)" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=checkout.session.expired" \
  -d "enabled_events[]=invoice.paid" \
  -d "enabled_events[]=customer.subscription.updated" \
  -d "enabled_events[]=customer.subscription.deleted"

# Capture the live whsec_... and store it in Vercel production
printf '%s' 'whsec_...' | vercel env add STRIPE_PRODUCTS_WEBHOOK_SECRET production --sensitive

# Redeploy production so the env var binds
vercel redeploy <prod-deployment-url> --prod
```

After cut-over, send one real `$0.50`-class purchase through to confirm the live webhook is wired before announcing.

**What `.env.local` does NOT need.** `STRIPE_PRODUCTS_WEBHOOK_SECRET` is not required in `.env.local` for normal local dev. `stripe listen --forward-to localhost:3000/api/webhooks/stripe/products` prints a fresh `whsec_...` per session — paste that into the running process's env or your shell, not into committed-template files. `.env.local.example` documents the variable name only. Do **not** check in any real `whsec_...` value.
