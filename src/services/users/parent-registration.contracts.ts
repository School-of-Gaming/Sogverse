import { z } from "zod";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { GAMER_EMAIL_DOMAIN } from "@/lib/gamer-sign-in";

/**
 * Marketing provenance as it travels in a registration body: the three UTM
 * fields this visit arrived with, each present or absent.
 *
 * **Plain optional strings on purpose — no format rule here.** This is a
 * deliberate exception to the usual "the body schema is the validation"
 * discipline, and it exists because of who supplies the values: not the person
 * filling in the form, who never typed them and cannot see them, but whoever
 * authored the link they clicked. A format rule on the schema would turn a
 * malformed marketing param into a 400 that blocks a legitimate registration.
 * Each route runs the values through the shared sanitiser instead, where a bad
 * one becomes NULL and the registration succeeds.
 *
 * **Defined once and imported by the educator schema too**, rather than written
 * out in both places. Both registration routes hand these to the same signup
 * trigger under the same three metadata keys, so a second copy is a shape that
 * can drift while both ends still type-check.
 */
export const registrationUtmBody = z.object({
  source: z.string().optional(),
  medium: z.string().optional(),
  campaign: z.string().optional(),
});

export type RegistrationUtmBody = z.infer<typeof registrationUtmBody>;

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
/**
 * The password policy for an account on this platform, stated once.
 *
 * Exported because a gamer in `username` mode holds a password the parent
 * chooses, and it is the same kind of credential guarding the same kind of
 * account — a child's password being held to a weaker bar than their parent's
 * would be a decision nobody made. GoTrue's own policy still stands behind it
 * (the provider refuses a breached or too-short password whatever we accept),
 * so this is the bar the form can state before the round trip, not the whole
 * of it.
 */
export const accountPasswordValue = z
  .string()
  .min(8, "Password must be at least 8 characters");

/**
 * A real mailbox somebody typed to open or name an account, stated once.
 *
 * **Normalised before it is judged.** The address becomes the account's login
 * and the thing a verification token is signed over, and GoTrue lowercases on
 * the way in — so `"Aino@Example.COM "` must produce the row GoTrue will
 * actually hold, not a second spelling of it that every later comparison then
 * has to fold for itself.
 *
 * **And it refuses our own synthetic domain outright.** `@gamer.sogverse.internal`
 * is the namespace a gamer's other two sign-in modes live in: a random handle
 * for a switch-only child, and a username-derived one where GoTrue's uniqueness
 * on the address IS the uniqueness of the username. An address landing there
 * would put a mailbox nobody can read where a real one is promised — and on a
 * PUBLIC registration it is worse than that: a stranger could open an account on
 * `aino@gamer.sogverse.internal` and hold the handle a family will later pick
 * for their child, because that one namespace is exactly what makes usernames
 * unique. The domain is ours and nobody outside this codebase types it, so
 * every schema taking an address a person supplied refuses it here rather than
 * each deciding for itself.
 */
export const realEmailValue = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().email())
  .refine((value) => !value.endsWith(GAMER_EMAIL_DOMAIN), {
    message: `${GAMER_EMAIL_DOMAIN} is our own internal domain — use a real email address`,
  });

export const registerParentBody = z.object({
  email: realEmailValue,
  password: accountPasswordValue,
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
   * Marketing provenance: the UTM values this visit arrived with, if any.
   *
   * See `registrationUtmBody` — the same shape the educator registration takes,
   * and the reason it is defined once.
   */
  utm: registrationUtmBody.optional(),
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
