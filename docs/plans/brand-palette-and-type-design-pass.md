# Brand palette and type — the dark-ground design pass

The visual half of the Guidebook alignment: adopt the Guidebook's Yty-Element colours,
button set, and display faces on Sogverse's dark ground — **UI first, then wiring** (owner
ruling): every change is designed and signed off in fixture-driven preview scenes and the
UI Components style guide before any live surface changes.

Companion to `docs/plans/brand-guidebook-alignment.md` (copy + mechanical fixes). **This
plan's branch is cut from `dev` only after that plan merges** — both touch `globals.css`
and the root `CLAUDE.md`. That plan also loads the fonts this one places.

## Problem

- **All four Yty-Element colours are wrong.** The tokens are raw Tailwind defaults —
  `harmony #34d399` (green), `glow #fbbf24` (amber), `valor #fb7185` (rose), `wit #a78bfa`
  (violet) — where the brand fixes Harmony **pink**, Glow **green**, Valor **orange**, Wit
  **blue**. Two are effectively swapped (Harmony renders in Glow's colour family, Valor in
  Harmony's), and the Glow stand-in collides with the CTA amber. Five surfaces inherit
  these: the home Yty section, the gamer dashboard Yty cards, the Yty-named voice zones,
  and the style-guide fixtures.
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
  that. Press Start 2P is placed at 5 sites (home h1, gamer dashboard h2, /roblox hero,
  call-ended screen, profile-select header) under an owner ruling that limits it to "rare
  and specialized uses".

## Scale

The Yty tokens feed five surfaces; the button primitive feeds the whole app; the ground
palette question shapes every future surface. This is the highest-visibility styling work
in the product, which is exactly why it runs through scenes with owner sign-off instead of
landing as token edits.

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
   with code, never eyeballed** (the soft variants — which the Guidebook marks unsafe on
   white — are the text-safe candidates on #121212; verify, don't assume).
3. **UI first, then wiring.** Scenes and the style guide carry the drafts; the owner signs
   off from fixtures; promotion swaps the live bodies afterwards, per the preview-scene
   rules (a scene never owns a layout; the registry is the only place a scene is declared).
4. **Buttons are restyled in the UI Components page** for owner review before any app-wide
   swap. Specs, stated inline so the Guidebook isn't needed: Primary = `#FAA901` fill +
   `#121212` text, no border (already matches — do not touch except hue exactness);
   Secondary-on-dark = the Guidebook-Ghost shape: transparent, 2px foreground-colour
   border; the third tier (today's borderless ghost) is designed deliberately with the
   owner. CTA type moves toward Poppins 16px / SemiBold 600. Suggested radius 4–8px is
   already met (6px, tokenised).
5. **Press Start 2P placements are reviewed** one by one against the "rare and specialized"
   ruling; **Space Mono is placed** as the in-platform Sogverse display face where it earns
   it. Both judged in the scenes.
6. **Nothing promotes without the owner's sign-off on the scene.**

Owner direction (2026-08-31), added during implementation:

7. **The question the pass answers, stated by the owner:** *can Sogverse be as fun,
   colourful, bright and lively as the sog.gg marketing site while keeping the dark
   ground — all while adhering to the Guidebook?* The walkthrough deck's cover carries it
   verbatim and every slide is read as evidence toward it.
8. **The palette's reach is broad, not fenced to the Yty section.** Step 9's rationing
   hypothesis is settled on the permissive side: the home page is a marketing surface, so
   the brand draft colours the feature cards, the how-it-works circles and the hero glow
   as well. Two doses are drafted rather than one — `brand-palette` (accents) and
   `brand-lively` (the marketing site's own energy: a dusk pink/blue hero with no ambient
   amber, a glow-green marker stroke behind the headline's payoff words, fuller washes, a
   tinted band, palette rules under section headings) — and the owner picks the dose from
   the scenes. Only the **calm ring** (billing, safeguarding, legal), which the Guidebook
   keeps amber-only, is still an open ruling.
9. **The status tokens collide with the brand families, and convergence is raised for
   ruling.** `--info` (#308CE8) sits between wit-strong #3A71DE and wit-soft #4DB3F5;
   `--success` (#2EB88A) sits beside glow-strong #1AB061 — the same one-hue-two-meanings
   defect this plan opened with. The deck asks: converge (info → wit, success → glow),
   keep both, or defer to the categorical-labelling follow-up. `--warning` and
   `--destructive` are far enough from valor and harmony to stay either way. **If the
   owner rules to converge, step 6's wiring scope gains the two status-token values**, in
   the same commit as the Yty tokens — both are tokens, so no call site changes.

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
  measured pairing records which threshold applies and why. Measure the pairings the
  scenes actually ship, noting that today's Yty usage is mostly low-alpha tints
  (`bg-yty-*/10`) where the real pairing is foreground-on-tinted-ground, not
  text-on-full-fill. The email suite's deliberate single-4.5 stance is its own and stays.
- **Semantic tokens only** — no raw Tailwind colour classes, no hex literals outside
  `globals.css` / `src/lib/constants/colors.ts` (repo rule; the email directory has a lint
  guard enforcing it).
- **The Yty tokens live in exactly two files** (`globals.css`, `colors.ts`); every consumer
  inherits, so the value change is one commit — the design work is deciding presentation
  (which variant where, what carries text, what fills), not chasing call sites.
- **No home-page scene exists yet; a gamer-dashboard scene does.** The registry (single
  dynamic route, admin-gated, enumerated on the UI Previews page) holds ~11 scenes; this
  plan adds the home scene and extends the gamer-dashboard one. Buttons belong in the UI
  Components style guide, not a scene (a reusable component's states compare side by side
  there).
- **A scene renders the real page body with fixtures** — every section present, inert
  backend actions, real chrome composed not simulated. Fixture ids feeding identicon
  avatars must be real hardcoded UUIDs.
- **The gamer dashboard is a mobile-first surface; admin/style-guide are desktop-default**
  (repo layout rules). Judge the Yty cards at 360px in the widest locale.

## Steps

One branch off `dev` (after the companion plan merges), `feat/brand-palette-design-pass`.

### UI (scenes and style guide)

1. **Build the home scene, extend the existing gamer-dashboard scene**: a home-page scene
   (hero + Yty section + features, fixture-driven) is new; a gamer-dashboard scene already
   exists in the registry — extend it rather than duplicating. Registered scenes appear on
   the UI Previews page automatically. Reuse existing presentational bodies; if a section proves
   un-demoable without live calls, fix the coupling (presentational core taking rows/props)
   rather than faking the section.
2. **Yty palette drafts in the scenes**: apply the brand strong/soft pairs to the home Yty
   section, the gamer dashboard Yty cards, and the voice-zone tiles (the zone tiles can be
   judged in the existing voice fixtures/style guide). Script-verify contrast for every
   text-on-colour and colour-on-ground pairing; record the numbers in the PR.
3. **Button restyle in UI Components**: the Guidebook set (specs in Decision 4) rendered
   side by side with the current variants — every state (default/hover/disabled/loading)
   adjacent, one section, so the comparison happens on screen rather than from memory.
   Scope bound: `destructive` (6 call sites) and `link` (3) are functional variants
   outside the Guidebook's set and are untouched. The review decides the mapping for
   `secondary` (violet fill, 1 site), `outline` (61), and `ghost` (24) — those counts
   are the branch's blast radius; whether the violet-fill construct survives under another
   name or retires is an owner decision (see escalations).
   *Deviation, implementation:* every count above was recounted (`<Button variant="X">`
   plus `buttonVariants({ variant: "X" })`, app code in `src/`, style-guide page excluded)
   — the plan's estimates counted `<Badge>` variants and missed the `buttonVariants`
   anchors. The one that changes the decision: `secondary` is **1** call site, not ~13, and
   it is a `buttonVariants` anchor rather than a Button.
4. **Display faces in the scenes**: Space Mono placed where the in-platform world voice
   earns it (candidates: the gamer dashboard's display headings, voice-room chrome, badge
   labels — judged, not assumed); each Press Start 2P placement kept, swapped to Space
   Mono, or dropped, one decision per site against the rare-use ruling — five sites (home
   h1, gamer-dashboard h2, the /roblox hero, the profile-select header, the instant-call
   ended screen), decisions recorded in the deviations log's Press Start 2P entry. **The
   /roblox hero site is special**: it sits directly above the approved Roblox partner
   lockup, and an approval covers the placement as given — a typeface change there alters
   the approved placement's appearance, so it ships only with the owner's explicit go (and
   partner re-approval if the owner judges it needed).
   *Deviation, implementation:* the home h1's draft decision is **keep Press Start 2P** —
   it is the flagship rare use, and the scenes propose it unchanged rather than offering a
   swap. Pending the owner's ruling like the other four sites.
5. **Owner review gates**: the owner reviews each scene and the button section in the UI;
   iterate in fixtures until signed off. Nothing past this line starts before sign-off.

### Wiring (promotion)

6. **Land the Yty tokens** — honestly scoped, this is more than a value swap: today each
   element is a single token consumed as literal Tailwind classes (`bg-yty-harmony`) in
   the voice-zone constants (which document why literals are required — Tailwind must scan
   them) and through a fixed five-slot map (`bg`/`bgGradient`/`border`/`accent`/`ring`) in
   the Yty constants. Strong/soft pairs mean new token names in `globals.css`, new
   scannable literals, and a per-slot decision in that map — decided by the scenes, landed
   here. Update the `YTY_ELEMENT` hexes in `colors.ts` in the same commit (they carry the
   stale Tailwind values; no importers today, but the file is the email/canvas palette
   source and must not document wrong colours). Presentation decisions from the scenes
   apply to the live bodies per the scene-promotion rule (the draft body becomes the
   route's body; layout does not change in that step).
7. **Land the button variants** app-wide as decided in review; remove any variant the
   review retired, fixing call sites.
8. **Apply the display-face decisions** to the live surfaces.
9. **Codify**: the dark-palette decisions (which variant carries text on dark; where the
   full palette is welcome vs amber-single-accent) written into the Styling section of the
   root `CLAUDE.md`; the deviations-log entries for the dark palette, Press Start 2P
   outcomes, and button mapping updated or cleared per the log's lifecycle. The Guidebook's
   colour-rationing rule, restated so this plan stands alone: parent/partner/billing/
   safety surfaces get amber as the single accent on a calm ground; family story surfaces
   get amber plus one palette family; gamer/community/in-world surfaces welcome the full
   palette. Mapping that rationing onto our parent-vs-gamer surface split is a **starting
   hypothesis for the scenes, not a decided rule** — the owner wants the friendlier
   colours working broadly, and the scenes settle with him how far they reach into parent
   surfaces.
10. **Retire the Claude memory file**: delete
    `~/.claude/projects/C--Users-Kyle-work-Sogverse/memory/project_brand_guidebook_alignment.md`
    and its `MEMORY.md` index line — the final step of the whole alignment effort. By then
    every ruling it holds is codified in the repo (CLAUDE.md, the deviations log, ROADMAP,
    TODO, and the two plans' git history). Nothing brand-ruling-shaped remains in memory.
    (Repo-scoped memory is not chezmoi-managed — no capture or commit-and-push obligation
    applies to this deletion.)

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
(partner-approval dimension, step 4).

## Follow-ups (live and die with this plan unless the owner names them)

- **The categorical-labelling system**: a proper meaning-free multi-state palette now that
  pink/green/blue exist, and retirement of the yellow/black/purple gradient trick — owner
  is interested; explored informally in the scenes, but the app-wide redesign waits for
  what they teach.
- Crimson Pro for editorial/pull-quote moments.
- Lucide default `strokeWidth` 1.5 (Guidebook recommends ~1.5; app rides the 2px default).
- The email Poppins-first progressive font stack (pending the Guidebook author's answer).
