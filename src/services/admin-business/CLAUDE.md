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

Each seat held now or once is a span from its sign-up to whichever comes first: its end,
or the end of its product's run (the last day, in the product's zone). **A seat on a
product whose run is over is not held**, though its status stays active: camps, events and
municipality terms keep their seats active after the last day, and counting them would make
every family that ever bought a camp a paying family. A seat promoted from the waitlist is
dated from its sign-up, the only start a seat records. Every figure "now" and "at the end
of last month" asks which spans cover that instant, so the comparison costs nothing; what
it cannot see is a change that leaves no timestamp (below).

## The figures

- **Paying families**: families holding a seat on a product whose billing mode is paid.
- **Recurring revenue**: live subscriptions (stored as active, past due or cancelling),
  each at the monthly price its seat's product carries today in EUR. Discounts and
  prorations are not in it, and there is no price history, so last month's figure is
  last month's subscriptions at today's prices. A subscription in another currency, or
  whose product has no EUR price, is counted beside the figure rather than in it.
- **Gamers in a seat**: distinct participants in a held seat, never a parent's own seat;
  those in a municipality club counted apart.
- **Sign-up → first seat**: of the parent accounts created in the last 90 days, how many
  have held any seat. Every parent account counts, one still owing its registration too.
- **Families by engagement**: every parent account in exactly one slice, the first it
  matches — a live subscription; any payment ever; every seat ever held on a municipality
  club; any other seat (free products, and paid ones nobody was charged for); no seat ever.
  A waitlist place is not a seat.
- **Revenue by month**: payments by the product they paid for — consumer clubs are
  subscriptions, camps and events their own band, and a payment naming no product
  unattributed. A duplicate charge is left out: it is refunded by hand and bought nothing.
  Only EUR is summed. Before the month of the first recorded payment the bands are absent,
  not zero: nothing was recorded then, which is not the same as nothing being taken.
- **Municipality revenue is the municipality invoicing page's month total**, read and
  built by that page's own code, never a second formula — clubs without a fee are outside
  it exactly as they are there. A month that page refuses fails this page too.
- **Families by month**: sign-ups are parent accounts created; a first seat is the start of
  a family's earliest seat; a stop is each time a family's paid seats, merged, run out — a
  family that comes back and leaves again has stopped twice. A camp's end is a stop.
- **Gedu capacity by month**: certified gedus (certified now) whom that month's gedu
  invoicing pays for at least one session, beside the seats held at any moment of the month.
  Gedu invoicing reads today's assignments, so a past month is read against today's
  staffing, as it is there. Months before the first one in which any gedu is paid are absent.

**Revenue is before refunds.** Refunds are credit notes, and credit notes live only in
Stripe, so nothing here can net them; a refunded payment counts in full.

**The status changes that leave no timestamp are read as they stand now.** A subscription
Stripe gave up on, or one never paid, is not live at any instant; one still collecting is
taken to have been since it was created; a product's billing mode and price are today's.
