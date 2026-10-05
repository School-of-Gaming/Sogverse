import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import {
  verifyKey,
  InteractionType,
  InteractionResponseType,
} from "discord-interactions";
import {
  DEFAULT_LOCALE,
  matchLocaleFromHeader,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { ROUTES } from "@/lib/constants/routes";
import { DISCORD_API_BASE, discordBotHeaders } from "@/lib/discord-api.server";
import { hashDiscordLinkToken } from "@/lib/discord-link-token.server";
import {
  DISCORD_FLAG_EPHEMERAL,
  SUB_NOTE_INPUT_ID,
  buildFiledMessage,
  buildNoteModal,
  buildNoticeMessage,
  buildReasonStepMessage,
  buildRefusalMessage,
  buildSessionPickerMessage,
  discordSubLogoUrl,
  loadDiscordSubCopy,
  parseReasonValue,
  parseSessionValue,
  parseSubCustomId,
  type DiscordComponentsMessage,
  type DiscordSubCopy,
} from "@/lib/discord-substitution-message";
import {
  fileDiscordSubstitutionRequest,
  getDiscordGeduUpcomingSessions,
  isDiscordGeduNotLinked,
  resolveDiscordGedu,
} from "@/lib/discord-substitution.server";
import { askGeduGuru, askHappinappi } from "@/lib/gemini";
import { resetPassword, type PasswordResetOutcome } from "@/lib/microsoft-graph";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendableImageOrigin } from "@/lib/email-templates/render-context";
import { getOrigin } from "@/lib/url";
// The module by name rather than the package index: that re-exports
// `"use client"` query hooks, which a route has no business loading.
import { substitutionRequestFailureKey } from "@/services/session-substitution/session-substitution.refusals";
import type { DiscordLinkTokenInsert, SubstitutionReason } from "@/types";

// The Discord user who ran the command. `id` and `username` are read as
// unknown and narrowed where used, so a shape change Discord makes to either
// can only cost `/link` its answer, never break the webhook for every command.
const discordUser = z.object({
  id: z.unknown().optional(),
  username: z.unknown().optional(),
});

// Just the slice of Discord's interaction payload we use. Lenient on
// purpose — unknown fields and option value types Discord may add must not
// break the webhook.
const discordInteraction = z.object({
  type: z.number(),
  token: z.string().optional(),
  /** The caller's Discord client language, such as `fi` or `sv-SE`. */
  locale: z.unknown().optional(),
  // In a server the caller is `member.user`; in a DM it is `user`.
  member: z.object({ user: discordUser.optional() }).optional(),
  user: discordUser.optional(),
  data: z
    .object({
      // A command's name; absent on a component press and a modal submit.
      name: z.string().optional(),
      options: z.array(z.object({ value: z.unknown() })).optional(),
      // A component press or a modal submit: which control, what was picked,
      // and the modal's fields.
      custom_id: z.unknown().optional(),
      values: z.array(z.unknown()).optional(),
      components: z.unknown().optional(),
    })
    .optional(),
});

type DiscordInteraction = z.infer<typeof discordInteraction>;

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID!;

