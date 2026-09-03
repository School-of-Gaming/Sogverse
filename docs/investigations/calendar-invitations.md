# Calendar invitations — investigation

**Status: investigation, not a plan.** Researched 2026-09. Nothing here is committed
scope, and the two designs it compares are both still open. Claims about Gmail, Apple
Calendar, Outlook and Brevo age faster than the claims about our own code — re-verify the
vendor behaviour before acting on any of it.

Read this beside `session-reminders-and-calendar-feed.md`, which holds the other half of
the comparison. That doc's standing-tool section describes the subscribed feed; this one
describes the invitation design and the tool built to try it.

## The question

The feed publishes a document and waits. A calendar client stores one URL, re-fetches it
on its own schedule, and takes whatever it finds — so a schedule change reaches a family
whenever their vendor next polls, which is minutes to hours later, and there is nothing
to accept, decline, or misplace.

The invitation design inverts that. **One invitation per product per gamer**, mailed when
the seat is created; an **update mail** when the schedule changes; a **cancellation** when
the seat ends. The family gets an entry that arrives immediately, sits in the calendar
they already use, and can be answered.

The two are not variants of one design. They differ in who holds the state, in what a
failure looks like, and in what the family has to do:

| | Subscribed feed | Invitations |
|---|---|---|
| Who acts on a change | The vendor, on its own poll schedule | We do, by sending a mail |
| What we must remember | Nothing — the document is the answer | Every `UID` and `SEQUENCE` we have ever stated |
| What the family does | Subscribes once | Accepts each invitation |
| Failure mode | Stale entries until the next poll | A duplicate entry, permanently |
| Reminders | Ours, in the document | Overridden by the client on two of three platforms |
| A reply | Impossible | Arrives at an inbox we do not have |

## Decided by the owner: one seat is one calendar object

**Owner's decision, 2026-09.** An invitation for one product and one gamer is a single
`VEVENT` under a single `UID`, carrying the product's entire schedule. A camp on Monday,
Wednesday and Friday for four weeks is one invitation containing all twelve sessions.

The tool previously emitted one `VEVENT` per slot in series mode and one per session in
occurrences mode, several `UID`s inside one iTIP message. RFC 5546 gives a message one
calendar object to describe, and clients handle a message that breaks that by reading the
first component and ignoring the rest — so a two-slot club was arriving as one of its two
sessions. The decision settles the question this doc previously listed as open, and the
rest of the design follows from it:

- The `UID` is the participation's, with no per-slot or per-date suffix.
- A cancellation withdraws the whole run; there is no way to cancel one session yet.
- **The shape is no longer part of a `UID`'s identity**, so it is safe to change between
  an invitation and its update — the same object arrives in a different notation and the
  client applies it in place. That retires the trap this doc used to describe, where a
  shape switched by accident stranded a set of entries nobody would think to cancel in the
  right shape.
- **A rule cannot always be offered.** `RRULE` carries one clock face, so `series` is
  available only when every slot starts at the same time and runs the same length. The
  builder returns a typed refusal, the route answers 409, and the card disables the option
  off the same predicate so the offer and the refusal cannot drift apart.

**Still to come: `RECURRENCE-ID`.** Cancelling or moving one session out of the object is
how iTIP handles a holiday, a snow day or a single rescheduled meeting, and nothing here
emits one. It is the natural next step and a prerequisite for the holiday-aware expansion
below to be worth anything on this side.

## What was verified (2026-09)

- **Brevo's REST send API cannot type a calendar part.** Its attachment field takes a
  name and content, and the type is inferred from the file extension. There is no MIME
  type field and no `method` parameter, so an `.ics` sent that way arrives as a plain
  attachment. This is why the invitation tool does not go through the house mail wrapper.
- **Gmail's behaviour with a bare `.ics` attachment is an "Add to calendar" link**, and
  the entry it creates is a *copy*. Nothing sent afterwards can find that copy again, so
  the update mail that arrives next week lands on nothing. This is the failure the whole
  design has to avoid, and it is what rules out the simple approach.
- **Brevo's SMTP relay plus nodemailer produces the correct part.** `smtp-relay.brevo.com`
  on port 587 with STARTTLS, authenticating with an SMTP key generated in Brevo's
  dashboard (a different credential from the REST API key). Nodemailer's `icalEvent`
  option emits `text/calendar; charset=UTF-8; method=REQUEST` as an alternative part
  rather than an attachment, which is the shape a client reads as an invitation.
- **Reminders in an invitation are honoured by Apple and ignored by the other two.**
  Apple Calendar keeps a `VALARM` the organizer sent. Google Calendar and Outlook both
  replace it with the recipient's own default notification settings for that calendar.
  So an alarm we set is a suggestion on two platforms out of three, which matters for
  the reminder question the feed investigation opened.

## What the tool lets an owner compare

A third card on `/admin/testing`, beside the feed card, sending for one seat of the same
sandbox family the feed card edits. That sharing is the point: change a product's slots
in the editor above, send an update below, and watch one calendar entry move.

- **Send, update, cancel**, in that order, against a real address. The update repeats the
  `UID` and raises the `SEQUENCE`; the cancellation raises it again and states
  `STATUS:CANCELLED`. Watching a real client apply each is the only way to answer whether
  in-place updating works well enough to build on.
