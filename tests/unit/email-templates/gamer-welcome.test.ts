import { describe, it, expect, beforeAll } from "vitest";
import { buildGamerWelcomeEmail } from "@/lib/email-templates/gamer-welcome";
import {
  getEmailTranslator,
  type EmailTranslator,
} from "@/lib/email-templates/translator";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

const VERIFICATION_URL = "https://sogverse.sog.gg/verify-email?token=abc123";

/**
 * The first mail a child ever receives from us. What is pinned here is the one
 * thing the mail is not allowed to get wrong: what it promises.
 */
describe("buildGamerWelcomeEmail", () => {
  const params = { gamerFirstName: "Aino", verificationUrl: VERIFICATION_URL };

  it("greets by name and carries one button", () => {
    const html = buildGamerWelcomeEmail(t, "en", params);
    expect(html).toContain("Aino");
    expect(html).toContain("Your account is ready");
    expect(html).toContain(`href="${VERIFICATION_URL}"`);
    expect(html).toContain("<!DOCTYPE html>");
  });

  /**
   * It used to say another mail would follow with a password link in it. Nothing
   * sends that mail on its own — the child asks for it on the page the button
   * opens — so the sentence promised an inbox that stayed empty. A child waiting
   * for a mail that is not coming is a child who never gets a password.
   */
  it("promises no second email", () => {
    const html = buildGamerWelcomeEmail(t, "en", params);
    expect(html).not.toContain("one more email");
    expect(html).not.toMatch(/we will send you .{0,20}email/i);
  });

  /**
   * Dropping the promise without replacing it would leave a button that means
   * nothing in particular. The body says why it is there: signing in takes a
   * password, and confirming the address is the first half of getting one.
   */
  it("says what the button is the start of", () => {
    const html = buildGamerWelcomeEmail(t, "en", params);
    expect(html).toContain("To sign in you need a password");
    expect(html).toContain("then you can choose one");
  });

  /** The reader may not have asked for this — say so, and say nothing happens. */
  it("tells a child who did not expect it to ignore the mail", () => {
    const html = buildGamerWelcomeEmail(t, "en", params);
    expect(html).toContain("you can ignore it");
  });

  it("escapes HTML in the first name", () => {
    const html = buildGamerWelcomeEmail(t, "en", {
      ...params,
      gamerFirstName: "<script>xss</script>",
    });
    expect(html).not.toContain("<script>xss</script>");
    expect(html).toContain("&lt;script&gt;xss&lt;/script&gt;");
  });
});
