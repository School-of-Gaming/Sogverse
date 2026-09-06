/**
 * Question 8 — act and world at an alpha step.
 *
 * **The ruling this section serves.** Act and world carry no alpha, at any
 * step, anywhere; there is no soft act and there will not be one. That half is
 * decided. What is open, and what this section exists to put on screen, is what
 * stands in each place instead — which is not one answer but one answer per
 * job, because the same `bg-act/5` is doing five unrelated things across the
 * app and only some of them are asking for a colour at all.
 *
 * **Regenerate the surface rather than trusting the counts below:**
 *
 *     grep -rnoE "\b(bg|from|to|via|text|border|ring|shadow|divide|outline)-(act|world)(-foreground)?/[0-9]+" src --include=*.tsx --include=*.ts
 *
 * 58 matches: 48 drawn here as eleven jobs, and ten that are gradients and
 * belong to question 9. `ACT_ALPHA_JOBS` in `inventory.ts` carries the
 * classification and the locators; the summary table lists them.
 *
 * **Why the grouping is by job and not by file.** A sweep that replaces
 * `bg-act/5` with one thing everywhere would be a sweep that decided, without
 * anybody noticing, that a checked consent row and a drag-and-drop target and
 * today's row in an admin calendar are the same statement. They are not: one is
 * a persistent selection that has to survive the pointer leaving, one is a
 * transient "it will land here", one is a fact about the date. So the owner
 * rules per job and the sweep applies the ruling per site.
 *
 * **The four candidates every job is offered**, from the ruling that widened
 * this question: a neutral ground from the greys that already exist (`accent`
 * and `muted`, drawn as two panels wherever they differ visibly for that job);
 * plain act at full value with `act-foreground` ink, for the places where the
 * element really is the thing to do; an act edge at full value — `border-act`
 * or `ring-act` — on a neutral ground, which is the shape the library's colour
 * rule already names for a brand colour that has to mark something without
 * becoming a ground; and nothing at all, which is a real answer wherever the
 * mark was never carrying the meaning on its own.
 *
 * **Two exemplars per job at most, and both real.** Every class string below is
 * the app's, with one mechanical edit: the border *colour* moves out of the
 * base string and into each candidate, because two `border-*` utilities in one
 * class list resolve by stylesheet order rather than by the order they are
 * written, so a `border-border border-act` candidate would be a coin flip
 * rather than a drawing.
 *
 * **What is drawn in its own hover state and what is not.** The demo is a live
 * page, so the two hover jobs carry the real `hover:` and `group-hover:`
 * classes and are ruled on by pointing at them. Everything else is a state the
 * page can hold still.
 *
 * **The one place this section contradicts a rule the library already ships.**
 * `brand.ts` exempts "chip-scale icon-accent tiles" from the no-alpha rule, and
 * job four is exactly that exemption, at seven sites. The ruling says act
 * carries no alpha anywhere. Both cannot stand, and the drawing is what settles
 * it rather than a paragraph: the exemption is either confirmed on screen or it
 * leaves the library with this ruling.
 */

import { BRAND, NEUTRALS } from "../../../src/tokens/brand";
import { tailwindAlpha } from "./colour";
import {
  Case,
  Compare,
  Exemplar,
  Glyph,
  Panel,
  Question,
} from "./parts";

/**
 * One replacement, named by the tokens it spends and drawn by the classes it
 * writes.
 *
 * `fill` is the whole of what changes between panels, so a candidate can carry
 * a ground, an edge and an ink together — which is what most of them are: a
 * fill and its foreground are one decision, not two.
 *
 * `ink` is the same decision for a glyph, which cannot take a class here: the
 * page's glyphs are drawn as SVG with an explicit stroke, so a candidate that
 * moves a tile to plain act has to move the mark inside it to `act-foreground`
 * in the same step. `currentColor` is what a candidate uses when the exemplar's
 * own text colour should carry the glyph — which is how the hover jobs get a
 * glyph that recolours under the pointer.
 */
interface Candidate {
  readonly label: string;
  readonly fill: string;
  readonly ink: string;
}

/** Sogverse's `destructive`, which is question 2's and is not a library token. */
const DESTRUCTIVE = "#EF4343";

const ACT = BRAND.act.hex;
const ACT_INK = BRAND.act.foreground;
const WORLD_INK = BRAND.world.foreground;
const MUTED_INK = NEUTRALS.mutedForeground.hex;

