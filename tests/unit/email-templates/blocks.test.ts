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
import {
  ctaButton,
  ctaButtonRow,
  inlineLink,
} from "@/lib/email-templates/blocks";
import { MAIL_SPACE, mailText } from "@/lib/email-templates/type-scale";
import {
  HOLD_CLASS,
  TEXT_PINS,
  holdInline,
  holdRuns,
  holdText,
  paragraph,
} from "@/lib/email-templates/utils";
import { MARKDOWN_LOOK } from "@/lib/authored-markdown";
import { BRAND, DARK_THEME, STATUS } from "@/lib/constants/colors";
import { unhold } from "../../helpers/email-holds";

const HOLD_OPEN = `<div class="${HOLD_CLASS.screen}"><div class="${HOLD_CLASS.difference}">`;

describe("holding plain neutrals for Gmail iOS", () => {
  it("holds a plain paragraph whole", () => {
    expect(paragraph("Plain words.").startsWith(HOLD_OPEN)).toBe(true);
  });

  /**
   * A link is pinned amber, which Gmail iOS leaves alone — so a hold around it
   * would invert it to blue. The sentence is held run by run instead.
   */
  it("holds a sentence around its link, never the link itself", () => {
    const link = inlineLink("https://sog.gg/settings", "your settings");
    const html = paragraph(`Change it later in ${link}.`);
    expect(html.startsWith("<p")).toBe(true);
    expect(html).toContain(`<span class="${HOLD_CLASS.screen}"><span class="${HOLD_CLASS.difference}">Change it later in </span></span>${link}`);
    expect(html).toContain(`${link}<span class="${HOLD_CLASS.screen}"><span class="${HOLD_CLASS.difference}">.</span></span>`);
  });

  it("pins every inline link, underline included", () => {
    const link = inlineLink("https://sog.gg/settings", "your settings");
    expect(link).toContain(`class="${TEXT_PINS.act.className}"`);
    expect(link).toContain(`text-decoration-color:${BRAND.act};`);
  });

  it("leaves an already-held block alone when it holds the runs around it", () => {
    const nested = bulletList(["A mouse."]);
    const item = holdRuns(`Check the device${nested}`);
    expect(item.split(HOLD_OPEN)).toHaveLength(2);
    expect(item).toContain(nested);
  });

  it("leaves an already-held inline run alone rather than holding it twice", () => {
    const held = holdInline("already held");
    const html = paragraph(`Before ${held} after.`);
    expect(html.startsWith("<p")).toBe(true);
    expect(html.split(`class="${HOLD_CLASS.screen}"`)).toHaveLength(4);
    expect(html).toContain(`</span></span>${held}<span class="${HOLD_CLASS.screen}">`);
    expect(holdText((inner) => `<p>${inner}</p>`, held)).toBe(`<p>${held}</p>`);
  });

  it("refuses to hold a run that opens an element it does not close", () => {
    const link = inlineLink("https://sog.gg/settings", "your settings");
    expect(() => holdRuns(`<b>Change it in ${link}</b>`)).toThrow(/unbalanced/);
  });

  /**
   * A list element's own markers cannot be held without holding the link, and
   * in plain ink Gmail iOS turns them to the ground — so a list carrying a link
   * writes its markers out, each held in a cell of its own.
   */
  it("draws a link-bearing list's numbers held in their own cells, the link outside every hold", () => {
    const link = inlineLink("https://sog.gg/settings", "Open your settings");
    const html = numberedList([`Make an account. ${link}`, "Then sign in."]);
    expect(html.startsWith("<table")).toBe(true);
    expect(html).not.toContain("<ol");
    // The marker column is the list's indent, so the text lines up with a plain list's.
    const markerCell = `<td valign="top" width="${MARKDOWN_LOOK.ol.indent}" style="width:${MARKDOWN_LOOK.ol.indent}px;`;
    expect(html.split(markerCell)).toHaveLength(3);
    for (const marker of ["1.", "2."]) {
      expect(html).toContain(`">${HOLD_OPEN}${marker}</div></div></td>`);
    }
    // The link ends its cell straight after the run hold before it closes.
    expect(html).toContain(`${holdInline("Make an account. ")}${link}</td>`);
    expect(html).toContain(`">${holdInline("Then sign in.")}</td>`);
  });

  it("writes a bullet for a link-bearing bulleted list", () => {
    const link = inlineLink("https://sog.gg/settings", "settings");
    const html = bulletList([`See ${link}.`, "Plain."]);
    expect(html.split(`${HOLD_OPEN}&bull;</div></div>`)).toHaveLength(3);
  });

  it("keeps a list of plain items a real list, held whole", () => {
    const html = numberedList(["First.", "Second."]);
    expect(html.startsWith(`${HOLD_OPEN}<ol`)).toBe(true);
    expect(html).not.toContain("<table");
  });

  it("spaces a marker-column list's rows by the item gap and sets it at the block margin", () => {
    const link = inlineLink("https://sog.gg/settings", "settings");
    const html = numberedList([`One ${link}`, "Two", "Three"]);
    expect(html).toContain(`style="margin:0 0 ${MAIL_SPACE.block}px;"`);
    const gaps = [...html.matchAll(/<td valign="top" style="padding:0 0 (\d+)px;/g)].map((m) =>
      Number(m[1]),
    );
    expect(gaps).toEqual([MAIL_SPACE.item, MAIL_SPACE.item, 0]);
  });
});

describe("buttons", () => {
  /**
   * A fill inside a hold is screened lighter on every Gmail, so the outlined
   * button draws none: it is held whole, border and label.
   */
  it("draws the outlined button with no fill, held whole", () => {
    const html = ctaButton({ href: "https://sog.gg/parent", label: "Go to My SOG", variant: "outline" });
    expect(html).not.toContain("background-color");
    expect(html).not.toContain("ground-match");
    expect(html).toContain(HOLD_OPEN);
  });

  it("holds the violet button's white label and leaves its fill outside", () => {
    const html = ctaButton({ href: "https://sog.gg/shop", label: "Browse", variant: "secondary" });
    expect(html).not.toContain(HOLD_OPEN);
    expect(html).toMatch(/<a [^>]*><span class="bs" style="display:inline-block;"><span class="bd" style="display:inline-block;">Browse<\/span><\/span><\/a>/);
  });

  it("pins the primary label and holds nothing on it", () => {
    const html = ctaButton({ href: "https://sog.gg/verify", label: "Verify" });
    expect(html).toContain(`class="${TEXT_PINS.dark.className}"`);
    expect(html).not.toContain(`class="${HOLD_CLASS.screen}"`);
  });

  it("keeps a violet half's fill out of the hold around its outlined neighbour", () => {
    const html = ctaButtonRow(
      { href: "https://sog.gg/a", label: "No", variant: "outline" },
      { href: "https://sog.gg/b", label: "Yes", variant: "secondary" },
    );
    const held = html.slice(html.indexOf(HOLD_OPEN), html.indexOf("</td>", html.indexOf(HOLD_OPEN)));
    expect(held).not.toContain(BRAND.world);
    expect(html).toContain(`background-color:${BRAND.world}`);
  });
});

describe("a framed box draws its edge as a fill", () => {
  it("paints the callout's status edge as a pinned fill, and pins its label", () => {
    const html = calloutPanel({ label: "Note", paragraphs: ["One sentence."] });
    expect(html).not.toMatch(/border:1px solid/);
    expect(html).toContain(`background-color:${STATUS.info};background-image:linear-gradient(${STATUS.info},${STATUS.info});`);
    expect(html).toContain(`class="${TEXT_PINS.info.className}"`);
    expect(html).toContain(HOLD_OPEN);
  });
});

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
    expect(gaps).toEqual([MAIL_SPACE.item, MAIL_SPACE.item, 0]);
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

  it("sets both cells of a row on the baseline, as an attribute and as CSS", () => {
    // Outlook's Word engine may ignore the CSS, and a cell with no `valign`
    // defaults to middle there.
    const html = factList([["Group", "Kettukallio"]]);
    expect(html.match(/<td valign="baseline" style="[^"]*vertical-align:baseline;"/g)).toHaveLength(2);
  });

  /**
   * A lead-in is part of the furniture it introduces: the step goes above the
   * pair, and the lead-in sits the tight step above the first rule rather than
   * being pushed the whole furniture step off it by the list's own margin.
   */
  it("takes a lead-in inside the furniture step, the tight step above the rows", () => {
    const html = factList([["Group", "Kettukallio"]], { leadIn: "Your booking" });
    expect(unhold(html).trimStart().startsWith(`<div style="margin:${MAIL_SPACE.furniture}px 0;">`)).toBe(
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
    expect(calloutPanel(options)).toContain(`style="margin:${MAIL_SPACE.furniture}px 0;background-color:`);
  });

  it("sits flush when it opens the mail", () => {
    expect(calloutPanel({ ...options, opening: true })).toContain(
      `style="margin:0 0 ${MAIL_SPACE.furniture}px;background-color:`,
    );
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
