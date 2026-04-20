# Products Redesign — Unifying Clubs, Camps, and Events

Forward-looking architecture proposal that redesigns the `products` domain to cleanly support **four product types**: consumer clubs, municipality clubs, summer camps, and events. Not yet implemented.

Status: **design / pre-implementation**. Supersedes `school-clubs-design.md`. Rename to `products-architecture.md` when this ships.

Related: `groups-architecture.md`, `customer-enrollment-architecture.md`, `locations-architecture.md`, `voice-chat-architecture.md`, `email-architecture.md`, `sorg-token-architecture.md`, `whatsapp-automated-flow.md`.

---

## 1. Why redesign

Today's `products` schema is built for a single product line — weekly consumer clubs paid in Sorg tokens. A `product_groups` layer exists to absorb elastic demand (add groups → add capacity), and `group_enrollments` + `enrollment_charges` drive per-session billing.

Now we are adding three more product types. Trying to extend the existing shape with discriminator columns would leak concepts across product lines and force every RPC to branch on type. This document proposes a ground-up reshape of the products domain that accepts all four types as first-class citizens with minimal branching.

Because all current data is staging-only, the migration is a **greenfield cutover**: new schema replaces old, no backfill concerns.

---

## 2. The four product types

| | **Consumer club** | **Municipality club** | **Summer camp** | **Event** |
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
| Summer camp | **Sign up** |
| Event | **Join** |

These are copy choices that reflect how each product feels to a parent. They do **not** propagate into the schema, query keys, RPC names, or URLs.

### Schema noun

The database uses **one** generic noun for the participation record: **`participations`**. A `participation` is a gamer's seat (or waitlist spot) on a product, regardless of product type. UI verbs are a presentation concern.

This replaces today's `group_enrollments` and the `school_registrations` that `school-clubs-design.md` proposed. One table, one concept, one set of RPCs.

---

## 4. Key design decisions

### 4.1 One product = one cohort = 1+ Gedus

The `product_groups` layer is retired. Each product row represents a single cohort: one capacity, one set of participations, one primary Gedu, optional assistant Gedu(s), and — when `is_remote = true` — one voice room. In-person products (camps at a site, library events, etc.) have no voice room at all.

**When a club needs parallel cohorts** (e.g., 3 × Tuesday-17:00 Minecraft, each with a different Gedu), admins use a **Clone** action to create a sibling product row. The cohorts are separate products with their own participations.

**Why this is worth retiring groups:**

- Solves the "Bob helps out in Adam's online club" problem — today, only Adam can be in Adam's voice room because assignments are on the group. Under the new model, `product_gedu_assignments` lets both Bob and Adam be assigned to the same product.
- Attendance, notes, charges, voice rooms (when present), and Gedu dashboards all hang off `product_id` directly. No cross-group aggregation.
- Municipality / camp / event products naturally fit: they always have exactly one cohort.
- Consumer clubs fit too, with cloning substituting for the old "add a group" flow.

**Parent-facing grouping of parallel cohorts is heuristic** for v1. The browse UI groups products matching on `(topic_id, weekday_set, start_time, duration, location_id, age_range, spoken_language, billing_mode)`. Admin keeps the shared fields in sync manually. If heuristic grouping breaks down, we add a `product_series` parent table later — the cohorts-are-products shape doesn't preclude it.

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

- `products.seat_count` — nullable. `NULL` means uncapped (only valid when `billing_mode = 'free'`).
- When a participation is requested and seats are full, it becomes `waitlisted` with a `waitlist_position`.
- When an active participant leaves or is removed, the lowest-position waitlisted row is atomically promoted.

All mutations go through `SECURITY DEFINER` RPCs with `SELECT ... FOR UPDATE` row locking on the product and its participations to prevent race conditions during "ticket drops."

### 4.7 Product type as label, not switch

`products.product_type` is a flat enum `{consumer_club, municipality_club, summer_camp, event}`. It is used **for labeling and filtering only**. Business logic branches on the orthogonal fields — `billing_mode`, `schedule` shape, `seat_count`, refund policy — not on `product_type` directly.

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

