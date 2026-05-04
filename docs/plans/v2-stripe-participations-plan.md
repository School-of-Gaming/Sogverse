# Plan: v2 Stripe Checkout + Participations + Purchased Cards

This file is the implementation handoff from a planning conversation. **Read the supporting design first** — design decisions are now in `docs/products-redesign.md`. This plan is "what to build, in what order, what tests to write" — not a re-litigation of the design.

This file lives at `docs/plans/v2-stripe-participations-plan.md` only for the duration of this implementation. **Delete it once the PR is merged.** No need to nuke from git history; a normal `git rm` is fine.

---

## Mission

Take a parent from "I see this product" to "I've bought a spot," and surface that purchase clearly across the parent's product surfaces:

1. Detail-page CTA wires to real Stripe Checkout for **bundles** (consumer clubs), **family subscriptions** (consumer clubs), **single-payment** (camps, paid events). **Free events** register without Stripe.
2. Out-of-stock products show "Join the waitlist" — adds the parent to the waitlist with no charge.
3. The race condition is handled by the **seat-reservation flow** (per `products-redesign.md` §4.6a) — a `reserving` participation row is held for 30 min before any Stripe call.
4. The Stripe webhook fulfills purchases idempotently and writes payment records.
5. **Browse cards and the detail page read real participation counts** — `deriveRegistrationState`'s `participationsCount` parameter, currently hardcoded to `0`, is fed real numbers. The seat-left pill ("Only N spots left"), full-waitlist state, threshold progress, and "almost full" warnings all light up.
6. The detail page detects "you (or your gamer) already signed up" and replaces the signup form with a status panel.
7. A real `useMyParticipations` query replaces all `?mock=1` hacks on parent browse pages.
8. Purchased card surfaces three states (`waitlisted` / `unassigned` / `assigned`) with parent-friendly copy and a session-balance line for bundle-covered clubs.
9. Hourly credit cron applies the four-rule §4.5 motion table.
10. `/admin/ui-components` exercises every purchased-card state for design review.

---

## Explicit out-of-scope

Do **not** build any of these. They have follow-up PRs in their own time and are listed in the closing "Follow-up PRs" section so the PR description can reference them:

- Customer-facing self-cancel of any kind. No "Leave this club" button, no "Cancel subscription" button, no "Cancel session" button. Schema and RPCs that *underpin* these can ship if natural (e.g. `session_cancellations_v2` table), but no UI surface.
- The future purchased-product detail page (where sub management, session calendar with cancelled-session markers, and cancel-sub-vs-leave-club confirms will live).
- `switch_subscription_frequency_v2` RPC and route.
- `admin_remove_participation_v2` RPC and admin UI.
- `cancel_product_v2` cascade-refund logic and admin UI.
- `finalize_completed_products_v2` daily job.
- `FAMILY_DISCOUNT_PERCENT` — coupon application is skipped entirely. Subscription Checkout creation does **not** attach a coupon. The flat-tier value is undecided per `products-redesign.md` §11.
- `SUBSCRIPTION_DISCOUNTS.yearly` — yearly is reserved for future, not v1.
- Translation of Stripe Checkout copy beyond what `locale=auto` provides (per existing `sorg-token-architecture.md` decision).
- Promote-from-waitlist email delivery. Promotion picks the next-position waitlist row; **logging the promotion event** is enough — actual transactional email lands in a follow-up PR.
- Payment reporting dashboards.

---

## Required reading (in this order)

Before writing any code, read:

1. **`docs/products-redesign.md`** — sections 3 (vocabulary, especially "Participation state vocabulary" and "Carve-out for net-new code"), 4.5 + 4.5b + 4.5c (billing model + family-sub shape + cancel-sub-vs-leave-club), 4.6 + 4.6a (capacity + reservation flow), 5.1a (pricing tables), 5.5 (participations), 5.7 (payments/refunds), 5.7a (family subs), 5.8 (RLS shape), 6.1 (RPCs), 6.3 (cron logic), §11 entries marked *Resolved* for the rolling-sub-with-credit-pot model.
2. **`docs/products-v2-architecture.md`** — current as-built shape of admin + parent surfaces. The "Today-vs-future degradation" section explicitly says `participationsCount: 0` is the placeholder we're replacing.
3. **`docs/sorg-token-architecture.md`** — reference for the existing Stripe webhook + Checkout pattern. The new system mirrors the *shape* (server-side fulfillment, idempotent webhooks, `priceId` validation against live Stripe products) but with `_v2` DB tables, domain-named code paths, and the reservation-row gate.
4. **`docs/stripe-testing.md`** — local Stripe CLI listener setup.
5. **`CLAUDE.md`** — service layer pattern, RLS rules, type-gen workflow, lint rules.
6. **Memory:** `feedback_never_manual_db_types.md`, `feedback_db_tests_ci_only.md`, `feedback_pr_descriptions_squash.md`, `feedback_clipboard_powershell.md`, `feedback_extension_table_pks.md`.

---

## Conventions and invariants

