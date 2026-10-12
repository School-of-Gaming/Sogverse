import { DEFAULT_CURRENCY } from "@/lib/constants/currency";
import type { SupportedLocale } from "@/lib/constants/locales";
import { languageNameIn } from "@/lib/i18n/language-name";
import { PRODUCT_TOPICS } from "@/lib/products/topics";
import {
  buildSessionFacts,
  sessionFactsProduct,
} from "@/lib/substitution-session-facts";
import { formatCurrencyFromCents, formatDate } from "@/lib/utils";
import type { GeduQualification, SubstitutionReason } from "@/types";
import { substitutionDmWhen } from "./discord-dm-message";
import type {
  SnapshotCandidate,
  SnapshotDm,
  SnapshotPerson,
  SubstitutionNotificationSnapshot,
} from "./snapshot.contracts";
import type { NotificationState } from "./state";

/**
 * **The Slack message a substitution request is announced with** in the staff
 * channel, built as Block Kit data: everything an admin answers an absence
 * with — who is absent and why, the session, what it needs, the offers with an
 * Accept on each while the request is open, and every gedu it concerns with
 * how they answered and whether the bot reached them.
 *
 * **The strings are English, here in the renderer.** The channel is staff-only
 * and has no locale, like the Discord bot's staff commands; message keys would
 * be five translations nobody reads.
 *
 * **The session's time is in the product's zone with the zone's short name**,
 * as the Discord DMs write it: Slack's own date tokens would localise it, but
 * the DM the gedus read and the message the admins read then state one time
 * two ways.
 *
 * **The state leads as a section, not an alert block.** Slack's alert block
 * renders in modals only; a message carrying one is refused as
 * `invalid_blocks`. The offers are cards in a carousel, and the session's
 * facts and the gedus are two data tables — all message blocks. Slack documents no fallback for a client that
 * cannot draw them, so the top-level `text` (what notifications and screen
 * readers read) says on its own what the request is and where it stands.
 *
 * Pure. Slack refuses a message past its caps rather than cutting it, so the
 * builder keeps under them — ten cards to a carousel, every text under its
 * limit, the table under its row and character caps — with "+N more" where a
 * list had to stop.
 */

/** The locale the message's dates, money and product name are written in. */
const LOCALE: SupportedLocale = "en";

/** Slack's caps. */
const SECTION_TEXT_MAX = 3000;
const HEADER_TEXT_MAX = 150;
const CARD_TITLE_MAX = 150;
const CARD_SUBTITLE_MAX = 150;
const CAROUSEL_MAX_CARDS = 10;
/** A data table holds 200 rows under its header… */
const TABLE_MAX_ROWS = 200;
/**
 * …and a message 20,000 characters across the cells of all its tables, the
 * facts table's included; the margin is for the gedus table's header.
 */
const TABLE_TEXT_BUDGET = 19_500;
/** A name longer than this is cut in its cell, so one name cannot eat the table. */
const TABLE_NAME_MAX = 100;
const TABLE_PAGE_SIZE = 20;

/** The action id the Accept button carries; its value is the offer's id. */
export const SLACK_ACCEPT_ACTION_ID = "sub_accept";

/**
 * The prefix every control on the admin tool's preview carries in its
 * `action_id`. A press on one is answered as a preview and changes nothing.
 */
export const SLACK_PREVIEW_ACTION_PREFIX = "subpreview";

/** A Block Kit block, as Slack reads it — plain JSON. */
export type SlackBlock = Record<string, unknown>;

/** What `chat.postMessage` and `chat.update` are sent. */
export interface SlackMessage {
  /** The fallback shown in notifications and wherever blocks cannot render. */
  text: string;
  blocks: SlackBlock[];
}

