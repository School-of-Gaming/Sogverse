import { wrapInLayout } from "./layout";
import { heading, paragraph, styledName } from "./utils";
import { ctaButton } from "./blocks";
import type { EmailTranslator } from "./translator";

/**
 * The bare verification mail, sent when someone asks for one from their
 * settings. Deliberately short: the welcome mails already explain what
 * verifying is for, and this one is answering a request the reader made
 * seconds ago.
 */
export function buildVerifyEmailEmail(
  t: EmailTranslator,
  locale: string,
  { firstName, verificationUrl }: { firstName: string; verificationUrl: string },
): string {
  const content = `
    ${heading(t("verifyEmail.heading"))}
    ${paragraph(t("verifyEmail.body", { firstName: styledName(firstName) }))}
    ${ctaButton({ href: verificationUrl, label: t("verifyEmail.button") })}
    ${paragraph(t("verifyEmail.expiry"))}
    ${paragraph(t("verifyEmail.ignore"))}
  `;
  return wrapInLayout({ title: t("verifyEmail.heading"), content, locale, t });
}
