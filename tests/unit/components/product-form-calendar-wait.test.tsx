import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * **A club's product form waits for the holiday calendar list.**
 *
 * The calendar picker sits at the end of the schedule section, and its row
 * count is unknown until the list read answers. Drawn on a form that had
 * already painted, the rows would push every section below them down on the
 * data's schedule. So the create and edit pages hold their loading state until
 * the list has landed, for the two club types only, and a failed read ends the
 * wait the way a landed one does — the picker then reports the failure itself.
 *
 * The form is a stub: what is under test is when the page mounts it, and the
 * picker can only paint inside a mounted form.
 */
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

const mockUseHolidayCalendars = vi.fn();
vi.mock("@/services/holiday-calendars", () => ({
  useHolidayCalendars: (options?: { enabled?: boolean }) =>
    mockUseHolidayCalendars(options),
}));

const mockUseProductAdmin = vi.fn();
vi.mock("@/services/products", () => ({
  useProductAdmin: (id?: string) => mockUseProductAdmin(id),
}));

vi.mock("@/components/admin/products/product-form-create", () => ({
  ProductFormCreate: () => <div data-testid="product-form" />,
}));
vi.mock("@/components/admin/products/product-form-edit", () => ({
  ProductFormEdit: () => <div data-testid="product-form" />,
}));
vi.mock("@/components/admin/products/product-build", () => ({
  cloneFormState: () => ({}),
}));

import { EditProductPage } from "@/components/admin/products/edit-product-page";
import { NewProductPage } from "@/components/admin/products/new-product-page";

const PRODUCT_ID = "5f0c2a1e-8b3d-4e7f-9a6c-1d2e3f4a5b6c";
const PRODUCT = { id: PRODUCT_ID, product_translations: [] };

/** The list read's states, as React Query reports them. */
const LIST_PENDING = { isPending: true, isError: false, data: undefined };
const LIST_LANDED = { isPending: false, isError: false, data: [] };
const LIST_FAILED = { isPending: false, isError: true, data: undefined };

const formShown = () => screen.queryByTestId("product-form") !== null;

beforeEach(() => {
  mockUseHolidayCalendars.mockReset();
  mockUseProductAdmin.mockReset();
  // Pending by default — and a disabled query stays pending for ever, which
  // is why a camp or an event must not wait on it.
  mockUseHolidayCalendars.mockReturnValue(LIST_PENDING);
});

describe("the create page", () => {
  beforeEach(() => {
    mockUseProductAdmin.mockReturnValue({ data: undefined, isLoading: false });
  });

  it("holds a club's form back until the calendar list lands", () => {
    const { rerender } = render(<NewProductPage productType="consumer_club" />);
    expect(formShown()).toBe(false);

    mockUseHolidayCalendars.mockReturnValue(LIST_LANDED);
    rerender(<NewProductPage productType="consumer_club" />);
    expect(formShown()).toBe(true);
  });

  it("ends the wait when the list read fails", () => {
    mockUseHolidayCalendars.mockReturnValue(LIST_FAILED);
    render(<NewProductPage productType="municipality_club" />);
    expect(formShown()).toBe(true);
  });

  it("never waits, or reads the list, for a camp or an event", () => {
    render(<NewProductPage productType="camp" />);
    expect(formShown()).toBe(true);
    expect(mockUseHolidayCalendars).toHaveBeenCalledWith({ enabled: false });
  });

  it("holds a club clone back until both the source and the list land", () => {
    mockUseProductAdmin.mockReturnValue({ data: PRODUCT, isLoading: false });
    const { rerender } = render(
      <NewProductPage productType="consumer_club" cloneFrom={PRODUCT_ID} />,
    );
    expect(formShown()).toBe(false);

    mockUseHolidayCalendars.mockReturnValue(LIST_LANDED);
    rerender(
      <NewProductPage productType="consumer_club" cloneFrom={PRODUCT_ID} />,
    );
    expect(formShown()).toBe(true);
  });
});

describe("the edit page", () => {
  it("holds a club's form back until the calendar list lands", () => {
    mockUseProductAdmin.mockReturnValue({ data: PRODUCT, isLoading: false });
    const { rerender } = render(
      <EditProductPage productType="consumer_club" productId={PRODUCT_ID} />,
    );
    expect(formShown()).toBe(false);

    mockUseHolidayCalendars.mockReturnValue(LIST_LANDED);
    rerender(
      <EditProductPage productType="consumer_club" productId={PRODUCT_ID} />,
    );
    expect(formShown()).toBe(true);
  });

  it("never waits for an event", () => {
    mockUseProductAdmin.mockReturnValue({ data: PRODUCT, isLoading: false });
    render(<EditProductPage productType="event" productId={PRODUCT_ID} />);
    expect(formShown()).toBe(true);
  });
});
