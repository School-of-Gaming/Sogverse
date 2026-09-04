# Session reminders & calendar integration — investigation

**Status: investigation, not a plan.** This records what we found and the direction we
lean, so a future session can turn it into a `docs/plans/` plan when we're ready to
build. Nothing here is committed scope.

**Superseded on one point (2026-09-04): the holiday calendar no longer exists.** The
feature was removed whole — three tables, the RPC arguments, the admin field and
`product_has_session` — so the "holiday-aware vs holiday-blind" split below is
history. Every expansion now applies the same rule (a session is any in-term date on a
slot weekday), which removes the trap rather than solving it: an outbound artifact
built today can use any expansion and get the same answer. The public product calendar
component named below — the one holiday-aware expansion in the app — was deleted in the
same change, having had no consumer since the detail page dropped it. Read the findings
below as the state on the research date; the rest of the investigation stands.

## The goal

Parents should learn about upcoming sessions without us running managed, per-session
scheduled jobs — in the same spirit as sessions themselves, which are derived from the
schedule on demand rather than materialized. Two candidate mechanisms: reminder emails,
and getting sessions onto the parent's own calendar so their calendar app does the
reminding.

## What the codebase gives us today (verified 2026-08)

- **Sessions are computed, not stored.** Occurrences are derived from
  `schedule_slots` + product date range in the product's timezone; a `group_sessions`
  row exists only lazily once there is a report/attendance to hold. The shared
  occurrence arithmetic lives in `src/lib/session-occurrence.ts` (with DST-safe
  primitives in `src/lib/enrollment.ts` and `src/lib/schedule-occurrence.ts`).
- **Three occurrence expansions exist with different holiday behaviour**, and this is
  the live trap for any outbound artifact *(superseded — see the note at the top)*:
  - `src/lib/session-occurrence.ts` — **holiday-blind** (dashboards and both session
    feeds, deliberately).
  - `src/components/calendar/compute-product-sessions.ts` — holiday-aware (public
    product calendar).
  - SQL `product_has_session` — holiday-aware, service_role-only.

  A dashboard row that ignores a holiday is tolerable; a reminder email or a calendar
  event for a holiday-skipped session is an outbound artifact that is flatly wrong.
  **Any feature here must use holiday-aware expansion**, and products-architecture
  already calls for unifying the three expansions — that unification is the first
  brick of either feature.
- **No cancellation/reschedule model exists.** `cancel_session` etc. are reserved RPC
  names only. So neither mechanism can express "tonight's session moved"; both are
  schedule-of-record features until that model exists.
- **Email transport is ready.** All app mail goes through one Brevo REST entry point
  (`src/lib/brevo.ts`) with locale-aware builders in `src/lib/email-templates/`.
  Caveats: one shared Brevo quota also delivers password resets (the verify-email
  route is Postgres-rate-limited for exactly this reason), and **no unsubscribe or
  notification-preference mechanism exists anywhere** — recurring reminder mail can't
  ship without one.
- **No live scheduled infrastructure.** `vercel.json` has no `crons`; `pg_cron` is
  installed and two retired jobs (migrations `00008`, `00042`) show the house shape —
  notably an idempotency table keyed on (enrollment, session date). No `/api/cron/*`
  route or `CRON_SECRET` exists yet.
- **Family enumeration paths are all `auth.uid()`-scoped** (RLS + claims checks in
  `src/services/participations/`). A batch job or token-authenticated feed cannot
  reuse them as-is; it needs a service-role query or a new `SECURITY DEFINER` RPC.
- **Signed-token precedent exists** — `src/lib/email-verification.ts` (Edge-safe HMAC,
  domain-separated payload prefixes). Its own contract note says a token gating
  anything security-relevant needs more than that shape provides.
- **Nothing calendar-shaped exists.** No `.ics`, `text/calendar`, or Google Calendar
  link code anywhere. Greenfield.

## Direction we lean

**Calendar first, emails later (maybe never).** The calendar route is the genuinely
job-free version of the goal, and it delivers reminders through the parent's own
calendar preferences — which was the stated intent.

### 1. Subscribed ICS feed — the answer for clubs

