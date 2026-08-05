# Family dashboards and club pages go live

Wire the signed-off preview bodies — the parent dashboard, the gamer dashboard, and the
family club/product page — into the real routes, backed by real data, and delete everything
the old design leaves behind.

## Problem

The parent and gamer dashboards are still session-level surfaces: a flat list of upcoming
session cards, an identity tile strip, and no product pages at all. Two concrete failures:

1. **Families cannot read session reports.** Gedus write a report for every session (the
   `group_sessions` table, rendered on the gedu workspace) — and as of this branch, the
   report is *owed* work exactly like attendance (the gedu's needs-attention badge counts a
   missing report), precisely because the family surfaces below are built on it. No family
   surface reads any of it yet. The only "Reports" affordance families have is an external
   Padlet link on the next-session card, and the gedu side has already retired Padlet
   (`material_url` is gedu/admin-only). The family link points at a wall nobody maintains.
2. **A parent cannot see what their child is enrolled in as a *thing*** — no schedule in
   words, no venue/address for in-person clubs, no group public note, no gedu names. The
   product name on a session card is plain text.

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
- **Gamer dashboard keeps its greeting header and Yty grid**, and replaces the session list
  with the same enrollment cards grouped under dynamic type nouns (gedu convention: empty
  nouns are absent, an empty account is headed "Clubs"). The greeting now **names the
  child** — the draft body takes a `firstName` prop and renders `gamer.welcomeNamed`, so
  the promoting shell has to resolve the signed-in gamer's first name and pass it in. The
  live route still renders the nameless `gamer.welcome`; that key dies in the cleanup step.
- **The enrollment card states the schedule, not the next session** (shared schedule
  formatter); the next session lives in the Join button's locked label and the Live badge.
  Corner badges are **parent-only** — a child's card never carries a billing alarm. A
  **waitlisted** enrollment is a card in the same list whose footer sentence carries the
  queue position (`parent.waitlist.footerReassurance*`) plus the leave affordance (below);
  it renders **no link, no chevron, no hover** — there is no page behind it yet.
- **A purchased-but-unplaced enrollment (`group_id IS NULL`) is a first-class card state**:
  info-blue tone, footer says the awaiting copy ("matching with a Gedu" voice — the old
  design's awaiting state resurrected), **no link** (no group means no feed and no page,
  same logic as waitlisted), and no Join of any kind. This explicitly absorbs the standing
  TODO bug about an unplaced enrollment's Join looking joinable while doing nothing.
- **Leave-waitlist lives on the waitlisted card**: a quiet muted "Leave waitlist" text link
  under the footer sentence, opening the existing confirm dialog — the one interactive
  element on an otherwise inert card, exactly as Join is the one on a live card. Not a
  corner badge.
- **Cancellation behaves as the old dashboard did**: the enrollment is visibly marked as
  not renewing, the last covered session is identified as the last, and **nothing renders
  past the paid window** — the card's next-session, the dashboard sort, and the club page's
  future block all clamp at the access-window end.
- **Section pill names the children** (max 3 named entries; above that it collapses to one
  "Gamers" chip — measured on a 390 px viewport; the cap is arithmetic, never measured at
  runtime). Pill labels are width-capped with `title` + `aria-label` carrying the full name.
- **Family club pages are gamer-scoped**: one page per (gamer × product), "for Aino" in the
  masthead. Route shape mirrors the gedu workspace: `/parent/{clubs,camps,events}/[id]` and
  `/gamer/{clubs,camps,events}/[id]`, three thin shells per role over one component, keyed
  by **participation id** (unique per gamer × product, and what the dashboard card already
  holds). Only placed (grouped) enrollments have a page.
- **The club page shows**: masthead (type eyebrow, product name — the product name is the
  page's primary identity; the **group name renders as a secondary line for parents too**,
  even when it is still a default like "Group A"), child identity line, schedule, date range
  for camps/events, Join (remote only; parent joins via the switch-profile dialog — that
  intercept stays, it is what makes the shared "Join voice room" label honest), gedu
  first-name chips, group public note, venue name + public site info (in-person only), and
  the read-only session feed. **The club page also surfaces the enrollment's problems** —
  payment problem and cancellation state arrive as props and render as a notice, so the
  page a parent taps through to from an alarmed card never pretends nothing is wrong.
