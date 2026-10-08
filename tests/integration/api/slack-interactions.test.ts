import { createHash, createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Slack app's one endpoint — the link slash command and the Accept button.
 *
 * A webhook: Slack's HMAC over the timestamp and the raw body is the whole
 * gate, so the properties worth pinning are that nothing happens for a
 * request that fails it (wrong signature, no signature, a stale timestamp),
 * that every answer is an empty 200 with the work deferred past Slack's three
 * seconds, and what each answer sends back through the `response_url`. The
 * signature is computed for real here, so the verifier is exercised rather
 * than mocked.
 */

const SIGNING_SECRET = "slack-signing-secret-for-tests";
vi.stubEnv("SLACK_SIGNING_SECRET", SIGNING_SECRET);
// The origin the link URL is built on. The test requests carry no Host, so it
// is the configured site URL that is used.
vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sogverse.sog.gg");
afterAll(() => vi.unstubAllEnvs());

const deferred: Promise<unknown>[] = [];
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (work: Promise<unknown>) => {
      deferred.push(work);
    },
  };
});

const mockInsert = vi.fn();
const mockFrom = vi.fn((_table: string) => ({ insert: mockInsert }));
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

const mockDrain = vi.fn();
vi.mock("@/lib/substitution-notifications/sync.server", () => ({
  drainSubstitutionNotifications: (...args: unknown[]) => mockDrain(...args),
}));

// The ephemeral answers go to Slack's response_url over the network.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { POST } from "@/app/api/slack/interactions/route";

