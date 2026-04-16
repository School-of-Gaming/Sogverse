import { createTranslator } from "use-intl/core";
import {
  DEFAULT_LOCALE,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { loadMessages, type Messages } from "@/i18n/messages";

// Re-export the translator type so template builders can type their `t` parameter.
export type EmailTranslator = ReturnType<typeof createTranslator<Messages, "email">>;

/**
 * Creates a translator scoped to the `email` namespace for the given locale.
 * Used by email template builders and their callers (API routes, notification orchestrator).
 */
export async function getEmailTranslator(
  locale: SupportedLocale = DEFAULT_LOCALE,
): Promise<EmailTranslator> {
  const messages = await loadMessages(locale);
  return createTranslator({ locale, messages, namespace: "email" });
}
