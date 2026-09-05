import { BRAND, DARK_THEME, STATUS_TINT } from "@/lib/constants/colors";
import { RADIUS } from "@/lib/constants/radius";
import { BODY_TEXT_STYLE, pinnedFill } from "./utils";

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
 * The same goes for the composed HTML the layout blocks take — a `factTable`
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
 * **Every button declares a background, and the outlined one declares the card
 * colour rather than nothing.** It is the same colour as what sits behind it, so
 * in a client that renders the mail as written the declaration changes nothing
 * — its whole job is to tell Gmail's dark theme that this region was designed.
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
const VARIANTS = {
  primary: {
    fill: BRAND.act,
    label: BRAND.actForeground,
    bordered: false,
    // The only label dark enough for the pin to help rather than hurt.
    labelClass: "cta-on-brand",
  },
  secondary: {
    fill: BRAND.world,
    label: BRAND.worldForeground,
    bordered: false,
    labelClass: "",
  },
  outline: {
    fill: DARK_THEME.card,
    label: DARK_THEME.foreground,
    bordered: true,
    labelClass: "",
  },
} as const;

function buttonStyles(variant: CtaVariant, width: CtaWidth) {
  const { fill, label, bordered, labelClass } = VARIANTS[variant];
  const isHalf = width === "half";
  return {
    surface: [
      pinnedFill(fill),
      bordered ? `border:1px solid ${DARK_THEME.border};` : "",
      `border-radius:${RADIUS.md};`,
    ].join(""),
    labelClass,
    label: `display:${isHalf ? "block" : "inline-block"};padding:12px ${isHalf ? "8px" : "32px"};font-size:14px;font-weight:bold;color:${label};text-decoration:none;`,
  };
}

/**
 * A centred call-to-action button. Nested tables rather than a styled anchor,
 * because that is the shape Outlook renders as a button.
 */
export function ctaButton({ href, label, variant = "primary" }: CtaButtonOptions): string {
  const { surface, labelClass, label: labelStyle } = buttonStyles(variant, "auto");
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="${surface}">
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
 * end is genuinely narrow — a 320px client leaves the card about 216px of
 * content, so each half is around 96px. That is what sets the terms here:
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
  const { surface, labelClass, label: labelStyle } = buttonStyles(variant, "half");
  return `<td width="50%" align="center" valign="middle" style="${surface}">
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

interface FactTableOptions {
  /**
   * How much room the label column takes. It is a hint rather than a rule —
   * table layout will widen it for a label that does not fit — so pick the
   * width the longest label wants and let the values line up against it.
   */
  labelWidth?: string;
}

/**
 * Label–value rows in a bordered, rounded box.
 *
 * **It is the shape every mail we send to *ourselves* uses**: a handful of
 * facts about one case, stated before the mail asks for the next step, in a box
 * a staff reader can find at a glance without reading a sentence. The feedback
 * mail and both flavours of the seat-offer staff mail are the same table, and
 * they were three hand-rolled copies of it until this helper existed — which is
 * the shape of the worst bug this directory has had. A copy cannot inherit
 * tomorrow's correction; prefer a helper over its output.
 *
 * **The last row carries no rule, and that is the canonical behaviour.** The
 * box's own border already closes the list, so a final `border-bottom` sits a
 * pixel inside it and reads as a rendering fault rather than as a divider.
 *
 * **Labels and values both go in as HTML and neither is escaped here.** Labels
 * are translated copy; values are whatever the caller composed, which for
 * anything off a row means `escapeHtml` — and for an address means
 * `defuseAutolinks` over it, so a client cannot invent a link we did not write.
 * Escaping inside would double-escape every value that already needs one of
 * those treatments, so the rule is the directory's usual one: escape at the
 * value, not at the block.
 */
export function factTable(
  rows: ReadonlyArray<readonly [label: string, value: string]>,
  { labelWidth = "140px" }: FactTableOptions = {},
): string {
  const last = rows.length - 1;
  const rendered = rows
    .map(([label, value], index) => {
      const rule =
        index === last ? "" : `border-bottom:1px solid ${DARK_THEME.border};`;
      return `
            <tr>
              <td style="padding:12px 16px;color:${DARK_THEME.mutedFg};font-size:13px;${rule}width:${labelWidth};">${label}</td>
              <td style="padding:12px 16px;color:${DARK_THEME.foreground};font-size:14px;${rule}">${value}</td>
            </tr>`;
    })
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid ${DARK_THEME.border};border-radius:${RADIUS.lg};">
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
 * app already uses for exactly this: `rounded-lg`, a full 1px border in the info
 * colour at half alpha, a wash of the same colour at a tenth. Email cannot rely
 * on alpha, so both arrive here as flat values composited over the message panel
 * (`STATUS_TINT`, in `colors.ts`, with the derivation beside them). The earlier
 * version of this panel was a 3px brand-orange rule down one edge, which is a
 * treatment that exists nowhere in the app and read as a warning besides — the
 * act is the colour that means *ours*, not *careful*.
 *
 * **The border is what draws the panel, and it is allowed to be quiet.** At
 * 2.18:1 against the card it would not carry a control boundary on its own, and
 * it is not asked to: everything the panel means is in its label and its
 * sentences. The wash is a tint rather than a divider — 1.12:1 on the card —
 * and that is the app's own balance for this component, not a concession made
 * for mail.
 *
 * **The text on it is the body's colour, and that is a contrast fact.** The
 * app's `Alert` colours its title with the accent, and the mail cannot: the info
 * blue on this wash is 4.46:1, just under AA, and a label this size gets no
 * large-text exemption. So the label and the paragraphs are `foreground`
 * (13.24:1) — checked before fidelity, as this directory's rule says, and pinned
 * in `palette-contrast.test.ts` both ways round.
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
        <td style="${pinnedFill(STATUS_TINT.infoSurface)}border:1px solid ${STATUS_TINT.infoBorder};border-radius:${RADIUS.lg};padding:16px;">
          <p style="margin:0 0 8px;color:${DARK_THEME.foreground};font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;">${label}</p>
          ${body}
        </td>
      </tr>
    </table>`;
}
