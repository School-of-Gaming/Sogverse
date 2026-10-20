import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AdminTestimonialsPage } from "@/components/admin/testimonials/admin-testimonials-page";
import { TestimonialUsageCard } from "@/components/admin/testimonials/edit-testimonial-page";
import { TestimonialEditor } from "@/components/admin/testimonials/testimonial-editor";
import type { AdminTestimonial } from "@/services/testimonials/testimonials.contracts";

/**
 * **The admin testimonial pages' rules.** The list's: no testimonial can be
 * deleted. The editor's: a quote typed in quotation marks is called out on the
 * field and held back at Save, with nothing sent.
 *
 * Translations echo their key, so nothing here depends on wording.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key} ${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(" ")}`
      : key,
  useLocale: () => "en",
}));

vi.mock("@/providers", () => ({
  useTimezone: () => "Europe/Helsinki",
}));

vi.mock("@/hooks/use-language-names", () => ({
  useLanguageNames: () => (_locale: string, fallback: string) => fallback,
}));

const PARENT: AdminTestimonial = {
  id: "0e6b9a52-31d4-4c7e-8f20-6a5d4c3b2a19",
  versions: [{ locale: "en", from: "Mum, Finland", quote: "Gaming is fun and supervised." }],
  usages: [],
  createdAt: "2026-10-16T09:00:00Z",
  created: { by: null, via: null },
  updatedAt: "2026-10-16T10:00:00Z",
  lastSaved: { by: null, via: null },
};

const GEDU: AdminTestimonial = {
  ...PARENT,
  id: "7c2d1e0f-9a8b-4c6d-8e5f-4a3b2c1d0e9f",
  versions: [{ locale: "en", from: "Gedu Pixel", quote: "I love these sessions." }],
};

describe("the testimonials list", () => {
  it("offers no way to delete a testimonial", () => {
    render(<AdminTestimonialsPage testimonials={[PARENT, GEDU]} status="success" />);
    expect(screen.getByText("Gedu Pixel")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("the testimonial editor", () => {
  it("calls out a quote in quotation marks and sends nothing", () => {
    const save = vi.fn();
    render(<TestimonialEditor testimonial={null} save={save} />);

    fireEvent.change(screen.getByLabelText("fields.quote"), {
      target: { value: "“Gaming is fun.”" },
    });
    fireEvent.change(screen.getByLabelText("fields.from"), {
      target: { value: "Mum, Finland" },
    });
    expect(screen.getByText("quoteHasMarks")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "newPage.submit" }));

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("errors.quoted");
  });

  it("saves a version whose quote carries no marks", () => {
    const save = vi.fn(async () => {});
    render(<TestimonialEditor testimonial={null} save={save} />);

    fireEvent.change(screen.getByLabelText("fields.quote"), {
      target: { value: "Gaming is fun." },
    });
    fireEvent.change(screen.getByLabelText("fields.from"), {
      target: { value: "Mum, Finland" },
    });
    fireEvent.click(screen.getByRole("button", { name: "newPage.submit" }));

    expect(save).toHaveBeenCalledWith({
      versions: [{ locale: "en", from: "Mum, Finland", quote: "Gaming is fun." }],
    });
  });
});

describe("where a testimonial is used", () => {
  const PAGE = "746388a7-2edd-456b-b7d1-4e9828f85af9";
  const OTHER = "9d1f06bf-9895-4f04-9ec5-3d86382afb8e";
  const DRAFT = "94f2a395-3c9f-49f6-8770-f9f4c28bfd91";
  const titles = [{ locale: "en" as const, title: "Gaming clubs in Espoo" }];

  it("lists each landing page with its status page and copies", () => {
    render(
      <TestimonialUsageCard
        usages={[
          { pageId: PAGE, titles, inLiveCopy: true, inWorkingCopy: true },
          { pageId: OTHER, titles, inLiveCopy: true, inWorkingCopy: false },
          { pageId: DRAFT, titles, inLiveCopy: false, inWorkingCopy: true },
        ]}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "usage.landingPage title=Gaming clubs in Espoousage.landingPageState.both",
      "usage.landingPage title=Gaming clubs in Espoousage.landingPageState.liveOnly",
      "usage.landingPage title=Gaming clubs in Espoousage.landingPageState.workingOnly",
    ]);
    expect(within(items[0]).getByRole("link").getAttribute("href")).toContain(
      `/admin/landing-pages/${PAGE}`,
    );
  });

  it("says a testimonial shown nowhere is not shown anywhere yet", () => {
    render(<TestimonialUsageCard usages={[]} />);
    expect(screen.getByText("usage.none")).toBeTruthy();
    expect(screen.queryByText("usage.editNote")).toBeNull();
  });

  it("marks a listed testimonial with how many landing pages place it", () => {
    render(
      <AdminTestimonialsPage
        testimonials={[
          {
            ...PARENT,
            usages: [
              { pageId: PAGE, titles, inLiveCopy: true, inWorkingCopy: true },
              { pageId: OTHER, titles, inLiveCopy: false, inWorkingCopy: true },
            ],
          },
          GEDU,
        ]}
        status="success"
      />,
    );
    expect(screen.getByText("onLandingPages count=2")).toBeTruthy();
    expect(screen.queryAllByText(/onLandingPages/)).toHaveLength(1);
  });
});
