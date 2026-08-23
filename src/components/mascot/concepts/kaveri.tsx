/**
 * Kaveri — the stylised person, and now a whole family of them.
 *
 * "Kaveri" is Finnish for buddy, and this is the concept that exists for the
 * hardest job in the brief: standing exactly where a photograph of a child
 * would stand. It is a person shape, so a hero image with a Kaveri in it reads
 * as a hero image with a *kid* in it, which no droplet or bear can do.
 *
 * ## Unreal complexions are the safeguard, not a flourish
 *
 * Lilac, teal, coral. An illustrated person in a plausible skin tone invites
 * the question of which child it is meant to be; an illustrated person in
 * lilac does not. Same silhouette, none of the problem. This is why no
 * colourway here will ever be a brown, a beige or a pink that could be read as
 * a complexion, and why the customisation layer cannot reach `bodyTop`.
 *
 * ## Six builds, and what they are and are not doing
 *
 * Round two asked whether one Kaveri could be a family: a kid who reads
 * girl-ish, one who reads boy-ish, one who reads as neither, and three adults
 * to match. The six forms below are that family.
 *
 * The cues are **hair silhouette, build and garment cut**, in that order of
 * strength, and nothing else. There is no makeup, no eyelashes on one and not
 * the other, no colour coding, no skirt. Those are the shortcuts that would
 * make this a set of stereotypes instead of a set of people, and they are also
 * the ones that stop working the moment a real child looks at them and does
 * not see themselves.
 *
 * What is deliberately preserved is the **ambiguity**. Kyle's read of round
 * one was that Kaveri "looks like a girl but not only a girl", and that is the
 * property worth keeping: each build leans, none of them commits. A gamer
 * should be able to look at any of the three kids and decide for themselves
 * which one is them. So `kid-b` is not "the boy" — it is the one with the
 * short crop, and a great many girls have a short crop.
 *
 * The adults differ from the kids in **proportion** rather than in detail: a
 * smaller head against a longer body is the whole of what makes a drawn figure
 * read as grown up, and it is worth more than any amount of costume.
 */

import type { ReactElement } from "react";

import type { ConceptDef, FormDef, PartProps } from "../concept";
import { showsFiligree } from "../detail";
import { KAVERI_VARIANTS, MASCOT_INK, mixHex, shadeHex } from "../palette";
import type { Rig } from "../rig";

export const KAVERI_FORMS: readonly FormDef[] = [
  { id: "kid-a", label: "Kid — long hair", note: "Leans girl-ish. The round-one Kaveri." },
  { id: "kid-b", label: "Kid — short crop", note: "Leans boy-ish. Same face, same build." },
  { id: "kid-c", label: "Kid — tuft", note: "Reads as neither. Undercut and a top tuft." },
  { id: "adult-a", label: "Adult — long hair", note: "Leans woman-ish. A parent or a gedu." },
  { id: "adult-b", label: "Adult — short hair", note: "Leans man-ish. Broader shoulders." },
  { id: "adult-c", label: "Adult — bob", note: "Reads as neither. The middle build." },
  {
    id: "elder-a",
    label: "Elder — curls",
    note: "White curls under a headband. Narrow shoulders.",
  },
  {
    id: "elder-b",
    label: "Elder — beard",
    note: "White hair and a full beard. The broadest build here.",
  },
];

/**
 * White hair, which is not white.
 *
 * Every complexion in this concept is a pastel, and off-white hair on a pastel
 * head is two light values with nothing between them - at portrait size the
 * hair stops being a silhouette and the build cue that tells the elders apart
 * from the adults goes with it. So the hair is the shared paper mixed a sixth
 * of the way towards the soft line colour: still unmistakably white hair
 * against the dark page, with just enough grey in it to hold an edge against
 * a lilac, a teal or a coral face.
 */
const ELDER_HAIR = mixHex(MASCOT_INK.paper, MASCOT_INK.lineSoft, 0.17);
const ELDER_HAIR_SHADE = shadeHex(ELDER_HAIR, 0.12);

