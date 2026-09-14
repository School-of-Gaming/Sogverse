# Municipality invoicing

The admin-only page a finance officer opens once a month to raise the invoices School of
Gaming sends Finnish municipalities for the clubs it runs there. One month, one
municipality at a time, every club beneath it, every session behind every club's number.
It is read-only end to end: it writes nothing, snapshots nothing and exports nothing.

The page is one pure build over one document. The route fetches the month before the
first paint, the builder turns it into the invoice, and the components render it — so
everything below is a rule about the *arithmetic*, and the arithmetic lives in one
function that has no clock, no query and no translator of its own.

## What the invoice counts

**A session ran iff a stored session row exists** for one of the club's groups on a date
inside the month. Session records are materialized lazily — one is written the moment an
educator records a report, a note or an attendance mark, and not before — so the row is
the evidence that somebody was there, and it is the only evidence that bills.

**Counting is per club, per calendar date.** A club may run several groups, and two
groups meeting on the same date are one session of that club. The rows arrive raw, one
per group and date, and the collapse happens in the builder: it is a rule of the invoice,
not a property of the data, and doing it in the query would have thrown away which groups
met.

**A schedule is a claim, not a session.** The club's weekly slots are projected across the
month, clipped to its own term, both ends inclusive. A projected date with no stored row is
shown, never counted, and its treatment splits on whether it has passed:

- **Before today — unrecorded.** Worth nothing, shown at zero in a warning tone, because a
  club that was supposed to meet and recorded nothing is the one thing on this page worth
  investigating.
- **Today or later — upcoming.** Shown muted with no amount at all. It has not happened;
  printing zero against it would send somebody looking for a session nobody has missed.

"Today" is **the club's own local today**, resolved in the club's timezone, because every
date on either side of that comparison is one of the club's own local dates. A UTC "today"
is off by one for several hours of every day, and the error always lands on the newest
session — the one most likely to be looked at.

**Records beat projections.** A stored row on a date the schedule does not project still
counts; a date carrying both is one line, and that line is recorded. This is the same rule
every session feed in the app follows, and it has to stay the same rule: two surfaces
disagreeing about whether a day happened is worse than either answer.

**But a date after the club's local today never bills, whatever is stored on it.** Nothing
in the database stops an educator writing a note against a session that has not happened
yet, and such a row would otherwise invoice a municipality for a session still ahead of it.
A stored row dated later than today is therefore **upcoming** — the same line a projection
with no row gets — and is outside the count. A row dated *today* counts: the comparison is
between two of the club's own local dates, and an educator writing up the afternoon's
session is recording one that ran. This is the one place the invoice is deliberately
smaller than the stored evidence would make it, and the direction is the point — a total
that is short is a question somebody asks, and a total that is long is one nobody does.

**A club with no weekly slots has no claim to project, and renders without a schedule
line at all.** It is a shape production has and staging did not — a club whose schedule was
never filled in, or emptied after the term began — and it reaches the invoice on the
strength of its stored rows alone. Nothing about it is exceptional: it has no projected
dates, so it carries no unrecorded lines, and the "where and when" line under its name
omits the half it cannot state rather than printing an empty one. What it must never do is
fail: one such club would otherwise take the whole month's invoice down with it, so the
build is required to survive every document the wire contract accepts.

**Projection is only offered for a club that is running or completed, and only where it has
a start date.** A club that has not started, or that was cancelled, did not run the
sessions its weekly schedule describes, and a club with no first day has no date to start
walking from — guessing one would invent work. Any such club can still appear on the
invoice, on the strength of its stored rows alone.

**A club is on the invoice iff it has at least one line of any kind in the month**, and a
municipality is on it iff at least one of its clubs is. An empty club row would say it did
nothing in a month it was never running in.

## The fee, and the money

**The fee is always the product's current per-session municipality fee, read at the moment
the page is read.** Nothing is snapshotted and nothing is versioned: an invoice is
recomputed from today's facts every time it is opened, and correcting a wrong fee corrects
every month that has not been sent yet.

**The schedule and the term are read the same way, and the consequence is worth stating.**
Editing a club's weekly slots or moving its start or end date changes, retroactively, which
dates a past month projects — so a month looked at last week can show a different set of
unrecorded lines today. What it cannot change is a **total**: a total is stored rows times
the current fee, and a schedule edit touches neither. So the drift is confined to the
flags — which is the half of the page that exists to be investigated rather than invoiced —
and a club that has just had its schedule corrected is expected to look different here.

**An unset fee is never worth zero.** A club whose fee has never been filled in shows a
translated "fee not set" label in warning tone in place of both its per-session fee and its
total, links its name to its own admin page so the gap can be closed, and is **left out of
its municipality's total** — with a line under that total saying how many clubs were left
out. A total that is quietly short is the one failure this page cannot afford.

