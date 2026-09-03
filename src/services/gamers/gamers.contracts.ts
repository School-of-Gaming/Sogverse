import { z } from "zod";
import { Constants } from "@/types";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import {
  GAMER_USERNAME_PATTERN,
  normalizeGamerUsername,
} from "@/lib/gamer-sign-in";
import { accountPasswordValue } from "@/services/users/parent-registration.contracts";
import { minecraftUsernameValue } from "@/services/minecraft/minecraft.contracts";
import { robloxUsernameValue } from "@/services/roblox/roblox.contracts";

/**
 * Request contracts for the gamer-account API. Both write routes used to check
 * their bodies by hand with `typeof` tests; these schemas are the same rules
 * stated once, so the create and update paths cannot drift apart.
 */

const firstName = z
  .string()
  .trim()
  .min(
    DISPLAY_NAME_MIN,
    `First name must be between ${DISPLAY_NAME_MIN} and ${DISPLAY_NAME_MAX} characters`,
  )
  .max(
    DISPLAY_NAME_MAX,
    `First name must be between ${DISPLAY_NAME_MIN} and ${DISPLAY_NAME_MAX} characters`,
  );

/**
 * Which of the three sign-in modes a child's account is in. Derived from the
 * generated `Constants` so it tracks the database enum rather than restating it.
 */
export const gamerSignInValue = z.enum(Constants.public.Enums.gamer_sign_in);

/**
 * A username a parent picked for their child.
 *
 * **Normalised before it is judged.** The transform lowercases and trims, so
 * `"Aino"` and `" aino "` are the same username and the pattern is checked
 * against what will actually be stored — a parent typing a capital gets an
 * account, not a validation error about a rule they cannot see.
 */
export const gamerUsernameValue = z
  .string()
  .transform(normalizeGamerUsername)
  .refine((value) => GAMER_USERNAME_PATTERN.test(value), {
    message: "Username must be 3–20 letters or numbers",
  });

/**
 * SQLSTATE `P0025` — `create_gamer` refusing a parent who holds no PIN.
 *
 * The gate on leaving a gamer session is the parent's PIN, so a family may not
 * acquire a child account before it has one. Named here rather than inline
 * because the route turns exactly this one refusal into a specific ask ("set a
 * PIN first") and every other failure of that RPC into the generic apology.
 */
export const CREATE_GAMER_PIN_REQUIRED_SQLSTATE = "P0025";

/**
 * The machine-readable codes the gamer write routes attach to a refusal the
 * parent can act on. Everything else is answered generically.
 */
export const GAMER_PIN_REQUIRED = "PIN_REQUIRED";
export const GAMER_USERNAME_TAKEN = "USERNAME_TAKEN";
export const GAMER_EMAIL_TAKEN = "EMAIL_TAKEN";

/**
 * The credential fields, and the rule tying them to a mode.
 *
 * Each mode admits exactly one shape, and the refinements say so rather than
 * letting a route sort it out afterwards:
 *
 *  - `username` — a username AND a password, and no email address. The username
 *    becomes the account's synthetic address; the password is the credential.
 *  - `email` — an address and nothing else. No password is set at creation: the
 *    child verifies the address first and then sets one through the ordinary
 *    reset flow, which is what makes the address load-bearing rather than
 *    decorative.
 *  - `parent` — none of the three. The account is switch-only, and a credential
 *    on it would be one nobody could ever use.
 *
 * Stated as refinements on the object rather than a discriminated union because
 * the PATCH body shares them while every field there is independently optional.
 */
function signInFieldsAreConsistent(body: {
  signIn: "parent" | "username" | "email";
  username?: string;
  email?: string;
  password?: string;
}): boolean {
  if (body.signIn === "username") {
    return (
      body.username !== undefined &&
      body.password !== undefined &&
      body.email === undefined
    );
  }
  if (body.signIn === "email") {
    return (
      body.email !== undefined &&
      body.username === undefined &&
      body.password === undefined
    );
  }
  return (
    body.username === undefined &&
    body.email === undefined &&
    body.password === undefined
  );
}

const SIGN_IN_FIELDS_MESSAGE =
  "Sign-in mode `username` needs a username and a password, `email` needs an email address, and `parent` takes none of them";

/** Request body of POST /api/gamers/create. */
export const createGamerBody = z
  .object({
    firstName,
    // A bare calendar date; the route additionally refuses one in the future.
    dateOfBirth: z.string().min(1, "Date of birth is required"),
    // The form sends "" for "prefer not to say"; that, null and an absent key all
    // mean "no value recorded".
    gender: z
      .union([z.enum(Constants.public.Enums.gender_type), z.literal(""), z.null()])
      .optional(),
    // Both game identities are optional and independent: a parent may give one,
    // both, or neither. Neither is judged for shape here — the platform is asked
    // and its answer decides whether a key is stored beside the name.
    minecraftUsername: minecraftUsernameValue.optional(),
    robloxUsername: robloxUsernameValue.optional(),
    /**
     * Defaulted rather than required, so a client that predates the modes — a
     * cached bundle, a page open across a deploy — creates the switch-only
     * account it has always created instead of failing.
     */
    signIn: gamerSignInValue.default("parent"),
    username: gamerUsernameValue.optional(),
    email: z.string().email().optional(),
    password: accountPasswordValue.optional(),
  })
  .refine(signInFieldsAreConsistent, { message: SIGN_IN_FIELDS_MESSAGE });

export type CreateGamerBody = z.infer<typeof createGamerBody>;

/**
 * Request body of PATCH /api/gamers/[id]. Every field is optional because the
 * parent edits one thing at a time, but sending none of them is a no-op the
 * route refuses rather than silently accepts. An explicit `null` game username
 * unlinks that platform; an absent key leaves the link alone.
 *
 * The credential fields are optional in a way the create body's are not, and the
 * difference is real: an account already in `username` mode may take a new
 * password with no `signIn` key at all (a parent resetting it), and one already
 * in `email` mode may take a new address the same way. What the route refuses —
 * because only the route knows the account's current mode — is a password on an
 * account that is not in `username` mode, and a mode change that arrives without
 * the fields that mode needs.
 */
export const updateGamerBody = z
  .object({
    firstName: firstName.optional(),
    password: accountPasswordValue.optional(),
    minecraftUsername: minecraftUsernameValue.optional(),
    robloxUsername: robloxUsernameValue.optional(),
    signIn: gamerSignInValue.optional(),
    username: gamerUsernameValue.optional(),
    email: z.string().email().optional(),
  })
  .refine(
    (body) =>
      body.firstName !== undefined ||
      body.password !== undefined ||
      body.minecraftUsername !== undefined ||
      body.robloxUsername !== undefined ||
      body.signIn !== undefined ||
      body.username !== undefined ||
      body.email !== undefined,
    {
      message:
        "At least one of firstName, password, signIn, username, email, minecraftUsername, or robloxUsername is required",
    },
  )
  .refine(
    (body) => body.signIn !== "parent" || (!body.username && !body.email && !body.password),
    {
      message:
        "Sign-in mode `parent` is switch-only and takes no username, email or password",
    },
  )
  .refine((body) => body.signIn !== "username" || body.email === undefined, {
    message: "Sign-in mode `username` takes no email address",
  })
  .refine(
    (body) =>
      body.signIn !== "email" ||
      (body.username === undefined && body.password === undefined),
    {
      message:
        "Sign-in mode `email` takes no username, and sets no password — the child sets one after verifying the address",
    },
  );

export type UpdateGamerBody = z.infer<typeof updateGamerBody>;
