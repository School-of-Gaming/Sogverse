import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { lookupRobloxUser } from "@/lib/roblox";
import {
  groupMemberRobloxResult,
  robloxAccountWriteResult,
  updateGroupMemberRobloxBody,
} from "@/services/roblox/roblox.contracts";

/**
 * PATCH /api/gedu/gamers/[gamerId]/roblox — a gedu fixing the Roblox username
 * of a child in a group they teach. The Minecraft route beside it is the same
 * edit on the other platform, and the two are deliberately the same shape.
 *
 * It exists as a route rather than a bare RPC call because the lookup has to
 * happen on the server, and on this platform that is not a preference: both
 * Roblox APIs refuse a browser outright, so an account id arriving from a
 * client could not have been looked up there honestly. Resolving it here is
 * what makes a gedu's save land *verified* — the account id is stored beside
 * the name — rather than leaving a pending handle for someone else to confirm.
 *
 * **The lookup asked for is the username→id hop alone**, not the profile helper
 * the verify route uses. The only thing this route takes from Roblox is the
 * account key; the two thumbnail hops that helper adds would spend two more
 * requests against a 60-per-minute-per-IP budget the whole fleet shares, to
 * resolve pictures nothing here renders. The roster that shows the result
 * resolves its own figures in one batched call afterwards.
 *
 * **The name stored is the name that was sent.** The row adopted the canonical
 * casing before it committed, so what arrives is what the gedu meant; a route
 * rewriting it would make the stored value depend on when the lookup last ran.
 * A handle Roblox cannot resolve is saved all the same, with no account id —
 * that is an unverified account, which is a success and not an error.
 *
 * Authorization is NOT in this file, and deliberately so: the write goes
 * through `set_group_member_roblox`, which re-derives the caller from
 * `auth.uid()` and refuses any gamer who is not actively participating in a
 * group that caller is assigned to. The gamer id here names the target; it
 * grants nothing, and a gedu aiming it at somebody else's child gets a 403 from
 * the database rather than from a check this route could forget to write.
 */
export const PATCH = defineRoute({
  posture: "role-gated",
  roles: "gedu",
  forbiddenMessage: "Only game educators can edit a group member's Roblox username",
  params: z.object({ gamerId: z.string().uuid() }),
  body: updateGroupMemberRobloxBody,
  response: robloxAccountWriteResult,

  handler: async ({ supabase, params, body }) => {
    const { robloxUsername } = body;

    // Clearing skips the lookup entirely — there is nothing to resolve, and
    // asking Roblox about an empty name is a round trip for no answer.
    const resolved =
      robloxUsername === null ? null : await lookupRobloxUser(robloxUsername);

    const { data, error } = await supabase.rpc("set_group_member_roblox", {
      p_participant_id: params.gamerId,
      // Empty string, not null, is how "clear it" travels — the generated RPC
      // argument types make every text parameter a non-null `string`, and the
      // function normalizes '' back to SQL NULL at the other end.
      p_roblox_username: robloxUsername ?? "",
      // The id argument is **omitted** rather than passed as a falsy number
      // when no account was confirmed. Its default is SQL NULL, and there is no
      // integer that could stand in for "not verified" — every Roblox id is a
      // positive int64, so a 0 would be a value the column has no business
      // holding. Spreading an empty object is what "leave it at its default"
      // looks like against a generated optional argument.
      ...(resolved === null ? {} : { p_roblox_user_id: resolved.userId }),
    });

    if (error) throw error;

    const written = groupMemberRobloxResult.parse(data);

    return {
      success: true as const,
      roblox_username: written.roblox_username,
      roblox_user_id: written.roblox_user_id,
    };
  },
});
