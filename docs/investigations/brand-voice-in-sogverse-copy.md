# Brand voice in Sogverse copy

**Status: investigation, not committed.** Researched 10 September 2026 against the repo on
that date. Nothing is decided: no file has been created, no rule has moved, and the two open
questions at the end both need the owner. The counts below were taken from the English
catalog on 10 September and drift with every copy change. One piece of the work *is* moving
independently — the topic prep and About copy is being rewritten by hand on
`feat/topic-prep` — and that is a rewrite of specific strings, not an adoption of anything
proposed here.

## The question

Sogverse's copy does not sound like School of Gaming. It reads like an engineering brief:
clauses stitched together with dashes, sentences that explain the system instead of talking
to the family using it. The Info and Prep sections on the product page are where the owner
named it, and they are not the exception — the same register runs through the shop, the
enrolment panel, the dashboards and the mail.

The question is not "which strings are bad". It is **why nothing in the repo prevents this**,
and what would.

## The diagnosis: the voice document is in the one package that never writes copy

The School of Gaming Brand Voice & Identity Guidebook is the authority on written voice. It
lives as an excerpt inside SOG-UI, under `packages/sog-ui/docs/guidebook/`.

SOG-UI's own ownership rule is that the library ships no user-visible string: every word a
component renders arrives as a prop, and Sogverse supplies it. So the document that says how
our copy should read sits in the package that, by design, never writes any. And SOG-UI's
`CLAUDE.md` does not auto-load when someone edits a catalog — it says so itself, and asks to
be read deliberately before UI work.

Meanwhile the session that actually writes a string is in `messages/`. What auto-loads there
today is `src/CLAUDE.md` (names, vocabulary bans, safety copy, heading case) and, when the
i18n wiring is opened, `src/i18n/CLAUDE.md`. Neither says anything about register, audience,
lore level, sentence shape, or how a paragraph to a worried parent differs from a paragraph
to an eleven-year-old.

That is the whole mechanism of the drift. The voice rules are three directories away from
the words, behind a file that asks to be opened on purpose, in a package whose entire
premise is that it holds no words.

**The home this points at is a new `messages/CLAUDE.md`** — colocated with the catalogs,
auto-loading in the directory where copy is written. That much the research is confident
about; everything downstream of it is open.

## Where we lean

The owner's position, which is the lean this document records rather than a finding of the
research (10 September 2026):

> "I would rather have a well dialed in CLAUDE.md file that really understands the brand
> voice and can reason about it than a set of lint and typecheck tools. Copy is not code,
> they can't be checked in the same way."

And, on the punctuation that started this:

> "I never want an outright ban on anything. Em dashes and semicolons have their purpose. But
> AI gen text gets obsessive with these and doesn't read like a real human authorship."

So the deliverable being leaned toward is **one file that carries the voice well enough to
reason from** — audience registers, the lore-density dial, the vocabulary and its
replacements, the hard-moments rules, the quality checklist — written as house rules a
session can apply with judgement, and reaching the session automatically because of where it
sits. Not a rule set with a gate behind it. A hard rule about copy always meets the sentence
that is the exception, and the exception is usually right.

## What was checked, and what it holds

**The inventory.** `messages/en.json` holds **61 top-level namespaces** and **2,864 leaf
strings**. Five locales ship — `en` as the source of truth, plus `fi`, `sv`, `fr` and `tlh`
— so the catalogs carry roughly **14,000 strings**, and any English rewrite has four
translations behind it.

**The punctuation.** In the English catalog, **237 strings contain an em dash** and **22
contain a semicolon**. That is the measurement the challenge review settled on; an earlier
pass counted higher by treating some non-copy strings as copy. The figure is worth having as
a sense of scale, not as a target — the reflex is the problem, not the character.

**Where copy actually lives.** The catalogs are the whole surface for family- and
gedu-facing words. The legal pages hold only structure in code and take every word from the
catalogs; the lint config already bans literal text in markup under `src/`. The one place
user-facing English is written directly in code is the Discord bot's operator replies, which
are internal, English-only and staff-facing.

