/**
 * The one distinction a failed session save has to be able to make: did
 * **nothing** land, or did **some of it**?
 *
 * Saving one session is not one write. The two notes go in a single call because
 * they are one row, but every changed attendance mark is a call of its own —
 * that is what stops two gedus marking different children from clobbering each
 * other. So a save can genuinely half-succeed: four marks written, the fifth
 * refused.
 *
 * Reporting that as a flat failure is a lie in the direction that costs the most.
 * The gedu reads "this session didn't save", goes back to the sheet believing
 * nothing landed, and now has no idea which four children are already recorded —
 * and the stored record disagrees with what they were just told. The honest reply
 * names the shape of the problem and sends them to the sheet to look.
 *
 * The editor stays open with the full draft either way, and re-sending is safe:
 * every mark is a per-child upsert, so a retry rewrites the marks that already
 * landed to the same values and finishes the ones that did not.
 */

/**
 * Thrown when a session save wrote some of its attendance marks and not others.
 *
 * A class rather than a flag on a plain `Error` so the feed can ask
 * `instanceof` and get a compiler-checked answer, and so the failing marks can
 * travel with it — nothing renders them today, but a save that knows which
 * children it could not record should not throw that away on the way out.
 */
export class PartialSessionSaveError extends Error {
  /** Roster ids whose marks were refused. */
  readonly failedGamerIds: readonly string[];

  constructor(failedGamerIds: readonly string[], options?: ErrorOptions) {
    super(
      `${failedGamerIds.length} attendance mark(s) failed to save`,
      options,
    );
    this.name = "PartialSessionSaveError";
    this.failedGamerIds = failedGamerIds;
  }
}

/**
 * Whether a caught value is the half-succeeded case.
 *
 * A function rather than a bare `instanceof` at the call site because the thing
 * being narrowed is `unknown` out of a `catch`, and this keeps that narrowing in
 * one place next to the class it is about.
 */
export function isPartialSessionSaveError(
  error: unknown,
): error is PartialSessionSaveError {
  return error instanceof PartialSessionSaveError;
}
