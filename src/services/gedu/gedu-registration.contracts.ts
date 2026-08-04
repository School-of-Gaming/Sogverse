import { z } from "zod";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";

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
  minecraftUsername: z.string().optional(),
  robloxUsername: z.string().optional(),
});

export type RegisterGeduBody = z.infer<typeof registerGeduBody>;
