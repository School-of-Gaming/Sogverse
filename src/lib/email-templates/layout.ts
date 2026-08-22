import { BRAND, DARK_THEME, GRADIENT } from "@/lib/constants/colors";
import { BRAND_LOCKUP_TAIL, SENDER_NAME } from "@/lib/constants";
import { RADIUS } from "@/lib/constants/radius";
import { pinnedFill } from "./utils";
import type { EmailTranslator } from "./translator";

interface LayoutOptions {
  title: string;
  content: string;
  locale?: string;
  t?: EmailTranslator;
}

/** Hero gradient: vertical fade over a horizontal brand-color glow. */
const HERO_GRADIENT = `linear-gradient(to bottom, transparent 0%, ${DARK_THEME.bg} 70%), linear-gradient(to right, ${GRADIENT.primaryGlow}, ${DARK_THEME.bg} 50%, ${GRADIENT.secondaryGlow})`;

/**
 * Wraps email content in a branded dark-theme layout.
 * Table-based with all inline CSS for email client compatibility.
 *
 * Gmail Android quirks addressed in the <style> block:
 * - Gradient is class-based because Gmail Android rewrites inline linear-gradient()
 *   into url(linear-gradient(...)) which breaks it.
 * - Brand text colors use background-clip:text (via "u + .body" Gmail-only selector)
 *   because Gmail Android dark mode shifts the "color" property but preserves gradients.
 */
export function wrapInLayout({ title, content, locale = "en", t }: LayoutOptions): string {
  const footerText = t
    ? t("footer", { year: String(new Date().getFullYear()) })
    : `\u00a9 ${new Date().getFullYear()} Sogverse. All rights reserved.`;
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!-- Tell email clients this is already dark-themed so they skip dark mode color adjustments -->
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${title}</title>
  <style>
    .hero-gradient {
      background-image: ${HERO_GRADIENT} !important;
    }
    .brand-primary { color: ${BRAND.primary} !important; }
    /* Gmail-only: color text via gradient + background-clip instead of the "color" property,
       because Gmail Android dark mode shifts "color" values but preserves gradient values.
       "u + .body" only matches Gmail's rendering wrapper. Outlook doesn't support
       background-clip:text at all, so it must stay Gmail-targeted.

       Only the primary has a rule: the brand secondary was retired from inline text
       because Gmail's rewriting left it unreadable, so no builder emits a secondary
       brand class any more and a rule for one would be dead weight. */
    u + .body .brand-primary {
      background-image: linear-gradient(${BRAND.primary}, ${BRAND.primary}) !important;
      -webkit-background-clip: text !important;
      background-clip: text !important;
      color: transparent !important;
    }
    /* Button labels, same mechanism. Gmail flips a label's "color" by luminance
       and by the reader's theme, so the dark label on the brand fill came back
       white in some inboxes and black in others. Pinning it through a gradient
       gives one answer everywhere Gmail renders. The class names are emitted by
       blocks.ts — keep them in step.

       Only the dark label is pinned, and only because it is dark. There was a
       matching rule for the outlined button's near-white label; it was the
       cause of that button's bug, not its cure. background-clip:text restates a
       text colour as a background colour, and a dark theme darkens light
       backgrounds — so pinning the body foreground fed it to the exact pass
       that darkens near-white. Measured against a client, not reasoned. Never
       add a rule here for a colour a dark theme would lighten or darken as a
       background; those colours are already safe inline, and the pinned ones
       are listed with their evidence in the house-style test. */
    u + .body .cta-on-brand {
      background-image: linear-gradient(${DARK_THEME.bg}, ${DARK_THEME.bg}) !important;
      -webkit-background-clip: text !important;
      background-clip: text !important;
      color: transparent !important;
    }
  </style>
</head>
<!-- "body" class is required for the "u + .body" Gmail-only selector in the style block above -->
<body class="body hero-gradient" style="margin:0;padding:0;background-color:${DARK_THEME.bg};font-family:Arial,Helvetica,sans-serif;">
  <!-- Gradient class on both body and table: body for clients that respect it, table for Gmail which strips body styles -->
  <table role="presentation" class="hero-gradient" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DARK_THEME.bg};">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- Lockup: brand first, platform second, spaced en dash between them.
               "brand-primary" is what puts the brand half through the Gmail
               background-clip rule above — this header is one of the two places
               brand color still survives Gmail's dark-theme rewriting (the other
               is a button fill), so it is the one place the full lockup is set.

               The two halves are two spans because they are two colours, which
               is why this is the one site that builds the lockup up from its
               parts instead of emitting BRAND_LOCKUP whole. Both halves still
               come from the constants module — no character of the lockup, and
               above all not the en dash, is typed here — and a unit test
               asserts the two spans still read as BRAND_LOCKUP exactly. -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span class="brand-primary" style="font-size:24px;font-weight:bold;color:${BRAND.primary};letter-spacing:0.5px;">${SENDER_NAME}</span><span style="font-size:24px;font-weight:bold;color:${DARK_THEME.foreground};letter-spacing:0.5px;">${BRAND_LOCKUP_TAIL}</span>
            </td>
          </tr>
          <!-- The message panel: the app's Card, rendered in a table cell. It
               takes the same three tokens the component does — the card fill,
               the border, and rounded-lg — because a parent meets this surface
               on the site before they meet it in their inbox. It sat at 12px
               for a while, which is a step the app uses twice and never on a
               card; that is what a literal drifting unnoticed looks like. -->
          <tr>
            <td style="${pinnedFill(DARK_THEME.card)}border:1px solid ${DARK_THEME.border};border-radius:${RADIUS.lg};padding:32px;">
              <div style="color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;">
                ${content}
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;color:${DARK_THEME.mutedFg};font-size:12px;">
              ${footerText}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
