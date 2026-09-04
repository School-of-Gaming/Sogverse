import { DARK_THEME } from "@/lib/constants/colors";
import { RADIUS } from "@/lib/constants/radius";
import { ROLE_LABEL_KEYS } from "@/lib/constants/roles";
import type { UserRole } from "@/types";
import { wrapInLayout } from "./layout";
import { factTable } from "./blocks";
import { defuseAutolinks, escapeHtml, heading, paragraph, pinnedFill } from "./utils";
import type { EmailTranslator } from "./translator";

export interface FeedbackEmailOptions {
  userName: string;
  userRole: UserRole;
  /**
   * The address on the submitter's own account — a gamer's included, which
   * under the switch-only and username sign-ins is the platform-internal handle
   * nobody reads. It is not necessarily where a reply goes: see
   * `feedbackReplyToAddress` below for which of the two addresses does.
   */
  userEmail: string;
  message: string;
  sentAt: string;
  isGamer?: boolean;
  /** The linked parent's address — the one a reply to a gamer's message goes to. */
  parentEmail?: string;
  /**
   * Whether the gamer signs in with a real address of their own, which is the
   * whole of the test: in that one mode `userEmail` is a mailbox the child
   * actually reads, and the note names it so the admin answering can include
   * them alongside the parent. False for the two modes with no inbox behind
   * them, where naming the handle would be naming nothing.
   */
  gamerOwnMailbox?: boolean;
}

/**
 * Where a reply to this message goes, decided once.
 *
 * A gamer's message is answered through their linked parent — we never write to
 * a child alone — and everybody else is answered at their own address. Two
 * places need this answer and they must not be able to disagree: the route sets
 * the Brevo Reply-To header from it, and the mail prints it in the "Reply to"
 * row so whoever opens the mail can see where their reply will land. A row that
 * named a different address from the header is the specific lie this exists to
 * prevent.
 *
 * A gamer with no linked parent falls back to their own address, which under
 * two of the three sign-ins is a handle that would bounce. That is accepted and
 * honest: every gamer is created through a parent, so an unlinked one is a
 * broken row rather than a state to design a reply-to for, and the mail says
 * exactly what the header carries.
 */
export function feedbackReplyToAddress({
  isGamer,
  parentEmail,
  userEmail,
}: Pick<FeedbackEmailOptions, "isGamer" | "parentEmail" | "userEmail">): string {
  return isGamer && parentEmail ? parentEmail : userEmail;
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
  // Displayed, never linked. This mail's Reply-To header carries exactly this
  // address, so replying is how you answer the person — a second,
  // differently-styled route to the same place is a question about which one is
  // the real one. The defusing is what stops the client inventing that link on
  // our behalf.
  //
  // The row is labelled "Reply to" rather than "Email" because that is what the
  // value is: one shared resolver picks it, so on a gamer's submission this is
  // their linked parent's address, not the child's own. Labelling it "Email"
  // was the one line in the mail that could be read as false.
  const escapedEmail = defuseAutolinks(escapeHtml(feedbackReplyToAddress(opts)));

  // One note for a gamer's message, never two. The facts a staff reader needs
  // are that the message came from a child's account and whether that child has
  // a mailbox worth including — and the earlier pair of lines answered the
  // second question with an address that the Reply-to row above had already
  // shown, on the reading where they differed at all. Flattened: the row is the
  // reply address, the note is the account it came from.
  const gamerNote = opts.isGamer
    ? `<tr>
        <td style="padding:12px 0 0;color:${DARK_THEME.mutedFg};font-size:13px;font-style:italic;">
          ${
            opts.gamerOwnMailbox
              ? t("feedback.gamerNoteOwnMailbox", {
                  firstName: escapedName,
                  // Defused like the reply-to address above: a displayed address
                  // a client turns into its own link is a link we did not write,
                  // in a colour we did not choose. This one is a child's, which
                  // makes it the worse of the two to get wrong.
                  gamerEmail: defuseAutolinks(escapeHtml(opts.userEmail)),
                })
              : t("feedback.gamerNoteNoMailbox", { firstName: escapedName })
          }
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
