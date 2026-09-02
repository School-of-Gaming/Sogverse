# SOG-UI

School of Gaming's UI language as a package: `@sog/ui`, at `packages/sog-ui`. Its first
consumer is Sogverse. It carries its own demo app in `demo/`, the way three.js carries
its examples beside its source: a consumer installs the library and never touches the
demo, but reads it as the reference for how the library is meant to be used.

This file is the package's rules. The root `CLAUDE.md` still governs everything a rule
here does not name (lint, type-check, commit style, branching, the brand vocabulary, the
button order, the layout and loading rules). Where the two disagree on a UI matter, this
file wins inside `packages/sog-ui/` and the root file wins everywhere else.

## What it is, and what it is not

**SOG-UI abstracts Sogverse's UI language. It is not Sogverse's view layer.** Sogverse
keeps its own view layer, composed from SOG-UI at a high level of abstraction: a Sogverse
page body decides *what data goes where* and never *how anything looks*. Everything that
decides how something looks lives here. That is the whole boundary, and it is meant to be
checkable rather than aspirational (see "The seam" below).

The point of the package boundary is the mindset it forces. Inside Sogverse the question
is "how do I make this work for this page". Inside SOG-UI the question is "how does this
work as part of a coherent system". A page that needs something the library lacks does
not hand-roll it; it extends the library in the same change, and the extension is judged
as a system change, in the demo, beside everything it has to sit with.

There is no second consumer and none is planned. That is not a reason to build for one:
the library is Sogverse-shaped where that is honest, and the demo is the only other
consumer. What the library must never do is depend on Sogverse. Nothing here imports
from `src/`, and nothing here knows about Supabase, services, queries, routes or auth.

## The tiers, and the direction imports point

Four tiers, each depending only on the ones below it. Imports point downward and never
up or sideways across a tier's peers' internals.

1. **Foundations** own the tokens: colour, type scale, faces, radius, spacing. Nothing
   outside this tier spells a hex or a raw value.
2. **Primitives** are the only tier that writes colour, type, border and state classes.
   This is where the UI grammar lives, and every grammar construct the language names has
   a primitive or a variant that carries that name. Button, Badge, Chip, Alert, Heading,
   Eyebrow, Field, Card, Dialog, and the missing middle Sogverse has been hand-rolling:
   EmptyState, Skeleton, InlineError, StatusChip, AccentTile, the selection edge, Select,
   Table, SearchInput, PersonRow, PageHeader.
3. **Patterns** compose primitives into recurring arrangements: a feed item, a settings
   card, a stat row, a picker sheet. A pattern uses layout classes only. A pattern that
   restates a primitive's recipe in a class string is the defect this tiering exists to
   catch, and it is greppable.
4. **Chrome** is the header, footer, dashboard layout and navigation: the frame every
   Sogverse page sits inside. It is composed from the tiers below, takes everything it
   displays as props, and is the same tier as patterns in what it may write (layout only).

**The library is susceptible to exactly the rot Sogverse suffered, and the tiering is
the mechanism against it.** Colour, type and border classes appearing above tier 2 are
the same mistake as a hand-rolled div in a Sogverse page, and get the same answer: a lint
that fails on them, added as the tiers fill in.

## The grammar speaks in the API, not in comments

The design pass that preceded this package produced a colour grammar (amber = act,
harmony pink = people, glow green = growth, wit blue = knowledge, valor orange =
adventure, violet = the world), a strength axis (act, label, selection), a border doctrine
(furniture edges neutral, colour only where the border is the construct), and a set of
named constructs (eyebrow, state edge, ignition ring, inverted fill, accent tile). In the
reference branch those existed as prose beside repeated class strings, and 42% of the
lines it added were comments re-explaining the grammar at each call site.

Here the rule is: **a grammar-bearing component takes named meanings, never colours.** A
`tone` prop takes `people`, `growth`, `knowledge`, `adventure`, `act` or `world`, not a
hue. An emphasis tier is called what it is, not `secondary`. A construct the grammar
names is a component or variant with that name. If a rule about how colour is used can
only be stated in prose, the API is not finished. The measure of done for a grammar rule
is that the wrong usage is an impossible prop value, or a lint failure, never a comment.