const KID: Rig = {
  shadow: { cx: 100, cy: 186, rx: 34, ry: 6 },
  hip: { x: 100, y: 142 },
  hipSpread: 14,
  footY: 178,
  footStyle: "boot",
  shoulderL: { x: 72, y: 100 },
  shoulderR: { x: 128, y: 100 },
  head: { x: 100, y: 55, r: 28 },
  eyeDx: 12.5,
  eyeY: 57,
  eyeR: 6.4,
  mouthY: 73,
  crown: { x: 100, y: 31 },
  crownW: 54,
  reach: 0,
  limbW: 11,
  handR: 8,
  limbStyle: "jointed",
  armLen: 62,
  legLen: 44,
  torso: { x: 72, y: 94, w: 56, h: 52 },
  fusedHead: false,
};

/**
 * Smaller head, higher shoulders, longer legs. Nothing else changes, and
 * nothing else needs to: head-to-body ratio is the entire language of drawn
 * age.
 */
const ADULT: Rig = {
  shadow: { cx: 100, cy: 187, rx: 32, ry: 6 },
  hip: { x: 100, y: 130 },
  hipSpread: 14,
  footY: 181,
  footStyle: "boot",
  shoulderL: { x: 71, y: 80 },
  shoulderR: { x: 129, y: 80 },
  head: { x: 100, y: 40, r: 21 },
  eyeDx: 9.6,
  eyeY: 42,
  eyeR: 5.1,
  mouthY: 54,
  crown: { x: 100, y: 22 },
  crownW: 42,
  reach: 0,
  limbW: 9.5,
  handR: 7,
  limbStyle: "jointed",
  armLen: 72,
  legLen: 58,
  torso: { x: 71, y: 75, w: 58, h: 56 },
  fusedHead: false,
};

/** Shoulder width is the one build cue that is not hair. */
function withShoulders(base: Rig, halfWidth: number): Rig {
  return {
    ...base,
    shoulderL: { x: 100 - halfWidth, y: base.shoulderL.y },
    shoulderR: { x: 100 + halfWidth, y: base.shoulderR.y },
    torso: { ...base.torso, x: 100 - halfWidth - 1, w: halfWidth * 2 + 2 },
  };
}

function rigFor(form: string): Rig {
  switch (form) {
    case "kid-b":
      return withShoulders(KID, 30);
    case "kid-c":
      return withShoulders(KID, 29);
    case "adult-a":
      return withShoulders(ADULT, 27);
    case "adult-b":
      return withShoulders(ADULT, 33);
    case "adult-c":
      return withShoulders(ADULT, 30);
    // The two elders differ from each other by more shoulder than any other
    // pair in the family, because they are the two builds whose hair reads
    // most alike at a distance: both are a pale mass on a pastel head, so the
    // body has to do the work the hair cannot.
    case "elder-a":
      return withShoulders(ADULT, 26);
    case "elder-b":
      return withShoulders(ADULT, 34);
    case "kid-a":
    default:
      return withShoulders(KID, 28);
  }
}

const ADULT_FORMS = new Set(["adult-a", "adult-b", "adult-c", "elder-a", "elder-b"]);

/** The two builds that wear their hair white. */
const ELDER_FORMS = new Set(["elder-a", "elder-b"]);

