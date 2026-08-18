import { defineRoute } from "@/lib/api/define-route";
import {
  resetPasswords,
  type PasswordResetOutcome,
} from "@/lib/microsoft-graph";
import {
  minecraftPasswordResetBody,
  minecraftPasswordResetResponse,
  type MinecraftPasswordResetFailure,
  type MinecraftPasswordResetResult,
} from "@/services/minecraft-education/minecraft-education.contracts";

/**
 * The Graph module's failure, as the wire shape. Written out case by case
 * rather than spread from the outcome so the compiler checks both ends: a new
 * code on either side fails here instead of travelling as an unrecognised
 * payload the card has no message for.
 */
function toWireFailure(
  outcome: Extract<PasswordResetOutcome, { ok: false }>,
): MinecraftPasswordResetFailure {
  switch (outcome.code) {
    case "invalid_username":
      return { code: "invalid_username" };
    case "not_found":
      return {
        code: "not_found",
        username: outcome.username,
        domains: [...outcome.domains],
      };
    case "azure_auth":
      return { code: "azure_auth" };
    case "graph_error":
      return { code: "graph_error", status: outcome.status };
  }
}

/**
 * Reset the Minecraft Education password for a batch of usernames.
 *
 * The in-app half of the Discord `/reset-password` command: the same Graph
 * calls against the same two sog.gg domains, reached from the gedu dashboard
 * and the admin tools page instead of a chat channel. The Discord command
 * stays — a gedu mid-session is often already in Discord — and both ends now
 * run through the same module, so the two cannot drift.
 *
 * **Gated exactly like the instant voice room**: admins and *certified* gedus
 * only. Resetting somebody's account password is a moderator power, and an
 * educator an admin has not approved yet does not hold it. The gate is
 * `requireCertifiedGedu` on the shared role gate rather than anything this
 * handler does, so it cannot be lost by editing this file.
 *
 * **No audit table, deliberately, and here is the reasoning to re-read before
 * adding one.** These accounts are shared class logins today: a gedu hands one
 * out at the start of a session and the same name is used by whoever sits at
 * that machine next week. A row saying "this gedu reset `builder07`" therefore
 * records who *did* the reset and nothing about whose account it was, which is
 * the half an audit trail exists to answer. The accounts are going to be
 * auto-assigned per gamer, and at that point a reset names a child and the
 * auditing question becomes worth answering properly — against a schema
 * designed for it, not one retrofitted around shared logins. Until then the
 * server log below is the record: the actor, the target, and the outcome, at
 * one line per reset, and **never the password**.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["admin", "gedu"],
  forbiddenMessage:
    "Only admins and educators can reset Minecraft Education passwords",
  // An uncertified gedu is not a trusted moderator: block resets until an admin
  // certifies them, exactly as the instant voice room does.
  requireCertifiedGedu: true,
  body: minecraftPasswordResetBody,
  response: minecraftPasswordResetResponse,

  handler: async ({ body, user }) => {
    const outcomes = await resetPasswords(body.usernames);

    const results: MinecraftPasswordResetResult[] = body.usernames.map(
      (username, index) => {
        // One outcome per input, in input order — the module's contract. The
        // fallback is unreachable and exists only so the index read is total.
        const outcome = outcomes[index] ?? {
          ok: false as const,
          code: "graph_error" as const,
          status: 500,
        };

        if (outcome.ok) {
          return {
            username,
            ok: true,
            upn: outcome.upn,
            password: outcome.password,
            forceChange: outcome.forceChange,
          };
        }

        return { username, ok: false, error: toWireFailure(outcome) };
      },
    );

    // The audit record, until the accounts are per-gamer (see above). Target and
    // outcome only — a password in a log is a password in every log sink it is
    // shipped to, which is exactly the disclosure the reset was meant to avoid.
    for (const result of results) {
      const target = result.ok ? result.upn : result.username;
      const outcome = result.ok ? "ok" : result.error.code;
      console.log(
        `[minecraft-password-reset] actor=${user.id} target=${target} outcome=${outcome}`,
      );
    }

    return { results };
  },
});