### 4.9 Online products still have a location — just not a site

A product's `location_id` is its **jurisdictional home** in the hierarchy, not necessarily a physical venue:

- **In-person products** (`is_remote = false`) — `location_id` must be a `site`. This is the venue.
- **Online products** (`is_remote = true`) — `location_id` can be any level: country, region, municipality, or site. There is no physical venue; this is purely a browse / filter anchor.

The parent experience that motivates this: *"I live in Helsinki. I can see a club that's offered by my municipality. That club happens to be online."* Without a non-site `location_id`, an online municipality club has no natural home in the tree — the municipality paid for it, but it isn't hosted at any one school. Forcing a site pick would be arbitrary and wrong.

How this plays out per product type:

| Product type | Typical online `location_id` | Typical in-person `location_id` |
|---|---|---|
| Consumer club | Any level — usually a region or country for broad online clubs | Site |
| Municipality club | The municipality that paid for it | Site within that municipality |
| Summer camp | Same as consumer clubs | Site |
| Event | Any level — country for nationwide webinars, site for local demos | Site |

**Browse filtering.** Parents search by their location (e.g., Helsinki). The query matches any product whose `location_id` is at-or-under Helsinki — sites under Helsinki, Helsinki itself, Uusimaa, Finland. An online Helsinki-municipality club (`location_id = helsinki`) appears when the parent filters by Helsinki. An online Finland-wide event (`location_id = finland`) appears for any Finnish parent.

**Admin UX.** The location picker's pickability mode flips with `is_remote`: when in-person, only sites are selectable; when online, any level is. The in-person mode also lets the admin create a new site under a municipality inline — site creation does not live on the product page in the real admin, but the inline affordance avoids a context switch mid-form.

### 4.10 Voice rooms are online-only

A voice room (Daily.co) exists iff `products.is_remote = true`. In-person products — a summer camp at a school site, a Pokémon GO walk, a library webinar delivered face-to-face — have no voice room, no Daily.co provisioning, and no voice-room UI elements.

**Implications for the schema and code:**

- A `product_voice_rooms` table (or equivalent wiring to Daily.co room IDs) is populated **only** for online products. Reading voice-room state for an in-person product returns nothing — not an error, just absence.
- Voice-chat RPCs, hooks, and UI panels check `products.is_remote` and short-circuit for in-person products rather than treating "no voice room" as a failure mode.
- The Gedu dashboard surfaces a "Join voice room" action only when the product they're viewing is online.
- Provisioning: creating an online product triggers Daily.co room creation (idempotent on `product_id`). Flipping `is_remote` from false to true on an existing product is a rare admin action that provisions a room lazily; flipping true to false is disallowed once participations exist (ambiguous what the in-person location would be).

---

## 5. Data model

### 5.1 Core tables

```sql
-- One row per cohort (was: products × groups)
products
  id                    uuid pk
  product_type          enum('consumer_club','municipality_club','summer_camp','event')
  billing_mode          enum('paid_per_session','paid_upfront','free','external_contract')
  price_tokens          int              -- required when paid_*, null otherwise

  name                  text
  description           text
  topic_id              uuid → topics.id
  min_age               int
  max_age               int
  spoken_language_code  text
  image_path            text
  padlet_url            text

  location_id           uuid → locations.id  -- site when is_remote=false;
                                              -- any level when is_remote=true
  is_remote             bool

  start_date            date             -- first calendar date the product runs
  end_date              date             -- nullable (ongoing) for consumer_club only
  timezone              text             -- IANA, e.g. 'Europe/Helsinki'

  seat_count            int              -- nullable (uncapped) — only allowed for 'free' products
  waitlist_enabled      bool             -- default true when seat_count is set

  registration_opens_at timestamptz      -- nullable; 'ticket drop' moment (municipality clubs)
  refund_policy_days    int              -- nullable; days-before-start cutoff for self-refund

  is_visible            bool
  created_by            uuid → profiles.id
  created_at, updated_at

  -- enforced by CHECK constraints:
  --   billing_mode='paid_per_session'   → product_type='consumer_club', end_date IS NULL OK
  --   billing_mode='external_contract'  → product_type='municipality_club'
  --   billing_mode='free'               → price_tokens IS NULL; seat_count MAY be NULL
  --   billing_mode IN (paid_*)          → price_tokens IS NOT NULL
  --   product_type='event'              → end_date = start_date (one-off)
  --   product_type != 'consumer_club'   → end_date IS NOT NULL
  --   is_remote=false                   → locations.type = 'site' at location_id
  --   (is_remote=true permits any level — site, municipality, region, country)

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

### 5.4 Gedu assignment

```sql
product_gedu_assignments
  product_id            uuid → products.id
  gedu_id               uuid → profiles.id
  role                  enum('primary','assistant')
  assigned_at           timestamptz
  primary key (product_id, gedu_id)
  -- CHECK: at most one row per product with role='primary'
