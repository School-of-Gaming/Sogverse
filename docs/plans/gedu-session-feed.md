# Gedu session feed — past sessions, attendance, and session notes

## Problem

Sessions do not exist as things. Both dashboards compute upcoming occurrences at render
time by expanding a product's weekly `schedule_slots` forward from `now` (the shared
occurrence-expansion helpers in `src/lib/`); an occurrence has no identity, no row, no
URL, and disappears from every list the moment its voice window closes. Consequences:

- A gedu who ran a session yesterday cannot pull it up today. Attendance-taking and
  session notes — both coming requirements of the gedu job — have nowhere to live.
- Attendance will double as the gedu's official confirmation that they ran the session,
  which is how we verify they should be paid. Today there is no record at all.
- Parents/gamers have the same gap (notes are a static product-level Padlet URL that
  becomes unreachable when the club ends) — tracked in `TODO.md`, deferred here.

## Scale

Every gedu, every running club/camp/event. Once shipped, recording attendance is a job
requirement tied to pay — not an optional nicety. Parent/gamer narrative reading is a
later phase built on the same data.

## The decision

### Data model shape (decided now, built in a later step)

1. **A session is per (group, local calendar date).** Unique key: `(group_id,
   session_date)` where the date is the product-timezone local date. **One session per
   group per day is a deliberate architectural bet** — it blocks morning+afternoon camp
   days, which we don't allow and don't plan to. Record this trade-off in the migration
   comment on the unique constraint and in `docs/products-architecture.md` when built.
