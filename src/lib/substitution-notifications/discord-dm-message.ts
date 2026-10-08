import { formatInTimeZone } from "date-fns-tz";
import { createTranslator } from "use-intl/core";
import { addCalendarDays } from "@/lib/calendar-date";
import { DEFAULT_CURRENCY } from "@/lib/constants/currency";
import { DEFAULT_TIMEZONE, type SupportedLocale } from "@/lib/constants/locales";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  brandedMessage,
  button,
  divider,
  linkButton,
  row,
  text,
  type DiscordComponent,
  type DiscordComponentsMessage,
} from "@/lib/discord-substitution-message";
import { languageNameIn } from "@/lib/i18n/language-name";
import { PRODUCT_TOPICS } from "@/lib/products/topics";
import {
  buildSessionFacts,
  sessionFactsProduct,
  type SessionFacts,
} from "@/lib/substitution-session-facts";
import { formatCurrencyFromCents, formatDate, formatDateOnly, formatTimeRange } from "@/lib/utils";
import { loadMessages, type Messages } from "@/i18n/messages";
import type { GeduAssignmentRole, SubstitutionOfferResponse } from "@/types";
import type { SubstitutionNotificationSnapshot } from "./snapshot.contracts";
import type { NotificationStateKind } from "./state";

/**
 * **The Discord DMs about a substitution request**, built as data: the one a
 * gedu the request could go to is sent while it is open, which every later
 * change redraws in place, and the one the gedu seated on it is sent.
 *
 * Drawn in the `/sub` command's frame — one Components V2 container in the act
 * colour under the brand line and the logo — so the bot looks like one bot.
 *
 * **The DM names the session, never the absent gedu**, exactly as the web pool
 * does: what a volunteer decides on is when, where, what, the language and
 * what the role pays, and naming the person half-reveals a private reason. The
 * session is described through the shared session facts the pool card reads,
 * so the two say the same thing about it.
 *
 * **Times are in the product's own zone with its short name beside them**, as
 * `/sub` writes them: no reader zone reaches the bot (`src/app/api/discord/`
 * has the ruling).
 *
 * Pure — the copy, the logo and the session all arrive as arguments.
 */

// ---------------------------------------------------------------- custom_ids

/**
 * `subreq` on a live DM; `subpreview` on the admin tool's preview, whose every
 * press answers "this is a preview" — the `/sub` parser already reads any
 * `subpreview:` id as exactly that.
 */
export type SubReqPrefix = "subreq" | "subpreview";

