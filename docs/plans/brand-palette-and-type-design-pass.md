# Brand palette and type — the dark-ground design pass

The visual half of the Guidebook alignment: adopt the Guidebook's Yty-Element colours,
button set, and display faces on Sogverse's dark ground — **UI first, then wiring** (owner
ruling): every change is designed and signed off in fixture-driven preview scenes and the
UI Components style guide before any live surface changes.

The copy-and-mechanical-fixes half of the same alignment ran as a companion plan and
merged first — both halves touch `globals.css` and the root `CLAUDE.md`, and that half
loaded the fonts this one places, so this plan's branch was cut from a `dev` that already
carried it. That plan file was deleted at its completion, as plans are; its outcomes live
in `docs/brand-guidebook-deviations.md` and the root `CLAUDE.md`, and later references
below to "the companion plan" mean that landed work.

## Problem

- **All four Yty-Element colours are wrong.** The tokens are raw Tailwind defaults —
  `harmony #34d399` (green), `glow #fbbf24` (amber), `valor #fb7185` (rose), `wit #a78bfa`
  (violet) — where the brand fixes Harmony **pink**, Glow **green**, Valor **orange**, Wit
  **blue**. Two are effectively swapped (Harmony renders in Glow's colour family, Valor in
  Harmony's), and the Glow stand-in collides with the CTA amber.
- **The site lacks the friendlier colours entirely.** Marketing content uses the brand's
  pink/green/blue; the app has only amber and violet, which read intimidating on dark, and
  has resorted to a yellow/black/purple gradient to "invent" colours when labelling more
  than two states.
- **The button set doesn't map to the Guidebook's.** Its Primary matches exactly (amber
  fill, ink text — already our default). Its Secondary (2px #121212 border on transparent)
  is *invisible on our #121212 ground* — specced for white; its Ghost (2px #FFFFFF border)
  is the Guidebook's own "on dark backgrounds" button and works natively. Our current
  "secondary" is a violet fill (a different construct), our "outline" is a 1px grey border,
  our "ghost" has no border.
- **Display faces are unplaced.** Space Mono is (after the companion plan) loaded but
  unused — the Guidebook names "in-platform UI" as its first use, and this platform is
  that. Press Start 2P is placed at 5 sites under an owner ruling that limited it to "rare
  and specialized uses".

## Scale

The Yty tokens feed the element cards, the voice zones and the style guide; the button
primitive feeds the whole app; the ground palette question shapes every future surface.
This is the highest-visibility styling work in the product, which is exactly why it runs
through scenes with owner sign-off instead of landing as token edits.

## The decision

Owner rulings (2026-08-24):

1. **The dark theme stays** — CTO preference: light-on-dark for contrast and colour
   vibrancy. The goal is a dark interpretation of the Guidebook palette, not a white one.
   (The Guidebook's Appendix A concedes its visual rules yield to a dedicated visual
   manual; this pass is that work, and it has been flagged to the Guidebook's author for
   ratification — see the escalation memo referenced in the companion plan. **Nothing in
   this plan waits on the author's verdict**: the owner's ruling is the operative
   authority, ratification runs in parallel, and any pushback returns through the
   deviations log as new work.)
2. **The Yty hues become the brand's, exactly** (strong / soft pairs):
   Harmony `#F55B9A` / `#FA7FA3` · Glow `#1AB061` / `#6AC66B` · Valor `#FD700D` /
   `#FF993D` · Wit `#3A71DE` / `#4DB3F5`. Contrast against the dark ground is **computed
   with code, never eyeballed**.
3. **UI first, then wiring.** Scenes and the style guide carry the drafts; the owner signs
   off from fixtures; promotion swaps the live bodies afterwards, per the preview-scene
   rules (a scene never owns a layout; the registry is the only place a scene is declared).
4. **Buttons are restyled in the UI Components page** for owner review before any app-wide
   swap. Primary = `#FAA901` fill + `#121212` text, no border; Secondary-on-dark = the
   Guidebook-Ghost shape (transparent, 2px foreground-colour border); CTA type moves to
   Poppins 16px / SemiBold 600. Suggested radius 4–8px is already met (6px, tokenised).
5. **Press Start 2P placements are reviewed** one by one; **Space Mono is placed** as the
   in-platform Sogverse display face where it earns it. Both judged in the scenes.
6. **Nothing promotes without the owner's sign-off on the scene.**

**The direction ledger has moved.** The thirty-one further owner directions made during
the review phase — the colour grammar, the shading rule and its scope battles, the
typography rulings, the border review, the layer bug that reopened the border question
halfway through, the censuses that scoped the corrections, and every supersession chain —
now live in **`docs/records/brand-design-pass-2026-09.md`**. They are the audit trail
behind the wiring spec below, not instructions: where the two could be read to disagree,
the spec is the resolution. The law that outlives both is in the root `CLAUDE.md` Styling
section, guarded by the two tests under `tests/unit/styling/`. Read the record before
reopening anything this pass settled — most of these questions were answered more than
once.

## Rejected alternatives

- **Mechanical token swap without design review** — rejected. The brand hues were tuned
  for white; landing them blind on dark risks trading one wrong palette for another. The
  scene is where they get tuned.
- **A light theme** — rejected (owner ruling; recorded in the companion plan).
- **Restyling the zone-rainbow and product-type categorical palettes** in this plan — no.
  Both carry written intent in the CSS and stay unless the scene work shows better; the
  broader categorical-labelling redesign is a follow-up awaiting what the scenes teach.

## Constraints discovered while deciding

- **Colour math is done with scripts** (owner instruction; the amber/violet drift this
  effort fixes was caused by hand-rounded HSL). Contrast checks likewise, with the
  thresholds stated: WCAG AA is 4.5:1 for body-size text and 3:1 for large text — each
  measured pairing records which threshold applies and why. The email suite's deliberate
  single-4.5 stance is its own and stays.
- **Semantic tokens only** — no raw Tailwind colour classes, no hex literals outside
  `globals.css` / `src/lib/constants/colors.ts` (repo rule; the email directory has a lint
  guard enforcing it).
- **The Yty tokens live in exactly two files** (`globals.css`, `colors.ts`); every consumer
  inherits, so the value change is one commit — the design work is deciding presentation
  (which variant where, what carries text, what fills), not chasing call sites.
- **A scene renders the real page body with fixtures** — every section present, inert
  backend actions, real chrome composed not simulated. Fixture ids feeding identicon
  avatars must be real hardcoded UUIDs.
- **The gamer dashboard is a mobile-first surface; admin/style-guide are desktop-default**
  (repo layout rules). Judge at 360px in the widest locale.
- **Surface map, revised mid-pass**: rebasing onto a `dev` that landed the About and help
  restructures moved two surfaces this plan was written around. The home page no longer
  hosts the Yty section (it is on `/about`), and the gamer dashboard no longer has a Yty
  grid. The element map's consumers are three, not five: the `/about` elements section, the
  Yty-named voice zones, and the style guide.

## The wiring spec — current law as fleet work packages

**This section is what the wiring executes from; the direction ledger in the record is the
audit trail behind it, not instructions.** Where the two could be read to disagree, this
section is the resolution — it was written after the last ruling by the session that held
the whole supersession chain. The work runs **in the existing worktree**
(`.claude/worktrees/brand-palette`, branch `feat/brand-palette-design-pass`) at
worktree-flow phase 2 — never a new branch: this branch carries the drafts the wiring
promotes, and its transitional state (resurrected borders at review values) must not land
before these packages run. Every package: built by a delegated Opus agent, files disjoint
from concurrently running packages, verification command green before the package counts
done.

**Global verifications (run at the end, all packages landed):** `npm run lint` (zero
errors, zero warnings) · `npm run type-check` · `npm run test` · the censuses below each
returning their stated end-state · `node scripts/yty-contrast.mjs` clean against its
thresholds. DB is untouched by this pass — no migrations, no db tests.

### P1 — Tokens and constants
Files: `src/app/globals.css`, `src/lib/constants/colors.ts`.
- `--warning` retunes from `#E7B008` → **`#E2761B`** (hue 27.4°; Δ27.4 to primary,
  Δ15.2 to valor-strong — accepted by the owner). Rider (copy-level, not CSS): a
  warning mark always carries a glyph.
- `--info` converges onto wit-strong `#3A71DE`; `--success` onto glow-strong
  `#1AB061`. Token-level only — call sites keep their `info`/`success` classes.
- `colors.ts` (email/OG hex constants) updates to match all three in the same
  change — owner's explicit instruction, so emails and OG images agree with the app.
- Verify: grep the old hexes (`#E7B008`, old info/success values from globals) →
  zero outside git history; contrast script re-run.

### P2 — Typography: Press Start 2P out, Poppins everywhere, Space Mono placed
Files: font loading (`src/app/layout.tsx` / font module), `globals.css` font tokens,
home hero, `/roblox` hero (incl. its char-count scale rewrite), the voice call-ended
screen, the select-profile drawn mark, OG image generation, the gamer greeting,
`docs/brand-guidebook-deviations.md`, root `CLAUDE.md` (the rare-use rule deletes).
- Every Press Start 2P site converts to Poppins at the pinned scale: H1 48–56px /
  600 / 1.1 (mobile floor 30px — French at the 360 floor is the binding case);
  H2 36 / 600 / 1.2; H3 24–28 / 600 / 1.3. Headings app-wide are SemiBold 600 —
  `font-bold` on headings sweeps to `font-semibold`.
- `--font-display` and the Press Start 2P `next/font` loading are removed entirely.
- Deviations log: the Press Start 2P entry closes "retired"; Dancing Script's
  signature-only exception is added; the root `CLAUDE.md` "rare, specialized uses"
  rule for Press Start 2P is deleted.
- Space Mono (`--font-brand-mono`) is placed **only** where the platform speaks its
  own vocabulary as a label — never marketing pages, never user content, never the
  section pill, badges or section headings (ruled: those stay Poppins).
- Verify: `rg -i "press.start|font-display"` in `src/` → zero (the brand-mono token
  and Space Mono loading remain).

### P3 — Buttons
Files: `src/components/ui/button.tsx`, its call sites, style guide.
- CTA type lands in the recipe: `text-base font-semibold`; the home page's per-site
  overrides collapse back onto the plain variant.
- `hover:bg-primary/90` is removed; the hover affordance goes non-colour (shadow or
  ring — implementer's pick, one recipe line).
- The `secondary` violet fill retires; the neutral emphasis tier is the foreground
  fill `bg-foreground text-background` (the ruled violet replacement). The single
  violet-fill call site converts.
- Grammar-fill variants (valor, harmony, glow; wit fills **soft** with dark ink)
  are added to the recipe and placed at the implementer's judgment under the ruled
  constraints: only where the action *is* the family's word; never beside a primary
  CTA; never two grammar fills in one view; destructive red untouched. Sparingly —
  zero placements is an acceptable v1.

### P4 — Shading corrections (the tint ban executed)
Files: the census's hit list — regenerate, never trust a frozen list:
`rg -n "(hover:|focus:|focus-visible:|focus-within:|group-hover:|active:)?(text|bg|border|from|to|via|ring)-(primary|secondary|info|success)/[0-9]+" src -g '!src/components/preview/**'`
- Selection grounds (22 sites): `border-primary bg-primary/5` → `border-primary
  bg-accent` (the checkbox row's variant line fixes every consent row at once).
- Washed grounds `bg-primary/10` → `bg-muted`; **exempt**: chip-scale icon
  medallions (the accent construct) and the two sanctioned home keeps (hero band,
  closing-CTA wash) — the only brand washes that survive, and the exemption list
  is closed.
- Tinted label chips `bg-primary/15|20 text-primary` → `bg-muted text-primary`.
- Enrollment live gradient wash → the ignition ring (promote the draft: painted
  overlay, constant geometry — see P7). `hover:bg-secondary/80` → solid.
- The admin trophy sprite decouples from `--primary` into its own hex constants
  (artwork carries its own palette; outside the shading rule by doctrine).
- info/success `/N` uses (~50) resolve under the border/alert law in P5 — full
  value where the construct keeps colour, neutral otherwise — in the same pass as
  the token convergence so no shaded brand colour ships.
- Verify: the regeneration grep returns only the closed exemption list. **Landed as
  the CI guard `tests/unit/styling/brand-shading-rule.test.ts`**, which walks `src/`
  in pure node (no shelled-out `rg`, whose availability differs between CI and dev
  shells), scans only what the build can turn into a class — string literals in code,
  declarations in CSS — so a comment may quote a banned class while explaining it, and
  fails on any hit outside the closed allowlist. It also catches the same violation
  spelled as an arbitrary value (`hsl(var(--primary)/0.2)`), which the census pattern
  cannot see.

### P5 — Borders (the classes are pinned in the record's direction 36)
Files: the border census hits. Hover border colour dies everywhere (accent/shadow
feedback; gray idiom on add affordances; the chat pill's no-op deleted); profile rings
white-on-hover/neutral-at-rest; form validation gains full-value `border-destructive`;
alerts full-value family edges on muted grounds; chips split on ground (no ground →
coloured edge, ground → neutral edge); Yty tiles `border-yty-X-strong
bg-yty-X-strong/10`; resting card edges neutral (gedu live card may adopt the ignition
ring — implementer's judgment).
- Verify: the prefixed-border census → only the ruled survivors.

### P6 — Nav marks
Files: `src/components/layout/sidebar.tsx`.
- The admin sidebar's active item: `bg-sidebar-primary text-sidebar-primary-foreground`
  → the inverted fill `bg-foreground text-background` (drop the two sidebar-primary
  tokens if nothing else consumes them). The header's active link stays amber text —
  ruled, no change.

### P7 — Promotion: drafts become the live bodies, machinery dissolves
Files: `enrollment-tones.ts`, `product-page-tones.ts`, `home-page-body.tsx`,
`gamer-dashboard-page-body.tsx`, the `/about` elements section, zone tiles,
`palette-scenarios.ts`, scene registry, style guide.
- Every `brand` draft path becomes the only path: the `palette` props and dose maps
  collapse, `current` keys die, scenarios collapse to one per scene, the retired
  slugs go. The layout does not change in this step (scene rule).
- The two remaining decks (`design-pass-typography`, `design-pass-walkthrough`)
  delete; the style guide's stale type-faces specimen reconciles.
- Verify: `rg "YtyPalette|BRAND_PALETTE_SCENARIO|palette-scenarios"` → zero;
  preview-scenes test green at its new counts.

  *Decisions taken at promotion (implementer's, per the open calls above):*
  **(a) The `bgGradient` slot is dropped** — the five-slot shape becomes four.
  Its only renderer was the deleted gamer Yty grid, gradients are retired by
  default, and a slot nothing draws is a construct the next reader has to work
  out the absence of. **(b) The `/about` mission and overview cards stay
  neutral (`bg-muted`)**, which is the *live* class rather than the draft's
  `bg-yty-harmony-strong/10`. The draft washed a whole card in a brand hue at
  10%, which is exactly the surface-scale construct the shading rule bans; the
  ruled exemption is chip scale (an icon medallion), and `/about` was never a
  signed-off scene, so the ban governs rather than the draft. The element cards
  on that page do take the promoted map. **(c) The four home sections are no
  longer exported** — the walkthrough deck was their only importer.
  **(d) `scripts/yty-contrast.mjs` loses its "current tokens" comparison
  table**, which read the four deleted single-slot tokens and would otherwise
  throw.

### P8 — Law, guards, story (what outlives the plan)
Files: root `CLAUDE.md`, `src/components/voice/CLAUDE.md`,
`docs/brand-guidebook-deviations.md`, `docs/records/` (new),
`docs/investigations/brand-pass-census-2026-09.md` (deletes), tests.
- **CI guard 1 — the tint ban:** a unit test regenerating the P4 census and failing
  on any hit outside the closed exemption allowlist (named per file+class, never per
  line — lines drift).
- **CI guard 2 — the layer regression:** a test asserting `globals.css` contains no
  top-level (unlayered) universal `border-color` rule — the bug that hid the app's
  border colours for seven months must not return silently. The rule wrapped in
  `@layer base` is the accepted form; the failure is the same declaration outside any
  layer.
- Root `CLAUDE.md` gains the distilled law, one rule + one-line why each: the
  shading rule and its art/accent/sanctioned-keeps exemptions; the colour grammar
  (six families, six meanings); the strength axis; the border doctrine (neutral
  furniture, the coloured-border constructs with jobs, state-never-repainted-by-
  hover); the hover-colour principle (vibrancy at rest — mobile-first families
  never see hover); the audience colour budget (family+gedu colourful, admin
  restrained); the role families.
- `docs/records/brand-design-pass-2026-09.md`: the frozen story — the pass, the
  layer bug and resurrection, the census, and the direction ledger moved out of this
  plan (which then compresses to spec + pointers).
- `src/components/voice/CLAUDE.md`: the settled zone appearance — the colour map's
  slots, the current zone's own-colour border, Space Mono on zone names.
- Deviations log: calm-ring entry (palette-in, owner ruling); PS2P closes; Dancing
  Script added. The memory file `project_brand_guidebook_alignment.md` (+ its
  `MEMORY.md` line) deletes once everything it holds is codified — **note: its Gedu
  ™/® placement ruling has no repo home yet, so that one needs a destination before
  the file goes.**

### Post-review corrections (2026-09-02)

The branch review found nine mechanical gaps between the packages above and what
landed. All are executions of rulings already made — 25 (wit's ink), 27 (tinted
label chips), 36 (the border and status-banner idiom) — not new design:

- **The info-ink mechanism** (ruling 25). `--info` *is* wit-strong, which fails
  4.5:1 as body copy on all three grounds, so every body-size `text-info` ink site
  converted to `text-yty-wit-soft` — 15 sites, including the `Alert` info variant,
  the status chip, the now-divider, the mention chip and the small glyphs. Edges
  (`border-info`), fills (`bg-info`) and the style guide's own token swatch stand.
  The mechanism is now stated in the root `CLAUDE.md` strength-axis rule.
- **The contrast script gained `--muted` as a third ground.** The tint ban made it
  the app's universal alert/chip/banner ground and it is the lightest of the three,
  so it is the binding one. No colour was retuned: the only failures are wit-strong
  as ink, which is exactly what the mechanism above handles.
- **The tint guard widened to the rule's own scope.** It matched four families
  while the rule names six; it now also covers `yty-(harmony|glow|valor|wit)-
  (strong|soft)` in both the utility and arbitrary-value spellings. `warning` and
  `destructive` are deliberately out — functional status tokens, not brand
  families. The widened census found no new violations: the only yty tints are the
  ruled icon-accent tile grounds, allowlisted with their why.
- **The error-block idiom unified** (ruling 36). The 15 surviving hand-rolled
  `bg-destructive/10` blocks took the landed shape (`border border-destructive
  bg-muted`), and the two tinted warning constructs took theirs — `bg-muted` under
  the count chip's ink, a full-value edge on the product-form banner.
- **One axis, one vocabulary.** The gedu feed's future-marker pair spelled its
  prominent arm `bg-info` and its quiet arm `bg-yty-wit-soft`; both are now wit's
  own two values, as the family feed's rail already was.
- **Three smaller ones:** the ignition ring's cover radius went concentric
  (`rounded-[5px]` inside a 7px clip at a 2px inset) on both cards; the
  `VoiceAvatar` JSDoc now describes the neutral ring it actually draws (the ring's
  visibility is escalated separately); and the root `CLAUDE.md` hardcoded-colours
  rule gained the artwork carve-out the shading rule's art exemption already
  implied, so the two rules no longer contradict.

**Sequencing:** P1 first (tokens feed everything). P2/P3/P6 are file-disjoint and
parallel. P4 and P5 overlap files with each other and with P7 — run P4+P5 together
or sequenced, then P7 last of the code packages. P8 runs last (its guards assert
the end state). Then the branch-level code review (worktree-flow phase 4, delegated),
then phase 5 landing on the owner's explicit word only.

### P9 — The grammar dispersal (2026-09-02, owner-ordered after the wiring review)

The spec above had a blind spot it could not see by construction: it captured the
corrections a grep could enumerate (alpha-shaded values) and the whole-page scene
promotions, but not constructs sitting at a **legal value with the wrong meaning** —
invisible to any value census, because a violet chip is a legal violet and wrong
only for what it says. Those decisions lived on the deleted review decks; their
rulings survive in the record. A forensic audit (approved drafts at the review-close
commit vs the shipped branch, cross-checked against the capture run's pixels)
built the gap list; the record's directions 10, 21, 25, 26, 28, 32 and 36 supplied
every destination. Converted, each with a comment naming the meaning:

- **Violet dispersal** (violet = the world, nothing else): the WhoChip audience
  chip and the PEGI badge went to the eligibility label tier (`bg-muted` +
  wit-soft ink — the same question the region-lock strip already answers in wit);
  the WhatsApp read receipt went wit (a receipt is information); Badge's
  `secondary` variant retired its violet fill for the neutral label tier
  (`bg-muted text-foreground`), mirroring the button recipe's ruled replacement.
  Surviving violet: the three display-title chunks (home, /roblox, call-ended),
  the sanctioned gradient tails, and the style guide's token swatches — all world
  or documentation.
- **The participation lifecycle joined the ruled one-hue stepping** (admin user
  page): active = solid amber, pre-active steps muted + amber ink, completed
  muted — mirroring the product status chip. The status-map enumeration found no
  other unconverged lifecycle; the gedu fee divergence the census once flagged
  had already healed (both sites destructive for a missing fee).
- **The Yty accent tile's ruled full-value edge reached its other two render
  sites** (/about element cards, the voice zone tiles — the zone presentation
  type gained a border slot); the home page already had it. The tint guard's
  justification comment now describes all three truthfully.
- **Attendance "present" ink stepped to glow-soft** over its full-value `success`
  edge — the glow idiom the live tag beside it already wears on both feeds, the
  form the approved deck exhibit drew, and a contrast gain (5.35 → 7.14:1); the
  edge keeps its semantic status name so a future retune reaches it. Absent stays
  warning (the 2026-08-25 ruling); the tone file's header no longer contradicts
  its own entries.
- **Time-is-wit under-sweep**: the enrollment card's schedule glyph and the
  public product overview's Schedule glyph took wit-soft, matching the family
  product page's masthead (a finished run's card still dims the glyph with the
  row — an authored-value wit glyph on a greyed card would out-shout it, and a
  dimmed wit would violate the shading rule).
- **Community facts are harmony**: the seat-availability meter's normal fill went
  harmony-strong (glow is reserved for progress/liveness; the scarce warning
  state stays — functional urgency, not grammar).
- **Direction 36 stragglers**: NewcomerBadge took the no-ground branch's
  `border-success`; the needs-attention count chip gained `border-warning`; the
  schools StatusPill gained per-state edges; the location picker's selected row
  took the ruled `border-primary bg-accent` its ~23 siblings already had.

**Escalations left with the owner (P9 applied none of these):** grammar-fill
button placements — still zero in the app; the delegated usage doctrine needs one
owner call first (when the grammar word *is* the primary CTA, does the fill
replace amber, or does the act monopoly win?), and the valor "Book the camp"
example additionally brushes direction 15's admin-only type-pairing ruling.
Candidate sites are listed in the wiring report. — The role-colour reinforcement
sweep (direction 25's standing directive; direction 15 makes the grammar's
establishment conditional on it) still has no family-facing site: every candidate
found (gedu chips on the family product page, select-profile tiles, chat sender
names, the report attribution chip) collides with another ruling or is a visible
design decision; proposed sites are in the report. — The /roblox closing CTA and
the /about mission washes were neutralized by the closed sanctioned-keeps list;
/roblox's is the identical construct to home's kept wash on the other
first-contact page and was never put to the owner. — The JoinVoiceButton's
"Opens …" label is the same time fact as the schedule rows and a candidate for
the wit glyph treatment, left because a button speaks act grammar.

## Acceptance criteria

- The Yty tokens render the exact brand hues (script-verified round-trip), every consumer
  surface updated, no raw Tailwind colour values remaining in the Yty tokens.
- Every text-on-colour pairing shipped is WCAG-AA-checked by script, numbers recorded.
- The scenes exist in the registry, and the owner signed off each before promotion.
- The button set matches the reviewed design; no orphaned variants; UI Components shows the
  final set with states side by side.
- Space Mono renders where decided; every Press Start 2P site has a recorded keep/swap/drop
  decision.
- `npm run lint`, `type-check`, `test` clean; email suites green in CI if `colors.ts`
  gained values.
- CLAUDE.md carries the dark-palette rules; the deviations log reflects the outcomes.
- The memory file is deleted; this plan file is deleted at completion (follow-ups proposed
  by headline first).

## Owner-decision escalations during implementation

Whether the violet-fill button construct survives under another name or retires (owner has
deferred this to the design review itself — it is settled there, with him, not before);
the third button tier's design; any Yty hue whose script-checked contrast fails on dark in both
strong and soft variants (the fix — a tuned dark variant — changes a brand colour and is
the owner's call, flagged onward to the Guidebook's author); any Press Start 2P site the
implementer can't settle against "rare and specialized"; the /roblox hero typeface
(partner-approval dimension).

## Follow-ups (live and die with this plan unless the owner names them)

- **The identicon pass** — *owner-named, 2026-09-01, survives this plan*: recolour the
  avatar mosaic off `[primary, secondary, white]` (today every face in the app is
  amber+violet decoration) — the four-tertiary ensemble is the natural candidate and the
  arbitrary-identity exemption (the zone palette's) the natural ruling shape. One array in
  the identicon module recolours every avatar in the product; stability per user must
  survive the change or every face shifts at once.
- **The categorical-labelling system**: a proper meaning-free multi-state palette now that
  pink/green/blue exist, and retirement of the yellow/black/purple gradient trick — owner
  is interested; explored informally in the scenes, but the app-wide redesign waits for
  what they teach.
- Crimson Pro for editorial/pull-quote moments.
- Lucide default `strokeWidth` 1.5 (Guidebook recommends ~1.5; app rides the 2px default).
- The email Poppins-first progressive font stack (pending the Guidebook author's answer).
- **The email callout panel's info tint**: its pre-composited hexes were derived from the
  app `Alert`'s old alpha border and wash, and the app's alert now carries a full-value
  edge on a muted ground. Matching mail to it is a visible change to every session report
  and was out of this pass's scope.

Cut from the census's findings — researched during the pass, deliberately not built:

- **Scrim and focus-ring tokens.** The profile tiles' loading overlay is raw
  `bg-black/60` + `text-white`, the only hardcoded colour left outside the sanctioned
  spots; and `--ring` is amber on every focus ring in the product, login and payment
  included. Both want a decision this pass did not make.
- **The `Badge` default.** It is an amber fill that most of its call sites immediately
  paint over — changing the default to neutral and adding named grammar variants is the
  cheapest single point of control left in the colour system, and it would let the
  scattered per-surface tone maps collapse.
- **Machine-text and italic conventions.** Seven copy-affordance / compared-character
  strings still render in the app face rather than mono; and five surfaces use italics as
  a "ghost content" state marker — a load-bearing unruled convention, so sweeping italics
  needs a replacement cue there first.
- **The voice zone rainbow.** Nine of its sixteen hues sit within ΔE 13 of a colour with a
  fixed meaning, and the random appearance picker lands on them by dice. Options measured:
  shrink to ~8 clear hues, move the ring to a pastel chroma-lightness band, or accept with
  glyph reliance.
- **Body line length.** Public prose runs `max-w-3xl` (~85–96ch) against the Guidebook's
  70ch cap.
- **One attendance fact, two tones.** The gedu register's "absent" toggle reads neutral
  while the saved chip reads warning. Each carries an argued reason in place, so this is a
  reconciliation to make deliberately rather than a bug to sweep — but it is the
  fact-owns-its-tone rule's one known outstanding split.
