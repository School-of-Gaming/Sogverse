import { z } from "zod";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";

/**
 * Request body for public parent self-registration (`POST /api/auth/register`).
 * Shared by the route (which validates with it) and the register form.
 *
 * The gedu twin of this schema lives in `services/gedu/`; the two say the same
 * thing about the fields they share, and differ only where the two accounts
 * genuinely do — a parent claims no coverage, no spoken languages and no game
 * handles, and may name a home location an educator has no equivalent of.
 *
 * **The names are trimmed here, not in the route.** Sign-up writes them into the
 * auth user's metadata, which the `handle_new_user` trigger copies verbatim into
 * the profile, so nothing further down the path is positioned to clean up a
 * stray trailing space — and `.trim()` before the length checks is also what
 * makes them measure the name rather than the whitespace around it (`" A"` is
 * not a two-character first name).
 */
export const registerParentBody = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().trim().min(DISPLAY_NAME_MIN).max(DISPLAY_NAME_MAX),
  lastName: z.string().trim().min(DISPLAY_NAME_MIN).max(DISPLAY_NAME_MAX),
  /**
   * Optional home location, as a `locations.id`. Written to the profile after
   * the account exists; a failure there is never fatal (see the route).
   */
  homeLocationId: z.string().uuid().optional(),
  /**
   * Which language to write the welcome mail in. An enum rather than the gedu
   * schema's plain string because the only thing that ever sends it is our own
   * picker, which cannot produce a value outside this list — so an unsupported
   * one is a malformed request rather than a value to fall back from. Absent is
   * fine: the route then reads the Accept-Language header instead.
   */
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  /**
   * Marketing provenance: the `?ref=` code this visit arrived with, if any.
   *
   * A plain optional string, for exactly the reason the gedu schema's is — the
   * parent never typed it and cannot see it, so a format rule here would turn
   * whoever authored the marketing link into someone who can block a
   * registration. The handler runs it through the shared sanitiser, where a bad
   * value becomes NULL and the signup succeeds.
   */
  referralCode: z.string().optional(),
});

export type RegisterParentBody = z.infer<typeof registerParentBody>;
