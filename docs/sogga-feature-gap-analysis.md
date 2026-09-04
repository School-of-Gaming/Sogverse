# SOGGA Feature Gap Analysis

> **Status: re-verified against `dev` on 2026-09-03.** Originally a June 2026 snapshot.
> Every item was checked against the schema, routes and services; items that Sogverse now
> handles (or has deliberately replaced with something judged complete) have been
> deleted. What remains is either partial or an open gap. Kept at `docs/` top level
> deliberately — the owner may delete it rather than maintain it.

Features present in the legacy SOGGA platform (Gamers' Arena) that Sogverse does **not
yet** cover, or covers only in part. Each item states what Sogverse has today, what is
still missing, and a business priority plus estimated complexity to close the remainder
on the Sogverse stack (Next.js 16, Supabase, Stripe, TypeScript).

**Priority labels:** `Critical` | `High` | `Medium` | `Low`
**Complexity labels:** `Low` | `Medium` | `High` | `Very High`

Removed on 2026-09-03 as handled: waiting list and seat offers, municipality-funded
products, participant notes, per-session attendance, criminal record check tracking,
per-club operating fees.

---

## Geographic Hierarchy

### 2. Custom Fields System — `Gap`

**SOGGA had:** Admin-defined dynamic fields attached at the Country, Municipality, School
or Club level, rendered in registration and admin forms (text and select), with answers
stored as JSON on participant records.

**Sogverse has:** Nothing dynamic. The signup panel's fields are fixed at compile time and
participations carry no answers column. The nearest admin-configurable per-product form
element is the required-consent set (`product_required_consents` + `consent_documents`),
which is a boolean against a known document, not a free-form field.

**Priority:** `Medium`
**Complexity:** `Medium` — A `custom_fields` table with a polymorphic association, a JSON
answers column on participations, dynamic form rendering, and a small admin UI.

---

## Registration & Onboarding

### 3. Public Municipality Registration Wizard — `Partial`

**SOGGA had:** A public, no-login 4-step form registering children into
municipality-funded clubs: cascading country/municipality/school/club selection, parent +
child info, custom fields, confirmation — creating parent and gamer accounts as a side
effect.

**Sogverse has:** Public discovery of municipality clubs under `/schools` with the
country → municipality → school cascade, the `municipality_club` product type with the
`external_contract` billing mode and a no-Stripe checkout branch, automatic waitlisting
when full, and localised confirmation / waitlist emails. Enrolment itself is
**account-first**: a stranger on a product page is sent to `/register` and returned to
the product afterwards, and every enrolment write is gated to the `customer` role.

**Still missing:** A no-login flow that creates the accounts as a side effect of
enrolling. `docs/investigations/municipal-enrolment-platforms.md` records that Finnish
municipalities run enrolment in their own Lyyti / Hellewi tenants, so the answer may be
an integration rather than a rebuilt wizard — nothing is decided.

**Priority:** `High` (down from Critical — the funded-product and waitlist halves landed)
**Complexity:** `Medium` — Either a public enrol-and-register route on top of the existing
signup panel, or an inbound integration; the account-creation and waitlist logic already
exists.

---

## Lessons & Attendance

### 5. Lesson Scheduling & Management — `Partial`

**SOGGA had:** Materialised lesson rows per club group with date, time, status, notes and
assignment codes; batch creation for a whole period; a per-lesson status workflow; and
substitution tracking when another educator covers.

**Sogverse has:** Sessions projected from a group's recurring schedule slots and holiday
calendars, materialised lazily as `group_sessions` when a gedu first writes to one.
Batch creation is replaced by design — the projection *is* the semester. Per-session
staff writes (report, photos, attendance) exist.

**Still missing:** A per-session status, cancelling or rescheduling a single occurrence,
and substitution tracking. `did_not_run` / `needs_substitute` columns were added in
migration 00138 and deliberately dropped in 00151; `cancel_session`,
`reschedule_session` and `assign_substitute` are reserved names only. `ROADMAP.md`
plans **Auto substitution** as a cover-request flow (WhatsApp / Discord / email /
in-app, admin-approved) rather than SOGGA's manual reassignment.

**Priority:** `High`
**Complexity:** `Medium` — An occurrence-override shape on `group_sessions` (cancelled,
moved, covered-by), the projection honouring it, and gedu/admin controls. The data
model and the feed already exist.

---

### 7. Lesson Rewards — `Gap`

**SOGGA had:** Reward codes with amounts attached to lessons, distributed to participants
on completion, feeding the attribute scores of the achievement system.

**Sogverse has:** Nothing granted on session completion. See item 14 — there is no points
ledger to grant into.

**Priority:** `Medium`
**Complexity:** `Low` once item 14 exists — a per-session reward definition and a grant on
completion. Not useful standalone.

---

## Educator (GEDU) Management

### 8. GEDU Profile System — `Partial`

**SOGGA had:** Languages, municipalities served, qualifications, skills / content types,
attendance types (in-person, remote) and a separate invoicing email, all admin-managed.

**Sogverse has:** Spoken languages (`profiles.spoken_languages`) and geographic coverage
(`gedu_locations`), both collected at `/register-gedu` and editable by the gedu in
settings. `gedu_profiles` carries certification and the criminal-record-check audit
trios and nothing else. Note the vocabulary: "certified" here means an admin vouched for
the person, not a held credential.

**Still missing:** Qualifications / certifications, skills / content types, attendance
types, a separate invoicing email, and any admin surface for editing a gedu's languages
or coverage.

**Priority:** `High`
**Complexity:** `Medium` — Junction tables for qualifications and skills, an
attendance-type column, an invoicing email on `gedu_profiles`, and an admin editor on the
user detail page.

---

### 9. Substitute Educator Search — `Gap`

**SOGGA had:** A filtered search for educators available in a weekday / time window,
by languages, qualifications, skills, attendance types and municipalities.

**Sogverse has:** The group-assignment gedu picker filters on name + email text and a
single spoken-language chip, and flags uncertified gedus. `gedu_locations` exists for
exactly this (the locations service names substitute matching as its purpose) but
nothing reads it for that yet.

**Still missing:** Availability by weekday / time window, location and attribute filters.
The attributes themselves depend on item 8. `ROADMAP.md` schedules **Auto substitution**
as a broadcast-and-approve cover request, which may make the search moot.

**Priority:** `Medium`
**Complexity:** `Medium` — An availability query over schedule slots plus the profile
junctions, and a multi-filter picker. Or none of it, if the cover-request flow ships
first.

---

## Invoicing & Financial Reporting

### 11. GEDU Invoicing System — `Gap`

**SOGGA had:** Monthly (or custom) invoicing periods, per-lesson line items linked to
gedu, club and pricing tier, a status workflow (Unhandled → Processed / Rejected →
Invoiced), gedu self-service views and admin management.

**Sogverse has:** Both inputs and no consumer — per-session gedu fees on `products`
(`primary_gedu_fee_cents`, `assistant_gedu_fee_cents`) and per-session attendance
(`session_attendance`). No period, line-item or status objects, no routes, no UI.
**Educators are still marking sessions done in SOGGA to get paid**: the in-repo gedu
handbook (`src/data/gedu-docs/`) instructs it, and describes the Truster collective
invoicing that follows.

**Priority:** `Critical` — SOGGA cannot be retired until this lands. `ROADMAP.md`
schedules **Gedu invoicing** for September 2026.
**Complexity:** `Very High` — Periods, line generation from materialised sessions +
fees, a status state machine, gedu and admin views, and the CFO's reporting.

---

### 12. Municipality Invoicing — `Gap`

**SOGGA had:** A separate invoicing track per municipality with contact info, per-lesson
line items, status, and filtered reports.

**Sogverse has:** The product side only — `municipality_club` products with
`billing_mode = 'external_contract'` and a `municipality_fee_cents` per session, all
invoiced **off-platform** today (`docs/architecture/products.md`). The `locations`
hierarchy carries no municipality contact or invoicing fields. The on-platform shape is
pre-specified: a future `billing_mode = 'municipality_account'`, with code branching on
`billing_mode` rather than on product type.

**Priority:** `Critical` — `ROADMAP.md` schedules **Muni Invoicing** for September 2026.
**Complexity:** `High` — Municipality invoicing details, line items derived from
sessions × municipality fee, a status per municipality-period, and admin reporting.
Shares its period and line machinery with item 11.

---

### 13. Reporting Suite — `Gap`

**SOGGA had:** Municipality invoicing report, municipality summary, Truster per-gedu
payment report with CSV / JSON export, and a gedu invoicing status overview.

**Sogverse has:** No reports page and no CSV / JSON export anywhere. The admin dashboard
deliberately dropped revenue and growth reporting because customer money lives in Stripe,
which owns the reporting an accountant uses. That covers **incoming** money only; SOGGA's
four reports were all about **outgoing** money (gedu fees, municipality billing), which
Stripe never sees.

**Priority:** `High`
**Complexity:** `High` — Depends entirely on items 11 and 12; each report is a filtered
aggregate over their tables plus an export route.

---

## Gamification & Engagement

### 14. Achievement System — `Gap`

**SOGGA had:** Achievements with a condition DSL, translations, images and rewards; four
attribute scores per gamer; a level derived from each score; a gamer profile with
progress bars, a radar chart, an achievement grid and unlock notifications.

**Sogverse has:** Vocabulary only. The Four Yty-Elements (harmony, glow, valor, wit —
SOGGA's "Common Sense" is now Wit), Yty-Points, Quests, Achievement Badges and the metal
tiers exist as the Yty constants module and the `yty` messages namespace, rendered on the
public `/about` page. No `achievements`, `badges`, `quests` or points tables; nothing is
awarded or stored; the gamer dashboard explicitly has no Yty section. `ROADMAP.md` names
this in as many words ("the product carries the vocabulary without the mechanics behind
it") and schedules **Gamer Yty** for November 2026, with Yty-Points balances, Achievement
Badges and Quests unscheduled behind it.

**Priority:** `Medium`
**Complexity:** `Very High` — Points ledger, achievement definitions with translations
and a condition evaluator, level derivation, the profile UI and unlock notifications.
Drop the regex DSL; conditions can be typed rows.

---

### 15. Gamers Gym / Activity Generator — `Gap`

**SOGGA had:** A library of session activities (name, description, image) with a random
pick carousel for educators, and admin CRUD.

**Sogverse has:** Nothing. Beware the false friend: `src/lib/activity-type.ts` and the
`activityCard` namespace are the club / camp / event type taxonomy, unrelated.

**Priority:** `Low`
**Complexity:** `Low` — An `activities` table with admin CRUD and a random-pick component.

---

## Configuration & Data Management

### 16. Code / Code Domain System — `Gap` (deliberately replaced)

**SOGGA had:** Admin-editable runtime enumerations (status codes, types, currencies)
used for dropdowns and classifications across the app.

**Sogverse has:** Postgres enums flowing through codegen (`billing_mode`, `product_type`,
`product_status`, `participation_status`, `product_topic`, `product_tag`,
`spoken_language`, `user_role` and others) with labels in `messages/`, plus TS const
tuples for locales. `docs/investigations/enum-candidates.md` records the bar a value must
clear to be an enum and the disqualifier: anything that is genuinely data with admin CRUD
is a table instead — `locations`, `product_images`, `holiday_calendars`, `postal_codes`.

**Still open:** Only the question of whether any enum will ever need runtime editing. No
current need; treat this item as closed unless one appears.

**Priority:** `Low` (down from Medium)
**Complexity:** `Medium` if ever wanted.

---

### 17. Club Instructions — `Partial`

**SOGGA had:** An admin-managed library of typed instruction documents attached
many-to-many to clubs.

**Sogverse has:** Four narrower staff-note fields: a per-product staff-only material link
(`product_staff_details.material_url`), a per-group gedu note (`product_groups.gedu_note`),
per-venue staff notes (`site_staff_details`) and per-member group notes. The gedu
handbooks in `src/data/gedu-docs/` are static repo files feeding the Gedu Guru bot, not
attached to products and not admin-editable.

**Still missing:** A reusable, typed instruction document that many clubs share.

**Priority:** `Low`
**Complexity:** `Low` — An `instructions` table with a type, a junction to products, and a
panel in the group workspace.

---

### 19. Entities Management — `Gap`

**SOGGA had:** Organisation records (companies, sponsors) associated with clubs.

**Sogverse has:** No organisation table. The `locations` hierarchy is country → region →
municipality → district → site; a school is a `site` row (a venue), and `/schools` is
derived from where clubs run. The only product ↔ organisation link is the
`marketing_consent_type` enum naming one partner (Lynx Educate). Municipality billing,
the business reason SOGGA had entities, is item 12.

**Priority:** `Low`
**Complexity:** `Low` — An `organisations` table and a junction to products. Reconsider
once item 12 decides whether a municipality's invoicing details live on the location or
on an organisation.

---

## Communication & CRM

### 20. ActiveCampaign CRM Integration — `Gap`

**SOGGA had:** Contact creation on registration, season and status tags, contact sync,
tag updates on enrolment / cancellation / waitlist moves.

**Sogverse has:** A consent ledger with no sync target — `marketing_consents` (current
state) and `marketing_consent_events` (append-only history) per consent type, captured in
signup, registration and account settings, shown on the admin user page. Brevo is used
for transactional email only; the client has one export and touches no contact or list
endpoint.

**Still missing:** Any downstream marketing platform, and status tagging.

**Priority:** `Medium`
**Complexity:** `Medium` — A Brevo contacts / lists sync driven off the consent events
would be the natural fit, plus hooks on enrolment and cancellation.

---

### 21. Webflow Webhook Integration — `Gap`

**SOGGA had:** A webhook receiver for events from the Webflow marketing site.

**Sogverse has:** Inbound webhooks for Stripe, WhatsApp and Discord interactions only. The
public site is now Sogverse itself, so the need may be gone.

**Priority:** `Low`
**Complexity:** `Low` — One route, if a marketing-site event ever needs receiving.

---

### 22. Welcome Email Tracking & Bulk Send — `Gap`

**SOGGA had:** A per-participant "welcome email sent" flag with an admin toggle, and a
bulk send of a club-details welcome mail to a whole club.

**Sogverse has:** The pattern, but not this instance. Enrolment confirmation (including
the waitlist variant) is sent automatically per signup; the account welcome mail is sent
once at registration; a tracked, exactly-once bulk send to every family in a group exists
for session reports (`group_sessions.report_emailed_at`).

**Still missing:** An admin-triggered club welcome / details mail and its sent-flag.

**Priority:** `Medium`
**Complexity:** `Low` — A template, a `welcome_emailed_at` on the group or participation,
and a claim-then-send route in the session-report shape.

---

## Discord Integration

### 23. Discord Bot & Community Features — `Partial`

**SOGGA had:** A Discord.js bot with classroom and lobby setup commands, `/room open` /
`/room close` per club, OAuth account linking, role assignment on subscription change,
guild member search and nickname caching.

**Sogverse has:** A single stateless interactions webhook (`src/app/api/discord/`) with
three staff commands: `/geduguru` and `/happinappi` (Gemini assistants over the gedu
docs) and `/reset-password` (Minecraft Education). Voice moved to Daily.co. No account
linking, no role sync, no per-club guild or classroom.

**Still missing:** Everything community-shaped. `ROADMAP.md` moves the other way — Gedu
Guru and support tickets are to be handled natively in Sogverse — so the missing pieces
are not planned.

**Priority:** `Low`
**Complexity:** `High` if ever wanted; treat as closed unless a Discord community
presence is decided on.

---

## Operational Tools

### 24. Scheduled Jobs System — `Gap` (deliberately replaced)

**SOGGA had:** DB-stored cron / one-time jobs with a function registry; the flagship job
was automated subscription cancellation with email, participation cancel, role removal
and CRM updates.

**Sogverse has:** No live scheduled jobs of any kind — `pg_cron` is installed with every
job since unscheduled, `vercel.json` has no crons, and there are no edge functions. The
replacement is **lazy observation**: seat-offer expiry is claimed exactly-once by a sweep
RPC when an admin opens a surface that cares, and verification requests self-prune inside
their own RPC. Subscription cancellation is delegated to Stripe (`cancel_at_period_end`
via the webhook, self-served through the Customer Portal).

**Still open:** Any feature that genuinely needs a timer — session reminders
(`docs/records/calendar-feed-vs-invitations-2026-09.md`, which records why the
calendar route was preferred and reminder mail deferred) and chat retention
(`TODO.md`) both name the constraint. The first such feature has to bring the runbook and
alerting `pg_cron` would need.

**Priority:** `Medium`
**Complexity:** `Medium` — Decided per feature; no general job system is wanted.

---

### 25. Audit / Information Logging — `Partial`

**SOGGA had:** A structured `informationLog` table (type, scope, user, description)
written throughout the API.

**Sogverse has:** No event-log table and no logging wrapper. A handful of admin
participation routes emit structured JSON lines to Vercel's log aggregation (add / remove
gamer, waitlist transition) with the design stated inline: hosted logs, no DB write.
Separately, DB-enforced stamped-by columns exist where they matter (`certified_by`,
`criminal_record_check_by`, `report_emailed_by`, `hidden_by`, `locked_by`) and
`marketing_consent_events` is a real append-only log for one domain. No Sentry or
equivalent.

**Still missing:** Any queryable cross-cutting audit trail, and consistent log calls
outside those routes.

**Priority:** `Medium`
**Complexity:** `Low` — An insert-only `audit_events` table and a `logAudit()` helper
called from the guarded write paths; or a decision that hosted logs are enough.

---

### 26. Club Calendar View — `Partial`

**SOGGA had:** All clubs grouped by weekday (plus unscheduled) with multi-select filters
for status, type, municipality, educator and attendance type, a text search, and
expandable club details.

**Sogverse has:** Two halves that nothing joins. The admin dashboard's week view groups a
concrete week by weekday with a product-type filter only and no unscheduled bucket. The
club list pages (`/admin/consumer-clubs`, `/admin/municipality-clubs`) have a flat list
with day, educator, spoken language / municipality filters and a debounced text search.
A standalone session calendar component exists with zero production consumers, which
`TODO.md` already flags as rewire-or-delete.

**Still missing:** Weekday grouping and multi-dimensional filtering on the same surface,
status and attendance-type axes (absent from the wire contract, not just the UI), and an
unscheduled bucket.

**Priority:** `High`
**Complexity:** `Medium` — Extend the club list's filter bar with the missing axes and
give it a by-weekday layout, or feed the week view the club filters.

---

## Search & Discovery

### 29. Advanced Multi-Entity Search — `Partial`

**SOGGA had:** Dedicated search pages per entity (gedu, gamer, parent, user, club) with
entity-specific filters and result cards.

**Sogverse has:** One strong unified user search on `/admin/users` over a generated
search blob (name, email, phone, Minecraft and Roblox usernames), multi-word AND
matching, role chips, a capped page with the true match count, and gedu standing marks
on rows; gamers nest under their parents. Product lists are split per type with a name
search, and the two club types add the filter bar described in item 26. Groups have no
list of their own.

**Still missing:** Entity-specific result cards (subscription plan, club memberships,
billing method, municipality-gamer status), club filtering by attendance type, topic,
status or tag, a cross-product group search, and any global search.

**Priority:** `Medium` (down from High — the user search covers the common case)
**Complexity:** `Medium` — Richer row cards from existing joins, and the club filter
axes from item 26.

---

## Summary by Priority

| Priority | Items |
|----------|-------|
| **Critical** | GEDU Invoicing (11), Municipality Invoicing (12) |
| **High** | Municipality Registration (3), Lesson Management (5), GEDU Profiles (8), Reporting Suite (13), Club Calendar View (26) |
| **Medium** | Custom Fields (2), Lesson Rewards (7), Substitute Search (9), Achievement System (14), ActiveCampaign CRM (20), Welcome Emails (22), Scheduled Jobs (24), Audit Logging (25), Multi-Entity Search (29) |
| **Low** | Activity Generator (15), Code Domain System (16), Club Instructions (17), Entities (19), Webflow Webhooks (21), Discord Bot (23) |
