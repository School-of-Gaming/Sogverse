"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type {
  SubstitutionRequestState,
  GeduAssignmentRole,
  SessionStaffing,
} from "@/lib/session-staffing";

interface SessionStaffingRegionProps {
  staffing: SessionStaffing;
  /**
   * Take an open request back. **Awaited**: the confirm dialog holds itself
   * open until the write settles, so a refusal is read before the gedu leaves
   * the card believing they are free.
   *
   * Absent on a surface that is not a gedu looking at their own session — the
   * admin shell supplies {@link staffingEditor} in this slot instead — and the
   * action is then not rendered at all.
   */
  onWithdrawSubstitutionRequest?: (requestId: string) => void | Promise<void>;
  /**
   * The staffing editor this surface supplies for this session, or nothing.
   *
   * **The surface decides by what it supplies**, exactly as the site panel's
   * saves already decide who may write a site's record: a gedu shell hands over
   * the withdraw callback and no editor, and an admin shell hands over the
   * editor and no callback. Neither is a role flag, and the body branches on
   * neither.
   */
  staffingEditor?: ReactNode;
}

/**
 * Everything one session card says about **who is running it**, once there is
 * something to say.
 *
 * Three things share the region: the staffing line says who is expected and
 * what is outstanding, the viewer's own request — where they hold one — is
 * stated loudly with the way to take it back, and the editor slot is where a
 * shell with more power than a gedu puts its own.
 *
 * **Filing is not here.** The action that *starts* an absence lives in the
 * card header's overflow menu, because it is rare and belongs out of the way
 * (`SessionSubstitutionMenu`). A request that exists is the opposite kind of
 * fact — it is the most important thing on the card, and the reader must not
 * have to open anything to find it — so it is drawn here as a panel rather than
 * as a line of small print *(owner, 2026-09)*.
 *
 * **It sits outside both collapsing regions, under the header.** Staffing is a
 * fact about the session rather than a part of anybody's draft: it must not
 * vanish when an editor opens, and nothing in it is saved by that editor's
 * Save.
 *
 * **The staffing line renders only on a date carrying a request.** An ordinary
 * week has the group's own gedus on it and nothing to say — printing "Running
 * this session: Sanna, Petra" on every card of a fifty-week feed would be fifty
 * repetitions of a fact the rail already carries, and would bury the handful of
 * dates where something is actually outstanding. This is also a staff-only
 * construct by construction rather than by a check: the family feed is a
 * different component and has no field any of this could arrive in.
 *
 * Renders nothing at all when it has nothing to say, which is the overwhelming
 * majority of cards.
 */
export function SessionStaffingRegion({
  staffing,
  onWithdrawSubstitutionRequest,
  staffingEditor = null,
}: SessionStaffingRegionProps) {
  const t = useTranslations("gedu.sessionFeed");
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const viewerRequest = staffing.viewerRequest;
  const showLine = staffing.requests.length > 0;
  const canWithdraw =
    viewerRequest !== null &&
    viewerRequest.status === "open" &&
    onWithdrawSubstitutionRequest !== undefined;

  if (!showLine && staffingEditor === null) {
    return null;
  }

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {/* The facts on the left, the editor right-packed on the right — the
          trailing-group shape, so a control that only some cards carry grows
          the group leftward into the row's own slack instead of displacing
          what is already painted. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
          {showLine && <StaffingLine staffing={staffing} />}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {staffingEditor}
        </div>
      </div>

      {viewerRequest !== null && (
        <ViewerRequestBlock
          request={viewerRequest}
          onWithdraw={
            canWithdraw
              ? () => {
                  setWithdrawOpen(true);
                }
              : null
          }
        />
      )}

      {canWithdraw && (
        /* **It is confirmed, unlike the send two blocks down the same card**,
           and the difference is what the press costs somebody else. A send is
           idempotent at the server and says everything it does in its own
           label; withdrawing drops every offer colleagues have already made on
           a session they set aside time for, and a gedu who meant to press Edit
           has no way back from it. So the dialog exists to name that
           consequence, which is the only thing it has to add — and it holds,
           because a refused withdraw is a fact the gedu has to read before they
           leave this card believing they are free. */
        <ConfirmDialog
          open={withdrawOpen}
          onOpenChange={setWithdrawOpen}
          title={t("substitutionWithdrawTitle")}
          description={t("substitutionWithdrawBody")}
          confirmLabel={t("substitutionWithdrawConfirm")}
          confirmVariant="default"
          holdWhileCommitting
          describeError={() => t("substitutionWithdrawFailed")}
          onConfirm={async () => {
            await onWithdrawSubstitutionRequest(viewerRequest.id);
          }}
        />
      )}
    </div>
  );
}

