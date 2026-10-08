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
 * with — who is absent and why, the session, what it needs, and every gedu it
 * concerns with how they answered and whether the bot reached them — and an
 * Accept button on each offer while the request is open.
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
 * Pure. Slack refuses a message past its caps rather than cutting it, so the
 * builder keeps under them: under 50 blocks, and every text under its limit,
 * with "+N more" where a list had to stop.
 */

/** The locale the message's dates, money and product name are written in. */
const LOCALE: SupportedLocale = "en";

/** Slack's caps. */
const MAX_BLOCKS = 50;
const SECTION_TEXT_MAX = 3000;
const HEADER_TEXT_MAX = 150;
/** Room for the blocks around the offers: see {@link buildSubstitutionSlackMessage}. */
const MAX_OFFER_BLOCKS = MAX_BLOCKS - 12;

/** The action id the Accept button carries; its value is the offer's id. */
export const SLACK_ACCEPT_ACTION_ID = "sub_accept";

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
 * How the bot reached a gedu, and whether they still could take it:
 * DM'd, DM failed, not on Discord, or not DM'd (on Discord, but the request
 * had closed, or Discord is not configured here) — plus "no longer eligible"
 * for a gedu the pool would no longer offer it to.
 */
export function candidateTags(candidate: SnapshotCandidate, dm: SnapshotDm | undefined): string[] {
  const tags: string[] = [];
  if (dm?.message_id) tags.push("DM'd");
  else if (dm?.delivery_error) tags.push("DM failed");
  else if (candidate.discord_user_id === null) tags.push("not on Discord");
  else tags.push("not DM'd");
  if (!candidate.eligible) tags.push("no longer eligible");
  return tags;
}

function taggedName(candidate: SnapshotCandidate, dm: SnapshotDm | undefined): string {
  return `${escapeSlack(fullName(candidate))} _(${candidateTags(candidate, dm).join(", ")})_`;
}

/**
 * A labelled list of names as one line, cut with "+N more" where the next name
 * would carry it past Slack's text cap.
 */
function nameLine(label: string, names: readonly string[]): string {
  const head = `*${label}:* `;
  // Room for the " +N more" the line may have to end on.
  const budget = SECTION_TEXT_MAX - head.length - 16;
  let body = "";
  for (let index = 0; index < names.length; index += 1) {
    const next = `${index === 0 ? "" : ", "}${names[index]}`;
    if (body.length + next.length > budget) {
      return `${head}${body} +${names.length - index} more`;
    }
    body += next;
  }
  return `${head}${body}`;
}

function statusLine(state: NotificationState): string {
  switch (state.kind) {
    case "open":
      return "*Open* — waiting for an admin to accept an offer";
    case "filled":
      return `*Filled* by ${escapeSlack(fullName(state.substitute))} (approved by ${escapeSlack(fullName(state.approver))})`;
    case "withdrawn":
      return "*Withdrawn* — the gedu can make it after all";
    case "cancelled":
      return "*Session cancelled*";
    case "past":
      return "*Session passed* — nobody was accepted";
  }
}

/** The fallback text: what, when, and where it stands. */
function fallbackText(product: string, group: string, when: string, state: NotificationState): string {
  const what = `${product} – ${group}, ${when}`;
  switch (state.kind) {
    case "open":
      return `Substitute needed: ${what}`;
    case "filled":
      return `Substitute found: ${what} — ${fullName(state.substitute)}`;
    case "withdrawn":
      return `Substitute request withdrawn: ${what}`;
    case "cancelled":
      return `Session cancelled: ${what}`;
    case "past":
      return `Session passed with no substitute: ${what}`;
  }
}

/**
 * The channel's message about one request.
 *
 * Laid out top to bottom: the product as the header; the group and when; the
 * facts as fields (absent gedu, role, reason, where, language, topic, required
 * qualifications, fee) with the reason's note under them; then where the
 * request stands; one section per offer, oldest first, with Accept beside it
 * while the request is open; and the declines and the gedus yet to answer as
 * one line each. The Accept button asks before it seats anybody.
 */
