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
   `brand-lively` (the marketing site's own energy: no ambient amber at all, a glow-green
   marker stroke behind the headline's payoff words, fuller washes, a tinted band, palette
   rules under section headings) — and the owner picks the dose from the scenes. Both are
   drawn flat; see direction 11. Only the **calm ring** (billing, safeguarding, legal), which the Guidebook
   keeps amber-only, is still an open ruling.
9. **The status tokens collide with the brand families, and convergence is raised for
   ruling.** `--info` (#308CE8) sits between wit-strong #3A71DE and wit-soft #4DB3F5;
   `--success` (#2EB88A) sits beside glow-strong #1AB061 — the same one-hue-two-meanings
   defect this plan opened with. The deck asks: converge (info → wit, success → glow),
   keep both, or defer to the categorical-labelling follow-up. `--warning` and
   `--destructive` are far enough from valor and harmony to stay either way. **If the
   owner rules to converge, step 6's wiring scope gains the two status-token values**, in
   the same commit as the Yty tokens — both are tokens, so no call site changes.
10. **Colour becomes UI grammar, not decoration** (owner direction, 2026-08-31). Each
    family carries one meaning, derived from the elements themselves: amber = act (CTAs,
    links, the mark), harmony = people, glow = growth, wit = knowledge, valor =
    adventure; violet narrows to "the world" — lore, dusk, display — and stops competing
    as grammar. The walkthrough's grammar slide carries the evidence (violet means five
    unrelated things today; the gedu role badge invents a colour out of a gradient; ten
    surfaces label three or more states each) and asks four rulings — adopt the grammar,
    narrow violet, give role badges real families, converge or keep the product-type
    palette. All four are pending; the adopted ones are codified in the root `CLAUDE.md`
    at wiring.
11. **Brand-hue gradients are retired by default** (owner direction, 2026-08-31, hardened
    the same day): they "smear colours — we have a lot of colours now, we don't need to
    smear anymore". Flat is therefore not a scenario but what both home doses *are*; the
    fourth scenario that drew the flat comparison is gone, and its treatment is now the
    lively dose. A gradient needs a case made for it site by site, and exactly one
    candidate has one — the dusk hero, which imitates the brand's own social imagery
    rather than mixing two hues for want of a third. The deck's gradient slide holds it
    as an exhibit-only class set handed to the real hero component, and asks: keep it as
    the sole sanctioned gradient, or go fully flat. Same-hue fades to transparent are
    washes, not smears, and stay. The role-badge gradient retires with the grammar.
12. **The walkthrough deck renders real components inline — no iframes** (owner
    direction, 2026-08-31). Each comparison draws the live components with a link to the
    full preview scene or style-guide anchor beside it, which is why the home page's four
    colour-bearing sections are exported from its body: a sample is the route's own code
    under a different palette prop and cannot drift from the page it shows.
13. **The grammar is drafted on the shop, My SOG and the family product page** (owner
    direction, 2026-08-31). Each surface is threaded where its body takes props cleanly
    and drawn as a deck sample where it does not: My SOG is threaded (a `brand-palette`
    scenario on the parent-dashboard scene, the palette handed to the enrollment cards),
    while the shop and the family product page are deck samples built from the real class
    maps — the public browse card carries no product-type mark at all today, so threading
    there would mean adding an element to a live component for a draft's benefit. The
    proposed product-type mapping is camp = valor, consumer club = glow, municipality club
    = wit, event = harmony; the deck names the trade against the deliberately-separate
    categorical palette and leaves the ruling with the owner. Buttons keep amber
    everywhere, because amber is the act colour.
14. **Typography is reviewed on its own page** (owner direction, 2026-09-01): the type half
    is separable — no face ruling waits on a colour decision — so it moved out of the
    walkthrough deck into `/admin/design-pass-typography` (one slide per Press Start 2P
    site, the greeting's face and size, CTA type, Space Mono's reach), and its ten rulings
    are tracked there. Each comparison has exactly one home across the decks (slide and
    ruling counts live on the decks themselves, not here — they move too fast for prose).
    **All review pages are deleted before this branch merges.**
15. **Three colour rulings** (owner, 2026-09-01): role-colour grammar is only established
    if it appears outside admin UIs — the sweep names the family-facing homes; the
    product-type palette converges onto the brand families but the type↔colour pairing
    remains an **admin-only** tool (~90% of families only ever hold clubs, so parent
    surfaces do not colour by type); and **the home page is parked into its own dedicated
    pass** — the owner is comfortable with the current amber/violet hero, its gradient is
    a live option there, and no home draft rides with the main review.
16. **Review pages show, they never tell** (owner, 2026-09-01) — codified as a rule in the
    root `CLAUDE.md` UI-reference section, binding the style guide and preview scenes; the
    two temp decks were rewritten to it. "The console is where you describe things, the
    review pages are where you show things."
17. **The doctrine and the census** (2026-09-01): the owner set the pass's codification
    test — a fresh session must be able to style a new page from the written rules alone —
    and a six-territory read-only census swept every surface against the draft doctrine
    (rings: calm / family story / full palette; function → grammar → decoration). Census
    findings and the doctrine's open seams are triaged with the owner before any wiring.
18. **Product-type colours stay as they are** (owner, 2026-09-01 — reversing the earlier
    convergence lean): the admin type palette (cyan/magenta/lime/indigo) was placed 25–30°
    clear of the function colours precisely so a category and a state stay legible in one
    dense row, and converging onto brand families lands every type within 7–21° of a
    function colour it must sit beside. The pairing is admin-only either way, so the
    brand-candy value of converging is nil and the legibility cost is real. The type
    palette is out of this pass's scope.
19. **The identicon is out of scope** (owner, 2026-09-01): it needs work — every avatar is
    amber+violet decoration, and a four-tertiary recolour is the ensemble rule's biggest
    equalizer — but it gets **its own pass another time**; nothing in this pass touches it.
20. **Press Start 2P retires app-wide** (owner, 2026-09-01, superseding the rare-use
    exception): the Guidebook's own type system replaces the invented face the same way
    the brand palette replaced the invented colours. Typography is UI grammar — face =
    voice: Poppins is the app speaking (trust register, all UI and marketing), Space Mono
    is Sogverse-the-world speaking (in-platform display moments), Crimson Pro the
    editorial voice (parked until an editorial surface exists), plain mono the machine,
    Dancing Script signature-only pending its own ruling. Per-site replacements are
    reviewed on the typography deck; the /roblox hero's replacement additionally keeps
    its partner gate (it sits above the approved lockup — owner's explicit go, and
    partner review if he judges it needed); the home hero's Poppins variant is drafted
    in the home pass. Wiring unloads the face and retires `--font-display` deliberately,
    site by site — never by repointing the token. The deviations log's Press Start 2P
    entry closes as "retired" when the wiring lands.
21. **The ensemble rule** (owner, 2026-09-01): amber and violet stay the brand leads; the
    four tertiaries (pink, green, blue, orange) should read as **equally represented**
    across the app in general, so grammar frequency must not skew the showcase. Two
    halves: semantics are trimmed where they would flood (mechanical acknowledgements —
    copied/saved/sent — stop converging into glow green; glow is reserved for domain
    facts: progress, achievement, presence, liveness), and free colour (decoration,
    identity, marketing) is spent preferentially on the under-represented families —
    when colour is free, pick the family the surface hears least.
22. **The first typography ruling batch** (owner, 2026-09-01, from the typography deck):
    - **Dancing Script is sanctioned, signature-only.** Wiring logs it in the deviations
      file as an owner-approved exception scoped to signature lines and nothing else.
    - **Crimson Pro is placed for editorial moments**, starting with /about's Princi-Pal
      pull quote (upright, one step larger than the sans it replaces — the deck's
      treatment). It becomes a loaded face at wiring time, on the same `next/font`
      rules as the others.
    - **CTA type follows the Guidebook**: A.3's CTA row is Poppins 16px / SemiBold 600 /
      line-height 1 — adopted; the one-line change in the shared button recipe carries it
      product-wide.
    - **Heading weight is SemiBold 600** per the Guidebook's scale, replacing the habitual
      700 across the app's headings.
    - **The world-voice recommendations are adopted**: the voice-room zone names and
      /select-profile's "Who is entering Sogverse?" go Space Mono; the public-page lore
      stays Poppins as marketing copy.
    - **Space Mono's reach is decided, not parked** (the owner rejected the park): beyond
      the world-voice census above, everything stays Poppins — role badge labels, the
      dashboard section headings, and the dashboard section pill. The pill was ruled on
      the owner's direct question ("space is very limited there on mobile"): it keeps
      Poppins at its current small type, because the mono's fixed 0.6em advance and the
      Guidebook pill spec's bold caps both spend width exactly where the bar has none —
      it horizontally scrolls on phones already — and the parent dashboard's pills are
      children's *names*, user content that must not be re-cased or widened.
    - **The profile-select mark is settled and dropped from the review**: the typed
      Press Start 2P "SOG" stand-in (still live on dev — checked 2026-09-01) is replaced
      by the header's drawn mark at wiring, non-clickable as today. Not a typeface
      decision; its deck slide is deleted.
    - **Press Start 2P's retirement is reopened — direction 20 is amended, not
      executed.** The owner is torn: "none of these fonts really give it the uniqueness
      it deserves." What stands regardless of the outcome: the marketing-voice sites
      (home hero, /roblox, call-ended screen) leave the face on voice grounds, and
      profile-select is settled by artwork — so the live question is only the two
      in-world playful sites, the gamer greeting and the admin all-clear (keep under the
      standing rare-use exception, or convert). **All current Press Start 2P sites
      convert together in one wiring change once this is ruled** — no piecemeal
      conversion. Until the ruling, `--font-display` and the face's load stay.
23. **Press Start 2P is removed entirely — everything converts to Poppins** (owner,
    2026-09-01, closing direction 22's torn state and finishing direction 20): "let's
    replace all Press Start 2P with Poppins. We remove it entirely out of the app
    (including OG images)." Consequences, all wiring items in one change:
    - All six sites re-set in Poppins at the Guidebook's scale for their heading level —
      including the **gamer greeting**, which supersedes its Space Mono draft, and the
      **admin all-clear title**. The pixel-art trophy sprite beside the all-clear is
      illustration, not type, and **stays** unless the owner says otherwise (the ruling
      names the font; removing the sprite too would leave the state bare — reversible
      either way).
    - The profile-select header's typed "SOG" goes with the face, replaced by the drawn
      mark (direction 22). Verified against origin/dev 2026-09-01: `SelectProfileHeader`
      still renders the `font-display` span there — the *main* header has no pixel font,
      which is what makes the stand-in look outdated; this is the select-profile page's
      simplified header only.
    - The `/roblox` hero's type swap needs **no fresh partner approval**: the partner
      rule governs placements of the Roblox *mark*, and re-setting our own heading above
      the already-approved lockup places the mark nowhere new. Its character-count scale
      arithmetic (valid only for a 1em-advance face) is rewritten with the swap.
    - The `Press_Start_2P` load, `--font-press-start-2p`, and `--font-display` all
      retire; the tracking-tight and greeting-size rulings are moot; the deviations
      log's Press Start 2P entry closes as "retired", and the root CLAUDE.md's rare-use
      rule for the face is deleted in the same wiring change.
    - **OG images verified already clean**: the OG font pipeline fetches Poppins 400/600
      only, so "including OG images" is satisfied with no change.
24. **Home-deck notes and the highlight ruling** (owner, 2026-09-01):
    - **A brand colour exists in exactly its two authored variants — darkening it into a
      surface makes it a non-brand colour.** Strong and soft are the palette; a surface
      manufactured by darkening the hue further (which is what a low-alpha wash over the
      near-black ground composites to) distorts the colour, and what it shows is no
      longer the brand. Owner's words: "if we further darken the color as a surface it
      distorts that color, it is no longer a brand color." Standing principle for the
      whole pass, **confirmed against the live previews** (owner, 2026-09-01, second
      message: the tinted card grounds "warp our bright, vibrant colors into a muted
      dim washed out version"). Applied at surface scale in the home drafts: the
      accented hero's 16% radial, the lively how-it-works band, and both CTA-card
      washes are retired — grounds go neutral (`background`/`card`/`muted`) and the
      brand arrives at authored strength (solid fills, solid edges, ink; the CTA cards
      take a solid brand edge on a neutral card — later superseded for the closing
      CTA, see below). **Chip scale is a different construct and is ruled: tinted**
      (owner, 2026-09-01): a brand colour *accenting an icon* — the voice-zone tiles'
      effect, which the owner likes — is not a colour painted as a card's ground.
      Solid tiles were ruled out first (a solid re-cut read "off"), then tinted won
      over neutral, with the owner's constraint stated as the boundary: tinted
      colours must never "escape into card surfaces". The colour grammar's tint step
      (badge grounds at low alpha) gets re-examined on the walkthrough deck with the
      same principle in hand — the tile ruling is its precedent.
    - **The glow card-lift is dropped** (owner, 2026-09-01: "let's drop the glow
      effect", superseding the same-day edge+inner-glow lean). Feature cards carry
      no family edge and no glow: neutral `card` ground, tinted tile, soft glyph.
      `.zone-glow` stays a voice-zone treatment and nothing else.
    - **The feature-card dose is ruled: accented** (owner, 2026-09-01). The lively
      variant (family card edges at /25, tiles tinted twice as strong, a rule under
      the features heading) is dead; both scenarios render the ruled set, the
      features section draws no palette rule in any dose, and `sectionRule` remains
      a slot only for the still-open how-it-works section.
    - **The closing CTA is ruled: today's card, exactly** (owner, 2026-09-01). Its
      amber→violet wash is the second sanctioned keep after the hero band; the
      solid-edge draft dies, and only the settled type differs from live.
    - **How-it-works is ruled accented, which completes the home pass** (owner,
      2026-09-01: "with the design-pass-home settled" — accented was both his page
      ruling and the recommendation; the lively dose's last construct, the harmony
      rule under the heading, dies with it). The home page's final shape: today's
      hero and closing CTA exactly, accented feature cards (tinted tiles, soft
      glyphs, neutral card grounds, no glow, no family edges), palette how-it-works
      circles on a neutral band, all on the settled typography. The lively scenario
      is retired from the scene registry (its slug still resolves, rendering the
      ruled dose), the home deck page is **deleted** — every slide settled — and the
      home scene's two remaining scenarios are today vs the ruled dose, kept for the
      wiring phase's before/after.
    - **The hero is settled: today's, exactly** (owner, 2026-09-01: "let's keep the
      current yellow and purple gradient"). The live amber→violet band and the live
      amber/violet headline chunks stay, drawn with the settled Poppins type; the band
      is the one sanctioned exception to the flat-gradient default and the
      watered-surface principle — a pre-existing identity moment the owner keeps, not
      a licence for new washes. The dusk-sky exhibit and the two draft heroes are
      dead; the deck's hero slide is dropped as settled, and both dose scenarios
      render today's hero so the full-page previews match the ruling.
    - **The highlight is ruled out entirely** ("it doesn't look good"): the glow-green
      marker stroke behind the hero's payoff words leaves the lively dose and its
      close-up slide leaves the deck; the payoff words keep glow as soft *ink* instead
      (8.83:1 on the page ground). No highlight/marker treatment anywhere in the pass.
    - **Audience note, recorded for the whole pass**: Home and /roblox are where a
      family *first* experiences the product — after sign-in, Home is effectively gone
      (the header mark routes every signed-in role to its own dashboard). Signed-in
      families live in About, the Shop, My SOG and the family product page, reading
      reports and reviewing sessions. Design attention and colour budget weigh
      accordingly: the first-contact pair is tuned for recognition and recruitment;
      the signed-in four are where the grammar earns its keep day to day.

25. **Walkthrough rulings, first batch — colour & grammar** (owner, 2026-09-01):
    - **The strong/soft split is ruled fine.** The wit-strong flag (3.81:1 for body
      text on the card ground) is handled by mechanism, not by retuning: wit's *text
      and ink* always use soft (the element cards, the gedu badge already do), and
      strong stays for fills, edges and swatches that carry no body text. The brand
      values themselves do not move. Slide dropped as settled.
    - **Colour-as-grammar is agreed in principle** ("I agree with your reasoning")
      but not signed off: the owner wants **practical examples from the app**, not
      abstract chips, before the vocabulary binds. Deck extended with real-construct
      samples per family.
    - **The shading rule — the watered-surface principle hardened to all scales**
      (owner, stressed "to be codified"): "If the brand colors are darkened or shaded
      past strong or soft, they are no longer our brand colors." To codify as a
      standing rule (root `CLAUDE.md` at wiring), with the review decks updated to
      comply. The owner sees **many existing violations for `--primary`** and wants
      them corrected — a census of primary-at-off-values across `src/` feeds the
      wiring phase. Open scope questions to render for ruling rather than guess:
      hover-state darkening (`hover:bg-primary/90`), tint grounds under full-value
      ink (`bg-primary/20 text-primary` chips — the approved icon-tile precedent
      sits on this line), and low-alpha edges (the strength axis's third tier).
      **Scope ruling one, same day (owner, on seeing the checkbox row's checked
      state): tint grounds at card/row/surface scale are BOUND.** "When using it
      as the background tint to provide an accent to an icon it's fine, but as
      the background of a card it's wrong. Not only that but bg-primary/5 itself
      is an ugly yellowish brown highlight." So: selection grounds (22), washed
      row/banner grounds, and gradient washes are violations to correct at
      wiring (the two sanctioned home keeps — hero band, closing-CTA wash —
      stay, as already ruled); the chip-scale icon-accent tile stays exempt,
      consistent with the home tile ruling. Still open: tinted label chips
      (neither an icon accent nor a card), low-alpha edges, hover
      darkening/lifts. **Full-palette census** (2026-09-01, same regeneration
      command per family): primary 70, secondary 9 (mostly the sanctioned home
      gradients' tails plus `hover:bg-secondary/80`), yty families 52 (20 of
      which are the approved icon-accent recipe), and — the wiring intersection
      — **info+success carry 50 alpha uses that become shaded brand colour the
      moment those tokens converge onto wit/glow**, so the convergence change
      must resolve them under this rule, not merely swap hex values.
    - **`--warning` vs `--primary` is to be *settled in this pass*** — the owner has
      "never liked how close" they are and did not accept mere glyph-discipline as
      the answer ("I don't know how to get around this... this design pass is the
      place to settle this once and for all"). Deck extended with retune candidates
      drawn in the admin attention-panel exhibit, distances to primary *and*
      valor-strong annotated (orange-shifted candidates risk the valor collision).
    - **Role families are ruled approved**, plus a standing directive: **reinforce
      the role colours through the app wherever roles are understood, even where no
      explicit role label is present** — a wiring-phase direction, not a deck one.
      Slide dropped as settled.
    - **Violet's replacement weight: violet is ruled out; the fill *weight* is ruled
      right; the colour is open.** The owner questions white ("White isn't a brand
      color so it's strange to see it here"). Session recommendation, recorded:
      neutral is correct *because* it is not a brand colour — every hue is now
      committed to a meaning, and this emphasis tier needs no meaning; the
      foreground fill is the app's own ink at fill weight, not a new colour. Deck
      renders a brand-hue candidate beside the neutrals so the comparison is seen,
      not asserted.
    - **Status colours are ruled: option A** — converge `--info` onto wit and
      `--success` onto glow at the token, no call-site changes. Owner's explicit
      instruction riding with it: **`src/lib/constants/colors.ts` must be updated in
      the same wiring change**, so emails and OG images carry the converged values.
      Slide dropped as settled.
    - **Buttons may take colour only where the action's meaning matches the
      family's grammar word** — the owner's framing, offered for thoughts rather
      than ruled. Session position rendered on the deck for next round: grammar
      fills are plausible but must not break amber's act-monopoly on a surface —
      proposed constraint set: a grammar-coloured button only where the action *is*
      the family's word, never two grammar fills in one view, ink pairings from the
      contrast table (fills needing dark ink use soft), destructive red untouched.

26. **Walkthrough rulings, second batch — the full-deck sweep** (owner, 2026-09-01):
    - **Approved and settled, slides dropped:** the colour grammar as a whole ("I
      like all the colors. Approved" — the vocabulary binds, all six families);
      lifecycles-one-hue-stepped ("looks good", with a compliance reconciliation
      below); liveness-is-glow; time-is-wit; eligibility-one-colour (in principle
      — see the product-colour note); role families (batch 1); the Yty element
      cards ("sign off"); the voice-zone tiles ("looks great"); the grammar in
      the wild ("I like it" — My SOG's own sign-off happens from the preview
      scene, which he looks forward to).
    - **`--warning` is RULED: retune to the orange shift `#E2761B`** (hue 27.4°,
      Δ27.4 to primary, Δ15.2 to valor-strong — the owner weighed the valor
      proximity and accepts it: "I don't think it will get confused with valor…
      I think it's ok that it is closer to error which is red"). Wiring: the
      `--warning` token retunes, `src/lib/constants/colors.ts` follows, the
      glyph-discipline rider (a warning mark always carries a glyph) stands.
    - **Violet's replacement weight is RULED: the foreground fill.** The owner's
      follow-on question — do buttons take different brand colours by action? —
      answered yes: that is exactly the buttons proposal, which he then ruled.
    - **Buttons are RULED: adopt the bold, colourful grammar fills — and usage
      is delegated** ("I leave it up to you how to use them in the app"). The
      session's constraint set is therefore the operative doctrine at wiring: a
      grammar fill only where the action *is* the family's word; never beside a
      primary CTA and never two grammar fills in one view; ink pairings from the
      contrast table (wit fills soft with dark ink); destructive red untouched.
    - **The ensemble trim is REJECTED.** Mechanical acknowledgements keep
      success green: "things that I would want to check my eye is working /
      confirmed / approved, and note is muted / natural / dismissive" — green is
      the affirmative register, muted reads dismissive. Consequence accepted
      with it: after the status convergence, glow appears on confirmations too;
      the ensemble rule's "hear glow least" ambition yields on this class.
    - **Reconciliation the lifecycle approval needs (session, flagged):** the
      approved stepping is the *construct* stepping (outline → solid fill →
      tint), but the draft's pending chip carried `text-primary/80` dimmed ink,
      which the shading rule bans. Pending steps down by construct with
      full-value ink; the completed tint chip finalizes with the still-open
      chip ruling.
    - **The strength axis's own third tier violated the tint-ground ruling**
      (owner caught it: the "Every week" selection samples carried `/5` washes).
      The proposal's selection tier is corrected to solid edge + transparent
      ground; the app-as-shipped row keeps quoting the wash because it *is* the
      census violation. The label tier (tinted chip) is annotated as pending the
      chip ruling.
    - **"You are here" is accepted in principle, blocked on contrast** — the
      neutral treatment dropped the selected/unselected clarity amber gave.
      Deck reworked with stronger neutral candidates (the inverted foreground
      fill the owner just chose as the emphasis tier is the lead candidate).
    - **The shading slide is reworked to show violations, not abstractions** —
      the owner wants the app's real violating constructs beside the suggested
      replacement, not generic shapes.
    - **The calm ring failed its own show-don't-tell rule** ("Nothing to see so
      I can't rule on anything") — reworked to render a billing/safeguarding
      surface amber-only beside the same surface with palette leakage.
    - **Still open:** the gamer-dashboard-at-360 sign-off (the owner asked what
      the slide is for — it is a link hub to judge the mobile-first floor in a
      phone-sized window, since a breakpoint reads the window, not a box);
      tinted label chips; low-alpha edges; hover darkening/lifts; the calm
      ring; you-are-here's treatment; My SOG + family product page from the
      preview scenes.
    - **Product-page colour ideas** (the owner's ask on eligibility): colour
      arrives from families doing real jobs, not from eligibility — grammar
      buttons (a valor "Book the camp"), time rows in wit, liveness glow
      ("live now" / "starts soon"), harmony on community facts (spots, friends
      attending) — composed on the family product page scene for sign-off.
    - **Confirmed already tracked:** the gamer dashboard's Yty grid removal on
      dev is in this plan's surface-map revision; element-card consumers are
      the `/about` section, the voice zones and the style guide.

**Surface map revised (2026-09-01).** Rebasing this branch onto a `dev` that landed the
About restructure and the help restructure moved two of the surfaces this plan was written
around, so the map in **Problem** and step 6's consumer list both shrink:

- **The home page no longer hosts the Yty section.** The elements section and the About
  copy live on the public `/about` route, which the header points every reader at; the home
  page keeps the hero, the feature cards, how-it-works and the closing CTA, and offers
  About from a hero button. `/about` is not a preview scene and does not get one — its
  elements section takes a `palette` prop that nothing passes, and the draft is judged from
  the walkthrough deck's inline element-card samples, drawn from the same colour maps that
  section reads. The home scene's three scenarios are therefore the *dose* question only.
- **The gamer dashboard no longer has a Yty grid.** It was a decorative tiling of the four
  elements over a feature that does nothing, and the Help section took its slot. The gamer
  draft's scope is now the enrollment-card colour grammar plus the greeting's face swap,
  which is what its `brand-palette` scenario and the deck's gamer slide show; the deck's
  rebuilt grid sample is deleted rather than relabelled, because it depicted a surface that
  no longer exists.
- **Step 6's consumer list is three, not five**: the `/about` elements section, the
  Yty-named voice zones, and the style guide's swatches and fixtures. One knock-on worth
  knowing at wiring: the colour map's `bgGradient` slot now has no renderer at all — the
  deleted grid was its only one — so promotion decides whether the five-slot shape keeps it.

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
