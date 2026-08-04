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

### Seat gate & the create-on-payment rule

- **The product-row lock is the signup gate.** Every participation mutation begins `SELECT 1 FROM products WHERE id = $1 FOR UPDATE`, so concurrent create/cancel/promote on one product serialize and seat math is race-free. **Never `SKIP LOCKED` / `NOWAIT`** — callers must wait to see consistent post-commit state.
- **A paid participation is created when the money arrives, never before.** The pre-Checkout call under the lock *validates* the signup (parent-of, lifecycle, registration window, currency, already-enrolled, seat cap) and writes nothing; the Stripe `checkout.session.completed` webhook creates the `active` row. An abandoned, expired or failed checkout therefore leaves nothing in the database, and no path has a seat to release by hand. The no-charge shapes (free event, municipality registration) still activate in the same request as the validation, because there is nothing to wait for.
- **One number holds a seat: `status = 'active'`.** The capacity gate, the rollup the parent-facing counter reads, and the seat-left pill all count that and only that. They used to disagree — a pre-payment hold counted in one and not the other — and the gap turned a stranded hold into a permanently destroyed seat.
- **A paid participation records the Checkout Session that bought it.** That single column carries two loads: it lets the confirmation page resolve a Stripe `success_url` back to a seat, and it lets a redelivered webhook tell its own earlier work from a genuine second payment. Without it the two are indistinguishable, and the retry path — the handler writes its payment row last on purpose, so a failed write leaves no commit marker and Stripe re-runs it — would read its own row as a duplicate charge and cancel a paying customer's live subscription.
- **A second payment for one (product, gamer) is answered, not stored.** The confirmation RPC returns a duplicate verdict naming the row that is already there; the webhook records the charge for a manual refund and, for a subscription, cancels it at Stripe — refunding one invoice would not stop the next one.
- **The confirmation page never waits for something that isn't coming.** Creating the seat after the redirect means the page can arrive before it exists, so it waits — but it tells "not written *yet*" apart from "this payment bought nothing, because the seat was already taken", and it bounds the wait either way. A spinner under "this only takes a moment" is a promise; a page with no order coming has to stop and say where to look instead. Refunds are manual, so no state may promise one.
- **This is a deliberate simplification, and re-enabling seat caps is what would undo it.** A pre-payment hold protects a capped product from overselling while parents sit on the Stripe page. **The admin form therefore unlocks caps exactly where the signup never reaches Checkout, and locks them everywhere else** — the lock tracks the money, not the product type. Two shapes qualify: municipality clubs, invoiced off-platform, and **free events**, which take no payment at all. Both validate the cap and write the `active` row inside the same locked transaction, so there is no window between the gate and the seat for a second signup to slip through. A *paid* event is the same product type and does not qualify, so the form's free/paid switch flips the seat lock mid-form and clears any cap it locks away. Today, then, no product that can oversell is cappable. Whoever unlocks caps on a shape that does reach Checkout should expect to reintroduce a hold, and should read this section as the record of what it costs.
- **No client-supplied prices.** The client sends `(product_id, gamer_id, purchase_shape, currency)`; the server recomputes the charge from the stored base price every time.

### Billing

- **EUR-only authoring + Stripe Adaptive Pricing at checkout.** Authored, displayed, and recorded in EUR; Stripe presents the customer their local currency and settles us in EUR. The currency columns/CHECKs stay dormant for a future multi-currency re-enable — single seam is `SUPPORTED_CURRENCIES`.
- **One purchase option per type, decided by the product** (not a menu): consumer club → monthly subscription; camp / paid event → single upfront; free event → no checkout; muni → the `external` shape (instant `active`, invoiced off-platform, no Stripe). `free` and `external` are the two no-charge shapes, each gated on its matching `billing_mode`.
- **One Stripe subscription per (gamer, club)** — one `family_subscriptions` row each (the "family" name is historical; a row is one child in one club). Buys: always-Checkout (the trust moment), per-club cancel via Stripe's portal, and future deferred billing.
- **Club cancellation is portal-only.** No in-app cancel action. Parent cancels in Stripe's hosted portal → `customer.subscription.deleted` webhook → `cancel_participation` hard-deletes the participation (CASCADEs the sub row). Webhook-driven and idempotent; the app never calls Stripe back on that path.
- **Keep pricing/checkout code simple first** — prefer Stripe's built-ins (proration, `billing_cycle_anchor`, coupons) over re-implementing its math. Non-negotiable regardless: webhook idempotency (`stripe_event_id` unique on every `payments` row), `FOR UPDATE` seat counting, every incoming money movement recorded, server-recomputed prices. Refunds are the one money movement we do **not** record locally — they were a write-only ledger and the table was dropped; Stripe is the system of record for them.

