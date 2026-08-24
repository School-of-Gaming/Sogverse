/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

/**
 * The simplicity audit — every base form, before and after the strip-down.
 *
 * Kyle's ruling: *"colours work at any scale, details do not"*, and the base
 * form is stripped to whatever identifies it while props stay the only
 * additive layer. This section is the evidence for one pass of that ruling
 * across all ten species, laid out so it can be disagreed with: four tiles a
 * row, the same character at 200 and at 40 pixels, before on the left of each
 * pair and after on the right.
 *
 * **The 40px pair is the whole argument and the 200px pair is context.** The
 * test was mechanical rather than aesthetic — rasterise at 40, remove the
 * detail, rasterise again, and if the two pictures are the same picture then
 * the detail was never in the small read and comes off. Fourteen of the thirty
 * four forms in the fleet came out *pixel-identical* at 40px after the pass,
 * which is the strongest possible statement that what was removed was
 * decoration: not "you cannot really see it", but "it is not there".
 *
 * ## Why the before is a PNG and the after is live
 *
 * There is only one copy of each concept file, and it is the stripped one.
 * The before column is therefore a raster taken off `HEAD` before the edit and
 * parked under `public/mascot-legacy/before/`, on the same `#121212` ground the
 * page paints, at exactly the pixel size it is displayed at. The after column
 * is the real component, so it cannot drift from the code the way a checked-in
 * picture would — and if a later change makes an after tile disagree with its
 * caption, that is the caption being wrong rather than the picture.
 *
 * The one honest artefact of that arrangement: at 40px the before tile is a
 * 40×40 bitmap and the after tile is an SVG, so on a high-density display the
 * after is drawn at device resolution and the before is not. Compare the two
 * for *what is there*, not for crispness.
 *
 * Deleted with the rest of the exploration, along with the before PNGs.
 */

import Image from "next/image";
import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import type { ConceptId } from "../concept";
import { getConcept } from "../concepts";
import { Mascot } from "../mascot";
import { Rubric } from "./controls";

type AuditRow = {
  concept: ConceptId;
  /** The build shown, when the species has more than one. Its flagship. */
  form?: string;
  /** Basename under `public/mascot-legacy/before/`, without the size suffix. */
  before: string;
  /**
   * How many of the 1600 pixels in the 40px raster changed by more than a
   * just-noticeable amount. Zero is the interesting number: it means every
   * mark removed was already absent at this size.
   */
  changed40: number;
  removed: string;
  kept: string;
  /** What a removed detail's job was handed to, when it had one. */
  toColour?: string;
};

/**
 * The ten species, in the order the page presents them.
 *
 * `changed40` is measured rather than estimated: each figure is the count of
 * pixels differing by more than six of 255 between the before and after 40px
 * rasters of that row's exact build, out of 1600.
 */
