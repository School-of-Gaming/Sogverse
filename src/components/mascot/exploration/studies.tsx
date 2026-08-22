/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

/**
 * Round two's studies: the specific comparisons that were asked for, each one
 * a section that answers a single question by putting two things next to each
 * other.
 */

import { useState, type ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import type { ConceptId } from "../concept";
import { getConcept, TAITTO_FAMILY } from "../concepts";
import { KAVERI_FORMS } from "../concepts/kaveri";
import { OTSO_FORMS } from "../concepts/otso";
import { Mascot } from "../mascot";
import { lookForDate, MASCOT_LOOKS, SEASONS } from "../seasons";
import { FACE_STYLE_LABELS, type FaceStyle } from "../face";
import { EXPRESSION_LABELS, POSE_LABELS, type ExpressionId, type PoseId } from "../vocabulary";
import { ChipRow, Rubric, Tile, type Choice } from "./controls";

/** The species a study offers when it needs one picked. */
/** One line per round on what it was trying to do. */
const FACE_ROUND_NOTES: Record<FaceStyle, string> = {
  symbol: "Live. Four dials, zero detail on any eye or mouth.",
  warm: "Dropped the white eye and kept the highlight — removed the half that worked.",
  legacy: "Symbol grammar for three moods, realism cues stacked on the other three.",
};

const STUDY_SPECIES: Choice<ConceptId>[] = [
  { id: "kaveri", label: "Kaveri" },
  { id: "otso", label: "Otso" },
  { id: "taitto", label: "Taitto" },
  { id: "kaari", label: "Kaari" },
  { id: "kide", label: "Kide" },
  { id: "nappi", label: "Nappi" },
  { id: "ytymo", label: "Ytymo" },
  { id: "konsu", label: "Konsu" },
];

function Panel({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: ReactElement | ReactElement[];
}): ReactElement {
  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-foreground">{title}</h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">{lede}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

// --- 1. faces -------------------------------------------------------------

const ALL_EXPRESSIONS: ExpressionId[] = [
  "happy",
  "excited",
  "laughing",
  "thinking",
  "surprised",
  "focused",
];

/** Newest first, so the eye lands on the live one before the two dead ones. */
const FACE_ROUNDS: FaceStyle[] = ["symbol", "warm", "legacy"];

export function FaceStudy(): ReactElement {
  const [concept, setConcept] = useState<ConceptId>("kaveri");
  const [form, setForm] = useState<string>("kid-a");
  const def = getConcept(concept);
  const activeForm = def.forms?.some((f) => f.id === form) === true ? form : undefined;

  return (
    <Panel
      title="Faces — three goes at the same problem"
      lede="A face here is a symbol system: every part is a flat primitive that means something only through its geometry. An eye is a white ellipse and a pupil, and the mood is the ellipse's size and where the pupil sits in it. A brow is one line doing its work by angle. A mouth is a small curve or a small solid glyph with no interior. Round one had that grammar and only obeyed it for half the set; round two removed the wrong half of what broke it. Round three deletes every realism cue instead."
    >
      <div className="space-y-2">
        <ChipRow label="Species" options={STUDY_SPECIES} value={concept} onChange={setConcept} />
        {def.forms !== undefined && (
          <ChipRow
            label="Build"
            options={def.forms.map((f) => ({ id: f.id, label: f.label }))}
            value={activeForm ?? def.forms[0].id}
            onChange={setForm}
          />
        )}
      </div>
      <div className="space-y-4">
        {FACE_ROUNDS.map((style) => (
          <div
            key={style}
            className={`rounded-lg border p-4 ${
              style === "symbol" ? "border-primary/50 bg-background" : "border-border bg-muted/30"
            }`}
          >
            <Rubric
              title={FACE_STYLE_LABELS[style]}
              note={FACE_ROUND_NOTES[style]}
            />
            <div className="flex flex-wrap gap-3">
              {ALL_EXPRESSIONS.map((expression) => (
                <Tile key={expression} caption={EXPRESSION_LABELS[expression]}>
                  <Mascot
                    concept={concept}
                    {...(activeForm === undefined ? {} : { form: activeForm })}
                    expression={expression}
                    crop="bust"
                    size={132}
                    faceStyle={style}
                  />
                </Tile>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
          <p className="mb-2 font-semibold text-foreground">The four dials, and nothing else</p>
          <p>
            <strong className="text-foreground">Happy</strong> — the Thinking eye with the pupil
            centred; small upward curve; no brow. This is the default face.{" "}
            <strong className="text-foreground">Excited</strong> — the same eye bigger and rounder
            with a bigger pupil, raised arc brows, a bigger open curve.{" "}
            <strong className="text-foreground">Laughing</strong> — eyes closed to two arcs, which
            is a shape change rather than added detail, and one solid mouth glyph.{" "}
            <strong className="text-foreground">Thinking</strong>, {" "}
            <strong className="text-foreground">Surprised</strong> and{" "}
            <strong className="text-foreground">Focused</strong> are round one&rsquo;s, unchanged,
            because they were already doing exactly this.
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
          <p className="mb-2 font-semibold text-foreground">What came off</p>
          <p>
            Eye highlights, eye sparkles, cheek blush, the tongue inside the open mouths, and every
            second colour on a mouth. Each one is a cue that says the thing you are looking at is a
            surface catching light, and there is no light in this drawing for it to catch. Konsu is
            untouched: a screen face is lit flat shapes with no interior, which is the grammar
            everything else was rebuilt to match.
          </p>
        </div>
      </div>
    </Panel>
  );
}

// --- 2. arms --------------------------------------------------------------

const ARM_POSES: PoseId[] = ["wave", "point-right", "hold-up", "walking"];

export function ArmStudy(): ReactElement {
  const [concept, setConcept] = useState<ConceptId>("kaveri");
  return (
    <Panel
      title="Arms — a joint instead of a bow"
      lede="Round one drew a limb as one curved stroke, bowed sideways by a number the pose table carried. That is not an elbow: it is a fixed push, so it bulges the wrong way the moment the hand leaves the character's side, which is exactly the three poses that were called out. Now a limb is two tapered segments meeting at a joint, and the joint is derived from the geometry — outboard of the centre line — so the pose table carries no elbow data at all."
    >
      <ChipRow label="Species" options={STUDY_SPECIES} value={concept} onChange={setConcept} />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-primary/40 bg-background p-4">
          <Rubric title="New — jointed / tapered" note="Which of the two is a property of the species." />
          <div className="flex flex-wrap gap-3">
            {ARM_POSES.map((pose) => (
              <Tile key={pose} caption={POSE_LABELS[pose]}>
                <Mascot concept={concept} pose={pose} size={150} />
              </Tile>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <Rubric title="Old — one bowed stroke" note="The same four poses." />
          <div className="flex flex-wrap gap-3">
            {ARM_POSES.map((pose) => (
              <Tile key={pose} caption={POSE_LABELS[pose]}>
                <Mascot concept={concept} pose={pose} size={150} limbStyle="legacy" />
              </Tile>
            ))}
          </div>
        </div>
      </div>
      <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
        Two styles, chosen per species rather than globally. <strong className="text-foreground">Jointed</strong>{" "}
        solves the elbow properly and suits anything constructed — a person, a robot, a folded
        plane. <strong className="text-foreground">Tapered</strong> puts a soft bend at the
        midpoint and no anatomy at all, which is what a round animal or a spark wants; giving a
        bear cub a visible elbow turns it into a small bodybuilder. Both taper from shoulder to
        wrist and cap with a disc, so a limb still reads as a limb at sixteen pixels.
      </p>
    </Panel>
  );
}

// --- 3. Taitto branches ---------------------------------------------------

const BRANCH_POSES: PoseId[] = ["controller", "point-right", "jumping"];

export function TaittoBranches(): ReactElement {
  return (
    <Panel
      title="Taitto, and three ways to branch off it"
      lede="The fold was the most interesting direction and leaned a tad too hard on geometry. Rather than soften the original and lose what made it sharp, three branches each concede something different — and all four share one palette on purpose, so the comparison is about form and nothing else."
    >
      <div className="grid gap-5 xl:grid-cols-4">
        {TAITTO_FAMILY.map((def) => (
          <div
            key={def.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
          >
            <div className="flex items-end justify-center">
              <Mascot concept={def.id} pose="wave" expression="happy" size={210} />
            </div>
            <div>
              <h4 className="text-lg font-bold text-foreground">{def.species}</h4>
              <p className="text-xs font-medium text-primary">{def.kind}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {BRANCH_POSES.map((pose) => (
                <Mascot key={pose} concept={def.id} pose={pose} size={92} />
              ))}
              <Mascot concept={def.id} pose="idle" size={92} silhouette animated={false} />
            </div>
            <p className="text-xs leading-relaxed text-foreground/80">{def.pitch}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{def.caveat}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// --- 4. the Kaveri family -------------------------------------------------

export function KaveriFamily(): ReactElement {
  const [variant, setVariant] = useState("lilac");
  const variants: Choice<string>[] = getConcept("kaveri").variants.map((v) => ({
    id: v.id,
    label: v.label,
  }));
  return (
    <Panel
      title="The Kaveri family"
      lede="Three kid builds and three adult ones, cued by hair silhouette, build and garment cut — and by nothing else. No makeup on one and not another, no colour coding, no skirt. Each build leans; none of them commits, which is the property worth keeping: a gamer should be able to look at the three kids and decide for themselves which one is them."
    >
      <ChipRow label="Complexion" options={variants} value={variant} onChange={setVariant} />
      <div className="flex flex-wrap items-end justify-center gap-2 rounded-xl border border-border bg-background p-4">
        {KAVERI_FORMS.map((form) => (
          <figure key={form.id} className="flex w-[10.5rem] flex-col items-center gap-1">
            <Mascot concept="kaveri" form={form.id} variant={variant} size={190} />
            <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">
              <span className="block font-medium text-foreground">{form.label}</span>
              {form.note}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="rounded-xl border border-border bg-background p-4">
          <Rubric
            title="A session, as a picture"
            note="A gamer at the desk and their gedu beside it — the shot the site has no photograph for."
          />
          <div className="flex flex-wrap items-end justify-center">
            <Mascot
              concept="kaveri"
              form="adult-b"
              variant="teal"
              role="gedu"
              pose="point-left"
              expression="happy"
              size={300}
            />
            <Mascot
              concept="kaveri"
              form="kid-b"
              variant={variant}
              role="gamer"
              pose="seated"
              expression="excited"
              outfit={{ scene: "desk-setup" }}
              size={340}
            />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <Rubric title="A family" note="Same drawing, four people." />
          <div className="flex flex-wrap items-end justify-center">
            <Mascot concept="kaveri" form="adult-a" variant="coral" role="parent" size={150} />
            <Mascot concept="kaveri" form="kid-a" variant={variant} role="gamer" size={132} />
            <Mascot concept="kaveri" form="kid-c" variant="teal" pose="jumping" expression="laughing" size={132} />
            <Mascot concept="kaveri" form="adult-c" variant="lilac" role="parent" prop="phone" size={150} />
          </div>
        </div>
      </div>
    </Panel>
  );
}

// --- 5. the animal family -------------------------------------------------

export function AnimalLineup(): ReactElement {
  const [variant, setVariant] = useState("honey");
  const variants: Choice<string>[] = getConcept("otso").variants.map((v) => ({
    id: v.id,
    label: v.label,
  }));
  return (
    <Panel
      title="Otso is a family, not a bear"
      lede="A pose sheet is per body plan, not per animal — a bear, a fox, a lynx, a hare, a moose and an owl are all “round torso, four limbs, head on top”, differing above the neck and in one appendage. So an extra species costs a head and a tail, about thirty lines, and seven of them cost less than two whole concepts did. The ringed seal is the deliberate exception: no ears, no tail, and a silhouette that fights the rig."
    >
      <ChipRow label="Coat" options={variants} value={variant} onChange={setVariant} />
      <div className="flex flex-wrap items-end justify-center gap-2 rounded-xl border border-border bg-background p-4">
        {OTSO_FORMS.map((form) => (
          <figure key={form.id} className="flex w-[9.5rem] flex-col items-center gap-1">
            <Mascot concept="otso" form={form.id} variant={variant} size={168} />
            <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">
              <span className="block font-medium text-foreground">{form.label}</span>
              {form.note}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="flex flex-wrap items-end justify-center gap-2 rounded-xl border border-border bg-background p-4">
        <Mascot concept="otso" form="fox" role="gamer" pose="seated" outfit={{ scene: "desk" }} expression="focused" size={210} />
        <Mascot concept="otso" form="owl" role="gedu" pose="reading" expression="thinking" size={190} />
        <Mascot concept="otso" form="seal" role="parent" pose="idle" prop="mug" size={190} />
        <Mascot concept="otso" form="hare" pose="jumping" expression="laughing" size={190} />
        <Mascot concept="otso" form="lynx" pose="walking" expression="focused" size={190} />
      </div>
    </Panel>
  );
}

// --- 6. the desk ----------------------------------------------------------

export function DeskScene(): ReactElement {
  const [concept, setConcept] = useState<ConceptId>("kaveri");
  const def = getConcept(concept);
  const form = def.forms?.[1]?.id ?? def.forms?.[0]?.id;
  return (
    <Panel
      title="At a desk"
      lede="A keyboard and mouse held in mid-air read as a character who had picked them up. Nothing was wrong with the props — what was missing was the desk. Furniture is a scene layer rather than a garment: it draws a chair behind the character and a surface in front, outside every motion group, so it composes with any species and does not breathe along with the person sitting at it."
    >
      <ChipRow label="Species" options={STUDY_SPECIES} value={concept} onChange={setConcept} />
      <div className="flex flex-wrap items-end justify-center gap-4 rounded-xl border border-border bg-background p-6">
        <Mascot
          concept={concept}
          {...(form === undefined ? {} : { form })}
          role="gamer"
          pose="seated"
          expression="excited"
          outfit={{ scene: "desk-setup" }}
          size={420}
        />
        <div className="flex flex-wrap items-end gap-2">
          <Mascot concept={concept} {...(form === undefined ? {} : { form })} pose="seated" expression="focused" outfit={{ scene: "desk" }} size={200} />
          <Mascot
            concept={concept}
            {...(form === undefined ? {} : { form })}
            pose="seated"
            prop="laptop"
            expression="thinking"
            outfit={{ scene: "desk" }}
            size={200}
          />
          <Mascot
            concept={concept}
            {...(form === undefined ? {} : { form })}
            role="gedu"
            pose="seated"
            prop="clipboard"
            outfit={{ scene: "desk-setup" }}
            size={200}
          />
        </div>
      </div>
    </Panel>
  );
}

// --- 7. seasons -----------------------------------------------------------

export function SeasonStrip(): ReactElement {
  const [concept, setConcept] = useState<ConceptId>("kaveri");
  // Resolved during render on both sides of the boundary. `lookForDate`
  // depends only on the Helsinki *calendar date*, so a server render and the
  // hydration that follows it agree unless the two land either side of
  // midnight in Helsinki — which is a millisecond a year and costs a
  // highlight, not a layout.
  const todayId = lookForDate(new Date()).id;

  const def = getConcept(concept);
  const form = def.forms?.[0]?.id;

  return (
    <Panel
      title="Four seasons, six days that matter, and one function"
      lede="A season that only recolours a shirt is invisible on a character wearing no shirt — which is exactly why the round-one palette control appeared to do nothing. A look here is a hat, a scarf, something on the ground and, in summer, a mosquito. `lookForDate` is pure, resolves against the Europe/Helsinki calendar date, and is what a product surface calls when it wants to say “dress for today” and never think about the calendar again."
    >
      <ChipRow label="Species" options={STUDY_SPECIES} value={concept} onChange={setConcept} />
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background p-4">
        {MASCOT_LOOKS.map((look) => {
          const isToday = look.id === todayId;
          const isSeason = (SEASONS as readonly string[]).includes(look.id);
          return (
            <figure
              key={look.id}
              className={`flex w-[9.5rem] flex-col items-center gap-1 rounded-lg border p-2 ${
                isToday ? "border-primary bg-primary/10" : "border-transparent"
              }`}
            >
              <Mascot
                concept={concept}
                {...(form === undefined ? {} : { form })}
                look={look.id}
                pose={isSeason ? "idle" : "wave"}
                expression="happy"
                size={150}
              />
              <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">
                <span className="block font-medium text-foreground">
                  {look.label}
                  {isToday ? " · today" : ""}
                </span>
                {look.note}
              </figcaption>
            </figure>
          );
        })}
      </div>
      <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
        The boundaries are a product judgement, written down in one place because Finland has no
        single official answer — the meteorological definition moves every year and by hundreds of
        kilometres of latitude, and the astronomical one puts midsummer at the start of summer,
        which no Finn experiences that way. These are calendar dates matched to how the year is
        lived in the south: <strong className="text-foreground">talvi</strong> 1 Dec – 15 Mar,{" "}
        <strong className="text-foreground">kevät</strong> 16 Mar – 31 May,{" "}
        <strong className="text-foreground">kesä</strong> 1 Jun – 31 Aug,{" "}
        <strong className="text-foreground">syksy</strong> 1 Sep – 30 Nov. A holiday wins over its
        season; Easter is computed, and juhannus is found by looking for the Friday between the
        19th and the 25th of June.
      </p>
    </Panel>
  );
}

// --- 8. motion ------------------------------------------------------------

const MOTION_POSES: PoseId[] = [
  "idle",
  "wave",
  "walking",
  "jumping",
  "controller",
  "keyboard-mouse",
  "seated",
  "laptop",
  "reading",
  "point-left",
  "point-right",
  "hold-up",
];

export function MotionRow(): ReactElement {
  const [concept, setConcept] = useState<ConceptId>("kaveri");
  const [expression, setExpression] = useState<ExpressionId>("happy");
  return (
    <Panel
      title="Every pose owns its animation"
      lede="Round one shared one near-invisible idle loop across every pose — a two-and-a-half pixel rise and a degree and a half of tilt — and it read as a glitch rather than as a decision. Motion too small to be intentional is worse than none, because the viewer notices something moved and cannot tell what. So the amplitudes are legible now and the motion belongs to the pose: walking walks, a jump has anticipation and a landing, thumbs tap on a controller, fingers move on a keyboard, a page gets turned, a laptop screen pulses."
    >
      <div className="space-y-2">
        <ChipRow label="Species" options={STUDY_SPECIES} value={concept} onChange={setConcept} />
        <ChipRow
          label="Mood"
          options={(["happy", "excited", "laughing", "focused", "thinking", "surprised"] as ExpressionId[]).map(
            (id) => ({ id, label: EXPRESSION_LABELS[id] }),
          )}
          value={expression}
          onChange={setExpression}
        />
      </div>
      <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-background p-4">
        {MOTION_POSES.map((pose) => (
          <Tile key={pose} caption={POSE_LABELS[pose]}>
            <Mascot
              concept={concept}
              pose={pose}
              expression={expression}
              {...(pose === "seated" ? { outfit: { scene: "desk" } } : {})}
              size={158}
            />
          </Tile>
        ))}
      </div>
      <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
        The mood reaches outside the head for one thing only: the pace of the body loop. Excited
        bounces, laughing shakes, focused stops moving altogether. Everything else an expression
        does is still an eye swap and a mouth swap. Turning motion off leaves the identical still
        image, standing on the pose&rsquo;s own key frame — which is what an email client and a
        rasteriser see, and why the jump&rsquo;s key frame is the apex rather than the ground.
      </p>
    </Panel>
  );
}