**Money is an integer number of cents from end to end.** The count is multiplied by the fee
in cents, cents are summed, and the division into euros happens exactly once, at render,
through the shared currency formatter. Nothing divides before it sums. Every total passes
through a guarded addition that throws rather than return a value that has stopped being a
safe integer, so an invoice can fail loudly but cannot print a plausible wrong number.

**The month has a total of its own, and it is computed where every other total is.** It is
the sum of the municipality totals — not a second pass over the clubs — so the figure at the
top of the page cannot disagree with the figures it stands over, and a club with no fee is
outside it exactly as it is outside its own municipality's, with the same line saying how
many were left out. It lives in the pure build beside the counts it is printed with (how
many municipalities, how many clubs, how many sessions ran), because a figure the finance
officer reads first has no business being the one figure nothing tests.

## How the month is read

**A municipality is a section, and a section opens closed.** A month carries a hundred
clubs across twenty municipalities, and every one of them expanded means the number being
invoiced can only be found by scrolling past the working that produced it. So the section's
summary row states the whole answer — who, how many clubs, how many sessions ran, what it
comes to, and the exclusion warning where one applies — and opening it is how the reader
asks *why*. The row is identical open and closed, so expanding adds the clubs underneath and
moves nothing that was already on screen. An expand-all control sits beside the month
stepper; which sections are open is where the reader is in the page rather than what the
page is about, so it is local state, in neither the URL nor storage.

**A club's sessions are a table, and every amount on the page ends on one right edge.** Four
columns — the date with its weekday, the ISO week, what happened in a word, and what it is
worth — at fixed proportional widths, so one club's columns land where the next club's do
and a figure can be read against the figure above it. The widths spread the three text
columns across the card rather than packing them against the left: this is an admin surface,
read at a desk, and a row of four short values bunched into the first third of the card
leaves the money a long way from the words explaining it. The amount column is right-aligned
and ends at the card's own right padding, which is the axis the club line, the municipality
total and the month total all share. The weekday is the one thing that goes at phone width —
the status column, which is the difference between a session that happened and one that did
not, stays.

## The month, and how it is named

The month is a calendar month, selected by a `month=YYYY-MM` search parameter, and it lives
in the URL rather than in component state — a month of invoicing is something a finance
officer links to or comes back to tomorrow, and it is also what lets the server fetch the
right month before the page is written.

**A missing or malformed parameter falls back to the previous calendar month in Helsinki.**
Previous, because an invoice is raised for a month that has finished. Helsinki, because
municipality clubs are Finnish by definition, and on the first and last day of a month the
server's month and the finance officer's month are different answers.

Every session line carries its date **and its ISO week number**, using the same week label
the rest of the platform uses. Finnish admins plan and talk about clubs in week numbers, so
a week number is how the line is found rather than a decoration on it.

## The one departure from the viewer's timezone

The app's rule is that anything with a time of day renders in the **viewer's** zone. The
club's "where and when" summary on this page renders in the **club's own** zone instead,
deliberately.

Every date on this page is a club-local calendar date — the session rows, the projected
dates, the club's own today — because that is what a session record is keyed to. A schedule
summary converted into the reader's zone can name a weekday those dates never fall on: a
line reading Tuesday sitting above a column of Mondays, for a reader one zone west of
Helsinki. A clock face the reader has to adjust by an hour is a smaller error than a page
that contradicts itself, and municipality clubs are Finnish by definition, so for the
finance officer actually reading this the two zones are the same one.

The departure is confined to that one summary line. Nothing else on the page carries a time
of day at all.

## Grouping and order

Month → municipality → club → session. Municipalities sort by the name **the reader sees**,
which is not always the stored one: the localized name is what the sort key has to be, or a
Swedish reader is handed a list that is not in alphabetical order for them. Clubs sort the
same way within a municipality, and sessions run ascending by date.

A club whose location chain reaches no municipality at all goes into a single **trailing**
bucket under a translated "no municipality" label, in warning tone. It trails whatever it
is called: it is a list of things to fix rather than a municipality to invoice, and sorting
it in by name would bury it in the middle.

## Which municipality a club belongs to

The nearest ancestor-or-self of type `municipality` above the club's own location. A club
meeting in a school points at the school, whose parent is the municipality; an online club
points at the municipality directly, which is why the walk is ancestor-or-*self*.

**The walk passes through retired locations and never filters them.** A school that closed
last term still sat in its municipality while it was running the sessions being invoiced,
and dropping a retired row from the chain would move every club that met there into the
no-municipality bucket — silently, and only for the months where it matters most.
