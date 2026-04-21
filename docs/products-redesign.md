# Products Redesign — Unifying Clubs, Camps, and Events

Forward-looking architecture proposal that redesigns the `products` domain to cleanly support **four product types**: consumer clubs, municipality clubs, camps, and events. Not yet implemented.

Status: **design / pre-implementation**. Supersedes `school-clubs-design.md`. Rename to `products-architecture.md` when this ships.

Related: `groups-architecture.md`, `customer-enrollment-architecture.md`, `locations-architecture.md`, `voice-chat-architecture.md`, `email-architecture.md`, `sorg-token-architecture.md`, `whatsapp-automated-flow.md`.

---

## How to use this document (doc vs. mockups)

Treat this doc as the canonical spec. Two UX mockups live alongside it on the `feature/school-clubs-mockup` branch:

- **Admin create-product mockup** at `/admin-mockup/products/new` — sketches the admin flow for all four product types, including the location tree, Gedu picker, group cards, and three-mode start trigger.
- **Parent registration mockup** at `/registration` — sketches the parent flow for municipality-club discovery and signup: location-based search, ticket-drop countdown, one-click registration, waitlist experience.

Both mockups are deliberately built **without** i18n, RBAC, real data queries, or the real design-system patterns of the codebase — they exist so the product team can click through and react to flows.

When we implement this for real, the doc is expected to travel into the dev branch on its own while the mockups stay behind as visual references:

- **Doc is the source of truth** for business rules, schema, RPCs, per-type behavior, and permission topology. Anything production needs that the mockups don't model — auth, RLS, query invalidation, accessibility, i18n, dark-mode contrast — lives in the doc. If it's in the doc, build it; if it's not, flag it and update the doc before coding.
- **Mockups are sketches** for UX patterns (location picker modes, Gedu filtering, group cards, start-trigger radio, ticket-drop countdown, location-first search, waitlist confirmation, etc.). Look at them while building those screens; don't port them line-by-line. Their fake-data shape, state management, icon choices, and copy are starting points, not specifications.
- **If the doc and a mockup disagree, the doc wins.** Any business case visible in either mockup should also be captured here — if a gap surfaces during implementation, update the doc (and file a PR) before building around it.

---

## 1. Why redesign

Today's `products` schema is built for a single product line — weekly consumer clubs paid in Sorg tokens. A `product_groups` layer exists to organize participants and Gedus within a product, and `group_enrollments` + `enrollment_charges` drive per-session billing. Groups stay under the new design (§4.1); the schema around them is reshaped so all four product types use them uniformly.

Now we are adding three more product types. Trying to extend the existing shape with discriminator columns would leak concepts across product lines and force every RPC to branch on type. This document proposes a ground-up reshape of the products domain that accepts all four types as first-class citizens with minimal branching.

Because all current data is staging-only, the migration is a **greenfield cutover**: new schema replaces old, no backfill concerns.

---

## 2. The four product types

| | **Consumer club** | **Municipality club** | **Camp** | **Event** |
|---|---|---|---|---|
| **UI verb (parent)** | Enroll | Register | Sign up | Join |
| **Who pays us** | Parent, ongoing | Municipality, off-platform | Parent, upfront | Parent (upfront) or free |
| **Billing currency** | Sorg tokens, per session | External contract | Sorg tokens, one-time | Sorg tokens (one-time) or free |
| **Schedule** | Recurring, no end | Recurring, term-bounded | Recurring, camp-bounded | One-off |
| **Days per week** | Typically 1 | Typically 1 | Often 2–5 | 1 date |
| **Capacity** | Seat-capped | Seat-capped | Seat-capped | Seat-capped or uncapped |
| **Waitlist** | Yes | Yes | Yes | Optional |
| **Gated access** | No (v1) | No (v1 — simplification) | No | No |
| **Refunds** | Session-window | None (municipality-paid) | Cutoff before start; admin after | Cutoff before start |
| **Registration opens at** | Never (always open) | **Required** — "ticket drop" moment | Optional | Optional |
| **Holiday calendars** | Applies | Applies | Applies | N/A (single-date) |
| **Start trigger modes offered** (§4.11) | All three | Fixed date only | Fixed date; fixed date + minimum | All three |

### The unifying observation

The four types share **~80%** of the operational model: schedule, location, topic, language, age range, Gedu(s), participation, attendance, notes, waitlist, and — for online products only — a voice room. They differ primarily on **billing** and **schedule shape** — two dimensions that can be captured with small, orthogonal fields rather than separate tables.

---

## 3. Terminology

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

The database uses **one** generic noun for the participation record: **`participations`**. A `participation` is a gamer's seat (or waitlist spot) on a product, regardless of product type. UI verbs are a presentation concern.

This replaces today's `group_enrollments` and the `school_registrations` that `school-clubs-design.md` proposed. One table, one concept, one set of RPCs.

---

## 4. Key design decisions

### 4.1 Gedu Groups: admin-only cohort layer, used by every product type

The `product_groups` layer is **kept** and generalized. Every product type uses groups.

**The model:**

