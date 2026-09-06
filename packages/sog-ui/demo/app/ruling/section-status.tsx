/**
 * Question 2 — the status colours.
 *
 * The heaviest set in the inventory: 335 utility occurrences in 116 files,
 * classified by construct in `STATUS_SITES` in `inventory.ts`, which also
 * carries the regeneration command and the contrast arithmetic behind every
 * value drawn here.
 *
 * **What the owner has already chosen, and what is left to see.** Destructive
 * `#FF5C5C` and warning `#DFCB25` are liked: both are new colours of their own,
 * belonging to no family, and neither collides with anything the library ships.
 * For the other two the owner refused a new near-duplicate hue and took the
 * library's own instead — **success is Glow and info is Wit** — on the ground
 * that Wit and a near-identical info blue on one page read as two shades of one
 * colour, and Glow and a near-identical success green the same, so a smaller
 * palette carrying one hue with two related meanings is the better trade than a
 * larger one whose members cannot be told apart. Error and warning are far
 * enough from everything to stay their own. What is left is to see the four in
 * their real constructs before the ruling is final, which is this section.
 *
 * **Every construct is drawn with all four statuses in it at once, today's row
 * above the proposed row.** A status colour is not one thing spent 335 times —
 * it is ink under a field, a wash behind a paragraph, a disc on a card's
 * corner, a dot on a rail — and those ask different things of the same hex, so
 * a set that works as a badge can fail as a sentence. Drawing one status at a
 * time would hide the only property that matters here, which is whether the
 * four are a *set*: four marks a reader can tell apart at a glance in one
 * frame, at the size each of them is really drawn.
 *
 * **Info is drawn twice in every proposed row, and that fork is the ruling's
 * real content.** Wit strong `#3A71DE` measures 4.10 against ink and 4.57
 * against white, so it fails the 4.5 body floor under an ink label and clears
 * it under a white one by 0.07 — and as *text on the card* it measures 3.81,
 * under the body floor outright, which matters because ink on a neutral ground
 * is 166 of the 335 sites. Wit soft `#4DB3F5` measures 8.10 under ink and 7.53
 * as text on the card and carries both jobs comfortably, but spending a soft
 * variant as a *fill* is exactly the open recipe question in §2 rather than a
 * settled move. So: strong under white, and soft under ink, side by side
 * everywhere, and the eye picks.
 *
 * **The alert tints stay as they were drawn.** `bg-x/10` is a real alpha
 * composited over the card by the browser, not a pre-mixed hex, so the dulling
 * is visible rather than asserted — and it is now drawn under the proposed hues
 * too. Whether a soft ground may exist at all is §9's remaining half and this
 * section says nothing about it beyond showing it.
 *
 * **Both alternatives the section used to close on are gone, and the ruling is
 * why.** Info drawn with no hue at all was an answer to "which new blue"; the
 * owner has chosen a blue, so a hueless note is no longer one of the options on
 * the table. Warning drawn as the brand amber was an answer to "the caution
 * colour and the call to action are the same"; `#DFCB25` is that answer now.
 * Neither is a candidate any more, so neither is drawn — a page that keeps
 * showing a rejected option is asking a question that has been answered.
 *
 * **What lands when this is ruled.** Four status tokens in the library, each
 * with the ink or white companion that reads on it and its measured pairings in
 * the contrast ledger; success and info as two more rows of the tone grammar
 * rather than two more colours, because a status is a fact and a fact takes a
 * family; Sogverse's four `--color-*` deleted and the email hex mirror reading
 * the library. The token names do not move, so no call site changes spelling.
 */

import { BRAND, NEUTRALS, YTY_FAMILIES } from "../../../src/tokens/brand";
import { tailwindAlpha } from "./colour";
import {
  PROPOSED_STATUSES,
  STATUS_BY_ID,
  STATUS_ROWS,
  type StatusId,
  type StatusRow,
} from "./inventory";
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
  Question,
  type GlyphName,
} from "./parts";

