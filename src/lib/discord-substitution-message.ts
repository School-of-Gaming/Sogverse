import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { createTranslator } from "use-intl/core";
import { BRAND } from "@sog/ui/tokens/brand";
import { addCalendarDays } from "@/lib/calendar-date";
import {
  DEFAULT_TIMEZONE,
  isSupportedLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import {
  groupSessionsByWeek,
  initiallyShownWeeks,
  weekHeadingKind,
  type GeduUpcomingSession,
  type GeduUpcomingSessionWeek,
} from "@/lib/gedu-upcoming-sessions";
import { formatDate, formatDateOnly, formatTimeRange } from "@/lib/utils";
import { loadMessages, type Messages } from "@/i18n/messages";
import { SUBSTITUTION_REASON_NOTE_MAX_LENGTH } from "@/services/session-substitution/session-substitution.contracts";
import { Constants, type SubstitutionReason } from "@/types";

/**
 * **The Discord `/sub` command's messages**, built as data so the route that
 * answers the command and the admin tool that DMs a preview of it send the
 * very same first step.
 *
 * Every message is a Components V2 message: one container in the brand's act
 * colour, holding text and controls. Pure — the clock, the sessions and the
 * translators all arrive as arguments.
 *
 * **The state between steps lives in the controls' `custom_id`s**, because a
 * Discord interaction carries nothing else from one press to the next. They say
 * *what* was picked — a session, a reason — and never *who* picked it: every
 * press is re-resolved from the presser's Discord id.
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

const BUTTON_PRIMARY = 1;
const BUTTON_SECONDARY = 2;
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

/** The custom_id the note field carries inside the modal. */
export const SUB_NOTE_INPUT_ID = "note";

const SUBSTITUTION_REASONS = Constants.public.Enums.substitution_reason;

/**
 * What a `/sub` control's custom_id says. Session-scoped steps carry the group
 * and the product-local date the write is keyed by.
 *
 * - `page` — show this page of the session list.
 * - `session` — a session select; the pick is the option's value.
 * - `reason` — the reason select for one session; the pick is the value.
 * - `note` — open the note modal (the button carries the copy's locale,
 *   because the modal is answered without a database read).
 * - `file` — file with no note.
 * - `submit` — the modal's submission, the note inside it.
 * - `preview` — any control of the admin preview.
 */
export type SubAction =
  | { kind: "page"; page: number }
  | { kind: "session" }
  | { kind: "reason"; groupId: string; sessionDate: string }
  | {
      kind: "note";
      groupId: string;
      sessionDate: string;
      reason: SubstitutionReason;
      locale: SupportedLocale;
    }
  | { kind: "file"; groupId: string; sessionDate: string; reason: SubstitutionReason }
  | { kind: "submit"; groupId: string; sessionDate: string; reason: SubstitutionReason }
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

  if (kind === "p") {
    const page = Number(rest[0]);
    return rest.length === 1 && Number.isInteger(page) && page >= 0
      ? { kind: "page", page }
      : null;
  }
  if (kind === "s") return { kind: "session" };

  const [groupId, sessionDate, reason, locale] = rest;
  if (!groupId || !UUID.test(groupId) || !sessionDate || !DATE.test(sessionDate)) {
    return null;
  }
  if (kind === "r" && rest.length === 2) {
    return { kind: "reason", groupId, sessionDate };
  }
  // A missing part is `undefined` at runtime whatever the tuple's type says,
  // and no reason is `undefined`.
  if (!isReason(reason)) return null;
  if (kind === "m" && rest.length === 4 && locale && isSupportedLocale(locale)) {
    return { kind: "note", groupId, sessionDate, reason, locale };
  }
  if (rest.length !== 3) return null;
  if (kind === "f") return { kind: "file", groupId, sessionDate, reason };
  if (kind === "n") return { kind: "submit", groupId, sessionDate, reason };
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

function button(
  customId: string,
  label: string,
  style: number,
  disabled = false,
): DiscordComponent {
  return {
    type: BUTTON,
    custom_id: customId,
    label: clip(label, 80),
    style,
    ...(disabled ? { disabled: true } : {}),
  };
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
 * The weeks of the list, page by page. The first page is the two weeks the web
 * picker opens on; each later one is the next two weeks with a session in them.
 * Every page is a prefix-free slice of the list, so the pages together are the
 * whole of it and nothing appears twice.
 */
export function sessionPickerPages(
  sessions: readonly GeduUpcomingSession[],
  now: Date,
  timeZone: string,
): GeduUpcomingSessionWeek[][] {
  const weeks = groupSessionsByWeek(sessions, timeZone, now);
  const opening = initiallyShownWeeks(weeks, now, timeZone);
  const pages: GeduUpcomingSessionWeek[][] = [
    weeks.filter((week) => opening.includes(week.weekStart)),
  ];
  const later = weeks.filter((week) => !opening.includes(week.weekStart));
  for (let i = 0; i < later.length; i += 2) {
    pages.push(later.slice(i, i + 2));
  }
  return pages;
}

/** The zone the list's weeks are counted in: Discord does not report the reader's. */
export const DISCORD_SUB_WEEK_TIMEZONE = DEFAULT_TIMEZONE;

/**
 * Step one: which session can't you make. One select per week, under the week's
 * heading — a week holding more sessions than a select can carry gets a second
 * select under the same heading — and the way to the later weeks below.
 *
 * Built for the empty list too, which says so and points at the web page.
 */
export function buildSessionPickerMessage({
  copy,
  logoUrl,
  sessions,
  now,
  page,
  prefix = "sub",
  substitutionsUrl,
}: {
  copy: DiscordSubCopy;
  /** The header's logo — `discordSubLogoUrl()` — or `null` for none. */
  logoUrl: string | null;
  sessions: readonly GeduUpcomingSession[];
  now: Date;
  /** Clamped to the pages there are, since the list can shrink between presses. */
  page: number;
  prefix?: SubPrefix;
  /** The web Substitutions page, which the empty state points at. */
  substitutionsUrl: string;
}): DiscordComponentsMessage {

  if (sessions.length === 0) {
    return message(copy, logoUrl, {
      head: [text(`### ${copy.picker("filePickTitle")}`)],
      body: [text(copy.sub("empty", { url: substitutionsUrl }))],
    });
  }

  const timeZone = DISCORD_SUB_WEEK_TIMEZONE;
  const pages = sessionPickerPages(sessions, now, timeZone);
  const current = Math.min(Math.max(page, 0), pages.length - 1);

  const weeks = pages[current].flatMap((week) => {
    const heading = weekHeading(copy, week.weekStart, now, timeZone);
    const selects: DiscordComponent[] = [];
    for (let i = 0; i < week.sessions.length; i += SELECT_OPTION_CAP) {
      selects.push(
        row([
          {
            type: STRING_SELECT,
            custom_id: `${prefix}:s:${week.weekStart}:${i / SELECT_OPTION_CAP}`,
            placeholder: copy.sub("pickPlaceholder"),
            options: week.sessions
              .slice(i, i + SELECT_OPTION_CAP)
              .map((session) => ({
                label: clip(discordSessionWhen(session, copy.locale), OPTION_TEXT_MAX),
                description: clip(
                  `${sessionWhat(session)} · ${sessionWhere(copy, session)}`,
                  OPTION_TEXT_MAX,
                ),
                value: session.key,
              })),
          },
        ]),
      );
    }
    return [text(`**${heading}**`), ...selects];
  });

  const nav: DiscordComponent[] = [];
  if (current > 0) {
    nav.push(button(`${prefix}:p:${current - 1}`, copy.common("back"), BUTTON_SECONDARY));
  }
  if (current < pages.length - 1) {
    nav.push(
      button(`${prefix}:p:${current + 1}`, copy.picker("filePickShowLater"), BUTTON_SECONDARY),
    );
  }

  return message(copy, logoUrl, {
    head: [text(`### ${copy.picker("filePickTitle")}`)],
    body: [
      text(copy.picker("filePickBody")),
      divider(),
      ...weeks,
      ...(nav.length > 0 ? [divider(), row(nav)] : []),
    ],
  });
}

function weekHeading(
  copy: DiscordSubCopy,
  weekStart: string,
  now: Date,
  timeZone: string,
): string {
  const kind = weekHeadingKind(weekStart, now, timeZone);
  if (kind === "this") return copy.picker("filePickWeekThis");
  if (kind === "next") return copy.picker("filePickWeekNext");
  return copy.picker("filePickWeekOf", {
    date: formatDateOnly(weekStart, copy.locale, { day: "numeric", month: "short" }),
  });
}

// ---------------------------------------------------------------- step 2: the reason

/**
 * Step two: the web form's two questions. The reason is a select, and once one
 * is picked the message comes back with it selected and the two ways to finish
 * enabled — add a note (a modal) or confirm without one. Nothing is chosen to
 * begin with, as on the web, so nobody records `sick` by pressing through.
 */
export function buildReasonStepMessage({
  copy,
  logoUrl,
  session,
  reason,
}: {
  copy: DiscordSubCopy;
  /** The header's logo — `discordSubLogoUrl()` — or `null` for none. */
  logoUrl: string | null;
  session: GeduUpcomingSession;
  reason: SubstitutionReason | null;
}): DiscordComponentsMessage {
  const target = `${session.groupId}:${session.sessionDate}`;
  // A disabled button still needs an id of its own; `-` is no reason, so a
  // press on one could never parse.
  const chosen = reason ?? "-";

  return message(copy, logoUrl, {
    head: [text(`### ${copy.form("substitutionRequestDialogTitle")}`)],
    body: [
      text(copy.form("substitutionRequestDialogBody")),
      divider(),
      sessionSummary(copy, session),
      row([
        {
          type: STRING_SELECT,
          custom_id: `sub:r:${target}`,
          placeholder: copy.form("substitutionReasonLabel"),
          options: SUBSTITUTION_REASONS.map((value) => ({
            label:
              value === "sick"
                ? copy.form("substitutionReasonSick")
                : copy.form("substitutionReasonOther"),
            value,
            ...(value === reason ? { default: true } : {}),
          })),
        },
      ]),
      row([
        button("sub:p:0", copy.common("back"), BUTTON_SECONDARY),
        button(
          `sub:m:${target}:${chosen}:${copy.locale}`,
          copy.sub("addNote"),
          BUTTON_SECONDARY,
          reason === null,
        ),
        button(
          `sub:f:${target}:${chosen}`,
          copy.sub("confirmWithoutNote"),
          BUTTON_PRIMARY,
          reason === null,
        ),
      ]),
    ],
  });
}

/**
 * The optional note, as a modal — the same field, bound and placeholder as the
 * web form's. Submitting it files.
 */
export function buildNoteModal({
  copy,
  groupId,
  sessionDate,
  reason,
}: {
  copy: DiscordSubCopy;
  groupId: string;
  sessionDate: string;
  reason: SubstitutionReason;
}): DiscordModal {
  return {
    custom_id: `sub:n:${groupId}:${sessionDate}:${reason}`,
    title: clip(copy.form("substitutionRequestDialogTitle"), MODAL_TITLE_MAX),
    components: [
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

/** Filed: the web's own confirmation line, about the session filed for. */
export function buildFiledMessage({
  copy,
  logoUrl,
  session,
}: {
  copy: DiscordSubCopy;
  /** The header's logo — `discordSubLogoUrl()` — or `null` for none. */
  logoUrl: string | null;
  session: GeduUpcomingSession;
}): DiscordComponentsMessage {
  return message(copy, logoUrl, {
    body: [
      text(
        `✅ ${copy.picker("fileFiled", {
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
}: {
  copy: DiscordSubCopy;
  /** The header's logo — `discordSubLogoUrl()` — or `null` for none. */
  logoUrl: string | null;
  line: string;
  session: GeduUpcomingSession | null;
}): DiscordComponentsMessage {
  return message(copy, logoUrl, {
    body: [
      ...(session === null ? [] : [sessionSummary(copy, session)]),
      text(`⚠️ ${line}`),
      row([button("sub:p:0", copy.common("back"), BUTTON_SECONDARY)]),
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

/**
 * `/link`'s reply: the one-time URL that links the caller's Discord account,
 * and how long it lasts. Plain text, sent with {@link DISCORD_FLAG_SUPPRESS_EMBEDS}.
 */
export function buildLinkReplyContent(linkUrl: string): string {
  return (
    "Open this link to connect your Discord account to your School of Gaming account:\n" +
    `${linkUrl}\n\n` +
    "The link expires in 10 minutes and works once."
  );
}

/**
 * What `/sub` answers a caller with no Gedu account linked: the line saying a
 * link is needed, over `/link`'s own reply. Plain text, sent with
 * {@link DISCORD_FLAG_SUPPRESS_EMBEDS}.
 */
export function buildSubNotLinkedContent({
  copy,
  linkReply,
}: {
  copy: DiscordSubCopy;
  linkReply: string;
}): string {
  return `${copy.sub("notLinked")}\n\n${linkReply}`;
}

// ---------------------------------------------------------------- the admin preview

/**
 * Sample sessions for the admin tool's preview, laid out around `now` the way a
 * working gedu's fortnight and the weeks after it look: a few clubs, one of them
 * remote, and enough weeks that "Show later sessions" has somewhere to go.
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
