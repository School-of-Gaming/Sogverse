# The family product page

One enrollment, as the family in it reads it: the product and its schedule, the group's
standing notes and its gedus, the venue or the Join, and the read-only feed of everything
that has happened. Six URLs render it — `/parent/{clubs,camps,events}/[id]` and the gamer
triplet — over one page. The type segment is vocabulary families use, not a routing
decision; the role root fixes the audience, which is the only thing that varies.

**The page is gamer-scoped and keyed by participation id, not product id.** One page per
(gamer × product): two siblings in one club get two pages. Everything the page carries is
per-child — attendance today, planned absences and a line to the gedu tomorrow — so a
product-scoped page would have grown a child selector the moment the second of those
landed. **Only a placed enrollment has a page**: no group means no feed and nothing to
show, so a waitlisted or awaiting-placement card links nowhere and the read refuses the
id.

## The privacy line

**Rule: nothing a family renders may reach staff workflow.** Never a gedu note of any
scope, never the roster or another child's name or mark, never a parent email, never the
gedu-only lesson-material link, never a completeness or owed state. This is the hard
constraint the whole directory is arranged around, and it is enforced three ways rather
than remembered:

- **The types have no field for it.** The family entry carries a report and one child's
  mark; the staff entry carries a note, the group's whole attendance map and an owed
  flag. Narrowing the type rather than filtering in a component is what makes the
  guarantee a compile-time fact. Anything that would have to be stripped on the way in
  has nowhere to be stripped from.
- **The shared feed module holds no staff component.** Family components build their feed
  out of the role-agnostic session-feed module, which contains no note block, no roster
  and no editor at all — so a family page cannot acquire one by reaching for a
  neighbouring export.
- **`no-restricted-imports` zones fail the build on the crossing.** Two zones apply to
  `components/family/`, `components/parent/` and `components/gamer/`: one bans the gedu
  component tree outright, the other bans the gedu session *contracts*, which are the
  likelier leak — they export the staff document shapes, and a family module importing
  one would compile, parse and render it.

**Rule: the attendance vocabulary is the one thing that crosses, and it crosses through a
named allow-list.** `attendanceStatus`, `AttendanceStatus` and
`SUPPORTED_ATTENDANCE_STATUSES` are permitted imports from the gedu session contracts
because they are a *vocabulary* rather than a document shape: their members must match a
single `CHECK` constraint in the database, so a second copy would be a second source of
truth for one fact and could only drift into being wrong. Widening the exception means
widening that allow-list deliberately, in the ESLint config, where the next reader will
see it — never by relaxing the zone.

## Reports are the page

**Rule: family reports render in full and are never clamped.** The gedu's feed clamps
because it is a work queue — attendance sheets and editors that last month's prose must
not bury. Here the reports *are* what the reader came for, they edit nothing, and the
chunked past reveal already bounds how much lands at once, so a Read-more would only put
a tap between a family and the content. The clamp arithmetic still lives in the shared
module; this surface simply does not use it.

**A past session with nothing on it renders as a quiet line, not a card.** No report and
no mark means there is genuinely nothing to say about that evening, and a full card
holding one apologetic sentence would give an absence of paperwork the same weight as an
actual write-up. There is no empty-history placeholder either: a timeline that starts
fresh ends at the divider, which reads as a club that has not met yet.

**There is no `no_record` kind on this surface.** The staff feed distinguishes a
pre-epoch occurrence from a recent unwritten one because the enforcement epoch decides
what a gedu is owed for. To a family both are the same thing — a session that ran with
nothing written down — so the epoch never reaches here.

## Membership grants the group's history

**Rule: a placed family sees the group's whole history, including sessions from before
their child enrolled.** Group membership grants what any member of the group sees;
back-reading is context, not leakage. This was considered against clamping the feed at
the child's enrollment date and settled the other way. Their attendance on those earlier
dates is simply unmarked — nobody marked a child who was not there to mark.

**Rule: a cancelled enrollment renders nothing past its paid window, anywhere.** The
instant paid access ends bounds the occurrence walk, the dashboard card's next session
and the dashboard's sort alike — and it bounds *stored rows* as well as projections,
which is the case the walks cannot catch, since a row exists whether or not anything
projected it. A listed session nobody may turn up to is a promise the platform will not
keep.

## One fetch, and a scroll sentinel over it

