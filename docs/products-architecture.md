# Products Architecture — Unifying Clubs, Camps, and Events

The canonical architecture of the `products` domain. It supports **four product types** (consumer clubs, municipality clubs, camps, events) priced in **real currency**, as a single unified shape.

Status: **In production.** DB foundation, admin create/edit UI, the checkout / webhook path, and the parent-facing browse + detail surfaces are shipped. See §10 for the per-bullet status of what's built vs. still planned.

This doc is both the design rationale and the as-built reference: §1–§9 cover the business rules, schema, RPCs, and permission topology; §10 onward track what shipped and the component map.

Related: `locations-architecture.md`, `voice-chat-architecture.md`, `email-architecture.md`, `whatsapp-automated-flow.md`.

---

## How to use this document (doc vs. mockups)

Treat this doc as the canonical spec. Three UX mockups live alongside it on the `feature/school-clubs-mockup` branch:

- **Admin create-product mockup** at `/admin-mockup/products/new` — sketches the admin flow for all four product types, including the location tree, Gedu picker, group cards, and three-mode start trigger.
- **Parent browse mockup** at `/browse-mockup` — sketches the consumer catalog (clubs / camps / events, muni clubs excluded): filter bar, help-me-decide quiz, and the shared detail + signup page.
- **Parent registration mockup** at `/registration` — sketches the municipality-club-only flow: location-first search across the `locations` tree, muni-only listings per location, ticket-drop countdown, one-click registration, waitlist experience. Detail URL is `/registration/club/[slug]` — never cross-linked to `/browse-mockup`.

Both mockups are deliberately built **without** i18n, RBAC, real data queries, or the real design-system patterns of the codebase — they exist so the product team can click through and react to flows. UI design is **out of scope for this doc**. UI rollout happens under separate, explicitly-approved design passes.

The doc is the source of truth; the mockups stay behind as visual references:

- **Doc is the source of truth** for business rules, schema, RPCs, per-type behavior, and permission topology. Anything production needs that the mockups don't model — auth, RLS, query invalidation, accessibility, i18n, dark-mode contrast — lives in the doc. If it's in the doc, build it; if it's not, flag it and update the doc before coding.
- **Mockups are sketches** for UX patterns. Look at them while building those screens; don't port them line-by-line.
- **If the doc and a mockup disagree, the doc wins.**

---

## 1. Why this shape

An earlier `products` schema was built for a single product line — weekly consumer clubs priced in Sorg tokens. A `product_groups` layer organized participants and Gedus within a product, and `group_enrollments` + `enrollment_charges` drove per-session token billing. Extending that token-era schema to support fiat pricing and multi-purchase-shape checkout would have leaked concepts across every table and RPC, so the domain was reshaped from the ground up. Groups are retained and generalized (§4.1); the schema around them now serves all four product types uniformly.

Two things define this design:

1. **Four product types as first-class citizens** (consumer clubs, municipality clubs, camps, events) instead of one.
2. **EUR pricing with Adaptive Pricing at checkout.** Products are authored, displayed, and recorded in EUR. Stripe Checkout's Adaptive Pricing presents each customer their local currency and settles us in EUR (§4.5). Each product type has exactly one purchase option: consumer clubs are a flat monthly family subscription; camps and paid events are a single upfront payment; events can also be free.

---

## 2. The four product types

| | **Consumer club** | **Municipality club** | **Camp** | **Event** |
|---|---|---|---|---|
| **UI verb (parent)** | Enroll | Register | Sign up | Join |
| **Who pays us** | Parent, ongoing | Municipality, off-platform | Parent, upfront | Parent (upfront) or free |
| **Pricing shape** | Monthly family subscription | External contract | Single upfront payment | Single upfront payment, or free |
| **Schedule** | Recurring, no end | Recurring, term-bounded | Recurring, camp-bounded | One-off |
| **Days per week** | Typically 1 | Typically 1 | Often 2–5 | 1 date |
| **Capacity** | Seat-capped | Seat-capped | Seat-capped | Seat-capped or uncapped |
| **Waitlist** | Yes | Yes | Yes | Optional |
| **Gated access** | No | No (deliberate simplification) | No | No |
| **Refunds** | Cancel sub via Stripe portal; stops at period end | None (municipality-paid) | Cutoff before start; admin after | Cutoff before start |
| **Registration opens at** | Always set (immediate or scheduled) | Always set; muni clubs lean on it for the "ticket drop" moment | Always set (immediate or scheduled) | Always set (immediate or scheduled) |
| **Holiday calendars** | Applies | Applies | **N/A** (camps run *during* school breaks) | N/A (single-date) |
| **Start trigger modes offered** (§4.11) | All three | Fixed date only | Fixed date; fixed date + minimum | All three |

### The unifying observation

The four types share **~80%** of the operational model: schedule, location, topic, language, age range, Gedu(s), participation, attendance, notes, waitlist, and — for online products only — a voice room. They differ primarily on **pricing shape** and **schedule shape** — two dimensions captured with small, orthogonal fields rather than separate tables.

---

## 3. Terminology

### "Municipality club," not "school club"

The customer-facing and internal name is **municipality club** (schema value `municipality_club`). These clubs are run at whatever venue the municipality prefers — school computer rooms, library meeting rooms, community centres — so anchoring the name to "school" is inaccurate. Do not introduce "school club" / "school-club" as a synonym in UI copy, URLs, schema, or docs.

### UI verbs (parent-facing copy)

Four different verbs per product type:

| Product type | Verb |
|---|---|
| Consumer club | **Enroll** |
| Municipality club | **Register** |
| Camp | **Sign up** |
| Event | **Join** |

These are copy choices that reflect how each product feels to a parent. They do **not** propagate into the schema, query keys, RPC names, or URLs.

### Schema noun

The database uses **one** generic noun for the participation record: **`participations`**. A participation is a gamer's seat (or waitlist spot) on a product, regardless of product type. UI verbs are a presentation concern.

The Stripe webhook for this domain lives at `/api/webhooks/stripe/products`; the participation service is `ParticipationsService`. Object names are domain-named, not version-named.

### Participation state vocabulary

A purchased participation is in one of three states. These are the canonical names everywhere — code, types, copy mappings, design discussions, doc cross-references. Parents never see these labels; they're internal names for a state that's derived from the row, not stored.

| State | Schema | Meaning |
|---|---|---|
| `waitlisted` | `status = 'waitlisted'` | On the waitlist. Card not charged. |
| `unassigned` | `status = 'active' AND group_id IS NULL` | Has a spot. Admin hasn't placed the gamer in a group yet. |
| `assigned` | `status = 'active' AND group_id IS NOT NULL` | Has a spot. Placed in a group. |

```ts
export type ParticipationState = "waitlisted" | "unassigned" | "assigned";
```

Resolved from the row at read time. Parent-facing copy maps off this state — for the launch, both `unassigned` and `assigned` render the same "Confirmed" badge so parents experience them as one state ("you have a spot"), with the detail line shifting to surface the next session date once an admin places the gamer. The state is exposed in admin surfaces and in the UI Components style guide so all three branches are testable.

---

## 4. Key design decisions

### 4.1 Gedu Groups: admin-only cohort layer, used by every product type

The `product_groups` layer is **kept** and generalized. Every product type uses groups.

**The model:**

