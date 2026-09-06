/**
 * Question 1 — act as a figure.
 *
 * **The observation this section is built on, in the owner's words.** Pointing
 * at the product card's waitlist chip (`public/products/status-chip.tsx`: a
 * neutral edge, the page ground, an hourglass and the word in `act`, no fill):
 * the brand colours look bad under either white or black text, and that chip
 * gets around it by putting the colour on the dark ground, where it keeps its
 * greatest contrast and its vibrancy.
 *
 * **The principle, in one sentence, which is what the owner is being asked to
 * accept or reject:** _act is a figure on the dark ground, never a tint of it;
 * a selection or a highlight is an edge, a ring or an ink, never a wash._
 *
 * **Why the section changed shape.** The first build offered every job the same
 * four candidates — a neutral ground, plain act, an act edge, nothing — and
 * asked the owner to rule eleven times. The observation above answers all
 * eleven at once, so the page states one proposal per job and draws it beside
 * what the app does today. A candidate the principle rules out is not drawn.
 * This is a proposal to look at, not a menu.
 *
 * **How the section is ordered, and why it is not eleven equal jobs.** Drawn
 * flat, eleven jobs read as eleven questions and the owner cannot see which of
 * them needs an eye. Only three do, because the sentence above does not settle
 * them by itself, and those three are drawn first and at full size:
 *
 * 1. **Which shape a selected option takes.** The sentence permits an edge, a
 *    ring and a check equally, and geometry picks between them — so it is drawn
 *    on the one site in the job with no control of its own, the image
 *    catalogue's tile, where the fill is the whole of the selection today. A
 *    control-bearing exemplar sits under it at the same four columns, so the
 *    check column can be seen costing nothing on a row whose checkbox is
 *    already saying which one is picked.
 * 2. **Whether a highlighted row keeps its amber weekday.** The WhatsApp
 *    construct pairs the act leading edge with `text-foreground`; the
 *    coloured-text ruling would let "Tue" stay amber, because it is a name and
 *    not a sentence. The two point different ways, so both are drawn beside
 *    today.
 * 3. **Whether a tile behind a mark may keep a tint.** This is the library's
 *    last exemption on the no-alpha rule and the owner has not ruled it out.
 *    The monogram is the harder half — two amber letters standing in for a face
 *    are either a mark or coloured text — so it takes three columns, with the
 *    glyph tile beside it at two, where the tint has the weaker case and the
 *    difference between the two cases is visible in one glance.
 *
 * Everything after them is proof that the sentence covers the rest: one strip,
 * one row per job, today beside the single proposal the table below names, at a
 * smaller scale, with no alternatives to choose between. A job with two
 * exemplars keeps both, because a second exemplar is a different construct and
 * not a second proposal. The two hover jobs stay live there.
 *
 * **What the strip dropped, and why.** Three proposal variants left the page
 * with the reorganisation. Each is a shape to raise again if its primary is
 * rejected, not a shape ruled out:
 *
 * - The pill radio group draws `border-act` alone. Its ring and check columns
 *   are the same three-way choice the first case already puts at full size on a
 *   better exemplar, and drawing them twice asks the question twice.
 * - The field hint drops "the glyph alone" and "an act label, leading rule".
 *   The table names one proposal: the neutral panel with an act glyph, an act
 *   label and the sentence in muted ink. The glyph alone was what the component
 *   can do without gaining a title prop; the leading rule was borrowed from the
 *   lit-card construct to see whether a hint wants one.
 * - Both drop targets drop "a dashed act edge", which was drawn as an outline
 *   so it took no layout. The table names the ring, and two of the six sites
 *   carry one already.
 *
 * Two columns arrived in the same change, and both are decisions 2 and 3
 * themselves: the week row's act weekday, and the monogram's `foreground`
 * initials.
 *
 * **The eleven jobs, what each is proposed, and why.**
 *
 * | job | sites | proposed | why |
 * |---|---|---|---|
 * | A selected option in a form | 14 | an act edge, an act ring, or the check alone | the largest job, and the one where geometry decides: an edge is free on a row that is already bordered, a ring adds a second line without changing the box, and where the site has a native control the control is already saying which one is picked. All three are drawn. |
 * | A highlighted row | 3 | the 2px act leading edge, ink to foreground | the construct the greys landing already put into the WhatsApp list, with its rest state drawn in `border` from the start so nothing appears under a pointer. The chat flash keeps the ring it already has and loses only the wash. |
 * | A callout ground | 1 | a neutral panel, act glyph and act label, body in muted ink | candidate B, which the owner has already ruled for the 121 status sites. A hint under a field is that construct in the brand colour, so it takes that answer. |
 * | An icon tile behind a glyph | 7 | the act glyph on a `lifted` tile | the glyph is already `text-act`, so the tint is a second statement of the same accent behind the first. This row decides the library's last exemption — see below. |
 * | A drop target | 6 | an act ring | the most transient statement in the set, and a ring is the one figure that can appear and vanish without moving what is being dragged over. |
 * | A selected item, with act as its ink | 6 | unchanged but for the wash | act is already the figure here, as the word. Drawn once so the owner can see the principle takes nothing away from it. |
 * | A status chip | 2 | the waitlist chip's shape | the chip the observation came from, at its `primary` tone. Nothing to invent: the shape is already in the app. |
 * | Faded ink on an amber fill | 2 | the meta line moved off the fill | the palette offers exactly one ink for an amber fill, so there is no quieter member of the pair to move to. Where the label cannot leave the fill it goes to full value instead. |
 * | A hover shade on a filled control | 2 | Button's, later | the one job the principle does not answer, because a filled button is the one place a brand colour is a ground on purpose. Drawn live with and without the shade so the cost of deleting it is visible. |
 * | A hover tint on an empty tile | 1 | `hover:bg-lifted` | a hover is a lift and the lift has a grey. Drawn live. |
 * | A ring | 4 | act at full value | a ring is already an edge rather than a ground; the alpha was only ever taking the colour out of the figure. |
 *
 * **The consequence for the library, stated because the tile row is where it
 * lands.** `brand.ts` exempts "chip-scale icon-accent tiles" from the rule that
 * a brand colour exists only at its authored values. That exemption is this
 * icon-tile job, at seven sites, and the owner has not ruled it out ("a tinted
 * brand colour that accents a glyph might still be allowed, because it is
 * accenting an icon and not text"). If the tile row is accepted the exemption
 * leaves the library and the no-alpha rule has no exception left but artwork;
 * if it is rejected the exemption stays and is the one place act carries an
 * alpha step. The monogram and glyph panels drawn together are the whole of
 * that argument, which is why they are one of the three cases at full size.
 *
 * **What lands if the owner accepts.** The act sweep, applied per job to the 48
 * sites drawn here (the other ten are gradients and belong to the gradients
 * question):
 *
 * - 14 selected form options take whichever of the three shapes is picked.
 * - 3 highlighted rows: the admin week takes the leading edge; the two chat
 *   sites keep their ring and drop the wash.
 * - 1 callout takes glyph and label in act on the lifted ground its own info
 *   sibling already sits on.
 * - 7 icon tiles go to `lifted`, and `brand.ts` loses its last exemption.
 * - 6 drop targets take `ring-2 ring-act`.
 * - 6 act-ink selections and 2 status chips lose their wash, the chips taking
 *   the waitlist chip's shape.
 * - 4 rings go to full value.
 * - 1 hover tint becomes `hover:bg-lifted`.
 * - `text-act-foreground/70` on the WhatsApp bubble becomes a muted line under
 *   the bubble; the preview scene's role label goes to full value.
 * - The two `hover:bg-act/90` and `hover:bg-world/80` sites in `ui/button.tsx`
 *   stay, with a transitional comment saying the shade is Button's to decide
 *   and is the one act alpha step the sweep deliberately left standing.
 *
 * **Regenerate the surface rather than trusting the counts:**
 *
 *     grep -rnoE "\b(bg|from|to|via|text|border|ring|shadow|divide|outline)-(act|world)(-foreground)?/[0-9]+" src --include=*.tsx --include=*.ts
 *
 * `ACT_ALPHA_JOBS` in `inventory.ts` carries the classification and the
 * locators; the summary table lists them.
 *
 * **Every class string below is the app's**, with one mechanical edit: the
 * border *colour* moves out of the base string and into each column, because
 * two `border-*` utilities in one class list resolve by stylesheet order rather
 * than by the order they are written, so a `border-border border-act` column
 * would be a coin flip rather than a drawing. The leading-edge rows are the
 * exception and keep both, because `border-border` and `border-l-act` set
 * different properties — which is exactly the pairing the WhatsApp list ships.
 *
 * **Three things are drawn live** — the two hover jobs and the profile tile's
 * hover ring — because a hover held still is a picture of a state nobody meets.
 * Everything else is a state the page can hold still.
 */

