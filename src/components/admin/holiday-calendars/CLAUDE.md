# Holiday calendars

The admin pages behind the holiday calendars clubs follow: the list, the page for one
calendar (its name and its list of breaks, ending in the clubs following it), and the
create form. Attaching a calendar to a club happens on the club's own form, through the picker that lives here;
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

**A break is added and edited in a dialog; the page only lists them.** The list is one
line per break, in date order: its name in the admin's own locale, a complete or
not-complete mark per calendar language (wrapping, so any number of locales fits), its
dates with their weekdays, length and week numbers, and edit and remove. The dialog holds
one break: its two dates at the top, shared by every language and so above the tab bar,
then the shared locale tabs over its name field — the same grammar as every per-locale
editor, the tabs heading only what is written per locale. It edits a copy and files it
into the form's draft on its own Save ("Save and add another" when adding); nothing
reaches the database until the page is saved, and Cancel drops the copy. What one break
can get wrong — a missing date, an end before its start, a missing name — is refused in
the dialog; what only the whole calendar can get wrong — an overlap, the calendar's
name — is refused at the page's Save, naming the breaks by name and dates. While a date
picker is open inside the dialog, Escape closes the picker alone, so a press meant for it
cannot throw the break away.

**The calendar's languages are the calendar's, not each break's.** The dialog's tab bar
adds and removes a language for the whole calendar, on that dialog's Save: every break
needs a name in every language the calendar uses, because a calendar written in Finnish
and English whose autumn break had only a Finnish name would show an English reader one
Finnish word among English ones. A language with no break named in it is blank and is
dropped at the page's save; one naming some breaks and not others is refused, and until
then the list and the tabs show only the not-complete mark — the attention mark is kept
for a fault, as on the other editors, not for work in progress. The form is one of the
shared per-locale editors (`src/i18n/CLAUDE.md`); the draft files names by locale, then by
break, which is the shape the shared tab set takes.

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

**The save invalidates every plan reader, not only its own keys** — products and their
plans, the holiday breaks a product page lists, the calendars, participations (the family
feed nests under it), the gedu feed, the admin session document, substitutions, both
invoicing ledgers and the admin dashboard. The set is one shared invalidation in
`src/services/products/`, which a product save runs too, since a term, slot or calendar
edit moves the same readers; a new reader of a plan joins that set.

## The write path

No API route, for the invoice customers' reason: nothing needs a server secret. The reads
are table reads under the admin select policies, embedding breaks, their names and the
following clubs; the writes and the preview are admin-guarded functions, and the tables
carry no write grant. The admin MCP tools do not cover calendars (decided for v1): a
calendar is set up a few times a year, and its preview is a judgement to make on screen.
