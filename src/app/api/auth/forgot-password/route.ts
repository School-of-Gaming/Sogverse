import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { sendPasswordResetEmail } from "@/lib/password-reset.server";

const requestSchema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/auth/forgot-password
 *
 * Always answers 200, whatever happens. That is the enumeration defence, and it
 * is why the body is parsed inside the handler rather than through the
 * primitive's body slot: the slot answers 400 on a schema failure, which would
 * tell a prober that a well-formed address had been accepted and a malformed
 * one had not. Every failure path below returns the same success body.
 *
 * The send itself lives in `src/lib/password-reset.server.ts`, because the
 * verify-email page sends the identical mail when a child confirms the address
 * on an account that has no password yet. That module also refuses a synthetic
 * gamer address, which is what keeps this route from mailing into a void when
 * somebody types a username-mode child's handle into the form.
 */
export const POST = defineRoute({
  posture: "public",
  reason:
    "a password reset is requested by someone who cannot sign in — and, from the settings page, by someone who is signed in and wants a new password anyway; it is gateless because the first caller has no session to gate, not because the second is exempt from one. Always answers 200 regardless of whether the address exists, which is the enumeration defence",

  handler: async ({ request }) => {
    const success = { success: true };
    try {
      const parsed = requestSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (parsed.success) {
        await sendPasswordResetEmail({ email: parsed.data.email, request });
      }
    } catch (error) {
      // Still 200, for the same reason a malformed body is: a 500 from the
      // wrapper's catch would itself be an enumeration signal.
      console.error(
        "Forgot password error:",
        error instanceof Error ? error.message : error,
      );
    }
    return success;
  },
});