- **DB tables stay `_v2`** (`participations_v2`, `payments_v2`, etc.). Code with no legacy peer is **domain-named** — `ParticipationsService`, `/api/webhooks/stripe/products`, `/api/checkout/products/...` (see `products-redesign.md` §3 carve-out).
- **Every new RPC is `SECURITY DEFINER` and starts private** — `REVOKE EXECUTE FROM authenticated, anon, public`. None of these RPCs are intentionally browser-callable; they're invoked from API routes via `createAdminClient()`.
- **Every new table has RLS enabled** with policies per `products-redesign.md` §5.8. Wrap `auth.uid()` and `get_user_role()` in `(select …)` for the initplan optimization.
- **Read-then-write financial RPCs use `SELECT ... FOR UPDATE`** on the relevant lock row. The product row is the canonical signup gate.
- **Migration workflow:** push migration → regen types from remote with `2>/dev/null` to suppress CLI warnings → check `src/types/index.ts` for new aliases → commit migration + types together. **Never hand-edit `database.types.ts`.**
- **DB tests run in CI only.** Don't `npm run test:db` locally; push to a branch and let CI run them.
- **Lint must be clean** — zero errors, zero warnings. No undescribed `eslint-disable`.
- **No hardcoded colors.** All UI uses semantic Tailwind tokens.
- **Layout stability** — once a button or text is on screen, it doesn't move without user interaction. Render what you can early, leave space for what loads later.
- **Mutations invalidate related queries** in `onSuccess` via the key-hierarchy pattern.

---

## Phase 1 — Schema, RPCs, RLS

Single migration file: `supabase/migrations/00039_participations_payments_v2.sql`.

### Tables

Per `products-redesign.md` §5.5, §5.7, §5.7a, §5.1a:

- **`participations_v2`** — note the updated shape after the §5.5 fix:
  - `status` enum is `'reserving' | 'active' | 'waitlisted' | 'completed'` — `reserving` is new.
  - `reserved_until timestamptz` — populated iff `status='reserving'`.
  - `credits_remaining int NOT NULL DEFAULT 0` — single shared balance, not nullable. Bundle-covered: set to bundle size at fulfillment. Sub-covered: 0 baseline, +1 per cancel-in-window at session start. Single-payment / free: 0 (no per-session motion).
  - CHECK constraints: `status='reserving' → reserved_until IS NOT NULL`, `status='waitlisted' → waitlist_position IS NOT NULL`, `credits_remaining >= 0`, `group_id`'s product_id matches row's product_id when set.
  - Partial indexes: `status='active'`, `status='waitlisted'`, `status='reserving' AND reserved_until > now()`.
- **`payments_v2`** — exactly per §5.7. UNIQUE on `stripe_event_id`.
- **`refunds_v2`** — exactly per §5.7. UNIQUE on `stripe_event_id`, UNIQUE on `stripe_refund_id`.
- **`family_subscriptions_v2`** + **`family_subscription_items_v2`** — exactly per §5.7a.
- **`product_subscription_prices_v2`** — exactly per §5.1a.
- **`session_cancellations_v2`** — `(participation_id, session_date, cancelled_at)` with UNIQUE on `(participation_id, session_date)`. Ships in this PR even though the cancel-session UI does not — keeps the cron's branch logic fully implemented and means the cancel-session UI lands later as a UI-only PR.
- **`credit_deductions_v2`** — append-only ledger: `id uuid pk`, `participation_id uuid`, `gamer_id uuid`, `product_id uuid`, `session_date date`, `delta int CHECK (delta IN (-1, 0, +1))`, `reason text`, `processed_at timestamptz default now()`. UNIQUE on `(participation_id, session_date)`.
- **`product_seat_counts_v2`** — public-readable rollup feeding the realtime seat counter on the detail page (see Phase 5b):
  - `product_id uuid PK → products_v2.id ON DELETE CASCADE`
  - `active_count int NOT NULL DEFAULT 0`
  - `reserving_count int NOT NULL DEFAULT 0`
  - `waitlist_count int NOT NULL DEFAULT 0`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
  - **RLS:** `SELECT` is allowed for `anon` and all authenticated roles (this is the *one* parent-readable surface for "how full is this product right now"). No `INSERT`/`UPDATE`/`DELETE` granted to any role — writes happen exclusively via triggers below.
  - **Triggers** on `participations_v2`: AFTER INSERT, AFTER UPDATE OF status, AFTER DELETE — recompute the counts for the affected product and upsert into `product_seat_counts_v2`. The trigger function is `SECURITY DEFINER` and idempotent.
  - **Realtime publication:** add `product_seat_counts_v2` to the Supabase Realtime publication so clients can subscribe to row changes filtered by `product_id`. This is what lets the detail page update live without polling.
  - **Why a separate rollup table, not direct Realtime on `participations_v2`:** Supabase Realtime respects RLS, and the `participations_v2` policies hide other customers' rows. Subscribing directly would only fire for the viewer's own participations — useless for a seat counter. The rollup table has permissive `SELECT` (no PII, just counts) so every viewer sees the same updates.

### Enums

- `participation_status_v2 = 'reserving' | 'active' | 'waitlisted' | 'completed'`.
- `subscription_frequency_v2 = 'monthly' | 'quarterly' | 'yearly'`.
- `payment_purpose_v2 = 'bundle' | 'subscription_invoice' | 'single_payment'`.
- `refund_reason_v2 = 'session_cancelled_in_window' | 'admin_refund' | 'product_cancelled' | 'subscription_item_removed' | 'subscription_period_proration'`.