- **Family reports render in full, never clamped**, and **a placed family sees the group's
  full history** — including sessions from before their child enrolled. Group membership
  grants what any member of the group sees; back-reading is context, not leakage.
- **The feed's past reveals by scrolling, not by a button**: the whole history arrives in
  one fetch (see constraints), the feed renders its recent window, and a scroll sentinel
  (IntersectionObserver) reveals the next already-loaded chunk as the reader approaches the
  bottom. Revealing in-memory data is instant — no spinner, no skeleton, no layout jump
  (appending below grows away from the reader). The mechanism lives in the shared feed
  shell so both the gedu and family feeds behave identically.
- **Parents see their own child's attendance**; "Present" is a subtle positive, "Not
  present" is muted and neutral (the enum cannot yet distinguish planned from unexcused
  absence — the code comments at the mark chip and the future feed row document the
  planned-absence future). **Gamers see no attendance.** Nobody sees other children.
- **The shared feed machinery lives in `src/components/session-feed/`** (family components
  import nothing from `src/components/gedu/`). Shared strings live in shared namespaces
  (`sessionFeed`, the shared product-type labels), per the copy rule: share where the roles
  want the same thing, split only where their mindsets differ.
- **The Padlet "Reports" link disappears from family surfaces** (it dies with the old
  session cards). The `padlet_url` column itself stays — its removal is a separate
  product/comms decision, not this plan's.
- **`group_sessions.did_not_run` and `.needs_substitute` are dropped.** They were reserved
  for a cancellation feature that was cut from the gedu UI and is not being built now;
  the backend stops advertising it. (Verify nothing reads them, then drop in this plan's
  migration.)

## Rejected alternatives (and why — do not rebuild these)

- **Product-scoped club page with a sibling switcher** — every planned future feature
  (per-gamer notes, gedu→parent contact, planned absence, attendance) is keyed on
  (gamer × product); a product page would grow tabs and ambiguity with each one. Two
  siblings in one club get two pages.
- **Type-noun grouping on the parent dashboard** — Clubs/Camps/Events is the gedu's workload
  taxonomy; parents navigate by child. (The gamer dashboard *does* group by noun: it has
  exactly one person on it.)
- **Session-level dashboard cards (one card per occurrence)** — the old design; it smeared
  one club into many cards and left nowhere to hang product-level facts.
- **Waitlist position as a corner badge** — the corner is the product's grammar for "needs
  attention"; a queue position is information, so it lives in the footer sentence.
- **Viewport-measured pill collapse** — the server must render the pill's final shape on
  first paint; measuring after hydration is the exact layout shift the house rules ban. (A
  CSS-only breakpoint-doubled pill is the sanctioned future upgrade if desktop ever wants
  more named entries.)
- **Clamped family reports** — declined; the reports are the page.
- **An empty-history placeholder line in the feed** — declined; a fresh timeline simply
  ends at the divider.
- **A fetch-paged history horizon on the feed RPC** — rejected twice over. The client
  *projects* past occurrences from the schedule and merges stored rows onto them, so a
  partial fetch makes older sessions with real reports silently render as "no write-up" —
  wrong, not merely short. And the data never justifies the machinery: a weekly club is
  ~52 sessions/year; a five-year club is a few hundred small rows in one JSONB document.
  If a club someday genuinely outgrows one fetch, paged loading can be added behind the
  same scroll sentinel without the UX changing.
- **Clamping family history at the child's enrollment date** — considered, rejected: group
  membership grants the group's history.

## Constraints discovered while deciding

- **Joinability must be derived per clock tick, never fetched as a boolean.** Every surface
  derives live/locked from the shared 30-second `useNow()` tick and the shared voice-window
  arithmetic in `src/lib/voice-window.ts`. A data shell that passes a precomputed `isOpen`
  flag reintroduces a bug the gedu side already fixed once. Shells pass schedule data;
  components derive. **Corollary: the row→summary mapping runs client-side**, in a hook
  over prefetched rows (mirroring the existing upcoming-sessions hook): `scheduleLines`
  need locale + viewer timezone, and `nextSessionStart` must advance across ticks. The
  server prefetches the *rows* as `initialData`; the pure mapping runs in the client hook.
