# Municipality invoicing

The admin-only page a finance officer opens once a month to raise the invoices School of
Gaming sends Finnish municipalities for the clubs it runs there. One month, one
municipality at a time, every club beneath it, every session behind every club's number,
and the file each buyer's invoice is imported from. It **writes nothing and snapshots
nothing**: every figure on it, and every figure in every file it produces, is recomputed
from today's facts each time it is read.

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
  investigating. **The zero is printed even where the club's own fee is unset**, and it is
  not an inconsistency: a missed session is worth nothing whatever the fee would have been,
  so the zero is a fact rather than the unknown the fee column has to admit to.
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
dates, so it carries no unrecorded lines and nothing to report as missed, and its schedule
column is simply empty rather than printing a weekly cadence it does not have. What it must
never do is fail: one such club would otherwise take the whole month's invoice down with it, so the
build is required to survive every document the wire contract accepts.

**Projection is offered wherever the club has a start date.** That date is the whole of the
"had it begun" rule: the walk is clipped to it, so a term that starts after the month being
invoiced projects nothing without a second test for it. A club with no first day has no date
to start walking from — guessing one would invent work — and it can still appear on the
invoice, on the strength of its stored rows alone.

A club's lifecycle is nowhere in this page's arithmetic, deliberately. A stored status was
here once, and it was the defect: it never advanced past its initial value, so a test on it
was a test that never passed, and the missed-session flagging this page exists for was dead
for every club on the invoice. The term dates say everything a projection needs to know.

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
its municipality's total** — which says beside its own counts how many clubs were left out,
in warning tone. A total that is quietly short is the one failure this page cannot afford,
and a section that opens closed is exactly where a short total would otherwise hide.

**Money is an integer number of cents from end to end.** The count is multiplied by the fee
in cents, cents are summed, and the division into euros happens exactly once, at render,
through the shared currency formatter. Nothing divides before it sums. Every total passes
through a guarded addition that throws rather than return a value that has stopped being a
safe integer, so an invoice can fail loudly but cannot print a plausible wrong number.

**The month has a total of its own, and it is computed where every other total is.** It is
the sum of the municipality totals — not a second pass over the clubs — so the figure at the
top of the page cannot disagree with the figures it stands over, and a club with no fee is
outside it exactly as it is outside its own municipality's, with the same warning saying how
many were left out. It lives in the pure build beside the counts it is printed with (how
many municipalities, how many clubs, how many sessions ran), because a figure the finance
officer reads first has no business being the one figure nothing tests.

## Who the invoice is addressed to

**The buyer is a customer, not a municipality, and the link is per club.** One city
can be two customers — library clubs bought by one department under one agreement,
school clubs by another under another — and an association can buy clubs that run
inside a municipality it is not. So nothing here may derive a buyer from where a club
meets, and the two questions the page answers are genuinely independent: which
municipality a club belongs to decides the section it sits in, and which customer it is
invoiced to decides the file it ends up in.

**A club's customer is carried whole, never reduced to a flag.** An invoice is addressed
to that buyer, so the customer number, the billing name and the postal address all
travel with the club — the accounting system that raises the invoice wants the address
stated on the invoice itself even though the buyer's own record already holds one.

**A missing customer costs no figure, and it costs a file.** It is the fee's opposite number in that respect,
and the counts beside it are deliberately separate: a club with no fee is missing from a
total, while a club with no customer is missing from nothing — its sessions and its
money are on the page in full, and what it lacks is only somebody to send the invoice
to. Read as one condition the two would each say the wrong thing about the other's
clubs.

**It is optional at creation and flagged here**, exactly like the fee: a club is created
before anybody has agreed who pays for it, so the gap is reported where the invoicing
happens rather than by a constraint that would stop an admin saving a club at all.

**A club with no municipality still refuses the whole month; a club with no customer
does not.** The asymmetry is the point. A club nobody can be billed for cannot be
rendered on a page organised by municipality and has no arithmetic to belong to, so the
read stops. A club with no buyer renders perfectly well, so refusing would take every
other club on the invoice down with it.

