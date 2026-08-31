# The family product page

One enrollment, as the family in it reads it: the product and its schedule, the group's
standing notes and its gedus, the site or the Join, and the read-only feed of everything
that has happened. Six URLs render it — `/parent/{clubs,camps,events}/[id]` and the gamer
triplet — over one page. The type segment is vocabulary families use, not a routing
decision; the role root fixes the audience, which is the only thing that varies.

**The page is participant-scoped and keyed by participation id, not product id.** One page
per (participant × product): two siblings in one club get two pages, and a parent holding a
seat of their own gets one more. Everything the page carries is per-participant —
attendance today, planned absences and a line to the gedu tomorrow — so a product-scoped
page would have grown a person selector the moment the second of those landed. **Only a
placed enrollment has a page**: no group means no feed and nothing to show, so a waitlisted
or awaiting-placement card links nowhere and the read refuses the id.

**Rule: the participant is not always a child, and the copy has to know which.** The role
root fixes whose page it is; it cannot say who the page is *about*, because a parent
reaches their child's club and their own through the same `/parent` URLs. The page
resolves that by comparing the signed-in user with the feed's participant, and the answer
picks the second person over a name in three strings — the masthead attribution, the
failing-card notice and the won't-renew notice. **Never render the reader's own name at
them as though they were a third party** where second person is available; a page that
says "for Sanna" to Sanna reads as a page about somebody else who shares her name. The
Join follows the same fact from the other side: an account switch stands between a parent
and their *child's* room and between nobody and their own, so the self seat is handed no
join handler at all and the button stays the plain link it is on a child's own dashboard.

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
- **One `no-restricted-imports` zone fails the build on the crossing, and it covers the
  whole family *path* rather than only its components.** Five globs: the three component
  directories (`components/family/`, `components/parent/`, `components/gamer/`), the lib
  module that builds the family feed, and the service that fetches it. A gedu type pulled
  in at the lib or service layer reaches the page just as surely as one imported in a
  component. The zone carries two bans — the gedu component tree, and the gedu **session
  service entire**, which is the likelier leak: it exports the staff document shapes, and
  a family module reaching for one would compile, parse and render it.

**Rule: the attendance vocabulary is the one thing that crosses the zone, and it crosses
through a named allow-list.** `attendanceStatus`, `AttendanceStatus` and
`SUPPORTED_ATTENDANCE_STATUSES` are permitted names because they are a *vocabulary*
rather than a document shape: their members must match a single `CHECK` constraint in the
database. One of the three does the work — the family contracts file parses its
attendance field with the same zod enum the staff contracts declare — so **the wire
vocabulary is genuinely single-sourced at the service layer**. Widening the exception
means widening that allow-list deliberately, in the ESLint config where the next reader
will see it, never by relaxing the zone.

**Rule: the component layer deliberately does *not* share that enum, and the cost is a
second copy.** The shared feed module declares its own two-member mark type by hand
rather than deriving one from the service contracts, so that a role-agnostic component
module never depends on a role's service — and that hand-written type, not the imported
vocabulary, is what the family components actually consume. So the enum has two homes,
and **widening it is an edit in both**: the service-layer vocabulary and the shared
component type. A `planned_absent` member landing in one and not the other is the drift
to watch for, and it is the same change that extends the tone decision below.

## Reports are the page

**Rule: family reports render in full and are never clamped.** The clamp exists for a work
queue — attendance sheets and editors that last month's prose must not bury — and this
page is the opposite case: the reports *are* what the reader came for and they edit
nothing, so a Read-more would only put a tap between a family and the content. The clamp
arithmetic and the reasoning behind it live with the shared feed machinery; this surface
simply does not use it.

**Rule: a report card carries the chip of the gedu who last edited that session, for the
parent and the gamer alike.** Attendance is the parent-only signal on this feed because it
is a fact about the child that the adult paying for the club needs; who wrote the write-up
is a fact about the write-up, so both audiences get it. **Exposing that gedu's first name to
a family is deliberate rather than an oversight in the privacy line**: the page already
names every gedu assigned to the group by id and first name, and this is the same quantum of
information about the same kind of person. It travels *per session* instead of being
resolved against the group's gedus because the two sets genuinely differ — a session's last
editor may have left the group since — and resolving would leave the oldest reports
unsigned. Nothing else of the staff row comes with it: no creator, no gedu note, and the
wire schema is strict so nothing can arrive alongside it. The chip's placement, its
last-editor semantics and the accepted mis-attribution edge are all documented once, with
the shared feed machinery.

**A past session with nothing on it renders as a quiet line, not a card.** No report and
no mark means there is genuinely nothing to say about that evening, and a full card
holding one apologetic sentence would give an absence of paperwork the same weight as an
actual write-up. There is no placeholder for an empty *past* either: a timeline that
starts fresh simply ends at the divider, which reads as a club that has not met yet. A
feed with nothing in it at all does get a line, worded per audience.

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
feed read is a single self-scoping RPC returning **the participant**, the product shell, the
group, the site, the gedus, every stored session and that child's marks. The reveal
mechanism belongs to the shared feed shell — a scroll sentinel over fully-loaded data, no
button and no spinner — and the arithmetic ruling paging out is documented with it.

**What is worth repeating here is that paging was rejected twice and must not be
rebuilt**, because this is the surface that would want it. The client *projects* past
occurrences from the schedule and merges stored rows onto them, so a partial fetch makes
older sessions that have real reports render as "no write-up" — wrong, not merely short.
If a club ever genuinely outgrows one fetch, paged loading can be added behind the same
sentinel without the reading experience changing.

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

**Rule: an entry's kind splits on the session's `endsAt`, not its start — and both feeds
split there.** The only question either surface asks of the clock is whether the evening is
over, and a club running right now is emphatically not over: it is the session the family
is *in*, and the one the gedu is standing in. So an in-progress session stays `future` on
both, and that is a contract with the page rather than a preference: the Live tag is
`kind === "future"` conjoined with the session having started, which a start-based split
makes unsatisfiable. It would leave a club running right now below the divider as a quiet
"no write-up" line while next week was tagged "Next session". **The kind boundary and the
tag boundary are deliberately the same instant**, so there is no tick where one is true
and the other is not. The voice window is not part of this: it governs how long a *room*
stays joinable, which is a fact about the room, and stretching the kind to cover it would
manufacture entries that are `future` but not live.

The staff feed used to split on the *start*, and the history is worth keeping because the
reason was real: its kind was doing double duty as "may I take the register yet", since
making the running session `past` was how it got the record editor — and roll call during
the club is the whole point of that editor. Two questions wearing one flag. A long session
made the cost plain: on a daily 8:00–23:00 camp the gedu spent fifteen hours being told the
session they were teaching was history and that tomorrow was next, while a parent looking
at the same hour was correctly told it was today's. The staff side now asks editability
directly, against the session's start, and its live entry carries the record editor exactly
as a past entry does — which frees the kind rule to mean one thing on both feeds.

**Rule: the builders stay separate for the privacy boundary, not for kind semantics.**
They emit different shapes — one carries a gedu note, the whole group's attendance map and
an `owed` flag; the other a report and one participant's mark — and that is the whole reason
there are two. Sharing a kind rule does not make them mergeable, and the next person to
notice the classifiers agree should not read it as an invitation to fuse them.

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
