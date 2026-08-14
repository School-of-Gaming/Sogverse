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
const SETTINGS_URL = "https://sogverse.sog.gg/settings";

describe("buildWelcomeParentEmail", () => {
  const params = {
    firstName: "Marja",
    verificationUrl: VERIFICATION_URL,
    dashboardUrl: DASHBOARD_URL,
    shopUrl: SHOP_URL,
    settingsUrl: SETTINGS_URL,
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

  /**
   * Registration already walked the parent through adding a gamer and choosing
   * a PIN. A welcome mail that asks for them again reads as though we lost the
   * answers, so the whole getting-started list is gone rather than trimmed.
   */
  it("does not ask again for anything registration already collected", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    expect(html).not.toContain("Add your gamer");
    expect(html.toLowerCase()).not.toContain("parent pin");
    expect(html).not.toContain("<ul");
  });

  /**
   * Three destinations, one ask. Verification is the action the mail exists for,
   * so it is the filled button and it comes first; the shop and My SOG follow as
   * outlined ones, which is what the shop used to get as an inline list item.
   */
  it("carries three buttons, verification first", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    expect(html).toContain(`href="${VERIFICATION_URL}"`);
    expect(html).toContain(`href="${SHOP_URL}"`);
    expect(html).toContain(`href="${DASHBOARD_URL}"`);
    expect(html).toContain("Verify your email address");
    expect(html).toContain("Browse the shop");
    expect(html).toContain("Go to My SOG");
    expect(html.indexOf(VERIFICATION_URL)).toBeLessThan(html.indexOf(SHOP_URL));
    expect(html.indexOf(SHOP_URL)).toBeLessThan(html.indexOf(DASHBOARD_URL));
  });

  /**
   * Verifying is optional, and the copy has to say so or it reads as a gate —
   * and the word that says where to do it later is the link, so the sentence
   * teaches the settings page without spending a fourth button on it.
   */
  it("says the verification can wait, and links settings from that sentence", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    expect(html).toContain(`<a href="${SETTINGS_URL}"`);
    expect(html).toContain(">settings</a>");
    expect(html).toContain("or later from your");
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
    settingsUrl: SETTINGS_URL,
  };

  it("greets by first name and wraps in the layout", () => {
    const html = buildWelcomeGeduEmail(t, "en", params);
    expect(html).toContain("Alice");
    expect(html).toContain("<!DOCTYPE html>");
  });

  /**
   * The sentence this mail exists for, and it owes the reader two facts: an
   * admin will certify the account, and until they do, some of the platform is
   * shut. Both have to be there — "an admin will review your account" alone
   * reads as a total lockout, and "everything else is open" alone is false.
   */
  it("says an admin will certify the account and that some of it stays locked", () => {
    const html = buildWelcomeGeduEmail(t, "en", params);
    expect(html).toContain("certify");
    expect(html).toContain("stay locked until your account is certified");
  });

  /**
   * And it owes them no third fact. Which features certification gates is a set
   * that moves with the product — the previous copy named group assignment and
   * was already wrong about voice rooms — so the sentence names nothing, and a
   * future edit that reintroduces a list fails here.
   */
  it("names nothing that certification gates", () => {
    const html = buildWelcomeGeduEmail(t, "en", params);
    expect(html).not.toContain("assigned to a group");
    expect(html).not.toContain("open to you right away");
    expect(html.toLowerCase()).not.toContain("voice");
  });

  /** The role is being renamed to Certified — the mail must not say "verified". */
  it("never calls the account verified", () => {
    const html = buildWelcomeGeduEmail(t, "en", params);
    expect(html).not.toContain("verify your account");
    expect(html).not.toContain("verified account");
  });

  /** Profile and game accounts were both collected at registration. */
  it("does not re-ask for what registration already collected", () => {
    const html = buildWelcomeGeduEmail(t, "en", params);
    expect(html).not.toContain("Complete your profile");
    expect(html).not.toContain("Roblox");
    expect(html).not.toContain("<ul");
  });

  it("puts the verification, My SOG and settings URLs in hrefs", () => {
    const html = buildWelcomeGeduEmail(t, "en", params);
    expect(html).toContain(`href="${VERIFICATION_URL}"`);
    expect(html).toContain('href="https://sogverse.sog.gg/gedu"');
    expect(html).toContain(`<a href="${SETTINGS_URL}"`);
    expect(html).toContain(">settings</a>");
  });

  it("escapes HTML in the first name", () => {
    const html = buildWelcomeGeduEmail(t, "en", { ...params, firstName: "<b>A</b>" });
    expect(html).not.toContain("<b>A</b>");
    expect(html).toContain("&lt;b&gt;A&lt;/b&gt;");
  });
});
