import { BRAND, DARK_THEME, STATUS } from "@/lib/constants/colors";
import { RADIUS } from "@/lib/constants/radius";
import { MARKDOWN_LOOK } from "@/lib/authored-markdown";
import { MAIL_SPACE, MAIL_WEIGHT, mailText } from "./type-scale";
import {
  BODY_TEXT_STYLE,
  TEXT_PINS,
  framedCell,
  holdBlock,
  holdInline,
  holdRuns,
  holdText,
  listMarkers,
  markerColumnList,
  needsRunHolds,
  pinnedFill,
} from "./utils";

/**
 * The composed blocks a template reaches for rather than builds. `utils.ts`
 * holds the pieces every template uses (escaping, a paragraph, a styled name);
 * these are the larger shapes: the buttons and links a mail that sends the
 * reader somewhere needs, and the callout panel a mail sets an aside in — a word
 * about the mail *itself*, or the one fact in it the reader must not miss.
 *
 * **Every `href` here is embedded unescaped, by design** — the same exception
 * the password-reset builder documents. Callers pass app-generated URLs
 * (verification links, My SOG, the shop) and nothing else. A value a user can
 * influence must never reach one of these.
 *
 * The same goes for the composed HTML the layout blocks take — a `factList`
 * value, a `bulletList` item, a `calloutPanel` paragraph. They are spliced in
 * as written, so a value off a row is escaped by whoever composed it.
 */

/**
 * The same three names the app's `Button` uses, meaning the same three things,
 * because a mail is the app's style in an inbox and a shared vocabulary is half
 * of that. `secondary` is the brand purple, the world colour — it used to name
 * the outlined button here, which left the world colour with no way to be
 * spelled and made "secondary" mean two different things in two places.
 */
type CtaVariant = "primary" | "secondary" | "outline";

interface CtaButtonOptions {
  /** App-generated URL. Embedded unescaped — see the note above. */
  href: string;
  /** Already-translated label. */
  label: string;
  /**
   * `primary` fills the brand orange, `secondary` the brand purple, `outline`
   * is whatever ground it stands on, behind a border. However many buttons a mail carries,
   * exactly one of them is the action it is actually asking for — a second
   * filled button says the opposite, whichever brand colour fills it.
   */
  variant?: CtaVariant;
}

/**
 * How wide a button is allowed to be, which is the only thing that differs
 * between a button standing alone and one sharing a row.
 *
 * - `auto` — a pill sized to its label and centred, the shape a button on its
 *   own row has always had.
 * - `half` — the button fills the cell it is handed, and the generous side
 *   padding is pulled right in so that the *cell* decides the width. At 32px a
 *   side, a half-width cell on a phone (see `ctaButtonRow`) has barely a word's
 *   worth of room left for the label.
 *
 * Vertical padding does not vary: 12px is the tap target, and a button that is
 * harder to hit because it shares a row would be a worse button, not a smaller
 * one.
 */
type CtaWidth = "auto" | "half";

/**
 * A row half: never `primary`, so a row cannot hold two amber (act) cells. That
 * is all the type forbids — two `secondary` halves still compile.
 */
interface RowButtonOptions extends CtaButtonOptions {
  variant: Exclude<CtaVariant, "primary">;
}

const VARIANTS = {
  primary: {
    fill: pinnedFill(BRAND.act),
    label: BRAND.actForeground,
    bordered: false,
    // The only label dark enough for the pin to help rather than hurt.
    labelClass: TEXT_PINS.dark.className,
  },
  secondary: {
    fill: pinnedFill(BRAND.world),
    label: BRAND.worldForeground,
    bordered: false,
    labelClass: "",
  },
  outline: {
    fill: "",
    label: DARK_THEME.foreground,
    bordered: true,
    labelClass: "",
  },
} as const;

/**
 * The button's look, in one place, so a half-width one is the same button.
 *
 * **Each variant meets Gmail iOS differently, by what it is made of.** That
 * client inverts every plain colour and leaves gradients alone, and the three
 * buttons are three cases of it:
 *
 * - `primary` is a pinned amber fill under a pinned dark label — both
 *   gradients, so nothing on it is touched, and nothing on it is held.
 * - `secondary` is a pinned violet fill under a plain white label. The fill
 *   survives on its own; the label is a plain colour and would come back dark,
 *   so it alone is held, inside the anchor, with the fill outside the hold.
 * - `outline` is a plain border grey and a plain body ink and **no fill at
 *   all**, so the whole button is held. It declares no ground of its own
 *   because a fill inside a hold is screened a few shades lighter in every
 *   Gmail; with nothing painted it is the ground it stands on in every client.
 *
 * **Only the dark label is pinned.** `background-clip:text` restates a text
 * colour as a background, and a client's dark theme leaves dark backgrounds
 * alone while darkening light ones — so the mechanism that carries `#121212`
 * intact is the one that turns `#ededed` dark on Gmail Android. A light label
 * is held instead, which is the protection that works on a light colour.
 */
