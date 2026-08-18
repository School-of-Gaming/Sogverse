import { z } from "zod";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import { minecraftUsernameValue } from "@/services/minecraft/minecraft.contracts";
import { robloxUsernameValue } from "@/services/roblox/roblox.contracts";

/**
 * Request body for public gedu self-registration (`POST /api/gedu/register`).
 * Shared by the route (which validates with it) and the register-gedu form.
 *
 * Optional text fields are sent through as-is and the `register_gedu` RPC
 * NULLIFs them server-side; the form simply omits a field nobody filled in.
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
  /**
   * Both game handles are optional, and the two spellings of "no handle" land in
   * the same place. The form omits the key outright for a field nobody filled in
   * — `undefined`, which `.optional()` takes — and that is the path actually
   * exercised. A surface that instead posts `''` is equally fine: the shared
   * value schemas normalize and collapse an empty field to `null`, which is the
   * same "there is no name here" every other write path sends. Between them they
   * cover the sentinel this body used to spell out with a union of its own.
   */
  minecraftUsername: minecraftUsernameValue.optional(),
  robloxUsername: robloxUsernameValue.optional(),
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
