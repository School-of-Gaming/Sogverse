# Session substitutions

A gedu who cannot make a session says so; another certified gedu offers to stand in; an
admin approves. The absence and its answer are **one row**, and every surface in the
feature reads or writes that row.

## The word for it, per locale

The approved words are en "substitution" / "substitute", fi "tuuraus" / "tuuraaja" (native
speaker's choice, and deliberately not "sijaisuus"), sv "vikariat" / "vikarie", fr
"remplacement". They were each picked on their own merits rather than translated from the
English, so a locale reading oddly against it is not a defect to correct, and none of the
four changes without the owner's say. Identifiers spell the concept the American way while
the English copy is UK English, which the root `CLAUDE.md` states as a house rule.

## One row, four questions

`session_substitution_requests` is keyed by **(group, session date, absent gedu)** — the
absent *person* is the seat, because two primaries of one group can both be out the same
day. One row answers everything the feature needs to say:

- **Who is absent** — the requester, and the role they held when they filed. The role is
  taken at filing time and never recomputed: it is what the session will be *paid* as,
  and a later change to somebody's standing role must not rewrite a past afternoon's pay
  class.
- **Why** — a category and an optional note, **visible to admins only**. A `sick`
  category is health-related data about a contractor, so it rides on a document only when
  the reader is entitled to it (see "One shape, two readers" below).
- **Who stood in** — the substitute, and the admin who approved them.
- **What state it is in** — `open`, `substituted`, or `withdrawn`. Withdrawn is history:
  it changes nothing about who is expected and is the one status the feeds do not carry.

**A substitution with no request cannot exist**, and that is the design rather than a
limitation: every substitution exists because somebody was absent, so an admin recording
an off-platform substitution files the request on the absent gedu's behalf, already
substituted.

**`unfilled` is not a state.** A request nobody substituted on, whose date has passed, is
unfilled — derived from the date, so nothing sweeps and no clock runs. The queue simply
stops returning it.

## Who is expected is derived, never stored

*A gedu is expected at (group, date) iff they hold no non-withdrawn request for it, and
they are either assigned to the group or hold a `substituted` request for it.*

That one sentence is the whole model, and it is written twice — once as a SQL predicate,
once as the TypeScript derivation helper in `src/lib/` that the staff feeds attach to
every entry. The two are meant to be read against each other; a behaviour one has and the
other does not is a divergence, not a simplification. **Do not add a third.**

**Every write that can unseat somebody sweeps the requests it orphans.** An absence filed
by a person who no longer holds a seat at the session is not an absence anybody can
substitute for, and answering one would seat a sub for nobody and hand them the group's
workspace for the day. Clearing a substitution, withdrawing a request, re-pointing a sub
and — less obviously — **removing an assignment through the admin groups panel** all leave
somebody unseated, and the last of those is the trap, because it unseats without touching
a substitution row at all. The sweep is a fixpoint, because unseating cascades. Approval
re-asks under its lock as a second line of defence, and **refuses** rather than tidying
up: the refusal aborts the transaction, so a withdraw written beside it would be rolled
back with everything else.

**Two questions, two sources.** The derivation answers *who is expected*. The rows answer
*who did which job, in which role, for whom* — including a chain, where a sub asked for a
sub of their own and the link between the two is simply one person appearing as one row's
substitute and another row's requester on the same (group, date). Never force the second
question through the first.

## Every write is an RPC, and there is no route

Both tables grant `authenticated` nothing. Every read and write goes through a
`SECURITY DEFINER` function that asserts the caller's role in its own body — the same
posture the group session writes already use — so the browser client is all the transport
this feature needs, for the admin writes as much as the gedu ones. Nothing here touches a
server-side secret, so nothing here is worth a route: a route would add a hop and a second
place to get the authorization wrong.

**Refusals throw.** Every write is somebody pressing a button, and every refusal is news
they have to be told — the session was substituted while the dialog was open, the offer
went stale under an admin's approval, the request is already withdrawn. A refusal
swallowed into `null` is a button that did nothing and said nothing.

**The two optional reason parameters are omitted, never sent as null.** The type generator
never types an RPC argument as nullable, so the writers carry trailing SQL defaults and a
caller with nothing to say leaves the key out of the payload. Passing `null` does not
compile; passing an empty string stores one.

## One shape, two readers

There is exactly one wire shape for a request, built by one database function, and every
write returns it while both staff feeds' `substitutions` arrays are arrays of it. Six
copies of one shape is how six surfaces come to disagree about what a substitution request
is.

Three things on it are keyed to the **caller** rather than to the read, because the gedu
workspace's document is served to admins too:

- the reason and its note travel for an admin only;
- the offer count travels for an admin and for the requester on their own request — how
  many colleagues volunteered for somebody else's absence is not a third party's
  business, and offerers never learn who else offered;
- **who is absent** travels for an admin, for the requester themselves, and for **staff on
  the group** — and for nobody else. See below.

**The keys are always present**, emitted as JSON null where the reader is not entitled to
them. The document keeps one shape for both readers, so no client schema ever branches on
which keys arrived.

## Who is absent is a disclosure, not a field

The reader has to be entitled to the *name*, not only to the reason. Two surfaces are
entitled and they are entitled for different reasons, so the rule is stated per surface:

- **The group's workspace** names them, admin or not. It is reached only by staff on the
  group — assigned to its product, or holding a live substitution on it — and its session
  card draws "X is away, Y is substituting", which cannot be written without the name. The
  *reason* still travels for an admin alone, so a colleague learns that somebody is away
  and never that it was `sick`.
- **Every admin document** names them, because admin documents carry the reason already.
- **The requester** sees their own name, on their own request, by the same arm.

**A volunteer never does.** The pool list omits the absent gedu, and so does the document
the offer and the offer-withdrawal return — otherwise the anonymity would be one
button-press deep, which is exactly what it was until it was fixed. Those two writes parse
their result through a separate schema whose requester fields are nullable, so the
difference is a type rather than a comment; a withdrawal by somebody holding no offer is
**refused** rather than answered, because a write that writes nothing must not be a read.

The SQL flag that reveals the requester **defaults to closed**, so a caller added later
that forgets it conceals — a missing name on a screen, rather than a disclosure.

## The pool names the session, never the absent gedu

The list a gedu picks from carries the product, group, date, site-or-remote, topic,
language and the role's fee — and no absent person and no reason. Naming the absent gedu
half-reveals a private reason (everybody knows who is off sick), and the seat being
substituted belongs to the group rather than to a person the volunteer needs to know
about.

Its exclusion is the database's own *may substitute* predicate rather than a copy of its
clauses, so the list and the offer button cannot disagree: a session the caller is
expected at, one they have their own request on, and their own absence are all out by
construction. Certification is the only eligibility test there is — no coverage area, no
language match, no schedule-clash check.

**No instants travel.** The pool emits the date plus the product's timezone and slots, and
the client owns the calendar math, exactly as both feeds do.

## Filing is quiet and has two ways in; a filed absence is loud

**Rule: the action that *starts* an absence is deliberately out of the way, and
a request that exists is deliberately the loudest thing on its session card.**
The two halves are one decision *(owner, 2026-09)* and they are easy to undo
separately, which is why they are written down together.

Filing is **rare** — most educators will never press it — so it costs nothing on
the surfaces a gedu reads every day: on a session card it is one row inside the
header's overflow menu, not a band of the card, and on the Substitutions page it
is a quiet outlined control under the title. The act colour on that page belongs
to offering to substitute, which is what the page is asking of whoever is
reading it; a second filled button beside it would be two things competing for
one press. A control that is quiet still has to be **findable by somebody
looking for it**, which is what the overflow menu's `⋯` and its accessible name
buy: the reader who needs it goes to the session and asks what else can be done
with it.

**Two entry points, one form, one write.** The page's picker asks *which
session* and then renders the very same reason-and-note step the card's menu
opens — the same component, not a copy — because a second copy of two questions
is how one surface comes to ask something the other does not. The picker exists
because a gedu who cannot make a date knows the date, not the card it is on, and
the card's menu exists because a gedu already reading a session should not have
to go somewhere else to say they cannot make it.

**A live request is the opposite kind of fact.** Once it exists, it is what the
card is about — is anybody coming, and how do I take it back — so it is a panel
with a status treatment and the withdraw inside it, not a line of small print.
The two states are the ones the app already has: the *warning* treatment while
the seat is still open, because a session with nobody in it is the thing this
feature exists to prevent, and the *informational* one once a sub is approved,
because that is settled. No colour is invented for either.

**The two can never be on one card**, and nothing checks for that: a gedu
holding a non-withdrawn request is not expected at the session, so the menu's
own condition already excludes them. Do not add a second test for it — a card
that had both would mean the derivation was wrong, and hiding it is how the
divergence would survive.

## What the picker can and cannot know

**The picker lists the viewer's own upcoming sessions, expanded on the client
from the seats they already hold**, inside the same sixty-day window the pool's
read applies. The window is not a taste about list length: an absence filed
beyond it would sit in a queue nobody can see until it drifted into range, so
moving one bound means moving the other.

**What no read on that page carries is which of those dates the viewer has
already filed on.** The assignment rows are per seat and the summaries are per
card; a group's own document has the requests, but it is a whole club's history
and a page of seats cannot fetch one per seat — that is the same reason the
dashboard's badge is counted in SQL rather than out of a feed. So the picker
disables the rows it *knows* about — what it has just written itself, plus
whatever the surface hands it — and the write's own refusal is the backstop for
the rest, read inside the dialog with the draft still in place. Closing that gap
means a read that returns the caller's live (group, date) pairs, which is a
database change and has not been made.

## The queue is a page; a substitution taken is a session in a week

The open queue is a gedu's Substitutions page and nothing else renders it. What a gedu has
already been approved for is on that page too **and** on My SOG among their own groups,
because once it is theirs it is one of the sessions in their week like any other. So the
two halves of the word live in two places on purpose, and neither is a copy of the other:
the queue is other people's absences and expires, and the card is the reader's own
afternoon.

The queue is **ordered by how soon each session starts**, which is not the order the read
returns (date, then product), and the ordering is a pure helper in `src/lib/` rather than a
comparator inside a component. A session inside the next day is drawn with the app's
existing warning status; nothing else about the card changes, because a queue that shouts
in several registers at once is a queue nobody reads.

**Offering asks a confirm question and holds it open until the write settles; withdrawing
an offer does not ask at all.** Offering is refusable — the request may have been filled,
the session may have started — and the refusal is news the volunteer needs before they
move on, which is what the holding mode is for. Withdrawing is the undo of a decision
already made, so a question in front of it would be a question about a question.

## Access, and the two places it is narrower

A substitution is **visible** from approval and **reachable** from 48 hours before the
substituted session. On My SOG the sub sees the afternoon they took the moment it is
theirs; the group's own surfaces — the workspace, the feed, notes, roster, member flair,
the game-account editor, the site notes — open at that session's start less 48 hours, and
stay open until 24 hours after the session's report is sent, or 15 product-local days
after the session date if it never is, and only while they are still certified.

Each of those two bounds has **one definition**, in SQL, in the predicate that owns it;
nothing in this directory restates either. The dashboard reads that draw the card ask only
whether the substitution has expired, which is why the card outlives the lock rather than
appearing with it.

Two consequences worth knowing before reading a surface:

- **A date the schedule no longer projects has no start, and fails OPEN.** An admin
  moving a group's weekday must not lock a sub out of an afternoon they actually ran and
  still owe a report for.
- **The group-wide surfaces are group-wide in both directions.** A sub holding two
  substitutions on one group reaches it from the earlier of the two openings, exactly as
  they keep it until the later of the two closings.

Two surfaces admit a substitute for the substitution **date** only, never for the group's
other dates: the **voice room** (both database predicates and the voice token route, which
mirrors them in TypeScript because it runs on the service-role client) and the **family
report mail**, which is at-most-once — a sub must not send a report for a session they did
not run.

**A session is not a day, and the voice room is the surface where that bites.** A session
dated Monday can run past local midnight, and one starting at 00:10 has its whole
pre-window on the day before — so "does this gedu substitute *today*" drops a substitute
out of the room and its chat at 00:00 and refuses them before a small-hours start. The
route knows which slot is open and asks about **that session's own date**; the SQL
predicates are handed a group and nothing else, so they accept a substitution dated
**today or yesterday** in the product's timezone. One day of overlap is the cost, and the
voice window is only open around a session, so there is nothing to rejoin on the extra
day. The membership and moderator predicates move together, always — the chat channel is
gated by the pair.

## The office has a page, and it is one read

`/admin/substitutions` is where an absence is answered — a sidebar entry of its own, not a
band on the admin dashboard, because every row is work somebody finishes today and a
session with nobody teaching it is too easy to scroll past on a board of standing
information. Its read, `get_admin_substitution_requests`, returns the page **whole**:
`open`, the queue, and `recent`, the requests settled in the last fortnight. One document
rather than two, so a single approval moves a row from one list to the other with no frame
in which it is in neither or in both.

`recent` exists because **"who stood in on Tuesday?" has no other home.** An approved
request leaves the queue, and the only surface still naming its substitute is the group's
own page, which an admin has to already know the group to reach. It carries withdrawals
too — "nobody had to stand in after all" is equally an answer — and it is bounded by the
**session date** rather than by when the row was resolved, because `approved_at` exists
only on a substituted row and a withdrawal stamps nothing, so the date is the one key both
statuses share. It stops at today: a settled *future* session is staffing the group page
owns.

**The page sorts by the session's own start; the read cannot.** No instants travel on any
substitution surface, so SQL orders by the calendar date and the client resolves each
request's occurrence from the slots that ride with it. Two products meeting on one day in
two zones would otherwise sit in an order saying nothing about which is next, on a list an
admin reads as a run of deadlines. An orphaned request — one whose weekday the schedule no
longer names — has no start, sorts on its day, and claims no urgency.

## Invalidation reaches four roots

A substitution write moves four roots, and the mutations invalidate all of them rather
than naming leaves. Roots, because a single write can move a group the caller was not even
looking at: unseating somebody cascades, withdrawing every request whose requester no
longer holds a seat on that date, and a client cannot know which those are.

The four are this feature's own key (both the gedu's pool and the admin page's document
live under it), both staff session documents, and the gedu's assignment rows — a live
substitution *is* a row there. The fan-out is stated once in the queries module, not per
hook.

## What this directory deliberately does not do

- **No notifications**, on any channel. In-app only.
- **No ranking and no eligibility beyond certification.**
- **No per-request fee override.** The role's fee is the product's, and a sub fee above
  the base is a follow-up nobody has asked for yet.
- **No affordance linking the session-card staffing editor to the permanent groups
  panel.** They are two tools answering two questions, and they are meant to look it.
