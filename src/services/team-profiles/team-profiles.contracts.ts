import { z } from "zod";
import { Constants } from "@/types";

/**
 * What `save_team_profile` returns: the photo path the save replaced, or
 * `null` when the photo did not change. The generated type says `string`
 * because a function's return type carries no nullability; the body returns
 * NULL whenever nothing was replaced.
 */
export const saveTeamProfileResult = z.string().nullable();

/**
 * What the team photo upload route answers: the stored object's path in the
 * person's folder, `<user_id>/<name>`, for the save to name.
 */
export const storeTeamPhotoResponse = z.object({ path: z.string().min(1) });

/**
 * One row of `list_public_team_profiles` / `get_public_team_profile`: an
 * approved profile, narrowed to what the public team page shows. Written from
 * the function body, because a function's generated return type carries no
 * nullability and types the translations as `Json`:
 *
 * - `role` is only ever an admin's or a Gedu's; the body filters every other.
 * - `last_name` and `title` are an admin's alone, NULL for a Gedu, who is
 *   public by first name and nickname. An admin's are never NULL: the last
 *   name is a NOT NULL column, and `save_team_profile` refuses to mark an
 *   admin's profile ready without a title, which it must be to be public.
 * - `photo_version` is an md5 of the photo's object path, so it changes with
 *   the photo; NULL only for a profile with no photo, which cannot be public.
 * - `translations` is every locale the person wrote, ordered by locale, and
 *   may name one the site no longer serves.
 * - `created_at` is when the profile was first saved, which never moves: two
 *   people deriving one public address settle it by age.
 */
const publicTeamProfileRowBase = z.object({
  user_id: z.string().uuid(),
  first_name: z.string(),
  nickname: z.string().nullable(),
  pick: z.number().int().nullable(),
  spoken_languages: z.array(z.enum(Constants.public.Enums.spoken_language)),
  photo_version: z.string().nullable(),
  translations: z.array(
    z.object({
      locale: z.string(),
      short_description: z.string(),
      long_description: z.string(),
      fun_fact: z.string().nullable(),
    }),
  ),
  created_at: z.string(),
});

export const publicTeamProfileRow = z.discriminatedUnion("role", [
  publicTeamProfileRowBase.extend({
    role: z.literal("admin"),
    last_name: z.string(),
    title: z.string(),
  }),
  publicTeamProfileRowBase.extend({
    role: z.literal("gedu"),
    last_name: z.null(),
    title: z.null(),
  }),
]);

export type PublicTeamProfileRow = z.infer<typeof publicTeamProfileRow>;

export const publicTeamProfileRows = z.array(publicTeamProfileRow);
