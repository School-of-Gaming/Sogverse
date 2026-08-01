# Gedu session feed — sessions as records: attendance, reports, and the group workspace

## Problem

Sessions do not exist as things. Both dashboards compute upcoming occurrences at render
time by expanding a product's weekly `schedule_slots` forward from `now` (the shared
occurrence-expansion helpers in `src/lib/`); an occurrence has no identity, no row, no
URL, and disappears from every list the moment its voice window closes. Consequences:

- A gedu who ran a session yesterday cannot pull it up today. Attendance-taking and
  session reports — both requirements of the gedu job — have nowhere to live.
- Attendance doubles as the gedu's official confirmation that they ran the session,
  which is how we verify they should be paid. Today there is no record at all.
- Session notes for families live on a third-party Padlet URL that becomes unreachable
  when a club ends. This feature **replaces the Padlet**: the session report is the new
  home for what families read (the parent-facing phase is tracked in `TODO.md`).

## Scale

Every gedu, every running club/camp/event. Once shipped, recording attendance is a job
requirement tied to pay — not an optional nicety. Parent/gamer reading is a later phase
built on the same data.

## Current state — what is already built and decided

**The UI is done and signed off as fixture-driven preview scenes.** Steps 1–2 below are
complete: the presentational components, the draft page bodies, and the scenes went
through eight rounds of product-owner iteration. **The draft bodies in the repo are the
authoritative pixel-level spec** — where this document says what a surface does, the
code under `src/components/gedu/` (and its scenes under `src/components/preview/`)
shows exactly how it looks and behaves. The remaining work is the schema (step 3) and
the promotion/wiring (step 4). A fresh session implementing this plan should read the
scenes first: `/preview/gedu-product/{club,camp}` and
`/preview/gedu-dashboard/{default,clubs-only,unverified}`, listed on `/admin/ui-previews`.

Cross-cutting systems this work introduced are documented as rules in root `CLAUDE.md`
and are not restated here: full-page preview scenes ("one body, two shells"), authored
rich text (markdown storage, allow-list renderer, WYSIWYG editing, deterministic
first-paint decisions), the upward-reveal scroll-compensation corollary of the layout
rules, the mobile-first/desktop-default split, the "My SOG" naming rule, and the
fixture-UUID rule.

## The decision — data model (step 3 builds this)

1. **A session is per (group, local calendar date).** Unique key `(group_id,
   session_date)`, the date being the product-timezone local date. **One session per
   group per day is a deliberate architectural bet** — it blocks morning+afternoon camp
   days, which we don't allow and don't plan to. Record the trade-off in the migration
   comment on the unique constraint and in `docs/products-architecture.md`.
2. **Lazy materialization.** Schedule math stays the only source of the *plan*: admins
   freely edit dates/times/weekdays and nothing needs migrating, because sessions
   without records are never rows. A row is created only when there is something to
   hold — a report, a note, attendance. **Records beat projections:** the UI merges
   derived occurrences with materialized rows on the key; where both exist the row
   wins; a row orphaned by a schedule edit still renders — history doesn't
   retroactively change because the plan was edited. Rows snapshot their scheduled
   start/end at materialization (not re-derivable after edits) and carry
   created-by/updated-by + timestamps — attendance is pay confirmation, which inverts
   the incentive from "nag gedus to record" to "audit what they recorded".
3. **Two markdown fields per session, two audiences, never merged:** the **session
   report** (family-facing later — the summary parents receive, eventually by
   automatic email) and the **gedu note** (gedu + admin only). A note written under an
   assumption of privacy can never be retro-published (children's data). Both are
   markdown per the root rich-text rules; reports run ~500–1500 chars with light
   formatting (title, headings, bold, lists).
4. **Attendance is explicitly recorded, never implied, and saves partially.** A
   session's attendance is a per-gamer map of explicit marks (stored as an enum-ready
   status string — `late`/`excused` later are additive); an unmarked roster member is
   *unanswered*, never silently absent. Any partial state saves — a gedu may mark six
   children, save, and return for the two they're unsure of. There is deliberately
   **no "mark all present" shortcut** (bulk-confirm invites recording without
   checking) and a mark is revertable to unmarked. **Attendance is mandatory — it is
   the ran-confirmation tied to pay; the report is optional but never labelled
   "(optional)"** (the UI must not encourage skipping it).