Which *fact* takes which tone is Sogverse's knowledge, not the library's. That a camp is
`adventure` and a gedu is `knowledge` is a mapping Sogverse owns, decided once beside the
fact in a shared map. The library supplies the tones and enforces that a tone is what
gets passed.

## Strings: every word is a prop

**The library contains no user-visible string literal. Not a raw one, not a translated
one.** Every word a component renders arrives as a prop, so a component's props are the
complete, typed list of every string it needs. Sogverse localises; SOG-UI presents. The
library does not depend on next-intl or on any messages file.

Plurals and dates arrive already formatted, or as a function prop where the component
itself has to vary by count or by time. Chrome takes its labels the same way: a nav is an
array of `{ label, href }`, a footer takes its link groups, a header takes the viewer's
display name and the menu's entries. This is a labels object per component, typed and
exported beside it, which is the shape one Sogverse primitive already used before this
package existed.

The demo app is the one place literal English is legal, by lint configuration on its
directory, never by a disable comment at the top of a file.

## className: closed where it carries grammar

**Grammar-bearing components accept no `className`.** Button, Badge, Chip, Alert,
Heading, Eyebrow, AccentTile, StatusChip, the selection edge: they take named props and
nothing that lets a call site restyle them. A one-off that needs a new look is a new
variant, added here, judged in the demo.

**Layout containers accept `className` restricted to layout.** Card, Dialog content,
Stack, Grid and their kind take width, padding, flex, grid and gap classes, because that
is what page composition is. A lint rule fails any colour, font, border-colour, opacity
or state class passed to them. The rule is a pattern over the class string, the same
shape as the shading guard the reference branch wrote, and it slots into that mechanism.

## The seam with Sogverse

The end state, locked by lint once the sweep is done: **Sogverse's own source contains no
colour, type, border or state class. Only layout.** A Sogverse component composes SOG-UI
and arranges it; it never paints. This is the shading test generalised: the reference
branch's test hunted for alpha steps on brand families, and this one hunts for any
grammar class outside the library. It is the single guard that turns the sweep's end
state into something `dev` cannot drift back from.

Until the sweep, Sogverse may consume SOG-UI for new work once a tier is stable. That is
the cheapest way to test the API against a real consumer and to keep the sweep from
growing while the library is built. Piecemeal consumption is fine; piecemeal restyling of
what the library already covers is not, and gets the sweep's treatment when it comes.

The sweep itself is sliced by construct, one PR per component, each carrying the lint
rule that bans the raw path and the call-site conversion that rule forces. Never one
branch that touches every file.

## Tokens: TypeScript is the source, CSS is generated

**The brand's colours are defined once, in TypeScript, in the foundations tier.** Typed
and importable by anything that cannot read CSS: emails, canvas, OG images, the identicon.
A script generates the Tailwind 4 `@theme` CSS from it, the generated file is committed
beside the source, and a unit test regenerates and diffs so the two can never drift. There
is no build step; Node strips types natively and the generator is run directly.

**Colour math is done with code, never by eye.** The drift the reference branch had to
correct was caused by hand-rounded HSL. Every hex is authored as hex; anything derived
(a contrast ratio, an HSL triple, a composited tint for email) is computed by a function
whose output a test checks. Contrast is measured against the grounds the library actually
ships, with the threshold stated per pairing: WCAG AA is 4.5:1 for body-size text and 3:1
for large text and glyphs, and a pairing records which applies and why.

**A brand colour exists at exactly the values it was authored at**, a family's strong or
soft variant or a token's own full value, never at an alpha step. A ground that needs to
lift goes to a neutral; the brand arrives at full value on an edge, ink or fill. The two
sanctioned exceptions (chip-scale icon-accent tiles, and artwork that carries its own
palette and references no brand token) are the whole list.

**The theme is dark, and there is one theme.** The dark ground is an owner ruling: a dark
interpretation of the Guidebook palette, not a white one. No light fallback, no theme
switcher, no `dark:` variants. The Guidebook's soft variants, unsafe on white, are the
text-safe candidates on the dark ground, verified by measurement rather than assumed.

## Faces: the consumer supplies the files, the package owns the names

