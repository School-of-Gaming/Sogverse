# Admin business figures

The `/admin/business` page's data: leadership's read on how School of Gaming is doing.
The reads are here, plain walked selects on the admin's own session plus the two invoicing
reads; the arithmetic is one pure build over what they return.

**Every month is a Helsinki calendar month**, from midnight on the 1st in Europe/Helsinki,
named by its first day (`YYYY-MM-01`). The company reports in Finland, and a UTC month
puts the first hours of every month in the one before. Instants cross into months through
the one helper in this directory, which is DST-correct; nothing here slices an ISO string
for a month.

## A seat is a span of time

Each seat held now or once is a span from the later of its sign-up and its product's first
day to whichever comes first: its end, or the end of its product's run, both days read in
the product's zone. **A seat is not held before its product begins**: a camp booked months
ahead is not held, taught or staffed until it runs, so no figure counts it before then, and
a seat that ended before its product began was never held at all. **A seat on a product
whose run is over is not held either**, though its status stays active: camps, events and
municipality terms keep their seats active after the last day, and counting them would
make every family that ever bought a camp a paying family. A seat promoted from the
waitlist is dated from its sign-up, the only booking a seat records. The two figures about
a family's first seat (sign-up → first seat, and first seats by month) take the booking,
not the span's start, because they measure when the family committed. Every figure "now"
and "at the end of last month" asks which spans cover that instant, so the comparison costs
nothing; what it cannot see is a change that leaves no timestamp (below).

## The figures

- **Revenue last month**: the last complete Helsinki month's revenue by month (below), every
  band summed, beside the month before's; the band that brought in most is named with its
  share. It leads the money because municipality invoices dwarf subscriptions, so recurring
  revenue alone reads as the business being a tenth of its size. A month before payments were
  recorded has no total rather than a municipality-only one.
- **Paying families**: families holding a seat on a product whose billing mode is paid. It is
  not the subscriber slice (below), and the two differ for real: a family subscribed to a club
  that has not begun holds no seat yet, so it subscribes without paying, and a family at a camp
  pays without subscribing. The tile counts the first kind beside itself ("+2 start a club
  later") so the gap reads off the page.
- **Subscriptions per month** (recurring revenue): live subscriptions (stored as active, past due or cancelling),
  each at the monthly price its seat's product carries today in EUR. Discounts and
  prorations are not in it, and there is no price history, so last month's figure is
  last month's subscriptions at today's prices. A subscription in another currency, or
  whose product has no EUR price, is counted beside the figure rather than in it.
- **Gamers in a seat**: distinct participants in a held seat, never a parent's own seat;
  those in a municipality club counted apart.
- **Sign-up → first seat**: of the parent accounts created in the last 90 days, how many
  have booked a seat, one not yet begun included. Every parent account counts, one still owing its registration too.
- **Families by engagement**: every parent account in exactly one slice, the first it
  matches — a live subscription; any payment ever; every seat ever held on a municipality
  club; any other seat (free products, and paid ones nobody was charged for); no seat ever
  but a gamer linked; no seat ever and no gamer. A gamer link is read as it stands now, and
  a parent's own seat is a seat. A waitlist place is not a seat.
- **Revenue by month**: payments by the product they paid for — consumer clubs are
  subscriptions, camps and events their own band, and a payment naming no product
  unattributed. A duplicate charge is left out: it is refunded by hand and bought nothing.
  Only EUR is summed. Before the month of the first recorded payment the bands are absent,
  not zero: nothing was recorded then, which is not the same as nothing being taken.
- **Municipality revenue is the municipality invoicing page's month total**, read and
  built by that page's own code, never a second formula — clubs without a fee are outside
  it exactly as they are there. A month that page refuses fails this page too.
- **Paying families by month**: the paying families figure at each month's last instant, and
  now for the month in progress, so the line ends on the tile. The month's flows ride in its
  tooltip: sign-ups are parent accounts created; a first seat is the month a
  family booked its earliest seat; a stop is the month a family's last live subscription ended,
  leaving it none — one that subscribes again and leaves again has stopped twice. A camp or
  event ending is never a stop: it is a finished purchase, not a lost family, and counting
  it would make every summer look like churn.
- **Gamers per Gedu by month**: over every session held in the month, the gamers seated in
  its group, summed, over the gedus who ran it, summed — how many gamers one gedu has in
  front of them on average. Summing before dividing weights each session by its size, so a
  big group counts for more than a small one, as it does for the gedu standing in it.
  - *A session held, and who ran it*, are the gedu invoicing page's own build: a session is
    a (group, date) with a paid line, and its gedus are every gedu paid for it. So a session
    counts only once something is recorded for it, never on a cancelled or holiday date, and
    a session no gedu is paid for (its group has nobody assigned today) is left out rather
    than counted as gamers with nobody in front of them.
  - *A gamer seated*: a gamer's seat (never a parent's own) in that group, held at any moment
    of the session's product-local day. A seat is in its group from the moment it joined
    it; a move between groups keeps only the latest, so a gamer who moved counts in their
    present group from the day they moved, and in the earlier one not at all.
  - Months before the first one with a session in the window are absent; a later month with
    none has no ratio.
  - The figure over the line is the last complete month's point, never a second "now" rule:
    one over today's groups and assignments disagreed with every point of the line (groups
    that held no recorded session, gedus on several groups), and a figure beside a line has
    to be one of its points.
- **A number of Gedus is always distinct people**, never assignment rows or paid lines: a
  gedu on three groups is one Gedu. The ratio's denominator is the exception by design, a
  sum of gedus over sessions, and is never shown as a count of Gedus.
- **Certified Gedus**: gedus whose profile is certified now, and of those how many are
  assigned to a group of a product running now (the derived product status: begun and not
  yet ended); the page shows the difference too. An uncertified gedu still assigned
  somewhere is in neither figure.

**Who ran a past session is read against today's assignments.** The database records per
session who was *expected* only through dated substitutions; standing staffing is the group
assignment, which keeps no history. Per-session authorship (a session's writer, an
attendance mark's) is stored, but no admin read reaches it, and the writer of a record is
not necessarily the gedu who ran the session. So a past month counts a substitute on the
date they covered, and otherwise the gedus assigned to the group today: a gedu taken off a
group leaves the months they ran it, and one added later appears in months before they
joined. The page does not say so: it shows rather than explains (`src/CLAUDE.md`), so the
caveats live here.

**Revenue is before refunds.** Refunds are credit notes, and credit notes live only in
Stripe, so nothing here can net them; a refunded payment counts in full.

**The status changes that leave no timestamp are read as they stand now.** A subscription
Stripe gave up on, or one never paid, is not live at any instant; one still collecting is
taken to have been since it was created; a product's billing mode and price are today's.
The exception, accepted as rare: when such a subscription's seat is later ended, it gains
an `ended_at` and reads as live from creation to that day, so it adds a stop in the month
the seat was removed. Telling it apart would need a recorded payment per subscription, and
a handful of families did not justify the second read.
