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
promises a clock face rather than an instant. So every document names a zone and owes the
reader either the transition rules for it or the note saying why it has none — this repo
ships rules for `Europe/Helsinki`, which is where every product is authored, and states
the note for anything else. The day walk that produces the occurrences is UTC-pinned and
the conversion to an instant is the last step, which is the only shape that survives a
daylight-saving transition inside a run.

**The template is the only caller.** A calendar invitation is an email template like any
other — it lives in the email template registry, composes its parameters from a form, and
is sent and previewed from the admin email testing tool. Nothing else in the app builds
one, and a future caller that sends invitations for real would supply the same input
object from a seat rather than from a form.

**What is verified, and what is not.** Gmail renders this document, attached as
`invite.ics` through the transactional REST API, as a full inline invitation with RSVP
buttons — for both notations, tested 2026-09-04. Apple Mail and Outlook are untested, and
so is the assumption the whole design rests on: that re-stating the same identifier with a
higher revision number replaces the entry a client already holds rather than adding a
second one. `docs/investigations/calendar-invitations.md` is where those live.
