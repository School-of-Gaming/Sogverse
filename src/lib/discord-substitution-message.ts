import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { createTranslator } from "use-intl/core";
import { BRAND } from "@sog/ui/tokens/brand";
import { addCalendarDays } from "@/lib/calendar-date";
import { ROUTES } from "@/lib/constants/routes";
import {
  DEFAULT_TIMEZONE,
  isSupportedLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { type GeduUpcomingSession } from "@/lib/gedu-upcoming-sessions";
import { formatDate, formatTimeRange } from "@/lib/utils";
import { loadMessages, type Messages } from "@/i18n/messages";
import { SUBSTITUTION_REASON_NOTE_MAX_LENGTH } from "@/services/session-substitution/session-substitution.contracts";
import { Constants, type SubstitutionReason } from "@/types";

/**
 * **The Discord `/sub` command's messages**, built as data so the route that
 * answers the command and the admin tool that DMs a preview of it send the
 * very same messages.
 *
 * Every message is a Components V2 message: one container in the brand's act
 * colour, holding text and controls. Pure — the clock, the sessions and the
 * translators all arrive as arguments.
 *
 * **The state between steps lives in the controls' `custom_id`s**, because a
 * Discord interaction carries nothing else from one press to the next. They say
 * *what* was picked — the session, and the copy's locale — and never *who*
 * picked it: every press is re-resolved from the presser's Discord id.
 */

// ---------------------------------------------------------------- Discord wire

/** Only the caller sees the message. */
export const DISCORD_FLAG_EPHEMERAL = 1 << 6;
/** No link preview under the message. */
export const DISCORD_FLAG_SUPPRESS_EMBEDS = 1 << 2;
/** The message is built from layout components and carries no `content`. */
export const DISCORD_FLAG_IS_COMPONENTS_V2 = 1 << 15;

const ACTION_ROW = 1;
const BUTTON = 2;
const STRING_SELECT = 3;
const TEXT_INPUT = 4;
const SECTION = 9;
const TEXT_DISPLAY = 10;
const THUMBNAIL = 11;
const SEPARATOR = 14;
const CONTAINER = 17;
const LABEL = 18;

const BUTTON_SECONDARY = 2;
const BUTTON_LINK = 5;
const TEXT_INPUT_PARAGRAPH = 2;

/** Discord's caps, which a longer string is refused for rather than cut at. */
const SELECT_OPTION_CAP = 25;
const OPTION_TEXT_MAX = 100;
const MODAL_TITLE_MAX = 45;
const LABEL_MAX = 45;

/** The container's edge: the act colour, the one most associated with us. */
const ACCENT_COLOR = Number.parseInt(BRAND.act.hex.slice(1), 16);

/** A component as Discord reads it — the payloads are plain JSON. */
export type DiscordComponent = Record<string, unknown>;

/** A Components V2 message body: what a PATCH, a DM or an update sends. */
export interface DiscordComponentsMessage {
  flags: number;
  components: DiscordComponent[];
}

/**
 * The logo every step shows beside its header: the favicon, as the site
 * serves it. `null` when there is no origin Discord can fetch it from — the
 * caller passes `sendableImageOrigin()`, which says so for an unset, malformed
 * or loopback site URL — and the header then goes without it, never with a
 * broken image.
 */
export function discordSubLogoUrl(origin: string | null): string | null {
  return origin === null ? null : new URL("/apple-icon.png", origin).toString();
}

/** A MODAL response's `data`. */
export interface DiscordModal {
  custom_id: string;
  title: string;
  components: DiscordComponent[];
}

// ---------------------------------------------------------------- custom_ids

/**
 * `sub` for the live command; `subpreview` for the admin tool's DM, whose every
 * control answers "this is a preview" and does nothing else.
 */
export type SubPrefix = "sub" | "subpreview";

/** The custom_id the reason select carries inside the modal. */
export const SUB_REASON_INPUT_ID = "reason";
/** The custom_id the note field carries inside the modal. */
export const SUB_NOTE_INPUT_ID = "note";

const SUBSTITUTION_REASONS = Constants.public.Enums.substitution_reason;

/**
 * What a `/sub` control's custom_id says.
 *
 * - `list` — show the session list.
 * - `session` — the session select; the pick is the option's value. It
 *   carries the copy's locale, because the modal it opens is answered without
 *   a database read.
 * - `submit` — the modal's submission for one session, keyed by the group and
 *   the product-local date the write is keyed by; the reason and the note are
 *   inside it.
 * - `preview` — any control of the admin preview.
 */
export type SubAction =
  | { kind: "list" }
  | { kind: "session"; locale: SupportedLocale }
  | { kind: "submit"; groupId: string; sessionDate: string }
  | { kind: "preview" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isReason(value: string): value is SubstitutionReason {
  return SUBSTITUTION_REASONS.some((reason) => reason === value);
}

/**
 * Read a custom_id, or `null` when it is not one of ours or is malformed — the
 * route answers that with nothing rather than guessing.
 */
export function parseSubCustomId(customId: string): SubAction | null {
  const [prefix, kind, ...rest] = customId.split(":");
  if (prefix === "subpreview") return { kind: "preview" };
  if (prefix !== "sub") return null;

  if (kind === "l" && rest.length === 0) return { kind: "list" };
  if (kind === "s" && rest.length === 1) {
    const [locale] = rest;
    return locale && isSupportedLocale(locale) ? { kind: "session", locale } : null;
  }
  if (kind === "n" && rest.length === 2) {
    const [groupId, sessionDate] = rest;
    if (!groupId || !UUID.test(groupId) || !sessionDate || !DATE.test(sessionDate)) {
      return null;
    }
    return { kind: "submit", groupId, sessionDate };
  }
  return null;
}

/**
 * A session select's picked value — `<groupId>:<sessionDate>`, the session's
 * own key everywhere in the app — or `null` when it is not one.
 */
export function parseSessionValue(
  value: string,
): { groupId: string; sessionDate: string } | null {
  const [groupId, sessionDate, ...rest] = value.split(":");
  if (rest.length > 0 || !groupId || !sessionDate) return null;
  if (!UUID.test(groupId) || !DATE.test(sessionDate)) return null;
  return { groupId, sessionDate };
}

/** A reason select's picked value, or `null` when it is not a reason. */
export function parseReasonValue(value: string): SubstitutionReason | null {
  return isReason(value) ? value : null;
}

// ---------------------------------------------------------------- copy

/**
 * The translators the messages read, in one locale. The command's own lines
 * live under `discordSub`; everything the web's "Can't make a session?" flow
 * already says is read from where the web reads it, so the two ways in say it
 * in the same words.
 */
export interface DiscordSubCopy {
  locale: SupportedLocale;
  sub: ReturnType<typeof createTranslator<Messages, "discordSub">>;
  picker: ReturnType<typeof createTranslator<Messages, "gedu.substitution">>;
  form: ReturnType<typeof createTranslator<Messages, "gedu.sessionFeed">>;
  facts: ReturnType<typeof createTranslator<Messages, "sessionFacts">>;
  common: ReturnType<typeof createTranslator<Messages, "common">>;
}

export async function loadDiscordSubCopy(
  locale: SupportedLocale,
): Promise<DiscordSubCopy> {
  const messages = await loadMessages(locale);
  return {
    locale,
    sub: createTranslator({ locale, messages, namespace: "discordSub" }),
    picker: createTranslator({ locale, messages, namespace: "gedu.substitution" }),
    form: createTranslator({ locale, messages, namespace: "gedu.sessionFeed" }),
    facts: createTranslator({ locale, messages, namespace: "sessionFacts" }),
    common: createTranslator({ locale, messages, namespace: "common" }),
  };
}

// ---------------------------------------------------------------- building blocks

function text(content: string): DiscordComponent {
  return { type: TEXT_DISPLAY, content };
}

function divider(): DiscordComponent {
  return { type: SEPARATOR, divider: true, spacing: 1 };
}

function row(components: DiscordComponent[]): DiscordComponent {
  return { type: ACTION_ROW, components };
}

function button(customId: string, label: string, style: number): DiscordComponent {
  return { type: BUTTON, custom_id: customId, label: clip(label, 80), style };
}

/** Cut a string to a Discord cap, with an ellipsis where it was cut. */
function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * The one container every step is drawn in. Its header is the brand line and
 * the step's opening lines (at most two — a section holds three text
 * displays); with a logo, they are a section with the logo beside them.
 */
function message(
  copy: DiscordSubCopy,
  logoUrl: string | null,
  { head = [], body }: { head?: DiscordComponent[]; body: DiscordComponent[] },
): DiscordComponentsMessage {
  const lines = [text(`# School of Gaming · ${copy.picker("pageTitle")}`), ...head];
  const header =
    logoUrl === null
      ? lines
      : [
          {
            type: SECTION,
            components: lines,
            accessory: { type: THUMBNAIL, media: { url: logoUrl } },
          },
        ];
  return {
    flags: DISCORD_FLAG_IS_COMPONENTS_V2,
    components: [
      {
        type: CONTAINER,
        accent_color: ACCENT_COLOR,
        components: [...header, ...body],
      },
    ],
  };
}

/**
 * The session's day and clock face, **in the product's own zone**, which the
 * range names. A sanctioned exception to the viewer-timezone rule: no reader
 * zone ever reaches the bot, and Discord's own timestamps cannot sit in a
 * select option (`src/app/api/discord/CLAUDE.md` has the ruling).
 */
export function discordSessionWhen(
  session: GeduUpcomingSession,
  locale: SupportedLocale,
): string {
  return `${formatDate(session.startsAt, locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: session.timezone,
  })}, ${formatTimeRange(session.startsAt, session.endsAt, locale, session.timezone)}`;
}

/** What it is — product and group — as the web picker's row names it. */
function sessionWhat(session: GeduUpcomingSession): string {
  return session.groupName === null
    ? session.productName
    : `${session.productName} — ${session.groupName}`;
}

/** Where it is: the remote line or the building, as the web picker's row says. */
function sessionWhere(copy: DiscordSubCopy, session: GeduUpcomingSession): string {
  return session.isRemote
    ? copy.facts("remote")
    : (session.siteName ?? copy.facts("siteUnknown"));
}

/** The session a step is about, as three short lines. */
function sessionSummary(copy: DiscordSubCopy, session: GeduUpcomingSession): DiscordComponent {
  return text(
    `**${discordSessionWhen(session, copy.locale)}**\n${sessionWhat(session)}\n-# ${sessionWhere(copy, session)}`,
  );
}

// ---------------------------------------------------------------- step 1: the session list

/**
 * Step one: which session can't you make. One select holding the soonest
 * sessions a select can carry; any after those are not offered here.
 *
 * Built for the empty list too, which says so.
 */
export function buildSessionPickerMessage({
  copy,
  logoUrl,
  sessions,
  prefix = "sub",
}: {
  copy: DiscordSubCopy;
  /** The header's logo — `discordSubLogoUrl()` — or `null` for none. */
  logoUrl: string | null;
  /** Soonest first, as the gedu's upcoming sessions arrive. */
  sessions: readonly GeduUpcomingSession[];
  prefix?: SubPrefix;
}): DiscordComponentsMessage {
  const head = [text(`### ${copy.picker("filePickTitle")}`)];

  if (sessions.length === 0) {
    return message(copy, logoUrl, { head, body: [text(copy.sub("empty"))] });
  }

  return message(copy, logoUrl, {
    head,
    body: [
      divider(),
      row([
        {
          type: STRING_SELECT,
          custom_id: `${prefix}:s:${copy.locale}`,
          placeholder: copy.sub("pickPlaceholder"),
          options: sessions.slice(0, SELECT_OPTION_CAP).map((session) => ({
            label: clip(discordSessionWhen(session, copy.locale), OPTION_TEXT_MAX),
            description: clip(
              `${sessionWhat(session)} · ${sessionWhere(copy, session)}`,
              OPTION_TEXT_MAX,
            ),
            value: session.key,
          })),
        },
      ]),
    ],
  });
}

// ---------------------------------------------------------------- step 2: the request

/** The picked session as its select option named it. */
export interface PickedSessionOption {
  /** When — the option's label. */
  label: string;
  /** What and where — the option's description, when it had one. */
  description: string | null;
}

/**
 * The option the pressed message's select offered for `value`, found by
 * walking the message leniently — through containers, sections and rows — or
 * `null` when the message carries no such option. The modal is answered
 * without a database read, so the pressed message is the only place the
 * session's when, what and where can come from.
 */
export function pickedSessionOption(
  pressed: unknown,
  value: string,
): PickedSessionOption | null {
  if (typeof pressed !== "object" || pressed === null) return null;
  const components = "components" in pressed ? pressed.components : undefined;
  return findOption(components, value);
}

function findOption(node: unknown, value: string): PickedSessionOption | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findOption(child, value);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isComponentRecord(node)) return null;
  if (Array.isArray(node.options)) {
    for (const option of node.options) {
      if (
        isComponentRecord(option) &&
        option.value === value &&
        typeof option.label === "string"
      ) {
        return {
          label: option.label,
          description: typeof option.description === "string" ? option.description : null,
        };
      }
    }
  }
  return findOption(node.components, value) ?? findOption(node.accessory, value);
}

