import { ApiError } from "@/lib/api/api-error";

/**
 * **The one enrolment refusal a parent is not told the reason for.**
 *
 * Both enrolment doors disclose the database's refusals verbatim, because those
 * messages are written for the parent to read — "registration has not yet
 * opened", "the waitlist is not enabled for this product". The consent refusal
 * is the exception: it can only be reached by a race nobody has ever hit — an
 * admin attaching a document to a product while a parent has its page open —
 * and its text names raw document slugs, which mean nothing to the reader and
 * describe a state their screen has already stopped showing. Bespoke copy for
 * that moment would be five locales of a sentence for a situation whose only
 * honest instruction is "look again".
 *
 * So the routes swap it for a code, and the panel answers by refetching the
 * product and falling back to the generic failure line it already shows for
 * anything it cannot explain. The refetch is the part that matters: the newly
 * required document appears in the panel, the tick it was never given is
 * dropped, and the retry is a real second attempt rather than the same stale
 * list sent again forever.
 */
export const CONSENT_REFUSED_CODE = "consent_documents_required";

/**
 * How the refusal is recognised, and why it is a string match.
 *
 * `record_required_consents` raises it as a `check_violation`, which is the
 * same SQLSTATE the enrolment RPCs use for every other refusal they *do*
 * disclose — audience, registration window, currency, waitlist — so the code
 * cannot tell them apart and the message is the only discriminator available
 * without a migration that gives this one raise a code of its own.
 *
 * Matched on the fixed head of the message rather than the whole of it: the
 * tail interpolates the missing slugs. The text is owned by the migration that
 * declares the function; a revision that rewords it must reword this constant
 * in the same change, and the failure mode if it does not is the old
 * behaviour — the raw sentence reaching the parent — rather than a broken
 * enrolment.
 */
const REFUSAL_MESSAGE_HEAD = "this product requires consent to ";

/** Read a string `message` off an unknown thrown value. */
function messageOf(value: unknown): string | null {
  if (value instanceof Error) return value.message;
  if (typeof value !== "object" || value === null || !("message" in value)) {
    return null;
  }
  return typeof value.message === "string" ? value.message : null;
}

/**
 * The error an enrolment route should throw in place of the database's, or
 * `null` when the failure is something else and must travel on untouched.
 *
 * The message it carries is for the log and the wire, never for display — the
 * client branches on the code and picks its own string, exactly as `ApiError`
 * documents. It names no slug, so nothing of the database's sentence survives.
 */
export function consentRefusalError(error: unknown): ApiError | null {
  const message = messageOf(error);
  if (message === null || !message.startsWith(REFUSAL_MESSAGE_HEAD)) return null;
  return new ApiError(
    "Enrolment conditions were not met",
    400,
    CONSENT_REFUSED_CODE,
  );
}

/** True for the error the routes above produce, as the client receives it. */
export function isConsentRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.code === CONSENT_REFUSED_CODE;
}
