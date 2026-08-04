# Family dashboards and club pages go live

Wire the signed-off preview bodies — the parent dashboard, the gamer dashboard, and the
family club/product page — into the real routes, backed by real data, and delete everything
the old design leaves behind.

## Problem

The parent and gamer dashboards are still session-level surfaces: a flat list of upcoming
session cards, an identity tile strip, and no product pages at all. Two concrete failures:

1. **Families cannot read session reports.** Gedus write a report for every session (the
   `group_sessions` table, rendered on the gedu workspace), with a public/staff split designed
   so one side is family-safe — and no family surface reads any of it. The only "Reports"
   affordance families have is an external Padlet link on the next-session card, and the gedu
   side has already retired Padlet (`material_url` is gedu/admin-only). The family link points
   at a wall nobody maintains.
2. **A parent cannot see what their child is enrolled in as a *thing*** — no schedule in
   words, no venue/address for in-person clubs, no group public note, no gedu names, no
   roster-free view of the club at all. The product name on a session card is plain text.

The redesigned pages exist as fixture-driven preview scenes (admin → UI Previews:
`parent-dashboard`, `gamer-dashboard`, `parent-club`, `gamer-club`), built to the repo's
"one body, two shells" rule: every page body is presentational and takes data as props. The
design has been reviewed and signed off from those scenes. This plan is the second shell —
swapping fixtures for services — plus the cleanup.

## Scale

Every parent and gamer account, weekly (the report-reading loop is the product's core
family touchpoint). This replaces both family dashboards outright.

## Decisions (settled — do not relitigate)

- **Parent dashboard is grouped by child**, one section per gamer (identicon + first name
  heading + a quiet Manage link to the existing gamer identity page), one enrollment card per
  (gamer × product) beneath, sorted running → waitlisted → finished, soonest session first.
  The My Gamers tile strip is absorbed by the headings; add-gamer is a quiet tile after the
  last section (full-strength card when there are no gamers at all).
- **Gamer dashboard keeps its welcome header and Yty grid**, and replaces the session list
  with the same enrollment cards grouped under dynamic type nouns (gedu convention: empty
  nouns are absent, an empty account is headed "Clubs").
- **The enrollment card states the schedule, not the next session** (shared schedule
  formatter); the next session lives in the Join button's locked label and the Live badge.
  Corner badges (payment problem > subscription ending) are **parent-only** — a child's card
  never carries a billing alarm. A **waitlisted** enrollment is a card in the same list whose
  footer sentence carries the queue position ("You're #3 in line — …", the
  `parent.waitlist.footerReassurance*` keys); it renders **no link, no chevron, no hover** —
  there is no page behind it yet.
- **Section pill names the children** (max 3 named entries; above that it collapses to one
  "Gamers" chip — measured on a 390 px viewport; the cap is arithmetic, never measured at
  runtime). Pill labels are width-capped with `title` + `aria-label` carrying the full name.
- **Family club pages are gamer-scoped**: one page per (gamer × product), "for Aino" in the
  masthead. Route shape mirrors the gedu workspace: `/parent/{clubs,camps,events}/[id]` and
  `/gamer/{clubs,camps,events}/[id]`, three thin shells per role over one component, keyed by
  **participation id** (unique per gamer × product, and what the dashboard card already
  holds).
- **The club page shows**: masthead (type eyebrow, product name, child identity line,
  schedule, date range for camps/events), Join (remote only; parent joins via the
  switch-profile flow, gamer via plain link), gedu first-name chips, group public note, venue
  name + public site info (in-person only), and the read-only session feed — one continuous
  timeline with the now-divider, upward-revealed future, month dividers, chunked past reveal.
