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
  isSupportedLocale,
  matchLocaleFromHeader,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { DISCORD_API_BASE, discordBotHeaders } from "@/lib/discord-api.server";
import { hashDiscordLinkToken } from "@/lib/discord-link-token.server";
import {
  DISCORD_FLAG_EPHEMERAL,
  SUB_NOTE_INPUT_ID,
  SUB_REASON_INPUT_ID,
  buildFiledMessage,
  buildLinkReply,
  buildNoticeMessage,
  buildRefusalMessage,
  buildRequestModal,
  buildSessionPickerMessage,
  buildSubNotLinkedMessage,
  disabledControlsUpdate,
  discordSubLogoUrl,
  loadDiscordSubCopy,
  parseReasonValue,
  parseSessionValue,
  parseSubCustomId,
  pickedSessionOption,
  type DiscordComponentsMessage,
  type DiscordContentMessage,
  type DiscordSubCopy,
} from "@/lib/discord-substitution-message";
import {
  answerDiscordSubstitutionRequest,
  fileDiscordSubstitutionRequest,
  getDiscordGeduUpcomingSessions,
  isDiscordGeduNotLinked,
  readDiscordSubstitutionDm,
  resolveDiscordGedu,
} from "@/lib/discord-substitution.server";
import { askGeduGuru, askHappinappi } from "@/lib/gemini";
import { resetPassword, type PasswordResetOutcome } from "@/lib/microsoft-graph";
import {
  buildSubstitutionOfferDm,
  loadDiscordSubOfferCopy,
  parseSubReqCustomId,
  substitutionDmSession,
  type DiscordSubOfferCopy,
  type SubReqAction,
} from "@/lib/substitution-notifications/discord-dm-message";
import { deriveNotificationState } from "@/lib/substitution-notifications/state";
import { drainSubstitutionNotifications } from "@/lib/substitution-notifications/sync.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendableImageOrigin } from "@/lib/email-templates/render-context";
import { getOrigin } from "@/lib/url";
// The module by name rather than the package index: that re-exports
// `"use client"` query hooks, which a route has no business loading.
import {
  substitutionAnswerFailureKey,
  substitutionRequestFailureKey,
} from "@/services/session-substitution/session-substitution.refusals";
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
  // The message a pressed control sits on — also sent with a modal submit the
  // modal was opened from a control for. Read only to redraw it with its
  // controls greyed out and to name the picked session in the modal, so it is
  // not parsed here.
  message: z.unknown().optional(),
});

type DiscordInteraction = z.infer<typeof discordInteraction>;

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID!;

/** Only the caller sees the message (Discord's EPHEMERAL message flag). */
const EPHEMERAL = DISCORD_FLAG_EPHEMERAL;

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

  // Every control the bot draws belongs to `/sub`, a substitution request's
  // DM, or the admin preview of either.
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

/** Replace the interaction's message with a built body. */
async function patchDiscordMessage(
  interactionToken: string,
  body: DiscordComponentsMessage | DiscordContentMessage
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
  await patchDiscordMessage(interactionToken, await linkReply(caller, requestHeaders));
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
): Promise<DiscordContentMessage> {
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

    return buildLinkReply({ origin, token });
  } catch (error) {
    console.error("Discord link token error:", error);
    return {
      content: "Sorry, I couldn't create a link right now. Try /link again in a moment.",
    };
  }
}

// ---------------------------------------------------------------- /sub