/** What a DM's button says: which answer, to which request. */
export interface SubReqAction {
  kind: "offer" | "decline";
  requestId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read a DM button's custom_id — `subreq:o:<requestId>` or
 * `subreq:d:<requestId>` — or `null` when it is not one. It says what was
 * pressed and never who pressed it: the press is answered as the gedu the
 * presser's Discord id acts as.
 */
export function parseSubReqCustomId(customId: string): SubReqAction | null {
  const [prefix, kind, requestId, ...rest] = customId.split(":");
  if (prefix !== "subreq" || rest.length > 0) return null;
  if (!requestId || !UUID.test(requestId)) return null;
  if (kind === "o") return { kind: "offer", requestId };
  if (kind === "d") return { kind: "decline", requestId };
  return null;
}

function offerId(prefix: SubReqPrefix, requestId: string): string {
  return `${prefix}:o:${requestId}`;
}

function declineId(prefix: SubReqPrefix, requestId: string): string {
  return `${prefix}:d:${requestId}`;
}

// ---------------------------------------------------------------- copy

/**
 * The translators the DMs read, in the recipient's locale. The DM's own lines
 * live under `discordSubOffer`; the answers and the role's chips are the pool
 * card's own keys, so the DM and the card say them in the same words.
 */
export interface DiscordSubOfferCopy {
  locale: SupportedLocale;
  offer: ReturnType<typeof createTranslator<Messages, "discordSubOffer">>;
  pool: ReturnType<typeof createTranslator<Messages, "gedu.substitution">>;
  facts: ReturnType<typeof createTranslator<Messages, "sessionFacts">>;
}

export async function loadDiscordSubOfferCopy(
  locale: SupportedLocale,
): Promise<DiscordSubOfferCopy> {
  const messages = await loadMessages(locale);
  return {
    locale,
    offer: createTranslator({ locale, messages, namespace: "discordSubOffer" }),
    pool: createTranslator({ locale, messages, namespace: "gedu.substitution" }),
    facts: createTranslator({ locale, messages, namespace: "sessionFacts" }),
  };
}

// ---------------------------------------------------------------- the session

/** The session a DM is about — the pool card's facts and its frame. */
export interface SubstitutionDmSession {
  requestId: string;
  groupName: string;
  /** The shared session facts, in the recipient's locale. */
  facts: SessionFacts;
  /** The role being substituted — the absent gedu's. */
  role: GeduAssignmentRole;
  /** What the role pays per session; `null` where the product has set none. */
  feeCents: number | null;
}

/**
 * The DM's session from a notification snapshot, through the very derivation
 * the pool card reads — nothing about a person, so nothing the snapshot holds
 * for admins alone (the absent gedu, the reason) can reach a DM through it.
 */
export function substitutionDmSession(
  snapshot: Pick<SubstitutionNotificationSnapshot, "request" | "product">,
  locale: SupportedLocale,
): SubstitutionDmSession {
  return {
    requestId: snapshot.request.id,
    groupName: snapshot.request.group_name,
    facts: buildSessionFacts({
      product: sessionFactsProduct(snapshot.product),
      sessionDate: snapshot.request.session_date,
      locale,
    }),
    role: snapshot.request.role,
    feeCents: snapshot.request.fee_cents,
  };
}

/**
 * When, in the product's zone with the zone's short name — or, for a date the
 * schedule no longer projects, the bare date, which has no time to state.
 */
export function substitutionDmWhen(facts: SessionFacts, locale: SupportedLocale): string {
  if (facts.startsAt === null || facts.endsAt === null) {
    return formatDateOnly(facts.sessionDate, locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }
  return `${formatDate(facts.startsAt, locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: facts.timezone,
  })}, ${formatTimeRange(facts.startsAt, facts.endsAt, locale, facts.timezone)}`;
}

/** The session as lines: when, what, then where, topic, language and the role's terms. */
function sessionLines(copy: DiscordSubOfferCopy, session: SubstitutionDmSession): DiscordComponent {
  const { facts } = session;
  const where = facts.isRemote ? copy.facts("remote") : (facts.siteName ?? copy.facts("siteUnknown"));
  const role = session.role === "primary" ? copy.pool("poolRolePrimary") : copy.pool("poolRoleAssistant");
  const terms =
    session.feeCents === null
      ? role
      : `${role} · ${copy.pool("poolFee", {
          fee: formatCurrencyFromCents(session.feeCents, DEFAULT_CURRENCY, copy.locale),
        })}`;
  return text(
    [
      `**${substitutionDmWhen(facts, copy.locale)}**`,
      `${facts.productName} — ${session.groupName}`,
      `-# ${where} · ${PRODUCT_TOPICS[facts.topic].label} · ${languageNameIn(facts.spokenLanguageCode, copy.locale)}`,
      `-# ${terms}`,
    ].join("\n"),
  );
}

// ---------------------------------------------------------------- the offer DM

/**
 * The DM a gedu the request could go to is sent, and every redraw of it.
 *
 * While the request is open its controls follow the gedu's own answer, as the
 * pool card's do — Decline then Offer before any answer (the affirmative
 * last), the other answer alone once one is given, under the line saying which
 * was given. Once it is closed the controls are gone and one line says why:
 * filled, or no longer needed (withdrawn, cancelled or passed).
 *
 * `refusalLine` is the write's own refusal after a press it turned down, drawn
 * above the controls, which come back so the gedu can answer again.
 */
export function buildSubstitutionOfferDm({
  copy,
  logoUrl,
  session,
  response,
  state,
  refusalLine = null,
  prefix = "subreq",
}: {
  copy: DiscordSubOfferCopy;
  /** The header's logo — `discordSubLogoUrl()` — or `null` for none. */
  logoUrl: string | null;
  session: SubstitutionDmSession;
  /** The recipient's own answer, or `null` before they have given one. */
  response: SubstitutionOfferResponse | null;
  state: NotificationStateKind;
  refusalLine?: string | null;
  prefix?: SubReqPrefix;
}): DiscordComponentsMessage {
  const body: DiscordComponent[] = [divider(), sessionLines(copy, session), divider()];

  if (state !== "open") {
    body.push(text(`**${state === "filled" ? copy.offer("filled") : copy.offer("notNeeded")}**`));
  } else {
    if (response === "offer") body.push(text(`✅ ${copy.pool("poolOffered")}`));
    if (response === "decline") body.push(text(`-# ${copy.pool("poolDeclined")}`));
    if (refusalLine !== null) body.push(text(`⚠️ ${refusalLine}`));
    const decline = button(declineId(prefix, session.requestId), copy.pool("poolDeclineAction"), BUTTON_SECONDARY);
    const offer = button(offerId(prefix, session.requestId), copy.pool("poolOfferAction"), BUTTON_PRIMARY);
    body.push(
      row(response === "offer" ? [decline] : response === "decline" ? [offer] : [decline, offer]),
    );
  }

  return brandedMessage(copy.pool("pageTitle"), logoUrl, {
    head: [text(`### ${copy.offer("heading")}`)],
    body,
  });
}

// ---------------------------------------------------------------- the accepted DM

/**
 * The DM the gedu seated on a request is sent: the session is theirs now, and
 * the way to My SOG — on a link button, so the message carries no preview.
 * Without a URL Discord could open (a send from a dev machine) the button is
 * left off rather than pointed somewhere broken.
 */
export function buildSubstitutionAcceptedDm({
  copy,
  logoUrl,
  session,
  mySogUrl,
}: {
  copy: DiscordSubOfferCopy;
  /** The header's logo — `discordSubLogoUrl()` — or `null` for none. */
  logoUrl: string | null;
  session: SubstitutionDmSession;
  /** The gedu's My SOG, absolute, or `null` for no button. */
  mySogUrl: string | null;
}): DiscordComponentsMessage {
  const body: DiscordComponent[] = [
    divider(),
    text(
      copy.offer("acceptedBody", {
        product: session.facts.productName,
        group: session.groupName,
        when: substitutionDmWhen(session.facts, copy.locale),
      }),
    ),
  ];
  if (mySogUrl !== null) {
    body.push(
      row([linkButton(copy.offer("openMySog"), mySogUrl)]),
    );
  }
  return brandedMessage(copy.pool("pageTitle"), logoUrl, {
    head: [text(`### ${copy.offer("acceptedHeading")}`)],
    body,
  });
}

// ---------------------------------------------------------------- the admin preview

/** The request id every preview control names — no request holds it. */
const PREVIEW_REQUEST_ID = "00000000-0000-4000-8000-0000000000aa";

/**
 * A sample session for the preview: an in-person club, a week from `now`, in
 * the default zone, paying a primary's fee.
 */
export function buildSubstitutionPreviewSession(
  now: Date,
  locale: SupportedLocale,
): SubstitutionDmSession {
  const sessionDate = addCalendarDays(formatInTimeZone(now, DEFAULT_TIMEZONE, "yyyy-MM-dd"), 7);
  return {
    requestId: PREVIEW_REQUEST_ID,
    groupName: "A",
    facts: buildSessionFacts({
      product: {
        productType: "consumer_club",
        topic: "minecraft_java",
        spokenLanguageCode: "fi",
        timezone: DEFAULT_TIMEZONE,
        isRemote: false,
        siteName: "Sample School",
        translations: [{ locale: "en", name: "Minecraft Club" }],
        slots: [
          {
            // Monday is 0, as the schedule slots count.
            weekday: (new Date(`${sessionDate}T00:00:00Z`).getUTCDay() + 6) % 7,
            startTime: "16:00",
            durationMinutes: 90,
          },
        ],
      },
      sessionDate,
      locale,
    }),
    role: "primary",
    feeCents: 4500,
  };
}

/**
 * Every substitution DM, in the order a gedu meets them, for the admin tool to
 * DM as part of its preview set: unanswered, offered, declined, a refused
 * press, filled, no longer needed, and the accepted DM. Built by the live
 * builders, every control on the preview prefix.
 */
export function buildSubstitutionPreviewFlow({
  copy,
  logoUrl,
  now,
  mySogUrl,
  refusalLine,
}: {
  copy: DiscordSubOfferCopy;
  logoUrl: string | null;
  now: Date;
  mySogUrl: string | null;
  /** A refusal as the routes would draw it — the caller's mapper picks it. */
  refusalLine: string;
}): [DiscordComponentsMessage, ...DiscordComponentsMessage[]] {
  const session = buildSubstitutionPreviewSession(now, copy.locale);
  const dm = (
    response: SubstitutionOfferResponse | null,
    state: NotificationStateKind,
    refusal: string | null = null,
  ) =>
    buildSubstitutionOfferDm({
      copy,
      logoUrl,
      session,
      response,
      state,
      refusalLine: refusal,
      prefix: "subpreview",
    });

  return [
    dm(null, "open"),
    dm("offer", "open"),
    dm("decline", "open"),
    dm(null, "open", refusalLine),
    dm("offer", "filled"),
    dm(null, "withdrawn"),
    buildSubstitutionAcceptedDm({ copy, logoUrl, session, mySogUrl }),
  ];
}
