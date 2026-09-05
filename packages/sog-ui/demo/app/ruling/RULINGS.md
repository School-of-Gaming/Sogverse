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

**Ruling (2026-09-05), tokens only:** _ruled_ — clear-cut from the Guidebook, no
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

## 3. Status colours

**Asked:** destructive / success / info / warning enter the library. Shown: today's
values (three white labels fail the body floor), a retuned candidate set that clears
the floor and one-meaning-per-hue, and two alternatives: info as a hueless neutral
note; warning as the brand amber.

**Ruling:** _open_

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

## 5. The categorical palettes

**Asked:** the four product-type colours and the sixteen zone colours enter the
library unchanged, as named palettes. Shown beside the Yty and status sets for
collisions (the two cyans are ~2° apart).

**Ruling:** _open_

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

## 9. Brand colour at alpha steps outside the Yty set

**Asked:** the home and Roblox hero gradients spend the brand pair at 20% / 10%; the
admin pixel-art sprite uses the primary at 55%. The library forbids a brand colour at
an alpha step. What replaces each.

**Ruling:** _open_

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

**Ruling:** _open_

## 12. The colour budget on calm surfaces

**Asked:** the brand budget gives parent, partner, safety and billing surfaces amber as
the single accent on neutral grounds. An earlier relaxation ("colour wherever a mark has
a job, decorative colour stays out") is void until re-declared. The brand source holds the
single-accent budget and marks the relaxation open in one sentence. Does the relaxation
return, with its justification written into the source, or does the budget stand?

**Ruling:** _open_
