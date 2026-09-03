import { z } from "zod";
import { Constants } from "@/types";

/**
 * One switchable account in the family switcher (self + linked gamers).
 *
 * `sign_in` is the child's sign-in mode and is `null` for a customer, who has no
 * such thing. The switcher needs it because reachability depends on it: from a
 * gamer's *own* session, leaving costs the target's password, and a sibling in
 * `parent` mode has no password to type — so that tile is unreachable and says
 * so rather than failing when it is clicked.
 *
 * **Optional as well as nullable, and the two absences mean the same thing.**
 * The route always sends the field; what is optional is a member constructed
 * in-process — a fixture, a hand-built row from before the modes existed — and
 * reading a missing mode as "no credential of their own" is both the honest
 * answer and the conservative one, because it withholds a path rather than
 * offering one the account cannot satisfy.
 */
export const familyMember = z.object({
  id: z.string(),
  role: z.enum(["customer", "gamer"]),
  first_name: z.string(),
  sign_in: z.enum(Constants.public.Enums.gamer_sign_in).nullable().optional(),
});

export type FamilyMember = z.infer<typeof familyMember>;

/**
 * Where the caller's own session came from — `own` if they typed this account's
 * password, `family` if it was handed over by an account switch. See
 * `src/lib/session-provenance.ts`; it decides which gate a switch out of this
 * session has to pass, and the switcher renders the matching prompt.
 */
export const sessionProvenanceValue = z.enum(["own", "family"]);

/** Response of GET /api/family/list. */
export const familyListResponse = z.object({
  family: z.array(familyMember),
  session_provenance: sessionProvenanceValue,
});

export type FamilyListResponse = z.infer<typeof familyListResponse>;

// ---------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------

/**
 * Request body of POST /api/auth/switch-account.
 *
 * The two credentials are optional here and required by the route, because
 * which one is required is a fact about the *caller's* session that no client
 * can be trusted to assert. A parent switching down to a child sends neither; a
 * child leaving a switched-in session sends `pin`; a child leaving a session
 * they signed into themselves sends the target's `password`.
 */
export const switchAccountBody = z.object({
  userId: z.string().min(1, "userId is required"),
  pin: z.string().optional(),
  password: z.string().optional(),
});

export type SwitchAccountBody = z.infer<typeof switchAccountBody>;

/**
 * Every refusal of the switch route that the client is meant to act on, as
 * string literals rather than an enum so the wire value and the source read the
 * same. All six are answered with 403 — the caller is authenticated and the
 * target is in their family; what is missing or wrong is the gate.
 *
 *  - `PIN_REQUIRED` — a family session must send a parent's PIN.
 *  - `PIN_NOT_SET` — nobody in the family holds a PIN, so no PIN can be right.
 *    Distinct from `PIN_INVALID` on purpose: typing more carefully cannot fix
 *    it, and the family is sent to set one instead.
 *  - `PIN_INVALID` — the PIN did not match any linked parent's.
 *  - `PASSWORD_REQUIRED` — an own session must send the TARGET's password.
 *  - `PASSWORD_INVALID` — it was wrong. Also the answer when the target has no
 *    password at all, so this cannot be read as an oracle for which accounts
 *    hold one.
 *  - `TARGET_UNREACHABLE` — the target is a sibling in `parent` mode, which has
 *    no password by construction, so an own session cannot reach it at all.
 */
export const SWITCH_PIN_REQUIRED = "PIN_REQUIRED";
export const SWITCH_PIN_NOT_SET = "PIN_NOT_SET";
export const SWITCH_PIN_INVALID = "PIN_INVALID";
export const SWITCH_PASSWORD_REQUIRED = "PASSWORD_REQUIRED";
export const SWITCH_PASSWORD_INVALID = "PASSWORD_INVALID";
export const SWITCH_TARGET_UNREACHABLE = "TARGET_UNREACHABLE";

export const switchAccountErrorCode = z.enum([
  SWITCH_PIN_REQUIRED,
  SWITCH_PIN_NOT_SET,
  SWITCH_PIN_INVALID,
  SWITCH_PASSWORD_REQUIRED,
  SWITCH_PASSWORD_INVALID,
  SWITCH_TARGET_UNREACHABLE,
]);

export type SwitchAccountErrorCode = z.infer<typeof switchAccountErrorCode>;

/** Response of a successful POST /api/auth/switch-account. */
export const switchAccountResponse = z.object({ success: z.literal(true) });

/**
 * The refusal shape. `code` is optional because the route also answers 400 and
 * 403 for things that are not gate failures at all — switching to yourself, or
 * to somebody outside your family — and those carry no code by design.
 */
export const switchAccountErrorResponse = z.object({
  error: z.string(),
  code: switchAccountErrorCode.optional(),
});
