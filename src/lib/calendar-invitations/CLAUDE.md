# Calendar invitations

One seat's whole schedule as a calendar document, mailed as `invite.ics`. Two files: the
RFC 5545 primitives (escaping, octet-counted folding, both timestamp forms, the one
`VTIMEZONE` this repo can write) and the builder that composes a message out of them.

**The builder is pure, and that is what keeps it honest.** It takes a plain description
of a schedule and returns a string. No database, no request, no environment, no clock of
its own — `now` is an argument, because which sessions are still ahead is the one input
that would otherwise make every test true only on the day it was written.

**One seat is one calendar object — decided, not a tidy-up to revisit.** A message
carries a single event under a single identifier, and that object states the product's
whole schedule: a camp on three weekdays for four weeks is twelve sessions in one
invitation, accepted in one gesture and withdrawn in one. RFC 5546 gives an iTIP message
one calendar object to describe, and a client handed several reads the first and ignores
the rest. It follows that the identifier carries no per-slot or per-date suffix, and that
a cancellation withdraws the whole run rather than one session of it.

**The two shapes are two notations for that one object, not two ways of splitting it up.**
A weekly rule is compact and is the only form whose meaning survives past any horizon we
enumerate, so it is what an open-ended club wants; an explicit date list states each
remaining session and stops at twelve weeks. Because the identifier does not move between
them, the shape is safe to change between a message and its update — the client applies
the new notation in place. Both walk the same occurrence list, so the two cannot disagree
about which sessions the object covers.

**Both shapes state wall clocks in the product's own zone**, because a weekly slot
promises a clock face rather than an instant. So a zoned document names a zone and owes
the reader either the transition rules for it or the note saying why it has none — this
repo ships rules for `Europe/Helsinki`, which is where every product is authored, and
states the note for anything else. The day walk that produces the occurrences is
UTC-pinned and the conversion to an instant is the last step, which is the only shape
that survives a daylight-saving transition inside a run.

**UTC is the exception at both ends, and it is one decision rather than two.** A schedule
authored in UTC has no clock face to promise — there are no transitions for one to
survive — so its times are written as absolute instants, and a document whose times name
no zone has nothing to describe and no gap to warn anybody about. Naming the zone anyway
beside an absolute timestamp would be redundant on a forgiving reader and contradictory
on a strict one.

**Every name is written as a quoted string, whether or not the format forces it.** The
rule is that quoting is required only around a value carrying a colon, semicolon or
comma, and following it exactly is how an organiser name arrived on one client with a
word missing. Quoting always costs two characters and leaves no client guessing where a
value ends. A quoted string has no escape for a quote of its own, so a quote inside a
name is dropped rather than smuggled through.

**Reminders are a list in the order they are emitted, and the order is the whole point.**
A calendar that keeps every alarm shows them all and the order is invisible; an Exchange
mailbox keeps exactly one per item and keeps the first, so on a Microsoft reader the
first entry is the only reminder anybody gets. Whichever reminder matters most is
therefore written first, and a repeated offset is dropped — two alarms at one offset are
one reminder on every client that keeps them and a duplicate on none.

**Whether the entry blocks the reader's own time is an input, not a constant.** A
parent's calendar holding their child's club is a note about where the child is rather
than a commitment the parent has made, so the transparent answer is what the tool offers
first — but a seat the parent holds themselves is the case where the opposite is right,
and clients honour whichever is stated. It was a constant once, and a constant is a
decision nobody can see being made.

**The template is the only caller, and it must carry a plain-text body.** A calendar
invitation is an email template like any other — it lives in the email template registry,
composes its parameters from a form, and is sent and previewed from the admin email
testing tool. What is not like any other is the text body: an Exchange mailbox fills the
calendar entry's own notes from the message body, and with only HTML to work from it
flattens the markup into them. So the mail that carries this document states its own
words as text, and that text is what a Microsoft reader finds inside the entry. Nothing
else in the app builds an invitation, and a future caller that sends them for real would
supply the same input object from a seat rather than from a form.

**What is verified, and what is not.** Gmail renders this document, attached as
`invite.ics` through the transactional REST API, as a full inline invitation with RSVP
buttons; Outlook on Windows renders it as a meeting request with the recurrence stated in
prose; an iPhone reading an Exchange mailbox shows it in Calendar and honours the
free/busy answer. All tested 2026-09-04. What is still open is iCloud, a Gmail account
read through Apple Mail, and the assumption the whole design rests on: that re-stating
the same identifier with a higher revision number replaces the entry a client already
holds rather than adding a second one. `docs/investigations/calendar-invitations.md` is
where those live.
