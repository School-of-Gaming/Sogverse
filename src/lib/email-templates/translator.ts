import { createTranslator } from "use-intl/core";
import {
  DEFAULT_LOCALE,
  type SupportedLocale,
} from "@/lib/constants/locales";
import type { Messages } from "@/i18n/messages";
import { loadNamespace } from "@/i18n/namespace-loader";
import { emailMessages } from "@/i18n/namespaces/email";
import { topicPrepMessages } from "@/i18n/namespaces/topicPrep";

// Re-export the translator type so template builders can type their `t` parameter.
// Typed over the one namespace it is handed, so it cannot name another.
export type EmailTranslator = ReturnType<
  typeof createTranslator<Pick<Messages, "email">, "email">
>;

/**
 * Creates a translator scoped to the `email` namespace for the given locale.
 * Used by email template builders and the API routes that send their output.
 */
export async function getEmailTranslator(
  locale: SupportedLocale = DEFAULT_LOCALE,
): Promise<EmailTranslator> {
  const email = await loadNamespace(emailMessages, locale);
  return createTranslator({ locale, messages: { email }, namespace: "email" });
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
 * A builder that needs both takes both, each loaded in the same locale.
 */
export type TopicPrepTranslator = ReturnType<
  typeof createTranslator<Pick<Messages, "topicPrep">, "topicPrep">
>;

export async function getTopicPrepTranslator(
  locale: SupportedLocale = DEFAULT_LOCALE,
): Promise<TopicPrepTranslator> {
  const topicPrep = await loadNamespace(topicPrepMessages, locale);
  return createTranslator({ locale, messages: { topicPrep }, namespace: "topicPrep" });
}