**Invoicing data never references the locations table.** Location data is geography and
has to keep working for every country we ever operate in; a customer's billing address,
its number and its invoice name are contract data about one country's arrangements.
Coupling them would make a national billing arrangement a property of the world map, and
the first site outside that country would carry columns that mean nothing. The customer
carries its own address, and the only edge between the two systems is the club, which
points at a place and at a buyer independently.

## The Finvoice export

The invoices are raised in **Fennoa**, the accounting system, by importing **Finvoice 3.0
XML** — one file per buyer per month. The page produces those files; nothing else in the
app does, and nothing about producing one is recorded.

The export's own code — the company constants, the month-to-invoice build and the
document writer — lives in `src/lib/finvoice/`, because the route layer is what consumes
it and no API route in this app reaches into a component directory. It reads this page's
built view rather than the wire document, so the file and the ledger cannot disagree about
a figure; the rules it follows are all here.

**Everything below about what the import needs was established with the CFO by importing
files generated from production data.** It is verified behaviour of a system we do not
control, not a reading of a specification, so a change to the document's shape is a change
that has to be re-verified against Fennoa rather than reasoned about.

- **Fennoa matches the buyer on the customer number**, which is the whole reason a club
  names a customer at all. A file whose buyer identifier is not an existing customer
  number does not fail — it **creates a customer**, which is the failure this feature
  exists to avoid, because nobody notices until the same municipality has two cards.
- **The buyer's postal address has to be in the file**, and the import refuses one without
  it, even though the customer card already holds an address. So the customer carries its
  own address and the serializer states it.
- **Fennoa assigns the invoice number when the invoice is sent.** Ours is provisional, it
  never reaches an accounting ledger, and it is what makes the export stateless: producing
  a month's file twice produces the same file, and there is no counter for a failed
  download to burn.
- **Payment terms, e-invoice routing and department names live on the customer card** and
  are not sent. They belong to the accounting system; a second copy in the file would be a
  copy that goes stale.

**One file is one customer's whole month, across every municipality.** A buyer is a
contract party rather than a place, so a customer's clubs can sit in several sections of
the ledger and still be one invoice — and one city can be two customers and therefore two
files. Everything the export decides follows from that: the readiness shown beside a
municipality's name is a claim about the customer's whole month, not about that section's
share of it, and a row takes its municipality from its own club rather than from the
section the reader clicked in.

**A file is refused rather than trimmed, on two grounds.** A customer with **any** club
lacking a fee gets no file at all: dropping the club would produce an invoice short by
whatever that club was worth, with nothing in it saying so, and a short total is the one
error nobody downstream catches. A customer whose clubs recorded **nothing** gets no file
either — an invoice for nothing is a document somebody has to explain. Both are ordinary
states of an ordinary month rather than faults, so both are values the callers render: the
page shows the control disabled with the reason, and the download answers a conflict with
the same reason. **One predicate decides both**, because a control that says a file cannot
be produced and a route that then produces one is the worst outcome available.

**The money rule is the one improvement over the files the previous system wrote, whose
totals sometimes did not foot.** Integer cents end to end: a row's net is its session count
times its fee, its VAT is that net at the rate rounded half up, its gross is the two added
— and the invoice's three totals are **the sums of the rows**, never a second calculation
over the invoice's own net. The two differ by a cent exactly where it matters most: three
identical rows of €65.00 are €16.58 of VAT each and €49.74 on the invoice, while rounding
the €195.00 in one step gives €49.73. The buyer's system adds the rows, so the sum is the
answer that foots. The division into euros happens once, when the amounts are written.

**The file is Finnish whatever locale the admin reads the ledger in.** It goes to a Finnish
municipality's accounts payable, so every name in it — the municipality, the hall, the club
— and the weekday abbreviations in a row's schedule are the Finnish ones. An admin reading
the ledger in Swedish exports the same bytes as one reading it in Finnish. A row names the
hall **only where the club's location is not the municipality itself**, because a remote
club points at its municipality directly and the row would otherwise say the same word
twice. Zero-width characters are stripped from every name: one production school name
carries a zero-width space that survives every round trip, is invisible in the admin UI,
and would reach the buyer's system as a byte their own search will not match.

