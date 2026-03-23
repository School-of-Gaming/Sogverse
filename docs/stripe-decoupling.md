# Stripe Decoupling: Base Rates as App Config

## Status: Future consideration (not blocking)

The current architecture works well — `unstable_cache` with 5-minute revalidation mitigates runtime risk. This doc captures the decoupling plan for when we're ready.

## Problem

Base rates (cents per Sorg per currency) are computed at runtime from Stripe's cheapest one-time package via `getStripeProducts()`. Because this is called in the root layout to feed `TokenRateProvider`, every page in the app is architecturally downstream of Stripe — even pages that have nothing to do with payments.

### Dependency chain (current)

```
root layout
  → getStripeProducts() → Stripe API (cached 5 min)
    → computeBaseRates()
      → TokenRateProvider (wraps entire app)
        → 7+ pages that just show "X Sorgs ≈ $Y"
```

### Consumers of `useTokenRates()` that don't need Stripe

| Page / Component | What it uses |
|---|---|
| `/products` | `tokensToCurrencyDisplay` — "≈ $6.00 per session" |
| `/products/[id]` | same |
| `/admin/products` | same |
| `/admin/products/[id]` | same |
| `product-form.tsx` | same |
| `product-row.tsx` | same (via prop) |
| `/admin/users/[id]` | `baseRates` |

All of these need a single number per currency: how many cents is one Sorg worth. They don't need Stripe products, packages, or price IDs.

### Pages that legitimately need Stripe product data

| Page | Why |
|---|---|
| `/sorg` | Displays purchasable packages |
| `/customer/sorg` | Same + subscription management |

These already call `getStripeProducts()` independently.

## Solution: Base rates as app config

A base rate changes only when pricing changes in Stripe — that's an admin action, not a per-request computation.

### Decoupled dependency chain

```
root layout
  → Supabase (already a dependency)
    → base rates from DB
      → TokenRateProvider
        → pages show "X Sorgs ≈ $Y"

sorg pages (only)
  → getStripeProducts() → Stripe API
    → package display + checkout
```

### Implementation steps

1. **Store base rates in the database.** Either a row in a new `app_config` table or columns on an existing settings table. One value per supported currency (`usd`, `gbp`, `eur`).

2. **Populate rates when pricing changes.** Options (pick one):
   - **Stripe `product.updated` webhook** — recompute rates and write to DB automatically.
   - **Admin action** — button in the admin dashboard that calls `getStripeProducts()`, computes rates, and saves them.
   - **Manual** — update the DB row when you change Stripe pricing (simplest, least automated).

3. **Root layout reads rates from Supabase** instead of calling `getStripeProducts()`. Since the layout already calls `getUserWithProfile()` (a Supabase query), this adds no new dependency.

4. **Remove `getStripeProducts()` from root layout.** It stays in the two sorg pages where it's actually needed.

5. **No changes needed** to `TokenRateProvider`, `useTokenRates()`, `TokenPurchaseSection`, checkout routes, or webhook handler. The interface stays the same — only the data source changes.

## What this achieves

- Root layout has zero Stripe dependency.
- Cold starts never block on Stripe.
- Product/admin pages are fully decoupled from payments.
- Stripe is confined to: checkout routes, webhooks, and the two sorg pages.
- Enables future payment provider flexibility (base rates become provider-agnostic).
