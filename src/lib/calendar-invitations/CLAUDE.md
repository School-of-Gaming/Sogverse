# Calendar invitations

The other half of the calendar comparison: where the feed publishes a document a client
polls, this **sends** one — an iTIP message about one seat, mailed to a real address,
revised by a second message and withdrawn by a third. An admin tool for one empirical
question (does a client apply an update *in place*); the design is still open
(`docs/investigations/calendar-invitations.md`).

**Its own transport, and not by preference.** The house mail wrapper's REST API types an
attachment by file extension and has no field for the parameter that makes a calendar an
invitation, so a calendar sent that way arrives as a file and the entry a client makes
from it is a copy nothing can find again. The relay is the only path where the message is
ours to compose; everything else in the app still goes through the one REST wrapper.

**A conversation is stateful, and its record rides inside the sandbox document**, because
a table for an undecided design is premature. That makes the row a **two-writer row**: the
family editor carries the stored record forward untouched, and a send merges its own onto
a document re-read at the moment it writes, since a mail send sits between the read and
the write. Either order is safe; only the sandbox reset clears the record.

**One seat is one calendar object — decided, and not a tidy-up to revisit.** A message
carries a single `VEVENT` under a single `UID`, and that object states the product's whole
schedule: a camp on three weekdays for four weeks is twelve sessions in one invitation,
accepted in one gesture and withdrawn in one. RFC 5546 gives an iTIP message one calendar
object to describe, and a client handed several reads the first and ignores the rest. It
follows that the **`UID` is the participation's**, with no per-slot or per-date suffix,
and that a cancellation cancels the whole run rather than one session of it.

**The options are a comparison, not a configuration** — shape, reminder offset, and
whether the message asks for an answer at all. The shape is only *how* the one object
writes its schedule, so it is safe to change between a send and its update: the `UID` does
not move, and the client applies the new notation in place.

**Which experience a conversation runs as is remembered, not re-asked.** A withdrawal has
none of its own to state: RFC 5546 retracts a published object by re-stating it as a
`PUBLISH` carrying `STATUS:CANCELLED`, and a `CANCEL` there would name the attendee whose
invitation is being retracted — one the reader was never sent. So the record carries the
experience, a cancellation reads it, and the `METHOD` is derived from that pair by one
function both the document and the mail part's type go through, since a document saying
one method inside a part typed as another is two messages.

**Each shape is weak somewhere, and the weakness is the thing being compared.** A `series`
is an `RRULE` — compact, and the only form whose meaning survives past the horizon we
enumerate, so it is what an open-ended club wants. But a rule carries one clock face, so a
schedule whose sessions start at different times or run for different lengths has no rule
form at all; the builder **refuses** that request rather than quietly sending the other
notation, and the card disables the option off the same predicate so the two ends cannot
disagree. An `occurrences` is `DTSTART` plus `RDATE`, every remaining session listed as a
local wall clock — it states any set of times, and it stops at the horizon. Sessions of
differing *lengths* are the one thing the format handles badly: those become
`RDATE;VALUE=PERIOD` entries, which clients support unevenly, so only the occurrences that
actually differ are written that way and the result says when any were.

**A rule's `UNTIL` and the list's dates come from the same clamp** — the product's end
date or a cancelling subscription's paid-through instant, whichever is earlier — and both
shapes state wall clocks in the product's zone, because a weekly schedule promises a clock
face rather than an instant. So every document names a `TZID` and owes the reader either
the transition rules for it or the note saying why it has none.

**Still open: cancelling one session out of the object.** `RECURRENCE-ID` is how iTIP says
"this occurrence of that object", and nothing here emits one yet — a holiday, a
snow day or a single moved session is a whole-object update today.