**The seller, the article, the cost dimension, the VAT rate, the unit, the overdue
interest and the two standing free-text lines are company constants in the repo, not
environment variables.** None of them differs between deployments — there is one company,
one bank account, one VAT registration — and a staging deployment invoicing from a
different IBAN would be a worse answer than one invoicing from this one. Being in the repo
is also what lets the serializer's test assert the whole document rather than the half of
it that is not configuration.

**There is no "download the month" and no zip, deliberately.** A zip is a dependency and a
second thing to get right, and the import is per file anyway: the CFO works down the
collapsed ledger taking one file per buyer, which is the same number of clicks as
unpacking an archive would be. Revisit it when a month's customer count makes that false.

## How the month is read

**This is a ledger, and it is read the way a ledger is read: down the columns.** A month
runs to a hundred clubs across twenty municipalities, and the reader is a finance officer
checking figures against each other rather than somebody being introduced to a page. So
every decision here spends vertical space as if it were expensive: small body type, smaller
secondary type, one line per thing, hairline rules instead of gaps, and no ornament that
repeats what the line beside it already says. Every figure is set in tabular figures, so a
column of money is a column of digits that line up.

**The whole month is one panel, divided.** Not a panel per municipality: a border, a gap and
two lots of padding per municipality bought nothing the municipality's own name was not
already saying, and cost the reader the bottom half of the month. One panel is also what
makes the money axis exact rather than approximate — the month's total, every municipality's
total and every club's total end on one right inset, because there is one right inset.

**The month states itself on the panel's first line**: how many municipalities, how many
clubs and how many sessions on the left, the month's total on the right, and the exclusion
warning where one applies travelling along the left-hand line with the counts rather than
under the figure, so the line stays one line. The session count says "sessions" and not
"recorded sessions": every session this page counts is one that was recorded, so the word
was spent per locale on a distinction no line on the page draws — and the one place the
recording *is* the point, a club's missed count, says so in its own words.

**A municipality is one line, and it opens closed.** Chevron, name, then how many clubs and
how many sessions, then one download per Fennoa customer among its clubs, with its total on
the money axis and both warnings — clubs left out of the total, clubs with no buyer —
beside the counts. The line states the whole answer and opening it is how the reader asks
*why*; it is identical open and closed, so expanding adds the clubs underneath and moves
nothing that was already on screen. An expand-all control sits beside the month stepper;
which sections are open is where the reader is in the page rather than what the page is
about, so it is local state, in neither the URL nor storage.

**The line is also where the month is actually sent, which is why it carries links and
therefore why it is not itself a button.** A download is a navigation, so each one is a
real anchor to the export route; an anchor inside a button is the one arrangement that has
no correct answer for a keyboard or a screen reader. So this line takes the same shape the
club rows already take: the row is an ordinary element with a pointer convenience on it,
the disclosure is a real button carrying its own name, `aria-expanded` and focus ring, and
every link on the row stops its own click from travelling. A blocked file stays on the line
as a disabled-looking span with its reason in warning tone rather than disappearing — a
control that vanished when a club lost its fee would leave the reader looking for a file
with nothing on the page saying why it is gone.

**The whole-month line gains the count and nothing else.** There is no download there,
because there is nothing a month-wide control could hand over that the per-customer ones do
not — see the export section on why there is no zip.

**A club is one line of five columns, and the columns are one table for the whole
municipality.** In the order the arithmetic runs: what the club is, when it meets, what one
session of it costs, how many ran, and what that comes to. The last two columns multiply into
the third, so the reader can check the multiplication without leaving the row — which is the
whole reason the fee is on the line rather than only in the detail. The table is
fixed-layout, one per municipality, so every club's columns land where the club above them
did; a table per club would measure its own contents and give the page as many money axes as
it has clubs. A small tracked uppercase header names the columns once per municipality —
furniture, which is where the house style keeps its caps. The club's name is truncated to the
column and carries the whole name for a pointer, and links to its own admin page, which is
the repair path for the one thing this page can find wrong. **The link is the name's own
words and nothing more** — the cell does the truncating and the anchor stays inline, so it is
exactly as wide as the text that underlines on hover; a block anchor filling the cell made
the whole Club column navigate away, including the empty space after a short name, which is
the part of a row a reader is most likely to click when they meant to open it.

