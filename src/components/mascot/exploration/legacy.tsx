/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

/**
 * The legacy strip: every character School of Gaming already had, beside the
 * slot its rebuilt counterpart renders into.
 *
 * The whole section is driven by one table — `LEGACY_ITEMS` — so wiring a
 * newly-built character to the legacy piece it replaces is a single edit to a
 * row, with no markup to touch. A row with no `counterpart` renders an empty
 * tile carrying its `absence` line, which is either "this was deliberately not
 * carried, and here is why" or "this is still being built".
 *
 * Two grounds on purpose. The legacy art was drawn for white paper and several
 * pieces are near-black, so a legacy tile sits on the light end of the token
 * scale; the counterpart sits on the page's own dark card, which is the ground
 * it was actually designed for. Showing both on one ground would flatter one of
 * them and lie about the other.
 *
 * Deleted with the rest of the exploration, along with `public/mascot-legacy/`.
 */

import Image from "next/image";
import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { getConcept } from "../concepts";
import { Mascot, type MascotProps } from "../mascot";
import { swatchHex, tintHex } from "../palette";
import { Rubric } from "./controls";

/**
 * Everything needed to draw one rebuilt character, and nothing else.
 *
 * Deliberately a `Pick` off `MascotProps` rather than a hand-written shape, so
 * the table can only ever name props the component really takes — a row cannot
 * invent a prop, and a renamed prop breaks the table at compile time instead of
 * silently doing nothing. `gaze` is in the list because the five gaze-dial
 * files below are the one place the legacy set and the rebuilt one disagree
 * about what a picture *is*: five drawings there, one value here.
 */
export type CounterpartSpec = Pick<
  MascotProps,
  | "concept"
  | "form"
  | "variant"
  | "pose"
  | "expression"
  | "gaze"
  | "role"
  | "outfit"
  | "prop"
  | "colors"
>;

export type LegacyItem = {
  /** File under `public/mascot-legacy/`, kebab-cased from the original name. */
  file: string;
  /** The name it was delivered under, shown verbatim so it can be searched for. */
  legacyName: string;
  /** What the piece is, in one clause. */
  caption: string;
  /** Which strip it belongs to. */
  strip: "minion" | "cast";
  /** The rebuilt character. Leave undefined and fill `absence` instead. */
  counterpart?: CounterpartSpec;
  /** Why this row has no counterpart. Required whenever `counterpart` is absent. */
  absence?: string;
};

/**
 * A hat colour for a Silmu row. The species is one body and a hat, so a row
 * is told apart by what the hat is dyed — the same swatch list the fleet uses.
 */
function garment(swatch: string): MascotProps["colors"] {
  const hex = swatchHex(swatch);
  return { clothing: hex, clothingAccent: tintHex(hex, 0.84) };
}

/**
 * The mapping table. **This is the plug-in point** — a row gains its rebuilt
 * counterpart by filling `counterpart` and dropping `absence`, and nothing else
 * on the page has to change.
 */
