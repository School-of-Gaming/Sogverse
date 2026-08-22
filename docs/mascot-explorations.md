# Mascot explorations — pickup notes

**Status: open exploration, parked on branch `feat/mascot-explorations`.** Nothing
here is live. The branch carries a throwaway page at `/mascot` (public, noindex,
linked from nowhere) and the whole mascot module under `src/components/mascot/`.
This doc is the state of the work and the decisions already made, so a fresh session
can pick it up without re-deriving them. Last updated 2026-08-22.

## What we are trying to build

A reusable **base model** for a School of Gaming / Sogverse mascot fleet, drawn as
**SVG in React/TSX** so Claude can create, maintain and reshape it in code. The fleet
has jobs (introduce you, help gamers, work with parents, Gedu experts) and has to be
colourful, vibrant, cute, quirky and nerdy. Audience test: makes gamers aged 7–12
smile, makes parents feel welcomed, makes Gedus laugh.

**The requirement that drives everything else:** the site never shows images of
children, for privacy. Every hero, email header and "here is what a session looks
like" therefore has a person-shaped hole in it. The mascot must be able to **stand in
for a child gamer, a parent and a Gedu** — that is its first job, decoration is its
second.

## Rulings already made (do not re-open)

- **Species: explore broadly.** Abstract critter, robot/gadget, animal, humanoid,
  geometric were all in scope; show both a Yty-compatible direction and fresh ones.
- **Deliverable: one parametric component + a gallery/playground page**, not
  hand-drawn sheets. A species is a rig + body + head and inherits every pose,
  expression, prop, outfit and crop.
- **Name the species and the fleet members.** Finnish flavour welcome, not required.
- **No real-game look-alikes.** We are a Roblox partner; nothing may read as a
  Minecraft / Roblox / Nintendo / Pokémon character. Generic controllers and headsets
  are fine.
- **Identity must survive every scale.** Silhouette and one or two high-contrast
  landmarks carry identity; detail is additive and may drop away. Every concept gets
  a scale ladder, a silhouette test and an avatar crop. Finding: **no full-body figure
  survives below ~48px** — every small use is the avatar (bust) crop.
- **Customisation cannot touch the identity core.** Attachment slots (`hat`, `face`,
  `torso`, `back`, `extra`, `scene`) whose anchors move with the pose, and named
  colour slots; presets may only recolour clothing slots that no body is painted from.
