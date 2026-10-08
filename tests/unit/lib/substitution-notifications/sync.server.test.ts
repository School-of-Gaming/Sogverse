import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SnapshotDm,
  SnapshotNotification,
  SubstitutionNotificationSnapshot,
} from "@/lib/substitution-notifications/snapshot.contracts";
import {
  SNAPSHOT_IDS,
  filledRequest,
  notificationSnapshot,
  snapshotCandidate,
} from "../../../mocks/substitution-notifications";

/**
 * The notification sync against an in-memory outbox and message tables, with
 * Discord and Slack mocked: a request is announced once and only when found
 * open, DMs are sent once and edited only when their rendering moves, a
 * refusal Discord will repeat is recorded and never retried while any other
 * failure fails the job, the accepted DM goes once and hands its claim back
 * on a failure worth retrying, and Slack is posted once and edited on change.
 */

const discord = vi.hoisted(() => ({
  configured: true,
  openDiscordDmChannel: vi.fn<(userId: string) => Promise<string>>(),
  sendDiscordChannelMessage: vi.fn<(channelId: string, body: unknown) => Promise<string>>(),
  editDiscordMessage: vi.fn<(channelId: string, messageId: string, body: unknown) => Promise<void>>(),
}));

const slack = vi.hoisted(() => ({
  configured: true,
  postSlackBlocks: vi.fn<(channel: string, message: unknown) => Promise<{ channel: string; ts: string }>>(),
  updateSlackMessage: vi.fn<(channel: string, ts: string, message: unknown) => Promise<void>>(),
}));

vi.mock("@/lib/discord-api.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/discord-api.server")>();
  return {
    ...actual,
    isDiscordBotConfigured: () => discord.configured,
    openDiscordDmChannel: discord.openDiscordDmChannel,
    sendDiscordChannelMessage: discord.sendDiscordChannelMessage,
    editDiscordMessage: discord.editDiscordMessage,
  };
});

vi.mock("@/lib/slack-api.server", () => ({
  isSlackSubstitutionsConfigured: () => slack.configured,
  slackSubstitutionsChannelId: () => "C0SUBS",
  postSlackBlocks: slack.postSlackBlocks,
  updateSlackMessage: slack.updateSlackMessage,
}));

// ---------------------------------------------------------------- the fake database

interface OutboxRow {
  seq: number;
  leased: boolean;
  due: boolean;
  lastError: string | null;
}

const db: {
  /** The request's own half of the snapshot; null when it was deleted. */
  base: SubstitutionNotificationSnapshot | null;
  notification: SnapshotNotification | null;
  dms: Map<string, SnapshotDm>;
  outbox: Map<string, OutboxRow>;
} = { base: null, notification: null, dms: new Map(), outbox: new Map() };

function enqueue(requestId: string = SNAPSHOT_IDS.request) {
  const row = db.outbox.get(requestId);
  if (row) {
    row.seq += 1;
    row.due = true;
  } else {
    db.outbox.set(requestId, { seq: 1, leased: false, due: true, lastError: null });
  }
}

const EMPTY_DM: Omit<SnapshotDm, "gedu_id"> = {
  request_id: SNAPSHOT_IDS.request,
  discord_user_id: null,
  channel_id: null,
  message_id: null,
  rendered_hash: null,
  delivery_error: null,
  accepted_dm_claimed_at: null,
  accepted_dm_message_id: null,
  accepted_dm_sent_at: null,
};

/** What the sync writes: a slice of either table's row. */
type Patch = Partial<SnapshotDm> & Partial<SnapshotNotification>;

/** A thenable query over the two message tables, enough for the sync's calls. */
class Query {
  private filters: [column: keyof SnapshotDm, value: string | null][] = [];
  private isSingle = false;

  constructor(
    private readonly table: string,
    private readonly op: "insert" | "upsert" | "update",
    private readonly payload: Patch,
    private readonly options: { ignoreDuplicates?: boolean } = {},
  ) {}

  select() {
    return this;
  }
  single() {
    this.isSingle = true;
    return this;
  }
  eq(column: keyof SnapshotDm, value: string | null) {
    this.filters.push([column, value]);
    return this;
  }
  is(column: keyof SnapshotDm, value: null) {
    return this.eq(column, value);
  }

  then<T>(resolve: (value: { data: unknown; error: null }) => T) {
    const rows = this.table === "substitution_notifications" ? this.notifications() : this.dms();
    return Promise.resolve(resolve({ data: this.isSingle ? (rows[0] ?? null) : rows, error: null }));
  }

