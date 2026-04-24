# Products Redesign — Unifying Clubs, Camps, and Events

Forward-looking architecture proposal that redesigns the `products` domain to cleanly support **four product types** (consumer clubs, municipality clubs, camps, events), **replaces the Sorg token system with real-currency pricing**, and **ships in parallel with the existing schema** under a `_v2` naming convention until a human-triggered cutover. Not yet implemented.

Status: **design / pre-implementation**. Supersedes `school-clubs-design.md`. Rename to `products-architecture.md` at cutover (§9).

Related: `groups-architecture.md`, `customer-enrollment-architecture.md`, `locations-architecture.md`, `voice-chat-architecture.md`, `email-architecture.md`, `whatsapp-automated-flow.md`. `sorg-token-architecture.md` is retired by this redesign at cutover.

---

## How to use this document (doc vs. mockups)

Treat this doc as the canonical spec. Three UX mockups live alongside it on the `feature/school-clubs-mockup` branch:

- **Admin create-product mockup** at `/admin-mockup/products/new` — sketches the admin flow for all four product types, including the location tree, Gedu picker, group cards, and three-mode start trigger.
- **Parent browse mockup** at `/browse-mockup` — sketches the consumer catalog (clubs / camps / events, muni clubs excluded): filter bar, help-me-decide quiz, and the shared detail + signup page.
- **Parent registration mockup** at `/registration` — sketches the municipality-club-only flow: location-first search across the `locations` tree, muni-only listings per location, ticket-drop countdown, one-click registration, waitlist experience. Detail URL is `/registration/club/[slug]` — never cross-linked to `/browse-mockup`.

Both mockups are deliberately built **without** i18n, RBAC, real data queries, or the real design-system patterns of the codebase — they exist so the product team can click through and react to flows. UI design is **out of scope for this redesign doc**. UI rollout will happen under separate, explicitly-approved design passes after the data/payment layer is in place.

When we implement this for real, the doc is expected to travel into the dev branch on its own while the mockups stay behind as visual references:

- **Doc is the source of truth** for business rules, schema, RPCs, per-type behavior, and permission topology. Anything production needs that the mockups don't model — auth, RLS, query invalidation, accessibility, i18n, dark-mode contrast — lives in the doc. If it's in the doc, build it; if it's not, flag it and update the doc before coding.
- **Mockups are sketches** for UX patterns. Look at them while building those screens; don't port them line-by-line.
- **If the doc and a mockup disagree, the doc wins.**

---

## 1. Why redesign

Today's `products` schema is built for a single product line — weekly consumer clubs priced in Sorg tokens. A `product_groups` layer organizes participants and Gedus within a product, and `group_enrollments` + `enrollment_charges` drive per-session token billing. Groups stay under the new design (§4.1); the schema around them is reshaped so all four product types use them uniformly.

Two things change together in this redesign:

1. **Four product types as first-class citizens** (consumer clubs, municipality clubs, camps, events) instead of one.
2. **Sorg tokens are retired.** Products are priced in real currency (EUR, GBP, USD today; additional currencies later) using manual per-currency admin input. Parents buy either session bundles (1 / 4 / 10 sessions) or family-level subscriptions (monthly, quarterly; yearly future). Checkout uses Stripe with the user's selected currency as the authoritative price — no Stripe Adaptive Pricing, no exchange-rate-derived amounts.

Extending the existing token-era schema to support fiat pricing and multi-purchase-shape checkout would leak concepts across every table and RPC. The redesign is a ground-up reshape.

### 1.1 Ships in parallel, not cutover

Unlike the earlier drafts of this doc that assumed a greenfield wipe-and-recreate, this redesign runs **in parallel** with the existing token-era code and tables. Every new table, RPC, enum, service class, query key factory, constant, and API route uses a `_v2` suffix during the parallel phase. The existing Sorg token system stays running; customers and staging data on the old schema are untouched. A human-triggered cutover (§9) drops the old tables and strips the `_v2` suffixes from the new ones in one mechanical migration.

This keeps staging usable throughout the redesign and lets us ship the new system one piece at a time behind its own routes.

---

## 2. The four product types

| | **Consumer club** | **Municipality club** | **Camp** | **Event** |
|---|---|---|---|---|
| **UI verb (parent)** | Enroll | Register | Sign up | Join |
| **Who pays us** | Parent, ongoing | Municipality, off-platform | Parent, upfront | Parent (upfront) or free |
| **Pricing shape** | Session bundle (1/4/10) or family sub (monthly/quarterly) | External contract | Single upfront payment | Single upfront payment, or free |
| **Schedule** | Recurring, no end | Recurring, term-bounded | Recurring, camp-bounded | One-off |
| **Days per week** | Typically 1 | Typically 1 | Often 2–5 | 1 date |
| **Capacity** | Seat-capped | Seat-capped | Seat-capped | Seat-capped or uncapped |
| **Waitlist** | Yes | Yes | Yes | Optional |
| **Gated access** | No (v1) | No (v1 — simplification) | No | No |
| **Refunds** | 24h session-window on credit deduction | None (municipality-paid) | Cutoff before start; admin after | Cutoff before start |
| **Registration opens at** | Never (always open) | **Required** — "ticket drop" moment | Optional | Optional |
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

The database uses **one** generic noun for the participation record: **`participations_v2`**. A participation is a gamer's seat (or waitlist spot) on a product, regardless of product type. UI verbs are a presentation concern.

### Versioned names during the parallel phase

All new tables, RPCs, enums, service classes, constants, query keys, and API routes introduced by this redesign carry a `_v2` suffix until cutover (§9). This is a deliberate convention to keep the old and new systems visually distinct in code, not a hint that a v3 is planned. At cutover the suffixes are stripped mechanically and the final schema has no versioning noise.

---

## 4. Key design decisions

### 4.1 Gedu Groups: admin-only cohort layer, used by every product type

The `product_groups_v2` layer is **kept** and generalized. Every product type uses groups.

**The model:**