export const LEGACY_ITEMS: readonly LegacyItem[] = [
  // --- the Minion: one body, identity carried entirely by the hat ---------
  {
    file: "minion-blue.png",
    legacyName: "Minion_Blue",
    caption: "Blue cap with a long swept peak. The default of the set.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "amber",
      pose: "idle",
      expression: "excited",
      outfit: { hat: "swept-cap" },
      colors: garment("sky"),
    },
  },
  {
    file: "minion-green.png",
    legacyName: "Minion_Green",
    caption: "Green sprout. The only hat that is not a hat.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "purple",
      pose: "idle",
      expression: "happy",
      outfit: { hat: "sprout" },
      colors: garment("green"),
    },
  },
  {
    file: "minion-orange.png",
    legacyName: "Minion_Orange",
    caption: "Orange beret.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "teal",
      pose: "idle",
      expression: "thinking",
      outfit: { hat: "beret" },
      colors: garment("amber"),
    },
  },
  {
    file: "minion-pink.png",
    legacyName: "Minion_Pink",
    caption:
      "Pink beret. Same hat, different colour — the pair that proves the hat is the identity.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "emerald",
      pose: "idle",
      expression: "surprised",
      outfit: { hat: "beret" },
      colors: garment("pink"),
    },
  },
  {
    file: "minion-red.png",
    legacyName: "Minion_Red",
    caption: "Red ushanka, earflaps down.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "sky",
      pose: "idle",
      expression: "focused",
      outfit: { hat: "earflap-hat" },
      colors: garment("red"),
    },
  },
  {
    file: "sog-tonttu.png",
    legacyName: "sog-tonttu",
    caption: "Santa hat. The seasonal dress-up, done as a separate drawing.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "green",
      pose: "idle",
      expression: "excited",
      outfit: { hat: "santa-hat" },
      colors: garment("red"),
    },
  },
  {
    file: "hello-minion.png",
    legacyName: "hello_minion_SOG@2x",
    caption:
      "Orange beanie, both arms out, standing on a disc. The greeting graphic.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "fuchsia",
      pose: "wave",
      expression: "excited",
      outfit: { hat: "beanie" },
      colors: garment("amber"),
    },
  },
  {
    file: "maalari.png",
    legacyName: "maalari",
    caption:
      "The painter — purple cap, brush and a bucket. A prop in each hand.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "musta",
      pose: "painting",
      expression: "happy",
      prop: "paintbrush",
      outfit: { hat: "painter-cap", extra: "paint-bucket" },
      // One swatch dyes the cap, the bristles, the drips and the tin. The
      // original paints in orange under a purple cap; a single garment slot
      // cannot say both, and the version worth keeping is the one where a
      // painter *is* a colour the product owns.
      colors: garment("purple"),
    },
  },
  {
    file: "extra-1.png",
    legacyName: "extra_1",
    caption: "Blue cap, mid-stride. The one walking frame the set had.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "amber",
      pose: "walking",
      expression: "happy",
      outfit: { hat: "swept-cap" },
      colors: garment("sky"),
    },
  },
  {
    file: "back-minion.png",
    legacyName: "back_minion",
    caption: "Rear view, arms up. No face at all — the silhouette carries it.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "indigo",
      pose: "idle",
      expression: "laughing",
    },
  },
  // The gaze dial: five files, identical but for where the pupil sits.
  {
    file: "alas.png",
    legacyName: "alas",
    caption: "Gaze dial — alas, looking down.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "harmony",
      pose: "idle",
      expression: "happy",
      gaze: "down",
    },
  },
  {
    file: "eteen.png",
    legacyName: "eteen",
    caption: "Gaze dial — eteen, looking forward.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "glow",
      pose: "idle",
      expression: "happy",
      gaze: "forward",
    },
  },
  {
    file: "oikealle.png",
    legacyName: "oikealle",
    caption: "Gaze dial — oikealle, looking right.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "valor",
      pose: "idle",
      expression: "happy",
      gaze: "right",
    },
  },
  {
    file: "vasemmalle.png",
    legacyName: "vasemmalle",
    caption: "Gaze dial — vasemmalle, looking left.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "wit",
      pose: "idle",
      expression: "happy",
      gaze: "left",
    },
  },
  {
    file: "ylos.png",
    legacyName: "ylos",
    caption: "Gaze dial — ylös, looking up.",
    strip: "minion",
    counterpart: {
      concept: "silmu",
      variant: "event",
      pose: "idle",
      expression: "happy",
      gaze: "up",
    },
  },

  // --- the Finnish pun cast ----------------------------------------------
  {
    file: "lukukettu.png",
    legacyName: "lukukettu",
    caption: "Reading fox — lukukettu. Striped scarf and an open book.",
    strip: "cast",
    counterpart: {
      concept: "otso",
      form: "fox",
      variant: "honey",
      pose: "reading",
      expression: "happy",
      outfit: { torso: "scarf" },
      prop: "book",
    },
  },
  {
    file: "esport-pollo.png",
    legacyName: "esport_pollo",
    caption: "Esport owl — gaming headset with a boom mic.",
    strip: "cast",
    counterpart: {
      concept: "otso",
      form: "owl",
      variant: "honey",
      pose: "controller",
      expression: "focused",
      outfit: { hat: "headset" },
      prop: "controller",
    },
  },
  {
    file: "tietopolonen.png",
    legacyName: "tietopolonen",
    caption: "Knowledge owl, on a stack of books with a mug.",
    strip: "cast",
    counterpart: {
      concept: "otso",
      form: "owl",
      variant: "berry",
      pose: "reading",
      expression: "thinking",
      prop: "mug",
    },
  },
  {
    file: "taply.png",
    legacyName: "taply",
    caption: "A very tall pink leopard.",
    strip: "cast",
    // Was the lynx in a berry coat, on the reasoning that the lynx was the
    // nearest Finnish cousin. Both were rasterised beside this file and the
    // leopard won on sight: the rosettes and the long curled tail are what
    // anyone actually looks at here, and the lynx has a stub tail and ear
    // tufts that pull it somewhere else entirely.
    counterpart: {
      concept: "otso",
      form: "leopard",
      variant: "ruusu",
      pose: "idle",
      expression: "happy",
    },
  },
  {
    file: "reksi.png",
    legacyName: "REKSI",
    caption:
      "The headmaster — white beard, sunglasses, purple jacket, briefcase.",
    strip: "cast",
    counterpart: {
      concept: "kaveri",
      form: "elder-b",
      variant: "lilac",
      pose: "idle",
      expression: "happy",
      // No torso garment: the lilac colourway already paints the body the
      // purple of his jacket, and the hoodie on top of it comes out amber.
      outfit: { hat: "cap", face: "shades" },
      prop: "briefcase",
      colors: garment("purple"),
    },
  },
  {
    file: "kanslisti.png",
    legacyName: "kanslisti",
    caption: "The school clerk — headband, knitted sweater, roller skates.",
    strip: "cast",
    counterpart: {
      concept: "kaveri",
      form: "elder-a",
      variant: "coral",
      pose: "wave",
      expression: "happy",
      // No roller skates. Skates are worn on the feet, and there is no foot
      // slot: an accessory is handed the rig and the anchors, and where the
      // feet actually landed is decided by the pose's leg style, which it
      // cannot see. They would be right in `stand` and wrong in every other
      // pose, which is worse than not having them.
      outfit: { face: "specs", torso: "scarf" },
      // Empty hands. The wave puts whatever is held up beside the head, and a
      // clerk waving a clipboard over her shoulder reads as brandishing it.
      prop: "none",
      colors: garment("amber"),
    },
  },
  {
    file: "robokoppi.png",
    legacyName: "robokoppi",
    caption: "A robot with coil arms and round sunglasses.",
    strip: "cast",
    counterpart: {
      concept: "konsu",
      variant: "violet",
      pose: "idle",
      expression: "excited",
      outfit: { face: "shades" },
    },
  },
  {
    file: "nortti.png",
    legacyName: "nortti",
    caption: "Nörtti — a fuzzy dark critter behind enormous round glasses.",
    strip: "cast",
    // Was a Ytymo stand-in. The animal family now has a form built for him:
    // the fur is a lumpy outline rather than a texture, and the antennae and
    // the little wings belong to the body rather than to the wardrobe.
    counterpart: {
      concept: "otso",
      form: "monster",
      variant: "noki",
      pose: "reading",
      expression: "thinking",
      outfit: { face: "specs" },
    },
  },
  {
    file: "polonski.png",
    legacyName: "polonski",
    caption:
      "Black-backed penguin with a yellow face and belly, in a green sweater and orange glasses.",
    strip: "cast",
    // **Polonski is not a bird-in-general and he is not the great tit.** Kyle's
    // ruling, made looking at this file trimmed and blown up to 700px: black
    // back plumage and flipper-arms, a yellow face and belly, a small pink
    // triangular beak, pink webbed feet — a penguin. The tit was chosen here
    // when the only thing anybody had said about the file was "round yellow
    // bird in a jumper", and a great tit is exactly what that description
    // builds: a yellow front under a black cap. Held beside the source at
    // working size the difference is not subtle — the tit's cap sits *on top
    // of* a small round head with cream cheeks, and this drawing's black is a
    // hood *around* one big pale face with a beak in the middle of it.
    //
    // `happy` rather than the drawing's squeezed-shut smile, for a reason that
    // survived the species change: a shut eye is a stroke in the ink colour,
    // and Laughing on any form draws two arcs plus a solid half-ellipse where
    // this face wants its two round pupils. The penguin's pale face would
    // carry a shut eye better than the tit's dark cap did, so this one is now
    // a preference rather than a workaround.
    counterpart: {
      concept: "otso",
      form: "penguin",
      variant: "pingviini",
      pose: "idle",
      expression: "happy",
      outfit: { face: "specs", torso: "tee" },
      colors: garment("green"),
    },
  },
  {
    file: "tippunen.png",
    legacyName: "tippunen",
    caption: "A tiny bird in a pompom beanie.",
    strip: "cast",
    counterpart: {
      concept: "otso",
      form: "tit",
      variant: "tiainen",
      pose: "idle",
      expression: "excited",
      outfit: { hat: "beanie" },
      colors: garment("blue"),
    },
  },
  {
    file: "porriainen.png",
    legacyName: "porriainen",
    caption: "A bug — pink wings, two enormous eyes, six legs.",
    strip: "cast",
    // Two legs rather than six, and no fangs. The extra legs are the rig's
    // limit and the fangs are the face grammar's: the eyes, the antennae and
    // the four wings carry it instead, which is what anyone remembers of this
    // drawing anyway.
    counterpart: {
      concept: "otso",
      form: "bug",
      variant: "berry",
      pose: "wave",
      expression: "excited",
    },
  },
  {
    file: "r-osmo.png",
    legacyName: "R Osmo",
    caption: "Rosvo, the masked raccoon.",
    strip: "cast",
    counterpart: {
      concept: "otso",
      form: "raccoon",
      variant: "rosvo",
      pose: "wave",
      expression: "excited",
    },
  },
  {
    file: "g-raffi.png",
    legacyName: "G raffi",
    caption: "A giraffe in a scarf.",
    strip: "cast",
    counterpart: {
      concept: "otso",
      form: "giraffe",
      variant: "honey",
      pose: "idle",
      expression: "happy",
      outfit: { torso: "scarf" },
    },
  },
  {
    file: "hulmu.png",
    legacyName: "hulmu",
    caption: "A unicorn.",
    strip: "cast",
    counterpart: {
      concept: "otso",
      form: "unicorn",
      variant: "taika",
      pose: "idle",
      expression: "happy",
    },
  },

  // --- voxel, and brand furniture ----------------------------------------
  {
    file: "hipponen.png",
    legacyName: "hipponen",
    caption: "An isometric voxel hippo.",
    strip: "cast",
    counterpart: {
      concept: "palikka",
      form: "hippo",
      variant: "violetti",
      pose: "idle",
      expression: "happy",
    },
  },
  {
    file: "treksi.png",
    legacyName: "treksi",
    caption: "An isometric voxel T-rex.",
    strip: "cast",
    counterpart: {
      concept: "palikka",
      form: "trex",
      variant: "oliivi",
      pose: "wave",
      expression: "happy",
      outfit: { hat: "swept-cap", face: "shades" },
      colors: garment("purple"),
    },
  },
  {
    file: "leima.png",
    legacyName: "leima",
    caption: "The SOG stamp, violet.",
    strip: "cast",
    absence: "A brand mark, not a character. It belongs to the logo system.",
  },
  {
    file: "leima-yellow.png",
    legacyName: "leima_yellow",
    caption: "The SOG stamp, yellow.",
    strip: "cast",
    absence: "Same — a brand mark in its second colourway.",
  },
  {
    file: "ovi.png",
    legacyName: "ovi",
    caption: "A wooden door with a SOG poster on it and a minion at its foot.",
    strip: "cast",
    counterpart: {
      concept: "silmu",
      variant: "musta",
      pose: "painting",
      expression: "happy",
      prop: "paintbrush",
      outfit: { hat: "painter-cap", extra: "paint-bucket", scene: "door" },
      colors: garment("purple"),
    },
  },
];

