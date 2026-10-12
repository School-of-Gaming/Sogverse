import { describe, it, expect } from "vitest";
import {
  bulletList,
  calloutPanel,
  factList,
  hairlineRule,
  inlineBold,
  numberedList,
  MARKUP_TAGS,
} from "@/lib/email-templates/blocks";
import { styledName, styledProductName } from "@/lib/email-templates/utils";
import { MAIL_SPACE, mailText } from "@/lib/email-templates/type-scale";
import { MARKDOWN_LOOK } from "@/lib/authored-markdown";
import { DARK_THEME } from "@/lib/constants/colors";

// The house-style sweep asserts on *mails*, so a block nothing sends yet has
// nowhere else to be checked. These are the properties a caller relies on and
// the rendered-output sweep cannot see.

describe("numberedList", () => {
  it("emits an ordered list of the items it was given", () => {
    const html = numberedList(["First.", "Second."]);

    expect(html).toContain("<ol");
    expect(html).toContain("</ol>");
    expect(html).toContain("<li");
    expect(html).toContain("First.");
    expect(html).toContain("Second.");
  });

  it("is bulletList with a different marker, down to the styling", () => {
    // One construct, two markers. A mail carrying both must not space them
    // differently, and the way to hold that is to assert the two strings are
    // the same everywhere but the tag.
    const items = ["One.", "Two."];
    expect(numberedList(items)).toBe(
      bulletList(items).replace(/<(\/?)ul/g, "<$1ol"),
    );
  });

  it("splices composed HTML through untouched", () => {
    // Same contract as bulletList: items arrive already composed and already
    // escaped, so the block escapes nothing and a caller's own bold survives.
    expect(numberedList([inlineBold("Do this")])).toContain(
      inlineBold("Do this"),
    );
  });
});

describe("bulletList", () => {
  it("indents with a margin, which Outlook's Word engine honours on a list", () => {
    const html = bulletList(["One.", "Two."]);
    const listStyle = /<ul style="([^"]*)"/.exec(html)?.[1] ?? "";

    expect(listStyle).toContain(
      `margin:0 0 ${MAIL_SPACE.block}px ${MARKDOWN_LOOK.ul.indent}px;`,
    );
    expect(listStyle).toContain("padding:0;");
    expect(listStyle).not.toContain("padding-left");
  });

  it("spaces items by markdown's item gap, and leaves nothing under the last", () => {
    const gaps = [...bulletList(["One.", "Two.", "Three."]).matchAll(/<li style="margin:0 0 (\d+)px;">/g)].map(
      (m) => Number(m[1]),
    );
    expect(gaps).toEqual([MARKDOWN_LOOK.ul.itemGap, MARKDOWN_LOOK.ul.itemGap, 0]);
  });
});

describe("hairlineRule", () => {
  it("states the furniture step on both sides of itself", () => {
    expect(hairlineRule()).toContain(`style="margin:${MAIL_SPACE.furniture}px 0;"`);
  });
});

describe("factList", () => {
  it("sets its labels small and muted, in sentence case", () => {
    const html = factList([["Group", "Kettukallio"]]);
    expect(html).toContain(mailText("small", DARK_THEME.mutedFg));
    expect(html).not.toContain("text-transform");
    expect(html).not.toContain("letter-spacing");
  });

  it("states the furniture step on both sides of itself", () => {
    expect(factList([["Group", "Kettukallio"]])).toContain(
      `style="margin:${MAIL_SPACE.furniture}px 0;border-top:`,
    );
  });

  /**
   * A lead-in is part of the furniture it introduces: the step goes above the
   * pair, and the lead-in sits the tight step above the first rule rather than
   * being pushed the whole furniture step off it by the list's own margin.
   */
  it("takes a lead-in inside the furniture step, the tight step above the rows", () => {
    const html = factList([["Group", "Kettukallio"]], { leadIn: "Your booking" });
    expect(html.trimStart().startsWith(`<div style="margin:${MAIL_SPACE.furniture}px 0;">`)).toBe(
      true,
    );
    expect(html).toContain(`margin:0 0 ${MAIL_SPACE.tight}px;`);
    expect(html).toContain('style="margin:0;border-top:');
    expect(html.indexOf("Your booking")).toBeLessThan(html.indexOf("Kettukallio"));
  });
});

describe("calloutPanel", () => {
  const options = { label: "Note", paragraphs: ["One sentence."] };

  it("states the furniture step on both sides of itself", () => {
    expect(calloutPanel(options)).toContain(`style="margin:${MAIL_SPACE.furniture}px 0;"`);
  });

  it("sits flush when it opens the mail", () => {
    expect(calloutPanel({ ...options, opening: true })).toContain(
      `style="margin:0 0 ${MAIL_SPACE.furniture}px;"`,
    );
  });
});

describe("styledName", () => {
  it("is bold in the body's ink, exactly like a product name", () => {
    expect(styledName("Aino")).toBe(styledProductName("Aino"));
  });
});

describe("markup tags", () => {
  it("renders a message's <b> as weight in the body's own colour", () => {
    // Weight, never colour: a client's dark theme rewrites a colour and leaves
    // a weight alone, which is the same reason styledProductName gives.
    const rendered = MARKUP_TAGS.b("the device you will play on");

    expect(rendered).toContain("<strong");
    expect(rendered).toContain(DARK_THEME.foreground);
    expect(rendered).toContain("the device you will play on");
  });
});
