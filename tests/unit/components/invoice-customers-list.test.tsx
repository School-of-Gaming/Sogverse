import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

/**
 * **The invoice-customer list as an admin meets it.**
 *
 * The table is handed its rows, so what is worth pinning is what it does with
 * them: a row per customer carrying the three facts that tell two apart, a link
 * on the name that goes to that customer's own page, and an empty state that
 * appears only once the read has actually answered — "there are none" and "we do
 * not know yet" are different pages, and printing the first while the second is
 * true tells an admin their customers are gone.
 *
 * Translations echo their key, so nothing here depends on wording in
 * `messages/`.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { AdminInvoiceCustomersPage } from "@/components/admin/invoice-customers/admin-invoice-customers-page";
import { INVOICE_CUSTOMERS } from "../../mocks/invoice-customers";

describe("the invoice customers list", () => {
  it("renders one row per customer, with its number, name and city", () => {
    render(
      <AdminInvoiceCustomersPage
        customers={INVOICE_CUSTOMERS}
        settled
      />,
    );

    const rows = screen.getAllByRole("row").slice(1); // minus the header row
    expect(rows).toHaveLength(INVOICE_CUSTOMERS.length);

    for (const [index, customer] of INVOICE_CUSTOMERS.entries()) {
      const row = within(rows[index]);
      expect(row.getByText(customer.fennoa_customer_no)).toBeTruthy();
      expect(row.getByText(customer.city)).toBeTruthy();
      expect(
        row
          .getByRole("link", { name: customer.invoice_name })
          .getAttribute("href"),
      ).toBe(`/admin/invoice-customers/${customer.id}`);
    }
  });

  it("says in words, not only with a tick, whether a row carries a reference", () => {
    render(
      <AdminInvoiceCustomersPage
        customers={INVOICE_CUSTOMERS}
        settled
      />,
    );

    const withReference = INVOICE_CUSTOMERS.filter(
      (customer) => customer.your_reference !== null,
    ).length;
    expect(screen.getAllByText("hasReference")).toHaveLength(withReference);
    expect(screen.getAllByText("noReference")).toHaveLength(
      INVOICE_CUSTOMERS.length - withReference,
    );
  });

  it("offers the create form from the list", () => {
    render(<AdminInvoiceCustomersPage customers={[]} settled />);

    expect(
      screen.getByRole("link", { name: /addCustomer/ }).getAttribute("href"),
    ).toBe("/admin/invoice-customers/new");
  });

  it("shows the empty state only once the read has answered", () => {
    const { rerender } = render(
      <AdminInvoiceCustomersPage customers={[]} settled={false} />,
    );
    expect(screen.queryByText("empty")).toBeNull();

    rerender(<AdminInvoiceCustomersPage customers={[]} settled />);
    expect(screen.getByText("empty")).toBeTruthy();
  });

  it("keeps the empty state off a populated table", () => {
    render(
      <AdminInvoiceCustomersPage
        customers={INVOICE_CUSTOMERS}
        settled
      />,
    );
    expect(screen.queryByText("empty")).toBeNull();
  });
});