### SQL functions

- **`effective_status_v2(p_product_id uuid) RETURNS product_status_v2`** — SQL twin of `src/components/admin/products-v2/effective-status.ts`. Reads `start_date`, `end_date`, `signup_threshold`, `status`, projects `now()` into `products_v2.timezone`, compares to date-only fields, plus active participation count. Returns one of `'pending' | 'running' | 'completed' | 'cancelled' | 'expired' | 'draft'`. Add a unit-equivalent test in `tests/db/effective-status-v2.test.ts` covering each branch.
- **`count_active_seats_v2(p_product_id uuid) RETURNS int`** — count of `status='active'` rows.
- **`count_seats_taken_v2(p_product_id uuid) RETURNS int`** — count of `status='active'` plus `status='reserving' AND reserved_until > now()`. Used inside `create_participation_v2` for race-aware seat math; also exposed for the browse seat-counter (see Phase 5b).
- **`participation_state_v2(p_status participation_status_v2, p_group_id uuid) RETURNS text`** — pure helper returning `'waitlisted' | 'unassigned' | 'assigned'` (matches the TS `ParticipationState`). Trivial but worth having on the SQL side for views/reports later.

### RPCs

All `SECURITY DEFINER`, all start with `SELECT 1 FROM products_v2 WHERE id = p_product_id FOR UPDATE`.

- **`create_participation_v2(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid, p_purchase_shape text, p_currency text)`** — returns a row with `kind text` and conditional fields. Validates: `effective_status_v2(p_product_id)` permits signup; `registration_opens_at <= now()`; parent-child relationship via `customer_gamer_links`; gamer not already participating in this product. Decision tree:
  - If a free-event with seat available → inserts `status='active'`, returns `{ kind: 'free_active', participation_id }`.
  - If seat available (`count_seats_taken_v2 < seat_count` or `seat_count IS NULL`) → inserts `status='reserving'` with `reserved_until = now() + interval '30 minutes'`, returns `{ kind: 'reserving', participation_id, reserved_until }`. Caller (the route) then creates the Stripe Checkout Session.
  - If full → returns `{ kind: 'full' }`. UI flips to "Join the waitlist".
- **`join_waitlist_v2(p_product_id uuid, p_gamer_id uuid, p_customer_id uuid)`** — gate-locks, validates ownership, validates the product permits waitlist (`waitlist_enabled`). Idempotent on existing waitlisted/reserving/active row for the same `(product, gamer)` — returns the existing row's id and position rather than failing. Returns `{ participation_id, waitlist_position }`. No Stripe.
- **`confirm_reservation_v2(p_reservation_id uuid, p_credits_to_grant int)`** — webhook helper. Gate-locks the product. If `reserved_until > now()` *or* (`reserved_until <= now()` AND a seat is still free), flips reserving → active and sets `credits_remaining = p_credits_to_grant` (caller passes the bundle size, or 0 for sub/single). Returns `{ kind: 'confirmed' }`. Otherwise returns `{ kind: 'lost_seat' }` — webhook then triggers refund + waitlist insert.
- **`expire_reservation_v2(p_reservation_id uuid)`** — webhook helper for explicit-abandonment events (`checkout.session.expired`). Hard-deletes the reserving row.
- **`cancel_participation_v2(p_participation_id uuid, p_reason text)`** — admin/internal-only in this PR. Hard-DELETE active row; if linked to a `family_subscription_items_v2` row, removes the item from Stripe (and cancels the sub at period end if it was the last item); promotes lowest-position waitlist via `promote_from_waitlist_v2`. Banked credits forfeit (no Stripe refund per redesign §6.1). Not exposed to customers — no API route in this PR.
- **`promote_from_waitlist_v2(p_product_id uuid)`** — internal helper. Picks lowest-position waitlist row, returns its `(participation_id, gamer_id, customer_id)`. The route layer is responsible for the notification (placeholder log line for now). The waitlist row stays `waitlisted` — promotion is opt-in, the parent has to click and re-checkout.
- **`apply_credit_motion_v2(p_participation_id uuid, p_session_date date, p_delta int, p_reason text)`** — cron helper. Inserts `credit_deductions_v2` row with `ON CONFLICT (participation_id, session_date) DO NOTHING` for idempotency, then atomically `UPDATE … SET credits_remaining = credits_remaining + p_delta`. Returns whether the motion was applied.
- **`process_session_credits_v2()`** — hourly entry point. Applies the four-rule table from `products-redesign.md` §6.3. Returns JSONB summary `{ processed: n, granted: n, deducted: n, errors: n }`.

### RLS

Per `products-redesign.md` §5.8 table. **One DB test per new table** in `tests/db/`:
- `participations-rls.test.ts`
- `payments-rls.test.ts`
- `refunds-rls.test.ts`
- `family-subscriptions-rls.test.ts`
- `family-subscription-items-rls.test.ts`
- `product-subscription-prices-rls.test.ts`
- `session-cancellations-rls.test.ts`
- `credit-deductions-rls.test.ts`
- `product-seat-counts-rls.test.ts` — confirms anon + all roles can SELECT, no role can mutate.
- `product-seat-counts-trigger.test.ts` — exercises the trigger: insert/update/delete a `participations_v2` row, assert the rollup row reflects the new counts within the same transaction. Includes a test for status transitions (`reserving → active`, `active → waitlisted` after admin removal, etc.) since the trigger fires on `UPDATE OF status`.

