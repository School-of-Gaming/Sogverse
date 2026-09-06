/**
 * The element glyphs — which mark rides with each Yty family.
 *
 * The four families' hues are ruled and landed; their **glyphs** are not. Today
 * Sogverse picks them itself, and two of the four are being questioned: Glow's
 * sun was chosen when Glow was yellow and now sits on a green, and Valor's
 * sword says combat where the element means civic courage. Colour and glyph are
 * one fact — the grammar table already holds both halves for a product kind —
 * so the glyph is decided here, in the library, and not in the consumer.
 *
 * **The criteria are the elements' own meanings**, and every candidate below is
 * measured against the one it belongs to:
 *
 * - **Harmony** — the relationship with yourself. Balance, emotional control,
 *   self-acceptance, rest, knowing when to stop. Pink.
 * - **Glow** — the relationship with others. Empathy, kindness, belonging,
 *   friendship, communication: a warm, outward light, and a quiet sense of
 *   flourishing and becoming. Green.
 * - **Valor** — the relationship with society. Teamwork, innovation, civic
 *   courage, trying the hard thing, speaking up, working with people you did
 *   not choose. Orange.
 * - **Wit** — the relationship with technology. Critical thinking, media
 *   literacy, curiosity, sharp thinking, navigating the digital world. Blue.
 *
 * **The page draws real icons throughout, and here the icon is the subject.**
 * Every candidate is the actual `lucide-react` component, at the two sizes the
 * app spends a glyph at — the 16px chip mark and the 24px card mark — in the
 * family's soft variant on the card ground, and once more inside the chip-scale
 * tile as Sogverse draws it today (`bg-yty-<family>-strong/10`, the pre-library
 * alpha step that rides §2). Elsewhere on the page a glyph is scenery around
 * the colour being ruled on; it is drawn from the same set all the same,
 * because a colour ruled on a mark the app does not carry is a colour ruled on
 * the wrong picture.
 *
 * **What lands when this is ruled.** The four marks join the library beside the
 * product-kind glyphs — a second table in `tokens/grammar.ts` or a sibling of it,
 * keyed by family id — and Sogverse's `lib/constants/yty.ts` reads them from
 * there instead of importing from `lucide-react` itself, the way the admin
 * product-type presentation already reads its row. The set then cannot drift:
 * a family's hue and its mark are edited in one place.
 *
 * The last case draws the four **together**, today's set beside the best-fit
 * set, at both scales they appear at. A glyph that is right on its own can still
 * be wrong in the set — four marks a reader meets in one row have to look like
 * siblings — and that is a thing only the row can show.
 */

import {
  Brain,
  BrainCircuit,
  CircleDot,
  Cpu,
  Feather,
  Flag,
  Flower2,
  Glasses,
  HandHeart,
  Handshake,
  Heart,
  HeartHandshake,
  HeartPulse,
  Landmark,
  Leaf,
  Lightbulb,
  Megaphone,
  MessageCircleHeart,
  Moon,
  Mountain,
  Puzzle,
  Rocket,
  Scale,
  Search,
  Shield,
  Sparkles,
  Sprout,
  Sun,
  Sword,
  Telescope,
  Users,
  Waves,
  type LucideIcon,
} from "lucide-react";

import { Case, Compare, Exemplar, Panel, Question, CARD, EDGE, INK } from "./parts";
import { alpha } from "./colour";
import { YTY_FAMILIES, type YtyFamilyId } from "../../../src/tokens/brand";

/** One candidate mark: the component that draws it, and the name it is known by. */
interface Candidate {
  readonly name: string;
  readonly icon: LucideIcon;
}

/**
 * The four elements, each with the mark it carries today and the alternatives
 * drawn beside it.
 *
 * Seven alternatives per element, uniformly, so the four rows are one grid and
 * a reader comparing across elements is not also compensating for row length.
 * Every name was checked against the installed `lucide-react`.
 *
 * The `description` is the app's canonical English one-liner for the element,
 * which is what the element card renders under the name; the library has no
 * word for it and no reason to.
 */
