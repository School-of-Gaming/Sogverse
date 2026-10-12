"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { OwnSubstitutionRequestPanel } from "@/components/session-substitution/OwnSubstitutionRequestPanel";
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
 * **No action starts here, whoever is looking.** A gedu's "I need a substitute"
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
  const viewerRequest = staffing.viewerRequest;
  const showLine = staffing.requests.length > 0;

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

      {/* The viewer's own request, with the way to take it back — the one
          panel the Substitutions page's "Your requests" draws too, so the two
          surfaces cannot disagree about it. */}
      {viewerRequest !== null && (
        <OwnSubstitutionRequestPanel
          request={viewerRequest}
          onWithdraw={onWithdrawSubstitutionRequest}
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

  const last = staffing.expected.length - 1;

  return (
    <p>
      {t("staffingExpectedLabel")}{" "}
      {staffing.expected.map((gedu, index) => (
        <Fragment key={gedu.id}>
          {/* **The one breakable spot in the run**, and it has to be an actual
              space: JSX drops the newline-only whitespace between two elements,
              and a middle dot offers a renderer no break opportunity of its
              own, so without this the whole run is a single unbreakable box
              that overflows a 360px card. */}
          {index > 0 && NAME_GAP}
          {/* One person, their role, and the separator that follows them, as
              **one unbreakable unit** — the separator rides the name before it
              so a wrap can never start a line with a dangling dot, and the
              non-breaking space inside {@link NAME_SEPARATOR} is what keeps it
              there. Never a comma: a display name may contain one — the seeded
              "Suhina, Susanna Hiltunen" does — and a comma-joined run then
              reads as two people. */}
          <span className="whitespace-nowrap">
            {t("staffingWithRole", {
              name: gedu.firstName,
              role: roleLabel(gedu.role),
            })}
            {index < last && NAME_SEPARATOR}
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
 * What closes a person's entry in a run of names: a non-breaking space and a
 * middle dot, which is what the card's header already puts between facts.
 *
 * The one thing it may not be is a comma — a display name can contain one, and
 * a comma-joined run then reads as two people. The space is non-breaking so the
 * dot stays with the name it follows rather than opening the next line.
 */
const NAME_SEPARATOR = " ·";

/** The ordinary space after it, where a line may break. */
const NAME_GAP = " ";
