# School Clubs — Design Proposal

Forward-looking design for adding **school clubs** alongside the existing **consumer clubs**. Not yet implemented; a UI-only mockup lives at `src/app/(public)/registration/` so the product team can iterate on flow and wording before any schema or backend work.

Status: **design / pre-implementation**. Rename to `school-clubs-architecture.md` when this ships.

Related docs: `groups-architecture.md`, `customer-enrollment-architecture.md`, `locations-architecture.md`, `voice-chat-architecture.md`, `email-architecture.md`, `whatsapp-automated-flow.md`.

---

## 1. Summary

Sogverse today sells **consumer clubs** directly to parents: the parent pays in Sorg tokens, gets charged weekly per session, and enrollment is always open. We are adding a second product line — **school clubs** — where a Finnish school municipality pays us directly and parents register their child for a fixed seat. School clubs have a semester window, a finite seat count with a waitlist, and a scheduled registration opening time that acts like a concert ticket drop.

The two products overlap meaningfully (scheduled activity, Gedu, location, voice room, language, ages) but diverge on **billing**, **schedule shape**, **capacity model**, and **access gating**. The proposal is to keep a single `products` table with a `club_type` discriminator, put school-only fields on the same row, and add a separate `school_registrations` table rather than shoehorning the consumer billing model (`group_enrollments` + `enrollment_charges` + weekly cron) onto a free-at-point-of-use product.

---

## 2. Terminology

We are **deliberately using two different words** to avoid collisions in the codebase:

| Term | Meaning | Scope |
|---|---|---|
| **Enrollment** | Consumer-club membership — parent-paid, weekly charges | Existing: `group_enrollments`, `enrollment_charges`, `commit_group_changes` |
| **Registration** | School-club membership — municipality-paid, seasonal, seat/waitlist | New: `school_registrations`, `/registration` URL space |

The two concepts cannot share the same noun. Keeping them separate in code and in UI copy keeps ambiguity from leaking into RPCs, query keys, RLS policies, and documentation.

---

## 3. Consumer vs. school clubs

### What's the same

- **Scheduled activity** with day-of-week, start time, duration, timezone.
- **A Gedu is assigned** (school clubs may additionally have an assistant Gedu).
- **A location** (leaf `site` in the `locations` hierarchy); online clubs are tied to a site too so Daily.co rooms and regional reporting work consistently.
- **A spoken language** the club is delivered in.
- **An age range** (`min_age`, `max_age`).
- **A game** (`game_id`).
- **A voice room** for online clubs (Daily.co, one room per group).
- **Attendance, session cancellation, visibility flags, Gedu dashboards** — needed for both, just partially built.

### What's different

| Dimension | Consumer club | School club |
|---|---|---|
| **Who pays us** | The parent, per session | The municipality, lump sum per term |
| **What the parent pays at point of use** | Sorg tokens per session | Nothing |
| **Pricing field** | `token_cost` | *(none)* |
| **Schedule shape** | Ongoing; no start/end date | Seasonal with `season_start`, `season_end` |
| **Holidays** | Implicit — admin changes schedule | Explicit list of skipped dates |
| **Capacity** | Elastic — more groups = more seats | Fixed `seat_count`; overflow goes to waitlist |
| **Waitlist** | None | Ordered waitlist with position, promotion when a seat opens |
| **Access** | Public `/clubs` shopping-cart style | Gated by school affiliation |
| **Registration timing** | Whenever, immediate | Fixed `registration_opens_at` — "Taylor Swift ticket drop" feel |
| **Cancellation / refund** | Refund windows apply via `unenroll_gamer` | No refunds to the family; seat may be reclaimed for attendance reasons |
| **Who removes a seat holder** | Parent, via unenroll | Parent (unregister) OR system (inactive) → promotes next on waitlist |
| **Gamer↔club eligibility** | Age + language match | Age + language match **plus** attends this school |

---

## 4. Proposed design

### 4.1 Data model