Plus add the new tables to the existing `tests/db/access-control.test.ts` so the catalog-level checks fire.

### Types

After migration push, regen `src/types/database.types.ts`. Add to `src/types/index.ts`:

- `Participation`, `ParticipationStatus`, `ParticipationState` (the derived 3-state — `'waitlisted' | 'unassigned' | 'assigned'`).
- `Payment`, `Refund`, `FamilySubscription`, `FamilySubscriptionItem`.
- `PurchaseShape = 'bundle_1' | 'bundle_4' | 'bundle_10' | 'subscription_monthly' | 'subscription_quarterly' | 'single_payment' | 'free'`.

Helper:

```ts
export function participationStateOf(
  p: Pick<Participation, "status" | "group_id">,
): ParticipationState {
  if (p.status === "waitlisted") return "waitlisted";
  if (p.group_id === null) return "unassigned";
  return "assigned";
}
```

### Phase 1 verification

- `npm run lint` clean.
- `npm run type-check` clean.
- `npm run build` succeeds.
- DB tests run in CI on push: race tests pass, RLS tests pass, idempotency tests pass, `effective_status_v2` matches the TS twin.

---

## Phase 2 — Server-side Stripe

### Stripe pricing helpers — `src/lib/stripe/participation-prices.ts`

- **`computeBundleAmount(productId, bundleSize, currency)`** — pulls `product_prices_v2.price_per_session`, multiplies by `bundleSize`, applies `BUNDLE_DISCOUNTS[bundleSize]`. Returns smallest-unit integer.
- **`computeSinglePaymentAmount(productId, currency)`** — for camps/events. Pulls `product_prices_v2.price_per_session` (single-payment products store the per-attendance price there) — verify against the admin form's actual mapping.
- **`getOrCreateSubscriptionPrice(productId, frequency, currency)`** — looks up `product_subscription_prices_v2` row. If missing: creates a Stripe Product (one per club, named after the product) and a Price for `(frequency, currency)` with `unit_amount = price_per_month × multiplier × (1 − SUBSCRIPTION_DISCOUNTS[frequency])` and `recurring.interval` matching frequency. Caches the row, returns the Stripe price ID.
- **`getOrCreateStripeCustomer(customerId)`** — mirrors the existing `customer_profiles.stripe_customer_id` pattern. Returns the Stripe customer ID, creating one if absent.

### Constants — `src/lib/constants/pricing-v2.ts`

```ts
export const BUNDLE_DISCOUNTS = { 1: 0, 4: 0.10, 10: 0.20 } as const;
export const SUBSCRIPTION_DISCOUNTS = { monthly: 0, quarterly: 0.15 } as const; // yearly omitted
export const RESERVATION_LIFETIME_MINUTES = 30;
export const PARTICIPATION_CHARGE_WINDOW_HOURS = 24;
```

If any of these already exist in `src/lib/constants/pricing.ts` (the existing v1 file), reference instead of duplicating.

### Route — `POST /api/checkout/products/create`

- Auth: `requireRole('customer')`.
- Body: `{ productId, gamerId, purchaseShape, currency }`.
- Validates: customer owns the gamer, `purchaseShape` is in the allowed set, `currency` is supported.
- Calls `create_participation_v2`. Branches:
  - `{ kind: 'full' }` → returns `{ status: 'full' }` so the UI flips to a waitlist CTA.
  - `{ kind: 'free_active' }` → returns `{ status: 'free_confirmed', participationId }`. UI redirects to a success state. No Stripe.
  - `{ kind: 'reserving' }` → builds the Checkout Session per `purchaseShape`, returns `{ status: 'redirect', checkoutUrl }`.
- Stripe Checkout Session shape:
  - `bundle_*` → `mode: 'payment'`, single line item with inline `price_data` (currency + unit_amount from `computeBundleAmount`).
  - `subscription_*` → `mode: 'subscription'`, line item with the lazy-resolved subscription Price. `subscription_data.metadata` carries the same metadata as the session.
  - `single_payment` → `mode: 'payment'`, single line item with inline `price_data`.
- Common to all:
  - `expires_at = now() + 30 minutes` (matches reservation lifetime per redesign §4.6a).
  - `adaptive_pricing: { enabled: false }`.
  - `customer = stripeCustomerId` (existing or created).
  - `metadata: { reservationId, customerId, gamerId, productId, purchaseShape }` and matching `subscription_data.metadata` for subs.
  - `success_url` and `cancel_url` back to the originating product detail page with appropriate query params.

### Route — `POST /api/participations/waitlist`

- Auth: `requireRole('customer')`.
- Body: `{ productId, gamerId }`.
- Validates ownership.
- Calls `join_waitlist_v2`. Returns `{ participationId, waitlistPosition }`.

### Webhook — `POST /api/webhooks/stripe/products`

