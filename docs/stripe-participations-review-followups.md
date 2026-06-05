# Stripe Participations — Review Follow-ups

This doc captures findings from the static code review of the Stripe participations work that **were NOT addressed in the merged branch**. These are real issues we deliberately deferred so the PR could ship without piling on.

Each item is sorted into one of three buckets:

- **Schema lock-in.** Cheap to do now while data is empty/sparse, expensive after merge once production rows exist.
- **Correctness / reliability.** Real bugs that will fire eventually under normal operation. Not actively losing money today.
- **Test gaps.** Missing coverage for high-risk paths.
- **UX / a11y.** Polish that affects real customers but doesn't break flows.

What's already addressed lives in the relevant section of `products-architecture.md` (mostly §Phase 3 future improvements and §5.5).

---

## Schema lock-in (do early)

These are migrations. Once production has data, they need a data-cleanup pass before the constraint can be added. Adding now is one-line, zero-risk.

### `family_subscriptions.status` is `TEXT CHECK`, not an enum

Inconsistent with every other status-shaped column in this migration. Loses type safety on `WHERE status IN (...)` queries. Cheap to fix now (define the enum, ALTER TYPE the column); expensive after rows exist (need data validation).

**Fix:** define `subscription_lifecycle AS ENUM ('active', 'past_due', 'canceling', 'incomplete', 'cancelled')` and migrate the column.

---

## Correctness / reliability

These will fire eventually, but not today. Defer-able with care.

### Realtime rollup `reserving_count` and `count_seats_taken` disagree

00039:469 (rollup uses `reserved_until > NOW()`) vs 00041:25-30 (RPC dropped the time check, status alone holds the seat). Each query individually looks correct — together they diverge. Browse page fed by the rollup eventually shows "seats available" while `create_participation` returns `kind='full'`. UX glitch: parent clicks → mid-click flip to waitlist.

**Fix:** make the rollup match RPC semantics — `COUNT(*) FILTER (WHERE status = 'reserving')` with no time filter.

### `invoice.subscription` is deprecated on newer Stripe API versions

Webhook `route.ts:232-238` reads `invoice.subscription` directly. On Stripe API ≥ `2024-09-30.acacia` this moved to `invoice.parent.subscription_details.subscription`. **Silent bomb:** if the Stripe account API version updates (auto-prompts in dashboard), every renewal `invoice.paid` becomes a no-op and the DB stops recording renewals. No error, just missing rows.

**Fix:** pin `apiVersion` on the Stripe SDK constructor (`new Stripe(key, { apiVersion: '2024-...' })`), or add a helper that reads both shapes.

### `effective_status` (and siblings) marked `STABLE` but read mutable `participations`

Migration 00039:547-612. Same applies to `count_active_seats`, `count_seats_taken`. Today straight-line PL/pgSQL so no caching bites. But `STABLE` invites the planner to cache results within a statement. A future refactor that inlines these into a single SQL statement could silently produce stale counts.

**Fix:** mark `VOLATILE`. One-line per function.

### `Stripe.products.search` cache is race-prone

`src/lib/stripe/participation-prices.ts:160-185`. Two parents racing the first sub purchase on a product can both miss the search index (~1s lag) and create two Stripe Products. You can't delete Stripe Products that have Prices.

**Fix:** persist `stripe_product_id` on `products` (or a sibling table) under a row lock. Treat the column as authoritative; never re-search Stripe.

### `promote_from_waitlist` is read-only — caller-completes is non-atomic

Migration 00039:1043-1077. Function picks the lowest-position waitlist row and returns its metadata; doesn't mutate. The caller (route layer) is expected to do the actual flip. Two concurrent webhooks can pick the same waitlist row.

**Fix:** make the RPC actually mutate. `SELECT … FOR UPDATE SKIP LOCKED` against the waitlist row, then transition status atomically inside the function.

---

## Test gaps

### Webhook tests missing for the recurring-revenue hot loop