import Image from "next/image";
import {
  Check,
  Gamepad2,
  Hourglass,
  ImagePlus,
  Images,
  Info,
  Plus,
  User,
} from "lucide-react";

import { BRAND } from "../../../src/tokens/brand";
import { tailwindAlpha } from "./colour";
import {
  Caps,
  Case,
  Compare,
  Exemplar,
  Glyph,
  INK,
  MUTED_INK,
  Panel,
  Question,
} from "./parts";

/**
 * One column of a job: what the app does today, or one shape of the proposal.
 *
 * `fill` is the whole of what changes between columns, so a column can carry a
 * ground, an edge, a ring and an ink together — which is what most of them are:
 * a fill and its foreground are one decision, not two.
 *
 * `ink` is the same decision for a glyph, which cannot take a class here: the
 * page's glyphs are drawn as SVG with an explicit stroke, so a column that
 * moves a tile to a different ground has to move the mark inside it in the same
 * step. `currentColor` is what a column uses when the exemplar's own text
 * colour should carry the glyph — which is how the hover jobs get a glyph that
 * recolours under the pointer.
 *
 * `check` is set on the one proposal shape that adds a mark rather than moving
 * a colour, and only an exemplar with no control of its own draws it: a
 * checkbox row and a radio pill are already showing which one is picked.
 */
interface Variant {
  readonly label: string;
  readonly fill: string;
  readonly ink: string;
  readonly check?: boolean;
}

/** Sogverse's `destructive`, which is the status question's and is not a library token. */
const DESTRUCTIVE = "#EF4343";

const ACT = BRAND.act.hex;
const ACT_INK = BRAND.act.foreground;
const WORLD_INK = BRAND.world.foreground;

/** The filled button's own base classes, shared by two jobs. */
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors";

/** One exemplar drawn once per column, in a row so the columns compare themselves. */
function Row({
  columns,
  variants,
  file,
  page,
  render,
}: {
  columns: 2 | 3 | 4;
  variants: readonly Variant[];
  file: string;
  page: string;
  render: (variant: Variant) => React.ReactNode;
}) {
  return (
    <Compare columns={columns}>
      {variants.map((variant) => (
        <Panel key={variant.label} label={variant.label}>
          <Exemplar file={file} page={page}>
            {render(variant)}
          </Exemplar>
        </Panel>
      ))}
    </Compare>
  );
}

// ------------------------------------------------------------------ the strip

/**
 * The strip's furniture: the eight jobs the principle answers on its own, drawn
 * today beside the one proposal, small.
 *
 * **Smaller is the point, and it is done with the column rather than the
 * drawings.** The exemplars are the app's own class strings and cannot be
 * shrunk without becoming a picture of something else, so the strip is a narrow
 * column on a wide page: two panels of roughly a third of the page's width, at
 * tighter padding and a tighter gap than a `Compare` row, under a job name that
 * sits below the case's own heading. What the owner sees is a page whose weight
 * is at the top, which is where the three decisions are.
 *
 * `StripPair` is a local grid rather than `Compare columns={2}` for that reason
 * alone: `Compare` is the full-size row and holds its gap and its breakpoint,
 * and a strip that used it would be the same weight as the three cases above.
 */
function StripJob({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-h4">{name}</h4>
      <div className="mt-3 space-y-5">{children}</div>
    </div>
  );
}

/** One labelled panel of a strip pair. `Panel`'s shape at the strip's scale. */
function StripPanel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <Caps>{label}</Caps>
      <div className="mt-2 flex-1 rounded-lg border border-border p-3">
        {children}
      </div>
    </div>
  );
}

/** One exemplar of a strip job: today beside the proposal, and nothing else. */
function StripPair({
  file,
  page,
  todayLabel,
  proposedLabel,
  today,
  proposed,
}: {
  file: string;
  page: string;
  todayLabel: string;
  proposedLabel: string;
  today: React.ReactNode;
  proposed: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StripPanel label={todayLabel}>
        <Exemplar file={file} page={page}>
          {today}
        </Exemplar>
      </StripPanel>
      <StripPanel label={proposedLabel}>
        <Exemplar file={file} page={page}>
          {proposed}
        </Exemplar>
      </StripPanel>
    </div>
  );
}

// ----------------------------------------- job 1: a selected option in a form

