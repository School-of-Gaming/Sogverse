# Sorg Token Purchasing Architecture

Stripe-powered token purchasing system for customers to buy Sorg tokens via one-time purchases or monthly subscriptions. Supports multiple subscription tiers with in-place tier switching.

## Overview

Token purchasing uses a **webhook-driven fulfillment model**. The Stripe webhook handles all token crediting: `checkout.session.completed` credits tokens for initial purchases (one-time and first subscription payment), `invoice.paid` credits tokens for subscription renewals, and additional handlers manage status changes, tier switches, and cancellations. Stripe guarantees webhook delivery with automatic retries, ensuring tokens are always credited even if the customer closes their browser. The webhook processes in milliseconds, well before the browser finishes redirecting back from Stripe checkout, so the balance is already correct on page load.

**Packages are defined in Stripe, not in code.** Active Stripe Products with `tokenAmount` metadata are fetched at runtime and cached server-side. There are no hardcoded package definitions. Multi-currency prices (USD, GBP, EUR) are fetched per product.

## Component Map

```
Pages
├── /sorg             → Public landing page with <TokenPurchaseSection /> (async server component)
├── /checkout         → Auth-aware redirect: logged-in customer → Stripe, else → /login
├── /customer/sorg    → Dashboard: balance, subscription status, purchase cards, transaction history (async server component)
└── /customer/billing → Redirect to Stripe Billing Portal

Token components (src/components/tokens/)
├── TokenPurchaseSection  — Package cards + purchase flow + PurchaseFeedback overlay (client component, receives packages as props)
└── TransactionHistoryTable — Read-only ledger (date, amount, type, description, balance_after)

Customer components (src/components/customer/)
├── TokenBalanceCard        — Current balance display
└── SubscriptionStatusCard  — Active/canceled status, renewal date, manage/cancel/switch buttons

Providers (src/providers/)
└── token-rate-provider.tsx — TokenRateProvider context + useTokenRates() hook (base rates for token-to-currency display)

Hooks
└── src/hooks/use-auth-redirect.ts — Manages login → checkout redirect (allowlist: /checkout only)

Stripe product fetching (src/lib/stripe/)
├── products.ts  — getStripeProducts() (fetches + caches active products), getProductByPriceId() (validates priceIds)
└── utils.ts     — Pure utilities: getPackageSavings(), tokensToCurrencyDisplay()

API routes (src/app/api/)
├── checkout/tokens/route.ts                    — POST: create Stripe checkout session
├── checkout/subscription/route.ts              — GET: subscription details from Stripe
├── checkout/subscription/switch/route.ts       — POST: switch subscription tier
├── checkout/subscription/cancel/route.ts       — POST: cancel at period end
├── checkout/subscription/billing-portal/route.ts — POST: create Stripe portal session
├── webhooks/stripe/route.ts                    — POST: webhook for all token crediting, status/cancellation
└── admin/adjust-tokens/route.ts                — POST: manual admin adjustment

Service layer (src/services/tokens/)
├── tokens.service.ts  — TokensService class (DB queries + API fetches)
└── tokens.queries.ts  — React Query hooks (useTokenBalance, useSubscription, useSwitchSubscription, etc.)

Types (src/types/index.ts)
└── StripePackage — Product with multi-currency prices, token amount, and type (one_time | subscription)
```

## Stripe Product Configuration

Packages are defined as **Stripe Products** in the Stripe dashboard, not in code. Each product must have:
- `tokenAmount` metadata key (integer) — how many Sorg tokens the package grants
- One or more active Prices in supported currencies (USD, GBP, EUR)
- Prices with `type: "one_time"` for one-time packages or `type: "recurring"` for subscriptions

`getStripeProducts()` in `src/lib/stripe/products.ts` fetches all active products with `tokenAmount` metadata, groups their prices by currency, and splits them into `oneTimePackages` and `subscriptionPackages` (sorted cheapest-first by USD price). Results are cached in-memory for 5 minutes.

**Base rates** (price-per-token used for "value" display) are derived from the cheapest one-time package's price divided by its token amount, per currency.

## Data Flow

