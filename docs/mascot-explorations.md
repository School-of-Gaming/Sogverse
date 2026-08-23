# Mascot explorations — pickup notes

**Status: open exploration, parked on branch `feat/mascot-explorations`.** Nothing
here is live. The branch carries a throwaway page at `/mascot` (public, noindex,
linked from nowhere) and the whole mascot module under `src/components/mascot/`.
This doc is the state of the work and the decisions already made, so a fresh session
can pick it up without re-deriving them. Last updated 2026-08-23.

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

- **Voxel is a permitted style.** The no-look-alikes rule forbids recreating characters
  and mobs that exist in Minecraft, Roblox and the like — no creeper / zombie / pig /
  cow / sheep shapes, no Minecraft block textures, no Steve proportions. It does not
  forbid blocky art; an SoG voxel animal style of its own is wanted.
- **"Finnish fauna only" is not a rule.** School of Gaming is proud to be a Finnish
  company — we love our nature and our animals and highlight them where we can — and a
  global one that loves all animals, fictional ones included. SOG celebrates everything
  fun, quirky, cute and cool. A raccoon is a raccoon; a unicorn and a giraffe are
  welcome; nothing is refused for being non-Finnish.
- **Mascot colours come from the product's own palettes.** The 16 voice-zone hues, the
  4 Yty element colours and the 4 admin product-type colours form one shared swatch
  list, mirrored as hex in the shared colour constants so the art renders in email.
  Species colourways and garment colours are derived from a swatch; none are invented.
- **The legacy set is canon, translated not traced.** The old SOG Minion and the
  Finnish pun cast (found 2026-08-23) come into the system as species, forms and fleet
  members that inherit every pose and prop, shown beside the originals on the page.
  "Minion" is Universal's trademark, so the species is renamed (Silmu).
- **Silmu anatomy, from the source files:** straight stem legs ending in a foot that
  bulges outward (a lowercase d and b); no arms unless the pose or a held prop needs
  them, and then straight arms ending in a mitten with only a thumb; **no eyebrows** —
  mood lives in the eye's shape and a flat or slanted cut of the white; the mouth is
  optional, and the content default has none ("a stoic Finn looking at you"); mouth
  and eye ink follow the body's luminance (white on the black one).
- **The Silmus make the site.** Maalari with a dripping brush and a bucket is the one
  who painted the SOG poster on the door; the painter motif — paint in any of the site's
  swatches, a painting pose, a half-painted sign — is kept as a product idea (empty
  states, "this page is being painted").
- **Feet are the anchor.** An idle animation breathes, blinks and shifts weight; it
  never floats. Only a species that can fly and means to hovers at rest, as a declared
  property of that species. Jumping and walking move the feet because the action does.
- **Team characters.** MoodyRat — the Gardener (tends the stories; a rat in a straw hat
  with a watering can and a sprouting book), Reksi — the Princi-Pal (the CEO's persona,
  principal gamer; a voxel T-rex and a human elder in shades with a briefcase), and an
  ideas round for Chief Engineer Kyle (CTO; scientist, builder, architect, engineer; the
  engine room) — candidates side by side for Kyle to pick from, no Star Trek IP. Real
  names stay out of the code; the handles are the characters.