/**
 * Fourteen sites, every one of them `bg-act/5` — the faintest step in the app,
 * which over the card composites to a grey a shade warmer than the lifted grey.
 *
 * Three proposal shapes, because the geometry decides which of them reads. An
 * **edge** costs nothing on a row that already has a border, and it is the
 * shape the library's colour rule already names for a brand colour marking
 * something without becoming a ground. A **ring** doubles the row's own line
 * without changing its box, so a selection cannot nudge its own text by a pixel
 * — which is why the signup panel reached for one already. **The check alone**
 * is the answer wherever the site has a control that is already saying which
 * one is picked, and two of the three exemplars show that column costing
 * nothing at all: the consent row's box is `bg-act` with a tick in it today,
 * and the pill's radio is a radio.
 *
 * So the catalogue's tile is what decides that column, and it leads the case:
 * it has no control of any kind — selection is carried by the fill and by
 * nothing else — so it is the one site in the job where an added act check is a
 * new mark rather than a mark that was already on screen. The consent row sits
 * under it at the same four columns to show the other half of that: where a
 * checkbox is on screen already, the check column changes nothing at all.
 *
 * **The pill radio group draws the edge alone, in the strip.** Its ring and its
 * check are this same three-way choice on a weaker exemplar, and a choice put
 * twice is a choice asked twice.
 */
const OPTION_TODAY: Variant = {
  label: "today · bg-act/5",
  fill: "border-border bg-act/5",
  ink: ACT,
};

const OPTION_EDGE: Variant = {
  label: "proposed · border-act",
  fill: "border-act",
  ink: ACT,
};

const OPTION_RING: Variant = {
  label: "proposed · ring-2 ring-act",
  fill: "border-border ring-2 ring-act",
  ink: ACT,
};

const OPTION_CHECK: Variant = {
  label: "proposed · an act check",
  fill: "border-border",
  ink: ACT,
  check: true,
};

const FORM_OPTION: readonly Variant[] = [
  OPTION_TODAY,
  OPTION_EDGE,
  OPTION_RING,
  OPTION_CHECK,
];

/** `ui/checkbox-row.tsx` — the shared consent row, with one of three ticked. */
function ConsentRows({ variant }: { variant: Variant }) {
  const rest =
    "flex items-start gap-3 rounded-md border border-border p-3 text-sm transition-colors hover:bg-lifted";
  return (
    <div className="space-y-2">
      <span
        className={`flex items-start gap-3 rounded-md border p-3 text-sm transition-colors ${variant.fill}`}
      >
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border bg-act">
          <Glyph icon={Check} size={12} colour={ACT_INK} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block">Open to adults</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            A parent may hold a seat on this product themselves.
          </span>
        </span>
      </span>
      <span className={rest}>
        <span className="mt-0.5 flex h-4 w-4 shrink-0 rounded-sm border border-border" />
        <span className="min-w-0 flex-1">Open to children under 13</span>
      </span>
      <span className={rest}>
        <span className="mt-0.5 flex h-4 w-4 shrink-0 rounded-sm border border-border" />
        <span className="min-w-0 flex-1">Open to teenagers</span>
      </span>
    </div>
  );
}

/** `admin/products/sections/spoken-language-radios.tsx` — the pill radio group. */
function LanguagePills({ variant }: { variant: Variant }) {
  const rest =
    "inline-flex cursor-pointer items-center gap-2 rounded-full border border-border py-1.5 pl-2.5 pr-3.5 text-sm transition-colors";
  return (
    <div className="flex flex-wrap gap-2">
      <span
        className={`inline-flex cursor-pointer items-center gap-2 rounded-full border py-1.5 pl-2.5 pr-3.5 text-sm transition-colors ${variant.fill}`}
      >
        <input
          type="radio"
          className="h-3.5 w-3.5"
          checked
          readOnly
          aria-hidden
          tabIndex={-1}
        />
        <span className="font-medium">Finnish</span>
      </span>
      <span className={rest}>
        <input
          type="radio"
          className="h-3.5 w-3.5"
          checked={false}
          readOnly
          aria-hidden
          tabIndex={-1}
        />
        <span className="font-medium">Swedish</span>
      </span>
      <span className={rest}>
        <input
          type="radio"
          className="h-3.5 w-3.5"
          checked={false}
          readOnly
          aria-hidden
          tabIndex={-1}
        />
        <span className="font-medium">English</span>
      </span>
    </div>
  );
}

/**
 * `admin/products/image-catalogue-view.tsx` — the catalogue grid, one tile
 * chosen.
 *
 * The banner is the demo's own photograph rather than a grey block, because
 * this is the job's only exemplar that has a picture in it and an amber line
 * reads one way against flat grey and another against a photograph's own
 * colours.
 */
function CatalogueTiles({ variant }: { variant: Variant }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      <li>
        <span
          className={`block w-full rounded-md border p-2 text-left transition-colors ${variant.fill}`}
        >
          <span className="relative block aspect-video overflow-hidden rounded">
            <Image
              src="/photograph.jpg"
              alt=""
              fill
              sizes="200px"
              className="object-cover"
            />
          </span>
          <span className="mt-2 flex items-center gap-1 text-xs font-medium">
            {variant.check === true ? (
              <Glyph icon={Check} size={12} colour={ACT} />
            ) : null}
            <span className="truncate">Camp banner</span>
          </span>
        </span>
      </li>
      <li>
        <span className="block w-full rounded-md border border-border p-2 text-left transition-colors">
          <span className="relative block aspect-video overflow-hidden rounded">
            <Image
              src="/photograph.jpg"
              alt=""
              fill
              sizes="200px"
              className="object-cover"
            />
          </span>
          <span className="mt-2 flex items-center gap-1 text-xs font-medium">
            <span className="truncate">Club banner</span>
          </span>
        </span>
      </li>
    </ul>
  );
}

// ---------------------------------------------------- job 2: a highlighted row

/**
 * Two rows marked out from the rows around them: today's date in an admin week,
 * and the message a reply-jump just landed on.
 *
 * **The week takes the leading edge, drawn on every row from the start.** That
 * is the construct the greys landing already put into the WhatsApp conversation
 * list, and the reason the edge is on every row rather than added to one is the
 * layout rule: an edge that arrives with the mark lands two pixels of layout
 * under whatever the reader was pointing at.
 *
 * **The weekday's own colour is the decision this case exists for**, and it is
 * why the row is drawn three times rather than twice. The WhatsApp construct
 * pairs the act edge with `text-foreground`, so following it takes the amber
 * off "Tue"; the coloured-text ruling would let it stay, because a weekday is a
 * name and not a sentence, and it sits beside the edge that carries the meaning
 * without it. The edge is the same in both proposed columns; the only thing
 * that moves is the word.
 *
 * **The chat flash keeps its ring and loses only the wash.** It already carries
 * `ring-1 ring-act` at full value, so it is a figure already; and a grey leading
 * edge down every line of a chat log would be a permanent mark paying for a
 * state that lasts a second. It is the job's second exemplar and it asks
 * nothing, so it is drawn in the strip.
 */