- A product has **0 or more Gedu Groups**. Admins create groups when and how they want. An admin can create groups up-front during product creation, but the typical flow is: create the product → wait for seats to sell → decide the right number of groups based on actual demand → create them then.
- Each group has a **name**, **0 or more assigned Gedus**, and **0 or more participations** (gamers who've been placed into it).
- **Parents never see groups.** They see the product.
- **Groups have no seat cap.** Capacity lives on the product. Admins balance participants across groups manually.
- A group with zero Gedus is valid; a group with zero participations is valid.

**Gedus attach to groups, not products.** A Gedu is assigned to **at most one group per product** (enforced at the schema level — see §5.4). A Gedu can still be on multiple *different* products simultaneously.

**Admins manually avoid scheduling conflicts across products** — a Gedu shouldn't be on two groups whose computed sessions overlap in time. For now this is a human-enforced discipline; the system does not validate it. See §11 for the planned conflict-prevention constraint.

**Cross-group voice mobility (online products).** All Gedus assigned to any group within the same product can join any sibling group's voice room. Gamers cannot hop — a gamer can only see and join their own group's voice room.

**Unassigned participations queue.** When a parent buys a seat, the participation lands with `group_id = NULL` — an "unassigned" inbox that admins work through, placing each gamer into a suitable group.

**Parallel cohorts.** Cohorts that differ only in Gedu / voice room are multiple groups within one product. Cohorts that differ in schedule (different weekday / start time) are separate products.

### 4.2 Dynamic session computation

Session dates are **not** stored. They are computed on read from:

- `products.start_date`, `products.end_date` (nullable = ongoing)
- `schedule_slots` (one row per weekday, with its own `start_time` and `duration_minutes`)
- Subscribed `holiday_calendars` (shared, e.g. "Finnish national holidays")
- `session_overrides` (sparse — only dates that deviate)

**What we gain:** extending a camp by 2 weeks is `UPDATE products SET end_date = ...`; new session dates appear everywhere instantly. Adding a holiday to a shared calendar updates every subscribed product at once. No "regenerate" failure modes.

**What we give up:** no `sessions.id` — every session is keyed by `(product_id, session_date)`. Attendance, notes, and overrides use this composite.

**Edge case noted:** the composite key precludes two sessions on the same date for the same product. Adding a `slot_index` column would be a small migration if ever needed.

### 4.3 Timezones

- `products.timezone` — IANA zone, e.g., `Europe/Helsinki`. The product's home timezone.
- `session_date` — DATE interpreted in the product's timezone.
- `schedule_slots.start_time` — TIME in the product's timezone. Clock time is stable across DST; UTC offset shifts automatically.
- All `*_at` columns — `timestamptz`, stored as UTC, rendered in viewer's tz.
- `holiday_calendars` have a `timezone`; subscribed products should share it.

Rendering converts `(session_date, start_time, product.timezone)` into an absolute moment, then displays it in the viewer's locale with an explicit "Helsinki time / your time" label when they differ.

### 4.4 Topic (fixed enum)

`game_id` on products is replaced by **`topic`** — one per product, a fixed Postgres enum `product_topic` (migration 00078):

```
product_topic = { minecraft, fortnite, webinar }
```

Modeling it as an enum gives DB-level protection (no invalid topic can be inserted) and a type-safe union in the generated TS, so future per-topic logic (e.g. "Minecraft signups require a Java username, Fortnite an Epic account") gets compiler-enforced exhaustive handling.

**Topic kind — games vs subjects.** The game/subject split is still meaningful but lives in **code**, not the DB — it's a pure function of the enum value. `src/lib/products/topics.ts` (`PRODUCT_TOPICS`) maps each value to its `kind` (`game` | `subject`) and its display label. Minecraft and Fortnite are games; Webinar is a subject. Kind drives UI grouping wherever topics are listed (pickers/filters separate "Games" from "Subjects"); it is **not** a branch in business logic.

**Labels & i18n.** "Topic" is the general category label in both code and UI; Games and Subjects are the kinds underneath it. Game *values* are brand proper nouns — their labels are literals (identical in every locale, never translated). Subject *values* localize through the next-intl `topics` message namespace (Webinar → webinaari / webbinarium / …). `useTopicLabel()` (`src/lib/products/use-topic-label.ts`) resolves either.

**No inline creation.** The topic set is fixed in code, so there is no admin create flow — the picker is a static select sourced from `PRODUCT_TOPICS`.

**Tags removed.** The earlier `tags` / `product_tags` / `tag_translations` triad (the shop "Vibe" filter) was dropped wholesale in migration 00078 — unused in the current product, cheaper to re-add later than to carry.

### 4.5 Billing model — EUR-only authoring, Adaptive Pricing at checkout, one purchase option per type

The platform is locked to **EUR**: admins author prices in EUR, customers see EUR, and our records (`payments`, `family_subscriptions`) are in EUR. Stripe Checkout's **Adaptive Pricing** presents each customer their local currency and converts, while the Session/PaymentIntent still report our EUR integration currency — Stripe settles us in EUR at the price we set. So "buy in another currency" works without modelling other currencies internally.

The single seam for re-enabling multi-currency is `SUPPORTED_CURRENCIES` in `src/lib/constants/currency.ts`. The data model below is deliberately kept currency-keyed (the `currency` columns and `IN ('eur','gbp','usd')` CHECKs stay) so it's dormant-but-present, not deleted — see `TODO.md` § "Re-enabling non-EUR currencies" for the restore steps. There is no currency selector and no FX/exchange-rate logic in the app.

`products.billing_mode` is a required enum:

```
billing_mode ∈ {
  paid,                 -- consumer clubs, camps, paid events
  free,                 -- free events
  external_contract     -- municipality clubs (off-platform)
}
```

There is exactly **one purchase option per product type** — the `purchase_shape` a parent's checkout uses is determined by the product, not chosen from a menu:

- **Consumer clubs** are a flat **monthly family subscription** (`subscription_monthly`) — the only option. There are no pay-as-you-go bundles.
- **Camps and paid events** are a single upfront payment (`single_payment`) — one Stripe charge, one seat.
- **Free events** (`free`) have no checkout step.
- **Municipality clubs** have no on-platform charge (`external_contract`).

The valid `purchase_shape` values are exactly `subscription_monthly`, `single_payment`, and `free`.

Paid products store their price in `product_prices` (see §5.1a) as a single `price_cents` column, keyed by `(product_id, currency)` — today only an `eur` row is written. What the amount means is decided by product type:

- **Consumer club** → `price_cents` is charged as the monthly subscription price.
- **Camp / paid event** → `price_cents` is charged once as the upfront total.

The server recomputes the final charge from the product's stored base price at every Checkout Session creation. The client sends a `(product_id, gamer_id, purchase_shape, currency)` selector — `currency` is always `eur` today — and never an amount. Tamper-proof by design.

**Stripe integration shape** (`src/app/api/checkout/products/create/route.ts`):

- **Monthly subscriptions (consumer clubs)**: require real Stripe Price IDs. **Lazy-created on first subscribe**, keyed by `(product_id, currency)` and cached in `product_subscription_prices` (§5.1a) — today one EUR Price per club. Existing subscribers keep their original Price through any base-price change (Prices are immutable in Stripe).
- **Camps / paid events**: inline Checkout Session with `price_data: { currency, unit_amount }` (EUR) computed server-side, one-shot for one seat.
- **Adaptive Pricing**: every Session sets `adaptive_pricing: { enabled: true }`. Stripe presents the customer's local currency and converts; the Session/PaymentIntent and the recorded `amount_total`/`currency` stay EUR (our integration currency), so the `payments`/`family_subscriptions` rows are EUR. Relies on EUR being a Stripe settlement currency under single-currency settlement. We do not record the customer's presentment currency — it's available in `session.presentment_details` if ever needed (see the TODO re-enable section).
- **Save card**: one-time payments set `saved_payment_method_options: { payment_method_save: "enabled" }`, offering the customer a checkbox to save the card (saved with `allow_redisplay: always`, so it's prefilled on their next Checkout and manageable via the billing portal). Subscriptions save the card by necessity. The card lands on the same Stripe Customer the billing portal manages (`getOrCreateStripeCustomer`).

**Cancellation and refund windows:**

| Purchase shape | Rule |
|---|---|
| Consumer-club subscription | Cancel via Stripe's Customer Portal — each club is its own single-item sub, cancelled independently (§4.5c). The sub stops at period end; the child keeps paid-through access until then per Stripe's default. No mid-period refund. |
| Customer-initiated cancellation of a camp / paid event | Not self-serve today. Parents contact customer support; admin issues the refund (or doesn't) via `admin_remove_participation`. |
| Admin-initiated cancellation of a whole product | Full refund per §6.3 (refund pro-rata current-period sub charges via Stripe; full camp/event refunds via Stripe). |
| Admin-initiated removal of a single gamer | Admin can force a Stripe refund outside the normal window — `reason='admin_refund'` on the `refunds` row. |

The `refund_policy_days` cutoff window for one-shot paid products (camp/event) lives on the product (§5.1).

### 4.5c Cancelling a club subscription — portal-only, one sub at a time

Each club subscription is its own Stripe sub, so cancellation is **delegated entirely to Stripe's hosted Customer Portal** — there is no in-app cancel action and no custom per-item removal RPC. The parent opens the portal (`src/app/api/parent/billing-portal/route.ts`, from `ManageBillingCard`), sees one entry per club they subscribe to (each labelled `"{Club} — {Child}"`, §4.5b), and cancels exactly the one(s) they want. Cancellation stops that club at period end (paid-through access until then), with no mid-period refund — Stripe's default.

This is the payoff of one-sub-per-participation: on the old shared family sub the portal disabled item editing (Stripe disables "update subscription" for multi-item subs), so it could only offer "cancel everything." Now every sub is single-item, so the portal's per-subscription cancel *is* per-club cancel. The portal config (`src/lib/stripe/portal-configuration.ts`) leaves plan-switching off and cancellation on.

**Teardown is webhook-driven.** When the parent cancels in the portal, Stripe fires `customer.subscription.deleted` at period end → `handleSubscriptionDeleted` (`src/app/api/webhooks/stripe/products/route.ts`) looks the row up by `stripe_subscription_id`, reads its `participation_id`, and calls `cancel_participation` to hard-delete the participation (which CASCADE-removes the `family_subscriptions` row). Stripe has already cancelled the sub, so this path never calls Stripe back. The handler is idempotent: a replayed deletion finds no row (already torn down) and returns a clean 200. During the cancel-pending window, `customer.subscription.updated` with `cancel_at_period_end` records `status = 'canceling'`, which the access checks treat as still-live so the child keeps access until the period actually ends.

### 4.5d Seat hold vs. club access — two independent gates with a grace window

A participation row carries two distinct rights, not one:

- **Seat hold** — the row occupies a slot in `products.seat_count`. Other parents see this slot as taken; the waitlist sees it as not-yet-promotable.
- **Club access** — the gamer can join the club's voice room, see the schedule, receive content, and otherwise *participate* in the club.

Most of the time these move together: an `active` participation backed by a healthy sub has both. They diverge when a sub's payment fails but we don't want to tear the participation row down yet:

| Trigger | Seat hold | Club access |
|---|---|---|
| **Sub payment failed (`past_due` / `unpaid`)** | Held for grace window | Blocked immediately |

(Cancelling a sub is different — the participation keeps access through period end, then is torn down by the cancellation path, not the grace path.)

The grace window — `ACCESS_GRACE_DAYS`, a single platform-wide constant — gives the parent a few days to update their card without losing their child's spot. After it expires, the seat is released and the lowest-position waitlist row is promoted; the participation row itself is hard-deleted on the same path as `cancel_participation`. A successful re-charge during the window cleanly restores access (sub status returns to `active`) — no special "rejoin" flow needed.

Why these are separate gates:

- **Holding the seat without granting access** prevents two opposite failure modes at once: rug-pull (parent missed one charge → child loses a club spot they've had for months) and free access (a failed payment goes unnoticed and the gamer keeps showing up). Either alone is wrong.
- **Access is a runtime decision; seat is a long-lived state.** Access is checked every time a gamer tries to enter the voice room or view the schedule. Seat is a column count re-evaluated only when the grace job wakes up. Conflating them forces the access check to walk the seat lifecycle (or vice versa) — both worse than separating.

#### Single source of truth: `participation_access_state`

`participation_access_state(participation_id)` is a SQL function (with a TS twin) returning one of `'allowed' | 'grace_blocked' | 'expired'`. It joins the participation to its family-sub status and applies the table above. **Every "can this gamer use the club right now" check consults this function** — voice-room admission, schedule visibility, content gates. No surface re-derives the rule on its own.

#### Grace expiry job

A daily cron walks `participations` for rows that have been `grace_blocked` longer than `ACCESS_GRACE_DAYS` and runs the same cascade as `cancel_participation`: hard-delete the row, promote the lowest-position waitlist row, log the event. Email notification ("your child's spot was released because the billing issue wasn't resolved within X days") lives in the same follow-up PR as the promote-from-waitlist email.

#### What the parent sees during grace

On the (future) purchased-product detail page, a `grace_blocked` participation surfaces a prominent banner — *"Your card was declined — update your payment method to restore access. Your child's spot is held until {date}."* — with a one-click link into the Stripe billing portal. The same banner appears on the gamer's dashboard, worded gently and without exposing money detail to the child: *"Your parent needs to sort out billing — you'll be back in {Club Name} once that's done."*

#### What this requires that doesn't exist today

This section is **forward-looking spec** — none of it ships yet. The shape it locks in:

- The Stripe webhook must additionally subscribe to `invoice.payment_failed`, and `customer.subscription.updated` transitions to `past_due` / `unpaid` must be recorded — the access-state function needs that data.
- A `grace_started_at timestamptz` column on `participations` records when the row entered `grace_blocked`. Set by the webhook on the relevant transition; cleared on recovery. The grace-expiry job uses it.
- `participation_access_state` and the `enforce_grace_expiry` cron land together in a follow-up PR, and they must land **before** any access check (voice-room admission, schedule visibility) starts depending on them. Until then, the access check stays on enrollment-only.

### 4.5a Design principle for pricing code: keep the first pass simple

Pricing, discounts, subscription shapes, and checkout flows are the most volatile parts of this domain — product will iterate on them. The code should reflect that expectation.

**Keep the first pass simple.** Handle the common cases cleanly; defer edge cases and "what-ifs" unless they block a stated requirement. Prefer Stripe's built-in behavior (proration defaults, `billing_cycle_anchor`, coupons) over custom logic that replicates Stripe's math. Prefer a single hardcoded constant over a parameterized system with multiple knobs, until the knobs are clearly required.

Correctness invariants that do **not** get relaxed by this principle: idempotency on webhooks (event_id uniqueness on every payment/refund row), race-safe seat counting via `FOR UPDATE`, refund auditability (every money movement recorded in `payments` / `refunds`), and no client-supplied prices (server always recomputes from the product's stored per-currency base price).

### 4.5b Subscriptions — one Stripe subscription per (gamer, club)

Each consumer-club signup is its **own** monthly Stripe subscription: one `family_subscriptions` row, one Stripe sub, for exactly one (gamer, club) pair. The table keeps the historical name `family_subscriptions`, but a row is no longer a family's whole bill — it's one child in one club. Subscriptions are monthly only — there is no frequency dimension.

> **Earlier model (removed):** one shared sub per (customer, currency) with one `subscription_item` per (gamer, club), and a `family_subscription_items` join table. The first club went through Stripe Checkout; every later club was an inline `stripe.subscriptions.update` against the existing sub. That made one renewal date for the family but blocked the three things below. The join table is dropped; the link to the participation now lives directly on the `family_subscriptions` row (`participation_id`, unique).

Three reasons a sub-per-participation wins over the shared family sub:

- **Always Stripe Checkout — even with a card on file.** Every paid signup (single-payment and subscription alike) creates a fresh Checkout Session and redirects the parent to Stripe's hosted page. Seeing the familiar Stripe checkout on every purchase is the trust/safety moment we want. The shared-sub model could only do this for the *first* club; subsequent clubs were a silent server-side `subscriptions.update` with no redirect.
- **Per-club cancellation through Stripe's portal.** Stripe's hosted Customer Portal cancels at the *subscription* level and disables item editing for multi-item subs — so on a shared family sub the portal could only "cancel everything." One sub per (gamer, club) makes each club independently cancelable straight from the portal, with no custom in-app per-item removal needed (§4.5c).
- **Unlocks deferred billing later.** Because each sub stands alone, a future signup for a club that starts in the future can anchor *that* sub's first charge to the product's start date (`subscription_data.billing_cycle_anchor` / `trial_end`) without touching any other club. Impossible to do per-club on one shared sub. Not built yet — tracked in `TODO.md`.

What we give up: a family with several clubs now has several Stripe subs, each with its own renewal date and its own line on the card statement, rather than one consolidated monthly charge. Each sub carries a `description` of the form `"{Club} — {Child}"` so the parent can tell them apart in the billing portal and on statements.

### 4.6 Capacity and waitlist

- `products.seat_count` — nullable. `NULL` means **uncapped / all welcome** — no capacity limit, no waitlist, no "full" state. Only valid when `billing_mode = 'free'`.
- Parent-facing surfaces render `seat_count = NULL` as **"unlimited" / "all welcome"** — never a missing number or a zero.
- When a participation is requested on a capped product and seats are full, it becomes `waitlisted` with a `waitlist_position`.
- When an active participant leaves or is removed, the lowest-position waitlisted row is atomically promoted.

All participation mutations go through `SECURITY DEFINER` RPCs that begin with `SELECT 1 FROM products WHERE id = $1 FOR UPDATE`. This **product-row lock is the signup gate** — concurrent `create_participation` / `cancel_participation` / waitlist-promotion calls on the same product serialize on it, so seat-count reads and waitlist arithmetic inside the transaction are race-free.

**Do not use `FOR UPDATE SKIP LOCKED` or `NOWAIT`.** Concurrent callers must wait for the lock so each sees a consistent post-commit state. At our scale (~50 signups per 15-minute window at peak), lock contention is invisible.

### 4.6a Seat reservation — hold the seat *before* sending to Stripe

The lock above is a *gate*, not a *hold*. By itself it serializes seat-count reads inside one transaction — but that transaction returns before Stripe Checkout has even loaded for the parent. Without an additional mechanism, two parents on a 1-seat product can both pass the gate, both proceed to Stripe, and one of them wins the seat while the other gets stuck with a charge against an already-full club.

The chosen mechanism is a **reserving participation row**, not a held card authorization:

1. Parent clicks the type-specific signup verb. The client calls a `create_participation` API route with `(product_id, gamer_id, purchase_shape, currency)`.
2. The RPC takes the gate lock, counts seats (`active + reserving`), then either:
   - **Seat available** — inserts a `participations` row with `status='reserving'`, returns a Stripe Checkout URL whose metadata is keyed to that row.
   - **No seat** — returns `{ full: true }`. The client flips the CTA to "Join the waitlist". No Stripe call ever made.
3. Parent completes Stripe Checkout → webhook flips the reserving row to `status='active'` and writes `payments`.
4. Parent abandons → Stripe fires `checkout.session.expired` (~30 min after creation, the session lifetime), webhook calls `expire_reservation`, the row is deleted, and the seat returns to the pool.

This pattern works uniformly for **all** purchase shapes — single-payment camps/events and family subs. The same gate decides who proceeds to Stripe; nobody is sent through Checkout without a held seat.

**Status, not a timer, holds the seat.** Earlier drafts had `count_seats_taken` exclude reserving rows past `reserved_until`; that created a race window at the 30-min boundary (Stripe accepts payment at T=29:59, our timer lapses at T=30:00, another parent grabs the seat before our webhook arrives). Counting all reserving rows regardless of timer eliminates that window: the row stays held until either `confirm_reservation` or `expire_reservation` fires, and Stripe guarantees those two events are mutually exclusive for a given session. Trade-off: we trust Stripe's webhook delivery to release abandoned seats. If `checkout.session.expired` never arrives (rare), the row is stuck until manual cleanup.

**Each click is an independent reservation.** A parent who abandons mid-pay and clicks Sign Up again gets a brand-new reservation row, not the old one. The schema permits multiple `reserving` rows per `(product, gamer)` (the partial unique index excludes `'reserving'`); whichever Stripe session pays first wins, the other is cleaned up by `expire_reservation`. Pay-twice (parent pays both tabs) is bounded by the unique index firing on the second confirm — the webhook catches `23505`, logs, and returns 200; the duplicate Stripe charge is left for manual refund. We accept this manual-recovery cost in exchange for not maintaining an automated refund flow.

**Subscriptions and the manual-capture gap.** Stripe doesn't support `capture_method: "manual"` for recurring charges, which would complicate any "auth-then-decide" pattern for the one-shot camp/event payment. The reservation row sidesteps this entirely: the seat is held in our DB before any Stripe transaction starts, so subs and one-offs follow the same path.

**Waitlist sits outside Stripe.** A parent who joins the waitlist has *not* been charged and is *not* pre-authorised. When a seat opens (active participation removed), `promote_from_waitlist` picks the lowest-position waitlisted row and sends a transactional email with a re-checkout link. Promotion is opt-in — the parent has to click and complete a fresh Checkout. Stripe's auth windows (~7 days) aren't long enough to cover realistic waitlist gaps, so we don't try to use them.

### 4.7 Product type as label, not switch

`products.product_type` is a flat enum `{consumer_club, municipality_club, camp, event}`. It is used **for labeling and filtering only**. Business logic branches on the orthogonal fields — `billing_mode`, `schedule` shape, `seat_count`, refund policy — not on `product_type` directly.

### 4.8 Locations

Keep the existing `locations` hierarchy untouched. Put site-specific fields in **two** extension tables — one per visibility tier — not on `locations` itself. Country / region / municipality / district rows have no address, no parking, no wifi info, no gate codes, and should not carry nullable columns that never apply to them. Splitting into two tables rather than column-level permissions keeps RLS clean (Postgres RLS is row-level; gating columns by role requires awkward views or grants).

```sql
site_details        -- member-visible. Parent-facing product detail page.
  location_id    uuid pk, fk → locations.id ON DELETE CASCADE
  address        text
  notes          text              -- parking, accessibility, wifi, opening hours
  -- future: parking_info, accessibility_features, opening_hours, wifi_*, allergen_info, ...
  created_at, updated_at
  -- enforced: row may exist only for locations where type = 'site'

site_staff_details  -- admin + Gedu only. Never leaves staff surfaces.
  location_id    uuid pk, fk → locations.id ON DELETE CASCADE
  notes          text              -- gate codes, back-entrance directions, keys, ops notes
  created_at, updated_at
  -- enforced: row may exist only for locations where type = 'site'
```

**Reads:**
- Hierarchy queries read `locations` alone — no join.
- Parent-facing product detail joins `locations JOIN site_details USING (location_id)`.
- Admin/Gedu staff screens join both: `locations JOIN site_details USING (location_id) LEFT JOIN site_staff_details USING (location_id)`.

### 4.9 Location rules — site for in-person, jurisdiction only for online municipality clubs

A product's `location_id` has different meanings depending on delivery mode and product type:

- **In-person products** (`is_remote = false`) — `location_id` is required and must be a `site`.
- **Online municipality clubs** (`is_remote = true, product_type = 'municipality_club'`) — `location_id` is required and must be a country, region, or municipality (not a site).
- **Online consumer clubs, camps, and events** — `location_id` is NULL.

The motivating parent experience is unchanged for the municipality case: *"I live in Helsinki. My municipality offered a club. It happens to be online — still my municipality's club."*

**Residency rule (intent, not enforcement).** Municipality clubs are only for kids who live in the owning municipality. The platform does **not** enforce residency at signup; the honour-system copy is the only check. Do not use `product_type = 'municipality_club'` elsewhere as a proxy for "free to all."

| Product type | In-person `location_id` | Online `location_id` |
|---|---|---|
| Consumer club | Site (required) | **NULL** |
| Municipality club | Site within the owning municipality (required) | The municipality that paid for it (required) |
| Camp | Site (required) | **NULL** |
| Event | Site (required) | **NULL** |

**Browse filtering:** `/registration` location pages list only `product_type = 'municipality_club'`. Consumer browse (`/browse`) excludes municipality clubs entirely.

**Admin UX:** the location picker is only rendered when the current (`is_remote`, `product_type`) combination requires it; picker auto-clears a stale selection when the applicable mode changes. Both visible modes let the admin create new locations inline.

### 4.10 Voice rooms are online-only, and live at the group level

A voice room (Daily.co) exists iff `products.is_remote = true`. In-person products have no voice room.

**For online products, rooms are per-group.** Each `product_groups` row in an online product gets its own Daily.co room.

**Permissions follow the group → product topology:**

- **Gamers** can see and join only the voice room of the group they're assigned to.
- **Gedus** can see and join any voice room on any group within a product, as long as they're assigned to at least one group in that product (emergency coverage).
- A **substitute Gedu** (set via `session_substitutions`) gains voice-room access on the covered (group, session_date) for the substitution date only.
- An unassigned participation has **no** voice room access.

**Effective Gedu resolution** walks `session_substitutions` forward from each ongoing `gedu_group_assignments` member via a recursive CTE. Unfilled substitutions produce a coverage gap the admin dashboard surfaces.

**Room provisioning** is keyed on `product_group_id`. Creation is idempotent and lazily reattempted at first join. Flipping `is_remote` true → false is disallowed once participations exist.

### 4.11 Lifecycle status and threshold-triggered start

```
products.status ∈ {
  draft,      -- admin setting up; invisible to parents.
  pending,    -- published, accepting signups, conditions not (yet) met.
  running,    -- admin under-threshold override (see below).
  completed,  -- end_date passed for a stored 'running'.
  cancelled   -- admin killed it. Refunds fired as appropriate.
}
```

`is_visible` stays orthogonal to status.

**Effective status is derived, not cron-driven.** The `status` column stores admin-driven facts only — `draft`, `pending`, `cancelled`, and the override `running`. `pending → running` and `running → completed` are computed at read time from the stored facts plus `now()`:

- `pending` upgrades to `running` when **start_date has been reached** AND **any signup_threshold is met** (active participations ≥ threshold; counts use `participations.status='active'`). With neither condition set, the product stays `pending` until admin manually starts it.
- A stored or derived `running` downgrades to `completed` once `end_date` has passed.

This avoids a fragile pending-tick cron and a stale-status class of bug. The DB stores facts; the application derives state. The TypeScript helper (`src/lib/products/effective-status.ts`) and a sibling SQL function `effective_status(product_id)` share the same rule — the SQL form is what RLS / list queries call when they need to filter by effective state.

**Signup threshold — a single mechanism for all four product types.** `products.signup_threshold` (nullable int) counts active participations only. When set, the threshold gates the derived transition above. Admins get a notification ("Tuesday Minecraft has 8 active signups — ready to start") for visibility — the transition is automatic once the count reaches the threshold, no admin click required.

The admin's only manual lever on lifecycle is the **under-threshold override**: `start_product(product_id, start_date)` writes `status='running'` directly, bypassing the threshold rule. Used when the admin wants to run a club despite missing signups (or wants to start before the planned `start_date`). UI surfaces this as a "Start now under threshold" button with a confirm dialog. The persisted `status='running'` is what tells the derived rule to skip the threshold check on subsequent reads.

Separately, admins can **cancel** a pending product. Cancellation refunds are handled per §6.3.

**Active participation counts.** The derived rule needs `active_participation_count` per product. When `participations` ships, materialize the count on `products` (one int column, default 0, bumped by `create_participation` / decremented by `cancel_participation`) so list queries don't need a join. Until then the helper accepts a count parameter; admin views pass `0` (so threshold-bearing products read as pending), and that's accurate because no parent UI exists to create participations yet.

**Billing behavior during `pending`:**

- **Family subscriptions (consumer clubs)** — the first period's charge is collected at checkout. If the product is cancelled in `pending`, the item is removed from the sub and the current-period value is refunded pro-rata via Stripe.
- **Camps / paid events** — charged at signup. Cancellation of a pending product refunds everyone fully via Stripe.
- **`external_contract` / `free`** — no platform charges at any time.

Parent-facing copy at checkout makes the "fully refunded if we can't run this" guarantee explicit.

**Implications for other fields:**

- `start_date` is nullable. CHECK: `status = 'running'` → `start_date IS NOT NULL`.
- CHECK: `signup_threshold <= seat_count` when both are set.

**Admin UX — three start modes selected via radio** (per §4.11 of the prior draft; unchanged):

1. **On a specific date** — `start_date` set, `signup_threshold` null.
2. **On a specific date, only if enough sign up** — both set.
3. **When enough gamers sign up** — `start_date` null, `signup_threshold` set.

Per-type defaults unchanged (consumer club: all three; camp: 1 and 2; event: all three; municipality club: 1 only).

---

## 5. Data model

### 5.1 Core tables

```sql
products
  id                    uuid pk
  product_type          enum('consumer_club','municipality_club','camp','event')
  billing_mode          enum('paid','free','external_contract')

  name                  text
  description           text
  topic                 enum('minecraft','fortnite','webinar')  -- fixed set; see §4.4
  min_age               int
  max_age               int
  spoken_language_code  text
  image_path            text
  padlet_url            text              -- optional; public URL. UI hides pre-signup.

  location_id           uuid → locations.id   -- NULLABLE per §4.9
  is_remote             bool

  status                enum('draft','pending','running','completed','cancelled')
  signup_threshold      int               -- nullable

  start_date            date              -- nullable
  end_date              date              -- nullable (ongoing for consumer_club)
  timezone              text              -- IANA

  seat_count            int               -- nullable (uncapped — only allowed for free)
  waitlist_enabled      bool              -- default true when seat_count is set

  registration_opens_at timestamptz       -- NOT NULL; "Right away" resolves to creation time
  refund_policy_days    int               -- nullable; only for one-shot paid products (camp/event).
                                            -- Club subscriptions cancel via Stripe (stop at period end).

  is_visible            bool
  created_by            uuid → profiles.id
  created_at, updated_at

  -- CHECK constraints:
  --   billing_mode='external_contract'    → product_type='municipality_club'
  --   billing_mode='free'                 → no row in product_prices (app-enforced)
  --   billing_mode='paid'                 → ≥ 1 row in product_prices (app-enforced)
  --   seat_count IS NULL                  → billing_mode='free'
  --   product_type='event'                → end_date = start_date (one-off)
  --   product_type != 'consumer_club'     → end_date IS NOT NULL once status != 'draft'
  --   is_remote=false                     → location_id IS NOT NULL AND locations.type='site'
  --   is_remote=true AND product_type='municipality_club'
  --                                       → location_id IS NOT NULL AND locations.type IN
  --                                           ('country','region','municipality')
  --   is_remote=true AND product_type != 'municipality_club'
  --                                       → location_id IS NULL
  --   status = 'running'                  → start_date IS NOT NULL
  --   signup_threshold IS NOT NULL AND seat_count IS NOT NULL
  --                                       → signup_threshold <= seat_count
  --   refund_policy_days IS NOT NULL      → product_type IN ('camp','event')

schedule_slots
  id                    uuid pk
  product_id            uuid → products.id ON DELETE CASCADE
  weekday               int              -- 0=Mon..6=Sun
  start_time            time
  duration_minutes      int
  unique(product_id, weekday)

-- `topic` is a fixed enum column on products (see §4.4). There is no topics
-- table — the game/subject split and display labels live in code
-- (src/lib/products/topics.ts). The tags / product_tags / tag_translations
-- triad was dropped in migration 00078.
```

### 5.1a Pricing tables

```sql
-- Admin-entered base prices, keyed by currency. EUR-only today (§4.5); the
-- CHECK still admits 'eur' | 'gbp' | 'usd' so the table is re-enable-ready.
product_prices
  product_id            uuid → products.id ON DELETE CASCADE
  currency              text          -- CHECK 'eur' | 'gbp' | 'usd'; only 'eur' written today.
                                        -- Allowed set kept in sync with src/lib/constants/currency.ts
  price_cents           int           -- smallest unit (cents). The single product price:
                                        -- consumer-club monthly sub, or camp/event upfront total.
  primary key (product_id, currency)
  -- One row per currency the product is sold in (today: just the eur row). A missing row
  -- means "not sold in this currency" — the product shows as unavailable. Widening to more
  -- currencies is application-level INSERTs, not a migration.

-- Stripe Price IDs for monthly subscriptions. Lazy-populated.
product_subscription_prices
  product_id            uuid → products.id ON DELETE CASCADE
  currency              text
  stripe_price_id       text                    -- populated on first subscribe
  unit_amount_cents     int                     -- snapshot for display; Stripe is authoritative
  created_at            timestamptz
  primary key (product_id, currency)
  -- If price_cents changes after Prices are created, existing subscribers keep the
  -- old Price (Stripe Prices are immutable). A future admin action can recreate Prices;
  -- existing subs retain their original rate until they cancel and re-subscribe.
```

### 5.1b Translations — products

User-visible text on `products` lives in a per-locale child table, not on the parent row. The parent carries only structural data (id, FKs, the `topic` enum). Admins decide which locales to provide; not every product has every locale. (Topic labels are not DB-backed — see §4.4: games are literals, the Webinar subject localizes through the next-intl `topics` namespace.)

```sql
product_translations
  product_id   uuid → products.id ON DELETE CASCADE
  locale       text NOT NULL                 -- matches SUPPORTED_LOCALES in src/lib/constants/locales.ts
  name         text NOT NULL
  description  text NOT NULL
  primary key (product_id, locale)
```

**Resolution rule.** The reader picks one row per parent for display, walking the fallback chain in `src/lib/i18n/resolve-translation.ts`:

```
user's UI locale → en → first available
```

Sending all available translations to the client is intentional — payloads stay small (2 short fields per locale, max 4 locales) and a future "view this product in another language" UI is trivial. The browser just calls `resolveTranslation(parent.product_translations, useLocale())`.

**Must-have-≥1-translation rule for products.** Every product must keep at least one translation row in any locale at all times. Enforced two ways:
- `create_product()` / `update_product()` reject an empty `p_translations` payload.
- A BEFORE-DELETE trigger on `product_translations` raises if the delete would leave the product with no rows. (CASCADE on parent delete is allowed via a "parent gone?" check.)

The product form itself is multi-locale: a language tabs strip in the Identity card lets the admin add/remove locales and edit per-locale name + description. Initial tab is the admin's UI locale.

### 5.2 Holiday calendars

```sql
holiday_calendars
  id                    uuid pk
  name                  text
  timezone              text
  created_at, updated_at

calendar_holidays
  id                    uuid pk
  calendar_id           uuid → holiday_calendars.id ON DELETE CASCADE
  date                  date
  reason                text
  unique(calendar_id, date)

product_holiday_calendars
  product_id            uuid → products.id ON DELETE CASCADE
  calendar_id           uuid → holiday_calendars.id ON DELETE CASCADE
  primary key (product_id, calendar_id)
```

**Admins enter holidays manually.** The many-to-many shape lets a product subscribe to multiple calendars (e.g. "Finnish national holidays" + "Finnish school term breaks"), so concerns can be split without schema changes.

**Future enhancement — auto-sync national holidays.** A per-calendar admin "Sync from Nager.Date" button could populate `calendar_holidays` from `https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}` (free, no key, covers FI / GB / US and most countries). Filter the response to entries whose `types` include `Public` to drop observances like Mother's Day that don't close schools. Requires adding `country_code` to `holiday_calendars`. Keep the sync additive — show a diff and let the admin confirm removals so hand-curated quirks aren't wiped. Does not solve school-term breaks (syysloma, hiihtoloma, half-terms) — those remain admin-maintained, or sourced from OpenHolidays API if coverage proves reliable.

### 5.3 Session overrides and substitutions

```sql
session_overrides
  id                        uuid pk
  product_id                uuid → products.id ON DELETE CASCADE
  session_date              date
  cancelled                 bool default false
  override_start_time       time
  override_duration_minutes int
  admin_note                text
  created_by                uuid → profiles.id
  created_at, updated_at
  unique(product_id, session_date)

session_substitutions
  id                    uuid pk
  group_id              uuid → product_groups.id ON DELETE CASCADE
  session_date          date
  original_gedu_id      uuid → profiles.id
  substitute_gedu_id    uuid → profiles.id    -- NULL until filled
  reason                text
  requested_by          uuid → profiles.id
  requested_at          timestamptz
  filled_by             uuid → profiles.id
  filled_at             timestamptz
  unique(group_id, session_date, original_gedu_id)
  -- trigger: reject if product_has_session(group.product_id, session_date) is false
  -- trigger: original_gedu_id must be on gedu_group_assignments for group_id
```

A session exists on a date iff: schedule rules include it, no linked holiday calendar contains it, AND no `session_overrides` row sets `cancelled=true`. Helper: `product_has_session(product_id, date) → bool`.

Chained substitutions are supported (Adam→Bob, then Bob→Carla on the same (group, date) are two rows). The voice-chat permission check walks the chain via a recursive CTE.

### 5.4 Groups and Gedu assignment

```sql
product_groups
  id                    uuid pk
  product_id            uuid → products.id ON DELETE CASCADE
  name                  text                  -- required; e.g. "Group A" or "Adam's group"
  daily_room_name       text                  -- NULL for in-person products
  created_at, updated_at
  unique(product_id, name)

gedu_group_assignments
  group_id              uuid → product_groups.id ON DELETE CASCADE
  gedu_id               uuid → profiles.id
  product_id            uuid → products.id            -- denormalized
  assigned_at           timestamptz
  primary key (group_id, gedu_id)
  unique (gedu_id, product_id)                           -- one group per Gedu per product
  -- BEFORE INSERT/UPDATE trigger: validate denormalized product_id matches group_id's product
```

Gedus attach to groups, not products. A Gedu is on at most one group per product (unique constraint). Substitute coverage for a specific date is not an assignment — it's a `session_substitutions` row.

**Changes from today's schema:** the current `product_groups.gedu_id` column is dropped; assignment goes through `gedu_group_assignments`. Groups gain a required `name`.

### 5.5 Participations

```sql
participations
  id                    uuid pk
  product_id            uuid → products.id
  group_id              uuid → product_groups.id        -- nullable = unassigned inbox
  gamer_id              uuid → profiles.id
  customer_id           uuid → profiles.id                 -- parent who signed up the gamer
  status                enum('reserving','active','waitlisted','completed')
  reserved_until        timestamptz                        -- populated iff status='reserving' (§4.6a)
  waitlist_position     int                                -- populated iff status='waitlisted'
  signed_up_at          timestamptz
  unique(product_id, gamer_id)
  -- CHECK: group_id's product_id (if set) matches row's product_id
  -- CHECK: status='reserving' → reserved_until IS NOT NULL
  -- CHECK: status='waitlisted' → waitlist_position IS NOT NULL
```

There is no per-session credit balance on a participation. A consumer-club participation's coverage is simply the existence of a live `family_subscriptions` row pointing at it (`participation_id`); camps/events are covered by their one-time `payments` row.

**Hard-delete on cancellation.** Cancellation (customer- or admin-initiated) hard-deletes the row via `cancel_participation` / `admin_remove_participation`. No soft-delete column; cancelled rows are physically gone so `UNIQUE(product_id, gamer_id)` works on re-signup.

`group_id IS NULL` is the unassigned inbox state. Deleting a group resets its participations to `group_id = NULL`.

### 5.6 Session-level records

```sql
session_attendance
  id                    uuid pk
  product_id            uuid → products.id
  session_date          date
  gamer_id              uuid → profiles.id
  status                enum('present','absent','excused','late')
  recorded_by           uuid → profiles.id
  recorded_at           timestamptz
  unique(product_id, session_date, gamer_id)
  -- trigger: reject INSERT/UPDATE when product_has_session is false

session_notes
  id                    uuid pk
  product_id            uuid → products.id
  session_date          date
  author_id             uuid → profiles.id
  content               text
  visibility            enum('gedu_only','admin','participants')
  created_at, updated_at
  -- trigger: same validity check
```

### 5.7 Payments and refunds

The Sorg-era `enrollment_charges` table (dropped in `00059`) is replaced by two thin tables that track Stripe money movements. Stripe is the source of truth; these tables are our local audit trail + idempotency gate + reporting index.

```sql
payments
  id                         uuid pk
  customer_id                uuid → profiles.id
  amount_cents               int              -- positive; what parent paid
  currency                   text
  purpose                    enum('subscription_invoice','single_payment')
  stripe_payment_intent_id   text             -- for single_payment
  stripe_invoice_id          text             -- for subscription_invoice
  stripe_event_id            text unique      -- idempotency on the webhook that created this row
  metadata                   jsonb            -- {gamer_id, product_id, ...}
  created_at                 timestamptz

refunds
  id                         uuid pk
  payment_id                 uuid → payments.id
  amount_cents               int              -- positive
  reason                     enum(
                               'admin_refund',
                               'product_cancelled',
                               'subscription_item_removed',
                               'subscription_period_proration'
                             )
  stripe_refund_id           text unique
  stripe_event_id            text unique      -- idempotency on the webhook that created this row
  created_at                 timestamptz
```

**How rows get written:**

- `payments` rows are written by Stripe webhook handlers — `checkout.session.completed` (single-payment camps/events) and `invoice.paid` (subscription cycles). UNIQUE `stripe_event_id` is the idempotency gate.
- `refunds` rows are written by `charge.refunded` / `charge.refund.updated` webhooks, or by our own RPCs that trigger a Stripe refund synchronously (admin override path). Same idempotency gate.
- Nothing is written by the client. Checkout Sessions are created with `metadata` carrying the (gamer_id, product_id, currency) selector; the webhook reads metadata to construct the `payments` row.

### 5.7a Family subscriptions

```sql
family_subscriptions   -- one row = one Stripe sub = one (gamer, club) participation
  id                         uuid pk
  customer_id                uuid → profiles.id      -- the paying parent
  participation_id           uuid → participations.id ON DELETE CASCADE  -- unique
  stripe_subscription_id     text unique
  stripe_customer_id         text
  stripe_price_id            text                  -- Price the sub was created at (immutable snapshot)
  currency                   text                  -- locked at sub creation (Stripe invariant)
  status                     enum('active','past_due','cancelled','incomplete','canceling')
  current_period_end         timestamptz
  created_at, updated_at
  unique(participation_id)
```

**Shape:**

- One `family_subscriptions` row per participation (one gamer × one club). The historical "family" name is kept; a row is one child in one club, not a family's whole bill (§4.5b). Subscriptions are monthly only.
- The link to the (gamer, club) is `participation_id` directly on the row — there is no separate item join table. Deleting the participation CASCADEs the sub row away (the teardown path on cancellation, §4.5c).
- `stripe_price_id` snapshots the immutable Stripe Price the sub was created at, mirroring `product_subscription_prices`.
- `family_subscriptions.status` and `current_period_end` are maintained by webhooks (`customer.subscription.updated`, `customer.subscription.deleted`), not by the app directly. The checkout route creates the Stripe sub via Checkout; Stripe fires webhooks; webhooks write/update our DB.

### 5.8 Row Level Security

Every new table has RLS enabled. Policy shape follows the existing codebase:

- **Admin = full access.** `get_user_role() = 'admin'` USING/WITH CHECK on every table.
- **Writes are RPC-gated.** Tables mutated by `SECURITY DEFINER` RPCs (participations, payments, refunds, family subs and items, group/assignment mutations via `commit_group_changes`, substitutions) grant no INSERT/UPDATE/DELETE to `authenticated`.
- **`auth.uid()` and `get_user_role()` always wrapped in `(select ...)`** for the initplan optimization used throughout existing migrations.

Baseline SELECT policies per role:

| Table | anon | customer | gamer | gedu |
|---|---|---|---|---|
| `products` | `status IN ('pending','running') AND is_visible` | public ∪ own-participations | public ∪ own-participations | any product where Gedu has a `gedu_group_assignments` row |
| `schedule_slots`, `session_overrides` | — | follows products | follows products | follows products |
| `product_prices` | all (public catalog) | all | all | all |
| `product_subscription_prices` | ✗ | own customer's path only | ✗ | ✗ |
| `site_details` | public (member-visible info — address, parking, wifi) | — | — | — |
| `site_staff_details` | ✗ | ✗ | ✗ | Gedus assigned to a product at this site *(fine-grained gating lands with `gedu_group_assignments`; placeholder is any Gedu)* |
| `holiday_calendars`, `calendar_holidays`, `product_holiday_calendars` | all | — | — | — |
| `product_groups` | ✗ | ✗ (parents never see groups) | own group only | any group on products Gedu is on |
| `gedu_group_assignments` | ✗ | assignments on products where own gamer participates | own group only | own + colleagues on assigned products |
| `participations` | ✗ | `customer_id = auth.uid()` | `gamer_id = auth.uid()` | participations on assigned products |
| `session_substitutions` | ✗ | via products of own gamers | via own group | on assigned products |
| `session_attendance` | ✗ | for own gamers | own rows | on assigned products |
| `session_notes` | ✗ | `visibility='participants'` on own gamers' products | same | `gedu_only` + `participants` on assigned products |
| `payments` | ✗ | `customer_id = auth.uid()` | ✗ | ✗ |
| `refunds` | ✗ | via own payments | ✗ | ✗ |
| `family_subscriptions` | ✗ | `customer_id = auth.uid()` | ✗ | ✗ |

**Non-obvious rules:**

- **Parents never see `product_groups`, `session_substitutions`, or the per-group Gedu roster.** The Gedu list on a product's parent-facing page is derived via `DISTINCT gedu_id` across the product's groups.
- **Gedus read products regardless of `is_visible` / `status`.** A Gedu assigned to a draft or cancelled product still needs to see it.
- **Gamers have no payment visibility.** Customers see their own payments/refunds/subscriptions via `customer_id = auth.uid()`.
- **`product_subscription_prices` is not a public catalog.** The Stripe Price IDs it holds are implementation detail; parents only ever see the computed display price from `product_prices` + hardcoded constants.

An access-control test (mirroring `tests/db/access-control.test.ts`) must assert for every new table: RLS enabled, no non-allowlisted function callable by anon/authenticated, policies behave as described.

---

## 6. RPCs

All `SECURITY DEFINER`, private by default, row-locking where financial.

### 6.1 Participation lifecycle

All RPCs in this section begin with `SELECT 1 FROM products WHERE id = $1 FOR UPDATE` (the gate lock — §4.6).

- **`create_participation(product_id, gamer_id, customer_id, purchase_shape, currency)`**
  After the gate lock: validates age/language match, checks `registration_opens_at`, verifies effective status (via `effective_status()`) permits signup, counts current `active` + non-expired `reserving` participations to decide whether a seat is available. Behaviour by `purchase_shape`:
  - `subscription_monthly` (consumer club) — if a seat is available, inserts a `participations` row with `status='reserving'` and `reserved_until = now() + 30 minutes`, then resolves or creates the Stripe Price for `(product_id, currency)`, creates a Stripe Checkout Session in subscription mode keyed to the reserving row, returns the Checkout URL. The `checkout.session.completed` webhook finds or creates the `family_subscriptions` row for `(customer_id, currency)`, attaches the subscription item aligned to the existing `billing_cycle_anchor`, and flips the reserving row to `active`. If full, returns `{ full: true }` — UI offers `join_waitlist` instead.
  - `single_payment` (camp / paid event) — same reservation pattern with one-shot inline `price_data` Checkout (`unit_amount = price_cents`, EUR); webhook flips reserving → active on completion.
  - `free` — directly inserts `status='active'`, no reservation, no Stripe.

  The reservation-row insert is the *seat-holding* mechanism (§4.6a). Without it, two parents can both pass the gate, both proceed to Stripe, and one is stuck with a charge against an already-full club.

- **`join_waitlist(product_id, gamer_id, customer_id)`**
  After the gate lock: inserts a `participations` row with `status='waitlisted'` and the next `waitlist_position`. No Stripe call, no charge, no pre-authorization. Returns the position so the UI can confirm.

- **`cancel_participation(participation_id, reason)`**
  The teardown for a cancelled participation. After the gate lock: reads the linked `stripe_subscription_id` off `family_subscriptions` (so an *admin*-initiated cancel can cancel the whole Stripe sub), then hard-DELETEs the participation — which CASCADEs the `family_subscriptions` row away. Returns the `stripe_subscription_id` for the caller. No Stripe refunds in any branch.

  This is the RPC the `customer.subscription.deleted` webhook calls when a parent cancels a club in Stripe's portal (§4.5c). On that path Stripe has **already** cancelled the sub, so the webhook does not call Stripe back — it only runs this DB teardown. (Customer-initiated cancellation is portal-only; there is no in-app "Leave this club" action and no `unsubscribe_from_product` RPC.)

- **`admin_remove_participation(participation_id, reason)`**
  Admin-initiated. Same as `cancel_participation` including hard-DELETE and waitlist promotion, with the ability to force a Stripe refund outside the normal window — `reason='admin_refund'` on the `refunds` row.

- **`promote_from_waitlist(product_id)`**
  Internal helper, called inside cancellation RPCs. Assumes gate lock is held.

### 6.1a Group mutations

The `commit_group_changes` RPC is the sole write path for `product_groups`, `gedu_group_assignments`, and `participations.group_id`. Extended for the unassigned inbox column — additive.

### 6.2 Session-level operations

- **`cancel_session(product_id, session_date, reason)`** — upserts `session_overrides` with `cancelled=true`.
- **`reschedule_session(product_id, session_date, new_start_time, new_duration_minutes)`** — upserts.
- **`request_substitute(group_id, session_date, original_gedu_id, reason)`** — inserts with `substitute_gedu_id = NULL`. Callable by admin or the original Gedu. Supports chained requests.
- **`assign_substitute(substitution_id, substitute_gedu_id)`** — admin fills an unfilled row. A combined `set_substitute(group_id, session_date, original_gedu_id, substitute_gedu_id)` is a one-step admin convenience.
- **`record_attendance(product_id, session_date, gamer_id, status)`** — validates against `product_has_session`.

### 6.3 Lifecycle transitions

- **`start_product(product_id, start_date)`** — admin-initiated. Requires `status='pending'`. Transitions to `running`. Does not check `signup_threshold` (admin is explicitly overriding).
- **`cancel_product(product_id, reason)`** — admin-initiated from `draft`, `pending`, or `running`. Transitions to `cancelled`. Cascade:
  - **Subscription items** on any `family_subscriptions` pointing to this product: remove via Stripe API. Stripe auto-refunds pro-rata for the remaining current period (`refunds` written by webhook). If an affected family sub has zero items left, cancel the sub at period end.
  - **Single-payment participations** (camps, paid events): full Stripe refund.
  - **Free / external_contract**: no money movement.
  Waitlisted rows hard-delete with no money movement.

- **`finalize_completed_products()`** — daily job. Transitions `running → completed` for products whose `end_date` has passed.

### 6.4 Retired

Already dropped (migrations `00052_drop_sorg_enrollment_cron.sql` and `00059_drop_sorg_tokens.sql`):
- `process_enrollment_charges` — retired with the Sorg token system; no per-session billing cron replaces it.
- `enroll_gamer_in_group` — its responsibilities are folded into `create_participation`.
- `unenroll_gamer` — folded into `cancel_participation`.
- `adjust_token_balance` — retired with the Sorg token system.
- `token_transactions`, `enrollment_charges` tables — replaced by `payments` + `refunds`.

There is **no** session-credit system: no `process_session_credits` cron, no `credit_deductions` / `session_cancellations` ledgers, no `apply_credit_motion` RPC, no `participations.credits_remaining` column. Club billing is a flat monthly Stripe subscription with no per-session accounting.

Groups and `commit_group_changes` are retained and generalized for all product types.

### 6.5 Subscription management

There is no `subscribe_to_product` / `unsubscribe_from_product` RPC. The flow is route- and portal-driven:

- **Subscribe** — the checkout route (`/api/checkout/products/create`) handles `purchase_shape=subscription_monthly`: it reserves the seat (`create_participation`), lazy-creates the Stripe Price for `(product_id, currency)` via `getOrCreateSubscriptionPrice`, and creates a **fresh** Stripe Checkout Session in `mode: "subscription"` — one Stripe sub per (gamer, club), every time (even with a card on file). The `checkout.session.completed` webhook writes the per-participation `family_subscriptions` row.
- **Unsubscribe** — portal-only (§4.5c). The parent cancels the club's sub in Stripe's hosted portal; `customer.subscription.deleted` → `cancel_participation` tears the participation down. No in-app cancel path.

Webhooks (`invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`) update `family_subscriptions.status` and `current_period_end` from Stripe's state, and tear down the participation on deletion. Webhook-driven, not client-driven. All webhook handlers use `stripe_event_id` uniqueness on `payments` / `refunds` as the idempotency gate.

---

## 7. Parent browse UX

UI design and copy are out of scope for this doc (§ "How to use this document"). Business rules that touch discovery flows are captured here so they're not lost; the actual screens land under separate, explicitly-approved design passes.

### 7.1 Two parallel entry points, never cross-linked

- **Consumer browse** — *"I'm shopping for my kid"* catalog. Covers consumer clubs, camps, and events. Canonical product URL: `/browse/[slug]`.
- **Municipality-club registration** — *"my city offers this for free"* catalog. Covers only municipality clubs. Canonical product URL: `/registration/club/[slug]`.

**Why separate.** A parent on consumer browse is picking a product and paying for it; a parent on registration is claiming a subsidised seat their municipality funded and for which their child must be resident (§7.4). Merging forces every parent to confront an irrelevant half of the catalog.

**Rule: no cross-links between the two paths.**

**Canonical URLs enforced via one helper.** A `productDetailPath(product)` helper maps a product to its canonical URL based on `product_type`. Every link in the app — cards, search results, emails, WhatsApp deep-links — goes through it.

### 7.2 Parents see products, not groups

A product with 3 groups × 25 seats shows as one product with 75 seats. Parents pick the product; admins place gamers into groups.

### 7.3 The shop — consumer browse

`/shop` is the single consumer browse surface. A required, mutually-exclusive **Type** filter (Clubs | Camps, default Clubs) lives in the filter card and narrows the grid by `product_type`; it's a client-side filter over a single fetch of all shop types (see §12 "Parent browse surfaces"). **Events are not surfaced** in the shop (no Type chip) and **municipality clubs do not get a consumer-browse landing page** — muni entry is `/registration`.

**Rule: any parent-facing discovery surface that doesn't collect a location cannot surface municipality clubs.**

### 7.4 Location-first discovery — municipality-club entry

`/registration` is the muni-club-only entry. Matches against the full `locations` tree by name.

**Default browse order**: municipality rows first. **Search sort**: municipality > site > region.

**Location page** (`/registration/[locationSlug]`) lists only muni clubs at-or-under the anchor. Consumer products anchored under the same location do *not* show here.

**Residency is intent, not enforcement.** The platform relies on honour-system copy.

### 7.5 Registration timing and ticket-drop UX

Every product has `registration_opens_at` set — admins pick "Right away" (resolves to creation time) or a specific Helsinki-local moment. The detail page has three states: **pre-open** (disabled form with live countdown), **open** (form enabled), **closed/waitlist**. A product opened "Right away" is created with an already-past timestamp, so it skips straight to **open** with no countdown — same code path, no special-casing.

**Layout stability across state transitions** — elements must not shift position when the countdown collapses to "Open now."

**One shared countdown component** — same clock math everywhere a ticket-drop appears.

### 7.6 Parent-visible product detail

Seat state ("8 of 10 seats · 3 on waitlist"), schedule with skipped dates surfaced, venue detail from `site_details.access_notes`, threshold status when set, post-signup confirmation with waitlist position and the padlet URL.

**Pricing display — a single price line driven by the stored base price.** For paid products, the detail page shows exactly one option:

- **Consumer club** — the monthly subscription price from `product_prices.price_cents`. E.g., "€45/mo".
- **Camp / paid event** — the single upfront total from `product_prices.price_cents`. E.g., "€160".
- All amounts in EUR (§4.5). If the product has no EUR row in `product_prices`, it shows as unavailable.

---

## 8. Admin UX

- Single **"Create product"** form with a product type selector that reveals/hides fields by type. Lets admins pre-create 0 or more Gedu Groups each with 0 or more Gedus (§4.1).
- **EUR pricing input**. For `billing_mode='paid'` products, the form collects a single EUR price — a monthly price for consumer clubs or a total for camps/events, stored either way in `price_cents`. Inline preview panel shows the price parents will see. Server recomputes on save — no client-submitted prices.
- **Product management page** per product has a **Groups panel** with an Unassigned column (inbox) and one column per group. Drag-and-drop for moves. Add/rename/delete group controls. Add/remove Gedu controls per group.
- **Gedu picker** supports search by name/email/bio and filter by `profiles.spoken_languages`.
- **Calendar view** per product shows computed sessions with overrides applied; admins cancel/reschedule/substitute directly from it.
- **Holiday calendar management** is a separate admin screen; products subscribe via multi-select.
- **Lifecycle actions** on each pending product: "Start product" (with confirm dialog if under threshold) and "Cancel product" (fires refunds per §6.3). Admin home highlights threshold-hit notifications.
- **Payment reporting** — admin dashboard shows `payments` / `refunds` aggregated per product and per period for reconciliation.

---

## 9. Object inventory

The objects that make up this domain (tables, RPCs, enums, types, service classes, query-key factories, constants, API routes):

- Tables: `products`, `product_prices`, `product_subscription_prices`, `participations`, `payments`, `refunds`, `family_subscriptions`, `product_groups`, `gedu_group_assignments`, `schedule_slots`, `session_overrides`, `session_substitutions`, `session_attendance`, `session_notes`, `holiday_calendars`, `calendar_holidays`, `product_holiday_calendars`, `site_details`, `site_staff_details`, `product_seat_counts`.
- RPCs: `create_participation`, `confirm_reservation`, `expire_reservation`, `cancel_participation`, `admin_remove_participation`, `promote_from_waitlist`, `commit_group_changes`, `cancel_session`, `reschedule_session`, `request_substitute`, `assign_substitute`, `set_substitute`, `record_attendance`, `start_product`, `cancel_product`, `finalize_completed_products`, `product_has_session`.
- Enums: `product_type`, `billing_mode`, `product_status`, `participation_status`, `payment_purpose`, `refund_reason`, `session_note_visibility`, `session_attendance_status`, `topic_kind`.
- Code: `services/products/*`, `services/participations/*` (family-subscription reads/RPCs live here too), `productsKeys`, `ParticipationsService`, etc.
- Routes: admin management at `/admin/products/*`; Checkout endpoints at `/api/checkout/products/*`; webhook at `/api/webhooks/stripe/products`. Parent-facing routes are `/shop` (browse) and `/shop/[id]` (detail, any product type), plus `/registration` for muni clubs.

The Sorg token system that predated this domain is fully removed (no token balances, no `adjust_token_balance`, no `enrollment_charges`, no `enroll_gamer_in_group`/`unenroll_gamer`, no token columns on products). Each customer-facing screen ships under its own explicitly-approved UI pass — the data/payment layer does not authorize a UI change by default.

---

## 10. Build status

### Phase 1 — consumer + municipality

The unified shape is proven against the two product lines closest to real users. Status legend below: ✓ shipped, ◐ partially shipped, ○ not started.

**Schema (§5).**
- ✓ `products` + per-locale `product_translations` (≥1-row rule enforced via `BEFORE DELETE` trigger and RPC payload validation).
- ✓ `topics`, `tags`, `product_tags` + per-locale `topic_translations`, `tag_translations`.
- ✓ `schedule_slots`.
- ✓ `holiday_calendars`, `calendar_holidays`, `product_holiday_calendars`.
- ✓ `product_prices` (per-currency base prices).
- ✓ `site_details` (member-visible) + `site_staff_details` (admin/Gedu only) — the §4.8 split.
- ✓ `registration_opens_at` is NOT NULL (§7.5); "Right away" resolves to creation time.
- ✓ `products` lifecycle status enum stores admin facts only; effective `running` / `completed` derived at read time.
- ✓ `product_groups` (named cohorts, `display_order`, `name NOT NULL` with non-blank check).
- ✓ `gedu_group_assignments` (multi-Gedu join with denormalized `product_id` for the `unique(gedu_id, product_id)` constraint and a BEFORE-trigger that mirrors `product_id` from the group).
- ✓ `participations` (with `'reserving'` status + `reserved_until`, partial unique index excluding reserving rows). No `credits_remaining` — there is no per-session credit balance.
- ✓ `payments`, `refunds` (UNIQUE on `stripe_event_id`).
- ✓ `family_subscriptions` (monthly only; one per participation — `participation_id` unique; one Stripe sub per gamer×club). `product_subscription_prices` (`(product, currency)` PK). The old `family_subscription_items` join table was dropped in `00084`.
- ✓ `product_seat_counts` (public-readable rollup with trigger-driven counts + Realtime publication).
- ○ `session_overrides`, `session_substitutions`, `session_attendance`, `session_notes`.

**RPCs (§6).**
- ✓ `create_product` — atomic insert across products + translations + schedule slots + tags + prices + holiday calendars; rejects empty translation payloads.
- ✓ Effective-status derivation — TS helper (`src/lib/products/effective-status.ts`) and SQL twin `effective_status(product_id)` both ship.
- ◐ Participation lifecycle — `create_participation`, `confirm_reservation`, `expire_reservation`, `join_waitlist`, `cancel_participation` ship; `promote_from_waitlist` ships as a stub (not wired into a customer flow — see §11); `admin_remove_participation` not started.
- ○ Session operations (`cancel_session`, `reschedule_session`, `request_substitute`, `assign_substitute`, `record_attendance`).
- ✓ Subscription management — every consumer-club signup creates its own Stripe sub via Checkout (one per gamer×club); the `checkout.session.completed` webhook writes the per-participation `family_subscriptions` row. Cancellation is portal-only: `customer.subscription.deleted` → `cancel_participation` teardown. There is no inline-add path and no `unsubscribe_from_product` RPC.
- ○ Lifecycle transitions (`start_product`, `cancel_product`, `finalize_completed_products`).
- ✓ Group mutations (`commit_group_changes`) — atomic batch with the staged-changes pattern, extended for named groups, multi-Gedu, and the unassigned inbox. Companion read RPC `get_product_groups_with_details(p_product_id)` returns a single JSONB document with `groups[]` (each with `gedus[]` + `participations[]`) and `unassigned[]` for the panel.

**Admin UI** — at `/admin/{consumer-clubs,municipality-clubs,camps,events}{,/new}`.
- ✓ List page per product type (`ProductListPage`, type-discriminated).
- ✓ Create form per product type sharing one shell (`product-form.tsx`) split into per-section components — identity, audience, when, where, billing, registration, visibility (`src/components/admin/products/sections/*`). Group management was deliberately removed from the form; admins manage groups from the per-product details page (§7.3).
- ✓ EUR pricing block (`pricing-block.tsx`) — a single EUR price input and rendered price previews.
- ✓ Country-aware location picker with inline create (`location-picker.tsx` + `/api/admin/locations/{create,[id]}`).
- ✓ Inline-create for topics and tags (single-locale, in admin's current UI locale) via `/api/admin/{topics,tags}/create`.
- ✓ Site notes editor — separate member-visible vs staff-only fields against `site_details` / `site_staff_details` (`/api/admin/site-notes`).
- ✓ Holiday-calendar checkbox selector on the form (read-only against existing rows; no admin CRUD UI for managing calendars yet).
- ✓ Type-specific helper card on list pages (`product-type-info-card.tsx`).
- ✓ Image picker + upload (`image-picker.tsx`).
- ✓ Groups panel — drag-and-drop UI on the details page (`src/components/admin/products/groups/`). Unassigned column + one card per group with editable name, multi-Gedu pills (add via `GeduPickerSheet`, remove via X button), and droppable participant area. Staged-changes commit-bar pattern via `useGroupEditor`; review summary, then atomic apply through `commit_group_changes`.
- ✓ Edit-product form (thin wrapper around the shared shell; pre-populated via the reverse transform — see §13).
- ○ Calendar view with computed sessions, overrides, substitutions.
- ○ Standalone holiday-calendar management screen.
- ○ Lifecycle action buttons ("Start product" / "Cancel product"), threshold-hit notifications, payment reporting dashboard.

**Form internals.**
- ✓ State + reducers extracted to `product-form-state.ts`; build pipeline (form state → RPC payload) extracted to `product-build.ts`; per-type field availability + scheduling shape + pricing shape configured in `product-type-config.ts`.
- ✓ Multi-locale tabs strip in the Identity card (matching SUPPORTED_LOCALES); initial tab is the admin's UI locale.
- ✓ Translation resolver (`src/lib/i18n/resolve-translation.ts`) with `user locale → en → fi → first available` fallback.
- ✓ Cents helper + currency-aware formatting in `src/lib/constants/{currency,pricing}.ts` and `src/lib/utils.ts`.

**Tests.**
- ✓ Unit: `products-build`, `effective-status`, `pricing`, `resolve-translation`, `participation-state-of`.
- ✓ Integration (route handlers): `products-create`, `checkout-products-create`, `participations-waitlist`, `stripe-webhook-products`.
- ✓ DB: `participations-race` (parallel reservations on a 1-seat product, expired-reservation handling, parallel waitlist monotonicity, idempotent waitlist join, free-product seat cap), `participations-rls` (consolidated cross-customer IDOR coverage for participations / payments / refunds / product_seat_counts; other product tables covered via the `access-control.test.ts` catalog check), `product-seat-counts-trigger` (insert/update/delete recomputes the rollup).
- ✓ DB access-control: `products` family + all financial tables covered by `tests/db/access-control.test.ts`.

**Parent UI**: **do not ship by default**. Each customer-facing screen requires an explicit UX approval from the operator.
- ✓ Browse cards + detail page read real `useParticipationCounts` (seat-left math, threshold progress, "almost full" pill, full-waitlist transitions).
- ✓ Detail-page CTA wires real Stripe Checkout for club subs and single-payment camps; free events register without Stripe.
- ✓ Out-of-stock products show "Join the waitlist" → `join_waitlist` with no charge.
- ✓ Realtime seat counter on the detail page (`useProductSeatCountsRealtime` subscribes to `product_seat_counts` filtered by `product_id`).
- ✓ Already-signed-up detection on the detail page → renders `AlreadySignedUpPanel` (active / waitlisted variants) instead of the signup form.
- ✓ Owned products are shown identically to every other product — no separate purchased rail. The shop loads all shop-surfaced types in one query and the Type filter narrows client-side, so there's a single source for owned and unowned alike.
- ✓ All `?mock=1` gates and `mock-purchased` fixtures deleted from parent surfaces.
- ○ Purchased-state layout for `/shop/[id]`: sub management, session calendar, per-gamer attendance, add-another-gamer affordance. The current `AlreadySignedUpPanel` is the placeholder until this lands. See §13 "Future improvements (detail-page surfaces)".
- ✓ Customer-facing cancellation is portal-only — the Stripe billing portal lists each club's sub (one per gamer×club) and cancels them independently (§4.5c). No in-app leave-club/cancel-sub UI.

**Stripe**: Checkout endpoints, lazy-created Prices for subs, webhook handlers that write `payments` / `refunds`.
- ✓ `POST /api/checkout/products/create` — auth-gated to customers, validates shape × billing_mode × product_type, holds a `'reserving'` row for 30 min before any Stripe call. Single-payment uses inline `price_data`; subs lazy-resolve a `product_subscription_prices` row and create the Stripe Price on first use.
- ✓ `POST /api/participations/waitlist` — auth-gated, calls `join_waitlist`. Idempotent on existing waitlist rows.
- ✓ `POST /api/webhooks/stripe/products` (separate signing secret `STRIPE_PRODUCTS_WEBHOOK_SECRET`) — handles `checkout.session.completed`, `checkout.session.expired`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`. Idempotent via `stripe_event_id` UNIQUE. **Pay-twice race:** if a parent's two reserving rows for the same (product, gamer) both complete payment, `confirm_reservation` returns `kind='duplicate_payment'` on the second webhook. The handler logs `[stripe/products webhook] duplicate payment detected` with all the IDs needed for refund triage (grep Vercel logs to find), inserts a `payments` row with `purpose='reservation_duplicate'` (admin can `SELECT * FROM payments WHERE purpose='reservation_duplicate'` to find candidates), deletes the orphan reserving row, and returns 200. Refunds are issued manually by an admin from the Stripe dashboard when the customer reports the double charge.
- ✓ Movie-ticket reservation model — status holds the seat for the full 30-min Stripe-session lifetime; cancel-in-Stripe is a no-op; retry reuses the held row. See §13 "Movie-ticket reservation model".

### Phase 2 — camps and events

- Multi-day schedule slots with per-day timing.
- Single-payment Checkout for camps/events.
- Event type with optional uncapped seats (free only).

### Phase 3 — operational & reporting

- Attendance-driven removal policy.
- Substitute-Gedu finder.
- Municipality reporting dashboards.
- Term / season templates.
- Sibling / multi-child discount (a Stripe coupon, or a multi-tier lookup) if business wants it. Would need a fresh column + coupon wiring — an earlier `discount_coupon_id` column existed but was dropped as dead code.
- First-session-free / promo codes.

### Phase 4 — on-platform municipality billing

Today, municipality invoicing is fully offline (`external_contract`). Future: `municipality_accounts` entity, a new `billing_mode='municipality_account'`, coordinator role, on-platform invoicing.

Design now by avoiding `product_type='municipality_club'` as a switch anywhere billing decisions are made — branch on `billing_mode` instead.

### Phase 5 — gated access (if needed)

School-code gating, private beta for specific municipalities, regional locks. Deferred — customer base is small and trusted.

---

## 11. Open questions

Flagged inline as `OPEN` in the sections they affect.

- ~~**Subscription semantics: top-up balance vs rolling access.**~~ *Resolved:* **flat monthly subscription, no credits.** A consumer club is a single monthly Stripe subscription item; while the sub is active, attendance is unlimited. There is no per-session credit balance, no cancel-in-window accrual, no `credits_remaining`. Cancelling stops the club at period end (§4.5c).
- **Grace window length on failed sub payment.** Parent is notified; gamer is held out of sessions; seat held for some period before admin reclaims it. `OPEN — defer`.
- ~~**Refund policy on `cancel_participation`.**~~ *Resolved:* **no Stripe refund on customer-initiated participation cancellation**, ever. "Leave this club" stops the club at period end with paid-through access until then (§4.5c). For camps and paid events, customer-initiated cancellation is not self-serve — parents contact support and admin uses `admin_remove_participation` to issue a refund if appropriate.
- ~~**Subscription currency change UX.**~~ *Moot under EUR-only (§4.5):* every family subscription is EUR, so there's no currency-change path. Revisit if multi-currency is re-enabled.
- **Single-group auto-assign.** When a product has exactly one group, auto-assign new participations instead of routing through the inbox? Defer until we see inbox in real use.
- **Unassigned inbox notifications.** WhatsApp / email / in-app nudges to admins when the inbox has sat non-empty for N hours. Future phase.
- **Attendance → removal policy.** N-unexcused-absences threshold, approval flow, appeal path. Defer until attendance tracking ships.
- **`promote_from_waitlist` lifecycle is not yet wired.** Function shipped in 00039 as a forward-looking stub per §6.1. As written it (a) holds no `FOR UPDATE` lock so two concurrent webhook workers could pick the same row, and (b) doesn't transition the row's status — it stays `'waitlisted'`, which makes a subsequent `create_participation` for that gamer hit the existing-row guard with "already on waitlist". Zero TS callers, zero tests today. The intended flow (cancel → admin emails next-on-waitlist → parent clicks → re-checkout) needs an additional RPC to convert a waitlist row into a reservation without tripping the existing-row check, plus the cancellation RPCs need to actually invoke it. Defer until the waitlist-promotion phase starts; rewrite with locking + transition + race tests parallel to `tests/db/participations-race.test.ts`.
- **Event account requirement for truly free events.** The platform requires an account for all participations. Consider magic-link + gamer-only capture later if friction is too high.
- **Topic taxonomy depth.** Sub-topics (Minecraft — Survival vs Redstone) or new topics — add a value to the `product_topic` enum (and a `PRODUCT_TOPICS` entry), or graduate back to a `topics` table if the set ever needs to be admin-managed again. Not yet.
- **Calendar view as a first-class parent feature.** "Everything my kids are doing this week" across products is obvious future UX. Design the per-gamer session query to support it.
- **Gedu schedule-conflict prevention.** §4.1 enforces one-group-per-product via unique on `gedu_group_assignments`. Cross-product time conflicts are human-enforced.
- ~~**`site_details.access_notes` visibility.**~~ *Resolved:* split into two tables — `site_details` (member-visible: address, parking, wifi) is publicly SELECT-able; `site_staff_details` (gate codes, back-entrance directions, ops notes) is admin + Gedu only. See §4.8.

---

## 12. Appendix

### 12.1 Cross-references

- Location hierarchy & site binding: `docs/locations-architecture.md`
- Voice-room wiring for online products: `docs/voice-chat-architecture.md`
- Email pipeline for notifications: `docs/email-architecture.md`
- WhatsApp notification channel: `docs/whatsapp-automated-flow.md`
- Stripe testing locally: `docs/stripe-testing.md`

### 12.2 Mockup lineage

Three UX mockups live on the `feature/school-clubs-mockup` branch (see top of doc).

- **Parent browse mockup** at `/browse-mockup` — consumer catalog. Consumer clubs, camps, events; muni clubs filtered out.
- **Parent registration mockup** at `/registration` — municipality-club entry. Location-first search, muni-only listings, ticket-drop countdown.
- **Admin create-product mockup** at `/admin-mockup/products/new` — admin flow for all four product types.

All three are sketches, not implementations. **None of them model the fiat pricing, subscription, or single-payment flows — they predate the billing layer.** When the billing-layer screens are designed, the mockups are a starting point for product-type-specific flows only; pricing UX is new work.

### 12.3 Stripe webhook deployment across environments

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

**1. Preview (feature branch on PR open).** Repeat this if a future feature branch needs its own webhook.

```bash
# Test-mode webhook pointing at the branch preview URL
stripe webhook_endpoints create \
  --url "https://sogverse-git-<branch>-kyle-sogs-projects.vercel.app/api/webhooks/stripe/products" \
  --description "products webhook (preview)" \
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

**2. Staging (when this PR merges to `dev`).** The `dev` branch's preview URL is stable but a different host than the feature-branch preview, so the existing webhook needs to be re-pointed (or a fresh one created and the old one deleted). Re-pointing is simpler — the signing secret stays the same and Vercel needs no change.

```bash
# Re-aim the existing test-mode endpoint at the staging URL
stripe webhook_endpoints update we_<id-from-step-1> \
  -d "url=https://sogverse-git-dev-kyle-sogs-projects.vercel.app/api/webhooks/stripe/products"
```

If the feature-branch preview also still needs to work (e.g. another PR is open against `dev` and we want both to fire), create a second endpoint instead of updating, and add the new secret to Vercel preview *scoped to that branch*: `vercel env add STRIPE_PRODUCTS_WEBHOOK_SECRET preview <git-branch> --sensitive`. Branch-scoped overrides take precedence over the unscoped preview value.

After the merge, smoke-test against staging: club sub purchase, single-payment camp purchase, waitlist join, refund.

**3. Production (cut from `dev` to `main`).** Brand new live-mode endpoint, brand new signing secret in Vercel's `production` env. Do **not** reuse the test-mode secret in production.

```bash
# Live-mode webhook against the production domain
stripe webhook_endpoints create --live \
  --url "https://<prod-domain>/api/webhooks/stripe/products" \
  --description "products webhook (production)" \
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

**What `.env.local` does NOT need.** `STRIPE_PRODUCTS_WEBHOOK_SECRET` is not required in `.env.local` for normal local dev. `stripe listen --forward-to localhost:3000/api/webhooks/stripe/products` prints a fresh `whsec_...` per session — paste that into the running process's env or your shell, not into committed-template files. `.env.local.example` documents the variable name only, with a comment pointing at this section. Do **not** check in any real `whsec_...` value.

### 12.4 Why we kept Gedu Groups (and generalized them to every product type)

An earlier version of this doc retired `product_groups` in favor of cloning whole products. Product-team feedback pushed back: groups are the right abstraction for admins organizing who-runs-what-with-whom inside a product, and they should apply to all four product types.

What kept groups:

- **Demand is often unknown up-front.** Decide on 1, 3, or 4 groups *after* 75 people bought in, not pre-committing.
- **The "Bob covers for Adam" use case works naturally** via cross-group voice mobility (§4.10).
- **Existing drag-and-drop already works.** Extending it with an inbox column is cheap.

What made generalizing safe:

- **Parents don't see groups.** Cost is admin-facing only.
- **Capacity stays product-level.** Groups don't introduce a second seat-math layer.
- **Events are forgiving.** A one-group event's UI collapses to a single column and gets out of the way.

---

## 13. As-built component map and implementation notes

This section is the as-built reference for what's wired today — the component map, the admin edit flow, and the parent browse / detail surfaces. §1–§9 are the design; this is the code.

### Component map

```
Pages (admin only)
├── /admin/{consumer-clubs,municipality-clubs,camps,events}             → ProductListPage (productType discriminator)
├── /admin/{consumer-clubs,municipality-clubs,camps,events}/new         → NewProductPage → ProductFormCreate
├── /admin/{consumer-clubs,municipality-clubs,camps,events}/[id]        → ProductDetailsPage (read-only header + summary + Edit button)
└── /admin/{consumer-clubs,municipality-clubs,camps,events}/[id]/edit   → EditProductPage → ProductFormEdit

Form (src/components/admin/products/)
├── product-form.tsx                — Shared shell: sections, validate, error display, committing flag
├── product-form-create.tsx         — Wraps shell with create mutation, "Create {label}", route to list
├── product-form-edit.tsx           — Wraps shell with update mutation, "Save changes", route to details
├── product-form-state.ts           — Form state shape, defaults, reducers
├── product-build.ts                — Form state → RPC payload (build/validate + reverse transform)
├── product-type-config.ts          — Per-type field availability, scheduling shape, pricing shape
└── sections/
    ├── identity-section.tsx         — Name/description per locale, topic (fixed enum), image
    ├── audience-section.tsx         — Age range, spoken languages, group seat count
    ├── when-section.tsx             — Start/end date, schedule slots, holiday calendars
    ├── where-section.tsx            — Location picker (site or jurisdiction depending on type)
    ├── billing-section.tsx          — Pricing block, refund policy
    ├── registration-section.tsx     — Registration opens at (immediate vs scheduled)
    ├── groups-section.tsx           — Inline group + gedu setup
    └── visibility-section.tsx       — Status, is_visible toggle

Shared building blocks
├── form-primitives.tsx              — Section, Field, etc.
├── pricing-block.tsx                — Single EUR price input
├── location-picker.tsx              — Country-aware hierarchy + inline create
├── gedu-picker-sheet.tsx            — Searchable Sheet for gedu assignment
├── image-picker.tsx                 — Upload + preview
├── holiday-calendar-option.tsx      — Calendar checkbox row
├── schedule-slots-editor.tsx        — Weekday + time-range editor
├── site-notes-editor.tsx            — Member-visible vs staff-only notes
├── product-type-info-card.tsx       — Type-specific helper card on list pages
└── group-card.tsx                   — Group preview within form

API routes (admin-only)
├── /api/admin/products/create       — Calls create_product RPC, then updates image_path
├── /api/admin/products/[id]/update  — Calls update_product RPC; uploads new blob first, deletes old/orphan blob after
├── /api/admin/locations/create      — Inline create from location picker
├── /api/admin/locations/[id]        — PATCH name only
└── /api/admin/site-notes            — Upsert site_details / site_staff_details

Services (src/services/products/)
├── products.service.ts              — Read methods (listByType, getByIdForAdmin); write goes through API routes
├── products.queries.ts              — useProductsByType, useProductAdmin, useCreateProduct, useUpdateProduct
└── reference-data.queries.ts        — useHolidayCalendars, useSiteDetails, etc.

Parent browse + detail (src/components/public/products/)
├── product-browse-page.tsx          — Page orchestrator: heading, filters, browse grid, empty states
├── product-browse-filters.tsx       — Type / game / format / language chips + clear-all
├── product-browse-card{,-view}.tsx  — Browse-card adapter + presentational View
├── product-purchased-card{,-view}.tsx — Purchased-card adapter + View
├── registration-pill.tsx            — RegistrationPill (outline chip) + useRegistrationCta hook
├── derive-registration-state.ts     — Pure state machine: product + now + participation count → RegistrationState
├── format-product-{schedule,price,location}.ts — Pure formatters
├── filter-products.ts               — Pure topic / tag / format filter
├── use-browse-filters.ts            — URL-backed filter state (deep-linkable)
├── product-detail-page.tsx          — Route adapter: fetches, resolves auth, derives state
├── product-detail-page-body.tsx     — Page body: hero, layout, calendar card, signup-panel slot
├── signup-panel{,-view}.tsx         — Adapter + View (per-state panel + auth overlays)
├── pricing-panel-view.tsx           — Two-track stacked list (Subscribe / Pay-as-you-go)
├── pricing-options.ts               — Pure builder for pricing tracks + options
└── countdown-clock.tsx              — Live ticking clock + useCountdownDone()

src/components/calendar/
├── compute-product-sessions.ts      — Pure: walks the term, marks holidays as skips
└── session-calendar-view.tsx        — Pure: stacked mini-month grids

i18n
└── src/lib/i18n/resolve-translation.ts — user locale → en → first available
```

### Status vs. visibility

These are **two orthogonal concepts** even though they look related at a glance.

- **`is_visible`** — should parents see this product on browse pages? Pure UX gate. Toggleable at any time.
- **`status`** — what lifecycle state is the product in? `draft`, `pending`, `cancelled`, or the `running` override (with `completed` and `expired` derived from dates).

A product can be in any combination **except one**: a `draft` product must always be hidden. Published-to-parents and incomplete are mutually exclusive — if it's visible, it's no longer a draft. Enforced at the DB by `chk_products_draft_implies_hidden` (migration 00036). The other combinations are all valid: `pending + visible` (the normal published state), `pending + hidden` (complete but the admin is staging), `cancelled + visible` (still listed with an "Ended" treatment), and so on.

**What `draft` means.** `draft` means *the product's mandatory fields are not yet filled in* — not "hidden", not "unpublished", but **incomplete**. The schema honors this by giving `draft` rows escape hatches on the constraints that require `end_date`, `registration_opens_at`, etc., so an admin can save a half-finished sketch and come back to it.

`draft` is reserved, not active today. The current admin create form runs full `validate()` before submitting, so it only ever produces fully-populated rows. It emits `status: "pending"` unconditionally — visibility is the sole knob it exposes. The state stays in the schema for a future "Save as draft" admin action that deliberately bypasses validation. The list page suppresses the redundant "Hidden" pill on rows whose status is `draft`. (History: prior to migration `00035_decouple_draft_from_hidden.sql`, the form tied `is_visible = false` to `status = 'draft'`, which made every hidden product look incomplete; the form was changed to always emit `pending`.)

### Effective status

`status` stores admin-driven facts only — `draft`, `pending`, `cancelled`, and the `running` override. `pending → running → completed` are derived at read time from stored facts plus `now()`:

- `pending` → `running` when `start_date` has been reached AND any `signup_threshold` is met.
- `running` (stored or derived) → `completed` once `end_date` has passed.

The TS helper (`effective-status.ts`) and the SQL function `effective_status(product_id)` share the same rule. The SQL form is what RLS / list queries call when filtering by effective state.

### Admin edit flow

An admin edit goes through `update_product()`, the sibling of `create_product()`. Same shape minus the immutable fields (`product_type` is locked by the URL, `status` is preserved across the update so effective-status keeps deriving naturally from the data fields the admin actually changed). Inside one transaction the RPC updates the parent row and wipes-and-replaces every child set (translations, prices, schedule slots, tags, holiday-calendar links).

**Translation wipe-and-replace ordering.** A naïve `DELETE FROM product_translations WHERE product_id = …` followed by `INSERT` would trip the BEFORE-DELETE keep-≥1-row trigger when the product has only one row. The RPC instead UPSERTs the new translation set first, *then* deletes leftovers (rows whose locale isn't in the new set). By the time deletes fire, the new rows are already in place, so the trigger's "another row remains?" check passes for every leftover. See migrations `00046_update_product_v2_rpc.sql` and `00047_relax_product_translations_locale_rule.sql`.

**Image handling.** The RPC takes `p_image_path` as a regular argument; the API route owns the storage bucket dance around it — replace (upload new → call RPC → on failure delete the just-uploaded blob, on success delete the old), clear (`p_image_path = NULL` → on success delete old), or keep (pass existing path through, storage untouched). The route never trusts path strings from the client: the existing path comes from the DB, the new path from the just-uploaded blob. The RPC ensures DB atomicity; storage cleanup lives in the route because Supabase Storage is a separate system from the SQL transaction.

**Reverse transform** (`existingFormState` in `product-build.ts`) maps a fetched `ProductAdminDetailRow` back into `FormState` so the edit form re-renders the persisted data. Round-trip property: fetch → `existingFormState` → `buildUpdateInput` → RPC preserves the row's data fields (covered by `tests/unit/components/products-existing-state.test.ts`). Decisions baked in: `manualEdits` is seeded with all 3 currencies (otherwise editing the EUR price would FX-overwrite the persisted GBP/USD values the admin chose deliberately); `registrationOpensMode` is derived from the timestamp (future → `scheduled`, past → `immediately`); `groups: []` because the Groups section is UI-only on both create and edit — group/gamer assignment lives on the details page.

The edit form deliberately doesn't expose stored `status` — it updates naturally because effective status is derived. Future "Cancel product" and "Save as draft" actions, when they ship, set `status` via dedicated buttons rather than a form field, and live on the details page rather than the edit form.

### Site location split

Site-specific fields live in two extension tables, not on `locations` itself: `site_details` (public, member-visible — address, parking, wifi, opening hours) and `site_staff_details` (admin + Gedu only — gate codes, back-entrance directions, ops notes). Splitting by visibility tier keeps RLS clean (row-level, not column-level). The `locations` table itself (name + type + parent chain) is anon-readable as of migration `00037_locations_anon_read.sql` so the parent-facing browse and detail pages can render "Tapiolan koulu, Espoo" before sign-in; the two detail tables keep their own policies.

Schema invariants enforced by `validate_products_location`:

| Variant | `location_id` | Required `locations.type` |
|---|---|---|
| In-person (any product type) | required | `site` |
| Online + `municipality_club` | required | `country` / `region` / `municipality` (NOT `site`) |
| Online + non-muni | must be NULL | — |

The browse/detail queries join `locations(id, name, type, parent:parent_id(id, name, type))` — exactly one parent level (the FK is traversed via the column name `parent_id`, not `locations!parent_id`, which PostgREST would resolve to children instead).

### Parent browse surfaces

Route: `/shop`. One storefront for both browseable types. `ShopBrowse` reads the required `?category=` (Clubs | Camps, default Clubs — `use-shop-category.ts`) and renders `ProductBrowsePage` for the matching `product_type`. `ProductBrowsePage` fetches **all** shop-surfaced types in one query (`useVisibleProductsByTypes(SHOP_PRODUCT_TYPES)`) and narrows to the selected type client-side, so switching the Type filter is instant with no refetch. Owned products render as ordinary browse cards — there is no purchased rail. Municipality clubs and events are not surfaced.

**View + adapter split.** Each card is two files. The **View** takes already-resolved display props (strings, numbers, the registration state) and is pure presentational. The **adapter** of the same name resolves a `ProductBrowseRow` (or participation row) into those props — locale, currency, schedule, price, registration state, tag labels. This lets the UI Components style guide at `/admin/ui-components` render every card state by hand without forging a full DB row.

**Registration pill (parent voice, only when notable).** `RegistrationPill` renders only when there's something actionable or urgency-creating to say; default-open (plenty of seats, sign-ups open) returns `null`.

| State (from `deriveRegistrationState`) | Renders | Pill copy |
|---|---|---|
| `open` with `seatsLeft` ≤ 3 | yes | "Only N spots left" |
| `open` with more headroom | **no** | (Sign-up button does the talking) |
| `pending_thr` | yes | "Need N more to start" |
| `full_waitlist` | yes | "Full — waitlist open" |
| `full_closed` | yes | "Full" |
| `closed_pre` | yes | "Opens 15 May" |
| `running_late` | yes | "Already started" |
| `ended` | yes | "Ended" |

`useRegistrationCta(state)` returns the card's CTA — primary "Sign up", secondary "Join waitlist", disabled "Full" / "Opens 15 May", or `null` to hide it (`running_late`, `ended`).

**`deriveRegistrationState` decision tree** (top-down, first match wins; lives in `derive-registration-state.ts`):

```
ended         ← effectiveStatus in { completed, expired, cancelled }
closed_pre    ← registration_opens_at > now
running_late  ← effectiveStatus = running AND product_type in { camp, event }
pending_thr   ← raw status = pending AND signup_threshold IS NOT NULL
                  AND participations_count < signup_threshold
full_waitlist ← seat_count IS NOT NULL AND participations_count >= seat_count AND waitlist_enabled
full_closed   ← seat_count IS NOT NULL AND participations_count >= seat_count AND NOT waitlist_enabled
open          ← otherwise (carries seatCount + seatsLeft + waitlistEnabled)
```

Muni clubs are intentionally not surfaced in the shop — they have no Type chip and are reached only via the `/registration` direct-link entry, never navigated to from within the site.

**RLS / effectiveStatus interplay.** RLS only returns `pending` and `running` rows to anon/customer; `completed` is hidden at the DB. The browse card still renders the "Ended" pill because `effectiveStatus()` catches `running` rows whose `end_date` has passed (cron lag between midnight and a `running → completed` flip). Do **not** add `completed` to the service filter — see the comment in `products.service.ts:listVisibleByTypes`.

**Filter UX.** Filter chips are URL-driven — deep-links like `/shop?category=clubs&topic=minecraft&tag=creative&format=in_person` reproduce a filter state. The **Type** chip leads the filter card and is special: it's the required, mutually-exclusive `?category=` param (`useShopCategory`), never empty and never touched by Clear. The rest are `useBrowseFilters`. `filterProducts` is a pure function over `(rows, { topics, tags, format })`; the Type narrowing happens before it in `ProductBrowsePage`. Topic/tag are multi-select, slug-based, OR-within-row + AND-across-rows; format is single-select (`online` / `in_person`, maps to `products.is_remote`). Clear is always rendered (`invisible` when nothing to clear) so the row's box height is constant.

### Parent detail page

Route: `/shop/[id]` — one flat route for every product type. `product-detail-page.tsx` fetches the product and derives its type from the row (for type-specific copy and the "back to listing" link). The URL ends in an opaque product id, so a per-type segment would add nesting without improving readability.

**One layout, enrollment-aware panel.** There is **one URL per product** — marketing emails, share links, search results, and parent-to-parent forwards all keep working — and every product renders the same `ProductDetailPageBody`. Whether the viewing parent has a gamer enrolled only changes the signup panel: an active/waitlisted participation renders `AlreadySignedUpPanel` (with a "view my products" link); otherwise the panel dispatches on `deriveRegistrationState`. A richer purchased-state layout (sub management, calendar, attendance) is future work — see "Future improvements" below.

**Hero** is a 1:1 product image plus the type label, name, and tagline. The two-column body stacks below: the left column carries description, when-and-where, the session calendar, and the topics/tags card; the right column is a 380px sticky signup panel on desktop that drops below the main column on mobile. **No gedu surface on the parent detail page** — gedu / group identity is a SOG-internal concern.

**Pricing — a single price line.** There is one purchase option per type: consumer clubs show one monthly subscription row, camps and paid events show one upfront price line, and free / external_contract products show a single non-clickable hint row. All amounts in EUR (§4.5).

**Signup-panel registration states.** The same `deriveRegistrationState` that powers browse cards drives the panel: `closed_pre` shows a live countdown clock with the form pre-fillable and a disabled "{verb} — not yet open" CTA that flips to active at zero without remounting; `open` shows an optional almost-full banner + active CTA with the chosen price; `pending_thr` a threshold progress bar + "Reserve a spot"; `full_waitlist` a waitlist explainer + secondary "Join the waitlist"; `full_closed` disabled "Fully booked"; `running_late` / `ended` a muted note with no form. Auth overlays sit on top: unauthenticated visitors see a "Sign in to register" / "Create account" pair, customers with no gamers see "Add a child first" linking to `/parent/gamers`, non-customer roles see an explainer.

**Preview / mock route.** `/preview/products/[type]/[state]` renders the body with a `buildDetailFixture(type, state)` payload. Public route inside `(public)` so it picks up the parent-eye chrome; never indexed (`metadata.robots = { index: false, follow: false }`); reachable only via `/admin/ui-components` "Preview full page →" links. Designers can poke at all 32 (type × state) cells without seeding data.

**Click target.** The active CTA POSTs to `/api/checkout/products/create` with `{ productId, gamerId, purchaseShape, currency }`. The route returns one of `redirect` (Stripe Checkout URL — every paid signup, subscriptions included), `free_confirmed` (free event, no Stripe), or `full` (UI flips to waitlist CTA).

### Movie-ticket reservation model

The `participations` row **is** the seat. Each click on Sign Up creates a fresh `reserving` row held until either Stripe fires `checkout.session.completed` (→ `confirm_reservation` flips it to `active`) or `checkout.session.expired` (→ `expire_reservation` deletes it). These two events are mutually exclusive on Stripe's side, so the seat is never simultaneously released and confirmed — no race window.

Status alone holds the seat. `count_seats_taken` counts `active + reserving`; `reserved_until` is informational only and no longer consulted by seat math. We trust Stripe's webhook delivery as source of truth — if `checkout.session.expired` never arrives (rare), the reserving row is stuck until manual cleanup. The schema's partial unique index (`uq_participations_active_or_waitlisted`) excludes `'reserving'`, so multiple held rows for the same parent/gamer can coexist — that's what lets each click be independent.

Concrete behaviors that fall out of this model:

- **Cancel in Stripe Checkout = no DB action.** The `cancel_url` brings the parent back to the product page; the unpaid Stripe session dies on its own at `expires_at` (~30 min), Stripe fires `expired`, and the webhook releases the seat.
- **Retry = a brand-new reservation.** If seats remain, the second click succeeds and the parent holds two reserving rows; whichever pays first wins, the other is cleaned up by `expire_reservation`. If the parent's own held seat is the last one, the second click sees `kind='full'` and the UI flips to "Join the waitlist."
- **Pay-twice is bounded by the schema.** Two paid tabs: first webhook flips its row to `active`; the second hits the unique index → Postgres `23505`; the webhook catches the code, logs loudly, returns 200. The duplicate charge sits unrefunded; admin reconciles via the Stripe dashboard.
- **Success redirects to the product detail page** (`/shop/[id]?signup=success`); the `?signup=success` flag triggers a query invalidation to catch a late webhook.
- **Held seat = visible to other parents as taken** for up to 30 min until `checkout.session.expired` cleans it up.

The `expire_reservation` RPC stays around — the webhook calls it on `checkout.session.expired` — but is **never** invoked from a customer-facing API route.

**Waitlist is dead until promotion lands.** `promote_from_waitlist` exists in the schema but no caller wires it up — no email path, no cron, no trigger on participation removal. A waitlisted parent is not notified when a seat opens; whoever clicks Sign Up first wins it. (Plan: post-removal RPC trigger + transactional email + opt-in re-checkout link — see §11.) A known minor wart: a parent with a held reserving row who clicks "Join waitlist" gets the held row back as-is (`join_waitlist`'s idempotency check accepts `'reserving'`); the state self-heals when the reserving row expires. The `'reserving'` carve-out is deliberate — with no promotion logic, a "correctly waitlisted" parent would be stuck behind their own waitlisted row.

### Non-obvious gotchas

- **`useTranslations` types don't cross function boundaries.** Helper functions that take `ReturnType<typeof useTranslations<"productBrowse.card">>` trip TS2589 ("excessively deep"). Closure-bind `t` inside the component and write small literal-key dispatcher helpers (see `headingFor` in `product-browse-page.tsx`).
- **Lucide icons must not be aliased to a local variable in render.** `react-hooks/static-components` flags `const Icon = iconFor(state)` as dynamic component creation. Wrap the switch in a tiny component (`<StateIcon state={state} className=… />`).
- **The View receives an already-formatted price.** The adapter resolves the EUR `product_prices` row and formats it into a `ProductPriceLine`; the View just renders it. Same rule for locale-aware date formatting — the View stays presentational.

### Future improvements (detail-page surfaces)

- **Purchased-state layout for `/shop/[id]`.** The big one. Same route, substantially different UI when the viewer has at least one enrolled gamer: sub management (cancel sub, next billing date), session calendar and per-gamer attendance, **add-another-gamer affordance** (the gap left by today's "go back to browse and pick a different gamer" workaround), leave-club / cancel-sub confirms. Today an enrolled viewer just gets `AlreadySignedUpPanel` in the standard body. **Skeleton caveat:** the body shows `DetailLoadingSkeleton` (hero + 2-column with a tall signup panel); a real purchased layout has a different shape and the skeleton will then reflow visibly — branch the skeleton too when the layout is designed (the CLAUDE.md "no in-place shift" rule).
- **Admin-cancel-session UI.** `session_overrides` is designed but not shipped. When it lands, extend `computeProductSessions` to merge those rows into `skips` — the calendar View needs no change.
- **Admin details page — gamer/group management surface.** Once participations land, the details page should host gamer→group assignment plus an "unassigned gamers" tray so admins can do roster work without leaving the product. Cancel-product and Save-as-draft buttons also live here.
- **Gedu session-details page — unassigned-gamers tray.** `get_gedu_assigned_product` returns `groups[]` only; new signups not yet placed in a group (`participations.group_id IS NULL`, `status = 'active'`) are invisible to the gedu. Add a read-only "Awaiting assignment" section (extend the RPC's return JSONB with an `unassigned[]` array). Gedus can't move gamers — that's still admin-only via `commit_group_changes`. Also: `SessionDetailsPage` conflates a genuine forbidden (`null`) with transient errors — check `isError` separately and reserve `NotAssignedState` for the `42501` case.
- **Extend `site_details` read policy to purchasing customers.** Migration `00038_site_details_restrict_to_staff.sql` tightened `site_details` to admin + gedu only. The handoff intent was admin + gedu + customers who have purchased a product at that site. Add a third SELECT policy on `site_details` keyed on an active participation at the site, with positive/negative cases in `tests/db/site-details-rls.test.ts`. Leave `site_staff_details` admin + gedu only.
- **`update_product` silently wipes parent fields the form doesn't surface.** It accepts every editable column with `DEFAULT NULL`; any field the build pipeline (`buildSharedFields` in `product-build.ts`) omits lands as `NULL`. Concrete trap: `refund_policy_days` is in the schema but no UI sets it; a future feature/backfill that populates it would get nulled on the next form edit. **Fix:** make the route pass through fields the client didn't send (mirrors `image_path` "keep current"), or take an explicit "set" sentinel per optional column.
- **CTA stays active when a price row is missing for the viewer's currency.** The admin form validates all three currencies (`product-build.ts`), but the DB doesn't enforce it (`product_prices` is a `(product_id, currency)` PK with no count constraint). A product missing a currency renders "Not in {currency}" in the price slot but the CTA stays active — once Stripe Checkout is wired, a parent could click Sign up on a product they can't buy. **Fix:** plumb price availability into the CTA decision (disable or hide with a "Switch to {available currency}" hint), parallel to the `ended` treatment.
- **Events should remain purchasable on their start day until the actual start time.** `deriveRegistrationState` returns `running_late` for any camp or event whose `effectiveStatus` is `running`, and `effectiveStatus` flips to `running` at 00:00 local on `start_date`. For camps this is correct (the cohort started together — CPO confirmed). For events it's wrong: a Friday 18:00 party becomes `running_late` at Friday 00:00. **Fix:** for `event` only, combine `start_date` with the first `schedule_slots.start_time` to get an instant and return `running_late` once `now >= startInstant`. Also clean up the `running_late` card to show a soft "already underway" line instead of an orphaned price block.
- **`effective_status` SQL twin maintenance.** The TS helper uses `date-fns-tz` to compare `start_date` / `end_date` against `now` in the product's timezone and derives an `expired` state for pending products whose `end_date` passed without satisfying the start conditions. Keep the SQL function `effective_status(product_id)` in lockstep when DB-side filters need to match the client.
- **Image hero + lightbox.** The image renders as a 1:1 thumbnail in the hero today; a future "tap to enlarge" wouldn't break the layout.
- **Dead-end detail panels.** Browse-card CTAs only link to actionable states; `FullClosedPanel` / `RunningLatePanel` / `EndedPanel` have no normal browse → detail entry. They render defensively for direct-URL access and in-session state transitions. The UI Components page is the canonical regression surface for them — keep its preview tiles current.
