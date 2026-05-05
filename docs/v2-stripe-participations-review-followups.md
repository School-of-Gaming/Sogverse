# v2 Stripe Participations — Review Follow-ups

This doc captures findings from the static code review on `feat/v2-stripe-participations` that **were NOT addressed in the merged branch**. The branch is feature-complete and not yet in prod; these are real issues we deliberately deferred so the PR could ship without piling on.

Each item is sorted into one of three buckets:

- **Schema lock-in.** Cheap to do now while data is empty/sparse, expensive after merge once production rows exist.
- **Correctness / reliability.** Real bugs that will fire eventually under normal operation. Not actively losing money today.
- **Test gaps.** Missing coverage for high-risk paths.
- **UX / a11y.** Polish that affects real customers but doesn't break flows.

What's already addressed lives in the relevant section of `products-redesign.md` (mostly §Phase 3 future improvements and §5.5).

---

## Schema lock-in (do early)

These are migrations. Once production has data, they need a data-cleanup pass before the constraint can be added. Adding now is one-line, zero-risk.

### `family_subscriptions_v2.status` is `TEXT CHECK`, not an enum

Inconsistent with every other status-shaped column in this migration. Loses type safety on `WHERE status IN (...)` queries. Cheap to fix now (define the enum, ALTER TYPE the column); expensive after rows exist (need data validation).

**Fix:** define `subscription_lifecycle_v2 AS ENUM ('active', 'past_due', 'canceling', 'incomplete', 'cancelled')` and migrate the column.

---

## Correctness / reliability

These will fire eventually, but not today. Defer-able with care.

### `process_session_credits_v2` has no catch-up window

Migration 00039:1271-1272, scheduled hourly in 00042. Hardcoded `NOW() - INTERVAL '1 hour'` window. One missed cron tick (deploy, DB restart, lock contention) = that hour of charges silently skipped. No replay, no high-water-mark, no error.

**Fix:** parameterize the window (`p_window_start TIMESTAMPTZ DEFAULT NOW() - INTERVAL '1 hour'`, `p_window_end DEFAULT NOW()`) so an operator can replay a missed range. Better still: persist `last_success_end` and default `window_start := COALESCE(last_success_end, NOW() - 1h)`. The `UNIQUE(participation_id, session_date)` on `credit_deductions_v2` already protects against double-charging on replay, so widening the window is safe.

### Realtime rollup `reserving_count` and `count_seats_taken_v2` disagree

00039:469 (rollup uses `reserved_until > NOW()`) vs 00041:25-30 (RPC dropped the time check, status alone holds the seat). Each query individually looks correct — together they diverge. Browse page fed by the rollup eventually shows "seats available" while `create_participation_v2` returns `kind='full'`. UX glitch: parent clicks → mid-click flip to waitlist.

**Fix:** make the rollup match RPC semantics — `COUNT(*) FILTER (WHERE status = 'reserving')` with no time filter.

### `subscriptions.update` metadata replaces, doesn't merge

`src/app/api/checkout/products/create/route.ts:238-246`. When parent inline-adds gamer #2, this overwrites the metadata (incl. `reservationId`) that was set for gamer #1. Future audit trails / Stripe-side debugging can only see the latest add.

**Fix:** either drop the `subscription.metadata` write entirely (link rows are already the source of truth) or GET-then-PUT-merge the metadata.

### `invoice.subscription` is deprecated on newer Stripe API versions

Webhook `route.ts:232-238` reads `invoice.subscription` directly. On Stripe API ≥ `2024-09-30.acacia` this moved to `invoice.parent.subscription_details.subscription`. **Silent bomb:** if the Stripe account API version updates (auto-prompts in dashboard), every renewal `invoice.paid` becomes a no-op and the DB stops recording renewals. No error, just missing rows.

**Fix:** pin `apiVersion` on the Stripe SDK constructor (`new Stripe(key, { apiVersion: '2024-...' })`), or add a helper that reads both shapes.

