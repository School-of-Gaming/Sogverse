# SOG-UI

`@sog/ui`, at `packages/sog-ui`, is School of Gaming's UI language: the single source of
truth for how anything School of Gaming puts on a screen looks, reads, moves and behaves.
Its consumer is Sogverse. Its demo lives at `demo/` beside its source, the way three.js
carries its examples: a consumer installs the library and never touches the demo, and reads
the demo's code as the reference for how the library is meant to be used.

**The test of the boundary: a new visual identity for School of Gaming is a change to this
package alone, and Sogverse takes it whole.** Anything that would need a Sogverse edit to
follow a brand change is in the wrong place.

## Ownership

**SOG-UI owns every UI opinion, and the two `CLAUDE.md` files never disagree.** The root
file governs the monorepo: lint, type-check, commits, branching, testing, the database, the
services. This file governs the UI. A UI rule still printed in the root file is SOG-UI's
rule awaiting relocation and binds as if written here; a rule about the UI is never added
to the root file.

**If something has a state, SOG-UI owns the system that handles it.** A button's committing
state across a redirect, a loading affordance, an element that must not move under a
reader, the order of two buttons answering one question, a selection, a disabled control:
each is a system the library ships, not a pattern a page repeats.

The library depends on nothing in Sogverse. Nothing here imports from `src/`, and nothing
here knows about Supabase, services, queries, routes, auth or `next-intl`.

## Tiers, and the direction imports point

Four tiers, each depending only on the ones below it. Imports point downward, never up
and never sideways into a peer's internals.

1. **Foundations**: tokens, faces, the mark, vocabulary, the tone grammar, the spacing
   scale, formatting. Nothing outside this tier spells a hex, a pixel value or a brand word.
2. **Primitives**: the only tier that writes colour, type, border and state classes. Every
   construct the grammar names is a primitive or a variant carrying that name.
3. **Patterns**: recurring arrangements of primitives. A pattern composes; it never
   restates a primitive's recipe in a class string.
4. **Chrome**: header, footer, dashboard layout, navigation. Composed from the tiers below,
   taking everything it displays as props, writing layout only.

The library is susceptible to the rot it exists to cure, and the tiering is the mechanism
against it: a colour, type or border class above tier 2 is the same defect as a
hand-rolled div in a Sogverse page, and fails lint.

## Foundations

**Nothing is defined before it is needed.** A foundation entry earns its place in one of
two ways: something in the library consumes it now, or it is the brand's identity outright
(a hue, a face, a mark). A scale, a token, a table or a rule defined ahead of any consumer
rots unnoticed and is then consumed by surprise, at which point it is an opinion nobody
formed. So a radius arrives with the first cornered component, a spacing step with the
first layout primitive, a status colour with the first alert, a glossary entry with the
first component that renders the term. What the library has an opinion about grows with
what the library ships.

**Colour is defined once, in TypeScript, and the CSS is generated from it.** The typed
source is importable by everything that cannot read CSS: emails, canvas, OG images, the
identicon. A generator emits the Tailwind 4 theme, the generated file is committed beside
its source, and a test regenerates and diffs so the two cannot drift. A value is authored
as hex; every other form of it (an HSL triple, a composited tint for email, a contrast
ratio) is computed by a function, never typed by hand, so a value converted twice is the
same value. No new colour arrives by conversion or by eye.

**A brand colour exists only at its authored values**, a family's strong or soft variant
or a token's own full value, never at an alpha step. A ground that needs to lift goes to a
neutral; the brand arrives at full value on an edge, ink or fill. The exemptions are
chip-scale icon-accent tiles and artwork carrying its own palette, and the list is closed.

**There is one theme and it is dark.** No light fallback, no switcher, no `dark:` variant.
Every text-on-ground pairing the library ships is proven in the contrast tests, and a
consumer trusts the library to have done that arithmetic: a colour the library offers for
text on a ground is safe there, and a pairing the library does not offer is not available.

**Faces.** The library owns the faces School of Gaming uses, and the list is exhaustive and
defined by grammar: Poppins is the app face, body and every heading; Space Mono is the world
voice, spent only where the platform names one of its own places; Crimson Pro is the
editorial voice, for quotes and pull-quotes and never for UI or body copy; Dancing Script
is for a signature line and nothing else. The consumer loads the font files and exposes
each face as a CSS variable on `<html>`, never on `<body>`, because the theme emits at
`:root` and a variable one element lower is invisible there while the page still looks
styled. The library owns the semantic names and the scale. The demo's layout is the
reference implementation of that contract.

**The mark.** The logo, its variants, the monogram, their clearspace, minimum size and
placement rules, and the combined lockup `School of Gaming – Sogverse` with its spaced en
dash, are the library's. A consumer renders the mark through the library and never carries
its own copy.

