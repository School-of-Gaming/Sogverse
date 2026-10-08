import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * The admin testing page's Slack tool: plain text posted to a channel from
 * this environment's bot. Pinned here: the admin gate, that an empty or
 * oversized message and an empty channel are refused before Slack is called,
 * that an environment with no token says so instead of failing, that the post
 * goes as plain text with previews off, and that Slack's own refusal — carried
 * in an HTTP 200 body — reaches the admin.
 */

vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test-token");
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

const PERMALINK = "https://sog.slack.com/archives/C0123456789/p1700000000000100";

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

const validBody = { channel: "C0123456789", text: "Hello from Sogverse" };

beforeEach(() => {
  vi.clearAllMocks();
  // The refusal cases never reach Slack — reset so each case starts from its
  // own two answers.
  mockFetch.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test-token");
  signedInAs("admin");
  mockFetch
    .mockResolvedValueOnce(
      slackAnswer({ ok: true, channel: "C0123456789", ts: "1700000000.000100" }),
    )
    .mockResolvedValueOnce(
      slackAnswer({ ok: true, channel: "C0123456789", permalink: PERMALINK }),
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
    ["no channel", { text: validBody.text }],
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

  it("posts plain text with previews off and returns the permalink", async () => {
    const response = await POST(sendRequest(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ permalink: PERMALINK });

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

    const [permalinkUrl, permalinkInit] = mockFetch.mock.calls[1];
    const url = new URL(permalinkUrl);
    expect(url.origin + url.pathname).toBe("https://slack.com/api/chat.getPermalink");
    expect(url.searchParams.get("channel")).toBe("C0123456789");
    expect(url.searchParams.get("message_ts")).toBe("1700000000.000100");
    expect(permalinkInit.headers).toMatchObject({
      Authorization: "Bearer xoxb-test-token",
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

  it("hands back an answer that is not Slack's envelope as its HTTP status", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));

    const response = await POST(sendRequest(validBody));

    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("Slack refused: HTTP 502");
  });
});
