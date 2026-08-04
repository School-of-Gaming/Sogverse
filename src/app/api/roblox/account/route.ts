import { defineRoute } from "@/lib/api/define-route";
import { lookupRobloxProfile } from "@/lib/roblox";
import {
  robloxAccountWriteResult,
  updateRobloxAccountBody,
} from "@/services/roblox/roblox.contracts";

/**
 * PATCH /api/roblox/account — link (or unlink) the CALLER'S OWN Roblox account.
 *
 * The upsert runs on the user-bound client, so the
 * users_insert_own_roblox_account / users_update_own_roblox_account policies
 * re-derive the target row from `auth.uid()`. The row key is the session's user
 * id and is never read from the request, so there is no way to name someone
 * else's row here — and if that ever changed, RLS would refuse it.
 *
 * The lookup is re-run here rather than trusted from the client, which is not
 * redundant with the row's own check: a client-verified name is not evidence.
 * On this platform it is also the only way to obtain the account id at all —
 * both Roblox APIs refuse a browser, so the number could never have come from
 * one honestly.
 */
export const PATCH = defineRoute({
  posture: "role-gated",
  roles: ["gamer", "gedu"],
  forbiddenMessage: "Only gamers and gedus can update their Roblox username",
  body: updateRobloxAccountBody,
  response: robloxAccountWriteResult,

  handler: async ({ supabase, user, body }) => {
    const { robloxUsername } = body;

    // A handle Roblox cannot resolve is still stored — it is the child's answer,
    // and an unverified name plus a sentence is how this platform's failed
    // lookup is modelled everywhere else. Only the account id is withheld.
    const upsertData =
      robloxUsername === null
        ? {
            user_id: user.id,
            roblox_username: null,
            roblox_user_id: null,
          }
        : {
            user_id: user.id,
            roblox_username: robloxUsername,
            roblox_user_id:
              (await lookupRobloxProfile(robloxUsername))?.userId ?? null,
          };

    const { error } = await supabase
      .from("roblox_accounts")
      .upsert(upsertData, { onConflict: "user_id" });

    if (error) throw error;

    return {
      success: true as const,
      roblox_username: upsertData.roblox_username,
      roblox_user_id: upsertData.roblox_user_id,
    };
  },
});