**Whether specific strings were already violating rules.** A first pass produced a list of
apparent violations — occurrences of "our server", "the Sogverse", "screen time",
"homework", "course". Every one of them turned out, on reading the sentence, to be a
permitted form: the platform's own naming rules allow the article where it belongs to a
following noun, the tagline is the sanctioned transformation construction, and the training
carve-out covers the "course". **The list is not reproduced here, because it was wrong**, and
that is itself the most useful finding in this document: a term-matching sweep over copy
produces false positives at a rate that makes it worse than no sweep at all. It is the
concrete evidence behind "copy is not code".

## What was considered and set aside

An earlier draft of this work proposed the repo's correctness-by-mechanism loop applied to
the catalogs: a machine-readable lore level per namespace in a file beside the catalogs, a
`check-copy` script beside the translation check, a CI gate on banned terms and brand casing,
a completeness check that every namespace carries exactly one classification, and an
allowlist of existing violations permitted only to shrink — with punctuation reported as a
per-namespace density rather than gated. **All of it is set aside**, on the owner's
position above and on the false-positive finding that came out of testing it: hard rules
about copy always have exceptions, a gate that is wrong about the sentence a writer chose
well teaches everyone that the rule is noise, and the first thing a wrong gate produces is an
allowlist entry. The loop is the right tool for grants, route postures and function bodies,
where an element either has a guard or does not. A sentence is not that kind of element.
Recorded here so it is not re-proposed cold; re-proposing it needs a new argument, not the
same one.

## The lore levels, as research

The Guidebook's dial assigns every piece of copy a level before a word is written: **3** full
canon, **2** story-led with every term glossed, **1** plain language leading, **0** no lore at
all. Applying it to today's 61 namespaces is the most useful piece of research here, because
it is the thing a writer needs before touching any string and the thing no file currently
says. It is written down as a reading of the catalog, **not as a file anything reads**.

Furniture — button words, field labels, picker controls — sits at Level 0 because clarity is
its only job.

| Namespace | Level | Why |
|---|---|---|
| `metadata` | 1 | Titles and descriptions a stranger meets cold in a search result. |
| `notFound` | 1 | An error page; plain and helpful, no story. |
| `common` | 0 | Furniture: buttons, states, generic labels. |
| `datePicker` | 0 | Control furniture. |
| `about` | 1 | Public page for a parent deciding; plain leads, the world arrives last. |
| `admin` | 0 | Internal, plainest register in the app. |
| `auth` | 0 | Credentials and account access. |
| `pin` | 0 | A parent security control. |
| `purchaseConfirmation` | 1 | A payment just happened; facts first. |
| `docs` | 0 | Developer API documentation. |
| `dashboardSections` | 1 | Signed-in family navigation. |
| `helpSection` | 1 | Help and contact; a route to a human. |
| `family` | 1 | Parent managing gamers. |
| `familyEnrollment` | 1 | Enrolment state, money-adjacent. |
| `familyProduct` | 1 | A family's club page; the enrolment path. |
| `selectProfile` | 1 | Who is entering the platform. |
| `footer` | 0 | Furniture and legal links. |
| `gamer` | 3 | The child's own dashboard — full canon lives here. |
| `gedu` | 0 | Operational: coverage, notes, contract, record check. Peer register, reasoning given, no metaphor. |
| `productType` | 1 | Product-kind labels read while comparing. |
| `activityCard` | 1 | Schedule facts. |
| `sessionBadge` | 1 | Live/next status; plain. |
| `sessionFeed` | 1 | Shared gedu/family surface; a parent is the cautious reader. |
| `groups` | 0 | Staff workspace. |
| `memberFlair` | 0 | Gedu-facing notes about a real child. |
| `richText` | 0 | Editor control furniture. |
| `header` | 0 | Navigation furniture. |
| `schools` | 1 | Municipality-facing; plain, evidence-forward. |
| `productBrowse` | 1 | The shop; a stranger's first page. |
| `productAudience` | 1 | Who a product is for. |
| `productTag` | 1 | Product labels. |
| `productTagDetail` | 1 | Their explanations. |
| `seatAvailability` | 1 | A factual count. |
| `productDetail` | 1 | The decision page; plain leads, story follows the facts. |
| `topicPrep` | 1 | Instructions a parent and a gamer follow together; procedural, one voice. |
| `sidebar` | 0 | Admin navigation furniture. |
| `home` | 1 | Eight seconds to understand, thirty to act. |
| `roblox` | 1 | A partner page assessed for credibility. |
| `robloxPrivacy` | 0 | Binding text. |
| `robloxSafeguarding` | 0 | Binding text. |
| `robloxTerms` | 0 | Binding text. |
| `locations` | 1 | Where clubs run. |
| `gameAccount` | 0 | Account linking mechanics. |
| `parent` | 1 | The parent dashboard; its billing surfaces drop to 0. |
| `settings` | 0 | Account administration. |
| `tools` | 0 | Staff tools. |
| `verifyEmail` | 0 | Account verification. |
| `voice` | 1 | Room controls used mid-session; plain instructions. |
| `voiceButton` | 1 | The same, one control. |
| `yty` | 2 | The world explained to families: story leads, every term glossed. |
| `email` | 1 | Transactional and onboarding mail; billing and safeguarding mail at 0. |
| `legal` | 0 | Legal furniture. |
| `privacy` | 0 | Binding text. |
| `terms` | 0 | Binding text. |
| `discipline` | 0 | Binding text. |
| `attributions` | 0 | A licence condition being discharged. |
| `seatOffer` | 1 | A time-limited offer with money attached. |
| `consentDocuments` | 0 | Document names. |
| `chat` | 1 | Composer and moderation furniture inside a Level 3 room; moderation copy stays plain in an in-universe channel. |
| `gamerSignIn` | 0 | A child's account access; gamer register, no lore. |
| `consent` | 0 | The instrument that records an agreement. |

