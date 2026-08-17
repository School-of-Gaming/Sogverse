import { z } from "zod";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import { minecraftUsernameValue } from "@/services/minecraft/minecraft.contracts";
import { robloxUsernameValue } from "@/services/roblox/roblox.contracts";

/**
 * An optional game handle on a form that also uses `''` to mean "not given".
 *
 * **The sentinel is expressed here, in the schema, rather than checked in the
 * route.** This body used to declare both handles as bare `z.string()` and leave
 * the format rules to hand-written `if` blocks in the handler, each carrying its
 * own copy of the platform's error message — three places to keep in step, and
 * the copies had already drifted from the shared ones in wording. Composing the
 * real value schema with the sentinel says the same thing once: `''` is absent,
 * anything else has to be a name that platform could actually issue.
 *
 * The empty literal comes first because a union tries its members in order, and
 * `''` would otherwise be tested against a format rule it is defined to bypass.
 */
function optionalGameHandle(username: z.ZodType<string | null>) {
  return z.union([z.literal(""), username]).optional();
}

/**
 * Request body for public gedu self-registration (`POST /api/gedu/register`).
 * Shared by the route (which validates with it) and the register-gedu form.
 *
 * Optional text fields are sent through as-is (the form posts `""` for an empty
 * phone or game handle); the `register_gedu` RPC NULLIFs them server-side.
 * Language and location ids are validated for *shape* here — the DB (the
 * validate_profile_languages trigger and the locations FK) is the source of
 * truth for whether the values actually exist.
 */
export const registerGeduBody = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z
    .string()
    .trim()
    .min(DISPLAY_NAME_MIN)
    .max(DISPLAY_NAME_MAX),
  lastName: z
    .string()
    .trim()
    .min(DISPLAY_NAME_MIN)
    .max(DISPLAY_NAME_MAX),
  phone: z.string().optional(),
  spokenLanguages: z.array(z.string()).default([]),
  locale: z.string().optional(),
  locationIds: z.array(z.string().uuid()).default([]),
  minecraftUsername: optionalGameHandle(minecraftUsernameValue),
  robloxUsername: optionalGameHandle(robloxUsernameValue),
  /**
   * Marketing provenance: the `?ref=` code this visit arrived with, if any.
   *
   * **A plain optional string on purpose — no `.regex()` here.** This is a
   * deliberate exception to this contract's usual "the body schema is the
   * validation" discipline, and it exists because of who supplies the value: not
   * the educator filling in the form, who never typed it and cannot see it, but
   * whoever authored the link they clicked. A format rule on the schema would
   * turn a malformed marketing param into a 400 that blocks a legitimate
   * registration. The handler runs it through the shared sanitiser instead,
   * where a bad value becomes NULL and the registration succeeds.
   */
  referralCode: z.string().optional(),
});

export type RegisterGeduBody = z.infer<typeof registerGeduBody>;
