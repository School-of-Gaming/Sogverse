import type { ConsentPurposes } from "@/lib/consent";
import type { ConsentAnswerBody } from "@/lib/consent-answers.contracts";
import type { ConsentAnswer } from "@/types";

/** The one answer the two purposes make together. */
export function consentAnswerFor(purposes: ConsentPurposes): ConsentAnswer {
  if (purposes.analytics && purposes.marketing) return "all";
  if (purposes.analytics) return "analytics_only";
  if (purposes.marketing) return "marketing_only";
  return "none";
}

/**
 * Hand a device's first answer to the cookie banner to our server, which counts
 * it (`/api/consent-answers`).
 *
 * Sent whatever the answer, a refusal included: it carries the answer and the
 * page's path and nothing else, so it identifies nobody. The path is the
 * address bar's path alone, never its query; the server decides whether it is
 * a page worth naming.
 *
 * **Fire and forget.** Nothing waits on it and nothing it does can hold the
 * banner open. `keepalive` lets it outlive a navigation straight after the
 * answer.
 */
export function sendConsentAnswer(
  purposes: ConsentPurposes,
  pathname: string,
): void {
  const body: ConsentAnswerBody = {
    answer: consentAnswerFor(purposes),
    pagePath: pathname,
  };
  try {
    fetch("/api/consent-answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // A browser that refuses the request outright has lost one count, and the
    // answer it would have counted is already stored.
  }
}
