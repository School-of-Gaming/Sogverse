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
2. **Real-currency pricing.** Products are priced in real currency (EUR, GBP, USD today; additional currencies later) using manual per-currency admin input. Parents buy either session bundles (1 / 4 / 10 sessions) or family-level subscriptions (monthly, quarterly; yearly future). Checkout uses Stripe with the user's selected currency as the authoritative price — no Stripe Adaptive Pricing, no exchange-rate-derived amounts.

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
| **Gated access** | No | No (deliberate simplification) | No | No |
| **Refunds** | 24h session-window on credit deduction | None (municipality-paid) | Cutoff before start; admin after | Cutoff before start |
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

### 4.4 Topic + tags (no more `game`)

`game_id` on products is replaced by:

- **`topic_id`** — one per product. Examples: Minecraft, Fortnite, Pokémon GO, Online Security, Game Design. Admin-managed.
- **`product_tags`** — many per product. Controlled vocabulary. Examples: `neurodiversity-friendly`, `competitive`, `chill`, `beginner`, `advanced`.

The `games` concept is retired. A "game" is just a topic that happens to be a game.

**Topic kind — games vs subjects.** Topics carry a `kind` classification (`game` | `subject`). Kind drives UI grouping wherever topics are listed — topic pickers separate "Games" from "Subjects" in two optgroups. Kind is **not** a branch in business logic.

**Inline creation during product create.** Both topics and tags can be created inline from the admin create-product form; committed immediately, available to other admins. Slugs auto-derived, uniqueness conflicts surface as a create error.

### 4.5 Billing model — fiat currency, bundles, and family subscriptions

Products are priced in real currency (EUR, GBP, USD today; additional currencies later). Pricing is **manually set by admins per currency** — no exchange-rate derivation, no Stripe Adaptive Pricing, no auto-conversion. The user's currency selection in the app header (existing `CurrencyProvider`) is authoritative end-to-end: UI shows that currency, Stripe Checkout charges in that currency, Stripe converts to our EUR payout at settlement.

`products.billing_mode` is a required enum:

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
- **Family subscriptions**: require real Stripe Price IDs. **Lazy-created on first subscribe**, keyed by `(product_id, frequency, currency)` and cached in `product_subscription_prices` (§5.1a). One Stripe "Product" per club; one Price per (frequency, currency) for that club. Existing subscribers keep their original Price through any base-price change (Prices are immutable in Stripe).
- **Camps / paid events**: inline `price_data` Checkout Session, same shape as bundles but one-shot for one seat.
- **Currency stickiness on subs**: once a family subscribes in GBP, that Stripe subscription is GBP forever. Frequency switches (`switch_subscription_frequency`) resolve the target Price in the subscription's existing currency — same pattern as today's token sub-switch route (`src/app/api/checkout/subscription/switch/route.ts`). No parent-facing warning; handled silently in code.

**Cancellation and refund windows:**