### `effective_status_v2` (and siblings) marked `STABLE` but read mutable `participations_v2`

Migration 00039:547-612. Same applies to `count_active_seats_v2`, `count_seats_taken_v2`. Today straight-line PL/pgSQL so no caching bites. But `STABLE` invites the planner to cache results within a statement. A future refactor that inlines these into a single SQL statement could silently produce stale counts.

**Fix:** mark `VOLATILE`. One-line per function.

### `Stripe.products.search` cache is race-prone

`src/lib/stripe/participation-prices.ts:160-185`. Two parents racing the first sub purchase on a product can both miss the search index (~1s lag) and create two Stripe Products. You can't delete Stripe Products that have Prices.

**Fix:** persist `stripe_product_id` on `products_v2` (or a sibling table) under a row lock. Treat the column as authoritative; never re-search Stripe.

### `promote_from_waitlist_v2` is read-only — caller-completes is non-atomic

Migration 00039:1043-1077. Function picks the lowest-position waitlist row and returns its metadata; doesn't mutate. The caller (route layer) is expected to do the actual flip. Two concurrent webhooks can pick the same waitlist row.

**Fix:** make the RPC actually mutate. `SELECT … FOR UPDATE SKIP LOCKED` against the waitlist row, then transition status atomically inside the function.

### `session_cancellations_v2` lacks audit columns

Migration 00039:363-369. No `cancelled_by` / `cancellation_source`. When the cancel-session UI ships and a customer cancels, you can't tell from the row whether the customer or an admin did it — exactly the question that arises in chargebacks.

**Fix:** add `cancelled_by UUID REFERENCES profiles(id)` (nullable for system-initiated) and `cancellation_source TEXT` (`'customer'|'admin'|'system'`) before the cancel-session RPC ships against this table.

---

## Test gaps

### Webhook tests missing for the recurring-revenue hot loop

`tests/integration/api/stripe-webhook-products.test.ts` — completely missing tests for:

- **`invoice.paid` renewal path** — the subscription-renewal hot loop. Every active sub fires this every period. Currently zero coverage. Tests should assert: `subscription_create` is filtered out, `existingPayment` dedup catches replays, `customer_id` is read from the family-sub row not the invoice metadata.
- **`charge.refunded`** — also zero coverage. The handler picks `data[0]` heuristic; deserves coverage.
- **`customer.subscription.updated`** — zero coverage.
- **Replay where `confirmJson.idempotent === true`** — the dedup-bypassed-but-idempotent path.
- **Unknown event types return 200** — easy regression catcher.

### RLS IDOR tests skipped for four tables

`tests/db/participations-rls.test.ts:24-30`. The comment dismisses cross-customer tests for `family_subscriptions_v2`, `family_subscription_items_v2`, `credit_deductions_v2`, `session_cancellations_v2` on the assumption that the participation ownership chain protects them. That's wrong for `family_subscriptions_v2.stripe_customer_id` (direct PII, keyed on its own `customer_id` column, not via participations).

**Fix:** add four cross-customer tests mirroring the symmetric refunds test that's already in this file. The helpers exist.

### `apply_credit_motion_v2` underflow regression test

The bundle-credit underflow path is fragile if the dedup key ever changes. Add a regression test: `credits_remaining=0 → underflow row inserted → buy more credits → next session charges normally`. Catches the class of bug where the underflow row would block all future motion.

---

## UX / a11y

These don't break flows, but real customers see them.

### Detail page skeleton reflows on purchased state

`src/components/public/products-v2/product-detail-page.tsx:182-208`. Skeleton renders a 2-col `max-w-5xl` layout; the purchased path swaps to `max-w-3xl` single-column placeholder. Customers buying their first product see a hard reflow. Violates the no-shift rule. Architecture doc already flags it.

**Fix when the real purchased layout lands:** branch the skeleton on a server-rendered hint or render a neutral subset.

### Nested `<Link><Button>` interactive descendants — invalid HTML, a11y broken

