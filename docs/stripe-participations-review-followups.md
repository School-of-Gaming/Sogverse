# Stripe Participations — Review Follow-ups

This doc captures findings from the static code review of the Stripe participations work that **were NOT addressed in the merged branch**. These are real issues we deliberately deferred so the PR could ship without piling on.

Each item is sorted into one of three buckets:

- **Schema lock-in.** Cheap to do now while data is empty/sparse, expensive after merge once production rows exist.
- **Correctness / reliability.** Real bugs that will fire eventually under normal operation. Not actively losing money today.
- **Test gaps.** Missing coverage for high-risk paths.
- **UX / a11y.** Polish that affects real customers but doesn't break flows.

What's already addressed lives in the relevant section of `products-architecture.md` (mostly the deferred/future items and the participations model).

---

## Schema lock-in (do early)

These are migrations. Once production has data, they need a data-cleanup pass before the constraint can be added. Adding now is one-line, zero-risk.

### `family_subscriptions.status` is `TEXT CHECK`, not an enum

Inconsistent with every other status-shaped column in this migration. Loses type safety on `WHERE status IN (...)` queries. Cheap to fix now (define the enum, ALTER TYPE the column); expensive after rows exist (need data validation).

**Fix:** define `subscription_lifecycle AS ENUM ('active', 'past_due', 'canceling', 'incomplete', 'cancelled')` and migrate the column.

**Note for whoever does it:** the webhook already treats this five-value set as a closed vocabulary and translates every Stripe subscription status into it before writing — Stripe's own set is wider and spells cancellation with one `l`. The enum must therefore be exactly these five values, and the translation table in the webhook is the second place that has to agree; changing one without the other is a rejected write.

---

## Correctness / reliability

These will fire eventually, but not today. Defer-able with care.

### ~~Realtime rollup `reserving_count` and `count_seats_taken` disagree~~ (resolved)

The rollup counted a pre-payment hold only while its deadline was in the future; the capacity RPC counted every hold regardless. The browse page showed "seats available" while checkout answered "full", permanently, with no way for a parent to tell why.

**Resolved** by removing the pre-payment hold entirely: a paid participation is created when Stripe confirms payment, so the only thing that holds a seat is an active row, and both the rollup and the gate count exactly that. Left here because the shape of the bug — two queries each individually correct, counting the same thing differently — is the one to watch for if a seat hold is ever reintroduced.

### ~~Webhook payloads read from one API version's field placement~~ (resolved)

Two fields the products webhook depends on have moved between Stripe API versions, and each was read from exactly one of its two homes:

- **The invoice's subscription id.** Top-level `subscription` up to API `2024-09-30.acacia`; `parent.subscription_details.subscription` from that version on. Read from the old place only, so on a newer version every renewal `invoice.paid` became an early return and renewals stopped being recorded.
- **The charge's refund list.** Stripe stopped auto-expanding `refunds` on the Charge object in API `2022-11-15`, and a webhook event object is never expanded regardless — so from that version on the field is simply absent. Read as "no refunds to record", so refunds stopped being recorded.

Both were the same shape of failure and the worst kind: no error, a 200 back to Stripe, and rows quietly missing.

**Resolved** by reading both placements — newer location first, falling back to the older — and by fetching the refund list when the payload carries none. The integration suite now exercises each of these events in **both** payload shapes, with each fixture carrying the field in exactly one place, so a handler that reads only one location fails.

**The correction worth keeping:** the original write-up proposed pinning `apiVersion` on the SDK constructor as the fix. It is not one. **The constructor's `apiVersion` governs outbound calls only — the shape of an incoming webhook payload is decided by the API version pinned on the webhook endpoint, or by the Stripe account default while that endpoint is unpinned.** The two move independently, and the endpoint's version can change without any deploy of ours, so a handler cannot assume either shape and has to read both. Pinning the constructor is still worth doing (see below), just for a different reason.

### Pin the outbound API version — done, and it is a separate concern

The SDK is now instantiated once, in a single shared module, with an explicit `apiVersion`. Three things about it:

- **It protects our outbound *reads*, not our webhook handlers.** An unpinned client tracks the account default, so an account upgrade reshapes every response we parse — at the moment someone clicks a button in the Stripe dashboard, with no deploy and no warning.
- **The pinned literal must be the version the installed SDK's types describe.** The SDK ships response types for exactly one version and types the `apiVersion` option to that same literal, so TypeScript refuses any other value. That is deliberate and useful: an SDK upgrade surfaces as a compile error at the pin rather than as a runtime shape mismatch, and `type-check` becomes a real audit of every SDK response field we read.
- **Pinning changes response shapes at deploy time**, ahead of any webhook cutover, so it needs the outbound reads audited in the same change — not just the ones the compiler can see. Fields that merely *moved* type-check fine when read through a fallback and have to be eyeballed.

### A recurring-value field to keep in mind: `current_period_end`

It sits on the subscription in older API versions and on the subscription *items* in newer ones, and the webhook reads whichever side has it. Worth naming because it is the third instance of the same pattern and the one most likely to catch the next reader out: unlike the two above, reading only one side yields a `null` period end rather than a skipped row, so it degrades quietly instead of stopping.