### Seat hold vs club access (partly forward-looking)

A participation carries **two independent rights**: the **seat hold** (occupies `seat_count`) and **club access** (voice room, schedule, content). They usually move together; a failed sub payment blocks access immediately but holds the seat for a grace window (`ACCESS_GRACE_DAYS`) before release. Access is a runtime check (`participation_access_state`); seat is long-lived state. *The grace gates and `invoice.payment_failed` wiring are spec'd but not all shipped — verify against code before depending on them.*

### Sessions

- **A session is a `(group, product-local calendar date)` pair — it belongs to the group, not the product.** Two groups on one club run their own sessions, take their own attendance, and write their own reports. Keying on the local *date* rather than a UTC instant or a slot start time is what lets a record survive the commonest admin edit there is (a time-of-day fix); only a weekday move can orphan one.
- **One session per group per local day is a deliberate architectural bet, not an incidental key.** It blocks a group having a morning *and* an afternoon session on the same day — we don't run products that way and don't plan to — and in exchange the key survives every schedule edit but a weekday move, an entry has a stable identity before any row exists, and lazy materialization needs no reconciler. The cost is recorded on the unique constraint itself: revisiting multi-slot days means revisiting this key and every id derived from it.
- **Sessions materialize lazily; schedule math stays the only source of the *plan*.** Dates are still computed from `start_date`/`end_date` + `schedule_slots` (with subscribed `holiday_calendars` honoured only by the holiday-*aware* expansions — see below); a row is written only when there is something to hold — a report, a note, or an attendance mark. Admins edit dates, times and weekdays freely and nothing needs migrating, because a session with no records is never a row. Extending a term is still one `UPDATE`: no regenerate step, no reconciliation pass.
- **Records beat projections, and an orphaned row is history rather than a mistake.** Reads merge derived occurrences with stored rows on the date key: where both exist the row wins outright, including its stored start and end, and a row the schedule no longer projects still renders. History doesn't retroactively change because the plan was edited.
- **A row snapshots its scheduled start/end at materialization and never re-derives them — and the *server* derives those instants.** A client sends only the date, so it can neither invent a time nor disagree with the schedule about one. Rows also carry created-by/updated-by and timestamps: attendance is the gedu's confirmation that they ran the session, and is what they're paid on, which turns the problem from "nag gedus to record" into "audit what they recorded".
- **Attendance is explicit and tri-state — present, absent, or *unanswered* — and unanswered is the absence of a mark, never a silent absent.** One mark per (session, child), written **one at a time**, so two gedus marking different children in the same session can't clobber each other; reverting a child to unanswered *deletes* the mark rather than storing a third value, and partial states save by design. **Marks open at the session's scheduled start and the server enforces the boundary** — the standard pattern is a roll call as the session begins, recorded right there while the gedu can see who is in the room. A future session may hold notes (forward planning), never a mark: nothing has started, so there is nothing to have attended.
- **Completeness is judged against the *current* roster, because that's the only roster there is.** There is deliberately no participation-history table and no enrollment-at-the-time derivation — "who was enrolled then" is knowledge we don't have and choose not to fake. Accepted consequence, chosen with eyes open: a child joining a long-running group makes previously-complete past sessions read incomplete again.
- **Two markdown fields per session, two audiences, never merged:** the **session report** is family-facing (the eventual home for what parents read, replacing the Padlet, and emailed to them in a later phase); the **gedu note** is gedu + admin only. A note written under an assumption of privacy can never be retro-published. **Links are blocked by policy in both** — a gedu must not send parents or gamers off-site — so the renderer's allow-list carries no anchor and the editor can't produce one; a markdown link renders as its plain text on every surface, including the future email.
- **The enforcement epoch gates what is *owed*, never what is *editable*.** It's a constant in code (`src/lib/constants/session-epoch.ts`, value `2026-08-31`) — not a column, not admin-configurable, not a rolling window — compared as a product-local calendar date. Work owed starts at `max(product start, epoch)`, so a club that has run for two years owes nothing for its history. A session dated before the epoch never shows "needs attention" and never counts into a dashboard badge, however incomplete it is; it stays fully recordable and editable back to the product's start, with the same editors as any other past session. That's why write validation carries no epoch floor — only the attention count does.
- **This feature is holiday-blind everywhere, including its write validation.** Three schedule expansions exist today: the dashboards' holiday-blind one, the calendar component's holiday-aware one, and the holiday-aware server-side `product_has_session` (service-role only). Session writes must validate holiday-blind and **must not** call `product_has_session`: with the skip/didn't-run UI still undesigned, a holiday-aware validator refusing a date the holiday-blind feed offers would create a permanently unclearable "needs attention" alert. Accepted until then — a gedu may record a session on a listed holiday, and a false holiday gap may nag. **When cancellation/substitution is built, every expansion and validator must be unified in one pass.**
- **Write validation is deliberately loose:** at or after the product start, within the horizon the feed will ever show, and on a weekday the current schedule uses. Stricter buys little — an admin edit can orphan any row a day later anyway — and risks refusing a legitimate write-up in the minutes after a schedule fix.
- **Two schema concepts are reserved with zero behaviour:** a didn't-run flag and a needs-substitute flag. Both belong to the cancellation/substitution flows, deliberately undesigned; the columns exist because reserving two booleans costs nothing while adding columns to a populated table later costs a migration each. Nothing reads them, and neither has UI on any side.
- **Session writes are gedu-gated on the group assignment** — any gedu assigned to a group may edit that group's sessions, attendance and notes. Admin override exists only through the service role today: the gedu RPCs refuse an admin caller outright, and an admin UI for session records is deliberately out of scope. Peer-group *feeds* are not readable in v1, and the schema doesn't block opening them: that's a change to one predicate, not a redesign.
- **Concurrent edits are last-write-wins, accepted.** Two gedus editing the same session, group, or site notes at once means the later save overwrites — no locking, no merge — and each write path says so at the point it overwrites. Attendance is the one place the failure is *structurally* avoided rather than accepted, by the per-mark shape above.
- Times are product-local: `products.timezone` (IANA), `schedule_slots.start_time` is wall-clock (stable across DST), and a session's date is the calendar date in that zone. Render in the viewer's zone with a "Helsinki / your time" label when they differ.
- **Reserved RPC names: `record_attendance` is now taken** by the per-mark write above. `cancel_session`, `reschedule_session` and `request_substitute` / `assign_substitute` remain reserved for the cancellation/substitution feature.
- **A session in progress reads as past, and owes nothing yet.** Two boundaries, answering two different questions, and both sides agree on each. *Editability* turns on the **start** instant: a session that has started and not yet ended sorts into the past and offers its record editor, and the server accepts its marks from the same instant, so the roll-call flow works while the session is running. *Being owed* turns on the **end** instant — the client's per-entry alert and the SQL attention count both wait for the session to finish, because an hour the gedu is still standing in is not yet work outstanding. So: start is the editability line, end is the alert line.
- **The family-facing half isn't built.** No parent or gamer surface consumes session reports yet, so `products.padlet_url` and its remaining render sites stay until they do (tracked in `TODO.md`). The gedu-only lesson-material link is a *different* field with no backfill from the Padlet — the Padlet held family session notes, the material link is lesson content. **It is not a column on `products` and must not become one:** `products` carries an anon SELECT grant and PostgREST lets a caller name the columns it wants, so anything staff-only sitting there is world-readable whatever the comment above it says. It lives in `product_staff_details` — admin-only RLS, no anon grant at all — which gedus reach only through the feed RPC, and which is where the next staff-only product field belongs too.
- **The venue address is not a gedu's to write.** The site-notes RPC takes the two notes and nothing else; the address belongs to the location record and is an admin's to edit. It used to be a parameter, with the workspace echoing its cached copy back on every save — so a gedu saving a note against a page loaded before an admin's correction silently reverted it, and any assigned gedu could rewrite the address of a building they teach at outright. The RPC now preserves whatever address is stored and returns it for display only.

