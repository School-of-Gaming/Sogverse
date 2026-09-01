import { DARK_THEME } from "@/lib/constants/colors";
import { RADIUS } from "@/lib/constants/radius";
import { ROLE_LABEL_KEYS } from "@/lib/constants/roles";
import type { UserRole } from "@/types";
import { wrapInLayout } from "./layout";
import { factTable } from "./blocks";
import { defuseAutolinks, escapeHtml, heading, paragraph, pinnedFill } from "./utils";
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
 * Builds the HTML email body for a help-or-feedback submission.
 *
 * One form now carries both — a family or a gedu asking for help, and anyone
 * telling us something — so the mail says so rather than calling every message
 * feedback. An admin opening it has to be able to tell which it is from the
 * message itself, which is why the copy names both and claims neither.
 *
 * The `email.feedback.*` namespace and the route keep their names: renaming
 * either ripples into the route posture registry and its tests for no reader's
 * benefit, and it is the mail's content that was wrong.
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
  //
  // The row is labelled "Reply to" rather than "Email" because that is what the
  // value actually is: the route resolves the reply-to first and passes it in
  // here, so on a gamer's submission this is their linked parent's address, not
  // the gamer's synthetic handle. Labelling it "Email" was the one line in the
  // mail that could be read as false.
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

  // The same box the seat-offer staff mail states its facts in — one helper, so
  // a correction to how a staff mail reads reaches both. The label column is
  // narrower than the default because these four labels are single words and
  // the value column is where the mail is actually read. The table carries its
  // own 16px of bottom margin, so the cell holding it adds none: the spacing is
  // unchanged from when this markup was written out by hand here.
  const facts = factTable(
    [
      [t("feedback.from"), escapedName],
      [t("feedback.role"), escapedRole],
      [t("feedback.replyToLabel"), escapedEmail],
      [t("feedback.sent"), escapeHtml(opts.sentAt)],
    ],
    { labelWidth: "100px" },
  );

  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>${heading(t("feedback.heading"))}</td>
      </tr>
      <tr>
        <td>${paragraph(t("feedback.intro"))}</td>
      </tr>
      <tr>
        <td>${facts}</td>
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
