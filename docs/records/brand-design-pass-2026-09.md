# The dark-ground brand design pass

**Status: frozen record, 2026-09-01.** The story behind the palette, type and border
system the app wears now: what was wrong, the seven-month CSS bug the pass uncovered
halfway through, the census that scoped the corrections, and the full ledger of owner
directions in the order they were made — including the ones that were superseded, which
is most of why this file exists.

**Nothing here is a rule.** The law the pass produced lives in the root `CLAUDE.md`
Styling section (the shading rule, the colour grammar, the strength axis, the border
doctrine, the hover-colour principle, the audience colour budget, the role families) and
is guarded by two unit tests under `tests/unit/styling/`. Read those for what to do; read
this for why they say what they say, and to avoid reopening a question that was already
answered four different ways before it settled.

## The pass in brief

The app's four Yty-Element tokens were raw Tailwind defaults rather than the brand's
colours: harmony rendered green, glow rendered amber, valor rendered rose, wit rendered
violet. Two families were effectively swapped, and the glow stand-in collided with the
CTA amber. Beyond the tokens, the app had only amber and violet to work with and had
resorted to a yellow/black/purple gradient to invent colours whenever it needed to label
more than two states; the button set did not map to the Guidebook's; and Press Start 2P —
never a sanctioned face — sat on six headline surfaces.

The pass ran **UI first, then wiring**, on the owner's ruling: every change was drafted in
fixture-driven preview scenes and three temporary admin review decks, signed off from
those, and only then promoted onto live surfaces. The decks were deleted as their slides
were ruled; the last of them went with direction 36.

What shipped: the brand hues exactly, as strong/soft pairs; `--warning` retuned off amber
into orange; `--info` and `--success` converged onto wit-strong and glow-strong so no hue
carries two meanings; Press Start 2P removed entirely and every site re-set in Poppins at
the Guidebook's scale, with Space Mono placed at exactly two world-voice sites; a button
recipe carrying the Guidebook's CTA type, a neutral emphasis tier in place of the violet
fill, and four grammar fills; the tint ban executed across the app; and a border system
where an edge is neutral unless the border is itself the construct.

## The layer bug

**An unlayered universal `border-color` rule in `globals.css` had killed every
border-colour utility in the app since the initial commit.**

Tailwind 4 emits every utility inside `@layer utilities`, and unlayered CSS beats layered
CSS regardless of specificity. So the default border colour — declared on `*` at the top
level of the stylesheet, exactly as a reset is usually written — won against
`border-primary`, `border-destructive` and every `border-yty-*` in the codebase. Borders
rendered; they simply always rendered in the neutral default.

It surfaced during the sixth batch of walkthrough rulings, when an exhibit meant to show
three different border treatments rendered identically for the owner. The first
hypothesis was a stale build. It was not: the rule was found, the mechanism confirmed
against the served chunk, and the fix was one word — the same declaration wrapped in
`@layer base`, where it is the default a utility overrides rather than a rule no utility
can reach.

Three consequences shaped the rest of the pass:

- **Every coloured border in the codebase had been authored blind.** Roughly 150 coloured
  border instances across ten families existed in source, and nobody had ever seen one
  render. The owner's remark from an earlier batch — "I didn't even know these borders had
  color. It's so subtle I don't even see it" — and the checkbox row's invisible selected
  edge were both this bug rather than the subtlety they were read as.
- **Several exhibits had been ruled on partially-broken renders**, so the border question
  reopened on the fixed rendering (direction 31c) and eventually earned a deck of its own
  (direction 33).
- **The fix rode the branch rather than being cherry-picked to `dev`** — the owner's call
  and the session's recommendation both. Landing it alone would have surfaced every
  low-alpha mud edge in the live app at once, before the wiring pass corrected them; the
  resurrection and the corrections belonged in one release.

The rule now carries a comment saying why it must stay inside `@layer base`, and a unit
test asserts no universal `border-color` declaration sits outside a layer. A one-word
regression that produces no visible error and no failing build is exactly the class of bug
that earns a mechanism rather than a note.

## The census

Two read-only censuses scoped the corrections, both defined as regeneration commands
rather than frozen lists.