5. **The completeness ladder** for a past session: attendance incomplete → **"Needs
   attention"** (warning); attendance complete without a report → neutral; attendance
   complete AND report present → **"Complete"** (success check). "Needs attention" is
   the work queue; the check is the target state.
6. **Completeness is judged against the roster as of the session date** (via
   participation start dates), not the current roster — otherwise a child joining a
   long-running club retroactively reopens every finished session. The mock uses the
   current roster because fixtures have no join dates; this correction is
   promotion-time work, not a mock defect.
7. **Future sessions materialize for notes only.** A future occurrence's row may hold
   the report/note fields (forward planning, reminders); never attendance. There is no
   "planned vs recorded" distinction in copy — notes are notes, on both sides of now.
8. **Deferred, schema-intention only, zero UI:** the skip/didn't-run status and the
   needs-substitute flag. Both relate to cancellation/substitution flows deliberately
   left undesigned; the schema may reserve the concepts, the mock renders and edits
   nothing of them.
9. **Enforcement epoch:** a constant in code, set when the feature ships. Work owed
   starts at `max(product start, epoch)` — pre-existing clubs owe nothing for their
   history; pre-epoch gaps render muted, never as alerts. Not a column, not
   admin-configurable.
10. **Permissions:** any gedu assigned to a group edits that group's sessions,
    attendance, and notes; admins can override anything (admin UI out of scope).
    Peer-group feeds are not visible in v1 — the schema must not block opening read
    access later.
11. **Loose server-side write validation:** reject dates before the product start or
    beyond the visible future horizon; accept anything plausibly matching the current
    schedule; enforce attendance-is-past-only. Stricter buys little (an admin edit can
    orphan any row a day later anyway) and risks blocking a legitimate write-up right
    after a schedule fix.
12. **Group-level notes:** each group carries a persistent public note and a
    persistent gedu note — standing information about the group, distinct from any
    session. Same two-audience rules. (Currently plain text in the mock; making them
    rich was deliberately not decided — see open questions.)
13. **Product-level material URL** (gedu/admin only): lesson-material link for the
    people running the product, rendered as a prominent button in the workspace
    masthead. Families never see it. The family-facing Padlet URL dies with this
    feature on gedu surfaces.
