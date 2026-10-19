import { describe, it, expect, beforeAll } from "vitest";
import { buildHelpRequestEmail } from "@/lib/email-templates/help-request";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";
import { MAIL_SPACE } from "@/lib/email-templates/type-scale";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

const html = () =>
  buildHelpRequestEmail(t, "en", {
    userName: "Marja",
    userRole: "customer",
    userEmail: "marja@example.com",
    message: "Where do I find the session report?",
    sentAt: "12 October 2026, 14:20",
  });

describe("buildHelpRequestEmail", () => {
  /**
   * Margins never collapse across table cells. With the intro paragraph and the
   * fact list in cells of their own, the paragraph's block step and the list's
   * furniture step added up in every client; as siblings in one cell they meet
   * as the spacing rule means them to.
   */
  it("sets the heading, the intro and the fact list in one cell", () => {
    const rendered = html();
    const heading = rendered.indexOf(t("helpRequest.heading"), rendered.indexOf("<h2"));
    const intro = rendered.indexOf(t("helpRequest.intro"));
    const facts = rendered.indexOf(`style="margin:${MAIL_SPACE.furniture}px 0;border-top:`);

    expect(heading).toBeGreaterThan(-1);
    expect(intro).toBeGreaterThan(heading);
    expect(facts).toBeGreaterThan(intro);
    expect(rendered.slice(heading, facts)).not.toContain("</td>");
  });
});