function buttonStyles(variant: CtaVariant, width: CtaWidth) {
  const { fill, label, bordered, labelClass } = VARIANTS[variant];
  const isHalf = width === "half";
  return {
    surface: [
      fill,
      bordered ? `border:1px solid ${DARK_THEME.border};` : "",
      `border-radius:${RADIUS.md};`,
    ].join(""),
    labelClass,
    label: `display:${isHalf ? "block" : "inline-block"};padding:12px ${isHalf ? "8px" : "32px"};${mailText("action", label)}text-decoration:none;`,
  };
}

/** The anchor a button is pressed through, with the violet label held inside it. */
function buttonAnchor(href: string, label: string, variant: CtaVariant, labelStyle: string, labelClass: string): string {
  const text = variant === "secondary" ? holdInline(label, "inline-block") : label;
  return `<a href="${href}" target="_blank"${labelClass ? ` class="${labelClass}"` : ""} style="${labelStyle}">${text}</a>`;
}

/**
 * The button's own table: the painted cell and the anchor in it. The outlined
 * one is held whole, since everything on it is a plain neutral.
 */
function buttonTable(
  { href, label, variant }: Required<CtaButtonOptions>,
  width: CtaWidth,
): string {
  const { surface, labelClass, label: labelStyle } = buttonStyles(variant, width);
  // An auto-width table centres itself: the outlined one's hold sits between
  // it and the centring cell around it, so that cell's alignment cannot reach it.
  const table = `<table role="presentation" cellpadding="0" cellspacing="0"${width === "half" ? ' width="100%"' : ' align="center"'}>
            <tr>
              <td align="center" style="${surface}">
                ${buttonAnchor(href, label, variant, labelStyle, labelClass)}
              </td>
            </tr>
          </table>`;
  return variant === "outline" ? holdBlock(table) : table;
}

/**
 * A centred call-to-action button. Nested tables rather than a styled anchor,
 * because that is the shape Outlook renders as a button.
 */
export function ctaButton({ href, label, variant = "primary" }: CtaButtonOptions): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 ${MAIL_SPACE.block}px;">
      <tr>
        <td align="center">
          ${buttonTable({ href, label, variant }, "auto")}
        </td>
      </tr>
    </table>`;
}

/**
 * Two buttons side by side, each filling half the width.
 *
 * It is for the pair that are alternatives to each other rather than a first
 * and a second choice — stacking those reads as a ranking the mail did not mean
 * to give. Anything the reader is meant to do *before* the next thing stays a
 * row of its own.
 *
 * **The split is a hardcoded 50/50 and has to survive a phone as it stands.**
 * Email clients do not reflow table columns and media queries are not dependable
 * across them, so there is no narrow-viewport arrangement to fall back on: these
 * two cells are the layout at every width the shell is read at, and the narrow
 * end is genuinely narrow — at 320px, which is below the shell's own design
 * floor and well below the width at which it draws a card, the content column
 * is 288px and the 8px gutters leave each half about 132px. That is what sets
 * the terms here:
 *
 * - The halves use the `half` width, so the label's padding is 8px a side and
 *   the cell drives the width instead of the padding.
 * - A label too long for one line **wraps**, and is expected to. There is no
 *   width at which every locale's longest label fits on one line, so wrapping is
 *   the designed behaviour rather than a failure of one.
 * - A filled half is the row's own cell, which is what keeps a wrapped label
 *   from making one button taller than its neighbour: cells in a table row are
 *   the height of the row, so the fill paints to the same height on both sides
 *   and the labels sit centred in it. An outlined half cannot be: its border has
 *   to be held, and a hold around the row's cell would take the neighbour's
 *   fill in with it, so its border is drawn on a table of its own inside the
 *   cell, held there. Beside any half whose label wraps to more lines, filled
 *   or outlined, the outlined one is therefore shorter — `height:100%` on its
 *   table was tried on Gmail iOS and did not stretch it. Accepted, because the
 *   labels the mails carry fit on one line at phone widths.
 * - `cellspacing` is the gutter, because it is the one gap Outlook has never
 *   argued with.
 */
export function ctaButtonRow(left: RowButtonOptions, right: RowButtonOptions): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="8" width="100%" style="margin:0 0 ${MAIL_SPACE.block}px;">
      <tr>
        ${halfButtonCell(left)}
        ${halfButtonCell(right)}
      </tr>
    </table>`;
}

