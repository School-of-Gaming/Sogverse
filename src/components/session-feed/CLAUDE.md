# Session feeds — the shared machinery

The role-agnostic core of the session timeline that two surfaces render: the gedu
workspace feed (`src/components/gedu/session-feed/`) and the family club-page feed
(`src/components/family/product-page/`). This module owns everything both feeds must do
identically; the gedu module keeps everything that makes its feed a *workspace*.

## The dividing line

- **Shared (here):** the feed shell (one keyed list: entries, month dividers, the
  now-divider, rail markers), the feed-shaping helpers (partition, past window, newest
  past), month labels and session labels, the scroll-anchor machinery, the report
  renderer and its clamp arithmetic, the now-divider, the attendance tone tokens, and the
  `AttendanceMark` type.
- **Gedu-only (stays in `gedu/session-feed/`):** the editors, the completeness ladder and
  owed/attention derivation, attendance rosters and summaries, the staff-note block, the
  alert badge, partial-save handling, and the workspace's mock fixtures.

**Rule: both feeds classify an entry on the session's `endsAt`, and both compute the live
tag as the same conjunction** — `kind === "future" && startsAt <= now < endsAt`, with the
same exclusive end boundary, so the kind flips on the exact tick the tag stops being live
and no dead zone opens between them. A session in progress is `future` on both feeds: it
is the *current* session, not history. The builders stay separate — they emit different
shapes, and that is where the privacy line is drawn — but they must never disagree about
which side of the present a session is on. They are one timeline read by two audiences.

The staff feed used to split on the session's *start*, because its kind was standing in
for "may I take the register yet": making the running session `past` was how it reached
the record editor. That conflation is gone. Editability is asked directly now, against the
session's start, and the live entry carries the record editor exactly as a past entry
does. A daily 8:00–23:00 camp is what made the old behaviour untenable — it spent fifteen
hours calling the session in progress history and naming tomorrow as next.

**Rule: a feed takes its `now` as a prop from whoever owns its entries — it must not call
`useNow()` inside itself.** Entry kind, the live tag and editor selection are all derived
from the clock, so the entries and every derivation over them have to answer off *one*
instant. The gedu workspace **freezes** that instant while a session editor is open,
precisely so nothing can be reclassified under somebody typing into it; a feed component
reading the ticking provider itself would step straight around that freeze. The entries
would stay frozen while liveness advanced, and at the session's `endsAt` the mounted
record editor would be swapped for the notes-only one — destroying an unsaved register
mid-roll-call, with no error and nothing to retry. So the rule is structural: the clock
enters the feed as a required prop, and a surface with nothing to freeze simply passes
its own `useNow()`. A page may legitimately run **two** clocks — the gedu workspace's
voice window keeps reading the live one, because a Join button frozen mid-edit would lie
about whether a room is open — and the split is which of them may be stopped.

**Corollary: the predicates deciding which editor an entry opens are the component's own
rule, not a parallel one.** They live beside the gedu feed, take the same `now`, and are
built from one expression and its negation so they are total and disjoint by
construction. A component deriving its own inline version is how the two drift apart —
which they had, silently, because the drift is only observable on the incoherent
entries-and-clock pair the freeze bug produced.

**Rule: family surfaces never import gedu code — enforced, not promised.** One
`no-restricted-imports` zone in the ESLint config covers the whole family *path*, not
only its components: `components/family/`, `components/parent/`, `components/gamer/`, the
lib module that builds the family feed, and the family feed service. It bans two things —
the gedu component tree, and the gedu **session service entire**, which is in practice
the likelier leak, since that service exports the staff document shapes and a family
module importing one would compile, parse and render it. The one exception is the
attendance vocabulary, permitted by name through an allow-list. The point is structural
privacy: the staff note, the roster and the completeness states must be unreachable from
anything a family renders, and the family entry types additionally have no field such
data could arrive in. Widening this module is how a new shared need gets met — never by a
family module reaching into the gedu tree.

