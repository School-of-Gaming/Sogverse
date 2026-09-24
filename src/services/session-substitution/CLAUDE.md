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
- **Why** — a category, always present, and an optional note, **visible to admins
  only**. An admin filing on a gedu's behalf states the category exactly as a gedu does. A `sick`
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

**An admin states a reason only when filing on a gedu's behalf** — seating somebody on a
seat with no live request. Wherever a request exists, open or already substituted and
being re-pointed, the gedu has said why: the admin is not asked again, and the seating
write is sent neither parameter, which it reads as "keep what is on the row".

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
from the seats they already hold**, under the app's one forward-looking rule and
not a horizon of its own: an open-ended product projects its next eight
occurrences and a dated one projects everything to its end date, which is what
every other list of what is coming shows. The session card carries the same
action under the same rule by construction rather than by a second test — a card
exists only for an entry the feed projected.

**A request filed beyond the queue's own window is not lost.** The gedus' pool
reads open requests dated **today or inside the next sixty days**, while the
admin page's queue has a lower bound and no upper one — so an absence filed
further ahead reaches the office immediately and joins the gedus' queue when its
date comes into range.

**A term of weekly clubs is a long list, so the picker is grouped by week** — the
viewer's week, Monday to Sunday — and opens on this week and next, which is
where nearly every absence is; the rest is one press away and reveals *below*
what is already on screen. Where the list spans more than one group it carries a
group filter, and a list that is one group's is never gated: a single club's
term is a scroll, not a wall.

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

**Being the backstop, the refusal has to say why** — "that didn't save, try
again" invites the same press forever — so one shared mapper turns it into a
line, by SQLSTATE and then by a fragment of the message, and **both** ways into
the write read it: the picker and the session card's own menu. Anything it
cannot place falls to the generic line, because the server's words are
untranslated and name uuids. Two of its answers also mean the seat is spoken
for, and the picker adds that row to the same in-visit set a successful filing
feeds, so a gedu is not offered the session again.

**The refusal that cannot be split is the authorization one.** Filing is
authorized *by the derivation* — you may file only for a session you are
expected at — and somebody already holding a live request is not expected at it.
So "you have already asked" and "you no longer hold that seat" are one error
with one message, and the line says both rather than guessing between them. A
second, distinguishable check for the first would be a third statement of the
derivation, which the rule above forbids.

**The picker also freezes its rows while its dialog is open.** The list is
expanded from a ticking clock, so a session ending would otherwise drop a row
under a reader mid-list and take the whole control away at zero; the snapshot is
taken at the press that opens the dialog and the next open picks up the fresher
list. What that costs — a row offered for a session that has just ended — is
paid by the write's own refusal, which now says so.

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
move on, which is what the holding mode is for. The question is also where the volunteer
learns the offer's weight: once approved, the session is theirs under their gedu contract and
there is no taking it back, so its wording states that plainly. Withdrawing is the undo of a decision
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

- **A date the schedule no longer projects has no start, so the 48 hours run back from
  product-local midnight of that date.** That is earlier than any real session on it
  would have opened — an admin moving a group's weekday must not lock a sub out of an
  afternoon they actually ran and still owe a report for — but it is **not** "open now":
  an orphan two weeks out is as shut as any other. The client restates that fallback
  rather than reading a missing start as an absent lock, because a card that unlocked
  early would link into a workspace every gate behind it still refuses.
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

## The office has a page

`/admin/substitutions` is where an absence is answered — a sidebar entry of its own, not a
band on the admin dashboard, because every row is work somebody finishes today and a
session with nobody teaching it is too easy to scroll past on a board of standing
information. It has two sections: the open queue, and below it the upcoming sessions that
already have a substitute — where an admin checks whom they approved and knows whom to
tell. Both come from one read, `get_admin_substitution_requests`, a bare array of open and
substituted requests dated today or later that the client splits by status, so an
approval moves a session from one section to the other in a single refetch. The second
section has **no actions**: changing or clearing a sub belongs to the group's page, where
the whole session's staffing is in view, so its cards link there and nothing else.

**An open request can be answered from its own card with somebody who did not offer.** The
card already names the seat — group, date, absent gedu — so the press opens the full gedu
picker directly and the confirm asks no reason. The picker can refuse only the absent gedu,
because this page's read does not carry the group's staffing; a colleague already due at
the session is refused by the write, read out in the holding dialog as an approval's
refusals are. That write is keyed by the seat rather than the request. A request the gedu
withdrew while the dialog was open reads to it as a fresh filing on their behalf, and a
filing needs the reason this confirm never asked, so the write refuses and the dialog says
the request was withdrawn. A request another admin settled meanwhile is not refused: the
write re-points the substitution they made at this sub. Closing that half means the write
taking the request's id — a database change not yet made.

**An offer on it carries the offerer's name and nothing else.** It used to carry the
certification queue's two standings so the page could draw the same chips, and they are
gone for a reason about the data rather than the design: *an uncertified gedu cannot hold
an offer.* The may-substitute predicate requires certification and guards every path that
creates one, approval re-asks it under the request's lock, and the office-arranged write
asks it too — so a "certified" chip stated something true by construction, and the one
case it could have caught (an offerer de-certified *after* offering) is refused at
approval, in words, on the row. The criminal-record stamp is children's-safety data about
a contractor, and it is not emitted to a surface that does not act on it — the RPC stopped
sending it, not just the UI.

**Approving asks first, and holds the question open until the write settles.** It seats a
person on a session and opens the group's workspace — roster, game accounts, notes — to
them 48 hours before it starts, which is not something one press should do; and the write
is refusable four ways, each of which an admin can act on differently, so the answer has
to arrive where the question was asked. It is the same shared holding dialog the gedu's
own "Offer to substitute" uses. **The four refusals are told apart by SQLSTATE and, for
the three that share `check_violation`, by a fragment of the message the migration
raises** — anything unmatched falls to the generic line, because the server's own words
are untranslated and name UUIDs. There is no "the session has already started" refusal:
that check is on the gedu's offer write and not on the approval.

**The page sorts by the session's own start; the read cannot.** No instants travel on any
substitution surface, so SQL orders by the calendar date and the client resolves each
request's occurrence from the slots that ride with it. Two products meeting on one day in
two zones would otherwise sit in an order saying nothing about which is next, on a list an
admin reads as a run of deadlines. An orphaned request — one whose weekday the schedule no
longer names — has no start, sorts on its day, and claims no urgency.

**Both sections are grouped by day, so the order is legible.** Each request sits under a label for
its product-local session date — never a date derived from its start, or the orphan would
have nowhere to go — soonest day first, and the cards therefore carry the clock face but not
the date.

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