Two namespaces are genuinely mixed. `email` and `parent` each hold onboarding copy beside
billing copy, and the dial's downgrade triggers — money, a child's safety, a legal
obligation, a complaint, an apology, a privacy matter — drop an individual string to Level 0
whatever the surface around it is doing. So a namespace's level reads as a ceiling, not a
uniform setting. Any file that states these levels has to say that, or it will be read as
licence to write a refund line in the voice of the dashboard it sits on.

## What would move into the new file, and what would not

The split that makes this tractable: **what governs the writing of a string** moves; **what
governs the machinery of catalogs and locales** stays. Two existing files would give
something up.

From `src/CLAUDE.md`, the rules that are about words:

- the brand vocabulary bans and their replacements
- "games are dimensions of Sogverse, never the definition of the offer"
- the Princi-Pal as an untranslated mark
- the vision statement and the five slogans, with their one-per-page rule
- safety copy stating mechanisms rather than intentions, and the corollary that only verified
  mechanisms may be written
- admin copy describing the family's experience rather than the platform's steps
- the Yty fixed forms

Staying in `src/CLAUDE.md`, because they decide what code builds rather than how a sentence
reads: the brand-versus-platform naming rules (which govern page titles, sender names and OG
images as much as prose), the partner-brand rules (a logo placement is an approval question),
the locale-versus-spoken-language distinction, and sentence-case headings (which binds the
CSS on an element as much as the string in it).

From `src/i18n/CLAUDE.md`, the rules that are about words: the role name per locale and the
rule that `Gedu` is never used cold on a public surface; the French register notes (`vous` to
adults, `tu` to children, the municipality vocabulary, the ban on the middle dot); and the
statement that French is a transcreation rather than a mirror.

Staying in `src/i18n/CLAUDE.md`: the routing and pathname contract, the loader and the `tlh`
merge, the completeness script's behaviour, the dead-key reasoning, and the instruction to
edit a catalog through a script that round-trips the file.

What each file would keep in place of what it gives up is **one line** naming the new file as
the copy authority — not a summary. Two homes for one rule is the failure the docs rules
already name, and a summary is how it starts.

## The SOG-UI policy question — for the owner

`packages/sog-ui/CLAUDE.md` states that it is the only `CLAUDE.md` that names the Guidebook,
and the excerpt's own rule is that the change which *covers* a piece of the Guidebook deletes
that piece in the same change, whole paragraphs at a time. Coverage is defined tightly: the
library holds the claim in its own form — a token, a generated value, a component, a test, a
lint rule — and **"a claim merely restated as prose is not covered."**