**The alpha census** swept `src/` (excluding preview scenes) for any brand family painted
at an alpha step, in any state prefix, on any colour-carrying property. It returned:
primary 70 instances; secondary 9 (mostly the sanctioned home gradients' tails plus a
hover darkening); the Yty families 52, of which 20 were the approved icon-accent recipe;
and — the intersection that mattered — **50 alpha uses of `info` and `success`, which
became shaded *brand* colour the moment those tokens converged onto wit and glow.** That
finding is what forced the convergence and the tint corrections into the same pass rather
than letting the token swap ship alone.

**The border census** ran the same command over border utilities across all ten colour
families: ~150 instances — border-primary 29 full plus ~20 tinted, functional statuses
(destructive/warning/info/success) ~40 mostly tinted, Yty ~20 tinted, border-foreground 6
full plus 15 tinted hovers.

A six-territory doctrine census ran alongside them, sweeping every surface against the
draft colour system. Its durable findings are the ones now stated as law: colour as
grammar, the strength axis, lifecycles as one hue stepped rather than a family per step,
and "the fact owns its tone" — a fact's colour decided once at the fact rather than per
surface.

The alpha census is now a unit test with a closed exemption list, which is the only form
in which a census outlives the session that ran it.

## The direction ledger

Owner rulings and directions, in the order made. Numbers are the plan file's; the
supersession chains are kept because several questions were answered more than once.

**1. The dark theme stays** (2026-08-24) — CTO preference: light-on-dark for contrast and
colour vibrancy. The goal was a dark interpretation of the Guidebook palette, not a white
one. The Guidebook's Appendix A concedes its visual rules yield to a dedicated visual
manual, and this pass was that work; it was flagged to the Guidebook's author for
ratification, and nothing in the pass waited on that verdict — the owner's ruling was the
operative authority, ratification ran in parallel, and any pushback returns through the
deviations log as new work.

**2. The Yty hues become the brand's, exactly**, as strong/soft pairs: Harmony `#F55B9A` /
`#FA7FA3` · Glow `#1AB061` / `#6AC66B` · Valor `#FD700D` / `#FF993D` · Wit `#3A71DE` /
`#4DB3F5`. Contrast against the dark ground was computed with code, never eyeballed.

**3. UI first, then wiring.** Scenes and the style guide carried the drafts; the owner
signed off from fixtures; promotion swapped the live bodies afterwards, per the
preview-scene rules.

**4. Buttons were restyled in the UI Components page** for review before any app-wide swap.
Primary = amber fill on dark ink (already matching). The Guidebook's Secondary — a 2px
`#121212` border on transparent — is invisible on our own `#121212` ground, so the
Guidebook's own "on dark backgrounds" button became the secondary-on-dark shape. CTA type
moved to Poppins 16px / SemiBold 600; the 4–8px radius suggestion was already met.

**5. Press Start 2P placements were reviewed one by one** against the then-standing "rare
and specialized" ruling, and **Space Mono was placed** as the in-platform display face
where it earned it. Both judged in the scenes.

**6. Nothing promoted without sign-off on the scene.**

**7. The question the pass answered**, in the owner's words: *can Sogverse be as fun,
colourful, bright and lively as the sog.gg marketing site while keeping the dark ground —
all while adhering to the Guidebook?* The walkthrough deck's cover carried it verbatim and
every slide was read as evidence toward it.

**8. The palette's reach is broad, not fenced to the Yty section.** The rationing
hypothesis settled on the permissive side: the home page is a marketing surface, so the
draft coloured the feature cards, the how-it-works circles and the hero glow as well. Two
doses were drawn — `brand-palette` (accents) and `brand-lively` (the marketing site's own
energy) — for the owner to pick between. Only the **calm ring** (billing, safeguarding,
legal), which the Guidebook keeps amber-only, was left open. *(Ruled in direction 27.)*

**9. The status tokens collided with the brand families, and convergence was raised.**
`--info` sat between wit-strong and wit-soft; `--success` sat beside glow-strong — the same
one-hue-two-meanings defect the pass opened with. `--warning` and `--destructive` were far
enough from valor and harmony to stay either way. *(Ruled in direction 25: converge.)*