function WeekRows({ draw }: { draw: "today" | "edge" | "edge-act" }) {
  const shell = "flex flex-col gap-2 rounded-lg p-2 sm:flex-row sm:gap-3";
  const rest =
    draw === "today"
      ? `${shell} border border-border bg-card`
      : `${shell} border border-l-2 border-border bg-card`;
  const marked =
    draw === "today"
      ? `${shell} border border-border bg-act/5`
      : `${shell} border border-l-2 border-border border-l-act bg-card`;
  const markedLabel =
    draw === "edge"
      ? "text-sm font-semibold text-foreground"
      : "text-sm font-semibold text-act";
  return (
    <ul className="space-y-1.5">
      <li className={rest}>
        <div className="flex shrink-0 items-baseline gap-2 px-1 sm:w-24 sm:flex-col sm:items-start sm:gap-0">
          <span className="text-sm font-semibold text-foreground">Mon</span>
          <span className="text-xs tabular-nums text-muted-foreground">8.9.</span>
        </div>
        <p className="px-1 text-xs text-muted-foreground">Nothing on</p>
      </li>
      <li className={marked}>
        <div className="flex shrink-0 items-baseline gap-2 px-1 sm:w-24 sm:flex-col sm:items-start sm:gap-0">
          <span className={markedLabel}>Tue</span>
          <span className="text-xs tabular-nums text-muted-foreground">9.9.</span>
        </div>
        <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          <li className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground">
            17:00 Espoo club
          </li>
        </ul>
      </li>
      <li className={rest}>
        <div className="flex shrink-0 items-baseline gap-2 px-1 sm:w-24 sm:flex-col sm:items-start sm:gap-0">
          <span className="text-sm font-semibold text-foreground">Wed</span>
          <span className="text-xs tabular-nums text-muted-foreground">10.9.</span>
        </div>
        <p className="px-1 text-xs text-muted-foreground">Nothing on</p>
      </li>
    </ul>
  );
}

/**
 * `chat/ChatMessageRow.tsx` and `chat/ChatMessageList.tsx` — one recipe in two
 * files, drawn as a log with the jumped-to message flashing.
 */