- **Work from the image, not a description of it.** The rule and the other working
  rules for this directory live in the module's own `CLAUDE.md`.

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
| **Kaveri** | Stylised person, deliberately unreal complexions. Eight builds — three kids, three adults, two elders (Kanslisti, Reksi) — differing only by hair silhouette, shoulder width and garment cut. | **Recommended base model.** The only concept that fills the person-shaped hole. Whether the six builds read as kid/adult and boy-ish/girl-ish/androgynous at a glance is still Kyle's call. |
| **Otso** animal family | One rig, per-species head and tail. Sixteen forms: bear, fox, moose, owl, lynx, hare, Saimaa ringed seal, and from the legacy cast raccoon, giraffe, unicorn, leopard, bug, monster, great tit, rat, beaver. Home of MoodyRat and the beaver Chief Engineer. | **Recommended second cast.** The emotional range Kaveri lacks; strongest of everything at avatar sizes. |
| **Taitto** + folds | A being creased out of flat planes. Branches: **Kaari** (round head, soft limbs, faceted body), **Kide** (fully angular, slender, lit crystal chest), **Nappi** (pure proportion change, two heads tall, still all corners). | Kyle's favourite for freshness. **Open question: Nappi vs Kaari** — if Nappi reads as cute while staying angular, Taitto was never cold because of its corners but because it was adult-proportioned, and Kaari conceded a round head it didn't need. Kide fails at avatar sizes. |
| **Ytymo** | Yty-element critter, four element colourways. Rebuilt off the egg (the first version read as an egg / *muna*). | Companion beside a bigger character, not the character. |
| **Konsu** | Handheld console that grew limbs; face is a screen. Got a carry handle and the four Yty elements. | Read as "anyone's robot". Park unless the handle version wins on sight. |
| **Silmu** | The legacy SOG Minion rebuilt: a chunky bean that is its own head, one eye, stem legs, arms only on demand, a hat as the identity. A cyclops face mode, and the `gaze` dial every species now has (the legacy direction sprites were the pupil moved). 25 colourways: the faithful black plus one per swatch, with ink by luminance. | **New, from the legacy set.** Kyle's anatomy notes are applied; proportions are measured off the PNGs and written at the top of the concept. Fleet: Vilkku, Terve, Maalari, Verso, Tonttu, Chief Engineer Kyle. The best avatar in the set at 28px. |
| **Palikka** | Voxel animals (a child's building block): T-rex, hippo, moose. Front-facing with every block as three tones so the shared rig, IK and animations keep working; a square-eyed voxel face mode whose brow is a stair of blocks. | **New, from Hipponen and Treksi.** Reksi — the Princi-Pal is the T-rex. Closest thing in the set to the no-look-alikes line; hold it next to a Roblox partner deck before shipping. |

Also built: a seated-at-desk scene (chair, desk, keyboard, mouse, monitor, mug) as a
`scene` accessory that composes with every species; seasonal and holiday looks as
*sets of accessories* rather than repaints; a playground with every control.

Since 2026-08-23 also: a **Legacy** section on the page (the 34 originals, downscaled
under `public/mascot-legacy/`, each on a light tile beside its rebuild on the dark
one, with a typed mapping table as the plug-in point); a **Silmu rainbow** study (all
25 bodies, then all 25 as 40px busts — the tell-them-apart test); a **team** section
(the Gardener spotlight, the Chief Engineer candidates with their crops, the engine
room); a `painting` pose with its own brush-stroke animation; props paintbrush,
briefcase, watering can, wrench, blueprint, beaker, scanner; accessories cap (blank),
straw hat, goggles, tool belt, paint bucket, story sprout; scenes door, sign-painting,
engine-room; the shared 24-swatch list with a swatch-to-colourway helper.

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

1. **Kyle's picks:** the Chief Engineer candidate (beaver / Kaveri / Silmu, and whether
   the engine room is a product scene); Nappi vs Kaari; confirm the Kaveri family reads;
   the shipping set — today's honest answer is Kaveri + Otso + Silmu, with Palikka as
   the voxel line if it survives the partner-deck check.
2. **Verify motion in a browser** — the grounded idle (breathe / blink / weight shift),
   walk, jump, typing, painting, and the pose transitions. Only emitted CSS and
   computed keyframes have been checked.
3. **Small follow-ups awaiting a ruling:** a shared `content` (mouthless) expression
   for every species is a five-file change and was not made — Silmu's `happy` is
   mouthless instead; MoodyRat's lower brow cannot be said per member without a fifth
   dial; the `wave` hand sits inside Silmu's widest point (pose-table reach cutoff);
   tall hats clip the canvas top in `jumping`; the silhouette test is black-on-black on
   the dark page; a low hat hides the Excited/Surprised brows; a hat covers the
   unicorn's horn; round accessories on the voxel face; scenes rendering inside the
   132px fleet cards; avatar stored colour as swatch id rather than hex (better, ~15
   lines, changes the wire shape); the earlier items — mouth widths off head radius,
   Kaveri's freckles, the soft body sheen on Otso and Ytymo.
4. **Then the cull:** delete the losing concepts, the two legacy face renderers and the
   legacy limbs, the dead `blush` colour slot, the exploration sections, the legacy
   PNGs, the `/mascot` route and its proxy entry. Promote the survivors out of
   `concepts/`.
5. **Wiring:** home page hero first (1–3 animated characters, never a gallery); then the
   avatar system — a column, the server-validated contract, a customiser for gamers and
   Gedus, and the identicon swap; the painter motif for empty states.

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
  When the dev server is down, the real components render offline: `npx tsx` with
  `react-dom/server`'s static markup renderer piped into `sharp`, run from the repo
  root — same module graph, no server, much faster than a browser.
- The working rules for the directory (work from the image, rasterise on the dark
  ground, feet are the anchor, where colour comes from, how to verify) live in
  `src/components/mascot/CLAUDE.md` and auto-load there; this file is the state.
- All mascot hex lives in the palette module — the sanctioned exception to the
  no-hardcoded-colours rule, because the art must render in email. Page chrome stays
  on semantic tokens. The exploration files disable the literal-string lint rule
  file-top with the preview-scene justification; nothing here adds `messages/` keys.
