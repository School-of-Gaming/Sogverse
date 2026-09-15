import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * **The invoice-customer form, from what an admin types to what the RPC is
 * handed.**
 *
 * Three things are worth a render here, and none of them can be proved by
 * calling the contract directly:
 *
 * - **The refusal an admin actually reads.** The contract knows a field is
 *   empty; only the form knows which field that is in the reader's own words,
 *   and only a render proves that the sentence names the right one.
 * - **What leaves the form.** The values reaching the RPC are trimmed, the
 *   country is upper-cased and an emptied optional box has become `null` rather
 *   than travelling as `""` — which the table refuses outright. The transform
 *   lives in the shared contract; this is the test that the form is actually
 *   running it rather than posting its own draft.
 * - **A refusal off the wire.** A duplicate Fennoa number arrives as Postgres's
 *   own sentence about a constraint name, and the form's job is to recognise
 *   that one case and say something an admin can act on instead.
 *
 * **On jsdom and native validation:** jsdom implements the constraint-validation
 * API but performs no form submission of its own, so a `submit` dispatched at
 * the form reaches the handler whatever the browser would have done — which is
 * the same route the other form tests here take.
 *
 * Translations echo their key plus the values they were handed, so nothing here
 * depends on wording in `messages/`.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key} ${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(" ")}`
      : key,
}));

import { InvoiceCustomerForm } from "@/components/admin/invoice-customers/invoice-customer-form";
import {
  emptyInvoiceCustomerDraft,
  type InvoiceCustomerDraft,
} from "@/components/admin/invoice-customers/invoice-customer-draft";
import { INVOICE_CUSTOMER_DUPLICATE_REFUSAL } from "@/components/admin/invoice-customers/mock-invoice-customer-fixtures";

/** A draft with something in every box, deliberately untidy. */
function untidyDraft(): InvoiceCustomerDraft {
  return {
    fennoa_customer_no: "  F0303  ",
    invoice_name: "  Testikunnan kaupunki  ",
    street: " Testikatu 4 ",
    postal_code: " 33100 ",
    city: " Testilä ",
    country_code: "fi",
    your_reference: "   ",
    invoice_text: "",
  };
}

function renderForm(
  draft: InvoiceCustomerDraft,
  onSubmit: (input: unknown) => Promise<void>,
) {
  const utils = render(
    <InvoiceCustomerForm
      initialDraft={draft}
      submitLabel="submit"
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );
  return {
    ...utils,
    submit: () => fireEvent.submit(utils.container.querySelector("form")!),
  };
}

describe("the invoice customer form", () => {
  it("names the first empty required field rather than refusing in general", () => {
    const onSubmit = vi.fn();
    const { submit } = renderForm(emptyInvoiceCustomerDraft(), onSubmit);

    submit();

    // The Fennoa number is the first field the form asks for, so it is the
    // first one it sends the admin back to.
    expect(
      screen.getByText("errors.required field=fields.number"),
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("walks down the fields as each one is filled in", () => {
    const onSubmit = vi.fn();
    const draft = emptyInvoiceCustomerDraft();
    draft.fennoa_customer_no = "F0303";
    const { submit } = renderForm(draft, onSubmit);

    submit();

    expect(
      screen.getByText("errors.required field=fields.invoiceName"),
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("refuses a country that is filled in but not a two-letter code", () => {
    const onSubmit = vi.fn();
    const draft = untidyDraft();
    draft.country_code = "Finland";
    const { submit } = renderForm(draft, onSubmit);

    submit();

    // Not the required message: the box is not empty, and telling an admin to
    // fill in a field they have filled in is the wrong instruction.
    expect(screen.getByText("errors.countryShape")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("hands the RPC the normalised input, not the draft", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { submit } = renderForm(untidyDraft(), onSubmit);

    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      fennoa_customer_no: "F0303",
      invoice_name: "Testikunnan kaupunki",
      street: "Testikatu 4",
      postal_code: "33100",
      city: "Testilä",
      // Upper-cased rather than refused: an admin typing `fi` meant Finland.
      country_code: "FI",
      // Both optional boxes fold to the one state the column has for "absent" —
      // a reference of three spaces and an untouched box are not two answers.
      your_reference: null,
      invoice_text: null,
    });
  });

  it("re-words a duplicate Fennoa number instead of quoting Postgres", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(INVOICE_CUSTOMER_DUPLICATE_REFUSAL);
    const { submit } = renderForm(untidyDraft(), onSubmit);

    submit();

    await screen.findByText("errors.duplicateNumber number=F0303");
    // The constraint's own name never reaches the page.
    expect(
      screen.queryByText(/invoice_customers_fennoa_customer_no_key/),
    ).toBeNull();
  });

  it("quotes a check violation, which is written to be read", async () => {
    const onSubmit = vi.fn().mockRejectedValue({
      code: "23514",
      message:
        "A street, postal code and city are required — the Finvoice import refuses a file with no buyer address",
    });
    const { submit } = renderForm(untidyDraft(), onSubmit);

    submit();

    await screen.findByText(/errors\.saveFailedWithReason reason=A street/);
  });

  it("falls back to its own sentence for anything that is not a wire error", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const { submit } = renderForm(untidyDraft(), onSubmit);

    submit();

    await screen.findByText("errors.saveFailed");
  });

  it("keeps the submit button disabled once a save has landed", async () => {
    // The live page navigates on success and this component unmounts; a button
    // that re-enabled in that frame is the double-submit the flag exists for.
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { submit } = renderForm(untidyDraft(), onSubmit);

    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: /submit/ })
        .disabled,
    ).toBe(true);
  });

  it("re-enables the submit button when the save was refused", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(INVOICE_CUSTOMER_DUPLICATE_REFUSAL);
    const { submit } = renderForm(untidyDraft(), onSubmit);

    submit();

    await screen.findByText("errors.duplicateNumber number=F0303");
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: /submit/ })
        .disabled,
    ).toBe(false);
  });

  it("puts the affirmative last in the DOM, which is where both layouts want it", () => {
    renderForm(emptyInvoiceCustomerDraft(), vi.fn());

    const buttons = screen.getAllByRole("button");
    expect(buttons.at(-1)?.getAttribute("type")).toBe("submit");
  });

  it("seeds every box from the draft it is given", () => {
    renderForm(untidyDraft(), vi.fn());

    expect(
      screen.getByLabelText<HTMLInputElement>(/fields\.invoiceName/).value,
    ).toBe("  Testikunnan kaupunki  ");
    expect(
      screen.getByLabelText<HTMLTextAreaElement>(/fields\.invoiceText/).value,
    ).toBe("");
  });

  it("carries a typed value through to the input", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const draft = untidyDraft();
    draft.your_reference = "";
    const { submit } = renderForm(draft, onSubmit);

    fireEvent.change(screen.getByLabelText(/fields\.yourReference/), {
      target: { value: " PO 4471182 " },
    });
    submit();

    return waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ your_reference: "PO 4471182" }),
      );
    });
  });
});