const ROWS: readonly AuditRow[] = [
  {
    concept: "kaveri",
    form: "kid-a",
    before: "kaveri",
    changed40: 24,
    removed:
      "Freckles (four dots a face), the two hoodie seams down the chest, the adults' placket strip, the pocket, and the shaded crease across the elder's beard.",
    kept:
      "The hair silhouette — that is the entire six-build family system, and it is a flat block against a flat head, so it survives every scale. The collar shape (hood ellipse on a kid, V and lapels on an adult) is the one build cue that is neither hair nor shoulder width. Ears and neck.",
  },
  {
    concept: "otso",
    form: "bear",
    before: "otso",
    changed40: 0,
    removed:
      "Across all sixteen forms: the soft body sheen, the muzzle philtrum, the whiskers. Per form: the seal's belly speckles, the owl's and tit's chest arcs and the owl's brow ticks, the raccoon's and leopard's dashed tail bands, the leopard's face rosettes, the giraffe's two cheek patches, the unicorn's horn bands and nostril pips, the fox's tail tip, the outline round the bug's wings.",
    kept:
      "The owl's disc rims — tested, and the one candidate that failed: without them an owl is two pale circles on a round head, which is what the pre-disc version was and it read as a cat. The leopard's body rosettes and the giraffe's body and neck patches (already gated a level looser than filigree, and still visible at 40px). The tit's cap and stripe, the raccoon's mask, the fox's and lynx's ruffs, the monster's lumpy edge, the ear inner blocks, and every muzzle and nose.",
    toColour:
      "The raccoon's and leopard's tails are now one flat colour each, where a dash pattern used to band them. The bug's four wings lost their outline and gained the accent colour: unoutlined and pale, all four merged into one cream mass with the belly, and four is what the wings are for.",
  },
  {
    concept: "taitto",
    before: "taitto",
    changed40: 5,
    removed:
      "The crease strokes across the chest, the hips and the brow, and the second facet on the floating shard.",
    kept:
      "Every plane. A Taitto is planes, and a plane is a flat colour block — the hexagon's lit top and shaded right face, the torso's shaded half, the chest diamond. The creases were redrawing the edges between those blocks a second time; the colour change already is the fold.",
  },
  {
    concept: "kaari",
    before: "kaari",
    changed40: 75,
    removed:
      "The chest crease, the shard's second facet, and — the only non-filigree removal here — both shading shapes on the head.",
    kept:
      "The body's planes. The head shading was the parent's fold planes carried onto a shape that has no folds: a sphere's light and shade, a material cue rather than a colour block. This concept's own landmark reads \"a plain circle head over a chevron body\"; the head is now plain, which is what it always claimed to be.",
  },
  {
    concept: "kide",
    before: "kide",
    changed40: 21,
    removed:
      "The refraction lines off the core, the crease strokes on the chest, brow and face, the shard's second facet — and the core's second, smaller diamond.",
    kept:
      "The prism planes on head and body: they are the species, and a Kide in one flat colour is a hexagon. The core, now a single diamond in the accent.",
    toColour:
      "The core used to be a pale diamond with a small lit one inside it. It is now one diamond in the lit colour — the landmark says \"one lit diamond at the chest\" and it was drawing two, the inner one being about two pixels at 40px.",
  },
  {
    concept: "nappi",
    before: "nappi",
    changed40: 4,
    removed: "The two crease strokes, chest and brow, and the shard's second facet.",
    kept:
      "Every plane. On the one concept designed to be looked at small, a stroke that only exists above 96px was decoration at the size nobody uses this species at.",
  },
  {
    concept: "ytymo",
    before: "ytymo",
    changed40: 0,
    removed:
      "The soft sheen up the left flank, the four loose motes in the corners of the canvas, and the small smile stroke inside the Wit sign.",
    kept:
      "The notched top and its two licks (the silhouette, and the whole reason this stopped being an egg), the underside plane, the belly ellipse, and the element sign overhead.",
  },
  {
    concept: "konsu",
    before: "konsu",
    changed40: 58,
    removed:
      "The two vent slats, the diagonal screen glint — a reflection, on the one surface that is entirely face — the two round buttons on the belly, and the handle's grip line and bolt heads.",
    kept:
      "The d-pad, and this is the judgement call in the set. Strictly the test kills it with everything else, because at 40px a Konsu is a dark bot with a lit face and a handle and nothing on the belly survives. But the d-pad is the only shape on the character that says console rather than robot, and \"reads as anyone's robot\" is this concept's standing criticism. The marquee's four element pips stay too: four colours in a row is colour doing distinction.",
    toColour:
      "The d-pad is now one flat cross rather than two crossed bars, and the element pip moved into the space the two round buttons vacated.",
  },
  {
    concept: "silmu",
    before: "silmu",
    changed40: 0,
    removed:
      "Nothing. This concept was already drawn to the rule, which is most of what it proved — three marks on the body and a file that already argued in prose why there is no sheen on it.",
    kept:
      "The bean, the underside plane, and the contour. The contour is the one thing here that looks like decoration and is not: the faithful body is #141414 on a #121212 page, so removing it does not soften the 40px read, it deletes it. It is drawn only on colourways too dark to have an edge.",
  },
  {
    concept: "palikka",
    form: "trex",
    before: "palikka",
    changed40: 0,
    removed:
      "Every nostril — the T-rex's and elk's pips and the hippo's skewed pair on the snout's top face — and the three hairlines ruled across the belly.",
    kept:
      "The three faces of every cube: not shading, but the entire style, and three flat blocks per block rather than a gradient on one. The cream belly. And the coloured band on every head — the T-rex's red patch is the strongest 40px landmark any of these builds has, because at 28px it is simply the one with the red mouth.",
  },
];

/**
 * The tile a drawing sits in, per size. Each is the drawing's own size plus a
 * little air, and no more: a 40-pixel picture parked in the middle of a
 * 200-pixel box is dead space, and reserving room for something that can never
 * fill it is its own kind of wrong.
 */
const TILE = { 200: "h-[216px] w-[216px]", 40: "h-14 w-14" } as const;

/** One before/after pair at one size, on the ground the page actually paints. */
function Pair({
  label,
  size,
  beforeSrc,
  after,
}: {
  label: string;
  size: 200 | 40;
  beforeSrc: string;
  after: ReactElement;
}): ReactElement {
  return (
    <figure className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <div
          className={`${TILE[size]} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background`}
        >
          {/* A fixed box at its final size before the file arrives, so nothing
              on the page moves when it lands. `unoptimized` because these are
              throwaway rasters already at exactly their render size. */}
          <Image
            src={beforeSrc}
            alt={`${label}, before the simplicity pass`}
            width={size}
            height={size}
            unoptimized
          />
        </div>
        <div
          className={`${TILE[size]} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary/50 bg-background`}
        >
          {after}
        </div>
      </div>
      <figcaption className="text-[11px] leading-tight text-muted-foreground">
        {label} — <span className="opacity-70">before</span> |{" "}
        <span className="text-primary">after</span>
      </figcaption>
    </figure>
  );
}