/**
 * One entry in a comparison row: a name, the colour it paints, and the label
 * that reads on a solid fill of it.
 *
 * `status` is the *state* rather than the entry, because the proposed row has
 * five entries for four states — the two info variants share a glyph and share
 * every word they carry, and only the colour differs. Keying the copy on the
 * state is what keeps the fork about colour alone.
 */
interface Tone {
  readonly key: string;
  readonly label: string;
  readonly status: StatusId;
  readonly hex: string;
  readonly onFill: string;
}

/** Today's value for one state, as a tone. */
function toneOf(row: StatusRow): Tone {
  return {
    key: row.id,
    label: `${row.id} ${row.today}`,
    status: row.id,
    hex: row.today,
    onFill: row.todayForeground,
  };
}

const TODAY: readonly Tone[] = STATUS_ROWS.map(toneOf);

/**
 * Today's four, keyed by state, for the collision scenes — which need several
 * of them in one drawing rather than one per column.
 */
const TODAY_BY_ID: Record<StatusId, Tone> = {
  destructive: toneOf(STATUS_BY_ID.destructive),
  success: toneOf(STATUS_BY_ID.success),
  info: toneOf(STATUS_BY_ID.info),
  warning: toneOf(STATUS_BY_ID.warning),
};

const PROPOSED: readonly Tone[] = PROPOSED_STATUSES.map((status) => ({
  key: status.id,
  label: status.label,
  status: status.status,
  hex: status.hex,
  onFill: status.onFill,
}));

const STATUS_GLYPH: Record<StatusId, GlyphName> = {
  destructive: "cross",
  success: "check",
  info: "info",
  warning: "alert",
};

/**
 * The words each state carries, one set per shape the constructs need.
 *
 * Real copy of the kind the construct really holds, taken from the surfaces
 * these tokens fill: a field error is a sentence about the field, a rail dot
 * has no words at all, a badge is one or two. Lorem would hide the thing this
 * section is for — whether four marks are legible at the size and length the
 * app actually sets them.
 */
const COPY: Record<
  StatusId,
  {
    field: string;
    meta: string;
    badge: string;
    action: string;
    title: string;
    body: string;
  }
> = {
  destructive: {
    field: "That username is already taken.",
    meta: "Microphone off",
    badge: "Payment failed",
    action: "Remove seat",
    title: "Payment failed",
    body: "The card on file was declined, so this month's session is unpaid.",
  },
  success: {
    field: "Aino's Minecraft account is linked.",
    meta: "Report complete",
    badge: "Active",
    action: "Mark complete",
    title: "Seat confirmed",
    body: "Aino is on the roster for Tuesday's club.",
  },
  info: {
    field: "This club is run in Helsinki time.",
    meta: "Next session",
    badge: "Next session",
    action: "Show details",
    title: "Times shown in your timezone",
    body: "This club is run in Helsinki time; the clock faces are converted.",
  },
  warning: {
    field: "Two seats left on this camp.",
    meta: "Needs attention",
    badge: "Waitlisted",
    action: "Join waitlist",
    title: "Two seats left",
    body: "This camp closes when the last seat goes, and the waitlist opens after that.",
  },
};

/**
 * One construct drawn once per tone, in a row, under one caption.
 *
 * The caption sits on the row rather than on each cell: the construct and the
 * page it comes from are the same for all four (or five) of them, and repeating
 * the locator per cell would put four identical lines under one comparison and
 * make the row read as four separate exemplars rather than as one set.
 *
 * The ground is a prop because most of these constructs live on both — an alert
 * appears in a dialog on a card and in a page's own column — and a hue that
 * clears the card is not thereby proven on the page.
 */
