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

**Rule: family surfaces never import from `src/components/gedu/` — enforced, not
promised.** A `no-restricted-imports` zone in the ESLint config fails the build on any
import of gedu code from `components/family/`, `components/parent/` or
`components/gamer/`. The point is structural privacy: the staff note, the roster and the
completeness states must be unreachable from anything a family renders, and the family
entry types additionally have no field such data could arrive in. Widening this module is
how a new shared need gets met — never by a family component reaching into the gedu tree.

**Rule: a string both feeds render lives in a shared namespace, never under a role's.**
`sessionFeed`, `sessionBadge`, `productType`, `activityCard` exist for this. A shared
string under `gedu.*` means a copy edit for the workspace silently rewrites what a parent
reads — that bug shipped once; the namespaces are the fix.

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
