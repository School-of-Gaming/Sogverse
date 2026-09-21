"use client";

import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type {
  SubstitutionOffer,
  SubstitutionRequest,
} from "./admin-substitutions-data";

/**
 * The question asked before a substitute is seated.
 *
 * **It is asked at all because approving hands over more than a shift.** The
 * moment it lands, the volunteer holds the session, and 48 hours before it
 * starts the group's workspace opens to them — the roster, the children's game
 * accounts, the notes. That is not something one press should do, and the
 * sibling action on the gedu side ("Offer to substitute") already asks first.
 *
 * **Holding, because the answer is the point.** The write is refusable — the
 * request may have been filled or withdrawn by another admin, the volunteer may
 * have been de-certified since they offered, the absent gedu may have been
 * taken off the group — and an admin who walked away from a dialog that closed
 * on the press would believe the session was staffed. So the dialog stays up
 * until the write settles, reads a refusal out in place, and closes only once
 * the queue has been read again and the list behind it agrees.
 *
 * **The body is three mechanisms, each checked against the SQL.** What the
 * substitute gets and when; that nothing is sent to anybody, because this
 * feature has no notification channel at all; and what the session's own card
 * will say afterwards — in the words that card really uses.
 */
export function ApproveOfferDialog({
  request,
  offer,
  onClose,
  onConfirm,
}: {
  request: SubstitutionRequest;
  offer: SubstitutionOffer;
  onClose: () => void;
  /** Resolves once the queue has been read again; rejects with the refusal. */
  onConfirm: () => Promise<void>;
}) {
  const t = useTranslations("admin.substitutions");

  const name = offer.name ?? t("unnamed");
  const absent = request.requesterName ?? t("unnamed");

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("approveConfirmTitle", { name })}
      description={t("approveConfirmBody", {
        name,
        absent,
        product: request.productName,
        group: request.groupName,
        // The card's own words for the session, so the dialog names it exactly
        // as the row the admin pressed named it. The date is the product's
        // calendar date and the clock face is the viewer's, both already
        // formatted by the page's mapping — re-deriving either here would be a
        // second answer to the same question.
        when:
          request.sessionTime === null
            ? request.sessionDate
            : `${request.sessionDate}, ${request.sessionTime}`,
      })}
      confirmLabel={t("approve")}
      // An affirmative, not a destructive one: this is the action the dialog
      // exists to ask about, so it wears the colour a press wears.
      confirmVariant="default"
      holdWhileCommitting
      onConfirm={onConfirm}
      describeError={(error) => t(approveFailureKey(error), { name, absent })}
    />
  );
}

/**
 * Which refusal happened, as a message key.
 *
 * `approve_session_substitution_offer` raises four things and an admin can act
 * on the difference between them, so they are told apart rather than flattened
 * into one line. Two signals, in order of how much they are worth trusting:
 *
 * - **The SQLSTATE**, which the migration states explicitly. `P0002` is the
 *   offer row being gone — the volunteer took it back between the list being
 *   read and the press.
 * - **A fragment of the message**, for the three refusals that all raise
 *   `check_violation` and can only be told apart by what they say. The
 *   fragments below are literal in the migration that raises them, and each is
 *   a phrase rather than a whole sentence because the sentences splice ids into
 *   themselves. **Anything unmatched falls to the generic line**, so a reworded
 *   refusal costs an admin some detail rather than showing them raw English —
 *   which is the failure mode worth designing for, since the server's own words
 *   are untranslated and name UUIDs.
 *
 * There is deliberately **no "the session has already started" case**: that
 * check exists on the gedu's own offer write and not on this one, so claiming
 * it here would be inventing a refusal the database never raises.
 */
function approveFailureKey(error: unknown): ApproveFailureKey {
  const { code, message } = wireError(error);

  if (code === "P0002") return "approveFailedOfferGone";
  if (code === "23514") {
    if (message.includes("is already")) return "approveFailedAlreadySettled";
    if (message.includes("no longer holds a seat")) {
      return "approveFailedSeatGone";
    }
    if (message.includes("can no longer substitute")) {
      return "approveFailedIneligible";
    }
  }
  return "failed";
}

/** The lines a refusal can read as. */
type ApproveFailureKey =
  | "approveFailedOfferGone"
  | "approveFailedAlreadySettled"
  | "approveFailedSeatGone"
  | "approveFailedIneligible"
  | "failed";

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
