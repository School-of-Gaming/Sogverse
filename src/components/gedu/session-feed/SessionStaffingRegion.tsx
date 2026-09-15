"use client";

import { useState, type ReactNode } from "react";
import { UserMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { StatusLine } from "@/components/ui/alert";
import type {
  CoverRequestState,
  GeduAssignmentRole,
  SessionStaffing,
} from "@/lib/session-staffing";
import type { CoverReason } from "@/types";
import { SessionCoverRequestDialog } from "./SessionCoverRequestDialog";
import { SessionCoverWithdrawDialog } from "./SessionCoverWithdrawDialog";

export interface SessionCoverRequestDraft {
  reason: CoverReason;
  /** Trimmed by the caller's RPC; empty means no note at all. */
  note: string;
}

interface SessionStaffingRegionProps {
  staffing: SessionStaffing;
  /**
   * Whether this session is one the viewer could still file an absence for —
   * the card's own date test, decided by the entry's kind.
   *
   * It is a prop rather than a second reading of the clock in here: the card
   * already answers "which side of the present is this" off the one instant the
   * whole feed shares, and a component asking again would be a second answer
   * free to disagree with the tag two inches above it.
   */
  canRequestCover: boolean;
  /**
   * File "I can't make this session". **Awaited**: the dialog holds its own
   * committing flag from the click until this settles, and closes only when it
   * resolves — so a refused write leaves the reason and the note where the gedu
   * can try again.
   *
   * Absent on a surface that is not a gedu looking at their own session — the
   * admin shell supplies {@link staffingEditor} in this slot instead — and the
   * action is then not rendered at all.
   */
  onRequestCover?: (draft: SessionCoverRequestDraft) => void | Promise<void>;
  /** Take an open request back. Awaited on the same terms. */
  onWithdrawCoverRequest?: (requestId: string) => void | Promise<void>;
  /**
   * The staffing editor this surface supplies for this session, or nothing.
   *
   * **The surface decides by what it supplies**, exactly as the site panel's
   * saves already decide who may write a site's record: a gedu shell hands over
   * the two cover callbacks and no editor, and an admin shell hands over the
   * editor and no callbacks. Neither is a role flag, and the body branches on
   * neither.
   */
  staffingEditor?: ReactNode;
}

/**
 * Everything one session card says about **who is running it** — and the one
 * place any surface may act on that.
 *
 * Three things share the region, and they share it because they answer one
 * question between them: the staffing line says who is expected and what is
 * outstanding, the viewer's own control says what they may do about it, and the
 * editor slot is where a shell with more power than a gedu puts its own. Split
 * across the card they would each have needed a slot of their own on a card
 * that is already dense, and two of the three are mutually exclusive anyway — a
 * gedu who has filed an absence is no longer expected, so the action and the
 * status can never both be up.
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
  canRequestCover,
  onRequestCover,
  onWithdrawCoverRequest,
  staffingEditor = null,
}: SessionStaffingRegionProps) {
  const t = useTranslations("gedu.sessionFeed");
  const [requestOpen, setRequestOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  /**
   * Live from the click that starts a write until the document the write
   * changes comes back — never cleared on success, because what ends the state
   * is this card being rebuilt from the refetched staffing.
   *
   * Set synchronously before the mutation runs, so there is no render between
   * the click and the disabled control in which a second press could land.
   */
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewerRequest = staffing.viewerRequest;
  const showLine = staffing.requests.length > 0;
  const canFile =
    canRequestCover && staffing.viewerIsExpected && onRequestCover !== undefined;
  const canWithdraw =
    viewerRequest !== null &&
    viewerRequest.status === "open" &&
    onWithdrawCoverRequest !== undefined;

  if (!showLine && !canFile && viewerRequest === null && staffingEditor === null) {
    return null;
  }

  const fileCover = async (draft: SessionCoverRequestDraft) => {
    if (onRequestCover === undefined) return;
    setError(null);
    setCommitting(true);
    try {
      await onRequestCover(draft);
      setRequestOpen(false);
    } catch {
      // The gedu has to be able to try again, so this is one of the two
      // outcomes that hands the control back.
      setCommitting(false);
      setError(t("coverRequestFailed"));
    }
  };

  const withdrawCover = async () => {
    if (onWithdrawCoverRequest === undefined || viewerRequest === null) return;
    setError(null);
    setCommitting(true);
    try {
      await onWithdrawCoverRequest(viewerRequest.id);
      setWithdrawOpen(false);
    } catch {
      setCommitting(false);
      setError(t("coverWithdrawFailed"));
    }
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      {/* The facts on the left, the controls right-packed on the right — the
          trailing-group shape, so a control that only some cards carry grows
          the group leftward into the row's own slack instead of displacing
          what is already painted. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
          {showLine && <StaffingLine staffing={staffing} />}
          {viewerRequest !== null && (
            <ViewerRequestStatus request={viewerRequest} />
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {canFile && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={committing}
              onClick={() => {
                setError(null);
                setRequestOpen(true);
              }}
              className="gap-1.5"
            >
              <UserMinus className="h-3.5 w-3.5" aria-hidden />
              {t("coverRequestAction")}
            </Button>
          )}
          {canWithdraw && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={committing}
              onClick={() => {
                setError(null);
                setWithdrawOpen(true);
              }}
            >
              {t("coverWithdrawAction")}
            </Button>
          )}
          {staffingEditor}
        </div>
      </div>

      {error !== null && (
        <StatusLine status="destructive" size="xs" role="alert" className="mt-1">
          {error}
        </StatusLine>
      )}

      {canFile && (
        <SessionCoverRequestDialog
          open={requestOpen}
          onOpenChange={(next) => {
            if (committing) return;
            setRequestOpen(next);
          }}
          committing={committing}
          onConfirm={(draft) => void fileCover(draft)}
        />
      )}
      {canWithdraw && (
        <SessionCoverWithdrawDialog
          open={withdrawOpen}
          onOpenChange={(next) => {
            if (committing) return;
            setWithdrawOpen(next);
          }}
          committing={committing}
          onConfirm={() => void withdrawCover()}
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
    role === "primary" ? t("coverRolePrimary") : t("coverRoleAssistant");

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
          {request.status === "covered" && request.coveredBy !== null
            ? t("staffingCoveredBy", {
                sub: request.coveredBy.firstName,
                name: request.requestedBy.firstName,
              })
            : t("staffingCoverNeeded", { name: request.requestedBy.firstName })}
        </p>
      ))}
    </>
  );
}

/**
 * The viewer's own request, in the three things it can be: open with nothing
 * disclosed, open with a count, or covered.
 *
 * **A null count is not zero.** `offerCount` is "not disclosed" wherever the
 * reader is not entitled to it, and nobody offering and nobody being told are
 * different facts — so the no-count line says only that the request is open
 * rather than inventing a number for it.
 */
function ViewerRequestStatus({ request }: { request: CoverRequestState }) {
  const t = useTranslations("gedu.sessionFeed");

  if (request.status === "covered" && request.coveredBy !== null) {
    return (
      <p className="font-medium text-foreground">
        {t("coverRequestStatusCovered", { name: request.coveredBy.firstName })}
      </p>
    );
  }
  return (
    <p className="font-medium text-foreground">
      {request.offerCount === null
        ? t("coverRequestStatusOpen")
        : t("coverRequestStatusOffers", { count: request.offerCount })}
    </p>
  );
}
