import { DARK_THEME } from "@/lib/constants/colors";
import { RADIUS } from "@/lib/constants/radius";
import { ROLE_LABEL_KEYS } from "@/lib/constants/roles";
import type { UserRole } from "@/types";
import { wrapInLayout } from "./layout";
import { defuseAutolinks, escapeHtml, heading, pinnedFill } from "./utils";
import type { EmailTranslator } from "./translator";

interface FeedbackEmailOptions {
  userName: string;
  userRole: UserRole;
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
  const roleKey = ROLE_LABEL_KEYS[opts.userRole];
  const escapedRole = escapeHtml(t(roleKey));
  // Displayed, never linked. This mail's Reply-To is already this address, so
  // replying is how you answer the person — a second, differently-styled route
  // to the same place is a question about which one is the real one. The
  // defusing is what stops the client inventing that link on our behalf.
  const escapedEmail = defuseAutolinks(escapeHtml(opts.userEmail));

  const gamerNote = opts.isGamer && opts.parentEmail
    ? `<tr>
        <td style="padding:12px 0 0;color:${DARK_THEME.mutedFg};font-size:13px;font-style:italic;">
          ${t("feedback.gamerNote", {
            // Defused like the sender's address above: a displayed address that a
            // client turns into its own link is a link we did not write, in a
            // colour we did not choose. This one is a parent's, in a mail about
            // their child, which makes it the worse of the two to get wrong.
            parentEmail: defuseAutolinks(escapeHtml(opts.parentEmail)),
          })}
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
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${DARK_THEME.border};border-radius:${RADIUS.lg};">
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
        <td style="padding:16px;${pinnedFill(DARK_THEME.bg)}border:1px solid ${DARK_THEME.border};border-radius:${RADIUS.lg};color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;">
          ${escapedMessage}
        </td>
      </tr>
      ${gamerNote}
    </table>`;

  return wrapInLayout({ title: t("feedback.heading"), content, locale, t });
}