function Body({ rig, colors, form, detail }: PartProps): ReactElement {
  const t = rig.torso;
  const adult = ADULT_FORMS.has(form);
  const midX = rig.head.x;
  return (
    <g>
      {/* neck */}
      <rect
        x={midX - rig.head.r * 0.28}
        y={rig.head.y + rig.head.r * 0.62}
        width={rig.head.r * 0.56}
        height={t.y - rig.head.y - rig.head.r * 0.5}
        rx={rig.head.r * 0.2}
        fill={colors.bodyBottom}
      />
      {/* torso garment */}
      <path
        d={`M ${t.x} ${t.y + 10} C ${t.x} ${t.y - 2} ${t.x + t.w * 0.24} ${t.y - 7} ${t.x + t.w / 2} ${t.y - 7} C ${t.x + t.w * 0.76} ${t.y - 7} ${t.x + t.w} ${t.y - 2} ${t.x + t.w} ${t.y + 10} L ${t.x + t.w} ${t.y + t.h - 6} Q ${t.x + t.w} ${t.y + t.h + 3} ${t.x + t.w - 10} ${t.y + t.h + 3} L ${t.x + 10} ${t.y + t.h + 3} Q ${t.x} ${t.y + t.h + 3} ${t.x} ${t.y + t.h - 6} Z`}
        fill={colors.accent}
      />
      {adult ? (
        // A collar and a placket: the cut that reads as a grown-up's clothes.
        <>
          <path
            d={`M ${midX - 13} ${t.y - 5} L ${midX} ${t.y + 13} L ${midX + 13} ${t.y - 5} L ${midX + 6} ${t.y - 8} L ${midX} ${t.y + 2} L ${midX - 6} ${t.y - 8} Z`}
            fill={colors.panel}
          />
          <rect
            x={midX - 2}
            y={t.y + 12}
            width={4}
            height={t.h - 24}
            rx={2}
            fill={colors.panel}
            opacity={0.6}
          />
        </>
      ) : (
        // A hood collar: the cut that reads as a kid's clothes.
        <ellipse cx={midX} cy={t.y - 1} rx={t.w * 0.46} ry={10} fill={colors.panel} />
      )}
      <rect
        x={midX - 16}
        y={t.y + t.h * 0.52}
        width={32}
        height={17}
        rx={8.5}
        fill={colors.panel}
        opacity={0.5}
      />
      {showsFiligree(detail) && (
        <>
          <path
            d={`M ${midX - 7} ${t.y + 8} L ${midX - 8} ${t.y + 22}`}
            stroke={colors.panel}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <path
            d={`M ${midX + 7} ${t.y + 8} L ${midX + 8} ${t.y + 20}`}
            stroke={colors.panel}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </>
      )}
    </g>
  );
}

/**
 * The hair, which is doing almost all of the work of telling six people apart.
 * Every shape here is drawn against the same head, so a form change never
 * moves an eye, a mouth or a shoulder — which is what lets the family read as
 * one family rather than as six drawings.
 */