/** Every tile on this page is this size, legacy and rebuilt alike. */
const TILE = "h-36 w-36";

/** How the rebuilt character is described under its tile. */
function counterpartLabel(spec: CounterpartSpec): string {
  const def = getConcept(spec.concept);
  const form =
    spec.form === undefined
      ? undefined
      : def.forms?.find((f) => f.id === spec.form);
  return form === undefined ? def.species : `${def.species} — ${form.label}`;
}

function LegacyCard({ item }: { item: LegacyItem }): ReactElement {
  return (
    <figure className="w-80 rounded-xl border border-border bg-card p-3">
      <div className="flex gap-2">
        <div className="flex flex-col items-center gap-1">
          {/* The light ground is the point, not a slip: `--muted` is 15%
              lightness on this dark-only theme, and half of this set is a
              near-black blob that would simply disappear on it. `bg-foreground`
              is the light end of the same token scale — a real token, no raw
              colour class — and it is the paper these were drawn for. */}
          <div
            className={`${TILE} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-foreground`}
          >
            {/* Fixed box, `object-contain`: the element is its final size
                before the file arrives, so nothing on the page moves when it
                lands. `unoptimized` because these are throwaway assets that
                are already at their render size. */}
            <Image
              src={`/mascot-legacy/${item.file}`}
              alt={item.legacyName}
              width={256}
              height={256}
              className="h-32 w-32 object-contain"
              unoptimized
            />
          </div>
          <figcaption className="font-mono text-[10px] leading-tight text-muted-foreground">
            {item.legacyName}
          </figcaption>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div
            className={`${TILE} flex shrink-0 items-end justify-center overflow-hidden rounded-lg border border-border bg-background`}
          >
            {item.counterpart === undefined ? (
              <p className="flex h-full items-center px-3 text-center text-[10px] leading-tight text-muted-foreground">
                {item.absence ?? "No counterpart yet."}
              </p>
            ) : (
              <Mascot {...item.counterpart} size={136} />
            )}
          </div>
          <span className="text-[10px] leading-tight text-muted-foreground">
            {item.counterpart === undefined
              ? "—"
              : counterpartLabel(item.counterpart)}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {item.caption}
      </p>
    </figure>
  );
}