14. **Site notes surface for in-person products.** `site_details` (address +
    family-facing notes) and `site_staff_details` (gedu notes) already exist, keyed by
    `location_id`; every in-person product has a `location_id` (CHECK-enforced). The
    workspace renders both note sets, gedu-editable, with the site-scope honestly
    surfaced ("shared by every product running at this site"). **Gedus currently have
    only read policies on these tables — step 3 must add the write path** (policy or
    RPC, authorized via the gedu's assignment to a product at that site).
15. **Gedus can edit a group member's Minecraft username** — needs its own write path
    (scoped to gamers in the gedu's assigned group). Editing nulls the stored
    `minecraft_uuid` (a Mojang verification belongs to the name it was issued for);
    re-verification runs through the existing public `GET /api/minecraft/verify`.

## The decision — UI (built; the scenes are the spec)

**The gedu dashboard** groups one card per assignment under the type nouns — "Clubs",
"Camps", "Events" (only non-empty types render; short decoupled pill labels; no
umbrella heading — the nouns are the gedu's vocabulary). Cards are product-primary
(products have descriptive names; groups default to "Group A"), tiled in a responsive
grid, geometry-stable with no empty zones: the footer slot holds Join (online) or the
venue name (in-person — **in-person products render no join affordance anywhere, not
even locked**), the attention count is a solid iconed badge overlaid on the top-right
corner (the shared card-corner badge frame), liveness is a gradient wash plus a
success-toned Live badge, dates are absolute, and clickability reads from a chevron +
hover elevation. Cards sort soonest-first within each group.

**The product page is the group's workspace** (desktop-default, `max-w-7xl`, the
dashboard layout owning the gutter): masthead (type eyebrow, product name as the h1,
group name + gamer count as the identity line, the material button); a full-width
"About this group" row (group notes; plus the site's two note sets on in-person
products); then two columns — the session feed (~2/3, filling its column) and a
reference rail ("My Group": count top-right, centered own-room Join and
copy-parent-emails, open roster with two-line rows and the fixed-geometry Minecraft
username field with inline edit; then "Other groups": the peer-cover room switcher,
one centered Join per peer row).

**The feed** is one continuous list, strictly descending: future at top behind a
weighty **now-divider** ("N upcoming sessions") that reveals **upward, instantly, with
same-frame scroll compensation** — the reader's position never moves and the future is
read by scrolling up. Future entries carry info-toned "Future session" tags (the next
one "Next session" — prominent, but with no join button: **joins live on group
surfaces only, never session cards**). The future horizon matches the existing lists:
8 occurrences for open-ended products, everything to the end date otherwise (a
mid-run camp at 4 sessions/week legitimately shows ~16). Past entries render
attendance-first (compact marks/present line under the date header), then the report —
**the newest past report unclamped; older reports clamped deterministically** (a
source-text line estimate decides Read-more identically on server and client, never
revised by measurement; tolerance ~one line either way), then the gedu note in its
padlocked treatment. Editors (rich report + rich gedu note + attendance
Present/Absent toggle pills) open and close instantly; save/cancel anchors the scroll
to the content *below* the edited card. Long histories: recent ~10, chunked reveal
below, month dividers. The month/entry markers ride a timeline rail whose tones follow
the completeness ladder.

**Voice-room exit behavior (wiring step):** leaving a group voice room always returns
to that product's workspace — never history-back to wherever the gedu came from.
Predictable flow, simpler code.

## Rejected alternatives — do not relitigate

- **Pre-generated session rows + reconciliation on schedule edits** — the reconciler
  must decide moves/merges/deletes including rows with attendance attached; lazy
  materialization deletes the failure class and the untouched past self-heals after
  typo fixes.
- **Keying by UTC instant or slot start time** — breaks on the most common admin edit
  (time-of-day fix). The local date survives everything except weekday moves, which
  the orphan rule absorbs.
- **Per-session detail pages** — friction kills history-reading; the narrative feed is
  the point. Likewise a **separate "needs attention" queue page** — the queue is the
  gaps in the feed plus the dashboard badges.
- **Boolean attendance / implicit absence** — "unticked" meant two different things to
  the writer and the reader; explicit tri-state marks with partial saves is the only
  shape where the stored answer is unambiguous *and* incremental recording works.
- **A save gate requiring complete attendance** — rejected in favor of partial saves;
  the persisting alert is what brings the gedu back.
- **"Mark all present"** — rejected as lazy-attendance bait, despite being built once.
- **A rolling reach-back amnesty window** — the fixed epoch is honest and simpler.
- **Relative day phrasing ("Today/Tomorrow")** — deferred; absolute dates everywhere
  on gedu surfaces for now.
- **HTML (or ProseMirror JSON) as the stored report format** — markdown structurally
  cannot express an XSS payload, enforces the basics-only constraint at the storage
  layer, converts cleanly to email HTML, and migrates *up* losslessly if colors/images
  are ever wanted; the reverse migration is the painful one.
- **A measurement-corrected clamp** (seed then fix) — puts the affordance on screen a
  hydration after its text on exactly the borderline content; the deterministic
  estimate with a written-down tolerance is the accepted trade (root CLAUDE.md rule).
- **Animating anchored reveals / timed correction holds** — a correction fighting a
  transition re-runs every frame and is the fragile half of the pattern; instant
  geometry + one same-frame correction is the whole design.
- **Storybook / `?mock=` flags on live routes / iframed demos** for page iteration —
  the preview-scene system exists instead (root CLAUDE.md).

## Steps

1. **UI mock — components.** DONE (session-feed components, style-guide demos).
2. **Preview scenes.** DONE — registry, `/preview/[surface]/[scenario]`, the admin UI
   Previews page, the draft dashboard and workspace bodies, eight feedback rounds.
3. **Schema + services.** Sessions table (unique `(group_id, session_date)`, snapshot
   start/end, report + gedu-note markdown columns, audit columns; reserved concepts
   for skip/substitute only if cheap), attendance table (session × gamer, status
   string, partial-friendly), group-level note columns, product material-URL column;
   grants + RLS + authorization-spine classification per the db rules; write paths
   for **site notes** (14) and **Minecraft username** (15); backward occurrence
   enumeration in the shared expansion helpers (they only walk forward today); the
   epoch constant; RPCs for the feed window, record upsert, attendance marks — with
   db-test coverage for any Json-returning result schemas. The feed RPC must supply
   what the fixtures promise: group name + per-group gamer count on assignment rows,
   roster with parent emails (backend-guaranteed non-null), participation start dates
   for roster-as-of-session-date (6).
4. **Wiring (promotion).** The draft bodies become the live routes' bodies; the data
   shells swap fixtures for services; layout does not change in this step. Includes:
   the dashboard body replacing the live one, the workspace replacing the current
   session-details page (deleting its outlier self-gutter), voice-exit-to-workspace
   (see UI decisions), real Mojang verify + mc-heads skin wiring on the username
   field, and the live Padlet link's removal from gedu surfaces.
5. **Docs + cleanup.** One-session-per-day bet recorded (migration comment +
   `docs/products-architecture.md`); TODO.md parent/gamer item updated to inherit
   session reports (not the Padlet); this plan deleted.

## Acceptance criteria

- **Steps 1–2 (met):** every scene renders fixture-driven with all states; the
  product owner signed the design off from a dev server.
- **Step 3:** db tests green in CI, including the authorization spine for every new
  object and write-IDOR coverage for the new write paths.
- **Step 4:** a gedu can, against real data — open any past session of their group
  back to `max(start, epoch)`; record attendance partially and completely; write and
  edit rich reports and gedu notes; edit group/site notes and a member's Minecraft
  username; see gaps, ladders, and dashboard badges that agree with the feed; join
  their own and peer rooms from group surfaces only; and leave a voice room onto the
  workspace. Records survive admin schedule edits. Parents/gamers see no change yet.

## Constraints discovered while deciding

- **Two divergent occurrence expansions exist:** the live dashboards' expansion
  ignores the holiday calendar; the unmounted calendar component's honours it.
  Harmless while sessions are ephemeral; the moment backward enumeration drives
  "needs attention" alerts, holiday-ignorance produces false nags for breaks. The
  holiday calendar remains out of scope — accepted, revisit when it lands (the
  expansions must then unify, holiday-aware in both directions).
- The forward-occurrence helper only returns *future* starts; in-progress and
  backward walking need the DST-safe patterns documented in the shared helpers — a
  naive `now − 7×24h` is wrong on DST transition days.
- Session dates are product-timezone local dates; rendered times follow the viewer's
  timezone per the root date/time rules; month dividers are keyed in the viewer's
  zone.
- Reports will be emailed to parents automatically later — the markdown → email-HTML
  conversion (and a `text/plain` part) is that feature's job; nothing here may make
  it harder (another reason storage stays markdown).
- The `mc-heads.net` skin host is already CSP-allowed (`img-src`); scenes never hit
  it (bundled placeholder) — only live surfaces do.
- Five locales (`en, fi, sv, fr, tlh`); typographic apostrophes in messages; no emoji
  in messages.
- The one-session-per-group-per-day unique key blocks multi-slot days; revisiting
  morning+afternoon camps means revisiting the key.

## Open questions (deliberately undecided — do not silently resolve)

- **Group/site notes as rich text:** the shared two-audience panel serves four fields
  across two scopes; converting them to markdown converts family-facing fields nobody
  has decided on. Plain text until decided.
- **WYSIWYG links:** the renderer's allow-list currently styles `<a>` but the toolbar
  cannot produce links — a deliberate-inconsistency flag. Either drop `a` from the
  allow-list or add the button, in the same change, when reports-to-email forces the
  question.
