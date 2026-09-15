# Session covers

A gedu who cannot make a session says so; another certified gedu offers to stand in; an
admin approves. The absence and its answer are **one row**, and every surface in the
feature reads or writes that row.

## One row, four questions

`session_cover_requests` is keyed by **(group, session date, absent gedu)** — the absent
*person* is the seat, because two primaries of one group can both be out the same day.
One row answers everything the feature needs to say:

- **Who is absent** — the requester, and the role they held when they filed. The role is
  taken at filing time and never recomputed: it is what the session will be *paid* as,
  and a later change to somebody's standing role must not rewrite a past afternoon's pay
  class.
- **Why** — a category and an optional note, **visible to admins only**. A `sick`
  category is health-related data about a contractor, so it rides on a document only when
  the reader is entitled to it (see "One shape, two readers" below).
- **Who stood in** — the cover, and the admin who approved them.
- **What state it is in** — `open`, `covered`, or `withdrawn`. Withdrawn is history: it
  changes nothing about who is expected and is the one status the feeds do not carry.

**A cover with no request cannot exist**, and that is the design rather than a
limitation: every cover exists because somebody was absent, so an admin recording an
off-platform substitution files the request on the absent gedu's behalf, already covered.

**`unfilled` is not a state.** A request nobody covered, whose date has passed, is
unfilled — derived from the date, so nothing sweeps and no clock runs. The queue simply
stops returning it.

## Who is expected is derived, never stored

*A gedu is expected at (group, date) iff they hold no non-withdrawn request for it, and
they are either assigned to the group or hold a `covered` request for it.*

That one sentence is the whole model, and it is written twice — once as a SQL predicate,
once as the TypeScript derivation helper in `src/lib/` that the staff feeds attach to
every entry. The two are meant to be read against each other; a behaviour one has and the
other does not is a divergence, not a simplification. **Do not add a third.**

**Two questions, two sources.** The derivation answers *who is expected*. The rows answer
*who did which job, in which role, for whom* — including a chain, where a sub asked for a
sub of their own and the link between the two is simply one person appearing as one row's
cover and another row's requester on the same (group, date). Never force the second
question through the first.

## Every write is an RPC, and there is no route

Both tables grant `authenticated` nothing. Every read and write goes through a
`SECURITY DEFINER` function that asserts the caller's role in its own body — the same
posture the group session writes already use — so the browser client is all the transport
this feature needs, for the admin writes as much as the gedu ones. Nothing here touches a
server-side secret, so nothing here is worth a route: a route would add a hop and a second
place to get the authorization wrong.

**Refusals throw.** Every write is somebody pressing a button, and every refusal is news
they have to be told — the session was covered while the dialog was open, the offer went
stale under an admin's approval, the request is already withdrawn. A refusal swallowed
into `null` is a button that did nothing and said nothing.

**The two optional reason parameters are omitted, never sent as null.** The type generator
never types an RPC argument as nullable, so the writers carry trailing SQL defaults and a
caller with nothing to say leaves the key out of the payload. Passing `null` does not
compile; passing an empty string stores one.

## One shape, two readers

There is exactly one wire shape for a request, built by one database function, and every
write returns it while both staff feeds' `covers` arrays are arrays of it. Six copies of
one shape is how six surfaces come to disagree about what a cover request is.

Three of its fields are keyed to the **caller** rather than to the read, because the gedu
workspace's document is served to admins too:

- the reason and its note travel for an admin only;
- the offer count travels for an admin and for the requester on their own request — how
  many colleagues volunteered for somebody else's absence is not a third party's
  business, and offerers never learn who else offered.

**The keys are always present**, emitted as JSON null where the reader is not entitled to
them. The document keeps one shape for both readers, so no client schema ever branches on
which keys arrived.

## The pool names the session, never the absent gedu

The list a gedu picks from carries the product, group, date, site-or-remote, topic,
language and the role's fee — and no absent person and no reason. Naming the absent gedu
half-reveals a private reason (everybody knows who is off sick), and the seat being
covered belongs to the group rather than to a person the volunteer needs to know about.

Its exclusion is the database's own *may cover* predicate rather than a copy of its
clauses, so the list and the offer button cannot disagree: a session the caller is
expected at, one they have their own request on, and their own absence are all out by
construction. Certification is the only eligibility test there is — no coverage area, no
language match, no schedule-clash check.

**No instants travel.** The pool emits the date plus the product's timezone and slots, and
the client owns the calendar math, exactly as both feeds do.

## Access, and the two places it is narrower

From approval, a cover has everything the group's gedus have — the workspace, the feed,
notes, roster, member flair, the game-account editor, the site notes — until 24 hours
after the session's report is sent, or 15 product-local days after the session date if it
never is, and only while they are still certified. That window has **one definition**, in
SQL; nothing in this directory restates it.

Two surfaces admit a cover for the covered **date** only, never for the group's other
dates: the **voice room** (both database predicates and the voice token route, which
mirrors them in TypeScript because it runs on the service-role client) and the **family
report mail**, which is at-most-once — a sub must not send a report for a session they did
not run.

## Invalidation reaches five roots

A cover write moves five documents, and the mutations invalidate all five roots rather
than naming leaves. Roots, because a single write can move a group the caller was not even
looking at: unseating somebody cascades, withdrawing every request whose requester no
longer holds a seat on that date, and a client cannot know which those are.

The five are this feature's own pool, both staff session documents, the gedu's assignment
rows (a live cover *is* a row there) and the admin dashboard (the queue is a member of
that one document). The fan-out is stated once in the queries module, not per hook.

## What this directory deliberately does not do

- **No notifications**, on any channel. In-app only.
- **No ranking and no eligibility beyond certification.**
- **No per-request fee override.** The role's fee is the product's, and a sub fee above
  the base is a follow-up nobody has asked for yet.
- **No affordance linking the session-card staffing editor to the permanent groups
  panel.** They are two tools answering two questions, and they are meant to look it.