- **Parent join requires a full-page navigation** after the account switch (house auth
  rule: cookie changes from server routes don't reach the browser client's singleton).
  Reuse the old next-session card's shape: intercept the join click, open the
  switch-profile dialog, then `window.location.href`. The switch dialog needs the target
  gamer's `{id, role, first_name}` — the parent body has these from its per-gamer sections;
  thread them where needed.
- **The family feed RPC returns one JSONB document with the full history.** PostgREST's
  `max_rows = 1000` silently truncates *table selects* (see TODO.md); a single JSONB result
  is one row and immune, and the full-history decision above removes any windowing logic
  from the RPC entirely — it is the same shape as the gedu feed RPC, which argues this
  exact point in its own comments.
- **Hard privacy line for anything family-facing** (enforced structurally — the family
  components import only from the shared `session-feed` module, which contains no staff
  component; keep it that way): never `gedu_note` of any scope, never the roster or other
  children's names/marks, never parent emails, never `material_url`, never completeness /
  owed states (staff workflow).
- **DB workflow**: new RPC ⇒ migration pushed and `database.types.ts` regenerated *before*
  committing; explicit `GRANT`; classification in the DB test suite's authorization spine
  (this RPC is **self-scoping** — parent reaches only their linked gamers' participations,
  gamer only their own); zod result schema in the feature's contracts file, parsed by a DB
  test against real RPC output in CI. DB tests run in CI only — push the branch to exercise
  them. Check remote migration history before numbering (a number already in remote history
  is silently treated as applied).
- **The old `parent.waitlist.reassuranceCustomer/Gamer` keys are live-load-bearing** for
  the *old* WaitlistCard until it is deleted, at which point they (and `positionLabel` /
  `positionValue`) become orphans to remove. The new card uses `footerReassurance*`.
  History: an earlier draft mutated the shared keys and broke the live card; do not
  re-merge them.
- **The data gap is mostly on the waitlist read.** The sessions read needs `siteName`
  added (a locations-name embed gated on in-person). The waitlist read is deliberately
  thin (translations + position only) while the new card needs the type eyebrow, schedule
  slots, timezone and end date — widen it to roughly the sessions read's embeds. Keep the
  two reads separate (different secondary RPCs, different failure semantics).
