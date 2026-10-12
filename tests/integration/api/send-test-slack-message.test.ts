import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * The admin testing page's Slack tool: a post to a channel from this
 * environment's bot — plain text, or the substitution preview set. Pinned
 * here: the admin gate, that an empty or oversized message and an empty
 * channel are refused before Slack is called, that an environment with no
 * token says so instead of failing, that the text goes as plain text with
 * previews off, that the preview is every state in order with every control
 * on the preview prefix and survives a rate limit, and that Slack's own
 * refusal — carried in an HTTP 200 body — reaches the admin.
 */

vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test-token");
// The origin the preview's link replies are built on.
vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sogverse.sog.gg");
afterAll(() => {
  vi.unstubAllEnvs();
});

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { POST } from "@/app/api/admin/send-test-slack-message/route";

function signedInAs(role: string) {
  if (role !== "admin") {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    return;
  }
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {},
  });
}

function sendRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/admin/send-test-slack-message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function slackAnswer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const validBody = { template: "text", channel: "C0123456789", text: "Hello from Sogverse" };

beforeEach(() => {
  vi.clearAllMocks();
  // The refusal cases never reach Slack — reset so each case starts from its
  // own answer.
  mockFetch.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test-token");
  signedInAs("admin");
  mockFetch.mockResolvedValueOnce(
    slackAnswer({ ok: true, channel: "C0123456789", ts: "1700000000.000100" }),
  );
});

describe("POST /api/admin/send-test-slack-message", () => {
  it.each(["customer", "gamer", "gedu"])(
    "refuses a %s without calling Slack",
    async (role) => {
      signedInAs(role);

      const response = await POST(sendRequest(validBody));

      expect(response.status).toBe(403);
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["an empty message", { ...validBody, text: "   " }],
    ["a message over 4000 characters", { ...validBody, text: "x".repeat(4001) }],
    ["an empty channel", { ...validBody, channel: " " }],
    ["no channel", { template: "text", text: validBody.text }],
    ["no template", { channel: validBody.channel, text: validBody.text }],
    ["an unknown template", { ...validBody, template: "carousel" }],
  ])("refuses %s before calling Slack", async (_label, body) => {
    const response = await POST(sendRequest(body));

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("says Slack is not configured when the token is unset", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", "");

    const response = await POST(sendRequest(validBody));

    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("SLACK_BOT_TOKEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("posts plain text with previews off", async () => {
    const response = await POST(sendRequest(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [postUrl, postInit] = mockFetch.mock.calls[0];
    expect(postUrl).toBe("https://slack.com/api/chat.postMessage");
    expect(postInit.method).toBe("POST");
    expect(postInit.headers).toMatchObject({ Authorization: "Bearer xoxb-test-token" });
    expect(JSON.parse(postInit.body)).toEqual({
      channel: "C0123456789",
      text: "Hello from Sogverse",
      unfurl_links: false,
      unfurl_media: false,
    });
  });

  it("hands Slack's own refusal back to the admin, though Slack answered 200", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(slackAnswer({ ok: false, error: "channel_not_found" }));

    const response = await POST(sendRequest(validBody));

    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("Slack refused: channel_not_found");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  describe("the substitution preview", () => {
    const previewBody = { template: "subFlow", channel: "C0123456789" };

    /** Slack takes every post. */
    function slackAcceptsEverything() {
      mockFetch.mockReset();
      let sent = 0;
      mockFetch.mockImplementation(async () =>
        slackAnswer({ ok: true, channel: "C0123456789", ts: `1700000000.${(sent += 1)}` }),
      );
    }

    /** The bodies posted to chat.postMessage, in order. */
    function posted(): { channel: string; text: string; blocks: Record<string, unknown>[] }[] {
      return mockFetch.mock.calls
        .filter(([url]) => String(url) === "https://slack.com/api/chat.postMessage")
        .map(([, init]) => JSON.parse(init.body));
    }

    it("posts every state of a request, then the three replies, to the chosen channel, in order", async () => {
      slackAcceptsEverything();

      const response = await POST(sendRequest(previewBody));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      const messages = posted();
      expect(messages).toHaveLength(9);
      for (const message of messages) {
        expect(message.channel).toBe("C0123456789");
        expect(message.blocks.length).toBeGreaterThan(0);
      }
      expect(messages.map((message) => message.text.split(":")[0])).toEqual([
        "Substitute needed",
        "Substitute needed",
        "Substitute found",
        "Substitute request withdrawn",
        "Session cancelled",
        "Session passed with no substitute",
        "[Preview of an ephemeral reply",
        "[Preview of an ephemeral reply",
        "[Preview of an ephemeral reply",
      ]);
    });

    it("draws the offers as cards, the gedus as a table, and puts every control on the preview prefix", async () => {
      slackAcceptsEverything();

      await POST(sendRequest(previewBody));

      const body = JSON.stringify(posted());
      expect(body).toContain('"type":"carousel"');
      expect(body).toContain('"type":"data_table"');
      const actionIds = body.match(/"action_id":"[^"]+"/g) ?? [];
      expect(actionIds.length).toBeGreaterThan(0);
      for (const id of actionIds) expect(id).toMatch(/^"action_id":"subpreview/);
      // The link replies point at a token no row holds.
      expect(body).toContain("/link-slack?token=preview");
    });

    it("waits out Slack's rate limit and carries on, so the set arrives whole", async () => {
      slackAcceptsEverything();
      const accept = mockFetch.getMockImplementation();
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error: "ratelimited" }), {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "0" },
        }),
      );
      if (accept) mockFetch.mockImplementation(accept);

      const response = await POST(sendRequest(previewBody));

      expect(response.status).toBe(200);
      const messages = posted();
      expect(messages).toHaveLength(10);
      // The limited message is sent again.
      expect(messages[0]).toEqual(messages[1]);
    });

    it("hands Slack's refusal back and stops the set", async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(slackAnswer({ ok: false, error: "invalid_blocks" }));

      const response = await POST(sendRequest(previewBody));

      expect(response.status).toBe(502);
      expect((await response.json()).error).toBe("Slack refused: invalid_blocks");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("refuses an empty channel before calling Slack", async () => {
      const response = await POST(sendRequest({ ...previewBody, channel: "" }));

      expect(response.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  it("hands back an answer that is not Slack's envelope as its HTTP status", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));

    const response = await POST(sendRequest(validBody));

    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("Slack refused: HTTP 502");
  });
});
