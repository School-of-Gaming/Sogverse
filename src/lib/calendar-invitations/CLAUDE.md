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

**The options are a comparison, not a configuration** — shape (one weekly rule per slot,
or one event per session), reminder offset, and whether the message asks for an answer at
all. The shape is part of a message's identity: changing it between a send and its update
produces different ids, and the entries already on the calendar stay until something
cancels them.

**Open, and not to be decided by a tidy-up: how many events one message carries.** A seat
with two weekly slots is one message stating two events under two ids today. Splitting or
collapsing that changes what a client is being asked to accept in one gesture, which is
the owner's call.