- A product has **0 or more Gedu Groups**. Admins create groups when and how they want to. An admin can create groups up-front during product creation, but the typical flow is: create the product → wait for seats to sell → decide the right number of groups based on actual demand → create them then.
- Each group has a **name**, **0 or more assigned Gedus**, and **0 or more participations** (gamers who've been placed into it).
- **Parents never see groups.** They see the product. The group layer is an internal, admin-facing abstraction for organizing participants and Gedus.
- **Groups have no seat cap.** Capacity lives on the product. Admins balance participants across groups manually using the existing drag-and-drop UI. A group can be arbitrarily under- or over-populated relative to its siblings; that's an admin judgment call.
- A group with **zero Gedus** is valid (admin decided structure before picking people).
- A group with **zero participations** is valid (admin set up capacity before gamers bought in).

**Gedus attach to groups, not products.** A Gedu may be assigned to multiple groups in the same product. The set of "Gedus on product X" is derived: `DISTINCT gedu_id FROM gedu_group_assignments JOIN product_groups ON …`.

**Cross-group voice mobility (online products).** All Gedus assigned to any group within the same product can join any sibling group's voice room. This solves the "Adam has to step away for 10 minutes; Bob covers for him" case naturally. Gamers cannot hop — a gamer can only see and join their own group's voice room.

**Unassigned participations queue.** When a parent buys a seat, the participation lands with `group_id = NULL` — an "unassigned" inbox that admins work through, placing each gamer into a suitable group. Admins should do this promptly; later phases will add notifications (email / WhatsApp / in-app) so no gamer is left unplaced for long. The existing drag-and-drop UI is extended to include this unassigned column.

**Single-group products.** When a product has exactly one group, an admin might reasonably want new participations to auto-assign into it (no unassigned queue shuffle). We haven't decided whether to build this for v1 — see §11.

**Parallel cohorts.** Cohorts that differ *only in Gedu / voice room* are modeled as multiple groups within one product. Cohorts that differ in schedule (different weekday / start time) are modeled as separate products. Parents see the latter as separate browse results; the former as a single "one product, many seats" card.

### 4.2 Dynamic session computation

Session dates are **not** stored. They are computed on read from:

- `products.start_date`, `products.end_date` (nullable = ongoing)
- `schedule_slots` (one row per weekday the product runs, with its own `start_time` and `duration_minutes`)
- Subscribed `holiday_calendars` (shared, e.g. "Finnish national holidays," "Espoo schools")
- `session_overrides` (sparse — only dates that deviate)

**What we gain:**

- Extending a camp by 2 weeks = `UPDATE products SET end_date = ...`. New session dates appear everywhere instantly.
- Adding a holiday to a shared calendar updates every subscribed product at once.
- No "regenerate" failure modes. One source of truth.

**What we give up:**

- No `sessions.id` — every session is keyed by `(product_id, session_date)`. Attendance, notes, and overrides use this composite.

**Edge case noted:** the composite key precludes two sessions on the same date for the same product. If this ever becomes a real requirement (unlikely — the workaround is to model them as two products), adding a `slot_index` column to the composite is a small migration.

### 4.3 Timezones

Clear discipline per column:

- `products.timezone` — IANA zone, e.g., `Europe/Helsinki`. The product's home timezone.
- `session_date` — DATE interpreted in the product's timezone.
- `schedule_slots.start_time` — TIME in the product's timezone. Clock time is stable across DST; UTC offset shifts automatically.
- All `*_at` columns — `timestamptz`, stored as UTC, rendered in viewer's tz.
- `holiday_calendars` have a `timezone`; subscribed products should share it.

Rendering converts `(session_date, start_time, product.timezone)` into an absolute moment, then displays it in the viewer's locale with an explicit "Helsinki time / your time" label when they differ.

### 4.4 Topic + tags (no more `game`)

`game_id` on products is replaced by:

- **`topic_id`** — one per product. Canonical subject matter. Examples: Minecraft, Fortnite, Pokémon GO, Online Security, Game Design. `topics` table is admin-managed.
- **`product_tags`** — many per product. Controlled vocabulary. Examples: `neurodiversity-friendly`, `competitive`, `chill`, `beginner`, `advanced`. Drives parent-facing filters and internal search.

The `games` concept (and table, if any) is retired. A "game" is just a topic that happens to be a game.

**Topic kind — games vs subjects.** Topics carry a `kind` classification:

- `game` — a named video game (Minecraft, Fortnite, Roblox, Valorant, Super Smash Bros., Pokémon GO, …).
- `subject` — a non-game topic (Game Design, Online Safety, Esports Fundamentals, Coding for Gamers, …).

Kind drives UI grouping wherever topics are listed — topic pickers separate "Games" from "Subjects" in two optgroups; parent browse surfaces can split or filter by kind; reporting can count games vs subjects independently. Kind is **not** a branch in business logic — it's a presentation-layer dimension on an otherwise-flat topic set.

**Inline creation during product create.** Both `topics` and `tags` are admin-managed tables, but the create-product flow must let admins add a new topic or tag **without leaving the form**. The UX reason is practical: admins will routinely want a topic or tag that doesn't yet exist ("Among Us didn't exist as a topic last month; I want to add it and use it"), and forcing a round-trip through a separate admin screen interrupts the create flow. The new row is committed immediately so the topic/tag becomes available to other admins and future products.

- Inline topic creation requires `name` and `kind` (UI: radio or dropdown between "Game" and "Subject").
- Inline tag creation requires `name`; `description` is optional.
- Slugs are auto-derived from the name server-side; uniqueness conflicts surface as a create error with a "did you mean X?" suggestion when a near-match exists.

### 4.5 Billing modes — explicit, no free-by-accident

`products.billing_mode` is a required enum:

```
billing_mode ∈ {
  paid_per_session,   -- consumer clubs: token debit per computed session
  paid_upfront,       -- camps, paid events: one-time token debit at signup
  free,               -- free events (must be chosen explicitly)
  external_contract   -- municipality clubs: no on-platform billing
}
```

`products.price_tokens` is required and `>= 1` when `billing_mode IN ('paid_per_session','paid_upfront')`, and must be `NULL` otherwise. A `CHECK` constraint enforces this. A free product cannot exist by leaving the price field at zero; the admin must affirmatively pick `free` mode. Publishing a `free` product surfaces a confirmation dialog.

**Future concepts** (first-session-free, promo codes, intro discounts) layer on top as orthogonal features, not as mutations of the base price.

**Future: on-platform municipality billing.** For v1, `external_contract` means "we invoice the municipality offline; the platform records no money movement." Eventually we want a school / municipality coordinator to manage seat payments **inside** our system — purchase orders, per-seat pricing, invoices, approvals, usage reporting — without routing through individual parent accounts or Sorg tokens. When this lands it becomes a new billing mode (e.g., `municipality_account`) with its own charge ledger and payer entity (a `municipality_accounts` table with POs, balances, billing contacts), and the current `external_contract` mode is either retired or kept as an "offline invoicing" escape hatch. Design now: avoid hardcoding "municipality = no billing" anywhere — branch on `billing_mode`, not on `product_type`.

### 4.6 Capacity and waitlist

- `products.seat_count` — nullable. `NULL` means uncapped (only valid when `billing_mode = 'free'`). Capacity lives **only** at the product level. Groups have no seat cap — admins balance across groups manually.
- When a participation is requested and seats are full, it becomes `waitlisted` with a `waitlist_position`.
- When an active participant leaves or is removed, the lowest-position waitlisted row is atomically promoted.

All mutations go through `SECURITY DEFINER` RPCs with `SELECT ... FOR UPDATE` row locking on the product and its participations to prevent race conditions during "ticket drops."

### 4.7 Product type as label, not switch

`products.product_type` is a flat enum `{consumer_club, municipality_club, camp, event}`. It is used **for labeling and filtering only**. Business logic branches on the orthogonal fields — `billing_mode`, `schedule` shape, `seat_count`, refund policy — not on `product_type` directly.

Why: adding a 5th product type in the future should be a matter of picking the right combination of orthogonal fields plus a new label, not a fork in the code.

### 4.8 Locations

Keep the existing `locations` hierarchy untouched. Put site-specific fields in an **extension table**, not on `locations` itself — country / region / municipality / district rows have no address, no parking, no wifi info, and should not carry nullable columns that never apply to them.

This mirrors the existing `customer_profiles` / `gamer_profiles` extension of `profiles` (keyed by `user_id` as both PK and FK), which is the idiomatic subtype pattern in this codebase.

```sql
site_details
  location_id    uuid pk, fk → locations.id ON DELETE CASCADE
  address        text
  access_notes   text              -- gate codes, back-entrance directions, parking location
  -- future site-only fields: parking_info, accessibility_features, opening_hours,
  --                          emergency_contact, wifi_ssid, wifi_password, allergen_info, ...
  created_at, updated_at
  -- enforced: row may exist only for locations where type = 'site'
  --           (via trigger on INSERT/UPDATE, or a CHECK calling an immutable function)
```

**Reads:**
- Hierarchy queries (country/region/city tree, substitute matching, regional reporting) read `locations` alone — no join.
- Product detail / directions / access instructions join once: `locations JOIN site_details USING (location_id)`.

**Future extensibility** — parking, accessibility features, opening hours, emergency contact, wifi credentials, allergen information, and any other site-only concerns are additive column changes to `site_details` without polluting the base hierarchy table.

**Scope:** events at libraries, malls, offices, or partner venues are `site`-type locations we don't operate. No separate "venue" concept needed — a "site we operate" vs "site we visit" distinction, if ever required, can be a boolean flag on `site_details` later.

### 4.9 Online and in-person take different slices of the location tree

A product's `location_id` is its **jurisdictional home** in the location hierarchy. Online and in-person pick from disjoint slices of the tree:

- **In-person products** (`is_remote = false`) — `location_id` **must be a `site`**. A site is the physical venue.
- **Online products** (`is_remote = true`) — `location_id` **must be a country, region, or municipality — not a site**. There is no physical venue, so picking a site would be semantically wrong. The chosen jurisdiction is purely a browse / filter anchor.

The parent experience that motivates online's rule: *"I live in Helsinki. I can see a club that's offered by my municipality. That club happens to be online."* The owning municipality captures this cleanly; a site (a building) does not.

How this plays out per product type:

| Product type | Typical online `location_id` | Typical in-person `location_id` |
|---|---|---|
| Consumer club | Region or country for broad online clubs; municipality if it's town-specific | Site |
| Municipality club | The municipality that paid for it | Site within that municipality |
| Camp | Region or country (or municipality if locally scoped) | Site |
| Event | Country for nationwide webinars, municipality for local online demos | Site |

**Browse filtering.** Parents search by their location (e.g., Helsinki). The query matches any product whose `location_id` is at-or-under Helsinki — sites under Helsinki, Helsinki itself, Uusimaa, Finland. An online Helsinki-municipality club (`location_id = helsinki`) surfaces for Helsinki parents. An online Finland-wide event (`location_id = finland`) surfaces for any Finnish parent.

**Admin UX.** The location picker flips between two disjoint modes based on `is_remote`:
- **Site mode** — the tree shows every level; only site rows are pickable; non-site rows expand-on-click so admins can drill down.
- **Jurisdiction mode** — site rows are filtered out of the tree entirely; country / region / municipality rows are pickable. A hover-revealed "Pick" button lets admins commit at any level without drilling further.

The picker auto-clears a stale selection when the admin flips modes (e.g., a region picked while online is cleared when switching to in-person, since the schema won't allow it).

Both modes let the admin create new locations inline (add a region, municipality, or country) — missing infrastructure shouldn't block a product create. Site creation is offered only in site mode, since a newly-created site wouldn't be reachable in jurisdiction mode.

### 4.10 Voice rooms are online-only, and live at the group level

A voice room (Daily.co) exists iff `products.is_remote = true`. In-person products — a camp at a school site, a Pokémon GO walk, a library webinar delivered face-to-face — have no voice room, no Daily.co provisioning, and no voice-room UI elements.

**For online products, rooms are per-group.** Each `product_groups` row in an online product gets its own Daily.co room. This is what makes groups a real subdivision of a product rather than a purely organizational label: Adam's group has its own voice room, Bob's group has its own, and gamers joining the product enter the room belonging to the group they've been placed in.

**Permissions follow the group → product topology:**

- **Gamers** can see and join only the voice room of the group they're assigned to.
- **Gedus** can see and join any voice room on any group within a product, as long as they're assigned to at least one group in that product. This makes the "Adam steps out, Bob covers" flow natural.
- An unassigned participation (gamer in the inbox, not yet placed) has **no** voice room access — the admin must place them into a group first.

**Implications for the schema and code:**

- Room provisioning is keyed on `product_group_id`, not `product_id`. Creating a group in an online product triggers Daily.co room creation (idempotent on the group id). Deleting a group deletes its room.
- Flipping `products.is_remote` from false to true provisions rooms for the product's existing groups. Flipping true to false is disallowed once participations exist.
- Voice-chat RPCs and hooks check `products.is_remote` and the user's group membership (or Gedu-on-product derivation) to decide which rooms are reachable. In-person products short-circuit — no voice room, no error.
- The Gedu dashboard surfaces a "Join voice room" action for every group in an online product they're on. Their own group is highlighted; siblings are reachable but clearly distinct.

### 4.11 Lifecycle status and threshold-triggered start

Products have an explicit lifecycle state. Making it explicit (rather than derived from dates + flags) lets us cleanly support "start when signups reach a threshold" and keeps admin actions like "start now" and "cancel" as first-class RPCs.

```
products.status ∈ {
  draft,      -- admin is still setting up; invisible to parents.
  pending,    -- published, accepting signups, not yet running.
              --   Parents can sign up and hold a seat.
  running,    -- started; sessions are happening.
  completed,  -- past end_date; archive state.
              --   Daily job transitions running → completed once end_date is in the past.
  cancelled   -- admin killed it. Refunds fired for paid_upfront participations.
}
```

`is_visible` stays orthogonal: an admin can temporarily unlist a pending or running product without changing lifecycle state (e.g. "hide while I fix the description").

**Signup threshold — a single mechanism for all four product types.** Add `products.signup_threshold` (nullable int). When set, the product stays in `pending` until admin manually starts it — it does not auto-start when the threshold is met. Instead, admins get a notification ("Tuesday Minecraft has 8 active signups — ready to start"), and can:

- **Start now** once the threshold is met (the common path), or
- **Start under threshold** with a simple confirm dialog ("Start with 7 signups instead of 8?") — admins know their context, and the UI clearly shows the actual count, so no reason dialog is needed, or
- **Wait longer**, indefinitely — there is no automatic cutoff or fail state.

Separately, admins can **cancel** a pending product at any time. For `paid_upfront` products, cancelling auto-refunds all active participations through the existing refund path.

**Why one mechanism is enough for all four types.** Although consumer clubs and camps feel different ("delay start" vs "don't run at all unless enough sign up"), the distinction is not in the schema — it's in admin behavior on the calendar:

- **Consumer club.** No firm start date. Admin waits as long as they want for the threshold to be met; clicks start whenever.
- **Camp, paid event.** Has a concrete target start date. Admin watches signups approach that date and, if the threshold isn't met in time, clicks cancel + refund. If admin wants to run it under threshold, they click start early.
- **Free event.** Same as camp, minus the refund.
- **Municipality club.** Threshold doesn't apply — school calendar fixes the start, and the municipality has already paid regardless of headcount. `signup_threshold IS NULL` on these products.

No deadline-enforcement engine. No product-type branches in the threshold logic. Admin judgment on the calendar substitutes for both.

**Billing behavior during `pending`:**

- `paid_per_session` — no charges accrue (no sessions compute until `running`).
- `paid_upfront` — parents are charged at signup. If the product is later cancelled in `pending`, all active participations are auto-refunded. Parent-facing copy at checkout makes this explicit: "Fully refunded if we can't run this."
- `external_contract` — no platform charges at any time.
- `free` — no charges at any time.

**Implications for other fields:**

- `start_date` becomes **nullable** — a consumer club with a threshold won't know its first session date until admin presses start. Camp / event admins will usually set it at creation time anyway, so it's nullable-in-principle but populated-in-practice.
- CHECK: `status = 'running'` → `start_date IS NOT NULL`. The RPC enforces this before flipping status.
- CHECK: `signup_threshold <= seat_count` when both are set. A threshold that exceeds capacity is a configuration error.

**Parent-facing copy** on a `pending` product with a threshold set: "5 of 8 spots needed to start." Honest about the uncertainty and creates a motivational signup loop without promising a specific start date.

**Admin UX — three start modes selected via radio.** The schema allows any combination of `start_date` and `signup_threshold`, but three named modes cover the real cases and keep the "Create product" form uncluttered:

1. **On a specific date** — `start_date` set, `signup_threshold` null. The product runs on that date regardless of headcount. (The classic case.)
2. **On a specific date, only if enough sign up** — both `start_date` and `signup_threshold` set. Scheduled for the date; cancelled + refunded if the minimum isn't reached by then. Parents see the date *and* a live "X of Y needed" counter.
3. **When enough gamers sign up** — `start_date` null, `signup_threshold` set. No fixed start date yet. Admin picks the date once the threshold is met (via `start_product(..., start_date)`). Parents see only the counter and are told they'll be contacted when ready.

Per-type UX defaults — hide the modes that don't realistically fit the product type, but keep the schema flat:

| Product type | Modes offered |
|---|---|
| Consumer club | all three |
| Camp | 1 and 2 (camps are tied to the calendar) |
| Event | all three |
| Municipality club | 1 only — no radio rendered, just a fixed date |

---

## 5. Data model

### 5.1 Core tables

```sql
-- One row per cohort (was: products × groups)
products
  id                    uuid pk
  product_type          enum('consumer_club','municipality_club','camp','event')
  billing_mode          enum('paid_per_session','paid_upfront','free','external_contract')
  price_tokens          int              -- required when paid_*, null otherwise

  name                  text
  description           text
  topic_id              uuid → topics.id
  min_age               int
  max_age               int
  spoken_language_code  text
  image_path            text
  padlet_url            text             -- optional; shared with families ONLY after
                                          -- they sign up (never on public browse pages)

  location_id           uuid → locations.id  -- site when is_remote=false;
                                              -- country / region / municipality
                                              -- (never a site) when is_remote=true
  is_remote             bool

  status                enum('draft','pending','running','completed','cancelled')
                                          -- lifecycle (§4.11)
  signup_threshold      int              -- nullable; minimum active participations needed
                                          -- before admin starts the product (§4.11)

  start_date            date             -- nullable: known when admin presses Start
  end_date              date             -- nullable (ongoing) for consumer_club only
  timezone              text             -- IANA, e.g. 'Europe/Helsinki'

  seat_count            int              -- nullable (uncapped) — only allowed for 'free' products
  waitlist_enabled      bool             -- default true when seat_count is set

  registration_opens_at timestamptz      -- nullable; 'ticket drop' moment (municipality clubs)
  refund_policy_days    int              -- nullable; days-before-start cutoff for self-refund

  is_visible            bool             -- orthogonal to status; an admin unlist flag
  created_by            uuid → profiles.id
  created_at, updated_at

  -- enforced by CHECK constraints:
  --   billing_mode='paid_per_session'   → product_type='consumer_club', end_date IS NULL OK
  --   billing_mode='external_contract'  → product_type='municipality_club'
  --   billing_mode='free'               → price_tokens IS NULL; seat_count MAY be NULL
  --   billing_mode IN (paid_*)          → price_tokens IS NOT NULL
  --   product_type='event'              → end_date = start_date (one-off; once both are set)
  --   product_type != 'consumer_club'   → end_date IS NOT NULL once status != 'draft'
  --   is_remote=false                   → locations.type = 'site' at location_id
  --   is_remote=true                    → locations.type != 'site' at location_id
  --                                       (country, region, or municipality only —
  --                                        online products have no physical venue)
  --   status = 'running'                → start_date IS NOT NULL
  --   signup_threshold IS NOT NULL
  --     AND seat_count IS NOT NULL      → signup_threshold <= seat_count

schedule_slots
  id                    uuid pk
  product_id            uuid → products.id
  weekday               int              -- 0=Mon..6=Sun
  start_time            time             -- in product's timezone
  duration_minutes      int
  unique(product_id, weekday)
  -- events have 1 row (covering the single date's weekday)
  -- consumer/municipality clubs typically 1 row
  -- camps typically 2-5 rows, possibly different times/durations per day

topics
  id                    uuid pk
  slug                  text unique      -- 'minecraft', 'online-security'
  name                  text
  kind                  enum('game','subject')   -- drives UI grouping only
  description           text
  icon_path             text

tags
  id                    uuid pk
  slug                  text unique      -- 'neurodiversity-friendly', 'competitive'
  name                  text
  description           text

product_tags
  product_id            uuid → products.id
  tag_id                uuid → tags.id
  primary key (product_id, tag_id)
```

### 5.2 Holiday calendars

```sql
holiday_calendars
  id                    uuid pk
  name                  text             -- 'Finnish national holidays', 'Espoo schools'
  timezone              text
  created_at, updated_at

calendar_holidays
  id                    uuid pk
  calendar_id           uuid → holiday_calendars.id
  date                  date
  reason                text
  unique(calendar_id, date)

product_holiday_calendars
  product_id            uuid → products.id
  calendar_id           uuid → holiday_calendars.id
  primary key (product_id, calendar_id)
```

### 5.3 Session overrides (sparse)

```sql
session_overrides
  id                        uuid pk
  product_id                uuid → products.id
  session_date              date             -- date as computed from the schedule
  cancelled                 bool default false
  override_start_time       time             -- rescheduled within the same day
  override_duration_minutes int
  substitute_gedu_id        uuid → profiles.id  -- covering for the primary Gedu
  admin_note                text
  created_by                uuid → profiles.id
  created_at, updated_at
  unique(product_id, session_date)
```

A session exists on a date iff: schedule rules include that date, no linked holiday calendar contains it, AND no override row sets `cancelled=true`. A helper function `product_has_session(product_id, date) → bool` encapsulates this check.

### 5.4 Groups and Gedu assignment

Groups are the admin-facing cohort layer (see §4.1). Gedus attach to groups, not products. The set of Gedus on a product is derived via `DISTINCT gedu_id` across its groups' assignments.

```sql
product_groups
  id                    uuid pk
  product_id            uuid → products.id ON DELETE CASCADE
  name                  text                         -- admin-facing, e.g. "Group A" or "Adam's group"
  created_at, updated_at
  -- voice_room_id / daily_room_name lives here for online products
  -- (populated iff products.is_remote = true for the parent product)
  unique(product_id, name)

gedu_group_assignments
  group_id              uuid → product_groups.id ON DELETE CASCADE
  gedu_id               uuid → profiles.id
  assigned_at           timestamptz
  primary key (group_id, gedu_id)
```

No `role` column on assignments — a Gedu is just "on this group". Cross-group voice mobility within a product (§4.10) is enforced by the voice-chat permission check walking group → product → sibling groups, not by a table-level role.

Substitute coverage for a specific date is **not** an assignment — it's a `session_overrides.substitute_gedu_id` value for that date.

**Changes from today's `product_groups` table.** The current schema has `product_groups` with `gedu_id` as a column (one-Gedu-per-group, no name). The redesign changes two things:

- **`name` is new and required.** Today's groups are anonymous — the admin UI shows them as "Group 1 / Group 2" by index. The redesign adds a human-meaningful name (e.g. "Adam's group", "Tuesday 17:00 A", "Beginners") so admins can refer to groups unambiguously across rosters, dashboards, and conversations. The add-product and group-management UIs expose this as an editable field and default it to "Group A / B / C…" for new rows.
- **Gedus move out to a separate join table.** `product_groups.gedu_id` is dropped; many-to-many goes through `gedu_group_assignments`. A group can now have 0, 1, or many Gedus, and a Gedu can be on multiple groups in the same product. This is what enables cross-group voice mobility (§4.10) and "empty group, Gedus TBD" (§4.1).

### 5.5 Participations

```sql
participations
  id                    uuid pk
  product_id            uuid → products.id
  group_id              uuid → product_groups.id    -- nullable: NULL = unassigned inbox
  gamer_id              uuid → profiles.id
  customer_id           uuid → profiles.id          -- the parent who signed up the gamer
  status                enum('active','waitlisted','cancelled','completed','removed')
  waitlist_position     int                         -- populated iff status='waitlisted'
  signed_up_at          timestamptz
  cancelled_at          timestamptz
  cancel_reason         text                        -- 'customer_cancelled','admin_removed','attendance_removed'
  unique(product_id, gamer_id)                      -- one participation per gamer per product
  -- CHECK: group_id's product_id (if set) must match this row's product_id
```

`group_id IS NULL` is the "unassigned inbox" state — a real first-class state, not a special group row. The drag-and-drop UI renders this as a dedicated column; admins move gamers from the inbox into an actual group. Deleting a group (admin action) resets its participations to `group_id = NULL` (re-enters the inbox); we don't want to lose the participations themselves.

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
  -- trigger: reject INSERT/UPDATE when product_has_session(product_id, session_date) is false

session_notes
  id                    uuid pk
  product_id            uuid → products.id
  session_date          date
  author_id             uuid → profiles.id    -- typically the Gedu
  content               text
  visibility            enum('gedu_only','admin','participants')
  created_at, updated_at
  -- trigger: same validity check
```

### 5.7 Token charges

Replaces `enrollment_charges` with a unified table that covers all three paid billing paths.

```sql
token_charges
  id                        uuid pk
  participation_id          uuid → participations.id
  product_id                uuid → products.id          -- denormalized for reporting
  gamer_id                  uuid → profiles.id          -- denormalized
  customer_id               uuid → profiles.id          -- denormalized
  kind                      enum('per_session','upfront')
  session_date              date                        -- populated iff kind='per_session'
  amount_tokens             int                         -- positive = debit, negative = refund
  reason                    enum('charge','refund_within_window','refund_admin','refund_cancel')
  stripe_idempotency_key    text                        -- for reconciliation
  created_at
  unique(participation_id, kind, session_date)          -- prevents double-charging a session
```

Per-session charges are driven by the existing weekly cron (now reading from `participations` with `billing_mode='paid_per_session'`). Upfront charges happen synchronously during signup RPC.

---

## 6. RPCs

All `SECURITY DEFINER`, private by default, row-locking where financial.

### 6.1 Participation lifecycle

- **`create_participation(product_id, gamer_id, customer_id)`**
  Validates age/language match, checks `registration_opens_at`, locks product + participation rows, decides `active` vs `waitlisted` based on `seat_count` and current counts. New participations start with `group_id = NULL` (unassigned inbox); admins place them into a group later. For `paid_upfront`: synchronously debits tokens and writes `token_charges`. For `paid_per_session`: no charge yet. For `external_contract` / `free`: no charge.

- **`cancel_participation(participation_id, reason)`**
  Transitions to `cancelled`. If product was `paid_upfront` and cancellation is before `start_date - refund_policy_days`: refund through `token_charges`. If `paid_per_session`: refund any future session charges in window. Promotes lowest waitlist position if vacated seat was `active`.

- **`admin_remove_participation(participation_id, reason)`**
  Admin-initiated removal, same downstream behavior; sets `cancel_reason='admin_removed'`.

- **`promote_from_waitlist(product_id)`**
  Internal helper, called by the two above.

### 6.1a Group mutations

Keep the existing `commit_group_changes` RPC (see `docs/groups-architecture.md`) as the sole write path for `product_groups`, `gedu_group_assignments`, and `participations.group_id`. All admin edits — create/rename/delete group, assign/unassign Gedu, move gamer between groups, move gamer from inbox into group — go through this RPC atomically. It already handles the drag-and-drop UI mutations; extending it for the inbox column is additive.

### 6.2 Session-level operations

- **`cancel_session(product_id, session_date, reason)`** — upserts `session_overrides` with `cancelled=true`.
- **`reschedule_session(product_id, session_date, new_start_time, new_duration_minutes)`** — upserts override.
- **`assign_substitute(product_id, session_date, gedu_id)`** — upserts override.
- **`record_attendance(product_id, session_date, gamer_id, status)`** — validates against `product_has_session`.

### 6.3 Weekly charge cron

`process_session_charges()` runs daily. Finds all `participations` with `status='active'` on products where `billing_mode='paid_per_session'`. For each, for each computed session date since the last charge, writes a `token_charges` row with `kind='per_session'`. Idempotent on `(participation_id, kind, session_date)`.

### 6.4 Lifecycle transitions (§4.11)

- **`start_product(product_id, start_date)`** — admin-initiated. Requires `status = 'pending'`. Validates `start_date IS NOT NULL` (either passed in or already on the row). Transitions to `running`. Does **not** check `signup_threshold` — the admin is explicitly overriding when they click Start. If no charges have run yet for `paid_per_session` products, this is when the weekly cron begins picking them up.
- **`cancel_product(product_id, reason)`** — admin-initiated. Valid from `draft`, `pending`, or `running`. Transitions to `cancelled`. For `paid_upfront` products with `active` participations, fires refunds through the existing `token_charges` refund path. Waitlisted participations are marked cancelled without any charge motion.
- **`finalize_completed_products()`** — daily job. Transitions `running → completed` for any product whose `end_date` has passed.

### 6.5 Retired

- `unenroll_gamer` — folded into `cancel_participation`.
- `process_enrollment_charges` — replaced by `process_session_charges`.

`commit_group_changes` is **kept** — groups are retained for all product types (§4.1).

---

## 7. Parent browse UX

### 7.1 Unified "what does SoG offer?" page

One public page, filterable by:

1. Age of child
2. Location (online / proximity to site)
3. Spoken language
4. Product type (club / camp / event)
5. Topic
6. Tags (chill, competitive, neurodiversity-friendly, …)
7. Schedule (weekday preference, time-of-day)
8. Price (free / paid)

### 7.2 Parents see products, not groups

Cohort subdivision within a single schedule is handled by Gedu Groups, which are invisible to parents (§4.1). A product with 3 groups × 25 seats each shows to the parent as a single product with 75 seats. Parents pick the product; admins decide which group the gamer ends up in.

Products with genuinely different attributes (different weekday, different start time, different site) are still separate products, and the browse UI renders them as separate cards. No cohort picker, no heuristic grouping layer — the group layer inside a product is strictly an admin concern.

### 7.3 Per-product-type landing pages

Each of the four product types also has a filtered view (`/clubs`, `/municipality-clubs`, `/camps`, `/events`) for marketing / direct links. Each is just the unified page with the `product_type` filter pre-applied.

### 7.4 Location-first discovery (entry point for municipality-club parents)

For municipality clubs specifically, parents rarely browse "all clubs in Finland" — they want clubs offered by **their municipality** (usually because their school has announced one). The public entry point therefore supports a location-first search flow:

- A search / browse page that matches against the `locations` tree by name across all levels. Typing "Ressu" resolves to a school site; "Helsinki" to the municipality; "Uusimaa" to the region. All three navigate to the same kind of "products at-or-under this location" page, just anchored at different levels of the tree.
- **Default browse order: municipality rows first.** When there is no query, surface municipalities before sites or regions — "what most parents are looking for."
- **Search result sort: municipality > site > region.** When the parent has typed something, keep municipalities at the top within matches, then sites, then regions.
- Only locations that have at least one in-scope product at-or-under them appear in the list. Empty locations never surface.

The **location page** (`/registration/[locationSlug]` in the mockup) lists every product whose `location_id` is at-or-under the anchor location, with breadcrumb ancestors shown for context (e.g., "Uusimaa" above "Helsinki"). This page is the one a school announcement would link directly to.

This flow is municipality-first because that's the case the mockup was built for, but nothing about it is hard-wired to `product_type = 'municipality_club'`. Any product whose `location_id` is under the anchor qualifies — a Helsinki-scoped consumer club or a Helsinki camp would show on the Helsinki page too. `/registration` is one entry point among several; the unified `/browse` (§7.1) is the other.

### 7.5 Registration timing and ticket-drop UX

The "ticket drop" countdown was specifically validated by the product team during mockup review — they compared it favorably to the Taylor-Swift-concert-tickets experience. Treat the countdown as a required part of the municipality-club flow, not a nice-to-have.

For products with `registration_opens_at` set (required for municipality clubs, optional for camps and events), the detail page renders three distinct states:

1. **Pre-open** — `now < registration_opens_at`. The signup form is present but disabled, with a **live countdown** to the open moment. Parents see "Opens in 2 days 14:32:08" or similar, updating in place. The form is pre-populated where possible (gamer picker, rules checkbox) so that opening moment is a one-click submit. Show an authoritative "server time" indicator near the countdown so parents understand the countdown is not client-drifted.
2. **Open** — `registration_opens_at ≤ now`, seats available. Form is enabled, submits `create_participation`.
3. **Closed / waitlist** — seats are full. Form posts to the waitlist lane (if `waitlist_enabled`); otherwise it's read-only with a "full" indicator.

**Layout stability across state transitions.** The pre-open → open flip happens without user interaction, so interactive elements (submit button, gamer picker, rules checkbox) must **not shift position** when the countdown collapses to "Open now." Keep the countdown region a reserved height; fade the state transition rather than reflowing. Same rule for form state — don't reset gamer/checkbox selections across the flip. (This is the project-wide layout-stability rule from `CLAUDE.md`.)

### 7.6 Parent-visible product detail

On a product detail page the parent sees, in addition to the basics (name, description, image, Gedu(s), schedule):

- **Seat state** — e.g. "8 of 10 seats · 3 on waitlist." Make the waitlist count honest: parents should know what they're getting into before clicking Register.
- **Schedule, with skipped dates surfaced.** Upcoming session dates are computed from `schedule_slots` minus subscribed holiday calendars minus `session_overrides.cancelled=true`. Any skipped dates in the computed window should be visible ("No session on Dec 24, Dec 31 — Christmas break") so parents can plan.
- **Venue detail for in-person products** — the site's name plus any `site_details.access_notes` content (e.g., "Room 204, second floor · entrance via back door after 5pm"). There is no separate `venue_name` free-text field on products; room-level specificity lives in `access_notes`.
- **Threshold status** when a threshold is set (§4.11) — "5 of 8 signups needed to start" on pending products.
- **Post-signup confirmation page** — confirms seat vs. waitlist, shows waitlist position if applicable (e.g., "#3 on the waitlist"), surfaces the padlet URL (§5.1), and echoes the first session date.

---

## 8. Admin UX

- Single **"Create product"** form with a product type selector. Form reveals/hides fields based on selection (`end_date` required except for consumer clubs; `registration_opens_at` prominent for municipality; `schedule_slots` repeater for camps; etc.). The form also lets admins optionally pre-create **0 or more Gedu Groups**, each with **0 or more Gedus** — see §4.1. The typical flow is to create the product with zero groups and add them later once demand is known.
- **Product management page** per product has a **Groups panel** with:
  - An "Unassigned" column (participations with `group_id = NULL`) acting as an inbox.
  - One column per group, showing its name, assigned Gedus, and placed participations.
  - Drag-and-drop (existing UI) for moving gamers between inbox ↔ groups, and between groups.
  - Add/rename/delete group controls; add/remove Gedu controls per group.
- **Gedu picker** (used when assigning a Gedu to a group, here and in the create-product form) must support search by name/email/bio and a language filter sourced from `profiles.spoken_languages`. With ~30+ Gedus in the system, a flat dropdown is unusable — admins filter to "Gedus who speak Swedish" when assigning to a Swedish-language club.
- **Calendar view** per product shows computed sessions with overrides applied; admins can cancel/reschedule/assign substitutes directly from the calendar.
- **Holiday calendar management** is a separate admin screen; products subscribe via a multi-select.
- **Lifecycle actions** on each pending product: "Start product" (with confirm dialog if under threshold) and "Cancel product" (auto-refunds for `paid_upfront`). Admin home highlights threshold-hit notifications — "Tuesday Minecraft has 8 signups — ready to start" — so admins aren't polling every product page.

---

## 9. Migration from current schema

Staging only. No real-customer data to preserve. The migration is a **cutover** with a human-readable archive of the old data so any existing products we care about can be manually re-created under the new schema.

1. **Archive the current product domain** to a plaintext snapshot before any drop:
   - One file per dropped table: `archive/pre-redesign/{products,product_groups,group_enrollments,enrollment_charges,games}.txt` (path git-ignored if PII is a concern; see below).
   - Format: human-readable — one record per block, `key: value` lines, blank line between records. Easier to read and to copy values from than raw SQL dumps. A raw `.sql` dump (via `pg_dump --data-only`) is written alongside for completeness.
   - Include joined context where useful — e.g., each `group_enrollments` row gets its product name and gamer username inline so the archive is legible without cross-referencing other files.
   - PII note: if archives may contain customer emails, gamer usernames, or other identifying data, write them to a git-ignored `archive/` directory locally or to a private location rather than committing them. Add `archive/` to `.gitignore` before running the export.
   - Intent: the archive exists so a product manager or admin can look through the list of what was there and decide which clubs are worth re-creating by hand under the new schema. It is **not** an automated migration source.
2. Drop the current `products`, `product_groups`, `group_enrollments`, `enrollment_charges` tables (and their RPCs), plus `games` if present.
3. Apply the new migration set (tables from §5, RPCs from §6).
4. Re-seed staging with representative data covering all four product types.
5. Retire `docs/school-clubs-design.md` (content folded here).
6. Rename relevant React Query key factories, service classes, and URL paths to generic terms (`participationsKeys`, `ProductsService`, etc.).
7. Admins manually re-create any archived products worth keeping, using the new create-product flow. The archive is the reference; no scripted import.

If/when this ships and real customer data exists, a proper scripted backfill is required — out of scope for this doc.

### 9.1 The DROPs must be a dedicated migration file, not hand-run SQL

The wipe-and-recreate pattern has a specific failure mode that has burned backend teams before: the redesign works flawlessly on staging because staging was already reset to empty, but the first prod deploy fails because prod still has the old tables sitting around, colliding with the new `CREATE` statements.

**The rule:** every drop of an old object goes into a dedicated migration file committed with the redesign. Approximately:

```
supabase/migrations/
  <ts>_drop_legacy_product_domain.sql   -- explicit DROPs for every retired object
  <ts>_create_new_product_domain.sql    -- CREATEs for §5 tables
  <ts>_create_new_product_rpcs.sql      -- RPCs from §6
  <ts>_seed_new_product_domain.sql      -- optional re-seed (staging only, gated)
```

That way prod and staging apply the exact same sequence, deterministically: drop the old, create the new, re-seed if applicable. No hand-run SQL, no `supabase db reset` as a substitute for real migration files, no "oh we also need to run this one command" checklist entries at cutover.

**Before prod push**, dry-run the migration sequence against a **clone of prod's current schema** — not against an already-empty staging. A prod-clone dry-run is the only way to verify the DROP targets match what's actually in prod, and that nothing unexpected breaks (RLS policy ordering, FK cascade depth, function signature mismatches, etc.).

**Rationale for including the DROPs as migration history** rather than, say, adding `DROP IF EXISTS` guards to each CREATE: a dedicated drop migration keeps concerns separate (create migrations create; drop migrations drop), reads cleanly, and surfaces exactly what's retired in one place. Scattered `IF EXISTS` guards accumulate as noise and make create migrations harder to audit.

---

## 10. Phased plan

### Phase 1 — MVP (consumer + municipality)

Prove the unified shape against the two product lines we actually have users for (or are closest to having).

- Schema: all tables from §5.
- RPCs: participation lifecycle, session operations, weekly charge cron.
- Admin UI: create/edit product; Groups panel (inbox + per-group columns, drag-and-drop, Gedu assignment per group); calendar view; holiday-calendar management.
- Parent UI: unified browse page with all filters; cohort-grouped cards; per-product detail page with signup form.
- Migrate current consumer club data into the new shape (staging reset).
- Notifications: email + WhatsApp for waitlist → active promotion (reuse existing pipeline).

### Phase 2 — camps and events

- Multi-day schedule slots with per-day timing.
- Upfront token debit path with refund window.
- One-off event type with optional uncapped seats.
- Public event calendar view.

### Phase 3 — operational & reporting

- Attendance-driven participation removal (policy + admin review).
- Substitute-Gedu finder (suggest candidates when primary cancels).
- Municipality reporting dashboards (attendance, retention, per-cohort outcomes).
- Term / season templates (clone a whole semester forward).
- Sibling multi-gamer signup flow.
- First-session-free and discount / promo code concepts.

### Phase 4 — on-platform municipality billing

For v1, municipality invoicing is fully offline. The longer-term goal is to let a school or municipality coordinator manage seat payments inside our system: create and fund a municipality account, approve per-seat pricing, view invoices, pull usage reports — without routing through individual parent token balances.

Scope when this lands:
- New `municipality_accounts` entity (payer, billing contact, PO numbers, balance / credit line).
- New `billing_mode = 'municipality_account'` that debits the municipality account per seat (or per session, depending on contract terms).
- Coordinator role (or extension of admin) with dashboards for their municipality's clubs, rosters, and invoices.
- Invoice generation, Stripe (or equivalent) integration for business payments.
- The existing `external_contract` mode either retires or stays as the "offline invoicing" escape hatch for special-case contracts.

Designed for now by avoiding `product_type = 'municipality_club'` as a switch anywhere billing decisions are made — all billing logic branches on `billing_mode`, which keeps this upgrade path open.

### Phase 5 — gated access (if needed)

Only if and when the business requires it:
- School-code gating for municipality clubs (parent enters a code to unlock a school's club list).
- Private beta / invite-only for specific municipalities.
- Regional / country-level locking.

Deferred from v1 because the customer base is small and trusted; gating adds schema and UI complexity that isn't paying for itself yet.

---

## 11. Open questions

- **Single-group auto-assign.** When a product has exactly one group, should `create_participation` auto-assign the new participation into it (skip the inbox)? Cleanest for events that are "always one group by definition", but it's a special case, and we'd probably want a "move all unassigned to Group X" shortcut anyway for the case where the admin *later* decides a product only needs one group. Defer deciding until we see how the inbox feels in real use.
- **Unassigned inbox notifications.** Gamers should not sit in the inbox for long. Future phase: in-app notifications, WhatsApp / email nudges to admins (and maybe Gedus) when the inbox has been non-empty for N hours.
- **Attendance → removal policy.** What's the N-unexcused-absences threshold that flags a participation for admin review? Who approves removal? Is there an appeal path? Defer until attendance tracking ships.
- **Per-session charges and DST / tz edge cases.** When a camp crosses a DST boundary, does the session that "would have been" at 17:00 local still bill at the same token amount? (Probably yes — billing is per-session, not per-hour.)
- **Event account requirement for truly free events.** We require an account for all participations (v1 simplification). If friction is too high for casual events like mall demos, consider a magic-link + gamer-only capture flow.
- **Topic taxonomy depth.** Will "Minecraft" ever need sub-topics (Minecraft — Survival, Minecraft — Redstone)? If so, add `topics.parent_id`. Not needed until it is.
- **Calendar view as a first-class parent feature.** A parent viewing "everything my kids are doing this week" across multiple products is obvious v2 UX. Design the calendar data layer (per-gamer session query) to support this even if we don't ship the UI in phase 1.

---

## 12. Appendix

### 12.1 Cross-references

- Groups & `commit_group_changes` (**kept and generalized to every product type under this redesign — see §4.1**): `docs/groups-architecture.md`
- Current consumer billing (**replaced by §5.7 + §6.3**): `docs/customer-enrollment-architecture.md`
- Location hierarchy & site binding: `docs/locations-architecture.md`
- Voice-room wiring for online products: `docs/voice-chat-architecture.md`
- Token mechanics (`adjust_token_balance`): `docs/sorg-token-architecture.md`
- Email pipeline for notifications: `docs/email-architecture.md`
- WhatsApp notification channel: `docs/whatsapp-automated-flow.md`

### 12.2 Mockup lineage

Two UX mockups live on the `feature/school-clubs-mockup` branch and informed this design:

- **Parent registration mockup** at `/registration` — originally from the superseded `school-clubs-design.md`, modeling the municipality-club flow. Covers location-first discovery, ticket-drop countdown, one-click registration, and waitlist confirmation. Its business-rule implications are captured in §7.4–§7.6.
- **Admin create-product mockup** at `/admin-mockup/products/new` — built alongside this redesign, covering all four product types. Covers the location picker (dual site/jurisdiction modes), Gedu picker with language filter, group cards, billing-mode chooser, three-mode start trigger, and registration timing. Its business-rule implications are captured throughout §4, §5, §7, and §8.

Both mockups are sketches, not implementations (see the "How to use this document" note at the top). When this redesign lands, they are either promoted (copy, flow shape, component ideas reused) or retired — see §7.4 for the location-first entry point specifically.

### 12.3 Why we kept Gedu Groups (and generalized them to every product type)

An earlier version of this doc retired `product_groups` in favor of cloning whole products. Product-team feedback pushed back: groups are the right abstraction for admins organizing who-runs-what-with-whom inside a product, and they should apply to all four product types, not just consumer clubs.

What kept groups is:

- **Demand is often unknown up-front.** An admin advertises a camp with 100 seats and waits to see how many sell. Deciding on 1, 3, or 4 groups *after* 75 people bought in is a better workflow than pre-committing to a subdivision. Groups let the admin decide later without restructuring the product.
- **The "Bob covers for Adam" use case works naturally.** Gedus cross-hop voice rooms within a product (§4.10) via group membership, without needing a new flat product-level Gedu list.
- **Existing drag-and-drop already works.** The current admin UI for moving gamers between groups is real and good; retiring groups would have thrown it out and re-built a worse version. Extending it with an inbox column is cheap.

What made generalizing them safe:

- **Parents don't see groups.** The abstraction's cost is entirely admin-facing. Parents still see one product, one seat count, one signup button.
- **Capacity stays product-level.** Groups don't introduce a second place to reason about "how many seats are left." Admins balance manually; no per-group waitlists, no per-group overflow logic.
- **Events are forgiving.** An event with a single group and no subdivision is the degenerate case — the group UI shrinks to a single column and gets out of the way.
