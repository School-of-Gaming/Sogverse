import { describe, it, expect, beforeAll } from "vitest";
import {
  buildSessionReportEmail,
  sessionReportSubject,
} from "@/lib/email-templates/session-report";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";
import { BRAND } from "@/lib/constants/colors";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

const DASHBOARD_URL = "https://sogverse.sog.gg/parent";

const base = {
  gamerName: "Aino",
  geduName: "Marianne",
  productName: "Minecraft: Cozy Adventures",
  groupName: "Usvalaakso: Kettukallio",
  sessionDate: "Thursday, 20 August 2026",
  sessionTime: "16:30–18:00 EEST",
  reportMarkdown: "# **Lanterns over the Harbour**\n\nToday we welcomed a new member.\n\n## Next week\n\nMore building.",
  dashboardUrl: DASHBOARD_URL,
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

  it("links My SOG", () => {
    const html = buildSessionReportEmail(t, "en", base);
    expect(html).toContain(`href="${DASHBOARD_URL}"`);
    expect(html).toContain("Open My SOG");
  });

  it("keeps brand color out of the report body", () => {
    const html = buildSessionReportEmail(t, "en", base);
    // From the report's title to its last paragraph — the button below it is
    // brand-filled by design.
    const body = html.slice(html.indexOf("Lanterns over the Harbour"), html.indexOf("More building."));
    expect(body).not.toContain(BRAND.primary);
    expect(body).not.toContain(BRAND.secondary);
  });
});

describe("sessionReportSubject", () => {
  it("names the product and the session date", () => {
    expect(sessionReportSubject(t, base)).toBe(
      "Session report – Minecraft: Cozy Adventures, Thursday, 20 August 2026",
    );
  });
});
