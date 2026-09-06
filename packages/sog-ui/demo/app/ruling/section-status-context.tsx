/**
 * Question 2, in context — the role table drawn in the places a reader meets it.
 *
 * The ruled row above it proves the roles against every construct at once,
 * which is what a grid is good at and the only thing it is good at: a cell is a
 * colour with nothing beside it, and every real question about a palette is a
 * question about adjacency. So these are the same six hues in the components
 * that spend them, copied class-for-class, **today beside ruled**, each on the
 * ground it really sits on.
 *
 * What each drawing is here to answer, in the order they appear:
 *
 * 1. **The About cards and the voice zones** — the two surfaces where all four
 *    families appear at once, which is the only place the four areas are
 *    compared with each other rather than with a neutral.
 * 2. **Valor on the dark ground** — the one cell the role table could not
 *    close. The five candidate oranges drawn in the element card, in the four
 *    cards together with the other three families held at soft, and in the zone
 *    list with Valor as the joined zone so a candidate lights a card.
 * 3. **The admin surfaces** — where the *product kinds* are the families, under
 *    the re-matched grammar, so Glow (consumer club) and Wit (municipality
 *    club) sit side by side on the two surfaces an admin reads all day.
 * 4. **A status as a badge, a label and a sentence** — §11's two forms drawn
 *    against each other: the label keeps its colour, the sentence loses it.
 * 5. **A family name beside its glyph** — the chip-scale tile question, which
 *    §2 left open, now visible under the role table.
 * 6. **Where a hue meets itself** — the adjacency the ruling creates: success
 *    *is* Glow and info *is* Wit, exactly, so a family fill and a status badge
 *    of the same hue can land on one card.
 * 7. **At scale** — eight rows and eight cards, because density is a property
 *    of a set and a single cell cannot show it.
 * 8. **A ring** — the one construct in the ruled row that Sogverse authors and
 *    has never rendered.
 *
 * **The odd cell this drawing turned up, drawn and not resolved.** Under the
 * role table the four family areas are all light values, and their *luminance*
 * is close: Harmony against Valor measures 1.15, Glow against Wit 1.09,
 * destructive against Valor 1.08, and act against Valor 1.43. Anywhere they
 * carry a label or a glyph that costs nothing — the label is the meaning and
 * the colour reinforces it. In the **unlabelled mark** column it is the whole
 * signal, so a run of rail dots or a row of solid marks separates by hue alone,
 * with no lightness left to help a colourblind reader. That is a property of
 * the family palette rather than of this ruling — the strong values were
 * closer still in places — but the role table is what puts the light values in
 * the mark, so it is drawn here at density, in the feed rail and in the marks
 * row, for the owner to look at. Nothing is proposed for it.
 *
 * **A second one, and it is why case 2 exists.** Valor is the only family whose
 * area and ink differ, so a Valor edge beside a Valor label is two oranges in
 * one construct where every other family is one colour twice. The element card
 * is where that showed, and the owner's answer to it was that neither authored
 * value carries alone: strong reads dark, soft reads as a peach. So case 2
 * draws the same card five times, each with **one** orange doing both jobs.
 */

