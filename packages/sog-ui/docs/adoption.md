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
accept plumbing, and it settled the shape every later adoption reuses — faces, headings,
icons, spacing, each of which will put a set of decisions in front of the owner. The
shape, in the order it runs:

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
9. **Delete the page and the ledger before merge**, in one commit, once every entry is
   landed and the living demo shows the result. Their history stays in git.

Two habits that made the rounds cheap: the owner rules from the page, never from a
paragraph; and the session records, delegates and relays, holding the ledger rather than
the diff, so the owner's context and the session's both survive the number of rounds a
real topic takes.

## The order

### 1. The theme

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
added to the root dependencies so Vercel's install links it. The Yty hues are consumed at
alpha steps on three surfaces today, so those tints composite differently the moment the
hues change; review them with page-capture and correct them in the same PR.

Lint: none new. The seam lint comes at lockdown.

Done when: Sogverse renders the library's colours and faces, its own stylesheet holds no
token the library also ships, and the demo and the app agree on every shared value.

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

Why third: it is the hardest and the most valuable. It carries the amber act fill and the
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

## After these three

The audit named the rest of the missing middle, in rough order of how many hand-rolled
sites each retires: the inline error and alert, the empty state, the skeleton, the chip
and status chip, the selection edge, the search input, the person row, the page header,
select, table. Each takes its position when the three above have landed and the shape of
an adoption is settled; none is defined in the library before its turn.
