import { DARK_THEME } from "@/lib/constants/colors";
import { ROLE_LABEL_KEYS } from "@/lib/constants/roles";
import type { UserRole } from "@/types";
import { wrapInLayout } from "./layout";
import { escapeHtml, heading } from "./utils";
import type { EmailTranslator } from "./translator";

interface FeedbackEmailOptions {
  userName: string;
  userRole: string;
  userEmail: string;
  message: string;
  sentAt: string;
  isGamer?: boolean;
  parentEmail?: string;
}

/**
 * Builds the HTML email body for a feedback submission.
 */
export function buildFeedbackEmail(t: EmailTranslator, locale: string, opts: FeedbackEmailOptions): string {
  const escapedMessage = escapeHtml(opts.message).replace(/\n/g, "<br/>");
  const escapedName = escapeHtml(opts.userName);
  const roleKey = ROLE_LABEL_KEYS[opts.userRole as UserRole];
  const escapedRole = escapeHtml(t(roleKey));
  const escapedEmail = escapeHtml(opts.userEmail);

  const gamerNote = opts.isGamer && opts.parentEmail
    ? `<tr>
        <td style="padding:12px 0 0;color:${DARK_THEME.mutedFg};font-size:13px;font-style:italic;">
          ${t("feedback.gamerNote", { parentEmail: escapeHtml(opts.parentEmail) })}
        </td>
      </tr>`
    : "";

  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>${heading(t("feedback.heading"))}</td>
      </tr>
      <tr>
        <td style="padding-bottom:16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${DARK_THEME.border};border-radius:8px;">
            <tr>
              <td style="padding:12px 16px;color:${DARK_THEME.mutedFg};font-size:13px;border-bottom:1px solid ${DARK_THEME.border};width:100px;">${t("feedback.from")}</td>
              <td style="padding:12px 16px;color:${DARK_THEME.foreground};font-size:14px;border-bottom:1px solid ${DARK_THEME.border};">${escapedName}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;color:${DARK_THEME.mutedFg};font-size:13px;border-bottom:1px solid ${DARK_THEME.border};">${t("feedback.role")}</td>
              <td style="padding:12px 16px;color:${DARK_THEME.foreground};font-size:14px;border-bottom:1px solid ${DARK_THEME.border};">${escapedRole}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;color:${DARK_THEME.mutedFg};font-size:13px;border-bottom:1px solid ${DARK_THEME.border};">${t("feedback.emailLabel")}</td>
              <td style="padding:12px 16px;color:${DARK_THEME.foreground};font-size:14px;border-bottom:1px solid ${DARK_THEME.border};">${escapedEmail}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;color:${DARK_THEME.mutedFg};font-size:13px;">${t("feedback.sent")}</td>
              <td style="padding:12px 16px;color:${DARK_THEME.foreground};font-size:14px;">${escapeHtml(opts.sentAt)}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="font-size:14px;font-weight:bold;color:${DARK_THEME.foreground};padding-bottom:8px;">
          ${t("feedback.message")}
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:${DARK_THEME.bg};border:1px solid ${DARK_THEME.border};border-radius:8px;color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;">
          ${escapedMessage}
        </td>
      </tr>
      ${gamerNote}
    </table>`;

  return wrapInLayout({ title: t("feedback.heading"), content, locale, t });
}