/**
 * One half of a `ctaButtonRow`: the row's own cell, painted as the button.
 *
 * The variant is narrowed rather than defaulted: a row is for two alternatives,
 * so two amber `primary` cells is the arrangement it must not be able to make,
 * and it used to be the arrangement you got by leaving the argument out. A shape
 * forbidden in prose and reachable by omission is not forbidden. The narrowing
 * reaches that one shape only — two `secondary` halves still compile.
 */
function halfButtonCell({ href, label, variant }: RowButtonOptions): string {
  if (variant === "outline") {
    return `<td width="50%" valign="middle">
          ${buttonTable({ href, label, variant }, "half")}
        </td>`;
  }
  const { surface, labelClass, label: labelStyle } = buttonStyles(variant, "half");
  return `<td width="50%" align="center" valign="middle" style="${surface}">
          ${buttonAnchor(href, label, variant, labelStyle, labelClass)}
        </td>`;
}

/**
 * An inline link. `href` is app-generated; `label` is translated copy.
 *
 * It exists for the destination that is worth naming but not worth a button:
 * the sentence it sits in is already being read, so the link rides along inside
 * it instead of adding another thing to weigh up at the bottom of the mail.
 * Which word carries it is the translation's decision — the message file names a
 * placeholder and the label is a key of its own, so a language that puts the
 * case ending on the word ("asetuksissa") keeps it inside the link text.
 */
export function inlineLink(href: string, label: string): string {
  // Pinned, like the header lockup, which paints the same colour: unpinned,
  // the amber drifts darker on Gmail iOS, and a link is a colour that cannot be
  // held — a hold would turn it blue. The pin sets `color: transparent` and
  // paints the glyphs out of a background, and `text-decoration-color`
  // defaults to `currentColor`, so the underline's colour is stated on its own
  // or the pinned link loses its underline. The sentence around the link is
  // held run by run, with the link outside every hold (`holdRuns`).
  return `<a href="${href}" target="_blank" class="${TEXT_PINS.act.className}" style="color:${BRAND.act};text-decoration:underline;text-decoration-color:${BRAND.act};">${label}</a>`;
}

/**
 * A list's markup, shared by both markers so they cannot space differently.
 *
 * Authored markdown's list, at the mail's own block margin: the item gap under
 * every item but the last, so the list's bottom margin is the only space under
 * it, and the indent written as a `margin-left` with the padding zeroed —
 * Outlook's Word engine ignores `padding-left` on a list and draws the markers
 * flush against the column's edge, which is why the markdown definition's mail
 * half writes it as a margin too.
 *
 * **Two paths, by what the items carry.** A list of plain items is a real
 * `<ol>`/`<ul>`, held whole, markers and all. A list whose items carry a link —
 * or a list of their own, already held — cannot be held whole, since the hold
 * would turn the link blue on Gmail iOS; and a list element left in plain ink
 * has its markers inverted there to roughly the ground, so the step numbers
 * vanish. That list is drawn as a table instead (`markerColumnList`): each
 * marker held as text in a column as wide as the list's indent, each item's
 * runs held around its link beside it. The table is no list to a screen reader
 * — the accepted cost, since a list whose numbers cannot be seen is worse.
 */
function list(tag: "ul" | "ol", items: string[]): string {
  const look = MARKDOWN_LOOK[tag];
  if (items.some(needsRunHolds)) {
    return markerColumnList({
      markers: listMarkers(tag, items.length),
      items: items.map(holdRuns),
      indent: look.indent,
      itemGap: MAIL_SPACE.item,
      margin: `0 0 ${MAIL_SPACE.block}px`,
      textStyle: BODY_TEXT_STYLE,
    });
  }
  const last = items.length - 1;
  const rendered = items
    .map((item, i) => `<li style="margin:0 0 ${i === last ? 0 : MAIL_SPACE.item}px;">${item}</li>`)
    .join("");
  return holdBlock(
    `<${tag} style="margin:0 0 ${MAIL_SPACE.block}px ${look.indent}px;padding:0;${BODY_TEXT_STYLE}">${rendered}</${tag}>`,
  );
}