  private notifications(): SnapshotNotification[] {
    const { payload } = this;
    if (this.op === "insert") {
      db.notification = {
        request_id: payload.request_id ?? SNAPSHOT_IDS.request,
        announced_at: payload.announced_at ?? "2026-10-08T08:00:00.000Z",
        slack_channel_id: null,
        slack_message_ts: null,
        slack_rendered_hash: null,
        updated_at: "2026-10-08T08:00:00.000Z",
      };
      return [db.notification];
    }
    if (db.notification === null) return [];
    db.notification = {
      ...db.notification,
      slack_channel_id: payload.slack_channel_id ?? db.notification.slack_channel_id,
      slack_message_ts: payload.slack_message_ts ?? db.notification.slack_message_ts,
      slack_rendered_hash: payload.slack_rendered_hash ?? db.notification.slack_rendered_hash,
    };
    return [db.notification];
  }

  private dms(): SnapshotDm[] {
    if (this.op === "upsert") {
      const geduId = this.payload.gedu_id ?? "";
      const existing = db.dms.get(geduId);
      if (existing && this.options.ignoreDuplicates) return [];
      const row: SnapshotDm = { ...EMPTY_DM, gedu_id: geduId, ...existing, ...this.payload };
      db.dms.set(geduId, row);
      return [row];
    }
    const matched = [...db.dms.values()].filter((row) =>
      this.filters.every(([column, value]) => row[column] === value),
    );
    return matched.map((row) => {
      const next: SnapshotDm = { ...row, ...this.payload };
      db.dms.set(row.gedu_id, next);
      return next;
    });
  }
}

interface RpcArgs {
  p_request_id?: string;
  p_request_ids?: string[];
  p_seq?: number;
  p_error?: string;
}

const fakeClient = {
  rpc: async (name: string, args: RpcArgs) => {
    switch (name) {
      case "get_substitution_notification_snapshot":
        return {
          data:
            db.base === null
              ? null
              : { ...db.base, notification: db.notification, dms: [...db.dms.values()] },
          error: null,
        };
      case "claim_substitution_notification_jobs": {
        for (const [requestId, row] of db.outbox) {
          if (!row.due || row.leased) continue;
          if (args.p_request_ids !== undefined && !args.p_request_ids.includes(requestId)) continue;
          row.leased = true;
          return { data: [{ request_id: requestId, seq: row.seq }], error: null };
        }
        return { data: [], error: null };
      }
      case "finish_substitution_notification_job": {
        const requestId = args.p_request_id ?? "";
        const row = db.outbox.get(requestId);
        if (row === undefined) return { data: false, error: null };
        row.leased = false;
        if (args.p_error !== undefined) {
          row.due = false;
          row.lastError = args.p_error;
          return { data: false, error: null };
        }
        if (row.seq === args.p_seq) {
          db.outbox.delete(requestId);
          return { data: false, error: null };
        }
        return { data: true, error: null };
      }
      default:
        throw new Error(`unexpected rpc ${name}`);
    }
  },
  from: (table: string) => ({
    insert: (payload: Patch) => new Query(table, "insert", payload),
    upsert: (payload: Patch, options?: { ignoreDuplicates?: boolean }) =>
      new Query(table, "upsert", payload, options),
    update: (payload: Patch) => new Query(table, "update", payload),
  }),
};

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeClient }));

const { drainSubstitutionNotifications } = await import(
  "@/lib/substitution-notifications/sync.server"
);
const { DiscordApiError } = await import("@/lib/discord-api.server");

// ---------------------------------------------------------------- fixtures

const aino = (overrides: Parameters<typeof snapshotCandidate>[0] | object = {}) =>
  snapshotCandidate({
    gedu_id: SNAPSHOT_IDS.aino,
    first_name: "Aino",
    last_name: "Korhonen",
    discord_user_id: "111",
    ...overrides,
  });

function setRequest(overrides: Parameters<typeof notificationSnapshot>[0] = {}) {
  db.base = notificationSnapshot({ candidates: [aino()], ...overrides });
}

async function drain() {
  enqueue();
  return drainSubstitutionNotifications({ budgetMs: 5_000 });
}

let messageCounter = 0;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sogverse.sog.gg");
  // The drain logs each failed job; the cases that fail one assert on the outbox.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.base = null;
  db.notification = null;
  db.dms.clear();
  db.outbox.clear();
  discord.configured = true;
  slack.configured = true;
  messageCounter = 0;
  discord.openDiscordDmChannel.mockReset().mockImplementation(async (userId) => `dm-${userId}`);
  discord.sendDiscordChannelMessage.mockReset().mockImplementation(async () => `msg-${++messageCounter}`);
  discord.editDiscordMessage.mockReset().mockResolvedValue(undefined);
  slack.postSlackBlocks.mockReset().mockResolvedValue({ channel: "C0SUBS", ts: "1700000000.0001" });
  slack.updateSlackMessage.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- the cases

