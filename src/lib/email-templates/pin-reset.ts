import { BRAND, DARK_THEME } from "@/lib/constants/colors";
import { wrapInLayout } from "./layout";
import { heading, paragraph } from "./utils";
import type { EmailTranslator } from "./translator";

/**
 * Builds the HTML email body for a parent-PIN reset request. Mirrors the
 * password-reset email; the link carries a standalone signed token (not a
 * Supabase recovery link) handled by /reset-pin → /api/auth/pin/reset.
 */
export function buildPinResetEmail(t: EmailTranslator, resetLink: string, locale: string): string {
  const content = `
    ${heading(t("pinReset.heading"))}
    ${paragraph(t("pinReset.body"))}
    ${paragraph(t("pinReset.expiry"))}
    ${paragraph(t("pinReset.ignore"))}
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="background-color:${BRAND.primary};border-radius:8px;">
                <!-- resetLink is an app-generated URL, safe to embed unescaped -->
                <a href="${resetLink}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:bold;color:${DARK_THEME.bg};text-decoration:none;">
                  ${t("pinReset.button")}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  return wrapInLayout({ title: t("pinReset.heading"), content, locale, t });
}