**Extend `products` with a `club_type` discriminator + school-specific columns. Keep billing/enrollment tables separate.**

```
products
  id                          uuid (pk)
  club_type                   enum('consumer', 'school')  ← NEW
  name, description, game_id, min_age, max_age, day_of_week,
  start_time, timezone, duration_minutes, is_remote, location_id,
  spoken_language_code, is_visible, padlet_url, image_path,
  created_by, created_at, updated_at

  -- consumer-only (nullable for school)
  token_cost                  int

  -- school-only (nullable for consumer)
  school_id                   uuid → schools.id
  season_start                date
  season_end                  date
  registration_opens_at       timestamptz
  seat_count                  int
```

A `CHECK` constraint enforces that consumer rows have `token_cost IS NOT NULL` and school columns are `NULL`, and vice versa.

### 4.2 New tables

```
schools
  id              uuid pk
  location_id     uuid → locations.id  (must be a `site`)
  name            text                 (may mirror the site name)
  code            text unique          (human-shareable, e.g. TAPIOLA26)
  municipality    text
  address         text
  contact_email   text
  created_at, updated_at

product_skipped_dates
  id              uuid pk
  product_id      uuid → products.id
  date            date
  reason          text
  unique(product_id, date)

school_registrations
  id                uuid pk
  product_id        uuid → products.id (must be club_type='school')
  gamer_id          uuid → profiles.id
  parent_id         uuid → profiles.id (the customer who registered)
  status            enum('active', 'waitlisted', 'cancelled')
  waitlist_position int                (null unless status='waitlisted')
  registered_at     timestamptz
  cancelled_at      timestamptz
  cancel_reason     text               (parent_left | attendance_removed | admin_removed)
  unique(product_id, gamer_id)         (one registration per gamer per club)

product_group_assistants                ← optional, phase 2+
  product_group_id  uuid → product_groups.id
  gedu_id           uuid → profiles.id
  primary key (product_group_id, gedu_id)
```

Keep existing `product_groups` as-is for consumer clubs. For school clubs, exactly one group is created per product (one Gedu lead); if assistants are needed we add them through `product_group_assistants`. Reusing `product_groups` means voice rooms, attendance, and Gedu dashboards don't need to branch by club type.

### 4.3 New RPCs

- `register_for_school_club(product_id, gamer_id)` — transactional. If seats available → `status='active'`. If full → `status='waitlisted', waitlist_position = next_position`.
- `leave_school_registration(registration_id, reason)` — cancels, and if the cancelled row was `active`, calls `promote_from_waitlist`.
- `promote_from_waitlist(product_id)` — atomically picks the lowest waitlist position, flips to `active`, and emits a notification event.
- `admin_remove_registration(registration_id, reason)` — for attendance-driven removals; same promotion behavior.

All RPCs are `SECURITY DEFINER` with explicit row locking on the registrations of the target product to prevent waitlist race conditions (same pattern as `adjust_token_balance`).

### 4.4 Consumer billing stays untouched

The consumer weekly charge cron (`process_enrollment_charges`), the refund window logic, and `commit_group_changes` **do not run on school clubs**. Filter by `club_type` at the top of each or leave them unaware via the separate registration tables — whichever is cleaner once implemented.

### 4.5 Why this shape

The consumer side is heavily optimized around its pricing model: `token_cost`, `enrollment_charges` with `session_date` uniqueness, refund-on-unenroll, weekly cron, per-gamer-per-group uniqueness trigger. None of that applies to school clubs. Putting school registrations into `group_enrollments` would force every existing RPC to branch on club type and would spread nullable columns across multiple tables.

Conversely, forking a whole parallel `school_clubs` table duplicates everything the two share — Gedu assignment, location binding, voice rooms, language, age, visibility. Future features like attendance and session cancellation would have to be built twice and stay in sync.

The middle path — shared `products` with a discriminator, separate registration table — lets us reuse the ~70% that overlaps without cross-contaminating the 30% that doesn't.