Five sites: `product-purchased-card-view.tsx:140-146`, `product-browse-card-view.tsx:170-172`, `signup-panel-view.tsx:149-153, 541-553, 575-580`. Renders `<a><button>…</button></a>` — invalid HTML, double-announcing screen readers, focus weirdness for keyboard users.

**Fix:** `<Button asChild><Link …>…</Link></Button>` — shadcn pattern. Five small edits.

### Signup CTA missing spinner during submit

`signup-panel-view.tsx:648-660`. The `committing` flag is correctly wired into `disabled` (matches CLAUDE.md rule). But no `Loader2` icon. Other forms in the project (admin form) include the icon.

**Fix:** add `<Loader2 className="animate-spin" />` per house convention. Add `aria-busy={submitting}` while there.

### Inline-add CTA copy overflow at high prices

`signup-panel-view.tsx` `ctaInlineAddSub`. When the parent has a live family sub and the next add is a yearly tier (e.g., `€600.00` charged today), "Add to your subscription · €600.00 (charged today)" is too long for a single-line button. Word-wraps awkwardly.

**Fix options:** drop price from CTA and surface in panel body; or shorten to "Add · €600.00" with a smaller "charged today" caption underneath; or stack on narrow widths.

### Other a11y polish

- Submit-error focus management — when error lands on `'full'` race, no audible cue + no focus move.
- Gamer picker uses `role="radio"` on `<button>` but doesn't implement radiogroup keyboard semantics (arrow keys, roving tabindex). Native `<input type="radio">` with peer styling is the cheaper fix.

### Performance / quality

- Unmemoized `new Date()` in card derivation (`product-browse-card.tsx:55-59`, `product-detail-page.tsx:135-139`) — fresh `Date` per render defeats downstream memoization.
- `mock-detail-fixtures.ts` uses `as never` per leaf — brittle to schema drift. Fixture-only.
- Comment drift in `signup-panel.tsx:115-116` — references a `myParticipationState refresh` that's actually a `useParticipationCounts` invalidation.
- Query invalidation too coarse: `useCreateParticipation`'s `onSuccess` invalidates `productV2Keys.all` (sledgehammer) — should scope to `productV2Keys.detail(productId)`.

---

## Out-of-scope items (also flagged in review, deliberately not in this PR)

These are documented in `products-redesign.md` already; listing here as a cross-reference:

- **Cancel flow + cascade audit-trail loss** — `cancel_participation_v2` hard-deletes; CASCADE wipes `credit_deductions_v2` and `session_cancellations_v2`. Documented as TODO in `products-redesign.md` §5.5; **must be addressed before the cancel UI ships**, not before this PR merges.
- **Inline-add atomicity gap** — three-step sequence (Stripe charge → DB confirm → link insert) can drop the link row on a DB blip. Documented in `products-redesign.md` Phase 3 future improvements. The purchased-product detail placeholder surfaces this drift visually for testing/support.
- **Stripe redirect URLs in security audit scope** — `docs/SECURITY_REPORT.md` (2026-03-01) didn't cover redirect URL validation; the Host-header open redirect (fixed) and `//evil.com/path` returnPath bypass (in scope below) both slipped through. Add to the next audit's coverage.

---

## Suggested order if/when picking these up

1. **Schema lock-ins** — migrations are cheap before data exists, expensive after. `family_subscription_items_v2 UNIQUE(participation_id)` and the `family_subscriptions_v2.status` enum are both one-shot.
2. **`returnPath: "//evil.com/path"` fix** — security, ~5 min. Already in scope for this PR / next iteration.
3. **Webhook tests for the recurring-revenue hot loop** — high-value coverage, no schema risk.
4. **Stripe API version pin + `invoice.subscription` shape** — silent-bomb prevention, one-time SDK change.
5. **Realtime rollup vs. RPC seat-math fix** — UX glitch, two-line change.
6. **Catch-up window for `process_session_credits_v2`** — production reliability before going live.
7. **Everything else** — handle as part of polishing for launch.
