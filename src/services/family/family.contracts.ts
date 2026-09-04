import { z } from "zod";
import { Constants } from "@/types";

/**
 * One switchable account in the family switcher (self + linked gamers).
 *
 * `sign_in` is the child's sign-in mode and is `null` for a customer, who has no
 * such thing. It is not what decides whether a switch is possible — that is the
 * caller's own session provenance, and a switch is either free, priced at a
 * parent's PIN, or refused outright — but the switcher still renders the mode
 * (a username-mode child is one a family can also reach by logging in), so the
 * list carries it.
 *
 * **Optional as well as nullable, and the two absences mean the same thing.**
 * The route always sends the field; what is optional is a member constructed
 * in-process — a fixture, a hand-built row from before the modes existed — and
 * reading a missing mode as "no credential of their own" is the honest answer,
 * because it claims nothing the account may not hold.
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
 * `src/lib/session-provenance.ts`; it decides whether a switch out of this
 * session costs a parent's PIN or is refused altogether, and the switcher
 * renders the matching prompt.
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
 * `pin` is optional here and required by the route on exactly one path, because
 * whether it is required is a fact about the *caller's* session that no client
 * can be trusted to assert. A parent switching down to a child sends nothing; a
 * child leaving a switched-in session sends `pin`; a child in a session they
 * opened with their own credentials cannot switch at all, and sending a `pin`
 * does not change that.
 */
export const switchAccountBody = z.object({
  userId: z.string().min(1, "userId is required"),
  pin: z.string().optional(),
});

export type SwitchAccountBody = z.infer<typeof switchAccountBody>;

/**
 * Every refusal of the switch route that the client is meant to act on, as
 * string literals rather than an enum so the wire value and the source read the
 * same. All four are answered with 403 — the caller is authenticated and the
 * target is in their family; what is missing, wrong, or impossible is the gate.
 *
 *  - `PIN_REQUIRED` — a family session must send a parent's PIN.
 *  - `PIN_NOT_SET` — nobody in the family holds a PIN, so no PIN can be right.
 *    Distinct from `PIN_INVALID` on purpose: typing more carefully cannot fix
 *    it, and the family is sent to set one instead.
 *  - `PIN_INVALID` — the PIN did not match any linked parent's.
 *  - `SIGN_OUT_REQUIRED` — the caller is a gamer in a session they opened with
 *    their own credentials, and such a session cannot switch to anyone. No
 *    credential in the body changes it; the way to the other account is to sign
 *    out and sign in as them.
 */
export const SWITCH_PIN_REQUIRED = "PIN_REQUIRED";
export const SWITCH_PIN_NOT_SET = "PIN_NOT_SET";
export const SWITCH_PIN_INVALID = "PIN_INVALID";
export const SWITCH_SIGN_OUT_REQUIRED = "SIGN_OUT_REQUIRED";

export const switchAccountErrorCode = z.enum([
  SWITCH_PIN_REQUIRED,
  SWITCH_PIN_NOT_SET,
  SWITCH_PIN_INVALID,
  SWITCH_SIGN_OUT_REQUIRED,
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
