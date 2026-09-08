# Adopting SOG-UI in Sogverse

**Status: working document, opened 2026-09-03.** The order in which Sogverse takes things
from SOG-UI, why that order, and what each adoption needs before it can land. Deleted with
`rollout.md` when the sweep is complete. `rollout.md` is the library's own build order;
this file is the consumer's. Nothing here is a rule; the rules are in the package's
`CLAUDE.md`.

## How an adoption lands

One adoption is one construct, and it lands as one PR with three parts that are not
separable: the library ships the thing with every state in the demo; Sogverse's call sites
convert to it; and a lint rule bans the raw path in Sogverse's source so nothing can drift
back. An adoption without its lint rule is a sweep that will need doing again. Sogverse's
page-capture tool is how the change is reviewed across every screen and role at once,
before merge.

Adoption order is decided by what each adoption proves for the ones after it, not by
visual impact alone.

## How the owner rules on an adoption

The theme adoption is the first that needed the owner to decide values rather than
accept plumbing, and it settled the shape every later adoption reuses — headings, icons,
spacing, each of which will put a set of decisions in front of the owner; faces is the
first that ran on it. The shape, in the order it runs:

1. **Read what the brand says about the topic before anything is built**, including what
   it does not say. The Guidebook is light-first and says almost nothing about dark
   grounds; knowing that up front is what made the dark theme a declared reading rather
   than a series of surprises. Bring the exact words, not a paraphrase.
2. **Enumerate the surface with a regeneration command.** Every value Sogverse defines
   for the topic, every place it spends one, counted. The count is what turns "we should
   look at colour" into a finite list, and re-running the command at the end is the proof
   the sweep is complete.
3. **Find and neutralise anything that has been hiding state.** Colour had a seven-month
   bug that made every coloured edge invisible; rulings made before it was found were made
   on renders that lied. Before the owner rules, the thing on screen has to be the thing
   in source, and a bug that hides part of it is fixed in a way that changes nothing the
   owner has seen (everything seen before the fix is correct; what the fix would newly
   reveal is deleted and returns only after it is seen in context).
4. **Build a temporary ruling page in the demo, held to the demo's own rule.** A thing
   and its name and nothing else: no prose, no ratios, no pass marks. Every rationale goes
   into a doc comment in the page's source. Every token is shown in use, reproduced
   class-for-class from the component that spends it and labelled with the component and
   a page it appears on; a rename is drawn twice from one recipe so the eye confirms
   nothing moves; a value change is drawn today beside proposed. A swatch with a name
   under it is not a decision the owner can make.
5. **Keep a ledger beside the page.** One entry per question: what is asked, what is
   shown, the ruling, its status (`open`, `ruled`, `landed`). The owner rules in shorthand
   in rounds; the ledger is the record, so no round depends on the conversation that
   produced it, and a fresh session picks it up from disk.
6. **Ruled means landed.** A ruling is applied in full as it is made — the library value
   with its doc comment and its measured pairings, the demo's living floor, the Sogverse
   call sites and stylesheet — and the ruling page shrinks by exactly that much. A value
   still needed as a comparison stays visible, drawn from the library rather than as a
   question. Nothing waits for a later sweep, which is the failure of every review sheet
   that came before this one.
7. **Codify the rules and their reasons in the source, not the values alone.** Each token
   says what it is for, what it is never for, and why. Where the theme departs from the
   brand's rules, the departure is declared as a decision with its justification, or it is
   flagged open for the owner; no justification is invented, and no source is cited.
8. **Keep the by-products.** A sweep turns up sites where a deleted thing had been the
   only signal of a state, or a construct with no library home yet. They go into the
   ledger as a queue for the library, never as fixes in Sogverse.
9. **Audit the ledger against the code, before the review.** A fresh agent with no
   memory of the rounds walks every entry marked landed and checks it against the repo:
   the token at the hex its ruling names, every site the sweep said it converted, every
   grep the entry recorded still returning nothing. Ruled-means-landed is a discipline,
   and a discipline nobody checks is a claim — this is what turns "did it all actually
   get applied" into a question a reader with no history can answer. The findings go back
   to the session to fix, and the audit runs *before* the code review rather than inside
   it, so the review reads code that already agrees with its own ledger.
10. **Delete the page and the ledger before merge**, in one commit, once every entry is
    landed and the living demo shows the result. Their history stays in git.

Two habits that made the rounds cheap: the owner rules from the page, never from a
paragraph; and the session records, delegates and relays, holding the ledger rather than
the diff, so the owner's context and the session's both survive the number of rounds a
real topic takes.

## The order

### 1. The theme — landed

Sogverse's stylesheet imports the library's generated theme, and its root layout satisfies
the face contract by defining the face variables the library names. Sogverse's own
stylesheet keeps only the tokens the library does not yet own.

