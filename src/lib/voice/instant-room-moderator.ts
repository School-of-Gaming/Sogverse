import { createClient, getUserWithProfile } from "@/lib/supabase/server";
import { isGeduCertified } from "@/services/gedu/gedu-profiles.service";

/** The resolved session shape `getUserWithProfile` produces. */
type SessionWithProfile = Awaited<ReturnType<typeof getUserWithProfile>>;

/**
 * The identity an instant-voice-room moderator joins with: their stable
 * `profiles.id`, their (non-guest) role, and their profile display name. The
 * token route bakes these into the owner token.
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
 * The token route is the only consumer: it mints the owner token from the
 * returned identity. The `/voice/[code]` page used to read it too, to decide
 * whether the lobby asked for a name — that need is gone now that the name
 * input turns on sign-in rather than on moderator status, so there is no second
 * surface left to drift from this one.
 *
 * The rule: admin → moderator; gedu → moderator **only if** admin-certified;
 * everyone else (signed-out, parent, gamer) → guest. **Fails closed to `null`
 * (guest)** on any certification-lookup error, consistent with the token route's
 * "ambiguous auth never grants ownership" invariant. Admins never trigger the
 * certification lookup.
 *
 * Takes the already-resolved session rather than reading it itself: the caller
 * reads `getUserWithProfile()` once and hands the same snapshot to both the
 * owner gate (here) and its identity branch, so the two can never disagree
 * about who is asking — and the route doesn't pay the session lookup twice.
 * (React's `cache()` doesn't memoize inside a Route Handler, so "just call it
 * again, it's cached" would silently double the auth + profile fetches.)
 */
export async function instantRoomModerator(
  session: SessionWithProfile,
): Promise<InstantRoomModerator | null> {
  const profile = session?.profile;
  if (!profile) return null;

  if (profile.role !== "admin" && profile.role !== "gedu") return null;

  if (profile.role === "gedu") {
    try {
      const certified = await isGeduCertified(await createClient(), session.user.id);
      if (!certified) return null;
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