- **Family reports render in full, never clamped.** The Read-more clamp is gedu-only (their
  feed is a work queue; the family's reports *are* the page).
- **Parents see their own child's attendance**; "Present" is a subtle positive, "Not present"
  is muted and neutral (the enum cannot yet distinguish planned from unexcused absence — the
  code comments at the mark chip and the future feed row document the planned-absence future).
  **Gamers see no attendance.** Nobody sees other children.
- **The shared feed machinery lives in `src/components/session-feed/`** (extracted; family
  components import nothing from `src/components/gedu/`). Shared strings live in the
  top-level `sessionFeed` message namespace.
- **The Padlet "Reports" link disappears from family surfaces** (it dies with the old
  session cards). The `padlet_url` column itself stays — its removal is a separate
  product/comms decision, not this plan's.

## Rejected alternatives (and why — do not rebuild these)

- **Product-scoped club page with a sibling switcher** — every planned future feature
  (per-gamer notes, gedu→parent contact, planned absence, attendance) is keyed on
  (gamer × product); a product page would grow tabs and ambiguity with each one. Two siblings
  in one club get two pages.
- **Type-noun grouping on the parent dashboard** — Clubs/Camps/Events is the gedu's workload
  taxonomy; parents navigate by child. (The gamer dashboard *does* group by noun: it has
  exactly one person on it.)
- **Session-level dashboard cards (one card per occurrence)** — the old design; it smeared
  one club into many cards and left nowhere to hang product-level facts.
- **Waitlist position as a corner badge** — the corner is the product's grammar for "needs
  attention" (payment, subscription ending, gedu backlog); a queue position is information,
  so it lives in the footer sentence.
- **Viewport-measured pill collapse** — the server must render the pill's final shape on
  first paint; measuring after hydration is the exact layout shift the house rules ban. (A
  CSS-only breakpoint-doubled pill is the sanctioned future upgrade if desktop ever wants
  more named entries.)
- **Clamped family reports** — declined; see decisions.
- **An empty-history placeholder line in the feed** — declined; a fresh timeline simply ends
  at the divider.

## Constraints discovered while deciding

- **Joinability must be derived per clock tick, never fetched as a boolean.** Every surface
  derives live/locked from the shared 30-second `useNow()` tick and the shared voice-window
  arithmetic in `src/lib/voice-window.ts`. A data shell that passes a precomputed `isOpen`
  flag reintroduces a bug the gedu side already fixed once (a baked-in flag disagreeing with
  the per-tick test). Shells pass schedule data; components derive.
- **Parent join requires a full-page navigation** after the account switch (house auth rule:
  cookie changes from server routes don't reach the browser client's singleton; only a
  document reload rebuilds it). The old next-session card's shape — intercept the join click,
  open the switch-profile dialog, then `window.location.href` — is the shape to reuse.
- **The family feed RPC must return a single JSONB document.** PostgREST's `max_rows = 1000`
  silently truncates *table selects* (see TODO.md), but a set-returning shape would walk into
  the same trap; one JSONB result is one row and immune. Give it a history-horizon anyway
  (payload size grows with club age; a weekly club is ~52 sessions/year) — a `p_limit`-style
  parameter defaulting to a couple of chunks' worth of past sessions, extendable by the
  client when the reader asks for earlier history (the UI already reveals the past in chunks
  of 10).
- **Hard privacy line for anything family-facing** (enforced structurally — the family
  components import only from the shared `session-feed` module, which contains no staff
  component; keep it that way): never `gedu_note` of any scope, never the roster or other
  children's names/marks, never parent emails, never `material_url`.
- **DB workflow**: new RPC ⇒ migration pushed and `database.types.ts` regenerated *before*
  committing; explicit `GRANT` (no default access, not even service_role); classification in
  the DB test suite's authorization spine (this RPC is **self-scoping** — parent reaches only
  their linked gamers' participations, gamer only their own); zod result schema in the
  feature's contracts file, parsed by a DB test against real RPC output in CI. DB tests run
  in CI only — push the branch to exercise them.
- **The old `parent.waitlist.reassuranceCustomer/Gamer` keys are live-load-bearing** for the
  *old* WaitlistCard until it is deleted, at which point they (and the old card's
  `positionLabel`/`positionValue`) become orphans to remove. The new card uses
  `footerReassuranceCustomer/Gamer`. History: an earlier draft mutated the shared keys and
  broke the live card; do not re-merge them.
- **A known, out-of-scope bug**: the next-occurrence resolver returns the *previous* week's
  session once a year on the DST-end day (25-hour local day; the `offset + 1 day` candidate
  matches the same weekday twice). It predates this work and affects the old lists too. Do
  not silently fold a fix into the port — it needs its own change with its own tests.

## Steps

Each step should leave the branch green (`type-check`, `lint`, `npm run test`) and is
independently verifiable.

1. **Data audit.** Read the rows the current dashboards fetch (the participations service's
   upcoming-sessions read and the waitlist read, under `src/services/`) against what
   `FamilyEnrollmentSummary` (`src/components/parent/enrollment-rollup.ts`) needs: product
   name/type/translations, schedule slots + timezone, remote flag, venue name, start/end
   dates, participation id, gamer id + first name, waitlist position, payment problem,
   cancellation info. Extend the existing reads with any missing fields (venue name is the
   likely gap) rather than inventing a parallel read. Read current DB state from
   `supabase/schema.sql` / `database.types.ts`, not from migrations.
2. **Row → summary mapping.** A pure function from those service rows to
   `FamilyEnrollmentSummary[]` grouped per gamer (enrolled and waitlisted unified into one
   list), unit-tested alongside the existing three-band sort test. This is the seam the
   fixtures currently occupy, so the mapping's output feeds the body unchanged.
3. **Promote the parent dashboard.** `/parent`'s route becomes a data shell around
   `ParentDashboardPageBody`: server-prefetch everything that decides geometry (family,
   enrollments, billing accounts — the first frame must be final, per house rule), wire
   `onAddGamer` to the existing add-gamer dialog, pass the billing card node as today, and
   give the Join buttons the switch-profile intercept + full-page navigation. Committing
   state follows the house pattern (flag set synchronously before `mutate`, never cleared on
   paths that navigate).
4. **Restore leave-waitlist.** The old dashboard's leave-waitlist affordance (corner badge +
   confirm dialog + the self-scoping DB function keyed on the customer) must survive the
   redesign — the new waitlisted card links nowhere, so without this step the action has no
   home. Add a quiet, parent-only "Leave waitlist" affordance to the waitlisted card reusing
   the existing confirm-dialog copy (`parent.waitlist.leave.*`) and mutation, with the same
   committing-state handling. Update the card's preview fixture so the affordance is visible
   in the `busy-family` scenario.
