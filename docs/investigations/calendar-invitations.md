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
- **Shape** — one weekly `RRULE` per slot, or one event per session in the horizon. This
  is where clients disagree most: rule expansion is where a badly-behaved client
  duplicates or drops occurrences.
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

- **Bookkeeping rides inside the sandbox document**, which the feed card's editor writes
  whole from a draft it seeded when the card opened. A save made *after* a send therefore
  discards the record that send wrote, and the next update starts over. Save the family
  first, then send. A real build gives this its own table and the problem disappears.
- **The shape is part of a `UID`'s identity.** A series states one event per slot and
  occurrences states one per session, so changing the shape between an invitation and its
  update produces a different set of UIDs — which a client answers by deleting what it had
  and creating what it was sent. That is worth seeing once deliberately and never by
  accident.
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
