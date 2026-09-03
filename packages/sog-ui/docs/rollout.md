# SOG-UI rollout

The working document for building School of Gaming's UI language as `packages/sog-ui` and
applying it across Sogverse. **This file is deleted when the rollout is complete**, together
with the reference branch; what remains is the package, its `CLAUDE.md`, and the record at
`docs/origins-2026-09.md` beside it. The package's `CLAUDE.md` states what SOG-UI *is*;
this file states what is still to be done to get there. Nothing here is a rule.

The owner is in the loop on every phase and signs each off in the demo, so this plan is
executed in conversation rather than handed to a cold session; it exists so a session
picking it up knows the shape, the harvest rule and what is settled.

## Problem

Sogverse's brand and UI opinions live as prose rules and repeated class strings across
some 300 components, so a visual change is a sweep across every file that hand-rolled the
thing being changed. The 2026-09 design pass touched 183 files for what should have been
token and primitive edits (the record above has the numbers). A brand refresh that only
needed the library changed is the goal, and today no such library exists.

## Scale

Every surface in the app. The primitive folder holds 33 files, of which 17 lift into a
package unedited, 7 lift after their chrome strings become props, and 9 are domain-shaped
and stay. The missing middle is about a dozen components whose absence produced roughly 70
hand-rolled sites across six role directories.

## The decision

Built in phases, UI first, applied last. The package is `@sog/ui` at `packages/sog-ui`,
with its demo at `packages/sog-ui/demo` run through Next's directory argument on port
3001, deployed later to Vercel as its own project with the package directory as its root.

**Inputs are not truth.** Two sources are consulted while deciding, and neither is carried
into the code. The School of Gaming Brand Voice & Identity Guidebook (v2.0, kept outside
the repo at `~/work/SoG_Brand_Voice_Guidebook_v2_0.md`) holds the brand's stated opinions;
the reference branch (`feat/brand-palette-design-pass`, tag `ref/brand-palette-design-pass`)
holds tokens, a button recipe, two styling tests, a colour grammar and the litigation
history of the rulings behind them. A value enters the library because the owner decides
it here, in the demo, and it enters with no source label, no provenance field and no
provisional status. The library is the truth from the moment a value is in it; the inputs
are where to look when deciding, and the origins record is where the history stays.

## Rejected alternatives

See the record for the full list with reasons: a one-project rewrite, a view-layer package,
keeping the design pass's rules as fact, merging the reference branch, Storybook, and CSS
as the token source.

## Constraints discovered while deciding

- Tailwind 4 anchors its content scan on the nearest `package.json`, so the app's
  stylesheet must exclude `packages/` with an `@source not` directive or the demo's classes
  compile into production CSS.
- Turbopack walks from the demo up to the repo root looking for a proxy file and finds
  Sogverse's real one; the demo carries an inert proxy with an empty matcher so it is found
  first.
- Node 24 strips types natively, so the token generator runs as a `.ts` script with no build
  step; the root TypeScript config allows `.ts` extensions on imports for that reason, and a
  lint rule keeps such imports out of Sogverse's own source.
- Vercel's `npm ci --workspaces=false` install still links a workspace package that is
  listed as a root dependency; the package is added to the root's dependencies when
  Sogverse first consumes it.
- The i18n literal-string lint runs jsx-only, so it binds on components and not on token
  data; it is not the mechanism behind the every-word-is-a-prop rule.

## Steps

1. **Foundations: colour and faces.** Typed sources, generated theme, contrast proof in
   tests, the demo's first floor. Landed: `925cff5f`, `395418ab`, plus the review fixes.
2. **Foundations grow only with consumers.** The mark and logo variants arrive with the
   first chrome that renders them; the vocabulary glossary with the first component that
   renders a brand term; the fact-to-tone table with the first component that takes a
   fact; the spacing scale with the first layout primitive; the viewer context and the
   `Intl` formatters with the first component that shows a date, time or amount. None of
   them is defined ahead of that, and the foundations floor of the demo shows only what
   exists.
3. **The UI rules move in.** The root `CLAUDE.md`'s UI sections (layout and scrolling,
   loading and disabled state, button order, styling, the UI reference and preview-scene
   rules) relocate into the package's `CLAUDE.md` as each mechanism lands; the root keeps
   one pointer. Where a rule was a pattern each screen repeated (committing, layout shift),
   the library ships the state system instead of the pattern.
4. **Primitives.** The 24 that lift, with strings turned into props; then the missing
   middle: heading, page header, empty state, skeleton, inline error, chip, status chip,
   accent tile, selection edge, select, table, search input, person row. No `className`
   anywhere; layout primitives with typed spacing. Each lands with every state in the demo.
5. **Chrome and patterns.** Header, footer, dashboard layout, navigation, the recurring
   arrangements, all taking their content as props.
6. **Templates.** Page-shaped compositions in the demo from real chrome and fixtures,
   built early enough that composition is judged before twenty pages depend on the seam.
7. **The sweep**, in the order `adoption.md` sets: the theme first, then Heading, then
   Button, then the rest of the missing middle. One PR per construct, each with the lint
   rule banning the raw path and the call-site conversion it forces. The admin style
   guide's primitive sections retire into the demo as each component lands; Sogverse's
   preview scenes retire as each page body thins to composition only. Steps 4 to 7
   interleave: a component is built, shown, adopted and locked before the next begins.
8. **Lockdown.** The seam lint: Sogverse's source contains no utility class; it composes
   and never paints. The root `CLAUDE.md` carries no UI rule of its own.
9. **Completion.** The reference branch and its tag are deleted, this file is deleted, the
   deviations entries the library resolved are removed.

## Acceptance criteria

- A visual change to School of Gaming is a change to the package alone, and Sogverse takes
  it whole.
- Every rule in the package's `CLAUDE.md` is either impossible to violate through the API
  or fails lint or a test; none is prose only.
- The demo shows every component in every state and every template, and shows nothing the
  library does not ship.
- `npm run lint`, `npm run type-check` and the unit suite are clean, and the package is
  held to the same gates as the app.

## Owner decisions open

- Amber on hover: the Guidebook darkens it about 10%; the reference branch shaded no fill
  on hover and used a ring. Decided when the first button lands, not before.
- Two measurements from the inputs to weigh when their components arrive, not before: a
  destructive red whose white label measured 3.76:1 against the 4.5:1 body floor, and a
  form-control edge that measured 1.48:1 against the 3:1 boundary floor.

## Follow-ups (die with this file unless the owner names them)

- Visual regression against the demo, if the page-capture tool ever grows a fixture-only
  mode. Ruled out for now: the tool is for human review, not testing.
- Crimson Pro's first placement, when an editorial surface exists.
