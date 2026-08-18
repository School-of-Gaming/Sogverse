import { z } from "zod";

/**
 * Wire shapes for `POST /api/tools/minecraft-password-reset`, shared by the
 * route (which parses the body with them) and the service (which parses the
 * response with them).
 *
 * **The wire carries codes, never sentences.** The Graph module answers in
 * outcome codes precisely so the words can be chosen by whoever is rendering
 * them, and putting an English sentence back on the wire here would undo that
 * — the card is a translated surface in five locales, and a message that
 * arrived pre-worded could only ever be shown in one of them.
 */

/**
 * How many usernames one submit may carry.
 *
 * Sized to a class list with room to spare rather than to anything Graph
 * imposes: the resets run sequentially against a shared tenant-wide budget, so
 * the cap is what stops one paste from turning into a several-minute request.
 */
export const MINECRAFT_PASSWORD_RESET_MAX_USERNAMES = 50;

/**
 * A bare Minecraft Education username — no `@`, no whitespace.
 *
 * The same three tests the Graph module applies before it will spend a Graph
 * call, restated here so a malformed entry is refused at the boundary with a
 * 400 instead of travelling the whole way to Azure to come back as a failure
 * row. The module keeps its own copy because it has callers that never come
 * through this route (the Discord command).
 */
const username = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !value.includes("@") && !/\s/.test(value), {
    message: "Enter the bare username, not the full email address",
  });

export const minecraftPasswordResetBody = z.object({
  usernames: z
    .array(username)
    .min(1)
    .max(MINECRAFT_PASSWORD_RESET_MAX_USERNAMES),
});

export type MinecraftPasswordResetBody = z.infer<
  typeof minecraftPasswordResetBody
>;

/**
 * Why one username did not get a new password. Mirrors the Graph module's
 * failure codes one for one, and carries the same detail each message needs:
 * the domains that were tried, or the Graph status.
 */
const resetFailure = z.discriminatedUnion("code", [
  z.object({ code: z.literal("invalid_username") }),
  z.object({
    code: z.literal("not_found"),
    /** The sanitized username — the name the account would have had. */
    username: z.string(),
    domains: z.array(z.string()),
  }),
  z.object({ code: z.literal("azure_auth") }),
  z.object({ code: z.literal("graph_error"), status: z.number().int() }),
]);

export const minecraftPasswordResetResult = z.discriminatedUnion("ok", [
  z.object({
    /** The username exactly as it was submitted, so a row can be labelled. */
    username: z.string(),
    ok: z.literal(true),
    /** The full UPN the account was found under — which domain matched. */
    upn: z.string(),
    password: z.string(),
    /** `@gedu.sog.gg` accounts must change the password on first sign-in. */
    forceChange: z.boolean(),
  }),
  z.object({
    username: z.string(),
    ok: z.literal(false),
    error: resetFailure,
  }),
]);

/** One result per submitted username, in the order they were submitted. */
export const minecraftPasswordResetResponse = z.object({
  results: z.array(minecraftPasswordResetResult),
});

export type MinecraftPasswordResetResult = z.infer<
  typeof minecraftPasswordResetResult
>;
export type MinecraftPasswordResetResponse = z.infer<
  typeof minecraftPasswordResetResponse
>;
/** Just the failure half — what the card's message lookup switches on. */
export type MinecraftPasswordResetFailure = z.infer<typeof resetFailure>;
