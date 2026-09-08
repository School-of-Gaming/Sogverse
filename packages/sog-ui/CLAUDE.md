# SOG-UI

`@sog/ui`, at `packages/sog-ui`, is School of Gaming's UI language: the single source of
truth for how anything School of Gaming puts on a screen looks, reads, moves and behaves.
Its consumer is Sogverse. Its demo lives at `demo/` beside its source, the way three.js
carries its examples: a consumer installs the library and never touches the demo, and reads
the demo's code as the reference for how the library is meant to be used.

**The test of the boundary: a new visual identity for School of Gaming is a change to this
package alone, and Sogverse takes it whole.** Anything that would need a Sogverse edit to
follow a brand change is in the wrong place.

**The School of Gaming Brand Voice & Identity Guidebook is this library's input, and this
is the only `CLAUDE.md` that names it.** It lives as an excerpt in `docs/guidebook/`, one
file per topic behind that folder's own index, for as long as it is needed. For anything
the library does not yet cover, the Guidebook is the source of truth, consulted while
deciding (what else is consulted beside it is in `docs/rollout.md`). For anything the
library covers, the library is the truth from the moment the value is in it, and the
Guidebook is not cited beside it. When the library covers the Guidebook whole, its job is
to forget the Guidebook exists: the folder is deleted, the library is the authority,
references no external document, and Sogverse never needs one.

## Ownership

**SOG-UI owns every UI opinion, and the three `CLAUDE.md` files never disagree.** The root
file governs the monorepo: lint, type-check, commits, branching, testing, the database. The
app file (`src/CLAUDE.md`) governs Sogverse the web app: its roles, services, auth and
copy. This file governs the UI. Sogverse follows the library one construct at a time,
as each is adopted (`docs/adoption.md`); for a construct not yet adopted, the app file's
existing rule for it still governs Sogverse's code, and the adoption that retires the
construct deletes that rule. A rule about the UI is never added to the root file or the
app file.

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

**A brand colour exists only at its authored values**, a family's single hex or a token's
own full value, never at an alpha step. A ground that needs to lift goes to a neutral; the
brand arrives at full value on an edge, ink, mark or fill. The one exemption is artwork
carrying its own palette. **A glyph tile is the lifted neutral with an edge in its glyph's
hue.** It used to be a square of the hue at a tenth behind a glyph already inked in it,
which was the same colour stated twice — once at its authored value and once at a duller
one — and the tint went; what replaced it was nothing at all, and a bare grey square is
too little to say which hue a tile belongs to when the glyph inside it is sixteen pixels
across. The edge is the answer the ban already allows: it draws the hue at full value,
around a ground that stays neutral, so the colour reaches the reader twice and is diluted
neither time. A tile whose glyph is the quiet ink has no hue to draw and keeps the plain
lifted fill.

**The ban is on the brand. A neutral may carry an alpha where the alpha does a job a solid
cannot: a layer over a ground it does not know.** The greys are not the brand speaking —
they are the ground, the ink and the edge, and a grey at a fraction of itself
misrepresents nothing — so what governs them is whether the transparency is doing work.
Three constructs are, they are the library's, and they are the whole list: **the scrim**
over media, **the glass** over whatever scrolls beneath it, and **the hover layer** over
whatever surface an element sits on. Each carries its own alpha, so no call site picks a
strength, and a consumer spends `bg-scrim`, `glass` or `bg-hover` rather than composing
one. A grey at alpha used as an **ink** is not on that list and never joins it: nothing
moves beneath a word, so the alpha buys nothing a solid could not, and what it produces is
a duller grey the theme already names. There are two inks, and the quiet one is one of
them.

**The lifted grey is a surface, and hover is a layer.** They answer different questions
and neither substitutes for the other: `lifted` is the authored ground a static thing
takes when it is set back from its neighbours, and `hover` is the ink at a low alpha laid
over whatever ground an element is already on — laid, and so drawn as a background *image*
rather than a background colour, because a colour would stand in for the ground instead of
sitting on it and an outline button would go see-through under the pointer. So a panel may be lifted and the rows on it
still show hover — the layer lifts a row on the page, on a card and on a lifted panel by
the same visible step, because it never had to name the ground beneath it. A grey written
as a hover is the defect this pair exists to prevent: it draws a state on one surface and
nothing at all on the one above. **Nothing in Sogverse writes a grey as a hover**, and
lint holds it. The demo's Ground-and-ink floor is the reference, where the three surfaces
are nested and each carries a live hoverable row.