### Groups & capacity

- **Groups are an admin-only cohort layer; parents never see them.** Every type uses them. A product has 0+ named groups, each with 0+ gedus and 0+ participations.
- **Capacity lives on the product, not groups.** Admins balance participants across groups by hand.
- New paid participation lands `group_id = NULL` — the **unassigned inbox** admins work through. Deleting a group resets its participations to unassigned.
- **A gedu is on at most one group per product** (unique constraint); they can be on many *different* products.
- Cohorts differing only in gedu / voice room = multiple groups in one product; cohorts differing in schedule = separate products.

### Waitlist

- **Order is derived from `participations.waitlisted_at` (`ORDER BY waitlisted_at, id`), never a stored rank** — removing or promoting a row needs no renumbering. (`join_waitlist` stamps `clock_timestamp()` under the lock so concurrent joins get distinct ranks.)
- **No automatic promotion.** An admin promotes/demotes manually from the groups panel: `promote_from_waitlist` (→ active, place in a group/unassigned, **no seat-count gate** — a deliberate capacity override) and `demote_to_waitlist` (→ back of the line, and only for types that carry no subscription — see below). Both admin-gated, under the product lock.
- **Only one product type is billed as a recurring subscription, and that decides who may sit on a waitlist.** Consumer clubs are monthly subscriptions; camps and paid events are single upfront payments; municipality clubs are invoiced off-platform. So a subscription row exists only for a consumer-club participation — the distinction that matters here is *"requires a subscription"*, **not** *"is paid"*, and a paid camp with a waitlist is perfectly safe.
- **A waitlisted row must never carry a live subscription, and `demote_to_waitlist` refuses consumer clubs to guarantee it.** Joining a waitlist never creates a subscription (nobody has paid for anything yet), so the only way to reach that state was to take an already-active club member — who does have one — and move them onto the waitlist. That refusal is what makes the parent-facing leave safe to implement as an outright delete: the subscription link is `ON DELETE CASCADE`, so deleting such a row would drop the only record of a subscription that keeps billing. With the state unreachable, the delete path needs no subscription check of its own. The admin groups panel also hides the waitlist drop target for clubs, but that is an affordance, not enforcement — a rule that binds only callers who came through the drag handler is not a rule the database holds.
- **`get_waitlist_position`** is the parent/gamer "you're #N" read: `SECURITY DEFINER` to count past the caller's RLS, but **owner-authorized** and returns only the integer. Its **set-valued sibling, `get_my_waitlist_positions`**, answers for every row the caller is party to in one snapshot — what the dashboard band uses, because a per-card call would be an N+1 whose answers are also read at N different instants.
- **The dashboard read is split by status, and the two halves must stay disjoint.** The sessions read filters to `active` (rows with a placement and a schedule); the waitlist read filters to `waitlisted` (rows with neither). A row appearing in both, or in neither, is the bug to watch for when either filter changes.
- **A parent may leave a waitlist; a gamer may not.** `leave_my_waitlist_spot` is authorized to the purchasing parent (`customer_id = auth.uid()`) — the card's corner badge doesn't render for the gamer audience, and the database enforces the same split rather than trusting it. It answers "not yours" and "not real" identically so the id space can't be probed, and **deletes** the row (matching `cancel_participation`) because `participation_status` has no terminal member to move it to.

