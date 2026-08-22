import { wrapInLayout } from "./layout";
import { ctaButton } from "./blocks";
import { heading, paragraph } from "./utils";
import type { EmailTranslator } from "./translator";

/**
 * Builds the HTML email body for a parent-PIN reset request. Mirrors the
 * password-reset email; the link carries a standalone signed token (not a
 * Supabase recovery link) handled by /reset-pin → /api/auth/pin/reset.
 */
export function buildPinResetEmail(t: EmailTranslator, resetLink: string, locale: string): string {
  const content = `
    ${heading(t("pinReset.heading"))}
    ${paragraph(t("pinReset.body"))}
    ${paragraph(t("pinReset.expiry"))}
    ${paragraph(t("pinReset.ignore"))}
    ${ctaButton({
      // resetLink is an app-generated URL, safe to embed unescaped.
      href: resetLink,
      label: t("pinReset.button"),
    })}
  `;

  return wrapInLayout({ title: t("pinReset.heading"), content, locale, t });
}
