# Independent Changes to Extract from `feature/sorg-token-purchasing`

Base branch: `dev`

These changes are completely separate from payment/Stripe/subscription/token concepts and can be merged independently.

---

## Auth Infrastructure

| File | Change |
|------|--------|
| `src/hooks/use-auth-redirect.ts` | **NEW** — Reusable post-login redirect hook |
| `src/components/auth/login-form.tsx` | Refactored to use `useAuthRedirect` hook |
| `src/components/auth/register-form.tsx` | Refactored to use `useAuthRedirect` hook |
| `src/app/(auth)/register/page.tsx` | Added Suspense wrapper for searchParams (Next.js best practice) |
| `src/app/api/auth/resend-verification/route.ts` | **NEW** — Email verification resend API |
| `src/app/(dashboard)/settings/page.tsx` | Added email verification status display + resend button |

## Reusable UI Components

| File | Change |
|------|--------|
| `src/components/ui/alert.tsx` | **NEW** — Alert component with default/success/destructive variants |
| `src/components/ui/dialog.tsx` | **NEW** — Modal dialog component |
| `src/components/ui/index.ts` | Added exports for Alert and Dialog |
| `src/app/(dashboard)/admin/ui-components/page.tsx` | Refactored Alert section to use new component + icon circle examples (**leave out Sorg badge example**) |

## Admin Improvements

| File | Change |
|------|--------|
| `src/app/api/admin/users/[id]/auth/route.ts` | **NEW** — Fetch user auth/verification details |
| `src/app/(dashboard)/admin/users/page.tsx` | Added link to user detail page |

## TypeScript Null Fixes

| File | Change |
|------|--------|
| `src/app/(dashboard)/admin/products/page.tsx` | Fixed `currency` / `is_active` null handling |
| `src/app/(dashboard)/customer/gamers/page.tsx` | Fixed `created_at` null handling |

## Partial File Extractions (manual work needed)

| File | Take | Leave |
|------|------|-------|
| `src/types/database.types.ts` | Nullability corrections (timestamps `string` → `string \| null`, products columns made nullable) | `token_transactions` table, `token_transaction_type` enum, `token_balance`/`stripe_*`/`subscription_*` columns on profiles |
| `CLAUDE.md` | Brevo email docs, improved migration instructions, gen-types CLI warning note | `npm run dev` Stripe webhook changes, `npm run dev:next` command |
| `src/app/(dashboard)/customer/page.tsx` | `variant` prop removal from action cards | "Sorg" quick-action card |
| `src/app/(dashboard)/admin/ui-components/page.tsx` | Alert component refactor, icon circle examples | Sorg balance badge example |

## Explicitly Excluded (payment-adjacent)

All of the following stay on the SORG feature branch:

- Stripe package dependency + `concurrently`
- All `/api/checkout/*` routes (tokens, subscription, billing-portal, cancel)
- `/api/webhooks/stripe` webhook handler
- `/api/admin/adjust-tokens` admin endpoint
- `src/services/tokens/` (service, queries, index)
- `src/components/tokens/` (purchase section, transaction history)
- `src/components/customer/subscription-status-card.tsx`
- `src/components/customer/token-balance-card.tsx`
- `src/lib/constants/tokens.ts`
- `src/app/(dashboard)/customer/sorg/page.tsx`
- `src/app/(dashboard)/customer/billing/page.tsx`
- `src/app/(public)/checkout/page.tsx`
- `src/app/(public)/sorg/page.tsx` changes
- `src/app/(dashboard)/admin/users/[id]/page.tsx` (admin user detail with token management)
- `src/components/layout/sidebar.tsx` "Sorg" nav item
- `.github/workflows/ci.yml` Stripe env vars
- `docs/stripe-testing.md`
- `src/services/payments/payments.service.ts` changes
- `TODO.md`
- `tests/mocks/supabase.ts` token-related mock fields
