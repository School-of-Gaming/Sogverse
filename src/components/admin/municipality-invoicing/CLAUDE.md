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

**A municipality is billed for every session that was due and not cancelled.** A session
is due on a date the club's schedule projects and on a date where one of its groups holds a
stored session row. Session records are materialized lazily — one is written the moment an
educator records a report, a note or an attendance mark, and not before — so a row is the
evidence that somebody was there; but a missing write-up is not evidence that nobody was,
and the municipality owes for a session that was due whether or not a gedu recorded it.
Only a cancellation takes a due date off the bill, and only a date not yet reached keeps
one off it. Gedu invoicing answers the same question the other way — a gedu is paid only
for what they recorded — and that difference is deliberate: it is two contracts, not one
rule applied twice.

**Counting is per club, per calendar date.** A club may run several groups, and two
groups meeting on the same date are one session of that club. The rows arrive raw, one
per group and date, and the collapse happens in the builder: it is a rule of the invoice,
not a property of the data, and doing it in the query would have thrown away which groups
met.

**The club's weekly slots are projected across the month**, clipped to its own term, both
ends inclusive. A projected date with no stored row splits on whether it has passed:

- **Before today — unrecorded, and billed.** It was due, so it bills at the club's fee
  exactly as a recorded session does, and it is in every count and every total. It keeps
  a line state of its own, muted and labelled as billed without a record, because a
  missing write-up is still something an admin may want to chase — but it is not a
  warning: nothing about the invoice is wrong. Where the club's fee is unset it shows
  "fee not set" like a recorded line, because what is unknown is the price, not whether
  it bills.
- **Today or later — upcoming.** Shown muted with no amount at all. It has not happened;
  printing an amount against it would bill a session not yet owed.

**A cancelled date is the third answer, and it holds either side of today.** An admin can
cancel a session, and a projected date no group of the club ran and that is cancelled is
shown as **cancelled**: worth nothing, printed at zero in a muted tone. It is settled, so a
future one says cancelled rather than upcoming. Because a cancellation is the only thing
that stops a due date billing, three rules fix exactly what it covers:

- **Only a projected date gets a cancelled line.** The document carries only the
  cancellations in effect — the database's one answer, the same every surface reads — so
  one left with neither a projection nor a record is never on it. One over a record the
  schedule has since stopped projecting is on it and keeps that record off the bill, but
  it has no projected date to mark, so it renders no line.
- **A club cancels per group and is invoiced per date, so a date is cancelled only when
  every group the club has cancelled it.** The document lists every group of the club,
  including one that neither met nor cancelled all month — the rows and cancellations alone
  cannot name that group, and it is exactly the one whose due session a sibling's
  cancellation would otherwise take off the bill. One group cancelling while a sibling
  was due and did not leaves the date unrecorded, and so billed: the sibling still owed
  the session. If any group ran the date, it bills as recorded.
- **A cancelled (group, date) pair never bills, even beside a stored row.** An admin may
  cancel a session that was recorded, and the admin's word wins — whatever the schedule
  or the term does afterwards: the document leaves such a row out of its sessions
  altogether, so no reader can bill it, and a restore puts it back.

The month's session count, every total and every Finvoice row's quantity are the **billed**
dates: the recorded ones no cancellation covers, plus the unrecorded ones. A recorded date
and an unrecorded one are never the same date, so the two add. A customer whose clubs'
due dates were all cancelled has nothing to invoice and is refused on that ground.

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
dates, so nothing is due beyond its rows and nothing bills unrecorded, and its schedule
column is simply empty rather than printing a weekly cadence it does not have. What it must
never do is fail: one such club would otherwise take the whole month's invoice down with it, so the
build is required to survive every document the wire contract accepts.

**Projection is offered wherever the club has a start date.** That date is the whole of the
"had it begun" rule: the walk is clipped to it, so a term that starts after the month being
invoiced projects nothing without a second test for it. A club with no first day has no date
to start walking from — guessing one would invent billed sessions — and it can still appear
on the invoice, on the strength of its stored rows alone.

A club's lifecycle is nowhere in this page's arithmetic, deliberately. A stored status was
here once, and it was the defect: it never advanced past its initial value, so a test on it
was a test that never passed, and projection was dead for every club on the invoice. The
term dates say everything a projection needs to know.

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
dates a past month projects — and because a passed projected date bills, it changes that
month's **totals** too, not only its lines. A month looked at last week can bill a different
amount today, and a club that has just had its schedule corrected is expected to. That is
the same contract as the fee: an invoice is recomputed from today's facts until it is sent,
so a schedule has to be right before a month is invoiced, exactly as a fee does.

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
many municipalities, how many clubs, how many sessions it bills), because a figure the finance
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
before anybody has agreed who pays for it, so the gap is reported rather than refused by a
constraint that would stop an admin saving a club at all. Reported in two places, again
exactly like the fee — here, where it costs a file, and on the admin dashboard's attention
queue, where an admin still has time to close it before a month's invoices are raised.

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
XML** — one file per buyer per billing period, which for most buyers is a month. The page
produces those files; nothing else in the app does, and nothing about producing one is
recorded.