- **Shape** — the one object's schedule as a weekly `RRULE`, or as an explicit `RDATE`
  list of every remaining session in the horizon. This is where clients disagree most:
  rule expansion is where a badly-behaved client duplicates or drops occurrences, and an
  explicit list is the control it is measured against. A schedule whose sessions differ in
  time or length has no rule form; the tool refuses it and the card disables the option.
- **Reminder** — none, 15 minutes, an hour, a day, so the claim above can be re-checked
  per client rather than taken on trust.
- **Experience** — `REQUEST`, a real invitation with an RSVP, versus `PUBLISH`, the same
  sessions as a plain add-to-calendar object with nobody being asked anything. Worth
  comparing directly: the RSVP is the half of the design we cannot currently receive.
- **Preview**, which renders the mail and the calendar part without sending either, and
  without consuming the sequence number an update is going to need.

Both the mail and the raw calendar part are shown beneath the actions, so what a client
did can be read back against exactly what it was sent.

## What a real build would need

None of this exists today, and each item is substantial on its own:

- **A change model.** Nothing in the schema records that a session moved. The whole
  design turns on knowing *when* to send an update, and today there is no event to hang
  that on — a schedule edit changes the slots and leaves no trace of what it changed
  from. This is the largest missing piece, and it is a prerequisite rather than a detail.
- **A per-gamer-per-product invitation table.** `UID`, `SEQUENCE`, last method, last sent
  and recipient, per seat, durable, and written in the same transaction as the send.
  The tool keeps this inside the admin's sandbox document because that row already exists
  and a migration for an undecided design would be premature.
- **Somewhere for a reply to land.** An RSVP is mailed back to the `ORGANIZER` address.
  We have no inbox on it and no inbound parsing, so today every Yes, Maybe and No a
  parent sends is delivered into nothing. Either Brevo's inbound parsing is wired up, or
  the design uses `PUBLISH` and stops asking a question it cannot hear the answer to.
- **The SMTP key provisioned** in production and staging, as `BREVO_SMTP_LOGIN` and
  `BREVO_SMTP_KEY`.
- **The holiday-aware expansion**, which the feed investigation already names as its own
  prerequisite. An invitation inherits it identically: the tool uses the shared
  holiday-blind walker, so a cancelled-for-a-holiday session is invited to like any other.

## Known limits of the tool as built

- **Bookkeeping rides inside the sandbox document**, so that one row has two writers and
  each preserves the other's half: the feed card's editor writes the family and carries the
  stored `invitations` forward untouched, and this route writes `invitations` onto a
  document it re-reads at the moment it writes. A family edit and a send are therefore
  independent in either order, and the only write that clears the bookkeeping is Reset,
  which re-seeds the family and would otherwise leave a `UID` and `SEQUENCE` pointing at a
  conversation about a household that no longer exists. A real build gives this its own
  table, at which point the two halves stop having to be careful of each other.
- **Neither shape can state every schedule, and each fails differently.** A rule is
  unavailable outright when the sessions differ in time or length, which is refused rather
  than silently substituted. An explicit list stops at the twelve-week horizon, so an
  open-ended club sent that way carries three months of sessions and no more — a real
  build would have to re-send periodically or use the rule. And sessions of *differing
  lengths* force `RDATE;VALUE=PERIOD` entries: RFC 5545 §3.8.5.2 permits them, but client
  support is weak and untested by us, so only the occurrences that actually differ are
  written that way (the rest stay in the plain date-time list, so a client that ignores
  periods still receives those) and the card says when the document used any.

- **One `VALARM` on one object.** The reminder now fires before each occurrence of the
  single event rather than being restated per session — which is the correct shape, and
  also means the Apple-honours-it / Google-and-Outlook-replace-it finding above is now
  being tested against one alarm rather than a dozen identical ones.

- **A single session cannot be cancelled or moved.** No `RECURRENCE-ID` is emitted, so a
  holiday or a one-off reschedule is a whole-object update.
- **The calendar writer is a second, smaller one.** `ORGANIZER`, `ATTENDEE` and `SEQUENCE`
  are three properties the feed's writer has no use for and cannot express, so the
  invitation module serialises its own events out of that writer's exported primitives.
  The one thing it had to copy rather than import is the `Europe/Helsinki` `VTIMEZONE`
  block, which the feed writer holds privately; exporting it there and deleting the copy
  is the obvious tidy-up the next time that module is open.

## Open questions

1. **Does an update actually land in place, on all three clients?** This is the question
   the whole design rests on, and it is the one the tool exists to answer empirically.
2. **What does a client do when the same person is invited twice** — once by us and once
   by a school or a parent forwarding the mail on?
3. **Is an RSVP worth having at all?** It is the one thing a feed cannot offer, and it is
   also the thing we cannot currently receive. If the answer is no, `PUBLISH` is the
   honest form and the design gets much smaller.
4. **What happens to a family that ignores the invitation?** A feed subscriber sees every
   session forever; an invitation that is never accepted is simply not in the calendar,
   and we have no way to know.
5. **Do the two designs have to be exclusive?** An invitation per seat and a feed for the
   whole family answer different needs, and offering both is not obviously worse than
   choosing one — but it is two systems to keep in step with one schedule.
6. **Deliverability.** A relay send is a different reputation path from the REST API the
   rest of our mail uses, and a mail carrying a calendar part is filtered differently
   again. Worth measuring before anything reaches a real family.