function ToneRow({
  label,
  tones,
  file,
  page,
  ground,
  render,
}: {
  label: string;
  tones: readonly Tone[];
  file: string;
  page: string;
  ground: string;
  render: (tone: Tone) => React.ReactNode;
}) {
  return (
    <div>
      <Caps>{label}</Caps>
      <div className="mt-3">
        <Exemplar file={file} page={page}>
          <Compare columns={tones.length === 5 ? 5 : 4}>
            {tones.map((tone) => (
              <Panel key={tone.key} label={tone.label}>
                <div
                  className="rounded-md p-3"
                  style={{ backgroundColor: ground }}
                >
                  {render(tone)}
                </div>
              </Panel>
            ))}
          </Compare>
        </Exemplar>
      </div>
    </div>
  );
}

/** Today above proposed, on one ground, for one construct. */
function BothSets({
  file,
  page,
  ground,
  groundName,
  render,
}: {
  file: string;
  page: string;
  ground: string;
  /** Which ground this pair is drawn on, as a name rather than a sentence. */
  groundName: string;
  render: (tone: Tone) => React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <ToneRow
        label={`Today — ${groundName}`}
        tones={TODAY}
        file={file}
        page={page}
        ground={ground}
        render={render}
      />
      <ToneRow
        label={`Proposed — ${groundName}`}
        tones={PROPOSED}
        file={file}
        page={page}
        ground={ground}
        render={render}
      />
    </div>
  );
}

// ------------------------------------------- ink on a neutral ground (166)

/**
 * `family/gamer-credential-fields.tsx` — the field, its value and the error
 * under it, which is what 19 of these sites are and what every auth form draws.
 *
 * The field around the message is furniture; the message is the construct. It
 * is drawn at the size the app sets it (`text-sm`) rather than at a comfortable
 * one, because a status hue's whole job here is to be legible in one short line
 * of small text on a neutral ground — the case where a fill's contrast tells
 * you nothing.
 */
function FieldError({ tone }: { tone: Tone }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Username</p>
      <div
        className="flex h-10 w-full items-center rounded-md border border-border px-3 py-2 text-base"
        style={{ backgroundColor: GROUND, color: INK }}
      >
        aino
      </div>
      <p className="text-sm" style={{ color: tone.hex }}>
        {COPY[tone.status].field}
      </p>
    </div>
  );
}

/**
 * `gedu/session-feed/SessionFeedItem.tsx` — the card's trailing status line: a
 * 14px glyph and a word, both in the status colour.
 *
 * The glyph and the label together are the rule the library already holds —
 * meaning never travels by hue alone — so this is the construct where a shared
 * hue is *supposed* to be survivable. If Glow-as-success fails anywhere it
 * should not fail here.
 */
function MetaLine({ tone }: { tone: Tone }) {
  return (
    <span
      className="flex items-center gap-1.5 text-xs font-medium"
      style={{ color: tone.hex }}
    >
      <Glyph name={STATUS_GLYPH[tone.status]} size={14} colour={tone.hex} />
      {COPY[tone.status].meta}
    </span>
  );
}

// ------------------------------ a tinted ground under its own ink (121)

/**
 * `ui/alert.tsx` — the four variants, each a 10% wash of its own colour under
 * its own ink, with the neutral border every alert wears since the border
 * sweep.
 *
 * Drawn with `color-mix` in the same colour space Tailwind's `/n` modifier
 * compiles to, so what is on screen is the browser's own compositing rather
 * than this page's arithmetic dressed up as it.
 */
