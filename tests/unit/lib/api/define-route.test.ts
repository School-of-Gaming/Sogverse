import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockGetClaims = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ auth: { getClaims: mockGetClaims } }),
}));

import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";

const URL_BASE = "http://localhost:3000/api/probe";

function jsonRequest(body: unknown, url = URL_BASE): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function authenticated(role = "customer") {
  const supabase = { rpc: vi.fn() };
  mockRequireRole.mockResolvedValue({
    user: { id: "user-1", email: "a@b.test" },
    profile: { id: "user-1", role },
    supabase,
  });
  return supabase;
}

describe("defineRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  // -- Auth ----------------------------------------------------------------

  describe("posture: role-gated", () => {
    it("passes the declared roles and gate options to the shared role gate", async () => {
      authenticated("gedu");
      const POST = defineRoute({
        posture: "role-gated",
        roles: ["admin", "gedu"],
        forbiddenMessage: "nope",
        allowUnverified: true,
        requireCertifiedGedu: true,
        handler: () => ({ ok: true }),
      });

      await POST(jsonRequest({}));

      expect(mockRequireRole).toHaveBeenCalledWith(["admin", "gedu"], {
        forbiddenMessage: "nope",
        allowUnverified: true,
        requireCertifiedGedu: true,
      });
    });

    it("returns the gate's refusal untouched and never runs the handler", async () => {
      mockRequireRole.mockResolvedValue(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
      const handler = vi.fn();
      const POST = defineRoute({
        posture: "role-gated",
        roles: "customer",
        handler,
      });

      const response = await POST(jsonRequest({}));

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it("hands the handler the caller's identity and user-bound client", async () => {
      const supabase = authenticated("admin");
      const POST = defineRoute({
        posture: "role-gated",
        roles: "admin",
        handler: async (context) => {
          // Calling through the context proves it is the gate's client, not a
          // fresh one the wrapper built behind the handler's back.
          await context.supabase.rpc("pin_is_set");
          return { id: context.user.id, role: context.profile.role };
        },
      });

      const response = await POST(jsonRequest({}));

      expect(await response.json()).toEqual({ id: "user-1", role: "admin" });
      expect(supabase.rpc).toHaveBeenCalledWith("pin_is_set");
    });

    it("refuses before parsing, so an unauthorized caller learns nothing about the input", async () => {
      mockRequireRole.mockResolvedValue(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
      const POST = defineRoute({
        posture: "role-gated",
        roles: "customer",
        body: z.object({ needed: z.string() }),
        handler: () => ({ ok: true }),
      });

      const response = await POST(jsonRequest({ wrong: 1 }));

      expect(response.status).toBe(401);
    });
  });

  describe("posture: any-authenticated", () => {
    it("accepts any signed-in caller without consulting the role gate", async () => {
      mockGetClaims.mockResolvedValue({
        data: { claims: { sub: "user-9", email: "x@y.test" } },
        error: null,
      });
      const POST = defineRoute({
        posture: "any-authenticated",
        reason: "test",
        handler: (context) => ({ id: context.user.id }),
      });

      const response = await POST(jsonRequest({}));

      expect(await response.json()).toEqual({ id: "user-9" });
      expect(mockRequireRole).not.toHaveBeenCalled();
    });

    it("answers 401 when there is no verified session", async () => {
      mockGetClaims.mockResolvedValue({ data: null, error: null });
      const handler = vi.fn();
      const POST = defineRoute({
        posture: "any-authenticated",
        reason: "test",
        handler,
      });

      const response = await POST(jsonRequest({}));

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("posture: public", () => {
    it("runs the handler with no authentication at all", async () => {
      const GET = defineRoute({
        posture: "public",
        reason: "test",
        handler: () => ({ ok: true }),
      });

      const response = await GET(new Request(URL_BASE));

      expect(await response.json()).toEqual({ ok: true });
      expect(mockRequireRole).not.toHaveBeenCalled();
      expect(mockGetClaims).not.toHaveBeenCalled();
    });
  });

  // -- Parsing slots -------------------------------------------------------

  describe("parsing slots", () => {
    it("validates the body against its schema and hands over the typed value", async () => {
      authenticated();
      const POST = defineRoute({
        posture: "role-gated",
        roles: "customer",
        body: z.object({ count: z.number() }),
        handler: ({ body }) => ({ doubled: body.count * 2 }),
      });

      const response = await POST(jsonRequest({ count: 21 }));

      expect(await response.json()).toEqual({ doubled: 42 });
    });

    it("answers 400 with the first issue when the body fails its schema", async () => {
      authenticated();
      const POST = defineRoute({
        posture: "role-gated",
        roles: "customer",
        body: z.object({ count: z.number() }),
        handler: () => ({ ok: true }),
      });

      const response = await POST(jsonRequest({}));

      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain("count");
    });

    it("answers 400 for malformed JSON", async () => {
      authenticated();
      const POST = defineRoute({
        posture: "role-gated",
        roles: "customer",
        body: z.object({ count: z.number() }),
        handler: () => ({ ok: true }),
      });

      const response = await POST(jsonRequest("{not-json"));

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("Invalid JSON body");
    });

    // The invariant that lets a raw-body verifier coexist with the wrapper:
    // no body schema means the request stream is never touched, so a handler
    // (or a hand-written route beside it) can still read the exact bytes.
    it("never reads the request body when no body schema is declared", async () => {
      authenticated();
      let rawSeen: string | null = null;
      const POST = defineRoute({
        posture: "role-gated",
        roles: "customer",
        handler: async ({ request }) => {
          rawSeen = await request.text();
          return { ok: true };
        },
      });

      const request = jsonRequest({ signed: "payload" });
      expect(request.bodyUsed).toBe(false);

      await POST(request);

      expect(rawSeen).toBe(JSON.stringify({ signed: "payload" }));
    });

    it("validates the query string", async () => {
      const GET = defineRoute({
        posture: "public",
        reason: "test",
        query: z.object({ code: z.string().min(3) }),
        handler: ({ query }) => ({ code: query.code }),
      });

      const ok = await GET(new Request(`${URL_BASE}?code=abcd`));
      expect(await ok.json()).toEqual({ code: "abcd" });

      const bad = await GET(new Request(`${URL_BASE}?code=a`));
      expect(bad.status).toBe(400);
    });

    it("validates the dynamic route params", async () => {
      authenticated();
      const PATCH = defineRoute({
        posture: "role-gated",
        roles: "admin",
        params: z.object({ id: z.string().uuid() }),
        handler: ({ params }) => ({ id: params.id }),
      });

      const id = "11111111-1111-1111-1111-111111111111";
      const ok = await PATCH(new Request(URL_BASE), {
        params: Promise.resolve({ id }),
      });
      expect(await ok.json()).toEqual({ id });

      const bad = await PATCH(new Request(URL_BASE), {
        params: Promise.resolve({ id: "not-a-uuid" }),
      });
      expect(bad.status).toBe(400);
    });
  });

  // -- Error mapping -------------------------------------------------------

  describe("error mapping", () => {
    async function respondToThrown(
      thrown: unknown,
      extra: { errorStatus?: Record<string, number>; disclose?: string } = {},
    ) {
      authenticated();
      const POST = defineRoute({
        posture: "role-gated",
        roles: "customer",
        errorStatus: extra.errorStatus,
        discloseErrorMessages: extra.disclose,
        handler: () => {
          throw thrown;
        },
      });
      return POST(jsonRequest({}));
    }

    it.each([
      ["42501", 403],
      ["23505", 409],
      ["P0002", 404],
      ["PGRST116", 404],
      ["23503", 400],
      ["23514", 400],
      ["P0004", 500],
    ])("maps database code %s to HTTP %i", async (code, status) => {
      const response = await respondToThrown({ code, message: "raw detail" });
      expect(response.status).toBe(status);
    });

    it("maps an unrecognized database code to 500 rather than guessing", async () => {
      const response = await respondToThrown({ code: "40001", message: "x" });
      expect(response.status).toBe(500);
    });

    it("lets a route override one code without re-implementing the table", async () => {
      const overridden = await respondToThrown(
        { code: "P0002", message: "x" },
        { errorStatus: { P0002: 400 } },
      );
      expect(overridden.status).toBe(400);

      const untouched = await respondToThrown(
        { code: "23505", message: "x" },
        { errorStatus: { P0002: 400 } },
      );
      expect(untouched.status).toBe(409);
    });

    it("returns a generic message by default and logs the real one", async () => {
      const response = await respondToThrown({
        code: "23505",
        message: "duplicate key value violates unique constraint pk_secret",
      });

      expect(await response.json()).toEqual({ error: "Conflict" });
      expect(console.error).toHaveBeenCalled();
    });

    it("forwards the underlying message only when the route opts in", async () => {
      const response = await respondToThrown(
        { code: "23514", message: "waitlist is not enabled" },
        { disclose: "the message is the user-facing explanation" },
      );

      expect(await response.json()).toEqual({
        error: "waitlist is not enabled",
      });
    });

    it("uses an ApiError's status and stable code, keeping its message for the log", async () => {
      const response = await respondToThrown(
        new ApiError("internal detail", 403, "PIN_REQUIRED"),
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "Forbidden",
        code: "PIN_REQUIRED",
      });
    });

    it("answers a generic 500 for a failure it cannot classify", async () => {
      const response = await respondToThrown(new Error("boom"));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Internal server error" });
    });

    it("honours a Response thrown by the handler as a short-circuit", async () => {
      const response = await respondToThrown(
        NextResponse.json({ error: "teapot" }, { status: 418 }),
      );

      expect(response.status).toBe(418);
    });
  });

  // -- Responses -----------------------------------------------------------

  describe("responses", () => {
    it("validates the outgoing payload when a response schema is declared", async () => {
      authenticated();
      const POST = defineRoute({
        posture: "role-gated",
        roles: "customer",
        response: z.object({ id: z.string() }),
        handler: () => ({ id: "abc" }),
      });

      const response = await POST(jsonRequest({}));
      expect(await response.json()).toEqual({ id: "abc" });
    });

    it("answers a logged 500 rather than delivering a payload that fails its schema", async () => {
      authenticated();
      // Modelled the way a real mismatch arrives: a value that entered the
      // process untyped (an RPC result, a third-party payload) and does not
      // actually match the shape the route promised.
      const fromOutside: { id: string } = JSON.parse('{"id":42}');
      const POST = defineRoute({
        posture: "role-gated",
        roles: "customer",
        response: z.object({ id: z.string() }),
        handler: () => fromOutside,
      });

      const response = await POST(jsonRequest({}));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Internal server error" });
      expect(console.error).toHaveBeenCalled();
    });

    // The response slot doubles as an allowlist: the payload sent is the
    // schema's parse output, so a field the contract never declared is dropped
    // rather than quietly delivered.
    it("sends the schema's output, dropping fields the contract does not declare", async () => {
      authenticated();
      const POST = defineRoute({
        posture: "role-gated",
        roles: "customer",
        response: z.object({ id: z.string() }),
        handler: () => ({ id: "abc", internalNote: "not for the client" }),
      });

      const response = await POST(jsonRequest({}));

      expect(await response.json()).toEqual({ id: "abc" });
    });

    it("passes a handler-built Response through untouched (redirects, raw text)", async () => {
      const GET = defineRoute({
        posture: "public",
        reason: "test",
        handler: () => new Response("challenge-token", { status: 200 }),
      });

      const response = await GET(new Request(URL_BASE));

      expect(await response.text()).toBe("challenge-token");
    });

    it("passes a redirect through untouched", async () => {
      const POST = defineRoute({
        posture: "public",
        reason: "test",
        handler: () => NextResponse.redirect("http://localhost:3000/", { status: 303 }),
      });

      const response = await POST(jsonRequest({}));

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("http://localhost:3000/");
    });

    it("answers 204 with no body when the handler returns nothing", async () => {
      const GET = defineRoute({
        posture: "public",
        reason: "test",
        handler: () => undefined,
      });

      const response = await GET(new Request(URL_BASE));

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
    });
  });
});