/** Only the caller sees the message (Discord's EPHEMERAL message flag). */
const EPHEMERAL = DISCORD_FLAG_EPHEMERAL;
/** No link preview under the message (Discord's SUPPRESS_EMBEDS flag). */
const SUPPRESS_EMBEDS = 1 << 2;

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-signature-ed25519") ?? "";
  const timestamp = request.headers.get("x-signature-timestamp") ?? "";

  if (!(await verifyKey(body, signature, timestamp, DISCORD_PUBLIC_KEY))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const parsed = discordInteraction.safeParse(JSON.parse(body));
  if (!parsed.success) {
    return NextResponse.json({ error: "Unknown interaction" }, { status: 400 });
  }
  const interaction = parsed.data;

  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  // Every control the bot draws belongs to `/sub` or its admin preview.
  if (
    interaction.type === InteractionType.MESSAGE_COMPONENT ||
    interaction.type === InteractionType.MODAL_SUBMIT
  ) {
    return answerSubControl(interaction, request.headers);
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const command = interaction.data?.name;
    const value = interaction.data?.options?.[0]?.value;
    const message = typeof value === "string" ? value : undefined;
    const token = interaction.token;

    // `/link` and `/sub` take no argument, so they are dispatched ahead of the
    // check below that every other command carries one. Both answer the caller
    // alone, so the deferred response is already ephemeral: that flag decides
    // the visibility of the reply which later replaces it.
    if ((command === "link" || command === "sub") && token) {
      const caller = discordCaller(interaction);
      if (caller === null) {
        return NextResponse.json({ type: InteractionResponseType.PONG });
      }
      after(
        command === "link"
          ? sendLinkUrl(token, caller, request.headers)
          : sendSubStep(token, caller, discordLocale(interaction), request.headers, {
              kind: "start",
            })
      );
      return NextResponse.json({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: { flags: EPHEMERAL },
      });
    }

    if (!command || !message || !token) {
      return NextResponse.json({ type: InteractionResponseType.PONG });
    }

    // All commands use deferred responses to avoid Discord's 3-second timeout on cold starts
    if (command === "reset-password") {
      after(sendPasswordReset(token, message));
    } else {
      after(sendFollowUp(token, command, message));
    }

    return NextResponse.json({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });
  }

  return NextResponse.json({ error: "Unknown interaction" }, { status: 400 });
}

async function patchDiscordResponse(
  interactionToken: string,
  content: string,
  flags?: number
) {
  await fetch(
    `${DISCORD_API_BASE}/webhooks/${DISCORD_APPLICATION_ID}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: discordBotHeaders(),
      body: JSON.stringify(flags === undefined ? { content } : { content, flags }),
    }
  );
}

/** Replace the interaction's message with a Components V2 body. */
async function patchDiscordMessage(
  interactionToken: string,
  body: DiscordComponentsMessage
): Promise<void> {
  const response = await fetch(
    `${DISCORD_API_BASE}/webhooks/${DISCORD_APPLICATION_ID}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: discordBotHeaders(),
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    // Discord refuses a malformed component message whole and leaves the
    // reader looking at "thinking…", so its reason is worth a log line.
    console.error(
      "Discord /sub PATCH refused:",
      response.status,
      await response.text().catch(() => "")
    );
  }
}

/** Who ran or pressed it, or `null` when the payload names nobody usable. */
function discordCaller(
  interaction: DiscordInteraction
): { id: string; username: string } | null {
  const caller = interaction.member?.user ?? interaction.user;
  const id = caller?.id;
  const username = caller?.username;
  if (typeof id !== "string" || typeof username !== "string") return null;
  return { id, username };
}

/** The app locale nearest the caller's Discord client language. */
function discordLocale(interaction: DiscordInteraction): SupportedLocale {
  const tag = interaction.locale;
  return (typeof tag === "string" ? matchLocaleFromHeader(tag) : null) ?? DEFAULT_LOCALE;
}

/**
 * Answer `/link` with a one-time URL that links the caller's Discord account
 * to whichever Gedu or admin account confirms it.
 */
async function sendLinkUrl(
  interactionToken: string,
  caller: { id: string; username: string },
  requestHeaders: Headers
): Promise<void> {
  await patchDiscordResponse(
    interactionToken,
    await linkReply(caller, requestHeaders),
    SUPPRESS_EMBEDS
  );
}

/**
 * `/link`'s reply: a one-time URL, or a short failure line.
 *
 * Only the token's SHA-256 is stored, so the table never holds a usable token;
 * the raw value exists in this reply alone. The database gives it ten minutes
 * and spends it on first use. The path is bare on purpose: the proxy sends it
 * on to the reader's own locale with the query intact.
 */
