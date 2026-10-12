import { randomBytes } from "node:crypto";
import { NextResponse, after } from "next/server";
import { z } from "zod";
import { ROUTES } from "@/lib/constants/routes";
import { respondViaResponseUrl } from "@/lib/slack-api.server";
import { hashSlackLinkToken } from "@/lib/slack-link-token.server";
import { verifySlackSignature } from "@/lib/slack-signature.server";
import {
  SLACK_ACCEPT_ACTION_ID,
  SLACK_PREVIEW_ACTION_PREFIX,
  buildSlackLinkFirstReply,
  buildSlackLinkReply,
  buildSlackPreviewPressReply,
  buildSlackRefusalReply,
  type SlackEphemeralReply,
} from "@/lib/substitution-notifications/slack-message";
import { drainSubstitutionNotifications } from "@/lib/substitution-notifications/sync.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin } from "@/lib/url";
import type { SlackLinkTokenInsert } from "@/types";

/**
 * POST /api/slack/interactions — the Slack app's one endpoint. The app's
 * manifest points both its slash command and its interactivity here, so the
 * route tells them apart by the form body: a `command` field is the slash
 * command, a `payload` field is an interaction.
 *
 * **Slack's signature is the whole gate** (`verifySlackSignature`): nothing is
 * parsed before it passes. **Every answer is an empty 200 within Slack's three
 * seconds**, and the work runs after it, answering through the request's
 * `response_url` — ephemeral, so only the person who acted sees it.
 *
 * - **Any slash command is the link command.** The staging and prod apps name
 *   theirs differently so both can live in one workspace, and the app has no
 *   other command, so the name is never read. It mints a one-time token bound
 *   to the caller's Slack account and answers with a button to the page where
 *   a signed-in admin spends it.
 * - **Accept on an offer** approves it as the admin the presser's Slack
 *   account is linked to, then syncs the request's messages in-process, so the
 *   channel's message changes under the presser's eyes. An unlinked presser
 *   gets the link button and nothing changes; a refusal gets its line.
 * - **A press on the admin tool's preview** — any control whose `action_id`
 *   carries the preview prefix — answers that it is a preview and touches
 *   nothing.
 *
 * Parsing is lenient: only the fields used are read, and anything this route
 * cannot place is acknowledged and ignored.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = verifySlackSignature({
    rawBody,
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
  });
  if (!verified) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const origin = getOrigin(request);

  if (form.has("command")) {
    const command = slashCommand.safeParse(Object.fromEntries(form));
    if (command.success) {
      const { user_id, user_name, team_id, response_url } = command.data;
      after(
        answerLinkCommand(response_url, origin, {
          userId: user_id,
          teamId: team_id,
          username: user_name,
        }),
      );
    }
    return acknowledge();
  }

  const press = buttonPress(form.get("payload"));
  if (press?.kind === "preview") {
    after(respond(press.responseUrl, buildSlackPreviewPressReply()));
  } else if (press?.kind === "accept") {
    after(answerAccept(press, origin));
  }
  return acknowledge();
}

/** Slack's acknowledgement: an empty 200, which shows the person nothing. */
function acknowledge(): Response {
  return new Response(null, { status: 200 });
}

// ---------------------------------------------------------------- parsing

/** The slice of a slash command's form body this route reads. */
const slashCommand = z.object({
  user_id: z.string().min(1),
  user_name: z.string().optional(),
  team_id: z.string().min(1),
  response_url: z.string().min(1),
});