function Hair({ rig, colors, form }: PartProps): ReactElement {
  const { x, y, r } = rig.head;
  const hair = ELDER_FORMS.has(form) ? ELDER_HAIR : colors.limb;

  /**
   * The cap. Every build starts from the same solid shape over the crown and
   * differs in where its bottom edge sits and what hangs off it — which is
   * what keeps six heads looking like one drawing.
   */
  const cap = (bottom: number) =>
    `M ${x - r * 1.03} ${y + r * bottom} C ${x - r * 1.16} ${y - r * 1.55} ${x + r * 1.16} ${y - r * 1.55} ${x + r * 1.03} ${y + r * bottom} Z`;

  /** One lock of hair down the side of the face, both sides at once. */
  const locks = (to: number, width: number, from = -0.5) => (
    <>
      <path
        d={`M ${x - r * 1.03} ${y + r * from} L ${x - r * (1.03 - width)} ${y + r * from} L ${x - r * (1.03 - width)} ${y + r * to} Q ${x - r * (1.03 - width / 2)} ${y + r * (to + 0.22)} ${x - r * 1.03} ${y + r * to} Z`}
      />
      <path
        d={`M ${x + r * 1.03} ${y + r * from} L ${x + r * (1.03 - width)} ${y + r * from} L ${x + r * (1.03 - width)} ${y + r * to} Q ${x + r * (1.03 - width / 2)} ${y + r * (to + 0.22)} ${x + r * 1.03} ${y + r * to} Z`}
      />
    </>
  );

  switch (form) {
    case "kid-b":
      // A short crop. The cap sits low at the sides and the ears stay clear.
      return (
        <g fill={hair}>
          <path d={cap(-0.34)} />
          {locks(-0.02, 0.22, -0.34)}
        </g>
      );
    case "kid-c":
      // Undercut with a tuft: shaved high at the sides, one shape standing up.
      return (
        <g fill={hair}>
          <path d={cap(-0.62)} />
          <path
            d={`M ${x - r * 0.3} ${y - r * 0.95} C ${x - r * 0.16} ${y - r * 1.85} ${x + r * 0.56} ${y - r * 1.62} ${x + r * 0.36} ${y - r * 0.85} Z`}
          />
        </g>
      );
    case "adult-a":
      // Long, past the shoulders.
      return (
        <g fill={hair}>
          <path d={cap(-0.28)} />
          {locks(1.75, 0.3, -0.28)}
        </g>
      );
    case "adult-b":
      // Short back and sides, squared off rather than rounded.
      return (
        <g fill={hair}>
          <path d={cap(-0.44)} />
          {locks(-0.06, 0.18, -0.44)}
        </g>
      );
    case "adult-c":
      // A bob to the jaw. The middle answer, and on purpose.
      return (
        <g fill={hair}>
          <path d={cap(-0.32)} />
          {locks(0.82, 0.34, -0.32)}
        </g>
      );
    case "elder-a":
      // A bouffant of white curls with a headband across it. Wider and taller
      // than any other build's hair, because volume is what makes a head of
      // hair read as *old* rather than merely pale - and the band is the one
      // piece of the legacy clerk that survives at portrait size.
      return (
        <g>
          <g fill={hair}>
            <path
              d={`M ${x - r * 1.14} ${y + r * 0.08} C ${x - r * 1.44} ${y - r * 1.86} ${x + r * 1.44} ${y - r * 1.86} ${x + r * 1.14} ${y + r * 0.08} Z`}
            />
            <circle cx={x - r * 1.06} cy={y - r * 0.34} r={r * 0.36} />
            <circle cx={x + r * 1.06} cy={y - r * 0.34} r={r * 0.36} />
          </g>
          <path
            d={`M ${x - r * 1.2} ${y - r * 0.46} Q ${x} ${y - r * 0.96} ${x + r * 1.2} ${y - r * 0.46} L ${x + r * 1.2} ${y - r * 0.18} Q ${x} ${y - r * 0.68} ${x - r * 1.2} ${y - r * 0.18} Z`}
            fill={colors.accent}
          />
        </g>
      );
    case "elder-b":
      // Hair and a full beard, which is one shape drawn as two: the cap comes
      // down past the ear into a sideburn, and the beard picks it up there.
      // The join is what stops a beard reading as a bib.
      //
      // The beard starts below the eye row and not a unit higher. The face is
      // drawn on top of the head by a renderer that knows nothing about what a
      // concept put under it, so a beard reaching the eye line would simply
      // have eyes on it.
      return (
        <g fill={hair}>
          <path d={cap(-0.5)} />
          {locks(0.46, 0.2, -0.5)}
          <path
            d={[
              `M ${x - r * 1.0} ${y + r * 0.42}`,
              `C ${x - r * 1.16} ${y + r * 1.1} ${x - r * 0.6} ${y + r * 1.94} ${x} ${y + r * 1.9}`,
              `C ${x + r * 0.6} ${y + r * 1.94} ${x + r * 1.16} ${y + r * 1.1} ${x + r * 1.0} ${y + r * 0.42}`,
              'Z',
            ].join(' ')}
          />
          <path
            d={`M ${x - r * 0.46} ${y + r * 0.5} Q ${x} ${y + r * 0.78} ${x + r * 0.46} ${y + r * 0.5}`}
            fill="none"
            stroke={ELDER_HAIR_SHADE}
            strokeWidth={r * 0.11}
            strokeLinecap="round"
          />
        </g>
      );
    case "kid-a":
    default:
      // Long, with two locks past the jaw. The round-one silhouette.
      return (
        <g fill={hair}>
          <path d={cap(-0.3)} />
          {locks(1.12, 0.28, -0.3)}
        </g>
      );
  }
}

function Head(props: PartProps): ReactElement {
  const { rig, colors, detail } = props;
  const { x, y, r } = rig.head;
  return (
    <g>
      <circle cx={x - r * 0.96} cy={y + r * 0.18} r={r * 0.25} fill={colors.bodyBottom} />
      <circle cx={x + r * 0.96} cy={y + r * 0.18} r={r * 0.25} fill={colors.bodyBottom} />
      <rect
        x={x - r * 0.93}
        y={y - r * 1.04}
        width={r * 1.86}
        height={r * 2.08}
        rx={r * 0.86}
        fill={colors.bodyTop}
      />
      <Hair {...props} />
      {showsFiligree(detail) && (
        <g fill={colors.bodyBottom} opacity={0.5}>
          <circle cx={x - r * 0.5} cy={y + r * 0.42} r={1.5} />
          <circle cx={x - r * 0.32} cy={y + r * 0.55} r={1.3} />
          <circle cx={x + r * 0.5} cy={y + r * 0.42} r={1.5} />
          <circle cx={x + r * 0.32} cy={y + r * 0.55} r={1.3} />
        </g>
      )}
    </g>
  );
}