Why first: it proves the plumbing every later adoption rides on (the workspace link,
Tailwind scanning a package, Vercel's install of a root dependency, the font variables on
`<html>`) in the one adoption where a failure is a wrong colour rather than a broken page.
It also ships the brand's actual hues on the live site with no component changed, which is
the boundary test passed once: the look changed and only the library moved. Afterwards,
every token still defined in Sogverse's stylesheet is by definition one the library does
not own yet, and that list is the backlog.

Needs in the library first: nothing beyond what exists.

Changes in Sogverse: the stylesheet imports the theme and deletes the tokens it now
receives; the root layout's font loads match the library's face contract; the package is
added to the root dependencies so Vercel's install links it. That install has to be told
to include the workspace: Vercel's install command had been `npm ci --workspaces=false`
to keep the bedrock portal's dependencies off the app's build, and under it a workspace
dependency is simply absent, so the first preview builds of this adoption failed with the
package unresolvable. The command is now scoped to this one workspace plus the root,
which links the package and still leaves the portal out. The Yty hues are consumed at
alpha steps on three surfaces today, so those tints composite differently the moment the
hues change; review them with page-capture and correct them in the same PR.

Lint: two, and they were not foreseen when this entry was written. Colour turned out to
have exactly two spellings the library cannot govern — a hex typed into a style object and
a raw Tailwind palette class typed into a class string — so both are banned in Sogverse's
source at the point of typing, with artwork the only exemption. The seam lint, which bans
utility classes outright, still comes at lockdown.

Done when: Sogverse renders the library's colours and faces, its own stylesheet holds no
token the library also ships, and the demo and the app agree on every shared value.

