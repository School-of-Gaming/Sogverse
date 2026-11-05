# Staff UI against "show, don't tell"

**Status: open — nothing decided. Researched 2026-11-03 against `dev`. Every finding,
replacement and ranking below is an unconfirmed proposal from the research, not something
the owner has agreed to; take each one to the owner before changing copy. The copy changes often,
so re-read a string before acting on it here.**

How far the admin and gedu UI already follow the staff-surface rule in `src/CLAUDE.md`
(Layout & Scrolling, "a staff surface shows; it does not explain"), where they fall short,
and what each shortfall could become. The "Proposed" column and lines are suggestions;
whether a given line breaks the rule at all is part of what is still to be ruled on.
`/admin/business` is left out because it was written
to the rule.

## How it was checked

- The English copy for the admin and gedu namespaces in `messages/en/` (admin, adminHubs,
  gedu, geduInvoicing, team, tools, dashboardSections, sessionFeed). Every caption, hint,
  description, note and empty state was checked in the component that renders it, to see
  whether it is always on screen or shown only on demand. No screenshots.
- Left out by design: the platform vision page (a page meant to be read), the UI components
  and previews pages (developer tools), the gedu help FAQ (a help page may explain), and
  the trainee lock explanations (shown only when the lock is clicked).
- The test for each line: **does it change what the figure or control means or does?** If
  so it stays, cut to a few words. If it explains how to read the page, repeats the
  heading, repeats a line beside it, or documents a fallback rule, it goes.

## Scale (counted 2026-11-03)

Counted by hand from the strings over 45 characters, plus every key named like a
description, hint, caption, note or empty state. Re-pull by walking those namespaces the
same way and checking each string in its component.

- **Admin:** about 1,540 strings, about 245 of them over 70 characters. About **110 that
  are always on screen break the rule**. The product editor and the four content editors
  (spotlights, library, testimonials, guides) hold over half of them.
- **Gedu:** about 580 strings; about **15 break it**. Its empty states and first-use
  notices already serve the newcomer half of the rule. There is one real dead end (the
  substitution pool, below).

## Admin, costliest first

### Product editor (clubs, camps, events)

The most-edited admin form. Every section has a description, and about 25 fields carry a
hint that is always visible.

| Copy | Why it breaks | Proposed |
|---|---|---|
| Section descriptions "What to call this and what it's about.", "Who this is intended for.", "Pick when parents can start signing up." | Repeat the heading | Delete |
| The visibility section's description (2 sentences) and the "List this product…" checkbox hint (3 sentences) | The same explanation twice, one above the other | Delete the description; the hint becomes "Still buyable by direct link." |
| The consents description and the three "Ticking this adds an optional question to this product's signup… They may decline, and the seat is unaffected." | A walkthrough, said three times | Delete the description; label each checkbox by the question it adds |
| Languages hint "…Parents see this product in their UI language if available, otherwise in English, then…" | A fallback rule belongs in the code's docs | "At least one language." |
| The Where, When and Billing descriptions | Explain choices the option cards already show | Delete. "Leave the end date blank for an ongoing club" moves into the end-date field's placeholder |
| Fees description "What we pay the Gedus each session… These are internal figures…" and the fee hints "Choose Unknown if you'll set it later, or Volunteer if…" | Explain the section and the options in the select | Heading "Internal fees"; delete the rest |
| Region lock hint (3 sentences on self-reported location) | A caveat for the code's docs | "Only families in this country can sign up." |
| For-parents hint "…No age range — age describes children, not adults." | A justification | "A parent takes a seat themselves." |
| Tag, topic, short and long description hints (where families see each) | Admins know where these show | Delete, or two or three words ("Shop badge") |
| Timezone hint when changing the zone | Changes what saving does | Keep, cut: "Changing it moves every upcoming session to the same clock time." |
| Start date hint (first charge date) | Changes what the field means | Keep, cut: "Also the first charge date. Changing it doesn't move existing subscriptions." |
| Empty list "No consumer clubs yet. Click New consumer club to create one." | An instruction; the button is beside it | "No consumer clubs yet." |
| Participant picker "Drop a child or a parent straight into this product, bypassing payment…" | Explains the dialog | "Adds without payment." |
| VAT: a reason line per rate plus a note under the price | Three lines explaining a rate that can't be changed | "VAT {rate} · reduced (camps)" or "· standard"; "incl. VAT" as the price field's suffix |

