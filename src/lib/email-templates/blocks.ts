import { BRAND, DARK_THEME, STATUS } from "@/lib/constants/colors";
import { RADIUS } from "@/lib/constants/radius";
import { BODY_TEXT_STYLE, groundFill, pinnedFill } from "./utils";

/**
 * The composed blocks a template reaches for rather than builds. `utils.ts`
 * holds the pieces every template uses (escaping, a paragraph, a styled name);
 * these are the larger shapes: the buttons and links a mail that sends the
 * reader somewhere needs, and the callout panel a mail that has something to say
 * about *itself* opens with.
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
   * is the card colour behind a border. However many buttons a mail carries,
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

/** A row half: never `primary`, so a row cannot hold two filled brand buttons. */
interface RowButtonOptions extends CtaButtonOptions {
  variant: Exclude<CtaVariant, "primary">;
}


/**
 * The button's look, in one place, so a half-width one is the same button.
 *
 * **Every button declares a background, and the outlined one declares the
 * ground it is standing on rather than nothing.** In a client that renders the
 * mail as written the declaration changes nothing — its whole job is to tell
 * Gmail's dark theme that this region was designed.
 *
 * *Which* colour that is depends on where the shell has put the button, which
 * is why the outlined variant takes the shared "matches the ground" tone rather
 * than naming a value: on a phone the content sits straight on the dark ground
 * and the button declares that, and above the shell's breakpoint the same
 * button is inside the card and declares the card. It used to name the card
 * unconditionally, under a comment saying that was the colour behind it — true
 * while the card was the only ground a mail had, and false on a phone from the
 * moment the shell went card-less.
 * Gmail runs a contrast pass over regions whose background it cannot read off a
 * declaration: it lightens the undeclared region, then, finding light where it
 * has just put light, darkens the text on it. That is how an outlined button
 * ends up with a near-black label on a slightly-off surface while the filled
 * button beside it is untouched — the filled one always declared its orange.
 * A label pin cannot reach this on its own, because the surface Gmail recolours
 * is the cell, not the anchor the pin is on.
 *
 * **Only the dark label is pinned, and that asymmetry is the whole lesson.**
 * `cta-on-brand` carries the near-black label on the brand fill through the
 * Gmail-only `background-clip:text` rule in `layout.ts`, which fixed a real
 * fault: that label used to arrive white in one inbox and black in the next.
 * The light label on the outlined button carries no class and needs none — its
 * inline colour arrives intact on its own.
 *
 * It did not always. It used to carry a `cta-on-card` pin built the same way,
 * and **the pin was what broke it.** `background-clip:text` works by restating
 * a text colour as a *background* colour, and a client's dark theme leaves dark
 * backgrounds alone while darkening light ones — that is the one thing dark
 * mode is for. So the same mechanism that protects `#121212` destroys
 * `#ededed`: the pin hands a near-white value to precisely the pass that exists
 * to darken near-white values, and the label arrives dark. Measured against
 * the client rather than reasoned about: the same colour pinned three
 * different ways came back wrong every time, and unpinned came back right.
 * That is why the rule below is about luminance rather than about which
 * element is being styled.
 *
 * **Rule: never pin a light colour through `background-clip:text`.** The pin is
 * safe only for a colour dark enough that a client's dark theme would not
 * touch it as a background — the brand fill's near-black label, the brand
 * orange in the header. For anything lighter, the inline colour is both the
 * simplest answer and the one that survives; adding protection makes it worse.
 */
/**
 * The outlined button's fill, which is the ground rather than a colour of its
 * own — so it comes from the one table in `utils.ts` that every ground-following
 * surface in this directory takes both of its halves from, and the shell's own
 * media query restates it against the card.
 */
const OUTLINE_GROUND = groundFill("match");

const VARIANTS = {
  primary: {
    fill: pinnedFill(BRAND.act),
    surfaceClass: "",
    label: BRAND.actForeground,
    bordered: false,
    // The only label dark enough for the pin to help rather than hurt.
    labelClass: "cta-on-brand",
  },
  secondary: {
    fill: pinnedFill(BRAND.world),
    surfaceClass: "",
    label: BRAND.worldForeground,
    bordered: false,
    labelClass: "",
  },
  outline: {
    fill: OUTLINE_GROUND.fill,
    surfaceClass: OUTLINE_GROUND.className,
    label: DARK_THEME.foreground,
    bordered: true,
    labelClass: "",
  },
} as const;

function buttonStyles(variant: CtaVariant, width: CtaWidth) {
  const { fill, surfaceClass, label, bordered, labelClass } = VARIANTS[variant];
  const isHalf = width === "half";
  return {
    surface: [
      fill,
      bordered ? `border:1px solid ${DARK_THEME.border};` : "",
      `border-radius:${RADIUS.md};`,
    ].join(""),
    surfaceClass,
    labelClass,
    label: `display:${isHalf ? "block" : "inline-block"};padding:12px ${isHalf ? "8px" : "32px"};font-size:14px;font-weight:bold;color:${label};text-decoration:none;`,
  };
}

/**
 * A centred call-to-action button. Nested tables rather than a styled anchor,
 * because that is the shape Outlook renders as a button.
 */