**The whole row opens the dates, and the club's name is the only thing on it that does
not.** A row this dense is read by pointing at it, and a reader aiming at a chevron to find
out why a number is what it is has been handed a target rather than an affordance — so the
row takes the click and fills on hover, and the name stops the click travelling. The
*keyboard* target stays the chevron button: a row-level control would have the club's link
nested inside it, which is the one arrangement that makes both ambiguous for a keyboard and
a screen reader, and every disclosure in this app is a real button carrying its own name,
`aria-expanded` and focus ring. A pointer convenience layered over a real control is the
shape; a control invented to replace one is not.

**A disclosure names the region it opens only while that region exists.** The
municipality's clubs stay mounted inside a collapsed region — inert and clipped to nothing
— so its line can name them at all times; a club's dated sessions are a table row, which
has nowhere to hide, so the club's control names them only when they are open. Either way
nothing ever points at an element that is not there.

**A club nobody has named a buyer for says so beside its own name**, in the same warning
tone and the same shape as the fee it sits two columns away from, because they are the same
kind of thing to the reader: a gap in a club's setup that this page found and the club's own
admin page repairs. It carries no link — the club's name beside it is already a link to
exactly that page, and a second anchor on one row would give the reader two targets for one
repair.

**A club that missed sessions says so on its own line.** The count column carries the missed
count beside the recorded one, in warning tone — so the problems in a month are visible with
every club still closed, which is what makes closing them by default affordable. Dates still
ahead of the club are never mentioned there: nothing is wrong with a session nobody has
missed, and a note about one would be indistinguishable at a glance from a note about one
that was.

**The dates behind a club's number are a second disclosure, under its own line.** A compact
table of the club's month, two columns wide: the day, its ISO week and what became of it as
one run of words on the left, and what it is worth on the right — indented under the club's
name and sitting on the same ground as the
line above it, because an indent and the rule above are what say *these belong to that*, and
lifting a run of rows off its neighbours would make a club's own dates read as a different
kind of thing from the club. The week and the status word ride with the date rather than
taking columns of their own: day, week and outcome are one fact — *what became of this day* —
and a fixed layout that gave each a column set them at intervals across the table, where the
week read as a figure belonging to something else and the status word sat in the middle of
the row attached to nothing either side of it. The tone belongs to the whole line rather than
to the word, which is what keeps the phrase one phrase: a warning-toned word after a plain
date would read as two facts about two different things, and the thing being flagged is the
day. It carries no column header of its own: the municipality's header named those columns
once already, and two values a reader tells apart by shape — a dated week with a word after
it, and a sum of money — do not need naming twice. Its amount column
is right-aligned and ends on the same right inset, which is how it joins the money axis
without having to agree with the outer table's column widths. Where the club meets is stated
here, once, above its dates, rather than on a line whose width is already spoken for by a
name and four figures.

**The document's scroll gutter is reserved.** Expanding a municipality is itself what puts
the page over the fold, so without the reservation the reader's own click summons a
scrollbar, narrows the viewport and moves every figure they were reading sideways — a shift
caused by the very action that was supposed to show them more. The opt-in attribute on the
page's root is the repo's own mechanism for this; the rule lives in
`src/components/layout/CLAUDE.md`.

**Below the width the columns need, the table scrolls sideways rather than stacking.** This is
an admin surface read at a desk, and five labelled values stacked per club is a worse answer
for a ledger than the same table dragged a little. The scroll belongs to the table's own
wrapper, so the page body's width — and the document's single scroll container — are
untouched.

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
club's schedule summary on this page renders in the **club's own** zone instead,
deliberately.

Every date on this page is a club-local calendar date — the session rows, the projected
dates, the club's own today — because that is what a session record is keyed to. A schedule
summary converted into the reader's zone can name a weekday those dates never fall on: a
line reading Tuesday sitting above a column of Mondays, for a reader one zone west of
Helsinki. A clock face the reader has to adjust by an hour is a smaller error than a page
that contradicts itself, and municipality clubs are Finnish by definition, so for the
finance officer actually reading this the two zones are the same one.

The departure is confined to that one column. Nothing else on the page carries a time of day
at all.

## Grouping and order

Month → municipality → club → session. Municipalities sort by the name **the reader sees**,
which is not always the stored one: the localized name is what the sort key has to be, or a
Swedish reader is handed a list that is not in alphabetical order for them. Clubs sort the
same way within a municipality, and sessions run ascending by date.

