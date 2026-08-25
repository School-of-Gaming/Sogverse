import type {
  GameAccountExternalId,
  GamePlatform,
} from "@/components/game-account";
import type { GeduAssignedProductRosterEntry } from "@/types";

/**
 * Convenience alias for the roster row shape consumed by
 * `ParticipantRosterRow` and the workspace rail. The RPC already returns
 * exactly this — the alias is just a shorter import for the components.
 */
export type ParticipantSessionRow = GeduAssignedProductRosterEntry;

/**
 * The one address a gedu can actually write to for this seat.
 *
 * The RPC emits exactly one of the two contact fields per row and never both:
 * `parent_email` for a child (their linked parent) and `participant_email` for
 * an adult (their own address). A child's *own* profile email is the synthetic
 * `@gamer.sogverse.internal` handle and is deliberately not emitted at all, so
 * there is no shape in which this returns a non-mailbox.
 *
 * It lives here rather than inside the row component because the bulk
 * copy-all affordance above the list has to make the identical choice, and two
 * places deciding "which address" independently is how one of them ends up
 * omitting every adult from the pasted list.
 */
export function rosterContactEmail(
  entry: ParticipantSessionRow,
): string | null {
  return entry.participant_email ?? entry.parent_email;
}

/**
 * The two columns one platform's identity lives in, read off a roster row.
 *
 * A roster row carries every platform's pair at once and the surface shows one
 * of them — whichever the product's topic is about — so something has to map a
 * platform onto the right two fields. Written inline it would be the same
 * ternary in the row, in the batch that collects account ids, and in the save
 * handler that decides which mutation to fire, which is three chances to pair a
 * Roblox name with a Mojang uuid.
 *
 * The key types stay apart on the way through: `externalId` is the shared union
 * (a dashed string or a positive integer), never one squeezed into the other,
 * and nothing downstream reads its value — presence is the whole of "verified".
 */
export function rosterGameAccount(
  entry: ParticipantSessionRow,
  platform: GamePlatform,
): { username: string | null; externalId: GameAccountExternalId | null } {
  return platform === "minecraft"
    ? { username: entry.minecraft_username, externalId: entry.minecraft_uuid }
    : { username: entry.roblox_username, externalId: entry.roblox_user_id };
}
