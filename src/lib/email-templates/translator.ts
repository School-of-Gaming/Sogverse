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
 * Used by email template builders and the API routes that send their output.
 */
export async function getEmailTranslator(
  locale: SupportedLocale = DEFAULT_LOCALE,
): Promise<EmailTranslator> {
  const messages = await loadMessages(locale);
  return createTranslator({ locale, messages, namespace: "email" });
}

/**
 * A translator scoped to the top-level `topicPrep` namespace — the one piece of
 * copy a mail shares, word for word, with pages the app renders.
 *
 * **It exists because a namespace is a translator's whole world, and the prose
 * has to have exactly one home.** `EmailTranslator` is scoped to `email`, so it
 * cannot reach a key outside it; the "Before the first session" guide is
 * rendered by the confirmation page, both enrolment cards *and* the
 * confirmation mail, and every one of them must say the same words. Copying the
 * guide into `email.topicPrep` would put the same paragraphs in the catalog
 * twice, in five locales, with nothing asserting they still agree — the failure
 * this directory already documents for the confirmation page's own sentences,
 * accepted there because those sentences are one line each and this is a
 * document.
 *
 * So the mail takes a second translator rather than a second copy of the prose.
 * A builder that needs both takes both; the two are loaded from the same
 * catalog, so they cannot disagree about the locale.
 */
export type TopicPrepTranslator = ReturnType<
  typeof createTranslator<Messages, "topicPrep">
>;

export async function getTopicPrepTranslator(
  locale: SupportedLocale = DEFAULT_LOCALE,
): Promise<TopicPrepTranslator> {
  const messages = await loadMessages(locale);
  return createTranslator({ locale, messages, namespace: "topicPrep" });
}
