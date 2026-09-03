# Why SOG-UI exists

**Status: frozen record, 2026-09-03.** The story behind the decision to build School of
Gaming's UI language as its own package (`packages/sog-ui`, its rules in the `CLAUDE.md`
there) rather than continue restyling Sogverse in place. Kept because the lesson is the
kind git history cannot tell: a well-documented design pass, run carefully, still turned
into a sweep, and the reason was structural. Nothing here is a rule; read the package's
`CLAUDE.md` for what to do and this for why it says what it says.

## The symptom

The brand design pass of 2026-08/09 was expected to be token edits and a handful of
primitive changes. It became 60 commits across 183 files, and the owner's reaction, "what I
expected to be some updates to CSS files and a swap of some UI components instead turning
into a sloppily applied UI update", was the prompt for the audit below. The diagnosis
offered was a weak UI system. The audit confirmed it, but sharpened where the weakness was.

## What the audit found

Four independent reads of the pass's branch, all against the same numbers:

- **Of 137 feature files touched, 110 were touched only by six find-and-replace recipes**:
  a heading weight in 48 files, an error banner in 25, a selection edge in 21, an info ink
  in 15, a hover removal in 10, half-alpha edges in about 20. Roughly 97 of those files
  would have collapsed to a handful of edits had a home existed for the thing being edited.
  The remaining 27 files were bespoke page design that any library leaves to the page.
- **Not one feature file expressed its change as a prop or variant swap.** Eight primitive
  edits did the design work correctly; nothing downstream could benefit, because the
  surfaces being restyled were not built from primitives.
- **The primitives that existed were adopted well.** The card primitive appeared in 75
  files, the button beat raw buttons two to one, the input nearly four to one. The sprawl
  came from what the primitive folder lacked: no heading, no page header, no empty state,
  no skeleton, no chip, no select, no table, no search input, no person row, no status
  chip, no shareable selection edge, no accent tile. Twenty-nine hand-rolled empty states,
  sixteen skeleton files in six idioms, six search inputs, eight verbatim eyebrow copies
  and four independent status-to-colour maps followed directly.
- **The grammar the pass wrote lived as prose.** Of 33 rules it added, 20 were prose-only,
  8 encoded in a token or variant, 5 tested. Its own vocabulary existed in code as two
  words; the rest lived in comments, and 42% of the lines it added to `src/` were comments
  re-explaining the grammar at each call site. The tint guard's exemption list held five
  entries for one recipe in five files: a missing component, written down as prose.
- **Composition found what components hid.** The pass's worst findings came late, from a
  forensic read of the composed pages: constructs "at a legal value with the wrong
  meaning", a shop that showed only two of the six colours, a button set that was built and
  demoed and then almost never reached for. A component that looks right in isolation and
  wrong beside its neighbours is the failure a demo of isolated states cannot catch.
- **A seven-month CSS bug had made every coloured border invisible** since the initial
  commit, and it surfaced in the sixth ruling batch when three border treatments rendered
  identically. Several rulings had been made on broken renders. A guard that reads the
  served CSS is worth more than any number of rulings made from source.

## The decision, and what was rejected

**A package that owns the UI language, consumed by Sogverse, with its demo beside its
source.** Sogverse keeps its own view layer and composes the package at a high level; it
decides what data goes where and never how anything looks. The package owns every UI
opinion the brand has: tokens, faces, the mark, vocabulary, formatting, spacing, state.

Rejected, with the reason:

- **Rewrite Sogverse against the library in one project.** The pass is the counter-evidence:
  eleven review rounds, questions answered four times before settling, and the sweep it
  produced is what a rewrite reproduces at larger scale. The sweep is sliced by construct,
  one PR per component, with a lint rule that makes each slice final.
- **Make the package the whole view layer, page bodies included.** A library shaped like
  one app's pages rots exactly as the app did, and the seam that makes the boundary
  checkable (Sogverse paints nothing) needs page bodies on the Sogverse side to mean
  anything.
- **Keep the design pass's rules as fact.** They were written by the same process that
  produced the sweep, and applied across the codebase by the same rules. The branch and
  the Guidebook are inputs consulted while deciding; a value enters the library because
  the owner decides it there, and carries no label saying where it was copied from.
  Provenance in the data reads as inheritance, and inheritance from a system that failed
  is what the library exists to end.
- **Merge the pass's branch and refactor afterwards.** Its 132 feature-file edits are what
  the library exists to make unnecessary; its tokens, recipe, tests and rulings are
  harvested by hand instead. The branch is frozen as a reference and deleted when the
  library is complete.
- **Storybook as the demo.** Isolation-first, a fourth authoring dialect outside the repo's
  lint, and it competes with judging composition in real chrome. The demo is a Next app in
  the package, run through Next's directory argument.
- **CSS as the token source.** Emails, canvas and OG images cannot read CSS; two hand-kept
  copies of every hex were already drifting. TypeScript is the source and the CSS is
  generated, with a parity test.

## Prior art that shaped it

The copy-don't-depend model already in the repo's primitive folder, and its known leak: a
`className` escape hatch cannot hold a grammar, and every design system that kept one
(Atlassian, Primer, Chakra) spent years closing it. Tokens as a layer below components
(Primer's primitives package), so non-React consumers share them. The foundations,
primitives, patterns split (GOV.UK, Polaris, Atlassian), and Polaris as the warning that a
library shaped like one admin never generalises. Lint that bans the raw element where a
component exists (Atlassian's design-system plugin), which is the repo's own
correctness-by-mechanism rule applied to UI. The second-consumer problem: a library with one
consumer is a folder with ceremony, and the mitigation chosen is that the demo is a real
consumer held to every rule a Sogverse page is held to.

## Rulings at inception

Made 2026-09-02 and 2026-09-03 by the owner while the package was cut:

- The package abstracts the UI language; it is not the view layer.
- Every word a component renders is a prop; Sogverse localises. Marks (School of Gaming,
  Sogverse, the lockup, the Yty vocabulary) are library constants; translatable brand
  terms are declared in a library glossary that Sogverse's copy is checked against.
- A grammar-bearing component takes the fact, never a tone: which colour a camp or a gedu
  takes is brand grammar and lives in the library, so Sogverse cannot pick.
- Formatting of dates, times and money is the library's opinion, implemented on `Intl`
  with the viewer's locale and zone supplied through a library provider.
- No `className` in the public API. Layout is typed props on layout primitives drawing on
  a spacing scale the library owns.
- If something has a state, the library owns the system that handles it: button order,
  loading, the layout-shift rule, committing.
- The demo shows and never tells: a thing and its name, no prose, no numbers. Rationale
  lives in doc comments for agents; the demo is for humans checking that it looks right.
- Tests test logic and mechanisms, never that a value equals itself.
- The library replaces the Guidebook as the source of truth once complete, and references
  no external document in its steady state.
- The reference branch (`feat/brand-palette-design-pass`, tag
  `ref/brand-palette-design-pass`) is deleted when the library is complete.