async function linkReply(
  caller: { id: string; username: string },
  requestHeaders: Headers
): Promise<string> {
  try {
    const origin = getOrigin(requestHeaders);
    const token = randomBytes(32).toString("base64url");
    const row: DiscordLinkTokenInsert = {
      token_hash: hashDiscordLinkToken(token),
      discord_user_id: caller.id,
      discord_username: caller.username,
    };
    const { error } = await createAdminClient()
      .from("discord_link_tokens")
      .insert(row);
    if (error) throw error;

    return (
      "Open this link to connect your Discord account to your School of Gaming account:\n" +
      `${origin}/link-discord?token=${token}\n\n` +
      "The link expires in 10 minutes and works once."
    );
  } catch (error) {
    console.error("Discord link token error:", error);
    return "Sorry, I couldn't create a link right now. Try /link again in a moment.";
  }
}

// ---------------------------------------------------------------- /sub

/** What a `/sub` step that reads or writes the database is asked to do. */
type SubStep =
  | { kind: "start" }
  | { kind: "page"; page: number }
  | {
      kind: "reason";
      groupId: string;
      sessionDate: string;
      reason: SubstitutionReason | null;
    }
  | {
      kind: "file";
      groupId: string;
      sessionDate: string;
      reason: SubstitutionReason;
      note: string;
    };

/**
 * Answer a press on one of the bot's controls.
 *
 * **Everything that reads or writes is deferred** (`DEFERRED_UPDATE_MESSAGE`)
 * and lands by PATCHing the message the control sits on, for the same three
 * seconds every command is deferred for. Two answers are synchronous because
 * they read nothing: the note modal, whose custom_id already carries the
 * session, the reason and the copy's locale, and the admin preview's "nothing
 * was filed" line. A press this route cannot place is acknowledged and
 * otherwise ignored.
 *
 * The presser is whoever Discord's signed payload names; nothing in a
 * custom_id says who may act, and the database re-derives the gedu from the
 * presser's Discord id on every read and write.
 */
async function answerSubControl(
  interaction: DiscordInteraction,
  requestHeaders: Headers
): Promise<NextResponse> {
  const acknowledge = NextResponse.json({
    type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
  });
  const customId = interaction.data?.custom_id;
  const token = interaction.token;
  const action = typeof customId === "string" ? parseSubCustomId(customId) : null;
  if (action === null || !token) return acknowledge;

  const locale = discordLocale(interaction);

  if (action.kind === "preview") {
    const copy = await loadDiscordSubCopy(locale);
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: copy.sub("previewNotice"), flags: EPHEMERAL },
    });
  }

  if (action.kind === "note") {
    const copy = await loadDiscordSubCopy(action.locale);
    return NextResponse.json({
      type: InteractionResponseType.MODAL,
      data: buildNoteModal({
        copy,
        groupId: action.groupId,
        sessionDate: action.sessionDate,
        reason: action.reason,
      }),
    });
  }

  const caller = discordCaller(interaction);
  if (caller === null) return acknowledge;

  const picked = firstValue(interaction);
  let step: SubStep | null = null;
  switch (action.kind) {
    case "page":
      step = { kind: "page", page: action.page };
      break;
    case "session": {
      const session = picked === null ? null : parseSessionValue(picked);
      if (session !== null) step = { kind: "reason", ...session, reason: null };
      break;
    }
    case "reason": {
      const reason = picked === null ? null : parseReasonValue(picked);
      if (reason !== null) step = { ...action, reason };
      break;
    }
    case "file":
      step = { ...action, note: "" };
      break;
    case "submit":
      step = { ...action, kind: "file", note: modalNote(interaction.data?.components) };
      break;
  }
  if (step === null) return acknowledge;

  after(sendSubStep(token, caller, locale, requestHeaders, step));
  return acknowledge;
}

/** A select's picked value, or `null` when the press carried none. */
function firstValue(interaction: DiscordInteraction): string | null {
  const value = interaction.data?.values?.[0];
  return typeof value === "string" ? value : null;
}

