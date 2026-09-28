"use client";

import type { Dispatch, SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  GeduPickerSheet,
  type GeduPickerUnavailability,
} from "@/components/admin/products/gedu-picker-sheet";
import { seatSubstituteFailureKey } from "@/services/session-substitution";
import type {
  SeatSubstituteDraft,
  SubstitutionRequest,
} from "./admin-substitutions-data";

/**
 * Seating a substitute on one open request from its own card: the gedu picker,
 * then a confirm.
 *
 * `picker` and `confirm` are **mutually exclusive on purpose**, as they are in
 * the group page's staffing editor — the sheet is not in the dialogs' register,
 * so a keypress reaching both would take one down with the other.
 */
export interface SeatSubstituteFlowState {
  step: "picker" | "confirm";
  request: SubstitutionRequest;
  /** The chosen gedu, once the picker has closed on a selection. */
  sub: SeatSubstituteDraft["sub"] | null;
}

/**
 * The overlays behind a request card's "Seat someone else" — mounted once for
 * the whole queue, and only while a walk is under way, exactly as the approve
 * dialog is.
 *
 * **The card already knows the seat.** The request names the group, the date
 * and the absent gedu, so there is no "which gedu is away" step and no detour
 * through the group's page: the press goes straight to the full picker.
 *
 * **The picker can refuse only the absent gedu.** This page's document carries
 * the requests and not the group's staffing, so a colleague already due at the
 * session cannot be pre-marked here; the write refuses them instead, and the
 * refusal is read out in the dialog that caused it, in words an admin can act
 * on.
 */
export function SeatSubstituteFlow({
  flow,
  setFlow,
  onConfirm,
}: {
  flow: SeatSubstituteFlowState;
  /**
   * The state setter itself, because the picker's close handler has to read
   * the value it is replacing — see there.
   */
  setFlow: Dispatch<SetStateAction<SeatSubstituteFlowState | null>>;
  /** Resolves once the queue has been read again; rejects with the refusal. */
  onConfirm: (draft: SeatSubstituteDraft) => Promise<void>;
}) {
  const t = useTranslations("admin.substitutions");
  const tStaffing = useTranslations("admin.products.staffing");
  const { request, sub } = flow;
  const absent = request.requesterName ?? t("unnamed");

  return (
    <>
      <GeduPickerSheet
        open={flow.step === "picker"}
        onOpenChange={(next) => {
          if (next) return;
          // A selection closes the sheet too, one line after it has moved the
          // walk on to the confirm — so this stands down unless the picker is
          // still the step, or it would undo the very choice that closed it.
          setFlow((current) =>
            current === null || current.step !== "picker" ? current : null,
          );
        }}
        title={tStaffing("pickerTitle")}
        description={tStaffing("pickerDescription", { name: absent })}
        unavailable={absentOnly(request.requesterId)}
        onSelect={(gedu) =>
          setFlow({
            ...flow,
            step: "confirm",
            sub: {
              id: gedu.id,
              firstName: gedu.first_name,
              lastName: gedu.last_name,
            },
          })
        }
      />

      {flow.step === "confirm" && sub !== null && (
        <SeatSubstituteDialog
          request={request}
          sub={sub}
          onClose={() => setFlow(null)}
          onConfirm={() => onConfirm({ request, sub })}
        />
      )}
    </>
  );
}

/**
 * The write a seat from the card makes: the request's own group, its
 * product-local date and its absent gedu, and the chosen gedu.
 *
 * **Reason and note are left out, never nulled.** The request already carries
 * the gedu's own, and the write keeps what is on the row when it is given
 * neither — so the one thing this must never do is send them.
 */
export function seatSubstituteWrite({ request, sub }: SeatSubstituteDraft): {
  groupId: string;
  sessionDate: string;
  absentGeduId: string;
  subGeduId: string;
} {
  return {
    groupId: request.groupId,
    sessionDate: request.sessionDay,
    absentGeduId: request.requesterId,
    subGeduId: sub.id,
  };
}

/** The one refusal this surface can state up front: nobody subs for themselves. */
function absentOnly(
  requesterId: string,
): ReadonlyMap<string, GeduPickerUnavailability> {
  return new Map([[requesterId, "absent"]]);
}

/**
 * The question asked before a gedu who did not offer is seated.
 *
 * **It asks for no reason**, and that is the owner's ruling rather than an
 * omission: the request exists, so the gedu has already said why, and the
 * write leaves what is on the row alone when it is given nothing. The reason
 * is on this page's document, so it is shown back here as it stands — read
 * only — which is what tells the admin nothing is being asked again.
 *
 * **Holding, for the approve dialog's reasons**: seating hands over the
 * group's workspace 48 hours before the session, and the write is refusable,
 * so the answer arrives where the question was asked.
 */
function SeatSubstituteDialog({
  request,
  sub,
  onClose,
  onConfirm,
}: {
  request: SubstitutionRequest;
  sub: SeatSubstituteDraft["sub"];
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const t = useTranslations("admin.substitutions");

  const name = `${sub.firstName} ${sub.lastName}`.trim() || t("unnamed");
  const absent = request.requesterName ?? t("unnamed");

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("seatConfirmTitle", { name })}
      description={t("seatConfirmBody", {
        name,
        absent,
        product: request.productName,
        group: request.groupName,
        // The card's own words for the session, as the approve dialog does.
        when:
          request.sessionTime === null
            ? request.sessionDate
            : `${request.sessionDate}, ${request.sessionTime}`,
      })}
      confirmLabel={t("seatConfirm")}
      confirmVariant="default"
      holdWhileCommitting
      onConfirm={onConfirm}
      describeError={(error) =>
        t(seatSubstituteFailureKey(error), { name, absent })
      }
    >
      {request.reason !== null && (
        <dl className="text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <dt className="text-xs text-muted-foreground">
              {t("seatReasonLabel")}
            </dt>
            <dd className="font-medium">{t(`reason.${request.reason}`)}</dd>
            {/* The gedu's own words, whole — the card shows them the same way. */}
            {request.reasonNote !== null && (
              <dd className="w-full text-xs text-muted-foreground">
                {request.reasonNote}
              </dd>
            )}
          </div>
        </dl>
      )}
    </ConfirmDialog>
  );
}
