# Theme adoption rulings

Temporary. The ledger for the owner's rulings on the questions the ruling page
(`/ruling` in the demo) puts on screen. One entry per question. The owner rules in
shorthand, in rounds; each ruling is recorded here in full; the implementation
that moves the approved tokens into the library reads this file, not the
conversation that produced it. Deleted, with the page, when every entry below
has landed in library code and the demo's living floors show the result.

Status values: `open` · `ruled` · `landed`.

## Standing decisions (already made, not re-opened here)

- Sogverse may not define a colour. Every colour it uses is in SOG-UI or is replaced
  by one that is; a colour it defines but does not use is deleted.
- A token Sogverse spends is a token with a consumer: it may enter the library now,
  ahead of the component that will one day own it.
- **This branch is colour only.** Faces and headings are out of scope: Press Start 2P
  and Sogverse's `--font-display` stay as they are, no heading changes, and the type
  scale tokens the theme ships stay unconsumed. The root layout still defines every
  face variable the library names (the theme import requires it), and that is the
  whole of the face work here. Dropping Press Start 2P and placing the SOG-UI faces
  is a later adoption.
- Borders: everything the owner saw before the border fix is correct. Every
  border-colour utility the unlayered default hid is deleted, `border-transparent`
  included; the universal default itself is removed and every bordered element
  names its edge; anything that looked intentional is unseen and returns only
  after it is seen in context.
- **The signature pair is named by meaning: `act` (amber) and `world` (violet).** `primary`
  and `secondary` are retired everywhere — the library keys, the generated tokens, the
  contrast ledger, the email mirror and every Sogverse spelling — because a token named
  by role is a meaning a component can take, and "secondary" told a developer the loudest
  colour we own was the quiet option.
- The Lynx Educate cyan in the OG marks is a partner's mark colour and never enters
  the palette.

## 1. The inventory — renames and admissions

**Asked:** the second-name tokens are renamed to the library token with no visual
change; `muted` and `accent` are admitted as neutrals.

**Ruling (2026-09-05):** _landed_ — the page's verdicts for the "Neutrals and the
signature pair" table are accepted as shown:

| token | today | verdict |
|---|---|---|
| background, foreground, card, muted-foreground, border, primary, primary-foreground, secondary, secondary-foreground | as today | **keep** (the library's, byte-identical; Sogverse declares none of them) |
| muted | #262626 | **admit** to the library as a neutral |
| accent | #212121 | **admit** to the library as a neutral (the hover-visibility question stays in §4) |
| card-foreground, accent-foreground, popover-foreground | #EDEDED | **rename → foreground** at every Sogverse call site. (The library goes on generating `card-foreground` as the card's companion under the surface contract; Sogverse simply declares nothing.) |
| popover | #1A1A1A | **rename → card** |
| input | #333333 | **rename → border** |
| ring | #FAA901 | **rename → primary** |
| sidebar-* (all seven) | — | **delete** — see §4 |

A rename is a class-string substitution with no visual change; each was drawn twice
from one recipe on the page and the eye confirmed it.

## 2. The four Yty families

**Asked:** the library's strong/soft hues replace today's four; the element card and
the zone tile take the no-alpha recipe (neutral ground, strong edge, soft ink, strong
ring) shown in the proposed column. Three columns drawn: today as rendered (grey
edge), today as authored (never rendered), proposed.

**Ruling (2026-09-05), tokens only:** _landed_ — clear-cut from the Guidebook, no
decision needed: **the eight tokens, four strong and four soft, exactly as the library
ships them** (`yty-{harmony,glow,valor,wit}-{strong,soft}`). Sogverse's four
single-value `--color-yty-*` are deleted. The email mirror already reads the soft
variant.

**Still open — the recipe.** How the element card, the zone tile and every other Yty
consumer spend the pair (today's alpha steps `bg-yty-x/10`, `from/10 to/5`,
`border/30` versus the no-alpha recipe of neutral ground, strong edge, soft ink, strong
ring) needs its own attention and is ruled separately. Until then the consumers keep
their current class shapes pointed at the new tokens in whatever way changes the least,
and the section stays on the page with the recipe as its remaining question.

**Where the recipe is now drawn (2026-09-06): in the status section, not here.** The
recipe has two halves and they turned out to be two questions. Whether a *ground* may
be a tint of the hue is what section 1's two consumers show, and that stays here.
Whether **area takes strong and ink takes soft, or the other way round**, needs every
hue against every construct at once, and the status ruling forced it onto the page:
success is Glow and info is Wit, so half the status palette is a brand pair and every
status construct runs into the question on its first line. So section 2 carries a grid —
six hues (the four families plus destructive and warning) × six constructs (fill under
a label, edge, ring, unlabelled mark, ink, glyph), each drawn under the proposed
direction with the inverted direction directly beneath it — and one drawing answers both
sections. Section 1 keeps the two real consumers, which is the part a grid cannot show.
§2 stays _open_.

**The element glyphs (2026-09-06).** The library owns no element glyphs yet; Sogverse
draws lucide `Heart`, `Sun`, `Sword`, `Brain`. What the owner saw as a changed Wit glyph
was this page's own approximate SVG sketch, not a decision; the page is moving to the
real lucide icons everywhere (SOG-UI will use lucide). Page section 10, "The element
glyphs", draws today's glyph beside 6–8 real lucide candidates per element at both app
sizes, in soft on the card and inside the chip tile, plus the four together as the About
cards and the zone tiles. Criteria are the elements' own meanings: Harmony, with
yourself (balance, rest, knowing when to stop); Glow, with others (empathy, belonging,
friendship, a warm outward light, flourishing); Valor, with society (teamwork, civic
courage, trying the hard thing, speaking up); Wit, with technology (critical thinking,
curiosity). **Ruled: Harmony keeps `Heart`, Wit keeps `Brain`.** Open: Glow (the sun was
chosen when Glow was yellow) and Valor (a sword carries courage and none of the
teamwork). When all four are ruled they land as a library table beside the product-kind
glyphs, and `yty.ts` reads them from there.

## 3. Status colours

**Asked:** destructive / success / info / warning enter the library. Shown originally:
today's values (three white labels fail the body floor), a retuned candidate set that
clears the floor and one-meaning-per-hue, and two alternatives: info as a hueless
neutral note; warning as the brand amber.

**Ruled in part (2026-09-06), shorthand:**

- **destructive → `#FF5C5C`.** Liked. A new colour, not a brand one, and it stays its
  own.
- **warning → `#DFCB25`.** Liked. Likewise new, likewise its own. This retires the
  amber-warning alternative: the collision it existed to raise is answered by moving
  warning off the gold.
- **success → Glow strong. info → Wit.** Ruled *against* the retuned near-duplicates
  the page had drawn, in the owner's own terms: _"if we really do have Wit and Info
  side by side it would read as two shades of blue on the same page; same with Success
  and Glow; better to accept some not-ideal grammar for a smaller, focused palette."_
  Two near-identical hues teach a reader that neither means anything; one hue with two
  related meanings is survivable, because the glyph and the label already carry the
  difference everywhere the library colour-codes anything.
- **Error and warning are not merged.** They are far enough apart from each other and
  from everything else to stay two colours.
- **The info label forks, and the fork is what is left to rule.** Wit strong `#3A71DE`
  fails the body floor under ink (4.10) and clears it under white by 0.07 (4.57), and
  as *text* on the card measures 3.81 — under the floor outright, which matters because
  ink on a neutral ground is 166 of the 335 sites. Wit soft `#4DB3F5` measures 8.10
  under ink and 7.53 as text, and carries both jobs, but spending a soft variant as a
  fill is §2's open recipe question. So info is drawn **both ways in every construct**.
- **The hueless-info alternative is gone.** It answered "which new blue"; a blue has
  been chosen.
- **Final ruling pending seeing the four in context:** _"I would want to see these 4
  proposed status colours in their context to make a final ruling."_

**Ruled further (2026-09-06), and it is what the section is now built on.** The owner,
seeing the four in their constructs: _"Success and info are now tied to Yty colours,
which are brand colours, which we can't tint. So 'A tinted ground under its own ink'
needs to change. Even for destructive and warning, the tinted colour doesn't look great.
Also 'A card lit from its leading edge' is the same tinted effect and won't work. Both
need reworking while still bringing attention to the eye where needed. After that the
next tough question is when we use wit-strong and wit-soft."_ Three things follow:

- **No status colour is tinted anywhere.** For success and info it is forced — a brand
  colour exists at its authored values or not at all, and a 10% wash of Glow is not
  Glow. For destructive and warning it is a judgement, made on the drawing: the tint
  does not look good even where nothing forbids it. So the whole set moves off `/n`
  together, which also settles the tinted pill (9 sites) and the 40% ring (4) without
  their own ruling — same wash, smaller box.
- **Two constructs are reworked rather than retinted**, and both are on the page as
  candidates rather than as a proposal.
- **The strong/soft question is next**, and is drawn now so it can be taken in the same
  round.

**Shown now** — the section cut to the three things that resolve it, and to one compact
row of the proposed set per construct for the rest. `STATUS_SITES` in `inventory.ts`
still carries the whole classification, its regeneration command and the counts, and the
summary table still lists all seven constructs; what shrank is what is drawn.

1. **The tinted ground under its own ink** (121 sites, 45 files), reworked with no tint
   anywhere. Three real constructs — `ui/alert.tsx`'s panel, the confirm dialog's
   flagged line (`groups-panel-view.tsx` and `EnrollmentCard.tsx`, one recipe in two
   files), and the auth forms' inline error block — each drawn with all four statuses at
   once, today's row above four candidates: **A** a full-value rule down the leading
   edge with the glyph in status ink, the title in foreground and the body in muted ink
   (plus a top-rule variant on the alert, the one construct wide enough for it to read
   differently); **B** glyph and title in status ink with no rule; **C** a solid fill
   under its label, drawn loud so it can be rejected on sight; **D** the status only in
   the glyph. Every candidate sits on `muted` — all three constructs live inside a card
   — and none of them carries an alpha step.
2. **The card lit from its leading edge** (1 site, plus the act ones in section 8). The
   real card header drawn today beside a leading-edge rule, a top rule, the glyph alone
   and nothing, with the live (act) card and the awaiting (info) card together in every
   candidate because they exist to be told apart in one list. Act's rule is plain act;
   act has no soft half and will not get one.
3. **Strong versus soft, drawn once for every hue** — six hues (Harmony, Glow, Valor,
   Wit, destructive, warning) × six constructs (fill under a label, edge, ring,
   unlabelled mark, ink, glyph), each cell under the proposed direction with the
   inverted direction directly beneath it. This is §2's open recipe as well as the
   Wit question, answered in one drawing.

Kept, compact, because the final ruling waits on seeing the four in context: one
proposed-only row each for **ink on a neutral ground** (166 sites, the largest
construct), **a solid fill under a label** (19, the one row where info is still drawn
both ways) and **a solid mark with no label** (15). Kept and drawn once rather than three
times: the three **collision** exemplars — the voice room's zone tiles beside its
roster's mic glyphs, `/admin`'s attention cards one per kind, and the constructed Wit
tile beside the feed's session tag.

Cut: the per-construct today rows for everything nobody questioned, the tinted pill, the
ring, the destructive button, the corner badge, the seats-left bar, the mention row, and
the two extra collision passes. Their argument was made and what is left is the set.

Two things the rework put on screen and neither is argued there. **The auth forms' error
block carries no glyph today** — the tint is doing the whole job alone — so every
candidate for it adds one; a neutral panel with neither colour nor glyph is not a
quieter error, it is an error that has stopped saying it is one. And **the alert is no
longer drawn on both grounds**: the tint was the only reason to, because a 10% wash
composites differently over the card than over the page, and a neutral ground under a
full-value edge renders identically on both.

**Ruling:** _open — the three things above_

## 4. The greys — the sidebar ground, and accent

**Asked:** `sidebar-background` #171717 sits between the page ground and the card.
Shown at its own value, at the page ground, at the card ground. Also shown: accent
against card measures barely above 1:1; a muted-hover alternative sits beside it.

**Ruling (2026-09-05, partial):** _landed_ (sidebar) — **no sidebar-scoped tokens exist.** The
sidebar is chrome and composes from the general neutrals like every other surface;
all seven `sidebar-*` tokens are deleted, not renamed into a sidebar vocabulary. The
one value with no general twin, the #171717 ground, is not kept: the sidebar sits on
one of the two grounds the library ships. **Ruled from the exemplar: the sidebar sits
on the card ground (#1A1A1A, `bg-card`).** Its active fill is `muted`, its edge
`border`, its accents `primary` / `primary-foreground`. **Still open:** the
accent-hover question (accent vs muted as the hover fill).

**Shown (2026-09-06), live.** The owner asked to see hover and muted in action, today
beside proposed, interactive. Section 3 now draws the four grounds as a strip, then nine
real constructs under the pointer in each grey on the grounds they sit on (rail entry
with its active state, the WhatsApp conversation list with its selected row, two table
rows, the account menu, ghost and outline buttons, an attention card, a picker tile, a
reaction pill), then muted in its own job (skeleton bars, chips, filter pills, a
read-only field) with the one held-accent site that would visibly move. Counts: `bg-accent`
70 (60 hover, 3 other states, 7 held); `bg-muted` 177 (9 hover). Measured, off page:
accent over card 1.08:1, muted over card 1.15:1, accent over page 1.16:1, muted over page
1.24:1. Two findings: the conversation list is the only construct spending both greys at
once (hover accent, selected muted), and under the proposal hover and selected become one
colour; and every held accent pairs with a hover of the same colour, so accent's job there
is the highlight, not the hover. The two rulings on offer: **both stay as they are**
(nobody reported a problem), or **muted takes the hover and the highlight, accent is
deleted** from the library and the theme.

## 5. The categorical palettes

**Asked:** the four product-type colours and the sixteen zone colours enter the
library unchanged, as named palettes. Shown beside the Yty and status sets for
collisions (the two cyans are ~2° apart).

**Ruling (2026-09-05), product types:** _landed_ — **the four categorical product-type
colours are dropped. Product kind is a fact that takes a Yty family, and the mapping is
the first row of the library's tone grammar table**, defined in the foundations tier
with the admin product-type presentation as its consumer. Colour-coding product types is
an admin-only operational convenience, never shown to families. The mapping, ruled as
proposed and to be confirmed on the exemplar before it lands:

| kind | family | why |
|---|---|---|
| camp | Valor | the brand's own content coding: challenges, camps, courage |
| consumer club | Harmony | the relationship with people: community, the club a family chooses |
| municipality club | Wit | the relationship with technology and learning: the school-hours offering |
| event | Glow | growth and milestones: the one-off occasion |

**Re-matched 2026-09-06, landed in `grammar.ts`.** The first mapping leaned on the
brand's colour-coding of social content (pink for community, green for growth), which
does not agree with the elements' own meanings (Harmony is the relationship with
*yourself*; Glow is the relationship with *others*). The owner called the original
mapping a stretch and approved a better match, noting that the two clubs are used far
more than camps and events and that the coding is for admins. Matched on meaning:
**consumer club → Glow** (a community a family chooses), **municipality club → Wit**
(unchanged), **camp → Valor** (unchanged), **event → Harmony** by elimination, stated as
such in the doc comment. Glyphs unchanged. Sogverse's presentation map is keyed by
family and did not move.

The table's doc comment states the sharing as a decision: one-meaning-per-hue holds per
surface, admin tables show no Yty elements, and where an admin meets both (the voice
page's Yty zones) the glyph-and-label rule carries the meaning. Strong/soft follow the
standing rule (soft for text and glyphs, strong for fills, edges, rings). **The table carries a
glyph slot from day one** (kind → family + glyph): the glyph is the other half of the
tone grammar, and deciding it in Sogverse while the family is decided in the library
would split one fact across two places. It makes the icon set a library dependency, and
the two glyphs it names are the first icons SOG-UI owns, arriving with their consumer; the
icon vocabulary proper is a later project.

**Ruling (2026-09-06), the sixteen picker colours:** _landed_ — **they are not a
voice-zone palette and not brand colours. They are the sixteen colours a person may pick
for themselves** — a Gedu, a parent, a gamer choosing the colour of their own thing, the
way a player picks a shirt — and they carry no meaning beyond "this is mine". **Sogverse
never spends one on its own behalf:** never in chrome, never for status, never for a
product kind, never as a default the app assigns by meaning. The only path to one on
screen is a person choosing it or a person's identity deriving it. The custom voice zone
is the first consumer, a use and not the definition.

**Name: `pick`, numbered, not named.** Tokens are `pick-1` to `pick-16`. A consumer may
have no opinion about a pick's hue — it is always a list, any pick can be replaced by any
other, or it is not a real pick — so the **number is a stable id, not a position**:
retuning pick 7's hue keeps it pick 7, reordering never renumbers, and a shrunken palette
leaves the missing ids missing. The library exposes them as an ordered list (the picker
order) whose entries carry the id.

**Hex values unchanged, in today's order:** zone-red is pick 1 … zone-pink is pick 16.

**Why a complete rainbow.** The sixteen were designed to be told apart at a glance,
saturated enough to sit on the dark ground without dulling or clashing with the theme,
and a complete rainbow with no gap a child would notice. Steering them away from the
brand's own hues was tried first and produced a palette with holes that felt *less*
connected to the brand, not more — so the rainbow is complete and two of the picks sit
near the signature pair on purpose.

**Deferred, declared in one sentence in the module and not decided:** each pick's `on:`
companion — what ink or glyph reads on it — is measured together with the Yty element
recipe (§2). No pick is in the contrast ledger's grounds and no pairing is invented.

**The identicon is untouched by this** and stays §7: its colours are derived from an id
rather than picked by a person.

**Stored keys migrate.** `voice_zones.color` is `text` by design and held hue words;
`00242_a_voice_zone_colour_becomes_a_pick_id.sql` re-keys every row onto the pick id in
today's order. The column stays text and gains no CHECK.

## 6. Scrim, and ink on media

**Asked:** named neutrals for the dialog/sheet scrim, the tile overlay, the media
ground and the on-media ink. The picker's white check fails the glyph floor on light
swatches today and is rescued by a shadow.

**Ruling:** _open_

## 7. The identicon

**Asked:** where its white and black come from; its violet measures below the glyph
floor on any near-black ground.

**Ruling:** _open_

## 8. The faces — Press Start 2P placements

**Out of scope for this branch** (ruled 2026-09-05: colour only). The section is
removed from the page. When the faces adoption comes, the questions were: per
placement the proposed step (home hero → H1, gamer greeting → H2, Roblox hero → H1,
call-ended → H3, admin all-clear title → H3), one Space Mono candidate (the admin
all-clear line, where the platform names its own place), and confirmation that the
`font-mono` machine-text sites stay unbranded.

## 9. Colour at an alpha step

**Asked** (widened 2026-09-06 from "brand colour at alpha steps outside the Yty set"
to every token at a `/n` step, because the same question is being answered 270 times
and the brand pair is only 57 of them): 270 sites in 120 files carry an alpha
modifier — act 52, muted 44, destructive 37, muted-foreground 18, warning 16, info 16,
success 12, background 12, white 8, world 5, card 5, accent 5, the four Yty strong 4
each, foreground 3, black 3, act-foreground 2, sixteen zone hues 1 each. Regenerate
with the grep in the doc comment on `ALPHA_SITES` in `inventory.ts`.

**Shown** (page section 8, "Colour at an alpha step"), four rows in real exemplars:

1. **Scrims over media** — the dialog and sheet backdrop `bg-black/50`, the profile
   tile's `bg-black/60`, the fullscreen viewer's `bg-background/80`, each over a real
   photograph carrying a dark corner and a bright one.
2. **Translucent chips over media** — the photo-strip close, the viewer's close and
   two arrows, the screen-share badge, the voice avatar's muted mark, the chat
   composer's remove control. Each drawn twice: as it is today, and with a solid
   `bg-background`.
3. **Glass over scrolling content** — the dashboard section pill's `bg-background/90`,
   over a strip of card, body copy and an amber button.
4. **Alpha over a known ground** — four constructs drawn three ways in a row: the
   step as the app paints it, the same value pre-mixed with `composite()` as one
   opaque hex, and the plain token. `bg-card/50` (the browse filters), `bg-act/10`
   (the gedu picker's language chips), `bg-destructive/10` (the login form's inline
   error), `text-muted-foreground/50` (the assignment card's separator). The first
   two columns of each triple are the same colour, and that identity is the argument.

**The line being put:** _a token may carry an alpha step only where the ground is not a
token (media, video, scrolling content), and the library owns that construct; over a
known ground the alpha becomes a named token with measured pairings or the site takes
the plain token; opacity applied to a whole element as a state (disabled) is a
component-recipe matter, not a colour._

**Ruled 2026-09-06, in parts:**

- **What the page showed, in the owner's words: the only real use is a translucent
  dark layer dimming something behind something else.** The fifteen unknown-ground
  sites are one move at four sizes; the 255 known-ground sites are not layering at all
  (the triples prove it). The six strengths in use (50, 60, 70, 80, 85, 90) are drift,
  not design. **Ruled: the library defines one scrim and one glass**, and Sogverse
  writes no `/n`. Their strengths and whether the scrim is black or background are
  chosen on the page over the brightest artwork; that part is _open_ and the alpha
  section shrinks to it.
- **Opacity on a whole element as a state (disabled) stays.** Ruled; a component
  matter, not a colour.
- **Act and world carry no alpha, at any step, anywhere. Ruled.** There is no soft act
  and there will not be one. **What stands in each place is _open_ and must be seen:**
  the 57 sites are grouped by the job they were doing (selected or active item,
  highlighted row, callout ground, focus ring, hover shade) and each job is drawn today
  beside its candidates (a neutral ground from the greys that exist, plain act with ink
  where the element truly is the act, an act edge on a neutral ground, nothing). The
  owner rules per job; the sweep applies it per site. The four hover shades
  (`ui/button.tsx` ×3, `parent/PaymentProblemBadge.tsx`) fall under this ruling rather
  than waiting for Button: whatever hover becomes, it is not a derived shade of act.
- **The admin pixel-art trophy is artwork, and takes the artwork exemption. Landed.**
  It is a gold trophy and is painted gold; its earlier borrowing of act and a 55% shade
  of it was a mistake, not a brand placement. `admin/dashboard/pixel-art.tsx` now
  carries its own literal palette (trophy gold, a darker gold for the bowl's shadow,
  stone grey for the plinth, white core and ember sparks for the unrendered burst) and
  spends no token.
- **Soft status tints** (~81 sites) ride §3; **neutrals at alpha** (muted, accent,
  card, foreground, muted-foreground; ~75 sites) ride §4 and collapse to the greys that
  exist unless a site shows it needs a grey the palette lacks; **Yty and pick tiles** are
  §2; **the white steps** are §10; **gradients** are §14, and the act/world ruling binds
  them too.

**Shown now** — the page's sections 7 and 8, rebuilt to the two open parts above.
The counts moved with the trophy landing: the surface is 269 sites in 119 files,
act 51 and world 5, and the regeneration command in `ALPHA_SITES` now spells its
character class `[a-z0-9-]+` because the sixteen zone hues are `pick-1` to
`pick-16` and a letters-only class silently dropped all sixteen.

- **Section 7, "The scrim and the glass."** What is left of the original four rows.
  The known-ground triples and the state cases are gone: their argument was made,
  accepted and recorded above, so the drawings have done their work. What remains is
  a strength and a colour. The **scrim** is drawn at 50, 60, 70 and 80 in *both*
  black and the page ground, and every candidate carries the three jobs one value
  has to do at once — a dialog's card over a photograph, the fullscreen viewer's own
  control over a photograph, and the same scrim over the page a dialog is really
  opened from, which is the common case a picture-only comparison would have missed.
  The **glass** is drawn at 80, 85 and 90 beside a solid `bg-background`, with and
  without the `backdrop-blur-sm` the sites already carry, over a photograph and over
  scrolling content. The pill's `supports-[backdrop-filter]:bg-background/70` is not
  drawn: it is a sixth strength that exists only because nobody picked a first one.

- **Section 8, "Act and world at an alpha step."** The 58 matches the act/world grep
  reports, grouped into **eleven jobs** plus the ten gradients, which are listed as
  "see gradients" and left to §14 rather than drawn twice. Each job is drawn today
  beside its candidates in one row — a neutral ground at `accent` and at `muted`,
  plain act with `act-foreground` ink, an act edge at full value on a neutral ground,
  and nothing at all — in one or two exemplars copied class-for-class from the
  components that spend them. The jobs, with counts: a selected option in a form 14,
  an icon tile behind a glyph 7, a selected item with act as its ink 6, a drop target
  6, a ring 4, a highlighted row 3, a status chip 2, a hover shade on a filled
  control 2, faded ink on an amber fill 2, a hover tint on an empty tile 1, a callout
  ground 1. `ACT_ALPHA_JOBS` in `inventory.ts` carries the classification and the
  summary table lists it.

  Three things the grouping made visible, each drawn rather than argued. The **two
  hover jobs are live on the page** and are ruled on by pointing at them, because a
  hover held still is a picture of a state nobody meets. The **icon-tile job is the
  library's own exemption**: `brand.ts` exempts chip-scale icon-accent tiles from the
  no-alpha rule, which is exactly these seven sites, so the ruling above and the rule
  the library already ships cannot both stand and the drawing is what settles which.
  **Owner, 2026-09-06: not ruled out.** "A tinted brand colour that accents a glyph
  might still be allowed, because it is accenting an icon and not text." So the tile
  exemption stays live as an open question, for brand hues and by the same logic for
  status hues (the attention grid's kind tiles); the seven sites are drawn with their
  candidates and nothing is assumed either way.
  And **`text-act-foreground/70` has no quieter member of its pair to move to** — the
  palette offers exactly one ink for an amber fill — so its third candidate is not a
  colour at all but the meta line moved off the fill.

**Ruling:** _part ruled, part open_ — scrim and glass strengths, and the act/world
replacements, are the two things still to see.

## 10. The Klingon easter egg

**Asked:** its `#d00` / `#0a0a0a` artwork colours take the artwork exemption; its
eight `text-white/*` become muted ink.

**Ruling:** _open_

## 11. Coloured text

**Asked:** the brand rule is that text is always ink or white, never coloured text on a
coloured background. The library offers a Yty family's **soft** variant as text on a
**neutral** ground, measured on all four grounds. Is that within the rule because the
ground is neutral rather than coloured, or a departure that needs a ruling? The brand
source states the rule as the brand states it and marks this open in one sentence.

**Put to the owner 2026-09-06.** The brand's exact lines: "Text is always ink or white,
never coloured text on a coloured background"; "Yty-Element colours accent content, they
are not backgrounds for long text"; amber "is a background and large-graphic colour, not
a body-text or small-link colour"; "the soft variants especially are decorative, not
text-safe on white". Two readings. **Literal:** the ban is on coloured text over a
coloured ground; on a neutral ground it says nothing, so soft-as-ink on the dark grounds
is allowed (what the library ships today, measured). **Strict:** text is ink or white,
full stop; colour reaches the reader through fills, edges, rings, marks and glyphs. The
strict reading is what the brand's accessibility reasoning implies and it removes every
coloured-text contrast case at once. What hangs on it: the 166 status ink-on-neutral
sites and every Yty soft word; under strict, all become ink beside a coloured mark (the
glyph-and-label rule), and the recipe grid loses its ink column (soft only for glyphs).
Recommended: strict.

**Ruling (2026-09-06):** _ruled, to land with the status and recipe landing_ — **neither
reading; the owner's own line, which names the reader.** "The heart of the rule is that a
parent shouldn't be *talked to* in these colours. Something a parent has to read through
is ink or white." Coloured text is allowed, and useful, as a **short label** that
reinforces a Yty value or brings attention to a status. Codified as:

- Coloured ink exists only on a **label**: the name of a state or a value ("Cancelled",
  "Glow", "Past due", "3 seats left"), no verb, no sentence punctuation, short because
  names are.
- A label **never carries the meaning alone**: it sits beside a glyph or a mark in the
  same hue, so removing the colour loses nothing. Colour reinforces, never informs
  (the glyph-and-label rule, stated the other way round).
- Everything a reader **reads through** is ink or white: body, descriptions, headings,
  links, error sentences, help text.
- Coloured ink is always the **soft** variant on a **neutral** ground, measured; never on
  a coloured ground.

Held mechanically in three layers: the library owns the only way to write coloured text
(a status label and an element name are primitives that choose their colour; Sogverse
never writes a coloured text utility, the seam lint at lockdown, the sweep until then);
the primitive refuses a sentence (a label containing a full stop, a question mark or more
than a few words fails in development); and the soft variants' doc comment states the
rule in the owner's words. Consequences: the recipe grid keeps its ink column, headed
"label"; info's label ink is Wit soft, no white anywhere; the 166 status-as-text sites are
sorted once into labels (keep colour) and sentences (ink, with a mark beside them).

## 12. The colour budget on calm surfaces

**Asked:** the brand budget gives parent, partner, safety and billing surfaces amber as
the single accent on neutral grounds. An earlier relaxation ("colour wherever a mark has
a job, decorative colour stays out") is void until re-declared. The brand source holds the
single-accent budget and marks the relaxation open in one sentence. Does the relaxation
return, with its justification written into the source, or does the budget stand?

**Ruling:** _open_

## 13. Edges that were a state's only signal — the queue for SOG-UI edge constructs

The border sweep (landed 2026-09-05) deleted every border-colour utility the unlayered
default had hidden, so the app renders what it always rendered. These are the sites where
the deleted edge had been authored as the **only** signal of a state; users never had that
signal, so nothing regressed, but each is a candidate for a SOG-UI construct (a selection
edge, an alert edge, a pressed state) to be designed and judged in the demo. Not to be
fixed in Sogverse.

1. `src/components/public/products/browse-card-shell.tsx` — `active:border-primary/40`
   was the touch half of the hover/focus signal; a tap now gets no acknowledgement.
2. `src/components/voice/ZoneColorPicker.tsx` — swatch hover was `hover:border-foreground/40`
   alone; selection survives on the check glyph.
3. `src/components/family/ProfileTiles.tsx` (add-gamer tile) — keyboard focus lost its only
   colour response; the parent's `focus-visible:scale-105` remains.
4. `FamilySessionFeedItem.tsx` and `SessionFeedItem.tsx` — the next session's card-level
   `border-info/50` mark; the distinction survives in the badge label.
5. Admin dashboard `product-attention-grid`, `users-strip`, `week-rows`, `schedule-panel`
   — `hover:border-foreground/30` gone; `hover:bg-accent` remains and is near-invisible
   against card (§4's open hover question).
6. `src/components/admin/products/sections/identity-section.tsx` — the locale tab strip's
   `border-b-2 border-primary` vs `border-transparent`; every tab now shows the same grey
   underline and active rests on `bg-primary/5 text-primary`.
7. `src/components/gedu/session-feed/AttendanceRoster.tsx` — the absent mark's pressed
   state lost its outline half; fill and ink remain.
8. `src/components/public/products/signup-panel-view.tsx` — the region-lock blocks'
   "a border means you can act on it" grammar; only the info glyph marks the family now.

## 14. Gradients

**Asked:** a gradient is a colour construct the library has no word for, and every one
of them spends the signature pair. Does the library own a gradient (as a token, a
surface recipe, or a primitive), and at what values — or does the construct go? Not
drawn on the page yet; this entry is the site list the section will be built from.

Nine gradients in Tailwind classes and raw CSS, two OG images, one mail, one easter egg:

| where | what it spends |
|---|---|
| `src/app/(public)/page.tsx` ~26 | the hero, raw CSS: `color-mix` of act at 20% and world at 10% over a ground fade |
| `src/components/roblox/roblox-hero.tsx` ~53 | the same hero recipe, byte for byte |
| `src/app/(public)/page.tsx` ~140 | `bg-gradient-to-r from-act/10 to-world/10` on the closing card |
| `src/components/roblox/programme-cta.tsx` ~29 | the same, on the programme CTA |
| `src/components/about/about-section.tsx` ~61 | `from-act/5 to-world/5` |
| `src/components/about/yty-section.tsx` ~31 | the same |
| `src/components/family/EnrollmentCard.tsx` ~453 | `from-act/5 to-transparent`, the live card |
| `src/components/family/EnrollmentCard.tsx` ~460 | `from-info/5 to-transparent`, the awaiting card |
| `src/components/gedu/GeduAssignmentCard.tsx` ~248 | `from-act/5 to-transparent`, the live card |
| `src/app/opengraph-image.tsx` ~47 and `src/app/(public)/roblox/opengraph-image.tsx` ~54 | the hero recipe again, built from `GRADIENT.actGlow` / `worldGlow` — the pair already **composited** to opaque hexes, because a renderer with no alpha needs the flat colour |
| `src/lib/email-templates/layout.ts` ~21 | the same composited pair, for the same reason |
| `src/components/about/about-section.tsx` ~128 | the Klingon divider, `transparent → #d00 → transparent`; artwork exemption, §10 |

Two things the list makes visible before anything is drawn. The hero exists in four
places and two spellings — raw `color-mix` in the app, `composite()` in the OG images
and the mail — which is one recipe with two implementations that can drift. And
`src/lib/constants/roles.ts` ~23 carries a **full-value** `bg-gradient-to-r from-act
to-world` for the gedu role chip, which the alpha grep does not match and which is the
only gradient in the app spending the pair at its authored values.

**Shown** (page section 9, "Gradients"), five cases, each drawn today beside the same
four candidates: the ground alone with no gradient; a neutral gradient between two
greys the palette already ships; the pair at full value as a thin rule rather than a
wash; and the pair at full value as a wash, drawn loud so it can be rejected on sight.

1. **The hero** — the app's own arbitrary-value class verbatim, at a wide aspect with
   a real headline, two buttons and a sub-line over it. One drawing covers both
   `page.tsx` and `roblox-hero.tsx`, which are byte for byte the same recipe.
2. **The closing card** — drawn at *both* strengths the app uses, `/10` on the home
   and programme call to action and `/5` on the two About cards. Nobody chose 10 over
   5 on either surface, and the ruling that the pair carries no alpha makes the
   difference moot either way.
3. **A card lit from its leading edge** — the family enrollment card and the gedu
   assignment card, with the live (act) and awaiting (info) cards drawn together in
   every candidate, because the two exist to be told apart at a glance in one list.
   Its "rule" candidate is a single-hue 3px leading band rather than an act→world
   one: this construct never spends the pair.
4. **The gedu role chip** — the one full-value gradient, drawn beside the other three
   role chips because a role chip's whole job is to be told apart from the other
   roles in an admin table. Candidates: today, plain act, plain world, and a neutral
   chip with act ink.
5. **The social card** — both OG images at link-preview size, the real 1200×630
   composition built from each source's own pixel values and scaled to fit. They are
   a *transcription*, not the component: `next/og` renders through satori at build
   time and cannot run in a page, and the demo may not import from Sogverse. The
   gradient is the one part that is not transcribed — it is built with `composite()`
   here exactly as `GRADIENT` builds it there, so the two are one piece of arithmetic
   rather than two hexes that agree today. `src/lib/email-templates/layout.ts` spends
   the identical pair in the identical shape at a 70% fade stop rather than 78%, so
   the mail's header is these panels with one number nudged and is ruled by them.

Two things the section does not draw, and both are deliberate. The Klingon divider is
artwork and rides §10. And **the Roblox card's two partner marks are absent**: the
Roblox mark is approved per placement, this page is a placement nobody has approved,
and the gradient being ruled on has faded to flat ground long before it reaches the
lockup — so the two marks' heights are held by plain neutral bars, which keeps the
composition's geometry honest without carrying a mark that needs sign-off.

**The contradiction the OG cards expose, for this ruling to resolve.**
`GRADIENT.actGlow` is act at 20% over the ground, flattened to an opaque hex because
neither satori nor an email client can be trusted with alpha. It is therefore the
brand colour at an alpha step wearing a solid's clothes, in four files, and the
act/world ruling in §9 reaches it. The doc comment on
`packages/sog-ui/src/tokens/composite.ts` currently says the opposite in as many
words — "A composited value is not a new brand colour and does not become one … The
rule that a brand colour exists only at its authored values is unaffected." Both
cannot stand. `composite.ts` was left untouched on purpose: which of the two gives way
is decided by whatever this section is ruled, and a helper's doc comment is not where
a colour rule gets settled. Whichever way it goes, that paragraph is rewritten in the
same change as the ruling lands.

**Ruling:** _open_

## Where the session stands (2026-09-05, end of day)

Read this first when resuming. The branch is `feat/sog-ui-theme-adoption`, in the
worktree `.claude/worktrees/sog-ui-theme`, pushed to origin after every landing. The
worktree has its own `node_modules` (this branch changed dependencies). The demo runs
with `npm run dev --workspace=@sog/ui` on port 3001 and the ruling page is `/ruling`.
The app preview is not running; start it on 3002 only to spot-check a page.

**Landed and committed:** the theme plumbing; the border sweep (no universal default,
every edge named, every hidden colour deleted); the Yty tokens; muted and accent in the
library and the second-name tokens gone; the sidebar on the card ground with no tokens
of its own; act and world replacing primary and secondary everywhere; the colour rules
and their reasons codified in `brand.ts`; the deviations doc deleted; the process written
into `packages/sog-ui/docs/adoption.md`.

**Landed 2026-09-06, the picks (§5).** `packages/sog-ui/src/tokens/picks.ts` holds the
ordered list and `PickId`; the generator emits `--color-pick-1` … `-16`; the demo's
foundations floor shows all sixteen; `tests/unit/sog-ui/picks.test.ts` holds the set and
its parity with the theme. In Sogverse the sixteen `--color-zone-*` tokens are deleted,
`lib/constants/voice-zones.ts` keys its colour map by pick id (text, because the column
is), the picker's swatch labels are one numbered string per locale, and every fixture and
db-test literal spells a pick id. The tile's `/15` step stays, pending §9, as the Yty
steps do.

**Landed after the owner left (2026-09-06):** the product-type landing (the tone grammar table with
family + glyph in `packages/sog-ui/src/tokens/grammar.ts`, the admin presentation map
reading it, the four categorical tokens deleted) and the page cleanup for §2 and §5. If
`git status` is clean and `git log` shows it, nothing is outstanding from that pass; the demo
server was stopped at the end of the day and needs starting again.

**Added after the owner left (2026-09-06), needing no ruling to build:** the page's
section 8, "Colour at an alpha step" (`section-alpha.tsx`), which draws §9's widened
question — scrims and chips over real photographs, the section pill over scrolling
content, and four alpha-over-a-known-ground triples where the step and its composited
solid land on the same pixels. `ALPHA_SITES` in `inventory.ts` classifies the whole
surface and the summary table lists it. The two photographs are copies of Sogverse's
`public/preview-art/session-arena.jpg` and `session-badge.jpg` in the demo's own
`public/ruling-art/`, joined later the same day by a copy of
`src/assets/brand/sog-logo-full.svg` for the OG cards, because the demo is a separate
Next app with a separate static root; all three are deleted with this directory. That
section has since been ruled in parts and shrunk — see the next paragraph but one.

**Ruled 2026-09-06 from the alpha section (§9):** one scrim and one glass replace the six
alpha strengths; disabled-as-opacity stays; act and world carry no alpha at any step
(no soft act exists); the admin trophy sprite is artwork and is painted gold (landed).

**Built 2026-09-06 to those rulings, needing no further ruling to draw.** The page now
runs 0 to 9 and holds three sections where it held one:

- **Section 7 shrank to "The scrim and the glass"** — the known-ground triples and the
  state cases are gone, their argument having been made and accepted. Open on it: one
  strength and one colour for the scrim (50/60/70/80 × black or the page ground, each
  drawn over a dialog's card, the viewer's control, and the page a dialog really opens
  from), and one strength for the glass (80/85/90 or solid, with and without the blur).
- **Section 8, "Act and world at an alpha step"**, is new — the 58 matches in eleven
  jobs plus the ten gradients, each job today beside its candidates. Open on it: the
  owner rules per job and the sweep applies the ruling per site. Two live findings it
  put on screen: the icon-tile job *is* `brand.ts`'s own chip-scale exemption, so the
  ruling and the shipped rule cannot both stand; and `text-act-foreground/70` has no
  quieter ink to move to.
- **Section 9, "Gradients"**, is new — §14's whole site list drawn, in five cases.
  Open on it: the whole question. The Roblox card is drawn without its two partner
  marks, because a new surface carrying the Roblox mark is a fresh approval and this
  page is not it. It also surfaced a contradiction between the §9 ruling and
  `composite.ts`'s doc comment, ledgered under §14 and left in place for the gradient
  ruling to resolve.

**Rebuilt twice on 2026-09-06, and the status section is the focus.** The first rebuild
keyed section 2 on the **surface** rather than on four colours — seven constructs, each
with all four statuses in it, today above proposed. Seeing that, the owner ruled the
tints out (§3): success and info are Yty families now, a brand colour cannot be tinted,
and even destructive and warning do not look good washed. So the section was rebuilt
again, this time **cut to the three things that resolve it**:

1. **The tinted ground under its own ink** (121 sites), reworked with no tint. Three
   real constructs — the alert panel, the confirm dialog's flagged line, the auth forms'
   inline error block — each with all four statuses, today's row above four candidates:
   a leading-edge rule (plus a top-rule variant on the alert), glyph-and-title in status
   ink, a solid fill drawn loud enough to reject on sight, and nothing but the glyph.
2. **The card lit from its leading edge** (1 site), the real card header today beside a
   leading rule, a top rule, the glyph alone and nothing, with the live (act) and
   awaiting (info) cards drawn together in every candidate.
3. **Strong versus soft**, six hues × six constructs (fill under a label, edge, ring,
   unlabelled mark, ink, glyph), the proposed direction with the inverted one beneath
   it. This is §2's open recipe as well as the Wit question, and it is the next thing to
   rule after the set.

Everything else in the section is one compact proposed-only row per construct (ink on a
neutral ground, a solid fill under a label, a solid mark) plus the three collision
exemplars drawn once instead of three times. The tinted pill and the 40% ring are folded
into the two reworked constructs rather than redrawn. On screen the section went from 28
comparison rows carrying 126 panels, plus the three collision exemplars drawn three
times, to 20 rows carrying 85 panels, the 72-cell recipe grid, and the three collision
exemplars drawn once. Its source grew from 1047 lines to 1394 in the same move: the grid
is new work and the reasoning that used to sit in seven construct sections is now
concentrated in four, and on this page the reasoning is the doc comments.

**What lands when §3 is ruled:** four status tokens in the library, each with the ink or
white companion that reads on it and its measured pairings in the contrast ledger; two
more rows of the tone grammar, because success and info are facts taking families rather
than new colours; **the strong/soft recipe as a library rule** — the grid is its proof,
and `brand.ts` states it as a habit today rather than as a measured direction; Sogverse's
four `--color-*` deleted and the email hex mirror reading the library; `brand.ts`'s
`glow` doc comment rewritten, since it currently says green is never the colour of
success; **the 121 tinted sites and the lit-edge card converted to whatever construct is
ruled**, which is the largest single sweep left on this branch. The token names do not
move, so no Sogverse call site changes spelling.

**Open on the page, with the status set first because that is where the focus is:** the
status set (§3 — the two reworked constructs, and then the strong/soft direction, which
is also §2's recipe and the answer to "when do we use wit-strong and wit-soft"); the
hover fill (§4, accent vs muted); scrim and on-media ink (§6);
the identicon (§7); colour at an alpha step (§9, the two parts above); the easter egg
(§10); coloured text (§11) and the calm-surface budget (§12); gradients (§14). The page's
sections were renumbered when the picks left it and run 0 to 9 with no gap: 0 the
inventory, 1 Yty, 2 status, 3 the greys, 4 scrim and ink on media, 5 the identicon,
6 the Lynx cyan, 7 the scrim and the glass, 8 act and world at an alpha step,
9 gradients.

**End-of-branch work, needing no ruling:** the enforcement (a test that Sogverse's
stylesheet declares no `--color-*`; the hex-literal lint extended to all of `src/` with
named exemptions — flag SVGs, the easter egg artwork, the partner marks in `og/marks.tsx`,
the identicon's white/black once ruled; a lint banning raw Tailwind palette classes in
class strings); the root `CLAUDE.md` Styling rules the adoption retires (never-hardcoded
colours; the theme paragraphs); adoption.md's step 1 marked done; this page and this
ledger deleted in one commit; the review (`/code-review` from the merge-base, in a
subagent); the owner's walk through the app on 3002 before merge; merge via the
worktree flow's Phase 5.

**Standing agreements not to forget:** the owner rules from the page, in shorthand,
never from a paragraph; ruled means landed, and the page shrinks by what landed; no
prose, numbers or pass marks on the page; every ruling's reason goes into a doc comment,
never a source citation; Sogverse never learns of the Guidebook.
