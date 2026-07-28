import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";

/** Request body of PATCH /api/user/locale. */
const setLocaleBody = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
});

/**
 * PATCH /api/user/locale — set the caller's own UI locale.
 *
 * Model B. `profiles.locale` carries a column-level UPDATE grant and the
 * users_update_own_profile policy scopes the statement to `auth.uid()`, so the
 * database refuses a write aimed at anyone else's row even though this handler
 * never aims one.
 *
 * The any-authenticated posture is the point of this route: every role sets
 * their own interface language, and the write is scoped to the caller's own row
 * by the grant plus the self-update policy, so the role is genuinely irrelevant.
 * The caller's id comes from the verified session, never from the body.
 */
export const PATCH = defineRoute({
  posture: "any-authenticated",
  reason:
    "every role sets their own interface language, and the write is scoped to the caller's own row by a column grant plus a self-update policy, so the role is genuinely irrelevant here",
  body: setLocaleBody,
  response: setLocaleBody,

  // The route used to answer 500 for every database failure except the policy
  // refusal. On the shared table the refusal is still a 403 and anything
  // unrecognized is still a logged 500, so the observable mapping is unchanged
  // — it is now the shared one rather than a local re-implementation.

  handler: async ({ supabase, user, body }) => {
    const { error } = await supabase
      .from("profiles")
      .update({ locale: body.locale })
      .eq("id", user.id);

    if (error) throw error;

    return { locale: body.locale };
  },
});
