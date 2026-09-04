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

- **The provider's own part header is what makes the design work.** A calendar sent as an
  `invite.ics` attachment through the transactional REST API leaves as a calendar part
  naming the iTIP method, with an attachment disposition. Nothing in the app asks for
  that: the name carries the media type and the provider composes the rest, which is why
  the file name is never rewritten on the way out.
- **Gmail renders it as a full inline invitation, with RSVP buttons** — for both schedule
  notations, a weekly rule and an explicit list of dates. Tested 2026-09-04. This is what
  makes the design ordinary: it needs no second mail transport, and the mail goes through
  the same REST wrapper as every other mail in the app. Gmail also shows a file chip for
  the calendar beside the rendered invitation; that is Gmail's own doing rather than a
  property of how the mail was sent, since an inline calendar part gets the same chip.
- **Outlook on Windows renders a meeting request**, tested against a Microsoft 365
  mailbox 2026-09-04: Accept, Tentative and Decline; the recurrence stated in prose
  ("occurs every Monday, Wednesday and Friday, effective … until …"); the times converted
  into the reader's own zone with the authoring zone noted beside them; the address mapped
  from the location; and the HTML body rendered under it.
- **An iPhone reading that same Microsoft 365 mailbox** shows the invitation in Calendar
  with Accept, Maybe and Decline, and honours the free/busy answer the document states.
  Three Exchange behaviours came out of the same test and all three are now baked into
  what we send:
  - **One reminder survives, and it is the first one.** Exchange keeps a single alarm per
    item, so the reminder that matters most has to be written first — which is why the
    tool asks for two in order rather than for a set.
  - **The calendar entry's notes are filled from the *email body*, flattened to text.**
    With only an HTML body to work from, a reader opens the session in their calendar and
    finds the mail's markup flattened into it, the tracking pixel showing as a bracketed
    link. So this mail states a plain-text body of its own, and that text is what a
    Microsoft reader actually finds inside the entry.
  - **A name in a parameter has to be quoted.** An unquoted organiser name was displayed
    as "School Gaming" — a word silently lost — so every name is written as a quoted
    string whether or not the format forces it.
- **Open tracking is an operator setting, not a code one.** The pixel that appears in a
  flattened calendar note comes from the provider's open tracking, which is switched off
  per account for transactional mail in the provider's own dashboard. Nothing in this repo
  adds or removes it.
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
- **A reminder we set is a suggestion, and every client honours it differently.** Apple
  Calendar keeps the alarms the organiser sent; Google replaces them with the recipient's
  own default notification settings for that calendar; an Exchange mailbox keeps exactly
  one, the first. Nothing about that is worth fighting — the answer is to send the near
  reminder first and let each client do what it does.

## What is still open

1. **Two Apple paths are still in flight.** Outlook on Windows and an iPhone reading an
   Exchange mailbox are settled above. What is not is iCloud's own calendar, and a Gmail
   account read through Apple Mail — the two remaining shapes a family is plausibly on,
   and the two where the invitation could still arrive as a file rather than as an
   invitation.
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
   object by its own recurrence identifier, and nothing here emits one — so a skipped
   day, a snow day or a single moved session is a whole-object update. (The holiday
   calendar itself left the product on 2026-09-04, so a skipped session is now a change
   to record, not a rule to apply.)
7. **Deliverability of a mail carrying a calendar part**, which is filtered differently
   from ordinary transactional mail. Worth measuring before anything reaches a family.

## Where it lives, and how to try it

The invitation is an **email template** like every other mail in the app —
`src/lib/calendar-invitations/` holds the pure builder that composes the calendar file,
and the template that wraps it sits in `src/lib/email-templates/` and is registered in
the template registry. It is therefore reachable from the **email testing tool** at
`/admin/testing`: pick the calendar-invitation template, fill in the parameters (the
schedule, the timezone, the two reminders, whether the entry blocks the reader's own
time, whether the mail requests an answer or simply states the entry, and the revision
number), and either preview it or send it to a real address.

**Read the identifier off the send, not off the preview.** Both show the composed
calendar file — the preview beneath the rendered mail, the send beneath the result
banner — but a render mints its own identifier when the form names none, so the preview's
was never the one that went out. Trying an update is two sends: copy the identifier the
first send reports, type it back into the form, and raise the revision number.