### Product data flow (server → client)

1. Async server components (`/sorg` page, `/customer/sorg` page) call `getStripeProducts()` at render time
2. Packages are passed as props to `<TokenPurchaseSection />` (client component)
3. The root layout calls `getStripeProducts()` and passes `baseRates` to `<TokenRateProvider />`
4. Client components use `useTokenRates()` to convert token amounts to currency display strings

### 1. One-time purchase (authenticated customer)

1. Customer clicks "Buy Now" on a package in `<TokenPurchaseSection />`
2. Component calls `POST /api/checkout/tokens` with `{ priceId, currency, returnPath }`
3. Server validates customer role, validates `priceId` against live Stripe products via `getProductByPriceId()`, creates Stripe Checkout session (mode: `"payment"`) with `metadata: { userId, tokenAmount, stripeProductId, packageType, currency }`
4. Browser redirects to Stripe Checkout
5. After payment, Stripe fires `checkout.session.completed` webhook → handler checks idempotency, calls `adjust_token_balance()` RPC
6. Stripe redirects browser to `{returnPath}?success=true`
7. Page loads with correct balance; `<PurchaseFeedback />` shows a static success banner

### 2. One-time purchase (unauthenticated user)

1. User clicks "Buy Now" on `/sorg` while not logged in
2. Component redirects to `/login?redirect=/checkout?package=<id>`
3. User registers/logs in → `useAuthRedirect()` fires `navigateAfterAuth()` → full page navigation to `/checkout?package=<id>` (redirect allowlisted to `/checkout` paths only)
4. Checkout page creates Stripe session with `returnPath: /sorg`, flow continues from step 3 of the authenticated flow

### 3. Subscription (initial)

1. Same as one-time purchase flow, but Stripe session uses mode: `"subscription"` and includes `subscription_data.metadata` with `stripeProductId`
2. The `checkout.session.completed` webhook credits tokens, stores `stripe_subscription_id`, sets `subscription_status = "active"`, and sets `subscription_tier` to the Stripe Product ID on `customer_profiles`

### 4. Subscription renewal (webhook)

