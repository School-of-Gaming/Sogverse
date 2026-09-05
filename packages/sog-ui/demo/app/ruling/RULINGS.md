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

**Ruling (2026-09-05), product types:** _ruled_ (exemplar approved) — **the four categorical product-type
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

The table's doc comment states the sharing as a decision: one-meaning-per-hue holds per
surface, admin tables show no Yty elements, and where an admin meets both (the voice
page's Yty zones) the glyph-and-label rule carries the meaning. Strong/soft follow the
standing rule (soft for text and glyphs, strong for fills, edges, rings). **The table carries a
glyph slot from day one** (kind → family + glyph): the glyph is the other half of the
tone grammar, and deciding it in Sogverse while the family is decided in the library
would split one fact across two places. It makes the icon set a library dependency, and
the two glyphs it names are the first icons SOG-UI owns, arriving with their consumer; the
icon vocabulary proper is a later project.

**Still open — the zone palette.** The sixteen voice-zone colours are a gamer-facing
picker whose requirement is sixteen distinguishable hues; they stay a named palette and
are ruled separately.

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

**In flight when the owner left:** the product-type landing (the tone grammar table with
family + glyph in `packages/sog-ui/src/tokens/grammar.ts`, the admin presentation map
reading it, the four categorical tokens deleted) and the page cleanup for §2 and §5. If
`git status` shows those files uncommitted, the agent's report was not yet acted on:
verify the gates and commit.

**Open on the page, in the order they were going to be taken:** the hover fill (§4,
accent vs muted); the Yty recipe (§2); the status set (§3); the zone palette (§5); scrim
and on-media ink (§6); the identicon (§7); the alpha steps in the heroes and the sprite
(§9); the easter egg (§10); coloured text (§11) and the calm-surface budget (§12).

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
