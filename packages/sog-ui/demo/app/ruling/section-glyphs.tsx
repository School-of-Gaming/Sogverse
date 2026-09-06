/**
 * The glyphs — which mark rides with each Yty family, and with each product kind.
 *
 * Two tables, one question. The tone grammar holds a fact's colour and its mark
 * together, and neither half is decided by the consumer; the families' hues are
 * ruled and their marks are not, and the kind rows have marks that were taken
 * along with the family and never looked at on their own. So the section runs
 * the elements first, then the kinds, and each ends in a set view.
 *
 * ## The element glyphs
 *
 * The four families' hues are ruled and landed; their **glyphs** were not, and
 * Sogverse had been picking them itself. Colour and glyph are one fact — the
 * grammar table already holds both halves for a product kind — so the glyph is
 * decided here, in the library, and not in the consumer.
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
 * **Three of the four are ruled, and their rows have shrunk to the one mark
 * each was given: Harmony `Heart`, Valor `Handshake`, Wit `Brain`.** Valor is
 * the one that moved — the sword is gone, and the element that means working
 * with people you did not choose is drawn as two people agreeing rather than as
 * a weapon.
 *
 * **Glow is open, and Valor's ruling narrowed it.** `Handshake` is now spent, so
 * `HeartHandshake` — the same clasped hands with a heart added — is out and no
 * longer drawn: two marks a reader meets in one set, one of them the other with
 * a decoration, teach that Glow is a variant of Valor rather than its own value.
 * The exclusion generalises to hands as a whole, which is the constraint the
 * second Glow round is drawn against and the reason its two hand candidates are
 * drawn at all: the collision is shown rather than asserted.
 *
 * **What lands when this is ruled.** The four marks join the library beside the
 * product-kind glyphs — a second table in `tokens/grammar.ts` or a sibling of it,
 * keyed by family id — and Sogverse's `lib/constants/yty.ts` reads them from
 * there instead of importing from `lucide-react` itself, the way the admin
 * product-type presentation already reads its row. The set then cannot drift:
 * a family's hue and its mark are edited in one place.
 *
 * The set view draws the four **together**, today's set beside the ruled three
 * with the best-fit Glow in the open seat, at both scales they appear at. A
 * glyph that is right on its own can still be wrong in the set — four marks a
 * reader meets in one row have to look like siblings, and no two of them may be
 * the same object — and that is a thing only the row can show.
 */