const ELEMENTS: readonly {
  readonly id: YtyFamilyId;
  readonly description: string;
  readonly today: Candidate;
  readonly alternatives: readonly Candidate[];
  readonly bestFit: Candidate;
}[] = [
  {
    id: "harmony",
    description: "Your relationship with yourself",
    /** Affection turned inward: self-acceptance, the plainest reading of the element. */
    today: { name: "Heart", icon: Heart },
    alternatives: [
      /** The body's own rhythm — self-regulation as something you can feel. */
      { name: "HeartPulse", icon: HeartPulse },
      /** Balance, stated outright; the risk is that scales read as law, not as self. */
      { name: "Scale", icon: Scale },
      /** Rest, and knowing when to stop: the half of the element a heart never says. */
      { name: "Moon", icon: Moon },
      /** Emotional weather handled steadily rather than stilled. */
      { name: "Waves", icon: Waves },
      /** Self-kindness as lightness rather than as care. */
      { name: "Feather", icon: Feather },
      /** Calm and quiet growth, though green claims this shape elsewhere in the set. */
      { name: "Leaf", icon: Leaf },
      /** Centred: the element's own middle, with nothing borrowed from another idea. */
      { name: "CircleDot", icon: CircleDot },
    ],
    bestFit: { name: "Heart", icon: Heart },
  },
  {
    id: "glow",
    description: "Your relationship with others",
    /** The outward light — chosen when Glow was yellow, and a sun on a green is the question. */
    today: { name: "Sun", icon: Sun },
    alternatives: [
      /** Becoming and flourishing, in green's own shape rather than the sun's. */
      { name: "Sprout", icon: Sprout },
      /** Flourishing at its fullest; softer and less about effort than a sprout. */
      { name: "Flower2", icon: Flower2 },
      /** Kindness offered and taken: the reciprocal half of the relationship. */
      { name: "HeartHandshake", icon: HeartHandshake },
      /** Kindness given, one-way — empathy before it is returned. */
      { name: "HandHeart", icon: HandHeart },
      /** Belonging: the group you are inside, which is what the element is about. */
      { name: "Users", icon: Users },
      /** The glow itself, with none of the sun's heat or hue. */
      { name: "Sparkles", icon: Sparkles },
      /** Communication, the one part of the meaning no light or plant carries. */
      { name: "MessageCircleHeart", icon: MessageCircleHeart },
    ],
    bestFit: { name: "Sprout", icon: Sprout },
  },
  {
    id: "valor",
    description: "Your relationship with society",
    /** Courage as combat — which is the half of the meaning the element does not have. */
    today: { name: "Sword", icon: Sword },
    alternatives: [
      /** Courage as protection: standing in front of something rather than swinging at it. */
      { name: "Shield", icon: Shield },
      /** The standard you plant — speaking up, and taking a position in public. */
      { name: "Flag", icon: Flag },
      /** The hard thing, tried: effort without an opponent. */
      { name: "Mountain", icon: Mountain },
      /** Speaking up, stated literally. */
      { name: "Megaphone", icon: Megaphone },
      /** Working with people you did not choose — the teamwork half, exactly. */
      { name: "Handshake", icon: Handshake },
      /** Innovation and the leap; the element's forward-leaning half. */
      { name: "Rocket", icon: Rocket },
      /** Society itself, as the institution a civic act is aimed at. */
      { name: "Landmark", icon: Landmark },
    ],
    bestFit: { name: "Shield", icon: Shield },
  },
  {
    id: "wit",
    description: "Your relationship with technology",
    /** Thinking — but biological thinking, where the element is about technology. */
    today: { name: "Brain", icon: Brain },
    alternatives: [
      /** Thinking and the machine in one mark: both halves of the meaning at once. */
      { name: "BrainCircuit", icon: BrainCircuit },
      /** The idea — curiosity's payoff rather than curiosity itself. */
      { name: "Lightbulb", icon: Lightbulb },
      /** The technology half, plainly; says nothing about the thinker. */
      { name: "Cpu", icon: Cpu },
      /** Problem-solving, and the piece that only fits one way. */
      { name: "Puzzle", icon: Puzzle },
      /** Media literacy: looking closely at what you are being shown. */
      { name: "Glasses", icon: Glasses },
      /** The questioning move itself — navigating rather than knowing. */
      { name: "Search", icon: Search },
      /** Curiosity aimed outward, at something further off than the screen. */
      { name: "Telescope", icon: Telescope },
    ],
    bestFit: { name: "BrainCircuit", icon: BrainCircuit },
  },
];

/**
 * One candidate, drawn at every size the app spends a glyph at.
 *
 * Both bare sizes sit on the card ground because that is where the app draws
 * them; the tile below them is the chip-scale tile as Sogverse composes it
 * today, so a mark that only works with a ground behind it is visibly separated
 * from one that works bare.
 */
function GlyphCell({
  candidate,
  strong,
  soft,
}: {
  candidate: Candidate;
  strong: string;
  soft: string;
}) {
  const Icon = candidate.icon;
  return (
    <figure className="m-0 flex flex-col items-center">
      <div
        className="flex w-full flex-col items-center gap-3 rounded-lg p-3"
        style={{ backgroundColor: CARD }}
      >
        <span className="flex h-6 items-end gap-3">
          <Icon size={16} color={soft} aria-hidden />
          <Icon size={24} color={soft} aria-hidden />
        </span>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: alpha(strong, 0.1) }}
        >
          <Icon size={20} color={soft} aria-hidden />
        </span>
      </div>
      <figcaption className="mt-2 text-center font-brand-mono text-body-s text-muted-foreground">
        {candidate.name}
      </figcaption>
    </figure>
  );
}