/** A bulleted list of already-composed (and already-escaped) HTML snippets. */
export function bulletList(items: string[]): string {
  return list("ul", items);
}

/**
 * The same list with numbers instead of bullets, for a run of items whose
 * *order* is part of what they say — steps to work through, in sequence.
 *
 * Styled identically to `bulletList` down to the margins, because the two are
 * one construct with two markers: a mail carrying both would otherwise space
 * them differently for no reason a reader could name. The numbers are counted
 * from the items either way — the client's own `<ol>` numbering for plain
 * items, written out by `list` for items carrying a link — so they cannot fall
 * out of step with the items after an edit.
 */
export function numberedList(items: string[]): string {
  return list("ol", items);
}

/**
 * Bold, inline, in the body's own colour — the emphasis a sentence carries
 * inside itself.
 *
 * Weight rather than colour, for the reason `styledProductName` gives: weight
 * is the one emphasis every client renders the same way, and a colour is
 * something a dark theme feels free to rewrite.
 */
export function inlineBold(text: string): string {
  return `<strong style="color:${DARK_THEME.foreground};">${text}</strong>`;
}

/**
 * The tag handlers for `t.markup`, so a message can carry its own emphasis.
 *
 * A mail's translator is `use-intl`'s plain-string one, so it has no `t.rich`
 * to build elements with — `t.markup` is the string equivalent, and it takes a
 * handler per tag the message uses. `<b>` is the only tag a mail's copy may
 * carry: a message file is where a translator decides *which* words a sentence
 * leans on, and every other kind of markup in this directory is the builder's
 * decision rather than the sentence's.
 *
 * The app renders the same messages through `t.rich` with a real `<b>`, which
 * is what lets one string serve a page and a mail.
 */
export const MARKUP_TAGS = {
  b: (chunks: string) => inlineBold(chunks),
} as const;

/**
 * The same tags, rendering to nothing — for a plain-text twin, which states the
 * words and has no way to lean on any of them.
 */
export const PLAIN_MARKUP_TAGS = {
  b: (chunks: string) => chunks,
} as const;

/**
 * Label–value rows, ruled above and between: the one facts block every mail
 * here states its facts in.
 *
 * **It is the session report's block, promoted — the box it replaced is gone.**
 * The old shape was a bordered, rounded card of label–value rows, and on a
 * phone it spent 34px of the content column on each side — a border, a radius
 * and 16px of cell padding — before a value had any room at all. On the narrow
 * column the shell gives a phone that is most of a word a line, and what it
 * bought was an outline around facts no reader was going to mistake for
 * anything else. Open rules cost nothing, close the list just as clearly, and
 * hand the whole column back to the values.
 *
 * **Every mail takes it, the ones we send to ourselves included.** Staff read
 * mail on phones too — that is the owner's ruling and it is the whole of the
 * reason — and a second arrangement of the same five rows would be a helper
 * with a knob for each difference, kept alive for two blocks nobody ever wanted
 * to correct in opposite directions.
 *
 * The label column sizes itself: `width:1%` and no wrapping, so it is as narrow
 * as its own longest label and the values line up whatever the locale calls a
 * thing. That is also why there is no width option to pass — a caller choosing
 * one was choosing it for the English labels. Labels are small and muted, in
 * sentence case — a label is read as a word, not scanned as a marker — and the
 * value carries the line in the body. The two sizes share a baseline rather
 * than a top edge, so a label sits on the same line as the value beside it.
 *
 * **It is structural furniture**, so it states the furniture step above and
 * below itself rather than leaning on whatever the block above left. A list
 * introduced by a lead-in takes it as `leadIn`, and the pair is then the one
 * piece of furniture: the step goes above the lead-in, which sits the tight
 * step above the first rule. A `sectionLabel` set before the list instead
 * would be pushed the whole furniture step off what it introduces, since the
 * list's own margin outweighs the label's.
 *
 * **The last row keeps its rule.** With no box edge to close the list, the
 * final hairline is what closes it — and where the mail goes on to a report or
 * a section, it is what separates the two.
 *
 * **Labels and values both go in as HTML and neither is escaped here.** Labels
 * are translated copy; values are whatever the caller composed, which for
 * anything off a row means `escapeHtml` — and for an address means
 * `defuseAutolinks` over it, so a client cannot invent a link we did not write.
 * Escaping inside would double-escape every value that already needs one of
 * those treatments, so the rule is the directory's usual one: escape at the
 * value, not at the block.
 */