**What it landed (2026-09-07).** Colour is authored once, in TypeScript, and the Tailwind
theme is generated from it: the signature pair named by meaning (`act` and `world`, which
replaced `primary` and `secondary`), three neutral grounds (`background`, `card`, and one
`lifted` grey — `accent` and `muted` are gone, `muted-foreground` stays as ink), one
colour per Yty element, a four-strong status set, the sixteen picks a person may choose
for their own thing, and the identicon's four. Two constructs composite and nothing else
does: `bg-scrim`, the black tint that dims what is behind it, and the `glass` utility, the
ground thinned and blurred for a surface carrying its own contents — they replaced six
translucent strengths spread across five files, and `.glass-panel` left Sogverse's
stylesheet with them. Every token carries its rule and its reason in a doc comment, and
the rules that no value can state — a colour exists only at its authored value, a colour
is a figure on the dark ground rather than a tint of it, the budget a page spends — are in
this package's `CLAUDE.md`. Sogverse's own stylesheet now declares no colour at all: two
layout heights and the radius scale are all that is left, and each is a line item above. Four things hold it: `tests/unit/sog-ui/` (the generator's
parity with its committed output, the measured pairings, the neutral set, the picks, the
identicon), `tests/unit/styling/` (no colour token in the app's stylesheet, no token spent
at an alpha step, no glass of the app's own, no universal border default), and two lint
bans in `eslint.config.mjs` — a hex literal and a raw Tailwind palette class — whose only
exemptions are artwork, named one by one with reasons.

### 1b. Faces — landed

The theme's other half, taken on its own once the plumbing it rode on was proven. It is
numbered beside the theme rather than after it because it moves no component and adds no
API: the faces arrived with the theme, and this is the adoption that decided where each
one goes and closed the ways Sogverse could still name one of its own.

Why here: the face variables were already on `<html>` and the tokens already generated, so
the questions left were rulings rather than plumbing — which face each site takes — and
they are the smallest set of decisions the owner can be asked for in the shape the theme
settled. It also had to run before Heading: a heading's scale is decided on top of a face,
and ruling a size against a family that was about to change is ruling twice.

Needs in the library first: nothing beyond what the theme landed.

Changes in Sogverse: the five sites set in a display face convert to a library face and
the display face's load, token and class retire with them; the mail's family literal and
the Open Graph card's become derivations from the library; the About page's pull quote
takes the serif and its italic.

Lint: three, one per way a face can be written — `next/font` outside the root layout, a
family spelled as a string, and a `font-*` class that is neither one of the library's four
face utilities nor a weight.

Done when: every family Sogverse names is the library's, and nothing in `src/` can name
one that is not.

**What it landed (2026-09-08).** The library declares four loaded faces and the list is
exhaustive: **Poppins**, the app face, body copy and every heading, with no display face
beside it because a heading that wants personality gets the scale; **Space Mono**, the
site's one monospace and the machine face — a room code, a password, an id, a log, an
inline code span, a placeholder no customer should see — never a voice, a heading or a
name; **Crimson Pro**, the editorial serif, which now carries its true italic for its one
placement, the About page's pull quote in the Princi-Pal's voice, because a synthesised
slant on a serif is a skew of the upright alphabet rather than the italic one;
**Dancing Script**, a signature line and nothing else; and, beside that list rather than
in it, **the mail face** — the reader's own system sans, which mail alone may spend, with
no webfont ever loaded in front of it, because the clients most readers use load none and
a face that reaches a minority makes the mail two designs. **The world voice was put to
its strongest cases and not taken**: the zone names, the room heading, the product titles,
the child's greeting and the call-ended heading were all drawn in it beside the app face,
and the ruling was Poppins everywhere — one face, one job, and no call site left deciding
whether a string is lore. **The display face is retired**: Press Start 2P is not loaded,
`--font-display` is gone from the app's stylesheet, and the five surfaces that spent it —
the home hero, the Roblox hero, the gamer greeting, the admin all-clear title, the
call-ended heading — are the app face, each keeping the weight it asked for, which its old
face could not draw. The product banner's no-image fallback says `NO IMAGE` in the machine
face instead of setting "SOG" in a hand-typed system stack, so nothing in Sogverse
recreates the logo's monogram in type.

Four mechanisms hold it, and between them a face Sogverse defines for itself does not
compile. `tests/unit/theme/face-contract.test.ts` and its sibling
`tests/unit/sog-ui/typography.test.ts` assert the contract in **both** directions — every
face the library names is loaded with every style it declares, and every `next/font` load
in the layout names a family the library names, which is the completeness check and the
thing whose absence let a fifth family live in the layout for months. The second also
holds the mail face outside the loaded list: its stack names no family the consumer loads,
and no token is emitted for it. `tests/unit/styling/globals-declares-no-face.test.ts` keeps
`--font-*` out of the app's stylesheet and holds its one `font-family` to the library's own
token. And three lint bans in `eslint.config.mjs` close the three spellings, each with its
exemptions named one by one: `next/font` is importable by `src/app/layout.tsx` alone, a
`fontFamily` or a `font-family:` may not be a string (an identifier passes — the Open Graph
cards pass a constant derived from the app face), and a `font-*` class must be one of the
four face utilities the theme generates, read off the theme itself, or one of the four
weights this tree writes. The primitive needed no shipping: the face utility already is
one, so conforming is one class and departing does not compile.

Where each rule lives: the faces themselves, their placements and everything decided
against are doc comments in `packages/sog-ui/src/tokens/typography.ts`; the rules no value
can state — the list is exhaustive, mail is set in the reader's own sans, a consumer loads
what the library names and spells no family — are in this package's `CLAUDE.md` § Faces.
`src/CLAUDE.md`'s two face rules are gone with this adoption; the sentence-case rule stays
there, because it is Heading's.

### 2. Heading

The first primitive. It carries the type scale: one component, a level and the words, no
class prop.

Why second: it is the largest single mechanical win the audit found (one weight change
touched 48 files; 127 raw headings in 13 different class strings for one element), it is
grammar-bearing because it owns the scale, and it has no state. That makes it the cleanest
first test of a closed API, of every-word-is-a-prop, and of the sweep mechanics, before any
component with a state asks the same.

Needs in the library first: the heading itself, every level side by side in the demo,
including the H1 mobile step.

Changes in Sogverse: every raw `h1` to `h4` becomes the component; the page-title and
section-title class strings retire with them.

Lint: raw `h1` to `h4` elements are banned in Sogverse's source.

Done when: no raw heading element remains in Sogverse and the lint holds it there.

### 3. Button

The most-used primitive, and the first with a state.

Why third: it is the hardest and the most valuable. It carries the act fill and the
grammar fills, the neutral emphasis tier, the hover decision that is still open, and the
committing state that has to hold from the click through a redirect or a view swap, which
has failed in Sogverse more than once when each screen carried its own copy of the
pattern. The state machine is proven in the demo, where the interaction can be exercised,
before any call site depends on it. Heading proves the sweep on something stateless first;
Button asks it of something that is not.

Needs in the library first: the button with every variant, size and state side by side and
interactive in the demo; the committing system as a library concern rather than a per-screen
pattern; the hover ruling; a radius, arriving with this component because it is the first
with a corner.

Changes in Sogverse: every button call site and every raw `button` element converts; the
per-screen committing flags retire into the library's system.

Lint: raw `button` elements are banned in Sogverse's source, and so is the old primitive's
import once nothing uses it.

Done when: every clickable action in Sogverse is the library's button and its committing
state is the library's.

## After these

The audit named the rest of the missing middle, in rough order of how many hand-rolled
sites each retires: the inline error and alert, the empty state, the skeleton, the chip
and status chip, the selection edge, the search input, the person row, the page header,
select, table. Each takes its position when the adoptions above have landed and the shape of
an adoption is settled; none is defined in the library before its turn.