function AlertBox({ tone }: { tone: Tone }) {
  const copy = COPY[tone.status];
  return (
    <div
      className="relative flex items-start gap-3 rounded-lg border border-border p-3 text-sm"
      style={{ backgroundColor: tailwindAlpha(tone.hex, 10), color: tone.hex }}
    >
      <span className="pt-0.5">
        <Glyph name={STATUS_GLYPH[tone.status]} size={18} colour={tone.hex} />
      </span>
      <span className="min-w-0">
        <span className="block font-medium leading-none">{copy.title}</span>
        <span className="mt-1 block text-muted-foreground">{copy.body}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------- a tinted pill (9)

/**
 * `session-feed/NowDivider.tsx` — the later-sessions divider: a tick on the
 * rail at 70%, a pill at 10% under its own ink, and a rule at 40% running out
 * to the edge.
 *
 * Three strengths of one hue in one construct, which is why it is drawn rather
 * than represented by the pill alone: the two rules are the case where a colour
 * has to stay visible against the page with no text on it at all.
 */
function LaterDivider({ tone }: { tone: Tone }) {
  return (
    <div className="relative flex items-center gap-3 py-2 pl-6">
      <span
        aria-hidden
        className="absolute left-0 top-1/2 h-0.5 w-4 -translate-y-1/2 rounded-full"
        style={{ backgroundColor: tailwindAlpha(tone.hex, 70) }}
      />
      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold tracking-wider uppercase"
        style={{
          backgroundColor: tailwindAlpha(tone.hex, 10),
          color: tone.hex,
        }}
      >
        <Glyph name="chevron" size={16} colour={tone.hex} />
        4 later sessions
      </span>
      <span
        aria-hidden
        className="h-0.5 flex-1 rounded-full"
        style={{ backgroundColor: tailwindAlpha(tone.hex, 40) }}
      />
    </div>
  );
}

/** `admin/dashboard/needs-attention-panel.tsx` — the queue's count, at 15% under its own ink. */
function CountPill({ tone }: { tone: Tone }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xl font-semibold">Needs attention</span>
      <span
        className="rounded-full px-3 py-1 text-sm font-semibold"
        style={{
          backgroundColor: tailwindAlpha(tone.hex, 15),
          color: tone.hex,
        }}
      >
        7
      </span>
    </div>
  );
}

// -------------------------------------- a solid fill under a label (19)

/** `ui/badge.tsx` — the pill `/admin/users/[id]` maps a participation status to. */
function StatusBadge({ tone }: { tone: Tone }) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold shadow"
      style={{ backgroundColor: tone.hex, color: tone.onFill }}
    >
      {COPY[tone.status].badge}
    </span>
  );
}

/** `ui/button.tsx` — the destructive variant, at the size a real action is drawn. */
function FilledButton({ tone }: { tone: Tone }) {
  return (
    <span
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap shadow-sm"
      style={{ backgroundColor: tone.hex, color: tone.onFill }}
    >
      {COPY[tone.status].action}
    </span>
  );
}

/**
 * `parent/PaymentProblemBadge.tsx` — the solid disc straddling a session card's
 * top-right corner, cut out of the card by a ring in the page colour.
 *
 * The smallest label-bearing fill in the app: a 28px disc carrying a 16px
 * glyph. It is the case that decides whether a fill's companion has to be
 * measured at the body floor at all — the mark inside it is a glyph, held to
 * the 3:1 floor, and the disc is what makes that distinction concrete.
 */
function CornerBadge({ tone }: { tone: Tone }) {
  return (
    <div className="relative">
      <div
        className="rounded-lg border border-border p-3 text-sm"
        style={{ backgroundColor: CARD, color: INK }}
      >
        <p className="font-medium">Tuesday club</p>
        <p className="text-xs text-muted-foreground">Wednesdays, 17:00</p>
      </div>
      <span
        className="ring-background absolute -top-2 -right-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full shadow-sm ring-2"
        style={{ backgroundColor: tone.hex, color: tone.onFill }}
      >
        <Glyph name="alert" size={16} colour={tone.onFill} />
      </span>
    </div>
  );
}

// ------------------------------------ a solid mark with no label (15)

/**
 * `session-feed/SessionFeedShell.tsx` with `gedu/session-feed/SessionFeed.tsx`
 * — the rail dot, 10px across, cut out of the rail by a 4px ring in the page
 * colour.
 *
 * The construct with no words at all, which makes it the hardest case for a
 * shared hue: the glyph-and-label rule that rescues every other one has nothing
 * to work with here, and a column of dots is read purely as colour. It is also
 * where success and info sit on the same rail, four dots apart.
 */
