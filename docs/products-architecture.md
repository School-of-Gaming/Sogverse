# Products Architecture

The `products` domain: four product types (consumer clubs, municipality clubs, camps, events) as **one unified shape**, priced in EUR. In production.

**This doc is the high-level map, not the reference.** It carries the mental model and the rules an agent can't infer from code, plus where to look. Concrete shapes and behaviour live in code and are the source of truth — don't restate them here, they rot:

- **Schema** (columns, constraints, enums, RPC signatures and bodies): `supabase/schema.sql` + `src/types/database.types.ts`.
- **Behaviour**: the services and components in the "Where to look" map below.

Adjacent systems have their own colocated docs: `src/services/locations/CLAUDE.md`, `src/components/voice/CLAUDE.md`, `src/lib/email-templates/CLAUDE.md`, `src/services/whatsapp/CLAUDE.md`. Stripe test cards + webhook deployment runbook: `docs/stripe.md`.

---

## The model

| | Consumer club | Municipality club | Camp | Event |
|---|---|---|---|---|
| Parent verb | Enroll | Register | Sign up | Join |
| Who pays | Parent, monthly | Municipality, off-platform | Parent, upfront | Parent upfront, or free |
| `billing_mode` | `paid` | `external_contract` | `paid` | `paid` or `free` |
| Schedule | Recurring, open-ended | Recurring, term-bounded | Recurring, camp-bounded | One-off |
| Capacity | Seat-capped | Seat-capped | Seat-capped | Capped or uncapped |
| Discovery | `/shop` | `/schools` | `/shop` | not browseable |

The four share ~80% of the operational model (schedule, location, topic, language, age range, gedus, participation, attendance, notes, waitlist, and — online only — a voice room). They differ on **pricing shape** and **schedule shape**, captured as small orthogonal fields rather than separate tables.

**Rule: branch on the orthogonal fields (`billing_mode`, schedule shape, `seat_count`, refund policy), never on `product_type`.** `product_type` is a label for UI and filtering only. (This is what lets a future on-platform muni billing mode slot in without per-type switches everywhere.)

---

## Naming & vocabulary

- **"Municipality club," never "school club"** (schema `municipality_club`). They run at libraries, community centres, school rooms — anchoring the name to "school" is inaccurate. Don't introduce "school club" in copy, URLs, schema, or docs.
- **Parent-facing verbs differ per type** (Enroll / Register / Sign up / Join). Copy only — they never reach schema, query keys, RPC names, or URLs.
- **One schema noun: `participations`** — a gamer's seat (or waitlist spot) on a product, any type.
- **Participation state is derived from the row, never stored:** `waitlisted` (status), `unassigned` (active + no group), `assigned` (active + group). Parents see `unassigned`/`assigned` as one "Confirmed" state.

---

## Core invariants

The rules to honour; the *enforcement* lives in the SQL/code.

### Seat gate & reservation

