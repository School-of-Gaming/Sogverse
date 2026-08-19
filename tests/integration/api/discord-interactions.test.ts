import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.DISCORD_PUBLIC_KEY = "test-public-key";
process.env.DISCORD_BOT_TOKEN = "test-bot-token";
process.env.DISCORD_APPLICATION_ID = "test-app-id";

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
  InteractionType: { PING: 1, APPLICATION_COMMAND: 2 },
  InteractionResponseType: {
    PONG: 1,
    DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  },
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

// The deferred work PATCHes the answer back to Discord over the network, and
// it is started eagerly (the platform hook receives an already-running
// promise). Stub fetch so the suite stays hermetic, and give every downstream
// mock a resolved value in beforeEach for the same reason: that promise is
// never awaited, so anything it rejects with surfaces as an unhandled
// rejection and fails the run even though every assertion passed.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { POST } from "@/app/api/discord/interactions/route";

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
});
