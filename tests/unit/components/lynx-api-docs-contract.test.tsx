import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/../messages/en.json";
import LynxApiDocsPage from "@/app/[locale]/(public)/docs/lynx-api/page";
import { PRODUCT_STATUS } from "@/services/partner/partner.contracts";

/**
 * The published page is the partner's contract and the wire schema is what the
 * routes enforce, so the two stating different product states is a defect the
 * partner finds before we do — a state the page names and `?status=` refuses,
 * or one the API answers with and the page never mentions.
 *
 * The page derives the row from the same tuple the schema is built on, and this
 * is what holds it there: restating the states in the markup, in either
 * direction, fails here.
 */
describe("the Lynx API documentation page and the wire contract", () => {
  function renderPage() {
    return render(
      <NextIntlClientProvider locale="en" messages={en}>
        <LynxApiDocsPage />
      </NextIntlClientProvider>,
    );
  }

  /** A resource section's parameter table is the first of its two tables. */
  function paramType(container: HTMLElement, resource: string, name: string) {
    const section = container.querySelector(`#${resource}`);
    expect(section, `the ${resource} section is on the page`).not.toBeNull();
    const params = section?.querySelector("table");
    const row = [...(params?.querySelectorAll("tbody tr") ?? [])].find(
      (candidate) => candidate.querySelector("th")?.textContent === name,
    );
    expect(row, `the ${name} row is in the ${resource} parameters`).toBeDefined();
    return row?.querySelector("td")?.textContent;
  }

  it("documents exactly the product states the schema publishes", () => {
    const { container } = renderPage();

    expect(paramType(container, "products", "status")).toBe(
      PRODUCT_STATUS.join(" | "),
    );
  });

  it("names three product states, so neither side has quietly widened", () => {
    // Deliberately duplicated rather than derived: the check above proves the
    // page and the schema agree, and this one is what makes a fourth state a
    // decision somebody takes here rather than one a migration takes for them.
    expect([...PRODUCT_STATUS]).toEqual(["pending", "running", "completed"]);
  });
});
