import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  StatusLine,
} from "@/components/ui/alert";

/**
 * The alert is where the app decides what a status looks like, so these are the
 * rules of that construct rather than a restatement of its class string.
 *
 * A status colour is a **figure**: it reaches the reader as the edge, the glyph
 * and, when the title names a state, as that label — never as a ground behind a
 * paragraph. So each variant is asserted several ways at once: no tinted
 * ground, an edge in the status's own hue, a coloured glyph, and a body that
 * stays in ink. A variant that quietly gained a wash, or lost the edge that is
 * now the only thing bringing the eye to it, would pass a class-string test and
 * fail this one.
 */
const STATUSES = [
  { variant: "destructive", ink: "text-destructive" },
  { variant: "success", ink: "text-success" },
  { variant: "info", ink: "text-info" },
  { variant: "warning", ink: "text-warning" },
] as const;

/** Every class token on the element and everything inside it. */
function classTokens(element: Element): Set<string> {
  const tokens = new Set<string>();
  for (const node of [element, ...element.querySelectorAll("*")]) {
    for (const token of (node.getAttribute("class") ?? "").split(/\s+/)) {
      if (token) tokens.add(token);
    }
  }
  return tokens;
}

describe("Alert", () => {
  it.each(STATUSES)(
    "$variant sits on the ground it is already on",
    ({ variant }) => {
      const { container } = render(
        <Alert variant={variant}>
          <AlertDescription>Something to say.</AlertDescription>
        </Alert>,
      );

      const panel = container.querySelector('[role="alert"]');
      expect(panel).not.toBeNull();
      // No fill of its own, and above all no tint of the status: a status hue
      // exists at the value it is authored at or not at all.
      for (const token of panel?.getAttribute("class")?.split(/\s+/) ?? []) {
        expect(token.startsWith("bg-")).toBe(false);
      }
    },
  );

  it.each(STATUSES)(
    "$variant is drawn by an edge in its own hue",
    ({ variant }) => {
      const { container } = render(
        <Alert variant={variant}>
          <AlertDescription>Something to say.</AlertDescription>
        </Alert>,
      );

      // The edge is named by the variant rather than by a colour this test
      // knows: a variant renamed or retuned in the library moves it, and a
      // variant that fell back to the neutral edge is the failure.
      const classes = container
        .querySelector('[role="alert"]')
        ?.getAttribute("class");
      expect(classes).toContain(`border-${variant}`);
      expect(classes).not.toContain("border-border");
    },
  );

  it.each(STATUSES)("$variant carries its glyph, in its hue", ({ variant, ink }) => {
    const { container } = render(
      <Alert variant={variant}>
        <AlertDescription>Something to say.</AlertDescription>
      </Alert>,
    );

    // The glyph is the alert's own, not the caller's: an alert that says
    // nothing about which status it is has stopped saying it is one.
    const glyph = container.querySelector('[role="alert"] > svg');
    expect(glyph).not.toBeNull();
    expect(glyph?.getAttribute("class")).toContain(ink);
  });

  it.each(STATUSES)("$variant reads its body in ink", ({ variant, ink }) => {
    const { getByText } = render(
      <Alert variant={variant}>
        <AlertDescription>Something to say.</AlertDescription>
      </Alert>,
    );

    const body = getByText("Something to say.");
    expect(body.className).toContain("text-muted-foreground");
    expect(body.className).not.toContain(ink);
  });

  it.each(STATUSES)(
    "$variant colours a title that is a label, and not one that is a sentence",
    ({ variant, ink }) => {
      const { getByText } = render(
        <Alert variant={variant}>
          <div>
            <AlertTitle>Payment failed</AlertTitle>
            <AlertDescription>Something to say.</AlertDescription>
          </div>
        </Alert>,
      );

      expect(getByText("Payment failed").className).toContain(ink);

      const sentence = render(
        <Alert variant={variant}>
          <div>
            <AlertTitle sentence>This is a parent account</AlertTitle>
          </div>
        </Alert>,
      );
      const title = sentence.getByText("This is a parent account");
      expect(title.className).toContain("text-foreground");
      expect(title.className).not.toContain(ink);
    },
  );

  it("keeps the neutral default lifted, and gives it no status glyph", () => {
    const { container } = render(
      <Alert>
        <AlertDescription>Something to say.</AlertDescription>
      </Alert>,
    );

    const panel = container.querySelector('[role="alert"]');
    expect(panel).not.toBeNull();
    if (panel === null) return;
    expect(panel.getAttribute("class")).toContain("bg-lifted");
    expect(panel.querySelector(":scope > svg")).toBeNull();
    expect(classTokens(panel)).not.toContain("text-info");
  });
});

describe("StatusLine", () => {
  it.each(STATUSES)(
    "$variant says its sentence in ink beside a mark in its hue",
    ({ variant, ink }) => {
      const { container, getByText } = render(
        <StatusLine status={variant}>Could not save this change.</StatusLine>,
      );

      const glyph = container.querySelector("svg");
      expect(glyph?.getAttribute("class")).toContain(ink);
      expect(getByText("Could not save this change.").parentElement?.className)
        .toContain("text-foreground");
    },
  );
});
