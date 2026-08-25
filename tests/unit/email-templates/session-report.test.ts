import { describe, it, expect, beforeAll } from "vitest";
import {
  buildSessionReportEmail,
  sessionReportSubject,
} from "@/lib/email-templates/session-report";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";
import { BRAND, DARK_THEME, STATUS_TINT } from "@/lib/constants/colors";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

const PRODUCT_URL = "https://sogverse.sog.gg/parent/clubs/3f9c2b7e-5d14-4a8e-9c61-0b2f7e8d4a15";

const base = {
  gamerName: "Aino",
  geduName: "Marianne",
  productName: "Minecraft: Cozy Adventures",
  groupName: "Usvalaakso: Kettukallio",
  sessionDate: "Thursday, 20 August 2026",
  sessionTime: "16:30–18:00 EEST",
  reportMarkdown: "# **Lanterns over the Harbour**\n\nToday we welcomed a new member.\n\n## Next week\n\nMore building.",
  productUrl: PRODUCT_URL,
};

describe("buildSessionReportEmail", () => {
  it("names the gamer, the gedu, the product, the group, the date and the time", () => {
    const html = buildSessionReportEmail(t, "en", base);
    for (const value of [
      "Aino",
      "Marianne",
      "Minecraft: Cozy Adventures",
      "Usvalaakso: Kettukallio",
      "Thursday, 20 August 2026",
      "16:30–18:00 EEST",
    ]) {
      expect(html).toContain(value);
    }
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("renders the report's markdown as headings and paragraphs", () => {
    const html = buildSessionReportEmail(t, "en", base);
    expect(html).toMatch(/<h1 [^>]*><strong>Lanterns over the Harbour<\/strong><\/h1>/);
    expect(html).toMatch(/<h2 [^>]*>Next week<\/h2>/);
    expect(html).toContain("Today we welcomed a new member.");
  });

  it("strips a link in the report down to its label", () => {
    const html = buildSessionReportEmail(t, "en", {
      ...base,
      reportMarkdown: "Read [the wiki](https://evil.example/page) first.",
    });
    expect(html).toContain("Read the wiki first.");
    expect(html).not.toContain("evil.example");
    // The only anchor in the mail is the My SOG button.
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("escapes HTML typed into the report", () => {
    const html = buildSessionReportEmail(t, "en", {
      ...base,
      reportMarkdown: "Tricky <img src=x onerror=alert(1)> text & more",
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).toContain("text &amp; more");
  });

  it("escapes the facts the caller passes in", () => {
    const html = buildSessionReportEmail(t, "en", { ...base, groupName: "A <b>&</b> B" });
    expect(html).toContain("A &lt;b&gt;&amp;&lt;/b&gt; B");
  });

  it("links the product's page in My SOG, where the reports live", () => {
    const html = buildSessionReportEmail(t, "en", base);
    expect(html).toContain(`href="${PRODUCT_URL}"`);
    expect(html).toContain("View in My SOG");
    expect(html).toContain("the earlier ones and the upcoming sessions");
  });

  /**
   * Gmail flips a button label's colour by luminance and theme; the label
   * carries a class the layout pins to one colour through the Gmail-only
   * background-clip rule. Both halves have to be present for it to work.
   */
  it("pins the button label's colour against Gmail's theme rewriting", () => {
    const html = buildSessionReportEmail(t, "en", base);
    expect(html).toMatch(/<a href="[^"]+" target="_blank" class="cta-on-brand"/);
    expect(html).toContain("u + .body .cta-on-brand");
  });

  it("keeps brand color out of the report body", () => {
    const html = buildSessionReportEmail(t, "en", base);
    // From the report's title to its last paragraph — the button below it is
    // brand-filled by design. Both ends must be found, or the slice is empty
    // and the assertion below passes on nothing.
    const from = html.indexOf("Lanterns over the Harbour");
    const to = html.indexOf("More building.");
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from);
    const body = html.slice(from, to);
    expect(body).not.toContain(BRAND.primary);
    expect(body).not.toContain(BRAND.secondary);
  });
});

/**
 * The staff copy is the same mail with one thing added, and both halves of that
 * matter: the banner has to be there when the copy is asked for, and it has to
 * be absent from every family mail — a parent reading "this is a copy that went
 * to the group's families" would be worse than the confusion the banner exists
 * to end.
 */
describe("the staff copy's banner", () => {
  const LABEL = "Staff copy";
  const IS_A_COPY = "This is a copy of the session report that went to the group";
  const PRIVACY = "Every family received their own separate email";

  it("opens the staff copy by saying what it is and what the families got", () => {
    const html = buildSessionReportEmail(t, "en", { ...base, staffCopy: true });

    expect(html).toContain(LABEL);
    expect(html).toContain(IS_A_COPY);
    expect(html).toContain(PRIVACY);
  });

  it("says all of it above the intro, where the reader's alarm already is", () => {
    const html = buildSessionReportEmail(t, "en", { ...base, staffCopy: true });

    // The gedu's name is in the intro sentence and nowhere else in the mail.
    const intro = html.indexOf("Marianne");
    expect(intro).toBeGreaterThan(0);
    expect(html.indexOf(LABEL)).toBeLessThan(intro);
    expect(html.indexOf(PRIVACY)).toBeLessThan(intro);
  });

  it("is absent from the mail a family receives", () => {
    for (const html of [
      buildSessionReportEmail(t, "en", base),
      buildSessionReportEmail(t, "en", { ...base, staffCopy: false }),
    ]) {
      expect(html).not.toContain(LABEL);
      expect(html).not.toContain(IS_A_COPY);
      expect(html).not.toContain(PRIVACY);
    }
  });

  /**
   * The flag's default is the family mail: an absent `staffCopy` and an explicit
   * `false` produce the identical document, byte for byte. That is what this
   * pins — two renders of the current builder against each other, not this
   * builder against the one that predated the flag, which no assertion here can
   * reach.
   */
  it("renders the same family mail whether the flag is absent or false", () => {
    expect(buildSessionReportEmail(t, "en", { ...base, staffCopy: false })).toBe(
      buildSessionReportEmail(t, "en", base),
    );
  });

  /**
   * The banner is the app's `Alert` in its `info` variant, not a treatment of
   * its own: a washed info surface inside a full info border. It carried a 3px
   * brand-orange rule down one edge before that, which is a shape the app has
   * nowhere and which read as a warning — so the brand colours are asserted
   * *absent* here, not merely relocated.
   */
  it("takes its prominence from the info border and wash, not from coloured text", () => {
    const html = buildSessionReportEmail(t, "en", { ...base, staffCopy: true });
    // The banner's own cell, from its opening tag to its close, so nothing the
    // shell around it emits can satisfy or break these.
    const start = html.lastIndexOf("<td ", html.indexOf(LABEL));
    const banner = html.slice(start, html.indexOf("</td>", start));

    // The Alert's full 1px border, in the info colour flattened out of alpha.
    expect(banner).toContain(`border:1px solid ${STATUS_TINT.infoBorder}`);
    expect(banner).not.toContain("border-left:");
    // The wash, declared twice so Gmail's dark theme leaves the fill alone.
    expect(banner).toContain(
      `background-color:${STATUS_TINT.infoSurface};background-image:linear-gradient(${STATUS_TINT.infoSurface},${STATUS_TINT.infoSurface})`,
    );
    // No brand colour anywhere in it: the accent moved, it did not move over.
    expect(banner).not.toContain(BRAND.primary);
    expect(banner).not.toContain(BRAND.secondary);
    // Every colour the banner's own text carries is the body's — the app's
    // Alert tints its title with the accent, and at this size that pairing is
    // below AA (`palette-contrast.test.ts` pins it as rejected).
    for (const color of banner.matchAll(/<p style="[^"]*color:(#[0-9a-fA-F]{6})/g)) {
      expect(color[1]).toBe(DARK_THEME.foreground);
    }
  });
});

describe("sessionReportSubject", () => {
  it("names the product and the session date", () => {
    expect(sessionReportSubject(t, base)).toBe(
      "Session report – Minecraft: Cozy Adventures, Thursday, 20 August 2026",
    );
  });
});