/** One exemplar drawn once per candidate, in a row so the candidates compare themselves. */
function Candidates({
  columns,
  options,
  file,
  page,
  render,
}: {
  columns: 2 | 3 | 4 | 5 | 6;
  options: readonly Candidate[];
  file: string;
  page: string;
  render: (candidate: Candidate) => React.ReactNode;
}) {
  return (
    <Compare columns={columns}>
      {options.map((candidate) => (
        <Panel key={candidate.label} label={candidate.label}>
          <Exemplar file={file} page={page}>
            {render(candidate)}
          </Exemplar>
        </Panel>
      ))}
    </Compare>
  );
}

// ------------------------------------------- job 1: a selected form option

/**
 * The largest job in the set, and the one whose answer decides fourteen sites
 * at once: a radio or a checkbox row that is currently the chosen one.
 *
 * Every one of them is `bg-act/5` — the faintest step in the app, and over the
 * card ground it composites to a grey a shade warmer than `accent`. The
 * question the row is really answering is "which of these is picked", and the
 * native control beside it is already answering that; the fill is there to make
 * the answer readable at a glance across a tall form.
 */
const FORM_OPTION: readonly Candidate[] = [
  { label: "bg-act/5", fill: "border-border bg-act/5", ink: ACT },
  { label: "bg-accent", fill: "border-border bg-accent", ink: ACT },
  { label: "bg-muted", fill: "border-border bg-muted", ink: ACT },
  {
    label: "bg-act text-act-foreground",
    fill: "border-border bg-act text-act-foreground",
    ink: ACT_INK,
  },
  { label: "border-act", fill: "border-act", ink: ACT },
  { label: "no fill", fill: "border-border", ink: ACT },
];