## A club that cannot be invoiced is refused at the boundary

**Every club on this page belongs to a municipality, and nothing here renders the case
where one does not — because the database refuses to answer such a month at all.** A
municipality club whose location chain reaches no municipality cannot be billed to
anybody: the invoice *is* per municipality, and there is no arithmetic that turns a club
with nobody to invoice into an invoice line. The read therefore stops and names the
product, and the page shows the failure it shows for any other refusal off the wire.

The rule is a deliberate trade, and both halves are worth stating. This page once put such
clubs in a trailing bucket, which meant a figure printed outside every total on the page —
the exact shape of a total that is quietly short — and a reader with no way to tell a club
that was never invoiceable from one whose location was mistyped an hour ago. Refusing sends
the same person to the same repair, raises no invoice in the meantime, and costs this page
a state it no longer has to carry anywhere: not in the contract, not in the arithmetic, not
in the copy, and not in the fixtures.

What the schema guarantees on its own is only that a municipality club carries a location;
it does not force that location's ancestor chain to reach a municipality. The refusal is
where that last step is enforced, so it belongs to the read rather than to any one
surface — a second page over the same document inherits the guarantee rather than having
to re-decide what to draw.

## How the page is looked at: the preview scene, not the database

**This page is reviewed from fixtures, in the UI Previews scene, and not by pointing it
at production data.** It is the densest surface in the app and most of what there is to
judge about it is a state — a missed session, a fee nobody set, a term ending mid-month.
Live data shows whichever of those the month happens to contain, changes between two
readings, and cannot be screenshotted twice; a month of invented clubs in the shape of
production shows all of them at once and shows the same ones tomorrow. Its invented names
are held to being *plausible* rather than recognisable: a fixture naming a real school or a
real customer's club is a page that looks like live data.

The scene renders **this shell**, not a copy of it, over a fixture that satisfies the
wire contract — so every figure on it is produced by the same pure build the live
document goes through, and a scene that looked right could not be a page that is wrong.
Two things make that possible, and both are deliberately visible in the code:

- **The shell takes an optional clock.** Every state here is a claim about where a date
  sits relative to today, so a fixture month is pinned to a fixed instant inside itself.
  The live page passes nothing and reads the ticking clock exactly as before; the tick is
  precisely what a pinned month cannot have, which is why this is a prop rather than a
  provider the scene could wrap.
- **The scene owns a query client that never refetches.** The shell's read is seeded —
  hydrated server-side on the live route, handed in as the seed in the scene — and the
  default one-minute staleness would otherwise let a window focus fire the real
  admin-gated read behind the preview and replace the fixtures with production's own
  month.

**The download links are real and cost the scene nothing.** Each points at the live export
route with the fixture's own month and customer id, so what a reviewer sees is the href the
live page would build — and an anchor is fetched when it is followed, not when it is
rendered, so the scene still reaches the network exactly as often as it did before: never.
The fixtures carry a customer whose file is blocked by a club with no fee and one whose
file is blocked by having nothing to invoice, because a month of ordinary clubs would show
neither.

**The month stepper stays inside the preview, and it is how the empty ledger is reached.**
The stepper is one of the page's own controls rather than a way out of a row, so the shell
takes its link target as a prop: the live page points it at another month of itself, and
the scene points it back at the scene. The fixtures answer the month asked for — the
working month has the ledger, and every other month is genuinely empty, because these clubs
run one spring term — so an empty month is a step away and a step back on the same page in
the same chrome, which is strictly more than a second scenario could have shown. The club
names remain real links out to the live admin pages, which is the honest behaviour for a
control whose whole purpose is to leave the row.

## Which municipality a club belongs to

The nearest ancestor-or-self of type `municipality` above the club's own location. A club
meeting in a school points at the school, whose parent is the municipality; an online club
points at the municipality directly, which is why the walk is ancestor-or-*self*.

**The walk passes through retired locations and never filters them.** A school that closed
last term still sat in its municipality while it was running the sessions being invoiced,
and dropping a retired row from the chain would leave every club that met there with no
municipality at all — which is now a refused month rather than a quietly short total, and
only for the months where it matters most.
