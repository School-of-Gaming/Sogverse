import { BRAND, DARK_THEME } from "@/lib/constants/colors";

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
   * `primary` fills the brand color; `secondary` is outlined. A mail with two
   * buttons has one action it is actually asking for, and two filled buttons
   * side by side say the opposite.
   */
  variant?: CtaVariant;
}

/**
 * A centred call-to-action button. Nested tables rather than a styled anchor,
 * because that is the shape Outlook renders as a button.
 */
export function ctaButton({ href, label, variant = "primary" }: CtaButtonOptions): string {
  const isPrimary = variant === "primary";
  const cellStyle = isPrimary
    ? `background-color:${BRAND.primary};border-radius:8px;`
    : `border:1px solid ${DARK_THEME.border};border-radius:8px;`;
  const labelColor = isPrimary ? DARK_THEME.bg : DARK_THEME.foreground;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="${cellStyle}">
                <a href="${href}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:bold;color:${labelColor};text-decoration:none;">
                  ${label}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

/** An inline link. `href` is app-generated; `label` is translated copy. */
export function inlineLink(href: string, label: string): string {
  return `<a href="${href}" target="_blank" style="color:${BRAND.primary};text-decoration:underline;">${label}</a>`;
}

/** A bulleted list of already-composed (and already-escaped) HTML snippets. */
export function bulletList(items: string[]): string {
  const rendered = items
    .map((item) => `<li style="margin:0 0 8px;">${item}</li>`)
    .join("");
  return `<ul style="margin:0 0 16px;padding-left:20px;color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;">${rendered}</ul>`;
}

/** A bold lead-in above a list — a section label, not a second heading. */
export function sectionLabel(text: string): string {
  return `<p style="margin:0 0 8px;color:${DARK_THEME.foreground};font-size:14px;font-weight:bold;line-height:1.6;">${text}</p>`;
}