function Strip({ strip }: { strip: LegacyItem["strip"] }): ReactElement {
  return (
    <div className="flex flex-wrap gap-3">
      {LEGACY_ITEMS.filter((item) => item.strip === strip).map((item) => (
        <LegacyCard key={item.file} item={item} />
      ))}
    </div>
  );
}

/**
 * The framing: what the old set contained, what was carried over and why, and
 * the trademark problem that forced the rename.
 *
 * Split from the two strips on purpose. The strips are evidence for two
 * different arguments on this page — the Minion files belong beside the Silmu
 * rebuild and the pun cast belongs beside the animal family — so each one is
 * rendered where its argument is being made, and this card holds the part
 * that is about the set as a whole.
 */
export function LegacyOverview(): ReactElement {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Legacy — what School of Gaming already had
        </h2>
        <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          Thirty-four drawings, delivered as flat PNGs. Two things live in
          there: the{" "}
          <strong className="text-foreground">one-eyed black blob</strong> that
          was the mascot proper, and a{" "}
          <strong className="text-foreground">cast of Finnish puns</strong> —
          lukukettu, esport-pöllö, tietopöllönen — plus a handful of pieces that
          are not characters at all. Every one of them appears on this page, on
          the white ground it was drawn for, with the slot for its rebuilt
          counterpart beside it — the Minion files in the Silmu section and the
          cast in the animals section, each next to the work that replaced it.
        </p>
      </div>
      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-3">
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <h4 className="text-sm font-semibold text-foreground">
              What carried over
            </h4>
            <p>
              The <strong className="text-foreground">one big eye</strong>, and
              the fact that a hat is enough to make one body into nine
              characters — which is exactly the accessory-slot argument this
              whole system is built on. The gaze dial carried over as an idea
              too: five files that differ only in where the pupil sits is the
              round-two face grammar written out by hand, one drawing per value.
            </p>
            <p>
              The pun cast carried over as <em>jobs</em> rather than as
              drawings. A fox that reads and an owl in a headset are roles the
              animal family already fills with a form, a prop and an outfit, so
              they cost one row each instead of one illustration each.
            </p>
          </div>
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <h4 className="text-sm font-semibold text-foreground">
              What did not, and why
            </h4>
            <p>
              <strong className="text-foreground">Hipponen and Treksi</strong>{" "}
              were refused for reading as Minecraft, and that was the wrong
              read. The ruling forbids rebuilding a character that already
              exists in somebody else’s game — no creepers, no cows, no
              Steve proportions — and says nothing about blocks. A hippo
              and a T-rex are nobody’s mob, so instead of a refusal they
              got a voxel species of our own.
            </p>
            <p>
              <strong className="text-foreground">
                &ldquo;Finnish fauna only&rdquo; was never a rule
              </strong>{" "}
              — it was a description of the first seven animals that hardened into one, and it
              cost us the unicorn, the giraffe and the raccoon on a technicality. Kyle&rsquo;s
              ruling: School of Gaming is proud to be a Finnish company and highlights Finnish
              nature where it can, and it is also a global company that loves every animal
              including the invented ones. All three are built, and so is the leopard, which no
              longer has to pretend to be a lynx.
            </p>
            <p>
              <strong className="text-foreground">The stamp</strong> is the
              only piece here with no counterpart, and not because anyone
              declined it: it is a brand mark rather than a character, and it
              belongs to the logo system.{" "}
              <strong className="text-foreground">Ovi</strong> looks like the
              same case and is not — a door is scenery, the component
              draws scenery in a slot, so it got built and the painter is
              standing in front of the poster he just put up.
            </p>
          </div>
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <h4 className="text-sm font-semibold text-foreground">The name</h4>
            <p>
              <strong className="text-foreground">
                &ldquo;Minion&rdquo; is Universal&rsquo;s trademark
              </strong>{" "}
              — it is the name of the characters in <em>Despicable Me</em>, and
              a one-eyed yellow-adjacent blob called a minion is not a
              coincidence anyone would believe. The species gets rebuilt under a
              new name; the working proposal is{" "}
              <strong className="text-foreground">Silmu</strong>, Finnish for
              &ldquo;bud&rdquo; and one letter off <em>silmä</em>, eye.
            </p>
            <p>
              The legacy files keep their delivered filenames on this page so
              the old set stays searchable. Nothing here is a live asset — the
              PNGs sit in{" "}
              <code className="text-foreground">public/mascot-legacy/</code> and
              get deleted with the rest of the exploration.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** The fifteen Minion files, beside the Silmu build each one maps to. */
export function LegacyMinionStrip(): ReactElement {
  return (
    <Card>
      <CardContent className="p-6">
        <Rubric
          title="The originals, beside the rebuild"
          note="One body, one eye, two stubby feet. Fifteen files: nine hats, a rear view, and the five-file gaze dial where only the pupil moves."
        />
        <Strip strip="minion" />
      </CardContent>
    </Card>
  );
}

/** The pun cast and the brand furniture, beside whatever now stands for each. */
export function LegacyCastStrip(): ReactElement {
  return (
    <Card>
      <CardContent className="p-6">
        <Rubric
          title="The originals, beside the rebuild"
          note="The Finnish puns, the two voxel animals and the brand furniture. A tile with words in it is a piece that is not being carried over, and says why."
        />
        <Strip strip="cast" />
      </CardContent>
    </Card>
  );
}