### Groups panel (product page)

Used daily.

| Copy | Why it breaks | Proposed |
|---|---|---|
| "Drag each participant into the group they'll play with. Add Gedus to lead each group." | An instruction the drag handles already give | Delete |
| Unassigned "People who aren't in a group yet. Drag them into one to place them." | Repeats the heading | Delete |
| Waitlist subtitle (2 sentences on numbering and dragging) | An instruction | Delete; the numbers show the order |
| Gedu and trainee pickers "Anyone already assigned is greyed out." | Describes greying the dialog shows | Delete; keep "Trainees needn't be certified." |
| No groups "Add a group when you're ready to start placing people." | An instruction | "No groups yet." |

Compliant: the dialogs shown when a move is refused, and the club-switch refusals. They
appear only when needed and say what to do next.

### Analytics

| Copy | Why it breaks | Proposed |
|---|---|---|
| "Only visitors who accepted analytics… are counted." under five charts | The one caveat that changes the numbers, said five times | Once, beside the "Read from Vercel at" line: "Consenting visitors only · UTC days" |
| Page subtitle "How many people reach the site, what they read…" | Describes the page | Delete |
| Pages caption "…Open a row to see the languages it was read in." | An instruction the row's chevron gives | Delete |
| The rest of the landing, campaign and breakdown captions | Repeat their headings | Delete |
| "Visitors are counted per device, so that number is approximate." | Changes what a figure means | Keep it as the label: "Visitors (per device, approx.)" |

### Substitution confirm dialogs

Approving an offer and seating a substitute each show five sentences listing every side
effect (the workspace opens 48 hours before, Discord, Slack, the card label), read past on
every approval. Proposed: "{name} takes {product} — {group} on {when}, in {absent}'s
place." On session cancellation, "Nobody is notified." stays because it changes what the
click does.

### Page descriptions (~15 pages)

Every admin list and hub page opens with a sentence describing itself: the dashboard,
products ("Manage the clubs, camps and events admins have created."), sites, library,
landing pages, testimonials, guides, holiday calendars, invoice customers, both invoicing
pages, substitutions, analytics, testing and WhatsApp. The worst is spotlights, two
sentences including the language fallback rule. **Delete them all.** Only the substitutions
page's time zone stays, as a short "Times in {zone}".

### Content editors

Spotlights, library, testimonials, guides, landing pages and holiday calendars.

- **Language hints that spell out the fallback rule** on spotlights, library, testimonials,
  holiday calendars (3 sentences) and guide files (the whole chain). Delete them, or cut to
  "Required in each language".
- **Hints that say where something shows** (library summary, cover and body; spotlight body
  "formatted as it looks here"). Delete them; the crop ratio moves into the label
  ("Cover · 16:9").
- **The testimonial "no quotation marks" rule is said three times**: in a hint, in a note
  and in the validation error. Keep only the error.
