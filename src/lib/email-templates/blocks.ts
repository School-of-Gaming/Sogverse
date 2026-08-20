import { BRAND, DARK_THEME } from "@/lib/constants/colors";
import { BODY_TEXT_STYLE } from "./utils";

/**
 * Content blocks the link-carrying templates share: buttons, bulleted steps and
 * inline links. `utils.ts` holds the pieces every template uses (escaping, a
 * paragraph, a styled name); these are the ones that only appear in a mail that
 * asks the reader to go somewhere.
 *
 * **Every `href` here is embedded unescaped, by design** — the same exception
 * the password-reset builder documents. Callers pass app-generated URLs
 * (verification links, My SOG, the shop) and nothing else. A value a user can
 * influence must never reach one of these.
 */

type CtaVariant = "primary" | "secondary";

interface CtaButtonOptions {
  /** App-generated URL. Embedded unescaped — see the note above. */
  href: string;
  /** Already-translated label. */
  label: string;
  /**
   * `primary` fills the brand color; `secondary` is outlined. However many
   * buttons a mail carries, exactly one of them is the action it is actually
   * asking for — a second filled button says the opposite.
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
 * The button's look, in one place, so a half-width one is the same button.
 *
 * The label carries a class as well as its inline colour: `cta-on-brand` for
 * the dark label on the brand fill, `cta-on-card` for the light label on the
 * outlined button. Gmail's dark-theme rewriting flips a label's `color` by
 * luminance — a dark label goes light and lands on the orange unreadable, and
 * which way it flips depends on the reader's theme, so the same button reads
 * black in one inbox and white in the next. The layout's `<style>` block pins
 * each class to its colour through the Gmail-only `background-clip:text` rule
 * (the same mechanism that keeps the header lockup brand-coloured), because
 * Gmail rewrites `color` but leaves gradients alone. Every other client reads
 * the inline colour. Keep the two class names in step with `layout.ts`.
 */
function buttonStyles(variant: CtaVariant, width: CtaWidth) {
  const isPrimary = variant === "primary";
  const isHalf = width === "half";
  return {
    surface: isPrimary
      ? `background-color:${BRAND.primary};border-radius:8px;`
      : `border:1px solid ${DARK_THEME.border};border-radius:8px;`,
    labelClass: isPrimary ? "cta-on-brand" : "cta-on-card",
    label: `display:${isHalf ? "block" : "inline-block"};padding:12px ${isHalf ? "8px" : "32px"};font-size:14px;font-weight:bold;color:${isPrimary ? DARK_THEME.bg : DARK_THEME.foreground};text-decoration:none;`,
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
                <a href="${href}" target="_blank" class="${labelClass}" style="${labelStyle}">
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
export function ctaButtonRow(left: CtaButtonOptions, right: CtaButtonOptions): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="8" width="100%" style="margin:0 0 16px;">
      <tr>
        ${halfButtonCell(left)}
        ${halfButtonCell(right)}
      </tr>
    </table>`;
}

/** One half of a `ctaButtonRow`: the row's own cell, painted as the button. */
function halfButtonCell({ href, label, variant = "primary" }: CtaButtonOptions): string {
  const { surface, labelClass, label: labelStyle } = buttonStyles(variant, "half");
  return `<td width="50%" align="center" valign="middle" style="${surface}">
          <a href="${href}" target="_blank" class="${labelClass}" style="${labelStyle}">${label}</a>
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
  return `<a href="${href}" target="_blank" style="color:${BRAND.primary};text-decoration:underline;">${label}</a>`;
}

/** A bulleted list of already-composed (and already-escaped) HTML snippets. */
export function bulletList(items: string[]): string {
  const rendered = items
    .map((item) => `<li style="margin:0 0 8px;">${item}</li>`)
    .join("");
  return `<ul style="margin:0 0 16px;padding-left:20px;${BODY_TEXT_STYLE}">${rendered}</ul>`;
}

/** A bold lead-in above a list — a section label, not a second heading. */
export function sectionLabel(text: string): string {
  return `<p style="margin:0 0 8px;color:${DARK_THEME.foreground};font-size:14px;font-weight:bold;line-height:1.6;">${text}</p>`;
}
