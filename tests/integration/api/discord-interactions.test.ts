import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from "vitest";

// Stubbed rather than assigned: the node project shares a worker between
// files, so a bare assignment would outlive this one.
vi.stubEnv("DISCORD_PUBLIC_KEY", "test-public-key");
vi.stubEnv("DISCORD_BOT_TOKEN", "test-bot-token");
vi.stubEnv("DISCORD_APPLICATION_ID", "test-app-id");
// The origin `/link` builds its URL on. The test requests carry no Host, so
// it is the configured site URL that is used.
vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sogverse.sog.gg");
afterAll(() => vi.unstubAllEnvs());

// A webhook, so there is no session and no role: the Ed25519 signature over the
// timestamp and the raw body IS the authorization. That makes two properties
// the ones worth pinning. First, an unsigned or wrongly-signed request must be
// refused before the payload is parsed at all — the signature is the only
// gate, so anything that happens before it runs happens for anybody. Second,
// every command must answer synchronously and finish its slow work afterwards,
// because Discord hard-times-out an interaction at three seconds and
// de-registers an endpoint that fails its handshake.

const mockVerifyKey = vi.fn();
const deferred: unknown[] = [];

vi.mock("discord-interactions", () => ({
  verifyKey: (...args: unknown[]) => mockVerifyKey(...args),
  InteractionType: {
    PING: 1,
    APPLICATION_COMMAND: 2,
    MESSAGE_COMPONENT: 3,
    MODAL_SUBMIT: 5,
  },
  InteractionResponseType: {
    PONG: 1,
    CHANNEL_MESSAGE_WITH_SOURCE: 4,
    DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
    DEFERRED_UPDATE_MESSAGE: 6,
    UPDATE_MESSAGE: 7,
    MODAL: 9,
  },
}));

// `/sub` reaches the database only through the bot's server module, whose
// service-role wrappers resolve the gedu from the Discord id themselves.
const mockResolveDiscordGedu = vi.fn();
const mockGetSessions = vi.fn();
const mockFileRequest = vi.fn();
const mockAnswerRequest = vi.fn();
const mockReadDm = vi.fn();
vi.mock("@/lib/discord-substitution.server", () => ({
  resolveDiscordGedu: (...args: unknown[]) => mockResolveDiscordGedu(...args),
  getDiscordGeduUpcomingSessions: (...args: unknown[]) => mockGetSessions(...args),
  fileDiscordSubstitutionRequest: (...args: unknown[]) => mockFileRequest(...args),
  answerDiscordSubstitutionRequest: (...args: unknown[]) => mockAnswerRequest(...args),
  readDiscordSubstitutionDm: (...args: unknown[]) => mockReadDm(...args),
  isDiscordGeduNotLinked: (error: unknown) =>
    typeof error === "object" && error !== null && "code" in error && error.code === "P0031",
}));

// A substitution DM's press syncs its request in-process.
const mockDrain = vi.fn();
vi.mock("@/lib/substitution-notifications/sync.server", () => ({
  drainSubstitutionNotifications: (...args: unknown[]) => mockDrain(...args),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    // Capture the background work instead of running it, so the tests can
    // assert that the route deferred rather than awaited.
    after: (work: unknown) => {
      deferred.push(work);
    },
  };
});

const mockAskGeduGuru = vi.fn();
const mockAskHappinappi = vi.fn();
vi.mock("@/lib/gemini", () => ({
  askGeduGuru: (...args: unknown[]) => mockAskGeduGuru(...args),
  askHappinappi: (...args: unknown[]) => mockAskHappinappi(...args),
}));

const mockResetPassword = vi.fn();
vi.mock("@/lib/microsoft-graph", () => ({
  resetPassword: (...args: unknown[]) => mockResetPassword(...args),
}));

// `/link` stores its token's hash with the service-role client, and a
// substitution DM's press forgets the DM's recorded rendering with it.
const mockInsert = vi.fn();
const mockUpdate = vi.fn((_values: unknown) => updateChain);
const mockUpdateEq = vi.fn((_column: string, _value: unknown) => updateChain);
const updateChain = {
  eq: (column: string, value: unknown) => mockUpdateEq(column, value),
  then: (resolve: (result: { error: null }) => unknown) => resolve({ error: null }),
};
const mockFrom = vi.fn((_table: string) => ({ insert: mockInsert, update: mockUpdate }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

// The deferred work PATCHes the answer back to Discord over the network, and
// it is started eagerly (the platform hook receives an already-running
// promise). Stub fetch so the suite stays hermetic, and give every downstream
// mock a resolved value in beforeEach for the same reason: that promise is
// never awaited, so anything it rejects with surfaces as an unhandled
// rejection and fails the run even though every assertion passed.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { POST } from "@/app/api/discord/interactions/route";
import fiMessages from "../../../messages/fi.json";
import {
  SNAPSHOT_IDS,
  notificationSnapshot,
  snapshotCandidate,
} from "../../mocks/substitution-notifications";

function interactionRequest(
  payload: unknown,
  { signature = "sig", timestamp = "123", rawBody = "" } = {},
): Request {
  return new Request("http://localhost:3000/api/discord/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp,
    },
    body: rawBody || JSON.stringify(payload),
  });
}

/** The URL on a PATCHed reply's link button — `/link`'s, and `/sub`'s not-linked answer. */
function linkButtonUrl(patched: { components?: unknown }): string {
  const url = JSON.stringify(patched.components ?? []).match(/"url":"([^"]+)"/)?.[1];
  return url ?? "";
}

