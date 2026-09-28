# Gedu invoicing

What each gedu invoices School of Gaming for, one calendar month at a time, on two pages
over one document: the admin's page reads every gedu, and a gedu's own **Invoicing** page
(reached from their account menu) reads them alone — the database narrows that read to the
caller's own seats, and the two pages run the same pure build over it. It **writes
nothing, snapshots nothing and exports nothing**: every figure is recomputed from today's
facts each time it is read. There is no approval workflow in v1 — no submitted, approved or
paid state, no frozen month, no Truster file; gedus copy the figures onto their own invoice.

## What pays

**A seat pays iff a stored session row exists for its group on a date that has arrived, and
the gedu was expected there.** The row is the evidence somebody was there — it is written
the moment a report, a note or an attendance mark is recorded, and not before — so a session
a gedu ran and recorded nothing for does not pay until they record something. The gedu page
says so in those terms; never tell a gedu a session is paid for having happened.

**Counting is per gedu, per (group, date)** — the opposite of the municipality invoice,
which collapses a club's groups on one date into one session. A gedu at two groups of one
club on the same afternoon held two seats and is paid for two.

"Expected" is the substitution feature's own derivation, run over the seats the document
carries, so the two features cannot disagree about who was meant to be there. A schedule is
a claim, not a session, exactly as in the municipality invoice: projected dates and a sub's
booked dates with no row are **not recorded** before the product's local today (warning
tone, zero) and **upcoming** from today on (no amount); a row dated after today is upcoming
and never pays. A cancelled date is never paid and never missed, and only a claimed date
gets a cancelled line.

## Roles and fees

**The fee is the product's current per-session fee for the role, read with the page.**
Editing a fee rewrites every month that shows it. A gedu who is primary on one group and
assistant on another of the same product has two club lines, one per role, because the
role picks the fee.

**A sub is paid in the role recorded on the request** — the absent gedu's role when it was
filed — not in any role the sub holds elsewhere. An absent gedu's line sits under the role
they filed in, so it lands under the club line it would have paid on.

**An unset fee is never zero.** It shows as "fee not set" in warning tone in place of the
fee and the club's total, and the club is outside both subtotals and the total; the counts
beside a total say how many clubs and sessions were left out. On the admin page the club's
name links to its admin product page, which is the repair. The gedu page links into no
admin page and tells the gedu to contact the office instead. A fee of zero is a real zero
and pays zero.

## Absences and substitutions

An absent gedu's own date renders as a quiet zero line — "away, and who substituted", or
"away, no substitute" — so they can see why a date they hold did not pay. A sub's lines
name the gedu they stood in for, whatever became of the date.

**Both names are shown on both pages, and that is consistent with the substitution
feature's disclosure rules rather than an exception to them.** The absent gedu is disclosed
to admins, to the requester on their own request, and to staff on the group — and a seated
sub is staff on the group. The *reason* for an absence never reaches this document, and a
withdrawn request is history that changes nothing and does not appear.

## The two sums, and VAT

A municipality club's money is the **municipality** subtotal; every other product type —
consumer club, camp, event — is **consumer**. The Gedu handbook asks gedus to itemise the
two sums on their invoice, so the gedu page leads with them and their total, and the admin
page carries both on every gedu's line. A gedu's total is the two subtotals added, and the
month's total is the gedu totals added, so no figure can disagree with the ones it stands
over.

The fees are VAT 0 %, and the gedu page says that adding VAT is the gedu's own business.

## Staffing is today's

**Assignments keep no history, so a past month is read against today's staffing.** Removing
a gedu from a group, or changing their role on it, rewrites every past month: the seats they
held vanish from the months they worked them, or move to the other role's fee. Substitutions
and absences do not drift — a request is dated and keeps the role it was filed in. The owner
accepted this for v1, pending a check with the team on how often a gedu permanently changes
on a running club. It has to be settled before any approval or snapshot is built on these
figures: an approved month that a later reassignment silently rewrites is the failure that
would ship.

## Shared with municipality invoicing

The two pages are one kind of ledger and are drawn from one set of parts in
`src/components/invoicing-ledger/`: the month stepper, the summary line, the top-level
disclosure section, the chevron, the warning flag and count-line warning, the column header
row, and the dated-lines table with its dated line. A change there changes both pages, and
the rules for how a ledger is read — in the municipality invoicing `CLAUDE.md`, "How the
month is read" — bind here too. The month arithmetic and the routes' `?month=` handling
(last month in Helsinki by default, and a failed read carried rather than shown as an empty
month) live in `src/lib/invoicing/` and are shared the same way. What is not shared is what
genuinely differs: the club table (a role column where the municipality ledger has a
schedule, and no customers or files) and what each top-level line says.

A gedu page's clubs open on arrival and the admin's start closed: a gedu has a handful of
clubs and checks the dates against their own records, while an admin reads down a column of
gedus.

## The preview scenes

Two scenes over one fixture month, pinned to an instant inside it. The gedu scene has one
scenario per viewer, because the gedu's read shows one gedu and no single fixture gedu holds
every kind of line; a test holds the two viewers to covering all of them between them.
