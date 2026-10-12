import {
  substitutionNotificationSnapshot,
  type SnapshotCandidate,
  type SnapshotDm,
  type SnapshotNotification,
  type SnapshotPerson,
  type SubstitutionNotificationSnapshot,
} from "@/lib/substitution-notifications/snapshot.contracts";

/**
 * Notification snapshots as `get_substitution_notification_snapshot` returns
 * them, for the state, message and sync tests. The default is an open request
 * for an in-person Helsinki club on Wednesday 14 October 2026, 16:00–17:30,
 * read on the 8th, with no candidates, never announced.
 */

export const SNAPSHOT_IDS = {
  request: "29a449b7-0543-4c74-a347-af7048349263",
  group: "4e316cb8-659d-4c4c-9713-669dfa3821c8",
  product: "028edff4-c36b-44a9-9c17-107bc6b34d60",
  requester: "b8b19ae3-e997-4473-9bdf-1a14c5cc8883",
  admin: "7932a2e7-e893-41c6-8b52-6518d26be8d5",
  aino: "7d0b5d18-f9cc-4f26-aa78-337b5a7e5cd9",
  eero: "c4a6de7d-5879-4cbb-ba4d-35a3ac08ec27",
  lumi: "b9c19179-cee4-4f70-a1f0-5d9b20cf6bc8",
  offerAino: "29bfafdc-3106-4edf-bceb-b76da762156d",
  offerEero: "d2ed0cbb-84d0-4848-9ec3-4b2e13d2f434",
} as const;

export function snapshotPerson(
  id: string,
  firstName: string,
  lastName = "Virtanen",
): SnapshotPerson {
  return { id, first_name: firstName, last_name: lastName };
}

export function snapshotCandidate(
  overrides: Partial<SnapshotCandidate> & Pick<SnapshotCandidate, "gedu_id">,
): SnapshotCandidate {
  return {
    first_name: "Gedu",
    last_name: "Example",
    locale: null,
    phone: null,
    discord_user_id: null,
    eligible: true,
    response: null,
    offer_id: null,
    responded_at: null,
    ...overrides,
  };
}

export function snapshotDm(
  overrides: Partial<SnapshotDm> & Pick<SnapshotDm, "gedu_id">,
): SnapshotDm {
  return {
    request_id: SNAPSHOT_IDS.request,
    discord_user_id: null,
    channel_id: null,
    message_id: null,
    rendered_hash: null,
    delivery_error: null,
    accepted_dm_claimed_at: null,
    accepted_dm_message_id: null,
    accepted_dm_sent_at: null,
    ...overrides,
  };
}

export function snapshotNotification(
  overrides: Partial<SnapshotNotification> = {},
): SnapshotNotification {
  return {
    request_id: SNAPSHOT_IDS.request,
    announced_at: "2026-10-08T08:00:00.000Z",
    slack_channel_id: null,
    slack_message_ts: null,
    slack_rendered_hash: null,
    requester_dm_claimed_at: null,
    requester_dm_message_id: null,
    requester_dm_sent_at: null,
    requester_dm_error: null,
    updated_at: "2026-10-08T08:00:00.000Z",
    ...overrides,
  };
}

type SnapshotOverrides = Omit<Partial<SubstitutionNotificationSnapshot>, "request"> & {
  request?: Partial<SubstitutionNotificationSnapshot["request"]>;
};

export function notificationSnapshot(
  overrides: SnapshotOverrides = {},
): SubstitutionNotificationSnapshot {
  const { request: requestOverrides, ...rest } = overrides;
  const request = {
    id: SNAPSHOT_IDS.request,
    status: "open",
    group_id: SNAPSHOT_IDS.group,
    group_name: "A",
    session_date: "2026-10-14",
    role: "primary",
    fee_cents: 4500,
    reason: "sick",
    reason_note: null,
    created_at: "2026-10-08T07:00:00.000Z",
    requester: { ...snapshotPerson(SNAPSHOT_IDS.requester, "Ville"), locale: null, discord_user_id: null },
    substitute: null,
    approver: null,
    approved_at: null,
    ...requestOverrides,
  };

  // Through the contract, so a fixture the real read could never return
  // fails here rather than passing a test.
  return substitutionNotificationSnapshot.parse({
    request,
    product: {
      id: SNAPSHOT_IDS.product,
      product_type: "consumer_club",
      tag: null,
      topic: "minecraft_java",
      spoken_language_code: "fi",
      timezone: "Europe/Helsinki",
      is_remote: false,
      start_date: "2026-08-10",
      end_date: "2026-12-16",
      site_name: "Kallio School",
      translations: [
        { locale: "en", name: "Minecraft Club", description: "" },
        { locale: "fi", name: "Minecraft-klubi", description: "" },
      ],
      // Wednesday — Monday is 0.
      schedule_slots: [{ weekday: 2, start_time: "16:00:00", duration_minutes: 90 }],
    },
    required_qualifications: [],
    is_cancelled: false,
    product_today: "2026-10-08",
    candidates: [],
    notification: null,
    dms: [],
    ...rest,
  });
}

/** The request as filled: Aino seated, approved by the admin. */
export function filledRequest(): SnapshotOverrides["request"] {
  return {
    status: "substituted",
    substitute: snapshotPerson(SNAPSHOT_IDS.aino, "Aino", "Korhonen"),
    approver: snapshotPerson(SNAPSHOT_IDS.admin, "Admin", "Person"),
    approved_at: "2026-10-09T09:00:00.000Z",
  };
}
