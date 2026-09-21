"use client";

import { Fragment, useState } from "react";
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
   * Absent on a surface that is not a gedu looking at their own session — an
   * admin shell hands the card its own menu instead, and the action is then
   * not rendered at all.
   */
  onWithdrawSubstitutionRequest?: (requestId: string) => void | Promise<void>;
}

/**
 * Everything one session card says about **who is running it**, once there is
 * something to say.
 *
 * Two things share the region: the staffing line says who is expected and what
 * is outstanding, and the viewer's own request — where they hold one — is
 * stated loudly with the way to take it back.
 *
 * **No action starts here, whoever is looking.** A gedu's "I need to cancel"
 * and an admin's own actions are both rows in the card header's `⋯`, which is
 * what makes the two roles' cards the same card *(owner, 2026-09)*: an admin
 * looking at a session sees what the gedu sees, and the only difference is what
 * the menu holds.
 *
 * Filing is rare and belongs out of the way, which is why it sits in that
 * menu. A request that exists is the opposite kind of fact — it is the most important thing on the card, and the reader must not
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
}: SessionStaffingRegionProps) {
  const t = useTranslations("gedu.sessionFeed");
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const viewerRequest = staffing.viewerRequest;
  const showLine = staffing.requests.length > 0;
  const canWithdraw =
    viewerRequest !== null &&
    viewerRequest.status === "open" &&
    onWithdrawSubstitutionRequest !== undefined;

  /**
   * The requests about **somebody else**, needed-first.
   *
   * Their presence is what promotes the whole staffing note into an info
   * message: a session where a colleague is away and somebody has to cover is
   * news to everybody on the group, and it was being drawn as small muted
   * print under the date *(owner, 2026-09)*. A card whose only request is the
   * viewer's own has no such news — their own panel below says it in the
   * second person — so the note stays quiet there.
   *
   * Needed before substituted, because an unanswered seat is the one a reader
   * can still do something about. Both stay **info**: the warning tone on this
   * card belongs to the viewer's own request and nothing else.
   */
  const colleagueRequests = [
    ...staffing.requests.filter(
      (request) => !request.isViewers && request.status !== "substituted",
    ),
    ...staffing.requests.filter(
      (request) => !request.isViewers && request.status === "substituted",
    ),
  ];
  const promoted = colleagueRequests.length > 0;

  // Nothing to say, no band: the border and its padding belong to the facts,
  // so a card with none is exactly as tall as one that never had any — which
  // is what makes an admin's card and a gedu's the same card.
  if (!showLine) return null;

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {promoted && (
        <StaffingNote staffing={staffing} requests={colleagueRequests} />
      )}

      {/* The quiet form of the same facts, for a card whose only request is
          the viewer's own: their panel below says it in the second person, so
          the note is not promoted and this line is all that is left. */}
      {!promoted && (
        <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
          <ExpectedLine staffing={staffing} />
        </div>
      )}

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
 * Who the session expects, with the role each is paid for.
 *
 * It renders only on a date that carries a request — an ordinary week has the
 * group's own gedus on it and nothing to say — so it is never on its own
 * account that this region appears.
 */
function ExpectedLine({ staffing }: { staffing: SessionStaffing }) {
  const t = useTranslations("gedu.sessionFeed");
  const roleLabel = (role: GeduAssignmentRole) =>
    role === "primary" ? t("substitutionRolePrimary") : t("substitutionRoleAssistant");

  if (staffing.expected.length === 0) {
    return <p>{t("staffingNobodyExpected")}</p>;
  }

  return (
    <p>
      {t("staffingExpectedLabel")}{" "}
      {staffing.expected.map((gedu, index) => (
        <Fragment key={gedu.id}>
          {/* **Never a comma.** A display name may contain one — the seeded
              "Suhina, Susanna Hiltunen" does — and a comma-joined run then
              reads as two people. The card already separates facts with a
              middle dot, so the run borrows it; it is punctuation between
              translated names rather than copy, so it is not a string. */}
          {index > 0 && <span className="px-1">{NAME_SEPARATOR}</span>}
          {/* Each person is one unbreakable unit, so a wrap falls between
              people rather than inside a name or before a separator. */}
          <span className="whitespace-nowrap">
            {t("staffingWithRole", {
              name: gedu.firstName,
              role: roleLabel(gedu.role),
            })}
          </span>
        </Fragment>
      ))}
    </p>
  );
}

/**
 * **A colleague is away, and that is news.** Who is expected and what is
 * outstanding, drawn as one informational message rather than as small print
 * under the date *(owner, 2026-09)*.
 *
 * The **info** treatment, which is the app's for a fact a reader needs to take
 * in and cannot act on — the same tokens the viewer's own settled request
 * wears. The card's *warning* stays reserved for the reader's own open
 * request, so a card carrying both reads as two messages of two weights: this
 * one above, theirs below and louder.
 *
 * **One message, not a second card.** The card rule admits a state message
 * inside a card and nothing deeper, so the lines inside this panel are
 * paragraphs with spacing — never boxes of their own.
 *
 * The absent gedu is named here and nowhere else on this feed: these are their
 * own colleagues reading a card about a group they all teach, and the seat's
 * identity is the person. What is *not* here is the reason, which is admin-only
 * and never reaches this document for a gedu caller at all.
 *
 * **The viewer's own request is not among these rows**, because the panel below
 * says it in the second person: "Substitute needed for Sanna" one line above
 * "You've asked for a substitute for this session" is the same fact twice, the
 * first time in the third person about the reader.
 */
function StaffingNote({
  staffing,
  requests,
}: {
  staffing: SessionStaffing;
  /** The colleagues' live requests, needed-first. */
  requests: readonly SubstitutionRequestState[];
}) {
  const t = useTranslations("gedu.sessionFeed");

  return (
    <Alert variant="info" role="status">
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <ExpectedLine staffing={staffing} />
        {requests.map((request) => (
          <p
            key={request.id}
            // The unanswered seat is the one a reader can still do something
            // about, so it carries the weight — inside the same colour, never
            // a second one.
            className={
              request.status === "substituted" ? undefined : "font-medium"
            }
          >
            {request.status === "substituted" && request.substituteId !== null
              ? t("staffingSubstitutedBy", {
                  sub: request.substituteId.firstName,
                  name: request.requestedBy.firstName,
                })
              : t("staffingSubstitutionNeeded", {
                  name: request.requestedBy.firstName,
                })}
          </p>
        ))}
      </div>
    </Alert>
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

/**
 * What stands between two people in a run of names.
 *
 * A middle dot, because it is what the card's header already puts between
 * facts — and because the one thing it may not be is a comma: a display name
 * can contain one, and a comma-joined run then reads as two people.
 */
const NAME_SEPARATOR = "·";
