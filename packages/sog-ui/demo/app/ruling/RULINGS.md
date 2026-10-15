# Heading adoption rulings

Temporary. The ledger for the owner's rulings on the questions the ruling page
(`/ruling` in the demo) puts on screen. One entry per question. The owner rules in
shorthand, in rounds; each ruling is recorded here in full as it is made, and the
implementation that applies it reads this file, not the conversation that produced it.
A question that is ruled and built leaves the page; the ledger is deleted after the last
entry lands and is audited.

Status values: `open` · `ruled` · `landed`.

## The model (already accepted, not re-opened here)

- **Outline level and visual step are two props.** A heading's level (h1–h4) is what
  screen readers and tools read; its step (size, weight, leading) is what the eye reads.
  They are decoupled, and constrained by a table in the library of which steps each
  level may take, enforced by types — an unlisted pair does not compile.
- **The steps are renamed by role.** The ids round 1 started from were `h1`, `h2`, `h3`, `h4`, `body-l`,
  `body-s` and `cta` in `src/tokens/typography.ts`. Round 1 proposes the heading names
  (`hero`, `page-title`, `section`, `card-title`, `sub-section`, `label`, and in §8 a
  seventh, `app-section`); the body and CTA steps are not asked about.
- **Nothing on the ruling page edits a token.** Renames are drawn from today's token
  classes and new steps in plain values (`steps.ts`); the scale moves when a ruling
  lands.

## The regeneration command

Every raw heading in Sogverse, from the repo root:

```
rg -n --no-heading -g '*.tsx' "<h[1-4](\s|>|$)" src/
```

**217 hits in 119 files** at the branch point (the `$` catches a tag whose attributes
start on the next line). The title primitives are separate:
`rg -n --no-heading -g '*.tsx' "<(CardTitle|DialogTitle|SheetTitle)(\s|>|$)" src/` —
CardTitle alone has 58 call sites, 28 of which pass a size.

---

## 1. The role-named steps

