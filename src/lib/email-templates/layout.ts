import { BRAND, DARK_THEME, GRADIENT } from "@/lib/constants/colors";
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
    .brand-secondary { color: ${BRAND.secondary} !important; }
    /* Gmail-only: color text via gradient + background-clip instead of the "color" property,
       because Gmail Android dark mode shifts "color" values but preserves gradient values.
       "u + .body" only matches Gmail's rendering wrapper. Outlook doesn't support
       background-clip:text at all, so it must stay Gmail-targeted. */
    u + .body .brand-primary {
      background-image: linear-gradient(${BRAND.primary}, ${BRAND.primary}) !important;
      -webkit-background-clip: text !important;
      background-clip: text !important;
      color: transparent !important;
    }
    u + .body .brand-secondary {
      background-image: linear-gradient(${BRAND.secondary}, ${BRAND.secondary}) !important;
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
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span style="font-size:28px;font-weight:bold;color:${BRAND.primary};letter-spacing:1px;">SOG</span><span style="font-size:28px;font-weight:bold;color:${DARK_THEME.foreground};letter-spacing:1px;">verse</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:${DARK_THEME.card};border:1px solid ${DARK_THEME.border};border-radius:12px;padding:32px;">
              <div style="color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;">
                ${content}
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;color:${DARK_THEME.footerText};font-size:12px;">
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
