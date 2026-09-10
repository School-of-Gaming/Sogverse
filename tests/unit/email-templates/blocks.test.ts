import { describe, it, expect } from "vitest";
import {
  bulletList,
  inlineBold,
  numberedList,
  MARKUP_TAGS,
} from "@/lib/email-templates/blocks";
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