function ChatFlash({ draw }: { draw: "today" | "proposed" }) {
  const line = "rounded px-1.5 py-0.5 text-sm leading-snug transition-colors";
  const flash =
    draw === "today" ? "bg-act/20 ring-1 ring-act" : "ring-1 ring-act";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className={line}>
        <span className="font-medium">Aino</span>{" "}
        <span className="text-muted-foreground">
          the tower district is finished
        </span>
      </div>
      <div className={`mt-1 ${line} ${flash}`}>
        <span className="font-medium">Mikko</span>{" "}
        <span className="text-muted-foreground">
          can we build the harbour next week?
        </span>
      </div>
      <div className={`mt-1 ${line}`}>
        <span className="font-medium">Aino</span>{" "}
        <span className="text-muted-foreground">yes — bring the plans</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------- job 3: a callout ground

/**
 * `admin/products/form-primitives.tsx` — the hint box a product form puts under
 * a field, in its `warn` variant, drawn beside its own `info` sibling because
 * the sibling is what settles the answer: the two variants exist to be told
 * apart, and `bg-lifted` versus `bg-act/5` is what tells them apart today.
 *
 * Both rows carry `Info`, because the component does: one mark serves both
 * variants, so the ground really is the only thing separating them.
 *
 * The proposal is candidate B, already ruled for the 121 status sites: the same
 * neutral panel the info sibling sits on, with the colour arriving as the glyph
 * and a short title, and the sentence in muted ink. It costs the component a
 * title prop it does not have today, which is why it is drawn rather than
 * described.
 *
 * **Two further columns were dropped when the section was reorganised.** The
 * glyph alone was all the component can do without that prop; the same plus a
 * leading rule was the lit-card construct borrowed to see whether a hint wants
 * one. Neither is ruled out — they are the shapes to raise if the title is
 * refused.
 */
function FormHints({ draw }: { draw: "today" | "label" }) {
  const warn =
    draw === "today"
      ? "flex items-start gap-2 rounded-md border border-dashed border-border bg-act/5 px-3 py-2 text-xs text-foreground"
      : "flex items-start gap-2 rounded-md border border-dashed border-border bg-lifted px-3 py-2 text-xs";
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-lifted px-3 py-2 text-xs text-muted-foreground">
        <span className="mt-0.5">
          <Glyph icon={Info} size={14} colour={MUTED_INK} />
        </span>
        <span>Registration opens when the product is published.</span>
      </div>
      <div className={warn}>
        <span className="mt-0.5">
          <Glyph icon={Info} size={14} colour={ACT} />
        </span>
        {draw === "today" ? (
          <span className="text-foreground">
            Changing the start date moves every session on the calendar.
          </span>
        ) : (
          <span>
            <span className="block font-medium text-act">Start date</span>
            <span className="mt-1 block text-muted-foreground">
              Changing it moves every session on the calendar.
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------- job 4: an icon tile behind a glyph

/**
 * A square of colour behind a glyph, at chip scale, on a marketing card or
 * beside a name.
 *
 * This is the job the library's own rule exempts, and the job with the weakest
 * case for a fill: the glyph is already `text-act`, so the tile is a second
 * statement of the same accent behind the first. The proposal leaves the glyph
 * exactly where it is and moves the tile to the grey every other lifted thing
 * sits on.
 *
 * **Two of the seven sites are not glyph tiles at all**, and the monogram is one
 * of them: the WhatsApp contact list's tile holds a person's initials, so what
 * the proposal leaves on the lifted grey is two amber letters standing in for a
 * face. Whether that is a mark or coloured text is the one thing this job asks
 * that the principle does not answer by itself, so the monogram leads the case
 * and takes a third column with the initials in `foreground` — the answer if
 * they are read as text rather than as a face.
 *
 * The glyph tile is drawn beside it, at two columns, because the two cases have
 * to be compared and not remembered: the glyph keeps its amber in every column
 * (it is a mark by anyone's reading), so what the pair shows is exactly how much
 * of the monogram's difficulty is the tint and how much is the letters.
 */
const ICON_TILE_TODAY: Variant = {
  label: "today · bg-act/10",
  fill: "bg-act/10 text-act",
  ink: ACT,
};

const ICON_TILE_LIFTED: Variant = {
  label: "proposed · bg-lifted",
  fill: "bg-lifted text-act",
  ink: ACT,
};

const MONOGRAM_TODAY: Variant = {
  label: "today · bg-act/20",
  fill: "bg-act/20 text-act",
  ink: ACT,
};

const MONOGRAM_LIFTED_ACT: Variant = {
  label: "proposed · bg-lifted, act initials",
  fill: "bg-lifted text-act",
  ink: ACT,
};

const MONOGRAM_LIFTED_INK: Variant = {
  label: "proposed · bg-lifted, foreground initials",
  fill: "bg-lifted text-foreground",
  ink: INK,
};

/** `app/(public)/page.tsx` — a home feature card. */
function FeatureCard({ variant }: { variant: Variant }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 text-foreground shadow-sm">
      <div className="flex flex-col space-y-1.5 p-6">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-lg ${variant.fill}`}
          >
            <Glyph icon={Gamepad2} size={24} colour={variant.ink} />
          </div>
          <h4 className="text-xl font-semibold leading-none tracking-tight">
            Clubs in many games
          </h4>
        </div>
      </div>
    </div>
  );
}

/** `app/(dashboard)/admin/whatsapp/page.tsx` — the contact list's monogram. */
function ContactRows({ variant }: { variant: Variant }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-lifted hover:text-foreground">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium ${variant.fill}`}
        >
          MK
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">Mikko Korhonen</p>
          <p className="truncate text-xs text-muted-foreground">+358 40 123 4567</p>
        </div>
      </div>
      <div className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium ${variant.fill}`}
        >
          AV
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">Aino Virtanen</p>
          <p className="truncate text-xs text-muted-foreground">+358 50 765 4321</p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------- job 5: a drop target

/**
 * "It will land here" — a strip or a column lit while something is dragged over
 * it, and the most transient statement in the set: it exists for as long as a
 * pointer is held down and never survives the gesture.
 *
 * Two of the six sites already carry a full-value `ring-act` on top of their
 * tint, so part of the proposal is already in the app and what it drops is the
 * wash underneath.
 *
 * **A dashed act edge was drawn beside the ring and dropped** when the section
 * was reorganised: it was an outline rather than a border, because neither
 * target has a border at rest and one appearing under a drag would resize the
 * target mid-gesture. The ring is the proposal, it takes no layout either, and
 * two of the six sites carry one already — so the dashed edge is a shape to
 * raise if the ring is refused, not a column to rule on.
 *
 * **This job has no grey column, and that is the greys ruling showing.** Both
 * targets already rest on a neutral, and a ground lifts once, so there is no
 * further step for a drop target to climb to.
 */
const DROP_TARGET_TODAY: Variant = {
  label: "today · bg-act/10 ring-2 ring-act",
  fill: "bg-act/10 ring-2 ring-act",
  ink: MUTED_INK,
};

const DROP_TARGET_RING: Variant = {
  label: "proposed · ring-2 ring-act",
  fill: "bg-lifted ring-2 ring-act",
  ink: MUTED_INK,
};

const DROP_COLUMN_TODAY: Variant = {
  label: "today · bg-act/5",
  fill: "bg-act/5",
  ink: MUTED_INK,
};

const DROP_COLUMN_RING: Variant = {
  label: "proposed · ring-2 ring-act",
  fill: "ring-2 ring-act",
  ink: MUTED_INK,
};

/**
 * `gedu/session-feed/SessionPhotoStrip.tsx` — the strip mid-drag.
 *
 * `ImagePlus` is the strip's own add control. `Images` is a stand-in: the tile
 * beside it holds a photograph in the app, and the strip's section mark is the
 * nearest thing it has to a picture of one.
 */
function PhotoStripTarget({ variant }: { variant: Variant }) {
  return (
    <div className={`rounded-md p-3 transition-colors sm:p-3.5 ${variant.fill}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-16 w-20 items-center justify-center rounded border border-border bg-background">
          <Glyph icon={Images} size={20} colour={variant.ink} />
        </span>
        <span className="flex h-16 w-20 items-center justify-center rounded border border-dashed border-border">
          <Glyph icon={ImagePlus} size={20} colour={variant.ink} />
        </span>
      </div>
    </div>
  );
}

/** `admin/products/groups/group-column.tsx` — a group column with a gamer over it. */
function GroupColumn({ variant }: { variant: Variant }) {
  return (
    <div
      className={`rounded-lg border border-border text-foreground shadow-sm transition-colors ${variant.fill}`}
    >
      <div className="space-y-3 p-6 pb-3">
        <p className="text-sm font-semibold">Tuesday group</p>
        <p className="text-xs text-muted-foreground">Six gamers</p>
      </div>
      <div className="space-y-1.5 p-6 pt-0">
        <span className="block rounded border border-border bg-background px-2 py-1 text-xs">
          Aino V.
        </span>
        <span className="block rounded border border-border bg-background px-2 py-1 text-xs">
          Mikko K.
        </span>
      </div>
    </div>
  );
}

// -------------------------------- job 6: a selected item, with act as its ink

/**
 * `admin/products/gedu-picker-sheet.tsx` — the spoken-language filter strip,
 * whose chosen chip is `bg-act/10 text-act`.
 *
 * Drawn once, and drawn at all, because it is the job where the principle takes
 * nothing away: act is already the figure here, as the word. What the proposal
 * removes is the wash behind it, which over the card composites to a dull brown
 * carrying a light amber label — the pairing the library never measured because
 * it never named the ground.
 *
 * The other five sites are the same statement in a different box: a locale
 * tab's underline, a location row, a chat reaction, a gedu row in this same
 * sheet, a gamer row in the signup panel.
 */
const SELECTED_INK_TODAY: Variant = {
  label: "today · bg-act/10 text-act",
  fill: "border-border bg-act/10 text-act",
  ink: ACT,
};

const SELECTED_INK_PROPOSED: Variant = {
  label: "proposed · text-act",
  fill: "border-border text-act",
  ink: ACT,
};

function FilterChips({ variant }: { variant: Variant }) {
  const rest =
    "rounded-full border border-border px-2 py-0.5 transition-colors text-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Speaks:</span>
        <span
          className={`rounded-full border px-2 py-0.5 transition-colors ${variant.fill}`}
        >
          Any
        </span>
        <span className={rest}>Finnish</span>
        <span className={rest}>Swedish</span>
        <span className={rest}>English</span>
      </div>
    </div>
  );
}

// -------------------------------------------------------- job 7: a status chip

/**
 * `admin/products/product-status-chip.tsx` — the five product statuses, of which
 * `pending` is `bg-act/20 text-act`.
 *
 * The proposal is the chip the observation came from, at its `primary` tone:
 * `public/products/status-chip.tsx` — a neutral edge, the page ground, a glyph
 * and the word in act. Nothing here is invented; the column is that component's
 * own class string with this chip's word in it.
 *
 * The glyph comes with the shape rather than being an addition to it: the
 * coloured-text ruling has a coloured word never carrying the meaning alone,
 * and the waitlist chip's hourglass is exactly that mark. The four chips beside
 * it are drawn unchanged because they are not act alpha sites, which puts the
 * proposed chip next to `running`'s full amber fill — and that neighbouring is
 * the picture.
 *
 * The job's second site is `public/schools/schools-browse.tsx`, the "clubs here"
 * pill on a school row: the same statement in a smaller box, taking whatever
 * this one takes.
 */
function StatusChips({ draw }: { draw: "today" | "proposed" }) {
  const chip = "shrink-0 rounded-full px-2 py-0.5 text-xs";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {draw === "today" ? (
          <span className={`${chip} bg-act/20 text-act`}>Pending</span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-act">
            <Glyph icon={Hourglass} size={12} colour={ACT} />
            Pending
          </span>
        )}
        <span className={`${chip} bg-act text-act-foreground`}>Running</span>
        <span className={`${chip} bg-lifted text-muted-foreground`}>Completed</span>
        <span
          className={chip}
          style={{
            backgroundColor: tailwindAlpha(DESTRUCTIVE, 20),
            color: DESTRUCTIVE,
          }}
        >
          Cancelled
        </span>
        <span className={`${chip} bg-lifted text-muted-foreground`}>Expired</span>
      </div>
    </div>
  );
}