- Stripe signature verification using a **separate** webhook secret: `STRIPE_PRODUCTS_WEBHOOK_SECRET`. Add to `.env.local` schema and document.
- Handles events:
  - **`checkout.session.completed`** — pulls `reservationId` from `session.metadata`. Computes `creditsToGrant` from `purchaseShape` (bundle size, or 0). Calls `confirm_reservation_v2(reservationId, creditsToGrant)`.
    - `kind='confirmed'` → inserts `payments_v2` row with `stripe_event_id = event.id` (UNIQUE-protected). For sub mode, additionally finds-or-creates `family_subscriptions_v2` and inserts the `family_subscription_items_v2` row.
    - `kind='lost_seat'` → calls `stripe.refunds.create` for the payment intent, then calls `join_waitlist_v2` to put the parent on the waitlist. Inserts a `refunds_v2` row with `reason='subscription_period_proration'` *no* — use a new reason like `'lost_seat_after_payment'`. Add this to the enum if needed (it's a non-OPEN edge case the redesign doesn't enumerate).
  - **`invoice.paid`** — for subscription renewals. Skip if `billing_reason='subscription_create'` (handled by `checkout.session.completed`). Inserts `payments_v2` row idempotently.
  - **`customer.subscription.updated`** — syncs `family_subscriptions_v2.status`, `current_period_end`.
  - **`customer.subscription.deleted`** — sets `family_subscriptions_v2.status='cancelled'`, removes linked `family_subscription_items_v2` rows (this is the trigger for sub-coverage flipping to bundle-coverage on linked participations — coverage is computed from item-row presence, so removing the items is sufficient).
  - **`charge.refunded`** — inserts `refunds_v2` row idempotently.
  - **`checkout.session.expired`** — calls `expire_reservation_v2(reservationId)` to free the seat early. (Optional but cheap.)
- Idempotency: every write checks `stripe_event_id`. UNIQUE constraint is the safety net.
- Returns 200 for unhandled event types.
- Errors during write return 500 (Stripe will retry).

### Phase 2 verification

- Local Stripe CLI listens to `/api/webhooks/stripe/products` per `docs/stripe-testing.md` — `stripe listen` prints an ephemeral `whsec_...` for local dev that does **not** need to land in `.env.local` long-term.
- Hosted environments each get their own webhook endpoint + signing secret. See **"Stripe webhook deployment across environments"** below for the exact CLI commands to run at preview / staging / production.
- Manual test in dev: detail page → Stripe test card → return → participation appears.
- Integration tests in `tests/integration/api/`:
  - `participations-create-bundle.test.ts`
  - `participations-create-subscription.test.ts`
  - `participations-create-full-product.test.ts`
  - `participations-create-free-event.test.ts`
  - `participations-waitlist.test.ts`
  - `webhook-stripe-products-checkout-completed.test.ts`
  - `webhook-stripe-products-checkout-completed-lost-seat.test.ts`
  - `webhook-stripe-products-invoice-paid.test.ts`
  - `webhook-stripe-products-charge-refunded.test.ts`
  - `webhook-stripe-products-idempotency.test.ts`

---

## Phase 3 — Cron

`supabase/migrations/00040_session_credits_cron.sql`:

- `process_session_credits_v2()` per `products-redesign.md` §6.3 four-rule table. Use `apply_credit_motion_v2` for each session boundary.
- Schedule via pg_cron: `SELECT cron.schedule('process-session-credits-v2', '0 * * * *', $$SELECT process_session_credits_v2()$$);`. Don't replace the existing Sorg cron — both run during the parallel phase.
- Test: `tests/db/session-credits-cron.test.ts` covers all 4 rules + idempotency on re-run + the underflow guard (bundle attempting to drop below 0).

---

## Phase 4 — Service layer

`src/services/participations/`:

- **`participations.service.ts`** — `ParticipationsService` class taking `SupabaseClient<Database>`. Read methods:
  - `getMyParticipations()` — for the logged-in customer. Joins `participations_v2` ⇄ `products_v2` ⇄ `product_translations_v2` (resolved at adapter time) ⇄ `family_subscription_items_v2` (LEFT JOIN — `IS NOT NULL` indicates sub-covered). Returns rows shaped for the purchased card.
  - `getParticipationCounts(productIds: string[])` — returns `{ productId, activeCount, reservingCount, waitlistCount, mySignupState }[]`. Used by the browse + detail surfaces. `mySignupState` is the customer's own gamers' aggregate state for that product (`'none' | 'reserving' | 'waitlisted' | 'active'`).

  Write methods (`fetch()` to API routes; the injected client is unused by these methods, intentional per the service-layer pattern in CLAUDE.md):
  - `createParticipation(input)` — POSTs to `/api/checkout/products/create`.
  - `joinWaitlist(input)` — POSTs to `/api/participations/waitlist`.
- **`participations.queries.ts`** — React Query hooks:
  - `useMyParticipations()`.
  - `useParticipationCounts(productIds)` — feeds the browse + detail real seat math.
  - `useCreateParticipation()` mutation — invalidates `participationKeys.all` + `productsV2Keys.all`.
  - `useJoinWaitlist()` mutation — invalidates the same keys.
  - `participationKeys` factory: `all`, `mine`, `byProduct(id)`, `countsByProducts(ids)`.
- **`index.ts`** — barrel exports.

---

## Phase 5 — UI wiring

### 5a — Detail-page CTA

