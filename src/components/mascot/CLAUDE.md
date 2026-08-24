# Mascot module — rules, rulings and state

**Status: open exploration, parked on branch `feat/mascot-explorations`.** Nothing
here is live. The branch carries a throwaway page at `/mascot` (public, noindex,
linked from nowhere) and this whole module. This file is everything a session needs
to work here: the working rules first (they outlive any round), then the rulings
already made, then the state of the work and the open items — the part that gets
trimmed at the cull. Last updated 2026-08-24.

# Part one — working rules

## Working from visual references

**Rule: when a design source exists as an image — a legacy asset, a mockup, a
screenshot — derive the spec by looking at the image at working size, never from a
summary of it.** A contact sheet at a few hundred pixels per item is for triage: it
tells you what is in a set, not how anything is built. Before writing a brief, a
component or a description from a reference, render it large (trimmed, roughly 500px
tall, a few side by side) and look at it; state what is there as measurements and
shapes — a proportion, a count, what is *absent* — rather than impressions, and write
the numbers in a comment next to the code that depends on them so the next reader can
check them against the same file. A subagent working from a reference gets the same
instruction and the file path, not a paraphrase. A description relayed through two
briefs is a game of telephone with the source sitting right there, and it is how a
rebuild ends up with the parts the brief happened to mention and none of the ones it
did not.

**Rule: rasterise your own output and look at it, on the dark ground.** Coordinates
that look right in the editor have been wrong every round. The site is dark-only, so
the check is the drawing composited on the page background, beside the reference at
the same pixel height, and again at the avatar sizes (64/40/28) where most uses live.

## Motion

**Rule: feet are the anchor. An idle animation breathes, blinks and shifts its weight;
it does not float.** A character standing on the ground stays on the ground: the body
may expand and settle, the eyes may blink, the head may tilt, the weight may move from
one foot to the other, but the soles keep their y. Lifting the whole figure and setting
it back down reads as hovering, and a hovering character is not standing in the scene
— it is pasted onto it. The only characters that leave the ground at rest are the ones
that can fly and mean to: a winged or elemental creature may hover when its concept
says so, as a deliberate property of that species, never as the default of the rig.
Poses whose whole point is leaving the ground — jumping, walking, anything mid-stride
— move the feet because the action does; that is the action, not a float.

## Simplicity

**Rule: the base form is simple and stripped down; props are the only additive
thing.** A species or form is identified by its silhouette and one or two flat colour
blocks, and nothing else is drawn on it — no seams, folds, sheen, freckles, hairlines,
trims or decorative facets. The test is mechanical: rasterise at 40px with and without
the detail; if the form is still nameable without it, it was an embellishment and
stays off. Where a detail was doing a job (a belly against a body, a muzzle against a
face), one flat colour block does that job instead of a line. A quiet body is what lets
a prop or a hat read as fun rather than as noise, and it is what forces expression to be
deliberate: the symbol face and the posture, not texture.

**Rule: colour carries distinction; detail never does.** Two members of one species
are told apart by body or garment colour from the shared swatch list, because colour
survives every scale and detail survives none.

## Colour

All mascot hex lives in the palette module — the sanctioned exception to the
no-hardcoded-colours rule, because the art has to render inside an email where no CSS
custom property exists. Where a mascot colour is a product colour (a brand colour, a
Yty element, a voice-zone hue, a product-type colour) it is read from the shared hex
constants rather than copied, so a retune of the product palette reaches the art. Page
chrome around the art stays on semantic tokens.

## Verifying

