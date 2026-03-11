import { DARK_THEME } from "@/lib/constants/colors";
import { wrapInLayout } from "./layout";
import { escapeHtml } from "./utils";

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
export function buildFeedbackEmail(opts: FeedbackEmailOptions): string {
  const escapedMessage = escapeHtml(opts.message).replace(/\n/g, "<br/>");
  const escapedName = escapeHtml(opts.userName);
  const escapedRole = escapeHtml(opts.userRole);
  const escapedEmail = escapeHtml(opts.userEmail);

  const gamerNote = opts.isGamer && opts.parentEmail
    ? `<tr>
        <td style="padding:12px 0 0;color:${DARK_THEME.mutedFg};font-size:13px;font-style:italic;">
          This feedback is from a gamer account. Replies will go to their parent (${escapeHtml(opts.parentEmail)}).
        </td>
      </tr>`
    : "";

  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:18px;font-weight:bold;color:${DARK_THEME.foreground};padding-bottom:16px;">
          New Feedback Received
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${DARK_THEME.border};border-radius:8px;">
            <tr>
              <td style="padding:12px 16px;color:${DARK_THEME.mutedFg};font-size:13px;border-bottom:1px solid ${DARK_THEME.border};width:100px;">From</td>
              <td style="padding:12px 16px;color:${DARK_THEME.foreground};font-size:14px;border-bottom:1px solid ${DARK_THEME.border};">${escapedName}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;color:${DARK_THEME.mutedFg};font-size:13px;border-bottom:1px solid ${DARK_THEME.border};">Role</td>
              <td style="padding:12px 16px;color:${DARK_THEME.foreground};font-size:14px;border-bottom:1px solid ${DARK_THEME.border};text-transform:capitalize;">${escapedRole}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;color:${DARK_THEME.mutedFg};font-size:13px;border-bottom:1px solid ${DARK_THEME.border};">Email</td>
              <td style="padding:12px 16px;color:${DARK_THEME.foreground};font-size:14px;border-bottom:1px solid ${DARK_THEME.border};">${escapedEmail}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;color:${DARK_THEME.mutedFg};font-size:13px;">Sent</td>
              <td style="padding:12px 16px;color:${DARK_THEME.foreground};font-size:14px;">${escapeHtml(opts.sentAt)}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="font-size:14px;font-weight:bold;color:${DARK_THEME.foreground};padding-bottom:8px;">
          Message
        </td>
      </tr>
      <tr>
        <td style="padding:16px;background-color:${DARK_THEME.bg};border:1px solid ${DARK_THEME.border};border-radius:8px;color:${DARK_THEME.foreground};font-size:14px;line-height:1.6;">
          ${escapedMessage}
        </td>
      </tr>
      ${gamerNote}
    </table>`;

  return wrapInLayout({ title: "New Feedback", content });
}