**`src/components/public/products-v2/signup-panel.tsx`:**

- Replace `onSubmit: () => {}` with `useCreateParticipation()` mutation.
  - On `{ status: 'redirect', checkoutUrl }` → `window.location.href = checkoutUrl` (full-page nav per CLAUDE.md auth/Stripe pattern).
  - On `{ status: 'free_confirmed' }` → invalidate participation queries, show a success affordance (small panel state — no separate page).
  - On `{ status: 'full' }` → flip the panel to its waitlist CTA branch.
- Add `useJoinWaitlist()` mutation. Wire to the panel's "Join the waitlist" button.

**`src/components/public/products-v2/signup-panel-view.tsx`:**

- Pass `onSubmit` and `onJoinWaitlist` as separate props on `SignupPanelViewProps`.
- The waitlist CTA branch calls `onJoinWaitlist`; the regular signup CTA calls `onSubmit`.

### 5b — Real participation counts in browse + detail

**This is the bit the design conversation flagged separately — don't skip it.** Today's adapters pass `participationsCount: 0` because there was no participations table. With real participations, the seat math, threshold progress, "almost full" warnings, and full-waitlist transitions all need real numbers. Plus the detail page needs to detect "this customer already signed up."

**`src/components/public/products-v2/product-browse-card.tsx` (the adapter):**

- Use `useParticipationCounts` for the products on the page. Feed `participationsCount: counts.activeCount + counts.reservingCount` to `deriveRegistrationState` so reserving rows are reflected in seat-left math.
- (For the threshold check inside the deriver, only `activeCount` matters — see redesign §4.11. The deriver currently takes a single `participationsCount`; review whether to split it into `seatsTakenCount` and `activeCount` parameters. If splitting, update the unit tests at `derive-registration-state.ts` accordingly.)

**`src/components/public/products-v2/product-detail-page.tsx` (the adapter):**

- Same wiring as the browse adapter for `participationsCount`.
- Additionally read `mySignupState` for this product. If `mySignupState !== 'none'`, render a different panel state instead of the signup form:
  - `'reserving'` → "Finishing your sign-up… check your email for the Stripe receipt." (Edge state — webhook should have flipped to `active` by the time the parent navigates back, but cover the gap.)
  - `'waitlisted'` → "You're on the waitlist for this club. We'll email you when a seat opens." Suppress the signup form.
  - `'active'` → "You're signed up." Link back to the parent's purchased products list.
- The "already signed up" branch is a new state on the existing panel — handle it as a discriminated union case in `SignupPanelView`, parallel to `closed_pre`, `running_late`, etc.

**`src/components/public/products-v2/derive-registration-state.ts`:**

- If splitting the count, update the parameter shape and tests.
- If staying with a single count, document explicitly which count is fed (`activeCount + reservingCount` for seat-left math; threshold uses the same count today, accept the small gap).

### 5b.1 — Realtime seat counter on the detail page

Parents on a popular drop need to see the seats tick down without refreshing — the parallel to the live countdown clock. Supabase Realtime + the `product_seat_counts_v2` rollup table (Phase 1) provides this.

**New hook — `src/services/participations/use-product-seat-counts-realtime.ts`:**

