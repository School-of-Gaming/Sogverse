import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * The admin testing page's Discord tool: a plain-text DM from this
 * environment's bot to a linked account. Pinned here: the admin gate, that the
 * Discord id comes from the profile's link on the server (never the client),
 * that an unlinked profile and an empty or oversized message are refused
 * before Discord is called, and that Discord's own refusal reaches the admin.
 */

vi.stubEnv("DISCORD_BOT_TOKEN", "test-bot-token");
afterAll(() => {
  vi.unstubAllEnvs();
});

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { POST } from "@/app/api/admin/send-test-discord-message/route";

const PROFILE_ID = "6f1c2c1e-6d43-4c1a-9a5e-2f8f0d1b7a10";
const DISCORD_USER_ID = "123456789012345678";

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn((_column: string, _value: string) => ({
  maybeSingle: mockMaybeSingle,
}));
const mockFrom = vi.fn((_table: string) => ({
  select: () => ({ eq: mockEq }),
}));

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
    supabase: { from: mockFrom },
  });
}

function sendRequest(body: unknown): Request {
  return new Request(
    "http://localhost:3000/api/admin/send-test-discord-message",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function discordAnswer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const validBody = { profileId: PROFILE_ID, content: "Hello from Sogverse" };

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks leaves queued once-answers in place, and the refusal cases
  // never reach Discord — reset so each case starts from its own two answers.
  mockFetch.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  signedInAs("admin");
  mockMaybeSingle.mockResolvedValue({
    data: { discord_user_id: DISCORD_USER_ID },
    error: null,
  });
  mockFetch
    .mockResolvedValueOnce(discordAnswer(200, { id: "dm-channel-1" }))
    .mockResolvedValueOnce(discordAnswer(200, { id: "message-1" }));
});

describe("POST /api/admin/send-test-discord-message", () => {
  it.each(["customer", "gamer", "gedu"])(
    "refuses a %s without calling Discord",
    async (role) => {
      signedInAs(role);

      const response = await POST(sendRequest(validBody));

      expect(response.status).toBe(403);
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it("refuses a profile with no linked Discord account", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(sendRequest(validBody));

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", "   "],
    ["over 2000 characters", "x".repeat(2001)],
  ])("refuses %s content", async (_label, content) => {
    const response = await POST(sendRequest({ ...validBody, content }));

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("DMs the profile's linked Discord user and returns the jump URL", async () => {
    const response = await POST(sendRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      jumpUrl: "https://discord.com/channels/@me/dm-channel-1/message-1",
    });

    expect(mockFrom).toHaveBeenCalledWith("discord_links");
    expect(mockEq).toHaveBeenCalledWith("profile_id", PROFILE_ID);

    const [channelUrl, channelInit] = mockFetch.mock.calls[0];
    expect(channelUrl).toBe("https://discord.com/api/v10/users/@me/channels");
    expect(JSON.parse(channelInit.body)).toEqual({
      recipient_id: DISCORD_USER_ID,
    });
    expect(channelInit.headers).toMatchObject({
      Authorization: "Bot test-bot-token",
      "User-Agent": expect.stringMatching(/^DiscordBot /),
    });

    const [messageUrl, messageInit] = mockFetch.mock.calls[1];
    expect(messageUrl).toBe(
      "https://discord.com/api/v10/channels/dm-channel-1/messages",
    );
    expect(JSON.parse(messageInit.body)).toEqual({
      content: "Hello from Sogverse",
    });
  });

  it("hands Discord's own refusal back to the admin", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(discordAnswer(200, { id: "dm-channel-1" }));
    mockFetch.mockResolvedValueOnce(
      discordAnswer(403, {
        message: "Cannot send messages to this user",
        code: 50007,
      }),
    );

    const response = await POST(sendRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toContain("Cannot send messages to this user");
    expect(data.error).toContain("50007");
  });
});
