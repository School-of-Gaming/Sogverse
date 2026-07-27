import { z } from "zod";
import { Constants } from "@/types";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import { minecraftUsernameValue } from "@/services/minecraft/minecraft.contracts";

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

/** Request body of POST /api/gamers/create. */
export const createGamerBody = z.object({
  firstName,
  // A bare calendar date; the route additionally refuses one in the future.
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  // The form sends "" for "prefer not to say"; that, null and an absent key all
  // mean "no value recorded".
  gender: z
    .union([z.enum(Constants.public.Enums.gender_type), z.literal(""), z.null()])
    .optional(),
  minecraftUsername: minecraftUsernameValue.optional(),
});

/**
 * Request body of PATCH /api/gamers/[id]. Every field is optional because the
 * parent edits one thing at a time, but sending none of them is a no-op the
 * route refuses rather than silently accepts. An explicit `null` Minecraft
 * username unlinks; an absent key leaves the link alone.
 */
export const updateGamerBody = z
  .object({
    firstName: firstName.optional(),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters")
      .optional(),
    minecraftUsername: minecraftUsernameValue.optional(),
  })
  .refine(
    (body) =>
      body.firstName !== undefined ||
      body.password !== undefined ||
      body.minecraftUsername !== undefined,
    {
      message:
        "At least one of firstName, password, or minecraftUsername is required",
    },
  );