### Lifecycle & visibility

- **Effective status is derived, not cron-driven.** `status` stores admin facts only (`draft`, `pending`, `cancelled`, the `running` override); `pending → running` (start_date reached AND any threshold met) and `running → completed` (end_date passed) are computed at read time. **The TS helper (`effective-status.ts`) and the SQL `effective_status()` twin must stay in lockstep** — RLS/list filters call the SQL form.
- **`draft` means incomplete** (mandatory fields unfilled), not "hidden" or "unpublished"; draft rows get constraint escape hatches. **`draft` implies hidden** (DB-enforced). `is_visible` is otherwise orthogonal to status.
- The only manual lifecycle lever is `start_product` (the under-threshold override) — spec'd, not yet built. Cancellation fires refunds per type.

### Topic, location, voice

- **`topic` is a fixed Postgres enum** (`minecraft` / `fortnite` / `webinar`); the game-vs-subject split and labels live in code (`src/lib/products/topics.ts`), not the DB. No admin topic CRUD. Game labels are literals (never translated); subject labels localize.
- **Location rules:** in-person → `location_id` is a `site` (required); online muni → a country/region/municipality (required); online non-muni → NULL. **Muni residency is honour-system intent, not enforced** — never use `municipality_club` as a proxy for "free to all."
- **Voice rooms exist iff `is_remote`, one per group.** A gamer sees only their own group's room; a gedu sees every group's room on a product they're assigned to (emergency coverage); an unassigned participation has none.

---

## RLS topology