export function buildSubstitutionSlackMessage({
  snapshot,
  state,
}: {
  snapshot: Pick<
    SubstitutionNotificationSnapshot,
    "request" | "product" | "required_qualifications" | "candidates" | "dms"
  >;
  state: NotificationState;
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

  const fields = [
    `*Absent*\n${escapeSlack(fullName(request.requester))}`,
    `*Role*\n${request.role === "primary" ? "Primary" : "Assistant"}`,
    `*Reason*\n${REASON_LABEL[request.reason]}`,
    `*Where*\n${escapeSlack(where)}`,
    `*Language*\n${languageNameIn(facts.spokenLanguageCode, LOCALE)}`,
    `*Topic*\n${escapeSlack(PRODUCT_TOPICS[facts.topic].label)}`,
    `*Qualifications*\n${
      snapshot.required_qualifications.length === 0
        ? "None"
        : snapshot.required_qualifications.map((q) => QUALIFICATION_LABEL[q]).join(", ")
    }`,
    `*Fee*\n${
      request.fee_cents === null
        ? "Not set"
        : `${formatCurrencyFromCents(request.fee_cents, DEFAULT_CURRENCY, LOCALE)} per session`
    }`,
  ];

  const blocks: SlackBlock[] = [
    { type: "header", text: plain(productName, HEADER_TEXT_MAX) },
    section(`*${escapeSlack(request.group_name)}* · ${escapeSlack(when)}`),
    { type: "section", fields: fields.map((field) => mrkdwn(field)) },
  ];
  if (request.reason_note !== null && request.reason_note.trim() !== "") {
    blocks.push(section(`*Note:* ${escapeSlack(request.reason_note)}`));
  }
  blocks.push({ type: "divider" }, section(statusLine(state)));

  const dmOf = new Map(snapshot.dms.map((dm) => [dm.gedu_id, dm]));
  const offers = snapshot.candidates
    .filter((c) => c.response === "offer" && c.offer_id !== null)
    .sort((a, b) => (a.responded_at ?? "").localeCompare(b.responded_at ?? ""));
  const declined = snapshot.candidates.filter((c) => c.response === "decline");
  const unanswered = snapshot.candidates.filter((c) => c.response === null);
  const isOpen = state.kind === "open";

  if (offers.length === 0) {
    blocks.push(section("_No offers yet._"));
  }
  const shownOffers = offers.length > MAX_OFFER_BLOCKS ? offers.slice(0, MAX_OFFER_BLOCKS - 1) : offers;
  for (const candidate of shownOffers) {
    const offered =
      candidate.responded_at === null
        ? ""
        : ` · offered ${formatDate(candidate.responded_at, LOCALE, {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
            timeZone: facts.timezone,
          })}`;
    const block: SlackBlock = section(`*Offer:* ${taggedName(candidate, dmOf.get(candidate.gedu_id))}${offered}`);
    if (isOpen && candidate.offer_id !== null) {
      block.accessory = {
        type: "button",
        action_id: SLACK_ACCEPT_ACTION_ID,
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
      };
    }
    blocks.push(block);
  }
  if (shownOffers.length < offers.length) {
    blocks.push(section(`_+${offers.length - shownOffers.length} more offers — see the Substitutions page._`));
  }

  const lines: string[] = [];
  if (declined.length > 0) {
    lines.push(nameLine("Declined", declined.map((c) => taggedName(c, dmOf.get(c.gedu_id)))));
  }
  if (unanswered.length > 0) {
    lines.push(nameLine("No answer", unanswered.map((c) => taggedName(c, dmOf.get(c.gedu_id)))));
  }
  if (lines.length > 0) blocks.push({ type: "divider" });
  for (const line of lines) blocks.push(section(line));

  return {
    text: fallbackText(productName, request.group_name, when, state),
    blocks,
  };
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
export function buildSlackLinkReply(linkUrl: string): SlackEphemeralReply {
  return buildLinkReply(
    "Connect your Slack account to your School of Gaming admin account. The link expires in 10 minutes and works once.",
    linkUrl,
  );
}

/**
 * An Accept pressed by somebody whose Slack account is not linked to an admin
 * account: nothing changed, and the way to link it.
 */
export function buildSlackLinkFirstReply(linkUrl: string): SlackEphemeralReply {
  return buildLinkReply(
    "Nothing was accepted: link your Slack account to your School of Gaming admin account first, then press Accept again. The link expires in 10 minutes and works once.",
    linkUrl,
  );
}

function buildLinkReply(line: string, linkUrl: string): SlackEphemeralReply {
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
        },
      ],
    },
  ]);
}

/** An Accept the write refused: its refusal line, to the presser alone. */
export function buildSlackRefusalReply(line: string): SlackEphemeralReply {
  return ephemeral(line, [section(`:warning: ${escapeSlack(line)}`)]);
}
