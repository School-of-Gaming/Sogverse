import { describe, it, expect, beforeAll } from "vitest";
import { buildVerifyEmailEmail } from "@/lib/email-templates/verify-email";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

const VERIFICATION_URL = "https://sogverse.sog.gg/verify-email?token=abc123";

describe("buildVerifyEmailEmail", () => {
  const params = { firstName: "Marja", verificationUrl: VERIFICATION_URL };

  it("greets by name, states the window, and carries one button", () => {
    const html = buildVerifyEmailEmail(t, "en", params);
    expect(html).toContain("Marja");
    expect(html).toContain("Verify your email address");
    expect(html).toContain("valid for 7 days");
    expect(html).toContain(`href="${VERIFICATION_URL}"`);
    expect(html).toContain("<!DOCTYPE html>");
  });

  /** The reader may not have asked for this — say so, and say nothing changes. */
  it("tells a reader who did not ask for it to ignore the mail", () => {
    const html = buildVerifyEmailEmail(t, "en", params);
    expect(html).toContain("safely ignore this email");
    expect(html).toContain("Nothing will change");
  });

  it("escapes HTML in the first name", () => {
    const html = buildVerifyEmailEmail(t, "en", {
      ...params,
      firstName: "<script>xss</script>",
    });
    expect(html).not.toContain("<script>xss</script>");
    expect(html).toContain("&lt;script&gt;xss&lt;/script&gt;");
  });
});
