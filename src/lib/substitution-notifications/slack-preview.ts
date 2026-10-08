import { formatInTimeZone } from "date-fns-tz";
import { addCalendarDays } from "@/lib/calendar-date";
import { ROUTES } from "@/lib/constants/routes";
import { DEFAULT_TIMEZONE } from "@/lib/constants/locales";
import {
  buildSlackLinkFirstReply,
  buildSlackLinkReply,
  buildSlackRefusalReply,
  buildSubstitutionSlackMessage,
  type SlackEphemeralReply,
  type SlackMessage,
} from "./slack-message";
import type {
  SnapshotCandidate,
  SnapshotDm,
  SnapshotPerson,
  SnapshotRequest,
  SubstitutionNotificationSnapshot,
} from "./snapshot.contracts";
import type { NotificationState } from "./state";

/**
 * **The admin testing tool's Slack preview**: every message the staff channel
 * can show about a substitution request, in the order an admin meets them,
 * built by the live builder over sample snapshots — open with no answers yet;
 * open with offers, a decline and a gedu in every Discord status; filled;
 * withdrawn; cancelled; passed — then the three ephemeral replies.
 *
 * Every control is on the preview prefix, so a press is answered as a preview
 * and changes nothing. An ephemeral reply can only be sent through a press's
 * `response_url`, so the replies are posted as ordinary messages, each
 * labelled as the ephemeral it stands for. The link replies carry the real
 * URL shape with a token no row holds, so nothing is minted and the page
 * shows its dead-link card.
 */

/** The ids the samples carry — no row holds them. */
const IDS = {
  request: "00000000-0000-4000-8000-0000000000aa",
  group: "a3f0d2c4-6b1e-4f7a-9c2d-5e8b1a0f3c71",
  product: "5c9e7b21-3d4f-4a8e-b6c1-0f2a9d8e7b53",
  requester: "8e2d4c6a-1b3f-4d5e-9a7c-2f6b8d0e4a19",
  admin: "d71f3a5c-9e2b-4c8d-a6f0-3b5e7c9d1a24",
  aino: "2b8f6d4e-0a1c-4e3b-8d5f-7c9a1e3b5d60",
  eero: "f4a2c6e8-3b5d-4f7a-9c1e-6d8b0a2c4e95",
  lumi: "6c0e8a2d-5f7b-4d9c-a3e1-8b0d2f4a6c37",
  onni: "93d5f7b1-8c0e-4a2d-b4f6-1e3a5c7e9b02",
  venla: "4e6a8c0f-2d4b-4f8e-8a1c-9d3f5b7a1e86",
  offerAino: "b5d7f9a1-4c6e-4b0d-9f2a-3e5c7a9b1d48",
  offerEero: "1f3b5d7e-6a8c-4e2b-a0d4-5c7e9b1f3a62",
  declineLumi: "c8e0a2b4-7d9f-4c1e-b3a5-6f8d0c2e4b17",
} as const;

function person(id: string, first: string, last: string): SnapshotPerson {
  return { id, first_name: first, last_name: last };
}

const AINO = person(IDS.aino, "Aino", "Korhonen");
const ADMIN = person(IDS.admin, "Sample", "Admin");

function candidate(
  who: SnapshotPerson,
  fields: Partial<Omit<SnapshotCandidate, "gedu_id" | "first_name" | "last_name">>,
): SnapshotCandidate {
  return {
    gedu_id: who.id,
    first_name: who.first_name,
    last_name: who.last_name,
    locale: null,
    discord_user_id: null,
    eligible: true,
    response: null,
    offer_id: null,
    responded_at: null,
    ...fields,
  };
}

function dm(geduId: string, fields: Partial<SnapshotDm>): SnapshotDm {
  return {
    request_id: IDS.request,
    gedu_id: geduId,
    discord_user_id: null,
    channel_id: null,
    message_id: null,
    rendered_hash: null,
    delivery_error: null,
    accepted_dm_claimed_at: null,
    accepted_dm_message_id: null,
    accepted_dm_sent_at: null,
    ...fields,
  };
}

type PreviewSnapshot = Pick<
  SubstitutionNotificationSnapshot,
  "request" | "product" | "required_qualifications" | "candidates" | "dms"
>;

/**
 * A sample request on an in-person club in the default zone, on
 * `sessionDate`, for the primary's seat, with the given gedus — open, or
 * substituted when `seated` names the sub.
 */