| Purchase shape | Rule |
|---|---|
| Session from a bundle | Cancel ≥ 24h before the session → no credit deducted at session start. Cancel < 24h or no-show → 1 credit deducted. No money movement on bundle-session cancellation; it's a balance adjustment only. |
| Session covered by a subscription | Cancel ≥ 24h before the session → +1 credit accrues at session start, *if the participation is still sub-covered at that moment*. Cancel < 24h or no-show → no motion. The credit is held on the same `credits_remaining` field; it sits idle while the sub is active (sub covers attendance) and becomes spendable when the sub is cancelled. |
| Customer-initiated cancellation of a club participation | "Leave this club" — hard-deletes the participation. Banked credits forfeit (no Stripe refund). For consumer-club parents who want to walk away with value, the path is "cancel sub but stay in the club" — sub stops at period end, credits remain spendable until depleted. See §4.5c. |
| Customer-initiated cancellation of a camp / paid event | Not self-serve today. Parents contact customer support; admin issues the refund (or doesn't) via `admin_remove_participation`. |
| Admin-initiated cancellation of a whole product | Full refund per §6.4 (refund unused bundle value via Stripe, refund pro-rata current-period sub charges via Stripe, full camp/event refunds via Stripe). |
| Admin-initiated removal of a single gamer | Admin can force a Stripe refund outside the normal window — `reason='admin_refund'` on the `refunds` row. |

The 24h window is a platform-wide constant `PARTICIPATION_CHARGE_WINDOW_HOURS` in `src/lib/constants/`, mirrored server-side in SQL for RPC use.

**Session credit movement — single number, no optimistic display.** `credits_remaining` is a single int on the participation. It only moves when a credit is actually earned or spent — no "scheduled" or "pending" tier in the parent UI. The cron (§6.3) is the only thing that moves it.

At each session boundary, the cron resolves coverage at *that* moment and applies one of four rules:

| Coverage at session start | Cancellation status | Motion |
|---|---|---|
| Sub-covered | Cancelled ≥ 24h ahead | **+1 credit** (banked) |
| Sub-covered | Not cancelled in time / attended | 0 (sub covers) |
| Bundle-covered | Cancelled ≥ 24h ahead | 0 (no deduction) |
| Bundle-covered | Not cancelled in time / attended | **−1 credit** |

Because credits only accrue *at session start time when the sub is actually paying for that session*, a parent who cancels future sessions and then cancels their sub gets nothing for sessions beyond their paid period — the participation has flipped to bundle-covered by the time those sessions tick over, so the cron applies bundle rules. This is the load-bearing rule that makes "cancel anything in advance" safe to ship without a cap on lookahead.

**Why no optimistic display.** An earlier draft of this section had the UI show a forecast — "scheduled credits" the parent had cancelled but not yet earned — alongside the actual balance. It was rejected on UX grounds: parents don't think in two-tier credit balances, and the gap between "what the forecast says" and "what survives if I cancel my sub" creates a disappearing-balance moment at sub cancellation that destroys trust. The single-number rule shifts the explanation from *forecast vs reality* (confusing and unfair-feeling) to *cause and effect* (a one-line confirmation at the moment of cancellation: "Cancelled. You'll get a credit on **14 June** as long as your subscription is still active.").

The product detail page's session calendar is the natural place to surface state for cancelled-but-not-yet-credited sessions: each cancelled session renders with a marker that reads as "cancelled — credit lands [date]". The card and balance number stay simple; the calendar carries the per-session detail.

This is intentionally simpler than the Sorg token model, which deducted tokens at the 24h cutoff before each session — confusing UX ("where did my tokens go? I haven't had that session yet"). Under the new model the balance only ever moves at session start, in the parent's favour as often as not, matching the mental model of "I attended → I used one" and "I cancelled in time → I got one back."

### 4.5c Cancel subscription vs. leave a club — a parent must understand the difference

"Cancel my subscription" and "Leave this club" are two distinct actions with different consequences for the parent's banked credits. The detail page (not yet built; this is forward-looking spec) must surface them as visibly separate decisions.

| Action | What stops | What happens to credits |
|---|---|---|
| **Cancel subscription** | The Stripe sub stops at period end. Participations stay alive. | Banked credits stay. Future sessions become bundle-covered; gamer keeps attending until credits run out. |
| **Leave this club** | The participation is hard-deleted. The corresponding sub item is removed from Stripe (and the sub itself if this was the last item). | Banked credits forfeit. No Stripe refund. |

**The distinction only matters when balance > 0.** When `credits_remaining = 0`, the two actions are functionally identical from the gamer's day-to-day perspective — either way the gamer stops attending immediately. The detail page can collapse to a single "Leave this club" button in that case. When `credits_remaining > 0`, both actions must be present and the confirm dialog for each must spell out exactly what happens to the credits, with the count visible.

(There is one second-order difference even at `credits_remaining = 0`: a `Cancel subscription` puts the seat into a grace-window hold, while `Leave this club` releases it immediately. See §4.5d.)

The dialog copy is the load-bearing UX — a parent who cancels their sub and *thinks* they've left the club entirely will be confused weeks later when their child is still expected to show up (or when they still see the club on their dashboard). Confirm-dialog wording for the eventual implementation:

- **Cancel subscription** confirm: *"Cancel monthly subscription? You'll keep attending {Club Name} until {period end} using your sub. After that, you'll have **N credits** to spend at your own pace. Your child still has a spot — leave the club separately if you want to give it up."*
- **Leave this club** confirm: *"Leave {Club Name}? Your child loses their spot, your **N credits forfeit**, and your subscription continues for any other clubs."*

Wording will iterate during the detail-page design pass; the rule the wording must satisfy is in this section.

**Stripe's Customer Portal can do "Cancel subscription" but never "Leave this club."** Billing management is delegated to Stripe's hosted Customer Portal (`src/app/api/parent/billing-portal/route.ts`, opened from `ManageBillingCard`) for payment methods, invoices, and whole-subscription cancel. The portal operates at the *subscription* level, not the *item* level — and Stripe disables the portal's "update subscription" feature entirely for subs with more than one item. So for a family sub (one sub, one item per club) the portal only ever offers **Cancel the whole sub**, which drops every club at once. There is no portal path to remove a single item. Consequences:

- **Per-club removal must stay an in-app action** — the planned `unsubscribe_from_product` RPC (§6.6), never delegated to the portal.
- **Whole-sub cancel via the portal is safe**: Stripe fires `customer.subscription.deleted` → `handleSubscriptionDeleted` (`src/app/api/webhooks/stripe/products/route.ts`) flips `status = 'cancelled'`, purges the `family_subscription_items` rows, and the credit cron flips those participations to bundle-mode. The DB stays consistent without any portal-specific handling.

### 4.5d Seat hold vs. club access — two independent gates with a grace window

A participation row carries two distinct rights, not one:

- **Seat hold** — the row occupies a slot in `products.seat_count`. Other parents see this slot as taken; the waitlist sees it as not-yet-promotable.
- **Club access** — the gamer can join the club's voice room, see the schedule, receive content, and otherwise *participate* in the club.

Most of the time these move together: an `active` participation backed by a healthy sub or banked credits has both. They diverge whenever a parent's billing ability collapses but we don't want to tear the participation row down yet. Two scenarios trigger that divergence:

| Trigger | Seat hold | Club access |
|---|---|---|
| **Sub cancelled, `credits_remaining = 0`** | Held for grace window | Blocked immediately |
| **Sub payment failed, `credits_remaining = 0`** | Held for grace window | Blocked immediately |
| Sub cancelled, `credits_remaining > 0` | Held | Allowed (until credits run out) |
| Sub payment failed, `credits_remaining > 0` | Held | Allowed (until credits run out) |

The grace window — `ACCESS_GRACE_DAYS`, a single platform-wide constant — gives the parent a few days to update their card or re-subscribe without losing their child's spot. After it expires, the seat is released and the lowest-position waitlist row is promoted; the participation row itself is hard-deleted on the same path as `cancel_participation`. A successful re-charge or re-sub during the window cleanly restores access (sub status returns to `active`, items rebound, the next billing cycle tops up `credits_remaining`) — no special "rejoin" flow needed.

Why these are separate gates:

- **Holding the seat without granting access** prevents two opposite failure modes at once: rug-pull (parent missed one charge → child loses a club spot they've had for months) and free access (parent cancels and the gamer keeps showing up until someone notices). Either alone is wrong.
- **Access is a runtime decision; seat is a long-lived state.** Access is checked every time a gamer tries to enter the voice room or view the schedule. Seat is a column count re-evaluated only when the grace job wakes up. Conflating them forces the access check to walk the seat lifecycle (or vice versa) — both worse than separating.
- **Bundle-only participations behave the same way at `credits_remaining = 0`,** for symmetry: access is blocked, seat is held for grace days, then released. A parent who lets their bundle run out without buying more shouldn't be holding a seat indefinitely either.

#### Single source of truth: `participation_access_state`

`participation_access_state(participation_id)` is a SQL function (with a TS twin) returning one of `'allowed' | 'grace_blocked' | 'expired'`. It joins the participation to its family-sub status and credit balance and applies the table above. **Every "can this gamer use the club right now" check consults this function** — voice-room admission, schedule visibility, content gates. No surface re-derives the rule on its own.

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

Correctness invariants that do **not** get relaxed by this principle: idempotency on webhooks (event_id uniqueness on every payment/refund row), race-safe seat counting via `FOR UPDATE`, refund auditability (every money movement recorded in `payments` / `refunds`), and no client-supplied prices (server always recomputes from stored base prices + constants).

### 4.5b Family subscriptions — one sub per family per frequency

Parents think of their School of Gaming bill as one monthly payment, not as N×M separate subs across kids and clubs. The schema and Stripe integration reflect that:

- **One Stripe subscription per (customer, frequency, currency).** A family that subscribes monthly has one `family_subscriptions` row backed by one Stripe subscription. Every club + gamer combo they sign up for is a `subscription_item` on that one Stripe sub. Mixed-frequency families (monthly + quarterly) result in two Stripe subs — acceptable and rare.
- **Billing cycle alignment via `billing_cycle_anchor`.** When a family adds a second (or Nth) club to an existing monthly sub mid-cycle, Stripe prorates the remaining partial period and the new item renews on the same anchor day as the rest. One renewal date for the family. Stripe does all the math.
- **Multi-child discount — one flat tier.** When a family has ≥ 2 distinct gamers with items on the sub, a platform-wide `FAMILY_DISCOUNT_PERCENT` coupon is attached to the Stripe subscription, repricing every item uniformly. Adding the second kid applies the coupon; removing below 2 kids strips it. Intentionally one tier, not a ladder — the knob can become a ladder later by replacing the constant with a lookup.
- **Switching frequency** (monthly → quarterly) uses `proration_behavior: 'none'` — the new rate starts at next renewal. Matches the existing CLAUDE.md rule for tier switches.

Bundles are independent of this structure. A bundle purchase is a one-off Stripe Checkout that tops up a gamer's `credits_remaining` on a specific product; no family sub involvement. A parent can mix bundles (for Oliver, occasional attendance) with a family sub (for Ella, regular attendance) without friction.

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

This pattern works uniformly for **all** purchase shapes — bundles, single-payment camps/events, and family subs. The same gate decides who proceeds to Stripe; nobody is sent through Checkout without a held seat.

**Status, not a timer, holds the seat.** Earlier drafts had `count_seats_taken` exclude reserving rows past `reserved_until`; that created a race window at the 30-min boundary (Stripe accepts payment at T=29:59, our timer lapses at T=30:00, another parent grabs the seat before our webhook arrives). Counting all reserving rows regardless of timer eliminates that window: the row stays held until either `confirm_reservation` or `expire_reservation` fires, and Stripe guarantees those two events are mutually exclusive for a given session. Trade-off: we trust Stripe's webhook delivery to release abandoned seats. If `checkout.session.expired` never arrives (rare), the row is stuck until manual cleanup.

**Each click is an independent reservation.** A parent who abandons mid-pay and clicks Sign Up again gets a brand-new reservation row, not the old one. The schema permits multiple `reserving` rows per `(product, gamer)` (the partial unique index excludes `'reserving'`); whichever Stripe session pays first wins, the other is cleaned up by `expire_reservation`. Pay-twice (parent pays both tabs) is bounded by the unique index firing on the second confirm — the webhook catches `23505`, logs, and returns 200; the duplicate Stripe charge is left for manual refund. We accept this manual-recovery cost in exchange for not maintaining an automated refund flow.

**Subscriptions and the manual-capture gap.** Stripe doesn't support `capture_method: "manual"` for recurring charges, which complicates the "auth-then-decide" pattern an earlier draft of this doc suggested for one-shot bundles. The reservation row sidesteps this entirely: the seat is held in our DB before any Stripe transaction starts, so subs and one-offs follow the same path. The manual-capture future improvement (previously considered for one-shot bundles) is **obsolete** under this model.

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

This avoids a fragile pending-tick cron and a stale-status class of bug. The DB stores facts; the application derives state. The TypeScript helper (`src/components/admin/products/effective-status.ts`) and a sibling SQL function `effective_status(product_id)` share the same rule — the SQL form is what RLS / list queries call when they need to filter by effective state.

**Signup threshold — a single mechanism for all four product types.** `products.signup_threshold` (nullable int) counts active participations only. When set, the threshold gates the derived transition above. Admins get a notification ("Tuesday Minecraft has 8 active signups — ready to start") for visibility — the transition is automatic once the count reaches the threshold, no admin click required.

The admin's only manual lever on lifecycle is the **under-threshold override**: `start_product(product_id, start_date)` writes `status='running'` directly, bypassing the threshold rule. Used when the admin wants to run a club despite missing signups (or wants to start before the planned `start_date`). UI surfaces this as a "Start now under threshold" button with a confirm dialog. The persisted `status='running'` is what tells the derived rule to skip the threshold check on subsequent reads.

Separately, admins can **cancel** a pending product. Cancellation refunds are handled per §6.4.

**Active participation counts.** The derived rule needs `active_participation_count` per product. When `participations` ships, materialize the count on `products` (one int column, default 0, bumped by `create_participation` / decremented by `cancel_participation`) so list queries don't need a join. Until then the helper accepts a count parameter; admin views pass `0` (so threshold-bearing products read as pending), and that's accurate because no parent UI exists to create participations yet.

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

### 5.1 Core tables

```sql
products
  id                    uuid pk
  product_type          enum('consumer_club','municipality_club','camp','event')
  billing_mode          enum('paid','free','external_contract')

  name                  text
  description           text
  topic_id              uuid → topics.id
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
                                            -- Bundle/subscription sessions use the 24h window.

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

topics
  id                    uuid pk
  slug                  text unique
  name                  text
  kind                  enum('game','subject')
  description           text
  icon_path             text

tags
  id                    uuid pk
  slug                  text unique
  name                  text
  description           text

product_tags
  product_id            uuid → products.id ON DELETE CASCADE
  tag_id                uuid → tags.id
  primary key (product_id, tag_id)
```

### 5.1a Pricing tables

```sql
-- Manually-entered per-currency base prices. No FX derivation.
product_prices
  product_id            uuid → products.id ON DELETE CASCADE
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
product_subscription_prices
  product_id            uuid → products.id ON DELETE CASCADE
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

### 5.1b Translations — products, topics, tags

User-visible text on `products`, `topics`, `tags` lives in per-locale child tables, not on the parent rows. The parent carries only structural data (id, slug, kind, FKs). Admins decide which locales to provide; not every parent has every locale.

```sql
product_translations
  product_id   uuid → products.id ON DELETE CASCADE
  locale       text NOT NULL                 -- matches SUPPORTED_LOCALES in src/lib/constants/locales.ts
  name         text NOT NULL
  description  text NOT NULL
  primary key (product_id, locale)

topic_translations (same shape; description nullable)
tag_translations   (same shape; description nullable)
```

**Resolution rule.** The reader picks one row per parent for display, walking the fallback chain in `src/lib/i18n/resolve-translation.ts`:

```
user's UI locale → en → first available
```

Sending all available translations to the client is intentional — payloads stay small (2 short fields per locale, max 4 locales) and a future "view this product in another language" UI is trivial. The browser just calls `resolveTranslation(parent.product_translations, useLocale())`.

**Must-have-≥1-translation rule for products.** Every product must keep at least one translation row in any locale at all times. Enforced two ways:
- `create_product()` / `update_product()` reject an empty `p_translations` payload.
- A BEFORE-DELETE trigger on `product_translations` raises if the delete would leave the product with no rows. (CASCADE on parent delete is allowed via a "parent gone?" check.)

The same rule applies to topics and tags — they're shared reference data that may exist in only one locale at first.

**Inline create stays single-locale.** When the admin clicks "+ Create new topic" / "+ Create new tag" in the product form, the new row is written with one translation — the admin's current UI locale. Other-locale translations for shared reference data get added later via a "Manage topic & tag translations" admin UI (not yet built — tracked as a follow-up).

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
  credits_remaining     int NOT NULL DEFAULT 0             -- single shared balance:
                                                            --   bundle  → set to bundle size at fulfillment
                                                            --   sub     → 0 baseline; +1 on cancel-in-window
                                                            --             at session start (§6.3)
                                                            --   single  → 0 (camp/event/free; no per-session
                                                            --             motion)
  signed_up_at          timestamptz
  unique(product_id, gamer_id)
  -- CHECK: group_id's product_id (if set) matches row's product_id
  -- CHECK: credits_remaining >= 0
  -- CHECK: status='reserving' → reserved_until IS NOT NULL
  -- CHECK: status='waitlisted' → waitlist_position IS NOT NULL
```

**Hard-delete on cancellation** — same as prior draft. Cancellation (customer- or admin-initiated) hard-deletes the row via `cancel_participation` / `admin_remove_participation`. No soft-delete column; cancelled rows are physically gone so `UNIQUE(product_id, gamer_id)` works on re-signup.

> **TODO (deferred — cancellation flow is not in this PR).** The hard-delete cascades down the FK chain via `ON DELETE CASCADE` on `credit_deductions.participation_id` and `session_cancellations.participation_id` — so the audit ledger that proves what was charged and when sessions were cancelled disappears the moment a participation is cancelled. That's exactly the evidence we'd want for chargeback/dispute forensics. When the cancellation flow ships, decide between (a) soft-cancel (status flip to a new `'cancelled'` enum + `cancelled_at` / `cancelled_by` columns + adjust the partial UNIQUE to exclude `'cancelled'`), or (b) keep hard-delete on participations but change those two FKs to `ON DELETE RESTRICT` (matching `refunds.payment_id` which already does this) so the ledger outlives the row. Don't ship the cancel RPC against the current cascade.

`group_id IS NULL` is the unassigned inbox state. Deleting a group resets its participations to `group_id = NULL`.

**Subscription-covered vs bundle-covered.** Coverage is determined by the existence of a live `family_subscription_items` row pointing at the participation, *not* by a column on the participation. While a sub item exists, the participation is sub-covered (unlimited attendance, cancel-in-window banks credits, cron writes `delta=0` deduction rows). When the sub item is removed (sub cancelled, item dropped, etc.), the participation flips to bundle-covered automatically — the same `credits_remaining` field is now spendable, decremented by the cron on attendance. See §4.5.

`credits_remaining` is **non-nullable, defaulting to 0**. There is no NULL-encodes-sub semantics — it's a single int, always queryable. The earlier draft used NULL to encode sub-covered, which fragmented the schema (two motion paths) and broke the cancel-sub-keeps-credits flow.

Changing mode (e.g. convert a bundle remainder into a sub, or vice versa) is not supported — parents cancel and re-sign up. Revisit if it becomes a real request.

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
  purpose                    enum('bundle','subscription_invoice','single_payment')
  stripe_payment_intent_id   text             -- for bundles and single_payment
  stripe_invoice_id          text             -- for subscription_invoice
  stripe_event_id            text unique      -- idempotency on the webhook that created this row
  metadata                   jsonb            -- {gamer_id, product_id, bundle_size, frequency, ...}
  created_at                 timestamptz

refunds
  id                         uuid pk
  payment_id                 uuid → payments.id
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

- `payments` rows are written by Stripe webhook handlers — `checkout.session.completed` (one-off bundles and single-payment camps/events) and `invoice.paid` (subscription cycles). UNIQUE `stripe_event_id` is the idempotency gate.
- `refunds` rows are written by `charge.refunded` / `charge.refund.updated` webhooks, or by our own RPCs that trigger a Stripe refund synchronously (admin override path). Same idempotency gate.
- Nothing is written by the client. Checkout Sessions are created with `metadata` carrying the (gamer_id, product_id, bundle_size, frequency, currency) selector; the webhook reads metadata to construct the `payments` row.

**What credits_remaining depends on:**

- Bundle purchase → webhook writes `payments` row AND increments `participations.credits_remaining` (creates participation if not already present).
- Bundle refund (admin-initiated under a force-refund) → writes `refunds` row AND decrements remaining credits appropriately.
- Subscription invoice → writes `payments` row; no `credits_remaining` motion (sub-covered participations have `credits_remaining = NULL`).

### 5.7a Family subscriptions

```sql
family_subscriptions
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

family_subscription_items
  id                              uuid pk
  family_subscription_id          uuid → family_subscriptions.id ON DELETE CASCADE
  participation_id                uuid → participations.id ON DELETE CASCADE
  stripe_subscription_item_id     text unique
  stripe_price_id                 text             -- the Price this item references at creation
  created_at                      timestamptz
  unique(family_subscription_id, participation_id)
```

**Shape:**

- At most one `family_subscriptions` row per (customer, frequency, currency). A family that mixes monthly + quarterly has two rows.
- Each item is a (gamer, product) pair represented by a `participations` row (with `credits_remaining = NULL`) and a Stripe subscription item.
- The family's total monthly (or quarterly, or yearly) bill is Stripe-computed from the items' Prices minus the `discount_coupon_id`'s value if attached.
- `family_subscriptions.status`, `current_period_end`, and `discount_coupon_id` are maintained by webhooks (`customer.subscription.updated`, `customer.subscription.deleted`), not by the app directly. The app's RPCs call Stripe; Stripe fires webhooks; webhooks update our DB.

### 5.8 Row Level Security

Every new table has RLS enabled. Policy shape follows the existing codebase:

- **Admin = full access.** `get_user_role() = 'admin'` USING/WITH CHECK on every table.
- **Writes are RPC-gated.** Tables mutated by `SECURITY DEFINER` RPCs (participations, payments, refunds, family subs and items, credits, group/assignment mutations via `commit_group_changes`, substitutions) grant no INSERT/UPDATE/DELETE to `authenticated`.
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
| `topics`, `tags`, `product_tags` | all | — | — | — |
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
| `family_subscription_items` | ✗ | via own family_subscriptions | ✗ | ✗ |

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
  - `bundle_1` / `bundle_4` / `bundle_10` — if a seat is available, inserts a `participations` row with `status='reserving'` and `reserved_until = now() + 30 minutes`. Creates a Stripe Checkout Session with inline `price_data` for `bundle_size × price_per_session × (1 − bundle_discount) × currency`, metadata keyed to the reserving row's id. Returns the Checkout URL. On successful payment, `checkout.session.completed` webhook flips the row to `status='active'` with `credits_remaining = bundle_size` and writes the `payments` row. If full, returns `{ full: true }` — UI offers `join_waitlist` instead.
  - `subscription_monthly` / `subscription_quarterly` — same reservation pattern. If a seat is available, inserts the `reserving` row, then resolves or creates the Stripe Price for `(product_id, frequency, currency)`, creates a Stripe Checkout Session in subscription mode keyed to the reserving row, returns the Checkout URL. The `checkout.session.completed` webhook finds or creates the `family_subscriptions` row for `(customer_id, frequency, currency)`, attaches the subscription item aligned to the existing `billing_cycle_anchor`, flips the reserving row to `active` with `credits_remaining = 0`, and re-evaluates the family coupon.
  - `single_payment` (camp / paid event) — same pattern with one-shot Checkout; webhook flips reserving → active on completion.
  - `free` — directly inserts `status='active'`, no reservation, no Stripe.

  The reservation-row insert is the *seat-holding* mechanism (§4.6a). Without it, two parents can both pass the gate, both proceed to Stripe, and one is stuck with a charge against an already-full club.

- **`join_waitlist(product_id, gamer_id, customer_id)`**
  After the gate lock: inserts a `participations` row with `status='waitlisted'` and the next `waitlist_position`. No Stripe call, no charge, no pre-authorization. Returns the position so the UI can confirm.

- **`cancel_participation(participation_id)`**
  Customer-initiated "Leave this club" action. After the gate lock: hard-DELETEs the participation, removes any linked `family_subscription_items` row from Stripe (cancels the sub at period end if this was the last item, re-evaluates the family coupon), then promotes the lowest-position waitlisted row by emailing them — promotion is opt-in, not auto-charge. No Stripe refunds in any branch:

  | Coverage | Rule |
  |---|---|
  | Bundle (any `credits_remaining`) | Banked credits forfeit. No Stripe refund. The user's mental model is "I'm leaving this club" — credits are tied to the participation, so the participation's deletion takes them. |
  | Subscription item | Remove item from Stripe. No refund on the current period; the family keeps paid-through access until period end per Stripe's default. Banked credits on the participation forfeit alongside the row. |
  | Single payment (camp / event) | No customer-initiated refund. Parents contact customer support; admin uses `admin_remove_participation` to issue a refund if appropriate. |
  | Free / external_contract | No money movement. |

  See §4.5c for the parent-facing UX rule that distinguishes "Leave this club" from "Cancel my subscription" — they must be visibly separate actions on the (out-of-scope) detail page.

- **`admin_remove_participation(participation_id, reason)`**
  Admin-initiated. Same as `cancel_participation` including hard-DELETE and waitlist promotion, with the ability to force a Stripe refund outside the normal window — `reason='admin_refund'` on the `refunds` row. For bundle-covered seats, admin can optionally issue a goodwill refund for unused credits; configurable per-cancellation.

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

### 6.3 Session credit cron

**`process_session_credits()` — runs hourly** (scheduled via `pg_cron` at `0 * * * *`, the slot vacated when the Sorg `process_enrollment_charges` cron was dropped in `00052`). The cron is the *only* thing that moves `credits_remaining` — see §4.5 for the four-rule table the cron implements.

Logic per run:
1. Find all `participations` with `status='active'` on products whose `billing_mode='paid'` and `product_type='consumer_club'`.
2. For each, find sessions in `[now − 1h − small buffer, now − small buffer]` where `product_has_session` is true (not admin-cancelled), and no `credit_deductions` row already exists for `(gamer_id, product_id, session_date)`.
3. For each such session, resolve coverage *at that moment* (does a live `family_subscription_items` row point at the participation?), then apply one of the four §4.5 rules:
   - **Sub-covered + cancelled-in-window** → `credits_remaining += 1`. Write a `credit_deductions` row with `delta = +1`, `reason = 'sub_cancel_credit'`.
   - **Sub-covered + not cancelled in time** → no motion. Write a deduction row with `delta = 0`, `reason = 'sub_covered'` so the cron is idempotent and we have an audit trail.
   - **Bundle-covered + cancelled-in-window** → no motion. Write `delta = 0`, `reason = 'bundle_cancel_no_charge'`.
   - **Bundle-covered + not cancelled in time** → `credits_remaining -= 1`. Write `delta = -1`, `reason = 'bundle_attended_or_no_show'`.

Idempotent: the UNIQUE on `credit_deductions(gamer_id, product_id, session_date)` prevents double-processing on re-run.

The bundle-attended branch's underflow is prevented by the participation's coverage flipping to "no spend" once `credits_remaining = 0` — see the under-zero rule in §4.5b. (The simplest behaviour is the cron raising on a `credits_remaining < 0` attempt and the supervising job auto-pausing the participation; the parent gets an out-of-credits notification.)

**"Did they cancel in time?"** — Customer-initiated cancellation of a single session (not yet built; surfaced on the future detail page) writes a row to `session_cancellations(gamer_id, product_id, session_date, cancelled_at)` with UNIQUE per triple. The cron checks `cancelled_at <= session_start − PARTICIPATION_CHARGE_WINDOW_HOURS` to decide which branch above applies. The table ships in this PR even though the cancel-session UI does not — leaves the cron's branch logic unable to fire spuriously, and means the cancel-session UI lands later as a UI-only PR.

**No optimistic motion.** The cron is the only writer of `credits_remaining` post-purchase. Cancellation rows in `session_cancellations` do not move `credits_remaining` directly — the credit (or saved deduction) only materialises when the cron processes the session boundary, with coverage resolved at *that* moment. This is the load-bearing rule that prevents the "cancel sub then bank credits for unpaid future periods" exploit (§4.5).

### 6.4 Lifecycle transitions

- **`start_product(product_id, start_date)`** — admin-initiated. Requires `status='pending'`. Transitions to `running`. Does not check `signup_threshold` (admin is explicitly overriding).
- **`cancel_product(product_id, reason)`** — admin-initiated from `draft`, `pending`, or `running`. Transitions to `cancelled`. Cascade:
  - **Bundle participations** with `credits_remaining > 0`: issue a Stripe refund for `credits_remaining × price_per_session` against the original `payments` row (per-currency). Hard-delete participations.
  - **Subscription items** on any `family_subscriptions` pointing to this product: remove via Stripe API. Stripe auto-refunds pro-rata for the remaining current period (`refunds` written by webhook). If an affected family sub has zero items left, cancel the sub at period end.
  - **Single-payment participations** (camps, paid events): full Stripe refund.
  - **Free / external_contract**: no money movement.
  Waitlisted rows hard-delete with no money movement.

- **`finalize_completed_products()`** — daily job. Transitions `running → completed` for products whose `end_date` has passed.

### 6.5 Retired

Already dropped (migrations `00052_drop_sorg_enrollment_cron.sql` and `00059_drop_sorg_tokens.sql`):
- `process_enrollment_charges` — replaced by `process_session_credits`.
- `enroll_gamer_in_group` — its responsibilities are folded into `create_participation`.
- `unenroll_gamer` — folded into `cancel_participation`.
- `adjust_token_balance` — retired with the Sorg token system.
- `token_transactions`, `enrollment_charges` tables — replaced by `payments` + `refunds`.

Groups and `commit_group_changes` are retained and generalized for all product types.

### 6.6 Family subscription management

- **`subscribe_to_product(product_id, gamer_id, frequency, currency)`** — customer-initiated (actually called via a Checkout flow; see §6.1 `create_participation` with `purchase_shape=subscription_*`). Ensures `product_subscription_prices` has a Stripe Price for `(product_id, frequency, currency)`, lazy-creating on Stripe if missing. Finds or creates a `family_subscriptions` row for `(customer_id, frequency, currency)`. If it exists, adds an item via `stripe.subscriptions.update` aligned to the existing `billing_cycle_anchor`. If not, creates a new Stripe subscription anchored to today. Updates / attaches the family coupon based on the new gamer count.
- **`unsubscribe_from_product(participation_id)`** — removes the Stripe subscription item. Hard-deletes the participation. If the sub now has zero items, schedules the sub to cancel at period end on Stripe. Re-evaluates the family coupon.
- **`switch_subscription_frequency(customer_id, from_frequency, to_frequency)`** — uses `stripe.subscriptions.update` with `proration_behavior: 'none'`. New frequency effective at next renewal. Applies only to the sub matching `from_frequency`.

Webhooks (`invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`) update `family_subscriptions.status`, `current_period_end`, and `discount_coupon_id` from Stripe's state. Webhook-driven, not client-driven. All webhook handlers use `stripe_event_id` uniqueness on `payments` / `refunds` as the idempotency gate.

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

### 7.3 Per-product-type landing pages

`/clubs`, `/camps`, `/events` are consumer browse with the `product_type` filter pre-applied. **Municipality clubs do not get a consumer-browse landing page** — their entry is `/registration`.

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

**Pricing display — driven by stored base prices + hardcoded constants.** For paid products, the detail page shows:

- **Bundle options** — computed from `product_prices.price_per_session` and `BUNDLE_DISCOUNTS`. E.g., "1 session: €20 · 4 sessions: €72 (save 10%) · 10 sessions: €160 (save 20%)".
- **Subscription options** — computed from `product_prices.price_per_month` and `SUBSCRIPTION_DISCOUNTS`. E.g., "Monthly: €45/mo · Quarterly: €115 every 3 months (save 15%)".
- All amounts in the user's selected currency (resolved via the existing `CurrencyProvider`). If the product has no row in `product_prices` for the selected currency, the product shows as unavailable to that parent.

---

## 8. Admin UX

- Single **"Create product"** form with a product type selector that reveals/hides fields by type. Lets admins pre-create 0 or more Gedu Groups each with 0 or more Gedus (§4.1).
- **Per-currency pricing inputs**. For `billing_mode='paid'` products, the form has `price_per_session` and `price_per_month` fields per supported currency (EUR / GBP / USD today). Leaving a currency blank means "not sold in this currency." Inline preview panel shows the derived bundle/subscription prices computed server-side from these base values and the hardcoded constants, so admins see exactly what parents will see. Server recomputes on save — no client-submitted derived prices.
- **Product management page** per product has a **Groups panel** with an Unassigned column (inbox) and one column per group. Drag-and-drop for moves. Add/rename/delete group controls. Add/remove Gedu controls per group.
- **Gedu picker** supports search by name/email/bio and filter by `profiles.spoken_languages`.
- **Calendar view** per product shows computed sessions with overrides applied; admins cancel/reschedule/substitute directly from it.
- **Holiday calendar management** is a separate admin screen; products subscribe via multi-select.
- **Lifecycle actions** on each pending product: "Start product" (with confirm dialog if under threshold) and "Cancel product" (fires refunds per §6.4). Admin home highlights threshold-hit notifications.
- **Payment reporting** — admin dashboard shows `payments` / `refunds` aggregated per product and per period for reconciliation.

---

## 9. Object inventory

The objects that make up this domain (tables, RPCs, enums, types, service classes, query-key factories, constants, API routes):

- Tables: `products`, `product_prices`, `product_subscription_prices`, `participations`, `payments`, `refunds`, `family_subscriptions`, `family_subscription_items`, `product_groups`, `gedu_group_assignments`, `schedule_slots`, `session_overrides`, `session_substitutions`, `session_attendance`, `session_notes`, `session_cancellations`, `credit_deductions`, `holiday_calendars`, `calendar_holidays`, `product_holiday_calendars`, `topics`, `tags`, `product_tags`, `site_details`.
- RPCs: `create_participation`, `cancel_participation`, `admin_remove_participation`, `promote_from_waitlist`, `commit_group_changes`, `cancel_session`, `reschedule_session`, `request_substitute`, `assign_substitute`, `set_substitute`, `record_attendance`, `process_session_credits`, `start_product`, `cancel_product`, `finalize_completed_products`, `subscribe_to_product`, `unsubscribe_from_product`, `switch_subscription_frequency`, `product_has_session`.
- Enums: `product_type`, `billing_mode`, `product_status`, `participation_status`, `subscription_frequency`, `payment_purpose`, `refund_reason`, `session_note_visibility`, `session_attendance_status`, `topic_kind`.
- Code: `services/products/*`, `services/participations/*`, `services/family-subscriptions/*`, `productsKeys`, `ParticipationsService`, etc.
- Routes: admin management at `/admin/products/*`; Checkout endpoints at `/api/checkout/products/*`; webhook at `/api/webhooks/stripe/products`. Parent-facing routes live under `/clubs`, `/camps`, `/events`, and `/registration`.

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
- ✓ `participations` (with `'reserving'` status + `reserved_until`, `credits_remaining`, partial unique index excluding reserving rows).
- ✓ `payments`, `refunds` (UNIQUE on `stripe_event_id`).
- ✓ `family_subscriptions`, `family_subscription_items`, `product_subscription_prices`.
- ✓ `session_cancellations`, `credit_deductions` (append-only ledger), `product_seat_counts` (public-readable rollup with trigger-driven counts + Realtime publication).
- ○ `session_overrides`, `session_substitutions`, `session_attendance`, `session_notes`.

**RPCs (§6).**
- ✓ `create_product` — atomic insert across products + translations + schedule slots + tags + prices + holiday calendars; rejects empty translation payloads.
- ✓ Effective-status derivation — TS helper (`src/components/admin/products/effective-status.ts`) and SQL twin `effective_status(product_id)` both ship.
- ◐ Participation lifecycle — `create_participation`, `confirm_reservation`, `expire_reservation`, `join_waitlist`, `cancel_participation`, `apply_credit_motion` ship; `promote_from_waitlist` ships as a stub (not wired into a customer flow — see §11); `admin_remove_participation` not started.
- ○ Session operations (`cancel_session`, `reschedule_session`, `request_substitute`, `assign_substitute`, `record_attendance`).
- ✓ Hourly credit cron (`process_session_credits` scheduled via `pg_cron` at `0 * * * *`).
- ◐ Subscription management — first-ever sub goes through Stripe Checkout; inline-add of an additional gamer to an existing family sub uses `subscriptions.update` with `always_invoice` + `error_if_incomplete` (synchronous via the checkout route). `unsubscribe_from_product`, `switch_subscription_frequency` not started.
- ○ Lifecycle transitions (`start_product`, `cancel_product`, `finalize_completed_products`).
- ✓ Group mutations (`commit_group_changes`) — atomic batch with the staged-changes pattern, extended for named groups, multi-Gedu, and the unassigned inbox. Companion read RPC `get_product_groups_with_details(p_product_id)` returns a single JSONB document with `groups[]` (each with `gedus[]` + `participations[]`) and `unassigned[]` for the panel.

**Admin UI** — at `/admin/{consumer-clubs,municipality-clubs,camps,events}{,/new}`.
- ✓ List page per product type (`ProductListPage`, type-discriminated).
- ✓ Create form per product type sharing one shell (`product-form.tsx`) split into per-section components — identity, audience, when, where, billing, registration, visibility (`src/components/admin/products/sections/*`). Group management was deliberately removed from the form; admins manage groups from the per-product details page (§7.3).
- ✓ Per-currency pricing block with live FX auto-fill (`pricing-block.tsx` + `pricing-block-fx.ts`, FX rates proxied via `/api/admin/fx-rates` cached 6h) and rendered price previews.
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
- ○ Manage topic & tag translations admin UI (Phase 3 — see §10 Phase 3).

**Form internals.**
- ✓ State + reducers extracted to `product-form-state.ts`; build pipeline (form state → RPC payload) extracted to `product-build.ts`; per-type field availability + scheduling shape + pricing shape configured in `product-type-config.ts`.
- ✓ Multi-locale tabs strip in the Identity card (matching SUPPORTED_LOCALES); initial tab is the admin's UI locale.
- ✓ Translation resolver (`src/lib/i18n/resolve-translation.ts`) with `user locale → en → fi → first available` fallback.
- ✓ Cents helper + currency-aware formatting in `src/lib/constants/{currency,pricing}.ts` and `src/lib/utils.ts`.

**Tests.**
- ✓ Unit: `products-build`, `effective-status`, `pricing-block-fx`, `pricing`, `resolve-translation`, `participation-state-of`.
- ✓ Integration (route handlers): `products-create`, `checkout-products-create`, `participations-waitlist`, `stripe-webhook-products`.
- ✓ DB: `participations-race` (parallel reservations on a 1-seat product, expired-reservation handling, parallel waitlist monotonicity, idempotent waitlist join, free-product seat cap), `participations-rls` (consolidated cross-customer IDOR coverage for participations / payments / refunds / product_seat_counts; other product tables covered via the `access-control.test.ts` catalog check), `product-seat-counts-trigger` (insert/update/delete recomputes the rollup), `session-credits-cron` (all four §6.3 rules + idempotency + late-cancel split + holiday-skip + multi-slot product).
- ✓ DB access-control: `products` family + all financial tables covered by `tests/db/access-control.test.ts`.

**Parent UI**: **do not ship by default**. Each customer-facing screen requires an explicit UX approval from the operator.
- ✓ Browse cards + detail page read real `useParticipationCounts` (seat-left math, threshold progress, "almost full" pill, full-waitlist transitions).
- ✓ Detail-page CTA wires real Stripe Checkout for bundles, subs, single-payment camps; free events register without Stripe.
- ✓ Out-of-stock products show "Join the waitlist" → `join_waitlist` with no charge.
- ✓ Realtime seat counter on the detail page (`useProductSeatCountsRealtime` subscribes to `product_seat_counts` filtered by `product_id`).
- ✓ Already-signed-up detection on the detail page → renders `AlreadySignedUpPanel` (active / waitlisted variants) instead of the signup form.
- ✓ Purchased card driven off real `useMyParticipations` — three placement states (waitlisted / unassigned / assigned), bundle-vs-sub coverage line, session-balance line for bundle-covered clubs.
- ✓ All `?mock=1` gates and `mock-purchased` fixtures deleted from parent surfaces.
- ○ Purchased-state layout for `/clubs/[id]` (the second of "same route, two layouts"): sub management, session calendar with cancellations, per-gamer attendance, add-another-gamer affordance, leave-club / cancel-sub confirms. The current `AlreadySignedUpPanel` is the placeholder until this lands. See §13 "Future improvements (detail-page surfaces)".
- ○ Customer-facing self-cancel flows (cancel-sub, leave-club, cancel-session).

**Stripe**: Checkout endpoints, lazy-created Prices for subs, webhook handlers that write `payments` / `refunds`.
- ✓ `POST /api/checkout/products/create` — auth-gated to customers, validates shape × billing_mode × product_type, holds a `'reserving'` row for 30 min before any Stripe call. Bundles + single-payment use inline `price_data`; subs lazy-resolve a `product_subscription_prices` row and create the Stripe Price on first use.
- ✓ `POST /api/participations/waitlist` — auth-gated, calls `join_waitlist`. Idempotent on existing waitlist rows.
- ✓ `POST /api/webhooks/stripe/products` (separate signing secret `STRIPE_PRODUCTS_WEBHOOK_SECRET`) — handles `checkout.session.completed`, `checkout.session.expired`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`. Idempotent via `stripe_event_id` UNIQUE. **Pay-twice race:** if a parent's two reserving rows for the same (product, gamer) both complete payment, `confirm_reservation` returns `kind='duplicate_payment'` on the second webhook. The handler logs `[stripe/products webhook] duplicate payment detected` with all the IDs needed for refund triage (grep Vercel logs to find), inserts a `payments` row with `purpose='reservation_duplicate'` (admin can `SELECT * FROM payments WHERE purpose='reservation_duplicate'` to find candidates), deletes the orphan reserving row, and returns 200. Refunds are issued manually by an admin from the Stripe dashboard when the customer reports the double charge.
- ✓ Movie-ticket reservation model — status holds the seat for the full 30-min Stripe-session lifetime; cancel-in-Stripe is a no-op; retry reuses the held row. See §13 "Movie-ticket reservation model".
- ○ Family-coupon application (`FAMILY_DISCOUNT_PERCENT`) — flat-tier value undecided per §11; coupon attachment not yet wired.

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
- **Manage topic & tag translations admin UI.** Inline-create from the product form writes a single translation in the admin's current UI locale (see §5.1b). To complete the multi-locale story for shared reference data, add an admin page that lists all topics + tags with their existing translations and lets an admin add/edit translations for additional locales. Until this exists, parents on a locale that lacks a topic/tag translation see the fallback (en → fi → first available).
- **Atomic inline-add for subscriptions.** The inline-add path (`POST /api/checkout/products/create` when a live family sub already exists) does three things in sequence: `subscriptions.update` (Stripe charges proration) → `confirm_reservation` (DB flips reserving → active) → `family_subscription_items.insert` (link row). A DB blip between the second and third step leaves the parent paying for a sub but with no link row, so the cron treats them as bundle-mode-with-0-credits. Symptom: parent cancels a session ≥24h ahead, expects the sub-covered "bank a credit" perk, sees no credit appear; contacts support; support manually inserts the link row (and back-fills `credits_remaining` if appropriate). Not a double-charge — the cron never makes Stripe API calls. Likelihood is rare but real (~1 in 5–10k inline-adds). Fix when frequency justifies it: collapse steps 2+3 into a single RPC, or invert the order (write link row first as `pending`, call Stripe, then confirm). The purchased-product detail page surfaces the family sub + its items so this drift is visible at a glance during testing and support investigations.
- **Inline-add CTA copy overflow.** When the parent has a live family sub and the next add is a yearly tier (e.g., `€600.00` charged today), the CTA "Add to your subscription · €600.00 (charged today)" is too long to fit on a single-line button on `signup-panel-view.tsx` (`ctaInlineAddSub` in messages files). Word-wraps awkwardly on narrow widths. Options when fixing: (a) drop the price suffix and surface the proration amount in the panel body above the button instead, (b) shorten the CTA to "Add · €600.00" with a smaller "charged today" caption underneath, or (c) keep one-line on desktop and stack on narrow widths. Lowest-effort: option (b). Affects all four locales' `ctaInlineAddSub` strings.

### Phase 4 — on-platform municipality billing

Today, municipality invoicing is fully offline (`external_contract`). Future: `municipality_accounts` entity, a new `billing_mode='municipality_account'`, coordinator role, on-platform invoicing.

Design now by avoiding `product_type='municipality_club'` as a switch anywhere billing decisions are made — branch on `billing_mode` instead.

### Phase 5 — gated access (if needed)

School-code gating, private beta for specific municipalities, regional locks. Deferred — customer base is small and trusted.

---

## 11. Open questions

Flagged inline as `OPEN` in the sections they affect.

- ~~**Subscription semantics: top-up balance vs rolling access.**~~ *Resolved:* **rolling**, with a wrinkle. `credits_remaining` is a single int (not nullable) on every paid participation, defaulting to 0 for sub-covered seats. While the sub is active, attendance is unlimited and the cron records `delta = 0` deduction-rows on session boundaries. Cancellations ≥ 24h ahead during a sub-covered period accrue `+1` at session start (§4.5, §6.3). When the sub is cancelled, the same `credits_remaining` field carries forward as bundle credits — sub and bundle share one balance. This is functionally a hybrid: rolling access while subbed, with a credit pot that fills only via cancel-in-window and survives sub cancellation.
- **Exact value of `FAMILY_DISCOUNT_PERCENT`.** One flat tier, number not yet chosen. `OPEN — pick before launch`.
- **Exact value of `SUBSCRIPTION_DISCOUNTS.yearly`.** Yearly is reserved, not yet built. `OPEN — future phase`.
- **Grace window length when `credits_remaining = 0`.** Parent is notified; gamer is held out of sessions; seat held for some period before admin reclaims it. `OPEN — defer`.
- ~~**Bundle-refund policy on `cancel_participation`.**~~ *Resolved:* **no Stripe refund on customer-initiated participation cancellation**, ever. "Leave this club" forfeits banked credits (§4.5c). The right path for a parent who wants value back from a sub is "cancel sub" (sub stops at period end, credits remain spendable), not "leave the club". For camps and paid events, customer-initiated cancellation is not self-serve — parents contact support and admin uses `admin_remove_participation` to issue a refund if appropriate. This sidesteps the gamification risk of pro-rata refunds entirely.
- **Mixing bundle and subscription on the same (gamer, product).** Disallowed — parent must cancel one mode before buying another. `OPEN — revisit if parents complain`.
- **Subscription currency change UX.** Stripe subs are currency-sticky; code handles silently. No parent-facing warning. `OPEN — revisit if support complaints`.
- **Single-group auto-assign.** When a product has exactly one group, auto-assign new participations instead of routing through the inbox? Defer until we see inbox in real use.
- **Unassigned inbox notifications.** WhatsApp / email / in-app nudges to admins when the inbox has sat non-empty for N hours. Future phase.
- **Attendance → removal policy.** N-unexcused-absences threshold, approval flow, appeal path. Defer until attendance tracking ships.
- **DST / tz edge cases on per-session deduction.** When a camp crosses a DST boundary, does the session at 17:00 local still deduct 1 credit? Probably yes — deduction is per-session, not per-hour. *Test note:* `process_session_credits` is currently exercised only with `timezone='UTC'` in `tests/db/session-credits-cron.test.ts`. Real products will run in `Europe/Helsinki`, `America/New_York`, etc. Hard to test deterministically without mocking `NOW()` or the slot timezone, so the plan is a manual staging smoke once a non-UTC product runs through a DST transition, then a regression test if it ever bites.
- **`promote_from_waitlist` lifecycle is not yet wired.** Function shipped in 00039 as a forward-looking stub per §6.1. As written it (a) holds no `FOR UPDATE` lock so two concurrent webhook workers could pick the same row, and (b) doesn't transition the row's status — it stays `'waitlisted'`, which makes a subsequent `create_participation` for that gamer hit the existing-row guard with "already on waitlist". Zero TS callers, zero tests today. The intended flow (cancel → admin emails next-on-waitlist → parent clicks → re-checkout) needs an additional RPC to convert a waitlist row into a reservation without tripping the existing-row check, plus the cancellation RPCs need to actually invoke it. Defer until the waitlist-promotion phase starts; rewrite with locking + transition + race tests parallel to `tests/db/participations-race.test.ts`.
- **Event account requirement for truly free events.** The platform requires an account for all participations. Consider magic-link + gamer-only capture later if friction is too high.
- **Topic taxonomy depth.** Sub-topics (Minecraft — Survival vs Redstone) — add `topics.parent_id` if needed. Not yet.
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

All three are sketches, not implementations. **None of them model the fiat pricing, bundle purchase, or family subscription flows — they predate the billing layer.** When the billing-layer screens are designed, the mockups are a starting point for product-type-specific flows only; pricing UX is new work.

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

After the merge, smoke-test against staging: bundle purchase, sub purchase, waitlist join, refund.

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
├── effective-status.ts             — Derived status helper (TS twin of SQL effective_status())
└── sections/
    ├── identity-section.tsx         — Name/description per locale, topic, image, tags
    ├── audience-section.tsx         — Age range, spoken languages, group seat count
    ├── when-section.tsx             — Start/end date, schedule slots, holiday calendars
    ├── where-section.tsx            — Location picker (site or jurisdiction depending on type)
    ├── billing-section.tsx          — Pricing block, FX auto-fill, refund policy
    ├── registration-section.tsx     — Registration opens at (immediate vs scheduled)
    ├── groups-section.tsx           — Inline group + gedu setup
    └── visibility-section.tsx       — Status, is_visible toggle

Shared building blocks
├── form-primitives.tsx              — Section, Field, etc.
├── pricing-block.tsx + pricing-block-fx.ts — Currency tabs, FX auto-fill logic
├── price-previews.tsx               — Per-currency rendered price summary
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
├── /api/admin/topics/create         — Inline create + single-locale translation
├── /api/admin/tags/create           — Inline create + single-locale translation
├── /api/admin/site-notes            — Upsert site_details / site_staff_details
└── /api/admin/fx-rates              — Proxies frankfurter.dev (cached 6h via fetch data cache)

Services (src/services/products/)
├── products.service.ts              — Read methods (listByType, getByIdForAdmin); write goes through API routes
├── products.queries.ts              — useProductsByType, useProductAdmin, useCreateProduct, useUpdateProduct
├── reference-data.queries.ts        — useTopics, useTags, useHolidayCalendars, etc.
└── fx.queries.ts                    — useFxRates (calls /api/admin/fx-rates)

Parent browse + detail (src/components/public/products/)
├── product-browse-page.tsx          — Page orchestrator: heading, filters, browse grid, empty states
├── product-browse-filters.tsx       — Topic / tag / format chips + clear-all
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

Routes: `/clubs` (consumer + municipality enrollment surface — browse grid is consumer-club only; an enrolled muni club shows in the purchased section above the grid), `/camps`, `/events`.

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

Muni clubs are intentionally not modelled — they don't get a browse page and their purchased card uses the verb badge to convey "registered through your city."

**RLS / effectiveStatus interplay.** RLS only returns `pending` and `running` rows to anon/customer; `completed` is hidden at the DB. The browse card still renders the "Ended" pill because `effectiveStatus()` catches `running` rows whose `end_date` has passed (cron lag between midnight and a `running → completed` flip). Do **not** add `completed` to the service filter — see the comment in `products.service.ts:listVisibleByType`.

**Filter UX.** Filter chips are URL-driven via `useBrowseFilters` — deep-links like `/clubs?topic=minecraft&tag=creative&format=in_person` reproduce a filter state. `filterProducts` is a pure function over `(rows, { topics, tags, format })`. Topic/tag are multi-select, slug-based, OR-within-row + AND-across-rows; format is single-select (`online` / `in_person`, maps to `products.is_remote`). Clear is always rendered (`invisible` when nothing to clear) so the row's box height is constant.

### Parent detail page

Routes: `/clubs/[id]` (both consumer-club and municipality-club rows render here), `/camps/[id]`, `/events/[id]`.

**Same route, two layouts.** There is **one URL per product** — marketing emails, share links, search results, and parent-to-parent forwards all keep working. The page renders different layouts depending on whether the viewing parent has at least one of their gamers enrolled:

- **Marketing layout** (no enrolled gamers) — hero, description, pricing picker, signup form. The Sign Up CTA is the page's reason for being.
- **Purchased layout** (at least one enrolled gamer) — the real layout is *not yet built; tracked under "Future improvements" below*. In place of it today is `ProductPurchasedDetailPlaceholder`, a deliberately bare `<dl>` dump of the product fields and per-gamer participation rows. It exists to verify Stripe webhook fulfillment landed correct DB state during smoke-testing and to lock in the route shape (one URL, two branches in `product-detail-page.tsx`) before the real layout is designed.

**Hero** is a 1:1 product image plus the type label, name, and tagline. The two-column body stacks below: the left column carries description, when-and-where, the session calendar, and the topics/tags card; the right column is a 380px sticky signup panel on desktop that drops below the main column on mobile. **No gedu surface on the parent detail page** — gedu / group identity is a SOG-internal concern.

**Pricing — two-track stacked list.** Consumer clubs render six rows: three subscriptions (monthly / quarterly / yearly with `SUBSCRIPTION_DISCOUNTS`) and three bundles (1 / 4 / 10 sessions with `BUNDLE_DISCOUNTS`). The default selection is **quarterly**. Camps, events, and the rare paid muni rows show a single upfront price line; free / external_contract products show a single non-clickable hint row. Family-discount UI is intentionally **not** shipped here yet.

**Signup-panel registration states.** The same `deriveRegistrationState` that powers browse cards drives the panel: `closed_pre` shows a live countdown clock with the form pre-fillable and a disabled "{verb} — not yet open" CTA that flips to active at zero without remounting; `open` shows an optional almost-full banner + active CTA with the chosen price; `pending_thr` a threshold progress bar + "Reserve a spot"; `full_waitlist` a waitlist explainer + secondary "Join the waitlist"; `full_closed` disabled "Fully booked"; `running_late` / `ended` a muted note with no form. Auth overlays sit on top: unauthenticated visitors see a "Sign in to register" / "Create account" pair, customers with no gamers see "Add a child first" linking to `/parent/gamers`, non-customer roles see an explainer.

**Preview / mock route.** `/preview/products/[type]/[state]` renders the body with a `buildDetailFixture(type, state)` payload. Public route inside `(public)` so it picks up the parent-eye chrome; never indexed (`metadata.robots = { index: false, follow: false }`); reachable only via `/admin/ui-components` "Preview full page →" links. Designers can poke at all 32 (type × state) cells without seeding data.

**Click target.** The active CTA POSTs to `/api/checkout/products/create` with `{ productId, gamerId, purchaseShape, currency }`. The route returns one of `redirect` (Stripe Checkout URL), `subscribed` (inline-add to existing family sub, no redirect), `free_confirmed` (free event, no Stripe), or `full` (UI flips to waitlist CTA).

### Movie-ticket reservation model

The `participations` row **is** the seat. Each click on Sign Up creates a fresh `reserving` row held until either Stripe fires `checkout.session.completed` (→ `confirm_reservation` flips it to `active`) or `checkout.session.expired` (→ `expire_reservation` deletes it). These two events are mutually exclusive on Stripe's side, so the seat is never simultaneously released and confirmed — no race window.

Status alone holds the seat. `count_seats_taken` counts `active + reserving`; `reserved_until` is informational only and no longer consulted by seat math. We trust Stripe's webhook delivery as source of truth — if `checkout.session.expired` never arrives (rare), the reserving row is stuck until manual cleanup. The schema's partial unique index (`uq_participations_active_or_waitlisted`) excludes `'reserving'`, so multiple held rows for the same parent/gamer can coexist — that's what lets each click be independent.

Concrete behaviors that fall out of this model:

- **Cancel in Stripe Checkout = no DB action.** The `cancel_url` brings the parent back to the product page; the unpaid Stripe session dies on its own at `expires_at` (~30 min), Stripe fires `expired`, and the webhook releases the seat.
- **Retry = a brand-new reservation.** If seats remain, the second click succeeds and the parent holds two reserving rows; whichever pays first wins, the other is cleaned up by `expire_reservation`. If the parent's own held seat is the last one, the second click sees `kind='full'` and the UI flips to "Join the waitlist."
- **Pay-twice is bounded by the schema.** Two paid tabs: first webhook flips its row to `active`; the second hits the unique index → Postgres `23505`; the webhook catches the code, logs loudly, returns 200. The duplicate charge sits unrefunded; admin reconciles via the Stripe dashboard.
- **Success redirects to the browse page, not back to the detail page**, moving the post-payment race window off `/clubs/[id]`.
- **Held seat = visible to other parents as taken** for up to 30 min until `checkout.session.expired` cleans it up.

The `expire_reservation` RPC stays around — the webhook calls it on `checkout.session.expired` — but is **never** invoked from a customer-facing API route.

**Waitlist is dead until promotion lands.** `promote_from_waitlist` exists in the schema but no caller wires it up — no email path, no cron, no trigger on participation removal. A waitlisted parent is not notified when a seat opens; whoever clicks Sign Up first wins it. (Plan: post-removal RPC trigger + transactional email + opt-in re-checkout link — see §11.) A known minor wart: a parent with a held reserving row who clicks "Join waitlist" gets the held row back as-is (`join_waitlist`'s idempotency check accepts `'reserving'`); the state self-heals when the reserving row expires. The `'reserving'` carve-out is deliberate — with no promotion logic, a "correctly waitlisted" parent would be stuck behind their own waitlisted row.

### Non-obvious gotchas

- **`useTranslations` types don't cross function boundaries.** Helper functions that take `ReturnType<typeof useTranslations<"productBrowse.card">>` trip TS2589 ("excessively deep"). Closure-bind `t` inside the component and write small literal-key dispatcher helpers (see `headingFor` in `product-browse-page.tsx`).
- **Lucide icons must not be aliased to a local variable in render.** `react-hooks/static-components` flags `const Icon = iconFor(state)` as dynamic component creation. Wrap the switch in a tiny component (`<StateIcon state={state} className=… />`).
- **The View shouldn't depend on the currency provider.** Currency lookup happens in the adapter; the View receives an already-formatted `ProductPriceLine`. Same rule for locale-aware date formatting.

### Future improvements (detail-page surfaces)

- **Purchased-state layout for `/clubs/[id]` (and camps/events).** The big one. Same route, substantially different UI when the viewer has at least one enrolled gamer: sub management (frequency switch, cancel sub, next billing date), session calendar with cancelled-session markers and per-gamer attendance, **add-another-gamer affordance** (the gap left by today's "go back to browse and pick a different gamer" workaround), leave-club / cancel-session confirms, refund disclosure when a session was cancelled in-window. The current `AlreadySignedUpPanel` is the placeholder until this lands. **Skeleton caveat:** both branches currently show `DetailLoadingSkeleton` (hero + 2-column with a tall signup panel); a real purchased layout has a different shape and the skeleton will then reflow visibly — branch the skeleton too when the layout is designed (the CLAUDE.md "no in-place shift" rule).
- **Admin-cancel-session UI.** `session_overrides` is designed but not shipped. When it lands, extend `computeProductSessions` to merge those rows into `skips` — the calendar View needs no change.
- **Admin details page — gamer/group management surface.** Once participations land, the details page should host gamer→group assignment plus an "unassigned gamers" tray so admins can do roster work without leaving the product. Cancel-product and Save-as-draft buttons also live here.
- **Gedu session-details page — unassigned-gamers tray.** `get_gedu_assigned_product` returns `groups[]` only; new signups not yet placed in a group (`participations.group_id IS NULL`, `status = 'active'`) are invisible to the gedu. Add a read-only "Awaiting assignment" section (extend the RPC's return JSONB with an `unassigned[]` array). Gedus can't move gamers — that's still admin-only via `commit_group_changes`. Also: `SessionDetailsPage` conflates a genuine forbidden (`null`) with transient errors — check `isError` separately and reserve `NotAssignedState` for the `42501` case.
- **Extend `site_details` read policy to purchasing customers.** Migration `00038_site_details_restrict_to_staff.sql` tightened `site_details` to admin + gedu only. The handoff intent was admin + gedu + customers who have purchased a product at that site. Add a third SELECT policy on `site_details` keyed on an active participation at the site, with positive/negative cases in `tests/db/site-details-rls.test.ts`. Leave `site_staff_details` admin + gedu only.
- **Inline topic / tag create can leave orphan parent rows on transient failure.** `POST /api/admin/topics/create` and `/api/admin/tags/create` insert the parent row, then the translation row, then roll back the parent on translation failure. An interruption between the two awaits strands a parent with no translation. **Fix:** move both inserts into a single SQL function (`create_topic`, `create_tag`) that writes both atomically, matching `create_product`.
- **`update_product` silently wipes parent fields the form doesn't surface.** It accepts every editable column with `DEFAULT NULL`; any field the build pipeline (`buildSharedFields` in `product-build.ts`) omits lands as `NULL`. Concrete trap: `refund_policy_days` is in the schema but no UI sets it; a future feature/backfill that populates it would get nulled on the next form edit. **Fix:** make the route pass through fields the client didn't send (mirrors `image_path` "keep current"), or take an explicit "set" sentinel per optional column.
- **CTA stays active when a price row is missing for the viewer's currency.** The admin form validates all three currencies (`product-build.ts`), but the DB doesn't enforce it (`product_prices` is a `(product_id, currency)` PK with no count constraint). A product missing a currency renders "Not in {currency}" in the price slot but the CTA stays active — once Stripe Checkout is wired, a parent could click Sign up on a product they can't buy. **Fix:** plumb price availability into the CTA decision (disable or hide with a "Switch to {available currency}" hint), parallel to the `ended` treatment.
- **Events should remain purchasable on their start day until the actual start time.** `deriveRegistrationState` returns `running_late` for any camp or event whose `effectiveStatus` is `running`, and `effectiveStatus` flips to `running` at 00:00 local on `start_date`. For camps this is correct (the cohort started together — CPO confirmed). For events it's wrong: a Friday 18:00 party becomes `running_late` at Friday 00:00. **Fix:** for `event` only, combine `start_date` with the first `schedule_slots.start_time` to get an instant and return `running_late` once `now >= startInstant`. Also clean up the `running_late` card to show a soft "already underway" line instead of an orphaned price block.
- **Browse page gates entire surface on three queries.** `ProductBrowsePage` waits on `useVisibleProductsByType`, `useTopics`, and `useTags` together. Topics and tags are platform-wide and almost always cached. **Fix:** scope the spinner to `productsLoading` only; render `<ProductBrowseFilters>` with empty chip rows while topics/tags load (the row position is already reserved, so no layout shift).
- **`effective_status` SQL twin maintenance.** The TS helper uses `date-fns-tz` to compare `start_date` / `end_date` against `now` in the product's timezone and derives an `expired` state for pending products whose `end_date` passed without satisfying the start conditions. Keep the SQL function `effective_status(product_id)` in lockstep when DB-side filters need to match the client.
- **Image hero + lightbox.** The image renders as a 1:1 thumbnail in the hero today; a future "tap to enlarge" wouldn't break the layout.
- **Dead-end detail panels.** Browse-card CTAs only link to actionable states; `FullClosedPanel` / `RunningLatePanel` / `EndedPanel` have no normal browse → detail entry. They render defensively for direct-URL access and in-session state transitions. The UI Components page is the canonical regression surface for them — keep its preview tiles current.