**Rule: a string both feeds render lives in a shared namespace, never under a role's.**
`sessionFeed`, `sessionBadge`, `productType`, `activityCard` exist for this. A shared
string under `gedu.*` means a copy edit for the workspace silently rewrites what a parent
reads — that bug shipped once; the namespaces are the fix.

## The attribution chip

**Rule: a card carrying a write-up is signed, in its bottom-right corner, on both feeds.**
The chip is one shared component in this module rather than a copy per surface: a report is
attributed the same way wherever it is read, and a chip that sat somewhere else — or said
something else — on the staff side would be inventing a distinction neither surface has. It
renders only where there is both a write-up (the shared trimmed test, so a report of one
newline signs nothing) and somebody to name. The corner is chosen for what it is far from:
both cards spend their header's right-hand side on a status, so the top corner would stack
against whichever status is up, and the bottom one is empty on every card in both feeds. It
is rendered as the card's **sibling** inside a plain relative shell, because it hangs half
past the card's edge and a card clipping its own overflow would cut it in two. Its label
comes from the shared `sessionFeed` namespace, and the positioned wrapper carries that label
as the accessible name for the whole chip — a bare first name read out on its own says
nothing about why it is there.

**Rule: the chip names the session's LAST EDITOR, not the report's author, and that
imprecision is a settled product decision.** The stored row's audit column is stamped by
every recorded touch — materializing the row, saving either written field, and each
attendance mark or unmark — so a gedu who only corrected a tick is named beside a write-up
somebody else typed. In practice the gedu who touches one part of a session touches all of
it, and a per-field author column was judged not worth the schema for that edge. **Do not
close the gap by adding a report-author column**; that is a new product decision, not a
refactor, and the field is named *last edited by* rather than *author* precisely so the
claim on screen stays true. Both halves of the pair — the id that seeds the identicon and
the first name — are required before anybody is named; either half missing is nobody.

**Rule: the staff feed hides the chip while that entry's editor is open.** Save and Cancel
sit in the bottom-right corner of the expanded card, exactly where the chip hangs, and a
chip floating over an unsaved draft would be claiming authorship of text that is not stored
yet. It returns when the editor closes, over whatever was actually saved. Folding a saved
draft into an entry locally carries the existing editor through rather than rewriting it,
for the same reason: the stamp belongs to the database, and the authoritative answer arrives
with the refetched row.

## Contracts the shell holds (and why they are load-bearing)

- **One keyed list, one boundary.** Future entries, month labels, the now-divider and the
  past render as a single keyed run. The divider's key is constant so its DOM node
  survives the future-toggle — the scroll correction measures against that node, and a
  remounted divider would take the measurement's anchor out from under it.
- **The future reveals upward with the viewport pinned, instantly.** The anchor is
  captured synchronously in the click handler, the scroll corrected in a layout effect
  before paint. Nothing animates that geometry: a correction chasing a transition re-runs
  every frame and is how the pattern breaks.
- **The past reveals downward by scrolling, over fully-loaded data.** An
  IntersectionObserver sentinel below the list reveals the next already-loaded chunk and
  re-arms after each reveal; it unmounts when nothing remains. Reveals are instant — no
  spinner, no skeleton — because the data is already in memory: feeds arrive as one
  document (a weekly club is ~52 sessions/year; paged fetching was rejected because the
  client projects past occurrences from the schedule, and a partial fetch makes stored
  reports silently render as "no write-up").
- **The report clamp is arithmetic, never measured**, so server and first client paint
  agree; the tolerance is documented beside the constants. In practice only the gedu feed
  clamps — the family feed renders every report in full, because reports are that page's
  content and the clamp exists for a work queue. Whether a report *exists* is a trimmed
  test on both sides of the stack: the dashboard's SQL twin uses `btrim` with an explicit
  whitespace list so a report of one newline is "no report" to badge and feed alike.
- **Attendance tones are tokens, not glyphs.** Present is a small success-toned positive,
  absent is muted neutral (never destructive — the data cannot yet distinguish a planned
  absence from a no-show). Each surface picks its own glyphs: the gedu's three-state set
  spends the dash on "unmarked", the family's two-state set uses it for "absent". When a
  `planned_absent` enum value lands, the tone decision extends here, once.
