# Calendar invitations — investigation

**Status: investigation, not a plan.** Researched 2026-09; last verified 2026-09-04.
Nothing here is committed scope. Claims about Gmail, Apple Mail and Outlook age much
faster than claims about our own code — re-verify the client behaviour before acting on
any of it.

The comparison that produced this question is closed and recorded in
`../records/calendar-feed-vs-invitations-2026-09.md`: a subscribed feed was built,
measured and dropped, and a mailed invitation replaced it. This file is the open half —
what a real build of the invitation would still have to answer.

## The design

One product, one gamer, one calendar object. A single event under a single identifier
carries the product's whole schedule: a camp on Monday, Wednesday and Friday for four
weeks is twelve sessions in one invitation, accepted in one gesture and withdrawn in one.
That is the owner's decision and it is not a detail to revisit — RFC 5546 gives a message
one calendar object to describe, and a client handed several reads the first and ignores
the rest, so a two-slot club split across two events would arrive as one of its sessions.

Two consequences follow. The identifier is the seat's, with no per-slot or per-date
suffix. And a cancellation withdraws the whole run: there is no way yet to cancel one
session out of the object.

## What is verified

- **Gmail renders a calendar file sent through the transactional REST API as an
  `invite.ics` attachment as a full inline invitation, with RSVP buttons** — for both
  schedule notations, a weekly rule and an explicit list of dates. Tested 2026-09-04.
  This is what makes the design ordinary: it needs no second mail transport, and the mail
  goes through the same REST wrapper as every other mail in the app.
- **A calendar file that is *not* recognised as an invitation is worse than useless.**
  The same client renders an unrecognised attachment as an "Add to calendar" link whose
  entry is a copy — nothing sent later can find it again, so an update lands on nothing.
  The difference between the two renderings is the whole design.
- **Production schedules need only the simple notation.** Checked 2026-09-04: every
  product runs at one clock time across all of its days — the summer camps are
  consecutive weekdays at one time, the term camps and every club are a single weekly
  slot — so a weekly rule states every real product's schedule. Consumer clubs are
  open-ended, which is the one thing only a rule can say; an explicit date list has to
  stop at whatever horizon we enumerate.
- **A reminder we set is a suggestion on two clients out of three.** Apple Calendar keeps
  the alarm the organiser sent; Google and Outlook replace it with the recipient's own
  default notification settings for that calendar.

## What is still open

1. **Apple Mail and Outlook are untested.** Every rendering claim above is Gmail's. The
   design rests on the invitation being recognised as one, and two of the three clients
   families actually use have not been looked at.
2. **Whether an update lands *in place*.** Re-stating the same identifier with a higher
   revision number is how iTIP says "this is a new version of that entry", and it is the
   single assumption everything else depends on. Untested on any client. If an update
   arrives as a second entry rather than replacing the first, the design is a duplicate
   generator and has to be rethought.
3. **The change model — the largest missing piece.** Nothing in the schema records that a
   session moved. The design turns on knowing *when* an update is due, and a schedule
   edit today changes the slots and leaves no trace of what it changed from. This is a
   prerequisite, not a detail.
4. **The bookkeeping a real build needs.** An identifier, a revision number, the last
   method, the last recipient and the last send, per seat, durable, written in the same
   transaction as the send. Without it there is no way to state a second message about
   the same entry, which is most of what the design is for.
5. **A reply arrives at a mailbox nobody reads.** An RSVP is mailed back to the organiser
   address, and we have no inbound parsing on it — so today every Yes, Maybe and No a
   family sends is delivered into nothing. Either inbound parsing gets wired up, or the
   mail stops asking a question it cannot hear the answer to and states the entry rather
   than requesting an answer.
6. **Cancelling or moving one session.** iTIP identifies one occurrence of a recurring
   object by its own recurrence identifier, and nothing here emits one — so a holiday, a
   snow day or a single moved session is a whole-object update. This is also the point at
   which the holiday-aware occurrence expansion (still unbuilt, and named as a
   prerequisite in the record) starts to matter on this side.
7. **Deliverability of a mail carrying a calendar part**, which is filtered differently
   from ordinary transactional mail. Worth measuring before anything reaches a family.

## Where it lives, and how to try it

The invitation is an **email template** like every other mail in the app —
`src/lib/calendar-invitations/` holds the pure builder that composes the calendar file,
and the template that wraps it sits in `src/lib/email-templates/` and is registered in
the template registry. It is therefore reachable from the **email testing tool** at
`/admin/testing`: pick the calendar-invitation template, fill in the parameters (the
schedule, the timezone, the reminder, whether the mail requests an answer or simply
states the entry, and the revision number), and either preview it or send it to a real
address. The preview shows the composed calendar file beneath the rendered mail, so what
a client did can be read back against exactly what it was sent.

Trying an update is two sends: the same identifier, a higher revision number.