function RailDots({ tone }: { tone: Tone }) {
  return (
    <div className="relative space-y-3 border-l border-border pl-6">
      {["Tue 2 Sep", "Tue 9 Sep", "Tue 16 Sep"].map((day, index) => (
        <div key={day} className="relative">
          <span
            aria-hidden
            className="ring-background absolute -left-6 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-4"
            style={{
              backgroundColor:
                index === 1 ? tone.hex : tailwindAlpha(MUTED_INK, 60),
            }}
          />
          <div
            className="rounded-lg border border-border p-2 text-xs"
            style={{ backgroundColor: CARD, color: INK }}
          >
            {day}
          </div>
        </div>
      ))}
    </div>
  );
}

/** `public/products/seat-availability-bar.tsx` — the seats-left bar over the muted track. */
function SeatBar({ tone }: { tone: Tone }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs text-muted-foreground">3 of 12 seats left</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: "25%", backgroundColor: tone.hex }}
        />
      </div>
    </div>
  );
}

// -------------------------------------------------------- a ring (4)

/**
 * `chat/ChatMessageRow.tsx` — the message that names the reader: a 10% tint and
 * a 1px ring at 40%, never a border, so the box stays the size it was.
 *
 * A ring at 40% over a card is the faintest thing in the whole set, and it has
 * to survive being one row in a scrolling log rather than a mark on its own.
 */
function MentionRow({ tone }: { tone: Tone }) {
  return (
    <div className="space-y-0.5">
      <div className="rounded px-1.5 py-0.5 text-sm leading-snug">
        <span className="font-medium">Mika</span> anyone building tonight?
      </div>
      <div
        className="rounded px-1.5 py-0.5 text-sm leading-snug"
        style={{
          backgroundColor: tailwindAlpha(tone.hex, 10),
          boxShadow: `0 0 0 1px ${tailwindAlpha(tone.hex, 40)}`,
        }}
      >
        <span className="font-medium">Aino</span> @Mika I am on the survival
        server
      </div>
      <div className="rounded px-1.5 py-0.5 text-sm leading-snug">
        <span className="font-medium">Mika</span> on my way
      </div>
    </div>
  );
}

// ------------------------- a card lit from its leading edge (1)

/**
 * `family/EnrollmentCard.tsx` — the awaiting card, lit from its leading edge by
 * a 5% wash fading to nothing.
 *
 * Drawn beside the live card in the act colour, because the two exist to be
 * told apart at a glance in one list and neither is judged alone. This is the
 * one status site that is also a gradient, so it rides §14 as well; what it
 * shows here is only whether the status hue is still legible at 5% over the
 * card, which is the faintest use any of the four is put to.
 */
function LitCards({ tone }: { tone: Tone }) {
  return (
    <div className="space-y-3">
      <div
        className="rounded-lg border border-border p-4"
        style={{
          backgroundImage: `linear-gradient(to right, ${tailwindAlpha(
            BRAND.act.hex,
            5,
          )}, transparent)`,
          backgroundColor: CARD,
        }}
      >
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Club
        </p>
        <p className="text-sm font-medium">Minecraft Tuesdays</p>
      </div>
      <div
        className="rounded-lg border border-border p-4"
        style={{
          backgroundImage: `linear-gradient(to right, ${tailwindAlpha(
            tone.hex,
            5,
          )}, transparent)`,
          backgroundColor: CARD,
        }}
      >
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Camp
        </p>
        <p className="text-sm font-medium">Roblox summer camp</p>
      </div>
    </div>
  );
}

// ------------------------------------------- the collision, in situ

/**
 * The four Yty families as `about/yty-section.tsx` and `voice/ZoneList.tsx`
 * spend them, which is where the shared hue lives on the other side.
 *
 * Drawn on the recipe those consumers use today — a 10% tile of the strong
 * variant, the soft variant as glyph and ink — because that is what a reader
 * meets on screen right now, and the collision being ruled on is between what
 * is rendered rather than between two authored values. The recipe itself is
 * §2's question and is not re-asked here.
 */
