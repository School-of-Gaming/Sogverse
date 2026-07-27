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
  });

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
