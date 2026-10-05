import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { Field } from "@/components/ui/field";
import { InlineCode } from "@/components/ui/inline-code";

/**
 * **A field points its control at a hint only when there is one.** The hint may
 * be rich text, so "no hint" is every empty value a caller can hand over, not
 * just a missing prop: a control described by an empty paragraph announces
 * nothing and still claims to.
 */

function renderField(hint: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Field label="Discord" htmlFor="f" hint={hint}>
        {({ hintId }) => <input id="f" aria-describedby={hintId} />}
      </Field>
    </NextIntlClientProvider>,
  );
}

describe("Field's hint", () => {
  it.each([
    ["absent", undefined],
    ["null", null],
    ["false", false],
    ["an empty string", ""],
  ])("is no hint when %s", (_, hint) => {
    const { container } = renderField(hint);

    expect(screen.getByLabelText("Discord").hasAttribute("aria-describedby")).toBe(false);
    expect(container.querySelector("p")).toBeNull();
  });

  it("describes the control with rich text, inline code included", () => {
    renderField(
      <>
        Type <InlineCode>/link</InlineCode> in Discord.
      </>,
    );

    const id = screen.getByLabelText("Discord").getAttribute("aria-describedby");
    const hint = document.getElementById(id ?? "");
    expect(hint?.textContent).toBe("Type /link in Discord.");
    expect(hint?.querySelector("code")?.textContent).toBe("/link");
  });
});