const ZONES: readonly { id: "harmony" | "glow" | "valor" | "wit"; glyph: GlyphName }[] = [
  { id: "harmony", glyph: "heart" },
  { id: "glow", glyph: "sun" },
  { id: "valor", glyph: "sword" },
  { id: "wit", glyph: "brain" },
];

function ZoneTiles() {
  return (
    <div className="space-y-2">
      {ZONES.map((zone) => {
        const family = YTY_FAMILIES[zone.id];
        return (
          <div
            key={zone.id}
            className="rounded-xl border px-3 py-2.5"
            style={{ borderColor: EDGE, backgroundColor: CARD }}
          >
            <div className="flex items-center gap-2">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: tailwindAlpha(family.strong, 10) }}
              >
                <Glyph name={zone.glyph} size={20} colour={family.soft} />
              </span>
              <span className="text-body-s" style={{ color: INK }}>
                {family.name}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * `voice/ParticipantRow.tsx` — the room's roster, whose trailing group carries
 * the mic state as a 14px glyph: `text-success` when the mic is open,
 * `text-destructive` when it is muted.
 *
 * This is the collision, verbatim and already on screen: the roster and the Yty
 * zone list are two columns of one page, so under the proposal a Glow-strong
 * mic glyph sits a few centimetres from a Glow-tinted zone tile, meaning "this
 * child can be heard" and "the Glow zone" respectively.
 */
function ParticipantRows({
  success,
  destructive,
}: {
  success: string;
  destructive: string;
}) {
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
          {/* The real row carries an identicon here. A plain muted square
              stands in for it: the avatar is artwork with its own palette and
              its own question (§7), and drawing one would put a second set of
              colours into the frame the collision is being judged in. */}
          <span
            className="h-8 w-8 shrink-0 rounded-md"
            style={{ backgroundColor: NEUTRALS.muted.hex }}
          />
          <span className="min-w-0 max-w-fit flex-1 truncate text-sm font-medium">
            {person.name}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {person.open ? (
              <Glyph name="mic" size={14} colour={success} />
            ) : (
              <Glyph name="micOff" size={14} colour={destructive} />
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The product kinds, each with the family and the glyph the tone grammar gives it. */
const KINDS: readonly {
  label: string;
  family: "harmony" | "glow" | "valor" | "wit";
  glyph: GlyphName;
  issue: string;
}[] = [
  {
    label: "Minecraft Tuesdays",
    family: "harmony",
    glyph: "gamepad",
    issue: "4 gamers in no group",
  },
  {
    label: "Espoo school club",
    family: "wit",
    glyph: "school",
    issue: "Group B has no gedu",
  },
  {
    label: "Autumn build camp",
    family: "valor",
    glyph: "tent",
    issue: "6 waiting, 2 seats open",
  },
  {
    label: "Roblox creator night",
    family: "glow",
    glyph: "calendar",
    issue: "No gedu fee set",
  },
];

/**
 * `admin/dashboard/product-attention-grid.tsx` — the queue's cards, each headed
 * by the product kind's own tinted glyph and carrying its problems as
 * status-toned lines underneath.
 *
 * The second place the collision is already real: the Glow-tinted event glyph
 * and the Wit-tinted municipality-club glyph sit in the same grid as the
 * warning lines and, four inches up the page, the all-clear's `text-success`
 * check. One card is drawn per kind so all four families are present at once,
 * which is how an admin meets them.
 */
function AttentionCards({ warning }: { warning: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {KINDS.map((kind) => {
        const family = YTY_FAMILIES[kind.family];
        return (
          <div
            key={kind.label}
            className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-3"
          >
            <span className="flex items-start gap-2">
              <span className="mt-0.5">
                <Glyph name={kind.glyph} size={16} colour={family.soft} />
              </span>
              <span className="text-sm leading-snug font-medium">
                {kind.label}
              </span>
            </span>
            <span className="flex items-start gap-1.5 text-xs leading-snug">
              <span className="mt-0.5">
                <Glyph name="users" size={14} colour={warning} />
              </span>
              <span>{kind.issue}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The one adjacency this page constructs rather than copies, and the reason it
 * has to.
 *
 * Wit and info share no surface today: the families are painted on admin
 * product surfaces, on `/about` and in the voice room, and info is painted in
 * feeds, chat and forms — so there is no page to photograph. But the ruling is
 * what removes that guarantee: the moment info *is* Wit, the two meanings are
 * one colour whether or not a page has yet put them side by side, and a
 * decision made on the absence of a screenshot would be a decision made on
 * today's page inventory rather than on the palette. So the Wit zone tile and
 * the gedu feed card's info badge are drawn together here, each class-for-class
 * from its own component, with the adjacency chosen.
 */
function WitBesideInfo({ info, onInfo }: { info: string; onInfo: string }) {
  const family = YTY_FAMILIES.wit;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className="inline-flex items-center gap-2 rounded-xl border px-3 py-2.5"
        style={{ borderColor: EDGE, backgroundColor: CARD }}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: tailwindAlpha(family.strong, 10) }}
        >
          <Glyph name="brain" size={20} colour={family.soft} />
        </span>
        <span className="text-body-s" style={{ color: INK }}>
          {family.name}
        </span>
      </span>
      <span
        className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
        style={{ backgroundColor: tailwindAlpha(info, 10), color: info }}
      >
        Next session
      </span>
      <span
        className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
        style={{ backgroundColor: info, color: onInfo }}
      >
        Live
      </span>
    </div>
  );
}

/** One whole collision scene, in one set of colours. */
function Collision({
  destructive,
  success,
  info,
  onInfo,
  warning,
}: {
  destructive: string;
  success: string;
  info: string;
  onInfo: string;
  warning: string;
}) {
  return (
    <div className="space-y-6">
      <Exemplar
        file="voice/ZoneList.tsx with voice/ParticipantRow.tsx"
        page="a club's voice room — the zones and the roster"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <ZoneTiles />
          <ParticipantRows success={success} destructive={destructive} />
        </div>
      </Exemplar>
      <Exemplar
        file="admin/dashboard/product-attention-grid.tsx"
        page="/admin — the attention queue, one card per kind"
      >
        <AttentionCards warning={warning} />
      </Exemplar>
      <Exemplar
        file="voice/ZoneList.tsx with gedu/session-feed/SessionFeedItem.tsx"
        page="the Wit zone tile and the feed's session tag"
      >
        <WitBesideInfo info={info} onInfo={onInfo} />
      </Exemplar>
    </div>
  );
}

export function StatusSection() {
  return (
    <Question n={2} title="Status colours">
      <Case title="Ink on a neutral ground">
        <div className="space-y-10">
          <BothSets
            file="family/gamer-credential-fields.tsx"
            page="the add-a-gamer form, an invalid field"
            ground={CARD}
            groundName="on a card"
            render={(tone) => <FieldError tone={tone} />}
          />
          <BothSets
            file="gedu/session-feed/SessionFeedItem.tsx"
            page="a gedu's session feed, the card's status line"
            ground={CARD}
            groundName="on a card"
            render={(tone) => <MetaLine tone={tone} />}
          />
          <BothSets
            file="gedu/session-feed/SessionFeedItem.tsx"
            page="the same line, on the page's own ground"
            ground={GROUND}
            groundName="on the page"
            render={(tone) => <MetaLine tone={tone} />}
          />
        </div>
      </Case>

      <Case title="A tinted ground under its own ink">
        <div className="space-y-10">
          <BothSets
            file="ui/alert.tsx"
            page="the seat-purchase flow and the switch-profile dialog"
            ground={CARD}
            groundName="on a card"
            render={(tone) => <AlertBox tone={tone} />}
          />
          <BothSets
            file="ui/alert.tsx"
            page="the same alert, in a page's own column"
            ground={GROUND}
            groundName="on the page"
            render={(tone) => <AlertBox tone={tone} />}
          />
        </div>
      </Case>

      <Case title="A tinted pill">
        <div className="space-y-10">
          <BothSets
            file="session-feed/NowDivider.tsx"
            page="a session feed, the later-sessions divider"
            ground={GROUND}
            groundName="on the page"
            render={(tone) => <LaterDivider tone={tone} />}
          />
          <BothSets
            file="admin/dashboard/needs-attention-panel.tsx"
            page="/admin, the queue's count"
            ground={CARD}
            groundName="on a card"
            render={(tone) => <CountPill tone={tone} />}
          />
        </div>
      </Case>

      <Case title="A solid fill under a label">
        <div className="space-y-10">
          <BothSets
            file="ui/badge.tsx"
            page="/admin/users/[id], the participation pill"
            ground={CARD}
            groundName="on a card"
            render={(tone) => <StatusBadge tone={tone} />}
          />
          <BothSets
            file="ui/button.tsx"
            page="a confirm dialog's affirmative action"
            ground={CARD}
            groundName="on a card"
            render={(tone) => <FilledButton tone={tone} />}
          />
          <BothSets
            file="parent/PaymentProblemBadge.tsx"
            page="a family's My SOG, the card's corner badge"
            ground={GROUND}
            groundName="on the page"
            render={(tone) => <CornerBadge tone={tone} />}
          />
        </div>
      </Case>

      <Case title="A solid mark with no label">
        <div className="space-y-10">
          <BothSets
            file="session-feed/SessionFeedShell.tsx with gedu/session-feed/SessionFeed.tsx"
            page="a session feed, the rail dot"
            ground={GROUND}
            groundName="on the page"
            render={(tone) => <RailDots tone={tone} />}
          />
          <BothSets
            file="public/products/seat-availability-bar.tsx"
            page="a browse card, the seats-left bar"
            ground={CARD}
            groundName="on a card"
            render={(tone) => <SeatBar tone={tone} />}
          />
        </div>
      </Case>

      <Case title="A ring">
        <BothSets
          file="chat/ChatMessageRow.tsx"
          page="a club's chat, a message that names the reader"
          ground={CARD}
          groundName="on a card"
          render={(tone) => <MentionRow tone={tone} />}
        />
      </Case>

      <Case title="A card lit from its leading edge">
        <BothSets
          file="family/EnrollmentCard.tsx"
          page="a parent's My SOG, the live card and the awaiting card"
          ground={GROUND}
          groundName="on the page"
          render={(tone) => <LitCards tone={tone} />}
        />
      </Case>

      <Case title="Where the hue meets itself">
        <div className="space-y-10">
          <div>
            <Caps>Today</Caps>
            <div className="mt-3">
              <Collision
                destructive={TODAY_BY_ID.destructive.hex}
                success={TODAY_BY_ID.success.hex}
                info={TODAY_BY_ID.info.hex}
                onInfo={TODAY_BY_ID.info.onFill}
                warning={TODAY_BY_ID.warning.hex}
              />
            </div>
          </div>
          <div>
            <Caps>Proposed — info as yty-wit-strong · white</Caps>
            <div className="mt-3">
              <Collision
                destructive="#FF5C5C"
                success={YTY_FAMILIES.glow.strong}
                info={YTY_FAMILIES.wit.strong}
                onInfo={BRAND.world.foreground}
                warning="#DFCB25"
              />
            </div>
          </div>
          <div>
            <Caps>Proposed — info as yty-wit-soft · ink</Caps>
            <div className="mt-3">
              <Collision
                destructive="#FF5C5C"
                success={YTY_FAMILIES.glow.strong}
                info={YTY_FAMILIES.wit.soft}
                onInfo={NEUTRALS.background.hex}
                warning="#DFCB25"
              />
            </div>
          </div>
        </div>
      </Case>
    </Question>
  );
}
