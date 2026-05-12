# Sorg Token Removal Checklist

The Sorg token system (Stripe-backed in-app currency: balance, subscriptions, package purchase) is being removed. The new Products v2 system replaces it with direct Stripe charges per enrollment — no in-app currency.

This doc is the rolling checklist. Tick items as work merges. Remove this file once everything is done.

Related cleanup: `docs/products-redesign.md` still has ~20 Sorg references that need trimming. (`docs/sorg-token-architecture.md` and `docs/stripe-decoupling.md` were deleted on 2026-05-12; `docs/stripe-testing.md` was reviewed, contains no Sorg references, and stays as the general Stripe testing reference.)

---

## Step 1 — Remove from the UI (done)

User-visible surfaces and the components/routes that back them.

### Sidebar & navigation
- [x] `src/components/layout/sidebar.tsx` — Sorg nav item + `"sorg"` `SidebarKey` removed.

### Public pages
- [x] Deleted `src/app/(public)/sorg/page.tsx`.
- [x] Deleted `src/app/(public)/checkout/page.tsx` (Sorg-only).
- [x] `src/proxy.ts` — `ROUTES.sorg` and `ROUTES.checkout` removed from `PUBLIC_ROUTES`.
- [x] `src/hooks/use-auth-redirect.ts` — `${ROUTES.checkout}?` removed from `SAFE_REDIRECT_PREFIXES`.
- [x] `src/app/sitemap.ts` — `/sorg` URL removed.

### Customer dashboard
- [x] Deleted `src/app/(dashboard)/parent/sorg/`.
- [x] Deleted `src/app/(dashboard)/parent/billing/page.tsx`.
- [x] `src/app/(dashboard)/parent/page.tsx` — Sorg quick-action card removed.

### Admin
- [x] `src/app/(dashboard)/admin/users/[id]/page.tsx` — token balance card, adjust UI, transaction history all removed.
- [x] `src/app/(dashboard)/admin/ui-components/page.tsx` — TokenBalanceCard demo, Package Cards demo, Sorg balance badge, demo fixtures, monetary-value warning all removed.
- [x] Legacy `admin/products` UI de-Sorged (kept as placeholder per decision):
  - `src/components/admin/product-row.tsx` — Sorg cost line removed.
  - `src/components/admin/product-form.tsx` — Sorg cost input + currency display removed; `token_cost` defaults to existing value or `1`.
  - `src/app/(dashboard)/admin/products/page.tsx` and `[id]/page.tsx` — `useTokenRates` removed.

### Components
- [x] Deleted `src/components/tokens/` (whole dir).
- [x] Deleted `src/components/customer/token-balance-card.tsx` and `subscription-status-card.tsx`; exports cleaned.
- [x] Deleted `src/components/enrollment/` (legacy unenroll dialog) and removed its wiring from `GroupDetailContent.tsx` + `CustomerGroupDetailContent.tsx`. The "X Sorgs/week" cost line + Coins icon are gone with it.
- [x] `src/components/home/about-section.tsx` — `"sorg"` row removed from the Klingon easter-egg table.

### Providers & root layout (pulled forward to keep build green)
- [x] Deleted `src/providers/token-rate-provider.tsx`; `src/providers/index.tsx` no longer wraps `TokenRateProvider` or re-exports `useTokenRates`.
- [x] `src/app/layout.tsx` — `getStripeProducts()` call and `baseRates` prop removed.
- [x] Deleted `src/lib/stripe/products.ts` (cached fetcher) and `src/lib/stripe/utils.ts` (Sorg currency helpers).

### API routes (Sorg-only routes pulled forward)
- [x] Deleted `src/app/api/checkout/tokens/`, `src/app/api/checkout/subscription/`, `src/app/api/admin/adjust-tokens/`.
- [x] `src/services/enrollments/enrollments.queries.ts` — `useUnenrollGamer` and all `tokenKeys` invalidation removed; `useEnrollGamer` no longer touches token cache.

### Routes constants
- [x] `src/lib/constants/routes.ts` — `ROUTES.sorg`, `ROUTES.checkout`, `ROUTES.customer.sorg`, `ROUTES.customer.billing` removed.

### Tests deleted (couldn't survive deletion of their subjects)
- [x] `tests/integration/api/{checkout-tokens,admin-adjust-tokens,subscription-{switch,cancel,resume}}.test.ts`
- [x] `tests/unit/{tokens,stripe-products}.test.ts`
- [x] `tests/unit/components/build-customer-enrollment.test.ts`

### Verification
- [x] `npm run lint` clean.
- [x] `npm run type-check` clean.

---

## Step 2 — Services, queries, providers (done)

After the UI is gone, the React-Query/service layer becomes dead code.