/**
 * The element card as `about/yty-section.tsx` composes it: a two-pixel border, a
 * 48px tile holding a 24px glyph, the name at card-title size and the
 * description in the element's own colour underneath.
 */
function ElementCard({
  name,
  description,
  icon: Icon,
  strong,
  soft,
}: {
  name: string;
  description: string;
  icon: LucideIcon;
  strong: string;
  soft: string;
}) {
  return (
    <div
      className="rounded-lg border-2 p-4"
      style={{ borderColor: EDGE, backgroundColor: CARD }}
    >
      <div className="flex items-center gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: alpha(strong, 0.1) }}
        >
          <Icon size={24} color={soft} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-h4 font-semibold" style={{ color: INK }}>
            {name}
          </span>
          <span className="block text-body-s" style={{ color: soft }}>
            {description}
          </span>
        </span>
      </div>
    </div>
  );
}

/** The zone tile as `voice/ZoneList.tsx` composes it: a 36px tile, a 20px glyph and a label. */
function ZoneTile({
  label,
  icon: Icon,
  strong,
  soft,
}: {
  label: string;
  icon: LucideIcon;
  strong: string;
  soft: string;
}) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{ borderColor: EDGE, backgroundColor: CARD }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: alpha(strong, 0.1) }}
        >
          <Icon size={20} color={soft} aria-hidden />
        </span>
        <span className="text-body-s" style={{ color: INK }}>
          {label}
        </span>
      </div>
    </div>
  );
}

type Element = (typeof ELEMENTS)[number];

/**
 * The four elements at both scales, drawn from one glyph choice per family.
 *
 * The choice arrives as a function of the element rather than as a second table
 * keyed by id, so a set can never be drawn with a family missing or a glyph
 * belonging to another family.
 */
function ElementSet({ pick }: { pick: (element: Element) => Candidate }) {
  return (
    <div className="space-y-6">
      <Exemplar
        file="about/yty-section.tsx"
        page="/about, the Four Yty-Elements grid"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {ELEMENTS.map((element) => (
            <ElementCard
              key={element.id}
              name={YTY_FAMILIES[element.id].name}
              description={element.description}
              icon={pick(element).icon}
              strong={YTY_FAMILIES[element.id].strong}
              soft={YTY_FAMILIES[element.id].soft}
            />
          ))}
        </div>
      </Exemplar>

      <Exemplar
        file="voice/ZoneList.tsx"
        page="a club's voice room — the four Yty zones"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {ELEMENTS.map((element) => (
            <ZoneTile
              key={element.id}
              label={YTY_FAMILIES[element.id].name}
              icon={pick(element).icon}
              strong={YTY_FAMILIES[element.id].strong}
              soft={YTY_FAMILIES[element.id].soft}
            />
          ))}
        </div>
      </Exemplar>
    </div>
  );
}

const TODAY_GLYPH = (element: Element): Candidate => element.today;
const BEST_FIT_GLYPH = (element: Element): Candidate => element.bestFit;

/**
 * The section number is a prop because the page renumbers as rulings land and
 * sections leave; where this one sits is the page's decision, not this file's.
 */
export function GlyphsSection({ n = 2 }: { n?: number }) {
  return (
    <Question n={n} title="The element glyphs">
      {ELEMENTS.map((element) => {
        const family = YTY_FAMILIES[element.id];
        return (
          <Case key={element.id} title={family.name}>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
              <div className="lg:w-44 lg:shrink-0">
                <Panel label="Today">
                  <GlyphCell
                    candidate={element.today}
                    strong={family.strong}
                    soft={family.soft}
                  />
                </Panel>
              </div>
              <div className="min-w-0 lg:flex-1">
                <Panel label="Candidates">
                  <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-7">
                    {element.alternatives.map((candidate) => (
                      <GlyphCell
                        key={candidate.name}
                        candidate={candidate}
                        strong={family.strong}
                        soft={family.soft}
                      />
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          </Case>
        );
      })}

      <Case title="The four together">
        <Compare columns={2}>
          <Panel label="Today">
            <ElementSet pick={TODAY_GLYPH} />
          </Panel>
          <Panel label="Best fit">
            <ElementSet pick={BEST_FIT_GLYPH} />
          </Panel>
        </Compare>
      </Case>
    </Question>
  );
}