function sampleSnapshot(
  sessionDate: string,
  candidates: SnapshotCandidate[],
  dms: SnapshotDm[],
  seated: { substitute: SnapshotPerson; approver: SnapshotPerson; approved_at: string } | null = null,
): PreviewSnapshot {
  const base: Omit<SnapshotRequest, "status" | "substitute" | "approver" | "approved_at"> = {
    id: IDS.request,
    group_id: IDS.group,
    group_name: "A",
    session_date: sessionDate,
    role: "primary",
    fee_cents: 4500,
    reason: "sick",
    reason_note: "Down with the flu, back next week.",
    created_at: `${sessionDate}T06:00:00.000Z`,
    requester: person(IDS.requester, "Ville", "Virtanen"),
  };
  return {
    request:
      seated === null
        ? { ...base, status: "open", substitute: null, approver: null, approved_at: null }
        : { ...base, status: "substituted", ...seated },
    product: {
      id: IDS.product,
      product_type: "consumer_club",
      tag: null,
      topic: "minecraft_java",
      spoken_language_code: "fi",
      timezone: DEFAULT_TIMEZONE,
      is_remote: false,
      start_date: null,
      end_date: null,
      site_name: "Sample School",
      translations: [{ locale: "en", name: "Minecraft Club", description: "" }],
      schedule_slots: [
        {
          // Monday is 0, as the schedule slots count.
          weekday: (new Date(`${sessionDate}T00:00:00Z`).getUTCDay() + 6) % 7,
          start_time: "16:00:00",
          duration_minutes: 90,
        },
      ],
    },
    required_qualifications: [],
    candidates,
    dms,
  };
}

/** Label a reply as the ephemeral it stands for, so it is posted as an ordinary message. */
function asLabelledEphemeral(label: string, reply: SlackEphemeralReply): SlackMessage {
  return {
    text: `[Preview of an ephemeral reply: ${label}] ${reply.text}`,
    blocks: [
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*Preview of an ephemeral reply* — ${label}. In use, only the person who acted sees it.`,
          },
        ],
      },
      ...reply.blocks,
    ],
  };
}

/** Every Slack message about a substitution request, in the order an admin meets them. */
export function buildSubstitutionSlackPreviewSet({
  now,
  origin,
}: {
  now: Date;
  /** The origin the link replies' button is built on. */
  origin: string;
}): [SlackMessage, ...SlackMessage[]] {
  const today = formatInTimeZone(now, DEFAULT_TIMEZONE, "yyyy-MM-dd");
  const upcoming = addCalendarDays(today, 7);
  const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

  // Nobody has answered: three gedus asked, the DMs as they landed.
  const quiet = sampleSnapshot(
    upcoming,
    [
      candidate(AINO, { discord_user_id: "100000000000000001" }),
      candidate(person(IDS.eero, "Eero", "Mäki"), { discord_user_id: "100000000000000002" }),
      candidate(person(IDS.venla, "Venla", "Heikkinen"), { discord_user_id: "100000000000000005" }),
    ],
    [
      dm(IDS.aino, { message_id: "m1", channel_id: "c1" }),
      dm(IDS.eero, { message_id: "m2", channel_id: "c2" }),
      dm(IDS.venla, { message_id: "m5", channel_id: "c5" }),
    ],
  );

  // Two offers, a decline, and a gedu in every Discord status.
  const busyCandidates = [
    candidate(AINO, {
      discord_user_id: "100000000000000001",
      response: "offer",
      offer_id: IDS.offerAino,
      responded_at: ago(5),
    }),
    candidate(person(IDS.eero, "Eero", "Mäki"), {
      discord_user_id: "100000000000000002",
      response: "offer",
      offer_id: IDS.offerEero,
      responded_at: ago(2),
    }),
    candidate(person(IDS.lumi, "Lumi", "Nieminen"), {
      response: "decline",
      offer_id: IDS.declineLumi,
      responded_at: ago(3),
    }),
    candidate(person(IDS.onni, "Onni", "Laine"), {
      discord_user_id: "100000000000000004",
      eligible: false,
    }),
    candidate(person(IDS.venla, "Venla", "Heikkinen"), {
      discord_user_id: "100000000000000005",
    }),
  ];
  const busyDms = [
    dm(IDS.aino, { message_id: "m1", channel_id: "c1" }),
    dm(IDS.eero, { delivery_error: "DiscordApiError (50007)" }),
    dm(IDS.onni, { message_id: "m4", channel_id: "c4" }),
  ];
  const busy = sampleSnapshot(upcoming, busyCandidates, busyDms);
  const filled = sampleSnapshot(upcoming, busyCandidates, busyDms, {
    substitute: AINO,
    approver: ADMIN,
    approved_at: ago(1),
  });
  const passed = sampleSnapshot(addCalendarDays(today, -1), busyCandidates, busyDms);

  const message = (snapshot: PreviewSnapshot, state: NotificationState) =>
    buildSubstitutionSlackMessage({ snapshot, state, preview: true });
  // The real URL shape with a token no row holds.
  const linkUrl = `${origin}${ROUTES.linkSlack}?token=preview`;

  return [
    message(quiet, { kind: "open" }),
    message(busy, { kind: "open" }),
    message(filled, { kind: "filled", substitute: AINO, approver: ADMIN }),
    message(busy, { kind: "withdrawn" }),
    message(busy, { kind: "cancelled" }),
    message(passed, { kind: "past" }),
    asLabelledEphemeral("the link command's answer", buildSlackLinkReply(linkUrl, true)),
    asLabelledEphemeral(
      "Accept pressed by an admin whose Slack account is not linked",
      buildSlackLinkFirstReply(linkUrl, true),
    ),
    asLabelledEphemeral(
      "Accept refused",
      buildSlackRefusalReply("This session has already been settled by someone else."),
    ),
  ];
}
