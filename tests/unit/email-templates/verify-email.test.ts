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

  it("greets by name and carries one button", () => {
    const html = buildVerifyEmailEmail(t, "en", params);
    expect(html).toContain("Marja");
    expect(html).toContain("Verify your email address");
    expect(html).toContain(`href="${VERIFICATION_URL}"`);
    expect(html).toContain("<!DOCTYPE html>");
  });

  /**
   * The link does not expire — it stays good until the address it verifies
   * changes — so the mail states no window. A password reset says "one hour"
   * because an hour is true of it; a deadline invented here would teach a reader
   * to hurry, and to distrust a link that still works a fortnight later.
   */
  it("states no expiry window", () => {
    const html = buildVerifyEmailEmail(t, "en", params);
    expect(html).not.toContain("valid for");
    expect(html).not.toContain("expire");
    expect(html).not.toContain("7 days");
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
