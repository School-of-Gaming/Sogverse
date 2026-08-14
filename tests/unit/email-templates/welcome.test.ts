import { describe, it, expect, beforeAll } from "vitest";
import { buildWelcomeParentEmail, buildWelcomeGeduEmail } from "@/lib/email-templates/welcome";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

const VERIFICATION_URL = "https://sogverse.sog.gg/verify-email?token=abc123";
const DASHBOARD_URL = "https://sogverse.sog.gg/parent";
const SHOP_URL = "https://sogverse.sog.gg/shop";

describe("buildWelcomeParentEmail", () => {
  const params = {
    firstName: "Marja",
    verificationUrl: VERIFICATION_URL,
    dashboardUrl: DASHBOARD_URL,
    shopUrl: SHOP_URL,
  };

  it("greets by first name and wraps in the layout", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    expect(html).toContain("Marja");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Welcome to School of Gaming");
  });

  /**
   * The brand-vs-platform rule made concrete: the reader is met with the name
   * they recognise, and Sogverse is introduced as that brand's platform rather
   * than as a second company they have somehow signed up to.
   */
  it("leads with the brand and places Sogverse as its platform", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    expect(html).toContain("Sogverse is School of Gaming’s platform");
    expect(html.indexOf("Welcome to School of Gaming")).toBeLessThan(html.indexOf("Sogverse is"));
  });

  it("lists the three first steps and links the shop one", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    expect(html).toContain("Add your gamer");
    expect(html).toContain("Browse the clubs and camps");
    expect(html).toContain("parent PIN");
    expect(html).toContain(`href="${SHOP_URL}"`);
  });

  it("puts both URLs in hrefs, with the verification button first", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    expect(html).toContain(`href="${VERIFICATION_URL}"`);
    expect(html).toContain(`href="${DASHBOARD_URL}"`);
    expect(html).toContain("Verify your email address");
    expect(html).toContain("Go to My SOG");
    expect(html.indexOf(VERIFICATION_URL)).toBeLessThan(html.indexOf(DASHBOARD_URL));
  });

  /** Verifying is optional, and the copy has to say so or it reads as a gate. */
  it("says the verification can wait", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    expect(html).toContain("later from your settings");
  });

  it("calls the dashboard My SOG, never a dashboard", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    expect(html).toContain("My SOG");
    expect(html.toLowerCase()).not.toContain("dashboard");
  });

  it("escapes HTML in the first name", () => {
    const html = buildWelcomeParentEmail(t, "en", { ...params, firstName: "<script>xss</script>" });
    expect(html).not.toContain("<script>xss</script>");
    expect(html).toContain("&lt;script&gt;xss&lt;/script&gt;");
  });
});

describe("buildWelcomeGeduEmail", () => {
  const params = {
    firstName: "Alice",
    verificationUrl: VERIFICATION_URL,
    dashboardUrl: "https://sogverse.sog.gg/gedu",
  };

  it("greets by first name and wraps in the layout", () => {
    const html = buildWelcomeGeduEmail(t, "en", params);
    expect(html).toContain("Alice");
    expect(html).toContain("<!DOCTYPE html>");
  });

  /**
   * The sentence this mail exists for. "An admin will review your account" on
   * its own reads as "you are locked out until then", so the same breath has to
   * name what certification gates and say the rest is open now.
   */
  it("says certification gates group assignment and nothing else", () => {
    const html = buildWelcomeGeduEmail(t, "en", params);
    expect(html).toContain("certify");
    expect(html).toContain("assigned to a group");
    expect(html).toContain("open to you right away");
  });

  /** The role is being renamed to Certified — the mail must not say "verified". */
  it("never calls the account verified", () => {
    const html = buildWelcomeGeduEmail(t, "en", params);
    expect(html).not.toContain("verify your account");
    expect(html).not.toContain("verified account");
  });

  it("lists the profile and game-account steps", () => {
    const html = buildWelcomeGeduEmail(t, "en", params);
    expect(html).toContain("Complete your profile");
    expect(html).toContain("Minecraft");
    expect(html).toContain("Roblox");
  });

  it("puts both URLs in hrefs", () => {
    const html = buildWelcomeGeduEmail(t, "en", params);
    expect(html).toContain(`href="${VERIFICATION_URL}"`);
    expect(html).toContain('href="https://sogverse.sog.gg/gedu"');
  });

  it("escapes HTML in the first name", () => {
    const html = buildWelcomeGeduEmail(t, "en", { ...params, firstName: "<b>A</b>" });
    expect(html).not.toContain("<b>A</b>");
    expect(html).toContain("&lt;b&gt;A&lt;/b&gt;");
  });
});