2. **Lazy materialization.** Schedule math stays the only source of the *plan*: admins
   freely edit dates/times/weekdays and nothing needs migrating, because future sessions
   are never rows. A DB row is created only when there is something to hold — a note,
   attendance, or a cancelled/skipped status. **Records beat projections:** the UI for
   any past range renders derived occurrences merged with materialized rows on the key;
   where both exist the row wins; a row whose date no longer matches the current
   schedule (orphaned by an admin edit) still renders — history doesn't retroactively
   change because the plan was edited. Rows snapshot their scheduled start/end at
   materialization (after a schedule edit it can't be re-derived) and carry
   created-by/updated-by + timestamps — the audit trail matters because attendance is
   pay confirmation, which inverts the incentive from "nag gedus to record" to "audit
   what they recorded".
3. **Two note fields from day one:** a public note (eventually parent/gamer-visible)
   and a staff-only note (gedu + admin). Never a single field — staff notes written
   under an assumption of privacy can never be retro-published (children's data).
4. **Attendance is explicitly recorded, never implied.** A session's attendance is
   **null until the gedu records it** — an untouched roster row must never silently
   mean "absent". When recorded, every roster member is explicitly present or absent
   (stored as an enum-ready status string so `late`/`excused` later are additive),
   and the editor offers a "mark all present" shortcut so the common case stays one
   action. **Attendance is mandatory — it doubles as the ran-confirmation tied to
   pay; notes are optional.** "Needs attention" therefore means exactly: past, not
   skipped, attendance unrecorded — even when notes exist.
5. **Skip/cancel is just materialization:** a row with a status and no attendance is
   both the record that "week 5 didn't happen" and the queue's "nothing to record"
   escape hatch.
6. **Enforcement epoch:** a constant in code, set when the feature ships. The
   work-owed lower bound is `max(product start, epoch)` — pre-existing clubs owe
   nothing for their history. Pre-epoch gaps render muted ("no record"), never as
   alerts. Not a column, not admin-configurable.
7. **Permissions:** any gedu assigned to a group can edit attendance/notes of any
   session that group ran. Admin can override anything (admin UI out of scope).
   Peer-group feeds are not visible in v1 (neither read nor write) — the schema must
   not block opening read access later.
8. **Future sessions materialize too, but only for planning fields.** A session row
   for a *future* occurrence may hold notes (a forward-looking note acts as a
   reminder / a plan families can read). It may never hold attendance or a
   ran/skipped status — those are records of what happened and only attach once the
   session is past. A **needs-substitute flag** (a gedu declaring they can't run a
   future session) remains a schema-level intention, but its **UI is deliberately
   out of scope for this design** — deferred to keep the first release tight;
   nothing in the mock renders or edits it.
9. **Server-side write validation is loose:** reject dates before the product start
   or beyond the visible future horizon; accept anything plausibly matching the
   current schedule; enforce the past-only rule for attendance/status per point 8.
   Strictness beyond that buys little (an admin edit can orphan any row a day later
   anyway) and risks blocking a legitimate write-up right after a schedule fix.
10. **Group-level notes, distinct from session notes:** each group carries a
    persistent public note (parent/gamer-visible later) and a persistent staff note
    (gedu + admin) — standing information about the group rather than any one
    session. Same two-audience split and the same never-retro-publish rule.
11. **Product-level material link (gedu/admin only):** a URL to lesson/material
    content for the people running the product — separate from the Padlet URL,
    which is the family-facing one. Never shown to parents/gamers.

### UI shape

**One blog-like feed per group — the group's story.** Strictly descending by date:
future at the top, past below, down to the product start. No per-session pages:
reading history is scrolling, not clicking.

- **Future horizon:** the same rule as the existing upcoming-session lists — open-ended
  products show the next 8 occurrences, end-dated products every occurrence to the end.
  The **next** session stays the prominent entry (live/join-voice state); everything
  beyond it collapses by default behind a "later sessions" row above it (count shown,
  and any needs-substitute flags surfaced on the collapsed row so they can't hide).
  Expanding is user-triggered and animates; global date order is never violated.
- **Future entries are editable for planning fields only**: forward-looking notes and
  the needs-substitute toggle — no attendance checklist, no didn't-run.
- **Long histories must stay navigable** — a year-old club is 50+ sessions. Render the
  recent past (~10 entries) and put the rest behind a chunked "show earlier sessions"
  reveal; month dividers as the feed crosses month boundaries keep a long scroll
  scannable. Recent sessions are always the cheapest to reach.

Each past entry renders inline:

- **Date + status** — recorded / skipped / missing.
- **Public note as the entry body** — this is the "blog post".
- **Staff note visually distinct** (muted treatment + lock icon) so the two audiences
  never blur, even while only gedus can see the page.
- **Attendance as a compact summary line** (e.g. "6/8 present") expanding to the
  per-gamer roster.
- **A missing post-epoch session renders as an inline gap entry** with alert
  treatment — the "work to do" queue is the set of gaps in the feed, not a separate
  surface. Pre-epoch and pre-start gaps render muted or not at all.
- **Editing expands in place** — click a gap or an entry, it expands into the editor
  (attendance checklist + both note fields), saves back into place. Expansion is
  user-triggered so allowed under the layout rules, but must animate and expand
  *downward* so the entry's own controls don't move under the cursor.

Entries are always anchored to a session occurrence — there is deliberately no
free-floating "post to the club" action (announcements would undermine the
attendance-is-pay-confirmation anchor; if wanted, that's a different feature). The
place for standing, non-session information is the **group identity band above the
feed**, which carries the group-level public + staff notes (inline-editable, same
two-audience treatments as session notes). The **product header** carries the two
product-level links side by side: the Padlet (family-facing) and the material link
(gedu/admin-facing).

The full per-scope requirements matrix the mock must represent: per **session** —
attendance, public note, staff note (+ needs-substitute on future ones); per
**group** — public note, staff note; per **product** — material URL (staff) and
Padlet URL (families).

### Product page layout (decided in feedback round 2 — desktop-first workspace)

Gedu (and admin) surfaces are **desktop-default** — assume ~16:9/16:10 and use the
width; mobile must work but is secondary. (Parents and gamers remain mobile-first;
this split is a deliberate site-wide convention.) The first single-column draft
flattened product/group/session scopes into one equal-weight pile of cards and
duplicated the Join affordance; the decided layout separates them:

- **The page is the group's workspace**, not a product page listing groups. No
  "Your group" card — the gedu arrived by clicking their group; the group *is* the
  page.
- **Masthead** (full width, ~3 lines): back link; product context line (type label,
  product name, Padlet + material link chips — product scope lives here, and the
  material chip matches the Padlet chip's visual style); group identity line
  (group name, gamer count).
- **Group notes sit full-width directly under the masthead, on their own row** —
  the standing "About this group" panel reads before the columns split; the rail
  below holds the Group card first, then Other groups.
- **Desktop = two columns.** Main column (~2/3, capped at reading width): the
  timeline — a slim attention row ("N need write-ups", jumps to the first gap),
  the collapsed later-sessions block, the prominent next session, the chunked
  past. Reference rail (~1/3): two compact cards —
  1. **Group** — co-teachers, roster with parent emails, copy-all-emails.
  2. **Other groups** — the peer-cover scenario ("can you watch my room for 10
     min?"): one row per peer group with name, gedu chips, gamer count, and a
     live-state Join button. Peer rooms appear here and only here.
  (Group notes are not a rail card — they sit full-width under the masthead,
  public note preview-first since it is what families will see, gedu note in its
  padlocked treatment, inline-editable.)
- **One Join per room on the whole page**: the gedu's own room only on the
  next-session timeline entry; each peer room only on its rail row.
- **Mobile**: single column — masthead, timeline, then the rail cards stacked
  below. The weekly loop (read last week, join, write up) stays first.

Copy & treatment decisions (feedback round 3):

- The attention state is called **"Needs attention"** (not "needs a write-up" —
  attendance is the mandatory part, notes are optional) and renders as an alert
  icon + label on an otherwise normal card: no tinted card background.
- The gedu/admin note audience is labelled **"Gedu"** ("Gedu only" etc.) — admin
  visibility is implied; never "Staff" or "Team" in user-facing copy.
- **One edit affordance everywhere**: every editable entry (past or future) uses
  the same icon+text "Edit" control as its click target — no "Plan" label, no
  whole-header click targets.
- The collapsed future block is labelled **"N more upcoming sessions"** so the
  feed's future→past direction is self-evident.
- **No aggregate jump chip** above the timeline — the per-card alerts are the
  queue signal on this page (the dashboard badge remains the cross-product one).

The gedu dashboard gets only an **aggregate alert badge** on the product card ("N
sessions need attention") linking into the feed — no separate queue UI. The feed itself
becomes the spine of the existing gedu product detail pages
(`/gedu/clubs|camps|events/[id]`) for the gedu's assigned group.

### Full-page preview scenes (mock-first page iteration)

The `/admin/ui-components` style guide demos *components*; a dashboard redesign has to
be judged as a *page* — real chrome, real viewport, real scrolling. The repo already
has the seed of this: `/preview/*` routes (fixture-driven full pages, admin-gated in
the proxy, noindex, linked from the UI Components page) exist for the product detail
page and the purchase confirmation, but each is a hand-rolled one-off. Promote the
pattern to a registry-driven system:

- **One dynamic route** `/preview/[surface]/[scenario]` resolving against a central
  scene registry (unknown surface/scenario → 404). A scene declares its name, its
  scenario list, its chrome, and a fixture-driven render per scenario. The existing
  proxy rule admin-gating `/preview/*` covers every future scene with no new code.
- **Chrome is composed, not simulated.** The gedu/parent/gamer dashboard chrome is the
  header + dashboard layout *without* the admin sidebar — both plain importable
  components — so a scene renders the exact shell the role sees. The only honest
  difference is the viewer's own account in the header menu.
- **The UI Components page gains one generic "Full-page previews" section** that
  iterates the registry, so a new scene surfaces its links automatically.
- **A scene mocks the whole page as the role meets it** — every section present, e.g.
  the instant-voice-room card rendering with its action a no-op — so the page reads as
  the real thing. Pure-UI interactions (the feed editor) work against local state;
  backend-touching interactions are inert but render their real states.
- **Anti-drift rule (one body, two shells):** a scene never owns a layout. It renders
  the same presentational page-body component the live route renders — either the
  *live* body (showcase; cannot drift) or the *draft* body that will replace it
  (design in progress). **Promotion = the draft body becomes the route's body and the
  data shell swaps fixtures for service calls.** A scene that is a permanent third
  fork of a page is the rot this rule exists to prevent — never build one.
- Fold the two existing one-off previews into the registry (mechanical).

This is the general fix for "iterating a page-level change is expensive": UI iteration
happens in scenes before any wiring, and wiring happens once against a signed-off
design. Rejected alternatives: Storybook (a parallel build that loses the real app
shell, CSP, i18n providers, and theme — fidelity is the point); a `?mock=` flag on
live routes (fixture branches inside production data paths); iframing style-guide
demos (viewport and scroll behaviour would be a lie).

First scenes: the **gedu dashboard** (sessions band, aggregate badges, instant-voice
section) and the **gedu product page** with the feed as its spine — scenarios along
the lines of club-midterm, needs-attention-heavy, camp-daily (consecutive days — a
layout stress the weekly fixture never shows), and first-week (almost no history).

### Scope for this effort

Gedu side only. Out of scope, deliberately: parent/gamer read-only feed (later phase on
the same data), admin UI, the holiday calendar (see constraints), email/in-app nag
notifications (alert icons in the UI are enough for now).

## Rejected alternatives

- **Pre-generated session rows with reconciliation on schedule edits** — rejected hard.
  Admins fix typos and move weekdays; a reconciler must then decide which rows to move,
  merge, or delete, *including rows with attendance attached* — a sync problem with no
  clean answer. Lazy materialization deletes the class: future edits are free (nothing
  exists), and the untouched past self-heals (a typo'd start date creating months of
  phantom "missing" entries evaporates when fixed, because they were never rows).
- **Keying sessions by UTC instant or slot start time** — breaks on the most common
  admin edit (time-of-day fix). Local date survives everything except weekday moves,
  which the orphan rule (records still render) absorbs.
- **Per-session detail pages behind card clicks** — friction kills history-reading.
  The narrative (gedu prepping this week reads last week; parent reads the club's
  story) is the point of the surface.
- **A separate "needs write-up" queue list/page** — redundant; the queue is the gaps
  rendered inline in the feed plus the dashboard aggregate badge.
- **A boolean attendance column** — status string costs nothing now and avoids a
  bool→enum migration.
- **A rolling reach-back amnesty window** (only nag about the last N weeks) — the fixed
  epoch is honest (the obligation genuinely began on a date) and simpler.

## Steps

1. **UI-only mock — components.** Done: fixture-driven presentational components under
   `src/components/gedu/session-feed/`, demoed in `/admin/ui-components` (mock club,
   roster, all entry states, working inline editor on local state), strings in every
   locale. No schema, services, or API changes.
2. **Preview scenes (current step).** The registry + `/preview/[surface]/[scenario]`
   route described above; fold the two existing one-off previews in; build the gedu
   dashboard scene and the gedu product-page scene rendering the *draft* page bodies
   with the session feed as the product page's spine. Admins reach every scene from a
   **"UI Previews" page in the admin sidebar** (below UI Components) that enumerates
   the registry with descriptions — that page is the single home for the links.
   Page-level UX sign-off happens here — iterate on the draft bodies until the shape
   is right, covering the full requirements matrix above.
3. **Schema + services.** Sessions table (unique `(group_id, session_date)`, snapshot
   start/end, two note columns, status, needs-substitute flag, audit columns),
   attendance table (session × gamer, status string), group-level note columns (public
   + staff), product-level material URL column, grants + RLS + authorization-spine
   classification per the db rules. Backward occurrence enumeration added to the shared expansion helpers
   (today they only walk forward). The epoch constant. RPC(s) for the feed window,
   record upsert, attendance set — with db-test coverage for any Json-returning
   result schemas.
4. **Wiring (promotion).** The signed-off draft bodies become the live routes' bodies;
   the data shells swap fixtures for service calls. Layout does not change in this
   step — that is the whole point of iterating in scenes first.
5. **Docs + cleanup.** One-session-per-day bet recorded (migration comment +
   `docs/products-architecture.md`); the preview-scene system documented where the
   style-guide conventions live; TODO.md parent/gamer item updated; this plan deleted.

## Acceptance criteria

- **Mock steps:** the feed renders in `/admin/ui-components` with every entry state
  (upcoming with join, recorded, skipped, missing post-epoch gap, muted pre-epoch gap)
  and inline editing works against local state — done. The scenes step is accepted
  when the gedu dashboard and gedu product page render as full pages under
  `/preview/*` with every section present, scenarios switchable, lint + type-check
  clean, all locales translated. Kyle signs off on the page-level UX from a dev
  server before any wiring starts.
- **Feature complete:** a gedu can open any past session of their group back to
  `max(start, epoch)`, record attendance + both notes, skip a session, and see gaps;
  records survive admin schedule edits; the dashboard badge counts open gaps; nothing
  changes for parents/gamers.

## Constraints discovered while deciding

- **Two divergent occurrence expansions already exist:** the live dashboards' expansion
  ignores the holiday calendar entirely, while the unmounted calendar component's
  expansion honours it. Harmless while sessions are ephemeral UI; the moment backward
  enumeration drives "you owe a write-up" alerts, holiday-ignorance produces false
  nags for winter break. Accepted for now (holiday calendar is out of scope; the skip
  escape hatch clears a false gap in one click), but when the holiday work lands the
  expansions must be unified and made holiday-aware in both directions.
- The forward-occurrence helper contract only ever returns *future* starts;
  in-progress and backward walking need the DST-safe patterns documented in the
  shared occurrence helpers (`src/lib/`) — a naive `now − 7×24h` is wrong on DST
  transition days.
- Session dates are product-timezone local dates; rendered times follow the viewer's
  timezone per the root date/time rules.
- `messages/` files: no emoji, all four locales, Klingon may be playful.
- One session per group per day is baked into the unique key — revisiting
  morning+afternoon camp days means revisiting the key.
