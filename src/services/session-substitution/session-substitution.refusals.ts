/**
 * Why filing an absence was refused, as a message key.
 *
 * **The picker cannot know what it is about to be refused for.** No read on the
 * Substitutions page carries which dates the viewer has already filed on — the
 * assignment rows are per seat and the summaries per card — so the picker
 * disables only what it wrote itself and the write's own refusal is the backstop
 * for everything filed in an earlier visit. A backstop that says "that didn't
 * save, try again" invites the reader to press the same button again forever, so
 * it has to say *why*.
 *
 * Two signals, in the order they are worth trusting, which is the same shape the
 * admin approval dialog uses:
 *
 * - **The SQLSTATE**, which the migration states explicitly (or which Postgres
 *   raises itself, for the live-seat unique index).
 * - **A fragment of the message**, for the refusals that share `check_violation`
 *   and can only be told apart by what they say. Each fragment is literal in the
 *   migration that raises it, and each is a phrase rather than a sentence
 *   because the sentences splice a date or a uuid into themselves.
 *
 * **Anything unmatched falls to the generic line.** The server's own words are
 * untranslated and name uuids, so a reworded refusal costs a gedu some detail
 * rather than showing them raw English.
 *
 * **`42501` cannot be split, and the copy says so rather than guessing.** The
 * function's authorization *is* the derivation — you may file only for a session
 * you are expected at — and a gedu already holding a live request is not
 * expected at it. So "you have already asked" and "you no longer hold that seat"
 * raise one error with one message, and a line claiming either one alone would
 * be wrong half the time. The first is overwhelmingly the real case, and both
 * mean the same thing about the row: it cannot be filed on.
 *
 * Pure, and it names keys rather than translating: the two entry points render
 * the line through their own translator.
 */

/** The lines a refused filing can read as, all under `gedu.sessionFeed`. */
export type SubstitutionRequestFailureKey =
  | "substitutionRequestFailedAlreadyAsked"
  | "substitutionRequestFailedNotExpected"
  | "substitutionRequestFailedPastSession"
  | "substitutionRequestFailedNotScheduled"
  | "substitutionRequestFailed";

/**
 * Which refusal `request_session_substitution` raised.
 *
 * `substitutionRequestFailed` is the generic line and the answer for anything
 * this cannot place — including a network failure, which arrives here as an
 * error with neither field.
 */
export function substitutionRequestFailureKey(
  error: unknown,
): SubstitutionRequestFailureKey {
  const { code, message } = wireError(error);

  // The live-seat unique index, which only a race can reach: the derivation
  // above refuses a second filing long before Postgres has to. When it does
  // fire, "already asked" is certain rather than likely.
  if (code === "23505" && message.includes("session_substitution_requests_live_seat")) {
    return "substitutionRequestFailedAlreadyAsked";
  }
  if (code === "42501") return "substitutionRequestFailedNotExpected";
  if (code === "23514") {
    if (message.includes("past session")) {
      return "substitutionRequestFailedPastSession";
    }
    if (message.includes("No scheduled session on")) {
      return "substitutionRequestFailedNotScheduled";
    }
  }
  return "substitutionRequestFailed";
}

/**
 * Whether this refusal means **the seat is already spoken for**, so the picker
 * can mark that row the way it marks what it filed itself and stop offering it
 * for the rest of the visit.
 *
 * It is exactly the two refusals the row's own "Already asked for a substitute"
 * reason describes. The date refusals are deliberately not here: they are true
 * of the *session* rather than of the filing, and a row labelled "already asked"
 * for a session whose date has passed would be the picker inventing a request
 * that does not exist.
 */
export function substitutionRequestRefusalMeansAlreadyFiled(
  key: SubstitutionRequestFailureKey,
): boolean {
  return (
    key === "substitutionRequestFailedAlreadyAsked" ||
    key === "substitutionRequestFailedNotExpected"
  );
}

/** The `code` and `message` off a Postgres error, or empty strings. */
function wireError(error: unknown): { code: string; message: string } {
  if (typeof error !== "object" || error === null) {
    return { code: "", message: "" };
  }
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message =
    "message" in error && typeof error.message === "string" ? error.message : "";
  return { code, message };
}
