import { z } from "zod";

/**
 * What `save_team_profile` returns: the photo path the save replaced, or
 * `null` when the photo did not change. The generated type says `string`
 * because a function's return type carries no nullability; the body returns
 * NULL whenever nothing was replaced.
 */
export const saveTeamProfileResult = z.string().nullable();
