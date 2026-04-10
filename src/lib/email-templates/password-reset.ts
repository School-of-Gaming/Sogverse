import { BRAND, DARK_THEME } from "@/lib/constants/colors";
import { wrapInLayout } from "./layout";
import { heading, paragraph } from "./utils";
import type { EmailTranslator } from "./translator";

/**
 * Builds the HTML email body for a password reset request.
 */
export function buildPasswordResetEmail(t: EmailTranslator, resetLink: string, locale: string): string {
  const content = `
    ${heading(t("passwordReset.heading"))}
    ${paragraph(t("passwordReset.body"))}
    ${paragraph(t("passwordReset.expiry"))}
    ${paragraph(t("passwordReset.ignore"))}
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="background-color:${BRAND.primary};border-radius:8px;">
                <a href="${resetLink}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:bold;color:${DARK_THEME.bg};text-decoration:none;">
                  ${t("passwordReset.button")}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  return wrapInLayout({ title: t("passwordReset.heading"), content, locale, t });
}