/** The slice of an interaction payload this route reads. */
const interactionPayload = z.object({
  type: z.unknown().optional(),
  user: z
    .object({
      id: z.unknown().optional(),
      username: z.unknown().optional(),
      name: z.unknown().optional(),
      team_id: z.unknown().optional(),
    })
    .optional(),
  team: z.object({ id: z.unknown().optional() }).nullish(),
  response_url: z.unknown().optional(),
  actions: z
    .array(z.object({ action_id: z.unknown().optional(), value: z.unknown().optional() }))
    .optional(),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who acted in Slack, as a link token records them. */
interface SlackCaller {
  userId: string;
  teamId: string;
  username: string | undefined;
}

interface AcceptPress {
  kind: "accept";
  offerId: string;
  responseUrl: string;
  caller: SlackCaller;
}

/** A press on a control of the admin tool's preview: answered, never acted on. */
interface PreviewPress {
  kind: "preview";
  responseUrl: string;
}

/**
 * A press this route answers, out of an interaction's `payload` — an Accept,
 * or anything on the preview prefix — or `null` for anything else.
 */
function buttonPress(raw: string | null): AcceptPress | PreviewPress | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = interactionPayload.safeParse(json);
  if (!parsed.success || parsed.data.type !== "block_actions") return null;
  const { user, team, response_url: responseUrl, actions } = parsed.data;

  const isPreview = actions?.some(
    (candidate) =>
      typeof candidate.action_id === "string" &&
      candidate.action_id.startsWith(SLACK_PREVIEW_ACTION_PREFIX),
  );
  if (isPreview) {
    return typeof responseUrl === "string" ? { kind: "preview", responseUrl } : null;
  }

  const action = actions?.find((candidate) => candidate.action_id === SLACK_ACCEPT_ACTION_ID);
  const offerId = action?.value;
  if (typeof offerId !== "string" || !UUID.test(offerId)) return null;

  const userId = user?.id;
  const teamId = team?.id ?? user?.team_id;
  const username = user?.username ?? user?.name;
  if (typeof userId !== "string" || typeof teamId !== "string") return null;
  if (typeof responseUrl !== "string") return null;
  return {
    kind: "accept",
    offerId,
    responseUrl,
    caller: {
      userId,
      teamId,
      username: typeof username === "string" ? username : undefined,
    },
  };
}

// ---------------------------------------------------------------- the link command

const LINK_FAILED = "Sorry, I couldn't create a link right now. Try again in a moment.";

async function answerLinkCommand(
  responseUrl: string,
  origin: string,
  caller: SlackCaller,
): Promise<void> {
  let reply: SlackEphemeralReply;
  try {
    reply = buildSlackLinkReply(await mintLinkUrl(origin, caller));
  } catch (error) {
    console.error("Slack link token error:", error);
    reply = buildSlackRefusalReply(LINK_FAILED);
  }
  await respond(responseUrl, reply);
}

/**
 * A one-time URL that links the caller's Slack account to whichever admin
 * account confirms it.
 *
 * Only the token's SHA-256 is stored, so the table never holds a usable token;
 * the raw value exists in the reply alone. The database gives it ten minutes
 * and spends it on first use. The path is bare on purpose: the proxy sends it
 * on to the reader's own locale with the query intact.
 */
async function mintLinkUrl(origin: string, caller: SlackCaller): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const username = caller.username?.trim().slice(0, 80) || caller.userId;
  const row: SlackLinkTokenInsert = {
    token_hash: hashSlackLinkToken(token),
    slack_user_id: caller.userId,
    slack_team_id: caller.teamId,
    slack_username: username,
  };
  const { error } = await createAdminClient().from("slack_link_tokens").insert(row);
  if (error) throw error;
  // A minted token is base64url, which needs no percent-encoding.
  return `${origin}${ROUTES.linkSlack}?token=${token}`;
}

// ---------------------------------------------------------------- Accept

const ACCEPT_FAILED = "Something went wrong and nothing was accepted. Try again in a moment.";

/** The approval's answer: the request it seated someone on. */
const approvedRequest = z.object({ id: z.string() });

async function answerAccept(press: AcceptPress, origin: string): Promise<void> {
  const supabase = createAdminClient();
  let requestId: string;
  try {
    const { data, error } = await supabase.rpc(
      "approve_session_substitution_offer_for_slack_user",
      { p_slack_user_id: press.caller.userId, p_offer_id: press.offerId },
    );
    if (error) {
      if (error.code === SLACK_ADMIN_NOT_LINKED) {
        await respond(press.responseUrl, await linkFirstReply(origin, press.caller));
        return;
      }
      const line = slackApprovalRefusal(error);
      if (line === ACCEPT_FAILED) console.error("Slack accept error:", error);
      await respond(press.responseUrl, buildSlackRefusalReply(line));
      return;
    }
    requestId = approvedRequest.parse(data).id;
  } catch (error) {
    console.error("Slack accept error:", error);
    await respond(press.responseUrl, buildSlackRefusalReply(ACCEPT_FAILED));
    return;
  }

  // The approval stands whatever happens here: a sync that fails is retried
  // from the outbox, so the presser is told nothing about it.
  try {
    await drainSubstitutionNotifications({ requestIds: [requestId] });
  } catch (error) {
    console.error("Slack accept: notification sync failed:", error);
  }
}

/** `require_slack_linked_admin`'s refusal: no admin account is linked to this Slack user. */
const SLACK_ADMIN_NOT_LINKED = "P0034";

async function linkFirstReply(origin: string, caller: SlackCaller): Promise<SlackEphemeralReply> {
  try {
    return buildSlackLinkFirstReply(await mintLinkUrl(origin, caller));
  } catch (error) {
    console.error("Slack link token error:", error);
    return buildSlackRefusalReply(
      "Nothing was accepted: your Slack account isn't linked to a School of Gaming admin account. Run the link command to link it.",
    );
  }
}

/**
 * The line a refused approval reads as — the web approval dialog's four
 * refusals, in English (the channel is staff-only and has no locale), told
 * apart by the same two signals: the SQLSTATE, then a phrase of the message
 * for the three that share `check_violation`. The dialog names the gedus; the
 * press carries only an offer id, so these lines name nobody. Anything
 * unmatched is the generic line, never the server's own words.
 */
function slackApprovalRefusal(error: { code?: string; message?: string }): string {
  const code = error.code ?? "";
  const message = error.message ?? "";
  if (code === "P0002") {
    return "That gedu has taken their offer back, so there is nobody to approve.";
  }
  if (code === "23514") {
    if (message.includes("is already")) {
      return "This session has already been settled by someone else.";
    }
    if (message.includes("no longer holds a seat")) {
      return "The absent gedu no longer has this session, so there is nothing to substitute for.";
    }
    if (message.includes("can no longer substitute")) {
      return "That gedu can no longer take this session.";
    }
  }
  return ACCEPT_FAILED;
}

/** Answer through the `response_url`; a failure there has nowhere left to go but the log. */
async function respond(responseUrl: string, reply: SlackEphemeralReply): Promise<void> {
  try {
    await respondViaResponseUrl(responseUrl, reply);
  } catch (error) {
    console.error("Slack response_url refused:", error);
  }
}