/** Escape the three characters Slack's mrkdwn reads as control. */
export function escapeSlack(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clipText(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function mrkdwn(value: string): { type: "mrkdwn"; text: string } {
  return { type: "mrkdwn", text: clipText(value, SECTION_TEXT_MAX) };
}

function plain(value: string, max: number): { type: "plain_text"; text: string; emoji: true } {
  return { type: "plain_text", text: clipText(value, max), emoji: true };
}

function section(value: string): SlackBlock {
  return { type: "section", text: mrkdwn(value) };
}

function fullName(person: Pick<SnapshotPerson, "first_name" | "last_name">): string {
  return `${person.first_name} ${person.last_name}`.trim();
}

const REASON_LABEL: Record<SubstitutionReason, string> = {
  sick: "Sick",
  other: "Other",
};

const QUALIFICATION_LABEL: Record<GeduQualification, string> = {
  neuroinclusive: "Neuroinclusive",
  consumer_products: "Consumer products",
};

/**
 * How the bot reached a gedu: DM'd, DM failed, not on Discord, or not DM'd
 * (on Discord, but the request had closed, or Discord is not configured here).
 */
function discordStatus(candidate: SnapshotCandidate, dm: SnapshotDm | undefined): string {
  if (dm?.message_id) return "DM'd";
  if (dm?.delivery_error) return "DM failed";
  if (candidate.discord_user_id === null) return "not on Discord";
  return "not DM'd";
}

/** A gedu's answer — and "Accepted" for the gedu seated on the request, however they were seated. */
function answerLabel(candidate: SnapshotCandidate, seatedId: string | null): string {
  if (candidate.gedu_id === seatedId) return "Accepted";
  if (candidate.response === "offer") return "Offered";
  if (candidate.response === "decline") return "Declined";
  return "—";
}

/** Where the request stands, as the message's first line. */
function stateLine(state: NotificationState): string {
  switch (state.kind) {
    case "open":
      return ":warning: *Needs a substitute* — waiting for an admin to accept an offer";
    case "filled":
      return `:white_check_mark: *Filled by ${escapeSlack(fullName(state.substitute))}*, approved by ${escapeSlack(fullName(state.approver))}`;
    case "withdrawn":
      return ":information_source: *Withdrawn* — the gedu can make it after all";
    case "cancelled":
      return ":information_source: *Session cancelled* — no substitute needed";
    case "past":
      return ":information_source: *Session passed* — nobody was accepted";
  }
}

/** The fallback text: what, when, and where it stands. */
function fallbackText(product: string, group: string, when: string, state: NotificationState): string {
  const what = `${escapeSlack(product)} – ${escapeSlack(group)}, ${escapeSlack(when)}`;
  switch (state.kind) {
    case "open":
      return `Substitute needed: ${what}`;
    case "filled":
      return `Substitute found: ${what} — ${escapeSlack(fullName(state.substitute))}`;
    case "withdrawn":
      return `Substitute request withdrawn: ${what}`;
    case "cancelled":
      return `Session cancelled: ${what}`;
    case "past":
      return `Session passed with no substitute: ${what}`;
  }
}

/**
 * One cell of a data table: unformatted, so nothing in it needs escaping.
 * Slack refuses an empty cell, so an empty value is a dash.
 */
function cell(value: string): { type: "raw_text"; text: string } {
  return { type: "raw_text", text: value === "" ? "—" : value };
}

/** A stored phone — E.164 digits with no plus — as it is dialled; empty when there is none. */
function phoneLabel(phone: string | null): string {
  return phone === null ? "" : `+${phone}`;
}

/**
 * The channel's message about one request.
 *
 * Laid out top to bottom: where the request stands; the product as the
 * header; the group and when; the facts as a two-column table (absent gedu,
 * role, reason, where, language, topic, required qualifications, fee) with the
 * reason's note under it; the offers as cards, oldest first, each with an Accept that asks
 * before it seats anybody — only while the request is open; then every gedu
 * the request concerns as a table, with their phone — offers, declines, then
 * those yet to answer. The gedu seated on the request leads both, marked
 * Accepted, so a filled request reads as settled at every place an admin
 * looks; the other cards keep their offers but lose their buttons.
 *
 * `preview` puts every control on the preview prefix, for the admin tool.
 */
export function buildSubstitutionSlackMessage({
  snapshot,
  state,
  preview = false,
}: {
  snapshot: Pick<
    SubstitutionNotificationSnapshot,
    "request" | "product" | "required_qualifications" | "candidates" | "dms"
  >;
  state: NotificationState;
  preview?: boolean;
}): SlackMessage {
  const { request, product } = snapshot;
  const facts = buildSessionFacts({
    product: sessionFactsProduct(product),
    sessionDate: request.session_date,
    locale: LOCALE,
  });
  const when = substitutionDmWhen(facts, LOCALE);
  const productName = facts.productName || "Session";
  const where = facts.isRemote ? "Remote" : (facts.siteName ?? "Place to be confirmed");

  const factRows: [string, string][] = [
    ["Detail", "Value"],
    ["Absent", clipText(fullName(request.requester), TABLE_NAME_MAX)],
    ["Role", request.role === "primary" ? "Primary" : "Assistant"],
    ["Reason", REASON_LABEL[request.reason]],
    ["Where", clipText(where, TABLE_NAME_MAX)],
    ["Language", languageNameIn(facts.spokenLanguageCode, LOCALE)],
    ["Topic", PRODUCT_TOPICS[facts.topic].label],
    [
      "Qualifications",
      snapshot.required_qualifications.length === 0
        ? "None"
        : snapshot.required_qualifications.map((q) => QUALIFICATION_LABEL[q]).join(", "),
    ],
    [
      "Fee",
      request.fee_cents === null
        ? "Not set"
        : `${formatCurrencyFromCents(request.fee_cents, DEFAULT_CURRENCY, LOCALE)} per session`,
    ],
  ];

  const blocks: SlackBlock[] = [
    section(stateLine(state)),
    { type: "header", text: plain(productName, HEADER_TEXT_MAX) },
    section(`*${escapeSlack(request.group_name)}* · ${escapeSlack(when)}`),
    {
      type: "data_table",
      caption: "About this request",
      // Every fact on one page: Slack's default page is five rows.
      page_size: factRows.length,
      rows: factRows.map((row) => row.map(cell)),
    },
  ];
  if (request.reason_note !== null && request.reason_note.trim() !== "") {
    blocks.push(section(`*Note:* ${escapeSlack(request.reason_note)}`));
  }
  blocks.push({ type: "divider" });

  const dmOf = new Map(snapshot.dms.map((dm) => [dm.gedu_id, dm]));
  // The seated gedu leads the offers and the table, marked Accepted, so the
  // message says who has the session wherever an admin looks. Only while filled:
  // a cancelled session outranks its sub and reads as plain cancelled.
  const seatedId =
    state.kind === "filled" && request.status === "substituted"
      ? request.substitute.id
      : null;
  const seatedFirst = (a: SnapshotCandidate, b: SnapshotCandidate) =>
    Number(b.gedu_id === seatedId) - Number(a.gedu_id === seatedId);
  const offers = snapshot.candidates
    .filter((c) => c.response === "offer" && c.offer_id !== null)
    .sort((a, b) => (a.responded_at ?? "").localeCompare(b.responded_at ?? ""))
    .sort(seatedFirst);
  const declined = snapshot.candidates.filter((c) => c.response === "decline");
  const unanswered = snapshot.candidates.filter((c) => c.response === null);
  const isOpen = state.kind === "open";
  const acceptActionId = preview
    ? `${SLACK_PREVIEW_ACTION_PREFIX}_accept`
    : SLACK_ACCEPT_ACTION_ID;

  if (offers.length === 0) {
    blocks.push(section("_No offers yet._"));
  } else {
    const shownOffers = offers.slice(0, CAROUSEL_MAX_CARDS);
    blocks.push({
      type: "carousel",
      elements: shownOffers.map((candidate) => {
        const seated = candidate.gedu_id === seatedId;
        const card: SlackBlock = {
          type: "card",
          title: plain(
            seated ? `:white_check_mark: ${fullName(candidate)}` : fullName(candidate),
            CARD_TITLE_MAX,
          ),
          subtitle: plain(
            seated && request.status === "substituted"
              ? acceptedLine(request.approver, request.approved_at, facts.timezone)
              : offeredLine(candidate, facts.timezone),
            CARD_SUBTITLE_MAX,
          ),
        };
        if (isOpen && candidate.offer_id !== null) {
          card.actions = [
            {
              type: "button",
              action_id: acceptActionId,
              value: candidate.offer_id,
              style: "primary",
              text: plain("Accept", 75),
              confirm: {
                title: plain("Accept this offer?", 100),
                text: plain(
                  `${fullName(candidate)} will be seated as the substitute for ${productName} – ${request.group_name}, ${when}.`,
                  300,
                ),
                confirm: plain("Accept", 30),
                deny: plain("Cancel", 30),
              },
            },
          ];
        }
        return card;
      }),
    });
    if (shownOffers.length < offers.length) {
      blocks.push(
        section(`_+${offers.length - shownOffers.length} more offers — see the Substitutions page._`),
      );
    }
  }

  // Stable, so the seated gedu moves to the top and everyone else keeps their place.
  const concerned = [...offers, ...declined, ...unanswered].sort(seatedFirst);
  if (concerned.length === 0) {
    blocks.push(section("_No gedu can take this session._"));
  } else {
    const header = ["Gedu", "Phone", "Discord", "Answer"];
    const rows: { type: "raw_text"; text: string }[][] = [header.map(cell)];
    // Slack's character cap is per message, so the facts table spends it first.
    let used = factRows.flat().join("").length + header.join("").length;
    for (const candidate of concerned) {
      const row = [
        clipText(fullName(candidate), TABLE_NAME_MAX),
        phoneLabel(candidate.phone),
        discordStatus(candidate, dmOf.get(candidate.gedu_id)),
        answerLabel(candidate, seatedId),
      ].map(cell);
      // Counted as sent: an empty value goes out as its dash.
      const size = row.reduce((total, { text }) => total + text.length, 0);
      if (rows.length > TABLE_MAX_ROWS || used + size > TABLE_TEXT_BUDGET) break;
      used += size;
      rows.push(row);
    }
    blocks.push({
      type: "data_table",
      caption: "Gedus this request concerns",
      page_size: TABLE_PAGE_SIZE,
      rows,
    });
    const left = concerned.length - (rows.length - 1);
    if (left > 0) {
      blocks.push(section(`_+${left} more gedus — see the Substitutions page._`));
    }
  }

  return {
    text: fallbackText(productName, request.group_name, when, state),
    blocks,
  };
}

/** Who accepted the seated gedu's offer and when, in the session's zone. */
function acceptedLine(approver: SnapshotPerson, approvedAt: string, timezone: string): string {
  return `Accepted by ${fullName(approver)}, ${formatDate(approvedAt, LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  })}`;
}

/** When a gedu offered, in the session's zone. */
function offeredLine(candidate: SnapshotCandidate, timezone: string): string {
  if (candidate.responded_at === null) return "Offered";
  return `Offered ${formatDate(candidate.responded_at, LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  })}`;
}

// ---------------------------------------------------------------- ephemeral replies

/** What a reply through a `response_url` is sent — only the presser sees it. */
export interface SlackEphemeralReply extends SlackMessage {
  response_type: "ephemeral";
  replace_original: false;
}

function ephemeral(text: string, blocks: SlackBlock[]): SlackEphemeralReply {
  return { response_type: "ephemeral", replace_original: false, text, blocks };
}

/**
 * The slash command's answer: a button to the one-time page that links the
 * caller's Slack account to their Sogverse admin account, and how long it
 * lasts. The URL is on the button, so the reply unfurls nothing.
 */
export function buildSlackLinkReply(linkUrl: string, preview = false): SlackEphemeralReply {
  return buildLinkReply(
    "Connect your Slack account to your School of Gaming admin account. The link expires in 10 minutes and works once.",
    linkUrl,
    preview,
  );
}

/**
 * An Accept pressed by somebody whose Slack account is not linked to an admin
 * account: nothing changed, and the way to link it.
 */
export function buildSlackLinkFirstReply(linkUrl: string, preview = false): SlackEphemeralReply {
  return buildLinkReply(
    "Nothing was accepted: link your Slack account to your School of Gaming admin account first, then press Accept again. The link expires in 10 minutes and works once.",
    linkUrl,
    preview,
  );
}

function buildLinkReply(line: string, linkUrl: string, preview: boolean): SlackEphemeralReply {
  return ephemeral(line, [
    section(escapeSlack(line)),
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: plain("Connect account", 75),
          url: linkUrl,
          style: "primary",
          // A URL button still reports its press; on the preview it is
          // answered as one.
          ...(preview ? { action_id: `${SLACK_PREVIEW_ACTION_PREFIX}_link` } : {}),
        },
      ],
    },
  ]);
}

/** An Accept the write refused: its refusal line, to the presser alone. */
export function buildSlackRefusalReply(line: string): SlackEphemeralReply {
  return ephemeral(line, [section(`:warning: ${escapeSlack(line)}`)]);
}

/** A press on a preview control: nothing happened, to the presser alone. */
export function buildSlackPreviewPressReply(): SlackEphemeralReply {
  const line = "This is a preview — nothing was approved.";
  return ephemeral(line, [section(line)]);
}
