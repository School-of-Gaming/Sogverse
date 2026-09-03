# Session reminders & calendar integration — investigation

**Status: investigation, not a plan.** This records what we found and the direction we
lean, so a future session can turn it into a `docs/plans/` plan when we're ready to
build. Nothing here is committed scope.

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
  the live trap for any outbound artifact:
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

## The verification tool that exists (2026-09)

**The feed design is still an open investigation.** Nothing above is settled, and
nothing below settles it. What has been built is a standing admin tool for
verifying a feed in isolation, so the open questions can be answered by looking
at real clients rather than by reasoning about them.

- **Where it is.** One route emits the calendar for a signed token, and the same
  route answers with the computed events as JSON for the preview. The module at
  `src/lib/calendar-feed/` holds the token, the option parsing, the reads, the
  occurrence walk and a hand-rolled RFC 5545 writer, and owns its own
  `CLAUDE.md`. The cockpit is a card on `/admin/testing`.
- **Two sources, one pipeline.** The card serves either a real customer or a
  **sandbox family** — a fake household, stored as one row per admin in
  `calendar_feed_sandboxes` and edited in place on the card. The sandbox exists
  because the question that matters is what a client does when the data
  *changes*, and the poll that would answer it arrives from a vendor's servers
  minutes to hours later, with no session and no browser; the edited family has
  to be in the database for that request to find it. Both sources map into one
  neutral seat shape before the expansion, so a sandbox demonstrates the same
  code a real feed runs.
- **The token is adequate for a sandbox and a stand-in for a family.** Both kinds
  are HMACs domain-separated under the shared PIN secret, with distinct prefixes
  so neither can ever answer as the other. A sandbox feed discloses an invented
  household, so the signature is the whole answer there and stays. A real
  family's feed is a child's weekly whereabouts behind a URL polled forever, and
  the stored, revocable per-customer secret named above is still what has to be
  built before any parent is given one.
- **Inherited limits.** The expansion is the shared holiday-blind walker, so a
  holiday-skipped session still appears — the unification named above is
  untouched and remains the prerequisite. Nothing emits `EXDATE`.
- **The canceling clamp is implemented**, through an explicitly-filtered
  service-role read of the subscription rows rather than the `auth.uid()`-scoped
  RPC the dashboard uses.
- **What can be compared**, all as query parameters so one family can be
  subscribed several ways at once: alarm (none/15/60/1440 minutes), title
  composition, discrete `VEVENT`s versus one weekly `RRULE`, UTC instants versus
  `TZID` wall clocks, horizon, whole-family versus one gamer, calendar name,
  colour, refresh hint, detail level, free-versus-busy, and whether the document
  states `METHOD:PUBLISH` at all (some readers treat a document that does as an
  iTIP message rather than as a subscription).

### Handing a feed to a calendar app

Three vendor gestures, and none of them takes a plain `https://` address. The
card offers them as three buttons — Apple Calendar, Google Calendar, Outlook —
with the raw address behind a quiet link for everything else.

- **Apple Calendar** takes the feed address under the `webcal://` scheme. That
  scheme is not a transport; the client fetches the same HTTPS address behind it.
  It is what tells the operating system this is a subscription rather than one
  static file to download once.
- **Google Calendar** takes an add-by-URL screen whose parameter must carry the
  `webcal://` form — an `https://` value is rejected outright.
- **Outlook.com** takes an add-from-web screen carrying the address and a name.
  A Microsoft 365 account uses the same path on its work host, which is
  deliberately not offered as a fourth button.

Two facts decide every one of them. A nested URL must be percent-encoded, or the
feed's own first `&` is read as the host's next parameter and the rest is lost.
And the feed has to be reachable over HTTPS from the public internet, because
the vendors' servers are what fetch it — a localhost address produces a link
that opens and then fails on their side.