### 4.6 Alternatives considered

- **Fully separate tables (`school_clubs`, `school_groups`, `school_registrations`).** Cleaner types, no nullable noise, zero risk of the consumer cron touching a school row. But every "my clubs" query, Gedu dashboard, and voice-room handler has to union or branch. Cost compounds as shared features land.
- **Unified `club_registrations` covering both consumer and school.** Would let future UI show "all my clubs" uniformly. Blocked by the billing divergence: `enrollment_charges` and Stripe-backed token accounting don't map to free school seats, and the refund window semantics are fundamentally different.

---

## 5. Open questions

Captured from the design discussion; needs product-team input before phase 1.

1. **Gamer ↔ school linkage.** Current thinking: school issues a human-readable `code` and the parent enters it once in their account; that unlocks that school's club list. Alternatives: admin imports roster, email-domain verification, parent invite token per-gamer. The "enter a code" approach is easy to mock and spoofable but probably OK since municipalities already vet who attends their schools.
2. **Sibling registration.** Should two siblings at the same school share one "add to waitlist" action, or is each gamer a separate entry? Current mock assumes separate per-gamer entries. Needs team input on whether families expect to race together.
3. **Session cancellation beyond holidays.** Holidays are in `product_skipped_dates`. Ad-hoc cancellation (sick Gedu) is a different workflow — preference is to find a substitute rather than cancel. Defer until phase 2; when we build it, Gedu-initiated cancellation should insert into the same skipped-dates table + fire notifications.
4. **Attendance → roster hygiene.** If a gamer no-shows N sessions, admin removes them and the next waitlisted family gets the seat. What's N? Who approves removal (Gedu, admin, auto)? Appeal process?
5. **Registration page UX for the Taylor-Swift moment.** Current mockup shows a countdown + "prepare your child ahead of time" affordance. Real implementation needs: server-authoritative clock, atomic seat-taking (DB row lock), clear "you got it / you're #N" feedback. A Ticketmaster-style waiting room is probably overkill for v1.
6. **Schools table vs. virtual concept.** Could defer the `schools` table and instead put `code`, `municipality`, `address` on the `locations` row for sites that happen to be schools. Cleaner if *every* site has these fields, messier if only schools do. Lean toward separate `schools` for clarity.

---

## 6. Phased plan

### Phase 0 — UI mockup ✅ *(done)*

Public route at `/registration` with fake Finnish data (Tapiolan koulu, Ressun peruskoulu, Munkkivuoren ala-aste). Covers the parent flow end-to-end: school-code entry → club list → club detail with countdown / open / full states → inline registration form (gamer + rules) → confirmation page. Stakeholder iteration on wording, state transitions, and layout happens here before any DB work.

### Phase 1 — v1 MVP

Goal: municipalities can onboard, admins can create school clubs, parents can register and waitlist, Gedus can see their clubs and rosters. No attendance tracking yet, no ad-hoc session cancellation, no substitute Gedus.

- **Schema:** `club_type` enum on `products`, school-only columns, `schools` table, `product_skipped_dates`, `school_registrations`, constraints.
- **RPCs:** `register_for_school_club`, `leave_school_registration`, `promote_from_waitlist`.
- **Admin UI:** create/edit school club form (location, address, language, seat count, registration opens, season dates, weekday, start/end time, holidays, assigned Gedu). School CRUD.
- **Parent UI:** ship the Phase 0 mockup, wired to real queries. School-code gate. Live seat counter. Waitlist position.
- **Gedu UI:** "my assigned clubs" list (consumer + school unified), roster view per club.
- **Notifications:** email + WhatsApp on waitlist → active promotion.
- **Visibility:** school clubs hidden from `/clubs` (consumer storefront). RLS enforces school-gate for parents.
- **Billing:** out of scope — municipality invoicing is offline for v1.

### Phase 2 — attendance & roster hygiene