/** What a `/sub` step that reads or writes the database is asked to do. */
type SubStep =
  | { kind: "start" }
  | { kind: "list" }
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
 * **Everything that reads or writes is deferred** and lands by PATCHing the
 * message the control sits on, for the same three seconds every command is
 * deferred for. The immediate answer redraws that message with its controls
 * greyed out (`UPDATE_MESSAGE`), so a second tap cannot race the first; where
 * the payload carries no usable message it is a plain `DEFERRED_UPDATE_MESSAGE`.
 * Two answers are synchronous because they read nothing: the request modal a
 * session pick opens — Discord lets a modal be neither deferred nor late, so
 * the select's custom_id carries the copy's locale and the pressed message's
 * own option names the session — and the admin preview's "nothing was filed"
 * line. A press this route cannot place, and a submission without a valid
 * reason, are acknowledged and otherwise ignored.
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
  if (typeof customId !== "string" || !token) return acknowledge;
  const locale = discordLocale(interaction);

  // A substitution DM's preview buttons answer with the DM's own preview line.
  if (SUB_REQ_PREVIEW.test(customId)) {
    const copy = await loadDiscordSubOfferCopy(locale);
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: copy.offer("previewNotice"), flags: EPHEMERAL },
    });
  }

  const answer = parseSubReqCustomId(customId);
  if (answer !== null) {
    const caller = discordCaller(interaction);
    if (caller === null) return acknowledge;
    after(sendSubReqAnswer(token, caller, locale, answer));
    return greyOut(interaction, acknowledge);
  }

  const action = parseSubCustomId(customId);
  if (action === null) return acknowledge;

  if (action.kind === "preview") {
    const copy = await loadDiscordSubCopy(locale);
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: copy.sub("previewNotice"), flags: EPHEMERAL },
    });
  }

  if (action.kind === "session") {
    // No greyed-out redraw: a press answered with a modal leaves its message
    // as it is, and dismissing the modal leaves the list to pick from again.
    const picked = firstValue(interaction);
    const session = picked === null ? null : parseSessionValue(picked);
    if (picked === null || session === null) return acknowledge;
    const copy = await loadDiscordSubCopy(action.locale);
    return NextResponse.json({
      type: InteractionResponseType.MODAL,
      data: buildRequestModal({
        copy,
        ...session,
        picked: pickedSessionOption(interaction.message, picked),
      }),
    });
  }

  const caller = discordCaller(interaction);
  if (caller === null) return acknowledge;

  let step: SubStep;
  if (action.kind === "list") {
    step = { kind: "list" };
  } else {
    const fields = interaction.data?.components;
    const reason = modalReason(fields);
    if (reason === null) return acknowledge;
    step = { ...action, kind: "file", reason, note: modalNote(fields) };
  }

  after(sendSubStep(token, caller, locale, requestHeaders, step));
  return greyOut(interaction, acknowledge);
}

/**
 * Grey the pressed message's controls out in the reply, so a second tap — easy
 * on a phone — cannot start a second run racing this one to `@original`.
 */
function greyOut(interaction: DiscordInteraction, acknowledge: NextResponse): NextResponse {
  const greyedOut = disabledControlsUpdate(interaction.message);
  return greyedOut === null
    ? acknowledge
    : NextResponse.json({ type: InteractionResponseType.UPDATE_MESSAGE, data: greyedOut });
}

/** A select's picked value, or `null` when the press carried none. */
function firstValue(interaction: DiscordInteraction): string | null {
  const value = interaction.data?.values?.[0];
  return typeof value === "string" ? value : null;
}

/**
 * The note field's value out of a modal submission, or `""` when it is absent
 * or blank.
 */
function modalNote(components: unknown): string {
  const field = modalField(components, SUB_NOTE_INPUT_ID);
  return field !== null && "value" in field && typeof field.value === "string"
    ? field.value
    : "";
}

/**
 * The reason picked in a modal submission — a select reports its pick as
 * `values` — or `null` when there is none or it is not a reason.
 */
function modalReason(components: unknown): SubstitutionReason | null {
  const field = modalField(components, SUB_REASON_INPUT_ID);
  const values = field !== null && "values" in field ? field.values : undefined;
  const [value] = Array.isArray(values) ? values : [];
  return typeof value === "string" ? parseReasonValue(value) : null;
}

/**
 * The submitted field with this custom_id, wherever Discord nests it — under
 * a label or an action row — or `null` when the submission has none.
 */
