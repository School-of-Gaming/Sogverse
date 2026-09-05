import { describe, it, expect, beforeAll } from "vitest";
import { buildWelcomeParentEmail, buildWelcomeGeduEmail } from "@/lib/email-templates/welcome";
import { BRAND, DARK_THEME } from "@/lib/constants/colors";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

const VERIFICATION_URL = "https://sogverse.sog.gg/verify-email?token=abc123";
const DASHBOARD_URL = "https://sogverse.sog.gg/parent";
const SHOP_URL = "https://sogverse.sog.gg/shop";
const SETTINGS_URL = "https://sogverse.sog.gg/settings";

/**
 * The mail's html with every URL-bearing attribute value emptied, lowercased —
 * what is left is the words a reader actually meets. A vocabulary rule ("never
 * say dashboard") is a claim about those words and about nothing else; asserting
 * it over the raw html silently makes it a claim about our own route names too,
 * which would fail the day a My SOG path is spelled with the forbidden word.
 */
function renderedCopy(html: string): string {
  return html.replace(/(href|src)="[^"]*"/gi, '$1=""').toLowerCase();
}

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
   * Three destinations, one ask. The shop and My SOG are alternatives to each
   * other, so they sit side by side as outlined buttons; verification is the
   * action the mail exists for, so it takes the row below on its own and is the
   * only filled one.
   */
  it("carries three buttons", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    expect(html).toContain(`href="${VERIFICATION_URL}"`);
    expect(html).toContain(`href="${SHOP_URL}"`);
    expect(html).toContain(`href="${DASHBOARD_URL}"`);
    expect(html).toContain("Verify your email address");
    expect(html).toContain("Browse the shop");
    expect(html).toContain("Go to My SOG");
  });

  /**
   * The layout claim, asserted through the one bit of markup that carries it:
   * a fixed two-cell split — email clients don't reflow columns, so the halves
   * are hardcoded — with the shop in the left cell, My SOG in the right, and
   * verification after both.
   */
  it("pairs the shop and My SOG in one two-column row, with verification below", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    const halfCells = [...html.matchAll(/width="50%"/g)].map((match) => match.index);
    expect(halfCells).toHaveLength(2);
    const [leftCell, rightCell] = halfCells;
    expect(html.indexOf(SHOP_URL)).toBeGreaterThan(leftCell);
    expect(html.indexOf(SHOP_URL)).toBeLessThan(rightCell);
    expect(html.indexOf(DASHBOARD_URL)).toBeGreaterThan(rightCell);
    expect(html.indexOf(VERIFICATION_URL)).toBeGreaterThan(html.indexOf(DASHBOARD_URL));
  });

  /**
   * The outlined buttons' labels carry no class, and that is the fix rather
   * than an omission. They used to carry a `background-clip:text` pin, which is
   * what broke them: the pin restates a text colour as a background colour, and
   * a client's dark theme darkens light backgrounds — so protecting `#ededed`
   * fed it to the one pass that exists to darken `#ededed`. Measured on Gmail
   * Android against the shipping markup; a class reappearing here is that bug
   * coming back.
   */
  it("leaves the outlined buttons' light labels unpinned", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    const outlinedAnchors = [...html.matchAll(/<td width="50%"[^>]*>\s*<a ([^>]*)>/g)].map(
      (match) => match[1],
    );
    expect(outlinedAnchors).toHaveLength(2);
    for (const attrs of outlinedAnchors) {
      expect(attrs).toContain(`color:${DARK_THEME.foreground}`);
      expect(attrs).not.toContain("class=");
    }
    expect(html).not.toContain("cta-on-card");
  });

  /**
   * The dark label keeps its pin, and the asymmetry is the point: `#121212` is
   * dark enough that a dark theme leaves it alone as a background, so the same
   * mechanism that destroys the light label carries this one intact. It fixed a
   * real fault — the label used to arrive white in one inbox and black in the
   * next — so removing it would undo that.
   */
  it("keeps the pin on the filled button's dark label", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    expect(html).toContain('class="cta-on-brand"');
    expect(html).toContain("u + .body .cta-on-brand");
    expect(html).toContain(
      `background-color:${BRAND.act};background-image:linear-gradient(${BRAND.act},${BRAND.act})`,
    );
  });

  /**
   * Both surfaces still declare a fill twice. Unproven as a fix on its own, but
   * it is half of the configuration that measured clean (the check's V2), so it
   * stays until something measures it away.
   */
  it("declares every button fill as a colour and a flat gradient", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    const outlined = [...html.matchAll(/<td width="50%"[^>]*style="([^"]*)"/g)].map(
      (match) => match[1],
    );
    expect(outlined).toHaveLength(2);
    for (const style of outlined) {
      expect(style).toContain(`background-color:${DARK_THEME.card}`);
      expect(style).toContain(
        `background-image:linear-gradient(${DARK_THEME.card},${DARK_THEME.card})`,
      );
    }
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

  /**
   * The rule is about *copy*: nothing the reader sees may call it a dashboard.
   * Asserted against the html with every href value blanked, because the URLs
   * are not copy — this fixture's My SOG link happens to be `/parent`, and a
   * real one at `/dashboard` would otherwise fail this test for a reason that
   * has nothing to do with what the mail says.
   */
  it("calls the dashboard My SOG, never a dashboard", () => {
    const html = buildWelcomeParentEmail(t, "en", params);
    expect(html).toContain("My SOG");
    expect(renderedCopy(html)).not.toContain("dashboard");
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

  /** Two buttons and no pair to balance, so they stack — no two-column row. */
  it("stacks its buttons", () => {
    const html = buildWelcomeGeduEmail(t, "en", params);
    expect(html).not.toContain('width="50%"');
  });

  it("escapes HTML in the first name", () => {
    const html = buildWelcomeGeduEmail(t, "en", { ...params, firstName: "<b>A</b>" });
    expect(html).not.toContain("<b>A</b>");
    expect(html).toContain("&lt;b&gt;A&lt;/b&gt;");
  });
});
