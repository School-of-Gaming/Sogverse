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
  /**
   * Whether the parent ticked the optional School of Gaming marketing box.
   *
   * **Optional, and absent means `false`** — a registration must never fail
   * over a marketing preference, and a client that predates the checkbox (a
   * cached bundle, a page open across a deploy) sends no key at all. Reading
   * that silence as "no" is the only safe direction: the worst it costs is a
   * mail nobody was promised, and the parent can turn it on from settings.
   *
   * The route writes the answer either way, so the recorded state is a
   * decision rather than a gap — but that is the *route's* reading of an
   * absent field, not the schema making one up. Nothing here defaults it,
   * because a default would erase the difference between a form that asked and
   * a client that never could.
   */
  marketingConsent: z.boolean().optional(),
});

export type RegisterParentBody = z.infer<typeof registerParentBody>;

/**
 * The machine-readable code `POST /api/auth/register` attaches to a refusal the
 * registrant can fix in place: the auth provider rejected the *password* — too
 * short for its policy, or found in a breach corpus.
 *
 * It exists because the generic refusal points the wrong way. Every other
 * failure of this route ends "if you already have an account, sign in instead",
 * which is unhelpful-but-harmless advice for most of them and actively wrong
 * for this one: the account does not exist, the email is fine, and the parent
 * needs to type a different password, not go looking for a sign-in they never
 * made. The status stays 400 — nothing about the request is conflicting — and
 * the code is what the form branches on to say so, in the parent's language.
 *
 * Same shape as the `PIN_REQUIRED` / `GEDU_UNCERTIFIED` codes the role gate
 * attaches: a `code` beside the English `error`, which stays for the logs.
 */
export const REGISTER_WEAK_PASSWORD = "WEAK_PASSWORD";