/** `ui/checkbox-row.tsx` — the shared consent row, with one of three ticked. */
function ConsentRows({ candidate }: { candidate: Candidate }) {
  const rest =
    "flex items-start gap-3 rounded-md border border-border p-3 text-sm transition-colors hover:bg-accent/50";
  return (
    <div className="space-y-2">
      <span
        className={`flex items-start gap-3 rounded-md border p-3 text-sm transition-colors ${candidate.fill}`}
      >
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border bg-act">
          <Glyph name="checkMark" size={12} colour={ACT_INK} />
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
function LanguagePills({ candidate }: { candidate: Candidate }) {
  const rest =
    "inline-flex cursor-pointer items-center gap-2 rounded-full border border-border py-1.5 pl-2.5 pr-3.5 text-sm transition-colors";
  return (
    <div className="flex flex-wrap gap-2">
      <span
        className={`inline-flex cursor-pointer items-center gap-2 rounded-full border py-1.5 pl-2.5 pr-3.5 text-sm transition-colors ${candidate.fill}`}
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

// ------------------------------------- job 2: a selected item with act ink

/**
 * The same "this one is picked" statement, spent louder: a fill *and* act as
 * the label's colour.
 *
 * These are the sites where the alpha step is not a faint lift but a visible
 * amber patch — `/10` and `/15` — with amber text on it. Over the card that
 * composites to a dull brown carrying a light amber label, which is the
 * pairing the library never measured because it never named the ground.
 */
const SELECTED_INK: readonly Candidate[] = [
  { label: "bg-act/10 text-act", fill: "border-border bg-act/10 text-act", ink: ACT },
  {
    label: "bg-accent text-foreground",
    fill: "border-border bg-accent text-foreground",
    ink: ACT,
  },
  {
    label: "bg-muted text-foreground",
    fill: "border-border bg-muted text-foreground",
    ink: ACT,
  },
  {
    label: "bg-act text-act-foreground",
    fill: "border-border bg-act text-act-foreground",
    ink: ACT_INK,
  },
  { label: "border-act text-act", fill: "border-act text-act", ink: ACT },
  {
    label: "no fill",
    fill: "border-border text-muted-foreground",
    ink: MUTED_INK,
  },
];

/** `admin/products/gedu-picker-sheet.tsx` — the spoken-language filter strip. */
function FilterChips({ candidate }: { candidate: Candidate }) {
  const rest =
    "rounded-full border border-border px-2 py-0.5 transition-colors text-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Speaks:</span>
        <span
          className={`rounded-full border px-2 py-0.5 transition-colors ${candidate.fill}`}
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

/** `admin/products/sections/identity-section.tsx` — the locale tab strip. */
function LocaleTabs({ candidate }: { candidate: Candidate }) {
  const rest =
    "inline-flex items-center gap-1 rounded-t-md border-b-2 border-border px-3 py-1.5 text-sm transition-colors text-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-end">
        <span
          className={`inline-flex items-center gap-1 rounded-t-md border-b-2 px-3 py-1.5 text-sm transition-colors ${candidate.fill}`}
        >
          English
        </span>
        <span className={rest}>Suomi</span>
        <span className={rest}>Svenska</span>
        <span className={rest}>Français</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------ job 3: a status chip

/**
 * A chip whose colour *is* the fact it states, which is what makes this job
 * different from a selection: nothing else in the row says "pending".
 *
 * The exemplar draws all five product statuses together on purpose. `running`
 * is already `bg-act text-act-foreground` at full value, so the plain-act
 * candidate for `pending` is drawn beside the chip it would then be
 * indistinguishable from — the collision is the picture, not a caveat.
 */
const STATUS_CHIP: readonly Candidate[] = [
  { label: "bg-act/20 text-act", fill: "bg-act/20 text-act", ink: ACT },
  { label: "bg-accent text-foreground", fill: "bg-accent text-foreground", ink: ACT },
  {
    label: "bg-muted text-muted-foreground",
    fill: "bg-muted text-muted-foreground",
    ink: MUTED_INK,
  },
  {
    label: "bg-act text-act-foreground",
    fill: "bg-act text-act-foreground",
    ink: ACT_INK,
  },
  {
    label: "border border-act text-act",
    fill: "border border-act text-act",
    ink: ACT,
  },
  { label: "text-muted-foreground", fill: "text-muted-foreground", ink: MUTED_INK },
];

/** `admin/products/product-status-chip.tsx` — the five statuses, side by side. */
function StatusChips({ candidate }: { candidate: Candidate }) {
  const chip = "shrink-0 rounded-full px-2 py-0.5 text-xs";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${chip} ${candidate.fill}`}>Pending</span>
        <span className={`${chip} bg-act text-act-foreground`}>Running</span>
        <span className={`${chip} bg-muted text-muted-foreground`}>Completed</span>
        <span
          className={chip}
          style={{
            backgroundColor: tailwindAlpha(DESTRUCTIVE, 20),
            color: DESTRUCTIVE,
          }}
        >
          Cancelled
        </span>
        <span className={`${chip} bg-muted text-muted-foreground`}>Expired</span>
      </div>
    </div>
  );
}

/** `public/schools/schools-browse.tsx` — the "clubs here" pill on a school row. */
function SchoolPills({ candidate }: { candidate: Candidate }) {
  const row =
    "flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3";
  const pill = "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium";
  return (
    <div className="space-y-2">
      <div className={row}>
        <span className="min-w-0 text-sm font-medium">Tapiolan koulu</span>
        <span className={`${pill} ${candidate.fill}`}>Clubs here</span>
      </div>
      <div className={row}>
        <span className="min-w-0 text-sm font-medium">Otaniemen koulu</span>
        <span className={`${pill} bg-muted text-muted-foreground`}>No clubs yet</span>
      </div>
    </div>
  );
}

// --------------------------------------------- job 4: an icon-accent tile

/**
 * A square of colour behind a glyph, at chip scale, on a marketing card or
 * beside a name.
 *
 * This is the job the library's own rule exempts, and it is also the job with
 * the weakest case for a fill: the glyph is already `text-act`, so the tile is
 * a second statement of the same accent behind the first. Two of the seven are
 * not glyph tiles at all but initials in a circle — a monogram avatar, where
 * the tile is standing in for a face.
 */
const ICON_TILE: readonly Candidate[] = [
  { label: "bg-act/10", fill: "bg-act/10 text-act", ink: ACT },
  { label: "bg-accent", fill: "bg-accent text-act", ink: ACT },
  { label: "bg-muted", fill: "bg-muted text-act", ink: ACT },
  { label: "bg-act", fill: "bg-act text-act-foreground", ink: ACT_INK },
  { label: "border border-act", fill: "border border-act text-act", ink: ACT },
  { label: "no tile", fill: "text-act", ink: ACT },
];

/** `app/(public)/page.tsx` — a home feature card. */
function FeatureCard({ candidate }: { candidate: Candidate }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 text-foreground shadow-sm">
      <div className="flex flex-col space-y-1.5 p-6">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-lg ${candidate.fill}`}
          >
            <Glyph name="gamepad" size={24} colour={candidate.ink} />
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
function ContactRows({ candidate }: { candidate: Candidate }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent hover:text-foreground">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium ${candidate.fill}`}
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
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium ${candidate.fill}`}
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

// ------------------------------------------- job 5: a highlighted row

/**
 * A row in a list that is marked out from the rows around it — today's date in
 * an admin week, and the message a reply-jump just landed on.
 *
 * The two are drawn together because they are the same shape doing different
 * work: one is permanent and reads all day, the other is a flash that fades
 * after a second. A colour that is too quiet for the first may be exactly right
 * for the second, and the ruling can differ between them.
 */
const HIGHLIGHT_ROW: readonly Candidate[] = [
  { label: "bg-act/5", fill: "border-border bg-act/5 text-act", ink: ACT },
  { label: "bg-accent", fill: "border-border bg-accent text-foreground", ink: ACT },
  { label: "bg-muted", fill: "border-border bg-muted text-foreground", ink: ACT },
  {
    label: "bg-act text-act-foreground",
    fill: "border-border bg-act text-act-foreground",
    ink: ACT_INK,
  },
  {
    label: "bg-card ring-1 ring-act",
    fill: "border-border bg-card text-act ring-1 ring-act",
    ink: ACT,
  },
  { label: "bg-card", fill: "border-border bg-card text-foreground", ink: ACT },
];

/** `admin/dashboard/week-rows.tsx` — the week list, with today marked. */
function WeekRows({ candidate }: { candidate: Candidate }) {
  const rest =
    "flex flex-col gap-2 rounded-lg border border-border bg-card p-2 sm:flex-row sm:gap-3";
  return (
    <ul className="space-y-1.5">
      <li className={rest}>
        <div className="flex shrink-0 items-baseline gap-2 px-1 sm:w-24 sm:flex-col sm:items-start sm:gap-0">
          <span className="text-sm font-semibold text-foreground">Mon</span>
          <span className="text-xs tabular-nums text-muted-foreground">8.9.</span>
        </div>
        <p className="px-1 text-xs text-muted-foreground">Nothing on</p>
      </li>
      <li
        className={`flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:gap-3 ${candidate.fill}`}
      >
        <div className="flex shrink-0 items-baseline gap-2 px-1 sm:w-24 sm:flex-col sm:items-start sm:gap-0">
          <span className="text-sm font-semibold">Tue</span>
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
 * The flash a jump leaves behind — `chat/ChatMessageRow.tsx` and
 * `chat/ChatMessageList.tsx`, one recipe in two files.
 */
const FLASH_ROW: readonly Candidate[] = [
  { label: "bg-act/20 ring-1 ring-act", fill: "bg-act/20 ring-1 ring-act", ink: ACT },
  { label: "bg-accent", fill: "bg-accent", ink: ACT },
  { label: "bg-muted", fill: "bg-muted", ink: ACT },
  {
    label: "bg-act text-act-foreground",
    fill: "bg-act text-act-foreground",
    ink: ACT_INK,
  },
  { label: "ring-1 ring-act", fill: "ring-1 ring-act", ink: ACT },
  { label: "no fill", fill: "", ink: ACT },
];

/** `chat/ChatMessageRow.tsx` — a log with the jumped-to message flashing. */
function ChatFlash({ candidate }: { candidate: Candidate }) {
  const line = "rounded px-1.5 py-0.5 text-sm leading-snug transition-colors";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className={line}>
        <span className="font-medium">Aino</span>{" "}
        <span className="text-muted-foreground">
          the tower district is finished
        </span>
      </div>
      <div className={`mt-1 ${line} ${candidate.fill}`}>
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

// ---------------------------------------------------- job 6: a drop target

/**
 * "It will land here" — a card, a column or a strip lit while something is
 * dragged over it.
 *
 * The most transient statement in the set: it exists for as long as a pointer
 * is held down and never survives the gesture. Two of the six add a full-value
 * `ring-act` on top of the tint already, which makes them the one job where
 * part of the answer is already drawn in the app.
 */
const DROP_TARGET: readonly Candidate[] = [
  {
    label: "bg-act/10 ring-2 ring-act",
    fill: "bg-act/10 ring-2 ring-act",
    ink: MUTED_INK,
  },
  { label: "bg-accent", fill: "bg-accent", ink: MUTED_INK },
  { label: "bg-muted", fill: "bg-muted", ink: MUTED_INK },
  { label: "bg-act", fill: "bg-act", ink: ACT_INK },
  { label: "ring-2 ring-act", fill: "bg-muted/40 ring-2 ring-act", ink: MUTED_INK },
  { label: "no fill", fill: "bg-muted/40", ink: MUTED_INK },
];

/** `gedu/session-feed/SessionPhotoStrip.tsx` — the strip mid-drag. */
function PhotoStripTarget({ candidate }: { candidate: Candidate }) {
  return (
    <div className={`rounded-md p-3 transition-colors sm:p-3.5 ${candidate.fill}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-16 w-20 items-center justify-center rounded border border-border bg-background">
          <Glyph name="image" size={20} colour={candidate.ink} />
        </span>
        <span className="flex h-16 w-20 items-center justify-center rounded border border-dashed border-border">
          <Glyph name="plus" size={20} colour={candidate.ink} />
        </span>
      </div>
    </div>
  );
}

/** `admin/products/groups/group-column.tsx` — a group column with a gamer over it. */
function GroupColumn({ candidate }: { candidate: Candidate }) {
  return (
    <div
      className={`rounded-lg border border-border text-foreground shadow-sm transition-colors ${candidate.fill}`}
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

// --------------------------------------- job 7: a hover tint on an empty tile

/**
 * The add-gamer tile's `group-hover:bg-act/5`, and the only site of its shape.
 *
 * Drawn with the real `group-hover:` classes and ruled on by pointing at them:
 * a hover treatment held still is a picture of a state nobody meets.
 */
const HOVER_TILE: readonly Candidate[] = [
  {
    label: "group-hover:bg-act/5",
    fill: "group-hover:bg-act/5 text-muted-foreground group-hover:text-act",
    ink: "currentColor",
  },
  {
    label: "group-hover:bg-accent",
    fill: "group-hover:bg-accent text-muted-foreground group-hover:text-act",
    ink: "currentColor",
  },
  {
    label: "group-hover:bg-muted",
    fill: "group-hover:bg-muted text-muted-foreground group-hover:text-act",
    ink: "currentColor",
  },
  {
    label: "group-hover:bg-act",
    fill: "group-hover:bg-act text-muted-foreground group-hover:text-act-foreground",
    ink: "currentColor",
  },
  {
    label: "group-hover:border-act",
    fill: "group-hover:border-act text-muted-foreground group-hover:text-act",
    ink: "currentColor",
  },
  {
    label: "no fill",
    fill: "text-muted-foreground group-hover:text-act",
    ink: "currentColor",
  },
];

/** `family/ProfileTiles.tsx` — the add-gamer tile. */
function AddGamerTile({ candidate }: { candidate: Candidate }) {
  return (
    <div className="flex justify-center">
      <span className="group flex w-28 flex-col items-center gap-2 transition-transform duration-150 hover:scale-105">
        <span
          className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border transition-colors duration-150 ${candidate.fill}`}
        >
          <Glyph name="plus" size={32} colour={candidate.ink} />
        </span>
        <span className="text-sm text-muted-foreground">Add a gamer</span>
      </span>
    </div>
  );
}

// -------------------------------- job 8: a hover shade on a filled control

/**
 * The one job where the alpha step is not a tint over a ground but a *shade of
 * the fill itself*: `hover:bg-act/90` on the amber button, `hover:bg-world/80`
 * on the violet one.
 *
 * Ruled to fall here rather than to wait for the Button adoption, because
 * whatever hover becomes, it is not a derived shade of act. So the candidates
 * are the three things a filled button can do under a pointer without inventing
 * a colour: lift, ring, or nothing — and the button already owns a shadow, so
 * the lift is a change of degree rather than a new construct.
 *
 * The same shape at two more sites is `hover:bg-destructive/90`
 * (`ui/button.tsx`, `parent/PaymentProblemBadge.tsx`). Those are status, they
 * ride question 2, and they are listed rather than drawn here.
 */
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors";

const ACT_HOVER: readonly Candidate[] = [
  {
    label: "hover:bg-act/90",
    fill: "bg-act text-act-foreground shadow hover:bg-act/90",
    ink: ACT_INK,
  },
  {
    label: "hover:shadow-lg",
    fill: "bg-act text-act-foreground shadow transition-shadow hover:shadow-lg",
    ink: ACT_INK,
  },
  {
    label: "hover:ring-2 ring-act",
    fill: "bg-act text-act-foreground shadow hover:ring-2 hover:ring-act hover:ring-offset-2 hover:ring-offset-background",
    ink: ACT_INK,
  },
  { label: "no change", fill: "bg-act text-act-foreground shadow", ink: ACT_INK },
];

const WORLD_HOVER: readonly Candidate[] = [
  {
    label: "hover:bg-world/80",
    fill: "bg-world text-world-foreground shadow-sm hover:bg-world/80",
    ink: WORLD_INK,
  },
  {
    label: "hover:shadow-lg",
    fill: "bg-world text-world-foreground shadow-sm transition-shadow hover:shadow-lg",
    ink: WORLD_INK,
  },
  {
    label: "hover:ring-2 ring-world",
    fill: "bg-world text-world-foreground shadow-sm hover:ring-2 hover:ring-world hover:ring-offset-2 hover:ring-offset-background",
    ink: WORLD_INK,
  },
  {
    label: "no change",
    fill: "bg-world text-world-foreground shadow-sm",
    ink: WORLD_INK,
  },
];

/** `ui/button.tsx` — the filled button, hovered on the page. */
function FilledButton({
  candidate,
  label,
}: {
  candidate: Candidate;
  label: string;
}) {
  return (
    <div className="flex justify-center py-2">
      <button
        type="button"
        className={`${BUTTON_BASE} h-10 px-4 py-2 text-sm ${candidate.fill}`}
      >
        {label}
      </button>
    </div>
  );
}

// -------------------------------------------------------- job 9: the ring

/**
 * Four rings drawn at an alpha step, three of them at `/30` or `/50` around
 * something a reader is meant to notice: their own avatar in a call, their own
 * tile in the family switcher, the row they have selected in a signup panel.
 *
 * The candidates here are narrower than the other jobs' by design. A ring is
 * already an edge rather than a ground, so the neutral-ground and plain-fill
 * answers do not apply: the only question is whether the edge is the colour it
 * says it is, and whether it needs a gap between the ring and the thing it
 * rings for the full value not to sit on top of the picture.
 */
const RING_THIN: readonly Candidate[] = [
  { label: "ring-1 ring-act/30", fill: "ring-1 ring-act/30", ink: MUTED_INK },
  { label: "ring-1 ring-act", fill: "ring-1 ring-act", ink: MUTED_INK },
  {
    label: "ring-1 ring-act ring-offset-1",
    fill: "ring-1 ring-act ring-offset-1 ring-offset-background",
    ink: MUTED_INK,
  },
];

const RING_THICK: readonly Candidate[] = [
  {
    label: "ring-4 ring-act/50",
    fill: "ring-4 ring-act/50 ring-offset-2 ring-offset-background",
    ink: MUTED_INK,
  },
  {
    label: "ring-4 ring-act",
    fill: "ring-4 ring-act ring-offset-2 ring-offset-background",
    ink: MUTED_INK,
  },
  {
    label: "ring-4 ring-act ring-offset-1",
    fill: "ring-4 ring-act ring-offset-1 ring-offset-background",
    ink: MUTED_INK,
  },
];

/** `voice/VoiceAvatar.tsx` — the local speaker's tile in the grid. */
function AvatarRing({ candidate }: { candidate: Candidate }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-md border-2 border-border bg-muted transition-shadow ${candidate.fill}`}
      >
        <Glyph name="users" size={20} colour={candidate.ink} />
      </span>
      <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md border-2 border-border bg-muted">
        <Glyph name="users" size={20} colour={candidate.ink} />
      </span>
      <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md border-2 border-border bg-muted">
        <Glyph name="users" size={20} colour={candidate.ink} />
      </span>
    </div>
  );
}

/** `family/ProfileTiles.tsx` — the active family tile. */
function TileRing({ candidate }: { candidate: Candidate }) {
  return (
    <div className="flex justify-center py-2">
      <span className="flex w-24 flex-col items-center gap-2">
        <span
          className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border-2 border-border bg-muted transition-[box-shadow] duration-150 ${candidate.fill}`}
        >
          <Glyph name="users" size={28} colour={candidate.ink} />
        </span>
        <span className="text-sm">Aino</span>
      </span>
    </div>
  );
}

// -------------------------------- job 10: faded ink on an amber fill

/**
 * `text-act-foreground/70` — the timestamp on an outbound WhatsApp bubble, and
 * a role label on a filled button in a preview scene.
 *
 * The token is the ground's own near-black, so this is not amber at an alpha
 * step; it is the *ink* on amber stepped down, which composites to a warm grey
 * on the fill. The palette offers exactly one ink for an amber fill, so there
 * is no quieter member of the pair to move to — the third candidate is
 * therefore not a colour at all but the meta line moved off the fill, which is
 * the only other way to make it quieter.
 */
function WhatsAppBubble({ draw }: { draw: "today" | "full" | "outside" }) {
  const bubble = "max-w-[70%] rounded-lg bg-act px-3 py-2 text-sm text-act-foreground";
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex justify-start">
        <div className="max-w-[70%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
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
          {draw === "outside" ? null : (
            <div
              className={
                draw === "today"
                  ? "mt-1 flex items-center justify-end gap-1 text-[10px] text-act-foreground/70"
                  : "mt-1 flex items-center justify-end gap-1 text-[10px] text-act-foreground"
              }
            >
              <span>17:04</span>
              <Glyph name="checkMark" size={10} colour={ACT_INK} />
            </div>
          )}
        </div>
        {draw === "outside" ? (
          <span className="mt-1 text-[10px] text-muted-foreground">17:04</span>
        ) : null}
      </div>
    </div>
  );
}

/** `preview/scenes/chat-scene.tsx` — the viewer switcher's role label. */
function ViewerChip({ faded }: { faded: boolean }) {
  return (
    <div className="flex justify-center py-2">
      <button
        type="button"
        className={`${BUTTON_BASE} h-9 bg-act px-3 text-xs text-act-foreground shadow`}
      >
        Mikko
        <span
          className={
            faded
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

// ------------------------------------------------- job 11: a callout ground

/**
 * `admin/products/form-primitives.tsx` — the hint box a product form puts under
 * a field, in its `warn` variant.
 *
 * One site, and it is drawn beside its own `info` sibling because that sibling
 * is what settles the answer: the two variants exist to be told apart, and
 * `bg-muted/30` versus `bg-act/5` is what tells them apart today.
 */
const CALLOUT: readonly Candidate[] = [
  {
    label: "bg-act/5 text-foreground",
    fill: "border-border bg-act/5 text-foreground",
    ink: ACT,
  },
  {
    label: "bg-accent text-foreground",
    fill: "border-border bg-accent text-foreground",
    ink: ACT,
  },
  {
    label: "bg-muted text-foreground",
    fill: "border-border bg-muted text-foreground",
    ink: ACT,
  },
  {
    label: "bg-act text-act-foreground",
    fill: "border-border bg-act text-act-foreground",
    ink: ACT_INK,
  },
  { label: "border-act text-foreground", fill: "border-act text-foreground", ink: ACT },
  { label: "no fill", fill: "border-border text-foreground", ink: ACT },
];

function FormHints({ candidate }: { candidate: Candidate }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="mt-0.5">
          <Glyph name="info" size={14} colour={MUTED_INK} />
        </span>
        <span>Registration opens when the product is published.</span>
      </div>
      <div
        className={`flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs ${candidate.fill}`}
      >
        <span className="mt-0.5">
          <Glyph name="alert" size={14} colour={candidate.ink} />
        </span>
        <span>Changing the start date moves every session on the calendar.</span>
      </div>
    </div>
  );
}

export function ActSection() {
  return (
    <Question n={8} title="Act and world at an alpha step">
      <Case title="A selected option in a form">
        <div className="space-y-10">
          <Candidates
            columns={6}
            options={FORM_OPTION}
            file="ui/checkbox-row.tsx"
            page="/admin/products/[id], the audience section"
            render={(candidate) => <ConsentRows candidate={candidate} />}
          />
          <Candidates
            columns={6}
            options={FORM_OPTION}
            file="admin/products/sections/spoken-language-radios.tsx"
            page="/admin/products/[id], the identity section"
            render={(candidate) => <LanguagePills candidate={candidate} />}
          />
        </div>
      </Case>

      <Case title="A selected item, with act as its ink">
        <div className="space-y-10">
          <Candidates
            columns={6}
            options={SELECTED_INK}
            file="admin/products/gedu-picker-sheet.tsx"
            page="/admin/products/[id], assigning a gedu"
            render={(candidate) => <FilterChips candidate={candidate} />}
          />
          <Candidates
            columns={6}
            options={SELECTED_INK}
            file="admin/products/sections/identity-section.tsx"
            page="/admin/products/[id], the locale tabs"
            render={(candidate) => <LocaleTabs candidate={candidate} />}
          />
        </div>
      </Case>

      <Case title="A status chip">
        <div className="space-y-10">
          <Candidates
            columns={3}
            options={STATUS_CHIP}
            file="admin/products/product-status-chip.tsx"
            page="/admin/products, the list and the details page"
            render={(candidate) => <StatusChips candidate={candidate} />}
          />
          <Candidates
            columns={3}
            options={STATUS_CHIP}
            file="public/schools/schools-browse.tsx"
            page="/schools, the school list"
            render={(candidate) => <SchoolPills candidate={candidate} />}
          />
        </div>
      </Case>

      <Case title="An icon tile behind a glyph">
        <div className="space-y-10">
          <Candidates
            columns={3}
            options={ICON_TILE}
            file="app/(public)/page.tsx"
            page="the home page, the feature cards"
            render={(candidate) => <FeatureCard candidate={candidate} />}
          />
          <Candidates
            columns={3}
            options={ICON_TILE}
            file="app/(dashboard)/admin/whatsapp/page.tsx"
            page="/admin/whatsapp, the contact list"
            render={(candidate) => <ContactRows candidate={candidate} />}
          />
        </div>
      </Case>

      <Case title="A highlighted row">
        <div className="space-y-10">
          <Candidates
            columns={3}
            options={HIGHLIGHT_ROW}
            file="admin/dashboard/week-rows.tsx"
            page="/admin, this week"
            render={(candidate) => <WeekRows candidate={candidate} />}
          />
          <Candidates
            columns={3}
            options={FLASH_ROW}
            file="chat/ChatMessageRow.tsx"
            page="any chat, after a reply jump"
            render={(candidate) => <ChatFlash candidate={candidate} />}
          />
        </div>
      </Case>

      <Case title="A drop target">
        <div className="space-y-10">
          <Candidates
            columns={6}
            options={DROP_TARGET}
            file="gedu/session-feed/SessionPhotoStrip.tsx"
            page="/gedu, writing a session report"
            render={(candidate) => <PhotoStripTarget candidate={candidate} />}
          />
          <Candidates
            columns={6}
            options={DROP_TARGET}
            file="admin/products/groups/group-column.tsx"
            page="/admin/products/[id], the groups board"
            render={(candidate) => <GroupColumn candidate={candidate} />}
          />
        </div>
      </Case>

      <Case title="A hover tint on an empty tile">
        <Candidates
          columns={6}
          options={HOVER_TILE}
          file="family/ProfileTiles.tsx"
          page="/parent, the add-gamer tile"
          render={(candidate) => <AddGamerTile candidate={candidate} />}
        />
      </Case>

      <Case title="A hover shade on a filled control">
        <div className="space-y-10">
          <Candidates
            columns={4}
            options={ACT_HOVER}
            file="ui/button.tsx"
            page="every page, the default button"
            render={(candidate) => (
              <FilledButton candidate={candidate} label="Buy a seat" />
            )}
          />
          <Candidates
            columns={4}
            options={WORLD_HOVER}
            file="ui/button.tsx"
            page="every page, the secondary variant"
            render={(candidate) => (
              <FilledButton candidate={candidate} label="Enter Sogverse" />
            )}
          />
        </div>
      </Case>

      <Case title="A ring">
        <div className="space-y-10">
          <Candidates
            columns={3}
            options={RING_THIN}
            file="voice/VoiceAvatar.tsx"
            page="a club's voice room, your own tile"
            render={(candidate) => <AvatarRing candidate={candidate} />}
          />
          <Candidates
            columns={3}
            options={RING_THICK}
            file="family/ProfileTiles.tsx"
            page="/parent, the active family tile"
            render={(candidate) => <TileRing candidate={candidate} />}
          />
        </div>
      </Case>

      <Case title="Faded ink on an amber fill">
        <div className="space-y-10">
          <Compare columns={3}>
            <Panel label="text-act-foreground/70">
              <Exemplar
                file="app/(dashboard)/admin/whatsapp/page.tsx"
                page="/admin/whatsapp, an outbound message"
              >
                <WhatsAppBubble draw="today" />
              </Exemplar>
            </Panel>
            <Panel label="text-act-foreground">
              <Exemplar
                file="app/(dashboard)/admin/whatsapp/page.tsx"
                page="/admin/whatsapp, an outbound message"
              >
                <WhatsAppBubble draw="full" />
              </Exemplar>
            </Panel>
            <Panel label="text-muted-foreground, off the fill">
              <Exemplar
                file="app/(dashboard)/admin/whatsapp/page.tsx"
                page="/admin/whatsapp, an outbound message"
              >
                <WhatsAppBubble draw="outside" />
              </Exemplar>
            </Panel>
          </Compare>
          <Compare columns={2}>
            <Panel label="text-act-foreground/70">
              <Exemplar
                file="preview/scenes/chat-scene.tsx"
                page="/preview/chat, the viewer switcher"
              >
                <ViewerChip faded />
              </Exemplar>
            </Panel>
            <Panel label="text-act-foreground">
              <Exemplar
                file="preview/scenes/chat-scene.tsx"
                page="/preview/chat, the viewer switcher"
              >
                <ViewerChip faded={false} />
              </Exemplar>
            </Panel>
          </Compare>
        </div>
      </Case>

      <Case title="A callout ground">
        <Candidates
          columns={3}
          options={CALLOUT}
          file="admin/products/form-primitives.tsx"
          page="/admin/products/[id], a field hint"
          render={(candidate) => <FormHints candidate={candidate} />}
        />
      </Case>
    </Question>
  );
}