/**
 * Step two: the pop-up that holds everything left to say — which session, the
 * web form's line on who sees a reason, the reason (required, nothing chosen
 * to begin with, as on the web, so nobody records `sick` by pressing through)
 * and the optional note, with the web form's field, bound and placeholder.
 * Submitting it files.
 *
 * Answered without a database read, so the session line is the option the
 * gedu picked, as the pressed message offered it; without one it falls back to
 * the bare date.
 */
export function buildRequestModal({
  copy,
  groupId,
  sessionDate,
  picked,
}: {
  copy: DiscordSubCopy;
  groupId: string;
  sessionDate: string;
  picked: PickedSessionOption | null;
}): DiscordModal {
  const sessionLine =
    picked === null
      ? `**${sessionDate}**`
      : `**${picked.label}**${picked.description === null ? "" : `\n${picked.description}`}`;

  return {
    custom_id: `sub:n:${groupId}:${sessionDate}`,
    title: clip(copy.form("substitutionRequestDialogTitle"), MODAL_TITLE_MAX),
    components: [
      text(sessionLine),
      text(copy.form("substitutionRequestDialogBody")),
      {
        type: LABEL,
        label: clip(copy.form("substitutionReasonLabel"), LABEL_MAX),
        component: {
          type: STRING_SELECT,
          custom_id: SUB_REASON_INPUT_ID,
          required: true,
          options: SUBSTITUTION_REASONS.map((value) => ({
            label:
              value === "sick"
                ? copy.form("substitutionReasonSick")
                : copy.form("substitutionReasonOther"),
            value,
          })),
        },
      },
      {
        type: LABEL,
        label: clip(copy.form("substitutionNoteLabel"), LABEL_MAX),
        component: {
          type: TEXT_INPUT,
          custom_id: SUB_NOTE_INPUT_ID,
          style: TEXT_INPUT_PARAGRAPH,
          required: false,
          max_length: SUBSTITUTION_REASON_NOTE_MAX_LENGTH,
          placeholder: clip(copy.form("substitutionNotePlaceholder"), OPTION_TEXT_MAX),
        },
      },
    ],
  };
}

