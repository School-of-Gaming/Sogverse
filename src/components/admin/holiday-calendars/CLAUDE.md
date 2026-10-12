# Holiday calendars

The admin pages behind the holiday calendars clubs follow: the list, the page for one
calendar (the clubs following it, then its edit form), and the create form. Attaching a
calendar to a club happens on the club's own form, through the picker that lives here;
that save is an ordinary product edit and is not previewed.

## What a calendar is

**A named list of breaks, and the name is the admin's alone.** "Helsinki schools" is how an
admin finds the calendar; no family or gedu ever reads it. What a family reads is a
break's name, in their own language, where the sessions the break removes would have
been. So the calendar's name has one field and no translations, and each break carries a
name per locale.

**A break is two bare dates, both inclusive**, read in each following club's own zone.
They are UTC-pinned dates end to end, never re-anchored to a viewer. The date pickers
snap a week pick to Monday and Sunday, because breaks are planned in whole weeks.

**The calendar's languages are the calendar's, not each break's.** The form's locale tabs
sit over the whole break list, and every break needs a name in every language the
calendar uses: a calendar written in Finnish and English whose autumn break had only a
Finnish name would show an English reader one Finnish word among English ones. The tab
bar and the tab-set helpers are the shared ones the product form uses
(`src/components/ui/locale-tabs.tsx`, `src/lib/i18n/locale-tabs.ts`); the draft files
names by locale, then by break, which is the shape those helpers take.

**There is no deletion and no break-length guard** (owner's ruling). A calendar a club
follows cannot be deleted at the database either; a club detaches it instead.

## Saving is live, so it is previewed

**A saved edit changes every following club at once, past months included**: planned
sessions disappear or come back, written-up sessions are hidden or shown, invoices and
payouts move, and substitution requests lose or regain their session. So an edit to a
calendar some club follows asks the preview function first, with the same payload the
save takes; the database validates both through one loader, so a payload the save would
refuse is refused at the preview with the same sentence, and that sentence is shown as
the form's error, verbatim. An empty answer saves straight on; otherwise the confirm
dialog lists each affected club and what its families will see, only the counts that are
not zero. A new calendar, or one nobody follows, never previews.

**A session on a club's today counts as still to come** in the dialog's split between
future and past, and two slots on one day are one date to a family.

**The save invalidates every root a calendar can move** — products and their plans,
participations (the family feed nests under it), the gedu feed, the admin session
document, substitutions, both invoicing ledgers and the admin dashboard — not only its
own keys.

## The write path

No API route, for the invoice customers' reason: nothing needs a server secret. The reads
are table reads under the admin select policies, embedding breaks, their names and the
following clubs; the writes and the preview are admin-guarded functions, and the tables
carry no write grant. The admin MCP tools do not cover calendars (decided for v1): a
calendar is set up a few times a year, and its preview is a judgement to make on screen.
