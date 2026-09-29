import type {
  GameAccountExternalId,
  GamePlatform,
} from "@/components/game-account";
import type {
  GamerCreation,
  GenderType,
  GeduAssignedProductGroup,
  GeduAssignedProductRosterEntry,
  GeduAssignedProductShell,
} from "@/types";

/**
 * Convenience alias for the roster row shape consumed by
 * `ParticipantRosterRow` and the workspace rail. The RPC already returns
 * exactly this — the alias is just a shorter import for the components.
 */
export type ParticipantSessionRow = GeduAssignedProductRosterEntry;

/**
 * One roster row of a **redacted** workspace document — the shape a reader
 * with a gamer's reach is sent.
 *
 * It is not the staff row with blanks in it. What that reader may not see is
 * absent from the type: no contact address of any kind, an `age` where the
 * staff row has a date of birth, and `has_note` — whether a staff note exists —
 * where it has the note and its editor. So a component handed one cannot print
 * a parent's address or a note's text from it: there is no field to print.
 */
export interface RedactedRosterMember {
  participant_id: string;
  first_name: string;
  signed_up_at: string;
  group_joined_at: string | null;
  age: number | null;
  gender: GenderType | null;
  minecraft_username: string | null;
  minecraft_uuid: string | null;
  roblox_username: string | null;
  roblox_user_id: number | null;
  has_note: boolean;
  creations: readonly GamerCreation[];
}

/** A roster row as the workspace body takes it: the staff row or its redacted twin. */
export type WorkspaceRosterMember = ParticipantSessionRow | RedactedRosterMember;

/**
 * Is this the redacted twin? Asked of the one field only it carries, so the
 * answer is structural rather than a flag somebody has to remember to set.
 */
export function isRedactedMember(
  member: WorkspaceRosterMember,
): member is RedactedRosterMember {
  return "has_note" in member;
}

/**
 * A group the workspace draws in full: the reader's own, or — on a staff
 * document — a sister group, whose roster is `null` because sister rosters are
 * nobody's to browse.
 */
export type WorkspaceGroup = Omit<GeduAssignedProductGroup, "roster"> & {
  roster: readonly WorkspaceRosterMember[] | null;
};

/**
 * A sister group of a redacted document: its name, and nothing else.
 *
 * The reader may know it exists — its room is drawn on the rail, locked — but
 * its size, its staff and its members are not theirs to see, and those fields
 * are absent from the type rather than zeroed. `is_my_group` is `false` by
 * construction: the reader's own group is always a full {@link WorkspaceGroup}.
 */
export interface NamedOnlyGroup {
  id: string;
  name: string;
  created_at: string;
  is_my_group: false;
}

export type WorkspaceGroupRow = WorkspaceGroup | NamedOnlyGroup;

/** Is this a sister group shown by name only? Structural, like the roster test. */
export function isNamedOnlyGroup(
  group: WorkspaceGroupRow,
): group is NamedOnlyGroup {
  return !("gedus" in group);
}

/**
 * The product document the workspace body renders: the product shell, which
 * group is the reader's, and every group it may show — the staff document
 * (`GeduAssignedProduct`) and the redacted one are both this.
 */
export interface WorkspaceProduct {
  product: GeduAssignedProductShell;
  my_group_id: string;
  groups: readonly WorkspaceGroupRow[];
}

/**
 * The one address a gedu can actually write to for this seat.
 *
 * The RPC emits exactly one of the two contact fields per row and never both:
 * `parent_email` for a child (their linked parent) and `participant_email` for
 * an adult (their own address). A child's *own* profile email is withheld by
 * policy whatever it is — a platform-internal handle under the switch-only
 * and username sign-ins, a real address under the email one — because a
 * gedu's contact for a child is always the parent, so there is no shape in
 * which this returns a child's address or a non-mailbox.
 *
 * A redacted row carries no address at all, and answers `null`.
 *
 * It lives here rather than inside the row component because the bulk
 * copy-all affordance above the list has to make the identical choice, and two
 * places deciding "which address" independently is how one of them ends up
 * omitting every adult from the pasted list.
 */
export function rosterContactEmail(
  entry: WorkspaceRosterMember,
): string | null {
  if (isRedactedMember(entry)) return null;
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
  entry: WorkspaceRosterMember,
  platform: GamePlatform,
): { username: string | null; externalId: GameAccountExternalId | null } {
  return platform === "minecraft"
    ? { username: entry.minecraft_username, externalId: entry.minecraft_uuid }
    : { username: entry.roblox_username, externalId: entry.roblox_user_id };
}