- **Animation: commit to it, fully.** No `prefers-reduced-motion` gate (explicit
  product decision — it is cosmetic and never in the user's way), no tiny-amplitude
  hedge. Every pose owns a real animation (walking walks, jumping jumps, typing types).
  The same SVG must render exactly as a static image when the stylesheet is stripped
  (emails, marketing images). **Do not pre-optimise**: the exploration page animates
  everything at once on purpose because that is the better demo.
- **Four Finnish seasons + holidays, automatic.** Looks for talvi / kevät / kesä /
  syksy and a small holiday set, resolved in Europe/Helsinki from a pure
  date-to-look helper, with an "auto" path so a product surface just dresses for
  today. Season boundaries are a product judgement and are written down in the
  seasons module.
- **Avatars are in scope** (see below), replacing identicons — but nothing live has
  been touched.

## The face grammar (the hardest-won decision)

Two rounds of faces read "creepy, soulless". The diagnosis, confirmed by Kyle:

**A good face here is a symbol system, not a drawing of a face.** Every part is a flat
primitive that carries meaning only through its geometry:

- **Eye** = one white ellipse + one black pupil. Mood is the ellipse's size and shape
  (wide and round = surprised, squeezed to a lens = focused) and the pupil's position
  (off to the side = thinking). Nothing else.
- **Brow** = a short line whose *angle* does the work, present only when needed.
- **Mouth** = a small simple curve or ellipse. A glyph with no interior. Lacking
  detail on purpose.

**Expression = four dials only** — eye size/shape, pupil position, brow angle, mouth
shape — the same four for every mood, so it reads as one character changing mood
rather than six drawings. Happy (the default face) is the Thinking eye with a centred
pupil and a small up-curve; Excited is the same eye bigger and rounder with a bigger
curve; Laughing is two closed arcs and a solid half-ellipse.

**Realism cues are forbidden on every species, everywhere on the body:** eye
highlights, sparkles, laugh-lines, cheek blush, teeth, tongues, lip or lid lines,
nose glints. Each one asks the brain to read the face as real, and a symbol face with
realism cues lands in the uncanny valley. The round-2 mistake was removing the white
sclera (the system that already worked) while keeping the highlight (the actual cue).

The exploration page keeps all three rounds of faces in a comparison strip; only the
symbol face is live.

## What exists on the branch

`src/components/mascot/` — rig, limbs (two-segment jointed or tapered, elbow solved by
a small two-bone IK), poses with per-pose motion plans, a channel/keyframe animation
system, faces (live + two legacy renderers for the comparison strip), props,
accessories, outfits and palettes, a seasons module, detail levels and crops, the
avatar mapping + zod contract + view, and `concepts/` with one file per species.
`exploration/` holds the page's own sections. The page is
`src/app/(public)/mascot/page.tsx`; the route is registered in the routes constant
and the proxy's public allow-list with a delete-me comment on each.

The cast:

| Species | What it is | Where it stands |
|---|---|---|
| **Kaveri** | Stylised person, deliberately unreal complexions. Six builds — three kids, three adults — differing only by hair silhouette, shoulder width and garment cut. | **Recommended base model.** The only concept that fills the person-shaped hole. Whether the six builds read as kid/adult and boy-ish/girl-ish/androgynous at a glance is still Kyle's call. |
| **Otso** animal family | One rig, per-species head and tail: bear, fox, moose, owl, lynx, hare, Saimaa ringed seal. | **Recommended second cast.** The emotional range Kaveri lacks; strongest of everything at avatar sizes. |
| **Taitto** + folds | A being creased out of flat planes. Branches: **Kaari** (round head, soft limbs, faceted body), **Kide** (fully angular, slender, lit crystal chest), **Nappi** (pure proportion change, two heads tall, still all corners). | Kyle's favourite for freshness. **Open question: Nappi vs Kaari** — if Nappi reads as cute while staying angular, Taitto was never cold because of its corners but because it was adult-proportioned, and Kaari conceded a round head it didn't need. Kide fails at avatar sizes. |
| **Ytymo** | Yty-element critter, four element colourways. Rebuilt off the egg (the first version read as an egg / *muna*). | Companion beside a bigger character, not the character. |
| **Konsu** | Handheld console that grew limbs; face is a screen. Got a carry handle and the four Yty elements. | Read as "anyone's robot". Park unless the handle version wins on sight. |

Also built: a seated-at-desk scene (chair, desk, keyboard, mouse, monitor, mug) as a
`scene` accessory that composes with every species; seasonal and holiday looks as
*sets of accessories* rather than repaints; a playground with every control.

## Avatars (side track, same machinery)

Today's avatars are identicons (a 5×5 mirrored pixel grid in three brand colours,
seeded from the user's UUID). Feedback: not memorable — you can't tell who is who at a
glance unless a seed gets lucky. The branch has:

- A deterministic default from the user id (separate hash bit-ranges per axis so
  species and palette are uncorrelated), documented as a forever promise.
- A closed-enum zod contract for a stored customisation (`concept`, `form`, colour
  slots, outfit slots) — small enough for one JSON column. **Must be server-stored and
  server-validated**: the voice token route already refuses to let a guest pick a
  UUID to choose an identicon, and a customised avatar has the same impersonation
  concern.
- A bust-crop avatar view, always static, with its own detail thresholds.
- On the page: 24 fixed UUIDs as mascot avatars beside their identicons at 64/40/28,
  mock participant lists, a crop ladder and a customiser.

Finding: **mascot avatars beat identicons at 28px** — species, hat and dominant colour
survive and are nameable ("the blue moose"). Glasses and anything below the collar do
not. Surprised is not an avatar-safe expression (below 40px it collapses into
Excited). Ytymo and Konsu don't portrait and are excluded from the avatar set.

## Open items, in the order to take them

1. **Small face follow-ups awaiting Kyle's ruling:** scale mouth widths off head
   radius (Kide's mouth is proportionally large); keep or cut Kaveri's freckle dots;
   cut the soft body sheen on Otso and Ytymo (same category as the nose glint).
2. **Verify motion in a browser.** No agent has watched the animations run; only the
   emitted CSS was checked. Walk, jump, typing and the pose transitions need eyes.
3. **Pick a direction:** Nappi vs Kaari; confirm the Kaveri family reads; confirm
   Kaveri + animals + Kaari as the shipping set.
4. **Then the cull:** delete the losing concepts, the two legacy face renderers and
   the legacy limbs, the dead `blush` colour slot, the exploration sections, the
   `/mascot` route and its proxy entry. Promote the survivors out of `concepts/`.
5. **Wiring:** home page hero first (1–3 animated characters, never a gallery); then
   the avatar system — a column, the server-validated contract, a customiser for
   gamers and Gedus, and the identicon swap.

## Operational notes

- **Branch off the latest `dev` before resuming and merge it in** — the branch was
  cut 2026-08-22 and will drift.
- Kyle's dev server is always running on the main checkout; an agent working on this
  branch must **verify `/mascot` through Next** (`curl` the running server for a 200)
  before reporting. Round 1 shipped a server→client boundary error — concept
  definitions carry React components and cannot be passed from the server page to a
  client component; pass the id and look it up client-side.
- Agents should **rasterise their SVG output and look at it** (the rounds used
  `sharp` in the scratchpad); every round this caught bugs coordinates alone missed.
- All mascot hex lives in the palette module — the sanctioned exception to the
  no-hardcoded-colours rule, because the art must render in email. Page chrome stays
  on semantic tokens. The exploration files disable the literal-string lint rule
  file-top with the preview-scene justification; nothing here adds `messages/` keys.