import type { ReactNode } from "react";
import {
  Coins,
  Home,
  Mic,
  MicOff,
  UserRoundX,
  UserX,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

import {
  BRAND,
  NEUTRALS,
  YTY_FAMILIES,
  type YtyFamilyId,
} from "../../../src/tokens/brand";
import {
  PRODUCT_KIND_GRAMMAR,
  type ProductKindId,
} from "../../../src/tokens/grammar";
import { alpha } from "./colour";
import { STATUS_BY_ID, YTY_ROLES, type StatusId } from "./inventory";
import {
  COPY,
  FAMILY_GLYPH,
  FAMILY_ORDER,
  RULED,
  STATUS_GLYPH,
  TODAY,
  VALOR_CANDIDATES,
  type Tone,
} from "./status-tones";
import {
  CARD,
  Caps,
  Case,
  Compare,
  EDGE,
  Exemplar,
  GROUND,
  Glyph,
  INK,
  MUTED_INK,
  Panel,
} from "./parts";

const LIFTED = NEUTRALS.lifted.hex;

/** Today's four families as Sogverse spends them, and the roles as ruled. */
interface FamilyPaint {
  /** The tile behind a chip-scale glyph. */
  readonly tile: string;
  /** The card's or tile's edge. */
  readonly edge: string;
  /** The glyph and the name. */
  readonly ink: string;
}

/**
 * Today: a 10% wash of the strong variant behind the glyph, a neutral edge, and
 * the soft variant as glyph and ink.
 *
 * The wash is drawn with a real `rgb()` alpha rather than a pre-mixed hex, so
 * what is on screen is what the browser composites and the dulling is visible
 * rather than asserted. The neutral edge is what the app renders: the family
 * edge these cards were authored with was one of the casualties of the border
 * bug, and it was deleted rather than revived.
 */
function todayPaint(id: YtyFamilyId): FamilyPaint {
  return {
    tile: alpha(YTY_FAMILIES[id].strong, 0.1),
    edge: EDGE,
    ink: YTY_FAMILIES[id].soft,
  };
}

/** Ruled: no alpha anywhere — the ground behind the glyph, the area on the edge, the ink on the words. */
function ruledPaint(id: YtyFamilyId): FamilyPaint {
  return {
    tile: GROUND,
    edge: YTY_ROLES[id].area,
    ink: YTY_ROLES[id].ink,
  };
}

/**
 * The set with one Valor candidate in it, the other three families as ruled.
 *
 * The candidate is spent as **one colour twice** — the edge and the ink both —
 * which is the shape the ruling would land in: every family spends exactly one
 * colour, and the only thing still open is which orange Valor's is. Holding
 * the other three at soft is what makes the drawing about Valor: change five
 * things and the eye reports on the picture rather than on the colour.
 */
function valorPaint(hex: string): (id: YtyFamilyId) => FamilyPaint {
  return (id) =>
    id === "valor" ? { tile: GROUND, edge: hex, ink: hex } : ruledPaint(id);
}

/** The elements' canonical English one-liners, which the library has no word for. */
const ELEMENT_DESCRIPTION: Record<YtyFamilyId, string> = {
  harmony: "Your relationship with yourself",
  glow: "Your relationship with others",
  valor: "Your relationship with society",
  wit: "Your relationship with technology",
};

/**
 * `about/yty-section.tsx` — the element card, class-for-class: a `Card` at
 * `rounded-lg border border-border bg-card` with the section's own
 * `border-2 border-border`, a `CardHeader` at `flex flex-col space-y-1.5 p-6`
 * holding `flex items-center gap-4`, a `flex h-12 w-12 items-center
 * justify-center rounded-lg` tile with a `h-6 w-6` glyph, the name at
 * `text-lg font-semibold leading-none tracking-tight` and the description at
 * `text-sm` in the element's own colour.
 *
 * The card's body paragraph is left off. It is `text-muted-foreground` in both
 * columns and nothing being ruled touches it, so a second screenful per card
 * would be eight identical copies of content the ruling does not reach.
 */
function ElementCard({
  id,
  paint,
}: {
  id: YtyFamilyId;
  paint: FamilyPaint;
}) {
  return (
    <div
      className="rounded-lg border-2 p-6 shadow-sm"
      style={{ borderColor: paint.edge, backgroundColor: CARD }}
    >
      <div className="flex items-center gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: paint.tile }}
        >
          <Glyph icon={FAMILY_GLYPH[id]} size={24} colour={paint.ink} />
        </span>
        <span className="min-w-0">
          <span
            className="block text-lg leading-none font-semibold tracking-tight"
            style={{ color: INK }}
          >
            {YTY_FAMILIES[id].name}
          </span>
          <span className="mt-1.5 block text-sm" style={{ color: paint.ink }}>
            {ELEMENT_DESCRIPTION[id]}
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * `voice/ZoneList.tsx` — the zone card, class-for-class: `rounded-xl border
 * border-border px-3 py-2.5`, a `flex h-9 w-9 items-center justify-center
 * rounded-lg` tile with a `h-5 w-5` glyph, and the label at
 * `flex-1 truncate text-sm font-medium`.
 *
 * The active zone's treatment is the card's `zone-glow` — an inset shadow in
 * the zone's own colour, spilling in from the edge — drawn here as the inset
 * box-shadow the class defines. It is the one place a family colour is already
 * spent as a *shape* rather than as a tile, which makes it the construct with
 * most to gain or lose from the area role.
 *
 * The member strip below each card is left off: it reserves a fixed 68px
 * whether or not anyone is in the zone, and it holds identicons, which are
 * artwork with their own palette and their own open question.
 */
function ZoneTile({
  label,
  glyph,
  paint,
  active,
}: {
  label: string;
  glyph: LucideIcon;
  paint: FamilyPaint;
  active: boolean;
}) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{
        borderColor: paint.edge,
        backgroundColor: CARD,
        ...(active
          ? { boxShadow: `inset 0 0 1.25rem -0.25rem ${paint.edge}` }
          : {}),
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: paint.tile }}
        >
          <Glyph icon={glyph} size={20} colour={paint.ink} />
        </span>
        <span
          className="flex-1 truncate text-sm font-medium"
          style={{ color: INK }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

/**
 * The four zones plus the Clubhouse, which is the neutral one and is drawn to
 * keep the set honest.
 *
 * One zone is joined, because the inset glow is a family colour spent as a
 * shape and a list with nobody in it never draws it. Which one is a parameter
 * rather than a constant: the Valor comparison has to see its own candidate
 * lighting a card, and Glow lighting one proves nothing about an orange.
 */
function ZoneList({
  paint,
  active = "glow",
}: {
  paint: (id: YtyFamilyId) => FamilyPaint;
  active?: YtyFamilyId;
}) {
  return (
    <div className="space-y-2">
      {FAMILY_ORDER.map((id) => (
        <ZoneTile
          key={id}
          label={YTY_FAMILIES[id].name}
          glyph={FAMILY_GLYPH[id]}
          paint={paint(id)}
          active={id === active}
        />
      ))}
      <ZoneTile
        label="Clubhouse"
        glyph={Home}
        paint={{ tile: alpha(INK, 0.1), edge: EDGE, ink: INK }}
        active={false}
      />
    </div>
  );
}

/**
 * `voice/ParticipantRow.tsx` — the roster row, class-for-class: the wrapping
 * `flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border
 * p-2 sm:gap-x-3`, the name at `order-2 min-w-0 max-w-fit flex-1 truncate
 * text-sm font-medium`, and the trailing `flex shrink-0 items-center gap-1.5`
 * holding the camera and mic marks at `h-3.5 w-3.5`.
 *
 * The mic mark is the collision verbatim and already on screen: the roster and
 * the zone list are two columns of one page, so a Glow mic glyph sits a few
 * centimetres from the Glow zone, meaning "this child can be heard" and "the
 * Glow zone" respectively. The camera mark is drawn too, because the mic is
 * only ever read beside it and a coloured glyph next to a muted one reads
 * differently from a coloured glyph alone.
 *
 * The row's identicon is stood in for by a plain muted square: the avatar is
 * artwork with its own palette and its own question, and drawing one would put
 * a second set of colours into the frame this collision is judged in.
 */
function ParticipantRows({ success, destructive }: { success: string; destructive: string }) {
  const people = [
    { name: "Aino", open: true },
    { name: "Mika", open: false },
    { name: "Sanni", open: true },
  ];
  return (
    <div className="space-y-2">
      {people.map((person) => (
        <div
          key={person.name}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border p-2 sm:gap-x-3"
        >
          <span
            className="h-8 w-8 shrink-0 rounded-md"
            style={{ backgroundColor: LIFTED }}
          />
          <span className="min-w-0 max-w-fit flex-1 truncate text-sm font-medium">
            {person.name}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <Glyph icon={Video} size={14} colour={MUTED_INK} />
            {person.open ? (
              <Glyph icon={Mic} size={14} colour={success} />
            ) : (
              <Glyph icon={MicOff} size={14} colour={destructive} />
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------ the admin surfaces

/**
 * The eight products the admin drawings hold, two per kind.
 *
 * Two per kind rather than one, because the question at density is whether two
 * cards of the *same* kind read as a pair and two of different kinds read
 * apart — which one card per kind cannot show. Each carries a real problem with
 * that problem's own mark, keyed by issue kind exactly as the grid keys them,
 * so the eight cards are not one glyph repeated.
 */
const PRODUCTS: readonly {
  name: string;
  kind: ProductKindId;
  issue: string;
  issueGlyph: LucideIcon;
}[] = [
  {
    name: "Minecraft Tuesdays",
    kind: "consumer_club",
    issue: "4 gamers in no group",
    issueGlyph: UserRoundX,
  },
  {
    name: "Roblox Thursdays",
    kind: "consumer_club",
    issue: "Group B has no gedu",
    issueGlyph: UserX,
  },
  {
    name: "Espoo school club",
    kind: "municipality_club",
    issue: "Group B has no gedu",
    issueGlyph: UserX,
  },
  {
    name: "Vantaa school club",
    kind: "municipality_club",
    issue: "No municipality fee set",
    issueGlyph: Coins,
  },
  {
    name: "Autumn build camp",
    kind: "camp",
    issue: "6 waiting, 2 seats open",
    issueGlyph: Users,
  },
  {
    name: "Winter survival camp",
    kind: "camp",
    issue: "3 gamers in no group",
    issueGlyph: UserRoundX,
  },
  {
    name: "Roblox creator night",
    kind: "event",
    issue: "No gedu fee set",
    issueGlyph: Coins,
  },
  {
    name: "Parents' evening",
    kind: "event",
    issue: "6 waiting, 4 seats open",
    issueGlyph: Users,
  },
];

/** The four kinds in the order the key rail, the filter chips and the sort all take them. */
const KIND_ORDER = [
  "consumer_club",
  "municipality_club",
  "camp",
  "event",
] as const satisfies readonly ProductKindId[];

const KIND_LABEL: Record<ProductKindId, string> = {
  consumer_club: "Clubs",
  municipality_club: "School clubs",
  camp: "Camps",
  event: "Events",
};

/**
 * `admin/dashboard/product-attention-grid.tsx` — the queue's card,
 * class-for-class: `flex h-full flex-col gap-2 rounded-lg border border-border
 * bg-card p-3`, the kind's glyph at `mt-0.5 h-4 w-4 shrink-0` in the family's
 * colour, the name at `text-sm font-medium leading-snug`, and each issue as
 * `flex items-start gap-1.5 text-xs leading-snug` with a `h-3.5 w-3.5` mark.
 */
function AttentionCard({
  product,
  ink,
  warning,
}: {
  product: (typeof PRODUCTS)[number];
  ink: string;
  warning: string;
}) {
  const glyph = PRODUCT_KIND_GRAMMAR[product.kind].glyph;
  return (
    <div
      className="flex h-full flex-col gap-2 rounded-lg border border-border p-3"
      style={{ backgroundColor: CARD }}
    >
      <span className="flex items-start gap-2">
        <span className="mt-0.5">
          <Glyph icon={glyph} size={16} colour={ink} />
        </span>
        <span className="text-sm leading-snug font-medium">{product.name}</span>
      </span>
      <span className="flex items-start gap-1.5 text-xs leading-snug">
        <span className="mt-0.5">
          <Glyph icon={product.issueGlyph} size={14} colour={warning} />
        </span>
        <span>{product.issue}</span>
      </span>
    </div>
  );
}

/**
 * `admin/dashboard/schedule-panel.tsx` — the type filter chips,
 * class-for-class: `inline-flex items-center gap-1.5 rounded-full border
 * border-border px-2.5 py-1 text-xs font-medium`, active on `bg-lifted
 * text-foreground` and resting on `text-muted-foreground`, with the same
 * tinted glyph at `h-3.5 w-3.5`.
 *
 * The first two are drawn active and the last two resting, because that is the
 * state an admin's filter is usually in and because a chip's glyph reads
 * differently on the lifted fill than on the card.
 */
function TypeChips({ ink }: { ink: (kind: ProductKindId) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {KIND_ORDER.map((kind, index) => {
        const active = index < 2;
        return (
          <span
            key={kind}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium"
            style={{
              backgroundColor: active ? LIFTED : "transparent",
              color: active ? INK : MUTED_INK,
            }}
          >
            <Glyph
              icon={PRODUCT_KIND_GRAMMAR[kind].glyph}
              size={14}
              colour={ink(kind)}
            />
            {KIND_LABEL[kind]}
          </span>
        );
      })}
    </div>
  );
}

/**
 * `admin/dashboard/product-type-key-rail.tsx` — the key's entry,
 * class-for-class: a `grid h-7 w-7 shrink-0 place-items-center rounded-md`
 * tile carrying the family's chip-scale wash, a `h-4 w-4` glyph in the
 * family's ink, and the plural name beside it.
 *
 * This is the tile question §2 left open, and it is the reason the key rail is
 * drawn at all: `brand.ts` exempts chip-scale icon-accent tiles from the
 * no-alpha rule, so the tile is either a 15% wash of a value the role table now
 * calls `area`, or it is the ground with the area on the edge. Both are drawn.
 */
function KeyRailEntry({
  kind,
  tile,
  ink,
  edge,
}: {
  kind: ProductKindId;
  tile: string;
  ink: string;
  edge: string | null;
}) {
  return (
    <span className="flex items-center gap-2 text-xs leading-tight">
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
        style={{
          backgroundColor: tile,
          ...(edge === null ? {} : { borderWidth: 1, borderColor: edge }),
        }}
      >
        <Glyph icon={PRODUCT_KIND_GRAMMAR[kind].glyph} size={16} colour={ink} />
      </span>
      <span className="min-w-0">{KIND_LABEL[kind]}</span>
    </span>
  );
}

// --------------------------------------------- status as label and sentence

/** `ui/badge.tsx` — the pill, class-for-class, filled with the status's area under an ink label. */
function StatusBadge({ tone }: { tone: Tone }) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold shadow"
      style={{ backgroundColor: tone.area, color: tone.onArea }}
    >
      {COPY[tone.status].badge}
    </span>
  );
}

/**
 * `gedu/session-feed/SessionFeedItem.tsx` — the card's trailing status line: a
 * `h-3.5 w-3.5` glyph and a word at `flex items-center gap-1.5 text-xs
 * font-medium`, both in the status colour.
 *
 * This is §11's label form and the largest construct in the inventory, 166 of
 * the 335 sites. The colour stays because the words are the name of a state and
 * the glyph beside them carries the same meaning without it.
 */
function StatusLabel({ tone }: { tone: Tone }) {
  return (
    <span
      className="flex items-center gap-1.5 text-xs font-medium"
      style={{ color: tone.ink }}
    >
      <Glyph icon={STATUS_GLYPH[tone.status]} size={14} colour={tone.ink} />
      {COPY[tone.status].meta}
    </span>
  );
}

/**
 * `family/gamer-credential-fields.tsx` and every auth form — the field's error,
 * class-for-class: `<p role="alert" className="text-sm text-destructive">`.
 *
 * §11's sentence form, and the one place the ruling *removes* colour: a parent
 * reads this rather than scanning it, so it is ink, and the status arrives as a
 * mark beside it. Drawn today above ruled, because the change is what has to be
 * looked at — the sentence does not lose the fact, it loses the shouting.
 */
function StatusSentence({ tone, coloured }: { tone: Tone; coloured: boolean }) {
  return (
    <p className="flex items-start gap-2 text-sm">
      {coloured ? null : (
        <span className="mt-0.5">
          <Glyph icon={STATUS_GLYPH[tone.status]} size={16} colour={tone.ink} />
        </span>
      )}
      <span style={{ color: coloured ? tone.ink : INK }}>
        {COPY[tone.status].sentence}
      </span>
    </p>
  );
}

// ------------------------------------------------------------- at density

/**
 * Eight feed rows, each a date and a status label — the label construct at the
 * length a real feed sets it.
 *
 * `session-feed/SessionFeedShell.tsx` with `gedu/session-feed/SessionFeedItem.tsx`:
 * the rail dot at 10px cut out of the rail by a 4px ring in the page colour,
 * the card at `rounded-lg border border-border` on the card ground, and the
 * status line right-packed beside the date.
 *
 * Eight rather than four, and mixed rather than sorted, because the question
 * the ruled row cannot answer is what a *column* of these reads like: whether
 * eight coloured labels in a scroll are a signal or a Christmas tree, and
 * whether the rail's dots can be told apart when they are the only thing
 * carrying the state.
 */
const FEED_ROWS: readonly { day: string; status: StatusId }[] = [
  { day: "Tue 2 Sep", status: "success" },
  { day: "Thu 4 Sep", status: "success" },
  { day: "Tue 9 Sep", status: "warning" },
  { day: "Thu 11 Sep", status: "success" },
  { day: "Tue 16 Sep", status: "destructive" },
  { day: "Thu 18 Sep", status: "success" },
  { day: "Tue 23 Sep", status: "warning" },
  { day: "Thu 25 Sep", status: "info" },
];

function FeedRows({ tones }: { tones: readonly Tone[] }) {
  const byStatus = new Map(tones.map((tone) => [tone.status, tone]));
  return (
    <div className="relative space-y-2 border-l border-border pl-6">
      {FEED_ROWS.map((row) => {
        const tone = byStatus.get(row.status);
        if (tone === undefined) return null;
        return (
          <div key={row.day} className="relative">
            <span
              aria-hidden
              className="ring-background absolute -left-6 top-3 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-4"
              style={{ backgroundColor: tone.area }}
            />
            <div
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              style={{ backgroundColor: CARD }}
            >
              <span className="text-sm font-medium">{row.day}</span>
              <StatusLabel tone={tone} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------- a ring

/**
 * The ring, drawn twice: the one the app has and the one it authors.
 *
 * `ui/input.tsx` focuses on `focus-visible:ring-2 focus-visible:ring-act
 * focus-visible:ring-offset-2`, which is the only ring a reader ever sees, and
 * it is amber. `lib/constants/yty.ts` authors `ring-yty-<family>-strong` and
 * `lib/constants/voice-zones.ts` passes it through as a zone's `ring`, and
 * **nothing renders it**: the Yty zones are not in the colour picker, so the
 * one construct the ruled row has a column for is a construct Sogverse has
 * never drawn. So it is drawn here from the recipe, at the area value, on the
 * tile it would ring — and beside the act ring, because a family ring is only
 * ever met on a page that already has one.
 */
function RingRow({ area }: { area: (id: YtyFamilyId) => string }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FAMILY_ORDER.map((id) => (
          <div
            key={id}
            className="rounded-xl border border-border px-3 py-2.5"
            style={{
              backgroundColor: CARD,
              boxShadow: `0 0 0 2px ${area(id)}`,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: GROUND }}
              >
                <Glyph
                  icon={FAMILY_GLYPH[id]}
                  size={20}
                  colour={YTY_ROLES[id].ink}
                />
              </span>
              <span
                className="flex-1 truncate text-sm font-medium"
                style={{ color: INK }}
              >
                {YTY_FAMILIES[id].name}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div
        className="flex h-10 w-full items-center rounded-md border border-border px-3 py-2 text-base"
        style={{
          backgroundColor: GROUND,
          color: INK,
          boxShadow: `0 0 0 2px ${GROUND}, 0 0 0 4px ${BRAND.act.hex}`,
        }}
      >
        Aino
      </div>
    </div>
  );
}

// ------------------------------------------------------------ the section

/** Two columns, today on the left and the roles on the right, under one caption. */
function Pair({
  file,
  page,
  today,
  ruled,
}: {
  file: string;
  page: string;
  today: ReactNode;
  ruled: ReactNode;
}) {
  return (
    <Exemplar file={file} page={page}>
      <Compare columns={2}>
        <Panel label="Today">{today}</Panel>
        <Panel label="Area and ink">{ruled}</Panel>
      </Compare>
    </Exemplar>
  );
}

const TODAY_BY_STATUS = new Map(TODAY.map((tone) => [tone.status, tone]));
const RULED_BY_STATUS = new Map(RULED.map((tone) => [tone.status, tone]));

/** One status either way round, so a drawing can ask for "today's warning" by name. */
function toneOf(status: StatusId, ruled: boolean): Tone {
  const tone = (ruled ? RULED_BY_STATUS : TODAY_BY_STATUS).get(status);
  if (tone === undefined) throw new Error(`no tone for ${status}`);
  return tone;
}

export function InContextCases() {
  return (
    <>
      <Case title="The four elements, and the four zones">
        <div className="space-y-10">
          <Pair
            file="about/yty-section.tsx"
            page="/about, the Four Yty-Elements grid"
            today={
              <div className="grid gap-4">
                {FAMILY_ORDER.map((id) => (
                  <ElementCard key={id} id={id} paint={todayPaint(id)} />
                ))}
              </div>
            }
            ruled={
              <div className="grid gap-4">
                {FAMILY_ORDER.map((id) => (
                  <ElementCard key={id} id={id} paint={ruledPaint(id)} />
                ))}
              </div>
            }
          />
          <Pair
            file="voice/ZoneList.tsx with voice/ParticipantRow.tsx"
            page="a club's voice room — the zones and the roster"
            today={
              <div className="space-y-4">
                <ZoneList paint={todayPaint} />
                <ParticipantRows
                  success={STATUS_BY_ID.success.today}
                  destructive={STATUS_BY_ID.destructive.today}
                />
              </div>
            }
            ruled={
              <div className="space-y-4">
                <ZoneList paint={ruledPaint} />
                <ParticipantRows
                  success={toneOf("success", true).ink}
                  destructive={toneOf("destructive", true).ink}
                />
              </div>
            }
          />
        </div>
      </Case>

      <Case title="Valor on the dark ground">
        <div className="space-y-10">
          <Exemplar
            file="about/yty-section.tsx"
            page="/about, the Valor card"
          >
            <Compare columns={5}>
              {VALOR_CANDIDATES.map((candidate) => (
                <Panel key={candidate.key} label={candidate.hex}>
                  <ElementCard
                    id="valor"
                    paint={valorPaint(candidate.hex)("valor")}
                  />
                </Panel>
              ))}
            </Compare>
          </Exemplar>
          <Exemplar
            file="about/yty-section.tsx"
            page="/about, the Four Yty-Elements grid"
          >
            <Compare columns={5}>
              {VALOR_CANDIDATES.map((candidate) => (
                <Panel key={candidate.key} label={candidate.hex}>
                  <div className="grid gap-4">
                    {FAMILY_ORDER.map((id) => (
                      <ElementCard
                        key={id}
                        id={id}
                        paint={valorPaint(candidate.hex)(id)}
                      />
                    ))}
                  </div>
                </Panel>
              ))}
            </Compare>
          </Exemplar>
          <Exemplar
            file="voice/ZoneList.tsx"
            page="a club's voice room — the zones, Valor joined"
          >
            <Compare columns={5}>
              {VALOR_CANDIDATES.map((candidate) => (
                <Panel key={candidate.key} label={candidate.hex}>
                  <ZoneList paint={valorPaint(candidate.hex)} active="valor" />
                </Panel>
              ))}
            </Compare>
          </Exemplar>
        </div>
      </Case>

      <Case title="The admin surfaces, under the re-matched grammar">
        <div className="space-y-10">
          <Pair
            file="admin/dashboard/product-attention-grid.tsx"
            page="/admin — the attention queue, two products per kind"
            today={
              <div className="grid gap-3 sm:grid-cols-2">
                {PRODUCTS.map((product) => (
                  <AttentionCard
                    key={product.name}
                    product={product}
                    ink={YTY_FAMILIES[PRODUCT_KIND_GRAMMAR[product.kind].family].soft}
                    warning={STATUS_BY_ID.warning.today}
                  />
                ))}
              </div>
            }
            ruled={
              <div className="grid gap-3 sm:grid-cols-2">
                {PRODUCTS.map((product) => (
                  <AttentionCard
                    key={product.name}
                    product={product}
                    ink={YTY_ROLES[PRODUCT_KIND_GRAMMAR[product.kind].family].ink}
                    warning={toneOf("warning", true).ink}
                  />
                ))}
              </div>
            }
          />
          <Pair
            file="admin/dashboard/schedule-panel.tsx"
            page="/admin — the schedule's type filter"
            today={
              <TypeChips
                ink={(kind) =>
                  YTY_FAMILIES[PRODUCT_KIND_GRAMMAR[kind].family].soft
                }
              />
            }
            ruled={
              <TypeChips
                ink={(kind) => YTY_ROLES[PRODUCT_KIND_GRAMMAR[kind].family].ink}
              />
            }
          />
        </div>
      </Case>

      <Case title="A status as a badge, a label and a sentence">
        <div className="space-y-10">
          <Exemplar
            file="ui/badge.tsx"
            page="/admin/users/[id] — the participation pill, all four states"
          >
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg p-4"
              style={{ backgroundColor: CARD }}
            >
              {RULED.map((tone) => (
                <StatusBadge key={tone.key} tone={tone} />
              ))}
            </div>
          </Exemplar>

          <Pair
            file="gedu/session-feed/SessionFeedItem.tsx"
            page="a gedu's session feed — the card's status line"
            today={
              <div
                className="flex flex-col gap-2 rounded-lg p-4"
                style={{ backgroundColor: CARD }}
              >
                {TODAY.map((tone) => (
                  <StatusLabel key={tone.key} tone={tone} />
                ))}
              </div>
            }
            ruled={
              <div
                className="flex flex-col gap-2 rounded-lg p-4"
                style={{ backgroundColor: CARD }}
              >
                {RULED.map((tone) => (
                  <StatusLabel key={tone.key} tone={tone} />
                ))}
              </div>
            }
          />

          <Pair
            file="family/gamer-credential-fields.tsx with parent/PaymentProblemBadge.tsx"
            page="a field's error, and the billing line on a parent's My SOG"
            today={
              <div
                className="space-y-3 rounded-lg p-4"
                style={{ backgroundColor: CARD }}
              >
                <StatusSentence tone={toneOf("destructive", false)} coloured />
                <StatusSentence tone={toneOf("info", false)} coloured />
              </div>
            }
            ruled={
              <div
                className="space-y-3 rounded-lg p-4"
                style={{ backgroundColor: CARD }}
              >
                <StatusSentence
                  tone={toneOf("destructive", true)}
                  coloured={false}
                />
                <StatusSentence tone={toneOf("info", true)} coloured={false} />
              </div>
            }
          />
        </div>
      </Case>

      <Case title="A family name beside its glyph">
        <Pair
          file="admin/dashboard/product-type-key-rail.tsx"
          page="/admin — the product-type key"
          today={
            <div className="flex flex-col gap-2">
              {KIND_ORDER.map((kind) => {
                const family = PRODUCT_KIND_GRAMMAR[kind].family;
                return (
                  <KeyRailEntry
                    key={kind}
                    kind={kind}
                    tile={alpha(YTY_FAMILIES[family].strong, 0.15)}
                    ink={YTY_FAMILIES[family].soft}
                    edge={null}
                  />
                );
              })}
            </div>
          }
          ruled={
            <div className="flex flex-col gap-2">
              {KIND_ORDER.map((kind) => {
                const family = PRODUCT_KIND_GRAMMAR[kind].family;
                return (
                  <KeyRailEntry
                    key={kind}
                    kind={kind}
                    tile={GROUND}
                    ink={YTY_ROLES[family].ink}
                    edge={YTY_ROLES[family].area}
                  />
                );
              })}
            </div>
          }
        />
      </Case>

      <Case title="Where a hue meets itself">
        <Exemplar
          file="voice/ZoneList.tsx with ui/badge.tsx"
          page="one card carrying a family and a status of the same hue"
        >
          <div
            className="space-y-4 rounded-lg border border-border p-4"
            style={{ backgroundColor: CARD }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2.5"
                style={{
                  borderColor: YTY_ROLES.glow.area,
                  backgroundColor: GROUND,
                }}
              >
                <Glyph icon={FAMILY_GLYPH.glow} size={20} colour={YTY_ROLES.glow.ink} />
                <span className="text-body-s" style={{ color: INK }}>
                  {YTY_FAMILIES.glow.name}
                </span>
              </span>
              <StatusBadge tone={toneOf("success", true)} />
              <StatusLabel tone={toneOf("success", true)} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2.5"
                style={{
                  borderColor: YTY_ROLES.wit.area,
                  backgroundColor: GROUND,
                }}
              >
                <Glyph icon={FAMILY_GLYPH.wit} size={20} colour={YTY_ROLES.wit.ink} />
                <span className="text-body-s" style={{ color: INK }}>
                  {YTY_FAMILIES.wit.name}
                </span>
              </span>
              <StatusBadge tone={toneOf("info", true)} />
              <StatusLabel tone={toneOf("info", true)} />
            </div>
          </div>
        </Exemplar>
      </Case>

      <Case title="At density">
        <div className="space-y-10">
          <Pair
            file="session-feed/SessionFeedShell.tsx with gedu/session-feed/SessionFeedItem.tsx"
            page="a session feed, eight sessions in one scroll"
            today={<FeedRows tones={TODAY} />}
            ruled={<FeedRows tones={RULED} />}
          />
          <Exemplar
            file="admin/dashboard/product-attention-grid.tsx"
            page="/admin — eight cards, two per kind, at the width the grid runs at"
          >
            <div className="space-y-3">
              <Caps>The unlabelled marks, at the same size</Caps>
              <div className="flex flex-wrap items-center gap-3">
                {FAMILY_ORDER.map((id) => (
                  <span
                    key={id}
                    aria-hidden
                    className="h-4 w-10 rounded"
                    style={{ backgroundColor: YTY_ROLES[id].area }}
                  />
                ))}
                {RULED.map((tone) => (
                  <span
                    key={tone.key}
                    aria-hidden
                    className="h-4 w-10 rounded"
                    style={{ backgroundColor: tone.area }}
                  />
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {PRODUCTS.map((product) => (
                  <AttentionCard
                    key={product.name}
                    product={product}
                    ink={YTY_ROLES[PRODUCT_KIND_GRAMMAR[product.kind].family].ink}
                    warning={toneOf("warning", true).ink}
                  />
                ))}
              </div>
            </div>
          </Exemplar>
        </div>
      </Case>

      <Case title="A ring">
        <Exemplar
          file="lib/constants/yty.ts with ui/input.tsx"
          page="a selected zone tile, and a focused field"
        >
          <RingRow area={(id) => YTY_ROLES[id].area} />
        </Exemplar>
      </Case>
    </>
  );
}
