# PR Review: `feature/sorg-token-purchasing` → `dev`

**Date:** 2026-02-17
**Scope:** 53 files, ~3,560 additions. Adds Stripe-based Sorg token purchasing (one-time + subscription), admin token adjustment, checkout flow with auth redirect, subscription management, and supporting UI.

---

## Architectural & Design Feedback

**Overall impression:** The architecture is solid. Server-side price definitions prevent price manipulation, the atomic `adjust_token_balance` RPC keeps the balance and transaction ledger consistent, and the webhook-driven fulfillment with Supabase Realtime for instant client sync is a clean approach. The new services, hooks, and components follow existing project patterns.

**Key design concerns:**

1. ~~**Fulfillment gap.**~~ RESOLVED — All token crediting goes through the Stripe webhook (`checkout.session.completed` for initial purchases, `invoice.paid` for renewals). Stripe's automatic retry guarantees delivery even if the first attempt fails. The client uses Supabase Realtime for instant balance updates.

2. ~~**Subscription status logic duplication.**~~ RESOLVED — Extracted `getSubscriptionState()` into `src/services/tokens/subscription-state.ts`. Returns a discriminated `{ status, hasActiveSubscription }` object. Both `token-purchase-section.tsx` and `subscription-status-card.tsx` now use this shared utility instead of independently computing subscription state. Unit tests added (10 tests) covering all status combinations.

3. ~~**`tokenKeys` not exported from `tokens.queries.ts`.**~~ RESOLVED — `tokenKeys` exported from `tokens.queries.ts` and barrel `tokens/index.ts`. All hand-rolled query key arrays in `token-purchase-section.tsx` replaced with `tokenKeys.balance()`, `tokenKeys.transactions()`, and `tokenKeys.subscription()`.

4. ~~**`PaymentsService` is dead code.**~~ RESOLVED — Deleted `src/services/payments/` directory and removed the barrel re-export from `src/services/index.ts`. All real payment logic lives in `TokensService` and the API routes.

5. ~~**Hardcoded route paths everywhere.**~~ RESOLVED — Added centralized `ROUTES` constant to `src/lib/constants/routes.ts` with all page paths (public, auth, admin, customer, gamer, gedu). Updated 12 consumer files: sidebar, header, proxy, all auth forms, token purchase section, checkout page, subscription status card, and sorg page. `PUBLIC_ROUTES`, `AUTH_ROUTES`, and `PROTECTED_ROUTES` arrays now reference `ROUTES` values. Proxy now imports shared `ROUTES` and `ROLE_DASHBOARD_PATHS` instead of maintaining its own duplicate constants.

---

## Critical (Must-Fix)

### ~~1. TOCTOU race condition — double-crediting vulnerability~~ RESOLVED

Added `UNIQUE (stripe_session_id)` constraint via migration `00017`. Both routes now handle `23505` (unique violation) gracefully — `verify-session` returns `already_processed`, the webhook silently breaks. The SELECT check remains as a fast-path optimization. Existing duplicate transactions were cleaned up and over-credited balances reversed by the migration.

### ~~2. Unchecked `admin.rpc()` return — silent token crediting failure~~ RESOLVED

