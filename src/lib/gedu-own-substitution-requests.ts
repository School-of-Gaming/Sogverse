import type { SupportedLocale } from "@/lib/constants/locales";
import { toSubstitutionRequestInput } from "@/lib/gedu-session-feed";
import { sortSubstitutionPoolRows } from "@/lib/gedu-substitution-pool";
import { toRequestState, type SubstitutionRequestState } from "@/lib/session-staffing";
import {
  buildSessionFacts,
  sessionFactsProduct,
  type SessionFacts,
} from "@/lib/substitution-session-facts";
import type { LiveSubstitutionRequest } from "@/services/session-substitution";
import type { GeduAssignmentRole } from "@/types";

/**
 * The gedu's own live requests, as the Substitutions page's "Your requests"
 * draws them — one card each.
 *
 * **The session is described by the shared session facts**, as on every other
 * substitution surface, and **the request by the same state a session card
 * reads** — the feed's document mapping and the staffing derivation's own
 * per-request step — because both surfaces render one status panel and must
 * hand it the same thing.
 *
 * Pure, and clock-free.
 */

/** One of the reader's own live requests, in the shape its card renders. */
export interface OwnSubstitutionRequestRow {
  requestId: string;
  groupId: string;
  groupName: string;
  session: SessionFacts;
  /** The role the reader filed in — what the session is paid as. */
  role: GeduAssignmentRole;
  /** What the status panel reads: open or substituted, the sub, the offers. */
  request: SubstitutionRequestState;
}

/**
 * The requests worth a card, **soonest session first** — the pool's order, by
 * the pool's comparator, since the two sections sit one above the other.
 *
 * **A request on a cancelled session is left out.** It is still live — the
 * filing write refuses a second one there, which is why the read carries it —
 * but a session that is not happening needs no cover, and the pool and the
 * admin page hide it for the same reason. A restore brings it back untouched.
 */
export function buildOwnSubstitutionRequestRows(
  requests: readonly LiveSubstitutionRequest[],
  locale: SupportedLocale,
): OwnSubstitutionRequestRow[] {
  const rows = requests
    .filter((request) => !request.session_cancelled)
    .map(
      (request): OwnSubstitutionRequestRow => ({
        requestId: request.id,
        groupId: request.group_id,
        groupName: request.group_name,
        session: buildSessionFacts({
          product: sessionFactsProduct(request.product),
          sessionDate: request.session_date,
          locale,
        }),
        role: request.role,
        // No viewer id: the document has already answered whose request it
        // is, and every one of these is the reader's own.
        request: toRequestState(toSubstitutionRequestInput(request), null),
      }),
    );

  return sortSubstitutionPoolRows(rows);
}
