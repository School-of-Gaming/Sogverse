import { z } from "zod";
import { Constants } from "@/types";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import { minecraftUsernameValue } from "@/services/minecraft/minecraft.contracts";
import { robloxUsernameValue } from "@/services/roblox/roblox.contracts";
import { registrationUtmBody } from "@/services/users/parent-registration.contracts";

/**
 * Request body for public gedu self-registration (`POST /api/gedu/register`).
 * Shared by the route (which validates with it) and the register-gedu form.
 *
 * Optional text fields are sent through as-is and the `register_gedu` RPC
 * NULLIFs them server-side; the form simply omits a field nobody filled in.
 * Location ids are validated for *shape* here — the locations FK is the source
 * of truth for whether a row exists. Spoken languages are different since
 * 00199: the vocabulary is a Postgres enum, so this schema checks the values
 * themselves against codegen and the RPC's argument type is that same enum.
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
  spokenLanguages: z
    .array(z.enum(Constants.public.Enums.spoken_language))
    .default([]),
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
   * Marketing provenance: the UTM values this visit arrived with, if any.
   *
   * Imported rather than restated — the parent registration body takes the
   * identical shape, both routes hand it to the same signup trigger, and the
   * reasoning for why these carry no format rule lives with the definition.
   */
  utm: registrationUtmBody.optional(),
});

export type RegisterGeduBody = z.infer<typeof registerGeduBody>;