/**
 * The note field's value out of a modal submission, wherever Discord nests it —
 * under a label or an action row — or `""` when it is absent or blank.
 */
function modalNote(components: unknown): string {
  if (Array.isArray(components)) {
    for (const component of components) {
      const note = modalNote(component);
      if (note !== "") return note;
    }
    return "";
  }
  if (typeof components !== "object" || components === null) return "";
  if (
    "custom_id" in components &&
    components.custom_id === SUB_NOTE_INPUT_ID &&
    "value" in components &&
    typeof components.value === "string"
  ) {
    return components.value;
  }
  const nested = "components" in components ? components.components : undefined;
  const single = "component" in components ? components.component : undefined;
  return modalNote(nested) || modalNote(single);
}

/**
 * Run one `/sub` step for the caller and PATCH its message in.
 *
 * Every step starts the same way: who is this, in which language, and what can
 * they file for. The copy is the gedu's own locale where they chose one, else
 * their Discord client's. A failure anywhere sends a short generic line in that
 * language, never the cause.
 */
async function sendSubStep(
  interactionToken: string,
  caller: { id: string; username: string },
  discordLanguage: SupportedLocale,
  requestHeaders: Headers,
  step: SubStep
): Promise<void> {
  let reply: DiscordComponentsMessage;
  const logoUrl = subLogoUrl();
  let fallback = await loadDiscordSubCopy(discordLanguage);
  try {
    const gedu = await resolveDiscordGedu(caller.id);
    if (gedu === null) {
      await sendSubNotLinked(interactionToken, caller, fallback, requestHeaders, step);
      return;
    }
    const locale = gedu.locale ?? discordLanguage;
    const copy = locale === discordLanguage ? fallback : await loadDiscordSubCopy(locale);
    fallback = copy;
    const now = new Date();
    const sessions = await getDiscordGeduUpcomingSessions({
      discordUserId: caller.id,
      locale,
      now,
    });
    if (sessions === null) {
      await sendSubNotLinked(interactionToken, caller, copy, requestHeaders, step);
      return;
    }

    if (step.kind === "start" || step.kind === "page") {
      reply = buildSessionPickerMessage({
        copy,
        logoUrl,
        sessions,
        now,
        page: step.kind === "page" ? step.page : 0,
        // A bare path, which the proxy sends on to the reader's own locale.
        substitutionsUrl: `${getOrigin(requestHeaders)}${ROUTES.gedu.substitutions}`,
      });
    } else {
      const key = `${step.groupId}:${step.sessionDate}`;
      const session = sessions.find((candidate) => candidate.key === key) ?? null;
      if (session === null) {
        // Not on the list any more — it ended, was cancelled or the seat went
        // while the message sat open. The write would refuse it, so it is not
        // tried.
        reply = buildRefusalMessage({
          copy,
          logoUrl,
          line: copy.form("substitutionRequestFailedNotScheduled"),
          session: null,
        });
      } else if (step.kind === "reason") {
        reply = buildReasonStepMessage({ copy, logoUrl, session, reason: step.reason });
      } else {
        try {
          await fileDiscordSubstitutionRequest({
            discordUserId: caller.id,
            groupId: step.groupId,
            sessionDate: step.sessionDate,
            reason: step.reason,
            reasonNote: step.note,
          });
          reply = buildFiledMessage({ copy, logoUrl, session });
        } catch (refusal) {
          if (isDiscordGeduNotLinked(refusal)) {
            await sendSubNotLinked(interactionToken, caller, copy, requestHeaders, step);
            return;
          }
          const failure = substitutionRequestFailureKey(refusal);
          if (failure === "substitutionRequestFailed") {
            console.error("Discord /sub filing error:", refusal);
          }
          reply = buildRefusalMessage({ copy, logoUrl, line: copy.form(failure), session });
        }
      }
    }
  } catch (error) {
    console.error("Discord /sub error:", error);
    reply = buildNoticeMessage({ copy: fallback, logoUrl, line: fallback.sub("failed") });
  }

  await patchDiscordMessage(interactionToken, reply);
}