```

Substitute coverage for a specific date is **not** an assignment — it's a `session_overrides.substitute_gedu_id` value for that date.

### 5.5 Participations

```sql
participations
  id                    uuid pk
  product_id            uuid → products.id
  gamer_id              uuid → profiles.id
  customer_id           uuid → profiles.id     -- the parent who signed up the gamer
  status                enum('active','waitlisted','cancelled','completed','removed')
  waitlist_position     int                    -- populated iff status='waitlisted'
  signed_up_at          timestamptz
  cancelled_at          timestamptz
  cancel_reason         text                   -- 'customer_cancelled','admin_removed','attendance_removed'
  unique(product_id, gamer_id)                 -- one participation per gamer per product
```

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
  Validates age/language match, checks `registration_opens_at`, locks product + participation rows, decides `active` vs `waitlisted` based on `seat_count` and current counts. For `paid_upfront`: synchronously debits tokens and writes `token_charges`. For `paid_per_session`: no charge yet. For `external_contract` / `free`: no charge.

- **`cancel_participation(participation_id, reason)`**
  Transitions to `cancelled`. If product was `paid_upfront` and cancellation is before `start_date - refund_policy_days`: refund through `token_charges`. If `paid_per_session`: refund any future session charges in window. Promotes lowest waitlist position if vacated seat was `active`.

- **`admin_remove_participation(participation_id, reason)`**
  Admin-initiated removal, same downstream behavior; sets `cancel_reason='admin_removed'`.

- **`promote_from_waitlist(product_id)`**
  Internal helper, called by the two above.

### 6.2 Session-level operations

- **`cancel_session(product_id, session_date, reason)`** — upserts `session_overrides` with `cancelled=true`.
- **`reschedule_session(product_id, session_date, new_start_time, new_duration_minutes)`** — upserts override.
- **`assign_substitute(product_id, session_date, gedu_id)`** — upserts override.
- **`record_attendance(product_id, session_date, gamer_id, status)`** — validates against `product_has_session`.

### 6.3 Weekly charge cron

`process_session_charges()` runs daily. Finds all `participations` with `status='active'` on products where `billing_mode='paid_per_session'`. For each, for each computed session date since the last charge, writes a `token_charges` row with `kind='per_session'`. Idempotent on `(participation_id, kind, session_date)`.

### 6.4 Retired

- `commit_group_changes` — groups are gone.
- `unenroll_gamer` — folded into `cancel_participation`.
- `process_enrollment_charges` — replaced by `process_session_charges`.

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

### 7.2 Parallel-cohort grouping

Products matching on the heuristic key `(topic_id, weekday_set, start_time, duration, location_id, age_range, spoken_language, billing_mode)` render as a single card ("Tuesdays 17:00 Minecraft at Tapiola — 3 cohorts available"). Clicking through shows cohort picker (Gedu name, remaining seats) or auto-assigns if the parent doesn't care.

If admins diverge on any grouping field, the products split into separate cards.

### 7.3 Per-product-type landing pages

Each of the four product types also has a filtered view (`/clubs`, `/municipality-clubs`, `/camps`, `/events`) for marketing / direct links. Each is just the unified page with the `product_type` filter pre-applied.

---

## 8. Admin UX

- Single **"Create product"** form with a product type selector. Form reveals/hides fields based on selection (`end_date` required except for consumer clubs; `registration_opens_at` prominent for municipality; `schedule_slots` repeater for camps; etc.).
- **Clone** action on any product creates a new row with the same content and a prompt to pick the Gedu and tweak capacity.
- **Gedu assignment** panel lets admins add primary + assistants per product.
- **Calendar view** per product shows computed sessions with overrides applied; admins can cancel/reschedule/assign substitutes directly from the calendar.
- **Holiday calendar management** is a separate admin screen; products subscribe via a multi-select.

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

---

## 10. Phased plan

### Phase 1 — MVP (consumer + municipality)

Prove the unified shape against the two product lines we actually have users for (or are closest to having).

- Schema: all tables from §5.
- RPCs: participation lifecycle, session operations, weekly charge cron.
- Admin UI: create/edit/clone product; Gedu assignment; calendar view; holiday-calendar management.
- Parent UI: unified browse page with all filters; cohort-grouped cards; per-product detail page with signup form.
- Migrate current consumer club data into the new shape (staging reset).
- Notifications: email + WhatsApp for waitlist → active promotion (reuse existing pipeline).

### Phase 2 — summer camps and events

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

- **Series table.** If the heuristic grouping of parallel cohorts is painful to maintain (shared descriptions drift, admins forget to keep them in sync), introduce `product_series` as an optional parent row. Not worth the schema cost up front.
- **Attendance → removal policy.** What's the N-unexcused-absences threshold that flags a participation for admin review? Who approves removal? Is there an appeal path? Defer until attendance tracking ships.
- **Per-session charges and DST / tz edge cases.** When a camp crosses a DST boundary, does the session that "would have been" at 17:00 local still bill at the same token amount? (Probably yes — billing is per-session, not per-hour.)
- **Event account requirement for truly free events.** We require an account for all participations (v1 simplification). If friction is too high for casual events like mall demos, consider a magic-link + gamer-only capture flow.
- **Topic taxonomy depth.** Will "Minecraft" ever need sub-topics (Minecraft — Survival, Minecraft — Redstone)? If so, add `topics.parent_id`. Not needed until it is.
- **Calendar view as a first-class parent feature.** A parent viewing "everything my kids are doing this week" across multiple products is obvious v2 UX. Design the calendar data layer (per-gamer session query) to support this even if we don't ship the UI in phase 1.

---

## 12. Appendix

### 12.1 Cross-references

- Groups & `commit_group_changes` (**retired under this redesign**): `docs/groups-architecture.md`
- Current consumer billing (**replaced by §5.7 + §6.3**): `docs/customer-enrollment-architecture.md`
- Location hierarchy & site binding: `docs/locations-architecture.md`
- Voice-room wiring for online products: `docs/voice-chat-architecture.md`
- Token mechanics (`adjust_token_balance`): `docs/sorg-token-architecture.md`
- Email pipeline for notifications: `docs/email-architecture.md`
- WhatsApp notification channel: `docs/whatsapp-automated-flow.md`

### 12.2 Mockup lineage

The current public mockup at `/registration` (from the superseded `school-clubs-design.md`) modeled only the municipality club flow. When this redesign lands in phase 1, the mockup is either promoted to the real unified-browse page or retired in favor of live queries against the new schema.

### 12.3 Why we're retiring `product_groups`

The elastic-capacity benefit of `product_groups` (add a group → add capacity without touching the product row) is better served by a **clone-product** admin flow under the new model. Every downstream system — voice room (online only), attendance, Gedu dashboards, charges — becomes simpler when "cohort" and "product" are the same thing. The helper-Gedu use case ("Bob helps Adam") works naturally because multiple Gedus can be assigned to one product. Loss of the abstraction is a net win.
