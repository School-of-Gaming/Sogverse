import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

/**
 * **The "Invoiced to" picker on the product form's fees section.**
 *
 * Two claims, and the seam between them is what no other test covers: piece
 * one's build tests pin what `invoiceCustomerId` becomes on the wire, and the
 * form tests pin what the fees section renders — this is the only place the
 * control, the form state and the builder are exercised as one thing, which is
 * where a picker wired to the wrong field would show up.
 *
 * - **The field exists for a municipality club and for nothing else.** The
 *   database refuses a customer on any other product type, so a picker on a camp
 *   would be asking a question with no answer it would accept — and mounting it
 *   would run the customer read on every product form in the app.
 * - **A pick reaches the wire as `invoice_customer_id`.** The select's own empty
 *   value is `""`, because a `select` has no null; the column's absent state is
 *   `NULL`, and the conversion happens once, at the control.
 *
 * Translations echo their key, so nothing here depends on wording in
 * `messages/`.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key} ${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(" ")}`
      : key,
}));

const mockUseInvoiceCustomers = vi.fn();
vi.mock("@/services/invoice-customers", () => ({
  useInvoiceCustomers: () => mockUseInvoiceCustomers(),
}));

import { FeesSection } from "@/components/admin/products/sections/fees-section";
import { buildCreateInput } from "@/components/admin/products/product-build";
import {
  initialState,
  type FormState,
} from "@/components/admin/products/product-form-state";
import { PRODUCT_TYPE_CONFIG } from "@/components/admin/products/product-type-config";
import { INVOICE_CUSTOMER_FIXTURES } from "@/components/admin/invoice-customers/mock-invoice-customer-fixtures";
import type { ProductType } from "@/types";

const CUSTOMERS = { data: INVOICE_CUSTOMER_FIXTURES, isPending: false };

/**
 * The section over real form state, with the latest state readable afterwards.
 *
 * The section takes `setState`, so driving it through a real `useState` is what
 * makes this a round trip rather than a spy assertion: what the builder is
 * handed at the end is the state the control actually produced.
 */
function renderFees(productType: ProductType) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  // The two answers `buildCreateInput` refuses to run without. Neither is on
  // this section — they belong to sections above it — so they are seeded rather
  // than typed, and the round trip below is about the one field that is here.
  const seeded = initialState(config, "en");
  seeded.topic = "minecraft_java";
  seeded.spokenLanguageCode = "en";
  let latest: FormState = seeded;

  function Harness() {
    const [state, setState] = useState<FormState>(latest);
    latest = state;
    return <FeesSection state={state} setState={setState} config={config} />;
  }

  render(<Harness />);
  return { config, current: () => latest };
}

describe("the invoice customer picker on the fees section", () => {
  it("is offered on a municipality club", () => {
    mockUseInvoiceCustomers.mockReturnValue(CUSTOMERS);
    renderFees("municipality_club");

    const select = screen.getByLabelText<HTMLSelectElement>(/picker\.label/);
    // The empty option plus one per customer, and the empty one comes first:
    // "nobody has said yet" is the resting answer, not a value to scroll past.
    const options = Array.from(select.options);
    expect(options).toHaveLength(INVOICE_CUSTOMER_FIXTURES.length + 1);
    expect(options[0].value).toBe("");
    expect(options[1].textContent).toBe(
      `picker.option name=${INVOICE_CUSTOMER_FIXTURES[0].invoice_name} number=${INVOICE_CUSTOMER_FIXTURES[0].fennoa_customer_no}`,
    );
  });

  it("points at the list a customer is created on", () => {
    mockUseInvoiceCustomers.mockReturnValue(CUSTOMERS);
    renderFees("municipality_club");

    expect(
      screen.getByRole("link", { name: /picker\.manage/ }).getAttribute("href"),
    ).toBe("/admin/invoice-customers");
  });

  it("is absent from every other product type", () => {
    mockUseInvoiceCustomers.mockClear();
    for (const productType of [
      "consumer_club",
      "camp",
      "event",
    ] as const satisfies readonly ProductType[]) {
      mockUseInvoiceCustomers.mockReturnValue(CUSTOMERS);
      const { unmount } = render(
        <FeesSection
          state={initialState(PRODUCT_TYPE_CONFIG[productType], "en")}
          setState={() => {}}
          config={PRODUCT_TYPE_CONFIG[productType]}
        />,
      );
      expect(screen.queryByLabelText(/picker\.label/)).toBeNull();
      // Mounting the picker would also run the customer read; not mounting it
      // is what keeps that read off every other product form in the app.
      unmount();
    }
    expect(mockUseInvoiceCustomers).not.toHaveBeenCalled();
  });

  it("carries a pick through form state onto the wire", () => {
    mockUseInvoiceCustomers.mockReturnValue(CUSTOMERS);
    const { config, current } = renderFees("municipality_club");
    const chosen = INVOICE_CUSTOMER_FIXTURES[3];

    fireEvent.change(screen.getByLabelText(/picker\.label/), {
      target: { value: chosen.id },
    });

    expect(current().invoiceCustomerId).toBe(chosen.id);
    expect(
      buildCreateInput(current(), "municipality_club", config)
        .invoice_customer_id,
    ).toBe(chosen.id);
  });

  it("turns the control's empty value back into the column's null", () => {
    mockUseInvoiceCustomers.mockReturnValue(CUSTOMERS);
    const { config, current } = renderFees("municipality_club");
    const select = screen.getByLabelText(/picker\.label/);

    fireEvent.change(select, {
      target: { value: INVOICE_CUSTOMER_FIXTURES[1].id },
    });
    fireEvent.change(select, { target: { value: "" } });

    expect(current().invoiceCustomerId).toBeNull();
    const input = buildCreateInput(current(), "municipality_club", config);
    // Present and null, never omitted: the RPC parameter defaults to NULL, so an
    // omission would leave whatever was linked before in place.
    expect(input).toHaveProperty("invoice_customer_id");
    expect(input.invoice_customer_id).toBeNull();
  });

  it("is empty and inert until the customers land", () => {
    mockUseInvoiceCustomers.mockReturnValue({ data: undefined, isPending: true });
    renderFees("municipality_club");

    const select = screen.getByLabelText<HTMLSelectElement>(/picker\.label/);
    // Not even the "not set" option: it is the one a browser falls back to when
    // nothing matches, so a club that HAS a customer would spend the first
    // frames claiming it has none.
    expect(select.options).toHaveLength(0);
    expect(select.disabled).toBe(true);
  });
});
