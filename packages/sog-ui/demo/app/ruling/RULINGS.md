# Heading adoption rulings

Temporary. The ledger for the owner's rulings on the questions the ruling page
(`/ruling` in the demo) puts on screen. One entry per question. The owner rules in
shorthand, in rounds; each ruling is recorded here in full as it is made, and the
implementation that applies it reads this file, not the conversation that produced it.
The page and this ledger are deleted in one commit after the last entry lands and is
audited.

Status values: `open` · `ruled` · `landed`. Every entry below is `landed`.

## The model (accepted before round 1, not re-opened)

- **Outline level and visual step are two props.** A heading's level (h1–h4) is what
  screen readers and tools read; its step (size, weight, leading) is what the eye reads.
  They are decoupled, and constrained by a table in the library of which steps each
  level may take, enforced by types — an unlisted pair does not compile.
- **The steps are renamed by role.** Round 1 started from the ids `h1`, `h2`, `h3`, `h4`,
  `body-l`, `body-s` and `cta` in `src/tokens/typography.ts`. The body and CTA steps were
  not asked about and did not change.
- **Nothing on the ruling page edits a token.** Renames were drawn from the token classes
  of the day and new steps in plain values (`steps.ts`); the scale moved when a ruling
  landed.

## The six principles

The owner approved these before any step was ruled; each ruling below cites the ones it
applies.

1. **Size shows rank.** A reader tells two ranks apart by size alone.
2. **Two registers.** The story register (public pages: `hero`, `display`) and the work
   register (app pages, topping out at `page-title`), on one scale.
3. **Calm and few.** One heading weight, 600; no tracking; the step owns the line height.
4. **Only the story steps restep.** (Final form — see §4 and §10.)
5. **Headings are ink.** The public hero's act phrase is the one declared departure.
6. **A heading titles a region, in sentence case.** Text that titles nothing is not a
   heading.

## The regeneration commands

From the repo root.

```
rg -n --no-heading -g '*.tsx' "<h[1-6](\s|>|$)" src/
```

