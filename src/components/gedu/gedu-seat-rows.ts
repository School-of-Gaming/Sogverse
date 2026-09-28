import { ROUTES } from "@/lib/constants";
import type { AppHrefObject } from "@/lib/constants/routes";
import {
  geduAssignmentKey,
  geduSubstitutionKey,
  type GeduAssignmentRow,
} from "@/lib/gedu-assignment-rollup";
import type { MyAssignedProductSessionRow } from "@/services/assignments";
import type { GeduAssignmentSummary } from "@/services/gedu-sessions";

/**
 * The join every gedu page that draws seat cards has to make first: the
 * assignment rows, which carry the product and its schedule, against the
 * summaries, which carry the three facts that belong to the seat rather than to
 * the product — the group's name, its size, and its building.
 *
 * It lives here because two pages make it now. My SOG draws a gedu's standing
 * groups and their live substitutions; the Substitutions page draws the
 * substitutions alone. They read the same two documents and would otherwise
 * each re-derive the same key, the same fallbacks and the same two href maps,
 * which is how one of them ends up handing a card the wrong group's workspace.
 */

/**
 * Which seat a row or a summary is about: the kind, the group, and — for a
 * substitution — the date it covers.
 *
 * Group id alone was the join key while every seat was an assignment. It stops
 * being unique the moment one group can be both somebody's standing assignment
 * and somebody's substituted Monday, and two substituted Mondays of one group
 * are two seats with two counts; joining on the group alone would hand one of
 * them the other's badge.
 */
function seatKey(
  kind: "assignment" | "substitution",
  groupId: string,
  substitutionDate: string | null,
): string {
  return `${kind}:${groupId}:${substitutionDate ?? ""}`;
}

/**
 * The assignment rows with each seat's group facts folded in.
 *
 * A row with no matching summary still comes through — a card missing its group
 * name is a worse answer than no card only if you think the gedu came here for
 * the group name, and they came for the session — so the missing facts fall
 * back rather than dropping the seat.
 */
export function joinGeduSeatRows(
  rows: readonly MyAssignedProductSessionRow[],
  summaries: readonly GeduAssignmentSummary[],
): GeduAssignmentRow[] {
  const summaryBySeat = new Map(
    summaries.map((s) => [seatKey(s.kind, s.group_id, s.substitution_date), s]),
  );

  return rows.map((row) => {
    const summary = summaryBySeat.get(
      seatKey(row.kind, row.groupId, row.substitutionDate),
    );
    return {
      ...row,
      groupName: summary?.group_name ?? null,
      groupParticipantCount: summary?.group_participant_count ?? 0,
      // Null on anything remote, and the RPC has already applied that test
      // against `is_remote` rather than against the presence of a location — a
      // remote municipality club carries one and has no building.
      siteName: summary?.site_name ?? null,
    };
  });
}

/**
 * Where each seat's card and each seat's room go.
 *
 * Every per-seat map is keyed by (product, group): a gedu substituting a
 * sibling group of a product they already teach holds two seats on one product,
 * and under a product key they would have shared a badge, a workspace link and
 * a voice room.
 */
export function geduSeatHrefs(rows: readonly MyAssignedProductSessionRow[]): {
  hrefByAssignment: Record<string, AppHrefObject>;
  voiceHrefByAssignment: Record<string, AppHrefObject>;
} {
  return {
    hrefByAssignment: Object.fromEntries(
      rows.map((row) => [
        geduAssignmentKey(row.product.id, row.groupId),
        ROUTES.gedu.assignedProduct(row.product.productType, row.product.id),
      ]),
    ),
    voiceHrefByAssignment: Object.fromEntries(
      rows.map((row) => [
        geduAssignmentKey(row.product.id, row.groupId),
        ROUTES.voice.groupSession(row.groupId),
      ]),
    ),
  };
}

/**
 * What each substitution still owes, keyed by the substitution's own identity.
 *
 * A substitution's count is scoped to the one date it covers, so its key is
 * (group, date) rather than the seat's — a sub holding two Mondays of one group
 * owes each of them separately.
 */
export function geduSubstitutionAttention(
  summaries: readonly GeduAssignmentSummary[],
): Record<string, number> {
  return Object.fromEntries(
    summaries
      .filter((s) => s.kind === "substitution" && s.substitution_date !== null)
      .map((s) => [
        geduSubstitutionKey(s.group_id, s.substitution_date!),
        s.attention_count,
      ]),
  );
}