function modalField(components: unknown, customId: string): object | null {
  if (Array.isArray(components)) {
    for (const component of components) {
      const field = modalField(component, customId);
      if (field !== null) return field;
    }
    return null;
  }
  if (typeof components !== "object" || components === null) return null;
  if ("custom_id" in components && components.custom_id === customId) return components;
  const nested = "components" in components ? components.components : undefined;
  const single = "component" in components ? components.component : undefined;
  return modalField(nested, customId) ?? modalField(single, customId);
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

    if (step.kind === "start" || step.kind === "list") {
      reply = buildSessionPickerMessage({ copy, logoUrl, sessions });
    } else {
      const key = `${step.groupId}:${step.sessionDate}`;
      // The list is read only to name the session in the outcome. A session
      // missing from it is still filed for: the list leaves out the sessions
      // already asked for as well as those that ended, were cancelled or lost
      // their seat, and only the write can tell those apart — so its own
      // refusal is the answer. Where it accepts one anyway, the confirmation
      // names the session by its date alone.
      const session = sessions.find((candidate) => candidate.key === key) ?? null;
      try {
        await fileDiscordSubstitutionRequest({
          discordUserId: caller.id,
          groupId: step.groupId,
          sessionDate: step.sessionDate,
          reason: step.reason,
          reasonNote: step.note,
        });
        reply = buildFiledMessage({
          copy,
          logoUrl,
          session: session ?? { sessionDate: step.sessionDate },
        });
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
    await patchDiscordMessage(
      interactionToken,
      buildSubNotLinkedMessage({
        copy,
        linkReply: await linkReply(caller, requestHeaders),
      })
    );
    return;
  }
  await patchDiscordMessage(
    interactionToken,
    buildNoticeMessage({ copy, logoUrl: subLogoUrl(), line: copy.sub("notLinkedRunLink") })
  );
}

// ---------------------------------------------------------------- the substitution DM

/** A press on the admin preview of a substitution DM — `subpreview:o:…` or `subpreview:d:…`. */
const SUB_REQ_PREVIEW = /^subpreview:[od]:/;

/**
 * Answer a substitution request from its DM — Offer or Decline — as the gedu
 * the presser's Discord account acts as, then redraw the DM.
 *
 * An accepted answer syncs the request in-process, which redraws every message
 * about it (this DM among them) and the Slack message; the DM is then redrawn
 * once more through the press's own token, so it comes back even where the
 * sync had no change to draw or another worker holds the request. A refused
 * one redraws the DM under the write's own refusal line — through the pool's
 * mapper, in the DM's language — with its buttons back so the gedu can answer
 * again; a presser with no gedu linked is told to run `/link`.
 *
 * The DM is drawn exactly as the sync draws it — the candidate's own locale,
 * else the default. Its recorded rendering is forgotten before anything else,
 * so the next sync redraws it whatever the press leaves on screen: a refusal
 * line the sync never draws, or — where this redraw fails — greyed-out buttons.
 */
async function sendSubReqAnswer(
  interactionToken: string,
  caller: { id: string; username: string },
  discordLanguage: SupportedLocale,
  action: SubReqAction
): Promise<void> {
  await forgetSubReqDmRendering(caller.id, action.requestId);

  let refusalLine: ((copy: DiscordSubOfferCopy) => string) | null = null;
  try {
    await answerDiscordSubstitutionRequest({
      discordUserId: caller.id,
      requestId: action.requestId,
      response: action.kind,
    });
  } catch (refusal) {
    if (isDiscordGeduNotLinked(refusal)) {
      refusalLine = (copy) => copy.offer("notLinked");
    } else {
      const failure = substitutionAnswerFailureKey(refusal);
      if (failure === "poolActionFailed") {
        console.error("Discord substitution answer error:", refusal);
      }
      refusalLine = (copy) => copy.pool(failure);
    }
  }

  if (refusalLine === null) {
    try {
      await drainSubstitutionNotifications({ requestIds: [action.requestId] });
    } catch (error) {
      // The answer stands; the outbox retries the sync.
      console.error("Discord substitution answer: notification sync failed:", error);
    }
  }

  try {
    const read = await readDiscordSubstitutionDm({
      discordUserId: caller.id,
      requestId: action.requestId,
    });
    if (read === null) return;
    const { snapshot, candidate } = read;
    const locale =
      candidate === null
        ? discordLanguage
        : candidate.locale !== null && isSupportedLocale(candidate.locale)
          ? candidate.locale
          : DEFAULT_LOCALE;
    const copy = await loadDiscordSubOfferCopy(locale);
    await patchDiscordMessage(
      interactionToken,
      buildSubstitutionOfferDm({
        copy,
        logoUrl: subLogoUrl(),
        session: substitutionDmSession(snapshot, locale),
        response: candidate?.response ?? null,
        state: deriveNotificationState(snapshot).kind,
        refusalLine: refusalLine === null ? null : refusalLine(copy),
      })
    );
  } catch (error) {
    console.error("Discord substitution DM redraw error:", error);
  }
}

/**
 * Forget the recorded rendering of the DM a press came from, so the sync's
 * unchanged-hash skip cannot leave it as the press left it. The row is the
 * gedu this Discord account acts as on the request; a presser who is none has
 * no DM row to forget. A failure here costs only that skip, so it never stops
 * the answer.
 */
async function forgetSubReqDmRendering(discordUserId: string, requestId: string): Promise<void> {
  try {
    const read = await readDiscordSubstitutionDm({ discordUserId, requestId });
    const geduId = read?.candidate?.gedu_id;
    if (geduId === undefined) return;
    const { error } = await createAdminClient()
      .from("substitution_notification_dms")
      .update({ rendered_hash: null })
      .eq("request_id", requestId)
      .eq("gedu_id", geduId);
    if (error) throw error;
  } catch (error) {
    console.error("Discord substitution DM: forgetting its rendering failed:", error);
  }
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
