import { beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_HOST, SITE_ORIGIN } from "../../mocks/site-origin";

/**
 * ============================================================================
 * POST /api/consent-answers — the cookie banner's anonymous tally.
 * ============================================================================
 *
 * Every outcome answers the same 204, so each case asserts on what was counted
 * — the one call to the service-role writer — never on the status alone.
 */

vi.mock("next/server", async (importOriginal) =>
  (await import("../../mocks/next-after")).nextServerWithImmediateAfter(
    importOriginal,
  ),
);

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}));

import { POST } from "@/app/api/consent-answers/route";
import { settleAfter } from "../../mocks/next-after";

const PRODUCT_ID = "0f8b6c1e-3c2a-4d5e-9f60-7a8b9c0d1e2f";

function post(body: unknown): Request {
  return new Request(`${SITE_ORIGIN}/api/consent-answers`, {
    method: "POST",
    headers: { host: SITE_HOST, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function send(body: unknown) {
  const response = await POST(post(body));
  await settleAfter();
  return response;
}

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: null, error: null });
});

describe("POST /api/consent-answers", () => {
  it("counts an answer on a marketing page under its internal path", async () => {
    const response = await send({
      answer: "all",
      pagePath: `/fi/kauppa/${PRODUCT_ID}`,
    });

    expect(response.status).toBe(204);
    expect(mockRpc).toHaveBeenCalledExactlyOnceWith("count_consent_answer", {
      p_answer: "all",
      p_page: `/shop/${PRODUCT_ID}`,
    });
  });

  it("counts a refusal like any other answer", async () => {
    await send({ answer: "none", pagePath: "/" });

    expect(mockRpc).toHaveBeenCalledExactlyOnceWith("count_consent_answer", {
      p_answer: "none",
      p_page: "/",
    });
  });

  it.each([
    ["a private page", "/fi/parent/gamers/123"],
    ["an unknown page", "/no-such-page"],
    ["a page with a query that may not travel", "/login?redirect=/parent"],
    ["an absolute URL", "https://evil.example/shop"],
  ])("counts %s under no page", async (_label, pagePath) => {
    await send({ answer: "analytics_only", pagePath });

    expect(mockRpc).toHaveBeenCalledExactlyOnceWith("count_consent_answer", {
      p_answer: "analytics_only",
      p_page: undefined,
    });
  });

  it.each([
    ["an unknown answer", { answer: "maybe", pagePath: "/" }],
    ["no page", { answer: "all" }],
    ["an empty page", { answer: "all", pagePath: "" }],
    ["a body that is not JSON", "not json"],
  ])("counts nothing for %s, and still answers 204", async (_label, body) => {
    const response = await send(body);

    expect(response.status).toBe(204);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("answers 204 when the count cannot be written", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: { message: "down" } });

    const response = await send({ answer: "marketing_only", pagePath: "/" });

    expect(response.status).toBe(204);
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
