import { describe, it, expect, vi, afterEach } from "vitest";
import { z } from "zod";

import {
  PartnerQueryError,
  partnerError,
  partnerJson,
  partnerRead,
} from "@/lib/api/partner-auth.server";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("partnerError", () => {
  it.each([
    ["unauthorized", 401],
    ["server_misconfigured", 500],
    ["invalid_query", 400],
    ["not_found", 404],
    ["internal_error", 500],
  ] as const)("answers %s with %i in the envelope, uncacheable", async (code, status) => {
    const response = partnerError(code, "why");
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: { code, message: "why" } });
  });
});

describe("partnerRead", () => {
  it("passes a body's own response through untouched", async () => {
    const response = await partnerRead("test", () =>
      Promise.resolve(partnerJson({ data: [], next_cursor: null })),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [], next_cursor: null });
  });

  it("turns a PartnerQueryError into invalid_query carrying its message", async () => {
    const response = await partnerRead("test", () =>
      Promise.reject(new PartnerQueryError("cursor: is not a cursor this API issued")),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "invalid_query", message: "cursor: is not a cursor this API issued" },
    });
  });

  it("turns any other throw into internal_error, logged and not echoed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error('relation "public.secret_table" does not exist');
    const response = await partnerRead("products", () => Promise.reject(failure));

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.error.code).toBe("internal_error");
    expect(body.error.message).not.toContain("secret_table");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("products"), failure);
  });

  it("answers internal_error, not HTML, when an answer fails its own contract", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await partnerRead("products", async () =>
      partnerJson(z.object({ id: z.string().uuid() }).parse({ id: "nope" })),
    );
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("internal_error");
  });
});