export function factList(
  rows: ReadonlyArray<readonly [label: string, value: string]>,
  { leadIn }: { leadIn?: string } = {},
): string {
  const rendered = rows
    .map(
      ([label, value]) => `
        <tr>
          <td valign="baseline" style="padding:${MAIL_SPACE.tight}px ${MAIL_SPACE.block}px ${MAIL_SPACE.tight}px 0;border-bottom:1px solid ${DARK_THEME.border};${mailText("small", DARK_THEME.mutedFg)}white-space:nowrap;width:1%;vertical-align:baseline;">${label}</td>
          <td valign="baseline" style="padding:${MAIL_SPACE.tight}px 0;border-bottom:1px solid ${DARK_THEME.border};${BODY_TEXT_STYLE}vertical-align:baseline;">${value}</td>
        </tr>`,
    )
    .join("");
  const table = (margin: string) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:${margin};border-top:1px solid ${DARK_THEME.border};">
      ${rendered}
    </table>`;
  // Rules, labels and values are all plain neutrals, so the block is held
  // whole — the lead-in with it, as the one piece of furniture it is.
  if (leadIn === undefined) return holdBlock(table(`${MAIL_SPACE.furniture}px 0`));
  return holdBlock(`
    <div style="margin:${MAIL_SPACE.furniture}px 0;">
      ${sectionLabelMarkup(leadIn)}${table("0")}
    </div>`);
}

function sectionLabelMarkup(text: string): string {
  return `<p style="margin:0 0 ${MAIL_SPACE.tight}px;${mailText("leadIn", DARK_THEME.foreground)}">${text}</p>`;
}

/**
 * A bold lead-in above a list or a block — a section label, not a second
 * heading. Body size at the bold weight, sitting the tight step above what it
 * introduces, so it reads as the first line of that block.
 */
export function sectionLabel(text: string): string {
  return holdBlock(sectionLabelMarkup(text));
}

/**
 * A hairline across the column, between two parts of a mail — and, followed by
 * `heading()`, the opening of a mail section.
 *
 * **It states its own space on both sides**, the furniture step, rather than
 * inheriting whatever the block above it left: a rule's job is to divide, and
 * a division that sits closer to one side than the other reads as belonging to
 * it. Where a section heading follows, the step under the rule is the space
 * above the heading; nothing stacks on top of it.
 *
 * A 1px top border on an empty cell, the line Outlook's Word engine and
 * Gmail's Android renderer both draw without argument. The cell holds a
 * non-breaking space so Outlook does not collapse it, set at no size so the
 * space takes no room.
 */
export function hairlineRule(): string {
  // Held: the border grey is a plain colour, and Gmail iOS draws it near-white.
  return holdBlock(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:${MAIL_SPACE.furniture}px 0;">
      <tr>
        <td style="border-top:1px solid ${DARK_THEME.border};font-size:0;line-height:0;">&nbsp;</td>
      </tr>
    </table>`);
}

/**
 * Someone's own words, quoted in a box a tone off the ground — the message a
 * person typed into the help form, in the staff mail that carries it.
 *
 * What the box is for is separating the reader's words from ours, which is a
 * tonal step and not a colour, so its fill is the shared `step` tone and the
 * shell restates it against the card. Its edge is a fill as well
 * (`framedCell`), because a box with a fill cannot be held and a plain border
 * grey comes back near-white on Gmail iOS; the words inside are held on their
 * own. The message goes in composed and escaped — the caller's, as everywhere
 * here.
 */
export function quotedMessage(html: string): string {
  return framedCell({
    edge: DARK_THEME.border,
    radius: RADIUS.lg,
    ground: "step",
    tableAttrs: 'width="100%"',
    tableStyle: "",
    cellStyle: `padding:${MAIL_SPACE.block}px;${BODY_TEXT_STYLE}`,
    content: holdBlock(html),
  });
}

/**
 * A line of small print under the block it qualifies — a staff-facing note,
 * set at the small level in the muted ink, the block step above it.
 */