export function ctaButton({ href, label, variant = "primary" }: CtaButtonOptions): string {
  const { surface, surfaceClass, labelClass, label: labelStyle } = buttonStyles(
    variant,
    "auto",
  );
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center"${surfaceClass ? ` class="${surfaceClass}"` : ""} style="${surface}">
                <a href="${href}" target="_blank"${labelClass ? ` class="${labelClass}"` : ""} style="${labelStyle}">
                  ${label}
                </a>
              </td>
            </tr>
          </table>
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
 * - The buttons are the row's own cells, not nested tables inside them, which is
 *   what keeps a wrapped label from making one button taller than its
 *   neighbour: cells in a table row are the height of the row, so the surface
 *   paints to the same height on both sides and the labels sit centred in it.
 * - `cellspacing` is the gutter, because it is the one gap Outlook has never
 *   argued with.
 */
export function ctaButtonRow(left: RowButtonOptions, right: RowButtonOptions): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="8" width="100%" style="margin:0 0 16px;">
      <tr>
        ${halfButtonCell(left)}
        ${halfButtonCell(right)}
      </tr>
    </table>`;
}

/** One half of a `ctaButtonRow`: the row's own cell, painted as the button. */
/**
 * One half of a `ctaButtonRow`.
 *
 * The variant is narrowed rather than defaulted: a row is for two alternatives,
 * so two filled brand buttons is the one arrangement it must not be able to
 * make, and it used to be the arrangement you got by leaving the argument out.
 * A shape forbidden in prose and reachable by omission is not forbidden.
 */
function halfButtonCell({ href, label, variant }: RowButtonOptions): string {
  const { surface, surfaceClass, labelClass, label: labelStyle } = buttonStyles(
    variant,
    "half",
  );
  return `<td width="50%"${surfaceClass ? ` class="${surfaceClass}"` : ""} align="center" valign="middle" style="${surface}">
          <a href="${href}" target="_blank"${labelClass ? ` class="${labelClass}"` : ""} style="${labelStyle}">${label}</a>
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
  // Deliberately unpinned, unlike styledName, which paints the same colour.
  // The pin works by setting `color: transparent` and painting the glyphs out of a
  // background — and `text-decoration-color` defaults to `currentColor`, so a
  // pinned anchor keeps its colour and loses its underline. A span has no
  // decoration to lose, which is why the same class is right on a name and
  // wrong here. The underline is the affordance that says "link", so it
  // outranks matching the name's orange exactly; that mismatch is real, and it
  // is the cheaper of the two faults until a screenshot settles a fix for it.
  return `<a href="${href}" target="_blank" style="color:${BRAND.act};text-decoration:underline;">${label}</a>`;
}

/** A bulleted list of already-composed (and already-escaped) HTML snippets. */
export function bulletList(items: string[]): string {
  const rendered = items
    .map((item) => `<li style="margin:0 0 8px;">${item}</li>`)
    .join("");
  return `<ul style="margin:0 0 16px;padding-left:20px;${BODY_TEXT_STYLE}">${rendered}</ul>`;
}

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
 * one was choosing it for the English labels. Labels are small, muted and
 * tracked, which is furniture rather than voice; the value carries the line.
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
): string {
  const rendered = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 16px 8px 0;border-bottom:1px solid ${DARK_THEME.border};color:${DARK_THEME.mutedFg};font-size:12px;letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap;width:1%;vertical-align:top;">${label}</td>
          <td style="padding:8px 0;border-bottom:1px solid ${DARK_THEME.border};color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;">${value}</td>
        </tr>`,
    )
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid ${DARK_THEME.border};">
      ${rendered}
    </table>`;
}

/** A bold lead-in above a list — a section label, not a second heading. */
export function sectionLabel(text: string): string {
  return `<p style="margin:0 0 8px;color:${DARK_THEME.foreground};font-size:14px;font-weight:bold;line-height:1.6;">${text}</p>`;
}

interface CalloutPanelOptions {
  /** Already-translated. The panel sets it small, bold and uppercase. */
  label: string;
  /** Already-translated (and already-escaped) paragraphs, in reading order. */
  paragraphs: string[];
}

/**
 * A panel above the mail's own opening, for something the reader has to be told
 * about the mail rather than in it — today, the session report's staff copy
 * saying that it *is* a copy and that each family's mail was its own.
 *
 * **It is the app's `Alert`, in its `info` variant, in an inbox.** A mail
 * inherits rather than being styled, so the shape comes from the component the
 * app already uses for exactly this: `rounded-lg`, a neutral 1px border, the
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
 * noticed, and an edge is one of the roles a brand colour may take. It stays a
 * 1px solid line on the cell — the most robust border email has, and the one
 * construct Outlook's Word engine and Gmail's Android renderer both draw
 * without argument — so what changed is one colour and nothing about the
 * markup.
 *
 * **The label takes the colour and the sentences stay ink.** That is the app's
 * rule for this construct — coloured ink only on a label, never on something a
 * reader reads through — and here it is also a contrast fact: on the message
 * panel the info blue measures 7.53:1 as text, well clear of the body floor,
 * where on the wash it used to sit at 4.46:1 and could not be spent at all. The
 * app puts a glyph beside that label; a mail has no icon system to draw one
 * with, so the label carries the tone alone. Both pairings are pinned in
 * `palette-contrast.test.ts`.
 *
 * The paragraphs carry equal weight rather than the second being muted: in a
 * callout the later sentence is usually the one that answers the actual worry,
 * and greying it would quiet exactly the line the panel exists to say.
 */
export function calloutPanel({ label, paragraphs }: CalloutPanelOptions): string {
  const last = paragraphs.length - 1;
  const body = paragraphs
    .map(
      (text, i) =>
        `<p style="margin:${i === last ? "0" : "0 0 8px"};${BODY_TEXT_STYLE}">${text}</p>`,
    )
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="border:1px solid ${STATUS.info};border-radius:${RADIUS.lg};padding:16px;">
          <p style="margin:0 0 8px;color:${STATUS.info};font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;">${label}</p>
          ${body}
        </td>
      </tr>
    </table>`;
}
