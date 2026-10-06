import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * The admin testing page's Discord tool: a DM from this environment's bot to
 * a linked account — plain text, or the `/sub` preview. Pinned here: the admin
 * gate, that the Discord id comes from the profile's link on the server (never
 * the client), that an unlinked profile and an empty or oversized message are
 * refused before Discord is called, that Discord's own refusal reaches the
 * admin, and that the preview is every message the command draws, in the
 * chosen locale, with every control on the preview prefix.
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

  /**
   * Discord accepting every request: the DM channel, then each message with an
   * id of its own. A queued answer — a rate limit — goes first.
   */
  function discordAcceptsEverything() {
    mockFetch.mockReset();
    let sent = 0;
    mockFetch.mockImplementation(async (url: string) =>
      url.endsWith("/users/@me/channels")
        ? discordAnswer(200, { id: "dm-channel-1" })
        : discordAnswer(200, { id: `message-${(sent += 1)}` }),
    );
  }

  /** The message bodies posted to the DM channel, in order. */
  function postedMessages(): Record<string, unknown>[] {
    return mockFetch.mock.calls
      .filter(([url]) => String(url).endsWith("/messages"))
      .map(([, init]) => JSON.parse(init.body));
  }

  function customIds(components: unknown): string[] {
    if (!Array.isArray(components)) return [];
    return components.flatMap((component: Record<string, unknown>) => [
      ...(typeof component.custom_id === "string" ? [component.custom_id] : []),
      ...customIds(component.components),
    ]);
  }

  /** The thumbnails in posted messages — the header's logo, when it has one. */
  function thumbnails(components: unknown): unknown[] {
    if (!Array.isArray(components)) return [];
    return components.flatMap((component: Record<string, unknown>) => [
      ...(component.type === 11 ? [component] : []),
      ...thumbnails(component.components),
      ...thumbnails(component.accessory === undefined ? [] : [component.accessory]),
    ]);
  }

  it("DMs every /sub message in the chosen locale, every control on the preview prefix", async () => {
    discordAcceptsEverything();

    const response = await POST(
      sendRequest({ template: "subFlow", profileId: PROFILE_ID, locale: "fi" }),
    );

    expect(response.status).toBe(200);
    // The jump link opens the first of the set.
    expect(await response.json()).toEqual({
      jumpUrl: "https://discord.com/channels/@me/dm-channel-1/message-1",
    });
    expect(mockFrom).not.toHaveBeenCalledWith("profiles");
    // One DM channel, opened once.
    expect(
      mockFetch.mock.calls.filter(([url]) => String(url).endsWith("/users/@me/channels")),
    ).toHaveLength(1);

    const [notLinked, ...steps] = postedMessages();
    expect(notLinked.content).toContain("Jotta voit käyttää /sub-komentoa");
    expect(notLinked.content).toContain("The link expires in 10 minutes and works once.");
    expect(JSON.stringify(notLinked.components)).toContain(
      "https://sogverse.sog.gg/link-discord?token=preview",
    );

    // The list, the filed line, a refusal, the empty list and the failure
    // notice; the request modal cannot be DMed.
    expect(steps).toHaveLength(5);
    for (const step of steps) {
      expect(step.flags).toBe(1 << 15);
      expect(step.content).toBeUndefined();
    }
    expect(JSON.stringify(steps[0])).toContain("Mille kerralle tarvitset tuuraajan?");
    const ids = steps.flatMap((step) => customIds(step.components));
    expect(ids).toEqual(["subpreview:s:fi", "subpreview:l"]);
  });

  it("heads every step with the favicon from this environment's own site", async () => {
    discordAcceptsEverything();

    await POST(sendRequest({ template: "subFlow", profileId: PROFILE_ID, locale: "en" }));

    const [, ...steps] = postedMessages();
    for (const step of steps) {
      expect(thumbnails(step.components)).toEqual([
        { type: 11, media: { url: "https://sogverse.sog.gg/apple-icon.png" } },
      ]);
    }
  });

  it("sends the steps with no logo from a dev machine, which Discord cannot fetch from", async () => {
    discordAcceptsEverything();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3007");
    try {
      const response = await POST(
        sendRequest({ template: "subFlow", profileId: PROFILE_ID, locale: "en" }),
      );

      expect(response.status).toBe(200);
      const [, ...steps] = postedMessages();
      expect(steps.flatMap((step) => thumbnails(step.components))).toEqual([]);
      expect(JSON.stringify(steps[0])).toContain("School of Gaming · Substitutions");
    } finally {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sogverse.sog.gg");
    }
  });

  it("renders the steps in the chosen locale", async () => {
    discordAcceptsEverything();

    const response = await POST(
      sendRequest({ template: "subFlow", profileId: PROFILE_ID, locale: "sv" }),
    );

    expect(response.status).toBe(200);
    const [notLinked, sessionList] = postedMessages();
    expect(notLinked.content).toContain("För att använda /sub");
    expect(JSON.stringify(sessionList)).toContain("Vilket tillfälle behöver du en vikarie för?");
  });

  it("waits out Discord's per-channel rate limit and carries on", async () => {
    discordAcceptsEverything();
    const accept = mockFetch.getMockImplementation();
    let limited = false;
    mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
      if (!limited && url.endsWith("/messages")) {
        limited = true;
        return discordAnswer(429, { message: "You are being rate limited.", retry_after: 0.01 });
      }
      return accept?.(url, init);
    });

    const response = await POST(
      sendRequest({ template: "subFlow", profileId: PROFILE_ID, locale: "en" }),
    );

    expect(response.status).toBe(200);
    // The limited message is sent again, so the set arrives whole.
    expect(postedMessages()[0]).toEqual(postedMessages()[1]);
  });

  it("hands back a rate limit longer than it will wait", async () => {
    mockFetch.mockReset();
    mockFetch
      .mockResolvedValueOnce(discordAnswer(200, { id: "dm-channel-1" }))
      .mockResolvedValueOnce(
        discordAnswer(429, { message: "You are being rate limited.", retry_after: 60 }),
      );

    const response = await POST(sendRequest(validBody));

    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("You are being rate limited.");
  });

  it("refuses a locale the app does not support, before calling Discord", async () => {
    const response = await POST(
      sendRequest({ template: "subFlow", profileId: PROFILE_ID, locale: "de" }),
    );

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses a preview that names no locale, before calling Discord", async () => {
    const response = await POST(sendRequest({ template: "subFlow", profileId: PROFILE_ID }));

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

  it("refuses a body that names no template", async () => {
    const response = await POST(
      sendRequest({ profileId: PROFILE_ID, content: "Hello from Sogverse" }),
    );

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
