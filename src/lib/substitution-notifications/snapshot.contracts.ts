import { z } from "zod";
import { Constants } from "@/types";
import {
  geduAssignmentRole,
  sessionProductDocument,
  substitutionOfferResponse,
  substitutionReason,
} from "@/services/session-substitution/session-substitution.contracts";

/**
 * The wire contract of `get_substitution_notification_snapshot` — everything the
 * notification sync renders one substitution request's Slack message and Discord
 * DMs from.
 *
 * The function returns `jsonb`, which the type generator sees only as `Json`, so
 * this schema is the structure. It is written from the function body and the DB
 * tests parse real output through it, so the two cannot drift apart quietly.
 * The read is the service role's alone and carries the absence reason: nothing
 * parsed through it may reach a gedu unfiltered.
 */

/** A person named on the request: the absent gedu, the sub, the approving admin. */
const snapshotPerson = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
});

export type SnapshotPerson = z.infer<typeof snapshotPerson>;

const snapshotRequestBase = z.object({
  id: z.string(),
  group_id: z.string(),
  group_name: z.string(),
  /** Product-local calendar date, `YYYY-MM-DD`. */
  session_date: z.string(),
  role: geduAssignmentRole,
  /** The fee for this role; null when the product has not set one. */
  fee_cents: z.number().nullable(),
  reason: substitutionReason,
  reason_note: z.string().nullable(),
  created_at: z.string(),
  /** The requester is a NOT NULL column under ON DELETE RESTRICT, so never null. */
  requester: snapshotPerson,
});

/**
 * The request, split on its status the way the table's state CHECK splits it:
 * a substituted request always carries its sub, its approver and when, and any
 * other status may not.
 */
const snapshotRequest = z.discriminatedUnion("status", [
  snapshotRequestBase.extend({
    status: z.literal("substituted"),
    substitute: snapshotPerson,
    approver: snapshotPerson,
    approved_at: z.string(),
  }),
  snapshotRequestBase.extend({
    status: z.enum(["open", "withdrawn"]),
    substitute: snapshotPerson.nullable(),
    approver: snapshotPerson.nullable(),
    approved_at: z.string().nullable(),
  }),
]);

export type SnapshotRequest = z.infer<typeof snapshotRequest>;

/**
 * One gedu the notifications concern: eligible now, or who has answered, or who
 * was sent a DM, or who is seated as the substitute — any of the four.
 */
const snapshotCandidate = z.object({
  gedu_id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  /** The gedu's app locale; null when they have never chosen one. */
  locale: z.string().nullable(),
  /**
   * The Discord account to DM, non-null only when that account ACTS as this
   * gedu — one linked to another gedu account more recently answers for that
   * account instead, and a DM to it would be answered as the wrong person.
   */
  discord_user_id: z.string().nullable(),
  /** Exactly the pool's four tests, asked now. */
  eligible: z.boolean(),
  /** The gedu's answer, or null when they have not answered. */
  response: substitutionOfferResponse.nullable(),
  /** The answer row's id — the id an admin approves, when it is an offer. */
  offer_id: z.string().nullable(),
  responded_at: z.string().nullable(),
});

export type SnapshotCandidate = z.infer<typeof snapshotCandidate>;

/** The `substitution_notifications` row: the request was announced. */
const snapshotNotification = z.object({
  request_id: z.string(),
  announced_at: z.string(),
  slack_channel_id: z.string().nullable(),
  slack_message_ts: z.string().nullable(),
  slack_rendered_hash: z.string().nullable(),
  updated_at: z.string(),
});

export type SnapshotNotification = z.infer<typeof snapshotNotification>;

/** A `substitution_notification_dms` row: one gedu's DM about this request. */
const snapshotDm = z.object({
  request_id: z.string(),
  gedu_id: z.string(),
  discord_user_id: z.string().nullable(),
  channel_id: z.string().nullable(),
  message_id: z.string().nullable(),
  rendered_hash: z.string().nullable(),
  delivery_error: z.string().nullable(),
  accepted_dm_claimed_at: z.string().nullable(),
  accepted_dm_message_id: z.string().nullable(),
  accepted_dm_sent_at: z.string().nullable(),
});

export type SnapshotDm = z.infer<typeof snapshotDm>;

export const substitutionNotificationSnapshot = z.object({
  request: snapshotRequest,
  /** The session's product, in the shell every substitution surface shares. */
  product: sessionProductDocument,
  required_qualifications: z.array(z.enum(Constants.public.Enums.gedu_qualification)),
  is_cancelled: z.boolean(),
  /** Today in the product's zone, `YYYY-MM-DD` — what tells a passed request apart. */
  product_today: z.string(),
  candidates: z.array(snapshotCandidate),
  /** Null until the request has been announced. */
  notification: snapshotNotification.nullable(),
  dms: z.array(snapshotDm),
});

export type SubstitutionNotificationSnapshot = z.infer<typeof substitutionNotificationSnapshot>;