/**
 * The `/sub` header's logo, from this environment's own site — or none where
 * Discord could not fetch it, as from a dev machine.
 */
function subLogoUrl(): string | null {
  return discordSubLogoUrl(sendableImageOrigin());
}

/**
 * The caller has no gedu account linked. Run as the command, the answer is
 * `/link`'s own reply under a line saying why; pressed on an older message, it
 * says to run `/link`, because that message is already a components message
 * and cannot become a plain one.
 */
async function sendSubNotLinked(
  interactionToken: string,
  caller: { id: string; username: string },
  copy: DiscordSubCopy,
  requestHeaders: Headers,
  step: SubStep
): Promise<void> {
  if (step.kind === "start") {
    await patchDiscordResponse(
      interactionToken,
      `${copy.sub("notLinked")}\n\n${await linkReply(caller, requestHeaders)}`,
      SUPPRESS_EMBEDS
    );
    return;
  }
  await patchDiscordMessage(
    interactionToken,
    buildNoticeMessage({ copy, logoUrl: subLogoUrl(), line: copy.sub("notLinkedRunLink") })
  );
}

// ---------------------------------------------------------------- /reset-password

/**
 * The English sentence for a failed reset.
 *
 * These strings live here rather than in the Graph module because they are
 * Discord's copy, not the platform's: the same outcomes are rendered through
 * next-intl on the in-app tools card, and a sentence baked into the library
 * would be a sentence no locale could translate. Discord has no locale — it is
 * a staff channel — so its wording stays fixed, and it is fixed *verbatim*:
 * these are byte-for-byte the sentences the command has always sent.
 */
function discordFailureSentence(
  outcome: Extract<PasswordResetOutcome, { ok: false }>
): string {
  switch (outcome.code) {
    case "invalid_username":
      return "Invalid username. Provide just the username, not the full email.";
    // The one sentence here with no history behind it: the code is newer than
    // the command, so this is its wording rather than a preserved one.
    case "unsupported_domain":
      return `Only ${outcome.domains
        .map((domain) => `@${domain}`)
        .join(" and ")} accounts can be reset.`;
    case "azure_auth":
      return "Failed to authenticate with Azure. Check bot configuration.";
    case "graph_error":
      return `Microsoft Graph error: ${outcome.status}`;
    case "not_found":
      return `User "${outcome.username}" not found on ${outcome.domains
        .map((domain) => `@${domain}`)
        .join(" or ")}.`;
  }
}

async function sendPasswordReset(
  interactionToken: string,
  input: string
): Promise<void> {
  const usernames = input.split(/[\s,]+/).filter(Boolean);

  const results = await Promise.all(
    usernames.map(async (username) => {
      const result = await resetPassword(username);
      if (result.ok) {
        const line = `✅ **${result.upn}** → \`${result.password}\``;
        return result.forceChange ? `${line} (must change on sign-in)` : line;
      }
      return `❌ **${username}** — ${discordFailureSentence(result)}`;
    })
  );

  await patchDiscordResponse(interactionToken, results.join("\n"));
}

async function sendFollowUp(
  interactionToken: string,
  command: string,
  message: string
): Promise<void> {
  let answer: string;
  try {
    answer =
      command === "happinappi"
        ? await askHappinappi(message)
        : await askGeduGuru(message);
  } catch (error) {
    console.error("Gemini error:", error);
    answer =
      command === "happinappi"
        ? "HAPPEE! ...mutta jotain meni pieleen. Yritä uudelleen!"
        : "Pahoittelut, en pystynyt käsittelemään kysymystäsi. Yritä uudelleen.";
  }

  const reply = `**${message}**\n\n${answer}`;

  // Discord messages have a 2000 character limit
  const content = reply.length > 2000 ? reply.slice(0, 1997) + "..." : reply;

  await patchDiscordResponse(interactionToken, content);
}
