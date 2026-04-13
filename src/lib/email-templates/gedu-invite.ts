import { BRAND, DARK_THEME } from "@/lib/constants/colors";
import { wrapInLayout } from "./layout";
import { heading, paragraph } from "./utils";
import type { EmailTranslator } from "./translator";

/**
 * Builds the HTML email body for a gedu account invitation.
 */
export function buildGeduInviteEmail(t: EmailTranslator, setupLink: string, locale: string): string {
  const content = `
    ${heading(t("geduInvite.heading"))}
    ${paragraph(t.markup("geduInvite.body", { strong: (chunks) => `<strong class="brand-primary" style="color:${BRAND.primary};">${chunks}</strong>` }))}
    ${paragraph(t("geduInvite.expiry"))}
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="background-color:${BRAND.primary};border-radius:8px;">
                <!-- setupLink is a Supabase-generated URL, safe to embed unescaped -->
                <a href="${setupLink}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:bold;color:${DARK_THEME.bg};text-decoration:none;">
                  ${t("geduInvite.button")}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  return wrapInLayout({ title: t("geduInvite.heading"), content, locale, t });
}