// ----------------------------------- job 8: faded ink on an amber fill

/**
 * `text-act-foreground/70` — the timestamp on an outbound WhatsApp bubble, and
 * a role label on a filled button in a preview scene.
 *
 * The token is the ground's own near-black, so this is not amber at an alpha
 * step; it is the *ink* on amber stepped down, which composites to a warm grey
 * on the fill. The palette offers exactly one ink for an amber fill, so there
 * is no quieter member of the pair to move to, and the proposal is therefore
 * not a colour at all: the meta line leaves the fill and becomes muted ink
 * under the bubble, where a quieter grey exists.
 *
 * The viewer chip cannot do that — its role label is inside the button and has
 * nowhere below to go — so its proposal is the only other thing available, the
 * ink at full value.
 */
function WhatsAppBubble({ draw }: { draw: "today" | "proposed" }) {
  const bubble = "max-w-[70%] rounded-lg bg-act px-3 py-2 text-sm text-act-foreground";
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex justify-start">
        <div className="max-w-[70%] rounded-lg bg-lifted px-3 py-2 text-sm text-foreground">
          <p className="whitespace-pre-wrap break-words">
            Is Tuesday&rsquo;s club still on?
          </p>
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
            <span>17:02</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end">
        <div className={bubble}>
          <p className="whitespace-pre-wrap break-words">
            Yes — 17:00 at the Espoo site.
          </p>
          {draw === "today" ? (
            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-act-foreground/70">
              <span>17:04</span>
              <Glyph icon={Check} size={10} colour={ACT_INK} />
            </div>
          ) : null}
        </div>
        {draw === "proposed" ? (
          <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>17:04</span>
            <Glyph icon={Check} size={10} colour={MUTED_INK} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** `preview/scenes/chat-scene.tsx` — the viewer switcher's role label. */
function ViewerChip({ draw }: { draw: "today" | "proposed" }) {
  return (
    <div className="flex justify-center py-2">
      <button
        type="button"
        className={`${BUTTON_BASE} h-9 bg-act px-3 text-xs text-act-foreground shadow`}
      >
        Mikko
        <span
          className={
            draw === "today"
              ? "ml-1 text-[10px] uppercase tracking-wide text-act-foreground/70"
              : "ml-1 text-[10px] uppercase tracking-wide text-act-foreground"
          }
        >
          Gedu
        </span>
      </button>
    </div>
  );
}

// --------------------------------- job 9: a hover shade on a filled control

/**
 * The one job where the alpha step is not a tint over a ground but a *shade of
 * the fill itself*: `hover:bg-act/90` on the amber button, `hover:bg-world/80`
 * on the violet one.
 *
 * **This is the one job the principle does not answer**, because a filled
 * button is the one place a brand colour is deliberately a ground: the
 * figure-and-fill rule already allows a button its fill, and what a filled
 * button does under a pointer is the Button adoption's decision, made with the
 * fills drawn.
 *
 * So this row is a note rather than a proposal, and it is drawn live for one
 * reason: to show what simply deleting the shade costs. Point at both. If the
 * unshaded button is dead under the pointer, then leaving these two sites alone
 * is the right call and Button inherits the question.
 *
 * The same shape at two more sites is `hover:bg-destructive/90`
 * (`ui/button.tsx`, `parent/PaymentProblemBadge.tsx`). Those are status, they
 * ride the status question, and they are listed rather than drawn here.
 */
const ACT_HOVER_TODAY: Variant = {
  label: "today · hover:bg-act/90",
  fill: "bg-act text-act-foreground shadow hover:bg-act/90",
  ink: ACT_INK,
};

const ACT_HOVER_NONE: Variant = {
  label: "no hover shade",
  fill: "bg-act text-act-foreground shadow",
  ink: ACT_INK,
};

const WORLD_HOVER_TODAY: Variant = {
  label: "today · hover:bg-world/80",
  fill: "bg-world text-world-foreground shadow-sm hover:bg-world/80",
  ink: WORLD_INK,
};

const WORLD_HOVER_NONE: Variant = {
  label: "no hover shade",
  fill: "bg-world text-world-foreground shadow-sm",
  ink: WORLD_INK,
};

/** `ui/button.tsx` — the filled button, hovered on the page. */
function FilledButton({
  variant,
  label,
}: {
  variant: Variant;
  label: string;
}) {
  return (
    <div className="flex justify-center py-2">
      <button
        type="button"
        className={`${BUTTON_BASE} h-10 px-4 py-2 text-sm ${variant.fill}`}
      >
        {label}
      </button>
    </div>
  );
}

// ----------------------------- job 10: a hover tint on an empty tile

/**
 * The add-gamer tile's `group-hover:bg-act/5`, and the only site of its shape.
 *
 * A hover is a lift and the lift has a grey, so the proposal is the same
 * `hover:bg-lifted` the other 66 hover grounds took in the greys landing. The
 * act does not leave the tile: the plus glyph already goes amber under the
 * pointer and stays that way, which is the figure doing the work the wash was
 * doing.
 *
 * Drawn with the real `group-hover:` classes and ruled on by pointing at them.
 */
const HOVER_TILE_TODAY: Variant = {
  label: "today · group-hover:bg-act/5",
  fill: "group-hover:bg-act/5 text-muted-foreground group-hover:text-act",
  ink: "currentColor",
};

const HOVER_TILE_LIFTED: Variant = {
  label: "proposed · group-hover:bg-lifted",
  fill: "group-hover:bg-lifted text-muted-foreground group-hover:text-act",
  ink: "currentColor",
};

/** `family/ProfileTiles.tsx` — the add-gamer tile. */
function AddGamerTile({ variant }: { variant: Variant }) {
  return (
    <div className="flex justify-center">
      <span className="group flex w-28 flex-col items-center gap-2 transition-transform duration-150 hover:scale-105">
        <span
          className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border transition-colors duration-150 ${variant.fill}`}
        >
          <Glyph icon={Plus} size={32} colour={variant.ink} />
        </span>
        <span className="text-sm text-muted-foreground">Add a gamer</span>
      </span>
    </div>
  );
}

// ------------------------------------------------------------ job 11: a ring

/**
 * Four rings drawn at an alpha step around something a reader is meant to
 * notice: their own avatar in a call, their own avatar in the instant lobby,
 * their own tile in the family switcher, the row they have selected in a signup
 * panel.
 *
 * A ring is already an edge rather than a ground, so the principle has almost
 * nothing to decide here: the alpha was only ever taking the colour out of the
 * figure. The proposal is act at full value, and the two columns are otherwise
 * the same pixels.
 *
 * **The profile tile's ring is a hover ring, and is drawn live.** The active
 * tile already carries `ring-4 ring-act` at full value; it is the *other* tiles
 * that carry `ring-0 ring-act/50 group-hover:ring-4`. So the pair is drawn
 * together and pointed at — a hovered inactive tile is the only place the `/50`
 * is ever on screen, and what it is compared against is the active tile beside
 * it.
 */
const AVATAR_RING_TODAY: Variant = {
  label: "today · ring-1 ring-act/30",
  fill: "ring-1 ring-act/30",
  ink: MUTED_INK,
};

const AVATAR_RING_FULL: Variant = {
  label: "proposed · ring-1 ring-act",
  fill: "ring-1 ring-act",
  ink: MUTED_INK,
};

const TILE_RING_TODAY: Variant = {
  label: "today · ring-act/50 on hover",
  fill: "ring-0 ring-act/50 group-hover:ring-4",
  ink: MUTED_INK,
};

const TILE_RING_FULL: Variant = {
  label: "proposed · ring-act on hover",
  fill: "ring-0 ring-act group-hover:ring-4",
  ink: MUTED_INK,
};

/**
 * `voice/VoiceAvatar.tsx` — the local speaker's tile in the grid, beside two
 * remote ones.
 *
 * The tile holds an identicon (or live video), which is artwork with its own
 * palette rather than an icon; `User` stands in it, so what is on screen beside
 * the ring is a person-shaped mark and not a second set of colours.
 */
function AvatarRing({ variant }: { variant: Variant }) {
  const tile =
    "flex h-11 w-11 items-center justify-center overflow-hidden rounded-md border-2 border-border bg-lifted";
  return (
    <div className="flex items-center gap-3">
      <span className={`relative transition-shadow ${tile} ${variant.fill}`}>
        <Glyph icon={User} size={20} colour={variant.ink} />
      </span>
      <span className={tile}>
        <Glyph icon={User} size={20} colour={variant.ink} />
      </span>
      <span className={tile}>
        <Glyph icon={User} size={20} colour={variant.ink} />
      </span>
    </div>
  );
}

/**
 * `family/ProfileTiles.tsx` — the switcher, with the active tile beside a
 * hoverable one. `User` stands in for each tile's identicon.
 */
function TileRing({ variant }: { variant: Variant }) {
  const face =
    "relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border-2 border-border ring-offset-2 ring-offset-background transition-[box-shadow] duration-150";
  return (
    <div className="flex justify-center gap-4 py-2">
      <span className="group flex w-20 cursor-pointer flex-col items-center gap-2 transition-transform duration-150 hover:scale-105">
        <span className={`${face} ring-4 ring-act`}>
          <Glyph icon={User} size={24} colour={variant.ink} />
        </span>
        <span className="text-xs font-medium text-foreground">Aino</span>
      </span>
      <span className="group flex w-20 cursor-pointer flex-col items-center gap-2 transition-transform duration-150 hover:scale-105">
        <span className={`${face} ${variant.fill}`}>
          <Glyph icon={User} size={24} colour={variant.ink} />
        </span>
        <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">
          Mikko
        </span>
      </span>
    </div>
  );
}

export function ActSection() {
  return (
    <Question n={1} title="Act as a figure">
      <Case title="A selected option: edge, ring or check">
        <div className="space-y-10">
          <Row
            columns={4}
            variants={FORM_OPTION}
            file="admin/products/image-catalogue-view.tsx"
            page="/admin/product-images, the catalogue grid"
            render={(variant) => <CatalogueTiles variant={variant} />}
          />
          <Row
            columns={4}
            variants={FORM_OPTION}
            file="ui/checkbox-row.tsx"
            page="/admin/products/[id], the audience section"
            render={(variant) => <ConsentRows variant={variant} />}
          />
        </div>
      </Case>

      <Case title="A highlighted row: the weekday">
        <Compare columns={3}>
          <Panel label="today · bg-act/5, act weekday">
            <Exemplar
              file="admin/dashboard/week-rows.tsx"
              page="/admin, this week"
            >
              <WeekRows draw="today" />
            </Exemplar>
          </Panel>
          <Panel label="proposed · act edge, foreground weekday">
            <Exemplar
              file="admin/dashboard/week-rows.tsx"
              page="/admin, this week"
            >
              <WeekRows draw="edge" />
            </Exemplar>
          </Panel>
          <Panel label="proposed · act edge, act weekday">
            <Exemplar
              file="admin/dashboard/week-rows.tsx"
              page="/admin, this week"
            >
              <WeekRows draw="edge-act" />
            </Exemplar>
          </Panel>
        </Compare>
      </Case>

      <Case title="A monogram tile">
        <Compare columns={5}>
          <Panel label={MONOGRAM_TODAY.label}>
            <Exemplar
              file="app/(dashboard)/admin/whatsapp/page.tsx"
              page="/admin/whatsapp, the contact list"
            >
              <ContactRows variant={MONOGRAM_TODAY} />
            </Exemplar>
          </Panel>
          <Panel label={MONOGRAM_LIFTED_ACT.label}>
            <Exemplar
              file="app/(dashboard)/admin/whatsapp/page.tsx"
              page="/admin/whatsapp, the contact list"
            >
              <ContactRows variant={MONOGRAM_LIFTED_ACT} />
            </Exemplar>
          </Panel>
          <Panel label={MONOGRAM_LIFTED_INK.label}>
            <Exemplar
              file="app/(dashboard)/admin/whatsapp/page.tsx"
              page="/admin/whatsapp, the contact list"
            >
              <ContactRows variant={MONOGRAM_LIFTED_INK} />
            </Exemplar>
          </Panel>
          <Panel label={ICON_TILE_TODAY.label}>
            <Exemplar
              file="app/(public)/page.tsx"
              page="the home page, the feature cards"
            >
              <FeatureCard variant={ICON_TILE_TODAY} />
            </Exemplar>
          </Panel>
          <Panel label={ICON_TILE_LIFTED.label}>
            <Exemplar
              file="app/(public)/page.tsx"
              page="the home page, the feature cards"
            >
              <FeatureCard variant={ICON_TILE_LIFTED} />
            </Exemplar>
          </Panel>
        </Compare>
      </Case>

      <Case title="The rest follows">
        <div className="max-w-2xl space-y-8">
          <StripJob name="A selected option in a form">
            <StripPair
              file="admin/products/sections/spoken-language-radios.tsx"
              page="/admin/products/[id], the identity section"
              todayLabel={OPTION_TODAY.label}
              proposedLabel={OPTION_EDGE.label}
              today={<LanguagePills variant={OPTION_TODAY} />}
              proposed={<LanguagePills variant={OPTION_EDGE} />}
            />
          </StripJob>

          <StripJob name="A highlighted row">
            <StripPair
              file="chat/ChatMessageRow.tsx"
              page="any chat, after a reply jump"
              todayLabel="today · bg-act/20 ring-1 ring-act"
              proposedLabel="proposed · ring-1 ring-act"
              today={<ChatFlash draw="today" />}
              proposed={<ChatFlash draw="proposed" />}
            />
          </StripJob>

          <StripJob name="A callout ground">
            <StripPair
              file="admin/products/form-primitives.tsx"
              page="/admin/products/[id], a field hint"
              todayLabel="today · bg-act/5"
              proposedLabel="proposed · an act label on lifted"
              today={<FormHints draw="today" />}
              proposed={<FormHints draw="label" />}
            />
          </StripJob>

          <StripJob name="A drop target">
            <StripPair
              file="gedu/session-feed/SessionPhotoStrip.tsx"
              page="/gedu, writing a session report"
              todayLabel={DROP_TARGET_TODAY.label}
              proposedLabel={DROP_TARGET_RING.label}
              today={<PhotoStripTarget variant={DROP_TARGET_TODAY} />}
              proposed={<PhotoStripTarget variant={DROP_TARGET_RING} />}
            />
            <StripPair
              file="admin/products/groups/group-column.tsx"
              page="/admin/products/[id], the groups board"
              todayLabel={DROP_COLUMN_TODAY.label}
              proposedLabel={DROP_COLUMN_RING.label}
              today={<GroupColumn variant={DROP_COLUMN_TODAY} />}
              proposed={<GroupColumn variant={DROP_COLUMN_RING} />}
            />
          </StripJob>

          <StripJob name="A selected item, with act as its ink">
            <StripPair
              file="admin/products/gedu-picker-sheet.tsx"
              page="/admin/products/[id], assigning a gedu"
              todayLabel={SELECTED_INK_TODAY.label}
              proposedLabel={SELECTED_INK_PROPOSED.label}
              today={<FilterChips variant={SELECTED_INK_TODAY} />}
              proposed={<FilterChips variant={SELECTED_INK_PROPOSED} />}
            />
          </StripJob>

          <StripJob name="A status chip">
            <StripPair
              file="admin/products/product-status-chip.tsx"
              page="/admin/products, the list and the details page"
              todayLabel="today · bg-act/20 text-act"
              proposedLabel="proposed · the waitlist chip"
              today={<StatusChips draw="today" />}
              proposed={<StatusChips draw="proposed" />}
            />
          </StripJob>

          <StripJob name="Faded ink on an amber fill">
            <StripPair
              file="app/(dashboard)/admin/whatsapp/page.tsx"
              page="/admin/whatsapp, an outbound message"
              todayLabel="today · text-act-foreground/70"
              proposedLabel="proposed · off the fill"
              today={<WhatsAppBubble draw="today" />}
              proposed={<WhatsAppBubble draw="proposed" />}
            />
            <StripPair
              file="preview/scenes/chat-scene.tsx"
              page="/preview/chat, the viewer switcher"
              todayLabel="today · text-act-foreground/70"
              proposedLabel="proposed · text-act-foreground"
              today={<ViewerChip draw="today" />}
              proposed={<ViewerChip draw="proposed" />}
            />
          </StripJob>

          <StripJob name="A hover shade on a filled control">
            <StripPair
              file="ui/button.tsx"
              page="every page, the default button"
              todayLabel={ACT_HOVER_TODAY.label}
              proposedLabel={ACT_HOVER_NONE.label}
              today={
                <FilledButton variant={ACT_HOVER_TODAY} label="Buy a seat" />
              }
              proposed={
                <FilledButton variant={ACT_HOVER_NONE} label="Buy a seat" />
              }
            />
            <StripPair
              file="ui/button.tsx"
              page="every page, the secondary variant"
              todayLabel={WORLD_HOVER_TODAY.label}
              proposedLabel={WORLD_HOVER_NONE.label}
              today={
                <FilledButton
                  variant={WORLD_HOVER_TODAY}
                  label="Enter Sogverse"
                />
              }
              proposed={
                <FilledButton
                  variant={WORLD_HOVER_NONE}
                  label="Enter Sogverse"
                />
              }
            />
          </StripJob>

          <StripJob name="A hover tint on an empty tile">
            <StripPair
              file="family/ProfileTiles.tsx"
              page="/parent, the add-gamer tile"
              todayLabel={HOVER_TILE_TODAY.label}
              proposedLabel={HOVER_TILE_LIFTED.label}
              today={<AddGamerTile variant={HOVER_TILE_TODAY} />}
              proposed={<AddGamerTile variant={HOVER_TILE_LIFTED} />}
            />
          </StripJob>

          <StripJob name="A ring">
            <StripPair
              file="voice/VoiceAvatar.tsx"
              page="a club's voice room, your own tile"
              todayLabel={AVATAR_RING_TODAY.label}
              proposedLabel={AVATAR_RING_FULL.label}
              today={<AvatarRing variant={AVATAR_RING_TODAY} />}
              proposed={<AvatarRing variant={AVATAR_RING_FULL} />}
            />
            <StripPair
              file="family/ProfileTiles.tsx"
              page="/parent, the family switcher"
              todayLabel={TILE_RING_TODAY.label}
              proposedLabel={TILE_RING_FULL.label}
              today={<TileRing variant={TILE_RING_TODAY} />}
              proposed={<TileRing variant={TILE_RING_FULL} />}
            />
          </StripJob>
        </div>
      </Case>
    </Question>
  );
}