**Rule: the whole history arrives in one JSONB document; the feed pages nothing.** The
feed read is a single self-scoping RPC returning the product shell, the group, the venue,
the gedus, every stored session and the named child's marks. The feed renders its recent
window and an IntersectionObserver sentinel below the list reveals the next
already-loaded chunk as the reader approaches the bottom — instantly, with no spinner, no
skeleton and no layout jump, because appending below grows away from the reader and the
data is already in memory. There is no More button.

**A fetch-paged horizon was rejected twice and must not be rebuilt.** The client
*projects* past occurrences from the schedule and merges stored rows onto them, so a
partial fetch makes older sessions that have real reports render as "no write-up" —
wrong, not merely short. And the data never justified the machinery: a weekly club is
~52 small rows a year. If a club ever genuinely outgrows one fetch, paged loading can be
added behind the same sentinel without the reading experience changing.

**Rule: the server returns data, the client does the calendar math.** Nothing on the
server expands a schedule. What comes back is the schedule parameters and the stored
rows; the walk forward, the walk backward, the merge of rows over projections and the
derivation of each entry's kind all happen client-side in front of one shared clock, so
entry kinds advance while the page is open and SSR agrees with the first client render.
Joinability is derived from that same tick and the shared voice-window arithmetic — never
fetched as a boolean.

**The page's loading affordance is decided, not discovered.** A club's entire history plus
every write-up on it is a perceptibly slow call by construction, so a structured skeleton
renders immediately. On a direct load nobody sees it: the route's server half runs the
same reads and hands them down, so the first frame is the finished page. The skeleton is
what a client-side navigation, a refetch and a failed prefetch land on. Only the back link
survives that swap, on the same pixel each time.

## Two kinds, split at the session's end

**Rule: the family feed is a second builder beside the staff one, not a generalization of
it — and the shape it emits is where the privacy line is drawn.** A builder generic over
both output types would have to take every field as optional and trust each caller to
pass the right subset, which is exactly the remember-the-rule arrangement the split
replaces. What the two share is the arithmetic, and that lives in
`src/lib/session-occurrence.ts` where both read it: a session's identity is a (group,
product-local date) pair — the row's unique key in Postgres — so a projection and a row
for the same day meet on the same map key, and a stored row wins outright where both
exist, snapshotted start and end included.

**Rule: a family entry's kind splits on the session's `endsAt`, not its start — this is
the deliberate divergence from the staff builder.** The staff split asks "may I take the
register yet", which is a start-time question; a family records nothing, so the only
question here is whether the evening is over, and a club running right now is emphatically
not over — it is the session the family is *in*. So an in-progress session stays `future`,
and that is a contract with the page rather than a preference: the Live tag is
`kind === "future"` conjoined with the session having started, which a start-based split
makes unsatisfiable. It would leave a club running right now below the divider as a quiet
"no write-up" line while next week was tagged "Next session". **The kind boundary and the
tag boundary are deliberately the same instant**, so there is no tick where one is true
and the other is not. The voice window is not part of this: it governs how long a *room*
stays joinable, which is a fact about the room, and stretching the kind to cover it would
manufacture entries that are `future` but not live.

## Attendance, and the planned-absence future

**Rule: a parent sees their own child's mark; a gamer sees none; nobody sees another
child's.** It is the same data either way — who it is *for* is what differs, so it is a
rendering decision rather than a data one. The mark exists so the adult paying for the
club knows whether their child turned up, and a child does not need their own page telling
them they were not there.

**Rule: unmarked is a third state and renders as nothing at all.** No mark means nobody
answered for this child on this date — a gap in the gedu's paperwork, not a claim about
the child — and a family reading "unmarked" would reasonably take it as the latter.

**Rule: absence is muted and neutral, never destructive-toned.** The attendance enum
cannot yet distinguish a planned absence from a no-show, so the wording and the tone must
carry no accusation: present is a small positive, not-present is quiet. When a
planned-absent value lands in the enum, the tone decision extends once, in the shared
session-feed module, and both surfaces inherit it.

## The refusal state

**Rule: a participation that is not the caller's, one that does not exist, and one that
exists but is unplaced all render the same card.** The read keeps the first two
indistinguishable on purpose — an error that told them apart would answer "does this id
exist" for any id anyone cared to try — and this surface collapses the third into them
too, because a family has nothing to *do* with any of the three answers. A genuinely
failed read lands here as well, an imprecision accepted on purpose: at that point there is
nothing to render either way, and a third state would be copy telling a parent about our
network rather than about their child. The card names no child, blames nobody, and points
at My SOG.