**217 hits in 119 files** at the branch point (h1–h4; the `$` catches a tag whose
attributes start on the next line). **Now: one element hit, `src/components/ui/alert.tsx`
(`AlertTitle`'s `h5`, exempt until the alert adoption), plus one comment line in
`src/app/[locale]/(dashboard)/parent/page.tsx`.**

```
rg -n --no-heading -g '*.tsx' "<(CardTitle|DialogTitle|SheetTitle)(\s|>|$)" src/
```

At the branch point CardTitle alone had 58 call sites, 28 of which passed a size. **Now:
`CardTitle` returns nothing anywhere in `src/` (`rg -n CardTitle src/ tests/`), and
`DialogTitle`/`SheetTitle` call sites remain but take no class** — both render
`<Heading level={2} step="card-title">` (`src/components/ui/dialog.tsx`,
`src/components/ui/sheet.tsx`).

```
rg -n "text-h[1-4]\b|h1-mobile" src/ packages/sog-ui/src/
```

The old step utilities. **Now: nothing.**

```
rg -o 'step="(hero|display|page-title|section|card-title|label)"' src/ | sort | uniq -c
```

The converted sites by step, at landing: `hero` 6, `display` 19, `page-title` 85,
`section` 49, `card-title` 101, `label` 22 — 282 step props in 144 files, the dialog and
sheet titles and a few heading wrappers among them, so about 275 headings.

---

## 1. The role-named steps

**Asked:** whether the heading steps take role names — `hero`, `page-title`, `section`,
`card-title`, `sub-section`, `label` — and the sizes of the three that were new or in
doubt: `page-title` (28, 30 or 32px at 600), `card-title` (24px, or 20px), and `label`
(14 or 12px at 600, sentence case).

**Shown:** §1 of the ruling page. Each rename drawn twice from one recipe; `page-title`'s
three candidates in the admin dashboard's header, the parent gamer-settings header and
the verify-email title block; `card-title` at 24 and 20 on CardTitle's default and its
`text-xl` override; `section`, `sub-section` and `label` against the sites that would
spend them.

**Ruling (round 1, final):** role names and six heading steps — `hero` 48, `display` 36,
`page-title` 30, `section` 24, `card-title` 18, `label` 14, each at 600 with its own
leading; `sub-section` is dropped and the `h1`–`h4` ids are gone — principles 1 and 2.
The phone sizes of `hero` and `display` are §10's.

**Where it landed:** `TYPE_SCALE` in `packages/sog-ui/src/tokens/typography.ts` — `hero`
48px/1.1, `display` 36px/1.2, `page-title` 30px/1.2, `section` 24px/1.3, `card-title`
18px/1.4, `label` 14px/1.4, all weight 600; `body-l` 18/400/1.7, `body-s` 14/400/1.5 and
`cta` 16/600/1 unchanged. Generated into `packages/sog-ui/src/tokens/theme.css` as
`--text-hero: 3rem`, `--text-display: 2.25rem`, `--text-page-title: 1.875rem`,
`--text-section: 1.5rem`, `--text-card-title: 1.125rem`, `--text-label: 0.875rem`, each
with its `--line-height` and `--font-weight: 600`.

**Status: landed.**

## 2. Level → step table

**Asked:** which steps each outline level may take.

**Shown:** §2. Two candidate tables drawn as matrices, and two real pages' outlines today
and under the table: the admin dashboard (which skipped h1 → h3 because CardTitle was
always an h3) and the parent dashboard.

**Ruling (round 1, final):** h1 hero, page-title · h2 display, section, card-title · h3
section, card-title, label · h4 card-title, label — a level takes only steps at its own
rank or below, enforced by `Heading`'s types.

**Where it landed:** `HEADING_STEPS` in `packages/sog-ui/src/components/heading.tsx`,
exactly that table; `HeadingPair` makes a pair outside it a compile error.
`tests/unit/sog-ui/heading.test.tsx` renders every pair the table allows. `HeadingLevel`
is `1 | 2 | 3 | 4`.

**Status: landed.**

## 3. Weight: 600 vs 700

**Asked:** whether `hero`, `page-title` and `section` are set at 600, as the scale and the
Guidebook said, or 700, as about 110 of the app's headings were.

**Shown:** §3. Each of the three at 600 and 700, side by side, on real sites.

**Ruling (round 1, final):** 600 everywhere — principle 3.

**Where it landed:** every heading step's `weight: 600` in `TYPE_SCALE`; `Heading` writes
no weight class of its own and takes no `className`, so no call site can set one.

**Status: landed.**

## 4. Breakpoints

**Asked:** whether the library rule is "a step is one size at every width, and only
`hero` resteps", replacing the per-site pairs (`text-3xl sm:text-4xl`,
`text-2xl sm:text-3xl`, the home hero's `md:text-6xl`).

**Shown:** §4. 360px and 840px frames side by side, today and proposed.

**Ruling (round 1, superseded in part by §10):** one size at every width for every step
but the story steps. The round-1 form, "only `hero` resteps, to 30", was replaced by the
phone ladder: **`hero` and `display` restep, together, at `md`**, and every work-register
step is one size at every width — principle 4.

**Where it landed:** `mobilePx` in `TYPE_SCALE` — `hero` 34, `display` 28, every other
step `null`; `typeSizes()` emits the narrow tokens `--text-hero-mobile: 2.125rem` and
`--text-display-mobile: 1.75rem` in `theme.css`. `Heading`'s `STEP_CLASS` writes
`text-hero-mobile md:text-hero` and `text-display-mobile md:text-display`, and one class
for each other step. `heading.test.tsx` holds that only the story steps carry a
responsive class. No responsive size class remains on any heading: `Heading` takes no
`className`.

**Status: landed.**

## 5. Tracking and leading

**Asked:** whether the large steps carry `tracking-tight`, which most large headings wore;
and the card title's leading — CardTitle asked for `leading-none`, lost through the class
merger at any call site that passed a size, so two leadings were live.

**Shown:** §5. Page-title, section and card-title, tight and normal; the home feature card
at 280px with its real two-line title, four ways.

**Ruling (round 1, final):** normal letter spacing, never `tracking-tight`; each step
carries its own leading and no call site overrides it — principle 3.

**Where it landed:** `TYPE_SCALE` carries no letter spacing and each step's `lineHeight`;
`Heading` writes no tracking or leading class and takes no `className`. The class merger
fix (`packages/sog-ui/src/tokens/class-merge.ts`, exported as `mergeClasses` and used by
Sogverse's `cn` in `src/lib/utils.ts`) registers every scale size as a size, so a step
survives a colour class beside it (`tests/unit/sog-ui/class-merge.test.ts`).

**Status: landed.**

## 6. Heading colour

**Asked:** whether colour is a prop of the heading, and if so which inks on which steps.

**Shown:** §6. Every step in ink and quiet ink; the gamer dashboard's act-coloured
greeting and an admin tool's quiet-ink results heading, each beside itself in ink.

**Ruling (round 1, final):** headings are ink and there is no colour prop; the public
hero's act phrase stays the one declared departure, drawn at its call site — principle 5.

**Where it landed:** `Heading` writes `text-foreground` and has no colour prop; the hero's
act phrase is a span its call sites pass inside `children`, declared in
`packages/sog-ui/src/tokens/brand.ts`. A team member's nickname in act, the other
declared departure in `brand.ts`, is likewise a span in the words.

**Status: landed.**

## 7. Furniture labels

**Asked:** for the twelve uppercase, tracked 11–12px headings: whether each takes the
sentence-case `label` step, or is not a heading at all and becomes plain text.

**Shown:** §7. Three of the twelve — the family product page's "Sessions", the group
workspace's "Other groups" rail card, the Roblox page's "Creator Academy documents" —
each today, at `label` 14 and 12px, and as plain body-s text.

**Ruling (round 1, final):** sentence case always; a heading where the text titles a
region, plain text where it does not — principle 6. A region heading takes the step its
level allows: `label` over a compact region at h3/h4, and, since `label` never reaches
h2, `card-title` or `section` where it titles a top region.

**Where it landed:** no heading can be uppercase or tracked — `Heading` takes no
`className`. The three shown: the family product page's feed heading is
`<Heading level={2} step="section">` (`src/components/family/product-page/FamilyProductPageBody.tsx`);
the group workspace's rail cards title at `<Heading level={2} step="card-title">`
(`RailCard` in `src/components/group-workspace/GroupWorkspace.tsx`); the Roblox legal
documents heading is `<Heading level={2} step="card-title">`
(`src/app/[locale]/(public)/roblox/page.tsx`). `label` sits at 22 sites, every one h3 or
h4 (`rg -n 'step="label"' src/`). The caps rule for markers that are *not* headings stays
in `src/CLAUDE.md` § Styling.

**Status: landed.**

## 8. App section vs marketing section

**Asked:** whether the scale carries two section steps — a marketing `section` (36px) and
an app one, proposed as `app-section` at 20 or 22px — or one.

**Shown:** §8. The admin and gedu substitutions pages under each `page-title` candidate
with their sections at each candidate; the home features heading three ways.

**Ruling (round 1, final):** one `section` step at 24 under `page-title` 30; marketing
sections take `display`. There is no `app-section` step.

**Where it landed:** `section` 24 is the only section step in `TYPE_SCALE`; `display` is
the public pages' section step, at 19 sites, all public (`rg -l 'step="display"' src/` —
the home page, About, Roblox, the team index and the landing pages). `rg -n "app-section"
src/ packages/sog-ui/src/` returns nothing.

**Status: landed.**

## 9. Dialog and sheet titles

**Asked:** which step a dialog or sheet title takes. DialogTitle and SheetTitle were h2 at
`text-lg font-semibold leading-none tracking-tight` (18px).

**Shown:** §9. Two confirm dialogs at the dialog's width, each today and at three
candidates.

**Ruling (round 1, final):** `card-title` (18) at h2.

**Where it landed:** `DialogTitle` renders `<Heading level={2} step="card-title" id={id}
align={align ?? headerAlign}>` (`src/components/ui/dialog.tsx`) and `SheetTitle`
`<Heading level={2} step="card-title" id={id}>` (`src/components/ui/sheet.tsx`); neither
takes a class. `HEADING_STEPS`'s doc comment states the dialog-at-h2 rule.

**Status: landed.**

## 10. The phone ladder

**Asked (after round 1):** round 1's "only `hero` resteps, to 30" put a public page's
hero at 30 over `display` sections at 36 on a phone — the outline inverted on the screen
most families read it on.

**Ruling:** the story steps restep together at `md` — `hero` 34 and `display` 28 below
it — so a hero outranks a section heading at every width: 48 over 36 wide, 34 over 28
narrow. Work-register steps keep one size — principles 1 and 4.

**Where it landed:** as §4 — `mobilePx` 34 and 28 in `TYPE_SCALE`, `--text-hero-mobile:
2.125rem` and `--text-display-mobile: 1.75rem` in `theme.css`, the two-class
`STEP_CLASS` entries in `heading.tsx`. `align="center-narrow"` changes alignment at `md`
too, the one breakpoint the story steps restep at.

**Status: landed.**

## 11. `card-title`'s weight, a declared departure

**Asked:** the brand sets its small heading at Regular 400; principle 3 says one heading
weight.

**Ruling:** `card-title` is 600 — an 18px title at body weight cannot be told from the
18px body copy beside it.

**Where it landed:** `card-title`'s `weight: 600` in `TYPE_SCALE`, with the departure
declared in its doc comment in `typography.ts`.

**Status: landed.**

## 12. The landing-page hero keeps its own layout

**Asked:** the landing-page hero's columns split at `lg`, while `Heading`'s
`center-narrow` alignment changes at `md`; moving the columns to `md` reshaped a layout
whose design is not settled.

**Ruling:** the columns go back to splitting at `lg`; only the heading converts. Between
768 and 1023px the headline sits start-aligned over centred words, accepted until the
landing-page design is settled — no landing page is live.

**Where it landed:** `HeroSection` in `src/components/landing-pages/landing-sections.tsx`
— `lg:grid-cols-2`, `lg:text-left`, `lg:justify-start`, and an inline comment at the
`Heading` naming the gap. Recorded as accepted in `packages/sog-ui/docs/adoption.md` § 2.

**Status: landed.**

## 13. Authored markdown's middle level, deferred to Body type

**Asked:** the editor offers three heading levels that must look distinct; the scale has
nothing between `section` 24 and `card-title` 18.

**Ruling:** left as it is — the writer's second level stays an off-scale 20px — and the
question goes to the Body type adoption, which rules on the scale's missing steps.

**Where it landed:** `MARKDOWN_LOOK` in `src/lib/authored-markdown.ts` — `h1` at
`text-section`, `h2` at `text-xl font-semibold leading-snug` (20px), `h3` at
`text-card-title`; its doc comment says why. The question is listed among Body type's
rulings in `packages/sog-ui/docs/adoption.md` § 4.

**Status: landed** (as a deferral).