- A product has **0 or more Gedu Groups**. Admins create groups when and how they want. An admin can create groups up-front during product creation, but the typical flow is: create the product → wait for seats to sell → decide the right number of groups based on actual demand → create them then.
- Each group has a **name**, **0 or more assigned Gedus**, and **0 or more participations** (gamers who've been placed into it).
- **Parents never see groups.** They see the product.
- **Groups have no seat cap.** Capacity lives on the product. Admins balance participants across groups manually.
- A group with zero Gedus is valid; a group with zero participations is valid.

**Gedus attach to groups, not products.** A Gedu is assigned to **at most one group per product** (enforced at the schema level — see §5.4). A Gedu can still be on multiple *different* products simultaneously.

**Admins manually avoid scheduling conflicts across products** — a Gedu shouldn't be on two groups whose computed sessions overlap in time. For v1 this is a human-enforced discipline; the system does not validate it. See §11 for the planned conflict-prevention constraint.

**Cross-group voice mobility (online products).** All Gedus assigned to any group within the same product can join any sibling group's voice room. Gamers cannot hop — a gamer can only see and join their own group's voice room.

**Unassigned participations queue.** When a parent buys a seat, the participation lands with `group_id = NULL` — an "unassigned" inbox that admins work through, placing each gamer into a suitable group.

**Parallel cohorts.** Cohorts that differ only in Gedu / voice room are multiple groups within one product. Cohorts that differ in schedule (different weekday / start time) are separate products.

### 4.2 Dynamic session computation

Session dates are **not** stored. They are computed on read from:

- `products_v2.start_date`, `products_v2.end_date` (nullable = ongoing)
- `schedule_slots_v2` (one row per weekday, with its own `start_time` and `duration_minutes`)
- Subscribed `holiday_calendars_v2` (shared, e.g. "Finnish national holidays")
- `session_overrides_v2` (sparse — only dates that deviate)

**What we gain:** extending a camp by 2 weeks is `UPDATE products_v2 SET end_date = ...`; new session dates appear everywhere instantly. Adding a holiday to a shared calendar updates every subscribed product at once. No "regenerate" failure modes.

**What we give up:** no `sessions.id` — every session is keyed by `(product_id, session_date)`. Attendance, notes, and overrides use this composite.

**Edge case noted:** the composite key precludes two sessions on the same date for the same product. Adding a `slot_index` column would be a small migration if ever needed.

### 4.3 Timezones

- `products_v2.timezone` — IANA zone, e.g., `Europe/Helsinki`. The product's home timezone.
- `session_date` — DATE interpreted in the product's timezone.
- `schedule_slots_v2.start_time` — TIME in the product's timezone. Clock time is stable across DST; UTC offset shifts automatically.
- All `*_at` columns — `timestamptz`, stored as UTC, rendered in viewer's tz.
- `holiday_calendars_v2` have a `timezone`; subscribed products should share it.

Rendering converts `(session_date, start_time, product.timezone)` into an absolute moment, then displays it in the viewer's locale with an explicit "Helsinki time / your time" label when they differ.

### 4.4 Topic + tags (no more `game`)

`game_id` on products is replaced by:

- **`topic_id`** — one per product. Examples: Minecraft, Fortnite, Pokémon GO, Online Security, Game Design. Admin-managed.
- **`product_tags_v2`** — many per product. Controlled vocabulary. Examples: `neurodiversity-friendly`, `competitive`, `chill`, `beginner`, `advanced`.

The `games` concept is retired. A "game" is just a topic that happens to be a game.

**Topic kind — games vs subjects.** Topics carry a `kind` classification (`game` | `subject`). Kind drives UI grouping wherever topics are listed — topic pickers separate "Games" from "Subjects" in two optgroups. Kind is **not** a branch in business logic.

**Inline creation during product create.** Both topics and tags can be created inline from the admin create-product form; committed immediately, available to other admins. Slugs auto-derived, uniqueness conflicts surface as a create error.

### 4.5 Billing model — fiat currency, bundles, and family subscriptions

Sorg tokens are retired in this redesign. Products are priced in real currency (EUR, GBP, USD at v1; additional currencies later). Pricing is **manually set by admins per currency** — no exchange-rate derivation, no Stripe Adaptive Pricing, no auto-conversion. The user's currency selection in the app header (existing `CurrencyProvider`) is authoritative end-to-end: UI shows that currency, Stripe Checkout charges in that currency, Stripe converts to our EUR payout at settlement.

`products_v2.billing_mode` is a required enum:

```
billing_mode ∈ {
  paid,                 -- consumer clubs, camps, paid events
  free,                 -- free events
  external_contract     -- municipality clubs (off-platform)
}
```

The prior `paid_per_session` / `paid_upfront` distinction is replaced by the *purchase shape* a parent picks at checkout, not by a schema branch on the product:

- **Consumer clubs** offer session bundles (1 / 4 / 10 sessions) **and** family subscriptions (monthly, quarterly; yearly future).
- **Camps and paid events** are single upfront purchases — one Stripe charge, one seat.
- **Free events** have no checkout step.
- **Municipality clubs** have no on-platform charge.

All paid products store two manually-entered prices per supported currency: **price per session** and **price per month** (see §5.1a). These two base inputs drive every purchase shape via hardcoded server-side constants.

**Hardcoded discount ladder (code constants):**

```
BUNDLE_DISCOUNTS = { 1: 0%, 4: 10%, 10: 20% }
SUBSCRIPTION_DISCOUNTS = { monthly: 0% (baseline), quarterly: 15%, yearly: TBD }
FAMILY_DISCOUNT_PERCENT = 10%   // flat; applied when ≥ 2 gamers on the family sub (§4.5b)
```

The server recomputes the final charge from the product's stored base price + these constants at every Checkout Session creation. The client only sends a `(product_id, bundle_size_or_frequency, gamer_id, currency)` selector — it never sends an amount. Tamper-proof by design.

`SUBSCRIPTION_DISCOUNTS` is applied to `price_per_month` when creating Stripe Prices for non-monthly frequencies (e.g., quarterly = `price_per_month × 3 × (1 − 0.15)`).

**Stripe integration shape:**

- **Session bundles (1/4/10)**: inline Checkout Session with `price_data: { currency, unit_amount }` computed server-side. No Stripe Price objects stored for bundles. `adaptive_pricing: { enabled: false }` so Stripe does not offer conversion.
- **Family subscriptions**: require real Stripe Price IDs. **Lazy-created on first subscribe**, keyed by `(product_id, frequency, currency)` and cached in `product_subscription_prices_v2` (§5.1a). One Stripe "Product" per club; one Price per (frequency, currency) for that club. Existing subscribers keep their original Price through any base-price change (Prices are immutable in Stripe).
- **Camps / paid events**: inline `price_data` Checkout Session, same shape as bundles but one-shot for one seat.
- **Currency stickiness on subs**: once a family subscribes in GBP, that Stripe subscription is GBP forever. Frequency switches (`switch_subscription_frequency`) resolve the target Price in the subscription's existing currency — same pattern as today's token sub-switch route (`src/app/api/checkout/subscription/switch/route.ts`). No parent-facing warning; handled silently in code.

**Refund windows:**

| Purchase shape | Rule |
|---|---|
| Session from a bundle | Cancel ≥ 24h before the session → 1 credit is not deducted. Cancel < 24h or no-show → 1 credit deducted. No money movement on bundle-session cancellation; it's a balance adjustment only. |
| Session covered by a subscription | Same 24h rule — cancel in time, no deduction against the sub's next period. No partial-period subscription refunds. |
| Camp / paid event | Configurable per-product `refund_policy_days` — days before `start_date`. Full Stripe refund inside the window, none outside. |
| Admin-initiated cancellation of a product | Full refund per §6.4 (refund unused bundle value via Stripe, refund pro-rata current-period sub charges via Stripe, full camp/event refunds via Stripe). |
| Admin-initiated removal of a gamer | Admin can force a refund outside the normal window — `reason='admin_refund'` on the `refunds_v2` row. |

The 24h window is a platform-wide constant `PARTICIPATION_CHARGE_WINDOW_HOURS` in `src/lib/constants/`, mirrored server-side in SQL for RPC use (same pattern as the existing `ENROLLMENT_CHARGE_WINDOW_HOURS` — renamed at cutover).

**Session credit deduction timing — parent-legible.** When a gamer's session starts and they were not admin-cancelled and did not cancel ≥ 24h before, their `credits_remaining` for that product decrements by 1. Deduction runs on an hourly cron (§6.3) — reusing the existing hourly Sorg-era cron, not a new one. The UI computes the *displayed* balance at read time as `credits_remaining − count(sessions_started_but_not_yet_deducted)`, so the parent-facing number updates instantly at session start even if the DB catches up within the next hour.

This is intentionally simpler than the Sorg token model, which deducted tokens at the 24h cutoff before each session — confusing UX ("where did my tokens go? I haven't had that session yet"). Under the new model the balance decrements at session start, matching the parent's mental model of "I attended, so I used one."

### 4.5a Design principle for pricing code: keep the first pass simple

Pricing, discounts, subscription shapes, and checkout flows are the most volatile parts of this domain — product will iterate on them. The code should reflect that expectation.

**Keep the first pass simple.** Handle the common cases cleanly; defer edge cases and "what-ifs" unless they block a stated requirement. Prefer Stripe's built-in behavior (proration defaults, `billing_cycle_anchor`, coupons) over custom logic that replicates Stripe's math. Prefer a single hardcoded constant over a parameterized system with multiple knobs, until the knobs are clearly required.

Correctness invariants that do **not** get relaxed by this principle: idempotency on webhooks (event_id uniqueness on every payment/refund row), race-safe seat counting via `FOR UPDATE`, refund auditability (every money movement recorded in `payments_v2` / `refunds_v2`), and no client-supplied prices (server always recomputes from stored base prices + constants).

### 4.5b Family subscriptions — one sub per family per frequency

Parents think of their School of Gaming bill as one monthly payment, not as N×M separate subs across kids and clubs. The schema and Stripe integration reflect that:

- **One Stripe subscription per (customer, frequency, currency).** A family that subscribes monthly has one `family_subscriptions_v2` row backed by one Stripe subscription. Every club + gamer combo they sign up for is a `subscription_item` on that one Stripe sub. Mixed-frequency families (monthly + quarterly) result in two Stripe subs — acceptable and rare.
- **Billing cycle alignment via `billing_cycle_anchor`.** When a family adds a second (or Nth) club to an existing monthly sub mid-cycle, Stripe prorates the remaining partial period and the new item renews on the same anchor day as the rest. One renewal date for the family. Stripe does all the math.
- **Multi-child discount — one flat tier.** When a family has ≥ 2 distinct gamers with items on the sub, a platform-wide `FAMILY_DISCOUNT_PERCENT` coupon is attached to the Stripe subscription, repricing every item uniformly. Adding the second kid applies the coupon; removing below 2 kids strips it. Intentionally one tier, not a ladder — the knob can become a ladder later by replacing the constant with a lookup.
- **Switching frequency** (monthly → quarterly) uses `proration_behavior: 'none'` — the new rate starts at next renewal. Matches the existing CLAUDE.md rule for tier switches.

Bundles are independent of this structure. A bundle purchase is a one-off Stripe Checkout that tops up a gamer's `credits_remaining` on a specific product; no family sub involvement. A parent can mix bundles (for Oliver, occasional attendance) with a family sub (for Ella, regular attendance) without friction.

### 4.6 Capacity and waitlist

- `products_v2.seat_count` — nullable. `NULL` means **uncapped / all welcome** — no capacity limit, no waitlist, no "full" state. Only valid when `billing_mode = 'free'`.
- Parent-facing surfaces render `seat_count = NULL` as **"unlimited" / "all welcome"** — never a missing number or a zero.
- When a participation is requested on a capped product and seats are full, it becomes `waitlisted` with a `waitlist_position`.
- When an active participant leaves or is removed, the lowest-position waitlisted row is atomically promoted.

All participation mutations go through `SECURITY DEFINER` RPCs that begin with `SELECT 1 FROM products_v2 WHERE id = $1 FOR UPDATE`. This **product-row lock is the signup gate** — concurrent `create_participation_v2` / `cancel_participation_v2` / waitlist-promotion calls on the same product serialize on it, so seat-count reads and waitlist arithmetic inside the transaction are race-free.

**Do not use `FOR UPDATE SKIP LOCKED` or `NOWAIT`.** Concurrent callers must wait for the lock so each sees a consistent post-commit state. At our scale (~50 signups per 15-minute window at peak), lock contention is invisible.

### 4.7 Product type as label, not switch

`products_v2.product_type` is a flat enum `{consumer_club, municipality_club, camp, event}`. It is used **for labeling and filtering only**. Business logic branches on the orthogonal fields — `billing_mode`, `schedule` shape, `seat_count`, refund policy — not on `product_type` directly.

### 4.8 Locations

Keep the existing `locations` hierarchy untouched. Put site-specific fields in **two** extension tables — one per visibility tier — not on `locations` itself. Country / region / municipality / district rows have no address, no parking, no wifi info, no gate codes, and should not carry nullable columns that never apply to them. Splitting into two tables rather than column-level permissions keeps RLS clean (Postgres RLS is row-level; gating columns by role requires awkward views or grants).

```sql
site_details_v2        -- member-visible. Parent-facing product detail page.
  location_id    uuid pk, fk → locations.id ON DELETE CASCADE
  address        text
  notes          text              -- parking, accessibility, wifi, opening hours
  -- future: parking_info, accessibility_features, opening_hours, wifi_*, allergen_info, ...
  created_at, updated_at
  -- enforced: row may exist only for locations where type = 'site'

site_staff_details_v2  -- admin + Gedu only. Never leaves staff surfaces.
  location_id    uuid pk, fk → locations.id ON DELETE CASCADE
  notes          text              -- gate codes, back-entrance directions, keys, ops notes
  created_at, updated_at
  -- enforced: row may exist only for locations where type = 'site'
```

**Reads:**
- Hierarchy queries read `locations` alone — no join.
- Parent-facing product detail joins `locations JOIN site_details_v2 USING (location_id)`.
- Admin/Gedu staff screens join both: `locations JOIN site_details_v2 USING (location_id) LEFT JOIN site_staff_details_v2 USING (location_id)`.

### 4.9 Location rules — site for in-person, jurisdiction only for online municipality clubs

A product's `location_id` has different meanings depending on delivery mode and product type:

- **In-person products** (`is_remote = false`) — `location_id` is required and must be a `site`.
- **Online municipality clubs** (`is_remote = true, product_type = 'municipality_club'`) — `location_id` is required and must be a country, region, or municipality (not a site).
- **Online consumer clubs, camps, and events** — `location_id` is NULL.

The motivating parent experience is unchanged for the municipality case: *"I live in Helsinki. My municipality offered a club. It happens to be online — still my municipality's club."*

**Residency rule (intent, not v1 enforcement).** Municipality clubs are only for kids who live in the owning municipality. v1 does **not** enforce residency at signup; the honour-system copy is the only check. Do not use `product_type = 'municipality_club'` elsewhere as a proxy for "free to all."

| Product type | In-person `location_id` | Online `location_id` |
|---|---|---|
| Consumer club | Site (required) | **NULL** |
| Municipality club | Site within the owning municipality (required) | The municipality that paid for it (required) |
| Camp | Site (required) | **NULL** |
| Event | Site (required) | **NULL** |

**Browse filtering:** `/registration` location pages list only `product_type = 'municipality_club'`. Consumer browse (`/browse`) excludes municipality clubs entirely.

**Admin UX:** the location picker is only rendered when the current (`is_remote`, `product_type`) combination requires it; picker auto-clears a stale selection when the applicable mode changes. Both visible modes let the admin create new locations inline.

### 4.10 Voice rooms are online-only, and live at the group level

A voice room (Daily.co) exists iff `products_v2.is_remote = true`. In-person products have no voice room.

**For online products, rooms are per-group.** Each `product_groups_v2` row in an online product gets its own Daily.co room.

**Permissions follow the group → product topology:**

- **Gamers** can see and join only the voice room of the group they're assigned to.
- **Gedus** can see and join any voice room on any group within a product, as long as they're assigned to at least one group in that product (emergency coverage).
- A **substitute Gedu** (set via `session_substitutions_v2`) gains voice-room access on the covered (group, session_date) for the substitution date only.
- An unassigned participation has **no** voice room access.

**Effective Gedu resolution** walks `session_substitutions_v2` forward from each ongoing `gedu_group_assignments_v2` member via a recursive CTE. Unfilled substitutions produce a coverage gap the admin dashboard surfaces.

**Room provisioning** is keyed on `product_group_id`. Creation is idempotent and lazily reattempted at first join. Flipping `is_remote` true → false is disallowed once participations exist.

### 4.11 Lifecycle status and threshold-triggered start

```
products_v2.status ∈ {
  draft,      -- admin setting up; invisible to parents.
  pending,    -- published, accepting signups, not yet running.
  running,    -- started; sessions are happening.
  completed,  -- past end_date; archive state.
  cancelled   -- admin killed it. Refunds fired as appropriate.
}
```

`is_visible` stays orthogonal to status.

**Signup threshold — a single mechanism for all four product types.** `products_v2.signup_threshold` (nullable int) counts active participations only. When set, the product stays `pending` until admin manually starts it — it does not auto-start. Admins get a notification ("Tuesday Minecraft has 8 active signups — ready to start") and can:

- **Start now** once the threshold is met, or
- **Start under threshold** with a confirm dialog, or
- **Wait longer**, indefinitely.

Separately, admins can **cancel** a pending product. Cancellation refunds are handled per §6.4.

**Billing behavior during `pending`:**

- **Bundle purchases** — payment collected at checkout. If the product is later cancelled in `pending`, all unused bundle credits are refunded via Stripe for their per-session value.
- **Family subscriptions** — the first period's charge is collected at checkout. If the product is cancelled in `pending`, the item is removed from the sub and the current-period value is refunded pro-rata via Stripe.
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

All new objects carry a `_v2` suffix (§3). Suffixes are stripped mechanically at cutover.

### 5.1 Core tables

```sql
products_v2
  id                    uuid pk
  product_type          enum('consumer_club','municipality_club','camp','event')
  billing_mode          enum('paid','free','external_contract')

  name                  text
  description           text
  topic_id              uuid → topics_v2.id
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

  registration_opens_at timestamptz       -- nullable; required for municipality_club
  refund_policy_days    int               -- nullable; only for one-shot paid products (camp/event).
                                            -- Bundle/subscription sessions use the 24h window.

  is_visible            bool
  created_by            uuid → profiles.id
  created_at, updated_at

  -- CHECK constraints:
  --   billing_mode='external_contract'    → product_type='municipality_club'
  --   billing_mode='free'                 → no row in product_prices_v2 (app-enforced)
  --   billing_mode='paid'                 → ≥ 1 row in product_prices_v2 (app-enforced)
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

schedule_slots_v2
  id                    uuid pk
  product_id            uuid → products_v2.id ON DELETE CASCADE
  weekday               int              -- 0=Mon..6=Sun
  start_time            time
  duration_minutes      int
  unique(product_id, weekday)

topics_v2
  id                    uuid pk
  slug                  text unique
  name                  text
  kind                  enum('game','subject')
  description           text
  icon_path             text

tags_v2
  id                    uuid pk
  slug                  text unique
  name                  text
  description           text

product_tags_v2
  product_id            uuid → products_v2.id ON DELETE CASCADE
  tag_id                uuid → tags_v2.id
  primary key (product_id, tag_id)
```

### 5.1a Pricing tables

```sql
-- Manually-entered per-currency base prices. No FX derivation.
product_prices_v2
  product_id            uuid → products_v2.id ON DELETE CASCADE
  currency              text          -- 'eur' | 'gbp' | 'usd'; enforced via CHECK against
                                        -- supported-currency list kept in sync with
                                        -- src/lib/constants/currency.ts
  price_per_session     int           -- smallest unit (cents / pence)
  price_per_month       int           -- smallest unit
  primary key (product_id, currency)
  -- A product sold in N currencies has N rows. Leaving a currency blank in the admin UI
  -- means "not sold in this currency" — parents on that currency see the product as
  -- unavailable. Adding a new currency later is application-level INSERTs, not a migration.

-- Stripe Price IDs for subscriptions. Lazy-populated.
product_subscription_prices_v2
  product_id            uuid → products_v2.id ON DELETE CASCADE
  frequency             enum('monthly','quarterly','yearly')  -- 'yearly' reserved for future
  currency              text
  stripe_price_id       text                    -- populated on first subscribe
  unit_amount_cents     int                     -- snapshot for display; Stripe is authoritative
  created_at            timestamptz
  primary key (product_id, frequency, currency)
  -- If price_per_month changes after Prices are created, existing subscribers keep the
  -- old Price (Stripe Prices are immutable). A future admin action can recreate Prices;
  -- existing subs retain their original rate until they cancel and re-subscribe.
```

### 5.2 Holiday calendars

```sql
holiday_calendars_v2
  id                    uuid pk
  name                  text
  timezone              text
  created_at, updated_at

calendar_holidays_v2
  id                    uuid pk
  calendar_id           uuid → holiday_calendars_v2.id ON DELETE CASCADE
  date                  date
  reason                text
  unique(calendar_id, date)

product_holiday_calendars_v2
  product_id            uuid → products_v2.id ON DELETE CASCADE
  calendar_id           uuid → holiday_calendars_v2.id ON DELETE CASCADE
  primary key (product_id, calendar_id)
```

### 5.3 Session overrides and substitutions

```sql
session_overrides_v2
  id                        uuid pk
  product_id                uuid → products_v2.id ON DELETE CASCADE
  session_date              date
  cancelled                 bool default false
  override_start_time       time
  override_duration_minutes int
  admin_note                text
  created_by                uuid → profiles.id
  created_at, updated_at
  unique(product_id, session_date)

session_substitutions_v2
  id                    uuid pk
  group_id              uuid → product_groups_v2.id ON DELETE CASCADE
  session_date          date
  original_gedu_id      uuid → profiles.id
  substitute_gedu_id    uuid → profiles.id    -- NULL until filled
  reason                text
  requested_by          uuid → profiles.id
  requested_at          timestamptz
  filled_by             uuid → profiles.id
  filled_at             timestamptz
  unique(group_id, session_date, original_gedu_id)
  -- trigger: reject if product_has_session_v2(group.product_id, session_date) is false
  -- trigger: original_gedu_id must be on gedu_group_assignments_v2 for group_id
```

A session exists on a date iff: schedule rules include it, no linked holiday calendar contains it, AND no `session_overrides_v2` row sets `cancelled=true`. Helper: `product_has_session_v2(product_id, date) → bool`.

Chained substitutions are supported (Adam→Bob, then Bob→Carla on the same (group, date) are two rows). The voice-chat permission check walks the chain via a recursive CTE.

### 5.4 Groups and Gedu assignment

```sql
product_groups_v2
  id                    uuid pk
  product_id            uuid → products_v2.id ON DELETE CASCADE
  name                  text                  -- required; e.g. "Group A" or "Adam's group"
  daily_room_name       text                  -- NULL for in-person products
  created_at, updated_at
  unique(product_id, name)

gedu_group_assignments_v2
  group_id              uuid → product_groups_v2.id ON DELETE CASCADE
  gedu_id               uuid → profiles.id
  product_id            uuid → products_v2.id            -- denormalized
  assigned_at           timestamptz
  primary key (group_id, gedu_id)
  unique (gedu_id, product_id)                           -- one group per Gedu per product
  -- BEFORE INSERT/UPDATE trigger: validate denormalized product_id matches group_id's product
```

Gedus attach to groups, not products. A Gedu is on at most one group per product (unique constraint). Substitute coverage for a specific date is not an assignment — it's a `session_substitutions_v2` row.

**Changes from today's schema:** the current `product_groups.gedu_id` column is dropped; assignment goes through `gedu_group_assignments_v2`. Groups gain a required `name`.

### 5.5 Participations

```sql
participations_v2
  id                    uuid pk
  product_id            uuid → products_v2.id
  group_id              uuid → product_groups_v2.id        -- nullable = unassigned inbox
  gamer_id              uuid → profiles.id
  customer_id           uuid → profiles.id                 -- parent who signed up the gamer
  status                enum('active','waitlisted','completed')
  waitlist_position     int                                -- populated iff status='waitlisted'
  credits_remaining     int                                -- nullable:
                                                            --   NULL  = subscription-covered OR
                                                            --           single-payment (camp/event) OR
                                                            --           free / external_contract
                                                            --   int>=0 = bundle-covered; decremented
                                                            --           by hourly cron (§6.3)
  signed_up_at          timestamptz
  unique(product_id, gamer_id)
  -- CHECK: group_id's product_id (if set) matches row's product_id
  -- CHECK: credits_remaining >= 0 when NOT NULL
```

**Hard-delete on cancellation** — same as prior draft. Cancellation (customer- or admin-initiated) hard-deletes the row via `cancel_participation_v2` / `admin_remove_participation_v2`. No soft-delete column; cancelled rows are physically gone so `UNIQUE(product_id, gamer_id)` works on re-signup.

`group_id IS NULL` is the unassigned inbox state. Deleting a group resets its participations to `group_id = NULL`.

**Subscription-covered vs bundle-covered**, determined at signup:
- If the parent purchases a bundle → `credits_remaining` is set to the bundle size.
- If the parent adds this product to a family sub → `credits_remaining = NULL`; access is driven by the existence of a `family_subscription_items_v2` row pointing to this participation.

Changing mode (e.g. convert a bundle remainder into a sub, or vice versa) is not supported in v1 — parents cancel and re-sign up. Revisit if it becomes a real request.

### 5.6 Session-level records

```sql
session_attendance_v2
  id                    uuid pk
  product_id            uuid → products_v2.id
  session_date          date
  gamer_id              uuid → profiles.id
  status                enum('present','absent','excused','late')
  recorded_by           uuid → profiles.id
  recorded_at           timestamptz
  unique(product_id, session_date, gamer_id)
  -- trigger: reject INSERT/UPDATE when product_has_session_v2 is false

session_notes_v2
  id                    uuid pk
  product_id            uuid → products_v2.id
  session_date          date
  author_id             uuid → profiles.id
  content               text
  visibility            enum('gedu_only','admin','participants')
  created_at, updated_at
  -- trigger: same validity check
```

### 5.7 Payments and refunds

The Sorg-era `enrollment_charges` table is replaced by two thin tables that track Stripe money movements. Stripe is the source of truth; these tables are our local audit trail + idempotency gate + reporting index.

```sql
payments_v2
  id                         uuid pk
  customer_id                uuid → profiles.id
  amount_cents               int              -- positive; what parent paid
  currency                   text
  purpose                    enum('bundle','subscription_invoice','single_payment')
  stripe_payment_intent_id   text             -- for bundles and single_payment
  stripe_invoice_id          text             -- for subscription_invoice
  stripe_event_id            text unique      -- idempotency on the webhook that created this row
  metadata                   jsonb            -- {gamer_id, product_id, bundle_size, frequency, ...}
  created_at                 timestamptz

refunds_v2
  id                         uuid pk
  payment_id                 uuid → payments_v2.id
  amount_cents               int              -- positive
  reason                     enum(
                               'session_cancelled_in_window',
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

- `payments_v2` rows are written by Stripe webhook handlers — `checkout.session.completed` (one-off bundles and single-payment camps/events) and `invoice.paid` (subscription cycles). UNIQUE `stripe_event_id` is the idempotency gate.
- `refunds_v2` rows are written by `charge.refunded` / `charge.refund.updated` webhooks, or by our own RPCs that trigger a Stripe refund synchronously (admin override path). Same idempotency gate.
- Nothing is written by the client. Checkout Sessions are created with `metadata` carrying the (gamer_id, product_id, bundle_size, frequency, currency) selector; the webhook reads metadata to construct the `payments_v2` row.

**What credits_remaining depends on:**

- Bundle purchase → webhook writes `payments_v2` row AND increments `participations_v2.credits_remaining` (creates participation if not already present).
- Bundle refund (admin-initiated under a force-refund) → writes `refunds_v2` row AND decrements remaining credits appropriately.
- Subscription invoice → writes `payments_v2` row; no `credits_remaining` motion (sub-covered participations have `credits_remaining = NULL`).

### 5.7a Family subscriptions

```sql
family_subscriptions_v2
  id                         uuid pk
  customer_id                uuid → profiles.id
  stripe_subscription_id     text unique
  stripe_customer_id         text
  frequency                  enum('monthly','quarterly','yearly')
  currency                   text                  -- locked at sub creation (Stripe invariant)
  status                     enum('active','past_due','cancelled','incomplete')
  current_period_end         timestamptz
  discount_coupon_id         text                  -- Stripe coupon currently applied; nullable
  created_at, updated_at
  unique(customer_id, frequency, currency)

family_subscription_items_v2
  id                              uuid pk
  family_subscription_id          uuid → family_subscriptions_v2.id ON DELETE CASCADE
  participation_id                uuid → participations_v2.id ON DELETE CASCADE
  stripe_subscription_item_id     text unique
  stripe_price_id                 text             -- the Price this item references at creation
  created_at                      timestamptz
  unique(family_subscription_id, participation_id)
```

**Shape:**

- At most one `family_subscriptions_v2` row per (customer, frequency, currency). A family that mixes monthly + quarterly has two rows.
- Each item is a (gamer, product) pair represented by a `participations_v2` row (with `credits_remaining = NULL`) and a Stripe subscription item.
- The family's total monthly (or quarterly, or yearly) bill is Stripe-computed from the items' Prices minus the `discount_coupon_id`'s value if attached.
- `family_subscriptions_v2.status`, `current_period_end`, and `discount_coupon_id` are maintained by webhooks (`customer.subscription.updated`, `customer.subscription.deleted`), not by the app directly. The app's RPCs call Stripe; Stripe fires webhooks; webhooks update our DB.

### 5.8 Row Level Security

Every new table has RLS enabled. Policy shape follows the existing codebase:

- **Admin = full access.** `get_user_role() = 'admin'` USING/WITH CHECK on every table.
- **Writes are RPC-gated.** Tables mutated by `SECURITY DEFINER` RPCs (participations, payments, refunds, family subs and items, credits, group/assignment mutations via `commit_group_changes_v2`, substitutions) grant no INSERT/UPDATE/DELETE to `authenticated`.
- **`auth.uid()` and `get_user_role()` always wrapped in `(select ...)`** for the initplan optimization used throughout existing migrations.

Baseline SELECT policies per role:

| Table | anon | customer | gamer | gedu |
|---|---|---|---|---|
| `products_v2` | `status IN ('pending','running') AND is_visible` | public ∪ own-participations | public ∪ own-participations | any product where Gedu has a `gedu_group_assignments_v2` row |
| `schedule_slots_v2`, `session_overrides_v2` | — | follows products | follows products | follows products |
| `product_prices_v2` | all (public catalog) | all | all | all |
| `product_subscription_prices_v2` | ✗ | own customer's path only | ✗ | ✗ |
| `site_details_v2` | public (member-visible info — address, parking, wifi) | — | — | — |
| `site_staff_details_v2` | ✗ | ✗ | ✗ | Gedus assigned to a product at this site *(fine-grained gating lands with `gedu_group_assignments_v2`; placeholder is any Gedu)* |
| `topics_v2`, `tags_v2`, `product_tags_v2` | all | — | — | — |
| `holiday_calendars_v2`, `calendar_holidays_v2`, `product_holiday_calendars_v2` | all | — | — | — |
| `product_groups_v2` | ✗ | ✗ (parents never see groups) | own group only | any group on products Gedu is on |
| `gedu_group_assignments_v2` | ✗ | assignments on products where own gamer participates | own group only | own + colleagues on assigned products |
| `participations_v2` | ✗ | `customer_id = auth.uid()` | `gamer_id = auth.uid()` | participations on assigned products |
| `session_substitutions_v2` | ✗ | via products of own gamers | via own group | on assigned products |
| `session_attendance_v2` | ✗ | for own gamers | own rows | on assigned products |
| `session_notes_v2` | ✗ | `visibility='participants'` on own gamers' products | same | `gedu_only` + `participants` on assigned products |
| `payments_v2` | ✗ | `customer_id = auth.uid()` | ✗ | ✗ |
| `refunds_v2` | ✗ | via own payments | ✗ | ✗ |
| `family_subscriptions_v2` | ✗ | `customer_id = auth.uid()` | ✗ | ✗ |
| `family_subscription_items_v2` | ✗ | via own family_subscriptions_v2 | ✗ | ✗ |

**Non-obvious rules:**

- **Parents never see `product_groups_v2`, `session_substitutions_v2`, or the per-group Gedu roster.** The Gedu list on a product's parent-facing page is derived via `DISTINCT gedu_id` across the product's groups.
- **Gedus read products regardless of `is_visible` / `status`.** A Gedu assigned to a draft or cancelled product still needs to see it.
- **Gamers have no payment visibility.** Customers see their own payments/refunds/subscriptions via `customer_id = auth.uid()`.
- **`product_subscription_prices_v2` is not a public catalog.** The Stripe Price IDs it holds are implementation detail; parents only ever see the computed display price from `product_prices_v2` + hardcoded constants.

An access-control test (mirroring `tests/db/access-control.test.ts`) must assert for every new table: RLS enabled, no non-allowlisted function callable by anon/authenticated, policies behave as described.

---

## 6. RPCs

All `SECURITY DEFINER`, private by default, row-locking where financial.

### 6.1 Participation lifecycle

All three RPCs begin with `SELECT 1 FROM products_v2 WHERE id = $1 FOR UPDATE` (the gate lock — §4.6).

- **`create_participation_v2(product_id, gamer_id, customer_id, purchase_shape, currency)`**
  After the gate lock: validates age/language match, checks `registration_opens_at`, verifies status permits signup, counts current `active` participations to decide `active` vs `waitlisted`. Behavior by `purchase_shape`:
  - `bundle_1` / `bundle_4` / `bundle_10` — creates a Stripe Checkout Session with inline `price_data` for `bundle_size × price_per_session × (1 − bundle_discount) × currency`. Returns the Checkout URL. On successful payment, the `checkout.session.completed` webhook creates the participation with `credits_remaining = bundle_size` and writes the `payments_v2` row.
  - `subscription_monthly` / `subscription_quarterly` — resolves or creates the Stripe Price for `(product_id, frequency, currency)`. Finds or creates a `family_subscriptions_v2` row for `(customer_id, frequency, currency)`. Adds a subscription item aligned to the existing `billing_cycle_anchor`. Creates the participation with `credits_remaining = NULL`. Re-evaluates the family coupon. The initial prorated charge is collected by Stripe.
  - `single_payment` (camp / paid event) — inline Checkout Session; webhook creates participation on completion.
  - `free` — creates participation directly; no Stripe.

- **`cancel_participation_v2(participation_id)`**
  Customer-initiated. After the gate lock: hard-DELETEs the participation, then promotes the lowest-position waitlisted row to `active`. Refund logic by what covered the seat:

  | Coverage | Rule |
  |---|---|
  | Bundle (`credits_remaining > 0`) | Unused credits expire with the participation. No money is refunded — parents prepaid the bundle and the per-session price is forfeit once bundled. (Rationale: bundles are discounted; refunding per-session at full rate would gamify cancellation. If this is too harsh, revisit — it's a policy knob, not a schema gate.) |
  | Subscription item | Remove the item from Stripe. No refund on the current period; the family keeps paid-through access until the period end per Stripe's default. If this was the last item on the sub, cancel the sub at period end. Re-evaluate the family coupon. |
  | Single payment (camp / event) | Full Stripe refund if `now < start_date − refund_policy_days` (in product tz). Otherwise no refund. Write `refunds_v2` row. |
  | Free / external_contract | No money movement. |

- **`admin_remove_participation_v2(participation_id, reason)`**
  Admin-initiated. Same as `cancel_participation_v2` including hard-DELETE and waitlist promotion, with the ability to force a Stripe refund outside the normal window — `reason='admin_refund'` on the `refunds_v2` row. For bundle-covered seats, admin can optionally issue a goodwill refund for unused credits; configurable per-cancellation.

- **`promote_from_waitlist_v2(product_id)`**
  Internal helper, called inside cancellation RPCs. Assumes gate lock is held.

### 6.1a Group mutations

Keep the existing `commit_group_changes` pattern (see `docs/groups-architecture.md`) as the sole write path for `product_groups_v2`, `gedu_group_assignments_v2`, and `participations_v2.group_id`. Versioned as `commit_group_changes_v2` during the parallel phase. Extended for the unassigned inbox column — additive.

### 6.2 Session-level operations

- **`cancel_session_v2(product_id, session_date, reason)`** — upserts `session_overrides_v2` with `cancelled=true`.
- **`reschedule_session_v2(product_id, session_date, new_start_time, new_duration_minutes)`** — upserts.
- **`request_substitute_v2(group_id, session_date, original_gedu_id, reason)`** — inserts with `substitute_gedu_id = NULL`. Callable by admin or the original Gedu. Supports chained requests.
- **`assign_substitute_v2(substitution_id, substitute_gedu_id)`** — admin fills an unfilled row. A combined `set_substitute_v2(group_id, session_date, original_gedu_id, substitute_gedu_id)` is a one-step admin convenience.
- **`record_attendance_v2(product_id, session_date, gamer_id, status)`** — validates against `product_has_session_v2`.

### 6.3 Session credit deduction cron

**`process_session_credits_v2()` — runs hourly.** This **reuses the existing hourly Sorg-era cron slot**; it does not introduce a new schedule. Per §4.5 the UI computes displayed balance at read time, so DB lag is invisible.

Logic per run:
1. Find all `participations_v2` with `status='active'` and `credits_remaining IS NOT NULL` on products whose `billing_mode='paid'` and `product_type='consumer_club'`.
2. For each, find sessions in `[now − 1h − small buffer, now − small buffer]` where `product_has_session_v2` is true (not admin-cancelled), the gamer did not cancel ≥ 24h before (via an attendance-intent check — see below), and no deduction row exists for `(gamer_id, product_id, session_date)`.
3. For each such session, decrement `credits_remaining` by 1 and write a deduction audit row (`credit_deductions_v2` — a thin append-only ledger keyed by `(gamer_id, product_id, session_date)` with UNIQUE).

Idempotent: the UNIQUE constraint prevents double-deduction on re-run.

**"Did they cancel in time?"** — Customer-initiated cancellation of a single session (not of the whole participation) writes a row to `session_cancellations_v2(gamer_id, product_id, session_date, cancelled_at)` with UNIQUE per triple. The cron checks: if `cancelled_at <= session_start − PARTICIPATION_CHARGE_WINDOW_HOURS`, skip the deduction. Otherwise deduct.

Subscription-covered participations (`credits_remaining IS NULL`) are skipped entirely by this cron — Stripe handles their billing on its subscription cycle.

### 6.4 Lifecycle transitions

- **`start_product_v2(product_id, start_date)`** — admin-initiated. Requires `status='pending'`. Transitions to `running`. Does not check `signup_threshold` (admin is explicitly overriding).
- **`cancel_product_v2(product_id, reason)`** — admin-initiated from `draft`, `pending`, or `running`. Transitions to `cancelled`. Cascade:
  - **Bundle participations** with `credits_remaining > 0`: issue a Stripe refund for `credits_remaining × price_per_session` against the original `payments_v2` row (per-currency). Hard-delete participations.
  - **Subscription items** on any `family_subscriptions_v2` pointing to this product: remove via Stripe API. Stripe auto-refunds pro-rata for the remaining current period (`refunds_v2` written by webhook). If an affected family sub has zero items left, cancel the sub at period end.
  - **Single-payment participations** (camps, paid events): full Stripe refund.
  - **Free / external_contract**: no money movement.
  Waitlisted rows hard-delete with no money movement.

- **`finalize_completed_products_v2()`** — daily job. Transitions `running → completed` for products whose `end_date` has passed.

### 6.5 Retired

At cutover, the following are removed:
- `enroll_gamer_in_group` — folded into `create_participation_v2`.
- `unenroll_gamer` — folded into `cancel_participation_v2`.
- `process_enrollment_charges` — replaced by `process_session_credits_v2`.
- `adjust_token_balance` — retired with the Sorg token system.
- `enrollment_charges` table — replaced by `payments_v2` + `refunds_v2`.
- `token_charges` table (if any lingers) — same.

`commit_group_changes_v2` replaces the existing `commit_group_changes`; groups are retained for all product types.

### 6.6 Family subscription management

- **`subscribe_to_product_v2(product_id, gamer_id, frequency, currency)`** — customer-initiated (actually called via a Checkout flow; see §6.1 `create_participation_v2` with `purchase_shape=subscription_*`). Ensures `product_subscription_prices_v2` has a Stripe Price for `(product_id, frequency, currency)`, lazy-creating on Stripe if missing. Finds or creates a `family_subscriptions_v2` row for `(customer_id, frequency, currency)`. If it exists, adds an item via `stripe.subscriptions.update` aligned to the existing `billing_cycle_anchor`. If not, creates a new Stripe subscription anchored to today. Updates / attaches the family coupon based on the new gamer count.
- **`unsubscribe_from_product_v2(participation_id)`** — removes the Stripe subscription item. Hard-deletes the participation. If the sub now has zero items, schedules the sub to cancel at period end on Stripe. Re-evaluates the family coupon.
- **`switch_subscription_frequency_v2(customer_id, from_frequency, to_frequency)`** — uses `stripe.subscriptions.update` with `proration_behavior: 'none'`. New frequency effective at next renewal. Applies only to the sub matching `from_frequency`. Mirrors the existing Sorg tier-switch route.

Webhooks (`invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`) update `family_subscriptions_v2.status`, `current_period_end`, and `discount_coupon_id` from Stripe's state. Webhook-driven, not client-driven. All webhook handlers use `stripe_event_id` uniqueness on `payments_v2` / `refunds_v2` as the idempotency gate.

---

## 7. Parent browse UX

UI design and copy are out of scope for this redesign doc (§ "How to use this document"). Business rules that touch discovery flows are captured here so they're not lost; the actual screens land under separate, explicitly-approved design passes.

### 7.1 Two parallel entry points, never cross-linked

- **Consumer browse** — *"I'm shopping for my kid"* catalog. Covers consumer clubs, camps, and events. Canonical product URL: `/browse/[slug]`.
- **Municipality-club registration** — *"my city offers this for free"* catalog. Covers only municipality clubs. Canonical product URL: `/registration/club/[slug]`.

**Why separate.** A parent on consumer browse is picking a product and paying for it; a parent on registration is claiming a subsidised seat their municipality funded and for which their child must be resident (§7.4). Merging forces every parent to confront an irrelevant half of the catalog.

**Rule: no cross-links between the two paths.**

**Canonical URLs enforced via one helper.** A `productDetailPath(product)` helper maps a product to its canonical URL based on `product_type`. Every link in the app — cards, search results, emails, WhatsApp deep-links — goes through it.

### 7.2 Parents see products, not groups

A product with 3 groups × 25 seats shows as one product with 75 seats. Parents pick the product; admins place gamers into groups.

### 7.3 Per-product-type landing pages

`/clubs`, `/camps`, `/events` are consumer browse with the `product_type` filter pre-applied. **Municipality clubs do not get a consumer-browse landing page** — their entry is `/registration`.

**Rule: any parent-facing discovery surface that doesn't collect a location cannot surface municipality clubs.**

### 7.4 Location-first discovery — municipality-club entry

`/registration` is the muni-club-only entry. Matches against the full `locations` tree by name.

**Default browse order**: municipality rows first. **Search sort**: municipality > site > region.

**Location page** (`/registration/[locationSlug]`) lists only muni clubs at-or-under the anchor. Consumer products anchored under the same location do *not* show here.

**Residency is intent, not v1 enforcement.** v1 relies on honour-system copy.

### 7.5 Registration timing and ticket-drop UX

For products with `registration_opens_at` set (required for muni clubs, optional for camps/events), the detail page has three states: **pre-open** (disabled form with live countdown), **open** (form enabled), **closed/waitlist**.

**Layout stability across state transitions** — elements must not shift position when the countdown collapses to "Open now."

**One shared countdown component** — same clock math everywhere a ticket-drop appears.

### 7.6 Parent-visible product detail

Seat state ("8 of 10 seats · 3 on waitlist"), schedule with skipped dates surfaced, venue detail from `site_details_v2.access_notes`, threshold status when set, post-signup confirmation with waitlist position and the padlet URL.

**Pricing display — driven by stored base prices + hardcoded constants.** For paid products, the detail page shows:

- **Bundle options** — computed from `product_prices_v2.price_per_session` and `BUNDLE_DISCOUNTS`. E.g., "1 session: €20 · 4 sessions: €72 (save 10%) · 10 sessions: €160 (save 20%)".
- **Subscription options** — computed from `product_prices_v2.price_per_month` and `SUBSCRIPTION_DISCOUNTS`. E.g., "Monthly: €45/mo · Quarterly: €115 every 3 months (save 15%)".
- All amounts in the user's selected currency (resolved via the existing `CurrencyProvider`). If the product has no row in `product_prices_v2` for the selected currency, the product shows as unavailable to that parent.

---

## 8. Admin UX

- Single **"Create product"** form with a product type selector that reveals/hides fields by type. Lets admins pre-create 0 or more Gedu Groups each with 0 or more Gedus (§4.1).
- **Per-currency pricing inputs**. For `billing_mode='paid'` products, the form has `price_per_session` and `price_per_month` fields per supported currency (EUR / GBP / USD today). Leaving a currency blank means "not sold in this currency." Inline preview panel shows the derived bundle/subscription prices computed server-side from these base values and the hardcoded constants, so admins see exactly what parents will see. Server recomputes on save — no client-submitted derived prices.
- **Product management page** per product has a **Groups panel** with an Unassigned column (inbox) and one column per group. Drag-and-drop for moves. Add/rename/delete group controls. Add/remove Gedu controls per group.
- **Gedu picker** supports search by name/email/bio and filter by `profiles.spoken_languages`.
- **Calendar view** per product shows computed sessions with overrides applied; admins cancel/reschedule/substitute directly from it.
- **Holiday calendar management** is a separate admin screen; products subscribe via multi-select.
- **Lifecycle actions** on each pending product: "Start product" (with confirm dialog if under threshold) and "Cancel product" (fires refunds per §6.4). Admin home highlights threshold-hit notifications.
- **Payment reporting** — admin dashboard shows `payments_v2` / `refunds_v2` aggregated per product and per period for reconciliation.

---

## 9. Migration — parallel `_v2` phase, human-triggered cutover

Unlike the earlier drafts that assumed a greenfield wipe-and-recreate, this redesign runs in parallel with the existing token-era schema. The existing Sorg token system stays fully functional; a human-triggered cutover drops the old tables and strips `_v2` suffixes in one mechanical migration.

### 9.1 Parallel-phase naming

Every new object carries a `_v2` suffix (tables, RPCs, enums, types, service classes, query-key factories, constants, API routes):

- Tables: `products_v2`, `product_prices_v2`, `product_subscription_prices_v2`, `participations_v2`, `payments_v2`, `refunds_v2`, `family_subscriptions_v2`, `family_subscription_items_v2`, `product_groups_v2`, `gedu_group_assignments_v2`, `schedule_slots_v2`, `session_overrides_v2`, `session_substitutions_v2`, `session_attendance_v2`, `session_notes_v2`, `session_cancellations_v2`, `credit_deductions_v2`, `holiday_calendars_v2`, `calendar_holidays_v2`, `product_holiday_calendars_v2`, `topics_v2`, `tags_v2`, `product_tags_v2`, `site_details_v2`.
- RPCs: `create_participation_v2`, `cancel_participation_v2`, `admin_remove_participation_v2`, `promote_from_waitlist_v2`, `commit_group_changes_v2`, `cancel_session_v2`, `reschedule_session_v2`, `request_substitute_v2`, `assign_substitute_v2`, `set_substitute_v2`, `record_attendance_v2`, `process_session_credits_v2`, `start_product_v2`, `cancel_product_v2`, `finalize_completed_products_v2`, `subscribe_to_product_v2`, `unsubscribe_from_product_v2`, `switch_subscription_frequency_v2`, `product_has_session_v2`.
- Enums: `product_type_v2`, `billing_mode_v2`, `product_status_v2`, `participation_status_v2`, `subscription_frequency_v2`, `payment_purpose_v2`, `refund_reason_v2`, `session_note_visibility_v2`, `session_attendance_status_v2`, `topic_kind_v2`.
- Code: `services/products-v2/*`, `services/participations-v2/*`, `services/family-subscriptions-v2/*`, `productsV2Keys`, `ParticipationsV2Service`, etc.
- Routes: admin management at `/admin/products-v2/*`; Checkout endpoints at `/api/checkout/v2/*`; webhook at `/api/webhooks/stripe/v2` (or a single webhook that dispatches by `metadata.version`). Parent-facing routes (`/browse`, `/registration`) are gated by UX rollout decisions — see §9.3.

### 9.2 What stays running during the parallel phase

- Existing Sorg token system fully functional. Active token subscriptions keep billing. `adjust_token_balance`, `enrollment_charges`, existing `products` / `product_groups` / `group_enrollments` tables unchanged.
- New `_v2` schema is a fresh start. Admins create test products, iterate on flows.
- Feature work on the token system continues as needed.

### 9.3 UI rollout during the parallel phase — not a blanket flip

The redesign doc scopes the data/payment layer and admin CRUD. Each customer-facing screen (new browse, new registration, new checkout, new customer dashboard) is a separately-approved UI pass that the operator explicitly requests. This redesign does not authorize any UI change by default.

### 9.4 Cutover (human-triggered)

When the operator decides v2 is ready:

1. Announce cutover window.
2. Apply the **drop-old migration**: drops `products`, `product_groups`, `group_enrollments`, `enrollment_charges`, `token_charges` (if any), `games` (if any), `adjust_token_balance`, all token-era RPCs, policies, grants, Sorg-specific webhook handlers, Sorg-specific frontend code, Sorg Stripe products/prices.
3. Apply the **rename migration**: renames every `*_v2` object to the canonical name (`products_v2 → products`, `participations_v2 → participations`, `create_participation_v2 → create_participation`, etc.). Mechanical.
4. Update application code to import from the renamed canonical names (strip `_v2` / `V2` / `-v2` everywhere).
5. Delete any remaining Sorg token-specific code paths.
6. Deploy.

### 9.5 Migration file shape

Do not hand-run drop/rename SQL at cutover. Every drop and every rename is a dedicated migration file committed ahead of time:

```
supabase/migrations/
  <ts>_drop_legacy_sorg_and_product_domain.sql
  <ts>_rename_v2_to_canonical.sql
```

Production and staging apply the exact same sequence deterministically.

**Dry-run against a clone of the current staging schema before committing the rename migration** — the only way to catch RLS policy ordering issues, FK cascade depth surprises, function signature mismatches, and any object the old system created that isn't on the drop list.

### 9.6 Real-customer data at cutover

If cutover happens after production launches with real customers on Sorg tokens, those customers need a scripted migration (convert remaining token balances into equivalent bundle credits or subscription items, refund orphaned amounts, etc.). Out of scope for this doc — scope it when the timing demands it.

---

## 10. Phased plan

### Phase 1 — MVP (consumer + municipality) in parallel

Prove the unified shape against the two product lines closest to real users.

- Schema: all tables from §5 with `_v2` suffixes.
- RPCs: participation lifecycle, session operations, hourly credit cron, subscription management, lifecycle transitions — all `_v2`.
- Admin UI: new create/edit product form at `/admin/products-v2/*`, per-currency pricing inputs, Groups panel, calendar view, holiday-calendar management.
- Parent UI: **do not ship by default**. Each customer-facing screen requires an explicit UX approval from the operator.
- Stripe: `_v2` Checkout endpoints, lazy-created Prices for subs, webhook handlers that write `payments_v2` / `refunds_v2`, family-coupon application.
- Existing Sorg system untouched.

### Phase 2 — camps and events

- Multi-day schedule slots with per-day timing.
- Single-payment Checkout for camps/events.
- Event type with optional uncapped seats (free only).

### Phase 3 — operational & reporting

- Attendance-driven removal policy.
- Substitute-Gedu finder.
- Municipality reporting dashboards.
- Term / season templates.
- Sibling-discount tier ladder (expand the flat `FAMILY_DISCOUNT_PERCENT` into a multi-tier lookup) if business wants it.
- First-session-free / promo codes.

### Phase 4 — on-platform municipality billing

For v1, municipality invoicing is fully offline (`external_contract`). Future: `municipality_accounts` entity, a new `billing_mode='municipality_account'`, coordinator role, on-platform invoicing.

Design now by avoiding `product_type='municipality_club'` as a switch anywhere billing decisions are made — branch on `billing_mode` instead.

### Phase 5 — gated access (if needed)

School-code gating, private beta for specific municipalities, regional locks. Deferred — customer base is small and trusted.

---

## 11. Open questions

Flagged inline as `OPEN` in the sections they affect.

- **Subscription semantics: top-up balance vs rolling access.** Does an active sub top up `credits_remaining` by N at each renewal (top-up model), or confer unlimited attendance during the active period with `credits_remaining = NULL` (rolling model, as this doc currently assumes)? `OPEN — pending CFO call`. Impact: if top-up, add a webhook-driven topup on `invoice.paid`. If rolling (current assumption), no change needed.
- **Exact value of `FAMILY_DISCOUNT_PERCENT`.** One flat tier, number not yet chosen. `OPEN — pick at v1-build time`.
- **Exact value of `SUBSCRIPTION_DISCOUNTS.yearly`.** Yearly is reserved, not v1. `OPEN — future phase`.
- **Grace window length when `credits_remaining = 0`.** Parent is notified; gamer is held out of sessions; seat held for some period before admin reclaims it. `OPEN — defer to v1-build time`.
- **Bundle-refund policy on `cancel_participation_v2`.** Current policy: unused credits expire with the participation; no Stripe refund. Alternative: pro-rata Stripe refund for unused credits. `OPEN — policy call`. Intentionally harsh in this doc because the bundle discount already reflects pre-commitment; softening later is easy.
- **Mixing bundle and subscription on the same (gamer, product).** Disallowed in v1 — parent must cancel one mode before buying another. `OPEN — revisit if parents complain`.
- **Subscription currency change UX.** Stripe subs are currency-sticky; code handles silently (same pattern as Sorg). No parent-facing warning. `OPEN — revisit if support complaints`.
- **Single-group auto-assign.** When a product has exactly one group, auto-assign new participations instead of routing through the inbox? Defer until we see inbox in real use.
- **Unassigned inbox notifications.** WhatsApp / email / in-app nudges to admins when the inbox has sat non-empty for N hours. Future phase.
- **Attendance → removal policy.** N-unexcused-absences threshold, approval flow, appeal path. Defer until attendance tracking ships.
- **DST / tz edge cases on per-session deduction.** When a camp crosses a DST boundary, does the session at 17:00 local still deduct 1 credit? Probably yes — deduction is per-session, not per-hour.
- **Event account requirement for truly free events.** v1 requires an account for all participations. Consider magic-link + gamer-only capture later if friction is too high.
- **Topic taxonomy depth.** Sub-topics (Minecraft — Survival vs Redstone) — add `topics_v2.parent_id` if needed. Not yet.
- **Calendar view as a first-class parent feature.** "Everything my kids are doing this week" across products is obvious v2 UX. Design the per-gamer session query to support it.
- **Gedu schedule-conflict prevention.** §4.1 enforces one-group-per-product via unique on `gedu_group_assignments_v2`. Cross-product time conflicts are human-enforced in v1.
- ~~**`site_details_v2.access_notes` visibility.**~~ *Resolved:* split into two tables — `site_details_v2` (member-visible: address, parking, wifi) is publicly SELECT-able; `site_staff_details_v2` (gate codes, back-entrance directions, ops notes) is admin + Gedu only. See §4.8.

---

## 12. Appendix

### 12.1 Cross-references

- Groups & `commit_group_changes` (**kept and generalized, versioned as `_v2` during parallel phase**): `docs/groups-architecture.md`
- Current consumer billing (**replaced in parallel by §5.7 + §5.7a + §6.3; the 24h `PARTICIPATION_CHARGE_WINDOW_HOURS` constant is preserved and carries forward after cutover, renamed from `ENROLLMENT_CHARGE_WINDOW_HOURS`**): `docs/customer-enrollment-architecture.md`
- Location hierarchy & site binding: `docs/locations-architecture.md`
- Voice-room wiring for online products: `docs/voice-chat-architecture.md`
- Email pipeline for notifications: `docs/email-architecture.md`
- WhatsApp notification channel: `docs/whatsapp-automated-flow.md`
- Stripe testing locally: `docs/stripe-testing.md`
- Sorg token system: `docs/sorg-token-architecture.md` — **retired at cutover** (§9.4). Kept as-is during the parallel phase for reference and for the still-running legacy code paths; removed from the doc tree at cutover.

### 12.2 Mockup lineage

Three UX mockups live on the `feature/school-clubs-mockup` branch (see top of doc).

- **Parent browse mockup** at `/browse-mockup` — consumer catalog. Consumer clubs, camps, events; muni clubs filtered out.
- **Parent registration mockup** at `/registration` — municipality-club entry. Location-first search, muni-only listings, ticket-drop countdown.
- **Admin create-product mockup** at `/admin-mockup/products/new` — admin flow for all four product types.

All three are sketches, not implementations. **None of them model the new fiat pricing, bundle purchase, or family subscription flows — they predate this redesign's billing pivot.** When the billing-layer screens are designed, the mockups are a starting point for product-type-specific flows only; pricing UX is new work.

### 12.3 Why we kept Gedu Groups (and generalized them to every product type)

An earlier version of this doc retired `product_groups` in favor of cloning whole products. Product-team feedback pushed back: groups are the right abstraction for admins organizing who-runs-what-with-whom inside a product, and they should apply to all four product types.

What kept groups:

- **Demand is often unknown up-front.** Decide on 1, 3, or 4 groups *after* 75 people bought in, not pre-committing.
- **The "Bob covers for Adam" use case works naturally** via cross-group voice mobility (§4.10).
- **Existing drag-and-drop already works.** Extending it with an inbox column is cheap.

What made generalizing safe:

- **Parents don't see groups.** Cost is admin-facing only.
- **Capacity stays product-level.** Groups don't introduce a second seat-math layer.
- **Events are forgiving.** A one-group event's UI collapses to a single column and gets out of the way.
