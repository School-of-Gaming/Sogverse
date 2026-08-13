# Testing Round — Sonja Lappalainen, 10 August 2026

A point-in-time record of the 10.8.2026 scripted testing session and what was done
about each finding. Source: `Sogverse - Questions _ Features.md`, a scripted run
through club creation, parent enrolment, the waitlist, a live gedu session and the
report a family reads afterwards, annotated by one tester.

**This is one tester's session, and it is worth reading as such.** Several findings
turned out to be narrower than the report suggests once traced to code, and two
scripted tasks came back with no comment at all — see *Not exercised* at the bottom.
Nothing here should be treated as a settled requirement without a second look.

**Statuses:** `Done` — shipped · `Tracked` — an open item exists in `TODO.md` ·
`Open` — real, deliberately not written down yet, with the reason stated ·
`No action` — positive feedback or already correct.

---

## Done

### The session report did not say who reads it

**Reported:** *"'Parents and gamers in this group read this…' This at the bottom is
easy to miss and I worry someone might put private notes on the public section."*
Sonja supplied her own replacement copy.

**What was actually wrong** — not the copy, but an asymmetry between the two fields
of a session write-up. The **gedu-only** field has always announced itself: a
padlock, a dashed recess and an "only Gedus see this" banner sitting above the box,
worn in the editor as well as the read view precisely because the risk of a
two-audience feature is somebody typing for one audience while picturing the other.
The **family-facing** field was the unmarked default, so its audience had to be
*inferred* from a muted line underneath it. That put the burden the wrong way round:
the labelled field was the one where a mistake is recoverable, and the unlabelled one
was where a private remark reaches every parent in the group.

**Fixed** by giving the public field a counterpart banner of equal weight, so the two
audiences are stated the same way and read as a pair. The treatments are deliberately
opposite rather than merely different — the family block is solid-bordered and sits on
the page background because what goes in it is published; the staff block stays dashed
and recessed because what goes in it is an aside. Same banner geometry, inverted
visual weight, so which is which survives a glance.

Applied to all three editing surfaces (the past-session editor, the future-session
editor, and the standing group/site notes panel). **Editors only, deliberately:** a
published report needs no warning after the fact, and a banner over the body copy of
every entry in a feed would be noise standing where the writing should be.

With the audience carried by the banner, the hint stopped repeating it and took the
warning instead; the placeholder took the writing guidance. All five locales.

**One deviation from Sonja's copy, decided in review:** she asked for a *bolded*
title. The report body wants a real **H1**, not bold text — so the placeholder names
the editor's own H1 control rather than describing the formatting. That control is
labelled "Title" (`Pääotsikko` / `Titel` / `Titre` / `per’a’`), so each locale's
placeholder points at the word its own toolbar shows.

**Not carried over:** her copy ran to three paragraphs. The editor's placeholder is a
CSS pseudo-element with no height of its own and no line breaks, so it cannot hold
them — and a placeholder disappears at the first keystroke, which is the wrong home
for a safety warning. The warning went to the persistent hint instead, which is also
the more direct answer to "easy to miss".

### French: "camp" in prose

**Reported:** camp should be "Stages de vacances" or "Stages"; voice room is more
natural as "Salle vocale".

Both were already correct nearly everywhere — the product noun was already `Stage` /
`Tous les stages`, and voice was already `Salle vocale` throughout. Two waitlist
strings still said *"pendant toute la durée du camp"*; both now say *"du stage"*.

---

## Tracked in `TODO.md`

| Reported | Section |
|---|---|
| Admins can't reach session notes, reports or attendance | *Admins can't see session notes, reports or attendance* |
| Unassigned gamers should be listed and linkable | *"Needs attention" — one admin surface for problems across the whole platform* |
| Anything not in place should be alerted, or get an Issues page | Same section |
| How long is a freed waitlist spot held? | *Waitlist — the parent/gamer side* |
| Couldn't register two children in one pass | *Family multi-select checkout* |

Two of these need the record corrected, because the report and the code disagree:

- **The admin roster was never missing.** Sonja reported being unable to see a club's
  parent and gedu information without going through Edit. The product details page
  already carries all of it — each group with its assigned gedus, its seated
  participants, the unassigned inbox and the waitlist. The genuine gap is everything
  that happens *inside* a session: the report families read, the gedu-only note and
  the attendance sheet exist only on the gedu's own feed. Attendance doubles as pay
  confirmation, so whoever signs off gedu invoices currently cannot see the record the
  invoice derives from. The tracked item is scoped to that, not to the roster.

- **The waitlist item is not neutral today.** The decision is to leave promotion
  manual and the timing unstated, which is defensible — but the card footer and the
  confirmation page already *promise* an email when a seat opens, and no such
  template exists. The parent has been told a specific thing will happen. If manual
  sending ever slips, soften the copy rather than leave the promise standing.

---

## Open — real, and deliberately not written down yet

### Clubs on My SOG are not clickable

**Reported three times**, from three angles: couldn't click a club from My SOG to get
back to it; couldn't click through to read club instructions; wanted to open a club
she had joined *or waitlisted* even before it started, just to read about it.

**Root cause:** a family enrolment card links nowhere when the seat has **no group
assigned**, and a waitlist card never links at all. In this session nobody assigned
the newly enrolled gamers to a group, so every card was inert.

**Narrower than the report suggests.** Her own final comment — *"I was able to see
future session notes easily when I clicked the club"* — is from later in the session,
once grouping was in place. The page works. Only two states are dead ends: an
**ungrouped seat** and a **waitlist place**.

**Why it is not a TODO item yet:** the fix is not "make the card link". What Sonja is
really after is that the shop page shows product information the parent loses access
to the moment they join or join the queue. Sending them to the family product page
with no group assigned would land them on a page with most of it missing. There is no
simple answer and it needs a design discussion first.

### Municipality clubs go by grade, not age

**Reported:** *"I'm supposed to set participants age, but in Municipality clubs we go
by grades."*

No `grade` concept exists in the schema at all — products carry a min/max age — so
this is a modelling change, not a form tweak.

**Why it is not a TODO item yet:** it refers to how the Finnish education system
actually groups children, which we need to understand properly before scoping
anything. Whether grades replace age for municipality clubs or sit alongside it is
part of that question, not a detail to settle afterwards.

### "Keep browsing" drops the school context

**Reported** as part of the two-children complaint: after enrolling the first child,
*"I press Keep browsing → It takes me away from the club to the normal shop… I need
to type the school's address again."* And separately: *"After enrolling I wish there
was easier way to browse more Clubs in my selected area."*

The confirmation page's secondary action goes to the generic shop, losing the school
or area the parent arrived from, and there is no "enrol another child" affordance.

**Why it is not a TODO item yet:** the *Family multi-select checkout* section covers
the multi-child half but says nothing about navigation. Undecided whether this is its
own item or an addition to that section — awaiting a call.

### Did the admin find the club view?

Sonja reached the club's people through Edit rather than through the details page that
already shows them. Whether that is a discoverability problem (the row doesn't read as
clickable) or simply a first-run tester missing it once is unresolved, and one session
cannot tell the difference. Worth watching in the next round rather than acting on now.

---

## No action

- *"Easy to fill!"* — the municipality club creation form.
- The waitlist join and leave flow, and its confirmation dialog: *"I was able to
  enroll in the waitlist and found the leave waitlist, it was clear for me… I liked
  the clear warning window so I couldn't accidentally cancel."*
- Reading the session report as a parent: *"I was able to see future session notes
  easily when I clicked the club."*
- Voice room in French — already `Salle vocale` throughout.

---

## Not exercised

Two scripted tasks carry no comment. Silence is not a pass, and the second is the
whole live-session path — the thing least safe to assume worked:

- **Gamer adds a Minecraft and a Roblox username**, both avatar heads showing.
- **Gedu opens the group workspace at session time**, attendance open, joins the
  club's voice room with the gamers and runs the session.

Worth asking Sonja which of the two it was before treating this round as complete.

The gamer dashboard and club page on a narrow viewport were also scripted; the only
comment filed under that task was about club clickability, so mobile layout itself
went unremarked.