```ts
export function useProductSeatCountsRealtime(productId: string) {
  const queryClient = useQueryClient();
  const supabase = getClient();

  useEffect(() => {
    const channel = supabase
      .channel(`product-seat-counts-${productId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "product_seat_counts_v2",
          filter: `product_id=eq.${productId}`,
        },
        () => {
          // Per CLAUDE.md: realtime callbacks ONLY invalidate queries.
          // Never run Supabase data queries inside the callback.
          queryClient.invalidateQueries({
            queryKey: participationKeys.countsByProducts([productId]),
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [productId, queryClient, supabase]);
}
```

**Wire-up in `product-detail-page.tsx`:**

Mount `useProductSeatCountsRealtime(productId)` alongside the existing `useParticipationCounts`. The browser sees Realtime change events → React Query refetches the counts → adapter feeds the new number to `deriveRegistrationState` → the View re-renders with the new seat-left number, "Only 2 spots left" pill flip, full-waitlist transition, etc. — all without a page refresh and matching the "promise of the live countdown clock" the user expects on a ticket-drop product.

**Browse pages do *not* subscribe per-card.** A grid of 30 cards subscribing to 30 channels is excessive load. Browse cards refetch on tab focus (React Query default + a sensible `staleTime`); detail page is the only Realtime subscriber.

**Invalidation after Stripe Checkout return.** When the parent is bounced back via `success_url`, the page detects the success query param and immediately invalidates `participationKeys.all` and `productsV2Keys.byId(productId)`. This closes the small gap between webhook fulfilment and the parent's browser state, even on Realtime-flaky networks.

**Layout stability.** The seat-counter line uses `tabular-nums` so the numeric column doesn't shift width as the count changes (e.g. "9 of 10" → "10 of 10"). The "Only 2 spots left" pill replaces the seat-left count in-place — pre-reserve its space so the surrounding layout doesn't reflow. Per CLAUDE.md: rendered elements must not move without user interaction.

### 5c — Purchased card

**`src/components/public/products-v2/product-purchased-card.tsx` (adapter)** and **`product-purchased-card-view.tsx` (View):**

- Replace mock-driven adapter with real-row adapter feeding off `useMyParticipations`.
- Read placement state via `participationStateOf(participation)`.
- Status badge:
  - `waitlisted` → `"Waitlist"` (amber treatment).
  - `unassigned` and `assigned` → `"Confirmed"` (green treatment).
- Detail line:
  - `waitlisted` → "We'll email when a seat opens" (with `(N ahead of you)` if useful).
  - `unassigned` → "We'll set up your group".
  - `assigned` → next-session date (existing schedule formatter).
- Balance line — only for bundle-covered consumer-club rows:
  - Bundle-covered (no live `family_subscription_items_v2`, `credits_remaining > 0`) → `"{N} sessions left"`.
  - Sub-covered → `"Subscription"` (no balance number on the card per the agreement; balance lives on the detail page).
  - Bundle with `credits_remaining = 0` → `"No sessions left — buy more"` (or hide; design call — pick whichever ships fastest, leave a comment).
  - Free / external / camps / events → no balance line.

**`src/services/participations/use-my-participations.ts`** — already covered in Phase 4. Just consume here.

### 5d — Mock deletion

**Delete:**

- `src/components/public/products-v2/mock-purchased.ts`.
- The `?mock=1` gate inside `src/components/public/products-v2/product-browse-page.tsx`.
- `mock=1` references in `src/components/public/products-v2/use-browse-filters.ts` (if any).
- `MOCK_PURCHASED` references in `TODO.md`.
- Mock-purchased imports anywhere that consumes them.

**Keep:**

- `src/components/public/products-v2/mock-detail-fixtures.ts` — feeds the admin-only preview route at `/preview/products-v2/[type]/[state]`. Not parent-visible.
- `/admin/ui-components` page demos — get *updated*, not deleted. Phase 6 below.

### Phase 5 verification

- Manual: load `/clubs`, `/camps`, `/events` while logged in as a customer with at least one participation → sees real cards. Without participations → empty state.
- `?mock=1` URL param has no effect anywhere on the parent surfaces.
- Detail page CTA on a real product → real Stripe Checkout in test mode → return → card visible.
- Already-signed-up parent revisits a product detail page → sees the appropriate already-signed-up state, not the signup form.
- Browse seat-counter pill reflects real counts (deliberately full a 2-seat product in test mode and confirm "Full — waitlist open" appears).

---

## Phase 6 — Admin UI Components page

`src/app/(dashboard)/admin/ui-components/page.tsx`:

- Replace mock-purchased imports with directly-fed View props for every variation:
  - 3 placement states × {bundle / sub} × {consumer_club / camp / event}.
  - Plus edge cases: bundle with `credits_remaining = 0`, waitlisted with vs without position, sub mid-cycle.
- Add a new section header — "Purchased card states (waitlisted / unassigned / assigned)" — with one row per state.
- Confirm no dangling imports from deleted mock files.

---

## Phase 7 — Tests

### Race conditions — `tests/db/participations-race.test.ts`

**Deterministic via lock semantics, never via wall-clock timing.**

```ts
test("two parallel reservations on a 1-seat product: one wins, one full", async () => {
  for (let i = 0; i < 30; i++) {
    await resetParticipationState();
    const oneSeatProduct = await seedOneSeatProduct();
    const [a, b] = await Promise.all([
      client1.rpc("create_participation_v2", { ... gamerA }),
      client2.rpc("create_participation_v2", { ... gamerB }),
    ]);
    const reserved = [a, b].filter(r => r.data?.kind === "reserving").length;
    const full = [a, b].filter(r => r.data?.kind === "full").length;
    expect(reserved).toBe(1);
    expect(full).toBe(1);
  }
});

test("expired reservation is ignored by seat count", async () => {
  await admin.from("participations_v2").insert({
    status: "reserving",
    reserved_until: new Date(Date.now() - 60_000).toISOString(),
    ...
  });
  const result = await client.rpc("create_participation_v2", { ... });
  expect(result.data.kind).toBe("reserving");
});

test("webhook completes expired reservation when seat is still free", async () => {
  // Insert expired reservation, no other active rows.
  // Call confirm_reservation_v2 directly.
  // Expect: kind='confirmed'.
});

test("webhook completes expired reservation when seat is gone", async () => {
  // Insert expired reservation AND a separate active row for the same 1-seat product.
  // Call confirm_reservation_v2.
  // Expect: kind='lost_seat'.
});

test("idempotent webhook delivery", async () => {
  // Call webhook handler twice with identical event_id.
  // Expect: exactly one payments_v2 row, exactly one active participation.
});

test("parallel waitlist joins yield monotonic positions", async () => {
  // 5 parallel join_waitlist_v2 calls.
  // Expect: positions 1..5 with no duplicates.
});

test("join_waitlist_v2 is idempotent on existing waitlist row", async () => {
  // Same gamer joins twice — second call returns the same id and position.
});
```

### RLS — per-table files listed in Phase 1

Each table's RLS test exercises:
- Customer can SELECT own rows, cannot SELECT others'.
- Anon cannot SELECT any.
- Authenticated cannot INSERT/UPDATE/DELETE directly (writes are RPC-only).

### Cron — `tests/db/session-credits-cron.test.ts`

For each of the 4 rules in `products-redesign.md` §4.5:
- Set up a participation in the appropriate coverage state (with or without a `family_subscription_items_v2` row).
- Insert a `session_cancellations_v2` row if the rule needs it.
- Run `process_session_credits_v2()` against a known fixture state.
- Assert `credits_remaining` moved correctly and a `credit_deductions_v2` row exists with the right `delta` and `reason`.

Plus:
- Idempotency: run the cron twice in succession, assert no double-application.
- Underflow guard: bundle-covered participation with `credits_remaining = 0` and an attended (non-cancelled) session — the cron should write `delta = 0` (skipped) or raise gracefully and not push the value negative.

### Integration — listed in Phase 2

### Unit

- `tests/unit/participation-state-of.test.ts` — covers all 3 derivation cases.
- Update `tests/unit/derive-registration-state.test.ts` if the count parameter shape changes.

---

## Final verification checklist

Before opening the PR:

- [ ] `npm run lint` clean.
- [ ] `npm run type-check` clean.
- [ ] `npm run build` succeeds.
- [ ] `npm run test` (unit + integration) passes locally.
- [ ] Pushed to a branch and CI ran `npm run test:db` clean.
- [ ] Manual local Stripe CLI smoke: bundle purchase, sub purchase, single-payment purchase, free-event signup, waitlist join.
- [ ] Mock files (`mock-purchased.ts`) actually deleted, no dangling imports — `npm run lint` will catch unused imports, but grep for `mock-purchased` and `MOCK_PURCHASED` to be sure.
- [ ] `/admin/ui-components` exercises all three placement states across product types and coverage modes.
- [ ] `?mock=1` is no longer parsed anywhere on parent surfaces.
- [ ] `STRIPE_PRODUCTS_WEBHOOK_SECRET` documented in env-var schema.
- [ ] PR description includes a "what's NOT in this PR" section pointing to the deferred follow-ups below.
- [ ] Webhook endpoint + signing secret rolled forward to each Vercel environment per **"Stripe webhook deployment across environments"** below — preview at PR open, staging on merge to `dev`, live mode on cut to `main`.

---

## Stripe webhook deployment across environments

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

### 1. Preview (feature branch on PR open)

Done for `feat/v2-stripe-participations` on 2026-05-04. Repeat this if a future feature branch needs its own webhook.

```bash
# Test-mode webhook pointing at the branch preview URL
stripe webhook_endpoints create \
  --url "https://sogverse-git-<branch>-kyle-sogs-projects.vercel.app/api/webhooks/stripe/products" \
  --description "v2 products webhook (preview)" \
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

### 2. Staging (when this PR merges to `dev`)

The `dev` branch's preview URL is stable, but it's a different host than the feature-branch preview, so the existing webhook needs to be re-pointed (or a fresh one created and the old one deleted). Re-pointing is simpler — the signing secret stays the same and Vercel needs no change.

```bash
# Re-aim the existing test-mode endpoint at the staging URL
stripe webhook_endpoints update we_<id-from-step-1> \
  -d "url=https://sogverse-git-dev-kyle-sogs-projects.vercel.app/api/webhooks/stripe/products"
```

If the feature-branch preview also still needs to work (e.g. another PR is open against `dev` and we want both to fire), create a second endpoint instead of updating, and add the new secret to Vercel preview *scoped to that branch*: `vercel env add STRIPE_PRODUCTS_WEBHOOK_SECRET preview <git-branch> --sensitive`. Branch-scoped overrides take precedence over the unscoped preview value.

After the merge, smoke-test against staging: bundle purchase, sub purchase, waitlist join, refund.

### 3. Production (cut from `dev` to `main`)

Brand new live-mode endpoint, brand new signing secret in Vercel's `production` env. Do **not** reuse the test-mode secret in production.

```bash
# Live-mode webhook against the production domain
stripe webhook_endpoints create --live \
  --url "https://<prod-domain>/api/webhooks/stripe/products" \
  --description "v2 products webhook (production)" \
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

### What `.env.local` does NOT need

- `STRIPE_PRODUCTS_WEBHOOK_SECRET` is **not** required in `.env.local` for normal local dev. `stripe listen --forward-to localhost:3000/api/webhooks/stripe/products` prints a fresh `whsec_...` per session — paste that into the running process's env or your shell, not into committed-template files.
- `.env.local.example` documents the variable name only, with a comment pointing at this section. Do **not** check in any real `whsec_...` value.

---

## Follow-up PRs (do not build now)

Use this list verbatim in the PR description's "Future work":

- Customer-facing self-cancel flows (cancel-sub, leave-club, cancel-session) on the future purchased-product detail page.
- `switch_subscription_frequency_v2` — change monthly ⇄ quarterly.
- `admin_remove_participation_v2`, `cancel_product_v2` cascade with refunds.
- `finalize_completed_products_v2` daily job.
- Promote-from-waitlist email delivery (Brevo).
- Family discount coupon (`FAMILY_DISCOUNT_PERCENT`) — value undecided per redesign §11.
- Payment reporting dashboards.
- Purchased-product detail page itself.

---

## When you're done

`git rm docs/plans/v2-stripe-participations-plan.md` and commit. The decisions are documented in `products-redesign.md`; this file's purpose is consumed.