/**
 * Who is expected, and what is outstanding — one line for the staffing and one
 * per live request on the date.
 *
 * The absent gedu is named here and nowhere else on this feed: these are their
 * own colleagues reading a card about a group they all teach, and the seat's
 * identity is the person. What is *not* here is the reason, which is admin-only
 * and never reaches this document for a gedu caller at all.
 */
function StaffingLine({ staffing }: { staffing: SessionStaffing }) {
  const t = useTranslations("gedu.sessionFeed");
  const roleLabel = (role: GeduAssignmentRole) =>
    role === "primary" ? t("substitutionRolePrimary") : t("substitutionRoleAssistant");

  return (
    <>
      <p>
        {staffing.expected.length === 0
          ? t("staffingNobodyExpected")
          : t("staffingExpected", {
              // A comma-space join is punctuation between translated names, not
              // copy of its own — the same reasoning the assignment card's
              // separator is a pseudo-element for.
              names: staffing.expected
                .map((gedu) =>
                  t("staffingWithRole", {
                    name: gedu.firstName,
                    role: roleLabel(gedu.role),
                  }),
                )
                .join(", "),
            })}
      </p>
      {staffing.requests.map((request) => (
        <p key={request.id}>
          {request.status === "substituted" && request.substituteId !== null
            ? t("staffingSubstitutedBy", {
                sub: request.substituteId.firstName,
                name: request.requestedBy.firstName,
              })
            : t("staffingSubstitutionNeeded", { name: request.requestedBy.firstName })}
        </p>
      ))}
    </>
  );
}

/**
 * The viewer's own request, stated as loudly as the card states anything.
 *
 * **The panel, not a line.** Once a gedu has asked for a substitute, that is
 * what the card is about: whether anybody is coming, and the way back if they
 * turn out to be free after all. Both existing status treatments are spent on
 * saying which of the two it is — **warning** while the seat is still open,
 * because a session with nobody in it is the thing this feature exists to
 * prevent, and **info** once somebody has been approved, because that is a
 * settled fact rather than a thing needing anybody. No new colour: the two are
 * the same tokens the card's needs-attention mark and its live tag already use.
 *
 * **A null count is not zero.** `offerCount` is "not disclosed" wherever the
 * reader is not entitled to it, and nobody offering and nobody being told are
 * different facts — so the second line appears only where a number really
 * travelled, rather than inventing one.
 *
 * `role="status"` rather than the alert the primitive defaults to: it is a
 * standing fact about the session for as long as the request lives, announced
 * when it *arrives* — which is the moment the gedu files — and silent on the
 * loads afterwards.
 */
function ViewerRequestBlock({
  request,
  onWithdraw,
}: {
  request: SubstitutionRequestState;
  /** Opens the confirm dialog, or `null` where this surface offers no withdraw. */
  onWithdraw: (() => void) | null;
}) {
  const t = useTranslations("gedu.sessionFeed");
  const substituted =
    request.status === "substituted" && request.substituteId !== null;

  return (
    <Alert variant={substituted ? "info" : "warning"} role="status">
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium text-foreground">
            {substituted && request.substituteId !== null
              ? t("substitutionRequestStatusSubstituted", {
                  name: request.substituteId.firstName,
                })
              : t("substitutionRequestStatusOpen")}
          </p>
          {!substituted && request.offerCount !== null && (
            <p className="text-xs text-muted-foreground">
              {t("substitutionRequestStatusOffers", { count: request.offerCount })}
            </p>
          )}
        </div>
        {onWithdraw !== null && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onWithdraw}
            className="shrink-0"
          >
            {t("substitutionWithdrawAction")}
          </Button>
        )}
      </div>
    </Alert>
  );
}