const RESPONSE_URL = "https://hooks.slack.com/commands/T0123/456/abc";
const OFFER_ID = "6f1c2c1e-6d43-4c1a-9a5e-2f8f0d1b7a10";
const REQUEST_ID = "0b7e2a56-3c1d-4f7e-8a2b-9c4d5e6f7a81";

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function sign(body: string, timestamp: number, secret = SIGNING_SECRET): string {
  return `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
}

function slackRequest(
  body: string,
  {
    timestamp = nowSeconds(),
    signature,
  }: { timestamp?: number; signature?: string | null } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    "x-slack-request-timestamp": String(timestamp),
  };
  const signed = signature === undefined ? sign(body, timestamp) : signature;
  if (signed !== null) headers["x-slack-signature"] = signed;
  return new Request("http://localhost:3000/api/slack/interactions", {
    method: "POST",
    headers,
    body,
  });
}

function slashCommandBody(command = "/link-staging"): string {
  return new URLSearchParams({
    command,
    text: "",
    user_id: "U0123ABC",
    user_name: "kyle.sog",
    team_id: "T0123",
    response_url: RESPONSE_URL,
  }).toString();
}

function acceptBody(
  overrides: Record<string, unknown> = {},
  actionId = "sub_accept",
): string {
  return new URLSearchParams({
    payload: JSON.stringify({
      type: "block_actions",
      user: { id: "U0123ABC", username: "kyle.sog", team_id: "T0123" },
      team: { id: "T0123" },
      response_url: RESPONSE_URL,
      actions: [{ action_id: actionId, value: OFFER_ID, type: "button" }],
      some_new_field: { kept: true },
      ...overrides,
    }),
  }).toString();
}

/** POST one request, let its deferred work land, return what was answered and sent. */
async function run(request: Request) {
  const response = await POST(request);
  await Promise.all(deferred);
  const sent = mockFetch.mock.calls.map(([url, init]) => ({
    url: String(url),
    body: JSON.parse(String(init.body)),
  }));
  return { response, sent };
}

function buttonUrl(body: { blocks: unknown[] }): string {
  return JSON.stringify(body.blocks).match(/"url":"([^"]+)"/)?.[1] ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  deferred.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockFetch.mockResolvedValue(new Response("ok", { status: 200 }));
  mockInsert.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ data: { id: REQUEST_ID, status: "substituted" }, error: null });
  mockDrain.mockResolvedValue({ synced: 1, failed: 0, outOfTime: false });
});

describe("POST /api/slack/interactions — the signature", () => {
  it("refuses a request signed with another secret", async () => {
    const body = slashCommandBody();
    const { response } = await run(
      slackRequest(body, { signature: sign(body, nowSeconds(), "another-secret") }),
    );

    expect(response.status).toBe(401);
    expect(deferred).toHaveLength(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("refuses an unsigned request", async () => {
    const { response } = await run(slackRequest(slashCommandBody(), { signature: null }));

    expect(response.status).toBe(401);
    expect(deferred).toHaveLength(0);
  });

  it("refuses a body that is not the one signed", async () => {
    const timestamp = nowSeconds();
    const request = slackRequest(acceptBody({ actions: [] }), {
      timestamp,
      signature: sign(acceptBody(), timestamp),
    });

    const { response } = await run(request);

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses a correctly signed request whose timestamp is more than five minutes off", async () => {
    for (const timestamp of [nowSeconds() - 6 * 60, nowSeconds() + 6 * 60]) {
      const { response } = await run(slackRequest(slashCommandBody(), { timestamp }));
      expect(response.status).toBe(401);
    }
    expect(deferred).toHaveLength(0);
  });

  it("accepts a timestamp a little off", async () => {
    const { response } = await run(
      slackRequest(slashCommandBody(), { timestamp: nowSeconds() - 4 * 60 }),
    );

    expect(response.status).toBe(200);
  });

  it("refuses everything where the environment has no signing secret", async () => {
    vi.stubEnv("SLACK_SIGNING_SECRET", "");
    const { response } = await run(slackRequest(slashCommandBody()));
    vi.stubEnv("SLACK_SIGNING_SECRET", SIGNING_SECRET);

    expect(response.status).toBe(401);
  });
});

describe("POST /api/slack/interactions — the link command", () => {
  it("acknowledges with an empty 200 and answers later", async () => {
    const response = await POST(slackRequest(slashCommandBody()));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(deferred).toHaveLength(1);
    await Promise.all(deferred);
  });

  it("treats any command name as the link command", async () => {
    for (const command of ["/link", "/link-staging", "/anything"]) {
      mockFetch.mockClear();
      deferred.length = 0;
      const { sent } = await run(slackRequest(slashCommandBody(command)));
      expect(sent).toHaveLength(1);
      expect(buttonUrl(sent[0].body)).toContain("/link-slack?token=");
    }
  });

  it("stores only the hash of the token it sends, for the Slack user who ran it", async () => {
    const { sent } = await run(slackRequest(slashCommandBody()));

    const url = buttonUrl(sent[0].body);
    const match = /^https:\/\/sogverse\.sog\.gg\/link-slack\?token=([A-Za-z0-9_-]{43})$/.exec(url);
    expect(match).not.toBeNull();
    const token = match?.[1] ?? "";
    expect(mockFrom).toHaveBeenCalledWith("slack_link_tokens");
    expect(mockInsert).toHaveBeenCalledWith({
      token_hash: createHash("sha256").update(token).digest("hex"),
      slack_user_id: "U0123ABC",
      slack_team_id: "T0123",
      slack_username: "kyle.sog",
    });
  });

  it("answers the caller alone, through the response_url, with the link on a button", async () => {
    const { sent } = await run(slackRequest(slashCommandBody()));

    expect(sent[0].url).toBe(RESPONSE_URL);
    expect(sent[0].body).toMatchObject({ response_type: "ephemeral", replace_original: false });
    expect(sent[0].body.text).toContain("expires in 10 minutes");
    expect(sent[0].body.text).not.toContain("link-slack");
  });

  it("sends a short failure line, never the cause, when the token cannot be stored", async () => {
    mockInsert.mockResolvedValue({ error: { message: "secret database detail" } });

    const { sent } = await run(slackRequest(slashCommandBody()));

    expect(sent[0].body.text).toContain("couldn't create a link");
    expect(JSON.stringify(sent[0].body)).not.toContain("secret database detail");
    expect(JSON.stringify(sent[0].body)).not.toContain("link-slack");
  });

  it("never posts anywhere but Slack's own hooks host", async () => {
    const body = slashCommandBody().replace(
      encodeURIComponent(RESPONSE_URL),
      encodeURIComponent("https://evil.example/hook"),
    );

    const { sent } = await run(slackRequest(body));

    expect(sent).toHaveLength(0);
  });
});

describe("POST /api/slack/interactions — Accept", () => {
  it("acknowledges with an empty 200 and approves afterwards", async () => {
    const response = await POST(slackRequest(acceptBody()));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    // Handed to after() rather than awaited before answering.
    expect(deferred).toHaveLength(1);
    await Promise.all(deferred);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("approves as the linked admin, then syncs that one request's messages", async () => {
    const { sent } = await run(slackRequest(acceptBody()));

    expect(mockRpc).toHaveBeenCalledWith("approve_session_substitution_offer_for_slack_user", {
      p_slack_user_id: "U0123ABC",
      p_offer_id: OFFER_ID,
    });
    expect(mockDrain).toHaveBeenCalledWith({ requestIds: [REQUEST_ID] });
    // The channel's message is the answer; nothing ephemeral is sent.
    expect(sent).toHaveLength(0);
  });

  it("tells an unlinked presser to link first, with a fresh link, and changes nothing", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "P0034", message: "SLACK_ADMIN_NOT_LINKED" },
    });

    const { sent } = await run(slackRequest(acceptBody()));

    expect(mockDrain).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatchObject({ response_type: "ephemeral", replace_original: false });
    expect(sent[0].body.text).toContain("Nothing was accepted");
    expect(buttonUrl(sent[0].body)).toMatch(
      /^https:\/\/sogverse\.sog\.gg\/link-slack\?token=[A-Za-z0-9_-]{43}$/,
    );
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ slack_user_id: "U0123ABC", slack_team_id: "T0123" }),
    );
  });

  it.each([
    [{ code: "P0002", message: "Substitution offer not found" }, "taken their offer back"],
    [
      { code: "23514", message: "this substitution request is already substituted" },
      "already been settled",
    ],
    [
      { code: "23514", message: "gedu x no longer holds a seat on group y (z), so there is nothing to substitute for" },
      "no longer has this session",
    ],
    [
      { code: "23514", message: "gedu x can no longer substitute on group y on z" },
      "can no longer take this session",
    ],
    [{ code: "XX000", message: "boom" }, "Something went wrong"],
  ])("answers a refusal with its own line (%o)", async (error, line) => {
    mockRpc.mockResolvedValue({ data: null, error });

    const { sent } = await run(slackRequest(acceptBody()));

    expect(mockDrain).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0].body.response_type).toBe("ephemeral");
    expect(sent[0].body.text).toContain(line);
    expect(JSON.stringify(sent[0].body)).not.toContain(error.message);
  });

  it("tells the presser nothing when the sync after an approval fails", async () => {
    mockDrain.mockRejectedValue(new Error("claim failed"));

    const { sent } = await run(slackRequest(acceptBody()));

    expect(sent).toHaveLength(0);
  });

  it("answers a press on the preview's Accept as a preview, and touches nothing", async () => {
    const response = await POST(slackRequest(acceptBody({}, "subpreview_accept")));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(deferred).toHaveLength(1);
    await Promise.all(deferred);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockDrain).not.toHaveBeenCalled();
    const sent = mockFetch.mock.calls.map(([url, init]) => ({
      url: String(url),
      body: JSON.parse(String(init.body)),
    }));
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(RESPONSE_URL);
    expect(sent[0].body).toMatchObject({
      response_type: "ephemeral",
      replace_original: false,
      text: "This is a preview — nothing was approved.",
    });
  });

  it("answers any control on the preview prefix the same way, whatever its value", async () => {
    const { sent } = await run(
      slackRequest(
        acceptBody({ actions: [{ action_id: "subpreview_link", type: "button" }] }),
      ),
    );

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0].body.text).toContain("This is a preview");
  });

  it("acknowledges a preview press with no response_url and does nothing", async () => {
    const { response, sent } = await run(
      slackRequest(acceptBody({ response_url: undefined }, "subpreview_accept")),
    );

    expect(response.status).toBe(200);
    expect(deferred).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("acknowledges and ignores what it cannot place", async () => {
    for (const body of [
      acceptBody({}, "some_other_action"),
      acceptBody({ actions: [{ action_id: "sub_accept", value: "not-a-uuid" }] }),
      acceptBody({ type: "view_submission" }),
      acceptBody({ user: undefined }),
      new URLSearchParams({ payload: "{not json" }).toString(),
      "",
    ]) {
      const { response } = await run(slackRequest(body));
      expect(response.status).toBe(200);
    }
    expect(deferred).toHaveLength(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