1. Stripe fires `invoice.paid` event to `POST /api/webhooks/stripe`
2. Handler skips if `billing_reason === "subscription_create"` (first payment handled by `checkout.session.completed`)
3. Retrieves `userId` and `tokenAmount` from subscription metadata (metadata is updated on tier switch, so renewals always use the current tier's token amount)
4. Checks idempotency (existing transaction with `stripe_session_id = invoice.id`)
5. Calls `adjust_token_balance()` with `p_type = "subscription"`

### 5. Subscription tier switch

1. Customer clicks "Switch to this plan" in `<TokenPurchaseSection />`
2. Confirmation dialog → `useSwitchSubscription()` → `POST /api/checkout/subscription/switch` with `{ priceId }`
3. Server validates `priceId` belongs to an active subscription product, retrieves the current subscription from Stripe
4. Updates the subscription item's price with `proration_behavior: "none"` — the new tier starts on the next billing cycle
5. Updates subscription metadata (`tokenAmount`, `stripeProductId`) so future `invoice.paid` renewals credit the correct amount
6. Writes `subscription_tier` (Stripe Product ID) to `customer_profiles` immediately
7. Stripe fires `customer.subscription.updated` webhook → syncs `subscription_tier` from subscription metadata

### 6. Subscription cancellation

1. Customer clicks "Cancel Subscription" in `<SubscriptionStatusCard />`
2. Confirmation dialog → `useCancelSubscription()` → `POST /api/checkout/subscription/cancel`
3. Server calls `stripe.subscriptions.update(subId, { cancel_at_period_end: true })`
4. Stripe fires `customer.subscription.updated` webhook → profile status updated to "canceling"
5. At period end, Stripe fires `customer.subscription.deleted` → clears `stripe_subscription_id`, `subscription_status`, and `subscription_tier` on profile

### 7. Admin adjustment

1. Admin calls `POST /api/admin/adjust-tokens` with `{ userId, amount, description }`
2. Server verifies admin role, calls `adjust_token_balance()` with `p_type = "admin_adjustment"` and `p_admin_id`
3. Returns new balance and transaction ID

## Database Schema

### customer_profiles additions
```sql
token_balance          INTEGER NOT NULL DEFAULT 0 CHECK (token_balance >= 0)
stripe_customer_id     TEXT
stripe_subscription_id TEXT
subscription_status    TEXT    -- 'active', 'canceling', 'past_due', or NULL
subscription_tier      TEXT    -- Stripe Product ID of active tier, or NULL
```

### Token transactions table
```sql
token_transactions (
  id                      UUID PK DEFAULT gen_random_uuid(),
  user_id                 UUID FK → profiles(id) NOT NULL,
  amount                  INTEGER NOT NULL,
  type                    token_transaction_type ('purchase' | 'subscription' | 'admin_adjustment'),
  description             TEXT,
  stripe_session_id       TEXT,      -- idempotency key
  stripe_subscription_id  TEXT,
  admin_id                UUID FK → profiles(id),
  balance_after           INTEGER NOT NULL,
  created_at              TIMESTAMPTZ DEFAULT now()
)
-- Indexes: user_id, stripe_session_id, created_at
```

### `adjust_token_balance()` RPC (SECURITY DEFINER)

Atomically updates `profiles.token_balance` and inserts a `token_transactions` row in a single transaction. Returns `(new_balance, transaction_id)`. The `CHECK (token_balance >= 0)` constraint prevents negative balances. Called by the webhook and admin adjustment routes — all via `createAdminClient()`.

### RLS Policies

- **`token_transactions`:** Admin has full access. Authenticated users can SELECT their own transactions only. Inserts happen exclusively through the `adjust_token_balance()` RPC (SECURITY DEFINER bypasses RLS).
- **`profiles` token columns:** Only modifiable server-side via admin client. Browser client cannot update `token_balance`, `stripe_customer_id`, or subscription fields.

## Role Permissions

| Capability | Admin | Customer | Gamer | Gedu |
|---|---|---|---|---|
| Purchase tokens | - | Yes | - | - |
| Subscribe monthly | - | Yes | - | - |
| Switch subscription tier | - | Own | - | - |
| View own balance | - | Yes | - | - |
| View transaction history | - | Yes | - | - |
| Cancel subscription | - | Own | - | - |
| Manage billing (Stripe portal) | - | Own | - | - |
| Adjust any user's balance | Yes | - | - | - |

## Fulfillment Architecture

All token crediting happens exclusively through the Stripe webhook.

| Stripe Event | Action |
|---|---|
| `checkout.session.completed` | Credit tokens (initial purchase + first subscription), store Stripe customer/subscription IDs, set `subscription_tier` |
| `invoice.paid` | Credit tokens for subscription renewals (skips `subscription_create` to avoid double-credit) |
| `customer.subscription.updated` | Sync `subscription_status` and `subscription_tier` from subscription metadata |
| `customer.subscription.deleted` | Clear `stripe_subscription_id`, `subscription_status`, and `subscription_tier` |

**Idempotency:** Both token-crediting handlers check `stripe_session_id` in `token_transactions` before crediting. A `UNIQUE` constraint on `stripe_session_id` provides database-level protection against concurrent deliveries.

## Environment Variables

| Variable | Side | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | Server | Stripe API authentication |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Both | Stripe client-side identification |
| `STRIPE_WEBHOOK_SECRET` | Server | Webhook signature verification |

## Future Improvements

### Paginate transaction history
`TokensService.getTransactions()` fetches all rows with no `.limit()`. For users with long purchase histories this will degrade. Add server-side pagination (cursor or offset-based) and update `TransactionHistoryTable` to support it.

### Handle `trialing` subscription status
`getSubscriptionState()` treats all unrecognized Stripe statuses (including `trialing`) as `{ status: "none", hasActiveSubscription: false }`. If trial periods are offered, this would allow users to purchase a duplicate subscription while trialing. Add an explicit `trialing` case to the state machine and gate the Subscribe button accordingly.

### Gamer token spending
Tokens are currently only purchased and credited. The spending side (gamers using tokens for activities) is not yet implemented.