describe("POST /api/discord/interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deferred.length = 0;
    mockVerifyKey.mockResolvedValue(true);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    mockAskGeduGuru.mockResolvedValue("vastaus");
    mockAskHappinappi.mockResolvedValue("HAPPEE!");
    mockResetPassword.mockResolvedValue({
      ok: true,
      upn: "alice@gamer.sog.gg",
      password: "Sogverse42",
      forceChange: false,
    });
    mockInsert.mockResolvedValue({ error: null });
  });

  /** Let the eagerly-started deferred work settle before the test ends. */
  async function settleDeferred(): Promise<void> {
    await Promise.all(deferred);
  }

  // -- Authorization: the signature is the whole gate --

  it("returns 401 when the signature does not verify", async () => {
    mockVerifyKey.mockResolvedValue(false);

    const response = await POST(interactionRequest({ type: 1 }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid signature" });
  });

  it("refuses an unsigned request", async () => {
    mockVerifyKey.mockResolvedValue(false);

    const response = await POST(
      new Request("http://localhost:3000/api/discord/interactions", {
        method: "POST",
        body: JSON.stringify({ type: 1 }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("verifies over the exact raw bytes, with the timestamp and the public key", async () => {
    // The signature covers timestamp + body, so the route must hand the
    // verifier the untouched text rather than a re-serialized object.
    const rawBody = '{"type":1,"unknown_field":"kept"}';

    await POST(
      interactionRequest(null, { rawBody, signature: "sig-1", timestamp: "t-1" }),
    );

    // The public key is read from the environment at module load, so only the
    // three request-derived arguments are asserted here.
    const [body, signature, timestamp] = mockVerifyKey.mock.calls[0];
    expect(body).toBe(rawBody);
    expect(signature).toBe("sig-1");
    expect(timestamp).toBe("t-1");
  });

  it("does no work at all when verification fails", async () => {
    mockVerifyKey.mockResolvedValue(false);

    await POST(
      interactionRequest({
        type: 2,
        token: "interaction-token",
        data: { name: "geduguru", options: [{ value: "kysymys" }] },
      }),
    );

    expect(deferred).toHaveLength(0);
    expect(mockAskGeduGuru).not.toHaveBeenCalled();
  });

  // -- Payload --

  it("returns 400 for a payload that is not an interaction", async () => {
    const response = await POST(interactionRequest({ no: "type" }));

    expect(response.status).toBe(400);
  });

  it("returns 400 for an interaction type it does not handle", async () => {
    const response = await POST(interactionRequest({ type: 99 }));

    expect(response.status).toBe(400);
  });

  it("keeps unknown fields from breaking the webhook", async () => {
    // Meta and Discord both add fields over time; a strict schema here would
    // turn a harmless addition into a de-registered endpoint.
    const response = await POST(
      interactionRequest({ type: 1, brand_new_field: { nested: true } }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
  });

  // -- Handshake --

  it("answers a PING with a PONG", async () => {
    const response = await POST(interactionRequest({ type: 1 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
  });

  // -- Commands --

  it("defers every command rather than answering inline", async () => {
    const response = await POST(
      interactionRequest({
        type: 2,
        token: "interaction-token",
        data: { name: "geduguru", options: [{ value: "Mikä on SOG?" }] },
      }),
    );

    expect(response.status).toBe(200);
    // 5 = DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE. Discord times out at 3s, so the
    // AI/Graph call must never run before this response is returned.
    expect(await response.json()).toEqual({ type: 5 });
    // The slow work is handed to the platform's post-response hook, so the
    // function stays alive for it after the interaction is acknowledged.
    expect(deferred).toHaveLength(1);
    await settleDeferred();
  });

  it("defers the password-reset command the same way", async () => {
    const response = await POST(
      interactionRequest({
        type: 2,
        token: "interaction-token",
        data: { name: "reset-password", options: [{ value: "alice bob" }] },
      }),
    );

    expect(await response.json()).toEqual({ type: 5 });
    expect(deferred).toHaveLength(1);
    // Two usernames, one Graph call each — dispatched to the deferred path
    // rather than blocking the acknowledgement.
    expect(mockResetPassword).toHaveBeenCalledTimes(2);
    await settleDeferred();
  });

  /**
   * The reset command's rendered message, line by line.
   *
   * The Graph module answers in outcome *codes* now, so the platform's tools
   * card can translate them; the English sentences moved into this route and
   * these two cases pin them byte for byte. Discord is a staff channel with no
   * locale, and a wording change here is a change to the only interface the
   * educators using the bot have.
   */
  async function patchedContent(input: string): Promise<string> {
    await POST(
      interactionRequest({
        type: 2,
        token: "interaction-token",
        data: { name: "reset-password", options: [{ value: input }] },
      }),
    );
    await settleDeferred();
    const [, init] = mockFetch.mock.calls[0];
    return JSON.parse(String(init.body)).content;
  }

  it("renders a success line, and marks the ones that must change on sign-in", async () => {
    mockResetPassword
      .mockResolvedValueOnce({
        ok: true,
        upn: "alice@gamer.sog.gg",
        password: "Sogverse42",
        forceChange: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        upn: "bob@gedu.sog.gg",
        password: "Sogverse07",
        forceChange: true,
      });

    expect(await patchedContent("alice bob")).toBe(
      "✅ **alice@gamer.sog.gg** → `Sogverse42`\n" +
        "✅ **bob@gedu.sog.gg** → `Sogverse07` (must change on sign-in)",
    );
  });

  it("renders every failure code as the sentence it has always sent", async () => {
    mockResetPassword
      .mockResolvedValueOnce({ ok: false, code: "invalid_username" })
      .mockResolvedValueOnce({
        ok: false,
        code: "not_found",
        username: "carol",
        domains: ["gamer.sog.gg", "gedu.sog.gg"],
      })
      .mockResolvedValueOnce({ ok: false, code: "azure_auth" })
      .mockResolvedValueOnce({ ok: false, code: "graph_error", status: 503 });

    expect(await patchedContent("a@b.c carol dave erin")).toBe(
      "❌ **a@b.c** — Invalid username. Provide just the username, not the full email.\n" +
        '❌ **carol** — User "carol" not found on @gamer.sog.gg or @gedu.sog.gg.\n' +
        "❌ **dave** — Failed to authenticate with Azure. Check bot configuration.\n" +
        "❌ **erin** — Microsoft Graph error: 503",
    );
  });

  it("has a sentence for the one failure code newer than the command", async () => {
    // Every other sentence above is pinned because it is the wording the
    // command has always sent; this code postdates the command, so what is
    // pinned here is only that it has a sentence at all — an unhandled code
    // would not compile, but an empty one would ship.
    mockResetPassword.mockResolvedValueOnce({
      ok: false,
      code: "unsupported_domain",
      domains: ["gamer.sog.gg", "gedu.sog.gg"],
    });

    expect(await patchedContent("principal@sog.gg")).toBe(
      "❌ **principal@sog.gg** — Only @gamer.sog.gg and @gedu.sog.gg accounts can be reset.",
    );
  });

  it("falls back to a harmless PONG when the command carries no argument", async () => {
    const response = await POST(
      interactionRequest({
        type: 2,
        token: "interaction-token",
        data: { name: "geduguru" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
    expect(deferred).toHaveLength(0);
  });

  it("falls back to a PONG for a non-string option value", async () => {
    const response = await POST(
      interactionRequest({
        type: 2,
        token: "interaction-token",
        data: { name: "geduguru", options: [{ value: { nested: true } }] },
      }),
    );

    expect(await response.json()).toEqual({ type: 1 });
    expect(deferred).toHaveLength(0);
  });

  it("falls back to a PONG when there is no interaction token to reply to", async () => {
    const response = await POST(
      interactionRequest({
        type: 2,
        data: { name: "geduguru", options: [{ value: "kysymys" }] },
      }),
    );

    expect(await response.json()).toEqual({ type: 1 });
    expect(deferred).toHaveLength(0);
  });

  // -- /link -----------------------------------------------------------------
  //
  // The reply carries a one-time sign-in link, so three properties matter
  // beyond the deferral every command shares: only the caller ever sees it,
  // only the token's hash is stored, and a failure never leaks the cause.

  const GUILD_CALLER = { user: { id: "112233445566778899", username: "kyle_sog" } };

  /** Run `/link` and return the inserted row and the PATCHed message. */
  async function runLink(payload: Record<string, unknown>) {
    const response = await POST(
      interactionRequest({ type: 2, token: "interaction-token", data: { name: "link" }, ...payload }),
    );
    await settleDeferred();
    const [, init] = mockFetch.mock.calls[0] ?? [];
    const patched = init ? JSON.parse(String(init.body)) : null;
    const row = mockInsert.mock.calls[0]?.[0];
    return { response, patched, row };
  }

  it("defers /link ephemerally, though it takes no argument", async () => {
    const { response } = await runLink({ member: GUILD_CALLER });

    // 64 = EPHEMERAL: the flag on the deferred response decides who sees the
    // reply that later replaces it.
    expect(await response.json()).toEqual({ type: 5, data: { flags: 64 } });
    expect(deferred).toHaveLength(1);
  });

  it("stores only the hash of the token it sends, for the server member who ran it", async () => {
    const { patched, row } = await runLink({ member: GUILD_CALLER });

    expect(mockFrom).toHaveBeenCalledWith("discord_link_tokens");
    const url = /^(https:\/\/sogverse\.sog\.gg\/link-discord\?token=([A-Za-z0-9_-]+))$/.exec(
      linkButtonUrl(patched),
    );
    expect(url).not.toBeNull();
    const token = url?.[2] ?? "";
    // 32 random bytes as base64url.
    expect(token).toHaveLength(43);
    expect(row).toEqual({
      token_hash: createHash("sha256").update(token).digest("hex"),
      discord_user_id: "112233445566778899",
      discord_username: "kyle_sog",
    });
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("puts the link on a button, never in the text, and says it expires and works once", async () => {
    const { patched } = await runLink({ member: GUILD_CALLER });

    expect(patched.content).toBe(
      "Connect your Discord account to your School of Gaming account. " +
        "The link expires in 10 minutes and works once.",
    );
    // 5 = a link button, which opens the URL and raises no interaction.
    expect(patched.components?.[0]?.components?.[0]).toMatchObject({
      type: 2,
      style: 5,
      label: "Connect account",
    });
  });

  it("reads the caller from `user` when the command is run in a DM", async () => {
    const { row } = await runLink({
      user: { id: "998877665544332211", username: "dm_caller" },
    });

    expect(row.discord_user_id).toBe("998877665544332211");
    expect(row.discord_username).toBe("dm_caller");
  });

  it("mints a different token every time", async () => {
    await runLink({ member: GUILD_CALLER });
    await POST(
      interactionRequest({
        type: 2,
        token: "interaction-token",
        data: { name: "link" },
        member: GUILD_CALLER,
      }),
    );
    await settleDeferred();

    const [first, second] = mockInsert.mock.calls.map(([row]) => row.token_hash);
    expect(first).not.toBe(second);
  });

  it("sends a short failure line, never the cause, when the token cannot be stored", async () => {
    mockInsert.mockResolvedValue({
      error: { code: "23514", message: "discord_link_tokens_username_check" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { patched } = await runLink({ member: GUILD_CALLER });

    expect(patched.content).toBe(
      "Sorry, I couldn't create a link right now. Try /link again in a moment.",
    );
    expect(patched.content).not.toContain("link-discord");
  });

  it("falls back to a PONG when the payload names no caller", async () => {
    const response = await POST(
      interactionRequest({ type: 2, token: "interaction-token", data: { name: "link" } }),
    );

    expect(await response.json()).toEqual({ type: 1 });
    expect(deferred).toHaveLength(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// -- /sub ---------------------------------------------------------------------
//
// A gedu files "I can't make this session" without leaving Discord. Pinned
// beyond the deferral every command shares: an unlinked caller gets `/link`'s
// own reply, every step that reads or writes is deferred and lands by PATCH,
// the presser is always the Discord id the signed payload names (never an id
// out of a custom_id), the web's refusal mapping reaches the reader, and the
// admin preview's controls file nothing at all.

describe("POST /api/discord/interactions — /sub", () => {
  const CALLER = { user: { id: "112233445566778899", username: "gedu_sog" } };
  const GROUP_A = "6f1c2c1e-6d43-4c1a-9a5e-2f8f0d1b7a10";
  const GROUP_B = "0b7e2a56-3c1d-4f7e-8a2b-9c4d5e6f7a81";
  /** A Monday morning in Helsinki. */
  const NOW = new Date("2026-10-05T06:00:00Z");

  function session(groupId: string, sessionDate: string) {
    const startsAt = new Date(`${sessionDate}T13:00:00Z`);
    return {
      key: `${groupId}:${sessionDate}`,
      groupId,
      sessionDate,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 90 * 60_000),
      timezone: "Europe/Helsinki",
      productId: groupId,
      productName: "Minecraft Club",
      productType: "consumer_club",
      groupName: "A",
      isRemote: false,
      siteName: "Kallio School",
    };
  }

  const SESSIONS = [
    session(GROUP_A, "2026-10-06"),
    session(GROUP_B, "2026-10-08"),
    session(GROUP_A, "2026-10-13"),
    session(GROUP_A, "2026-10-20"),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    deferred.length = 0;
    mockVerifyKey.mockResolvedValue(true);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    mockInsert.mockResolvedValue({ error: null });
    mockResolveDiscordGedu.mockResolvedValue({ profileId: "gedu-profile", locale: null });
    mockGetSessions.mockResolvedValue(SESSIONS);
    mockFileRequest.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** POST one interaction, let its deferred work land, return both halves. */
  async function run(payload: Record<string, unknown>) {
    const response = await POST(
      interactionRequest({ token: "interaction-token", member: CALLER, ...payload }),
    );
    await Promise.all(deferred);
    const [url, init] = mockFetch.mock.calls[0] ?? [];
    return {
      response: await response.json(),
      patchedUrl: String(url),
      patched: init ? JSON.parse(String(init.body)) : null,
    };
  }

  const command = (extra: Record<string, unknown> = {}) =>
    run({ type: 2, data: { name: "sub" }, ...extra });
  /** The session select's options on the pressed message, as the list drew them. */
  const PRESSED_OPTIONS = [
    {
      label: "Tue, Oct 6, 16:00 – 17:30 GMT+3",
      description: "Minecraft Club — A · Kallio School",
      value: `${GROUP_A}:2026-10-06`,
    },
    {
      label: "Thu, Oct 8, 16:00 – 17:30 GMT+3",
      description: "Minecraft Club — A · Kallio School",
      value: `${GROUP_B}:2026-10-08`,
    },
  ];
  /**
   * The message a control sits on, as Discord sends it with the press: an
   * ephemeral Components V2 message with a select, a button and a link.
   */
  const PRESSED_MESSAGE = {
    id: "1300000000000000000",
    flags: (1 << 15) | 64,
    components: [
      {
        type: 17,
        id: 1,
        components: [
          {
            type: 9,
            id: 8,
            components: [{ type: 10, id: 9, content: "# School of Gaming · Substitutions" }],
            accessory: {
              type: 11,
              id: 10,
              media: {
                url: "https://sogverse.sog.gg/apple-icon.png",
                proxy_url: "https://media.discordapp.net/external/abc/apple-icon.png",
                width: 180,
                height: 180,
                content_type: "image/png",
              },
            },
          },
          {
            type: 1,
            id: 3,
            components: [{ type: 3, id: 4, custom_id: "sub:s:en", options: PRESSED_OPTIONS }],
          },
          {
            type: 1,
            id: 5,
            components: [
              { type: 2, id: 6, style: 2, custom_id: "sub:l", label: "Back" },
              { type: 2, id: 7, style: 5, url: "https://sogverse.sog.gg", label: "Web" },
            ],
          },
        ],
      },
    ],
  };
  /** {@link PRESSED_MESSAGE} with every control that raises an interaction disabled. */
  const GREYED_OUT = {
    flags: 1 << 15,
    components: [
      {
        type: 17,
        id: 1,
        components: [
          {
            type: 9,
            id: 8,
            components: [{ type: 10, id: 9, content: "# School of Gaming · Substitutions" }],
            accessory: {
              type: 11,
              id: 10,
              media: {
                url: "https://sogverse.sog.gg/apple-icon.png",
                proxy_url: "https://media.discordapp.net/external/abc/apple-icon.png",
                width: 180,
                height: 180,
                content_type: "image/png",
              },
            },
          },
          {
            type: 1,
            id: 3,
            components: [
              { type: 3, id: 4, custom_id: "sub:s:en", options: PRESSED_OPTIONS, disabled: true },
            ],
          },
          {
            type: 1,
            id: 5,
            components: [
              {
                type: 2,
                id: 6,
                style: 2,
                custom_id: "sub:l",
                label: "Back",
                disabled: true,
              },
              { type: 2, id: 7, style: 5, url: "https://sogverse.sog.gg", label: "Web" },
            ],
          },
        ],
      },
    ],
  };

  const press = (
    customId: string,
    values?: string[],
    options: { message?: unknown } = {},
  ) =>
    run({
      type: 3,
      // Explicitly `undefined` is a press with no message at all.
      message: "message" in options ? options.message : PRESSED_MESSAGE,
      data: { custom_id: customId, component_type: values ? 3 : 2, values },
    });

  /** Every component in a payload, depth first, a section's accessory included. */
  function walk(components: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(components)) return [];
    return components.flatMap((component: Record<string, unknown>) => [
      component,
      ...walk(component.components),
      ...walk(component.accessory === undefined ? [] : [component.accessory]),
    ]);
  }
  const ofType = (body: { components: unknown }, type: number) =>
    walk(body.components).filter((component) => component.type === type);
  const texts = (body: { components: unknown }) =>
    walk(body.components)
      .filter((component) => component.type === 10)
      .map((component) => String(component.content))
      .join("\n");
  const ids = (body: { components: unknown }) =>
    walk(body.components)
      .map((component) => component.custom_id)
      .filter((id) => id !== undefined);

  it("defers /sub ephemerally, though it takes no argument", async () => {
    const { response } = await command();

    expect(response).toEqual({ type: 5, data: { flags: 64 } });
  });

  it("answers an unlinked caller with /link's own reply, under a line saying why", async () => {
    mockResolveDiscordGedu.mockResolvedValue(null);

    const { patched } = await command();

    expect(patched.content).toBe(
      "To use /sub, first link your Discord account to your School of Gaming Gedu account.\n\n" +
        "Connect your Discord account to your School of Gaming account. " +
        "The link expires in 10 minutes and works once.",
    );
    expect(linkButtonUrl(patched)).toMatch(
      /^https:\/\/sogverse\.sog\.gg\/link-discord\?token=[A-Za-z0-9_-]{43}$/,
    );
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockGetSessions).not.toHaveBeenCalled();
  });

  it("says it in the caller's Discord language when there is no account to read one from", async () => {
    mockResolveDiscordGedu.mockResolvedValue(null);

    const { patched } = await command({ locale: "sv-SE" });

    expect(patched.content).toMatch(/^För att använda \/sub/);
  });

  it("lists a linked gedu's sessions as a Components V2 message, in their own locale", async () => {
    mockResolveDiscordGedu.mockResolvedValue({ profileId: "gedu-profile", locale: "fi" });

    const { patched, patchedUrl } = await command({ locale: "en-GB" });

    // The application id is read when the route module loads, ahead of the
    // env stub, so only the interaction's own half of the URL is pinned.
    expect(patchedUrl).toMatch(/\/interaction-token\/messages\/@original$/);
    expect(mockResolveDiscordGedu).toHaveBeenCalledWith("112233445566778899");
    expect(mockGetSessions).toHaveBeenCalledWith({
      discordUserId: "112233445566778899",
      locale: "fi",
      now: NOW,
    });
    expect(patched.flags).toBe(1 << 15);
    expect(patched.content).toBeUndefined();
    expect(texts(patched)).toContain("### Mille kerralle tarvitset tuuraajan?");
    // The select carries the gedu's locale for the modal it opens.
    expect(ids(patched)).toEqual(["sub:s:fi"]);
    const [select] = walk(patched.components).filter((component) => component.type === 3);
    expect(select.options).toMatchObject(SESSIONS.map((entry) => ({ value: entry.key })));
    expect(select.options).toHaveLength(SESSIONS.length);
  });

  it("heads every step with the favicon from this environment's own site", async () => {
    for (const { patched } of [await command(), await press("sub:l")]) {
      const [section] = ofType(patched, 9);
      expect(section.accessory).toEqual({
        type: 11,
        media: { url: "https://sogverse.sog.gg/apple-icon.png" },
      });
      expect(texts({ components: section.components })).toContain(
        "# School of Gaming · Substitutions",
      );
      mockFetch.mockClear();
    }
  });

  it("sends no logo where Discord could not fetch one, as from a dev machine", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    try {
      const { patched } = await command();

      expect(ofType(patched, 9)).toHaveLength(0);
      expect(ofType(patched, 11)).toHaveLength(0);
      expect(texts(patched)).toContain("# School of Gaming · Substitutions");
      expect(JSON.stringify(patched)).not.toContain("apple-icon");
    } finally {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sogverse.sog.gg");
    }
  });

  it("tells a gedu with nothing to file for so", async () => {
    mockGetSessions.mockResolvedValue([]);

    const { patched } = await command();

    expect(texts(patched)).toContain("You have no upcoming sessions to ask for a substitute for.");
    expect(ids(patched)).toEqual([]);
  });

  it("sends a short line, never the cause, when a read fails", async () => {
    mockGetSessions.mockRejectedValue(new Error("connection reset"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { patched } = await command();

    expect(texts(patched)).toContain("Something went wrong. Run /sub again in a moment.");
    expect(JSON.stringify(patched)).not.toContain("connection reset");
  });

  it("goes back to the list, greying the pressed message's controls out meanwhile", async () => {
    const { response, patched } = await press("sub:l");

    expect(response).toEqual({ type: 7, data: GREYED_OUT });
    expect(texts(patched)).toContain("### Which session do you need a substitute for?");
    expect(ids(patched)).toEqual(["sub:s:en"]);
  });

  /**
   * The request modal's submission, as Discord sends it: a Label holding a
   * select reports its pick as `values`, a Label holding a text input its
   * `value`.
   */
  const submit = (
    sessionDate = "2026-10-06",
    options: { reason?: unknown[]; note?: string; message?: unknown } = {},
  ) => {
    const { reason = ["sick"], note = "" } = options;
    return run({
      type: 5,
      // Explicitly `undefined` is a submit with no message at all.
      message: "message" in options ? options.message : PRESSED_MESSAGE,
      data: {
        custom_id: `sub:n:${GROUP_A}:${sessionDate}`,
        components: [
          { type: 10, id: 1, content: "**Tue, Oct 6, 16:00 – 17:30 GMT+3**" },
          { type: 10, id: 2, content: "Only admins see the reason." },
          { type: 18, id: 3, component: { type: 3, id: 4, custom_id: "reason", values: reason } },
          { type: 18, id: 5, component: { type: 4, id: 6, custom_id: "note", value: note } },
        ],
      },
    });
  };

  it("opens the request modal synchronously on a pick, without reading anything", async () => {
    const { response } = await press("sub:s:fi", [`${GROUP_B}:2026-10-08`]);

    // A modal answers the press itself: no greyed-out redraw, nothing deferred.
    expect(response.type).toBe(9);
    expect(response.data.custom_id).toBe(`sub:n:${GROUP_B}:2026-10-08`);
    // In the locale the select carries, not the presser's Discord client's.
    expect(response.data.title).toBe("Pyydä tuuraajaa");
    // The session line is the option picked on the pressed message.
    expect(response.data.components[0]).toEqual({
      type: 10,
      content: "**Thu, Oct 8, 16:00 – 17:30 GMT+3**\nMinecraft Club — A · Kallio School",
    });
    const reason = response.data.components.find(
      (component: { type: number; component?: { custom_id?: string } }) =>
        component.type === 18 && component.component?.custom_id === "reason",
    );
    expect(reason.component.options.map((option: { value: string }) => option.value)).toEqual([
      "sick",
      "other",
    ]);
    expect(deferred).toHaveLength(0);
    expect(mockResolveDiscordGedu).not.toHaveBeenCalled();
    expect(mockGetSessions).not.toHaveBeenCalled();
    expect(mockFileRequest).not.toHaveBeenCalled();
  });

  it("names the session by its date alone when the pressed message does not carry it", async () => {
    const { response } = await press("sub:s:en", [`${GROUP_A}:2026-10-13`]);

    expect(response.type).toBe(9);
    expect(response.data.components[0]).toEqual({ type: 10, content: "**Tue, Oct 13**" });
  });

  it("acknowledges a pick that is not a session, and opens nothing", async () => {
    const { response } = await press("sub:s:en", ["nonsense"]);

    expect(response).toEqual({ type: 6 });
    expect(deferred).toHaveLength(0);
  });

  it("files with the reason and the note from the modal, as the presser", async () => {
    const { response, patched } = await submit("2026-10-06", {
      reason: ["other"],
      note: "Dentist",
    });

    // The message the modal was opened from is greyed out while the filing
    // runs, so a second submit cannot race the first to the outcome.
    expect(response).toEqual({ type: 7, data: GREYED_OUT });
    expect(deferred).toHaveLength(1);
    expect(mockResolveDiscordGedu).toHaveBeenCalledWith("112233445566778899");
    expect(mockFileRequest).toHaveBeenCalledWith({
      discordUserId: "112233445566778899",
      groupId: GROUP_A,
      sessionDate: "2026-10-06",
      reason: "other",
      reasonNote: "Dentist",
    });
    expect(texts(patched)).toContain("Substitute requested for Minecraft Club — A on Tue, Oct 6,");
  });

  it("files with no note when the note is left blank", async () => {
    await submit();

    expect(mockFileRequest).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "sick", reasonNote: "" }),
    );
  });

  it("reads the fields from an action-row modal too", async () => {
    await run({
      type: 5,
      data: {
        custom_id: `sub:n:${GROUP_A}:2026-10-06`,
        components: [
          { type: 1, components: [{ type: 3, custom_id: "reason", values: ["sick"] }] },
          { type: 1, components: [{ type: 4, custom_id: "note", value: "Flu" }] },
        ],
      },
    });

    expect(mockFileRequest).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "sick", reasonNote: "Flu" }),
    );
  });

  it.each([[[]], [["holiday"]], [[7]]])(
    "files nothing from a submission whose reason is %j",
    async (reason) => {
      const { response } = await submit("2026-10-06", { reason });

      expect(response).toEqual({ type: 6 });
      expect(deferred).toHaveLength(0);
      expect(mockFileRequest).not.toHaveBeenCalled();
    },
  );

  // The list leaves out the sessions already asked for, so a session missing
  // from it is not evidence it left the schedule: the write is tried, and its
  // own refusal is the answer.
  it("still files for a session missing from the list", async () => {
    await submit("2026-12-01");

    expect(mockFileRequest).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: GROUP_A, sessionDate: "2026-12-01" }),
    );
  });

  it("says a session missing from the list was already asked for, not that it left the schedule", async () => {
    mockFileRequest.mockRejectedValue({ code: "42501", message: "Forbidden" });

    const { patched } = await submit("2026-12-01");

    expect(texts(patched)).toContain(
      "You’ve already asked for a substitute for this session, or you’re no longer down to run it.",
    );
    expect(texts(patched)).not.toContain("This session is no longer on the schedule.");
    expect(ids(patched)).toEqual(["sub:l"]);
  });

  it("says a session missing from the list is off the schedule when the write says so", async () => {
    mockFileRequest.mockRejectedValue({
      code: "23514",
      message: "No scheduled session on 2026-12-01 for this group",
    });

    const { patched } = await submit("2026-12-01");

    expect(texts(patched)).toContain("This session is no longer on the schedule.");
    expect(ids(patched)).toEqual(["sub:l"]);
  });

  it("names a filed session the list does not carry by its date alone", async () => {
    const { patched } = await submit("2026-12-01");

    expect(texts(patched)).toContain("**Tue, Dec 1**");
    expect(texts(patched)).toContain("You’ve asked for a substitute for this session. Waiting for one.");
  });

  it("reads a refusal through the web's own mapping", async () => {
    mockFileRequest.mockRejectedValue({ code: "42501", message: "not expected" });

    const { patched } = await submit();

    expect(texts(patched)).toContain(
      "You’ve already asked for a substitute for this session, or you’re no longer down to run it.",
    );
    expect(ids(patched)).toEqual(["sub:l"]);
  });

  it("tells a presser whose link has gone to run /link", async () => {
    mockFileRequest.mockRejectedValue({ code: "P0031", message: "not linked" });

    const { patched } = await submit();

    expect(patched.flags).toBe(1 << 15);
    expect(texts(patched)).toContain("Run /link to link it, then /sub again.");
  });

  it("answers a press on the admin preview with a line, and nothing else", async () => {
    const { response } = await run({
      type: 3,
      locale: "fr",
      user: { id: "998877665544332211", username: "admin_sog" },
      member: undefined,
      data: { custom_id: "subpreview:s", values:[`${GROUP_A}:2026-10-06`] },
    });

    expect(response).toEqual({
      type: 4,
      data: { content: "Ceci est un aperçu — rien n’a été envoyé.", flags: 64 },
    });
    expect(deferred).toHaveLength(0);
    expect(mockResolveDiscordGedu).not.toHaveBeenCalled();
    expect(mockFileRequest).not.toHaveBeenCalled();
  });

  it("falls back to a plain deferred update when the submit carries no usable message", async () => {
    for (const message of [undefined, { flags: 1 << 15 }, "not a message"]) {
      mockFetch.mockClear();
      mockFileRequest.mockClear();
      deferred.length = 0;
      const { response, patched } = await submit("2026-10-06", { message });

      expect(response).toEqual({ type: 6 });
      expect(mockFileRequest).toHaveBeenCalledTimes(1);
      expect(texts(patched)).toContain("Substitute requested for Minecraft Club");
    }
  });

  it("acknowledges a control it cannot place, and does nothing", async () => {
    const { response } = await press("somebody-else:1");

    expect(response).toEqual({ type: 6 });
    expect(deferred).toHaveLength(0);
  });
});

describe("POST /api/discord/interactions — a substitution request's DM", () => {
  const GEDU = { id: "112233445566778899", username: "gedu_sog" };
  const REQUEST = SNAPSHOT_IDS.request;
  /** The DM as Discord sends it with a press: Decline and Offer under the session. */
  const PRESSED_DM = {
    id: "1300000000000000001",
    flags: 1 << 15,
    components: [
      {
        type: 17,
        id: 1,
        components: [
          { type: 10, id: 2, content: "### A session needs a substitute" },
          {
            type: 1,
            id: 3,
            components: [
              { type: 2, id: 4, style: 2, custom_id: `subreq:d:${REQUEST}`, label: "Decline" },
              { type: 2, id: 5, style: 1, custom_id: `subreq:o:${REQUEST}`, label: "Offer" },
            ],
          },
        ],
      },
    ],
  };

  function readAs(
    candidate: Partial<Parameters<typeof snapshotCandidate>[0]> | null,
    snapshot = notificationSnapshot(),
  ) {
    mockReadDm.mockResolvedValue({
      snapshot,
      candidate:
        candidate === null
          ? null
          : snapshotCandidate({ gedu_id: SNAPSHOT_IDS.aino, discord_user_id: GEDU.id, ...candidate }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-08T09:00:00Z"));
    deferred.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockVerifyKey.mockResolvedValue(true);
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    mockAnswerRequest.mockResolvedValue(undefined);
    mockDrain.mockResolvedValue({ synced: 1, failed: 0, outOfTime: false });
    readAs({ response: "offer" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function press(customId: string, extra: Record<string, unknown> = {}) {
    const response = await POST(
      interactionRequest({
        type: 3,
        token: "interaction-token",
        user: GEDU,
        message: PRESSED_DM,
        data: { custom_id: customId, component_type: 2 },
        ...extra,
      }),
    );
    await Promise.all(deferred);
    const [url, init] = mockFetch.mock.calls[0] ?? [];
    return {
      response: await response.json(),
      patchedUrl: String(url),
      patched: init ? JSON.parse(String(init.body)) : null,
    };
  }

  /** Every text and custom_id in a drawn message, depth first. */
  function contents(body: { components: unknown }): { texts: string; ids: unknown[] } {
    const all: Array<Record<string, unknown>> = [];
    const walkInto = (components: unknown) => {
      if (!Array.isArray(components)) return;
      for (const component of components) {
        if (typeof component !== "object" || component === null) continue;
        all.push(component);
        walkInto(component.components);
        if (component.accessory !== undefined) walkInto([component.accessory]);
      }
    };
    walkInto(body.components);
    return {
      texts: all
        .filter((c) => c.type === 10)
        .map((c) => String(c.content))
        .join("\n"),
      ids: all.map((c) => c.custom_id).filter((id) => id !== undefined),
    };
  }

  it("greys the DM's buttons out at once and answers afterwards", async () => {
    const { response } = await press(`subreq:o:${REQUEST}`);

    expect(response.type).toBe(7);
    expect(JSON.stringify(response.data)).toContain('"disabled":true');
    expect(deferred).toHaveLength(1);
  });

  it("offers as the presser, syncs that one request, and redraws the DM", async () => {
    const { patched, patchedUrl } = await press(`subreq:o:${REQUEST}`);

    expect(mockAnswerRequest).toHaveBeenCalledWith({
      discordUserId: GEDU.id,
      requestId: REQUEST,
      response: "offer",
    });
    expect(mockDrain).toHaveBeenCalledWith({ requestIds: [REQUEST] });
    expect(patchedUrl).toMatch(/\/interaction-token\/messages\/@original$/);
    // Offered: Decline alone remains.
    expect(contents(patched).ids).toEqual([`subreq:d:${REQUEST}`]);
  });

  it("declines as the presser", async () => {
    readAs({ response: "decline" });

    const { patched } = await press(`subreq:d:${REQUEST}`);

    expect(mockAnswerRequest).toHaveBeenCalledWith(
      expect.objectContaining({ response: "decline" }),
    );
    expect(contents(patched).ids).toEqual([`subreq:o:${REQUEST}`]);
  });

  it("redraws a refused answer under the write's own line, in the gedu's language, with its buttons back", async () => {
    mockAnswerRequest.mockRejectedValue({
      code: "23514",
      message: "this substitution request is no longer taking offers",
    });
    readAs({ locale: "fi" });

    const { patched } = await press(`subreq:o:${REQUEST}`);

    expect(mockDrain).not.toHaveBeenCalled();
    const { texts, ids } = contents(patched);
    expect(texts).toContain(fiMessages.gedu.substitution.poolAnswerFailedClosed);
    expect(ids).toEqual([`subreq:d:${REQUEST}`, `subreq:o:${REQUEST}`]);
  });

  it("forgets the pressed DM's recorded rendering before answering, so the next sync redraws it", async () => {
    mockAnswerRequest.mockRejectedValue({
      code: "23514",
      message: "this substitution request is no longer taking offers",
    });

    await press(`subreq:o:${REQUEST}`);

    expect(mockFrom).toHaveBeenCalledWith("substitution_notification_dms");
    expect(mockUpdate).toHaveBeenCalledWith({ rendered_hash: null });
    expect(mockUpdateEq.mock.calls).toEqual([
      ["request_id", REQUEST],
      ["gedu_id", SNAPSHOT_IDS.aino],
    ]);
    expect(mockUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockAnswerRequest.mock.invocationCallOrder[0],
    );
  });

  it("forgets no rendering for a presser who is no candidate on the request", async () => {
    mockAnswerRequest.mockRejectedValue({ code: "P0031", message: "not linked" });
    readAs(null);

    await press(`subreq:o:${REQUEST}`);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("tells a presser with no gedu linked to run /link", async () => {
    mockAnswerRequest.mockRejectedValue({ code: "P0031", message: "not linked" });
    readAs(null);

    const { patched } = await press(`subreq:o:${REQUEST}`);

    expect(mockDrain).not.toHaveBeenCalled();
    expect(contents(patched).texts).toContain("Run /link to link it, then answer again.");
  });

  it("draws a closed request without buttons, whatever was pressed", async () => {
    mockAnswerRequest.mockRejectedValue({
      code: "23514",
      message: "this substitution request is no longer taking offers",
    });
    readAs({}, notificationSnapshot({ request: { status: "withdrawn" } }));

    const { patched } = await press(`subreq:o:${REQUEST}`);

    expect(contents(patched).ids).toEqual([]);
  });

  it("answers a press on the admin preview of a DM with its preview line, and nothing else", async () => {
    const { response } = await press(`subpreview:o:${REQUEST}`, { locale: "en-GB" });

    expect(response).toEqual({
      type: 4,
      data: { content: "This is a preview — pressing a button changes nothing.", flags: 64 },
    });
    expect(deferred).toHaveLength(0);
    expect(mockAnswerRequest).not.toHaveBeenCalled();
  });

  it("acknowledges a press that names no caller, and does nothing", async () => {
    const { response } = await press(`subreq:o:${REQUEST}`, { user: undefined });

    expect(response).toEqual({ type: 6 });
    expect(deferred).toHaveLength(0);
  });
});