`tests/integration/api/stripe-webhook-products.test.ts` — completely missing tests for:

- **`invoice.paid` renewal path** — the subscription-renewal hot loop. Every active sub fires this every period. Currently zero coverage. Tests should assert: `subscription_create` is filtered out, `existingPayment` dedup catches replays, `customer_id` is read from the family-sub row not the invoice metadata.
- **`charge.refunded`** — also zero coverage. The handler picks `data[0]` heuristic; deserves coverage.
- **`customer.subscription.updated`** — zero coverage.
- **Replay where `confirmJson.idempotent === true`** — the dedup-bypassed-but-idempotent path.
- **Unknown event types return 200** — easy regression catcher.

### RLS IDOR test skipped for `family_subscriptions`

`tests/db/participations-rls.test.ts`. The comment dismisses a cross-customer test for `family_subscriptions` on the assumption that the participation ownership chain protects it. That's wrong for `family_subscriptions.stripe_customer_id` (direct PII, keyed on its own `customer_id` column, not via participations).

**Fix:** add a cross-customer test mirroring the symmetric refunds test that's already in this file. The helpers exist.

---

## UX / a11y

These don't break flows, but real customers see them.

### Detail page skeleton reflows on purchased state

`src/components/public/products/product-detail-page.tsx:182-208`. Skeleton renders a 2-col `max-w-5xl` layout; the purchased path swaps to `max-w-3xl` single-column placeholder. Customers buying their first product see a hard reflow. Violates the no-shift rule. Architecture doc already flags it.

**Fix when the real purchased layout lands:** branch the skeleton on a server-rendered hint or render a neutral subset.

### Signup CTA missing spinner during submit

`signup-panel-view.tsx:648-660`. The `committing` flag is correctly wired into `disabled` (matches CLAUDE.md rule). But no `Loader2` icon. Other forms in the project (admin form) include the icon.

**Fix:** add `<Loader2 className="animate-spin" />` per house convention. Add `aria-busy={submitting}` while there.

### Other a11y polish

- Submit-error focus management — when error lands on `'full'` race, no audible cue + no focus move.
- Gamer picker uses `role="radio"` on `<button>` but doesn't implement radiogroup keyboard semantics (arrow keys, roving tabindex). Native `<input type="radio">` with peer styling is the cheaper fix.

### Performance / quality

- Unmemoized `new Date()` in card derivation (`product-browse-card.tsx:55-59`, `product-detail-page.tsx:135-139`) — fresh `Date` per render defeats downstream memoization.
- `mock-detail-fixtures.ts` uses `as never` per leaf — brittle to schema drift. Fixture-only.
- Comment drift in `signup-panel.tsx:115-116` — references a `myParticipationState refresh` that's actually a `useParticipationCounts` invalidation.
- Query invalidation too coarse: `useCreateParticipation`'s `onSuccess` invalidates `productKeys.all` (sledgehammer) — should scope to `productKeys.detail(productId)`.

---

## Out-of-scope items (also flagged in review, deliberately not in this PR)

These are documented in `products-architecture.md` already; listing here as a cross-reference:

- **Stripe redirect URLs in security audit scope** — `docs/SECURITY_REPORT.md` (2026-03-01) didn't cover redirect URL validation; the Host-header open redirect (fixed) and `//evil.com/path` returnPath bypass (in scope below) both slipped through. Add to the next audit's coverage.

---

## Suggested order if/when picking these up

1. **Schema lock-in** — the `family_subscriptions.status` enum is a one-shot migration, cheap before data exists.
2. **`returnPath: "//evil.com/path"` fix** — security, ~5 min. Already in scope for this PR / next iteration.
3. **Webhook tests for the recurring-revenue hot loop** — high-value coverage, no schema risk.
4. **Stripe API version pin + `invoice.subscription` shape** — silent-bomb prevention, one-time SDK change.
5. **Realtime rollup vs. RPC seat-math fix** — UX glitch, two-line change.
6. **Everything else** — handle as part of polishing for launch.