**Asked:** whether the heading steps take role names — `hero`, `page-title`, `section`,
`card-title`, `sub-section`, `label` — and the sizes of the three that are new or in
doubt: `page-title` (28, 30 or 32px at 600), `card-title` (today's 24px, or 20px), and
`label` (14 or 12px at 600, sentence case).

**Shown:** §1 of the ruling page. Each rename drawn twice from one recipe (`today — h1`
beside `hero`, and so on). `page-title`'s three candidates in the admin dashboard's
header, the parent gamer-settings header and the verify-email title block, beside today's
`text-3xl font-bold` / `text-2xl font-bold`. `card-title` at 24 and 20 on CardTitle's
default (gamer settings, "Profile") and on its `text-xl` override (admin "Schedule").
`section` against the home page's `text-3xl sm:text-4xl` heading and against an app h2
(the privacy policy's 18px summary heading). `sub-section` against the home "how it
works" step titles and the parent "Gamer not found" h3. `label` at 14 and 12 against
admin "Coming up" and the consent banner's heading.

**Ruling (round 1):** role names and six heading steps — `hero` 48 (30 on a phone),
`display` 36, `page-title` 30, `section` 24, `card-title` 18, `label` 14, each at 600
with its own leading; `sub-section` is dropped and the `h1`–`h4` ids are gone —
principles 1 and 2.

**Status: landed.**

## 2. Level → step table

**Asked:** which steps each outline level may take.

**Shown:** §2. Two tables drawn as matrices, each allowed cell drawing its step:
`proposed` (h1 hero/page-title; h2 section/card-title; h3 card-title/sub-section; h4
sub-section/label) and `with the survey's sites`, which adds `label` at h2 and h3 because
every furniture heading in the app heads a real region at h2 or h3 today. Under them, two
real pages' outlines, today and under the table: the admin dashboard (no sections; today
it skips h1 → h3 because CardTitle is always an h3) and the parent dashboard (sections per
child; today a club card's name is not a heading).

**Ruling (round 1):** h1 hero, page-title · h2 display, section, card-title · h3
section, card-title, label · h4 card-title, label — a level takes only steps at its own
rank or below, enforced by `Heading`'s types.

**Status: landed.**

## 3. Weight: 600 vs 700

**Asked:** whether `hero`, `page-title` and `section` are set at 600, as the scale and the
Guidebook say, or 700, as about 110 of the app's headings are today.

**Shown:** §3. Each of the three at 600 and 700, side by side, with the home hero, the
admin and parent page titles, and the home and Roblox section headings.

**Ruling (round 1):** 600 everywhere — principle 3.

**Status: landed.**

## 4. Breakpoints

**Asked:** whether the library rule is "a step is one size at every width, and only
`hero` resteps", replacing today's per-site pairs (`text-3xl sm:text-4xl`,
`text-2xl sm:text-3xl`, the home hero's `md:text-6xl`).

**Shown:** §4. 360px and 840px frames side by side, today and proposed: the home section
heading, the not-found title, the family product page's masthead with a one-word Finnish
club name, and the home hero.

**Ruling (round 1):** one size at every width; only `hero` resteps — principle 4.

**Status: landed.**

## 5. Tracking and leading

**Asked:** whether the large steps carry `tracking-tight`, which most large headings wear
today and no step does; and the card title's leading — CardTitle asks for `leading-none`,
but any call site that passes a size loses it through the class merger, so two leadings
are live today.

**Shown:** §5. Page-title, section and card-title, tight and normal. The home feature card
at 280px with its real two-line title, four ways: as it renders today, at `leading-none`,
and at the card-title step's 1.3 at 24 and 20px.

**Ruling (round 1):** normal letter spacing, never `tracking-tight`; each step carries
its own leading and no call site overrides it — principle 3.

**Status: landed.**

## 6. Heading colour

**Asked:** whether colour is a prop of the heading, and if so which inks on which steps:
ink only, ink or quiet ink, and whether act is ever a heading's colour.

**Shown:** §6. Every proposed step in ink and quiet ink. The gamer dashboard's act-coloured
greeting beside itself in ink, and an admin tool's quiet-ink results heading beside itself
in ink.

**Ruling (round 1):** headings are ink and there is no colour prop; the public hero's
act phrase stays the one declared departure, drawn at its call site — principle 5.

**Status: landed.**

## 7. Furniture labels

**Asked:** for the twelve uppercase, tracked 11–12px headings: whether each takes the
sentence-case `label` step, or is not a heading at all and becomes plain text (which would
also take `label` at h2/h3 back out of §2's table).

**Shown:** §7. Three of the twelve — the family product page's "Sessions", the group
workspace's "Other groups" rail card, the Roblox page's "Creator Academy documents" — each
today, at `label` 14 and 12px, and as plain body-s text, ink held at quiet ink.

**Ruling (round 1):** sentence case always; the `label` step where the text titles a
region, plain text where it does not — principle 6.

**Status: ruled.**

## 8. App section vs marketing section

**Asked:** whether the scale carries two section steps — the marketing `section` (36px)
and an app one, proposed as `app-section` at 20 or 22px, 600 — or one. No app h2 reaches
36px: the app's section headings are `text-lg font-semibold` (12 sites) and
`text-xl font-semibold` (10), and `section` at 36 outranks every `page-title` candidate.
If one step is ruled, `app-section` leaves §2's table.

**Shown:** §8. The admin substitutions page and the gedu substitutions page (a title, two
section h2s and a session card), today and then under each `page-title` candidate (28, 30,
32) with their sections at `section`, `app-section` 20 and `app-section` 22. The home
features heading today, at `section`, and at `app-section` 22. §2's tables gain an
`app-section` column, allowed at h2.

**Ruling (round 1):** one `section` step at 24 under `page-title` 30; marketing
sections take `display`. There is no `app-section` step.

**Status: ruled.**

## 9. Dialog and sheet titles

**Asked:** which step a dialog or sheet title takes. DialogTitle and SheetTitle are h2 at
`text-lg font-semibold leading-none tracking-tight` (18px; 32 and 4 call sites), a size no
proposed step has. The level (h2) is not in question.

**Shown:** §9. Two confirm dialogs as static mock-ups at the dialog's width — the instant
voice room's moderator leave dialog and the parent's give-up-the-place confirm on a seat
offer — each today, at `card-title` 20, at `app-section` 22, and at `card-title` 24. The
20px `app-section` candidate is the 20px `card-title` recipe, so it is not drawn twice.

**Ruling (round 1):** `card-title` (18) at h2.

**Status: ruled.**