**10. Colour becomes UI grammar, not decoration.** Each family carries one meaning, derived
from the elements themselves: amber = act, harmony = people, glow = growth, wit =
knowledge, valor = adventure; violet narrows to "the world" — lore, dusk, display — and
stops competing as grammar. The evidence put to the owner: violet meant five unrelated
things; the gedu role badge invented a colour out of a gradient; ten surfaces labelled
three or more states each.

**11. Brand-hue gradients are retired by default** — they "smear colours — we have a lot of
colours now, we don't need to smear anymore". Flat was therefore not a scenario but what
both home doses *were*. A gradient needed a case made for it site by site. Same-hue fades
to transparent are washes, not smears, and stayed. The role-badge gradient retired with the
grammar.

**12. The walkthrough deck renders real components inline — no iframes.** Each comparison
drew the live components with a link to the full preview scene or style-guide anchor
beside it, which is why the home page's four colour-bearing sections were temporarily
exported from its body: a sample that is the route's own code under a different palette
prop cannot drift from the page it shows.

**13. The grammar was drafted on the shop, My SOG and the family product page.** Each
surface was threaded where its body took props cleanly and drawn as a deck sample where it
did not. The proposed product-type mapping was camp = valor, consumer club = glow,
municipality club = wit, event = harmony. Buttons kept amber everywhere, because amber is
the act colour. *(Product-type colours ruled out of scope in direction 18.)*

**14. Typography was reviewed on its own page.** The type half was separable — no face
ruling waited on a colour decision — so it moved out of the walkthrough deck into its own
deck. All review pages were deleted before the branch merged.

**15. Three colour rulings** (2026-09-01): role-colour grammar counts as established only
if it appears outside admin UIs, so the sweep named the family-facing homes; the
product-type palette's type↔colour pairing stays an **admin-only** tool (~90% of families
only ever hold clubs, so parent surfaces do not colour by type); and **the home page was
parked into its own dedicated pass** — the owner was comfortable with the amber/violet
hero, and no home draft rode with the main review.

**16. Review pages show, they never tell** — codified as a rule in the root `CLAUDE.md`
UI-reference section, binding the style guide and preview scenes alike. "The console is
where you describe things, the review pages are where you show things."

**17. The doctrine and the census.** The owner set the pass's codification test — a fresh
session must be able to style a new page from the written rules alone — and a
six-territory read-only census swept every surface against the draft doctrine. Findings
and open seams were triaged with the owner before any wiring.

**18. Product-type colours stay as they are**, reversing the earlier convergence lean: the
admin type palette (cyan/magenta/lime/indigo) was placed 25–30° clear of the function
colours precisely so a category and a state stay legible in one dense row, and converging
onto brand families would land every type within 7–21° of a function colour it must sit
beside. The pairing is admin-only either way, so the brand-candy value of converging was
nil and the legibility cost real.

**19. The identicon is out of scope.** It needs work — every avatar is amber+violet
decoration, and a four-tertiary recolour is the ensemble rule's biggest equalizer — but it
gets its own pass. Nothing in this pass touched it. *(Kept as an owner-named follow-up.)*

**20. Press Start 2P retires app-wide**, superseding the rare-use exception: the
Guidebook's own type system replaces the invented face the same way the brand palette
replaced the invented colours. Typography is UI grammar — face = voice: Poppins is the app
speaking, Space Mono is Sogverse-the-world speaking, Crimson Pro the editorial voice
(parked until an editorial surface exists), plain mono the machine, Dancing Script
signature-only. Wiring was to unload the face and retire `--font-display` site by site,
never by repointing the token. *(Amended by 22, closed by 23.)*

**21. The ensemble rule.** Amber and violet stay the brand leads; the four tertiaries
(pink, green, blue, orange) should read as **equally represented** across the app, so
grammar frequency must not skew the showcase. Two halves: semantics trimmed where they
would flood, and free colour — decoration, identity, marketing — spent preferentially on
the under-represented families. *(The trim half was rejected in direction 26; the free-colour
half stands.)*

**22. The first typography ruling batch:**
- **Dancing Script is sanctioned, signature-only**, logged in the deviations file as an
  owner-approved exception scoped to signature lines and nothing else.
- **Crimson Pro is placed for editorial moments**, starting with the Princi-Pal pull quote
  on `/about`. *(Deferred to a follow-up rather than shipped in this pass.)*
