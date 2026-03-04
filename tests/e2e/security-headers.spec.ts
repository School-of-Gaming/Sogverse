import { test, expect } from "@playwright/test";

test.describe("Security Headers", () => {
  test("should include all security headers", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();

    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-xss-protection"]).toBe("1; mode=block");
    expect(headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains"
    );
    expect(headers["content-security-policy-report-only"]).toContain(
      "default-src 'self'"
    );
  });
});
