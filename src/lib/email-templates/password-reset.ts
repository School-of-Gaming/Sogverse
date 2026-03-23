import { BRAND, DARK_THEME } from "@/lib/constants/colors";
import { wrapInLayout } from "./layout";
import { heading, paragraph } from "./utils";

/**
 * Builds the HTML email body for a password reset request.
 */
export function buildPasswordResetEmail(resetLink: string): string {
  const content = `
    ${heading("Reset Your Password")}
    ${paragraph("We received a request to reset your Sogverse password. Click the button below to choose a new password.")}
    ${paragraph("This link will expire in 1 hour.")}
    ${paragraph("If you didn\u2019t request a password reset, you can safely ignore this email. Your password will not be changed.")}
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="background-color:${BRAND.primary};border-radius:8px;">
                <a href="${resetLink}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:bold;color:${DARK_THEME.bg};text-decoration:none;">
                  Reset Password
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  return wrapInLayout({ title: "Reset Your Password", content });
}
