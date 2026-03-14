import { BRAND, DARK_THEME } from "@/lib/constants/colors";
import { wrapInLayout } from "./layout";
import { heading, paragraph } from "./utils";

/**
 * Builds the HTML email body for a gedu account invitation.
 */
export function buildGeduInviteEmail(setupLink: string): string {
  const content = `
    ${heading("Welcome to The Sogverse")}
    ${paragraph(`You\u2019ve been invited to join The Sogverse as a <strong class="brand-primary" style="color:${BRAND.primary};">Gedu</strong>. Click the button below to set up your account.`)}
    ${paragraph("This link will expire in 1 hour.")}
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="background-color:${BRAND.primary};border-radius:8px;">
                <a href="${setupLink}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:bold;color:${DARK_THEME.bg};text-decoration:none;">
                  Set Up Your Account
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  return wrapInLayout({ title: "Welcome to The Sogverse", content });
}