function AuditCard({ row }: { row: AuditRow }): ReactElement {
  const def = getConcept(row.concept);
  const form = row.form === undefined ? undefined : def.forms?.find((f) => f.id === row.form);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h4 className="text-lg font-semibold text-foreground">{def.species}</h4>
        {form !== undefined && (
          <span className="text-xs text-muted-foreground">{form.label}</span>
        )}
        <span
          className={
            row.changed40 === 0
              ? "ml-auto text-xs font-medium text-primary"
              : "ml-auto text-xs text-muted-foreground"
          }
        >
          {row.changed40 === 0
            ? "40px raster: pixel-identical"
            : `40px raster: ${row.changed40} of 1600 pixels changed`}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-start gap-6">
        <Pair
          label="200px"
          size={200}
          beforeSrc={`/mascot-legacy/before/${row.before}-200.png`}
          after={<Mascot concept={row.concept} form={row.form} size={200} animated={false} />}
        />
        <Pair
          label="40px"
          size={40}
          beforeSrc={`/mascot-legacy/before/${row.before}-40.png`}
          after={<Mascot concept={row.concept} form={row.form} size={40} animated={false} />}
        />
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-3 text-[12px] leading-snug md:grid-cols-3">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Removed
          </dt>
          <dd className="mt-1 text-muted-foreground">{row.removed}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Kept as identity
          </dt>
          <dd className="mt-1 text-muted-foreground">{row.kept}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Changed to colour
          </dt>
          <dd className="mt-1 text-muted-foreground">
            {row.toColour ?? "Nothing — every job a removed detail was doing was already being done by a block next to it."}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function SimplicityAudit(): ReactElement {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          The simplicity audit — what came off every base form
        </h2>
        <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          One pass over all ten species against the ruling that{" "}
          <strong className="text-foreground">
            the base form is stripped down and props are the only additive
            thing
          </strong>
          . The test was not taste: rasterise at 40 pixels, take the detail off,
          rasterise again, and keep it off unless the small picture stopped
          being nameable. Every row below is one species&rsquo; flagship build,
          before and after, at the size the design is argued about and at the
          size it is actually used.
        </p>
      </div>
      <Card>
        <CardContent className="space-y-3 p-6">
          <Rubric
            title="What the numbers mean"
            note="Each row states how much of its 40-pixel raster actually changed."
          />
          <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
            Fourteen of the thirty-four builds in the fleet came out{" "}
            <strong className="text-foreground">pixel-identical at 40px</strong>{" "}
            — bear, elk, owl, lynx, hare, seal, monster, great tit, rat, Ytymo,
            Silmu and all three Palikka builds. Not &ldquo;you cannot really see
            the difference&rdquo;: the removed marks were not in that picture at
            all, because they sat behind the detail system&rsquo;s top level and
            that level never runs below 96 pixels. Everything they were doing,
            they were doing on the one size a mascot is least often rendered at.
          </p>
          <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
            Where a number is not zero, look at the 40px pair and decide whether
            the species is still nameable. Three of them —{" "}
            <strong className="text-foreground">the raccoon, the beaver and the bug</strong>{" "}
            — read <em>better</em> after: a dashed tail and a scored paddle
            were a smear at that size and are now a clean curl and a clean
            paddle, and the bug&rsquo;s wings only read as wings at all once
            they stopped being cream against a cream belly.
          </p>
        </CardContent>
      </Card>
      <div className="space-y-4">
        {ROWS.map((row) => (
          <AuditCard key={`${row.concept}-${row.form ?? "default"}`} row={row} />
        ))}
      </div>
      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-2">
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <h4 className="text-sm font-semibold text-foreground">
              What survived the test, and why it is worth saying
            </h4>
            <p>
              Two removals were tried and put back, and they are the useful
              half of the exercise.{" "}
              <strong className="text-foreground">The owl&rsquo;s disc rims</strong>{" "}
              look exactly like decoration — a stroke round a circle — and are
              the landmark: the version without them was two pale circles on a
              round head, and it read as a cat.{" "}
              <strong className="text-foreground">Silmu&rsquo;s contour</strong>{" "}
              looks like a style and is a legibility fix, drawn only on bodies
              too dark to have an edge against this page.
            </p>
            <p>
              The pattern in both: a mark that is doing the job of{" "}
              <em>separating one shape from another</em> is structure, and a
              mark that is doing the job of describing a surface — sheen, seam,
              fur, dash, rivet — is decoration.
            </p>
          </div>
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <h4 className="text-sm font-semibold text-foreground">
              What this changes about the detail system
            </h4>
            <p>
              <code className="text-foreground">detail.ts</code> stays exactly
              as it was — three levels, the same thresholds. What changed is
              that the top level now has far less on it, because the base form
              has less on it. The filigree pass is close to empty for most
              species, which is the right end state: a level of detail exists so
              a drawing can shed decoration gracefully, not so it can have
              decoration in the first place.
            </p>
            <p>
              Faces, rigs, poses, props and accessories were not touched. Props
              are the additive layer and this pass is what makes room for them.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
