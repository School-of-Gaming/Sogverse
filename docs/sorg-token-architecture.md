# Sorg Token Purchasing Architecture

Stripe-powered token purchasing system for customers to buy Sorg tokens via one-time purchases or monthly subscriptions.

## Overview

Token purchasing uses a **webhook-driven fulfillment model**. The Stripe webhook handles all token crediting: `checkout.session.completed` credits tokens for initial purchases (one-time and first subscription payment), `invoice.paid` credits tokens for subscription renewals, and additional handlers manage status changes and cancellations. Stripe guarantees webhook delivery with automatic retries, ensuring tokens are always credited even if the customer closes their browser. The webhook processes in milliseconds, well before the browser finishes redirecting back from Stripe checkout, so the balance is already correct on page load.

## Component Map

```
Pages
├── /sorg             → Public landing page with <TokenPurchaseSection /> (buy buttons)
├── /checkout         → Auth-aware redirect: logged-in customer → Stripe, else → /login
├── /customer/sorg    → Dashboard: balance, subscription status, purchase cards, transaction history
└── /customer/billing → Redirect to Stripe Billing Portal

Token components (src/components/tokens/)
├── TokenPurchaseSection  — Package cards + purchase flow + PurchaseFeedback overlay
└── TransactionHistoryTable — Read-only ledger (date, amount, type, description, balance_after)

Customer components (src/components/customer/)
├── TokenBalanceCard        — Current balance display
└── SubscriptionStatusCard  — Active/canceled status, renewal date, manage/cancel buttons

Hooks
└── src/hooks/use-auth-redirect.ts — Manages login → checkout redirect chain

API routes (src/app/api/)
├── checkout/tokens/route.ts                    — POST: create Stripe checkout session
├── checkout/subscription/route.ts              — GET: subscription details from Stripe
├── checkout/subscription/cancel/route.ts       — POST: cancel at period end
├── checkout/subscription/billing-portal/route.ts — POST: create Stripe portal session
├── webhooks/stripe/route.ts                    — POST: webhook for all token crediting, status/cancellation
└── admin/adjust-tokens/route.ts                — POST: manual admin adjustment

Service layer (src/services/tokens/)
├── tokens.service.ts  — TokensService class (DB queries + API fetches)
└── tokens.queries.ts  — React Query hooks (useTokenBalance, useTokenTransactions, etc.)

Constants (src/lib/constants/)
└── tokens.ts — TOKEN_PACKAGES array (ids, names, token amounts, prices, types)
```

## Data Flow

### 1. One-time purchase (authenticated customer)

1. Customer clicks "Buy Now" on a package in `<TokenPurchaseSection />`
2. Component calls `POST /api/checkout/tokens` with `{ packageId, returnPath }`
3. Server validates customer role, looks up package in `TOKEN_PACKAGES`, creates Stripe Checkout session (mode: `"payment"`) with `metadata: { userId, packageId, tokenAmount, packageType }`
4. Browser redirects to Stripe Checkout
5. After payment, Stripe fires `checkout.session.completed` webhook → handler checks idempotency, calls `adjust_token_balance()` RPC
6. Stripe redirects browser to `{returnPath}?success=true`
7. Page loads with correct balance; `<PurchaseFeedback />` shows a static success banner

### 2. One-time purchase (unauthenticated user)

1. User clicks "Buy Now" on `/sorg` while not logged in
2. Component redirects to `/login?redirect=/sorg` (preserves return path)
3. User registers/logs in → `useAuthRedirect()` fires `navigateAfterAuth()` → full page navigation back to `/sorg`
4. Flow continues from step 1 of the authenticated flow

### 3. Subscription (initial)

1. Same as one-time purchase flow, but Stripe session uses mode: `"subscription"` and includes `subscription_data.metadata`
2. The `checkout.session.completed` webhook credits tokens and stores `stripe_subscription_id` and sets `subscription_status = "active"` on the profile

### 4. Subscription renewal (webhook)

1. Stripe fires `invoice.paid` event to `POST /api/webhooks/stripe`
2. Handler skips if `billing_reason === "subscription_create"` (first payment handled by `checkout.session.completed`)
3. Retrieves `userId` and `tokenAmount` from subscription metadata
4. Checks idempotency (existing transaction with `stripe_session_id = invoice.id`)
5. Calls `adjust_token_balance()` with `p_type = "subscription"`

### 5. Subscription cancellation

1. Customer clicks "Cancel Subscription" in `<SubscriptionStatusCard />`
2. Confirmation dialog → `useCancelSubscription()` → `POST /api/checkout/subscription/cancel`
3. Server calls `stripe.subscriptions.update(subId, { cancel_at_period_end: true })`
4. Stripe fires `customer.subscription.updated` webhook → profile status updated
5. At period end, Stripe fires `customer.subscription.deleted` → clears `stripe_subscription_id` and `subscription_status` on profile

### 6. Admin adjustment

1. Admin calls `POST /api/admin/adjust-tokens` with `{ userId, amount, description }`
2. Server verifies admin role, calls `adjust_token_balance()` with `p_type = "admin_adjustment"` and `p_admin_id`
3. Returns new balance and transaction ID

## Database Schema

### Profile additions (on `profiles` table)
```sql
token_balance         INTEGER NOT NULL DEFAULT 0 CHECK (token_balance >= 0)
stripe_customer_id    TEXT
stripe_subscription_id TEXT
subscription_status   TEXT    -- 'active', 'past_due', or NULL
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
| View own balance | - | Yes | - | - |
| View transaction history | - | Yes | - | - |
| Cancel subscription | - | Own | - | - |
| Manage billing (Stripe portal) | - | Own | - | - |
| Adjust any user's balance | Yes | - | - | - |

## Fulfillment Architecture

All token crediting happens exclusively through the Stripe webhook.

| Stripe Event | Action |
|---|---|
| `checkout.session.completed` | Credit tokens (initial purchase + first subscription), store Stripe customer/subscription IDs |
| `invoice.paid` | Credit tokens for subscription renewals (skips `subscription_create` to avoid double-credit) |
| `customer.subscription.updated` | Sync subscription status to profile |
| `customer.subscription.deleted` | Clear subscription metadata from profile |

**Idempotency:** Both token-crediting handlers check `stripe_session_id` in `token_transactions` before crediting. A `UNIQUE` constraint on `stripe_session_id` provides database-level protection against concurrent deliveries.

## Environment Variables

| Variable | Side | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | Server | Stripe API authentication |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Both | Stripe client-side identification |
| `STRIPE_WEBHOOK_SECRET` | Server | Webhook signature verification |

## Future Improvements

### Extract shared auth/role-check helper for API routes
All token API routes repeat the same pattern: `createClient()` → `getUser()` → query profile → check role → return 401/403. A shared `getAuthenticatedProfile(allowedRoles)` helper would reduce boilerplate.

### Use generated types in API routes
API routes cast profile query results with inline types. Importing the generated `Profile` type from `@/types` would stay in sync with schema changes automatically.

### Gamer token spending
Tokens are currently only purchased and credited. The spending side (gamers using tokens for activities) is not yet implemented.