That definition cannot be met by copy, and not because of any weakness in the plan. Copy is
the app's by SOG-UI's own ownership rule, so the library can never hold a voice rule in its
own form. If the tooling is off the table as well, then for written voice **the honest
mechanism is the rule being present, in the right words, in the place where the words are
written** — a file that auto-loads in the directory holding the catalogs, which is exactly
the property the Guidebook lacks today.

So extracting the voice needs the excerpt's coverage rule amended to say that, and needs
`packages/sog-ui/CLAUDE.md` to admit a second file that names the Guidebook. Both are
judgement calls about SOG-UI's boundary rather than findings, and both are the owner's.
Without them, the voice sections stay in the excerpt and the new file duplicates them, which
is the outcome the excerpt's rule exists to prevent.

The sections that would leave the excerpt if the amendment is made: the audience map, the
voice pillars, the lore-density dial, the vocabulary reference, the hard-moments guide, the
quality checklist, and the copy-governing halves of the channel and formatting guides. The
visual identity, the campaign toolkit, the foundation, the Princi-Pal's own register, the
worked examples and the decision log stay SOG-UI's.

## Constraints that any version of this has to respect

- **The Guidebook's time formats contradict locale-correct rendering.** It marks
  "14.10.2026 klo 16.30" as incorrect and demands "Oct 14, 2026, 4:30 PM" — but that Finnish
  form is what the platform's formatters produce for a Finnish reader, and it is correct
  Finnish. The Guidebook concedes exactly this point for currency (Finnish puts the symbol
  after the number) and not for time. The resolution: rendered dates, times and money belong
  to the library's formatters in the viewer's locale; the house forms bind only what a writer
  types into a string. Nobody should "fix" a Finnish timestamp to an English shape.
- **French is a transcreation, not a mirror.** Its public-page copy deliberately says
  something other than the English, including the slogan. An English rewrite that is
  re-derived into French must preserve the French positioning where it diverges on purpose.
- **Klingon omits the legal subtrees and merges English at runtime**, and renders the brand
  name as a calque on purpose, documented by the About page's own easter egg. A casing rule
  applied mechanically deletes the joke; a rewrite that adds a link label naming a legal
  document has to add it to the omission list.
- **Emoji are banned in the catalogs for a rendering reason, not a voice one** — they are
  untranslatable and cannot be themed. The Guidebook permits emoji in gamer-facing channels.
  The new file has to say the rendering ban wins and why, or the next reader will think the
  two documents disagree by accident.
- **The brand lockup's separator is an en dash and stays.** Any discussion of dashes in prose
  is about a different character and must not touch it.
- **Admin's "users" is legitimate.** The Guidebook bans "users" and "customers" as words for
  families; the admin surface names a database population, and that is what it is. A voice
  rule about the word needs the audience attached to it.
- **A key used but missing is a build failure; a key defined but unreachable is not.** A copy
  rewrite changes values, never shapes, and deleting keys is a separate, proof-driven
  procedure.

## Where the Guidebook and the app's current rules disagree

Found while reading both. Each is a real conflict a writer would hit, not a wording
difference.

- **"lesson" versus "session"** — the largest one, and its own open question below.
- **The vision statement's capitalisation.** The Guidebook writes the tagline in sentence
  case; `src/CLAUDE.md` mandates title case with a full stop, which also sits oddly against
  its own sentence-case-headings rule.
- **Time formatting**, as above: the Guidebook calls the correct Finnish rendering incorrect.
- **Emoji**, as above: permitted by the Guidebook in gamer-facing channels, banned outright in
  the catalogs for a rendering reason.
- **"users"**, as above: banned by the Guidebook, legitimate on the admin surface.
- **`Gedu` used cold.** The i18n rules carve out the gedu registration page by an owner
  ruling; the Guidebook says to use "Game Educator" on first mention at the plainer levels.
  These are the same rule stated two ways plus a standing exception, so it is a
  reconciliation rather than a conflict — but the new file has to state it once, not twice.
- **The Discord rule has no counterpart in the app's rules at all.** The Guidebook forbids
  calling our own channels "our Discord", "a Discord server" or "our server", on the grounds
  that it gives away an engineered safety claim, and nothing in `src/CLAUDE.md` or
  `src/i18n/CLAUDE.md` mentions it. This is a genuine gap rather than a disagreement, and it
  is the clearest single argument for the new file: the strongest safety claim the brand owns
  is protected by a document the copy-writing session never opens.

