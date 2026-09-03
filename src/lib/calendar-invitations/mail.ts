import { createTranslator } from "use-intl/core";
import { DEFAULT_LOCALE, type SupportedLocale } from "@/lib/constants/locales";
import { loadMessages, type Messages } from "@/i18n/messages";
import { wrapInLayout } from "@/lib/email-templates/layout";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import {
  heading,
  paragraph,
  styledName,
  styledProductName,
} from "@/lib/email-templates/utils";
import type { InvitationAction } from "./options";

/**
 * The mail an invitation travels in.
 *
 * Short on purpose. The calendar part is the payload — a client shows its own
 * summary, its own dates and its own Yes/Maybe/No — so a body that restates all
 * of it is a second, worse copy of the thing sitting right beside it. What the
 * words have to do is say who the entry is for and what will happen to it
 * later, because that second fact is the entire difference between an
 * invitation and a one-off `.ics` attachment and it is the one thing no client
 * will tell the reader.
 *
 * **Its own namespace, and a server-only one.** It is composed outside React,
 * in the locale of the parent it is addressed to, exactly as the feed's fixed
 * words and every other mail are — so it is stripped from the client bundle
 * alongside them.
 */

/** The invitation mail's own words, in the recipient's locale. */
export type CalendarInvitationTranslator = ReturnType<
  typeof createTranslator<Messages, "calendarInvitation">
>;

export async function getCalendarInvitationTranslator(
  locale: SupportedLocale = DEFAULT_LOCALE,
): Promise<CalendarInvitationTranslator> {
  const messages = await loadMessages(locale);
  return createTranslator({ locale, messages, namespace: "calendarInvitation" });
}

export interface InvitationMailArgs {
  action: InvitationAction;
  locale: SupportedLocale;
  /** The parent the mail is addressed to, for the greeting. */
  parentName: string;
  gamerName: string;
  productName: string;
}

export interface InvitationMailContent {
  subject: string;
  html: string;
  /**
   * The plain-text alternative.
   *
   * Not optional, and not an afterthought: a mail carrying a `text/calendar`
   * part is a multipart document, and a client that finds only HTML beside the
   * calendar is more likely to treat the whole thing as an attachment-bearing
   * message than as an invitation.
   */
  text: string;
}

/**
 * Compose the mail for one action.
 *
 * Two translators, because the layout's footer is the *shared* mail furniture —
 * the copyright line every transactional mail ends with — and it lives where
 * every other mail's furniture lives rather than being restated here.
 */
export async function buildInvitationMail(
  args: InvitationMailArgs,
): Promise<InvitationMailContent> {
  const { action, locale, parentName, gamerName, productName } = args;
  const t = await getCalendarInvitationTranslator(locale);
  const email = await getEmailTranslator(locale);

  const values = { gamer: gamerName, product: productName };
  const subject = t(`subject.${action}`, values);
  const title = t(`heading.${action}`);
  const greeting = t("greeting", { name: parentName });
  const body = t(`body.${action}`, {
    gamer: gamerName,
    product: productName,
  });
  // A cancellation has no future to promise anything about, so the sentence
  // that explains how updates arrive is left off it rather than reworded into
  // something that no longer applies.
  const note = action === "cancel" ? null : t("updatesNote");

  const styled = t(`body.${action}`, {
    gamer: styledName(gamerName),
    product: styledProductName(productName),
  });

  const content = `
    ${heading(title)}
    ${paragraph(t("greeting", { name: styledName(parentName) }))}
    ${paragraph(styled)}
    ${note === null ? "" : paragraph(note)}
  `;

  return {
    subject,
    html: wrapInLayout({ title, content, locale, t: email }),
    text: [title, "", greeting, "", body, ...(note === null ? [] : ["", note])]
      .join("\n")
      .trim(),
  };
}