- **CTA type follows the Guidebook**: Poppins 16px / SemiBold 600 / line-height 1 — one
  line in the shared button recipe, product-wide.
- **Heading weight is SemiBold 600**, replacing the habitual 700 across the app.
- **The world-voice recommendations are adopted**: the voice-room zone names and the
  profile selector's "Who is entering Sogverse?" go Space Mono; public-page lore stays
  Poppins as marketing copy.
- **Space Mono's reach is decided, not parked**: beyond those two, everything stays Poppins
  — role badge labels, dashboard section headings, and the dashboard section pill. The pill
  was ruled on the owner's direct question ("space is very limited there on mobile"): the
  mono's fixed 0.6em advance and the Guidebook pill spec's bold caps both spend width where
  the bar has none, and the parent dashboard's pills are children's *names* — user content
  that must not be re-cased or widened.
- **The profile-select mark is settled**: the typed Press Start 2P "SOG" stand-in was
  replaced by the header's drawn mark, non-clickable as before. Not a typeface decision.
- **Press Start 2P's retirement was reopened** — direction 20 amended, not executed. The
  owner was torn: "none of these fonts really give it the uniqueness it deserves." What
  stood regardless: the marketing-voice sites left the face on voice grounds, and
  profile-select was settled by artwork. All sites were to convert together in one change
  once ruled — no piecemeal conversion.

**23. Press Start 2P is removed entirely — everything converts to Poppins**, closing 22's
torn state and finishing 20: "let's replace all Press Start 2P with Poppins. We remove it
entirely out of the app (including OG images)." Consequences:
- All six sites re-set in Poppins at the Guidebook's scale for their heading level,
  including the **gamer greeting** (superseding its Space Mono draft) and the **admin
  all-clear title**. The pixel-art trophy sprite beside the all-clear is illustration, not
  type, and **stayed**.
- The profile-select header's typed "SOG" went with the face, replaced by the drawn mark.
- The `/roblox` hero's type swap needed **no fresh partner approval**: the partner rule
  governs placements of the Roblox *mark*, and re-setting our own heading above the
  already-approved lockup places the mark nowhere new. Its character-count scale arithmetic
  — valid only for a 1em-advance face — was rewritten with the swap.
- The face's loading, `--font-press-start-2p` and `--font-display` all retired; the
  deviations log's entry closed as retired; the root `CLAUDE.md`'s rare-use rule was
  deleted in the same change.
- **OG images were verified already clean**: the OG font pipeline fetches Poppins 400/600
  only, so "including OG images" needed no change.

**24. Home-deck notes and the highlight ruling:**
- **A brand colour exists in exactly its two authored variants — darkening it into a
  surface makes it a non-brand colour.** In the owner's words: "if we further darken the
  color as a surface it distorts that color, it is no longer a brand color"; confirmed
  against the live previews the same day — the tinted card grounds "warp our bright,
  vibrant colors into a muted dim washed out version". Applied at surface scale: the
  accented hero's 16% radial, the lively how-it-works band and both CTA-card washes were
  retired, grounds went neutral, and the brand arrived at authored strength. **Chip scale
  is a different construct and was ruled tinted**: a brand colour *accenting an icon* is
  not a colour painted as a card's ground. Solid tiles were ruled out first, then tinted
  won over neutral, with the owner's constraint as the boundary — tinted colours must never
  "escape into card surfaces".
- **The glow card-lift is dropped** ("let's drop the glow effect"), superseding the
  same-day edge-plus-inner-glow lean. Feature cards carry no family edge and no glow.
- **The feature-card dose is accented**; the lively variant died.
- **The closing CTA is today's card, exactly** — its amber→violet wash is the second
  sanctioned keep after the hero band.
- **How-it-works is accented, which completed the home pass.** Final shape: today's hero
  and closing CTA exactly, accented feature cards, palette how-it-works circles on a
  neutral band, all on the settled typography.
- **The hero is today's, exactly** ("let's keep the current yellow and purple gradient").
  The live amber→violet band and headline chunks stayed, drawn with the settled type; the
  band is the one sanctioned exception to the flat-gradient default and the watered-surface
  principle — a pre-existing identity moment kept, not a licence for new washes.