The export's own code — the company constants, the period-to-invoice build and the
document writer — lives in `src/lib/finvoice/`, because the route layer is what consumes
it and no API route in this app reaches into a component directory. It reads this page's
built months rather than the wire documents, so the file and the ledger cannot disagree about
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
- **The invoices are numbered from Fennoa's own series, so the file's invoice number is
  deliberately not a number.** Fennoa keeps a numeric invoice number from an imported file
  as the invoice's final number once the invoice is approved, and skips one carrying
  anything but digits, numbering the invoice from its own series instead. So the file
  carries our reference — `SOG-`, then the period's last month, then the digits of the
  buyer's Fennoa customer number, e.g. `SOG-2026050204` — as both the invoice number and
  the message identifier, within Finvoice's twenty characters. **This rests on Fennoa's API
  documentation, not on an import**: it is confirmed by importing a file and checking that
  the draft carries no number of ours, without approving it, since approval is what
  reserves a number in the series.
- **The reference is deterministic per buyer and period**, so a re-download is recognisably
  the same invoice and the export stays stateless: producing a period's file twice
  produces the same file, and there is no counter for a failed download to burn. A buyer is
  on one cadence, so its periods end in distinct months and no two of its files share a
  reference. **It is derived from the buyer rather than from where the buyer sits in the
  month**, because a position moves the moment another club names a new customer, and
  every later buyer's re-download would come back under a different reference. Within a
  month it is unique across buyers whose customer numbers differ in their digits, which
  every number Fennoa issues does. A number carrying no digit at all — not a shape Fennoa
  issues, but the field is free text — falls back to the buyer's padded place in the
  month, and is stable only for as long as the month's list of buyers is.
- **Payment terms, e-invoice routing and department names live on the customer card** and
  are not sent. They belong to the accounting system; a second copy in the file would be a
  copy that goes stale.

**One file is one customer's whole billing period, across every municipality.** A buyer is
a contract party rather than a place, so a customer's clubs can sit in several sections of
the ledger and still be one invoice — and one city can be two customers and therefore two
files. Everything the export decides follows from that: the readiness shown beside a
municipality's name is a claim about the customer's whole period, not about that section's
share of it, and a row takes its municipality from its own club rather than from the
section the reader clicked in.

**A file is refused rather than trimmed, on two grounds, and only in its period's last
month.** A customer with a club that **ran** in any month of the period — that has at
least one billed session, recorded or not — and has no fee gets no file at all: dropping
the club would produce an invoice short by whatever that club was worth, with nothing in it
saying so, and a short total is the one error nobody downstream catches. The reason names
the first month of the period where that happened, because a quarter refused in March over
a club that met only in January has to send the reader to January. A customer whose clubs
have **no billed session** in the period gets no file either — an invoice for nothing is a
document somebody has to explain. A request for a period customer's file in a month that
does not end its period is refused as well, with the month that does. These are ordinary
states rather than faults, so they are values the callers render: the page shows the
label, or the control disabled with the reason, and the download answers a conflict with
the same reason. **One predicate decides all of them, over the whole period**, because a
control that says a file cannot be produced and a route that then produces one is the
worst outcome available. Where the page does not yet hold every month of a period, the
predicate says so rather than deciding over the part it has.

**What the refusal asks is whether the FILE would be wrong, never whether the data is.**
Those are two questions with two readers. A club that ran without a fee makes the file
short, so the file is refused. A club that billed **nothing** is not on the file at all —
exactly as it is not in the ledger's total — so no price it lacks can change a figure in
it, and refusing would stop every real club of that buyer being invoiced over a club that
did not meet. The missing fee is an admin error either way, and it stays reported where
data problems are reported: on the club's own line here, in the counts of clubs left out of
a municipality's total and out of the month's, and as an attention item on the admin
dashboard. The export is not a third alarm for it. So the number a customer's refusal
carries is its own, under its own name, and it is not the count printed beside a
municipality: one says what a file would be wrong about, the other what the month is
missing.

**The money rule is the one improvement over the files the previous system wrote, whose
totals sometimes did not foot.** Integer cents end to end: a row's net is its billed count
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
twice. Zero-width characters are stripped from every name **and from every field the buyer
half of the file is written from** — the customer number, the invoice name, the address and
the two free-text fields: one production school name carries a zero-width space that
survives every round trip, is invisible in the admin UI, and would reach the buyer's system
as a byte their own search will not match — or, in the identifier Fennoa matches on, as a
buyer that matches nobody and is therefore created.

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