Both routes now destructure `{ error: rpcError }` from the RPC call and return 500 on failure. The `23505` unique violation is handled separately as a success case (see #1). Tests added for both the RPC failure and unique violation paths.

**Remaining:** The unchecked `admin.from("profiles").update(...)` calls (6 instances) still discard errors. These are lower-risk (metadata sync, not token crediting) but should still be addressed.

### ~~3. `hasActiveSubscription` treats Stripe `"canceled"` as active — blocks re-subscription~~ RESOLVED

Removed `"canceled"` from the active subscription check in both `token-purchase-section.tsx` and `subscription-status-card.tsx`. Only `"active"` and `"past_due"` now count as active. The `subscription-status-card` also returns `null` early when `subscription_status === "canceled"` (fully ended subscription).

Added a full three-state subscription UI:
- **No subscription:** Subscribe button enabled.
- **Active + renewing:** "Current plan" badge, button disabled, cancel option in subscription card.
- **Active + canceling at period end:** "Cancels at period end" badge, "Resume Subscription" button in both the package card and subscription status card.

New resume subscription endpoint (`POST /api/checkout/subscription/resume`) undoes cancellation by setting `cancel_at_period_end: false` on the Stripe subscription. Service method, React Query mutation hook, and exports added.

Test coverage added:
- `subscription-cancel.test.ts` (5 tests) — auth, role, missing subscription, happy path, Stripe failure.
- `subscription-resume.test.ts` (6 tests) — auth, role, missing subscription, happy path, Stripe failure.
- 4 double-subscribe regression tests in `checkout-tokens.test.ts` — verifies `null` and `"canceled"` statuses allow re-subscription, while `"active"` (even when canceling at period end) blocks it.

### ~~4. Open redirect in `useAuthRedirect`~~ RESOLVED

Added `isSafeRedirectPath()` utility in `src/lib/utils.ts` that uses the `URL` constructor to validate redirects against the same parsing rules browsers use. This covers absolute URLs, protocol-relative URLs (`//evil.com`), and backslash bypass (`\/evil.com`). Both `use-auth-redirect.ts` and `checkout/tokens/route.ts` now use this shared utility. Unit tests added covering all attack vectors.

---

## Suggested (Should-Fix)

### ~~5. Export `tokenKeys` to eliminate fragile hand-rolled query keys~~ RESOLVED

Exported `tokenKeys` from `tokens.queries.ts` and the barrel `tokens/index.ts`. Replaced all three hand-rolled query key arrays in `token-purchase-section.tsx` with `tokenKeys.balance()`, `tokenKeys.transactions()`, and `tokenKeys.subscription()`.

### ~~6. `PurchaseFeedback` should use the `Alert` component~~ RESOLVED

Added `info` and `warning` variants to the Alert component (with matching CSS color tokens). Refactored `PurchaseFeedback` to use `<Alert>` with the appropriate variant for each state (info/verifying, destructive/error, success/verified, warning/canceled). Updated the UI showcase page with the new variants.

### ~~7. Silent error swallowing on checkout failure~~ RESOLVED

All three catch blocks now show a destructive `Alert` instead of silently redirecting or resetting: `token-purchase-section.tsx` displays an inline error above the package cards, `checkout/page.tsx` and `billing/page.tsx` replace the loading message with an error alert and a link back.

### ~~8. `<Link>` wrapping `<Button>` produces invalid HTML~~ RESOLVED

Replaced both `<Link><Button>` instances in `sorg/page.tsx` CTA section with `<Link className={buttonVariants(...)}>`, matching the existing codebase pattern. `Button` import replaced with `buttonVariants`.

### ~~9. Duplicate Stripe Customer objects on repeat purchases~~ RESOLVED

The checkout route now fetches `stripe_customer_id` from the profile and passes `customer` to Stripe when it exists, falling back to `customer_email` for first-time purchasers. This consolidates payment history under a single Stripe Customer per user. Two integration tests added (returning customer uses `customer`, first-time uses `customer_email`).

Note: In practice, duplicate Customers were not occurring because Stripe's default `customer_creation: "if_required"` in `mode: "payment"` skips Customer creation for one-time purchases. Only subscription checkouts create Customers, and the existing 409 duplicate-subscription guard prevented repeat subscription checkouts. The fix is still correct — it ensures returning subscribers who make one-time purchases get their payment linked to their existing Customer.

### ~~10. `origin` header absence causes Stripe API rejection~~ RESOLVED

Both routes now fall back to the `host` header (`https://${request.headers.get("host")}`) instead of an empty string. This works correctly across all deployment environments (dev, prod, feature branch previews) without requiring an env var.

### ~~11. No pagination on `getTransactions`~~ DEFERRED

**File:** `tokens.service.ts:20-28`

Fetches all transactions with no `.limit()`. For users with long purchase histories this will degrade. Tracked in `docs/sorg-token-architecture.md` under "Future Improvements → Paginate transaction history".

### ~~12. Missing test coverage for RPC failure path~~ RESOLVED

Added 4 tests across both test files: RPC failure → 500 and unique constraint violation (`23505`) → graceful handling, for both `verify-session` and `stripe-webhook`.

---

## Nitpick

### ~~13. `replace("_", " ")` only replaces the first underscore~~ RESOLVED
**File:** `transaction-history-table.tsx:34` — replaced `.replace("_", " ")` with `.replaceAll("_", " ")`.

### ~~14. `cn()` not used for conditional classes~~ RESOLVED
**File:** `token-purchase-section.tsx:122` — replaced template literal with `cn()` per CLAUDE.md convention.

### 15. `AlertTitle` ref type mismatch
**File:** `alert.tsx:35` — `forwardRef<HTMLParagraphElement, ...>` but renders `<h5>` (should be `HTMLHeadingElement`).

### ~~16. `TOKEN_BASE_RATE_CENTS` is dead code~~ NOT AN ISSUE
Imported and used in `admin/users/[id]/page.tsx` for the admin token-adjustment UI display.

### 17. `TokenPackageId` type manually maintained
**File:** `tokens.ts:15` — should be derived from the array: `type TokenPackageId = typeof TOKEN_PACKAGES[number]["id"]`.

### 18. Date formatting inconsistency
`transaction-history-table.tsx` uses `toLocaleDateString()` with no locale. `subscription-status-card.tsx` uses `"en-US"` with explicit options. Consider a shared `formatDate` utility.

### 19. Admin users search input lacks accessible label
**File:** `admin/users/page.tsx:45` — has placeholder text but no `<Label>` or `aria-label`. Add `aria-label="Search users"`.

### 20. Hardcoded status message in generic hook
**File:** `use-auth-redirect.ts:21` — `"Redirecting to checkout..."` is checkout-specific but the hook name is generic. Consider accepting the message as a parameter.

---

## What's Done Well

- **Server-side price definitions** in `TOKEN_PACKAGES` — the client sends only a `packageId`, never a price. Price manipulation is impossible.
- **Atomic `adjust_token_balance` RPC** — balance update + transaction insert in a single DB transaction with `CHECK (token_balance >= 0)`.
- **Stripe webhook signature verification** — proper `constructEvent()` with raw body.
- **Webhook idempotency** — SELECT + UNIQUE constraint on `stripe_session_id` prevents double-crediting.
- **Admin audit trail** — `admin_id` stored on every manual adjustment.
- **Cookie-preserving redirect helper** in proxy — fixes a real bug for all redirect flows.
- **Comprehensive integration tests** for the happy paths and key security gates (auth, role checks, idempotency, session ownership).
- **Thorough subscription lifecycle handling** — cancellation at period end, renewal crediting, status sync.