export const KAVERI: ConceptDef = {
  id: "kaveri",
  species: "Kaveri",
  kind: "Humanoid family — six builds, one person, impossible complexions",
  origin: "fresh",
  pitch:
    "The one that does the job the brief actually described. No child's photograph can go on this site, so every hero, every email header and every \"here is what a session looks like\" has a person-shaped hole in it, and only a person-shaped mascot fills it. Round two turned that from one figure into a family: three kid builds and three adult ones, so a page can show a child *and* their parent *and* their gedu without any of them being the same drawing twice. \"Kaveri\" is Finnish for buddy.",
  caveat:
    "The least distinctive and the most crowded — the world is full of flat-illustration people, and a Kaveri will never be as ownable as a bot or a folded plane. It is also the weakest at icon size: a small human head is a small circle and the hair is doing all the identifying, which is fine for an avatar and useless for a favicon.",
  landmark: "The hair silhouette against a rounded head, and the garment block below it.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "None worth naming — it is the only concept here where an outfit reads as clothing rather than as a costume, which is exactly why it is the best candidate for a gamer-facing customiser.",
  rig: rigFor("kid-a"),
  forms: KAVERI_FORMS,
  rigFor,
  faceMode: "eyes",
  variants: KAVERI_VARIANTS,
  limbs: (c) => ({ arm: c.panel, leg: c.limb, hand: c.bodyTop, foot: c.pupil }),
  Body,
  Head,
  fleet: [
    {
      name: "Vilma",
      job: "The introducer — home hero, the tour, the empty states",
      variantId: "lilac",
      form: "kid-a",
      role: "none",
      pose: "wave",
      expression: "excited",
      blurb: "The face of the front page. Lilac, purple hoodie, permanently pleased you turned up.",
    },
    {
      name: "Niko",
      job: "Gamer stand-in — club pages, camp galleries, marketing shots",
      variantId: "teal",
      form: "kid-b",
      role: "gamer",
      pose: "seated",
      expression: "focused",
      blurb: "The one that stands where a photo of a child would have gone. Headset on, at the desk, unidentifiable on purpose.",
    },
    {
      name: "Sanni",
      job: "Parent stand-in — billing, consent, safeguarding copy",
      variantId: "coral",
      form: "adult-a",
      role: "parent",
      pose: "idle",
      expression: "happy",
      prop: "mug",
      blurb: "Scarf and a mug. Turns up wherever a parent is being asked to read something carefully.",
    },
    {
      name: "Reksi — the Princi-Pal",
      job: "Principal gamer — the headmaster's voice: welcomes, announcements, the dad joke",
      variantId: "lilac",
      form: "elder-b",
      role: "none",
      pose: "idle",
      expression: "happy",
      prop: "briefcase",
      outfit: { hat: "cap", face: "shades" },
      garment: "purple",
      blurb:
        "White hair, a full beard, shades he does not take off indoors, a purple cap and a briefcase — the legacy REKSI, rebuilt. He also turns up as a T-rex, which is the same character and the same title: the Princi-Pal is the principal gamer.",
    },
    {
      name: "Kanslisti",
      job: "The school office — enrolment, invoices, and every form nobody enjoys",
      variantId: "coral",
      form: "elder-a",
      role: "none",
      pose: "wave",
      expression: "happy",
      outfit: { face: "specs", torso: "scarf" },
      garment: "amber",
      blurb:
        "The clerk, straight off the legacy sheet: white curls, a headband, round glasses and a knitted scarf. She is the fleet's other announcement voice — where Reksi welcomes you, she is the one who tells you what is actually happening on Tuesday.",
    },
    {
      name: "Eero",
      job: "Gedu stand-in — gedu recruitment, training, the workspace",
      variantId: "lilac",
      form: "adult-b",
      role: "gedu",
      pose: "point-left",
      expression: "happy",
      prop: "clipboard",
      blurb: "Specs, lanyard, clipboard. The educator in every diagram that needs one.",
    },
  ],
};
