import { wrapInLayout } from "./layout";
import { heading, paragraph, styledName } from "./utils";
import { ctaButton } from "./blocks";
import type { EmailTranslator } from "./translator";

/**
 * The bare verification mail, sent when someone asks for one from their
 * settings. Deliberately short: the welcome mails already explain what
 * verifying is for, and this one is answering a request the reader made
 * seconds ago.
 *
 * It states no expiry window, because there is none — the link stays good until
 * the address it verifies changes. A password reset says "one hour" because an
 * hour is true of it; inventing a window here would only teach a reader to
 * hurry, and to distrust a link that still works a fortnight later.
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
    ${paragraph(t("verifyEmail.ignore"))}
  `;
  return wrapInLayout({ title: t("verifyEmail.heading"), content, locale, t });
}