## Billing cadence: a month, a quarter or a half-year

**A customer is invoiced monthly, quarterly or half-yearly, as agreed with it**, and the
cadence is stored on the customer (`../invoice-customers/`). **Periods are
calendar-aligned**: quarters are Jan–Mar, Apr–Jun, Jul–Sep and Oct–Dec, half-years Jan–Jun
and Jul–Dec, and a month is a one-month period — which is what lets a monthly buyer go
through the very same path rather than a second one. A period never crosses a year.

**The ledger stays a month view.** Every figure on the page — sessions, clubs,
municipality and month totals — is the month being viewed, whatever any customer's
cadence. Only a period customer's download control changes:

- **In a month that is not its period's last**, there is no link and no warning, because
  nothing is wrong: a quiet label says how often it is invoiced and which month its file
  is produced in.
- **In its period's last month**, the link downloads one invoice covering the whole
  period, and it is labelled with the period's short name and the period's total, so the
  figure on it cannot be mistaken for the month's own total beside it on the line.
- **A customer whose period ends this month but who has no club this month** — a quarterly
  buyer whose clubs stopped in May still owes the quarter that ends in June — sits on no
  municipality's line, so its control gets a line of its own at the foot of the ledger,
  and on an otherwise empty month it is the one thing under the empty-month sentence.

**The period's file is built from one month document per month of the period**, each
read through the same function and built by the same pure build the ledger uses: there is
no aggregate read and no second arithmetic. So in a month that ends a period, the page
reads the period's earlier months as well — which months is decided by the cadences
customers are on, read from the customer list rather than from the month's own document,
because the document does not mention a buyer with no club in it. A month that ends no
period of a cadence anybody is on reads nothing more.

**A long period makes the no-snapshot rule reach back further.** A period's file is priced
at the fee read when it is downloaded, and its sessions are derived from the schedule as it
stands then — so a fee or schedule edit in the middle of a quarter or a half-year reprices
and rebills every month of it already delivered, not only the months still to come. The fee
and the schedule have to be right for the whole period before its file is raised.

**One row per club per month**, month by month, so a quarter's file reads in the order its
months were checked. Each row carries its month's first and last day, and the invoice
states the period's first and last day, which is what the Finvoice guide recommends for an
invoice covering several months; a row's text also names its month, because three rows of
one club otherwise read the same. The free text names the whole period (`1–3/26`), the
invoice is dated the first day after the period, and the filename and number take the
period's last month. **A monthly file states none of the period elements** and is the
shape the imports were verified against; the elements a period file adds are the part of
it that is checked against Fennoa on its first import. Cancelled sessions stay out of every
file.

## How the month is read

**The parts this ledger is drawn from are shared with gedu invoicing**
(`src/components/invoicing-ledger/`), so the rules below bind both pages and a change to one
of those parts changes both.

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
under the figure, so the line stays one line. The session count says "sessions": it is the
billed count, recorded and unrecorded alike, and the one place the recording *is* the
point, a club's not-recorded count, says so in its own words.

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
session of it costs, how many bill, and what that comes to. The last two columns multiply into
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

**A club billed for sessions nobody wrote up says so on its own line.** The count column is
the billed count, and beside it, in quiet secondary type, how many of those billed sessions
are not recorded — so a missing write-up can be chased with every club still closed. It is
deliberately not a warning: those sessions are in the count and the total, the invoice is
right, and a warning tone there would read as a figure to doubt. Dates still ahead of the
club and cancelled dates are never mentioned there.

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
judge about it is a state — a session billed without a record, a fee nobody set, a term
ending mid-month.
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
file is blocked by having nothing to invoice — its one club's every due date cancelled,
since anything else that was due would bill — because a month of ordinary clubs would show
neither. They also carry cancellations on both sides of the pinned today and one on a
date nothing projects and nothing is recorded on, which must render no line. Three
customers are on a period: in the working month all three wait for June, and in March —
which ends the first quarter and sits in the middle of the first half — one quarter's file
is ready, one is refused over a club that ran without a fee in January and had stopped by
March, and the half-year is still under way, beside the monthly files.

**The month stepper stays inside the preview, and it is how the empty ledger and a
quarter's file are reached.** The stepper is one of the page's own controls rather than a
way out of a row, so the shell takes its link target as a prop: the live page points it at
another month of itself, and the scene points it back at the scene. The fixtures answer the
month asked for, and hand the shell a period's earlier months exactly as the live route
does — the spring term's months have the ledger, with every per-month state in the working
month, and every month outside the term is genuinely empty — so an empty month and March's
period files are each a step away and a step back on the same page in the same chrome,
which is strictly more than a second scenario could have shown. The club
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