### `effective_status` (and siblings) marked `STABLE` but read mutable `participations`

Migration 00039:547-612. Same applies to `count_active_seats`, `count_seats_taken`. Today straight-line PL/pgSQL so no caching bites. But `STABLE` invites the planner to cache results within a statement. A future refactor that inlines these into a single SQL statement could silently produce stale counts.

**Fix:** mark `VOLATILE`. One-line per function.

### `Stripe.products.search` cache is race-prone

`src/lib/stripe/participation-prices.ts:160-185`. Two parents racing the first sub purchase on a product can both miss the search index (~1s lag) and create two Stripe Products. You can't delete Stripe Products that have Prices.

**Fix:** persist `stripe_product_id` on `products` (or a sibling table) under a row lock. Treat the column as authoritative; never re-search Stripe.

### ~~`promote_from_waitlist` is read-only — caller-completes is non-atomic~~ — *Resolved: dropped in 00116*

The read-only stub was **deleted** (migration 00116), not fixed. We decided against automatic promotion; the replacement shipped in 00118 as manual, admin-driven `promote_from_waitlist` / `demote_to_waitlist` under the product-row gate lock, driven by the groups-panel drag UI (see `products-architecture.md`, "Waitlist"). As predicted, the gate lock the other participation RPCs hold already serializes promotion, so it runs under that lock rather than the originally-suggested `FOR UPDATE SKIP LOCKED`.

---

## Test gaps

### Webhook tests for the recurring-revenue hot loop — mostly closed

`tests/integration/api/stripe-webhook-products.test.ts` now covers `invoice.paid` (both payload shapes, the `subscription_create` filter, the replay dedup, `customer_id` read from the family-sub row rather than invoice metadata), `charge.refunded` (both payload shapes, including the fetch when nothing is expanded), and `customer.subscription.updated` (the status mapping and both halves of the silent-write bug).

**The rule those tests encode, for whoever adds the next one:** a payload field Stripe has relocated between API versions gets a fixture per placement, and each fixture carries the field in **exactly one** of them. A fixture holding both passes for a handler that reads only whichever it happens to prefer, which is the entire failure mode being guarded against.

Still open:

- **Replay where the confirm RPC reports it recognised its own earlier work** — the dedup-bypassed-but-idempotent path.
- **Unknown event types return 200** — easy regression catcher.

### RLS IDOR test skipped for `family_subscriptions`

`tests/db/participations-rls.test.ts`. The comment dismisses a cross-customer test for `family_subscriptions` on the assumption that the participation ownership chain protects it. That's wrong for `family_subscriptions.stripe_customer_id` (direct PII, keyed on its own `customer_id` column, not via participations).

**Fix:** add a cross-customer test mirroring the symmetric refunds test that's already in this file. The helpers exist.

---

## UX / a11y

These don't break flows, but real customers see them.

### Signup CTA missing spinner during submit

`signup-panel-view.tsx:648-660`. The `committing` flag is correctly wired into `disabled` (matches CLAUDE.md rule). But no `Loader2` icon. Other forms in the project (admin form) include the icon.

**Fix:** add `<Loader2 className="animate-spin" />` per house convention. Add `aria-busy={submitting}` while there.

### Other a11y polish

- Submit-error focus management — when error lands on `'full'` race, no audible cue + no focus move.
- Gamer picker uses `role="radio"` on `<button>` but doesn't implement radiogroup keyboard semantics (arrow keys, roving tabindex). Native `<input type="radio">` with peer styling is the cheaper fix.

### Performance / quality

- Unmemoized `new Date()` in card derivation (`product-browse-card.tsx:55-59`, `product-detail-page.tsx:135-139`) — fresh `Date` per render defeats downstream memoization.
- `mock-detail-fixtures.ts` uses `as never` per leaf — brittle to schema drift. Fixture-only.
- Query invalidation too coarse: `useCreateParticipation`'s `onSuccess` invalidates `productKeys.all` (sledgehammer) — should scope to `productKeys.detail(productId)`.

---

## Out-of-scope items (also flagged in review, deliberately not in this PR)

These are documented in `products-architecture.md` already; listing here as a cross-reference:

- **Stripe redirect URLs in security audit scope** — `docs/SECURITY_REPORT.md` (2026-03-01) didn't cover redirect URL validation; the Host-header open redirect and `//evil.com/path` returnPath bypass (both since fixed) slipped through. Add redirect URL validation to the next audit's coverage.

---

## Suggested order if/when picking these up

1. **Schema lock-in** — the `family_subscriptions.status` enum is a one-shot migration, cheap before data exists.
2. **Recreate the products webhook endpoint pinned to a current API version.** The code now reads both shapes of everything that moved, so this is safe to do — but until it happens the endpoint still tracks the account default, which is ancient, and an account-level upgrade would flip every payload at once with no deploy involved. Pinning the endpoint makes the version an explicit, reviewable decision instead of a dashboard prompt.
3. **`Stripe.products.search` race** — persist the Stripe product id instead of re-searching.
4. **Realtime rollup vs. RPC seat-math fix** — UX glitch, two-line change.
5. **Everything else** — handle as part of polishing for launch.