import {
  Backpack,
  BookOpen,
  Brain,
  Building2,
  Calendar,
  Computer,
  Ear,
  Flame,
  Flower2,
  Gamepad,
  Gamepad2,
  Gift,
  GraduationCap,
  Hand,
  HandHeart,
  HandHelping,
  Handshake,
  Headset,
  Heart,
  Keyboard,
  Landmark,
  Laptop,
  MessageCircleHeart,
  Monitor,
  MonitorSmartphone,
  Mountain,
  Mouse,
  Origami,
  PartyPopper,
  PcCase,
  Rainbow,
  School,
  Smile,
  Sparkles,
  Speech,
  Sprout,
  Sun,
  Sword,
  Tent,
  TentTree,
  ThumbsUp,
  Ticket,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import {
  Caps,
  Case,
  Compare,
  Exemplar,
  Glyph,
  Panel,
  Question,
  CARD,
  EDGE,
  INK,
  MUTED_INK,
} from "./parts";
import { alpha } from "./colour";
import { YTY_FAMILIES, type YtyFamilyId } from "../../../src/tokens/brand";
import {
  PRODUCT_KIND_GRAMMAR,
  type ProductKindId,
} from "../../../src/tokens/grammar";

/** One candidate mark: the component that draws it, and the name it is known by. */
interface Candidate {
  readonly name: string;
  readonly icon: LucideIcon;
}

/**
 * The four elements: the mark each has been given, or — for the one still open
 * — what it draws today and what is being offered instead.
 *
 * **A ruled family shows one cell and no candidates.** The alternatives were
 * there to be chosen between, and once the choice is made they are a row of
 * rejected marks competing for the eye of someone deciding something else. The
 * page shrinks by what lands, so they go.
 *
 * Every name was checked against the installed `lucide-react`.
 *
 * The `description` is the app's canonical English one-liner for the element,
 * which is what the element card renders under the name; the library has no
 * word for it and no reason to.
 */
const ELEMENTS: readonly {
  readonly id: YtyFamilyId;
  readonly description: string;
  /** What the app draws right now, which the set view's first column needs. */
  readonly today: Candidate;
  /** The mark this family has been given; `null` while the family is still open. */
  readonly ruled: Candidate | null;
  /** Drawn only while the family is open — a ruled row shows its one mark. */
  readonly alternatives: readonly Candidate[];
}[] = [
  {
    id: "harmony",
    description: "Your relationship with yourself",
    /** Affection turned inward: self-acceptance, the plainest reading of the element. */
    today: { name: "Heart", icon: Heart },
    ruled: { name: "Heart", icon: Heart },
    alternatives: [],
  },
  {
    id: "glow",
    description: "Your relationship with others",
    /** The outward light — chosen when Glow was yellow, and a sun on a green is the question. */
    today: { name: "Sun", icon: Sun },
    ruled: null,
    alternatives: [
      /** Becoming and flourishing, in green's own shape rather than the sun's. */
      { name: "Sprout", icon: Sprout },
      /** Flourishing at its fullest; softer and less about effort than a sprout. */
      { name: "Flower2", icon: Flower2 },
      /** Kindness given, one-way — empathy before it is returned. */
      { name: "HandHeart", icon: HandHeart },
      /** Belonging: the group you are inside, which is what the element is about. */
      { name: "Users", icon: Users },
      /** The glow itself, with none of the sun's heat or hue. */
      { name: "Sparkles", icon: Sparkles },
      /** Communication, the one part of the meaning no light or plant carries. */
      { name: "MessageCircleHeart", icon: MessageCircleHeart },
    ],
  },
  {
    id: "valor",
    description: "Your relationship with society",
    /** Courage as combat — the half of the meaning the element does not have. */
    today: { name: "Sword", icon: Sword },
    /** Working with people you did not choose: the teamwork half, exactly. */
    ruled: { name: "Handshake", icon: Handshake },
    alternatives: [],
  },
  {
    id: "wit",
    description: "Your relationship with technology",
    ruled: { name: "Brain", icon: Brain },
    today: { name: "Brain", icon: Brain },
    alternatives: [],
  },
];

/**
 * Glow, a second round.
 *
 * Nothing in the first round landed, and two of it are now unavailable on their
 * own account: `Handshake` is **Valor's**, ruled, and `HeartHandshake` is the
 * same clasped hands with a heart added — a reader meeting both in one set
 * would read Glow as a variant of Valor rather than as its own value, so it is
 * out and is no longer drawn.
 *
 * That exclusion generalises, and it is what shapes this round: **Glow may not
 * be a pair of hands.** The set now holds a heart, a handshake and a brain, so
 * anything hand-shaped is spoken for, which takes `HandHeart`, `HandHelping`
 * and `Hand` off the table however well each reads alone. Two of them are drawn
 * anyway — the row is where that is demonstrated rather than asserted, and the
 * owner may weigh the collision differently.
 *
 * The candidates are aimed at the brand's own examples of Glow behaviour —
 * noticing when someone needs help, asking for help without embarrassment,
 * being generous with credit — as well as the element's stated meaning:
 * empathy, kindness, belonging, friendship, communication, a warm outward
 * light.
 */
const GLOW_SECOND_ROUND: readonly Candidate[] = [
  /** Warmth with a face: the one mark a reader does not have to interpret. */
  { name: "Smile", icon: Smile },
  /** Noticing someone needs help and going to them — but hands are Valor's now. */
  { name: "HandHelping", icon: HandHelping },
  /** Asking for help without embarrassment: the hand you put up. Hands again. */
  { name: "Hand", icon: Hand },
  /** Listening, which is how you notice that someone needs help at all. */
  { name: "Ear", icon: Ear },
  /** Generosity, given rather than owed. */
  { name: "Gift", icon: Gift },
  /** Being generous with credit, in the gesture a gamer already makes. */
  { name: "ThumbsUp", icon: ThumbsUp },
  /** Belonging — the group you are inside, rounder and warmer than `Users`. */
  { name: "UsersRound", icon: UsersRound },
  /** Communication as talking to someone, not as a notification. */
  { name: "Speech", icon: Speech },
  /** A warm outward light that is not a sun, and green lives inside it. */
  { name: "Rainbow", icon: Rainbow },
  /** Friendship as a thing made by hand for someone else. */
  { name: "Origami", icon: Origami },
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
  return (
    <figure className="m-0 flex flex-col items-center">
      <div
        className="flex w-full flex-col items-center gap-3 rounded-lg p-3"
        style={{ backgroundColor: CARD }}
      >
        <span className="flex h-6 items-end gap-3">
          <Glyph icon={candidate.icon} size={16} colour={soft} />
          <Glyph icon={candidate.icon} size={24} colour={soft} />
        </span>
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: alpha(strong, 0.1) }}
        >
          <Glyph icon={candidate.icon} size={20} colour={soft} />
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
  icon,
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
          <Glyph icon={icon} size={24} colour={soft} />
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
  icon,
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
          <Glyph icon={icon} size={20} colour={soft} />
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

/**
 * The four product kinds, each with the mark the tone grammar gives it today
 * and the alternatives drawn beside it.
 *
 * **The criterion for the consumer club is the owner's own:** something closer
 * to a keyboard and mouse, or a laptop or a desktop — the thing a family's
 * child actually plays on — and the gamepad only if none of those exist. The
 * joystick is not the right fit: it is an arcade stick nobody in a club has
 * touched, so it says "games" as a category rather than naming the machine a
 * child sits at. lucide carries **no keyboard-and-mouse pairing**, so the pair
 * can only arrive as one half or the other; `Computer` is drawn as the closest
 * thing to a desktop and was not on the owner's list.
 *
 * The other three kinds are not being questioned; they are drawn because a
 * change to one row is judged against the three it has to sit beside, which is
 * the whole reason the set view below exists.
 *
 * `today` takes its icon from `PRODUCT_KIND_GRAMMAR` rather than naming the
 * component a second time, so this table cannot go on drawing a glyph the
 * grammar has already moved off.
 *
 * **What lands when this is ruled:** the ruled mark replaces that row's `glyph`
 * in `tokens/grammar.ts`, and every admin surface follows with no edit of its
 * own — the schedule panel's filter chips, the week rows, the attention grid's
 * card mark and the key rail all read the row.
 */
const KINDS: readonly {
  readonly id: ProductKindId;
  /** The plural the admin surfaces render, from `admin.products.types`. */
  readonly label: string;
  readonly today: Candidate;
  readonly alternatives: readonly Candidate[];
  readonly bestFit: Candidate;
}[] = [
  {
    id: "consumer_club",
    label: "Consumer clubs",
    /** An arcade stick: games as a category, not the machine a child plays on. */
    today: { name: "Joystick", icon: PRODUCT_KIND_GRAMMAR.consumer_club.glyph },
    alternatives: [
      /** Half of the owner's pairing, and the half a PC player's hands are on. */
      { name: "Keyboard", icon: Keyboard },
      /** The other half; simple at 14px, but a bare mouse reads as a peripheral. */
      { name: "Mouse", icon: Mouse },
      /** The whole machine in one silhouette, and the one most families own. */
      { name: "Laptop", icon: Laptop },
      /** The desktop screen: the setup a gamer sits down at rather than carries. */
      { name: "Monitor", icon: Monitor },
      /** Screen and tower together — the fullest "desktop", and the busiest. */
      { name: "Computer", icon: Computer },
      /** The tower alone: hardware rather than play. */
      { name: "PcCase", icon: PcCase },
      /** Two screens: playing across devices, which is what a club actually is. */
      { name: "MonitorSmartphone", icon: MonitorSmartphone },
      /** The modern controller — the owner's fallback if no machine fits. */
      { name: "Gamepad2", icon: Gamepad2 },
      /** The older controller; blockier, and clearer at chip scale than Gamepad2. */
      { name: "Gamepad", icon: Gamepad },
      /** What everyone in a club is wearing, and the only mark that says "together". */
      { name: "Headset", icon: Headset },
    ],
    bestFit: { name: "Laptop", icon: Laptop },
  },
  {
    id: "municipality_club",
    label: "Municipality clubs",
    /** The school building: the school-hours offering, named by where it happens. */
    today: {
      name: "School",
      icon: PRODUCT_KIND_GRAMMAR.municipality_club.glyph,
    },
    alternatives: [
      /** Learning rather than the building — but it says graduation, which this is not. */
      { name: "GraduationCap", icon: GraduationCap },
      /** The institution that buys it, rather than the pupils who attend. */
      { name: "Building2", icon: Building2 },
      /** The municipality as civic body; heavier, and easily read as government. */
      { name: "Landmark", icon: Landmark },
      /** The lesson itself, at the cost of looking like documentation. */
      { name: "BookOpen", icon: BookOpen },
    ],
    bestFit: { name: "School", icon: School },
  },
  {
    id: "camp",
    label: "Camps",
    /** The camp, named by the thing you sleep under. */
    today: { name: "Tent", icon: PRODUCT_KIND_GRAMMAR.camp.glyph },
    alternatives: [
      /** The same tent with its setting; more scene, less legible at 14px. */
      { name: "TentTree", icon: TentTree },
      /** The campfire — the evening rather than the week. */
      { name: "Flame", icon: Flame },
      /** The hard thing, tried: the intensive rather than the accommodation. */
      { name: "Mountain", icon: Mountain },
      /** What a child arrives carrying, which is how a camp starts. */
      { name: "Backpack", icon: Backpack },
    ],
    bestFit: { name: "Tent", icon: Tent },
  },
  {
    id: "event",
    label: "Events",
    /** A dated occasion — and a calendar on a panel already made of calendars. */
    today: { name: "CalendarDays", icon: PRODUCT_KIND_GRAMMAR.event.glyph },
    alternatives: [
      /** The same mark without the day dots; quieter, and the same collision. */
      { name: "Calendar", icon: Calendar },
      /** The one-off you turn up to: an occasion rather than a date. */
      { name: "Ticket", icon: Ticket },
      /** The occasion at its loudest; too jolly for a row of twenty. */
      { name: "PartyPopper", icon: PartyPopper },
      /** The special thing, unspecific — and already spoken for in the element set. */
      { name: "Sparkles", icon: Sparkles },
    ],
    bestFit: { name: "Ticket", icon: Ticket },
  },
];

type Kind = (typeof KINDS)[number];

/** The soft variant the admin surfaces tint a kind's glyph with, via the grammar's family. */
function kindInk(id: ProductKindId): string {
  return YTY_FAMILIES[PRODUCT_KIND_GRAMMAR[id].family].soft;
}

/**
 * The filter chip as `admin/dashboard/schedule-panel.tsx` composes it, in its
 * resting state: a bordered pill, a 14px tinted glyph and the kind's plural.
 * Selected fills with `accent`, which is a state of this chip rather than a
 * second construct, so resting is what a glyph is judged in.
 */
function TypeChip({
  icon,
  label,
  ink,
}: {
  icon: LucideIcon;
  label: string;
  ink: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap"
      style={{ borderColor: EDGE, color: MUTED_INK }}
    >
      <Glyph icon={icon} size={14} colour={ink} />
      {label}
    </span>
  );
}

/**
 * One candidate mark for a product kind, at both sizes the admin surfaces spend
 * it at — 14px in the schedule panel's chips and the week rows, 16px as the
 * attention grid's card mark — and once inside the chip itself.
 */
function KindGlyphCell({
  candidate,
  label,
  ink,
}: {
  candidate: Candidate;
  label: string;
  ink: string;
}) {
  return (
    <figure className="m-0 flex flex-col items-stretch">
      <div
        className="flex items-end justify-center gap-3 rounded-lg p-3"
        style={{ backgroundColor: CARD }}
      >
        <Glyph icon={candidate.icon} size={14} colour={ink} />
        <Glyph icon={candidate.icon} size={16} colour={ink} />
      </div>
      <div className="mt-3 flex justify-center">
        <TypeChip icon={candidate.icon} label={label} ink={ink} />
      </div>
      <figcaption className="mt-2 text-center font-brand-mono text-body-s text-muted-foreground">
        {candidate.name}
      </figcaption>
    </figure>
  );
}

/** The four kinds' chips as the schedule panel's filter row shows them. */
function KindSet({ pick }: { pick: (kind: Kind) => Candidate }) {
  return (
    <Exemplar
      file="admin/dashboard/schedule-panel.tsx"
      page="/admin — the schedule panel's type filters"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {KINDS.map((kind) => (
          <TypeChip
            key={kind.id}
            icon={pick(kind).icon}
            label={kind.label}
            ink={kindInk(kind.id)}
          />
        ))}
      </div>
    </Exemplar>
  );
}

const TODAY_KIND_GLYPH = (kind: Kind): Candidate => kind.today;
const BEST_FIT_KIND_GLYPH = (kind: Kind): Candidate => kind.bestFit;

const TODAY_GLYPH = (element: Element): Candidate => element.today;

/**
 * The best fit for the one family still open, so the set view can be drawn with
 * all four seats filled rather than with a hole where Glow will go.
 *
 * `Smile` is the only candidate in either round that is a *person* rather than
 * an act, which is what makes the set cohere: a heart, a face, a handshake and a
 * brain read as four human things — how you feel, how you meet someone, how you
 * work with people you did not choose, how you think — and it is the one strong
 * candidate that does not repeat the hands the ruled Valor mark now owns.
 */
const GLOW_BEST_FIT: Candidate = { name: "Smile", icon: Smile };

const RULED_GLYPH = (element: Element): Candidate =>
  element.ruled ?? GLOW_BEST_FIT;

/**
 * The section number is a prop because the page renumbers as rulings land and
 * sections leave; where this one sits is the page's decision, not this file's.
 */
export function GlyphsSection({ n = 2 }: { n?: number }) {
  return (
    <Question n={n} title="The glyphs">
      {ELEMENTS.map((element) => {
        const family = YTY_FAMILIES[element.id];
        const ruled = element.ruled;
        return (
          <Case key={element.id} title={family.name}>
            {ruled === null ? (
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
            ) : (
              <div className="lg:w-44">
                <Panel label="Ruled">
                  <GlyphCell
                    candidate={ruled}
                    strong={family.strong}
                    soft={family.soft}
                  />
                </Panel>
              </div>
            )}
          </Case>
        );
      })}

      <Case title="Glow, another round">
        <Panel label="Candidates">
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-10">
            {GLOW_SECOND_ROUND.map((candidate) => (
              <GlyphCell
                key={candidate.name}
                candidate={candidate}
                strong={YTY_FAMILIES.glow.strong}
                soft={YTY_FAMILIES.glow.soft}
              />
            ))}
          </div>
        </Panel>
      </Case>

      <Case title="The four elements together">
        <Compare columns={2}>
          <Panel label="Today">
            <ElementSet pick={TODAY_GLYPH} />
          </Panel>
          <Panel label="Ruled">
            <ElementSet pick={RULED_GLYPH} />
          </Panel>
        </Compare>
      </Case>

      <Case title="The kind glyphs">
        <div className="space-y-10">
          {KINDS.map((kind) => {
            const ink = kindInk(kind.id);
            return (
              <div key={kind.id}>
                <Caps>{kind.label}</Caps>
                <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-stretch">
                  <div className="lg:w-56 lg:shrink-0">
                    <Panel label="Today">
                      <KindGlyphCell
                        candidate={kind.today}
                        label={kind.label}
                        ink={ink}
                      />
                    </Panel>
                  </div>
                  <div className="min-w-0 lg:flex-1">
                    <Panel label="Candidates">
                      <div className="flex flex-wrap gap-4">
                        {kind.alternatives.map((candidate) => (
                          <KindGlyphCell
                            key={candidate.name}
                            candidate={candidate}
                            label={kind.label}
                            ink={ink}
                          />
                        ))}
                      </div>
                    </Panel>
                  </div>
                </div>
              </div>
            );
          })}

          <div>
            <Caps>The four kinds together</Caps>
            <div className="mt-3">
              <Compare columns={2}>
                <Panel label="Today">
                  <KindSet pick={TODAY_KIND_GLYPH} />
                </Panel>
                <Panel label="Best fit">
                  <KindSet pick={BEST_FIT_KIND_GLYPH} />
                </Panel>
              </Compare>
            </div>
          </div>
        </div>
      </Case>
    </Question>
  );
}