export function smallNote(text: string): string {
  return holdText(
    (inner) => `<p style="margin:${MAIL_SPACE.block}px 0 0;${mailText("small", DARK_THEME.mutedFg)}">${inner}</p>`,
    text,
  );
}

interface CalloutPanelOptions {
  /** Already-translated. The panel sets it small, bold and uppercase. */
  label: string;
  /** Already-translated (and already-escaped) paragraphs, in reading order. */
  paragraphs: string[];
  /**
   * The panel opens the mail: it sits flush with the top of the content and
   * states the furniture step below itself only. The first block of a mail has
   * nothing above it to be set apart from, and a gap there is the shell's
   * padding doubled.
   */
  opening?: boolean;
}

/**
 * A panel set apart from the mail's own prose, for one of two things. An aside
 * about the mail itself, which goes at the top because it changes how everything
 * under it is read — today, the session report's staff copy saying that it *is*
 * a copy and that each family's mail was its own. Or the one fact in a mail the
 * reader must not miss because it stops being true, which goes beside whatever
 * it bounds — today, the seat offer's deadline to answer by, under the question
 * and above the answers.
 *
 * **It is the app's `Alert`, in its `info` variant, in an inbox.** A mail
 * inherits rather than being styled, so the shape comes from the component the
 * app already uses for exactly this: `rounded-lg`, a 1px border, the
 * ground it is already on, the label in the status colour and the sentences in
 * ink. No status colour is tinted anywhere — info is Wit's blue, and a brand
 * colour exists at the value it is authored at or not at all — so the wash and
 * its half-alpha edge are both gone, and with them the composited pair they
 * needed. The version before that was a 3px brand-orange rule down one edge,
 * which is a treatment that exists nowhere in the app and read as a warning
 * besides — the act is the colour that means *ours*, not *careful*.
 *
 * **The border carries the status, at full value.** The app's alerts do the
 * same thing and for the same reason: with no tinted ground left, an edge in
 * the status hue is what brings the eye to a panel whose whole job is to be
 * noticed, and an edge is one of the roles a brand colour may take. It is drawn
 * as a fill (`framedCell`) rather than as a `border`: a status colour cannot
 * be held, and a plain border colour drifts on Gmail iOS. The label is pinned
 * in the same status colour for the same reason, and the sentences, which are
 * plain ink, are held.
 *
 * **The label takes the colour and the sentences stay ink.** That is the app's
 * rule for this construct — coloured ink only on a label, never on something a
 * reader reads through — and here it is also a contrast fact: on the message
 * panel the info blue measures 7.53:1 as text, well clear of the body floor,
 * where on the wash it used to sit at 4.46:1 and could not be spent at all. The
 * app puts a glyph beside that label; a mail has no icon system to draw one
 * with, so the label carries the tone alone. `palette-contrast.test.ts` pins
 * the label on both grounds the shell can put the panel on — the message panel
 * and the bare ground a phone shows — and the paragraphs' ink through its
 * ordinary body-text rows. It also measures the info fill under its own
 * foreground, but that pair is the components reference's swatch: this panel
 * has no fill for it to describe.
 *
 * The paragraphs carry equal weight rather than the second being muted: in a
 * callout the later sentence is usually the one that answers the actual worry,
 * and greying it would quiet exactly the line the panel exists to say.
 */
export function calloutPanel({ label, paragraphs, opening = false }: CalloutPanelOptions): string {
  const last = paragraphs.length - 1;
  const body = paragraphs
    .map((text, i) =>
      holdText(
        (inner) =>
          `<p style="margin:0 0 ${i === last ? 0 : MAIL_SPACE.block}px;${BODY_TEXT_STYLE}">${inner}</p>`,
        text,
      ),
    )
    .join("");
  return `
    ${framedCell({
      edge: STATUS.info,
      radius: RADIUS.lg,
      ground: "match",
      tableAttrs: 'width="100%"',
      tableStyle: `margin:${opening ? `0 0 ${MAIL_SPACE.furniture}px` : `${MAIL_SPACE.furniture}px 0`};`,
      cellStyle: `padding:${MAIL_SPACE.block}px;`,
      content: `<p class="${TEXT_PINS.info.className}" style="margin:0 0 ${MAIL_SPACE.tight}px;${mailText("small", STATUS.info, MAIL_WEIGHT.bold)}letter-spacing:0.5px;text-transform:uppercase;">${label}</p>
          ${body}`,
    })}`;
}