- **Leave-waitlist goes through the existing client path** — the hook → service →
  role-gated `DELETE /api/participations/waitlist` route — not a direct RPC call from the
  browser (the RPC's grant posture would refuse it).
- **Statuses**: `active` + `waitlisted` are the whole live world (`reserving` is retired,
  `completed` is never written — cancellation deletes the row). "Finished" therefore means
  a dated product whose end date has passed; an open-ended club never enters the finished
  band. This matches the shared ended-on derivation.
- **Proxy needs no change** for the new routes — it gates by role-prefix scan, so
  `/parent/**` and `/gamer/**` are already covered (the gedu club routes needed nothing
  either).
- **A known, out-of-scope bug**: the next-occurrence resolver returns the *previous* week's
  session once a year on the DST-end day (25-hour local day). It predates this work and
  affects the old lists too. Do not silently fold a fix into the port — it needs its own
  change with its own tests.
- **Beware a name collision during cleanup**: there is an unrelated admin
  `waitlist-card.tsx` under `src/components/admin/products/groups/` — it stays.

## Steps

Each step should leave the branch green (`type-check`, `lint`, `npm run test`) and is
independently verifiable.

1. **Data audit.** Read the rows the current dashboards fetch (the participations service's
   upcoming-sessions read and the waitlist read, under `src/services/`) against what
   `FamilyEnrollmentSummary` needs: product name/type/translations, schedule slots +
   timezone, remote flag, venue name, start/end dates, participation id, gamer id + first
   name, group id (null = awaiting placement), waitlist position, payment problem,
   cancellation info (access-window end + last-session start). Widen the waitlist read and
   add the venue-name embed per the constraints above. Read current DB state from
   `supabase/schema.sql` / `database.types.ts`, not from migrations.
2. **Row → summary mapping.** A pure function from those service rows to
   `FamilyEnrollmentSummary[]` grouped per gamer (enrolled, awaiting and waitlisted unified
   into one list), clamping next-session and occurrence enumeration at the cancellation
   access window, unit-tested alongside the existing three-band sort test. Gamers sort by
   first name; the family read includes the parent's own profile — filter to gamers.
3. **Card and body gain their missing action props.** The enrollment card needs the
   awaiting state (info-blue, no link, awaiting copy — new state, new fixture coverage), an
   `onJoinClick` seam for the parent intercept, the leave-waitlist affordance (quiet link →
   confirm dialog, parent only), and the cancellation "last session" marking per the
   settled decision. The parent body threads these; the gamer body never receives the
   parent-only ones. Preview fixtures and scene descriptions update in the same change —
   the scenes are the signed-off record and must keep matching the bodies.
4. **Promote the parent dashboard.** `/parent`'s route becomes a data shell around
   `ParentDashboardPageBody`: server-prefetch the rows that decide geometry (family,
   enrollment rows, waitlist rows, billing accounts — the first frame must be final), run
   the client-side mapping hook, wire `onAddGamer` to the add-gamer dialog (**rehome the
   dialog and its open state** — they currently live inside the My Gamers grid this plan
   deletes), pass the billing card node as today, wire the join intercept + full-page
   navigation, and wire leave-waitlist through the existing mutation with the house
   committing-state pattern. Route metadata: the existing `generateMetadata` pattern with
   new `metadata.pages.*` keys ×5 locales.
5. **Promote the gamer dashboard.** Same shape, simpler: self-scoped reads, plain-link
   join, no badges, no leave affordance, no awaiting-intercept (an unplaced gamer sees the
   awaiting card, nothing to click).
6. **Migration: the family feed RPC (+ column drop).** One SECURITY DEFINER function
   (suggested name `get_my_family_product_feed(p_participation_id)`) callable by
   `authenticated`, self-scoping for both roles: resolves the participation, verifies the
   caller is the participation's gamer or a parent linked to that gamer, refuses an
   unplaced participation (no group → error the client renders as not-found), and returns
   one JSONB document: product shell (name, translations, type, schedule slots, timezone,
   remote flag, start/end dates), **group id** (the voice href and feed entry keys need
   it), group name + group public note, venue name + public site info for in-person
   products, gedu ids + first names, the **full** stored session history (date, start/end
   snapshots, **report only**), and the *named gamer's* attendance marks. Nothing else —
   apply the privacy line. The same migration drops `group_sessions.did_not_run` and
   `.needs_substitute` (verify no reader first). Push, regenerate types, aliases, spine
   classification, zod contract + DB test parsing real output (including: a parent of a
   *different* family and the gamer of a *different* participation are refused).
7. **Service layer + feed builder.** New feature directory under `src/services/` following
   the three-file pattern; hooks with a key factory (decide its relation to the
   participations key hierarchy so the leave-waitlist and cancellation mutations invalidate
   it — nesting under the participations keys is the default answer). The feed builder is a
   new `src/lib/family-session-feed.ts` beside the gedu one, reusing the shared occurrence
   primitives — do **not** generalize the gedu builder itself; the by-type privacy boundary
   is the point of the split. Future occurrences clamp at the cancellation access window.
8. **Club page routes.** Six thin route shells (`/parent/{clubs,camps,events}/[id]`,
   `/gamer/{clubs,camps,events}/[id]`) over one server workspace component (prefetch +
   `HydrationBoundary`, gedu-workspace style) over a client data shell over
   `FamilyProductPageBody`. Add the route helpers to `ROUTES` (a family analogue of the
   gedu's product-href helper) and wire the dashboard cards' `openHref`. **Add the two
   states the body does not yet have**: a structured loading skeleton (the feed RPC is a
   category-3 call — a term of rows plus prose — so the skeleton renders immediately,
   gedu-workspace style) and the refused/not-found state (the RPC rejects a participation
   that is not the caller's or is unplaced), with copy keys ×5 locales. Route metadata as
   in step 4.
9. **Scenes become showcases.** The preview scenes keep rendering the same bodies over
   fixtures. Update registry descriptions that call the bodies drafts, and re-verify every
   scenario still renders.
10. **Cleanup — delete the old design.** For each candidate: grep for remaining consumers
    first, delete, and remove its orphaned message keys from **all five** locale files in
    the same commit. Expected dead after promotion (verify, don't assume):
    - The session-level dashboard components under `src/components/parent/`: the sessions
      section, next-session card, upcoming-session card, the old waitlist card (NOT the
      admin one — see constraints), the leave-waitlist badge, and the parent/gamer
      data-shell wrappers that fed them.
    - The My Gamers grid and any tile pieces nothing else uses (the profile-switch
      surfaces share some tiles — check before deleting).
    - The per-occurrence expansion library (`src/lib/upcoming-sessions.ts`-shaped) and the
      waitlist-entry adapter (`src/lib/waitlist-entries.ts`-shaped) if the step-2 mapping
      replaced their last consumers. The DST-bug caveat applies to whatever resolver
      survives.
    - The Padlet "Reports" affordance and its keys.
    - Orphaned keys: `gamer.welcome` (the nameless greeting, kept alive only by the live
      route's own copy of the page — the draft body reads `gamer.welcomeNamed`), the old
      waitlist card's position/reassurance strings, the old empty
      states, and anything else the deleted components alone consumed
      (`npm run check-translations` plus a key-grep pass keep the five files honest).
    - Style-guide demos (`/admin/ui-components`) of deleted components: remove them, and
      **add a real section for the enrollment card** — it is reused across two role
      surfaces, which is exactly the case the style guide's own rules reserve a section
      for (all states side by side: live, locked, awaiting, waitlisted, in-person,
      finished, badged).
11. **Docs.** Add a colocated `CLAUDE.md` for the family product page directory (the
    privacy line and its structural enforcement, the no-clamp divergence, the full-history
    decision, the planned-absence future, the one-fetch + scroll-sentinel contract) and
    register it in the root `CLAUDE.md` documentation table. **Rewrite** the paragraph in
    `docs/products-architecture.md` that asserts the family-facing half isn't built — this
    plan falsifies it. Resolve the partly-completed TODO.md entries this work touches: the
    family read lands (delete that half), the `padlet_url` retirement remains parked
    (leave a precise remnant naming what is left and why). **Delete this plan file last.**

## Acceptance criteria

- `/parent` and `/gamer` render the new bodies from live data; the preview scenes render
  the same bodies from fixtures; there is no third fork.
- A parent can open a placed child's club page and read the group's full report history; a
  gamer can open their own; neither page can render a staff note, another child's data, a
  parent email, a material link, or any completeness/owed state (verified by the DB test on
  the RPC's output shape *and* by the absence of any `gedu/` import under the family
  components).
- An unplaced enrollment renders the awaiting card (info-blue, no link, no Join); its club
  page does not exist; the old looks-joinable-does-nothing bug is gone.
- A canceling enrollment shows nothing past its paid window anywhere — card, sort, or
  feed — and its last covered session is identified as the last.
- Attendance marks appear on the parent's club page only, worded neutrally.
- Join buttons flip locked→live on the shared clock without reload on both dashboards and
  both club pages; the parent's join always passes through the switch-profile dialog and a
  full-page navigation.
- A parent can leave a waitlist, with a confirm step, from the waitlisted card; the card
  is otherwise non-interactive.
- The feed's history keeps arriving as the reader scrolls, with no button, no spinner, and
  no layout shift; every stored report in the group's history is reachable and none ever
  renders as "no write-up" while a report exists.
- The pill names ≤3 children and collapses above that; empty dashboards render the
  My Gamers / Clubs empty sections, not floating cards.
- No component, route, hook, or message key of the old session-level design remains; the
  enrollment card has a style-guide section; all five locale files are key-parallel;
  lint/type-check/unit/integration/DB suites green in CI.
- `docs/plans/family-dashboards-live.md` no longer exists.