- **Admin = full access** on every table. **Writes are RPC-gated** — tables mutated by `SECURITY DEFINER` RPCs grant no INSERT/UPDATE/DELETE to `authenticated`.
- **Parents never see** `product_groups`, the per-group gedu roster, `site_staff_details`, a session's gedu note or its attendance, or a product's gedu-only lesson-material link. The parent-facing gedu list is `DISTINCT gedu_id` across the product's groups.
- **Gamers have no payment visibility**; customers see their own `payments`/`family_subscriptions` via `customer_id = auth.uid()`.
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
- One shared form shell (`product-form.tsx`) → per-section components; pure build/validate in `product-build.ts`; per-type field/shape config in `product-type-config.ts`; pre-prod feature locks in `form-locks.ts`, resolved per *product* rather than per type — the registration window is unlocked for muni clubs and events, and the seat count / waitlist for muni clubs and free events only, so an event's free/paid choice moves its own locks (see the seat-gate invariant above). Nothing in the form reads the lock constants directly; sections and the initial-state builder all go through the one resolver, which is what keeps a single place deciding. `create_product` / `update_product` are atomic (parent row + all child sets in one transaction).
- **Groups + waitlist management lives on the per-product details page, not the form** — one drag-and-drop panel (unassigned inbox + group columns + waitlist), writing through `apply_group_changes` (group structure) and the waitlist RPCs. Display order is server-side by recency; the client appends optimistically to match, so moves don't flicker.

---

## RPCs

Names by purpose — **read the signatures and bodies in `schema.sql`**. All `SECURITY DEFINER`, gate-locked where they touch seats or money.

- **Participation lifecycle:** `create_participation`, `confirm_paid_participation`, `join_waitlist`, `promote_from_waitlist`, `demote_to_waitlist`, `get_waitlist_position`, `get_my_waitlist_positions`, `leave_my_waitlist_spot`, `cancel_participation`.
- **Groups:** `apply_group_changes` (the sole write path for groups / gedu assignments / `participations.group_id`) + the read `get_product_groups_with_details` (groups + unassigned + waitlist snapshot).
- **Sessions (gedu):** the reads `get_gedu_group_feed` (one group's workspace in one round trip — stored rows, roster, schedule parameters; **no schedule expansion, the client owns the calendar math**) and `get_my_gedu_assignment_summaries` (one row per dashboard card, including the attention count, which is why the dashboard never fetches a feed); the writes `record_attendance` (one mark), `set_group_session_notes`, `set_group_notes`, `set_site_notes`, `set_group_member_minecraft`. All gedu-gated on the group assignment.
- **Sessions / lifecycle, still unbuilt — check code:** `product_has_session` exists (holiday-aware, service-role only); `cancel_session`, `reschedule_session`, `request_substitute` / `assign_substitute`, `start_product`, `cancel_product`, `finalize_completed_products` do not.
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
| Gedu session records (reads, writes, contracts) | `src/services/gedu-sessions/` |
| Occurrence ↔ row merge and entry kinds | `src/lib/gedu-session-feed.ts` |
| Gedu dashboard + group workspace | `src/components/gedu/`, `src/app/(dashboard)/gedu/` |

---

## Known gaps & traps

Things another agent would get wrong without this written down (the code doesn't announce them):

- **`update_product` nulls any editable column the form doesn't send** (it defaults every column to NULL). A field in the schema but not in `buildSharedFields` (e.g. `refund_policy_days`) gets wiped on the next edit. Fix shape: pass through unsent fields like `image_path` does.
- **The signup CTA stays active when no `product_prices` row exists for the viewer's currency.** The form validates all currencies but the DB doesn't enforce it; gate the CTA on price availability.
- **Events flip to "already started" at 00:00 on `start_date`**, not at the slot time (`effectiveStatus` goes `running` at local midnight). For events, combine `start_date` with the first slot's `start_time`. Correct for camps (cohort starts together).
- **The session cancellation/substitution ops, the lifecycle RPCs, admin participation removal, and the grace-access gates are spec'd but unbuilt** — verify in code before relying on them. (Session *records* — attendance, reports, gedu notes — did ship; see §Sessions.)

---

## Deferred (design-now constraints)

- **On-platform municipality billing.** Today muni invoicing is fully offline (`external_contract`); a future `billing_mode='municipality_account'` brings it on-platform. Design for it now by branching on `billing_mode`, never on `product_type='municipality_club'`.
- **Purchased-state `/shop/[id]` layout** (sub management, session calendar, attendance, add-another-gamer) — today an enrolled viewer gets `AlreadySignedUpPanel`.
- **Operational surfaces:** session cancellation / substitution UI, standalone holiday-calendar admin, an admin view of session records, lifecycle buttons + reporting dashboards. (Gedu attendance and reports shipped; the parent/gamer read of those reports has not.)

Feature wishlists and one-off follow-ups live in `TODO.md`, not here.