describe("drainSubstitutionNotifications", () => {
  it("announces an open request once: the row, a DM to each reachable eligible gedu, one Slack post", async () => {
    setRequest();
    expect(await drain()).toMatchObject({ synced: 1, failed: 0, outOfTime: false });

    expect(db.notification).toMatchObject({ slack_channel_id: "C0SUBS", slack_message_ts: "1700000000.0001" });
    expect(discord.openDiscordDmChannel).toHaveBeenCalledWith("111");
    expect(discord.sendDiscordChannelMessage).toHaveBeenCalledTimes(1);
    expect(db.dms.get(SNAPSHOT_IDS.aino)).toMatchObject({
      discord_user_id: "111",
      channel_id: "dm-111",
      message_id: "msg-1",
    });
    expect(slack.postSlackBlocks).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(slack.postSlackBlocks.mock.calls[0]?.[1])).toContain("DM'd");
    expect(db.outbox.size).toBe(0);

    // Nothing changed: nothing is sent, edited or posted again.
    const announcedAt = db.notification?.announced_at;
    await drain();
    expect(db.notification?.announced_at).toBe(announcedAt);
    expect(discord.sendDiscordChannelMessage).toHaveBeenCalledTimes(1);
    expect(discord.editDiscordMessage).not.toHaveBeenCalled();
    expect(slack.postSlackBlocks).toHaveBeenCalledTimes(1);
    expect(slack.updateSlackMessage).not.toHaveBeenCalled();
  });

  it("skips the gedus it cannot or should not DM", async () => {
    setRequest({
      candidates: [
        aino({ discord_user_id: null }),
        snapshotCandidate({ gedu_id: SNAPSHOT_IDS.eero, discord_user_id: "222", eligible: false }),
      ],
    });
    await drain();
    expect(discord.sendDiscordChannelMessage).not.toHaveBeenCalled();
    expect(slack.postSlackBlocks).toHaveBeenCalledTimes(1);
  });

  it("edits a DM and the Slack message when the rendering changes", async () => {
    setRequest();
    await drain();

    setRequest({ candidates: [aino({ response: "offer", offer_id: SNAPSHOT_IDS.offerAino, responded_at: "2026-10-08T09:00:00.000Z" })] });
    await drain();
    expect(discord.editDiscordMessage).toHaveBeenCalledTimes(1);
    expect(discord.editDiscordMessage.mock.calls[0]?.slice(0, 2)).toEqual(["dm-111", "msg-1"]);
    expect(JSON.stringify(discord.editDiscordMessage.mock.calls[0]?.[2])).toContain("You offered");
    expect(slack.updateSlackMessage).toHaveBeenCalledTimes(1);
    expect(slack.updateSlackMessage.mock.calls[0]?.slice(0, 2)).toEqual(["C0SUBS", "1700000000.0001"]);
    expect(JSON.stringify(slack.updateSlackMessage.mock.calls[0]?.[2])).toContain(SNAPSHOT_IDS.offerAino);
  });

  it("a request filed already substituted, and never open, stays silent", async () => {
    setRequest({ request: filledRequest() });
    expect(await drain()).toMatchObject({ synced: 1, failed: 0 });
    expect(db.notification).toBeNull();
    expect(discord.openDiscordDmChannel).not.toHaveBeenCalled();
    expect(slack.postSlackBlocks).not.toHaveBeenCalled();
    expect(db.dms.size).toBe(0);
  });

  it("a request cleared back to open is announced then", async () => {
    setRequest({ request: filledRequest() });
    await drain();
    setRequest();
    await drain();
    expect(db.notification).not.toBeNull();
    expect(discord.sendDiscordChannelMessage).toHaveBeenCalledTimes(1);
    expect(slack.postSlackBlocks).toHaveBeenCalledTimes(1);
  });

  it("a closed request's DMs lose their buttons, and get them back when it reopens", async () => {
    setRequest();
    await drain();

    setRequest({ request: { status: "withdrawn" } });
    await drain();
    const closed = JSON.stringify(discord.editDiscordMessage.mock.calls.at(-1)?.[2]);
    expect(closed).toContain("no longer needed");
    expect(closed).not.toContain("subreq:");

    setRequest();
    await drain();
    expect(JSON.stringify(discord.editDiscordMessage.mock.calls.at(-1)?.[2])).toContain(
      `subreq:o:${SNAPSHOT_IDS.request}`,
    );
    expect(discord.sendDiscordChannelMessage).toHaveBeenCalledTimes(1);
  });

  it("a DM Discord refuses for good is recorded and never retried; the job succeeds", async () => {
    setRequest();
    discord.sendDiscordChannelMessage.mockRejectedValueOnce(
      new DiscordApiError(403, 50007, "Cannot send messages to this user"),
    );
    expect(await drain()).toMatchObject({ synced: 1, failed: 0 });
    expect(db.dms.get(SNAPSHOT_IDS.aino)).toMatchObject({
      discord_user_id: "111",
      message_id: null,
      delivery_error: expect.stringContaining("50007"),
    });
    expect(JSON.stringify(slack.postSlackBlocks.mock.calls[0]?.[1])).toContain("DM failed");

    await drain();
    expect(discord.sendDiscordChannelMessage).toHaveBeenCalledTimes(1);
  });

  it("any other DM failure still lets Slack post, then fails the job for a retry", async () => {
    setRequest();
    discord.sendDiscordChannelMessage.mockRejectedValueOnce(new DiscordApiError(500, null, "Internal"));
    expect(await drain()).toMatchObject({ synced: 0, failed: 1 });
    expect(db.dms.size).toBe(0);
    expect(slack.postSlackBlocks).toHaveBeenCalledTimes(1);
    expect(db.outbox.get(SNAPSHOT_IDS.request)).toMatchObject({ due: false, lastError: expect.stringContaining("Internal") });

    // The retry sends it.
    await drain();
    expect(discord.sendDiscordChannelMessage).toHaveBeenCalledTimes(2);
    expect(db.dms.get(SNAPSHOT_IDS.aino)?.message_id).toBe("msg-1");
  });

  it("a change while the sync runs makes the same drain run it again", async () => {
    setRequest();
    discord.sendDiscordChannelMessage.mockImplementationOnce(async () => {
      enqueue();
      return "msg-1";
    });
    expect(await drain()).toMatchObject({ synced: 2, failed: 0 });
    expect(db.outbox.size).toBe(0);
  });

  it("narrowed to some requests, it claims only those", async () => {
    setRequest();
    enqueue();
    const result = await drainSubstitutionNotifications({ requestIds: [SNAPSHOT_IDS.eero], budgetMs: 5_000 });
    expect(result.synced).toBe(0);
    expect(db.outbox.size).toBe(1);
  });

  describe("the accepted DM", () => {
    async function announceThenFill() {
      setRequest();
      await drain();
      setRequest({ request: filledRequest(), candidates: [aino({ response: "offer", offer_id: SNAPSHOT_IDS.offerAino })] });
    }

    it("goes once to the gedu seated on an announced request", async () => {
      await announceThenFill();
      await drain();
      expect(discord.sendDiscordChannelMessage).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(discord.sendDiscordChannelMessage.mock.calls[1]?.[1])).toContain("You’ve been accepted");
      expect(db.dms.get(SNAPSHOT_IDS.aino)).toMatchObject({
        accepted_dm_message_id: "msg-2",
        accepted_dm_sent_at: expect.any(String),
        accepted_dm_claimed_at: expect.any(String),
      });

      await drain();
      expect(discord.sendDiscordChannelMessage).toHaveBeenCalledTimes(2);
    });

    it("goes to a seated gedu who was never sent the offer DM", async () => {
      setRequest({ candidates: [] });
      await drain();
      setRequest({ request: filledRequest(), candidates: [aino({ eligible: false })] });
      await drain();
      expect(discord.sendDiscordChannelMessage).toHaveBeenCalledTimes(1);
      expect(db.dms.get(SNAPSHOT_IDS.aino)).toMatchObject({ message_id: null, accepted_dm_message_id: "msg-1" });
    });

    it("hands its claim back on a failure worth retrying, and the retry sends it", async () => {
      await announceThenFill();
      discord.sendDiscordChannelMessage.mockRejectedValueOnce(new DiscordApiError(502, null, "Bad gateway"));
      expect(await drain()).toMatchObject({ failed: 1 });
      expect(db.dms.get(SNAPSHOT_IDS.aino)).toMatchObject({
        accepted_dm_claimed_at: null,
        accepted_dm_sent_at: null,
      });

      await drain();
      expect(db.dms.get(SNAPSHOT_IDS.aino)?.accepted_dm_sent_at).toEqual(expect.any(String));
    });

    it("is not sent for a request never announced", async () => {
      setRequest({ request: filledRequest() });
      await drain();
      expect(discord.sendDiscordChannelMessage).not.toHaveBeenCalled();
    });

    it("is not sent once the session has passed", async () => {
      await announceThenFill();
      setRequest({ request: filledRequest(), product_today: "2026-10-20" });
      await drain();
      expect(discord.sendDiscordChannelMessage).toHaveBeenCalledTimes(1);
    });
  });

  it("skips Discord and Slack where this environment is not set up for them", async () => {
    discord.configured = false;
    slack.configured = false;
    setRequest();
    expect(await drain()).toMatchObject({ synced: 1, failed: 0 });
    expect(db.notification).not.toBeNull();
    expect(discord.openDiscordDmChannel).not.toHaveBeenCalled();
    expect(slack.postSlackBlocks).not.toHaveBeenCalled();
  });

  it("a deleted request syncs to nothing", async () => {
    db.base = null;
    expect(await drain()).toMatchObject({ synced: 1, failed: 0 });
  });
});
