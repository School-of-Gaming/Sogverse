import type { ProductSite } from "@/components/group-workspace/GroupWorkspace";
import type { WorkspaceProduct } from "@/components/group-workspace/types";
import { WITHHELD, type Withheld } from "@/lib/withheld";
import type { TraineeAssignedProduct } from "@/services/assignments";
import type {
  TraineeGroupFeed,
  TraineeRosterEntry,
} from "@/services/gedu-sessions";
import type { GamerCreation } from "@/types";

/**
 * The turns the trainee shell makes between its two redacted documents and the
 * workspace body — pure, so the rules that fail silently are testable without
 * a React tree.
 *
 * **Nothing here invents a value.** Every field the trainee is not sent stays
 * withheld on the way through: the group's and the site's staff notes become
 * {@link WITHHELD} rather than `null` (which would read as "nobody wrote one"),
 * a member with a note carries a withheld note rather than an empty one, and
 * nothing is copied into the staff document's shape to make it fit.
 */

/**
 * The product document the body renders: the trainee's product read with its
 * own group's roster — **and headcount** — replaced by the feed's.
 *
 * The same swap the gedu shell makes, for the same reason: the feed is the copy
 * a refetch refreshes, so the rail's roster and the count above it come out of
 * one array and cannot disagree. Sibling groups pass through as they came — by
 * name only.
 */
export function traineeWorkspaceData(
  product: TraineeAssignedProduct,
  feed: TraineeGroupFeed,
): WorkspaceProduct {
  return {
    product: product.product,
    my_group_id: product.my_group_id,
    groups: product.groups.map((group) =>
      group.is_my_group && group.id === product.my_group_id
        ? {
            ...group,
            roster: feed.roster,
            participant_count: feed.roster.length,
          }
        : group,
    ),
  };
}

/** The four sparse maps the body's flair prop spreads, from a redacted roster. */
export interface TraineeFlairMaps {
  newcomers: Record<string, string>;
  notes: Record<string, Withheld>;
  noteEditors: Record<string, string>;
  creations: Record<string, readonly GamerCreation[]>;
}

/**
 * The redacted roster turned into the flair maps.
 *
 * - **Newcomers** follow the staff rule exactly — clubs only, gated by the
 *   caller — because a join stamp is on the trainee's roster and the badge is
 *   something a gamer on the group would notice too.
 * - **Notes** are keyed only for members with one, and the value is withheld:
 *   the row's button lights (the owner allows the trainee to know a note
 *   exists) and the dialog draws filler in the note's field.
 * - **Editors and creations** are empty: neither is on the document.
 */
export function traineeFlairMaps(
  roster: readonly TraineeRosterEntry[],
  drawsNewcomerBadge: boolean,
): TraineeFlairMaps {
  const newcomers: Record<string, string> = {};
  const notes: Record<string, Withheld> = {};
  for (const member of roster) {
    if (drawsNewcomerBadge && member.group_joined_at !== null) {
      newcomers[member.participant_id] = member.group_joined_at;
    }
    if (member.has_note) notes[member.participant_id] = WITHHELD;
  }
  return { newcomers, notes, noteEditors: {}, creations: {} };
}

/**
 * The site as the body takes it, with its staff note withheld — on every
 * in-person product, whether or not one was written, since the trainee may not
 * learn which.
 */
export function traineeSite(site: TraineeGroupFeed["site"]): ProductSite | null {
  if (site === null) return null;
  return {
    name: site.name,
    address: site.address,
    publicNote: site.public_note,
    staffNote: WITHHELD,
  };
}