// ---------------------------------------------------------------- the outcome

/**
 * Filed: the confirmation line, about the session filed for. A filing for a
 * session the list does not carry — the write accepted what the list left out —
 * has only its date to go on, so it is named by that bare date, as the request
 * pop-up names one, under the web's own "you've asked" line.
 */
export function buildFiledMessage({
  copy,
  logoUrl,
  session,
}: {
  copy: DiscordSubCopy;
  /** The header's logo — `discordSubLogoUrl()` — or `null` for none. */
  logoUrl: string | null;
  /** The session filed for, or just its date when the list does not carry it. */
  session: GeduUpcomingSession | { sessionDate: string };
}): DiscordComponentsMessage {
  if (!("startsAt" in session)) {
    return message(copy, logoUrl, {
      body: [
        text(`**${session.sessionDate}**`),
        text(`✅ ${copy.form("substitutionRequestStatusOpen")}`),
      ],
    });
  }
  return message(copy, logoUrl, {
    body: [
      text(
        `✅ ${copy.sub("filed", {
          product: sessionWhat(session),
          when: discordSessionWhen(session, copy.locale),
        })}`,
      ),
    ],
  });
}

/**
 * Not filed: the refusal line, under the session it is about when that is
 * still known, and the way back to the list.
 */
export function buildRefusalMessage({
  copy,
  logoUrl,
  line,
  session,
  prefix = "sub",
}: {
  copy: DiscordSubCopy;
  /** The header's logo — `discordSubLogoUrl()` — or `null` for none. */
  logoUrl: string | null;
  line: string;
  session: GeduUpcomingSession | null;
  prefix?: SubPrefix;
}): DiscordComponentsMessage {
  return message(copy, logoUrl, {
    body: [
      ...(session === null ? [] : [sessionSummary(copy, session)]),
      text(`⚠️ ${line}`),
      row([button(`${prefix}:l`, copy.common("back"), BUTTON_SECONDARY)]),
    ],
  });
}