- **The product-row lock is the signup gate.** Every participation mutation begins `SELECT 1 FROM products WHERE id = $1 FOR UPDATE`, so concurrent create/cancel/promote on one product serialize and seat math is race-free. **Never `SKIP LOCKED` / `NOWAIT`** — callers must wait to see consistent post-commit state.
- **A seat is held by a `reserving` participation row, created before Stripe** (the "movie-ticket" model). Paid signup inserts `status='reserving'` under the lock, then sends the parent to Stripe; the webhook flips it to `active` (`confirm_reservation`) or expiry deletes it (`expire_reservation`). Seat counting includes `active + reserving`.
- **Status — not a timer — holds the seat.** Seat math ignores `reserved_until`; the row is held until confirm/expire fire (Stripe guarantees they're mutually exclusive for a session). Counting reserving rows by a timer reintroduced a boundary race. Trade-off: a never-delivered `expired` webhook strands the row (rare, manual cleanup).
- **No client-supplied prices.** The client sends `(product_id, gamer_id, purchase_shape, currency)`; the server recomputes the charge from the stored base price every time.

### Billing

- **EUR-only authoring + Stripe Adaptive Pricing at checkout.** Authored, displayed, and recorded in EUR; Stripe presents the customer their local currency and settles us in EUR. The currency columns/CHECKs stay dormant for a future multi-currency re-enable — single seam is `SUPPORTED_CURRENCIES`.
- **One purchase option per type, decided by the product** (not a menu): consumer club → monthly subscription; camp / paid event → single upfront; free event → no checkout; muni → the `external` shape (instant `active`, invoiced off-platform, no Stripe). `free` and `external` are the two no-charge shapes, each gated on its matching `billing_mode`.
- **One Stripe subscription per (gamer, club)** — one `family_subscriptions` row each (the "family" name is historical; a row is one child in one club). Buys: always-Checkout (the trust moment), per-club cancel via Stripe's portal, and future deferred billing.
- **Club cancellation is portal-only.** No in-app cancel action. Parent cancels in Stripe's hosted portal → `customer.subscription.deleted` webhook → `cancel_participation` hard-deletes the participation (CASCADEs the sub row). Webhook-driven and idempotent; the app never calls Stripe back on that path.
- **Keep pricing/checkout code simple first** — prefer Stripe's built-ins (proration, `billing_cycle_anchor`, coupons) over re-implementing its math. Non-negotiable regardless: webhook idempotency (`stripe_event_id` unique on every `payments`/`refunds` row), `FOR UPDATE` seat counting, every money movement recorded, server-recomputed prices.

### Seat hold vs club access (partly forward-looking)

A participation carries **two independent rights**: the **seat hold** (occupies `seat_count`) and **club access** (voice room, schedule, content). They usually move together; a failed sub payment blocks access immediately but holds the seat for a grace window (`ACCESS_GRACE_DAYS`) before release. Access is a runtime check (`participation_access_state`); seat is long-lived state. *The grace gates and `invoice.payment_failed` wiring are spec'd but not all shipped — verify against code before depending on them.*

### Sessions

- **Session dates are computed, not stored** — from `start_date`/`end_date` + `schedule_slots` + subscribed `holiday_calendars` + sparse `session_overrides`. Keyed by `(product_id, session_date)`; there is no `sessions.id`. Extending a term is one `UPDATE`; no regenerate step.
- Times are product-local: `products.timezone` (IANA), `schedule_slots.start_time` is wall-clock (stable across DST). Render in the viewer's zone with a "Helsinki / your time" label when they differ.

### Groups & capacity

- **Groups are an admin-only cohort layer; parents never see them.** Every type uses them. A product has 0+ named groups, each with 0+ gedus and 0+ participations.
- **Capacity lives on the product, not groups.** Admins balance participants across groups by hand.
- New paid participation lands `group_id = NULL` — the **unassigned inbox** admins work through. Deleting a group resets its participations to unassigned.
- **A gedu is on at most one group per product** (unique constraint); they can be on many *different* products.
- Cohorts differing only in gedu / voice room = multiple groups in one product; cohorts differing in schedule = separate products.

### Waitlist

- **Order is derived from `participations.waitlisted_at` (`ORDER BY waitlisted_at, id`), never a stored rank** — removing or promoting a row needs no renumbering. (`join_waitlist` stamps `clock_timestamp()` under the lock so concurrent joins get distinct ranks.)
- **No automatic promotion.** An admin promotes/demotes manually from the groups panel: `promote_from_waitlist` (→ active, place in a group/unassigned, **no seat-count gate** — a deliberate capacity override) and `demote_to_waitlist` (→ back of the line). Both admin-gated, under the product lock.
- **`get_waitlist_position`** is the parent/gamer "you're #N" read: `SECURITY DEFINER` to count past the caller's RLS, but **owner-authorized** and returns only the integer.

### Lifecycle & visibility

- **Effective status is derived, not cron-driven.** `status` stores admin facts only (`draft`, `pending`, `cancelled`, the `running` override); `pending → running` (start_date reached AND any threshold met) and `running → completed` (end_date passed) are computed at read time. **The TS helper (`effective-status.ts`) and the SQL `effective_status()` twin must stay in lockstep** — RLS/list filters call the SQL form.
- **`draft` means incomplete** (mandatory fields unfilled), not "hidden" or "unpublished"; draft rows get constraint escape hatches. **`draft` implies hidden** (DB-enforced). `is_visible` is otherwise orthogonal to status.
- The only manual lifecycle lever is `start_product` (the under-threshold override). Cancellation fires refunds per type.

### Topic, location, voice

- **`topic` is a fixed Postgres enum** (`minecraft` / `fortnite` / `webinar`); the game-vs-subject split and labels live in code (`src/lib/products/topics.ts`), not the DB. No admin topic CRUD. Game labels are literals (never translated); subject labels localize.
- **Location rules:** in-person → `location_id` is a `site` (required); online muni → a country/region/municipality (required); online non-muni → NULL. **Muni residency is honour-system intent, not enforced** — never use `municipality_club` as a proxy for "free to all."
- **Voice rooms exist iff `is_remote`, one per group.** A gamer sees only their own group's room; a gedu sees every group's room on a product they're assigned to (emergency coverage); an unassigned participation has none.

---

## RLS topology

- **Admin = full access** on every table. **Writes are RPC-gated** — tables mutated by `SECURITY DEFINER` RPCs grant no INSERT/UPDATE/DELETE to `authenticated`.
- **Parents never see** `product_groups`, `session_substitutions`, the per-group gedu roster, or `site_staff_details`. The parent-facing gedu list is `DISTINCT gedu_id` across the product's groups.
- **Gamers have no payment visibility**; customers see their own `payments`/`refunds`/`family_subscriptions` via `customer_id = auth.uid()`.
- **Gedus read products regardless of `is_visible`/`status`** (they may be assigned to a draft or cancelled one).
- `product_subscription_prices` (Stripe Price IDs) is not a public catalog — parents only see the computed display price from `product_prices`.
- Enforced by the catalog checks in `tests/db/access-control.test.ts` (RLS on every table; only allowlisted functions callable by anon/authenticated).

---

## Parent surfaces

Two parallel entry points, **never cross-linked** — one canonical URL per product, produced by a single `productDetailPath`-style helper:

- **`/shop`** — consumer browse (`/shop/[id]` detail). Covers consumer clubs and camps behind a required Clubs|Camps type filter. **Events are not surfaced; muni clubs are excluded.**
- **`/schools`** — municipality discovery, location-first (`/schools` → `/schools/[municipalityName]` → `/schools/[municipalityName]/[id]`). Lists only `municipality_club` rows that are `is_visible` + pending/running.

**Rule: a discovery surface that doesn't collect a location can't surface muni clubs.** Every product has `registration_opens_at` (the "ticket drop"); the detail page is pre-open (countdown) / open / closed-or-waitlist.

`is_visible` gates whether parents can **find/view** a product on its surface; already-enrolled families keep it on their My SOG dashboard regardless.

---

## Admin surfaces

- Routes per type: `/admin/{consumer-clubs,municipality-clubs,camps,events}` + `/new`, `/[id]` (details), `/[id]/edit`.
- One shared form shell (`product-form.tsx`) → per-section components; pure build/validate in `product-build.ts`; per-type field/shape config in `product-type-config.ts`; pre-prod, per-type feature locks in `form-locks.ts` (e.g. seat count / waitlist / registration window are unlocked for muni, locked elsewhere). `create_product` / `update_product` are atomic (parent row + all child sets in one transaction).
- **Groups + waitlist management lives on the per-product details page, not the form** — one drag-and-drop panel (unassigned inbox + group columns + waitlist), writing through `apply_group_changes` (group structure) and the waitlist RPCs. Display order is server-side by recency; the client appends optimistically to match, so moves don't flicker.

---

## RPCs

Names by purpose — **read the signatures and bodies in `schema.sql`**. All `SECURITY DEFINER`, gate-locked where they touch seats or money.

- **Participation lifecycle:** `create_participation`, `confirm_reservation`, `expire_reservation`, `join_waitlist`, `promote_from_waitlist`, `demote_to_waitlist`, `get_waitlist_position`, `cancel_participation`.
- **Groups:** `apply_group_changes` (the sole write path for groups / gedu assignments / `participations.group_id`) + the read `get_product_groups_with_details` (groups + unassigned + waitlist snapshot).
- **Sessions / lifecycle** (several still unbuilt — check code): `product_has_session`, `cancel_session`, `reschedule_session`, `request_substitute` / `assign_substitute`, `record_attendance`, `start_product`, `cancel_product`, `finalize_completed_products`.
- **Effective status:** `effective_status(product_id)` — SQL twin of the TS helper.

---

## Where to look

| Need | Place |
|---|---|
| Table / column / constraint / enum / RPC shapes | `supabase/schema.sql`, `src/types/database.types.ts` |
| Product reads + form build/validate | `src/services/products/`, `src/components/admin/products/product-build.ts` |
| Participation / waitlist / seat counts | `src/services/participations/` |
| Groups panel data + mutations | `src/services/groups/` |
| Admin form + groups/waitlist panel | `src/components/admin/products/` |
| Parent browse + detail + signup | `src/components/public/products/` |
| Municipality discovery | `src/components/public/schools/`, `src/app/(public)/schools/` |
| Checkout + Stripe webhook | `src/app/api/checkout/products/`, `src/app/api/webhooks/stripe/products/` |
| Effective status | `src/lib/products/effective-status.ts` |

---

## Known gaps & traps

Things another agent would get wrong without this written down (the code doesn't announce them):

- **`update_product` nulls any editable column the form doesn't send** (it defaults every column to NULL). A field in the schema but not in `buildSharedFields` (e.g. `refund_policy_days`) gets wiped on the next edit. Fix shape: pass through unsent fields like `image_path` does.
- **The signup CTA stays active when no `product_prices` row exists for the viewer's currency.** The form validates all currencies but the DB doesn't enforce it; gate the CTA on price availability.
- **Events flip to "already started" at 00:00 on `start_date`**, not at the slot time (`effectiveStatus` goes `running` at local midnight). For events, combine `start_date` with the first slot's `start_time`. Correct for camps (cohort starts together).
- **Several session-ops and lifecycle RPCs, admin participation removal, and the grace-access gates are spec'd but unbuilt** — verify in code before relying on them.

---

## Deferred (design-now constraints)

- **On-platform municipality billing.** Today muni invoicing is fully offline (`external_contract`); a future `billing_mode='municipality_account'` brings it on-platform. Design for it now by branching on `billing_mode`, never on `product_type='municipality_club'`.
- **Purchased-state `/shop/[id]` layout** (sub management, session calendar, attendance, add-another-gamer) — today an enrolled viewer gets `AlreadySignedUpPanel`.
- **Operational surfaces:** session overrides/substitutions/attendance UI, standalone holiday-calendar admin, lifecycle buttons + reporting dashboards.

Feature wishlists and one-off follow-ups live in `TODO.md`, not here.
