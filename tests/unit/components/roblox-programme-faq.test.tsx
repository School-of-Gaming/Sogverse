import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ProgrammeFaq } from "@/components/roblox/programme-faq";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";

/**
 * **The Programme FAQ draws its rows from the shared accordion, and everything
 * Lynx Educate signed off has to survive that.**
 *
 * The copy on this page is partner-signed-off: the questions, the order they are
 * read in, the two answers that run to a second part, and the three places where
 * a document's name is the link to it. None of that is the shared component's
 * business — the rows are its, the answers are composed here — so the seam
 * between the two is exactly where a signed-off sentence could go missing without
 * anything else on the page looking wrong.
 *
 * The order is asserted against the sequence written down here rather than
 * against the message file's key order, because a JSON object's key order is not
 * what the page renders from and lining the two up would only prove they agree
 * today.
 */

/** The signed-off order, restated independently of the component's own array. */
const SIGNED_OFF_ORDER = [
  "programme",
  "eligibility",
  "cost",
  "experience",
  "where",
  "language",
  "equipment",
  "dataSharing",
  "media",
  "facilitators",
  "contact",
] as const;

const faq = messages.roblox.faq;

function renderFaq() {
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProgrammeFaq />
    </NextIntlClientProvider>,
  );
  return container;
}

/** One row per key, in render order — the answer body is the row's second child. */
function rows(container: HTMLElement) {
  return [...container.querySelectorAll("details")];
}

describe("the Roblox Programme FAQ", () => {
  it("renders every signed-off question, in the signed-off order", () => {
    const questions = rows(renderFaq()).map(
      (row) => row.querySelector("summary")?.textContent,
    );

    expect(questions).toEqual(
      SIGNED_OFF_ORDER.map((key) => faq.items[key].question),
    );
  });

  it("keeps the two answers that run to a second part", () => {
    const bodies = rows(renderFaq()).map((row) => row.textContent);
    const bodyFor = (key: (typeof SIGNED_OFF_ORDER)[number]) =>
      bodies[SIGNED_OFF_ORDER.indexOf(key)];

    // The equipment answer's second half is a full paragraph; the locations
    // answer's is a subordinate aside. Both are the caller's composition, so
    // both are what the move to the shared rows could have dropped.
    expect(bodyFor("equipment")).toContain(faq.items.equipment.answer2);
    expect(bodyFor("where")).toContain(faq.items.where.answer2);
  });

  it("keeps each document's name a link to that document", () => {
    const container = renderFaq();
    const hrefs = new Map(
      [...container.querySelectorAll("a")].map((link) => [
        link.getAttribute("href"),
        link.textContent,
      ]),
    );

    expect(hrefs.get(ROUTES.robloxPrivacy)).toBe("Privacy Policy");
    expect(hrefs.get(ROUTES.robloxSafeguarding)).toBe(
      "Child Safeguarding Policy",
    );
    expect(hrefs.get(`mailto:${SUPPORT_EMAIL}`)).toBe(SUPPORT_EMAIL);
  });
});