- **The highlight is ruled out entirely** ("it doesn't look good"): no marker stroke behind
  the hero's payoff words, anywhere in the pass. The payoff words keep glow as soft ink.
- **Audience note, recorded for the whole pass**: home and `/roblox` are where a family
  *first* experiences the product; after sign-in, home is effectively gone. Signed-in
  families live in About, the shop, My SOG and the family product page. The first-contact
  pair is tuned for recognition and recruitment; the signed-in four are where the grammar
  earns its keep day to day.

**25. Walkthrough rulings, first batch — colour and grammar:**
- **The strong/soft split is fine.** Wit-strong's 3.81:1 for body text on the card ground
  is handled by mechanism, not by retuning: wit's *text and ink* always use soft, and strong
  stays for fills, edges and swatches carrying no body text. The brand values do not move.
- **Colour-as-grammar agreed in principle** ("I agree with your reasoning") but not signed
  off until the owner saw practical examples from the app rather than abstract chips.
- **The shading rule — the watered-surface principle hardened to all scales**, stressed "to
  be codified": "If the brand colors are darkened or shaded past strong or soft, they are no
  longer our brand colors." **Scope ruling one, same day**, on seeing the checkbox row's
  checked state: tint grounds at card/row/surface scale are **bound** — "When using it as
  the background tint to provide an accent to an icon it's fine, but as the background of a
  card it's wrong. Not only that but `bg-primary/5` itself is an ugly yellowish brown
  highlight." Selection grounds, washed row/banner grounds and gradient washes became
  violations to correct; the chip-scale icon-accent tile stayed exempt.
- **`--warning` vs `--primary` was to be settled in this pass** — the owner had "never liked
  how close" they are and did not accept glyph discipline alone as the answer.
- **Role families approved**, plus a standing directive: **reinforce the role colours through
  the app wherever roles are understood, even where no explicit role label is present.**
- **Violet's replacement weight: violet out, the fill weight right, the colour open.** The
  owner questioned white ("White isn't a brand color so it's strange to see it here"). The
  recorded recommendation: neutral is correct *because* it is not a brand colour — every hue
  is committed to a meaning and this emphasis tier needs none.
- **Status colours ruled: converge** `--info` onto wit and `--success` onto glow at the
  token, no call-site changes, with the explicit instruction that `src/lib/constants/colors.ts`
  update in the same change so emails and OG images carry the converged values.
- **Buttons may take colour only where the action's meaning matches the family's grammar
  word** — offered for thoughts rather than ruled, with the proposed constraint set drawn on
  the deck for the next round.