**Vocabulary.** Marks are constants the library renders itself: School of Gaming, SOG,
Sogverse, the lockup, The Princi-Pal, the Yty vocabulary and its fixed forms. A mark is
never a prop, because a prop can be misspelled. Translatable brand terms (camp, club,
event, session, parent, gamer, gedu) are declared in the library's glossary with their
canonical form per locale and their translate-or-not rule; Sogverse supplies copy, and its
copy is checked against the glossary.

**The tone grammar.** Each colour family carries one meaning, and which fact takes which
family is a table in this tier: a role, a product kind, a Yty element, a status. Components
take the fact, never the tone. Sogverse passes `kind="camp"` or `role="gedu"` and cannot
choose a colour, which is what makes one meaning per hue hold everywhere.

**Spacing.** The library owns a spacing scale and the layout primitives that draw on it.
How much room a thing needs to breathe, how far a section sits from the next, how wide a
reading column runs: these are opinions of the brand, and a consumer picks a primitive and
a step, never a value.

**Formatting.** Dates, times, durations, ranges and money are formatted by the library on
`Intl`, in the viewer's locale and zone, to the brand's forms. A component that shows one
takes the raw value and formats it itself; the formatters are also exported for text
contexts. The viewer's locale, zone and a request-stable now come from one library
provider that the consumer feeds from its session.

## The API

**A grammar-bearing component takes named meanings, never colours, and facts, never
tones.** The wrong usage is an impossible prop value or a lint failure, never a comment. An
emphasis tier is called what it is. A construct the grammar names is a component or variant
with that name.

**Every word a component renders is a prop.** The library contains no user-visible string
literal, raw or translated. A component's props are the complete typed list of the words it
needs; plurals and time-varying strings arrive as function props. The consumer localises,
the library presents. The one exception is a mark, which is a constant.

**No `className` in the public API.** A grammar-bearing component takes named props and
nothing that restyles it; a layout container takes typed layout props from the spacing
scale. A one-off that needs a new look is a new variant, added here and judged in the demo.

**Fixture ids that feed an identicon are real generated UUIDs hardcoded as literals**,
never readable stand-ins and never generated at render time.

## The seam with Sogverse

**Sogverse composes and never paints.** Its source contains no utility class: no colour,
type, border, state or layout class, and no arbitrary value. A Sogverse page body decides
what data goes where by choosing library components and layout primitives; how anything
looks is decided here. Lint holds the seam.

## Reuse, extend, or create

When a surface needs UI, the answer is the lowest rung that fits, and each rung up has to
say why the one below fails:

1. An existing component as it is.
2. An existing component with a new value on an axis it already has.
3. A new variant on an existing component, when the thing is the same and only its
   appearance differs.
4. A new component, only when the thing is genuinely different, not merely different
   looking.

Whatever rung lands, the demo gains the new state in the same change. Reaching for a class
string means rung 3 or 4 was needed and the ladder was skipped.

## The demo

`demo/` is a Next app, run on its own dev server on port 3001 and deployed as its own
Vercel project with this package as its root directory. **It is seen, not read.** A human
opens it to check that things look right and that interaction behaves; an agent reads the
code to understand why. So the page shows a thing and its name and nothing else: no prose,
no rationale, no numbers, no pass marks. Everything worth knowing about a value or a
component lives in its doc comment.

Three floors, each showing every state side by side, because adjacent states compare
themselves and states across pages are compared from memory:

- **Foundations**: every colour, face, scale step, spacing step and mark.
- **Primitives and patterns**: every component in every state, interaction working.
- **Templates**: page-shaped compositions from the real chrome with fixture data, where
  composition is judged.

The demo's pages are the living example of how a Sogverse page is wired and are held to
every rule a Sogverse page is held to. Literal English is legal in the demo by lint
configuration on its directory, never by a disable comment. The demo is not a test and not
a screenshot tool: Sogverse's page-capture tool sees composition across many screens at
once; the demo is for what a screenshot cannot show.

## Standards

The package is held to the monorepo's gates without exception: `npm run lint` with zero
errors and zero warnings, `npm run type-check` clean (the root script fans out to this
package's own, which checks the library and the demo), unit tests under `tests/unit/sog-ui/`
in the root test tree.

**Tests test logic and mechanisms.** The generator's parity with its committed output, a
contrast ratio clearing its threshold, a state machine's transitions, rendering logic worth
exercising. A test asserting that a value equals what it says it is proves nothing and is
not written.

**Explanation lives in doc comments.** Every token, face, rule and component carries the
why in its JSDoc: what it is for, where it may and may not be used, and what it was decided
against. **Where a value came from is not part of the value.** No source labels, no
provenance fields, no inherited status: what is in the library is what the library says,
decided here. A doc comment says what a thing is for and where it may be used, never which
document or branch it was copied from.

This file is present tense and declares what SOG-UI is. Its history, the story of why it
exists and what it learned, is `docs/origins-2026-09.md`; the work still open to complete
it is `docs/rollout.md`, deleted when nothing is left. Neither holds a rule.
