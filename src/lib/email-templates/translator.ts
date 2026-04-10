import { createTranslator } from "use-intl/core";
import {
  DEFAULT_LANGUAGE,
  type SupportedLanguage,
} from "@/lib/constants/language-preference";

// Re-export the translator type so template builders can type their `t` parameter.
// The generic is erased to keep it simple — email templates use flat string keys.
export type EmailTranslator = ReturnType<typeof createTranslator>;

/**
 * Creates a translator scoped to the `email` namespace for the given locale.
 * Used by email template builders and their callers (API routes, notification orchestrator).
 */
export async function getEmailTranslator(
  locale: SupportedLanguage = DEFAULT_LANGUAGE,
): Promise<EmailTranslator> {
  const mod = await import(`../../../messages/${locale}.json`);
  const messages = mod.default ?? mod;
  return createTranslator({ locale, messages, namespace: "email" });
}