- [x] Delete `src/services/tokens/` (service, queries, subscription-state, index).
- [x] Delete `src/providers/token-rate-provider.tsx`. (Pulled forward in Step 1.)
- [x] `src/providers/index.tsx` — drop `TokenRateProvider` wrap and re-export. (Pulled forward in Step 1.)
- [x] `src/app/layout.tsx` — drop `getStripeProducts()` call and the `baseRates` prop. (Pulled forward in Step 1.)
- [x] `src/services/enrollments/enrollments.queries.ts` — drop `tokenKeys` import and the two `invalidateQueries({ queryKey: tokenKeys.all })` calls. (Pulled forward in Step 1.)
- [x] `src/services/index.ts` — drop `export * from "./tokens"`.

---

## Step 3 — API routes (done)

- [x] Delete `src/app/api/checkout/tokens/route.ts`. (Pulled forward in Step 1.)
- [x] Delete `src/app/api/checkout/subscription/` (route, switch, cancel, resume, billing-portal). (Pulled forward in Step 1.)
- [x] Delete `src/app/api/admin/adjust-tokens/route.ts`. (Pulled forward in Step 1.)
- [x] `src/app/api/webhooks/stripe/route.ts` — the entire Sorg webhook file was deleted. Products v2 events are now handled by `src/app/api/webhooks/stripe/products/route.ts`.

---

## Step 4 — Stripe lib (Sorg-specific only) (done)

- [x] Delete `src/lib/stripe/products.ts` (`getStripeProducts`, `getProductByPriceId`). (Pulled forward in Step 1.)
- [x] Delete `src/lib/stripe/utils.ts` (`getPackageSavings`, `tokensToCurrencyDisplay`). (Pulled forward in Step 1.)
- [x] Keep generic Stripe client setup, signature verification, `participation-prices.ts` (Products v2).

---

## Step 5 — Types

- [ ] `src/types/index.ts` — drop `TokenTransaction`, `TokenTransactionType`, `StripePackage` aliases.
- [ ] After DB migration runs and types regen, confirm `database.types.ts` no longer has token tables/RPCs/columns.

---

## Step 6 — Database migration

New migration to drop:

- [ ] `token_transactions` table (and policies/grants).
- [ ] `adjust_token_balance()` RPC.
- [ ] `token_transaction_type` enum.
- [ ] `customer_profiles` columns: `token_balance`, `subscription_status`, `subscription_tier`. **Decide:** keep `stripe_customer_id` / `stripe_subscription_id` for v2 reuse, or drop too?
- [ ] Resolve migration `00006_groups_and_enrollments.sql` token-transaction-type references — does v2 enrollment still depend on these enums?
- [ ] Push migration; regenerate `database.types.ts`.

---

## Step 7 — i18n (done)

- [x] Remove `sorg.*`, `tokens.*`, `parent.sorg.*`, `checkout.*`, `admin.users.tokenBalance*` keys from `messages/{en,fi,sv,tlh}.json`.
- [x] Drop `"sorg"` from `messages/*.json` `sidebar.*` namespace.

---

## Step 8 — Tests

- [x] Delete unit tests: `tests/unit/tokens.test.ts`, `tests/unit/stripe-products.test.ts`, `tests/unit/services/subscription-state.test.ts`.
- [x] Delete integration tests: `tests/integration/api/{checkout-tokens,admin-adjust-tokens,subscription-switch,subscription-cancel,subscription-resume}.test.ts`. (Pulled forward in Step 1.)
- [x] Trim `tests/integration/api/stripe-webhook.test.ts` — the file was deleted entirely.
- [ ] Delete `tests/db/token-balance.test.ts`. Trim `tests/db/rls.test.ts` and `tests/db/access-control.test.ts` token sections.
- [ ] `tests/db/constants.ts` — drop `SEED.CUSTOMER_TOKEN_BALANCE`. `tests/db/helpers.ts` — drop `resetTokenState()`.
- [ ] `tests/mocks/stripe.ts` — drop Sorg helpers. `tests/mocks/supabase.ts` — drop token fields.

---

## Step 9 — Docs & project instructions

- [x] Delete `docs/sorg-token-architecture.md`.
- [x] `CLAUDE.md` — remove the "Sorg Token Purchasing (Stripe)" section.
- [x] `TODO.md` — remove Sorg notes (dropped the `src/services/tokens/CLAUDE.md` splitting candidate and swapped the verification example to `commit_group_changes`).
- [ ] Trim Sorg references from `docs/products-redesign.md`. (~20 occurrences still inside the doc body.)
- [x] Decide whether `docs/stripe-testing.md` stays as-is — yes, stays as-is. It has no Sorg references and serves as the general Stripe testing reference.

---

## Open questions

1. **Stripe customer IDs on `customer_profiles`** — drop entirely or keep `stripe_customer_id` for v2 customer reuse?
2. **Migration 00006 (groups_and_enrollments)** — does v2 enrollment still reference `token_transaction_type`? If so, that needs untangling before we can drop the enum.
3. **Legacy `admin/products` UI** — delete the whole tree, or keep the pages and strip token refs?
4. **`docs/stripe-testing.md`** — keep or rewrite for v2.