5. **Promote the gamer dashboard.** Same shape, simpler: self-scoped reads, plain-link join,
   no badges, no leave affordance. Welcome header and Yty untouched.
6. **Migration: the family feed RPC.** One SECURITY DEFINER function (suggested name
   `get_my_family_product_feed(p_participation_id, …)`) callable by `authenticated`,
   self-scoping for both roles: resolves the participation, verifies the caller is the
   participation's gamer or a parent linked to that gamer, and returns one JSONB document:
   product shell (name, translations, type, schedule slots, timezone, remote flag,
   start/end dates), group name + group public note, venue name + public site info for
   in-person products, gedu ids + first names, stored session rows (date, start/end
   snapshots, **report only**), and the *named gamer's* attendance marks. Nothing else —
   apply the privacy line above. Include the history-horizon parameter. Push migration,
   regenerate types, add convenience aliases, classify in the authorization spine, and add
   the DB test that parses real output through the zod schema.
7. **Service layer.** New feature directory under `src/services/` following the
   three-file pattern (service class taking the Supabase client; React Query hooks with a
   key factory; contracts holding the RPC result schema). Client-side feed building follows
   the gedu pattern: the RPC returns data, TypeScript expands the schedule into
   `FamilySessionEntry[]` (future occurrences + stored past rows) using the shared
   `session-feed` helpers.
8. **Club page routes.** Six thin route shells (`/parent/{clubs,camps,events}/[id]`,
   `/gamer/{clubs,camps,events}/[id]`) over one server workspace component
   (prefetch + `HydrationBoundary`, gedu-workspace style) over a client data shell over the
   existing `FamilyProductPageBody`. Wire the dashboard cards' `openHref` to the right noun
   path. Back links go to the role's dashboard. Add the routes to the proxy's role routing
   if the route groups need it (follow how `/gedu/clubs/[id]` is handled).
9. **Scenes become showcases.** The preview scenes keep rendering the same bodies over
   fixtures — that is the "showcase that cannot drift" half of the scene rule. Update the
   registry descriptions that call the bodies drafts, and re-verify every scenario still
   renders (the fixtures now exercise the *live* bodies).
10. **Cleanup — delete the old design.** For each candidate: grep for remaining consumers
    first, delete, and remove its orphaned message keys from **all five** locale files in the
    same commit. Expected dead after promotion (verify, don't assume):
    - The session-level dashboard components under `src/components/parent/`: the sessions
      section, next-session card, upcoming-session card, waitlist card, leave-waitlist
      badge (superseded by step 4's affordance), and the parent/gamer data-shell wrappers
      that fed them.
    - The My Gamers grid and any tile pieces nothing else uses (the profile-switch surfaces
      share some tiles — check before deleting).
    - The session-expansion library that produced one card per occurrence
      (`src/lib/upcoming-sessions.ts`-shaped), if the mapping from step 2 replaced its last
      consumer. The DST-bug caveat above applies to whatever resolver survives.
    - The Padlet "Reports" affordance and its keys.
    - Orphaned keys: the old waitlist card's position/reassurance strings, the old empty
      states, and anything else the deleted components alone consumed
      (`scripts/check-translations.mjs` and a key-grep pass keep the five files honest).
    - Style-guide demos (`/admin/ui-components`) of deleted components: remove or repoint to
      the enrollment card. The style guide must not demo components that no longer exist.
11. **Docs.** Add a colocated `CLAUDE.md` for the family product page directory (the privacy
    line and its structural enforcement, the no-clamp divergence, the planned-absence
    future, the feed-horizon contract) and register it in the root `CLAUDE.md` documentation
    table. Update `docs/products-architecture.md` if it references the Padlet/report flow.
    Remove any `TODO.md` items this work completes. **Delete this plan file last.**

## Acceptance criteria

- `/parent` and `/gamer` render the new bodies from live data; the preview scenes render the
  same bodies from fixtures; there is no third fork.
- A parent can open a child's club page and read every session report in full; a gamer can
  open their own; neither page can render a staff note, another child's data, a parent
  email, or a material link (verified by the DB test on the RPC's output shape *and* by the
  absence of any `gedu/` import under the family components).
- Attendance marks appear on the parent's club page only, worded neutrally.
- Join buttons on all six surfaces flip locked→live on the shared clock without reload.
- A parent can still leave a waitlist, with a confirm step, from the dashboard.
- Waitlisted cards are non-interactive apart from that affordance; finished runs sort last
  and render muted; corner badges never appear on gamer surfaces.
- The pill names ≤3 children and collapses above that; empty dashboards render the
  My Gamers / Clubs empty sections, not floating cards.
- No component, route, hook, or message key of the old session-level design remains; all
  five locale files are key-parallel; lint/type-check/unit/integration/DB suites green in CI.
- `docs/plans/family-dashboards-live.md` no longer exists.