/** A line and nothing else — a failure, or a reader who is not linked. */
export function buildNoticeMessage({
  copy,
  logoUrl,
  line,
}: {
  copy: DiscordSubCopy;
  /** The header's logo — `discordSubLogoUrl()` — or `null` for none. */
  logoUrl: string | null;
  line: string;
}): DiscordComponentsMessage {
  return message(copy, logoUrl, { body: [text(line)] });
}

// ---------------------------------------------------------------- a press in flight

/** The select menus: string, user, role, mentionable and channel. */
const SELECT_TYPES = new Set([3, 5, 6, 7, 8]);
/** Buttons that raise no interaction — a link and a premium (SKU) button. */
const BUTTON_STYLES_WITHOUT_INTERACTION = new Set([5, 6]);

/**
 * The message's components with every control that raises an interaction set
 * `disabled`, walking into action rows, containers and a section's accessory.
 * A link button is left as it is, since pressing it reaches nothing of ours,
 * and a component type this walker does not know is passed through untouched.
 * The input is not mutated.
 */
export function disableMessageControls(components: readonly unknown[]): unknown[] {
  return components.map(disableControl);
}

function isComponentRecord(value: unknown): value is DiscordComponent {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function disableControl(record: unknown): unknown {
  if (!isComponentRecord(record)) return record;
  switch (record.type) {
    case BUTTON:
      return typeof record.style === "number" &&
        BUTTON_STYLES_WITHOUT_INTERACTION.has(record.style)
        ? record
        : { ...record, disabled: true };
    case ACTION_ROW:
    case CONTAINER:
      return Array.isArray(record.components)
        ? { ...record, components: disableMessageControls(record.components) }
        : record;
    case SECTION:
      return record.accessory === undefined
        ? record
        : { ...record, accessory: disableControl(record.accessory) };
    default:
      return typeof record.type === "number" && SELECT_TYPES.has(record.type)
        ? { ...record, disabled: true }
        : record;
  }
}

/**
 * An UPDATE_MESSAGE's `data` that redraws the pressed message with its controls
 * greyed out, so a second tap cannot start a second run of the step while the
 * first is still working. `null` when the interaction carried no usable message,
 * and the caller then acknowledges without redrawing.
 *
 * The flag is restated only for a Components V2 message, which an edit may
 * never turn back into a content one; the message's other flags (ephemeral
 * among them) are not editable and are left out.
 */
export function disabledControlsUpdate(
  pressed: unknown,
): { flags?: number; components: unknown[] } | null {
  if (typeof pressed !== "object" || pressed === null) return null;
  const components = "components" in pressed ? pressed.components : undefined;
  if (!Array.isArray(components) || components.length === 0) return null;
  const flags = "flags" in pressed ? pressed.flags : undefined;
  const isComponentsV2 =
    typeof flags === "number" && (flags & DISCORD_FLAG_IS_COMPONENTS_V2) !== 0;
  return {
    ...(isComponentsV2 ? { flags: DISCORD_FLAG_IS_COMPONENTS_V2 } : {}),
    components: disableMessageControls(components),
  };
}

/** A message with text and, optionally, classic action rows — not Components V2. */
export interface DiscordContentMessage {
  content: string;
  components?: DiscordComponent[];
}

/**
 * `/link`'s reply: a link button to the one-time URL that links the caller's
 * Discord account, and how long it lasts. The URL is on the button, never in
 * the text, so the message carries no link preview to suppress.
 */
export function buildLinkReply({
  origin,
  token,
}: {
  origin: string;
  token: string;
}): DiscordContentMessage {
  // The token is raw in the URL: a minted one is base64url, which needs no
  // percent-encoding.
  const linkUrl = `${origin}${ROUTES.linkDiscord}?token=${token}`;
  return {
    content:
      "Connect your Discord account to your School of Gaming account. " +
      "The link expires in 10 minutes and works once.",
    components: [
      row([{ type: BUTTON, style: BUTTON_LINK, label: "Connect account", url: linkUrl }]),
    ],
  };
}

/**
 * What `/sub` answers a caller with no Gedu account linked: the line saying a
 * link is needed, over `/link`'s own reply.
 */
export function buildSubNotLinkedMessage({
  copy,
  linkReply,
}: {
  copy: DiscordSubCopy;
  linkReply: DiscordContentMessage;
}): DiscordContentMessage {
  return { ...linkReply, content: `${copy.sub("notLinked")}\n\n${linkReply.content}` };
}

// ---------------------------------------------------------------- the admin preview

/**
 * Sample sessions for the admin tool's preview, laid out around `now` the way a
 * working gedu's next few weeks look: a few clubs, one of them remote, soonest
 * first.
 */
export function buildSubPreviewSessions(now: Date): GeduUpcomingSession[] {
  const timezone = DEFAULT_TIMEZONE;
  const today = formatInTimeZone(now, timezone, "yyyy-MM-dd");

  const groups = [
    { groupId: "00000000-0000-4000-8000-000000000001", productName: "Minecraft Club", groupName: "A", isRemote: false, siteName: "Sample School" },
    { groupId: "00000000-0000-4000-8000-000000000002", productName: "Roblox Studio Club", groupName: null, isRemote: true, siteName: null },
    { groupId: "00000000-0000-4000-8000-000000000003", productName: "Fortnite Creative Club", groupName: "B", isRemote: false, siteName: "Sample Library" },
  ] as const;

  const sessions: GeduUpcomingSession[] = [];
  for (let week = 0; week < 4; week += 1) {
    groups.forEach((group, index) => {
      const sessionDate = addCalendarDays(today, week * 7 + index * 2 + 1);
      const startsAt = fromZonedTime(`${sessionDate}T16:00:00`, timezone);
      sessions.push({
        key: `${group.groupId}:${sessionDate}`,
        groupId: group.groupId,
        sessionDate,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 90 * 60_000),
        timezone,
        productId: group.groupId,
        productName: group.productName,
        productType: "consumer_club",
        groupName: group.groupName,
        isRemote: group.isRemote,
        siteName: group.siteName,
      });
    });
  }
  return sessions.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * Every message `/sub` can draw, in the order a gedu meets them, for the admin
 * tool to DM as one set: the not-linked answer, the session list, the filed
 * line, a refusal, the empty list and the failure notice. Built by the
 * command's own builders over {@link buildSubPreviewSessions}, so a change to
 * how a step looks shows here from whatever machine sends it. Every control
 * carries the preview prefix. The request pop-up — the reason and the note —
 * is not here: a modal cannot be DMed, and only opens in answer to a press.
 */
export function buildSubPreviewFlow({
  copy,
  logoUrl,
  now,
  origin,
}: {
  copy: DiscordSubCopy;
  /** The header's logo — `discordSubLogoUrl()` — or `null` for none. */
  logoUrl: string | null;
  now: Date;
  /** The origin the not-linked answer's link is built on. */
  origin: string;
}): [DiscordContentMessage, ...DiscordComponentsMessage[]] {
  const prefix = "subpreview";
  const sessions = buildSubPreviewSessions(now);
  const [session] = sessions;
  const picker = (shown: readonly GeduUpcomingSession[]) =>
    buildSessionPickerMessage({ copy, logoUrl, sessions: shown, prefix });

  return [
    buildSubNotLinkedMessage({
      copy,
      // The real URL shape with a token no row holds: the page shows its
      // dead-link card for it, and nothing is minted.
      linkReply: buildLinkReply({ origin, token: "preview" }),
    }),
    picker(sessions),
    buildFiledMessage({ copy, logoUrl, session }),
    buildRefusalMessage({
      copy,
      logoUrl,
      line: copy.form("substitutionRequestFailedAlreadyAsked"),
      session,
      prefix,
    }),
    picker([]),
    buildNoticeMessage({ copy, logoUrl, line: copy.sub("failed") }),
  ];
}