## How the rewrite would go, if it is committed

Not steps — a lean on shape, so whoever picks this up is not starting from nothing.

Namespace by namespace, ordered by who reads it: the **family enrolment path first** — the
shop, the product page, the signup panel, the confirmation, the welcome mail, the parent and
gamer dashboards — because that is the majority of what a paying reader ever sees. Then the
rest of the family surfaces, then gedu-facing copy in its own peer register, then admin, which
is internal and plainest. Legal and consent copy stays at Level 0 and is not rewritten at all.

Verification is on the page, never in a diff: page-shaped copy read in the preview scenes at
`/preview/{surface}/{scenario}`, which render real chrome at a real viewport; mail read
through the admin testing surface's email tool, which sends a template in a chosen language
to a real address.

**English is reviewed by the owner before anything is translated.** Translating first turns
one review into five, and a register decision made in English propagates into four catalogs
that nobody can spot-check. The Finnish and French catalogs then want native reviewers of
their own — French because it is a transcreation with its own positioning, Finnish because
its punctuation and compounding conventions are not the English ones.

The exemplar already exists: the topic prep and About copy being rewritten now on
`feat/topic-prep` is built around a **human-written Roblox Studio guide**, and the other
prep guides are being matched to it. That guide is the best available answer to "what does
this voice actually sound like in this product", and any later rewrite should read it before
writing a word.

## Open questions

### "lesson" or "session"

The Guidebook is explicit: a **club** is the ongoing group a gamer belongs to, a **lesson** is
the 90-minute meeting that club holds, they are not synonyms, and no third word may be
invented. Sogverse says **session** everywhere: 214 English strings, plus 381 source files
under `src/` naming it in identifiers, routes and services, plus database columns and
generated types.

Three options, none chosen:

1. **Rename everywhere.** Roughly 850 catalog strings across five locales, plus the code
   identifiers and the schema tail. The product then agrees with the Guidebook and with what
   a Gedu says out loud in the room.
2. **Rename only what a reader sees.** The catalogs say "lesson"; the code goes on saying
   `session` in identifiers, routes, columns and types. Copy and code disagree by design,
   which is a familiar cost this repo already pays elsewhere, and it buys the reader-facing
   half of option 1 for a fraction of the work. The risk is that the code word leaks back
   into a string, since a new key is usually named after the thing it labels.
3. **Amend the Guidebook.** Record the ruling in the excerpt's index the way the two
   overrules of 8 September 2026 are recorded, and keep "session" as the word. Cost: the
   brand's own document and the product disagree, and every future writer meets it.

This changes every namespace, so it wants answering before any rewrite rather than during one.

### Do shared surfaces need a distinct gamer register?

Some surfaces are read by a parent and a gamer at once: the enrolment card, the prep guide,
the child's copy of the confirmation mail.

The dial's own instruction — when in doubt, go one level plainer — suggests procedural copy
(what to do, when, what is needed) is written once, at the plainer of the two levels, in one
voice. Story-led copy is not shareable in the same way: a full-canon sentence written for a
gamer reads as whimsy to a parent comparing three programmes at 9PM, and a plain sentence
written for a parent reads as condescension to an eleven-year-old.

What is open is whether the owner wants a distinct gamer register on any of those surfaces
beyond the procedural case. Saying yes is not a rewrite — it is a second set of keys per
surface and an audience switch that neither the catalogs nor the components have today.

## What would change the answer

- **The owner rejecting the SOG-UI coverage amendment.** Then the voice sections stay in the
  excerpt, and the new file either duplicates them or points at them — and pointing is what
  fails today, because the pointer is in a package the copy session never opens.
- **A copy rewrite landing and drifting back within a term.** That would be evidence that a
  well-dialled file is not sufficient on its own, and would reopen the tooling question with a
  new argument rather than the old one.
- **The catalogs gaining a second writer who is not a session reading `messages/CLAUDE.md`** —
  a marketing tool, an import, a translation vendor. A file that reaches only one kind of
  writer stops being the mechanism at that point.
- **The session/lesson decision.** Option 1 makes the rewrite substantially larger and touches
  the schema; option 3 makes it smaller and leaves a documented disagreement.