A per-parent feed URL (`webcal://…`). On every fetch, the route computes the family's
upcoming sessions from the shared (holiday-aware) expansion and emits them as discrete
`VEVENT`s. No cron, no stored events, no sync state; schedule changes, new
enrollments, and end dates propagate because nothing is ever materialized. Clubs are
open-ended, so only a feed stays correct over time.

Decisions already made in discussion:

- **Scope: one feed per parent, covering the whole family** — every active
  participation where the parent is the `customer`, including their own adult seat.
  Waitlisted seats emit nothing; a canceling subscription stops emitting past its
  access-until date (reuse the dashboard's subscription-state clamp, not raw rows).
- **Event titles carry the gamer's name** ("Minecraft Club – Aino") — one calendar,
  one colour, so the title does the disambiguation.
- **Times are UTC instants** computed from the product timezone; the calendar client
  renders them in the viewer's zone. Sidesteps viewer-timezone handling entirely.
- **The URL is a credential** (it exposes a child's weekly whereabouts and is polled
  unauthenticated forever). Token design: a **random per-customer secret stored in
  the DB** — revocable and reissuable — *not* an HMAC-with-TTL token; calendar apps
  poll indefinitely, so expiry is the wrong tool and revocation is the right one.
- **Default reminder: one `VALARM`, ~1 hour before start.** Client reality:
  - Apple Calendar honours feed alarms; the parent can strip them per-calendar with
    the built-in "Remove Alerts" toggle (retroactive, all-or-nothing). Because it's
    all-or-nothing, we emit exactly one conservative alarm, not a day-before +
    hour-before pair.
  - Google Calendar strips `VALARM` from subscriptions; the parent's own per-calendar
    notification settings govern. Nothing we emit changes this — at most a line of
    help text pointing at the setting.
  - Outlook: treat as Google (ignores alarms, applies user defaults).
- **Known limit:** Google polls subscribed feeds on its own schedule (hours, up to
  ~a day, not forceable). Fine for a weekly schedule of record; not a channel for
  last-minute changes.

### 2. One-shot `.ics` download — the answer for camps/events

Fixed, known date range; short lifespan; unlikely to change after purchase — frozen at
download time is fine, arguably correct. A single `.ics` containing the discrete
events, downloaded while logged in (normal session auth, **no token infrastructure**),
possibly also attached to the purchase-confirmation email. Google Calendar imports
`.ics` files, so this covers all clients; the Google "template link" only handles one
event per click and isn't worth building for a series. This is the cheap first step
that validates whether parents use calendar integration at all.

### 3. Reminder emails — deferred; the shape if built

An email that arrives before an event needs *something* to wake up — that can't be
designed away. What can be eliminated is per-session scheduled state. The
low-maintenance shape:

- One **Vercel Cron** entry (declarative in `vercel.json`, version-controlled) hitting
  a secret-gated route every 15–30 min.
- The route derives "sessions starting in the next N hours × enrolled families" fresh
  each tick from the shared expansion, via a service-role read.
- The only state is a **sent-ledger** keyed on (participation, session date) for
  idempotency — the shape the retired `00008` cron used.

Rejected alternatives: pg_cron for the whole job (would require a second SQL copy of
the DST-sensitive occurrence math — the old `compute_next_session` was exactly that
and was dropped); third-party schedulers with one callback per session (per-session
built state, plus a vendor).

Blockers beyond the shared prerequisite: an unsubscribe/notification-preference
mechanism, and a look at Brevo quota headroom.

## Open questions for the plan

- **Per-gamer feeds** — one family feed can't be colour-coded or toggled per child.
  Cheap to add later (same route, filtered to one participant); not built up front.
- **Multi-adult households** — feed scope is "seats I pay for". A linked second adult
  who isn't the payer sees nothing under this rule. Revisit scope ("gamers linked to
  me"?) if two-household families become real.
- **Are reminder emails needed at all** once the feed exists? Decide after observing
  feed adoption.
- **Our-side alarm toggle** — a stored preference the feed route reads could disable
  `VALARM` emission for parents who want silence on Apple too. Skipped unless asked
  for; clients already provide the knob.
- **Sequencing** — the one-shot camp/event `.ics` is small enough to ship first as a
  probe of demand.
