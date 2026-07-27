# Stripe

Manual test cards for local/staging checkout, the failed-payment account setting the seat model depends on, plus the products-webhook deployment runbook across environments.

## The failed-payment end-action must stay "cancel the subscription"

Dashboard → Settings → Billing → Subscriptions and emails → failed-payment retries. When Stripe exhausts its dunning retries, the end-of-dunning action must remain **cancel the subscription** — not "mark the subscription as unpaid".

Releasing a club seat is driven entirely by `customer.subscription.deleted`; that event is the only thing that cancels a participation. Choose "mark as unpaid" (or pause a subscription instead of cancelling it) and Stripe never fires it, so a child who has stopped paying keeps an active seat indefinitely. The failure is silent from both ends: the stored subscription status also stops updating, because the status column's CHECK rejects Stripe's `unpaid`/`paused` values and the webhook does not surface that rejected write.

Verified against the live account 2026-07-27: no subscriptions sit in `unpaid`, and dunning-exhausted subs carry cancellation reason `payment_failed`.

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
charge.refunded
```

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
  -d "enabled_events[]=customer.subscription.deleted" \
  -d "enabled_events[]=charge.refunded"

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
  -d "enabled_events[]=customer.subscription.deleted" \
  -d "enabled_events[]=charge.refunded"

# Capture the live whsec_... and store it in Vercel production
printf '%s' 'whsec_...' | vercel env add STRIPE_PRODUCTS_WEBHOOK_SECRET production --sensitive

# Redeploy production so the env var binds
vercel redeploy <prod-deployment-url> --prod
```

After cut-over, send one real `$0.50`-class purchase through to confirm the live webhook is wired before announcing.

**What `.env.local` does NOT need.** `STRIPE_PRODUCTS_WEBHOOK_SECRET` is not required in `.env.local` for normal local dev. `stripe listen --forward-to localhost:3000/api/webhooks/stripe/products` prints a fresh `whsec_...` per session — paste that into the running process's env or your shell, not into committed-template files. `.env.local.example` documents the variable name only. Do **not** check in any real `whsec_...` value.
