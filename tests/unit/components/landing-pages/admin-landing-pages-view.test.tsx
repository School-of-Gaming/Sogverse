import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * **The landing pages list's data shell**: nothing until the read answers, the
 * empty state only for a read that answered no pages, and a failed read said
 * as a failure rather than read as an empty list.
 *
 * Translations echo their key.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

const mockRead = vi.fn();
vi.mock("@/services/landing-pages/landing-pages.queries", () => ({
  useAdminLandingPages: () => mockRead(),
}));

import { AdminLandingPagesView } from "@/components/admin/landing-pages/admin-landing-pages-view";

beforeEach(() => mockRead.mockReset());

describe("the landing pages list", () => {
  it("draws nothing while the read has not answered", () => {
    mockRead.mockReturnValue({ data: undefined, isError: false });
    const { container } = render(<AdminLandingPagesView />);
    expect(container.textContent).toBe("");
  });

  it("says the read failed rather than that there are no pages", () => {
    mockRead.mockReturnValue({ data: undefined, isError: true });
    render(<AdminLandingPagesView />);
    expect(screen.getByText("listLoadError")).toBeTruthy();
    expect(screen.queryByText("empty")).toBeNull();
  });

  it("says there are no pages when the read answered none", () => {
    mockRead.mockReturnValue({ data: [], isError: false });
    render(<AdminLandingPagesView />);
    expect(screen.getByText("empty")).toBeTruthy();
    expect(screen.queryByText("listLoadError")).toBeNull();
  });

  it("keeps the rows it had when a refetch fails", () => {
    mockRead.mockReturnValue({ data: [], isError: true });
    render(<AdminLandingPagesView />);
    expect(screen.getByText("empty")).toBeTruthy();
    expect(screen.queryByText("listLoadError")).toBeNull();
  });
});