- Per-session attendance tracking (present / absent / excused) captured by the Gedu.
- Parent-initiated "skip this session" flow that notifies the Gedu and marks the session excused.
- Policy-driven removal: after N unexcused absences the registration is auto-flagged for admin review; admin confirms → `admin_remove_registration` promotes next waitlisted.
- Assistant Gedu support via `product_group_assistants`.
- Gedu-initiated session cancellation (writes to `product_skipped_dates` + notifies gamers).

### Phase 3 — operational features

- Substitute Gedu finder (assign a coverage Gedu when primary is out).
- Municipality reporting dashboards: attendance rates, engagement metrics, per-cohort outcomes.
- Term/semester templates (clone a spring term into the next spring).
- Gedu scheduling conflict detection (one Gedu, multiple clubs, same timeslot).
- Finnish public-holiday calendar import to pre-fill skip dates.
- Sibling / multi-gamer registration in a single action.

---

## 7. Future systems to factor in now

These are **not** in-scope for phase 1, but phase-1 decisions should leave room for them.

- **Municipality invoicing.** Phase 1 is handshake-and-invoice offline. Eventually we'll want a municipality billing model (PO numbers, quarterly invoices, usage-based reporting). Keep `schools` tied to a `municipality` field so the rollup dimension is stable from day one.
- **Reporting and analytics for municipalities.** Attendance, retention, completion rates by school / club / municipality. Requires stable `school_id`, `product_id`, and clean attendance events. Design attendance as event-sourced (append-only) rather than mutable flags so reporting is trustworthy.
- **GDPR / privacy.** Municipality contracts may impose stricter data-handling than consumer. Expect requirements like: parent data-export, student-only data residency, custodial consent records. Record `consented_at` on registrations and keep audit trails on status transitions.
- **Notifications abstraction.** Phase 1 fires email + WhatsApp for waitlist promotion. Attendance, cancellation, and roster events will need the same pipes. Build a notification service rather than inlining Brevo/WhatsApp calls into each RPC.
- **Waitlist fairness signals.** Parents will suspect favoritism if they miss a seat. Make the ordering mechanism observable (timestamp-based, visible positions, audit log) and consider making the ordering logic testable as a pure function of the registration event stream.
- **Gamer-to-school verification.** The school code unlocks visibility; it does not prove a gamer actually attends. If municipalities need stronger verification (e.g., for reporting), design `schools` to hold an optional verification method (`roster_imported_at`, `email_domain`) now.
- **Multi-school gamers.** Some families have children at different schools; some children transfer mid-year. The `school_id` lives on `products` and `schools` is joined via a gamer's parent-entered codes — a gamer can register at any school whose code their parent has entered. Avoid modeling "gamer belongs to one school."
- **Summer / autumn terms.** Season boundaries shouldn't hard-code Finnish spring. `season_start`/`season_end` are dates, and a gamer can have multiple registrations across terms.
- **Public/private visibility for municipalities.** Some schools may want a closed beta where only invited parents see the clubs. `schools.is_public` or a per-parent allowlist may be needed.
- **i18n of the parent flow.** Phase 0 mockup is hardcoded English. Production parent-facing UI must be localizable; route copy through next-intl from the start in phase 1 rather than retrofitting.

---

## 8. Appendix

### 8.1 Where to find the mockup

- Route: `/registration`
- Code: `src/app/(public)/registration/`
- Mock data: `src/app/(public)/registration/_mock/data.ts`
- ESLint override: the mockup folder disables `i18next/no-literal-string` (hardcoded English copy) — remove when the feature graduates.

### 8.2 Cross-references

- Consumer-club architecture: `docs/customer-enrollment-architecture.md`
- Consumer groups + `commit_group_changes`: `docs/groups-architecture.md`
- Location hierarchy and site binding: `docs/locations-architecture.md`
- Voice-room wiring for online clubs: `docs/voice-chat-architecture.md`
- Email pipeline for notifications: `docs/email-architecture.md`
- WhatsApp automation: `docs/whatsapp-automated-flow.md`
