import { wrapInLayout } from "./layout";
import { ctaButton } from "./blocks";
import { heading, paragraph } from "./utils";
import type { EmailTranslator } from "./translator";

/**
 * Builds the HTML email body for a password reset request.
 */
export function buildPasswordResetEmail(t: EmailTranslator, resetLink: string, locale: string): string {
  const content = `
    ${heading(t("passwordReset.heading"))}
    ${paragraph(t("passwordReset.body"))}
    ${paragraph(t("passwordReset.expiry"))}
    ${paragraph(t("passwordReset.ignore"))}
    ${ctaButton({
      // resetLink is app-built with encodeURIComponent'd params (see the
      // forgot-password route), so it is safe to embed unescaped.
      href: resetLink,
      label: t("passwordReset.button"),
    })}
  `;

  return wrapInLayout({ title: t("passwordReset.heading"), content, locale, t });
}