**26. Walkthrough rulings, second batch — the full-deck sweep:**
- **Approved and settled**: the colour grammar as a whole ("I like all the colors.
  Approved" — all six families bind); lifecycles-one-hue-stepped; liveness-is-glow;
  time-is-wit; eligibility-one-colour; role families; the Yty element cards; the voice-zone
  tiles ("looks great"); the grammar in the wild.
- **`--warning` ruled: retune to the orange shift `#E2761B`** (hue 27.4°, Δ27.4 to primary,
  Δ15.2 to valor-strong). The owner weighed the valor proximity and accepted it: "I don't
  think it will get confused with valor… I think it's ok that it is closer to error which is
  red." The glyph-discipline rider stands: a warning mark always carries a glyph.
- **Violet's replacement weight ruled: the foreground fill.**
- **Buttons ruled: adopt the bold, colourful grammar fills — and usage is delegated** ("I
  leave it up to you how to use them in the app"). The session's constraint set therefore
  became the operative doctrine: a grammar fill only where the action *is* the family's
  word; never beside a primary CTA and never two in one view; ink pairings from the contrast
  table (wit fills soft with dark ink); destructive red untouched.
- **The ensemble trim is rejected.** Mechanical acknowledgements keep success green: "things
  that I would want to check my eye is working / confirmed / approved, and note is muted /
  natural / dismissive" — green is the affirmative register, muted reads dismissive. The
  consequence was accepted with it: after convergence, glow appears on confirmations too,
  and the ensemble rule's "hear glow least" ambition yields on this class.
- **Reconciliation flagged**: the approved lifecycle stepping is the *construct* stepping
  (outline → solid fill → tint), but the draft's pending chip carried dimmed ink, which the
  shading rule bans. Pending steps down by construct with full-value ink.
- **The strength axis's own third tier violated the tint-ground ruling** — the owner caught
  the selection samples' washes. The selection tier was corrected to solid edge plus
  transparent ground *(itself rejected in direction 27 and settled in 28)*.
- **"You are here" accepted in principle, blocked on contrast** — the neutral treatment
  dropped the selected/unselected clarity amber gave.
- **The shading slide reworked to show violations, not abstractions**; **the calm-ring slide
  failed its own show-don't-tell rule** ("Nothing to see so I can't rule on anything").
- **Product-page colour ideas**: colour arrives from families doing real jobs, not from
  eligibility — grammar buttons, time rows in wit, liveness glow, harmony on community facts.

**27. Walkthrough rulings, third batch — shading scope closed, two over-corrections caught:**
- **Shading scope closed per class**: dimmed brand ink — bound. Tinted label chips — bound,
  with `bg-muted` under family ink as the replacement. Washed grounds under full-value ink —
  bound. Hover darkening of the primary fill — bound ("these buttons don't need a 90%
  alpha"), with a non-colour hover affordance to replace it. Low-alpha edges and hover
  edge-lifts drew the observation "I didn't even know these borders had color. It's so subtle
  I don't even see it" — no ruling yet, since an invisible brand colour argues it was never
  doing brand work. *(That subtlety was the layer bug — see direction 30.)*
- **The trophy correction rejected as drawn** ("it loses its color. But maybe I need to see
  it in something real").
- **The selection state rejected in both its forms — the batch's real design problem.** On
  the edge-only tier: "the very thing you are engaging with loses its color after you've
  selected it." On the transparent selection ground: "aside from the checkbox itself there is
  no way to highlight that this whole box has been selected." A selected row must read
  *selected as a whole* and stay vibrant, without a shaded brand ground.
- **Gradient washes may be the one exception** — "a gradient on card, for example the product
  card in My SOG, gives it wanted attention beyond what only the Live label provides. Either
  you keep the gradient or you come up with ideas that keep the vibrancy without violating a
  shading rule."
- **"You are here" leans inverted fill** — "what I like most. But I'd need to see real
  example of the app to make the call."
- **The pages-in-scenes 360 framing retired** — the owner was right that the palette does not
  touch layout ("these colors should not impact mobile layout").
- **The calm ring is ruled: the palette comes in** — "Frankly I love all the extra colors."
  Billing, safeguarding and legal surfaces take the grammar where marks have jobs — status
  chips, dates, names — rather than amber-only. Logged as a Guidebook deviation.

**28. Walkthrough rulings, fourth batch:**
- **The selection state is ruled: brand edge plus neutral lift** (`border-primary bg-accent`)
  — "I like the 'Brand edge, neutral lift'. We can move forward with that." This settled the
  strength axis's third tier and bound the 22 selection-ground call sites.
- **The trophy is ruled, with a cleaner doctrine than the proposed art exemption: the
  sprite's gold is a trophy's gold, not the brand's amber.** "It shouldn't need an exception
  because it shouldn't be using brand colors. It's art." So artwork never references brand
  tokens at all, and the shading rule governs UI uses of the brand tokens only.
- **Edges: no visible difference between the three treatments at rest or at hover** —
  confirming the low-alpha edges did no brand work. *(Root cause found two batches later.)*
- **The gradient's problem is named: the wash, not the gradient** — "I would be more ok with
  the gradient if it didn't wash out our brand color." The candidates became full-value
  gradients travelling only between authored brand values.
- **"You are here" fact-check**: the amber active *fill* existed on exactly one surface, the
  admin sidebar; the header's nav marks the active link with amber *text* on every role.

**29. Walkthrough rulings, fifth batch:**
- **The gradient border is conditionally accepted, and the condition is the layout rule**:
  "so long as it doesn't shift the card's size or the layout of its content. Remember these
  cards update in real time when the session opens… if a parent or gamer is about to click
  join and as soon as the club opens up things shift, that would look bad." The mechanism
  that satisfies it by construction — the **ignition ring** — is a painted overlay inside the
  card's own bounds under the content, with the card's 1px border class surviving both states
  and only its colour swapped (with border-box sizing, dropping the class would shift the
  content box by 1px), and the Live chip mounting first in the right-packed trailing group so
  its arrival grows the group leftward into the title's slack. Ignition is a paint swap and
  may fade in via opacity.
- **The header's active nav link is ruled: the amber text stays.** The neutral alternative's
  grey-vs-white was "not enough contrast to see where a user currently is — parents will get
  lost". Amber there violates nothing: the you-are-here argument binds the *fill* tier, and
  the grammar lists links among amber's jobs.

**30. Walkthrough rulings, sixth batch:**
- **The ignition pair is approved** ("Yes looks identical. Approved.").
- **The admin sidebar's active item is ruled: the inverted fill** ("That's fine for the admin
  side panel"). With it, a **standing colour-budget principle**, in the owner's words:
  "Parent, gamer, and gedu surfaces deserve more color than admin surfaces in general."
- **The edge exhibit rendered identically — root-caused as an app-wide bug, not staleness.**
  See "The layer bug" above; the landing decision was to ride the branch.
- **The preview scenes were outdated against the rulings** ("The scenes are fine but now they
  look outdated on our rulings"), so the scenario drafts were re-cut to the ruled forms with
  the `current` palette path staying byte-identical.

**31. The edge question is ruled — then rescinded the same day.**
- As first ruled: **neutral at rest and neutral at hover.** Two facts settled it: "I have
  never noticed a colored border in our app in the past" — correct, and stronger than the
  owner knew, since the layer bug meant the *experienced* app never had brand edges at all —
  and "I thought that pattern has been we highlight a neutral color anyway", also correct,
  since the app's real hover idiom is the neutral lift.
- Three precision notes, same day: **(a)** "always neutral" carried the ruled exceptions
  where the border *is* the construct — the selected row's amber edge, the Live chip's glow
  edge, the icon-accent tile's edge, the ignition ring. **(b) Rings are not in the no-op
  class**: `ring-*` utilities draw with box-shadow rather than border-colour, so ring sites
  always rendered and were genuinely experienced; correcting one is a visible change decided
  per site, never swept. **(c) Superseded same day — the neutralization ruling is rescinded
  and the question reopens as a review.** On seeing coloured borders for the first time: "now
  that I see borders with color I am wondering if maybe we should keep them. I agree they
  shouldn't be tinted. But now I get to review them for the first time." What stood from 31:
  the tint ban — no shaded edge survives anywhere. What reopened: coloured-vs-neutral, per
  site. To make the review possible, the branch promoted every census border site from its
  alpha step to **full value**, showing the coloured-border world at authored strength.

**32. The border review's first findings:**
- The full-palette border census (~150 instances across ten families), every one authored
  blind.
- **Valor as a border colour: not great**, on first sighting.
- **The voice zones: the current zone's border takes the zone's own colour** — "should likely
  be the color of the zone itself", superseding both the resurrected white ring, which "hurts
  the glow effect", and a glow-only interim. The glow class already sets a colour custom
  property, so one arbitrary-value class edges every zone in its own colour; non-current
  zones stay neutral.
- **The zone icon/colour pickers' white selection ring was kept** as a usability repair:
  selected-vs-unselected in those mod-only pickers had been two dead border classes, so the
  selected state was literally indistinguishable until the layer fix, and an amber selection
  edge would fight the colour swatches being picked.
- **A finding for the owner: the approved icon-accent tile was approved with its edge dead.**
  The look approved during the home review was tint ground plus a quiet neutral edge; the
  tile's tinted edge had never rendered. *(Resolved in direction 36, in the other direction.)*

**33. The border colour review is ordered as its own deck**: "in general a colorful border
could enhance that vibrant look of the app I am going for… I think I need a border color
review. Because I agree, some place it just be neutral and some places it should be colored.
It depends on context." Built from the census grouped by *construct context* rather than by
colour, with full-value candidates drawn as real contenders rather than strawmen.
**Hover-colour principle, binding the review and general doctrine:** "a border that is only
colored on hover means it is only enhancing a desktop layout and has no impact on mobile…
considering how parents tend to use mobile more than desktop, we could be putting work into
an effect that won't be appreciated by one of our main audiences." So vibrancy spent only
behind hover never reaches the mobile-first family audience — where a border deserves colour,
it earns it *at rest*; hover stays functional feedback in the neutral idiom. Desktop-first
admin and gedu surfaces may still use hover colour where it earns its keep.

**33b. The border deck's format is ruled**: every construct renders in **three clear
columns** — as the app ships now (post-layer-fix), what will ship with the design updated,
and the neutral proposal where one is proposed. And **every border that appears or changes on
hover or focus gets an explicit, complete inventory** — the owner: "the real easy case to
miss" — one dedicated section enumerating all prefixed border sites, each drawn rest-beside-
hover with its source named.

**34. The first border-review crash, and the ruling it produced.** On My SOG, a live product
card's green state edge was fought by the amber hover border the moment the cursor landed —
"these are the kind of crashes that I couldn't have seen before because of the bug you
fixed." Ruling, derived from the owner's own hover principle: **a border that carries state
is never repainted by a hover; hover lifts on state-bearing cards go to the neutral gray
idiom.** The public browse cards and filter chips kept their amber hover for the moment,
carrying no state edge to fight, with their fate left to the border deck's hover slide.

**36. The border review is ruled in full — every slide, one sitting.** The deck deleted with
this direction and its classes became the conversion targets at wiring:
- **Hover, everywhere it appears** (the complete 31-utility census): state-bearing cards as
  ruled in 34; admin option rows and dashboard strips (13 sites) lose the gray hover border
  entirely, keeping the accent lift; shop browse cards drop all three prefixed brand
  utilities, resting neutral with a shadow on hover; shop filter chips rest on the input
  border with an accent hover and no colour class; dashed add affordances and the add-profile
  tile take the gray idiom, and the tile's washed brand ground — the hover census's only one —
  dies; the chat reaction pill's no-op hover border is deleted.
- **Profile tiles and rings, one ruling** ("I want to hover white here… the primary colored
  ring is not right"): active and hover rings go white at 4px, the rest ring goes neutral at
  2px, and the quiet ring marks (voice avatar, calendar today) go 1px neutral.
- **Form validation: full-value `border-destructive`** with destructive ink on the label. The
  first red error edge the app has ever shipped.
- **Status banners and alerts: full-value family edges on muted grounds**, the gedu notice
  keeping its heavier weight. Every status tint resolves *up* to full value, including the 50
  info/success alpha uses the convergence owned.
- **Outline chips and badges: split by whether the badge has a ground.** No filled ground →
  coloured edge (the edge is most of the chip's area and does the work). With a ground →
  neutral edge, the tone carried by ground and ink.
- **Yty accent tiles: the full-value family edge** over the tint ground. The owner chose the
  coloured column knowingly — "the border is colored. I want the icon's border to have color"
  — superseding direction 32's neutral recommendation; the earlier valor complaint had been
  about the tinted mud, not the family colour at authored value. The tile's final form: tint
  ground, full-value family edge, soft glyph.
- **Card edges at rest: neutral** — the gedu assignment live card's edge and wash go (liveness
  stays on its chip, with the ignition ring adopted there as the consistent treatment), the
  admin week-row today marker goes neutral edge on an accent ground, and the chat quote bar
  goes a neutral 2px left rule.

*(There is no direction 35: the ledger skipped the number as it was written.)*

**37. The three page sign-offs land — the review phase is complete** ("The scenes look
good."). My SOG, the family product page and the gamer dashboard were signed off as drafted
from their scenes. Every ruling the pass needed had been made; what followed was the wiring
spec and its execution.

## Two surfaces moved under the pass

Rebasing the branch onto a `dev` that had landed the About and help restructures moved two
of the surfaces the plan was written around. **The home page no longer hosts the Yty
section** — the elements section lives on the public About route — and **the gamer dashboard
no longer has a Yty grid**; it was a decorative tiling of the four elements over a feature
that did nothing, and the Help section took its slot. The element colour map's consumers are
therefore three, not five: the About elements section, the Yty-named voice zones, and the
style guide. One knock-on: the map's gradient slot lost its only renderer and was dropped at
promotion, taking the five-slot shape down to four.