**Rule: no scratch files in the repo, and never a backslash-hex path in any file under
it.** Tailwind v4 scans every file in the project for class candidates, and a Windows
path whose folder name starts with hex digits (the scratchpad's does) is read after its
backslash as a CSS escape — an invalid code point — which fails `globals.css` and takes
down every page on the running site, not only `/mascot`. Render scripts live in the
scratchpad and are run by absolute path (`npx tsx <path>` from the repo root resolves
imports against the repo); paths inside them use forward slashes.

Kyle's dev server is always running on the main checkout; never start another one.
Verify the exploration page through Next (a 200, and no error marker in the HTML)
before reporting — concept definitions carry React components and cannot cross the
server→client boundary, so a page that passes `tsc` can still fail to render.

# Part two — the exploration: rulings, state, open items

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
  everything at once on purpose because that is the better demo. **Amended
  2026-08-24, at nineteen expanded species:** "everything at once" survives as
  "everything the reader can see" — off-screen sections skip layout and paint
  (content-visibility with written-down placeholder heights) and pause their
  animations beyond one viewport of slack, and renders under 64px are static by
  default (a breath there is sub-pixel). Measured on the served page: 6,213
  running animations at 6 fps before, 881 at 61 fps after, with every anchor
  still landing. On-screen behaviour is unchanged.
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
- **Polonski is a penguin.** Kyle's ruling, made from the trimmed original at 700px:
  black back plumage and flipper-arms, a yellow face and belly, a small pink triangular
  beak, pink webbed feet, glasses and a green sweater. The great tit the legacy strip
  first mapped him to was built from a one-line description ("round yellow bird in a
  jumper") rather than from the file, which is exactly the failure the working rule at
  the top of this document exists to prevent. The strip's `polonski` row now points at
  the penguin form.
- **Penguin, otter and hedgehog get their own characters.** Kyle: "those are all cute
  animals that deserve their own mascot / character ideas." Built as three Otso forms
  with a fleet member each — Polonski at the desk, Loiske the icebreaker (otters sleep
  holding paws so they do not drift apart, which is the buddy system), and Piikki on the
  house rules (a hedgehog's defence is to stop, curl up and tell somebody).
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
- **Simplicity is the design philosophy (2026-08-23, afternoon).** Kyle: "Our mascot
  characters should be as simple as possible while still being unique and
  identifiable. Currently our mascots have too many details and embellishments. The
  base form is simple and stripped down. Props are the only additive thing — if the
  design has too much detail, props add noise, not fun. Simple makes things cuter and
  forces us to be deliberate in how we show expression. Colours make things vibrant
  and distinct; colours work at any scale, details do not." The test is the 40px
  raster: a detail whose removal leaves the form nameable was an embellishment.
- **Silmu is the answer to a question, not necessarily the answer.** Kyle worries it
  still reads too close to the trademarked Minions even renamed; what it proved is
  that simplicity works. The direction he wants explored is **more humanoids** — he
  likes Kaveri's shape and the family idea. The reference he remembered from a
  Helsinki neuvola is Mari Huhtala's Terveyskylä illustrations: flat, outline-free,
  one unreal yellow skin for every person, one-shape hair, a lid-oval eye, a pink nose
  dot, four-to-five heads tall, warmth from posture. Kyle also recognises the City of
  Helsinki's illustration lineage (Lille Santanen, Aysha Tengiz, KokoroMoi, Emilia
  Erfving, Riku Ounaslehto — thick ink line, two bold colours plus black and paper,
  unreal skins, long loose figures) and wants an SoG take on both: two Finnish idioms,
  two humanoid concepts, compared side by side. (Checked and ruled out as the memory:
  Neuvokas perhe's outlined cartoon kids and Kela's vector style.)
- **"Inspired by" means learn the grammar, never copy.** Kyle: "I am not looking to
  copy. Not at all. I am wondering if School of Gaming can showcase its love of Finland
  by creating something unique that follows the legacy of famous artists and styles
  that came before. We can learn from the style and create something our own that
  still gives someone the feeling of ‘This is Finnish’." The lineages in play: Mari
  Huhtala (Terveyskylä), the City of Helsinki illustrators, Mauri Kunnas (animals as
  villagers in a warm Finnish world), Tove Jansson (the pen line, quiet creatures in
  Nordic nature). Study each for line, colour discipline, proportion, composition and
  mood; build our own. No borrowed shapes, characters, names, hats, houses or
  silhouettes — anything a Finn could point at and name as someone else’s is out. The
  test is "feels Finnish", not "looks like".
- **Design from function too, not only in the abstract.** Kyle (2026-08-23): look at
  the pages the app already has and ask, for each, "Who sees this — families, parents,
  gamers, gedus, or a combination? What could make it more fun, more lively, more
  colourful, quirky or interesting?" — and let a character arise organically from the
  content it is made for. The survey of surfaces and the ideas it produced are on the
  page; a character that came from a real moment outranks one invented on a sheet.
- **Why SVG characters at all.** Kyle, on the legacy sog.gg site: the AI-generated
  images "looked bad, especially the ones with children in them" — hence the decision
  to draw characters as SVG and go artistic rather than realistic. Nothing in this
  module may drift back toward photorealism, and no AI-generated raster ever stands in
  a person-shaped hole. What the legacy site does offer: hand-cut wobbly icon tiles in
  amber / pink / purple (a flat shape with a torn edge — a frame for busts and cards),
  speech-bubble faces (the symbol face in a bubble — a chat motif), the anti-toxicity
  skull "Toxy" (a friendly villain for the safeguarding pages), a flat platformer
  stage icon (blocks, flag, clouds — a progress scene), the SOG amber beanie with the
  badge patch (the `cap`), and Reksi drawn as a crowned T-rex (the crown is his
  landmark).
- **Silmu never wears goggles.** Goggles on a one-eyed creature recreate the single
  most identifying feature of the trademarked Minions; the goggles accessory is
  excluded for Silmu (and any one-eyed species) as a hard rule, not a styling call.
  Relatedly, Chief Engineer Kyle does not wear goggles either — a hardhat carries the
  builder feeling — and further Chief Engineer explorations are invited. Both halves
  are built: the `goggles` accessory is `notFor: ["silmu"]` and every Chief Engineer
  fleet entry wears the new `hardhat`, with a look row on the page holding the hat
  beside the SOG beanie and a bare head so the choice is visible rather than asserted.
  The candidate row is five bodies now — the beaver, the Palikka voxel builder, the
  Kaveri person, the Lohi engine-room dragon and Silmu.
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
| **Otso** animal family | One rig, per-species head and tail. Twenty forms: bear, fox, moose, owl, lynx, hare, Saimaa ringed seal, gull, penguin, otter, hedgehog, and from the legacy cast raccoon, giraffe, unicorn, leopard, bug, monster, great tit, rat, beaver, Reksi's T-rex. Home of MoodyRat, Lokki the archipelago guide, the beaver Chief Engineer and Polonski. | **Recommended second cast.** The emotional range Kaveri lacks; strongest of everything at avatar sizes. |
| **Taitto** + folds | A being creased out of flat planes. Branches: **Kaari** (round head, soft limbs, faceted body), **Kide** (fully angular, slender, lit crystal chest), **Nappi** (pure proportion change, two heads tall, still all corners). | Kyle's favourite for freshness. **Open question: Nappi vs Kaari** — if Nappi reads as cute while staying angular, Taitto was never cold because of its corners but because it was adult-proportioned, and Kaari conceded a round head it didn't need. Kide fails at avatar sizes. |
| **Ytymo** | Yty-element critter, four element colourways. Rebuilt off the egg (the first version read as an egg / *muna*). | Companion beside a bigger character, not the character. |
| **Konsu** | Handheld console that grew limbs; face is a screen. Got a carry handle and the four Yty elements. | Read as "anyone's robot". Park unless the handle version wins on sight. |
| **Silmu** | The legacy SOG Minion rebuilt: a chunky bean that is its own head, one eye, stem legs, arms only on demand, a hat as the identity. A cyclops face mode, and the `gaze` dial every species now has (the legacy direction sprites were the pupil moved). 25 colourways: the faithful black plus one per swatch, with ink by luminance. | **New, from the legacy set.** Kyle's anatomy notes are applied; proportions are measured off the PNGs and written at the top of the concept. Fleet: Vilkku, Terve, Maalari, Verso, Tonttu, Chief Engineer Kyle. The best avatar in the set at 28px. |
| **Palikka** | Voxel animals (a child's building block): T-rex, hippo, moose. Front-facing with every block as three tones so the shared rig, IK and animations keep working; a square-eyed voxel face mode whose brow is a stair of blocks. | **New, from Hipponen and Treksi.** Reksi — the Princi-Pal is the T-rex. Closest thing in the set to the no-look-alikes line; hold it next to a Roblox partner deck before shipping. |
| **Porukka** | The Huhtala-lineage humanoid crew: flat, outline-free, one warm gold skin for everyone, one-shape hair, the lid-cut eye, a pink nose dot (A/B'd, recommended kept). Nine builds, baby to elder; proportions measured off the Terveyskylä references. | **New — the simplicity philosophy applied to a person.** Fleet: Aino, Väinö, Tuomas, Salla, Helmi, Muru, Chief Engineer Kyle. Bust survives 28px; candidate base model beside Kaveri. |
| **Stadi** | The Helsinki-ink humanoid: a thick hand-drawn line (its own darker ink — the shared ink vanishes on the dark page), two swatch colours plus black and paper per colourway, five heads tall, four age builds. | **New.** On the dark ground the ink lives inside the figure, not on its contour — the all-paper colourway is the strongest. The inked bust is the best portrait in the directory. |
| **Kylä** | The Kunnas-lineage village: six domestic animals (dog, cat, pig, goat, rooster, mouse) as upright villagers with trades, tailored clothes, a village scene, a kantele. No outline — tested three ways and it fades on the dark ground. | **New.** Grammar carried, no shapes borrowed; the ensemble composition is the point. Fleet: Vilja, Tarmo, Piki, Sulo, Aarne, Nyppy. |
| **Metsänväki** | The Jansson-lineage forest folk: one 1.6-unit pen line, one wash per colourway, six quiet creatures (hedgehog, mouse, owl, spirit, tonttu, fox), no ground shadow, a forest-night scene, a lantern. | **New.** Form-by-form distance from the protected Moomin shapes is written in the file. The inverted-ink register is kept as one colourway (hamara), not the species. The fox is the weakest form and says so. |
| **Jalo** | The brand mark that grew feet: the favicon's own hexagon path at scale 1, two eyes (one eye read as a broken favicon), 26 colourways, stem legs. Brought BRAND_RADIUS, the chevron prop, the sog-crest, the crown and the SOG beanie with it. | **New.** Its bust is nearly the favicon with a face — the avatar and the browser tab converge. The Jalo Reksi proved the persona is a set of marks. |
| **Lohi** | The cute dragon cast: three ages, river-named, five river colourways (no black — nothing Ender-shaped), horn nubs, wing lobes, leaf tail, an amber flame on excited only. Grounded on purpose. | **New.** The muzzle-joins-the-silhouette and horns-taper lessons are written at the drawing. Grown and elder merge at 28px; the kid separates. |
| **Galaksi** | The alien crew: a downward-tapering teardrop (the only silhouette that narrows to the chin), one antenna, two eyes (three-eye and one-eye both tested and rejected), six cool skins, a sealed space-helmet every species can wear, a saucer scene, a joystick. | **New — School of Gaming Galactic Oy made visible.** Space is a dress-up preset and the Avaruusviikko holiday (4–10 Oct), not a season. |
| **Marja** | Berry folk: blueberry, lingonberry, cloudberry, strawberry on Silmu's stem-leg rig — the fruit is the head, one green constant for every leaf and stalk. | **New.** The simplicity rule's ideal case; among the strongest avatar tiles in the set. A hat covers the calyx — a real wardrobe cost, stated. |
| **Sieni** | Mushroom folk: chanterelle, porcini, fly agaric (five large dots, the look-don't-eat joke), lid-cut faces on a shared cream stem. | **New.** Split from Marja for stated structural reasons (the cap is a hat; the slots are concept-level). |

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
straw hat, goggles (never on Silmu), hardhat, tool belt, paint bucket, story sprout; scenes door, sign-painting,
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

1. **Kyle's picks, now a longer ballot:** the shipping set (the honest core is Kaveri +
   Otso + Silmu; the new humanoids — Porukka, Stadi — and Jalo are serious challengers,
   and Palikka needs the partner-deck check); the humanoid direction (Kaveri vs Porukka
   vs Stadi); the Chief Engineer body (five candidates, hardhat settled); the Reksi
   body (the riff study's pick is the Otso rex; the crown is disputed — it wins 28px on
   contrast, the shades are the identity); Nappi vs Kaari; whether the entrance
   (walk-in) and the back view get promoted from spikes to named capabilities; the two
   face questions — take the warmer 0.66 pupil across all six moods or not, and
   whether focused should be gentler (the brow angle is the dial).
2. **One live browser pass over motion.** The gait, the jumppa hop and the idle phrase
   are verified frame-by-frame offline (browser-paused renders); nobody has yet sat and
   watched them run on the page.
3. **Small follow-ups awaiting a ruling or a slot:** a shared `content` (mouthless)
   expression is a five-file change (Silmu's `happy` is mouthless meanwhile); a third
   head accessory slot (Reksi wants beard + shades + crown; `beard-shades` is the
   stopgap, and a crown competes with every hat); the accessory/garment **colour-slot
   collision** (a cape on Porukka is always the shirt's colour — needs its own slot
   pair); the `balloons` accessory carries a banned specular highlight and an
   off-centre hack; `wave` + a side-grip prop raises the prop overhead (a waving Reksi
   holds his briefcase in the air); `SymbolMouth` widths are absolute, not scaled off
   the head (hit by four species now; Metsä also wants a `penW` nib width); MoodyRat's
   lower brow needs a fifth dial nobody wants; the `wave` hand sits inside Silmu's
   widest point; tall hats clip the canvas top in `jumping`; the silhouette test is
   black-on-black; a low hat hides the Excited/Surprised brows; a hat covers the
   unicorn's horn (and a headset the rex's); the gamer-role headset dwarfs fused-head
   species; round accessories on the voxel face; scenes render inside the 132px fleet
   cards; avatar stored colour as swatch id rather than hex (~15 lines, changes the
   wire shape); the beard merges into Palikka's cream belly; the rex-hood on Silmu
   needs a look before Silmu ever wears it (close to the banned goggle read); limb
   outlines for the ink species (Stadi's exact `LimbPaint` edit is in its report); the
   sog.gg motifs not yet built — the hand-cut wobbly tiles, the bubble-face chat motif,
   Toxy the friendly villain, the platformer stage scene; the surfaces round's missing
   expressiveness — entry from off-frame, two figures in one composition, a closed
   door, night variants of scenes, a prop that reads as news, a celebration mark, a
   sign that can carry one word.
4. **Then the cull:** delete the losing concepts, the two legacy face renderers and the
   legacy limbs, the dead `blush` colour slot, the exploration sections and spikes, the
   legacy PNGs (`public/mascot-legacy/`), the `/mascot` route and its proxy entry.
   Promote the survivors out of `concepts/`.
5. **Wiring:** home page hero first (1–3 animated characters, never a gallery — the
   walk-in entrance is the candidate); then the avatar system — a column, the
   server-validated contract, a customiser for gamers and Gedus, and the identicon
   swap; the painter motif and the surfaces-round characters for empty states.

## Operational notes

- **Branch off the latest `dev` before resuming and merge it in** — the branch was
  cut 2026-08-22 and will drift.
- Round 1 shipped a server→client boundary error — concept definitions carry React
  components and cannot be passed from the server page to a client component; pass the
  id and look it up client-side.
- When the dev server is down, the real components render offline: `npx tsx` with
  `react-dom/server`'s static markup renderer piped into `sharp`, run from the repo
  root — same module graph, no server, much faster than a browser.
- The exploration files disable the literal-string lint rule file-top with the
  preview-scene justification; nothing here adds `messages/` keys.
