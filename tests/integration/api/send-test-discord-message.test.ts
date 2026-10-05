import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * The admin testing page's Discord tool: a DM from this environment's bot to
 * a linked account — plain text, or the `/sub` preview. Pinned here: the admin
 * gate, that the Discord id comes from the profile's link on the server (never
 * the client), that an unlinked profile and an empty or oversized message are
 * refused before Discord is called, that Discord's own refusal reaches the
 * admin, and that the preview is the command's first step, in the recipient's
 * locale, with every control on the preview prefix.
 */

vi.stubEnv("DISCORD_BOT_TOKEN", "test-bot-token");
// The origin the /sub preview's web link is built on.
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

const validBody = {
  template: "text",
  profileId: PROFILE_ID,
  content: "Hello from Sogverse",
};

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

  // -- The /sub preview --

  /** The message body the second Discord call posted. */
  function postedMessage() {
    const [, init] = mockFetch.mock.calls[1];
    return JSON.parse(init.body);
  }

  function customIds(components: unknown): string[] {
    if (!Array.isArray(components)) return [];
    return components.flatMap((component: Record<string, unknown>) => [
      ...(typeof component.custom_id === "string" ? [component.custom_id] : []),
      ...customIds(component.components),
    ]);
  }

  it("DMs the /sub first step in the chosen locale, every control on the preview prefix", async () => {
    const response = await POST(
      sendRequest({ template: "subSessions", profileId: PROFILE_ID, locale: "fi" }),
    );

    expect(response.status).toBe(200);
    expect(mockFrom).not.toHaveBeenCalledWith("profiles");

    const message = postedMessage();
    expect(message.flags).toBe(1 << 15);
    expect(message.content).toBeUndefined();
    const body = JSON.stringify(message);
    expect(body).toContain("Mille kerralle et pääse?");
    const ids = customIds(message.components);
    expect(ids.length).toBeGreaterThan(1);
    expect(ids.every((id) => id.startsWith("subpreview:"))).toBe(true);
  });

  /** The thumbnails in a posted message — the header's logo, when it has one. */
  function thumbnails(components: unknown): unknown[] {
    if (!Array.isArray(components)) return [];
    return components.flatMap((component: Record<string, unknown>) => [
      ...(component.type === 11 ? [component] : []),
      ...thumbnails(component.components),
      ...thumbnails(component.accessory === undefined ? [] : [component.accessory]),
    ]);
  }

  it("heads the preview with the favicon from this environment's own site", async () => {
    await POST(sendRequest({ template: "subSessions", profileId: PROFILE_ID, locale: "en" }));

    expect(thumbnails(postedMessage().components)).toEqual([
      { type: 11, media: { url: "https://sogverse.sog.gg/apple-icon.png" } },
    ]);
  });

  it("sends the preview with no logo from a dev machine, which Discord cannot fetch from", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3007");
    try {
      const response = await POST(
        sendRequest({
          template: "subSessions",
          profileId: PROFILE_ID,
          locale: "en",
        }),
      );

      expect(response.status).toBe(200);
      const message = postedMessage();
      expect(thumbnails(message.components)).toEqual([]);
      expect(JSON.stringify(message)).toContain("School of Gaming · Substitutions");
    } finally {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sogverse.sog.gg");
    }
  });

  it("renders the preview in the chosen locale", async () => {
    const response = await POST(
      sendRequest({ template: "subSessions", profileId: PROFILE_ID, locale: "sv" }),
    );

    expect(response.status).toBe(200);
    const body = JSON.stringify(postedMessage());
    expect(body).toContain("Vilket tillfälle kan du inte vara med på?");
  });

  it("refuses a locale the app does not support, before calling Discord", async () => {
    const response = await POST(
      sendRequest({ template: "subSessions", profileId: PROFILE_ID, locale: "de" }),
    );

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses a preview that names no locale, before calling Discord", async () => {
    const response = await POST(
      sendRequest({ template: "subSessions", profileId: PROFILE_ID }),
    );

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses a body that names an unknown template, before calling Discord", async () => {
    for (const template of [undefined, "everything"]) {
      const response = await POST(
        sendRequest({ template, profileId: PROFILE_ID, locale: "en" }),
      );

      expect(response.status).toBe(400);
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses a not-linked preview that names no locale, before calling Discord", async () => {
    const response = await POST(
      sendRequest({ template: "subNotLinked", profileId: PROFILE_ID }),
    );

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("DMs the not-linked answer, in the chosen locale, over a link that links nothing", async () => {
    const response = await POST(
      sendRequest({
        template: "subNotLinked",
        profileId: PROFILE_ID,
        locale: "sv",
      }),
    );

    expect(response.status).toBe(200);
    const message = postedMessage();
    expect(message.flags).toBe(1 << 2);
    expect(message.components).toBeUndefined();
    expect(message.content).toContain("För att använda /sub");
    expect(message.content).toContain("https://sogverse.sog.gg/link-discord?token=preview");
    expect(message.content).toContain("The link expires in 10 minutes and works once.");
  });

  it("refuses a body that names no template", async () => {
    const response = await POST(
      sendRequest({ profileId: PROFILE_ID, content: "Hello from Sogverse" }),
    );

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