Fonts are loaded by the consumer, through `next/font` in a Next app, and exposed as CSS
variables on the root element. The package's theme maps its semantic names to those
variables and never loads a file itself. The contract is: a consumer defines the face
variables the package's theme names, on `<html>` and never on `<body>`, because the theme
emits at `:root` and a variable one element lower is invisible there while the page still
looks styled. The demo's layout is the reference implementation of the contract. A
consumer that forgets one face gets a silently unstyled page, which is why the contract
is written here and checked in the demo rather than trusted.

Poppins is the app face for body and every heading. Space Mono is the world voice, spent
at named placements only. Dancing Script is for signature lines and nothing else.

## The demo app

`demo/` is a Next app that runs on its own dev server and, later, deploys to Vercel as its
own project with `packages/sog-ui` as the root directory. It is not a test and not a
screenshot tool; Sogverse's page-capture tool is for seeing composition across many
screens and roles at once, and the demo is for what screenshots cannot do: interaction.
If a component is meant to be interacted with, the demo is where its interaction is
proven to work as expected.

It has three floors, and every floor shows rather than tells:

- **Foundations**: every colour with its name, hex, meaning, strong/soft pair and its
  measured contrast on the grounds it is used against; the type scale; the faces.
- **Primitives and patterns**: every state of every component side by side in one
  section, because adjacent states compare themselves and states across pages are
  compared from memory.
- **Templates**: page-shaped compositions built from the real chrome with fixture data. A
  dashboard page, a product page, a feed in a column. This is where composition is judged,
  and it is built early rather than last, because the design pass found its worst problems
  in composition, not in components.

**The demo's pages are the living example of how a Sogverse page should be wired.** They
are held to every convention a Sogverse page is held to, and a Sogverse page that wants to
know how to compose something looks here first.

## Standards

The package is held to the monorepo's gates without exception: `npm run lint` with zero
errors and zero warnings, `npm run type-check` clean (the root script fans out to the
package's own, which checks the library and the demo both), unit tests under
`tests/unit/sog-ui/` in the root test tree so the root Vitest config runs them.

Fixture ids that feed an identicon are real, generated UUIDs hardcoded as literals, never
readable stand-ins and never generated at render time.

## The reference branch

`feat/brand-palette-design-pass`, pinned by the tag `ref/brand-palette-design-pass`, is
the frozen record of the design pass this package grows out of. It is never merged. Its
tokens, button recipe, styling tests, exemption list, rulings and the record document
under `docs/records/` on that branch are harvested into the tiers here by hand; its 132
feature-file edits are discarded by design, because they are what the library exists to
make unnecessary. Read its record before reopening any question about colour, type or
borders: most of them were answered more than once before they settled.

## Sources

Three documents stand behind everything in the foundations tier, and they rank. The
**School of Gaming Brand Voice & Identity Guidebook v2.0** is the brand authority; it
lives outside this repo, at `C:/Users/Kyle/work/SoG_Brand_Voice_Guidebook_v2_0.md`, which
is why a value it states is quoted here rather than merely cited. **`docs/brand-guidebook-deviations.md`**
is the queue of places the app knowingly diverges — the dark ground is the largest one —
and an entry there wins over the Guidebook for as long as it stands. The **reference
branch** records the dark-ground reading itself: what the Guidebook's white-page palette
becomes once there is one theme and it is dark.

Two rules follow. **Where SOG-UI encodes a Guidebook value it quotes it** and marks the
entry's `source` as the Guidebook, so nobody has to guess whether a sentence is the
brand's or ours. **Where it diverges it names the deviations-log entry** in the same
place. The Guidebook is silent on a great deal a UI library needs — a focus ring, a
status set, a radius or spacing scale, any dark-ground pairing at all — and every such
answer is marked `design pass` rather than dressed up as a brand ruling.

## Phases

1. **Foundations: the brand colours, clearly defined.** The typed source, the generated
   theme, the parity and contrast tests, and the demo's first floor showing them.
2. **The demo runs on its own dev server** and is wired for Vercel.
3. **Primitives**: the 24 that lift from Sogverse with strings turned into props, then the
   missing middle.
4. **Chrome and patterns.**
5. **Templates** in the demo, and the first Sogverse consumption on new work.
6. **The sweep**, sliced by construct, with the seam lint at the end.