**A nested list sits on its parent's ground, marked by an indent and a divider, never by a
lift.** The lifted grey is for small objects — a glyph tile, a key cap, a skeleton bar, an
input's well, a mono value — and never for a region of rows a reader moves through. Two
things go wrong when a run of rows is lifted off the rows above it. The children read as a
different kind of thing from their parent, which they are not; and the hover layer, which
lifts every ground by the same visible step, then lands on two grounds at once, so one
list answers the pointer in two colours and a reader is taught that the difference means
something. What actually says *these belong to that* is the indent, and it is the only
signal a nested list needs, with the divider saying where the parent's own row ends. **A
page section band is the same rule at the scale of a page**: an alternating band is a
region a reader moves through, so it takes the card ground, and the lifted grey — the
lightest ground the theme ships, authored for objects a few pixels across — is far too
bright spread across a viewport. Cards inside such a band are told apart by their own
edge, which is what a card's border has always been for.

**Colour is a figure where it names something and a fill where it is pressed.** An edge,
an ink, a mark, a chip's word beside its glyph: each of those is colour naming a thing —
a state, a kind, a role — and none of them is pressed. A fill is what a hand presses, and
the ink on it is the label of an action. **A native control's accent is act**: a browser
paints its own radio dot and checkbox tick from one property, which makes them the one
fill the library does not draw itself, and act is the value they take — a chosen option is
a thing the reader did, and only ever one control in a group is wearing it. A filled label is not a fault and does not read
as one; the chip does the same job and reads better, so a label wears the chip and the
fill stays the control's, which is what keeps a fill meaning *press*. Which colours a
**button** may wear is decided by the Button adoption, not here. **World is the measured
exception on the figure half**: `world` reads 2.71 as an ink on a card and 2.91 on the
page — under the glyph floor, let alone the body one — so it cannot be an ink on either
ground, which is why the role and status tables name families and statuses and never
world as a figure. World lives as an edge, a rule, a fill, or the logo — the logo
named rather than "a mark", because a logotype is the one graphic the non-text floor
exempts and a glyph is not. Nothing drawn to be read is drawn in world: no icon, no
tick, no arrow, no word. **A status panel is that division drawn whole: no ground, a
coloured edge, the glyph and a label in the hue, and the body in ink** — the edge
carries the attention the tint used to, and it costs nothing, because the panel was
already being drawn by a neutral one. **A boxed status is that panel and carries its
edge; a status stated inline — under a field, along a row — is a line and has no box at
all.** There is no third shape between the two, and the third shape is what keeps
getting built: a box drawn by hand with a neutral edge and a coloured glyph inside it is
the panel with its one mark of attention taken back off. **A public page's
hero headline is the one declared departure from the division** — a display treatment,
one phrase in `act` and the `world` rule beneath it — declared beside the label rule in
`brand.ts`, which is also where it says a section heading is not a hero.

**Colour is spent to a budget, and the budget is set by who the page is for.** **A
surface where a parent is being asked to trust us or to pay**, the parent's dashboard,
the mail, billing, safety and safeguarding copy, a partner page, spends act as its one
accent on neutral grounds, with ink for text and grey for support. Calm surfaces carry
credibility. A second colour arrives there only with an intent stated beside the site
that spends it. **A surface telling the story to a mixed audience**, the home page,
About, Roblox, the social cards, spends act plus one other colour, two accents at most,
and is colourful by putting two saturated colours on a calm ground rather than many
colours on one page. **A gamer surface**, the child's dashboard, the community, anything
inside the world, may spend the palette; that is where the loudness belongs. No page
spends all six, and act plus one is the default wherever no decision has been made. And
world is never the colour of quiet: it does not carry safety, safeguarding or
trust-building copy on a parent surface, where the reader is being asked to trust us with
a child and the page should sound settled rather than energetic.

No lint holds this one. What a page spends is a property of the whole rendered page, and
no class string can be asked how many colours its neighbours used; the place a check
becomes possible is the template adoption, where a page is composed from templates and
the set of colours it spends is knowable from what it composes. Until then it is judged in
the demo's template floor, on the page, like every other composition question.

**There is one theme and it is dark.** No light fallback, no switcher, no `dark:` variant.
Every text-on-ground pairing the library ships is proven in the contrast tests, and a
consumer trusts the library to have done that arithmetic: a colour the library offers for
text on a ground is safe there, and a pairing the library does not offer is not available.
The dark theme is one deliberate reading of a palette whose rules are written light-first:
every inversion that reading makes, and every departure from the brand's colour rules, is
declared and justified in the colour source's doc comments, or it does not exist.

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

`demo/` is a Next app, run on its own dev server on port 3001. It is not deployed
anywhere: it is opened on localhost, and giving it a home of its own on the web is a later
step, taken when there is a reason to look at it from somewhere other than the machine
that is building it. **It is seen, not read.** A human
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
it is `docs/rollout.md`, and the order in which Sogverse adopts it is `docs/adoption.md`,
both deleted when nothing is left. None of the three holds a rule.
