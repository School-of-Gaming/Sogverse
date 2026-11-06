import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConsentAnswersCard } from "@/components/admin/analytics/analytics-view";
import type { ConsentAnswerSummary } from "@/services/admin-analytics/admin-analytics.build";

/**
 * **The cookie answers card's key.** Each row leads with the answer's share and
 * follows with its count; with nobody answering it gives no shares at all; and
 * while the read is in flight it keeps every label with its figures blank.
 *
 * Translations echo their key, so nothing here depends on wording.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// jsdom measures nothing, so the ring never draws and Recharts only warns about
// its zero-sized box; the key is what this suite is about.
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: () => null,
}));

vi.mock("@/providers", () => ({
  useTimezone: () => "Europe/Helsinki",
}));

function summary(counts: Record<"all" | "analytics_only" | "marketing_only" | "none", number>): ConsentAnswerSummary {
  const answered = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return {
    answered,
    answers: (["all", "analytics_only", "marketing_only", "none"] as const).map((answer) => ({
      answer,
      count: counts[answer],
      share: answered === 0 ? null : counts[answer] / answered,
    })),
    byPage: [],
  };
}

/** A key row's figures, in the order they are drawn. */
function figures(label: string): string[] {
  const row = screen.getByText(label).closest("li");
  if (!row) throw new Error(`no key row for ${label}`);
  return [...row.querySelectorAll("span.tabular-nums")].map((span) => span.textContent);
}

describe("ConsentAnswersCard", () => {
  it("leads each row with the share and follows with the count", () => {
    render(<ConsentAnswersCard summary={summary({ all: 150, analytics_only: 30, marketing_only: 20, none: 100 })} />);
    expect(figures("answers.all")).toEqual(["50%", "150"]);
    expect(figures("answers.none")).toEqual(["33%", "100"]);
  });

  it("gives no shares when nobody answered", () => {
    render(<ConsentAnswersCard summary={summary({ all: 0, analytics_only: 0, marketing_only: 0, none: 0 })} />);
    expect(figures("answers.all")).toEqual(["", "0"]);
    expect(document.body.textContent).not.toContain("NaN");
  });

  it("keeps every label with blank figures while the read is in flight", () => {
    render(<ConsentAnswersCard summary={null} />);
    for (const answer of ["all", "analytics_only", "marketing_only", "none"]) {
      expect(figures(`answers.${answer}`)).toEqual(["", ""]);
    }
  });
});
