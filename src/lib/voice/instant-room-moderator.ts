import { createClient, getUserWithProfile } from "@/lib/supabase/server";
import { isGeduVerified } from "@/services/gedu/gedu-profiles.service";

/**
 * The identity an instant-voice-room moderator joins with: their stable
 * `profiles.id`, their (non-guest) role, and their profile display name. The
 * token route bakes these into the owner token; the page only needs to know
 * whether this is non-null.
 */
export interface InstantRoomModerator {
  userId: string;
  role: "admin" | "gedu";
  displayName: string;
}

/**
 * The single source of truth for "will this viewer be granted a moderator
 * (owner) token in an instant voice room?" — returns the moderator identity, or
 * `null` for a guest.
 *
 * Both instant-room mod surfaces read it so they can't drift: the token route
 * (mints the owner token from the returned identity) and the public
 * `/voice/[code]` page (treats a null result as a guest, so the lobby shows the
 * name input). Deriving the decision independently on each side is what would
 * show an unverified gedu the mod UI and then bounce them off the token route's
 * guest-name requirement with a 400.
 *
 * The rule: admin → moderator; gedu → moderator **only if** admin-verified;
 * everyone else (signed-out, parent, gamer) → guest. **Fails closed to `null`
 * (guest)** on any verification-lookup error, consistent with the token route's
 * "ambiguous auth never grants ownership" invariant. Admins never trigger the
 * verification lookup.
 *
 * Reads the session via `getUserWithProfile`, which is request-`cache()`d, so
 * calling this and reading the session separately in the same request does not
 * double-fetch.
 */
export async function instantRoomModerator(): Promise<InstantRoomModerator | null> {
  const session = await getUserWithProfile();
  const profile = session?.profile;
  if (!profile) return null;

  if (profile.role !== "admin" && profile.role !== "gedu") return null;

  if (profile.role === "gedu") {
    try {
      const verified = await isGeduVerified(await createClient(), session.user.id);
      if (!verified) return null;
    } catch {
      return null;
    }
  }

  return {
    userId: session.user.id,
    role: profile.role,
    displayName: profile.first_name,
  };
}