- **The holiday calendar breaks description** becomes "First and last day included."
- **The image catalogue description**, one per picture purpose ("One picture can be used by
  many products…"). Delete it. The replace and remove confirmations already show how many
  things a change reaches, and they stay.
- **Landing page status lines.** The share-card staleness and next-publish lines, and the
  testimonials hint, are cut or deleted. The lines saying an address is changing or a
  language was removed stay, because they change what publishing does.

### Gedu cards on the admin user page, and other admin forms

- The criminal record card explains how a gedu orders the extract and that no copy is kept.
  That is process documentation; keep "Must be under 6 months old." beside the tick box.
- Cut these to the consequence alone: the spoken-languages note, the not-certified note and
  the qualification descriptions. For example "Substitution offers only in ticked
  languages", "Not certified: can't be assigned".
- On invoice customers, keep only the first clause of the customer-number, billing-cadence
  and picker hints.
- Team profile: show the status as a badge (Private, Ready, Public) and delete the sentences
  explaining the workflow. This applies to the admin side and to the gedu's own profile
  page.
- Feedback: delete the legend "Negative is No or Not really; positive is Yes or
  Definitely." Each row already names the answers it counts.

## Gedu, costliest first

### Session editor (every session, every gedu)

| Copy | Why it breaks | Proposed |
|---|---|---|
| "Only Gedus and admins can see this. Families never do." on the session, group and site staff notes | The label already says "Gedus and admins", with a lock icon | Delete (3 places) |
| "Choose the same answer again to clear a mark. You can save part of a roster and finish later." | Read past on every register | Show it instead: a clear control on a marked row and a "{marked} of {total} marked" counter by Save; then delete |
| Report hint "Never include private or sensitive information about a gamer. Headings, bold and lists keep it easy to skim." | The second sentence is tuition; the first is a safeguarding standing order | Delete the second sentence. Whether the first stays is a ruling (below) |
| Photo consent note under the photo list | A safeguarding instruction | Same ruling |
| Creations hint "This is the run's last session, so it isn't finished until everyone here has a creation. Open a name to add one." | A walkthrough | Label "Creations · last session", and a missing mark on each row without one |

### Substitutions page: the one newcomer dead end

A sentence above the pool tells every visit how the queue is filtered (languages spoken,
coverage areas). A new gedu with no languages ticked sees "No sessions you can cover need a
substitute right now." That reads as an all-clear but is really a settings gap. Proposed:
replace the sentence with a line that shows the filter itself, "Languages: Finnish, English
· Areas: Helsinki, Espoo · Change". When a value is empty, "Languages: none — add one"
appears in place of the all-clear.

The offer confirmation (five sentences on every offer) becomes "Offer to run {product} on
{when}? You can decline until it's approved."

### My invoicing

- Delete the description's second sentence, on what counts as recorded. The unrecorded
  count already says it where it matters.
- The VAT note becomes the total's label, "excl. VAT".
- The note telling the gedu to split municipality and consumer sums becomes two labelled
  subtotals, so the split shows itself.

### Smaller

- Coverage areas note: "Only on-site substitution requests use these."
- Shared site notes caption: "{site} · shared by every product here".

### Compliant

The My SOG empty state for a gedu with no group, the empty roster, the empty states of
the group and site notes (they say what goes there), "You have no substitutions coming up",
the uncertified tools notice, the contract and criminal record notices (first use, gone once
done), and the trainee lock explanations (on demand).

## Which way the research leans

Proposed, not agreed: **one mechanical sweep, then page by page.**

1. **One PR for the mechanical sweep.** It covers the page descriptions, empty states that
   give instructions, hints that duplicate something, and the analytics caveat said five
   times. That is about 35 strings, all deletion or merging, with no per-field judgement.
   Deleting a key is cheap in every language.
2. **Then page by page:** the product editor, groups panel, content editors, gedu session
   editor and substitutions page. Each field needs a call on whether it changes meaning, and
   several fixes are a change to the page (the filter line, the attendance clear control,
   the labelled subtotals) rather than shorter copy. Those need translation and a look at
   the rendered page.

## What would change the answer

- **The safeguarding lines in the session editor.** The rule could let a standing order
  stay on every report, or the title "visible to parents and gamers" could be judged enough.
- **Confirm dialogs that list side effects.** They could count as a note that changes what
  the action means, which stays, or as explanation, which goes. If they stay, the
  substitution dialogs are out of scope.
- **Screenshots against the rich seed** may move items on the product editor and groups
  panel up or down the ranking, depending on how much each hint pushes the content down.
